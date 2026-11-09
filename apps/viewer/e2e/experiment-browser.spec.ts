import { readFile } from 'node:fs/promises';
import type { Route } from '@playwright/test';
import { runRandomWorld } from '../../simulator/src/random-run.js';
import { experimentAssets } from '../../../scripts/experiment-assets.js';
import { captureReview, expect, test } from './validators.js';

const assets = experimentAssets(process.cwd());
const catalogue: unknown = JSON.parse(
  assets.get('experiments/index.json') ?? 'null',
);
const replay: unknown = JSON.parse(
  assets.get('experiments/ex1/replay.json') ?? 'null',
);

test('switches between ex1 and ex2 and displays simultaneous moves and successful pickups on desktop and mobile', async ({
  page,
}, info) => {
  await page.goto('/?experiment=ex2');
  await expect(page.locator('#experiment-select')).toHaveValue('ex2');
  await expect(page.locator('#tick-unit')).toHaveText('ROUND');
  await expect(page.locator('#history-count')).toHaveText('160 / 160');
  await expect(page.locator('#experiment-feedback')).toContainText(
    '480 actions',
  );
  await expect(
    page.locator('#experiment-select option[value="ex2"]'),
  ).toHaveText('ex2 · 160 rounds');
  await page.locator('#first-frame').click();
  await page.getByRole('button', { name: 'Next frame' }).click();
  await expect(page.locator('#tick-value')).toHaveText('001');
  for (const name of ['Lin', 'Moss', 'Sol'])
    await expect(page.locator('#current-event')).toContainText(`${name} moves`);
  await page.getByRole('button', { name: 'Next frame' }).click();
  await expect(page.locator('#tick-value')).toHaveText('002');
  await expect(page.locator('#current-event')).toContainText('picks up');
  await expect(page.locator('#inventory')).toContainText('Wood');
  await expect(page.locator('[data-map-item="wood"]')).toHaveCount(0);
  await expect(page.locator('#try-form')).toHaveCount(0);
  await captureReview(page, info, 'synchronous-browser');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#agent-select').selectOption('sol');
  await expect(page.locator('#inventory')).toContainText('Crystal');
  await captureReview(page, info, 'synchronous-mobile');
  await page.locator('#experiment-select').selectOption('ex1');
  await expect(page.locator('#tick-unit')).toHaveText('TICK');
  await expect(page.locator('#history-count')).toHaveText('480 / 480');
  await page.goBack();
  await expect(page.locator('#experiment-select')).toHaveValue('ex2');
  await expect(page.locator('#history-count')).toHaveText('160 / 160');
  await expect(page.getByRole('button', { name: 'Move east' })).toBeDisabled();
  await page.reload();
  await expect(page.locator('#experiment-select')).toHaveValue('ex2');
  await expect(page.locator('#history-count')).toHaveText('160 / 160');
});

test('selects an archived experiment, navigates URLs and replays without changing its data', async ({
  page,
}, info) => {
  await page.clock.install();
  await page.goto('/');
  const select = page.getByLabel('EXPERIMENT ARCHIVE', { exact: true });
  await expect(select).toBeEnabled();
  await select.selectOption('ex1');
  await expect(page).toHaveURL(/\?experiment=ex1$/);
  await expect(page.locator('#history-count')).toHaveText('480 / 480');
  await expect(page.getByRole('button', { name: 'Move east' })).toBeDisabled();
  await page.locator('#timeline').fill('240');
  await expect(page.locator('#agent-position')).toHaveText('00 , 05');
  await captureReview(page, info, 'experiment-browser');
  await page.getByRole('button', { name: 'First frame' }).click();
  await page.getByLabel('Playback speed').selectOption('4');
  await page.getByRole('button', { name: /Play/ }).click();
  await page.clock.runFor(500);
  await expect(page.locator('#tick-value')).toHaveText('002');
  await page.getByRole('button', { name: /Pause/ }).click();
  await page.getByRole('button', { name: /Latest frame/ }).click();
  await page.keyboard.press('d');
  await expect(page.locator('#tick-value')).toHaveText('480');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export history/ }).click();
  const download = await pending;
  const file = info.outputPath('archive-export.json');
  await download.saveAs(file);
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(replay);
  await page.reload();
  await expect(select).toHaveValue('ex1');
  await expect(page.locator('#history-count')).toHaveText('480 / 480');
  await page.goBack();
  await expect(select).toHaveValue('');
  await expect(page.locator('#history-count')).toHaveText('012 / 012');
  await page.goForward();
  await expect(select).toHaveValue('ex1');
  await expect(page.locator('#history-count')).toHaveText('480 / 480');
  await select.selectOption('');
  await expect(page).not.toHaveURL(/experiment=/);
  await expect(page.getByRole('button', { name: 'Move east' })).toBeEnabled();
  await expect(page.locator('#history-count')).toHaveText('012 / 012');
  expect(
    (await page.request.get('/experiments/ex1/replay.json')).status(),
  ).toBe(200);
  expect(
    await (await page.request.get('/experiments/ex1/replay.json')).json(),
  ).toEqual(replay);
});

