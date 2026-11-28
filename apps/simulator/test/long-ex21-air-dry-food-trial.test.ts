import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  foodWaterRead,
  v7Clone,
  v7Install,
  v7Load,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Event,
  V7Object,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 60_000 });

const id = 'air-dry-food-trial';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition/i;
/** Sol's actual ex21 berry source and the nearest stone outcrop to Sol's round-10 position. */
const BERRIES = 'forest-berry-1';
const ROCK = 'start-2-stone';
/** Sol's round-10 position, within reach of the berry source. */
const BERRY_STAND = { x: 13.61, y: 16.58 };
/** A firm meadow point south-west of the outcrop, within reach of it. */
const ROCK_STAND = { x: 10.5, y: 21.05 };
/** Ground points within hand reach of ROCK_STAND, clear of the outcrop. */
const SITE = { x: 10, y: 21.45 };
const SITE2 = { x: 10.9, y: 21.75 };
/** A point whose footprint overlaps the solid outcrop. */
const ON_ROCK = { x: 10.75, y: 20.75 };
/** Where Moss stands to reach the site without touching Sol. */
const MOSS_STAND = { x: 10.4, y: 21.75 };

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
const actor = (w: V7World, name = 'sol'): V7Actor => {
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
  treated: string;
  reference: string;
  support: Record<string, unknown>;
  supportItem: Record<string, unknown> | null;
  placement: Record<string, unknown>;
  placedAt: number;
  duration: number;
  quantity: number;
  paidEnergy: number;
  escrow: string[];
  turns: number;
  moves: number;
  rainRounds: number;
  wet: boolean;
  inspections: number;
  observations: Record<string, unknown>[];
  comparison: Record<string, unknown> | null;
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
const tenths = (stacks: { quantity: number }[]) =>
  stacks.reduce((n, s) => n + Math.round(s.quantity * 10), 0) / 10;
/** Every berry unit held as a stack anywhere: carried, reserved or lying in the world. */
const berries = (w: V7World) =>
  tenths(w.stacks.filter((s) => s.resource === 'berry'));
/** Every stone unit: stacks anywhere plus support items held under open trials. */
const stones = (w: V7World) =>
  tenths(w.stacks.filter((s) => s.resource === 'stone')) +
  tenths(
    trials(w).flatMap((j) =>
      j.supportItem ? [j.supportItem as unknown as V7Stack] : [],
    ),
  );
const water = (s: V7Stack) => (s.physical?.unitWater ?? 0) * s.quantity;
const mode = (m: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...extra },
});
const start = (
  food: string,
  support: string,
  extra: Record<string, unknown> = {},
) =>
  mode('start', {
    inputStackId: food,
    quantity: 1,
    supportId: support,
    ...SITE,
    ...extra,
  });
/** Keep everyone fed and rested so the tests isolate the trial from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
function installed() {
  const genesis = initialLongWorld('long-ex21', 'long-culture-v2-oldgoal', {
    seed: 20261202,
    development: 8,
    tokens: 1500000,
  });
  return v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
}
/** Sol gathers six real berries from the ex21 source and one real stone from the outcrop, then
 * studies three rounds, standing within reach of the site. */
