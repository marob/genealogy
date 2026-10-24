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

/** Removes a leading calendar escape (`@#DJULIAN@`, `JULIAN`...). */
function stripCalendarEscape(text: string, defaultCalendar: Calendar): { calendar: Calendar; rest: string } {
  for (const [escape, calendar] of Object.entries(CALENDAR_ESCAPES)) {
    if (text.startsWith(escape + ' ')) {
      return { calendar, rest: text.slice(escape.length).trim() };
    }
  }
  return { calendar: defaultCalendar, rest: text };
}

/** Year, possibly a dual year ("1720/21": the modern year is the second one). */
function parseYear(token: string, beforeChrist: boolean): number | undefined {
  const yearMatch = /^(\d{1,4})(?:\/(\d{1,2}))?$/.exec(token);
  if (!yearMatch) {
    return undefined;
  }
  const year = Number(yearMatch[1]) + (yearMatch[2] ? 1 : 0);
  return beforeChrist ? -year : year;
}

/** Month index (0-based) in its calendar, or `undefined` if unknown. */
function parseMonth(
  token: string,
  calendar: Calendar,
  defaultCalendar: Calendar,
): { calendar: Calendar; monthIndex: number } | undefined {
  const monthIndex = MONTHS[calendar].indexOf(token);
  if (monthIndex >= 0) {
    return { calendar, monthIndex };
  }
  // Month from another calendar without an explicit escape: detect it.
  if (calendar !== defaultCalendar) {
    return undefined;
  }
  for (const cal of ['french-republican', 'hebrew'] as const) {
    const index = MONTHS[cal].indexOf(token);
    if (index >= 0) {
      return { calendar: cal, monthIndex: index };
    }
  }
  return undefined;
}

function parseDay(token: string): number | undefined {
  const day = Number(token);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : undefined;
}

function parseCalendarDate(input: string, defaultCalendar: Calendar): CalendarDate | undefined {
  let { calendar, rest } = stripCalendarEscape(input.trim().toUpperCase(), defaultCalendar);

  // Linear-time patterns (no backtracking on long whitespace runs).
  rest = rest.trimEnd();
  const bcSuffix = /(?:B\.?C\.?|BCE)$/.exec(rest);
  if (bcSuffix) {
    rest = rest.slice(0, bcSuffix.index).trimEnd();
  }

  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) {
    return undefined;
  }

  const year = parseYear(tokens.at(-1)!, !!bcSuffix);
  if (year === undefined) {
    return undefined;
  }
  const date: PartialDate = { year };
  if (tokens.length >= 2) {
    const month = parseMonth(tokens.at(-2)!, calendar, defaultCalendar);
    if (!month) {
      return undefined;
    }
    calendar = month.calendar;
    date.month = month.monthIndex + 1;
  }
  if (tokens.length === 3) {
    const day = parseDay(tokens[0]!);
    if (day === undefined) {
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

const phrase = (original: string): ParsedDate => build(original, 'phrase', undefined);

/** `BET … AND …` range. */
function parseBetween(original: string, match: RegExpExecArray): ParsedDate | undefined {
  const start = parseCalendarDate(match[1]!, 'gregorian');
  const end = parseCalendarDate(match[2]!, start?.calendar ?? 'gregorian');
  return start && end ? build(original, 'between', start, end) : undefined;
}

/** `FROM … [TO …]` period. */
function parsePeriod(original: string, match: RegExpExecArray): ParsedDate | undefined {
  const start = parseCalendarDate(match[1]!, 'gregorian');
  const end = match[2] ? parseCalendarDate(match[2], start?.calendar ?? 'gregorian') : undefined;
  if (!start || (match[2] && !end)) {
    return undefined;
  }
  return end ? build(original, 'from-to', start, end) : build(original, 'from', start);
}

/** `TO …` period. */
function parsePeriodEnd(original: string, match: RegExpExecArray): ParsedDate | undefined {
  const end = parseCalendarDate(match[1]!, 'gregorian');
  return end ? build(original, 'to', end) : undefined;
}

/** `ABT`, `CAL`, `EST`, `BEF`, `AFT` or `INT` followed by a date. */
function parseQualified(original: string, match: RegExpExecArray): ParsedDate | undefined {
  // INT 1850 (around 1850 according to the record): ignore the text in parentheses.
  const dateText = withoutTrailingParenthesis(match[2]!).trim();
  const start = parseCalendarDate(dateText, 'gregorian');
  return start ? build(original, SIMPLE_QUALIFIERS[match[1]!]!, start) : undefined;
}

/**
 * Forms of a DATE value (upper case), tried in order before an exact date. A
 * value matching a form but whose dates are unreadable is kept as free text.
 */
const DATE_FORMS: [RegExp, (original: string, match: RegExpExecArray) => ParsedDate | undefined][] = [
  [/^BET (.+) AND (.+)$/, parseBetween],
  [/^FROM (.+?)(?: TO (.+))?$/, parsePeriod],
  [/^TO (.+)$/, parsePeriodEnd],
  [/^(ABT|CAL|EST|BEF|AFT|INT)\.? (.+)$/, parseQualified],
];

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
    return phrase(original);
  }

  for (const [pattern, parse] of DATE_FORMS) {
    const match = pattern.exec(upper);
    if (match) {
      return parse(original, match) ?? phrase(original);
    }
  }
  const exact = parseCalendarDate(upper, 'gregorian');
  return exact ? build(original, 'exact', exact) : phrase(original);
}

/** Removes a trailing "(…)" comment, from its first opening parenthesis. */
function withoutTrailingParenthesis(text: string): string {
  const open = text.indexOf('(');
  return open >= 0 && text.trimEnd().endsWith(')') ? text.slice(0, open) : text;
}
