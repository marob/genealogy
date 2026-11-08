import { createReadStream } from 'node:fs';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ContributionDto,
  ContributionFieldsDto,
  ContributionKind,
  ContributionStatus,
  NewContributionDto,
  PersonDto,
  PersonFieldsDto,
  Relation,
  Sex,
  UnionFieldsDto,
} from '@genealogie/shared';
import { ConfigService } from '@nestjs/config';
import yazl from 'yazl';
import type { AuthUser } from '../auth/auth-user.js';
import type { Env } from '../config/env.js';
import { normalizeForSearch } from '../common/normalize.js';
import { mediaKey, mimeTypeOf } from '../gedcom/media.js';
import type { Contribution, User } from '../generated/prisma/client.js';
import { MediaStore } from '../media/media-store.service.js';
import { PersonsService } from '../persons/persons.service.js';
import { linkingFamily, loadFamily, type OverlayFamily, ProposalOverlay } from '../persons/proposal-overlay.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PLACE_FORM_KEY, SettingsService } from '../settings/settings.service.js';
import { type GedEvent, type GedFamily, type GedPerson, writeGedcom } from './gedcom-writer.js';
import { toGedcomDate } from './user-date.js';

const BIRTH_TYPES = ['BIRT', 'CHR', 'BAPM'];
const DEATH_TYPES = ['DEAT', 'BURI', 'CREM'];
const DATE_FIELDS = ['birthDate', 'deathDate', 'marriageDate'] as const;
/** Labels of the fields in the notes of the export (read in the genealogy software). */
const FIELD_LABELS: Record<keyof ContributionFieldsDto, string> = {
  givenNames: 'Prénoms',
  surname: 'Nom',
  sex: 'Sexe',
  occupation: 'Profession',
  birthDate: 'Date de naissance',
  birthPlace: 'Lieu de naissance',
  deathDate: 'Date de décès',
  deathPlace: 'Lieu de décès',
  marriageDate: 'Date de mariage',
  marriagePlace: 'Lieu de mariage',
};
const RELATION_LABELS: Record<Relation, string> = { child: 'enfant', parent: 'parent', spouse: 'conjoint' };

type ContributionWithAuthor = Contribution & { author: User | null };

/** First event of the given types (in order of preference) with a date or a place. */
function eventOf(person: PersonDto, types: string[]) {
  for (const type of types) {
    const event = person.events.find((e) => e.type === type && (e.date !== undefined || e.place !== undefined));
    if (event) {
      return event;
    }
  }
  return undefined;
}

/** Current values of the editable fields of a person, as shown to members. */
function currentFields(person: PersonDto): Required<PersonFieldsDto> {
  const birth = eventOf(person, BIRTH_TYPES);
  const death = eventOf(person, DEATH_TYPES);
  return {
    givenNames: person.givenNames,
    surname: person.surname,
    sex: person.sex,
    occupation: person.occupation ?? '',
    birthDate: birth?.date?.original ?? '',
    birthPlace: birth?.place?.name ?? '',
    deathDate: death?.date?.original ?? '',
    deathPlace: death?.place?.name ?? '',
  };
}

/** Trimmed text, or null when empty. */
function nonEmpty(text: string | undefined): string | null {
  const trimmed = text?.trim() ?? '';
  return trimmed.length ? trimmed : null;
}

/** Proposed value as written in the GEDCOM file (dates converted). */
function asGedcom(key: keyof ContributionFieldsDto, value: string | undefined): string | undefined {
  return value !== undefined && (DATE_FIELDS as readonly string[]).includes(key)
    ? (toGedcomDate(value) ?? value)
    : value;
}

/** Trimmed fields that differ from the current values. */
function changedFields<T extends object>(fields: T, current: Required<T>): T {
  return Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value] as const)
      .filter(([key, value]) => value !== undefined && value !== current[key as keyof T]),
  ) as T;
}

/** Filled-in fields, trimmed. */
function trimmed(fields: PersonFieldsDto): PersonFieldsDto {
  return Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value] as const)
      .filter(([, value]) => !!value),
  );
}

/** Notes of the export describing changed fields ("Date de décès : 27 DEC 1946 → 28 DEC 1946"). */
function changesNote(fields: ContributionFieldsDto, previous: ContributionFieldsDto): string {
  return (Object.keys(fields) as (keyof ContributionFieldsDto)[])
    .map((key) => `${FIELD_LABELS[key]} : ${shown(previous[key])} → ${shown(asGedcom(key, fields[key]))}`)
    .join('\n');
}

/** Value of a field in the notes of the export. */
function shown(value: string | undefined): string {
  return value?.length ? value : '(vide)';
}

/** Name columns of the person a contribution starts from. */
function personNames(person: { givenNames: string; surname: string }) {
  return { personGivenNames: person.givenNames, personSurname: person.surname };
}

function frenchDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
}

/** Rejects dates that cannot be converted to GEDCOM. */
function checkDates(fields: ContributionFieldsDto): void {
  for (const key of DATE_FIELDS) {
    const value = fields[key];
    if (value !== undefined && toGedcomDate(value) === undefined) {
      throw new BadRequestException(`Date not understood: "${value}".`);
    }
  }
}

