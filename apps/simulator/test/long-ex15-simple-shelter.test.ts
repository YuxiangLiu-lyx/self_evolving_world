import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  forestClimate,
  simpleShelterExposure,
  v7Clone,
  v7Install,
  v7Load,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Object,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';

const id = 'simple-shelter';
const WAIT: V7Action = { interface: 'wait', args: {} };
const SITE = { x: 19.5, y: 15 };
const RECIPE = { branch: 13, vine: 4, bark: 6 };
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
const events = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === type);
const shelter = (w: V7World): V7Object | undefined =>
  w.objects.find((o) => o.kind === id);
const parts = (o?: V7Object) =>
  (Array.isArray(o?.data.components) ? o.data.components : []) as {
    resource: string;
    quantity: number;
    increment: number;
    condition: number;
  }[];
/** Every unit in the world: on the ground, carried, reserved or installed. */
const units = (w: V7World, resource: string) =>
  w.stacks
    .filter((s) => s.resource === resource)
    .reduce((n, s) => n + s.quantity, 0) +
  w.objects
    .flatMap((o) => (o.kind === id ? parts(o) : []))
    .filter((p) => p.resource === resource)
    .reduce((n, p) => n + p.quantity, 0);
const job = (w: V7World) =>
  Object.entries(w.state).find(
    ([k, v]) =>
      k.startsWith('collective:work:') &&
      (v as { ability?: string }).ability === id,
  )?.[1] as { id: string; status: string; completedWork: number } | undefined;

function genesis() {
  const g = initialLongWorld('long-ex15', 'long-culture');
  const prepared = v7Install(g, continuousRegistry(g), 'food-preparation@1');
  return v7Clone(v7Install(prepared, continuousRegistry(prepared), `${id}@1`));
}
/** Lin gathers the real recipe from nearby sources (energy is topped up between gathers), then studies. */
function supplied(study = true) {
  let w = genesis();
  for (const [target, quantity, x, y] of [
    ['forest-branch-0', 9, 17.2, 12.6],
    ['start-2-branches', 4, 16.5, 19.7],
    ['forest-vine-1', 4, 8.2, 12.6],
    ['forest-bark-2', 6, 12.2, 20.6],
  ] as const) {
    actor(w).position = { x, y };
    actor(w).vitals.energy = 40;
    const r = step(w, {
      lin: { interface: 'gather', args: { target, quantity } },
    });
    expect(r.outcomes.lin?.success).toBe(true);
    w = r.world;
  }
  if (study) {
    w = step(w, { lin: { interface: 'learn', args: { ability: id } } }).world;
    for (let i = 0; i < 3; i++) w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  }
  actor(w).position = { x: 19.5, y: 13.6 };
  actor(w).vitals.energy = 40;
  const materials = w.stacks
    .filter((s) => s.owner === 'lin' && s.resource in RECIPE)
    .map((s) => ({ itemId: s.id, quantity: s.quantity }));
  const start = (args: Record<string, unknown> = {}): V7Action => ({
    interface: id,
    args: { mode: 'start', ...SITE, orientation: 0, materials, ...args },
  });
  return { w, materials, start };
}
/** A commissioned shelter after twelve paid rounds. */
function built() {
  const f = supplied();
  let w = f.w;
  for (let i = 0; i < 12; i++) w = step(w, { lin: f.start() }).world;
  expect(shelter(w)?.data.status).toBe('commissioned');
  return { ...f, w };
}
/** The first later round whose real weather lies within the light-weather limits. */
function calm(w: V7World) {
  for (let i = 0; i < 200; i++) {
    const c = forestClimate(w, SITE);
    if ((c.rain ?? 0) <= 0.8 && (c.wind ?? 0) <= 0.8 && (c.wind ?? 0) > 0.2)
      return w;
    w = step(w).world;
  }
  throw new Error('No light weather found.');
}

