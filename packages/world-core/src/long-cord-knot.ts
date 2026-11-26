import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Package,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import {
  v7Clone,
  v7Id,
  v7Json,
  v7Number,
  v7RoundNumber,
  v7String,
} from './continuous-data.js';
import { forestEvent } from './forest-climate.js';
import { foodTenths } from './forest-food-accounting.js';
import { openMaterial } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workCreate,
  workPay,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import { FIBER_CORD as F } from './long-fiber-cord.js';

const ID = 'hand-tie-cord-knot';
const REVISION = `${ID}@1`;
const STATE = `long:work:${ID}`;
/** Processing key of the knot configuration of a fiber-cord@1 item; the item keeps its id. */
const KNOT = 'cordKnot';
const LAW = 'cord-knot@1';
/** Energy of one attempt or untie round, of an inspection and of a trial. */
const STEP = 0.5;
const LOOK = 0.2;
const TRIAL = 0.5;
const TIE = ['lay-bend-loop', 'pass-end-through', 'dress-release-check'];
const UNTIE = ['draw-end-back', 'open-loop'];
/** The overhand crossing sequence: the loop's crossing, then the end passing under and out over it. */
const SEQUENCE = [
  'working-part-over-standing-part',
  'end-under-loop',
  'end-out-over-loop',
];
/** Fingertip pinch per hand while tying: fiber-cord@1's 0.02 m free span. */
const PINCH = F.SPAN;
/** Inner opening a formation loop needs for a fingertip and the end. */
const OPENING = 0.02;
/** A trial grip: fiber-cord@1's 0.05 m per hand, kept half its 0.02 m free span clear of the knot. */
const CLEAR = F.HOLD + F.SPAN / 2;
const MAX_FORCE = 10;
const MAX_SECONDS = Math.min(60, F.ROUND_SECONDS);
/** Arguments each mode accepts besides mode; any other supplied argument is refused. */
const ARGS: Partial<Record<string, string[]>> = {
  attempt: ['targetId', 'knot', 'workId'],
  inspect: ['targetId', 'workId'],
  trial: ['targetId', 'trialForce', 'trialDuration'],
  untie: ['targetId', 'workId'],
  cancel: ['workId'],
};
const WORK = ['attempt', 'untie'];
const ROLES = ['cord', 'fragment', 'knotted'];
type Shape = 'straight' | 'loop' | 'tucked' | 'tied';
const TIGHTENING: Record<Shape, string | null> = {
  straight: null,
  loop: 'held-open-loop',
  tucked: 'loose-undressed',
  tied: 'seated',
};

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const record = (v: unknown): V7Data =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as V7Data) : {};
const num = (v: unknown) => (typeof v === 'number' ? v : 0);
const m = F.metres;
const knotOf = (s: V7Stack) => record(s.processing?.[KNOT]);
function shapeOf(s: V7Stack): Shape {
  const v = knotOf(s).state;
  return v === 'loop' || v === 'tucked' || v === 'tied' ? v : 'straight';
}
const trialsOf = (s: V7Stack): V7Data[] => {
  const t = knotOf(s).trials;
  return Array.isArray(t) ? t.map(record) : [];
};

/** cord-knot@1, part 1: knot path of an overhand whose lobes have this centreline radius. An
 * open overhand turns its centreline through 3 pi (the 4 pi least turning of a closed knot less
 * the pi a closing arc supplies), plus one width of transit through the crossings; at lobes of
 * one width this is 10.4 widths, about the tightest possible overhand. */
const knotPath = (radius: number, width: number) =>
  3 * Math.PI * radius + width;
/** The shortest cord any overhand of this width needs whatever its material: lobes of one width
 * (or the formation opening) and a pinch at each end. Visible, so it is checked before costs. */
const shortest = (width: number) =>
  2 * PINCH + knotPath(Math.max(width, (OPENING + width) / 2), width);

interface Plan {
  width: number;
  length: number;
  /** Tightest lobe the strands take without cracking; null when they take no loop at all. */
  bend: number | null;
  lobe: number;
  lay: number;
  standing: number;
}
/** cord-knot@1, part 2, on the authoritative current item. Width is fiber-cord@1's grip width
 * (two ply diameters); the centreline is its overall length. Its 30 degree two-ply twist already
 * bends each ply at radius one width and needs bend index 0.5 (BEND); tolerated ply curvature is
 * taken to scale with the material's index, so a lobe of radius R needs 1/width + 1/R within
 * index / (0.5 x width): R >= width x 0.5 / (index - 0.5). A lobe wraps another pass of the same
 * cord, so R >= width keeps the passes from interpenetrating. The method centres the knot. */
function plan(w: V7World, s: V7Stack): Plan | null {
  const r = F.material(w, s.resource),
    p = F.part(s),
    width = 2 * Number(p.plyDiameter),
    length = Number(p.overall);
  if (!r || !(width > 0) || !(length > 0)) return null;
  const index = openMaterial(r).flexibility,
    bend = index > F.BEND ? (width * F.BEND) / (index - F.BEND) : null,
    lobe = bend === null ? Infinity : Math.max(width, bend),
    lay = Math.max(lobe, (OPENING + width) / 2);
  return {
    width,
    length,
    bend,
    lobe,
    lay,
    standing: Math.max(PINCH, (length - knotPath(lay, width)) / 2),
  };
}

/** Measured geometry of one configuration in a local plane (m, standing end at the origin):
 * centreline length is conserved as standing tail + knot path (or loop) + working tail. */
