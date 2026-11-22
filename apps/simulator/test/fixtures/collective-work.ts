import {
  v7Clone,
  v7Install,
  continuousRegistry,
  v7Step,
  v7Json,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import { initialCollectiveWorld } from '../../src/collective-scenario.js';
/** Isolated deterministic fixture. Never imported by formal scenario or model input code. */
export function workFixture() {
  let w = v7Clone(initialCollectiveWorld('collective-ex11', 'A'));
  w.actors = w.actors.slice(0, 2);
  w.objects = [];
  w.processes = [];
  w.stacks = [];
  w.terrain = w.terrain.map((row) => '.'.repeat(row.length));
  w.actors.forEach((a, i) => {
    a.position = { x: 11.6 + i * 5, y: 10 };
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
  w = v7Install(w, continuousRegistry(w), 'prepare-food@1');
  w = v7Clone(v7Install(w, continuousRegistry(w), 'weather-lean-to@1'));
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture actor.');
  a.mastered.push('prepare-food', 'weather-lean-to');
  a.collective?.knownAbilities.push('prepare-food', 'weather-lean-to');
  for (const [resource, quantity] of [
    ['root', 4],
    ['berry', 4],
    ['branch', 4],
    ['vine', 3],
    ['bark', 8],
  ] as const)
    w.stacks.push({
      id: 'fixture-' + resource,
      resource,
      quantity,
      owner: a.id,
      position: { ...a.position },
      origin: 'isolated-fixture',
      harvestedAt: 0,
      decay: 0,
    });
  return w;
}
export function workStep(
  w: V7World,
  action: V7Action,
  actor = w.actors[0]?.id ?? 'ash-1',
) {
  const result = v7Step(
    w,
    Object.fromEntries(
      w.actors.map((a) => [
        a.id,
        a.id === actor ? action : { interface: 'wait', args: {} },
      ]),
    ),
    continuousRegistry(w),
  );
  if (result.paused) throw new Error(result.paused);
  return { ...result, world: v7Clone(result.world) };
}
export const buildLeanTo: V7Action = {
  interface: 'weather-lean-to',
  args: {
    operation: 'start',
    site: { x: 10, y: 10, angle: 0 },
    materials: [
      { itemId: 'fixture-branch', quantity: 4 },
      { itemId: 'fixture-vine', quantity: 2 },
      { itemId: 'fixture-bark', quantity: 6 },
    ],
  },
};
export function builtFixture() {
  let w = workFixture();
  const frames = [v7Clone(w)];
  for (let i = 0; i < 8; i++) {
    const action =
      i === 0
        ? buildLeanTo
        : { interface: 'weather-lean-to', args: { operation: 'work' } };
    const r = workStep(w, action);
    if (!r.outcomes['ash-1']?.success)
      throw new Error(r.outcomes['ash-1']?.reason);
    w = r.world;
    frames.push(v7Clone(w));
  }
  return { world: w, frames };
}
