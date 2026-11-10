import { copyFileSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import type { WorldState } from '@self-evolving-world/world-core';
import {
  BROWSER_ASSERTIONS,
  digest,
  experimentId,
  experimentIds,
  EXPERIMENT_SCENES,
  readExperiment,
  writeExperimentJson,
} from '../../../scripts/experiments.js';
import { captureReview, expect, test } from './validators.js';

const root = process.cwd();
const capture = process.env.WORLD_EXPERIMENT_CAPTURE;
if (capture !== undefined) experimentId(capture);
const ids = capture === undefined ? experimentIds(root) : [capture];

async function inspectState(page: Page, state: WorldState): Promise<void> {
  await expect(page.locator('#tick-value')).toHaveText(
    String(state.tick).padStart(3, '0'),
  );
  await expect(page.locator('[data-map-agent]')).toHaveCount(
    state.agents.length,
  );
  await expect(page.locator('[data-map-item]')).toHaveCount(state.items.length);
  for (const agent of state.agents) {
    await expect(
      page
        .getByRole('gridcell', {
          name: `Cell ${String(agent.position.x)}, ${String(agent.position.y)}`,
          exact: true,
        })
        .getByRole('button', { name: `Observe ${agent.name}`, exact: true }),
    ).toBeVisible();
    await page.locator('#agent-select').selectOption(agent.id);
    await expect(page.locator('#agent-position')).toHaveText(
      `${String(agent.position.x).padStart(2, '0')} , ${String(agent.position.y).padStart(2, '0')}`,
    );
    await expect(page.locator('#inventory-count')).toHaveText(
      String(agent.inventory.length).padStart(2, '0'),
    );
    for (const item of agent.inventory)
      await expect(page.locator('#inventory')).toContainText(item.name);
    if (state.survival || state.learning || state.evolution) {
      await expect(page.locator('#survival-panel')).toBeVisible();
      for (const key of ['health', 'satiety', 'cold', 'heat'] as const)
        await expect(page.locator(`[data-vital="${key}"]`)).toHaveText(
          `${String((state.evolution ?? state.learning ?? state.survival)?.vitals[agent.id]?.[key])} / 100`,
        );
      await expect(page.locator('#program-code')).not.toBeEmpty();
    } else await expect(page.locator('#survival-panel')).toBeHidden();
    const observation = state.observations.find(
      (entry) => entry.self.id === agent.id,
    );
    if (!observation) throw new Error('Missing observation.');
    await page.locator('#agent-view').click();
    await expect(page.locator('[data-map-agent]')).toHaveCount(
      observation.agents.length + 1,
    );
    await expect(page.locator('[data-map-item]')).toHaveCount(
      observation.items.length,
    );
    await page.locator('#global-view').click();
  }
  await page.locator('#agent-select').selectOption('lin');
}

async function exported(page: Page): Promise<unknown> {
  const pending = page.waitForEvent('download');
  await page.locator('#export-button').click();
  const download = await pending;
  const path = await download.path();
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

for (const id of ids) {
  test(`${id} reconstructs recorded results in the real viewer and preserves replay`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    const { directory, config, run } = readExperiment(
      root,
      id,
      capture !== undefined,
    );
    await page.goto('/');
    await page
      .locator('#import-file')
      .setInputFiles(resolve(directory, 'replay.json'));
    await expect(page.locator('#history-count')).toHaveText(
      `${String(config.steps).padStart(3, '0')} / ${String(config.steps).padStart(3, '0')}`,
    );
    const ticks = [0, Math.floor(config.steps / 2), config.steps];
    for (const [index, tick] of ticks.entries()) {
      const scene = EXPERIMENT_SCENES[index];
      const state = run.frames[tick];
      if (!scene || !state) throw new Error('Missing review frame.');
      await page.locator('#timeline').fill(String(tick));
      await inspectState(page, state);
      if (tick < config.steps || config.schedule !== undefined)
        await expect(
          page.getByRole('button', { name: 'Move east' }),
        ).toBeDisabled();
      if (config.schedule !== undefined) {
        await expect(page.locator('#tick-unit')).toHaveText('ROUND');
        for (const event of state.evolution?.events ??
          state.learning?.events ??
          state.survival?.events ??
          state.events ??
          []) {
          const actor = state.agents.find(
            ({ id }) => id === event.action.agentId,
          );
          await expect(page.locator('#current-event')).toContainText(
            actor?.name ?? event.action.agentId,
          );
        }
      }
      await captureReview(page, info, `${id}-${scene}`);
      if (capture)
        copyFileSync(
          info.outputPath(`${id}-${scene}.png`),
          resolve(directory, `${scene}.png`),
        );
    }
    expect(await exported(page)).toEqual(run.replay);
    await page.locator('#first-frame').click();
    await page.locator('#speed').selectOption('4');
    await page.locator('#play-button').click();
    await expect(page.locator('#tick-value')).not.toHaveText('000');
    await page.locator('#play-button').click();
    await page.locator('#latest-frame').click();
    expect(await exported(page)).toEqual(run.replay);
    // Render the measured vector chart in Chromium, then review its real pixels.
    await page.setViewportSize({ width: 1160, height: 680 });
    await page.setContent(
      `<html lang="en"><head><title>${id} results</title></head><body style="margin:0">${readFileSync(resolve(directory, 'overview.svg'), 'utf8')}</body></html>`,
    );
    await expect(page.getByRole('img')).toBeVisible();
    const chart = info.outputPath(`${id}-overview.png`);
    await page.screenshot({ path: chart, fullPage: true });
    await info.attach(`review:${id}-overview`, {
      path: chart,
      contentType: 'image/png',
    });
    if (capture) copyFileSync(chart, resolve(directory, 'overview.png'));
    for (const scene of EXPERIMENT_SCENES) {
      const data = readFileSync(resolve(directory, `${scene}.png`)).toString(
        'base64',
      );
      const dimensions = await page.evaluate(async (source) => {
        const image = new Image();
        image.src = `data:image/png;base64,${source}`;
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      }, data);
      expect(dimensions[0]).toBeGreaterThan(100);
      expect(dimensions[1]).toBeGreaterThan(100);
    }
    if (capture)
      writeExperimentJson(resolve(directory, 'browser.json'), {
        id,
        status: 'passed',
        replayHash: digest(resolve(directory, 'replay.json')),
        frameTicks: ticks,
        assertions: BROWSER_ASSERTIONS,
        errors: [],
      });
  });
}
