import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ImportDto, PersonDto } from '@genealogie/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import sharp from 'sharp';
import yazl from 'yazl';
import { MediaStore } from '../src/media/media-store.service.js';
import { createTestApp, loginAs, type TestContext } from './utils/test-app.js';

/** Louis (born 1850) and his granddaughter Zoé (born 1990), with documents. */
const gedcom = [
  '0 HEAD',
  '1 CHAR UTF-8',
  '0 @I1@ INDI',
  '1 NAME Louis /ROBERT/',
  '1 BIRT',
  '2 DATE 1850',
  '2 OBJE',
  '3 FILE D:\\Actes\\Naissance Louis.png',
  '1 _IMAGE',
  '2 OBJE',
  '3 FILE D:\\Photos\\ROBERT Louis.jpg',
  '1 _IMAGE',
  '2 OBJE',
  '3 FILE D:\\Photos\\Perdue.jpg',
  '1 FAMS @F1@',
  '0 @I2@ INDI',
  '1 NAME Zoé /ROBERT/',
  '1 BIRT',
  '2 DATE 1990',
  '1 _IMAGE',
  '2 OBJE',
  '3 FILE Zoé.jpg',
  '1 FAMC @F1@',
  '0 @F1@ FAM',
  '1 HUSB @I1@',
  '1 CHIL @I2@',
  '1 MARR',
  '2 DATE 1875',
  '2 OBJE',
  '3 FILE Mariage.pdf',
  '0 TRLR',
].join('\n');

/** A real photo, to check the thumbnails. */
const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#a33' } })
  .jpeg()
  .toBuffer();

const files: Record<string, string | Buffer> = {
  'Actes/Naissance Louis.png': 'png-bytes',
  'photos/robert louis.JPG': 'jpg-bytes',
  'Zoé.jpg': photo,
  'Mariage.pdf': '%PDF-1.4',
  'Inutile.jpg': 'not referenced',
};

function zip(entries: Record<string, string | Buffer>): Promise<Buffer> {
  const archive = new yazl.ZipFile();
  for (const [name, content] of Object.entries(entries)) {
    archive.addBuffer(Buffer.from(content), name);
  }
  archive.end();
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    archive.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    archive.outputStream.on('error', reject);
  });
}

