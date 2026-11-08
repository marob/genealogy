import { readdirSync, readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContributionDto, PersonDto } from '@genealogie/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { ImportsService } from '../src/imports/imports.service.js';
import { MediaStore } from '../src/media/media-store.service.js';
import { createTestApp, loginAs, seedGedcom, type TestContext } from './utils/test-app.js';

const fixture = readFileSync(join(import.meta.dirname, 'fixtures/famille-martin.ged'), 'utf8');

describe('Proposals shown to their author, and proposals about proposed persons', () => {
  let ctx: TestContext;
  let admin: string;
  let author: string;
  let other: string;
  let father: ContributionDto;
  let grandfather: ContributionDto;
  const server = (): App => ctx.app.getHttpServer() as App;
  const person = async (id: string, cookie?: string) => {
    const req = request(server()).get(`/api/persons/${id}`);
    return ((await (cookie ? req.set('Cookie', cookie) : req).expect(200)).body as PersonDto[])[0]!;
  };
  const proposeAll = async (body: object) =>
    (await request(server()).post('/api/contributions').set('Cookie', author).send(body).expect(201))
      .body as ContributionDto[];
  const propose = async (body: object) => (await proposeAll(body))[0]!;
  const review = (id: number, status: string) =>
    request(server()).patch(`/api/admin/contributions/${id}`).set('Cookie', admin).send({ status });

  beforeAll(async () => {
    ctx = await createTestApp();
    await seedGedcom(ctx, fixture);
    admin = await loginAs(ctx, { email: 'admin@example.com', role: 'ADMIN' });
    author = await loginAs(ctx, { email: 'author@example.com' });
    other = await loginAs(ctx, { email: 'other@example.com' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('shows a proposed father, then a proposed grandfather, to their author', async () => {
    // Hélène DUPRÉ has no parents in the genealogy.
    father = await propose({
      kind: 'add-person',
      personId: 'I2',
      relation: 'parent',
      fields: { givenNames: 'Jacques', surname: 'DUPRÉ', sex: 'M', birthDate: 'vers 1825' },
    });
    expect((await person('I2', author)).fatherId).toBe(`W${father.id}`);
    const proposedFather = await person(`W${father.id}`, author);
    expect(proposedFather).toMatchObject({
      givenNames: 'Jacques',
      surname: 'DUPRÉ',
      proposal: { status: 'pending', isNew: true },
      unions: [{ childIds: ['I2'] }],
      events: [{ type: 'BIRT', date: { original: 'ABT 1825' } }],
    });

    grandfather = await propose({
      kind: 'add-person',
      personId: `W${father.id}`,
      relation: 'parent',
      fields: { givenNames: 'Pierre', surname: 'DUPRÉ', sex: 'M' },
    });
    expect((await person(`W${father.id}`, author)).fatherId).toBe(`W${grandfather.id}`);
    const lineage = (await request(server()).get('/api/persons/I2/lineage').set('Cookie', author).expect(200))
      .body as PersonDto[];
    expect(lineage.map((p) => p.id)).toEqual(expect.arrayContaining([`W${father.id}`, `W${grandfather.id}`]));
  });

  it('shows the proposed values of a record, flagged, to their author only', async () => {
    await propose({ kind: 'edit', personId: 'I1', fields: { occupation: 'Boulanger-pâtissier' } });
    expect(await person('I1', author)).toMatchObject({
      occupation: 'Boulanger-pâtissier',
      proposal: { status: 'pending', fields: ['occupation'] },
    });
    for (const cookie of [other, admin, undefined]) {
      const seen = await person('I1', cookie);
      expect(seen.occupation).toBe('Boulanger');
      expect(seen.proposal).toBeUndefined();
    }
    expect((await person('I2', other)).fatherId).toBeUndefined();
    await request(server()).get(`/api/persons/W${father.id}`).set('Cookie', other).expect(404);
  });

  it('requires accepting the proposed person before the proposals about them', async () => {
    expect((await review(grandfather.id, 'approved')).status).toBe(409);
    await review(father.id, 'approved').expect(200);
    await review(grandfather.id, 'approved').expect(200);
    // Still shown to the author once accepted, until integrated.
    expect((await person(`W${father.id}`, author)).proposal).toEqual({ status: 'approved', isNew: true });
  });

  it('withdraws a proposed person with the pending proposals about them', async () => {
    const mother = await propose({
      kind: 'add-person',
      personId: 'I2',
      relation: 'parent',
      fields: { givenNames: 'Marie', surname: 'X', sex: 'F' },
    });
    await propose({
      kind: 'add-person',
      personId: `W${mother.id}`,
      relation: 'spouse',
      fields: { givenNames: 'Y', surname: 'Z' },
    });
    await request(server()).delete(`/api/contributions/${mother.id}`).set('Cookie', author).expect(204);
    const left = (await request(server()).get('/api/contributions/mine').set('Cookie', author))
      .body as ContributionDto[];
    expect(left.some((c) => c.personId === `W${mother.id}`)).toBe(false);
    // A proposal already accepted cannot be withdrawn, nor the person it is about.
    await request(server()).delete(`/api/contributions/${father.id}`).set('Cookie', author).expect(409);
  });

  it('exports the chain and follows it when it is integrated', async () => {
    await request(server()).post('/api/admin/contributions/export').set('Cookie', admin).expect(200);
    // The genealogy software received the father and the grandfather (under its own references).
    const updated = fixture
      .replace('0 @I2@ INDI', '0 @I2@ INDI\n1 FAMC @F90@')
      .replace(
        '0 TRLR',
        [
          '0 @I90@ INDI',
          '1 NAME Jacques /DUPRÉ/',
          '1 FAMS @F90@',
          '1 FAMC @F91@',
          '0 @I91@ INDI',
          '1 NAME Pierre /DUPRÉ/',
          '1 FAMS @F91@',
          '0 @F90@ FAM',
          '1 HUSB @I90@',
          '1 CHIL @I2@',
          '0 @F91@ FAM',
          '1 HUSB @I91@',
          '1 CHIL @I90@',
          '0 TRLR',
        ].join('\n'),
      );
    const path = join(await mkdtemp(join(tmpdir(), 'chain-')), 'martin.ged');
    await writeFile(path, updated);
    const imports = ctx.app.get(ImportsService);
    const seed = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } });
    const run = await imports.preview(
      { id: seed.id, email: seed.email, role: 'ADMIN', canSeeContemporary: true },
      { path, fileName: 'martin.ged' },
    );
    await imports.commit(run.id);
    const statuses = new Map(
      ((await request(server()).get('/api/admin/contributions').set('Cookie', admin)).body as ContributionDto[]).map(
        (c) => [c.id, c.status],
      ),
    );
    expect(statuses.get(father.id)).toBe('integrated');
    expect(statuses.get(grandfather.id)).toBe('integrated');
    // The author now sees the genealogy data: no proposed person left for them.
    const helene = await person('I2', author);
    expect(helene.fatherId).toBe('I90');
    expect(helene.proposal).toBeUndefined();
  });

  it('deletes the document of a rejected proposal', async () => {
    const stored = () =>
      readdirSync(ctx.app.get(MediaStore).dir).filter((name) => !name.startsWith('.') && name !== 'thumbnails');
    const before = stored().length;
    const document = (
      await request(server())
        .post('/api/contributions/media')
        .set('Cookie', author)
        .field('personId', 'I1')
        .attach('file', Buffer.from('rejected-bytes'), 'refus.jpg')
        .expect(201)
    ).body as ContributionDto;
    expect(stored()).toHaveLength(before + 1);
    const rejected = (await review(document.id, 'rejected').expect(200)).body as ContributionDto;
    expect(rejected.media).toMatchObject({ fileName: 'refus.jpg', available: false });
    expect(stored()).toHaveLength(before);
    await request(server()).get(`/api/admin/contributions/${document.id}/media`).set('Cookie', admin).expect(404);
  });
});
