import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  SAMPLE_EXCHANGE,
  V7_PACKAGES,
  continuousRegistry,
  forestClimate,
  foodUnitMass,
  foodWaterRead,
  sampleExchange,
  sampleGeometry,
  saturationDensity,
  v7Clone,
  v7Distance,
  v7Install,
  v7ShapeDistance,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Data,
  V7Json,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 120_000 });

const ID = 'compare-material-samples';
const KIT = 'beam-mass-comparator';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition/i;
/** Real ex21 sources near Moss: a fallen-branch canopy, the stone outcrop and a root patch. */
const TREE = 'canopy-69';
const ROCK = 'start-2-stone';
const ROOTS = 'commons-root-1-0';
/** Moss's start on firm meadow ground and two layer centres within hand reach of it. */
const STAND = { x: 15.1, y: 16.91 };
const SPOT = { x: 15.5, y: 16.55 };
const SPOT2 = { x: 15.6, y: 17.2 };
/** A point within reach whose footprint overlaps the solid canopy trunk. */
const ON_TREE = { x: 14.75, y: 17.0 };
/** JSON.stringify of the reused packages, hashed before this handoff changed their files. */
const BEFORE: Record<string, string> = {
  'lever-mass-comparator':
    '888531bb0cd81a57b01d5572d97ef7a5f4f9cc149ffb945efc12414458f2571f',
  'thin-slice-food-drying-trial':
    '70acae9a94e8cfc871452a41a947050f192504f5fc6e4aeeb8a2f0b3f6933299',
  'air-dry-food-trial':
    '71c63304b930efbeddad60f7f6b0cb19ea8e71392dac1dbba6540ad28f673cc9',
  'food-air-exposure-trial':
    'e09d11fb05989765f8e20b2e3fb18e8df4150a0e1c8e733a557baa8aee4a61a9',
};
const PIECES = `long:${ID}:pieces`;
const LEDGER = `long:${ID}:exchange`;

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
const events = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === type);
const data = (w: V7World, type: string) =>
  events(w, type).at(-1)?.data as Record<string, unknown> | undefined;
const stack = (w: V7World, item: string): V7Stack => {
  const s = w.stacks.find((s) => s.id === item);
  if (!s) throw new Error(`Missing stack ${item}.`);
  return s;
};
type Weighing = {
  event: string;
  role: string;
  item: string;
  ratio: number[] | null;
  calibration: Record<string, unknown>;
  resolution: number;
  uncertainty: number | null;
};
type Trial = {
  id: string;
  owner: string;
  status: string;
  stage: string;
  sample: string;
  reference: string;
  quantity: number;
  paidEnergy: number;
  escrow: string[];
  preparation: Record<string, unknown> | null;
  support: Record<string, unknown> | null;
  supportItem: Record<string, unknown> | null;
  placement: Record<string, unknown> | null;
  placedAt: number | null;
  weighings: Weighing[];
  turns: number;
  moves: number;
  rainRounds: number;
  wet: boolean;
  comparison: Record<string, unknown> | null;
  takenBy: string | null;
};
const trials = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === ID,
    )
    .map(([, v]) => v as unknown as Trial);
const trial = (w: V7World): Trial => {
  const j = trials(w).at(-1);
  if (!j) throw new Error('Missing trial.');
  return j;
};
const tenths = (stacks: { quantity: number; resource: string }[], r: string) =>
  stacks
    .filter((s) => s.resource === r)
    .reduce((n, s) => n + Math.round(s.quantity * 10), 0) / 10;
/** Every unit of a resource: stacks anywhere, comparator parts and held supports. */
function total(w: V7World, resource: string) {
  const parts = w.objects.flatMap((o) =>
    Array.isArray(o.data.components)
      ? (o.data.components as unknown as V7Stack[])
      : [],
  );
  const held = trials(w).flatMap((j) =>
    j.supportItem ? [j.supportItem as unknown as V7Stack] : [],
  );
  return tenths([...w.stacks, ...parts, ...held], resource);
}
const water = (s: V7Stack) => (s.physical?.unitWater ?? 0) * s.quantity;
const solids = (s: V7Stack) => (s.physical?.unitSolids ?? 0) * s.quantity;
/** The process's hidden audit ledger; every account starts at zero. */
function ledger(w: V7World) {
  const l = (w.state[LEDGER] ?? {}) as Record<string, number | undefined>;
  const n = (k: string) => l[k] ?? 0;
  return {
    evaporated: n('evaporated'),
    condensed: n('condensed'),
    rain: n('rain'),
    latentHeat: n('latentHeat'),
    heatFromAir: n('heatFromAir'),
    pieceHeat: n('pieceHeat'),
  };
}
type Args = Record<string, V7Json | undefined>;
/** An action of this operation; arguments given as undefined are left out. */
function mode(m: string, extra: Args = {}): V7Action {
  const args: Record<string, V7Json> = { mode: m };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) args[k] = v;
  return { interface: ID, args };
}
const kit = (m: string, extra: V7Data = {}): V7Action => ({
  interface: KIT,
  args: { mode: m, ...extra },
});
/** Keep everyone fed and rested so the tests isolate the operation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
/** A free standing point for `who` at distance d from (x, y). */
function free(w: V7World, x: number, y: number, d: number, who: string) {
  for (let k = 0; k < 16; k++) {
    const p = {
      x: x + d * Math.cos((k * Math.PI) / 8),
      y: y + d * Math.sin((k * Math.PI) / 8),
    };
    if (
      w.objects.every(
        (o) => !o.spatial.solid || v7ShapeDistance(p, o.spatial) > 0.25,
      ) &&
      w.actors.every((a) => a.id === who || v7Distance(a.position, p) > 0.5)
    )
      return p;
  }
  throw new Error('No free fixture position.');
}
function gather(w: V7World, source: string, quantity = 1) {
  const o = w.objects.find((x) => x.id === source);
  if (!o) throw new Error('Missing fixture object.');
  const r = o.spatial.shape.kind === 'circle' ? o.spatial.shape.radius : 0.3;
  actor(w).position = free(w, o.spatial.x, o.spatial.y, r + 0.45, 'moss');
  const g = step(w, {
    moss: { interface: 'gather', args: { target: source, quantity } },
  });
  expect(g.outcomes.moss?.success).toBe(true);
  const item = g.world.events.find(
    (e) => e.type === 'gathered' && e.actor === 'moss',
  )?.data.item;
  if (typeof item !== 'string') throw new Error('Missing gathered item.');
  return { w: fed(g.world), item };
}
function study(w: V7World, ability: string) {
  let next = step(fed(w), {
    moss: { interface: 'learn', args: { ability } },
  }).world;
  for (let i = 0; i < 3; i++) next = step(fed(next)).world;
  expect(actor(next).mastered).toContain(ability);
  return fed(next);
}
function genesis() {
  return initialLongWorld('long-ex21', 'long-culture-v2-oldgoal', {
    seed: 20261202,
    development: 8,
    tokens: 1500000,
  });
}
function installed() {
  const g = genesis();
  let w = v7Clone(v7Install(g, continuousRegistry(g), `${KIT}@1`));
  w = v7Clone(v7Install(w, continuousRegistry(w), `${ID}@1`));
  return fed(w);
}
/** The action fails and changes no vitals, stacks, objects or state compared with waiting. */
function unchanged(w: V7World, action: V7Action, who = 'moss') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  expect(v7Signature(result.world.state)).toBe(v7Signature(idle.state));
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action, who = 'moss') {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.reason ?? '').not.toMatch(/Nothing was spent/);
  expect(r.outcomes[who]?.success).toBe(true);
  const energy =
    Math.round(
      (actor(idle, who).vitals.energy - actor(r.world, who).vitals.energy) *
        1e6,
    ) / 1e6;
  return { world: fed(r.world), idle: fed(idle), energy };
}
/** Runs successful actions of `who` one round each, keeping everyone fed. */
function run(w: V7World, actions: V7Action[], who = 'moss') {
  let now = w;
  for (const a of actions) {
    const r = step(fed(now), { [who]: a });
    expect(r.outcomes[who]?.reason ?? '').not.toMatch(/Nothing was spent/);
    expect(r.outcomes[who]?.success).toBe(true);
    now = fed(r.world);
  }
  return now;
}
function idle(w: V7World, rounds: number) {
  let now = w;
  for (let i = 0; i < rounds; i++) now = fed(step(now).world);
  return now;
}

