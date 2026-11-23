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
const ID = 'source-bound-hazelnut-opening-trial',
  ITEM = 'item-119-lin-699',
  SUPPORT = 'start-0-stone';
const wait: V7Action = { interface: 'wait', args: {} },
  step = (w: V7World, a: V7Action) =>
    v7Step(w, { lin: a, moss: wait, sol: wait }, continuousRegistry(w));
const action = (mode: string, args: V7Data = {}): V7Action => ({
  interface: ID,
  args: { mode, ...args },
});
const actor = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'lin');
  if (!a) throw Error('Missing actor');
  return a;
};
const nut = (w: V7World) => {
  const s = w.stacks.find((s) => s.id === ITEM);
  if (!s) throw Error('Missing specimen');
  return s;
};
function setup(withTool = true) {
  const raw = JSON.parse(
    readFileSync(
      'docs/exec-plans/evidence/pr-31-long-open-development/nut-opening-fixture.json',
      'utf8',
    ),
  ) as { world: V7World };
  let w = v7Clone(
    v7Install(raw.world, continuousRegistry(raw.world), ID + '@1'),
  );
  expect(w.stacks).toEqual(raw.world.stacks);
  expect(w.actors).toEqual(raw.world.actors);
  expect(w.objects).toEqual(raw.world.objects);
  expect(
    step(w, action('assess', { specimenId: ITEM })).outcomes.lin?.success,
  ).toBe(false);
  w = v7Clone(step(w, { interface: 'learn', args: { ability: ID } }).world);
  w = v7Clone(step(w, wait).world);
  if (!withTool) return { w, tool: '' };
  // Isolated fixture relocation is not a formal decision, route or free material grant.
  actor(w).position = { x: 5.7, y: 8.5 };
  const gathered = step(w, {
    interface: 'gather',
    args: { target: SUPPORT, quantity: 1 },
  });
  expect(gathered.outcomes.lin?.success, gathered.outcomes.lin?.reason).toBe(
    true,
  );
  w = v7Clone(gathered.world);
  const tool = w.stacks.find(
    (s) => s.owner === 'lin' && s.resource === 'stone',
  );
  if (!tool) throw Error('Missing actually gathered stone');
  return { w, tool: tool.id };
}
function prepared() {
  const f = setup();
  const r = step(
    f.w,
    action('assess', {
      specimenId: 'item:' + ITEM,
      toolId: f.tool,
      supportId: 'object:' + SUPPORT,
    }),
  );
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  const e = r.world.events.find((e) => e.type === 'nut-opening-assessed');
  if (!e) throw Error('Missing assessment');
  return {
    w: v7Clone(r.world),
    tool: f.tool,
    begin: action('begin', {
      specimenId: ITEM,
      assessmentId: e.data.assessmentId ?? null,
    }),
  };
}
function process(w: V7World) {
  const j = Object.values(w.state).find(
    (v) => v && typeof v === 'object' && !Array.isArray(v) && v.ability === ID,
  ) as V7Data | undefined;
  if (!j) throw Error('Missing process');
  return j;
}
it('requires actual study, paid assessment and acquired support/tool; never grants matter or hidden findings', () => {
  const { w } = setup(false),
    r = step(w, action('assess', { specimenId: ITEM }));
  expect(r.outcomes.lin?.success).toBe(true);
  expect(actor(r.world).vitals.energy).toBeCloseTo(
    actor(w).vitals.energy - 0.5,
  );
  expect(
    r.world.events.find((e) => e.type === 'nut-opening-assessed')?.data
      .executable,
  ).toBe(false);
  expect(nut(r.world).processing).toBeUndefined();
  expect(nut(r.world).reservedFor).toBeUndefined();
  expect(JSON.stringify(actor(r.world).memory.knowledge)).not.toContain(
    'pale compact surface',
  );
  expect(JSON.stringify(r.world.abilities)).not.toContain('interiorColor');
  expect(r.world.events.some((e) => e.type === 'information-confirmed')).toBe(
    false,
  );
  expect(
    continuousRegistry(initialLongWorld('unrelated')).packages.some(
      (p) => p.id === ID,
    ),
  ).toBe(false);
});
it('retains two paid real contacts, tool wear, private exposed findings and a single conserved assembly across serialization', () => {
  const f = prepared(),
    r = step(f.w, f.begin);
  expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
  const j = process(r.world);
  expect(j).toMatchObject({
    completedWork: 1,
    remainingWork: 1,
    paidEnergy: 1,
    status: 'active',
  });
  expect(nut(r.world)).toMatchObject({
    owner: null,
    quantity: 1,
    reservedFor: j.id,
    processing: { contacts: 1, exposed: false },
  });
  expect(nut(r.world).processing?.sourceFractions).toBeUndefined();
  expect(
    r.world.stacks.find((s) => s.id === f.tool)?.processing?.blunting,
  ).toBe(0.002);
  const resume = action('resume', { processId: j.id ?? null }),
    s = step(v7Clone(r.world), resume);
  expect(
    step(JSON.parse(JSON.stringify(r.world)) as V7World, resume).world,
  ).toEqual(s.world);
  expect(s.outcomes.lin?.success, s.outcomes.lin?.reason).toBe(true);
  expect(process(s.world)).toMatchObject({
    completedWork: 2,
    paidEnergy: 2,
    status: 'completed',
  });
  expect(nut(s.world)).toMatchObject({
    quantity: 1,
    owner: null,
    processing: {
      exposed: true,
      sourceFractions: { covering: 0.35, interior: 0.65 },
    },
  });
  expect(nut(s.world).reservedFor).toBeUndefined();
  expect(s.world.stacks.length).toBe(f.w.stacks.length);
  expect(
    s.world.stacks.find((x) => x.id === f.tool)?.processing?.blunting,
  ).toBe(0.004);
  expect(nut(s.world).decay).toBeGreaterThan(nut(f.w).decay ?? 0);
  const inspect = action('inspect', { processId: j.id ?? null }),
    observed = step(v7Clone(s.world), inspect);
  expect(observed.outcomes.lin?.success, observed.outcomes.lin?.reason).toBe(
    true,
  );
  expect(JSON.stringify(actor(observed.world).memory.knowledge)).toContain(
    'pale compact surface',
  );
  expect(JSON.stringify(observed.world.events)).not.toContain(
    'pale compact surface',
  );
  expect(
    observed.world.events.filter((e) => e.type === 'information-confirmed'),
  ).toHaveLength(1);
  expect(
    step(v7Clone(observed.world), inspect).world.events.some(
      (e) => e.type === 'information-confirmed',
    ),
  ).toBe(false);
  expect(step(v7Clone(s.world), resume).outcomes.lin?.success).toBe(false);
  expect(step(v7Clone(s.world), f.begin).outcomes.lin?.success).toBe(false);
});
it('pauses before charging, retains damage on cancellation/death and prevents conflicting consumption and support use', () => {
  const f = prepared(),
    r = step(f.w, f.begin),
    w = v7Clone(r.world),
    j = process(w);
  const energy = actor(w).vitals.energy;
  actor(w).position = { x: 6.8, y: 8.5 };
  const paused = step(w, action('resume', { processId: j.id ?? null }));
  expect(process(paused.world)).toMatchObject({
    status: 'paused',
    completedWork: 1,
    paidEnergy: 1,
  });
  expect(actor(paused.world).vitals.energy).toBeCloseTo(energy);
  const returned = v7Clone(paused.world);
  actor(returned).position = { x: 5.7, y: 8.5 };
  const resumed = step(returned, action('resume', { processId: j.id ?? null }));
  expect(process(resumed.world)).toMatchObject({
    status: 'completed',
    completedWork: 2,
    paidEnergy: 2,
  });
  const cancelled = step(
    v7Clone(paused.world),
    action('cancel', { processId: j.id ?? null }),
  );
  expect(process(cancelled.world).status).toBe('stopped');
  expect(nut(cancelled.world)).toMatchObject({
    owner: null,
    quantity: 1,
    processing: { contacts: 1 },
  });
  expect(nut(cancelled.world).reservedFor).toBeUndefined();
  expect(
    step(
      v7Clone(cancelled.world),
      action('cancel', { processId: j.id ?? null }),
    ).outcomes.lin?.success,
  ).toBe(false);
  expect(
    step(v7Clone(r.world), {
      interface: 'gather',
      args: { target: SUPPORT, quantity: 1 },
    }).outcomes.lin?.success,
  ).toBe(false);
  expect(
    step(v7Clone(r.world), {
      interface: 'eat',
      args: { target: ITEM, quantity: 1 },
    }).outcomes.lin?.success,
  ).toBe(false);
  const dead = v7Clone(r.world);
  actor(dead).vitals.health = 0.1;
  actor(dead).vitals.satiety = 0;
  const after = step(dead, wait).world;
  expect(process(after).status).toBe('stopped');
  expect(nut(after).owner).toBeNull();
  expect(nut(after).reservedFor).toBeUndefined();
  expect(nut(after).quantity).toBe(1);
  expect(after.stacks.find((s) => s.id === f.tool)?.owner).toBeNull();
  expect(
    after.stacks.find((s) => s.id === f.tool)?.reservedFor,
  ).toBeUndefined();
});
it('rejects stale source/quote, wrong ownership, unsuitable material, missing energy and occupied contact before payment', () => {
  for (const mutate of [
    (w: V7World) => {
      nut(w).quantity = 0.9;
    },
    (w: V7World) => {
      nut(w).owner = 'moss';
    },
    (w: V7World) => {
      actor(w).vitals.energy = 0;
    },
  ]) {
    const f = prepared();
    mutate(f.w);
    const r = step(f.w, f.begin);
    expect(r.outcomes.lin?.success).toBe(false);
    expect(nut(r.world).processing).toBeUndefined();
    expect(r.world.events.some((e) => e.type === 'nut-opening-contact')).toBe(
      false,
    );
  }
  const f = prepared();
  const s = f.w.stacks.find((s) => s.id === f.tool);
  if (!s) throw Error('Missing tool');
  s.quantity = 2;
  expect(step(f.w, f.begin).outcomes.lin?.success).toBe(false);
});

