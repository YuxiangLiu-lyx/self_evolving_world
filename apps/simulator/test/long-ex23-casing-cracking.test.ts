import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Event,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';
import { packagesBefore } from './support/goal-pair-package-snapshot.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 120_000 });

const id = 'crack-and-separate-casing';
const KERNEL = 'hazelnut-loose-kernel';
const FRAGMENTS = 'hazelnut-casing-fragments';
const MIXED = 'hazelnut-cracked-mixed';
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
];
/** sha256 of JSON.stringify of the map from id@version to the sha256 of JSON.stringify of each
 * of the 115 packages registered before this change, in registration order. */
const EXISTING_DIGEST =
  '84c562b4135c9b23e108f2a088cb58acbb2507eaf3bcc4d039ee84e8d49fd846';
/** sha256 of JSON.stringify of each reused package, taken before this change. */
const REUSED: Record<string, string> = {
  'shell-compression-opening@1':
    '5ad34a508811e4cf8adb22d1cbd00452570653606136d7f54536bc3dfeb8d1f8',
  'open-and-separate-sample@1':
    '0447c53a4506fd57bb73c6248850cc9a67519944b1bf03e7cbf1e82ddb1d87ed',
  'prepare-shelled-food@1':
    'c01d24e4b18e8a6611e237b598b790bdcbe023f96e657159ed22ceeab66861b0',
  'rooted-plant-watering@1':
    'f2144a1b994377087fa1bd49445469122eadcab3c76292731d413e02ec2a891f',
};
/** Kai's ex23 hazelnut plant, the nearest stone outcrop (the support), a branch tree and an oak. */
const NUTS = 'start-1-nuts';
const ROCK = 'start-1-stone';
const BRANCHES = 'forest-branch-0';
const OAK = 'forest-oak-0';
/** Standing points within reach of each source, outside their solid footprints. */
const AT_NUTS = { x: 15.4, y: 14.9 };
const AT_ROCK = { x: 15, y: 11.2 };
const AT_BRANCHES = { x: 17.2, y: 14 };
const AT_OAK = { x: 20.2, y: 20 };
/** A point well out of reach of the rock. */
const AWAY = { x: 14.2, y: 12.4 };

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
const events = (w: V7World, type: string, who = 'kai') =>
  w.events.filter((e) => e.type === type && e.actor === who);
const data = (w: V7World, type: string, who = 'kai') =>
  events(w, type, who).at(-1)?.data as Record<string, unknown> | undefined;
const stack = (w: V7World, item: string): V7Stack => {
  const s = w.stacks.find((s) => s.id === item);
  if (!s) throw new Error(`Missing stack ${item}.`);
  return s;
};
const resource = (w: V7World, name: string) => {
  const r = w.resources.find((r) => r.id === name);
  if (!r) throw new Error(`Missing resource ${name}.`);
  return r;
};
type Casing = {
  id: string;
  owner: string;
  plan: string;
  status: string;
  stage: string;
  phase: string;
  source: string;
  quantity: number;
  blocks: number;
  done: number;
  striker: string | null;
  support: string | null;
  untouched: string | null;
  closed: string | null;
  opened: string | null;
  kernel: string | null;
  fragments: string | null;
  completedWork: number;
  paidEnergy: number;
  escrow: string[];
  x: number;
  y: number;
  reason?: string;
  log: { index: number; phase: string; outcome: string; damage: number }[];
  tally: Record<string, number>;
  quote: Record<string, unknown>;
  pausedAt: number | null;
};
const works = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Casing);
const work = (w: V7World): Casing => {
  const j = works(w).at(-1);
  if (!j) throw new Error('Missing casing work.');
  return j;
};
const act = (mode: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});
const record = (s: V7Stack) =>
  (s.processing?.casingCracking ?? null) as Record<string, unknown> | null;
/** All material from Kai's hazelnut source still held as stacks, in kg. */
const fromNuts = (w: V7World) =>
  w.stacks
    .filter((s) => s.origin === NUTS)
    .reduce((n, s) => n + s.quantity * resource(w, s.resource).mass, 0);
/** Nutrition and toxicity carried by every stack from Kai's hazelnut source. */
const value = (w: V7World, field: 'nutrition' | 'toxicity') =>
  w.stacks
    .filter((s) => s.origin === NUTS)
    .reduce((n, s) => n + s.quantity * resource(w, s.resource)[field], 0);
/** Keep everyone fed and rested so the tests isolate the operation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
function genesis() {
  return initialLongWorld('long-ex23', 'long-culture-v2-oldgoal', {
    seed: 20261203,
    development: 8,
    tokens: 1500000,
  });
}
function installed() {
  const g = genesis();
  return v7Clone(v7Install(g, continuousRegistry(g), `${id}@1`));
}
function gather(
  w: V7World,
  at: { x: number; y: number },
  target: string,
  n = 1,
  who = 'kai',
) {
  actor(w, who).position = { ...at };
  const r = step(w, {
    [who]: { interface: 'gather', args: { target, quantity: n } },
  });
  expect(r.outcomes[who]?.success).toBe(true);
  return fed(r.world);
}
const own = (w: V7World, res: string, who = 'kai') =>
  w.stacks.filter((s) => s.owner === who && s.resource === res);
const ownId = (w: V7World, res: string, who = 'kai') => {
  const s = own(w, res, who).find((s) => !s.reservedFor);
  if (!s) throw new Error(`${who} holds no ${res}.`);
  return s.id;
};
const learn = (w: V7World, who = 'kai') => {
  let s = step(w, {
    [who]: { interface: 'learn', args: { ability: id } },
  }).world;
  for (let i = 0; i < 2; i++) s = step(s).world;
  expect(actor(s, who).mastered).toContain(id);
  return fed(s);
};
/** Kai gathers a stone (and optionally a branch or an oak piece) and one hazelnut, presses the
 * hazelnut once with the probe (as in ex23, leaving 0.9), studies and stands at the rock. */
