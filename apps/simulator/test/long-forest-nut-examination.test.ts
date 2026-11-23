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
const ID = 'moss-source-bound-hazelnut-physical-examination',
  ITEM = 'item-140-moss-811',
  wait: V7Action = { interface: 'wait', args: {} },
  examine: V7Action = {
    interface: ID,
    args: {
      specimenId: ITEM,
      evidenceRefs: ['moss-food-assessment:moss-food-assessment-146-moss-844'],
    },
  },
  step = (w: V7World, a: V7Action) =>
    v7Step(w, { lin: wait, moss: a, sol: wait }, continuousRegistry(w));
const actor = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'moss');
  if (!a) throw Error('Missing actor');
  return a;
};
const item = (w: V7World) => {
  const s = w.stacks.find((s) => s.id === ITEM);
  if (!s) throw Error('Missing source');
  return s;
};
const reports = (w: V7World) =>
  Object.values(actor(w).memory.knowledge ?? {}).filter((k) =>
    k.key.startsWith('forest-exterior:'),
  );
function fixture() {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/forest-nut-examination-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  const w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  expect(w.stacks).toEqual(raw.world.stacks);
  expect(w.actors).toEqual(raw.world.actors);
  expect(w.objects).toEqual(raw.world.objects);
  expect(w.state['long:nut:exterior']).toEqual(
    raw.world.state['long:nut:exterior'],
  );
  expect(JSON.stringify(w.abilities.find((a) => a.id === ID))).not.toContain(
    'fine visible ridges',
  );
  expect(step(w, examine).outcomes.moss?.success).toBe(false);
  return v7Clone(step(w, { interface: 'learn', args: { ability: ID } }).world);
}
it('binds new modeled exterior assumptions to the real forest source and reveals them only through a paid conserved private observation', () => {
  const w = fixture(),
    r = step(w, examine);
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  expect(actor(r.world).vitals.energy).toBeCloseTo(
    actor(w).vitals.energy - 0.5,
  );
  expect(item(r.world)).toMatchObject({
    id: ITEM,
    quantity: 1,
    owner: 'moss',
    position: item(w).position,
  });
  expect(item(r.world).processing).toBeUndefined();
  expect(item(r.world).reservedFor).toBeUndefined();
  expect(item(r.world).decay).toBeGreaterThan(item(w).decay ?? 0);
  expect(reports(r.world)).toHaveLength(1);
  const information = r.world.events.find(
    (e) => e.actor === 'moss' && e.type === 'information-confirmed',
  );
  expect(information?.data.key).toBe(reports(r.world)[0]?.key);
  expect(reports(r.world)[0]?.value).toMatchObject({
    modelRevision: ID + '@1',
    propertyStatus: { exterior: 'observed', interior: 'unavailable' },
    findings: { visibleOpenings: [], resolution: 0.02, uncertainty: 0.01 },
    destructiveAccess: { status: 'not assessed or authorized' },
  });
  expect(JSON.stringify(r.world.events)).not.toContain('fine visible ridges');
  expect(
    r.world.events.filter(
      (e) => e.actor === 'moss' && e.type === 'information-confirmed',
    ),
  ).toHaveLength(1);
  expect(
    r.world.events.some((e) => e.actor === 'moss' && e.type === 'satisfaction'),
  ).toBe(true);
  const again = step(v7Clone(r.world), examine);
  expect(reports(again.world)).toHaveLength(2);
  expect(
    again.world.events.some(
      (e) =>
        e.actor === 'moss' &&
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
  expect(
    continuousRegistry(initialLongWorld('another')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
});
it('deduplicates equivalent personal observations and rejects unsupported source changes, ownership and insufficient effort before payment', () => {
  const w = fixture(),
    r = step(w, examine),
    record = reports(r.world)[0];
  if (!record) throw Error('Missing finding');
  const observer = actor(w);
  observer.memory.knowledge ??= {};
  observer.memory.knowledge['equivalent'] = { ...record, key: 'equivalent' };
  const equivalent = step(w, examine);
  expect(
    equivalent.world.events.some(
      (e) => e.actor === 'moss' && e.type === 'information-confirmed',
    ),
  ).toBe(false);
  for (const change of [
    (w: V7World) => {
      item(w).owner = 'lin';
    },
    (w: V7World) => {
      item(w).reservedFor = 'other';
    },
    (w: V7World) => {
      item(w).processing = { changed: true };
    },
    (w: V7World) => {
      actor(w).vitals.energy = 0.4;
    },
  ]) {
    const f = fixture();
    change(f);
    const result = step(f, examine);
    expect(result.outcomes.moss?.success).toBe(false);
    expect(reports(result.world)).toHaveLength(0);
    expect(actor(result.world).vitals.energy).toBeCloseTo(
      actor(f).vitals.energy,
    );
  }
  const missing = fixture();
  missing.satisfaction = missing.satisfaction.filter(
    (s) => s.id !== 'grounded-understanding',
  );
  expect(
    step(missing, examine).world.events.some(
      (e) => e.actor === 'moss' && e.type === 'satisfaction',
    ),
  ).toBe(false);
});
