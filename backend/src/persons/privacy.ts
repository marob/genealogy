import { latestKey } from '../gedcom/privacy-bound.js';

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
    /** Strict mode: the identity of restricted persons is hidden too. */
    readonly hideIdentity = false,
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

  /**
   * The details of a union (events, documents) are hidden if a partner or
   * one of its events is contemporary.
   */
  isUnionRestricted(
    partnerBirthKeys: (number | null | undefined)[],
    events: { dateQualifier: string | null; dateSortKey: number | null; dateEndSortKey: number | null }[],
  ): boolean {
    return (
      !this.canSeeContemporary &&
      (partnerBirthKeys.some((key) => this.isContemporary(key)) ||
        events.some((event) => this.isContemporary(PrivacyPolicy.eventKey(event) ?? 0)))
    );
  }

  isIdentityHidden(birthKey: number | null | undefined): boolean {
    return this.hideIdentity && this.isPersonRestricted(birthKey);
  }

  /** Latest possible date of an event (`Infinity` for open-ended dates such as "after 1920"). */
  static eventKey(event: {
    dateQualifier: string | null;
    dateSortKey: number | null;
    dateEndSortKey: number | null;
  }): number | undefined {
    return latestKey(event.dateQualifier, event.dateSortKey, event.dateEndSortKey);
  }
}
