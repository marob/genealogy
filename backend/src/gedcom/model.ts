import type { Sex } from '@genealogie/shared';
import type { ParsedDate } from './dates.js';
import type { ParsedPlace } from './places.js';

/** Modèle intermédiaire issu d'un fichier GEDCOM, prêt à être enregistré. */

export interface EventRecord {
  type: string;
  value?: string;
  date?: ParsedDate;
  /** Libellé complet du lieu (clé dans `GenealogyData.places`). */
  place?: string;
}

export interface PersonRecord {
  id: string;
  givenNames: string;
  surname: string;
  sex: Sex;
  occupation?: string;
  note?: string;
  events: EventRecord[];
  /** Familles dont la personne est l'enfant. */
  parentFamilies: { familyId: string; pedigree?: string }[];
}

export interface FamilyRecord {
  id: string;
  partner1Id?: string;
  partner2Id?: string;
  childIds: string[];
  events: EventRecord[];
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
  /** Personnes dont l'année de naissance est connue ou a pu être estimée. */
  datedPersons: number;
  /** Tags rencontrés mais non importés, avec leur nombre d'occurrences. */
  ignoredTags: Record<string, number>;
}

export interface GenealogyData {
  header: GedcomHeader;
  persons: PersonRecord[];
  families: FamilyRecord[];
  places: Map<string, ParsedPlace>;
  /** Clé de naissance AAAAMMJJ (connue ou estimée) par personne. */
  birthKeys: Map<string, { key: number; estimated: boolean }>;
  stats: ImportStats;
  warnings: string[];
}
