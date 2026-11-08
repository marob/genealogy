import type {
  ContributionFieldsDto,
  EventDto,
  PersonDto,
  PersonFieldsDto,
  PersonProposal,
  Relation,
  Sex,
  UnionDto,
  UnionFieldsDto,
} from '@genealogie/shared';
import { toGedcomDate } from '../contributions/user-date.js';
import { parseGedcomDate } from '../gedcom/dates.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Proposals of a member applied to the persons returned to that member only,
 * until they are integrated into the genealogy software: proposed persons
 * ("W<contribution id>") and unions ("WF<contribution id>") appear in the
 * tree, proposed values replace the genealogy data, and all are flagged
 * (PersonDto.proposal, UnionDto.proposal).
 */

const ACTIVE = ['pending', 'approved', 'exported'] as const;
type ActiveStatus = (typeof ACTIVE)[number];
const STATUS_ORDER: Record<ActiveStatus, number> = { pending: 0, approved: 1, exported: 2 };

function isActive(status: string): status is ActiveStatus {
  return (ACTIVE as readonly string[]).includes(status);
}

/** A family as linked by the proposals: partners (partner1 the husband) and children. */
export interface OverlayFamily {
  id: string;
  partner1Id: string | null;
  partner2Id: string | null;
  childIds: string[];
  /** Proposed family: status of the contribution that created it. */
  proposed?: { status: ActiveStatus };
}

type Slot = 'partner1Id' | 'partner2Id';

/** Slot of a new partner: by sex when possible, else any free one. */
function freeSlot(family: OverlayFamily, sex: Sex): Slot | undefined {
  const preferred: Slot[] = sex === 'F' ? ['partner2Id'] : sex === 'M' ? ['partner1Id'] : ['partner1Id', 'partner2Id'];
  return preferred.find((slot) => !family[slot]);
}

const FAMILY_SELECT = {
  id: true,
  partner1Id: true,
  partner2Id: true,
  children: { orderBy: { position: 'asc' }, select: { childId: true } },
} as const;

function member(id: string) {
  return { OR: [{ partner1Id: id }, { partner2Id: id }, { children: { some: { childId: id } } }] };
}

/** Family of the genealogy linking two persons (partners, or parent and child). */
export async function linkingFamily(prisma: PrismaService, a: string, b: string): Promise<OverlayFamily | undefined> {
  const family = await prisma.family.findFirst({ where: { AND: [member(a), member(b)] }, select: FAMILY_SELECT });
  return family ? toFamily(family) : undefined;
}

/** Family of the genealogy, with its partners and children. */
export async function loadFamily(prisma: PrismaService, id: string): Promise<OverlayFamily | undefined> {
  const family = await prisma.family.findUnique({ where: { id }, select: FAMILY_SELECT });
  return family ? toFamily(family) : undefined;
}

function toFamily(family: {
  id: string;
  partner1Id: string | null;
  partner2Id: string | null;
  children: { childId: string }[];
}): OverlayFamily {
  return {
    id: family.id,
    partner1Id: family.partner1Id,
    partner2Id: family.partner2Id,
    childIds: family.children.map((c) => c.childId),
  };
}

type Operation = (person: PersonDto) => void;
type UnionOperation = (union: UnionDto) => void;

function markProposal(
  target: { proposal?: PersonProposal },
  status: ActiveStatus,
  change: { isNew?: boolean; fields?: string[]; pending?: number },
): void {
  const current = target.proposal;
  const merged: PersonProposal = {
    status: current && STATUS_ORDER[current.status] > STATUS_ORDER[status] ? current.status : status,
    ...(current?.isNew || change.isNew ? { isNew: true } : {}),
  };
  const fields = [...new Set([...(current?.fields ?? []), ...(change.fields ?? [])])];
  if (fields.length) {
    merged.fields = fields;
  }
  const pending = [...(current?.pending ?? []), ...(change.pending !== undefined ? [change.pending] : [])];
  if (pending.length) {
    merged.pending = pending;
  }
  target.proposal = merged;
}

