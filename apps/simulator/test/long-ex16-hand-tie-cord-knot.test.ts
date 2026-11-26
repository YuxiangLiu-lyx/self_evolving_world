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
vi.setConfig({ testTimeout: 60_000 });

const id = 'hand-tie-cord-knot';
const CORD = 'hand-twist-fiber-cord';
const WAIT: V7Action = { interface: 'wait', args: {} };
const REEDS = { source: 'forest-reed-0', at: { x: 22.6, y: 5.9 } };
/** Engine material values that no event may reveal. */
const HIDDEN = /flexib|hardness/i;
/** Cords made with the unchanged hand-twist-fiber-cord@1: [units of reed, twisted length in m].
 * thin matches Wren's actual item-226-wren-2532 (0.2 unit, 0.30 m, 4.06 mm plies). */
const SIZES = {
  thin: [0.2, 0.3],
  mid: [0.3, 0.3],
  slip: [0.4, 0.3],
  thick: [0.5, 0.3],
  wide: [1, 0.25],
  short: [0.2, 0.1],
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
const knotEvents = (w: V7World) =>
  w.events.filter((e) => e.type.startsWith('cord-knot')).map((e) => e.type);
const mode = (m: string, args: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...args },
});
const attempt = (targetId: string) =>
  mode('attempt', { targetId, knot: 'overhand' });
const pull = (targetId: string, trialForce = 10, trialDuration = 60) =>
  mode('trial', { targetId, trialForce, trialDuration });
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
  target: string | null;
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
const knotPart = (s?: V7Stack): V7Data =>
  (s?.processing?.cordKnot ?? {}) as V7Data;
const num = (v: unknown) => (typeof v === 'number' ? v : NaN);
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
/** cord-knot@1 restated for reed (engine bend index 0.7): lobe radius and knot path. */
const lobeOf = (width: number) => Math.max(width, (width * 0.5) / (0.7 - 0.5));
const pathOf = (width: number) => 3 * Math.PI * lobeOf(width) + width;

