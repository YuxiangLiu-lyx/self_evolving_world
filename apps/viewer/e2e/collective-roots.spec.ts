import { test, expect } from './validators.js';
import { rootFrames } from '../../simulator/test/fixtures/collective-roots.js';
test('reviewed root fixture shows paid material work, empty tray, actual drying and reversible rewetting', async ({
  page,
}, info) => {
  const f = rootFrames(),
    frames = [f.partial, f.prepared, f.tray, f.loaded, f.dry, f.wet];
  await page.goto('/forest-lab.html');
  await page.getByLabel('Isolated fixture file').setInputFiles({
    name: 'reviewed-root-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ frames })),
  });
  await expect(page.locator('#fixture-title')).toContainText('Round 1');
  await page.evaluate(() => document.fonts.ready);
  for (const [i, name] of [
    'root-paid-crushing',
    'root-prepared-food',
    'root-empty-tray',
    'root-paid-loading',
    'root-actual-drying',
    'root-actual-rewetting',
  ].entries()) {
    await page.locator('#fixture-time').fill(String(i));
    await page.locator('#fixture-time').dispatchEvent('input');
    await expect(page.locator('#fixture-title')).toContainText(
      `frame ${String(i)}`,
    );
    if (i === 4)
      await expect(page.locator('#fixture-events')).toContainText(
        'food-drying-completed',
      );
    if (i === 5)
      await expect(page.locator('#fixture-events')).toContainText(
        'food-rewetted',
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
