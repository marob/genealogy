import { sortKey } from './dates.ts';

describe('sortKey', () => {
  it('encodes a full date as YYYYMMDD', () => {
    expect(sortKey({ year: 1850, month: 3, day: 7 })).toBe(18_500_307);
  });

  it('uses zeros for unknown parts', () => {
    expect(sortKey({ year: 1850 })).toBe(18_500_000);
    expect(sortKey({ year: 1850, month: 12 })).toBe(18_501_200);
  });
});
