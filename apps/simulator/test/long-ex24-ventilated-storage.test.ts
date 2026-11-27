import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
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
import { CONTINUOUS_VISUALS } from '../../viewer/src/continuous-visuals.js';
import { packagesBefore } from './support/goal-pair-package-snapshot.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 120_000 });

const id = 'prepare-ventilated-food-storage';
const KIND = 'ventilated-food-rack';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition|history/i;
/** Package ids the brief reserves for earlier work. */
const TAKEN = [
  'cultivate-plants',
  'branch-screen',
  'hand-weave-fiber-mat',
  'hand-break-food',
  'hand-twist-fiber-cord',
  'hand-tie-cord-knot',
  'hand-join-fiber-cords',
  'hand-bind-crossing',
  'hand-twist-sectioned-cord',
  'hand-lash-crossing',
  'hand-frap-crossing',
  'hand-twist-long-sectioned-cord',
  'plant-cultivation',
  'hearth-food-preparation',
  'mechanical-food-handling',
  'plant-establishment-trial',
  'unheated-food-preparation',
  'thermal-food-preparation',
  'food-air-exposure-trial',
  'thin-slice-food-drying-trial',
  'cutting-edge-assessment',
  'shell-compression-opening',
  'lever-mass-comparator',
  'apply-marking-material',
  'open-and-separate-sample',
  'air-dry-food-trial',
  'small-combustion-source',
  'beam-mass-comparator',
  'compare-material-samples',
  'targeted-food-constituent-test',
  'prepare-shelled-food',
  'draw-from-observation',
  'sleep-in-place',
  'rooted-plant-watering',
  'crack-and-separate-casing',
  'shape-and-use-wooden-digging-tool',
  'propagate-from-seed',
];
/** sha256 of JSON.stringify of the map from id@version to the sha256 of JSON.stringify of each
 * of the 118 packages registered before this change, in registration order (the scratch hash
 * file validation-results/scratch/ex24/hashes-before.json, taken before this change). */
const EXISTING_DIGEST =
  'abc43b9fa635680724c8fb362c5660cd51b755fb494c28e4c0e453fadf7b252a';
/** sha256 of JSON.stringify of each reused package, taken before this change. */
const REUSED: Record<string, string> = {
  'foundation-forest@1':
    '54094fb4230e6a50ffaeec27771a3d4345987b2e6f03161a5cf61f9f5c36de7b',
  'foundation-open@1':
    'c2cc0c70d608bd5f5e60b81671ee99a73c8bfa1304ad88faed1342d59cb5f6fe',
  'simple-shelter@1':
    '7ac02d6ac8e126a66569faa91f788dd5a48e2cc88047d7db80f053f76ea2d2be',
  'branch-screen@1':
    'f2b0aeecfcc131c670181a8d1c19a3e0f49e32ff4d1924dfc3280dca3571960f',
  'food-air-exposure-trial@1':
    'e09d11fb05989765f8e20b2e3fb18e8df4150a0e1c8e733a557baa8aee4a61a9',
  'lever-mass-comparator@1':
    '888531bb0cd81a57b01d5572d97ef7a5f4f9cc149ffb945efc12414458f2571f',
  'air-dry-food-trial@1':
    '71c63304b930efbeddad60f7f6b0cb19ea8e71392dac1dbba6540ad28f673cc9',
  'small-combustion-source@1':
    '88baf2ffeb6b0d808e0689e4c200cdb0083ba6ebff605ef89b6c903e26f88eb8',
  'propagate-from-seed@1':
    '01ae73ba3951a4c40260928a5b54b79911accf6f293fa175a0917966a44323a6',
};
/** A root and a branch source near Wren's start, with standing points within reach. */
const ROOTS = 'commons-root-3-0';
const AT_ROOTS = { x: 10.37, y: 14.45 };
const BRANCHES = 'start-0-branches';
const AT_BRANCHES = { x: 10.5, y: 9.15 };
const BERRIES = 'commons-berry-4-0';
/** The rack site on forest floor and Wren's standing point just outside its footprint. */
const SITE = { x: 11.25, y: 11.5 };
const STAND = { x: 11.25, y: 12.25 };
/** Where Sol stands within reach of the rack and its food, outside the deck. */
const SOL_STAND = { x: 11.95, y: 11.5 };
/** Warmer meadow and cooler rocky points away from the rack (forest floor). */
const MEADOW = { x: 16.5, y: 11.5 };
const ROCKY = { x: 36, y: 12.5 };
/** World times of a rainy round and of a dry, windy round of this seed. */
const RAINY = 60;
const DRY = 140;
/** The declared rod of one whole fallen-branch unit (ex21: 900 kg/m3, 25 diameters). */
const r8 = (x: number) => Math.round(x * 1e8) / 1e8;
const ROD = Math.cbrt((4 * (1.1 / 900)) / (Math.PI * 25));
const DIAMETER = r8(ROD);
const LENGTH = r8(ROD * 25);
/** Central point-load rating over the 0.8 m span: bending strength 45e6 Pa / 2, or a bend of
 * 0.02 of the half-span at modulus 4e9 Pa, whichever is lower, in kg. */
const RATING = r8(
  Math.min(
    (4 * ((Math.PI * DIAMETER ** 3) / 32) * 45e6) / 2 / 0.8,
    (48 * 4e9 * ((Math.PI * DIAMETER ** 4) / 64) * 0.02 * 0.4) / 0.8 ** 3,
  ) / 9.81,
);

const sha = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
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
const own = (w: V7World, res: string, who = 'wren') =>
  w.stacks.filter((s) => s.owner === who && s.resource === res);
const rackOf = (w: V7World): V7Object | undefined =>
  w.objects.find((o) => o.kind === KIND);
const rack = (w: V7World): V7Object => {
  const o = rackOf(w);
  if (!o) throw new Error('Missing rack.');
  return o;
};
type Piece = {
  id: string;
  slot: string;
  role: string;
  resource: string;
  origin: string;
  condition: number;
  diameter: number;
  length: number;
  rating: number;
  mass: number;
};
const pieces = (o: V7Object) => o.data.pieces as unknown as Piece[];
const view = (o: V7Object) => o.data.view as Record<string, unknown>;
type Lot = {
  lot: string;
  control: string | null;
  source: string;
  quantity: number;
  status: string;
  decay0: number;
  favourable: boolean;
  failed: string[];
  ordinary: number;
  applied: number;
  reference: string;
  pairRounds: number;
  wetted: boolean;
  controlPresent: boolean;
};
type RackState = { lot: Lot | null; ended: Lot[] };
const state = (w: V7World) =>
  w.state[`ventilated-rack:${rack(w).id}`] as unknown as RackState;
