import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  foodUnitMass,
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
  V7Object,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 120_000 });

const id = 'lever-mass-comparator';
const AIR = 'food-air-exposure-trial';
const SLICE = 'thin-slice-food-drying-trial';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** Moss's genesis neighbourhood: a fallen-branch canopy, the weathered stone outcrop Moss named
 * in the ex19 request and a root patch. */
const TREE = 'canopy-69';
const ROCK = 'start-2-stone';
const ROOTS = 'commons-root-1-0';
/** Moss's start on firm meadow ground, and a slice layer centre within hand reach of it. */
const STAND = { x: 15.1, y: 16.91 };
const SPOT = { x: 15.9, y: 16.6 };
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition/i;
/** Declared geometry and stiction of the package, restated to check the physics. */
const HALF = 0.55;
const SEAT = 0.9;
const STICTION = 0.005;
const RES = 0.02;

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
const act = (mode: string, extra: V7Action['args'] = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});
const read = (
  series: 'test' | 'compare',
  reading: 'empty' | 'loaded',
  approach: 'outward' | 'inward',
  sampleId?: string,
) => act(series, { reading, approach, ...(sampleId ? { sampleId } : {}) });
const comparator = (w: V7World): V7Object | undefined =>
  w.objects.find((o) => o.kind === 'lever-comparator');
const parts = (o: V7Object | undefined) =>
  (o?.data.components ?? []) as unknown as V7Stack[];
const ledger = (w: V7World, who = 'moss') =>
  actor(w, who).extensionState[`long:${id}`] as Record<string, unknown>;
type Job = {
  id: string;
  owner: string;
  status: string;
  completedWork: number;
  remainingWork: number;
  paidEnergy: number;
  escrow: string[];
  target: string;
};
const jobs = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Job);
const massOf = (w: V7World, s: V7Stack) => s.quantity * foodUnitMass(w, s);
/** Every unit of a resource as a stack anywhere, plus the comparator's parts. */
const total = (w: V7World, resource: string) =>
  [...w.stacks, ...parts(comparator(w))]
    .filter((s) => s.resource === resource)
    .reduce((n, s) => n + Math.round(s.quantity * 10), 0) / 10;
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
/** Stand within reach of an object (shape distance 0.45). */
function near(w: V7World, object: string, who = 'moss') {
  const o = w.objects.find((x) => x.id === object);
  if (!o) throw new Error('Missing fixture object.');
  const r = o.spatial.shape.kind === 'circle' ? o.spatial.shape.radius : 0.3;
  actor(w, who).position = free(w, o.spatial.x, o.spatial.y, r + 0.45, who);
  return w;
}
function gather(w: V7World, source: string, who = 'moss') {
  near(w, source, who);
  const r = step(w, {
    [who]: { interface: 'gather', args: { target: source, quantity: 1 } },
  });
  expect(r.outcomes[who]?.success).toBe(true);
  const item = r.world.events.find(
    (e) => e.type === 'gathered' && e.actor === who,
  )?.data.item;
  if (typeof item !== 'string') throw new Error('Missing gathered item.');
  return { w: fed(r.world), item };
}
function genesis() {
  return initialLongWorld('long-ex19', 'long-culture-v2-oldgoal', {
    seed: 20261201,
    development: 8,
    tokens: 1500000,
  });
}
/** The ex19 world with its installed drying trials, then this package. */
function installed() {
  let w = genesis();
  for (const p of [AIR, SLICE, id])
    w = v7Clone(v7Install(w, continuousRegistry(w), `${p}@1`));
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
  // The person's own reading and work records are unchanged (routine tracking is the kernel's).
  for (const key of [`long:${id}`, `long:work:${id}`])
    expect(actor(result.world, who).extensionState[key]).toEqual(
      actor(idle, who).extensionState[key],
    );
  expect(actor(result.world, who).memory.knowledge).toEqual(
    actor(idle, who).memory.knowledge,
  );
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action, who = 'moss') {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.reason ?? '').not.toMatch(/Nothing was spent/);
  expect(r.outcomes[who]?.success).toBe(true);
  const energy =
    actor(idle, who).vitals.energy - actor(r.world, who).vitals.energy;
  return { world: fed(r.world), energy };
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
function study(w: V7World, ability: string, who: string[]) {
  let next = step(
    fed(w),
    Object.fromEntries(
      who.map((x) => [x, { interface: 'learn', args: { ability } }]),
    ),
  ).world;
  for (let i = 0; i < 3; i++) next = step(fed(next)).world;
  for (const x of who) expect(actor(next, x).mastered).toContain(ability);
  return fed(next);
}

type Fixture = {
  w: V7World;
  branch: string;
  fulcrum: string;
  reference: string;
  tool: string;
  root: string;
  spare: string;
};
let base: Fixture | null = null;
/** Moss (and Lin) study four rounds; Moss gathers two real branches (beam and reference), two
 * stones (fulcrum and cutting tool) and two roots, and stands at the start. */
