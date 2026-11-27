import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  openConditions,
  v7Clone,
  v7Install,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Data,
  V7Object,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';
import { packagesBefore } from './support/goal-pair-package-snapshot.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 60_000 });

const id = 'rooted-plant-watering';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition|history/i;
/** sha256 of JSON.stringify of the map from id@version to the sha256 of JSON.stringify of each
 * of the 114 packages registered before this change, in registration order. */
const EXISTING_DIGEST =
  '5d5aa20164a44a8d10bc4cf7c5dbdfcc76e9e9aa55cd997ee3f5ee1553dedd56';
/** The east bank of river cell 28,14 (x 26-29 river, x 29-31 wet bank, x 31-32 ordinary soil). */
const BANK = { x: 29.4, y: 14.5 };
const RIVER = { x: 28, y: 14 };
/** Within reach of the plots rooted in cell 31,14, 0.8 m (one round) from the bank. */
const PLOT_SIDE = { x: 30.2, y: 14.5 };

type Hands = {
  litres: number;
  collected: number;
  poured: number;
  delivered: number;
  pourSpilled: number;
  carrySpilled: number;
};
type Cell = {
  litres: number;
  received: number;
  runoff: number;
  drained: number;
  evaporated: number;
};

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
const actor = (w: V7World, name = 'lin'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string, who = 'lin') =>
  w.events.filter((e) => e.type === type && e.actor === who);
const data = (w: V7World, type: string) =>
  events(w, type).at(-1)?.data as Record<string, unknown> | undefined;
const hands = (w: V7World) =>
  w.state[`${id}:hands:lin`] as unknown as Hands | undefined;
const cell = (w: V7World, x: number, y: number) =>
  w.state[`root-zone-water:${String(x)}:${String(y)}`] as unknown as
    Cell | undefined;
const act = (mode: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});
const collect = (extra: Record<string, unknown> = {}) =>
  act('collect', { ...RIVER, ...extra });
const pour = (target: string, extra: Record<string, unknown> = {}) =>
  act('water', { target, ...extra });
function genesis() {
  return initialLongWorld('long-ex23', 'long-culture-v2-oldgoal', {
    seed: 20261203,
    development: 8,
    tokens: 1500000,
  });
}
function installed() {
  const g = genesis();
  return v7Clone(v7Install(g, continuousRegistry(g), `${id}@1`));
}
/** A copy where everyone is fed and Lin has the given energy and position. */
function with_(
  w: V7World,
  v: { energy?: number; at?: { x: number; y: number } } = {},
) {
  const copy = v7Clone(w);
  for (const a of copy.actors.filter((a) => a.vitals.health > 0))
    a.vitals.satiety = 80;
  const lin = actor(copy);
  if (v.energy !== undefined) lin.vitals.energy = v.energy;
  if (v.at) lin.position = { ...v.at };
  return copy;
}
/** Lin, studied (three rounds), fed, with 30 energy, on the bank of river cell 28,14. */
function setup(opts: { study?: boolean } = {}) {
  let w = installed();
  if (opts.study ?? true) {
    w = step(w, { lin: { interface: 'learn', args: { ability: id } } }).world;
    expect(actor(w).learning).toMatchObject({ ability: id, remaining: 2 });
    w = step(w).world;
    expect(actor(w).mastered).not.toContain(id);
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  }
  return with_(w, { energy: 30, at: BANK });
}
/** A growing plant rooted at the given point. */
function plant(
  w: V7World,
  oid: string,
  resource: string,
  x: number,
  y: number,
): V7World {
  const copy = v7Clone(w);
  const o: V7Object = {
    id: oid,
    name: resource,
    kind: 'plant',
    spatial: {
      x,
      y,
      angle: 0,
      shape: { kind: 'circle', radius: 0.25 },
      solid: false,
      interaction: 0.65,
      entrances: [],
    },
    visual: {
      component: 'plant',
      color: '#557744',
      accent: '#557744',
      label: resource,
      state: 'growing',
    },
    data: { resource, stock: 0, capacity: 4, interval: 16, growth: 0 },
    createdBy: null,
    createdAt: 0,
    revision: 'foundation-forest@1',
  };
  copy.objects.push(o);
  return copy;
}
/** The action fails and changes no vitals, stacks, objects or watering state compared with
 * waiting. */
