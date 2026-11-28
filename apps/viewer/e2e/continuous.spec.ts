import { browserSelection } from '../../../scripts/validation-plan.js';
import { copyFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from './validators.js';
import type { Page, TestInfo } from '@playwright/test';
import {
  experimentIds,
  validateExperiment,
  digest,
  writeExperimentJson,
} from '../../../scripts/experiments.js';
import {
  CONTINUOUS_ASSERTIONS,
  continuousFrameTicks,
} from '../../../scripts/continuous-analysis.js';
import { continuousRead } from '../../../scripts/continuous-store.js';
import type {
  V7ReplayIndex,
  V7ReplaySegment,
} from '../../../scripts/continuous-store.js';
import { continuousScene, sceneSvg } from '../src/continuous-scene.js';
import { CONTINUOUS_VISUALS } from '../src/continuous-visuals.js';
import {
  continuousFixture,
  tensionPackage,
} from '../../../packages/world-core/test/fixtures/continuous-extension.js';
import {
  V7_BASE,
  v7Registry,
  v7Install,
  v7Clone,
  v7Step,
} from '@self-evolving-world/world-core';
const root = process.cwd(),
  capture = process.env.WORLD_EXPERIMENT_CAPTURE;
async function screenshot(
  page: Page,
  info: TestInfo,
  name: string,
): Promise<string> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await info.attach(`review:${name}`, { path, contentType: 'image/png' });
  return path;
}
const ids = (
  capture ? [capture] : (browserSelection()?.archives ?? experimentIds(root))
)
  .filter(
    (id) =>
      (
        JSON.parse(
          readFileSync(
            resolve(root, 'experiment', id, 'manifest.json'),
            'utf8',
          ),
        ) as { version: number }
      ).version === 7,
  )
  .sort((a, b) => Number(b.slice(2)) - Number(a.slice(2)));
