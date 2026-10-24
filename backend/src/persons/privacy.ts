/**
 * Privacy rule: the details of persons born less than 100 years ago are
 * only visible to authorized users.
 */

const HUNDRED_YEARS = 100 * 10_000;

/** Today's date as YYYYMMDD in the reference time zone. */
export function todayKey(timeZone: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return Number(`${parts.year}${parts.month}${parts.day}`);
}

export class PrivacyPolicy {
  /** YYYYMMDD key beyond which a birth is "contemporary". */
  readonly threshold: number;

  constructor(
    readonly canSeeContemporary: boolean,
    today: number,
  ) {
    this.threshold = today - HUNDRED_YEARS;
  }

  /** An unknown date is considered contemporary. */
  isContemporary(birthKey: number | null | undefined): boolean {
    return birthKey === null || birthKey === undefined || birthKey > this.threshold;
  }

  isPersonRestricted(birthKey: number | null | undefined): boolean {
    return !this.canSeeContemporary && this.isContemporary(birthKey);
  }

  /** Privacy key of an event date (unknown parts filled with the latest value). */
  static eventKey(event: { dateEndYear: number | null; dateSortKey: number | null }): number | undefined {
    if (event.dateSortKey === null) {
      return undefined;
    }
    // The sort key is Gregorian: fill in the unknown parts.
    const year = Math.floor(event.dateSortKey / 10_000);
    const month = Math.floor(event.dateSortKey / 100) % 100 || 12;
    const day = event.dateSortKey % 100 || 31;
    const endYear = event.dateEndYear ?? year;
    return Math.max(year, endYear) * 10_000 + month * 100 + day;
  }
}
