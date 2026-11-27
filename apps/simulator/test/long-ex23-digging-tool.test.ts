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

const id = 'shape-and-use-wooden-digging-tool';
const WOOD = 'wood-shaping-debris';
const GRIT = 'abrasive-grit-debris';
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
];
/** sha256 of JSON.stringify of the map from id@version to the sha256 of JSON.stringify of each
 * of the 116 packages registered before this change, in registration order (the scratch hash
 * file, with crack-and-separate-casing@1 added before this change). */
const EXISTING_DIGEST =
  'e35956dbb4f634e95c6de7cb431171ab9ac549591d131b816ec38bd1664b4e7f';
/** sha256 of JSON.stringify of each reused package, taken before this change. */
const REUSED: Record<string, string> = {
  'foundation-open@1':
    'c2cc0c70d608bd5f5e60b81671ee99a73c8bfa1304ad88faed1342d59cb5f6fe',
  'shell-compression-opening@1':
    '5ad34a508811e4cf8adb22d1cbd00452570653606136d7f54536bc3dfeb8d1f8',
  'cutting-edge-assessment@1':
    '3ca9a1f0d691fad71d4f6aaae3877ae70473a3af96f6785ed52433727ba01a49',
  'small-combustion-source@1':
    '88baf2ffeb6b0d808e0689e4c200cdb0083ba6ebff605ef89b6c903e26f88eb8',
  'draw-from-observation@1':
    'd0ed2b1c8491d125619a2df64989baf224756076206653facfcdc9809510f8eb',
  'rooted-plant-watering@1':
    'f2144a1b994377087fa1bd49445469122eadcab3c76292731d413e02ec2a891f',
  'crack-and-separate-casing@1':
    'e184166595eb2c393ed25af28b3c2e434868c1d560a85c74b571107a6d7273ce',
};
/** Moss's ex23 branch source and the nearest stone outcrop (the abrasive), with standing points
 * within reach and outside their solid footprints. */
const BRANCHES = 'canopy-69';
const AT_BRANCHES = { x: 14.4, y: 17.9 };
const ROCK = 'start-2-stone';
const AT_ROCK = { x: 11, y: 21.2 };
/** Firm forest floor well out of reach of the rock. */
const AWAY = { x: 11, y: 22.4 };
/** Soil patches clear of objects (patch centre on the 0.25 m grid) and standing points 0.5 m away. */
const FOREST = { at: { x: 14.5, y: 18.5 }, patch: { x: 14.5, y: 18 } };
const MEADOW = { at: { x: 16, y: 17.5 }, patch: { x: 16, y: 18 } };
const ROCKY = { at: { x: 34, y: 4.5 }, patch: { x: 34, y: 5 } };
const BANK = { at: { x: 23.5, y: 4.5 }, patch: { x: 23.5, y: 5 } };
const RIVER = { at: { x: 24.75, y: 5 }, patch: { x: 25.25, y: 5 } };
const SHALLOW = { at: { x: 25.5, y: 12.5 }, patch: { x: 26, y: 12.5 } };
/** The declared rod of one whole fallen-branch unit (ex21: 900 kg/m3, 25 diameters). */
const DIAMETER = Math.cbrt((4 * (1.1 / 900)) / (Math.PI * 25));
/** Loose top 0.15 m of a 0.125 m radius patch, in whole cm3. */
const LOOSE = Math.floor(Math.PI * 0.125 ** 2 * 0.15 * 1e6);

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
const actor = (w: V7World, name = 'moss'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string, who = 'moss') =>
  w.events.filter((e) => e.type === type && e.actor === who);
const data = (w: V7World, type: string, who = 'moss') =>
  events(w, type, who).at(-1)?.data as Record<string, unknown> | undefined;
const stack = (w: V7World, item: string): V7Stack => {
  const s = w.stacks.find((s) => s.id === item);
  if (!s) throw new Error(`Missing stack ${item}.`);
  return s;
};
type End = {
  diameter: number;
  length: number;
  region: number;
  taper: number;
  tip: number;
};
type Tool = {
  status: string;
  condition: string;
  cracks: number;
  verified: boolean;
  verifiedAt: number | null;
  material: string;
  parent: string;
  end: End;
  mass: { input: number; shaping: number; use: number; fragments: number };
  strokes: { shaping: number; maintenance: number; use: number };
  displaced: number;
};
const tool = (s: V7Stack) =>
  (s.processing?.diggingTool ?? null) as unknown as Tool | null;
type Dig = {
  id: string;
  owner: string;
  plan: string;
  status: string;
  stage: string;
  source: string;
  blank: string;
  abrasive: string;
  strokes: number;
  segment: number;
  removed: number;
  abrasiveWorn: number;
  completedWork: number;
  paidEnergy: number;
  escrow: string[];
  outputs: string[];
  x: number;
  y: number;
  reason?: string;
};
const works = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Dig);
const work = (w: V7World): Dig => {
  const j = works(w).at(-1);
  if (!j) throw new Error('Missing digging-tool work.');
  return j;
};
type Patch = {
  x: number;
  y: number;
  looseVolume: number;
  displaced: number;
  heap: { x: number; y: number; volume: number };
  strokes: number;
  toolDust: number;
};
const patches = (w: V7World) =>
  Object.entries(w.state)
    .filter(([k]) => k.startsWith('digging-soil:'))
    .map(([, v]) => v as unknown as Patch);
const patch = (w: V7World, p: { x: number; y: number }) =>
  w.state[`digging-soil:${String(p.x)}:${String(p.y)}`] as unknown as
    Patch | undefined;
const act = (mode: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});
const own = (w: V7World, res: string, who = 'moss') =>
  w.stacks.filter((s) => s.owner === who && s.resource === res);
const massOf = (w: V7World, s: V7Stack) =>
  s.quantity *
  (s.physical?.unitMass ??
    w.resources.find((r) => r.id === s.resource)?.mass ??
    NaN);
/** All wood from Moss's branch source: pieces, dust and fragments as stacks, and tip wear left
 * in dug patches (kg). */
