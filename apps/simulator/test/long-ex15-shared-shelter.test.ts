import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  forestClimate,
  sharedShelterExposure,
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

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 30_000 });

const id = 'shared-shelter';
const KIND = 'shared-shelter-bay';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** Centre of the two-bay footprint (x 19-21, y 12.5-16.5); the shared open side faces -x. */
const SITE = { x: 20, y: 14.5 };
/** Covered-floor centres of bay 1 and bay 2. */
const FLOOR = [
  { x: 20, y: 13.5 },
  { x: 20, y: 15.5 },
] as const;
const STAND = { x: 18.6, y: 14.5 };
const RECIPE = { branch: 26, vine: 8, bark: 12 };
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
const bays = (w: V7World): V7Object[] =>
  w.objects
    .filter((o) => o.kind === KIND)
    .sort((a, b) => Number(a.data.bay) - Number(b.data.bay));
const bay = (w: V7World, i: number): V7Object => {
  const o = bays(w).find((o) => o.data.bay === i);
  if (!o) throw new Error(`Missing bay ${String(i)}.`);
  return o;
};
const parts = (o?: V7Object) =>
  (Array.isArray(o?.data.components) ? o.data.components : []) as {
    resource: string;
    quantity: number;
    increment: number;
    condition: number;
  }[];
const count = (o: V7Object | undefined, resource: string) =>
  parts(o)
    .filter((p) => p.resource === resource)
    .reduce((n, p) => n + p.quantity, 0);
/** Every unit in the world: on the ground, carried, reserved or installed in any shelter. */
const units = (w: V7World, resource: string) =>
  w.stacks
    .filter((s) => s.resource === resource)
    .reduce((n, s) => n + s.quantity, 0) +
  w.objects.reduce((n, o) => n + count(o, resource), 0);
const job = (w: V7World) =>
  Object.entries(w.state).find(
    ([k, v]) =>
      k.startsWith('collective:work:') &&
      (v as { ability?: string }).ability === id,
  )?.[1] as { id: string; status: string; completedWork: number } | undefined;
const owned = (w: V7World, r: string, who = 'sol') =>
  w.stacks
    .filter((s) => s.owner === who && s.resource === r && !s.reservedFor)
    .reduce((n, s) => n + s.quantity, 0);

