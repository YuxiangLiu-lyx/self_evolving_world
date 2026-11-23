import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  v7Clone,
  v7Install,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type {
  V7World,
  V7Action,
  V7Data,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const id = 'prepared-surface-root-placement',
  surfaceId = 'surface-21-lin-113',
  inputId = 'item-3-lin-12';
const wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, a: V7Action) =>
  v7Step(w, { lin: a, moss: wait, sol: wait }, continuousRegistry(w));
const plant: V7Action = {
  interface: id,
  args: {
    mode: 'plant',
    preparedSurfaceId: 'object: ' + surfaceId,
    inputStackId: 'item: ' + inputId,
  },
};
function fixture(study = true) {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/prepared-placement-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  let w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), id + '@1'),
  );
  if (study) {
    const r = step(w, { interface: 'learn', args: { ability: id } });
    expect(r.outcomes.lin?.success).toBe(true);
    w = v7Clone(r.world);
  }
  return w;
}
const job = (w: V7World) =>
  w.actors[0]?.extensionState['long:work:planting'] as V7Data;
const act = (mode: string, w: V7World): V7Action => {
  const processId = job(w).id;
  if (typeof processId !== 'string')
    throw new Error('Missing exact process identity');
  return { interface: id, args: { mode, processId } };
};
const roots = (w: V7World) =>
  w.stacks
    .filter((s) => s.resource === 'root')
    .reduce((n, s) => n + s.quantity, 0);
