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
const ID = 'owned-hazelnut-assessment',
  ITEM = 'item-119-lin-699',
  KEY = ITEM + ':visible-exterior';
const wait: V7Action = { interface: 'wait', args: {} },
  examine: V7Action = { interface: ID, args: { specimenId: ITEM } };
const step = (w: V7World, action: V7Action) =>
  v7Step(w, { lin: action, moss: wait, sol: wait }, continuousRegistry(w));
const actor = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'lin');
  if (!a) throw new Error('Missing actor');
  return a;
};
const item = (w: V7World) => {
  const s = w.stacks.find((s) => s.id === ITEM);
  if (!s) throw new Error('Missing specimen');
  return s;
};
function fixture() {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/nut-examination-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  const w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  expect(w.stacks).toEqual(raw.world.stacks);
  expect(w.objects).toEqual(raw.world.objects);
  expect(w.actors).toEqual(raw.world.actors);
  expect(step(w, examine).outcomes.lin?.success).toBe(false);
  expect(JSON.stringify(w.abilities)).not.toContain('fine visible ridges');
  expect(JSON.stringify(w.abilities)).not.toContain('ovoid');
  return v7Clone(step(w, { interface: 'learn', args: { ability: ID } }).world);
}
it('performs a paid nondestructive local exterior examination with private evidence and only existing bounded information feedback', () => {
  const w = fixture(),
    energy = actor(w).vitals.energy,
    r = step(w, examine);
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  expect(
    continuousRegistry(initialLongWorld('other')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
  expect(actor(r.world).vitals.energy).toBeCloseTo(energy - 0.2);
  expect(item(r.world)).toMatchObject({
    id: ITEM,
    quantity: 1,
    owner: 'lin',
    origin: item(w).origin,
    position: item(w).position,
  });
  expect(item(r.world).reservedFor).toBeUndefined();
  expect(item(r.world).decay).toBeGreaterThan(item(w).decay ?? 0);
  expect(r.world.objects.map((o) => o.id)).toEqual(w.objects.map((o) => o.id));
  const finding = actor(r.world).memory.knowledge?.[KEY];
  expect(finding?.value).toMatchObject({
    materialConsumed: 0,
    findings: {
      shape: 'ovoid',
      visibleOpenings: [],
      resolution: 0.02,
      uncertainty: 0.01,
    },
  });
  expect(JSON.stringify(finding?.value)).not.toContain('nutrition');
  expect(JSON.stringify(finding?.value)).not.toContain('"decay"');
  expect(
    r.world.events.filter(
      (e) => e.actor === 'lin' && e.type === 'information-confirmed',
    ),
  ).toHaveLength(1);
  expect(
    r.world.events.some((e) => e.actor === 'lin' && e.type === 'satisfaction'),
  ).toBe(true);
  expect(
    JSON.stringify(r.world.events.filter((e) => e.actor === 'lin')),
  ).not.toContain('fine visible ridges');
  expect(
    r.world.actors.find((a) => a.id === 'moss')?.memory.knowledge?.[KEY],
  ).toBeUndefined();
  const repeated = step(v7Clone(r.world), examine);
  expect(repeated.outcomes.lin?.success).toBe(true);
  expect(
    repeated.world.events.some(
      (e) =>
        e.actor === 'lin' &&
        [
          'information-confirmed',
          'satisfaction',
          'practice-confirmed',
        ].includes(e.type),
    ),
  ).toBe(false);
  expect(step(JSON.parse(JSON.stringify(w)) as V7World, examine).world).toEqual(
    r.world,
  );
});
it('deduplicates equivalent observed facts and never rerolls or rewards unavailable or restored old exterior', () => {
  const w = fixture(),
    first = step(w, examine),
    known = actor(first.world).memory.knowledge?.[KEY];
  if (!known) throw new Error('Missing real observation');
  const equivalent = v7Clone(w);
  const personal = actor(equivalent);
  personal.memory.knowledge ??= {};
  personal.memory.knowledge['fixture-equivalent-probe'] = {
    ...v7Clone(known),
    key: 'fixture-equivalent-probe',
    method: 'isolated equivalent observation fixture',
  };
  const repeated = step(equivalent, examine);
  expect(
    repeated.world.events.some(
      (e) => e.actor === 'lin' && e.type === 'information-confirmed',
    ),
  ).toBe(false);
  const changed = v7Clone(first.world);
  item(changed).processing = { isolatedAlteration: true };
  const unknown = step(changed, examine);
  expect(unknown.outcomes.lin?.success).toBe(true);
  expect(actor(unknown.world).memory.knowledge?.[KEY]?.verified).toBe(false);
  expect(
    unknown.world.events.some(
      (e) => e.actor === 'lin' && e.type === 'information-confirmed',
    ),
  ).toBe(false);
  const restored = v7Clone(unknown.world);
  delete item(restored).processing;
  expect(
    step(restored, examine).world.events.some(
      (e) => e.actor === 'lin' && e.type === 'information-confirmed',
    ),
  ).toBe(false);
  const noRule = v7Clone(w);
  noRule.satisfaction = noRule.satisfaction.filter(
    (r) => r.id !== 'grounded-understanding',
  );
  expect(
    step(noRule, examine).world.events.some(
      (e) => e.actor === 'lin' && e.type === 'satisfaction',
    ),
  ).toBe(false);
});
it('rejects unavailable, reserved, foreign, unaffordable and destructive operations before examination payment', () => {
  const w = fixture();
  for (const change of [
    (x: V7World) => {
      item(x).owner = 'moss';
    },
    (x: V7World) => {
      item(x).reservedFor = 'another-operation';
    },
    (x: V7World) => {
      item(x).quantity = 0;
      item(x).quantityTenths = 0;
    },
    (x: V7World) => {
      actor(x).vitals.energy = 0.1;
    },
  ]) {
    const changed = v7Clone(w);
    change(changed);
    const energy = actor(changed).vitals.energy;
    const r = step(changed, examine);
    expect(r.outcomes.lin?.success).toBe(false);
    expect(actor(r.world).vitals.energy).toBe(energy);
    expect(
      r.world.events.some((e) => e.type === 'specimen-examination-completed'),
    ).toBe(false);
  }
  expect(
    step(w, { interface: ID, args: { specimenId: ITEM, mode: 'open' } })
      .outcomes.lin?.success,
  ).toBe(false);
  expect(
    step(w, { interface: ID, args: { specimenId: 'item:' + ITEM } }).outcomes
      .lin?.success,
  ).toBe(true);
});
