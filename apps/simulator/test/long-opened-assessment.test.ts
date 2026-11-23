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
const ID = 'opened-hazelnut-preparation-assessment',
  ITEM = 'item-141-lin-821',
  TOOL = 'item-131-lin-766';
const wait: V7Action = { interface: 'wait', args: {} },
  assess: V7Action = {
    interface: ID,
    args: { specimenId: ITEM, optionalToolId: TOOL, evidenceRefs: [] },
  },
  step = (w: V7World, a: V7Action) =>
    v7Step(w, { lin: a, moss: wait, sol: wait }, continuousRegistry(w));
const actor = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'lin');
  if (!a) throw Error('Missing actor');
  return a;
};
const item = (w: V7World) => {
  const s = w.stacks.find((s) => s.id === ITEM);
  if (!s) throw Error('Missing specimen');
  return s;
};
const reports = (w: V7World) =>
  Object.values(actor(w).memory.knowledge ?? {}).filter((k) =>
    k.key.startsWith('opened-assessment:'),
  );
function fixture() {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/opened-assessment-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  const w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  expect(w.stacks).toEqual(raw.world.stacks);
  expect(w.actors).toEqual(raw.world.actors);
  expect(w.objects).toEqual(raw.world.objects);
  expect(step(w, assess).outcomes.lin?.success).toBe(false);
  return v7Clone(step(w, { interface: 'learn', args: { ability: ID } }).world);
}
it('follows the actual pickup lineage without resetting contacts, transforming matter, wearing the tool or rewarding repeated findings', () => {
  const w = fixture(),
    r = step(w, assess);
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  expect(actor(r.world).vitals.energy).toBeCloseTo(
    actor(w).vitals.energy - 0.5,
  );
  expect(item(r.world)).toMatchObject({
    id: ITEM,
    quantity: 1,
    owner: 'lin',
    position: item(w).position,
    processing: item(w).processing,
  });
  expect(item(r.world).decay).toBeGreaterThan(item(w).decay ?? 0);
  expect(r.world.stacks.find((s) => s.id === TOOL)).toEqual(
    w.stacks.find((s) => s.id === TOOL),
  );
  expect(r.world.stacks.length).toBe(w.stacks.length);
  expect(r.world.objects.map((o) => o.id)).toEqual(w.objects.map((o) => o.id));
  expect(r.world.state['long:nut:contact']).toEqual(
    w.state['long:nut:contact'],
  );
  expect(reports(r.world)).toHaveLength(1);
  expect(reports(r.world)[0]?.value).toMatchObject({
    lineage: { pickupEvent: 'event-141-lin-822' },
    openingContactsRemaining: 0,
    novelInformation: false,
    materialConsumed: 0,
    access: { detachability: 'not established' },
    food: { ediblePortions: 'unresolved' },
  });
  expect(JSON.stringify(r.world.events)).not.toContain('pale compact surface');
  expect(JSON.stringify(reports(r.world))).not.toContain('50.73160467');
  expect(
    r.world.events.some(
      (e) =>
        e.actor === 'lin' &&
        [
          'information-confirmed',
          'satisfaction',
          'practice-confirmed',
          'nut-opening-contact',
        ].includes(e.type),
    ),
  ).toBe(false);
  expect(step(JSON.parse(JSON.stringify(w)) as V7World, assess).world).toEqual(
    r.world,
  );
  expect(reports(step(v7Clone(r.world), assess).world)).toHaveLength(2);
  expect(
    continuousRegistry(initialLongWorld('other')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
});
it('checks exact live source, tool and personal evidence access before any payment or report', () => {
  for (const change of [
    (w: V7World) => {
      item(w).owner = 'moss';
    },
    (w: V7World) => {
      item(w).reservedFor = 'other';
    },
    (w: V7World) => {
      item(w).quantity = 0.9;
    },
    (w: V7World) => {
      item(w).processing = { changed: true };
    },
    (w: V7World) => {
      actor(w).vitals.energy = 0.4;
    },
  ]) {
    const w = fixture();
    change(w);
    const r = step(w, assess);
    expect(r.outcomes.lin?.success).toBe(false);
    expect(reports(r.world)).toHaveLength(0);
    expect(actor(r.world).vitals.energy).toBeCloseTo(actor(w).vitals.energy);
  }
  const w = fixture(),
    tool = w.stacks.find((s) => s.id === TOOL);
  if (!tool) throw Error('Missing tool');
  tool.owner = 'sol';
  expect(step(w, assess).outcomes.lin?.success).toBe(false);
  const noTool = step(w, {
    interface: ID,
    args: {
      specimenId: 'item: ' + ITEM,
      evidenceRefs: ['other-private', 'missing'],
    },
  });
  expect(noTool.outcomes.lin?.success).toBe(true);
  expect(JSON.stringify(reports(noTool.world))).toContain(
    'No complete dated personally retained',
  );
});