function genesis() {
  let g = initialLongWorld('long-ex15', 'long-culture');
  for (const key of ['food-preparation@1', 'simple-shelter@1', `${id}@1`])
    g = v7Install(g, continuousRegistry(g), key);
  return v7Clone(g);
}
/** Sol gathers the real two-bay recipe from nearby sources (energy is topped up between gathers), then studies. */
function supplied(study = true) {
  let w = genesis();
  for (const [target, quantity, x, y] of [
    ['forest-branch-0', 9, 17.2, 12.6],
    ['start-2-branches', 9, 16.5, 19.7],
    ['start-1-branches', 8, 20.5, 11.1],
    ['forest-vine-1', 8, 8.2, 12.6],
    ['forest-bark-2', 11, 12.2, 20.6],
    ['forest-bark-0', 1, 31.2, 22.6],
  ] as const) {
    actor(w).position = { x, y };
    actor(w).vitals.energy = 40;
    const r = step(w, {
      sol: { interface: 'gather', args: { target, quantity } },
    });
    expect(r.outcomes.sol?.success).toBe(true);
    w = r.world;
  }
  if (study) {
    w = step(w, { sol: { interface: 'learn', args: { ability: id } } }).world;
    for (let i = 0; i < 3; i++) w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  }
  actor(w).position = { ...STAND };
  actor(w).vitals.energy = 40;
  const materials = w.stacks
    .filter((s) => s.owner === 'sol' && s.resource in RECIPE)
    .map((s) => ({ itemId: s.id, quantity: s.quantity }));
  const start = (args: Record<string, unknown> = {}): V7Action => ({
    interface: id,
    args: {
      mode: 'start',
      ...SITE,
      orientation: 0,
      bays: 2,
      materials,
      ...args,
    },
  });
  return { w, materials, start };
}
/** Both bays commissioned after twenty-four paid rounds. */
function built() {
  const f = supplied();
  let w = f.w;
  for (let i = 0; i < 24; i++) w = step(w, { sol: f.start() }).world;
  expect(bays(w).map((o) => o.data.status)).toEqual([
    'commissioned',
    'commissioned',
  ]);
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

describe('shared multi-bay shelter in ex15', () => {
  it('is scoped to ex15, builds on simple-shelter@1 and needs four rounds of personal study', () => {
    const other = initialLongWorld('long-ex14', 'long');
    expect(() =>
      v7Install(other, continuousRegistry(other), `${id}@1`),
    ).toThrow();
    const bare = initialLongWorld('long-ex15', 'long-culture');
    expect(() => v7Install(bare, continuousRegistry(bare), `${id}@1`)).toThrow(
      /dependency/,
    );
    const f = supplied(false);
    expect(f.w.abilities.find((a) => a.id === id)?.learning).toBe(4);
    const early = step(f.w, { sol: f.start() });
    expect(early.outcomes.sol?.reason).toMatch(/not mastered/);
    expect(early.world.stacks).toEqual(step(f.w).world.stacks);
    let w = step(f.w, {
      sol: { interface: 'learn', args: { ability: id } },
    }).world;
    for (let i = 0; i < 2; i++) w = step(w).world;
    expect(actor(w).mastered).not.toContain(id);
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
    // Knowing the shared shelter is not knowing the single-person one.
    expect(actor(w).mastered).not.toContain('simple-shelter');
  });

  it('builds two bays in 24 paid rounds and 24 energy, commissioning each separately and conserving the real materials', () => {
    const f = supplied();
    const before = Object.fromEntries(
      Object.keys(RECIPE).map((r) => [r, units(f.w, r)]),
    );
    const load = v7Load(f.w, actor(f.w));
    const e0 = actor(f.w).vitals.energy;
    const first = step(f.w, { sol: f.start() });
    expect(first.outcomes.sol?.complete).toBe(false);
    const started = events(first.world, 'shared-shelter-started')[0];
    expect(started?.data.siteCheck).toMatch(/clear walkable approach/);
    expect(bays(first.world)).toHaveLength(2);
    const [b1, b2] = bays(first.world);
    expect(started?.data.bays).toEqual([b1?.id, b2?.id]);
    expect(b1?.data.structure).toBe(b2?.data.structure);
    // Each bay keeps the inherited 2 m x 2 m footprint; together they are adjacent, not overlapping.
    expect(b1?.spatial.shape).toEqual({
      kind: 'rectangle',
      width: 2,
      height: 2,
    });
    expect([b1?.spatial.y, b2?.spatial.y]).toEqual([13.5, 15.5]);
    // The first increment installs one forked post in bay 1; the rest stays reserved and carried.
    expect(parts(b1)).toMatchObject([
      { resource: 'branch', quantity: 1, increment: 1, role: 'forked post' },
    ]);
    expect(parts(b2)).toHaveLength(0);
    expect(
      first.world.stacks
        .filter((s) => s.reservedFor === job(first.world)?.id)
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(45);
    let w = first.world;
    for (let i = 1; i < 24; i++) {
      const r = step(w, { sol: f.start() });
      w = r.world;
      if (i === 11) {
        // Bay 1 is checked and commissioned on its own while bay 2 is still bare.
        expect(events(w, 'shared-shelter-bay-commissioned')[0]?.target).toBe(
          bay(w, 1).id,
        );
        expect(bay(w, 1).data.status).toBe('commissioned');
        expect(bay(w, 2).data.status).toBe('unfinished');
        expect(parts(bay(w, 2))).toHaveLength(0);
        expect(r.outcomes.sol?.complete).toBe(false);
      }
      if (i === 19) {
        expect(bay(w, 2).data.roofCoverage).toBe(0);
        expect(bay(w, 2).data.view).toMatchObject({
          installedMask: [
            ...Array.from({ length: 8 }, () => true),
            ...Array.from({ length: 3 }, () => false),
          ],
        });
      }
      if (i === 23) expect(r.outcomes.sol?.complete).toBe(true);
    }
    const done = events(w, 'shared-shelter-bay-commissioned')[0];
    expect(done?.target).toBe(bay(w, 2).id);
    expect(done?.data.limits).toMatchObject({
      rain: 0.8,
      wind: 0.8,
      rainShield: 0.5,
      windShield: 0.35,
    });
    // Roof load per bay: six ribs (1.1 each) and six bark units (0.3 each).
    expect(done?.data.supportedLoad).toBeCloseTo(8.4, 8);
    expect(job(w)?.status).toBe('completed');
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    for (const o of bays(w)) {
      expect([count(o, 'branch'), count(o, 'vine'), count(o, 'bark')]).toEqual([
        13, 4, 6,
      ]);
      expect(o.data.roofCoverage).toBe(1);
      expect(o.data.view).toMatchObject({
        structure: o.data.structure,
        bays: bays(w).map((b) => b.id),
        structureFootprint: { length: 4, depth: 2, orientation: 0 },
        openApproach: { depth: 1, length: 4 },
        installedMask: Array.from({ length: 11 }, () => true),
        status: 'complete',
      });
    }
    for (const [r, n] of Object.entries(RECIPE)) {
      expect(bays(w).reduce((x, o) => x + count(o, r), 0)).toBe(n);
      expect(units(w, r)).toBe(before[r]);
    }
    // Installed parts are no longer carried: the load fell by the two-bay recipe mass.
    expect(load - v7Load(w, actor(w))).toBeCloseTo(
      26 * 1.1 + 8 * 0.5 + 12 * 0.3,
      6,
    );
    const waited = (() => {
      let x = f.w;
      for (let i = 0; i < 24; i++) x = step(x).world;
      return actor(x).vitals.energy;
    })();
    expect(e0 - actor(w).vitals.energy - (e0 - waited)).toBeCloseTo(24, 6);
    // No milestone or other reward for finishing a structure.
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(JSON.stringify(actor(w).wellbeing.sources)).not.toContain(id);
  });

  it('shields one person on each bay floor independently, and nobody on a crowded bay', () => {
    const w = calm(built().w);
    actor(w).position = { ...FLOOR[0] };
    actor(w, 'kai').position = { ...FLOOR[1] };
    const plain = v7Clone(w);
    for (const o of bays(plain)) o.data.status = 'unverified';
    for (const who of ['sol', 'kai']) {
      const m = sharedShelterExposure(w, actor(w, who));
      expect(m?.withheld).toBeNull();
      expect(m?.occupants).toBe(1);
      expect(m?.facing).toBe(1);
      expect(m?.rainShield).toBeLessThanOrEqual(0.5);
      expect(m?.windShield).toBeCloseTo(0.35 * (m?.roofCondition ?? 0), 6);
      expect(m?.avoidedChill).toBeGreaterThan(0);
      expect(m?.avoidedChill).toBeLessThan(m?.outdoorChill ?? 0);
      expect(sharedShelterExposure(plain, actor(plain, who))).toBeNull();
    }
    expect(sharedShelterExposure(w, actor(w))?.target).toBe(bay(w, 1).id);
    expect(sharedShelterExposure(w, actor(w, 'kai'))?.target).toBe(
      bay(w, 2).id,
    );
    const sheltered = step(w).world,
      exposed = step(plain).world;
    const measured = events(sheltered, 'shared-shelter-exposure-measured');
    expect(measured.map((e) => e.actor).sort()).toEqual(['kai', 'sol']);
    for (const who of ['sol', 'kai']) {
      const avoided = Number(
        measured.find((e) => e.actor === who)?.data.avoidedChill,
      );
      expect(avoided).toBeGreaterThan(0);
      const warmer =
        actor(sheltered, who).vitals.temperature -
        actor(exposed, who).vitals.temperature;
      expect(warmer).toBeCloseTo(0.035 * avoided, 6);
      expect(actor(sheltered, who).vitals.satiety).toBe(
        actor(exposed, who).vitals.satiety,
      );
      expect(actor(sheltered, who).vitals.energy).toBe(
        actor(exposed, who).vitals.energy,
      );
    }
    expect(events(exposed, 'shared-shelter-exposure-measured')).toHaveLength(0);
    expect(forestClimate(sheltered, SITE).temperature).toBe(
      forestClimate(exposed, SITE).temperature,
    );
    // Occupancy is observed per bay, with actual positions and whether protection checks pass.
    const occupancy = events(sheltered, 'shared-shelter-occupancy');
    expect(occupancy.map((e) => e.target)).toEqual(
      bays(sheltered).map((o) => o.id),
    );
    expect(bay(sheltered, 1).data.view).toMatchObject({
      occupants: [{ id: 'sol', ...FLOOR[0] }],
      protectedOccupant: 'sol',
    });
    // A second person on bay 1 removes bay 1's protection only; bay 2 still protects its occupant.
    const crowded = v7Clone(w);
    actor(crowded).position = { x: 20, y: 13.1 };
    actor(crowded, 'ivo').position = { x: 20, y: 13.9 };
    for (const who of ['sol', 'ivo'])
      expect(sharedShelterExposure(crowded, actor(crowded, who))).toMatchObject(
        {
          occupants: 2,
          withheld: 'more than one person on this bay floor',
          avoidedChill: 0,
        },
      );
    expect(sharedShelterExposure(crowded, actor(crowded, 'kai'))).toMatchObject(
      { occupants: 1, withheld: null },
    );
    const shared = step(crowded).world;
    expect(bay(shared, 1).data.protectedOccupant).toBeNull();
    expect(bay(shared, 2).data.protectedOccupant).toBe('kai');
    // Lying across the joint of two bays fits neither floor.
    const joint = v7Clone(w);
    actor(joint).position = { x: 20, y: 14.5 };
    expect(sharedShelterExposure(joint, actor(joint))).toBeNull();
    // Wind entering the open side gives no wind protection.
    const turned = v7Clone(w);
    for (const o of bays(turned)) o.spatial.angle = Math.PI;
    expect(sharedShelterExposure(turned, actor(turned))?.windShield).toBe(0);
  });

  it('withholds protection in real weather beyond the light-weather limits', () => {
    let w = v7Clone(built().w);
    for (let i = 0; i < 200; i++) {
      const c = forestClimate(w, SITE);
      if (Math.max(c.rain ?? 0, c.wind ?? 0) > 0.8) break;
      w = step(w).world;
    }
    const c = forestClimate(w, SITE);
    expect(Math.max(c.rain ?? 0, c.wind ?? 0)).toBeGreaterThan(0.8);
    expect(bay(w, 1).data.status).toBe('commissioned');
    actor(w).position = { ...FLOOR[0] };
    expect(sharedShelterExposure(w, actor(w))).toMatchObject({
      withheld: 'weather beyond the light-weather limits',
      avoidedChill: 0,
    });
  });

  it('pauses when not worked, resumes after revalidation and pauses without spending on low energy, out of reach or an occupied bay', () => {
    const f = supplied();
    let w = step(f.w, { sol: f.start() }).world;
    const paused = step(w);
    expect(events(paused.world, 'shared-shelter-paused')).toHaveLength(1);
    expect(job(paused.world)?.status).toBe('paused');
    w = step(paused.world).world;
    const resumed = step(w, {
      sol: { interface: id, args: { mode: 'resume' } },
    });
    expect(events(resumed.world, 'shared-shelter-resumed')).toHaveLength(1);
    expect(job(resumed.world)?.completedWork).toBe(2);
    w = resumed.world;
    const low = v7Clone(w);
    actor(low).vitals.energy = 0.5;
    const tired = step(low, {
      sol: { interface: id, args: { mode: 'resume' } },
    });
    expect(events(tired.world, 'shared-shelter-paused')[0]?.data).toMatchObject(
      { requiredEnergy: 1, completedIncrements: 2 },
    );
    expect(actor(tired.world).vitals.energy).toBeGreaterThanOrEqual(0.5);
    expect(parts(bay(tired.world, 1))).toHaveLength(2);
    const away = v7Clone(w);
    actor(away).position = { x: 18.6, y: 18 };
    const far = step(away, {
      sol: { interface: id, args: { mode: 'resume' } },
    });
    expect(events(far.world, 'shared-shelter-paused')[0]?.description).toMatch(
      /Bay 1 is beyond working reach/,
    );
    expect(job(far.world)?.completedWork).toBe(2);
    const busy = v7Clone(w);
    actor(busy, 'kai').position = { ...FLOOR[0] };
    const blocked = step(busy, {
      sol: { interface: id, args: { mode: 'resume' } },
    });
    expect(
      events(blocked.world, 'shared-shelter-paused')[0]?.description,
    ).toMatch(/Another person occupies the bay being built/);
    expect(job(blocked.world)?.completedWork).toBe(2);
  });

  it('cancels once, returning only uninstalled materials, keeping a commissioned bay and leaving an unfinished one', () => {
    const f = supplied();
    let w = f.w;
    for (let i = 0; i < 14; i++) w = step(w, { sol: f.start() }).world;
    const before = units(w, 'branch');
    const cancelled = step(w, {
      sol: { interface: id, args: { mode: 'cancel' } },
    });
    w = cancelled.world;
    expect(cancelled.outcomes.sol?.success).toBe(true);
    expect(events(w, 'shared-shelter-cancelled')).toHaveLength(1);
    expect(job(w)?.status).toBe('stopped');
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect([owned(w, 'branch'), owned(w, 'vine'), owned(w, 'bark')]).toEqual([
      11, 4, 6,
    ]);
    expect(bay(w, 1).data.status).toBe('commissioned');
    expect(parts(bay(w, 2))).toHaveLength(2);
    expect(bay(w, 2).data.status).toBe('unfinished');
    expect(bay(w, 2).data.workId).toBeNull();
    expect(units(w, 'branch')).toBe(before);
    const again = step(w, { sol: { interface: id, args: { mode: 'cancel' } } });
    expect(again.outcomes.sol?.success).toBe(false);
    // Cancelling before any part of bay 2 exists removes the empty bay.
    let early = step(f.w, { sol: f.start() }).world;
    early = step(early, {
      sol: { interface: id, args: { mode: 'cancel' } },
    }).world;
    expect(bays(early)).toHaveLength(1);
    expect(bay(early, 1).data.view).toMatchObject({
      bays: [bay(early, 1).id],
    });
  });

  it('rejects wrong recipes, wrong bay counts, unsuitable sites, a blocked approach, foreign materials and low energy without spending anything', () => {
    const f = supplied();
    const unchanged = (
      action: V7Action,
      reason: RegExp,
      w = f.w,
      who = 'sol',
    ) => {
      const r = step(w, { [who]: action }),
        idle = step(w).world;
      expect(r.outcomes[who]?.success).toBe(false);
      expect(r.outcomes[who]?.reason).toMatch(reason);
      expect(r.world.stacks).toEqual(idle.stacks);
      expect(actor(r.world, who).vitals).toEqual(actor(idle, who).vitals);
      expect(bays(r.world)).toHaveLength(0);
      expect(job(r.world)).toBeUndefined();
    };
    // A one-bay recipe is not enough for two bays, and stone is no substitute.
    const left: Record<string, number> = { branch: 13, vine: 4, bark: 6 };
    const single = f.materials.flatMap((m) => {
      const r = f.w.stacks.find((s) => s.id === m.itemId)?.resource ?? '';
      const n = Math.min(left[r] ?? 0, m.quantity);
      left[r] = (left[r] ?? 0) - n;
      return n ? [{ ...m, quantity: n }] : [];
    });
    expect(single.reduce((n, m) => n + m.quantity, 0)).toBe(23);
    unchanged(f.start({ materials: single }), /Exact owned whole units/);
    unchanged(f.start({ bays: 1, materials: single }), /bays/);
    unchanged(f.start({ bays: 5 }), /bays/);
    unchanged(f.start({ bays: 2.5 }), /2-4 bays/);
    // Real gathered stone in place of one bark unit is refused.
    let stony = v7Clone(f.w);
    actor(stony).position = { x: 15, y: 11.2 };
    stony = step(stony, {
      sol: {
        interface: 'gather',
        args: { target: 'start-1-stone', quantity: 1 },
      },
    }).world;
    const stone = stony.stacks.find(
      (s) => s.owner === 'sol' && s.resource === 'stone',
    );
    if (!stone) throw new Error('Missing gathered stone.');
    actor(stony).position = { ...STAND };
    const swapped = [
      ...f.materials.map((m) => (m.quantity === 1 ? { ...m, quantity: 0 } : m)),
      { itemId: stone.id, quantity: 1 },
    ].filter((m) => m.quantity > 0);
    unchanged(
      f.start({ materials: swapped }),
      /Exact owned whole units/,
      stony,
    );
    // The wet river bank is not ordinary soil.
    const bank = v7Clone(f.w);
    actor(bank).position = { x: 18.6, y: 15 };
    unchanged(f.start({ y: 16 }), /not ordinary soil/, bank);
    unchanged(f.start({ x: 23 }), /beyond working reach/);
    // A fallen-branch tree stands in front of the shared open side.
    const tree = v7Clone(f.w);
    actor(tree).position = { x: 18.9, y: 12 };
    unchanged(
      f.start({ x: 18.9 }),
      /a solid object blocks the open approach/,
      tree,
    );
    const crowded = v7Clone(f.w);
    actor(crowded, 'kai').position = { ...FLOOR[1] };
    unchanged(f.start(), /person occupies/, crowded);
    const other = v7Clone(f.w);
    actor(other, 'kai').mastered.push(id);
    actor(other, 'kai').position = { x: 18.6, y: 15.2 };
    unchanged(f.start(), /owned|ownership|observ/i, other, 'kai');
    const tired = v7Clone(f.w);
    actor(tired).vitals.energy = 0.5;
    unchanged(f.start(), /first work increment/, tired);
  });

  it('lets only the builder resume, cancel, repair or dismantle, while anyone who studied may inspect every bay in reach', () => {
    const f = supplied();
    const w = step(f.w, { sol: f.start() }).world;
    const other = v7Clone(w);
    actor(other, 'kai').mastered.push(id);
    actor(other, 'kai').position = { x: 18.6, y: 15.2 };
    const process = job(w)?.id ?? '';
    for (const mode of ['resume', 'cancel'])
      expect(
        step(other, {
          kai: { interface: id, args: { mode, processId: process } },
        }).outcomes.kai?.success,
      ).toBe(false);
    const done = built().w;
    actor(done, 'kai').mastered.push(id);
    actor(done, 'kai').position = { x: 18.6, y: 15.2 };
    const target = bay(done, 1).id;
    for (const args of [
      { mode: 'dismantle', target },
      { mode: 'repair', target, increment: 1, materials: [] },
    ]) {
      const r = step(done, { kai: { interface: id, args } });
      expect(r.outcomes.kai?.reason).toMatch(/Only the person who built/);
      expect(parts(bay(r.world, 1))).toHaveLength(parts(bay(done, 1)).length);
    }
    const inspected = step(done, {
      kai: { interface: id, args: { mode: 'inspect', target } },
    });
    expect(inspected.outcomes.kai?.success).toBe(true);
    const report = events(inspected.world, 'shared-shelter-inspected')[0];
    expect(
      (report?.data.bays as { status: string }[]).map((b) => b.status),
    ).toEqual(['commissioned', 'commissioned']);
    expect(actor(inspected.world, 'kai').memory.knowledge).toMatchObject({
      [`${bay(done, 1).data.structure as string}:shared-shelter-condition`]: {
        verified: false,
      },
    });
    expect(
      actor(step(done).world, 'kai').vitals.energy -
        actor(inspected.world, 'kai').vitals.energy,
    ).toBeCloseTo(0.2, 6);
  });

  it('lets wear disable only the affected bay until exact repair and reinspection', () => {
    let w = v7Clone(built().w);
    for (const p of parts(bay(w, 1)))
      if (p.increment === 4) p.condition = 0.5001;
    w = step(w).world;
    const damaged = events(w, 'shared-shelter-damaged');
    expect(damaged.map((e) => e.target)).toEqual([bay(w, 1).id]);
    expect(bay(w, 1).data.status).toBe('unsafe');
    expect(bay(w, 2).data.status).toBe('commissioned');
    const inside = v7Clone(w);
    actor(inside).position = { ...FLOOR[0] };
    actor(inside, 'kai').position = { ...FLOOR[1] };
    expect(sharedShelterExposure(inside, actor(inside))).toBeNull();
    expect(sharedShelterExposure(inside, actor(inside, 'kai'))?.target).toBe(
      bay(inside, 2).id,
    );
    // Gather two real replacement branches, then repair bay 1 increment 4 (two braces).
    actor(w).position = { x: 10.5, y: 9.1 };
    actor(w).vitals.energy = 40;
    w = step(w, {
      sol: {
        interface: 'gather',
        args: { target: 'start-0-branches', quantity: 2 },
      },
    }).world;
    const fresh = w.stacks.find(
      (s) =>
        s.owner === 'sol' &&
        s.resource === 'branch' &&
        s.quantity === 2 &&
        !s.processing,
    );
    if (!fresh) throw new Error('Missing gathered replacement branches.');
    actor(w).position = { ...STAND };
    actor(w).vitals.energy = 20;
    const target = bay(w, 1).id;
    const before = units(w, 'branch');
    const r = step(w, {
      sol: {
        interface: id,
        args: {
          mode: 'repair',
          target,
          increment: 4,
          materials: [{ itemId: fresh.id, quantity: 2 }],
        },
      },
    });
    expect(r.outcomes.sol?.success).toBe(true);
    w = r.world;
    const event = events(w, 'shared-shelter-repaired')[0];
    expect(event?.data.before).toBeLessThan(0.5);
    expect(event?.data.after).toBe(1);
    const removed = w.stacks.filter((s) => s.processing?.simpleShelterPart);
    expect(removed.map((s) => s.quantity)).toEqual([2]);
    expect(removed[0]?.owner).toBeNull();
    expect(units(w, 'branch')).toBe(before);
    // Repair alone does not restore protection.
    expect(bay(w, 1).data.status).toBe('unsafe');
    const inspected = step(w, {
      sol: { interface: id, args: { mode: 'inspect', target } },
    }).world;
    const again = events(inspected, 'shared-shelter-bay-commissioned');
    expect(again.map((e) => [e.target, e.data.again])).toEqual([
      [target, true],
    ]);
    expect(bay(inspected, 1).data.status).toBe('commissioned');
  });

  it('dismantles one stage of one bay per round and 1 energy, returning every part to the ground', () => {
    let w = built().w;
    const target = bay(w, 2).id;
    const before = Object.fromEntries(
      Object.keys(RECIPE).map((r) => [r, units(w, r)]),
    );
    const stages: string[] = [];
    for (let i = 0; i < 4; i++) {
      const idle = actor(step(w).world).vitals.energy;
      w = step(w, {
        sol: { interface: id, args: { mode: 'dismantle', target } },
      }).world;
      const stage = events(w, 'shared-shelter-dismantled')[0]?.data.stage;
      stages.push(typeof stage === 'string' ? stage : '');
      expect(idle - actor(w).vitals.energy).toBeCloseTo(1, 6);
    }
    expect(stages).toEqual([
      'roofing',
      'ribs-and-binding',
      'ridge-and-braces',
      'posts',
    ]);
    expect(bays(w).map((o) => o.data.bay)).toEqual([1]);
    expect(bay(w, 1).data.status).toBe('commissioned');
    expect(bay(w, 1).data.view).toMatchObject({ bays: [bay(w, 1).id] });
    const ground = w.stacks.filter((s) => s.processing?.simpleShelterPart);
    expect(ground.every((s) => s.owner === null)).toBe(true);
    for (const [r, n] of Object.entries(RECIPE)) {
      expect(
        ground
          .filter((s) => s.resource === r)
          .reduce((x, s) => x + s.quantity, 0),
      ).toBe(n / 2);
      expect(units(w, r)).toBe(before[r]);
    }
  });

  it('stops at death, leaving installed parts and dropping uninstalled materials where the person died', () => {
    const f = supplied();
    let w = f.w;
    for (let i = 0; i < 2; i++) w = step(w, { sol: f.start() }).world;
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    const dead = v7Clone(w);
    pkg?.onDeath?.(dead, actor(dead));
    expect(job(dead)?.status).toBe('stopped');
    expect(events(dead, 'shared-shelter-failed')).toHaveLength(1);
    const dropped = dead.stacks.filter(
      (s) =>
        s.owner === null &&
        s.resource in RECIPE &&
        s.position.x === actor(dead).position.x &&
        s.position.y === actor(dead).position.y,
    );
    expect(dropped.reduce((n, s) => n + s.quantity, 0)).toBe(44);
    expect(dead.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(bays(dead)).toHaveLength(1);
    expect(parts(bay(dead, 1))).toHaveLength(2);
    expect(bay(dead, 1).data.workId).toBeNull();
  });
});
