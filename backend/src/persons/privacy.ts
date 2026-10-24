/**
 * Règle de confidentialité : le détail des personnes nées il y a moins de
 * 100 ans n'est visible que des utilisateurs autorisés.
 */

const HUNDRED_YEARS = 100 * 10_000;

/** Date du jour AAAAMMJJ dans le fuseau horaire de référence. */
export function todayKey(timeZone: string, now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return Number(`${parts.year}${parts.month}${parts.day}`);
}

export class PrivacyPolicy {
  /** Clé AAAAMMJJ au-delà de laquelle une naissance est « contemporaine ». */
  readonly threshold: number;

  constructor(
    readonly canSeeContemporary: boolean,
    today: number,
  ) {
    this.threshold = today - HUNDRED_YEARS;
  }

  /** Une date inconnue est considérée comme contemporaine. */
  isContemporary(birthKey: number | null | undefined): boolean {
    return birthKey === null || birthKey === undefined || birthKey > this.threshold;
  }

  isPersonRestricted(birthKey: number | null | undefined): boolean {
    return !this.canSeeContemporary && this.isContemporary(birthKey);
  }

  /** Clé de confidentialité d'une date d'événement (parties inconnues au plus tard). */
  static eventKey(event: { dateEndYear: number | null; dateSortKey: number | null }): number | undefined {
    if (event.dateSortKey === null) {
      return undefined;
    }
    // La clé de tri est grégorienne : on complète les parties inconnues.
    const year = Math.floor(event.dateSortKey / 10_000);
    const month = Math.floor(event.dateSortKey / 100) % 100 || 12;
    const day = event.dateSortKey % 100 || 31;
    const endYear = event.dateEndYear ?? year;
    return Math.max(year, endYear) * 10_000 + month * 100 + day;
  }
}