/** Sets the date and place of the first event of the given types (created if needed). */
function applyEvent(
  target: { events: EventDto[] },
  types: string[],
  date: string | undefined,
  place: string | undefined,
): void {
  if (date === undefined && place === undefined) {
    return;
  }
  let event = target.events.find((e) => types.includes(e.type));
  if (!event) {
    event = { type: types[0]! };
    target.events.push(event);
  }
  const updated: EventDto = event;
  if (date !== undefined) {
    const parsed = date ? parseGedcomDate(toGedcomDate(date) ?? date) : undefined;
    if (parsed) {
      updated.date = parsed.date;
    } else {
      delete updated.date;
    }
  }
  if (place !== undefined) {
    if (place) {
      updated.place = { id: 0, name: place };
    } else {
      delete updated.place;
    }
  }
}

function applyFields(person: PersonDto, fields: PersonFieldsDto): void {
  if (fields.givenNames !== undefined) person.givenNames = fields.givenNames;
  if (fields.surname !== undefined) person.surname = fields.surname;
  if (fields.sex !== undefined) person.sex = fields.sex;
  if (fields.occupation !== undefined) {
    if (fields.occupation) {
      person.occupation = fields.occupation;
    } else {
      delete person.occupation;
    }
  }
  applyEvent(person, ['BIRT', 'CHR', 'BAPM'], fields.birthDate, fields.birthPlace);
  applyEvent(person, ['DEAT', 'BURI', 'CREM'], fields.deathDate, fields.deathPlace);
}

function applyUnionFields(union: { events: EventDto[] }, fields: UnionFieldsDto): void {
  applyEvent(union, ['MARR'], fields.marriageDate, fields.marriagePlace);
}

export class ProposalOverlay {
  private readonly operations = new Map<string, Operation[]>();
  private readonly unionOperations = new Map<string, UnionOperation[]>();
  private readonly proposed = new Map<string, () => PersonDto>();
  /** Families touched by the proposals, by id. */
  private readonly families = new Map<string, OverlayFamily>();
  /** Parents' family of the persons the proposals start from (genealogy or proposed). */
  private readonly parentFamilies = new Map<string, OverlayFamily>();

