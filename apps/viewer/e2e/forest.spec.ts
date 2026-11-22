import type { V7ReplaySegment } from '../../../scripts/continuous-store.js';
import { recuperationFrames } from '../../simulator/test/fixtures/recuperation.js';
import { canopyFrames } from '../../simulator/test/fixtures/canopy.js';
import {
  willowFixture,
  willowStudy,
  willowOperation,
} from '../../simulator/test/fixtures/willow.js';
import { fireOperation } from '../../simulator/test/fixtures/local-fire.js';
import {
  fireSetup,
  fireWait,
  fireRegistry,
} from '../../simulator/test/fixtures/local-fire.js';
import { initialForestExperienceWorld } from '../../simulator/src/forest-experience-scenario.js';
import { test, expect } from './validators.js';
import type { Page, TestInfo } from '@playwright/test';
import {
  v7Clone,
  v7Install,
  v7Registry,
  V7_PACKAGES,
  v7Step,
  v7Remember,
  v7Wellbeing,
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

test('isolated dietary experience and neutral sustained mood remain separate from physical wellbeing', async ({
  page,
}, info) => {
  const world = v7Clone(initialForestExperienceWorld());
  const actor = world.actors[0];
  if (!actor) throw new Error('Missing isolated actor');
  actor.vitals.satiety = 35;
  v7Wellbeing(world);
  world.stacks.push({
    id: 'isolated-meal',
    resource: 'root',
    quantity: 1,
    owner: actor.id,
    position: { ...actor.position },
    origin: 'isolated-fixture',
    decay: 0,
  });
  const result = v7Step(
    world,
    {
      lin: {
        interface: 'eat',
        args: { target: 'item:isolated-meal', quantity: 1 },
      },
      moss: { interface: 'wait', args: {} },
      sol: { interface: 'wait', args: {} },
    },
    v7Registry(V7_PACKAGES),
  );
  expect(result.outcomes.lin?.success).toBe(true);
  await load(page, [world, result.world]);
  await expect(page.locator('#fixture-happiness')).toContainText(
    'Sustained mood 0.00',
  );
  await screenshot(page, info, 'isolated-experience-neutral');
  await seek(page, 1);
  await expect(page.locator('#fixture-happiness')).toContainText(
    'Meal pleasure 0.80',
  );
  await expect(page.locator('#fixture-events')).toContainText(
    'meal-experience',
  );
  await screenshot(page, info, 'isolated-experience-real-meal');
});

test('isolated portable insulation shows actual paid work, worn condition and the same dropped item', async ({
  page,
}, info) => {
  const registry = v7Registry(V7_PACKAGES);
  let w = v7Clone(
    v7Install(
      initialForestExperienceWorld(),
      registry,
      'portable-insulation@1',
    ),
  );
  w.objects = [];
  w.processes = [];
  w.terrain = w.terrain.map((r) => '.'.repeat(r.length));
  w.tick = 600;
  w.time = 600;
  w.actors.forEach((a, i) => {
    a.position = { x: 10 + 2 * i, y: 10 };
    a.vitals.temperature = 10;
    a.vitals.satiety = 90;
  });
  w.stacks = ['bark', 'vine'].map((resource, i) => ({
    id: 'isolated-' + resource,
    resource,
    quantity: i ? 2 : 4,
    owner: 'lin',
    position: { x: 10, y: 10 },
    origin: 'isolated-input',
  }));
  const wait: V7Action = { interface: 'wait', args: {} };
  const execute = (action: V7Action) => {
    const r = v7Step(w, { lin: action, moss: wait, sol: wait }, registry);
    expect(r.outcomes.lin?.success).toBe(true);
    w = v7Clone(r.world);
  };
  for (let i = 0; i < 4; i++)
    execute(
      i
        ? wait
        : { interface: 'learn', args: { ability: 'portable-insulation' } },
    );
  execute({ interface: 'portable-insulation', args: { mode: 'craft' } });
  const frames = [v7Clone(w)];
  for (let i = 1; i < 5; i++)
    execute({ interface: 'portable-insulation', args: { mode: 'craft' } });
  const item = w.stacks.find((s) => s.mantle);
  if (!item?.mantle) throw new Error('Missing actual manufactured item');
  // Explicit isolated rendering boundary: show worn/wet condition without implying formal behavior.
  item.mantle.condition = 12;
  item.mantle.moisture = 1;
  execute({
    interface: 'portable-insulation',
    args: { mode: 'equip', target: item.id },
  });
  frames.push(v7Clone(w));
  execute({ interface: 'drop', args: { target: item.id, quantity: 1 } });
  expect(w.stacks.find((s) => s.id === item.id)?.owner).toBeNull();
  frames.push(v7Clone(w));
  await load(page, frames);
  await expect(page.locator('#fixture-events')).toContainText('4 remaining');
  await screenshot(page, info, 'isolated-insulation-paid-work');
  await seek(page, 1);
  await expect(page.locator('#fixture-state')).toContainText(
    'worn, condition 11',
  );
  await expect(page.locator('#fixture-events')).toContainText(
    'remaining; net temperature',
  );
  await screenshot(page, info, 'isolated-insulation-wet-worn');
  await seek(page, 2);
  await expect(page.locator('#fixture-events')).toContainText(
    'Transferred the same persistent mantle',
  );
  await screenshot(page, info, 'isolated-insulation-ground-identity');
});

test('isolated local fire renders paid construction, real flames and exhausted finite fuel', async ({
  page,
}, info) => {
  const fixture = fireSetup();
  const work = fixture.frames.find((w) =>
    w.objects.some((o) => o.kind === 'hearth-work'),
  );
  if (!work) throw new Error('Missing paid construction frame');
  let w = v7Clone(fixture.world);
  w = v7Clone(
    v7Step(w, { lin: fireWait, moss: fireWait, sol: fireWait }, fireRegistry)
      .world,
  );
  const burning = v7Clone(w);
  for (let i = 0; i < 40; i++)
    w = v7Clone(
      v7Step(w, { lin: fireWait, moss: fireWait, sol: fireWait }, fireRegistry)
        .world,
    );
  await load(page, [work, burning, w]);
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('#fixture-events')).toContainText(
    'fire-work-progress',
  );
  await screenshot(page, info, 'isolated-fire-paid-construction');
  await seek(page, 1);
  await expect(page.locator('#fixture-events')).toContainText('fire-burned');
  await page.waitForTimeout(150);
  await screenshot(page, info, 'isolated-fire-finite-combustion');
  await seek(page, 2);
  await page.waitForTimeout(150);
  await screenshot(page, info, 'isolated-fire-exhausted-ash');
});