it('rejects other real matter at the contact site and distant nominated support before charging', () => {
  const f = prepared();
  f.w.stacks.push({
    id: 'fixture-obstruction',
    resource: 'stone',
    quantity: 1,
    owner: null,
    origin: 'fixture-only',
    position: { x: 5.33, y: 8.5 },
  });
  const r = step(f.w, f.begin);
  expect(r.outcomes.lin?.success).toBe(false);
  expect(actor(r.world).vitals.energy).toBeCloseTo(actor(f.w).vitals.energy);
  expect(nut(r.world).processing).toBeUndefined();
  const g = setup();
  actor(g.w).position = { x: 7, y: 8.5 };
  const distant = step(
    g.w,
    action('assess', { specimenId: ITEM, supportId: SUPPORT }),
  );
  expect(distant.outcomes.lin?.success).toBe(false);
  expect(actor(distant.world).vitals.energy).toBeCloseTo(
    actor(g.w).vitals.energy,
  );
});

it('does not mistake an unrelated reserved rock surface for its own undefined lock', () => {
  const f = setup(),
    o = f.w.objects.find((o) => o.id === SUPPORT);
  if (!o) throw Error('Missing support');
  o.spatial.reserved = true;
  const r = step(
    f.w,
    action('assess', { specimenId: ITEM, toolId: f.tool, supportId: SUPPORT }),
  );
  expect(r.outcomes.lin?.success).toBe(false);
  expect(actor(r.world).vitals.energy).toBeCloseTo(actor(f.w).vitals.energy);
});
