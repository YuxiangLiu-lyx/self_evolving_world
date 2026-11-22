import { examinationFixture } from './fixtures/open-food-examination.js';
import { expect, it } from 'vitest';
import {
  v7Clone,
  v7Load,
  v7Observe,
  v7Install,
  v7Registry,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7World, V7Data } from '@self-evolving-world/world-core';
import {
  hardnessAction,
  hardnessFixture,
  hardnessFrames,
  hardnessStep,
} from './fixtures/open-hardness.js';
const actor = (w: V7World) => {
  const a = w.actors[0];
  if (!a) throw new Error('Missing performer');
  return a;
};
const last = (f: V7World[]) => {
  const w = f.at(-1);
  if (!w) throw new Error('Missing frame');
  return w;
};
it('records paid directional surface evidence and conserves specimen mass including actual detached dust', () => {
  const before = hardnessFixture(),
    w = last(hardnessFrames());
  expect(v7Load(w, actor(w))).toBeCloseTo(v7Load(before, actor(before)), 7);
  expect(actor(w).vitals.energy).toBeCloseTo(actor(before).vitals.energy - 1.4);
  expect(w.stacks.filter((s) => s.processing?.scratchSpecimen)).toHaveLength(2);
  expect(w.stacks.filter((s) => s.resource === 'scratch-debris')).toHaveLength(
    2,
  );
  const j = w.state['hardness:project:lin:surface-study'] as V7Data,
    result = j.result as V7Data;
  expect(result.relative).toBe('second specimen more scratch-resistant');
  expect(result.absoluteBounds).toBeNull();
  expect(
    (j.observations as V7Data[]).some((r) => r.persistentGroove === true),
  ).toBe(true);
  expect(JSON.stringify(v7Observe(w, 'lin'))).not.toContain('"resistance":');
});
it('never certifies absolute hardness from names, circular claims, a tool threshold or held-load evidence', () => {
  let w = last(hardnessFrames());
  const s = w.stacks.find((s) => s.processing?.hardnessComparison);
  if (!s) throw new Error('Missing tested portion');
  s.processing = {
    ...s.processing,
    hardnessCertification: {
      lowerBound: 10,
      source: s.id,
      reason: 'stone name and tool threshold',
    },
  };
  w = v7Clone(hardnessStep(w, hardnessAction('assess', s.id)).world);
  expect(
    w.events.find((e) => e.type === 'hardness-assessment-completed')?.data
      .absolute,
  ).toBe('hardness >=8 unresolved');
  expect(
    w.events.some((e) =>
      ['information-confirmed', 'practice-confirmed', 'satisfaction'].includes(
        e.type,
      ),
    ),
  ).toBe(false);
  expect(
    hardnessStep(w, hardnessAction('assess', 'second-stone')).outcomes.lin
      ?.success,
  ).toBe(false);
});
it('does not reward ambiguous identical-material comparisons or repeated known batch findings', () => {
  let w = hardnessFixture(),
    action = hardnessAction('compare', 'stone', 'second-stone');
  w = v7Clone(hardnessStep(w, action).world);
  w = v7Clone(hardnessStep(w, action).world);
  expect(
    w.events.some((e) =>
      ['information-confirmed', 'practice-confirmed', 'satisfaction'].includes(
        e.type,
      ),
    ),
  ).toBe(false);
  w = last(hardnessFrames());
  action = hardnessAction('compare', 'stone', 'flint', 'second-test');
  w = v7Clone(hardnessStep(w, action).world);
  w = v7Clone(hardnessStep(w, action).world);
  expect(
    w.events.some((e) =>
      ['information-confirmed', 'practice-confirmed', 'satisfaction'].includes(
        e.type,
      ),
    ),
  ).toBe(false);
});
it('charges no missing input or energy and preserves one completed stroke across cancellation without duplicate release', () => {
  let w = hardnessFixture();
  const action = hardnessAction('compare', 'stone', 'flint');
  expect(
    hardnessStep(w, hardnessAction('compare', 'stone', 'stone')).outcomes.lin
      ?.success,
  ).toBe(false);
  const energy = actor(w).vitals.energy;
  w = v7Clone(hardnessStep(w, action).world);
  expect(actor(w).vitals.energy).toBeCloseTo(energy - 0.5);
  actor(w).vitals.energy = 0;
  w = v7Clone(hardnessStep(w, action).world);
  expect((w.state['hardness:project:lin:surface-study'] as V7Data).stage).toBe(
    1,
  );
  w = v7Clone(hardnessStep(w, { interface: 'wait', args: {} }).world);
  expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
  const count = w.stacks.length;
  w = v7Clone(hardnessStep(w, { interface: 'wait', args: {} }).world);
  expect(w.stacks).toHaveLength(count);
  expect(
    (w.state['hardness:project:lin:surface-study'] as V7Data).observations,
  ).toHaveLength(1);
});
it('retains paid partial observations and altered specimens when possession is lost or the performer dies', () => {
  let w = hardnessFixture();
  const action = hardnessAction('compare', 'stone', 'flint');
  w = v7Clone(hardnessStep(w, action).world);
  const specimen = w.stacks.find((s) => s.reservedFor);
  if (!specimen) throw new Error('Missing escrow');
  specimen.owner = null;
  w = v7Clone(hardnessStep(w, action).world);
  expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
  expect((w.state['hardness:project:lin:surface-study'] as V7Data).status).toBe(
    'cancelled',
  );
  w = hardnessFixture();
  w = v7Clone(hardnessStep(w, action).world);
  actor(w).vitals.health = 0.1;
  actor(w).vitals.satiety = 0;
  actor(w).vitals.energy = 0;
  w = v7Clone(hardnessStep(w, action).world);
  expect(w.events.some((e) => e.type === 'died')).toBe(true);
  expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
  expect(
    w.stacks
      .filter((s) => s.processing?.scratchSpecimen)
      .every((s) => s.owner === null),
  ).toBe(true);
});

it('permits actual firm food surfaces without destroying nutrient units or inventing detached food', () => {
  let w = hardnessFixture();
  const s = w.stacks.find((s) => s.id === 'stone');
  if (!s) throw new Error('Missing fixture');
  s.resource = 'hazelnut';
  const action = hardnessAction('compare', 'stone', 'flint');
  const before = v7Load(w, actor(w));
  w = v7Clone(hardnessStep(w, action).world);
  w = v7Clone(hardnessStep(w, action).world);
  expect(w.events.some((e) => e.type === 'hardness-comparison-completed')).toBe(
    true,
  );
  expect(
    w.stacks
      .filter((s) => s.resource === 'hazelnut')
      .reduce((n, s) => n + s.quantity, 0),
  ).toBe(1);
  expect(v7Load(w, actor(w))).toBeCloseTo(before, 7);
});

it('rejects a practice eligibility event that the reviewed package did not declare', () => {
  const w = examinationFixture(),
    packages = continuousRegistry(w).packages,
    p = packages.find((p) => p.id === 'hardness-assessment');
  if (!p) throw new Error('Missing scoped package');
  const invalid = {
    ...p,
    abilities: p.abilities.map((a) => ({
      ...a,
      practiceEvidence: 'undeclared-award',
    })),
  };
  const registry = v7Registry(
    packages.map((p) => (p.id === invalid.id ? invalid : p)),
  );
  expect(() => v7Install(w, registry, 'hardness-assessment@1')).toThrow(
    'declared extension event',
  );
});