type Fixture = {
  w: V7World;
  roots: string;
  root: string;
  beam: string;
  reference: string;
  fulcrum: string;
  tool: string;
  support: string;
};
let base: Fixture | null = null;
/** Moss studies both interfaces, gathers two real branches (beam and reference piece), three
 * stones (fulcrum, cutting tool and support), a stack of three roots and one single root, and
 * stands at the start. */
function setup(): Fixture {
  if (!base) {
    const w = study(study(installed(), ID), KIT);
    const b = gather(w, TREE);
    const r = gather(b.w, TREE);
    const f = gather(r.w, ROCK);
    const t = gather(f.w, ROCK);
    const s = gather(t.w, ROCK);
    const roots = gather(s.w, ROOTS, 3);
    const root = gather(roots.w, ROOTS);
    actor(root.w).position = { ...STAND };
    base = {
      w: root.w,
      roots: roots.item,
      root: root.item,
      beam: b.item,
      reference: r.item,
      fulcrum: f.item,
      tool: t.item,
      support: s.item,
    };
  }
  return { ...base, w: v7Clone(base.w) };
}
let tested: (Fixture & { device: string }) | null = null;
/** The fixture with a comparator assembled where Moss stands and passed in its own test. */
function calibrated(): Fixture & { device: string } {
  if (!tested) {
    const f = setup();
    const build = kit('assemble', {
      materialIds: [f.beam, f.fulcrum],
      referenceId: f.reference,
    });
    let w = run(f.w, [build, kit('assemble'), kit('assemble')], 'moss');
    const device = w.objects.find((o) => o.kind === 'lever-comparator')?.id;
    if (!device) throw new Error('Missing comparator.');
    const read = (reading: string, approach: string, sampleId?: string) =>
      kit('test', {
        comparatorId: device,
        reading,
        approach,
        ...(sampleId ? { sampleId } : {}),
      });
    w = run(w, [
      read('empty', 'outward'),
      read('empty', 'inward'),
      read('empty', 'outward'),
      read('loaded', 'outward', f.root),
      read('loaded', 'inward', f.root),
      read('loaded', 'inward', f.root),
    ]);
    expect(w.objects.find((o) => o.id === device)?.data.status).toBe('tested');
    tested = { ...f, w, device };
  }
  return { ...tested, w: v7Clone(tested.w) };
}
const start = (f: Fixture, extra: Args = {}) =>
  mode('start', { sourceItemId: f.roots, ...extra });
const prepare = (f: Fixture, extra: Args = {}) =>
  mode('prepare', {
    preparation: 'slice',
    toolId: f.tool,
    supportId: f.support,
    location: SPOT,
    ...extra,
  });
/** A started trial: a 0.1 root sample and reference from the three-root stack. */
function started(f: Fixture = setup(), extra: Args = {}) {
  return { ...f, w: run(f.w, [start(f, extra)]) };
}
/** A started trial with the sample sliced and laid on the support at SPOT. */
function laid(f: Fixture = setup(), extra: Args = {}) {
  const s = started(f);
  return { ...s, w: run(s.w, [prepare(s, extra)]) };
}

