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
    stage.x + stage.width / 2 + (0.65 * stage.width) / 16,
    stage.y + stage.height / 2 + ((1.8 * 0.78 - 0.7) * stage.width) / 16,
  );
  await expect(page.locator('#presentation')).toHaveAttribute(
    'data-actor',
    'moss',
  );
  await page.locator('[data-person="lin"]').click();
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
