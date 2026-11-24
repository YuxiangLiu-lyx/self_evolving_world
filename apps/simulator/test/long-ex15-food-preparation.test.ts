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
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 30_000 });

const id = 'food-preparation';
const WAIT: V7Action = { interface: 'wait', args: {} };
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
const actor = (w: V7World, name = 'ivo'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === type);
/** Every berry tenth the person owns, carried, reserved or combined. */
const berries = (w: V7World, owner = 'ivo') =>
  w.stacks
    .filter((s) => s.owner === owner && s.resource === 'berry')
    .reduce((n, s) => n + Math.round(s.quantity * 10), 0);
const job = (w: V7World) =>
  Object.entries(w.state).find(
    ([k, v]) =>
      k.startsWith('collective:work:') &&
      (v as { ability?: string }).ability === id,
  )?.[1] as { id: string; status: string; escrow: string[] } | undefined;
const prepared = (w: V7World): V7Stack | undefined =>
  w.stacks.find((s) => s.owner === 'ivo' && s.processing?.preparedFood);

/** Ivo gathers real berries (and optionally roots) near the start, then studies for one round. */
function setup(roots = 0, study = true) {
  const genesis = initialLongWorld('long-ex15', 'long-culture');
  let w = v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
  actor(w).position = { x: 16.7, y: 11.7 };
  w = step(w, {
    ivo: {
      interface: 'gather',
      args: { target: 'start-1-berries', quantity: 3 },
    },
  }).world;
  if (roots)
    w = step(w, {
      ivo: {
        interface: 'gather',
        args: { target: 'commons-root-5-0', quantity: roots },
      },
    }).world;
  const stack = (resource: string) => {
    const s = w.stacks.find(
      (s) => s.owner === 'ivo' && s.resource === resource,
    );
    if (!s) throw new Error('Missing actually gathered fixture food.');
    return s.id;
  };
  const berry = stack('berry');
  const root = roots ? stack('root') : '';
  if (study) {
    w = step(w, { ivo: { interface: 'learn', args: { ability: id } } }).world;
    for (let i = 0; i < 3 && !actor(w).mastered.includes(id); i++)
      w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  }
  const start = (quantity = 3, itemId = berry): V7Action => ({
    interface: id,
    args: { mode: 'start', inputs: [{ itemId, quantity }] },
  });
  return { w, berry, root, start };
}

