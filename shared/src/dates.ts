/**
 * Modèle de date généalogique.
 *
 * Une date GEDCOM est une date calendaire, souvent partielle ou approximative
 * (« ABT 1850 », « BET 1700 AND 1710 », « 12 VEND 3 » en calendrier
 * républicain…). Elle n'est jamais convertie en objet `Date` JavaScript, ce
 * qui éviterait tout décalage lié au fuseau horaire.
 */

export type DateQualifier =
  | 'exact'
  | 'about'
  | 'calculated'
  | 'estimated'
  | 'before'
  | 'after'
  | 'between'
  | 'from'
  | 'to'
  | 'from-to'
  | 'phrase';

export type Calendar = 'gregorian' | 'julian' | 'french-republican' | 'hebrew';

export interface PartialDate {
  year: number;
  /** 1 à 12 (ou 13 pour le calendrier républicain). */
  month?: number;
  day?: number;
}

export interface GenealogyDate {
  /** Valeur GEDCOM d'origine. */
  original: string;
  qualifier: DateQualifier;
  calendar: Calendar;
  start?: PartialDate;
  /** Seconde borne pour `between` et `from-to`. */
  end?: PartialDate;
}

/** Clé de tri AAAAMMJJ (00 pour les parties inconnues). */
export function sortKey(date: PartialDate): number {
  return date.year * 10_000 + (date.month ?? 0) * 100 + (date.day ?? 0);
}