  /** Overlay of a member's active proposals (empty for anonymous visitors). */
  static async of(prisma: PrismaService, userId: number | undefined): Promise<ProposalOverlay> {
    const overlay = new ProposalOverlay();
    if (userId === undefined) {
      return overlay;
    }
    const contributions = await prisma.contribution.findMany({
      where: { authorId: userId, kind: { in: ['edit', 'add-person', 'edit-union'] } },
      orderBy: { id: 'asc' },
    });
    const active = contributions.filter((c) => isActive(c.status));
    if (active.length === 0) {
      return overlay;
    }
    const byId = new Map(contributions.map((c) => [c.id, c]));
    const activeIds = new Set(active.map((c) => c.id));
    const contributionOf = (id: string, prefix: 'W' | 'WF') => {
      const match = new RegExp(`^${prefix}(\\d+)$`).exec(id);
      return match ? byId.get(Number(match[1])) : undefined;
    };

    /** Person to apply a proposal to: proposed, integrated since (genealogy id) or from the genealogy. */
    const resolve = (id: string): string | undefined => {
      if (!id.startsWith('W')) {
        return id;
      }
      const origin = contributionOf(id, 'W');
      if (!origin) {
        return undefined;
      }
      return activeIds.has(origin.id) && origin.kind === 'add-person' ? id : (origin.integratedPersonId ?? undefined);
    };

    // Genealogy data needed to link the proposed persons and unions.
    const realIds = [...new Set(active.map((c) => resolve(c.personId)).filter((id) => id && !id.startsWith('W')))];
    const persons = await prisma.person.findMany({
      where: { id: { in: realIds as string[] } },
      select: {
        id: true,
        sex: true,
        asPartner1: { select: { id: true } },
        asPartner2: { select: { id: true } },
        childOf: { orderBy: { position: 'asc' }, take: 1, select: { familyId: true } },
      },
    });
    const familyIds = new Set([
      ...persons.flatMap((p) => [
        ...p.asPartner1.map((f) => f.id),
        ...p.asPartner2.map((f) => f.id),
        ...p.childOf.map((f) => f.familyId),
      ]),
      ...active.flatMap((c) => (c.familyId && !c.familyId.startsWith('W') ? [c.familyId] : [])),
    ]);
    for (const family of await prisma.family.findMany({
      where: { id: { in: [...familyIds] } },
      select: FAMILY_SELECT,
    })) {
      overlay.families.set(family.id, toFamily(family));
    }
    const sexes = new Map<string, Sex>(persons.map((p) => [p.id, p.sex as Sex]));
    for (const person of persons) {
      const parents = person.childOf[0] && overlay.families.get(person.childOf[0].familyId);
      if (parents) {
        overlay.parentFamilies.set(person.id, parents);
      }
    }

    /** Family a proposal refers to: genealogy, proposed, or proposed and integrated since. */
    const family = async (id: string): Promise<OverlayFamily | undefined> => {
      const known = overlay.families.get(id);
      if (known || !id.startsWith('WF')) {
        return known;
      }
      const origin = contributionOf(id, 'WF');
      const anchor = origin && resolve(origin.personId);
      if (!origin?.integratedPersonId || !anchor) {
        return undefined;
      }
      const integrated = await linkingFamily(prisma, anchor, origin.integratedPersonId);
      if (integrated) {
        overlay.families.set(integrated.id, overlay.families.get(integrated.id) ?? integrated);
      }
      return integrated && overlay.families.get(integrated.id);
    };

    const newFamily = (id: string, status: ActiveStatus, partners: string[]) => {
      const created: OverlayFamily = {
        id,
        partner1Id: null,
        partner2Id: null,
        childIds: [],
        proposed: { status },
      };
      for (const partner of partners) {
        const slot = freeSlot(created, sexes.get(partner) ?? 'U') ?? 'partner2Id';
        created[slot] = partner;
        overlay.on(partner, (person) => person.unions.push(overlay.unionOf(created)));
      }
      overlay.families.set(id, created);
      return created;
    };

    /** Links a child to the parents of a family (read when applied: a parent may join it later). */
    const linkParents = (target: OverlayFamily, childId: string) =>
      overlay.on(childId, (person) => {
        if (target.partner1Id && !person.fatherId) person.fatherId = target.partner1Id;
        if (target.partner2Id && !person.motherId) person.motherId = target.partner2Id;
      });

    const addChild = (target: OverlayFamily, childId: string) => {
      if (!target.childIds.includes(childId)) {
        target.childIds.push(childId);
      }
      linkParents(target, childId);
    };

    /** A new partner joins a family, if there is room for them: its children get a new parent. */
    const join = (target: OverlayFamily | undefined, partnerId: string, sex: Sex): target is OverlayFamily => {
      const slot = target && freeSlot(target, sex);
      if (!target || !slot) {
        return false;
      }
      target[slot] = partnerId;
      overlay.on(partnerId, (person) => person.unions.push(overlay.unionOf(target)));
      for (const child of target.childIds) {
        linkParents(target, child);
      }
      return true;
    };

    for (const contribution of active) {
      const status = contribution.status as ActiveStatus;
      const pending = status === 'pending' ? contribution.id : undefined;
      const anchor = resolve(contribution.personId);
      if (!anchor) {
        continue; // proposed person withdrawn or rejected
      }
      const fields = JSON.parse(contribution.fields) as ContributionFieldsDto;

      if (contribution.kind === 'edit') {
        overlay.on(anchor, (person) => {
          applyFields(person, fields);
          markProposal(person, status, { fields: Object.keys(fields), pending });
        });
        if (fields.sex) {
          sexes.set(anchor, fields.sex);
        }
        continue;
      }

      if (contribution.kind === 'edit-union') {
        const target = contribution.familyId ? await family(contribution.familyId) : undefined;
        if (target) {
          overlay.onUnion(target.id, (union) => {
            applyUnionFields(union, fields);
            markProposal(union, status, { fields: Object.keys(fields), pending });
          });
        }
        continue;
      }

      // New person, linked to the anchor.
      const id = `W${contribution.id}`;
      const sex = fields.sex ?? 'U';
      sexes.set(id, sex);
      overlay.proposed.set(id, () => {
        const person: PersonDto = {
          id,
          givenNames: fields.givenNames ?? '',
          surname: fields.surname ?? '',
          sex,
          unions: [],
          restricted: false,
          events: [],
          media: [],
          proposal: { status, isNew: true, ...(pending !== undefined ? { pending: [pending] } : {}) },
        };
        applyFields(person, { ...fields, givenNames: undefined, surname: undefined, sex: undefined });
        return person;
      });

      switch (contribution.relation as Relation) {
        case 'spouse': {
          // Joins a union without a second partner (e.g. the parent of children proposed before).
          const joined = contribution.familyId ? await family(contribution.familyId) : undefined;
          if (!join(joined, id, sex)) {
            newFamily(`WF${contribution.id}`, status, [anchor, id]);
          }
          break;
        }
        case 'child': {
          const parents = contribution.familyId
            ? await family(contribution.familyId)
            : newFamily(`WF${contribution.id}`, status, [anchor]);
          if (parents) {
            addChild(parents, id);
          }
          break;
        }
        case 'parent': {
          const joined = contribution.familyId
            ? await family(contribution.familyId)
            : overlay.parentFamilies.get(anchor);
          if (join(joined, id, sex)) {
            addChild(joined, anchor);
          } else {
            const created = newFamily(`WF${contribution.id}`, status, [id]);
            addChild(created, anchor);
            if (!overlay.parentFamilies.has(anchor)) {
              overlay.parentFamilies.set(anchor, created);
            }
          }
          break;
        }
      }
    }
    return overlay;
  }

