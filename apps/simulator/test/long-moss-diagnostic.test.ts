import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  v7Clone,
  v7Install,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const ID = 'moss-prepared-surface-diagnostic',
  SOURCE = 'surface-38-moss-234',
  DEPOSIT = 'residue-deposit-49-moss-298';
const wait: V7Action = { interface: 'wait', args: {} };
const examine: V7Action = {
  interface: ID,
  args: { preparedSurfaceId: SOURCE },
};
const step = (w: V7World, a = examine) =>
  v7Step(w, { lin: wait, moss: a, sol: wait }, continuousRegistry(w));
const person = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'moss');
  if (!a) throw new Error('Missing fixture actor');
  return a;
};
const surface = (w: V7World) => {
  const s = w.objects.find((o) => o.id === SOURCE);
  if (!s) throw new Error('Missing fixture surface');
  return s;
};
function fixture(learned = true) {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/moss-diagnostic-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  let w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  if (learned)
    w = v7Clone(step(w, { interface: 'learn', args: { ability: ID } }).world);
  return w;
}
it('reproduces the real prepared-surface ambiguity with paid private evidence, individual learning and no material or planting grant', () => {
  let w = fixture(false);
  expect(step(w).outcomes.moss?.success).toBe(false);
  expect(
    continuousRegistry(initialLongWorld('independent')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
  const initial = person(w).vitals.energy;
  w = v7Clone(step(w, { interface: 'learn', args: { ability: ID } }).world);
  expect(person(w).vitals.energy).toBeCloseTo(initial - 0.2);
  expect(person(w).mastered).toContain(ID);
  const matter = w.objects.filter((o) => [SOURCE, DEPOSIT].includes(o.id)),
    energy = person(w).vitals.energy;
  const r = step(w),
    report = r.world.events.find(
      (e) => e.type === 'prepared-surface-diagnosed',
    );
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  expect(report?.data).toMatchObject({
    physicalClearance: 'no obstruction observed',
    paidEnergy: 0.5,
    qualified: false,
    material: { cover: 0, residue: 0, deposit: 0.04, initial: 0.04 },
    implementationSupport: { ordinaryEligible: false },
  });
  expect(JSON.stringify(report?.data)).toContain('bound to Lin');
  expect(person(r.world).vitals.energy).toBeCloseTo(energy - 0.5);
  expect(
    r.world.objects.filter((o) => [SOURCE, DEPOSIT].includes(o.id)),
  ).toEqual(matter);
  expect(
    r.world.stacks.map((s) => [s.id, s.quantity, s.owner, s.reservedFor]),
  ).toEqual(w.stacks.map((s) => [s.id, s.quantity, s.owner, s.reservedFor]));
  const key = 'prepared-diagnostic:' + SOURCE;
  expect(person(r.world).memory.knowledge?.[key]).toBeDefined();
  expect(
    r.world.actors.find((a) => a.id === 'lin')?.memory.knowledge?.[key],
  ).toBeUndefined();
  expect(
    r.world.events.filter(
      (e) =>
        e.tick === r.world.tick &&
        e.actor === 'moss' &&
        [
          'root-trial-planted',
          'information-confirmed',
          'satisfaction',
        ].includes(e.type),
    ),
  ).toEqual([]);
  expect(step(JSON.parse(JSON.stringify(w)) as V7World).world).toEqual(r.world);
  const repeated = step(v7Clone(r.world));
  expect(person(repeated.world).vitals.energy).toBeCloseTo(energy - 1);
  expect(
    repeated.world.events.some(
      (e) =>
        e.tick === repeated.world.tick &&
        e.actor === 'moss' &&
        ['information-confirmed', 'satisfaction'].includes(e.type),
    ),
  ).toBe(false);
});
it('reports actual visible body obstruction and incomplete conserved evidence without inferring missing matter', () => {
  let w = fixture();
  person(w).position = { x: 14, y: 12.5 };
  let r = step(w);
  expect(
    r.world.events.find((e) => e.type === 'prepared-surface-diagnosed')?.data,
  ).toMatchObject({
    physicalClearance: 'observed obstruction',
    obstructions: [{ ref: 'moss', footprint: true }],
  });
  w = fixture();
  delete surface(w).data.residues;
  r = step(w);
  expect(r.outcomes.moss?.success).toBe(true);
  expect(
    r.world.events.find((e) => e.type === 'prepared-surface-diagnosed')?.data,
  ).toMatchObject({ physicalClearance: 'inconclusive', material: null });
  expect(surface(r.world).data.residues).toBeUndefined();
  w = fixture();
  w.objects.push({
    ...v7Clone(surface(w)),
    id: 'fixture-unclassified-annotation',
  });
  r = step(w);
  expect(
    r.world.events.find((e) => e.type === 'prepared-surface-diagnosed')?.data,
  ).toMatchObject({
    physicalClearance: 'inconclusive',
    obstructions: [],
    unclassifiedNearbyGeometry: [{ ref: 'fixture-unclassified-annotation' }],
  });
});
it('rejects wrong references, insufficient energy, inaccessible targets and unsupported planting without charging', () => {
  for (const kind of ['reference', 'energy', 'access', 'plant']) {
    const w = fixture();
    if (kind === 'energy') person(w).vitals.energy = 0.49;
    if (kind === 'access') person(w).position = { x: 15.5, y: 12.5 };
    const energy = person(w).vitals.energy;
    const action =
      kind === 'reference'
        ? { ...examine, args: { preparedSurfaceId: 'surface-34-sol-201' } }
        : kind === 'plant'
          ? { ...examine, args: { preparedSurfaceId: SOURCE, mode: 'plant' } }
          : examine;
    const r = step(w, action);
    expect(r.outcomes.moss?.success, kind).toBe(false);
    expect(person(r.world).vitals.energy, kind).toBe(energy);
    expect(
      r.world.events.some((e) => e.type === 'prepared-surface-diagnosed'),
    ).toBe(false);
  }
});
