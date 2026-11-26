import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Load,
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
vi.setConfig({ testTimeout: 120_000 });

const id = 'hand-join-fiber-cords';
const CORD = 'hand-twist-fiber-cord';
const KNOT = 'hand-tie-cord-knot';
const WAIT: V7Action = { interface: 'wait', args: {} };
const REEDS = { source: 'forest-reed-0', at: { x: 22.6, y: 5.9 } };
/** Engine material values that no event may reveal. */
const HIDDEN = /flexib|hardness/i;
/** Agent-visible words the brief also excludes, beyond CULTURE_EXCLUDED_WORDS. */
const ALSO_EXCLUDED = /story|myth|legend|tradition/i;
/** Cords made with the unchanged hand-twist-fiber-cord@1: [units of reed, twisted length in m].
 * a and b match Wren's two actual 0.2 unit, 0.30 m, 8.1 mm reed cords (0.34 m centrelines). */
const SIZES = {
  a: [0.2, 0.3],
  b: [0.2, 0.3],
  short1: [0.2, 0.1],
  short2: [0.2, 0.1],
  s15: [0.2, 0.15],
  s20: [0.2, 0.2],
} as const;
type Size = keyof typeof SIZES;

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
const joinEvents = (w: V7World) =>
  w.events.filter((e) => e.type.startsWith('cord-join')).map((e) => e.type);
const mode = (m: string, args: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...args },
});
const attempt = (first: string, second: string) =>
  mode('attempt', { cordIds: [first, second], method: 'sheet-bend' });
const pull = (joinId: string, trialForce = 10, trialDuration = 60) =>
  mode('trial', { joinId, trialForce, trialDuration });
const cordMode = (m: string, args: Record<string, unknown> = {}): V7Action => ({
  interface: CORD,
  args: { mode: m, ...args },
});
const tenths = (n: number) => Math.round(n * 10);
const reed = (w: V7World) =>
  w.stacks
    .filter((s) => s.resource === 'reed')
    .reduce((n, s) => n + tenths(s.quantity), 0);
interface Job {
  id: string;
  ability: string;
  mode: string;
  status: string;
  initialWork: number;
  completedWork: number;
  paidEnergy: number;
  join: string | null;
  bight: string | null;
  wrap: string | null;
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
const joinPart = (s?: V7Stack): V7Data =>
  (s?.processing?.cordJoin ?? {}) as V7Data;
const num = (v: unknown) => (typeof v === 'number' ? v : NaN);
const record = (v: unknown): V7Data =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as V7Data) : {};
const energy = (w: V7World, name = 'wren') => actor(w, name).vitals.energy;
/** Energy a step spent beyond what the same round spends while waiting. */
const spent = (from: V7World, to: V7World, name = 'wren') =>
  energy(step(from).world, name) - energy(to, name);
/** The declared fiber-cord@1 reed law, restated: ply diameter from conserved volume. */
const plyDiameter = (units: number, length: number) =>
  2 *
  Math.sqrt(
    (units * 0.25 * (1 - 0.9)) /
      500 /
      2 /
      ((length * 2) / Math.sqrt(3) + 0.04) /
      Math.PI,
  );
/** fiber-cord@1 breaking force restated for a ply diameter and condition. */
const straightBreak = (diameter: number, condition: number) =>
  2 *
  ((Math.PI * diameter * diameter) / 4) *
  8e6 *
  (1 - 0.55 * 0.9) *
  0.75 *
  condition;
/** cord-bend@1 restated for two equal reed cords (cord-knot@1 bend limit 2.5 widths at index 0.7):
 * crown and wrap radius 2.5 w, mean width a = w. */
const W = 2 * plyDiameter(0.2, 0.3);
const R = 2.5 * W;
const BIGHT_PATH = Math.PI * R + 4 * W;
const WRAP_PATH =
  W + 2 * Math.max(0, 2 * R - 2 * (R - W)) + 2 * Math.PI * R + W;
const TAIL = 0.02 + W;

