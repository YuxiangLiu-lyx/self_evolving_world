import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Data,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';
import { CONTINUOUS_VISUALS } from '../../viewer/src/continuous-visuals.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 180_000 });

const id = 'hand-frap-crossing';
const CORD = 'hand-twist-fiber-cord';
const KNOT = 'hand-tie-cord-knot';
const JOIN = 'hand-join-fiber-cords';
const BIND = 'hand-bind-crossing';
const SECTIONED = 'hand-twist-sectioned-cord';
const LASH = 'hand-lash-crossing';
const DEPENDENCIES = [CORD, KNOT, JOIN, BIND, LASH];
const WAIT: V7Action = { interface: 'wait', args: {} };
const REEDS = { source: 'forest-reed-0', at: { x: 22.6, y: 5.9 } };
const BRANCHES = { source: 'start-1-branches', at: { x: 20.5, y: 9.7 } };
/** Open dry meadow of the ex16 crossing fixtures, far from everyone else. */
const SITE = { x: 19.5, y: 5 };
/** Engine material values that no event may reveal. */
const HIDDEN = /flexib|hardness/i;
/** Agent-visible words the brief also excludes, beyond CULTURE_EXCLUDED_WORDS. */
const ALSO_EXCLUDED = /story|myth|legend|tradition/i;

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
  w.events.filter((e) => e.type === `crossing-frapping-${type}`);
const frapEvents = (w: V7World) =>
  w.events
    .filter((e) => e.type.startsWith('crossing-frapping-'))
    .map((e) => e.type.replace('crossing-frapping-', ''));
const mode = (m: string, args: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...args },
});
const frap = (bindingId: string, frapCount = 1) =>
  mode('attempt', { bindingId, frapCount });
const test = (
  bindingId: string,
  trialDirection = 'separate',
  trialForce = 10,
  trialDuration = 60,
) => mode('trial', { bindingId, trialForce, trialDuration, trialDirection });
const tenths = (n: number) => Math.round(n * 10);
const units = (w: V7World, resource: string) =>
  w.stacks
    .filter((s) => s.resource === resource)
    .reduce((n, s) => n + tenths(s.quantity), 0);
interface Job {
  id: string;
  ability: string;
  mode: string;
  status: string;
  completedWork: number;
  remainingWork: number;
  initialWork: number;
  paidEnergy: number;
  reached: number;
  binding: string | null;
}
const jobs = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Job);
const job = (w: V7World) => jobs(w).at(-1);
const item = (w: V7World, stackId: string) =>
  w.stacks.find((s) => s.id === stackId);
const cordPart = (s?: V7Stack): V7Data =>
  (s?.processing?.fiberCord ?? {}) as V7Data;
const lashPart = (s?: V7Stack): V7Data =>
  (s?.processing?.crossingLashing ?? {}) as V7Data;
const frapPart = (s?: V7Stack): V7Data =>
  (s?.processing?.crossingFrapping ?? {}) as V7Data;
const num = (v: unknown) => (typeof v === 'number' ? v : NaN);
const asText = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
const record = (v: unknown): V7Data =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as V7Data) : {};
const records = (v: unknown): V7Data[] =>
  Array.isArray(v) ? v.map(record) : [];
const list = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((x) => num(x)) : [];
const pairs = (v: unknown): number[][] =>
  Array.isArray(v) ? v.map((x) => list(x)) : [];
const energy = (w: V7World, name = 'wren') => actor(w, name).vitals.energy;
/** Energy a step spent beyond what the same round spends while waiting. */
const spent = (from: V7World, to: V7World, name = 'wren') =>
  energy(step(from).world, name) - energy(to, name);
const visibleText = (w: V7World) =>
  JSON.stringify(
    w.events
      .filter(
        (e) =>
          e.type.startsWith('crossing-frapping-') || e.type === 'trial-result',
      )
      .map((e) => [e.description, e.data]),
  );
