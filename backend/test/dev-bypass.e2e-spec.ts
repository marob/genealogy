import type { MeDto } from '@genealogie/shared';
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
});
