import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './apps/viewer/e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  // Playwright's CI metadata collector would buffer archive-sized diffs before
  // truncating them, so only the commit is recorded.
  captureGitInfo: { commit: true, diff: false },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['./scripts/browser-reporter.ts'],
  ],
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 1100 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
