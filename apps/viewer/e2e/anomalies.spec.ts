import { expect, test, checkLayout } from './validators.js';

test('rejects boundary/collision moves, conserves items and never executes a try', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#import-file').setInputFiles({
    name: 'boundary-world.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'self-evolving-world/replay',
        version: 1,
        coreVersion: '1',
        initial: {
          settings: { width: 3, height: 3, visionRadius: 1 },
          agents: [
            { id: 'a', name: 'Alpha', position: { x: 0, y: 0 } },
            { id: 'b', name: 'Beta', position: { x: 1, y: 0 } },
          ],
          items: [
            { id: 'wood', name: 'Wood', position: { x: 0, y: 1 } },
            { id: 'remote', name: 'Distant crystal', position: { x: 2, y: 2 } },
          ],
        },
        actions: [],
      }),
    ),
  });
  await expect(page.locator('#world-size')).toHaveText('3 × 3');
  await page.getByRole('button', { name: 'Agent vision', exact: true }).click();
  await expect(page.locator('[data-map-agent]')).toHaveCount(2);
  await expect(page.locator('[data-map-item="remote"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Move west' }).click();
  await expect(page.locator('#current-event')).toContainText(
    'World boundary reached',
  );
  await expect(page.locator('#agent-position')).toHaveText('00 , 00');
  await page.getByRole('button', { name: 'Move east' }).click();
  await expect(page.locator('#current-event')).toContainText(
    'Another agent occupies that cell',
  );
  await expect(page.locator('#agent-position')).toHaveText('00 , 00');
  await expect(page.locator('#tick-value')).toHaveText('002');
  await page.getByRole('button', { name: 'Move south' }).click();
  await expect(page.locator('#agent-position')).toHaveText('00 , 01');
  await expect(page.locator('[data-map-agent]')).toHaveCount(1);
  await expect(page.locator('#visible-summary')).toHaveText(
    '0 other agents · 1 ground item',
  );
  await page.getByRole('button', { name: /Pick up Wood/ }).click();
  await expect(page.locator('#inventory-count')).toHaveText('01');
  await expect(page.locator('[data-map-item="wood"]')).toHaveCount(0);
  await expect(
    page
      .locator('#pickup-options')
      .getByRole('button', { name: /Pick up Wood/ }),
  ).toHaveCount(0);
  await expect(page.locator('#visible-summary')).toHaveText(
    '0 other agents · 0 ground items',
  );
  for (const skill of ['fly', 'fly', 'move']) {
    await page.getByRole('textbox', { name: 'Skill to try' }).fill(skill);
    await page.getByRole('button', { name: 'Try skill', exact: true }).click();
    await expect(page.locator('#current-event')).toContainText(
      skill === 'move' ? 'Skill already exists' : 'Skill unavailable',
    );
    await expect(page.locator('#agent-position')).toHaveText('00 , 01');
    await expect(page.locator('#inventory-count')).toHaveText('01');
  }
  await expect(page.locator('#tick-value')).toHaveText('007');
  await page.locator('#agent-select').selectOption('b');
  await expect(page.locator('#inventory-count')).toHaveText('00');
  await expect(page.locator('#agent-position')).toHaveText('01 , 00');
  await expect(page.locator('#visible-entities')).not.toContainText('Wood');
  await checkLayout(page);
});

test('layout validator catches horizontal overflow regressions', async ({
  page,
}) => {
  await page.goto('/');
  await page.addStyleTag({ content: 'body { min-width: 2200px !important; }' });
  await expect(checkLayout(page)).rejects.toThrow('Basic layout sanity');
  await page
    .locator('style')
    .last()
    .evaluate((node) => {
      node.remove();
    });
  await checkLayout(page);
});
