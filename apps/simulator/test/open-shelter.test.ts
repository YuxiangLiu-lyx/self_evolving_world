import { it, expect } from 'vitest';
import {
  v7Clone,
  v7Load,
  v7SegmentClear,
} from '@self-evolving-world/world-core';
import type { V7World, V7Data } from '@self-evolving-world/world-core';
import {
  refugeFixture,
  refugeTested,
  refugeFrames,
  refugeStep,
  refugeAction,
  refugeAllocation,
} from './fixtures/open-shelter.js';
const actor = (w: V7World) => {
  const a = w.actors[0];
  if (!a) throw new Error('Missing actor');
  return a;
};
const last = (w: V7World[]) => {
  const a = w.at(-1);
  if (!a) throw new Error('Missing frame');
  return a;
};
const structure = (w: V7World) => {
  const o = w.objects.find((o) => o.kind === 'open-refuge');
  if (!o) throw new Error('Missing structure');
  return o;
};
it('requires actual personal source tests and preserves previously measured short geometry', () => {
  let w = refugeFixture();
  expect(
    refugeStep(w, refugeAction('build', 'build', refugeAllocation)).outcomes.lin
      ?.success,
  ).toBe(false);
  w = refugeTested();
  (w.state['woven:law:branch:fixture-branch'] as V7Data).length = 0.8;
  const r = refugeStep(w, refugeAction('build', 'build', refugeAllocation));
  expect(r.outcomes.lin?.success).toBe(false);
  expect(r.world.stacks.some((s) => s.reservedFor)).toBe(false);
});
it('executes ten paid stages with real open exits and conserves installed material through dismantling', () => {
  const before = refugeTested(),
    frames = refugeFrames();
  let w = last(frames);
  expect(structure(w).data.proven).toBe(true);
  expect(actor(w).vitals.energy).toBeCloseTo(actor(before).vitals.energy - 8);
  const poles = w.objects
    .filter((o) => o.kind === 'refuge-pole')
    .map((o) => o.spatial);
  expect(
    v7SegmentClear({ x: 6.7, y: 8 }, { x: 9.3, y: 8 }, actor(w).radius, poles),
  ).toBe(true);
  expect(
    v7SegmentClear(
      { x: 7.1, y: 7.4 },
      { x: 7.1, y: 7.4 },
      actor(w).radius,
      poles,
    ),
  ).toBe(false);
  const parts = structure(w).data.components as V7Data[],
    ids = parts.map((p) => p.id);
  const id = structure(w).id;
  for (let i = 0; i < 4; i++)
    w = v7Clone(
      refugeStep(w, refugeAction('dismantle', 'take-down', [], id)).world,
    );
  expect(w.objects.some((o) => o.kind === 'open-refuge')).toBe(false);
  for (const id of ids)
    expect(w.stacks.filter((s) => s.id === id)).toHaveLength(1);
  expect(w.events.some((e) => e.type === 'satisfaction')).toBe(false);
});
it('cancels only remaining escrow and resumes exact stages across serialization without double charging', () => {
  let w = refugeTested();
  w = v7Clone(
    refugeStep(w, refugeAction('build', 'refuge-build', refugeAllocation))
      .world,
  );
  const installed = (structure(w).data.components as V7Data[]).map((p) => p.id);
  w = v7Clone(refugeStep(w, refugeAction('cancel')).world);
  expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
  expect((structure(w).data.components as V7Data[]).map((p) => p.id)).toEqual(
    installed,
  );
  w = JSON.parse(JSON.stringify(w)) as V7World;
  const energy = actor(w).vitals.energy;
  for (let i = 0; i < 9; i++)
    w = v7Clone(refugeStep(w, refugeAction('resume')).world);
  expect(structure(w).data.stage).toBe(10);
  expect(actor(w).vitals.energy).toBeCloseTo(energy - 7.2);
});
it('pauses missing energy, preserves test fragments and refuses aliases or untested replacement inputs', () => {
  let w = refugeTested();
  expect(w.stacks.filter((s) => s.processing?.refugeTest)).toHaveLength(3);
  const alias = refugeAction('test', 'bad', [
    { item: 'branch', quantity: 0.1 },
  ]);
  expect(refugeStep(w, alias).outcomes.lin?.success).toBe(false);
  actor(w).vitals.energy = 0;
  const load = v7Load(w, actor(w));
  w = v7Clone(
    refugeStep(w, refugeAction('build', 'refuge-build', refugeAllocation))
      .world,
  );
  expect(w.objects.some((o) => o.kind === 'open-refuge')).toBe(false);
  expect(v7Load(w, actor(w))).toBeCloseTo(load);
});
it('shares actual shade with another actor without granting mastery and rewards only beneficial occupied rest', () => {
  let w = last(refugeFrames());
  const other = w.actors[1];
  if (!other) throw new Error('Missing second actor');
  other.position = { x: 8.55, y: 8 };
  expect(other.mastered).not.toContain('resting-shelter');
  actor(w).vitals.temperature = 32;
  actor(w).vitals.energy = 10;
  other.vitals.temperature = 32;
  other.vitals.energy = 10;
  w.time = 180;
  w.tick = 180;
  for (let i = 0; i < 3; i++)
    w = v7Clone(refugeStep(w, { interface: 'rest', args: {} }).world);
  expect(
    w.events.some(
      (e) => e.type === 'shelter-exposure-measured' && e.actor === other.id,
    ),
  ).toBe(true);
  expect(
    w.events.some(
      (e) => e.type === 'shelter-rest-experience' && e.actor === 'lin',
    ),
  ).toBe(true);
  expect(other.mastered).not.toContain('resting-shelter');
  expect(
    actor(w).wellbeing.sources.find((s) => s.source === 'personal-refuge')
      ?.sustained,
  ).toBeLessThanOrEqual(0.4);
  actor(w).position = { x: 10, y: 8 };
  w = v7Clone(refugeStep(w, { interface: 'rest', args: {} }).world);
  expect(w.events.some((e) => e.type === 'shelter-rest-experience')).toBe(
    false,
  );
});
it('keeps archival records explicit and individually learned without changing limits or world progress', () => {
  let w = refugeFixture();
  const a = actor(w);
  a.memory.projects = {
    sample: {
      id: 'sample',
      status: 'paused',
      question: 'Observed problem',
      evidence: [],
      uncertainty: 'Unknown',
      goal: 'Understand',
      completedSteps: [],
      outputs: [],
      missing: 'Evidence',
      next: 'Observe',
      pauseReason: 'Testing',
      benefit: 'None',
    },
  };
  const action = {
    interface: 'archive-project',
    args: { mode: 'archive', project: 'sample' },
  };
  expect(refugeStep(w, action).outcomes.lin?.success).toBe(false);
  w = v7Clone(
    refugeStep(w, { interface: 'learn', args: { ability: 'archive-project' } })
      .world,
  );
  w = v7Clone(refugeStep(w, action).world);
  expect(actor(w).memory.projects?.sample).toBeUndefined();
  expect(actor(w).extensionState['open:archive:sample']).toHaveLength(1);
  w = v7Clone(
    refugeStep(w, {
      interface: 'archive-project',
      args: { mode: 'restore', project: 'sample' },
    }).world,
  );
  expect(actor(w).memory.projects?.sample?.question).toBe('Observed problem');
  expect(w.config.development?.projectLimit).toBe(4);
});
it('retains dead-owner installed solids, releases unused material once and advances weather without the builder', () => {
  let w = refugeTested();
  w = v7Clone(
    refugeStep(w, refugeAction('build', 'refuge-build', refugeAllocation))
      .world,
  );
  actor(w).vitals.health = 0.1;
  actor(w).vitals.satiety = 0;
  w = v7Clone(refugeStep(w, { interface: 'wait', args: {} }).world);
  expect(w.events.some((e) => e.type === 'died')).toBe(true);
  expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
  const o = structure(w),
    condition = Number(o.data.condition),
    ids = (o.data.components as V7Data[]).map((s) => s.id);
  actor(w).vitals.satiety = 80;
  for (let i = 0; i < 4; i++)
    w = v7Clone(refugeStep(w, { interface: 'wait', args: {} }).world);
  expect(Number(structure(w).data.condition)).toBeLessThan(condition);
  expect((structure(w).data.components as V7Data[]).map((p) => p.id)).toEqual(
    ids,
  );
  expect(
    w.stacks.filter(
      (s) =>
        s.processing?.refugeSource &&
        !s.processing.refugeTest &&
        s.owner === null,
    ),
  ).toHaveLength(2);
});
it('preserves dry solids and accounts environmental water through repair and progressive dismantling', () => {
  let w = last(refugeFrames()),
    o = structure(w);
  const oldParts = o.data.components as V7Data[],
    oldReed = oldParts.find((s) => s.resource === 'reed');
  if (!oldReed) throw new Error('Missing panel');
  const stock = w.stacks.find((s) => s.id === 'fixture-reed');
  if (!stock) throw new Error('Missing fixture repair stock');
  stock.quantity = 6;
  stock.quantityTenths = 60;
  const totalSolids = (w: V7World) =>
      w.stacks.reduce(
        (n, s) => n + (s.physical?.unitSolids ?? 0) * s.quantity,
        0,
      ) +
      (structure(w).data.components as V7Data[]).reduce(
        (n, s) =>
          n + Number((s.physical as V7Data).unitSolids) * Number(s.quantity),
        0,
      ),
    before = totalSolids(w);
  for (let i = 0; i < 2; i++) {
    const r = refugeStep(
      w,
      refugeAction(
        'repair',
        'repair-roof',
        [{ item: 'fixture-reed', quantity: 6 }],
        o.id,
      ),
    );
    expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
    w = v7Clone(r.world);
  }
  o = structure(w);
  expect(totalSolids(w)).toBeCloseTo(before);
  expect(w.stacks.filter((s) => s.id === oldReed.id)).toHaveLength(1);
  expect(Number(o.data.rainWater)).toBeGreaterThan(0);
  expect((o.data.components as V7Data[]).some((s) => s.id === oldReed.id)).toBe(
    false,
  );
});
it('removes failed-roof coverage and cannot farm new understanding or refuge by repeated labels', () => {
  let w = refugeTested();
  const r = refugeAction('test', 'renamed', [
    { item: 'fixture-branch', quantity: 0.1 },
  ]);
  for (let i = 0; i < 2; i++) w = v7Clone(refugeStep(w, r).world);
  expect(
    w.events.some((e) =>
      ['information-confirmed', 'practice-confirmed'].includes(e.type),
    ),
  ).toBe(false);
  w = last(refugeFrames());
  structure(w).data.condition = 0.1;
  actor(w).vitals.temperature = 32;
  actor(w).vitals.energy = 10;
  w = v7Clone(refugeStep(w, { interface: 'rest', args: {} }).world);
  expect(structure(w).data.proven).toBe(false);
  expect(w.events.some((e) => e.type === 'shelter-rest-experience')).toBe(
    false,
  );
  expect(w.events.find((e) => e.type === 'rested')?.data.nominal).toBe(
    w.config.restRecovery,
  );
});
