import { parseGedcomDate } from './dates.js';

describe('parseGedcomDate', () => {
  it('ignores empty values', () => {
    expect(parseGedcomDate(undefined)).toBeUndefined();
    expect(parseGedcomDate('  ')).toBeUndefined();
  });

  it.each([
    ['12 MAR 1850', { year: 1850, month: 3, day: 12 }, 18_500_312],
    ['MAR 1850', { year: 1850, month: 3 }, 18_500_300],
    ['1850', { year: 1850 }, 18_500_000],
    ['1 jan 1900', { year: 1900, month: 1, day: 1 }, 19_000_101],
  ])('parses an exact date "%s"', (value, start, key) => {
    const parsed = parseGedcomDate(value)!;
    expect(parsed.date).toEqual({ original: value, qualifier: 'exact', calendar: 'gregorian', start });
    expect(parsed.sortKey).toBe(key);
  });

  it('never introduces a time zone shift', () => {
    // January 1st stays January 1st whatever the server TZ.
    expect(parseGedcomDate('1 JAN 1900')!.gregorianStart).toEqual({ year: 1900, month: 1, day: 1 });
    expect(parseGedcomDate('31 DEC 1899')!.gregorianStart).toEqual({ year: 1899, month: 12, day: 31 });
  });

  it.each([
    ['ABT 1850', 'about'],
    ['CAL 1850', 'calculated'],
    ['EST 1850', 'estimated'],
    ['BEF 1850', 'before'],
    ['AFT 1850', 'after'],
    ['INT 1850 (selon l’acte)', 'about'],
  ])('parses the qualifier of "%s"', (value, qualifier) => {
    expect(parseGedcomDate(value)!.date).toMatchObject({ qualifier, start: { year: 1850 } });
  });

  it('parses ranges and periods', () => {
    expect(parseGedcomDate('BET 1700 AND MAR 1710')!.date).toMatchObject({
      qualifier: 'between',
      start: { year: 1700 },
      end: { year: 1710, month: 3 },
    });
    expect(parseGedcomDate('FROM 1914 TO 1918')!.date).toMatchObject({
      qualifier: 'from-to',
      start: { year: 1914 },
      end: { year: 1918 },
    });
    expect(parseGedcomDate('FROM 1914')!.date).toMatchObject({ qualifier: 'from', start: { year: 1914 } });
    const to = parseGedcomDate('TO 1918')!;
    expect(to.date).toMatchObject({ qualifier: 'to', start: { year: 1918 } });
  });

  it('handles dual years and B.C. years', () => {
    expect(parseGedcomDate('11 FEB 1720/21')!.date.start).toEqual({ year: 1721, month: 2, day: 11 });
    expect(parseGedcomDate('44 B.C.')!.date.start).toEqual({ year: -44 });
  });

  it('handles the French republican calendar, with or without an escape', () => {
    const explicit = parseGedcomDate('@#DFRENCH R@ 18 BRUM 8')!;
    expect(explicit.date).toMatchObject({ calendar: 'french-republican', start: { year: 8, month: 2, day: 18 } });
    expect(explicit.gregorianStart).toEqual({ year: 1799, month: 11, day: 9 });
    expect(explicit.sortKey).toBe(17_991_109);

    const implicit = parseGedcomDate('ABT 2 PLUV 2')!;
    expect(implicit.date).toMatchObject({ calendar: 'french-republican', qualifier: 'about' });
    expect(implicit.gregorianStart).toEqual({ year: 1794, month: 1, day: 21 });
  });

  it('handles the Julian calendar', () => {
    const parsed = parseGedcomDate('@#DJULIAN@ 4 OCT 1582')!;
    expect(parsed.date.calendar).toBe('julian');
    expect(parsed.gregorianStart).toEqual({ year: 1582, month: 10, day: 14 });
  });

  it('keeps unrecognized values as free text', () => {
    expect(parseGedcomDate('(pendant la guerre)')!.date).toEqual({
      original: '(pendant la guerre)',
      qualifier: 'phrase',
      calendar: 'gregorian',
    });
    expect(parseGedcomDate('vers la Toussaint')!.date.qualifier).toBe('phrase');
    expect(parseGedcomDate('32 JAN 1900')!.date.qualifier).toBe('phrase');
    expect(parseGedcomDate('vers la Toussaint')!.sortKey).toBeUndefined();
  });
});
