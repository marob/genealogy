/** Years added to approximate dates: "about 1925" may well be 1927. */
const APPROXIMATION_MARGIN = 5 * 10_000;
const APPROXIMATE = new Set(['about', 'estimated', 'calculated']);
const OPEN_ENDED = new Set(['after', 'from']);

/**
 * Latest possible day (YYYYMMDD) of a date, used by the "born less than
 * 100 years ago" privacy rule. Keys are Gregorian with 00 for unknown parts.
 *
 * - unknown parts are filled with their latest value (December 31st);
 * - approximate dates get a safety margin;
 * - open-ended dates ("after 1920", "from 1920") have no upper bound:
 *   `Infinity`, i.e. always contemporary.
 */
export function latestKey(
  qualifier: string | null | undefined,
  startKey: number | null | undefined,
  endKey: number | null | undefined,
): number | undefined {
  if (startKey === null || startKey === undefined) {
    return undefined;
  }
  if (qualifier && OPEN_ENDED.has(qualifier) && (endKey === null || endKey === undefined)) {
    return Number.POSITIVE_INFINITY;
  }
  const key = fillUnknownParts(Math.max(startKey, endKey ?? startKey));
  return qualifier && APPROXIMATE.has(qualifier) ? key + APPROXIMATION_MARGIN : key;
}

function fillUnknownParts(key: number): number {
  const year = Math.floor(key / 10_000);
  const month = Math.floor(key / 100) % 100 || 12;
  const day = key % 100 || 31;
  return year * 10_000 + month * 100 + day;
}
