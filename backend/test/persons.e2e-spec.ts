import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PersonDto, SearchResultDto, SurnameDto, TreeInfoDto } from '@genealogie/shared';
import request from 'supertest';
import { createTestApp, loginAs, seedGedcom, type TestContext } from './utils/test-app.js';

const fixture = readFileSync(join(import.meta.dirname, 'fixtures/famille-martin.ged'), 'utf8');

describe('Browsing persons', () => {
  let ctx: TestContext;
  let trusted: string;
  let member: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await seedGedcom(ctx, fixture);
    trusted = await loginAs(ctx, { email: 'trusted@example.com', canSeeContemporary: true });
    member = await loginAs(ctx, { email: 'member@example.com' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const get = (url: string, cookie?: string) => {
    const req = request(ctx.app.getHttpServer()).get(url);
    return cookie ? req.set('Cookie', cookie) : req;
  };

  it('returns the tree root', async () => {
    const info = (await get('/api/tree').expect(200)).body as TreeInfoDto;
    expect(info).toEqual({ rootPersonId: 'I0', globalRootPersonId: 'I0', personalRoot: false, persons: 7 });
  });

  it('returns a person with their relatives', async () => {
    const people = (await get('/api/persons/I1?include=parents,children,unions').expect(200)).body as PersonDto[];
    expect(people.map((p) => p.id)).toEqual(['I1', 'I0', 'I2', 'I3', 'I4']);
    const emile = people[0]!;
    expect(emile).toMatchObject({
      givenNames: 'Émile Joseph',
      surname: 'MARTIN',
      sex: 'M',
      fatherId: 'I0',
      occupation: 'Boulanger',
      restricted: false,
      unions: [{ familyId: 'F1', partnerId: 'I2', childIds: ['I3', 'I4'], restricted: false }],
    });
    expect(emile.note).toContain('Médaille du travail');
    expect(emile.events.map((e) => e.type)).toEqual(['BIRT', 'CHR', 'OCCU', 'DEAT']);
    expect(emile.events[0]).toEqual({
      type: 'BIRT',
      date: {
        original: '12 MAR 1850',
        qualifier: 'exact',
        calendar: 'gregorian',
        start: { year: 1850, month: 3, day: 12 },
      },
      place: {
        id: expect.any(Number),
        name: 'Lyon, 69123, Rhône, Auvergne-Rhône-Alpes, France',
        locality: 'Lyon',
        postalCode: '69123',
        county: 'Rhône',
        region: 'Auvergne-Rhône-Alpes',
        country: 'France',
        latitude: 45.7578,
        longitude: 4.832,
      },
    });
    expect(emile.unions[0]!.events[0]!).toMatchObject({
      type: 'MARR',
      date: { start: { year: 1878, month: 6, day: 1 } },
    });
  });

  it('returns republican dates in their original calendar', async () => {
    const [pierre] = (await get('/api/persons/I0').expect(200)).body as PersonDto[];
    expect(pierre!.events[0]!.date).toEqual({
      original: '@#DFRENCH R@ 18 BRUM 8',
      qualifier: 'exact',
      calendar: 'french-republican',
      start: { year: 8, month: 2, day: 18 },
    });
  });

  describe('100-year rule', () => {
    it('only shows the name of contemporaries to anonymous visitors', async () => {
      const [zoe] = (await get('/api/persons/I4').expect(200)).body as PersonDto[];
      expect(zoe).toEqual({
        id: 'I4',
        givenNames: 'Zoé',
        surname: 'MARTIN',
        sex: 'F',
        fatherId: 'I1',
        motherId: 'I2',
        unions: [],
        restricted: true,
        events: [],
        media: [],
      });
    });

    it('applies the same rule to logged-in users without permission', async () => {
      const [zoe] = (await get('/api/persons/I4', member).expect(200)).body as PersonDto[];
      expect(zoe).toMatchObject({ restricted: true, events: [] });
    });

    it('shows everything to authorized users', async () => {
      const [zoe] = (await get('/api/persons/I4', trusted).expect(200)).body as PersonDto[];
      expect(zoe).toMatchObject({ restricted: false, events: [{ type: 'BIRT' }] });
    });

    it('shows persons whose own dated events prove they were born more than 100 years ago', async () => {
      // Louise: no birth date, married in 1905.
      const [louise] = (await get('/api/persons/I5').expect(200)).body as PersonDto[];
      expect(louise!.restricted).toBe(false);
    });

    it('treats a person without a sound birth bound as contemporary', async () => {
      // Jules: no dated event; his parents' births say nothing about his own.
      const [jules] = (await get('/api/persons/I6').expect(200)).body as PersonDto[];
      expect(jules!.restricted).toBe(true);
    });
  });

  describe('lineage', () => {
    const lineage = async (url: string) => ((await get(url).expect(200)).body as PersonDto[]).map((p) => p.id);

    it('returns all ancestors and descendants, then partners', async () => {
      expect(await lineage('/api/persons/I1/lineage')).toEqual(['I1', 'I0', 'I3', 'I4', 'I6', 'I2']);
    });

    it('limits the number of generations', async () => {
      expect(await lineage('/api/persons/I1/lineage?ancestors=0&descendants=1')).toEqual(['I1', 'I3', 'I4', 'I2']);
      expect(await lineage('/api/persons/I6/lineage?descendants=0&ancestors=1')).toEqual(['I6', 'I3', 'I5']);
    });

    it('applies the 100-year rule', async () => {
      const people = (await get('/api/persons/I0/lineage').expect(200)).body as PersonDto[];
      expect(people.find((p) => p.id === 'I4')).toMatchObject({ restricted: true, events: [] });
    });

    it('validates parameters', async () => {
      expect((await get('/api/persons/I1/lineage?ancestors=500')).status).toBe(400);
      expect((await get('/api/persons/I999/lineage')).status).toBe(404);
    });
  });

  it('loads several persons by identifiers', async () => {
    const people = (await get('/api/persons?ids=I3,I2,unknown').expect(200)).body as PersonDto[];
    expect(people.map((p) => p.id)).toEqual(['I3', 'I2']);
  });

  it('responds 404 for an unknown person', async () => {
    expect((await get('/api/persons/I999')).status).toBe(404);
  });

  describe('search', () => {
    const search = async (query: string, cookie?: string) =>
      (await get(`/api/persons/search?${query}`, cookie).expect(200)).body as SearchResultDto;

    it('searches ignoring accents and case', async () => {
      const result = await search('q=helene dupre');
      expect(result).toMatchObject({ total: 1, page: 1, items: [{ id: 'I2', restricted: false }] });
      expect(result.items[0]!.birth?.date?.qualifier).toBe('between');
    });

    it('sorts by surname then given names', async () => {
      const result = await search('surname=MARTIN');
      expect(result.items.map((p) => p.givenNames)).toEqual(['Émile Joseph', 'François', 'Jules', 'Pierre', 'Zoé']);
      expect(result.items.find((p) => p.id === 'I4')).toEqual({
        id: 'I4',
        givenNames: 'Zoé',
        surname: 'MARTIN',
        sex: 'F',
        restricted: true,
      });
    });

    it('filters by place and birth period', async () => {
      expect((await search('place=lyon')).items.map((p) => p.id).sort()).toEqual(['I0', 'I1']);
      // Hélène (BET 1854 AND 1856) is included.
      expect((await search('bornFrom=1850&bornTo=1880')).items.map((p) => p.id).sort()).toEqual(['I1', 'I2', 'I3']);
    });

    it('does not expose contemporaries in a date search', async () => {
      expect((await search('bornFrom=1980')).total).toBe(0);
      expect((await search('bornFrom=1980', trusted)).items.map((p) => p.id)).toEqual(['I4']);
    });

    it('paginates results', async () => {
      const result = await search('surname=MARTIN&pageSize=2&page=2');
      expect(result).toMatchObject({ total: 5, page: 2, pageSize: 2 });
      expect(result.items.map((p) => p.givenNames)).toEqual(['Jules', 'Pierre']);
    });

    it('validates parameters', async () => {
      expect((await get('/api/persons/search?bornFrom=abc')).status).toBe(400);
      expect((await get('/api/persons/search?pageSize=1000')).status).toBe(400);
    });
  });

  it('lists surnames', async () => {
    const surnames = (await get('/api/surnames').expect(200)).body as SurnameDto[];
    expect(surnames).toEqual([
      { surname: 'BERNARD', count: 1 },
      { surname: 'DUPRÉ', count: 1 },
      { surname: 'MARTIN', count: 5 },
    ]);
  });

  it('lets an admin change the tree root', async () => {
    const admin = await loginAs(ctx, { email: 'root-admin@example.com', role: 'ADMIN' });
    await request(ctx.app.getHttpServer())
      .put('/api/admin/tree/root')
      .send({ personId: 'I3' })
      .set('Cookie', member)
      .expect(403);
    await request(ctx.app.getHttpServer())
      .put('/api/admin/tree/root')
      .send({ personId: 'nope' })
      .set('Cookie', admin)
      .expect(404);
    const info = (
      await request(ctx.app.getHttpServer())
        .put('/api/admin/tree/root')
        .send({ personId: 'I3' })
        .set('Cookie', admin)
        .expect(200)
    ).body as TreeInfoDto;
    expect(info.rootPersonId).toBe('I3');
  });

  describe('personal root', () => {
    const putRoot = (personId: string | null, cookie?: string) => {
      const req = request(ctx.app.getHttpServer()).put('/api/me/root').send({ personId });
      return cookie ? req.set('Cookie', cookie) : req;
    };
    const treeInfo = async (cookie?: string) => (await get('/api/tree', cookie).expect(200)).body as TreeInfoDto;

    it('is restricted to logged-in users', async () => {
      expect((await putRoot('I1')).status).toBe(401);
      expect((await putRoot('nope', member)).status).toBe(404);
      expect((await putRoot('', member)).status).toBe(400);
    });

    it('replaces the shared root for that user only', async () => {
      const info = (await putRoot('I1', member).expect(200)).body as TreeInfoDto;
      expect(info).toMatchObject({ rootPersonId: 'I1', globalRootPersonId: 'I3', personalRoot: true });
      expect(await treeInfo(member)).toMatchObject({ rootPersonId: 'I1', personalRoot: true });
      expect(await treeInfo(trusted)).toMatchObject({ rootPersonId: 'I3', personalRoot: false });
      expect(await treeInfo()).toMatchObject({ rootPersonId: 'I3', personalRoot: false });
      const me = (await get('/api/me', member).expect(200)).body as { user: { rootPersonId?: string } };
      expect(me.user.rootPersonId).toBe('I1');
    });

    it('reverts to the shared root', async () => {
      const info = (await putRoot(null, member).expect(200)).body as TreeInfoDto;
      expect(info).toMatchObject({ rootPersonId: 'I3', personalRoot: false });
    });

    it('ignores a personal root that no longer exists after an import', async () => {
      await putRoot('I6', member).expect(200);
      await ctx.prisma.person.delete({ where: { id: 'I6' } });
      expect(await treeInfo(member)).toMatchObject({ rootPersonId: 'I3', personalRoot: false });
    });
  });
});