function shape(
  state: Shape,
  width: number,
  length: number,
  radius = 0,
  standing = length,
): V7Data {
  const total = m(length);
  if (state === 'straight')
    return {
      state,
      crossings: 0,
      sequence: [],
      width: m(width),
      loopRadius: null,
      lobeRadius: null,
      knotPath: 0,
      standingTail: total,
      workingTail: 0,
      extent: 0,
      endToEnd: total,
      knotAt: null,
      centerline: [
        [0, 0],
        [total, 0],
      ],
    };
  const loop = state === 'loop',
    a = m(standing),
    used = m(loop ? 2 * Math.PI * radius : knotPath(radius, width)),
    b = m(total - a - used),
    r = m(radius),
    extent = loop ? 0 : m(2 * radius + width),
    c = a + extent / 2,
    lobes = [90, 210, 330].map((d) => [
      m(c + radius * Math.cos((d * Math.PI) / 180)),
      m(radius * Math.sin((d * Math.PI) / 180)),
    ]);
  return {
    state,
    crossings: loop ? 1 : 3,
    sequence: SEQUENCE.slice(0, loop ? 1 : 3),
    width: m(width),
    loopRadius: loop ? r : null,
    lobeRadius: loop ? null : r,
    knotPath: loop ? 0 : used,
    loopPath: loop ? used : null,
    standingTail: a,
    workingTail: b,
    extent,
    endToEnd: m(a + extent + b),
    knotAt: [a, m(a + used)],
    centerline: loop
      ? [
          [0, 0],
          [a, 0],
          [m(a + radius), r],
          [a, m(2 * radius)],
          [m(a - radius), r],
          [a, 0],
          [m(a + b), 0],
        ]
      : [[0, 0], [a, 0], ...lobes, [m(a + extent), 0], [m(a + extent + b), 0]],
  };
}
const GEOMETRY = [
  'state',
  'crossings',
  'sequence',
  'width',
  'loopRadius',
  'lobeRadius',
  'knotPath',
  'loopPath',
  'standingTail',
  'workingTail',
  'extent',
  'endToEnd',
  'knotAt',
  'centerline',
];
/** The item's current geometry: its knot record, or the straight fiber-cord@1 cord. */
function geometryOf(s: V7Stack): V7Data {
  const k = knotOf(s),
    p = F.part(s);
  if (shapeOf(s) === 'straight')
    return shape('straight', 2 * Number(p.plyDiameter), Number(p.overall));
  const g: V7Data = {};
  for (const key of GEOMETRY) {
    const v = k[key];
    if (v !== undefined) g[key] = v;
  }
  return g;
}
/** Writes a configuration onto the same item; knotted roles keep the straight fiber-cord@1 trial off it. */
function configure(w: V7World, s: V7Stack, data: V7Data, extra: V7Data = {}) {
  const p = F.part(s),
    k = knotOf(s),
    prior = typeof k.priorRole === 'string' ? k.priorRole : F.roleOf(s);
  const knotted = data.state === 'tucked' || data.state === 'tied';
  p.role = knotted ? 'knotted' : prior === 'knotted' ? 'cord' : prior;
  s.processing = {
    ...(s.processing ?? {}),
    [KNOT]: {
      law: LAW,
      revision: REVISION,
      knot: data.state === 'straight' ? null : 'overhand',
      ...data,
      priorRole: prior,
      workId: typeof k.workId === 'string' ? k.workId : null,
      trials: trialsOf(s),
      updatedAt: w.tick,
      ...extra,
    },
  };
}
const straighten = (w: V7World, s: V7Stack, last: string) => {
  const p = F.part(s);
  configure(
    w,
    s,
    shape('straight', 2 * Number(p.plyDiameter), Number(p.overall)),
    { last, workId: null },
  );
};

/** Reusable visual metadata keyed to the actual item: fiber-cord@1's cord view plus knot path and state. */
function view(w: V7World, s: V7Stack): V7Data {
  const state = shapeOf(s);
  return {
    component: 'cord-knot',
    reuses: 'fiber-cord',
    item: s.id,
    knot: state === 'straight' ? null : 'overhand',
    tightening: TIGHTENING[state],
    // A completed overhand appearance needs the recorded crossings and the passed release check.
    completedAppearance: state === 'tied',
    ...geometryOf(s),
    cord: F.view(w, s),
  };
}

const ownJobs = (w: V7World, a: V7Actor) =>
  collectiveJobs(w, ID).filter((j) => j.owner === a.id);
const current = (w: V7World, a: V7Actor) => ownJobs(w, a).find(open);
const targetOf = (w: V7World, j: CollectiveWork) =>
  j.target ? w.stacks.find((s) => s.id === j.target) : undefined;
const stageName = (j: CollectiveWork, n: number) =>
  (j.mode === 'untie' ? UNTIE[n] : TIE[n + num(j.offset)]) ?? null;
function summary(w: V7World, j: CollectiveWork): V7Data {
  const s = targetOf(w, j);
  return {
    workId: j.id,
    actor: j.owner,
    mode: j.mode,
    status: j.status,
    law: LAW,
    revision: REVISION,
    stage: j.completedWork ? stageName(j, j.completedWork - 1) : 'reserved',
    nextStage: open(j) ? stageName(j, j.completedWork) : null,
    completedRounds: j.completedWork,
    remaining: j.remainingWork,
    paidEnergy: v7RoundNumber(j.paidEnergy),
    target: j.target,
    position: { x: j.x, y: j.y },
    visual: s ? view(w, s) : null,
  };
}
function sync(a: V7Actor, j: CollectiveWork) {
  a.extensionState[STATE] = v7Json(j);
}
function relevant(c: V7ActionContext, mode: string, allowed = ARGS[mode]) {
  const extra = Object.keys(c.action.args).filter(
    (k) =>
      k !== 'mode' &&
      c.action.args[k] !== undefined &&
      !(allowed ?? []).includes(k),
  );
  if (extra.length)
    throw new Error(
      `Irrelevant argument(s) for ${mode}: ${extra.join(', ')}. Nothing was spent.`,
    );
}
/** Exact own fiber-cord@1 cord, fragment or knotted cord; never a resource name. */
function ownCord(c: V7ActionContext, free = true): V7Stack {
  const id = v7String(c.action.args.targetId, 'targetId'),
    s = c.world.stacks.find((x) => x.id === id && x.owner === c.actor.id);
  if (!s || !ROLES.includes(F.roleOf(s) ?? ''))
    throw new Error(
      'targetId must be the exact id of your own finished cord or cord fragment from hand-twist-fiber-cord; nothing was spent.',
    );
  if (free && s.reservedFor)
    throw new Error('This cord is reserved by other work; nothing was spent.');
  return s;
}
/** Bounded verified finding: the same outcome for the same material and width confirms nothing new. */
function remember(
  c: V7ActionContext,
  s: V7Stack,
  kind: string,
  outcome: string,
  value: V7Data,
  method: string,
) {
  const width = Math.round(num(geometryOf(s).width) * 1000);
  openRemember(c, {
    key: `${ID}:${kind}:${s.resource}:${String(width)}mm:${outcome}`,
    subject: s.resource,
    property: `overhand knot ${kind} in a ${String(width)} mm two-ply cord`,
    value: v7Json({ outcome, ...value }),
    method,
    condition: 'bare hands; no tool, anchor, attachment or added cord',
    verified: true,
  });
}

