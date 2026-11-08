import { toGedcomDate } from './user-date.js';

describe('toGedcomDate', () => {
  it.each([
    ['12/03/1850', '12 MAR 1850'],
    ['1/3/1850', '1 MAR 1850'],
    ['03/1850', 'MAR 1850'],
    ['1850', '1850'],
    ['12 mars 1850', '12 MAR 1850'],
    ['1er août 1914', '1 AUG 1914'],
    ['Décembre 1946', 'DEC 1946'],
    ['vers 1850', 'ABT 1850'],
    ['env. 1850', 'ABT 1850'],
    ['avant 03/1850', 'BEF MAR 1850'],
    ['après 1920', 'AFT 1920'],
    ['entre 1850 et 1855', 'BET 1850 AND 1855'],
    ['de 1914 à 1918', 'FROM 1914 TO 1918'],
    ['12 MAR 1850', '12 MAR 1850'],
    ['abt 1850', 'ABT 1850'],
    ['', ''],
  ])('converts "%s"', (text, expected) => {
    expect(toGedcomDate(text)).toBe(expected);
  });

  it.each(['32/01/1850', '12/13/1850', 'hier', 'vers la Toussaint'])('rejects "%s"', (text) => {
    expect(toGedcomDate(text)).toBeUndefined();
  });
});
