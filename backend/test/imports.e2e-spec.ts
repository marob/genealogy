import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImportDto } from '@genealogie/shared';
import request from 'supertest';
import { encodeAnsel } from './utils/encodings.js';
import { createTestApp, loginAs, type TestContext } from './utils/test-app.js';

const fixture = readFileSync(join(import.meta.dirname, 'fixtures/famille-martin.ged'), 'utf8');

describe('Import GEDCOM (/api/admin/imports)', () => {
  let ctx: TestContext;
  let admin: string;
  let member: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAs(ctx, { email: 'admin@example.com', role: 'ADMIN' });
    member = await loginAs(ctx, { email: 'member@example.com', canSeeContemporary: true });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const upload = (cookie: string, content: Uint8Array | string, name = 'famille.ged') =>
    request(ctx.app.getHttpServer())
      .post('/api/admin/imports')
      .set('Cookie', cookie)
      .attach('file', Buffer.from(content), name);

  it('is restricted to administrators', async () => {
    await request(ctx.app.getHttpServer()).get('/api/admin/imports').expect(401);
    await request(ctx.app.getHttpServer()).get('/api/admin/imports').set('Cookie', member).expect(403);
    await upload(member, fixture).expect(403);
  });

  it('rejects a file that is not a GEDCOM', async () => {
    await upload(admin, 'hello').expect(400);
  });

  it('parses then applies an ANSEL file', async () => {
    const ansel = encodeAnsel(fixture.replace('1 CHAR UTF-8', '1 CHAR ANSEL'));
    const preview = (await upload(admin, ansel, 'Famille Martin é.ged').expect(201)).body as ImportDto;
    expect(preview).toMatchObject({
      status: 'preview',
      fileName: 'Famille Martin é.ged',
      encoding: 'ANSEL',
      declaredCharset: 'ANSEL',
      sourceSoftware: 'Heredis 2024',
      gedcomVersion: '5.5.1',
      current: false,
      stats: { persons: 7, families: 3, places: 3 },
    });
    // Nothing is written yet.
    expect(await ctx.prisma.person.count()).toBe(0);

    const committed = (
      await request(ctx.app.getHttpServer())
        .post(`/api/admin/imports/${preview.id}/commit`)
        .set('Cookie', admin)
        .expect(201)
    ).body as ImportDto;
    expect(committed).toMatchObject({ status: 'committed', current: true });

    expect(await ctx.prisma.person.count()).toBe(7);
    const emile = await ctx.prisma.person.findUniqueOrThrow({ where: { id: 'I1' } });
    expect(emile).toMatchObject({
      givenNames: 'Émile Joseph',
      searchName: 'emile joseph martin',
      birthKey: 18_500_312,
    });
    expect(await ctx.prisma.familyChild.findMany({ where: { familyId: 'F1' }, orderBy: { position: 'asc' } })).toEqual([
      { familyId: 'F1', childId: 'I3', position: 0, pedigree: null },
      { familyId: 'F1', childId: 'I4', position: 1, pedigree: 'adopted' },
    ]);
    expect(await ctx.prisma.setting.findUnique({ where: { key: 'rootPersonId' } })).toMatchObject({ value: 'I0' });
  });

  it('replaces the data on a new import and keeps the history', async () => {
    const smaller = fixture.replace(/0 @I6@ INDI\n1 NAME Jules \/MARTIN\/\n1 SEX M\n1 FAMC @F2@\n/, '');
    const preview = (await upload(admin, smaller).expect(201)).body as ImportDto;
    await request(ctx.app.getHttpServer())
      .post(`/api/admin/imports/${preview.id}/commit`)
      .set('Cookie', admin)
      .expect(201);
    expect(await ctx.prisma.person.count()).toBe(6);

    const history = (await request(ctx.app.getHttpServer()).get('/api/admin/imports').set('Cookie', admin).expect(200))
      .body as ImportDto[];
    expect(history.map((run) => [run.id, run.current])).toEqual([
      [preview.id, true],
      [preview.id - 1, false],
    ]);

    // The current import cannot be deleted, the old one can.
    await request(ctx.app.getHttpServer()).delete(`/api/admin/imports/${preview.id}`).set('Cookie', admin).expect(409);
    await request(ctx.app.getHttpServer())
      .delete(`/api/admin/imports/${preview.id - 1}`)
      .set('Cookie', admin)
      .expect(204);
  });
});
