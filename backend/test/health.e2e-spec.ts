import request from 'supertest';
import { createTestApp, type TestContext } from './utils/test-app.js';

describe('GET /api/health', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('répond ok quand la base est accessible', async () => {
    await request(ctx.app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' });
  });
});