test('isolated willow processing shows paid work, finite stock and actual material provenance', async ({
  page,
}, info) => {
  let w = willowStudy(willowFixture());
  const strip = willowOperation(w, 'strip', 'isolated-willow');
  expect(strip.outcomes.every((o) => o?.success)).toBe(true);
  w = strip.world;
  const bast = w.stacks.find((s) => s.resource === 'willow-bast');
  if (!bast) throw new Error('Missing real bast');
  const twist = willowOperation(w, 'twist', bast.id);
  expect(twist.outcomes.every((o) => o?.success)).toBe(true);
  w = twist.world;
  const cord = w.stacks.find((s) => s.resource === 'bast-cord');
  if (!cord) throw new Error('Missing real cord');
  w = fireOperation(w, {
    interface: 'drop',
    args: { target: cord.id, quantity: 1 },
  }).world;
  const first = strip.frames[0],
    turning = twist.frames[0];
  if (!first || !turning) throw new Error('Missing paid frames');
  await load(page, [first, strip.world, turning, w]);
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('#fixture-events')).toContainText('3 remaining');
  await screenshot(page, info, 'isolated-willow-paid-strip');
  await seek(page, 1);
  await expect(page.locator('#fixture-state')).toContainText(
    'willow-bark from isolated-willow',
  );
  await expect(page.locator('#fixture-state')).toContainText('stock 2');
  await screenshot(page, info, 'isolated-willow-separated-materials');
  await seek(page, 2);
  await screenshot(page, info, 'isolated-willow-paid-twist');
  await seek(page, 3);
  await expect(page.locator('#fixture-events')).toContainText('dropped');
  await screenshot(page, info, 'isolated-willow-manufactured-cord');
});

