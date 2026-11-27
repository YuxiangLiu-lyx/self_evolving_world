import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Registry,
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
vi.setConfig({ testTimeout: 90_000 });

const PKG = 'small-combustion-source';
const ID = 'operate-small-combustion-source';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition/i;
/** Real ex21 sources: fallen branches, dry grass and wet clay beside the river meadow. */
const BRANCHES = 'forest-branch-0';
const GRASS = 'forest-dry-grass-0';
const CLAY = 'forest-clay-2';
const WILLOW = 'forest-willow-2';
const ROOTS = 'commons-root-4-0';
/** Stands within reach of each source, clear of solid bodies. */
const BRANCH_STAND = { x: 16.5, y: 13.3 };
const MOSS_BRANCH_STAND = { x: 17.9, y: 13.3 };
const GRASS_STAND = { x: 14.2, y: 15.75 };
const ROOT_STAND = { x: 13.16, y: 11.8 };
const STAND = { x: 23.6, y: 13.3 };
const MOSS_CLAY_STAND = { x: 23.6, y: 12.75 };
/** Firm meadow bed sites within Wren's reach from STAND, 0.75 m apart. */
const SITE = { x: 23.05, y: 13.3 };
const SITE2 = { x: 23.05, y: 14.05 };
/** Moss within reach of SITE; RIM is 0.43 m from its centre, just off the bed footprint. */
const MOSS_STAND = { x: 23.05, y: 12.55 };
const RIM = { x: 23.05, y: 12.87 };
/** The wet bank next to the clay: no firm ground for a bed. */
const BANK = { x: 24.0, y: 13.6 };
/** Far from every bed: out of reach and of the 2 m warmth range. */
const FAR = { x: 19.5, y: 11.5 };

type Fire = {
  builder: string;
  lit: boolean;
  embers: number;
  burnFraction: number;
  covered: boolean;
  bed: number;
  air: number;
  pool: number;
  offered: number;
  lots: {
    item: string;
    resource: string;
    role: string;
    quantity: number;
    unitSolids: number;
    unitWater: number;
  }[];
  covers: { resource: string; mass: number; water: number }[];
  ledger: {
    laid: number;
    caught: number;
    rain: number;
    ember: number;
    brands: number;
    burned: number;
    ash: number;
    exhaust: number;
    vapour: number;
    dust: number;
  };
  heat: {
    released: number;
    vapour: number;
    bed: number;
    actors: number;
    environment: number;
    loss: number;
    probes: number;
  };
  ignitions: number;
  failures: number;
  verifiedCold: number | null;
};
type Attempt = {
  id: string;
  owner: string;
  status: string;
  target: string;
  escrow: string[];
  paidEnergy: number;
  dust: number;
  vapour: number;
  wear: { worn: number }[];
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
const actor = (w: V7World, name = 'wren'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string): V7Event[] =>
  w.events.filter((e) => e.type === type);
const stack = (w: V7World, item: string): V7Stack => {
  const s = w.stacks.find((s) => s.id === item);
  if (!s) throw new Error(`Missing stack ${item}.`);
  return s;
};
const object = (w: V7World, id: string): V7Object => {
  const o = w.objects.find((o) => o.id === id);
  if (!o) throw new Error(`Missing object ${id}.`);
  return o;
};
const fire = (w: V7World, id: string) =>
  object(w, id).data.fire as unknown as Fire;
const beds = (w: V7World) =>
  w.objects.filter((o) => o.kind === 'small-combustion-source');
const attempts = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === ID,
    )
    .map(([, v]) => v as unknown as Attempt);
const owned = (w: V7World, who: string, resource: string) =>
  w.stacks.filter((s) => s.owner === who && s.resource === resource);
const lotMass = (f: Fire) =>
  f.lots.reduce((n, l) => n + l.quantity * (l.unitSolids + l.unitWater), 0);
const mode = (m: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: ID,
  args: { mode: m, ...extra },
});
const gather = (target: string, quantity: number): V7Action => ({
  interface: 'gather',
  args: { target, quantity },
});
const lay = (
  at: { x: number; y: number },
  fuel: string[],
  tinder: string[],
  quantity = 0.5,
) =>
  mode('tend', { ...at, fuelItemIds: fuel, tinderItemIds: tinder, quantity });