describe('ex21 prepared-sample comparison', () => {
  it('declares the one sample operation and the factory-built comparator, scoped to ex21 with study 4, bounded text and no reward', () => {
    const pkg = V7_PACKAGES.find((p) => p.id === ID);
    const comp = V7_PACKAGES.find((p) => p.id === KIT);
    const ex19 = V7_PACKAGES.find((p) => p.id === 'lever-mass-comparator');
    const ability = pkg?.abilities[0];
    const device = comp?.abilities[0];
    const original = ex19?.abilities[0];
    if (!pkg || !comp || !ex19 || !ability || !device || !original)
      throw new Error('Missing packages.');
    for (const p of [pkg, comp]) {
      expect(p.scope).toBe('long-ex21');
      expect(p.version).toBe(1);
      expect(p.abilities).toHaveLength(1);
      expect(p.visualComponents).toEqual([]);
      expect(p.satisfaction).toEqual([]);
      for (const a of p.abilities) {
        expect(a.learning).toBe(4);
        expect(a.revision).toBe(`${p.id}@1`);
        expect(JSON.stringify(a).length).toBeLessThanOrEqual(3500);
        const handlers = V7_PACKAGES.flatMap((x) => Object.keys(x.handlers));
        expect(handlers.filter((h) => h === a.handler)).toHaveLength(1);
      }
      const visible = JSON.stringify({
        abilities: p.abilities,
        events: p.events ?? [],
        description: p.description,
        satisfaction: p.satisfaction.map((r) => r.name),
      });
      expect(CULTURE_EXCLUDED_WORDS.test(visible)).toBe(false);
      expect(EXTRA_EXCLUDED.test(visible)).toBe(false);
    }
    expect(pkg.dependencies).toEqual(['foundation-open@1', `${KIT}@1`]);
    expect(ability).toMatchObject({
      id: ID,
      handler: `long.${ID}`,
      learning: 4,
      practiceEvidence: 'sample-trial-weighed',
      references: {
        sourceItemId: 'optional-exact-visible',
        toolId: 'optional-exact-visible',
        supportId: 'optional-exact-visible',
        measurementDeviceId: 'optional-exact-visible',
      },
    });
    expect(ability.learningEnergy).toBeUndefined();
    expect(ability.parameters.properties?.mode).toMatchObject({
      enum: ['start', 'prepare', 'measure', 'tend', 'stop'],
    });
    expect(ability.parameters.properties?.preparation).toMatchObject({
      enum: ['split', 'slice'],
    });
    expect((pkg.events ?? []).every((e) => e.startsWith('sample-trial-'))).toBe(
      true,
    );
    // The comparator is the ex19 package under a new identity: same rules and texts.
    expect(device.id).toBe(KIT);
    expect(device.handler).toBe(`long.${KIT}`);
    expect(device.equivalence).not.toBe(original.equivalence);
    for (const k of [
      'function',
      'costs',
      'effects',
      'parameters',
      'references',
      'learning',
      'learningEnergy',
      'execution',
    ] as const)
      expect(device[k]).toEqual(original[k]);
    expect(comp.description).toBe(ex19.description);
    expect(comp.events).toEqual(
      (ex19.events ?? []).map((e) =>
        e.replace('lever-comparator-', 'beam-comparator-'),
      ),
    );
    expect(device.practiceEvidence).toBe('beam-comparator-assembled');
    // Registry check: nothing else in this scope weighs; the operation needs the comparator first.
    const g = genesis();
    const scoped = continuousRegistry(g).packages.flatMap((p) => p.abilities);
    expect(
      scoped
        .filter((a) =>
          /weigh|balance|comparator/i.test(`${a.name} ${a.function}`),
        )
        .map((a) => a.id)
        .sort(),
    ).toEqual([KIT, ID].sort());
    expect(() => v7Install(g, continuousRegistry(g), `${ID}@1`)).toThrow(
      /dependency-incomplete/,
    );
    const w = installed();
    expect(w.revisions.slice(-2)).toEqual([`${KIT}@1`, `${ID}@1`]);
    expect(w.state.foodWater).toBe(1);
    // Unstudied use is refused without any cost.
    const before = actor(w).vitals.energy;
    const refused = step(w, { moss: mode('stop') });
    expect(refused.outcomes.moss?.success).toBe(false);
    expect(actor(refused.world).vitals.energy).toBe(before);
    expect(trials(refused.world)).toHaveLength(0);
  });

  it('keeps every reused package byte-identical, including the ex19 comparator its factory still builds', () => {
    for (const [id, hash] of Object.entries(BEFORE)) {
      const p = V7_PACKAGES.find((x) => x.id === id);
      expect(createHash('sha256').update(JSON.stringify(p)).digest('hex')).toBe(
        hash,
      );
    }
    const ex19 = V7_PACKAGES.find((p) => p.id === 'lever-mass-comparator');
    expect(Object.keys(ex19?.handlers ?? {})).toEqual([
      'long.lever-mass-comparator',
    ]);
    expect(ex19?.scope).toBe('long-ex19');
    expect(ex19?.abilities[0]?.equivalence).toBe(
      'measurement:lever-comparator:reference-mass-ratio:1',
    );
  });

  it('starts for 0.2 energy: a default 0.1 sample and an equal reference keep their inherited state, stay whole and never take the whole supply', () => {
    const f = setup();
    const source = stack(f.w, f.roots);
    const roots = total(f.w, 'root');
    const c = cost(f.w, start(f));
    expect(c.energy).toBeCloseTo(0.2, 8);
    const w = c.world,
      j = trial(w);
    expect(j).toMatchObject({
      stage: 'allocated',
      status: 'active',
      quantity: 0.1,
      placedAt: null,
      weighings: [],
    });
    expect(stack(w, f.roots).quantity).toBeCloseTo(2.8, 8);
    for (const id of [j.sample, j.reference]) {
      const s = stack(w, id);
      expect(s).toMatchObject({
        owner: 'moss',
        reservedFor: j.id,
        quantity: 0.1,
        origin: source.origin,
        harvestedAt: source.harvestedAt,
      });
      expect(s.decay).toBeGreaterThanOrEqual(source.decay ?? 0);
      // The world water record of roots (an assumption), whole and uncut.
      expect(s.physical).toEqual({
        unitMass: 0.4,
        unitWater: 0.3,
        unitSolids: 0.1,
      });
      expect(foodWaterRead(s)).toMatchObject({
        prepared: false,
        surface: null,
      });
      expect(s.processing?.preparedSample).toBeUndefined();
    }
    expect(total(w, 'root')).toBe(roots);
    expect(data(w, 'sample-trial-allocated')).toMatchObject({
      energy: 0.2,
      baseline: { form: 'whole portions of the stack, no cut made' },
      view: { state: 'pending', placement: 'carried' },
    });
    expect(JSON.stringify(data(w, 'sample-trial-allocated'))).not.toMatch(
      /unitWater|waterFraction/,
    );
    // An explicit larger quantity is honoured; the whole stack is never reserved.
    const big = cost(f.w, start(f, { sampleQuantity: 1 })).world;
    expect(stack(big, trial(big).sample).quantity).toBe(1);
    expect(stack(big, f.roots).quantity).toBeCloseTo(1, 8);
    expect(
      unchanged(
        f.w,
        mode('start', { sourceItemId: f.root, sampleQuantity: 0.5 }),
      ),
    ).toMatch(/leave part of it unreserved/);
    const single = cost(f.w, mode('start', { sourceItemId: f.root })).world;
    expect(stack(single, f.root).quantity).toBeCloseTo(0.8, 8);
    // Refusals spend nothing.
    expect(unchanged(f.w, mode('start', { sourceItemId: f.beam }))).toMatch(
      /Only edible food/,
    );
    expect(unchanged(f.w, mode('start', { sourceItemId: 'nothing' }))).toMatch(
      /sourceItemId|identity/,
    );
    for (const q of [0.15, 1.5, 0])
      expect(unchanged(f.w, start(f, { sampleQuantity: q }))).toMatch(
        /sampleQuantity is 0.1 to 1/,
      );
    expect(unchanged(f.w, start(f, { durationRounds: 0 }))).toMatch(
      /durationRounds/,
    );
    expect(unchanged(f.w, start(f, { toolId: f.tool }))).toMatch(
      /start does not use toolId/,
    );
    expect(unchanged(w, start(f))).toMatch(/still open/);
  });

  it('cuts with an acquired stone edge for 0.5 energy and lays the pieces cut face up on a clean stone support, conserving the sample at the cut', () => {
    const s = started();
    const w0 = s.w,
      j0 = trial(w0),
      sample0 = stack(w0, j0.sample),
      ref0 = v7Clone(stack(w0, j0.reference)),
      stones = total(w0, 'stone'),
      roots = total(w0, 'root');
    const c = cost(w0, prepare(s));
    expect(c.energy).toBeCloseTo(0.5, 8);
    const w = c.world,
      j = trial(w),
      pieces = stack(w, j.sample);
    const g = sampleGeometry('slice', 0.1 * 0.4);
    expect(g).toMatchObject({ form: 'slice', pieces: 9, cutPlanes: 8 });
    expect(pieces).toMatchObject({
      owner: null,
      quantity: 0.1,
      position: SPOT,
    });
    expect(pieces.reservedFor).toBeUndefined();
    expect(pieces.processing?.preparedSample).toMatchObject({
      operation: ID,
      form: 'slice',
      pieces: 9,
      tool: s.tool,
      trial: j.id,
    });
    expect(foodWaterRead(pieces)).toMatchObject({
      prepared: true,
      opening: 1.1,
      surface: null,
    });
    // Dry matter, quantity (so nutrition) and toxicity are untouched; only the exchange of this
    // round has moved water, and the ledger holds exactly that amount.
    expect(solids(pieces)).toBeCloseTo(solids(sample0), 9);
    const l = ledger(w);
    expect(water(pieces)).toBeCloseTo(
      water(sample0) - l.evaporated + l.condensed + l.rain,
      8,
    );
    expect(total(w, 'root')).toBe(roots);
    // The support stone lies committed under the pieces; the tool stays with Moss, unworn.
    expect(w.stacks.some((x) => x.id === s.support)).toBe(false);
    expect(j.supportItem).toMatchObject({ resource: 'stone', quantity: 1 });
    expect(total(w, 'stone')).toBe(stones);
    expect(stack(w, s.tool)).toMatchObject({ owner: 'moss', quantity: 1 });
    expect(w.state[`hardness:intrinsic:${s.tool}`]).toMatchObject({ wear: 0 });
    // The reference stays whole, carried and reserved with its water unchanged.
    expect(stack(w, j.reference)).toMatchObject({
      owner: 'moss',
      reservedFor: j.id,
      physical: ref0.physical,
    });
    expect(foodWaterRead(stack(w, j.reference))?.prepared).toBe(false);
    expect(j).toMatchObject({
      stage: 'exposed',
      placement: { kind: 'ground', ...SPOT, area: g.footprint },
      preparation: {
        form: 'slice',
        outcome: 'cut',
        pieces: 9,
        exposedArea: g.exposed,
        offcuts: 0,
        reference: 'kept whole and uncut',
        edge: { resistance: 8, wearAdded: 0, fractured: false },
      },
    });
    expect(data(w, 'sample-trial-cut')).toMatchObject({
      energy: 0.5,
      outcome: 'cut',
      view: { state: 'active', form: 'slice', pieces: 9 },
    });
    expect(data(w, 'sample-trial-placed')).toMatchObject({
      view: { placement: 'support', x: SPOT.x, y: SPOT.y },
    });
    expect(Number(data(w, 'sample-trial-placed')?.placedAt)).toBe(w.tick);
    // Splitting makes two halves with one new face each up.
    const split = run(w0, [prepare(s, { preparation: 'split' })]);
    const halves = sampleGeometry('split', 0.04);
    expect(halves.pieces).toBe(2);
    const r = Math.cbrt((3 * 0.04) / 1000 / (4 * Math.PI));
    expect(halves.exposed).toBeCloseTo(2 * Math.PI * r * r, 8);
    expect(trial(split).preparation).toMatchObject({
      form: 'split',
      pieces: 2,
    });
    // The footprint keeps at least the inherited 0.04 per unit.
    expect(trial(split).placement?.area).toBeCloseTo(0.004, 8);
  });

  it('refuses unsuitable tools, supports, placements and requests without spending', () => {
    const s = started();
    const w = s.w;
    expect(unchanged(w, prepare(s, { toolId: undefined }))).toMatch(
      /Cutting needs toolId/,
    );
    expect(unchanged(w, prepare(s, { toolId: s.beam }))).toMatch(
      /Only stone or flint/,
    );
    expect(unchanged(w, prepare(s, { toolId: s.root }))).toMatch(
      /Food is not a cutting tool/,
    );
    expect(unchanged(w, prepare(s, { supportId: s.beam }))).toMatch(/not dry/);
    expect(unchanged(w, prepare(s, { supportId: s.tool }))).toMatch(
      /cannot also be the support/,
    );
    expect(unchanged(w, prepare(s, { supportId: undefined }))).toMatch(
      /Name the support/,
    );
    expect(
      unchanged(w, prepare(s, { location: { x: STAND.x + 2, y: STAND.y } })),
    ).toMatch(/beyond hand reach/);
    expect(unchanged(w, prepare(s, { location: ON_TREE }))).toMatch(
      /obstructed/,
    );
    expect(unchanged(w, prepare(s, { preparation: 'grind' }))).toMatch(
      /declared choices/,
    );
    expect(unchanged(w, prepare(s, { trialId: 'manual-0' }))).toMatch(
      /not your open sample trial/,
    );
    expect(unchanged(w, mode('tend'))).toMatch(/not cut and laid out yet/);
    expect(unchanged(setup().w, prepare(s))).toMatch(/no open sample trial/);
    const cut = run(w, [prepare(s)]);
    expect(unchanged(cut, prepare(s, { supportId: s.fulcrum }))).toMatch(
      /already cut/,
    );
    // Someone else cannot act on Moss's trial: they have none of their own.
    const lin = v7Clone(cut);
    actor(lin, 'lin').position = { x: SPOT.x + 0.3, y: SPOT.y };
    actor(lin, 'lin').mastered.push(ID);
    expect(unchanged(lin, mode('tend'), 'lin')).toMatch(/no open sample trial/);
  });

  it('dries only the exposed cut faces by the bounded heat and vapour transfer, conserving dry matter and nutrition; whole and carried food keep their water', () => {
    const f = laid();
    let w = f.w;
    const j = trial(w);
    const first = v7Clone(stack(w, j.sample));
    const ref = v7Clone(stack(w, j.reference));
    const source = v7Clone(stack(w, f.roots));
    const l0 = { ...ledger(w) };
    // One round reproduces the declared transfer exactly from the actual weather at the pieces.
    const prev = (w.state[PIECES] as Record<string, { temperature: number }>)[
      j.sample
    ];
    const next = step(fed(w)).world;
    const c = forestClimate(next, first.position, true);
    const g = first.processing?.preparedSample as V7Data;
    const expected = sampleExchange({
      water: water(first),
      solids: solids(first),
      exposed: Number(g.exposedPerUnit) * 0.1,
      footprint: Number(g.footprintPerUnit) * 0.1,
      temperature: Number(prev?.temperature),
      air: c.temperature,
      humidity: c.airHumidity ?? 0.65,
      wind: c.wind ?? 0,
      rain: c.rain ?? 0,
    });
    expect(c.rain ?? 0).toBe(0);
    expect(water(stack(next, j.sample))).toBeCloseTo(expected.water, 8);
    expect(expected.evaporated).toBeGreaterThan(0);
    // Evaporation cools the faces below the air; the heat balance closes.
    expect(expected.temperature).toBeLessThan(c.temperature);
    expect(expected.stored).toBeCloseTo(expected.sensible - expected.latent, 2);
    expect(expected.latent).toBeCloseTo(
      SAMPLE_EXCHANGE.latent * expected.evaporated,
      4,
    );
    w = idle(fed(next), 4);
    const after = stack(w, j.sample),
      l = ledger(w);
    expect(water(after)).toBeLessThan(water(first));
    expect(solids(after)).toBeCloseTo(solids(first), 9);
    expect(after.quantity).toBe(first.quantity);
    expect(after.physical?.unitMass).toBeCloseTo(
      (after.physical?.unitWater ?? 0) + (after.physical?.unitSolids ?? 0),
      8,
    );
    // Water lost equals the ledger's evaporation; nothing else moved it in dry weather.
    expect(l.rain - l0.rain).toBe(0);
    expect(water(first) - water(after)).toBeCloseTo(
      l.evaporated - l0.evaporated - (l.condensed - l0.condensed),
      7,
    );
    expect(l.latentHeat - l0.latentHeat).toBeCloseTo(
      SAMPLE_EXCHANGE.latent *
        (l.evaporated - l0.evaporated - (l.condensed - l0.condensed)),
      2,
    );
    expect(l.pieceHeat).toBeCloseTo(l.heatFromAir - l.latentHeat, 1);
    expect(
      Number((w.state['preservation:water'] as V7Data).evaporated),
    ).toBeGreaterThanOrEqual(l.evaporated - 1e-9);
    // Carried whole food exchanges nothing.
    expect(stack(w, j.reference).physical).toEqual(ref.physical);
    expect(stack(w, f.roots).physical).toEqual(source.physical);
    // The record, events and drawing never disclose water content or face temperature.
    const visible = JSON.stringify([
      trial(w),
      actor(w).extensionState,
      w.events.filter((e) => e.type.startsWith('sample-trial')),
    ]);
    expect(visible).not.toMatch(/unitWater|waterFraction|evaporated|latent/);
    expect(data(w, 'sample-trial-exchange')).toMatchObject({
      measured: false,
      view: { state: 'active' },
    });
    // Slices dry faster than split halves of the same sample in the same weather.
    const halves = laid(setup(), { preparation: 'split' });
    const h = trial(halves.w);
    const h0 = water(stack(halves.w, h.sample));
    const h5 = water(stack(idle(halves.w, 5), h.sample));
    expect(water(first) - water(after)).toBeGreaterThan(h0 - h5);
  });

  it('takes up rain on the footprint, records the wetting once and keeps the water account', () => {
    const f = laid();
    const w0 = v7Clone(f.w);
    // Isolated fixture time: this seed's shared rain term is positive from round 48.
    w0.time = 60;
    const j = trial(w0);
    const before = water(stack(w0, j.sample)),
      l0 = { ...ledger(w0) };
    let w = w0;
    const seen = [];
    for (let i = 0; i < 3; i++) {
      w = fed(step(w).world);
      seen.push(...events(w, 'sample-trial-rained-on'));
    }
    expect(seen).toHaveLength(1);
    expect(trial(w)).toMatchObject({ rainRounds: 3, wet: true });
    const l = ledger(w);
    expect(l.rain - l0.rain).toBeGreaterThan(0);
    expect(water(stack(w, j.sample))).toBeCloseTo(
      before -
        (l.evaporated - l0.evaporated) +
        (l.condensed - l0.condensed) +
        (l.rain - l0.rain),
      7,
    );
    expect(data(w, 'sample-trial-exchange')).toMatchObject({
      view: { visible: 'wet from rain' },
    });
  });

  it('weighs on a tested comparator for 0.2 energy per item with calibration, resolution and uncertainty, and reports a change below resolution as unresolved', () => {
    const f = calibrated();
    let w = run(f.w, [start(f)]);
    const j = trial(w);
    expect(unchanged(w, mode('measure'))).toMatch(/measurementDeviceId/);
    expect(
      unchanged(w, mode('measure', { measurementDeviceId: TREE })),
    ).toMatch(/Missing measuring prerequisite: canopy-69 is not a comparator/);
    const voided = v7Clone(w);
    const o = voided.objects.find((x) => x.id === f.device);
    if (o) o.data.status = 'untested';
    expect(
      unchanged(voided, mode('measure', { measurementDeviceId: f.device })),
    ).toMatch(/no passed test of yours \(it is untested\)/);
    expect(
      unchanged(
        w,
        mode('measure', { measurementDeviceId: f.device, toolId: f.tool }),
      ),
    ).toMatch(/measure does not use toolId/);
    const both = cost(w, mode('measure', { measurementDeviceId: f.device }));
    expect(both.energy).toBeCloseTo(0.4, 8);
    // The weighing seats and returns the items: the world is as after waiting.
    expect(v7Signature(both.world.stacks)).toBe(v7Signature(both.idle.stacks));
    expect(trial(both.world).paidEnergy).toBeCloseTo(0.6, 8);
    w = both.world;
    expect(j.sample).toBe(trial(w).sample);
    const readings = trial(w).weighings;
    expect(readings.map((r) => r.role)).toEqual(['sample', 'reference']);
    const mr = 1 * foodUnitMass(w, stack(setup().w, f.reference));
    for (const r of readings) {
      expect(r.event).toBe(events(w, 'sample-trial-weighed')[0]?.id);
      expect(r.resolution).toBe(0.02);
      expect(r.calibration).toMatchObject({ tare: [-0.04, 0.04] });
      expect(r.calibration.testReadings).toHaveLength(6);
      const [lo = 0, hi = 0] = r.ratio ?? [];
      // The interval brackets the true 0.04 / 1.1 and carries its own uncertainty.
      expect(lo).toBeLessThanOrEqual((0.1 * 0.4) / mr);
      expect(hi).toBeGreaterThan((0.1 * 0.4) / mr);
      expect(r.uncertainty).toBeCloseTo((hi - lo) / 2, 8);
    }
    expect(data(w, 'sample-trial-weighed')).toMatchObject({
      energy: 0.4,
      view: { instrument: f.device },
    });
    // Cut, expose and weigh again after real drying: the loss is far below the resolution.
    w = run(w, [prepare(f)]);
    w = idle(w, 4);
    const lost = ledger(w).evaporated;
    expect(lost).toBeGreaterThan(0);
    w = run(w, [mode('measure', { measurementDeviceId: f.device })]);
    const c =
      trial(w).comparison ?? data(w, 'sample-trial-weighed')?.comparison;
    const cmp = data(w, 'sample-trial-weighed')?.comparison as Record<
      string,
      Record<string, unknown>
    >;
    expect(c).toBeDefined();
    expect(cmp.sample).toMatchObject({ result: 'unresolved' });
    expect(String(cmp.sample?.reason)).toMatch(
      /below the resolution, not zero/,
    );
    const [dlo = 0, dhi = 0] = cmp.sample?.massChange as number[];
    expect(dlo).toBeLessThan(0);
    expect(dhi).toBeGreaterThan(0);
    expect(cmp.reference).toMatchObject({ result: 'unresolved' });
    expect(cmp.referenceAdjusted).toMatchObject({ result: 'unresolved' });
    expect(JSON.stringify(data(w, 'sample-trial-weighed'))).not.toMatch(
      /unitWater|waterFraction|evaporated/,
    );
    // No practice milestone, satisfaction or comfort comes from weighing.
    expect(
      Object.keys(actor(w).extensionState).filter((k) =>
        k.startsWith('open:practice:'),
      ),
    ).toEqual([]);
    expect(
      actor(w).wellbeing.sources.filter((x) =>
        /sample|comparator/.test(JSON.stringify(x)),
      ),
    ).toEqual([]);
    // Only the comparator's owner weighs on it, within reach, while its test holds.
    const lin = v7Clone(w);
    actor(lin, 'lin').mastered.push(ID);
    actor(lin, 'lin').position = { x: STAND.x, y: STAND.y + 0.5 };
    const roots = lin.stacks.find((x) => x.id === f.roots);
    if (roots) roots.owner = 'lin';
    const linStart = run(lin, [start(f)], 'lin');
    expect(
      unchanged(
        linStart,
        mode('measure', { measurementDeviceId: f.device }),
        'lin',
      ),
    ).toMatch(/only the person who assembled/);
    const far = v7Clone(w);
    actor(far).position = { x: STAND.x + 1.6, y: STAND.y };
    expect(
      unchanged(far, mode('measure', { measurementDeviceId: f.device })),
    ).toMatch(/beyond hand reach|not within your reach/);
  });

  it('reports a change beyond the comparator resolution as a decrease, adjusted by the reference', () => {
    const f = calibrated();
    let w = run(f.w, [
      start(f, { sampleQuantity: 1 }),
      mode('measure', { measurementDeviceId: f.device }),
      prepare(f, { preparation: 'split' }),
    ]);
    const j = trial(w);
    // Fixture state: the pieces' water as a long exposure would leave it (most of it gone).
    const p = stack(w, j.sample).physical;
    if (!p) throw new Error('Missing composition.');
    p.unitWater = 0.03;
    p.unitMass = p.unitWater + p.unitSolids;
    w = run(w, [mode('measure', { measurementDeviceId: f.device })]);
    const cmp = data(w, 'sample-trial-weighed')?.comparison as Record<
      string,
      Record<string, unknown>
    >;
    expect(cmp.sample).toMatchObject({ result: 'decrease', reason: null });
    const [lo = 0, hi = 0] = cmp.sample?.ratio as number[];
    expect(hi).toBeLessThan(1);
    expect(lo).toBeGreaterThan(0);
    const [mlo = 0, mhi = 0] = cmp.sample?.massChange as number[];
    expect(mhi).toBeLessThan(0);
    expect(mlo).toBeLessThan(mhi);
    expect(cmp.reference).toMatchObject({ result: 'unresolved' });
    // Carrying the reference's own reading uncertainty widens the adjusted interval honestly.
    const adjusted = cmp.referenceAdjusted as {
      ratio: number[];
      result: string;
    };
    expect(adjusted.ratio[0]).toBeLessThan(lo);
    expect(adjusted.ratio[1]).toBeGreaterThan(hi);
    expect(adjusted.result).toBe('unresolved');
  });

  it('tends by turning in place or moving the support with the pieces for 0.2 energy', () => {
    const f = laid();
    const turn = cost(f.w, mode('tend'));
    expect(turn.energy).toBeCloseTo(0.2, 8);
    expect(v7Signature(turn.world.stacks)).toBe(v7Signature(turn.idle.stacks));
    expect(trial(turn.world)).toMatchObject({ turns: 1, moves: 0 });
    expect(data(turn.world, 'sample-trial-tended')).toMatchObject({
      action: 'turned',
    });
    const move = cost(f.w, mode('tend', { location: SPOT2 }));
    expect(move.energy).toBeCloseTo(0.2, 8);
    const j = trial(move.world);
    expect(stack(move.world, j.sample).position).toEqual(SPOT2);
    expect(j).toMatchObject({
      moves: 1,
      placement: { kind: 'ground', ...SPOT2 },
      supportItem: { position: SPOT2 },
    });
    expect(
      unchanged(
        f.w,
        mode('tend', { location: { x: STAND.x + 2, y: STAND.y } }),
      ),
    ).toMatch(/beyond hand reach/);
    const far = v7Clone(f.w);
    actor(far).position = free(far, SPOT.x, SPOT.y, 1.3, 'moss');
    expect(unchanged(far, mode('tend'))).toMatch(/hand reach of the pieces/);
  });

  it('lays the pieces at the centre of an existing food surface in reach, which cannot be moved by tending', () => {
    const s = started();
    const w = v7Clone(s.w);
    w.objects.push({
      id: 'fixture-slab',
      name: 'Flat stone slab',
      kind: 'slab',
      spatial: {
        ...SPOT,
        angle: 0,
        shape: { kind: 'rectangle', width: 0.4, height: 0.3 },
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
      data: { foodSurface: true },
      createdBy: null,
      createdAt: 0,
      revision: 'foundation-forest@1',
    });
    expect(unchanged(w, prepare(s, { supportId: 'fixture-slab' }))).toMatch(
      /give location only with your own support item/,
    );
    const stones = total(w, 'stone');
    const on = run(w, [
      prepare(s, { supportId: 'fixture-slab', location: undefined }),
    ]);
    const j = trial(on);
    expect(j.support).toMatchObject({ kind: 'object', id: 'fixture-slab' });
    expect(j.supportItem).toBeNull();
    expect(stack(on, j.sample)).toMatchObject({ owner: null, position: SPOT });
    expect(total(on, 'stone')).toBe(stones);
    expect(stack(on, s.support).owner).toBe('moss');
    expect(unchanged(on, mode('tend', { location: SPOT2 }))).toMatch(
      /existing surface cannot be moved/,
    );
    const later = idle(on, 2);
    expect(water(stack(later, j.sample))).toBeLessThan(
      water(stack(on, j.sample)),
    );
  });

  it('ends the window completed with weighings or indeterminate without, releasing the reference once and leaving pieces and support that keep drying', () => {
    const f = calibrated();
    let w = run(f.w, [
      start(f, { durationRounds: 3 }),
      mode('measure', { measurementDeviceId: f.device }),
      prepare(f),
      mode('measure', { measurementDeviceId: f.device }),
    ]);
    const j = trial(w);
    w = idle(w, 2);
    expect(trial(w)).toMatchObject({ stage: 'completed', status: 'stopped' });
    expect(data(w, 'sample-trial-compared')).toMatchObject({
      status: 'completed',
      comparison: { sample: { result: 'unresolved' } },
      view: { state: 'completed', badge: null },
    });
    expect(stack(w, j.reference).owner).toBe('moss');
    expect(stack(w, j.reference).reservedFor).toBeUndefined();
    expect(w.stacks.filter((x) => x.reservedFor)).toHaveLength(0);
    const support = w.stacks.find(
      (x) => x.resource === 'stone' && x.owner === null,
    );
    expect(support?.position).toEqual(SPOT);
    expect(stack(w, j.sample)).toMatchObject({ owner: null, position: SPOT });
    // The pieces are still cut and lying: the environment keeps exchanging their water.
    const before = water(stack(w, j.sample));
    const later = idle(w, 2);
    expect(water(stack(later, j.sample))).toBeLessThan(before);
    expect(events(later, 'sample-trial-exchange')).toHaveLength(0);
    // Without weighings the window ends indeterminate.
    const bare = idle(
      run(setup().w, [start(setup(), { durationRounds: 2 }), prepare(setup())]),
      2,
    );
    expect(trial(bare)).toMatchObject({ stage: 'indeterminate' });
    expect(data(bare, 'sample-trial-indeterminate')).toMatchObject({
      view: { state: 'indeterminate' },
    });
  });

  it('stops for no energy and refunds nothing; removal by someone else and death end the trial', () => {
    const f = laid();
    const stopped = cost(f.w, mode('stop'));
    expect(stopped.energy).toBe(0);
    const w = stopped.world,
      j = trial(w);
    expect(j).toMatchObject({ stage: 'stopped', status: 'stopped' });
    expect(j.paidEnergy).toBeCloseTo(0.7, 8);
    expect(stack(w, j.reference)).toMatchObject({ owner: 'moss' });
    expect(stack(w, j.reference).reservedFor).toBeUndefined();
    expect(stack(w, j.sample)).toMatchObject({ owner: null, position: SPOT });
    expect(data(w, 'sample-trial-stopped')).toMatchObject({
      view: { state: 'interrupted' },
    });
    expect(unchanged(w, mode('stop'))).toMatch(/no open sample trial/);
    // Before the cut, stopping returns both portions whole.
    const early = run(started().w, [mode('stop')]);
    const e = trial(early);
    for (const id of [e.sample, e.reference])
      expect(stack(early, id)).toMatchObject({ owner: 'moss', quantity: 0.1 });
    expect(early.stacks.filter((x) => x.reservedFor)).toHaveLength(0);
    // Base pickup moves whole units only, so a 0.1 stack of pieces cannot be taken with it.
    const t = trial(f.w);
    const small = v7Clone(f.w);
    actor(small, 'lin').position = { x: SPOT.x + 0.3, y: SPOT.y + 0.1 };
    const none = step(fed(small), {
      lin: { interface: 'pickup', args: { target: t.sample, quantity: 1 } },
    });
    expect(none.outcomes.lin?.success).toBe(false);
    expect(trial(none.world).stage).toBe('exposed');
    // Someone else may take whole lying pieces under the ordinary rules; that interrupts the trial.
    const big = run(started(setup(), { sampleQuantity: 1 }).w, [
      prepare(setup(), { preparation: 'split' }),
    ]);
    const taken = v7Clone(big);
    actor(taken, 'lin').position = { x: SPOT.x + 0.3, y: SPOT.y + 0.1 };
    const u = trial(taken);
    expect(stack(taken, u.sample).quantity).toBe(1);
    const r = step(fed(taken), {
      lin: { interface: 'pickup', args: { target: u.sample, quantity: 1 } },
    });
    expect(r.outcomes.lin?.success).toBe(true);
    expect(trial(r.world)).toMatchObject({ stage: 'removed', takenBy: 'lin' });
    expect(events(r.world, 'sample-trial-removed')).toHaveLength(1);
    expect(stack(r.world, u.reference).reservedFor).toBeUndefined();
    expect(total(r.world, 'root')).toBe(total(taken, 'root'));
    expect(total(r.world, 'stone')).toBe(total(taken, 'stone'));
    // Death ends the work, not the exchange; the reference lies where Moss died.
    const dying = v7Clone(f.w);
    actor(dying).vitals.health = 0.0001;
    actor(dying).vitals.satiety = 0;
    const where = { ...actor(dying).position };
    const died = step(dying).world;
    expect(events(died, 'died')).toHaveLength(1);
    expect(trial(died)).toMatchObject({ stage: 'ended-by-death' });
    expect(events(died, 'sample-trial-interrupted')).toHaveLength(1);
    expect(stack(died, t.reference)).toMatchObject({
      owner: null,
      position: where,
    });
    expect(stack(died, t.sample)).toMatchObject({
      owner: null,
      position: SPOT,
    });
    expect(died.stacks.filter((x) => x.reservedFor)).toHaveLength(0);
  });

  it('bounds the transfer by accessible water and heat, and gives no loss for whole food or saturated cold air', () => {
    const g = sampleGeometry('slice', 0.04);
    const base = {
      water: 0.03,
      solids: 0.01,
      exposed: g.exposed,
      footprint: g.footprint,
      temperature: 20,
      air: 20,
      humidity: 0.6,
      wind: 0.5,
      rain: 0,
    };
    const dry = sampleExchange(base);
    expect(dry.evaporated).toBeGreaterThan(0);
    expect(dry.evaporated).toBeLessThanOrEqual(dry.accessible + 1e-9);
    expect(dry.water).toBeCloseTo(base.water - dry.evaporated, 9);
    // Saturated air at the same temperature: nothing evaporates and nothing is invented.
    const wet = sampleExchange({ ...base, humidity: 1 });
    expect(wet.evaporated).toBe(0);
    // Wind raises the transfer; cold, humid, still air nearly stops it.
    expect(sampleExchange({ ...base, wind: 1 }).evaporated).toBeGreaterThan(
      sampleExchange({ ...base, wind: 0 }).evaporated,
    );
    expect(
      sampleExchange({
        ...base,
        air: 2,
        temperature: 2,
        humidity: 0.85,
        wind: 0,
      }).evaporated,
    ).toBeLessThan(dry.evaporated / 4);
    // Water at or below the humidity equilibrium is bound: no loss.
    const bound = sampleExchange({ ...base, water: 0.002 });
    expect(bound.evaporated).toBe(0);
    expect(bound.accessible).toBe(0);
    // Pieces colder than the dew point gain water by condensation and warm by its latent heat.
    const cold = sampleExchange({ ...base, temperature: 5, humidity: 0.85 });
    expect(cold.condensed).toBeGreaterThan(0);
    expect(cold.water).toBeGreaterThan(base.water);
    expect(cold.temperature).toBeGreaterThan(5);
    // Rain adds 0.01 x rain x footprint.
    expect(sampleExchange({ ...base, rain: 1 }).received).toBeCloseTo(
      0.01 * g.footprint,
      7,
    );
    // Whole food has no exposed cut face: rain only, no evaporation.
    const whole = sampleGeometry('whole', 0.04);
    expect(whole.exposed).toBe(0);
    const w = sampleExchange({
      ...base,
      exposed: 0,
      footprint: whole.footprint,
    });
    expect(w).toMatchObject({ evaporated: 0, condensed: 0, latent: 0 });
    // The saturation density matches the reference value near 20 C (0.0173 kg/m3).
    expect(saturationDensity(20)).toBeCloseTo(0.0173, 3);
    // Slicing exposes more cut face than splitting the same sample.
    expect(g.exposed).toBeGreaterThan(sampleGeometry('split', 0.04).exposed);
    expect(Number(g.thickness)).toBeLessThanOrEqual(SAMPLE_EXCHANGE.slice);
  });
});