function pause(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
): V7HandlerResult {
  j.status = 'paused';
  j.reason = reason;
  c.emit(
    'cord-knot-paused',
    `${reason} Paid stages, the reserved cord and its configuration are kept; nothing was spent.`,
    { ...summary(c.world, j), requiredEnergy: STEP },
    j.target ?? j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id] };
}
/** Releases the reservation once; an untucked loop has no crossing that holds and springs open. */
function release(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  reason: string,
  ground: boolean,
) {
  const s = targetOf(w, j),
    sprang = !!s && shapeOf(s) === 'loop';
  j.x = a.position.x;
  j.y = a.position.y;
  workStop(w, a, j, reason, ground);
  if (s && sprang) straighten(w, s, 'released-loop-sprang-open');
  else if (s) knotOf(s).workId = null;
  return { s, sprang };
}
function stop(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
): V7HandlerResult {
  const { s } = release(c.world, c.actor, j, reason, false);
  c.emit(
    'cord-knot-stopped',
    `${reason} Nothing is refunded.`,
    summary(c.world, j),
    s?.id ?? j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}
function finish(
  c: V7ActionContext,
  j: CollectiveWork,
  s: V7Stack,
): V7HandlerResult {
  delete s.reservedFor;
  knotOf(s).workId = null;
  j.status = 'completed';
  j.outputs = [s.id];
  sync(c.actor, j);
  return { complete: true, remaining: 0, writes: [j.id, s.id] };
}
function progress(
  c: V7ActionContext,
  j: CollectiveWork,
  s: V7Stack,
  stage: string,
  before: V7Data,
  measured: V7Data,
  note: string,
): V7HandlerResult {
  const cond = F.conditionOf(s);
  c.emit(
    'cord-knot-stage',
    `Paid round ${String(j.completedWork)} (${stage}): ${note}`,
    {
      ...summary(c.world, j),
      round: j.completedWork,
      operation: stage,
      before,
      after: geometryOf(s),
      conditionBefore: cond,
      conditionAfter: cond,
      handPinch: PINCH,
      ...measured,
    },
    s.id,
  );
  sync(c.actor, j);
  return {
    complete: false,
    remaining: j.remainingWork,
    writes: [j.id, s.id],
  };
}
/** A measured geometric or bending limit ends the work at this paid stage; the cord stays as it is. */
function infeasible(
  c: V7ActionContext,
  j: CollectiveWork,
  s: V7Stack,
  stage: string,
  outcome: string,
  problem: string,
  before: V7Data,
  measured: V7Data,
): V7HandlerResult {
  release(
    c.world,
    c.actor,
    j,
    `Measured at ${stage}: ${problem}. The cord is released as it is; the round's energy is not refunded.`,
    false,
  );
  knotOf(s).last = outcome;
  remember(
    c,
    s,
    'attempt',
    outcome,
    { stage, problem, ...measured },
    `${String(j.completedWork)} paid round(s) of bare-hand tying`,
  );
  c.emit(
    'cord-knot-infeasible',
    `Measured at ${stage}: ${problem}. The cord is released as it actually is; nothing is refunded.`,
    {
      ...summary(c.world, j),
      operation: stage,
      outcome,
      problem,
      before,
      after: geometryOf(s),
      condition: F.conditionOf(s),
      ...measured,
    },
    s.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, s.id] };
}