describe('simple shelter in ex15', () => {
  it('is scoped to ex15 and needs four rounds of personal study', () => {
    const other = initialLongWorld('long-ex14', 'long');
    expect(() =>
      v7Install(other, continuousRegistry(other), `${id}@1`),
    ).toThrow();
    const f = supplied(false);
    expect(f.w.abilities.find((a) => a.id === id)?.learning).toBe(4);
    const early = step(f.w, { lin: f.start() });
    expect(early.outcomes.lin?.reason).toMatch(/not mastered/);
    expect(early.world.stacks).toEqual(step(f.w).world.stacks);
    let w = step(f.w, {
      lin: { interface: 'learn', args: { ability: id } },
    }).world;
    for (let i = 0; i < 2; i++) w = step(w).world;
    expect(actor(w).mastered).not.toContain(id);
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  });

  it('builds in twelve paid rounds and 12 energy, installing and conserving the real materials', () => {
    const f = supplied();
    const before = Object.fromEntries(
      Object.keys(RECIPE).map((r) => [r, units(f.w, r)]),
    );
    const load = v7Load(f.w, actor(f.w));
    const e0 = actor(f.w).vitals.energy;
    const first = step(f.w, { lin: f.start() });
    expect(first.outcomes.lin?.complete).toBe(false);
    const started = events(first.world, 'simple-shelter-started')[0];
    expect(started?.target).toBe(shelter(first.world)?.id);
    expect(started?.data.siteCheck).toMatch(/ordinary dry soil/);
    expect(events(first.world, 'simple-shelter-progress')).toHaveLength(1);
    // The first increment installs one forked post; the rest stays reserved and carried.
    expect(parts(shelter(first.world))).toMatchObject([
      { resource: 'branch', quantity: 1, increment: 1, role: 'forked post' },
    ]);
    expect(
      first.world.stacks
        .filter((s) => s.reservedFor === job(first.world)?.id)
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(22);
    let w = first.world;
    const stages: string[] = [];
    for (let i = 1; i < 12; i++) {
      const r = step(w, { lin: f.start() });
      w = r.world;
      const progress = events(w, 'simple-shelter-progress')[0];
      if (typeof progress?.data.nextStage === 'string')
        stages.push(progress.data.nextStage);
      if (i === 7) {
        // A bare frame has no roof and gives no protection.
        expect(shelter(w)?.data.roofCoverage).toBe(0);
        expect(shelter(w)?.data.status).toBe('unfinished');
      }
      if (i === 11) expect(r.outcomes.lin?.complete).toBe(true);
    }
    expect(stages).toContain('roofing');
    const done = events(w, 'simple-shelter-commissioned')[0];
    const o = shelter(w);
    expect(done?.target).toBe(o?.id);
    expect(done?.data.limits).toMatchObject({
      rain: 0.8,
      wind: 0.8,
      rainShield: 0.5,
      windShield: 0.35,
    });
    // Roof load: six ribs (1.1 each) and six bark units (0.3 each).
    expect(done?.data.supportedLoad).toBeCloseTo(8.4, 8);
    expect(o?.data.roofCoverage).toBe(1);
    expect(job(w)?.status).toBe('completed');
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    for (const [r, n] of Object.entries(RECIPE)) {
      expect(
        parts(o)
          .filter((p) => p.resource === r)
          .reduce((x, p) => x + p.quantity, 0),
      ).toBe(n);
      expect(units(w, r)).toBe(before[r]);
    }
    // Installed parts are no longer carried: the load fell by the recipe mass.
    expect(load - v7Load(w, actor(w))).toBeCloseTo(
      13 * 1.1 + 4 * 0.5 + 6 * 0.3,
      6,
    );
    const waited = (() => {
      let x = f.w;
      for (let i = 0; i < 12; i++) x = step(x).world;
      return actor(x).vitals.energy;
    })();
    expect(e0 - actor(w).vitals.energy - (e0 - waited)).toBeCloseTo(12, 6);
    // No milestone or other reward for finishing a structure.
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(JSON.stringify(actor(w).wellbeing.sources)).not.toContain(id);
  });

  it('shields one occupant from part of the real rain and wind chill without changing air temperature', () => {
    const f = built();
    const w = calm(f.w);
    actor(w).position = { ...SITE };
    const plain = v7Clone(w);
    const o = shelter(plain);
    if (!o) throw new Error('Missing shelter.');
    o.data.status = 'unverified';
    const m = simpleShelterExposure(w, actor(w));
    expect(m?.withheld).toBeNull();
    expect(m?.facing).toBe(1);
    expect(m?.rainShield).toBeLessThanOrEqual(0.5);
    expect(m?.windShield).toBeLessThanOrEqual(0.35);
    expect(m?.windShield).toBeCloseTo(0.35 * (m?.roofCondition ?? 0), 6);
    expect(m?.avoidedChill).toBeGreaterThan(0);
    expect(m?.avoidedChill).toBeLessThan(m?.outdoorChill ?? 0);
    expect(simpleShelterExposure(plain, actor(plain))).toBeNull();
    const sheltered = step(w).world,
      exposed = step(plain).world;
    const event = events(sheltered, 'simple-shelter-exposure-measured')[0];
    expect(event?.actor).toBe('lin');
    // The next round's own weather and wear are measured, not the earlier reading.
    const avoided = Number(event?.data.avoidedChill);
    expect(avoided).toBeGreaterThan(0);
    expect(event?.data.windShield).toBeLessThanOrEqual(0.35);
    expect(events(exposed, 'simple-shelter-exposure-measured')).toHaveLength(0);
    const warmer =
      actor(sheltered).vitals.temperature - actor(exposed).vitals.temperature;
    expect(warmer).toBeGreaterThan(0);
    expect(warmer).toBeCloseTo(0.035 * avoided, 6);
    expect(forestClimate(sheltered, SITE).temperature).toBe(
      forestClimate(exposed, SITE).temperature,
    );
    expect(actor(sheltered).vitals.satiety).toBe(actor(exposed).vitals.satiety);
    expect(actor(sheltered).vitals.energy).toBe(actor(exposed).vitals.energy);
    // Wind entering the open side gives no wind protection.
    const turned = v7Clone(w);
    const t = shelter(turned);
    if (t) t.spatial.angle = Math.PI;
    expect(simpleShelterExposure(turned, actor(turned))?.windShield).toBe(0);
    // A second person on the single-person floor: nobody is protected.
    const crowded = v7Clone(w);
    actor(crowded, 'sol').position = { x: SITE.x, y: SITE.y + 0.6 };
    expect(simpleShelterExposure(crowded, actor(crowded))).toMatchObject({
      occupants: 2,
      avoidedChill: 0,
    });
    // Off the covered floor nothing changes.
    const outside = v7Clone(w);
    actor(outside).position = { x: SITE.x - 0.8, y: SITE.y };
    expect(simpleShelterExposure(outside, actor(outside))).toBeNull();
  });

  it('withholds protection in real weather beyond the light-weather limits', () => {
    const w = v7Clone(built().w);
    actor(w).position = { ...SITE };
    // The real wind at commissioning exceeds 0.8.
    expect(forestClimate(w, SITE).wind).toBeGreaterThan(0.8);
    expect(simpleShelterExposure(w, actor(w))).toMatchObject({
      withheld: 'weather beyond the light-weather limits',
      avoidedChill: 0,
    });
  });

  it('pauses when not worked, resumes after revalidation and pauses without spending on low energy or out of reach', () => {
    const f = supplied();
    let w = step(f.w, { lin: f.start() }).world;
    const paused = step(w);
    expect(events(paused.world, 'simple-shelter-paused')).toHaveLength(1);
    expect(job(paused.world)?.status).toBe('paused');
    w = step(paused.world).world;
    const resumed = step(w, {
      lin: { interface: id, args: { mode: 'resume' } },
    });
    expect(events(resumed.world, 'simple-shelter-resumed')).toHaveLength(1);
    expect(job(resumed.world)?.completedWork).toBe(2);
    w = resumed.world;
    const low = v7Clone(w);
    actor(low).vitals.energy = 0.5;
    const tired = step(low, {
      lin: { interface: id, args: { mode: 'resume' } },
    });
    expect(events(tired.world, 'simple-shelter-paused')[0]?.data).toMatchObject(
      { requiredEnergy: 1, completedIncrements: 2 },
    );
    expect(actor(tired.world).vitals.energy).toBeGreaterThanOrEqual(0.5);
    expect(parts(shelter(tired.world))).toHaveLength(2);
    const away = v7Clone(w);
    actor(away).position = { x: 22.5, y: 15 };
    const far = step(away, {
      lin: { interface: id, args: { mode: 'resume' } },
    });
    expect(events(far.world, 'simple-shelter-paused')[0]?.description).toMatch(
      /beyond working reach/,
    );
    expect(job(far.world)?.completedWork).toBe(2);
  });

  it('cancels once, returning only uninstalled materials and leaving an unfinished frame', () => {
    const f = supplied();
    let w = f.w;
    for (let i = 0; i < 3; i++) w = step(w, { lin: f.start() }).world;
    const before = units(w, 'branch');
    const cancelled = step(w, {
      lin: { interface: id, args: { mode: 'cancel' } },
    });
    w = cancelled.world;
    expect(cancelled.outcomes.lin?.success).toBe(true);
    expect(events(w, 'simple-shelter-cancelled')).toHaveLength(1);
    expect(job(w)?.status).toBe('stopped');
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    const owned = (r: string) =>
      w.stacks
        .filter((s) => s.owner === 'lin' && s.resource === r)
        .reduce((n, s) => n + s.quantity, 0);
    expect([owned('branch'), owned('vine'), owned('bark')]).toEqual([10, 4, 6]);
    expect(parts(shelter(w))).toHaveLength(3);
    expect(shelter(w)?.data.status).toBe('unfinished');
    expect(units(w, 'branch')).toBe(before);
    actor(w).position = { ...SITE };
    expect(simpleShelterExposure(w, actor(w))).toBeNull();
    const again = step(w, { lin: { interface: id, args: { mode: 'cancel' } } });
    expect(again.outcomes.lin?.success).toBe(false);
  });

  it('rejects wrong recipes, unsuitable sites, foreign materials and low energy without spending anything', () => {
    const f = supplied();
    const unchanged = (
      action: V7Action,
      reason: RegExp,
      w = f.w,
      who = 'lin',
    ) => {
      const r = step(w, { [who]: action }),
        idle = step(w).world;
      expect(r.outcomes[who]?.success).toBe(false);
      expect(r.outcomes[who]?.reason).toMatch(reason);
      expect(r.world.stacks).toEqual(idle.stacks);
      expect(actor(r.world, who).vitals).toEqual(actor(idle, who).vitals);
      expect(shelter(r.world)).toBeUndefined();
      expect(job(r.world)).toBeUndefined();
    };
    const short = f.materials.map((m) =>
      m.quantity === 9 ? { ...m, quantity: 8 } : m,
    );
    unchanged(f.start({ materials: short }), /Exact owned whole units/);
    // The wet river bank is not ordinary soil.
    const bank = v7Clone(f.w);
    actor(bank).position = { x: 23.5, y: 13.6 };
    unchanged(f.start({ x: 23.5 }), /not ordinary soil/, bank);
    unchanged(f.start({ x: 25.5 }), /beyond working reach/);
    const crowded = v7Clone(f.w);
    actor(crowded, 'kai').position = { ...SITE };
    unchanged(f.start(), /person occupies/, crowded);
    const other = v7Clone(f.w);
    actor(other, 'kai').mastered.push(id);
    actor(other, 'kai').position = { x: 19.5, y: 16.4 };
    unchanged(f.start(), /owned|ownership|observ/i, other, 'kai');
    const tired = v7Clone(f.w);
    actor(tired).vitals.energy = 0.5;
    unchanged(f.start(), /first work increment/, tired);
  });

  it('lets only the builder resume, cancel, repair or dismantle', () => {
    const f = supplied();
    const w = step(f.w, { lin: f.start() }).world;
    const other = v7Clone(w);
    actor(other, 'kai').mastered.push(id);
    actor(other, 'kai').position = { x: 19.5, y: 16.4 };
    const process = job(w)?.id ?? '';
    for (const mode of ['resume', 'cancel'])
      expect(
        step(other, {
          kai: { interface: id, args: { mode, processId: process } },
        }).outcomes.kai?.success,
      ).toBe(false);
    const done = built().w;
    actor(done, 'kai').mastered.push(id);
    actor(done, 'kai').position = { x: 19.5, y: 16.4 };
    const target = shelter(done)?.id ?? '';
    for (const args of [
      { mode: 'dismantle', target },
      { mode: 'repair', target, increment: 1, materials: [] },
    ]) {
      const r = step(done, { kai: { interface: id, args } });
      expect(r.outcomes.kai?.reason).toMatch(/Only the person who built/);
      expect(parts(shelter(r.world))).toHaveLength(parts(shelter(done)).length);
    }
    // Anyone who studied may inspect: it changes nothing and costs 0.2 energy.
    const inspected = step(done, {
      kai: { interface: id, args: { mode: 'inspect', target } },
    });
    expect(inspected.outcomes.kai?.success).toBe(true);
    expect(
      events(inspected.world, 'simple-shelter-inspected')[0]?.data.status,
    ).toBe('commissioned');
    expect(
      actor(step(done).world, 'kai').vitals.energy -
        actor(inspected.world, 'kai').vitals.energy,
    ).toBeCloseTo(0.2, 6);
  });

  it('loses protection when wear loosens a part, and regains it only after exact repair and reinspection', () => {
    let w = v7Clone(built().w);
    const o = shelter(w);
    if (!o) throw new Error('Missing shelter.');
    for (const p of parts(o)) if (p.increment === 4) p.condition = 0.5001;
    w = step(w).world;
    expect(events(w, 'simple-shelter-damaged')).toHaveLength(1);
    expect(shelter(w)?.data.status).toBe('unsafe');
    const inside = v7Clone(w);
    actor(inside).position = { ...SITE };
    expect(simpleShelterExposure(inside, actor(inside))).toBeNull();
    // Gather two real replacement branches, then repair increment 4 (two braces).
    actor(w).position = { x: 16.5, y: 19.7 };
    w = step(w, {
      lin: {
        interface: 'gather',
        args: { target: 'start-2-branches', quantity: 2 },
      },
    }).world;
    const fresh = w.stacks.find(
      (s) =>
        s.owner === 'lin' &&
        s.resource === 'branch' &&
        s.quantity === 2 &&
        !s.processing,
    );
    if (!fresh) throw new Error('Missing gathered replacement branches.');
    actor(w).position = { x: 19.5, y: 13.6 };
    actor(w).vitals.energy = 20;
    const target = shelter(w)?.id ?? '';
    const before = units(w, 'branch');
    const r = step(w, {
      lin: {
        interface: id,
        args: {
          mode: 'repair',
          target,
          increment: 4,
          materials: [{ itemId: fresh.id, quantity: 2 }],
        },
      },
    });
    expect(r.outcomes.lin?.success).toBe(true);
    w = r.world;
    const event = events(w, 'simple-shelter-repaired')[0];
    expect(event?.data.before).toBeLessThan(0.5);
    expect(event?.data.after).toBe(1);
    const removed = w.stacks.filter((s) => s.processing?.simpleShelterPart);
    expect(removed.map((s) => s.quantity)).toEqual([2]);
    expect(removed[0]?.owner).toBeNull();
    expect(units(w, 'branch')).toBe(before);
    // Repair alone does not restore protection.
    expect(shelter(w)?.data.status).toBe('unsafe');
    const inspected = step(w, {
      lin: { interface: id, args: { mode: 'inspect', target } },
    }).world;
    expect(
      events(inspected, 'simple-shelter-commissioned')[0]?.data.again,
    ).toBe(true);
    expect(shelter(inspected)?.data.status).toBe('commissioned');
  });

  it('dismantles one stage per round and 1 energy, returning every part to the ground', () => {
    let w = built().w;
    const target = shelter(w)?.id ?? '';
    const before = Object.fromEntries(
      Object.keys(RECIPE).map((r) => [r, units(w, r)]),
    );
    const stages: string[] = [];
    for (let i = 0; i < 4; i++) {
      const idle = actor(step(w).world).vitals.energy;
      w = step(w, {
        lin: { interface: id, args: { mode: 'dismantle', target } },
      }).world;
      const stage = events(w, 'simple-shelter-dismantled')[0]?.data.stage;
      stages.push(typeof stage === 'string' ? stage : '');
      expect(idle - actor(w).vitals.energy).toBeCloseTo(1, 6);
    }
    expect(stages).toEqual([
      'roofing',
      'ribs-and-binding',
      'ridge-and-braces',
      'posts',
    ]);
    expect(shelter(w)).toBeUndefined();
    const ground = w.stacks.filter((s) => s.processing?.simpleShelterPart);
    expect(ground.every((s) => s.owner === null)).toBe(true);
    for (const [r, n] of Object.entries(RECIPE)) {
      expect(
        ground
          .filter((s) => s.resource === r)
          .reduce((x, s) => x + s.quantity, 0),
      ).toBe(n);
      expect(units(w, r)).toBe(before[r]);
    }
  });

  it('stops at death, leaving installed parts and dropping uninstalled materials where the person died', () => {
    const f = supplied();
    let w = f.w;
    for (let i = 0; i < 2; i++) w = step(w, { lin: f.start() }).world;
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    const dead = v7Clone(w);
    pkg?.onDeath?.(dead, actor(dead));
    expect(job(dead)?.status).toBe('stopped');
    expect(events(dead, 'simple-shelter-failed')).toHaveLength(1);
    const dropped = dead.stacks.filter(
      (s) =>
        s.owner === null &&
        s.resource in RECIPE &&
        s.position.x === actor(dead).position.x &&
        s.position.y === actor(dead).position.y,
    );
    expect(dropped.reduce((n, s) => n + s.quantity, 0)).toBe(21);
    expect(dead.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(parts(shelter(dead))).toHaveLength(2);
    expect(shelter(dead)?.data.workId).toBeNull();
  });
});
