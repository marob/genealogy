/**
 * Découpage des lieux GEDCOM (`PLAC`) en juridictions, guidé par le format
 * déclaré dans l'en-tête (`HEAD.PLAC.FORM`) quand il existe.
 */

export interface ParsedPlace {
  fullName: string;
  locality?: string;
  postalCode?: string;
  county?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

type PlaceField = 'locality' | 'postalCode' | 'county' | 'region' | 'country';

const FIELD_PATTERNS: [PlaceField, RegExp][] = [
  ['postalCode', /code|zip|postal|insee/i],
  ['locality', /town|city|ville|commune|village|locality|lieu|paroisse|parish/i],
  ['county', /county|d[ée]partement|dept|comt[ée]|province/i],
  ['region', /region|r[ée]gion|state|[ée]tat/i],
  ['country', /country|pays|nation/i],
];

/**
 * Format par défaut quand le fichier n'en déclare pas : celui des logiciels
 * francophones courants (Heredis…) au-delà de 4 parties, sinon commune…pays.
 */
const DEFAULT_LONG_FORM: (PlaceField | undefined)[] = ['locality', 'postalCode', 'county', 'region', 'country'];

export function parsePlaceForm(form: string | undefined): (PlaceField | undefined)[] | undefined {
  if (!form?.trim()) {
    return undefined;
  }
  const used = new Set<PlaceField>();
  return form.split(',').map((jurisdiction) => {
    const field = FIELD_PATTERNS.find(([name, pattern]) => !used.has(name) && pattern.test(jurisdiction))?.[0];
    if (field) {
      used.add(field);
    }
    return field;
  });
}

function parseCoordinate(value: string | undefined, positive: string, negative: string): number | undefined {
  const match = /^\s*([NSEW])?\s*(-?\d+(?:[.,]\d+)?)\s*$/i.exec(value ?? '');
  if (!match) {
    return undefined;
  }
  const number = Number(match[2]!.replace(',', '.'));
  const direction = match[1]?.toUpperCase();
  if (direction === negative) {
    return -Math.abs(number);
  }
  if (direction === positive || direction === undefined) {
    return number;
  }
  return undefined;
}

export function parsePlace(
  value: string,
  form: (PlaceField | undefined)[] | undefined,
  coordinates?: { latitude?: string; longitude?: string },
): ParsedPlace | undefined {
  const fullName = value.trim().replace(/\s+/g, ' ');
  if (!fullName || /^[\s,]*$/.test(fullName)) {
    return undefined;
  }
  const parts = fullName.split(',').map((part) => part.trim());
  const place: ParsedPlace = { fullName };

  const fields =
    form ??
    (parts.length >= 5
      ? DEFAULT_LONG_FORM
      : parts.length === 1
        ? ['locality']
        : ['locality', ...Array<undefined>(parts.length - 2), 'country']);

  parts.forEach((part, index) => {
    const field = fields[index];
    if (part && field) {
      place[field] = part;
    }
  });

  const latitude = parseCoordinate(coordinates?.latitude, 'N', 'S');
  const longitude = parseCoordinate(coordinates?.longitude, 'E', 'W');
  if (latitude !== undefined && longitude !== undefined) {
    place.latitude = latitude;
    place.longitude = longitude;
  }
  return place;
}
