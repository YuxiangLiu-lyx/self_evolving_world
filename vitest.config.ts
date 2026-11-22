import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@self-evolving-world/world-core': fileURLToPath(
        new URL('./packages/world-core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    // CPU-heavy retained-world fixtures must not contend across four workers.
    // Keep the same bounded scheduling locally and on shared CI runners.
    maxWorkers: 2,
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    clearMocks: true,
    allowOnly: false,
    reporters: ['default', './scripts/unit-reporter.ts'],
  },
});
