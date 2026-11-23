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
const ID = 'bounded-hazelnut-food-assessment',
  ITEM = 'item-140-moss-811';
const wait: V7Action = { interface: 'wait', args: {} },
  assess: V7Action = {
    interface: ID,
    args: { specimenId: ITEM, evidenceRefs: [] },
  },
  step = (w: V7World, a: V7Action) =>
    v7Step(w, { lin: wait, moss: a, sol: wait }, continuousRegistry(w));
const person = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'moss');
  if (!a) throw Error('Missing actor');
  return a;
};
function fixture() {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/moss-food-assessment-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  const w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  expect(w.stacks).toEqual(raw.world.stacks);
  expect(w.actors).toEqual(raw.world.actors);
  expect(w.objects).toEqual(raw.world.objects);
  expect(step(w, assess).outcomes.moss?.success).toBe(false);
  return v7Clone(step(w, { interface: 'learn', args: { ability: ID } }).world);
}
it('reuses the private evidence adapter without transferring Lin specimen anatomy, mastery, food facts or rewards', () => {
  const w = fixture(),
    r = step(w, assess);
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  expect(person(r.world).vitals.energy).toBeCloseTo(
    person(w).vitals.energy - 0.2,
  );
  const before = w.stacks.find((s) => s.id === ITEM),
    after = r.world.stacks.find((s) => s.id === ITEM);
  expect(after).toMatchObject({
    id: ITEM,
    owner: 'moss',
    quantity: 1,
    position: before?.position,
    origin: 'forest-hazelnut-1',
  });
  expect(after?.decay).toBeGreaterThan(before?.decay ?? 0);
  const reports = Object.values(person(r.world).memory.knowledge ?? {}).filter(
    (k) => k.key.startsWith('moss-food-assessment:'),
  );
  expect(reports).toHaveLength(1);
  expect(reports[0]?.value).toMatchObject({
    novelInformation: false,
    foodQuestions: {
      ediblePortions: { status: 'unresolved' },
      preparation: { status: 'unresolved' },
      safety: { status: 'unresolved' },
    },
  });
  expect(JSON.stringify(reports)).not.toContain('fine visible ridges');
  expect(JSON.stringify(reports)).not.toContain('approximateLength');
  expect(JSON.stringify(reports)).not.toContain('1.37659716');
  expect(
    r.world.events
      .filter((e) => e.actor === 'moss')
      .some((e) =>
        [
          'information-confirmed',
          'satisfaction',
          'practice-confirmed',
          'ate',
        ].includes(e.type),
      ),
  ).toBe(false);
  expect(JSON.stringify(r.world.events)).not.toContain('sourceModelBoundary');
  expect(step(JSON.parse(JSON.stringify(w)) as V7World, assess).world).toEqual(
    r.world,
  );
  expect(
    continuousRegistry(initialLongWorld('another')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
  const again = step(v7Clone(r.world), assess);
  expect(
    Object.keys(person(again.world).memory.knowledge ?? {}).filter((k) =>
      k.startsWith('moss-food-assessment:'),
    ),
  ).toHaveLength(2);
});
it('keeps original source restrictions and rejects wrong ownership, partial material and conflicts without charge', () => {
  for (const field of ['owner', 'quantity', 'reservedFor'] as const) {
    const w = fixture(),
      s = w.stacks.find((s) => s.id === ITEM);
    if (!s) throw Error('Missing source');
    if (field === 'owner') s.owner = 'sol';
    else if (field === 'quantity') s.quantity = 0.8;
    else s.reservedFor = 'other-work';
    const r = step(w, assess);
    expect(r.outcomes.moss?.success).toBe(false);
    expect(person(r.world).vitals.energy).toBeCloseTo(person(w).vitals.energy);
    expect(
      r.world.events.some((e) => e.type === 'moss-food-assessment-completed'),
    ).toBe(false);
  }
  const w = fixture();
  expect(
    step(w, {
      interface: 'owned-hazelnut-assessment',
      args: { specimenId: ITEM },
    }).outcomes.moss?.success,
  ).toBe(false);
  expect(
    step(w, {
      interface: 'bounded-unfamiliar-food-assessment',
      args: { specimenId: ITEM },
    }).outcomes.moss?.success,
  ).toBe(false);
});
