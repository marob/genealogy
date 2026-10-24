import type { GenealogyDate, PartialDate, PlaceDto } from '@genealogie/shared';

/**
 * Mise en forme des dates généalogiques dans la langue de l'interface. Les
 * dates partielles et approximatives sont restituées telles quelles
 * (« vers 1850 », « entre 1700 et 1710 », « 18 brumaire an VIII »).
 *
 * Les dates grégoriennes passent par Intl en UTC : aucun décalage de fuseau.
 */

interface DateWords {
  about: string;
  calculated: string;
  estimated: string;
  before: string;
  after: string;
  between: string;
  from: string;
  to: string;
  fromTo: string;
  republicanYear: string;
  julian: string;
  bc: string;
}

const WORDS: Partial<Record<string, DateWords>> & { en: DateWords } = {
  fr: {
    about: 'vers {a}',
    calculated: '{a} (calculé)',
    estimated: '{a} (estimé)',
    before: 'avant {a}',
    after: 'après {a}',
    between: 'entre {a} et {b}',
    from: 'depuis {a}',
    to: 'jusqu’à {a}',
    fromTo: 'de {a} à {b}',
    republicanYear: 'an {a}',
    julian: '{a} (julien)',
    bc: '{a} av. J.-C.',
  },
  en: {
    about: 'about {a}',
    calculated: '{a} (calculated)',
    estimated: '{a} (estimated)',
    before: 'before {a}',
    after: 'after {a}',
    between: 'between {a} and {b}',
    from: 'from {a}',
    to: 'until {a}',
    fromTo: 'from {a} to {b}',
    republicanYear: 'year {a}',
    julian: '{a} (Julian)',
    bc: '{a} BC',
  },
  es: {
    about: 'hacia {a}',
    calculated: '{a} (calculado)',
    estimated: '{a} (estimado)',
    before: 'antes de {a}',
    after: 'después de {a}',
    between: 'entre {a} y {b}',
    from: 'desde {a}',
    to: 'hasta {a}',
    fromTo: 'de {a} a {b}',
    republicanYear: 'año {a}',
    julian: '{a} (juliano)',
    bc: '{a} a. C.',
  },
};

const REPUBLICAN_MONTHS = [
  'vendémiaire',
  'brumaire',
  'frimaire',
  'nivôse',
  'pluviôse',
  'ventôse',
  'germinal',
  'floréal',
  'prairial',
  'messidor',
  'thermidor',
  'fructidor',
  'sans-culottide',
];

const HEBREW_MONTHS = [
  'Tishri',
  'Heshvan',
  'Kislev',
  'Tevet',
  'Shevat',
  'Adar',
  'Adar II',
  'Nisan',
  'Iyar',
  'Sivan',
  'Tamuz',
  'Av',
  'Elul',
];

function fill(template: string, a: string, b = ''): string {
  return template.replace('{a}', a).replace('{b}', b);
}

export function toRoman(value: number): string {
  const numerals: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let rest = value;
  return numerals.reduce((result, [number, numeral]) => {
    const count = Math.floor(rest / number);
    rest -= count * number;
    return result + numeral.repeat(count);
  }, '');
}

function formatPartial(date: PartialDate, calendar: GenealogyDate['calendar'], lang: string, words: DateWords): string {
  if (calendar === 'french-republican') {
    const year = fill(words.republicanYear, toRoman(date.year));
    const month = date.month ? REPUBLICAN_MONTHS[date.month - 1] : undefined;
    return [date.day, month, year].filter(Boolean).join(' ');
  }
  if (calendar === 'hebrew') {
    const month = date.month ? HEBREW_MONTHS[date.month - 1] : undefined;
    return [date.day, month, date.year].filter(Boolean).join(' ');
  }
  if (date.year < 0) {
    return fill(words.bc, String(-date.year));
  }
  let text = String(date.year);
  if (date.month) {
    const utc = new Date(Date.UTC(2000, date.month - 1, date.day ?? 1));
    utc.setUTCFullYear(date.year);
    text = new Intl.DateTimeFormat(lang, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'long',
      ...(date.day ? { day: 'numeric' } : {}),
    }).format(utc);
  }
  return calendar === 'julian' ? fill(words.julian, text) : text;
}

export function formatGenealogyDate(date: GenealogyDate | undefined, lang: string): string {
  if (!date) {
    return '';
  }
  const words = WORDS[lang] ?? WORDS.en;
  if (!date.start) {
    return date.original.replace(/^\((.*)\)$/, '$1');
  }
  const a = formatPartial(date.start, date.calendar, lang, words);
  const b = date.end ? formatPartial(date.end, date.calendar, lang, words) : '';
  switch (date.qualifier) {
    case 'about':
      return fill(words.about, a);
    case 'calculated':
      return fill(words.calculated, a);
    case 'estimated':
      return fill(words.estimated, a);
    case 'before':
      return fill(words.before, a);
    case 'after':
      return fill(words.after, a);
    case 'between':
      return fill(words.between, a, b);
    case 'from':
      return fill(words.from, a);
    case 'to':
      return fill(words.to, a);
    case 'from-to':
      return fill(words.fromTo, a, b);
    default:
      return a;
  }
}

/** Lieu court : « Lyon (69123), France », comme dans la version historique. */
export function formatPlace(place: PlaceDto | undefined): string {
  if (!place) {
    return '';
  }
  if (!place.locality) {
    return place.name;
  }
  return [place.locality, place.postalCode && `(${place.postalCode})`, place.country].filter(Boolean).join(' ');
}
