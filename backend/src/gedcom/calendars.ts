import type { Calendar, PartialDate } from '@genealogie/shared';

/**
 * Converts dates from the various GEDCOM calendars to the Gregorian calendar,
 * via the Julian day number (JDN). Unknown parts (day, month) stay unknown:
 * only the year (and the month when possible) is converted.
 */

function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

function julianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
}

function jdnToGregorian(jdn: number): Required<PartialDate> {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

/**
 * 1 Vendémiaire of years I to XIV, as historically applied
 * (leap years III, VII and XI).
 */
const REPUBLICAN_NEW_YEAR: Record<number, [number, number, number]> = {
  1: [1792, 9, 22],
  2: [1793, 9, 22],
  3: [1794, 9, 22],
  4: [1795, 9, 23],
  5: [1796, 9, 22],
  6: [1797, 9, 22],
  7: [1798, 9, 22],
  8: [1799, 9, 23],
  9: [1800, 9, 23],
  10: [1801, 9, 23],
  11: [1802, 9, 23],
  12: [1803, 9, 24],
  13: [1804, 9, 23],
  14: [1805, 9, 23],
};

function republicanNewYearJdn(year: number): number {
  const known = REPUBLICAN_NEW_YEAR[year];
  if (known) {
    return gregorianToJdn(...known);
  }
  // Outside the period of use: extrapolate at 365.25 days per year.
  return gregorianToJdn(1792, 9, 22) + Math.round((year - 1) * 365.25);
}

export function toGregorian(date: PartialDate, calendar: Calendar): PartialDate {
  switch (calendar) {
    case 'gregorian':
      return date;
    case 'julian': {
      if (date.month === undefined) {
        return date;
      }
      // Unknown day: convert the middle of the month then drop the day.
      const converted = jdnToGregorian(julianToJdn(date.year, date.month, date.day ?? 15));
      return date.day === undefined ? { year: converted.year, month: converted.month } : converted;
    }
    case 'french-republican': {
      const month = date.month ?? 1;
      const day = date.day ?? 1;
      const converted = jdnToGregorian(republicanNewYearJdn(date.year) + (month - 1) * 30 + day - 1);
      if (date.month === undefined) {
        return { year: converted.year };
      }
      return date.day === undefined ? { year: converted.year, month: converted.month } : converted;
    }
    case 'hebrew':
      // Approximation: the Hebrew year starts in autumn.
      return { year: date.year - 3760 };
  }
}
