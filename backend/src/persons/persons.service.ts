import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PersonDto, SearchResultDto, SurnameDto, TreeInfoDto } from '@genealogie/shared';
import { canSeeContemporary, type AuthUser } from '../auth/auth-user.js';
import { normalizeForSearch } from '../common/normalize.js';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ROOT_PERSON_KEY, SettingsService } from '../settings/settings.service.js';
import { PersonMapper, type PersonWithDetails, personInclude } from './person-mapper.js';
import { PrivacyPolicy, todayKey } from './privacy.js';

export type Relatives = 'parents' | 'children' | 'unions';

export interface SearchQuery {
  q?: string;
  surname?: string;
  place?: string;
  bornFrom?: number;
  bornTo?: number;
  sex?: 'M' | 'F' | 'U';
  page: number;
  pageSize: number;
}

const BIRTH_TYPES = ['BIRT', 'CHR', 'BAPM'];
/** Maximum number of persons returned for a lineage. */
const MAX_LINEAGE_PERSONS = 5000;
const DEATH_TYPES = ['DEAT', 'BURI', 'CREM'];

@Injectable()
export class PersonsService {
  private readonly timeZone: string;
  private readonly hideIdentity: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    config: ConfigService<Env, true>,
  ) {
    this.timeZone = config.get('APP_TIMEZONE', { infer: true });
    this.hideIdentity = config.get('CONTEMPORARY_PRIVACY', { infer: true }) === 'hidden';
  }

  private policy(user: AuthUser | undefined): PrivacyPolicy {
    return new PrivacyPolicy(canSeeContemporary(user), todayKey(this.timeZone), this.hideIdentity);
  }

  private async load(ids: string[], user: AuthUser | undefined): Promise<PersonDto[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return [];
    }
    const persons: PersonWithDetails[] = await this.prisma.person.findMany({
      where: { id: { in: unique } },
      include: personInclude,
    });
    // Partners' birth dates are used to hide contemporary unions.
    const partnerIds = persons.flatMap((person) =>
      [...person.asPartner1, ...person.asPartner2].flatMap((family) => [family.partner1Id, family.partner2Id]),
    );
    const birthKeys = new Map<string, number | null>(
      (
        await this.prisma.person.findMany({
          where: { id: { in: [...new Set(partnerIds.filter((id): id is string => !!id))] } },
          select: { id: true, birthKey: true },
        })
      ).map((person) => [person.id, person.birthKey]),
    );
    for (const person of persons) {
      birthKeys.set(person.id, person.birthKey);
    }
    const mapper = new PersonMapper(this.policy(user), birthKeys);
    const byId = new Map(persons.map((person) => [person.id, mapper.toPerson(person)]));
    return unique.map((id) => byId.get(id)).filter((person): person is PersonDto => !!person);
  }

  findMany(ids: string[], user: AuthUser | undefined): Promise<PersonDto[]> {
    return this.load(ids, user);
  }

  /** A person (first) followed by the requested relatives. */
  async findWithRelatives(id: string, relatives: Relatives[], user: AuthUser | undefined): Promise<PersonDto[]> {
    const [person] = await this.load([id], user);
    if (!person) {
      throw new NotFoundException(`Person not found: ${id}`);
    }
    const ids: string[] = [];
    if (relatives.includes('parents')) {
      ids.push(...[person.fatherId, person.motherId].filter((parentId): parentId is string => !!parentId));
    }
    if (relatives.includes('unions')) {
      ids.push(
        ...person.unions.map((union) => union.partnerId).filter((partnerId): partnerId is string => !!partnerId),
      );
    }
    if (relatives.includes('children')) {
      ids.push(...person.unions.flatMap((union) => union.childIds));
    }
    return [
      person,
      ...(await this.load(
        ids.filter((relativeId) => relativeId !== id),
        user,
      )),
    ];
  }

  /**
   * Lineage of a person: their ancestors and descendants over the requested
   * number of generations, plus their partners. The traversal skips persons
   * already visited (protection against loops in files).
   */
  async lineage(
    id: string,
    generations: { ancestors: number; descendants: number },
    user: AuthUser | undefined,
  ): Promise<PersonDto[]> {
    const [root] = await this.load([id], user);
    if (!root) {
      throw new NotFoundException(`Person not found: ${id}`);
    }
    const found = new Map<string, PersonDto>([[root.id, root]]);
    const walk = async (next: (person: PersonDto) => (string | undefined)[], depth: number): Promise<void> => {
      let frontier = [root];
      for (let generation = 0; generation < depth && frontier.length > 0; generation++) {
        const ids = [...new Set(frontier.flatMap(next))].filter(
          (relativeId): relativeId is string => !!relativeId && !found.has(relativeId),
        );
        const room = MAX_LINEAGE_PERSONS - found.size;
        frontier = await this.load(ids.slice(0, Math.max(0, room)), user);
        for (const person of frontier) {
          found.set(person.id, person);
        }
      }
    };
    await walk((person) => [person.fatherId, person.motherId], generations.ancestors);
    await walk((person) => person.unions.flatMap((union) => union.childIds), generations.descendants);
    const partners = await this.load(
      root.unions
        .map((union) => union.partnerId)
        .filter((partnerId): partnerId is string => !!partnerId && !found.has(partnerId)),
      user,
    );
    return [...found.values(), ...partners];
  }

  async search(query: SearchQuery, user: AuthUser | undefined): Promise<SearchResultDto> {
    const policy = this.policy(user);
    const and: Prisma.PersonWhereInput[] = normalizeForSearch(query.q ?? '')
      .split(' ')
      .filter(Boolean)
      .map((token) => ({ searchName: { contains: token } }));
    if (query.surname !== undefined) {
      and.push({ surname: query.surname });
    }
    if (query.sex) {
      and.push({ sex: query.sex });
    }
    const usesDetails = !!query.place || query.bornFrom !== undefined || query.bornTo !== undefined;
    if (query.place) {
      and.push({ events: { some: { place: { searchName: { contains: normalizeForSearch(query.place) } } } } });
    }
    if (query.bornFrom !== undefined || query.bornTo !== undefined) {
      and.push({
        events: {
          some: {
            type: { in: BIRTH_TYPES },
            dateSortKey: {
              ...(query.bornFrom === undefined ? {} : { gte: query.bornFrom * 10_000 }),
              ...(query.bornTo === undefined ? {} : { lte: query.bornTo * 10_000 + 1231 }),
            },
          },
        },
      });
    }
    // Searching by date or place must not reveal information about
    // contemporaries: they are then excluded for unauthorized users. In
    // strict mode, they never appear in searches.
    if ((usesDetails || policy.hideIdentity) && !policy.canSeeContemporary) {
      and.push(this.notContemporary(policy));
    }

    const where: Prisma.PersonWhereInput = { AND: and };
    const [total, persons] = await Promise.all([
      this.prisma.person.count({ where }),
      this.prisma.person.findMany({
        where,
        include: {
          events: {
            where: { type: { in: [...BIRTH_TYPES, ...DEATH_TYPES] } },
            include: { place: true },
            orderBy: { id: 'asc' },
          },
        },
        // Ordering by birth would reveal the relative age of restricted homonyms.
        orderBy: policy.canSeeContemporary
          ? [{ sortName: 'asc' }, { birthKey: 'asc' }, { id: 'asc' }]
          : [{ sortName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const mapper = new PersonMapper(policy, new Map(persons.map((person) => [person.id, person.birthKey])));
    return {
      items: persons.map((person) => mapper.toSummary(person)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private notContemporary(policy: PrivacyPolicy): Prisma.PersonWhereInput {
    return { birthKey: { not: null, lte: policy.threshold } };
  }

  /** Surname index; in strict mode, contemporaries are not counted for unauthorized users. */
  async surnames(user: AuthUser | undefined): Promise<SurnameDto[]> {
    const policy = this.policy(user);
    const groups = await this.prisma.person.groupBy({
      by: ['surname'],
      _count: { _all: true },
      ...(policy.hideIdentity && !policy.canSeeContemporary ? { where: this.notContemporary(policy) } : {}),
    });
    return groups
      .map((group) => ({ surname: group.surname, count: group._count._all }))
      .sort((a, b) => normalizeForSearch(a.surname).localeCompare(normalizeForSearch(b.surname)));
  }

  /** Tree root: the logged-in user's root if it still exists, otherwise the shared root. */
  async treeInfo(user?: AuthUser): Promise<TreeInfoDto> {
    const [globalRootPersonId, persons, account] = await Promise.all([
      this.settings.get(ROOT_PERSON_KEY),
      this.prisma.person.count(),
      user ? this.prisma.user.findUnique({ where: { id: user.id }, select: { rootPersonId: true } }) : null,
    ]);
    const personalRootId = account?.rootPersonId;
    const personalRoot =
      !!personalRootId &&
      !!(await this.prisma.person.findUnique({ where: { id: personalRootId }, select: { id: true } }));
    const rootPersonId = personalRoot ? personalRootId : globalRootPersonId;
    return {
      persons,
      personalRoot,
      ...(rootPersonId ? { rootPersonId } : {}),
      ...(globalRootPersonId ? { globalRootPersonId } : {}),
    };
  }

  /** User's personal root; `null` to revert to the shared root. */
  async setPersonalRoot(user: AuthUser, personId: string | null): Promise<TreeInfoDto> {
    if (personId !== null) {
      await this.assertExists(personId);
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { rootPersonId: personId } });
    return this.treeInfo(user);
  }

  private async assertExists(personId: string): Promise<void> {
    if (!(await this.prisma.person.findUnique({ where: { id: personId }, select: { id: true } }))) {
      throw new NotFoundException(`Person not found: ${personId}`);
    }
  }

  async setRoot(user: AuthUser, personId: string): Promise<TreeInfoDto> {
    await this.assertExists(personId);
    await this.settings.set(ROOT_PERSON_KEY, personId);
    return this.treeInfo(user);
  }
}
