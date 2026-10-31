import { open, readFile } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { ImportDto, ImportStatsDto, ImportStatus } from '@genealogie/shared';
import type { AuthUser } from '../auth/auth-user.js';
import { parseGedcom } from '../gedcom/gedcom-parser.js';
import type { ImportRun } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ROOT_PERSON_KEY, SettingsService } from '../settings/settings.service.js';
import { baseName, mediaKey, mimeTypeOf } from '../gedcom/media.js';
import { MediaStore } from '../media/media-store.service.js';
import { type ArchiveEntry, isZip, openZip } from '../media/zip-archive.js';
import { replaceGenealogy } from './genealogy-writer.js';

/** Maximum number of warnings kept for an import. */
const MAX_WARNINGS = 500;
/** Missing documents listed by name in the warnings. */
const MAX_LISTED_MEDIA = 20;
export const MAX_GEDCOM_SIZE = 100 * 1024 * 1024;

/** Files received for an import (temporary files on disk). */
export interface UploadedImport {
  /** GEDCOM file, or zip archive containing the GEDCOM and its documents. */
  path: string;
  fileName: string;
  /** Optional zip archive of the documents. */
  mediaPath?: string;
  /** false to leave the notes out of the tree (default: true). */
  importNotes?: boolean;
}

async function readHead(path: string): Promise<Uint8Array> {
  const file = await open(path);
  try {
    const buffer = new Uint8Array(4);
    await file.read(buffer, 0, 4, 0);
    return buffer;
  } finally {
    await file.close();
  }
}

