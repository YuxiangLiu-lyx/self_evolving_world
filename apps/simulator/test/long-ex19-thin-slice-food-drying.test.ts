import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  foodWaterRead,
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

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 90_000 });

const id = 'thin-slice-food-drying-trial';
const AIR = 'food-air-exposure-trial';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** Wren's actual ex19 root source and the nearest weathered stone outcrop of the map. */
const SOURCE = 'start-0-roots';
const ROCK = 'start-0-stone';
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition/i;
/** Wren stands here, just south of the source, on firm meadow ground. */
const STAND = { x: 10.1, y: 12.6 };
/** Layer centres within hand reach of STAND; a root layer covers 2.0 (radius about 0.8). */
const SPOT = { x: 10.5, y: 12.9 };
const OTHER = { x: 9.7, y: 13.1 };

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
const data = (w: V7World, type: string) =>
  events(w, type).at(-1)?.data as Record<string, unknown> | undefined;
const stack = (w: V7World, item: string): V7Stack => {
  const s = w.stacks.find((s) => s.id === item);
  if (!s) throw new Error(`Missing stack ${item}.`);
  return s;
};
type Trial = {
  id: string;
  owner: string;
  status: string;
  stage: string;
  input: string;
  unit: string;
  slices: string;
  control: string | null;
  tool: Record<string, unknown>;
  placement: Record<string, unknown>;
  cutAt: number;
  relaid: number;
  quantity: number;
  paidEnergy: number;
  escrow: string[];
  rainRounds: number;
  wet: boolean;
  observations: unknown[];
  takenBy: string | null;
  outcome?: Record<string, unknown>;
};
const trials = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Trial);
const trial = (w: V7World): Trial => {
  const j = trials(w).at(-1);
  if (!j) throw new Error('Missing trial.');
  return j;
};
/** Every root unit held as a stack anywhere: carried, reserved or lying in the world. */
const roots = (w: V7World) =>
  w.stacks
    .filter((s) => s.resource === 'root')
    .reduce((n, s) => n + Math.round(s.quantity * 10), 0) / 10;
type Physics = Record<string, number>;
const physics = (s: V7Stack) =>
  s.processing?.preservationPhysics as unknown as Physics;
/** Total water of a stack and its water ledger since it got its record. */
const water = (s: V7Stack) => (s.physical?.unitWater ?? 0) * s.quantity;
const ledger = (s: V7Stack) => {
  const d = physics(s);
  return Number(d.evaporated) - Number(d.absorbed) - Number(d.rainAdded);
};
/** An action of this interface; keys given as undefined are left out. */
function mode(
  m: string,
  extra: Partial<Record<string, V7Data[string]>> = {},
): V7Action {
  const args: V7Data = { mode: m };
  for (const [key, value] of Object.entries(extra))
    if (value !== undefined) args[key] = value;
  return { interface: id, args };
}
/** Keep everyone fed and rested so the tests isolate the trial from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
function genesis() {
  return initialLongWorld('long-ex19', 'long-culture-v2-oldgoal', {
    seed: 20261201,
    development: 8,
    tokens: 1500000,
  });
}
/** The ex19 world with its installed air-exposure trial, then this package. */
function installed() {
  const g = genesis();
  const air = v7Install(g, continuousRegistry(g), `${AIR}@1`);
  return v7Clone(v7Install(air, continuousRegistry(air), `${id}@1`));
}
/** Wren gathers three real roots and one real stone, then (optionally) studies four rounds. */
function gathered() {
  let w = installed();
  actor(w).position = { ...STAND };
  w = step(w, {
    wren: { interface: 'gather', args: { target: SOURCE, quantity: 3 } },
  }).world;
  // Walking to the outcrop is a separate navigate; the fixture places her beside it.
  actor(w).position = { x: 5, y: 9.1 };
  w = step(w, {
    wren: { interface: 'gather', args: { target: ROCK, quantity: 1 } },
  }).world;
  actor(w).position = { ...STAND };
  const unit = w.stacks.find((s) => s.owner === 'wren' && s.origin === SOURCE);
  const stone = w.stacks.find((s) => s.owner === 'wren' && s.origin === ROCK);
  if (!unit || !stone) throw new Error('Missing actually gathered fixtures.');
  return { w: fed(w), unit: unit.id, stone: stone.id };
}
function study(w: V7World, who = 'wren') {
  let next = step(fed(w), {
    [who]: { interface: 'learn', args: { ability: id } },
  }).world;
  for (let i = 0; i < 3; i++) next = step(fed(next)).world;
  expect(actor(next, who).mastered).toContain(id);
  return fed(next);
}
let base: { w: V7World; unit: string; stone: string } | undefined;
/** A cached studied fixture; every test works on its own copy. */
function setup() {
  if (!base) {
    const g = gathered();
    base = { ...g, w: study(g.w) };
  }
  return { ...base, w: v7Clone(base.w) };
}
const prepare = (
  f: { unit: string; stone: string },
  extra: Partial<Record<string, V7Data[string]>> = {},
) =>
  mode('prepare', {
    inputStackId: f.unit,
    toolId: f.stone,
    ...SPOT,
    ...extra,
  });
