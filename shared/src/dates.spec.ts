import { sortKey } from './dates.ts';

describe('sortKey', () => {
  it('encode une date complète en AAAAMMJJ', () => {
    expect(sortKey({ year: 1850, month: 3, day: 7 })).toBe(18_500_307);
  });

  it('met des zéros pour les parties inconnues', () => {
    expect(sortKey({ year: 1850 })).toBe(18_500_000);
    expect(sortKey({ year: 1850, month: 12 })).toBe(18_501_200);
  });
});