const lot = (w: V7World): Lot => {
  const r = state(w).lot;
  if (!r) throw new Error('No stored lot.');
  return r;
};
type Work = {
  id: string;
  owner: string;
  status: string;
  completedWork: number;
  paidEnergy: number;
  escrow: string[];
  target: string | null;
};
const works = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Work);
const act = (mode: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});
const units = (stacks: { quantity: number }[]) =>
  stacks.reduce((n, s) => n + Math.round(s.quantity * 10), 0) / 10;
/** Keep everyone fed and rested so the tests isolate the operation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
const at = (w: V7World, p: { x: number; y: number }, who = 'wren') => {
  const copy = v7Clone(w);
  actor(copy, who).position = { ...p };
  return fed(copy);
};
const timed = (w: V7World, time: number) => {
  const copy = v7Clone(w);
  copy.time = time;
  return copy;
};
function genesis() {
  return initialLongWorld('long-ex24', 'long-culture-v2', {
    seed: 20261203,
    development: 8,
    tokens: 1500000,
  });
}
function installed() {
  const g = genesis();
  return v7Clone(v7Install(g, continuousRegistry(g), `${id}@1`));
}
const learn = (w: V7World, who = 'wren') => {
  let s = step(w, {
    [who]: { interface: 'learn', args: { ability: id } },
  }).world;
  for (let i = 0; i < 2; i++) s = step(s).world;
  expect(actor(s, who).mastered).toContain(id);
  return fed(s);
};
/** The action fails and changes no vitals, stacks, works, racks or rack records. */
function unchanged(w: V7World, action: V7Action, who = 'wren') {
  const result = step(w, { [who]: action }),
    idle = step(w).world,
    hidden = (x: V7World) =>
      Object.entries(x.state).filter(
        ([k]) =>
          k.startsWith('ventilated-rack:') || k.startsWith('collective:work:'),
      );
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  expect(v7Signature(hidden(result.world))).toBe(v7Signature(hidden(idle)));
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action, who = 'wren') {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  return {
    world: r.world,
    energy:
      Math.round(
        (actor(idle, who).vitals.energy - actor(r.world, who).vitals.energy) *
          1e8,
      ) / 1e8,
  };
}

/** Wren gathers 5 roots and 6 branch units, studies, and prepares the rack in four rounds. */
let cache: {
  ready: V7World;
  stages: V7World[];
  spent: number[];
  log: V7Event[];
  roots: string;
  branches: string;
} | null = null;
function fixture() {
  if (!cache) {
    let r = step(at(installed(), AT_ROOTS), {
      wren: { interface: 'gather', args: { target: ROOTS, quantity: 5 } },
    });
    expect(r.outcomes.wren?.success, r.outcomes.wren?.reason).toBe(true);
    r = step(at(r.world, AT_BRANCHES), {
      wren: { interface: 'gather', args: { target: BRANCHES, quantity: 6 } },
    });
    expect(r.outcomes.wren?.success, r.outcomes.wren?.reason).toBe(true);
    const roots = own(r.world, 'root')[0]?.id ?? '',
      branches = own(r.world, 'branch')[0]?.id ?? '';
    const ready = at(learn(fed(r.world)), STAND);
    const stages: V7World[] = [],
      spent: number[] = [],
      log: V7Event[] = [];
    let w = ready;
    for (let i = 0; i < 4; i++) {
      const c = cost(w, prepare(branches));
      spent.push(c.energy);
      log.push(...c.world.events);
      w = fed(c.world);
      stages.push(w);
    }
    cache = { ready, stages, spent, log, roots, branches };
  }
  return {
    ready: v7Clone(cache.ready),
    built: v7Clone(cache.stages[3] as V7World),
    stage: (i: number) => v7Clone(cache?.stages[i] as V7World),
    spent: [...cache.spent],
    log: [...cache.log],
    roots: cache.roots,
    branches: cache.branches,
  };
}
const prepare = (branches: string, extra: Record<string, unknown> = {}) =>
  act('prepare', {
    ...SITE,
    materials: [{ itemId: branches, quantity: 5 }],
    ...extra,
  });
const load = (w: V7World, food: string, extra: Record<string, unknown> = {}) =>
  act('load', {
    rack: rack(w).id,
    food,
    quantity: 2,
    controlQuantity: 2,
    ...extra,
  });
/** The built rack loaded with 2 roots and 2 carried controls at the given world time. */
function loaded(time: number, extra: Record<string, unknown> = {}) {
  const f = fixture();
  const w = timed(f.built, time);
  const c = cost(w, load(w, f.roots, extra));
  return { ...f, before: w, w: fed(c.world), energy: c.energy };
}
/** One waiting round: the decay gained by the stored lot and by its control. */
function gains(w: V7World) {
  const r = lot(w),
    lotBefore = stack(w, r.lot).decay ?? 0,
    controlBefore = r.control ? (stack(w, r.control).decay ?? 0) : 0,
    next = fed(step(w).world),
    after = state(next).lot ?? state(next).ended.at(-1);
  return {
    w: next,
    lot: (stack(next, r.lot).decay ?? 0) - lotBefore,
    control: r.control
      ? (stack(next, r.control).decay ?? 0) - controlBefore
      : null,
    record: after as Lot,
  };
}
const visibleText = (log: V7Event[]) =>
  JSON.stringify(log.map((e) => [e.type, e.description, e.data]));

