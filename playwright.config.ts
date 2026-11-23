import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './apps/viewer/e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  // The task harness retains the complete reviewed diff. Playwright's CI metadata
  // collector buffers that entire archive patch before truncating its display.
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