test('isolated canopy exposes paid construction, open coverage, actual drying and expired posts', async ({
  page,
}, info) => {
  const f = canopyFrames(),
    first = f.built.frames[0];
  if (!first) throw new Error('Missing paid canopy frame');
  let expired = v7Clone(f.covered);
  const roof = expired.objects.find((o) => o.kind === 'rain-canopy');
  if (!roof) throw new Error('Missing real roof');
  roof.data.condition = 0.001;
  expired = v7Clone(
    v7Step(
      expired,
      { lin: fireWait, moss: fireWait, sol: fireWait },
      fireRegistry,
    ).world,
  );
  await load(page, [first, f.built.world, f.covered, expired]);
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('#fixture-events')).toContainText('5 remaining');
  await screenshot(page, info, 'isolated-canopy-paid-work');
  await seek(page, 1);
  await screenshot(page, info, 'isolated-canopy-open-posts');
  await seek(page, 2);
  await expect(page.locator('#fixture-events')).toContainText(
    'Covered mantle moisture',
  );
  await screenshot(page, info, 'isolated-canopy-actual-drying');
  await seek(page, 3);
  await screenshot(page, info, 'isolated-canopy-expired-cover');
});

test('isolated recuperation shows paid stationary progress, qualified relief and real cancellation without invented furniture', async ({
  page,
}, info) => {
  const r = recuperationFrames();
  const completed = v7Clone(r.world);
  const cancelled = v7Step(
    r.frames[1] ?? completed,
    { lin: fireWait, moss: fireWait, sol: fireWait },
    fireRegistry,
  ).world;
  await load(page, [
    r.frames[0] ?? completed,
    r.frames[3] ?? completed,
    completed,
    cancelled,
  ]);
  await expect(page.locator('#fixture-state')).toContainText(
    'healed 0.25 health',
  );
  await expect(page.locator('#fixture-events')).toContainText('5 remaining');
  await screenshot(page, info, 'isolated-recuperation-paid-progress');
  await seek(page, 1);
  await expect(page.locator('#fixture-events')).toContainText(
    'recuperation-relief-qualified',
  );
  await screenshot(page, info, 'isolated-recuperation-actual-relief');
  await seek(page, 2);
  await expect(page.locator('#fixture-events')).toContainText(
    'recuperation-completed',
  );
  await screenshot(page, info, 'isolated-recuperation-completed');
  await seek(page, 3);
  await expect(page.locator('#fixture-events')).toContainText(
    'recuperation-cancelled',
  );
  await screenshot(page, info, 'isolated-recuperation-cancelled');
});