function sameText(a: string | undefined, b: string | undefined): boolean {
  return normalizeForSearch(a ?? '') === normalizeForSearch(b ?? '');
}

/** True if a proposed place is found in a place label ("Lyon" in "Lyon, 69123, Rhône…"). */
function samePlace(proposed: string | undefined, actual: string | undefined): boolean {
  const [a, b] = [normalizeForSearch(proposed ?? ''), normalizeForSearch(actual ?? '')];
  return a === b || (!!a && b.includes(a));
}

function sameDate(proposed: string | undefined, actual: string | undefined): boolean {
  const normalize = (text: string | undefined) => (text ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  return normalize(toGedcomDate(proposed ?? '')) === normalize(actual);
}

@Injectable()
export class ContributionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly persons: PersonsService,
    private readonly store: MediaStore,
    private readonly settings: SettingsService,
    config: ConfigService<Env, true>,
  ) {
    this.timeZone = config.get('APP_TIMEZONE', { infer: true });
  }

  private readonly timeZone: string;

  /** Other partner of the union of new children and union edits, by contribution id. */
  private async partners(contributions: Contribution[]): Promise<Map<number, { givenNames: string; surname: string }>> {
    const familyIds = contributions.flatMap((c) => (c.familyId ? [c.familyId] : []));
    const families = await this.prisma.family.findMany({
      where: { id: { in: familyIds } },
      include: { partner1: true, partner2: true },
    });
    // Members of the proposed unions: the persons proposed with them, and their anchor.
    const origins = familyIds.flatMap((id) => {
      const origin = /^WF(\d+)$/.exec(id)?.[1];
      return origin ? [Number(origin)] : [];
    });
    const proposed = origins.length
      ? await this.prisma.contribution.findMany({
          where: {
            OR: [{ id: { in: origins } }, { familyId: { in: origins.map((id) => `WF${id}`) }, relation: 'parent' }],
          },
        })
      : [];
    const membersOf = (familyId: string): { id: string; givenNames: string; surname: string }[] => {
      const family = families.find((f) => f.id === familyId);
      if (family) {
        return [family.partner1, family.partner2].filter((p) => p !== null);
      }
      const origin = proposed.find((c) => `WF${c.id}` === familyId);
      if (!origin) {
        return [];
      }
      const proposedPerson = (c: Contribution) => {
        const fields = JSON.parse(c.fields) as PersonFieldsDto;
        return { id: `W${c.id}`, givenNames: fields.givenNames ?? '', surname: fields.surname ?? '' };
      };
      const anchor = { id: origin.personId, givenNames: origin.personGivenNames, surname: origin.personSurname };
      return origin.relation === 'spouse'
        ? [anchor, proposedPerson(origin)]
        : origin.relation === 'child'
          ? [anchor]
          : [proposedPerson(origin), ...proposed.filter((c) => c.familyId === familyId).map(proposedPerson)];
    };
    const result = new Map<number, { givenNames: string; surname: string }>();
    for (const contribution of contributions) {
      const partner = contribution.familyId
        ? membersOf(contribution.familyId).find((p) => p.id !== contribution.personId)
        : undefined;
      if (partner) {
        result.set(contribution.id, { givenNames: partner.givenNames, surname: partner.surname });
      }
    }
    return result;
  }

  private async toDtos(contributions: ContributionWithAuthor[]): Promise<ContributionDto[]> {
    const partners = await this.partners(contributions);
    return contributions.map((c) => {
      const partner = partners.get(c.id);
      return { ...this.toDto(c), ...(partner ? { partner } : {}) };
    });
  }

  private toDto(contribution: ContributionWithAuthor): ContributionDto {
    const c = contribution;
    return {
      id: c.id,
      kind: c.kind as ContributionKind,
      status: c.status as ContributionStatus,
      personId: c.personId,
      person: { givenNames: c.personGivenNames, surname: c.personSurname },
      ...(c.relation ? { relation: c.relation as Relation } : {}),
      ...(c.familyId ? { familyId: c.familyId } : {}),
      fields: JSON.parse(c.fields) as ContributionFieldsDto,
      ...(c.previous ? { previous: JSON.parse(c.previous) as ContributionFieldsDto } : {}),
      ...(c.comment ? { comment: c.comment } : {}),
      ...(c.fileName
        ? {
            media: {
              fileName: c.fileName,
              mimeType: mimeTypeOf(c.fileName),
              ...(c.title ? { title: c.title } : {}),
              available: c.hash !== null,
            },
          }
        : {}),
      ...(c.author ? { author: { id: c.author.id, name: c.author.displayName ?? c.author.email } } : {}),
      createdAt: c.createdAt.toISOString(),
      ...(c.reviewedAt ? { reviewedAt: c.reviewedAt.toISOString() } : {}),
      ...(c.exportedAt ? { exportedAt: c.exportedAt.toISOString() } : {}),
      ...(c.integratedAt ? { integratedAt: c.integratedAt.toISOString() } : {}),
    };
  }

  /** The person, if its details are visible to the user (contributions need them). */
  private async visiblePerson(personId: string, user: AuthUser): Promise<PersonDto> {
    const [person] = await this.persons.findWithRelatives(personId, [], user);
    if (person!.restricted) {
      throw new ForbiddenException("This person's details are not visible to you.");
    }
    return person!;
  }

  /** Creates the contributions of a proposal (several for parents, or a new relative with a union). */
  async create(user: AuthUser, dto: NewContributionDto): Promise<ContributionDto[]> {
    return this.toDtos(await this.createAll(user, dto));
  }

  private async createAll(user: AuthUser, dto: NewContributionDto): Promise<ContributionWithAuthor[]> {
    const person = await this.visiblePerson(dto.personId, user);
    const comment = nonEmpty(dto.comment);
    switch (dto.kind) {
      case 'edit':
        return [await this.createEdit(user, person, dto.fields, comment)];
      case 'edit-union': {
        const edit = await this.createUnionEdit(user, person, dto.familyId, dto.fields, comment, true);
        return edit ? [edit] : [];
      }
      case 'add-person': {
        checkDates(dto.union ?? {});
        const relative = await this.createRelative(user, person, dto.relation, dto.fields, dto.familyId, comment);
        const union =
          dto.relation === 'spouse' && dto.union
            ? await this.withUnion(user, person.id, dto.familyId ?? `WF${relative.id}`, dto.union)
            : [];
        return [relative, ...union];
      }
      case 'add-parents':
        return this.createParents(user, person, dto, comment);
    }
  }

  private async createEdit(
    user: AuthUser,
    person: PersonDto,
    fields: PersonFieldsDto,
    comment: string | null,
  ): Promise<ContributionWithAuthor> {
    checkDates(fields);
    const current = currentFields(person);
    const changed = changedFields(fields, current);
    const keys = Object.keys(changed) as (keyof PersonFieldsDto)[];
    if (keys.length === 0) {
      throw new BadRequestException('Nothing to change.');
    }
    const previous = Object.fromEntries(keys.map((key) => [key, current[key]]));
    return await this.prisma.contribution.create({
      data: {
        kind: 'edit',
        personId: person.id,
        ...personNames(person),
        comment,
        authorId: user.id,
        fields: JSON.stringify(changed),
        previous: JSON.stringify(previous),
      },
      include: { author: true },
    });
  }

  /** Proposed details of a union of the person (genealogy or proposed); only changes are kept. */
  private async createUnionEdit(
    user: AuthUser,
    person: PersonDto,
    familyId: string,
    fields: UnionFieldsDto,
    comment: string | null,
    changesRequired: boolean,
  ): Promise<ContributionWithAuthor | undefined> {
    checkDates(fields);
    const union = person.unions.find((u) => u.familyId === familyId);
    if (!union) {
      throw new BadRequestException('This union does not belong to the person.');
    }
    if (union.restricted) {
      throw new ForbiddenException("This union's details are not visible to you.");
    }
    const marriage = union.events.find((e) => e.type === 'MARR');
    const current: Required<UnionFieldsDto> = {
      marriageDate: marriage?.date?.original ?? '',
      marriagePlace: marriage?.place?.name ?? '',
    };
    const changed = changedFields(fields, current);
    const keys = Object.keys(changed) as (keyof UnionFieldsDto)[];
    if (keys.length === 0) {
      if (changesRequired) {
        throw new BadRequestException('Nothing to change.');
      }
      return undefined;
    }
    return await this.prisma.contribution.create({
      data: {
        kind: 'edit-union',
        personId: person.id,
        ...personNames(person),
        familyId,
        comment,
        authorId: user.id,
        fields: JSON.stringify(changed),
        previous: JSON.stringify(Object.fromEntries(keys.map((key) => [key, current[key]]))),
      },
      include: { author: true },
    });
  }

  /** Details of a union just proposed with a new relative (none if empty). */
  private async withUnion(
    user: AuthUser,
    partnerId: string,
    familyId: string,
    fields: UnionFieldsDto,
  ): Promise<ContributionWithAuthor[]> {
    // Read again: the union now exists for the author.
    const partner = await this.visiblePerson(partnerId, user);
    const created = await this.createUnionEdit(user, partner, familyId, fields, null, false);
    return created ? [created] : [];
  }

  private async createRelative(
    user: AuthUser,
    person: PersonDto,
    relation: Relation,
    fields: PersonFieldsDto,
    familyId: string | undefined,
    comment: string | null,
  ): Promise<ContributionWithAuthor> {
    checkDates(fields);
    if (!fields.givenNames?.trim() && !fields.surname?.trim()) {
      throw new BadRequestException('The given names or the surname of the new person are required.');
    }
    const union = familyId ? person.unions.find((u) => u.familyId === familyId) : undefined;
    if (relation !== 'parent' && familyId && !union) {
      throw new BadRequestException('This union does not belong to the person.');
    }
    if (relation === 'spouse' && union?.partnerId) {
      throw new BadRequestException('This union already has two partners.');
    }
    if (relation === 'parent' && familyId && (await this.parentsFamily(user, person.id))?.id !== familyId) {
      throw new BadRequestException("This family is not the person's parents' family.");
    }
    return await this.prisma.contribution.create({
      data: {
        kind: 'add-person',
        personId: person.id,
        ...personNames(person),
        comment,
        authorId: user.id,
        relation,
        familyId: familyId ?? null,
        fields: JSON.stringify(trimmed(fields)),
      },
      include: { author: true },
    });
  }

  /** Parents' family of a person, as the user sees it (genealogy or proposed). */
  private async parentsFamily(user: AuthUser, personId: string): Promise<OverlayFamily | undefined> {
    const overlay = await ProposalOverlay.of(this.prisma, user.id);
    const proposed = overlay.parentsFamily(personId);
    if (proposed || personId.startsWith('W')) {
      return proposed;
    }
    const link = await this.prisma.familyChild.findFirst({
      where: { childId: personId },
      orderBy: { position: 'asc' },
    });
    return link ? loadFamily(this.prisma, link.familyId) : undefined;
  }

  /** Missing parents of a person, in the same family, with the details of their union. */
  private async createParents(
    user: AuthUser,
    person: PersonDto,
    dto: Extract<NewContributionDto, { kind: 'add-parents' }>,
    comment: string | null,
  ): Promise<ContributionWithAuthor[]> {
    const parents = (
      [
        [dto.father, 'M'],
        [dto.mother, 'F'],
      ] as const
    ).flatMap(([fields, sex]) => (fields ? [{ ...fields, sex }] : []));
    if (parents.length === 0) {
      throw new BadRequestException('No parent to add.');
    }
    for (const fields of parents) {
      checkDates(fields);
    }
    checkDates(dto.union ?? {});
    const family = await this.parentsFamily(user, person.id);
    if ((dto.father && family?.partner1Id) || (dto.mother && family?.partner2Id)) {
      throw new ConflictException('This parent is already known.');
    }
    const created: ContributionWithAuthor[] = [];
    let familyId = family?.id;
    for (const fields of parents) {
      const parent = await this.createRelative(user, person, 'parent', fields, familyId, comment);
      created.push(parent);
      familyId ??= `WF${parent.id}`;
    }
    const union = dto.union ? await this.withUnion(user, `W${created[0]!.id}`, familyId!, dto.union) : [];
    return [...created, ...union];
  }

  /** A document proposed for a person (the uploaded temporary file is stored). */
  async createMedia(
    user: AuthUser,
    upload: { personId: string; path: string; fileName: string; title?: string; comment?: string },
  ): Promise<ContributionDto> {
    const person = await this.visiblePerson(upload.personId, user);
    const mimeType = mimeTypeOf(upload.fileName);
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      throw new BadRequestException('Only images and PDF files can be proposed.');
    }
    const { hash, size } = await this.store.write(createReadStream(upload.path));
    await this.prisma.mediaFile.upsert({ where: { hash }, create: { hash, size, mimeType }, update: {} });
    return this.toDto(
      await this.prisma.contribution.create({
        data: {
          kind: 'add-media',
          personId: person.id,
          ...personNames(person),
          fileName: upload.fileName,
          title: nonEmpty(upload.title),
          comment: nonEmpty(upload.comment),
          hash,
          authorId: user.id,
        },
        include: { author: true },
      }),
    );
  }

  async mine(user: AuthUser): Promise<ContributionDto[]> {
    const list = await this.prisma.contribution.findMany({
      where: { authorId: user.id },
      include: { author: true },
      orderBy: { id: 'desc' },
    });
    return this.toDtos(list);
  }

  async list(status?: ContributionStatus): Promise<ContributionDto[]> {
    const list = await this.prisma.contribution.findMany({
      where: status ? { status } : {},
      include: { author: true },
      orderBy: { id: 'desc' },
    });
    return this.toDtos(list);
  }

  async review(
    admin: AuthUser,
    id: number,
    change: { status: 'approved' | 'rejected'; fields?: ContributionFieldsDto },
  ): Promise<ContributionDto> {
    const contribution = await this.prisma.contribution.findUnique({ where: { id } });
    if (!contribution) {
      throw new NotFoundException('Contribution not found.');
    }
    if (contribution.status !== 'pending') {
      throw new ConflictException('This contribution has already been reviewed.');
    }
    if (change.fields) {
      checkDates(change.fields);
    }
    if (change.status === 'approved') {
      const origins = await this.prisma.contribution.findMany({ where: { id: { in: proposedOrigins(contribution) } } });
      if (origins.some((origin) => !['approved', 'exported', 'integrated'].includes(origin.status))) {
        throw new ConflictException('Accept first the proposal of the person or union this one is about.');
      }
    }
    const rejected = change.status === 'rejected';
    const updated = await this.prisma.contribution.update({
      where: { id },
      data: {
        status: change.status,
        reviewerId: admin.id,
        reviewedAt: new Date(),
        ...(change.fields ? { fields: JSON.stringify(change.fields) } : {}),
        // A rejected document is not kept.
        ...(rejected ? { hash: null } : {}),
      },
      include: { author: true },
    });
    if (rejected && contribution.hash) {
      await this.store.collectGarbage();
    }
    return this.toDto(updated);
  }

  /**
   * Withdraws one's own contribution while it is pending, with one's pending
   * contributions about the person or union it proposed (recursively).
   */
  async withdraw(user: AuthUser, id: number): Promise<void> {
    const contribution = await this.prisma.contribution.findUnique({ where: { id } });
    if (contribution?.authorId !== user.id) {
      throw new NotFoundException('Contribution not found.');
    }
    if (contribution.status !== 'pending') {
      throw new ConflictException('Only pending contributions can be withdrawn.');
    }
    const ids = [id];
    // The list grows while it is walked: dependents of dependents are found too.
    for (const current of ids) {
      const dependents = await this.prisma.contribution.findMany({
        where: { OR: [{ personId: `W${current}` }, { familyId: `WF${current}` }] },
      });
      for (const dependent of dependents) {
        if (dependent.authorId !== user.id || dependent.status !== 'pending') {
          throw new ConflictException('Proposals about this person or union have already been reviewed.');
        }
        if (!ids.includes(dependent.id)) {
          ids.push(dependent.id);
        }
      }
    }
    await this.prisma.contribution.deleteMany({ where: { id: { in: ids } } });
    await this.store.collectGarbage();
  }

  async mediaFile(id: number): Promise<{ hash: string; mimeType: string; size: number; fileName: string }> {
    const contribution = await this.prisma.contribution.findUnique({ where: { id }, include: { file: true } });
    if (!contribution?.file || !contribution.fileName) {
      throw new NotFoundException('Document not found.');
    }
    const { hash, mimeType, size } = contribution.file;
    return { hash, mimeType, size, fileName: contribution.fileName };
  }

  /**
   * Zip archive (GEDCOM + documents) of the approved contributions, which
   * become "exported". Existing persons keep their GEDCOM references so that
   * the genealogy software can match them (duplicates merged field by field).
   */
  async export(now = new Date()): Promise<{ fileName: string; content: Buffer; count: number }> {
    const contributions = await this.prisma.contribution.findMany({
      where: { status: 'approved' },
      include: { author: true },
      orderBy: { id: 'asc' },
    });
    if (contributions.length === 0) {
      throw new BadRequestException('No approved contribution to export.');
    }
    const builder = new ExportBuilder(this.prisma);
    const documents = new Map<string, string>();
    for (const contribution of contributions) {
      const note = `Proposé via le site par ${
        contribution.author?.displayName ?? contribution.author?.email ?? 'un membre'
      } le ${frenchDate(contribution.createdAt)}`;
      const comment = contribution.comment ? `\nCommentaire : ${contribution.comment}` : '';
      const fields = JSON.parse(contribution.fields) as ContributionFieldsDto;
      const previous = JSON.parse(contribution.previous ?? '{}') as ContributionFieldsDto;
      if (contribution.kind === 'edit') {
        const person = await builder.person(contribution.personId);
        builder.apply(person, fields);
        person.notes.push(`${note} :\n${changesNote(fields, previous)}${comment}`);
      } else if (contribution.kind === 'edit-union') {
        const family = await builder.familyById(contribution.familyId!);
        builder.applyUnion(family, fields);
        family.notes.push(`${note} :\n${changesNote(fields, previous)}${comment}`);
      } else if (contribution.kind === 'add-person') {
        await builder.addRelative(
          contribution,
          `${note} (${RELATION_LABELS[contribution.relation as Relation]} de ${contribution.personSurname} ${contribution.personGivenNames})${comment}`,
        );
      } else if (contribution.hash && contribution.fileName) {
        const person = await builder.person(contribution.personId);
        const name = uniqueName(documents, contribution.fileName, contribution.hash);
        documents.set(name, contribution.hash);
        person.media.push({ file: name, ...(contribution.title ? { title: contribution.title } : {}) });
        person.notes.push(`${note} : document « ${name} » ajouté.${comment}`);
      }
    }

    // Day in the reference time zone (YYYY-MM-DD).
    const day = now.toLocaleDateString('sv-SE', { timeZone: this.timeZone });
    const archive = new yazl.ZipFile();
    const placeForm = await this.settings.get(PLACE_FORM_KEY);
    archive.addBuffer(
      Buffer.from(builder.write({ day, ...(placeForm ? { placeForm } : {}) }), 'utf8'),
      `contributions-${day}.ged`,
    );
    for (const [name, hash] of documents) {
      archive.addFile(this.store.path(hash), name);
    }
    archive.end();
    const content = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      archive.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
      archive.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
      archive.outputStream.on('error', reject);
    });
    await this.prisma.contribution.updateMany({
      where: { id: { in: contributions.map((c) => c.id) } },
      data: { status: 'exported', exportedAt: now },
    });
    return { fileName: `contributions-${day}.zip`, content, count: contributions.length };
  }

  /**
   * After an import: approved or exported contributions found in the new
   * data of the genealogy software are marked "integrated".
   */
  async reconcile(now = new Date()): Promise<number> {
    const contributions = await this.prisma.contribution.findMany({
      where: { status: { in: ['approved', 'exported'] } },
      orderBy: { id: 'asc' },
    });
    // Proposed persons already found in an import: proposals about them follow the imported person.
    const found = new Map(
      (await this.prisma.contribution.findMany({ where: { integratedPersonId: { not: null } } })).map((c) => [
        `W${c.id}`,
        c.integratedPersonId!,
      ]),
    );
    const resolve = (id: string) => (id.startsWith('W') ? found.get(id) : id);
    let count = 0;
    for (const contribution of contributions) {
      const personId = resolve(contribution.personId);
      const match = personId ? await this.isIntegrated({ ...contribution, personId }, resolve) : undefined;
      if (match) {
        const integratedPersonId = typeof match === 'string' ? match : null;
        if (integratedPersonId) {
          found.set(`W${contribution.id}`, integratedPersonId);
        }
        await this.prisma.contribution.update({
          where: { id: contribution.id },
          data: { status: 'integrated', integratedAt: now, integratedPersonId },
        });
        count++;
      }
    }
    return count;
  }

  /** Family of the genealogy a contribution refers to (a proposed union once integrated). */
  private async integratedFamily(
    familyId: string,
    resolve: (id: string) => string | undefined,
  ): Promise<string | undefined> {
    const origin = /^WF(\d+)$/.exec(familyId)?.[1];
    if (!origin) {
      return familyId;
    }
    const contribution = await this.prisma.contribution.findUnique({ where: { id: Number(origin) } });
    const anchor = contribution && resolve(contribution.personId);
    if (!contribution?.integratedPersonId || !anchor) {
      return undefined;
    }
    return (await linkingFamily(this.prisma, anchor, contribution.integratedPersonId))?.id;
  }

  /** True if integrated; for a new relative, the id of the imported person. */
  private async isIntegrated(
    contribution: Contribution,
    resolve: (id: string) => string | undefined,
  ): Promise<boolean | string> {
    if (contribution.kind === 'edit-union') {
      const familyId = await this.integratedFamily(contribution.familyId ?? '', resolve);
      const family =
        familyId &&
        (await this.prisma.family.findUnique({
          where: { id: familyId },
          include: { events: { include: { place: true } } },
        }));
      if (!family) {
        return false;
      }
      const marriage = family.events.find((e) => e.type === 'MARR');
      const fields = JSON.parse(contribution.fields) as UnionFieldsDto;
      return (
        (fields.marriageDate === undefined || sameDate(fields.marriageDate, marriage?.dateOriginal ?? '')) &&
        (fields.marriagePlace === undefined || samePlace(fields.marriagePlace, marriage?.place?.fullName))
      );
    }
    const person = await this.prisma.person.findUnique({
      where: { id: contribution.personId },
      include: {
        events: { include: { place: true } },
        media: true,
        childOf: { include: { family: { include: { partner1: true, partner2: true } } } },
        asPartner1: { include: { partner2: true, children: { include: { child: true } } } },
        asPartner2: { include: { partner1: true, children: { include: { child: true } } } },
      },
    });
    if (!person) {
      return false;
    }
    const fields = JSON.parse(contribution.fields) as PersonFieldsDto;
    if (contribution.kind === 'add-media') {
      return person.media.some((m) => mediaKey(m.fileName) === mediaKey(contribution.fileName ?? ''));
    }
    if (contribution.kind === 'edit') {
      const event = (types: string[]) =>
        types.map((type) => person.events.find((e) => e.type === type)).find((e) => e !== undefined);
      const birth = event(BIRTH_TYPES);
      const death = event(DEATH_TYPES);
      const checks: Record<keyof PersonFieldsDto, () => boolean> = {
        givenNames: () => sameText(fields.givenNames, person.givenNames),
        surname: () => sameText(fields.surname, person.surname),
        sex: () => fields.sex === person.sex,
        occupation: () => samePlace(fields.occupation, person.occupation ?? ''),
        birthDate: () => sameDate(fields.birthDate, birth?.dateOriginal ?? ''),
        birthPlace: () => samePlace(fields.birthPlace, birth?.place?.fullName),
        deathDate: () => sameDate(fields.deathDate, death?.dateOriginal ?? ''),
        deathPlace: () => samePlace(fields.deathPlace, death?.place?.fullName),
      };
      return (Object.keys(fields) as (keyof PersonFieldsDto)[]).every((key) => checks[key]());
    }
    // New relative: a person with the proposed names, linked as expected.
    const relatives =
      contribution.relation === 'parent'
        ? person.childOf.flatMap(({ family }) => [family.partner1, family.partner2])
        : contribution.relation === 'spouse'
          ? [...person.asPartner1.map((f) => f.partner2), ...person.asPartner2.map((f) => f.partner1)]
          : [...person.asPartner1, ...person.asPartner2].flatMap((f) => f.children.map((c) => c.child));
    // Only the names that were proposed are compared (one of them may be unknown).
    const relative = relatives.find(
      (candidate) =>
        !!candidate &&
        (fields.givenNames === undefined || sameText(candidate.givenNames, fields.givenNames)) &&
        (fields.surname === undefined || sameText(candidate.surname, fields.surname)),
    );
    return relative ? relative.id : false;
  }
}

