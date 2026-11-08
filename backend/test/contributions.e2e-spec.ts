import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContributionDto } from '@genealogie/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { parseGedcom } from '../src/gedcom/gedcom-parser.js';
import { ImportsService } from '../src/imports/imports.service.js';
import { createTestApp, loginAs, seedGedcom, type TestContext } from './utils/test-app.js';
import { unzip } from './utils/zip.js';

const fixture = readFileSync(join(import.meta.dirname, 'fixtures/famille-martin.ged'), 'utf8');

describe('Contributions', () => {
  let ctx: TestContext;
  let admin: string;
  let member: string;
  const server = (): App => ctx.app.getHttpServer() as App;
  const propose = (body: object, cookie = member) =>
    request(server()).post('/api/contributions').set('Cookie', cookie).send(body);

  beforeAll(async () => {
    ctx = await createTestApp();
    await seedGedcom(ctx, fixture);
    admin = await loginAs(ctx, { email: 'admin@example.com', role: 'ADMIN' });
    member = await loginAs(ctx, { email: 'member@example.com' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('proposals', () => {
    it('are reserved to signed-in members', async () => {
      await request(server())
        .post('/api/contributions')
        .send({ kind: 'edit', personId: 'I1', fields: { deathDate: '1921' } })
        .expect(401);
    });

    it('record the changed fields and their previous values', async () => {
      const response = await propose({
        kind: 'edit',
        personId: 'I1',
        fields: { givenNames: 'Émile Joseph', deathDate: '12/03/1921', deathPlace: 'Lyon' },
        comment: 'Acte de décès trouvé aux archives',
      }).expect(201);
      expect(response.body).toMatchObject([
        {
          kind: 'edit',
          status: 'pending',
          person: { givenNames: 'Émile Joseph', surname: 'MARTIN' },
          // The unchanged given names are not kept.
          fields: { deathDate: '12/03/1921', deathPlace: 'Lyon' },
          previous: {
            deathDate: 'ABT 1920',
            deathPlace: 'Villeurbanne, 69266, Rhône, Auvergne-Rhône-Alpes, France',
          },
          author: { name: 'member@example.com' },
        },
      ]);
    });

    it('are refused on persons whose details are hidden, without change or with a wrong date', async () => {
      expect((await propose({ kind: 'edit', personId: 'I4', fields: { occupation: 'X' } })).status).toBe(403);
      const unchanged = await propose({ kind: 'edit', personId: 'I1', fields: { surname: 'MARTIN' } });
      expect(unchanged.status).toBe(400);
      const wrongDate = await propose({ kind: 'edit', personId: 'I1', fields: { birthDate: 'hier' } });
      expect((wrongDate.body as { message: string }).message).toBe('Date not understood: "hier".');
      const noName = await propose({ kind: 'add-person', personId: 'I1', relation: 'child', fields: {} });
      expect(noName.status).toBe(400);
    });

    it('add relatives and documents', async () => {
      await propose({
        kind: 'add-person',
        personId: 'I1',
        relation: 'child',
        familyId: 'F1',
        fields: { givenNames: 'Marcel', surname: 'MARTIN', sex: 'M', birthDate: 'vers 1885' },
      }).expect(201);
      await propose({
        kind: 'add-person',
        personId: 'I2',
        relation: 'parent',
        fields: { givenNames: 'Jacques', surname: 'DUPRÉ', sex: 'M' },
      }).expect(201);
      const document = await request(server())
        .post('/api/contributions/media')
        .set('Cookie', member)
        .field('personId', 'I1')
        .field('title', 'Portrait')
        .attach('file', Buffer.from('png-bytes'), 'Émile.png')
        .expect(201);
      expect((document.body as ContributionDto).media).toEqual({
        fileName: 'Émile.png',
        mimeType: 'image/png',
        title: 'Portrait',
        available: true,
      });
      const notAllowed = await request(server())
        .post('/api/contributions/media')
        .set('Cookie', member)
        .field('personId', 'I1')
        .attach('file', Buffer.from('<html>'), 'page.html');
      expect(notAllowed.status).toBe(400);
    });

    it('are listed for their author, who can withdraw them while pending', async () => {
      const [spouse] = (
        await propose({
          kind: 'add-person',
          personId: 'I3',
          relation: 'spouse',
          fields: { givenNames: 'Rose', surname: 'X' },
        })
      ).body as ContributionDto[];
      const mine = (await request(server()).get('/api/contributions/mine').set('Cookie', member).expect(200))
        .body as ContributionDto[];
      expect(mine.map((c) => c.kind)).toEqual(['add-person', 'add-media', 'add-person', 'add-person', 'edit']);
      await request(server()).delete(`/api/contributions/${spouse!.id}`).set('Cookie', admin).expect(404);
      await request(server()).delete(`/api/contributions/${spouse!.id}`).set('Cookie', member).expect(204);
    });
  });

  describe('review and export', () => {
    let pending: ContributionDto[];

    it('is reserved to administrators', async () => {
      await request(server()).get('/api/admin/contributions').set('Cookie', member).expect(403);
      pending = (await request(server()).get('/api/admin/contributions?status=pending').set('Cookie', admin))
        .body as ContributionDto[];
      expect(pending).toHaveLength(4);
      // The other partner of the union of a new child is given.
      expect(pending.find((c) => c.relation === 'child')?.partner).toEqual({ givenNames: 'Hélène', surname: 'DUPRÉ' });
    });

    it('approves or rejects contributions', async () => {
      const [document, parent, child, edit] = pending;
      for (const contribution of [document!, child!, edit!]) {
        await request(server())
          .patch(`/api/admin/contributions/${contribution.id}`)
          .set('Cookie', admin)
          .send({ status: 'approved' })
          .expect(200);
      }
      await request(server())
        .patch(`/api/admin/contributions/${parent!.id}`)
        .set('Cookie', admin)
        .send({ status: 'rejected' })
        .expect(200);
      await request(server())
        .patch(`/api/admin/contributions/${parent!.id}`)
        .set('Cookie', admin)
        .send({ status: 'approved' })
        .expect(409);
      const media = await request(server())
        .get(`/api/admin/contributions/${document!.id}/media`)
        .set('Cookie', admin)
        .expect(200);
      expect(media.headers['content-type']).toBe('image/png');
    });

    it('exports the approved contributions as a GEDCOM file with their documents', async () => {
      const response = await request(server())
        .post('/api/admin/contributions/export')
        .set('Cookie', admin)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(response.headers['content-type']).toBe('application/zip');
      const entries = await unzip(response.body as Buffer);
      const gedcomName = [...entries.keys()].find((name) => name.endsWith('.ged'))!;
      expect([...entries.keys()].sort()).toEqual([gedcomName, 'Émile.png'].sort());

      const gedcom = parseGedcom(entries.get(gedcomName)!);
      expect(gedcom.warnings).toEqual([]);
      const emile = gedcom.persons.find((p) => p.id === 'I1')!;
      // Same reference as in the genealogy software, proposed values applied.
      expect(emile.events.find((e) => e.type === 'DEAT')).toMatchObject({
        date: { date: { original: '12 MAR 1921' } },
        place: 'Lyon',
      });
      expect(emile.media).toEqual([{ file: 'Émile.png', title: 'Portrait' }]);
      expect(emile.note).toContain('Date de décès : ABT 1920 → 12 MAR 1921');
      expect(emile.note).toContain('Commentaire : Acte de décès trouvé aux archives');
      // The new child joins the existing union, with both partners as anchors.
      const child = gedcom.persons.find((p) => p.givenNames === 'Marcel')!;
      expect(child.id).toMatch(/^W\d+$/);
      expect(gedcom.families.find((f) => f.id === 'F1')).toMatchObject({
        partner1Id: 'I1',
        partner2Id: 'I2',
        childIds: [child.id],
      });
      expect(gedcom.persons.map((p) => p.id).sort()).toEqual(['I1', 'I2', child.id].sort());

      const statuses = (await request(server()).get('/api/admin/contributions').set('Cookie', admin))
        .body as ContributionDto[];
      expect(statuses.map((c) => c.status).sort()).toEqual(['exported', 'exported', 'exported', 'rejected']);
      await request(server()).post('/api/admin/contributions/export').set('Cookie', admin).expect(400);
    });

    it('marks the contributions found in a later import as integrated', async () => {
      // The genealogy software received the death date and the new child, not the document.
      const updated = fixture
        .replace('2 DATE ABT 1920\n2 PLAC Villeurbanne', '2 DATE 12 MAR 1921\n2 PLAC Lyon, 69123')
        .replace('1 CHIL @I4@', '1 CHIL @I4@\n1 CHIL @I99@')
        .replace('0 TRLR', '0 @I99@ INDI\n1 NAME Marcel /MARTIN/\n1 FAMC @F1@\n0 TRLR');
      const path = join(await mkdtemp(join(tmpdir(), 'reimport-')), 'martin.ged');
      await writeFile(path, updated);
      const imports = ctx.app.get(ImportsService);
      const seedAdmin = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } });
      const run = await imports.preview(
        { id: seedAdmin.id, email: seedAdmin.email, role: 'ADMIN', canSeeContemporary: true },
        {
          path,
          fileName: 'martin.ged',
        },
      );
      await imports.commit(run.id);
      const statuses = (
        (await request(server()).get('/api/admin/contributions').set('Cookie', admin)).body as ContributionDto[]
      ).map((c) => [c.kind, c.status]);
      expect(statuses).toEqual([
        ['add-media', 'exported'],
        ['add-person', 'rejected'],
        ['add-person', 'integrated'],
        ['edit', 'integrated'],
      ]);
    });
  });
});
