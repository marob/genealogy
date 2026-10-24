import type {
  Calendar,
  DateQualifier,
  EventDto,
  GenealogyDate,
  PartialDate,
  PersonDto,
  PersonSummaryDto,
  PlaceDto,
  Sex,
  UnionDto,
} from '@genealogie/shared';
import type { Event, Family, FamilyChild, Person, Place, Prisma } from '../generated/prisma/client.js';
import { PrivacyPolicy } from './privacy.js';

export type EventWithPlace = Event & { place: Place | null };
export type FamilyWithDetails = Family & { events: EventWithPlace[]; children: FamilyChild[] };

/** Prisma relations to load to build a `PersonDto` (events in file order). */
export const personInclude = {
  events: { include: { place: true }, orderBy: { id: 'asc' } },
  childOf: { include: { family: true } },
  asPartner1: {
    include: {
      events: { include: { place: true }, orderBy: { id: 'asc' } },
      children: { orderBy: { position: 'asc' } },
    },
  },
  asPartner2: {
    include: {
      events: { include: { place: true }, orderBy: { id: 'asc' } },
      children: { orderBy: { position: 'asc' } },
    },
  },
} satisfies Prisma.PersonInclude;

export type PersonWithDetails = Prisma.PersonGetPayload<{ include: typeof personInclude }>;

function partial(year: number | null, month: number | null, day: number | null): PartialDate | undefined {
  if (year === null) {
    return undefined;
  }
  return { year, ...(month === null ? {} : { month }), ...(day === null ? {} : { day }) };
}

function toDate(event: Event): GenealogyDate | undefined {
  if (!event.dateOriginal) {
    return undefined;
  }
  const start = partial(event.dateYear, event.dateMonth, event.dateDay);
  const end = partial(event.dateEndYear, event.dateEndMonth, event.dateEndDay);
  return {
    original: event.dateOriginal,
    qualifier: (event.dateQualifier ?? 'phrase') as DateQualifier,
    calendar: (event.dateCalendar ?? 'gregorian') as Calendar,
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
  };
}

function toPlace(place: Place): PlaceDto {
  const optional = <K extends keyof PlaceDto>(key: K, value: PlaceDto[K] | null): Partial<PlaceDto> =>
    value === null ? {} : { [key]: value };
  return {
    id: place.id,
    name: place.fullName,
    ...optional('locality', place.locality),
    ...optional('postalCode', place.postalCode),
    ...optional('county', place.county),
    ...optional('region', place.region),
    ...optional('country', place.country),
    ...optional('latitude', place.latitude),
    ...optional('longitude', place.longitude),
  };
}

function toEvent(event: EventWithPlace): EventDto {
  const date = toDate(event);
  return {
    type: event.type,
    ...(date ? { date } : {}),
    ...(event.place ? { place: toPlace(event.place) } : {}),
    ...(event.value ? { value: event.value } : {}),
  };
}

/**
 * Builds DTOs while applying the privacy rule. The birth dates of relatives
 * are needed to know whether a union is contemporary: they are provided by
 * `birthKeys`.
 */
export class PersonMapper {
  constructor(
    private readonly policy: PrivacyPolicy,
    private readonly birthKeys: Map<string, number | null>,
  ) {}

  private isRestricted(personId: string | null | undefined): boolean {
    return !!personId && this.policy.isPersonRestricted(this.birthKeys.get(personId));
  }

  private toUnion(person: Person, family: FamilyWithDetails): UnionDto {
    const partnerId = family.partner1Id === person.id ? family.partner2Id : family.partner1Id;
    const restricted =
      !this.policy.canSeeContemporary &&
      (this.isRestricted(person.id) ||
        this.isRestricted(partnerId) ||
        family.events.some((event) => this.policy.isContemporary(PrivacyPolicy.eventKey(event) ?? 0)));
    return {
      familyId: family.id,
      ...(partnerId ? { partnerId } : {}),
      childIds: family.children.map((child) => child.childId),
      events: restricted ? [] : family.events.map(toEvent),
      restricted,
    };
  }

  toPerson(person: PersonWithDetails): PersonDto {
    const restricted = this.isRestricted(person.id);
    const parents = [...person.childOf].sort(
      (a, b) => Number(!!a.pedigree && a.pedigree !== 'birth') - Number(!!b.pedigree && b.pedigree !== 'birth'),
    )[0]?.family;
    const unions = [...person.asPartner1, ...person.asPartner2]
      .map((family) => {
        const union = this.toUnion(person, family);
        // Gregorian key: unions dated in other calendars sort correctly. Hidden dates sort last.
        return { union, key: union.restricted ? Number.MAX_SAFE_INTEGER : familySortKey(family) };
      })
      .sort((a, b) => a.key - b.key)
      .map(({ union }) => union);

    return {
      id: person.id,
      givenNames: person.givenNames,
      surname: person.surname,
      sex: person.sex as Sex,
      ...(parents?.partner1Id ? { fatherId: parents.partner1Id } : {}),
      ...(parents?.partner2Id ? { motherId: parents.partner2Id } : {}),
      unions,
      restricted,
      events: restricted ? [] : person.events.map(toEvent),
      ...(!restricted && person.occupation ? { occupation: person.occupation } : {}),
      ...(!restricted && person.note ? { note: person.note } : {}),
    };
  }

  toSummary(person: Person & { events: EventWithPlace[] }): PersonSummaryDto {
    const restricted = this.isRestricted(person.id);
    const birth = firstOfTypes(person.events, ['BIRT', 'CHR', 'BAPM']);
    const death = firstOfTypes(person.events, ['DEAT', 'BURI', 'CREM']);
    return {
      id: person.id,
      givenNames: person.givenNames,
      surname: person.surname,
      sex: person.sex as Sex,
      restricted,
      ...(!restricted && birth ? { birth: toEvent(birth) } : {}),
      ...(!restricted && death ? { death: toEvent(death) } : {}),
    };
  }
}

/** First event of the first type present, in order of preference. */
function firstOfTypes<T extends { type: string }>(events: T[], types: string[]): T | undefined {
  for (const type of types) {
    const event = events.find((candidate) => candidate.type === type);
    if (event) {
      return event;
    }
  }
  return undefined;
}

function familySortKey(family: { events: { dateSortKey: number | null }[] }): number {
  const keys = family.events.flatMap((event) => (event.dateSortKey === null ? [] : [event.dateSortKey]));
  return keys.length ? Math.min(...keys) : Number.MAX_SAFE_INTEGER;
}