let cache: { unstudied: V7World; cords: Record<Size, string> } | undefined;
/** Wren gathers real reed, makes each fixture cord with hand-twist-fiber-cord@1 and stays at the reed bed. */
function build() {
  if (cache) return cache;
  const genesis = initialLongWorld('long-ex16', 'long-culture-v2');
  let w = v7Install(genesis, continuousRegistry(genesis), `${CORD}@1`);
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
  w = step(w, { wren: { interface: 'learn', args: { ability: CORD } } }).world;
  for (let i = 0; i < 2; i++) w = step(w).world;
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
/** The fixture world after Wren studied the knot for three paid rounds. */
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
/** Runs attempt rounds on one fixture cord. */
function tieRounds(name: Size, rounds: number, from = ready()) {
  let w = from;
  for (let i = 0; i < rounds; i++)
    w = step(w, { wren: attempt(cordId(name)) }).world;
  actor(w).vitals.energy = 40;
  return w;
}
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

describe('hand-tied overhand cord knot in ex16', () => {
  it('is scoped to ex16 after the cord package, needs three study rounds at 0.2 energy and fits the frozen size limit', () => {
    const other = initialLongWorld('long-ex15', 'long-culture');
    expect(() =>
      v7Install(other, continuousRegistry(other), `${id}@1`),
    ).toThrow();
    const bare = initialLongWorld('long-ex16', 'long-culture-v2');
    expect(() => v7Install(bare, continuousRegistry(bare), `${id}@1`)).toThrow(
      /dependency/,
    );
    const w = v7Clone(build().unstudied);
    const ability = w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(3);
    expect(ability?.learningEnergy).toBe(0.2);
    expect(ability?.prerequisites).toEqual([]);
    const limit = w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    expect(
      CULTURE_EXCLUDED_WORDS.test(
        JSON.stringify({ abilities: pkg?.abilities, events: pkg?.events }),
      ),
    ).toBe(false);
    expect(pkg?.satisfaction).toEqual([]);
    expect(
      pkg?.visualComponents.every(
        (c) => typeof CONTINUOUS_VISUALS[c] === 'function',
      ),
    ).toBe(true);
    const early = step(w, { wren: attempt(cordId('thin')) });
    expect(early.outcomes.wren?.reason).toMatch(/not mastered/);
    expect(actor(early.world).vitals).toEqual(actor(step(w).world).vitals);
    // Each of the three study rounds is paid individually; cord-making mastery is not required.
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

  it('attempt: three paid rounds of 0.5 energy tie an overhand in the same cord on a conserved centreline', () => {
    const w0 = ready(),
      cord = cordId('thin'),
      before = reed(w0),
      load = v7Load(w0, actor(w0)),
      count = w0.stacks.length,
      p0 = cordPart(item(w0, cord));
    expect(Number(p0.plyDiameter)).toBeCloseTo(plyDiameter(0.2, 0.3), 8);
    expect(p0.overall).toBe(0.34);
    // Round 1 lays and bends a loop: one crossing, held, no knot and no completed appearance.
    const r1 = step(w0, { wren: attempt(cord) });
    expect(r1.outcomes.wren).toMatchObject({ success: true, complete: false });
    expect(spent(w0, r1.world)).toBeCloseTo(0.5, 6);
    expect(knotEvents(r1.world)).toEqual([
      'cord-knot-started',
      'cord-knot-stage',
    ]);
    const s1 = item(r1.world, cord);
    expect(s1?.reservedFor).toBe(job(r1.world)?.id);
    expect(cordPart(s1).role).toBe('cord');
    expect(knotPart(s1)).toMatchObject({
      law: 'cord-knot@1',
      state: 'loop',
      crossings: 1,
    });
    const e1 = events(r1.world, 'cord-knot-stage')[0];
    expect(e1?.data).toMatchObject({
      operation: 'lay-bend-loop',
      round: 1,
      visual: {
        component: 'cord-knot',
        reuses: 'fiber-cord',
        state: 'loop',
        completedAppearance: false,
        cord: { component: 'fiber-cord', item: cord },
      },
    });
    expect(num(e1?.data.tightestLoopRadius)).toBeCloseTo(
      lobeOf(2 * Number(p0.plyDiameter)),
      3,
    );
    // Round 2 passes the end through: three crossings, knotted role, still not a completed knot.
    const r2 = step(r1.world, { wren: attempt(cord) });
    expect(spent(r1.world, r2.world)).toBeCloseTo(0.5, 6);
    const s2 = item(r2.world, cord);
    expect(cordPart(s2).role).toBe('knotted');
    expect(knotPart(s2)).toMatchObject({ state: 'tucked', crossings: 3 });
    expect(events(r2.world, 'cord-knot-stage')[0]?.data).toMatchObject({
      operation: 'pass-end-through',
      visual: { state: 'tucked', completedAppearance: false },
    });
    // Round 3 dresses and release-checks: the same item now holds a tied overhand.
    const r3 = step(r2.world, { wren: attempt(cord) }),
      w = r3.world;
    expect(r3.outcomes.wren).toMatchObject({ success: true, complete: true });
    expect(spent(r2.world, w)).toBeCloseTo(0.5, 6);
    const tied = events(w, 'cord-knot-tied')[0],
      s = item(w, cord),
      k = knotPart(s),
      width = 2 * plyDiameter(0.2, 0.3);
    expect(tied?.target).toBe(cord);
    expect(tied?.data).toMatchObject({
      outcome: 'tied',
      operation: 'dress-release-check',
      status: 'completed',
      visual: {
        state: 'tied',
        completedAppearance: true,
        tightening: 'seated',
      },
    });
    expect(k).toMatchObject({
      state: 'tied',
      knot: 'overhand',
      crossings: 3,
      priorRole: 'cord',
      workId: null,
      trials: [],
    });
    expect(num(k.width)).toBeCloseTo(width, 3);
    expect(num(k.lobeRadius)).toBeCloseTo(lobeOf(width), 3);
    expect(num(k.knotPath)).toBeCloseTo(pathOf(width), 3);
    // Centreline length is conserved; the knot shortens the end-to-end span, not the cord.
    expect(
      num(k.standingTail) + num(k.knotPath) + num(k.workingTail),
    ).toBeCloseTo(0.34, 9);
    expect(k.standingTail).toBe(k.workingTail);
    expect(num(k.standingTail)).toBeCloseTo((0.34 - pathOf(width)) / 2, 3);
    expect(num(k.endToEnd)).toBeLessThan(0.34);
    expect(s?.reservedFor).toBeUndefined();
    expect(s).toMatchObject({
      quantity: 0.2,
      owner: 'wren',
      origin: REEDS.source,
    });
    expect(cordPart(s)).toMatchObject({
      role: 'knotted',
      length: 0.3,
      overall: 0.34,
      plies: 2,
      madeBy: 'wren',
    });
    expect(job(w)).toMatchObject({
      status: 'completed',
      completedWork: 3,
      paidEnergy: 1.5,
    });
    expect(w.stacks).toHaveLength(count);
    expect(reed(w)).toBe(before);
    expect(v7Load(w, actor(w))).toBeCloseTo(load, 8);
    // One verified finding; no milestone, pleasure or comfort follows a knot.
    expect(
      w.events.filter(
        (x) => x.type === 'information-confirmed' && x.interface === id,
      ),
    ).toHaveLength(1);
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(events(w, 'satisfaction')).toHaveLength(0);
    expect(JSON.stringify(actor(w).wellbeing.sources)).not.toContain(id);
    for (const x of [r1.world, r2.world, w])
      expect(
        JSON.stringify(
          x.events.filter((e) => e.interface === id).map((e) => e.data),
        ),
      ).not.toMatch(HIDDEN);
    // The same outcome on the same cord width confirms nothing new.
    actor(w).vitals.energy = 40;
    let again = step(w, { wren: mode('untie', { targetId: cord }) }).world;
    again = step(again, { wren: mode('untie', { targetId: cord }) }).world;
    actor(again).vitals.energy = 40;
    for (let i = 0; i < 3; i++)
      again = step(again, { wren: attempt(cord) }).world;
    expect(events(again, 'cord-knot-tied')).toHaveLength(1);
    expect(events(again, 'information-confirmed')).toHaveLength(0);
  });

  it('attempt: measured limits end the paid stage with the actual cord; impossible geometry is refused before costs', () => {
    const w0 = ready();
    // A 12.8 mm cord takes a loop but its end is too short to pass through and pinch.
    const thick = cordId('thick');
    let w = step(w0, { wren: attempt(thick) }).world;
    const r = step(w, { wren: attempt(thick) });
    expect(r.outcomes.wren?.complete).toBe(true);
    expect(spent(w, r.world)).toBeCloseTo(0.5, 6);
    expect(energy(w0) - energy(r.world)).toBeCloseTo(
      energy(w0) - energy(step(step(w0).world).world) + 1,
      6,
    );
    const e = events(r.world, 'cord-knot-infeasible')[0];
    expect(e?.data).toMatchObject({
      outcome: 'end-too-short',
      operation: 'pass-end-through',
      after: { state: 'straight', crossings: 0 },
    });
    expect(e?.data.problem).toMatch(/pinching it needs 0.02 m/);
    expect(item(r.world, thick)?.reservedFor).toBeUndefined();
    expect(cordPart(item(r.world, thick)).role).toBe('cord');
    expect(job(r.world)?.status).toBe('stopped');
    expect(events(r.world, 'information-confirmed')).toHaveLength(1);
    expect(reed(r.world)).toBe(reed(w0));
    // A 19.7 mm cord's tightest loop already leaves no end to hold: the first round measures it.
    const wide = step(w0, { wren: attempt(cordId('wide')) });
    expect(spent(w0, wide.world)).toBeCloseTo(0.5, 6);
    expect(events(wide.world, 'cord-knot-infeasible')[0]?.data).toMatchObject({
      outcome: 'loop-too-large',
      operation: 'lay-bend-loop',
    });
    // An 11.5 mm cord ties but its 0.029 m tails are shorter than the 0.0315 m a crossing needs.
    const slip = cordId('slip');
    w = w0;
    for (let i = 0; i < 3; i++) w = step(w, { wren: attempt(slip) }).world;
    const slipped = events(w, 'cord-knot-slipped')[0];
    expect(slipped?.data).toMatchObject({
      outcome: 'slipped',
      after: { state: 'straight' },
      visual: { completedAppearance: false },
    });
    expect(num(slipped?.data.standingTail)).toBeLessThan(
      num(slipped?.data.tailNeeded),
    );
    expect(cordPart(item(w, slip)).role).toBe('cord');
    expect(job(w)).toMatchObject({ status: 'completed', paidEnergy: 1.5 });
    // A material whose strands take no extra bend forms no loop; the hidden value is not revealed.
    const stiff = v7Clone(w0);
    const r0 = stiff.resources.find((x) => x.id === 'reed');
    if (!r0?.properties) throw new Error('Missing reed fixture.');
    r0.properties.flexibility = 5;
    const none = step(stiff, { wren: attempt(cordId('thin')) });
    expect(spent(stiff, none.world)).toBeCloseTo(0.5, 6);
    const n = events(none.world, 'cord-knot-infeasible')[0];
    expect(n?.data).toMatchObject({ outcome: 'no-loop' });
    expect(n?.data.problem).toMatch(/resisted bending/);
    expect(JSON.stringify(n?.data)).not.toMatch(HIDDEN);
    // Refusals spend nothing.
    unchanged(w0, attempt(cordId('short')), /needs at least 0.2074 m/);
    unchanged(
      w0,
      mode('attempt', { targetId: cordId('thin'), knot: 'square' }),
      /declared choices/,
    );
    unchanged(w0, mode('attempt', { targetId: cordId('thin') }), /knot/);
    unchanged(w0, attempt('reed'), /exact id of your own finished cord/);
    const raw = w0.stacks.find(
      (s) => s.owner === 'wren' && s.resource === 'reed' && !s.processing,
    );
    unchanged(w0, attempt(raw?.id ?? ''), /exact id of your own finished cord/);
    unchanged(
      w0,
      mode('attempt', {
        targetId: cordId('thin'),
        knot: 'overhand',
        trialForce: 5,
      }),
      /Irrelevant argument/,
    );
    unchanged(
      w0,
      mode('attempt', {
        targetId: cordId('thin'),
        knot: 'overhand',
        workId: 'manual-1',
      }),
      /No unfinished knot work/,
    );
    unchanged(
      w0,
      mode('untie', { targetId: cordId('thin') }),
      /no knot to untie/,
    );
    const crowded = v7Clone(w0);
    actor(crowded, 'kai').position = { x: REEDS.at.x + 0.5, y: REEDS.at.y };
    unchanged(crowded, attempt(cordId('thin')), /another person/);
    const tired = v7Clone(w0);
    actor(tired).vitals.energy = 0.4;
    unchanged(tired, attempt(cordId('thin')), /Not enough energy/);
    expect(job(w0)).toBeUndefined();
  });

  it('trial: a bounded two-hand pull through the tied knot records requested and achieved force and time', () => {
    const w0 = tieRounds('thin', 3),
      cord = cordId('thin'),
      k = knotPart(item(w0, cord)),
      c0 = num(cordPart(item(w0, cord)).condition);
    const r = step(w0, { wren: pull(cord) });
    expect(r.outcomes.wren).toMatchObject({ success: true, complete: true });
    expect(spent(w0, r.world)).toBeCloseTo(0.5, 6);
    const e = events(r.world, 'cord-knot-trial')[0];
    expect(e?.data).toMatchObject({
      outcome: 'held',
      law: 'cord-knot@1',
      requestedForce: 10,
      achievedForce: 10,
      requestedDuration: 60,
      heldSeconds: 60,
      knotSlipped: false,
      strandsBroken: 0,
      conditionBefore: c0,
      conditionAfter: c0,
      gripTails: [k.standingTail, k.workingTail],
      fragments: [],
    });
    expect(num(e?.data.freeSpan)).toBeCloseTo(
      num(k.standingTail) + num(k.workingTail) - 0.1 + num(k.knotPath),
      4,
    );
    expect(num(e?.data.elasticExtension)).toBeGreaterThan(0);
    expect(e?.data.visual).toMatchObject([
      { state: 'tied', trial: { outcome: 'held', heldSeconds: 60 } },
    ]);
    expect(events(r.world, 'information-confirmed')).toHaveLength(1);
    expect(knotPart(item(r.world, cord)).trials).toMatchObject([
      { outcome: 'held', achievedForce: 10, heldSeconds: 60 },
    ]);
    expect(item(r.world, cord)?.quantity).toBe(0.2);
    // A weakened hand bounds the force: the achieved, not the requested, force is recorded.
    const weak = v7Clone(w0);
    actor(weak).vitals.health = 4;
    const h = events(
      step(weak, { wren: pull(cord, 10, 30) }).world,
      'cord-knot-trial',
    )[0];
    expect(h?.data).toMatchObject({
      outcome: 'held',
      requestedForce: 10,
      achievedForce: 8,
      handLimit: 8,
      heldSeconds: 30,
    });
    // Refusals spend nothing and apply no force.
    unchanged(w0, pull(cord, 0, 60), /above zero/);
    unchanged(w0, pull(cord, 10, 0), /above zero/);
    unchanged(w0, pull(cord, 11, 60), /trialForce/);
    unchanged(w0, pull(cord, 10, 61), /trialDuration/);
    unchanged(
      w0,
      mode('trial', { targetId: cord, trialForce: 5 }),
      /trialDuration/,
    );
    unchanged(
      w0,
      mode('trial', {
        targetId: cord,
        trialForce: 5,
        trialDuration: 5,
        knot: 'overhand',
      }),
      /Irrelevant argument/,
    );
    unchanged(ready(), pull(cord), /release-checked overhand/);
    // The straight two-hand trial is not applied to a knotted cord.
    unchanged(
      w0,
      cordMode('trial', { targetId: cord, trialForce: 10, trialDuration: 60 }),
      /finished cord or cord fragment/,
    );
    // A 9.9 mm cord ties with 0.048 m tails: no grip clear of the knot, so no force is applied.
    const mid = tieRounds('mid', 3);
    expect(knotPart(item(mid, cordId('mid'))).state).toBe('tied');
    unchanged(mid, pull(cordId('mid')), /each hand needs 0.06 m/);
  });

  it('trial: loads only weaken; a weak knotted cord is damaged or breaks at the knot into two owned fragments', () => {
    const w0 = tieRounds('thin', 3),
      cord = cordId('thin'),
      k = knotPart(item(w0, cord)),
      diameter = num(cordPart(item(w0, cord)).plyDiameter),
      concentration = 1 + num(k.width) / (2 * num(k.lobeRadius));
    // Above half the knotted breaking force the share of strands above it breaks.
    const worn = v7Clone(w0);
    cordPart(item(worn, cord)).condition = 0.25;
    const strength = straightBreak(diameter, 0.25) / concentration;
    const d = step(worn, { wren: pull(cord) }).world;
    const e = events(d, 'cord-knot-trial')[0];
    expect(e?.data).toMatchObject({ outcome: 'held', achievedForce: 10 });
    expect(num(e?.data.strandsBroken)).toBeCloseTo(10 / strength - 0.5, 6);
    expect(num(e?.data.conditionAfter)).toBeCloseTo(
      0.25 * (1 - (10 / strength - 0.5)),
      6,
    );
    expect(events(d, 'cord-knot-damaged')).toHaveLength(1);
    expect(num(cordPart(item(d, cord)).condition)).toBeLessThan(0.25);
    // Below the request the knotted cord breaks at the knot; all fiber stays in two owned fragments.
    const weak = v7Clone(w0);
    cordPart(item(weak, cord)).condition = 0.1;
    const before = reed(weak),
      b = step(weak, { wren: pull(cord) }).world,
      broke = events(b, 'cord-knot-trial')[0],
      at = straightBreak(diameter, 0.1) / concentration;
    expect(at).toBeLessThan(10);
    expect(broke?.data).toMatchObject({
      outcome: 'broke',
      breakAt: 'knot',
      requestedForce: 10,
      achievedForce: Math.round(at * 10) / 10,
      heldSeconds: 0,
      conditionAfter: 0.05,
    });
    expect(item(b, cord)).toBeUndefined();
    const pieces = b.stacks.filter((s) => cordPart(s).fragmentOf === cord);
    expect(pieces.map((s) => s.quantity)).toEqual([0.1, 0.1]);
    expect(reed(b)).toBe(before);
    const ids = pieces.map((s) => s.id);
    for (const s of pieces) {
      expect(s).toMatchObject({ owner: 'wren', origin: REEDS.source });
      expect(cordPart(s)).toMatchObject({
        role: 'fragment',
        status: 'broken',
        fragments: ids,
        overall: 0.17,
      });
      expect(knotPart(s)).toMatchObject({
        state: 'straight',
        knot: null,
        last: 'broke-at-knot',
        fragments: ids,
      });
    }
    expect(events(b, 'cord-knot-broken')[0]?.data.fragments).toEqual(ids);
  });

  it('untie: two paid rounds of 0.5 reverse the crossings and return the same straight cord; a damaged knot resists', () => {
    const w0 = tieRounds('thin', 3),
      cord = cordId('thin');
    const r1 = step(w0, { wren: mode('untie', { targetId: cord }) });
    expect(r1.outcomes.wren?.complete).toBe(false);
    expect(spent(w0, r1.world)).toBeCloseTo(0.5, 6);
    expect(knotPart(item(r1.world, cord))).toMatchObject({
      state: 'loop',
      crossings: 1,
    });
    const r2 = step(r1.world, { wren: mode('untie', { targetId: cord }) });
    expect(r2.outcomes.wren?.complete).toBe(true);
    expect(spent(r1.world, r2.world)).toBeCloseTo(0.5, 6);
    const s = item(r2.world, cord);
    expect(events(r2.world, 'cord-knot-untied')[0]?.target).toBe(cord);
    expect(knotPart(s)).toMatchObject({ state: 'straight', last: 'untied' });
    expect(cordPart(s)).toMatchObject({ role: 'cord', overall: 0.34 });
    expect(s?.reservedFor).toBeUndefined();
    expect(job(r2.world)).toMatchObject({ mode: 'untie', paidEnergy: 1 });
    expect(reed(r2.world)).toBe(reed(w0));
    // The straight cord is again trialled by the unchanged cord package.
    actor(r2.world).vitals.energy = 40;
    const straight = step(r2.world, {
      wren: cordMode('trial', {
        targetId: cord,
        trialForce: 10,
        trialDuration: 60,
      }),
    });
    expect(straight.outcomes.wren?.success).toBe(true);
    // Too many broken strands at the crossings: the paid round finds the knot resists.
    const damaged = v7Clone(w0);
    cordPart(item(damaged, cord)).condition = 0.4;
    const d = step(damaged, { wren: mode('untie', { targetId: cord }) });
    expect(spent(damaged, d.world)).toBeCloseTo(0.5, 6);
    expect(events(d.world, 'cord-knot-resisted')[0]?.data.problem).toMatch(
      /broken/,
    );
    expect(knotPart(item(d.world, cord)).state).toBe('tied');
    expect(item(d.world, cord)?.reservedFor).toBeUndefined();
    expect(job(d.world)?.status).toBe('stopped');
  });

  it('pauses uncharged when not worked, resumes only by workId, cancel leaves the actual configuration and a loose knot needs only dressing', () => {
    const cord = cordId('thin');
    let w = tieRounds('thin', 1);
    const workId = job(w)?.id ?? '';
    w = step(w).world;
    expect(job(w)).toMatchObject({ status: 'paused', paidEnergy: 0.5 });
    expect(events(w, 'cord-knot-paused')[0]?.data).toMatchObject({
      workId,
      nextStage: 'pass-end-through',
    });
    expect(item(w, cord)?.reservedFor).toBe(workId);
    expect(knotPart(item(w, cord)).state).toBe('loop');
    unchanged(w, attempt(cord), /Unfinished knot work/);
    unchanged(
      w,
      mode('attempt', { workId, knot: 'overhand' }),
      /Irrelevant argument/,
    );
    unchanged(w, mode('untie', { workId }), /resume it with mode attempt/);
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.4;
    const low = step(tired, { wren: mode('attempt', { workId }) });
    expect(low.outcomes.wren?.success).toBe(true);
    expect(events(low.world, 'cord-knot-paused')[0]?.data).toMatchObject({
      requiredEnergy: 0.5,
    });
    expect(spent(tired, low.world)).toBeCloseTo(0, 6);
    // An untucked loop springs open when the work is cancelled.
    const c1 = step(w, { wren: mode('cancel') });
    expect(spent(w, c1.world)).toBeCloseTo(0, 6);
    expect(events(c1.world, 'cord-knot-cancelled')[0]?.data).toMatchObject({
      sprangOpen: true,
    });
    expect(knotPart(item(c1.world, cord)).state).toBe('straight');
    expect(cordPart(item(c1.world, cord)).role).toBe('cord');
    expect(job(c1.world)).toMatchObject({ status: 'stopped', paidEnergy: 0.5 });
    // Resuming pays only the next stage.
    const back = step(w, { wren: mode('attempt', { workId }) });
    expect(events(back.world, 'cord-knot-resumed')).toHaveLength(1);
    expect(events(back.world, 'cord-knot-stage')[0]?.data.operation).toBe(
      'pass-end-through',
    );
    expect(spent(w, back.world)).toBeCloseTo(0.5, 6);
    // Cancelled after the tuck, the loose knot stays as it is; nothing is untied or refunded.
    const c2 = step(back.world, { wren: mode('cancel', { workId }) });
    expect(c2.outcomes.wren?.success).toBe(true);
    expect(events(c2.world, 'cord-knot-cancelled')[0]?.data).toMatchObject({
      sprangOpen: false,
    });
    const loose = item(c2.world, cord);
    expect(knotPart(loose)).toMatchObject({ state: 'tucked', crossings: 3 });
    expect(cordPart(loose).role).toBe('knotted');
    expect(loose?.reservedFor).toBeUndefined();
    unchanged(c2.world, mode('cancel'), /No unfinished knot work/);
    unchanged(c2.world, pull(cord), /release-checked overhand/);
    // A new attempt on the loose knot pays only the dressing round.
    actor(c2.world).vitals.energy = 40;
    const dressed = step(c2.world, { wren: attempt(cord) });
    expect(dressed.outcomes.wren?.complete).toBe(true);
    expect(spent(c2.world, dressed.world)).toBeCloseTo(0.5, 6);
    expect(job(dressed.world)).toMatchObject({
      initialWork: 1,
      status: 'completed',
    });
    expect(knotPart(item(dressed.world, cord)).state).toBe('tied');
  });

  it('inspect records visible knot geometry for 0.2 energy and leaves knotted strength unknown', () => {
    const w0 = tieRounds('thin', 3),
      cord = cordId('thin');
    const r = step(w0, { wren: mode('inspect', { targetId: cord }) });
    expect(spent(w0, r.world)).toBeCloseTo(0.2, 6);
    const e = events(r.world, 'cord-knot-inspected')[0];
    expect(e?.data).toMatchObject({
      item: cord,
      role: 'knotted',
      knot: { state: 'tied', crossings: 3, completedAppearance: true },
      knottedBreakingForce: null,
      lastKnotTrial: null,
    });
    expect(e?.data.unknown).toMatch(/knotted breaking force/);
    expect(
      actor(r.world).memory.knowledge?.[`${cord}:cord-knot-geometry`]?.verified,
    ).toBe(false);
    expect(events(r.world, 'information-confirmed')).toHaveLength(0);
    expect(r.world.stacks).toEqual(step(w0).world.stacks);
    unchanged(
      w0,
      mode('inspect', { targetId: cord, workId: 'manual-1' }),
      /exactly one/,
    );
    unchanged(w0, mode('inspect', { workId: 'manual-1' }), /No knot work/);
    // During work the reserved cord is inspected through its workId.
    const working = tieRounds('thin', 1);
    const during = step(working, {
      wren: mode('inspect', { workId: job(working)?.id }),
    });
    expect(events(during.world, 'cord-knot-inspected')[0]?.data).toMatchObject({
      knot: { state: 'loop', completedAppearance: false },
      reserved: true,
    });
  });

  it('a knotted cord wears 0.0005 per round exactly once, and the work stays personal', () => {
    const w0 = tieRounds('thin', 3),
      cord = cordId('thin'),
      other = cordId('mid'),
      c0 = num(cordPart(item(w0, cord)).condition),
      s0 = num(cordPart(item(w0, other)).condition);
    let w = w0;
    for (let i = 0; i < 4; i++) w = step(w).world;
    expect(num(cordPart(item(w, cord)).condition)).toBeCloseTo(
      c0 - 4 * 0.0005,
      8,
    );
    expect(num(cordPart(item(w, other)).condition)).toBeCloseTo(
      s0 - 4 * 0.0005,
      8,
    );
    // Another person cannot resume, inspect, trial, untie or cancel Wren's work or cord.
    const x = tieRounds('mid', 1);
    const workId = job(x)?.id ?? '';
    actor(x, 'kai').mastered.push(id);
    actor(x, 'kai').position = { x: REEDS.at.x - 2, y: REEDS.at.y };
    unchanged(
      x,
      mode('attempt', { workId }),
      /No unfinished knot work of yours/,
      'kai',
    );
    unchanged(x, mode('inspect', { workId }), /No knot work of yours/, 'kai');
    unchanged(x, pull(cord), /your own finished cord/, 'kai');
    unchanged(
      x,
      mode('untie', { targetId: cord }),
      /your own finished cord/,
      'kai',
    );
    unchanged(x, mode('cancel', { workId }), /No unfinished knot work/, 'kai');
  });

  it('stops at death, leaving the cord where the person died once in its actual configuration', () => {
    const pkg = continuousRegistry(ready()).packages.find((p) => p.id === id),
      cord = cordId('thin');
    for (const [rounds, state] of [
      [1, 'straight'],
      [2, 'tucked'],
    ] as const) {
      const w = tieRounds('thin', rounds),
        dead = v7Clone(w);
      pkg?.onDeath?.(dead, actor(dead));
      expect(job(dead)?.status).toBe('stopped');
      expect(events(dead, 'cord-knot-stopped')).toHaveLength(1);
      const s = item(dead, cord);
      expect(s).toMatchObject({
        owner: null,
        position: actor(dead).position,
        quantity: 0.2,
      });
      expect(s?.reservedFor).toBeUndefined();
      expect(knotPart(s).state).toBe(state);
      expect(reed(dead)).toBe(reed(w));
    }
  });
});
