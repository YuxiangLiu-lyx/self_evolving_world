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
  V7Object,
  V7Action,
  V7Data,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const id = 'moss-surface-residue-transfer',
  sourceId = 'surface-38-moss-234',
  wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, a: V7Action) =>
  v7Step(w, { lin: wait, moss: a, sol: wait }, continuousRegistry(w));
const start: V7Action = {
  interface: id,
  args: { mode: 'start', sourceId, destinationX: 14.4, destinationY: 12.5 },
};
function fixture() {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/prepared-placement-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  const saved = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/moss-residue-fixture.json',
      'utf8',
    ),
  ) as { object: V7Object };
  let w = v7Clone(raw.world);
  for (const revision of ['sol-surface-residue-transfer@1', id + '@1'])
    w = v7Clone(v7Install(w, continuousRegistry(w), revision));
  w.objects.push(saved.object);
  const actor = w.actors.find((a) => a.id === 'moss');
  if (!actor) throw new Error('Missing actor');
  actor.position = { x: 14, y: 12 };
  return w;
}
it('adds only the reviewed Moss/source binding, with actual personal study and the same conserved paid transfer', () => {
  let w = fixture();
  expect(step(w, start).outcomes.moss?.success).toBe(false);
  expect(
    continuousRegistry(initialLongWorld('other-run')).packages.some(
      (p) => p.id === id,
    ),
  ).toBe(false);
  const sources = v7Clone(
    w.objects.filter((o) =>
      ['surface-21-lin-113', 'surface-34-sol-201'].includes(o.id),
    ),
  );
  w = v7Clone(step(w, { interface: 'learn', args: { ability: id } }).world);
  let r = step(w, start);
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  w = v7Clone(r.world);
  const j = w.actors.find((a) => a.id === 'moss')?.extensionState[
    'long:work:residue'
  ] as V7Data;
  if (typeof j.id !== 'string') throw new Error('Missing processId');
  expect(j).toMatchObject({ remainingWork: 2, paidEnergy: 0.5 });
  const resume: V7Action = {
    interface: id,
    args: { mode: 'resume', processId: j.id },
  };
  r = step(w, resume);
  expect(r.outcomes.moss?.success).toBe(true);
  w = v7Clone(
    step(JSON.parse(JSON.stringify(r.world)) as V7World, resume).world,
  );
  expect(w.objects.find((o) => o.id === sourceId)?.data.residueMass).toBe(0);
  expect(w.objects.find((o) => o.revision === id + '@1')?.data.mass).toBe(0.04);
  expect(
    w.actors.find((a) => a.id === 'moss')?.extensionState['long:last-residue'],
  ).toMatchObject({ status: 'completed', paidEnergy: 2.5, movedUnits: 4 });
  expect(
    w.objects.filter((o) =>
      ['surface-21-lin-113', 'surface-34-sol-201'].includes(o.id),
    ),
  ).toEqual(sources);
  expect(w.events.some((e) => e.type === 'satisfaction')).toBe(false);
});
it('rejects unsupported source provenance without charging or resetting live material', () => {
  let w = fixture();
  w = v7Clone(step(w, { interface: 'learn', args: { ability: id } }).world);
  const source = w.objects.find((o) => o.id === sourceId);
  if (!source) throw new Error('Missing source');
  source.data.source = 'unsupported-fixture-provenance';
  const r = step(w, start);
  expect(r.outcomes.moss?.success).toBe(false);
  expect(r.world.actors.find((a) => a.id === 'moss')?.vitals.energy).toBe(
    w.actors.find((a) => a.id === 'moss')?.vitals.energy,
  );
  expect(r.world.objects.find((o) => o.id === sourceId)?.data.residueMass).toBe(
    0.04,
  );
});
