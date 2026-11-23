import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7World,
  V7Action,
  V7Data,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const ID = 'moss-source-bound-hazelnut-interior-access-trial',
  ITEM = 'item-140-moss-811',
  SUPPORT = 'start-2-stone';
const wait: V7Action = { interface: 'wait', args: {} },
  action = (mode: string, args: V7Data = {}): V7Action => ({
    interface: ID,
    args: { mode, ...args },
  });
const step = (w: V7World, a: V7Action) =>
  v7Step(w, { lin: wait, moss: a, sol: wait }, continuousRegistry(w));
const actor = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'moss');
  if (!a) throw Error('Missing actor');
  return a;
};
const item = (w: V7World, id = ITEM) => {
  const s = w.stacks.find((s) => s.id === id);
  if (!s) throw Error('Missing item');
  return s;
};
const job = (w: V7World) => {
  const j = Object.values(w.state).find(
    (v) => v && typeof v === 'object' && !Array.isArray(v) && v.ability === ID,
  ) as V7Data | undefined;
  if (!j) throw Error('Missing job');
  return j;
};
function setup() {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/moss-opening-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  let w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  expect(w.actors).toEqual(raw.world.actors);
  expect(w.stacks).toEqual(raw.world.stacks);
  expect(w.objects).toEqual(raw.world.objects);
  expect(
    step(w, action('assess', { specimenId: ITEM })).outcomes.moss?.success,
  ).toBe(false);
  w = v7Clone(step(w, { interface: 'learn', args: { ability: ID } }).world);
  return v7Clone(step(w, wait).world);
}
function prepared() {
  let w = setup();
  // Offline fixture position, not a supplied formal route or free inventory.
  actor(w).position = { x: 11.7, y: 20.5 };
  const got = step(w, {
    interface: 'gather',
    args: { target: SUPPORT, quantity: 1 },
  });
  expect(got.outcomes.moss?.success, got.outcomes.moss?.reason).toBe(true);
  w = v7Clone(got.world);
  const tool = w.stacks.find(
    (s) => s.owner === 'moss' && s.resource === 'stone',
  );
  if (!tool) throw Error('No actually gathered tool');
  const r = step(
    w,
    action('assess', {
      specimenId: ITEM,
      toolId: tool.id,
      supportId: SUPPORT,
      evidenceRefs: ['forest-exterior:forest-examination-159-moss-918'],
    }),
  );
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  const e = r.world.events.find((e) => e.type === 'nut-opening-assessed');
  if (!e) throw Error('No quote');
  expect(e.data.executable).toBe(true);
  return {
    w: v7Clone(r.world),
    tool: tool.id,
    begin: action('begin', {
      assessmentId: e.data.assessmentId ?? null,
      specimenId: ITEM,
      toolId: tool.id,
      supportId: SUPPORT,
    }),
  };
}
it('reuses code without copying Lin state or stock and allows paid prerequisite assessment while tools remain unacquired', () => {
  const w = setup(),
    r = step(w, action('assess', { specimenId: ITEM }));
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  expect(
    r.world.events.find((e) => e.type === 'nut-opening-assessed')?.data
      .executable,
  ).toBe(false);
  expect(actor(r.world).vitals.energy).toBeCloseTo(
    actor(w).vitals.energy - 0.5,
  );
  expect(item(r.world)).toMatchObject({
    quantity: 1,
    owner: 'moss',
    position: item(w).position,
  });
  expect(item(r.world).processing).toBeUndefined();
  expect(r.world.stacks).toHaveLength(w.stacks.length);
  expect(r.world.state['long:nut:contact']).toEqual(
    w.state['long:nut:contact'],
  );
  expect(r.world.state['long:forest-nut:contact']).toMatchObject({
    contacts: 0,
    fractions: {},
  });
  expect(
    r.world.events.some(
      (e) => e.actor === 'moss' && e.type === 'information-confirmed',
    ),
  ).toBe(false);
  expect(
    continuousRegistry(initialLongWorld('unrelated')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
});
it('retains actual independent response, grounded tool, source conservation and private inspection through resumed paid contacts', () => {
  const f = prepared(),
    r = step(f.w, f.begin);
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  expect(job(r.world)).toMatchObject({
    completedWork: 1,
    paidEnergy: 1,
    remainingWork: 1,
  });
  expect(item(r.world, f.tool)).toMatchObject({
    owner: null,
    reservedFor: job(r.world).id,
  });
  const lost = v7Clone(r.world);
  actor(lost).position = { x: 14, y: 16 };
  const resume = action('resume', { processId: job(lost).id ?? null }),
    pause = step(lost, resume);
  expect(job(pause.world)).toMatchObject({
    status: 'paused',
    completedWork: 1,
    paidEnergy: 1,
  });
  const restore = JSON.parse(JSON.stringify(pause.world)) as V7World;
  actor(restore).position = { x: 11.7, y: 20.5 };
  const done = step(restore, resume);
  expect(done.outcomes.moss?.success, done.outcomes.moss?.reason).toBe(true);
  expect(job(done.world)).toMatchObject({
    status: 'completed',
    completedWork: 2,
    paidEnergy: 2,
  });
  expect(item(done.world)).toMatchObject({
    owner: null,
    quantity: 1,
    processing: { contacts: 2, exposed: true, interiorObserved: false },
  });
  expect(item(done.world).processing?.sourceFractions).toBeUndefined();
  expect(item(done.world, f.tool).processing?.blunting).toBe(0.004);
  expect(item(done.world, f.tool).reservedFor).toBeUndefined();
  expect(done.world.stacks).toHaveLength(f.w.stacks.length);
  const inspected = step(
    done.world,
    action('inspect', { processId: job(done.world).id ?? null }),
  );
  expect(
    inspected.outcomes.moss?.success,
    inspected.outcomes.moss?.reason,
  ).toBe(true);
  expect(item(inspected.world).processing?.interiorObserved).toBe(true);
  expect(
    inspected.world.events.some(
      (e) => e.actor === 'moss' && e.type === 'information-confirmed',
    ),
  ).toBe(true);
  const again = step(
    inspected.world,
    action('inspect', { processId: job(inspected.world).id ?? null }),
  );
  expect(again.outcomes.moss?.success, again.outcomes.moss?.reason).toBe(true);
  expect(
    again.world.events.some(
      (e) => e.actor === 'moss' && e.type === 'information-confirmed',
    ),
  ).toBe(false);
  expect(done.world.state['long:nut:contact']).toEqual(
    f.w.state['long:nut:contact'],
  );
});
it('requires exact quoted inputs and preserves actual damage and ground custody after cancellation', () => {
  const f = prepared();
  expect(
    step(
      f.w,
      action('begin', {
        assessmentId: f.begin.args.assessmentId ?? null,
        specimenId: ITEM,
      }),
    ).outcomes.moss?.success,
  ).toBe(false);
  const r = step(f.w, f.begin),
    cancel = action('cancel', { processId: job(r.world).id ?? null }),
    done = step(r.world, cancel);
  expect(job(done.world)).toMatchObject({
    status: 'stopped',
    completedWork: 1,
    paidEnergy: 1,
  });
  expect(item(done.world)).toMatchObject({
    owner: null,
    quantity: 1,
    processing: item(r.world).processing,
  });
  expect(item(done.world, f.tool).owner).toBe(null);
  expect(item(done.world).reservedFor).toBeUndefined();
  expect(step(done.world, cancel).outcomes.moss?.success).toBe(false);
});