test('fresh development scenes show local hazards, seedlings, injured animals and persistent work', async ({
  page,
}, info) => {
  const { initialOpenWorld } =
    await import('../../simulator/src/open-scenario.js');
  const base = v7Clone(initialOpenWorld());
  const a = base.actors[0];
  if (!a) throw new Error('Missing observer');
  a.position = { x: 9, y: 10 };
  const drought = v7Clone(base);
  drought.tick = 300;
  drought.time = 300;
  const seedling = drought.objects.find((o) => o.data.resource === 'berry');
  if (seedling) {
    seedling.data.stage = 'seedling';
    seedling.data.stock = 0;
    seedling.visual.state = 'seedling';
  }
  const animal = drought.objects.find((o) => o.data.species === 'deer');
  if (animal) {
    animal.spatial.x = 10;
    animal.spatial.y = 9;
    animal.data.health = 55;
    animal.data.mode = 'fleeing';
  }
  const wet = v7Clone(base);
  wet.tick = 560;
  wet.time = 560;
  const observer = wet.actors[0];
  if (observer) observer.position = { x: 22, y: 22 };
  const station = wet.objects.find((o) => o.data.resource === 'tuber');
  if (station) {
    station.spatial.x = 22.8;
    station.spatial.y = 22;
    station.spatial.solid = false;
    station.data.progress = 0.5;
    station.visual.state = 'working';
    wet.processes.push({
      id: 'visual-fixture-process',
      handler: 'open.process',
      owner: 'lin',
      object: station.id,
      next: 561,
      revision: 'foundation-open@1',
      data: { progress: 3, status: 'conditions unmet' },
    });
  }
  await load(page, [base, drought, wet]);
  await seek(page, 1);
  await screenshot(page, info, 'fresh-local-drought-and-life');
  await seek(page, 2);
  await screenshot(page, info, 'fresh-waterlogging-and-persistent-work');
});

test('isolated internal food examination shows paid stages and retained uncertainty without a safety badge', async ({
  page,
}, info) => {
  const { examinationFrames } =
    await import('../../simulator/test/fixtures/open-food-examination.js');
  await load(page, examinationFrames());
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Zoom in' }).click();
  await seek(page, 1);
  await expect(page.locator('#fixture-events')).toContainText(
    'food-sample-opened',
  );
  await expect(page.locator('#fixture-state')).toContainText(
    'do not establish safety',
  );
  await screenshot(page, info, 'isolated-food-examination-opened');
  await seek(page, 2);
  await expect(page.locator('#fixture-events')).toContainText(
    'food-examination-completed',
  );
  await expect(page.locator('#fixture-state')).toContainText('integrity');
  await screenshot(page, info, 'isolated-food-examination-completed');
});

test('isolated assay apparatus and drying show real construction, readings and uncertainty', async ({
  page,
}, info) => {
  const { assayEquipmentFrames, assayMeasurement, assayStep } =
    await import('../../simulator/test/fixtures/open-food-assay.js');
  const built = assayEquipmentFrames();
  let w = built.at(-1);
  if (!w) throw new Error('Missing actual apparatus');
  const frames = [built[2] ?? w, built[9] ?? w, w];
  const action = assayMeasurement(w);
  const a = w.actors[0];
  if (a) a.vitals.satiety = 100;
  for (let i = 0; i < 120; i++) {
    const r = assayStep(w, action);
    expect(r.outcomes.lin?.success).toBe(true);
    w = v7Clone(r.world);
    if (w.events.some((e) => e.type === 'assay-reading')) frames.push(w);
    if (r.outcomes.lin?.complete) break;
  }
  expect(w.events.some((e) => e.type === 'food-assay-completed')).toBe(true);
  frames.push(w);
  await load(page, frames);
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Zoom in' }).click();
  await seek(page, 1);
  await expect(page.locator('#fixture-state')).toContainText('calibrated');
  await screenshot(page, info, 'isolated-assay-calibrated-balance');
  await seek(page, 3);
  await expect(page.locator('#fixture-events')).toContainText('assay-reading');
  await screenshot(page, info, 'isolated-assay-real-relative-reading');
  await seek(page, frames.length - 1);
  await expect(page.locator('#fixture-events')).toContainText(
    'food-assay-completed',
  );
  await screenshot(page, info, 'isolated-assay-retained-residue');
});

test('isolated bark inspection distinguishes unknown composition from paid conserved extraction', async ({
  page,
}, info) => {
  const { barkFrames } =
    await import('../../simulator/test/fixtures/open-bark.js');
  await load(page, barkFrames());
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('#fixture-events')).toContainText('unresolved');
  await screenshot(page, info, 'isolated-bark-unresolved');
  await seek(page, 2);
  await expect(page.locator('#fixture-events')).toContainText(
    'bark-strip-progress',
  );
  await expect(page.locator('#fixture-state')).toContainText('bark-fragments');
  await screenshot(page, info, 'isolated-bark-partial-layer');
  await seek(page, 3);
  await expect(page.locator('#fixture-events')).toContainText('bark-stripped');
  await expect(page.locator('#fixture-state')).toContainText('0.4 bark');
  await screenshot(page, info, 'isolated-bark-conserved-sheets');
});