async function readAll(stream: Readable, limit: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limit) {
      stream.destroy();
      throw new BadRequestException('The GEDCOM file is too large.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Version of the data derived at import time (privacy birth keys, date keys).
 * Bumping it re-applies the current import at startup.
 */
const DERIVED_DATA_VERSION = '3';
const DERIVED_DATA_KEY = 'derivedDataVersion';

type ImportSummary = Omit<ImportRun, 'content'>;
const summarySelect = {
  id: true,
  createdAt: true,
  committedAt: true,
  status: true,
  fileName: true,
  encoding: true,
  gedcomVersion: true,
  sourceSoftware: true,
  stats: true,
  warnings: true,
  userId: true,
  importNotes: true,
} as const;

@Injectable()
export class ImportsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly mediaStore: MediaStore,
  ) {}

  /** Recomputes the derived data when the rules changed since the last import. */
  async onApplicationBootstrap(): Promise<void> {
    if ((await this.settings.get(DERIVED_DATA_KEY)) === DERIVED_DATA_VERSION) {
      return;
    }
    const currentId = await this.currentImportId();
    if (currentId !== undefined) {
      this.logger.log(`Re-applying import ${currentId} (derived data version ${DERIVED_DATA_VERSION})`);
      await this.commit(currentId);
    }
    await this.settings.set(DERIVED_DATA_KEY, DERIVED_DATA_VERSION);
  }

  private toDto(run: ImportSummary, currentId: number | undefined): ImportDto {
    const stats = JSON.parse(run.stats) as ImportStatsDto & { declaredCharset?: string };
    const { declaredCharset, ...importStats } = stats;
    return {
      id: run.id,
      status: run.status as ImportStatus,
      fileName: run.fileName,
      encoding: run.encoding,
      createdAt: run.createdAt.toISOString(),
      stats: importStats,
      warnings: JSON.parse(run.warnings) as string[],
      current: run.id === currentId,
      importNotes: run.importNotes,
      ...(declaredCharset ? { declaredCharset } : {}),
      ...(run.gedcomVersion ? { gedcomVersion: run.gedcomVersion } : {}),
      ...(run.sourceSoftware ? { sourceSoftware: run.sourceSoftware } : {}),
      ...(run.committedAt ? { committedAt: run.committedAt.toISOString() } : {}),
    };
  }

  private async currentImportId(): Promise<number | undefined> {
    const current = await this.prisma.importRun.findFirst({
      where: { status: 'committed' },
      orderBy: { committedAt: 'desc' },
      select: { id: true },
    });
    return current?.id;
  }

  async list(): Promise<ImportDto[]> {
    const [runs, currentId] = await Promise.all([
      this.prisma.importRun.findMany({ select: summarySelect, orderBy: { createdAt: 'desc' } }),
      this.currentImportId(),
    ]);
    return runs.map((run) => this.toDto(run, currentId));
  }

  /**
   * Parses a GEDCOM file and stores it pending confirmation, with the
   * documents it references found in the archive (a zip of documents next to
   * the GEDCOM, or a single zip containing both).
   */
  async preview(user: AuthUser, upload: UploadedImport): Promise<ImportDto> {
    const head = await readHead(upload.path);
    const archives: Awaited<ReturnType<typeof openZip>>[] = [];
    try {
      let fileName = upload.fileName;
      let content: Uint8Array;
      if (isZip(head)) {
        const archive = await openZip(upload.path);
        archives.push(archive);
        const gedcoms = archive.entries.filter((entry) => /\.ged$/i.test(entry.path));
        const gedcom = gedcoms[0];
        if (!gedcom) {
          throw new BadRequestException('No GEDCOM (.ged) file in the archive.');
        }
        fileName = baseName(gedcom.path);
        content = await readAll(await gedcom.open(), MAX_GEDCOM_SIZE);
      } else {
        content = await readFile(upload.path);
      }
      if (upload.mediaPath) {
        archives.push(await openZip(upload.mediaPath));
      }
      return await this.createPreview(
        user,
        { fileName, content, importNotes: upload.importNotes ?? true },
        archives.flatMap((archive) => archive.entries),
      );
    } catch (error) {
      await this.mediaStore.collectGarbage();
      throw error;
    } finally {
      for (const archive of archives) {
        archive.close();
      }
    }
  }

  private async createPreview(
    user: AuthUser,
    { fileName, content, importNotes }: { fileName: string; content: Uint8Array; importNotes: boolean },
    entries: ArchiveEntry[],
  ): Promise<ImportDto> {
    if (content.length === 0) {
      throw new BadRequestException('The file is empty.');
    }
    const result = parseGedcom(content);
    if (result.persons.length === 0) {
      throw new BadRequestException('No person found: this file is not a valid GEDCOM.');
    }

    // Documents referenced by the GEDCOM and provided in the archives.
    const referenced = new Map(
      [...result.persons, ...result.families].flatMap((record) => record.media).map((m) => [mediaKey(m.file), m.file]),
    );
    const files = new Map<string, { fileName: string; hash: string; size: number; mimeType: string }>();
    for (const entry of entries) {
      const key = mediaKey(entry.path);
      if (referenced.has(key) && !files.has(key)) {
        const name = baseName(entry.path);
        files.set(key, {
          fileName: name,
          mimeType: mimeTypeOf(name),
          ...(await this.mediaStore.write(await entry.open())),
        });
      }
    }
    const missing = [...referenced].filter(([key]) => !files.has(key)).map(([, file]) => baseName(file));
    const mediaWarnings =
      referenced.size && missing.length
        ? [
            `${missing.length} of ${referenced.size} documents not provided: ${missing.slice(0, MAX_LISTED_MEDIA).join(', ')}${
              missing.length > MAX_LISTED_MEDIA ? ', …' : ''
            }`,
          ]
        : [];

    const allWarnings = [...mediaWarnings, ...result.warnings];
    const warnings =
      allWarnings.length > MAX_WARNINGS
        ? [...allWarnings.slice(0, MAX_WARNINGS), `… and ${allWarnings.length - MAX_WARNINGS} more warnings.`]
        : allWarnings;
    const stats = {
      ...result.stats,
      declaredCharset: result.decoded.declaredCharset,
      media: { referenced: referenced.size, found: files.size },
    };
    const run = await this.prisma.$transaction(async (tx) => {
      for (const file of files.values()) {
        await tx.mediaFile.upsert({
          where: { hash: file.hash },
          create: { hash: file.hash, size: file.size, mimeType: file.mimeType },
          update: {},
        });
      }
      return tx.importRun.create({
        data: {
          status: 'preview',
          fileName,
          encoding: result.decoded.encoding,
          gedcomVersion: result.header.gedcomVersion ?? null,
          sourceSoftware: result.header.sourceSoftware ?? null,
          stats: JSON.stringify(stats),
          warnings: JSON.stringify(warnings),
          content: Uint8Array.from(content),
          importNotes,
          userId: user.id,
          files: { create: [...files].map(([key, file]) => ({ key, fileName: file.fileName, hash: file.hash })) },
        },
        select: summarySelect,
      });
    });
    return this.toDto(run, await this.currentImportId());
  }

  /**
   * Applies an import: replaces all genealogy data. An already committed
   * import can be re-applied (rollback to a previous version).
   */
  async commit(id: number): Promise<ImportDto> {
    const run = await this.prisma.importRun.findUnique({ where: { id } });
    if (!run) {
      throw new NotFoundException('Import not found.');
    }
    const data = parseGedcom(run.content);
    if (!run.importNotes) {
      for (const person of data.persons) {
        delete person.note;
      }
    }
    const files = new Map(
      (await this.prisma.importFile.findMany({ where: { importId: id } })).map((file) => [file.key, file.hash]),
    );
    const committedAt = new Date();
    await this.prisma.$transaction(
      async (tx) => {
        await replaceGenealogy(tx, data, files);
        await tx.importRun.update({ where: { id }, data: { status: 'committed', committedAt } });
      },
      { timeout: 5 * 60_000, maxWait: 10_000 },
    );

    await this.mediaStore.collectGarbage();
    const rootId = await this.settings.get(ROOT_PERSON_KEY);
    if (!rootId || !data.persons.some((person) => person.id === rootId)) {
      await this.settings.set(ROOT_PERSON_KEY, data.persons[0]!.id);
    }
    const { content: _content, ...summary } = { ...run, status: 'committed', committedAt };
    return this.toDto(summary, id);
  }

  async delete(id: number): Promise<void> {
    if (id === (await this.currentImportId())) {
      throw new ConflictException('The currently applied import cannot be deleted.');
    }
    const { count } = await this.prisma.importRun.deleteMany({ where: { id } });
    if (count === 0) {
      throw new NotFoundException('Import not found.');
    }
    await this.mediaStore.collectGarbage();
  }
}