const rub = (
  bed: string,
  pieces: string[],
  cover: string[],
  durationRounds = 5,
) =>
  mode('attempt-ignition', {
    target: bed,
    ignitionMode: 'friction',
    toolItemIds: pieces,
    extinguishingItemIds: cover,
    durationRounds,
  });
/** Keep everyone fed and rested so the tests isolate the operation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
/** Test fixture: an air-dried composition at the given water share. No ex21 rule produces one;
 * the operation reads it like any represented composition. */
function dry(w: V7World, item: string, share: number) {
  const s = stack(w, item),
    r = w.resources.find((r) => r.id === s.resource);
  if (!r) throw new Error('Missing resource.');
  const solids = r.mass * (1 - (r.properties?.moisture ?? 0));
  s.physical = {
    unitMass: solids / (1 - share),
    unitWater: (solids * share) / (1 - share),
    unitSolids: solids,
  };
}
function installed() {
  const genesis = initialLongWorld('long-ex21', 'long-culture-v2-oldgoal', {
    seed: 20261202,
    development: 8,
    tokens: 1500000,
  });
  return v7Clone(v7Install(genesis, continuousRegistry(genesis), `${PKG}@1`));
}
/** Wren gathers three real branches, two dry grass and two wet clay; Moss gathers one branch and
 * two clay; both study four rounds and stand by the meadow bed site. */
function setup() {
  let w = installed();
  actor(w).position = { ...BRANCH_STAND };
  w = step(w, { wren: gather(BRANCHES, 3) }).world;
  actor(w, 'moss').position = { ...MOSS_BRANCH_STAND };
  w = step(fed(w), { moss: gather(BRANCHES, 1) }).world;
  actor(w).position = { ...GRASS_STAND };
  w = step(fed(w), { wren: gather(GRASS, 2) }).world;
  actor(w).position = { ...STAND };
  w = step(fed(w), { wren: gather(CLAY, 2) }).world;
  actor(w, 'moss').position = { ...MOSS_CLAY_STAND };
  w = step(fed(w), { moss: gather(CLAY, 2) }).world;
  const branch = owned(w, 'wren', 'branch')[0],
    grass = owned(w, 'wren', 'dry-grass')[0],
    clay = owned(w, 'wren', 'clay')[0],
    mossBranch = owned(w, 'moss', 'branch')[0],
    mossClay = owned(w, 'moss', 'clay')[0];
  if (!branch || !grass || !clay || !mossBranch || !mossClay)
    throw new Error('Missing actually gathered fixtures.');
  const learn: V7Action = { interface: 'learn', args: { ability: ID } };
  w = step(fed(w), { wren: learn, moss: learn }).world;
  for (let i = 0; i < 2; i++) w = step(w).world;
  expect(actor(w).mastered).not.toContain(ID);
  w = step(w).world;
  expect(actor(w).mastered).toContain(ID);
  expect(actor(w, 'moss').mastered).toContain(ID);
  actor(w, 'moss').position = { ...MOSS_STAND };
  return {
    w: fed(w),
    branch: branch.id,
    grass: grass.id,
    clay: clay.id,
    mossBranch: mossBranch.id,
    mossClay: mossClay.id,
  };
}
/** A laid and inspected bed of 0.5 tinder and 0.5 branch at SITE. */
function laid(dried: boolean) {
  const f = setup();
  let w = f.w;
  if (dried) {
    dry(w, f.branch, 0.05);
    dry(w, f.grass, 0.05);
  }
  w = step(w, { wren: lay(SITE, [f.branch], [f.grass]) }).world;
  const bed = beds(w)[0]?.id;
  if (!bed) throw new Error('Missing bed.');
  w = step(fed(w), { wren: mode('inspect', { target: bed }) }).world;
  return { ...f, w: fed(w), bed };
}
/** A bed lit by two rounds of friction with air-dried pieces and tinder. */
function lit() {
  const f = laid(true);
  let w = f.w;
  const action = rub(f.bed, [f.branch, f.branch], [f.clay]);
  w = step(w, { wren: action }).world;
  expect(fire(w, f.bed).lit).toBe(false);
  w = step(fed(w), { wren: action }).world;
  expect(fire(w, f.bed).lit).toBe(true);
  return { ...f, w: fed(w) };
}
/** The action fails and changes no vitals, stacks, objects or attempts compared with waiting. */
function unchanged(w: V7World, action: V7Action, who = 'wren') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  expect(v7Signature(attempts(result.world))).toBe(v7Signature(attempts(idle)));
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action, who = 'wren') {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.success).toBe(true);
  return {
    world: r.world,
    energy:
      Math.round(
        (actor(idle, who).vitals.energy - actor(r.world, who).vitals.energy) *
          1e6,
      ) / 1e6,
  };
}

