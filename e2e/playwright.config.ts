import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the built application (run `npm run build`
 * first). Two instances share the same SQLite database:
 *  - "admin" (port 3101) with authentication disabled, used to import;
 *  - "public" (port 3102) to check what an anonymous visitor sees.
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
