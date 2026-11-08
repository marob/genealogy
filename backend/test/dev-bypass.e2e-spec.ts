import type { DevAccountDto, MeDto } from '@genealogie/shared';
import request from 'supertest';
import { createTestApp, type TestContext } from './utils/test-app.js';

// Separate file: the Nest configuration is loaded once per test file.
describe('Development mode (AUTH_DEV_BYPASS)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp({ AUTH_DEV_BYPASS: 'true' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('treats every visitor as an administrator', async () => {
    const me = (await request(ctx.app.getHttpServer()).get('/api/me').expect(200)).body as MeDto;
    expect(me).toMatchObject({ devBypass: true, user: { email: 'dev@localhost', role: 'ADMIN' } });
    await request(ctx.app.getHttpServer()).get('/api/admin/users').expect(200);
  });

  it('ignores requests addressed to another host (LAN IP, other host name)', async () => {
    const me = (await request(ctx.app.getHttpServer()).get('/api/me').set('Host', '192.168.1.10:8080').expect(200))
      .body as MeDto;
    expect(me.user).toBeUndefined();
    await request(ctx.app.getHttpServer()).get('/api/admin/users').set('Host', 'example.com').expect(401);
  });

  it('switches between development accounts', async () => {
    const accounts = (await request(ctx.app.getHttpServer()).get('/api/dev/accounts').expect(200))
      .body as DevAccountDto[];
    expect(accounts.map((a) => [a.email, a.role])).toEqual([
      ['dev@localhost', 'ADMIN'],
      ['alice@localhost', 'MEMBER'],
      ['bruno@localhost', 'MEMBER'],
    ]);
    const response = await request(ctx.app.getHttpServer()).post('/api/dev/accounts/alice@localhost/login').expect(204);
    const cookie = String(response.headers['set-cookie']).split(';')[0]!;
    const me = (await request(ctx.app.getHttpServer()).get('/api/me').set('Cookie', cookie).expect(200)).body as MeDto;
    expect(me.user).toMatchObject({ email: 'alice@localhost', role: 'MEMBER', canSeeContemporary: false });
    await request(ctx.app.getHttpServer()).get('/api/admin/users').set('Cookie', cookie).expect(403);
    await request(ctx.app.getHttpServer()).post('/api/dev/accounts/unknown@localhost/login').expect(404);
    await request(ctx.app.getHttpServer()).get('/api/dev/accounts').set('Host', 'example.com').expect(404);
  });
});