// Start recent, larger archives first so two CI workers overlap their replay.
for (const id of ids)
  test(`${id} verifies segmented continuous evidence in the game observatory`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    const record = validateExperiment(root, id, !!capture),
      directory = record.directory,
      index = continuousRead<V7ReplayIndex>(resolve(directory, 'replay.json')),
      // 0, or the imported genesis round of an imported run.
      start = index.segments[0]?.start ?? 0;
    await page.route('**/experiments/index.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          version: 1,
          experiments: [
            { ...record.config, createdAt: record.manifest.createdAt },
          ],
        }),
      }),
    );
    await page.route(`**/experiments/${id}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname.split(
        `/experiments/${id}/`,
      )[1];
      if (
        !path ||
        (path !== 'replay.json' && !index.segments.some((p) => p.path === path))
      )
        throw new Error('Unexpected public archive request.');
      await route.fulfill({
        contentType: 'application/json',
        body: readFileSync(resolve(directory, path), 'utf8'),
      });
    });
    const opened = performance.now();
    await page.goto(`/observatory.html?experiment=${id}`);
    // Wait for the initial asynchronous reconstruction before seeking again.
    await expect(page.locator('#round')).toHaveText(
      `${String(start)} / ${String(index.observed)}`,
      { timeout: 90_000 },
    );
    console.log(
      JSON.stringify({
        check: 'archive-initial-frame',
        id,
        durationMs: Math.round(performance.now() - opened),
      }),
    );
    const ticks = continuousFrameTicks(start, index.observed),
      scenes = ['initial', 'midpoint', 'final'];
    for (const [i, tick] of ticks.entries()) {
      if (i > 0) await page.locator('#time').fill(String(tick));
      await expect(page.locator('#round')).toHaveText(
        `${String(tick)} / ${String(index.observed)}`,
        { timeout: 90_000 },
      );
      if (!('continuous' in record))
        throw new Error('Expected continuous browser oracle.');
      const world = present(record.continuous.frames[tick]);
      await expect(page.locator('#scene [data-scene-actor]')).toHaveCount(
        world.actors.length,
      );
      // Compare every member in one browser round trip, including identity.
      expect(
        await page
          .locator('#scene [data-scene-actor]')
          .evaluateAll((nodes) =>
            nodes
              .map((n) => [
                n.getAttribute('data-scene-actor'),
                n.getAttribute('data-x'),
                n.getAttribute('data-y'),
              ])
              .sort(),
          ),
      ).toEqual(
        world.actors
          .map((a) => [a.id, String(a.position.x), String(a.position.y)])
          .sort(),
      );
      await page.locator('#actor').selectOption(present(world.actors[0]).id);
      await expect(page.locator('#happiness')).toContainText(
        present(world.actors[0]).wellbeing.total.toFixed(1),
      );
      // State and screenshots cover all three frames; exercise the same camera
      // and perspective controls once per archive on its richest final state.
      if (i === ticks.length - 1) {
        await page.locator('#private').click();
        await expect(page.locator('#stage-tag')).toContainText(
          'PERSONAL OBSERVATION',
        );
        await page.locator('#global').click();
        const positions = await page
          .locator('#scene [data-scene-actor]')
          .evaluateAll((nodes) =>
            nodes.map((n) => [
              n.getAttribute('data-x'),
              n.getAttribute('data-y'),
            ]),
          );
        await page.locator('#zoom-in').click();
        await page.locator('#follow').click();
        await page.locator('#geometry').click();
        expect(
          await page
            .locator('#scene [data-scene-actor]')
            .evaluateAll((nodes) =>
              nodes.map((n) => [
                n.getAttribute('data-x'),
                n.getAttribute('data-y'),
              ]),
            ),
        ).toEqual(positions);
        await page.locator('#follow').click();
        await page.locator('#geometry').click();
      }
      await page.locator('#fit').click();
      const path = await screenshot(page, info, `${id}-${String(scenes[i])}`);
      if (capture)
        copyFileSync(path, resolve(directory, `${String(scenes[i])}.png`));
    }
    if (index.observed - start > 1) {
      await page.locator('#time').fill(String(start));
      await expect(page.locator('#round')).toHaveText(
        `${String(start)} / ${String(index.observed)}`,
      );
      await page.locator('#play').click();
      await expect(page.locator('#round')).not.toHaveText(
        `${String(start)} / ${String(index.observed)}`,
      );
      await page.locator('#play').click();
    }
    await page.setViewportSize({ width: 1160, height: 680 });
    await page.setContent(
      `<html lang="en"><head><title>${id} measured outcome</title></head><body style="margin:0">${readFileSync(resolve(directory, 'overview.svg'), 'utf8')}</body></html>`,
    );
    await expect(page.getByRole('img')).toBeVisible();
    const chart = await screenshot(page, info, `${id}-overview`);
    if (capture) copyFileSync(chart, resolve(directory, 'overview.png'));
    if (capture)
      writeExperimentJson(resolve(directory, 'browser.json'), {
        id,
        status: 'passed',
        replayHash: digest(resolve(directory, 'replay.json')),
        frameTicks: ticks,
        assertions: CONTINUOUS_ASSERTIONS,
        errors: [],
      });
  });
if (
  !capture &&
  (!browserSelection() || browserSelection()?.groups.includes('historical'))
) {
  test('historical ex6 gains a game presentation while retaining exact grid positions and original rules', async ({
    page,
  }, info) => {
    await page.goto('/?experiment=ex6');
    await expect(page.locator('#round')).toHaveText('0 / 180');
    await expect(page.locator('#spatial-caption')).toContainText(
      'Historical grid simulation',
    );
    const record = validateExperiment(root, 'ex6');
    for (const tick of [0, 90, 180]) {
      await page.locator('#time').fill(String(tick));
      await expect(page.locator('#round')).toHaveText(`${String(tick)} / 180`);
      for (const actor of present(record.run.frames[tick]).agents) {
        await expect(
          page.locator(`#scene [data-scene-actor="${actor.id}"]`),
        ).toHaveAttribute('data-x', String(actor.position.x));
      }
    }
    await expect(page.locator('#happiness')).toContainText('not measured');
    await page.locator('#zoom-in').click();
    await page.locator('#actor').selectOption('moss');
    await page.locator('#follow').click();
    await screenshot(page, info, 'historical-game-ex6');
    await page.locator('#private').click();
    await expect(page.locator('#stage-tag')).toContainText('PERSONAL');
    await screenshot(page, info, 'historical-personal-ex6');
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, info, 'historical-game-mobile');
    await page.goto('/?experiment=ex1');
    await expect(page.locator('#round')).toHaveText('0 / 480');
    await expect(page.locator('#vitals strong')).toHaveText([
      '—',
      '—',
      '—',
      '—',
    ]);
    await screenshot(page, info, 'historical-unmeasured-vitals');
  });
}
if (
  !capture &&
  (!browserSelection() || browserSelection()?.groups.includes('continuous'))
) {
  test('an isolated absent mechanism has a new renderer bound to its paid persistent state', async ({
    page,
  }, info) => {
    let world = continuousFixture();
    const registry = v7Registry([V7_BASE, tensionPackage]);
    expect(CONTINUOUS_VISUALS['fixture-tension-surface']).toBeUndefined();
    world = v7Clone(v7Install(world, registry, 'fixture-tension@1'));
    world.stacks.push({
      id: 'material',
      resource: 'branch',
      quantity: 2,
      owner: 'a',
      position: { x: 2, y: 2 },
      origin: 'isolated test only',
    });
    world = v7Step(
      world,
      {
        a: { interface: 'learn', args: { ability: 'fixture-build' } },
        b: { interface: 'wait', args: {} },
      },
      registry,
    ).world;
    world = v7Step(
      world,
      {
        a: { interface: 'wait', args: {} },
        b: { interface: 'wait', args: {} },
      },
      registry,
    ).world;
    world = v7Step(
      world,
      {
        a: { interface: 'fixture-build', args: {} },
        b: { interface: 'wait', args: {} },
      },
      registry,
    ).world;
    CONTINUOUS_VISUALS['fixture-tension-surface'] = (o) =>
      `<rect x="-.45" y="-.3" width=".9" height=".6" rx=".06" fill="#9f764b"/><path data-fixture-tension="${String(Number(o.data.tension))}" d="M-.35-.2L.35.2M-.35.2L.35-.2M0-.2V.2" stroke="#f7ddb1" stroke-width=".045"/><text y=".6" font-size=".16" text-anchor="middle">Tension ${String(Number(o.data.tension))}</text>`;
    try {
      const content = sceneSvg(continuousScene(world, null), 'a', true);
      const styles = readFileSync(
        resolve(root, 'apps/viewer/src/observatory.css'),
        'utf8',
      );
      await page.setContent(
        `<html lang="en"><head><title>Isolated extension visual proof</title><style>${styles}</style></head><body style="margin:0;background:#e9ede3"><h1 style="font:24px Georgia;padding:20px">Isolated extension fixture — never autonomous evidence</h1><svg role="img" aria-label="Paid tension surface" width="900" height="700" viewBox="0 0 8 6">${content}</svg></body></html>`,
      );
      await expect(page.locator('[data-fixture-tension]')).toHaveAttribute(
        'data-fixture-tension',
        '10',
      );
      await expect(page.locator('[data-scene-object]')).toHaveCount(1);
      await screenshot(page, info, 'isolated-continuous-extension');
    } finally {
      delete CONTINUOUS_VISUALS['fixture-tension-surface'];
    }
  });
}

