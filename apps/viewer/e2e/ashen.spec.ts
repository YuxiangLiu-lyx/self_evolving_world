import { test, expect } from './validators.js';
import type { Page, TestInfo } from '@playwright/test';
import { BOOKMARKS } from '../src/presentation/ex9/bookmarks.js';
async function at(page: Page, tick: number): Promise<void> {
  await expect(page.locator('#presentation')).toHaveAttribute(
    'data-tick',
    String(tick),
    { timeout: 90_000 },
  );
  await expect(page.locator('#loading')).toBeHidden();
}
async function capture(
  page: Page,
  info: TestInfo,
  name: string,
): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const path = info.outputPath(`continuous-ashen-${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await info.attach(`review:continuous-ashen-${name}`, {
    path,
    contentType: 'image/png',
  });
}
test('ex9 presentation binds milestones, clothing, work and interiors to the real archive', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const started = performance.now();
  await page.goto('/ashen.html');
  await at(page, 79);
  await expect(page.locator('#action-copy')).toContainText(
    'Completed paid shelter build',
  );
  await expect(page.locator('#progress')).toContainText('6/6');
  await capture(page, info, 'shelter');
  const stage = await page.locator('#forest').boundingBox();
  if (!stage) throw new Error('Missing actor picking surface.');
  await page.mouse.click(
    stage.x + stage.width / 2 + (0.65 * stage.width) / 18,
    stage.y + stage.height / 2 + ((0.8 * 0.78 - 0.7) * stage.width) / 18,
  );
  await expect(page.locator('#presentation')).toHaveAttribute(
    'data-actor',
    'moss',
  );
  await page.locator('[data-person="lin"]').click();
  await page.locator('#bookmarks-toggle').click();
  for (const b of BOOKMARKS) {
    await page
      .locator(`button[data-tick="${String(b.tick)}"]`)
      .filter({ hasText: b.title })
      .click();
    await at(page, b.tick);
    await expect(page.locator('#presentation')).toHaveAttribute(
      'data-actor',
      b.actor,
    );
    await expect(page.locator('#chapter-copy')).toHaveText(b.text);
    if (b.tick === 76) {
      await expect(page.locator('#progress')).toContainText('3/6');
      await capture(page, info, 'construction');
    }
    if (b.tick === 448) {
      await expect(page.locator('#equipment')).toBeEmpty();
      await expect(page.locator('#progress')).toContainText('Personal study');
    }
    if (b.tick === 518)
      await expect(page.locator('#equipment')).toContainText(
        'Mantle in inventory',
      );
    if (b.tick === 519) {
      await expect(page.locator('#equipment')).toContainText('Mantle worn');
      await page.locator('.record-details').evaluate((e) => {
        (e as HTMLDetailsElement).open = true;
      });
      await expect(page.locator('#details')).toContainText(
        'mantle-518-world-2985',
      );
      await page.locator('.record-details').evaluate((e) => {
        (e as HTMLDetailsElement).open = false;
      });
      await capture(page, info, 'mantle');
    }
    if (b.tick === 721) {
      await expect(page.locator('#location')).toContainText('Inside');
      await expect(page.locator('#location')).toContainText('(6.00, 30.10)');
      await capture(page, info, 'cave');
    }
    if (b.tick === 927) {
      await expect(page.locator('#equipment')).toContainText(
        'Mantle in inventory',
      );
      await expect(page.locator('#equipment')).toContainText('160.0');
      await capture(page, info, 'repair');
    }
  }
  await page.locator('#bookmarks-toggle').click();
  await page.locator('#overview').click();
  await capture(page, info, 'overview');
  await page.locator('#minimap').click({ position: { x: 39, y: 59 } });
  await capture(page, info, 'expired');
  for (const [tick, actor, name] of [
    [79, 'lin', 'shelter'],
    [519, 'lin', 'mantle'],
    [721, 'sol', 'cave'],
  ] as const) {
    await page.goto(`/ashen.html?round=${String(tick)}&actor=${actor}`);
    await at(page, tick);
    await page.locator('#original').click();
    await expect(page.locator('#round')).toHaveText(`${String(tick)} / 1200`, {
      timeout: 90_000,
    });
    await expect(page.locator('#actor')).toHaveValue(actor);
    await expect(
      page.getByRole('link', { name: 'Ashen 风格回放（预览） ↗' }),
    ).toBeVisible();
    await page.locator('#follow').click();
    await capture(page, info, `original-${name}`);
  }
  await page.locator('#archive').selectOption('ex12');
  await expect(page.locator('#round')).toHaveText('0 / 136', {
    timeout: 90_000,
  });
  await page.reload();
  await expect(page.locator('#round')).toHaveText('0 / 136', {
    timeout: 90_000,
  });
  console.log(
    JSON.stringify({
      check: 'ashen-milestone-and-original-compatibility',
      durationMs: Math.round(performance.now() - started),
      bookmarks: BOOKMARKS.length,
    }),
  );
});
test('presentation controls preserve exact seeks, failures and responsive camera interaction', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.goto('/ashen.html?round=71');
  await at(page, 71);
  await page.locator('#next').click();
  await at(page, 72);
  await page.locator('#previous').click();
  await at(page, 71);
  await page.locator('#speed').selectOption('4');
  await page.locator('#play').click();
  await expect
    .poll(
      async () =>
        Number(await page.locator('#presentation').getAttribute('data-tick')),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(71);
  await page.locator('#play').click();
  await page.waitForTimeout(1000);
  const stopped = await page.locator('#round').textContent();
  await page.waitForTimeout(700);
  await expect(page.locator('#round')).toHaveText(stopped ?? '');
  const started = performance.now();
  await page.locator('#timeline').fill('1199');
  await page.locator('#timeline').fill('495');
  await page.locator('[data-person="sol"]').click();
  await expect(page.locator('[data-person="sol"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await at(page, 495);
  await page.locator('[data-person="lin"]').click();
  await expect(page.locator('#action')).toContainText('failed');
  const bounds = await page.locator('#forest').boundingBox();
  if (!bounds) throw new Error('Missing canvas.');
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 90,
    bounds.y + bounds.height / 2 + 20,
  );
  await page.mouse.up();
  await expect(page.locator('#follow')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.locator('#zoom-in').click();
  await page.locator('#zoom-out').click();
  await page.locator('#minimap').click({ position: { x: 60, y: 50 } });
  await page.locator('#follow').click();
  await expect(page.locator('#follow')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#round')).toHaveText('495 / 1200');
  const metric = {
    check: 'ashen-latest-seek-and-camera-controls',
    durationMs: Math.round(performance.now() - started),
    round: 495,
  };
  console.log(JSON.stringify(metric));
  await info.attach('ashen-controls', {
    body: JSON.stringify(metric),
    contentType: 'application/json',
  });
});
test('presentation is readable and operable on a narrow screen', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ashen.html?round=519');
  await at(page, 519);
  await expect(page.locator('#play')).toBeVisible();
  await expect(page.locator('#equipment')).toContainText('Mantle worn');
  await capture(page, info, 'mobile');
  await page.locator('#original').click();
  await expect(page.locator('#round')).toHaveText('519 / 1200', {
    timeout: 90_000,
  });
  await expect(page.locator('#ashen-link')).toBeVisible();
  await page.locator('#ashen-link').click();
  await at(page, 79);
});

type MotionSample = {
  now: number;
  tick: number;
  fraction: number;
  speed: number;
  playing: boolean;
  buffering: boolean;
  moving: boolean;
  phase: number;
  work: number;
  point: { x: number; y: number };
  camera: { x: number; y: number; span: number };
};
test('continuous clock preserves trajectories, gait, speed changes and segment crossing', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const samples: unknown[] = [];
    Object.assign(window, { ashenSamples: samples });
    window.addEventListener('ashen-frame', (event) => {
      samples.push((event as CustomEvent<unknown>).detail);
      if (samples.length > 6000) samples.shift();
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ashen.html?round=93&actor=lin&trace=1');
  await at(page, 93);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(350);
    const box = await page.locator('#forest').boundingBox();
    expect((box?.width ?? 0) / size.width).toBeGreaterThanOrEqual(0.9);
    expect((box?.height ?? 0) / size.height).toBeGreaterThanOrEqual(0.85);
    expect(
      await page
        .locator('#forest')
        .evaluate((e) => (e as HTMLCanvasElement).width),
    ).toBe(
      Math.round(size.width * (await page.evaluate(() => devicePixelRatio))),
    );
    await capture(page, info, `game-${String(size.width)}`);
  }
  await page.locator('#fullscreen').click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page.locator('#fullscreen').click();
  await page.locator('#play').click();
  await page.waitForTimeout(2100);
  await page.locator('#speed').selectOption('2');
  await page.waitForTimeout(1800);
  await page.locator('#speed').selectOption('4');
  await page.waitForTimeout(1300);
  await page.locator('#play').click();
  const samples = await page.evaluate(
    () => (window as unknown as { ashenSamples: MotionSample[] }).ashenSamples,
  );
  const walking = samples.filter((s) => s.playing && s.moving && !s.buffering);
  expect(new Set(walking.map((s) => s.speed))).toEqual(new Set([1, 2, 4]));
  expect(walking.some((s) => s.tick > 100)).toBe(true);
  let boundaries = 0;
  for (let n = 1; n < walking.length; n++) {
    const a = walking[n - 1],
      b = walking[n];
    if (!a || !b || b.now - a.now > 100 || b.speed !== a.speed) continue;
    const dt = b.now - a.now,
      distance = Math.hypot(b.point.x - a.point.x, b.point.y - a.point.y);
    expect(distance).toBeGreaterThan(0.0001); // Actual rendered foot, not a main-thread heartbeat.
    expect(distance).toBeLessThan((0.8 * dt * b.speed) / 900 + 0.025);
    expect(b.phase - a.phase).toBeCloseTo((distance * Math.PI * 2) / 0.65, 5);
    expect(
      Math.hypot(b.camera.x - a.camera.x, b.camera.y - a.camera.y),
    ).toBeLessThan((2 * dt * b.speed) / 900 + 0.03);
    if (b.tick !== a.tick) boundaries++;
  }
  expect(boundaries).toBeGreaterThan(5);
  await info.attach('ashen-rendered-motion', {
    body: JSON.stringify({ boundaries, samples }),
    contentType: 'application/json',
  });
  const paused = await page.locator('#phase').textContent();
  await page.waitForTimeout(400);
  await expect(page.locator('#phase')).toHaveText(paused ?? '');
  await page.locator('#next').click();
  await expect(page.locator('#phase')).toHaveText('Exact saved boundary');
  await page.locator('#timeline').fill('1199');
  await at(page, 1199);
  await page.locator('#play').click();
  await at(page, 1200);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { ashenSamples: MotionSample[] }
          ).ashenSamples.at(-1)?.tick,
      ),
    )
    .toBe(1200);
  await expect(page.locator('#play')).toHaveText('Play');
});

test('unavailable verified segment freezes the clock without hiding a real failure', async ({
  page,
}) => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    '**/ex9/replay/execution-000100-000200.json',
    async (route) => {
      await gate;
      await route.continue();
    },
  );
  await page.goto('/ashen.html?round=97&actor=lin');
  await at(page, 97);
  await page.locator('#speed').selectOption('4');
  await page.locator('#play').click();
  await expect(page.locator('#loading')).toContainText(
    'presentation time paused',
  );
  await expect(page.locator('#round')).toHaveText('100 / 1200');
  await page.waitForTimeout(400);
  await expect(page.locator('#round')).toHaveText('100 / 1200');
  await expect(page.locator('#phase')).toHaveText('Exact saved boundary');
  release();
  await expect
    .poll(async () =>
      Number(await page.locator('#presentation').getAttribute('data-tick')),
    )
    .toBeGreaterThan(100);
  await page.locator('#play').click();
  await page.locator('#timeline').fill('495');
  await at(page, 495);
  await expect(page.locator('#action')).toContainText('failed');
});

test('actual walking, work, camera and speed recording', async ({
  browser,
}, info) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    baseURL: 'http://127.0.0.1:4173',
    recordVideo: {
      dir: info.outputPath('recording'),
      size: { width: 1440, height: 900 },
    },
  });
  const page = await context.newPage();
  const video = page.video();
  try {
    await page.addInitScript(() => {
      const samples: unknown[] = [];
      Object.assign(window, { ashenSamples: samples });
      window.addEventListener('ashen-frame', (event) => {
        samples.push((event as CustomEvent<unknown>).detail);
      });
    });
    await page.goto('/ashen.html?round=93&actor=lin&trace=1');
    await at(page, 93);
    await page.locator('#play').click();
    await page.waitForTimeout(6300);
    await page.locator('#speed').selectOption('2');
    await page.waitForTimeout(2600);
    await page.locator('#speed').selectOption('4');
    await page.waitForTimeout(1600);
    await page.locator('#play').click();
    await page.locator('#timeline').fill('39');
    await at(page, 39);
    await page.locator('#speed').selectOption('1');
    await page.locator('#play').click();
    await page.waitForTimeout(5700);
    await page.locator('#play').click();
    let samples = await page.evaluate(
      () =>
        (window as unknown as { ashenSamples: MotionSample[] }).ashenSamples,
    );
    expect(
      samples.some((s) => s.tick === 40 && s.work > 0.8 && !s.moving),
    ).toBe(true);
    expect(samples.some((s) => s.tick === 41 && s.moving)).toBe(true);
    await page.locator('#timeline').fill('463');
    await at(page, 463);
    await page.locator('#play').click();
    await page.waitForTimeout(6500);
    await page.locator('#play').click();
    samples = await page.evaluate(
      () =>
        (window as unknown as { ashenSamples: MotionSample[] }).ashenSamples,
    );
    expect(samples.some((s) => s.tick === 467 && s.work > 0.95)).toBe(true);
    await page.locator('#timeline').fill('79');
    await at(page, 79);
    await page.locator('[data-person="moss"]').click();
    await page.waitForTimeout(800);
    await page.locator('[data-person="sol"]').click();
    await page.waitForTimeout(800);
    const box = await page.locator('#forest').boundingBox();
    if (!box) throw new Error('Missing canvas.');
    await page.mouse.move(box.width / 2, box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.width / 2 + 160, box.height / 2 + 60, {
      steps: 24,
    });
    await page.mouse.up();
    await expect(page.locator('#follow')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await page.waitForTimeout(700);
    await page.locator('#zoom-in').click();
    await page.waitForTimeout(700);
    await page.locator('#follow').click();
    await page.waitForTimeout(1400);
    await page.locator('#zoom-out').click();
    await page.waitForTimeout(700);
    await page.locator('#overview').click();
    await page.waitForTimeout(800);
    await page.locator('[data-person="lin"]').click();
    await page.locator('#bookmarks-toggle').click();
    await page.locator('button[data-tick="721"]').click();
    await at(page, 721);
    await page.locator('#bookmarks-toggle').click();
    await page.waitForTimeout(800);
    samples = await page.evaluate(
      () =>
        (window as unknown as { ashenSamples: MotionSample[] }).ashenSamples,
    );
    await info.attach('ashen-dynamic-recording-trace', {
      body: JSON.stringify(samples),
      contentType: 'application/json',
    });
  } finally {
    await context.close();
    if (video)
      await info.attach('ashen-actual-playback', {
        path: await video.path(),
        contentType: 'video/webm',
      });
  }
});