/** Contributions that proposed the person or the union a contribution is about. */
function proposedOrigins(contribution: Contribution): number[] {
  return [/^W(\d+)$/.exec(contribution.personId)?.[1], /^WF(\d+)$/.exec(contribution.familyId ?? '')?.[1]]
    .filter((id) => id !== undefined)
    .map(Number);
}

/** File name of a document in the archive, unique by content. */
function uniqueName(documents: Map<string, string>, fileName: string, hash: string): string {
  const [stem, extension] = /^(.*?)(\.[^.]*)?$/.exec(fileName)!.slice(1) as [string, string | undefined];
  for (let index = 1; ; index++) {
    const name = index === 1 ? fileName : `${stem} (${index})${extension ?? ''}`;
    const existing = documents.get(name);
    if (existing === undefined || existing === hash) {
      return name;
    }
  }
}

/** Persons and families of the export: touched persons plus the ones they are linked to. */
class ExportBuilder {
  private readonly people = new Map<string, GedPerson>();
  private readonly families = new Map<string, GedFamily>();

  constructor(private readonly prisma: PrismaService) {}

  /** Existing or proposed person, with their current key fields (anchor for the duplicate merge). */
  async person(id: string): Promise<GedPerson> {
    const known = this.people.get(id);
    if (known) {
      return known;
    }
    const proposed = /^W(\d+)$/.exec(id)?.[1];
    if (proposed) {
      return this.proposedPerson(id, Number(proposed));
    }
    const person = await this.prisma.person.findUnique({
      where: { id },
      include: { events: { include: { place: true }, orderBy: { id: 'asc' } } },
    });
    if (!person) {
      throw new NotFoundException(`Person not found: ${id} (re-imported since the contribution?)`);
    }
    const event = (types: string[]): GedEvent | undefined => {
      const found = types.map((type) => person.events.find((e) => e.type === type)).find((e) => e !== undefined);
      return found
        ? {
            ...(found.dateOriginal ? { date: found.dateOriginal } : {}),
            ...(found.place ? { place: found.place.fullName } : {}),
          }
        : undefined;
    };
    const birth = event(BIRTH_TYPES);
    const death = event(DEATH_TYPES);
    const created: GedPerson = {
      id,
      givenNames: person.givenNames,
      surname: person.surname,
      sex: person.sex as Sex,
      ...(person.occupation ? { occupation: person.occupation } : {}),
      ...(birth ? { birth } : {}),
      ...(death ? { death } : {}),
      notes: [],
      media: [],
      famc: [],
      fams: [],
    };
    this.people.set(id, created);
    return created;
  }

