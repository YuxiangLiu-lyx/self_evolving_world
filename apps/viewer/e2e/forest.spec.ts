import { test, expect } from './validators.js';
import type { Page, TestInfo } from '@playwright/test';
import {
  v7Clone,
  v7Install,
  v7Registry,
  V7_PACKAGES,
  v7Step,
  v7Remember,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import { initialForestWorld } from '../../simulator/src/forest-scenario.js';
import {
  forestFixture,
  forestFixturePackage,
} from '../../../packages/world-core/test/fixtures/forest-extension.js';

async function load(page: Page, frames: V7World[]) {
  await page.goto('/forest-lab.html');
  await page.getByLabel('Isolated fixture file').setInputFiles({
    name: 'isolated-forest.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ frames })),
  });
  await expect(page.locator('#fixture-title')).toContainText(
    'Isolated frame 0',
  );
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await info.attach(`review:${name}`, { path, contentType: 'image/png' });
}
async function seek(page: Page, index: number) {
  await page.locator('#fixture-time').fill(String(index));
  await page.locator('#fixture-time').dispatchEvent('input');
  await expect(page.locator('#fixture-title')).toContainText(
    `Isolated frame ${String(index)}`,
  );
}

test('isolated forest exploration and cave interiors use real wall passages', async ({
  page,
}, info) => {
  let world = v7Clone(initialForestWorld());
  const actor = world.actors[0];
  if (!actor) throw new Error('Missing fixture actor');
  actor.position = { x: 6, y: 31.8 };
  const inside = world.actors[1];
  if (!inside) throw new Error('Missing interior occlusion fixture actor');
  inside.position = { x: 6.8, y: 29 };
  // The closed exterior roof must occlude this actual interior character.
  // Once the selected actor enters, the roof opens and both occupants appear.
  v7Remember(world);
  const frames = [world];
  for (let i = 0; i < 4; i++) {
    const actions: Record<string, V7Action> = Object.fromEntries(
      world.actors.map((a) => [a.id, { interface: 'wait', args: {} }]),
    );
    actions.lin = { interface: 'navigate', args: { target: '', x: 6, y: 29 } };
    const result = v7Step(world, actions, v7Registry(V7_PACKAGES));
    expect(result.outcomes.lin?.success).toBe(true);
    world = v7Clone(result.world);
    frames.push(world);
  }
  await load(page, frames);
  await expect(page.locator('#fixture-environment')).toContainText('Outside');
  await screenshot(page, info, 'isolated-forest-cave-exterior');
  await seek(page, 4);
  await expect(page.locator('#fixture-environment')).toContainText('Inside');
  await screenshot(page, info, 'isolated-forest-cave-interior');
  await page.getByRole('button', { name: 'Geometry' }).click();
  await screenshot(page, info, 'isolated-forest-cave-geometry');
});

test('isolated paid building, experience, death and respawn remain visually distinct from formal evidence', async ({
  page,
}, info) => {
  const registry = v7Registry([...V7_PACKAGES, forestFixturePackage]);
  let world = v7Clone(
    v7Install(forestFixture(), registry, 'isolated-forest-room@1'),
  );
  const a = world.actors[0];
  if (!a) throw new Error('Missing fixture actor');
  a.position = { x: 8, y: 8 };
  a.mastered.push('fixture-build', 'fixture-experience');
  world.stacks.push(
    {
      id: 'wood',
      resource: 'branch',
      quantity: 4,
      owner: a.id,
      position: { ...a.position },
      origin: 'isolated fixture',
    },
    {
      id: 'stone',
      resource: 'stone',
      quantity: 2,
      owner: a.id,
      position: { ...a.position },
      origin: 'isolated fixture',
    },
  );
  const advance = (action: V7Action) => {
    const r = v7Step(
      world,
      { a: action, b: { interface: 'wait', args: {} } },
      registry,
    );
    expect(r.paused).toBeNull();
    expect(r.outcomes.a?.success).toBe(true);
    world = v7Clone(r.world);
  };
  advance({ interface: 'fixture-build', args: {} });
  const frames = [v7Clone(world)],
    room = world.objects[0];
  if (!room) throw new Error('Missing paid building');
  for (let i = 0; i < 3; i++)
    advance({ interface: 'navigate', args: { target: '', x: 8, y: 6 } });
  advance({ interface: 'fixture-experience', args: { target: room.id } });
  frames.push(v7Clone(world));
  const current = world.actors[0];
  if (!current) throw new Error('Missing actor');
  current.vitals.health = 1;
  current.vitals.satiety = 0;
  world.stacks.push({
    id: 'death-possession',
    resource: 'stone',
    quantity: 1,
    owner: 'a',
    position: { ...current.position },
    origin: 'isolated fixture',
  });
  advance({ interface: 'wait', args: {} });
  frames.push(v7Clone(world));
  for (let i = 0; i < 2; i++) {
    const dying = world.actors[0];
    if (!dying) throw new Error('Missing actor');
    dying.vitals.health = 1;
    dying.vitals.satiety = 0;
    advance({ interface: 'wait', args: {} });
  }
  frames.push(v7Clone(world));
  await load(page, frames);
  await screenshot(page, info, 'isolated-forest-built-room');
  await seek(page, 1);
  await expect(page.locator('#fixture-happiness')).toContainText(
    'Experience 4.0',
  );
  await expect(page.locator('#fixture-environment')).toContainText('Inside');
  await screenshot(page, info, 'isolated-forest-experience');
  await seek(page, 2);
  await expect(page.locator('#fixture-state')).toContainText('Lives 2 / 3');
  await expect(page.locator('#fixture-events')).toContainText('respawned');
  await screenshot(page, info, 'isolated-forest-respawn');
  await seek(page, 3);
  await expect(page.locator('#fixture-state')).toContainText('Lives 0 / 3');
  await screenshot(page, info, 'isolated-forest-final-death');
});

test('isolated wildlife attention displays real progress, dated samples and bounded experience', async ({
  page,
}, info) => {
  const registry = v7Registry(V7_PACKAGES);
  let world = v7Clone(
    v7Install(forestFixture(), registry, 'forest-wildlife@1'),
  );
  const observer = world.actors[0];
  const deer = v7Clone(
    initialForestWorld().objects.find((o) => o.data.species === 'deer'),
  );
  if (!observer || !deer) throw new Error('Missing wildlife visual fixture');
  observer.position = { x: 8, y: 8 };
  const other = world.actors[1];
  if (other) other.position = { x: 11, y: 8 };
  deer.id = 'visible-deer';
  deer.spatial.x = 10;
  deer.spatial.y = 8;
  deer.data.homeX = 10;
  deer.data.homeY = 8;
  world.objects.push(deer);
  observer.mastered.push('observe-wildlife');
  const frames = [v7Clone(world)];
  for (let i = 0; i < 2; i++) {
    const result = v7Step(
      world,
      {
        a: { interface: 'observe-wildlife', args: { target: deer.id } },
        b: { interface: 'wait', args: {} },
      },
      registry,
    );
    expect(result.outcomes.a?.success).toBe(true);
    world = v7Clone(result.world);
    frames.push(world);
  }
  await load(page, frames);
  await seek(page, 1);
  await expect(page.locator('#fixture-events')).toContainText('1 / 2');
  await screenshot(page, info, 'isolated-wildlife-attention');
  await seek(page, 2);
  await expect(page.locator('#fixture-happiness')).toContainText(
    'Experience 3.0',
  );
  await expect(page.locator('#fixture-events')).toContainText('Past sighting');
  await screenshot(page, info, 'isolated-wildlife-experience');
});

test('isolated food examination, real sample and monitored relief display uncertainty', async ({
  page,
}, info) => {
  const registry = v7Registry(V7_PACKAGES);
  let world = v7Clone(
    v7Install(forestFixture(), registry, 'food-assessment@1'),
  );
  const actor = world.actors[0];
  if (!actor) throw new Error('Missing assessment fixture actor');
  actor.mastered.push('assess-food');
  world.stacks.push({
    id: 'test-apple',
    resource: 'apple',
    quantity: 2,
    owner: actor.id,
    position: { ...actor.position },
    origin: 'isolated fixture',
    decay: 0,
  });
  const frames = [v7Clone(world)];
  for (let i = 0; i < 5; i++) {
    const result = v7Step(
      world,
      {
        a: {
          interface: 'assess-food',
          args: { target: 'test-apple', mode: 'sample', fraction: 0.2 },
        },
        b: { interface: 'wait', args: {} },
      },
      registry,
    );
    expect(result.outcomes.a?.success).toBe(true);
    world = v7Clone(result.world);
    frames.push(world);
  }
  await load(page, frames);
  await seek(page, 1);
  await expect(page.locator('#fixture-events')).toContainText('reserved');
  await screenshot(page, info, 'isolated-food-examination');
  await seek(page, 3);
  await expect(page.locator('#fixture-events')).toContainText(
    'Consumed a measured 0.2',
  );
  await screenshot(page, info, 'isolated-food-sample');
  await seek(page, 5);
  await expect(page.locator('#fixture-happiness')).toContainText(
    'Experience 1.0',
  );
  await expect(page.locator('#fixture-events')).toContainText(
    'does not establish safety',
  );
  await screenshot(page, info, 'isolated-food-completed');
});

test('isolated requested shelter shows reserved work, actual refuge, expiry and paid maintenance', async ({
  page,
}, info) => {
  const registry = v7Registry(V7_PACKAGES);
  let world = forestFixture();
  world.config = { ...world.config, hunger: 0 };
  world = v7Clone(
    v7Install(
      v7Install(world, registry, 'food-assessment@1'),
      registry,
      'shelter-construction@1',
    ),
  );
  const actor = world.actors[0];
  if (!actor) throw new Error('Missing isolated builder');
  actor.position = { x: 8, y: 8 };
  actor.mastered.push('build-shelter', 'shelter-maintain');
  world.stacks.push(
    ...[
      { resource: 'branch', quantity: 6 },
      { resource: 'dry-grass', quantity: 12 },
    ].map((s, i) => ({
      ...s,
      id: `fixture-material-${String(i)}`,
      owner: actor.id,
      position: { ...actor.position },
      origin: 'isolated shelter visual fixture',
    })),
  );
  const advance = (action: V7Action) => {
    const result = v7Step(
      world,
      { a: action, b: { interface: 'wait', args: {} } },
      registry,
    );
    expect(result.paused).toBeNull();
    expect(result.outcomes.a?.success).toBe(true);
    world = v7Clone(result.world);
  };
  const build: V7Action = {
    interface: 'build-shelter',
    args: { x: 8, y: 6.5, angle: 0 },
  };
  advance(build);
  const frames = [v7Clone(world)];
  for (let i = 1; i < 6; i++) advance(build);
  frames.push(v7Clone(world));
  for (let i = 0; i < 3; i++)
    advance({ interface: 'navigate', args: { target: '', x: 8, y: 6.5 } });
  world.time = 560;
  world.tick = 560;
  const inside = world.actors[0];
  if (!inside) throw new Error('Missing occupant');
  inside.vitals.temperature = 12;
  for (let i = 0; i < 3; i++) advance({ interface: 'rest', args: {} });
  expect(world.actors[0]?.wellbeing.mental).toBe(1);
  frames.push(v7Clone(world));
  for (let i = 0; i < 3; i++)
    advance({ interface: 'navigate', args: { target: '', x: 8, y: 8 } });
  for (let i = 0; i < 160; i++) advance({ interface: 'wait', args: {} });
  frames.push(v7Clone(world));
  const target = world.objects.find((o) => o.kind === 'insulating-shelter')?.id;
  if (!target) throw new Error('Missing actual shelter');
  advance({ interface: 'shelter-maintain', args: { target } });
  frames.push(v7Clone(world));
  advance({ interface: 'shelter-maintain', args: { target } });
  frames.push(v7Clone(world));
  await load(page, frames);
  await screenshot(page, info, 'isolated-requested-shelter-construction');
  for (const [index, name] of [
    [1, 'built'],
    [2, 'refuge'],
    [3, 'expired'],
    [4, 'maintenance'],
    [5, 'maintained'],
  ] as const) {
    await seek(page, index);
    await screenshot(page, info, `isolated-requested-shelter-${name}`);
  }
});

test('isolated requested exercise shows paid effort, measured relief and immediate cancellation', async ({
  page,
}, info) => {
  const registry = v7Registry(V7_PACKAGES);
  let world = forestFixture();
  for (const pkg of [
    'food-assessment@1',
    'shelter-construction@1',
    'active-warming@1',
  ])
    world = v7Clone(v7Install(world, registry, pkg));
  world.time = 560;
  world.tick = 560;
  const actor = world.actors[0];
  if (!actor) throw new Error('Missing isolated performer');
  actor.vitals.temperature = 12;
  actor.mastered.push('active-warming');
  const advance = (action: V7Action) => {
    const result = v7Step(
      world,
      { a: action, b: { interface: 'wait', args: {} } },
      registry,
    );
    expect(result.paused).toBeNull();
    world = v7Clone(result.world);
  };
  const action: V7Action = { interface: 'active-warming', args: { rounds: 6 } };
  advance(action);
  const frames = [v7Clone(world)];
  advance(action);
  advance(action);
  expect(world.actors[0]?.wellbeing.mental).toBe(1);
  frames.push(v7Clone(world));
  advance({ interface: 'rest', args: {} });
  expect(world.actors[0]?.extensionState['warming:pending']).toBeUndefined();
  frames.push(v7Clone(world));
  await load(page, frames);
  await screenshot(page, info, 'isolated-requested-exercise-progress');
  await seek(page, 1);
  await screenshot(page, info, 'isolated-requested-exercise-relief');
  await seek(page, 2);
  await screenshot(page, info, 'isolated-requested-exercise-cancelled');
});

test('isolated paid route diagnosis distinguishes a verified corner, real occupancy and unknown terrain', async ({
  page,
}, info) => {
  const registry = v7Registry(V7_PACKAGES);
  let world = forestFixture();
  for (const pkg of [
    'food-assessment@1',
    'forest-perception@1',
    'shelter-construction@1',
    'route-inspection@1',
  ])
    world = v7Clone(v7Install(world, registry, pkg));
  const a = world.actors[0],
    b = world.actors[1];
  if (!a || !b) throw new Error('Missing fixture actors');
  a.position = { x: 16, y: 17.8 };
  b.position = { x: 16, y: 17.3 };
  a.mastered.push('inspect-route');
  world.actors.push({
    ...v7Clone(b),
    id: 'c',
    name: 'c',
    position: { x: 16.6, y: 17.55 },
  });
  const { shelterSpatial } = await import('@self-evolving-world/world-core');
  world.objects.push({
    id: 'room',
    name: 'Isolated actual-size shelter',
    kind: 'insulating-shelter',
    spatial: shelterSpatial(16, 17, 0),
    visual: {
      component: 'enclosure',
      color: '#8b7957',
      accent: '#d5bf81',
      label: 'Shelter',
      state: 'protected',
    },
    data: { remainingService: 160, constructedAt: 0 },
    createdBy: 'a',
    createdAt: 0,
    revision: 'shelter-construction@1',
  });
  v7Remember(world);
  const advance = (action: V7Action) => {
    const result = v7Step(
      world,
      {
        a: action,
        b: { interface: 'wait', args: {} },
        c: { interface: 'wait', args: {} },
      },
      registry,
    );
    expect(result.paused).toBeNull();
    world = v7Clone(result.world);
  };
  advance({
    interface: 'inspect-route',
    args: { target: '', x: 15.45, y: 17.65 },
  });
  expect(
    world.events.find((e) => e.type === 'route-inspection-completed')?.data
      .status,
  ).toBe('reachable');
  const frames = [v7Clone(world)];
  advance({ interface: 'navigate', args: { target: '', x: 15.45, y: 17.65 } });
  advance({ interface: 'navigate', args: { target: '', x: 15.45, y: 17.65 } });
  expect(world.actors[0]?.position).toEqual({ x: 15.45, y: 17.65 });
  frames.push(v7Clone(world));
  const performer = world.actors[0],
    blocker = world.actors[1];
  if (!performer || !blocker) throw new Error('Missing fixture actors');
  performer.position = { x: 16, y: 17 };
  blocker.position = { x: 16, y: 17.6 };
  v7Remember(world);
  advance({ interface: 'inspect-route', args: { target: '', x: 16, y: 18.5 } });
  expect(
    world.events.find((e) => e.type === 'route-inspection-completed')?.data
      .reasonCode,
  ).toBe('occupied-passage');
  frames.push(v7Clone(world));
  advance({ interface: 'inspect-route', args: { target: '', x: 23, y: 2 } });
  expect(
    world.events.find((e) => e.type === 'route-inspection-completed')?.data
      .status,
  ).toBe('unknown');
  frames.push(v7Clone(world));
  await load(page, frames);
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Zoom in' }).click();
  await screenshot(page, info, 'isolated-route-verified-corner');
  for (const [index, name] of [
    [1, 'moved'],
    [2, 'blocked'],
    [3, 'unknown'],
  ] as const) {
    await seek(page, index);
    await screenshot(page, info, `isolated-route-${name}`);
  }
});
