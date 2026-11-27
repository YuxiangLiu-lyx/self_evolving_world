import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  forestClimate,
  shelterMeasure,
  v7Clone,
  v7Install,
  v7Signature,
  v7Step,
  weatherShelterExposure,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Data,
  V7Event,
  V7Object,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';
import { CONTINUOUS_VISUALS } from '../../viewer/src/continuous-visuals.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 120_000 });

const id = 'construct-weather-shelter';
const KIND = 'thatched-weather-shelter';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition|history/i;
/** Package ids the brief reserves for earlier work, and every existing shelter package. */
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
  'prepare-ventilated-food-storage',
  'simple-shelter',
  'shared-shelter',
  'shelter-construction',
  'resting-shelter',
  'shelter-reference-diagnostics',
  'shelter-material-metrology',
  'short-material-refuge',
  'short-refuge-trial-diagnostics',
  'weather-lean-to',
];
/** sha256 of JSON.stringify of the map from id@version to the sha256 of JSON.stringify of each
 * of the 119 packages registered before this change, in registration order (the scratch hash
 * file validation-results/scratch/ex24/hashes-before-2.json, taken before this change). */
const EXISTING_DIGEST =
  'f6a25ec932e8822d901d10ae69a3cc97c198c0578e6cb46017cb6224ff6dd621';
/** sha256 of JSON.stringify of each reused package, taken before this change. */
const REUSED: Record<string, string> = {
  'foundation-forest@1':
    '54094fb4230e6a50ffaeec27771a3d4345987b2e6f03161a5cf61f9f5c36de7b',
  'foundation-open@1':
    'c2cc0c70d608bd5f5e60b81671ee99a73c8bfa1304ad88faed1342d59cb5f6fe',
  'resting-shelter@1':
    'f59e7a5669b3339ce2997d6b95ddd0b85c55283eebf541e78a17dd094fe604e1',
  'simple-shelter@1':
    '7ac02d6ac8e126a66569faa91f788dd5a48e2cc88047d7db80f053f76ea2d2be',
  'shared-shelter@1':
    'facf3246dc69220a59e143fbbb2847122b78575444540cfce2f878f6a3ec973a',
  'branch-screen@1':
    'f2b0aeecfcc131c670181a8d1c19a3e0f49e32ff4d1924dfc3280dca3571960f',
  'hand-weave-fiber-mat@1':
    'bd2793b29fa195e80980db089238fbc0b7f7f99221e0a16fbd78ec12ac94da58',
  'hand-twist-fiber-cord@1':
    '93f677501cd4fc39362b8d401a92182e1db51af61426e1b39768d52ccfde089b',
  'lever-mass-comparator@1':
    '888531bb0cd81a57b01d5572d97ef7a5f4f9cc149ffb945efc12414458f2571f',
  'small-combustion-source@1':
    '88baf2ffeb6b0d808e0689e4c200cdb0083ba6ebff605ef89b6c903e26f88eb8',
  'prepare-ventilated-food-storage@1':
    '7bf073bb43944714fb3a7a759b25f259e1df3d5e84d02a8609ec87a72a488713',
};
/** The shelter site on forest floor (orientation 0: the open end faces world -y), Kai's working
 * stand beside it, a point in front of the open end, the floor centre and a side point. */
const SITE = { x: 13.5, y: 14.5 };
const STAND = { x: 14.35, y: 14.5 };
const FRONT = { x: 13.5, y: 13.2 };
const FLOOR = { x: 13.5, y: 14.5 };
const SIDE = { x: 14.35, y: 14.4 };
/** Where the other five wait, clear of the site. */
const PARK: Record<string, { x: number; y: number }> = {
  lin: { x: 17, y: 9 },
  moss: { x: 17.6, y: 9 },
  sol: { x: 18.2, y: 9 },
  wren: { x: 18.8, y: 9 },
  ivo: { x: 19.4, y: 9 },
};
/** World times of a rainy, nearly calm round and of a dry, windy round of this seed. */
const RAINY = 60;
const DRY = 140;
/** The ex21 rod of one 1.1 kg branch unit: 900 kg/m3, 25 diameters. */
const r8 = (x: number) => Math.round(x * 1e8) / 1e8;
const ROD_EXACT = Math.cbrt((4 * (1.1 / 900)) / (Math.PI * 25));
const ROD = r8(ROD_EXACT);
const ROD_LENGTH = r8(ROD_EXACT * 25);

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
const actor = (w: V7World, name = 'kai'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === type);
const data = (w: V7World, type: string) =>
  events(w, type).at(-1)?.data as Record<string, unknown> | undefined;
const own = (w: V7World, res: string, who = 'kai') =>
  w.stacks.filter((s) => s.owner === who && s.resource === res);