test('isolated woven apparatus shows paid partial components, calibrated baskets and conserved escaped sample', async ({
  page,
}, info) => {
  const { wovenFrames, conditionedWoven, wovenStep } =
    await import('../../simulator/test/fixtures/open-woven.js');
  const { assayAction } =
    await import('../../simulator/test/fixtures/open-food-assay.js');
  const built = wovenFrames();
  let w = conditionedWoven();
  const b = w.objects.find((o) => o.kind === 'comparison-balance'),
    weight = w.stacks.find((s) => s.processing?.comparisonWeight);
  if (!b || !weight) throw new Error('Missing fixture equipment');
  const action = assayAction('dry-mass', 'sample', b.id, [weight.id], 1);
  w = v7Clone(wovenStep(w, action).world);
  const mesh = w.objects.find((o) => o.kind === 'drying-tray');
  if (!mesh) throw new Error('Missing fixture mesh');
  mesh.data.aperture = 1;
  w = v7Clone(wovenStep(w, action).world);
  const partial = built[5],
    ready = built.at(-1);
  if (!partial || !ready) throw new Error('Missing paid fixtures');
  await load(page, [partial, ready, w]);
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.locator('#fixture-events')).toContainText(
    'woven-support-progress',
  );
  await screenshot(page, info, 'isolated-woven-partial-components');
  await seek(page, 1);
  await expect(page.locator('#fixture-events')).toContainText(
    'woven-support-completed',
  );
  await screenshot(page, info, 'isolated-woven-calibrated-baskets');
  await seek(page, 2);
  await expect(page.locator('#fixture-events')).toContainText(
    'assay-invalidated',
  );
  await screenshot(page, info, 'isolated-woven-escaped-sample');
});

test('isolated scratch comparison shows paid contacts and unresolved absolute hardness', async ({
  page,
}, info) => {
  const { hardnessFrames } =
    await import('../../simulator/test/fixtures/open-hardness.js');
  await load(page, hardnessFrames());
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Zoom in' }).click();
  await seek(page, 1);
  await expect(page.locator('#fixture-events')).toContainText(
    'hardness-test-progress',
  );
  await screenshot(page, info, 'isolated-hardness-paid-contact');
  await seek(page, 2);
  await expect(page.locator('#fixture-events')).toContainText(
    'hardness-comparison-completed',
  );
  await screenshot(page, info, 'isolated-hardness-relative-result');
  await seek(page, 3);
  await expect(page.locator('#fixture-events')).toContainText(
    'absolute hardness remains unresolved',
  );
  await screenshot(page, info, 'isolated-hardness-unresolved-threshold');
});

test('isolated contact sweep distinguishes achieved contacts from unresolved absolute calibration', async ({
  page,
}, info) => {
  const { contactFrames } =
    await import('../../simulator/test/fixtures/open-contact.js');
  await load(page, contactFrames());
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Zoom in' }).click();
  await seek(page, 2);
  await expect(page.locator('#fixture-events')).toContainText(
    'contact-calibration-progress',
  );
  await screenshot(page, info, 'isolated-contact-response-sweep');
  await seek(page, 5);
  await expect(page.locator('#fixture-events')).toContainText(
    'paid assessment remains',
  );
  await screenshot(page, info, 'isolated-contact-assessment-pending');
  await seek(page, 6);
  await expect(page.locator('#fixture-events')).toContainText(
    'Absolute bounds remain unresolved',
  );
  await screenshot(page, info, 'isolated-contact-unresolved-bounds');
});