/** One paid attempt stage on the re-read cord: lay and bend a loop, pass the end, dress and check. */
function tie(c: V7ActionContext, j: CollectiveWork, s: V7Stack) {
  const w = c.world,
    n = num(j.offset) + j.completedWork - 1,
    stage = TIE[n] ?? '',
    g = plan(w, s),
    k = knotOf(s),
    before = geometryOf(s);
  if (!g) return stop(c, j, 'The cord has no measurable geometry.');
  if (n === 0) {
    if (g.bend === null)
      return infeasible(
        c,
        j,
        s,
        stage,
        'no-loop',
        'the strands resisted bending into a loop, so no loop formed',
        before,
        {},
      );
    const free = g.length - g.standing - 2 * Math.PI * g.lay,
      measured = {
        tightestLoopRadius: m(g.lay),
        workingEndAfterLoop: m(free),
      };
    if (free < PINCH - 1e-9)
      return infeasible(
        c,
        j,
        s,
        stage,
        'loop-too-large',
        `the tightest loop it took (radius ${String(m(g.lay))} m) leaves ${String(m(Math.max(0, free)))} m of end; holding it needs ${String(PINCH)} m`,
        before,
        measured,
      );
    configure(w, s, shape('loop', g.width, g.length, g.lay, g.standing), {
      workId: j.id,
    });
    return progress(
      c,
      j,
      s,
      stage,
      before,
      measured,
      `a loop of radius ${String(m(g.lay))} m with one crossing is held; it is no knot.`,
    );
  }
  const lay = num(n === 1 ? k.loopRadius : k.lobeRadius),
    standing = num(k.standingTail);
  if (n === 1) {
    const free = g.length - standing - knotPath(lay, g.width);
    if (free < PINCH - 1e-9)
      return infeasible(
        c,
        j,
        s,
        stage,
        'end-too-short',
        `passing the end through the loop leaves ${String(m(Math.max(0, free)))} m beyond it; pinching it needs ${String(PINCH)} m`,
        before,
        { endBeyondLoop: m(free) },
      );
    configure(w, s, shape('tucked', g.width, g.length, lay, standing), {
      workId: j.id,
    });
    return progress(
      c,
      j,
      s,
      stage,
      before,
      { endBeyondLoop: m(free) },
      'the end passed through the loop: three crossings, not yet dressed or checked.',
    );
  }
  // Dressing seats the lobes against the bend limit; the slack goes evenly into both tails.
  const lobe = Math.min(lay, g.lobe),
    seated = shape(
      'tied',
      g.width,
      g.length,
      lobe,
      standing + (knotPath(lay, g.width) - knotPath(lobe, g.width)) / 2,
    ),
    tail = Math.min(num(seated.standingTail), num(seated.workingTail)),
    need = F.END + g.width,
    held = tail >= need - 1e-9,
    value = {
      lobeRadius: num(seated.lobeRadius),
      knotPath: num(seated.knotPath),
      standingTail: num(seated.standingTail),
      workingTail: num(seated.workingTail),
      extent: num(seated.extent),
      endToEnd: num(seated.endToEnd),
      tailNeeded: m(need),
    };
  if (held) configure(w, s, seated, { last: 'tied', tiedAt: w.tick });
  else straighten(w, s, 'slipped-on-release');
  remember(
    c,
    s,
    'attempt',
    held ? 'tied' : 'slipped',
    value,
    'three paid rounds of bare-hand tying, dressing and a release check',
  );
  const data: V7Data = {
    ...summary(w, j),
    round: j.completedWork,
    operation: stage,
    outcome: held ? 'tied' : 'slipped',
    before,
    after: geometryOf(s),
    condition: F.conditionOf(s),
    ...value,
  };
  const done = finish(c, j, s);
  data.status = j.status;
  data.nextStage = null;
  data.visual = view(w, s);
  c.emit(
    held ? 'cord-knot-tied' : 'cord-knot-slipped',
    held
      ? `Dressed and released: an overhand knot holds its three crossings, ${String(value.knotPath)} m of cord in the knot and tails of ${String(value.standingTail)} and ${String(value.workingTail)} m. Its load behavior is untested.`
      : `Released after dressing: the ${String(m(tail))} m tail was shorter than the ${String(m(need))} m a crossing needs on twisted cord, so the end slipped out and the cord lies straight.`,
    data,
    s.id,
  );
  return done;
}

/** One paid untie stage: draw the end back out of the loop, then open the loop. */
function untie(c: V7ActionContext, j: CollectiveWork, s: V7Stack) {
  const w = c.world,
    n = j.completedWork - 1,
    stage = UNTIE[n] ?? '',
    k = knotOf(s),
    before = geometryOf(s),
    cond = F.conditionOf(s);
  if (n === 0) {
    const jammed =
        num(k.lobeRadius) <= num(k.width) + 1e-9 &&
        trialsOf(s).some((t) => num(t.loadShare) >= F.ONSET),
      problem = jammed
        ? 'the passes are pressed into each other by an earlier load and the fingers cannot open the crossings'
        : cond < F.SOUND
          ? 'too many strands at the crossings are broken to draw the end back without parting them'
          : null;
    if (problem) {
      release(
        w,
        c.actor,
        j,
        `The knot resisted untying: ${problem}. It stays as it is; nothing is refunded.`,
        false,
      );
      remember(
        c,
        s,
        'untie',
        jammed ? 'jammed' : 'damaged',
        { problem, condition: cond },
        'a paid bare-hand untying round',
      );
      c.emit(
        'cord-knot-resisted',
        `The knot resisted untying: ${problem}. It stays tied; nothing is refunded.`,
        {
          ...summary(w, j),
          operation: stage,
          problem,
          before,
          condition: cond,
        },
        s.id,
      );
      sync(c.actor, j);
      return { complete: true, writes: [j.id, s.id] };
    }
    const g = shape(
      'loop',
      num(k.width),
      Number(F.part(s).overall),
      num(k.lobeRadius),
      num(k.standingTail),
    );
    configure(w, s, g, { workId: j.id });
    return progress(
      c,
      j,
      s,
      stage,
      before,
      {},
      'the end was drawn back out; one crossing of an open loop remains.',
    );
  }
  straighten(w, s, 'untied');
  remember(
    c,
    s,
    'untie',
    'untied',
    { condition: cond },
    'two paid bare-hand untying rounds',
  );
  const data: V7Data = {
    ...summary(w, j),
    operation: stage,
    before,
    after: geometryOf(s),
    condition: cond,
  };
  const done = finish(c, j, s);
  data.status = j.status;
  data.nextStage = null;
  data.visual = view(w, s);
  c.emit(
    'cord-knot-untied',
    'Untied: the crossings were reversed and the same cord lies straight; any set from bending is not represented.',
    data,
    s.id,
  );
  return done;
}

