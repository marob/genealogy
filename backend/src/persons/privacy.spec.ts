import { PrivacyPolicy, todayKey } from './privacy.js';

describe('todayKey', () => {
  it('tient compte du fuseau horaire de référence', () => {
    const instant = new Date('2026-12-31T23:30:00Z');
    expect(todayKey('UTC', instant)).toBe(20_261_231);
    expect(todayKey('Europe/Paris', instant)).toBe(20_270_101);
    expect(todayKey('America/New_York', instant)).toBe(20_261_231);
  });
});

describe('PrivacyPolicy', () => {
  const today = 20_261_024;

  it('restreint les personnes nées il y a moins de 100 ans', () => {
    const policy = new PrivacyPolicy(false, today);
    expect(policy.isPersonRestricted(19_261_024)).toBe(false);
    expect(policy.isPersonRestricted(19_261_025)).toBe(true);
    expect(policy.isPersonRestricted(19_500_101)).toBe(true);
    expect(policy.isPersonRestricted(18_500_101)).toBe(false);
  });

  it('considère une naissance inconnue comme contemporaine', () => {
    const policy = new PrivacyPolicy(false, today);
    expect(policy.isPersonRestricted(null)).toBe(true);
    expect(policy.isPersonRestricted(undefined)).toBe(true);
  });

  it('ne restreint rien pour un utilisateur autorisé', () => {
    const policy = new PrivacyPolicy(true, today);
    expect(policy.isPersonRestricted(null)).toBe(false);
    expect(policy.isPersonRestricted(20_000_101)).toBe(false);
    expect(policy.isContemporary(20_000_101)).toBe(true);
  });

  it('calcule la clé d’un événement en complétant au plus tard', () => {
    const base = { dateEndYear: null };
    expect(PrivacyPolicy.eventKey({ ...base, dateSortKey: 19_260_000 })).toBe(19_261_231);
    expect(PrivacyPolicy.eventKey({ ...base, dateSortKey: 19_260_300 })).toBe(19_260_331);
    expect(PrivacyPolicy.eventKey({ ...base, dateSortKey: 19_000_000, dateEndYear: 1930 })).toBe(19_301_231);
    expect(PrivacyPolicy.eventKey({ ...base, dateSortKey: null })).toBeUndefined();
  });
});
