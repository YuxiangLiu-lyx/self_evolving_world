import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  foodWaterActive,
  foodWaterExpose,
  foodWaterInitialize,
  foodWaterRead,
  foodWaterSurfaceArea,
  foodWaterWithdraw,
  forestClimate,
  v7Clone,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  FoodWaterReading,
  FoodWaterSurface,
  V7Action,
  V7Object,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { longOrdinaryInput } from '../src/long-context.js';
import { initialLongWorld } from '../src/long-scenario.js';

const WAIT: V7Action = { interface: 'wait', args: {} };
function step(w: V7World, actions: Record<string, V7Action> = {}): V7World {
  const result = v7Step(
    w,
    Object.fromEntries(w.actors.map((a) => [a.id, actions[a.id] ?? WAIT])),
    continuousRegistry(w),
  );
  if (result.paused) throw new Error(result.paused);
  return v7Clone(result.world);
}
function steps(w: V7World, n: number): V7World {
  let next = w;
  for (let i = 0; i < n; i++) next = step(next);
  return next;
}
/** Isolated fixture time: the shared rain term is zero for rounds 6-121 of this seed and
 * positive afterwards; the culture pressure schedule stays mild throughout. */
function world(time: number): V7World {
  const w = v7Clone(initialLongWorld('long-ex15', 'long-culture'));
  w.tick = time;
  w.time = time;
  return w;
}
function food(
  w: V7World,
  id: string,
  x: number,
  y: number,
  owner: string | null = null,
): V7Stack {
  const s: V7Stack = {
    id,
    resource: 'berry',
    quantity: 1,
    position: { x, y },
    owner,
    origin: 'isolated-food-water-input',
    harvestedAt: w.tick,
    decay: 0,
  };
  w.stacks.push(s);
  return s;
}
function stack(w: V7World, id: string): V7Stack {
  const s = w.stacks.find((s) => s.id === id);
  if (!s) throw new Error(`Missing fixture stack ${id}`);
  return s;
}
function read(w: V7World, id: string): FoodWaterReading {
  const r = foodWaterRead(stack(w, id));
  if (!r) throw new Error('Missing food water record');
  return r;
}
function water(s: V7Stack): number {
  return (s.physical?.unitWater ?? 0) * s.quantity;
}
function slab(id: string, x: number, y: number, data = {}): V7Object {
  return {
    id,
    name: 'Flat stone slab',
    kind: 'slab',
    spatial: {
      x,
      y,
      angle: 0,
      shape: { kind: 'rectangle', width: 1.2, height: 1 },
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
    data: { foodSurface: true, ...data },
    createdBy: null,
    createdAt: 0,
    revision: 'foundation-forest@1',
  };
}
function boulder(w: V7World, id: string, x: number, y: number): void {
  const stone = w.objects.find((o) => o.id === 'start-1-stone');
  if (!stone) throw new Error('Missing authored stone');
  const o = v7Clone(stone);
  o.id = id;
  o.spatial.x = x;
  o.spatial.y = y;
  w.objects.push(o);
}
const GROUND: FoodWaterSurface = { kind: 'ground', x: 19, y: 6, area: 1.5 };

describe('food water representation in the culture scope', () => {
  it('is installed only by the culture genesis and changes nothing agents see', () => {
    for (const scenario of [
      'long-culture',
      'long-culture-incentives',
    ] as const) {
      const w = initialLongWorld('long-ex15', scenario);
      expect(w.state.foodWater).toBe(1);
      expect(w.config.longDevelopment?.culture?.foodWater).toBe(true);
      expect(foodWaterActive(w)).toBe(true);
      expect(w.state.foodPreservation).toBeUndefined();
      expect(w.stacks.filter((s) => foodWaterRead(s))).toEqual([]);
      expect(w.objects.some((o) => o.data.foodSurface === true)).toBe(false);
      for (const a of w.actors) {
        expect(forestClimate(w, a.position)).not.toHaveProperty('airHumidity');
        expect(JSON.stringify(longOrdinaryInput(w, a.id))).not.toMatch(
          /airHumidity|foodWater|foodSurface/,
        );
      }
      // Until an interface gives food a water composition, a round is unchanged by the flag.
      const without = v7Clone(w);
      delete without.state.foodWater;
      const flagged = step(v7Clone(w));
      delete flagged.state.foodWater;
      expect(flagged).toEqual(step(without));
    }
    for (const w of [
      initialLongWorld('long-ex15', 'long-fixes'),
      initialLongWorld('long-ex14', 'long-fixes'),
      initialLongWorld('long-ex13'),
    ]) {
      expect(w.state).not.toHaveProperty('foodWater');
      expect(w.config.longDevelopment?.culture).toBeUndefined();
      expect(foodWaterActive(w)).toBe(false);
      const s = food(v7Clone(w), 'outside', 19, 6);
      expect(() => foodWaterInitialize(w, s)).toThrow(
        /no food water representation/,
      );
    }
  });

  it('dries prepared food on open ground in dry weather and slows its decay against a paired sample', () => {
    let w = world(40);
    food(w, 'exposed', 18, 6);
    food(w, 'whole', 18, 3);
    food(w, 'paired', 22, 6);
    const start = foodWaterExpose(w, stack(w, 'exposed'), GROUND, true);
    expect(start).toMatchObject({
      waterFraction: 0.85,
      massRatio: 1,
      area: 1.5,
      prepared: true,
      opening: 1.1,
      rate: 1.1,
      surface: GROUND,
      last: null,
    });
    expect(stack(w, 'exposed').position).toEqual({ x: 19, y: 6 });
    // Unprepared whole food on its own footprint neither evaporates nor absorbs vapour.
    foodWaterExpose(
      w,
      stack(w, 'whole'),
      { kind: 'ground', x: 19, y: 3, area: 1.5 },
      false,
    );
    const before = { exposed: 0, paired: 0 };
    for (let i = 0; i < 20; i++) {
      before.exposed = stack(w, 'exposed').decay ?? 0;
      before.paired = stack(w, 'paired').decay ?? 0;
      w = step(w);
    }
    const r = read(w, 'exposed');
    expect(r.area).toBe(1.5);
    expect(r.last).toMatchObject({ rain: 0, received: 0, area: 1.5 });
    expect(r.waterFraction).toBeLessThan(0.3);
    expect(r.massRatio).toBeLessThan(0.25);
    expect(r.rate).toBeLessThan(0.5);
    const d = stack(w, 'exposed').processing?.preservationPhysics as Record<
      string,
      number
    >;
    // Conservation: the evaporated net of absorbed water left the food.
    expect(Number(d.evaporated) - Number(d.absorbed)).toBeCloseTo(
      0.17 - water(stack(w, 'exposed')),
      6,
    );
    expect(w.state['preservation:water']).toMatchObject({ rain: 0 });
    const exposed = stack(w, 'exposed'),
      paired = stack(w, 'paired');
    expect(paired.processing).toBeUndefined();
    expect(exposed.decay ?? 0).toBeLessThan((paired.decay ?? 0) * 0.7);
    expect((exposed.decay ?? 0) - before.exposed).toBeLessThan(
      ((paired.decay ?? 0) - before.paired) * 0.5,
    );
    const whole = read(w, 'whole');
    expect(whole.area).toBe(1.5);
    expect(whole.waterFraction).toBeCloseTo(0.85, 6);
    expect(whole.rate).toBe(1);
    expect(whole.last).toMatchObject({ evaporated: 0, absorbed: 0 });
  });

  it('adds rain landing on the exposed area', () => {
    let w = world(165);
    food(w, 'whole', 18, 6);
    foodWaterExpose(w, stack(w, 'whole'), GROUND, false);
    for (let i = 0; i < 3; i++) {
      const previous = water(stack(w, 'whole'));
      w = step(w);
      const row = read(w, 'whole').last ?? {};
      // Stored world numbers are rounded to eight decimals.
      expect(Number(row.rain)).toBeGreaterThan(0.5);
      expect(Number(row.received)).toBeCloseTo(
        Number(row.rain) * 1.5 * 0.01,
        7,
      );
      expect(water(stack(w, 'whole')) - previous).toBeCloseTo(
        Number(row.received),
        7,
      );
    }
    expect(read(w, 'whole').waterFraction).toBeGreaterThan(0.85);
  });

  it('gives no area on invalid, obstructed or occupied surfaces', () => {
    let w = world(40);
    w.objects.push(slab('plain-slab', 19, 9, { foodSurface: false }));
    const invalid: [FoodWaterSurface, RegExp][] = [
      [{ kind: 'ground', x: 27.5, y: 6, area: 1 }, /firm ordinary ground/],
      [{ kind: 'ground', x: 24.5, y: 6, area: 0.5 }, /firm ordinary ground/],
      [{ kind: 'ground', x: 0.3, y: 0.3, area: 1 }, /inside the world/],
      [{ kind: 'ground', x: 15.5, y: 10.5, area: 1 }, /obstructed/],
      [{ kind: 'ground', x: 19, y: 6, area: 0 }, /positive finite area/],
      [{ kind: 'object', id: 'start-1-stone' }, /not a food surface/],
      [{ kind: 'object', id: 'plain-slab' }, /not a food surface/],
      [{ kind: 'object', id: 'missing' }, /No actual object/],
    ];
    const s = food(w, 'exposed', 18, 6);
    for (const [surface, reason] of invalid) {
      expect(() => foodWaterSurfaceArea(w, surface)).toThrow(reason);
      expect(() => foodWaterExpose(w, s, surface, true)).toThrow(reason);
    }
    expect(s.processing).toBeUndefined();
    expect(s.physical).toBeUndefined();
    expect(s.position).toEqual({ x: 18, y: 6 });
    foodWaterExpose(w, s, GROUND, true);
    w = step(w);
    expect(Number(read(w, 'exposed').last?.evaporated)).toBeGreaterThan(0);
    // A solid object placed over the footprint obstructs it.
    boulder(w, 'fixture-boulder', 19.3, 6);
    const held = water(stack(w, 'exposed'));
    w = step(w);
    expect(read(w, 'exposed')).toMatchObject({ area: 0, surface: GROUND });
    expect(read(w, 'exposed').last).toMatchObject({ evaporated: 0, area: 0 });
    expect(water(stack(w, 'exposed'))).toBeCloseTo(held, 7);
    expect(w.events.some((e) => e.type === 'preservation-progress')).toBe(
      false,
    );
    w.objects = w.objects.filter((o) => o.id !== 'fixture-boulder');
    w = step(w);
    expect(read(w, 'exposed').area).toBe(1.5);
    expect(w.events.some((e) => e.type === 'preservation-progress')).toBe(true);
    // Other loose material on the footprint occupies it; a second sample cannot share it.
    food(w, 'litter', 19.2, 6.1);
    expect(() => foodWaterSurfaceArea(w, GROUND, 'exposed')).toThrow(
      /one sample at a time/,
    );
    w = step(w);
    expect(read(w, 'exposed').area).toBe(0);
    const other = food(w, 'other', 21, 8);
    expect(() =>
      foodWaterExpose(
        w,
        other,
        { kind: 'ground', x: 19.5, y: 6.5, area: 1 },
        true,
      ),
    ).toThrow(/one sample at a time/);
  });

  it('dries food on an object food surface, which wears only with a service account', () => {
    let w = world(40);
    w.objects.push(slab('slab', 19, 8), slab('worn', 19, 3, { service: 1 }));
    food(w, 'on-slab', 18, 8);
    food(w, 'on-worn', 18, 3);
    expect(foodWaterSurfaceArea(w, { kind: 'object', id: 'slab' })).toBeCloseTo(
      1.2,
      9,
    );
    foodWaterExpose(
      w,
      stack(w, 'on-slab'),
      { kind: 'object', id: 'slab' },
      true,
    );
    foodWaterExpose(
      w,
      stack(w, 'on-worn'),
      { kind: 'object', id: 'worn' },
      true,
    );
    expect(stack(w, 'on-slab').position).toEqual({ x: 19, y: 8 });
    w = steps(w, 5);
    const r = read(w, 'on-slab');
    expect(r.area).toBeCloseTo(1.2, 9);
    expect(r.waterFraction).toBeLessThan(0.8);
    const surface = w.objects.find((o) => o.id === 'slab');
    expect(surface?.data).not.toHaveProperty('service');
    expect(surface?.data.preservation).toMatchObject({
      sample: 'on-slab',
      owner: null,
      prepared: true,
    });
    expect(
      Number(w.objects.find((o) => o.id === 'worn')?.data.service),
    ).toBeCloseTo(0.95, 9);
  });

  it('leaves carried food unaffected and ends exposure when the food is picked up', () => {
    let w = world(40);
    const lin = w.actors.find((a) => a.id === 'lin');
    if (!lin) throw new Error('Missing fixture actor');
    const carried = food(w, 'carried', lin.position.x, lin.position.y, 'lin');
    foodWaterInitialize(w, carried);
    expect(() => foodWaterExpose(w, carried, GROUND, true)).toThrow(
      /not carried food/,
    );
    food(w, 'exposed', 18, 6);
    foodWaterExpose(w, stack(w, 'exposed'), GROUND, true);
    w = steps(w, 3);
    expect(read(w, 'carried')).toMatchObject({ area: 0, waterFraction: 0.85 });
    expect(read(w, 'carried').last).toMatchObject({ area: 0, evaporated: 0 });
    const dried = read(w, 'exposed').waterFraction;
    expect(dried).toBeLessThan(0.85);
    const actor = w.actors.find((a) => a.id === 'lin');
    if (!actor) throw new Error('Missing fixture actor');
    actor.position = { x: 19, y: 6.6 };
    w = step(w, {
      lin: { interface: 'pickup', args: { target: 'exposed', quantity: 1 } },
    });
    const picked = w.stacks.find(
      (s) => s.owner === 'lin' && s.id !== 'carried' && foodWaterRead(s),
    );
    if (!picked) throw new Error('Missing picked-up food');
    const now = foodWaterRead(picked);
    expect(now).toMatchObject({ area: 0, surface: null });
    expect(now?.waterFraction).toBeCloseTo(dried, 6);
    w = steps(w, 3);
    expect(read(w, picked.id).waterFraction).toBeCloseTo(dried, 6);
    expect(read(w, picked.id).area).toBe(0);
  });

  it('releases the surface on withdrawal and keeps the dried composition', () => {
    let w = world(40);
    w.objects.push(slab('slab', 19, 8));
    food(w, 'first', 18, 8);
    food(w, 'second', 21, 9);
    const surface: FoodWaterSurface = { kind: 'object', id: 'slab' };
    foodWaterExpose(w, stack(w, 'first'), surface, true);
    expect(() => foodWaterExpose(w, stack(w, 'second'), surface, true)).toThrow(
      /one sample at a time/,
    );
    expect(() => foodWaterExpose(w, stack(w, 'first'), GROUND, true)).toThrow(
      /withdraw it first/,
    );
    w = steps(w, 8);
    const dried = read(w, 'first');
    expect(dried.rate).toBeLessThan(1);
    foodWaterWithdraw(w, stack(w, 'first'));
    expect(() => {
      foodWaterWithdraw(w, stack(w, 'first'));
    }).toThrow(/not lie on a general surface/);
    expect(read(w, 'first')).toMatchObject({
      surface: null,
      area: 0,
      prepared: true,
      waterFraction: dried.waterFraction,
      rate: dried.rate,
    });
    const slabObject = w.objects.find((o) => o.id === 'slab');
    expect(slabObject?.data).not.toHaveProperty('preservation');
    w = steps(w, 2);
    expect(read(w, 'first').area).toBe(0);
    expect(read(w, 'first').waterFraction).toBeCloseTo(dried.waterFraction, 6);
    // The withdrawn food still lies there until someone takes it; then the slab is free.
    const actor = w.actors.find((a) => a.id === 'lin');
    if (!actor) throw new Error('Missing fixture actor');
    actor.position = { x: 19, y: 8.7 };
    w = step(w, {
      lin: { interface: 'pickup', args: { target: 'first', quantity: 1 } },
    });
    expect(
      foodWaterExpose(w, stack(w, 'second'), surface, true).area,
    ).toBeCloseTo(1.2, 9);
  });
});
