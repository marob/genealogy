import { normalizeForSearch } from './normalize.js';

describe('normalizeForSearch', () => {
  it('supprime accents, casse et ponctuation', () => {
    expect(normalizeForSearch('  Hélène  DUPRÉ-Saint Œuvre ')).toBe('helene dupre saint oeuvre');
    expect(normalizeForSearch('François, Lætitia')).toBe('francois laetitia');
  });
});
