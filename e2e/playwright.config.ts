import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout sur l'application compilée (`npm run build` au
 * préalable). Deux instances partagent la même base SQLite :
 *  - « admin » (port 3101) en mode sans authentification, pour importer ;
 *  - « public » (port 3102) pour vérifier ce que voit un visiteur anonyme.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    locale: 'fr-FR',
    timezoneId: 'Pacific/Kiritimati',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'import', testMatch: /import\.setup\.ts/, use: { baseURL: 'http://localhost:3101' } },
    {
      name: 'admin',
      testMatch: /admin\/.*\.spec\.ts/,
      dependencies: ['import'],
      use: { baseURL: 'http://localhost:3101' },
    },
    {
      name: 'public',
      testMatch: /public\/.*\.spec\.ts/,
      dependencies: ['import'],
      use: { baseURL: 'http://localhost:3102' },
    },
  ],
  webServer: [
    { command: 'node start-server.mjs admin', url: 'http://localhost:3101/api/health', reuseExistingServer: false },
    { command: 'node start-server.mjs public', url: 'http://localhost:3102/api/health', reuseExistingServer: false },
  ],
});
