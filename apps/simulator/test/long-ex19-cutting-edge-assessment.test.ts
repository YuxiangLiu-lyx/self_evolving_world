import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Distance,
  v7Install,
  v7ShapeDistance,
  v7Signature,
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

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 90_000 });

const id = 'cutting-edge-assessment';
const AIR = 'food-air-exposure-trial';
const SLICE = 'thin-slice-food-drying-trial';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** The weathered stone source Moss named in the ex19 request, and nearby sources. */
const STONE = 'start-2-stone';
const BERRIES = 'start-2-berries';
const OAK = 'forest-oak-0';
const ROOTS = 'start-0-roots';
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition/i;
/** A firm, unobstructed spot beside the root source where a root layer fits (as in the drying
 * trial's own test). */
const STAND = { x: 10.1, y: 12.6 };
const SPOT = { x: 10.5, y: 12.9 };

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
const actor = (w: V7World, name = 'moss'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === type);
const data = (w: V7World, type: string) =>
  events(w, type).at(-1)?.data as Record<string, unknown> | undefined;
const stack = (w: V7World, item: string): V7Stack => {
  const s = w.stacks.find((s) => s.id === item);
  if (!s) throw new Error(`Missing stack ${item}.`);
  return s;
};
const stock = (w: V7World, object: string) =>
  Number(w.objects.find((o) => o.id === object)?.data.stock);
const act = (mode: string, extra: V7Action['args'] = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});
/** Keep everyone fed and rested so the tests isolate the operation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
/** A free standing point for `who` at distance d from (x, y). */
function free(w: V7World, x: number, y: number, d: number, who: string) {
  for (let k = 0; k < 16; k++) {
    const p = {
      x: x + d * Math.cos((k * Math.PI) / 8),
      y: y + d * Math.sin((k * Math.PI) / 8),
    };
    if (
      w.objects.every(
        (o) => !o.spatial.solid || v7ShapeDistance(p, o.spatial) > 0.25,
      ) &&
      w.actors.every((a) => a.id === who || v7Distance(a.position, p) > 0.5)
    )
      return p;
  }
  throw new Error('No free fixture position.');
}
/** Stand within reach of an object (shape distance 0.45). */
function near(w: V7World, object: string, who = 'moss') {
  const o = w.objects.find((x) => x.id === object);
  if (!o) throw new Error('Missing fixture object.');
  const r = o.spatial.shape.kind === 'circle' ? o.spatial.shape.radius : 0.3;
  actor(w, who).position = free(w, o.spatial.x, o.spatial.y, r + 0.45, who);
  return w;
}
function gather(w: V7World, source: string, who = 'moss') {
  near(w, source, who);
  const r = step(w, {
    [who]: { interface: 'gather', args: { target: source, quantity: 1 } },
  });
  expect(r.outcomes[who]?.success).toBe(true);
  const item = r.world.events.find(
    (e) => e.type === 'gathered' && e.actor === who,
  )?.data.item;
  if (typeof item !== 'string') throw new Error('Missing gathered item.');
  return { w: fed(r.world), item };
}
function genesis() {
  return initialLongWorld('long-ex19', 'long-culture-v2-oldgoal', {
    seed: 20261201,
    development: 8,
    tokens: 1500000,
  });
}
/** The ex19 world with its installed drying trials, then this package. */
function installed() {
  let w = genesis();
  for (const p of [AIR, SLICE, id])
    w = v7Clone(v7Install(w, continuousRegistry(w), `${p}@1`));
  return fed(w);
}
/** The action fails and changes no vitals, stacks, objects or state compared with waiting. */
function unchanged(w: V7World, action: V7Action, who = 'moss') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  expect(v7Signature(result.world.state)).toBe(v7Signature(idle.state));
  expect(actor(result.world, who).memory.knowledge).toEqual(
    actor(idle, who).memory.knowledge,
  );
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action, who = 'moss') {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.reason ?? '').not.toMatch(/Nothing was spent/);
  expect(r.outcomes[who]?.success).toBe(true);
  return {
    world: r.world,
    idle,
    energy: actor(idle, who).vitals.energy - actor(r.world, who).vitals.energy,
  };
}

let base: { w: V7World; stone: string; oak: string; root: string } | null =
  null;