function setup(): Fixture {
  if (!base) {
    const b = gather(study(installed(), id, ['moss', 'lin']), TREE);
    const r = gather(b.w, TREE);
    const f = gather(r.w, ROCK);
    const t = gather(f.w, ROCK);
    const g = gather(t.w, ROOTS);
    const s = gather(g.w, ROOTS);
    actor(s.w).position = { ...STAND };
    base = {
      w: s.w,
      branch: b.item,
      fulcrum: f.item,
      reference: r.item,
      tool: t.item,
      root: g.item,
      spare: s.item,
    };
  }
  return { ...base, w: v7Clone(base.w) };
}
const assembly = (f: Fixture) =>
  act('assemble', {
    materialIds: [f.branch, f.fulcrum],
    referenceId: f.reference,
  });
let built: Fixture | null = null;
/** The fixture after three uninterrupted paid assembly rounds. */
function assembled(): Fixture {
  if (!built) {
    const f = setup();
    built = { ...f, w: run(f.w, [assembly(f), assembly(f), assembly(f)]) };
  }
  return { ...built, w: v7Clone(built.w) };
}
/** Three empty and three loaded readings of the root, from both directions. */
const TEST = (root: string) => [
  read('test', 'empty', 'outward'),
  read('test', 'empty', 'inward'),
  read('test', 'empty', 'outward'),
  read('test', 'loaded', 'outward', root),
  read('test', 'loaded', 'inward', root),
  read('test', 'loaded', 'inward', root),
];
/** An endpoint: an empty check, three loaded readings from both directions and a closing check. */
const ENDPOINT = (sample: string) => [
  read('compare', 'empty', 'outward'),
  read('compare', 'loaded', 'outward', sample),
  read('compare', 'loaded', 'inward', sample),
  read('compare', 'loaded', 'outward', sample),
  read('compare', 'empty', 'inward'),
];
let checked: Fixture | null = null;
function tested(): Fixture {
  if (!checked) {
    const f = assembled();
    checked = { ...f, w: run(f.w, TEST(f.root)) };
  }
  return { ...checked, w: v7Clone(checked.w) };
}
/** The package's null-range edges in half-beams for actual masses (beam, reference, sample). */
function edges(beam: number, reference: number, sample: number) {
  const balance = (sample * SEAT) / reference,
    band = (STICTION * (beam + reference + sample)) / (reference * HALF);
  return { inward: balance - band, outward: balance + band };
}
const snap = (u: number) => Math.round(Math.round(u / RES) * RES * 1e8) / 1e8;

