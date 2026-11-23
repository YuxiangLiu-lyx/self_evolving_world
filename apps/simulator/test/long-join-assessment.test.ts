import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
  v7Distance,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const ID = 'recoverable-vine-joining-assessment',
  wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, a: V7Action) =>
  v7Step(w, { lin: a, moss: wait, sol: wait }, continuousRegistry(w));
function actor(w: V7World) {
  const a = w.actors.find((a) => a.id === 'lin');
  if (!a) throw new Error('Missing actor');
  return a;
}
function fixture() {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/join-assessment-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  let w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  const source = w.objects.find((o) => o.id === 'start-0-branches');
  if (!source) throw new Error('Missing actual source');
  actor(w).position = { x: source.spatial.x - 0.75, y: source.spatial.y };
  const gathered = step(w, {
    interface: 'gather',
    args: { target: source.id, quantity: 2 },
  });
  expect(gathered.outcomes.lin?.success, gathered.outcomes.lin?.reason).toBe(
    true,
  );
  w = v7Clone(gathered.world);
  const branch = w.stacks.find(
    (s) => s.owner === 'lin' && s.resource === 'branch' && s.quantity === 2,
  );
  if (!branch) throw new Error('Missing actually gathered units');
  let point: { x: number; y: number } | null = null;
  for (let y = 3; y < 30 && !point; y++)
    for (let x = 3; x < 44 && !point; x++) {
      const p = { x: x + 0.5, y: y + 0.5 };
      if (
        !['~', '=', ',', ':'].includes(w.terrain[y]?.[x] ?? '~') &&
        w.objects.every((o) => v7Distance(o.spatial, p) > 2) &&
        w.actors
          .filter((a) => a.id !== 'lin')
          .every((a) => v7Distance(a.position, p) > 2)
      )
        point = p;
    }
  if (!point) throw new Error('No isolated test patch');
  actor(w).position = { x: point.x - 0.6, y: point.y };
  const begin: V7Action = {
    interface: ID,
    args: {
      mode: 'begin',
      vineStackId: 'item-66-lin-388',
      branchStackIdA: branch.id,
      branchStackIdB: branch.id,
      ...point,
    },
  };
  return { w, begin, branch: branch.id };
}
function learned(w: V7World) {
  const first = step(w, { interface: 'learn', args: { ability: ID } });
  expect(actor(first.world).mastered).not.toContain(ID);
  const second = step(v7Clone(first.world), wait);
  expect(actor(second.world).mastered).toContain(ID);
  return v7Clone(second.world);
}
it('executes only the disclosed assessment precursor after real gathering and personal study without cutting, joining or rewarding inputs', () => {
  const f = fixture();
  expect(step(f.w, f.begin).outcomes.lin?.success).toBe(false);
  expect(
    continuousRegistry(initialLongWorld('fresh-other')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
  const w = learned(f.w),
    energy = actor(w).vitals.energy;
  const r = step(w, f.begin);
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  expect(actor(r.world).vitals.energy).toBeCloseTo(energy - 0.5);
  expect(
    r.world.stacks.map((s) => [s.id, s.quantity, s.owner, s.reservedFor]),
  ).toEqual(w.stacks.map((s) => [s.id, s.quantity, s.owner, s.reservedFor]));
  expect(r.world.objects.map((o) => o.id)).toEqual(w.objects.map((o) => o.id));
  const event = r.world.events.find((e) => e.type === 'join-geometry-assessed');
  expect(event?.data).toMatchObject({
    physicalComponents: 0,
    materialMoved: 0,
    stage: 'geometry-unresolved',
  });
  expect(
    r.world.events.some(
      (e) =>
        e.tick === r.world.tick &&
        e.actor === 'lin' &&
        ['satisfaction', 'practice-confirmed'].includes(e.type),
    ),
  ).toBe(false);
  expect(step(JSON.parse(JSON.stringify(w)) as V7World, f.begin).world).toEqual(
    r.world,
  );
  const trialId = event?.data.trialId;
  if (typeof trialId !== 'string')
    throw new Error('Missing actual trial identity');
  const key = 'join-assessment:' + trialId;
  expect(actor(r.world).memory.knowledge?.[key]).toBeDefined();
  expect(
    r.world.actors.find((a) => a.id === 'moss')?.memory.knowledge?.[key],
  ).toBeUndefined();
  const inspected = step(v7Clone(r.world), {
    interface: ID,
    args: { mode: 'inspect', trialId: event?.data.trialId ?? '' },
  });
  expect(inspected.outcomes.lin?.success).toBe(true);
  expect(actor(inspected.world).vitals.energy).toBeCloseTo(energy - 0.7);
});
it('refuses missing quantity, fabricated or foreign identities and unsupported force/recovery before charging', () => {
  const f = fixture(),
    w = learned(f.w),
    energy = actor(w).vitals.energy;
  for (const args of [
    { ...f.begin.args, branchStackIdB: 'missing' },
    { ...f.begin.args, vineStackId: 'item-16-sol-76' },
    { mode: 'separate', trialId: 'missing' },
    { mode: 'recover', trialId: 'missing' },
  ]) {
    const r = step(w, { interface: ID, args });
    expect(r.outcomes.lin?.success).toBe(false);
    expect(actor(r.world).vitals.energy).toBe(energy);
  }
  const branch = w.stacks.find((s) => s.id === f.branch);
  if (!branch) throw new Error('Missing branch');
  branch.quantity = 1;
  branch.quantityTenths = 10;
  const r = step(w, f.begin);
  expect(r.outcomes.lin?.success).toBe(false);
  expect(actor(r.world).vitals.energy).toBe(energy);
});
