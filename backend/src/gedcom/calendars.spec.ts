import { toGregorian } from './calendars.js';

describe('toGregorian', () => {
  it('laisse les dates grégoriennes inchangées', () => {
    expect(toGregorian({ year: 1900, month: 2 }, 'gregorian')).toEqual({ year: 1900, month: 2 });
  });

  it('convertit le calendrier julien (+10 jours en 1582)', () => {
    expect(toGregorian({ year: 1582, month: 10, day: 4 }, 'julian')).toEqual({ year: 1582, month: 10, day: 14 });
    expect(toGregorian({ year: 1700, month: 2, day: 18 }, 'julian')).toEqual({ year: 1700, month: 2, day: 28 });
  });

  it('conserve la précision des dates juliennes partielles', () => {
    expect(toGregorian({ year: 1600 }, 'julian')).toEqual({ year: 1600 });
    expect(toGregorian({ year: 1600, month: 5 }, 'julian')).toEqual({ year: 1600, month: 5 });
  });

  it.each([
    [
      { year: 1, month: 1, day: 1 },
      { year: 1792, month: 9, day: 22 },
    ],
    [
      { year: 2, month: 5, day: 2 },
      { year: 1794, month: 1, day: 21 },
    ], // 2 pluviôse an II
    [
      { year: 4, month: 2, day: 13 },
      { year: 1795, month: 11, day: 4 },
    ], // 13 brumaire an IV
    [
      { year: 8, month: 2, day: 18 },
      { year: 1799, month: 11, day: 9 },
    ], // 18 brumaire an VIII
    [
      { year: 12, month: 9, day: 1 },
      { year: 1804, month: 5, day: 21 },
    ], // 1er prairial an XII
    [
      { year: 14, month: 4, day: 10 },
      { year: 1805, month: 12, day: 31 },
    ], // 10 nivôse an XIV
    [
      { year: 3, month: 13, day: 6 },
      { year: 1795, month: 9, day: 22 },
    ], // jour complémentaire, an III sextile
  ])('convertit le calendrier républicain %o → %o', (date, expected) => {
    expect(toGregorian(date, 'french-republican')).toEqual(expected);
  });

  it('conserve la précision des dates républicaines partielles', () => {
    expect(toGregorian({ year: 3 }, 'french-republican')).toEqual({ year: 1794 });
    expect(toGregorian({ year: 3, month: 5 }, 'french-republican')).toEqual({ year: 1795, month: 1 });
  });

  it('approxime l’année hébraïque', () => {
    expect(toGregorian({ year: 5660, month: 1 }, 'hebrew')).toEqual({ year: 1900 });
  });
});
