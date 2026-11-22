import {
  v7Clone,
  v7Install,
  continuousRegistry,
  v7Step,
  v7Json,
  rootWater,
  rootProcessing,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import { initialCollectiveWorld } from '../../src/collective-scenario.js';
/** Authored mechanism fixture only; never used by a formal scenario or model context. */
export function rootFixture() {
  let w = v7Clone(initialCollectiveWorld('collective-ex12', 'B'));
  w.actors = w.actors.slice(0, 2);
  w.objects = [];
  w.stacks = [];
  w.processes = [];
  w.terrain = w.terrain.map((row) => '.'.repeat(row.length));
  w.actors.forEach((a, i) => {
    a.position = { x: 10 + i * 3, y: 10 };
    a.vitals.energy = 40;
  });
  w.state['collective:groups'] = v7Json([
    {
      id: 'ash',
      name: 'Ash',
      species: 'human',
      members: w.actors.map((a) => a.id),
      meeting: { x: 9, y: 10 },
    },
  ]);
  for (const key of [
    'root-food-matrix@1',
    'root-preparation@1',
    'root-air-drying@1',
  ])
    w = v7Clone(v7Install(w, continuousRegistry(w), key));
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture actor.');
  a.mastered.push('root-preparation', 'root-air-drying');
  a.collective?.knownAbilities.push('root-preparation', 'root-air-drying');
  for (const [resource, quantity] of [
    ['root', 6],
    ['stone', 3],
    ['bark', 3],
  ] as const)
    w.stacks.push({
      id: 'fixture-' + resource,
      resource,
      quantity,
      owner: a.id,
      position: { ...a.position },
      origin: 'isolated-fixture',
      harvestedAt: 0,
      decay: resource === 'root' ? 10 : 0,
    });
  return w;
}
export function rootStep(
  w: V7World,
  action: V7Action,
  actor = w.actors[0]?.id ?? 'ash-1',
) {
  const r = v7Step(
    w,
    Object.fromEntries(
      w.actors.map((a) => [
        a.id,
        a.id === actor ? action : { interface: 'wait', args: {} },
      ]),
    ),
    continuousRegistry(w),
  );
  if (r.paused) throw new Error(r.paused);
  return { ...r, world: v7Clone(r.world) };
}
export const crush: V7Action = {
  interface: 'root-preparation',
  args: {
    operation: 'prepare',
    inputStackId: 'item:fixture-root',
    quantity: 1,
    stoneId: 'item:fixture-stone',
    barkId: 'item:fixture-bark',
    x: 10.7,
    y: 10,
  },
};
export const trayBuild: V7Action = {
  interface: 'root-air-drying',
  args: {
    operation: 'build',
    stoneIds: ['item:fixture-stone'],
    barkId: 'item:fixture-bark',
    x: 10.7,
    y: 10,
  },
};
export function rootFrames() {
  const initial = rootFixture(),
    partial = rootStep(initial, crush).world,
    prepared = rootStep(partial, {
      interface: 'root-preparation',
      args: { operation: 'continue' },
    }).world;
  let tray = rootStep(rootFixture(), trayBuild).world;
  tray = rootStep(tray, {
    interface: 'root-air-drying',
    args: { operation: 'continue' },
  }).world;
  const id = tray.objects.find((o) => o.kind === 'root-drying-tray')?.id;
  if (!id) throw new Error('Missing fixture tray.');
  let loaded = rootStep(tray, {
    interface: 'root-air-drying',
    args: {
      operation: 'load',
      trayId: 'object:' + id,
      inputStackId: 'item:fixture-root',
      quantity: 1,
    },
  }).world;
  loaded = rootStep(loaded, {
    interface: 'root-air-drying',
    args: { operation: 'continue' },
  }).world;
  const dry = v7Clone(loaded),
    s = dry.stacks.find((s) => s.resource === 'crushed-root');
  if (!s) throw new Error('Missing fixture food.');
  // Isolated weather fixture: choose actual deterministic dry-season ticks, never alter a formal run.
  for (let t = 40; t < 100; t++) {
    dry.tick = t;
    dry.time = t;
    dry.events = [];
    rootWater(dry, s);
    if (rootProcessing(dry, s)?.dry) break;
  }
  const wet = v7Clone(dry);
  wet.events = [];
  wet.tick = 160;
  wet.time = 160;
  const sample = wet.stacks.find((s) => s.resource === 'crushed-root');
  if (!sample) throw new Error('Missing sample.');
  rootWater(wet, sample);
  return { initial, partial, prepared, tray, loaded, dry, wet };
}