describe('Documents (photos, scanned records)', () => {
  let ctx: TestContext;
  let admin: string;
  let trusted: string;
  const server = (): App => ctx.app.getHttpServer() as App;
  const storedFiles = () =>
    readdirSync(ctx.app.get(MediaStore).dir).filter((name) => !name.startsWith('.') && name !== 'thumbnails');

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await loginAs(ctx, { email: 'admin@example.com', role: 'ADMIN' });
    trusted = await loginAs(ctx, { email: 'trusted@example.com', canSeeContemporary: true });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const commit = async (preview: ImportDto) =>
    request(server()).post(`/api/admin/imports/${preview.id}/commit`).set('Cookie', admin).expect(201);
  const person = async (id: string, cookie?: string) => {
    const req = request(server()).get(`/api/persons/${id}`);
    return ((await (cookie ? req.set('Cookie', cookie) : req).expect(200)).body as PersonDto[])[0]!;
  };

  it('imports a GEDCOM with a zip of its documents', async () => {
    const preview = (
      await request(server())
        .post('/api/admin/imports')
        .set('Cookie', admin)
        .attach('file', Buffer.from(gedcom), 'robert.ged')
        .attach('media', await zip(files), 'documents.zip')
        .expect(201)
    ).body as ImportDto;
    expect(preview.stats.media).toEqual({ referenced: 5, found: 4 });
    expect(preview.warnings[0]).toBe('1 of 5 documents not provided: Perdue.jpg');
    // Only the referenced files are kept.
    expect(storedFiles()).toHaveLength(4);
    await commit(preview);
  });

  it('lists the documents of a person, available or not', async () => {
    const louis = await person('I1');
    expect(louis.media).toEqual([
      {
        id: expect.any(Number),
        fileName: 'Naissance Louis.png',
        mimeType: 'image/png',
        eventType: 'BIRT',
        available: true,
      },
      { id: expect.any(Number), fileName: 'ROBERT Louis.jpg', mimeType: 'image/jpeg', available: true },
      { id: expect.any(Number), fileName: 'Perdue.jpg', available: false },
    ]);
    expect(louis.unions[0]!.media).toEqual([
      {
        id: expect.any(Number),
        fileName: 'Mariage.pdf',
        mimeType: 'application/pdf',
        eventType: 'MARR',
        available: true,
      },
    ]);
  });

  it('serves the content of a document', async () => {
    const photo = (await person('I1')).media[1]!;
    const response = await request(server()).get(`/api/media/${photo.id}`).expect(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.headers['content-disposition']).toBe("inline; filename*=UTF-8''ROBERT%20Louis.jpg");
    expect(response.headers['cache-control']).toBe('private, max-age=86400');
    expect(Buffer.from(response.body as Buffer).toString()).toBe('jpg-bytes');
    await request(server())
      .get(`/api/media/${photo.id}`)
      .set('If-None-Match', String(response.headers.etag))
      .expect(304);
    await request(server())
      .get(`/api/media/${(await person('I1')).media[2]!.id}`)
      .expect(404);
    await request(server()).get('/api/media/99999').expect(404);
  });

  it('serves a small WebP version of the photos', async () => {
    const zoe = (await person('I2', trusted)).media[0]!;
    const response = await request(server()).get(`/api/media/${zoe.id}/thumbnail`).set('Cookie', trusted).expect(200);
    expect(response.headers['content-type']).toBe('image/webp');
    const { width, height, format } = await sharp(response.body as Buffer).metadata();
    expect({ width, height, format }).toEqual({ width: 192, height: 144, format: 'webp' });
    expect(Number(response.headers['content-length'])).toBeLessThan(photo.length);
    // Cached on disk: served again without being regenerated.
    await request(server()).get(`/api/media/${zoe.id}/thumbnail`).set('Cookie', trusted).expect(200);
    // Same privacy rule as the original.
    await request(server()).get(`/api/media/${zoe.id}/thumbnail`).expect(404);
  });

  it('serves the original when it cannot be resized', async () => {
    const pdf = (await person('I1')).unions[0]!.media[0]!;
    const response = await request(server()).get(`/api/media/${pdf.id}/thumbnail`).expect(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    const invalid = (await person('I1')).media[1]!;
    const fallback = await request(server()).get(`/api/media/${invalid.id}/thumbnail`).expect(200);
    expect(Buffer.from(fallback.body as Buffer).toString()).toBe('jpg-bytes');
  });

  it('applies the privacy rule to documents', async () => {
    expect((await person('I2')).media).toEqual([]);
    const zoe = (await person('I2', trusted)).media[0]!;
    expect(zoe.available).toBe(true);
    await request(server()).get(`/api/media/${zoe.id}`).expect(404);
    await request(server()).get(`/api/media/${zoe.id}`).set('Cookie', trusted).expect(200);
  });

  it('accepts a single zip containing the GEDCOM and its documents', async () => {
    const preview = (
      await request(server())
        .post('/api/admin/imports')
        .set('Cookie', admin)
        .attach('file', await zip({ ...files, 'export/robert.ged': gedcom }), 'export.zip')
        .expect(201)
    ).body as ImportDto;
    expect(preview).toMatchObject({ fileName: 'robert.ged', stats: { media: { referenced: 5, found: 4 } } });
    // Same contents: stored once.
    expect(storedFiles()).toHaveLength(4);
  });

  it('rejects an archive without a GEDCOM file', async () => {
    const response = await request(server())
      .post('/api/admin/imports')
      .set('Cookie', admin)
      .attach('file', await zip(files), 'photos.zip');
    expect(response.status).toBe(400);
    expect((response.body as { message: string }).message).toBe('No GEDCOM (.ged) file in the archive.');
  });

  it('deletes the files no longer used', async () => {
    const withoutMedia = (
      await request(server())
        .post('/api/admin/imports')
        .set('Cookie', admin)
        .attach('file', Buffer.from(gedcom), 'robert.ged')
        .expect(201)
    ).body as ImportDto;
    expect(withoutMedia.stats.media).toEqual({ referenced: 5, found: 0 });
    await commit(withoutMedia);
    const runs = (await request(server()).get('/api/admin/imports').set('Cookie', admin).expect(200))
      .body as ImportDto[];
    for (const run of runs.filter((r) => !r.current)) {
      await request(server()).delete(`/api/admin/imports/${run.id}`).set('Cookie', admin).expect(204);
    }
    expect(storedFiles()).toHaveLength(0);
    expect(readdirSync(join(ctx.app.get(MediaStore).dir, 'thumbnails'))).toEqual([]);
    expect((await person('I1')).media.every((m) => !m.available)).toBe(true);
  });
});
