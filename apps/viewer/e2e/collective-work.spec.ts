import { test, expect } from './validators.js';
import {
  builtFixture,
  workFixture,
  workStep,
} from '../../simulator/test/fixtures/collective-work.js';
test('reviewed collective fixture shows actual paid work, prepared portions and traversable weather roof', async ({
  page,
}, info) => {
  const built = builtFixture(),
    food = workStep(workFixture(), {
      interface: 'prepare-food',
      args: {
        operation: 'start',
        inputs: [{ itemId: 'fixture-root', quantity: 2 }],
      },
    }).world;
  const prepared = workStep(food, {
    interface: 'prepare-food',
    args: { operation: 'continue' },
  }).world;
  await page.goto('/forest-lab.html');
  await page.getByLabel('Isolated fixture file').setInputFiles({
    name: 'reviewed-work-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ frames: [food, prepared, ...built.frames] }),
    ),
  });
  await expect(page.locator('#fixture-title')).toContainText('Round 1');
  await expect(page.locator('#fixture-events')).toContainText(
    'process-progress',
  );
  await page.evaluate(() => document.fonts.ready);
  for (const [frame, name] of [
    [0, 'paid-food-work'],
    [1, 'actual-prepared-portions'],
    [6, 'partial-weather-work'],
    [10, 'complete-weather-roof'],
  ] as const) {
    await page.locator('#fixture-time').fill(String(frame));
    await page.locator('#fixture-time').dispatchEvent('input');
    await expect(page.locator('#fixture-title')).toContainText(
      `frame ${String(frame)}`,
    );
    if (frame === 1)
      await expect(page.locator('#fixture-state')).toContainText(
        '20 hand-mashed-food',
      );
    await page.evaluate(async () => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        }),
      );
    });
    const path = info.outputPath(name + '.png');
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await info.attach('review:' + name, { path, contentType: 'image/png' });
  }
  await page.getByRole('button', { name: 'Geometry', exact: true }).click();
  const path = info.outputPath('weather-roof-geometry.png');
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await info.attach('review:weather-roof-geometry', {
    path,
    contentType: 'image/png',
  });
});