let cache: { unstudied: V7World; cords: Record<Size, string> } | undefined;
/** Wren gathers real reed, makes each fixture cord with hand-twist-fiber-cord@1, learns the knot and stays at the reed bed. */
function build() {
  if (cache) return cache;
  const genesis = initialLongWorld('long-ex16', 'long-culture-v2');
  let w = v7Install(genesis, continuousRegistry(genesis), `${CORD}@1`);
  w = v7Install(w, continuousRegistry(w), `${KNOT}@1`);
  w = v7Clone(v7Install(w, continuousRegistry(w), `${id}@1`));
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
  actor(w).position = { ...REEDS.at };
  for (const ability of [CORD, KNOT]) {
    w = step(w, { wren: { interface: 'learn', args: { ability } } }).world;
    for (let i = 0; i < 2; i++) w = step(w).world;
    expect(actor(w).mastered).toContain(ability);
  }
  actor(w).vitals.energy = 40;
  w = step(w, {
    wren: cordMode('sample', { materials: [{ stackId: raw, quantity: 0.1 }] }),
  }).world;
  const cords: Partial<Record<Size, string>> = {};
  for (const [name, [quantity, requestedLength]] of Object.entries(SIZES)) {
    actor(w).vitals.energy = 40;
    const known = new Set(w.stacks.map((s) => s.id));
    for (let i = 0; i < 4; i++)
      w = step(w, {
        wren: cordMode('make', {
          materials: [{ stackId: raw, quantity }],
          requestedLength,
        }),
      }).world;
    const made = w.stacks.find(
      (s) => !known.has(s.id) && cordPart(s).role === 'cord',
    );
    if (!made) throw new Error(`Missing fixture cord ${name}.`);
    cords[name as Size] = made.id;
  }
  actor(w).vitals.energy = 40;
  cache = { unstudied: w, cords: cords as Record<Size, string> };
  return cache;
}
let studied: V7World | undefined;
/** The fixture world after Wren studied the join for three paid rounds. */
function ready() {
  if (!studied) {
    let w = step(build().unstudied, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    for (let i = 0; i < 2; i++) w = step(w).world;
    expect(actor(w).mastered).toContain(id);
    actor(w).vitals.energy = 40;
    studied = w;
  }
  return v7Clone(studied);
}
const cordId = (name: Size) => build().cords[name];
/** Runs attempt rounds on two fixture cords. */
function joinRounds(
  rounds: number,
  first: Size = 'a',
  second: Size = 'b',
  from = ready(),
) {
  let w = from;
  for (let i = 0; i < rounds; i++)
    w = step(w, { wren: attempt(cordId(first), cordId(second)) }).world;
  actor(w).vitals.energy = 40;
  return w;
}
let tiedCache: V7World | undefined;
/** Wren's two actual-size cords joined by four paid rounds. */
function tied() {
  tiedCache ??= joinRounds(4);
  return v7Clone(tiedCache);
}
const joinIdOf = (w: V7World) => String(job(w)?.join);
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
const visibleText = (w: V7World) =>
  JSON.stringify(
    w.events
      .filter((e) => e.interface === id || e.type.startsWith('cord-join'))
      .map((e) => [e.description, e.data]),
  );

describe('hand-joined two-cord sheet bend in ex16', () => {
  it('is scoped to ex16 after both cord packages, needs three study rounds at 0.2 energy and fits the frozen size limit', () => {
    const other = initialLongWorld('long-ex15', 'long-culture');
    expect(() =>
      v7Install(other, continuousRegistry(other), `${id}@1`),
    ).toThrow();
    const bare = initialLongWorld('long-ex16', 'long-culture-v2');
    expect(() => v7Install(bare, continuousRegistry(bare), `${id}@1`)).toThrow(
      /dependency/,
    );
    const cordOnly = v7Install(bare, continuousRegistry(bare), `${CORD}@1`);
    expect(() =>
      v7Install(cordOnly, continuousRegistry(cordOnly), `${id}@1`),
    ).toThrow(/dependency/);
    const w = v7Clone(build().unstudied);
    const ability = w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(3);
    expect(ability?.learningEnergy).toBe(0.2);
    expect(ability?.prerequisites).toEqual([]);
    expect(ability?.references).toEqual({});
    const limit = w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    const text = JSON.stringify({
      abilities: pkg?.abilities,
      events: pkg?.events,
    });
    expect(CULTURE_EXCLUDED_WORDS.test(text)).toBe(false);
    expect(ALSO_EXCLUDED.test(text)).toBe(false);
    expect(pkg?.satisfaction).toEqual([]);
    expect(pkg?.visualComponents).toEqual([]);
    expect(
      pkg?.visualComponents.every(
        (c) => typeof CONTINUOUS_VISUALS[c] === 'function',
      ),
    ).toBe(true);
    // The two reused packages keep their abilities.
    for (const reused of [CORD, KNOT])
      expect(w.abilities.find((a) => a.id === reused)?.revision).toBe(
        `${reused}@1`,
      );
    const early = step(w, { wren: attempt(cordId('a'), cordId('b')) });
    expect(early.outcomes.wren?.reason).toMatch(/not mastered/);
    expect(actor(early.world).vitals).toEqual(actor(step(w).world).vitals);
    // Each of the three study rounds is paid individually; neither cord ability is a prerequisite.
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
    expect(actor(x).mastered).toContain(id);
    expect(events(x, 'satisfaction')).toHaveLength(0);
    expect(JSON.stringify(actor(x).wellbeing.sources)).not.toContain(id);
  });

  it('attempt: four paid rounds of 0.5 join both cords by a sheet bend on two conserved centrelines', () => {
    const w0 = ready(),
      a = cordId('a'),
      b = cordId('b'),
      before = reed(w0),
      load = v7Load(w0, actor(w0)),
      count = w0.stacks.length;
    for (const c of [a, b]) {
      expect(Number(cordPart(item(w0, c)).plyDiameter)).toBeCloseTo(
        plyDiameter(0.2, 0.3),
        8,
      );
      expect(cordPart(item(w0, c)).overall).toBe(0.34);
    }
    // Equal geometry: the better-conditioned cord (the newer b) is assigned the bight.
    expect(num(cordPart(item(w0, b)).condition)).toBeGreaterThan(
      num(cordPart(item(w0, a)).condition),
    );
    // Round 1 measures both cords, assigns the bight and forms it: no crossing, no join.
    const r1 = step(w0, { wren: attempt(a, b) });
    expect(r1.outcomes.wren).toMatchObject({ success: true, complete: false });
    expect(spent(w0, r1.world)).toBeCloseTo(0.5, 6);
    expect(joinEvents(r1.world)).toEqual([
      'cord-join-started',
      'cord-join-stage',
    ]);
    const j1 = job(r1.world),
      joinId = String(j1?.join);
    expect(j1).toMatchObject({ bight: b, wrap: a, mode: 'attempt' });
    expect(joinId).toMatch(/^join-/);
    for (const c of [a, b]) {
      expect(item(r1.world, c)?.reservedFor).toBe(j1?.id);
      expect(cordPart(item(r1.world, c)).role).toBe('cord');
    }
    const e1 = events(r1.world, 'cord-join-stage')[0];
    expect(e1?.data).toMatchObject({
      operation: 'measure-form-bight',
      round: 1,
      joinId,
      assignment: { bight: b, wrap: a, fits: true, trialGrips: true },
      after: {
        component: 'cord-join',
        reuses: 'fiber-cord',
        state: 'bight',
        status: 'incomplete',
        completedAppearance: false,
        crossings: [],
      },
    });
    expect(num(record(e1?.data.assignment).tightestBightRadius)).toBeCloseTo(
      R,
      3,
    );
    expect(e1?.data.candidates).toHaveLength(2);
    // Round 2 passes the second end up through the bight: one crossing, still no join.
    const r2 = step(r1.world, { wren: attempt(a, b) });
    expect(spent(r1.world, r2.world)).toBeCloseTo(0.5, 6);
    expect(events(r2.world, 'cord-join-stage')[0]?.data).toMatchObject({
      operation: 'pass-second-end',
      after: { state: 'threaded', completedAppearance: false },
    });
    expect(joinPart(item(r2.world, a))).toMatchObject({
      state: 'threaded',
      part: 'wrap',
      crossings: 1,
    });
    // Round 3 wraps round both legs and tucks: a loose undressed bend with the joined role.
    const r3 = step(r2.world, { wren: attempt(a, b) });
    expect(spent(r2.world, r3.world)).toBeCloseTo(0.5, 6);
    expect(events(r3.world, 'cord-join-stage')[0]?.data).toMatchObject({
      operation: 'wrap-and-tuck',
      after: {
        state: 'wrapped',
        status: 'incomplete',
        completedAppearance: false,
      },
    });
    for (const c of [a, b])
      expect(cordPart(item(r3.world, c)).role).toBe('joined');
    // Round 4 dresses and release-checks: both items now form a tied, untested sheet bend.
    const r4 = step(r3.world, { wren: attempt(a, b) }),
      w = r4.world;
    expect(r4.outcomes.wren).toMatchObject({ success: true, complete: true });
    expect(spent(r3.world, w)).toBeCloseTo(0.5, 6);
    const tiedEvent = events(w, 'cord-join-tied')[0];
    expect(tiedEvent?.target).toBe(joinId);
    expect(tiedEvent?.data).toMatchObject({
      outcome: 'tied',
      operation: 'dress-release-check',
      status: 'completed',
      trialGrips: true,
      gripShortfall: null,
      visual: {
        state: 'tied',
        status: 'tied-but-untested',
        completedAppearance: true,
      },
    });
    expect(tiedEvent?.description).toMatch(/untested/);
    const crossings = (tiedEvent?.data.visual as V7Data).crossings as V7Data[];
    expect(crossings).toHaveLength(6);
    expect(crossings[0]).toMatchObject({
      pass: 'up-through-bight',
      over: b,
      under: a,
    });
    const sb = item(w, b),
      sa = item(w, a),
      kb = joinPart(sb),
      ka = joinPart(sa);
    expect(kb).toMatchObject({
      law: 'cord-bend@1',
      method: 'sheet-bend',
      state: 'tied',
      part: 'bight',
      partner: a,
      joinId,
      workId: null,
      priorRole: 'cord',
      trials: [],
    });
    expect(ka).toMatchObject({
      state: 'tied',
      part: 'wrap',
      partner: b,
      joinId,
    });
    expect(num(kb.bightRadius)).toBeCloseTo(R, 3);
    expect(num(ka.wrapRadius)).toBeCloseTo(R, 3);
    expect(num(kb.path)).toBeCloseTo(BIGHT_PATH, 3);
    expect(num(ka.path)).toBeCloseTo(WRAP_PATH, 3);
    for (const k of [ka, kb]) {
      // Each cord's ledger closes on its own conserved centreline.
      expect(num(k.standing) + num(k.path) + num(k.tail)).toBeCloseTo(0.34, 9);
      expect(num(k.centreline)).toBe(0.34);
      expect(num(k.tail)).toBeCloseTo(TAIL, 3);
      expect(num(k.tail)).toBeGreaterThanOrEqual(0.02 + num(k.width) - 1e-4);
      expect(num(k.standing)).toBeGreaterThanOrEqual(0.06);
    }
    expect(num(ka.standing)).toBeCloseTo(0.34 - WRAP_PATH - TAIL, 3);
    // Both items keep identity, quantity, origin and provenance; the join is a relation, no third stock.
    for (const s of [sa, sb]) {
      expect(s).toMatchObject({
        quantity: 0.2,
        owner: 'wren',
        origin: REEDS.source,
        reservedFor: joinId,
      });
      expect(cordPart(s)).toMatchObject({
        role: 'joined',
        length: 0.3,
        overall: 0.34,
        plies: 2,
        madeBy: 'wren',
      });
    }
    expect(job(w)).toMatchObject({
      status: 'completed',
      completedWork: 4,
      paidEnergy: 2,
    });
    expect(w.stacks).toHaveLength(count);
    expect(reed(w)).toBe(before);
    expect(v7Load(w, actor(w))).toBeCloseTo(load, 8);
    // One verified finding; no milestone, pleasure or comfort follows a join.
    expect(
      w.events.filter(
        (x) => x.type === 'information-confirmed' && x.interface === id,
      ),
    ).toHaveLength(1);
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(events(w, 'satisfaction')).toHaveLength(0);
    expect(JSON.stringify(actor(w).wellbeing.sources)).not.toContain(id);
    for (const x of [r1.world, r2.world, r3.world, w]) {
      expect(visibleText(x)).not.toMatch(HIDDEN);
      expect(CULTURE_EXCLUDED_WORDS.test(visibleText(x))).toBe(false);
    }
    // The bound cords are blocked from conflicting uses: the knot, the straight trial, drop and a new join.
    actor(w).vitals.energy = 40;
    unchanged(
      w,
      {
        interface: KNOT,
        args: { mode: 'attempt', targetId: a, knot: 'overhand' },
      },
      /your own finished cord/,
    );
    unchanged(
      w,
      cordMode('trial', { targetId: b, trialForce: 10, trialDuration: 60 }),
      /finished cord or cord fragment/,
    );
    unchanged(
      w,
      { interface: 'drop', args: { target: a, quantity: 0.2 } },
      /reserved/,
    );
    unchanged(w, attempt(a, cordId('s20')), /part of a join/);
  });

  it('attempt: measured limits end the paid stage with the actual cords; impossible geometry is refused before costs', () => {
    const w0 = ready(),
      thin = cordId('a'),
      short = cordId('short1');
    // A 0.14 m, 12.8 mm cord could bend round a thin cord in a pliant enough fiber, but the measured
    // bend limit of reed leaves no assignment: the first paid round finds the shortfall.
    const r = step(w0, { wren: attempt(thin, short) });
    expect(r.outcomes.wren?.complete).toBe(true);
    expect(spent(w0, r.world)).toBeCloseTo(0.5, 6);
    const e = events(r.world, 'cord-join-infeasible')[0];
    expect(e?.data).toMatchObject({
      outcome: 'too-short',
      operation: 'measure-form-bight',
      after: {
        state: 'straight',
        status: 'geometrically-infeasible',
        completedAppearance: false,
      },
    });
    expect(e?.data.problem).toMatch(
      new RegExp(`${short} is 0.14 m; the bend needs`),
    );
    expect(e?.data.candidates).toHaveLength(2);
    expect(events(r.world, 'cord-join-tied')).toHaveLength(0);
    for (const c of [thin, short]) {
      expect(item(r.world, c)?.reservedFor).toBeUndefined();
      expect(cordPart(item(r.world, c)).role).toBe('cord');
      expect(joinPart(item(r.world, c))).toMatchObject({
        state: 'straight',
        joinId: null,
      });
    }
    expect(job(r.world)?.status).toBe('stopped');
    expect(events(r.world, 'information-confirmed')).toHaveLength(1);
    expect(reed(r.world)).toBe(reed(w0));
    // Two such cords cannot form any sheet bend whatever the material: refused before costs.
    unchanged(
      w0,
      attempt(short, cordId('short2')),
      /Whatever the material.*Nothing was spent/,
    );
    // Refusals spend nothing.
    unchanged(
      w0,
      mode('attempt', { cordIds: [thin, cordId('b')], method: 'reef' }),
      /declared choices/,
    );
    unchanged(w0, mode('attempt', { cordIds: [thin, cordId('b')] }), /method/);
    unchanged(
      w0,
      mode('attempt', { cordIds: [thin], method: 'sheet-bend' }),
      /two different cords/,
    );
    unchanged(w0, attempt(thin, thin), /two different cords/);
    unchanged(w0, attempt(thin, 'reed'), /exact ids of two of your own/);
    const raw = w0.stacks.find(
      (s) => s.owner === 'wren' && s.resource === 'reed' && !s.processing,
    );
    unchanged(w0, attempt(thin, raw?.id ?? ''), /exact ids of two of your own/);
    unchanged(
      w0,
      mode('attempt', {
        cordIds: [thin, cordId('b')],
        method: 'sheet-bend',
        trialForce: 5,
      }),
      /Irrelevant argument/,
    );
    unchanged(
      w0,
      mode('attempt', {
        cordIds: [thin, cordId('b')],
        method: 'sheet-bend',
        workId: 'manual-1',
      }),
      /No unfinished join work/,
    );
    unchanged(w0, mode('untie', { joinId: 'join-1' }), /exact id of a join/);
    // Knotted cords, reserved cords, broken strands and unsupported fiber are refused before costs.
    let knotted = w0;
    for (let i = 0; i < 3; i++)
      knotted = step(knotted, {
        wren: {
          interface: KNOT,
          args: { mode: 'attempt', targetId: thin, knot: 'overhand' },
        },
      }).world;
    expect(cordPart(item(knotted, thin)).role).toBe('knotted');
    actor(knotted).vitals.energy = 40;
    unchanged(knotted, attempt(thin, cordId('b')), /holds an overhand knot/);
    const reserved = v7Clone(w0);
    const rs = item(reserved, cordId('b'));
    if (rs) rs.reservedFor = 'manual-other';
    unchanged(reserved, attempt(thin, cordId('b')), /reserved by other work/);
    const worn = v7Clone(w0);
    cordPart(item(worn, thin)).condition = 0.4;
    unchanged(
      worn,
      attempt(thin, cordId('b')),
      /More than half of the strands/,
    );
    const grass = v7Clone(w0);
    const gs = item(grass, thin);
    if (gs) gs.resource = 'dry-grass';
    unchanged(grass, attempt(thin, cordId('b')), /Unsupported material/);
    const crowded = v7Clone(w0);
    actor(crowded, 'kai').position = { x: REEDS.at.x + 0.5, y: REEDS.at.y };
    unchanged(crowded, attempt(thin, cordId('b')), /another person/);
    const tired = v7Clone(w0);
    actor(tired).vitals.energy = 0.4;
    unchanged(tired, attempt(thin, cordId('b')), /Not enough energy/);
    expect(job(w0)).toBeUndefined();
  });

  it('attempt: the measured assignment decides the bight, and a tie may leave no grip for a trial', () => {
    const w0 = ready(),
      thin = cordId('a');
    // With the shorter cord as the bight both standing parts keep a trial grip; the other way round they do not.
    const s20 = cordId('s20');
    const r = step(w0, { wren: attempt(thin, s20) });
    const e = events(r.world, 'cord-join-stage')[0];
    expect(job(r.world)).toMatchObject({ bight: s20, wrap: thin });
    const [best, other] = e?.data.candidates as V7Data[];
    expect(best).toMatchObject({ bight: s20, fits: true, trialGrips: true });
    expect(other).toMatchObject({ bight: thin, fits: true, trialGrips: false });
    expect(other?.gripShortfall).toMatch(/a trial hand needs 0.06 m/);
    // A 0.19 m cord only fits as the bight, and its standing part is then too short to grip.
    const s15 = cordId('s15');
    let w = w0;
    for (let i = 0; i < 4; i++) w = step(w, { wren: attempt(thin, s15) }).world;
    const t = events(w, 'cord-join-tied')[0];
    expect(job(w)).toMatchObject({
      bight: s15,
      wrap: thin,
      status: 'completed',
    });
    expect(t?.data).toMatchObject({ trialGrips: false });
    expect(t?.description).toMatch(/No two-hand trial is possible/);
    expect(cordPart(item(w, s15)).role).toBe('joined');
    actor(w).vitals.energy = 40;
    unchanged(
      w,
      pull(joinIdOf(w)),
      /each hand needs 0.06 m.*No force was applied/,
    );
    // The joined assembly is still inspectable and untieable.
    const inspected = step(w, {
      wren: mode('inspect', { joinId: joinIdOf(w) }),
    });
    expect(
      events(inspected.world, 'cord-join-inspected')[0]?.data,
    ).toMatchObject({
      trialGrips: { possible: false, needed: 0.06 },
      holdingForce: null,
    });
  });

  it('trial: a bounded two-hand pull on both standing parts records requested and achieved force and time', () => {
    const w0 = tied(),
      joinId = joinIdOf(w0),
      a = cordId('a'),
      b = cordId('b'),
      kb = joinPart(item(w0, b)),
      ka = joinPart(item(w0, a)),
      conditions = [b, a].map((c) => num(cordPart(item(w0, c)).condition));
    const r = step(w0, { wren: pull(joinId) });
    expect(r.outcomes.wren).toMatchObject({ success: true, complete: true });
    expect(spent(w0, r.world)).toBeCloseTo(0.5, 6);
    const e = events(r.world, 'cord-join-trial')[0];
    expect(e?.data).toMatchObject({
      outcome: 'held',
      law: 'cord-bend@1',
      joinId,
      items: [b, a],
      requestedForce: 10,
      achievedForce: 10,
      requestedDuration: 60,
      heldSeconds: 60,
      slippingTail: null,
      tailDisplacement: [0, 0],
      breakAt: null,
      strandsBroken: [0, 0],
      conditionBefore: conditions,
      conditionAfter: conditions,
      gripStanding: [kb.standing, ka.standing],
      gripTails: [kb.tail, ka.tail],
      fragments: [],
    });
    // cord-bend@1 retention for equal reed cords: the bight tail is not self-locking and slips near 35 N.
    const angle = (Math.PI * num(kb.support)) / num(kb.bightRadius),
      slip = (2 * 0.3 * 5) / (Math.exp(-0.3 * angle) - 0.6);
    expect(num(e?.data.slipLoad)).toBeCloseTo(slip, 1);
    expect(num((e?.data.freeSpans as number[])[0])).toBeCloseTo(
      num(kb.standing) - 0.05 + num(kb.path),
      4,
    );
    expect((e?.data.elasticExtension as number[]).every((x) => x > 0)).toBe(
      true,
    );
    expect(e?.data.visual).toMatchObject({
      state: 'tied',
      status: 'held-at-recorded-load',
      completedAppearance: true,
      trial: { outcome: 'held', heldSeconds: 60 },
    });
    expect(events(r.world, 'information-confirmed')).toHaveLength(1);
    for (const c of [a, b]) {
      expect(joinPart(item(r.world, c)).trials).toMatchObject([
        { outcome: 'held', achievedForce: 10, heldSeconds: 60 },
      ]);
      expect(item(r.world, c)).toMatchObject({
        quantity: 0.2,
        reservedFor: joinId,
      });
    }
    expect(reed(r.world)).toBe(reed(w0));
    // A weakened hand bounds the force: the achieved, not the requested, force is recorded.
    const weak = v7Clone(w0);
    actor(weak).vitals.health = 4;
    const h = events(
      step(weak, { wren: pull(joinId, 10, 30) }).world,
      'cord-join-trial',
    )[0];
    expect(h?.data).toMatchObject({
      outcome: 'held',
      requestedForce: 10,
      achievedForce: 8,
      handLimit: 8,
      heldSeconds: 30,
    });
    // Refusals spend nothing and apply no force.
    unchanged(w0, pull(joinId, 0, 60), /above zero/);
    unchanged(w0, pull(joinId, 10, 0), /above zero/);
    unchanged(w0, pull(joinId, 11, 60), /trialForce/);
    unchanged(w0, pull(joinId, 10, 61), /trialDuration/);
    unchanged(w0, mode('trial', { joinId, trialForce: 5 }), /trialDuration/);
    unchanged(
      w0,
      mode('trial', {
        joinId,
        trialForce: 5,
        trialDuration: 5,
        method: 'sheet-bend',
      }),
      /Irrelevant argument/,
    );
    unchanged(w0, pull('join-0-wren-1'), /exact id of a join/);
    // A loose, undressed bend is not trialled.
    const loose = joinRounds(3);
    let c = step(loose, { wren: mode('cancel') }).world;
    actor(c).vitals.energy = 40;
    unchanged(c, pull(joinIdOf(c)), /dressed, release-checked join/);
    c = step(c, { wren: attempt(a, b) }).world;
    expect(events(c, 'cord-join-tied')).toHaveLength(1);
  });

  it('trial: loads only weaken; a slipping bend parts the cords and a weak cord breaks in the bend into two owned fragments', () => {
    const w0 = tied(),
      joinId = joinIdOf(w0),
      a = cordId('a'),
      b = cordId('b'),
      kb = joinPart(item(w0, b)),
      diameter = num(cordPart(item(w0, a)).plyDiameter),
      concentration = 1 + num(kb.width) / (2 * num(kb.arcRadius));
    // Above half a cord's breaking force in the bend, that share of its strands breaks.
    const worn = v7Clone(w0);
    cordPart(item(worn, a)).condition = 0.25;
    const strength = straightBreak(diameter, 0.25) / concentration;
    const d = step(worn, { wren: pull(joinId) }).world;
    const e = events(d, 'cord-join-trial')[0];
    expect(e?.data).toMatchObject({ outcome: 'held', achievedForce: 10 });
    expect(num((e?.data.strandsBroken as number[])[1])).toBeCloseTo(
      10 / strength - 0.5,
      6,
    );
    expect((e?.data.strandsBroken as number[])[0]).toBe(0);
    expect(events(d, 'cord-join-damaged')).toHaveLength(1);
    expect(num(cordPart(item(d, a)).condition)).toBeLessThan(0.25);
    // Below the request the weak cord breaks at its turn round the legs; all fiber stays owned.
    const weak = v7Clone(w0);
    cordPart(item(weak, a)).condition = 0.1;
    const before = reed(weak),
      count = weak.stacks.length,
      ka = joinPart(item(weak, a)),
      br = step(weak, { wren: pull(joinId) }).world,
      broke = events(br, 'cord-join-trial')[0],
      at = straightBreak(diameter, 0.1) / concentration;
    expect(at).toBeLessThan(10);
    expect(broke?.data).toMatchObject({
      outcome: 'broke',
      breakAt: `${a}:wrap`,
      conditionAfter: [num(cordPart(item(weak, b)).condition), 0.05],
      requestedForce: 10,
      achievedForce: Math.round(at * 10) / 10,
      heldSeconds: 0,
      visual: { completedAppearance: false, status: 'broken' },
    });
    expect(item(br, a)).toBeUndefined();
    expect(br.stacks).toHaveLength(count + 1);
    const pieces = br.stacks.filter((s) => cordPart(s).fragmentOf === a);
    expect(pieces.map((s) => s.quantity)).toEqual([0.1, 0.1]);
    expect(reed(br)).toBe(before);
    const ids = pieces.map((s) => s.id);
    // The fragment lengths reconcile with the broken centreline at the recorded break point.
    expect(
      pieces.reduce((n, s) => n + num(cordPart(s).overall), 0),
    ).toBeCloseTo(0.34, 9);
    expect(num(cordPart(pieces[0]).overall)).toBeCloseTo(
      num(ka.standing) + num(kb.width),
      4,
    );
    for (const s of pieces) {
      expect(s).toMatchObject({ owner: 'wren', origin: REEDS.source });
      expect(s.reservedFor).toBeUndefined();
      // Half the strands broke at the break; the fragments then wear once this round like any fragment.
      expect(cordPart(s)).toMatchObject({
        role: 'fragment',
        status: 'broken',
        fragments: ids,
        condition: 0.0495,
      });
      expect(joinPart(s)).toMatchObject({
        state: 'straight',
        joinId: null,
        last: 'broke-at-bend',
        priorRole: 'fragment',
        fragments: ids,
      });
    }
    // The other cord is freed, straight and whole.
    expect(item(br, b)?.reservedFor).toBeUndefined();
    expect(cordPart(item(br, b))).toMatchObject({
      role: 'cord',
      overall: 0.34,
    });
    expect(joinPart(item(br, b))).toMatchObject({
      state: 'straight',
      joinId: null,
    });
    expect(events(br, 'cord-join-broken')[0]?.data.fragments).toEqual(ids);
    // A looser seated bend (here a wider recorded crown) is not self-locking below 10 N: it slips apart.
    const loose = v7Clone(w0);
    for (const c of [a, b]) joinPart(item(loose, c)).bightRadius = 0.2;
    const sl = step(loose, { wren: pull(joinId) }).world,
      s = events(sl, 'cord-join-trial')[0],
      ratio = 0.0081 / 0.2,
      expected = (2 * 0.3 * 5) / (Math.exp(-0.3 * Math.PI * ratio) - 0.6);
    expect(expected).toBeLessThan(10);
    expect(s?.data).toMatchObject({
      outcome: 'slipped',
      slippingTail: b,
      heldSeconds: 0,
      visual: { completedAppearance: false, status: 'slipped' },
    });
    expect(num(s?.data.achievedForce)).toBeCloseTo(expected, 0);
    expect(num((s?.data.tailDisplacement as number[])[0])).toBeGreaterThan(0);
    expect(events(sl, 'cord-join-slipped')).toHaveLength(1);
    for (const c of [a, b]) {
      expect(item(sl, c)?.reservedFor).toBeUndefined();
      expect(cordPart(item(sl, c))).toMatchObject({
        role: 'cord',
        overall: 0.34,
      });
      expect(joinPart(item(sl, c))).toMatchObject({
        state: 'straight',
        last: 'slipped-apart',
      });
    }
    expect(reed(sl)).toBe(reed(w0));
  });

  it('untie: two paid rounds of 0.5 reverse the passes and free both straight cords; a damaged or pressed bend resists', () => {
    const w0 = tied(),
      joinId = joinIdOf(w0),
      a = cordId('a'),
      b = cordId('b');
    const r1 = step(w0, { wren: mode('untie', { joinId }) });
    expect(r1.outcomes.wren?.complete).toBe(false);
    expect(spent(w0, r1.world)).toBeCloseTo(0.5, 6);
    expect(joinPart(item(r1.world, a))).toMatchObject({
      state: 'threaded',
      crossings: 1,
    });
    expect(cordPart(item(r1.world, a)).role).toBe('cord');
    expect(item(r1.world, a)?.reservedFor).toBe(job(r1.world)?.id);
    const r2 = step(r1.world, { wren: mode('untie', { joinId }) });
    expect(r2.outcomes.wren?.complete).toBe(true);
    expect(spent(r1.world, r2.world)).toBeCloseTo(0.5, 6);
    expect(events(r2.world, 'cord-join-untied')[0]?.data).toMatchObject({
      visual: { status: 'untied', completedAppearance: false },
    });
    for (const c of [a, b]) {
      const s = item(r2.world, c);
      expect(joinPart(s)).toMatchObject({
        state: 'straight',
        last: 'untied',
        joinId: null,
      });
      expect(cordPart(s)).toMatchObject({ role: 'cord', overall: 0.34 });
      expect(s?.reservedFor).toBeUndefined();
    }
    expect(job(r2.world)).toMatchObject({ mode: 'untie', paidEnergy: 1 });
    expect(reed(r2.world)).toBe(reed(w0));
    // The freed straight cords are again usable by the unchanged cord package.
    actor(r2.world).vitals.energy = 40;
    const straight = step(r2.world, {
      wren: cordMode('trial', {
        targetId: a,
        trialForce: 10,
        trialDuration: 60,
      }),
    });
    expect(straight.outcomes.wren?.success).toBe(true);
    // Too many broken strands: the paid round finds the bend resists and it stays joined.
    const damaged = v7Clone(w0);
    cordPart(item(damaged, a)).condition = 0.4;
    const d = step(damaged, { wren: mode('untie', { joinId }) });
    expect(spent(damaged, d.world)).toBeCloseTo(0.5, 6);
    expect(events(d.world, 'cord-join-resisted')[0]?.data).toMatchObject({
      outcome: 'damaged',
    });
    expect(joinPart(item(d.world, a)).state).toBe('tied');
    expect(item(d.world, a)?.reservedFor).toBe(joinId);
    expect(job(d.world)?.status).toBe('stopped');
    // A hugging wrap that carried more than half its breaking force jams.
    const pressed = v7Clone(w0);
    const kp = joinPart(item(pressed, a));
    kp.conformity = 1;
    kp.trials = [{ tick: 1, outcome: 'held', loadShare: 0.6 }];
    const p = step(pressed, { wren: mode('untie', { joinId }) }).world;
    expect(events(p, 'cord-join-resisted')[0]?.data).toMatchObject({
      outcome: 'jammed',
    });
    expect(events(p, 'cord-join-resisted')[0]?.data.problem).toMatch(/pressed/);
  });

  it('pauses uncharged when not worked, resumes only by workId, and cancel opens unretained crossings but keeps a wrapped bend', () => {
    const a = cordId('a'),
      b = cordId('b');
    let w = joinRounds(1);
    const workId = job(w)?.id ?? '';
    w = step(w).world;
    expect(job(w)).toMatchObject({ status: 'paused', paidEnergy: 0.5 });
    expect(events(w, 'cord-join-paused')[0]?.data).toMatchObject({
      workId,
      nextStage: 'pass-second-end',
    });
    expect(item(w, a)?.reservedFor).toBe(workId);
    expect(joinPart(item(w, b)).state).toBe('bight');
    unchanged(w, attempt(a, b), /Unfinished join work/);
    unchanged(
      w,
      mode('attempt', { workId, method: 'sheet-bend' }),
      /Irrelevant argument/,
    );
    unchanged(w, mode('untie', { workId }), /resume it with mode attempt/);
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.4;
    const low = step(tired, { wren: mode('attempt', { workId }) });
    expect(low.outcomes.wren?.success).toBe(true);
    expect(events(low.world, 'cord-join-paused')[0]?.data).toMatchObject({
      requiredEnergy: 0.5,
    });
    expect(spent(tired, low.world)).toBeCloseTo(0, 6);
    // A held bight has no crossing that holds: cancelling releases it with an observable release event.
    const c1 = step(w, { wren: mode('cancel') });
    expect(spent(w, c1.world)).toBeCloseTo(0, 6);
    expect(events(c1.world, 'cord-join-cancelled')[0]?.data).toMatchObject({
      opened: true,
      retained: false,
    });
    expect(events(c1.world, 'cord-join-released')).toHaveLength(1);
    for (const c of [a, b]) {
      expect(joinPart(item(c1.world, c)).state).toBe('straight');
      expect(item(c1.world, c)?.reservedFor).toBeUndefined();
    }
    expect(job(c1.world)).toMatchObject({ status: 'stopped', paidEnergy: 0.5 });
    // Resuming pays only the next stage.
    const back = step(w, { wren: mode('attempt', { workId }) });
    expect(events(back.world, 'cord-join-resumed')).toHaveLength(1);
    expect(events(back.world, 'cord-join-stage')[0]?.data.operation).toBe(
      'pass-second-end',
    );
    expect(spent(w, back.world)).toBeCloseTo(0.5, 6);
    // Cancelled after wrap-and-tuck, the loose bend stays a bound pair; nothing is untied or refunded.
    actor(back.world).vitals.energy = 40;
    const wrapped = step(back.world, {
      wren: mode('attempt', { workId }),
    }).world;
    const c2 = step(wrapped, { wren: mode('cancel', { workId }) });
    expect(c2.outcomes.wren?.success).toBe(true);
    expect(events(c2.world, 'cord-join-cancelled')[0]?.data).toMatchObject({
      opened: false,
      retained: true,
    });
    expect(events(c2.world, 'cord-join-released')).toHaveLength(0);
    const joinId = String(job(c2.world)?.join);
    for (const c of [a, b]) {
      expect(joinPart(item(c2.world, c))).toMatchObject({
        state: 'wrapped',
        joinId,
      });
      expect(cordPart(item(c2.world, c)).role).toBe('joined');
      expect(item(c2.world, c)?.reservedFor).toBe(joinId);
    }
    unchanged(c2.world, mode('cancel'), /No unfinished join work/);
    // A new attempt on the loose bend pays only the dressing round.
    actor(c2.world).vitals.energy = 40;
    const dressed = step(c2.world, { wren: attempt(a, b) });
    expect(dressed.outcomes.wren?.complete).toBe(true);
    expect(spent(c2.world, dressed.world)).toBeCloseTo(0.5, 6);
    expect(job(dressed.world)).toMatchObject({
      initialWork: 1,
      status: 'completed',
      join: joinId,
    });
    expect(joinPart(item(dressed.world, b)).state).toBe('tied');
  });

  it('inspect records visible bend geometry for 0.2 energy and leaves holding force unknown', () => {
    const w0 = tied(),
      joinId = joinIdOf(w0);
    const r = step(w0, { wren: mode('inspect', { joinId }) });
    expect(spent(w0, r.world)).toBeCloseTo(0.2, 6);
    const e = events(r.world, 'cord-join-inspected')[0];
    expect(e?.data).toMatchObject({
      joinId,
      join: {
        state: 'tied',
        completedAppearance: true,
        status: 'tied-but-untested',
      },
      trialGrips: { possible: true, needed: 0.06 },
      holdingForce: null,
      lastJoinTrial: null,
    });
    expect(e?.data.unknown).toMatch(/holding force/);
    expect(e?.data.cords).toHaveLength(2);
    expect(
      actor(r.world).memory.knowledge?.[`${joinId}:cord-join-geometry`]
        ?.verified,
    ).toBe(false);
    expect(events(r.world, 'information-confirmed')).toHaveLength(0);
    expect(r.world.stacks).toEqual(step(w0).world.stacks);
    unchanged(
      w0,
      mode('inspect', { joinId, workId: 'manual-1' }),
      /exactly one/,
    );
    unchanged(w0, mode('inspect', { workId: 'manual-1' }), /No join work/);
    // During work the reserved cords are inspected through the workId.
    const working = joinRounds(2);
    const during = step(working, {
      wren: mode('inspect', { workId: job(working)?.id }),
    });
    expect(events(during.world, 'cord-join-inspected')[0]?.data).toMatchObject({
      join: { state: 'threaded', completedAppearance: false },
      trialGrips: null,
    });
  });

  it('joined cords wear 0.0005 per round exactly once, and the work and join stay personal', () => {
    const w0 = tied(),
      a = cordId('a'),
      b = cordId('b'),
      other = cordId('s20'),
      conditions = [a, b, other].map((c) =>
        num(cordPart(item(w0, c)).condition),
      );
    let w = w0;
    for (let i = 0; i < 4; i++) w = step(w).world;
    [a, b, other].forEach((c, i) => {
      expect(num(cordPart(item(w, c)).condition)).toBeCloseTo(
        (conditions[i] ?? 0) - 4 * 0.0005,
        8,
      );
    });
    // Another person cannot resume, inspect, trial, untie or cancel Wren's work or join, nor use her cords.
    const joinId = joinIdOf(w0);
    const x = joinRounds(1, 'a', 's20');
    const workId = job(x)?.id ?? '';
    actor(x, 'kai').mastered.push(id);
    actor(x, 'kai').position = { x: REEDS.at.x - 2, y: REEDS.at.y };
    unchanged(
      x,
      mode('attempt', { workId }),
      /No unfinished join work of yours/,
      'kai',
    );
    unchanged(x, mode('inspect', { workId }), /No join work of yours/, 'kai');
    unchanged(x, mode('cancel', { workId }), /No unfinished join work/, 'kai');
    unchanged(
      x,
      attempt(cordId('short1'), cordId('short2')),
      /exact ids of two of your own/,
      'kai',
    );
    const y = v7Clone(w0);
    actor(y, 'kai').mastered.push(id);
    actor(y, 'kai').position = { x: REEDS.at.x - 2, y: REEDS.at.y };
    unchanged(y, pull(joinId), /exact id of a join of two of your own/, 'kai');
    unchanged(
      y,
      mode('untie', { joinId }),
      /exact id of a join of two of your own/,
      'kai',
    );
    unchanged(
      y,
      mode('inspect', { joinId }),
      /exact id of a join of two of your own/,
      'kai',
    );
  });

  it('stops at death, leaving both cords where the person died once in their actual configuration', () => {
    const pkg = continuousRegistry(ready()).packages.find((p) => p.id === id),
      a = cordId('a'),
      b = cordId('b');
    for (const [rounds, state, bound] of [
      [1, 'straight', false],
      [3, 'wrapped', true],
    ] as const) {
      const w = joinRounds(rounds),
        dead = v7Clone(w),
        joinId = String(job(w)?.join);
      pkg?.onDeath?.(dead, actor(dead));
      expect(job(dead)?.status).toBe('stopped');
      expect(events(dead, 'cord-join-stopped')).toHaveLength(1);
      expect(events(dead, 'cord-join-released')).toHaveLength(bound ? 0 : 1);
      for (const c of [a, b]) {
        const s = item(dead, c);
        expect(s).toMatchObject({
          owner: null,
          position: actor(dead).position,
          quantity: 0.2,
        });
        expect(s?.reservedFor).toBe(bound ? joinId : undefined);
        expect(joinPart(s).state).toBe(state);
      }
      expect(reed(dead)).toBe(reed(w));
    }
  });
});
