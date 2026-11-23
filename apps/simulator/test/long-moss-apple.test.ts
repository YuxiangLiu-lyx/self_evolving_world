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
import { longRetrieve } from '../src/long-context.js';
const ID = 'moss-source-bound-apple-food-trial',
  ITEM = 'item-261-moss-1554';
const wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, args: V7Data) =>
  v7Step(
    w,
    { lin: wait, sol: wait, moss: { interface: ID, args } },
    continuousRegistry(w),
  );
const person = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'moss');
  if (!a) throw Error('Missing Moss');
  return a;
};
const item = (w: V7World) => {
  const s = w.stacks.find((s) => s.id === ITEM);
  if (!s) throw Error('Missing apple');
  return s;
};
const quote = (w: V7World) => {
  const entry = Object.entries(person(w).extensionState).find(([k]) =>
    k.startsWith('apple-trial-quote:'),
  );
  if (!entry) throw Error('Missing quote');
  return {
    key: entry[0],
    record: entry[1] as V7Data,
    value: (entry[1] as V7Data).quote as V7Data,
  };
};
function fixture() {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/moss-apple-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  const w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  expect(w.stacks).toEqual(raw.world.stacks);
  expect(w.actors).toEqual(raw.world.actors);
  expect(
    step(w, { mode: 'assess', specimenId: ITEM }).outcomes.moss?.success,
  ).toBe(false);
  return v7Clone(
    v7Step(
      w,
      {
        lin: wait,
        sol: wait,
        moss: { interface: 'learn', args: { ability: ID } },
      },
      continuousRegistry(w),
    ).world,
  );
}
const assess = (w: V7World) => step(w, { mode: 'assess', specimenId: ITEM });
const begin = (w: V7World) =>
  step(w, {
    mode: 'begin',
    quoteId: quote(w).value.id ?? null,
    explicitAuthorization: true,
  });
