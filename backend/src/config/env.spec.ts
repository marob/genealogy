import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'file:./test.db',
  SESSION_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applique les valeurs par défaut', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.AUTH_DEV_BYPASS).toBe(false);
    expect(env.ADMIN_EMAILS).toEqual([]);
  });

  it('normalise la liste des e-mails admin', () => {
    const env = validateEnv({ ...base, ADMIN_EMAILS: ' Foo@Example.com, ,bar@example.com' });
    expect(env.ADMIN_EMAILS).toEqual(['foo@example.com', 'bar@example.com']);
  });

  it('refuse un secret de session trop court', () => {
    expect(() => validateEnv({ ...base, SESSION_SECRET: 'short' })).toThrow();
  });

  it('n’autorise le bypass d’authentification qu’en local', () => {
    expect(validateEnv({ ...base, AUTH_DEV_BYPASS: 'true', PUBLIC_URL: 'http://localhost:8080' }).AUTH_DEV_BYPASS).toBe(
      true,
    );
    expect(() =>
      validateEnv({ ...base, AUTH_DEV_BYPASS: 'true', PUBLIC_URL: 'https://genealogie.example.com' }),
    ).toThrow(/localhost/);
  });
});

describe('validateEnv (variables vides)', () => {
  it('traite une variable vide comme absente', () => {
    const env = validateEnv({ ...base, OIDC_ISSUER: '', GOOGLE_CLIENT_ID: '' });
    expect(env.OIDC_ISSUER).toBeUndefined();
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });
});
