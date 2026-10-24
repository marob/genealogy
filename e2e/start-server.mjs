// Démarre l'application compilée pour les tests e2e.
//   node start-server.mjs admin   → mode sans authentification (tout le monde est admin), applique les migrations
//   node start-server.mjs public  → visiteur anonyme, attend que le serveur admin ait préparé la base
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
  // Base partagée : on attend que le serveur admin l'ait créée.
  for (;;) {
    try {
      if ((await fetch('http://localhost:3101/api/health')).ok) {
        break;
      }
    } catch {
      // Pas encore prêt.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

const server = spawn('node', ['dist/main.js'], { cwd: backend, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
server.on('exit', (code) => process.exit(code ?? 0));