const shelter = (w: V7World): V7Object => {
  const o = w.objects.find((o) => o.kind === KIND);
  if (!o) throw new Error('Missing shelter.');
  return o;
};
const view = (o: V7Object) => o.data.view as Record<string, unknown>;
type Part = {
  id: string;
  resource: string;
  origin: string;
  quantity: number;
  slot: string;
  condition: number;
  mass: number;
  length: number;
};
const parts = (o: V7Object, key: string) => o.data[key] as unknown as Part[];
type Panel = {
  id: string;
  volume: number;
  installed: number;
  condition: number;
  lots: Part[];
};
const panels = (o: V7Object) => o.data.panels as unknown as Panel[];
type Work = {
  id: string;
  mode: string;
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
const tenths = (stacks: { quantity: number }[]) =>
  stacks.reduce((n, s) => n + Math.round(s.quantity * 10), 0);
/** Keep everyone fed and rested so the tests isolate the operation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
const at = (w: V7World, p: { x: number; y: number }, who = 'kai') => {
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
  const w = v7Clone(v7Install(g, continuousRegistry(g), `${id}@1`));
  for (const a of w.actors) a.position = { ...(PARK[a.id] ?? a.position) };
  return fed(w);
}
const learn = (w: V7World, who = 'kai') => {
  let s = step(w, {
    [who]: { interface: 'learn', args: { ability: id } },
  }).world;
  for (let i = 0; i < 3; i++) s = step(s).world;
  expect(actor(s, who).mastered).toContain(id);
  return fed(s);
};
/** The action fails and changes no vitals, stacks, works, shelters or hidden records. */
function unchanged(w: V7World, action: V7Action, who = 'kai') {
  const result = step(w, { [who]: action }),
    idle = step(w).world,
    hidden = (x: V7World) =>
      Object.entries(x.state).filter(([k]) => k.startsWith('collective:work:'));
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  expect(v7Signature(hidden(result.world))).toBe(v7Signature(hidden(idle)));
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action, who = 'kai') {
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
/** Dried reed lots stand in for covering and bedding: this world holds no dry thin stems with a
 * represented stem law (see the shortfall test), so the mechanism is shown on supplied lots. */
function dried(w: V7World, item: string, n: number, who = 'kai'): V7Stack {
  const s: V7Stack = {
    id: item,
    resource: 'reed',
    quantity: n,
    quantityTenths: n * 10,
    position: { ...actor(w, who).position },
    owner: who,
    origin: 'forest-reed-0',
    harvestedAt: 0,
    decay: 0,
    physical: { unitMass: 0.25, unitWater: 0.025, unitSolids: 0.225 },
  };
  w.stacks.push(s);
  return s;
}
function gather(
  w: V7World,
  target: string,
  p: { x: number; y: number },
  n: number,
) {
  const r = step(at(w, p), {
    kai: { interface: 'gather', args: { target, quantity: n } },
  });
  expect(r.outcomes.kai?.success, r.outcomes.kai?.reason).toBe(true);
  return r.world;
}
const materials = (w: V7World) => [
  ...own(w, 'branch').map((s) => ({
    itemId: s.id,
    quantity: s.quantity,
    role: 'rod',
  })),
  ...own(w, 'vine').map((s) => ({
    itemId: s.id,
    quantity: s.quantity,
    role: 'binding',
  })),
  { itemId: 'item-dried-reed-cover', quantity: 90, role: 'thatch' },
  { itemId: 'item-dried-reed-bed', quantity: 25, role: 'bedding' },
];
const build = (mats: unknown[], extra: Record<string, unknown> = {}) =>
  act('build', { ...SITE, orientation: 0, materials: mats, ...extra });

/** Kai studies, gathers the 20 branch units the World Agent named and 10 vines, receives dried
 * reed lots, and builds the shelter over ten paid rounds. */
let cache: {
  ready: V7World;
  mats: unknown[];
  stages: V7World[];
  spent: number[];
  log: V7Event[];
} | null = null;
function fixture() {
  if (!cache) {
    let w = learn(at(installed(), STAND));
    w = gather(w, 'forest-branch-0', { x: 17.2, y: 12.65 }, 9);
    w = gather(w, 'start-2-branches', { x: 16.5, y: 19.75 }, 9);
    w = gather(w, 'canopy-41', { x: 11.4, y: 18.55 }, 2);
    w = gather(w, 'forest-vine-1', { x: 8.2, y: 12.8 }, 10);
    const ready = at(w, STAND);
    dried(ready, 'item-dried-reed-cover', 90);
    dried(ready, 'item-dried-reed-bed', 25);
    const mats = materials(ready);
    const stages: V7World[] = [],
      spent: number[] = [],
      log: V7Event[] = [];
    let s = ready;
    for (let i = 0; i < 10; i++) {
      const c = cost(s, build(mats, i ? { shelter: shelter(s).id } : {}));
      spent.push(c.energy);
      log.push(...c.world.events);
      s = fed(c.world);
      stages.push(s);
    }
    cache = { ready, mats, stages, spent, log };
  }
  return cache;
}
const done = () => {
  const f = fixture();
  const w = f.stages.at(-1);
  if (!w) throw new Error('Missing build.');
  return v7Clone(w);
};
/** Kai walks in through the open end: one round in front of it, then onto the floor. */
function inside(w: V7World, floor = FLOOR, who = 'kai') {
  const front = step(at(w, FRONT, who)).world;
  return step(at(front, floor, who)).world;
}
const visibleText = (log: V7Event[]) =>
  JSON.stringify(log.map((e) => [e.type, e.description, e.data]));

describe('construct and maintain a small weather shelter in ex24', () => {
  it('is scoped to ex24, registered last, learned in four rounds, within the size limit, and leaves every existing package byte-identical', () => {
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
    // The second ex24 package; later ex24 packages follow it.
    expect(V7_PACKAGES.filter((p) => p.scope === 'long-ex24')[1]).toBe(pkg);
    expect(
      continuousRegistry(g)
        .packages.filter((p) => !p.id.startsWith('foundation-'))
        .map((p) => p.id)
        .slice(0, 2),
    ).toEqual(['prepare-ventilated-food-storage', id]);
    expect(pkg).toMatchObject({
      scope: 'long-ex24',
      version: 1,
      dependencies: ['foundation-open@1'],
      visualComponents: [KIND],
      satisfaction: [],
      processes: {},
    });
    for (const c of pkg.visualComponents)
      expect(typeof CONTINUOUS_VISUALS[c]).toBe('function');
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 4,
      revision: `${id}@1`,
      handler: `long.${id}`,
      authored: false,
      practiceEvidence: 'weather-shelter-completed',
      references: { shelter: 'optional-exact-visible' },
    });
    expect(ability.parameters.properties?.mode).toMatchObject({
      enum: ['inspect', 'build', 'repair', 'dismantle', 'cancel'],
    });
    expect(ability.parameters.required).toEqual(['mode']);
    // New package, ability, handler, equivalence, event and drawing names.
    expect(TAKEN).not.toContain(id);
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(ability.id);
        expect(a.equivalence).not.toBe(ability.equivalence);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? [])
        expect(e).not.toMatch(/^weather-shelter-/);
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
    const existing = V7_PACKAGES.slice(0, V7_PACKAGES.indexOf(pkg));
    expect(existing).toHaveLength(119);
    const map = Object.fromEntries(
      existing.map((p) => [`${p.id}@${String(p.version)}`, sha(p)]),
    );
    expect(sha(map)).toBe(EXISTING_DIGEST);
    for (const [key, hash] of Object.entries(REUSED))
      expect(map[key]).toBe(hash);
    // Unstudied use is refused at no cost; four study rounds master it.
    const fresh = at(installed(), STAND);
    expect(unchanged(fresh, act('inspect', SITE))).toMatch(
      /master|learn|stud/i,
    );
    let s = step(fresh, {
      kai: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(actor(s).learning).toMatchObject({ ability: id, remaining: 3 });
    for (let i = 0; i < 2; i++) {
      s = step(s).world;
      expect(actor(s).mastered).not.toContain(id);
    }
    s = step(s).world;
    expect(actor(s).mastered).toContain(id);
  });

  it('refuses a measured shortfall before any cost: Kai owns no building material, dry grass has no stem law, raw reeds are wet', () => {
    const w = learn(at(installed(), STAND));
    // Kai's request: no materials at all.
    const none = unchanged(w, act('build', SITE));
    expect(none).toContain('rods: 0 of 20 suitable rods named');
    expect(none).toContain('binding: 0 of 30 m of suitable strand named');
    expect(none).toContain('covering: 0 of 0.26 m3');
    expect(none).toContain('bedding: 0 of 0.1 m3');
    expect(none).toMatch(/Nothing was spent\.$/);
    // Real gathered dry grass and raw reeds, 19 branch units and 9 vines.
    let g = gather(w, 'forest-dry-grass-0', { x: 14.2, y: 15.8 }, 8);
    g = gather(g, 'forest-branch-0', { x: 17.2, y: 12.65 }, 9);
    g = gather(g, 'start-2-branches', { x: 16.5, y: 19.75 }, 9);
    g = gather(g, 'canopy-41', { x: 11.4, y: 18.55 }, 1);
    g = gather(g, 'forest-vine-1', { x: 8.2, y: 12.8 }, 9);
    g = at(g, STAND);
    const raw: V7Stack = {
      id: 'item-raw-reed',
      resource: 'reed',
      quantity: 30,
      quantityTenths: 300,
      position: { ...actor(g).position },
      owner: 'kai',
      origin: 'forest-reed-0',
      harvestedAt: 0,
      decay: 0,
    };
    const willow: V7Stack = {
      ...raw,
      id: 'item-willow',
      resource: 'willow',
      quantity: 1,
      quantityTenths: 10,
      origin: 'forest-willow-0',
    };
    g.stacks.push(raw, willow);
    const grass = own(g, 'dry-grass')[0],
      berries: V7Stack = {
        ...raw,
        id: 'item-berries',
        resource: 'berry',
        quantity: 2,
        quantityTenths: 20,
        origin: 'forest-berry-1',
      };
    g.stacks.push(berries);
    if (!grass) throw new Error('Missing grass.');
    const mats = [
      ...own(g, 'branch').map((s) => ({
        itemId: s.id,
        quantity: s.quantity,
        role: 'rod',
      })),
      ...own(g, 'vine').map((s) => ({
        itemId: s.id,
        quantity: s.quantity,
        role: 'binding',
      })),
      { itemId: grass.id, quantity: 8, role: 'thatch' },
      { itemId: 'item-raw-reed', quantity: 30, role: 'bedding' },
      { itemId: 'item-willow', quantity: 1, role: 'rod' },
      { itemId: 'item-berries', quantity: 2, role: 'rod' },
    ];
    const reason = unchanged(g, build(mats));
    expect(reason).toContain(
      `${grass.id}: dry-grass stem length and solid density are not represented`,
    );
    expect(reason).toContain(
      'item-raw-reed: reed is not dry (water share 0.9; at most 0.4)',
    );
    expect(reason).toContain('item-willow: willow bends too easily');
    expect(reason).toContain('item-berries: berry is not a wood rod');
    expect(reason).toContain('rods: 19 of 20 suitable rods named');
    expect(reason).toContain('binding: 27 of 30 m of suitable strand named');
    // Measured from records: a branch unit is the ex21 rod, 0.0396 m read as 0.04 m; a vine 3 m.
    const branch = own(g, 'branch')[0];
    if (!branch) throw new Error('Missing branch.');
    expect(shelterMeasure(g, branch).rod).toMatchObject({
      diameter: ROD,
      length: ROD_LENGTH,
      measured: 0.04,
      rigid: true,
    });
    expect(shelterMeasure(g, own(g, 'vine')[0] as V7Stack).strand?.length).toBe(
      3,
    );
    expect(shelterMeasure(g, grass).stem).toBeNull();
    expect(shelterMeasure(g, raw).waterShare).toBe(0.9);
    // Even read with the reed law, all 16 dry-grass units of the world give 0.0128 m3 of covering.
    expect((16 * 0.1 * 0.6) / 500 / 0.15).toBeCloseTo(0.0128, 6);
    // The paid inspection reports the same shortfall for 1 round and 1 energy and reserves nothing.
    const look = cost(g, act('inspect', { ...SITE, materials: mats }));
    expect(look.energy).toBe(1);
    const finding = data(look.world, 'weather-shelter-inspected');
    expect(finding?.suitable).toBe(false);
    expect((finding?.problems as string[]).join(';')).toContain(
      'rods: 19 of 20',
    );
    expect(look.world.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(look.world.objects.some((o) => o.kind === KIND)).toBe(false);
  });

  it('pays the 1-energy inspection round and reserves nothing when the site fails', () => {
    const f = fixture();
    // A plant on the footprint: no implicit clearing.
    const plant = at(f.ready, { x: 15.05, y: 16.3 });
    const r = cost(
      plant,
      act('build', { x: 14.2, y: 16.3, materials: f.mats }),
    );
    expect(r.energy).toBe(1);
    expect(
      (data(r.world, 'weather-shelter-inspected')?.problems as string[]).join(
        ';',
      ),
    ).toMatch(/overlaps .*forest-dry-grass-0.*; clearing is not done here/);
    expect(r.world.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(r.world.objects.some((o) => o.kind === KIND)).toBe(false);
    expect(tenths(own(r.world, 'branch'))).toBe(200);
    // Another person on the footprint.
    const sol = at(f.ready, { x: 13.5, y: 14.9 }, 'sol');
    const p = cost(sol, build(f.mats));
    expect(
      (data(p.world, 'weather-shelter-inspected')?.problems as string[]).join(
        ';',
      ),
    ).toContain('a person is on the footprint');
    expect(p.world.stacks.some((s) => s.reservedFor)).toBe(false);
  });

  it('builds over ten paid rounds of 1 energy, moving exactly the reserved inputs into one shelter', () => {
    const f = fixture();
    expect(f.spent).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const first = f.stages[0] as V7World,
      o1 = shelter(first);
    expect(o1.data.status).toBe('planned');
    expect(events(first, 'weather-shelter-materials-tested')).toHaveLength(1);
    expect(data(first, 'weather-shelter-inspected')?.suitable).toBe(true);
    // The exact inputs are reserved to the work and stay carried; unneeded reed stays free.
    const job = works(first)[0];
    if (!job) throw new Error('Missing work.');
    const reserved = first.stacks.filter((s) => s.reservedFor === job.id);
    expect(reserved.every((s) => s.owner === 'kai')).toBe(true);
    expect(tenths(reserved.filter((s) => s.resource === 'branch'))).toBe(200);
    expect(tenths(reserved.filter((s) => s.resource === 'vine'))).toBe(100);
    expect(own(first, 'branch').every((s) => s.reservedFor)).toBe(true);
    const reedReserved = tenths(reserved.filter((s) => s.resource === 'reed')),
      reedFree = tenths(own(first, 'reed').filter((s) => !s.reservedFor));
    expect(reedReserved + reedFree).toBe(1150);
    // Rods and covering appear only as paid rounds build them in.
    const counts = f.stages.map((w) => ({
      rods: parts(shelter(w), 'rods').length,
      laid: panels(shelter(w)).filter((p) => p.installed > 0).length,
      status: shelter(w).data.status,
    }));
    expect(counts.map((c) => c.rods)).toEqual([
      0, 6, 12, 16, 20, 20, 20, 20, 20, 20,
    ]);
    expect(counts.map((c) => c.laid)).toEqual([0, 0, 0, 0, 0, 4, 6, 8, 9, 9]);
    expect(counts.slice(0, 9).every((c) => c.status !== 'complete')).toBe(true);
    for (const w of f.stages.slice(0, 9))
      expect(view(shelter(w)).protectionActive).toBe(false);
    const w = done(),
      o = shelter(w);
    expect(o.data.status).toBe('complete');
    expect(events(w, 'weather-shelter-completed')).toHaveLength(1);
    // Conservation: everything reserved is now a part of the one shelter; nothing is loose.
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(own(w, 'branch')).toHaveLength(0);
    expect(own(w, 'vine')).toHaveLength(0);
    const rods = parts(o, 'rods'),
      strands = parts(o, 'strands'),
      cover = panels(o).flatMap((p) => p.lots),
      bed = (o.data.bedding as { lots: Part[] }).lots;
    expect(tenths(rods)).toBe(200);
    expect(rods.reduce((n, r) => n + r.mass, 0)).toBeCloseTo(22, 6);
    expect(tenths(strands)).toBe(100);
    expect(strands.reduce((n, s) => n + s.length, 0)).toBe(30);
    expect(tenths(cover) + tenths(bed)).toBe(reedReserved);
    expect(tenths(own(w, 'reed')) + reedReserved).toBe(1150);
    expect(new Set(rods.map((r) => r.origin))).toEqual(
      new Set(['forest-branch-0', 'start-2-branches', 'canopy-41']),
    );
    // The final inspection's measured checks.
    const tests =
      (
        o.data.tests as {
          tests: { test: string; passed: boolean; measured: V7Data }[];
        }[]
      ).at(-1)?.tests ?? [];
    expect(tests.map((t) => t.passed)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(tests[1]?.measured.overlaps).toContainEqual({
      run: 'ridge',
      overlap: r8(2 * ROD_LENGTH - 1.6),
    });
    for (const p of panels(o))
      expect(p.installed).toBeGreaterThanOrEqual(p.volume);
    expect(panels(o).reduce((n, p) => n + p.volume, 0)).toBeCloseTo(0.26, 6);
    // Reusable view metadata.
    expect(view(o)).toMatchObject({
      component: KIND,
      status: 'complete',
      ridgeHeight: 0.6,
      footprint: { length: 1.6, width: 0.8 },
      entrance: { end: 'front', width: 0.8, open: true },
      work: { completed: 10, required: 10, fraction: 1 },
      coveredFraction: 1,
      bedding: { dry: true },
      occupants: 0,
      protectionActive: false,
    });
    expect(visibleText(f.log)).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visibleText(f.log)).not.toMatch(EXTRA_EXCLUDED);
  });

  it('counts one occupant who came in by the open end, by actual position, fit and capacity', () => {
    const w = done();
    // Onto the floor straight from the side: the covering is not a collision solid in this
    // world, so the body is not counted.
    const across = step(at(step(at(w, SIDE)).world, FLOOR)).world;
    expect(shelter(across).data.occupants).toEqual([]);
    expect(data(across, 'weather-shelter-entered')).toMatchObject({
      admitted: false,
    });
    // Through the open end.
    const into = inside(w);
    expect(shelter(into).data.occupants).toEqual(['kai']);
    expect(data(into, 'weather-shelter-entered')).toMatchObject({
      admitted: true,
    });
    expect(view(shelter(into))).toMatchObject({ occupants: 1 });
    // Ownership is irrelevant: Sol enters and is counted alone.
    const sol = inside(at(w, STAND), FLOOR, 'sol');
    expect(shelter(sol).data.occupants).toEqual(['sol']);
    // A second body on the one-person floor voids protection for both.
    const crowd = step(
      at(inside(at(into, { x: 13.5, y: 14.1 })), { x: 13.5, y: 14.95 }, 'sol'),
    ).world;
    const m = weatherShelterExposure(timed(crowd, RAINY), actor(crowd));
    expect(m?.withheld).toBe('more than one person on the one-person floor');
    expect(m?.avoidedChill).toBe(0);
    // Leaving the floor ends occupancy.
    const out = step(at(into, FRONT)).world;
    expect(shelter(out).data.occupants).toEqual([]);
    expect(events(out, 'weather-shelter-left')).toHaveLength(1);
  });

  it('cuts the rain and wind chill on the occupant through the gated exposure hook, halves ground-contact cooling on dry bedding, and changes nothing without the revision', () => {
    const w = inside(done());
    const rainy = timed(w, RAINY);
    actor(rainy).vitals.temperature = 25;
    const r = step(rainy).world,
      m = data(r, 'weather-shelter-exposure-measured');
    if (!m) throw new Error('No exposure measurement.');
    // The round's physiology reads the weather of the stepped time.
    const c = forestClimate(r, actor(rainy).position);
    expect(m.rain).toBe(c.rain);
    expect(m.roofCover).toBe(1);
    expect(m.rainShield).toBe(0.8);
    expect(m.windShield).toBe(0.5);
    expect(m.rainReaching).toBeCloseTo((c.rain ?? 0) * 0.2, 7);
    expect(m.avoidedChill).toBeCloseTo(
      0.6 * ((c.rain ?? 0) * 0.8 + (c.wind ?? 0) * 0.5),
      7,
    );
    expect(m.bedding).toBe(true);
    const shielded = c.temperature + Number(m.avoidedChill),
      exchange = shielded - (shielded - 25) * 0.125;
    expect(m.exchange).toBeCloseTo(exchange, 6);
    expect(m.exchange as number).toBeLessThan(25);
    // The body still cools, only more slowly; without the shelter it follows the ordinary law.
    const bare = v7Clone(rainy);
    bare.objects = bare.objects.filter((o) => o.kind !== KIND);
    const b = step(bare).world;
    expect(actor(r).vitals.temperature).toBeLessThan(25);
    expect(
      actor(r).vitals.temperature - actor(b).vitals.temperature,
    ).toBeCloseTo((exchange - c.temperature) * 0.035, 6);
    // Wet bedding gives no ground-contact cut.
    const wet = v7Clone(rainy);
    (shelter(wet).data.bedding as V7Data).held = 10;
    const wr = step(wet).world;
    expect(data(wr, 'weather-shelter-exposure-measured')).toMatchObject({
      bedding: false,
      groundCut: 0,
    });
    expect(events(wr, 'weather-shelter-bedding-wet')).toHaveLength(1);
    // The open end turned into the wind: no wind shielding.
    const turned = v7Clone(rainy),
      o = shelter(turned);
    o.spatial.angle = Math.PI / 2;
    const e = weatherShelterExposure(turned, actor(turned));
    expect(e?.openFacing).toBe(1);
    expect(e?.windShield).toBe(0);
    // An occupant of an unfinished shelter gets nothing.
    const half = v7Clone(rainy);
    shelter(half).data.status = 'unfinished';
    expect(weatherShelterExposure(half, actor(half))?.withheld).toBe(
      'the shelter is unfinished',
    );
    // The gate: without the revision the hook returns its input and the step is the bare step.
    const gated = v7Clone(rainy);
    gated.revisions = gated.revisions.filter((x) => x !== `${id}@1`);
    expect(weatherShelterExposure(gated, actor(gated))).toBeNull();
    const gs = step(gated).world;
    expect(actor(gs).vitals.temperature).toBe(actor(b).vitals.temperature);
    expect(events(gs, 'weather-shelter-exposure-measured')).toHaveLength(0);
    // In dry, windy weather only the wind part is avoided.
    const dry = timed(w, DRY);
    const d = weatherShelterExposure(dry, actor(dry));
    expect(d?.rain).toBe(0);
    expect(d?.avoidedChill).toBeCloseTo(0.6 * (d?.wind ?? 0) * 0.5, 7);
  });

  it('balances the covering water, leaks through measured gaps, wears 0.002 a round in weather, and collapses when load-bearing lashings fail', () => {
    const w = inside(done());
    const rainy = timed(w, RAINY);
    const before = parts(shelter(rainy), 'strands').map((s) => s.condition),
      covers = panels(shelter(rainy)).map((p) => p.condition);
    const r = step(rainy).world,
      water = shelter(r).data.water as Record<string, number | boolean>;
    // Wear: rain and wind present, so 0.001 doubled.
    expect(parts(shelter(r), 'strands').map((s) => s.condition)).toEqual(
      before.map((x) => r8(x - 0.002)),
    );
    expect(panels(shelter(r)).map((p) => p.condition)).toEqual(
      covers.map((x) => r8(x - 0.002)),
    );
    // Received = runoff + retained + leakage; the full covering leaks nothing.
    const rain = forestClimate(r, shelter(rainy).spatial).rain ?? 0;
    expect(water.received).toBeCloseTo(rain * 0.01 * 1.28, 7);
    expect(
      Number(water.runoff) + Number(water.retained) + Number(water.leakage),
    ).toBeCloseTo(Number(water.received), 7);
    expect(water.leakage).toBe(0);
    // Gaps: covering at condition 0.6 covers 0.8 of the roof and leaks a fifth of the rain.
    const worn = v7Clone(rainy);
    for (const p of panels(shelter(worn))) p.condition = 0.6;
    const wr = step(worn).world,
      ww = shelter(wr).data.water as Record<string, number>;
    expect(view(shelter(wr)).coveredFraction).toBeCloseTo(0.598 / 0.75, 6);
    expect(ww.leakage).toBeCloseTo(Number(ww.received) * (1 - 0.598 / 0.75), 7);
    expect(events(wr, 'weather-shelter-leaking')).toHaveLength(1);
    expect(view(shelter(wr)).dripping).toBe(true);
    expect(
      data(wr, 'weather-shelter-exposure-measured')?.rainShield,
    ).toBeCloseTo(0.8 * (0.598 / 0.75), 6);
    // Crossing 0.75 by wear opens the first gaps and is announced.
    const edge = v7Clone(rainy);
    for (const p of panels(shelter(edge))) p.condition = 0.7505;
    expect(events(step(edge).world, 'weather-shelter-worn')).toHaveLength(1);
    // A saturated covering suspends rain protection.
    const soaked = v7Clone(rainy);
    const cap = Number((shelter(soaked).data.cover as V7Data).solids);
    (shelter(soaked).data.cover as V7Data).held = cap;
    const sr = step(soaked).world;
    expect(events(sr, 'weather-shelter-saturated')).toHaveLength(1);
    expect(data(sr, 'weather-shelter-exposure-measured')).toMatchObject({
      saturated: true,
      rainShield: 0,
    });
    // Load-bearing lashings below 0.5: collapse, no protection, parts kept for dismantling.
    const old = v7Clone(rainy);
    for (const s of parts(shelter(old), 'strands')) s.condition = 0.501;
    const cr = step(old).world;
    expect(shelter(cr).data.status).toBe('collapsed');
    expect(events(cr, 'weather-shelter-collapsed')).toHaveLength(1);
    expect(data(cr, 'weather-shelter-exposure-measured')?.withheld).toBe(
      'the shelter is collapsed',
    );
    expect(view(shelter(cr)).coveredFraction).toBe(0);
    expect(parts(shelter(cr), 'rods')).toHaveLength(20);
  });

  it('pauses an unworked round for free, resumes with rechecks, cancels once, and stops at death without refunds', () => {
    const f = fixture();
    const mid = v7Clone(f.stages[3] as V7World);
    // Not worked this round: paused at no cost.
    const idleRound = step(at(mid, STAND)).world;
    expect(works(idleRound)[0]?.status).toBe('paused');
    expect(events(idleRound, 'weather-shelter-paused')).toHaveLength(1);
    expect(actor(idleRound).vitals.energy).toBe(
      actor(step(at(mid, STAND)).world).vitals.energy,
    );
    // Resuming rechecks reach and pays the next round.
    expect(
      unchanged(
        at(idleRound, { x: 16, y: 14.5 }),
        build(f.mats, { shelter: shelter(mid).id }),
      ),
    ).toContain('beyond working reach');
    const resumed = cost(
      at(idleRound, STAND),
      build(f.mats, { shelter: shelter(mid).id }),
    );
    expect(resumed.energy).toBe(1);
    expect(events(resumed.world, 'weather-shelter-resumed')).toHaveLength(1);
    expect(parts(shelter(resumed.world), 'rods')).toHaveLength(20);
    // Cancel: free, unincorporated inputs return once, built-in parts stay unfinished.
    const c = cost(at(resumed.world, STAND), act('cancel'));
    expect(c.energy).toBe(0);
    const o = shelter(c.world);
    expect(o.data.status).toBe('unfinished');
    expect(parts(o, 'rods')).toHaveLength(20);
    expect(c.world.stacks.some((s) => s.reservedFor)).toBe(false);
    const back = own(c.world, 'reed');
    expect(tenths(back)).toBe(1150);
    expect(unchanged(at(c.world, STAND), act('cancel'))).toContain(
      'No unfinished shelter work',
    );
    // An unfinished structure gives no protection and cannot be resumed by build.
    expect(view(o).protectionActive).toBe(false);
    // Death: work stops, reserved inputs lie where the person died, built-in parts stay.
    const dying = v7Clone(f.stages[1] as V7World);
    actor(dying).vitals.health = 0.0001;
    actor(dying).vitals.satiety = 0;
    const where = { ...actor(dying).position };
    const died = step(dying).world;
    expect(events(died, 'died')).toHaveLength(1);
    expect(works(died)[0]?.status).toBe('stopped');
    expect(events(died, 'weather-shelter-failed')).toHaveLength(1);
    expect(died.stacks.some((s) => s.reservedFor)).toBe(false);
    const dropped = died.stacks.filter(
      (s) =>
        s.resource === 'branch' &&
        s.owner === null &&
        s.position.x === where.x &&
        s.position.y === where.y,
    );
    expect(tenths(dropped)).toBe(140);
    expect(parts(shelter(died), 'rods')).toHaveLength(6);
    expect(shelter(died).data.status).toBe('unfinished');
  });

  it('repairs defective components with equivalent real replacements, reinspects, and dismantles an empty shelter in two rounds', () => {
    const base = done();
    const w = gather(base, 'forest-vine-1', { x: 8.2, y: 12.8 }, 2);
    const ready = at(w, STAND);
    dried(ready, 'item-dried-reed-fix', 12);
    const o = shelter(ready),
      strands = parts(o, 'strands');
    for (const s of strands.slice(0, 2)) s.condition = 0.7;
    const panel = panels(o).find((p) => p.id === 'L-lower-0');
    if (!panel) throw new Error('Missing panel.');
    panel.condition = 0.6;
    const vines = own(ready, 'vine')[0];
    if (!vines) throw new Error('Missing vines.');
    const fix = [
      { itemId: vines.id, quantity: 2, role: 'binding' },
      { itemId: 'item-dried-reed-fix', quantity: 12, role: 'thatch' },
    ];
    // Without replacements: refused at no cost, naming the defects.
    expect(unchanged(ready, act('repair', { shelter: o.id }))).toMatch(
      /Defective: .*L-lower-0.*Replacement shortfall/,
    );
    // Two 3 m strands and one panel of 0.029 m3: 6 + 1 = 7 paid rounds.
    let s = ready;
    const spent: number[] = [];
    for (let i = 0; i < 7; i++) {
      const c = cost(s, act('repair', { shelter: o.id, materials: fix }));
      spent.push(c.energy);
      s = fed(c.world);
    }
    expect(spent).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(events(s, 'weather-shelter-repaired')).toHaveLength(1);
    const fixed = shelter(s);
    expect(fixed.data.status).toBe('complete');
    expect(parts(fixed, 'strands').every((x) => x.condition > 0.7)).toBe(true);
    expect(
      panels(fixed).find((p) => p.id === 'L-lower-0')?.condition,
    ).toBeGreaterThan(0.99);
    // Removed parts lie at the shelter as degraded material with their condition.
    const removed = s.stacks.filter(
      (x) => x.owner === null && x.processing?.weatherShelterPart,
    );
    expect(tenths(removed.filter((x) => x.resource === 'vine'))).toBe(20);
    expect(
      removed
        .filter((x) => x.resource === 'vine')
        .map(
          (x) =>
            (x.processing?.weatherShelterPart as { condition: number })
              .condition,
        ),
    ).toEqual(
      [r8(0.7 - 0.002 * 6), r8(0.7 - 0.002 * 6)].map(
        (x) => expect.closeTo(x, 2) as unknown as number,
      ),
    );
    expect(removed.some((x) => x.resource === 'reed')).toBe(true);
    // Dismantling is blocked while someone is inside, then takes two rounds of 1 energy.
    const occupied = inside(at(s, STAND), FLOOR, 'sol');
    expect(
      unchanged(at(occupied, STAND), act('dismantle', { shelter: o.id })),
    ).toContain('A person is inside');
    let d = cost(at(s, STAND), act('dismantle', { shelter: o.id }));
    expect(d.energy).toBe(1);
    expect(events(d.world, 'weather-shelter-dismantle-progress')).toHaveLength(
      1,
    );
    d = cost(fed(d.world), act('dismantle', { shelter: o.id }));
    expect(d.energy).toBe(1);
    expect(d.world.objects.some((x) => x.kind === KIND)).toBe(false);
    const out = d.world.stacks.filter(
      (x) =>
        x.owner === null &&
        (x.processing?.weatherShelterPart as V7Data | undefined)?.shelter ===
          o.id,
    );
    expect(tenths(out.filter((x) => x.resource === 'branch'))).toBe(200);
    expect(tenths(out.filter((x) => x.resource === 'vine'))).toBe(120);
    expect(
      new Set(out.filter((x) => x.resource === 'branch').map((x) => x.origin)),
    ).toEqual(new Set(['forest-branch-0', 'start-2-branches', 'canopy-41']));
    // Reed is conserved across the build, the repair and the dismantling.
    const reed = d.world.stacks.filter((x) => x.resource === 'reed');
    expect(tenths(reed)).toBe(1150 + 120);
  });

  it('lets only the builder build, repair or dismantle; anyone in reach may inspect or occupy it', () => {
    const w = done(),
      o = shelter(w);
    const sol = at(at(w, { x: 12.65, y: 14.5 }, 'sol'), { x: 16, y: 16 });
    actor(sol, 'sol').mastered.push(id);
    expect(unchanged(sol, act('repair', { shelter: o.id }), 'sol')).toContain(
      'Only the person who built',
    );
    expect(
      unchanged(sol, act('dismantle', { shelter: o.id }), 'sol'),
    ).toContain('Only the person who built');
    expect(unchanged(sol, build([], { shelter: o.id }), 'sol')).toContain(
      'No unfinished shelter work of yours',
    );
    const look = cost(sol, act('inspect', { shelter: o.id }), 'sol');
    expect(look.energy).toBe(1);
    expect(data(look.world, 'weather-shelter-inspected')).toMatchObject({
      shelter: o.id,
      status: 'complete',
    });
  });

  it('refuses invalid requests at no cost', () => {
    const f = fixture();
    const w = at(f.ready, STAND);
    expect(unchanged(at(w, { x: 17, y: 14.5 }), build(f.mats))).toContain(
      'Move within reach',
    );
    expect(
      unchanged(
        w,
        build([
          { itemId: 'item-dried-reed-cover', quantity: 200, role: 'thatch' },
        ]),
      ),
    ).toContain('insufficient-quantity');
    expect(
      unchanged(
        w,
        build([
          { itemId: 'item-dried-reed-cover', quantity: 60, role: 'thatch' },
          { itemId: 'item-dried-reed-cover', quantity: 60, role: 'bedding' },
        ]),
      ),
    ).toContain('less than named');
    expect(
      unchanged(
        w,
        build([{ itemId: 'item-dried-reed-cover', quantity: 1, role: 'roof' }]),
      ),
    ).toContain('outside the declared choices');
    expect(unchanged(w, act('cancel'))).toContain('No unfinished shelter work');
    expect(unchanged(w, act('inspect', { shelter: 'shelter-none' }))).toContain(
      'absent-or-inaccessible',
    );
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.5;
    expect(unchanged(tired, build(f.mats))).toContain('needs 1 energy');
    const mid = at(f.stages[2] as V7World, STAND);
    expect(
      unchanged(mid, act('dismantle', { shelter: shelter(mid).id })),
    ).toContain('still open');
    expect(
      unchanged(mid, act('repair', { shelter: shelter(mid).id })),
    ).toContain('still open');
    expect(unchanged(mid, build(f.mats))).toContain(
      'Unfinished shelter work exists',
    );
    const fine = at(done(), STAND);
    expect(
      unchanged(fine, act('repair', { shelter: shelter(fine).id })),
    ).toContain('No defective component');
  });
});
