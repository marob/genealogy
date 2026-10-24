import type { GenealogyDate } from '@genealogie/shared';
import { formatGenealogyDate, formatPlace, toRoman } from './genealogy-format';

const date = (value: Partial<GenealogyDate>): GenealogyDate => ({
  original: '',
  qualifier: 'exact',
  calendar: 'gregorian',
  ...value,
});

describe('formatGenealogyDate', () => {
  it('formats a full date in each language', () => {
    const d = date({ start: { year: 1850, month: 3, day: 12 } });
    expect(formatGenealogyDate(d, 'fr')).toBe('12 mars 1850');
    expect(formatGenealogyDate(d, 'en')).toBe('March 12, 1850');
    expect(formatGenealogyDate(d, 'es')).toBe('12 de marzo de 1850');
  });

  it('never shifts the day (January 1st, December 31st)', () => {
    expect(formatGenealogyDate(date({ start: { year: 1900, month: 1, day: 1 } }), 'fr')).toBe('1 janvier 1900');
    expect(formatGenealogyDate(date({ start: { year: 1899, month: 12, day: 31 } }), 'fr')).toBe('31 décembre 1899');
  });

  it('respects the precision of partial dates', () => {
    expect(formatGenealogyDate(date({ start: { year: 1850 } }), 'fr')).toBe('1850');
    expect(formatGenealogyDate(date({ start: { year: 1850, month: 3 } }), 'fr')).toBe('mars 1850');
    expect(formatGenealogyDate(date({ start: { year: 45, month: 3 } }), 'en')).toBe('March 45');
  });

  it('translates qualifiers', () => {
    expect(formatGenealogyDate(date({ qualifier: 'about', start: { year: 1850 } }), 'fr')).toBe('vers 1850');
    expect(formatGenealogyDate(date({ qualifier: 'before', start: { year: 1850 } }), 'en')).toBe('before 1850');
    expect(formatGenealogyDate(date({ qualifier: 'between', start: { year: 1700 }, end: { year: 1710 } }), 'es')).toBe(
      'entre 1700 y 1710',
    );
    expect(formatGenealogyDate(date({ qualifier: 'from-to', start: { year: 1914 }, end: { year: 1918 } }), 'fr')).toBe(
      'de 1914 à 1918',
    );
  });

  it('formats the French republican calendar', () => {
    expect(
      formatGenealogyDate(date({ calendar: 'french-republican', start: { year: 8, month: 2, day: 18 } }), 'fr'),
    ).toBe('18 brumaire an VIII');
    expect(formatGenealogyDate(date({ calendar: 'french-republican', start: { year: 3 } }), 'en')).toBe('year III');
  });

  it('flags the Julian calendar and BC dates', () => {
    expect(formatGenealogyDate(date({ calendar: 'julian', start: { year: 1582, month: 10, day: 4 } }), 'fr')).toBe(
      '4 octobre 1582 (julien)',
    );
    expect(formatGenealogyDate(date({ start: { year: -44 } }), 'fr')).toBe('44 av. J.-C.');
  });

  it('renders free text as is', () => {
    expect(formatGenealogyDate(date({ qualifier: 'phrase', original: '(pendant la guerre)' }), 'fr')).toBe(
      'pendant la guerre',
    );
    expect(formatGenealogyDate(undefined, 'fr')).toBe('');
  });

  it('falls back to English for an unknown language', () => {
    expect(formatGenealogyDate(date({ qualifier: 'about', start: { year: 1850 } }), 'de')).toBe('about 1850');
  });
});

describe('toRoman', () => {
  it.each([
    [1, 'I'],
    [4, 'IV'],
    [8, 'VIII'],
    [14, 'XIV'],
    [1999, 'MCMXCIX'],
  ])('%i → %s', (value, expected) => {
    expect(toRoman(value)).toBe(expected);
  });
});

describe('formatPlace', () => {
  it('shows town, code and country', () => {
    expect(
      formatPlace({
        id: 1,
        name: 'Lyon, 69123, Rhône, ARA, France',
        locality: 'Lyon',
        postalCode: '69123',
        country: 'France',
      }),
    ).toBe('Lyon (69123) France');
    expect(formatPlace({ id: 2, name: 'Quelque part' })).toBe('Quelque part');
    expect(formatPlace(undefined)).toBe('');
  });
});
