import { expect, it } from 'vitest';
import {
  v7Clone,
  v7Observe,
  v7Load,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import {
  assayFixture,
  assayStep,
  assayEquipmentFrames,
  assayMeasurement,
  balanceAction,
  assayAction,
} from './fixtures/open-food-assay.js';
const actor = (w: V7World) => {
  const a = w.actors[0];
  if (!a) throw new Error('Missing actor');
  return a;
};
const last = <T>(v: T[]) => {
  const x = v.at(-1);
  if (!x) throw new Error('Missing value');
  return x;
};
it('builds real apparatus and retained comparison pieces through paid assembly and three physical calibration steps', () => {
  const frames = assayEquipmentFrames(),
    w = last(frames),
    before = frames[0];
  if (!before) throw new Error('Missing baseline');
  expect(actor(w).vitals.energy).toBeCloseTo(actor(before).vitals.energy - 8.5);
  expect(w.objects.map((o) => o.kind).sort()).toEqual([
    'comparison-balance',
    'drying-tray',
  ]);
  const b = w.objects.find((o) => o.kind === 'comparison-balance');
  expect(b?.data.calibrationHistory).toHaveLength(3);
  expect(
    w.stacks
      .filter((s) => s.processing?.comparisonWeight)
      .reduce((n, s) => n + s.quantity, 0),
  ).toBeCloseTo(1);
  expect(w.stacks.find((s) => s.id === 'hammer')?.quantity).toBe(1);
  expect(
    w.stacks.some((s) =>
      ['branch', 'vine', 'bark', 'comparison'].includes(s.id),
    ),
  ).toBe(false);
  expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(false);
});
it('rejects unsupported chemistry before costs and fails actual mismatched geometry calibration', () => {
  let w = assayFixture();
  const energy = actor(w).vitals.energy;
  const unavailable = assayStep(
    w,
    assayAction('protein-precipitation', 'sample'),
  );
  expect(unavailable.outcomes.lin?.success).toBe(false);
  expect(actor(unavailable.world).vitals.energy).toBe(energy);
  for (let i = 0; i < 6; i++) w = v7Clone(assayStep(w, balanceAction()).world);
  const b = w.objects.find((o) => o.kind === 'comparison-balance');
  if (!b) throw new Error('Missing apparatus');
  b.data.geometry = { leftArm: 0.3, rightArm: 0.8, pans: 2 };
  w = v7Clone(assayStep(w, balanceAction()).world);
  expect(assayStep(w, balanceAction()).outcomes.lin?.success).toBe(false);
  expect(b.data.calibrated).not.toBe(true);
});
it('conserves nutrient units and physical sample mass plus evaporated water through genuine passive drying and paid uncertain readings', () => {
  let w = last(assayEquipmentFrames());
  actor(w).vitals.satiety = 100;
  actor(w).vitals.health = 100;
  const action = assayMeasurement(w),
    start = w.tick,
    events = [];
  for (let i = 0; i < 120; i++) {
    const r = assayStep(w, action);
    expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
    w = v7Clone(r.world);
    events.push(...w.events);
    if (r.outcomes.lin?.complete) break;
  }
  expect(w.tick - start).toBeGreaterThan(4);
  expect(events.some((e) => e.type === 'food-assay-completed')).toBe(true);
  const residue = w.stacks.find((s) => s.processing?.gravimetricAssay);
  expect(residue?.quantity).toBe(1);
  expect(residue?.physical?.unitMass).toBeLessThan(0.2);
  const ledger = Object.values(
    w.state['open:water-ledger'] as Record<string, number>,
  ).reduce((n, v) => n + v, 0);
  expect((residue?.physical?.unitMass ?? 0) + ledger).toBeCloseTo(0.2, 6);
  expect(
    w.stacks
      .filter((s) => s.resource === 'hazelnut')
      .reduce((n, s) => n + s.quantity, 0),
  ).toBe(2);
  expect(v7Observe(w, 'lin').stacks.every((s) => !s.physical)).toBe(true);
  const load = v7Load(w, actor(w));
  const raw = v7Clone(w);
  for (const s of raw.stacks) delete s.physical;
  expect(v7Load(raw, actor(raw))).toBeGreaterThan(load);
  const summary = JSON.stringify(actor(w).memory.knowledge);
  expect(summary).toContain('uncertainty');
  expect(summary).toContain('no certified grams');
});
it('preserves actual drying after leaving while stopping unperformed readings and releases a dying performer exactly once', () => {
  let w = last(assayEquipmentFrames());
  const action = assayMeasurement(w);
  w = v7Clone(assayStep(w, action).world);
  w = v7Clone(assayStep(w, action).world);
  w = JSON.parse(JSON.stringify(w)) as V7World;
  const readings = (w.processes[0]?.data.readings as unknown[]).length;
  w = v7Clone(assayStep(w, { interface: 'wait', args: {} }).world);
  expect(w.stacks.every((s) => !s.reservedFor)).toBe(true);
  const mass = w.stacks.find((s) => s.physical)?.physical?.unitMass ?? 0;
  for (let i = 0; i < 45; i++)
    w = v7Clone(assayStep(w, { interface: 'wait', args: {} }).world);
  expect(w.stacks.find((s) => s.physical)?.physical?.unitMass).toBeLessThan(
    mass,
  );
  expect((w.processes[0]?.data.readings as unknown[]).length).toBe(readings);
  actor(w).vitals.health = 0.01;
  actor(w).vitals.satiety = 0;
  w = v7Clone(assayStep(w, { interface: 'wait', args: {} }).world);
  expect(w.processes).toHaveLength(0);
  expect(w.events.filter((e) => e.type === 'assay-invalidated')).toHaveLength(
    1,
  );
  expect(w.stacks.every((s) => !s.reservedFor)).toBe(true);
});

it('requires a second performer to learn before using actual shared apparatus and prevents unavailable sample quantities', () => {
  let w = last(assayEquipmentFrames());
  const lin = actor(w),
    moss = w.actors.find((a) => a.id === 'moss');
  if (!moss) throw new Error('Missing second actor');
  lin.position = { x: 4, y: 4 };
  moss.position = { x: 8, y: 8.65 };
  const sample = w.stacks.find((s) => s.id === 'sample'),
    weight = w.stacks.find((s) => s.processing?.comparisonWeight);
  if (!sample || !weight)
    throw new Error('Missing allocated fixture materials');
  sample.owner = moss.id;
  weight.owner = moss.id;
  const action = assayMeasurement(w);
  const step = (state: V7World, a: typeof action) =>
    v7Step(
      state,
      {
        lin: { interface: 'wait', args: {} },
        moss: a,
        sol: { interface: 'wait', args: {} },
      },
      continuousRegistry(state),
    );
  expect(step(w, action).outcomes.moss?.success).toBe(false);
  for (let i = 0; i < 5; i++)
    w = v7Clone(
      step(w, { interface: 'learn', args: { ability: 'food-assay' } }).world,
    );
  expect(w.objects.every((o) => o.createdBy === 'lin')).toBe(true);
  const excessive = { ...action, args: { ...action.args, quantity: 3 } };
  expect(step(w, excessive).outcomes.moss?.success).toBe(false);
  expect(step(w, action).outcomes.moss?.success).toBe(true);
});
