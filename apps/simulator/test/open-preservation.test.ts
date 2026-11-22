import { it, expect } from 'vitest';
import {
  v7Clone,
  v7Install,
  continuousRegistry,
  v7Load,
} from '@self-evolving-world/world-core';
import type { V7Data, V7Stack, V7World } from '@self-evolving-world/world-core';
import { initialOpenWorld } from '../src/open-scenario.js';
import {
  preservationFixture,
  preservationStep,
  preservationAction,
  preparation,
  preservationTray,
  preservationReading,
  preservationFrames,
} from './fixtures/open-preservation.js';
const wait = { interface: 'wait', args: {} };
const batch = (w: V7World) =>
  w.stacks.find((s) => s.reservedFor?.startsWith('preservation:'));
const physics = (s: V7Stack) => s.processing?.preservationPhysics as V7Data;
function successful(w: V7World, action = wait) {
  const r = preservationStep(w, action);
  expect(r.paused).toBeNull();
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  return v7Clone(r.world);
}
it('requires separate study and exact identities, retains actual geometry and rejects excessive loading without granting food', () => {
  let w = preservationFixture();
  const a = required(w.actors[0]);
  expect(a.mastered).toContain('measured-food-preservation');
  expect(
    continuousRegistry(initialOpenWorld('another-world')).packages.some(
      (p) => p.id === 'measured-food-preservation',
    ),
  ).toBe(false);
  const original = JSON.stringify(w.stacks);
  for (const action of [
    preservationAction(
      'prepare',
      'x',
      'resource:berry',
      preservationTray(w).id,
      1,
    ),
    preservationAction('prepare', 'x', 'berries', preservationTray(w).id, 2),
    preservationAction('prepare', 'x', 'missing', preservationTray(w).id, 1),
  ]) {
    const r = preservationStep(w, action);
    expect(r.outcomes.lin?.success).toBe(false);
    expect(JSON.stringify(w.stacks)).toBe(original);
    expect(r.world.stacks.reduce((n, s) => n + s.quantity, 0)).toBe(
      w.stacks.reduce((n, s) => n + s.quantity, 0),
    );
  }
  w = successful(
    w,
    preservationAction('inspect', '', 'berries', preservationTray(w).id),
  );
  const event = w.events.find((e) => e.type === 'preservation-inspected');
  expect((event?.data.tray as V7Data).area).toBeCloseTo(Math.PI * 0.18 ** 2);
  expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(false);
});
it('pays two stages once, binds exact escrow and continues passive physics after departure and serialization', () => {
  let w = preservationFixture();
  const action = preparation(w),
    before = required(w.actors[0]).vitals.energy,
    load = v7Load(w, required(w.actors[0]));
  w = successful(w, action);
  expect(batch(w)?.quantity).toBe(0.1);
  expect(required(w.actors[0]).vitals.energy).toBeCloseTo(before - 0.5);
  expect(v7Load(w, required(w.actors[0]))).toBeCloseTo(load - 0.02);
  const id = required(batch(w)).id;
  w = successful(JSON.parse(JSON.stringify(w)) as V7World, action);
  expect(batch(w)?.id).toBe(id);
  expect(required(w.actors[0]).vitals.energy).toBeCloseTo(before - 1);
  const water = required(required(batch(w)).physical).unitWater;
  required(w.actors[0]).position = { x: 6, y: 6 };
  w = successful(w);
  expect(required(required(batch(w)).physical).unitWater).toBeLessThan(water);
  expect(physics(required(batch(w))).prepared).toBe(true);
  expect(w.processes.some((p) => p.handler === 'open.preservation')).toBe(true);
});
it('retains stages through attended interruption, resumes without material charges and cancels into one actual surviving ground batch', () => {
  let w = preservationFixture();
  w = successful(w, preparation(w));
  const id = required(batch(w)).id,
    paid = required(w.actors[0]).vitals.energy;
  w = successful(w);
  w = successful(w, preservationAction('resume'));
  expect(batch(w)?.id).toBe(id);
  expect(required(w.actors[0]).vitals.energy).toBeCloseTo(paid - 0.5);
  const point = { ...required(batch(w)).position };
  w = successful(w, preservationAction('cancel'));
  expect(w.stacks.find((s) => s.id === id)?.owner).toBeNull();
  expect(w.stacks.find((s) => s.id === id)?.position).toEqual(point);
  w = successful(w, preservationAction('cancel'));
  expect(w.stacks.filter((s) => s.id === id)).toHaveLength(1);
  expect(w.processes.some((p) => p.handler === 'open.preservation')).toBe(
    false,
  );
  expect(
    preservationStep(w, preservationAction('resume')).outcomes.lin?.success,
  ).toBe(false);
});
it('conserves water, food units, nutrition and toxins and demonstrates only paid finite-resolution reduced-deterioration evidence', () => {
  const frames = preservationFrames(),
    prepared = required(frames[2]),
    read = required(frames[3]),
    removed = required(frames[4]);
  const s = required(batch(read));
  expect(required(s.physical).unitMass).toBeLessThan(0.2);
  expect(required(s.physical).unitSolids).toBeCloseTo(0.03);
  const d = physics(s);
  expect(
    Number(d.evaporated) +
      required(s.physical).unitWater * s.quantity -
      Number(d.rainAdded) -
      Number(d.absorbed),
  ).toBeCloseTo(0.017, 6);
  expect(
    read.stacks
      .filter((s) => s.resource === 'berry')
      .reduce((n, s) => n + s.quantity, 0),
  ).toBeCloseTo(0.3);
  expect(
    read.events.some(
      (e) =>
        e.type === 'preservation-completed' && e.data.demonstrated === true,
    ),
  ).toBe(true);
  expect(read.events.some((e) => e.type === 'practice-confirmed')).toBe(false);
  const record = s.processing?.preservationInput as V7Data;
  expect(record.nutrition).toBeCloseTo(0.8);
  expect(record.toxins).toBe(0);
  const after = required(removed.stacks.find((x) => x.id === s.id));
  expect(after.quantity).toBe(s.quantity);
  expect(after.decay).toBeGreaterThan(required(s.decay));
  expect(physics(after).tray).toBe('');
  expect(prepared.events.some((e) => e.type === 'information-confirmed')).toBe(
    false,
  );
  const reread = successful(read, preservationReading(read));
  expect(
    reread.events.some(
      (e) =>
        e.type === 'information-confirmed' ||
        e.type === 'preservation-completed',
    ),
  ).toBe(false);
});
it('keeps deterioration and rain rewetting real, rejects remote free reads and never restores spoiled food', () => {
  let w = preservationFixture();
  const action = preparation(w);
  w = successful(w, action);
  w = successful(w, action);
  w.tick = 200;
  w.time = 200;
  const prior = required(required(batch(w)).physical).unitWater;
  w = successful(w);
  expect(Number(physics(required(batch(w))).rainAdded)).toBeGreaterThan(0);
  expect(required(required(batch(w)).physical).unitWater).toBeGreaterThan(0);
  expect(prior).toBeGreaterThan(0);
  required(w.actors[0]).position = { x: 2, y: 2 };
  expect(
    preservationStep(w, preservationAction('read')).outcomes.lin?.success,
  ).toBe(false);
  required(w.actors[0]).position = { x: 8, y: 8.65 };
  const id = required(batch(w)).id;
  required(batch(w)).decay = 99.99;
  w = successful(w);
  expect(w.events.some((e) => e.type === 'spoiled' && e.target === id)).toBe(
    true,
  );
  w = successful(w);
  expect(w.stacks.some((s) => s.id === id)).toBe(false);
  w = successful(w, preservationAction('read'));
  expect(
    w.events.some(
      (e) => e.type === 'preservation-completed' && e.data.failed === true,
    ),
  ).toBe(true);
});
it('death releases tray food at the tray rather than at the remote owner and never refunds paid work', () => {
  let w = preservationFixture();
  w = successful(w, preparation(w));
  const s = required(batch(w)),
    point = { ...s.position };
  required(w.actors[0]).position = { x: 3, y: 3 };
  required(w.actors[0]).vitals.health = 0.001;
  required(w.actors[0]).vitals.satiety = 0;
  required(w.actors[0]).vitals.energy = 0;
  w = successful(w);
  expect(required(w.actors[0]).life?.deaths).toBe(1);
  expect(w.stacks.find((x) => x.id === s.id)?.position).toEqual(point);
  expect(w.stacks.find((x) => x.id === s.id)?.owner).toBeNull();
  expect(w.processes.some((p) => p.handler === 'open.preservation')).toBe(
    false,
  );
});
it('retains real paid apparatus for another actor, but neither installation nor shared availability supplies personal mastery or owner consent', () => {
  let w = preservationFixture();
  const other = required(w.actors[1]);
  other.position = { x: 8.2, y: 9.2 };
  expect(
    preservationStep(
      w,
      preservationAction('inspect', '', '', preservationTray(w).id),
      'moss',
    ).outcomes.moss?.success,
  ).toBe(false);
  for (let i = 0; i < 5; i++)
    w = v7Clone(
      preservationStep(
        w,
        { interface: 'learn', args: { ability: 'food-assay' } },
        'moss',
      ).world,
    );
  for (let i = 0; i < 3; i++)
    w = v7Clone(
      preservationStep(
        w,
        { interface: 'learn', args: { ability: 'measured-food-preservation' } },
        'moss',
      ).world,
    );
  expect(required(w.actors[1]).mastered).toContain(
    'measured-food-preservation',
  );
  const r = preservationStep(
    w,
    preservationAction('inspect', '', '', preservationTray(w).id),
    'moss',
  );
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  expect(
    preservationStep(
      w,
      preservationAction(
        'prepare',
        'other',
        'berries',
        preservationTray(w).id,
        1,
      ),
      'moss',
    ).outcomes.moss?.success,
  ).toBe(false);
});
it('migration grants no items, knowledge, mastery or dimensions and preserves already represented sample water', () => {
  const base = initialOpenWorld(),
    f = preservationFixture();
  expect(base.revisions).not.toContain('measured-food-preservation@1');
  const snapshot = v7Clone(f);
  snapshot.revisions = snapshot.revisions.filter(
    (x) => x !== 'measured-food-preservation@1',
  );
  snapshot.abilities = snapshot.abilities.filter(
    (x) => x.id !== 'measured-food-preservation',
  );
  const prior = JSON.stringify([
    snapshot.stacks,
    snapshot.objects,
    snapshot.actors,
  ]);
  const installed = v7Install(
    snapshot,
    continuousRegistry(snapshot),
    'measured-food-preservation@1',
  );
  expect(
    JSON.stringify([installed.stacks, installed.objects, installed.actors]),
  ).toBe(prior);
});
it('pauses unpaid work for insufficient energy, retains pre-existing physical composition and blocks overlapping tray allocations', () => {
  let w = preservationFixture();
  const source = required(w.stacks.find((s) => s.id === 'berries'));
  source.physical = { unitMass: 0.2, unitWater: 0.08, unitSolids: 0.12 };
  const action = preparation(w);
  w = successful(w, action);
  expect(required(required(batch(w)).physical).unitSolids).toBe(0.12);
  const id = required(batch(w)).id;
  required(w.actors[0]).vitals.energy = 0;
  w = successful(w, action);
  expect((w.state['preservation:work:lin:trial'] as V7Data).stage).toBe(1);
  expect(required(w.actors[0]).vitals.energy).toBe(0);
  required(w.actors[0]).vitals.energy = 5;
  w = successful(w, preservationAction('resume'));
  expect(required(batch(w)).id).toBe(id);
  const other = preservationAction(
    'prepare',
    'second',
    'berries',
    preservationTray(w).id,
    1,
  );
  expect(preservationStep(w, other).outcomes.lin?.success).toBe(false);
  expect(w.stacks.filter((s) => s.id === id)).toHaveLength(1);
});
it('keeps removed food nutrient units intact and permits actual paid consumption without a diversity or mastery reward', () => {
  const w = v7Clone(required(preservationFrames().at(-1)));
  const s = required(w.stacks.find((s) => s.processing?.preservationEnded));
  const before = required(w.actors[0]).vitals.satiety;
  const r = preservationStep(w, {
    interface: 'eat',
    args: { target: s.id, quantity: 0.1 },
  });
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  expect(required(r.world.actors[0]).vitals.satiety).toBeCloseTo(
    before + 0.8 - 0.9,
  );
  expect(
    r.world.events.some(
      (e) =>
        e.type === 'information-confirmed' || e.type === 'practice-confirmed',
    ),
  ).toBe(false);
});

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Missing required isolated fixture state.');
  return value;
}

