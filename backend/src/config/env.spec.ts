import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'file:./test.db',
  SESSION_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('applies default values', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.AUTH_DEV_BYPASS).toBe(false);
    expect(env.ADMIN_EMAILS).toEqual([]);
  });

  it('normalizes the admin email list', () => {
    const env = validateEnv({ ...base, ADMIN_EMAILS: ' Foo@Example.com, ,bar@example.com' });
    expect(env.ADMIN_EMAILS).toEqual(['foo@example.com', 'bar@example.com']);
  });

  it('rejects a session secret that is too short', () => {
    expect(() => validateEnv({ ...base, SESSION_SECRET: 'short' })).toThrow();
  });

  it('only allows the authentication bypass locally', () => {
    expect(validateEnv({ ...base, AUTH_DEV_BYPASS: 'true', PUBLIC_URL: 'http://localhost:8080' }).AUTH_DEV_BYPASS).toBe(
      true,
    );
    expect(() =>
      validateEnv({ ...base, AUTH_DEV_BYPASS: 'true', PUBLIC_URL: 'https://genealogie.example.com' }),
    ).toThrow(/localhost/);
  });
});

describe('validateEnv (empty variables)', () => {
  it('treats an empty variable as missing', () => {
    const env = validateEnv({ ...base, OIDC_ISSUER: '', GOOGLE_CLIENT_ID: '' });
    expect(env.OIDC_ISSUER).toBeUndefined();
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });
});