describe('ex21 small-combustion-source@1', () => {
  it('declares a scoped package with study 4, bounded text and no excluded words', () => {
    const pkg = V7_PACKAGES.find((p) => p.id === PKG);
    const ability = pkg?.abilities[0];
    if (!pkg || !ability) throw new Error('Missing package.');
    expect(pkg.scope).toBe('long-ex21');
    expect(pkg.version).toBe(1);
    expect(pkg.abilities).toHaveLength(1);
    expect(ability.id).toBe(ID);
    expect(ability.revision).toBe(`${PKG}@1`);
    expect(ability.learning).toBe(4);
    expect(ability.learningEnergy).toBeUndefined();
    expect(ability.references).toEqual({ target: 'optional-exact-visible' });
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(3500);
    expect(pkg.visualComponents).toEqual([]);
    expect(pkg.satisfaction).toEqual([]);
    const handlers = V7_PACKAGES.flatMap((p) => Object.keys(p.handlers));
    expect(handlers.filter((h) => h === ability.handler)).toHaveLength(1);
    const visible = JSON.stringify({
      abilities: pkg.abilities,
      events: pkg.events ?? [],
    });
    expect(CULTURE_EXCLUDED_WORDS.test(visible)).toBe(false);
    expect(EXTRA_EXCLUDED.test(visible)).toBe(false);
    const w = installed();
    expect(w.revisions.at(-1)).toBe(`${PKG}@1`);
    expect(w.abilities.find((a) => a.id === ID)?.learning).toBe(4);
    // local-fire@1 is not part of this experiment: unscoped and dependent on active-warming@1.
    const genesis = initialLongWorld('long-ex21', 'long-culture-v2-oldgoal', {
      seed: 20261202,
      development: 8,
      tokens: 1500000,
    });
    expect(() =>
      v7Install(genesis, continuousRegistry(genesis), 'local-fire@1'),
    ).toThrow(/Missing, duplicate or dependency-incomplete/);
    expect(() =>
      v7Install(genesis, v7Registry(V7_PACKAGES), 'local-fire@1'),
    ).toThrow(/not approved for the current experiment scope/);
  });

  it('refuses food, unsuitable sites and incomplete requests without spending', () => {
    const f = setup();
    let w = f.w;
    actor(w).position = { ...ROOT_STAND };
    w = step(w, { wren: gather(ROOTS, 1) }).world;
    const root = owned(w, 'wren', 'root')[0];
    if (!root) throw new Error('Missing roots.');
    actor(w).position = { ...STAND };
    w = fed(w);
    expect(unchanged(w, lay(SITE, [root.id], [f.grass]))).toMatch(/food/);
    expect(unchanged(w, lay(SITE, [f.clay], []))).toMatch(/fuel value/);
    expect(unchanged(w, lay(SITE, [], [f.branch]))).toMatch(/not fine tinder/);
    expect(unchanged(w, mode('tend', { ...SITE }))).toMatch(/Name fuel/);
    expect(unchanged(w, lay(BANK, [f.branch], [f.grass]))).toMatch(
      /firm ground/,
    );
    expect(unchanged(w, lay(STAND, [f.branch], [f.grass]))).toMatch(
      /stand on the bed footprint/,
    );
    expect(unchanged(w, lay(FAR, [f.branch], [f.grass]))).toMatch(/reach/);
    expect(unchanged(w, lay(SITE, [f.branch], [f.grass], 2))).toMatch(
      /holds 1.6 kg/,
    );
    expect(beds(w)).toHaveLength(0);
  });

  it('lays a real bed for 0.5 energy and inspects it through probe for 0.2', () => {
    const f = setup();
    const branch0 = stack(f.w, f.branch).quantity,
      grass0 = stack(f.w, f.grass).quantity;
    const laidStep = cost(f.w, lay(SITE, [f.branch], [f.grass]));
    expect(laidStep.energy).toBe(0.5);
    let w = laidStep.world;
    const o = beds(w)[0];
    if (!o) throw new Error('Missing bed.');
    expect(o.spatial.shape).toEqual({ kind: 'circle', radius: 0.2 });
    expect(o.spatial.solid).toBe(false);
    expect(o.spatial.interaction).toBe(0.65);
    expect(stack(w, f.branch).quantity).toBe(branch0 - 0.5);
    expect(stack(w, f.grass).quantity).toBe(grass0 - 0.5);
    const bed = fire(w, o.id);
    expect(bed.builder).toBe('wren');
    expect(bed.lit).toBe(false);
    expect(bed.lots.map((l) => [l.resource, l.role, l.quantity])).toEqual([
      ['branch', 'fuel', 0.5],
      ['dry-grass', 'tinder', 0.5],
    ]);
    // The represented water shares: branch 0.5, dry grass 0.4.
    const shares = bed.lots.map(
      (l) => l.unitWater / (l.unitWater + l.unitSolids),
    );
    expect(shares[0]).toBeCloseTo(0.5, 9);
    expect(shares[1]).toBeCloseTo(0.4, 9);
    expect(bed.ledger.laid).toBeCloseTo(0.5 * 1.1 + 0.5 * 0.1, 8);
    expect(events(w, 'small-fire-bed-laid')).toHaveLength(1);
    expect((o.data.view as { flame: boolean }).flame).toBe(false);
    w = fed(w);
    const looked = cost(w, mode('inspect', { target: o.id }), 'moss');
    expect(looked.energy).toBe(0.2);
    const seen = events(looked.world, 'small-fire-inspected').at(-1)?.data
      .observation as Record<string, unknown>;
    expect(seen.state).toBe('laid');
    expect(seen.ready).toBe(true);
    expect(seen.exposed).toEqual({ radius: 0.45, items: [], objects: [] });
    expect(
      events(looked.world, 'trial-result').some(
        (e) => e.actor === 'moss' && e.target === 'small-combustion-source',
      ),
    ).toBe(true);
  });

  it('requires an inspection, a held way to put it out and suitable pieces before any charge', () => {
    const f = setup();
    let w = step(f.w, { wren: lay(SITE, [f.branch], [f.grass]) }).world;
    const bed = beds(w)[0]?.id ?? '';
    w = fed(w);
    expect(unchanged(w, rub(bed, [f.branch, f.branch], [f.clay]))).toMatch(
      /Inspect the bed/,
    );
    w = fed(step(w, { wren: mode('inspect', { target: bed }) }).world);
    expect(unchanged(w, rub(bed, [f.branch, f.branch], []))).toMatch(
      /extinguishingItemIds/,
    );
    // One clay unit is 1.5 kg, less than the 2.01 kg that covers the bed.
    const one = step(w, {
      wren: { interface: 'drop', args: { target: f.clay, quantity: 1 } },
    }).world;
    expect(
      unchanged(fed(one), rub(bed, [f.branch, f.branch], [f.clay])),
    ).toMatch(/needs 2.01 kg/);
    expect(unchanged(w, rub(bed, [f.branch], [f.clay]))).toMatch(
      /rubbing piece, then the base/,
    );
    expect(unchanged(w, rub(bed, [f.clay, f.branch], [f.clay]))).toMatch(
      /stone gives no sparks/,
    );
    let willow = step(w, { wren: gather(WILLOW, 1) }).world;
    const piece = owned(willow, 'wren', 'willow')[0]?.id ?? '';
    willow = fed(willow);
    expect(unchanged(willow, rub(bed, [piece, f.branch], [f.clay]))).toMatch(
      /bends/,
    );
    // Only the builder may light or feed the bed; Moss holds his own branch and clay.
    expect(
      unchanged(
        w,
        rub(bed, [f.mossBranch, f.mossBranch], [f.mossClay]),
        'moss',
      ),
    ).toMatch(/Only the person who laid this bed/);
    expect(
      unchanged(
        w,
        mode('tend', {
          target: bed,
          fuelItemIds: [f.mossBranch],
          quantity: 0.5,
        }),
        'moss',
      ),
    ).toMatch(/Only the person who laid this bed/);
    expect(
      unchanged(
        w,
        mode('extinguish', { target: bed, extinguishingItemIds: [f.mossClay] }),
        'moss',
      ),
    ).toMatch(/Nothing is burning or hot/);
  });

  it('fails with the represented wet branches and keeps the real costs, wear and dust', () => {
    const f = laid(false);
    let w = f.w;
    const mass0 = stack(w, f.branch).quantity * 1.1;
    const action = rub(f.bed, [f.branch, f.branch], [f.clay], 3);
    let spent = 0;
    const worked: { waterShare: number; dryness: number; peak: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const r = cost(w, action);
      spent += r.energy;
      w = fed(r.world);
      worked.push(
        ...events(w, 'small-fire-friction-worked').map(
          (e) =>
            e.data.measured as {
              waterShare: number;
              dryness: number;
              peak: number;
            },
        ),
      );
    }
    expect(spent).toBe(3);
    expect(worked).toHaveLength(3);
    expect(worked.every((m) => m.waterShare === 0.5 && m.dryness === 0)).toBe(
      true,
    );
    expect(Math.max(...worked.map((m) => m.peak))).toBeLessThan(350);
    expect(events(w, 'small-fire-ember-formed')).toHaveLength(0);
    expect(events(w, 'small-fire-ignition-failed').at(-1)?.description).toMatch(
      /water share 0.5/,
    );
    const bed = fire(w, f.bed);
    expect(bed.lit).toBe(false);
    expect(bed.failures).toBe(1);
    expect(
      (object(w, f.bed).data.view as { state: string; flame: boolean }).flame,
    ).toBe(false);
    // Worn pieces come back: each worn round removes 0.5 g from the rubbing piece and 1.5 g from
    // the base; the worn solids stay as dust in the bed and the worn water leaves as vapour.
    const j = attempts(w).at(-1);
    if (!j) throw new Error('Missing attempt.');
    expect(j.status).toBe('failed');
    expect(j.paidEnergy).toBe(3);
    const pieces = j.escrow.map((id) => stack(w, id));
    expect(pieces.every((s) => s.owner === 'wren' && !s.reservedFor)).toBe(
      true,
    );
    const worn = j.wear.reduce((n, x) => n + x.worn, 0);
    expect(worn).toBeCloseTo(3 * 0.002, 9);
    expect(j.dust + j.vapour).toBeCloseTo(worn, 9);
    expect(bed.ledger.dust).toBeCloseTo(j.dust, 9);
    const groove = pieces[1]?.processing?.smallFireFriction as Record<
      string,
      number
    >;
    expect(groove.groove).toBe(4.5);
    const after = owned(w, 'wren', 'branch').reduce(
      (n, s) =>
        n +
        s.quantity * 1.1 -
        ((s.processing?.smallFireFriction as { worn?: number } | undefined)
          ?.worn ?? 0),
      0,
    );
    expect(after + worn).toBeCloseTo(mass0, 9);
  });

  it('fails when too little work reaches the contact, even with dry pieces', () => {
    const f = laid(true);
    const r = cost(f.w, rub(f.bed, [f.branch, f.branch], [f.clay], 1));
    expect(r.energy).toBe(1);
    const measured = events(r.world, 'small-fire-friction-worked').at(-1)?.data
      .measured as Record<string, number>;
    expect(measured.peak).toBeGreaterThan(100);
    expect(measured.peak).toBeLessThan(350);
    expect(fire(r.world, f.bed).lit).toBe(false);
    expect(events(r.world, 'small-fire-ignition-failed')).toHaveLength(1);
  });

  it('lights dry tinder by friction and burns its present fuel unattended until it runs out', () => {
    const f = lit();
    let w = f.w;
    expect(events(w, 'small-fire-ember-formed')).toHaveLength(1);
    expect(events(w, 'small-fire-ignited')).toHaveLength(1);
    const j = attempts(w).at(-1);
    expect(j?.status).toBe('completed');
    expect(j?.paidEnergy).toBe(2);
    expect(j?.escrow.every((id) => stack(w, id).owner === 'wren')).toBe(true);
    expect((object(w, f.bed).data.view as { flame: boolean }).flame).toBe(true);
    // Wren walks away; the bed keeps burning without anyone.
    actor(w).position = { ...FAR };
    actor(w, 'moss').position = { x: FAR.x + 1, y: FAR.y };
    let before = lotMass(fire(w, f.bed));
    let rounds = 0;
    while (fire(w, f.bed).lit && rounds < 20) {
      w = fed(step(w).world);
      rounds++;
      const now = fire(w, f.bed);
      if (now.burnFraction > 0) {
        expect(lotMass(now)).toBeLessThan(before);
        expect(events(w, 'small-fire-burned')).toHaveLength(1);
      }
      before = lotMass(now);
    }
    const bed = fire(w, f.bed);
    expect(bed.lit).toBe(false);
    expect(bed.lots).toEqual([]);
    expect(events(w, 'small-fire-flame-out')).toHaveLength(1);
    // Mass: everything that entered the bed left as burned solids (ash and exhaust) or vapour.
    const l = bed.ledger;
    expect(l.burned).toBeGreaterThan(0.3);
    expect(l.ash + l.exhaust).toBeCloseTo(l.burned, 7);
    expect(l.ash).toBeCloseTo(0.1 * l.burned, 7);
    expect(l.laid + l.caught + l.rain + l.ember).toBeCloseTo(
      lotMass(bed) + l.burned + l.vapour + l.brands,
      7,
    );
    // Heat: 0.5 branch (8 units) and 0.5 dry grass (4 units) at 2 MJ per fuel unit.
    const h = bed.heat;
    expect(h.released).toBeCloseTo(12e6, -3);
    expect(h.vapour + h.bed + h.actors + h.environment + bed.pool).toBeCloseTo(
      h.released,
      -1,
    );
  });

  it('delivers heat that nearby people and probes actually receive', () => {
    const f = lit();
    const w = f.w;
    // Counterfactual: the same round without the bed.
    const none = v7Clone(w);
    none.objects = none.objects.filter((o) => o.id !== f.bed);
    const withFire = step(w).world,
      without = step(none).world;
    const received = events(withFire, 'small-fire-heat-received').find(
      (e) => e.actor === 'moss',
    );
    const gain = Number(received?.data.gain);
    expect(gain).toBeGreaterThan(0.2);
    expect(
      actor(withFire, 'moss').vitals.temperature -
        actor(without, 'moss').vitals.temperature,
    ).toBeCloseTo(gain, 6);
    expect(fire(withFire, f.bed).heat.actors).toBeGreaterThan(0);
    // Wren's probe heat trial in reach draws 0.1 MJ from the stored bed heat; without the bed it
    // fails as before.
    const heated = fed(withFire);
    expect(Number(object(heated, f.bed).data.availableHeat)).toBeGreaterThan(
      0.1,
    );
    const probe: V7Action = {
      interface: 'probe',
      args: { target: f.grass, mode: 'heat', intensity: 0.5 },
    };
    const tried = step(heated, { wren: probe });
    expect(tried.outcomes.wren?.success).toBe(true);
    expect(fire(tried.world, f.bed).heat.probes).toBeCloseTo(1e5, 0);
    const cold = v7Clone(heated);
    cold.objects = cold.objects.filter((o) => o.id !== f.bed);
    const refused = step(cold, { wren: probe });
    expect(refused.outcomes.wren?.success).toBe(false);
    expect(refused.outcomes.wren?.reason).toMatch(
      /No actual available heat source/,
    );
  });

  it('is smothered by anyone with enough clay, reads the residual heat and cools to verified cold', () => {
    const f = lit();
    let w = fed(step(f.w).world);
    const clay0 = stack(w, f.mossClay).quantity;
    const fuelLeft = lotMass(fire(w, f.bed));
    expect(fuelLeft).toBeGreaterThan(0);
    const put = cost(
      w,
      mode('extinguish', { target: f.bed, extinguishingItemIds: [f.mossClay] }),
      'moss',
    );
    expect(put.energy).toBe(0.5);
    w = fed(put.world);
    // 1.4 clay units (2.1 kg) cover the 0.2 m bed 1 cm deep.
    expect(stack(w, f.mossClay).quantity).toBeCloseTo(clay0 - 1.4, 9);
    const out = events(w, 'small-fire-smothered').at(-1)?.data as Record<
      string,
      unknown
    >;
    expect(out.combustionAbsent).toBe(true);
    expect(out.wasBurning).toBe(true);
    expect(Number(out.residualTemperature)).toBeGreaterThan(Number(out.air));
    let bed = fire(w, f.bed);
    expect(bed.covered).toBe(true);
    expect(bed.lit).toBe(false);
    expect(bed.covers.reduce((n, c) => n + c.mass, 0)).toBeCloseTo(2.1, 9);
    expect(lotMass(bed)).toBeCloseTo(fuelLeft, 9);
    // Nothing burns under the cover; the bed cools by the ordinary loss and is verified cold.
    for (let i = 0; i < 12; i++) w = fed(step(w).world);
    bed = fire(w, f.bed);
    expect(events(w, 'small-fire-burned')).toHaveLength(0);
    expect(lotMass(bed)).toBeCloseTo(fuelLeft, 9);
    expect(bed.bed - bed.air).toBeLessThan(5);
    expect(
      unchanged(
        w,
        mode('extinguish', { target: f.bed, extinguishingItemIds: [f.clay] }),
      ),
    ).toMatch(/already smothered/);
    w = step(w, { wren: mode('inspect', { target: f.bed }) }).world;
    expect(events(w, 'small-fire-cooled')).toHaveLength(1);
    expect((object(w, f.bed).data.view as { state: string }).state).toBe(
      'cold-residue',
    );
  });

  it('catches exposed fuel, burns a body on the bed and keeps burning after death', () => {
    const f = lit();
    let w = f.w;
    // Moss drops his branch 0.43 m from the centre, inside the 0.45 m exposure radius.
    actor(w, 'moss').position = { ...RIM };
    const dropped = step(w, {
      moss: { interface: 'drop', args: { target: f.mossBranch, quantity: 1 } },
    });
    expect(dropped.outcomes.moss?.success).toBe(true);
    w = fed(dropped.world);
    const spread = events(w, 'small-fire-spread').at(-1)?.data;
    const caught = (spread?.items as string[] | undefined) ?? [];
    expect(caught).toHaveLength(1);
    expect(owned(w, 'moss', 'branch')).toHaveLength(0);
    expect(
      w.stacks.some((s) => s.resource === 'branch' && s.owner === null),
    ).toBe(false);
    expect(fire(w, f.bed).lots.some((l) => l.item === caught[0])).toBe(true);
    expect(fire(w, f.bed).ledger.caught).toBeCloseTo(1.1, 9);
    // Moss steps onto the burning bed and is burned under the contact rule.
    actor(w, 'moss').position = { ...SITE };
    const health = actor(w, 'moss').vitals.health;
    w = step(w).world;
    const burned = events(w, 'small-fire-actor-burned').find(
      (e) => e.actor === 'moss',
    );
    expect(Number(burned?.data.loss)).toBeGreaterThan(0);
    expect(actor(w, 'moss').vitals.health).toBeLessThan(health);
    expect(events(w, 'injured').some((e) => e.actor === 'moss')).toBe(true);
    // Wren, weakened, steps onto it and dies; the fire keeps burning.
    actor(w, 'moss').position = { ...MOSS_STAND };
    actor(w).position = { ...SITE };
    actor(w).vitals.health = 2;
    w = step(w).world;
    expect(events(w, 'died').some((e) => e.actor === 'wren')).toBe(true);
    expect(fire(w, f.bed).lit).toBe(true);
    w = step(fed(w)).world;
    expect(fire(w, f.bed).lit).toBe(true);
    expect(events(w, 'small-fire-burned')).toHaveLength(1);
  });

  it('lights a second bed from a brand of a burning bed and fails on the represented wet tinder', () => {
    const f = lit();
    let w = f.w;
    // A second bed of air-dried tinder and branch 0.75 m from the burning one.
    w = fed(step(w, { wren: lay(SITE2, [f.branch], [f.grass]) }).world);
    const second = beds(w).find((o) => o.id !== f.bed)?.id ?? '';
    w = fed(step(w, { wren: mode('inspect', { target: second }) }).world);
    const hot = mode('attempt-ignition', {
      target: second,
      ignitionMode: 'hot-target',
      extinguishingItemIds: [f.clay],
    });
    const donor = lotMass(fire(w, f.bed));
    const r = cost(w, hot);
    expect(r.energy).toBe(0.5);
    w = r.world;
    expect(fire(w, second).lit).toBe(true);
    const brand = events(w, 'small-fire-ignited').at(-1)?.data
      .hotTarget as Record<string, unknown>;
    expect(brand.kind).toBe('brand');
    expect(brand.from).toBe(f.bed);
    expect(fire(w, f.bed).ledger.brands).toBeCloseTo(Number(brand.mass), 9);
    expect(lotMass(fire(w, f.bed))).toBeLessThan(donor);
    // The same with the represented ex21 dry grass (water share 0.4): the tinder does not take it.
    const g = lit();
    let v = g.w;
    actor(v).position = { ...GRASS_STAND };
    v = fed(step(v, { wren: gather(GRASS, 1) }).world);
    const wet =
      owned(v, 'wren', 'dry-grass').find((s) => !s.physical)?.id ?? '';
    actor(v).position = { ...STAND };
    v = fed(step(v, { wren: lay(SITE2, [g.branch], [wet]) }).world);
    const other = beds(v).find((o) => o.id !== g.bed)?.id ?? '';
    v = fed(step(v, { wren: mode('inspect', { target: other }) }).world);
    expect(fire(v, g.bed).lit).toBe(true);
    const failed = cost(v, { ...hot, args: { ...hot.args, target: other } });
    expect(failed.energy).toBe(0.5);
    expect(fire(failed.world, other).lit).toBe(false);
    expect(
      events(failed.world, 'small-fire-ignition-failed').at(-1)?.description,
    ).toMatch(/water share 0.4/);
    // No hot target at all: nothing is spent.
    const coldBed = laid(true);
    expect(
      unchanged(coldBed.w, {
        ...hot,
        args: { ...hot.args, target: coldBed.bed },
      }),
    ).toMatch(/No hot physical target/);
  });

  it('ends an unworked attempt and drops the pieces where the performer dies', () => {
    const f = laid(false);
    const w = step(f.w, {
      wren: rub(f.bed, [f.branch, f.branch], [f.clay]),
    }).world;
    const j = attempts(w).at(-1);
    if (!j) throw new Error('Missing attempt.');
    expect(j.status).toBe('active');
    expect(j.escrow.every((id) => stack(w, id).reservedFor === j.id)).toBe(
      true,
    );
    const ended = step(fed(w)).world;
    expect(attempts(ended).at(-1)?.status).toBe('interrupted');
    expect(events(ended, 'small-fire-friction-ended')).toHaveLength(1);
    expect(
      j.escrow.every((id) => {
        const s = stack(ended, id);
        return s.owner === 'wren' && !s.reservedFor;
      }),
    ).toBe(true);
    // Death during an open attempt leaves the pieces on the ground where Wren died.
    const pkg = continuousRegistry(w).packages.find((p) => p.id === PKG);
    const dead = v7Clone(w);
    pkg?.onDeath?.(dead, actor(dead));
    expect(attempts(dead).at(-1)?.status).toBe('interrupted');
    expect(j.escrow.every((id) => stack(dead, id).owner === null)).toBe(true);
  });
});
