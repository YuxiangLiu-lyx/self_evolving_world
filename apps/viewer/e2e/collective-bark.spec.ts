import { test, expect } from './validators.js';
import { barkFrames } from '../../simulator/test/fixtures/collective-bark.js';
test('reviewed branch precursor shows uncertainty, paid separation, conserved output and actual cancellation', async ({
  page,
}, info) => {
  const f = barkFrames(),
    frames = [f.assessed, f.partial, f.complete, f.stopped];
  await page.goto('/forest-lab.html');
  await page.getByLabel('Isolated fixture file').setInputFiles({
    name: 'reviewed-bark-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ frames })),
  });
  await page.evaluate(() => document.fonts.ready);
  for (const [i, name] of [
    'bark-assessment',
    'bark-partial-work',
    'bark-conserved-output',
    'bark-cancelled-work',
  ].entries()) {
    await page.locator('#fixture-time').fill(String(i));
    await page.locator('#fixture-time').dispatchEvent('input');
    await expect(page.locator('#fixture-title')).toContainText(
      `frame ${String(i)}`,
    );
    await expect(page.locator('#fixture-events')).toContainText(
      [
        'bark-assessed',
        'bark-peeling-progress',
        'bark-peeling-completed',
        'bark-peeling-stopped',
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