function setup(
  opts: { study?: boolean; branch?: boolean; oak?: boolean } = {},
) {
  let w = installed();
  if (opts.branch) w = gather(w, AT_BRANCHES, BRANCHES);
  if (opts.oak) w = gather(w, AT_OAK, OAK);
  w = gather(w, AT_ROCK, ROCK);
  w = gather(w, AT_NUTS, NUTS);
  const nut = own(w, 'hazelnut')[0];
  if (!nut) throw new Error('Missing actually gathered hazelnuts.');
  const pressed = step(w, {
    kai: {
      interface: 'probe',
      args: { target: nut.id, mode: 'press', intensity: 0.3 },
    },
  });
  expect(pressed.outcomes.kai?.success).toBe(true);
  w = fed(pressed.world);
  expect(stack(w, nut.id).quantity).toBe(0.9);
  if (opts.study ?? true) w = learn(w);
  actor(w).position = { ...AT_ROCK };
  return {
    w: fed(w),
    nut: nut.id,
    stone: ownId(w, 'stone'),
    branch: opts.branch ? ownId(w, 'branch') : '',
    oak: opts.oak ? ownId(w, 'oak') : '',
  };
}
/** The action fails and changes no vitals, stacks or works compared with waiting. */
function unchanged(w: V7World, action: V7Action, who = 'kai') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(works(result.world))).toBe(v7Signature(works(idle)));
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action, who = 'kai') {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.success).toBe(true);
  return {
    world: r.world,
    energy:
      Math.round(
        (actor(idle, who).vitals.energy - actor(r.world, who).vitals.energy) *
          1e8,
      ) / 1e8,
  };
}
/** Submits the same action for n rounds; returns the world, the energy of each round and every
 * event of those rounds (a world keeps only its latest round's events). */
function run(w: V7World, action: V7Action, rounds: number) {
  const spent: number[] = [],
    log: V7Event[] = [];
  let world = w;
  for (let i = 0; i < rounds; i++) {
    const r = cost(world, action);
    spent.push(r.energy);
    log.push(...r.world.events);
    world = r.world;
  }
  return { w: world, spent, log };
}
const count = (log: V7Event[], type: string, who = 'kai') =>
  log.filter((e) => e.type === type && e.actor === who).length;
const both = (f: { nut: string; stone: string }, extra = {}) =>
  act('crack-and-separate', {
    target: f.nut,
    striker: f.stone,
    support: ROCK,
    ...extra,
  });
/** One full crack-and-separate job on Kai's 0.9 stack, computed once and copied per test. */
let full: {
  before: V7World;
  after: V7World;
  spent: number[];
  log: V7Event[];
} | null = null;
function fullJob() {
  if (!full) {
    const f = setup();
    const { w, spent, log } = run(f.w, both(f), 18);
    full = { before: f.w, after: w, spent, log };
  }
  return {
    before: v7Clone(full.before),
    after: v7Clone(full.after),
    spent: [...full.spent],
    log: [...full.log],
  };
}

