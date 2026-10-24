import { parsePlace, parsePlaceForm } from './places.js';

describe('parsePlaceForm', () => {
  it('recognizes jurisdictions in French and English', () => {
    expect(parsePlaceForm('Town, Area code, County, Region, Country, Subdivision')).toEqual([
      'locality',
      'postalCode',
      'county',
      'region',
      'country',
      undefined,
    ]);
    expect(parsePlaceForm('Ville, Code INSEE, Département, Région, Pays')).toEqual([
      'locality',
      'postalCode',
      'county',
      'region',
      'country',
    ]);
    expect(parsePlaceForm('')).toBeUndefined();
  });
});

describe('parsePlace', () => {
  it('splits according to the declared format', () => {
    const form = parsePlaceForm('Ville, Code, Département, Région, Pays');
    expect(parsePlace('Lyon, 69123, Rhône, Auvergne-Rhône-Alpes, France', form)).toEqual({
      fullName: 'Lyon, 69123, Rhône, Auvergne-Rhône-Alpes, France',
      locality: 'Lyon',
      postalCode: '69123',
      county: 'Rhône',
      region: 'Auvergne-Rhône-Alpes',
      country: 'France',
    });
  });

  it('tolerates empty parts', () => {
    expect(parsePlace('Lyon, , , , France', undefined)).toMatchObject({ locality: 'Lyon', country: 'France' });
    expect(parsePlace('Lyon, , , , France', undefined)?.postalCode).toBeUndefined();
  });

  it('guesses town and country without a declared format', () => {
    expect(parsePlace('Paris', undefined)).toEqual({ fullName: 'Paris', locality: 'Paris' });
    expect(parsePlace('Bruxelles, Belgique', undefined)).toMatchObject({ locality: 'Bruxelles', country: 'Belgique' });
  });

  it('ignores empty places', () => {
    expect(parsePlace(' , , ', undefined)).toBeUndefined();
  });

  it('reads GPS coordinates', () => {
    expect(parsePlace('Quito', undefined, { latitude: 'S0.22', longitude: 'W78.5' })).toMatchObject({
      latitude: -0.22,
      longitude: -78.5,
    });
    expect(parsePlace('Lyon', undefined, { latitude: 'N45,76', longitude: 'E4.83' })).toMatchObject({
      latitude: 45.76,
      longitude: 4.83,
    });
    expect(parsePlace('Lyon', undefined, { latitude: 'N45' })).toEqual({ fullName: 'Lyon', locality: 'Lyon' });
  });
});
