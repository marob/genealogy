import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Documents stored on disk, named after the SHA-256 of their content: a file
 * provided by several imports is stored once.
 */
/** Largest side of the thumbnails, in pixels: 96 px thumbnails on high-density screens. */
const THUMBNAIL_SIZE = 192;

@Injectable()
export class MediaStore {
  private readonly logger = new Logger(MediaStore.name);
  readonly dir: string;
  private readonly thumbnailDir: string;
  /** Thumbnails being generated, so that concurrent requests wait for the same one. */
  private readonly pending = new Map<string, Promise<string | undefined>>();

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    // Next to the database by default (the /data volume in the Docker image).
    const database = config.get('DATABASE_URL', { infer: true }).replace(/^file:/, '');
    const mediaDir = config.get<string | undefined>('MEDIA_DIR');
    this.dir = resolve(mediaDir ?? join(dirname(database), 'media'));
    this.thumbnailDir = join(this.dir, 'thumbnails');
    mkdirSync(this.thumbnailDir, { recursive: true });
  }

  /**
   * Small WebP version of an image, generated on first request then kept on
   * disk. Undefined if the file is not an image that can be resized.
   */
  async thumbnail(hash: string, mimeType: string): Promise<string | undefined> {
    if (!mimeType.startsWith('image/')) {
      return undefined;
    }
    const path = join(this.thumbnailDir, `${hash}.webp`);
    if (existsSync(path)) {
      return path;
    }
    let pending = this.pending.get(hash);
    if (!pending) {
      pending = this.createThumbnail(hash, path).finally(() => this.pending.delete(hash));
      this.pending.set(hash, pending);
    }
    return pending;
  }

  private async createThumbnail(hash: string, path: string): Promise<string | undefined> {
    const temporary = `${path}.${randomUUID()}`;
    try {
      await sharp(this.path(hash))
        .rotate() // EXIF orientation of photos taken with a phone
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toFile(temporary);
      await rename(temporary, path);
      return path;
    } catch (error) {
      // Format not supported by the image library (BMP…): the original is served.
      this.logger.warn(`No thumbnail for ${hash}: ${(error as Error).message}`);
      await rm(temporary, { force: true });
      return undefined;
    }
  }

  path(hash: string): string {
    return join(this.dir, hash);
  }

  /** Writes a stream to the store; returns its hash and size. */
  async write(stream: Readable): Promise<{ hash: string; size: number }> {
    const temporary = join(this.dir, `.upload-${randomUUID()}`);
    const hash = createHash('sha256');
    let size = 0;
    const measure = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        size += chunk.length;
        callback(null, chunk);
      },
    });
    try {
      await pipeline(stream, measure, createWriteStream(temporary));
      const digest = hash.digest('hex');
      // Same name = same content: replacing an existing file is harmless.
      await rename(temporary, this.path(digest));
      return { hash: digest, size };
    } finally {
      await rm(temporary, { force: true });
    }
  }

  /** Deletes the files no longer referenced by an import or a document. */
  async collectGarbage(): Promise<void> {
    const unused = await this.prisma.mediaFile.findMany({
      where: { imports: { none: {} }, media: { none: {} } },
      select: { hash: true },
    });
    if (unused.length === 0) {
      return;
    }
    await this.prisma.mediaFile.deleteMany({ where: { hash: { in: unused.map((file) => file.hash) } } });
    await Promise.all(
      unused.flatMap(({ hash }) => [
        rm(this.path(hash), { force: true }),
        rm(join(this.thumbnailDir, `${hash}.webp`), { force: true }),
      ]),
    );
    this.logger.log(`Deleted ${unused.length} unused document(s)`);
  }
}