describe('crack and separate a hard casing in ex23', () => {
  it('is scoped to ex23, registered second in ex23, within the size limit, learned in three rounds, and leaves every existing package byte-identical', () => {
    const other = initialLongWorld('long-ex22', 'long-culture-v2');
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
    // The second ex23 development's package follows the first; later ex23 developments follow it.
    expect(V7_PACKAGES.filter((p) => p.scope === 'long-ex23')[1]).toBe(pkg);
    expect(
      continuousRegistry(g)
        .packages.filter((p) => !p.id.startsWith('foundation-'))
        .map((p) => p.id)
        .slice(0, 2),
    ).toEqual(['rooted-plant-watering', id]);
    expect(pkg).toMatchObject({
      scope: 'long-ex23',
      version: 1,
      dependencies: ['foundation-open@1'],
      visualComponents: [],
      satisfaction: [],
      processes: {},
    });
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 3,
      revision: `${id}@1`,
      handler: `long.${id}`,
      authored: false,
      practiceEvidence: 'casing-cracking-completed',
      references: {
        target: 'optional-exact-visible',
        striker: 'optional-exact-visible',
        support: 'optional-exact-visible',
      },
    });
    expect(ability.learningEnergy).toBeUndefined();
    expect(ability.parameters.properties?.mode).toMatchObject({
      enum: [
        'crack',
        'separate',
        'crack-and-separate',
        'resume',
        'pause',
        'cancel',
      ],
    });
    expect(ability.parameters.required).toEqual(['mode']);
    // New package, ability, handler, equivalence, event and resource names.
    expect(TAKEN).not.toContain(id);
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(ability.id);
        expect(a.equivalence).not.toBe(ability.equivalence);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? [])
        expect(e).not.toMatch(/^casing-cracking-/);
      for (const r of p.resources)
        expect([KERNEL, FRAGMENTS, MIXED]).not.toContain(r.id);
    }
    const limit = g.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg.abilities,
      events: pkg.events,
      resources: pkg.resources.map((r) => r.name),
    });
    expect(visible).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    // Every package registered before this change, the reused ones included, is byte-identical.
    const existing = packagesBefore(pkg);
    expect(existing).toHaveLength(115);
    const map = Object.fromEntries(
      existing.map((p) => [`${p.id}@${String(p.version)}`, sha(p)]),
    );
    expect(sha(map)).toBe(EXISTING_DIGEST);
    for (const [key, hash] of Object.entries(REUSED))
      expect(map[key]).toBe(hash);
    // The parts come from the ex20 hazelnut composition (kernel 0.4, shell 0.6 of the mass),
    // each part's unit being that part of one whole hazelnut unit.
    const w = installed();
    const nut = resource(w, 'hazelnut');
    expect(resource(w, KERNEL)).toMatchObject({
      mass: 0.08,
      nutrition: nut.nutrition,
      toxicity: nut.toxicity,
      food: {
        ingredients: [{ resource: 'hazelnut', share: 1 }],
        method: 'unprocessed',
      },
    });
    expect(resource(w, KERNEL).properties?.decay).toBe(nut.properties?.decay);
    expect(resource(w, FRAGMENTS)).toMatchObject({
      mass: 0.12,
      nutrition: 0,
      toxicity: 0,
    });
    expect(resource(w, FRAGMENTS).properties?.decay).toBe(0);
    expect(resource(w, MIXED)).toMatchObject({
      mass: nut.mass,
      nutrition: nut.nutrition,
      toxicity: nut.toxicity,
    });
    // Unstudied use is refused at no cost; three study rounds master it.
    const f = setup({ study: false });
    expect(unchanged(f.w, both(f, { quoteOnly: true }))).toMatch(
      /master|learn|stud/i,
    );
    let s = step(f.w, {
      kai: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(actor(s).learning).toMatchObject({ ability: id, remaining: 2 });
    s = step(s).world;
    expect(actor(s).mastered).not.toContain(id);
    s = step(s).world;
    expect(actor(s).mastered).toContain(id);
  });

  it('the ex20 and ex22 whole-unit operations refuse the 0.9 stack this operation accepts', () => {
    const cases = [
      {
        scope: 'long-ex20',
        seed: 20261201,
        pid: 'open-and-separate-sample',
        rounds: 1,
        args: (nut: string, stone: string) => ({
          mode: 'open',
          sourceId: nut,
          method: 'supported-tool',
          toolId: stone,
          supportRef: ROCK,
        }),
        refusal: /holds less than one whole unit/,
      },
      {
        scope: 'long-ex22',
        seed: 20261202,
        pid: 'prepare-shelled-food',
        rounds: 2,
        args: (nut: string, stone: string) => ({
          mode: 'shell',
          targetStack: nut,
          implementRef: stone,
          supportRef: ROCK,
        }),
        refusal: /holds 0.9; 1 whole unit/,
      },
    ];
    for (const c of cases) {
      const g = initialLongWorld(c.scope, 'long-culture-v2', {
        seed: c.seed,
        development: 8,
        tokens: 1500000,
      });
      let w = v7Clone(v7Install(g, continuousRegistry(g), `${c.pid}@1`));
      w = gather(w, AT_ROCK, ROCK);
      w = gather(w, AT_NUTS, NUTS);
      const nut = ownId(w, 'hazelnut'),
        stone = ownId(w, 'stone');
      w = fed(
        step(w, {
          kai: {
            interface: 'probe',
            args: { target: nut, mode: 'press', intensity: 0.3 },
          },
        }).world,
      );
      expect(stack(w, nut).quantity).toBe(0.9);
      w = step(w, {
        kai: { interface: 'learn', args: { ability: c.pid } },
      }).world;
      for (let i = 1; i < c.rounds; i++) w = step(w).world;
      expect(actor(w).mastered).toContain(c.pid);
      actor(w).position = { ...AT_ROCK };
      const r = step(fed(w), {
        kai: { interface: c.pid, args: c.args(nut, stone) },
      });
      expect(r.outcomes.kai?.success).toBe(false);
      expect(r.outcomes.kai?.reason).toMatch(c.refusal);
    }
  });

  it('quotes Kai’s 0.9 stack at no cost, then cracks and separates it block by block: 18 rounds, 13.5 energy, exact conservation and stone wear', () => {
    const f = setup();
    // The quote reserves and spends nothing.
    const quoted = step(f.w, { kai: both(f, { quoteOnly: true }) });
    const idle = step(f.w).world;
    expect(quoted.outcomes.kai?.success).toBe(true);
    expect(actor(quoted.world).vitals).toEqual(actor(idle).vitals);
    expect(v7Signature(quoted.world.stacks)).toBe(v7Signature(idle.stacks));
    expect(works(quoted.world)).toHaveLength(0);
    expect(data(quoted.world, 'casing-cracking-quoted')).toMatchObject({
      quote: {
        plan: 'crack-and-separate',
        target: f.nut,
        quantity: 0.9,
        blocks: 9,
        casing: 'closed, undamaged',
        phases: { cracking: 9, separatingAtMost: 9 },
        maxPhases: 18,
        maxEnergy: 13.5,
        phaseEnergy: { crack: 1, separate: 0.5 },
        striker: {
          item: f.stone,
          resource: 'stone',
          mass: 2,
          contacts: 0,
          sound: true,
        },
        support: { kind: 'object', id: ROCK, resource: 'stone' },
        wearBound: { perImpactEachSurface: 0.0002, jobEachSurface: 0.0018 },
        casingDebris: 0,
      },
    });
    const { before, after: w, spent, log } = fullJob();
    // One cracking round at 1 energy, then one separation round at 0.5, for each of 9 blocks.
    expect(spent).toEqual(
      Array.from({ length: 18 }, (_, i) => (i % 2 ? 0.5 : 1)),
    );
    expect(spent.reduce((n, x) => n + x, 0)).toBeCloseTo(13.5, 8);
    const j = work(w);
    expect(j).toMatchObject({
      plan: 'crack-and-separate',
      status: 'completed',
      stage: 'completed',
      source: f.nut,
      quantity: 0.9,
      blocks: 9,
      done: 9,
      completedWork: 18,
      paidEnergy: 13.5,
      striker: f.stone,
      support: ROCK,
      escrow: [],
    });
    expect(j.log.map((b) => b.outcome)).toEqual(
      Array.from({ length: 18 }, (_, i) => (i % 2 ? 'separated' : 'fractured')),
    );
    for (const type of ['impact', 'fractured', 'separated', 'tool-wear'])
      expect(count(log, `casing-cracking-${type}`)).toBe(9);
    expect(count(log, 'casing-cracking-completed')).toBe(1);
    expect(count(log, 'casing-cracking-damaged')).toBe(0);
    expect(count(log, 'casing-cracking-paused')).toBe(0);
    // Products: 0.9 loose kernel and 0.9 casing fragments, owned, with origin and parent.
    expect(own(w, 'hazelnut')).toHaveLength(0);
    const [kernel] = own(w, KERNEL),
      [fragments] = own(w, FRAGMENTS);
    if (!kernel || !fragments) throw new Error('Missing products.');
    expect(own(w, KERNEL)).toHaveLength(1);
    expect(own(w, FRAGMENTS)).toHaveLength(1);
    expect(kernel).toMatchObject({ quantity: 0.9, origin: NUTS });
    expect(fragments).toMatchObject({ quantity: 0.9, origin: NUTS });
    expect(kernel.reservedFor).toBeUndefined();
    expect(record(kernel)).toMatchObject({
      revision: `${id}@1`,
      work: j.id,
      parent: f.nut,
      part: 'loose kernel',
      certified: false,
    });
    expect(record(fragments)).toMatchObject({
      parent: f.nut,
      part: 'casing fragments',
    });
    expect(kernel.harvestedAt).toBe(stack(before, f.nut).harvestedAt);
    // Processing never refreshes the material.
    expect(kernel.decay ?? 0).toBeGreaterThan(stack(before, f.nut).decay ?? 0);
    expect(own(w, MIXED)).toHaveLength(0);
    // Mass and food value are conserved exactly; nothing was eaten.
    expect(fromNuts(before)).toBeCloseTo(0.18, 8);
    expect(fromNuts(w)).toBeCloseTo(0.18, 8);
    expect(kernel.quantity * resource(w, KERNEL).mass).toBeCloseTo(0.072, 8);
    expect(fragments.quantity * resource(w, FRAGMENTS).mass).toBeCloseTo(
      0.108,
      8,
    );
    expect(value(w, 'nutrition')).toBeCloseTo(value(before, 'nutrition'), 8);
    expect(value(w, 'nutrition')).toBeCloseTo(0.9 * 18, 8);
    expect(value(w, 'toxicity')).toBe(0);
    expect(count(log, 'ate')).toBe(0);
    const ledger = data(w, 'casing-cracking-completed')?.ledger;
    expect(ledger).toMatchObject({
      quantum: 0.1,
      input: { quantity: 0.9, mass: 0.18, nutrition: 16.2 },
      untouched: { quantity: 0 },
      closed: { quantity: 0 },
      mixed: { quantity: 0 },
      kernel: { item: kernel.id, quantity: 0.9, mass: 0.072, nutrition: 16.2 },
      fragments: { item: fragments.id, quantity: 0.9, mass: 0.108 },
      debris: { quantity: 0, mass: 0 },
      wear: {
        striker: { item: f.stone, contacts: 9, mass: 0.0009 },
        support: { ref: ROCK, contacts: 0, mass: 0 },
      },
      balanced: true,
    });
    // Each fracture follows through onto the equally hard rock and detaches one quantum from
    // the stone striker; the rock, no softer than the stone, is not worn.
    const stone = stack(w, f.stone);
    expect(stone.quantity).toBe(1);
    expect(stone.physical?.unitMass).toBeCloseTo(2 - 9 * 0.0001, 8);
    expect(stone.processing?.casingImpactWear).toMatchObject({
      contacts: 9,
      worn: 0.0009,
    });
    // Personal records: the first fracture and separation are new; repeats are not.
    expect(
      actor(w).memory.knowledge?.[
        'hazelnut:casing-impact:stone-on-stone:fractured'
      ],
    ).toMatchObject({ verified: true });
    const trials = log
      .filter((e) => e.type === 'trial-result' && e.actor === 'kai')
      .map((e) => e.data.newInformation);
    expect(trials).toHaveLength(18);
    expect(trials.filter((x) => x === true)).toHaveLength(2);
    expect(count(log, 'information-confirmed')).toBe(2);
    // No reward: no practice milestone and the same wellbeing sources as before.
    expect(count(log, 'practice-confirmed')).toBe(0);
    expect(actor(w).wellbeing.sources.map((s) => s.source)).toEqual(
      actor(before).wellbeing.sources.map((s) => s.source),
    );
    // Replay: the same inputs give the same world.
    let replay = v7Clone(before);
    for (let i = 0; i < 18; i++) replay = step(replay, { kai: both(f) }).world;
    let again = v7Clone(before);
    for (let i = 0; i < 18; i++) again = step(again, { kai: both(f) }).world;
    expect(v7Signature(again)).toBe(v7Signature(replay));
    expect(own(replay, KERNEL)[0]?.quantity).toBe(0.9);
  });

  it('a branch striker is unsuitable: one paid impact leaves the casing unchanged, wears the branch and ends the work', () => {
    const f = setup({ branch: true });
    const action = both(f, { striker: f.branch });
    const r = cost(f.w, action);
    expect(r.energy).toBe(1);
    const w = r.world;
    expect(events(w, 'casing-cracking-impact')).toHaveLength(1);
    expect(events(w, 'casing-cracking-unchanged')).toHaveLength(1);
    expect(events(w, 'casing-cracking-separated')).toHaveLength(0);
    expect(work(w)).toMatchObject({
      status: 'completed',
      done: 0,
      completedWork: 1,
      paidEnergy: 1,
    });
    expect(data(w, 'casing-cracking-completed')?.outcome).toMatch(
      /left the casing unchanged/,
    );
    // The material returns as it was: one 0.9 hazelnut item without any record.
    const nuts = own(w, 'hazelnut');
    expect(nuts).toHaveLength(1);
    expect(nuts[0]).toMatchObject({ quantity: 0.9, origin: NUTS });
    expect(nuts[0]?.reservedFor).toBeUndefined();
    expect(nuts[0]?.processing).toBeUndefined();
    expect(own(w, KERNEL)).toHaveLength(0);
    expect(own(w, MIXED)).toHaveLength(0);
    expect(fromNuts(w)).toBeCloseTo(0.18, 8);
    // The branch (hardness below the casing) lost one abrasion quantum.
    const branch = stack(w, f.branch);
    expect(branch.physical?.unitMass).toBeCloseTo(1.1 - 0.0001, 8);
    expect(data(w, 'casing-cracking-tool-wear')).toMatchObject({
      strikerContacts: 1,
      supportContacts: 0,
    });
    // The casing view never shows an opened casing or contents.
    const view = data(w, 'casing-cracking-unchanged')?.view as Record<
      string,
      unknown
    >;
    expect(view).toMatchObject({
      casing: {
        before: 'closed, undamaged',
        after: 'closed, undamaged',
        crack: 0,
      },
      contents: null,
      badge: null,
    });
    expect(
      actor(w).memory.knowledge?.[
        'hazelnut:casing-impact:branch-on-stone:unchanged'
      ],
    ).toMatchObject({ verified: true });
    // A reattempt is new paid work, and a repeated identical failure is not new information.
    const again = cost(
      fed(w),
      both({ nut: nuts[0]?.id ?? '', stone: f.branch }),
    );
    expect(again.energy).toBe(1);
    expect(data(again.world, 'trial-result')?.newInformation).toBe(false);
    expect(events(w, 'information-confirmed')).toHaveLength(1);
    expect(events(again.world, 'information-confirmed')).toHaveLength(0);
  });

  it('an oak striker cracks without opening; reattempts accumulate damage until the casing fractures', () => {
    const f = setup({ oak: true });
    const crackOak = (target: string, extra = {}) =>
      act('crack', {
        target,
        striker: f.oak,
        support: ROCK,
        quantity: 0.2,
        ...extra,
      });
    let { w, spent, log } = run(f.w, crackOak(f.nut), 2);
    expect(spent).toEqual([1, 1]);
    expect(count(log, 'casing-cracking-damaged')).toBe(2);
    expect(count(log, 'casing-cracking-tool-wear')).toBe(0);
    expect(work(w)).toMatchObject({ status: 'completed', done: 2 });
    // The two worked blocks return as one closed, damaged item; the rest is untouched.
    const closed = own(w, 'hazelnut').find((s) => record(s));
    if (!closed) throw new Error('Missing closed damaged material.');
    expect(closed.quantity).toBe(0.2);
    expect(record(closed)).toMatchObject({
      part: 'closed',
      damage: 0.4,
      parent: f.nut,
    });
    expect(stack(w, f.nut).quantity).toBe(0.7);
    expect(stack(w, f.nut).processing).toBeUndefined();
    expect(data(w, 'casing-cracking-damaged')?.view).toMatchObject({
      casing: {
        before: 'closed, undamaged',
        after: 'closed, damaged',
        crack: 0.4,
      },
      contents: null,
    });
    // A second job on the damaged item adds the same damage again.
    ({ w, spent, log } = run(fed(w), crackOak(closed.id), 2));
    expect(count(log, 'casing-cracking-damaged')).toBe(2);
    expect(spent).toEqual([1, 1]);
    const worse = own(w, 'hazelnut').find((s) => record(s));
    if (!worse) throw new Error('Missing closed damaged material.');
    expect(record(worse)).toMatchObject({ part: 'closed', damage: 0.8 });
    // A third fractures it: separation follows each opened block.
    ({ w, spent, log } = run(
      fed(w),
      act('crack-and-separate', {
        target: worse.id,
        striker: f.oak,
        support: ROCK,
      }),
      4,
    ));
    expect(spent).toEqual([1, 0.5, 1, 0.5]);
    expect(count(log, 'casing-cracking-fractured')).toBe(2);
    expect(own(w, KERNEL)[0]?.quantity).toBe(0.2);
    expect(own(w, FRAGMENTS)[0]?.quantity).toBe(0.2);
    expect(fromNuts(w)).toBeCloseTo(0.18, 8);
    expect(value(w, 'nutrition')).toBeCloseTo(0.9 * 18, 8);
    // Oak, harder than the casing and softer than the rock, wears only on the follow-through.
    expect(stack(w, f.oak).processing?.casingImpactWear).toMatchObject({
      contacts: 2,
    });
  });

  it('cracks only, leaving cracked unseparated material, then separates it by hand at 0.5 energy per block', () => {
    const f = setup();
    const crack = act('crack', {
      target: f.nut,
      quantity: 0.3,
      striker: f.stone,
      support: ROCK,
    });
    let { w, spent, log } = run(f.w, crack, 3);
    expect(spent).toEqual([1, 1, 1]);
    expect(work(w)).toMatchObject({
      plan: 'crack',
      status: 'completed',
      done: 3,
    });
    expect(count(log, 'casing-cracking-products')).toBe(3);
    expect(count(log, 'casing-cracking-separated')).toBe(0);
    const [mixed] = own(w, MIXED);
    if (!mixed) throw new Error('Missing cracked material.');
    expect(mixed).toMatchObject({ quantity: 0.3, origin: NUTS });
    expect(mixed.reservedFor).toBeUndefined();
    expect(record(mixed)).toMatchObject({ part: 'cracked-mixed', damage: 1 });
    expect(stack(w, f.nut).quantity).toBe(0.6);
    expect(fromNuts(w)).toBeCloseTo(0.18, 8);
    expect(value(w, 'nutrition')).toBeCloseTo(0.9 * 18, 8);
    // Closed material has nothing accessible to separate; open material is not cracked again.
    w = fed(w);
    expect(unchanged(w, act('separate', { target: f.nut }))).toMatch(
      /nothing is accessible to separate/,
    );
    expect(
      unchanged(
        w,
        act('crack', { target: mixed.id, striker: f.stone, support: ROCK }),
      ),
    ).toMatch(/already cracked open/);
    expect(
      unchanged(w, act('separate', { target: mixed.id, striker: f.stone })),
    ).toMatch(/by hand/);
    // Separation needs no striker, support, reach of the rock or light; in the dark the
    // kernel's condition is simply not seen.
    actor(w).position = { ...AWAY };
    w.time = (w.config.forest?.day ?? 80) * 0.6;
    ({ w, spent, log } = run(w, act('separate', { target: mixed.id }), 3));
    expect(spent).toEqual([0.5, 0.5, 0.5]);
    expect(data(w, 'casing-cracking-separated')?.observation).toMatchObject({
      condition: 'not seen in this light',
      certified: false,
    });
    expect(count(log, 'casing-cracking-separated')).toBe(3);
    expect(count(log, 'casing-cracking-impact')).toBe(0);
    expect(own(w, MIXED)).toHaveLength(0);
    expect(own(w, KERNEL)[0]?.quantity).toBe(0.3);
    expect(own(w, FRAGMENTS)[0]?.quantity).toBe(0.3);
    expect(own(w, KERNEL)[0]?.decay ?? 0).toBeGreaterThanOrEqual(
      mixed.decay ?? 0,
    );
    expect(fromNuts(w)).toBeCloseTo(0.18, 8);
    expect(value(w, 'nutrition')).toBeCloseTo(0.9 * 18, 8);
  });

  it('refuses invalid requests before any charge', () => {
    const f = setup({ branch: true });
    const w = f.w;
    expect(
      unchanged(w, act('crack', { striker: f.stone, support: ROCK })),
    ).toMatch(/Give target/);
    expect(unchanged(w, act('dig'))).not.toBe('');
    // Quantities: exact tenths, at most one unit and at most what the item holds.
    expect(unchanged(w, both(f, { quantity: 0.15 }))).toMatch(/exact tenths/);
    expect(unchanged(w, both(f, { quantity: 1.5 }))).not.toBe('');
    const tenth = v7Clone(w);
    stack(tenth, f.nut).quantity = 0.2;
    stack(tenth, f.nut).quantityTenths = 2;
    expect(unchanged(tenth, both(f, { quantity: 0.3 }))).toMatch(/holds 0.2/);
    // Striker and support.
    expect(unchanged(w, both(f, { striker: '' }))).toMatch(/needs striker/);
    expect(unchanged(w, both(f, { support: '' }))).toMatch(/needs striker/);
    expect(unchanged(w, both(f, { striker: f.nut }))).toMatch(
      /must be different/,
    );
    expect(unchanged(w, both(f, { support: f.stone }))).toMatch(
      /must be different/,
    );
    const berry = v7Clone(w);
    berry.stacks.push({
      ...stack(berry, f.stone),
      id: 'item-0-kai-999',
      resource: 'berry',
    });
    expect(unchanged(berry, both(f, { striker: 'item-0-kai-999' }))).toMatch(
      /food, not a material piece/,
    );
    expect(unchanged(w, both(f, { support: NUTS }))).not.toBe('');
    const far = v7Clone(w);
    actor(far).position = { ...AWAY };
    expect(unchanged(far, both(f))).toMatch(/within reach of the support/);
    // Not a casing material; another person's item.
    expect(
      unchanged(w, both(f, { target: f.branch, striker: f.stone })),
    ).toMatch(/No casing and contents are represented for branch/);
    const lin = v7Clone(w);
    const theirs = stack(lin, f.nut);
    theirs.owner = 'lin';
    expect(unchanged(lin, both(f))).not.toBe('');
    // Too little energy for the first round.
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.5;
    expect(unchanged(tired, both(f))).toMatch(/needs 1 energy/);
    // Nothing open to resume, pause or cancel.
    for (const mode of ['resume', 'pause', 'cancel'])
      expect(unchanged(w, act(mode))).toMatch(/no open casing work/);
    // One open work at a time; its striker and support are pinned.
    const started = fed(step(w, { kai: both(f, { quantity: 0.3 }) }).world);
    expect(
      unchanged(
        started,
        act('crack', { target: f.nut, striker: f.stone, support: ROCK }),
      ),
    ).toMatch(/still open/);
    expect(unchanged(started, both(f, { quoteOnly: true }))).toMatch(
      /still open/,
    );
    expect(unchanged(started, both(f, { striker: f.branch }))).toMatch(
      /pinned/,
    );
    expect(
      unchanged(started, act('resume', { workId: 'manual-0-none-1' })),
    ).toMatch(/No casing work of yours/);
  });

  it('pauses at no charge, resumes only with valid prerequisites, and cancels once without refunds', () => {
    const f = setup();
    const action = both(f, { quantity: 0.3 });
    let r = cost(f.w, action);
    expect(r.energy).toBe(1);
    let w = r.world;
    expect(work(w)).toMatchObject({
      status: 'active',
      phase: 'separate',
      done: 0,
    });
    // Doing something else pauses the work between phases at no charge.
    const idle = step(w).world;
    expect(events(idle, 'casing-cracking-paused')).toHaveLength(1);
    expect(work(idle)).toMatchObject({ status: 'paused', phase: 'separate' });
    expect(data(idle, 'casing-cracking-paused')?.view).toMatchObject({
      pose: null,
      badge: null,
    });
    expect(fromNuts(idle)).toBeCloseTo(0.18, 8);
    // The same action continues a paused work after rechecks.
    r = cost(fed(idle), action);
    expect(r.energy).toBe(0.5);
    w = r.world;
    expect(events(w, 'casing-cracking-resumed')).toHaveLength(1);
    expect(work(w)).toMatchObject({
      status: 'active',
      phase: 'crack',
      done: 1,
    });
    // An explicit pause costs no energy.
    r = cost(w, act('pause'));
    expect(r.energy).toBe(0);
    w = fed(r.world);
    expect(work(w)).toMatchObject({ status: 'paused' });
    expect(unchanged(w, act('pause'))).toMatch(/already paused/);
    // Resume is refused at no cost while the support is out of reach.
    const far = v7Clone(w);
    actor(far).position = { ...AWAY };
    expect(unchanged(far, act('resume'))).toMatch(
      /within reach of the support/,
    );
    r = cost(w, act('resume', { workId: work(w).id }));
    expect(r.energy).toBe(1);
    w = r.world;
    expect(work(w)).toMatchObject({ status: 'active', phase: 'separate' });
    // Too little energy in a continuing round pauses before any charge.
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.3;
    const paused = step(tired, { kai: action });
    expect(paused.outcomes.kai?.success).toBe(true);
    expect(actor(paused.world).vitals).toEqual(actor(step(tired).world).vitals);
    expect(work(paused.world)).toMatchObject({
      status: 'paused',
      paidEnergy: 2.5,
    });
    expect(data(paused.world, 'casing-cracking-paused')?.view).toBeDefined();
    expect(work(paused.world).reason).toMatch(/needs 0.5 energy/);
    // Cancel returns the surviving reserved material once; products and fractures stay.
    const before = fed(paused.world);
    const open = work(before);
    const reservedItems = [...open.escrow];
    r = cost(before, act('cancel'));
    expect(r.energy).toBe(0);
    w = r.world;
    expect(work(w)).toMatchObject({
      status: 'stopped',
      stage: 'cancelled',
      paidEnergy: 2.5,
    });
    expect(data(w, 'casing-cracking-cancelled')?.released).toEqual(
      reservedItems,
    );
    expect(w.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
    for (const x of reservedItems) expect(stack(w, x).owner).toBe('kai');
    expect(own(w, MIXED)[0]?.quantity).toBe(0.1);
    expect(own(w, KERNEL)[0]?.quantity).toBe(0.1);
    expect(own(w, FRAGMENTS)[0]?.quantity).toBe(0.1);
    expect(own(w, 'hazelnut').reduce((n, s) => n + s.quantity, 0)).toBeCloseTo(
      0.7,
      8,
    );
    expect(fromNuts(w)).toBeCloseTo(0.18, 8);
    expect(value(w, 'nutrition')).toBeCloseTo(0.9 * 18, 8);
    expect(unchanged(fed(w), act('cancel'))).toMatch(/no open casing work/);
    expect(unchanged(fed(w), act('cancel', { workId: open.id }))).toMatch(
      /already settled/,
    );
  });

  it('death ends the work and leaves reserved material at the worksite once; spoilage ends it', () => {
    const f = setup();
    const w = fed(step(f.w, { kai: both(f, { quantity: 0.3 }) }).world);
    const dying = v7Clone(w);
    actor(dying).vitals.health = 0.0001;
    actor(dying).vitals.satiety = 0;
    const j = work(dying);
    const where = { x: j.x, y: j.y };
    const held = [...j.escrow];
    expect(held).toHaveLength(2);
    const died = step(dying).world;
    expect(events(died, 'died')).toHaveLength(1);
    expect(work(died)).toMatchObject({ status: 'stopped', stage: 'failed' });
    expect(data(died, 'casing-cracking-failed')).toMatchObject({
      cause: 'death',
    });
    for (const x of held)
      expect(stack(died, x)).toMatchObject({ owner: null, position: where });
    expect(died.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
    expect(fromNuts(died)).toBeCloseTo(fromNuts(w), 8);
    expect(value(died, 'nutrition')).toBeCloseTo(value(w, 'nutrition'), 8);
    // Reserved material that spoils ends the work; what remains returns to Kai.
    const spoiling = v7Clone(w);
    const untouched = work(spoiling).untouched ?? '';
    stack(spoiling, untouched).decay = 799.999;
    const later = step(spoiling).world;
    expect(later.events.some((e) => e.type === 'spoiled')).toBe(true);
    expect(work(later)).toMatchObject({ stage: 'failed', paidEnergy: 1 });
    expect(data(later, 'casing-cracking-failed')).toMatchObject({
      cause: 'material lost',
    });
    expect(later.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
    expect(own(later, MIXED)[0]?.quantity).toBe(0.1);
  });

  it('is owner-only: no one else can continue, pause or cancel Kai’s work or use Kai’s items', () => {
    const f = setup();
    let w = fed(step(f.w, { kai: both(f, { quantity: 0.3 }) }).world);
    actor(w, 'lin').position = { x: 15.5, y: 11.35 };
    w = learn(w, 'lin');
    const j = work(w);
    for (const mode of ['resume', 'pause', 'cancel'])
      expect(unchanged(w, act(mode, { workId: j.id }), 'lin')).toMatch(
        /No casing work of yours/,
      );
    expect(unchanged(w, act('cancel'), 'lin')).toMatch(/no open casing work/);
    expect(unchanged(w, both(f), 'lin')).toMatch(
      /absent-or-inaccessible|own items/,
    );
    const linNut = v7Clone(w);
    linNut.stacks.push({
      ...stack(linNut, f.stone),
      id: 'item-0-lin-998',
      resource: 'hazelnut',
      owner: 'lin',
      quantity: 0.5,
      quantityTenths: 5,
    });
    delete stack(linNut, 'item-0-lin-998').physical;
    delete stack(linNut, 'item-0-lin-998').processing;
    expect(
      unchanged(
        linNut,
        act('crack', {
          target: 'item-0-lin-998',
          striker: f.stone,
          support: ROCK,
        }),
        'lin',
      ),
    ).toMatch(/absent-or-inaccessible|one of your own carried items/);
    // Kai's reserved material cannot be eaten or given away until the work ends.
    const reservedId = j.escrow[0] ?? '';
    expect(
      unchanged(w, {
        interface: 'eat',
        args: { target: reservedId, quantity: 1 },
      }),
    ).not.toBe('');
    expect(work(w)).toMatchObject({ owner: 'kai', status: 'paused' });
  });

  it('products follow the whole-unit rules of eat, give and drop, keep ageing and give no reward', () => {
    const { after } = fullJob();
    const w = fed(after);
    const kernel = ownId(w, KERNEL),
      fragments = ownId(w, FRAGMENTS);
    actor(w, 'lin').position = {
      x: actor(w).position.x + 0.5,
      y: actor(w).position.y,
    };
    // In this world eat, give and drop take whole units (integer quantity of at least 1), so the
    // 0.9 kernel and 0.9 fragment items can be neither eaten, handed over nor dropped.
    for (const action of [
      { interface: 'eat', args: { target: kernel, quantity: 0.9 } },
      { interface: 'eat', args: { target: kernel, quantity: 1 } },
      { interface: 'eat', args: { target: `resource:${KERNEL}`, quantity: 1 } },
      { interface: 'eat', args: { target: fragments, quantity: 1 } },
      {
        interface: 'give',
        args: { target: kernel, quantity: 0.1, recipient: 'lin' },
      },
      {
        interface: 'give',
        args: { target: kernel, quantity: 1, recipient: 'lin' },
      },
      { interface: 'drop', args: { target: fragments, quantity: 0.1 } },
      { interface: 'drop', args: { target: fragments, quantity: 1 } },
    ])
      expect(unchanged(w, action)).not.toBe('');
    // Ordinary decay continues on the kernel; fragments, like other inedible material, do not decay.
    const later = step(w).world;
    expect(stack(later, kernel).decay ?? 0).toBeGreaterThan(
      stack(w, kernel).decay ?? 0,
    );
    expect(stack(later, fragments).decay).toBe(stack(w, fragments).decay);
    // A whole unit of loose kernel, were one held, is eaten by the existing food rules with
    // exactly one hazelnut unit's food value.
    const whole = v7Clone(w);
    stack(whole, kernel).quantity = 1;
    stack(whole, kernel).quantityTenths = 10;
    const meal = step(whole, {
      kai: { interface: 'eat', args: { target: kernel, quantity: 1 } },
    }).world;
    expect(data(meal, 'ate')).toMatchObject({
      resource: KERNEL,
      quantity: 1,
      nutrition: resource(w, 'hazelnut').nutrition,
    });
  });
});