/** A prepared trial: one root cut and laid on open ground, one carried as a control. */
function started(control = 1) {
  const f = setup();
  const r = step(f.w, { wren: prepare(f, { controlQuantity: control }) });
  expect(r.outcomes.wren?.success).toBe(true);
  return { ...f, w: r.world };
}
/** The action fails and changes no vitals, stacks, state records or trials compared with waiting. */
function unchanged(w: V7World, action: V7Action, who = 'wren') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.state)).toBe(v7Signature(idle.state));
  expect(v7Signature(trials(result.world))).toBe(v7Signature(trials(idle)));
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action, who = 'wren') {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.reason ?? '').not.toMatch(/Nothing was spent/);
  expect(r.outcomes[who]?.success).toBe(true);
  return {
    world: r.world,
    energy: actor(idle, who).vitals.energy - actor(r.world, who).vitals.energy,
  };
}
function slab(
  name: string,
  x: number,
  y: number,
  size: number,
  surface = true,
): V7Object {
  return {
    id: name,
    name: 'Flat stone slab',
    kind: 'slab',
    spatial: {
      x,
      y,
      angle: 0,
      shape: { kind: 'rectangle', width: size, height: size },
      solid: false,
      interaction: 0.65,
      entrances: [],
    },
    visual: {
      component: 'rock',
      color: '#869189',
      accent: '#869189',
      label: 'Flat stone slab',
      state: 'ready',
    },
    data: { foodSurface: surface },
    createdBy: null,
    createdAt: 0,
    revision: 'foundation-forest@1',
  };
}
const held = (name: string, resource: string, extra: Partial<V7Stack> = {}) =>
  ({
    id: name,
    resource,
    quantity: 1,
    quantityTenths: 10,
    position: { ...STAND },
    owner: 'wren',
    origin: 'fixture',
    harvestedAt: 0,
    decay: 0,
    ...extra,
  }) as V7Stack;

