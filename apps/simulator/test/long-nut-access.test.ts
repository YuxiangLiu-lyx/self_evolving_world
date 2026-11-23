import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7World,
  V7Data,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const ID = 'source-bound-opened-hazelnut-access-trial',
  ITEM = 'item-141-lin-821',
  TOOL = 'item-131-lin-766',
  SUPPORT = 'start-0-stone';
const wait: V7Action = { interface: 'wait', args: {} },
  action = (mode: string, args: V7Data = {}): V7Action => ({
    interface: ID,
    args: { mode, ...args },
  });
const step = (w: V7World, a: V7Action) =>
  v7Step(w, { lin: a, moss: wait, sol: wait }, continuousRegistry(w));
const actor = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'lin');
  if (!a) throw Error('Missing actor');
  return a;
};
const item = (w: V7World, id = ITEM) => {
  const s = w.stacks.find((s) => s.id === id);
  if (!s) throw Error('Missing actual item');
  return s;
};
const job = (w: V7World) => {
  const j = Object.values(w.state).find(
    (v) => v && typeof v === 'object' && !Array.isArray(v) && v.ability === ID,
  ) as V7Data | undefined;
  if (!j) throw Error('Missing work');
  return j;
};
const assess = action('assess', {
  specimenId: 'item:' + ITEM,
  actuatorRef: TOOL,
  supportRef: 'object:' + SUPPORT,
  evidenceRefs: [],
});
function setup() {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/nut-access-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  let w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  expect(w.stacks).toEqual(raw.world.stacks);
  expect(w.actors).toEqual(raw.world.actors);
  expect(w.objects).toEqual(raw.world.objects);
  expect(step(w, assess).outcomes.lin?.success).toBe(false);
  w = v7Clone(step(w, { interface: 'learn', args: { ability: ID } }).world);
  w = v7Clone(step(w, wait).world);
  // Isolated positioning only; this route is never supplied to a formal participant.
  actor(w).position = { x: 5.62, y: 8.5 };
  return w;
}
function prepared() {
  const w = setup(),
    r = step(w, assess);
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  const e = r.world.events.find((e) => e.type === 'nut-access-assessed');
  if (!e) throw Error('Missing paid quote');
  return {
    w: v7Clone(r.world),
    begin: action('begin', { assessmentId: e.data.assessmentId ?? null }),
  };
}
it('requires individual learning and actual tools, positions conserved matter, records private coarse geometry without leaking the model', () => {
  const w = setup(),
    r = step(w, assess);
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  expect(actor(r.world).vitals.energy).toBeCloseTo(
    actor(w).vitals.energy - 0.5,
  );
  for (const id of [ITEM, TOOL]) {
    expect(item(r.world, id)).toMatchObject({
      quantity: 1,
      owner: null,
      processing: item(w, id).processing,
    });
    expect(item(r.world, id).position).not.toEqual(item(w, id).position);
  }
  expect(r.world.stacks).toHaveLength(w.stacks.length);
  expect(r.world.state['long:nut:contact']).toEqual(
    w.state['long:nut:contact'],
  );
  expect(JSON.stringify(r.world.events)).not.toContain('aperture');
  expect(
    Object.values(actor(r.world).memory.knowledge ?? {}).some(
      (k) => k.property === 'source-specific clearance',
    ),
  ).toBe(true);
  expect(
    continuousRegistry(initialLongWorld('other')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
});
it('preserves exact paid work, locks, unchanged opening history and material across pause, restoration and two actual contact rounds', () => {
  const { w, begin } = prepared(),
    r = step(w, begin);
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  expect(job(r.world)).toMatchObject({
    completedWork: 1,
    remainingWork: 1,
    paidEnergy: 0.5,
  });
  expect(item(r.world).reservedFor).toBe(job(r.world).id);
  const c = r.world.events.find((e) => e.type === 'nut-access-contact');
  expect(c?.data.actuatorTravel).toBe(0.02);
  expect(item(r.world, TOOL).position.x).toBeCloseTo(
    item(w, TOOL).position.x - 0.02,
  );
  const lost = v7Clone(r.world);
  actor(lost).position = { x: 9, y: 11 };
  const resume = action('resume', { processId: job(lost).id ?? null }),
    paused = step(lost, resume);
  expect(job(paused.world)).toMatchObject({
    status: 'paused',
    completedWork: 1,
    paidEnergy: 0.5,
  });
  const restored = JSON.parse(JSON.stringify(paused.world)) as V7World;
  actor(restored).position = { x: 5.62, y: 8.5 };
  const done = step(restored, resume);
  expect(job(done.world)).toMatchObject({
    status: 'completed',
    completedWork: 2,
    remainingWork: 0,
    paidEnergy: 1,
    elasticDisplacement: 0,
  });
  expect(item(done.world)).toMatchObject({
    owner: null,
    quantity: 1,
    processing: item(w).processing,
  });
  expect(item(done.world).reservedFor).toBeUndefined();
  expect(item(done.world, TOOL).reservedFor).toBeUndefined();
  expect(done.world.stacks).toHaveLength(w.stacks.length);
  expect(done.world.state['long:nut:contact']).toEqual(
    w.state['long:nut:contact'],
  );
  expect(
    done.world.events.some(
      (e) => e.actor === 'lin' && e.type === 'information-confirmed',
    ),
  ).toBe(false);
  expect(step(done.world, resume).outcomes.lin?.success).toBe(false);
  expect(item(done.world).decay).toBeGreaterThan(item(w).decay ?? 0);
});
it('invalidates changed quotes, ownership and unavailable receivers before payment, and cancellation/death release once without remote refunds', () => {
  for (const change of [
    (w: V7World) => {
      item(w).owner = 'moss';
    },
    (w: V7World) => {
      item(w, TOOL).processing = { method: 'changed' };
    },
    (w: V7World) => {
      actor(w).vitals.energy = 0.4;
    },
  ]) {
    const w = setup();
    change(w);
    const r = step(w, assess);
    expect(r.outcomes.lin?.success).toBe(false);
    expect(actor(r.world).vitals.energy).toBe(actor(w).vitals.energy);
  }
  const f = prepared();
  item(f.w, TOOL).position.x += 0.1;
  expect(step(f.w, f.begin).outcomes.lin?.success).toBe(false);
  const w = setup();
  expect(
    step(
      w,
      action('assess', { ...assess.args, receiverRef: 'imaginary-container' }),
    ).outcomes.lin?.success,
  ).toBe(false);
  for (const death of [false, true]) {
    const f = prepared(),
      r = step(f.w, f.begin),
      before = item(r.world).position;
    let done: V7World;
    if (death) {
      const d = v7Clone(r.world);
      actor(d).vitals.health = 0.1;
      actor(d).vitals.satiety = 0;
      done = step(d, wait).world;
      expect(actor(done).life?.deaths).toBeGreaterThan(
        actor(r.world).life?.deaths ?? 0,
      );
    } else {
      done = step(
        r.world,
        action('cancel', { processId: job(r.world).id ?? null }),
      ).world;
      expect(
        step(done, action('cancel', { processId: job(done).id ?? null }))
          .outcomes.lin?.success,
      ).toBe(false);
    }
    expect(job(done)).toMatchObject({
      status: 'stopped',
      completedWork: 1,
      paidEnergy: 0.5,
    });
    expect(item(done)).toMatchObject({
      owner: null,
      position: before,
      quantity: 1,
    });
    expect(item(done).reservedFor).toBeUndefined();
    expect(item(done, TOOL).reservedFor).toBeUndefined();
  }
});