function setup(study = true) {
  let w = installed();
  actor(w).position = { ...BERRY_STAND };
  w = step(w, {
    sol: { interface: 'gather', args: { target: BERRIES, quantity: 6 } },
  }).world;
  const food = w.stacks.find((s) => s.owner === 'sol' && s.origin === BERRIES);
  actor(w).position = { ...ROCK_STAND };
  w = step(fed(w), {
    sol: { interface: 'gather', args: { target: ROCK, quantity: 1 } },
  }).world;
  const stone = w.stacks.find((s) => s.owner === 'sol' && s.origin === ROCK);
  if (!food || !stone) throw new Error('Missing actually gathered fixtures.');
  if (study) {
    w = step(w, { sol: { interface: 'learn', args: { ability: id } } }).world;
    w = step(w).world;
    expect(actor(w).mastered).not.toContain(id);
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  }
  return { w: fed(w), food: food.id, stone: stone.id };
}
/** A started trial: one berry on the stone at SITE, one carried as the reference. */
function started(extra: Record<string, unknown> = {}) {
  const f = setup();
  const r = step(f.w, { sol: start(f.food, f.stone, extra) });
  expect(r.outcomes.sol?.success).toBe(true);
  return { ...f, w: fed(r.world) };
}
/** The action fails and changes no vitals, stacks or trials compared with waiting. */
function unchanged(w: V7World, action: V7Action, who = 'sol') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(trials(result.world))).toBe(v7Signature(trials(idle)));
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action) {
  const r = step(w, { sol: action }),
    idle = step(w).world;
  expect(r.outcomes.sol?.success).toBe(true);
  return {
    world: r.world,
    idle,
    energy: actor(idle).vitals.energy - actor(r.world).vitals.energy,
  };
}
/** An owned fixture item carried by Sol. */
function held(name: string, resource: string, extra: Partial<V7Stack> = {}) {
  return {
    id: name,
    resource,
    quantity: 1,
    quantityTenths: 10,
    position: { ...ROCK_STAND },
    owner: 'sol',
    origin: 'fixture',
    harvestedAt: 0,
    ...extra,
  } satisfies V7Stack;
}
function slab(name: string, extra: Record<string, unknown> = {}): V7Object {
  return {
    id: name,
    name: 'Flat stone slab',
    kind: 'slab',
    spatial: {
      x: SITE.x,
      y: SITE.y + 0.1,
      angle: 0,
      shape: { kind: 'rectangle', width: 0.4, height: 0.3 },
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
    data: { foodSurface: true, ...extra },
    createdBy: null,
    createdAt: 0,
    revision: 'foundation-forest@1',
  };
}

describe('air-dry food trial in ex21', () => {
  it('is scoped to ex21, fits the frozen text limit, adds no reward source and needs three rounds of study', () => {
    for (const [scope, scenario] of [
      ['long-ex19', 'long-culture-v2-oldgoal'],
      ['long-ex20', 'long-culture-v2'],
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
    expect(all.handlers['long.air-dry-food-trial']).toBeDefined();
    expect(all.handlers['long.air-dry-food']).toBeDefined();
    expect(all.handlers['long.food-air-exposure-trial']).toBeDefined();
    expect(all.handlers['long.thin-slice-food-drying-trial']).toBeDefined();
    const f = setup(false);
    // This run's packages join the foundations in the ex21 registry; later ex21 handoffs add more.
    const scoped = continuousRegistry(f.w).packages.filter(
      (p) => p.scope === 'long-ex21' && p.id !== 'foundation-expression',
    );
    expect(scoped.map((p) => p.id)).toContain(id);
    const pkg = scoped.find((p) => p.id === id);
    expect(pkg?.abilities).toHaveLength(1);
    expect(pkg?.dependencies).toEqual(['foundation-open@1']);
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(3);
    expect(ability?.learningEnergy).toBeUndefined();
    expect(ability?.revision).toBe(`${id}@1`);
    expect(ability?.handler).toBe('long.air-dry-food-trial');
    expect(ability?.parameters.properties?.mode).toMatchObject({
      enum: ['start', 'tend', 'inspect', 'stop'],
    });
    expect(ability?.references).toEqual({
      inputStackId: 'optional-exact-visible',
      supportId: 'optional-exact-visible',
    });
    const limit = f.w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    for (const a of pkg?.abilities ?? [])
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg?.abilities,
      events: pkg?.events,
      description: pkg?.description,
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
    const before = actor(f.w).vitals.energy;
    const refused = step(f.w, { sol: start(f.food, f.stone) });
    expect(refused.outcomes.sol?.success).toBe(false);
    expect(actor(refused.world).vitals.energy).toBe(before);
    expect(trials(refused.world)).toHaveLength(0);
    // Three rounds of study, then the interface is usable.
    let w = step(f.w, {
      sol: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(actor(w).learning).toMatchObject({ ability: id, remaining: 2 });
    w = step(w).world;
    expect(actor(w).learning).toMatchObject({ ability: id, remaining: 1 });
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
    expect(
      step(fed(w), { sol: start(f.food, f.stone) }).outcomes.sol?.success,
    ).toBe(true);
  });

  it('splits a treated and an equal reference unit, lays the treated one on an obtained stone for 1 energy and conserves food and support', () => {
    const f = setup();
    expect(berries(f.w)).toBe(6);
    expect(stones(f.w)).toBe(1);
    const source0 = v7Clone(stack(f.w, f.food));
    const placed = cost(f.w, start(f.food, f.stone));
    // One active round and 1 energy, through one paid work round.
    expect(placed.energy).toBeCloseTo(1, 8);
    const w = placed.world;
    const j = trial(w);
    expect(j).toMatchObject({
      owner: 'sol',
      status: 'active',
      stage: 'exposed',
      input: f.food,
      quantity: 1,
      duration: 10,
      paidEnergy: 1,
      escrow: [j.reference],
      placement: { kind: 'ground', x: SITE.x, y: SITE.y, area: 0.04 },
      support: {
        kind: 'item',
        resource: 'stone',
        quantity: 1,
        origin: ROCK,
        from: f.stone,
      },
    });
    // The treated unit lies unowned and unreserved on the support with a water record. It aged
    // in the setup round exactly like the source: splitting neither resets nor adds decay.
    const source = stack(w, f.food);
    expect(source.decay ?? 0).toBeGreaterThan(source0.decay ?? 0);
    const treated = stack(w, j.treated);
    expect(treated).toMatchObject({
      owner: null,
      quantity: 1,
      origin: BERRIES,
      harvestedAt: source0.harvestedAt,
      decay: source.decay,
      position: SITE,
    });
    expect(treated.reservedFor).toBeUndefined();
    expect(treated.physical?.unitMass).toBeCloseTo(0.2, 8);
    expect(treated.physical?.unitWater).toBeCloseTo(0.17, 8);
    expect(foodWaterRead(treated)).toMatchObject({
      prepared: false,
      opening: 1,
      rate: 1,
      area: 0.04,
      waterFraction: 0.85,
      surface: { kind: 'ground', x: SITE.x, y: SITE.y, area: 0.04 },
    });
    // The reference is split from the same stack, carried, reserved and untreated.
    const reference = stack(w, j.reference);
    expect(reference).toMatchObject({
      owner: 'sol',
      quantity: 1,
      reservedFor: j.id,
      origin: BERRIES,
      harvestedAt: source0.harvestedAt,
      decay: source.decay,
    });
    expect(foodWaterRead(reference)).toMatchObject({
      prepared: false,
      area: 0,
      waterFraction: 0.85,
      surface: null,
    });
    // The source keeps four units with its own age and provenance; splitting resets nothing.
    expect(stack(w, f.food)).toMatchObject({
      owner: 'sol',
      quantity: 4,
      quantityTenths: 40,
      origin: BERRIES,
      harvestedAt: source0.harvestedAt,
    });
    expect(stack(w, f.food).physical).toBeUndefined();
    // The stone leaves the carried load and lies committed under the food at the site.
    expect(w.stacks.some((s) => s.resource === 'stone')).toBe(false);
    expect(j.supportItem).toMatchObject({
      resource: 'stone',
      quantity: 1,
      owner: null,
      origin: ROCK,
      position: SITE,
    });
    expect(v7Load(w, actor(w))).toBeCloseTo(4 * 0.2 + 0.2, 8);
    expect(berries(w)).toBe(6);
    expect(stones(w)).toBe(1);
    // Observable placement with reusable view metadata; nothing shows preservation.
    expect(events(w, 'air-dry-trial-placed')).toHaveLength(1);
    expect(events(w, 'process-progress')).toHaveLength(1);
    expect(data(w, 'air-dry-trial-placed')).toMatchObject({
      stage: 'exposed',
      status: 'exposed',
      safety: 'unverified',
      preservation: 'unverified',
      view: {
        component: 'ground-stack',
        operation: 'passive_food_drying',
        source: f.food,
        item: j.treated,
        reference: j.reference,
        support: { kind: 'item', resource: 'stone' },
        x: SITE.x,
        y: SITE.y,
        progress: { basis: 'elapsed_exposure', elapsed: 0, duration: 10 },
        status: 'exposed',
        preservation: 'unverified',
      },
    });
    expect(events(w, 'preservation-progress')).toHaveLength(1);
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(actor(w).extensionState[`long:work:${id}`]).toMatchObject({
      id: j.id,
      stage: 'exposed',
    });
    // Unattended dry rounds charge nothing; whole food loses no water and decay is not slowed.
    let later = w;
    const decay = [treated.decay ?? 0];
    for (let i = 0; i < 6; i++) {
      later = step(fed(later)).world;
      expect(events(later, 'process-progress')).toHaveLength(0);
      decay.push(stack(later, j.treated).decay ?? 0);
    }
    expect(trial(later).paidEnergy).toBe(1);
    for (let i = 1; i < decay.length; i++)
      expect(decay[i] ?? 0).toBeGreaterThan(decay[i - 1] ?? 0);
    const t = stack(later, j.treated),
      r = stack(later, j.reference);
    const gained = (s: V7Stack) => (s.decay ?? 0) - (source0.decay ?? 0);
    expect(gained(t)).toBeGreaterThan(0);
    // Next to Sol the site has the same temperature, so both trajectories match.
    expect(gained(t)).toBeCloseTo(gained(r), 6);
    expect(gained(r)).toBeCloseTo(gained(stack(later, f.food)), 8);
    // Moisture: computed water of the treated unit equals the reference; nothing dried.
    expect(water(t)).toBeCloseTo(water(r), 10);
    expect(t.physical).toEqual(treated.physical);
    const d = t.processing?.preservationPhysics as Record<string, number>;
    expect(d.evaporated).toBe(0);
    expect(d.absorbed).toBe(0);
    expect(d.rainAdded).toBe(0);
    expect(foodWaterRead(t)?.rate).toBe(1);
    expect(berries(later)).toBe(6);
    expect(stones(later)).toBe(1);
    expect(trial(later)).toMatchObject({ stage: 'exposed', rainRounds: 0 });
  });

  it('turns or moves the units for 0.2 energy, inspects through probe at its own cost and ends the interval with a comparison of recorded readings', () => {
    const s = started({ durationRounds: 4 });
    let w = s.w;
    const j = trial(w);
    // Turning in place: one round, 0.2 energy, and no represented change to the food.
    const turned = cost(w, mode('tend'));
    expect(turned.energy).toBeCloseTo(0.2, 8);
    expect(trial(turned.world)).toMatchObject({ turns: 1, moves: 0 });
    expect(data(turned.world, 'air-dry-trial-tended')).toMatchObject({
      action: 'turned',
      energy: 0.2,
    });
    expect(stack(turned.world, j.treated)).toEqual(
      stack(turned.idle, j.treated),
    );
    w = fed(turned.world);
    // Moving beyond reach or onto the outcrop is refused at no cost.
    expect(unchanged(w, mode('tend', { x: 12, y: 21.45 }))).toMatch(
      /beyond hand reach/,
    );
    expect(unchanged(w, mode('tend', ON_ROCK))).toMatch(/obstructed/);
    // Moving: support and units go together to the new point; the exposure follows them.
    const moved = cost(w, mode('tend', SITE2));
    expect(moved.energy).toBeCloseTo(0.2, 8);
    w = fed(moved.world);
    expect(trial(w)).toMatchObject({
      turns: 1,
      moves: 1,
      paidEnergy: 1.4,
      placement: { kind: 'ground', x: SITE2.x, y: SITE2.y, area: 0.04 },
      supportItem: { position: SITE2 },
    });
    expect(stack(w, j.treated).position).toEqual(SITE2);
    expect(foodWaterRead(stack(w, j.treated))?.surface).toMatchObject(SITE2);
    expect(data(w, 'air-dry-trial-tended')).toMatchObject({
      action: 'repositioned',
    });
    // Inspection is the probe observation: 0.2 energy in total and no duplicate fee.
    const away = v7Clone(w);
    actor(away).position = { x: 9.5, y: 21 };
    expect(unchanged(away, mode('inspect'))).toMatch(/hand reach/);
    const looked = cost(w, mode('inspect'));
    expect(looked.energy).toBeCloseTo(0.2, 8);
    const seen = w;
    w = fed(looked.world);
    const reading = data(w, 'air-dry-trial-inspected');
    expect(reading).toMatchObject({
      trial: j.id,
      elapsedRounds: 3,
      durationRounds: 4,
      treated: { item: j.treated, present: true, quantity: 1 },
      reference: { item: j.reference, present: true, quantity: 1 },
      decayDifference: 0,
      visible: {
        shrinkage: 'no visible shrinkage',
        wetness: 'no visible wetness',
      },
      water: 'not measured; no weighing or moisture reading exists',
      drying: 'none for whole food under the represented rules',
      safety: 'unverified',
      preservation: 'unverified',
    });
    expect((reading?.treated as Record<string, unknown>).decay).toBe(
      stack(seen, j.treated).decay,
    );
    // Both the probe's own record and the trial record are kept, unverified.
    expect(events(w, 'trial-result')).toHaveLength(2);
    expect(events(w, 'information-confirmed')).toHaveLength(0);
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(
      actor(w).memory.knowledge?.[`${j.treated}:air-dry-trial`],
    ).toMatchObject({ verified: false, subject: 'berry' });
    expect(
      actor(w).memory.knowledge?.[`${j.treated}:observed-state`],
    ).toBeDefined();
    const inspected = events(w, 'air-dry-trial-inspected')[0]?.id;
    expect(trial(w)).toMatchObject({
      inspections: 1,
      observations: [{ elapsedRounds: 3, event: inspected }],
    });
    // The interval ends four rounds after setup with a comparison of the recorded reading only.
    w = step(w).world;
    expect(trial(w)).toMatchObject({
      status: 'stopped',
      stage: 'completed',
      comparison: {
        basis: 'your recorded inspections only',
        inspections: 1,
        decayDifference: 0,
        evidence: [inspected],
        preservation: 'unverified',
        safety: 'unverified',
      },
    });
    expect(events(w, 'air-dry-trial-compared')).toHaveLength(1);
    expect(data(w, 'air-dry-trial-compared')).toMatchObject({
      view: { status: 'completed', preservation: 'unverified' },
    });
    // Ending releases the reference once and leaves units and support lying at the site.
    expect(stack(w, j.reference).reservedFor).toBeUndefined();
    expect(stack(w, j.reference).owner).toBe('sol');
    expect(stack(w, j.treated)).toMatchObject({
      owner: null,
      position: SITE2,
    });
    expect(foodWaterRead(stack(w, j.treated))?.surface).toBeNull();
    const support = w.stacks.find((x) => x.resource === 'stone');
    if (!support) throw new Error('Missing returned support.');
    expect(support).toMatchObject({
      owner: null,
      quantity: 1,
      origin: ROCK,
      position: SITE2,
    });
    expect(support.reservedFor).toBeUndefined();
    expect(trial(w).supportItem).toBeNull();
    expect(w.stacks.filter((x) => x.reservedFor)).toHaveLength(0);
    expect(berries(w)).toBe(6);
    expect(stones(w)).toBe(1);
    // Runtime event text stays free of the excluded vocabulary too.
    const said = JSON.stringify(
      [
        ...turned.world.events,
        ...moved.world.events,
        ...looked.world.events,
        ...w.events,
      ].filter((e) => e.type.startsWith('air-dry-trial-')),
    );
    expect(said).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(said).not.toMatch(EXTRA_EXCLUDED);
    // Settled once: stop, tend and inspect now spend nothing.
    for (const m of ['stop', 'tend', 'inspect'])
      expect(unchanged(fed(w), mode(m))).toMatch(/no open drying trial/);
    // Recovery uses the base pickup at its own cost.
    const picked = step(fed(w), {
      sol: { interface: 'pickup', args: { target: support.id, quantity: 1 } },
    });
    expect(picked.outcomes.sol?.success).toBe(true);
    expect(
      picked.world.stacks.some(
        (x) => x.owner === 'sol' && x.resource === 'stone',
      ),
    ).toBe(true);
  });

  it('ends indeterminate when the interval passes without any inspection', () => {
    const s = started({ durationRounds: 2 });
    let w = step(s.w).world;
    expect(trial(w).stage).toBe('exposed');
    w = step(fed(w)).world;
    expect(trial(w)).toMatchObject({
      status: 'stopped',
      stage: 'indeterminate',
      comparison: null,
      inspections: 0,
    });
    expect(events(w, 'air-dry-trial-indeterminate')).toHaveLength(1);
    expect(events(w, 'air-dry-trial-compared')).toHaveLength(0);
    expect(data(w, 'air-dry-trial-indeterminate')).toMatchObject({
      comparison: null,
      view: { status: 'indeterminate', preservation: 'unverified' },
    });
    expect(w.stacks.filter((x) => x.reservedFor)).toHaveLength(0);
    expect(stones(w)).toBe(1);
  });

  it('records rain wetting the uncovered units: their water rises by exactly the rain received, the reference stays unchanged and decay is not slowed', () => {
    const f = setup();
    // Isolated fixture time: this seed's shared rain term at the site is positive from round 48.
    const w0 = v7Clone(f.w);
    w0.tick = 60;
    w0.time = 60;
    let w = step(w0, { sol: start(f.food, f.stone) }).world;
    const j = trial(w);
    const initial = 0.17;
    const seen: V7Event[] = [...events(w, 'air-dry-trial-rained-on')];
    for (let i = 0; i < 3; i++) {
      const before = stack(w, j.treated).decay ?? 0;
      w = step(fed(w)).world;
      seen.push(...events(w, 'air-dry-trial-rained-on'));
      const last = foodWaterRead(stack(w, j.treated))?.last ?? {};
      expect(Number(last.rain)).toBeGreaterThan(0);
      expect(Number(last.evaporated)).toBe(0);
      expect(stack(w, j.treated).decay ?? 0).toBeGreaterThan(before);
    }
    const t = stack(w, j.treated),
      r = stack(w, j.reference);
    const d = t.processing?.preservationPhysics as Record<string, number>;
    // Conservation: the only change in the treated water is the rain that landed on it.
    expect(water(t)).toBeCloseTo(initial + Number(d.rainAdded), 7);
    expect(water(t)).toBeGreaterThan(water(r));
    expect(water(r)).toBeCloseTo(initial, 10);
    expect(d.evaporated).toBe(0);
    expect(t.physical?.unitSolids).toBeCloseTo(0.03, 8);
    // Wet whole food keeps the ordinary decay rate: rain neither slows nor speeds it.
    expect(foodWaterRead(t)?.rate).toBe(1);
    expect((t.decay ?? 0) - (r.decay ?? 0)).toBeCloseTo(0, 6);
    // The start round was rainy too, so rain landed in four rounds; one event when wetting began.
    expect(trial(w)).toMatchObject({ rainRounds: 4, wet: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.data).toMatchObject({
      trial: j.id,
      change: 'water added by rain',
    });
    const looked = step(fed(w), { sol: mode('inspect') }).world;
    expect(data(looked, 'air-dry-trial-inspected')).toMatchObject({
      wetNow: true,
      visible: { wetness: 'wet from rain' },
      view: { visible: 'wet from rain' },
    });
  });

  it('requires an actually obtained clean, dry, rigid support and refuses invalid starts without spending anything', () => {
    const f = setup();
    const w = f.w;
    const go = (support: string, extra: Record<string, unknown> = {}) =>
      unchanged(w, start(f.food, support, extra));
    expect(
      unchanged(w, mode('start', { inputStackId: f.food, ...SITE })),
    ).toMatch(/Name the support/);
    // Nearby natural stone is not a support: it is not a food surface and is not owned.
    expect(
      unchanged(w, mode('start', { inputStackId: f.food, supportId: ROCK })),
    ).toMatch(/not a food surface/);
    expect(go(f.food)).toMatch(/is food, not a material piece/);
    const fixtures = v7Clone(w);
    fixtures.stacks.push(
      held('held-branch', 'branch'),
      held('held-sand', 'sand'),
      held('held-resin', 'resin'),
      held('held-grass', 'dry-grass', {
        physical: { unitMass: 0.1, unitWater: 0.005, unitSolids: 0.095 },
      }),
      held('scratched-stone', 'stone', {
        processing: { scratchAlteration: { transferredPowder: true } },
      }),
      held('dirty-stone', 'stone'),
    );
    fixtures.state['hardness:intrinsic:dirty-stone'] = {
      version: 1,
      resistance: 8,
      edgeRadius: 0.000125,
      wear: 0,
      fractured: false,
      contaminated: true,
      usable: true,
      source: 'fixture',
      quantity: 1,
    };
    const on = (support: string, extra: Record<string, unknown> = {}) =>
      unchanged(fixtures, start(f.food, support, extra));
    expect(on('held-branch')).toMatch(/not dry: water fraction 0.5/);
    expect(on('held-sand')).toMatch(/not dry: water fraction 0.2/);
    expect(on('held-resin')).toMatch(/toxic/);
    expect(on('held-grass')).toMatch(/not rigid/);
    expect(on('scratched-stone')).toMatch(/treatment, residue/);
    expect(on('dirty-stone')).toMatch(/contaminated or fractured/);
    // One whole support unit per food unit.
    expect(go(f.stone, { quantity: 2 })).toMatch(
      /one whole support unit is needed per food unit, 2 here/,
    );
    expect(go(f.stone, { quantity: 4 })).toMatch(
      /4 treated and 4 reference whole units/,
    );
    expect(go(f.stone, { durationRounds: 0 })).toMatch(/durationRounds/);
    expect(go(f.stone, { durationRounds: 2.5 })).toMatch(/durationRounds/);
    expect(go(f.stone, { x: 12, y: 21.45 })).toMatch(/beyond hand reach/);
    expect(go(f.stone, ON_ROCK)).toMatch(/obstructed/);
    const occupied = v7Clone(w);
    occupied.stacks.push({
      ...held('loose-berry', 'berry'),
      owner: null,
      position: { ...SITE },
    });
    expect(unchanged(occupied, start(f.food, f.stone))).toMatch(
      /other material/,
    );
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.9;
    expect(unchanged(tired, start(f.food, f.stone))).toMatch(/needs 1 energy/);
    const spoiled = v7Clone(w);
    stack(spoiled, f.food).decay = 100;
    expect(unchanged(spoiled, start(f.food, f.stone))).toMatch(/Spoiled food/);
    const apple = v7Clone(w);
    apple.stacks.push(held('held-apples', 'apple', { quantity: 2 }));
    stack(apple, 'held-apples').quantityTenths = 20;
    expect(unchanged(apple, start('held-apples', f.stone))).toMatch(
      /only for berries and roots/,
    );
    for (const m of ['tend', 'inspect', 'stop'])
      expect(unchanged(w, mode(m))).toMatch(/no open drying trial/);
    // One open trial per person.
    const s = started();
    const spare = v7Clone(s.w);
    spare.stacks.push(held('spare-stone', 'stone'));
    expect(unchanged(spare, start(s.food, 'spare-stone', SITE2))).toMatch(
      /still open/,
    );
  });

  it('uses an existing reachable food surface with access, and refuses one that is not or belongs to another person', () => {
    const f = setup();
    const w = v7Clone(f.w);
    w.objects.push(slab('fixture-slab'));
    const plain = v7Clone(f.w);
    plain.objects.push(slab('plain-slab', { foodSurface: false }));
    const theirs = v7Clone(f.w);
    theirs.objects.push(slab('moss-slab', { owner: 'moss' }));
    const on = (world: V7World, support: string, extra = {}) =>
      unchanged(
        world,
        mode('start', { inputStackId: f.food, supportId: support, ...extra }),
      );
    expect(on(plain, 'plain-slab')).toMatch(/not a food surface/);
    expect(on(theirs, 'moss-slab')).toMatch(/belongs to moss/);
    expect(on(w, 'fixture-slab', SITE)).toMatch(/only with your own support/);
    const r = step(w, {
      sol: mode('start', { inputStackId: f.food, supportId: 'fixture-slab' }),
    });
    expect(r.outcomes.sol?.success).toBe(true);
    const j = trial(r.world);
    expect(j).toMatchObject({
      support: { kind: 'object', id: 'fixture-slab' },
      supportItem: null,
      placement: { kind: 'object', id: 'fixture-slab', area: 0.12 },
    });
    expect(stack(r.world, j.treated)).toMatchObject({
      owner: null,
      position: { x: SITE.x, y: SITE.y + 0.1 },
    });
    // The own stone stays carried, and an existing surface cannot be moved.
    expect(stack(r.world, f.stone).owner).toBe('sol');
    expect(unchanged(fed(r.world), mode('tend', SITE2))).toMatch(
      /cannot be moved/,
    );
    // Stopping leaves the units on the surface without the exposure; nothing is refunded.
    const stopped = cost(fed(r.world), mode('stop'));
    expect(stopped.energy).toBeCloseTo(0, 8);
    expect(trial(stopped.world)).toMatchObject({ stage: 'stopped' });
    expect(data(stopped.world, 'air-dry-trial-stopped')).toMatchObject({
      released: [j.reference],
      view: { status: 'interrupted' },
    });
    expect(foodWaterRead(stack(stopped.world, j.treated))?.surface).toBeNull();
  });

  it('is owner-only: another person cannot use the food, support or trial, but taking the lying units interrupts it', () => {
    const s = started();
    let m = v7Clone(s.w);
    actor(m, 'moss').position = { ...MOSS_STAND };
    m = step(m, { moss: { interface: 'learn', args: { ability: id } } }).world;
    m = step(m).world;
    m = fed(step(m).world);
    expect(actor(m, 'moss').mastered).toContain(id);
    const j = trial(m);
    // Sol's carried stack is not even visible to Moss; the shared resolver refuses it.
    expect(unchanged(m, start(s.food, s.stone), 'moss')).toMatch(
      /absent-or-inaccessible/,
    );
    // The treated unit is visible but unowned, so it cannot be anyone's trial input.
    expect(unchanged(m, start(j.treated, s.stone), 'moss')).toMatch(
      /absent-or-inaccessible|your own food/,
    );
    for (const x of ['tend', 'inspect', 'stop'])
      expect(unchanged(m, mode(x), 'moss')).toMatch(/no open drying trial/);
    expect(trial(m)).toMatchObject({ owner: 'sol', stage: 'exposed' });
    // Food lying in the world can be taken by anyone; that interrupts the trial.
    const taken = step(m, {
      moss: { interface: 'pickup', args: { target: j.treated, quantity: 1 } },
    }).world;
    expect(trial(taken)).toMatchObject({
      status: 'stopped',
      stage: 'removed',
      takenBy: 'moss',
    });
    expect(events(taken, 'air-dry-trial-removed')).toHaveLength(1);
    expect(data(taken, 'air-dry-trial-removed')).toMatchObject({
      view: { status: 'interrupted' },
    });
    expect(stack(taken, j.reference).reservedFor).toBeUndefined();
    expect(
      taken.stacks.filter((x) => x.owner === 'moss' && x.resource === 'berry'),
    ).toHaveLength(1);
    expect(taken.stacks.find((x) => x.resource === 'stone')?.position).toEqual(
      SITE,
    );
    expect(berries(taken)).toBe(6);
    expect(stones(taken)).toBe(1);
  });

  it('records a partial removal, and fails when the treated units spoil under the ordinary ageing', () => {
    const f = setup();
    // Two stones carry two units; Moss takes one of them and the rest stays exposed.
    let w = v7Clone(f.w);
    actor(w).position = { ...ROCK_STAND };
    w = step(w, {
      sol: { interface: 'gather', args: { target: ROCK, quantity: 1 } },
    }).world;
    const two = w.stacks.find(
      (x) => x.owner === 'sol' && x.resource === 'stone' && x.id !== f.stone,
    );
    if (!two) throw new Error('Missing second stone.');
    // Join the two gathered stones into one two-unit fixture stack of the same origin.
    stack(w, f.stone).quantity = 2;
    stack(w, f.stone).quantityTenths = 20;
    w.stacks = w.stacks.filter((x) => x.id !== two.id);
    w = step(fed(w), { sol: start(f.food, f.stone, { quantity: 2 }) }).world;
    const j = trial(w);
    expect(j.placement).toMatchObject({ area: 0.08 });
    actor(w, 'moss').position = { ...MOSS_STAND };
    w = step(fed(w), {
      moss: { interface: 'pickup', args: { target: j.treated, quantity: 1 } },
    }).world;
    expect(events(w, 'air-dry-trial-reduced')).toHaveLength(1);
    expect(data(w, 'air-dry-trial-reduced')).toMatchObject({
      taken: 1,
      quantity: 1,
    });
    expect(trial(w)).toMatchObject({ stage: 'exposed', quantity: 1 });
    expect(berries(w)).toBe(6);

    // Spoilage under the existing ageing ends the trial as failed and releases the reference.
    const s = started();
    const old = v7Clone(s.w);
    const t = trial(old);
    stack(old, t.treated).decay = 99.99;
    const spoiled = step(fed(old)).world;
    expect(events(spoiled, 'spoiled')).toHaveLength(1);
    expect(spoiled.stacks.some((x) => x.id === t.treated)).toBe(false);
    expect(trial(spoiled)).toMatchObject({
      status: 'stopped',
      stage: 'spoiled',
    });
    expect(data(spoiled, 'air-dry-trial-spoiled')).toMatchObject({
      treated: { present: false, visibleSpoilage: 'gone' },
      preservation: 'unverified',
      view: { status: 'failed' },
    });
    expect(stack(spoiled, t.reference).reservedFor).toBeUndefined();
    expect(spoiled.stacks.filter((x) => x.reservedFor)).toHaveLength(0);
    expect(berries(spoiled)).toBe(5);
    expect(stones(spoiled)).toBe(1);
  });

  it('ends at death, dropping the reference under the death rules once and leaving units and support at the site', () => {
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
    expect(events(died, 'air-dry-trial-interrupted')).toHaveLength(1);
    expect(data(died, 'air-dry-trial-interrupted')).toMatchObject({
      view: { status: 'interrupted' },
    });
    expect(stack(died, j.reference)).toMatchObject({
      owner: null,
      position: where,
    });
    expect(stack(died, j.reference).reservedFor).toBeUndefined();
    expect(stack(died, j.treated)).toMatchObject({
      owner: null,
      position: SITE,
    });
    expect(
      died.stacks.find((x) => x.resource === 'stone' && x.owner === null),
    ).toMatchObject({ position: SITE });
    expect(died.stacks.filter((x) => x.reservedFor)).toHaveLength(0);
    expect(berries(died)).toBe(6);
    expect(stones(died)).toBe(1);
  });
});
