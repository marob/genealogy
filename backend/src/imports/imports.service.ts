import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ImportDto, ImportStatsDto, ImportStatus } from '@genealogie/shared';
import type { AuthUser } from '../auth/auth-user.js';
import { parseGedcom } from '../gedcom/gedcom-parser.js';
import type { ImportRun } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ROOT_PERSON_KEY, SettingsService } from '../settings/settings.service.js';
import { replaceGenealogy } from './genealogy-writer.js';

/** Maximum number of warnings kept for an import. */
const MAX_WARNINGS = 500;

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
} as const;

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

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

  /** Parses a file and stores it pending confirmation. */
  async preview(user: AuthUser, fileName: string, content: Uint8Array): Promise<ImportDto> {
    if (content.length === 0) {
      throw new BadRequestException('The file is empty.');
    }
    const result = parseGedcom(content);
    if (result.persons.length === 0) {
      throw new BadRequestException('No person found: this file is not a valid GEDCOM.');
    }
    const warnings =
      result.warnings.length > MAX_WARNINGS
        ? [...result.warnings.slice(0, MAX_WARNINGS), `… and ${result.warnings.length - MAX_WARNINGS} more warnings.`]
        : result.warnings;
    const run = await this.prisma.importRun.create({
      data: {
        status: 'preview',
        fileName,
        encoding: result.decoded.encoding,
        gedcomVersion: result.header.gedcomVersion ?? null,
        sourceSoftware: result.header.sourceSoftware ?? null,
        stats: JSON.stringify({ ...result.stats, declaredCharset: result.decoded.declaredCharset }),
        warnings: JSON.stringify(warnings),
        content: Uint8Array.from(content),
        userId: user.id,
      },
      select: summarySelect,
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
    const committedAt = new Date();
    await this.prisma.$transaction(
      async (tx) => {
        await replaceGenealogy(tx, data);
        await tx.importRun.update({ where: { id }, data: { status: 'committed', committedAt } });
      },
      { timeout: 5 * 60_000, maxWait: 10_000 },
    );

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
  }
}
