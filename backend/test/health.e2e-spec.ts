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

  it('responds ok when the database is reachable', async () => {
    await request(ctx.app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' });
  });

  it('sends security headers', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/api/health').expect(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
    const csp = String(response.headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("img-src 'self' data: https:");
  });
});
