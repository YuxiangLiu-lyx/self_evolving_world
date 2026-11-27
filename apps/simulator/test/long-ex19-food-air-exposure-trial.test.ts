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
  V7Event,
  V7Object,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 60_000 });

const id = 'food-air-exposure-trial';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** Wren's actual ex19 root source: the meadow root patch Wren gathered three roots from. */
const SOURCE = 'start-0-roots';
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition/i;
/** Wren stands here, just south of the source, on firm meadow ground. */
const STAND = { x: 10.1, y: 12.6 };
/** A ground point within hand reach of STAND. */
const SPOT = { x: 10.5, y: 12.8 };

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
  batch: string;
  control: string | null;
  placement: Record<string, unknown>;
  placedAt: number;
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
const mode = (m: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...extra },
});
const start = (unit: string, extra: Record<string, unknown> = {}) =>
  mode('start', { inputStackId: unit, quantity: 1, ...SPOT, ...extra });
/** Keep everyone fed and rested so the tests isolate the trial from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
function installed() {
  const genesis = initialLongWorld('long-ex19', 'long-culture-v2-oldgoal', {
    seed: 20261201,
    development: 8,
    tokens: 1500000,
  });
  return v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
}
/** Wren gathers three real roots from the meadow patch, as in ex19, and studies two rounds. */
function setup(study = true) {
  let w = installed();
  actor(w).position = { ...STAND };
  w = step(w, {
    wren: { interface: 'gather', args: { target: SOURCE, quantity: 3 } },
  }).world;
  const unit = w.stacks.find((s) => s.owner === 'wren' && s.origin === SOURCE);
  if (!unit) throw new Error('Missing actually gathered fixture roots.');
  if (study) {
    w = step(w, { wren: { interface: 'learn', args: { ability: id } } }).world;
    expect(actor(w).mastered).not.toContain(id);
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  }
  return { w: fed(w), unit: unit.id };
}
/** A started trial: one root exposed on open ground, one carried as a control. */
function started(control = 1) {
  const f = setup();
  const r = step(f.w, { wren: start(f.unit, { controlQuantity: control }) });
  expect(r.outcomes.wren?.success).toBe(true);
  return { ...f, w: r.world };
}
/** The action fails and changes no vitals, stacks or trials compared with waiting. */
function unchanged(w: V7World, action: V7Action, who = 'wren') {
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
  const r = step(w, { wren: action }),
    idle = step(w).world;
  expect(r.outcomes.wren?.success).toBe(true);
  return {
    world: r.world,
    energy: actor(idle).vitals.energy - actor(r.world).vitals.energy,
  };
}
function slab(name: string, x: number, y: number, surface = true): V7Object {
  return {
    id: name,
    name: 'Flat stone slab',
    kind: 'slab',
    spatial: {
      x,
      y,
      angle: 0,
      shape: { kind: 'rectangle', width: 0.6, height: 0.5 },
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

describe('food air-exposure trial in ex19', () => {
  it('is scoped to ex19, fits the frozen text limit, adds no reward source and needs two rounds of study', () => {
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
    expect(all.handlers['long.food-air-exposure-trial']).toBeDefined();
    expect(all.handlers['long.air-dry-food']).toBeDefined();
    expect(all.handlers['long.food-trial']).toBeDefined();
    const f = setup(false);
    const pkg = continuousRegistry(f.w).packages.find((p) => p.id === id);
    expect(pkg?.scope).toBe('long-ex19');
    expect(pkg?.abilities).toHaveLength(1);
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(2);
    expect(ability?.revision).toBe(`${id}@1`);
    expect(ability?.parameters.properties?.mode).toMatchObject({
      enum: ['start', 'inspect', 'stop'],
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
    const refused = step(f.w, { wren: start(f.unit) });
    expect(refused.outcomes.wren?.success).toBe(false);
    expect(actor(refused.world).vitals.energy).toBe(before);
    expect(trials(refused.world)).toHaveLength(0);
    // Two rounds of study, then the interface is usable.
    let w = step(f.w, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(actor(w).learning).toMatchObject({ ability: id, remaining: 1 });
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
    expect(step(fed(w), { wren: start(f.unit) }).outcomes.wren?.success).toBe(
      true,
    );
  });

  it('lays whole roots on open ground at a real cost, keeps a carried control and conserves food and water', () => {
    const f = setup();
    const total = roots(f.w);
    expect(total).toBe(3);
    const placed = cost(f.w, start(f.unit, { controlQuantity: 1 }));
    // One round and 1 + 0.5 x 1 energy for one exposed whole unit.
    expect(placed.energy).toBeCloseTo(1.5, 8);
    const w = placed.world;
    const j = trial(w);
    expect(j).toMatchObject({
      owner: 'wren',
      status: 'active',
      stage: 'exposed',
      input: f.unit,
      quantity: 1,
      paidEnergy: 1.5,
      escrow: [j.control],
      placement: { kind: 'ground', x: SPOT.x, y: SPOT.y, area: 0.04 },
    });
    // The batch lies unowned and unreserved at the footprint centre with a water record.
    const batch = stack(w, j.batch);
    expect(batch).toMatchObject({
      owner: null,
      quantity: 1,
      origin: SOURCE,
      position: SPOT,
    });
    expect(batch.reservedFor).toBeUndefined();
    expect(batch.physical?.unitMass).toBeCloseTo(0.4, 8);
    expect(batch.physical?.unitWater).toBeCloseTo(0.3, 8);
    expect(batch.physical?.unitSolids).toBeCloseTo(0.1, 8);
    expect(foodWaterRead(batch)).toMatchObject({
      prepared: false,
      opening: 1,
      rate: 1,
      area: 0.04,
      surface: { kind: 'ground', x: SPOT.x, y: SPOT.y, area: 0.04 },
    });
    // The control stays carried and reserved in ordinary handling, without a water record.
    const control = stack(w, j.control ?? '');
    expect(control).toMatchObject({
      owner: 'wren',
      quantity: 1,
      reservedFor: j.id,
    });
    expect(control.physical).toBeUndefined();
    expect(control.processing).toBeUndefined();
    expect(stack(w, f.unit)).toMatchObject({ owner: 'wren', quantity: 1 });
    expect(stack(w, f.unit).reservedFor).toBeUndefined();
    expect(roots(w)).toBe(total);
    // Observable placement with reusable view metadata; nothing shows preservation.
    expect(events(w, 'air-exposure-placed')).toHaveLength(1);
    expect(events(w, 'process-progress')).toHaveLength(1);
    expect(data(w, 'air-exposure-placed')).toMatchObject({
      stage: 'exposed',
      safety: 'unverified',
      preservation: 'unverified',
      view: {
        component: 'ground-stack',
        item: j.batch,
        placement: 'ground',
        form: 'intact',
        state: 'exposed',
        preservation: 'unverified',
      },
    });
    expect(events(w, 'preservation-progress')).toHaveLength(1);
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(actor(w).extensionState[`long:work:${id}`]).toMatchObject({
      id: j.id,
      stage: 'exposed',
    });
    // Unattended rounds charge nothing more; decay keeps rising and whole food loses no water.
    let later = w;
    const decay = [batch.decay ?? 0];
    for (let i = 0; i < 6; i++) {
      later = step(fed(later)).world;
      expect(events(later, 'process-progress')).toHaveLength(0);
      decay.push(stack(later, j.batch).decay ?? 0);
    }
    expect(trial(later).paidEnergy).toBe(1.5);
    for (let i = 1; i < decay.length; i++)
      expect(decay[i] ?? 0).toBeGreaterThan(decay[i - 1] ?? 0);
    const exposed = stack(later, j.batch),
      kept = stack(later, j.control ?? ''),
      rest = stack(later, f.unit);
    // Batch, control and the rest started equal; the trial never resets or lowers decay.
    const gained = (s: V7Stack) => (s.decay ?? 0) - (batch.decay ?? 0);
    expect(gained(exposed)).toBeGreaterThan(0);
    expect(gained(kept)).toBeCloseTo(gained(rest), 8);
    // Next to Wren the ground has the same temperature, so the trajectories match.
    expect(gained(exposed)).toBeCloseTo(gained(kept), 6);
    const d = exposed.processing?.preservationPhysics as Record<string, number>;
    expect(d.evaporated).toBe(0);
    expect(d.absorbed).toBe(0);
    expect(d.rainAdded).toBe(0);
    expect(exposed.physical).toEqual(batch.physical);
    expect(roots(later)).toBe(total);
    expect(trial(later)).toMatchObject({ stage: 'exposed', rainRounds: 0 });
  });

  it('inspects in reach for 0.2 energy with an unverified reading, and stop releases the control once and leaves the batch', () => {
    const s = started();
    let w = s.w;
    for (let i = 0; i < 4; i++) w = step(fed(w)).world;
    const j = trial(w);
    // Out of reach the inspection is refused at no cost.
    const away = v7Clone(w);
    actor(away).position = { x: 13, y: 13 };
    expect(unchanged(away, mode('inspect'))).toMatch(/hand reach/);
    const looked = cost(w, mode('inspect'));
    expect(looked.energy).toBeCloseTo(0.2, 8);
    const seen = w;
    w = looked.world;
    const reading = data(w, 'air-exposure-inspected');
    expect(reading).toMatchObject({
      trial: j.id,
      elapsedRounds: 5,
      exposed: { item: j.batch, present: true, quantity: 1 },
      control: { item: j.control, present: true, quantity: 1 },
      water: 'not measured; no weighing or moisture reading was made',
      safety: 'unverified',
      preservation: 'unverified',
      rainRounds: 0,
    });
    const exposed = reading?.exposed as Record<string, number>,
      control = reading?.control as Record<string, number>;
    // The reading is the actual decay when the batch was looked at, before that round's ageing.
    expect(exposed.decay).toBe(stack(seen, j.batch).decay);
    expect(exposed.decayGained).toBeGreaterThan(0);
    expect(reading?.decayDifference).toBeCloseTo(
      Number(exposed.decayGained) - Number(control.decayGained),
      8,
    );
    const known = actor(w).memory.knowledge?.[`${j.batch}:air-exposure`];
    expect(known).toMatchObject({ verified: false, subject: 'root' });
    expect(events(w, 'trial-result')).toHaveLength(1);
    expect(events(w, 'information-confirmed')).toHaveLength(0);
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(trial(w).observations).toHaveLength(1);
    // Stop: one round, no energy; the control returns to ordinary use and the batch stays.
    const stopped = cost(w, mode('stop'));
    expect(stopped.energy).toBeCloseTo(0, 8);
    w = stopped.world;
    expect(trial(w)).toMatchObject({ status: 'stopped', stage: 'stopped' });
    expect(trial(w).outcome).toMatchObject({ stage: 'stopped' });
    expect(stack(w, j.control ?? '').reservedFor).toBeUndefined();
    expect(stack(w, j.control ?? '').owner).toBe('wren');
    expect(stack(w, j.batch)).toMatchObject({ owner: null, quantity: 1 });
    expect(events(w, 'air-exposure-stopped')).toHaveLength(1);
    expect(events(w, 'process-stopped')).toHaveLength(1);
    expect(data(w, 'air-exposure-stopped')).toMatchObject({
      released: [j.control],
      view: { state: 'stopped', preservation: 'unverified' },
    });
    expect(w.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
    expect(roots(w)).toBe(3);
    // Runtime event text stays free of the excluded vocabulary too.
    const said = JSON.stringify(
      [...seen.events, ...looked.world.events, ...w.events].filter((e) =>
        e.type.startsWith('air-exposure-'),
      ),
    );
    expect(said).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(said).not.toMatch(EXTRA_EXCLUDED);
    // Settled once: a second stop or an inspection now spends nothing.
    expect(unchanged(fed(w), mode('stop'))).toMatch(/no open exposure trial/);
    expect(unchanged(fed(w), mode('inspect'))).toMatch(
      /no open exposure trial/,
    );
    // The batch is taken back with the base pickup, at its own cost; its water record stays.
    const picked = step(fed(w), {
      wren: { interface: 'pickup', args: { target: j.batch, quantity: 1 } },
    });
    expect(picked.outcomes.wren?.success).toBe(true);
    const back = picked.world.stacks.find(
      (s) => s.owner === 'wren' && foodWaterRead(s),
    );
    expect(back).toBeDefined();
    expect(foodWaterRead(back as V7Stack)?.surface).toBeNull();
    expect(roots(picked.world)).toBe(3);
  });

  it('records rain landing on the uncovered batch; whole food gains that water, never dries and keeps ageing', () => {
    const f = setup();
    // Isolated fixture time: this seed's shared rain term is positive from round 85.
    const w0 = v7Clone(f.w);
    w0.tick = 86;
    w0.time = 86;
    let w = step(w0, { wren: start(f.unit, { quantity: 2 }) }).world;
    const j = trial(w);
    expect(j.placement).toMatchObject({ area: 0.08 });
    const initial = 2 * 0.3;
    let received = 0;
    for (let i = 0; i < 3; i++) {
      const before = stack(w, j.batch).decay ?? 0;
      w = step(fed(w)).world;
      const last = foodWaterRead(stack(w, j.batch))?.last ?? {};
      expect(Number(last.rain)).toBeGreaterThan(0);
      expect(Number(last.evaporated)).toBe(0);
      received += Number(last.received);
      expect(stack(w, j.batch).decay ?? 0).toBeGreaterThan(before);
    }
    const batch = stack(w, j.batch);
    const water = (batch.physical?.unitWater ?? 0) * batch.quantity;
    const d = batch.processing?.preservationPhysics as Record<string, number>;
    // Conservation: the only change in water is the rain that landed on the batch.
    expect(water).toBeCloseTo(initial + Number(d.rainAdded), 7);
    expect(water).toBeGreaterThan(initial);
    expect(d.evaporated).toBe(0);
    expect(batch.physical?.unitSolids).toBeCloseTo(0.1, 8);
    expect(foodWaterRead(batch)?.rate).toBe(1);
    expect(received).toBeGreaterThan(0);
    // The start round was rainy too, so rain landed in four rounds.
    expect(trial(w)).toMatchObject({ rainRounds: 4, wet: true });
    const looked = step(fed(w), { wren: mode('inspect') }).world;
    expect(data(looked, 'air-exposure-inspected')).toMatchObject({
      wetNow: true,
      drying: 'none for whole food under the represented rules',
      view: { surface: 'wet from rain' },
    });
  });

  it('emits the rain event when wetting begins', () => {
    const f = setup();
    // The start round (83) and the next (84) are dry; rain lands from round 85.
    const w0 = v7Clone(f.w);
    w0.tick = 82;
    w0.time = 82;
    let w = step(w0, { wren: start(f.unit) }).world;
    const seen: V7Event[] = [...events(w, 'air-exposure-rained-on')];
    for (let i = 0; i < 4; i++) {
      w = step(fed(w)).world;
      seen.push(...events(w, 'air-exposure-rained-on'));
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]?.actor).toBe('wren');
    expect(seen[0]?.data).toMatchObject({
      trial: trial(w).id,
      view: { surface: 'wet from rain' },
    });
  });

  it('ends when someone takes the batch, records a partial removal, and ends when the batch spoils', () => {
    // Partial removal by another person: the rest stays exposed and the trial continues.
    const f = setup();
    let w = step(f.w, { wren: start(f.unit, { quantity: 2 }) }).world;
    const j = trial(w);
    actor(w, 'moss').position = { x: SPOT.x + 0.3, y: SPOT.y };
    w = step(fed(w), {
      moss: { interface: 'pickup', args: { target: j.batch, quantity: 1 } },
    }).world;
    expect(events(w, 'air-exposure-reduced')).toHaveLength(1);
    expect(data(w, 'air-exposure-reduced')).toMatchObject({
      taken: 1,
      quantity: 1,
    });
    expect(trial(w)).toMatchObject({ stage: 'exposed', quantity: 1 });
    // Taking the rest ends the trial as a removal by that person.
    w = step(fed(w), {
      moss: { interface: 'pickup', args: { target: j.batch, quantity: 1 } },
    }).world;
    expect(trial(w)).toMatchObject({
      status: 'stopped',
      stage: 'removed',
      takenBy: 'moss',
    });
    expect(events(w, 'air-exposure-removed')).toHaveLength(1);
    expect(
      w.stacks.filter((s) => s.owner === 'moss' && s.resource === 'root'),
    ).toHaveLength(2);
    expect(roots(w)).toBe(3);

    // Spoilage under the existing ageing ends the trial and releases the control once.
    const s = started();
    const old = v7Clone(s.w);
    const t = trial(old);
    stack(old, t.batch).decay = 239.99;
    const spoiled = step(fed(old)).world;
    expect(events(spoiled, 'spoiled')).toHaveLength(1);
    expect(spoiled.stacks.some((x) => x.id === t.batch)).toBe(false);
    expect(trial(spoiled)).toMatchObject({
      status: 'stopped',
      stage: 'spoiled',
    });
    expect(events(spoiled, 'air-exposure-spoiled')).toHaveLength(1);
    expect(data(spoiled, 'air-exposure-spoiled')).toMatchObject({
      exposed: { present: false, visibleSpoilage: 'gone' },
      preservation: 'unverified',
    });
    expect(stack(spoiled, t.control ?? '').reservedFor).toBeUndefined();
    expect(spoiled.stacks.filter((x) => x.reservedFor)).toHaveLength(0);
    expect(roots(spoiled)).toBe(2);
  });

  it('refuses invalid starts and other people’s trials without spending anything', () => {
    const f = setup();
    const w = f.w;
    expect(unchanged(w, start(f.unit, { quantity: 4 }))).toMatch(
      /fewer than 4 whole units/,
    );
    expect(
      unchanged(w, start(f.unit, { quantity: 2, controlQuantity: 2 })),
    ).toMatch(/fewer than 4 whole units/);
    expect(unchanged(w, start(f.unit, { x: 12, y: 12.8 }))).toMatch(
      /beyond hand reach/,
    );
    expect(
      unchanged(w, start(f.unit, { supportId: 'start-0-roots', x: 10 })),
    ).toMatch(/either x and y or supportId/);
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 1.2;
    expect(unchanged(tired, start(f.unit))).toMatch(/needs 1.5 energy/);
    const occupied = v7Clone(w);
    occupied.stacks.push({
      id: 'loose-berry',
      resource: 'berry',
      quantity: 1,
      quantityTenths: 10,
      position: { ...SPOT },
      owner: null,
      origin: 'fixture',
      harvestedAt: 0,
      decay: 0,
    });
    expect(unchanged(occupied, start(f.unit))).toMatch(/other material/);
    const blocked = v7Clone(w);
    const tree = blocked.objects.find((o) => o.spatial.solid);
    if (!tree) throw new Error('Missing solid fixture object.');
    // A small solid fixture stone on the footprint, clear of Wren's body.
    blocked.objects.push({
      ...v7Clone(tree),
      id: 'fixture-stone',
      spatial: {
        ...v7Clone(tree.spatial),
        x: SPOT.x,
        y: SPOT.y,
        shape: { kind: 'circle', radius: 0.08 },
        entrances: [],
      },
    });
    expect(unchanged(blocked, start(f.unit))).toMatch(/obstructed/);
    const spoiled = v7Clone(w);
    stack(spoiled, f.unit).decay = 240;
    expect(unchanged(spoiled, start(f.unit))).toMatch(/Spoiled food/);
    const apple = v7Clone(w);
    apple.stacks.push({
      id: 'held-apple',
      resource: 'apple',
      quantity: 1,
      quantityTenths: 10,
      position: { ...STAND },
      owner: 'wren',
      origin: 'fixture',
      harvestedAt: 0,
      decay: 0,
    });
    expect(unchanged(apple, start('held-apple'))).toMatch(
      /only for berries and roots/,
    );
    expect(unchanged(w, mode('inspect'))).toMatch(/no open exposure trial/);
    expect(unchanged(w, mode('stop'))).toMatch(/no open exposure trial/);
    // One open trial per person.
    const s = started();
    expect(
      unchanged(fed(s.w), start(s.unit, { x: SPOT.x - 0.5, y: SPOT.y })),
    ).toMatch(/still open/);
    // Owner only: Moss, who has studied it too, can neither use Wren's food nor her trial.
    let m = v7Clone(s.w);
    actor(m, 'moss').position = { x: SPOT.x + 0.3, y: SPOT.y };
    m = step(m, { moss: { interface: 'learn', args: { ability: id } } }).world;
    m = fed(step(m).world);
    expect(actor(m, 'moss').mastered).toContain(id);
    // Wren's carried stack is not even visible to Moss; the shared resolver refuses it.
    expect(unchanged(m, start(s.unit), 'moss')).toMatch(
      /absent-or-inaccessible/,
    );
    // The exposed batch is visible but unowned, so it cannot be anyone's trial input.
    expect(unchanged(m, start(trial(m).batch), 'moss')).toMatch(
      /your own food/,
    );
    expect(unchanged(m, mode('inspect'), 'moss')).toMatch(
      /no open exposure trial/,
    );
    expect(unchanged(m, mode('stop'), 'moss')).toMatch(
      /no open exposure trial/,
    );
    expect(trial(m)).toMatchObject({ owner: 'wren', stage: 'exposed' });
  });

  it('uses an existing reachable food surface and refuses objects that are not one', () => {
    const f = setup();
    const w = v7Clone(f.w);
    w.objects.push(slab('fixture-slab', 10.6, 12.6));
    w.objects.push(slab('plain-slab', 9.6, 12.9, false));
    w.objects.push(slab('far-slab', 14, 12.6));
    const on = (support: string) =>
      mode('start', { inputStackId: f.unit, quantity: 1, supportId: support });
    expect(unchanged(w, on('plain-slab'))).toMatch(/not a food surface/);
    expect(unchanged(w, on('far-slab'))).toMatch(/out of reach/);
    const r = step(w, { wren: on('fixture-slab') });
    expect(r.outcomes.wren?.success).toBe(true);
    const j = trial(r.world);
    expect(j.placement).toMatchObject({
      kind: 'object',
      id: 'fixture-slab',
      area: 0.3,
    });
    expect(stack(r.world, j.batch)).toMatchObject({
      owner: null,
      position: { x: 10.6, y: 12.6 },
    });
    expect(data(r.world, 'air-exposure-placed')).toMatchObject({
      contamination: 'support contact; not assessed',
      view: { placement: 'support', support: 'fixture-slab' },
    });
  });

  it('ends at death, dropping the control under the death rules once and leaving the batch exposed', () => {
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
    expect(events(died, 'air-exposure-interrupted')).toHaveLength(1);
    expect(stack(died, j.control ?? '')).toMatchObject({
      owner: null,
      position: where,
    });
    expect(stack(died, j.control ?? '').reservedFor).toBeUndefined();
    expect(stack(died, j.batch)).toMatchObject({ owner: null, position: SPOT });
    expect(foodWaterRead(stack(died, j.batch))?.surface).not.toBeNull();
    expect(died.stacks.filter((x) => x.reservedFor)).toHaveLength(0);
    expect(roots(died)).toBe(3);
  });
});
