import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Load,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Data,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';
import { CONTINUOUS_VISUALS } from '../../viewer/src/continuous-visuals.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 30_000 });

const id = 'hand-twist-fiber-cord';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** Material sources of the ex16 world and a spot within reach of each. */
const REEDS = { source: 'forest-reed-0', at: { x: 22.6, y: 5.9 } };
const GRASS = { source: 'forest-dry-grass-0', at: { x: 14.7, y: 16.5 } };
const BRANCHES = { source: 'start-0-branches', at: { x: 10.5, y: 9.15 } };
const ROOTS = { source: 'start-0-roots', at: { x: 10.6, y: 12.2 } };
/** Engine material values that no event may reveal. */
const HIDDEN = /flexib|hardness/i;

function step(w: V7World, actions: Record<string, V7Action> = {}) {
  const result = v7Step(
    w,
    Object.fromEntries(
      w.actors
        .filter((a) => a.vitals.health > 0)
        .map((a) => [a.id, actions[a.id] ?? WAIT]),
    ),
    continuousRegistry(w),
  );
  if (result.paused) throw new Error(result.paused);
  return { ...result, world: v7Clone(result.world) };
}
const actor = (w: V7World, name = 'wren'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === type);
const mode = (m: string, args: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...args },
});
const use = (stackId: string, quantity: number) => ({ stackId, quantity });
const tenths = (n: number) => Math.round(n * 10);
/** Every tenth of reed in stacks: carried, reserved, worked, scrap or on the ground. */
const reed = (w: V7World) =>
  w.stacks
    .filter((s) => s.resource === 'reed')
    .reduce((n, s) => n + tenths(s.quantity), 0);
interface Job {
  id: string;
  status: string;
  completedWork: number;
  remainingWork: number;
  paidEnergy: number;
  escrow: string[];
  target: string | null;
  outputs: string[];
}
const jobs = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Job);
const job = (w: V7World) => jobs(w).at(-1);
const part = (s?: V7Stack): V7Data =>
  (s?.processing?.fiberCord ?? {}) as V7Data;
const role = (w: V7World, r: string) =>
  w.stacks.filter((s) => part(s).role === r);
const item = (w: V7World, stackId: string) =>
  w.stacks.find((s) => s.id === stackId);
const energy = (w: V7World, name = 'wren') => actor(w, name).vitals.energy;
/** Energy a step spent beyond what the same round spends while waiting. */
const spent = (from: V7World, to: V7World, name = 'wren') =>
  energy(step(from).world, name) - energy(to, name);
/** The declared reed law, restated: half the solid volume per ply over length x 2/sqrt(3) + 0.04 m. */
function plyArea(units: number, length: number) {
  const volume = (units * 0.25 * (1 - 0.9)) / 500;
  return volume / 2 / ((length * 2) / Math.sqrt(3) + 0.04);
}
const plyDiameter = (units: number, length: number) =>
  2 * Math.sqrt(plyArea(units, length) / Math.PI);
const breakingForce = (units: number, length: number, condition: number) =>
  2 * plyArea(units, length) * 8e6 * (1 - 0.55 * 0.9) * 0.75 * condition;

function installed() {
  const genesis = initialLongWorld('long-ex16', 'long-culture-v2');
  return v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
}
/** Wren gathers real material with the unchanged base gather, then returns to the reed bed. */
function gather(from: V7World, at: typeof REEDS, quantity: number) {
  const w = v7Clone(from);
  actor(w).position = { ...at.at };
  const r = step(w, {
    wren: { interface: 'gather', args: { target: at.source, quantity } },
  });
  expect(r.outcomes.wren?.success).toBe(true);
  const s = r.world.stacks.find(
    (s) => s.owner === 'wren' && s.origin === at.source && !s.processing,
  );
  if (!s) throw new Error('Missing actually gathered fixture material.');
  actor(r.world).position = { ...REEDS.at };
  return { w: r.world, item: s.id };
}
function study(w: V7World) {
  let x = step(w, {
    wren: { interface: 'learn', args: { ability: id } },
  }).world;
  for (let i = 0; i < 2; i++) x = step(x).world;
  expect(actor(x).mastered).toContain(id);
  return x;
}
/** Wren holds 3 units of real reed and, by default, has studied. */
function supplied(learn = true) {
  const g = gather(installed(), REEDS, 3);
  const w = learn ? study(g.w) : g.w;
  actor(w).vitals.energy = 40;
  return { w, raw: g.item };
}
/** After a passing sample of the raw reed. */
function sampled() {
  const f = supplied();
  const r = step(f.w, {
    wren: mode('sample', { materials: [use(f.raw, 0.1)] }),
  });
  expect(events(r.world, 'fiber-cord-sampled')[0]?.data.passed).toBe(true);
  actor(r.world).vitals.energy = 40;
  return { w: r.world, raw: f.raw };
}
const make = (stackId: string, quantity = 0.5, requestedLength = 0.3) =>
  mode('make', { materials: [use(stackId, quantity)], requestedLength });
