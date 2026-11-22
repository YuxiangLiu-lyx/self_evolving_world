import { test, expect } from './validators.js';
import { initialCollectiveWorld } from '../../simulator/src/collective-scenario.js';

test('isolated collective view distinguishes eighteen members and their retained individual records', async ({
  page,
}, info) => {
  const world = initialCollectiveWorld('collective-visual-fixture', 'B');
  await page.goto('/forest-lab.html');
  await page.getByLabel('Isolated fixture file').setInputFiles({
    name: 'isolated-collective.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ frames: [world] })),
  });
  await expect(page.locator('#fixture-actor option')).toHaveCount(18);
  await page.locator('#fixture-actor').selectOption('ash-1');
  await expect(page.locator('#fixture-collective')).toContainText(
    'ASH · human',
  );
  await expect(page.locator('#fixture-collective')).toContainText(
    'Personal intention: No intention recorded yet.',
  );
  await expect(page.locator('#fixture-collective')).toContainText(
    'Known abilities:',
  );
  await expect(page.locator('#fixture-collective')).toContainText(
    'Global inspection is not model knowledge.',
  );
  await page.evaluate(() => document.fonts.ready);
  const first = info.outputPath('isolated-collective-ash-members.png');
  await page.screenshot({
    path: first,
    fullPage: true,
    animations: 'disabled',
  });
  await info.attach('review:isolated-collective-ash-members', {
    path: first,
    contentType: 'image/png',
  });
  await page.locator('#fixture-actor').selectOption('birch-6');
  await expect(page.locator('#fixture-collective')).toContainText(
    'BIRCH · human',
  );
  await expect(page.locator('#fixture-state')).toContainText('Birch 6');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const second = info.outputPath('isolated-collective-birch-member.png');
  await page.screenshot({
    path: second,
    fullPage: true,
    animations: 'disabled',
  });
  await info.attach('review:isolated-collective-birch-member', {
    path: second,
    contentType: 'image/png',
  });
});
