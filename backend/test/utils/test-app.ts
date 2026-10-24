import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Database from 'better-sqlite3';
import type { Response } from 'express';
import { SessionService } from '../../src/auth/session.service.js';
import { ImportsService } from '../../src/imports/imports.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { setupApp } from '../../src/setup-app.js';

const migrationsDir = join(import.meta.dirname, '../../prisma/migrations');

/** Crée une base SQLite temporaire avec toutes les migrations appliquées. */
function createTestDatabase(): { url: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'genealogie-test-'));
  const file = join(dir, 'test.db');
  const db = new Database(file);
  for (const migration of readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    db.exec(readFileSync(join(migrationsDir, migration, 'migration.sql'), 'utf8'));
  }
  db.close();
  return { url: `file:${file}`, dir };
}

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  close: () => Promise<void>;
}

export async function createTestApp(env: Record<string, string> = {}): Promise<TestContext> {
  const database = createTestDatabase();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: database.url,
    SESSION_SECRET: 'test-secret-test-secret-test-secret',
    PUBLIC_URL: 'http://localhost:4200',
    AUTH_DEV_BYPASS: 'false',
    ADMIN_EMAILS: '',
    ...env,
  });
  // Import dynamique : la configuration est lue au chargement du module, donc
  // après avoir positionné les variables d'environnement de test.
  const { AppModule } = await import('../../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  setupApp(app);
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    close: async () => {
      await app.close();
      rmSync(database.dir, { recursive: true, force: true });
    },
  };
}

/** Crée un utilisateur et renvoie le cookie de session correspondant. */
export async function loginAs(
  ctx: TestContext,
  user: { email: string; role?: 'ADMIN' | 'MEMBER'; canSeeContemporary?: boolean },
): Promise<string> {
  const created = await ctx.prisma.user.create({ data: { role: 'MEMBER', ...user } });
  let cookie = '';
  const response = {
    cookie: (name: string, value: string) => {
      cookie = `${name}=${value}`;
    },
  };
  await ctx.app.get(SessionService).openSession(response as unknown as Response, created.id);
  return cookie;
}

/** Importe et applique un fichier GEDCOM de test. */
export async function seedGedcom(ctx: TestContext, content: Uint8Array | string): Promise<void> {
  const imports = ctx.app.get(ImportsService);
  const admin = await ctx.prisma.user.upsert({
    where: { email: 'seed@example.com' },
    create: { email: 'seed@example.com', role: 'ADMIN' },
    update: {},
  });
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const preview = await imports.preview({ ...admin, role: 'ADMIN' }, 'seed.ged', bytes);
  await imports.commit(preview.id);
}
