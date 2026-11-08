import { parseGedcomDate } from '../gedcom/dates.js';

/** Dates typed by members, in French or GEDCOM form, converted to GEDCOM. */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const FRENCH_MONTHS: Record<string, number> = {
  janvier: 1,
  janv: 1,
  fevrier: 2,
  fevr: 2,
  fev: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  aout: 8,
  septembre: 9,
  sept: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  dec: 12,
};
const QUALIFIERS: [RegExp, string][] = [
  [/^(vers|environ|env\.?|ca\.?|circa|~)\s*/, 'ABT'],
  [/^(avant|av\.?)\s+/, 'BEF'],
  [/^(apres|ap\.?)\s+/, 'AFT'],
  [/^(estime|estimee)\s+/, 'EST'],
];

/** One date without qualifier: "12/03/1850", "03/1850", "1850", "12 mars 1850". */
function simpleDate(text: string): string | undefined {
  const numeric = /^(?:(\d{1,2})[/.-])?(?:(\d{1,2})[/.-])?(\d{3,4})$/.exec(text);
  if (numeric) {
    const [, first, second, year] = numeric;
    const day = second ? first : undefined;
    const month = second ?? first;
    return format(day, month, year!);
  }
  const words = /^(?:(\d{1,2})(?:er)?\s+)?([a-z]+)\.?\s+(\d{3,4})$/.exec(text);
  const month = words ? FRENCH_MONTHS[words[2]!] : undefined;
  return words && month ? format(words[1], String(month), words[3]!) : undefined;
}

function format(day: string | undefined, month: string | undefined, year: string): string | undefined {
  const monthNumber = month === undefined ? undefined : Number(month);
  const dayNumber = day === undefined ? undefined : Number(day);
  if (monthNumber !== undefined && (monthNumber < 1 || monthNumber > 12)) {
    return undefined;
  }
  if (dayNumber !== undefined && (dayNumber < 1 || dayNumber > 31)) {
    return undefined;
  }
  return [dayNumber, monthNumber === undefined ? undefined : MONTHS[monthNumber - 1], Number(year)]
    .filter((part) => part !== undefined)
    .join(' ');
}

function frenchDate(text: string): string | undefined {
  const range = /^entre\s+(.+?)\s+et\s+(.+)$/.exec(text);
  if (range) {
    const [start, end] = [simpleDate(range[1]!), simpleDate(range[2]!)];
    return start && end ? `BET ${start} AND ${end}` : undefined;
  }
  const period = /^de\s+(.+?)\s+a\s+(.+)$/.exec(text);
  if (period) {
    const [start, end] = [simpleDate(period[1]!), simpleDate(period[2]!)];
    return start && end ? `FROM ${start} TO ${end}` : undefined;
  }
  for (const [pattern, qualifier] of QUALIFIERS) {
    const match = pattern.exec(text);
    if (match) {
      const date = simpleDate(text.slice(match[0].length));
      return date ? `${qualifier} ${date}` : undefined;
    }
  }
  return simpleDate(text);
}

/**
 * GEDCOM form of a typed date, or undefined if it is not understood. An empty
 * text gives an empty string (date removed).
 */
export function toGedcomDate(text: string): string | undefined {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return '';
  }
  const normalized = trimmed.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const french = frenchDate(normalized);
  if (french) {
    return french;
  }
  // Already in GEDCOM form ("12 MAR 1850", "ABT 1850", "BET 1850 AND 1855"…).
  const gedcom = trimmed.toUpperCase();
  const parsed = parseGedcomDate(gedcom);
  return parsed && parsed.date.qualifier !== 'phrase' ? gedcom : undefined;
}
