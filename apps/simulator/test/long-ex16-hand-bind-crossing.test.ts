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
vi.setConfig({ testTimeout: 120_000 });

const id = 'hand-bind-crossing';
const CORD = 'hand-twist-fiber-cord';
const KNOT = 'hand-tie-cord-knot';
const JOIN = 'hand-join-fiber-cords';
const WAIT: V7Action = { interface: 'wait', args: {} };
const REEDS = { source: 'forest-reed-0', at: { x: 22.6, y: 5.9 } };
const BRANCHES = { source: 'start-1-branches', at: { x: 20.5, y: 9.7 } };
/** Open dry meadow where two 2 m pieces can lie crossed, far from everyone else. */
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
  w.events.filter((e) => e.type === type);
const bindEvents = (w: V7World) =>
  w.events
    .filter((e) => e.type.startsWith('crossing-binding'))
    .map((e) => e.type);
const mode = (m: string, args: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...args },
});
const attempt = (pieces: string[], cordId: string, crossingAngle = 90) =>
  mode('attempt', { pieceIds: pieces, cordId, crossingAngle });
const test = (
  bindingId: string,
  trialDirection = 'separate',
  trialForce = 10,
  trialDuration = 60,
) => mode('trial', { bindingId, trialForce, trialDuration, trialDirection });
const cordMode = (m: string, args: Record<string, unknown> = {}): V7Action => ({
  interface: CORD,
  args: { mode: m, ...args },
});
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
  paidEnergy: number;
  reached: number;
  binding: string | null;
  pieces: string[];
  cord: string;
  lastStage: string | null;
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
const bindPart = (s?: V7Stack): V7Data =>
  (s?.processing?.crossingBinding ?? {}) as V7Data;
const num = (v: unknown) => (typeof v === 'number' ? v : NaN);
const record = (v: unknown): V7Data =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as V7Data) : {};
const list = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((x) => num(x)) : [];
const energy = (w: V7World, name = 'wren') => actor(w, name).vitals.energy;
/** Energy a step spent beyond what the same round spends while waiting. */
const spent = (from: V7World, to: V7World, name = 'wren') =>
  energy(step(from).world, name) - energy(to, name);
const visibleText = (w: V7World) =>
  JSON.stringify(
    w.events
      .filter(
        (e) =>
          e.type.startsWith('crossing-binding') || e.type === 'trial-result',
      )
      .map((e) => [e.description, e.data]),
  );

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
/** The branch law (2 m, 350 kg/m3 solid, water share 0.5) for one 1.1 mass unit. */
const PIECE = 2 * Math.sqrt((1.1 * 0.5) / 350 / (Math.PI * 2));
/** crossing-contact@1 wrap for two equal pieces at a crossing angle (deg), cord width w, bend limit R. */
function wrapOf(d: number, w: number, angle: number) {
  const beta = (Math.PI - (angle * Math.PI) / 180) / 2,
    a = d / 2 / Math.sin(beta) + w / 2,
    b = d / 2 + w / 2,
    half = (Math.PI / 2) * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  return { wrap: 2 * half + 2 * d, a, b, tight: (b * b) / a };
}
/** Seated and forming need of the binding for a cord of width w (reed bend limit 2.5 w). */
function needOf(d: number, w: number, angle: number) {
  const R = 2.5 * w,
    { wrap } = wrapOf(d, w, angle),
    closure = Math.PI * R + w,
    form = Math.PI * Math.max(R, (0.02 + w) / 2) + w;
  return {
    wrap,
    closure,
    seated: wrap + 2 * closure + 2 * (0.02 + w),
    forming: wrap + 0.04 + 2 * form + 0.04,
  };
}

/** Cords made with the unchanged hand-twist-fiber-cord@1: a matches Wren's two actual 0.2 unit,
 * 0.30 m, 8.1 mm reed cords (0.34 m centrelines); short is a 0.10 m cord. */
const SIZES = { a: [0.2, 0.3], long: [0.2, 0.3], short: [0.2, 0.1] } as const;
type Size = keyof typeof SIZES;
/** No hand-twisted cord can exceed 0.34 m, which no binding of two whole branch units fits, so the
 * success path runs on a fixture cord lengthened in place to 0.60 m with its volume conserved under
 * the fiber-cord@1 law (plies thin as the cord lengthens). */
const LONG = 0.6;
function lengthen(w: V7World, stackId: string) {
  const p = cordPart(item(w, stackId)),
    length = LONG - 0.04;
  p.length = length;
  p.twisted = length;
  p.overall = LONG;
  p.plyDiameter = plyDiameter(0.2, length);
}
const LONG_W = 2 * plyDiameter(0.2, LONG - 0.04);

let cache:
  | {
      unstudied: V7World;
      cords: Record<Size, string>;
      lot: string;
      single: string;
      spare: string;
    }
  | undefined;