  /**
   * Person proposed by a contribution, with their links: new in this export,
   * or exported again as an anchor for a proposal about them (the imported
   * person once integrated into the genealogy software).
   */
  private async proposedPerson(id: string, contributionId: number): Promise<GedPerson> {
    const contribution = await this.prisma.contribution.findUnique({ where: { id: contributionId } });
    if (contribution?.kind !== 'add-person') {
      throw new NotFoundException(`Proposed person not found: ${id}`);
    }
    if (contribution.integratedPersonId) {
      const imported = await this.person(contribution.integratedPersonId);
      this.people.set(id, imported);
      return imported;
    }
    const fields = JSON.parse(contribution.fields) as PersonFieldsDto;
    const person: GedPerson = {
      id,
      givenNames: fields.givenNames ?? '',
      surname: fields.surname ?? '',
      sex: fields.sex ?? 'U',
      notes: [],
      media: [],
      famc: [],
      fams: [],
    };
    this.apply(person, { ...fields, givenNames: undefined, surname: undefined, sex: undefined });
    this.people.set(id, person);
    await this.link(contribution, person);
    return person;
  }

  /** Applies proposed fields to a person of the export. */
  apply(person: GedPerson, fields: PersonFieldsDto): void {
    const date = (value: string) => toGedcomDate(value) ?? value;
    if (fields.givenNames !== undefined) person.givenNames = fields.givenNames;
    if (fields.surname !== undefined) person.surname = fields.surname;
    if (fields.sex !== undefined) person.sex = fields.sex;
    if (fields.occupation !== undefined) person.occupation = fields.occupation;
    if (fields.birthDate !== undefined) person.birth = { ...person.birth, date: date(fields.birthDate) };
    if (fields.birthPlace !== undefined) person.birth = { ...person.birth, place: fields.birthPlace };
    if (fields.deathDate !== undefined) person.death = { ...person.death, date: date(fields.deathDate) };
    if (fields.deathPlace !== undefined) person.death = { ...person.death, place: fields.deathPlace };
  }