test('isolated shade construction shows installed poles, actual porous roof and beneficial occupied rest', async ({
  page,
}, info) => {
  const { refugeFrames, refugeStep } =
    await import('../../simulator/test/fixtures/open-shelter.js');
  const frames = refugeFrames(),
    last = frames.at(-1);
  if (!last) throw new Error('Missing fixture frame');
  const occupied = v7Clone(last),
    a = occupied.actors[0];
  if (!a) throw new Error('Missing fixture actor');
  a.vitals.temperature = 32;
  a.vitals.energy = 10;
  occupied.time = 180;
  occupied.tick = 180;
  frames.push(
    v7Clone(refugeStep(occupied, { interface: 'rest', args: {} }).world),
  );
  await load(page, frames);
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Zoom in' }).click();
  await seek(page, 0);
  await expect(page.locator('#fixture-events')).toContainText(
    'shelter-progress',
  );
  await screenshot(page, info, 'isolated-shade-installed-poles');
  await seek(page, 9);
  await expect(page.locator('#fixture-events')).toContainText(
    'shelter-completed',
  );
  await screenshot(page, info, 'isolated-shade-proven-roof');
  await seek(page, 10);
  await expect(page.locator('#fixture-events')).toContainText(
    'shelter-rest-experience',
  );
  await screenshot(page, info, 'isolated-shade-occupied-relief');
});

test('isolated shelter diagnostics distinguish unresolved identity, unknown geometry and measured specimens', async ({
  page,
}, info) => {
  const { diagnosticFrames } =
    await import('../../simulator/test/fixtures/open-shelter-diagnostics.js');
  await load(page, diagnosticFrames());
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Zoom in' }).click();
  await seek(page, 0);
  await expect(page.locator('#fixture-diagnostic')).toContainText(
    'malformed-reference',
  );
  await screenshot(page, info, 'isolated-shelter-reference-failure');
  await seek(page, 1);
  await expect(page.locator('#fixture-diagnostic')).toContainText(
    'item-112-moss-648',
  );
  await expect(page.locator('#fixture-diagnostic')).toContainText(
    'geometry-unavailable',
  );
  await screenshot(page, info, 'isolated-shelter-unknown-dimensions');
  await seek(page, 4);
  await expect(page.locator('#fixture-diagnostic')).toContainText('resolved');
  await expect(page.locator('#fixture-events')).toContainText(
    'measured existing geometry',
  );
  await screenshot(page, info, 'isolated-shelter-measured-identity');
});

test('isolated metrology distinguishes physical model shape, measured intervals and actual loaded specimen', async ({
  page,
}, info) => {
  const { metrologyFrames } =
    await import('../../simulator/test/fixtures/open-metrology.js');
  await load(page, metrologyFrames());
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: 'Zoom in' }).click();
  await seek(page, 1);
  await expect(page.locator('#fixture-state')).toContainText(
    'not yet measured',
  );
  await screenshot(page, info, 'isolated-metrology-model-shape');
  await seek(page, 2);
  await expect(page.locator('#fixture-events')).toContainText(
    'metrology-measured',
  );
  await screenshot(page, info, 'isolated-metrology-measured-intervals');
  await seek(page, 4);
  await expect(page.locator('#fixture-events')).toContainText(
    'metrology-load-tested',
  );
  await screenshot(page, info, 'isolated-metrology-actual-load');
});