/** One paid round after rechecking the reserved cord, hands, footing, room and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const w = c.world;
  if (!open(j)) throw new Error('This knot work is already settled.');
  const s = targetOf(w, j);
  if (!s || s.reservedFor !== j.id || s.owner !== c.actor.id)
    return stop(c, j, 'The reserved cord is missing.');
  if (F.conditionOf(s) < F.SOUND && j.mode === 'attempt')
    return stop(
      c,
      j,
      'More than half of the strands are now broken; the cord cannot be bent into a knot.',
    );
  const blocked = F.crowded(w, c.actor, Number(F.part(s).overall));
  if (blocked) return pause(c, j, `No room to work: ${blocked}.`);
  if (c.actor.vitals.energy < STEP)
    return pause(c, j, 'Not enough energy for the next paid round.');
  const resumed = j.status === 'paused';
  if (!workPay(c, j, STEP))
    throw new Error('Energy changed before the paid round.');
  c.actor.vitals.energy = v7RoundNumber(Math.max(0, c.actor.vitals.energy));
  j.paidEnergy = v7RoundNumber(j.paidEnergy);
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  if (resumed)
    c.emit(
      'cord-knot-resumed',
      'Unfinished knot work resumed after rechecking the cord, hands, footing, room and energy.',
      summary(w, j),
      s.id,
    );
  return j.mode === 'untie' ? untie(c, j, s) : tie(c, j, s);
}

function start(c: V7ActionContext, mode: string): V7HandlerResult {
  const w = c.world,
    a = c.actor;
  if (current(w, a))
    throw new Error(
      'Unfinished knot work exists; resume it with its mode and workId, or cancel it. Nothing was spent.',
    );
  if (c.action.args.workId !== undefined)
    throw new Error(
      'No unfinished knot work of yours has this workId; nothing was spent.',
    );
  const s = ownCord(c),
    state = shapeOf(s),
    p = F.part(s);
  if (mode === 'attempt') {
    if (v7String(c.action.args.knot, 'knot') !== 'overhand')
      throw new Error(
        'Only an overhand knot in a single cord is supported in this version; nothing was spent.',
      );
    if (state === 'tied')
      throw new Error(
        'This cord already holds a tied overhand; untie it first. Nothing was spent.',
      );
  } else if (state !== 'tucked' && state !== 'tied')
    throw new Error('This cord holds no knot to untie; nothing was spent.');
  if (!F.material(w, s.resource) || !F.STRANDS[s.resource])
    throw new Error(
      'No strand law exists for this material, so its bending is not represented; nothing was spent.',
    );
  if (p.plied !== true || !(Number(p.plyDiameter) > 0))
    throw new Error(
      'The item has no represented two-ply section; nothing was spent.',
    );
  if (F.conditionOf(s) < F.SOUND && mode === 'attempt')
    throw new Error(
      'More than half of the strands are broken; the cord cannot be bent into a knot. Nothing was spent.',
    );
  const width = 2 * Number(p.plyDiameter),
    overall = Number(p.overall);
  if (mode === 'attempt' && state === 'straight' && overall < shortest(width))
    throw new Error(
      `The cord is ${String(overall)} m long; any overhand in a cord ${String(m(width))} m wide needs at least ${String(m(shortest(width)))} m. Nothing was spent.`,
    );
  const blocked = F.crowded(w, a, overall);
  if (blocked)
    throw new Error(`No room to work: ${blocked}. Nothing was spent.`);
  if (a.vitals.energy < STEP)
    throw new Error(
      'Not enough energy for the first paid round; nothing was reserved.',
    );
  // A loose undressed knot left by cancelled work needs only the dressing round.
  const offset = mode === 'attempt' && state === 'tucked' ? 2 : 0,
    j = workCreate(c, mode, (mode === 'untie' ? 2 : 3) - offset);
  j.offset = offset;
  s.reservedFor = j.id;
  j.escrow.push(s.id);
  j.target = s.id;
  j.sources.push({
    itemId: s.id,
    escrowId: s.id,
    resource: s.resource,
    quantity: s.quantity,
    owner: a.id,
    origin: s.origin,
    harvestedAt: s.harvestedAt ?? null,
    decay: s.decay ?? 0,
  });
  configure(w, s, geometryOf(s), { workId: j.id });
  c.emit(
    'cord-knot-started',
    mode === 'untie'
      ? 'The knotted cord is reserved and held for untying with bare hands.'
      : `The cord is reserved and held for a bare-hand overhand knot${offset ? ' (dressing only: the end is already through)' : ''}; no tool, anchor, attachment or added cord is used.`,
    { ...summary(w, j), knot: 'overhand', cordBefore: geometryOf(s) },
    s.id,
  );
  return advance(c, j);
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    { workId, targetId } = c.action.args;
  if ((workId === undefined) === (targetId === undefined))
    throw new Error(
      'Inspect needs exactly one of targetId or workId; nothing was spent.',
    );
  const j =
    typeof workId === 'string'
      ? ownJobs(w, a).find((x) => x.id === workId)
      : undefined;
  if (typeof workId === 'string' && !j)
    throw new Error(
      'No knot work of yours has this workId; nothing was spent.',
    );
  const s = j ? targetOf(w, j) : ownCord(c, false);
  if (!s)
    throw new Error(
      'The cord of this work no longer exists; nothing was spent.',
    );
  v7Spend(a, LOOK);
  const trials = trialsOf(s),
    value: V7Data = {
      ...(j ? summary(w, j) : {}),
      ...F.look(w, s),
      knot: view(w, s),
      knotTrials: trials,
      lastKnotTrial: trials.at(-1) ?? null,
      knottedBreakingForce: null,
      unknown:
        'knotted breaking force, safe load and behavior under other loads are not determined by inspection',
    };
  openRemember(c, {
    key: `${s.id}:cord-knot-geometry`,
    subject: s.id,
    property:
      'knot state, crossings, lobe size, knot path, tails, condition and recorded tests',
    value: v7Json(value),
    method: 'direct inspection',
    condition: 'visible and measurable features only; no load is applied',
    verified: false,
  });
  c.emit(
    'cord-knot-inspected',
    'Only visible knot geometry, condition and recorded tests are reported; no load was applied and nothing was changed.',
    value,
    s.id,
  );
  return { complete: true, writes: [] };
}

/** fiber-cord@1's opposing two-hand trial, carried through the knot by cord-knot@1. */
function trial(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    s = ownCord(c);
  if (shapeOf(s) !== 'tied')
    throw new Error(
      'targetId must be your own cord holding a dressed, release-checked overhand; trial an untied cord with hand-twist-fiber-cord. Nothing was spent.',
    );
  const r = F.material(w, s.resource),
    law = F.STRANDS[s.resource];
  if (!r || !law) throw new Error('No strand law applies; nothing was spent.');
  const force = v7Number(c.action.args.trialForce, 'trialForce', 0, MAX_FORCE),
    seconds = v7Number(
      c.action.args.trialDuration,
      'trialDuration',
      0,
      MAX_SECONDS,
    );
  if (!(force > 0) || !(seconds > 0))
    throw new Error(
      'trialForce and trialDuration must be above zero; nothing was spent.',
    );
  if (foodTenths(s.quantity) < 2)
    throw new Error(
      'A load trial needs at least 0.2 units so that a break leaves two inventory lots; nothing was spent.',
    );
  const k = knotOf(s),
    standingTail = num(k.standingTail),
    workingTail = num(k.workingTail),
    tails = [standingTail, workingTail],
    shortTail = Math.min(standingTail, workingTail);
  if (shortTail < CLEAR - 1e-9)
    throw new Error(
      `The tails are ${String(standingTail)} and ${String(workingTail)} m; each hand needs ${String(m(CLEAR))} m (a ${String(F.HOLD)} m grip kept ${String(m(CLEAR - F.HOLD))} m clear of the knot). No force was applied; nothing was spent.`,
    );
  const blocked = F.crowded(w, a, num(k.endToEnd));
  if (blocked)
    throw new Error(`No room to work: ${blocked}. Nothing was spent.`);
  v7Spend(a, TRIAL);
  const p = F.part(s),
    before = geometryOf(s),
    cond = F.conditionOf(s),
    diameter = Number(p.plyDiameter),
    area = (Math.PI * diameter * diameter) / 4,
    length = Number(p.length),
    overall = Number(p.overall),
    // cord-knot@1, part 3: outer strands of a lobe follow the longer path (R + width/2)/R.
    concentration = 1 + num(k.width) / (2 * num(k.lobeRadius)),
    hand = (F.HAND_PULL * Math.max(0, Math.min(100, a.vitals.health))) / 100,
    grip = F.GRIP * 2 * diameter,
    limit = Math.min(force, hand, grip),
    strength = F.breaking(r, law, area, cond) / concentration,
    outcome =
      strength <= limit
        ? 'broke'
        : force > grip && grip <= hand
          ? 'grip-lost'
          : 'held',
    achieved = outcome === 'broke' ? strength : limit,
    ratio = Math.min(1, achieved / Math.max(1e-12, strength)),
    damage = Math.max(0, ratio - F.ONSET),
    after = v7RoundNumber(cond * (1 - damage)),
    span = standingTail + workingTail - 2 * F.HOLD + num(k.knotPath),
    stiffness = law.modulus * F.weakening(law, r) * F.EFFICIENCY * 2 * area,
    extension = (achieved * span) / stiffness,
    creep =
      outcome === 'held'
        ? law.creep * F.wetness(r) * ratio * (seconds / F.ROUND_SECONDS) * span
        : 0,
    result = {
      tick: w.tick,
      actor: a.id,
      item: s.id,
      law: LAW,
      reuses: `${F.LAW} opposing two-hand trial`,
      outcome,
      requestedForce: force,
      achievedForce: F.newtons(achieved),
      handLimit: force > hand && hand < grip ? F.newtons(hand) : null,
      gripSlippedAt: outcome === 'grip-lost' ? F.newtons(grip) : null,
      requestedDuration: seconds,
      heldSeconds: outcome === 'held' ? seconds : 0,
      // An overhand in one cord loaded by both tails cannot spill; seated, it has no slack to slide.
      knotSlipped: false,
      breakAt: outcome === 'broke' ? 'knot' : null,
      gripTails: tails,
      freeSpan: m(span),
      elasticExtension: m(extension),
      retainedDeformation: m(creep),
      strandsBroken: v7RoundNumber(damage),
      conditionBefore: cond,
      conditionAfter: after,
    },
    entry = {
      tick: w.tick,
      outcome,
      requestedForce: force,
      achievedForce: result.achievedForce,
      heldSeconds: result.heldSeconds,
      loadShare: v7RoundNumber(ratio),
      conditionBefore: cond,
    },
    trials = [...trialsOf(s), entry].slice(-4);
  const outputs: V7Stack[] = [];
  if (outcome === 'broke') {
    // As in fiber-cord@1, the cord parts into two owned fragments of conserved fiber, here at the knot.
    const n = foodTenths(s.quantity),
      ids = [v7Id(w, 'item'), v7Id(w, 'item')],
      frayed = Number(p.frayedEnds ?? 0);
    [Math.floor(n / 2), n - Math.floor(n / 2)].forEach((q, i) => {
      const f: V7Stack = {
        ...v7Clone(s),
        id: ids[i] ?? '',
        quantity: q / 10,
        quantityTenths: q,
        position: { ...a.position },
      };
      const fp = {
        ...v7Clone(p),
        role: 'fragment',
        status: 'broken',
        condition: after,
        length: m(length / 2),
        twisted: m(length / 2),
        overall: m(overall / 2),
        frayedEnds: Math.min(2, 1 + (frayed > i ? 1 : 0)),
        fragmentOf: s.id,
        fragments: ids,
      };
      f.processing = {
        ...v7Clone(s.processing ?? {}),
        [F.PART]: fp,
        [KNOT]: {
          law: LAW,
          revision: REVISION,
          knot: null,
          ...shape('straight', 2 * diameter, m(overall / 2)),
          priorRole: 'fragment',
          workId: null,
          trials,
          last: 'broke-at-knot',
          fragmentOf: s.id,
          fragments: ids,
          updatedAt: w.tick,
        },
      };
      outputs.push(f);
    });
    w.stacks = w.stacks.filter((x) => x !== s);
    w.stacks.push(...outputs);
  } else {
    p.condition = after;
    k.trials = trials;
    const stretched = m(length + creep);
    if (stretched > length) {
      // fiber-cord@1's retained stretch keeps volume; the lobes keep their radius and the tails take it.
      const grown = m(overall + stretched - length);
      p.length = stretched;
      p.twisted = stretched;
      p.overall = grown;
      p.plyDiameter = diameter * Math.sqrt(length / stretched);
      k.standingTail = m(standingTail + (grown - overall) / 2);
      k.workingTail = m(grown - num(k.knotPath) - num(k.standingTail));
      k.endToEnd = m(num(k.standingTail) + num(k.extent) + num(k.workingTail));
    }
  }
  remember(
    c,
    s,
    `trial-${F.band(cond)}`,
    outcome,
    result,
    `opposing two-hand pull of ${String(result.achievedForce)} N on both tails`,
  );
  const data = {
    ...result,
    before,
    after: outputs.length ? null : geometryOf(s),
    visual: outputs.length
      ? outputs.map((f) => view(w, f))
      : [
          {
            ...view(w, s),
            trial: {
              outcome,
              achievedForce: result.achievedForce,
              heldSeconds: result.heldSeconds,
            },
          },
        ],
    fragments: outputs.map((f) => f.id),
    energy: TRIAL,
  };
  c.emit(
    'cord-knot-trial',
    outcome === 'broke'
      ? `The knotted cord broke at the knot at ${String(result.achievedForce)} N into two owned fragments of the same fiber.`
      : outcome === 'grip-lost'
        ? `The tails slipped through the hands at ${String(result.achievedForce)} N; the trial stopped.`
        : `The knot held ${String(result.achievedForce)} N for ${String(seconds)} s between both tails. A pass means only this force for this time, not a safe load.`,
    data,
    outputs[0]?.id ?? s.id,
  );
  if (damage > 0 && outcome !== 'broke')
    c.emit(
      'cord-knot-damaged',
      `About ${String(Math.round(damage * 100))}% of the strands broke under the load.`,
      data,
      s.id,
    );
  if (outcome === 'broke')
    c.emit(
      'cord-knot-broken',
      'Broken at the knot: two owned fragments with all of its fiber; the knot is gone and nothing vanished.',
      data,
      outputs[0]?.id ?? null,
    );
  return {
    complete: true,
    writes: outputs.length ? outputs.map((f) => f.id) : [s.id],
  };
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    workId = c.action.args.workId,
    j = current(w, c.actor);
  if (!j || (typeof workId === 'string' && workId !== j.id))
    throw new Error(
      'No unfinished knot work of yours to cancel; nothing was spent.',
    );
  const { s, sprang } = release(
    w,
    c.actor,
    j,
    'Cancelled; the cord is released once as it actually is. Paid energy is not refunded.',
    false,
  );
  c.emit(
    'cord-knot-cancelled',
    sprang
      ? 'Knot work cancelled: the untucked loop sprang open when released, so the cord lies straight; nothing is refunded.'
      : 'Knot work cancelled: the cord keeps its actual configuration; nothing is refunded or untied.',
    { ...summary(w, j), sprangOpen: sprang },
    s?.id ?? j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = v7String(c.action.args.mode, 'mode'),
    j = current(c.world, c.actor);
  if (!ARGS[mode]) throw new Error('Unknown knot mode.');
  // The bound action continues each round; naming the work with its mode resumes it.
  if (j && j.mode === mode && c.operation?.first === false)
    return advance(c, j);
  if (j && WORK.includes(mode) && c.action.args.workId === j.id) {
    relevant(c, mode, ['workId']);
    if (j.mode !== mode)
      throw new Error(
        `This work is ${j.mode}; resume it with mode ${j.mode} and its workId. Nothing was spent.`,
      );
    return advance(c, j);
  }
  if (c.operation?.first === false && WORK.includes(mode))
    throw new Error('The bound knot work is already settled.');
  relevant(c, mode);
  if (mode === 'attempt' || mode === 'untie') return start(c, mode);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'trial') return trial(c);
  return cancel(c);
}

