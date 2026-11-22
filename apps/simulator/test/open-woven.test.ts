import { expect, it } from 'vitest';
import {
  v7Clone,
  v7Observe,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7World, V7Data } from '@self-evolving-world/world-core';
import {
  wovenAction,
  wovenFixture,
  wovenTests,
  wovenFrames,
  wovenStep,
  conditionedWoven,
} from './fixtures/open-woven.js';
import { assayAction } from './fixtures/open-food-assay.js';
const last = (frames: V7World[]) => {
  const w = frames.at(-1);
  if (!w) throw new Error('Missing world');
  return w;
};
const actor = (w: V7World) => {
  const a = w.actors[0];
  if (!a) throw new Error('Missing performer');
  return a;
};
it('requires real learned tests and fresh local materials, retains paid dry/wet observations and finite water accounting', () => {
  const base = wovenFixture();
  expect(
    wovenStep(
      base,
      wovenAction(
        'assemble',
        'branch',
        ['vine', 'hammer', 'comparison'],
        'no-tests',
      ),
    ).outcomes.lin?.success,
  ).toBe(false);
  const w = last(wovenTests(base));
  const knowledge = actor(w).memory.knowledge ?? {};
  expect(
    Object.values(knowledge).filter(
      (k) => k.property === 'tested batch support',
    ),
  ).toHaveLength(2);
  const water = w.state['woven:water:8:8'] as V7Data;
  expect(Number(water.remaining) + Number(water.withdrawn)).toBeCloseTo(20);
  expect(water.withdrawn).toBe(0.1);
  expect(w.stacks.filter((s) => s.processing?.wovenSpecimen)).toHaveLength(2);
  expect(actor(w).vitals.energy).toBeCloseTo(actor(base).vitals.energy - 2);
  expect(JSON.stringify(v7Observe(w, 'lin'))).not.toContain('woven:law');
});
it('builds and calibrates only through all paid stages, conserved comparison pieces and actual geometry', () => {
  const frames = wovenFrames(),
    w = last(frames),
    before = frames[0];
  if (!before) throw new Error('Missing baseline');
  const balance = w.objects.find((o) => o.kind === 'comparison-balance');
  expect(balance?.data.calibrated).toBe(true);
  expect(balance?.data.calibrationHistory).toHaveLength(3);
  expect(actor(w).vitals.energy).toBeCloseTo(actor(before).vitals.energy - 8.5);
  expect(
    w.stacks
      .filter((s) => s.processing?.comparisonWeight)
      .reduce((n, s) => n + s.quantity, 0),
  ).toBeCloseTo(1);
  expect(w.stacks.some((s) => s.resource === 'bark')).toBe(false);
  expect(w.events.some((e) => e.type === 'woven-support-completed')).toBe(true);
});
it('releases only surviving allocations once, resumes remaining work and salvages consumed components after destruction', () => {
  let w = last(wovenTests());
  const action = wovenAction(
    'assemble',
    'branch',
    ['vine', 'hammer', 'comparison'],
    'partial',
  );
  for (let i = 0; i < 4; i++) w = v7Clone(wovenStep(w, action).world);
  w = v7Clone(wovenStep(w, { interface: 'wait', args: {} }).world);
  const j = w.state['woven:work:lin:partial'] as V7Data;
  expect(j.status).toBe('paused');
  expect(j.stage).toBe(4);
  expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
  const resumed = wovenStep(w, wovenAction('resume', '', [], 'partial'));
  expect(resumed.outcomes.lin?.success).toBe(true);
  w = v7Clone(resumed.world);
  expect((w.state['woven:work:lin:partial'] as V7Data).stage).toBe(5);
  w.objects = w.objects.slice(1);
  w = v7Clone(wovenStep(w, { interface: 'wait', args: {} }).world);
  const salvage = w.stacks.filter((s) => s.processing?.wovenDamage);
  expect(salvage).toHaveLength(3);
  expect(salvage.every((s) => !s.reservedFor && s.owner === null)).toBe(true);
  expect(w.objects).toHaveLength(0);
  expect(
    wovenStep(w, wovenAction('resume', '', [], 'partial')).outcomes.lin
      ?.success,
  ).toBe(false);
});
it('requires personal assay learning before calibration and uses the shared sample contract without granting others mastery', () => {
  let w = conditionedWoven();
  const b = w.objects.find((o) => o.kind === 'comparison-balance'),
    weight = w.stacks.find((s) => s.processing?.comparisonWeight);
  if (!b || !weight) throw new Error('Missing actual equipment');
  const action = assayAction('dry-mass', 'sample', b.id, [weight.id], 1);
  const r = wovenStep(w, action);
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  expect(r.world.events.some((e) => e.type === 'assay-reading')).toBe(true);
  w = v7Clone(r.world);
  const sample = w.stacks.find((s) => s.processing?.meshRetention);
  expect(sample).toBeDefined();
  const other = w.actors[1];
  if (!other) throw new Error('Missing other actor');
  expect(other.mastered).not.toContain('food-assay');
  const denied = v7Step(
    w,
    Object.fromEntries(
      w.actors.map((a) => [
        a.id,
        a.id === other.id ? action : { interface: 'wait', args: {} },
      ]),
    ),
    continuousRegistry(w),
  );
  expect(denied.outcomes[other.id]?.success).toBe(false);
});
it('retains escaped food units and invalidates estimates when real aperture or tare changes', () => {
  let w = conditionedWoven();
  const b = w.objects.find((o) => o.kind === 'comparison-balance'),
    weight = w.stacks.find((s) => s.processing?.comparisonWeight);
  if (!b || !weight) throw new Error('Missing apparatus');
  const action = assayAction('dry-mass', 'sample', b.id, [weight.id], 1);
  w = v7Clone(wovenStep(w, action).world);
  const tray = w.objects.find((o) => o.kind === 'drying-tray');
  if (!tray) throw new Error('Missing tray');
  tray.data.aperture = 1;
  w = v7Clone(wovenStep(w, action).world);
  const sample = w.stacks.find((s) => s.processing?.escapedMesh);
  expect(sample?.quantity).toBe(1);
  expect(sample?.owner).toBeNull();
  expect(sample?.reservedFor).toBeUndefined();
  expect(w.events.some((e) => e.type === 'assay-invalidated')).toBe(true);
});