test('retained round-123 replay verifies native migration precision and still rejects an invalid supplementary proof', async ({
  page,
}, info) => {
  // Reproduce a queued animation timestamp preceding a slow synchronous seek.
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      original((time) => {
        callback(time - 500);
      });
  });
  const { readFileSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const { reconstructContinuousSegment, bindRegistrationPrecision } =
    await import('../../../scripts/continuous-store.js');
  const index = JSON.parse(
    readFileSync(
      'experiment/ex10/technical-pauses/round-123/replay.json',
      'utf8',
    ),
  ) as {
    observed: number;
    segments: { path: string; sha256: string }[];
  };
  const sources = new Map<string, string>();
  let guardedPath = '';
  for (const entry of index.segments) {
    const text = readFileSync(`experiment/ex10/${entry.path}`, 'utf8');
    const segment = JSON.parse(text) as V7ReplaySegment;
    const frames = reconstructContinuousSegment(segment);
    segment.rounds = segment.rounds.map((r, i) => {
      const before = frames[i];
      if (!before) throw new Error('Missing actual replay prefix');
      return bindRegistrationPrecision(before, r);
    });
    const source = JSON.stringify(segment);
    entry.sha256 = createHash('sha256').update(source).digest('hex');
    sources.set(entry.path, source);
    if (segment.rounds.some((r) => r.registrationPrecisionHash))
      guardedPath = entry.path;
  }
  await page.route('**/experiments/index.json', (r) =>
    r.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        version: 1,
        experiments: [{ id: 'ex10', steps: 123 }],
      }),
    }),
  );
  await page.route('**/experiments/ex10/**', (r) => {
    const path = new URL(r.request().url()).pathname.split('/ex10/')[1];
    const body =
      path === 'replay.json' ? JSON.stringify(index) : sources.get(path ?? '');
    if (!body) throw new Error('Unexpected replay request');
    return r.fulfill({ contentType: 'application/json', body });
  });
  await page.goto('/observatory.html?experiment=ex10');
  await expect(page.locator('#round')).toHaveText('0 / 123');
  await page.locator('#time').fill('123');
  await expect(page.locator('#round')).toHaveText('123 / 123');
  await expect(page.locator('#status')).not.toHaveClass(/error/);
  await screenshot(page, info, 'retained-ex10-round-123-precision-replay');
  const guarded = sources.get(guardedPath);
  if (!guarded) throw new Error('Missing retained registration');
  const bad = JSON.parse(guarded) as V7ReplaySegment;
  const registration = bad.rounds.find((r) => r.registrationPrecisionHash);
  if (!registration) throw new Error('Missing precision record');
  registration.registrationPrecisionHash = 'invalid';
  const changed = JSON.stringify(bad),
    entry = index.segments.find((p) => p.path === guardedPath);
  if (!entry) throw new Error('Missing indexed part');
  entry.sha256 = createHash('sha256').update(changed).digest('hex');
  sources.set(guardedPath, changed);
  await page.reload();
  await expect(page.locator('#round')).toHaveText('0 / 123');
  await page.locator('#time').fill('123');
  await expect(page.locator('#status')).toHaveText(
    'Invalid registration precision evidence.',
  );
});

test('isolated preservation shows actual tray food, paid preparation, reduced mass and retained removal', async ({
  page,
}, info) => {
  const { preservationFrames } =
    await import('../../simulator/test/fixtures/open-preservation.js');
  await load(page, preservationFrames());
  await page.locator('#fixture-zoom-in').click({ clickCount: 3 });
  await seek(page, 1);
  await expect(page.locator('#fixture-events')).toContainText(
    'preservation-progress',
  );
  await screenshot(page, info, 'isolated-preservation-preparing');
  await seek(page, 3);
  await expect(page.locator('#fixture-events')).toContainText(
    'preservation-completed',
  );
  await screenshot(page, info, 'isolated-preservation-measured-benefit');
  await seek(page, 4);
  await expect(page.locator('#fixture-events')).toContainText(
    'preservation-stopped',
  );
  await screenshot(page, info, 'isolated-preservation-retained-food');
});

test('isolated short refuge shows proposed bounds, paid partial poles, real apertures and bounded proof', async ({
  page,
}, info) => {
  const { shortFrames } =
    await import('../../simulator/test/fixtures/open-short-refuge.js');
  await load(page, shortFrames());
  await page.locator('#fixture-zoom-in').click({ clickCount: 3 });
  await seek(page, 1);
  await expect(page.locator('#fixture-events')).toContainText(
    'short-refuge-assessed',
  );
  await screenshot(page, info, 'isolated-short-refuge-assessment');
  await seek(page, 2);
  await expect(page.locator('#fixture-events')).toContainText(
    'short-refuge-progress',
  );
  await screenshot(page, info, 'isolated-short-refuge-partial');
  await seek(page, 4);
  await expect(page.locator('#fixture-events')).toContainText(
    'short-refuge-trial',
  );
  await screenshot(page, info, 'isolated-short-refuge-proof');
});