  /** Applies proposed details to a union of the export. */
  applyUnion(family: GedFamily, fields: UnionFieldsDto): void {
    if (fields.marriageDate !== undefined) {
      family.marriage = { ...family.marriage, date: toGedcomDate(fields.marriageDate) ?? fields.marriageDate };
    }
    if (fields.marriagePlace !== undefined) {
      family.marriage = { ...family.marriage, place: fields.marriagePlace };
    }
  }

  /** Existing family with its partners (anchors). */
  private async family(id: string): Promise<GedFamily> {
    const known = this.families.get(id);
    if (known) {
      return known;
    }
    const family = await this.prisma.family.findUnique({
      where: { id },
      include: { events: { include: { place: true } } },
    });
    if (!family) {
      throw new NotFoundException(`Family not found: ${id}`);
    }
    const marriage = family.events.find((e) => e.type === 'MARR');
    const created: GedFamily = {
      id,
      ...(family.partner1Id ? { husband: family.partner1Id } : {}),
      ...(family.partner2Id ? { wife: family.partner2Id } : {}),
      children: [],
      notes: [],
      ...(marriage
        ? {
            marriage: {
              ...(marriage.dateOriginal ? { date: marriage.dateOriginal } : {}),
              ...(marriage.place ? { place: marriage.place.fullName } : {}),
            },
          }
        : {}),
    };
    this.families.set(id, created);
    for (const partner of [family.partner1Id, family.partner2Id]) {
      if (partner) {
        (await this.person(partner)).fams.push(id);
      }
    }
    return created;
  }

