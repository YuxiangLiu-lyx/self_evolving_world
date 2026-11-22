import { it, expect } from 'vitest';
import {
  v7Load,
  v7Clone,
  v7Step,
  v7Install,
  continuousRegistry,
  shortRay,
  refugeExposure,
} from '@self-evolving-world/world-core';
import type { V7World, V7Data } from '@self-evolving-world/world-core';
import { initialOpenWorld } from '../src/open-scenario.js';
import {
  shortFixture,
  shortStep,
  shortAdvance,
  shortAction,
  shortTrialInputs,
  shortPrepared,
  shortFrames,
} from './fixtures/open-short-refuge.js';
const required = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error('Missing test value.');
  return v;
};
const mass = (w: V7World) =>
  w.stacks.reduce(
    (n, s) =>
      n +
      (s.physical?.unitSolids ??
        w.resources.find((r) => r.id === s.resource)?.mass ??
        0) *
        s.quantity,
    0,
  ) +
  w.objects
    .filter((o) => o.kind === 'short-refuge')
    .reduce(
      (n, o) =>
        n +
        ((o.data.components ?? []) as unknown as V7World['stacks']).reduce(
          (sum, s) => sum + (s.physical?.unitSolids ?? 0) * s.quantity,
          0,
        ),
      0,
    );
