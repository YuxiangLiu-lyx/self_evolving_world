import { describe, it, expect } from 'vitest';
import {
  collectiveJobs,
  collectiveFoodProfile,
  leanExposure,
  foodUnitMass,
  v7Clone,
  continuousRegistry,
  v7Install,
  v7Signature,
  v7SegmentClear,
  v7Obstacles,
} from '@self-evolving-world/world-core';
import { initialCollectiveWorld } from '../src/collective-scenario.js';
import {
  workFixture,
  workStep,
  buildLeanTo,
  builtFixture,
} from './fixtures/collective-work.js';
const prepare = {
  interface: 'prepare-food',
  args: {
    operation: 'start',
    inputs: [{ itemId: 'fixture-root', quantity: 2 }],
  },
};
describe('reviewed ex11 manual processes (isolated fixtures, no model calls)', () => {
  it('preserves ingredient mass and nutrition through interrupted work, exact completion and consumption', () => {
    let w = workFixture();
    const before = w.actors[0]?.vitals.energy ?? 0;
    w = workStep(w, prepare).world;
    expect(collectiveJobs(w, 'prepare-food')[0]).toMatchObject({
      completedWork: 1,
      remainingWork: 1,
      paidEnergy: 1,
    });
    w = workStep(w, { interface: 'rest', args: {} }).world;
    const state = v7Signature(collectiveJobs(w, 'prepare-food')[0]);
    w = workStep(JSON.parse(JSON.stringify(w)) as typeof w, {
      interface: 'prepare-food',
      args: { operation: 'continue' },
    }).world;
    expect(state).toContain('paused');
    expect(collectiveJobs(w, 'prepare-food')[0]?.paidEnergy).toBe(2);
    const out = w.stacks.find((s) => s.resource === 'hand-mashed-food');
    expect(out).toBeDefined();
    if (!out) throw new Error('Missing output.');
    const r = collectiveFoodProfile(w, out);
    expect(r).toBeDefined();
    if (!r) throw new Error('Missing profile.');
    expect(out.quantity * r.mass).toBeCloseTo(0.8);
    expect(out.physical).toBeUndefined();
    expect(foodUnitMass(w, out) * out.quantity).toBeCloseTo(0.8);
    expect(out.quantity * r.nutrition).toBeCloseTo(28);
    expect(r.food?.ingredients).toEqual([{ resource: 'root', share: 1 }]);
    expect(r.properties?.decay).toBeLessThan(240);
    expect(w.actors[0]?.vitals.energy).toBeGreaterThan(before - 2);
    const a = w.actors[0];
    if (!a) throw new Error('Missing actor.');
    a.vitals.satiety = 50;
    const eaten = workStep(w, {
      interface: 'eat',
      args: { target: 'item:' + out.id, quantity: 10 },
    });
    expect(eaten.outcomes[a.id]?.success).toBe(true);
    expect(
      eaten.world.events.find((e) => e.type === 'ate')?.data.nutrition,
    ).toBe(14);
    expect(eaten.world.stacks.find((s) => s.id === out.id)?.quantity).toBe(10);
    expect(
      eaten.world.actors[0]?.memory.discoveries?.['hand-mashed-food'],
    ).toMatchObject({
      nutrition: 1.4,
      toxicity: 0,
      itemId: out.id,
      appliesTo: 'This consumed lot only; other prepared batches may differ.',
    });
    expect(
      eaten.world.events.filter((e) => e.type === 'meal-experience'),
    ).toHaveLength(1);
    expect(
      eaten.world.events.filter(
        (e) => e.type === 'satisfaction' && e.interface === 'prepare-food',
      ),
    ).toHaveLength(0);
  });
  it('cancellation returns only remaining escrow once and rejects duplicate or foreign allocations', () => {
    let w = workFixture();
    w = workStep(w, prepare).world;
    const j = collectiveJobs(w, 'prepare-food')[0];
    if (!j) throw new Error('Missing process.');
    w = workStep(w, {
      interface: 'prepare-food',
      args: { operation: 'cancel', processId: j.id },
    }).world;
    expect(
      w.stacks
        .filter((s) => s.resource === 'root')
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(4);
    const duplicate = workStep(w, {
      interface: 'prepare-food',
      args: { operation: 'cancel', processId: j.id },
    });
    expect(duplicate.outcomes['ash-1']?.success).toBe(false);
    const foreign = workStep(workFixture(), {
      ...prepare,
      args: {
        ...prepare.args,
        inputs: [
          { itemId: 'fixture-root', quantity: 2 },
          { itemId: 'fixture-root', quantity: 2 },
        ],
      },
    });
    expect(foreign.outcomes['ash-1']?.success).toBe(false);
  });
  it('reserves and pays once, leaves real traversable geometry, wears, and protects another untrained member', () => {
    const { world: w } = builtFixture(),
      s = w.objects.find((o) => o.kind === 'weather-lean-to');
    if (!s) throw new Error('Missing shelter.');
    expect(collectiveJobs(w, 'weather-lean-to')[0]).toMatchObject({
      paidEnergy: 16,
      completedWork: 8,
      status: 'completed',
    });
    expect(w.objects.filter((o) => o.assemblyParent === s.id)).toHaveLength(3);
    expect(
      v7SegmentClear(
        { x: 10, y: 11.7 },
        { x: 10, y: 10 },
        0.24,
        v7Obstacles(w),
      ),
    ).toBe(true);
    const other = w.actors[1];
    if (!other) throw new Error('Missing visitor.');
    other.position = { x: 10, y: 10 };
    other.vitals.energy = 20;
    expect(other.mastered).not.toContain('weather-lean-to');
    expect(leanExposure(w, other)?.exposureReduction).toBeGreaterThan(0.25);
    const old = Number(s.data.integrity),
      next = workStep(w, { interface: 'rest', args: {} }, other.id).world;
    expect(
      Number(next.objects.find((o) => o.id === s.id)?.data.integrity),
    ).toBeLessThan(old);
    expect(
      next.events.some(
        (e) => e.type === 'sheltered-rest' && e.actor === other.id,
      ),
    ).toBe(true);
    other.position = { x: 10.9, y: 10 };
    expect(leanExposure(w, other)?.target).toBeNull();
  });
  it('does not grant absent materials or overlap occupied sites and returns a cancelled reservation to ground', () => {
    const w = workFixture();
    const occupied = v7Clone(buildLeanTo);
    occupied.args.site = { x: 11.6, y: 10, angle: 0 };
    expect(workStep(w, occupied).outcomes['ash-1']?.success).toBe(false);
    w.stacks = w.stacks.filter((s) => s.resource !== 'bark');
    expect(workStep(w, buildLeanTo).outcomes['ash-1']?.success).toBe(false);
    let started = workStep(workFixture(), buildLeanTo).world;
    started = workStep(started, {
      interface: 'weather-lean-to',
      args: { operation: 'cancel' },
    }).world;
    expect(started.objects).toHaveLength(0);
    expect(
      started.stacks
        .filter((s) => s.resource === 'branch' && s.owner === null)
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(4);
  });
  it('keeps packages unavailable in fresh B while restoring A with paid work intact', () => {
    const b = initialCollectiveWorld('collective-ex12', 'B'),
      a = workStep(workFixture(), prepare).world;
    expect(
      continuousRegistry(b).packages.some((p) => p.id === 'prepare-food'),
    ).toBe(false);
    expect(() => v7Install(b, continuousRegistry(a), 'prepare-food@1')).toThrow(
      'scope',
    );
    expect(
      workStep(v7Clone(a), {
        interface: 'prepare-food',
        args: { operation: 'continue' },
      }).world.stacks.some((s) => s.resource === 'hand-mashed-food'),
    ).toBe(true);
  });
});

it('retains unpaid work, releases escrow on actual death, and never refunds labor', () => {
  let w = workStep(workFixture(), prepare).world;
  const a = w.actors[0];
  if (!a) throw new Error('Missing actor.');
  a.vitals.energy = 0;
  const paused = workStep(w, {
    interface: 'prepare-food',
    args: { operation: 'continue' },
  }).world;
  expect(collectiveJobs(paused, 'prepare-food')[0]).toMatchObject({
    paidEnergy: 1,
    remainingWork: 1,
    status: 'paused',
  });
  const p = paused.actors[0];
  if (!p) throw new Error('Missing actor.');
  p.vitals.health = 0.1;
  p.vitals.satiety = 0;
  w = workStep(paused, { interface: 'wait', args: {} }).world;
  expect(w.events.some((e) => e.type === 'died')).toBe(true);
  expect(collectiveJobs(w, 'prepare-food')[0]).toMatchObject({
    paidEnergy: 1,
    status: 'stopped',
  });
  expect(
    w.stacks
      .filter((s) => s.resource === 'root')
      .reduce((n, s) => n + s.quantity, 0),
  ).toBe(4);
  expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
});
it('charges real repair and dismantling, preserving recovered mass plus recorded debris', () => {
  let { world: w } = builtFixture();
  const shelter = w.objects.find((o) => o.kind === 'weather-lean-to');
  if (!shelter) throw new Error('Missing shelter.');
  shelter.data.integrity = 0.5;
  const repaired = workStep(w, {
    interface: 'weather-lean-to',
    args: {
      operation: 'repair',
      shelterId: shelter.id,
      materials: [
        { itemId: 'fixture-bark', quantity: 1 },
        { itemId: 'fixture-vine', quantity: 0.5 },
      ],
    },
  });
  expect(repaired.outcomes['ash-1']?.success).toBe(true);
  w = workStep(repaired.world, {
    interface: 'weather-lean-to',
    args: { operation: 'work' },
  }).world;
  expect(
    Number(w.objects.find((o) => o.id === shelter.id)?.data.integrity),
  ).toBeGreaterThan(0.73);
  expect(
    collectiveJobs(w, 'weather-lean-to').find((j) => j.mode === 'repair')
      ?.paidEnergy,
  ).toBe(4);
  w = workStep(w, {
    interface: 'weather-lean-to',
    args: { operation: 'dismantle', shelterId: shelter.id },
  }).world;
  w = workStep(w, {
    interface: 'weather-lean-to',
    args: { operation: 'work' },
  }).world;
  expect(w.objects).toHaveLength(0);
  const job = collectiveJobs(w, 'weather-lean-to').find(
    (j) => j.mode === 'dismantle',
  );
  expect(job?.paidEnergy).toBe(2);
  const mass = w.stacks
    .filter((s) => s.origin === shelter.id)
    .reduce(
      (n, s) =>
        n +
        s.quantity * (w.resources.find((r) => r.id === s.resource)?.mass ?? 0),
      0,
    );
  expect(mass + Number(job?.unusableDebrisMass)).toBeCloseTo(
    4 * 1.1 + 2.5 * 0.5 + 7 * 0.3,
  );
  expect(
    workStep(w, {
      interface: 'weather-lean-to',
      args: { operation: 'dismantle', shelterId: shelter.id },
    }).outcomes['ash-1']?.success,
  ).toBe(false);
});
it('preserves mixed ingredient water, solids, mass and nutrient fractions without resetting expiry', () => {
  let w = workFixture();
  const root = w.stacks.find((s) => s.resource === 'root'),
    berry = w.stacks.find((s) => s.resource === 'berry');
  if (!root || !berry) throw new Error('Missing ingredients.');
  root.physical = { unitMass: 0.4, unitWater: 0.3, unitSolids: 0.1 };
  berry.physical = { unitMass: 0.2, unitWater: 0.17, unitSolids: 0.03 };
  berry.decay = 80;
  w = workStep(w, {
    interface: 'prepare-food',
    args: {
      operation: 'start',
      inputs: [
        { itemId: root.id, quantity: 1 },
        { itemId: berry.id, quantity: 1 },
      ],
    },
  }).world;
  w = workStep(w, {
    interface: 'prepare-food',
    args: { operation: 'continue' },
  }).world;
  const out = w.stacks.find((s) => s.resource === 'hand-mashed-food');
  if (!out) throw new Error('Missing real output.');
  const edible = collectiveFoodProfile(w, out);
  expect(foodUnitMass(w, out) * out.quantity).toBeCloseTo(0.6);
  expect((out.physical?.unitWater ?? 0) * out.quantity).toBeCloseTo(0.47);
  expect((out.physical?.unitSolids ?? 0) * out.quantity).toBeCloseTo(0.13);
  expect((edible?.nutrition ?? 0) * out.quantity).toBeCloseTo(22);
  expect(edible?.food?.ingredients.map((i) => i.resource)).toEqual([
    'root',
    'berry',
  ]);
  expect(edible?.food?.ingredients[0]?.share).toBeCloseTo(14 / 22, 7);
  expect(edible?.food?.ingredients[1]?.share).toBeCloseTo(8 / 22, 7);
  expect(edible?.properties?.decay).toBeLessThan(20);
});
