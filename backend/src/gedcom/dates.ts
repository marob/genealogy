import { type Calendar, type DateQualifier, type GenealogyDate, type PartialDate, sortKey } from '@genealogie/shared';
import { toGregorian } from './calendars.js';

/**
 * Parses GEDCOM 5.5.x / 7.0 DATE values:
 * `[@#Dcalendar@] [qualifier] [[day] month] year[/yy] [B.C.]`, ranges
 * `BET … AND …`, periods `FROM … TO …`, interpreted dates `INT … (text)` and
 * free-text phrases `(text)`.
 */

const MONTHS: Record<Calendar, string[]> = {
  gregorian: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
  julian: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
  'french-republican': [
    'VEND',
    'BRUM',
    'FRIM',
    'NIVO',
    'PLUV',
    'VENT',
    'GERM',
    'FLOR',
    'PRAI',
    'MESS',
    'THER',
    'FRUC',
    'COMP',
  ],
  hebrew: ['TSH', 'CSH', 'KSL', 'TVT', 'SHV', 'ADR', 'ADS', 'NSN', 'IYR', 'SVN', 'TMZ', 'AAV', 'ELL'],
};

const CALENDAR_ESCAPES: Record<string, Calendar> = {
  '@#DGREGORIAN@': 'gregorian',
  '@#DJULIAN@': 'julian',
  '@#DFRENCH R@': 'french-republican',
  '@#DHEBREW@': 'hebrew',
  // GEDCOM 7
  GREGORIAN: 'gregorian',
  JULIAN: 'julian',
  FRENCH_R: 'french-republican',
  HEBREW: 'hebrew',
};

const SIMPLE_QUALIFIERS: Record<string, DateQualifier> = {
  ABT: 'about',
  CAL: 'calculated',
  EST: 'estimated',
  BEF: 'before',
  AFT: 'after',
  INT: 'about',
};

export interface ParsedDate {
  date: GenealogyDate;
  /** Gregorian start (or single) date, for sorting and computations. */
  gregorianStart?: PartialDate;
  gregorianEnd?: PartialDate;
  /** Gregorian YYYYMMDD sort key. */
  sortKey?: number;
}

interface CalendarDate {
  calendar: Calendar;
  date: PartialDate;
}

function parseCalendarDate(input: string, defaultCalendar: Calendar): CalendarDate | undefined {
  let rest = input.trim().toUpperCase();
  let calendar = defaultCalendar;
  for (const [escape, cal] of Object.entries(CALENDAR_ESCAPES)) {
    if (rest.startsWith(escape + ' ')) {
      calendar = cal;
      rest = rest.slice(escape.length).trim();
      break;
    }
  }

  const bcSuffix = /\s*(B\.?C\.?|BCE)$/.exec(rest);
  if (bcSuffix) {
    rest = rest.slice(0, bcSuffix.index);
  }

  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) {
    return undefined;
  }

  // Year, possibly a dual year ("1720/21": the modern year is the second one).
  const yearMatch = /^(\d{1,4})(?:\/(\d{1,2}))?$/.exec(tokens.at(-1)!);
  if (!yearMatch) {
    return undefined;
  }
  let year = Number(yearMatch[1]);
  if (yearMatch[2]) {
    year += 1;
  }
  if (bcSuffix) {
    year = -year;
  }

  const date: PartialDate = { year };
  if (tokens.length >= 2) {
    let monthIndex = MONTHS[calendar].indexOf(tokens.at(-2)!);
    // Month from another calendar without an explicit escape: detect it.
    if (monthIndex < 0 && calendar === defaultCalendar) {
      for (const cal of ['french-republican', 'hebrew'] as const) {
        const index = MONTHS[cal].indexOf(tokens.at(-2)!);
        if (index >= 0) {
          calendar = cal;
          monthIndex = index;
          break;
        }
      }
    }
    if (monthIndex < 0) {
      return undefined;
    }
    date.month = monthIndex + 1;
  }
  if (tokens.length === 3) {
    const day = Number(tokens[0]);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return undefined;
    }
    date.day = day;
  }
  return { calendar, date };
}

function build(
  original: string,
  qualifier: DateQualifier,
  start: CalendarDate | undefined,
  end?: CalendarDate,
): ParsedDate {
  const calendar = start?.calendar ?? end?.calendar ?? 'gregorian';
  const date: GenealogyDate = { original, qualifier, calendar };
  if (start) {
    date.start = start.date;
  }
  if (end) {
    date.end = end.date;
  }
  const result: ParsedDate = { date };
  if (start) {
    result.gregorianStart = toGregorian(start.date, start.calendar);
  }
  if (end) {
    result.gregorianEnd = toGregorian(end.date, end.calendar);
  }
  const reference = result.gregorianStart ?? result.gregorianEnd;
  if (reference) {
    result.sortKey = sortKey(reference);
  }
  return result;
}

/**
 * Parses a DATE value. Returns `undefined` if the value is empty; an
 * unrecognized value is kept as free text (`phrase`).
 */
export function parseGedcomDate(value: string | undefined): ParsedDate | undefined {
  const original = (value ?? '').trim().replace(/\s+/g, ' ');
  if (!original) {
    return undefined;
  }
  const upper = original.toUpperCase();

  // Free text only: "(during the war)".
  if (/^\(.*\)$/.test(original)) {
    return build(original, 'phrase', undefined);
  }

  let match = /^BET (.+) AND (.+)$/.exec(upper);
  if (match) {
    const start = parseCalendarDate(match[1]!, 'gregorian');
    const end = parseCalendarDate(match[2]!, start?.calendar ?? 'gregorian');
    return start && end ? build(original, 'between', start, end) : build(original, 'phrase', undefined);
  }

  match = /^FROM (.+?)(?: TO (.+))?$/.exec(upper);
  if (match) {
    const start = parseCalendarDate(match[1]!, 'gregorian');
    const end = match[2] ? parseCalendarDate(match[2], start?.calendar ?? 'gregorian') : undefined;
    if (!start || (match[2] && !end)) {
      return build(original, 'phrase', undefined);
    }
    return end ? build(original, 'from-to', start, end) : build(original, 'from', start);
  }

  match = /^TO (.+)$/.exec(upper);
  if (match) {
    const end = parseCalendarDate(match[1]!, 'gregorian');
    return end ? build(original, 'to', end) : build(original, 'phrase', undefined);
  }

  match = /^(ABT|CAL|EST|BEF|AFT|INT)\.? (.+)$/.exec(upper);
  if (match) {
    // INT 1850 (around 1850 according to the record): ignore the text in parentheses.
    const dateText = match[2]!.replace(/\(.*\)$/, '').trim();
    const start = parseCalendarDate(dateText, 'gregorian');
    return start ? build(original, SIMPLE_QUALIFIERS[match[1]!]!, start) : build(original, 'phrase', undefined);
  }

  const exact = parseCalendarDate(upper, 'gregorian');
  return exact ? build(original, 'exact', exact) : build(original, 'phrase', undefined);
}
