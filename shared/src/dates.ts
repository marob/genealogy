/**
 * Genealogical date model.
 *
 * A GEDCOM date is a calendar date, often partial or approximate
 * ("ABT 1850", "BET 1700 AND 1710", "12 VEND 3" in the French Republican
 * calendar…). It is never converted to a JavaScript `Date` object, which
 * avoids any time-zone shift.
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
  /** 1 to 12 (or 13 for the French Republican calendar). */
  month?: number;
  day?: number;
}

export interface GenealogyDate {
  /** Original GEDCOM value. */
  original: string;
  qualifier: DateQualifier;
  calendar: Calendar;
  start?: PartialDate;
  /** Second bound for `between` and `from-to`. */
  end?: PartialDate;
}

/** YYYYMMDD sort key (00 for unknown parts). */
export function sortKey(date: PartialDate): number {
  return date.year * 10_000 + (date.month ?? 0) * 100 + (date.day ?? 0);
}
