import {
  acceptLearningProgram,
  advanceLearningRound,
  createLearningRun,
  pendingLearningPrograms,
} from '@self-evolving-world/world-core';
import { initialLearningWorld } from '../../simulator/src/learning-scenario.js';
import { serializeReplay } from '../src/timeline.js';
import { captureReview, expect, test } from './validators.js';
import { experimentIds, readExperiment } from '../../../scripts/experiments.js';

const request = {
  name: 'Resource gathering',
  purpose: 'Gather a fruit and branch from a nearby tree',
  target: 'Adjacent stocked tree',
  conditions: 'Within reach and available resources',
  expectedEffect: 'Transfer finite materials into inventory',
};
let run = createLearningRun(initialLearningWorld());
for (const id of pendingLearningPrograms(run))
  run = acceptLearningProgram(run, {
    agentId: id,
    tick: 0,
    call: 1,
    code: `learn(${JSON.stringify(request)});`,
    summary: 'Offline fixture: learn a compound resource capability.',
  });
run = advanceLearningRound(
  run,
  ['lin', 'moss', 'sol'].map((agentId) => ({
    agentId,
    decision: 'create',
    reason: 'Two rounds of practice for coordinated gathering.',
    prerequisites: ['Adjacent tree with fruit and branches'],
    learningRounds: 2,
    skillId: null,
    specification: {
      name: 'Gather provisions',
      description: 'Take one fruit and one branch without duplicating stock.',
      parameters: ['tree'],
      code: 'harvest("tree","fruit",1); harvest("tree","branch",1);',
    },
  })),
);
run = advanceLearningRound(run, []);
const source = serializeReplay({
  schedule: 'learning-v1',
  frames: run.frames,
  learningPrograms: run.programs,
  learningRounds: run.rounds,
});

test('shows versioned terrain, individual learning and generated implementations on desktop and mobile', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.locator('#import-file').setInputFiles({
    name: 'learning-offline-fixture.json',
    mimeType: 'application/json',
    buffer: Buffer.from(source),
  });
  await expect(page.locator('#capability-panel')).toBeVisible();
  await expect(page.locator('#world-skill-count')).toHaveText(
    '1 world implementations',
  );
  await expect(page.locator('[data-map-object]')).toHaveCount(9);
  await expect(page.locator('#learned-skills')).toContainText(
    'Gather provisions',
  );
  await page.locator('#learned-skills summary').click();
  await expect(page.locator('#learned-skills')).toContainText('harvest');
  await expect(page.locator('[data-vital="satiety"]')).toHaveText('9 / 100');
  await expect(page.locator('#resource-details')).toContainText('24');
  await captureReview(page, info, 'learning-browser');
  await page.locator('#timeline').fill('1');
  await expect(page.locator('#learning-progress')).toContainText('1 / 2');
  await expect(page.locator('#learned-skills')).toContainText('No learned');
  await page.setViewportSize({ width: 390, height: 844 });
  await captureReview(page, info, 'learning-mobile');
  await page.locator('#first-frame').click();
  await expect(page.locator('#world-skill-count')).toHaveText(
    '0 world implementations',
  );
  await expect(page.locator('[data-vital="satiety"]')).toHaveText('15 / 100');
  await page.locator('#reset-button').click();
  await expect(page.locator('#capability-panel')).toBeHidden();
});
for (const id of experimentIds(process.cwd()).filter(
  (id) =>
    readExperiment(
      process.cwd(),
      id,
      process.env.WORLD_EXPERIMENT_CAPTURE === id,
    ).manifest.version === 4,
)) {
  if (process.env.WORLD_EXPERIMENT_CAPTURE === id) continue;
  test(`${id} opens learning history through the shared selector and survives reload`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('#experiment-select').selectOption(id);
    await expect(page.locator('#capability-panel')).toBeVisible();
    await expect(page.locator('#history-count')).toHaveText('018 / 018');
    await expect(page.locator('#experiment-feedback')).toContainText(
      'Survival-driven skills',
    );
    await page.reload();
    await expect(page.locator('#experiment-select')).toHaveValue(id);
    await page.locator('#timeline').fill('0');
    await expect(page.locator('[data-vital="satiety"]')).toHaveText('15 / 100');
    await page.locator('#experiment-select').selectOption('ex3');
    await expect(page.locator('#capability-panel')).toBeHidden();
  });
}
