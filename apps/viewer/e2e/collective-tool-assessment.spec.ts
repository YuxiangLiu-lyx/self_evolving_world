import { test, expect } from './validators.js';
import { toolFrames } from '../../simulator/test/fixtures/collective-tool-assessment.js';
test('tool-only provenance and historical results remain distinct from experiments', async ({
  page,
}, info) => {
  const f = toolFrames(),
    frames = [f.assessed, f.damaged, f.read, f.unknown];
  await page.goto('/forest-lab.html');
  await page.getByLabel('Isolated fixture file').setInputFiles({
    name: 'tool-assessment.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ frames })),
  });
  await page.evaluate(() => document.fonts.ready);
  for (const [i, name] of [
    'tool-assessment-known',
    'tool-assessment-damaged',
    'tool-assessment-recorded',
    'tool-assessment-unknown',
  ].entries()) {
    await page.locator('#fixture-time').fill(String(i));
    await page.locator('#fixture-time').dispatchEvent('input');
    await expect(
      page.getByRole('heading', { name: 'Recorded tool-only assessment' }),
    ).toBeVisible();
    await expect(page.locator('#fixture-state')).toContainText(
      'Entire setup NOT certified',
    );
    if (i === 1)
      await expect(page.locator('#fixture-state')).toContainText(
        'FAIL · usable-form-and-contact',
      );
    if (i === 3)
      await expect(page.locator('#fixture-state')).toContainText(
        'UNKNOWN · intrinsic-hardness',
      );
    const path = info.outputPath(name + '.png');
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await info.attach('review:' + name, { path, contentType: 'image/png' });
  }
});
