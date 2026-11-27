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

const id = 'hand-lash-crossing';
const CORD = 'hand-twist-fiber-cord';
const KNOT = 'hand-tie-cord-knot';
const JOIN = 'hand-join-fiber-cords';
const BIND = 'hand-bind-crossing';
const SECTIONED = 'hand-twist-sectioned-cord';
const DEPENDENCIES = [CORD, KNOT, JOIN, BIND];
const WAIT: V7Action = { interface: 'wait', args: {} };
const REEDS = { source: 'forest-reed-0', at: { x: 22.6, y: 5.9 } };
const BRANCHES = { source: 'start-1-branches', at: { x: 20.5, y: 9.7 } };
/** Open dry meadow of the ex16 crossing-binding fixtures, far from everyone else. */
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
  w.events.filter((e) => e.type === `crossing-lashing-${type}`);
const lashEvents = (w: V7World) =>
  w.events
    .filter((e) => e.type.startsWith('crossing-lashing-'))
    .map((e) => e.type.replace('crossing-lashing-', ''));
const mode = (m: string, args: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...args },
});
const attempt = (
  pieces: string[],
  cordId: string,
  wrapCount = 2,
  crossingAngle = 90,
) => mode('attempt', { pieceIds: pieces, cordId, crossingAngle, wrapCount });
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
  turns: number;
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
const lashPart = (s?: V7Stack): V7Data =>
  (s?.processing?.crossingLashing ?? {}) as V7Data;
const num = (v: unknown) => (typeof v === 'number' ? v : NaN);
const asText = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
const record = (v: unknown): V7Data =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as V7Data) : {};
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
          e.type.startsWith('crossing-lashing-') || e.type === 'trial-result',
      )
      .map((e) => [e.description, e.data]),
  );
