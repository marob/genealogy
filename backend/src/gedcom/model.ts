import type { Sex } from '@genealogie/shared';
import type { ParsedDate } from './dates.js';
import type { ParsedPlace } from './places.js';

/** Intermediate model built from a GEDCOM file, ready to be saved. */

export interface EventRecord {
  type: string;
  value?: string;
  date?: ParsedDate;
  /** Full place label (key in `GenealogyData.places`). */
  place?: string;
}

export interface MediaRecord {
  /** File reference as written in the GEDCOM (path of the author's computer). */
  file: string;
  title?: string;
  /** Event the document is attached to (BIRT, MARR…), if any. */
  eventType?: string;
}

export interface PersonRecord {
  id: string;
  givenNames: string;
  surname: string;
  sex: Sex;
  occupation?: string;
  note?: string;
  events: EventRecord[];
  media: MediaRecord[];
  /** Families in which the person is a child. */
  parentFamilies: { familyId: string; pedigree?: string }[];
}

export interface FamilyRecord {
  id: string;
  partner1Id?: string;
  partner2Id?: string;
  childIds: string[];
  events: EventRecord[];
  media: MediaRecord[];
}

interface GedcomHeader {
  sourceSoftware?: string;
  gedcomVersion?: string;
}

interface ImportStats {
  persons: number;
  families: number;
  events: number;
  places: number;
  /** Persons whose birth year is known or could be estimated. */
  datedPersons: number;
  /** Referenced documents (OBJE files). */
  media: number;
  /** Tags encountered but not imported, with their number of occurrences. */
  ignoredTags: Record<string, number>;
}

export interface GenealogyData {
  header: GedcomHeader;
  persons: PersonRecord[];
  families: FamilyRecord[];
  places: Map<string, ParsedPlace>;
  /** YYYYMMDD birth key (known or estimated) per person. */
  birthKeys: Map<string, { key: number; estimated: boolean }>;
  stats: ImportStats;
  warnings: string[];
}
