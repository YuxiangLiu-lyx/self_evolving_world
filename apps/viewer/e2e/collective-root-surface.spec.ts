import { test, expect } from './validators.js';
import { surfaceFrames } from '../../simulator/test/fixtures/collective-root-surface.js';
test('fractional sheet assessment and real selected-root work retain explicit geometric uncertainty', async ({
  page,
}, info) => {
  const f = surfaceFrames(),
    frames = [f.assessed, f.partial, f.complete, f.cancelled];
  await page.goto('/forest-lab.html');
  await page.getByLabel('Isolated fixture file').setInputFiles({
    name: 'fractional-surface-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ frames })),
  });
  await page.evaluate(() => document.fonts.ready);
  for (const [i, name] of [
    'root-surface-assessed',
    'root-surface-partial',
    'root-surface-complete',
    'root-surface-cancelled',
  ].entries()) {
    await page.locator('#fixture-time').fill(String(i));
    await page.locator('#fixture-time').dispatchEvent('input');
    await expect(page.locator('#fixture-title')).toContainText(
      `frame ${String(i)}`,
    );
    await expect(page.locator('#fixture-events')).toContainText(
      [
        'root-surface-assessed',
        'process-progress',
        'food-preparation-completed',
        'root-preparation-stopped',
      ][i] ?? '',
    );
    const path = info.outputPath(name + '.png');
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await info.attach('review:' + name, { path, contentType: 'image/png' });
  }
});