describe('prepare ventilated food storage in ex24', () => {
  it('is scoped to ex24, registered last, learned in three rounds, within the size limit, and leaves every existing package byte-identical', () => {
    const other = initialLongWorld('long-ex23', 'long-culture-v2-oldgoal');
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
    // The first ex24 package; later ex24 packages follow it.
    expect(V7_PACKAGES.find((p) => p.scope === 'long-ex24')).toBe(pkg);
    expect(
      continuousRegistry(g)
        .packages.filter((p) => !p.id.startsWith('foundation-'))
        .map((p) => p.id),
    ).toContain(id);
    expect(pkg).toMatchObject({
      scope: 'long-ex24',
      version: 1,
      dependencies: ['foundation-open@1'],
      visualComponents: [KIND],
      satisfaction: [],
      processes: {},
    });
    // The rack drawing exists in the viewer.
    for (const c of pkg.visualComponents)
      expect(typeof CONTINUOUS_VISUALS[c]).toBe('function');
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 3,
      revision: `${id}@1`,
      handler: `long.${id}`,
      authored: false,
      practiceEvidence: 'food-rack-completed',
      references: {
        rack: 'optional-exact-visible',
        food: 'optional-exact-visible',
      },
    });
    expect(ability.learningEnergy).toBeUndefined();
    expect(ability.parameters.properties?.mode).toMatchObject({
      enum: [
        'prepare',
        'load',
        'unload',
        'inspect',
        'compare',
        'maintain',
        'dismantle',
        'cancel',
      ],
    });
    expect(ability.parameters.required).toEqual(['mode']);
    // New package, ability, handler, equivalence and event names.
    expect(TAKEN).not.toContain(id);
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(ability.id);
        expect(a.equivalence).not.toBe(ability.equivalence);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? []) expect(e).not.toMatch(/^food-rack-/);
      expect(p.visualComponents).not.toContain(KIND);
    }
    const limit = g.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg.abilities,
      events: pkg.events,
    });
    expect(visible).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    // Every package registered before this change, the reused ones included, is byte-identical.
    const existing = packagesBefore(pkg);
    expect(existing).toHaveLength(118);
    const map = Object.fromEntries(
      existing.map((p) => [`${p.id}@${String(p.version)}`, sha(p)]),
    );
    expect(sha(map)).toBe(EXISTING_DIGEST);
    for (const [key, hash] of Object.entries(REUSED))
      expect(map[key]).toBe(hash);
    // Unstudied use is refused at no cost; three study rounds master it.
    const f = fixture();
    const fresh = v7Clone(f.ready);
    actor(fresh).mastered = actor(fresh).mastered.filter((a) => a !== id);
    expect(unchanged(fresh, prepare(f.branches))).toMatch(/master|learn|stud/i);
    let s = step(fresh, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(actor(s).learning).toMatchObject({ ability: id, remaining: 2 });
    s = step(s).world;
    expect(actor(s).mastered).not.toContain(id);
    s = step(s).world;
    expect(actor(s).mastered).toContain(id);
  });

  it('inspects pieces, site and proposed load for 1 energy and reports a shortfall without reserving anything or touching food', () => {
    const f = fixture();
    const check = (w: V7World, action: V7Action) => {
      const c = cost(w, action);
      expect(c.energy).toBe(1);
      const d = data(c.world, 'food-rack-materials-inspected');
      expect(d?.suitable).toBe(false);
      expect(rackOf(c.world)).toBeUndefined();
      expect(works(c.world)).toHaveLength(0);
      expect(c.world.stacks.some((s) => s.reservedFor)).toBe(false);
      expect(units(own(c.world, 'branch'))).toBe(units(own(w, 'branch')));
      expect(stack(c.world, f.roots).quantity).toBe(5);
      return (d?.problems as string[]).join('; ');
    };
    // More food than one separated layer on the deck.
    expect(
      check(f.ready, prepare(f.branches, { food: f.roots, quantity: 5 })),
    ).toMatch(/do not fit one separated layer of 4/);
    // A flexible willow unit cannot be a rigid crosspiece; a treated unit is not clean.
    const odd = v7Clone(f.ready);
    const piece = (sid: string, resource: string, extra = {}): V7Stack => ({
      id: sid,
      resource,
      quantity: 1,
      quantityTenths: 10,
      owner: 'wren',
      origin: 'test-source',
      position: { ...STAND },
      ...extra,
    });
    odd.stacks.push(
      piece('test-willow', 'willow'),
      piece('test-treated', 'branch', {
        processing: { scratchAlteration: { by: 'test' } },
      }),
    );
    expect(
      check(
        odd,
        act('prepare', {
          ...SITE,
          materials: [
            { itemId: f.branches, quantity: 3 },
            { itemId: 'test-treated', quantity: 1 },
            { itemId: 'test-willow', quantity: 1 },
          ],
        }),
      ),
    ).toMatch(
      /crosspiece-1: test-treated is worked or treated.*crosspiece-2: test-willow bends too easily \(flexibility 7; at most 3 is rigid\)/,
    );
    // A footprint on a plant.
    expect(check(f.ready, prepare(f.branches, { x: 11.21, y: 12.9 }))).toMatch(
      /overlaps a plant, object or site/,
    );
    // The passing inspection reports the declared piece size and load rating.
    const pass = data(f.stage(0), 'food-rack-materials-inspected');
    expect(pass).toMatchObject({
      suitable: true,
      problems: [],
      capacity: 4,
      deck: { length: 0.8, width: 0.2 },
      proposedLoad: { units: 4, kg: 1.6 },
    });
    expect(pass?.ratingKg).toBeCloseTo(2 * RATING, 6);
    expect(RATING).toBeCloseTo(37.03, 2);
    for (const p of pass?.pieces as {
      diameter: number;
      length: number;
      rating: number;
      strengthKg: number;
      stiffnessKg: number;
    }[]) {
      expect(p.diameter).toBeCloseTo(DIAMETER, 8);
      expect(p.length).toBeCloseTo(LENGTH, 7);
      expect(p.rating).toBeCloseTo(RATING, 6);
      expect(p.strengthKg).toBeGreaterThan(p.stiffnessKg);
    }
  });

  it('assembles exactly five whole units into one real rack over three paid rounds, conserving the wood', () => {
    const f = fixture();
    // One inspection round and three assembly rounds of 1 energy each.
    expect(f.spent).toEqual([1, 1, 1, 1]);
    expect(
      f.log.map((e) => e.type).filter((t) => t.startsWith('food-rack-')),
    ).toEqual([
      'food-rack-materials-inspected',
      'food-rack-started',
      'food-rack-progress',
      'food-rack-progress',
      'food-rack-completed',
    ]);
    const wood = (w: V7World) =>
      units(w.stacks.filter((s) => s.resource === 'branch')) +
      w.objects
        .filter((o) => o.kind === KIND)
        .reduce((n, o) => n + pieces(o).length, 0);
    expect(wood(f.ready)).toBe(6);
    // After the inspection: five reserved units, a planned rack without pieces.
    const s0 = f.stage(0);
    expect(rack(s0).data).toMatchObject({ status: 'planned', pieces: [] });
    expect(s0.stacks.filter((s) => s.reservedFor)).toHaveLength(5);
    expect(view(rack(s0))).toMatchObject({ installed: 0, favourable: false });
    // Supports, then two crosspieces, then the last one and the check.
    const s1 = f.stage(1),
      s2 = f.stage(2);
    expect(pieces(rack(s1)).map((p) => p.role)).toEqual(['support', 'support']);
    expect(rack(s1).data.status).toBe('in-progress');
    expect(view(rack(s1)).work).toMatchObject({ completed: 1, required: 3 });
    expect(pieces(rack(s2))).toHaveLength(4);
    for (const w of [s0, s1, s2]) {
      expect(wood(w)).toBe(6);
      expect(rack(w).data.foodSurface).toBe(false);
      expect(unchanged(w, load(w, f.roots))).toMatch(
        /Work on this rack is still open/,
      );
    }
    const w = f.built,
      o = rack(w);
    expect(wood(w)).toBe(6);
    expect(units(own(w, 'branch'))).toBe(1);
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(
      w.stacks.filter((s) => s.resource === 'branch' && s.owner === null),
    ).toHaveLength(0);
    expect(o).toMatchObject({
      kind: KIND,
      createdBy: 'wren',
      revision: `${id}@1`,
      spatial: {
        x: SITE.x,
        y: SITE.y,
        solid: true,
        shape: { kind: 'rectangle', width: 0.8, height: 0.2 },
      },
      data: {
        status: 'complete',
        owner: 'wren',
        capacity: 4,
        foodSurface: true,
      },
    });
    expect(Number(o.data.rating)).toBeCloseTo(2 * RATING, 6);
    expect(Number(o.data.height)).toBeCloseTo(2 * DIAMETER, 8);
    expect(Number(o.data.mass)).toBeCloseTo(5.5, 8);
    expect(pieces(o).map((p) => p.slot)).toEqual([
      'support-0',
      'support-1',
      'crosspiece-0',
      'crosspiece-1',
      'crosspiece-2',
    ]);
    for (const p of pieces(o))
      expect(p).toMatchObject({ resource: 'branch', origin: BRANCHES });
    expect(works(w)[0]).toMatchObject({ status: 'completed', paidEnergy: 4 });
    // No milestone or reward: the completion event carries no qualified flag.
    expect(f.log.some((e) => e.type === 'practice-confirmed')).toBe(false);
    expect(f.log.some((e) => 'qualified' in e.data)).toBe(false);
    expect(visibleText(f.log)).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visibleText(f.log)).not.toMatch(EXTRA_EXCLUDED);
    // The view: complete, nothing stored, no favourable or shown result.
    expect(view(o)).toMatchObject({
      status: 'complete',
      installed: 5,
      occupied: 0,
      favourable: false,
      demonstrated: false,
      conditionalRate: 1,
    });
    const svg = CONTINUOUS_VISUALS[KIND]?.(o, []) ?? '';
    expect(svg).toContain('>Rack</text>');
    expect(svg).not.toMatch(/slower decay/);
  });

  it('loading partitions the stack exactly and keeps decay, harvest time and origin', () => {
    const f = loaded(DRY);
    expect(f.energy).toBe(1);
    const source = stack(f.before, f.roots),
      d = data(f.w, 'food-rack-loaded'),
      r = lot(f.w),
      lotStack = stack(f.w, r.lot),
      control = stack(f.w, r.control ?? '');
    expect(units([lotStack, control, stack(f.w, f.roots)])).toBe(5);
    expect(stack(f.w, f.roots).quantity).toBe(1);
    expect(lotStack).toMatchObject({
      quantity: 2,
      owner: null,
      position: { x: SITE.x, y: SITE.y },
      resource: 'root',
    });
    expect(foodWaterRead(lotStack)?.surface).toEqual({
      kind: 'object',
      id: rack(f.w).id,
    });
    expect(control).toMatchObject({
      quantity: 2,
      owner: 'wren',
      reservedFor: `${rack(f.w).id}:control`,
    });
    for (const s of [lotStack, control])
      expect(s).toMatchObject({
        harvestedAt: source.harvestedAt,
        origin: source.origin,
        resource: source.resource,
      });
    // The split kept the source decay exactly; no reset.
    expect(d).toMatchObject({
      source: { item: f.roots, quantity: 5 },
      lot: { quantity: 2 },
      control: { quantity: 2 },
      remaining: 1,
    });
    const at = (d?.source as { decay: number }).decay;
    expect(r8(source.decay ?? 0)).toBe(at);
    expect((d?.lot as { decay: number }).decay).toBe(at);
    expect((d?.control as { decay: number }).decay).toBe(at);
    expect(r.decay0).toBe(at);
    expect(f.w.resources.find((x) => x.id === 'root')).toMatchObject({
      nutrition: 14,
      toxicity: 0,
    });
    // The tracked control cannot be eaten or given while stored; the rack takes one lot.
    expect(
      unchanged(f.w, {
        interface: 'eat',
        args: { target: control.id, quantity: 1 },
      }),
    ).toMatch(/unavailable|reserved|insufficient/i);
    expect(
      unchanged(f.w, load(f.w, f.roots, { quantity: 1, controlQuantity: 0 })),
    ).toMatch(/already holds a lot/);
    // Capacity and whole units are checked before any charge.
    expect(unchanged(f.built, load(f.built, f.roots, { quantity: 5 }))).toMatch(
      /4 separated units/,
    );
    expect(
      unchanged(
        f.built,
        load(f.built, f.roots, { quantity: 3, controlQuantity: 3 }),
      ),
    ).toMatch(/whole units are needed/);
    expect(visibleText(f.w.events)).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visibleText(f.w.events)).not.toMatch(EXTRA_EXCLUDED);
  });

  it('multiplies the positive decay increment of the stored roots by 0.8 only while every coded check passes, against the control', () => {
    const f = loaded(DRY);
    // The loading round itself already ran under the rack.
    const r = lot(f.w);
    expect(r).toMatchObject({
      favourable: true,
      failed: [],
      reference: 'control',
    });
    expect(r.applied).toBeCloseTo(0.8 * r.ordinary, 7);
    expect(data(f.w, 'food-rack-conditions')).toMatchObject({
      favourable: true,
      rate: 0.8,
    });
    expect(view(rack(f.w))).toMatchObject({
      favourable: true,
      conditionalRate: 0.8,
      demonstrated: false,
      occupied: 2,
    });
    let w = f.w;
    for (let i = 0; i < 3; i++) {
      const g = gains(w);
      expect(g.record.favourable).toBe(true);
      expect(g.lot).toBeGreaterThan(0);
      expect(g.lot).toBeCloseTo(0.8 * (g.control ?? 0), 7);
      w = g.w;
    }
    // A solid object in the clear margin: inadequate ventilation, the ordinary rate.
    const blocked = v7Clone(w);
    blocked.objects.push({
      id: 'test-rock',
      kind: 'rock',
      name: 'Test rock',
      spatial: {
        x: 11.9,
        y: 11.5,
        angle: 0,
        shape: { kind: 'circle', radius: 0.1 },
        solid: true,
        interaction: 0.65,
        entrances: [],
      },
      visual: {
        component: 'rock',
        color: '#869189',
        accent: '#869189',
        label: 'Rock',
        state: 'still',
      },
      data: {},
      createdBy: null,
      createdAt: 0,
      revision: 'foundation-forest@1',
    });
    let g = gains(blocked);
    expect(g.record.failed).toEqual(['inadequate ventilation']);
    expect(g.lot).toBeCloseTo(g.control ?? 0, 7);
    // Other material lying on the deck: not clean.
    const fouled = v7Clone(w);
    fouled.stacks.push({
      id: 'test-stone',
      resource: 'stone',
      quantity: 1,
      quantityTenths: 10,
      owner: null,
      origin: 'test-source',
      position: { ...SITE },
    });
    g = gains(fouled);
    expect(g.record.failed).toEqual(['other material on the deck']);
    expect(g.lot).toBeCloseTo(g.control ?? 0, 7);
    // The control carried to cooler rocky ground: the stored lot is warmer than its control.
    g = gains(at(w, ROCKY));
    expect(g.record.failed).toEqual(['warmer than the control']);
    expect(g.record.applied).toBe(g.record.ordinary);
    expect(g.lot).toBeGreaterThan(g.control ?? 0);
    // Carried to warmer meadow ground, the control is warmer and the rate applies.
    g = gains(at(w, MEADOW));
    expect(g.record.favourable).toBe(true);
    expect(g.lot).toBeLessThan(0.8 * (g.control ?? 0));
    // Rain: the ordinary rate, and the food on the open deck gets wetter than its control.
    let wet = timed(w, RAINY);
    g = gains(wet);
    expect(g.record.failed).toContain('rain');
    expect(g.lot).toBeCloseTo(g.control ?? 0, 7);
    expect(events(g.w, 'food-rack-wetted')).toHaveLength(1);
    const water = (x: V7World) =>
      foodWaterRead(stack(x, lot(x).lot))?.waterFraction ?? 0;
    expect(water(g.w)).toBeGreaterThan(0.75);
    expect(
      foodWaterRead(stack(g.w, lot(g.w).control ?? ''))?.waterFraction,
    ).toBeCloseTo(0.75, 12);
    wet = g.w;
    for (let i = 0; i < 4; i++) wet = gains(wet).w;
    expect(lot(wet).failed).toEqual(['rain', 'wetter than the control']);
    // Dry again: wetter than the control until the rain water has evaporated, then 0.8.
    let drying = timed(wet, DRY + 10),
      before = water(drying),
      rounds = 0;
    for (; rounds < 30 && lot(drying).wetted; rounds++) {
      g = gains(drying);
      if (lot(g.w).wetted) {
        expect(g.record.failed).toEqual(['wetter than the control']);
        expect(g.lot).toBeCloseTo(g.control ?? 0, 7);
        expect(water(g.w)).toBeLessThan(before);
      }
      before = water(g.w);
      drying = g.w;
    }
    expect(rounds).toBeGreaterThan(1);
    expect(lot(drying).wetted).toBe(false);
    expect(water(drying)).toBeCloseTo(0.75, 12);
    expect(events(drying, 'food-rack-dried')).toHaveLength(1);
    g = gains(drying);
    expect(g.record.favourable).toBe(true);
    expect(g.lot).toBeCloseTo(0.8 * (g.control ?? 0), 7);
  });

  it('applies the ordinary rate to other foods, and checks a lot without a control against its own loading state', () => {
    const f = fixture();
    // Berries are held off the soil but the declared coefficient is for whole roots only.
    let w = timed(f.built, DRY);
    const picked = step(w, {
      wren: { interface: 'gather', args: { target: BERRIES, quantity: 4 } },
    });
    expect(picked.outcomes.wren?.success, picked.outcomes.wren?.reason).toBe(
      true,
    );
    w = fed(picked.world);
    const berries = own(w, 'berry')[0]?.id ?? '';
    w = fed(step(w, { wren: load(w, berries) }).world);
    expect(lot(w).failed).toEqual(['not compatible intact roots']);
    let g = gains(w);
    expect(g.record.failed).toEqual(['not compatible intact roots']);
    expect(g.lot).toBeCloseTo(g.control ?? 0, 7);
    // Roots without a tracked control: the checks compare with their loading water content.
    const solo = loaded(DRY, { controlQuantity: 0 });
    expect(lot(solo.w)).toMatchObject({
      control: null,
      favourable: true,
      reference: 'loading state',
    });
    g = gains(solo.w);
    expect(g.record.applied).toBeCloseTo(0.8 * g.record.ordinary, 7);
    expect(unchanged(g.w, act('compare', { rack: rack(g.w).id }))).toMatch(
      /no tracked control/,
    );
  });

  it('compares the stored lot with its control after five paired rounds and reports no demonstrated benefit when results do not support it', () => {
    const f = loaded(DRY);
    expect(lot(f.w).pairRounds).toBe(1);
    const compare = (w: V7World) => act('compare', { rack: rack(w).id });
    expect(unchanged(f.w, compare(f.w))).toMatch(
      /at least 5 paired rounds; 1 so far/,
    );
    let w = f.w;
    for (let i = 0; i < 4; i++) w = gains(w).w;
    const c = cost(w, compare(w));
    expect(c.energy).toBe(0.5);
    const d = data(c.world, 'food-rack-compared');
    expect(d).toMatchObject({
      pairedRounds: 5,
      verdict: 'slower decay shown',
      allowance: 0,
      exposure: {
        favourableRounds: 5,
        rainRounds: 0,
        unequalTemperatureRounds: 0,
        controlTracked: true,
      },
    });
    expect(Number(d?.ratio)).toBeCloseTo(0.8, 8);
    expect(Number(d?.difference)).toBeGreaterThan(0);
    expect(view(rack(c.world))).toMatchObject({
      demonstrated: true,
      comparison: 'slower decay shown',
    });
    expect(CONTINUOUS_VISUALS[KIND]?.(rack(c.world), [])).toContain(
      'Rack: slower decay shown',
    );
    expect(
      Object.values(actor(c.world).memory.knowledge ?? {}).some(
        (k) =>
          k.property === 'stored lot against its carried control' &&
          !k.verified,
      ),
    ).toBe(true);
    // Only rain: equal decay, no demonstrated benefit.
    const rainy = loaded(RAINY);
    w = rainy.w;
    for (let i = 0; i < 4; i++) w = gains(w).w;
    const none = data(cost(w, compare(w)).world, 'food-rack-compared');
    expect(none).toMatchObject({
      verdict: 'no demonstrated benefit',
      difference: 0,
      exposure: { favourableRounds: 0, rainRounds: 5 },
    });
    // The control carried on warmer ground: the unequal temperature is disclosed and allowed for.
    w = at(f.w, MEADOW);
    for (let i = 0; i < 4; i++) w = gains(w).w;
    w = at(w, STAND);
    const unequal = data(cost(w, compare(w)).world, 'food-rack-compared');
    const exposure = unequal?.exposure as Record<string, number>;
    expect(exposure.unequalTemperatureRounds).toBe(4);
    expect(exposure.meanTemperatureDifference).toBeLessThan(0);
    expect(Number(unequal?.allowance)).toBeGreaterThan(0);
    expect(Number(unequal?.difference)).toBeGreaterThan(
      Number(unequal?.allowance),
    );
    // After unloading, the ended pair can still be compared.
    w = f.w;
    for (let i = 0; i < 4; i++) w = gains(w).w;
    const out = cost(w, act('unload', { rack: rack(w).id }));
    expect(out.energy).toBe(1);
    expect(stack(out.world, lot(w).lot)).toMatchObject({ owner: 'wren' });
    expect(stack(out.world, lot(w).control ?? '').reservedFor).toBeUndefined();
    expect(
      data(
        cost(fed(out.world), compare(out.world)).world,
        'food-rack-compared',
      ),
    ).toMatchObject({ storage: 'unloaded', pairedRounds: 5 });
    expect(visibleText(c.world.events)).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visibleText(c.world.events)).not.toMatch(EXTRA_EXCLUDED);
  });

  it('refuses invalid requests before any charge', () => {
    const f = fixture();
    const r = rack(f.built).id;
    expect(
      unchanged(
        f.ready,
        act('prepare', {
          ...SITE,
          materials: [{ itemId: f.branches, quantity: 4 }],
        }),
      ),
    ).toMatch(/Exactly 5 owned whole wood units/);
    expect(
      unchanged(
        f.ready,
        act('prepare', {
          ...SITE,
          materials: [
            { itemId: f.branches, quantity: 4 },
            { itemId: f.roots, quantity: 1 },
          ],
        }),
      ),
    ).toMatch(/rack pieces are whole wood units/);
    expect(unchanged(f.ready, prepare(f.branches, { x: 14, y: 11.5 }))).toMatch(
      /within reach/,
    );
    expect(
      unchanged(f.ready, prepare(f.branches, { x: 0.2, y: 11.5 })),
    ).toMatch(/outside the world/);
    const tired = v7Clone(f.ready);
    actor(tired).vitals.energy = 0.5;
    expect(unchanged(tired, prepare(f.branches))).toMatch(/needs 1 energy/);
    expect(unchanged(f.built, prepare(f.branches, { rack: r }))).toMatch(
      /No unfinished rack work/,
    );
    expect(unchanged(f.built, act('unload', { rack: r }))).toMatch(
      /No food lies/,
    );
    expect(unchanged(f.built, act('compare', { rack: r }))).toMatch(
      /No food has been stored/,
    );
    expect(
      unchanged(f.built, act('maintain', { rack: r, replace: [] })),
    ).toMatch(/replace must list/);
    expect(unchanged(f.built, act('cancel'))).toMatch(
      /No unfinished rack work/,
    );
    expect(
      unchanged(f.built, load(f.built, f.branches, { controlQuantity: 0 })),
    ).toMatch(/edible/);
    expect(unchanged(at(f.built, MEADOW), act('inspect', { rack: r }))).toMatch(
      /beyond reach/,
    );
    expect(unchanged(f.built, act('build'))).toMatch(/outside the declared/);
    const f2 = loaded(DRY);
    const r2 = rack(f2.w).id;
    expect(
      unchanged(
        f2.w,
        act('maintain', {
          rack: r2,
          replace: [pieces(rack(f2.w))[0]?.id ?? ''],
          materials: [{ itemId: f.branches, quantity: 1 }],
        }),
      ),
    ).toMatch(/Unload the food first/);
    expect(unchanged(f2.w, act('dismantle', { rack: r2 }))).toMatch(
      /Unload the food first/,
    );
  });

  it('pauses unworked assembly at no charge, resumes only after rechecks, cancels once without refund and leaves laid pieces recoverable only as those pieces', () => {
    const f = fixture();
    // Not worked for a round: paused, nothing charged, completed rounds and reservations kept.
    const idle = step(f.stage(1)).world;
    expect(works(idle)[0]).toMatchObject({
      status: 'paused',
      completedWork: 1,
    });
    expect(events(idle, 'food-rack-paused')).toHaveLength(1);
    expect(rack(idle).data.status).toBe('paused');
    expect(idle.stacks.filter((s) => s.reservedFor)).toHaveLength(3);
    const paused = fed(idle);
    // Resuming rechecks reach and occupancy before any charge.
    const resume = prepare(f.branches, { rack: rack(paused).id });
    expect(unchanged(at(paused, MEADOW), resume)).toMatch(
      /beyond working reach/,
    );
    const crowded = at(paused, { x: 10.6, y: 11.85 }, 'sol');
    expect(unchanged(crowded, resume)).toMatch(/person occupies the footprint/);
    const resumed = cost(paused, resume);
    expect(resumed.energy).toBe(1);
    expect(events(resumed.world, 'food-rack-resumed')).toHaveLength(1);
    expect(pieces(rack(resumed.world))).toHaveLength(4);
    // Cancel after the supports: unlaid units return once, laid ones stay as an incomplete rack.
    const before = f.stage(1),
      escrow = works(before)[0]?.escrow ?? [];
    const c = cost(before, act('cancel'));
    expect(c.energy).toBe(0);
    const w = fed(c.world);
    expect(works(w)[0]?.status).toBe('stopped');
    for (const sid of escrow.slice(2))
      expect(stack(w, sid)).toMatchObject({ owner: 'wren' });
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(units(own(w, 'branch'))).toBe(4);
    expect(rack(w).data).toMatchObject({
      status: 'incomplete',
      workId: null,
      foodSurface: false,
    });
    expect(pieces(rack(w))).toHaveLength(2);
    expect(unchanged(w, act('cancel'))).toMatch(/No unfinished rack work/);
    expect(unchanged(w, load(w, f.roots))).toMatch(/only a complete rack/);
    expect(
      unchanged(
        w,
        act('maintain', {
          rack: rack(w).id,
          replace: [pieces(rack(w))[0]?.id ?? ''],
          materials: [{ itemId: f.branches, quantity: 1 }],
        }),
      ),
    ).toMatch(/Only an assembled rack/);
    // Dismantling returns exactly the laid pieces, worn, to the ground at the site.
    const laid = pieces(rack(w)),
      d = cost(w, act('dismantle', { rack: rack(w).id }));
    expect(d.energy).toBe(1);
    expect(rackOf(d.world)).toBeUndefined();
    expect(
      Object.keys(d.world.state).some((k) => k.startsWith('ventilated-rack:')),
    ).toBe(false);
    const ground = d.world.stacks.filter(
      (s) => s.resource === 'branch' && s.owner === null,
    );
    expect(ground).toHaveLength(2);
    for (const [i, s] of ground.entries())
      expect(s.processing?.ventilatedRackPiece).toMatchObject({
        slot: laid[i]?.slot,
        piece: laid[i]?.id,
        condition: laid[i]?.condition,
      });
    expect(units(d.world.stacks.filter((s) => s.resource === 'branch'))).toBe(
      6,
    );
  });

  it('death ends the work, leaving unlaid pieces where the person died and laid pieces at the site; stored food and its control keep being tracked', () => {
    const f = fixture();
    const dying = v7Clone(f.stage(1));
    actor(dying).vitals.health = 0.0001;
    actor(dying).vitals.satiety = 0;
    const where = { ...actor(dying).position };
    const died = step(dying).world;
    expect(events(died, 'died')).toHaveLength(1);
    expect(works(died)[0]?.status).toBe('stopped');
    expect(events(died, 'food-rack-failed')).toHaveLength(1);
    const dropped = died.stacks.filter(
      (s) =>
        s.resource === 'branch' &&
        s.owner === null &&
        s.position.x === where.x &&
        s.position.y === where.y,
    );
    expect(units(dropped)).toBe(4);
    expect(died.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(rack(died).data).toMatchObject({
      status: 'incomplete',
      workId: null,
    });
    expect(pieces(rack(died))).toHaveLength(2);
    // A stored lot stays on the rack; the control is released where the person died.
    const l = loaded(DRY),
      gone = v7Clone(l.w);
    actor(gone).vitals.health = 0.0001;
    actor(gone).vitals.satiety = 0;
    const control = lot(gone).control ?? '';
    const after = step(gone).world;
    expect(events(after, 'died')).toHaveLength(1);
    expect(stack(after, control)).toMatchObject({
      owner: null,
      position: { ...actor(gone).position },
    });
    expect(stack(after, control).reservedFor).toBeUndefined();
    expect(lot(after)).toMatchObject({
      status: 'stored',
      controlPresent: true,
    });
    const g = gains(fed(after));
    expect(g.record.favourable).toBe(true);
    expect(g.lot).toBeCloseTo(0.8 * (g.control ?? 0), 7);
  });

  it('wears under weather: a loose crosspiece stops the rate, a loose support drops the food; maintenance replaces pieces but not freshness; spoilage ends storage', () => {
    const f = loaded(DRY);
    const set = (w: V7World, slot: string, condition: number) => {
      const copy = v7Clone(w);
      const p = pieces(rack(copy)).find((p) => p.slot === slot);
      if (p) p.condition = condition;
      return copy;
    };
    // A crosspiece loosens: damaged, the food stays on the deck at the ordinary rate.
    let w = fed(step(set(f.w, 'crosspiece-2', 0.5001)).world);
    expect(rack(w).data.status).toBe('damaged');
    expect(events(w, 'food-rack-damaged')).toHaveLength(1);
    const g = gains(w);
    expect(g.record.failed).toEqual(['rack not intact']);
    expect(g.lot).toBeCloseTo(g.control ?? 0, 7);
    w = g.w;
    // Unload, then replace the loose crosspiece with the spare unit.
    const stored = lot(w).lot,
      decay = stack(w, stored).decay ?? 0;
    w = fed(cost(w, act('unload', { rack: rack(w).id })).world);
    const loose = pieces(rack(w)).find((p) => p.slot === 'crosspiece-2');
    const m = cost(
      w,
      act('maintain', {
        rack: rack(w).id,
        replace: [loose?.id ?? ''],
        materials: [{ itemId: f.branches, quantity: 1 }],
      }),
    );
    expect(m.energy).toBe(1);
    expect(rack(m.world).data.status).toBe('complete');
    const fresh = pieces(rack(m.world)).find((p) => p.slot === 'crosspiece-2');
    expect(fresh?.condition).toBeGreaterThan(0.99);
    expect(fresh?.id).not.toBe(loose?.id);
    expect(own(m.world, 'branch')).toHaveLength(0);
    const old = m.world.stacks.find(
      (s) =>
        (s.processing?.ventilatedRackPiece as { piece?: string } | undefined)
          ?.piece === loose?.id,
    );
    expect(old).toMatchObject({ owner: null, resource: 'branch' });
    expect(
      (old?.processing?.ventilatedRackPiece as { condition: number }).condition,
    ).toBeLessThan(0.5);
    expect(stack(m.world, stored).decay ?? 0).toBeGreaterThan(decay);
    expect(data(m.world, 'food-rack-maintained')).toMatchObject({
      status: 'complete',
    });
    // A support loosens: collapsed, the food falls onto the soil under ordinary conditions.
    const c = fed(step(set(f.w, 'support-0', 0.5001)).world);
    expect(rack(c).data).toMatchObject({
      status: 'collapsed',
      foodSurface: false,
    });
    expect(events(c, 'food-rack-collapsed')).toHaveLength(1);
    const fallen = state(c).ended.at(-1);
    expect(fallen).toMatchObject({ status: 'fallen' });
    expect(state(c).lot).toBeNull();
    expect(foodWaterRead(stack(c, fallen?.lot ?? ''))?.surface).toBeNull();
    expect(stack(c, fallen?.control ?? '').reservedFor).toBeUndefined();
    const before = stack(c, fallen?.lot ?? '').decay ?? 0,
      controlBefore = stack(c, fallen?.control ?? '').decay ?? 0,
      next = step(c).world;
    expect((stack(next, fallen?.lot ?? '').decay ?? 0) - before).toBeCloseTo(
      (stack(next, fallen?.control ?? '').decay ?? 0) - controlBefore,
      7,
    );
    // Spoilage under the ordinary ageing ends the stored lot.
    const old2 = v7Clone(f.w);
    stack(old2, lot(old2).lot).decay = 239.99;
    const s = step(old2).world;
    expect(events(s, 'food-rack-food-spoiled')).toHaveLength(1);
    expect(state(s).ended.at(-1)).toMatchObject({ status: 'spoiled' });
    expect(state(s).lot).toBeNull();
  });

  it('is owner-only for changes: another person may inspect the rack and take the food, which ends the storage', () => {
    const f = loaded(DRY);
    let w = at(f.w, SOL_STAND, 'sol');
    w = at(learn(w, 'sol'), SOL_STAND, 'sol');
    const r = rack(w).id;
    for (const action of [
      act('load', { rack: r, quantity: 1 }),
      act('unload', { rack: r }),
      act('compare', { rack: r }),
      act('dismantle', { rack: r }),
      act('maintain', {
        rack: r,
        replace: [pieces(rack(w))[0]?.id ?? ''],
        materials: [],
      }),
    ])
      expect(unchanged(w, action, 'sol')).toMatch(/Only the person who built/);
    expect(unchanged(w, act('cancel'), 'sol')).toMatch(
      /No unfinished rack work/,
    );
    expect(unchanged(w, prepare(f.branches, { rack: r }), 'sol')).toMatch(
      /No unfinished rack work of yours on that rack/,
    );
    // Anyone in reach may inspect, for 0.5 energy.
    const i = cost(w, act('inspect', { rack: r }), 'sol');
    expect(i.energy).toBe(0.5);
    expect(data(i.world, 'food-rack-inspected')).toMatchObject({
      rack: r,
      owner: 'wren',
      status: 'complete',
      food: { quantity: 2, resource: 'root' },
    });
    // Taking food off the rack reduces, then ends, the stored lot; the control is released.
    const stored = lot(w).lot,
      control = lot(w).control ?? '';
    let p = step(w, {
      sol: { interface: 'pickup', args: { target: stored, quantity: 1 } },
    });
    expect(p.outcomes.sol?.success, p.outcomes.sol?.reason).toBe(true);
    w = fed(p.world);
    expect(lot(w).quantity).toBe(1);
    expect(data(w, 'food-rack-food-removed')).toMatchObject({
      taken: 1,
      remaining: 1,
    });
    p = step(w, {
      sol: { interface: 'pickup', args: { target: stored, quantity: 1 } },
    });
    expect(p.outcomes.sol?.success, p.outcomes.sol?.reason).toBe(true);
    w = fed(p.world);
    expect(state(w).lot).toBeNull();
    expect(state(w).ended.at(-1)).toMatchObject({ status: 'removed' });
    expect(stack(w, control).reservedFor).toBeUndefined();
    const eat = step(w, {
      wren: { interface: 'eat', args: { target: control, quantity: 1 } },
    });
    expect(eat.outcomes.wren?.success, eat.outcomes.wren?.reason).toBe(true);
  });

  it('is gated: without the revision, a recorded lot on a rack decays at the ordinary rate and replay is unchanged', () => {
    const f = loaded(DRY);
    const live = gains(f.w);
    expect(live.lot).toBeCloseTo(0.8 * (live.control ?? 0), 7);
    const stray = v7Clone(f.w);
    stray.revisions = stray.revisions.filter((r) => r !== `${id}@1`);
    const g = gains(stray);
    expect(g.lot).toBeCloseTo(g.control ?? 0, 7);
    expect(g.lot).toBeGreaterThan(live.lot);
    // The recorded lot changes nothing without the revision.
    const key = `ventilated-rack:${rack(stray).id}`,
      without = (x: V7World) => {
        const copy = v7Clone(x);
        copy.state = Object.fromEntries(
          Object.entries(copy.state).filter(([k]) => k !== key),
        );
        return copy;
      };
    const bare = without(stray);
    let a = stray,
      b = bare;
    for (let i = 0; i < 3; i++) {
      a = step(a).world;
      b = step(b).world;
    }
    expect(a.state[key]).toEqual(stray.state[key]);
    expect(v7Signature(without(a))).toBe(v7Signature(b));
    // A world without the package never reaches the hook: genesis replay is unaffected.
    const plain = genesis();
    expect(plain.revisions).not.toContain(`${id}@1`);
    expect(
      continuousRegistry(plain).packages.some(
        (p) => p.id === id && plain.revisions.includes(`${p.id}@1`),
      ),
    ).toBe(false);
  });
});
