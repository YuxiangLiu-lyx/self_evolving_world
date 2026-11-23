import { expect, it } from 'vitest';
import {
  v7Clone,
  v7Install,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const id = 'small-soil-patch-preparation';
const wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, a: V7Action, actor = 'lin') =>
  v7Step(
    w,
    { lin: wait, moss: wait, sol: wait, [actor]: a },
    continuousRegistry(w),
  );
const start: V7Action = {
  interface: id,
  args: { mode: 'start', x: 9.25, y: 12.9 },
};
const resume: V7Action = { interface: id, args: { mode: 'resume' } };
function fixture() {
  let w = v7Clone(initialLongWorld('long-ex13'));
  for (const p of [
    'root-planting-trial@1',
    'soil-worksite-assessment@1',
    id + '@1',
  ])
    w = v7Clone(v7Install(w, continuousRegistry(w), p));
  const a = w.actors[0];
  if (!a) throw new Error('Missing actor');
  a.position = { x: 8.61283558, y: 12.79372563 };
  return w;
}
const surface = (w: V7World) =>
  w.objects.find((o) => o.kind === 'prepared-surface');
it('conserves finite cover through interrupted paid work and never calls in-footprint residue bare ground', () => {
  let w = fixture();
  expect(step(w, start).outcomes.lin?.success).toBe(false);
  w = v7Clone(step(w, { interface: 'learn', args: { ability: id } }).world);
  const before = v7Clone(w);
  w = v7Clone(step(w, start).world);
  expect(surface(w)?.data).toMatchObject({
    coverMass: 0.04,
    residueMass: 0,
    exposedArea: 0,
  });
  expect(w.actors[0]?.vitals.energy).toBeCloseTo(
    (before.actors[0]?.vitals.energy ?? 0) - 0.5,
  );
  w = v7Clone(step(w, resume).world);
  const partial = structuredClone(surface(w)?.data);
  w = v7Clone(step(w, wait).world);
  expect(surface(w)?.data).toEqual(partial);
  const restored = JSON.parse(JSON.stringify(w)) as V7World;
  w = v7Clone(step(restored, resume).world);
  expect(surface(w)?.data).toMatchObject({
    initialCoverMass: 0.04,
    coverMass: 0,
    residueMass: 0.04,
    activeWork: null,
    outcome: 'partial',
  });
  expect(w.stacks).toEqual(before.stacks);
  expect(w.terrain).toEqual(before.terrain);
  expect(
    w.events.find((e) => e.type === 'surface-preparation-ended')?.data,
  ).toMatchObject({ rootCompatible: false, paidEnergy: 2.5 });
  const old = structuredClone(surface(w)?.data);
  w = v7Clone(step(w, start).world);
  expect(surface(w)?.data).toEqual(old);
  expect(
    w.events.find((e) => e.type === 'surface-preparation-ended')?.data.outcome,
  ).toBe('blocked');
  expect(
    w.events.some((e) =>
      ['information-confirmed', 'practice-confirmed', 'satisfaction'].includes(
        e.type,
      ),
    ),
  ).toBe(false);
});
it('holds one physical lock, requires individual learning and preserves displacement on cancellation and death', () => {
  let w = fixture();
  w = v7Clone(step(w, { interface: 'learn', args: { ability: id } }).world);
  w = v7Clone(step(w, start).world);
  w = v7Clone(step(w, resume).world);
  const other = w.actors.find((a) => a.id === 'moss');
  if (!other) throw new Error('Missing actor');
  other.position = { x: 9.8, y: 12.9 };
  expect(step(w, start, 'moss').outcomes.moss?.success).toBe(false);
  w = v7Clone(
    step(w, { interface: 'learn', args: { ability: id } }, 'moss').world,
  );
  expect(step(w, start, 'moss').outcomes.moss?.success).toBe(false);
  const cover = surface(w)?.data.coverMass,
    residue = surface(w)?.data.residueMass;
  w = v7Clone(step(w, { interface: id, args: { mode: 'cancel' } }).world);
  expect(surface(w)?.data).toMatchObject({
    coverMass: cover,
    residueMass: residue,
    activeWork: null,
    outcome: 'cancelled',
  });
  expect(step(w, start, 'moss').outcomes.moss?.success).toBe(true);
  w = v7Clone(step(w, start).world);
  const a = w.actors[0];
  if (!a) throw new Error('Missing actor');
  a.vitals.health = 0.1;
  a.vitals.satiety = 0;
  w = v7Clone(step(w, wait).world);
  expect(surface(w)?.data).toMatchObject({
    coverMass: cover,
    residueMass: residue,
    activeWork: null,
  });
  expect(
    continuousRegistry(initialLongWorld('fresh-other')).packages.some(
      (p) => p.id === id,
    ),
  ).toBe(false);
});
