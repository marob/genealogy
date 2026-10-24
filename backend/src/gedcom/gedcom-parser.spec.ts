import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeAnsel, encodeUtf16le, encodeWindows1252 } from '../../test/utils/encodings.js';
import { parseGedcom } from './gedcom-parser.js';

const fixture = readFileSync(join(import.meta.dirname, '../../test/fixtures/famille-martin.ged'), 'utf8');
const withCharset = (charset: string): string => fixture.replace('1 CHAR UTF-8', `1 CHAR ${charset}`);

describe('parseGedcom', () => {
  const result = parseGedcom(new TextEncoder().encode(fixture));
  const person = (id: string) => result.persons.find((p) => p.id === id)!;
  const family = (id: string) => result.families.find((f) => f.id === id)!;

  it('reads the header', () => {
    expect(result.header).toEqual({ sourceSoftware: 'Heredis 2024', gedcomVersion: '5.5.1' });
    expect(result.decoded).toMatchObject({ encoding: 'UTF-8', declaredCharset: 'UTF-8' });
  });

  it('produces statistics', () => {
    expect(result.stats).toMatchObject({ persons: 7, families: 3, places: 3 });
    expect(result.stats.ignoredTags).toEqual({ 'INDI.SOUR': 1 });
  });

  it('reads names, sexes, occupations and notes', () => {
    expect(person('I1')).toMatchObject({
      givenNames: 'Émile Joseph',
      surname: 'MARTIN',
      sex: 'M',
      occupation: 'Boulanger',
      note: 'Boulanger réputé dans tout le quartier, il reprit la boutique de son père.\nMédaille du travail en 1910.',
    });
    expect(person('I2')).toMatchObject({ givenNames: 'Hélène', surname: 'DUPRÉ', sex: 'F' });
  });

  it('reads events with structured dates and places', () => {
    const birth = person('I1').events.find((e) => e.type === 'BIRT')!;
    expect(birth.date?.date).toEqual({
      original: '12 MAR 1850',
      qualifier: 'exact',
      calendar: 'gregorian',
      start: { year: 1850, month: 3, day: 12 },
    });
    expect(birth.place).toBe('Lyon, 69123, Rhône, Auvergne-Rhône-Alpes, France');
    expect(result.places.get(birth.place!)).toMatchObject({
      locality: 'Lyon',
      postalCode: '69123',
      country: 'France',
      latitude: 45.7578,
      longitude: 4.832,
    });
    expect(person('I1').events.map((e) => e.type)).toEqual(['BIRT', 'CHR', 'OCCU', 'DEAT']);
  });

  it('reads families, children and parent-child links', () => {
    expect(family('F1')).toMatchObject({ partner1Id: 'I1', partner2Id: 'I2', childIds: ['I3', 'I4'] });
    expect(family('F1').events[0]?.date?.sortKey).toBe(18_780_601);
    expect(person('I4').parentFamilies).toEqual([{ familyId: 'F1', pedigree: 'adopted' }]);
    expect(person('I6').parentFamilies).toEqual([{ familyId: 'F2' }]);
  });

  it('estimates births for the privacy rule', () => {
    expect(result.birthKeys.get('I1')).toEqual({ key: 18_500_312, estimated: false });
    // 18 Brumaire year VIII = November 9, 1799
    expect(result.birthKeys.get('I0')).toEqual({ key: 17_991_109, estimated: false });
    // BET 1854 AND 1856: the latest bound is used.
    expect(result.birthKeys.get('I2')).toEqual({ key: 18_561_231, estimated: false });
    // Louise: married in 1905, so born before the end of 1905.
    expect(result.birthKeys.get('I5')).toEqual({ key: 19_051_231, estimated: true });
    // Jules: no dated event; his parents' births give no upper bound.
    expect(result.birthKeys.has('I6')).toBe(false);
  });

  it.each([
    ['ANSEL', () => encodeAnsel(withCharset('ANSEL'))],
    ['ANSI', () => encodeWindows1252(withCharset('ANSI'))],
    ['UNICODE', () => encodeUtf16le(withCharset('UNICODE'))],
  ])('gives the same result for a file encoded in %s', (charset, encode) => {
    const other = parseGedcom(encode());
    expect(other.decoded.declaredCharset).toBe(charset);
    expect(other.warnings).toEqual(result.warnings);
    expect(other.persons).toEqual(result.persons);
    expect(other.families).toEqual(result.families);
    expect(other.places).toEqual(result.places);
  });

  it('ignores a person declared as both parent and child of the same family', () => {
    const looped = parseGedcom(
      new TextEncoder().encode(
        [
          '0 HEAD',
          '1 CHAR UTF-8',
          '0 @I1@ INDI',
          '1 NAME Louis /ROBERT/',
          '1 FAMC @F1@',
          '1 FAMC @F2@',
          '1 FAMS @F1@',
          '0 @I2@ INDI',
          '1 NAME Père /ROBERT/',
          '1 FAMS @F2@',
          '0 @F1@ FAM',
          '1 HUSB @I1@',
          '1 CHIL @I1@',
          '0 @F2@ FAM',
          '1 HUSB @I2@',
          '1 CHIL @I1@',
          '0 TRLR',
        ].join('\n'),
      ),
    );
    expect(looped.warnings).toEqual([
      'Person I1 is both a parent and a child in family F1: parent-child link ignored.',
    ]);
    expect(looped.families.find((f) => f.id === 'F1')?.childIds).toEqual([]);
    expect(looped.persons.find((p) => p.id === 'I1')?.parentFamilies).toEqual([{ familyId: 'F2' }]);
  });

  it('ignores duplicate children and a parent declared as their own child on the person side', () => {
    const parsed = parseGedcom(
      new TextEncoder().encode(
        [
          '0 HEAD',
          '1 CHAR UTF-8',
          '0 @I1@ INDI',
          '1 NAME A /B/',
          '1 FAMC @F1@',
          '0 @I2@ INDI',
          '1 NAME C /D/',
          '0 @F1@ FAM',
          '1 HUSB @I1@',
          '1 CHIL @I2@',
          '1 CHIL @I2@',
          '0 TRLR',
        ].join('\n'),
      ),
    );
    expect(parsed.warnings).toEqual([
      'Family F1 lists child I2 more than once: duplicate ignored.',
      'Person I1 is both a parent and a child in family F1: parent-child link ignored.',
    ]);
    expect(parsed.families[0]?.childIds).toEqual(['I2']);
    expect(parsed.persons.find((p) => p.id === 'I1')?.parentFamilies).toEqual([]);
  });

  it('reports broken references and completes one-way links', () => {
    const broken = parseGedcom(
      new TextEncoder().encode(
        [
          '0 HEAD',
          '1 CHAR UTF-8',
          '0 @I1@ INDI',
          '1 NAME A /B/',
          '1 FAMC @F9@',
          '0 @I2@ INDI',
          '1 NAME C /D/',
          '1 FAMC @F1@',
          '0 @F1@ FAM',
          '1 HUSB @I1@',
          '1 WIFE @I9@',
          '1 CHIL @I8@',
          '0 @I1@ INDI',
          '0 TRLR',
        ].join('\n'),
      ),
    );
    expect(broken.warnings).toEqual([
      'Person I1 defined more than once: only the first occurrence is imported.',
      'Family F1 references a nonexistent person (I9).',
      'Family F1 references a nonexistent child (I8).',
      'Person I1 references a nonexistent family (F9).',
    ]);
    expect(broken.families[0]).toMatchObject({ partner1Id: 'I1', childIds: ['I2'] });
    expect(broken.families[0]?.partner2Id).toBeUndefined();
  });
});