const clean = (w: V7World) => {
  expect(visibleText(w)).not.toMatch(HIDDEN);
  expect(CULTURE_EXCLUDED_WORDS.test(visibleText(w))).toBe(false);
  expect(ALSO_EXCLUDED.test(visibleText(w))).toBe(false);
  expect(w.events.filter((e) => e.type === 'satisfaction')).toHaveLength(0);
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
/** The branch law (2 m, 350 kg/m3 solid, water share 0.5) for one 1.1 mass unit. */
const PIECE = 2 * Math.sqrt((1.1 * 0.5) / 350 / (Math.PI * 2));
/** crossing-contact@1's single wrap for two equal pieces (Ramanujan halves plus two sides). */
function singleWrap(d: number, w: number, angle: number) {
  const beta = (Math.PI - (angle * Math.PI) / 180) / 2,
    a = d / 2 / Math.sin(beta) + w / 2,
    b = d / 2 + w / 2,
    half = (Math.PI / 2) * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
  return { wrap: 2 * half + 2 * d, beta };
}

/** Real cords: long (0.60 m twisted, 0.64 m overall) and wren (0.50 m, 0.54 m overall, the size of
 * Wren's actual item-303-wren-3473) from hand-twist-sectioned-cord@1, short (0.10 m) from
 * hand-twist-fiber-cord@1, all 0.2 unit; four is a further 0.64 m cord lengthened in place below. */
const SIZES = {
  long: [0.2, 0.6],
  wren: [0.2, 0.5],
  short: [0.2, 0.1],
  four: [0.2, 0.6],
} as const;
type Size = keyof typeof SIZES;
/** No hand-twisted cord exceeds 0.64 m, which four turns cannot fit, so the four-turn path runs on a
 * fixture cord lengthened in place to 1.2 m with its volume conserved under the fiber-cord@1 law. */
const FOUR = 1.2;
function lengthen(w: V7World, stackId: string) {
  const p = cordPart(item(w, stackId)),
    length = FOUR - 0.04;
  p.length = length;
  p.twisted = length;
  p.overall = FOUR;
  p.plyDiameter = plyDiameter(0.2, length);
}

function installed() {
  const genesis = initialLongWorld('long-ex16', 'long-culture-v2');
  let w = genesis;
  for (const dep of [...DEPENDENCIES, SECTIONED])
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
/** Wren gathers real reed and makes the cords, then gathers three real branch lots and stands at the site. */
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
  // Cord making is studied in its own tests; mastery is set directly here.
  actor(w).mastered.push(CORD, SECTIONED);
  actor(w).vitals.energy = 40;
  w = step(w, {
    wren: {
      interface: SECTIONED,
      args: { mode: 'sample', materials: [{ stackId: raw, quantity: 0.1 }] },
    },
  }).world;
  const cords: Partial<Record<Size, string>> = {};
  for (const [name, [quantity, requestedLength]] of Object.entries(SIZES)) {
    const known = new Set(w.stacks.map((s) => s.id)),
      maker = name === 'short' ? CORD : SECTIONED,
      rounds = requestedLength > 0.3 ? 7 : 4;
    for (let i = 0; i < rounds; i++) {
      actor(w).vitals.energy = 40;
      w = step(w, {
        wren: {
          interface: maker,
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
  lengthen(w, cords.four ?? '');
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
/** The fixture world after Wren studied the lashing for five paid rounds. */
function ready() {
  if (!studied) {
    let w = step(build().unstudied, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    for (let i = 0; i < 4; i++) w = step(w).world;
    expect(actor(w).mastered).toContain(id);
    actor(w).position = { ...SITE };
    actor(w).vitals.energy = 40;
    studied = w;
  }
  return v7Clone(studied);
}
const cordId = (name: Size) => build().cords[name];
/** The two single-unit lots, the first on top, with a cord. */
const lash = (name: Size = 'long', wrapCount = 2, angle = 90) =>
  attempt([build().single, build().spare], cordId(name), wrapCount, angle);
function rounds(n: number, action = lash(), from = ready()) {
  let w = from;
  for (let i = 0; i < n; i++) w = step(w, { wren: action }).world;
  actor(w).vitals.energy = 40;
  return w;
}
const lashed: Partial<Record<string, V7World>> = {};
/** Two whole branch units lashed with the given cord and turn count in wrapCount + 3 paid rounds. */
function bound(name: Size = 'long', wrapCount = 2) {
  const key = `${name}-${String(wrapCount)}`;
  lashed[key] ??= rounds(wrapCount + 3, lash(name, wrapCount));
  return v7Clone(lashed[key]);
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
const trialOf = (w: V7World) => events(w, 'trial')[0]?.data ?? {};

describe('hand-lashed multi-turn crossing in ex16', () => {
  it('is scoped to ex16 after the cord and binding packages, keeps them byte-identical, needs five study rounds at 0.2 energy and fits the frozen size limit', () => {
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
    for (const reused of DEPENDENCIES) {
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
      learning: 5,
      learningEnergy: 0.2,
      prerequisites: [],
      references: {},
      revision: `${id}@1`,
      handler: 'long.hand-lash-crossing',
    });
    const limit = w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(3500);
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
    expect(pkg?.events?.every((e) => e.startsWith('crossing-lashing-'))).toBe(
      true,
    );
    actor(w).position = { ...SITE };
    const early = step(w, {
      wren: attempt([build().lot, build().lot], cordId('long')),
    });
    expect(early.outcomes.wren?.reason).toMatch(/not mastered/);
    expect(actor(early.world).vitals).toEqual(actor(step(w).world).vitals);
    // Each of the five study rounds is paid individually; no other ability is a prerequisite.
    let x = step(w, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(spent(w, x)).toBeCloseTo(0.2, 6);
    for (let i = 0; i < 4; i++) {
      expect(actor(x).mastered).not.toContain(id);
      const resting = v7Clone(x);
      actor(resting).learning = null;
      const next = step(x).world;
      expect(energy(step(resting).world) - energy(next)).toBeCloseTo(0.2, 6);
      x = next;
    }
    expect(actor(x).mastered).toContain(id);
    expect(actor(x).mastered).not.toContain(BIND);
    expect(JSON.stringify(actor(x).wellbeing.sources)).not.toContain(id);
    // Learning alone creates no item or lashing event.
    expect(lashEvents(x)).toEqual([]);
    expect(x.stacks.length).toBe(w.stacks.length);
  });

  it("attempt: a cord of Wren's actual 0.54 m size cannot take two turns round two whole branch units; the paid first round measures the shortfall and releases the inputs once", () => {
    const w0 = ready(),
      { lot } = build(),
      c = cordId('wren'),
      reed = units(w0, 'reed'),
      branch = units(w0, 'branch'),
      count = w0.stacks.length,
      W = 2 * plyDiameter(0.2, 0.5);
    expect(cordPart(item(w0, c))).toMatchObject({ overall: 0.54 });
    // A lot of two whole units may be named twice; even the most favourable angle is too short.
    for (const angle of [90, 30]) {
      const r = step(w0, { wren: attempt([lot, lot], c, 2, angle) }),
        w = r.world;
      expect(r.outcomes.wren?.success).toBe(true);
      expect(spent(w0, w)).toBeCloseTo(0.5, 6);
      expect(lashEvents(w)).toEqual(['started', 'shortfall']);
      const e = events(w, 'shortfall')[0],
        measured = record(e?.data.measured);
      expect(e?.data).toMatchObject({
        outcome: 'too-short',
        measuredShortfall: true,
        operation: 'measure-position',
      });
      expect(list(measured.pieceDiameters)[0]).toBeCloseTo(PIECE, 4);
      expect(num(measured.width)).toBeCloseTo(W, 4);
      expect(measured.wrapCount).toBe(2);
      expect(num(measured.need)).toBeGreaterThan(0.54);
      expect(measured.fits).toBe(false);
      expect(asText(e?.data.problem)).toMatch(/the cord is 0.54 m; 2 turns/);
      // Nothing was lashed; the lot gave up one whole unit as a separate conserved piece.
      const j = job(w);
      expect(j).toMatchObject({ status: 'stopped', completedWork: 1 });
      expect(w.stacks.length).toBe(count + 1);
      expect(units(w, 'reed')).toBe(reed);
      expect(units(w, 'branch')).toBe(branch);
      for (const s of [lot, ...(j?.pieces ?? [])]) {
        expect(item(w, s)).toMatchObject({ owner: 'wren', quantity: 1 });
        expect(item(w, s)?.reservedFor).toBeUndefined();
        expect(item(w, s)?.processing).toBeUndefined();
      }
      const cord = item(w, c);
      expect(cord?.reservedFor).toBeUndefined();
      expect(cordPart(cord)).toMatchObject({ role: 'cord', overall: 0.54 });
      expect(lashPart(cord)).toMatchObject({
        state: 'separate',
        last: 'infeasible-too-short',
      });
      // A verified finding keyed by the functional observation and the turn count.
      expect(
        Object.keys(actor(w).memory.knowledge ?? {}).filter((k) =>
          k.startsWith('lashing-fit:reed-6.4mm:branch-31.6-31.6mm:2-turns:'),
        ),
      ).toEqual([
        'lashing-fit:reed-6.4mm:branch-31.6-31.6mm:2-turns:shortfall-too-short',
      ]);
      clean(w);
    }
  });

  it('attempt: the measured plan routes each turn explicitly, counts one closure and takes the longest stage; three turns exceed a real 0.64 m cord', () => {
    const w0 = ready(),
      c = cordId('long'),
      W = 2 * plyDiameter(0.2, 0.6),
      r = step(w0, { wren: lash('long', 3, 90) }),
      w = r.world,
      e = events(w, 'shortfall')[0],
      g = record(e?.data.measured),
      turns = (Array.isArray(g.turns) ? g.turns : []).map(record),
      stages = (Array.isArray(g.stages) ? g.stages : []).map(record);
    expect(spent(w0, w)).toBeCloseTo(0.5, 6);
    expect(e?.data.outcome).toBe('too-short');
    expect(num(g.width)).toBeCloseTo(W, 4);
    // Adjacent turns lie one cord width apart, symmetric about the middle turn.
    expect(num(g.pitch)).toBeCloseTo(W, 3);
    expect(turns.map((t) => num(t.offset))).toEqual([
      -num(g.pitch),
      0,
      num(g.pitch),
    ]);
    // The middle turn is crossing-contact@1's single wrap; turns off the middle are longer, as the
    // sections shift apart in their planes; each adds its helical advance.
    const single = singleWrap(PIECE, W, 90);
    expect(num(turns[1]?.planar)).toBeCloseTo(single.wrap, 3);
    expect(num(turns[0]?.planar)).toBeGreaterThan(num(turns[1]?.planar));
    for (const t of turns) {
      expect(num(t.length)).toBeCloseTo(Math.hypot(num(t.planar), W), 3);
      expect(list(t.contact).reduce((s, x) => s + x, 0)).toBeLessThanOrEqual(
        2 * Math.PI + 1e-6,
      );
    }
    const wrap = num(g.wrap);
    expect(wrap).toBeCloseTo(
      turns.reduce((s, t) => s + num(t.length), 0),
      3,
    );
    // Both ends ride one width up onto the turns and meet in one closure over the middle.
    expect(num(g.bridgePerEnd)).toBeCloseTo(
      Math.hypot((3 * W) / (2 * Math.sin(single.beta)), W),
      3,
    );
    expect(stages.map((s) => s.stage)).toEqual([
      'route-turn-1',
      'route-turn-2',
      'route-turn-3',
      'form-tuck-closure',
      'dress-release-check',
    ]);
    const forming = stages[3],
      seated = stages[4];
    expect(num(forming?.occupied)).toBeCloseTo(
      wrap + 0.04 + 2 * num(g.bridgePerEnd) + 2 * num(g.formPath),
      3,
    );
    expect(num(seated?.occupied)).toBeCloseTo(
      wrap + 2 * num(g.bridgePerEnd) + 2 * num(g.closurePath),
      3,
    );
    expect(num(g.need)).toBe(Math.max(...stages.map((s) => num(s.need))));
    expect(num(g.need)).toBeGreaterThan(0.64);
    // Not a multiplied single-wrap total: one closure and one routing opening only.
    expect(num(g.need)).toBeLessThan(
      3 * (single.wrap + 0.04 + 2 * num(g.formPath) + 0.04),
    );
    expect(num(g.holdWithTurns)).toBeCloseTo(2 * PIECE + 2 * W, 3);
    expect(item(w, c)?.reservedFor).toBeUndefined();
    clean(w);
  });

  it('attempt: impossible, unsupported or unavailable inputs are refused before costs', () => {
    const w = ready(),
      { lot, single, spare } = build(),
      c = cordId('long');
    unchanged(w, attempt([single, spare], c, 1), /wrapCount/);
    unchanged(w, attempt([single, spare], c, 5), /wrapCount/);
    unchanged(w, attempt([single, spare], c, 2.5), /wrapCount/);
    unchanged(
      w,
      mode('attempt', {
        pieceIds: [single, spare],
        cordId: c,
        crossingAngle: 90,
      }),
      /wrapCount/,
    );
    unchanged(
      w,
      mode('attempt', {
        pieceIds: [single],
        cordId: c,
        wrapCount: 2,
        crossingAngle: 90,
      }),
      /exact ids of two/,
    );
    unchanged(w, attempt([single, single], c), /cannot be named 2 time/);
    unchanged(w, attempt([single, 'branch'], c), /exact ids of your own/);
    unchanged(w, attempt([single, spare], c, 2, 20), /crossingAngle/);
    unchanged(
      w,
      mode('attempt', {
        pieceIds: [single, spare],
        cordId: c,
        crossingAngle: 90,
        wrapCount: 2,
        trialForce: 5,
      }),
      /Irrelevant argument/,
    );
    unchanged(
      w,
      mode('attempt', {
        pieceIds: [single, spare],
        cordId: c,
        crossingAngle: 90,
        wrapCount: 2,
        workId: 'manual-1',
      }),
      /No unfinished lashing work/,
    );
    const reed = w.stacks.find(
      (s) => s.owner === 'wren' && s.resource === 'reed' && !s.processing,
    );
    unchanged(w, attempt([single, reed?.id ?? ''], c), /Unsupported material/);
    unchanged(w, attempt([single, spare], lot), /finished cord/);
    // Too short for any two turns and closure of its width, visible before costs.
    unchanged(w, attempt([single, spare], cordId('short')), /at least/);
    // Treated pieces; knotted, joined, bound or reserved cords; a 0.1 unit fragment.
    const treated = v7Clone(w);
    const sp = item(treated, spare);
    if (sp)
      sp.processing = {
        branchScreenPart: { structure: 'screen-x', condition: 0.8 },
      };
    unchanged(treated, attempt([single, spare], c), /treated, recovered/);
    const knotted = v7Clone(w);
    cordPart(item(knotted, c)).role = 'knotted';
    unchanged(knotted, attempt([single, spare], c), /overhand knot/);
    const joined = v7Clone(w);
    cordPart(item(joined, c)).role = 'joined';
    unchanged(
      joined,
      attempt([single, spare], c),
      /Joined cord is not accepted/,
    );
    const bindingRole = v7Clone(w);
    cordPart(item(bindingRole, c)).role = 'bound';
    unchanged(bindingRole, attempt([single, spare], c), /already closes/);
    const reserved = v7Clone(w);
    const rc = item(reserved, c);
    if (rc) rc.reservedFor = 'manual-x';
    unchanged(reserved, attempt([single, spare], c), /reserved by other work/);
    const thin = v7Clone(w);
    const tc = item(thin, c);
    if (tc) {
      tc.quantity = 0.1;
      tc.quantityTenths = 1;
      cordPart(tc).role = 'fragment';
    }
    unchanged(thin, attempt([single, spare], c), /at least 0.2 units/);
    // Room: another person in the work circle, standing in water, no clear ground, low energy.
    const crowded = v7Clone(w);
    actor(crowded, 'kai').position = { x: SITE.x + 1, y: SITE.y };
    unchanged(crowded, attempt([single, spare], c), /work circle/);
    const wet = v7Clone(w);
    actor(wet).position = { x: 27.5, y: 12.5 };
    unchanged(wet, attempt([single, spare], c), /water/);
    const blocked = v7Clone(w);
    actor(blocked).position = { x: 0.6, y: 0.6 };
    unchanged(blocked, attempt([single, spare], c), /every tried direction/);
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.3;
    unchanged(tired, attempt([single, spare], c), /Not enough energy/);
    // Another person's pieces and cord are not theirs to use.
    const kai = v7Clone(w);
    actor(kai, 'kai').mastered.push(id);
    actor(kai, 'kai').position = { ...SITE };
    actor(kai).position = { x: SITE.x - 3, y: SITE.y };
    unchanged(kai, attempt([single, spare], c), /exact ids of your own/, 'kai');
  });

  it('attempt: wrapCount + 3 paid rounds of 0.5 lash two whole branch units with a real 0.64 m cord into a relation of the three conserved items', () => {
    const w0 = ready(),
      { single, spare } = build(),
      c = cordId('long'),
      reed = units(w0, 'reed'),
      branch = units(w0, 'branch'),
      count = w0.stacks.length;
    expect(cordPart(item(w0, c)).overall).toBe(0.64);
    const types = [
      'measured',
      'turn-routed',
      'turn-routed',
      'closure-formed',
      'release-held',
    ];
    const states = ['positioned', 'routed', 'routed', 'tucked', 'bound'];
    let w = w0;
    for (let i = 0; i < 5; i++) {
      const before = w,
        r = step(w, { wren: lash() });
      w = r.world;
      expect(r.outcomes.wren?.success).toBe(true);
      expect(spent(before, w)).toBeCloseTo(0.5, 6);
      const e = events(w, types[i] ?? '')[0],
        visual = record(e?.data.after);
      expect(e?.data.stageCompleted).toBe(true);
      expect(visual.state).toBe(states[i]);
      expect(visual.schematic).toBe(true);
      // No completed appearance before the passed release check; only routed turns are drawn.
      expect(visual.completedAppearance).toBe(i === 4);
      expect(visual.turnsShown).toBe([0, 1, 2, 2, 2][i]);
      const cord = item(w, c);
      expect(lashPart(cord).state).toBe(states[i]);
      expect(cordPart(cord).role).toBe(i >= 3 ? 'bound' : 'cord');
      expect(job(w)?.reached).toBe(i + 1);
      expect(units(w, 'reed')).toBe(reed);
      expect(units(w, 'branch')).toBe(branch);
      expect(w.stacks.length).toBe(count);
      actor(w).vitals.energy = 40;
    }
    const j = job(w),
      bindingId = String(j?.binding),
      cord = item(w, c);
    expect(j).toMatchObject({
      status: 'completed',
      completedWork: 5,
      initialWork: 5,
      pieces: [single, spare],
    });
    expect(j?.paidEnergy).toBeCloseTo(2.5, 6);
    for (const s of [single, spare, c])
      expect(item(w, s)).toMatchObject({
        owner: 'wren',
        reservedFor: bindingId,
      });
    expect(lashPart(item(w, single))).toMatchObject({
      bindingId,
      part: 'top',
      partner: spare,
      cord: c,
      state: 'bound',
    });
    expect(lashPart(item(w, spare))).toMatchObject({ part: 'bottom' });
    const k = lashPart(cord),
      g = record(k.geometry);
    expect(k).toMatchObject({
      bindingId,
      state: 'bound',
      seated: true,
      last: 'release-held',
      pieces: [single, spare],
    });
    // The centreline ledger closes: two tails + two closure ends + two bridges + the turns.
    const e = events(w, 'release-held')[0],
      after = record(record(e?.data.after).cord),
      tails = list(after.tails);
    expect(
      (tails[0] ?? 0) +
        (tails[1] ?? 0) +
        2 * num(g.closurePath) +
        2 * num(g.bridgePerEnd) +
        num(g.wrap),
    ).toBeCloseTo(0.64, 3);
    expect(tails[0]).toBeGreaterThanOrEqual(num(g.tailNeed));
    expect(e?.data.qualified).toBeUndefined();
    expect(num(e?.data.closureSlipLoad)).toBeGreaterThan(5);
    // Dressing: both ends carry the 5 N pull, and the tension falls along each turn over the bark.
    expect(e?.data.endTensions).toEqual([5, 5]);
    const turnTensions = pairs(e?.data.turnTensions);
    expect(turnTensions).toHaveLength(2);
    expect(turnTensions[0]?.[0]).toBeLessThan(5);
    expect(turnTensions[0]?.[1]).toBeLessThan(turnTensions[0]?.[0] ?? 0);
    expect(turnTensions[1]).toEqual([...(turnTensions[0] ?? [])].reverse());
    expect(String(e?.description)).toMatch(/untested/);
    expect(String(e?.description)).toMatch(/no shelter/);
    const visual = record(e?.data.visual);
    expect(visual.status).toBe('bound-untested');
    expect(visual.reuses).toEqual([
      'crossing-binding',
      'fiber-cord',
      'cord-knot',
    ]);
    expect(record(visual.crossing).point).toEqual(SITE);
    const drawn = (Array.isArray(after.turns) ? after.turns : []).map(record);
    expect(drawn.map((t) => t.state)).toEqual(['snug', 'snug']);
    expect(pairs(drawn[0]?.centerline)).toHaveLength(13);
    // Evidence event ids of every paid stage are kept with the lashing.
    expect(visual.evidence).toHaveLength(4);
    expect(lashPart(cord).evidence).toHaveLength(5);
    // Other cord and binding operations are kept off the lashed items.
    unchanged(
      w,
      {
        interface: CORD,
        args: { mode: 'trial', targetId: c, trialForce: 2, trialDuration: 10 },
      },
      /finished cord or cord fragment/,
    );
    const both = v7Clone(w);
    actor(both).mastered.push(BIND);
    unchanged(
      both,
      {
        interface: BIND,
        args: {
          mode: 'attempt',
          pieceIds: [build().lot, build().lot],
          cordId: c,
          crossingAngle: 90,
        },
      },
      /already closes a binding/,
    );
    unchanged(
      w,
      { interface: 'drop', args: { target: single, quantity: 1 } },
      /reserved|unavailable/,
    );
    clean(w);
  });

  it('trial: actual turn tensions decide holding; separate clamps then stretches the turns, slide slips at the bark friction of the turns on the top piece', () => {
    const w0 = bound(),
      bindingId = bindingOf(w0),
      c = cordId('long');
    // separate: the turns' sides clamp the pieces; beyond that each turn stretches by its stiffness.
    let r = step(w0, { wren: test(bindingId, 'separate', 10, 60) });
    let w = r.world;
    expect(spent(w0, w)).toBeCloseTo(0.5, 6);
    let d = trialOf(w);
    expect(d).toMatchObject({
      direction: 'separate',
      outcome: 'held',
      requestedForce: 10,
      achievedForce: 10,
      requestedDuration: 60,
      heldSeconds: 60,
      wrapCount: 2,
      stoppedBy: 'the requested time',
      turnStates: ['taut', 'taut'],
    });
    expect(record(d).forceRecord).toEqual([
      { seconds: 0, force: 0 },
      { seconds: 0, force: 10 },
      { seconds: 60, force: 10 },
      { seconds: 60, force: 0 },
    ]);
    const before = pairs(d.turnTensionsBefore),
      loaded = pairs(d.turnTensions),
      clamp = before.flat().reduce((s, x) => s + x, 0);
    expect(clamp).toBeLessThan(10);
    expect(num(d.clampingForce)).toBe(0);
    expect(loaded[0]?.[0]).toBeGreaterThanOrEqual(before[0]?.[0] ?? 0);
    const sites = (d.gripSites ?? []) as V7Data[];
    expect(sites.map((s) => s.piece)).toEqual([build().single, build().spare]);
    expect(num(sites[0]?.fromCrossing)).toBeGreaterThan(PIECE / 2);
    expect(record(d.visual).status).toBe('held-at-recorded-load');
    expect(lashPart(item(w, c)).state).toBe('bound');
    // A separating pull below the clamp leaves the pieces pressed together.
    r = step(w0, { wren: test(bindingId, 'separate', 2, 10) });
    d = trialOf(r.world);
    expect(num(d.clampingForce)).toBeGreaterThan(0);
    expect(num(d.separationGap)).toBe(0);
    // slide: the turns slide on the top piece at 0.3 x the bark normal force of their actual tension.
    r = step(w0, { wren: test(bindingId, 'slide', 10, 30) });
    w = r.world;
    d = trialOf(w);
    const top = list(d.turnTopFriction),
      slipLoad = num(d.crossingSlipLoad);
    expect(d.outcome).toBe('crossing-slipped');
    expect(slipLoad).toBeGreaterThan(2);
    expect(slipLoad).toBeLessThan(10);
    expect(
      Math.abs(slipLoad - top.reduce((s, x) => s + x, 0)),
    ).toBeLessThanOrEqual(0.1 * top.length);
    expect(num(d.achievedForce)).toBeCloseTo(slipLoad, 1);
    // Not the single wrap's linearized 0.3 x 5 N x contact multiplied by two turns.
    const contact = pairs(events(w0, 'release-held')[0]?.data.turnContact);
    const linear = 0.3 * 5 * ((contact[0]?.[0] ?? 0) + (contact[0]?.[2] ?? 0));
    expect(slipLoad).toBeLessThan(2 * linear - 1);
    expect(d.heldSeconds).toBe(0);
    expect(d.stoppedBy).toBe('slip');
    expect(events(w, 'crossing-slipped')).toHaveLength(1);
    const W = 2 * plyDiameter(0.2, 0.6);
    expect(list(d.turnMigration)).toEqual([
      Math.round(W * 1e4) / 1e4,
      Math.round(W * 1e4) / 1e4,
    ]);
    const k = lashPart(item(w, c));
    expect(k.state).toBe('bound');
    expect(num(k.crossingShift)).toBeCloseTo(W, 4);
    expect(record(d.visual).status).toBe('slipped-at-recorded-load');
    r = step(w0, { wren: test(bindingId, 'slide', 2, 30) });
    expect(trialOf(r.world).outcome).toBe('held');
    const held2 = r.world;
    // A hand weakened by health limits the achieved force.
    const weak = v7Clone(w0);
    actor(weak).vitals.health = 3;
    r = step(weak, { wren: test(bindingId, 'separate', 10, 10) });
    expect(trialOf(r.world)).toMatchObject({ achievedForce: 6, handLimit: 6 });
    // Verified findings name the functional observation and the turn count, not the ability.
    expect(
      Object.keys(actor(w).memory.knowledge ?? {}).some((x) =>
        x.startsWith(
          'lashing-hand-load-slide:reed-5.9mm:branch-31.6-31.6mm:2-turns:',
        ),
      ),
    ).toBe(true);
    clean(w);
    // A repeated identical trial is no new information.
    const again = step(held2, { wren: test(bindingId, 'slide', 2, 30) });
    const repeat = again.world.events.find(
      (e) =>
        e.type === 'trial-result' &&
        asText(e.data.key).startsWith('lashing-hand-load-slide'),
    );
    expect(repeat?.data.newInformation).toBe(false);
    // Refused before costs: unsupported direction, unbounded force or time, another binding.
    unchanged(w0, test(bindingId, 'twist'), /trialDirection|supported/);
    unchanged(w0, test(bindingId, 'separate', 0, 10), /above zero/);
    unchanged(w0, test(bindingId, 'separate', 11, 10), /trialForce/);
    unchanged(w0, test(bindingId, 'separate', 5, 61), /trialDuration/);
    unchanged(w0, test('lashing-x'), /exact id of a lashing/);
  });

  it('four turns: inner turns carry less of the dressing pull, slack turns contribute nothing and holding grows less than in proportion', () => {
    const four = bound('four', 4),
      two = bound('long', 2),
      e = events(four, 'release-held')[0],
      t = pairs(e?.data.turnTensions);
    expect(t).toHaveLength(4);
    // Outer turns are fed directly from the pulled ends; inner turns only through the bark contact.
    expect(t[1]?.[0]).toBeLessThan(t[0]?.[0] ?? 0);
    expect(t[1]?.[1]).toBeLessThan(t[0]?.[0] ?? 0);
    expect(t[2]).toEqual([...(t[1] ?? [])].reverse());
    const slide = (w: V7World) =>
      num(
        trialOf(step(w, { wren: test(bindingOf(w), 'slide', 10, 10) }).world)
          .crossingSlipLoad,
      );
    const s4 = slide(four),
      s2 = slide(two);
    expect(s4).toBeGreaterThan(0);
    // A thinner cord and twice the turns, yet far from twice the two-turn holding.
    expect(s4).toBeLessThan(2 * s2);
    // A turn that has lost all its tension (fixture: its creep loss set past its dressing tension)
    // contributes no bark friction and shows as slack.
    const slackened = v7Clone(four),
      c = cordId('four'),
      model = record(lashPart(item(slackened, c)).model),
      turns = (Array.isArray(model.turns) ? model.turns : []).map(record);
    if (turns[1]) turns[1].loss = 10;
    const r = step(slackened, { wren: test(bindingOf(four), 'slide', 10, 10) }),
      d = trialOf(r.world);
    expect(d.turnStates).toEqual(['taut', 'slack', 'taut', 'taut']);
    expect(list(d.turnTopFriction)[1]).toBe(0);
    expect(num(d.crossingSlipLoad)).toBeLessThan(s4);
    const shown = (record(record(d.before).cord).turns as V7Data[]).map(
      (x) => x.state,
    );
    expect(shown).toEqual(['snug', 'slack', 'snug', 'snug']);
  });

  it('trial and wear: loads only weaken; a worn cord takes damage, and one too weak for its own end tension parts into conserved fragments', () => {
    const w0 = bound(),
      bindingId = bindingOf(w0),
      c = cordId('long'),
      { single, spare } = build(),
      reed = units(w0, 'reed');
    const worn = v7Clone(w0);
    cordPart(item(worn, c)).condition = 0.22;
    let r = step(worn, { wren: test(bindingId, 'separate', 1, 10) });
    const d = trialOf(r.world);
    expect(d.outcome).toBe('held');
    expect(num(d.strandsBroken)).toBeGreaterThan(0);
    expect(num(d.conditionAfter)).toBeLessThan(0.22);
    expect(events(r.world, 'damaged')).toHaveLength(1);
    // A cord too weak for the 5 N end tension parts in place between rounds.
    const weak = v7Clone(w0);
    cordPart(item(weak, c)).condition = 0.1;
    r = step(weak);
    const w = r.world;
    expect(events(w, 'broken')).toHaveLength(1);
    expect(item(w, c)).toBeUndefined();
    const fragments = w.stacks.filter(
      (s) => cordPart(s).fragmentOf === c && cordPart(s).role === 'fragment',
    );
    expect(fragments).toHaveLength(2);
    expect(
      fragments.reduce((n, s) => n + num(cordPart(s).overall), 0),
    ).toBeCloseTo(0.64, 6);
    expect(fragments.reduce((n, s) => n + tenths(s.quantity), 0)).toBe(2);
    expect(units(w, 'reed')).toBe(reed);
    for (const s of fragments) {
      expect(s).toMatchObject({ owner: 'wren', origin: REEDS.source });
      expect(s.reservedFor).toBeUndefined();
      expect(lashPart(s)).toMatchObject({
        state: 'separate',
        last: 'broke-in-lashing',
        priorRole: 'fragment',
      });
    }
    for (const s of [single, spare]) {
      expect(item(w, s)?.reservedFor).toBeUndefined();
      expect(item(w, s)?.processing).toBeUndefined();
    }
  });

  it('untie: wrapCount + 1 paid rounds of 0.5 free the same three items; open turns fall off when not worked; a damaged closure resists', () => {
    const w0 = bound(),
      bindingId = bindingOf(w0),
      c = cordId('long'),
      { single, spare } = build(),
      count = w0.stacks.length;
    let w = w0;
    const kinds = ['closure-withdrawn', 'turn-unwrapped', 'untied'];
    for (let i = 0; i < 3; i++) {
      const before = w;
      w = step(w, { wren: mode('untie', { bindingId }) }).world;
      expect(spent(before, w)).toBeCloseTo(0.5, 6);
      expect(events(w, kinds[i] ?? '')).toHaveLength(1);
      actor(w).vitals.energy = 40;
    }
    expect(job(w)).toMatchObject({ status: 'completed', completedWork: 3 });
    for (const s of [single, spare]) {
      expect(item(w, s)?.reservedFor).toBeUndefined();
      expect(item(w, s)?.processing).toBeUndefined();
      expect(item(w, s)?.quantity).toBe(1);
    }
    expect(item(w, c)?.reservedFor).toBeUndefined();
    expect(cordPart(item(w, c))).toMatchObject({ role: 'cord', overall: 0.64 });
    expect(lashPart(item(w, c))).toMatchObject({
      state: 'separate',
      last: 'untied',
      bindingId: null,
    });
    expect(w.stacks.length).toBe(count);
    // After the closure is withdrawn the open turns are held only by hand and fall off when not worked.
    const mid = step(w0, { wren: mode('untie', { bindingId }) }).world;
    expect(lashPart(item(mid, c))).toMatchObject({
      state: 'opened',
      remainingTurns: 2,
    });
    expect(cordPart(item(mid, c)).role).toBe('cord');
    const x = step(mid).world;
    expect(events(x, 'relaxed')).toHaveLength(1);
    expect(item(x, c)?.reservedFor).toBeUndefined();
    expect(lashPart(item(x, c)).last).toBe('untied-turns-fell-open');
    // Too many broken strands at the closure: the paid round finds it resists.
    const damaged = v7Clone(w0);
    cordPart(item(damaged, c)).condition = 0.4;
    const y = step(damaged, { wren: mode('untie', { bindingId }) }).world;
    expect(spent(damaged, y)).toBeCloseTo(0.5, 6);
    expect(events(y, 'resisted')).toHaveLength(1);
    expect(item(y, c)?.reservedFor).toBe(bindingId);
    expect(lashPart(item(y, c))).toMatchObject({
      state: 'bound',
      last: 'damaged',
    });
  });

  it('pauses uncharged and relaxes hand-held turns, resumes only by workId re-routing them, and cancel keeps a tucked closure as a loose lashing', () => {
    const { single, spare } = build(),
      c = cordId('long');
    // After two routed turns an unworked round pauses: both hand-held turns fall loose.
    const w3 = rounds(3);
    const w = step(w3).world;
    expect(spent(w3, w)).toBeCloseTo(0, 6);
    expect(job(w)).toMatchObject({
      status: 'paused',
      reached: 1,
      remainingWork: 4,
    });
    expect(events(w, 'paused')).toHaveLength(1);
    expect(String(events(w, 'relaxed')[0]?.description)).toMatch(
      /2 hand-held turn/,
    );
    expect(lashPart(item(w, c))).toMatchObject({
      state: 'positioned',
      routedTurns: 0,
    });
    unchanged(w, lash(), /Unfinished lashing work exists/);
    const workId = job(w)?.id ?? '';
    let x = step(w, { wren: mode('attempt', { workId }) }).world;
    expect(spent(w, x)).toBeCloseTo(0.5, 6);
    expect(events(x, 'resumed')).toHaveLength(1);
    expect(events(x, 'turn-routed')).toHaveLength(1);
    // Earlier expenditure is kept; the relaxed routing is paid again, not restarted or refunded.
    expect(job(x)).toMatchObject({ completedWork: 4, reached: 2 });
    expect(job(x)?.paidEnergy).toBeCloseTo(2, 6);
    // Carried away from where they were laid, the crossed pieces must be positioned again.
    const moved = v7Clone(w);
    actor(moved).position = { x: SITE.x + 0.5, y: SITE.y + 0.5 };
    x = step(moved, { wren: mode('attempt', { workId }) }).world;
    expect(events(x, 'relaxed')).toHaveLength(1);
    expect(job(x)).toMatchObject({ reached: 1, lastStage: 'measure-position' });
    // Low energy pauses before charging.
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.3;
    x = step(tired, { wren: mode('attempt', { workId }) }).world;
    expect(job(x)).toMatchObject({ status: 'paused', completedWork: 3 });
    // Cancel while turns are held by hand frees everything once.
    x = step(w3, { wren: mode('cancel', { workId: job(w3)?.id }) }).world;
    expect(spent(w3, x)).toBeCloseTo(0, 6);
    expect(events(x, 'cancelled')[0]?.data.retained).toBe(false);
    for (const s of [single, spare, c])
      expect(item(x, s)?.reservedFor).toBeUndefined();
    // Cancel after the closure is tucked keeps a loose lashing; one dressing round completes it.
    const w4 = rounds(4);
    x = step(w4, { wren: mode('cancel', {}) }).world;
    const loose = String(job(w4)?.binding);
    expect(events(x, 'cancelled')[0]?.data.retained).toBe(true);
    for (const s of [single, spare, c])
      expect(item(x, s)?.reservedFor).toBe(loose);
    expect(lashPart(item(x, c))).toMatchObject({
      state: 'tucked',
      seated: false,
    });
    unchanged(x, test(loose), /dressed, release-checked/);
    unchanged(x, lash('wren'), /reserved by other work/);
    unchanged(
      x,
      mode('attempt', { pieceIds: [single, spare], cordId: c, wrapCount: 3 }),
      /dress it as it is/,
    );
    const y = step(x, {
      wren: mode('attempt', { pieceIds: [single, spare], cordId: c }),
    }).world;
    expect(spent(x, y)).toBeCloseTo(0.5, 6);
    expect(job(y)).toMatchObject({ status: 'completed', completedWork: 1 });
    expect(events(y, 'release-held')).toHaveLength(1);
    expect(lashPart(item(y, c))).toMatchObject({
      state: 'bound',
      bindingId: loose,
    });
  });

  it('inspect records visible turns for 0.2 energy and leaves tensions and holding force unknown', () => {
    const w0 = bound(),
      bindingId = bindingOf(w0),
      c = cordId('long');
    const w = step(w0, { wren: mode('inspect', { bindingId }) }).world;
    expect(spent(w0, w)).toBeCloseTo(0.2, 6);
    const e = events(w, 'inspected')[0];
    expect(e?.data).toMatchObject({
      bindingId,
      holdingForce: null,
      displacement: 0,
      turnsRound: 2,
      visibleRetention: 'snug round the crossing',
    });
    expect((e?.data.visibleTurns as V7Data[]).map((t) => t.looks)).toEqual([
      'snug on the crossing',
      'snug on the crossing',
    ]);
    expect(record(e?.data.ledger).centreline).toBe(0.64);
    expect(asText(e?.data.unknown)).toMatch(/turn tensions/);
    expect(JSON.stringify(e?.data.visibleTurns)).not.toMatch(/tension/);
    expect(w.stacks).toEqual(step(w0).world.stacks);
    expect(
      actor(w).memory.knowledge?.[`${bindingId}:crossing-lashing-geometry`]
        ?.verified,
    ).toBe(false);
    unchanged(
      w0,
      mode('inspect', { bindingId, workId: 'x' }),
      /exactly one of/,
    );
    expect(lashPart(item(w, c)).state).toBe('bound');
  });

  it('a lashed cord wears 0.0005 per round exactly once and is not carried as a hanging load; the work and lashing stay personal', () => {
    const w0 = bound(),
      bindingId = bindingOf(w0),
      c = cordId('long'),
      free = cordId('wren'),
      before = [c, free].map((s) => num(cordPart(item(w0, s)).condition));
    let w = w0;
    for (let i = 0; i < 4; i++) {
      // Walking with the lashing hangs nothing in it; only wear acts.
      actor(w).position = { x: SITE.x + (i % 2 ? 0 : 0.3), y: SITE.y };
      w = step(w).world;
    }
    [c, free].forEach((s, i) => {
      expect(num(cordPart(item(w, s)).condition)).toBeCloseTo(
        (before[i] ?? 0) - 4 * 0.0005,
        8,
      );
    });
    expect(lashPart(item(w, c))).toMatchObject({
      state: 'bound',
      seated: true,
    });
    expect(cordPart(item(w, c)).overall).toBe(0.64);
    expect(lashEvents(w)).toEqual([]);
    // Another person cannot resume, inspect or cancel Wren's work, nor test, untie or inspect her lashing.
    const x = rounds(1);
    const workId = job(x)?.id ?? '';
    actor(x, 'kai').mastered.push(id);
    actor(x, 'kai').position = { x: SITE.x - 3, y: SITE.y };
    unchanged(
      x,
      mode('attempt', { workId }),
      /No unfinished lashing work of yours/,
      'kai',
    );
    unchanged(
      x,
      mode('inspect', { workId }),
      /No lashing work of yours/,
      'kai',
    );
    unchanged(
      x,
      mode('cancel', { workId }),
      /No unfinished lashing work/,
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
      unchanged(y, action, /exact id of a lashing of your own/, 'kai');
  });

  it('stops at death, leaving the pieces and cord where the person died once in their actual configuration', () => {
    const pkg = continuousRegistry(ready()).packages.find((p) => p.id === id),
      { single, spare } = build(),
      c = cordId('long');
    for (const [n, state, retained, relaxed] of [
      [1, 'separate', false, 0],
      [3, 'separate', false, 1],
      [4, 'tucked', true, 0],
    ] as const) {
      const w = rounds(n),
        dead = v7Clone(w),
        bindingId = String(job(w)?.binding);
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
