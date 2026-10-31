import type { Readable } from 'node:stream';
import yauzl from 'yauzl';

/** A file of a zip archive. */
export interface ArchiveEntry {
  /** Path inside the archive. */
  path: string;
  open(): Promise<Readable>;
}

/** Reads the file list of a zip archive (contents are streamed on demand). */
export async function openZip(path: string): Promise<{ entries: ArchiveEntry[]; close(): void }> {
  const zip = await yauzl.openPromise(path, { lazyEntries: true, autoClose: false });
  const entries = await new Promise<yauzl.Entry[]>((resolve, reject) => {
    const list: yauzl.Entry[] = [];
    zip.on('entry', (entry: yauzl.Entry) => {
      list.push(entry);
      zip.readEntry();
    });
    zip.on('end', () => resolve(list));
    zip.on('error', reject);
    zip.readEntry();
  });
  return {
    entries: entries
      // Folders and macOS metadata.
      .filter((entry) => !entry.fileName.endsWith('/') && !/(^|\/)(__MACOSX|\.DS_Store)/.test(entry.fileName))
      .map((entry) => ({ path: entry.fileName, open: () => zip.openReadStreamPromise(entry) })),
    close: () => zip.close(),
  };
}

/** True if the file starts with the zip signature. */
export function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}
