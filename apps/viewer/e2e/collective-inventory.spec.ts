import { test, expect } from './validators.js';
import { inventoryFrames } from '../../simulator/test/fixtures/collective-inventory.js';
test('recorded personal inventory pages show exact identities and revision changes without reading later holdings', async ({
  page,
}, info) => {
  const f = inventoryFrames(),
    frames = [f.first, f.second, f.changed, f.unavailable];
  await page.goto('/forest-lab.html');
  await page.getByLabel('Isolated fixture file').setInputFiles({
    name: 'inventory-pages-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ frames })),
  });
  for (const [i, name] of [
    'inventory-first-page',
    'inventory-second-page',
    'inventory-changed',
    'inventory-unavailable',
  ].entries()) {
    await page.locator('#fixture-time').fill(String(i));
    await page.locator('#fixture-time').dispatchEvent('input');
    const panel = page.locator('.inventory-inspection-panel');
    await expect(panel).toContainText('Recorded personal inventory inspection');
    if (i === 0) {
      await expect(panel.getByLabel('Recorded item identity')).toHaveCount(8);
      await expect(
        panel.getByRole('button', { name: 'Next recorded page' }),
      ).toBeDisabled();
    }
    if (i === 1) {
      await expect(
        panel.getByRole('button', { name: 'Previous recorded page' }),
      ).toBeEnabled();
      await panel
        .getByRole('button', { name: 'Previous recorded page' })
        .click();
      await expect(panel).toContainText('Page 1 / 3');
      await panel.getByRole('button', { name: 'Next recorded page' }).click();
      await expect(panel).toContainText('Page 2 / 3');
    }
    if (i === 2) await expect(panel).toContainText('Holdings changed');
    if (i === 3)
      await expect(panel).toContainText(
        'Unavailable in this personal carried inventory',
      );
    const path = info.outputPath(name + '.png');
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await info.attach('review:' + name, { path, contentType: 'image/png' });
  }
});