/** The reserved cord stays in the owner's hands; an unworked round pauses; a knotted cord wears once. */
function environment(w: V7World) {
  for (const j of collectiveJobs(w, ID).filter(open)) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a) continue;
    j.x = a.position.x;
    j.y = a.position.y;
    for (const s of w.stacks.filter((s) => s.reservedFor === j.id))
      s.position = { ...a.position };
    if (j.status === 'active' && j.lastPaid < w.tick) {
      j.status = 'paused';
      j.reason =
        'Not worked this round; paid stages, the reserved cord and its configuration are kept.';
      forestEvent(
        w,
        'cord-knot-paused',
        'Knot work paused because it was not worked this round; nothing was spent.',
        a.position,
        a.id,
        summary(w, j),
        j.target ?? j.id,
      );
    }
    sync(a, j);
  }
  // fiber-cord@1 wears its cords, fragments and workpieces; a knotted cord wears here at its rate.
  for (const s of w.stacks) {
    const p = s.processing?.[F.PART];
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const cond = Number(p.condition ?? 0);
    if (p.role === 'knotted' && cond > 0)
      p.condition = v7RoundNumber(Math.max(0, cond - F.WEAR));
  }
}

export const LONG_CORD_KNOT: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex16',
  dependencies: ['foundation-open@1', 'hand-twist-fiber-cord@1'],
  description:
    'General bare-hand overhand knot in an owned fiber-cord@1 cord: three paid tying rounds on a conserved centreline under the cord-knot@1 bend, contact and tail rules, inspection, a bounded two-hand trial through the knot that reuses the fiber-cord@1 trial, untying and cancel. No reward, rating or added material.',
  reuse: {
    experiment:
      'ex16 hand-twist-fiber-cord@1 (cord item, geometry, condition, strand law, grip, trial, damage, fragments, wear and visual metadata, called through its exported FIBER_CORD); ex16 hand-break-food@1 and hand-weave-fiber-mat@1 (exact-id inputs, staged escrowed work, pause, resume by workId, cancel, death)',
    source:
      'long-fiber-cord.ts FIBER_CORD (STRANDS, breaking, weakening, wetness, crowded, view, look, conditionOf, part, roleOf, metres, newtons, band and constants); collective-work.ts (paid work, stop); open-physical.ts (engine bend index); open-foundation.ts (personal records); forest-climate.ts (events)',
    description:
      'Implementation reuse only; hand-twist-fiber-cord@1 behavior and ability text are unchanged and cord-making mastery is not required. Only the knot path, bend, contact, tail, release, stress-concentration, untie and jam rules are new, registered as cord-knot@1.',
  },
  abilities: [
    {
      id: ID,
      name: 'Hand-tie cord knot',
      function:
        'Tie an overhand knot in your own finished fiber cord with bare hands in three paid rounds, inspect it, load-trial it by its two tails, untie it, or cancel; the actual cord and its material decide results.',
      equivalence: 'cordage:hand-tied-overhand-knot:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['attempt', 'inspect', 'trial', 'untie', 'cancel'],
          },
          targetId: { type: 'string' },
          knot: { type: 'string', enum: ['overhand'] },
          workId: { type: 'string' },
          trialForce: { type: 'number', minimum: 0, maximum: MAX_FORCE },
          trialDuration: { type: 'number', minimum: 0, maximum: MAX_SECONDS },
        }),
        required: ['mode'],
      },
      references: {},
      prerequisites: [],
      learning: 3,
      learningEnergy: 0.2,
      costs:
        'Study: 3 rounds at 0.2 energy. targetId: exact id of your own unreserved cord or cord fragment from hand-twist-fiber-cord. attempt (knot: overhand): reserves the cord, then 3 paid rounds of 0.5 energy (lay-bend-loop, pass-end-through, dress-release-check), continuing each round; a loose undressed knot needs only the last; resume with attempt and workId only. inspect (targetId or workId): 1 round, 0.2. trial (a tied knot; trialForce N above 0 to 10; trialDuration s above 0 to 60): 1 round, 0.5. untie (a knot): 2 paid rounds of 0.5 (draw-end-back, open-loop). cancel: none. Work needs dry footing and nobody within your radius plus half the cord. Unworked rounds or low energy pause uncharged; refusals and irrelevant arguments spend nothing; nothing is refunded.',
      effects:
        "Law cord-knot@1 on the same item: width = 2 ply diameters; the centreline (overall length) is conserved as two tails plus the knot path. Lobes bend no tighter than one width nor than the bend limit of the cord's material, which the first round measures; the knot path is 3 pi x lobe radius + width, centred. A loop needs a 0.02 m opening and each hand a 0.02 m pinch: a loop leaving too little end, or an end too short to pass and pinch, ends that paid stage. Dressing seats the lobes; a tail shorter than 0.02 m + width slips out on release, else the knot is tied. Trial: a 0.05 m grip per tail kept 0.01 m clear of the knot; force = min(trialForce, 200 N x health/100, 10000 N/m x width); knotted breaking force = fiber-cord breaking force / (1 + width / (2 x lobe radius)); it records extension, creep, strand damage above half that force, or a break at the knot into two owned fragments. A knot loaded by both tails cannot spill. Untying needs condition 0.5, and passes that touch after half the breaking force jam. A released untucked loop springs open. Knotted cord wears 0.0005 per round, once. A pass means only that force for that time. No reward, strength rating or extra material.",
      handler: 'long.hand-tie-cord-knot',
      revision: REVISION,
      authored: false,
      // The tied event carries no qualified flag: a knot earns no milestone.
      practiceEvidence: 'cord-knot-tied',
      dependencies: { abilities: [], resources: ['reed'], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Paid stages persist across interruption; resuming by workId pays only the next stage after rechecks. Other modes take one round.',
      },
    },
  ],
  handlers: { 'long.hand-tie-cord-knot': execute },
  processes: {},
  visualComponents: [],
  events: [
    'cord-knot-started',
    'cord-knot-stage',
    'cord-knot-infeasible',
    'cord-knot-paused',
    'cord-knot-resumed',
    'cord-knot-tied',
    'cord-knot-slipped',
    'cord-knot-resisted',
    'cord-knot-untied',
    'cord-knot-cancelled',
    'cord-knot-stopped',
    'cord-knot-inspected',
    'cord-knot-trial',
    'cord-knot-damaged',
    'cord-knot-broken',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath(w, a) {
    for (const j of ownJobs(w, a).filter(open)) {
      const { s } = release(
        w,
        a,
        j,
        'Performer died; the cord was left where they died, once, as it actually is. Nothing is refunded.',
        true,
      );
      forestEvent(
        w,
        'cord-knot-stopped',
        'Knot work stopped by death; the cord lies where the person died in its actual configuration.',
        a.position,
        a.id,
        summary(w, j),
        s?.id ?? j.id,
      );
      sync(a, j);
    }
  },
};
