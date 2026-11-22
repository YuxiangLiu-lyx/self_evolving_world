import { test, expect } from './validators.js';
import { clearanceFrames } from '../../simulator/test/fixtures/collective-tray-clearance.js';
test('tray placement diagnostics show dated clear blocked and unknown geometry', async ({
  page,
}, info) => {
  const f = clearanceFrames(),
    frames = [f.blocked, f.clear, f.read, f.unknown];
  await page.goto('/forest-lab.html');
  await page.getByLabel('Isolated fixture file').setInputFiles({
    name: 'tray-clearance.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ frames })),
  });
  await page.evaluate(() => document.fonts.ready);
  for (const [i, name] of [
    'tray-clearance-blocked',
    'tray-clearance-clear',
    'tray-clearance-recorded',
    'tray-clearance-unknown',
  ].entries()) {
    await page.locator('#fixture-time').fill(String(i));
    await page.locator('#fixture-time').dispatchEvent('input');
    await expect(
      page.getByRole('heading', { name: 'Recorded tray placement' }),
    ).toBeVisible();
    if (i === 0)
      await expect(page.locator('#fixture-state')).toContainText(
        'performer-body',
      );
    if (i === 1 || i === 2)
      await expect(page.locator('#fixture-state')).toContainText(
        'All requirements passed at that time',
      );
    if (i === 3)
      await expect(page.locator('#fixture-state')).toContainText(
        'UNKNOWN · support',
      );
    const path = info.outputPath(name + '.png');
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await info.attach('review:' + name, { path, contentType: 'image/png' });
  }
});