describe('thin-slice food drying trial in ex19', () => {
  it('is scoped to ex19 after the air-exposure trial, fits the text limit, adds no reward and needs four paid rounds of study', () => {
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
    // All packages together still register: handler ids stay unique.
    const all = continuousRegistry();
    expect(all.handlers[`long.${id}`]).toBeDefined();
    expect(all.handlers[`long.${AIR}`]).toBeDefined();
    // It reuses the installed air-exposure trial, so that package comes first.
    const g = genesis();
    expect(() => v7Install(g, continuousRegistry(g), `${id}@1`)).toThrow(
      /dependency-incomplete/,
    );
    const f = gathered();
    const pkg = continuousRegistry(f.w).packages.find((p) => p.id === id);
    expect(pkg?.scope).toBe('long-ex19');
    expect(pkg?.dependencies).toEqual([
      'foundation-open@1',
      'food-air-exposure-trial@1',
    ]);
    expect(pkg?.abilities).toHaveLength(1);
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(4);
    expect(ability?.learningEnergy).toBe(0.5);
    expect(ability?.revision).toBe(`${id}@1`);
    expect(ability?.equivalence).toBe('food:thin-slice:air-drying-trial:1');
    expect(ability?.parameters.properties?.mode).toMatchObject({
      enum: ['prepare', 'inspect', 'resume', 'stop'],
    });
    expect(ability?.references).toEqual({
      inputStackId: 'optional-exact-visible',
      toolId: 'optional-exact-visible',
      supportId: 'optional-exact-visible',
    });
    const limit = f.w.config.longDevelopment?.abilityTextLimit ?? 0;
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
    // No drawing is needed (no object is made) and no satisfaction source is added.
    expect(pkg?.visualComponents).toEqual([]);
    expect(pkg?.satisfaction).toEqual([]);
    expect(f.w.config.longDevelopment?.culture?.incentives).toBe(false);
    expect(f.w.state.foodWater).toBe(1);
    // Unstudied use is refused without any cost.
    expect(unchanged(f.w, prepare(f))).not.toBe('');
    // Four rounds of study at 0.5 energy each, then the interface is usable. Each round is
    // compared with the same round of a Wren who is not studying.
    let w = f.w;
    for (let i = 0; i < 4; i++) {
      const now = fed(w),
        idle = v7Clone(now);
      actor(idle).learning = null;
      const r = step(
        now,
        i === 0 ? { wren: { interface: 'learn', args: { ability: id } } } : {},
      );
      const rest = step(idle).world;
      expect(
        actor(rest).vitals.energy - actor(r.world).vitals.energy,
      ).toBeCloseTo(0.5, 8);
      w = r.world;
      if (i < 3) {
        expect(actor(w).mastered).not.toContain(id);
        expect(actor(w).learning).toMatchObject({
          ability: id,
          remaining: 3 - i,
        });
      }
    }
    expect(actor(w).mastered).toContain(id);
    expect(step(fed(w), { wren: prepare(f) }).outcomes.wren?.success).toBe(
      true,
    );
  });

  it('cuts one whole root with a carried stone edge into one thin layer at a real cost, conserving the food', () => {
    const f = setup();
    const total = roots(f.w);
    expect(total).toBe(3);
    const before = v7Clone(stack(f.w, f.stone));
    const placed = cost(f.w, prepare(f, { controlQuantity: 1 }));
    // One round and 1.5 energy for one cut and laid unit.
    expect(placed.energy).toBeCloseTo(1.5, 8);
    const w = placed.world;
    const j = trial(w);
    expect(j).toMatchObject({
      owner: 'wren',
      status: 'active',
      stage: 'exposed',
      input: f.unit,
      unit: j.slices,
      quantity: 1,
      paidEnergy: 1.5,
      relaid: 0,
      escrow: [j.control],
      // The thin layer needs 5 x the 0.4 unit mass: 2.0 of open ground.
      placement: { kind: 'ground', x: SPOT.x, y: SPOT.y, area: 2 },
      tool: {
        id: f.stone,
        resource: 'stone',
        origin: ROCK,
        resistance: 8,
        edgeRadius: 0.000125,
        wear: 0,
        wearAdded: 0,
        fractured: false,
        contaminated: false,
      },
    });
    // The slices lie unowned and unreserved at the layer centre as one prepared sample.
    const slices = stack(w, j.slices);
    expect(slices).toMatchObject({
      owner: null,
      quantity: 1,
      origin: SOURCE,
      resource: 'root',
      position: SPOT,
    });
    expect(slices.reservedFor).toBeUndefined();
    expect(Object.keys(slices.processing ?? {})).toEqual([
      'preservationPhysics',
    ]);
    expect(foodWaterRead(slices)).toMatchObject({
      prepared: true,
      opening: 1.1,
      area: 2,
      surface: { kind: 'ground', x: SPOT.x, y: SPOT.y, area: 2 },
    });
    // Cutting conserves mass: the first round's exchange is the only change in water.
    const d = physics(slices);
    expect(d.initialUnitMass).toBeCloseTo(0.4, 8);
    expect(d.initialWaterFraction).toBeCloseTo(0.75, 8);
    expect(slices.physical?.unitSolids).toBeCloseTo(0.1, 8);
    expect(water(slices) + ledger(slices)).toBeCloseTo(0.3, 7);
    // The control stays whole, carried and reserved, without a water record.
    const control = stack(w, j.control ?? '');
    expect(control).toMatchObject({
      owner: 'wren',
      quantity: 1,
      reservedFor: j.id,
    });
    expect(control.physical).toBeUndefined();
    expect(control.processing).toBeUndefined();
    expect(stack(w, f.unit)).toMatchObject({ owner: 'wren', quantity: 1 });
    expect(roots(w)).toBe(total);
    // The stone stays a whole owned stone; its contact record is stored, with no wear.
    expect(stack(w, f.stone)).toEqual(before);
    expect(w.state[`hardness:intrinsic:${f.stone}`]).toMatchObject({
      resistance: 8,
      edgeRadius: 0.000125,
      wear: 0,
      fractured: false,
    });
    // Observable events with reusable view metadata; nothing shows preservation or dryness.
    expect(events(w, 'slice-drying-cut')).toHaveLength(1);
    expect(events(w, 'slice-drying-placed')).toHaveLength(1);
    expect(events(w, 'process-progress')).toHaveLength(1);
    expect(events(w, 'preservation-progress')).toHaveLength(1);
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(data(w, 'slice-drying-cut')).toMatchObject({
      trial: j.id,
      unit: j.slices,
      parent: f.unit,
      offcuts: 0,
      energy: 1.5,
      geometry: { form: 'thin slices', layerArea: 2 },
    });
    expect(data(w, 'slice-drying-placed')).toMatchObject({
      stage: 'exposed',
      safety: 'unverified',
      preservation: 'unverified',
      contamination: 'ground contact; not assessed',
      view: {
        component: 'ground-stack',
        item: j.slices,
        placement: 'ground',
        form: 'thin slices',
        tool: f.stone,
        state: 'exposed',
        preservation: 'unverified',
      },
    });
    expect(actor(w).extensionState[`long:work:${id}`]).toMatchObject({
      id: j.id,
      stage: 'exposed',
    });
    // Unattended rounds charge nothing more. The thin layer loses water under the existing
    // bounded exchange, and decay follows the representation's moisture-dependent rate.
    let later = w;
    for (let i = 0; i < 8; i++) {
      const prior = later;
      later = step(fed(later)).world;
      expect(events(later, 'process-progress')).toHaveLength(0);
      const now = stack(later, j.slices),
        then = stack(prior, j.slices);
      const row = foodWaterRead(now)?.last ?? {};
      // No more than the bound 0.025 x area x temperature factor leaves in one round.
      const factor = Math.max(
        0,
        Math.min(2, (Number(row.temperature) - 5) / 20),
      );
      expect(Number(row.evaporated) + Number(row.absorbed)).toBeLessThanOrEqual(
        0.025 * 2 * factor + 1e-7,
      );
      // Removal never goes below the driest equilibrium (water fraction 0.1) of the solids.
      expect(water(now)).toBeGreaterThanOrEqual((0.1 * 0.1) / 0.9 - 1e-9);
      const gained = (now.decay ?? 0) - (then.decay ?? 0),
        kept =
          (stack(later, j.control ?? '').decay ?? 0) -
          (stack(prior, j.control ?? '').decay ?? 0);
      // Same ambient where they lie: the slices age at the control's rate times their factor.
      const fraction =
        (now.physical?.unitWater ?? 0) / (now.physical?.unitMass ?? 1);
      const rate =
        1.1 * Math.max(0.15, Math.min(1.5, 0.15 + (0.85 * fraction) / 0.75));
      expect(foodWaterRead(now)?.rate).toBeCloseTo(rate, 8);
      expect(gained / kept).toBeCloseTo(rate, 5);
    }
    expect(trial(later).paidEnergy).toBe(1.5);
    const dried = stack(later, j.slices);
    expect(physics(dried).evaporated).toBeGreaterThan(0.1);
    expect(water(dried) + ledger(dried)).toBeCloseTo(0.3, 7);
    expect(dried.physical?.unitSolids).toBeCloseTo(0.1, 8);
    // Drying slowed decay below the whole carried control's rate; age was never reset.
    expect(foodWaterRead(dried)?.rate).toBeLessThan(1);
    expect(dried.decay ?? 0).toBeGreaterThan(slices.decay ?? 0);
    expect(roots(later)).toBe(total);
    expect(trial(later)).toMatchObject({ stage: 'exposed', rainRounds: 0 });
  });

  it('inspects in reach for 0.2 energy with visual and model decay readings, and refuses instruments at no cost', () => {
    const s = started();
    let w = s.w;
    for (let i = 0; i < 5; i++) w = step(fed(w)).world;
    const j = trial(w);
    const away = v7Clone(w);
    actor(away).position = { x: 13, y: 13 };
    expect(unchanged(away, mode('inspect'))).toMatch(/hand reach/);
    expect(
      unchanged(w, mode('inspect', { instrumentId: 'start-0-stone' })),
    ).toMatch(/No calibrated weighing instrument/);
    const looked = cost(w, mode('inspect'));
    expect(looked.energy).toBeCloseTo(0.2, 8);
    const seen = w;
    w = looked.world;
    const reading = data(w, 'slice-drying-inspected');
    expect(reading).toMatchObject({
      trial: j.id,
      elapsedRounds: 6,
      slices: { item: j.slices, present: true, quantity: 1 },
      control: { item: j.control, present: true, quantity: 1 },
      decayReadings: 'model decay readings, not a microbial test',
      water:
        'not measured; visible shrinkage does not establish how much water left',
      mass: 'not weighed; no calibrated weighing instrument exists',
      exposure: 'open',
      safety: 'unverified',
      preservation: 'unverified',
      rainRounds: 0,
    });
    // The look reports a visible change supported by the actual mass, not a water figure.
    const ratio = foodWaterRead(stack(seen, j.slices))?.massRatio ?? 1;
    expect(ratio).toBeLessThan(0.75);
    expect(reading?.visible).toMatchObject({
      method: 'visual',
      wetness: 'no visible wetness',
      spoilage: 'none seen',
    });
    expect(['clearly shrunken', 'shrivelled']).toContain(
      (reading?.visible as Record<string, unknown>).shrinkage,
    );
    expect(JSON.stringify(reading)).not.toMatch(/waterFraction|unitWater/);
    const sliced = reading?.slices as Record<string, number>,
      control = reading?.control as Record<string, number>;
    expect(sliced.decay).toBe(stack(seen, j.slices).decay);
    expect(reading?.decayDifference).toBeCloseTo(
      Number(sliced.decayGained) - Number(control.decayGained),
      8,
    );
    const known = actor(w).memory.knowledge?.[`${j.unit}:thin-slice-drying`];
    expect(known).toMatchObject({ verified: false, subject: 'root' });
    expect(events(w, 'trial-result')).toHaveLength(1);
    expect(events(w, 'information-confirmed')).toHaveLength(0);
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(trial(w).observations).toHaveLength(1);
    const said = JSON.stringify(
      [...seen.events, ...w.events].filter((e) =>
        e.type.startsWith('slice-drying-'),
      ),
    );
    expect(said).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(said).not.toMatch(EXTRA_EXCLUDED);
  });

  it('stops once for no energy, releasing the control and leaving the slices to keep changing with the weather', () => {
    const s = started();
    let w = step(fed(s.w)).world;
    const j = trial(w);
    const stopped = cost(w, mode('stop'));
    expect(stopped.energy).toBeCloseTo(0, 8);
    w = stopped.world;
    expect(trial(w)).toMatchObject({ status: 'stopped', stage: 'stopped' });
    expect(trial(w).outcome).toMatchObject({ stage: 'stopped' });
    expect(stack(w, j.control ?? '').reservedFor).toBeUndefined();
    expect(stack(w, j.control ?? '').owner).toBe('wren');
    expect(stack(w, j.slices)).toMatchObject({ owner: null, quantity: 1 });
    expect(events(w, 'slice-drying-stopped')).toHaveLength(1);
    expect(events(w, 'process-stopped')).toHaveLength(1);
    expect(data(w, 'slice-drying-stopped')).toMatchObject({
      released: [j.control],
      view: { state: 'stopped', preservation: 'unverified' },
    });
    expect(w.stacks.filter((x) => x.reservedFor)).toHaveLength(0);
    expect(roots(w)).toBe(3);
    // Food left exposed keeps its physical processes without an open trial.
    const evaporated = Number(physics(stack(w, j.slices)).evaporated);
    const later = step(fed(w)).world;
    expect(physics(stack(later, j.slices)).evaporated).toBeGreaterThan(
      evaporated,
    );
    expect(trial(later).stage).toBe('stopped');
    expect(unchanged(fed(w), mode('stop'))).toMatch(/no open drying trial/);
    expect(unchanged(fed(w), mode('inspect'))).toMatch(/no open drying trial/);
    expect(unchanged(fed(w), mode('resume'))).toMatch(/no open drying trial/);
  });

  it('pauses when the owner picks the slices up, re-lays them on resume without cutting again, and ends when someone else takes them', () => {
    const s = started();
    let w = step(fed(s.w)).world;
    const j = trial(w);
    expect(unchanged(w, mode('resume', OTHER))).toMatch(/still lie exposed/);
    // Wren takes the slices back with the base pickup, at its own cost.
    w = step(fed(w), {
      wren: { interface: 'pickup', args: { target: j.slices, quantity: 1 } },
    }).world;
    const paused = trial(w);
    expect(paused.stage).toBe('carried');
    expect(paused.status).toBe('active');
    expect(paused.slices).not.toBe(j.slices);
    expect(events(w, 'slice-drying-carried')).toHaveLength(1);
    const taken = stack(w, paused.slices);
    expect(taken).toMatchObject({ owner: 'wren', quantity: 1 });
    expect(foodWaterRead(taken)).toMatchObject({
      prepared: true,
      surface: null,
    });
    // Carried slices exchange no water.
    const carriedWater = water(taken);
    w = step(fed(w)).world;
    expect(water(stack(w, paused.slices))).toBeCloseTo(carriedWater, 10);
    // Inspecting while carrying them works anywhere.
    actor(w).position = { x: 12, y: 12.4 };
    expect(cost(w, mode('inspect')).energy).toBeCloseTo(0.2, 8);
    actor(w).position = { ...STAND };
    // Resume: same placement rules, 0.2 energy, no second cut.
    expect(unchanged(w, mode('resume', { x: 12, y: 12.6 }))).toMatch(
      /beyond hand reach/,
    );
    const relaid = cost(w, mode('resume', OTHER));
    expect(relaid.energy).toBeCloseTo(0.2, 8);
    w = relaid.world;
    expect(trial(w)).toMatchObject({
      stage: 'exposed',
      relaid: 1,
      placement: { kind: 'ground', x: OTHER.x, y: OTHER.y, area: 2 },
    });
    expect(events(w, 'slice-drying-resumed')).toHaveLength(1);
    expect(events(w, 'slice-drying-cut')).toHaveLength(0);
    const again = stack(w, paused.slices);
    expect(again).toMatchObject({ owner: null, position: OTHER });
    expect(foodWaterRead(again)).toMatchObject({
      prepared: true,
      opening: 1.1,
    });
    expect(roots(w)).toBe(3);
    // Someone else taking all of them ends the trial; the control is released once.
    actor(w, 'moss').position = { x: OTHER.x + 0.3, y: OTHER.y };
    w = step(fed(w), {
      moss: {
        interface: 'pickup',
        args: { target: paused.slices, quantity: 1 },
      },
    }).world;
    expect(trial(w)).toMatchObject({
      status: 'stopped',
      stage: 'removed',
      takenBy: 'moss',
    });
    expect(events(w, 'slice-drying-removed')).toHaveLength(1);
    expect(stack(w, j.control ?? '').reservedFor).toBeUndefined();
    expect(w.stacks.filter((x) => x.reservedFor)).toHaveLength(0);
    expect(roots(w)).toBe(3);
  });

  it('records rain landing on the uncovered slices, with a balanced water ledger', () => {
    // Isolated fixture time: this seed's shared rain term is positive from round 85.
    const f = setup();
    const w0 = v7Clone(f.w);
    w0.tick = 86;
    w0.time = 86;
    let r = step(w0, { wren: prepare(f) }).world;
    const k = trial(r);
    const rained = [...events(r, 'slice-drying-rained-on')];
    for (let i = 0; i < 3; i++) {
      r = step(fed(r)).world;
      rained.push(...events(r, 'slice-drying-rained-on'));
      const last = foodWaterRead(stack(r, k.slices))?.last ?? {};
      expect(Number(last.rain)).toBeGreaterThan(0);
      expect(Number(last.received)).toBeCloseTo(
        0.01 * Number(last.rain) * 2,
        8,
      );
    }
    // The event marks the start of wetting only, with its reusable view metadata.
    expect(rained).toHaveLength(1);
    expect(rained[0]?.actor).toBe('wren');
    expect(rained[0]?.data).toMatchObject({
      trial: k.id,
      view: { surface: 'wet from rain', form: 'thin slices' },
    });
    const wet = stack(r, k.slices);
    expect(physics(wet).rainAdded).toBeGreaterThan(0);
    // Conservation: water now equals the cut unit's water minus vapour out plus rain and vapour in.
    expect(water(wet) + ledger(wet)).toBeCloseTo(0.3, 7);
    expect(trial(r).rainRounds).toBe(4);
    expect(trial(r).wet).toBe(true);
    const looked = step(fed(r), { wren: mode('inspect') }).world;
    expect(data(looked, 'slice-drying-inspected')).toMatchObject({
      wetNow: true,
      visible: { wetness: 'wet from rain' },
      view: { surface: 'wet from rain' },
    });
  });

  it('refuses missing or unsuitable tools, food, surfaces, quantities and instruments without spending anything', () => {
    const f = setup();
    const w = f.w;
    expect(unchanged(w, prepare(f, { toolId: undefined }))).toMatch(
      /Cutting needs toolId/,
    );
    expect(unchanged(w, prepare(f, { toolId: f.unit }))).toMatch(
      /Food cannot cut itself/,
    );
    const food = v7Clone(w);
    food.stacks.push(held('held-berry', 'berry'));
    expect(unchanged(food, prepare(f, { toolId: 'held-berry' }))).toMatch(
      /Food is not a cutting tool/,
    );
    const wood = v7Clone(w);
    wood.stacks.push(held('held-branch', 'branch'));
    expect(unchanged(wood, prepare(f, { toolId: 'held-branch' }))).toMatch(
      /Only stone or flint/,
    );
    const worn = v7Clone(w);
    worn.state[`hardness:intrinsic:${f.stone}`] = {
      version: 1,
      resistance: 8,
      edgeRadius: 0.0003,
      wear: 0.0017,
      fractured: false,
      contaminated: false,
      usable: true,
      source: ROCK,
      quantity: 1,
    };
    expect(unchanged(worn, prepare(f))).toMatch(/too blunt/);
    const broken = v7Clone(w);
    stack(broken, f.stone).processing = { wovenDamage: { fixture: true } };
    expect(unchanged(broken, prepare(f))).toMatch(/fractured, contaminated/);
    const assayed = v7Clone(w);
    stack(assayed, f.stone).processing = {
      gravimetricAssay: { fixture: true },
    };
    expect(unchanged(assayed, prepare(f))).toMatch(/fractured, contaminated/);
    const loose = v7Clone(w);
    Object.assign(stack(loose, f.stone), { owner: null, position: SPOT });
    expect(unchanged(loose, prepare(f, { ...OTHER }))).toMatch(
      /your own carried cutting tool/,
    );
    expect(unchanged(w, prepare(f, { quantity: 2 }))).toMatch(
      /exactly one whole unit per trial/,
    );
    expect(unchanged(w, prepare(f, { controlQuantity: 3 }))).toMatch(
      /fewer than 4 whole units/,
    );
    expect(unchanged(w, prepare(f, { x: 12, y: 12.8 }))).toMatch(
      /beyond hand reach/,
    );
    expect(unchanged(w, prepare(f, { instrumentId: 'start-0-stone' }))).toMatch(
      /No calibrated weighing instrument/,
    );
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 1.2;
    expect(unchanged(tired, prepare(f))).toMatch(/needs 1.5 energy/);
    const occupied = v7Clone(w);
    occupied.stacks.push({
      ...held('loose-berry', 'berry'),
      owner: null,
      position: { x: SPOT.x + 0.5, y: SPOT.y },
    });
    expect(unchanged(occupied, prepare(f))).toMatch(/other material/);
    const blocked = v7Clone(w);
    const tree = blocked.objects.find((o) => o.spatial.solid);
    if (!tree) throw new Error('Missing solid fixture object.');
    blocked.objects.push({
      ...v7Clone(tree),
      id: 'fixture-stone',
      spatial: {
        ...v7Clone(tree.spatial),
        x: SPOT.x + 0.6,
        y: SPOT.y,
        shape: { kind: 'circle', radius: 0.08 },
        entrances: [],
      },
    });
    expect(unchanged(blocked, prepare(f))).toMatch(/obstructed/);
    const slabs = v7Clone(w);
    slabs.objects.push(slab('small-slab', 10.6, 12.6, 0.6));
    slabs.objects.push(slab('plain-slab', 9.7, 12.9, 1.5, false));
    const on = (support: string) =>
      prepare(f, { x: undefined, y: undefined, supportId: support });
    expect(unchanged(slabs, on('plain-slab'))).toMatch(/not a food surface/);
    expect(unchanged(slabs, on('small-slab'))).toMatch(
      /one thin layer of these slices needs 2/,
    );
    const spoiled = v7Clone(w);
    stack(spoiled, f.unit).decay = 240;
    expect(unchanged(spoiled, prepare(f))).toMatch(/Spoiled food/);
    const apple = v7Clone(w);
    apple.stacks.push(held('held-apple', 'apple'));
    expect(
      unchanged(apple, prepare(f, { inputStackId: 'held-apple' })),
    ).toMatch(/only for berries and roots/);
    expect(unchanged(w, mode('inspect'))).toMatch(/no open drying trial/);
    expect(unchanged(w, mode('resume'))).toMatch(/no open drying trial/);
    expect(unchanged(w, mode('stop'))).toMatch(/no open drying trial/);
    expect(unchanged(w, mode('cut'))).toMatch(/outside the declared choices/);
  });

  it('uses an existing food surface large enough for the layer, refuses recutting, and keeps trials owner-only', () => {
    const f = setup();
    const w = v7Clone(f.w);
    w.objects.push(slab('wide-slab', 10.6, 12.9, 1.5));
    const r = step(w, {
      wren: prepare(f, { x: undefined, y: undefined, supportId: 'wide-slab' }),
    });
    expect(r.outcomes.wren?.success).toBe(true);
    const j = trial(r.world);
    expect(j.placement).toMatchObject({
      kind: 'object',
      id: 'wide-slab',
      area: 2.25,
    });
    expect(stack(r.world, j.slices)).toMatchObject({
      owner: null,
      position: { x: 10.6, y: 12.9 },
    });
    expect(data(r.world, 'slice-drying-placed')).toMatchObject({
      contamination: 'support contact; not assessed',
      view: { placement: 'support', support: 'wide-slab' },
    });
    expect(physics(stack(r.world, j.slices)).evaporated).toBeGreaterThan(0);
    // One open trial per person.
    const s = started();
    expect(unchanged(fed(s.w), prepare(s, { ...OTHER }))).toMatch(/still open/);
    // Slices cannot be cut again as a whole unit: stop, pick up, try.
    let back = step(fed(s.w), { wren: mode('stop') }).world;
    const t = trial(back);
    back = step(fed(back), {
      wren: { interface: 'pickup', args: { target: t.slices, quantity: 1 } },
    }).world;
    const picked = back.stacks.find(
      (x) => x.owner === 'wren' && foodWaterRead(x)?.prepared,
    );
    if (!picked) throw new Error('Missing picked-up slices.');
    expect(
      unchanged(fed(back), prepare(s, { inputStackId: picked.id, ...OTHER })),
    ).toMatch(/already cut or opened/);
    // Owner only: Moss, who has studied it too, can use neither Wren's things nor her trial.
    let m = v7Clone(s.w);
    actor(m, 'moss').position = { x: SPOT.x + 0.3, y: SPOT.y };
    m = study(m, 'moss');
    expect(unchanged(m, prepare(s), 'moss')).toMatch(/absent-or-inaccessible/);
    expect(
      unchanged(m, prepare(s, { inputStackId: trial(m).slices }), 'moss'),
    ).toMatch(/absent-or-inaccessible|your own food/);
    expect(unchanged(m, mode('inspect'), 'moss')).toMatch(
      /no open drying trial/,
    );
    expect(unchanged(m, mode('resume'), 'moss')).toMatch(
      /no open drying trial/,
    );
    expect(unchanged(m, mode('stop'), 'moss')).toMatch(/no open drying trial/);
    expect(trial(m)).toMatchObject({ owner: 'wren', stage: 'exposed' });
  });

  it('ends at death, dropping the control once, and ends when the slices spoil', () => {
    const s = started();
    const dying = v7Clone(s.w);
    const j = trial(dying);
    actor(dying).vitals.health = 0.0001;
    actor(dying).vitals.satiety = 0;
    const where = { ...actor(dying).position };
    const died = step(dying).world;
    expect(events(died, 'died')).toHaveLength(1);
    expect(trial(died)).toMatchObject({
      status: 'stopped',
      stage: 'ended-by-death',
    });
    expect(events(died, 'slice-drying-interrupted')).toHaveLength(1);
    expect(stack(died, j.control ?? '')).toMatchObject({
      owner: null,
      position: where,
    });
    expect(stack(died, j.control ?? '').reservedFor).toBeUndefined();
    expect(stack(died, j.slices)).toMatchObject({
      owner: null,
      position: SPOT,
    });
    expect(foodWaterRead(stack(died, j.slices))?.surface).not.toBeNull();
    expect(died.stacks.filter((x) => x.reservedFor)).toHaveLength(0);
    expect(roots(died)).toBe(3);

    const old = v7Clone(s.w);
    const t = trial(old);
    stack(old, t.slices).decay = 239.99;
    const spoiled = step(fed(old)).world;
    expect(events(spoiled, 'spoiled')).toHaveLength(1);
    expect(spoiled.stacks.some((x) => x.id === t.slices)).toBe(false);
    expect(trial(spoiled)).toMatchObject({
      status: 'stopped',
      stage: 'spoiled',
    });
    expect(events(spoiled, 'slice-drying-spoiled')).toHaveLength(1);
    expect(data(spoiled, 'slice-drying-spoiled')).toMatchObject({
      slices: { present: false, visibleSpoilage: 'gone' },
      preservation: 'unverified',
    });
    expect(stack(spoiled, t.control ?? '').reservedFor).toBeUndefined();
    expect(spoiled.stacks.filter((x) => x.reservedFor)).toHaveLength(0);
    expect(roots(spoiled)).toBe(2);
  });
});
