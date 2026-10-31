import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Documents stored on disk, named after the SHA-256 of their content: a file
 * provided by several imports is stored once.
 */
@Injectable()
export class MediaStore {
  private readonly logger = new Logger(MediaStore.name);
  readonly dir: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    // Next to the database by default (the /data volume in the Docker image).
    const database = config.get('DATABASE_URL', { infer: true }).replace(/^file:/, '');
    const mediaDir = config.get<string | undefined>('MEDIA_DIR');
    this.dir = resolve(mediaDir ?? join(dirname(database), 'media'));
    mkdirSync(this.dir, { recursive: true });
  }

  path(hash: string): string {
    return join(this.dir, hash);
  }

  read(hash: string): Readable {
    return createReadStream(this.path(hash));
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
    await Promise.all(unused.map(({ hash }) => rm(this.path(hash), { force: true })));
    this.logger.log(`Deleted ${unused.length} unused document(s)`);
  }
}