it('requires personal learning, measured specimens and this world scope without certifying unknown grass', () => {
  const w = shortFixture(),
    a = required(w.actors[0]);
  expect(a.mastered).toContain('short-material-refuge');
  expect(a.wellbeing.sources).toEqual([]);
  const fresh = initialOpenWorld('isolated-new');
  expect(() =>
    v7Install(fresh, continuousRegistry(w), 'short-material-refuge@1'),
  ).toThrow(/scope/);
  const r = shortStep(w, shortAction('assemble', 'unverified', [], '', true));
  expect(r.outcomes.moss?.success).toBe(false);
  expect(r.world.objects).toHaveLength(0);
});
it('pays two actual coupon stages, retains all solids and does not certify an assembly', () => {
  let w = shortFixture();
  const before = mass(w),
    loadBefore = v7Load(w, required(w.actors[0])),
    action = shortAction('test-joint', 'actual', shortTrialInputs());
  w = shortAdvance(w, action);
  const a = required(w.actors[0]);
  expect(v7Load(w, a)).toBeCloseTo(loadBefore - 1.22, 6);
  w = shortAdvance(w, action);
  expect(mass(w)).toBeCloseTo(before, 7);
  expect(
    w.events.some(
      (e) => e.type === 'short-refuge-trial' && e.data.passed === true,
    ),
  ).toBe(true);
  expect(
    w.stacks.some((s) => s.processing?.shortCoupon && s.owner === null),
  ).toBe(true);
  expect(w.objects).toHaveLength(0);
  expect(w.events.some((e) => e.type === 'satisfaction')).toBe(true);
});
it('pauses on changed action and serialization, resumes only the remaining stage and never refunds cancellation twice', () => {
  let w = shortFixture();
  w = shortAdvance(
    w,
    shortAction('test-joint', 'resume-test', shortTrialInputs()),
  );
  w = shortAdvance(w, { interface: 'rest', args: {} });
  const record = w.state['short:work:moss:resume-test'] as V7Data;
  expect(record.status).toBe('paused');
  expect(record.stage).toBe(1);
  w = shortAdvance(
    JSON.parse(JSON.stringify(w)) as V7World,
    shortAction('resume', 'resume-test'),
  );
  expect((w.state['short:work:moss:resume-test'] as V7Data).paid).toBe(1);
  expect(
    shortStep(w, shortAction('cancel', 'resume-test')).outcomes.moss?.success,
  ).toBe(false);
});
it('keeps exact IDs, shortages, duplicate allocations and consumed identities from creating stock', () => {
  const w = shortFixture(),
    before = mass(w);
  for (const rows of [
    [{ item: 'resource:dry-grass', quantityTenths: 1, role: 'binding' }],
    [...shortTrialInputs(), ...shortTrialInputs()],
    [{ item: 'missing', quantityTenths: 1, role: 'load' }],
  ]) {
    const r = shortStep(w, shortAction('test-joint', 'bad', rows));
    expect(r.outcomes.moss?.success).toBe(false);
    expect(mass(r.world)).toBe(before);
  }
});
it('assembles only real staged materials, stays unproven until actual proof and preserves passive weathering', () => {
  const frames = shortFrames(),
    partial = required(frames[2]),
    complete = required(frames[3]),
    proof = required(frames[4]),
    o = required(proof.objects.find((o) => o.kind === 'short-refuge'));
  expect(
    required(partial.objects.find((o) => o.kind === 'short-refuge')).data.stage,
  ).toBe(2);
  expect(
    required(complete.objects.find((o) => o.kind === 'short-refuge')).data
      .proven,
  ).toBe(false);
  expect(o.data.proven).toBe(true);
  expect(mass(proof)).toBeCloseTo(mass(required(frames[0])), 6);
  const w = shortAdvance(proof, { interface: 'wait', args: {} });
  expect(
    Number(required(w.objects.find((x) => x.id === o.id)).data.integrity),
  ).toBeLessThan(Number(o.data.integrity));
});
it('retains installed partial work when cancelled and releases remaining location-bound escrow once on death', () => {
  const f = shortPrepared();
  let w = shortAdvance(
    f.world,
    shortAction('assemble', 'interrupted', f.rows, '', true),
  );
  const before = mass(w);
  w = shortAdvance(w, shortAction('cancel', 'interrupted'));
  expect(mass(w)).toBeCloseTo(before);
  expect(w.objects.some((o) => o.kind === 'short-refuge')).toBe(true);
  expect(w.stacks.some((s) => s.reservedFor?.startsWith('short:work:'))).toBe(
    false,
  );
  expect(
    shortStep(w, shortAction('cancel', 'interrupted')).outcomes.moss?.success,
  ).toBe(false);
  const g = shortPrepared();
  let dying = shortAdvance(
    g.world,
    shortAction('assemble', 'death-test', g.rows, '', true),
  );
  const a = required(dying.actors[0]);
  a.position = { x: 5, y: 5 };
  a.vitals.health = 0.1;
  a.vitals.satiety = 0;
  dying = shortAdvance(dying, { interface: 'wait', args: {} });
  expect(
    dying.stacks.some((s) => s.reservedFor?.startsWith('short:work:')),
  ).toBe(false);
  expect(
    dying.stacks.some((s) => s.owner === null && s.position.y === 8.6),
  ).toBe(true);
  expect(mass(dying)).toBeCloseTo(mass(g.world), 6);
});
it('tiny finite apertures and conditional shared exposure never grant whole-body shelter outside the actual roof', () => {
  const w = required(shortFrames().at(-1)),
    o = required(w.objects.find((o) => o.kind === 'short-refuge')),
    a = required(w.actors[0]);
  expect(shortRay(o, { x: 20, y: 20 }, 0, 0)).toBe(0);
  a.position = { x: o.spatial.x, y: o.spatial.y };
  const exposed = refugeExposure(w, a);
  expect(exposed?.sunCoverage ?? 0).toBeLessThanOrEqual(1);
  expect(exposed?.bonus ?? 0).toBeLessThanOrEqual(0.4);
  o.data.proven = false;
  expect(shortRay(o, a.position, 0, 0)).toBe(0);
});