function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required fixture value is missing.');
  return value;
}

if (!capture)
  test('continuous fixture reconstructs fractional saved state, private vision and before-after without inference', async ({
    page,
  }, info) => {
    const { initialContinuousWorld } =
      await import('../../simulator/src/continuous-scenario.js');
    const { continuousRegistry, v7Signature } =
      await import('@self-evolving-world/world-core');
    const { continuousHash } =
      await import('../../../scripts/continuous-store.js');
    const initial = initialContinuousWorld();
    let world = initial;
    const rounds: V7ReplaySegment['rounds'] = [];
    for (let tick = 0; tick < 5; tick++) {
      const actions = Object.fromEntries(
        world.actors.map((a) => [
          a.id,
          tick === 0
            ? {
                interface: 'navigate',
                args: {
                  target: '',
                  x: a.position.x + 0.6,
                  y: a.position.y + 0.2,
                },
              }
            : { interface: 'rest', args: {} },
        ]),
      );
      const before = continuousHash(v7Signature(world)),
        result = v7Step(world, actions, continuousRegistry());
      world = result.world;
      rounds.push({
        tick: world.tick,
        before,
        after: continuousHash(v7Signature(world)),
        actions,
        reviews: [],
        registrations: [],
        memory: {},
        events: world.events,
        tasks: {},
      });
    }
    const segment = JSON.stringify({ version: 7, start: 0, initial, rounds });
    await page.route('**/experiments/index.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          version: 1,
          experiments: [{ id: 'ex99', steps: 5 }],
        }),
      }),
    );
    await page.route('**/experiments/ex99/replay.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          version: 7,
          observed: 5,
          target: 5,
          phase: 'isolated-fixture',
          segments: [
            {
              path: 'replay/part-000000-000005.json',
              start: 0,
              end: 5,
              sha256: continuousHash(segment),
            },
          ],
        }),
      }),
    );
    await page.route(
      '**/experiments/ex99/replay/part-000000-000005.json',
      (route) =>
        route.fulfill({ contentType: 'application/json', body: segment }),
    );
    await page.goto('/observatory.html?experiment=ex99');
    await expect(page.locator('#status')).toContainText(
      'Verified recorded state',
    );
    await expect(page.locator('#round')).toHaveText('0 / 5');
    await page.locator('#time').fill('5');
    await expect(page.locator('#round')).toHaveText('5 / 5');
    await expect(
      page.locator('#scene [data-scene-actor="lin"]'),
    ).toHaveAttribute('data-x', String(present(world.actors[0]).position.x));
    await page.locator('#private').click();
    await expect(page.locator('#scene [data-scene-actor]')).toHaveCount(1);
    await page.locator('#global').click();
    await expect(page.locator('#scene [data-scene-actor]')).toHaveCount(3);
    await page.locator('#compare').click();
    await expect(page.locator('#round')).toHaveText('4 / 5');
    await page.locator('#compare').click();
    await expect(page.locator('#round')).toHaveText('5 / 5');
    await page.locator('#scene [data-scene-object="tree-1"]').click();
    await expect(page.locator('#object-title')).toHaveText('Broadleaf tree');
    await screenshot(page, info, 'continuous-initial-world-fixture');
  });

