import request from 'supertest';
import type { App } from 'supertest/types.js';
import yauzl from 'yauzl';

/** Entries of a zip archive, by name. */
export async function unzip(content: Buffer): Promise<Map<string, Buffer>> {
  const zip = await yauzl.fromBufferPromise(content, { lazyEntries: true });
  const entries = new Map<string, Buffer>();
  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      void zip.openReadStreamPromise(entry).then((stream) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          entries.set(entry.fileName, Buffer.concat(chunks));
          zip.readEntry();
        });
      }, reject);
    });
    zip.on('end', resolve);
    zip.on('error', reject);
    zip.readEntry();
  });
  return entries;
}

/** Exports the approved contributions; returns the entries of the archive. */
export async function exportArchive(server: App, cookie: string): Promise<Map<string, Buffer>> {
  const response = await request(server)
    .post('/api/admin/contributions/export')
    .set('Cookie', cookie)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  return unzip(response.body as Buffer);
}
