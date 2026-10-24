import { identityFromClaims } from './auth-providers.service.js';

describe('identityFromClaims', () => {
  const claims = { sub: 'abc', email: 'jean@example.com', name: 'Jean', picture: 'https://example.com/p.png' };

  it('maps the standard claims', () => {
    expect(identityFromClaims('google', { ...claims, email_verified: true }, false)).toEqual({
      provider: 'google',
      subject: 'abc',
      email: 'jean@example.com',
      emailVerified: true,
      name: 'Jean',
      picture: 'https://example.com/p.png',
    });
  });

  it('requires email_verified by default', () => {
    expect(identityFromClaims('oidc', claims, false).emailVerified).toBe(false);
  });

  it('trusts the email without an email_verified claim when configured (Microsoft)', () => {
    expect(identityFromClaims('microsoft', claims, true).emailVerified).toBe(true);
  });

  it('honors an explicitly false email_verified even in trust mode', () => {
    expect(identityFromClaims('microsoft', { ...claims, email_verified: false }, true).emailVerified).toBe(false);
  });

  it('ignores empty or mistyped claims', () => {
    expect(identityFromClaims('oidc', { sub: 'abc', email: '', name: 42 }, true)).toEqual({
      provider: 'oidc',
      subject: 'abc',
      emailVerified: false,
    });
  });

  it('drops profile pictures the browser cannot display', () => {
    const graph = { ...claims, picture: 'https://graph.microsoft.com/v1.0/me/photo/$value' };
    expect(identityFromClaims('microsoft', graph, true).picture).toBeUndefined();
    expect(
      identityFromClaims('oidc', { ...claims, picture: 'http://example.com/p.png' }, true).picture,
    ).toBeUndefined();
  });
});
