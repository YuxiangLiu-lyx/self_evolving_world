import { readFile } from 'node:fs/promises';
import { captureReview, expect, test } from './validators.js';

test('renders the real world, isolates the selected view and works on mobile', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', { name: 'World Observatory.' }),
  ).toBeVisible();
  await expect(page.locator('[data-map-agent]')).toHaveCount(3);
  await expect(page.locator('#history-count')).toHaveText('012 / 012');
  await captureReview(page, testInfo, 'desktop');
  await page.getByRole('button', { name: /New world/ }).click();
  await page.getByRole('button', { name: 'Agent vision', exact: true }).click();
  await expect(page.locator('[data-map-agent]')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Observe Sol', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('#visible-summary')).toContainText(
    '0 other agents',
  );
  await captureReview(page, testInfo, 'agent-vision');
  await page.getByRole('button', { name: 'Global view', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#world-grid')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await captureReview(page, testInfo, 'mobile');
});

test('moves and picks up with illustrated entities and no learning control', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: /New world/ }).click();
  await expect(page.locator('#inventory')).toContainText('Inventory is empty');
  await page.getByRole('button', { name: 'Move east' }).click();
  await expect(page.locator('#agent-position')).toHaveText('03 , 03');
  await page.getByRole('button', { name: /Pick up Wood/ }).click();
  await expect(page.locator('#inventory')).toContainText('Wood');
  await expect(page.locator('[data-map-item="wood"]')).toHaveCount(0);
  await expect(page.locator('#tick-value')).toHaveText('002');
  await expect(
    page.getByRole('button', { name: 'Try skill', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('[data-map-agent] svg')).toHaveCount(3);
  await expect(page.locator('#inventory svg')).toHaveCount(1);
  await captureReview(page, testInfo, 'after-actions');
});

test('plays recorded snapshots, disables historical commands and resumes only at the latest frame', async ({
  page,
}, testInfo) => {
  await page.clock.install();
  await page.goto('/');
  const exportHistory = async (filename: string): Promise<string> => {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export history/ }).click();
    const download = await pending;
    const path = testInfo.outputPath(filename);
    await download.saveAs(path);
    return readFile(path, 'utf8');
  };
  const beforeReplay = await exportHistory('before-replay.json');
  await page.getByRole('button', { name: 'First frame' }).click();
  await expect(page.locator('#tick-value')).toHaveText('000');
  await expect(page.getByRole('button', { name: 'Move east' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next frame' }).click();
  await expect(page.locator('#tick-value')).toHaveText('001');
  await page.getByRole('button', { name: /Play/ }).click();
  await page.clock.runFor(2200);
  await expect(page.locator('#tick-value')).toHaveText('003');
  await page.getByRole('button', { name: /Pause/ }).click();
  await page.clock.runFor(5000);
  await expect(page.locator('#tick-value')).toHaveText('003');
  await expect(page.locator('#history-count')).toHaveText('003 / 012');
  await captureReview(page, testInfo, 'history');
  expect(await exportHistory('after-replay.json')).toBe(beforeReplay);
  await page.getByRole('button', { name: /Latest frame/ }).click();
  await expect(page.getByRole('button', { name: 'Move east' })).toBeEnabled();
  await expect(page.locator('#inventory')).toContainText('Wood');
  await page.getByRole('button', { name: 'Move east' }).click();
  await expect(page.locator('#history-count')).toHaveText('013 / 013');
});

test('exports/imports history and keeps the current world on invalid input', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const originalPosition = await page.locator('#agent-position').textContent();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export history/ }).click();
  const download = await downloadPromise;
  const path = testInfo.outputPath('history.json');
  await download.saveAs(path);
  await page.getByRole('button', { name: /New world/ }).click();
  await expect(page.locator('#history-count')).toHaveText('000 / 000');
  await page.locator('#import-file').setInputFiles(path);
  await expect(page.locator('#history-count')).toHaveText('012 / 012');
  await expect(page.locator('#agent-position')).toHaveText(
    originalPosition ?? '',
  );
  await page.locator('#import-file').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(page.getByRole('status')).toContainText('Import failed');
  await expect(page.locator('#history-count')).toHaveText('012 / 012');
  await expect(page.locator('#agent-position')).toHaveText(
    originalPosition ?? '',
  );
});

test('renders an imported empty world and treats names as text', async ({
  page,
}) => {
  await page.goto('/');
  const replay = {
    format: 'self-evolving-world/replay',
    version: 1,
    coreVersion: '1',
    initial: {
      settings: { width: 4, height: 3, visionRadius: 1 },
      agents: [],
      items: [
        {
          id: 'item',
          name: '<img src=x onerror=alert(1)>',
          position: { x: 1, y: 1 },
        },
      ],
    },
    actions: [],
  };
  await page.locator('#import-file').setInputFiles({
    name: 'empty.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(replay)),
  });
  await expect(page.locator('#world-size')).toHaveText('4 × 3');
  await expect(page.locator('#agent-select')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move east' })).toBeDisabled();
  await expect(page.locator('#world-grid img')).toHaveCount(0);
  await expect(page.locator('#world-grid [role="gridcell"]')).toHaveCount(12);
});