describe('cold food preparation in ex15', () => {
  it('requires one round of personal study before use', () => {
    const f = setup(0, false);
    expect(f.w.abilities.find((a) => a.id === id)?.learning).toBe(1);
    const early = step(f.w, { ivo: f.start() });
    expect(early.outcomes.ivo?.success).toBe(false);
    expect(early.outcomes.ivo?.reason).toMatch(/not mastered/);
    expect(early.world.stacks).toEqual(step(f.w).world.stacks);
    let w = step(f.w, {
      ivo: { interface: 'learn', args: { ability: id } },
    }).world;
    if (!actor(w).mastered.includes(id)) w = step(w).world;
    expect(actor(w).mastered).toContain(id);
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
  });

  it('takes three paid rounds and 3 energy for three units and conserves the food', () => {
    const f = setup();
    const before = berries(f.w);
    const load = v7Load(f.w, actor(f.w));
    const e0 = actor(f.w).vitals.energy;
    const first = step(f.w, { ivo: f.start() });
    expect(first.outcomes.ivo?.success).toBe(true);
    expect(first.outcomes.ivo?.complete).toBe(false);
    const started = events(first.world, 'food-preparation-started')[0];
    expect(started?.actor).toBe('ivo');
    expect(started?.data.workId).toBe(job(first.world)?.id);
    expect(started?.data.inputs).toMatchObject([
      { itemId: f.berry, quantity: 3, resource: 'berry' },
    ]);
    expect(events(first.world, 'food-preparation-progress')).toHaveLength(1);
    // The selected food is reserved, still carried and still counted.
    expect(
      first.world.stacks.filter((s) => s.reservedFor === job(first.world)?.id),
    ).toHaveLength(1);
    expect(berries(first.world)).toBe(before);
    expect(v7Load(first.world, actor(first.world))).toBeCloseTo(load, 8);
    let w = first.world;
    // The kernel continues the same bound request in the next rounds.
    w = step(w, { ivo: f.start() }).world;
    expect(prepared(w)).toBeUndefined();
    expect(events(w, 'food-preparation-paused')).toHaveLength(0);
    expect(events(w, 'food-preparation-progress')).toHaveLength(1);
    const last = step(w, { ivo: f.start() });
    w = last.world;
    expect(last.outcomes.ivo?.complete).toBe(true);
    const done = events(w, 'food-preparation-completed')[0];
    const meal = prepared(w);
    expect(done?.target).toBe(meal?.id);
    expect(done?.data.nominalNutrition).toBe(24);
    expect(done?.data.toxicity).toBe(0);
    expect(done?.data.completedRounds).toBe(3);
    expect(done?.data.paidEnergy).toBe(3);
    expect(job(w)?.status).toBe('completed');
    // Three rounds of wait-equivalent physiology plus exactly 3 energy of work.
    const waited = (() => {
      let x = f.w;
      for (let i = 0; i < 3; i++) x = step(x).world;
      return actor(x).vitals.energy;
    })();
    expect(e0 - actor(w).vitals.energy - (e0 - waited)).toBeCloseTo(3, 6);
    expect(meal).toMatchObject({
      resource: 'berry',
      quantity: 3,
      quantityTenths: 30,
      owner: 'ivo',
      processing: {
        preparedFood: { mode: 'cold-combined', ingredient: 'berry' },
      },
    });
    expect(meal?.componentLots).toHaveLength(1);
    expect(meal?.componentLots?.[0]?.origin).toBe('start-1-berries');
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(berries(w)).toBe(before);
    expect(v7Load(w, actor(w))).toBeCloseTo(load, 8);
    // No milestone or other reward for producing food.
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(JSON.stringify(actor(w).wellbeing.sources)).not.toContain(id);
    expect(actor(w).experience?.mental).toBe(actor(f.w).experience?.mental);
  });

  it('eats exactly as the raw food through eat, with the satiety cap and no extra benefit', () => {
    const f = setup();
    let w = f.w;
    for (let i = 0; i < 3; i++) w = step(w, { ivo: f.start() }).world;
    const meal = prepared(w);
    if (!meal) throw new Error('Missing prepared food.');
    const decay = meal.decay ?? 0;
    expect(decay).toBeGreaterThan(0);
    // Ageing continues under the existing rules without a shelf-life reset.
    w = step(w).world;
    expect(prepared(w)?.decay).toBeGreaterThan(decay);
    actor(w).vitals.satiety = 50;
    const energy = actor(w).vitals.energy;
    const ate = step(w, {
      ivo: { interface: 'eat', args: { target: meal.id, quantity: 1 } },
    }).world;
    const event = events(ate, 'ate')[0];
    expect(event?.data).toMatchObject({ resource: 'berry', nutrition: 8 });
    expect(actor(ate).vitals.satiety).toBeGreaterThan(50 + 8 - 1);
    expect(actor(ate).vitals.energy).toBeLessThan(energy);
    const left = prepared(ate);
    expect(left?.quantity).toBe(2);
    expect(
      left?.componentLots?.reduce((n, l) => n + (l.quantityTenths ?? 0), 0),
    ).toBe(20);
    // The meal record is the same as eating raw berries: one food, unprocessed.
    const record = actor(ate).experience?.meals.at(-1);
    expect(record?.methods).toEqual(['unprocessed']);
    expect(Object.keys(record?.composition ?? {})).toEqual(['berry']);
    // Near-full satiety caps usable nourishment as for any food.
    const full = v7Clone(ate);
    actor(full).vitals.satiety = 92.4;
    const capped = step(full, {
      ivo: { interface: 'eat', args: { target: meal.id, quantity: 2 } },
    }).world;
    expect(actor(capped).vitals.satiety).toBeLessThanOrEqual(100);
    expect(Number(events(capped, 'ate')[0]?.data.realized)).toBeLessThan(16);
    expect(prepared(capped)).toBeUndefined();
  });

  it('pauses when not worked, resumes after revalidation and pauses without spending on low energy', () => {
    const f = setup();
    let w = step(f.w, { ivo: f.start() }).world;
    const paused = step(w);
    expect(events(paused.world, 'food-preparation-paused')).toHaveLength(1);
    expect(job(paused.world)?.status).toBe('paused');
    w = paused.world;
    // Elapsed time without participation brings no progress.
    w = step(w).world;
    const resumed = step(w, {
      ivo: { interface: id, args: { mode: 'resume' } },
    });
    expect(events(resumed.world, 'food-preparation-resumed')).toHaveLength(1);
    expect(
      events(resumed.world, 'food-preparation-progress')[0]?.data,
    ).toMatchObject({
      workedQuantity: 2,
      remaining: 1,
    });
    w = resumed.world;
    w = step(w).world;
    actor(w).vitals.energy = 0.5;
    const low = step(w, { ivo: { interface: id, args: { mode: 'resume' } } });
    expect(events(low.world, 'food-preparation-paused')[0]?.data).toMatchObject(
      {
        requiredEnergy: 1,
        workedQuantity: 2,
      },
    );
    expect(actor(low.world).vitals.energy).toBeGreaterThanOrEqual(0.5);
    expect(prepared(low.world)).toBeUndefined();
  });

  it('cancels by returning the actual remaining food in its current condition', () => {
    const f = setup();
    const before = berries(f.w);
    let w = step(f.w, { ivo: f.start() }).world;
    w = step(w).world;
    const reservedDecay = w.stacks.find((s) => s.reservedFor)?.decay ?? 0;
    const energy = actor(w).vitals.energy;
    const cancelled = step(w, {
      ivo: { interface: id, args: { mode: 'cancel' } },
    });
    expect(cancelled.outcomes.ivo?.success).toBe(true);
    const event = events(cancelled.world, 'food-preparation-cancelled')[0];
    expect(event?.data.returned).toHaveLength(1);
    expect(job(cancelled.world)?.status).toBe('stopped');
    expect(cancelled.world.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(prepared(cancelled.world)).toBeUndefined();
    expect(berries(cancelled.world)).toBe(before);
    const back = cancelled.world.stacks.find(
      (s) => s.id === job(cancelled.world)?.escrow[0],
    );
    expect(back?.owner).toBe('ivo');
    expect(back?.decay ?? 0).toBeGreaterThanOrEqual(reservedDecay);
    // Spent energy is not refunded.
    expect(actor(cancelled.world).vitals.energy).toBeLessThanOrEqual(energy);
  });

  it('rejects unknown, mixed, insufficient-energy and foreign inputs without spending anything', () => {
    const f = setup(1);
    // A rejected attempt leaves the world exactly as an idle round would.
    const unchanged = (
      action: V7Action,
      reason: RegExp,
      w = f.w,
      who = 'ivo',
    ) => {
      const r = step(w, { [who]: action }),
        idle = step(w).world;
      expect(r.outcomes[who]?.success).toBe(false);
      expect(r.outcomes[who]?.reason).toMatch(reason);
      expect(r.world.stacks).toEqual(idle.stacks);
      expect(actor(r.world, who).vitals).toEqual(actor(idle, who).vitals);
      expect(job(r.world)).toBeUndefined();
      return r;
    };
    // Ivo knows roots, but roots and berries cannot be combined in this version.
    unchanged(
      {
        interface: id,
        args: {
          mode: 'start',
          inputs: [
            { itemId: f.berry, quantity: 1 },
            { itemId: f.root, quantity: 1 },
          ],
        },
      },
      /one food at a time/,
    );
    // A food without the person's own edible, nontoxic record.
    const unknown = v7Clone(f.w);
    unknown.stacks.push({
      id: 'fixture-mushroom',
      resource: 'mushroom',
      quantity: 1,
      quantityTenths: 10,
      position: { ...actor(unknown).position },
      owner: 'ivo',
      origin: 'fixture',
      harvestedAt: unknown.tick,
      decay: 0,
    });
    unchanged(f.start(1, 'fixture-mushroom'), /own record/, unknown);
    // More than the owned quantity, and someone else's food.
    unchanged(f.start(4), /quantity/);
    const other = v7Clone(f.w);
    actor(other, 'kai').mastered.push(id);
    actor(other, 'kai').position = { ...actor(other).position, x: 17.3 };
    unchanged(f.start(1), /ownership|personally observed/, other, 'kai');
    // Too little energy for the first increment reserves nothing.
    const tired = v7Clone(f.w);
    actor(tired).vitals.energy = 0.4;
    unchanged(f.start(), /first work increment/, tired);
  });

  it('lets only the performer resume or cancel, and fails on a spoiled reserved ingredient', () => {
    const f = setup();
    let w = step(f.w, {
      ivo: {
        interface: id,
        args: {
          mode: 'start',
          inputs: [{ itemId: f.berry, quantity: 2 }],
        },
      },
    }).world;
    const process = job(w)?.id ?? '';
    const other = v7Clone(w);
    actor(other, 'kai').mastered.push(id);
    for (const mode of ['resume', 'cancel'])
      expect(
        step(other, {
          kai: { interface: id, args: { mode, processId: process } },
        }).outcomes.kai?.success,
      ).toBe(false);
    // Spoil the reserved portion under the existing decay rule.
    const part = w.stacks.find((s) => s.reservedFor === process);
    if (!part) throw new Error('Missing reserved food.');
    part.decay = 99.999;
    w = step(w).world;
    expect(w.stacks.some((s) => s.reservedFor === process)).toBe(false);
    const failed = step(w, {
      ivo: { interface: id, args: { mode: 'resume' } },
    });
    expect(events(failed.world, 'food-preparation-failed')).toHaveLength(1);
    expect(job(failed.world)?.status).toBe('stopped');
    expect(prepared(failed.world)).toBeUndefined();
  });

  it('stops at death and leaves the unfinished food on the ground once', () => {
    const f = setup();
    const w = step(f.w, { ivo: f.start() }).world;
    const before = berries(w);
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    const dead = v7Clone(w);
    pkg?.onDeath?.(dead, actor(dead));
    expect(job(dead)?.status).toBe('stopped');
    expect(events(dead, 'food-preparation-failed')).toHaveLength(1);
    const dropped = dead.stacks.find((s) => s.id === job(dead)?.escrow[0]);
    expect(dropped).toMatchObject({ owner: null, quantity: 3 });
    expect(dropped?.reservedFor).toBeUndefined();
    expect(berries(dead)).toBe(before - 30);
    expect(prepared(dead)).toBeUndefined();
  });
});