if (!capture)
  test('concurrent segment loads are shared and an obsolete archive cannot replace the current selection', async ({
    page,
  }) => {
    const { recordedSegment } =
      await import('../test/fixtures/continuous-history.js');
    const { continuousHash } =
      await import('../../../scripts/continuous-store.js');
    const old = await recordedSegment(7),
      current = await recordedSegment(7, 7);
    const path = 'replay/part-000000-000007.json';
    const sources: Record<string, string> = {
      ex99: JSON.stringify(old.segment),
      ex98: JSON.stringify(current.segment),
    };
    let release: (() => void) | undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started: (() => void) | undefined;
    const arrived = new Promise<void>((resolve) => {
      started = resolve;
    });
    let responseSent: (() => void) | undefined;
    const oldResponseSent = new Promise<void>((resolve) => {
      responseSent = resolve;
    });
    let oldLoads = 0;
    await page.route('**/experiments/index.json', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          version: 1,
          experiments: [
            { id: 'ex99', steps: 7 },
            { id: 'ex98', steps: 7 },
          ],
        }),
      }),
    );
    await page.route(/\/experiments\/ex9[89]\//, async (route) => {
      const url = new URL(route.request().url());
      const archive = url.pathname.includes('/ex99/') ? 'ex99' : 'ex98';
      const source = present(sources[archive]);
      if (url.pathname.endsWith('/replay.json')) {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            version: 7,
            observed: 7,
            target: 7,
            phase: 'isolated-fixture',
            segments: [
              { path, start: 0, end: 7, sha256: continuousHash(source) },
            ],
          }),
        });
      } else {
        if (archive === 'ex99') {
          oldLoads += 1;
          started?.();
          await hold;
        }
        await route.fulfill({ contentType: 'application/json', body: source });
        if (archive === 'ex99') responseSent?.();
      }
    });
    try {
      await page.goto('/observatory.html?experiment=ex99');
      await arrived;
      await page.locator('#time').fill('2');
      await page.locator('#time').fill('3');
      await page.locator('#archive').selectOption('ex98');
      await expect(page.locator('#round')).toHaveText('0 / 7');
      await expect(
        page.locator('#scene [data-scene-actor="a"]'),
      ).toHaveAttribute('data-x', '9');
      release?.();
      await oldResponseSent;
      await expect(page.locator('#archive')).toHaveValue('ex98');
      await expect(
        page.locator('#scene [data-scene-actor="a"]'),
      ).toHaveAttribute('data-x', '9');
      expect(oldLoads).toBe(1);
      await page.locator('#time').fill('5');
      await expect(page.locator('#round')).toHaveText('5 / 7');
      await page.locator('#time').fill('1');
      await expect(page.locator('#round')).toHaveText('1 / 7');
    } finally {
      release?.();
    }
  });

