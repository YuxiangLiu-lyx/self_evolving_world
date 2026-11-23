import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const ID = 'joining-trial-state-reconciliation',
  ARRANGEMENT = 'loose-wrap-88-lin-523';
const wait: V7Action = { interface: 'wait', args: {} };
const review: V7Action = {
  interface: ID,
  args: {
    mode: 'review',
    trialId: 'manual-88-lin-522',
    claimedArrangementId: ARRANGEMENT,
    vineStackId: 'item-66-lin-388',
    branchStackId: 'item-76-lin-448',
  },
};
const step = (w: V7World, a: V7Action) =>
  v7Step(w, { lin: a, moss: wait, sol: wait }, continuousRegistry(w));
const actor = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'lin');
  if (!a) throw new Error('Missing actor');
  return a;
};
function fixture() {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/join-reconciliation-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  const w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  expect(step(w, review).outcomes.lin?.success).toBe(false);
  return v7Clone(step(w, { interface: 'learn', args: { ability: ID } }).world);
}
function report(w: V7World) {
  const entry = Object.values(actor(w).memory.knowledge ?? {}).find((k) =>
    k.key.startsWith('joining-reconciliation:'),
  );
  if (
    !entry ||
    !entry.value ||
    typeof entry.value !== 'object' ||
    Array.isArray(entry.value)
  )
    throw new Error('Missing actual personal report');
  return entry;
}
const matter = (w: V7World) =>
  w.stacks.filter((s) => ['item-66-lin-388', 'item-76-lin-448'].includes(s.id));
it('reconciles full own evidence without restoring a recovered object or interpreting a completed marker as active labor', () => {
  const w = fixture(),
    energy = actor(w).vitals.energy,
    old = v7Clone(w.state['collective:work:manual-88-lin-522']);
  expect(
    continuousRegistry(initialLongWorld('separate')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
  const r = step(w, review);
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  expect(actor(r.world).vitals.energy).toBeCloseTo(energy - 0.2);
  expect(matter(r.world)).toEqual(matter(w));
  expect(r.world.state['collective:work:manual-88-lin-522']).toEqual(old);
  expect(r.world.objects.some((o) => o.id === ARRANGEMENT)).toBe(false);
  const record = report(r.world);
  expect(record.value).toMatchObject({
    trial: { status: 'completed', active: false, remainingWork: 0 },
    arrangement: { physicalNonexistenceProven: false, location: null },
    supportedOperations: [],
  });
  expect(JSON.stringify(record.value)).toContain('event-91-lin-544');
  expect(JSON.stringify(record.value)).toContain(
    'not complete target/quantity',
  );
  expect(
    r.world.actors.find((a) => a.id === 'moss')?.memory.knowledge?.[record.key],
  ).toBeUndefined();
  expect(
    r.world.events.some(
      (e) =>
        e.actor === 'lin' &&
        [
          'satisfaction',
          'information-confirmed',
          'practice-confirmed',
        ].includes(e.type),
    ),
  ).toBe(false);
  expect(step(JSON.parse(JSON.stringify(w)) as V7World, review).world).toEqual(
    r.world,
  );
  const verify: V7Action = {
    interface: ID,
    args: {
      mode: 'verify',
      processId: record.subject,
      target: 'item-66-lin-388',
    },
  };
  const seen = step(v7Clone(r.world), verify);
  expect(seen.outcomes.lin?.success).toBe(true);
  expect(actor(seen.world).vitals.energy).toBeCloseTo(energy - 0.4);
  expect(matter(seen.world)).toEqual(matter(w));
  expect(report(seen.world).value).toMatchObject({
    verification: {
      quantity: 0.9,
      ownership: 'lin',
      exclusiveWithinAccessibleRepresentation: true,
    },
  });
  expect(step(v7Clone(seen.world), verify).outcomes.lin?.success).toBe(false);
});
it('keeps inaccessible object locations and absent recovery payloads unresolved, and rejects invalid or unaffordable stages before charge', () => {
  const w = fixture(),
    template = w.objects[0];
  if (!template) throw new Error('Missing geometry fixture');
  w.objects.push({
    ...v7Clone(template),
    id: ARRANGEMENT,
    spatial: { ...v7Clone(template.spatial), x: 43, y: 31 },
  });
  actor(w).memory.important = (actor(w).memory.important ?? []).filter(
    (e) => e.type !== 'joining-recovered',
  );
  const r = step(w, review),
    record = report(r.world);
  expect(JSON.stringify(record.value)).not.toContain('"x":43');
  expect(record.value).toMatchObject({
    arrangement: { location: null, physicalNonexistenceProven: false },
  });
  expect(JSON.stringify(record.value)).not.toContain('event-91-lin-544');
  const fail = step(v7Clone(r.world), {
    interface: ID,
    args: { mode: 'verify', processId: record.subject, target: ARRANGEMENT },
  });
  expect(fail.outcomes.lin?.success).toBe(false);
  expect(actor(fail.world).vitals.energy).toBe(actor(r.world).vitals.energy);
  expect(
    step(w, { ...review, args: { ...review.args, trialId: 'someone-else' } })
      .outcomes.lin?.success,
  ).toBe(false);
  const tired = v7Clone(w);
  actor(tired).vitals.energy = 0.1;
  expect(step(tired, review).outcomes.lin?.success).toBe(false);
});
it('cancels or closes optional verification on death while retaining paid reports and original physical history', () => {
  const w = fixture(),
    r = step(w, review),
    record = report(r.world),
    original = v7Clone(r.world.state['collective:work:manual-88-lin-522']);
  const cancel: V7Action = {
    interface: ID,
    args: { mode: 'cancel', processId: record.subject },
  };
  const stopped = step(v7Clone(r.world), cancel);
  expect(stopped.outcomes.lin?.success).toBe(true);
  expect(matter(stopped.world)).toEqual(matter(r.world));
  expect(report(stopped.world).evidence).toBe(record.evidence);
  const verify: V7Action = {
    interface: ID,
    args: {
      mode: 'resume',
      processId: record.subject,
      target: 'item-66-lin-388',
    },
  };
  expect(step(v7Clone(stopped.world), verify).outcomes.lin?.success).toBe(
    false,
  );
  const dead = v7Clone(r.world);
  actor(dead).vitals.health = 0.1;
  actor(dead).vitals.satiety = 0;
  const died = step(dead, wait);
  expect(
    died.world.events.some((e) => e.type === 'died' && e.actor === 'lin'),
  ).toBe(true);
  expect(died.world.state['collective:work:manual-88-lin-522']).toEqual(
    original,
  );
  expect(report(died.world).value).toMatchObject({
    verification: 'cancelled on death; historical paid report retained',
  });
});