  /** Family of the genealogy, or proposed ("WF<contribution id>", the imported one once integrated). */
  async familyById(id: string): Promise<GedFamily> {
    const known = this.families.get(id);
    if (known) {
      return known;
    }
    const proposed = /^WF(\d+)$/.exec(id)?.[1];
    if (!proposed) {
      return this.family(id);
    }
    const contribution = await this.prisma.contribution.findUnique({ where: { id: Number(proposed) } });
    if (contribution?.integratedPersonId) {
      const anchor = await this.person(contribution.personId);
      const imported = await linkingFamily(this.prisma, anchor.id, contribution.integratedPersonId);
      if (imported) {
        const family = await this.family(imported.id);
        this.families.set(id, family);
        return family;
      }
    } else if (contribution) {
      // Proposing the person creates the family.
      await this.person(`W${contribution.id}`);
    }
    const created = this.families.get(id);
    if (!created) {
      throw new NotFoundException(`Proposed union not found: ${id}`);
    }
    return created;
  }

  private newFamily(id: string, partners: GedPerson[]): GedFamily {
    const family: GedFamily = { id, children: [], notes: [] };
    for (const partner of partners) {
      if (partner.sex === 'F' && !family.wife) {
        family.wife = partner.id;
      } else if (!family.husband) {
        family.husband = partner.id;
      } else {
        family.wife = partner.id;
      }
      partner.fams.push(id);
    }
    this.families.set(id, family);
    return family;
  }