it('keeps raw moisture and toxin audit separate from ordinary observations and does not leave phantom tray food after spoilage', async () => {
  const { v7Observe } = await import('@self-evolving-world/world-core');
  let w = preservationFixture();
  w = successful(w, preparation(w));
  const o = v7Observe(w, 'lin'),
    s = required(
      o.stacks.find((s) => s.reservedFor?.startsWith('preservation:')),
    ),
    d = s.processing?.preservationPhysics as V7Data;
  expect(s.physical).toBeUndefined();
  expect(d.history).toBeUndefined();
  expect(d.initialWaterFraction).toBeUndefined();
  expect((s.processing?.preservationInput as V7Data).toxins).toBeUndefined();
  expect(
    o.events
      .filter((e) => e.type === 'preservation-progress')
      .every((e) => e.data.audit === undefined),
  ).toBe(true);
  expect(
    w.events.some(
      (e) => e.type === 'preservation-progress' && e.data.audit !== undefined,
    ),
  ).toBe(true);
  required(batch(w)).decay = 99.99;
  w = successful(w);
  expect(preservationTray(w).data.preservation).toBeUndefined();
});

it('continues the exact paid operation after the entire source stack was allocated and cannot repeat completed preparation', () => {
  let w = preservationFixture();
  const source = required(w.stacks.find((s) => s.id === 'berries'));
  source.quantity = 0.1;
  source.quantityTenths = 1;
  const action = preparation(w);
  w = successful(w, action);
  expect(w.stacks.some((s) => s.id === 'berries')).toBe(false);
  w = successful(JSON.parse(JSON.stringify(w)) as V7World, action);
  expect(required(batch(w)).quantity).toBe(0.1);
  expect(preservationStep(w, action).outcomes.lin?.success).toBe(false);
});