/** A complete cord after four paid rounds. */
function made(quantity = 0.5, length = 0.3) {
  const f = sampled();
  let w = f.w;
  for (let i = 0; i < 4; i++)
    w = step(w, { wren: make(f.raw, quantity, length) }).world;
  const c = role(w, 'cord')[0];
  if (!c) throw new Error('Missing completed fixture cord.');
  actor(w).vitals.energy = 40;
  return { ...f, w, cord: c.id };
}
/** Moves a real portion of an owned stack into a lot shaped like Wren's actual mat offcuts or scrap. */
function relabel(
  w: V7World,
  from: string,
  quantity: number,
  processing: V7Data,
  lot: string,
) {
  const s = item(w, from);
  if (!s) throw new Error('Missing fixture source.');
  const left = tenths(s.quantity) - tenths(quantity);
  s.quantity = left / 10;
  s.quantityTenths = left;
  w.stacks.push({
    ...v7Clone(s),
    id: lot,
    quantity,
    quantityTenths: tenths(quantity),
    processing,
  });
}
const unchanged = (
  w: V7World,
  action: V7Action,
  reason: RegExp,
  who = 'wren',
) => {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.success).toBe(false);
  expect(r.outcomes[who]?.reason).toMatch(reason);
  expect(r.world.stacks).toEqual(idle.stacks);
  expect(actor(r.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(jobs(r.world)).toEqual(jobs(idle));
  return r;
};
/** Everything this package emitted. */
const visible = (w: V7World) =>
  w.events.filter((e) => e.interface === id || e.type.startsWith('fiber-cord'));

describe('hand-twisted fiber cord in ex16', () => {
  it('is scoped to ex16, needs three study rounds at 0.2 energy and fits the frozen size limit', () => {
    const other = initialLongWorld('long-ex15', 'long-culture');
    expect(() =>
      v7Install(other, continuousRegistry(other), `${id}@1`),
    ).toThrow();
    const f = supplied(false);
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(3);
    expect(ability?.learningEnergy).toBe(0.2);
    expect(ability?.prerequisites).toEqual([]);
    const limit = f.w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const pkg = continuousRegistry(f.w).packages.find((p) => p.id === id);
    expect(
      CULTURE_EXCLUDED_WORDS.test(
        JSON.stringify({ abilities: pkg?.abilities, events: pkg?.events }),
      ),
    ).toBe(false);
    expect(pkg?.satisfaction).toEqual([]);
    expect(
      pkg?.visualComponents.every(
        (c) => typeof CONTINUOUS_VISUALS[c] === 'function',
      ),
    ).toBe(true);
    const early = step(f.w, {
      wren: mode('sample', { materials: [use(f.raw, 0.1)] }),
    });
    expect(early.outcomes.wren?.reason).toMatch(/not mastered/);
    expect(actor(early.world).vitals).toEqual(actor(step(f.w).world).vitals);
    // Each of the three study rounds is paid individually.
    let w = step(f.w, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(spent(f.w, w)).toBeCloseTo(0.2, 6);
    for (let i = 0; i < 2; i++) {
      expect(actor(w).mastered).not.toContain(id);
      const resting = v7Clone(w);
      actor(resting).learning = null;
      const next = step(w).world;
      expect(energy(step(resting).world) - energy(next)).toBeCloseTo(0.2, 6);
      w = next;
    }
    expect(actor(w).mastered).toContain(id);
    expect(events(w, 'satisfaction')).toHaveLength(0);
    expect(JSON.stringify(actor(w).wellbeing.sources)).not.toContain(id);
  });

  it('sample: 0.1 raw reed for one round and 0.5 energy becomes an owned tested lot reporting only observations', () => {
    const f = supplied();
    const before = reed(f.w),
      load = v7Load(f.w, actor(f.w)),
      r = step(f.w, {
        wren: mode('sample', { materials: [use(f.raw, 0.1)] }),
      }),
      w = r.world;
    expect(r.outcomes.wren).toMatchObject({ success: true, complete: true });
    expect(spent(f.w, w)).toBeCloseTo(0.5, 6);
    expect(visible(w).map((e) => e.type)).toEqual([
      'trial-result',
      'information-confirmed',
      'fiber-cord-sampled',
    ]);
    const e = events(w, 'fiber-cord-sampled')[0],
      lot = role(w, 'tested-lot')[0];
    expect(e?.data).toMatchObject({
      item: f.raw,
      lot: lot?.id,
      resource: 'reed',
      origin: REEDS.source,
      processing: 'raw',
      passed: true,
      reason: null,
      separated: true,
      bentWithoutCracking: true,
      retainedTwist: 1,
      visibleFractures: false,
      strandLength: 1.8,
      waterShare: 0.9,
      appliedForce: 5,
      held: true,
      testTwist: { length: 0.1, plies: 2 },
      energy: 0.5,
    });
    expect(JSON.stringify(e?.data)).not.toMatch(HIDDEN);
    // The sample is not lost: an owned, identified tested lot of the same origin and age.
    expect(lot).toMatchObject({
      quantity: 0.1,
      owner: 'wren',
      origin: REEDS.source,
      harvestedAt: item(f.w, f.raw)?.harvestedAt,
    });
    expect(part(lot)).toMatchObject({
      role: 'tested-lot',
      classes: ['raw'],
      condition: 1,
      from: f.raw,
      passed: true,
    });
    expect(e?.target).toBe(lot?.id);
    expect(item(w, f.raw)?.quantity).toBe(2.9);
    expect(reed(w)).toBe(before);
    expect(v7Load(w, actor(w))).toBeCloseTo(load, 8);
    expect(events(w, 'satisfaction')).toHaveLength(0);
    // Sampling the same material again costs again but confirms nothing new.
    actor(w).vitals.energy = 40;
    const again = step(w, {
      wren: mode('sample', { materials: [use(f.raw, 0.1)] }),
    }).world;
    expect(events(again, 'fiber-cord-sampled')).toHaveLength(1);
    expect(events(again, 'information-confirmed')).toHaveLength(0);
    expect(role(again, 'tested-lot')).toHaveLength(2);
  });

  it('sample: informative failures keep their real products; food, products and bad selections are refused at no cost', () => {
    const f = supplied();
    // Dry grass separates and bends, but no strand law exists: the limitation is reported.
    const g = gather(f.w, GRASS, 1);
    actor(g.w).vitals.energy = 40;
    let w = step(g.w, {
      wren: mode('sample', { materials: [use(g.item, 0.1)] }),
    }).world;
    expect(events(w, 'fiber-cord-sampled')[0]?.data).toMatchObject({
      resource: 'dry-grass',
      passed: false,
      separated: true,
      bentWithoutCracking: true,
      held: null,
      appliedForce: 0,
      strandLength: null,
    });
    expect(events(w, 'fiber-cord-sampled')[0]?.data.reason).toMatch(
      /not represented/,
    );
    expect(part(role(w, 'tested-lot')[0])).toMatchObject({
      condition: 1,
      passed: false,
    });
    // No cord can be made from dry grass.
    unchanged(w, make(g.item, 0.5), /No strand law/);
    unchanged(
      w,
      mode('make', {
        materials: [use(g.item, 0.2), use(f.raw, 0.2)],
        requestedLength: 0.3,
      }),
      /one fiber material from one source/,
    );
    // Branches have no thin stems.
    const b = gather(f.w, BRANCHES, 1);
    actor(b.w).vitals.energy = 40;
    w = step(b.w, {
      wren: mode('sample', { materials: [use(b.item, 0.1)] }),
    }).world;
    expect(events(w, 'fiber-cord-sampled')[0]?.data).toMatchObject({
      resource: 'branch',
      passed: false,
      separated: false,
      bentWithoutCracking: null,
      visibleFractures: false,
    });
    expect(role(w, 'tested-lot')[0]?.quantity).toBe(0.1);
    // A mat test scrap of condition 0, like Wren's item-78, is broken stock, not intact fiber.
    const s = v7Clone(f.w);
    relabel(
      s,
      f.raw,
      0.1,
      {
        fiberMatLot: {
          role: 'tested-scrap',
          condition: 0,
          from: f.raw,
          testedAt: 1,
        },
      },
      'item-fixture-scrap',
    );
    const before = reed(s);
    w = step(s, {
      wren: mode('sample', { materials: [use('item-fixture-scrap', 0.1)] }),
    }).world;
    expect(events(w, 'fiber-cord-sampled')[0]?.data).toMatchObject({
      processing: 'fiber-mat-tested-scrap',
      condition: 0,
      passed: false,
      reason: 'broken stems do not separate into continuous strands',
      visibleFractures: true,
    });
    const scrap = role(w, 'tested-scrap')[0];
    expect(part(scrap)).toMatchObject({ condition: 0, passed: false });
    expect(scrap?.processing?.fiberMatLot).toMatchObject({
      role: 'tested-scrap',
    });
    expect(item(w, 'item-fixture-scrap')).toBeUndefined();
    expect(reed(w)).toBe(before);
    // Refusals spend nothing.
    const root = gather(f.w, ROOTS, 1);
    unchanged(
      root.w,
      mode('sample', { materials: [use(root.item, 0.1)] }),
      /non-food/,
    );
    unchanged(
      f.w,
      mode('sample', { materials: [use(f.raw, 0.2)] }),
      /exactly 0.1/,
    );
    unchanged(
      f.w,
      mode('sample', { materials: [use('reed', 0.1)] }),
      /exact id/,
    );
    unchanged(
      f.w,
      mode('sample', { materials: [use(f.raw, 0.1)], trialForce: 5 }),
      /Irrelevant argument/,
    );
    const tired = v7Clone(f.w);
    actor(tired).vitals.energy = 0.4;
    unchanged(
      tired,
      mode('sample', { materials: [use(f.raw, 0.1)] }),
      /Insufficient energy/,
    );
    // Bodies just apart (0.44 m) but within the 0.49 m circle a 0.1 m test twist needs.
    const crowded = v7Clone(f.w);
    actor(crowded, 'kai').position = { x: REEDS.at.x + 0.46, y: REEDS.at.y };
    unchanged(
      crowded,
      mode('sample', { materials: [use(f.raw, 0.1)] }),
      /another person/,
    );
  });

  it('make: refuses uncovered, out-of-range, irrelevant, crowded or underpowered requests at no cost', () => {
    const s = supplied();
    unchanged(s.w, make(s.raw), /First pass a cord sample/);
    const f = sampled();
    unchanged(f.w, make(f.raw, 0.1), /0.2-1 unit/);
    unchanged(f.w, make(f.raw, 1.1), /0.2-1 unit/);
    unchanged(f.w, make(f.raw, 0.5, 0.31), /requestedLength/);
    unchanged(f.w, make(f.raw, 0.5, 0.04), /requestedLength/);
    unchanged(
      f.w,
      mode('make', { materials: [use(f.raw, 0.5)] }),
      /requestedLength/,
    );
    unchanged(
      f.w,
      mode('make', {
        materials: [use(f.raw, 0.5)],
        requestedLength: 0.3,
        trialForce: 10,
      }),
      /Irrelevant argument/,
    );
    unchanged(f.w, make('reed'), /exact id/);
    unchanged(
      f.w,
      mode('make', { workId: 'manual-1', requestedLength: 0.3 }),
      /workId/,
    );
    // A raw-reed sample does not cover plaited mat offcuts of the same reed.
    const o = v7Clone(f.w);
    relabel(
      o,
      f.raw,
      0.5,
      {
        fiberMatLot: {
          role: 'offcut',
          condition: 0.998,
          sourceOwner: 'wren',
          incorporatedAt: 1,
        },
      },
      'item-fixture-offcut',
    );
    unchanged(o, make('item-fixture-offcut'), /First pass a cord sample/);
    const crowded = v7Clone(f.w);
    actor(crowded, 'kai').position = { x: REEDS.at.x + 0.5, y: REEDS.at.y };
    unchanged(crowded, make(f.raw), /another person/);
    const tired = v7Clone(f.w);
    actor(tired).vitals.energy = 0.9;
    unchanged(tired, make(f.raw), /Not enough energy/);
    expect(job(f.w)).toBeUndefined();
  });

  it('make: four paid rounds of 1 energy twist 0.5 reed into one owned 0.30 m two-ply cord sized by conserved volume', () => {
    const f = sampled();
    const before = reed(f.w),
      load = v7Load(f.w, actor(f.w)),
      e0 = energy(f.w);
    const first = step(f.w, { wren: make(f.raw) });
    expect(first.outcomes.wren?.complete).toBe(false);
    expect(spent(f.w, first.world)).toBeCloseTo(1, 6);
    expect(visible(first.world).map((e) => e.type)).toEqual([
      'fiber-cord-started',
      'process-progress',
      'fiber-cord-progress',
    ]);
    const piece = item(first.world, job(first.world)?.target ?? '');
    expect(piece).toMatchObject({
      quantity: 0.5,
      owner: 'wren',
      reservedFor: job(first.world)?.id,
      origin: REEDS.source,
    });
    expect(part(piece)).toMatchObject({
      role: 'workpiece',
      status: 'aligned',
      classes: ['raw'],
      plies: 2,
      twisted: 0,
      length: 0.3,
    });
    expect(Number(part(piece).plyDiameter)).toBeCloseTo(
      plyDiameter(0.5, 0.3),
      8,
    );
    const progress = events(first.world, 'fiber-cord-progress')[0];
    expect(progress?.data).toMatchObject({
      round: 1,
      usableTenths: 5,
      brokenTenths: 0,
      strandLength: 1.8,
      handled: { incorporatedTenths: 5, scrapTenths: 0 },
      visual: { component: 'fiber-cord', plies: 2, state: 'aligned' },
    });
    // The reserved workpiece stays carried load; nothing vanished.
    expect(v7Load(first.world, actor(first.world))).toBeCloseTo(load, 8);
    expect(reed(first.world)).toBe(before);
    let w = first.world;
    const stages: unknown[] = [];
    for (let i = 1; i < 4; i++) {
      const r = step(w, { wren: make(f.raw) });
      expect(spent(w, r.world)).toBeCloseTo(1, 6);
      w = r.world;
      stages.push(events(w, 'fiber-cord-progress')[0]?.data.stage);
      expect(r.outcomes.wren?.complete).toBe(i === 3);
    }
    expect(stages).toEqual([
      'twist-first-section',
      'counter-ply-extend',
      undefined,
    ]);
    const done = events(w, 'fiber-cord-completed')[0],
      c = role(w, 'cord')[0];
    expect(done?.target).toBe(c?.id);
    expect(c?.id).toBe(piece?.id);
    expect(c).toMatchObject({ quantity: 0.5, owner: 'wren' });
    expect(c?.reservedFor).toBeUndefined();
    expect(part(c)).toMatchObject({
      role: 'cord',
      status: 'complete',
      untested: true,
      plied: true,
      plies: 2,
      length: 0.3,
      twisted: 0.3,
      overall: 0.34,
      looseEnds: 4,
      twist: { ply: 'S', lay: 'Z' },
    });
    expect(done?.data).toMatchObject({ outcome: 'complete', length: 0.3 });
    expect(Number(done?.data.plyDiameter)).toBeCloseTo(0.0064, 6);
    expect(job(w)).toMatchObject({
      status: 'completed',
      completedWork: 4,
      paidEnergy: 4,
    });
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(reed(w)).toBe(before);
    expect(v7Load(w, actor(w))).toBeCloseTo(load, 8);
    const waited = (() => {
      let x = f.w;
      for (let i = 0; i < 4; i++) x = step(x).world;
      return energy(x);
    })();
    expect(e0 - energy(w) - (e0 - waited)).toBeCloseTo(4, 6);
    // The make result is one verified record; no milestone, pleasure or comfort follows.
    expect(
      w.events.filter(
        (x) => x.type === 'information-confirmed' && x.interface === id,
      ),
    ).toHaveLength(1);
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(events(w, 'satisfaction')).toHaveLength(0);
    expect(JSON.stringify(actor(w).wellbeing.sources)).not.toContain(id);
    expect(JSON.stringify(visible(w).map((e) => e.data))).not.toMatch(HIDDEN);
  });

  it('make: Wren-style mat offcuts need their own sample, which covers a slightly more worn offcut', () => {
    const f = sampled();
    const w = v7Clone(f.w);
    const offcut = (condition: number) => ({
      fiberMatLot: {
        role: 'offcut',
        condition,
        sourceOwner: 'wren',
        incorporatedAt: 1,
      },
    });
    relabel(w, f.raw, 0.5, offcut(0.998), 'item-fixture-offcut-a');
    relabel(w, f.raw, 1, offcut(0.9975), 'item-fixture-offcut-b');
    let x = step(w, {
      wren: mode('sample', {
        materials: [use('item-fixture-offcut-a', 0.1)],
      }),
    }).world;
    expect(events(x, 'fiber-cord-sampled')[0]?.data).toMatchObject({
      processing: 'fiber-mat-offcut',
      condition: 0.998,
      passed: true,
    });
    actor(x).vitals.energy = 40;
    x = step(x, {
      wren: mode('make', {
        materials: [
          use('item-fixture-offcut-a', 0.4),
          use('item-fixture-offcut-b', 0.4),
        ],
        requestedLength: 0.25,
      }),
    }).world;
    const piece = item(x, job(x)?.target ?? '');
    expect(piece?.quantity).toBe(0.8);
    expect(part(piece)).toMatchObject({
      role: 'workpiece',
      classes: ['fiber-mat-offcut'],
      from: [
        expect.stringMatching(/^item-/) as unknown,
        expect.stringMatching(/^item-/) as unknown,
      ],
    });
    expect(Number(part(piece).condition)).toBeLessThan(1);
    expect(reed(x)).toBe(reed(w));
  });

  it('make: a measured first-round shortfall returns every reserved tenth once and charges only that round', () => {
    const f = sampled();
    const before = reed(f.w);
    const r = step(f.w, { wren: make(f.raw, 1, 0.05) });
    expect(r.outcomes.wren?.complete).toBe(true);
    expect(spent(f.w, r.world)).toBeCloseTo(1, 6);
    const e = events(r.world, 'fiber-cord-shortfall')[0];
    expect(e?.data.shortfall).toMatch(/thicker than 12 mm/);
    expect(Number(e?.data.plyDiameter)).toBeGreaterThan(0.012);
    const range = e?.data.feasibleLength as number[];
    expect(range[0]).toBeGreaterThan(0.15);
    expect(range[1]).toBe(0.3);
    expect(job(r.world)?.status).toBe('stopped');
    const returned = (job(r.world)?.escrow ?? []).map((x) => item(r.world, x));
    expect(returned.map((s) => s?.quantity)).toEqual([1]);
    expect(
      returned.every(
        (s) => s?.owner === 'wren' && !s.reservedFor && !s.processing,
      ),
    ).toBe(true);
    expect(role(r.world, 'workpiece')).toHaveLength(0);
    expect(reed(r.world)).toBe(before);
    // Within the measured range the same fiber is made.
    actor(r.world).vitals.energy = 40;
    const ok = step(r.world, {
      wren: make(returned[0]?.id ?? '', 1, 0.3),
    });
    expect(events(ok.world, 'fiber-cord-progress')).toHaveLength(1);
  });

  it('pauses uncharged when not worked, resumes only by workId, and cancel leaves the real workpiece', () => {
    const f = sampled();
    const before = reed(f.w);
    let w = step(f.w, { wren: make(f.raw) }).world;
    const workId = job(w)?.id ?? '';
    w = step(w, { wren: make(f.raw) }).world;
    // A round spent otherwise pauses the work; nothing is paid.
    w = step(w).world;
    expect(job(w)).toMatchObject({ status: 'paused', paidEnergy: 2 });
    expect(events(w, 'fiber-cord-paused')[0]?.data).toMatchObject({
      workId,
      remaining: 2,
    });
    unchanged(w, make(f.raw), /Unfinished cord work/);
    unchanged(
      w,
      mode('make', { workId, requestedLength: 0.3 }),
      /Irrelevant argument/,
    );
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.5;
    const low = step(tired, { wren: mode('make', { workId }) });
    expect(low.outcomes.wren?.success).toBe(true);
    expect(events(low.world, 'fiber-cord-paused')[0]?.data).toMatchObject({
      requiredEnergy: 1,
    });
    expect(spent(tired, low.world)).toBeCloseTo(0, 6);
    const back = step(w, { wren: mode('make', { workId }) });
    expect(events(back.world, 'fiber-cord-resumed')).toHaveLength(1);
    expect(events(back.world, 'fiber-cord-progress')[0]?.data.stage).toBe(
      'counter-ply-extend',
    );
    expect(spent(w, back.world)).toBeCloseTo(1, 6);
    // Cancel is energy-free; the incorporated fiber stays an owned unfinished workpiece.
    const r = step(back.world, { wren: mode('cancel') });
    expect(r.outcomes.wren?.success).toBe(true);
    expect(spent(back.world, r.world)).toBeCloseTo(0, 6);
    const piece = role(r.world, 'workpiece')[0];
    expect(piece).toMatchObject({ owner: 'wren', quantity: 0.5 });
    expect(piece?.reservedFor).toBeUndefined();
    expect(part(piece)).toMatchObject({
      status: 'unfinished',
      workId: null,
      twisted: 0.3,
      plied: true,
    });
    expect(job(r.world)).toMatchObject({ status: 'stopped', paidEnergy: 3 });
    expect(events(r.world, 'fiber-cord-cancelled')[0]?.target).toBe(piece?.id);
    expect(reed(r.world)).toBe(before);
    unchanged(r.world, mode('cancel'), /No unfinished cord work/);
    // The unfinished workpiece may be supplied whole to a new attempt, which pays every round again.
    actor(r.world).vitals.energy = 40;
    unchanged(r.world, make(piece?.id ?? '', 0.3), /whole/);
    const again = step(r.world, { wren: make(piece?.id ?? '', 0.5) });
    expect(again.outcomes.wren?.success).toBe(true);
    expect(spent(r.world, again.world)).toBeCloseTo(1, 6);
    expect(job(again.world)?.completedWork).toBe(1);
  });

  it('inspect records measurable features for 0.2 energy and leaves strength unknown', () => {
    const f = made();
    const r = step(f.w, { wren: mode('inspect', { targetId: f.cord }) });
    expect(r.outcomes.wren?.success).toBe(true);
    expect(spent(f.w, r.world)).toBeCloseTo(0.2, 6);
    const e = events(r.world, 'fiber-cord-inspected')[0];
    expect(e?.data).toMatchObject({
      item: f.cord,
      role: 'cord',
      length: 0.3,
      overallLength: 0.34,
      plies: 2,
      looseEnds: 4,
      frayedEnds: 0,
      breakingForce: null,
      reserved: false,
    });
    expect(e?.data.sectionRange).toEqual([0.0064, 0.0128]);
    expect(e?.data.unknown).toMatch(/breaking force/);
    expect(
      actor(r.world).memory.knowledge?.[`${f.cord}:fiber-cord-condition`]
        ?.verified,
    ).toBe(false);
    expect(events(r.world, 'information-confirmed')).toHaveLength(0);
    expect(item(r.world, f.cord)?.quantity).toBe(0.5);
    unchanged(
      f.w,
      mode('inspect', { targetId: f.cord, workId: 'manual-1' }),
      /exactly one/,
    );
    unchanged(f.w, mode('inspect', { targetId: f.raw }), /your own item/);
  });

  it('trial: a bounded two-hand pull records requested and achieved force, extension and damage, and can lose grip', () => {
    const f = made();
    const c0 = Number(part(item(f.w, f.cord)).condition);
    const r = step(f.w, {
      wren: mode('trial', {
        targetId: f.cord,
        trialForce: 50,
        trialDuration: 60,
      }),
    });
    expect(r.outcomes.wren?.success).toBe(true);
    expect(spent(f.w, r.world)).toBeCloseTo(0.5, 6);
    const held = events(r.world, 'fiber-cord-trial')[0];
    expect(held?.data).toMatchObject({
      outcome: 'held',
      requestedForce: 50,
      achievedForce: 50,
      heldSeconds: 60,
      strandsBroken: 0,
      conditionBefore: c0,
      conditionAfter: c0,
      freeSpan: 0.24,
    });
    expect(Number(held?.data.elasticExtension)).toBeGreaterThan(0);
    expect(part(item(r.world, f.cord))).toMatchObject({ untested: false });
    // Above the grip the cord slides through the hands: requested and achieved force differ.
    const grip = 10000 * 2 * plyDiameter(0.5, 0.3),
      slip = step(f.w, {
        wren: mode('trial', {
          targetId: f.cord,
          trialForce: 150,
          trialDuration: 60,
        }),
      }),
      e = events(slip.world, 'fiber-cord-trial')[0],
      ratio = grip / breakingForce(0.5, 0.3, c0);
    expect(e?.data).toMatchObject({
      outcome: 'grip-lost',
      requestedForce: 150,
      achievedForce: Math.round(grip * 10) / 10,
      gripSlippedAt: Math.round(grip * 10) / 10,
      heldSeconds: 0,
    });
    expect(Number(e?.data.strandsBroken)).toBeCloseTo(ratio - 0.5, 4);
    expect(Number(e?.data.conditionAfter)).toBeCloseTo(
      c0 * (1 - (ratio - 0.5)),
      4,
    );
    expect(item(slip.world, f.cord)?.quantity).toBe(0.5);
    // A weakened hand bounds the force of a thick cord.
    const thick = made(1, 0.3);
    actor(thick.w).vitals.health = 50;
    const weak = step(thick.w, {
      wren: mode('trial', {
        targetId: thick.cord,
        trialForce: 150,
        trialDuration: 1080,
      }),
    });
    expect(events(weak.world, 'fiber-cord-trial')[0]?.data).toMatchObject({
      outcome: 'held',
      achievedForce: 100,
      handLimit: 100,
      heldSeconds: 1080,
    });
    // Refusals spend nothing.
    unchanged(
      f.w,
      mode('trial', { targetId: f.cord, trialForce: 50 }),
      /trialDuration/,
    );
    unchanged(
      f.w,
      mode('trial', {
        targetId: f.cord,
        trialForce: 50,
        trialDuration: 1081,
      }),
      /trialDuration/,
    );
    unchanged(
      f.w,
      mode('trial', { targetId: f.raw, trialForce: 50, trialDuration: 60 }),
      /finished cord/,
    );
  });

  it('trial: repeated loads never strengthen a cord, and a break leaves two owned fragments of conserved fiber', () => {
    const f = made();
    const before = reed(f.w);
    let w = f.w;
    const conditions: number[] = [],
      outcomes: string[] = [];
    for (let i = 0; i < 6 && !outcomes.includes('broke'); i++) {
      actor(w).vitals.energy = 40;
      w = step(w, {
        wren: mode('trial', {
          targetId: f.cord,
          trialForce: 120,
          trialDuration: 30,
        }),
      }).world;
      const e = events(w, 'fiber-cord-trial')[0];
      conditions.push(Number(e?.data.conditionBefore));
      const outcome = e?.data.outcome;
      outcomes.push(typeof outcome === 'string' ? outcome : '');
    }
    for (let i = 1; i < conditions.length; i++)
      expect(conditions[i]).toBeLessThan(conditions[i - 1] ?? 0);
    expect(outcomes.at(-1)).toBe('broke');
    expect(outcomes.slice(0, -1).every((o) => o === 'held')).toBe(true);
    const pieces = role(w, 'fragment');
    expect(pieces.map((s) => s.quantity)).toEqual([0.2, 0.3]);
    expect(item(w, f.cord)).toBeUndefined();
    expect(reed(w)).toBe(before);
    const ids = pieces.map((s) => s.id);
    for (const s of pieces) {
      expect(s).toMatchObject({ owner: 'wren', origin: REEDS.source });
      expect(part(s)).toMatchObject({
        role: 'fragment',
        status: 'broken',
        fragmentOf: f.cord,
        fragments: ids,
        length: 0.15,
        overall: 0.17,
        frayedEnds: 1,
      });
    }
    const broken = events(w, 'fiber-cord-broken')[0];
    expect(broken?.data.fragments).toEqual(ids);
    expect(broken?.data.heldSeconds).toBe(0);
    // A fragment is a shorter cord that can itself be trialled.
    actor(w).vitals.energy = 40;
    const again = step(w, {
      wren: mode('trial', {
        targetId: ids[1] ?? '',
        trialForce: 10,
        trialDuration: 10,
      }),
    });
    expect(again.outcomes.wren?.success).toBe(true);
  });

  it('trial: a thin cord breaks at its breaking force, and lots too small or short to grip are refused', () => {
    const f = made(0.2, 0.3);
    const c0 = Number(part(item(f.w, f.cord)).condition),
      strength = breakingForce(0.2, 0.3, c0);
    const r = step(f.w, {
      wren: mode('trial', {
        targetId: f.cord,
        trialForce: 100,
        trialDuration: 60,
      }),
    });
    const e = events(r.world, 'fiber-cord-trial')[0];
    expect(e?.data).toMatchObject({
      outcome: 'broke',
      requestedForce: 100,
      achievedForce: Math.round(strength * 10) / 10,
      conditionAfter: Math.round(c0 * 0.5 * 1e8) / 1e8,
    });
    const pieces = role(r.world, 'fragment');
    expect(pieces.map((s) => s.quantity)).toEqual([0.1, 0.1]);
    actor(r.world).vitals.energy = 40;
    unchanged(
      r.world,
      mode('trial', {
        targetId: pieces[0]?.id ?? '',
        trialForce: 5,
        trialDuration: 5,
      }),
      /at least 0.2 units/,
    );
    const short = made(0.2, 0.05);
    unchanged(
      short.w,
      mode('trial', {
        targetId: short.cord,
        trialForce: 5,
        trialDuration: 5,
      }),
      /two hands need 0.12 m/,
    );
  });

  it('worked fiber wears 0.0005 condition per round; raw fiber and tested lots do not', () => {
    const f = made();
    const c0 = Number(part(item(f.w, f.cord)).condition),
      lot = role(f.w, 'tested-lot')[0];
    let w = f.w;
    for (let i = 0; i < 4; i++) w = step(w).world;
    expect(Number(part(item(w, f.cord)).condition)).toBeCloseTo(
      c0 - 4 * 0.0005,
      8,
    );
    expect(role(w, 'tested-lot')[0]).toEqual(lot);
    expect(item(w, f.raw)?.processing).toBeUndefined();
  });

  it('keeps the work personal: another person cannot resume, inspect, trial or cancel it', () => {
    const f = made();
    let w = step(f.w, { wren: make(f.raw) }).world;
    const workId = job(w)?.id ?? '';
    w = v7Clone(w);
    actor(w, 'kai').mastered.push(id);
    actor(w, 'kai').position = { x: REEDS.at.x - 2, y: REEDS.at.y };
    unchanged(
      w,
      mode('make', { workId }),
      /No unfinished cord work of yours/,
      'kai',
    );
    unchanged(w, mode('inspect', { workId }), /No cord work of yours/, 'kai');
    unchanged(
      w,
      mode('trial', { targetId: f.cord, trialForce: 5, trialDuration: 5 }),
      /your own finished cord/,
      'kai',
    );
    unchanged(w, mode('cancel', { workId }), /No unfinished cord work/, 'kai');
  });

  it('stops at death, leaving reserved fiber and the unfinished workpiece on the ground once', () => {
    const f = sampled();
    const w = step(f.w, { wren: make(f.raw) }).world;
    const piece = job(w)?.target ?? '';
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    const dead = v7Clone(w);
    pkg?.onDeath?.(dead, actor(dead));
    expect(job(dead)?.status).toBe('stopped');
    expect(events(dead, 'fiber-cord-failed')).toHaveLength(1);
    const at = actor(dead).position,
      s = item(dead, piece);
    expect(s).toMatchObject({ owner: null, position: at, quantity: 0.5 });
    expect(s?.reservedFor).toBeUndefined();
    expect(part(s)).toMatchObject({ status: 'unfinished', workId: null });
    expect(reed(dead)).toBe(reed(w));
  });
});