  private addChild(family: GedFamily, child: GedPerson): void {
    if (!family.children.includes(child.id)) {
      family.children.push(child.id);
      child.famc.push(family.id);
    }
  }

  /** Parents' family of a person in the export, or in the genealogy. */
  private async parentsFamily(person: GedPerson): Promise<GedFamily | undefined> {
    const proposed = person.famc.map((id) => this.families.get(id)).find((f) => f !== undefined);
    if (proposed || person.id.startsWith('W')) {
      return proposed;
    }
    const link = await this.prisma.familyChild.findFirst({
      where: { childId: person.id },
      orderBy: { position: 'asc' },
    });
    return link ? this.family(link.familyId) : undefined;
  }

  /** Adds a partner to a family if there is room for them (by sex). */
  private join(family: GedFamily, partner: GedPerson): boolean {
    const role = partner.sex === 'F' ? 'wife' : partner.sex === 'M' ? 'husband' : family.husband ? 'wife' : 'husband';
    if (family[role]) {
      return false;
    }
    family[role] = partner.id;
    partner.fams.push(family.id);
    return true;
  }

  /** A new relative proposed by an approved contribution, with the note explaining it. */
  async addRelative(contribution: Contribution, note: string): Promise<void> {
    (await this.person(`W${contribution.id}`)).notes.push(note);
  }

