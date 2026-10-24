import { toGregorian } from './calendars.js';

describe('toGregorian', () => {
  it('leaves Gregorian dates unchanged', () => {
    expect(toGregorian({ year: 1900, month: 2 }, 'gregorian')).toEqual({ year: 1900, month: 2 });
  });

  it('converts the Julian calendar (+10 days in 1582)', () => {
    expect(toGregorian({ year: 1582, month: 10, day: 4 }, 'julian')).toEqual({ year: 1582, month: 10, day: 14 });
    expect(toGregorian({ year: 1700, month: 2, day: 18 }, 'julian')).toEqual({ year: 1700, month: 2, day: 28 });
  });

  it('keeps the precision of partial Julian dates', () => {
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
    ], // 2 Pluviôse year II
    [
      { year: 4, month: 2, day: 13 },
      { year: 1795, month: 11, day: 4 },
    ], // 13 Brumaire year IV
    [
      { year: 8, month: 2, day: 18 },
      { year: 1799, month: 11, day: 9 },
    ], // 18 Brumaire year VIII
    [
      { year: 12, month: 9, day: 1 },
      { year: 1804, month: 5, day: 21 },
    ], // 1 Prairial year XII
    [
      { year: 14, month: 4, day: 10 },
      { year: 1805, month: 12, day: 31 },
    ], // 10 Nivôse year XIV
    [
      { year: 3, month: 13, day: 6 },
      { year: 1795, month: 9, day: 22 },
    ], // complementary day, leap year III
  ])('converts the French republican calendar %o → %o', (date, expected) => {
    expect(toGregorian(date, 'french-republican')).toEqual(expected);
  });

  it('keeps the precision of partial republican dates', () => {
    expect(toGregorian({ year: 3 }, 'french-republican')).toEqual({ year: 1794 });
    expect(toGregorian({ year: 3, month: 5 }, 'french-republican')).toEqual({ year: 1795, month: 1 });
  });

  it('approximates the Hebrew year', () => {
    expect(toGregorian({ year: 5660, month: 1 }, 'hebrew')).toEqual({ year: 1900 });
  });
});
