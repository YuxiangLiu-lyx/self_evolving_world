import {
  createSurvivalWorld,
  replayPrograms,
} from '@self-evolving-world/world-core';
import { DEMO_SETUP } from '../src/scenario.js';
import { serializeReplay } from '../src/timeline.js';
import { captureReview, expect, test } from './validators.js';
import { experimentIds, readExperiment } from '../../../scripts/experiments.js';

const programs = Array.from({ length: 5 }, (_, i) =>
  ['lin', 'moss', 'sol'].map((agentId) => ({
    agentId,
    tick: i * 12,
    call: i + 1,
    code: i === 0 ? 'learn("shelter"); wait(11);' : 'wait(12);',
    summary: 'Remain in the mild environment.',
  })),
).flat();
const run = replayPrograms(createSurvivalWorld(DEMO_SETUP), programs);
const source = serializeReplay({
  schedule: 'survival-v1',
  frames: run.frames,
  programs: run.programs,
});

test('replays survival programs, vital signs and denied learning on desktop and mobile', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.locator('#import-file').setInputFiles({
    name: 'survival-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(source),
  });
  await expect(page.locator('#history-count')).toHaveText('060 / 060');
  await expect(page.locator('[data-vital="satiety"]')).toHaveText('70 / 100');
  await expect(page.locator('#program-status')).toContainText('5 / 5 calls');
  await expect(page.locator('#learning-history')).toContainText(
    'Round 1 · shelter · Learning denied',
  );
  await page.locator('#timeline').fill('30');
  await expect(page.locator('[data-vital="satiety"]')).toHaveText('85 / 100');
  await expect(page.locator('#program-status')).toContainText('3 / 5 calls');
  await expect(page.locator('#program-status')).toContainText(
    '6 / 12 rounds executed',
  );
  await captureReview(page, info, 'survival-browser');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#agent-select').selectOption('moss');
  await captureReview(page, info, 'survival-mobile');
  await page.locator('#first-frame').click();
  await expect(page.locator('[data-vital="satiety"]')).toHaveText('100 / 100');
  await expect(page.locator('#learning-history')).toContainText(
    'No requests yet',
  );
  await expect(page.locator('#program-code')).toContainText('learn("shelter")');
  await expect(page.getByRole('button', { name: 'Move east' })).toBeDisabled();
  await page.locator('#reset-button').click();
  await expect(page.locator('#survival-panel')).toBeHidden();
});

for (const id of experimentIds(process.cwd()).filter(
  (id) =>
    readExperiment(
      process.cwd(),
      id,
      process.env.WORLD_EXPERIMENT_CAPTURE === id,
    ).manifest.version === 3,
)) {
  if (process.env.WORLD_EXPERIMENT_CAPTURE === id) continue;
  test(`${id} opens its real survival history from the archive selector and restores the URL`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#experiment-select').selectOption(id);
    await expect(page).toHaveURL(new RegExp(`\\?experiment=${id}$`));
    await expect(page.locator('#survival-panel')).toBeVisible();
    await expect(page.locator('#history-count')).toHaveText('060 / 060');
    await expect(page.locator('#experiment-feedback')).toContainText(
      'ChatGPT programs',
    );
    await page.reload();
    await expect(page.locator('#experiment-select')).toHaveValue(id);
    await page.locator('#timeline').fill('30');
    await expect(page.locator('[data-vital="satiety"]')).toHaveText('85 / 100');
    await page.locator('#experiment-select').selectOption('ex2');
    await expect(page.locator('#survival-panel')).toBeHidden();
  });
}
