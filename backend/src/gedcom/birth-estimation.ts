import { sortKey } from '@genealogie/shared';
import type { ParsedDate } from './dates.js';
import type { FamilyRecord, PersonRecord } from './model.js';
import { latestKey } from './privacy-bound.js';

/**
 * Estimates the latest possible birth date of each person, used by the
 * "born less than 100 years ago" privacy rule.
 *
 * Only sound upper bounds are used, so that an estimate can never expose a
 * contemporary:
 * 1. Dated birth or baptism.
 * 2. Otherwise, the earliest of:
 *    - the other dated events of the person and of their unions (one is
 *      necessarily born before marrying, dying...);
 *    - the children's birth − 12 years.
 *    The computation is iterated to propagate estimates up the tree.
 *    Guesses such as "partner's birth" or "parent's birth + 30 years" are
 *    not bounds (a partner can be much younger) and are not used.
 * 3. Otherwise: unknown (the person is then treated as contemporary).
 */

const BIRTH_TYPES = ['BIRT', 'CHR', 'BAPM'];
const MIN_PARENT_AGE = 12 * 10_000;

function privacyKey(parsed: ParsedDate | undefined): number | undefined {
  if (!parsed) {
    return undefined;
  }
  const { gregorianStart: start, gregorianEnd: end } = parsed;
  return latestKey(parsed.date.qualifier, start && sortKey(start), end && sortKey(end));
}

/** Earliest finite key (`Infinity` means "no bound"). */
function minKey(keys: Iterable<number | undefined>): number | undefined {
  let min: number | undefined;
  for (const key of keys) {
    if (key !== undefined && Number.isFinite(key) && (min === undefined || key < min)) {
      min = key;
    }
  }
  return min;
}

export function estimateBirthKeys(
  persons: PersonRecord[],
  families: FamilyRecord[],
): Map<string, { key: number; estimated: boolean }> {
  const result = new Map<string, { key: number; estimated: boolean }>();
  const unionsByPerson = new Map<string, FamilyRecord[]>();
  for (const family of families) {
    for (const partnerId of [family.partner1Id, family.partner2Id]) {
      if (partnerId) {
        const unions = unionsByPerson.get(partnerId);
        if (unions) {
          unions.push(family);
        } else {
          unionsByPerson.set(partnerId, [family]);
        }
      }
    }
  }

  const toEstimate: PersonRecord[] = [];
  for (const person of persons) {
    const key = minKey(
      BIRTH_TYPES.flatMap((type) => person.events.filter((e) => e.type === type).map((e) => privacyKey(e.date))),
    );
    if (key === undefined) {
      toEstimate.push(person);
    } else {
      result.set(person.id, { key, estimated: false });
    }
  }

  const ownBounds = new Map<string, number | undefined>(
    toEstimate.map((person) => [
      person.id,
      minKey([
        ...person.events.map((event) => privacyKey(event.date)),
        ...(unionsByPerson.get(person.id) ?? []).flatMap((family) =>
          family.events.map((event) => privacyKey(event.date)),
        ),
      ]),
    ]),
  );

  // Each pass propagates children's estimates one generation up.
  for (let pass = 0, changed = true; changed && pass < 50; pass++) {
    changed = false;
    for (const person of toEstimate) {
      const childIds = (unionsByPerson.get(person.id) ?? []).flatMap((family) => family.childIds);
      const childKey = minKey(childIds.map((id) => result.get(id)?.key));
      const candidate = minKey([ownBounds.get(person.id), childKey && childKey - MIN_PARENT_AGE]);
      const current = result.get(person.id)?.key;
      if (candidate !== undefined && (current === undefined || candidate < current)) {
        result.set(person.id, { key: candidate, estimated: true });
        changed = true;
      }
    }
  }
  return result;
}
