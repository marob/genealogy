import type { ContributionFieldsDto, ContributionStatus, EventDto, PersonDto } from '@genealogie/shared';

/** Person fields that can be proposed, in display order. */
const PERSON_FIELDS = [
  'givenNames',
  'surname',
  'sex',
  'occupation',
  'birthDate',
  'birthPlace',
  'deathDate',
  'deathPlace',
] as const satisfies readonly (keyof ContributionFieldsDto)[];

/** Fields of a contribution (person or union), in display order. */
const CONTRIBUTION_FIELDS = [
  ...PERSON_FIELDS,
  'marriageDate',
  'marriagePlace',
] as const satisfies readonly (keyof ContributionFieldsDto)[];

export type PersonField = (typeof PERSON_FIELDS)[number];
export type ContributionField = (typeof CONTRIBUTION_FIELDS)[number];
export type UnionField = 'marriageDate' | 'marriagePlace';

/** Values of the union fields as edited in a form. */
export type UnionFieldValues = Record<UnionField, string>;

export const EMPTY_UNION_FIELDS: UnionFieldValues = { marriageDate: '', marriagePlace: '' };

/** Values of the person fields as edited in a form (empty string when unknown). */
export type PersonFieldValues = Record<PersonField, string>;

export const EMPTY_FIELDS: PersonFieldValues = {
  givenNames: '',
  surname: '',
  sex: 'U',
  occupation: '',
  birthDate: '',
  birthPlace: '',
  deathDate: '',
  deathPlace: '',
};

/** First event of the given types that has a date or a place (BIRT before CHR…). */
function firstEvent(events: readonly EventDto[], types: readonly string[]): EventDto | undefined {
  for (const type of types) {
    const event = events.find((candidate) => candidate.type === type && !!(candidate.date ?? candidate.place));
    if (event) {
      return event;
    }
  }
  return undefined;
}

/**
 * Current values of a person's fields. Dates are shown as written in the
 * GEDCOM file, birth and death falling back on baptism and burial.
 */
export function currentFields(person: PersonDto): PersonFieldValues {
  const birth = firstEvent(person.events, ['BIRT', 'CHR']);
  const death = firstEvent(person.events, ['DEAT', 'BURI']);
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

/** Fields whose (trimmed) value differs from the initial one; a cleared field is sent empty. */
export function changedFields<K extends string>(
  initial: Record<K, string>,
  values: Record<K, string>,
): Partial<Record<K, string>> {
  const changes: Partial<Record<K, string>> = {};
  for (const field of Object.keys(values) as K[]) {
    const value = values[field].trim();
    if (value !== initial[field].trim()) {
      changes[field] = value;
    }
  }
  return changes;
}

/** Filled-in fields (of a new person, of a union). */
export function filledFields<K extends string>(values: Record<K, string>): Partial<Record<K, string>> {
  const fields: Partial<Record<K, string>> = {};
  for (const field of Object.keys(values) as K[]) {
    const value = values[field].trim();
    if (value) {
      fields[field] = value;
    }
  }
  return fields;
}

/** Nothing filled in (sex aside, which has a default). */
export function isBlank(values: PersonFieldValues): boolean {
  return Object.keys(filledFields({ ...values, sex: '' })).length === 0;
}

/** Fields of a contribution that have a value, in display order. */
export function presentFields(fields: ContributionFieldsDto): ContributionField[] {
  return CONTRIBUTION_FIELDS.filter((field) => fields[field] !== undefined);
}

export const CONTRIBUTION_STATUSES: readonly ContributionStatus[] = [
  'pending',
  'approved',
  'rejected',
  'exported',
  'integrated',
];

const STATUS_BADGES: Record<ContributionStatus, string> = {
  pending: 'badge-warning',
  approved: 'badge-info',
  rejected: 'badge-danger',
  exported: 'badge-info',
  integrated: 'badge-success',
};

/** CSS classes of a contribution status badge. */
export function statusBadge(status: ContributionStatus): string {
  return `badge ${STATUS_BADGES[status]}`;
}
