import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PersonDto, SearchResultDto, SurnameDto } from '@genealogie/shared';
import request from 'supertest';
import { createTestApp, loginAs, seedGedcom, type TestContext } from './utils/test-app.js';

const fixture = readFileSync(join(import.meta.dirname, 'fixtures/famille-martin.ged'), 'utf8');

// Separate file: the Nest configuration is loaded once per test file.
describe('Strict privacy mode (CONTEMPORARY_PRIVACY=hidden)', () => {
  let ctx: TestContext;
  let trusted: string;

  beforeAll(async () => {
    ctx = await createTestApp({ CONTEMPORARY_PRIVACY: 'hidden' });
    await seedGedcom(ctx, fixture);
    trusted = await loginAs(ctx, { email: 'trusted@example.com', canSeeContemporary: true });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const get = (url: string, cookie?: string) => {
    const req = request(ctx.app.getHttpServer()).get(url);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it('only reveals the existence of contemporaries', async () => {
    const [zoe] = (await get('/api/persons/I4').expect(200)).body as PersonDto[];
    expect(zoe).toEqual({
      id: 'I4',
      givenNames: '',
      surname: '',
      sex: 'U',
      hidden: true,
      fatherId: 'I1',
      motherId: 'I2',
      unions: [],
      restricted: true,
      events: [],
      media: [],
    });
  });

  it('keeps their place in the tree', async () => {
    const [emile] = (await get('/api/persons/I1').expect(200)).body as PersonDto[];
    expect(emile).toMatchObject({ givenNames: 'Émile Joseph', unions: [{ childIds: ['I3', 'I4'] }] });
  });

  it('excludes them from searches and the surname index', async () => {
    const byName = (await get('/api/persons/search?q=zoe').expect(200)).body as SearchResultDto;
    expect(byName.total).toBe(0);
    const bySurname = (await get('/api/persons/search?surname=MARTIN').expect(200)).body as SearchResultDto;
    expect(bySurname.items.map((p) => p.givenNames)).toEqual(['Émile Joseph', 'François', 'Pierre']);
    const surnames = (await get('/api/surnames').expect(200)).body as SurnameDto[];
    expect(surnames.find((s) => s.surname === 'MARTIN')?.count).toBe(3);
  });

  it('shows everything to authorized users', async () => {
    const [zoe] = (await get('/api/persons/I4', trusted).expect(200)).body as PersonDto[];
    expect(zoe).toMatchObject({ givenNames: 'Zoé', restricted: false });
    expect(zoe!.hidden).toBeUndefined();
    const result = (await get('/api/persons/search?q=zoe', trusted).expect(200)).body as SearchResultDto;
    expect(result.items.map((p) => p.id)).toEqual(['I4']);
    const surnames = (await get('/api/surnames', trusted).expect(200)).body as SurnameDto[];
    expect(surnames.find((s) => s.surname === 'MARTIN')?.count).toBe(5);
  });
});
