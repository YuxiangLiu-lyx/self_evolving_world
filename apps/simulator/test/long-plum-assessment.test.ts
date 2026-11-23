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
const ID = 'source-bound-plum-food-assessment',
  SOURCE = 'forest-plum-2';
const wait: V7Action = { interface: 'wait', args: {} };
const act = (args: V7Data = {}): V7Action => ({
  interface: ID,
  args: { sourceId: SOURCE, ...args },
});
const step = (w: V7World, a: V7Action) =>
  v7Step(w, { lin: a, moss: wait, sol: wait }, continuousRegistry(w));
const person = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'lin');
  if (!a) throw Error('Missing person');
  return a;
};
const source = (w: V7World) => {
  const o = w.objects.find((o) => o.id === SOURCE);
  if (!o) throw Error('Missing source');
  return o;
};
const reports = (w: V7World) =>
  Object.values(person(w).memory.knowledge ?? {}).filter((k) =>
    k.key.startsWith('plum-assessment:'),
  );
function fixture() {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/plum-assessment-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  const w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  expect(w.stacks).toEqual(raw.world.stacks);
  expect(w.objects).toEqual(raw.world.objects);
  expect(w.actors).toEqual(raw.world.actors);
  expect(step(w, act()).outcomes.lin?.success).toBe(false);
  return v7Clone(step(w, { interface: 'learn', args: { ability: ID } }).world);
}
it('assesses the currently reachable source without a specimen, conserves matter and gives no safety or experience benefit', () => {
  const w = fixture();
  source(w).data.stock = 0;
  source(w).data.hiddenFoodProperty = 'private-fixture-secret';
  const before = step(w, wait).world,
    r = step(w, act());
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  expect(r.world.objects).toEqual(before.objects);
  expect(r.world.stacks).toEqual(before.stacks);
  expect(person(r.world).vitals.energy).toBeCloseTo(
    person(w).vitals.energy - 0.2,
  );
  expect(reports(r.world)).toHaveLength(1);
  expect(reports(r.world)[0]?.value).toMatchObject({
    directObservations: {
      id: SOURCE,
      stock: 0,
      revision: 'foundation-forest@1',
    },
    consumptionSupport: 'not established',
    materialConsumed: 0,
    paidEnergy: 0.2,
    novelInformation: false,
  });
  expect(JSON.stringify(reports(r.world))).not.toContain(
    'private-fixture-secret',
  );
  expect(
    r.world.events.some(
      (e) =>
        e.actor === 'lin' &&
        ['information-confirmed', 'satisfaction', 'ate', 'gathered'].includes(
          e.type,
        ),
    ),
  ).toBe(false);
  expect(reports(step(r.world, act()).world)).toHaveLength(2);
  expect(step(JSON.parse(JSON.stringify(w)) as V7World, act()).world).toEqual(
    r.world,
  );
  expect(
    continuousRegistry(initialLongWorld('another-scope')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
});
it('requires actual reach, unchanged source identity, personal mastery and sufficient energy before a charge', () => {
  for (const mutate of [
    (w: V7World) => {
      person(w).position = { x: 4, y: 4 };
    },
    (w: V7World) => {
      person(w).vitals.energy = 0;
    },
    (w: V7World) => {
      source(w).revision = 'different-model@1';
    },
    (w: V7World) => {
      source(w).data.resource = 'berry';
    },
  ]) {
    const w = fixture();
    mutate(w);
    const r = step(w, act());
    expect(r.outcomes.lin?.success).toBe(false);
    expect(reports(r.world)).toHaveLength(0);
    expect(person(r.world).vitals.energy).toBe(person(w).vitals.energy);
  }
  const w = fixture();
  expect(
    step(w, act({ sourceId: 'object: ' + SOURCE })).outcomes.lin?.success,
  ).toBe(true);
  expect(
    step(w, act({ sourceId: 'forest-apple-2' })).outcomes.lin?.success,
  ).toBe(false);
  expect(step(w, act({ mode: 'taste' })).outcomes.lin?.success).toBe(false);
  expect(
    step(w, act({ evidenceRefs: ['same', 'same'] })).outcomes.lin?.success,
  ).toBe(false);
});
it('marks incomplete and unrelated personal references and never borrows private findings or exposes supplied evidence keys publicly', () => {
  const w = fixture(),
    a = person(w);
  a.memory.knowledge ??= {};
  a.memory.knowledge['private-unrelated'] = {
    key: 'private-unrelated',
    subject: 'berry',
    property: 'fixture-only-property',
    value: { detail: 'private-detail' },
    method: 'fixture',
    condition: 'unrelated food',
    verified: true,
    tick: w.tick,
    evidence: 'own-fixture-event',
  };
  a.memory.knowledge['incomplete'] = {
    ...a.memory.knowledge['private-unrelated'],
    key: 'incomplete',
    value: { encoding: 'paged-json', fragment: 'partial' },
  };
  const r = step(
    w,
    act({
      evidenceRefs: [
        'private-unrelated',
        'incomplete',
        'missing',
        'nut-opening:manual-178-moss-1044',
      ],
    }),
  );
  expect(r.outcomes.lin?.success).toBe(true);
  const text = JSON.stringify(reports(r.world));
  expect(text).toContain('unrelated source/property');
  expect(text).toContain('unavailable');
  expect(text).not.toContain('private-detail');
  expect(text).not.toContain('pale compact');
  expect(JSON.stringify(r.world.events)).not.toContain('private-unrelated');
  expect(
    r.world.actors.find((a) => a.id === 'moss')?.memory.knowledge,
  ).not.toHaveProperty(reports(r.world)[0]?.key ?? 'missing');
});