test('isolated water access shows finite observed reach, paid forming, actual fill and retained failure deposits', async ({
  page,
}, info) => {
  const { waterFrames } =
    await import('../../simulator/test/fixtures/open-water.js');
  await load(page, waterFrames());
  await page.locator('#fixture-zoom-in').click({ clickCount: 3 });
  await seek(page, 1);
  await expect(page.locator('#fixture-events')).toContainText(
    'water-access-inspected',
  );
  await screenshot(page, info, 'isolated-water-bank-access');
  await seek(page, 2);
  await expect(page.locator('#fixture-events')).toContainText(
    'water-cup-progress',
  );
  await screenshot(page, info, 'isolated-water-paid-forming');
  await seek(page, 3);
  await expect(page.locator('#fixture-events')).toContainText(
    'water-withdrawn',
  );
  await screenshot(page, info, 'isolated-water-finite-filled-cup');
  await seek(page, 4);
  await expect(page.locator('#fixture-events')).toContainText('picked-up');
  await screenshot(page, info, 'isolated-water-carried-cup');
  await seek(page, 5);
  await expect(page.locator('#fixture-events')).toContainText(
    'water-cup-failed',
  );
  await screenshot(page, info, 'isolated-water-retained-collapse');
});
test('isolated trial diagnostics distinguish original failed predicates from missing historical evidence', async ({
  page,
}, info) => {
  const { diagnosticFrames } =
    await import('../../simulator/test/fixtures/open-short-diagnostics.js');
  await load(page, diagnosticFrames());
  await page.locator('#fixture-time').fill('1');
  await page.locator('#fixture-time').dispatchEvent('input');
  await expect(page.locator('#fixture-trial-diagnostic')).toContainText(
    'Original outcome: failed',
  );
  await expect(page.locator('#fixture-trial-diagnostic')).toContainText('0.02');
  await expect(page.locator('#fixture-trial-diagnostic')).toContainText(
    'No new trial',
  );
  await screenshot(page, info, 'isolated-trial-diagnostic-failed-predicate');
  await page.locator('#fixture-time').fill('2');
  await page.locator('#fixture-time').dispatchEvent('input');
  await expect(page.locator('#fixture-trial-diagnostic')).toContainText(
    'Missing historical evidence',
  );
  await expect(page.locator('#fixture-trial-diagnostic')).toContainText(
    'unknown',
  );
  await screenshot(page, info, 'isolated-trial-diagnostic-unknown-history');
});

test('isolated extraction shows actual arm handling, disjoint residue regions and unresolved measurement limits', async ({
  page,
}, info) => {
  const { extractionFrames } =
    await import('../../simulator/test/fixtures/open-extraction.js');
  await load(page, extractionFrames());
  await page.locator('#fixture-zoom-in').click({ clickCount: 2 });
  await seek(page, 1);
  await expect(page.locator('#fixture-extraction')).toContainText(
    'retained mixing',
  );
  await screenshot(page, info, 'isolated-extraction-paid-contact');
  await seek(page, 2);
  await expect(page.locator('#fixture-extraction')).toContainText(
    'actual tray residue',
  );
  await screenshot(page, info, 'isolated-extraction-two-residues');
  await seek(page, 3);
  await expect(page.locator('#fixture-extraction')).toContainText(
    'Not a safety or nutrition certificate',
  );
  await expect(page.locator('#fixture-extraction')).toContainText(
    'residue interval',
  );
  await screenshot(page, info, 'isolated-extraction-inconclusive-reading');
});
