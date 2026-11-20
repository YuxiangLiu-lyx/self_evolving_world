import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Remember,
  v7Step,
} from '../src/index.js';
import type { V7Action, V7World } from '../src/index.js';
import { continuousFixture } from './fixtures/continuous-extension.js';

const registry = continuousRegistry();
const wait: V7Action = { interface: 'wait', args: {} };
const observe: V7Action = {
  interface: 'observe_nature',
  args: { target: 'plant' },
};
function setup() {
  const world = v7Clone(
    v7Install(continuousFixture(), registry, 'nature-observation@1'),
  );
  world.objects.push({
    id: 'plant',
    name: 'Berry shrub',
    kind: 'berry-shrub',
    spatial: {
      x: 2.5,
      y: 2,
      angle: 0,
      shape: { kind: 'circle', radius: 0.35 },
      solid: false,
      interaction: 0.65,
      entrances: [],
    },
    visual: {
      component: 'berry-shrub',
      color: '#427452',
      accent: '#be5166',
      label: 'plant',
      state: 'ready',
    },
    data: { resource: 'berry', stock: 4 },
    revision: 'foundation-v7@1',
    createdAt: 0,
    createdBy: null,
  });
  v7Remember(world);
  return world;
}
const step = (world: V7World, a: V7Action, b = wait) =>
  v7Step(world, { a, b }, registry);
describe('reviewed nature observation extension', () => {
  it('requires individual study and two paid consecutive rounds, preserving stock and avoiding a reward', () => {
    const initial = setup();
    expect(step(initial, observe).outcomes.a?.success).toBe(false);
    const learned = step(initial, {
      interface: 'learn',
      args: { ability: 'observe_nature' },
    }).world;
    expect(learned.actors[0]?.mastered).toContain('observe_nature');
    expect(learned.actors[1]?.mastered).not.toContain('observe_nature');
    const first = step(learned, observe);
    expect(first.outcomes.a?.complete).toBe(false);
    expect(first.world.events.some((e) => e.type === 'nature_observed')).toBe(
      false,
    );
    const second = step(
      JSON.parse(JSON.stringify(first.world)) as V7World,
      observe,
    );
    expect(second.outcomes.a?.complete).toBe(true);
    const event = second.world.events.find((e) => e.type === 'nature_observed');
    expect(event?.data).toMatchObject({
      elapsed: 2,
      startTick: 2,
      endTick: 3,
      observable: { data: { stock: 4 } },
    });
    expect(second.world.actors[0]?.vitals).toMatchObject({
      energy: 38,
      satiety: 74,
    });
    expect(second.world.objects).toEqual(initial.objects);
    expect(second.world.actors[0]?.wellbeing.mental).toBe(0);
    expect(
      second.world.actors[0]?.memory.experiences.some(
        (e) => e.event === event?.id,
      ),
    ).toBe(true);
    expect(second.world.processes).toHaveLength(0);
  });
  it('interrupts on incompatible activity and enforces current target, visibility, reach and energy eligibility', () => {
    const world = setup();
    const actor = world.actors[0];
    if (!actor) throw new Error('Missing fixture actor.');
    actor.mastered.push('observe_nature');
    const first = step(world, observe).world;
    const interrupted = step(first, wait).world;
    expect(
      interrupted.events.some((e) => e.type === 'nature_interrupted'),
    ).toBe(true);
    expect(interrupted.actors[0]?.vitals.energy).toBe(39);
    expect(interrupted.actors[0]?.extensionState).toEqual({});
    expect(step(interrupted, observe).outcomes.a?.complete).toBe(false);
    const missing = v7Clone(first);
    missing.objects = [];
    expect(step(missing, observe).outcomes.a?.success).toBe(false);
    actor.position = { x: 12, y: 12 };
    expect(step(world, observe).outcomes.a?.success).toBe(false);
    actor.position = { x: 2, y: 2 };
    actor.vitals.energy = 1;
    expect(step(world, observe).outcomes.a?.success).toBe(false);
    actor.vitals.energy = 40;
    actor.vitals.satiety = 3;
    expect(step(world, observe).outcomes.a?.success).toBe(false);
  });
});