it('quotes through unchanged private control queries and separately consumes one real tenth with actual immediate physiology', () => {
  const w = fixture(),
    r = assess(w);
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  const control = v7Step(
    w,
    { lin: wait, sol: wait, moss: wait },
    continuousRegistry(w),
  ).world;
  expect(item(r.world)).toEqual(item(control));
  expect(person(r.world).vitals.energy).toBeCloseTo(
    person(w).vitals.energy - 0.2,
  );
  expect(
    r.world.events.some(
      (e) =>
        [
          'information-confirmed',
          'satisfaction',
          'apple-trial-consumed',
        ].includes(e.type) && e.actor === 'moss',
    ),
  ).toBe(false);
  const q = quote(r.world),
    original = v7Clone(r.world);
  expect(q.value.quantity).toBe(0.1);
  expect(q.value.nutrition).not.toBe(10);
  expect(q.value.toxicity).toBeUndefined();
  const query = {
    section: 'state' as const,
    ids: [q.key],
    search: '',
    offset: 0,
    part: 0,
  };
  expect(
    JSON.stringify(longRetrieve(r.world, 'moss', 'ordinary', [query])),
  ).toContain('apple-dose:');
  expect(
    JSON.stringify(longRetrieve(r.world, 'lin', 'ordinary', [query])),
  ).not.toContain('apple-dose:');
  expect(
    JSON.stringify(longRetrieve(r.world, 'world', 'world', [query])),
  ).toContain('Only this experiment');
  expect(r.world).toEqual(original);
  const b = begin(r.world);
  expect(b.outcomes.moss?.success, b.outcomes.moss?.reason).toBe(true);
  expect(item(b.world)).toMatchObject({
    id: ITEM,
    owner: 'moss',
    quantity: 0.9,
    quantityTenths: 9,
  });
  expect(person(b.world).vitals.satiety).toBeCloseTo(
    person(r.world).vitals.satiety + 1 - 0.9,
  );
  expect(person(b.world).vitals.health).toBe(person(r.world).vitals.health);
  expect(person(b.world).experience?.meals).toEqual(
    person(r.world).experience?.meals,
  );
  const event = b.world.events.find((e) => e.type === 'apple-trial-consumed');
  expect(event?.data).not.toHaveProperty('before');
  expect(event?.data).not.toHaveProperty('response');
  expect(event?.data).toMatchObject({
    swallowedTenths: 1,
    remainingTenths: 9,
    originalTenths: 10,
  });
  expect(JSON.stringify(person(b.world).memory.knowledge)).toContain(
    'not general food safety',
  );
  expect(begin(b.world).outcomes.moss?.success).toBe(false);
  expect(item(begin(b.world).world).quantity).toBe(0.9);
  expect(begin(JSON.parse(JSON.stringify(r.world)) as V7World).world).toEqual(
    b.world,
  );
});
it('fails unauthorized, changed, foreign, dead or unaffordable inputs before charging and retains irreversible effects on cancellation', () => {
  const a = assess(fixture()).world,
    q = quote(a);
  for (const args of [
    {
      mode: 'begin',
      quoteId: q.value.id ?? null,
      explicitAuthorization: false,
    },
    { mode: 'begin', quoteId: 'missing', explicitAuthorization: true },
    { mode: 'begin', quoteId: q.value.id ?? null },
    { mode: 'sample' },
    { mode: 'quote', assessmentId: q.record.assessmentId ?? null },
  ]) {
    const r = step(a, args);
    expect(r.outcomes.moss?.success).toBe(false);
    expect(item(r.world).quantity).toBe(1);
    expect(person(r.world).vitals.energy).toBe(person(a).vitals.energy);
  }
  for (const mutate of [
    (w: V7World) => {
      item(w).owner = 'lin';
    },
    (w: V7World) => {
      item(w).reservedFor = 'foreign';
    },
    (w: V7World) => {
      item(w).quantity = 0.5;
      item(w).quantityTenths = 5;
    },
    (w: V7World) => {
      item(w).processing = { changed: true };
    },
    (w: V7World) => {
      person(w).vitals.energy = 0;
    },
    (w: V7World) => {
      person(w).vitals.health = 79;
    },
    (w: V7World) => {
      const r = w.resources.find((r) => r.id === 'apple');
      if (r) r.nutrition = 99;
    },
  ]) {
    const w = v7Clone(a);
    mutate(w);
    const r = begin(w);
    expect(r.outcomes.moss?.success).toBe(false);
    expect(item(r.world).quantity).toBe(item(w).quantity);
    expect(person(r.world).vitals.energy).toBe(person(w).vitals.energy);
  }
  const cancelled = step(a, {
    mode: 'cancel',
    assessmentId: q.record.assessmentId ?? null,
  });
  expect(cancelled.outcomes.moss?.success).toBe(true);
  expect(begin(cancelled.world).outcomes.moss?.success).toBe(false);
  const b = begin(a).world,
    post = step(b, {
      mode: 'cancel',
      assessmentId: q.record.assessmentId ?? null,
    });
  expect(item(post.world).quantity).toBe(0.9);
  expect(quote(post.world).record.status).toBe('consumed');
  expect(
    step(post.world, {
      mode: 'cancel',
      assessmentId: q.record.assessmentId ?? null,
    }).outcomes.moss?.success,
  ).toBe(true);
  const dead = v7Clone(a);
  person(dead).vitals.health = 0;
  const d = begin(dead);
  expect(d.world.events.some((e) => e.type === 'apple-trial-consumed')).toBe(
    false,
  );
});
it('keeps evidence private, rejects partial references and deduplicates canonical physical findings without historical activation', () => {
  const w = fixture(),
    a = person(w);
  a.memory.knowledge ??= {};
  a.memory.knowledge['partial'] = {
    key: 'partial',
    subject: ITEM,
    property: 'test',
    value: { encoding: 'paged-json', fragment: 'x' },
    method: 'fixture',
    condition: 'fixture only',
    evidence: 'fixture-event',
    tick: w.tick,
    verified: false,
  };
  const other = w.actors.find((p) => p.id === 'lin');
  if (!other) throw Error('Missing other actor');
  other.memory.knowledge ??= {};
  other.memory.knowledge['other-private'] = {
    ...a.memory.knowledge.partial,
    key: 'other-private',
    value: 'other private secret',
  };
  const r = step(w, {
    mode: 'assess',
    specimenId: ITEM,
    evidenceRefs: ['partial', 'other-private'],
  });
  expect(r.outcomes.moss?.success).toBe(true);
  expect(JSON.stringify(person(r.world).memory.knowledge)).not.toContain(
    'other private secret',
  );
  expect(JSON.stringify(person(r.world).memory.knowledge)).toContain(
    'No complete dated personally retained',
  );
  expect(
    r.world.actors.find((a) => a.id === 'lin')?.memory.knowledge,
  ).not.toHaveProperty('moss-apple-assessment');
  const first = begin(r.world),
    record = Object.values(person(first.world).memory.knowledge ?? {}).find(
      (k) => k.key.startsWith('apple-response:'),
    ),
    key = (record?.value as V7Data | undefined)?.canonicalKey;
  expect(typeof key).toBe('string');
  const duplicate = v7Clone(r.world);
  person(duplicate).extensionState['long:confirmed-physical-properties'] = [
    key ?? 'missing',
  ];
  expect(
    begin(duplicate).world.events.some(
      (e) => e.type === 'information-confirmed' && e.actor === 'moss',
    ),
  ).toBe(false);
  const normalized = v7Clone(r.world);
  if (typeof key !== 'string') throw Error('Missing canonical finding');
  const parsed = JSON.parse(key) as Record<string, unknown>;
  person(normalized).extensionState['long:confirmed-physical-properties'] = [
    JSON.stringify({ ...parsed, response: { satiety: 1, health: 0 } }),
  ];
  expect(
    begin(normalized).world.events.some(
      (e) => e.type === 'information-confirmed' && e.actor === 'moss',
    ),
  ).toBe(false);
  const noRule = v7Clone(r.world);
  noRule.satisfaction = noRule.satisfaction.filter(
    (r) => r.id !== 'grounded-understanding',
  );
  expect(
    begin(noRule).world.events.some(
      (e) => e.type === 'satisfaction' && e.actor === 'moss',
    ),
  ).toBe(false);
  expect(
    continuousRegistry(initialLongWorld('other')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
  const changed = fixture(),
    resource = changed.resources.find((r) => r.id === 'apple');
  if (!resource) throw Error('Missing profile');
  resource.nutrition = 99;
  const unsupported = assess(changed);
  expect(unsupported.outcomes.moss?.success).toBe(true);
  expect(quote(unsupported.world).record.quote).toBeNull();
  expect(r.world.revisions).not.toContain('food-assessment@1');
  expect(person(r.world).mastered).not.toContain('assess-food');
});
