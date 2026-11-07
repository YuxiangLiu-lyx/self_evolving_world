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
