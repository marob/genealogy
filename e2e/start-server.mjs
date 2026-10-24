// Starts the built application for the e2e tests.
//   node start-server.mjs admin   → authentication disabled (everyone is an admin), applies the migrations
//   node start-server.mjs public  → anonymous visitor, waits for the admin server to prepare the database
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'e2e', '.data');
const role = process.argv[2];
const port = role === 'admin' ? 3101 : 3102;
const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(port),
  DATABASE_URL: `file:${join(dataDir, 'e2e.db')}`,
  PUBLIC_URL: `http://localhost:${port}`,
  SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
  AUTH_DEV_BYPASS: role === 'admin' ? 'true' : 'false',
  STATIC_DIR: join(root, 'frontend', 'dist', 'browser'),
  LOG_FORMAT: 'json',
};
const backend = join(root, 'backend');

if (role === 'admin') {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
  const migrate = spawnSync('npx', ['--no-install', 'prisma', 'migrate', 'deploy'], {
    cwd: backend,
    env,
    stdio: 'inherit',
  });
  if (migrate.status !== 0) {
    process.exit(migrate.status ?? 1);
  }
} else {
  // Shared database: wait for the admin server to create it.
  for (;;) {
    try {
      if ((await fetch('http://localhost:3101/api/health')).ok) {
        break;
      }
    } catch {
      // Not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

const server = spawn('node', ['dist/main.js'], { cwd: backend, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
server.on('exit', (code) => process.exit(code ?? 0));
