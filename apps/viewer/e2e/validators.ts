import {
  expect,
  test as base,
  type Page,
  type TestInfo,
} from '@playwright/test';

// Automatic fixture: every browser test observes runtime and resource failures.
export const test = base.extend<{ runtimeHealth: boolean }>({
  runtimeHealth: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('requestfailed', (request) =>
        errors.push(`Request failed: ${request.url()}`),
      );
      page.on('response', (response) => {
        if (response.status() >= 400)
          errors.push(`HTTP ${String(response.status())}: ${response.url()}`);
      });
      await use(true);
      expect(
        errors,
        'No browser exceptions, console errors or broken resources',
      ).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect } from '@playwright/test';

/** Catches gross layout regressions; visual taste/readability is reviewed separately. */
export async function checkLayout(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'World Observatory.' }),
  ).toBeVisible();
  for (const selector of [
    '#world-grid',
    '#timeline',
    '#agent-select',
    '#pickup-options',
    '#play-button',
    '#export-button',
    '#experiment-select',
  ]) {
    await expect(page.locator(selector)).toBeVisible();
  }
  const issues = await page.evaluate(() => {
    const problems: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth + 1)
      problems.push('Page overflows horizontally');
    for (const node of document.querySelectorAll(
      'h1, .panel:not([hidden]), .topbar, .playback-controls, #current-event, .experiment-browser',
    )) {
      const rect = node.getBoundingClientRect();
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.left < -1 ||
        rect.right > innerWidth + 1
      )
        problems.push(`Missing/offscreen: ${node.className || node.id}`);
      if (node.scrollWidth > node.clientWidth + 2)
        problems.push(`Clipped content: ${node.className || node.id}`);
    }
    const panels = [...document.querySelectorAll('.panel:not([hidden])')].map(
      (node) => node.getBoundingClientRect(),
    );
    for (const [index, a] of panels.entries()) {
      for (const b of panels.slice(index + 1)) {
        if (
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
        )
          problems.push('Panels overlap');
      }
    }
    return problems;
  });
  expect(issues, 'Basic layout sanity').toEqual([]);
  const grid = page.locator('#world-grid');
  const columns = Number(await grid.getAttribute('aria-colcount'));
  const rows = Number(await grid.getAttribute('aria-rowcount'));
  await expect(grid.getByRole('gridcell')).toHaveCount(columns * rows);
  const size = await grid.boundingBox();
  expect(size?.width).toBeGreaterThan(200);
  expect(size?.height).toBeGreaterThan(150);
}

export async function captureReview(
  page: Page,
  info: TestInfo,
  id: string,
): Promise<void> {
  // Wait for the real notification lifecycle, without hiding UI via test CSS.
  await expect(page.getByRole('status')).toBeHidden({ timeout: 6000 });
  await checkLayout(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: info.outputPath(`${id}.png`),
    fullPage: true,
    animations: 'disabled',
  });
  await info.attach(`review:${id}`, {
    path: info.outputPath(`${id}.png`),
    contentType: 'image/png',
  });
}
