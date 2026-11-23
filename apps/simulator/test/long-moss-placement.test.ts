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
const ID = 'moss-prepared-root-placement',
  SURFACE = 'surface-38-moss-234',
  wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, a: V7Action) =>
  v7Step(w, { lin: wait, moss: a, sol: wait }, continuousRegistry(w));
function actor(w: V7World) {
  const a = w.actors.find((a) => a.id === 'moss');
  if (!a) throw new Error('Missing actor');
  return a;
}
const job = (w: V7World) =>
  actor(w).extensionState['long:work:planting'] as V7Data;
const act = (w: V7World, mode: string): V7Action => ({
  interface: ID,
  args: { mode, processId: job(w).id ?? '' },
});
const roots = (w: V7World) =>
  w.stacks
    .filter((s) => s.resource === 'root')
    .reduce((n, s) => n + s.quantity, 0);
function fixture(study = true) {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/moss-placement-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  let w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  if (study)
    w = v7Clone(step(w, { interface: 'learn', args: { ability: ID } }).world);
  return w;
}
function supplied() {
  let w = fixture();
  const position = { ...actor(w).position };
  actor(w).position = { x: 20.1, y: 14.6 };
  const r = step(w, {
    interface: 'gather',
    args: { target: 'start-1-roots', quantity: 1 },
  });
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  w = v7Clone(r.world);
  actor(w).position = position;
  const input = w.stacks.find(
    (s) => s.owner === 'moss' && s.resource === 'root',
  );
  if (!input) throw new Error('Missing gathered root');
  const plant: V7Action = {
    interface: ID,
    args: { mode: 'plant', preparedSurfaceId: SURFACE, inputStackId: input.id },
  };
  return { w, plant };
}
const examine: V7Action = {
  interface: ID,
  args: { mode: 'examine', preparedSurfaceId: SURFACE },
};
it('requires scope and study, supports a root-free live examination and refuses absent input before charging', () => {
  expect(step(fixture(false), examine).outcomes.moss?.success).toBe(false);
  expect(
    continuousRegistry(initialLongWorld('other')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
  const w = fixture(),
    energy = actor(w).vitals.energy;
  const r = step(w, examine);
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  expect(
    r.world.events.find((e) => e.type === 'prepared-placement-examined')?.data
      .compatibility,
  ).toBe('currently clear for the bounded placement precursor');
  expect(actor(r.world).vitals.energy).toBeCloseTo(energy - 0.5);
  const failed = step(w, {
    ...examine,
    args: { ...examine.args, mode: 'plant' },
  });
  expect(failed.outcomes.moss?.success).toBe(false);
  expect(actor(failed.world).vitals.energy).toBe(energy);
  const source = w.objects.find((o) => o.id === SURFACE);
  if (!source) throw new Error('Missing surface');
  source.data.exposedArea = 0;
  const unsupported = step(w, examine);
  expect(
    unsupported.world.events.find(
      (e) => e.type === 'prepared-placement-examined',
    )?.data,
  ).toMatchObject({ compatibility: 'incompatible' });
  expect(JSON.stringify(unsupported.world.events)).toContain(
    'No supported exposed soil case',
  );
});
it('reuses conserved paid planting after actual gathering with exact resume, live obstruction and serialization', () => {
  const f = supplied();
  let w = f.w;
  const total = roots(w),
    deposit = v7Clone(
      w.objects.find((o) => o.id === 'residue-deposit-49-moss-298'),
    );
  let r = step(w, f.plant);
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  w = v7Clone(r.world);
  expect(job(w)).toMatchObject({
    completedWork: 1,
    remainingWork: 2,
    paidEnergy: 0.5,
  });
  const source = w.objects.find((o) => o.id === SURFACE);
  if (!source) throw new Error('Missing source');
  source.data.exposedArea = 0;
  const energy = actor(w).vitals.energy;
  r = step(w, act(w, 'resume'));
  expect(job(r.world)).toMatchObject({ status: 'paused', paidEnergy: 0.5 });
  expect(actor(r.world).vitals.energy).toBe(energy);
  w = v7Clone(r.world);
  const live = w.objects.find((o) => o.id === SURFACE);
  if (!live) throw new Error('Missing source');
  live.data.exposedArea = 0.12566371;
  w = v7Clone(
    step(JSON.parse(JSON.stringify(w)) as V7World, act(w, 'resume')).world,
  );
  w = v7Clone(step(w, act(w, 'resume')).world);
  expect(job(w)).toMatchObject({
    status: 'completed',
    paidEnergy: 2.5,
    completedWork: 3,
    remainingWork: 0,
  });
  expect(roots(w)).toBe(total);
  expect(w.objects.find((o) => o.id === job(w).target)?.data).toMatchObject({
    stage: 'planted-unverified',
    preparedSurfaceId: SURFACE,
  });
  expect(w.objects.find((o) => o.id === 'residue-deposit-49-moss-298')).toEqual(
    deposit,
  );
  expect(step(w, act(w, 'cancel')).outcomes.moss?.success).toBe(false);
});
it('releases surviving escrow only once on actual worksite ground after cancel or death', () => {
  for (const mode of ['cancel', 'death']) {
    const f = supplied();
    let w = v7Clone(step(f.w, f.plant).world);
    const total = roots(w),
      j = job(w);
    if (mode === 'cancel') {
      actor(w).position = { x: 5, y: 6 };
      w = v7Clone(step(w, act(w, 'cancel')).world);
    } else {
      actor(w).vitals.health = 0.1;
      actor(w).vitals.satiety = 0;
      w = v7Clone(step(w, wait).world);
    }
    expect(job(w)).toMatchObject({ status: 'stopped', paidEnergy: 0.5 });
    expect(roots(w)).toBe(total);
    expect(
      w.stacks.find((s) => s.id === (j.escrow as string[])[0]),
    ).toMatchObject({ owner: null, quantity: 1, position: { x: 14, y: 12.5 } });
    expect(step(w, act(w, 'cancel')).outcomes.moss?.success).toBe(false);
  }
});
