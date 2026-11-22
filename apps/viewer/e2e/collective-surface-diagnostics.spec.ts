import { test, expect } from './validators.js';
import { diagnosticFrames } from '../../simulator/test/fixtures/collective-surface-diagnostics.js';
test('dated surface diagnostics distinguish physical failure, unknown detail and historical read', async ({
  page,
}, info) => {
  const f = diagnosticFrames(),
    frames = [f.legacy, f.blocked, f.clear, f.read, f.unknown];
  await page.goto('/forest-lab.html');
  await page.getByLabel('Isolated fixture file').setInputFiles({
    name: 'surface-diagnostics-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ frames })),
  });
  await page.evaluate(() => document.fonts.ready);
  for (const [i, name] of [
    'surface-diagnostics-legacy',
    'surface-diagnostics-blocked',
    'surface-diagnostics-clear',
    'surface-diagnostics-recorded',
    'surface-diagnostics-unknown',
  ].entries()) {
    await page.locator('#fixture-time').fill(String(i));
    await page.locator('#fixture-time').dispatchEvent('input');
    await expect(page.locator('#fixture-title')).toContainText(
      `frame ${String(i)}`,
    );
    await expect(
      page.getByRole('heading', { name: 'Recorded surface requirements' }),
    ).toBeVisible();
    if (i === 0)
      await expect(page.locator('#fixture-state')).toContainText(
        'UNKNOWN · legacy-diagnostics',
      );
    if (i === 1) {
      await expect(page.locator('#fixture-state')).toContainText(
        'FAIL · clearance',
      );
      await expect(page.locator('#fixture-state')).toContainText(
        'performer-body',
      );
    }
    if (i === 2 || i === 3)
      await expect(page.locator('#fixture-state')).toContainText(
        'All requirements passed at that time',
      );
    if (i === 3)
      await expect(page.locator('#fixture-state')).toContainText(
        `Recorded round ${String(f.clear.tick)}`,
      );
    if (i === 4)
      await expect(page.locator('#fixture-state')).toContainText(
        'UNKNOWN · sheet-geometry',
      );
    const path = info.outputPath(name + '.png');
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await info.attach('review:' + name, { path, contentType: 'image/png' });
  }
});
