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
const ID = 'moss-exposed-hazelnut-assessment-and-recovery',
  ITEM = 'item-140-moss-811',
  TOOL = 'item-171-moss-994',
  SUPPORT = 'start-2-stone',
  PROCESS = 'manual-178-moss-1044';
const wait: V7Action = { interface: 'wait', args: {} },
  action = (mode: string, args: V7Data = {}): V7Action => ({
    interface: ID,
    args: { mode, processId: PROCESS, ...args },
  });
const assess = action('assess', {
  specimenId: 'item:' + ITEM,
  toolId: TOOL,
  supportId: SUPPORT,
  evidenceRefs: ['nut-opening:' + PROCESS],
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
  if (!s) throw Error('Missing actual item');
  return s;
};
const job = (w: V7World) => w.state['collective:work:' + PROCESS] as V7Data;
function fixture() {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/moss-recovery-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  const w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  expect(w.actors).toEqual(raw.world.actors);
  expect(w.stacks).toEqual(raw.world.stacks);
  expect(w.objects).toEqual(raw.world.objects);
  expect(item(w).reservedFor).toBeUndefined();
  expect(item(w, TOOL).reservedFor).toBeUndefined();
  expect(step(w, assess).outcomes.moss?.success).toBe(false);
  return v7Clone(step(w, { interface: 'learn', args: { ability: ID } }).world);
}
it('reproduces the already released actual state, reports lawful local recovery without moving matter, and requires separate paid pickup', () => {
  const w = fixture(),
    r = step(w, assess);
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  expect(actor(r.world).vitals.energy).toBeCloseTo(
    actor(w).vitals.energy - 0.5,
  );
  expect(item(r.world)).toMatchObject({
    owner: null,
    quantity: 1,
    position: item(w).position,
    processing: item(w).processing,
  });
  expect(item(r.world, TOOL)).toEqual(item(w, TOOL));
  const k = Object.values(actor(r.world).memory.knowledge ?? {}).find((k) =>
    k.key.startsWith('recovery:'),
  );
  expect(k?.value).toMatchObject({
    process: { status: 'completed', remainingLocks: 0, paidContacts: 2 },
    separation: { status: 'unresolved' },
    novelInformation: false,
  });
  expect(
    r.world.events.some(
      (e) => e.actor === 'moss' && e.type === 'information-confirmed',
    ),
  ).toBe(false);
  const a = step(r.world, action('release')),
    b = step(a.world, action('release'));
  for (const x of [a, b])
    expect(
      x.world.events.find((e) => e.type === 'nut-opening-released')?.data
        .releasedLocks,
    ).toBe(0);
  expect(actor(b.world).vitals.energy).toBe(actor(r.world).vitals.energy);
  const picked = step(b.world, {
    interface: 'pickup',
    args: { target: ITEM, quantity: 1 },
  });
  expect(picked.outcomes.moss?.success, picked.outcomes.moss?.reason).toBe(
    true,
  );
  expect(picked.world.stacks.some((s) => s.id === ITEM)).toBe(false);
  expect(
    picked.world.stacks.find(
      (s) => s.owner === 'moss' && s.origin === 'forest-hazelnut-1',
    ),
  ).toMatchObject({ quantity: 1, processing: item(w).processing });
  expect(picked.world.state['long:forest-nut:contact']).toEqual(
    w.state['long:forest-nut:contact'],
  );
  expect(
    continuousRegistry(initialLongWorld('other')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
});
it('observes only its own process-held inputs without unlocking and delegates idempotent settled cleanup to the original ledger', () => {
  const w = fixture(),
    o = w.objects.find((o) => o.id === SUPPORT);
  if (!o) throw Error('Missing support');
  // Isolated leftover-lock fixture, not an observed formal defect.
  item(w).reservedFor = PROCESS;
  item(w, TOOL).reservedFor = PROCESS;
  o.spatial.reserved = true;
  o.data.nutContactLock = PROCESS;
  const r = step(w, assess);
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  expect(item(r.world).reservedFor).toBe(PROCESS);
  const released = step(
    JSON.parse(JSON.stringify(r.world)) as V7World,
    action('release'),
  );
  expect(
    released.world.events.find((e) => e.type === 'nut-opening-released')?.data
      .releasedLocks,
  ).toBe(3);
  expect(item(released.world).reservedFor).toBeUndefined();
  expect(item(released.world, TOOL).reservedFor).toBeUndefined();
  expect(job(released.world)).toMatchObject({
    status: 'completed',
    completedWork: 2,
    paidEnergy: 2,
  });
  expect(item(released.world).processing).toEqual(item(w).processing);
  expect(
    step(released.world, action('release')).world.events.find(
      (e) => e.type === 'nut-opening-released',
    )?.data.releasedLocks,
  ).toBe(0);
});
it('rejects absent, remote, foreign-locked or wrong-source inputs before charging and does not release another process lock', () => {
  for (const change of [
    (w: V7World) => {
      actor(w).position = { x: 14, y: 16 };
    },
    (w: V7World) => {
      item(w).reservedFor = 'unrelated';
    },
    (w: V7World) => {
      item(w).origin = 'changed';
    },
    (w: V7World) => {
      actor(w).vitals.energy = 0.4;
    },
  ]) {
    const w = fixture();
    change(w);
    const r = step(w, assess);
    expect(r.outcomes.moss?.success).toBe(false);
    expect(actor(r.world).vitals.energy).toBe(actor(w).vitals.energy);
  }
  const w = fixture();
  item(w).reservedFor = 'unrelated';
  const r = step(w, action('release'));
  expect(item(r.world).reservedFor).toBe('unrelated');
});
