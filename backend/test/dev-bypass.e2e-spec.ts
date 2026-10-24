import type { MeDto } from '@genealogie/shared';
import request from 'supertest';
import { createTestApp, type TestContext } from './utils/test-app.js';

// Fichier séparé : la configuration Nest est chargée une fois par fichier de test.
describe('Mode développement (AUTH_DEV_BYPASS)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp({ AUTH_DEV_BYPASS: 'true' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('considère tout visiteur comme administrateur', async () => {
    const me = (await request(ctx.app.getHttpServer()).get('/api/me').expect(200)).body as MeDto;
    expect(me).toMatchObject({ devBypass: true, user: { email: 'dev@localhost', role: 'ADMIN' } });
    await request(ctx.app.getHttpServer()).get('/api/admin/users').expect(200);
  });
});
