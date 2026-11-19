import { coevolutionSmoke } from '../../../scripts/coevolution-smoke.js';
import { serializeReplay } from '../src/timeline.js';
import { captureReview, expect, test } from './validators.js';
const run = coevolutionSmoke(),
  source = serializeReplay({
    schedule: 'coevolution-v1',
    frames: run.frames,
    coevolutionPrograms: run.programs,
    coevolutionRounds: run.rounds,
  });
test('shows persistent shared facilities, personal projects and actual energy in version-six replay', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.locator('#import-file').setInputFiles({
    name: 'coevolution-offline.json',
    mimeType: 'application/json',
    buffer: Buffer.from(source),
  });
  await expect(page.locator('#history-count')).toHaveText('012 / 012');
  await expect(page.locator('#world-grid [role="gridcell"]')).toHaveCount(
    24 * 24,
  );
  await expect(page.locator('[data-persistent-object]')).toHaveCount(1);
  await expect(page.locator('#resource-details')).toContainText(
    'Project: Recovery consumes time',
  );
  await expect(page.locator('#resource-details')).toContainText(
    'Energy: 40 / 40',
  );
  await expect(page.locator('#resource-details')).toContainText(
    'Shared stationary object',
  );
  await expect(page.locator('#learning-policy')).toContainText(
    'Finite ecology',
  );
  await captureReview(page, info, 'coevolution-browser');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#agent-view').click();
  await captureReview(page, info, 'coevolution-mobile');
  await page.locator('#first-frame').click();
  await expect(page.locator('[data-persistent-object]')).toHaveCount(0);
  await expect(page.locator('#world-skill-count')).toContainText(
    '1 world implementations',
  );
  await expect(page.locator('[data-vital="satiety"]')).toHaveText('80 / 100');
});
