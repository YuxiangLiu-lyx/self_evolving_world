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
  V7Data,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const ID = 'moss-conserved-hazelnut-separation-trial',
  ITEM = 'item-184-moss-1091',
  TOOL = 'item-185-moss-1097';
const wait: V7Action = { interface: 'wait', args: {} };
const act = (args: V7Data = {}): V7Action => ({
  interface: ID,
  args: { mode: 'assess', specimenId: ITEM, actuatorRef: TOOL, ...args },
});
const step = (w: V7World, a: V7Action) =>
  v7Step(w, { lin: wait, moss: a, sol: wait }, continuousRegistry(w));
const person = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'moss');
  if (!a) throw Error('Missing Moss');
  return a;
};
const item = (w: V7World, id = ITEM) => {
  const s = w.stacks.find((s) => s.id === id);
  if (!s) throw Error('Missing input');
  return s;
};
const reports = (w: V7World) =>
  Object.values(person(w).memory.knowledge ?? {}).filter((k) =>
    k.key.startsWith('separation:'),
  );
function fixture() {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/moss-separation-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  const w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  expect(w.stacks).toEqual(raw.world.stacks);
  expect(w.objects).toEqual(raw.world.objects);
  expect(w.actors).toEqual(raw.world.actors);
  expect(step(w, act()).outcomes.moss?.success).toBe(false);
  const learning = step(w, { interface: 'learn', args: { ability: ID } });
  expect(person(learning.world).learning?.remaining).toBe(1);
  return v7Clone(step(learning.world, wait).world);
}
it('measures only real exposed clearance after actual personal study, conserves the assembly and records no executable separation or product', () => {
  const w = fixture(),
    before = step(w, wait).world,
    r = step(w, act());
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  expect(r.world.stacks).toEqual(before.stacks);
  expect(r.world.objects).toEqual(before.objects);
  expect(person(r.world).vitals.energy).toBeCloseTo(
    person(w).vitals.energy - 0.5,
  );
  expect(reports(r.world)).toHaveLength(1);
  expect(reports(r.world)[0]?.value).toMatchObject({
    observedState: {
      aperture: 0.02,
      actuatorDiameter: 0.12,
      resolution: 0.02,
      uncertainty: 0.01,
      clearance: 'blocked',
    },
    quote: null,
    allocations: { parent: 1, detached: 0, residue: 0, loss: 0 },
    wear: 0,
    contactAttempts: 0,
  });
  expect(r.world.state['long:forest-nut:contact']).toEqual(
    w.state['long:forest-nut:contact'],
  );
  expect(r.world.state['long:forest-nut:separation']).toEqual(
    w.state['long:forest-nut:separation'],
  );
  expect(
    r.world.events.filter((e) => e.type === 'information-confirmed'),
  ).toHaveLength(1);
  const repeat = step(r.world, act());
  expect(reports(repeat.world)).toHaveLength(2);
  expect(
    repeat.world.events.filter((e) => e.type === 'information-confirmed'),
  ).toHaveLength(0);
  expect(step(JSON.parse(JSON.stringify(w)) as V7World, act()).world).toEqual(
    r.world,
  );
  expect(
    continuousRegistry(initialLongWorld('independent')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
});
it('does not invent contact work, locks, resets, refunds or rewards from repeated control modes and missing rules', () => {
  const w = fixture(),
    r = step(w, act()),
    report = reports(r.world)[0];
  const assessmentId = report?.key.slice('separation:'.length);
  for (const mode of ['begin', 'resume']) {
    const result = step(r.world, {
      interface: ID,
      args: { mode, assessmentId: assessmentId ?? '', processId: 'invented' },
    });
    expect(result.outcomes.moss?.success).toBe(false);
    expect(person(result.world).vitals.energy).toBe(
      person(r.world).vitals.energy,
    );
    expect(result.world.stacks).toEqual(step(r.world, wait).world.stacks);
    expect(
      result.world.events.some((e) => e.type === 'separation-contact'),
    ).toBe(false);
  }
  const cancel = (s: V7World) =>
    step(s, {
      interface: ID,
      args: { mode: 'cancel', assessmentId: assessmentId ?? '' },
    });
  const cancelled = cancel(r.world),
    again = cancel(cancelled.world);
  expect(cancelled.outcomes.moss?.success).toBe(true);
  expect(again.outcomes.moss?.success).toBe(true);
  expect(person(again.world).vitals.energy).toBe(person(r.world).vitals.energy);
  expect(again.world.stacks.map((s) => [s.id, s.reservedFor])).toEqual(
    step(step(step(w, wait).world, wait).world, wait).world.stacks.map((s) => [
      s.id,
      s.reservedFor,
    ]),
  );
  expect(again.world.state['long:forest-nut:contact']).toEqual(
    w.state['long:forest-nut:contact'],
  );
  w.satisfaction = w.satisfaction.filter(
    (s) => s.id !== 'grounded-understanding',
  );
  const noRule = step(w, act());
  expect(noRule.outcomes.moss?.success).toBe(true);
  expect(
    noRule.world.events.some((e) =>
      ['information-confirmed', 'satisfaction'].includes(e.type),
    ),
  ).toBe(false);
});
it('enforces current provenance, ownership, unchanged condition and personal evidence without granting other people findings', () => {
  for (const mutate of [
    (w: V7World) => {
      item(w).owner = 'sol';
    },
    (w: V7World) => {
      item(w).reservedFor = 'foreign';
    },
    (w: V7World) => {
      item(w).quantity = 0.8;
    },
    (w: V7World) => {
      item(w).origin = 'other';
    },
    (w: V7World) => {
      item(w, TOOL).owner = null;
    },
    (w: V7World) => {
      item(w, TOOL).processing = { diameter: 0.01 };
    },
    (w: V7World) => {
      person(w).vitals.energy = 0;
    },
  ]) {
    const w = fixture();
    mutate(w);
    const r = step(w, act());
    expect(r.outcomes.moss?.success).toBe(false);
    expect(reports(r.world)).toHaveLength(0);
    expect(person(r.world).vitals.energy).toBe(person(w).vitals.energy);
  }
  const w = fixture(),
    r = step(
      w,
      act({
        evidenceRefs: [
          'nut-opening:manual-178-moss-1044',
          'unknown',
          'apple-assessment:apple-assessment-127-sol-745',
        ],
      }),
    );
  expect(r.outcomes.moss?.success).toBe(true);
  const text = JSON.stringify(reports(r.world));
  expect(text).toContain('event-180-moss-1060');
  expect(text).toContain('No complete dated personally retained');
  expect(text).not.toContain('forest-apple-2');
  expect(
    r.world.actors.find((a) => a.id === 'sol')?.memory.knowledge,
  ).not.toHaveProperty(reports(r.world)[0]?.key ?? 'missing');
});
