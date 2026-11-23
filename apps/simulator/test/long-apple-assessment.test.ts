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
const ID = 'bounded-unfamiliar-food-assessment',
  ITEM = 'item-125-sol-735';
const wait: V7Action = { interface: 'wait', args: {} },
  act = (refs: V7Data = {}): V7Action => ({
    interface: ID,
    args: { specimenId: ITEM, ...refs },
  }),
  step = (w: V7World, a: V7Action) =>
    v7Step(w, { lin: wait, moss: wait, sol: a }, continuousRegistry(w));
const person = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'sol');
  if (!a) throw Error('Missing actor');
  return a;
};
const item = (w: V7World) => {
  const s = w.stacks.find((s) => s.id === ITEM);
  if (!s) throw Error('Missing apple');
  return s;
};
function fixture() {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/apple-assessment-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  const w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  expect(w.stacks).toEqual(raw.world.stacks);
  expect(w.objects).toEqual(raw.world.objects);
  expect(w.actors).toEqual(raw.world.actors);
  expect(step(w, act()).outcomes.sol?.success).toBe(false);
  return v7Clone(step(w, { interface: 'learn', args: { ability: ID } }).world);
}
const reports = (w: V7World) =>
  Object.values(person(w).memory.knowledge ?? {}).filter((k) =>
    k.key.startsWith('apple-assessment:'),
  );
it('performs a single paid conserved observation with explicit unavailable facts, no safety claim or reward, and retained dated reassessments', () => {
  const w = fixture(),
    r = step(w, act());
  expect(r.outcomes.sol?.success, r.outcomes.sol?.reason).toBe(true);
  expect(person(r.world).vitals.energy).toBeCloseTo(
    person(w).vitals.energy - 0.2,
  );
  expect(item(r.world)).toMatchObject({
    id: ITEM,
    quantity: 1,
    owner: 'sol',
    position: item(w).position,
  });
  expect(item(r.world).decay).toBeGreaterThan(item(w).decay ?? 0);
  expect(item(r.world).processing).toBeUndefined();
  expect(r.world.objects.map((o) => [o.id, o.data.stock])).toEqual(
    w.objects.map((o) => [o.id, o.data.stock]),
  );
  expect(reports(r.world)).toHaveLength(1);
  const report = reports(r.world)[0];
  expect(report?.verified).toBe(false);
  expect(report?.value).toMatchObject({
    materialConsumed: 0,
    paidEnergy: 0.2,
    novelInformation: false,
    supportedPreparation: { status: 'unestablished' },
  });
  expect(JSON.stringify(report?.value)).not.toContain('1.36461198');
  expect(JSON.stringify(report?.value)).toContain('geometry');
  expect(
    r.world.events.some(
      (e) =>
        e.actor === 'sol' &&
        [
          'information-confirmed',
          'satisfaction',
          'practice-confirmed',
          'trial-material-consumed',
          'ate',
        ].includes(e.type),
    ),
  ).toBe(false);
  const repeated = step(v7Clone(r.world), act());
  expect(reports(repeated.world)).toHaveLength(2);
  expect(reports(repeated.world)[0]).toEqual(report);
  expect(step(JSON.parse(JSON.stringify(w)) as V7World, act()).world).toEqual(
    r.world,
  );
  expect(
    continuousRegistry(initialLongWorld('other')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
});
it('uses only exact complete personal evidence, preserves uncertainty and keeps detailed records private', () => {
  const w = fixture(),
    a = person(w);
  a.memory.knowledge ??= {};
  a.memory.knowledge['own-evidence'] = {
    key: 'own-evidence',
    subject: ITEM,
    property: 'private-property-fixture',
    value: { note: 'private-note-fixture' },
    method: 'fixture',
    condition: 'fixture only',
    verified: false,
    evidence: 'actual-fixture-event',
    tick: w.tick,
  };
  a.memory.knowledge['partial'] = {
    ...a.memory.knowledge['own-evidence'],
    key: 'partial',
    value: { encoding: 'paged-json', fragment: 'incomplete' },
  };
  const other = w.actors.find((a) => a.id === 'lin');
  if (!other) throw Error('Missing other actor');
  other.memory.knowledge ??= {};
  other.memory.knowledge['other-private'] = {
    ...a.memory.knowledge['own-evidence'],
    key: 'other-private',
    value: { hidden: 'unshared-fixture' },
  };
  const r = step(
    w,
    act({
      evidenceRefs: ['own-evidence', 'partial', 'other-private', 'missing'],
    }),
  );
  expect(r.outcomes.sol?.success).toBe(true);
  const text = JSON.stringify(reports(r.world));
  expect(text).toContain('private-property-fixture');
  expect(text).not.toContain('private-note-fixture');
  expect(text).not.toContain('unshared-fixture');
  expect(text).toContain('No complete dated personally retained');
  expect(JSON.stringify(r.world.events)).not.toContain('private-note-fixture');
  expect(
    r.world.actors.find((a) => a.id === 'lin')?.memory.knowledge,
  ).not.toHaveProperty(reports(r.world)[0]?.key ?? 'missing');
});
it('fails invalid ownership, reservations, partial or changed specimen, insufficient energy and forbidden operations before a paid finding', () => {
  for (const mutate of [
    (w: V7World) => {
      item(w).owner = 'lin';
    },
    (w: V7World) => {
      item(w).reservedFor = 'another-process';
    },
    (w: V7World) => {
      item(w).quantity = 0.5;
    },
    (w: V7World) => {
      item(w).processing = { changed: true };
    },
    (w: V7World) => {
      person(w).vitals.energy = 0;
    },
  ]) {
    const w = fixture();
    mutate(w);
    const r = step(w, act());
    expect(r.outcomes.sol?.success).toBe(false);
    expect(reports(r.world)).toHaveLength(0);
    expect(person(r.world).vitals.energy).toBeCloseTo(person(w).vitals.energy);
  }
  const w = fixture();
  expect(step(w, act({ mode: 'sample' })).outcomes.sol?.success).toBe(false);
  expect(
    item(step(w, act({ specimenId: 'item: ' + ITEM })).world).quantity,
  ).toBe(1);
});
