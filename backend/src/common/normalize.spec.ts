import { normalizeForSearch } from './normalize.js';

describe('normalizeForSearch', () => {
  it('removes accents, case and punctuation', () => {
    expect(normalizeForSearch('  Hélène  DUPRÉ-Saint Œuvre ')).toBe('helene dupre saint oeuvre');
    expect(normalizeForSearch('François, Lætitia')).toBe('francois laetitia');
  });
});
