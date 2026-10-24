import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    // Each file has its own temporary database; explicit isolation because the
    // Nest configuration is read once per process.
    isolate: true,
    env: { NODE_ENV: 'test' },
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/main.ts', 'src/**/*.spec.ts'],
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage/integration',
    },
  },
});
