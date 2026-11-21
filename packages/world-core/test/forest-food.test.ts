import { describe, expect, it } from 'vitest';
import {
  FOREST_BASE,
  FOREST_FOOD_ASSESSMENT,
  v7Clone,
  v7Install,
  v7Registry,
  v7Step,
  v7Load,
  v7Observe,
  foodTenths,
} from '../src/index.js';
import type { V7Action, V7World } from '../src/index.js';
import { forestFixture } from './fixtures/forest-extension.js';
const registry = v7Registry([FOREST_BASE, FOREST_FOOD_ASSESSMENT]);
const wait: V7Action = { interface: 'wait', args: {} };
const sample: V7Action = {
  interface: 'assess-food',
  args: { target: 'food', mode: 'sample', fraction: 0.2 },
};
function actor(w: V7World) {
  const a = w.actors[0];
  if (!a) throw new Error('Missing testing actor');
  return a;
}
function fixture(resource = 'apple', quantity = 2) {
  const before = forestFixture();
  before.stacks.push({
    id: 'food',
    resource,
    quantity,
    owner: 'a',
    position: { x: 2, y: 2 },
    origin: 'isolated-original-source',
    harvestedAt: 0,
    decay: 0,
  });
  const w = v7Clone(v7Install(before, registry, 'food-assessment@1'));
  expect(w.stacks).toEqual(before.stacks);
  expect(actor(w).mastered).not.toContain('assess-food');
  return w;
}
function step(w: V7World, action = wait) {
  const result = v7Step(w, { a: action, b: wait }, registry);
  expect(result.paused).toBeNull();
  return v7Clone(result.world);
}
function learned(resource = 'apple', quantity = 2) {
  let w = fixture(resource, quantity);
  w = step(w, { interface: 'learn', args: { ability: 'assess-food' } });
  expect(actor(w).mastered).not.toContain('assess-food');
  w = step(step(w));
  expect(actor(w).mastered).toContain('assess-food');
  return w;
}
const quantity = (w: V7World) =>
  w.stacks.reduce((n, s) => n + foodTenths(s.quantity), 0);