function unchanged(w: V7World, action: V7Action) {
  const result = step(w, { lin: action }),
    idle = step(w).world;
  expect(result.outcomes.lin?.success).toBe(false);
  expect(actor(result.world).vitals).toEqual(actor(idle).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  const watering = (x: V7World) =>
    Object.entries(x.state).filter(
      ([k]) => k.startsWith(`${id}:`) || k.startsWith('root-zone-water:'),
    );
  expect(v7Signature(watering(result.world))).toBe(v7Signature(watering(idle)));
  expect(events(result.world, 'plant-watering-poured')).toEqual([]);
  expect(events(result.world, 'plant-watering-collected')).toEqual([]);
  return result.outcomes.lin?.reason ?? '';
}
/** Collect at the bank, walk 0.8 m east in one round and stand within reach of a tuber plot
 * rooted on ordinary soil in cell 31,14 (moisture 0.65, tuber requirement 0.8). */
function carried() {
  let w = plant(setup(), 'test-tuber', 'tuber', 31.2, 14.5);
  w = plant(w, 'test-tuber-2', 'tuber', 31.6, 14.85);
  const r1 = step(w, { lin: collect() });
  expect(r1.outcomes.lin?.success).toBe(true);
  const collected = r1.world;
  const r2 = step(with_(collected), {
    lin: { interface: 'navigate', args: { target: '', ...PLOT_SIDE } },
  });
  expect(r2.outcomes.lin?.success).toBe(true);
  return { before: w, collected, walked: with_(r2.world) };
}

describe('rooted plant watering in ex23', () => {
  it('is scoped to ex23, fits the size limit, is learned in three rounds and leaves existing packages byte-identical', () => {
    const other = initialLongWorld('long-ex22', 'long-culture-v2');
    expect(continuousRegistry(other).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(other, continuousRegistry(), `${id}@1`)).toThrow(
      /not approved/,
    );
    const g = genesis();
    const pkg = V7_PACKAGES.find((p) => p.id === id);
    const ability = pkg?.abilities[0];
    if (!pkg || !ability) throw new Error('Missing package.');
    // The first ex23 development's package comes first; later ex23 developments follow it.
    expect(V7_PACKAGES.filter((p) => p.scope === 'long-ex23')[0]).toBe(pkg);
    expect(pkg.scope).toBe('long-ex23');
    expect(pkg.visualComponents).toEqual([]);
    expect(pkg.satisfaction).toEqual([]);
    expect(pkg.resources).toEqual([]);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 3,
      revision: `${id}@1`,
      authored: false,
      references: { target: 'optional-exact-visible' },
      practiceEvidence: 'plant-watering-poured',
      equivalence: 'plant:root-zone-water-dose:1',
    });
    expect(ability.learningEnergy).toBeUndefined();
    expect(ability.parameters.properties?.mode).toMatchObject({
      enum: ['collect', 'water', 'status'],
    });
    const handlers = V7_PACKAGES.flatMap((p) => Object.keys(p.handlers));
    expect(handlers.filter((h) => h === `long.${id}`)).toHaveLength(1);
    const equivalences = V7_PACKAGES.flatMap((p) =>
      p.abilities.map((a) => a.equivalence),
    );
    expect(equivalences.filter((e) => e === ability.equivalence)).toHaveLength(
      1,
    );
    for (const p of V7_PACKAGES.filter((p) => p !== pkg))
      expect(p.events ?? []).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^plant-watering-/)]),
      );
    const limit = g.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg.abilities,
      events: pkg.events,
    });
    expect(visible).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    // Every package registered before this change is byte-identical.
    const existing = packagesBefore(pkg);
    expect(existing).toHaveLength(114);
    const map = Object.fromEntries(
      existing.map((p) => [
        `${p.id}@${String(p.version)}`,
        createHash('sha256').update(JSON.stringify(p)).digest('hex'),
      ]),
    );
    expect(createHash('sha256').update(JSON.stringify(map)).digest('hex')).toBe(
      EXISTING_DIGEST,
    );
    // Unstudied use is refused at no cost; three study rounds master it.
    const f = with_(setup({ study: false }), { energy: 30, at: BANK });
    expect(unchanged(f, collect())).toMatch(/master|learn|stud/i);
  });

  it('collects 0.2 L by hand at a reachable bank for 0.3 energy, and refuses before cost elsewhere', () => {
    const w = setup();
    const r = step(w, { lin: collect() });
    expect(r.outcomes.lin?.success).toBe(true);
    expect(actor(r.world).vitals.energy).toBeCloseTo(
      actor(step(w).world).vitals.energy - 0.3,
      8,
    );
    expect(data(r.world, 'plant-watering-collected')).toMatchObject({
      source: 'river:28:14',
      litres: 0.2,
      held: 0.2,
      carrier: 'hands',
      energy: 0.3,
      finiteSource: false,
      view: { operation: id, phase: 'collect', carrier: 'hands' },
    });
    // Hand water is actor state, not an inventory item.
    expect(v7Signature(r.world.stacks)).toBe(v7Signature(step(w).world.stacks));
    // Not water: the wet bank cell 30,14.
    expect(unchanged(w, collect({ x: 30 }))).toMatch(/not river or shallow/);
    // Too far from the edge.
    const far = with_(w, { at: { x: 30.3, y: 14.5 } });
    expect(unchanged(far, collect())).toMatch(/0\.65 m/);
    // Too little energy.
    expect(unchanged(with_(w, { energy: 0.2 }), collect())).toMatch(
      /needs 0\.3 energy/,
    );
    // A second scoop tops the hands up to 0.2 L after the round-end leak (0.2 x 0.6 = 0.12).
    expect(hands(r.world)?.litres).toBe(0.12);
    const top = step(with_(r.world), { lin: collect() });
    expect(data(top.world, 'plant-watering-collected')).toMatchObject({
      litres: 0.08,
      held: 0.2,
    });
    // Full hands: no scoop is possible within the same round state.
    const full = with_(r.world);
    const h = full.state[`${id}:hands:lin`] as Record<string, number>;
    h.litres = 0.2;
    expect(unchanged(full, collect())).toMatch(/hands already hold/);
  });

  it('loses hand water at each round end and with distance walked, with the ledger closed', () => {
    const { collected, walked } = carried();
    // The collection round end: 40% of 0.2 L leaks.
    expect(hands(collected)).toMatchObject({
      litres: 0.12,
      collected: 0.2,
      carrySpilled: 0.08,
    });
    const spill = data(walked, 'plant-watering-spilled');
    const d = Number(spill?.walked);
    expect(d).toBeGreaterThan(0.7);
    const left = 0.12 * 0.6 * Math.pow(0.8, d);
    expect(hands(walked)?.litres).toBeCloseTo(left, 7);
    const h = hands(walked);
    if (!h) throw new Error('Missing hands.');
    expect(h.collected).toBeCloseTo(h.litres + h.poured + h.carrySpilled, 8);
    // Held water left alone drains away to nothing within a few rounds.
    let w = walked;
    for (let i = 0; i < 8; i++) w = with_(step(w).world);
    expect(hands(w)?.litres).toBe(0);
    expect(hands(w)?.carrySpilled).toBeCloseTo(0.2, 8);
  });

  it('pours onto a dry rooted plot: real costs, pour loss, retained water raises the shared cell moisture, then evaporates, conserved throughout', () => {
    const { walked } = carried();
    const held = hands(walked)?.litres ?? 0;
    expect(held).toBeGreaterThan(0.05);
    const before = openConditions(walked, { x: 31.2, y: 14.5 });
    expect(before).toMatchObject({ ground: '.', moisture: 0.65 });
    const other = openConditions(walked, { x: 32.5, y: 14.5 });
    const r = step(walked, { lin: pour('test-tuber') });
    expect(r.outcomes.lin?.success).toBe(true);
    const w = r.world;
    // 2 energy per litre poured.
    expect(actor(w).vitals.energy).toBeCloseTo(
      actor(step(walked).world).vitals.energy - 2 * held,
      7,
    );
    const p = data(w, 'plant-watering-poured');
    expect(p).toMatchObject({
      target: 'test-tuber',
      cell: '31:14',
      carrier: 'hands',
      poured: held,
      runoff: 0,
      requirement: 0.8,
      moistureBefore: 0.65,
      growthClaimed: false,
      view: { operation: id, phase: 'pour', target: 'test-tuber' },
    });
    expect(p?.sharedBy).toEqual(['test-tuber', 'test-tuber-2']);
    expect(Number(p?.spilled)).toBeCloseTo(held * 0.2, 8);
    expect(Number(p?.retained)).toBeCloseTo(held * 0.8, 8);
    // The same round's evaporation already took 10% of it after the pour.
    const c = cell(w, 31, 14);
    if (!c) throw new Error('Missing root-zone record.');
    expect(c.received).toBeCloseTo(held * 0.8, 8);
    expect(c.evaporated).toBeCloseTo(c.received * 0.1, 7);
    expect(c.received).toBeCloseTo(
      c.litres + c.runoff + c.drained + c.evaporated,
      8,
    );
    const after = openConditions(w, { x: 31.2, y: 14.5 });
    expect(after.moisture).toBeCloseTo(0.65 + c.litres / 30, 7);
    expect(after.rootZoneWater).toBeCloseTo(c.litres / 30, 7);
    // Both plants rooted in the cell share it; a neighbouring cell is unchanged.
    expect(openConditions(w, { x: 31.6, y: 14.85 }).moisture).toBe(
      after.moisture,
    );
    expect(openConditions(w, { x: 32.5, y: 14.5 })).toEqual(other);
    // The existing plant update reads it as soil moisture; nothing else of the plant changed.
    const t = w.objects.find((o) => o.id === 'test-tuber');
    expect(t?.data.soil).toBeGreaterThan(0.65);
    expect(t?.data.stock).toBe(0);
    // Hands ledger: everything collected is held, poured or spilled.
    const h = hands(w);
    if (!h) throw new Error('Missing hands.');
    expect(h.litres).toBe(0);
    expect(h.collected).toBeCloseTo(h.poured + h.carrySpilled, 8);
    expect(h.poured).toBeCloseTo(h.delivered + h.pourSpilled, 8);
    // No reward, finding or practice milestone.
    for (const type of [
      'practice-confirmed',
      'information-confirmed',
      'finding-accepted',
    ])
      expect(events(w, type)).toEqual([]);
    // Evaporation empties the root zone and the moisture is ground-derived again.
    let x = w,
      rounds = 0;
    while ((cell(x, 31, 14)?.litres ?? 0) > 0 && rounds < 60) {
      x = with_(step(x).world);
      rounds++;
    }
    expect(rounds).toBeGreaterThan(20);
    const dry = cell(x, 31, 14);
    expect(dry?.litres).toBe(0);
    expect(dry?.received).toBeCloseTo(
      (dry?.runoff ?? 0) + (dry?.drained ?? 0) + (dry?.evaporated ?? 0),
      8,
    );
    expect(x.events.some((e) => e.type === 'plant-watering-plot-dry')).toBe(
      true,
    );
    expect(openConditions(x, { x: 31.2, y: 14.5 })).toEqual(
      openConditions(installed(), { x: 31.2, y: 14.5 }),
    );
    // With nothing held, a second pour is refused before cost.
    const empty = with_(x, { at: PLOT_SIDE });
    expect(unchanged(empty, pour('test-tuber'))).toMatch(/no water; collect/);
  });

  it('applies saturation runoff, drainage above field capacity and evaporation per round', () => {
    const w = with_(setup());
    // 20 L in an ordinary cell: moisture 0.65 + 0.667 is above saturation 1.3.
    w.state['root-zone-water:31:14'] = {
      x: 31,
      y: 14,
      litres: 20,
      received: 20,
      runoff: 0,
      drained: 0,
      evaporated: 0,
      lastTick: w.tick,
    };
    const c = cell(step(w).world, 31, 14);
    if (!c) throw new Error('Missing root-zone record.');
    const runoff = (0.65 + 20 / 30 - 1.3) * 30;
    const drained = (1.3 - 1) * 30 * 0.5;
    expect(c.runoff).toBeCloseTo(runoff, 6);
    expect(c.drained).toBeCloseTo(drained, 6);
    expect(c.evaporated).toBeCloseTo(0.0375, 8);
    expect(c.litres).toBeCloseTo(20 - runoff - drained - 0.0375, 6);
    expect(c.received).toBeCloseTo(
      c.litres + c.runoff + c.drained + c.evaporated,
      8,
    );
  });

  it("refuses with the measured values before any cost when watering is not justified, including Lin's berry plant", () => {
    const w = setup();
    const held = with_(step(w, { lin: collect() }).world);
    // commons-berry-0-0 on ordinary soil: 0.65 already meets the berry requirement 0.6.
    const berry = with_(held, { at: { x: 17.3, y: 14.4 } });
    expect(unchanged(berry, pour('commons-berry-0-0'))).toMatch(
      /Not needed: soil moisture 0\.65, waterlogging 0, requirement 0\.6 for berry/,
    );
    // forest-tuber-2 on the wet bank: 0.9 already meets the tuber requirement 0.8.
    const tuber = with_(held, { at: { x: 24.9, y: 15.3 } });
    expect(unchanged(tuber, pour('forest-tuber-2'))).toMatch(
      /Not needed: soil moisture 0\.9, waterlogging 0, requirement 0\.8 for tuber/,
    );
    // Visible but out of reach.
    const away = with_(held, { at: { x: 16.2, y: 15 } });
    expect(unchanged(away, pour('commons-berry-0-0'))).toMatch(
      /within your reach/,
    );
  });

  it('refuses a waterlogged plot before any cost, with the measured values', () => {
    // The river waterlogging zone at 22,22 is fully active at tick 540.
    const w = setup();
    const held = with_(step(w, { lin: collect() }).world, {
      at: { x: 20.6, y: 21.3 },
    });
    held.tick = 540;
    const k = openConditions(held, { x: 21.2, y: 21.3 });
    expect(k.waterlogging).toBeGreaterThan(0.1);
    expect(unchanged(held, pour('forest-root-1'))).toMatch(
      /is waterlogged \(soil moisture 1\.5, waterlogging 0\.\d+, requirement 0\.5 for root\)/,
    );
  });

  it('waters only the soil plot of a rooted growing plant', () => {
    let w = setup();
    w = with_(step(w, { lin: collect() }).world);
    // A reed bed does not grow under the plant rules; an item, bare ground or nothing is refused.
    const reed = with_(w, { at: { x: 23.2, y: 4.6 } });
    expect(unchanged(reed, pour('forest-reed-0'))).toMatch(
      /not a growing plant rooted in the ground/,
    );
    const stone: V7Stack = {
      id: 'test-stone',
      resource: 'stone',
      quantity: 1,
      position: { ...actor(w).position },
      owner: null,
      origin: 'test-fixture',
    };
    const ground = v7Clone(w);
    ground.stacks.push(stone);
    expect(unchanged(ground, pour('test-stone'))).toMatch(
      /not a growing plant|soil plot/,
    );
    expect(unchanged(w, act('water'))).toMatch(/Give target/);
    expect(unchanged(w, pour('river:28:14'))).not.toBe('');
  });

  it('uses an existing water vessel without hand leakage, with a smaller pour loss, and refuses a non-vessel container', () => {
    let w = plant(setup(), 'test-tuber', 'tuber', 31.2, 14.5);
    const cup: V7Stack = {
      id: 'test-cup',
      resource: 'clay',
      quantity: 1,
      position: { ...actor(w).position },
      owner: 'lin',
      origin: 'test-fixture',
      waterCup: {
        capacityMl: 100,
        waterMl: 0,
        wallMass: 0.5,
        wallWaterFraction: 0.2,
        leakedMl: 0,
        erodedClay: 0,
        withdrawnMl: 0,
        contactMl: 0,
        provenance: [],
        radius: 0.03,
        height: 0.07,
        contamination: 'unknown',
      },
    };
    const stone: V7Stack = {
      id: 'test-pebble',
      resource: 'stone',
      quantity: 1,
      position: { ...actor(w).position },
      owner: 'lin',
      origin: 'test-fixture',
    };
    w.stacks.push(cup, stone);
    expect(unchanged(w, collect({ container: 'test-pebble' }))).toMatch(
      /not a water vessel/,
    );
    const r = step(w, { lin: collect({ container: 'test-cup' }) });
    expect(r.outcomes.lin?.success).toBe(true);
    const filled = r.world.stacks.find((s) => s.id === 'test-cup');
    expect(filled?.waterCup?.waterMl).toBe(100);
    expect(hands(r.world)).toBeUndefined();
    w = with_(r.world, { at: PLOT_SIDE });
    const p = step(w, { lin: pour('test-tuber', { container: 'test-cup' }) });
    expect(p.outcomes.lin?.success).toBe(true);
    expect(data(p.world, 'plant-watering-poured')).toMatchObject({
      carrier: 'test-cup',
      poured: 0.1,
      spilled: 0.005,
      retained: 0.095,
    });
    expect(
      p.world.stacks.find((s) => s.id === 'test-cup')?.waterCup?.waterMl,
    ).toBe(0);
  });

  it('is gated: without the revision, or without delivered water, soil moisture and replay are unchanged', () => {
    const g = genesis();
    const ready = installed();
    const plants = g.objects.filter((o) => o.kind === 'plant');
    // Installed but nothing delivered: every plant reads exactly the ground-derived soil.
    for (const o of plants)
      expect(openConditions(ready, o.spatial)).toEqual(
        openConditions(g, o.spatial),
      );
    // A root-zone record in a world without the revision has no effect on soil or replay.
    const record: V7Data = {
      x: 17,
      y: 14,
      litres: 6,
      received: 6,
      runoff: 0,
      drained: 0,
      evaporated: 0,
      lastTick: 0,
    };
    const stray = v7Clone(g);
    stray.state['root-zone-water:17:14'] = record;
    expect(openConditions(stray, { x: 17.88, y: 14.13 })).toEqual(
      openConditions(g, { x: 17.88, y: 14.13 }),
    );
    let a = g,
      b = stray;
    for (let i = 0; i < 3; i++) {
      a = step(a).world;
      b = step(b).world;
    }
    expect(b.state['root-zone-water:17:14']).toEqual(record);
    delete b.state['root-zone-water:17:14'];
    expect(v7Signature(b)).toBe(v7Signature(a));
    // With the revision the same record is read.
    const live = v7Clone(ready);
    live.state['root-zone-water:17:14'] = record;
    expect(openConditions(live, { x: 17.88, y: 14.13 }).moisture).toBeCloseTo(
      0.65 + 6 / 30,
      8,
    );
  });

  it('reports status at no energy', () => {
    const w = setup();
    const near = with_(w, { at: { x: 17.3, y: 14.4 } });
    const r = step(near, {
      lin: act('status', { target: 'commons-berry-0-0' }),
    });
    expect(r.outcomes.lin?.success).toBe(true);
    expect(actor(r.world).vitals.energy).toBe(
      actor(step(near).world).vitals.energy,
    );
    expect(data(r.world, 'plant-watering-status')).toMatchObject({
      carrier: 'hands',
      litres: 0,
      plot: {
        target: 'commons-berry-0-0',
        moisture: 0.65,
        requirement: 0.6,
        rootZone: null,
      },
    });
  });
});
