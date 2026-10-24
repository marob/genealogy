import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    // Chaque fichier a sa propre base temporaire ; isolation explicite car la
    // configuration Nest est lue une fois par processus.
    isolate: true,
    env: { NODE_ENV: 'test' },
  },
});
