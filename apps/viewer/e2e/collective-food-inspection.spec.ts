import { test, expect } from './validators.js';
import { inspectionFrames } from '../../simulator/test/fixtures/collective-food-inspection.js';
test('reviewed non-ingestive sample opening shows real paid work and explicitly unknown food safety', async ({
  page,
}, info) => {
  const f = inspectionFrames(),
    frames = [f.inspected, f.partial, f.complete, f.stopped];
  await page.goto('/forest-lab.html');
  await page.getByLabel('Isolated fixture file').setInputFiles({
    name: 'reviewed-food-inspection-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ frames })),
  });
  await page.evaluate(() => document.fonts.ready);
  for (const [i, name] of [
    'food-sample-inspection',
    'food-sample-paid-opening',
    'food-sample-opened',
    'food-sample-cancelled',
  ].entries()) {
    await page.locator('#fixture-time').fill(String(i));
    await page.locator('#fixture-time').dispatchEvent('input');
    await expect(page.locator('#fixture-title')).toContainText(
      `frame ${String(i)}`,
    );
    await expect(page.locator('#fixture-events')).toContainText(
      [
        'food-inspection-observed',
        'food-inspection-progress',
        'food-inspection-completed',
        'food-inspection-stopped',
      ][i] ?? '',
    );
    await page.evaluate(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            resolve();
          }),
        ),
      );
    });
    const path = info.outputPath(name + '.png');
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await info.attach('review:' + name, { path, contentType: 'image/png' });
  }
});
