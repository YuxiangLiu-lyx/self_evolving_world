import { describe, expect, it } from 'vitest';
import {
  FOREST_BASE,
  FOREST_WILDLIFE,
  v7Clone,
  v7Install,
  v7Registry,
  v7Step,
  v7Remember,
} from '../src/index.js';
import type { V7Action, V7World } from '../src/index.js';
import { forestFixture } from './fixtures/forest-extension.js';
const registry = v7Registry([FOREST_BASE, FOREST_WILDLIFE]);
const wait: V7Action = { interface: 'wait', args: {} };
const observe: V7Action = {
  interface: 'observe-wildlife',
  args: { target: 'deer' },
};
function actor(w: V7World) {
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture observer');
  return a;
}
function fixture() {
  const w = forestFixture();
  w.objects.push({
    id: 'deer',
    name: 'Fixture deer',
    kind: 'animal',
    spatial: {
      x: 4,
      y: 2,
      angle: 0,
      shape: { kind: 'circle', radius: 0.3 },
      solid: false,
      interaction: 0.65,
      entrances: [],
    },
    visual: {
      component: 'animal',
      color: '#a98765',
      accent: '#bcab98',
      label: 'deer',
      state: 'foraging',
    },
    data: { species: 'deer', mode: 'foraging', homeX: 4, homeY: 2 },
    createdBy: null,
    createdAt: 0,
    revision: 'fixture',
  });
  v7Remember(w);
  return v7Clone(v7Install(w, registry, 'forest-wildlife@1'));
}
function step(w: V7World, action = wait) {
  const result = v7Step(w, { a: action, b: wait }, registry);
  expect(result.paused).toBeNull();
  return v7Clone(result.world);
}
function learned() {
  let w = fixture();
  w = step(w, { interface: 'learn', args: { ability: 'observe-wildlife' } });
  return step(w);
}

describe('real-request wildlife implementation under isolated regression', () => {
  it('requires personal study and two actual visible samples, charges costs and awards bounded nonstacking experience', () => {
    let w = fixture();
    expect(actor(w).wellbeing.mental).toBe(0);
    expect(actor(w).mastered).not.toContain('observe-wildlife');
    w = step(w, { interface: 'learn', args: { ability: 'observe-wildlife' } });
    expect(actor(w).mastered).not.toContain('observe-wildlife');
    w = step(w);
    expect(actor(w).mastered).toContain('observe-wildlife');
    const energy = actor(w).vitals.energy;
    w = step(w, observe);
    expect(actor(w).wellbeing.mental).toBe(0);
    expect(actor(w).extensionState['wildlife:pending']).toMatchObject({
      elapsed: 1,
    });
    w = step(w, observe);
    expect(actor(w).vitals.energy).toBe(energy - 1);
    expect(actor(w).wellbeing.mental).toBe(3);
    expect(actor(w).extensionState['wildlife:sightings']).toHaveLength(2);
    expect(
      w.events.find((e) => e.type === 'wildlife-observation-completed')?.data
        .samples,
    ).toHaveLength(2);
    while (w.tick < 10) w = step(w);
    // Keep the same real target in view for this isolated repetition trial; no formal input is altered.
    const deer = w.objects[0];
    if (!deer) throw new Error('Missing deer');
    deer.spatial.x = 4;
    deer.spatial.y = 2;
    w = step(step(w, observe), observe);
    expect(w.tick).toBe(12);
    expect(actor(w).wellbeing.mental).toBe(3);
    while (w.tick < 17) w = step(w);
    expect(actor(w).wellbeing.mental).toBe(1);
    while (w.tick < 25) w = step(w);
    expect(actor(w).wellbeing.mental).toBe(0);
  });
  it('cancels interruption or lost visibility with retained partial samples and spent energy', () => {
    let w = learned();
    const energy = actor(w).vitals.energy;
    w = step(w, observe);
    w = step(w);
    expect(
      w.events.some((e) => e.type === 'wildlife-observation-cancelled'),
    ).toBe(true);
    expect(actor(w).extensionState['wildlife:pending']).toBeUndefined();
    expect(actor(w).extensionState['wildlife:sightings']).toHaveLength(1);
    expect(actor(w).vitals.energy).toBe(energy - 0.5);
    w = step(w, observe);
    const deer = w.objects[0];
    if (!deer) throw new Error('Missing deer');
    deer.spatial.x = 18;
    w = step(w, observe);
    expect(actor(w).wellbeing.mental).toBe(0);
    expect(actor(w).extensionState['wildlife:pending']).toBeUndefined();
    expect(
      w.events.some((e) => e.type === 'wildlife-observation-cancelled'),
    ).toBe(true);
  });
  it('cancels completion on same-round death and retains skill and past sightings across respawn', () => {
    let w = learned();
    w = step(w, observe);
    actor(w).vitals.health = 1;
    actor(w).vitals.satiety = 0;
    w = step(w, observe);
    expect(actor(w).life?.deaths).toBe(1);
    expect(actor(w).mastered).toContain('observe-wildlife');
    expect(actor(w).extensionState['wildlife:sightings']).toHaveLength(2);
    expect(actor(w).extensionState['wildlife:pending']).toBeUndefined();
    expect(actor(w).wellbeing.mental).toBe(0);
    expect(
      w.events.some((e) => e.type === 'wildlife-observation-cancelled'),
    ).toBe(true);
    expect(w.processes).toHaveLength(0);
  });
});