  /** Links a proposed person to the person they were proposed from. */
  private async link(contribution: Contribution, relative: GedPerson): Promise<void> {
    const anchor = await this.person(contribution.personId);
    switch (contribution.relation as Relation) {
      case 'spouse': {
        // Joins a union without a second partner (e.g. the parent of children proposed before).
        const family = contribution.familyId ? await this.familyById(contribution.familyId) : undefined;
        if (!family || !this.join(family, relative)) {
          this.newFamily(`WF${contribution.id}`, [anchor, relative]);
        }
        return;
      }
      case 'child': {
        const family = contribution.familyId
          ? await this.familyById(contribution.familyId)
          : this.newFamily(`WF${contribution.id}`, [anchor]);
        this.addChild(family, relative);
        return;
      }
      case 'parent': {
        // Completes the parents' family if there is room for them.
        const family = contribution.familyId
          ? await this.familyById(contribution.familyId)
          : await this.parentsFamily(anchor);
        if (family && this.join(family, relative)) {
          this.addChild(family, anchor);
          return;
        }
        this.addChild(this.newFamily(`WF${contribution.id}`, [relative]), anchor);
      }
    }
  }

  write(header: { day: string; placeForm?: string }): string {
    return writeGedcom([...this.people.values()], [...this.families.values()], header);
  }
}