describe('real-request food assessment under isolated tests', () => {
  it('pays individual study and five actual rounds, reserves real aging mass, measures nutrition and retains uncertainty without revealing composition', () => {
    let w = learned();
    const effort = actor(w).vitals.energy,
      load = v7Load(w, actor(w));
    for (let i = 1; i <= 5; i++) {
      w = step(w, sample);
      expect(quantity(w)).toBe(i < 3 ? 20 : 18);
      if (i < 3) {
        expect(v7Load(w, actor(w))).toBeCloseTo(load);
        expect(w.stacks.some((s) => s.reservedFor && (s.decay ?? 0) > 0)).toBe(
          true,
        );
      }
      expect(actor(w).wellbeing.mental).toBe(i < 5 ? 0 : 1);
    }
    expect(actor(w).vitals.energy).toBe(effort - 3.5);
    expect(actor(w).memory.discoveries?.apple).toBeUndefined();
    expect(actor(w).extensionState['food-assessment:pending']).toBeUndefined();
    expect(actor(w).extensionState['food-assessment:records']).toMatchObject([
      {
        status: 'completed',
        mode: 'sample',
        fraction: 0.2,
        nourishment: 2,
        adverse: false,
        sensory: {
          nutrition: 'Unknown from appearance or touch.',
          toxicity: 'Unknown from appearance or touch.',
        },
      },
    ]);
    expect(w.actors[1]?.mastered).not.toContain('assess-food');
    expect(new Set(w.stacks.map((s) => s.id)).size).toBe(w.stacks.length);
    expect(
      w.stacks.every((s) => s.quantityTenths === foodTenths(s.quantity)),
    ).toBe(true);
  });
  it('examination alone and harmful exposure earn no relief; measured harm is real and never certifies safety', () => {
    let w = learned('red-fungus');
    const examine: V7Action = {
      interface: 'assess-food',
      args: { target: 'food', mode: 'examine' },
    };
    w = step(step(w, examine), examine);
    expect(quantity(w)).toBe(20);
    expect(actor(w).wellbeing.mental).toBe(0);
    for (let i = 0; i < 5; i++) w = step(w, sample);
    expect(actor(w).vitals.health).toBeCloseTo(95.2);
    expect(actor(w).wellbeing.mental).toBe(0);
    expect(actor(w).extensionState['food-assessment:records']).toMatchObject([
      { mode: 'examine' },
      { mode: 'sample', adverse: true },
    ]);
  });
  it('releases unconsumed escrow once on interruption, never refunds consumed samples, and preserves nonresetting age/provenance', () => {
    let w = learned();
    w = step(w, sample);
    const reserved = w.stacks.find((s) => s.reservedFor);
    if (!reserved) throw new Error('Missing sample');
    const id = reserved.id,
      age = reserved.decay;
    w = step(w, { interface: 'navigate', args: { target: '', x: 2, y: 3 } });
    expect(quantity(w)).toBe(20);
    expect(w.stacks.find((s) => s.id === id)).toMatchObject({
      owner: 'a',
      origin: 'isolated-original-source',
    });
    expect(w.stacks.find((s) => s.id === id)?.reservedFor).toBeUndefined();
    expect(w.stacks.find((s) => s.id === id)?.decay).toBeGreaterThan(age ?? 0);
    w = step(w);
    expect(quantity(w)).toBe(20);
    for (let i = 0; i < 3; i++) w = step(w, sample);
    w = step(w);
    expect(quantity(w)).toBe(18);
    expect(actor(w).wellbeing.mental).toBe(0);
    expect(actor(w).extensionState['food-assessment:records']).toMatchObject([
      { status: 'cancelled', ingested: false },
      { status: 'cancelled', ingested: true },
    ]);
  });
  it('drops fractional possessions on death without duplication and allows real fractional recovery after respawn', () => {
    let w = learned('apple', 1);
    w = step(w, sample);
    actor(w).vitals.health = 1;
    actor(w).vitals.satiety = 0;
    w = step(w);
    expect(actor(w).life?.deaths).toBe(1);
    expect(quantity(w)).toBe(10);
    expect(w.stacks.every((s) => s.owner === null && !s.reservedFor)).toBe(
      true,
    );
    for (const stack of [...w.stacks])
      w = step(w, {
        interface: 'pickup',
        args: { target: stack.id, quantity: stack.quantity },
      });
    expect(quantity(w)).toBe(10);
    expect(w.stacks.every((s) => s.owner === 'a')).toBe(true);
    expect(actor(w).mastered).toContain('assess-food');
    expect(actor(w).extensionState['food-assessment:records']).toMatchObject([
      { status: 'cancelled' },
    ]);
  });
  it('does not return a consumed portion after death or resurrect spoiled escrow', () => {
    let w = learned();
    for (let i = 0; i < 3; i++) w = step(w, sample);
    actor(w).vitals.health = 1;
    actor(w).vitals.satiety = 0;
    w = step(w);
    expect(quantity(w)).toBe(18);
    expect(actor(w).wellbeing.mental).toBe(0);
    w = learned();
    const material = w.stacks[0];
    if (!material) throw new Error('Missing material');
    material.decay = 139.99;
    w = step(w, sample);
    expect(quantity(w)).toBe(0);
    expect(actor(w).extensionState['food-assessment:pending']).toBeUndefined();
    expect(actor(w).extensionState['food-assessment:records']).toMatchObject([
      { status: 'cancelled', ingested: false },
    ]);
  });
  it('preserves reward cooldown across death and never makes reserved material independently spendable', () => {
    let w = learned('apple', 4);
    w = step(w, sample);
    const reserved = w.stacks.find((s) => s.reservedFor);
    if (!reserved) throw new Error('Missing reserved food');
    const before = quantity(w);
    w = step(w, {
      interface: 'drop',
      args: { target: reserved.id, quantity: 0.2 },
    });
    expect(quantity(w)).toBe(before);
    expect(w.events.some((e) => e.type === 'failed')).toBe(true);
    for (let i = 0; i < 5; i++) w = step(w, sample);
    expect(actor(w).wellbeing.mental).toBe(1);
    actor(w).vitals.health = 1;
    actor(w).vitals.satiety = 0;
    w = step(w);
    // Recover the surviving original stack using real pickup after respawn at the same point.
    const original = w.stacks.find((s) => s.id === 'food');
    if (!original) throw new Error('Missing original food');
    w = step(w, {
      interface: 'pickup',
      args: { target: original.id, quantity: original.quantity },
    });
    const owned = w.stacks.find(
      (s) => s.owner === 'a' && s.origin === 'isolated-original-source',
    );
    if (!owned) throw new Error('Missing recovered food');
    for (let i = 0; i < 5; i++)
      w = step(w, { ...sample, args: { ...sample.args, target: owned.id } });
    expect(actor(w).wellbeing.mental).toBe(0);
  });
  it('keeps owned positions current and rejects finer-than-tenth quantities without changing material', () => {
    let w = learned();
    actor(w).position = { x: 8, y: 8 };
    expect(v7Observe(w, 'a').stacks[0]?.position).toEqual({ x: 8, y: 8 });
    w = step(w, {
      interface: 'assess-food',
      args: { target: 'food', mode: 'sample', fraction: 0.15 },
    });
    expect(quantity(w)).toBe(20);
    expect(w.events.some((e) => e.type === 'failed')).toBe(true);
    expect(actor(w).extensionState['food-assessment:pending']).toBeUndefined();
  });
  it('conserves fractional material and provenance through give, drop and pickup', () => {
    let w = learned();
    const recipient = w.actors[1];
    if (!recipient) throw new Error('Missing recipient');
    recipient.position = { x: 2.5, y: 2 };
    w = step(w, {
      interface: 'give',
      args: { target: 'food', quantity: 0.3, recipient: 'b' },
    });
    expect(quantity(w)).toBe(20);
    expect(w.stacks.find((s) => s.owner === 'b')?.quantity).toBe(0.3);
    w = step(w, {
      interface: 'drop',
      args: { target: 'food', quantity: 0.7 },
    });
    const ground = w.stacks.find((s) => s.owner === null);
    if (!ground) throw new Error('Missing dropped portion');
    expect(ground.quantity).toBe(0.7);
    w = step(w, {
      interface: 'pickup',
      args: { target: ground.id, quantity: 0.7 },
    });
    expect(quantity(w)).toBe(20);
    expect(w.stacks.every((s) => s.origin === 'isolated-original-source')).toBe(
      true,
    );
    expect(w.stacks.every((s) => s.owner !== null)).toBe(true);
    expect(w.events.some((e) => e.type === 'failed')).toBe(false);
  });
});
