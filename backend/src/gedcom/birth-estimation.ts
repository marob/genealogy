import type { ParsedDate } from './dates.js';
import type { FamilyRecord, PersonRecord } from './model.js';

/**
 * Estimation de la date de naissance de chaque personne, utilisée par la
 * règle de confidentialité « né il y a moins de 100 ans ».
 *
 * Les clés sont au format AAAAMMJJ ; les parties inconnues sont complétées
 * au plus tard (31 décembre), ce qui ne peut que rendre la règle plus stricte.
 *
 * 1. Naissance ou baptême datés : clé exacte.
 * 2. Sinon, minimum entre :
 *    - les autres événements datés de la personne et de ses unions (on naît
 *      forcément avant de se marier, mourir…) ;
 *    - la naissance des parents + 30 ans ;
 *    - la naissance des conjoints ;
 *    - la naissance des enfants − 30 ans.
 *    Le calcul est itéré pour propager les estimations dans l'arbre.
 * 3. Sinon : inconnue (la personne est alors traitée comme contemporaine).
 */

const BIRTH_TYPES = ['BIRT', 'CHR', 'BAPM'];
const GENERATION = 30 * 10_000;

function privacyKey(parsed: ParsedDate | undefined): number | undefined {
  const date = parsed?.gregorianEnd ?? parsed?.gregorianStart;
  if (!date) {
    return undefined;
  }
  return date.year * 10_000 + (date.month ?? 12) * 100 + (date.day ?? 31);
}

function minKey(keys: (number | undefined)[]): number | undefined {
  const defined = keys.filter((key): key is number => key !== undefined);
  return defined.length ? Math.min(...defined) : undefined;
}

export function estimateBirthKeys(
  persons: PersonRecord[],
  families: FamilyRecord[],
): Map<string, { key: number; estimated: boolean }> {
  const result = new Map<string, { key: number; estimated: boolean }>();
  const familyById = new Map(families.map((family) => [family.id, family]));
  const unionsByPerson = new Map<string, FamilyRecord[]>();
  for (const family of families) {
    for (const partnerId of [family.partner1Id, family.partner2Id]) {
      if (partnerId) {
        unionsByPerson.set(partnerId, [...(unionsByPerson.get(partnerId) ?? []), family]);
      }
    }
  }

  const toEstimate: PersonRecord[] = [];
  for (const person of persons) {
    const birthEvent = BIRTH_TYPES.map((type) => person.events.find((e) => e.type === type && privacyKey(e.date))).find(
      Boolean,
    );
    const key = privacyKey(birthEvent?.date);
    if (key === undefined) {
      toEstimate.push(person);
    } else {
      result.set(person.id, { key, estimated: false });
    }
  }

  const upperBounds = new Map<string, number | undefined>(
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
  const keyOf = (id: string | undefined): number | undefined => (id ? result.get(id)?.key : undefined);

  for (let pass = 0, changed = true; changed && pass < 50; pass++) {
    changed = false;
    for (const person of toEstimate) {
      const parents = person.parentFamilies
        .map(({ familyId }) => familyById.get(familyId))
        .flatMap((family) => [family?.partner1Id, family?.partner2Id]);
      const unions = unionsByPerson.get(person.id) ?? [];
      const spouses = unions.map((family) => (family.partner1Id === person.id ? family.partner2Id : family.partner1Id));
      const childIds = unions.flatMap((family) => family.childIds);

      const parentKey = minKey(parents.map(keyOf));
      const childKey = minKey(childIds.map(keyOf));
      const candidate = minKey([
        upperBounds.get(person.id),
        parentKey === undefined ? undefined : parentKey + GENERATION,
        minKey(spouses.map(keyOf)),
        childKey === undefined ? undefined : childKey - GENERATION,
      ]);
      const current = result.get(person.id)?.key;
      if (candidate !== undefined && (current === undefined || candidate < current)) {
        result.set(person.id, { key: candidate, estimated: true });
        changed = true;
      }
    }
  }
  return result;
}