it('allows another participant to benefit from actual occupied rest without inheriting construction mastery', () => {
  const w = required(shortFrames().at(-1)),
    o = required(w.objects.find((o) => o.kind === 'short-refuge')),
    other = v7Clone(
      required(initialOpenWorld().actors.find((a) => a.id === 'lin')),
    );
  other.position = { x: o.spatial.x, y: o.spatial.y };
  other.vitals.energy = 20;
  other.vitals.temperature = 32;
  w.actors.push(other);
  expect(other.mastered).not.toContain('short-material-refuge');
  const result = v7Step(
    w,
    {
      moss: { interface: 'wait', args: {} },
      lin: { interface: 'rest', args: {} },
    },
    continuousRegistry(w),
  );
  expect(result.outcomes.lin?.success).toBe(true);
  const e = result.world.events.find(
    (e) => e.actor === 'lin' && e.type === 'shelter-rest-experience',
  );
  expect(e?.target).toBe(o.id);
  expect(Number(e?.data.removed)).toBeGreaterThan(0);
  expect(Number(e?.data.bonus)).toBeLessThanOrEqual(0.4);
});
it('does not certify absent rain and deduplicates repeated paid point-exposure evidence', () => {
  let w = required(shortFrames().at(-1));
  const o = required(w.objects.find((o) => o.kind === 'short-refuge')),
    a = required(w.actors[0]);
  a.position = { x: o.spatial.x, y: o.spatial.y };
  const action = shortAction('measure-exposure', '', [], o.id);
  w = shortAdvance(w, action);
  expect(
    w.events.find((e) => e.type === 'short-refuge-exposure')?.data.rain,
  ).toBeNull();
  expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(true);
  w = shortAdvance(w, action);
  expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(false);
});
it('rejects overweight proofs and leaves actual damaged components instead of a working shade label', () => {
  const frames = shortFrames();
  let w = required(frames[3]);
  const o = required(w.objects.find((o) => o.kind === 'short-refuge'));
  w.stacks.push({
    id: 'isolated-heavy-load',
    resource: 'stone',
    quantity: 1,
    quantityTenths: 10,
    owner: 'moss',
    origin: 'isolated-heavy-load',
    position: { x: 8, y: 8 },
    physical: { unitMass: 10000, unitWater: 0, unitSolids: 10000 },
  });
  const before = mass(w),
    action = shortAction(
      'proof-test',
      'overload',
      [{ item: 'isolated-heavy-load', quantityTenths: 10, role: 'load' }],
      o.id,
    );
  for (let i = 0; i < 2; i++) w = shortAdvance(w, action);
  const failed = required(w.objects.find((x) => x.id === o.id));
  expect(failed.data.proven).toBe(false);
  expect(failed.data.frameDamaged).toBe(true);
  expect(shortRay(failed, failed.spatial, 0, 0)).toBe(0);
  expect(mass(w)).toBeCloseTo(before, 5);
});
it('does not reserve stock or pay a partial stage when energy is insufficient', () => {
  const w = shortFixture();
  required(w.actors[0]).vitals.energy = 0;
  const before = mass(w),
    r = shortStep(w, shortAction('test-joint', 'tired', shortTrialInputs()));
  expect(r.outcomes.moss?.complete).toBe(false);
  expect(r.world.state['short:work:moss:tired']).toBeUndefined();
  expect(mass(r.world)).toBeCloseTo(before);
  expect(r.world.stacks.some((s) => s.reservedFor)).toBe(false);
});

it('requires paid replacement and two new proof stages without restoring worn unrelated components', () => {
  let w = required(shortFrames().at(-1));
  const o = required(w.objects.find((o) => o.kind === 'short-refuge')),
    before = mass(w),
    action = shortAction(
      'repair',
      'replace-cover',
      [
        { item: 'short-grass', quantityTenths: 50, role: 'cover' },
        { item: 'short-weight', quantityTenths: 1, role: 'load' },
      ],
      o.id,
    );
  for (let i = 0; i < 2; i++) w = shortAdvance(w, action);
  expect(required(w.objects.find((x) => x.id === o.id)).data.proven).toBe(
    false,
  );
  expect((w.state['short:work:moss:replace-cover'] as V7Data).stage).toBe(2);
  expect(w.stacks.some((s) => s.processing?.shortSalvage)).toBe(true);
  for (let i = 0; i < 2; i++) w = shortAdvance(w, action);
  const work = w.state['short:work:moss:replace-cover'] as V7Data;
  expect(work.status).toBe('completed');
  expect(work.stage).toBe(4);
  expect(work.paid).toBe(2);
  expect(mass(w)).toBeCloseTo(before, 6);
});