  private on(id: string, operation: Operation): void {
    this.operations.set(id, [...(this.operations.get(id) ?? []), operation]);
  }

  private onUnion(familyId: string, operation: UnionOperation): void {
    this.unionOperations.set(familyId, [...(this.unionOperations.get(familyId) ?? []), operation]);
  }

  /** Union of a person in a family the proposals created or joined. */
  private unionOf(family: OverlayFamily): UnionDto {
    return {
      familyId: family.id,
      childIds: [],
      events: [],
      restricted: false,
      media: [],
      // Withdrawn with the person proposed with it: `pending` only lists the proposed details.
      ...(family.proposed ? { proposal: { status: family.proposed.status, isNew: true } } : {}),
    };
  }

  /** Parents' family of a person, as their proposals make it (to add a missing parent). */
  parentsFamily(personId: string): OverlayFamily | undefined {
    return this.parentFamilies.get(personId);
  }

  /** Proposed person, with the proposals about them applied. */
  proposedPerson(id: string): PersonDto | undefined {
    const create = this.proposed.get(id);
    return create ? this.apply(create()) : undefined;
  }

  /** Applies the proposals about a person and their unions (on a copy). */
  apply(person: PersonDto): PersonDto {
    const operations = this.operations.get(person.id);
    if (!operations && !person.unions.some((union) => this.families.has(union.familyId))) {
      return person;
    }
    const copy = structuredClone(person);
    for (const operation of operations ?? []) {
      operation(copy);
    }
    for (const union of copy.unions) {
      const family = this.families.get(union.familyId);
      if (!family) {
        continue;
      }
      union.partnerId ??= [family.partner1Id, family.partner2Id].find((p) => p && p !== person.id) ?? undefined;
      if (!union.partnerId) {
        delete union.partnerId;
      }
      for (const child of family.childIds) {
        if (!union.childIds.includes(child)) {
          union.childIds.push(child);
        }
      }
      for (const operation of this.unionOperations.get(family.id) ?? []) {
        operation(union);
      }
    }
    return copy;
  }
}
