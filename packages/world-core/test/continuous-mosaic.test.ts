import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
} from '../src/index.js';
import type { V7Action, V7World } from '../src/index.js';
import { continuousFixture } from './fixtures/continuous-extension.js';
const registry = continuousRegistry();
const wait: V7Action = { interface: 'wait', args: {} };
const arrange: V7Action = {
  interface: 'arrange_stone_mosaic',
  args: {
    x: 2.5,
    y: 2,
    offsets: [
      { dx: -0.2, dy: 0 },
      { dx: 0.2, dy: 0 },
    ],
  },
};
const step = (world: V7World, a: V7Action, b = wait) =>
  v7Step(world, { a, b }, registry);
function setup() {
  const world = v7Clone(
    v7Install(continuousFixture(), registry, 'stone-mosaic@1'),
  );
  world.stacks.push({
    id: 'stones',
    resource: 'stone',
    quantity: 4,
    owner: 'a',
    origin: 'actual-rock',
    position: { x: 2, y: 2 },
  });
  return world;
}
function learned() {
  const started = step(setup(), {
    interface: 'learn',
    args: { ability: 'arrange_stone_mosaic' },
  });
  expect(started.world.actors[0]?.learning?.remaining).toBe(1);
  return step(started.world, wait).world;
}
describe('stone mosaic material lifecycle', () => {
  it('studies, escrows conserved stone, completes three paid rounds and permits only paid creator dismantling', () => {
    expect(step(setup(), arrange).outcomes.a?.success).toBe(false);
    let world = learned();
    const first = step(world, arrange);
    expect(first.outcomes.a?.success).toBe(true);
    expect(first.outcomes.a?.complete).toBe(false);
    expect(first.world.stacks[0]?.quantity).toBe(2);
    expect(first.world.objects[0]?.data.contents).toEqual([
      { quantity: 2, origin: 'actual-rock', source: 'stones' },
    ]);
    world = step(
      JSON.parse(JSON.stringify(first.world)) as V7World,
      arrange,
    ).world;
    const final = step(world, arrange);
    expect(final.outcomes.a?.complete).toBe(true);
    expect(final.world.actors[0]?.vitals.energy).toBe(34);
    expect(final.world.objects[0]?.kind).toBe('stone-mosaic');
    expect(final.world.objects[0]?.spatial).toMatchObject({
      solid: false,
      reserved: true,
    });
    expect(
      final.world.events.filter((e) => e.type === 'mosaic_completed'),
    ).toHaveLength(1);
    expect(final.world.actors[0]?.wellbeing.mental).toBe(0);
    const id = final.world.objects[0]?.id;
    const pickup: V7Action = {
      interface: 'pickup',
      args: { target: id ?? '', quantity: 2 },
    };
    const intruder = v7Clone(final.world);
    const other = intruder.actors[1];
    if (!other) throw new Error('Missing actor.');
    other.position = { x: 3, y: 2 };
    expect(step(intruder, wait, pickup).outcomes.b?.success).toBe(false);
    const reclaimed = step(final.world, pickup);
    expect(reclaimed.outcomes.a?.success).toBe(true);
    expect(reclaimed.world.objects).toHaveLength(0);
    expect(reclaimed.world.stacks.reduce((n, s) => n + s.quantity, 0)).toBe(4);
    expect(reclaimed.world.actors[0]?.vitals.energy).toBeLessThan(34);
    expect(
      reclaimed.world.stacks.every((s) => s.origin === 'actual-rock'),
    ).toBe(true);
    expect(step(reclaimed.world, arrange).outcomes.a?.success).toBe(true);
  });
  it('returns escrow on interrupted work and rejects simultaneous overlapping reservations without consuming stock', () => {
    const first = step(learned(), arrange).world;
    const cancelled = step(first, wait).world;
    expect(cancelled.objects).toHaveLength(0);
    expect(cancelled.stacks.reduce((n, s) => n + s.quantity, 0)).toBe(4);
    expect(cancelled.actors[0]?.vitals.energy).toBe(38);
    expect(cancelled.events.some((e) => e.type === 'mosaic_cancelled')).toBe(
      true,
    );
    const world = v7Clone(learned()),
      other = world.actors[1];
    if (!other) throw new Error('Missing actor.');
    other.position = { x: 3.2, y: 2 };
    other.mastered.push('arrange_stone_mosaic');
    world.stacks.push({
      id: 'other-stones',
      resource: 'stone',
      quantity: 2,
      owner: 'b',
      origin: 'other-rock',
      position: other.position,
    });
    const conflict = step(world, arrange, {
      ...arrange,
      args: { ...arrange.args, x: 2.7 },
    });
    expect(conflict.outcomes.a?.success).toBe(false);
    expect(conflict.outcomes.b?.success).toBe(false);
    expect(conflict.world.objects).toHaveLength(0);
    expect(conflict.world.stacks).toEqual(world.stacks);
  });
});