/** Wren gathers real reed and makes the fixture cords, then gathers three real branch lots and stands at the site. */
function build() {
  if (cache) return cache;
  const genesis = initialLongWorld('long-ex16', 'long-culture-v2');
  let w = v7Install(genesis, continuousRegistry(genesis), `${CORD}@1`);
  w = v7Install(w, continuousRegistry(w), `${KNOT}@1`);
  w = v7Install(w, continuousRegistry(w), `${JOIN}@1`);
  w = v7Clone(v7Install(w, continuousRegistry(w), `${id}@1`));
  actor(w).position = { ...REEDS.at };
  const g = step(w, {
    wren: { interface: 'gather', args: { target: REEDS.source, quantity: 2 } },
  });
  expect(g.outcomes.wren?.success).toBe(true);
  w = g.world;
  const raw = w.stacks.find(
    (s) => s.owner === 'wren' && s.origin === REEDS.source && !s.processing,
  )?.id;
  if (!raw) throw new Error('Missing gathered fixture reed.');
  w = step(w, { wren: { interface: 'learn', args: { ability: CORD } } }).world;
  for (let i = 0; i < 2; i++) w = step(w).world;
  expect(actor(w).mastered).toContain(CORD);
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
  lengthen(w, cords.long ?? '');
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
/** The fixture world after Wren studied the binding for four paid rounds. */
function ready() {
  if (!studied) {
    let w = step(build().unstudied, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    for (let i = 0; i < 3; i++) w = step(w).world;
    expect(actor(w).mastered).toContain(id);
    actor(w).position = { ...SITE };
    actor(w).vitals.energy = 40;
    studied = w;
  }
  return v7Clone(studied);
}
const cordId = (name: Size) => build().cords[name];
/** The two single-unit lots, the first on top, with the lengthened cord. */
const longAttempt = (angle = 90) =>
  attempt([build().single, build().spare], cordId('long'), angle);
function rounds(n: number, action = longAttempt(), from = ready()) {
  let w = from;
  for (let i = 0; i < n; i++) w = step(w, { wren: action }).world;
  actor(w).vitals.energy = 40;
  return w;
}
let boundCache: V7World | undefined;
/** Two whole branch units bound by four paid rounds with the lengthened cord. */
function bound() {
  boundCache ??= rounds(4);
  return v7Clone(boundCache);
}
const bindingOf = (w: V7World) => String(job(w)?.binding);
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

describe('hand-bound two-piece crossing in ex16', () => {
  it('is scoped to ex16 after the three cord packages, needs four study rounds at 0.2 energy and fits the frozen size limit', () => {
    const other = initialLongWorld('long-ex15', 'long-culture');
    expect(() =>
      v7Install(other, continuousRegistry(other), `${id}@1`),
    ).toThrow();
    let bare = initialLongWorld('long-ex16', 'long-culture-v2');
    for (const dep of [CORD, KNOT, JOIN]) {
      expect(() =>
        v7Install(bare, continuousRegistry(bare), `${id}@1`),
      ).toThrow(/dependency/);
      bare = v7Install(bare, continuousRegistry(bare), `${dep}@1`);
    }
    const w = v7Clone(build().unstudied);
    const ability = w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(4);
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
    expect(text).not.toMatch(HIDDEN);
    expect(pkg?.satisfaction).toEqual([]);
    expect(pkg?.visualComponents).toEqual([]);
    expect(
      pkg?.visualComponents.every(
        (c) => typeof CONTINUOUS_VISUALS[c] === 'function',
      ),
    ).toBe(true);
    // The reused packages keep their abilities.
    for (const reused of [CORD, KNOT, JOIN])
      expect(w.abilities.find((a) => a.id === reused)?.revision).toBe(
        `${reused}@1`,
      );
    actor(w).position = { ...SITE };
    const early = step(w, {
      wren: attempt([build().lot, build().lot], cordId('a')),
    });
    expect(early.outcomes.wren?.reason).toMatch(/not mastered/);
    expect(actor(early.world).vitals).toEqual(actor(step(w).world).vitals);
    // Each of the four study rounds is paid individually; no cord ability is a prerequisite.
    let x = step(w, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(spent(w, x)).toBeCloseTo(0.2, 6);
    for (let i = 0; i < 3; i++) {
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
    // Learning alone creates no object, item or binding event.
    expect(bindEvents(x)).toEqual([]);
    expect(x.stacks.length).toBe(w.stacks.length);
  });

  it("attempt: Wren's actual 0.34 m cord cannot bind two whole branch units; the paid first round measures the shortfall", () => {
    const w0 = ready(),
      { lot } = build(),
      a = cordId('a'),
      reed = units(w0, 'reed'),
      branch = units(w0, 'branch'),
      count = w0.stacks.length;
    expect(cordPart(item(w0, a)).overall).toBe(0.34);
    expect(item(w0, lot)?.quantity).toBe(2);
    // A lot of two whole units may be named twice; the most favourable crossing angle is still too short.
    for (const angle of [90, 30]) {
      const r = step(w0, { wren: attempt([lot, lot], a, angle) }),
        w = r.world;
      expect(r.outcomes.wren?.success).toBe(true);
      expect(spent(w0, w)).toBeCloseTo(0.5, 6);
      expect(bindEvents(w)).toEqual([
        'crossing-binding-started',
        'crossing-binding-shortfall',
      ]);
      const e = events(w, 'crossing-binding-shortfall')[0],
        measured = record(e?.data.measured),
        W = 2 * plyDiameter(0.2, 0.3),
        need = needOf(PIECE, W, angle);
      expect(e?.data.outcome).toBe('too-short');
      expect(e?.data.measuredShortfall).toBe(true);
      expect(e?.data.operation).toBe('measure-position');
      expect(list(measured.pieceDiameters)[0]).toBeCloseTo(PIECE, 4);
      expect(list(measured.pieceLengths)).toEqual([2, 2]);
      expect(num(measured.width)).toBeCloseTo(W, 4);
      expect(num(measured.bendLimit)).toBeCloseTo(2.5 * W, 4);
      expect(num(measured.wrap)).toBeCloseTo(need.wrap, 3);
      expect(num(measured.closurePath)).toBeCloseTo(need.closure, 3);
      expect(num(measured.need)).toBeCloseTo(
        Math.max(need.seated, need.forming),
        3,
      );
      expect(num(measured.need)).toBeGreaterThan(0.34);
      expect(measured.fits).toBe(false);
      expect(e?.data.problem).toMatch(/the cord is 0.34 m/);
      // Nothing was bound; the lot gave up one whole unit as a separate conserved piece.
      const j = job(w);
      expect(j?.status).toBe('stopped');
      expect(j?.completedWork).toBe(1);
      expect(w.stacks.length).toBe(count + 1);
      expect(units(w, 'reed')).toBe(reed);
      expect(units(w, 'branch')).toBe(branch);
      for (const s of [lot, ...(j?.pieces ?? [])]) {
        expect(item(w, s)).toMatchObject({ owner: 'wren', quantity: 1 });
        expect(item(w, s)?.reservedFor).toBeUndefined();
        expect(item(w, s)?.processing).toBeUndefined();
      }
      const cord = item(w, a);
      expect(cord?.reservedFor).toBeUndefined();
      expect(cordPart(cord).role).toBe('cord');
      expect(cordPart(cord).overall).toBe(0.34);
      expect(bindPart(cord)).toMatchObject({
        state: 'separate',
        last: 'infeasible-too-short',
      });
      // A verified finding keyed by the functional observation.
      const keys = Object.keys(actor(w).memory.knowledge ?? {}).filter((k) =>
        k.startsWith('crossing-wrap-fit:reed-8.1mm:branch-31.6-31.6mm'),
      );
      expect(keys).toEqual([
        'crossing-wrap-fit:reed-8.1mm:branch-31.6-31.6mm:shortfall-too-short',
      ]);
      expect(visibleText(w)).not.toMatch(HIDDEN);
      expect(CULTURE_EXCLUDED_WORDS.test(visibleText(w))).toBe(false);
      expect(ALSO_EXCLUDED.test(visibleText(w))).toBe(false);
      expect(events(w, 'satisfaction')).toHaveLength(0);
    }
  });

  it('attempt: impossible, unsupported or unavailable inputs are refused before costs', () => {
    const w = ready(),
      { lot, single, spare } = build(),
      a = cordId('a');
    unchanged(
      w,
      mode('attempt', { pieceIds: [single], cordId: a, crossingAngle: 90 }),
      /exact ids of two/,
    );
    unchanged(w, attempt([single, single], a), /cannot be named 2 time/);
    unchanged(w, attempt([single, 'branch'], a), /exact ids of your own/);
    unchanged(
      w,
      mode('attempt', { pieceIds: [single, spare], cordId: a }),
      /crossingAngle/,
    );
    unchanged(w, attempt([single, spare], a, 20), /crossingAngle/);
    unchanged(
      w,
      mode('attempt', {
        pieceIds: [single, spare],
        cordId: a,
        crossingAngle: 90,
        trialForce: 5,
      }),
      /Irrelevant argument/,
    );
    unchanged(
      w,
      mode('attempt', {
        pieceIds: [single, spare],
        cordId: a,
        crossingAngle: 90,
        workId: 'manual-1',
      }),
      /No unfinished binding work/,
    );
    // Only branch has a rigid-piece law; a reed lot is no piece and a branch is no cord.
    const reed = w.stacks.find(
      (s) => s.owner === 'wren' && s.resource === 'reed' && !s.processing,
    );
    unchanged(w, attempt([single, reed?.id ?? ''], a), /Unsupported material/);
    unchanged(w, attempt([single, spare], lot), /finished cord/);
    // A cord too short for any wrap and closure of its width is visible before costs.
    unchanged(w, attempt([single, spare], cordId('short')), /at least/);
    // Treated or recovered pieces, knotted, joined or reserved cords.
    const treated = v7Clone(w);
    const sp = item(treated, spare);
    if (sp)
      sp.processing = {
        branchScreenPart: { structure: 'screen-x', condition: 0.8 },
      };
    unchanged(treated, attempt([single, spare], a), /treated, recovered/);
    const knotted = v7Clone(w);
    const kc = cordPart(item(knotted, a));
    kc.role = 'knotted';
    unchanged(knotted, attempt([single, spare], a), /overhand knot/);
    const joined = v7Clone(w);
    cordPart(item(joined, a)).role = 'joined';
    unchanged(joined, attempt([single, spare], a), /part of a join/);
    const reserved = v7Clone(w);
    const rc = item(reserved, a);
    if (rc) rc.reservedFor = 'manual-x';
    unchanged(reserved, attempt([single, spare], a), /reserved by other work/);
    // Room: another person in the work circle, standing in water, no clear ground, low energy.
    const crowded = v7Clone(w);
    actor(crowded, 'kai').position = { x: SITE.x + 1, y: SITE.y };
    unchanged(crowded, attempt([single, spare], a), /work circle/);
    const wet = v7Clone(w);
    actor(wet).position = { x: 27.5, y: 12.5 };
    unchanged(wet, attempt([single, spare], a), /water/);
    const blocked = v7Clone(w);
    // In the world's corner every tried direction leaves the world.
    actor(blocked).position = { x: 0.6, y: 0.6 };
    unchanged(blocked, attempt([single, spare], a), /every tried direction/);
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.3;
    unchanged(tired, attempt([single, spare], a), /Not enough energy/);
    // Another person's pieces and cord are not theirs to use.
    const kai = v7Clone(w);
    actor(kai, 'kai').mastered.push(id);
    actor(kai, 'kai').position = { ...SITE };
    actor(kai).position = { x: SITE.x - 3, y: SITE.y };
    unchanged(
      kai,
      attempt([single, spare], cordId('long')),
      /exact ids of your own/,
      'kai',
    );
  });

  it('attempt: four paid rounds of 0.5 bind two whole branch units with a long enough cord into a relation of the three conserved items', () => {
    const w0 = ready(),
      { single, spare } = build(),
      c = cordId('long'),
      reed = units(w0, 'reed'),
      branch = units(w0, 'branch'),
      count = w0.stacks.length,
      need = needOf(PIECE, LONG_W, 90);
    expect(cordPart(item(w0, c)).overall).toBe(LONG);
    expect(LONG).toBeGreaterThan(Math.max(need.seated, need.forming));
    const types = [
      'crossing-binding-stage',
      'crossing-binding-wrap-routed',
      'crossing-binding-closure-tucked',
      'crossing-binding-release-held',
    ];
    const states = ['positioned', 'wrapped', 'tucked', 'bound'];
    let w = w0;
    for (let i = 0; i < 4; i++) {
      const before = w,
        r = step(w, { wren: longAttempt() });
      w = r.world;
      expect(r.outcomes.wren?.success).toBe(true);
      expect(spent(before, w)).toBeCloseTo(0.5, 6);
      expect(events(w, types[i] ?? '')).toHaveLength(1);
      const e = events(w, types[i] ?? '')[0],
        visual = record(e?.data.after);
      expect(e?.data.stageCompleted).toBe(true);
      expect(visual.state).toBe(states[i]);
      expect(visual.schematic).toBe(true);
      // No completed appearance before the passed release check.
      expect(visual.completedAppearance).toBe(i === 3);
      const cord = item(w, c);
      expect(bindPart(cord).state).toBe(states[i]);
      expect(cordPart(cord).role).toBe(i >= 2 ? 'bound' : 'cord');
      expect(job(w)?.reached).toBe(i + 1);
      // The items stay owned and conserved; the bound action continues each round.
      expect(units(w, 'reed')).toBe(reed);
      expect(units(w, 'branch')).toBe(branch);
      expect(w.stacks.length).toBe(count);
      actor(w).vitals.energy = 40;
    }
    const j = job(w),
      bindingId = String(j?.binding),
      cord = item(w, c);
    expect(j?.status).toBe('completed');
    expect(j?.completedWork).toBe(4);
    expect(j?.paidEnergy).toBeCloseTo(2, 6);
    // Single-unit lots are reserved in place and keep their ids.
    expect(j?.pieces).toEqual([single, spare]);
    for (const s of [single, spare, c])
      expect(item(w, s)).toMatchObject({
        owner: 'wren',
        reservedFor: bindingId,
      });
    expect(bindPart(item(w, single))).toMatchObject({
      bindingId,
      part: 'top',
      partner: spare,
      cord: c,
    });
    expect(bindPart(item(w, spare))).toMatchObject({ part: 'bottom' });
    const k = bindPart(cord),
      g = record(k.geometry);
    expect(k).toMatchObject({
      bindingId,
      state: 'bound',
      pretension: 5,
      last: 'release-held',
      pieces: [single, spare],
    });
    expect(num(g.wrap)).toBeCloseTo(need.wrap, 3);
    expect(num(g.closurePath)).toBeCloseTo(need.closure, 3);
    // The centreline ledger closes: two tails + two closure ends + the wrap.
    const e = events(w, 'crossing-binding-release-held')[0],
      tails = list(record(record(e?.data.after).cord).tails);
    expect(
      (tails[0] ?? 0) + (tails[1] ?? 0) + 2 * num(g.closurePath) + num(g.wrap),
    ).toBeCloseTo(LONG, 6);
    expect(tails[0]).toBeCloseTo((LONG - need.wrap - 2 * need.closure) / 2, 3);
    expect(e?.data.qualified).toBeUndefined();
    expect(e?.data.closureSlipLoad).toBeGreaterThan(5);
    expect(String(e?.description)).toMatch(/untested/);
    expect(String(e?.description)).toMatch(/no shelter/);
    const visual = record(e?.data.visual);
    expect(visual.status).toBe('bound-untested');
    expect(visual.reuses).toEqual(['fiber-cord', 'cord-knot']);
    expect(record(visual.crossing).point).toEqual(SITE);
    // Other cord operations are kept off the bound cord.
    unchanged(
      w,
      cordMode('trial', {
        targetId: c,
        trialForce: 2,
        trialDuration: 10,
      }),
      /finished cord or cord fragment/,
    );
    unchanged(
      w,
      { interface: 'drop', args: { target: single, quantity: 1 } },
      /reserved|unavailable/,
    );
    expect(events(w, 'satisfaction')).toHaveLength(0);
    expect(visibleText(w)).not.toMatch(HIDDEN);
    expect(CULTURE_EXCLUDED_WORDS.test(visibleText(w))).toBe(false);
    expect(ALSO_EXCLUDED.test(visibleText(w))).toBe(false);
  });

  it('trial: a bounded opposed-hand test records requested and achieved force and time; separate holds, slide slips at the friction load', () => {
    const w0 = bound(),
      bindingId = bindingOf(w0),
      c = cordId('long'),
      g = record(bindPart(item(w0, c)).geometry),
      top = list(g.contact)[0] ?? 0;
    // separate: the 5 N wrap tension clamps the pieces, so 10 N leaves them in contact.
    let r = step(w0, { wren: test(bindingId, 'separate', 10, 60) });
    let w = r.world;
    expect(spent(w0, w)).toBeCloseTo(0.5, 6);
    let e = events(w, 'crossing-binding-trial')[0];
    expect(e?.data).toMatchObject({
      direction: 'separate',
      outcome: 'held',
      requestedForce: 10,
      achievedForce: 10,
      requestedDuration: 60,
      heldSeconds: 60,
      wrapTension: 5,
      clampingForce: 0,
      separationGap: 0,
      stoppedBy: 'the requested time',
    });
    expect(record(e?.data).forceRecord).toEqual([
      { seconds: 0, force: 0 },
      { seconds: 0, force: 10 },
      { seconds: 60, force: 10 },
      { seconds: 60, force: 0 },
    ]);
    const sites = (e?.data.gripSites ?? []) as V7Data[];
    expect(sites.map((s) => s.piece)).toEqual([build().single, build().spare]);
    expect(num(sites[0]?.fromCrossing)).toBeGreaterThan(PIECE / 2);
    expect(record(e?.data.visual).status).toBe('held-at-recorded-load');
    expect(bindPart(item(w, c)).state).toBe('bound');
    // slide: the wrap slides on the top piece at friction 0.3 x 5 N x its contact angle there.
    const slipLoad = 0.3 * 5 * top;
    expect(slipLoad).toBeGreaterThan(2);
    expect(slipLoad).toBeLessThan(10);
    r = step(w0, { wren: test(bindingId, 'slide', 10, 30) });
    w = r.world;
    e = events(w, 'crossing-binding-trial')[0];
    expect(e?.data.outcome).toBe('crossing-slipped');
    expect(num(e?.data.achievedForce)).toBeCloseTo(slipLoad, 1);
    expect(e?.data.heldSeconds).toBe(0);
    expect(e?.data.stoppedBy).toBe('slip');
    expect(events(w, 'crossing-binding-crossing-slipped')).toHaveLength(1);
    const k = bindPart(item(w, c));
    expect(k.state).toBe('bound');
    expect(num(k.crossingShift)).toBeCloseTo(LONG_W, 4);
    expect(record(e?.data.visual).status).toBe('slipped-at-recorded-load');
    expect(visibleText(w)).not.toMatch(HIDDEN);
    expect(CULTURE_EXCLUDED_WORDS.test(visibleText(w))).toBe(false);
    expect(ALSO_EXCLUDED.test(visibleText(w))).toBe(false);
    r = step(w0, { wren: test(bindingId, 'slide', 2, 30) });
    expect(events(r.world, 'crossing-binding-trial')[0]?.data.outcome).toBe(
      'held',
    );
    // A hand weakened by health limits the achieved force.
    const weak = v7Clone(w0);
    actor(weak).vitals.health = 3;
    r = step(weak, { wren: test(bindingId, 'separate', 10, 10) });
    e = events(r.world, 'crossing-binding-trial')[0];
    expect(e?.data).toMatchObject({ achievedForce: 6, handLimit: 6 });
    // Verified findings name the functional observation, not the ability.
    expect(
      Object.keys(actor(w).memory.knowledge ?? {}).some((k) =>
        k.startsWith('crossing-hand-load-slide:reed-'),
      ),
    ).toBe(true);
    // Refused before costs: unsupported direction, unbounded force or time.
    unchanged(w0, test(bindingId, 'twist'), /trialDirection|supported/);
    unchanged(w0, test(bindingId, 'separate', 0, 10), /above zero/);
    unchanged(w0, test(bindingId, 'separate', 11, 10), /trialForce/);
    unchanged(w0, test(bindingId, 'separate', 5, 61), /trialDuration/);
    unchanged(w0, test('binding-x'), /exact id of a binding/);
  });

  it('trial and wear: loads only weaken; a worn cord takes damage, and one too weak for its own wrap tension parts into conserved fragments', () => {
    const w0 = bound(),
      bindingId = bindingOf(w0),
      c = cordId('long'),
      { single, spare } = build(),
      reed = units(w0, 'reed');
    // Damage: a worn cord loaded above half its breaking force loses that share of strands.
    const worn = v7Clone(w0);
    cordPart(item(worn, c)).condition = 0.22;
    let r = step(worn, { wren: test(bindingId, 'separate', 1, 10) });
    const e = events(r.world, 'crossing-binding-trial')[0];
    expect(e?.data.outcome).toBe('held');
    expect(num(e?.data.strandsBroken)).toBeGreaterThan(0);
    expect(num(e?.data.conditionAfter)).toBeLessThan(0.22);
    expect(events(r.world, 'crossing-binding-damaged')).toHaveLength(1);
    // A cord too weak for the 5 N wrap tension parts in place between rounds.
    const weak = v7Clone(w0);
    cordPart(item(weak, c)).condition = 0.1;
    r = step(weak);
    const w = r.world;
    expect(events(w, 'crossing-binding-broken')).toHaveLength(1);
    expect(item(w, c)).toBeUndefined();
    const fragments = w.stacks.filter(
      (s) => cordPart(s).fragmentOf === c && cordPart(s).role === 'fragment',
    );
    expect(fragments).toHaveLength(2);
    expect(
      fragments.reduce((n, s) => n + num(cordPart(s).overall), 0),
    ).toBeCloseTo(LONG, 6);
    expect(fragments.reduce((n, s) => n + tenths(s.quantity), 0)).toBe(2);
    expect(units(w, 'reed')).toBe(reed);
    for (const s of fragments) {
      expect(s).toMatchObject({ owner: 'wren', origin: REEDS.source });
      expect(s.reservedFor).toBeUndefined();
      expect(bindPart(s)).toMatchObject({
        state: 'separate',
        last: 'broke-in-binding',
        priorRole: 'fragment',
      });
    }
    for (const s of [single, spare]) {
      expect(item(w, s)?.reservedFor).toBeUndefined();
      expect(item(w, s)?.processing).toBeUndefined();
    }
  });

  it('untie: two paid rounds of 0.5 free the same three items; a damaged closure resists', () => {
    const w0 = bound(),
      bindingId = bindingOf(w0),
      c = cordId('long'),
      { single, spare } = build(),
      count = w0.stacks.length;
    let w = step(w0, { wren: mode('untie', { bindingId }) }).world;
    expect(spent(w0, w)).toBeCloseTo(0.5, 6);
    expect(bindPart(item(w, c)).state).toBe('wrapped');
    expect(cordPart(item(w, c)).role).toBe('cord');
    const mid = w;
    w = step(w, { wren: mode('untie', { bindingId }) }).world;
    expect(spent(mid, w)).toBeCloseTo(0.5, 6);
    expect(events(w, 'crossing-binding-untied')).toHaveLength(1);
    expect(job(w)?.status).toBe('completed');
    for (const s of [single, spare]) {
      expect(item(w, s)?.reservedFor).toBeUndefined();
      expect(item(w, s)?.processing).toBeUndefined();
      expect(item(w, s)?.quantity).toBe(1);
    }
    expect(item(w, c)?.reservedFor).toBeUndefined();
    expect(cordPart(item(w, c))).toMatchObject({ role: 'cord', overall: LONG });
    expect(bindPart(item(w, c))).toMatchObject({
      state: 'separate',
      last: 'untied',
      bindingId: null,
    });
    expect(w.stacks.length).toBe(count);
    // An open wrap held only by hand falls open when the untying is not worked.
    let x = step(mid).world;
    expect(events(x, 'crossing-binding-relaxed')).toHaveLength(1);
    expect(item(x, c)?.reservedFor).toBeUndefined();
    expect(bindPart(item(x, c)).last).toBe('untied-wrap-fell-open');
    // Too many broken strands at the closure: the paid round finds it resists.
    const damaged = v7Clone(w0);
    cordPart(item(damaged, c)).condition = 0.4;
    x = step(damaged, { wren: mode('untie', { bindingId }) }).world;
    expect(spent(damaged, x)).toBeCloseTo(0.5, 6);
    expect(events(x, 'crossing-binding-resisted')).toHaveLength(1);
    expect(item(x, c)?.reservedFor).toBe(bindingId);
    expect(bindPart(item(x, c))).toMatchObject({
      state: 'bound',
      last: 'damaged',
    });
    // Tails too short to pinch are visible before costs.
    const short = v7Clone(w0);
    const g = record(bindPart(item(short, c)).geometry);
    g.centreline = num(g.wrap) + 2 * num(g.closurePath) + 0.03;
    unchanged(short, mode('untie', { bindingId }), /pinch/);
  });

  it('pauses uncharged and relaxes a hand-held wrap, resumes only by workId, and cancel keeps a tucked closure as a loose binding', () => {
    const { single, spare } = build(),
      c = cordId('long');
    // After routing, an unworked round pauses: the hand-held wrap falls loose and routing is redone.
    const w2 = rounds(2);
    const w = step(w2).world;
    expect(spent(w2, w)).toBeCloseTo(0, 6);
    expect(job(w)?.status).toBe('paused');
    expect(job(w)?.reached).toBe(1);
    expect(events(w, 'crossing-binding-paused')).toHaveLength(1);
    expect(events(w, 'crossing-binding-relaxed')).toHaveLength(1);
    expect(bindPart(item(w, c)).state).toBe('positioned');
    unchanged(w, longAttempt(), /Unfinished binding work exists/);
    const workId = job(w)?.id ?? '';
    let x = step(w, { wren: mode('attempt', { workId }) }).world;
    expect(spent(w, x)).toBeCloseTo(0.5, 6);
    expect(events(x, 'crossing-binding-resumed')).toHaveLength(1);
    expect(events(x, 'crossing-binding-wrap-routed')).toHaveLength(1);
    expect(job(x)).toMatchObject({ completedWork: 3, reached: 2 });
    // Carried away from where they were laid, the crossed pieces must be positioned again.
    const moved = v7Clone(w);
    actor(moved).position = { x: SITE.x + 0.5, y: SITE.y + 0.5 };
    x = step(moved, { wren: mode('attempt', { workId }) }).world;
    expect(events(x, 'crossing-binding-relaxed')).toHaveLength(1);
    expect(job(x)).toMatchObject({ reached: 1, lastStage: 'measure-position' });
    // Low energy pauses before charging.
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.3;
    x = step(tired, { wren: mode('attempt', { workId }) }).world;
    expect(job(x)?.status).toBe('paused');
    expect(job(x)?.completedWork).toBe(2);
    // Cancel while the wrap is held by hand frees everything once.
    x = step(w2, { wren: mode('cancel', { workId: job(w2)?.id }) }).world;
    expect(spent(w2, x)).toBeCloseTo(0, 6);
    expect(events(x, 'crossing-binding-cancelled')[0]?.data.retained).toBe(
      false,
    );
    for (const s of [single, spare, c])
      expect(item(x, s)?.reservedFor).toBeUndefined();
    // Cancel after the closure is tucked keeps a loose binding; one dressing round completes it.
    const w3 = rounds(3);
    x = step(w3, { wren: mode('cancel', {}) }).world;
    const loose = String(job(w3)?.binding);
    expect(events(x, 'crossing-binding-cancelled')[0]?.data.retained).toBe(
      true,
    );
    for (const s of [single, spare, c])
      expect(item(x, s)?.reservedFor).toBe(loose);
    expect(bindPart(item(x, c)).state).toBe('tucked');
    unchanged(x, test(loose), /dressed, release-checked/);
    unchanged(
      x,
      attempt([single, spare], cordId('a')),
      /reserved by other work/,
    );
    const y = step(x, {
      wren: mode('attempt', { pieceIds: [single, spare], cordId: c }),
    }).world;
    expect(spent(x, y)).toBeCloseTo(0.5, 6);
    expect(job(y)).toMatchObject({ status: 'completed', completedWork: 1 });
    expect(events(y, 'crossing-binding-release-held')).toHaveLength(1);
    expect(bindPart(item(y, c))).toMatchObject({
      state: 'bound',
      bindingId: loose,
    });
  });

  it('inspect records visible binding geometry for 0.2 energy and leaves holding force unknown', () => {
    const w0 = bound(),
      bindingId = bindingOf(w0),
      c = cordId('long');
    const w = step(w0, { wren: mode('inspect', { bindingId }) }).world;
    expect(spent(w0, w)).toBeCloseTo(0.2, 6);
    const e = events(w, 'crossing-binding-inspected')[0];
    expect(e?.data).toMatchObject({
      bindingId,
      holdingForce: null,
      displacement: 0,
      visibleRetention: 'snug round the crossing',
    });
    expect(record(e?.data.ledger).centreline).toBe(LONG);
    expect(w.stacks).toEqual(step(w0).world.stacks);
    expect(
      actor(w).memory.knowledge?.[`${bindingId}:crossing-binding-geometry`]
        ?.verified,
    ).toBe(false);
    unchanged(
      w0,
      mode('inspect', { bindingId, workId: 'x' }),
      /exactly one of/,
    );
    expect(bindPart(item(w, c)).state).toBe('bound');
  });

  it('a bound cord wears 0.0005 per round exactly once, carrying hangs the bottom piece in the wrap, and the work and binding stay personal', () => {
    const w0 = bound(),
      bindingId = bindingOf(w0),
      c = cordId('long'),
      a = cordId('a'),
      before = [c, a].map((s) => num(cordPart(item(w0, s)).condition));
    let w = w0;
    for (let i = 0; i < 4; i++) w = step(w).world;
    [c, a].forEach((s, i) => {
      expect(num(cordPart(item(w, s)).condition)).toBeCloseTo(
        (before[i] ?? 0) - 4 * 0.0005,
        8,
      );
    });
    // Carried each round, the 1.1 mass bottom piece hangs in the wrap: creep slackens it.
    w = v7Clone(w0);
    let carried = 0;
    while (bindPart(item(w, c)).state === 'bound' && carried < 30) {
      actor(w).position = {
        x: SITE.x + (carried % 2 ? 0 : 0.3),
        y: SITE.y,
      };
      w = step(w).world;
      carried++;
    }
    expect(carried).toBeGreaterThan(2);
    expect(carried).toBeLessThan(30);
    const k = bindPart(item(w, c));
    expect(k).toMatchObject({ state: 'tucked', last: 'loosened-by-creep' });
    expect(num(k.slack)).toBeGreaterThan(0);
    expect(cordPart(item(w, c)).overall).toBeCloseTo(LONG + num(k.slack), 6);
    expect(events(w, 'crossing-binding-loosened')).toHaveLength(1);
    expect(item(w, c)?.reservedFor).toBe(bindingId);
    // Another person cannot resume, inspect or cancel Wren's work, nor test, untie or inspect her binding.
    const x = rounds(1);
    const workId = job(x)?.id ?? '';
    actor(x, 'kai').mastered.push(id);
    actor(x, 'kai').position = { x: SITE.x - 3, y: SITE.y };
    unchanged(
      x,
      mode('attempt', { workId }),
      /No unfinished binding work of yours/,
      'kai',
    );
    unchanged(
      x,
      mode('inspect', { workId }),
      /No binding work of yours/,
      'kai',
    );
    unchanged(
      x,
      mode('cancel', { workId }),
      /No unfinished binding work/,
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
      unchanged(y, action, /exact id of a binding of your own/, 'kai');
  });

  it('stops at death, leaving the pieces and cord where the person died once in their actual configuration', () => {
    const pkg = continuousRegistry(ready()).packages.find((p) => p.id === id),
      { single, spare } = build(),
      c = cordId('long');
    for (const [n, state, retained] of [
      [1, 'separate', false],
      [2, 'separate', false],
      [3, 'tucked', true],
    ] as const) {
      const w = rounds(n),
        dead = v7Clone(w),
        bindingId = String(job(w)?.binding);
      pkg?.onDeath?.(dead, actor(dead));
      expect(job(dead)?.status).toBe('stopped');
      expect(events(dead, 'crossing-binding-stopped')).toHaveLength(1);
      expect(events(dead, 'crossing-binding-relaxed')).toHaveLength(
        n === 2 ? 1 : 0,
      );
      for (const s of [single, spare, c]) {
        expect(item(dead, s)).toMatchObject({
          owner: null,
          position: actor(dead).position,
        });
        expect(item(dead, s)?.reservedFor).toBe(
          retained ? bindingId : undefined,
        );
      }
      expect(bindPart(item(dead, c)).state).toBe(state);
      expect(units(dead, 'branch')).toBe(units(w, 'branch'));
      expect(units(dead, 'reed')).toBe(units(w, 'reed'));
    }
  });
});
