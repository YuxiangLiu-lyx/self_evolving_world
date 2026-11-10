import { reconstructEvolutionRun } from '@self-evolving-world/world-core';
import { initialEvolutionWorld } from '../../simulator/src/evolution-scenario.js';
import { evolutionSmoke } from '../../../scripts/evolution-smoke.js';
import { serializeReplay } from '../src/timeline.js';
import { captureReview, expect, test } from './validators.js';
const smoke = evolutionSmoke(),
  run = reconstructEvolutionRun(
    initialEvolutionWorld(),
    smoke.programs,
    smoke.roundsEvidence,
  );
const source = serializeReplay({
  schedule: 'evolution-v1',
  frames: run.frames,
  evolutionPrograms: run.programs,
  evolutionRounds: run.rounds,
});
test('renders the heterogeneous map, private discoveries, generated code and usable zoom without losing history', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.locator('#import-file').setInputFiles({
    name: 'evolution-offline-smoke.json',
    mimeType: 'application/json',
    buffer: Buffer.from(source),
  });
  await expect(page.locator('#history-count')).toHaveText('012 / 012');
  await expect(page.locator('#world-grid [role="gridcell"]')).toHaveCount(
    48 * 48,
  );
  await expect(page.locator('#world-skill-count')).toContainText(
    '1 world implementations',
  );
  await expect(page.locator('[data-vital="satiety"]')).toHaveText('52 / 100');
  await page.locator('#learned-skills summary').click();
  await expect(page.locator('#learned-skills')).toContainText('consume');
  await expect(page.locator('#resource-details')).toContainText(
    'nutrition 16, toxicity 0',
  );
  await captureReview(page, info, 'evolution-browser');
  await page.locator('#agent-select').selectOption('reed');
  await expect(page.locator('#resource-details')).toContainText(
    'Properties unknown',
  );
  await expect(page.locator('#resource-details')).not.toContainText(
    'toxicity 18',
  );
  await page.locator('#map-scale').selectOption('960');
  expect(
    await page
      .locator('.map-surround')
      .evaluate((e) => e.scrollWidth > e.clientWidth),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#map-scale').selectOption('0');
  await page.locator('#agent-view').click();
  await captureReview(page, info, 'evolution-mobile');
  await page.locator('#first-frame').click();
  await expect(page.locator('#world-skill-count')).toContainText(
    '0 world implementations',
  );
  await expect(page.locator('[data-vital="satiety"]')).toHaveText('60 / 100');
  await page.locator('#reset-button').click();
  await expect(page.locator('#map-scale-control')).toBeHidden();
});