it('reproduces the retained center-only rejection and permits the learned adapter only after a paid physical examination, conserving real matter', () => {
  expect(step(fixture(false), plant).outcomes.lin?.success).toBe(false);
  expect(
    continuousRegistry(initialLongWorld('other-run')).packages.some(
      (p) => p.id === id,
    ),
  ).toBe(false);
  let w = fixture();
  const old = step(w, {
    interface: 'soil-worksite-assessment',
    args: { mode: 'examine', x: 9.25, y: 12.9 },
  });
  expect(
    old.world.events.find((e) => e.type === 'site-examination-completed')?.data
      .compatibility,
  ).toBe('not currently eligible');
  const mass = roots(w),
    residue = w.objects.find((o) => o.kind === 'surface-residue-deposit');
  let r = step(w, plant);
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  w = v7Clone(r.world);
  expect(job(w)).toMatchObject({
    completedWork: 1,
    remainingWork: 2,
    paidEnergy: 0.5,
    preparedSurfaceId: surfaceId,
  });
  expect(w.stacks.find((s) => s.id === inputId)?.quantity).toBe(2);
  expect(w.events.some((e) => e.type === 'root-trial-planted')).toBe(false);
  w = v7Clone(step(w, { interface: 'rest', args: {} }).world);
  r = step(JSON.parse(JSON.stringify(w)) as V7World, act('resume', w));
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  w = v7Clone(r.world);
  expect(job(w)).toMatchObject({
    completedWork: 2,
    remainingWork: 1,
    paidEnergy: 1.5,
  });
  w = v7Clone(step(w, act('resume', w)).world);
  expect(job(w)).toMatchObject({
    status: 'completed',
    remainingWork: 0,
    paidEnergy: 2.5,
  });
  expect(w.events.some((e) => e.type === 'root-trial-planted')).toBe(true);
  expect(roots(w)).toBe(mass);
  expect(w.objects.find((o) => o.kind === 'surface-residue-deposit')).toEqual(
    residue,
  );
  expect(w.objects.find((o) => o.id === surfaceId)?.data.rootTrial).toBe(
    job(w).target,
  );
  expect(step(w, act('cancel', w)).outcomes.lin?.success).toBe(false);
});
it('keeps material extents and real obstructions distinct from annotations, and pauses changed clearance before charging further work', () => {
  let w = fixture();
  const surface = w.objects.find((o) => o.id === surfaceId);
  if (!surface) throw new Error('Missing actual surface');
  surface.data.coverMass = 0.01;
  let r = step(w, plant);
  expect(r.outcomes.lin?.success).toBe(true);
  expect(
    r.world.events.find((e) => e.type === 'prepared-placement-examined')?.data
      .compatibility,
  ).toBe('incompatible');
  expect(r.world.stacks.find((s) => s.id === inputId)?.quantity).toBe(3);
  expect(r.world.actors[0]?.vitals.energy).toBeCloseTo(
    (w.actors[0]?.vitals.energy ?? 0) - 0.5,
  );
  w = fixture();
  const deposit = w.objects.find((o) => o.kind === 'surface-residue-deposit');
  const portion = (deposit?.data.deposits as V7Data[])[0];
  if (!portion) throw new Error('Missing real residue');
  portion.x = 9.08;
  portion.y = 13.0;
  r = step(w, plant);
  expect(
    r.world.events.find((e) => e.type === 'prepared-placement-examined')?.data
      .compatibility,
  ).toBe('incompatible');
  expect(r.world.stacks.find((s) => s.id === inputId)?.quantity).toBe(3);
  w = fixture();
  const original = w.objects.find((o) => o.id === surfaceId);
  if (!original) throw new Error('Missing source');
  const blocker = v7Clone(original);
  blocker.id = 'fixture-physical-obstacle';
  blocker.revision = 'foundation-forest@1';
  blocker.spatial = {
    ...blocker.spatial,
    x: 9.08,
    y: 13,
    solid: true,
    shape: { kind: 'circle', radius: 0.04 },
  };
  w.objects.push(blocker);
  r = step(w, plant);
  expect(
    r.world.events.find((e) => e.type === 'prepared-placement-examined')?.data
      .compatibility,
  ).toBe('incompatible');
  expect(r.world.stacks.find((s) => s.id === inputId)?.quantity).toBe(3);
  w = v7Clone(step(fixture(), plant).world);
  const s = w.objects.find((o) => o.id === surfaceId);
  if (!s) throw new Error('Missing source');
  s.data.coverMass = 0.01;
  r = step(w, act('resume', w));
  expect(r.outcomes.lin?.success).toBe(true);
  expect(job(r.world)).toMatchObject({
    status: 'paused',
    paidEnergy: 0.5,
    remainingWork: 2,
  });
  expect(r.world.actors[0]?.vitals.energy).toBe(w.actors[0]?.vitals.energy);
  const clear = v7Clone(r.world);
  const cs = clear.objects.find((o) => o.id === surfaceId);
  if (cs) cs.data.coverMass = 0;
  expect(step(clear, act('resume', clear)).outcomes.lin?.success).toBe(true);
});
it('settles surviving root once at the actual worksite on remote cancel or death and never replaces spoiled escrow', () => {
  for (const mode of ['cancel', 'death', 'spoil']) {
    let w = v7Clone(step(fixture(), plant).world);
    const total = roots(w),
      a = w.actors[0],
      j = job(w);
    if (!a) throw new Error('Missing actor');
    if (mode === 'cancel') {
      a.position = { x: 5, y: 6 };
      w = v7Clone(step(w, act('cancel', w)).world);
    }
    if (mode === 'death') {
      a.vitals.health = 0.1;
      a.vitals.satiety = 0;
      w = v7Clone(step(w, wait).world);
    }
    if (mode === 'spoil') {
      const e = w.stacks.find((s) => s.reservedFor === j.id);
      if (!e) throw new Error('Missing escrow');
      e.decay = 10000;
      w = v7Clone(step(w, act('resume', w)).world);
    }
    expect(job(w)).toMatchObject({ status: 'stopped', paidEnergy: 0.5 });
    expect(
      w.objects.find((o) => o.id === surfaceId)?.data.activeWork,
    ).toBeNull();
    expect(w.objects.some((o) => o.id === j.target)).toBe(false);
    expect(w.stacks.some((s) => s.reservedFor === j.id)).toBe(false);
    if (mode !== 'spoil') {
      expect(roots(w)).toBe(total);
      const e = w.stacks.find((s) => s.id === (j.escrow as string[])[0]);
      expect(e).toMatchObject({
        owner: null,
        position: { x: 9.25, y: 12.9 },
        quantity: 1,
      });
    } else expect(roots(w)).toBeLessThan(total);
    expect(step(w, act('cancel', w)).outcomes.lin?.success).toBe(false);
  }
});