/** Moss studies three rounds, gathers one weathered stone, one oak piece and one root, and
 * stands beside the stone source; every test works on its own copy. */
function setup() {
  if (!base) {
    let w = installed();
    w = step(w, { moss: { interface: 'learn', args: { ability: id } } }).world;
    for (let i = 0; i < 2; i++) w = step(fed(w)).world;
    expect(actor(w).mastered).toContain(id);
    const s = gather(fed(w), STONE);
    const o = gather(s.w, OAK);
    const r = gather(o.w, ROOTS);
    base = { w: near(r.w, STONE), stone: s.item, oak: o.item, root: r.item };
  }
  return { ...base, w: v7Clone(base.w) };
}
const property = (d: Record<string, unknown> | undefined, key: string) =>
  (d?.properties as Record<string, V7Data> | undefined)?.[key];

describe('cutting edge assessment in ex19', () => {
  it('is scoped to ex19, fits the text limit, adds no reward and needs three paid rounds of study', () => {
    for (const [scope, scenario] of [
      ['long-ex18', 'long-culture-v2-incentives'],
      ['long-ex17', 'long-culture-v3'],
    ] as const) {
      const world = initialLongWorld(scope, scenario);
      expect(continuousRegistry(world).packages.map((p) => p.id)).not.toContain(
        id,
      );
      expect(() => v7Install(world, continuousRegistry(), `${id}@1`)).toThrow(
        /not approved/,
      );
    }
    expect(continuousRegistry().handlers[`long.${id}`]).toBeDefined();
    const g = genesis();
    const w = fed(v7Clone(v7Install(g, continuousRegistry(g), `${id}@1`)));
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    expect(pkg?.scope).toBe('long-ex19');
    expect(pkg?.dependencies).toEqual(['foundation-open@1']);
    expect(pkg?.abilities).toHaveLength(1);
    const ability = w.abilities.find((a) => a.id === id);
    // The World Agent review's learning value, with its paid study rounds.
    expect(ability?.learning).toBe(3);
    expect(ability?.learningEnergy).toBe(0.5);
    expect(ability?.revision).toBe(`${id}@1`);
    expect(ability?.equivalence).toBe('material:cutting-edge:select-inspect:1');
    expect(ability?.parameters.properties?.mode).toMatchObject({
      enum: ['select', 'inspect', 'shape'],
    });
    expect(ability?.references).toEqual({
      sourceId: 'optional-exact-visible',
      inputStackId: 'optional-exact-visible',
    });
    const limit = w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    for (const a of pkg?.abilities ?? [])
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg?.abilities,
      events: pkg?.events,
      satisfaction: pkg?.satisfaction.map((r) => r.name),
    });
    expect(visible).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    // No drawing component (nothing is made) and no satisfaction source is added.
    expect(pkg?.visualComponents).toEqual([]);
    expect(pkg?.satisfaction).toEqual([]);
    expect(w.config.longDevelopment?.culture?.incentives).toBe(false);
    near(w, STONE);
    // Unstudied use is refused without any cost.
    expect(unchanged(w, act('select', { sourceId: STONE }))).not.toBe('');
    // Three rounds of study at 0.5 energy each, compared with a Moss who is not studying.
    let now = w;
    for (let i = 0; i < 3; i++) {
      const cur = fed(now),
        idle = v7Clone(cur);
      actor(idle).learning = null;
      const r = step(
        cur,
        i === 0 ? { moss: { interface: 'learn', args: { ability: id } } } : {},
      );
      const rest = step(idle).world;
      expect(
        actor(rest).vitals.energy - actor(r.world).vitals.energy,
      ).toBeCloseTo(0.5, 8);
      now = r.world;
      if (i < 2) expect(actor(now).mastered).not.toContain(id);
    }
    expect(actor(now).mastered).toContain(id);
    expect(
      step(fed(now), { moss: act('select', { sourceId: STONE }) }).outcomes.moss
        ?.success,
    ).toBe(true);
  });

  it('selects at a reachable stone source for 0.2 energy and reports the rule truthfully, gathering nothing', () => {
    const f = setup();
    const before = stock(f.w, STONE);
    expect(before).toBe(6);
    const looked = cost(f.w, act('select', { sourceId: STONE }));
    // One round and the 0.2 observation cost.
    expect(looked.energy).toBeCloseTo(0.2, 8);
    const w = looked.world;
    const report = data(w, 'cutting-edge-candidates-observed');
    expect(report).toMatchObject({
      source: STONE,
      material: 'stone',
      name: 'Weathered stone',
      looseUnits: 6,
      meets: true,
      unmet: [],
      measured: false,
      instruments: 'none represented',
      foodSafety: 'not assessed',
      energy: 0.2,
      view: {
        component: 'rock',
        mode: 'select',
        item: STONE,
        strokes: 0,
        chips: 0,
        measured: false,
        badge: null,
      },
    });
    // Under the existing contact model an intact unit of this stone has index 8 and radius
    // 0.001 / 8, which meets the rule; the report says so and labels the evidence.
    const unit = report?.gatheredUnit as Record<string, V7Data>;
    expect(unit.hardness).toMatchObject({
      value: 8,
      pass: true,
      evidence: 'world contact model',
      status: 'model',
    });
    expect(unit.edgeRadius).toMatchObject({
      value: 0.000125,
      pass: true,
      status: 'observed',
    });
    expect(unit.material).toMatchObject({ value: 'Weathered stone' });
    expect(unit.fractured).toMatchObject({ value: false, pass: true });
    expect(unit.contaminated).toMatchObject({ value: false, pass: true });
    expect(String(report?.rule)).toMatch(/every intact, unworn whole stone/);
    // Nothing is gathered, moved or stored: stock, stacks, objects and contact records stay.
    expect(stock(w, STONE)).toBe(before);
    expect(v7Signature(w.stacks)).toBe(v7Signature(looked.idle.stacks));
    expect(v7Signature(w.objects)).toBe(v7Signature(looked.idle.objects));
    expect(
      Object.keys(w.state).filter((k) => k.startsWith('hardness:intrinsic:')),
    ).toEqual(
      Object.keys(looked.idle.state).filter((k) =>
        k.startsWith('hardness:intrinsic:'),
      ),
    );
    // An unverified personal record and no reward events.
    expect(
      actor(w).memory.knowledge?.[`${STONE}:cutting-edge-candidates`],
    ).toMatchObject({ verified: false, subject: 'stone' });
    expect(events(w, 'trial-result')).toHaveLength(1);
    expect(events(w, 'information-confirmed')).toHaveLength(0);
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    const said = JSON.stringify(
      w.events.filter((e) => e.type.startsWith('cutting-edge-')),
    );
    expect(said).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(said).not.toMatch(EXTRA_EXCLUDED);
  });

  it('inspects an own carried piece for 0.2 energy, and the drying trial accepts exactly what it reports as meeting the rule', () => {
    const f = setup();
    const stoneBefore = v7Clone(stack(f.w, f.stone));
    const looked = cost(f.w, act('inspect', { inputStackId: f.stone }));
    expect(looked.energy).toBeCloseTo(0.2, 8);
    let w = looked.world;
    const report = data(w, 'cutting-edge-inspected');
    expect(report).toMatchObject({
      item: f.stone,
      material: 'stone',
      quantity: 1,
      origin: STONE,
      wear: 0,
      meets: true,
      unmet: [],
      measured: false,
      foodSafety: 'not assessed',
      view: { mode: 'inspect', status: 'meets the stone-edge rule' },
    });
    expect(property(report, 'hardness')).toMatchObject({
      value: 8,
      status: 'model',
    });
    expect(property(report, 'edgeRadius')).toMatchObject({
      value: 0.000125,
      status: 'observed',
    });
    expect(property(report, 'controlledContact')).toMatchObject({
      value: true,
      pass: true,
    });
    // Inspection changes neither the stone nor its contact record.
    expect(stack(w, f.stone)).toEqual(stoneBefore);
    expect(w.state[`hardness:intrinsic:${f.stone}`]).toBeUndefined();
    expect(
      actor(w).memory.knowledge?.[`${f.stone}:cutting-edge-inspection`],
    ).toMatchObject({ verified: false });
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    // The oak piece fails on material and hardness even though its radius would pass.
    const oak = cost(fed(w), act('inspect', { inputStackId: f.oak }));
    expect(oak.energy).toBeCloseTo(0.2, 8);
    const failed = data(oak.world, 'cutting-edge-inspected');
    expect(failed).toMatchObject({
      meets: false,
      unmet: ['material', 'hardness'],
    });
    expect(property(failed, 'hardness')).toMatchObject({
      value: 7,
      status: 'failed',
    });
    expect(property(failed, 'edgeRadius')).toMatchObject({ pass: true });
    // A stone whose recorded contact state is fractured fails on that requirement.
    const cracked = v7Clone(w);
    cracked.state[`hardness:intrinsic:${f.stone}`] = {
      version: 1,
      resistance: 8,
      edgeRadius: 0.000125,
      wear: 0,
      fractured: true,
      contaminated: false,
      usable: false,
      source: STONE,
      quantity: 1,
    };
    const broken = cost(
      fed(cracked),
      act('inspect', { inputStackId: f.stone }),
    );
    expect(data(broken.world, 'cutting-edge-inspected')).toMatchObject({
      meets: false,
      unmet: ['fractured', 'controlledContact'],
    });
    // Cross-check with the drying trial, mastered here as a fixture (its study has its own
    // test): it refuses the oak and the fractured stone and cuts with the intact stone.
    const prepare = (tool: string): V7Action => ({
      interface: SLICE,
      args: { mode: 'prepare', inputStackId: f.root, toolId: tool, ...SPOT },
    });
    w = fed(w);
    actor(w).mastered.push(SLICE);
    actor(w).position = { ...STAND };
    for (const [world, tool] of [
      [w, f.oak],
      [v7Clone(cracked), f.stone],
    ] as const) {
      const fixture = fed(world);
      if (!actor(fixture).mastered.includes(SLICE))
        actor(fixture).mastered.push(SLICE);
      actor(fixture).position = { ...STAND };
      const r = step(fixture, { moss: prepare(tool) });
      expect(r.outcomes.moss?.success).toBe(false);
    }
    const cut = step(w, { moss: prepare(f.stone) });
    expect(cut.outcomes.moss?.success).toBe(true);
    expect(events(cut.world, 'slice-drying-cut')).toHaveLength(1);
  });

  it('refuses shaping, instruments, unreachable or food sources, food or other people’s items, darkness and low energy before any cost', () => {
    const f = setup();
    const w = f.w;
    expect(unchanged(w, act('shape', { inputStackId: f.stone }))).toMatch(
      /Shaping is not available/,
    );
    expect(
      unchanged(
        w,
        act('inspect', { inputStackId: f.stone, instrumentIds: ['lens'] }),
      ),
    ).toMatch(/No edge-measuring/);
    expect(unchanged(w, act('select'))).toMatch(/sourceId/);
    expect(unchanged(w, act('inspect'))).toMatch(/your own carried items/);
    // A food item and a food source are not edge material.
    expect(unchanged(w, act('inspect', { inputStackId: f.root }))).toMatch(
      /is food/,
    );
    const berries = near(v7Clone(w), BERRIES);
    expect(unchanged(berries, act('select', { sourceId: BERRIES }))).toMatch(
      /yields food/,
    );
    // The source must be within reach.
    const away = v7Clone(w);
    actor(away).position = { x: 13.6, y: 20.5 };
    expect(unchanged(away, act('select', { sourceId: STONE }))).toMatch(
      /out of reach/,
    );
    // Owner-only: Ivo cannot inspect Moss's stone, even standing beside Moss.
    const other = v7Clone(w);
    actor(other, 'ivo').mastered.push(id);
    actor(other, 'ivo').position = free(
      other,
      actor(other).position.x,
      actor(other).position.y,
      0.6,
      'ivo',
    );
    expect(
      unchanged(other, act('inspect', { inputStackId: f.stone }), 'ivo'),
    ).not.toBe('');
    // Night: no daylight at this hour of the 80-round day.
    const night = v7Clone(w);
    night.tick = 50;
    night.time = 50;
    expect(unchanged(night, act('inspect', { inputStackId: f.stone }))).toMatch(
      /too dark/,
    );
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.1;
    const r = step(tired, { moss: act('select', { sourceId: STONE }) });
    expect(r.outcomes.moss?.success).toBe(false);
    expect(r.outcomes.moss?.reason).toMatch(/0\.2 energy/);
  });
});