test('opens a direct experiment link on mobile with agent inspection and vision', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?experiment=ex1');
  await expect(page.locator('#experiment-select')).toHaveValue('ex1');
  await page.getByRole('button', { name: 'First frame' }).click();
  await page.locator('#agent-select').selectOption('moss');
  await page.getByRole('button', { name: 'Agent vision', exact: true }).click();
  await expect(page.locator('#agent-position')).toHaveText('08 , 05');
  await expect(page.locator('[data-map-agent]')).toHaveCount(1);
  await expect(page.locator('#experiment-feedback')).toContainText(
    '481 frames',
  );
  await captureReview(page, info, 'experiment-mobile');
});

test('handles an unknown experiment, empty archive and invalid catalogue without losing the demo', async ({
  page,
}) => {
  await page.goto('/?experiment=ex999');
  await expect(page.locator('#experiment-feedback')).toContainText(
    'Could not load ex999',
  );
  await expect(page.locator('#history-count')).toHaveText('012 / 012');
  await expect(page).not.toHaveURL(/experiment=/);
  await page.route('**/experiments/index.json', (route) =>
    route.fulfill({ json: { version: 1, experiments: [] } }),
  );
  await page.reload();
  await expect(page.locator('#experiment-feedback')).toContainText(
    'No completed experiments',
  );
  await expect(page.getByRole('button', { name: 'Move east' })).toBeEnabled();
  await page.route('**/experiments/index.json', (route) =>
    route.fulfill({ json: { version: 99 } }),
  );
  await page.reload();
  await expect(page.locator('#experiment-feedback')).toContainText(
    'catalogue could not be loaded',
  );
  await expect(page.locator('#history-count')).toHaveText('012 / 012');
});

test('keeps the archive intact after invalid imports or replay loads and cancels obsolete selections', async ({
  page,
}) => {
  // Replace ex2 with an isolated legacy HTTP fixture; never mutate the archive.
  const second = runRandomWorld(2, 12).replay;
  const firstCatalogue = catalogue as {
    version: number;
    experiments: Record<string, unknown>[];
  };
  await page.route('**/experiments/index.json', (route) =>
    route.fulfill({
      json: {
        version: 1,
        experiments: [
          ...firstCatalogue.experiments.filter((entry) => entry.id !== 'ex2'),
          { ...firstCatalogue.experiments[0], id: 'ex2', steps: 12, seed: 2 },
        ],
      },
    }),
  );
  await page.goto('/?experiment=ex1');
  await expect(page.locator('#experiment-select')).toHaveValue('ex1');
  await page.locator('#import-file').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await expect(page.getByRole('status')).toContainText('Import failed');
  await expect(page.locator('#experiment-select')).toHaveValue('ex1');
  await page.route('**/experiments/ex2/replay.json', (route) =>
    route.fulfill({ json: {} }),
  );
  await page.locator('#experiment-select').selectOption('ex2');
  await expect(page.locator('#experiment-feedback')).toContainText(
    'Could not load ex2',
  );
  await expect(page.locator('#history-count')).toHaveText('480 / 480');
  await expect(page.locator('#experiment-select')).toHaveValue('ex1');
  await expect(page).toHaveURL(/experiment=ex1$/);
  let release: Route | undefined;
  await page.route('**/experiments/ex2/replay.json', (route) => {
    release = route;
  });
  await page.locator('#experiment-select').selectOption('ex2');
  await expect.poll(() => release !== undefined).toBe(true);
  await page.getByRole('button', { name: /New world/ }).click();
  const completed = page.waitForResponse('**/experiments/ex2/replay.json');
  if (release === undefined) throw new Error('Missing delayed request.');
  await release.fulfill({ json: second });
  await completed;
  await expect(page.locator('#history-count')).toHaveText('000 / 000');
  await expect(page.locator('#experiment-select')).toHaveValue('');
  await page.route('**/experiments/ex2/replay.json', (route) =>
    route.fulfill({ json: second }),
  );
  await page.locator('#experiment-select').selectOption('ex2');
  await expect(page).toHaveURL(/experiment=ex2$/);
  await expect(page.locator('#history-count')).toHaveText('012 / 012');
  await page.locator('#experiment-select').selectOption('ex1');
  await expect(page.locator('#history-count')).toHaveText('480 / 480');
  await page.locator('#import-file').setInputFiles({
    name: 'local.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(second)),
  });
  await expect(page.locator('#history-count')).toHaveText('012 / 012');
  await expect(page.locator('#experiment-select')).toHaveValue('');
  await expect(page).not.toHaveURL(/experiment=/);
  await expect(page.getByRole('button', { name: 'Move east' })).toBeEnabled();
});