describe('lever mass comparator in ex19', () => {
  it('is scoped to ex19, fits the text limit, adds no reward and needs four paid rounds of study', () => {
    for (const [scope, scenario] of [
      ['long-ex18', 'long-culture-v2-incentives'],
      ['long-ex17', 'long-culture-v3'],
    ] as const) {
      const world = initialLongWorld(scope, scenario);
      expect(continuousRegistry(world).packages.map((p) => p.id)).not.toContain(
        id,
      );
      expect(() => v7Install(world, continuousRegistry(), `${id}@1`)).toThrow(
        /not approved/,
      );
    }
    // All packages together still register: handler ids stay unique.
    expect(continuousRegistry().handlers[`long.${id}`]).toBeDefined();
    const g = genesis();
    // Registry check: nothing installable in this scope already compares masses.
    const scoped = continuousRegistry(g).packages.flatMap((p) => p.abilities);
    expect(
      scoped.filter((a) =>
        /weigh|balance|mass comparison|lever/i.test(`${a.name} ${a.function}`),
      ),
    ).toEqual([expect.objectContaining({ id })]);
    const w = fed(v7Clone(v7Install(g, continuousRegistry(g), `${id}@1`)));
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    expect(pkg?.scope).toBe('long-ex19');
    expect(pkg?.dependencies).toEqual(['foundation-open@1']);
    expect(pkg?.abilities).toHaveLength(1);
    const ability = w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(4);
    expect(ability?.learningEnergy).toBe(0.5);
    expect(ability?.revision).toBe(`${id}@1`);
    expect(ability?.handler).toBe(`long.${id}`);
    expect(ability?.equivalence).toBe(
      'measurement:lever-comparator:reference-mass-ratio:1',
    );
    expect(ability?.parameters.properties?.mode).toMatchObject({
      enum: ['assess', 'assemble', 'test', 'compare', 'inspect', 'dismantle'],
    });
    expect(ability?.references).toEqual({
      referenceId: 'optional-exact-visible',
      sampleId: 'optional-exact-visible',
      comparatorId: 'optional-exact-visible',
    });
    const limit = w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    for (const a of pkg?.abilities ?? [])
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg?.abilities,
      events: pkg?.events,
      satisfaction: pkg?.satisfaction.map((r) => r.name),
    });
    expect(visible).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    expect(pkg?.visualComponents).toEqual([]);
    expect(pkg?.satisfaction).toEqual([]);
    expect(w.config.longDevelopment?.culture?.incentives).toBe(false);
    // Unstudied use is refused without any cost.
    expect(unchanged(w, act('assess'))).toMatch(/not mastered/);
    let now = w;
    for (let i = 0; i < 4; i++) {
      const cur = fed(now),
        idle = v7Clone(cur);
      actor(idle).learning = null;
      const r = step(
        cur,
        i === 0 ? { moss: { interface: 'learn', args: { ability: id } } } : {},
      );
      const rest = step(idle).world;
      expect(
        actor(rest).vitals.energy - actor(r.world).vitals.energy,
      ).toBeCloseTo(0.5, 8);
      now = r.world;
      if (i < 3) expect(actor(now).mastered).not.toContain(id);
    }
    expect(actor(now).mastered).toContain(id);
  });

  it('assesses named materials for 0.2 energy, naming every missing physical prerequisite and changing nothing else', () => {
    const f = setup();
    // Moss's actual ex19 position: one stone, roots, no branch. Only the beam is missing.
    const lacking = cost(
      f.w,
      act('assess', {
        materialIds: [],
        supportIds: [],
        referenceId: f.reference,
        sampleId: f.root,
      }),
    );
    expect(lacking.energy).toBeCloseTo(0.2, 8);
    const d = data(lacking.world, 'lever-comparator-assessed');
    expect(d?.feasible).toBe(false);
    expect(d?.missing).toEqual([
      expect.stringMatching(/^beam: missing: .*fallen-branch unit.*gather/),
      expect.stringMatching(/^fulcrum: missing: .*stone or flint/),
    ]);
    expect(d?.requirements).toContainEqual(
      expect.objectContaining({ requirement: 'reference', met: true }),
    );
    expect(
      lacking.world.objects.some((o) => o.kind === 'lever-comparator'),
    ).toBe(false);
    expect(stack(lacking.world, f.reference).reservedFor).toBeUndefined();
    // A full candidate set, with the stone outcrop or a carried stone as the fulcrum.
    const ready = cost(
      f.w,
      act('assess', {
        materialIds: [f.branch, f.fulcrum],
        referenceId: f.reference,
        sampleId: f.root,
      }),
    );
    expect(data(ready.world, 'lever-comparator-assessed')).toMatchObject({
      feasible: true,
      missing: [],
      geometry: { seat: -0.9, slide: [-0.8, 0.95], resolution: 0.02 },
    });
    expect(
      (data(ready.world, 'lever-comparator-assessed')?.view as V7Data).state,
    ).toBe('assessed');
    expect(v7Signature(ready.world.stacks)).toBe(
      v7Signature(step(f.w).world.stacks),
    );
    const k = actor(ready.world).memory.knowledge?.[
      'moss:lever-comparator-assessment'
    ];
    expect(k?.verified).toBe(false);
    // Unsuitable parts are named, not silently accepted.
    const wrong = cost(
      f.w,
      act('assess', {
        materialIds: [f.fulcrum],
        referenceId: f.root,
      }),
    );
    const rows = data(wrong.world, 'lever-comparator-assessed')
      ?.requirements as { requirement: string; met: boolean; detail: string }[];
    expect(rows.find((r) => r.requirement === 'beam')?.detail).toMatch(
      /only a fallen-branch unit/,
    );
    expect(rows.find((r) => r.requirement === 'reference')?.detail).toMatch(
      /non-food material that does not decay/,
    );
  });

  it('assembles in three paid rounds of 0.5, keeping every part and its mass, and resumes after an interruption', () => {
    const f = setup();
    const before = v7Clone(f.w);
    const carried = (w: V7World) =>
      w.stacks
        .filter((s) => s.owner === 'moss')
        .reduce((n, s) => n + massOf(w, s), 0);
    const first = cost(f.w, assembly(f));
    expect(first.energy).toBeCloseTo(0.5, 8);
    let w = first.world;
    let o = comparator(w);
    expect(o).toMatchObject({
      createdBy: 'moss',
      revision: `${id}@1`,
      visual: { component: 'loose-material', state: 'assembling' },
      spatial: { x: STAND.x, y: STAND.y, solid: false },
      data: {
        owner: 'moss',
        status: 'assembling',
        fulcrum: { kind: 'item', id: f.fulcrum, resource: 'stone' },
        beam: f.branch,
        reference: f.reference,
        progress: { completed: 1, total: 3 },
      },
    });
    // Round 1 seats the fulcrum piece; the beam and reference stay carried and reserved.
    expect(parts(o).map((s) => s.id)).toEqual([f.fulcrum]);
    expect(w.stacks.some((s) => s.id === f.fulcrum)).toBe(false);
    const [j] = jobs(w);
    expect(stack(w, f.branch).reservedFor).toBe(j?.id);
    expect(stack(w, f.reference).reservedFor).toBe(j?.id);
    expect(events(w, 'lever-comparator-progress')).toHaveLength(1);
    expect(events(w, 'process-progress')).toHaveLength(1);
    // Another action interrupts: the work pauses without any charge.
    const idle = step(w);
    w = fed(idle.world);
    expect(events(w, 'lever-comparator-paused')).toHaveLength(1);
    expect(jobs(w)[0]).toMatchObject({ status: 'paused', completedWork: 1 });
    // Resubmitting the reserved parts is refused; the comparatorId resumes it.
    const blocked = unchanged(
      w,
      act('assemble', { materialIds: [f.branch, f.fulcrum] }),
    );
    expect(blocked).toMatch(
      /unfinished; resume it with assemble and only its comparatorId/,
    );
    const resume = act('assemble', { comparatorId: o?.id ?? '' });
    const second = cost(w, resume);
    expect(second.energy).toBeCloseTo(0.5, 8);
    w = second.world;
    expect(events(w, 'lever-comparator-resumed')).toHaveLength(1);
    o = comparator(w);
    expect(parts(o).map((s) => s.id)).toEqual([f.fulcrum, f.branch]);
    const third = cost(w, resume);
    expect(third.energy).toBeCloseTo(0.5, 8);
    w = third.world;
    o = comparator(w);
    expect(o?.data).toMatchObject({
      status: 'untested',
      referencePosition: 0,
      tilt: 'seat end down',
      workId: null,
    });
    expect(jobs(w)[0]).toMatchObject({
      status: 'completed',
      paidEnergy: 1.5,
      completedWork: 3,
    });
    const done = data(w, 'lever-comparator-assembled');
    expect(done?.components).toEqual([f.fulcrum, f.branch, f.reference]);
    expect((done?.view as V7Data).state).toBe('untested');
    // Conservation: the same three items, quantities and records, now at the comparator.
    for (const part of parts(o)) {
      const original = stack(before, part.id);
      expect(part).toEqual({
        ...original,
        owner: null,
        position: { x: STAND.x, y: STAND.y },
      });
    }
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    for (const r of ['branch', 'stone', 'root'])
      expect(total(w, r)).toBe(total(before, r));
    // No extra inventory weight: the placed parts are no longer carried.
    const placed = parts(o).reduce((n, s) => n + massOf(w, s), 0);
    expect(carried(w)).toBeCloseTo(carried(before) - placed, 8);
    expect(placed).toBeCloseTo(1.1 + 2 + 1.1, 8);
  });

  it('tips the beam by torques of the actual masses and passes a test of three empty and three loaded readings from both directions', () => {
    const f = assembled();
    const mb = 1.1,
      mr = 1.1,
      ms = massOf(f.w, stack(f.w, f.root));
    expect(ms).toBeCloseTo(0.4, 8);
    const e0 = edges(mb, mr, 0),
      e1 = edges(mb, mr, ms);
    let w = f.w;
    const seen: Record<string, unknown>[] = [];
    for (const [i, a] of TEST(f.root).entries()) {
      const r = cost(w, a);
      // Each empty or loaded reading costs one round and 0.2 energy.
      expect(r.energy).toBeCloseTo(0.2, 8);
      w = r.world;
      const d = data(w, 'lever-comparator-reading') ?? {};
      seen.push(d);
      if (i < 5) {
        expect(events(w, 'lever-comparator-tested')).toHaveLength(0);
        expect(comparator(w)?.data.status).toBe('untested');
      }
    }
    // Tips seen to the nearest 0.02 of the half-beam, from the actual torque balance.
    expect(seen.map((d) => d.position)).toEqual([
      snap(e0.outward),
      snap(e0.inward),
      snap(e0.outward),
      snap(e1.outward),
      snap(e1.inward),
      snap(e1.inward),
    ]);
    expect(seen.map((d) => d.position)).toEqual([
      0.02, -0.02, 0.02, 0.34, 0.3, 0.3,
    ]);
    expect(seen[3]).toMatchObject({
      reading: 'loaded',
      sample: f.root,
      outcome: 'tipped',
      interval: [0.32, 0.36],
      motion: {
        tilt: { from: 'seat end down', to: 'reference end down' },
        reference: { from: -0.8, to: 0.34 },
      },
    });
    // Observations never carry masses or water.
    for (const d of seen) {
      const text = JSON.stringify(d);
      expect(text).not.toMatch(/"mass"|unitMass|water/i);
    }
    expect(events(w, 'lever-comparator-tested')).toHaveLength(1);
    const t = data(w, 'lever-comparator-tested');
    expect(t).toMatchObject({
      beam: f.branch,
      reference: f.reference,
      sample: f.root,
      emptyNull: [-0.04, 0.04],
      loadedNull: [0.28, 0.36],
      hysteresis: { empty: 0.04, loaded: 0.04 },
      reloadSpread: { empty: 0, loaded: 0 },
      problems: [],
    });
    // The interval brackets the true ratio 0.4 / 1.1 and no narrower than the method allows.
    const [lo, hi] = t?.ratio as number[];
    expect(lo).toBeCloseTo(0.24 / 0.92, 7);
    expect(hi).toBeCloseTo(0.4 / 0.88, 7);
    expect(lo).toBeLessThan(ms / mr);
    expect(hi).toBeGreaterThan(ms / mr);
    expect(comparator(w)?.data.status).toBe('tested');
    expect((t?.view as V7Data).state).toBe('tested');
    expect(
      actor(w).memory.knowledge?.[
        `${comparator(w)?.id ?? ''}:lever-comparator-test`
      ]?.verified,
    ).toBe(false);
    // The person's own record keeps the readings; the sample was only seated and taken back.
    expect((ledger(w).readings as unknown[]).length).toBe(6);
    expect(stack(w, f.root)).toMatchObject({ owner: 'moss', quantity: 1 });
    expect(stack(w, f.root).reservedFor).toBeUndefined();
    expect(stack(w, f.root).decay).toBeGreaterThan(0);
  });

  it('marks a test invalid when the readings cannot close, and needs both directions', () => {
    const f = assembled();
    // A whole stone sample outweighs the 0.3 reference: no tip inside the slide.
    const stone = gather(f.w, ROCK);
    let w = stone.w;
    actor(w).position = { ...STAND };
    w = run(w, [
      read('test', 'empty', 'outward'),
      read('test', 'empty', 'inward'),
      read('test', 'empty', 'outward'),
      read('test', 'loaded', 'outward', stone.item),
      read('test', 'loaded', 'outward', stone.item),
    ]);
    expect(data(w, 'lever-comparator-reading')?.outcome).toBe(
      'no tip within the slide',
    );
    // Same direction only: still no result.
    expect(events(w, 'lever-comparator-tested')).toHaveLength(0);
    expect(events(w, 'lever-comparator-invalid')).toHaveLength(0);
    w = run(w, [read('test', 'loaded', 'inward', stone.item)]);
    expect(events(w, 'lever-comparator-invalid')).toHaveLength(1);
    expect(data(w, 'lever-comparator-invalid')?.problems).toContain(
      'loaded: a reading found no tip inside the slide range',
    );
    expect(comparator(w)?.data.status).toBe('invalid');
    // compare refuses an invalid comparator; a new test may follow.
    expect(unchanged(w, read('compare', 'empty', 'outward'))).toMatch(
      /pass a test first/,
    );
  });

  it('compares a drying slice before and after with the same reference, following it through cutting and pickup', () => {
    const f = tested();
    let w = study(f.w, SLICE, ['moss']);
    actor(w).position = { ...STAND };
    const before = massOf(w, stack(w, f.root));
    w = run(w, ENDPOINT(f.root));
    const first = data(w, 'lever-comparator-endpoint');
    expect(first).toMatchObject({
      sample: [f.root],
      reference: f.reference,
      quantity: 1,
      wet: false,
      problems: [],
    });
    const r1 = first?.ratio as number[];
    expect(r1[0]).toBeLessThan(before / 1.1);
    expect(r1[1]).toBeGreaterThan(before / 1.1);
    // Cutting into thin slices follows the thin-slice trial's own rules and costs.
    const cut = run(w, [
      {
        interface: SLICE,
        args: {
          mode: 'prepare',
          inputStackId: f.root,
          toolId: f.tool,
          ...SPOT,
        },
      },
    ]);
    const slices = cut.stacks.find(
      (s) => s.processing?.preservationPhysics && s.owner === null,
    );
    expect(slices).toBeDefined();
    w = cut;
    for (let i = 0; i < 8; i++) w = fed(step(w).world);
    // Picking the slices up pauses the drying trial under its own rule and gives a new id.
    actor(w).position = { ...STAND };
    const picked = step(fed(w), {
      moss: {
        interface: 'pickup',
        args: { target: slices?.id ?? '', quantity: 1 },
      },
    });
    expect(picked.outcomes.moss?.success).toBe(true);
    w = fed(picked.world);
    expect(events(w, 'slice-drying-carried')).toHaveLength(1);
    const carried = w.stacks.find(
      (s) => s.owner === 'moss' && s.processing?.preservationPhysics,
    );
    if (!carried) throw new Error('Missing carried slices.');
    expect(carried.id).not.toBe(slices?.id);
    const after = massOf(w, carried);
    expect(after).toBeLessThan(before * 0.6);
    const lineage = ledger(w).endpoints as {
      sample: string[];
      transfers: V7Data[];
    }[];
    expect(lineage.at(-1)?.sample).toEqual([f.root, slices?.id, carried.id]);
    expect(lineage.at(-1)?.transfers.map((t) => t.via)).toEqual([
      'slice-drying-cut',
      'picked-up',
    ]);
    w = run(w, ENDPOINT(carried.id));
    expect(events(w, 'lever-comparator-compared')).toHaveLength(1);
    const c = data(w, 'lever-comparator-compared');
    expect(c).toMatchObject({
      direction: 'decrease',
      reference: f.reference,
      quantity: { before: 1, after: 1 },
      observedRemoval: 0,
      reasons: [],
      surfaceWaterBound: 0,
    });
    const [lo, hi] = c?.ratio as number[];
    expect(hi).toBeLessThan(1);
    expect(lo).toBeLessThan(after / before);
    expect(hi).toBeGreaterThan(after / before);
    expect(String(c?.meaning)).toMatch(/net mass change .* not water loss/);
    expect(JSON.stringify(c)).not.toMatch(/"mass"|unitMass/);
    // The slices are untouched by the readings: same quantity, water record and decay rules.
    expect(stack(w, carried.id).quantity).toBe(1);
    expect(stack(w, carried.id).reservedFor).toBeUndefined();
    // No practice milestone, satisfaction or comfort comes from assembling, testing or comparing.
    expect(
      actor(w).extensionState[
        'open:practice:measurement:lever-comparator:reference-mass-ratio:1'
      ],
    ).toBeUndefined();
    expect(
      actor(w).wellbeing.sources.filter((x) => JSON.stringify(x).includes(id)),
    ).toEqual([]);
    // The drying trial still refuses an instrument and keeps reporting no mass reading.
    const tryInstrument = step(fed(w), {
      moss: {
        interface: SLICE,
        args: { mode: 'inspect', instrumentId: comparator(w)?.id ?? '' },
      },
    });
    expect(tryInstrument.outcomes.moss?.success).toBe(false);
    expect(tryInstrument.outcomes.moss?.reason).toMatch(
      /No calibrated weighing instrument/,
    );
  });

  it('reports an unchanged whole sample as inconclusive rather than as a change', () => {
    const f = tested();
    const w = run(f.w, [...ENDPOINT(f.spare), ...ENDPOINT(f.spare)]);
    expect(events(w, 'lever-comparator-compared')).toHaveLength(0);
    const c = data(w, 'lever-comparator-inconclusive');
    expect(c).toMatchObject({
      direction: 'inconclusive',
      reasons: ['the after/before interval includes 1'],
    });
    const [lo, hi] = c?.ratio as number[];
    expect(lo).toBeLessThan(1);
    expect(hi).toBeGreaterThan(1);
  });

  it('refuses invalid steps before any charge', () => {
    const f = setup();
    // Assembly checks.
    expect(
      unchanged(
        f.w,
        act('assemble', {
          materialIds: [f.fulcrum, f.tool],
          referenceId: f.reference,
        }),
      ),
    ).toMatch(/beam: .*only a fallen-branch unit/);
    expect(
      unchanged(
        f.w,
        act('assemble', {
          materialIds: [f.branch, f.fulcrum],
          referenceId: f.root,
        }),
      ),
    ).toMatch(
      /reference: the reference must be non-food material that does not decay/,
    );
    expect(
      unchanged(
        f.w,
        act('assemble', {
          materialIds: [f.branch, f.fulcrum],
          supportIds: [ROCK],
          referenceId: f.reference,
        }),
      ),
    ).toMatch(/exactly one fulcrum/);
    expect(
      unchanged(
        f.w,
        act('assemble', {
          materialIds: [f.branch, f.fulcrum],
          referenceId: f.fulcrum,
        }),
      ),
    ).toMatch(/different items/);
    // The stone outcrop is out of reach from the start.
    expect(
      unchanged(
        f.w,
        act('assemble', {
          materialIds: [f.branch],
          supportIds: [ROCK],
          referenceId: f.reference,
        }),
      ),
    ).toMatch(/out of reach/);
    const tired = v7Clone(f.w);
    actor(tired).vitals.energy = 0.4;
    expect(unchanged(tired, assembly(f))).toMatch(/0\.5 energy/);
    expect(
      unchanged(
        f.w,
        act('assemble', {
          materialIds: [f.branch, f.fulcrum],
          referenceId: f.reference,
          approach: 'outward',
        }),
      ),
    ).toMatch(/does not use approach/);
    // Reading checks.
    expect(unchanged(f.w, read('test', 'empty', 'outward'))).toMatch(
      /no lever comparator/,
    );
    const a = assembled();
    expect(unchanged(a.w, read('compare', 'empty', 'outward'))).toMatch(
      /pass a test first/,
    );
    expect(
      unchanged(a.w, act('test', { reading: 'loaded', approach: 'inward' })),
    ).toMatch(/needs sampleId/);
    expect(unchanged(a.w, read('test', 'empty', 'inward', f.root))).toMatch(
      /leave out sampleId/,
    );
    expect(unchanged(a.w, act('test', { reading: 'empty' }))).toMatch(
      /approach \(outward or inward\)/,
    );
    expect(
      unchanged(a.w, read('test', 'loaded', 'outward', f.fulcrum)),
    ).not.toBe('');
    const far = v7Clone(a.w);
    actor(far).position = { x: STAND.x - 1.6, y: STAND.y };
    expect(unchanged(far, read('test', 'empty', 'outward'))).toMatch(
      /beyond hand reach/,
    );
    const weak = v7Clone(a.w);
    actor(weak).vitals.energy = 0.1;
    expect(unchanged(weak, read('test', 'empty', 'outward'))).toMatch(
      /0\.2 energy/,
    );
    const t = tested();
    expect(
      unchanged(t.w, read('compare', 'loaded', 'outward', f.root)),
    ).toMatch(/Open the endpoint with an empty check first/);
    const opened = run(t.w, [
      read('compare', 'empty', 'outward'),
      read('compare', 'loaded', 'outward', f.root),
    ]);
    expect(
      unchanged(opened, read('compare', 'loaded', 'inward', f.spare)),
    ).toMatch(/This endpoint uses sample/);
    expect(unchanged(t.w, act('inspect', { reading: 'empty' }))).toMatch(
      /does not use reading/,
    );
    expect(unchanged(t.w, act('weigh'))).toMatch(
      /outside the declared choices|Unknown/,
    );
  });

  it('lets only the owner use or dismantle it, while anyone may assess it', () => {
    const f = tested();
    const w = v7Clone(f.w);
    const o = comparator(w);
    actor(w, 'lin').position = free(w, STAND.x, STAND.y, 0.6, 'lin');
    const by = (a: V7Action) => unchanged(w, a, 'lin');
    expect(
      by(
        act('test', {
          comparatorId: o?.id ?? '',
          reading: 'empty',
          approach: 'outward',
        }),
      ),
    ).toMatch(/Only the person who assembled/);
    expect(by(act('inspect', { comparatorId: o?.id ?? '' }))).toMatch(
      /Only the person who assembled/,
    );
    expect(by(act('dismantle', { comparatorId: o?.id ?? '' }))).toMatch(
      /Only the person who assembled/,
    );
    const look = cost(w, act('assess', { comparatorId: o?.id ?? '' }), 'lin');
    expect(look.energy).toBeCloseTo(0.2, 8);
    const d = data(look.world, 'lever-comparator-assessed');
    expect(d).toMatchObject({
      comparator: o?.id,
      status: 'tested',
      wet: false,
    });
    // Lin learns nothing about Moss's readings.
    expect(JSON.stringify(d)).not.toMatch(/loadedNull|"ratio"|endpoint/);
    expect(comparator(look.world)?.data.owner).toBe('moss');
  });

  it('inspects for 0.2 energy and dismantles for 0.2 energy, returning every part with its identity', () => {
    const f = tested();
    const seen = cost(f.w, act('inspect'));
    expect(seen.energy).toBeCloseTo(0.2, 8);
    const d = data(seen.world, 'lever-comparator-inspected');
    expect(d).toMatchObject({
      status: 'tested',
      tilt: comparator(seen.world)?.data.tilt,
      wet: false,
      test: { readings: 6, sample: f.root },
    });
    expect(typeof d?.tilt).toBe('string');
    const before = v7Clone(seen.world);
    const o = comparator(before);
    const down = cost(before, act('dismantle'));
    expect(down.energy).toBeCloseTo(0.2, 8);
    const w = down.world;
    expect(comparator(w)).toBeUndefined();
    expect(data(w, 'lever-comparator-dismantled')).toMatchObject({
      recovered: [f.fulcrum, f.branch, f.reference],
      released: [],
    });
    for (const p of parts(o))
      expect(stack(w, p.id)).toMatchObject({
        resource: p.resource,
        quantity: p.quantity,
        origin: p.origin,
        owner: 'moss',
      });
    for (const r of ['branch', 'stone', 'root'])
      expect(total(w, r)).toBe(total(before, r));
    expect(ledger(w).test).toBeNull();
    // The parts are ordinary items again and can be assembled anew.
    const again = cost(w, assembly(f));
    expect(again.energy).toBeCloseTo(0.5, 8);
  });

  it('dismantling an unfinished assembly releases the reserved parts and recovers the placed ones', () => {
    const f = setup();
    const w = run(f.w, [assembly(f)]);
    const down = cost(w, act('dismantle'));
    expect(data(down.world, 'lever-comparator-dismantled')).toMatchObject({
      recovered: [f.fulcrum],
      released: [f.branch, f.reference],
    });
    expect(jobs(down.world)[0]?.status).toBe('stopped');
    expect(down.world.stacks.some((s) => s.reservedFor)).toBe(false);
    for (const item of [f.branch, f.fulcrum, f.reference])
      expect(stack(down.world, item).owner).toBe('moss');
  });

  it('voids the test when rain wets it and treats wet endpoints by their material', () => {
    const f = tested();
    const w = v7Clone(f.w);
    // Move the clock to the first rain of this seed's weather cycle.
    w.time = 100;
    w.tick = 100;
    const wet = fed(step(w).world);
    expect(events(wet, 'lever-comparator-wetted')).toHaveLength(1);
    expect(comparator(wet)?.data).toMatchObject({
      wet: true,
      wetSpells: 1,
      status: 'untested',
    });
    expect(ledger(wet).test).toBeNull();
    expect(unchanged(wet, read('compare', 'empty', 'outward'))).toMatch(
      /pass a test first/,
    );
    // Continued rain does not wet it again; a new test is needed and allowed.
    const retest = run(wet, TEST(f.root));
    expect(events(retest, 'lever-comparator-wetted')).toHaveLength(0);
    expect(comparator(retest)?.data.status).toBe('tested');
    const e = run(retest, ENDPOINT(f.spare));
    expect(data(e, 'lever-comparator-endpoint')?.wet).toBe(true);
    // The branch reference has no represented surface-water bound: a wet comparison is inconclusive.
    const again = run(e, ENDPOINT(f.spare));
    expect(data(again, 'lever-comparator-inconclusive')).toMatchObject({
      direction: 'inconclusive',
      wet: { before: true, after: true },
      surfaceWaterBound: 0,
      reasons: [expect.stringMatching(/visibly wet .* no surface-water bound/)],
    });
  });

  it('is damaged when its fulcrum loses firm ground, and then only dismantles', () => {
    const f = tested();
    const w = v7Clone(f.w);
    const o = comparator(w);
    const x = Math.floor(o?.spatial.x ?? 0),
      y = Math.floor(o?.spatial.y ?? 0),
      row = w.terrain[y] ?? '';
    w.terrain[y] = `${row.slice(0, x)},${row.slice(x + 1)}`;
    const failed = fed(step(w).world);
    expect(events(failed, 'lever-comparator-failed')).toHaveLength(1);
    expect(data(failed, 'lever-comparator-failed')?.cause).toMatch(
      /no longer firm/,
    );
    expect(comparator(failed)?.data.status).toBe('damaged');
    expect(unchanged(failed, read('test', 'empty', 'outward'))).toMatch(
      /damaged/,
    );
    const down = cost(failed, act('dismantle'));
    expect(data(down.world, 'lever-comparator-dismantled')?.recovered).toEqual([
      f.fulcrum,
      f.branch,
      f.reference,
    ]);
  });

  it('at death stops the assembly, leaves the parts under the death rules and grants nobody the comparator', () => {
    const f = setup();
    const dying = run(f.w, [assembly(f)]);
    actor(dying).vitals.health = 0.0001;
    actor(dying).vitals.satiety = 0;
    const where = { ...actor(dying).position };
    const died = step(dying).world;
    expect(events(died, 'died')).toHaveLength(1);
    expect(events(died, 'lever-comparator-interrupted')).toHaveLength(1);
    expect(jobs(died)[0]?.status).toBe('stopped');
    for (const item of [f.branch, f.reference]) {
      expect(stack(died, item)).toMatchObject({ owner: null, position: where });
      expect(stack(died, item).reservedFor).toBeUndefined();
    }
    const o = comparator(died);
    expect(o?.data.owner).toBeNull();
    expect(parts(o).map((s) => s.id)).toEqual([f.fulcrum]);
    for (const r of ['branch', 'stone'])
      expect(total(died, r)).toBe(total(f.w, r));
    // Under the existing ownership rules anyone in reach may take the unowned parts.
    const w = fed(died);
    actor(w, 'lin').position = free(
      w,
      o?.spatial.x ?? 0,
      o?.spatial.y ?? 0,
      0.6,
      'lin',
    );
    const taken = cost(
      w,
      act('dismantle', { comparatorId: o?.id ?? '' }),
      'lin',
    );
    expect(stack(taken.world, f.fulcrum).owner).toBe('lin');
    expect(comparator(taken.world)).toBeUndefined();
  });
});