const wood = (w: V7World) =>
  w.stacks
    .filter((s) => s.origin === BRANCHES)
    .reduce((n, s) => n + massOf(w, s), 0) +
  patches(w).reduce((n, p) => n + p.toolDust, 0);
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
const at = (w: V7World, p: { x: number; y: number }, who = 'moss') => {
  const copy = v7Clone(w);
  actor(copy, who).position = { ...p };
  return fed(copy);
};
const learn = (w: V7World, who = 'moss') => {
  let s = step(w, {
    [who]: { interface: 'learn', args: { ability: id } },
  }).world;
  for (let i = 0; i < 3; i++) s = step(s).world;
  expect(actor(s, who).mastered).toContain(id);
  return fed(s);
};
/** Moss gathers two branch units, learns the probe and presses them four times (0.25 held, 0.5
 * did not, as in ex23), leaving 1.6 units; studies and stands at the stone outcrop. */
function setup(opts: { study?: boolean } = {}) {
  let w = at(installed(), AT_BRANCHES);
  const r = step(w, {
    moss: { interface: 'gather', args: { target: BRANCHES, quantity: 2 } },
  });
  expect(r.outcomes.moss?.success).toBe(true);
  w = fed(r.world);
  const branch = own(w, 'branch')[0]?.id ?? '';
  w = fed(
    step(w, { moss: { interface: 'learn', args: { ability: 'probe' } } }).world,
  );
  expect(actor(w).mastered).toContain('probe');
  for (const intensity of [0.25, 0.25, 0.5, 0.5]) {
    const pressed = step(w, {
      moss: {
        interface: 'probe',
        args: { target: branch, mode: 'press', intensity },
      },
    });
    expect(pressed.outcomes.moss?.success).toBe(true);
    w = fed(pressed.world);
  }
  expect(stack(w, branch).quantity).toBe(1.6);
  if (opts.study ?? true) w = learn(w);
  return { w: at(w, AT_ROCK), branch };
}
/** The action fails and changes no vitals, stacks, works or patches compared with waiting. */
function unchanged(w: V7World, action: V7Action, who = 'moss') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(works(result.world))).toBe(v7Signature(works(idle)));
  expect(v7Signature(patches(result.world))).toBe(v7Signature(patches(idle)));
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action, who = 'moss') {
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
/** Submits the same action for n rounds; returns the world, the energy of each round and every
 * event of those rounds (a world keeps only its latest round's events). */
function run(w: V7World, action: V7Action, rounds: number, who = 'moss') {
  const spent: number[] = [],
    log: V7Event[] = [];
  let world = w;
  for (let i = 0; i < rounds; i++) {
    const r = cost(world, action, who);
    spent.push(r.energy);
    log.push(...r.world.events);
    world = r.world;
  }
  return { w: world, spent, log };
}
const count = (log: V7Event[], type: string, who = 'moss') =>
  log.filter((e) => e.type === type && e.actor === who).length;
const shape = (f: { branch: string }, extra: Record<string, unknown> = {}) =>
  act('shape', { target: f.branch, quantity: 1, abrasive: ROCK, ...extra });
const use = (
  item: string,
  p: { x: number; y: number },
  extra: Record<string, unknown> = {},
) => act('use', { target: item, ...p, ...extra });
/** One full shaping of a whole branch unit against the outcrop, computed once, copied per test. */
let full: {
  before: V7World;
  after: V7World;
  spent: number[];
  log: V7Event[];
  branch: string;
} | null = null;
function fullJob() {
  if (!full) {
    const f = setup();
    const { w, spent, log } = run(f.w, shape(f), 7);
    full = { before: f.w, after: w, spent, log, branch: f.branch };
  }
  return {
    before: v7Clone(full.before),
    after: v7Clone(full.after),
    spent: [...full.spent],
    log: [...full.log],
    branch: full.branch,
  };
}
const toolId = (w: V7World) => {
  const s = w.stacks.find((s) => s.owner === 'moss' && tool(s));
  if (!s) throw new Error('Moss holds no shaped piece.');
  return s.id;
};

describe('shape and use a wooden digging tool in ex23', () => {
  it('is scoped to ex23, registered third in ex23, within the size limit, learned in four rounds, and leaves every existing package byte-identical', () => {
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
    // The third ex23 development's package follows the first two; later ex23 developments follow it.
    expect(V7_PACKAGES.filter((p) => p.scope === 'long-ex23')[2]).toBe(pkg);
    expect(
      continuousRegistry(g)
        .packages.filter((p) => !p.id.startsWith('foundation-'))
        .map((p) => p.id)
        .slice(0, 3),
    ).toEqual(['rooted-plant-watering', 'crack-and-separate-casing', id]);
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
      learning: 4,
      revision: `${id}@1`,
      handler: `long.${id}`,
      authored: false,
      practiceEvidence: 'digging-tool-released',
      references: {
        target: 'optional-exact-visible',
        abrasive: 'optional-exact-visible',
      },
    });
    expect(ability.learningEnergy).toBeUndefined();
    expect(ability.parameters.properties?.mode).toMatchObject({
      enum: [
        'inspect',
        'shape',
        'use',
        'maintain',
        'pause',
        'resume',
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
      for (const e of p.events ?? []) expect(e).not.toMatch(/^digging-tool-/);
      for (const r of p.resources) expect([WOOD, GRIT]).not.toContain(r.id);
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
    expect(existing).toHaveLength(116);
    const map = Object.fromEntries(
      existing.map((p) => [`${p.id}@${String(p.version)}`, sha(p)]),
    );
    expect(sha(map)).toBe(EXISTING_DIGEST);
    for (const [key, hash] of Object.entries(REUSED))
      expect(map[key]).toBe(hash);
    // Two inedible debris materials of 0.001 kg a unit: 0.1 unit is one 0.0001 kg dust quantum.
    const w = installed();
    for (const r of [WOOD, GRIT])
      expect(w.resources.find((x) => x.id === r)).toMatchObject({
        mass: 0.001,
        nutrition: 0,
        toxicity: 0,
      });
    // Unstudied use is refused at no cost; four study rounds master it.
    const f = setup({ study: false });
    expect(unchanged(f.w, shape(f, { quoteOnly: true }))).toMatch(
      /master|learn|stud/i,
    );
    let s = step(f.w, {
      moss: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(actor(s).learning).toMatchObject({ ability: id, remaining: 3 });
    for (let i = 0; i < 2; i++) {
      s = step(s).world;
      expect(actor(s).mastered).not.toContain(id);
    }
    s = step(s).world;
    expect(actor(s).mastered).toContain(id);
  });

  it('quotes a whole-branch blank at no cost, then shapes it in segments of at most four strokes until the measured end meets the criterion', () => {
    const f = setup();
    // The quote reserves and spends nothing.
    const quoted = step(f.w, { moss: shape(f, { quoteOnly: true }) });
    const idle = step(f.w).world;
    expect(quoted.outcomes.moss?.success).toBe(true);
    expect(actor(quoted.world).vitals).toEqual(actor(idle).vitals);
    expect(v7Signature(quoted.world.stacks)).toBe(v7Signature(idle.stacks));
    expect(works(quoted.world)).toHaveLength(0);
    const quote = data(quoted.world, 'digging-tool-quoted')?.quote;
    expect(quote).toMatchObject({
      plan: 'shape',
      target: f.branch,
      quantity: 1,
      mass: 1.1,
      piece: { end: { shape: 'flat end', meetsCriterion: false } },
      criterion: { shaftAtLeast: 0.3 },
      removal: { needed: 0.0673, perStrokeAtMost: 0.01 },
      strokes: 7,
      segments: 2,
      energy: 7,
      abrasive: { ref: ROCK, kind: 'object', support: ROCK },
      abrasiveWearAtMostPerStroke: 0.01,
    });
    const q = quote as {
      piece: { end: End };
      criterion: { tipAtMost: number };
    };
    expect(q.piece.end.diameter).toBeCloseTo(DIAMETER, 6);
    expect(q.piece.end.length).toBeCloseTo(25 * DIAMETER, 6);
    expect(q.criterion.tipAtMost).toBeCloseTo(0.35 * DIAMETER, 6);
    // The first segment: four paid strokes of 1 energy, then a pause awaiting explicit continuation.
    const segment = run(f.w, shape(f), 4);
    const { spent, log } = segment;
    let w = segment.w;
    expect(spent).toEqual([1, 1, 1, 1]);
    expect(count(log, 'digging-tool-abraded')).toBe(4);
    expect(count(log, 'digging-tool-released')).toBe(0);
    expect(work(w)).toMatchObject({
      status: 'paused',
      strokes: 4,
      segment: 4,
      removed: 0.04,
    });
    expect(work(w).reason).toMatch(/segment/);
    const blank = work(w).blank;
    expect(stack(w, blank)).toMatchObject({
      quantity: 1,
      reservedFor: work(w).id,
    });
    expect(tool(stack(w, blank))).toMatchObject({
      status: 'unfinished',
      verified: false,
    });
    // Every abrasion event shows an unfinished end; only completed geometry shows a finished one.
    for (const e of log.filter((e) => e.type === 'digging-tool-abraded'))
      expect(e.data.view).toMatchObject({
        finishedEnd: false,
        displacedEarth: false,
        badge: null,
        visibleCondition: 'unfinished blank',
      });
    const tips = log
      .filter((e) => e.type === 'digging-tool-abraded')
      .map((e) => (e.data.view as { end: End }).end.tip);
    for (let i = 1; i < tips.length; i++)
      expect(tips[i]).toBeLessThan(tips[i - 1] ?? 0);
    // The remaining stock is unchanged apart from the reserved piece.
    expect(stack(w, f.branch).quantity).toBe(0.6);
    // The second segment continues explicitly and releases the piece on the seventh stroke.
    const { after, spent: all, log: full7 } = fullJob();
    expect(all).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(count(full7, 'digging-tool-resumed')).toBe(1);
    expect(count(full7, 'digging-tool-paused')).toBe(1);
    expect(count(full7, 'digging-tool-released')).toBe(1);
    w = after;
    const j = work(w);
    expect(j).toMatchObject({
      plan: 'shape',
      status: 'completed',
      stage: 'completed',
      strokes: 7,
      completedWork: 7,
      paidEnergy: 7,
      removed: 0.07,
      abrasive: ROCK,
      escrow: [],
    });
    const released = stack(w, j.blank);
    expect(released).toMatchObject({ owner: 'moss', quantity: 1 });
    expect(released.reservedFor).toBeUndefined();
    const t = tool(released);
    expect(t).toMatchObject({
      status: 'shaped',
      condition: 'sound',
      verified: false,
      material: 'branch',
      mass: { input: 1.1, shaping: 0.07, use: 0, fragments: 0 },
      strokes: { shaping: 7 },
    });
    if (!t) throw new Error('Missing tool record.');
    expect(t.end.tip).toBeLessThanOrEqual(0.35 * t.end.diameter);
    expect(t.end.tip).toBeGreaterThanOrEqual(0.2 * t.end.diameter);
    expect(t.end.length - t.end.region).toBeGreaterThanOrEqual(0.3);
    expect(data(w, 'digging-tool-released')?.view).toMatchObject({
      phase: 'completed geometry',
      finishedEnd: true,
      displacedEarth: false,
      visibleCondition: 'shaped, use unverified',
      end: { shape: 'tapered blunt point', meetsCriterion: true },
    });
    // Conservation: the piece plus the dust on the ground equals the input wood; nothing else made.
    expect(massOf(w, released)).toBeCloseTo(1.03, 8);
    const dust = w.stacks.filter((s) => s.resource === WOOD);
    expect(dust).toHaveLength(1);
    expect(dust[0]).toMatchObject({
      owner: null,
      quantity: 70,
      origin: BRANCHES,
      position: AT_ROCK,
      processing: {
        diggingToolDebris: { work: j.id, source: j.blank, material: 'branch' },
      },
    });
    expect(massOf(w, dust[0] as V7Stack)).toBeCloseTo(0.07, 8);
    expect(wood(w)).toBeCloseTo(wood(f.w), 8);
    expect(wood(w)).toBeCloseTo(1.76, 8);
    expect(t.verifiedAt).toBeNull();
    // From the source: the rest of the stock, the shaped piece and the dust; nothing else is made.
    expect(
      w.stacks
        .filter((s) => s.origin === BRANCHES)
        .map((s) => s.resource)
        .sort(),
    ).toEqual(['branch', 'branch', WOOD]);
    // The stone outcrop is harder than the wood by the scratch rule's margin: it is not worn.
    expect(count(full7, 'digging-tool-abrasive-wear')).toBe(0);
    expect(j.abrasiveWorn).toBe(0);
    expect(w.stacks.filter((s) => s.resource === GRIT)).toHaveLength(0);
    // Personal records: the first abrasion is new verified information; repeats are not.
    const trials = full7
      .filter((e) => e.type === 'trial-result' && e.actor === 'moss')
      .map((e) => e.data.newInformation);
    expect(trials).toHaveLength(7);
    expect(trials.filter((x) => x === true)).toHaveLength(1);
    expect(
      actor(w).memory.knowledge?.['branch:end-abrasion:on-stone:removes-wood'],
    ).toMatchObject({ verified: true });
    // No reward: no practice milestone and the same wellbeing sources as before.
    expect(count(full7, 'practice-confirmed')).toBe(0);
    expect(
      actor(w).wellbeing.sources.map((s) => [s.source, s.lastEvent]),
    ).toEqual(actor(f.w).wellbeing.sources.map((s) => [s.source, s.lastEvent]));
    // Event data and records carry no excluded word.
    const shown = JSON.stringify({
      events: full7.filter((e) => e.type.startsWith('digging-tool-')),
      records: [released.processing, dust[0]?.processing],
    });
    expect(shown).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(shown).not.toMatch(EXTRA_EXCLUDED);
    // Replay: the same inputs give the same world.
    let replay = v7Clone(f.w);
    for (let i = 0; i < 7; i++) replay = step(replay, { moss: shape(f) }).world;
    expect(v7Signature(replay)).toBe(v7Signature(fullJob().after));
  });

  it('abrades on an own stone piece resting on firm ground; the scratch rule wears an equally hard abrasive into grit and a softer one removes nothing', () => {
    const f = setup();
    // Gather a stone from the outcrop and work anywhere on firm ground.
    let w = fed(
      step(f.w, {
        moss: { interface: 'gather', args: { target: ROCK, quantity: 1 } },
      }).world,
    );
    const stone = own(w, 'stone')[0]?.id ?? '';
    expect(stone).not.toBe('');
    w = at(w, AWAY);
    const withStone = shape(f, { abrasive: stone });
    const quote = step(w, {
      moss: { ...withStone, args: { ...withStone.args, quoteOnly: true } },
    });
    expect(data(quote.world, 'digging-tool-quoted')?.quote).toMatchObject({
      abrasive: { ref: stone, kind: 'item', support: 'ground:11:22' },
    });
    let r = cost(w, withStone);
    expect(r.energy).toBe(1);
    expect(work(r.world).removed).toBe(0.01);
    // The stone, harder than the wood by the margin, is unchanged.
    expect(stack(r.world, stone).physical).toBeUndefined();
    expect(events(r.world, 'digging-tool-abrasive-wear')).toHaveLength(0);
    // Not on a wet bank.
    const wet = at(w, BANK.at);
    expect(unchanged(wet, withStone)).toMatch(/firm ordinary ground/);
    // A rigid, inedible, noncombustible abrasive exactly as hard as the wood: both faces wear.
    const equal = v7Clone(w);
    equal.resources.push({
      id: 'test-soft-stone',
      name: 'Test soft stone',
      mass: 2,
      nutrition: 0,
      toxicity: 0,
      color: '#777777',
      properties: {
        hardness: 3,
        flexibility: 0,
        fuel: 0,
        decay: 0,
        minGrowth: 0,
        optimalGrowth: 20,
        moisture: 0.1,
      },
    });
    stack(equal, stone).resource = 'test-soft-stone';
    r = cost(equal, withStone);
    expect(r.energy).toBe(1);
    expect(work(r.world)).toMatchObject({ removed: 0.01, abrasiveWorn: 0.01 });
    const soft = stack(r.world, stone);
    expect(massOf(r.world, soft)).toBeCloseTo(2 - 0.01, 8);
    expect(soft.processing?.diggingToolAbrasion).toMatchObject({
      contacts: 100,
      worn: 0.01,
    });
    const grit = r.world.stacks.filter((s) => s.resource === GRIT);
    expect(grit).toHaveLength(1);
    expect(grit[0]).toMatchObject({
      owner: null,
      quantity: 10,
      processing: { diggingToolDebris: { source: stone } },
    });
    expect(data(r.world, 'digging-tool-abrasive-wear')).toMatchObject({
      abrasiveWear: 0.01,
      abrasiveMassRepresented: true,
    });
    // A softer abrasive removes nothing: a paid failure that ends the work and returns the piece.
    const softer = v7Clone(equal);
    const row = softer.resources.find((x) => x.id === 'test-soft-stone');
    if (row?.properties) row.properties.hardness = 2;
    r = cost(softer, withStone);
    expect(r.energy).toBe(1);
    expect(events(r.world, 'digging-tool-no-removal')).toHaveLength(1);
    expect(events(r.world, 'digging-tool-ended')).toHaveLength(1);
    expect(work(r.world)).toMatchObject({ status: 'completed', removed: 0 });
    const piece = stack(r.world, work(r.world).blank);
    expect(piece.reservedFor).toBeUndefined();
    expect(massOf(r.world, piece)).toBeCloseTo(1.1, 8);
    expect(tool(piece)?.end.tip).toBeCloseTo(DIAMETER, 6);
    expect(r.world.stacks.filter((s) => s.resource === WOOD)).toHaveLength(0);
    expect(data(r.world, 'digging-tool-no-removal')?.view).toMatchObject({
      phase: 'contact without removal',
      finishedEnd: false,
    });
  });

  it('use strokes move at most 0.001 m3 of loose soil per stroke into a heap beside the patch; the first nonzero stroke verifies the tool', () => {
    const { after } = fullJob();
    const item = toolId(after);
    let w = at(after, FOREST.at);
    const before = v7Clone(w);
    // First stroke at the default load 0.25 on forest floor: the declared cap is reached.
    const r = cost(w, use(item, FOREST.patch));
    expect(r.energy).toBe(1);
    w = r.world;
    expect(data(w, 'digging-tool-stroke')).toMatchObject({
      tool: item,
      ground: 'forest floor',
      load: 0.25,
      outcome: 'displaced',
      displaced: 0.001,
      tipWear: 0.0001,
      reason: null,
    });
    expect(Number(data(w, 'digging-tool-stroke')?.penetration)).toBeGreaterThan(
      0.04,
    );
    expect(events(w, 'digging-tool-displaced')).toHaveLength(1);
    expect(events(w, 'digging-tool-use-verified')).toHaveLength(1);
    expect(data(w, 'digging-tool-displaced')?.view).toMatchObject({
      phase: 'soil displacement',
      displacedEarth: true,
      displaced: 0.001,
    });
    const t = tool(stack(w, item));
    expect(t).toMatchObject({
      status: 'shaped',
      verified: true,
      displaced: 0.001,
      strokes: { use: 1 },
      mass: { use: 0.0001 },
    });
    expect(data(w, 'digging-tool-use-verified')?.condition).toMatchObject({
      state: 'use-verified tool',
    });
    // Soil is moved, not deleted: the hole equals the heap beside the patch, toward the worker.
    const p = patch(w, FOREST.patch);
    expect(p).toMatchObject({
      x: 14.5,
      y: 18,
      looseVolume: LOOSE,
      displaced: 1000,
      heap: { x: 14.5, y: 18.25, volume: 1000 },
      strokes: 1,
      toolDust: 0.0001,
    });
    // Tip wear leaves the soil with the tool's lost mass; the wood ledger stays closed.
    expect(wood(w)).toBeCloseTo(wood(before), 8);
    expect(massOf(w, stack(w, item))).toBeCloseTo(1.03 - 0.0001, 8);
    // No resource, food or gathered item appears; no reward refreshes any wellbeing source.
    expect(w.stacks.length).toBe(before.stacks.length);
    expect(count(w.events, 'practice-confirmed')).toBe(0);
    expect(events(w, 'information-confirmed')[0]?.interface).toBe(id);
    expect(
      actor(w).wellbeing.sources.map((s) => [s.source, s.lastEvent]),
    ).toEqual(
      actor(before).wellbeing.sources.map((s) => [s.source, s.lastEvent]),
    );
    // Repeated strokes deepen the hole until the loose layer gives out; each moves at most the cap.
    const { w: dug, log } = run(fed(w), use(item, FOREST.patch), 9);
    const moved = log
      .filter((e) => e.type === 'digging-tool-stroke' && e.actor === 'moss')
      .map((e) => Number(e.data.displaced));
    expect(moved.every((v) => v >= 0 && v <= 0.001)).toBe(true);
    expect(moved.slice(0, 5)).toEqual([0.001, 0.001, 0.001, 0.001, 0.001]);
    expect(moved.at(-1) ?? 1).toBeLessThan(0.0001);
    const deep = patch(dug, FOREST.patch);
    if (!deep) throw new Error('Missing patch.');
    expect(deep.displaced).toBe(deep.heap.volume);
    expect(deep.displaced).toBeLessThanOrEqual(LOOSE);
    expect(count(log, 'digging-tool-use-verified')).toBe(0);
    expect(wood(dug)).toBeCloseTo(wood(before), 8);
    // Tip wear blunts the end slightly each stroke.
    expect(tool(stack(dug, item))?.end.tip).toBeGreaterThan(t?.end.tip ?? 1);
  });

  it('displacement is resolved from the end, the soil and the load: meadow turf yields little, drier soil less, and an unshaped blank cannot be used', () => {
    const { after, before: unshaped, branch } = fullJob();
    const item = toolId(after);
    const meadow = at(after, MEADOW.at);
    const light = step(meadow, { moss: use(item, MEADOW.patch) }).world;
    const firm = step(meadow, {
      moss: use(item, MEADOW.patch, { load: 0.3 }),
    }).world;
    const a = Number(data(light, 'digging-tool-stroke')?.displaced),
      b = Number(data(firm, 'digging-tool-stroke')?.displaced);
    expect(data(light, 'digging-tool-stroke')).toMatchObject({
      ground: 'meadow ground',
      outcome: 'displaced',
    });
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(0.0001);
    expect(b).toBeGreaterThan(a);
    // Drought dries the forest floor: the same stroke enters less deeply and moves less.
    const dry = at(after, FOREST.at);
    dry.config.development?.hazards.push({
      id: 'test-drought',
      kind: 'drought',
      x: FOREST.patch.x,
      y: FOREST.patch.y,
      radius: 3,
      start: dry.tick - 40,
      duration: 100,
      recovery: 80,
      severity: 0.3,
    });
    const wet = step(at(after, FOREST.at), {
      moss: use(item, FOREST.patch),
    }).world;
    const parched = step(dry, { moss: use(item, FOREST.patch) }).world;
    expect(Number(data(parched, 'digging-tool-stroke')?.moisture)).toBeLessThan(
      0.65,
    );
    expect(
      Number(data(parched, 'digging-tool-stroke')?.penetration),
    ).toBeLessThan(Number(data(wet, 'digging-tool-stroke')?.penetration));
    // Unworked stock and an unfinished blank are not tools.
    const stock = at(unshaped, FOREST.at);
    expect(unchanged(stock, use(branch, FOREST.patch))).toMatch(
      /not a digging tool/,
    );
    const started = fed(
      step(at(unshaped, AT_ROCK), {
        moss: shape({ branch }),
      }).world,
    );
    const blank = work(started).blank;
    const cancelled = fed(step(started, { moss: act('cancel') }).world);
    expect(
      unchanged(at(cancelled, FOREST.at), use(blank, FOREST.patch)),
    ).toMatch(/unfinished blank/);
  });

  it('rocky ground, a wet bank, waterlogged soil and water resist: paid strokes that move nothing', () => {
    const { after } = fullJob();
    const item = toolId(after);
    const cases = [
      {
        site: ROCKY,
        ground: 'rocky ground',
        reason: /rocky ground/,
        wear: 0.0001,
      },
      { site: BANK, ground: 'wet bank', reason: /saturated/, wear: 0.0001 },
      { site: RIVER, ground: 'water', reason: /open water/, wear: 0 },
      { site: SHALLOW, ground: 'shallow water', reason: /open water/, wear: 0 },
    ];
    for (const c of cases) {
      const w = at(after, c.site.at);
      const r = cost(w, use(item, c.site.patch));
      expect(r.energy).toBe(1);
      expect(data(r.world, 'digging-tool-stroke')).toMatchObject({
        ground: c.ground,
        outcome: 'no-displacement',
        displaced: 0,
        penetration: 0,
        tipWear: c.wear,
      });
      expect(String(data(r.world, 'digging-tool-stroke')?.reason)).toMatch(
        c.reason,
      );
      expect(events(r.world, 'digging-tool-displaced')).toHaveLength(0);
      expect(events(r.world, 'digging-tool-use-verified')).toHaveLength(0);
      expect(data(r.world, 'digging-tool-no-displacement')?.view).toMatchObject(
        { phase: 'failed soil stroke', displacedEarth: false },
      );
      expect(tool(stack(r.world, item))?.verified).toBe(false);
      const p = patch(r.world, c.site.patch);
      if (c.wear > 0) expect(p).toMatchObject({ displaced: 0, strokes: 1 });
      else expect(p).toBeUndefined();
      expect(wood(r.world)).toBeCloseTo(wood(w), 8);
    }
    // Waterlogged forest floor: the loosened soil flows back.
    const flooded = at(after, FOREST.at);
    flooded.config.development?.hazards.push({
      id: 'test-waterlogging',
      kind: 'waterlogging',
      x: FOREST.patch.x,
      y: FOREST.patch.y,
      radius: 3,
      start: flooded.tick - 40,
      duration: 100,
      recovery: 80,
      severity: 0.8,
    });
    const r = cost(flooded, use(item, FOREST.patch));
    expect(r.energy).toBe(1);
    expect(data(r.world, 'digging-tool-stroke')).toMatchObject({
      outcome: 'no-displacement',
      displaced: 0,
    });
    expect(String(data(r.world, 'digging-tool-stroke')?.reason)).toMatch(
      /waterlogged/,
    );
  });

  it('a load above the wood strength splits the end, a split end breaks at half of it with the fragment conserved, and maintenance re-points a broken end but not a split', () => {
    const { after } = fullJob();
    const item = toolId(after);
    let w = at(after, FOREST.at);
    const start = wood(w);
    // 0.35 is above the branch strength 0.3 (the probe press rule): the end splits, nothing moves.
    let r = cost(w, use(item, FOREST.patch, { load: 0.35 }));
    expect(r.energy).toBe(1);
    w = fed(r.world);
    expect(events(w, 'digging-tool-cracked')).toHaveLength(1);
    expect(data(w, 'digging-tool-stroke')).toMatchObject({
      outcome: 'split',
      displaced: 0,
    });
    expect(tool(stack(w, item))).toMatchObject({
      status: 'shaped',
      condition: 'cracked',
      cracks: 1,
      verified: false,
    });
    // A split end meeting the criterion has nothing to maintain; abrasion cannot heal the split.
    expect(
      unchanged(
        at(w, AT_ROCK),
        act('maintain', { target: item, abrasive: ROCK }),
      ),
    ).toMatch(/nothing to maintain.*cannot heal a split/);
    // A split end holds half: 0.15 still works and verifies the tool.
    r = cost(w, use(item, FOREST.patch, { load: 0.15 }));
    w = fed(r.world);
    expect(data(w, 'digging-tool-stroke')?.outcome).toBe('displaced');
    expect(tool(stack(w, item))).toMatchObject({
      condition: 'cracked',
      verified: true,
    });
    // 0.25 on a split end breaks the working end off; the fragment lies at the patch.
    const length = tool(stack(w, item))?.end.length ?? 0;
    r = cost(w, use(item, FOREST.patch, { load: 0.25 }));
    expect(r.energy).toBe(1);
    w = fed(r.world);
    expect(events(w, 'digging-tool-broke')).toHaveLength(1);
    const broken = tool(stack(w, item));
    expect(broken).toMatchObject({
      status: 'broken',
      condition: 'broken',
      cracks: 0,
    });
    if (!broken) throw new Error('Missing tool record.');
    expect(broken.end.tip).toBeCloseTo(broken.end.diameter, 8);
    expect(broken.end.length).toBeLessThan(length);
    expect(broken.mass.fragments).toBeGreaterThan(0.03);
    const fragment = String(data(w, 'digging-tool-broke')?.fragment);
    expect(stack(w, fragment)).toMatchObject({
      resource: WOOD,
      owner: null,
      origin: BRANCHES,
      position: FOREST.patch,
      processing: { diggingToolDebris: { kind: 'broken-off working end' } },
    });
    expect(massOf(w, stack(w, fragment))).toBeCloseTo(broken.mass.fragments, 8);
    expect(wood(w)).toBeCloseTo(start, 8);
    // A broken end is refused at no cost until it is maintained.
    expect(unchanged(w, use(item, FOREST.patch))).toMatch(/broken/);
    // Maintenance: the same abrasion strokes re-point the end from its broken face.
    w = at(w, AT_ROCK);
    const maintain = act('maintain', { target: item, abrasive: ROCK });
    const quote = step(w, {
      moss: act('maintain', { target: item, abrasive: ROCK, quoteOnly: true }),
    }).world;
    expect(data(quote, 'digging-tool-quoted')?.quote).toMatchObject({
      plan: 'maintain',
      strokes: 7,
    });
    const first = run(w, maintain, 4);
    expect(first.spent).toEqual([1, 1, 1, 1]);
    expect(work(first.w)).toMatchObject({ plan: 'maintain', status: 'paused' });
    // The reserved tool continues by resume (its own id is reserved while the work is open).
    expect(unchanged(fed(first.w), maintain)).toMatch(/reserved-material/);
    const second = run(fed(first.w), act('resume'), 3);
    expect(second.spent).toEqual([1, 1, 1]);
    expect(count(second.log, 'digging-tool-maintained')).toBe(1);
    const fixed = tool(stack(second.w, item));
    expect(fixed).toMatchObject({
      status: 'shaped',
      condition: 'sound',
      strokes: { maintenance: 7 },
    });
    expect(fixed?.end.tip ?? 1).toBeLessThanOrEqual(0.35 * DIAMETER);
    // Maintenance removed real material: the piece only gets lighter.
    expect(massOf(second.w, stack(second.w, item))).toBeLessThan(
      massOf(w, stack(w, item)) - 0.06,
    );
    expect(wood(second.w)).toBeCloseTo(start, 8);
    expect(stack(second.w, item)).toMatchObject({ owner: 'moss' });
    expect(stack(second.w, item).reservedFor).toBeUndefined();
  });

  it('refuses invalid requests before any charge', () => {
    const f = setup();
    const w = f.w;
    expect(unchanged(w, act('shape', { abrasive: ROCK }))).toMatch(
      /Give target/,
    );
    expect(unchanged(w, act('dig'))).not.toBe('');
    // Quantities: exact tenths, one piece of at most one unit, long enough for a working end.
    expect(unchanged(w, shape(f, { quantity: 0.15 }))).toMatch(/exact tenths/);
    expect(unchanged(w, shape(f, { quantity: 1.5 }))).not.toBe('');
    expect(unchanged(w, shape(f, { quantity: 0.4 }))).toMatch(
      /needs a 0.3 m shaft/,
    );
    // Abrasive: required, in reach, rigid, inedible and not combustible, not granular or a plant.
    expect(unchanged(w, shape(f, { abrasive: '' }))).toMatch(/needs abrasive/);
    expect(unchanged(w, shape(f, { abrasive: f.branch }))).toMatch(
      /must be different/,
    );
    expect(unchanged(at(w, AWAY), shape(f))).toMatch(/within reach/);
    expect(
      unchanged(at(w, AT_BRANCHES), shape(f, { abrasive: BRANCHES })),
    ).toMatch(/combustible/);
    const sand = v7Clone(w);
    sand.stacks.push({
      id: 'item-0-moss-997',
      resource: 'sand',
      quantity: 1,
      quantityTenths: 10,
      position: { ...actor(sand).position },
      owner: 'moss',
      origin: 'test',
    });
    expect(unchanged(sand, shape(f, { abrasive: 'item-0-moss-997' }))).toMatch(
      /granular/,
    );
    // Target: own wood only.
    const stone = fed(
      step(w, {
        moss: { interface: 'gather', args: { target: ROCK, quantity: 1 } },
      }).world,
    );
    const stoneId = own(stone, 'stone')[0]?.id ?? '';
    expect(
      unchanged(stone, act('shape', { target: stoneId, abrasive: ROCK })),
    ).toMatch(/not represented as wood/);
    const theirs = v7Clone(w);
    stack(theirs, f.branch).owner = 'sol';
    expect(unchanged(theirs, shape(f))).not.toBe('');
    // Too little energy for the first stroke.
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.5;
    expect(unchanged(tired, shape(f))).toMatch(/needs 1 energy/);
    // Nothing open to resume, pause or cancel; nothing to inspect.
    for (const mode of ['resume', 'pause', 'cancel'])
      expect(unchanged(w, act(mode))).toMatch(/no open digging-tool work/);
    expect(unchanged(w, act('inspect'))).toMatch(/Give target/);
    // Use: a soil point in reach, clear of objects.
    const { after } = fullJob();
    const item = toolId(after);
    const ready = at(after, FOREST.at);
    expect(unchanged(ready, use(item, { x: 20, y: 18 }))).toMatch(
      /out of reach/,
    );
    expect(
      unchanged(
        at(after, { x: 14.84, y: 18.2 }),
        use(item, { x: 14.84, y: 18.71 }),
      ),
    ).toMatch(/overlaps commons-root-1-0/);
    expect(unchanged(ready, act('use', { target: item }))).toMatch(
      /Give x and y/,
    );
    const weak = v7Clone(ready);
    actor(weak).vitals.energy = 0.9;
    expect(unchanged(weak, use(item, FOREST.patch))).toMatch(/needs 1 energy/);
    // One open work at a time; its abrasive is pinned.
    const started = fed(step(w, { moss: shape(f) }).world);
    expect(
      unchanged(
        started,
        act('shape', { target: f.branch, quantity: 0.6, abrasive: ROCK }),
      ),
    ).toMatch(/still open/);
    expect(unchanged(started, shape(f, { quoteOnly: true }))).toMatch(
      /still open/,
    );
    expect(unchanged(started, shape(f, { abrasive: f.branch }))).toMatch(
      /pinned/,
    );
    expect(
      unchanged(started, act('resume', { workId: 'manual-0-none-1' })),
    ).toMatch(/No digging-tool work of yours/);
    // The reserved piece cannot be used, given or shaped elsewhere.
    expect(unchanged(started, use(work(started).blank, FOREST.patch))).not.toBe(
      '',
    );
  });

  it('pauses at no charge, resumes only with valid prerequisites, cancels once without refunds, and continues an unfinished blank later', () => {
    const f = setup();
    let r = cost(f.w, shape(f));
    expect(r.energy).toBe(1);
    let w = r.world;
    expect(work(w)).toMatchObject({ status: 'active', strokes: 1, segment: 1 });
    // Doing something else pauses the work at no charge.
    const idle = step(w).world;
    expect(events(idle, 'digging-tool-paused')).toHaveLength(1);
    expect(work(idle)).toMatchObject({ status: 'paused', strokes: 1 });
    expect(data(idle, 'digging-tool-paused')?.view).toMatchObject({
      badge: null,
      finishedEnd: false,
    });
    // The same action continues after rechecks and starts a new segment.
    r = cost(fed(idle), shape(f));
    expect(r.energy).toBe(1);
    w = r.world;
    expect(events(w, 'digging-tool-resumed')).toHaveLength(1);
    expect(work(w)).toMatchObject({ status: 'active', strokes: 2, segment: 1 });
    // An explicit pause costs nothing; a second pause is refused.
    r = cost(w, act('pause'));
    expect(r.energy).toBe(0);
    w = fed(r.world);
    expect(work(w)).toMatchObject({ status: 'paused' });
    expect(unchanged(w, act('pause'))).toMatch(/already paused/);
    // Resume is refused at no cost away from the abrasive, or without energy.
    expect(unchanged(at(w, AWAY), act('resume'))).toMatch(/within reach/);
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.5;
    expect(unchanged(tired, act('resume'))).toMatch(/needs 1 energy/);
    r = cost(w, act('resume', { workId: work(w).id }));
    expect(r.energy).toBe(1);
    w = r.world;
    expect(work(w)).toMatchObject({ status: 'active', strokes: 3 });
    // Moving away during continuing work pauses it before any charge.
    const moved = at(w, AWAY);
    actor(moved).vitals = { ...actor(w).vitals };
    const paused = step(moved, { moss: shape(f) });
    expect(paused.outcomes.moss?.success).toBe(true);
    expect(actor(paused.world).vitals.energy).toBe(
      actor(step(moved).world).vitals.energy,
    );
    expect(work(paused.world)).toMatchObject({
      status: 'paused',
      paidEnergy: 3,
    });
    // Cancel returns the piece once as it now is; spent energy and removed wood are not refunded.
    const before = fed(at(paused.world, AT_ROCK));
    const blank = work(before).blank;
    r = cost(before, act('cancel'));
    expect(r.energy).toBe(0);
    w = r.world;
    expect(work(w)).toMatchObject({
      status: 'stopped',
      stage: 'cancelled',
      paidEnergy: 3,
      removed: 0.03,
    });
    expect(data(w, 'digging-tool-cancelled')?.released).toEqual([blank]);
    expect(stack(w, blank)).toMatchObject({ owner: 'moss' });
    expect(stack(w, blank).reservedFor).toBeUndefined();
    expect(tool(stack(w, blank))).toMatchObject({ status: 'unfinished' });
    expect(massOf(w, stack(w, blank))).toBeCloseTo(1.07, 8);
    expect(w.stacks.find((s) => s.resource === WOOD)?.quantity).toBe(30);
    expect(wood(w)).toBeCloseTo(1.76, 8);
    expect(unchanged(fed(w), act('cancel'))).toMatch(
      /no open digging-tool work/,
    );
    expect(
      unchanged(fed(w), act('cancel', { workId: work(before).id })),
    ).toMatch(/already settled/);
    // The unfinished blank is worked whole later, continuing from its recorded end.
    const again = fed(w);
    expect(
      unchanged(
        again,
        act('shape', { target: blank, quantity: 0.5, abrasive: ROCK }),
      ),
    ).toMatch(/worked whole/);
    const later = run(
      again,
      act('shape', { target: blank, abrasive: ROCK }),
      4,
    );
    expect(later.spent).toEqual([1, 1, 1, 1]);
    expect(count(later.log, 'digging-tool-released')).toBe(1);
    expect(tool(stack(later.w, blank))).toMatchObject({
      status: 'shaped',
      strokes: { shaping: 7 },
    });
  });

  it('death ends the work and leaves the piece and the dust at the worksite once', () => {
    const f = setup();
    const w = fed(step(f.w, { moss: shape(f) }).world);
    const dying = v7Clone(w);
    actor(dying).vitals.health = 0.0001;
    actor(dying).vitals.satiety = 0;
    const j = work(dying);
    const where = { x: j.x, y: j.y };
    const died = step(dying).world;
    expect(events(died, 'died')).toHaveLength(1);
    expect(work(died)).toMatchObject({ status: 'stopped', stage: 'failed' });
    expect(data(died, 'digging-tool-failed')).toMatchObject({ cause: 'death' });
    expect(stack(died, j.blank)).toMatchObject({
      owner: null,
      position: where,
    });
    expect(stack(died, j.blank).reservedFor).toBeUndefined();
    expect(tool(stack(died, j.blank))).toMatchObject({ status: 'unfinished' });
    expect(died.stacks.filter((s) => s.resource === WOOD)).toHaveLength(1);
    expect(died.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
    expect(wood(died)).toBeCloseTo(wood(w), 8);
  });

  it('is owner-only: no one else can continue, pause or cancel the work or use the tool, and a given tool serves its new owner', () => {
    const f = setup();
    let w = fed(step(f.w, { moss: shape(f) }).world);
    w = learn(at(w, { x: 10.4, y: 21.6 }, 'lin'), 'lin');
    const j = work(w);
    for (const mode of ['resume', 'pause', 'cancel'])
      expect(unchanged(w, act(mode, { workId: j.id }), 'lin')).toMatch(
        /No digging-tool work of yours/,
      );
    expect(unchanged(w, act('cancel'), 'lin')).toMatch(
      /no open digging-tool work/,
    );
    expect(unchanged(w, shape(f), 'lin')).toMatch(
      /absent-or-inaccessible|own items/,
    );
    // Moss's reserved piece cannot be given away until the work ends.
    expect(
      unchanged(w, {
        interface: 'give',
        args: { target: j.blank, quantity: 1, recipient: 'lin' },
      }),
    ).not.toBe('');
    // A released tool is Moss's; Lin cannot use it until Moss hands it over.
    const { after } = fullJob();
    const item = toolId(after);
    let shared = learn(at(after, { x: 15, y: 18.4 }, 'lin'), 'lin');
    shared = at(shared, FOREST.at);
    expect(unchanged(shared, use(item, FOREST.patch), 'lin')).not.toBe('');
    const given = step(shared, {
      moss: {
        interface: 'give',
        args: { target: item, quantity: 1, recipient: 'lin' },
      },
    });
    expect(given.outcomes.moss?.success).toBe(true);
    const handed = fed(given.world);
    // The same piece, with its record, now belongs to Lin under the ordinary give rule.
    const lent = String(data(handed, 'given')?.item);
    expect(stack(handed, lent).owner).toBe('lin');
    expect(tool(stack(handed, lent))).toMatchObject({ status: 'shaped' });
    expect(unchanged(handed, use(lent, FOREST.patch))).toMatch(
      /your own shaped digging tool|absent-or-inaccessible/,
    );
    const r = cost(handed, use(lent, FOREST.patch), 'lin');
    expect(r.energy).toBe(1);
    expect(data(r.world, 'digging-tool-stroke', 'lin')).toMatchObject({
      outcome: 'displaced',
    });
  });

  it('inspects a piece and a soil patch by hand and eye for 0.5 energy, reporting only observable facts', () => {
    const f = setup();
    const w = at(f.w, FOREST.at);
    const r = cost(w, act('inspect', { target: f.branch, ...FOREST.patch }));
    expect(r.energy).toBe(0.5);
    const d = data(r.world, 'digging-tool-inspected');
    expect(d?.piece).toMatchObject({
      item: f.branch,
      state: 'unworked stock',
      pieces: { whole: 1 },
      ends: 'flat broken ends',
      condition: 'sound, no split seen',
      achievableEnd: {
        shaftAtLeast: 0.3,
        smallestPiece: 0.5,
        possibleHere: true,
      },
    });
    expect(d?.soil).toMatchObject({
      ground: 'forest floor',
      moisture: 0.65,
      yielding: true,
      reason: null,
      looseDepth: 0.15,
      dug: null,
    });
    // Nothing hidden: no resistance, hardness or strength numbers are reported.
    expect(JSON.stringify(d)).not.toMatch(/resistance|hardness|strength/);
    expect(v7Signature(r.world.stacks)).toBe(v7Signature(step(w).world.stacks));
    expect(
      actor(r.world).memory.knowledge?.[`${f.branch}:digging-inspection`],
    ).toMatchObject({ verified: false });
    // Inspecting someone else's item is refused at no cost.
    const lin = own(w, 'berry', 'lin')[0]?.id ?? 'item-none';
    expect(unchanged(w, act('inspect', { target: lin }))).not.toBe('');
  });
});