if (!capture)
  test('large replay keeps controls responsive, cancels obsolete seeks and reuses verified frames', async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    await page.goto('/?experiment=ex12');
    await expect(page.locator('#round')).toHaveText('0 / 136');
    await expect
      .poll(() => page.locator('#scene *').count())
      .toBeLessThan(3000);
    await page.locator('#time').fill('90');
    await expect(page.locator('#status')).toContainText(
      'Verifying saved state:',
    );
    // The interaction must settle before the long target. A main-thread replay
    // would freeze this click until all ninety rounds had already completed.
    await page.locator('#geometry').click();
    await expect(page.locator('#geometry')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('#round')).toHaveText('0 / 136');
    await page.locator('#time').fill('3');
    await expect(page.locator('#round')).toHaveText('3 / 136');
    await page.locator('#geometry').click();
    await page.locator('#time').fill('0');
    await expect(page.locator('#round')).toHaveText('0 / 136');
    await page.locator('#play').click();
    await expect(page.locator('#round')).toHaveText('1 / 136');
    await page.locator('#play').click();
    await expect(page.locator('#play')).toHaveText('Play');
    await page.locator('#time').fill('0');
    await expect(page.locator('#round')).toHaveText('0 / 136');
    await page.waitForTimeout(1100);
    await expect(page.locator('#round')).toHaveText('0 / 136');
    await page.locator('#private').click();
    await expect(page.locator('#stage-tag')).toContainText('PERSONAL');
    // Select an actual member before inspecting the private hit layer.
    await page.locator('#actor').selectOption('ash-1');
    await expect(page.locator('#scene [data-scene-actor="ash-1"]')).toHaveCount(
      1,
    );
    await expect(
      page.locator('#scene [data-scene-actor="birch-1"]'),
    ).toHaveCount(0);
    await page.locator('#global').click();
    await page.locator('#fit').click();
    await screenshot(page, info, 'continuous-responsive-collective');
    await page.locator('#time').fill('90');
    await page.locator('#archive').selectOption('ex8');
    await expect(page.locator('#round')).toHaveText('0 / 897');
    await expect(page.locator('#status')).toContainText('ex8 · Verified');
    await expect(page.locator('#scene [data-scene-actor="ash-1"]')).toHaveCount(
      0,
    );
  });
