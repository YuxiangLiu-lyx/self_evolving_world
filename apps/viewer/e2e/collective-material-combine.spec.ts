import { test, expect } from './validators.js';
import { combineFrames } from '../../simulator/test/fixtures/collective-material-combine.js';
test('reviewed combination and actual downstream reservation retain readable material provenance', async ({
  page,
}, info) => {
  const f = combineFrames(),
    frames = [f.selected, f.combined, f.reserved, f.cancelled];
  await page.goto('/forest-lab.html');
  await page.getByLabel('Isolated fixture file').setInputFiles({
    name: 'material-combine-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ frames })),
  });
  await page.evaluate(() => document.fonts.ready);
  for (const [i, name] of [
    'material-selected',
    'material-combined',
    'material-reserved',
    'material-released',
  ].entries()) {
    await page.locator('#fixture-time').fill(String(i));
    await page.locator('#fixture-time').dispatchEvent('input');
    await expect(page.locator('#fixture-title')).toContainText(
      `frame ${String(i)}`,
    );
    if (i > 0) {
      const details = page.locator('#fixture-state details');
      await expect(details.first()).toContainText(
        'original component provenance',
      );
      if ((await details.first().getAttribute('open')) === null)
        await details.first().locator('summary').click();
      await expect(details.first()).toHaveAttribute('open', '');
      await expect(details.first().locator('pre')).toBeVisible();
      await expect(details.first()).toContainText(
        i === 1 ? 'fixture-bark-0' : 'fixture-bark-1',
      );
    }
    const path = info.outputPath(name + '.png');
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await info.attach('review:' + name, { path, contentType: 'image/png' });
  }
});