it('pauses missing water and tools without another charge, rejects bad optional references, and releases a dying performer once', () => {
  let w = wovenFixture();
  const vine = w.stacks.find((s) => s.id === 'vine');
  if (!vine) throw new Error('Missing fixture input');
  vine.physical = { unitMass: 0.15, unitSolids: 0.15, unitWater: 0 };
  const action = wovenAction(
    'test-vine',
    'vine',
    ['hammer'],
    'dry-but-no-water',
  );
  w = v7Clone(wovenStep(w, action).world);
  const paid = actor(w).vitals.energy;
  w = v7Clone(wovenStep(w, action).world);
  expect(actor(w).vitals.energy).toBe(paid);
  expect(w.events.some((e) => e.description.includes('reachable water'))).toBe(
    true,
  );
  const bad = wovenStep(
    w,
    wovenAction('resume', 'missing-item', [], 'dry-but-no-water'),
  );
  expect(bad.outcomes.lin?.success).toBe(false);
  actor(w).vitals.health = 0.1;
  actor(w).vitals.satiety = 0;
  w = v7Clone(wovenStep(w, action).world);
  expect(w.events.some((e) => e.type === 'died')).toBe(true);
  expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
  const specimen = w.stacks.filter((s) => s.processing?.wovenSpecimen);
  expect(specimen).toHaveLength(1);
  expect(specimen[0]?.owner).toBeNull();
});
it('keeps calibration and sample use unavailable to unlearned actors, then permits paid learning and real shared use', () => {
  let w = conditionedWoven();
  const a = actor(w),
    other = w.actors[1];
  if (!other) throw new Error('Missing actor');
  const b = w.objects.find((o) => o.kind === 'comparison-balance'),
    weight = w.stacks.find((s) => s.processing?.comparisonWeight),
    sample = w.stacks.find((s) => s.id === 'sample');
  if (!b || !weight || !sample) throw new Error('Missing fixture material');
  // Explicit ownership/location fixture; all personal learning and actual assay actions execute through the kernel.
  a.position = { x: 5, y: 5 };
  other.position = { x: 8, y: 8 };
  other.vitals.energy = 40;
  other.vitals.satiety = 100;
  other.vitals.health = 100;
  weight.owner = other.id;
  sample.owner = other.id;
  const run = (action: Parameters<typeof wovenStep>[1]) =>
    v7Step(
      w,
      Object.fromEntries(
        w.actors.map((x) => [
          x.id,
          x.id === other.id ? action : { interface: 'wait', args: {} },
        ]),
      ),
      continuousRegistry(w),
    );
  const action = assayAction('dry-mass', 'sample', b.id, [weight.id], 1);
  expect(run(action).outcomes[other.id]?.success).toBe(false);
  for (let i = 0; i < 5; i++)
    w = v7Clone(
      run({ interface: 'learn', args: { ability: 'food-assay' } }).world,
    );
  const result = run(action);
  expect(
    result.outcomes[other.id]?.success,
    result.outcomes[other.id]?.reason,
  ).toBe(true);
  expect(
    result.world.events.some(
      (e) => e.type === 'assay-reading' && e.actor === other.id,
    ),
  ).toBe(true);
  w = v7Clone(result.world);
  for (let i = 0; i < 60; i++) {
    const reading = run(action);
    expect(
      reading.outcomes[other.id]?.success,
      reading.outcomes[other.id]?.reason,
    ).toBe(true);
    w = v7Clone(reading.world);
    if (reading.outcomes[other.id]?.complete) break;
  }
  expect(
    w.events.some(
      (e) => e.type === 'food-assay-completed' && e.actor === other.id,
    ),
  ).toBe(true);
});
it('does not repeat understanding rewards for known batch tests and preserves conserved material through wet contact', () => {
  let w = last(wovenTests());
  const a = actor(w);
  const first = Object.keys(a.memory.knowledge ?? {}).length;
  const action = wovenAction(
    'test-beam',
    'branch',
    ['hammer'],
    'repeat-evidence',
  );
  w = v7Clone(wovenStep(w, action).world);
  w = v7Clone(wovenStep(w, action).world);
  expect(Object.keys(actor(w).memory.knowledge ?? {})).toHaveLength(first);
  expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(false);
  w = last(wovenFrames());
  const b = w.objects.find((o) => o.kind === 'comparison-balance'),
    weight = w.stacks.find((s) => s.processing?.comparisonWeight);
  if (!b || !weight) throw new Error('Missing actual apparatus');
  w = v7Clone(
    wovenStep(w, assayAction('dry-mass', 'sample', b.id, [weight.id], 1)).world,
  );
  w = v7Clone(
    wovenStep(w, assayAction('dry-mass', 'sample', b.id, [weight.id], 1)).world,
  );
  expect(
    w.events.some(
      (e) =>
        e.type === 'assay-invalidated' &&
        e.data.reason ===
          'Actual support water entered the sample; analytical mass history is invalid.',
    ),
  ).toBe(true);
  expect(
    Object.values(w.state['woven:contact-water'] as V7Data).reduce<number>(
      (n, x) => n + Number(x),
      0,
    ),
  ).toBeGreaterThan(0);
  expect(
    w.stacks
      .filter((s) => s.resource === 'hazelnut')
      .reduce((n, s) => n + s.quantity, 0),
  ).toBe(2);
});