const clean = (w: V7World) => {
  expect(visibleText(w)).not.toMatch(HIDDEN);
  expect(CULTURE_EXCLUDED_WORDS.test(visibleText(w))).toBe(false);
  expect(ALSO_EXCLUDED.test(visibleText(w))).toBe(false);
  expect(w.events.filter((e) => e.type === 'satisfaction')).toHaveLength(0);
  expect(w.events.filter((e) => e.type === 'practice-confirmed')).toHaveLength(
    0,
  );
};
const unchanged = (
  w: V7World,
  action: V7Action,
  reason: RegExp,
  who = 'wren',
) => {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.success).toBe(false);
  expect(r.outcomes[who]?.reason).toMatch(reason);
  expect(r.world.stacks).toEqual(idle.stacks);
  expect(actor(r.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(jobs(r.world)).toEqual(jobs(idle));
  return r;
};

/** The declared laws restated. fiber-cord@1 ply diameter from conserved volume. */
const plyDiameter = (units: number, length: number) =>
  2 *
  Math.sqrt(
    (units * 0.25 * (1 - 0.9)) /
      500 /
      2 /
      ((length * 2) / Math.sqrt(3) + 0.04) /
      Math.PI,
  );
/** fiber-cord@1 two-ply stiffness of reed at the world's 0.9 water share (weakening 1 - 0.55 x 0.9). */
const stiffness = (ply: number) =>
  2e8 * (1 - 0.55 * 0.9) * 0.75 * 2 * ((Math.PI * ply * ply) / 4);
/** No hand-twisted cord exceeds 0.64 m, which no transverse turn fits, so the feasible paths run on
 * fixture cords lengthened in place with their volume conserved under the fiber-cord@1 law. */
const SIZES = {
  long: [0.2, 0.6, 0.64],
  fixture: [0.2, 0.6, 1.2],
  triple: [0.2, 0.6, 1.6],
  boundary: [0.2, 0.6, 0.64],
} as const;
type Size = keyof typeof SIZES;
function lengthen(w: V7World, stackId: string, overall: number) {
  const p = cordPart(item(w, stackId)),
    length = overall - 0.04;
  p.length = length;
  p.twisted = length;
  p.overall = overall;
  p.plyDiameter = plyDiameter(0.2, length);
}

function installed() {
  const genesis = initialLongWorld('long-ex16', 'long-culture-v2');
  let w = genesis;
  for (const dep of [CORD, KNOT, JOIN, BIND, SECTIONED, LASH])
    w = v7Install(w, continuousRegistry(w), `${dep}@1`);
  return v7Clone(v7Install(w, continuousRegistry(w), `${id}@1`));
}
let cache:
  | {
      unstudied: V7World;
      cords: Record<Size, string>;
      lot: string;
      single: string;
      spare: string;
    }
  | undefined;
/** Wren gathers real reed and makes four real 0.64 m sectioned cords, then three real branch lots. */
function build() {
  if (cache) return cache;
  let w = installed();
  actor(w).position = { ...REEDS.at };
  const g = step(w, {
    wren: { interface: 'gather', args: { target: REEDS.source, quantity: 3 } },
  });
  expect(g.outcomes.wren?.success).toBe(true);
  w = g.world;
  const raw = w.stacks.find(
    (s) => s.owner === 'wren' && s.origin === REEDS.source && !s.processing,
  )?.id;
  if (!raw) throw new Error('Missing gathered fixture reed.');
  // Cord making and lashing are studied in their own tests; their mastery is set directly here.
  actor(w).mastered.push(CORD, SECTIONED, LASH);
  actor(w).vitals.energy = 40;
  w = step(w, {
    wren: {
      interface: SECTIONED,
      args: { mode: 'sample', materials: [{ stackId: raw, quantity: 0.1 }] },
    },
  }).world;
  const cords: Partial<Record<Size, string>> = {};
  for (const [name, [quantity, requestedLength]] of Object.entries(SIZES)) {
    const known = new Set(w.stacks.map((s) => s.id));
    for (let i = 0; i < 7; i++) {
      actor(w).vitals.energy = 40;
      w = step(w, {
        wren: {
          interface: SECTIONED,
          args: {
            mode: 'make',
            materials: [{ stackId: raw, quantity }],
            requestedLength,
          },
        },
      }).world;
    }
    const made = w.stacks.find(
      (s) => !known.has(s.id) && cordPart(s).role === 'cord',
    );
    if (!made) throw new Error(`Missing fixture cord ${name}.`);
    cords[name as Size] = made.id;
  }
  const lots: string[] = [];
  for (const quantity of [2, 1, 1]) {
    actor(w).position = { ...BRANCHES.at };
    actor(w).vitals.energy = 40;
    const r = step(w, {
      wren: {
        interface: 'gather',
        args: { target: BRANCHES.source, quantity },
      },
    });
    expect(r.outcomes.wren?.success).toBe(true);
    w = r.world;
    const lot = w.stacks.find(
      (s) =>
        s.owner === 'wren' && s.resource === 'branch' && !lots.includes(s.id),
    );
    if (!lot) throw new Error('Missing gathered branch lot.');
    lots.push(lot.id);
  }
  for (const name of ['fixture', 'triple'] as const)
    lengthen(w, cords[name] ?? '', SIZES[name][2]);
  actor(w).position = { ...SITE };
  actor(w).vitals.energy = 40;
  cache = {
    unstudied: w,
    cords: cords as Record<Size, string>,
    lot: lots[0] ?? '',
    single: lots[1] ?? '',
    spare: lots[2] ?? '',
  };
  return cache;
}
let studied: V7World | undefined;
/** The fixture world after Wren studied frapping for three paid rounds. */
function ready() {
  if (!studied) {
    let w = step(build().unstudied, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    for (let i = 0; i < 2; i++) w = step(w).world;
    expect(actor(w).mastered).toContain(id);
    actor(w).position = { ...SITE };
    actor(w).vitals.energy = 40;
    studied = w;
  }
  return v7Clone(studied);
}
const cordId = (name: Size) => build().cords[name];
const lashAction = (name: Size, angle = 90, wrapCount = 2): V7Action => ({
  interface: LASH,
  args: {
    mode: 'attempt',
    pieceIds: [build().single, build().spare],
    cordId: cordId(name),
    crossingAngle: angle,
    wrapCount,
  },
});
/** Repeats an action, restoring energy after each round. */
function rounds(n: number, action: V7Action, from: V7World) {
  let w = from;
  for (let i = 0; i < n; i++) {
    const r = step(w, { wren: action });
    expect(r.outcomes.wren?.success).toBe(true);
    w = r.world;
    actor(w).vitals.energy = 40;
  }
  return w;
}
const lashings: Partial<Record<string, V7World>> = {};
/** The two single-unit lots lashed with a real cord in wrapCount + 3 paid hand-lash-crossing rounds. */
function lashed(name: Size = 'fixture', angle = 90, from?: V7World) {
  const key = `${name}-${String(angle)}`;
  const w = from
    ? rounds(5, lashAction(name, angle), from)
    : (lashings[key] ??= rounds(5, lashAction(name, angle), ready()));
  expect(lashPart(item(w, cordId(name)))).toMatchObject({ state: 'bound' });
  return v7Clone(w);
}
const bindingOf = (w: V7World, name: Size = 'fixture') =>
  asText(lashPart(item(w, cordId(name))).bindingId);
const fraps: Partial<Record<string, V7World>> = {};
/** A lashing frapped with frapCount transverse turns in frapCount + 3 paid rounds. */
function frapped(name: Size = 'fixture', frapCount = 1) {
  const key = `${name}-${String(frapCount)}`;
  fraps[key] ??= (() => {
    const w = lashed(name);
    return rounds(frapCount + 3, frap(bindingOf(w, name), frapCount), w);
  })();
  return v7Clone(fraps[key]);
}
const heldData = (name: Size = 'fixture', frapCount = 1) => {
  const w0 = lashed(name),
    w = rounds(frapCount + 2, frap(bindingOf(w0, name), frapCount), w0),
    r = step(w, { wren: frap(bindingOf(w0, name), frapCount) });
  return { before: w, world: r.world, outcome: r.outcomes.wren };
};
const assessOf = (w: V7World) =>
  record(events(w, 'assessed')[0]?.data.measured);

describe('hand-frapped crossing lashing in ex16', () => {
  it('is scoped to ex16 after the cord, binding and lashing packages, keeps them byte-identical, needs three study rounds at 0.2 energy and fits the frozen size limit', () => {
    const other = initialLongWorld('long-ex15', 'long-culture');
    expect(() =>
      v7Install(other, continuousRegistry(other), `${id}@1`),
    ).toThrow();
    let bare = initialLongWorld('long-ex16', 'long-culture-v2');
    for (const dep of DEPENDENCIES) {
      expect(() =>
        v7Install(bare, continuousRegistry(bare), `${id}@1`),
      ).toThrow(/dependency/);
      bare = v7Install(bare, continuousRegistry(bare), `${dep}@1`);
    }
    // The reused packages keep their exact ability text, handlers and events.
    const withIt = v7Install(bare, continuousRegistry(bare), `${id}@1`);
    for (const reused of [...DEPENDENCIES]) {
      const text = (w: V7World) =>
        JSON.stringify(w.abilities.find((a) => a.id === reused));
      expect(text(withIt)).toBe(text(bare));
      expect(withIt.abilities.find((a) => a.id === reused)?.revision).toBe(
        `${reused}@1`,
      );
    }
    const w = v7Clone(build().unstudied);
    const ability = w.abilities.find((a) => a.id === id);
    expect(ability).toMatchObject({
      learning: 3,
      learningEnergy: 0.2,
      prerequisites: [],
      references: {},
      revision: `${id}@1`,
      handler: 'long.hand-frap-crossing',
      equivalence: 'binding:hand-frapped-crossing-lashing:1',
    });
    expect(
      w.abilities.filter((a) => a.equivalence === ability?.equivalence),
    ).toHaveLength(1);
    const limit = w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(3500);
    const registry = continuousRegistry(w),
      pkg = registry.packages.find((p) => p.id === id);
    expect(pkg?.scope).toBe('long-ex16');
    expect(
      registry.packages.filter((p) =>
        Object.keys(p.handlers).includes('long.hand-frap-crossing'),
      ),
    ).toHaveLength(1);
    const text = JSON.stringify({
      abilities: pkg?.abilities,
      events: pkg?.events,
    });
    expect(CULTURE_EXCLUDED_WORDS.test(text)).toBe(false);
    expect(ALSO_EXCLUDED.test(text)).toBe(false);
    expect(text).not.toMatch(HIDDEN);
    expect(pkg?.satisfaction).toEqual([]);
    expect(pkg?.visualComponents).toEqual([]);
    expect(
      pkg?.visualComponents.every(
        (c) => typeof CONTINUOUS_VISUALS[c] === 'function',
      ),
    ).toBe(true);
    expect(pkg?.events?.every((e) => e.startsWith('crossing-frapping-'))).toBe(
      true,
    );
    actor(w).position = { ...SITE };
    const early = step(w, {
      wren: mode('assess', {
        pieceIds: [build().single, build().spare],
        cordId: cordId('long'),
        crossingAngle: 90,
        wrapCount: 2,
        frapCount: 1,
      }),
    });
    expect(early.outcomes.wren?.reason).toMatch(/not mastered/);
    expect(actor(early.world).vitals).toEqual(actor(step(w).world).vitals);
    // Each of the three study rounds is paid individually; no other ability is learned.
    const before = [...actor(w).mastered];
    let x = step(w, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(spent(w, x)).toBeCloseTo(0.2, 6);
    for (let i = 0; i < 2; i++) {
      expect(actor(x).mastered).not.toContain(id);
      const resting = v7Clone(x);
      actor(resting).learning = null;
      const next = step(x).world;
      expect(energy(step(resting).world) - energy(next)).toBeCloseTo(0.2, 6);
      x = next;
    }
    expect(actor(x).mastered).toEqual([...before, id]);
    expect(JSON.stringify(actor(x).wellbeing.sources)).not.toContain(id);
    // Learning alone creates no item, relation or frapping event.
    expect(frapEvents(x)).toEqual([]);
    expect(x.stacks.length).toBe(w.stacks.length);
  });

  it("assess: Wren's actual 0.64 m cord, lashed in two turns round her two whole branch units, is measured short for every transverse turn count; attempt is refused before costs", () => {
    const w0 = lashed('long'),
      bindingId = bindingOf(w0, 'long'),
      c = cordId('long'),
      W = 2 * plyDiameter(0.2, 0.6),
      reed = units(w0, 'reed'),
      branch = units(w0, 'branch');
    // The base lashing is Wren's: two turns at 90 degrees needing about 0.6124 m of the 0.64 m cord.
    const g = record(lashPart(item(w0, c)).geometry);
    expect(g).toMatchObject({ wrapCount: 2, crossingAngle: 90, fits: true });
    expect(num(g.need)).toBeCloseTo(0.6124, 3);
    expect(num(g.width)).toBeCloseTo(W, 4);
    let previous = 0;
    for (const frapCount of [1, 2, 3]) {
      const r = step(w0, {
          wren: mode('assess', { bindingId, frapCount }),
        }),
        w = r.world,
        e = events(w, 'assessed')[0],
        measured = record(e?.data.measured);
      expect(r.outcomes.wren?.success).toBe(true);
      expect(spent(w0, w)).toBeCloseTo(0.5, 6);
      expect(frapEvents(w)).toEqual(['assessed']);
      expect(e?.data).toMatchObject({
        outcome: 'shortfall-too-short',
        measuredShortfall: true,
      });
      expect(measured).toMatchObject({
        fits: false,
        frapCount,
        wrapCount: 2,
        centreline: 0.64,
      });
      expect(num(measured.need)).toBeGreaterThan(0.64);
      expect(num(measured.shortfall)).toBeCloseTo(num(measured.need) - 0.64, 3);
      expect(num(measured.shortfall)).toBeGreaterThan(previous);
      previous = num(measured.shortfall);
      expect(asText(measured.problem)).toMatch(
        /the cord is 0.64 m; .* transverse turn\(s\) need .* short by .* separate or joined frapping cord is not supported/,
      );
      // The measured route is a distinguished overlay, never a completed frap.
      expect(record(e?.data.visual)).toMatchObject({
        completedAppearance: false,
        state: 'separate',
      });
      expect(record(record(e?.data.visual).overlay)).toMatchObject({
        kind: 'measured-route-not-tied',
        distinguished: true,
      });
      // Nothing was tied, opened, reserved or consumed; the lashing stays as it was.
      expect(w.stacks).toEqual(step(w0).world.stacks);
      expect(units(w, 'reed')).toBe(reed);
      expect(units(w, 'branch')).toBe(branch);
      expect(lashPart(item(w, c))).toMatchObject({
        state: 'bound',
        bindingId,
      });
      expect(item(w, c)?.reservedFor).toBe(bindingId);
      expect(
        actor(w).memory.knowledge?.[
          `frapping-fit:reed-5.9mm:branch-31.6-31.6mm:90deg:2-turns:${String(frapCount)}-transverse:shortfall-too-short`
        ]?.verified,
      ).toBe(true);
      clean(w);
    }
    // The visible least length (the lashing's own share, the way down and back and a turn round
    // both leg bundles) already exceeds the cord, so attempt spends nothing.
    unchanged(w0, frap(bindingId, 1), /need at least .* Nothing was spent/);
    // Her untied state: the proposed crossing is measured with its lashing stages; nothing is lashed.
    const free = ready(),
      p = step(free, {
        wren: mode('assess', {
          pieceIds: [build().single, build().spare],
          cordId: c,
          crossingAngle: 90,
          wrapCount: 2,
          frapCount: 1,
        }),
      }),
      measured = assessOf(p.world);
    expect(p.outcomes.wren?.success).toBe(true);
    expect(spent(free, p.world)).toBeCloseTo(0.5, 6);
    expect(measured.fits).toBe(false);
    expect(
      records(measured.stages)
        .map((s) => asText(s.stage))
        .filter((s) => s.startsWith('lash-')),
    ).toEqual([
      'lash-route-turn-1',
      'lash-route-turn-2',
      'lash-form-tuck-closure',
      'lash-dress-release-check',
    ]);
    expect(p.world.stacks).toEqual(step(free).world.stacks);
    for (const s of [build().single, build().spare, c])
      expect(item(p.world, s)?.reservedFor).toBeUndefined();
    // The shorter cords are not reserved, combined or substituted.
    expect(
      p.world.stacks.filter((s) => s.reservedFor !== undefined),
    ).toHaveLength(0);
  });

  it('the measured route goes round both leg bundles at the bend limit, later transverse turns lie on earlier ones and the need is the longest stage', () => {
    const w0 = lashed('triple'),
      bindingId = bindingOf(w0, 'triple'),
      W = 2 * plyDiameter(0.2, 1.56),
      w = step(w0, { wren: mode('assess', { bindingId, frapCount: 3 }) }).world,
      g = assessOf(w),
      legs = records(g.legs),
      turns = records(g.transverseTurns),
      stages = records(g.stages);
    expect(g.fits).toBe(true);
    expect(num(g.width)).toBeCloseTo(W, 4);
    // The route never bends tighter than the cord's measured bend limit.
    expect(g.routeRadius).toBe(g.bendLimit);
    expect(num(g.routeRadius)).toBeGreaterThan(num(g.width));
    // Each base turn's two legs cross the contact plane symmetrically and can be drawn in.
    expect(legs).toHaveLength(2);
    for (const l of legs) {
      const [a, b] = list(l.atContactPlane);
      expect(num(a)).toBeGreaterThan(0);
      expect(num(b)).toBeCloseTo(-num(a), 4);
      for (const r of list(l.roomToDrawIn)) expect(r).toBeGreaterThan(0);
    }
    // Later turns lie one width further out: about 2 pi w longer each.
    const lengths = turns.map((t) => num(t.length));
    turns.forEach((t, i) => {
      expect(num(t.stackOffset)).toBeCloseTo(i * num(g.width), 3);
    });
    for (let i = 1; i < 3; i++)
      expect(
        Math.abs(
          (lengths[i] ?? 0) -
            (lengths[i - 1] ?? 0) -
            2 * Math.PI * num(g.width),
        ),
      ).toBeLessThan(0.002);
    expect(num(g.minimumClearance)).toBeGreaterThanOrEqual(0);
    expect(num(g.minimumLegGap)).toBeGreaterThanOrEqual(-1e-4);
    for (const t of turns) {
      const line = pairs(t.centerline);
      expect(line).toHaveLength(25);
      // The centreline dips under the top piece and rises over the bottom one by millimetres only.
      for (const p of line) expect(Math.abs(p[2] ?? 0)).toBeLessThan(0.006);
    }
    // The end runs from the outer turn to the contact plane and back up over the closure.
    expect(num(g.travelUp)).toBeCloseTo(
      num(g.travelDown) + num(g.bridgePerEnd) + 3 * num(g.width),
      3,
    );
    expect(stages.map((s) => s.stage)).toEqual([
      'release-closure',
      'route-frap-1',
      'route-frap-2',
      'route-frap-3',
      'close-form-closure',
      'close-seat-tails',
    ]);
    const sumTo = (k: number) => lengths.slice(0, k).reduce((s, x) => s + x, 0);
    for (let k = 1; k <= 3; k++)
      expect(num(stages[k]?.occupied)).toBeCloseTo(
        num(g.baseWrap) + num(g.travelDown) + sumTo(k) + 0.04,
        3,
      );
    const seated = stages[5];
    expect(num(seated?.occupied)).toBeCloseTo(
      num(g.baseWrap) +
        num(g.bridgePerEnd) +
        num(g.travelDown) +
        sumTo(3) +
        num(g.travelUp) +
        2 * num(g.closurePath),
      3,
    );
    expect(num(seated?.need)).toBeCloseTo(
      num(seated?.occupied) + 2 * num(g.tailNeed),
      3,
    );
    expect(num(g.need)).toBe(Math.max(...stages.map((s) => num(s.need))));
    expect(stages.find((s) => s.stage === g.limitingStage)?.need).toBe(g.need);
    expect(num(g.tails)).toBeCloseTo((1.6 - num(seated?.occupied)) / 2, 3);
    // With Wren's 5.9 mm cord at 90 degrees the bend-limited route clears the wedge altogether.
    const real = step(lashed('long'), {
      wren: mode('assess', {
        bindingId: bindingOf(lashed('long'), 'long'),
        frapCount: 1,
      }),
    }).world;
    expect(record(assessOf(real).wedge).bearsOnWedge).toBe(false);
    expect(
      record(records(assessOf(real).transverseTurns)[0]?.contactTurning),
    ).toMatchObject({ wedge: 0 });
  });

  it('blocked gap: at a 30 degree crossing the gap between the pieces is narrower than the cord far beyond the bundles; the route goes round that wedge and part of the snugging bears on the bark there instead of on the leg bundles', () => {
    const at30 = lashed('triple', 30),
      at90 = lashed('triple', 90),
      assess = (w: V7World) =>
        assessOf(
          step(w, {
            wren: mode('assess', {
              bindingId: bindingOf(w, 'triple'),
              frapCount: 1,
            }),
          }).world,
        ),
      g30 = assess(at30),
      g90 = assess(at90),
      wedge30 = record(g30.wedge),
      wedge90 = record(g90.wedge),
      bundle = Math.max(
        ...records(g30.legs).map((l) => Math.abs(num(l.offset))),
      );
    // The blocked zone reaches past the bundles along the acute bisector, so no direct path exists.
    expect(num(wedge30.reachAlongAcuteBisector)).toBeGreaterThan(
      bundle + 2 * num(g30.width) + num(g30.routeRadius),
    );
    expect(num(wedge30.reachAlongAcuteBisector)).toBeGreaterThan(
      2 * num(wedge90.reachAlongAcuteBisector),
    );
    expect(wedge30.bearsOnWedge).toBe(true);
    const turning = record(records(g30.transverseTurns)[0]?.contactTurning);
    expect(num(turning.wedge)).toBeGreaterThan(0);
    expect(num(turning.legBundles) + num(turning.wedge)).toBeCloseTo(
      2 * Math.PI,
      5,
    );
    // The route never passes through the blocked gap.
    expect(num(g30.minimumClearance)).toBeGreaterThanOrEqual(0);
    expect(g30.fits).toBe(true);
    // Frapped, part of the snugging bears on the bark of the wedge instead of the bundles.
    const held = (w: V7World) => {
      const x = rounds(3, frap(bindingOf(w, 'triple'), 1), w),
        r = step(x, { wren: frap(bindingOf(w, 'triple'), 1) });
      return events(r.world, 'release-held')[0]?.data ?? {};
    };
    const d30 = held(at30),
      d90 = held(at90);
    expect(num(d30.wedgeForce)).toBeGreaterThan(0);
    // One transverse turn presses a bundle with at most its two run tensions, 2 x 5 N.
    for (const d of [d30, d90])
      for (const p of list(d.transversePush)) {
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThan(10);
      }
    expect(num(turning.legBundles)).toBeLessThan(2 * Math.PI);
  });

  it('attempt: frapCount + 3 paid rounds of 0.5 open the closure, route and snug a transverse turn of the lashing’s own cord and close over it; the drawn-in legs raise every turn’s tension', () => {
    const w0 = lashed('fixture'),
      bindingId = bindingOf(w0),
      { single, spare } = build(),
      c = cordId('fixture'),
      reed = units(w0, 'reed'),
      branch = units(w0, 'branch'),
      count = w0.stacks.length,
      sequence = [
        ['started', 'measured'],
        ['closure-released'],
        ['turn-routed', 'turn-snugged'],
        ['release-held'],
      ];
    let w = w0;
    for (const [i, expected] of sequence.entries()) {
      const r = step(w, { wren: frap(bindingId, 1) });
      expect(r.outcomes.wren?.success).toBe(true);
      expect(spent(w, r.world)).toBeCloseTo(0.5, 6);
      expect(frapEvents(r.world)).toEqual(expected);
      w = r.world;
      const j = job(w);
      expect(j).toMatchObject({ mode: 'attempt', initialWork: 4 });
      expect(j?.completedWork).toBe(i + 1);
      const cord = item(w, c);
      if (i === 0) {
        // Measured only: the closure is still tied and the items are held by the work.
        expect(lashPart(cord).state).toBe('bound');
        expect(cordPart(cord).role).toBe('bound');
        for (const s of [single, spare, c])
          expect(item(w, s)?.reservedFor).toBe(j?.id);
      } else if (i < 3) {
        expect(lashPart(cord).state).toBe('frapping');
        expect(cordPart(cord).role).toBe('cord');
        expect(frapPart(cord).state).toBe(i === 1 ? 'released' : 'routed');
        expect(
          record(
            events(w, i === 1 ? 'closure-released' : 'turn-snugged')[0]?.data
              .after,
          ).completedAppearance,
        ).toBe(false);
      }
      actor(w).vitals.energy = 40;
    }
    const j = job(w),
      e = events(w, 'release-held')[0],
      d = e?.data ?? {};
    expect(j).toMatchObject({
      status: 'completed',
      completedWork: 4,
      remainingWork: 0,
      paidEnergy: 2,
    });
    for (const s of [single, spare, c]) {
      expect(item(w, s)?.reservedFor).toBe(bindingId);
      expect(lashPart(item(w, s)).state).toBe('frapped');
    }
    expect(frapPart(item(w, c))).toMatchObject({
      state: 'frapped',
      bindingId,
      frapCount: 1,
      law: 'transverse-contact@1',
      revision: `${id}@1`,
    });
    expect(cordPart(item(w, c)).role).toBe('bound');
    // Conserved: the same three items, no material consumed or added.
    expect(w.stacks.length).toBe(count);
    expect(units(w, 'reed')).toBe(reed);
    expect(units(w, 'branch')).toBe(branch);
    expect(cordPart(item(w, c)).overall).toBe(1.2);
    // The transverse turn is snugged with the 5 N pull at its exit and falls round its contacts.
    const [start, exit] = pairs(d.transverseTensions)[0] ?? [];
    expect(exit).toBe(5);
    expect(num(start)).toBeLessThan(5);
    expect(num(start)).toBeGreaterThan(0);
    // The push draws both legs in; every turn's tension rises by the same computed increment.
    for (const x of list(d.legDeflection)) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(0.02);
    }
    const increments = list(d.turnIncrements),
      before = pairs(d.turnTensionsBefore),
      after = pairs(d.turnTensions);
    for (const x of increments) expect(x).toBeGreaterThan(1);
    after.forEach((sides, k) => {
      sides.forEach((t, s) => {
        expect(t).toBeCloseTo((before[k]?.[s] ?? 0) + (increments[k] ?? 0), 0);
      });
    });
    // The closure keeps the higher end tension; the cord carries its peak.
    expect(Math.max(...list(d.endTensions))).toBeLessThan(
      num(d.closureSlipLoad),
    );
    expect(num(d.peakTension)).toBeLessThan(num(d.breakingForce));
    expect(list(d.tails)[0]).toBeGreaterThanOrEqual(num(d.tailNeeded));
    // Drawing the legs in shortens the route; the tails take the difference.
    expect(list(d.drawnInRoute)[0]).toBeLessThan(list(d.plannedRoute)[0] ?? 0);
    expect(asText(d.unvalidated)).toMatch(/wedging the pieces apart/);
    const after1 = record(d.after);
    expect(after1).toMatchObject({
      component: 'crossing-frapping',
      completedAppearance: true,
      state: 'frapped',
      bindingId,
      closure: 'tied-over-transverse-turns',
    });
    expect(record(after1.transverse).shown).toBe(1);
    expect(record(after1.baseTurns).count).toBe(2);
    expect(
      actor(w).memory.knowledge?.[
        'frapping-fit:reed-4.3mm:branch-31.6-31.6mm:90deg:2-turns:1-transverse:release-held'
      ]?.verified,
    ).toBe(true);
    expect(asText(e?.description)).toMatch(/untested; it is no rated lashing/);
    clean(w);
    // The lashing package no longer treats the frapped relation as its own lashing.
    for (const action of [
      {
        interface: LASH,
        args: {
          mode: 'trial',
          bindingId,
          trialForce: 1,
          trialDuration: 1,
          trialDirection: 'slide',
        },
      },
      { interface: LASH, args: { mode: 'untie', bindingId } },
      { interface: LASH, args: { mode: 'inspect', bindingId } },
    ])
      unchanged(w, action, /exact id of a lashing of your own/);
    unchanged(
      w,
      {
        interface: LASH,
        args: {
          mode: 'attempt',
          pieceIds: [build().lot, build().lot],
          cordId: c,
          crossingAngle: 90,
          wrapCount: 2,
        },
      },
      /already closes a binding or lashing/,
    );
    unchanged(w, frap(bindingId, 1), /dressed hand-lash-crossing lashing/);
  });

  it('trial: the raised turn tensions decide holding; the frapped lashing slides at the bark friction of its higher tensions and repeated identical tests add no information', () => {
    // Unfrapped, the same lashing slips well below 10 N.
    const plain = lashed('fixture'),
      bindingId = bindingOf(plain),
      slid = step(plain, {
        wren: {
          interface: LASH,
          args: {
            mode: 'trial',
            bindingId,
            trialForce: 10,
            trialDuration: 10,
            trialDirection: 'slide',
          },
        },
      }).world,
      base = slid.events.find((e) => e.type === 'crossing-lashing-trial')?.data;
    expect(base?.outcome).toBe('crossing-slipped');
    const w0 = frapped('fixture'),
      r = step(w0, { wren: test(bindingId, 'slide', 10, 10) }),
      w = r.world,
      t = events(w, 'trial')[0]?.data ?? {};
    expect(r.outcomes.wren?.success).toBe(true);
    expect(spent(w0, w)).toBeCloseTo(0.5, 6);
    expect(t).toMatchObject({
      direction: 'slide',
      outcome: 'held',
      achievedForce: 10,
      heldSeconds: 10,
      frapCount: 1,
      transverseExitTension: 5,
    });
    // The slip load follows from the existing slide law on the raised tensions.
    expect(num(t.crossingSlipLoad)).toBeGreaterThan(10);
    expect(num(t.crossingSlipLoad)).toBeGreaterThan(
      2 * num(base?.crossingSlipLoad),
    );
    expect(list(t.turnTopFriction).reduce((s, x) => s + x, 0)).toBeCloseTo(
      num(t.crossingSlipLoad),
      0,
    );
    expect(trialOfCord(w)).toMatchObject({
      direction: 'slide',
      outcome: 'held',
      requestedForce: 10,
      requestedDuration: 10,
    });
    const key = `frapped-hand-load-slide:reed-4.3mm:branch-31.6-31.6mm:90deg:2-turns:1-transverse:intact-10N-10s-held`;
    expect(actor(w).memory.knowledge?.[key]?.verified).toBe(true);
    const again = step(w, { wren: test(bindingId, 'slide', 10, 10) }).world;
    expect(
      again.events.find((e) => e.type === 'trial-result')?.data.newInformation,
    ).toBe(false);
    // Separate is clamped by the frapped sides; the lashing stays frapped.
    const s = step(w0, { wren: test(bindingId, 'separate', 10, 60) }).world,
      sd = events(s, 'trial')[0]?.data ?? {};
    expect(sd.outcome).toBe('held');
    expect(num(sd.clampingForce)).toBeGreaterThan(10);
    expect(frapPart(item(s, cordId('fixture'))).state).toBe('frapped');
    clean(s);
    // Bounds and the frapped state are checked before costs.
    unchanged(w0, test(bindingId, 'twist'), /trialDirection/);
    unchanged(w0, test(bindingId, 'slide', 0), /above zero/);
    unchanged(w0, test(bindingId, 'slide', 11), /trialForce/);
    unchanged(w0, test(bindingId, 'slide', 5, 61), /trialDuration/);
    unchanged(plain, test(bindingId), /frapped lashing of your own/);
  });

  it('zero slack: a cord exactly as long as the longest stage fits with nothing to spare there, and one millimetre less is a paid measured shortfall that leaves the lashing closed', () => {
    const c = cordId('boundary'),
      probe = (overall: number) => {
        const w = ready();
        lengthen(w, c, overall);
        const r = step(w, {
          wren: mode('assess', {
            pieceIds: [build().single, build().spare],
            cordId: c,
            crossingAngle: 90,
            wrapCount: 2,
            frapCount: 1,
          }),
        });
        return { w, g: assessOf(r.world) };
      };
    // The need depends on the width, which the length sets at conserved volume: iterate to the boundary.
    let L = 1;
    for (let i = 0; i < 6; i++)
      L = Math.ceil(num(probe(L).g.need) * 1e4 - 1e-6) / 1e4;
    const exact = probe(L).g,
      under = probe(L - 0.001).g;
    expect(exact.fits).toBe(true);
    expect(L - num(exact.need)).toBeLessThan(1e-4);
    expect(L - num(exact.need)).toBeGreaterThanOrEqual(0);
    expect(under.fits).toBe(false);
    expect(num(under.shortfall)).toBeGreaterThan(0);
    expect(num(under.shortfall)).toBeLessThanOrEqual(0.0011);
    // On the lashing tied with the shorter cord, the attempt pays one measuring round and stops
    // before the closure is opened.
    const w = ready();
    lengthen(w, c, L - 0.001);
    const tied = lashed('boundary', 90, w),
      bindingId = bindingOf(tied, 'boundary'),
      r = step(tied, { wren: frap(bindingId, 1) }),
      e = events(r.world, 'shortfall')[0];
    expect(spent(tied, r.world)).toBeCloseTo(0.5, 6);
    expect(frapEvents(r.world)).toEqual(['started', 'shortfall']);
    expect(e?.data).toMatchObject({
      outcome: 'too-short',
      measuredShortfall: true,
      operation: 'measure-plan',
    });
    expect(job(r.world)).toMatchObject({ status: 'stopped', completedWork: 1 });
    expect(lashPart(item(r.world, c))).toMatchObject({
      state: 'bound',
      bindingId,
      seated: true,
    });
    for (const s of [build().single, build().spare, c])
      expect(item(r.world, s)?.reservedFor).toBe(bindingId);
    expect(record(record(e?.data.after).overlay).kind).toBe(
      'measured-route-not-tied',
    );
    // With the exact length the whole work completes.
    const ok = ready();
    lengthen(ok, c, L);
    const tiedOk = lashed('boundary', 90, ok),
      done = rounds(4, frap(bindingOf(tiedOk, 'boundary'), 1), tiedOk);
    expect(frapPart(item(done, c)).state).toBe('frapped');
  });

  it('slack in the base turns is taken up first: a snug lashing gains tension at once, a lashing loosened by creep is drawn in further before its turns carry tension again', () => {
    const snug = heldData('fixture').world,
      ds = events(snug, 'release-held')[0]?.data ?? {};
    // A fixture lashing loosened by creep as fiber-cord@1 lengthens it: each turn holds 2 mm of
    // slack, its tension lowered by stiffness x slack / length, and the cord lengthened at
    // conserved volume.
    const w0 = lashed('fixture'),
      c = cordId('fixture'),
      lash = lashPart(item(w0, c)),
      model = record(lash.model),
      cord = cordPart(item(w0, c)),
      ply = num(cord.plyDiameter),
      slack = 0.002;
    for (const t of records(model.turns)) {
      t.slack = slack;
      t.loss = (stiffness(ply) * slack) / num(t.length);
    }
    const length = num(cord.length),
      stretched = length + 2 * slack;
    cord.length = stretched;
    cord.twisted = stretched;
    cord.overall = Math.round((num(cord.overall) + 2 * slack) * 1e4) / 1e4;
    cord.plyDiameter = ply * Math.sqrt(length / stretched);
    const w = rounds(4, frap(bindingOf(w0), 1), w0),
      d = events(w, 'release-held')[0]?.data ?? {};
    // Before frapping the loosened turns carried nothing at their legs.
    expect(
      pairs(d.turnTensionsBefore)
        .flat()
        .every((x) => x === 0),
    ).toBe(true);
    expect(
      pairs(d.turnTensions)
        .flat()
        .every((x) => x > 0),
    ).toBe(true);
    // The slack is taken up first, so the legs are drawn in further and the increments are larger,
    // but the frapped turns end slacker than the snug ones.
    expect(Math.min(...list(d.legDeflection))).toBeGreaterThan(
      Math.max(...list(ds.legDeflection)),
    );
    expect(Math.min(...list(d.turnIncrements))).toBeGreaterThan(
      Math.max(...list(ds.turnIncrements)),
    );
    expect(Math.max(...pairs(d.turnTensions).flat())).toBeLessThan(
      Math.max(...pairs(ds.turnTensions).flat()),
    );
    expect(record(record(d.after).baseTurns).slack).toEqual([0.002, 0.002]);
  });

  it('slipping closure: a stiffer cord whose closure cannot keep the raised end tension slips at the release check; every turn falls loose and all three items are conserved', () => {
    // Fixture: a stiffer reed whose closure conforms less round the other end, so it slips at a
    // lower load (cord-bend@1's retention rule); everything else is the real lashing and work.
    const w0 = ready(),
      reedLaw = w0.resources.find((r) => r.id === 'reed');
    if (reedLaw?.properties) reedLaw.properties.flexibility = 6;
    const tied = lashed('triple', 90, w0),
      bindingId = bindingOf(tied, 'triple'),
      c = cordId('triple'),
      reed = units(tied, 'reed'),
      branch = units(tied, 'branch'),
      count = tied.stacks.length;
    const before = rounds(5, frap(bindingId, 3), tied),
      r = step(before, { wren: frap(bindingId, 3) }),
      w = r.world,
      d = events(w, 'release-failed')[0]?.data ?? {};
    expect(frapEvents(w)).toEqual(['release-failed', 'closure-slipped']);
    expect(spent(before, w)).toBeCloseTo(0.5, 6);
    expect(d.outcome).toBe('closure-slipped');
    expect(Math.max(...list(d.endTensions))).toBeGreaterThanOrEqual(
      num(d.closureSlipLoad),
    );
    expect(job(w)).toMatchObject({
      status: 'completed',
      completedWork: 6,
      paidEnergy: 3,
    });
    for (const s of [build().single, build().spare, c])
      expect(item(w, s)?.reservedFor).toBeUndefined();
    for (const s of [build().single, build().spare])
      expect(item(w, s)?.processing).toBeUndefined();
    expect(lashPart(item(w, c))).toMatchObject({
      state: 'separate',
      last: 'released-closure-slipped',
    });
    expect(frapPart(item(w, c)).state).toBe('separate');
    expect(cordPart(item(w, c)).role).toBe('cord');
    expect(w.stacks.length).toBe(count);
    expect(units(w, 'reed')).toBe(reed);
    expect(units(w, 'branch')).toBe(branch);
    expect(
      Object.keys(actor(w).memory.knowledge ?? {}).some((k) =>
        k.endsWith(':3-transverse:release-failed-closure-slipped'),
      ),
    ).toBe(true);
    clean(w);
  });

  it('broken cord: a worn cord parts at the dressing tension into conserved fragments, a frapped cord too weak for its own tension parts in place, and a cord below sound condition is refused before costs', () => {
    const c = cordId('triple'),
      tied = lashed('triple');
    cordPart(item(tied, c)).condition = 0.6;
    const reed = units(tied, 'reed'),
      overall = num(cordPart(item(tied, c)).overall),
      w = rounds(6, frap(bindingOf(tied, 'triple'), 3), tied),
      d = events(w, 'release-failed')[0]?.data ?? {},
      fragments = (d.fragments as string[]).map((f) => item(w, f));
    expect(frapEvents(w)).toEqual(['release-failed', 'broken']);
    expect(d.outcome).toBe('cord-broke');
    expect(num(d.peakTension)).toBeGreaterThanOrEqual(num(d.breakingForce));
    expect(item(w, c)).toBeUndefined();
    expect(fragments).toHaveLength(2);
    expect(units(w, 'reed')).toBe(reed);
    expect(
      fragments.reduce((s, f) => s + num(cordPart(f).overall), 0),
    ).toBeCloseTo(overall, 3);
    for (const f of fragments) {
      expect(cordPart(f).role).toBe('fragment');
      expect(f?.owner).toBe('wren');
      expect(frapPart(f).state).toBe('separate');
      expect(lashPart(f).state).toBe('separate');
    }
    for (const s of [build().single, build().spare])
      expect(item(w, s)?.reservedFor).toBeUndefined();
    // A frapped cord worn below its own peak tension parts between rounds.
    const f0 = frapped('fixture'),
      fc = cordId('fixture');
    cordPart(item(f0, fc)).condition = 0.3;
    const x = step(f0).world;
    expect(frapEvents(x)).toEqual(['broken']);
    expect(item(x, fc)).toBeUndefined();
    expect(units(x, 'reed')).toBe(units(f0, 'reed'));
    for (const s of [build().single, build().spare])
      expect(item(x, s)?.reservedFor).toBeUndefined();
    // Below sound condition no attempt starts.
    const weak = lashed('fixture');
    cordPart(item(weak, fc)).condition = 0.45;
    unchanged(weak, frap(bindingOf(weak), 1), /strands .* are broken/);
  });

  it('untie: frapCount + wrapCount + 1 paid rounds of 0.5 withdraw the closure, unwind each transverse and base turn and free the same three items; open turns fall loose when not worked', () => {
    const w0 = frapped('fixture'),
      bindingId = bindingOf(w0),
      c = cordId('fixture'),
      { single, spare } = build(),
      reed = units(w0, 'reed'),
      count = w0.stacks.length,
      sequence = [
        ['started', 'closure-withdrawn'],
        ['frap-unwrapped'],
        ['turn-unwrapped'],
        ['untied'],
      ];
    let w = w0;
    for (const expected of sequence) {
      const r = step(w, { wren: mode('untie', { bindingId }) });
      expect(r.outcomes.wren?.success).toBe(true);
      expect(spent(w, r.world)).toBeCloseTo(0.5, 6);
      expect(frapEvents(r.world)).toEqual(expected);
      w = r.world;
      actor(w).vitals.energy = 40;
    }
    expect(job(w)).toMatchObject({
      mode: 'untie',
      status: 'completed',
      completedWork: 4,
    });
    for (const s of [single, spare]) {
      expect(item(w, s)?.reservedFor).toBeUndefined();
      expect(item(w, s)?.processing).toBeUndefined();
    }
    expect(item(w, c)?.reservedFor).toBeUndefined();
    expect(lashPart(item(w, c))).toMatchObject({
      state: 'separate',
      last: 'untied',
    });
    expect(frapPart(item(w, c))).toMatchObject({
      state: 'separate',
      last: 'untied',
    });
    expect(cordPart(item(w, c))).toMatchObject({ role: 'cord', overall: 1.2 });
    expect(w.stacks.length).toBe(count);
    expect(units(w, 'reed')).toBe(reed);
    clean(w);
    // Open turns cannot wait: an unworked round after the withdrawal lets everything fall loose.
    const x = step(w0, { wren: mode('untie', { bindingId }) }).world,
      y = step(x).world;
    expect(frapEvents(y)).toEqual(['stopped', 'relaxed']);
    expect(lashPart(item(y, c)).state).toBe('separate');
    for (const s of [single, spare, c])
      expect(item(y, s)?.reservedFor).toBeUndefined();
    // A badly worn closure resists for a paid round and stays as it is.
    const z = frapped('fixture');
    cordPart(item(z, c)).condition = 0.49;
    // Too weak to carry its own tension it would part, so the check runs in the same round.
    const r = step(z, { wren: mode('untie', { bindingId }) });
    expect(r.outcomes.wren?.success).toBe(true);
    expect(spent(z, r.world)).toBeCloseTo(0.5, 6);
    expect(frapEvents(r.world).slice(0, 2)).toEqual(['started', 'resisted']);
    expect(job(r.world)).toMatchObject({ mode: 'untie', status: 'stopped' });
  });

  it('pauses a closed lashing uncharged, lets turns open in the hands fall loose when not worked, resumes only by workId and cancel keeps a still-closed lashing', () => {
    const w0 = lashed('fixture'),
      bindingId = bindingOf(w0),
      c = cordId('fixture'),
      { single, spare } = build();
    // After the measuring round the closure is still tied: an unworked round pauses it.
    const x = rounds(1, frap(bindingId, 1), w0),
      workId = job(x)?.id ?? '',
      p = step(x).world;
    expect(frapEvents(p)).toEqual(['paused']);
    expect(job(p)?.status).toBe('paused');
    expect(lashPart(item(p, c)).state).toBe('bound');
    for (const s of [single, spare, c])
      expect(item(p, s)?.reservedFor).toBe(workId);
    // Low energy pauses again without charge; the bound action does not resume by itself.
    const low = v7Clone(p);
    actor(low).vitals.energy = 0.3;
    const l = step(low, { wren: frap(bindingId, 1) });
    expect(l.outcomes.wren?.success).toBe(false);
    unchanged(p, frap(bindingId, 1), /Unfinished frapping work exists/);
    const lowResume = step(low, { wren: mode('attempt', { workId }) });
    expect(frapEvents(lowResume.world)).toEqual(['paused']);
    expect(actor(lowResume.world).vitals.energy).toBe(
      actor(step(low).world).vitals.energy,
    );
    // Resumed by workId, the next round opens the closure.
    const q = step(p, { wren: mode('attempt', { workId }) });
    expect(frapEvents(q.world)).toEqual(['resumed', 'closure-released']);
    expect(spent(p, q.world)).toBeCloseTo(0.5, 6);
    // Now open in the hands, an unworked round lets every turn fall loose: the lashing is gone.
    const s = step(q.world).world;
    expect(frapEvents(s)).toEqual(['stopped', 'relaxed']);
    expect(job(s)?.status).toBe('stopped');
    expect(lashPart(item(s, c))).toMatchObject({
      state: 'separate',
      last: 'released-turns-fell-loose',
    });
    for (const t of [single, spare])
      expect(item(s, t)?.processing).toBeUndefined();
    expect(units(s, 'reed')).toBe(units(w0, 'reed'));
    // Carrying the crossing away while its turns are open also lets them fall loose.
    const moved = v7Clone(q.world);
    actor(moved).position = { x: SITE.x + 0.4, y: SITE.y };
    actor(moved).vitals.energy = 40;
    const mv = step(moved, { wren: mode('attempt', { workId }) }).world;
    expect(frapEvents(mv)).toEqual(['stopped', 'relaxed']);
    // Cancel is free: a still-closed lashing stays, open turns fall loose.
    const k1 = step(x, { wren: mode('cancel', { workId }) });
    expect(spent(x, k1.world)).toBeCloseTo(0, 6);
    expect(events(k1.world, 'cancelled')[0]?.data.retained).toBe(true);
    expect(lashPart(item(k1.world, c)).state).toBe('bound');
    for (const t of [single, spare, c])
      expect(item(k1.world, t)?.reservedFor).toBe(bindingId);
    const open2 = rounds(2, frap(bindingId, 1), w0),
      k2 = step(open2, { wren: mode('cancel', {}) });
    expect(frapEvents(k2.world)).toEqual(['cancelled', 'relaxed']);
    expect(events(k2.world, 'cancelled')[0]?.data.retained).toBe(false);
    expect(lashPart(item(k2.world, c)).state).toBe('separate');
    unchanged(k2.world, mode('cancel', {}), /No unfinished frapping work/);
    unchanged(
      w0,
      mode('attempt', { workId: 'x' }),
      /No unfinished frapping work of yours has this workId/,
    );
  });

  it('inspect records visible turns for 0.2 energy and leaves tensions and holding force unknown', () => {
    const w0 = frapped('fixture'),
      bindingId = bindingOf(w0),
      w = step(w0, { wren: mode('inspect', { bindingId }) }).world,
      e = events(w, 'inspected')[0];
    expect(spent(w0, w)).toBeCloseTo(0.2, 6);
    expect(e?.data).toMatchObject({
      bindingId,
      holdingForce: null,
      transverseTurnsRound: 1,
      displacement: 0,
      visibleRetention:
        'snug round the crossing, closure tied over the transverse turns',
    });
    expect(asText(e?.data.unknown)).toMatch(/turn tensions/);
    expect(JSON.stringify(e?.data)).not.toMatch(
      /turnTensions|endTensions|turnIncrements|transversePush/,
    );
    expect(w.stacks).toEqual(step(w0).world.stacks);
    expect(
      actor(w).memory.knowledge?.[`${bindingId}:crossing-frapping-geometry`]
        ?.verified,
    ).toBe(false);
    unchanged(
      w0,
      mode('inspect', { bindingId, workId: 'x' }),
      /exactly one of/,
    );
    // Work in progress is inspected by its workId.
    const x = rounds(
        2,
        frap(bindingOf(lashed('fixture')), 1),
        lashed('fixture'),
      ),
      y = step(x, { wren: mode('inspect', { workId: job(x)?.id }) }).world;
    expect(events(y, 'inspected')[0]?.data.visibleRetention).toBe(
      'open, held by hand',
    );
  });

  it('a frapped cord wears 0.0005 per round exactly once and is not carried as a hanging load; the work and frapped lashing stay personal', () => {
    const w0 = frapped('fixture'),
      bindingId = bindingOf(w0),
      c = cordId('fixture'),
      free = cordId('long'),
      before = [c, free].map((s) => num(cordPart(item(w0, s)).condition));
    let w = w0;
    for (let i = 0; i < 4; i++) {
      actor(w).position = { x: SITE.x + (i % 2 ? 0 : 0.3), y: SITE.y };
      w = step(w).world;
    }
    [c, free].forEach((s, i) => {
      expect(num(cordPart(item(w, s)).condition)).toBeCloseTo(
        (before[i] ?? 0) - 4 * 0.0005,
        8,
      );
    });
    expect(frapPart(item(w, c)).state).toBe('frapped');
    expect(cordPart(item(w, c)).overall).toBe(1.2);
    expect(frapEvents(w)).toEqual([]);
    // Another person cannot resume, inspect or cancel Wren's work, nor test, untie, inspect,
    // assess or frap her lashing.
    const x = rounds(
        1,
        frap(bindingOf(lashed('fixture')), 1),
        lashed('fixture'),
      ),
      workId = job(x)?.id ?? '';
    actor(x, 'kai').mastered.push(id);
    actor(x, 'kai').position = { x: SITE.x - 3, y: SITE.y };
    unchanged(
      x,
      mode('attempt', { workId }),
      /No unfinished frapping work of yours/,
      'kai',
    );
    unchanged(
      x,
      mode('inspect', { workId }),
      /No frapping work of yours/,
      'kai',
    );
    unchanged(
      x,
      mode('cancel', { workId }),
      /No unfinished frapping work/,
      'kai',
    );
    const y = v7Clone(w0);
    actor(y, 'kai').mastered.push(id);
    actor(y, 'kai').position = { x: SITE.x - 3, y: SITE.y };
    for (const action of [
      test(bindingId),
      mode('untie', { bindingId }),
      mode('inspect', { bindingId }),
    ])
      unchanged(y, action, /frapped lashing of your own/, 'kai');
    const z = lashed('fixture');
    actor(z, 'kai').mastered.push(id);
    actor(z, 'kai').position = { x: SITE.x - 3, y: SITE.y };
    for (const action of [
      frap(bindingOf(z), 1),
      mode('assess', { bindingId: bindingOf(z), frapCount: 1 }),
    ])
      unchanged(
        z,
        action,
        /dressed hand-lash-crossing lashing of your own/,
        'kai',
      );
  });

  it('refuses impossible, unsupported or unavailable inputs before costs', () => {
    const w0 = lashed('fixture'),
      bindingId = bindingOf(w0);
    unchanged(w0, mode('attempt', { bindingId }), /frapCount/);
    for (const frapCount of [0, 4])
      unchanged(w0, frap(bindingId, frapCount), /frapCount/);
    unchanged(
      w0,
      frap(bindingId, 1.5),
      /frapCount|whole number of transverse turns/,
    );
    unchanged(w0, frap('lashing-0-none', 1), /dressed hand-lash-crossing/);
    unchanged(
      w0,
      mode('attempt', { bindingId, frapCount: 1, trialForce: 1 }),
      /Irrelevant argument/,
    );
    unchanged(w0, mode('untie', { bindingId }), /frapped lashing of your own/);
    unchanged(w0, test(bindingId), /frapped lashing of your own/);
    unchanged(w0, mode('inspect', {}), /exactly one of/);
    unchanged(w0, mode('frap', {}), /mode/);
    unchanged(
      w0,
      mode('assess', {
        bindingId,
        frapCount: 1,
        cordId: cordId('long'),
      }),
      /either an existing lashing/,
    );
    unchanged(
      ready(),
      mode('assess', {
        pieceIds: [build().single, build().spare],
        cordId: cordId('long'),
        crossingAngle: 90,
        wrapCount: 1,
        frapCount: 1,
      }),
      /wrapCount/,
    );
    unchanged(
      ready(),
      mode('assess', {
        pieceIds: ['branch', 'branch'],
        cordId: cordId('long'),
        crossingAngle: 90,
        wrapCount: 2,
        frapCount: 1,
      }),
      /exact ids of your own pieces/,
    );
    // Not enough energy, or someone within the work circle.
    const tired = v7Clone(w0);
    actor(tired).vitals.energy = 0.4;
    unchanged(tired, frap(bindingId, 1), /Not enough energy/);
    unchanged(
      tired,
      mode('assess', { bindingId, frapCount: 1 }),
      /Not enough energy/,
    );
    const crowded = v7Clone(w0);
    actor(crowded, 'kai').position = { x: SITE.x + 0.5, y: SITE.y };
    unchanged(crowded, frap(bindingId, 1), /No room to work/);
    // A lashing held by unfinished work, or a loose one, is not frapped.
    const untying = step(w0, {
      wren: { interface: LASH, args: { mode: 'untie', bindingId } },
    }).world;
    actor(untying).vitals.energy = 40;
    unchanged(
      untying,
      frap(bindingId, 1),
      /dressed hand-lash-crossing|held by unfinished work/,
    );
    let loose = rounds(4, lashAction('fixture'), ready());
    loose = step(loose, {
      wren: { interface: LASH, args: { mode: 'cancel' } },
    }).world;
    const looseId = bindingOf(loose);
    expect(lashPart(item(loose, cordId('fixture'))).state).toBe('tucked');
    unchanged(
      loose,
      frap(looseId, 1),
      /loose; dress it with hand-lash-crossing/,
    );
  });

  it('stops at death, leaving the pieces and cord where the person died once in their actual configuration', () => {
    const pkg = continuousRegistry(ready()).packages.find((p) => p.id === id),
      { single, spare } = build(),
      c = cordId('fixture');
    for (const [n, state, retained, relaxed] of [
      [1, 'bound', true, 0],
      [3, 'separate', false, 1],
    ] as const) {
      const w0 = lashed('fixture'),
        w = rounds(n, frap(bindingOf(w0), 1), w0),
        dead = v7Clone(w),
        bindingId = bindingOf(w0);
      pkg?.onDeath?.(dead, actor(dead));
      expect(job(dead)?.status).toBe('stopped');
      expect(events(dead, 'stopped')).toHaveLength(1);
      expect(events(dead, 'relaxed')).toHaveLength(relaxed);
      for (const s of [single, spare, c]) {
        expect(item(dead, s)).toMatchObject({
          owner: null,
          position: actor(dead).position,
        });
        expect(item(dead, s)?.reservedFor).toBe(
          retained ? bindingId : undefined,
        );
      }
      expect(lashPart(item(dead, c)).state ?? 'separate').toBe(state);
      expect(units(dead, 'branch')).toBe(units(w, 'branch'));
      expect(units(dead, 'reed')).toBe(units(w, 'reed'));
    }
  });
});

function trialOfCord(w: V7World): V7Data {
  return records(frapPart(item(w, cordId('fixture'))).trials).at(-1) ?? {};
}
