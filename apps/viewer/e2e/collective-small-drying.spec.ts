import { test, expect } from './validators.js';
import { smallFrames } from '../../simulator/test/fixtures/collective-small-drying.js';
test('actual small drying surfaces show paid construction, sample exposure, blockers and released materials', async ({
  page,
}, info) => {
  const f = smallFrames(),
    frames = [f.assessed, f.partial, f.loaded, f.dry, f.blocked, f.cancelled];
  await page.goto('/forest-lab.html');
  await page.getByLabel('Isolated fixture file').setInputFiles({
    name: 'small-drying-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ frames })),
  });
  await page.evaluate(() => document.fonts.ready);
  for (const [i, name] of [
    'small-drying-assessed',
    'small-drying-partial',
    'small-drying-loaded',
    'small-drying-exposure',
    'small-drying-blocked',
    'small-drying-cancelled',
  ].entries()) {
    await page.locator('#fixture-time').fill(String(i));
    await page.locator('#fixture-time').dispatchEvent('input');
    await expect(page.locator('#fixture-title')).toContainText(
      `frame ${String(i)}`,
    );
    await expect(page.locator('.small-drying-panel')).toContainText(
      'Food safety and nutrition are unchanged.',
    );
    if (i === 2)
      await expect(page.locator('.small-drying-panel')).toContainText(
        '0.1 original root',
      );
    if (i === 4)
      await expect(page.locator('.small-drying-panel')).toContainText(
        'Evaporation paused',
      );
    if (i === 5)
      await expect(page.locator('.small-drying-panel')).toContainText(
        'stopped',
      );
    const path = info.outputPath(name + '.png');
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await info.attach('review:' + name, { path, contentType: 'image/png' });
  }
});
