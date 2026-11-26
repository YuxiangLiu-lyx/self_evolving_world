import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Json,
  V7Package,
  V7Point,
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
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { materialPortion } from './material-lots.js';
import { openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workCreate,
  workPay,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import { FIBER_CORD as F } from './long-fiber-cord.js';
import { CORD_KNOT as K } from './long-cord-knot.js';
import { CORD_BEND as B } from './long-fiber-cord-join.js';
import { CROSSING_CONTACT as X } from './long-crossing-binding.js';

const ID = 'hand-lash-crossing';
const REVISION = `${ID}@1`;
const STATE = `long:work:${ID}`;
/** Processing key of one item's part in a lashing; the lashing is a relation of three items. */
const KEY = 'crossingLashing';
const LAW = 'multi-turn-contact@1';
const METHOD = 'adjacent-turns-overhand-closure';
const PREFIX = 'crossing-lashing-';
/** Energy of one attempt or untie round, of an inspection and of a trial. */
const STEP = 0.5;
const LOOK = 0.2;
const TRIAL = 0.5;
/** Supported adjacent turns; one wrap stays with hand-bind-crossing@1. */
const TURNS = { min: 2, max: 4 };
/** Hull directions sampled per turn (half a degree) and sub-steps per contact arc. */
const SAMPLES = 720;
const SUBSTEPS = 24;
/** Schematic centreline points kept per turn (every 30 degrees of the hull). */
const VIEW_POINTS = 12;
/** Arguments each mode accepts besides mode; any other supplied argument is refused. */
const ARGS: Partial<Record<string, string[]>> = {
  attempt: ['pieceIds', 'cordId', 'crossingAngle', 'wrapCount', 'workId'],
  inspect: ['bindingId', 'workId'],
  trial: ['bindingId', 'trialForce', 'trialDuration', 'trialDirection'],
  untie: ['bindingId', 'workId'],
  cancel: ['workId'],
};
const WORK = ['attempt', 'untie'];
const ROLES = ['cord', 'fragment'];
type State =
  'separate' | 'positioned' | 'routed' | 'tucked' | 'bound' | 'opened';
type Part = 'top' | 'bottom' | 'cord';
/** States whose closure holds without hands: the three items stay a linked assembly. */
const RETAINED: State[] = ['tucked', 'bound'];

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const record = (v: unknown): V7Data =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as V7Data) : {};
const num = (v: unknown) => (typeof v === 'number' ? v : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const numbers = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((x) => num(x)) : [];
const records = (v: unknown): V7Data[] =>
  Array.isArray(v) ? v.map(record) : [];
const m = F.metres;
const mm = (x: number) => Math.round(x * 1e4) / 10;
const rad = (d: number) => (d * Math.PI) / 180;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const sum = (list: number[]) => list.reduce((s, x) => s + x, 0);
const tieStages = (n: number) => [
  'measure-position',
  ...range(n).map((i) => `route-turn-${String(i + 1)}`),
  'form-tuck-closure',
  'dress-release-check',
];
const untieStages = (n: number) => [
  'withdraw-closure-end',
  ...range(n).map((i) => `unwrap-turn-${String(n - i)}`),
];
const recOf = (s: V7Stack) => record(s.processing?.[KEY]);
function stateOf(s: V7Stack): State {
  const v = recOf(s).state;
  return v === 'positioned' ||
    v === 'routed' ||
    v === 'tucked' ||
    v === 'bound' ||
    v === 'opened'
    ? v
    : 'separate';
}
const trialsOf = (s: V7Stack): V7Data[] => records(recOf(s).trials);
type Emit = (
  type: string,
  description: string,
  data: V7Data,
  target: string | null,
) => void;
const emitter =
  (c: V7ActionContext): Emit =>
  (type, description, data, target) => {
    c.emit(type, description, data, target);
  };
const announcer =
  (w: V7World, a: V7Actor): Emit =>
  (type, description, data, target) => {
    forestEvent(w, type, description, a.position, a.id, data, target);
  };

type Piece = NonNullable<ReturnType<typeof X.measurePiece>>;
type Cord = NonNullable<ReturnType<typeof X.measureCord>>;
/** A piece measured under the crossing-contact@1 branch law; damage from either binding counts. */
function measurePiece(w: V7World, s: V7Stack): Piece | null {
  const p = X.measurePiece(w, s),
    own = recOf(s).condition;
  return p
    ? {
        ...p,
        condition: Math.min(p.condition, typeof own === 'number' ? own : 1),
      }
    : null;
}
const pieceCondition = (w: V7World, s: V7Stack) =>
  measurePiece(w, s)?.condition ?? 1;

/** multi-turn-contact@1, part 1: one turn's plane cuts each piece in an ellipse (semi-axes r / sin
 * beta across and r up). Shifting the plane by d along its normal moves the top section by
 * d tan(angle / 2) along the bisector and the bottom one by the same amount the other way. */
interface Ellipse {
  a: number;
  b: number;
  x: number;
  z: number;
}
/** The centreline of one turn: the convex hull of both sections offset by half a cord width, traced
 * by its support points (collision-free by construction). Spans are the turning angles over the top
 * piece before the bottom one, over the bottom piece and over the top piece again. */
interface Hull {
  planar: number;
  spans: [number, number, number];
  sides: [number, number];
  cos: [number, number];
  points: number[][];
}
function hull(top: Ellipse, bottom: Ellipse, width: number): Hull {
  const half = width / 2,
    pts: { x: number; z: number; top: boolean }[] = [];
  for (let j = 0; j <= SAMPLES; j++) {
    const phi = Math.PI / 2 - (2 * Math.PI * j) / SAMPLES,
      c = Math.cos(phi),
      s = Math.sin(phi),
      at = (e: Ellipse) => {
        const q = Math.sqrt(e.a * e.a * c * c + e.b * e.b * s * s);
        return {
          h: e.x * c + e.z * s + q,
          x: e.x + (e.a * e.a * c) / q + half * c,
          z: e.z + (e.b * e.b * s) / q + half * s,
        };
      },
      t = at(top),
      b = at(bottom);
    pts.push(
      t.h >= b.h - 1e-12
        ? { x: t.x, z: t.z, top: true }
        : { x: b.x, z: b.z, top: false },
    );
  }
  const step = (2 * Math.PI) / SAMPLES,
    spans: [number, number, number] = [0, 0, 0],
    sides: [number, number] = [0, 0],
    cos: [number, number] = [1, 1];
  let planar = 0,
    phase: 0 | 1 | 2 = 0;
  for (let j = 0; j < SAMPLES; j++) {
    const p = pts[j],
      q = pts[j + 1];
    if (!p || !q) continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    planar += d;
    if (p.top === q.top) {
      spans[phase] += step;
      continue;
    }
    // A straight side between the two sections: half the step turns on each.
    const side = p.top ? 0 : 1;
    spans[phase] += step / 2;
    phase = phase === 0 ? 1 : 2;
    spans[phase] += step / 2;
    sides[side] = d;
    cos[side] = d > 1e-12 ? Math.abs(q.z - p.z) / d : 1;
  }
  return {
    planar,
    spans,
    sides,
    cos,
    points: pts
      .filter((_, j) => j % (SAMPLES / VIEW_POINTS) === 0)
      .map((p) => [p.x, p.z]),
  };
}

/** One planned turn: its plane offset, planar hull, helical length, bark contact and sides. */
interface TurnPlan {
  index: number;
  offset: number;
  planar: number;
  length: number;
  contact: [number, number, number];
  sides: [number, number];
  cos: [number, number];
  points: number[][];
}
interface Stage {
  stage: string;
  occupied: number;
  need: number;
}
interface Plan {
  angle: number;
  beta: number;
  count: number;
  top: Piece;
  bottom: Piece;
  cord: Cord;
  pitch: number;
  turns: TurnPlan[];
  wrap: number;
  bridge: number;
  closureRadius: number;
  formRadius: number;
  closurePath: number;
  formPath: number;
  tailNeed: number;
  arcRadius: number;
  stages: Stage[];
  need: number;
  tails: number;
  stack: number;
  hold: number;
  lift: number;
  liftLimit: number;
  grips: [number, number];
  gripsFit: boolean;
  code: string | null;
  shortfall: string | null;
}
/** multi-turn-contact@1, parts 1-3, for one crossing angle (degrees) and turn count. */
function plan(
  a: V7Actor,
  top: Piece,
  bottom: Piece,
  cord: Cord,
  angle: number,
  count: number,
): Plan {
  const w = cord.width,
    L = cord.overall,
    theta = rad(angle),
    beta = (Math.PI - theta) / 2,
    sin = Math.sin(beta),
    shift = Math.cos(beta) / sin,
    bend = cord.bend ?? Infinity,
    rT = top.diameter / 2,
    rB = bottom.diameter / 2,
    // crossing-contact@1's sections give each piece's tightest radius and bridging share.
    sT = X.section(rT, w, sin, bend),
    sB = X.section(rB, w, sin, bend),
    bridged = [Math.min(1, sT.tight / bend), Math.min(1, sB.tight / bend)],
    at = (d: number) =>
      hull(
        { a: rT / sin, b: rT, x: d * shift, z: rT },
        { a: rB / sin, b: rB, x: -d * shift, z: -rB },
        w,
      ),
    centre = at(0),
    // Adjacent turns touch: one cord width apart measured square to the helical cord.
    pitch = w / Math.sqrt(Math.max(1e-9, 1 - (w / centre.planar) ** 2)),
    turns: TurnPlan[] = range(count).map((i) => {
      const offset = (i - (count - 1) / 2) * pitch,
        h = at(offset);
      return {
        index: i + 1,
        offset,
        planar: h.planar,
        // Each turn advances one pitch along the plane normal: a helix on the unrolled hull.
        length: Math.hypot(h.planar, pitch),
        contact: [
          h.spans[0] * (bridged[0] ?? 1),
          h.spans[1] * (bridged[1] ?? 1),
          h.spans[2] * (bridged[0] ?? 1),
        ],
        sides: h.sides,
        cos: h.cos,
        points: h.points.map(([x, z], j) => [
          m(x ?? 0),
          m(offset - pitch / 2 + (pitch * j) / VIEW_POINTS),
          m(z ?? 0),
        ]),
      };
    }),
    wrap = sum(turns.map((t) => t.length)),
    // The ends leave the outer turns' crowns on the top piece and ride one width up onto the
    // turns to meet in one closure over the middle of the band.
    bridge = Math.hypot((count * pitch) / (2 * sin), w),
    closureRadius = Math.max(bend, w),
    formRadius = Math.max(closureRadius, (K.OPENING + w) / 2),
    closurePath = Math.PI * closureRadius + w,
    formPath = Math.PI * formRadius + w,
    tailNeed = F.END + w,
    // While a turn is passed under the lifted crossing it hangs 2 x 0.02 m loose; the turns
    // before it are pinned on the hull by the holding hand.
    routing = turns.map(
      (_, k) => sum(turns.slice(0, k + 1).map((t) => t.length)) + 2 * K.OPENING,
    ),
    forming = wrap + 2 * K.OPENING + 2 * bridge + 2 * formPath,
    seated = wrap + 2 * bridge + 2 * closurePath,
    stages: Stage[] = [
      ...routing.map((o, k) => ({
        stage: `route-turn-${String(k + 1)}`,
        occupied: o,
        need: o + 2 * K.PINCH,
      })),
      {
        stage: 'form-tuck-closure',
        occupied: forming,
        need: forming + 2 * K.PINCH,
      },
      {
        stage: 'dress-release-check',
        occupied: seated,
        need: seated + 2 * tailNeed,
      },
    ],
    need = Math.max(...stages.map((s) => s.need)),
    stack = top.diameter + bottom.diameter,
    // From the second turn on, the holding hand closes round the crossing and the pinned turns.
    hold = stack + 2 * w,
    lift = (top.mass + bottom.mass) * X.GRAVITY,
    liftLimit =
      ((F.HAND_PULL / 2) * Math.max(0, Math.min(100, a.vitals.health))) / 100,
    band = ((count - 1) * pitch) / (2 * sin),
    // crossing-contact@1's grip site, moved out by half the band of turns along each piece.
    gripAt = (other: number, own: { a: number }) =>
      Math.max(other / Math.sin(theta), own.a * Math.cos(beta) + band) +
      w / 2 +
      (K.CLEAR - F.HOLD) +
      F.HOLD / 2,
    grips: [number, number] = [gripAt(rB, sT), gripAt(rT, sB)],
    gripsFit =
      grips[0] + F.HOLD / 2 <= top.length / 2 + 1e-9 &&
      grips[1] + F.HOLD / 2 <= bottom.length / 2 + 1e-9,
    worst = stages.reduce((x, y) => (y.need > x.need ? y : x)),
    code =
      cord.bend === null
        ? 'no-bend'
        : stack > X.HAND_SPAN + 1e-9 || hold > X.HAND_SPAN + 1e-9
          ? 'hand-span'
          : lift > liftLimit + 1e-9
            ? 'lift'
            : L < need - 1e-9
              ? 'too-short'
              : null,
    shortfall =
      code === 'no-bend'
        ? `the strands of ${cord.stack.id} resisted bending round the crossing, so no turn formed`
        : code === 'hand-span'
          ? stack > X.HAND_SPAN + 1e-9
            ? `the crossing is ${String(m(stack))} m thick; one hand closes round at most ${String(X.HAND_SPAN)} m to hold it while the other passes the cord`
            : `with a turn over and under it the crossing is ${String(m(hold))} m thick; one hand closes round at most ${String(X.HAND_SPAN)} m to pin the turns while the other passes the next`
          : code === 'lift'
            ? `lifting the crossing to pass the cord under it takes ${String(F.newtons(lift))} N; one hand gives ${String(F.newtons(liftLimit))} N`
            : code === 'too-short'
              ? `the cord is ${String(m(L))} m; ${String(count)} turns need ${String(m(need))} m at ${worst.stage}: ${String(m(wrap))} m of turns (${String(K.OPENING * 2)} m loose on the turn being passed), 2 x ${String(m(bridge))} m from the outer turns to the closure, a closure of 2 x ${String(m(formPath))} m forming and 2 x ${String(m(closurePath))} m seated, ${String(K.PINCH)} m to pinch each end and tails of ${String(m(tailNeed))} m`
              : null;
  return {
    angle,
    beta,
    count,
    top,
    bottom,
    cord,
    pitch,
    turns,
    wrap,
    bridge,
    closureRadius,
    formRadius,
    closurePath,
    formPath,
    tailNeed,
    arcRadius: Math.max(bend, Math.min(sT.tight, sB.tight)),
    stages,
    need,
    tails: (L - seated) / 2,
    stack,
    hold,
    lift,
    liftLimit,
    grips,
    gripsFit,
    code,
    shortfall,
  };
}
/** The shortest cord any lashing of this width and turn count needs whatever the pieces and angle:
 * turns round vanishing pieces, the 0.04 m routing opening, the bridges, a closure at the formation
 * opening and a pinch at each end. Visible before costs. */
const least = (width: number, count: number) =>
  count * Math.PI * width +
  2 * K.OPENING +
  2 * Math.hypot((count * width) / 2, width) +
  2 * (Math.PI * Math.max(width, (K.OPENING + width) / 2) + width) +
  2 * K.PINCH;
/** Stored measured geometry of a plan, rounded for reports; the tension model keeps full values. */
function describe(f: Plan): V7Data {
  const stiff = f.code === 'no-bend';
  return {
    crossingAngle: f.angle,
    wrapCount: f.count,
    wrapPlaneToAxes: v7RoundNumber((f.beta * 180) / Math.PI),
    items: [f.top.stack.id, f.bottom.stack.id, f.cord.stack.id],
    pieceLengths: [f.top.length, f.bottom.length],
    pieceDiameters: [m(f.top.diameter), m(f.bottom.diameter)],
    pieceConditions: [
      v7RoundNumber(f.top.condition),
      v7RoundNumber(f.bottom.condition),
    ],
    pieceMasses: [v7RoundNumber(f.top.mass), v7RoundNumber(f.bottom.mass)],
    width: m(f.cord.width),
    centreline: f.cord.overall,
    cordCondition: v7RoundNumber(f.cord.condition),
    bendLimit: f.cord.bend === null ? null : m(f.cord.bend),
    pitch: m(f.pitch),
    turns: stiff
      ? null
      : f.turns.map((t) => ({
          index: t.index,
          offset: m(t.offset),
          planar: m(t.planar),
          length: m(t.length),
          contact: t.contact.map(v7RoundNumber),
          sides: t.sides.map(m),
        })),
    wrap: stiff ? null : m(f.wrap),
    routingOpening: 2 * K.OPENING,
    bridgePerEnd: m(f.bridge),
    closureRadius: stiff ? null : m(f.closureRadius),
    formRadius: stiff ? null : m(f.formRadius),
    closurePath: stiff ? null : m(f.closurePath),
    formPath: stiff ? null : m(f.formPath),
    arcRadius: stiff ? null : m(f.arcRadius),
    tailNeed: m(f.tailNeed),
    tails: stiff ? null : m(f.tails),
    stages: stiff
      ? null
      : f.stages.map((s) => ({
          stage: s.stage,
          occupied: m(s.occupied),
          need: m(s.need),
        })),
    need: stiff ? null : m(f.need),
    stack: m(f.stack),
    holdWithTurns: m(f.hold),
    handSpan: X.HAND_SPAN,
    liftForce: F.newtons(f.lift),
    oneHandLimit: F.newtons(f.liftLimit),
    grips: [m(f.grips[0]), m(f.grips[1])],
    gripsFit: f.gripsFit,
    fits: f.code === null,
    shortfall: f.shortfall,
  };
}

/** multi-turn-contact@1, part 4: the tension model of a dressed lashing. Each turn keeps its own
 * bark contact angles, side inclination, length, creep loss of tension, slack and migration. */
interface Turn {
  length: number;
  contact: number[];
  cos: number[];
  loss: number;
  slack: number;
  migration: number;
}
interface Model {
  mu: number;
  pull: number;
  width: number;
  bridge: number;
  closurePath: number;
  closureRadius: number;
  arcRadius: number;
  turns: Turn[];
}
function modelOf(k: V7Data): Model | null {
  const raw = record(k.model),
    list = records(raw.turns);
  if (!list.length || typeof raw.mu !== 'number') return null;
  return {
    mu: raw.mu,
    pull: num(raw.pull),
    width: num(raw.width),
    bridge: num(raw.bridge),
    closurePath: num(raw.closurePath),
    closureRadius: num(raw.closureRadius),
    arcRadius: num(raw.arcRadius),
    turns: list.map((t) => ({
      length: num(t.length),
      contact: numbers(t.contact),
      cos: numbers(t.cos),
      loss: num(t.loss),
      slack: num(t.slack),
      migration: num(t.migration),
    })),
  };
}
const modelJson = (model: Model): V7Json =>
  v7Json({
    ...model,
    turns: model.turns.map((t) => ({
      ...t,
      loss: v7RoundNumber(t.loss),
      slack: v7RoundNumber(t.slack),
      migration: v7RoundNumber(t.migration),
    })),
  });
function fresh(f: Plan, mu: number): Model {
  return {
    mu,
    pull: B.DRESS,
    width: f.cord.width,
    bridge: f.bridge,
    closurePath: f.closurePath,
    closureRadius: f.closureRadius,
    arcRadius: f.arcRadius,
    turns: f.turns.map((t) => ({
      length: t.length,
      contact: [...t.contact],
      cos: [...t.cos],
      loss: 0,
      slack: 0,
      migration: 0,
    })),
  };
}
/** Accumulated bark contact angle at each turn's crown, sides and next crown, from the first end. */
function edges(model: Model): number[][] {
  let theta = 0;
  return model.turns.map((t) => {
    const e = [theta];
    for (const c of t.contact) {
      theta += c;
      e.push(theta);
    }
    return e;
  });
}
/** Dressing pulls both ends with the 5 N cord-bend@1 pull; sliding inward over the bark, the
 * tension falls by the Coulomb (capstan) law dT = mu T d(theta), so each point keeps the tension
 * from its nearer end. A turn's creep loss lowers it uniformly; a load adds a uniform increment. */
function tensionAt(
  model: Model,
  total: number,
  k: number,
  theta: number,
  extra = 0,
) {
  const near = Math.min(theta, total - theta);
  return Math.max(
    0,
    model.pull * Math.exp(-model.mu * near) -
      (model.turns[k]?.loss ?? 0) +
      extra,
  );
}
function integral(
  model: Model,
  total: number,
  k: number,
  from: number,
  to: number,
  extra: number,
) {
  const d = (to - from) / SUBSTEPS;
  let s = 0;
  for (let i = 0; i < SUBSTEPS; i++)
    s += tensionAt(model, total, k, from + (i + 0.5) * d, extra) * d;
  return s;
}
interface Tensions {
  sides: number[][];
  peak: number[];
  mean: number[];
  top: number[];
  ends: [number, number];
  max: number;
}
function tensions(model: Model, extra: number[] = []): Tensions {
  const e = edges(model),
    total = e.at(-1)?.at(-1) ?? 0,
    n = model.turns.length,
    out: Tensions = {
      sides: [],
      peak: [],
      mean: [],
      top: [],
      ends: [
        tensionAt(model, total, 0, 0, extra[0] ?? 0),
        tensionAt(model, total, n - 1, total, extra[n - 1] ?? 0),
      ],
      max: 0,
    };
  model.turns.forEach((_, k) => {
    const [t0 = 0, t1 = 0, t2 = 0, t3 = 0] = e[k] ?? [],
      x = extra[k] ?? 0,
      at = (theta: number) => tensionAt(model, total, k, theta, x);
    out.sides.push([at(t1), at(t2)]);
    out.peak.push(Math.max(at(t0), at(t1), at(t2), at(t3)));
    out.mean.push(
      t3 > t0 ? integral(model, total, k, t0, t3, x) / (t3 - t0) : 0,
    );
    out.top.push(
      integral(model, total, k, t0, t1, x) +
        integral(model, total, k, t2, t3, x),
    );
  });
  out.max = Math.max(...out.peak, ...out.ends);
  return out;
}
/** Separating the pieces by a gap lengthens both sides of every turn by the gap times their
 * inclination; each turn's tension rises by its stiffness x lengthening / turn length. Slack turns
 * resist only after their slack is taken up. Returns the gap that balances the force. */
function separated(model: Model, stiffness: number, force: number) {
  const e = edges(model),
    total = e.at(-1)?.at(-1) ?? 0,
    inc = (gap: number) =>
      model.turns.map(
        (t) =>
          (stiffness * gap * ((t.cos[0] ?? 1) + (t.cos[1] ?? 1))) /
          Math.max(1e-9, t.length),
      ),
    clamp = (gap: number) => {
      const x = inc(gap);
      return model.turns.reduce(
        (s, t, k) =>
          s +
          [1, 2].reduce(
            (u, i, j) =>
              u +
              tensionAt(model, total, k, e[k]?.[i] ?? 0, x[k] ?? 0) *
                (t.cos[j] ?? 1),
            0,
          ),
        0,
      );
    },
    resting = clamp(0);
  if (force <= resting)
    return {
      gap: 0,
      extra: model.turns.map(() => 0),
      clamping: resting - force,
      resting,
    };
  let lo = 0,
    hi = 1e-6;
  while (clamp(hi) < force && hi < 10) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (clamp(mid) < force) lo = mid;
    else hi = mid;
  }
  return { gap: hi, extra: inc(hi), clamping: 0, resting };
}
/** The least force within the limit at which a monotone failure test passes (Infinity: none). */
function threshold(limit: number, fails: (force: number) => boolean): number {
  if (fails(0)) return 0;
  if (!fails(limit)) return Infinity;
  let lo = 0,
    hi = limit;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (fails(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
/** The lashed cord as loaded: fiber-cord@1 breaking force at the tightest arc and stiffness. */
function cordLoad(w: V7World, cord: V7Stack, model: Model) {
  const r = F.material(w, cord.resource),
    law = F.STRANDS[cord.resource];
  if (!r || !law) return null;
  const p = F.part(cord),
    d = Number(p.plyDiameter),
    area = (Math.PI * d * d) / 4,
    arc = Math.max(1e-9, Math.min(model.arcRadius, model.closureRadius)),
    // The curvature rule of cord-knot@1: outer strands on an arc follow (R + w/2)/R.
    concentration = 1 + model.width / (2 * arc);
  return {
    r,
    law,
    p,
    d,
    concentration,
    strength: F.breaking(r, law, area, F.conditionOf(cord)) / concentration,
    stiffness: law.modulus * F.weakening(law, r) * F.EFFICIENCY * 2 * area,
  };
}
/** fiber-cord@1's creep lengthens the cord at constant volume; in a closed lashing each turn's share
 * is slack that lowers that turn's tension by stiffness x slack / turn length. Returns the added length. */
function creepInto(
  load: NonNullable<ReturnType<typeof cordLoad>>,
  model: Model,
  added: number[],
): number {
  const all = sum(added),
    p = load.p,
    length = Number(p.length),
    overall = Number(p.overall),
    stretched = m(length + all);
  if (!(all > 0) || !(stretched > length)) return 0;
  const grown = m(overall + stretched - length),
    gained = m(grown - overall);
  p.length = stretched;
  p.twisted = stretched;
  p.overall = grown;
  p.plyDiameter = load.d * Math.sqrt(length / stretched);
  model.turns.forEach((t, i) => {
    const share = (gained * (added[i] ?? 0)) / all;
    t.slack += share;
    t.loss += (load.stiffness * share) / Math.max(1e-9, t.length);
  });
  return gained;
}
const slackTurn = (rest: Tensions, k: number) => (rest.peak[k] ?? 0) <= 1e-9;

/** Writes the cord's part of the lashing; retained states take the bound role, keeping other cord operations off it. */
function writeCord(w: V7World, s: V7Stack, state: State, data: V7Data) {
  const p = F.part(s),
    k = recOf(s),
    role = F.roleOf(s),
    prior =
      role === 'bound' && typeof k.priorRole === 'string'
        ? k.priorRole
        : (role ?? 'cord');
  p.role = RETAINED.includes(state) ? 'bound' : prior;
  s.processing = {
    ...(s.processing ?? {}),
    [KEY]: {
      bindingId: null,
      workId: null,
      ...k,
      law: LAW,
      revision: REVISION,
      method: METHOD,
      part: 'cord',
      crossingShift: num(k.crossingShift),
      trials: trialsOf(s),
      evidence: strings(k.evidence),
      last: k.last ?? null,
      ...data,
      state,
      priorRole: prior,
      updatedAt: w.tick,
    },
  };
}
/** The cord lies straight and free: a fresh lashing starts from no slack, shift or tension. */
function freeCord(w: V7World, s: V7Stack, last: string) {
  writeCord(w, s, 'separate', {
    bindingId: null,
    workId: null,
    pieces: [],
    geometry: null,
    model: null,
    points: null,
    pose: null,
    at: null,
    routedTurns: 0,
    remainingTurns: 0,
    seated: false,
    crossingShift: 0,
    last,
  });
}
function writePiece(w: V7World, s: V7Stack, data: V7Data) {
  s.processing = {
    ...(s.processing ?? {}),
    [KEY]: {
      ...recOf(s),
      law: LAW,
      revision: REVISION,
      ...data,
      updatedAt: w.tick,
    },
  };
}
/** A released piece keeps no record unless this lashing damaged it, so it stays an ordinary branch unit. */
function freePiece(w: V7World, s: V7Stack, last: string) {
  const k = recOf(s);
  if (
    (typeof k.condition === 'number' && k.condition < 1) ||
    k.broken === true
  ) {
    writePiece(w, s, {
      state: 'separate',
      bindingId: null,
      workId: null,
      partner: null,
      cord: null,
      last,
    });
    return;
  }
  if (!s.processing?.[KEY]) return;
  const rest = Object.fromEntries(
    Object.entries(s.processing).filter(([key]) => key !== KEY),
  );
  if (Object.keys(rest).length) s.processing = rest;
  else delete s.processing;
}
function addEvidence(w: V7World, cord: V7Stack | undefined) {
  const id = w.events.at(-1)?.id;
  if (!cord || !id || !cord.processing?.[KEY]) return;
  const k = recOf(cord);
  k.evidence = [...strings(k.evidence), id].slice(-16);
}

/** The cord's centreline ledger in its state: turns, bridges, closure and slack; the ends take the rest. */
function ledger(cord: V7Stack) {
  const k = recOf(cord),
    state = stateOf(cord),
    g = record(k.geometry),
    model = modelOf(k),
    L = Number(F.part(cord).overall),
    lengths = records(g.turns).map((t) => num(t.length)),
    seated = k.seated === true,
    closed = RETAINED.includes(state),
    slack = model && closed ? sum(model.turns.map((t) => t.slack)) : 0,
    wrap =
      state === 'routed'
        ? sum(lengths.slice(0, num(k.routedTurns))) + 2 * K.OPENING
        : state === 'opened'
          ? sum(lengths.slice(0, num(k.remainingTurns)))
          : closed
            ? sum(lengths) + (seated ? 0 : 2 * K.OPENING)
            : 0,
    bridge = closed ? num(g.bridgePerEnd) : 0,
    closure = closed ? (seated ? num(g.closurePath) : num(g.formPath)) : 0,
    free = L - wrap - slack - 2 * bridge - 2 * closure,
    first = wrap ? m(free / 2) : m(L);
  return {
    wrap: m(wrap),
    bridgePerEnd: m(bridge),
    closure: m(closure),
    slack: m(slack),
    tails: [first, m(free - first)],
  };
}
/** How many turns are physically round the crossing in the cord's state. */
function shownTurns(cord: V7Stack): number {
  const k = recOf(cord),
    state = stateOf(cord);
  return state === 'routed'
    ? num(k.routedTurns)
    : state === 'opened'
      ? num(k.remainingTurns)
      : RETAINED.includes(state)
        ? records(record(k.geometry).turns).length
        : 0;
}
const label = (cord: V7Stack | undefined) => {
  if (!cord) return 'separate';
  const state = stateOf(cord),
    last = str(recOf(cord).last),
    trial = trialsOf(cord).at(-1);
  if (state === 'bound')
    return last === 'jammed'
      ? 'jammed'
      : trial?.outcome === 'held'
        ? 'held-at-recorded-load'
        : trial?.outcome === 'crossing-slipped'
          ? 'slipped-at-recorded-load'
          : 'bound-untested';
  if (state === 'tucked') return 'loose';
  if (state !== 'separate') return 'incomplete';
  return last === 'untied'
    ? 'untied'
    : last?.startsWith('infeasible')
      ? 'geometrically-infeasible'
      : last?.startsWith('broke')
        ? 'broken'
        : last?.startsWith('released') || last?.startsWith('slipped')
          ? 'loosened'
          : 'separate';
};
interface Parts {
  top?: V7Stack | undefined;
  bottom?: V7Stack | undefined;
  cord?: V7Stack | undefined;
}
const listOf = (p: Parts) =>
  [p.top, p.bottom, p.cord].filter((s): s is V7Stack => !!s);
/** Reusable visual metadata of the three conserved items; measured or simulated values only. */
function view(w: V7World, parts: Parts, bindingId: string | null): V7Data {
  const cord = parts.cord,
    k = cord ? recOf(cord) : {},
    state = cord ? stateOf(cord) : 'separate',
    g = record(k.geometry),
    pose = record(k.pose),
    placed = state !== 'separate' && typeof pose.x === 'number',
    orientation = num(pose.orientation),
    angle = num(g.crossingAngle),
    diameters = numbers(g.pieceDiameters),
    model = modelOf(k),
    rest = model && RETAINED.includes(state) ? tensions(model) : null,
    shown = cord ? shownTurns(cord) : 0,
    planned = records(g.turns),
    points = Array.isArray(k.points) ? k.points : [],
    book = cord ? ledger(cord) : null,
    trial = cord ? trialsOf(cord).at(-1) : undefined,
    turnState = (i: number) =>
      state === 'routed'
        ? i + 1 < shown
          ? 'pinned-by-hand'
          : 'loose-being-passed'
        : state === 'opened'
          ? 'held-open-by-hand'
          : rest && k.seated === true
            ? slackTurn(rest, i)
              ? 'slack'
              : 'snug'
            : 'loose';
  return {
    component: 'crossing-lashing',
    reuses: ['crossing-binding', 'fiber-cord', 'cord-knot'],
    provenance:
      'pieces, crossing pose, grip sites and status drawn as the long-crossing-binding.ts crossing-binding view; cord from long-fiber-cord.ts FIBER_CORD.view; closure bend limit from long-cord-knot.ts CORD_KNOT; turns, bridges and tensions from multi-turn-contact@1',
    law: LAW,
    method: METHOD,
    bindingId,
    workId: str(k.workId),
    state,
    status: label(cord),
    // A completed appearance needs every turn, the tucked closure and the passed release check.
    completedAppearance: state === 'bound',
    schematic: true,
    wrapCount: num(g.wrapCount) || null,
    turnsShown: shown,
    crossing: placed
      ? {
          point: { x: num(pose.x), y: num(pose.y) },
          crossingAngle: angle,
          topDirection: orientation,
          contactHeight: m(diameters[1] ?? 0),
          shiftAlongTop: m(num(k.crossingShift)),
        }
      : null,
    pieces: [parts.top, parts.bottom].map((s, i) =>
      s
        ? {
            item: s.id,
            part: i ? 'bottom' : 'top',
            drawAs: i ? 'outlined' : 'solid',
            color: F.material(w, s.resource)?.color ?? '#8d704e',
            centre: placed ? { x: num(pose.x), y: num(pose.y) } : null,
            direction: placed ? orientation + (i ? angle : 0) : null,
            axisHeight: placed
              ? m(
                  i
                    ? (diameters[1] ?? 0) / 2
                    : (diameters[1] ?? 0) + (diameters[0] ?? 0) / 2,
                )
              : null,
            length: numbers(g.pieceLengths)[i] ?? null,
            diameter: diameters[i] ?? null,
            condition: v7RoundNumber(pieceCondition(w, s)),
            broken: recOf(s).broken === true,
          }
        : null,
    ),
    cord:
      cord && book
        ? {
            item: cord.id,
            width: num(g.width) || m(2 * Number(F.part(cord).plyDiameter)),
            centreline: Number(F.part(cord).overall),
            wrap: book.wrap,
            bridgePerEnd: book.bridgePerEnd,
            closurePerEnd: book.closure,
            slack: book.slack,
            tails: book.tails,
            // Routed centreline segments in the turn frame: x along the obtuse bisector, y along the
            // plane normal, z up from the contact of the pieces.
            turns: planned.slice(0, shown).map((t, i) => ({
              index: t.index ?? i + 1,
              offset: t.offset ?? null,
              length: t.length ?? null,
              state: turnState(i),
              slack: model ? m(model.turns[i]?.slack ?? 0) : 0,
              migration: model ? m(model.turns[i]?.migration ?? 0) : 0,
              centerline: v7Json(points[i] ?? null),
            })),
            crossings: [
              ...range(shown).flatMap((i) => [
                `turn-${String(i + 1)}-over-top-piece`,
                `turn-${String(i + 1)}-under-bottom-piece`,
              ]),
              ...(RETAINED.includes(state)
                ? ['ends-over-turns', 'end-over-end', 'end-tucked-under-end']
                : []),
            ],
            condition: v7RoundNumber(F.conditionOf(cord)),
            cord: F.view(w, cord),
          }
        : null,
    gripSites:
      state === 'bound'
        ? numbers(g.grips).map((d, i) => ({
            piece: i ? 'bottom' : 'top',
            fromCrossing: d,
            length: F.HOLD,
          }))
        : null,
    retention:
      state === 'bound'
        ? rest && rest.max > 1e-9
          ? 'snug'
          : 'slack'
        : state === 'tucked'
          ? 'loose'
          : 'none',
    lastTrial: trial
      ? {
          direction: trial.direction ?? null,
          outcome: trial.outcome ?? null,
          achievedForce: trial.achievedForce ?? null,
          heldSeconds: trial.heldSeconds ?? null,
        }
      : null,
    evidence: strings(k.evidence),
  };
}

const ownJobs = (w: V7World, a: V7Actor) =>
  collectiveJobs(w, ID).filter((j) => j.owner === a.id);
const current = (w: V7World, a: V7Actor) => ownJobs(w, a).find(open);
function held(w: V7World, j: CollectiveWork): Parts {
  const [t, b] = strings(j.pieces),
    find = (id: string | null | undefined) =>
      id ? w.stacks.find((s) => s.id === id) : undefined;
  return { top: find(t), bottom: find(b), cord: find(str(j.cord)) };
}
const stagesOf = (j: CollectiveWork) =>
  j.mode === 'untie' ? untieStages(num(j.turns)) : tieStages(num(j.turns));
const stageName = (j: CollectiveWork, n: number) => stagesOf(j)[n] ?? null;
function summary(w: V7World, j: CollectiveWork): V7Data {
  return {
    workId: j.id,
    actor: j.owner,
    mode: j.mode,
    status: j.status,
    law: LAW,
    revision: REVISION,
    method: METHOD,
    bindingId: str(j.binding),
    wrapCount: num(j.turns),
    stage: str(j.lastStage) ?? 'reserved',
    nextStage: open(j) ? stageName(j, num(j.reached)) : null,
    completedRounds: j.completedWork,
    reachedStages: num(j.reached),
    remaining: j.remainingWork,
    paidEnergy: v7RoundNumber(j.paidEnergy),
    crossingAngle: num(j.angle),
    pieces: strings(j.pieces),
    cord: str(j.cord),
    split: v7Json(j.split ?? []),
    position: { x: j.x, y: j.y },
    measured: j.fit ?? null,
    visual: view(w, held(w, j), str(j.binding)),
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
/** The three items of a lashing, found on the items themselves. */
function members(w: V7World, bindingId: string): Parts {
  const list = w.stacks.filter((s) => recOf(s).bindingId === bindingId),
    find = (part: Part) => list.find((s) => recOf(s).part === part);
  return { top: find('top'), bottom: find('bottom'), cord: find('cord') };
}
/** A retained lashing of the actor's own three items, bound by the relation and not by work. */
function ownBinding(c: V7ActionContext, free = true): Parts & { id: string } {
  const id = v7String(c.action.args.bindingId, 'bindingId'),
    parts = members(c.world, id),
    list = listOf(parts);
  if (
    list.length !== 3 ||
    list.some((s) => s.owner !== c.actor.id) ||
    !parts.cord ||
    !RETAINED.includes(stateOf(parts.cord))
  )
    throw new Error(
      'bindingId must be the exact id of a lashing of your own two pieces and cord, all in your possession; nothing was spent.',
    );
  if (free && list.some((s) => s.reservedFor !== id))
    throw new Error(
      'This lashing is held by unfinished work; nothing was spent.',
    );
  return { ...parts, id };
}
/** Bounded verified finding keyed by the functional observation and turn count, not by the ability name. */
function remember(
  c: V7ActionContext,
  kind: string,
  cord: V7Stack,
  pieces: V7Stack[],
  count: number,
  outcome: string,
  value: V7Data,
  method: string,
  verified = true,
) {
  const width = mm(2 * Number(F.part(cord).plyDiameter)),
    sizes = pieces.map((s) => {
      const p = measurePiece(c.world, s);
      return p ? mm(p.diameter) : 0;
    });
  openRemember(c, {
    key: `${kind}:${cord.resource}-${String(width)}mm:${pieces[0]?.resource ?? 'piece'}-${sizes.join('-')}mm:${String(count)}-turns:${outcome}`,
    subject: cord.resource,
    property: `${kind} of ${String(count)} adjacent turns of a ${String(width)} mm two-ply cord round a crossing of ${sizes.join(' mm and ')} mm pieces`,
    value: v7Json({
      outcome,
      items: [...pieces.map((s) => s.id), cord.id],
      tick: c.world.tick,
      ...value,
    }),
    method,
    condition:
      'bare hands on dry footing; no tool, anchor, added cord or second person',
    verified,
  });
}

/** Hand-held stages relax when hands leave them; returns what relaxed, or null. */
function relax(w: V7World, j: CollectiveWork, moved: boolean): string | null {
  const reached = num(j.reached),
    count = num(j.turns),
    { cord } = held(w, j);
  if (j.mode !== 'attempt' || reached === 0 || reached > count + 1) return null;
  if (reached === 1 && !moved) return null;
  j.reached = moved ? 0 : 1;
  j.remainingWork = tieStages(count).length - num(j.reached);
  if (cord)
    writeCord(w, cord, moved ? 'separate' : 'positioned', {
      bindingId: null,
      workId: j.id,
      routedTurns: 0,
      last: reached >= 2 ? 'turns-fell-loose' : 'layout-moved',
    });
  if (moved) j.pose = null;
  const turns = reached - 1;
  return reached >= 2
    ? `The ${String(turns)} hand-held turn(s) fell loose off the crossing${moved ? ' and the crossed pieces were carried from where they were laid, so positioning and every turn must be redone' : '; the crossed pieces still lie where they were laid, so every turn must be routed again'}. Paid rounds stay paid; loose turns hold no tension.`
    : 'The crossed pieces were carried from where they were laid, so positioning must be redone.';
}
/** Releases the work once: a tucked or bound closure keeps the relation; anything held by hand opens. */
function release(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  reason: string,
  ground: boolean,
) {
  const parts = held(w, j),
    reached = num(j.reached),
    count = num(j.turns),
    retained = j.mode === 'attempt' ? reached >= count + 2 : reached === 0,
    handHeld =
      j.mode === 'attempt'
        ? reached >= 2 && reached <= count + 1
        : reached >= 1,
    id = str(j.binding);
  j.x = a.position.x;
  j.y = a.position.y;
  workStop(w, a, j, reason, ground);
  for (const s of listOf(parts)) {
    if (retained && id) {
      s.reservedFor = id;
      recOf(s).workId = null;
    } else if (s === parts.cord) {
      if (stateOf(s) !== 'separate' || recOf(s).workId === j.id)
        freeCord(
          w,
          s,
          handHeld
            ? j.mode === 'untie'
              ? 'untied-turns-fell-open'
              : 'released-turns-fell-loose'
            : (str(recOf(s).last) ?? 'released'),
        );
    } else freePiece(w, s, 'released');
  }
  return {
    parts,
    retained,
    relaxed: handHeld
      ? j.mode === 'untie'
        ? 'Released without hands, the opened turns fell off: both pieces and the cord are free.'
        : 'Released without hands, the routed turns fell loose: both pieces and the cord are free.'
      : null,
  };
}
function relaxedEvent(emit: Emit, w: V7World, j: CollectiveWork, note: string) {
  emit(
    `${PREFIX}relaxed`,
    note,
    { ...summary(w, j), relaxed: note },
    str(j.binding) ?? j.id,
  );
}
function pause(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
): V7HandlerResult {
  if (j.mode === 'untie' && num(j.reached) >= 1) return stop(c, j, reason);
  const note = relax(c.world, j, false);
  j.status = 'paused';
  j.reason = reason;
  c.emit(
    `${PREFIX}paused`,
    `${reason} Paid stages and the reserved items are kept; nothing was spent.`,
    { ...summary(c.world, j), requiredEnergy: STEP },
    str(j.binding) ?? j.id,
  );
  if (note) relaxedEvent(emitter(c), c.world, j, note);
  sync(c.actor, j);
  return { complete: true, writes: [j.id] };
}
function stop(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
): V7HandlerResult {
  const { relaxed } = release(c.world, c.actor, j, reason, false);
  c.emit(
    `${PREFIX}stopped`,
    `${reason} Nothing is refunded.`,
    summary(c.world, j),
    str(j.binding) ?? j.id,
  );
  if (relaxed) relaxedEvent(emitter(c), c.world, j, relaxed);
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}
/** Settles the work: a bound or loose closure keeps the items in the relation; otherwise they are free. */
function finish(
  c: V7ActionContext,
  j: CollectiveWork,
  parts: Parts,
  bound: boolean,
): V7HandlerResult {
  const id = str(j.binding);
  for (const s of listOf(parts)) {
    if (bound && id) s.reservedFor = id;
    else delete s.reservedFor;
    if (s.processing?.[KEY]) recOf(s).workId = null;
  }
  j.status = 'completed';
  j.remainingWork = 0;
  j.outputs = listOf(parts).map((s) => s.id);
  sync(c.actor, j);
  return { complete: true, remaining: 0, writes: [j.id, ...j.outputs] };
}
function progress(
  c: V7ActionContext,
  j: CollectiveWork,
  type: string,
  stage: string,
  before: V7Data,
  measured: V7Data,
  note: string,
): V7HandlerResult {
  const parts = held(c.world, j);
  c.emit(
    `${PREFIX}${type}`,
    `Paid round ${String(j.completedWork)} (${stage}): ${note}`,
    {
      ...summary(c.world, j),
      round: j.completedWork,
      operation: stage,
      stageStarted: true,
      stageCompleted: true,
      before,
      after: view(c.world, parts, str(j.binding)),
      handPinch: K.PINCH,
      ...measured,
    },
    str(j.binding) ?? j.id,
  );
  addEvidence(c.world, parts.cord);
  sync(c.actor, j);
  return {
    complete: false,
    remaining: j.remainingWork,
    writes: [j.id, ...listOf(parts).map((s) => s.id)],
  };
}
/** A measured limit ends the work at this paid stage; the items stay as they actually are. */
function infeasible(
  c: V7ActionContext,
  j: CollectiveWork,
  f: Plan,
  stage: string,
  code: string,
  problem: string,
  before: V7Data,
): V7HandlerResult {
  const { parts, relaxed, retained } = release(
    c.world,
    c.actor,
    j,
    `Measured at ${stage}: ${problem}. The items are released as they are; the round's energy is not refunded.`,
    false,
  );
  if (parts.cord && !retained)
    freeCord(c.world, parts.cord, `infeasible-${code}`);
  const measured = describe(f);
  remember(
    c,
    'lashing-fit',
    f.cord.stack,
    [f.top.stack, f.bottom.stack],
    f.count,
    `shortfall-${code}`,
    { workId: j.id, stage, problem, crossingAngle: f.angle, measured },
    `${String(j.completedWork)} paid round(s) of bare-hand positioning, measuring and routing`,
  );
  c.emit(
    `${PREFIX}shortfall`,
    `Measured at ${stage}: ${problem}. No lashing was completed; the items are released once as they actually are${retained ? ' (the tucked closure still holds them loosely)' : ''} and nothing is refunded.`,
    {
      ...summary(c.world, j),
      operation: stage,
      outcome: code,
      problem,
      measuredShortfall: true,
      measured,
      before,
      after: view(c.world, parts, retained ? str(j.binding) : null),
    },
    str(j.binding) ?? j.id,
  );
  if (relaxed) relaxedEvent(emitter(c), c.world, j, relaxed);
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

/** Shared data of the cord at a stage, from the work's measured plan; only a closure makes it a relation. */
function relation(
  j: CollectiveWork,
  f: Plan,
  closed: boolean,
  extra: V7Data = {},
): V7Data {
  return {
    bindingId: closed ? str(j.binding) : null,
    workId: j.id,
    pieces: strings(j.pieces),
    geometry: describe(f),
    points: f.turns.map((t) => t.points),
    pose: v7Json(j.pose ?? null),
    ...extra,
  };
}
/** The closure slip load on the live cord: its current width and seated radius max(bend limit, width). */
function liveSlip(w: V7World, cord: V7Stack): number | null | undefined {
  const mc = X.measureCord(w, cord);
  if (!mc || mc.bend === null) return undefined;
  return X.closureSlip(cord, mc.width, Math.max(mc.bend, mc.width));
}
const turnText = (rest: Tensions) =>
  rest.sides.map((s) => s.map((x) => F.newtons(x)));

/** One paid attempt stage on the re-read items: measure and position, route each turn, form and tuck, dress and check. */
function tie(
  c: V7ActionContext,
  j: CollectiveWork,
  parts: Parts,
  orientation: number | null,
): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    n = num(j.reached),
    count = num(j.turns),
    stage = tieStages(count)[n] ?? '',
    { top, bottom, cord } = parts,
    pt = top ? measurePiece(w, top) : null,
    pb = bottom ? measurePiece(w, bottom) : null,
    mc = cord ? X.measureCord(w, cord) : null,
    before = view(w, parts, str(j.binding));
  j.lastStage = stage;
  if (!top || !bottom || !cord || !pt || !pb || !mc)
    return stop(c, j, 'A piece or the cord has no measurable geometry.');
  const f = plan(a, pt, pb, mc, num(j.angle), count);
  if (n === 0) {
    if (f.code)
      return infeasible(c, j, f, stage, f.code, f.shortfall ?? '', before);
    j.pose = {
      x: a.position.x,
      y: a.position.y,
      orientation: orientation ?? 0,
    };
    j.fit = describe(f);
    j.reached = 1;
    j.remainingWork = tieStages(count).length - 1;
    writeCord(
      w,
      cord,
      'positioned',
      relation(j, f, false, { last: null, routedTurns: 0, seated: false }),
    );
    remember(
      c,
      'lashing-fit',
      cord,
      [top, bottom],
      count,
      'fits',
      { workId: j.id, crossingAngle: f.angle, measured: describe(f) },
      'a paid bare-hand positioning and measuring round',
    );
    return progress(
      c,
      j,
      'measured',
      stage,
      before,
      { measured: describe(f) },
      `the pieces lie crossed at ${String(f.angle)} degrees (${top.id} on top), ${String(m(pt.diameter))} and ${String(m(pb.diameter))} m thick; ${String(count)} adjacent turns ${String(m(f.pitch))} m apart need ${String(m(f.need))} m and the cord has ${String(m(mc.overall))} m. Nothing is bound yet.`,
    );
  }
  if (n <= count + 1 && f.code)
    return infeasible(
      c,
      j,
      f,
      stage,
      'geometry-changed',
      f.shortfall ?? '',
      before,
    );
  if (n <= count) {
    const routing = f.stages[n - 1],
      ends = (mc.overall - (routing?.occupied ?? Infinity)) / 2;
    if (ends < K.PINCH - 1e-9)
      return infeasible(
        c,
        j,
        f,
        stage,
        'end-too-short',
        `routing turn ${String(n)} leaves ${String(m(Math.max(0, ends)))} m at each end; holding an end needs ${String(K.PINCH)} m`,
        before,
      );
    writeCord(w, cord, 'routed', relation(j, f, false, { routedTurns: n }));
    j.reached = n + 1;
    j.remainingWork = tieStages(count).length - j.reached;
    const t = f.turns[n - 1];
    return progress(
      c,
      j,
      'turn-routed',
      stage,
      before,
      {
        turn: n,
        lift: F.newtons(f.lift),
        holdThickness: m(n > 1 ? f.hold : f.stack),
        passingOpening: 2 * K.OPENING,
        turnLength: m(t?.length ?? 0),
        turnOffset: m(t?.offset ?? 0),
        routedLength: m(routing?.occupied ?? 0),
        endsBeyondTurns: m(ends),
      },
      `one hand lifted the crossing${n > 1 ? ' and pinned the earlier turns' : ''} and the other passed the cord over ${top.id} and under ${bottom.id} for turn ${String(n)} of ${String(count)} (${String(m(t?.length ?? 0))} m, ${String(m(t?.offset ?? 0))} m off the middle), held loose by hand with ${String(m(ends))} m at each end. It is no lashing.`,
    );
  }
  if (n === count + 1) {
    const forming = f.stages[count],
      ends = (mc.overall - (forming?.occupied ?? Infinity)) / 2;
    if (ends < K.PINCH - 1e-9)
      return infeasible(
        c,
        j,
        f,
        stage,
        'end-too-short',
        `forming the closure leaves ${String(m(Math.max(0, ends)))} m beyond it; pinching an end needs ${String(K.PINCH)} m`,
        before,
      );
    const id = str(j.binding) ?? '';
    writeCord(
      w,
      cord,
      'tucked',
      relation(j, f, true, { at: { ...a.position }, seated: false }),
    );
    for (const [s, part, partner, p] of [
      [top, 'top', bottom, pt],
      [bottom, 'bottom', top, pb],
    ] as const)
      writePiece(w, s, {
        state: 'tucked',
        bindingId: id,
        workId: j.id,
        part,
        partner: partner.id,
        cord: cord.id,
        length: p.length,
        diameter: m(p.diameter),
        condition: v7RoundNumber(p.condition),
      });
    j.reached = n + 1;
    j.remainingWork = 1;
    return progress(
      c,
      j,
      'closure-formed',
      stage,
      before,
      {
        bridgePerEnd: m(f.bridge),
        formRadius: m(f.formRadius),
        closurePerEnd: m(f.formPath),
        endsBeyondClosure: m(ends),
      },
      `both ends were led ${String(m(f.bridge))} m over the turns to the middle, crossed over the top piece and one was tucked half round the other at ${String(m(f.formRadius))} m: a loose closure that holds without hands, not yet dressed or checked.`,
    );
  }
  // Dressing pulls both ends, seats the turns on their hulls and the closure at its limit; the
  // routing slack goes evenly into both tails.
  const slip = X.closureSlip(cord, mc.width, f.closureRadius),
    mu = X.BARK[cord.resource],
    short = f.tails < f.tailNeed - 1e-9,
    slips = slip === undefined || (slip !== null && slip <= B.DRESS),
    ok = !short && !slips && mu !== undefined,
    model = fresh(f, mu ?? 0),
    rest = tensions(model),
    value = {
      wrap: m(f.wrap),
      bridgePerEnd: m(f.bridge),
      closureRadius: m(f.closureRadius),
      closurePerEnd: m(f.closurePath),
      tails: [m(f.tails), m(f.tails)],
      tailNeeded: m(f.tailNeed),
      dressingPull: B.DRESS,
      cordOnBarkFriction: mu ?? null,
      turnContact: f.turns.map((t) => t.contact.map(v7RoundNumber)),
      turnTensions: ok ? turnText(rest) : f.turns.map(() => [0, 0]),
      endTensions: ok ? rest.ends.map(F.newtons) : [0, 0],
      closureContactAngle: v7RoundNumber(
        Math.PI * Math.min(1, mc.width / f.closureRadius),
      ),
      closureSlipLoad:
        slip === null || slip === undefined ? null : F.newtons(slip),
      selfLocking: slip === null,
      gripsFit: f.gripsFit,
    };
  if (ok) {
    writeCord(
      w,
      cord,
      'bound',
      relation(j, f, true, {
        workId: null,
        at: { ...a.position },
        model: modelJson(model),
        seated: true,
        crossingShift: 0,
        last: 'release-held',
        boundAt: w.tick,
      }),
    );
    for (const s of [top, bottom]) writePiece(w, s, { state: 'bound' });
  } else {
    freeCord(
      w,
      cord,
      short ? 'released-tail-slipped-out' : 'released-closure-slipped',
    );
    for (const s of [top, bottom]) freePiece(w, s, 'released-loosened');
  }
  remember(
    c,
    'lashing-fit',
    cord,
    [top, bottom],
    count,
    ok ? 'release-held' : 'release-failed',
    { workId: j.id, crossingAngle: f.angle, ...value },
    `${String(j.completedWork)} paid rounds of bare-hand positioning, ${String(count)} turns, closing, dressing and a release check`,
  );
  j.reached = tieStages(count).length;
  const data: V7Data = {
    ...summary(w, j),
    round: j.completedWork,
    operation: stage,
    stageStarted: true,
    stageCompleted: true,
    outcome: ok ? 'release-held' : 'release-failed',
    before,
    ...value,
  };
  const done = finish(c, j, parts, ok);
  data.status = j.status;
  data.nextStage = null;
  data.after = view(w, parts, ok ? str(j.binding) : null);
  data.visual = data.after;
  c.emit(
    ok ? `${PREFIX}release-held` : `${PREFIX}release-failed`,
    ok
      ? `Dressed and released: ${String(count)} turns (${String(value.wrap)} m) hold ${top.id} and ${bottom.id} where they cross, with 2 x ${String(value.bridgePerEnd)} m to the closure, 2 x ${String(value.closurePerEnd)} m in it and tails of ${String(m(f.tails))} m. The 5 N dressing pull falls along the cord over the bark, so inner turns carry less. Its load behavior is untested; it is no rated lashing and gives no shelter.${f.gripsFit ? '' : ' No hand test is possible: a piece is too short for a grip clear of the turns.'}`
      : `Released after dressing: ${short ? 'a tail was shorter than the closure needs and slipped out' : `the closure did not keep the ${String(B.DRESS)} N dressing pull`}, so the turns opened and both pieces and the cord are free.`,
    data,
    str(j.binding) ?? j.id,
  );
  if (ok) addEvidence(c.world, cord);
  return done;
}

/** One paid untie stage: withdraw the closure end, then unwrap one turn per round. */
function untie(
  c: V7ActionContext,
  j: CollectiveWork,
  parts: Parts,
): V7HandlerResult {
  const w = c.world,
    n = num(j.reached),
    count = num(j.turns),
    stage = untieStages(count)[n] ?? '',
    { top, bottom, cord } = parts,
    before = view(w, parts, str(j.binding));
  j.lastStage = stage;
  if (!top || !bottom || !cord)
    return stop(c, j, 'A reserved piece or the cord is missing.');
  const k = recOf(cord),
    g = record(k.geometry),
    cond = F.conditionOf(cord);
  if (n === 0) {
    const conformity = Math.min(
        1,
        num(g.width) / Math.max(1e-9, num(g.closureRadius)),
      ),
      jammed =
        conformity >= 1 - 1e-9 &&
        trialsOf(cord).some((t) => num(t.loadShare) >= F.ONSET),
      problem = jammed
        ? 'the closure hugs the other end and was pressed into it by an earlier load above half the breaking force, so the fingers cannot draw the end back'
        : cond < F.SOUND
          ? 'too many strands at the closure are broken to draw the end back without parting them'
          : null;
    if (problem) {
      release(
        w,
        c.actor,
        j,
        `The closure resisted untying: ${problem}. It stays as it is; nothing is refunded.`,
        false,
      );
      recOf(cord).last = jammed ? 'jammed' : 'damaged';
      remember(
        c,
        'lashing-untie',
        cord,
        [top, bottom],
        count,
        jammed ? 'jammed' : 'damaged',
        { bindingId: str(j.binding), problem, condition: cond },
        'a paid bare-hand untying round',
      );
      c.emit(
        `${PREFIX}resisted`,
        `The closure resisted untying: ${problem}. The lashing stays as it is; nothing is refunded.`,
        {
          ...summary(w, j),
          operation: stage,
          outcome: jammed ? 'jammed' : 'damaged',
          problem,
          before,
          condition: cond,
        },
        str(j.binding) ?? j.id,
      );
      sync(c.actor, j);
      return { complete: true, writes: [j.id, ...j.escrow] };
    }
    writeCord(w, cord, 'opened', {
      workId: j.id,
      remainingTurns: count,
      last: 'closure-withdrawn',
    });
    for (const s of [top, bottom])
      writePiece(w, s, { state: 'opened', workId: j.id });
    j.reached = 1;
    j.remainingWork = untieStages(count).length - 1;
    return progress(
      c,
      j,
      'closure-withdrawn',
      stage,
      before,
      {},
      `the tucked end was drawn back out of the closure; the ${String(count)} open turns are held round the crossing by hand.`,
    );
  }
  if (n < count) {
    writeCord(w, cord, 'opened', {
      workId: j.id,
      remainingTurns: count - n,
    });
    j.reached = n + 1;
    j.remainingWork = untieStages(count).length - j.reached;
    return progress(
      c,
      j,
      'turn-unwrapped',
      stage,
      before,
      { remainingTurns: count - n },
      `one turn was unwound from the crossing; ${String(count - n)} open turn(s) remain in the hands.`,
    );
  }
  freeCord(w, cord, 'untied');
  for (const s of [top, bottom]) freePiece(w, s, 'untied');
  remember(
    c,
    'lashing-untie',
    cord,
    [top, bottom],
    count,
    'untied',
    { bindingId: str(j.binding), condition: cond },
    `${String(count + 1)} paid bare-hand untying rounds`,
  );
  j.reached = untieStages(count).length;
  const data: V7Data = {
    ...summary(w, j),
    operation: stage,
    outcome: 'untied',
    before,
    condition: cond,
  };
  const done = finish(c, j, parts, false);
  data.status = j.status;
  data.nextStage = null;
  data.after = view(w, parts, null);
  data.visual = data.after;
  c.emit(
    `${PREFIX}untied`,
    'Untied: the closure was withdrawn and every turn unwound; both pieces and the same cord are free, and any set from bending, creep or damage is not undone.',
    data,
    str(j.binding) ?? j.id,
  );
  return done;
}

/** One paid round after rechecking the reserved items, hands, footing, room, layout and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const w = c.world,
    a = c.actor;
  if (!open(j)) throw new Error('This lashing work is already settled.');
  const parts = held(w, j),
    list = listOf(parts),
    count = num(j.turns);
  if (
    list.length !== 3 ||
    list.some((s) => s.reservedFor !== j.id || s.owner !== a.id)
  )
    return stop(c, j, 'A reserved piece or the cord is missing.');
  const cord = parts.cord as V7Stack,
    pieces = [parts.top, parts.bottom].flatMap((s) => {
      const p = s ? measurePiece(w, s) : null;
      return p ? [p] : [];
    });
  if (pieces.length !== 2)
    return stop(c, j, 'A piece no longer has a represented rigid-piece law.');
  if (j.mode === 'attempt' && F.conditionOf(cord) < F.SOUND)
    return stop(
      c,
      j,
      'More than half of the strands of the cord are now broken; it cannot be bent round the crossing.',
    );
  const reached = num(j.reached),
    pose = record(j.pose),
    laid = j.mode === 'attempt' && reached >= 1 && reached <= count + 1,
    moved =
      laid &&
      Math.hypot(a.position.x - num(pose.x), a.position.y - num(pose.y)) > 1e-6;
  // A laid-out crossing stays only where it was laid; moving relays it at the next paid round.
  const relaxed = moved ? relax(w, j, true) : null;
  if (relaxed) relaxedEvent(emitter(c), w, j, relaxed);
  const fixed =
      j.mode === 'attempt' && num(j.reached) >= 1 && num(j.reached) <= count + 1
        ? num(record(j.pose).orientation)
        : null,
    lay = X.space(w, a, pieces, num(j.angle), fixed);
  if (lay.blocked) return pause(c, j, `No room to work: ${lay.blocked}.`);
  if (a.vitals.energy < STEP)
    return pause(c, j, 'Not enough energy for the next paid round.');
  const resumed = j.status === 'paused';
  if (!workPay(c, j, STEP))
    throw new Error('Energy changed before the paid round.');
  a.vitals.energy = v7RoundNumber(Math.max(0, a.vitals.energy));
  j.paidEnergy = v7RoundNumber(j.paidEnergy);
  j.x = a.position.x;
  j.y = a.position.y;
  if (resumed)
    c.emit(
      `${PREFIX}resumed`,
      'Unfinished lashing work resumed by workId after rechecking the pieces, the cord, hands, footing, room and energy; earlier paid rounds are kept and relaxed turns are routed again.',
      summary(w, j),
      str(j.binding) ?? j.id,
    );
  return j.mode === 'untie'
    ? untie(c, j, parts)
    : tie(c, j, parts, lay.orientation);
}

function holdItem(c: V7ActionContext, j: CollectiveWork, s: V7Stack) {
  s.reservedFor = j.id;
  j.escrow.push(s.id);
  j.sources.push({
    itemId: s.id,
    escrowId: s.id,
    resource: s.resource,
    quantity: s.quantity,
    owner: c.actor.id,
    origin: s.origin,
    harvestedAt: s.harvestedAt ?? null,
    decay: s.decay ?? 0,
  });
  if (s.processing?.[KEY]) recOf(s).workId = j.id;
}
/** Reserves one whole unit per named piece (a larger lot gives up one unit as a new item) and the cord. */
function reserve(
  c: V7ActionContext,
  j: CollectiveWork,
  ids: string[],
  cord: V7Stack,
  bound: string | null,
) {
  const w = c.world,
    a = c.actor,
    pieces: string[] = [],
    split: V7Data[] = [];
  for (const id of ids) {
    // Members of a loose lashing are taken over from it in place; free pieces must be unreserved.
    const s = w.stacks.find(
      (x) => x.id === id && (x.reservedFor ?? null) === bound,
    );
    if (!s) throw new Error('Missing validated piece.');
    if (bound !== null || foodTenths(s.quantity) === 10) {
      holdItem(c, j, s);
      pieces.push(s.id);
      continue;
    }
    const part: V7Stack = {
      ...materialPortion(s, 10),
      id: v7Id(w, 'item'),
      owner: a.id,
      position: { ...a.position },
    };
    delete part.reservedFor;
    foodSetQuantity(s, foodTenths(s.quantity) - 10);
    w.stacks.push(part);
    holdItem(c, j, part);
    pieces.push(part.id);
    split.push({ from: s.id, item: part.id, quantity: 1 });
  }
  holdItem(c, j, cord);
  j.pieces = pieces;
  j.cord = cord.id;
  j.split = split;
}
function guard(c: V7ActionContext, pieces: Piece[], angle: number) {
  const lay = X.space(c.world, c.actor, pieces, angle, null);
  if (lay.blocked)
    throw new Error(`No room to work: ${lay.blocked}. Nothing was spent.`);
  if (c.actor.vitals.energy < STEP)
    throw new Error(
      'Not enough energy for the first paid round; nothing was reserved.',
    );
}
/** Exact own whole-unit pieces with a rigid-piece law; a lot may be named once per whole unit it holds. */
function pieceIds(c: V7ActionContext, loose: string | null): string[] {
  const raw = c.action.args.pieceIds;
  if (
    !Array.isArray(raw) ||
    raw.length !== 2 ||
    raw.some((x) => typeof x !== 'string' || !x.trim())
  )
    throw new Error(
      'pieceIds must list the exact ids of two of your own pieces (name one lot twice only if it holds two whole units); nothing was spent.',
    );
  const ids = raw as string[];
  for (const id of new Set(ids)) {
    const s = c.world.stacks.find((x) => x.id === id && x.owner === c.actor.id);
    if (!s)
      throw new Error(
        'pieceIds must be the exact ids of your own pieces; resource names are not accepted. Nothing was spent.',
      );
    if (loose !== null) continue;
    if (!X.RIGID[s.resource] || !F.material(c.world, s.resource))
      throw new Error(
        `Unsupported material: no rigid-piece law exists for ${s.resource}, so its section, contact and bending are not represented; nothing was spent.`,
      );
    if (s.reservedFor)
      throw new Error(`${s.id} is reserved by other work; nothing was spent.`);
    const other = Object.keys(s.processing ?? {}).filter(
      (x) => x !== KEY && x !== X.BIND,
    );
    if (X.TREATED.some((x) => s[x] !== undefined) || other.length)
      throw new Error(
        `${s.id} is treated, recovered or processed material; only untreated loose pieces have a represented piece geometry in this version. Nothing was spent.`,
      );
    if (
      recOf(s).broken === true ||
      record(s.processing?.[X.BIND]).broken === true ||
      pieceCondition(c.world, s) < F.SOUND
    )
      throw new Error(`${s.id} is broken or unsound; nothing was spent.`);
    const named = ids.filter((x) => x === id).length;
    if (foodTenths(s.quantity) < 10 * named)
      throw new Error(
        `${s.id} holds ${String(s.quantity)} unit(s); each piece is one whole unit, so it cannot be named ${String(named)} time(s). Nothing was spent.`,
      );
  }
  return ids;
}
/** The exact own cord, straight and free of any knot, join or binding. */
function ownCord(c: V7ActionContext, loose: string | null): V7Stack {
  const id = v7String(c.action.args.cordId, 'cordId'),
    s = c.world.stacks.find((x) => x.id === id && x.owner === c.actor.id),
    role = s ? F.roleOf(s) : null;
  if (!s || !role || ![...ROLES, 'knotted', 'joined', 'bound'].includes(role))
    throw new Error(
      'cordId must be the exact id of your own finished cord or cord fragment from hand-twist-fiber-cord or hand-twist-sectioned-cord; nothing was spent.',
    );
  if (loose !== null) return s;
  if (role === 'bound')
    throw new Error(
      `${s.id} already closes a binding or lashing; untie it first. Nothing was spent.`,
    );
  const joined = record(s.processing?.[B.JOIN]).state;
  if (role === 'joined' || (joined !== undefined && joined !== 'straight'))
    throw new Error(
      `${s.id} is part of a join; untie it first. Joined cord is not accepted: routing turns through a join is not represented. Nothing was spent.`,
    );
  if (role === 'knotted' || K.state(s) !== 'straight')
    throw new Error(
      `${s.id} holds an overhand knot; untie it with hand-tie-cord-knot first. Nothing was spent.`,
    );
  if (s.reservedFor)
    throw new Error(`${s.id} is reserved by other work; nothing was spent.`);
  const p = F.part(s);
  if (!F.material(c.world, s.resource) || !F.STRANDS[s.resource])
    throw new Error(
      `Unsupported material: no strand law exists for ${s.resource}, so its bending is not represented; nothing was spent.`,
    );
  if (B.FRICTION[s.resource] === undefined || X.BARK[s.resource] === undefined)
    throw new Error(
      `Unsupported material: no cord-on-cord or cord-on-bark friction law exists for ${s.resource}, so no holding can be computed; nothing was spent.`,
    );
  if (p.plied !== true || !(Number(p.plyDiameter) > 0))
    throw new Error(
      `${s.id} has no represented two-ply section; nothing was spent.`,
    );
  if (F.conditionOf(s) < F.SOUND)
    throw new Error(
      `More than half of the strands of ${s.id} are broken; it cannot be bent round a crossing. Nothing was spent.`,
    );
  if (foodTenths(s.quantity) < 2)
    throw new Error(
      `${s.id} holds ${String(s.quantity)} unit; a lashing cord needs at least 0.2 units so that any break leaves two owned lots. Nothing was spent.`,
    );
  return s;
}

function attempt(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor;
  if (current(w, a))
    throw new Error(
      'Unfinished lashing work exists; resume it with its mode and workId, or cancel it. Nothing was spent.',
    );
  if (c.action.args.workId !== undefined)
    throw new Error(
      'No unfinished lashing work of yours has this workId; nothing was spent.',
    );
  // A loose tucked lashing of exactly these items needs only its dressing round.
  const rawIds = Array.isArray(c.action.args.pieceIds)
      ? strings(c.action.args.pieceIds)
      : [],
    rawCord = str(c.action.args.cordId),
    cordStack = rawCord
      ? w.stacks.find((s) => s.id === rawCord && s.owner === a.id)
      : undefined,
    looseId =
      cordStack && stateOf(cordStack) === 'tucked'
        ? str(recOf(cordStack).bindingId)
        : null,
    loose =
      looseId !== null &&
      (() => {
        const p = members(w, looseId);
        return (
          rawIds.length === 2 &&
          p.top?.id === rawIds[0] &&
          p.bottom?.id === rawIds[1] &&
          listOf(p).every((s) => s.owner === a.id && s.reservedFor === looseId)
        );
      })()
        ? looseId
        : null;
  const ids = pieceIds(c, loose),
    cord = ownCord(c, loose),
    g = loose ? record(recOf(cord).geometry) : null,
    relationAngle = g ? num(g.crossingAngle) : null,
    relationTurns = g ? num(g.wrapCount) : null,
    angle =
      c.action.args.crossingAngle === undefined && relationAngle !== null
        ? relationAngle
        : v7Number(
            c.action.args.crossingAngle,
            'crossingAngle',
            X.ANGLE.min,
            X.ANGLE.max,
          ),
    count =
      c.action.args.wrapCount === undefined && relationTurns !== null
        ? relationTurns
        : v7Number(c.action.args.wrapCount, 'wrapCount', TURNS.min, TURNS.max);
  if (!Number.isSafeInteger(count))
    throw new Error(
      'wrapCount must be a whole number of turns from 2 to 4 (one wrap is hand-bind-crossing); nothing was spent.',
    );
  if (
    (relationAngle !== null && Math.abs(angle - relationAngle) > 1e-9) ||
    (relationTurns !== null && count !== relationTurns)
  )
    throw new Error(
      `This loose lashing has ${String(relationTurns)} turns crossing at ${String(relationAngle)} degrees; dress it as it is or untie it. Nothing was spent.`,
    );
  const pieces = (
    loose
      ? [members(w, loose).top, members(w, loose).bottom]
      : ids.map((id) => w.stacks.find((s) => s.id === id))
  ).flatMap((s) => {
    const p = s ? measurePiece(w, s) : null;
    return p ? [p] : [];
  });
  if (pieces.length !== 2)
    throw new Error('A piece has no represented geometry; nothing was spent.');
  const mc = X.measureCord(w, cord);
  if (!mc)
    throw new Error('The cord has no measurable geometry; nothing was spent.');
  if (!loose && mc.overall < least(mc.width, count) - 1e-9)
    throw new Error(
      `The cord is ${String(m(mc.overall))} m; whatever the pieces, ${String(count)} turns and a closure in a cord ${String(m(mc.width))} m wide need at least ${String(m(least(mc.width, count)))} m. Nothing was spent.`,
    );
  guard(c, pieces, angle);
  const stages = tieStages(count),
    offset = loose ? stages.length - 1 : 0,
    j = workCreate(c, 'attempt', stages.length - offset);
  j.law = LAW;
  j.method = METHOD;
  j.binding = loose ?? v7Id(w, 'lashing');
  j.target = j.binding;
  j.angle = angle;
  j.turns = count;
  j.reached = offset;
  j.offset = offset;
  j.pose = loose ? v7Json(record(recOf(cord).pose)) : null;
  j.fit = loose ? v7Json(record(recOf(cord).geometry)) : null;
  j.lastStage = null;
  reserve(c, j, ids, cord, loose);
  c.emit(
    `${PREFIX}started`,
    `Two pieces and the cord are reserved and held for a bare-hand ${String(count)}-turn crossing lashing${offset ? ' (dressing only: the loose closure is already tucked)' : ''}; no tool, anchor, added cord or second person is used.`,
    { ...summary(w, j), stageStarted: stages[offset] ?? null },
    j.binding,
  );
  return advance(c, j);
}

function startUntie(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor;
  if (current(w, a))
    throw new Error(
      'Unfinished lashing work exists; resume it with its mode and workId, or cancel it. Nothing was spent.',
    );
  if (c.action.args.workId !== undefined)
    throw new Error(
      'No unfinished lashing work of yours has this workId; nothing was spent.',
    );
  const b = ownBinding(c),
    cord = b.cord as V7Stack,
    g = record(recOf(cord).geometry),
    { tails } = ledger(cord);
  if (Math.min(...tails) < K.PINCH - 1e-9)
    throw new Error(
      `The tails are ${tails.join(' and ')} m; drawing an end back needs a ${String(K.PINCH)} m pinch. Nothing was spent.`,
    );
  const pieces = [b.top, b.bottom].flatMap((s) => {
    const p = s ? measurePiece(w, s) : null;
    return p ? [p] : [];
  });
  if (pieces.length !== 2)
    throw new Error('A piece has no represented geometry; nothing was spent.');
  guard(c, pieces, num(g.crossingAngle));
  const count = num(g.wrapCount),
    j = workCreate(c, 'untie', untieStages(count).length);
  j.law = LAW;
  j.method = METHOD;
  j.binding = b.id;
  j.target = b.id;
  j.angle = num(g.crossingAngle);
  j.turns = count;
  j.reached = 0;
  j.pose = v7Json(record(recOf(cord).pose));
  j.fit = v7Json(g);
  j.lastStage = null;
  j.pieces = [b.top?.id ?? '', b.bottom?.id ?? ''];
  j.cord = cord.id;
  j.split = [];
  for (const s of listOf(b)) holdItem(c, j, s);
  c.emit(
    `${PREFIX}started`,
    `The lashed pieces and cord are reserved and held for untying ${String(count)} turns with bare hands.`,
    { ...summary(w, j), stageStarted: untieStages(count)[0] ?? null },
    b.id,
  );
  return advance(c, j);
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    { workId, bindingId } = c.action.args;
  if ((workId === undefined) === (bindingId === undefined))
    throw new Error(
      'Inspect needs exactly one of bindingId or workId; nothing was spent.',
    );
  const j =
    typeof workId === 'string'
      ? ownJobs(w, a).find((x) => x.id === workId)
      : undefined;
  if (typeof workId === 'string' && !j)
    throw new Error(
      'No lashing work of yours has this workId; nothing was spent.',
    );
  const parts = j ? held(w, j) : ownBinding(c, false),
    id = j ? str(j.binding) : str(bindingId);
  if (listOf(parts).length !== 3)
    throw new Error(
      'The items of this work are no longer together; nothing was spent.',
    );
  v7Spend(a, LOOK);
  const cord = parts.cord as V7Stack,
    k = recOf(cord),
    state = stateOf(cord),
    bound = RETAINED.includes(state) && k.bindingId === id,
    model = modelOf(k),
    rest = model && bound ? tensions(model) : null,
    trials = trialsOf(cord),
    book = ledger(cord),
    shown = shownTurns(cord),
    value: V7Data = {
      ...(j ? summary(w, j) : {}),
      bindingId: id,
      lashing: view(w, parts, bound ? id : null),
      cord: F.look(w, cord),
      pieces: [parts.top, parts.bottom].map((s) => {
        const p = s ? measurePiece(w, s) : null;
        return s && p
          ? {
              item: s.id,
              resource: s.resource,
              origin: s.origin,
              length: p.length,
              diameter: m(p.diameter),
              condition: v7RoundNumber(p.condition),
              visibleDamage:
                recOf(s).broken === true
                  ? 'broken'
                  : p.condition < 1
                    ? 'cracked fibres'
                    : 'none',
            }
          : null;
      }),
      ledger: { centreline: Number(F.part(cord).overall), ...book },
      turnsRound: shown,
      visibleTurns: range(shown).map((i) => ({
        turn: i + 1,
        looks:
          rest && k.seated === true
            ? slackTurn(rest, i)
              ? 'slack on the crossing'
              : 'snug on the crossing'
            : state === 'tucked'
              ? 'loose, not dressed'
              : 'held by hand',
        slack: model ? m(model.turns[i]?.slack ?? 0) : 0,
        migration: model ? m(model.turns[i]?.migration ?? 0) : 0,
      })),
      displacement: m(num(k.crossingShift)),
      visibleRetention:
        state === 'bound'
          ? rest && rest.max > 1e-9
            ? 'snug round the crossing'
            : 'slack round the crossing'
          : state === 'tucked'
            ? 'loose closure, not dressed'
            : 'not closed',
      lashingTrials: trials,
      lastLashingTrial: trials.at(-1) ?? null,
      holdingForce: null,
      unknown:
        'turn tensions, holding force, slip load, safe load and behavior under other loads are not determined by inspection',
    };
  openRemember(c, {
    key: `${id ?? j?.id ?? ''}:crossing-lashing-geometry`,
    subject: id ?? j?.id ?? '',
    property:
      'lashing state, crossing, turns, bridges, closure, tails, slack, displacement, condition and recorded tests',
    value: v7Json(value),
    method: 'direct inspection',
    condition: 'visible and measurable features only; no load is applied',
    verified: false,
  });
  c.emit(
    `${PREFIX}inspected`,
    'Only visible turns, closure, tails, slack, displacement, damage and recorded tests are reported; no load was applied and nothing was changed or repaired.',
    value,
    id ?? j?.id ?? null,
  );
  return { complete: true, writes: [] };
}

/** Breaks the cord at one point into two owned fragments of conserved fiber and length. */
function fragmentCord(
  w: V7World,
  at: V7Point,
  s: V7Stack,
  cut: number,
  condition: number,
  trials: V7Data[],
): V7Stack[] {
  const p = F.part(s),
    n = foodTenths(s.quantity),
    overall = Number(p.overall),
    length = Number(p.length),
    point = m(Math.min(overall - 1e-4, Math.max(1e-4, cut))),
    lengths = [point, m(overall - point)],
    first = Math.min(n - 1, Math.max(1, Math.round((n * point) / overall))),
    quantities = [first, n - first],
    twisted = m((length * point) / overall),
    plies = [twisted, m(length - twisted)],
    ids = [v7Id(w, 'item'), v7Id(w, 'item')],
    frayed = Number(p.frayedEnds ?? 0);
  return [0, 1].map((i) => {
    const f: V7Stack = {
      ...v7Clone(s),
      id: ids[i] ?? '',
      quantity: (quantities[i] ?? 0) / 10,
      quantityTenths: quantities[i] ?? 0,
      position: { ...at },
    };
    delete f.reservedFor;
    const processing: V7Data = {
      ...v7Clone(s.processing ?? {}),
      [F.PART]: {
        ...v7Clone(p),
        role: 'fragment',
        status: 'broken',
        condition,
        length: plies[i] ?? 0,
        twisted: plies[i] ?? 0,
        overall: lengths[i] ?? 0,
        frayedEnds: Math.min(2, 1 + (frayed > i ? 1 : 0)),
        fragmentOf: s.id,
        fragments: ids,
      },
      [KEY]: {
        law: LAW,
        revision: REVISION,
        method: METHOD,
        part: 'cord',
        state: 'separate',
        bindingId: null,
        workId: null,
        pieces: [],
        geometry: null,
        model: null,
        points: null,
        pose: null,
        at: null,
        routedTurns: 0,
        remainingTurns: 0,
        seated: false,
        crossingShift: 0,
        trials,
        evidence: strings(recOf(s).evidence),
        last: 'broke-in-lashing',
        fragmentOf: s.id,
        fragments: ids,
        brokenAt: point,
        priorRole: 'fragment',
        updatedAt: w.tick,
      },
    };
    // A later knot, join or single-wrap binding of a fragment must restore the fragment role.
    for (const key of [K.KNOT, B.JOIN, X.BIND])
      if (processing[key])
        processing[key] = {
          ...record(processing[key]),
          priorRole: 'fragment',
          workId: null,
        };
    f.processing = processing;
    return f;
  });
}
/** Where the cord parts, measured from its first end: where the more loaded end enters its outer turn. */
function breakPoint(cord: V7Stack, model: Model, rest: Tensions) {
  const { tails } = ledger(cord),
    L = Number(F.part(cord).overall),
    fromFirst = (tails[0] ?? 0) + model.closurePath + model.bridge;
  return rest.ends[0] >= rest.ends[1]
    ? fromFirst
    : L - ((tails[1] ?? 0) + model.closurePath + model.bridge);
}
/** The lashing came apart: the cord lies straight and both pieces are free. */
function separate(w: V7World, parts: Parts, last: string) {
  for (const s of listOf(parts)) {
    delete s.reservedFor;
    if (s === parts.cord) freeCord(w, s, last);
    else freePiece(w, s, last);
  }
}

/** A bounded two-hand test, one hand on each piece beyond the turns (multi-turn-contact@1, part 5). */
function trial(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    b = ownBinding(c),
    { top, bottom } = b,
    cord = b.cord as V7Stack;
  if (stateOf(cord) !== 'bound' || !top || !bottom)
    throw new Error(
      'bindingId must name your own dressed, release-checked lashing; a loose closure is dressed with attempt first. Nothing was spent.',
    );
  const direction = v7String(c.action.args.trialDirection, 'trialDirection');
  if (!X.DIRECTIONS.includes(direction))
    throw new Error(
      'Only separate (pull the pieces apart across the crossing) and slide (draw the bottom piece along the top one) are supported; other loads are not represented. Nothing was spent.',
    );
  const force = v7Number(
      c.action.args.trialForce,
      'trialForce',
      0,
      K.MAX_FORCE,
    ),
    seconds = v7Number(
      c.action.args.trialDuration,
      'trialDuration',
      0,
      K.MAX_SECONDS,
    );
  if (!(force > 0) || !(seconds > 0))
    throw new Error(
      'trialForce and trialDuration must be above zero; nothing was spent.',
    );
  const k = recOf(cord),
    g = record(k.geometry),
    grips = numbers(g.grips),
    model = modelOf(k);
  if (g.gripsFit !== true)
    throw new Error(
      'A piece is too short for a 0.05 m hand grip clear of the turns; no opposed hand pair is possible. Nothing was spent.',
    );
  const pt = measurePiece(w, top),
    pb = measurePiece(w, bottom),
    load = model ? cordLoad(w, cord, model) : null,
    slip = liveSlip(w, cord);
  if (!pt || !pb || !model || !load || slip === undefined)
    throw new Error(
      'Unsupported material: no piece, strand or friction law applies; nothing was spent.',
    );
  const lay = X.space(w, a, [pt, pb], num(g.crossingAngle), null);
  if (lay.blocked)
    throw new Error(`No room to work: ${lay.blocked}. Nothing was spent.`);
  v7Spend(a, TRIAL);
  const before = view(w, b, b.id),
    rest = tensions(model),
    pieces = [pt, pb],
    hand = (F.HAND_PULL * Math.max(0, Math.min(100, a.vitals.health))) / 100,
    grip = F.GRIP * Math.min(pt.diameter, pb.diameter),
    limit = Math.min(force, hand, grip),
    // Slide: the turns slide on the top piece with the bottom piece against the bark friction of
    // the actual tension over each turn's top contact; slack turns add nothing.
    slideLoad = model.mu * sum(rest.top),
    under = (f: number) =>
      direction === 'separate'
        ? tensions(model, separated(model, load.stiffness, f).extra)
        : rest,
    loads: { kind: string; load: number; piece?: number }[] = [];
  if (direction === 'separate') {
    if (slip !== null)
      loads.push({
        kind: 'closure-slipped',
        load: threshold(limit, (f) => Math.max(...under(f).ends) >= slip),
      });
    loads.push({
      kind: 'cord-broke',
      load: threshold(limit, (f) => under(f).max >= load.strength),
    });
  } else {
    loads.push({ kind: 'crossing-slipped', load: slideLoad });
    if (slip !== null && slip <= Math.max(...rest.ends))
      loads.push({ kind: 'closure-slipped', load: 0 });
    if (load.strength <= rest.max) loads.push({ kind: 'cord-broke', load: 0 });
  }
  pieces.forEach((p, i) =>
    loads.push({
      kind: 'piece-broke',
      piece: i,
      load:
        (X.bendingStrength(p) * Math.PI * p.diameter ** 3) /
        32 /
        Math.max(1e-9, grips[i] ?? 0),
    }),
  );
  loads.sort((x, y) => x.load - y.load);
  const first = loads[0],
    failed = first && first.load <= limit ? first : null,
    outcome = failed
      ? failed.kind
      : force > grip && grip <= hand
        ? 'grip-lost'
        : 'held',
    achieved = failed ? failed.load : limit,
    sep =
      direction === 'separate'
        ? separated(model, load.stiffness, achieved)
        : null,
    loaded = sep ? tensions(model, sep.extra) : rest,
    ratio = Math.min(1, loaded.max / Math.max(1e-12, load.strength)),
    damage = outcome === 'cord-broke' ? 0 : Math.max(0, ratio - F.ONSET),
    cond = F.conditionOf(cord),
    after = v7RoundNumber(cond * (1 - damage)),
    bending = pieces.map((p, i) => {
      const moment = achieved * (grips[i] ?? 0),
        stress = (32 * moment) / (Math.PI * p.diameter ** 3),
        share = Math.min(1, stress / Math.max(1e-12, X.bendingStrength(p))),
        broke = outcome === 'piece-broke' && failed?.piece === i;
      return {
        item: p.stack.id,
        moment: v7RoundNumber(moment),
        stress: Math.round(stress),
        loadShare: v7RoundNumber(share),
        deflection: m(
          (achieved * (grips[i] ?? 0) ** 3) /
            (3 * p.law.modulus * ((Math.PI * p.diameter ** 4) / 64)),
        ),
        damage: broke ? 1 : v7RoundNumber(Math.max(0, share - F.ONSET)),
        conditionBefore: v7RoundNumber(p.condition),
        conditionAfter: broke
          ? 0
          : v7RoundNumber(p.condition * (1 - Math.max(0, share - F.ONSET))),
      };
    }),
    heldSeconds = outcome === 'held' ? seconds : 0,
    // fiber-cord@1's creep law for each turn at its own mean tension over the hold.
    creep = model.turns.map((t, i) =>
      outcome === 'held'
        ? load.law.creep *
          F.wetness(load.r) *
          Math.min(1, (loaded.mean[i] ?? 0) / Math.max(1e-12, load.strength)) *
          (seconds / F.ROUND_SECONDS) *
          t.length
        : 0,
    ),
    migrated = outcome === 'crossing-slipped' ? model.width : 0,
    result = {
      tick: w.tick,
      actor: a.id,
      bindingId: b.id,
      items: [top.id, bottom.id, cord.id],
      law: LAW,
      wrapCount: model.turns.length,
      reuses: `${F.LAW} grip, hand, breaking, stiffness and creep rules; cord-knot@1 curvature rule; cord-bend@1 closure friction; crossing-contact@1 cord-on-bark friction, grip sites and bending`,
      direction,
      gripSites: grips.map((d, i) => ({
        piece: i ? bottom.id : top.id,
        fromCrossing: d,
        length: F.HOLD,
      })),
      forceDirection:
        direction === 'separate'
          ? 'opposed, across the crossing: each hand pulls its piece away from the other'
          : 'opposed, along the top piece: one hand holds the top piece, the other draws the bottom piece along it',
      outcome,
      requestedForce: force,
      achievedForce: F.newtons(achieved),
      handLimit: force > hand && hand < grip ? F.newtons(hand) : null,
      gripSlippedAt: outcome === 'grip-lost' ? F.newtons(grip) : null,
      requestedDuration: seconds,
      heldSeconds,
      forceRecord: [
        { seconds: 0, force: 0 },
        { seconds: 0, force: F.newtons(achieved) },
        { seconds: heldSeconds, force: F.newtons(achieved) },
        { seconds: heldSeconds, force: 0 },
      ],
      stoppedBy:
        outcome === 'held'
          ? 'the requested time'
          : outcome === 'grip-lost'
            ? 'loss of grip'
            : outcome === 'crossing-slipped' || outcome === 'closure-slipped'
              ? 'slip'
              : 'breakage',
      turnTensionsBefore: turnText(rest),
      turnTensions: turnText(loaded),
      turnStates: range(model.turns.length).map((i) =>
        slackTurn(rest, i) ? 'slack' : 'taut',
      ),
      endTensions: loaded.ends.map(F.newtons),
      clampingForce: F.newtons(
        sep ? sep.clamping : separated(model, load.stiffness, 0).resting,
      ),
      crossingSlipLoad: direction === 'slide' ? F.newtons(slideLoad) : null,
      turnTopFriction:
        direction === 'slide'
          ? rest.top.map((x) => F.newtons(model.mu * x))
          : null,
      closureSlipLoad: slip === null ? null : F.newtons(slip),
      crossingDisplacement: m(migrated),
      turnMigration: model.turns.map(() => m(migrated)),
      separationGap: m(sep?.gap ?? 0),
      elasticExtension: model.turns.map((t, i) =>
        m(((sep?.extra[i] ?? 0) * t.length) / load.stiffness),
      ),
      retainedDeformation: m(sum(creep)),
      cordConcentration: v7RoundNumber(load.concentration),
      cordLoadShare: v7RoundNumber(ratio),
      strandsBroken: v7RoundNumber(damage),
      conditionBefore: cond,
      conditionAfter: after,
      pieces: bending,
    },
    entry: V7Data = {
      tick: w.tick,
      direction,
      outcome,
      requestedForce: force,
      achievedForce: result.achievedForce,
      heldSeconds,
      loadShare: v7RoundNumber(ratio),
      conditionBefore: cond,
    },
    trials = [...trialsOf(cord), entry].slice(-4);
  const outputs: V7Stack[] = [];
  bending.forEach((p, i) => {
    const s = i ? bottom : top;
    if (p.conditionAfter < p.conditionBefore || p.damage >= 1)
      writePiece(w, s, {
        condition: p.conditionAfter,
        ...(p.damage >= 1 ? { broken: true, brokenAt: w.tick } : {}),
      });
  });
  F.part(cord).condition = after;
  k.trials = trials;
  let loosened = false;
  if (outcome === 'cord-broke') {
    outputs.push(
      ...fragmentCord(
        w,
        a.position,
        cord,
        breakPoint(cord, model, loaded),
        after,
        trials,
      ),
    );
    w.stacks = w.stacks.filter((s) => s !== cord);
    w.stacks.push(...outputs);
    separate(w, { top, bottom }, 'broke-cord-parted');
  } else if (outcome === 'closure-slipped')
    separate(w, b, 'slipped-closure-under-load');
  else if (outcome === 'piece-broke') separate(w, b, 'broke-piece-cracked');
  else {
    if (outcome === 'crossing-slipped') {
      k.crossingShift = m(num(k.crossingShift) + migrated);
      for (const t of model.turns) t.migration += migrated;
    }
    creepInto(load, model, creep);
    k.model = modelJson(model);
    const now = tensions(model);
    if (now.max <= 1e-9) {
      writeCord(w, cord, 'tucked', { last: 'loosened-by-creep' });
      loosened = true;
    }
  }
  remember(
    c,
    `lashing-hand-load-${direction}`,
    outputs[0] ?? cord,
    [top, bottom],
    model.turns.length,
    `${F.band(cond)}-${outcome}`,
    result,
    `opposed two-hand ${direction} test of ${String(result.achievedForce)} N`,
  );
  const kept =
      outcome === 'held' ||
      outcome === 'grip-lost' ||
      outcome === 'crossing-slipped',
    parts: Parts = outputs.length ? { top, bottom } : b,
    data = {
      ...result,
      before,
      after: view(w, parts, kept ? b.id : null),
      visual: {
        ...view(w, parts, kept ? b.id : null),
        trial: {
          direction,
          outcome,
          achievedForce: result.achievedForce,
          heldSeconds,
        },
        fragments: outputs.map((f) => F.view(w, f)),
      },
      fragments: outputs.map((f) => f.id),
      energy: TRIAL,
      trialStarted: true,
      trialStopped: true,
    };
  c.emit(
    `${PREFIX}trial`,
    outcome === 'held'
      ? `The ${String(model.turns.length)}-turn lashing held ${String(result.achievedForce)} N (${direction}) for ${String(seconds)} s between both hands. A pass means only this arrangement, force and time, not a safe load.`
      : outcome === 'grip-lost'
        ? `A hand slipped on its piece at ${String(result.achievedForce)} N; the test stopped.`
        : outcome === 'crossing-slipped'
          ? `The crossing slipped at ${String(result.achievedForce)} N: the turns slid along the top piece with the bottom piece; the test stopped and the lashing stays closed.`
          : outcome === 'closure-slipped'
            ? `The closure slipped at ${String(result.achievedForce)} N; the turns opened and both pieces and the cord are free.`
            : outcome === 'cord-broke'
              ? `The cord parted where the more loaded end enters the turns at ${String(result.achievedForce)} N, into two owned fragments of the same fiber; the pieces are free.`
              : `A piece cracked at ${String(result.achievedForce)} N; the lashing came apart and the damaged piece is kept.`,
    data,
    b.id,
  );
  if (kept) addEvidence(c.world, cord);
  const extra: Record<string, [string, string] | undefined> = {
    'grip-lost': [
      `${PREFIX}grip-slipped`,
      'A hand slipped on its piece; nothing moved at the crossing.',
    ],
    'crossing-slipped': [
      `${PREFIX}crossing-slipped`,
      'The pieces moved relative to each other at the crossing by about one cord width before the hands stopped; every turn migrated with the bottom piece.',
    ],
    'closure-slipped': [
      `${PREFIX}closure-slipped`,
      'The closure slipped under the load; the lashing came apart and all three items are conserved.',
    ],
    'cord-broke': [
      `${PREFIX}broken`,
      'Broken in the lashing: two owned fragments keep all of the cord; both pieces are free and nothing vanished.',
    ],
    'piece-broke': [
      `${PREFIX}broken`,
      'A piece cracked at the crossing; it is kept as damaged material and nothing vanished.',
    ],
  };
  const more = extra[outcome];
  if (more) c.emit(more[0], more[1], data, b.id);
  if (
    outcome !== 'cord-broke' &&
    (damage > 0 || bending.some((p) => p.damage > 0 && p.damage < 1))
  )
    c.emit(`${PREFIX}damaged`, 'Some fibres broke under the load.', data, b.id);
  if (loosened)
    c.emit(
      `${PREFIX}loosened`,
      'Creep left every turn slack: the closure still holds them, but the lashing is loose.',
      data,
      b.id,
    );
  return {
    complete: true,
    writes: [...outputs.map((f) => f.id), ...listOf(parts).map((s) => s.id)],
  };
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    workId = c.action.args.workId,
    j = current(w, c.actor);
  if (!j || (typeof workId === 'string' && workId !== j.id))
    throw new Error(
      'No unfinished lashing work of yours to cancel; nothing was spent.',
    );
  const { relaxed, retained } = release(
    w,
    c.actor,
    j,
    'Cancelled; the pieces and cord are released once as they actually are. Paid energy is not refunded.',
    false,
  );
  c.emit(
    `${PREFIX}cancelled`,
    retained
      ? 'Lashing work cancelled: the closure keeps the three items together as they are; nothing is refunded or untied.'
      : 'Lashing work cancelled: nothing held the items together, so both pieces and the cord are free; nothing is refunded.',
    { ...summary(w, j), retained },
    str(j.binding) ?? j.id,
  );
  if (relaxed) relaxedEvent(emitter(c), w, j, relaxed);
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = v7String(c.action.args.mode, 'mode'),
    j = current(c.world, c.actor);
  if (!ARGS[mode]) throw new Error('Unknown lashing mode.');
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
    throw new Error('The bound lashing work is already settled.');
  relevant(c, mode);
  if (mode === 'attempt') return attempt(c);
  if (mode === 'untie') return startUntie(c);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'trial') return trial(c);
  return cancel(c);
}

/** Reserved items stay in the owner's hands; an unworked round pauses and relaxes hand-held stages.
 * A retained lashing is carried as owned items holding both pieces (no hanging load); its cord wears
 * through hand-bind-crossing@1's once-per-round wear of the bound role, and parts in place when it
 * can no longer carry its own turn tensions. */
function environment(w: V7World) {
  for (const j of collectiveJobs(w, ID).filter(open)) {
    const a = w.actors.find((x) => x.id === j.owner);
    if (!a) continue;
    j.x = a.position.x;
    j.y = a.position.y;
    for (const s of w.stacks.filter((s) => s.reservedFor === j.id))
      s.position = { ...a.position };
    if (j.status === 'active' && j.lastPaid < w.tick) {
      const say = announcer(w, a);
      if (j.mode === 'untie' && num(j.reached) >= 1) {
        const { relaxed } = release(
          w,
          a,
          j,
          'Not worked this round; the open turns held only by hand fell off.',
          false,
        );
        say(
          `${PREFIX}stopped`,
          'Untying stopped because it was not worked this round; nothing was spent.',
          summary(w, j),
          str(j.binding) ?? j.id,
        );
        if (relaxed) relaxedEvent(say, w, j, relaxed);
      } else {
        const note = relax(w, j, false);
        j.status = 'paused';
        j.reason =
          'Not worked this round; paid stages and the reserved items are kept.';
        say(
          `${PREFIX}paused`,
          'Lashing work paused because it was not worked this round; nothing was spent.',
          summary(w, j),
          str(j.binding) ?? j.id,
        );
        if (note) relaxedEvent(say, w, j, note);
      }
    }
    sync(a, j);
  }
  for (const cord of w.stacks.filter(
    (s) => stateOf(s) === 'bound' && F.roleOf(s) === 'bound',
  )) {
    const k = recOf(cord),
      id = str(k.bindingId),
      model = modelOf(k);
    // A lashing held by untie work is in the hands; only a free relation is resolved here.
    if (!id || cord.reservedFor !== id || !model) continue;
    const load = cordLoad(w, cord, model),
      rest = tensions(model);
    if (!load || load.strength > rest.max) continue;
    const parts = members(w, id),
      owner = w.actors.find((x) => x.id === cord.owner && x.vitals.health > 0),
      at = owner ? owner.position : cord.position,
      pieces = fragmentCord(
        w,
        at,
        cord,
        breakPoint(cord, model, rest),
        F.conditionOf(cord),
        trialsOf(cord),
      );
    w.stacks = w.stacks.filter((s) => s !== cord);
    w.stacks.push(...pieces);
    separate(w, { top: parts.top, bottom: parts.bottom }, 'broke-cord-parted');
    forestEvent(
      w,
      `${PREFIX}broken`,
      'Under its own turn tensions the worn cord parted where the more loaded end enters the turns, into two owned fragments of the same fiber; both pieces are free and nothing vanished.',
      at,
      owner?.id ?? null,
      {
        bindingId: id,
        endTensions: rest.ends.map(F.newtons),
        fragments: pieces.map((f) => f.id),
        visual: view(w, { top: parts.top, bottom: parts.bottom }, null),
      },
      id,
    );
  }
}

export const LONG_CROSSING_LASHING: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex16',
  dependencies: [
    'foundation-open@1',
    'hand-twist-fiber-cord@1',
    'hand-tie-cord-knot@1',
    'hand-join-fiber-cords@1',
    'hand-bind-crossing@1',
  ],
  description:
    'General bare-hand lashing of two owned rigid branch pieces where they cross with one owned fiber-cord@1 cord in 2-4 adjacent turns closed by one overhand in its ends: wrapCount + 3 paid rounds under the multi-turn-contact@1 turn geometry and per-turn tension rules, inspection, a bounded two-hand test, untying and cancel. The lashing is a relation of the three conserved items. No reward, rating, hanging load, shelter or added material.',
  reuse: {
    experiment:
      'ex16 hand-bind-crossing@1 (law crossing-contact@1: rigid branch law, piece and cord measurement, wrap-plane sections, tightest radius and bridging share, hand span, lift, room and layout, cord-on-bark friction, closure slip, grip sites, piece bending, staged work pattern, through a new append-only CROSSING_CONTACT export; its bound-role wear applies once to these cords); ex16 hand-twist-fiber-cord@1 (cord item, width, condition, strand law, breaking force, grip and hand limits, stiffness, creep, damage onset and visual metadata, through FIBER_CORD); ex16 hand-tie-cord-knot@1 (bend limit, knot state, opening, pinch, trial clearance and bounds, through CORD_KNOT); ex16 hand-join-fiber-cords@1 (dressing pull, reed friction and join key, through CORD_BEND); cords from hand-twist-sectioned-cord@1 are ordinary fiber-cord@1 cords',
    source:
      'long-crossing-binding.ts CROSSING_CONTACT (appended); long-fiber-cord.ts FIBER_CORD; long-cord-knot.ts CORD_KNOT; long-fiber-cord-join.ts CORD_BEND; collective-work.ts (paid work, stop); material-lots.ts; open-foundation.ts (personal records); forest-climate.ts (events)',
    description:
      'Implementation reuse only; the four cord and binding packages keep their behavior and ability text, and no ability is a prerequisite. Only the multi-turn hull and pitch, bridges, stage-by-stage length need, pinned-turn hand rule, capstan dressing and per-turn tension, slack, migration and load-sharing rules are new, registered as multi-turn-contact@1.',
  },
  abilities: [
    {
      id: ID,
      name: 'Hand-lash crossing pieces',
      function:
        'Lash two own branch pieces where they cross with your own fiber cord in 2-4 adjacent turns and one overhand closure; inspect, hand-test, untie or cancel; measured geometry and tensions decide results.',
      equivalence: 'binding:hand-lashed-multi-turn-crossing:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['attempt', 'inspect', 'trial', 'untie', 'cancel'],
          },
          pieceIds: { type: 'array', items: { type: 'string' } },
          cordId: { type: 'string' },
          crossingAngle: {
            type: 'number',
            minimum: X.ANGLE.min,
            maximum: X.ANGLE.max,
          },
          wrapCount: {
            type: 'integer',
            minimum: TURNS.min,
            maximum: TURNS.max,
          },
          workId: { type: 'string' },
          bindingId: { type: 'string' },
          trialForce: { type: 'number', minimum: 0, maximum: K.MAX_FORCE },
          trialDuration: { type: 'number', minimum: 0, maximum: K.MAX_SECONDS },
          trialDirection: { type: 'string', enum: X.DIRECTIONS },
        }),
        required: ['mode'],
      },
      references: {},
      prerequisites: [],
      learning: 5,
      learningEnergy: 0.2,
      costs:
        'Study: 5 rounds at 0.2 energy. attempt (pieceIds: two own untreated branch items, one whole unit each, first on top; a 2-unit lot may be named twice; cordId: own straight unknotted unjoined cord or fragment, 0.2+ unit; crossingAngle 30-90 deg; wrapCount 2-4 (1: hand-bind-crossing)): reserves them, then wrapCount + 3 paid rounds of 0.5 (measure-position, route-turn-1..n, form-tuck-closure, dress-release-check), continuing each round; a loose lashing needs only the last; resume: attempt + workId. inspect (bindingId or workId): 0.2. trial (dressed; trialForce N >0-10; trialDuration s >0-60; trialDirection): 0.5. untie: wrapCount + 1 rounds of 0.5. cancel: free. Needs dry footing, dry clear land for the 2 m pieces crossed at your place, nobody within your radius + 1 m. Unworked rounds, low energy or blocked room pause uncharged; refusals spend nothing; no refunds.',
      effects:
        "multi-turn-contact@1 reuses crossing-contact@1 piece, cord, closure, hand, grip and bending rules; the lashing relates the three kept items. Round 1 plans turns one cord width apart, each the hull of both sections offset w/2 in its shifted plane plus a helical advance; the ends ride over them to one closure. Need = the longest stage: turns + 0.04 m on the turn being passed, forming, or seated with 0.02 m + w tails. Too short, a crossing over 0.1 m thick (+2w once turns are pinned) or over 100 N x health/100 to lift: paid measured shortfall. Interrupted hand-held turns fall loose. Dressing pulls each end 5 N; tension falls along the cord by exp(-0.3 x bark contact angle), so inner turns carry less; the closure must hold 5 N. Trial force = min(trialForce, 200 N x health/100, 10000 N/m x piece width); separate: turn sides clamp, then turns stretch, against closure slip and cord break (breaking force / (1 + w/2R)); slide slips at 0.3 x the turns' tension on the top piece; slack turns add nothing. Records per-turn tension, migration, creep and damage. Untie needs condition 0.5. Bound cords wear 0.0005/round once. No reward, rating, hanging load or shelter.",
      handler: 'long.hand-lash-crossing',
      revision: REVISION,
      authored: false,
      // The release-held event carries no qualified flag: a lashing earns no milestone.
      practiceEvidence: `${PREFIX}release-held`,
      dependencies: {
        abilities: [],
        resources: ['branch', 'reed'],
        knowledge: [],
      },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Paid stages persist; resuming by workId pays only the next stage. Other modes take one round.',
      },
    },
  ],
  handlers: { 'long.hand-lash-crossing': execute },
  processes: {},
  visualComponents: [],
  events: [
    'started',
    'measured',
    'shortfall',
    'turn-routed',
    'closure-formed',
    'release-held',
    'release-failed',
    'relaxed',
    'paused',
    'resumed',
    'cancelled',
    'stopped',
    'inspected',
    'trial',
    'grip-slipped',
    'crossing-slipped',
    'closure-slipped',
    'damaged',
    'broken',
    'loosened',
    'resisted',
    'closure-withdrawn',
    'turn-unwrapped',
    'untied',
  ].map((e) => `${PREFIX}${e}`),
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath(w, a) {
    for (const j of ownJobs(w, a).filter(open)) {
      const say = announcer(w, a),
        { relaxed } = release(
          w,
          a,
          j,
          'Performer died; the pieces and cord were left where they died, once, as they actually are. Nothing is refunded.',
          true,
        );
      say(
        `${PREFIX}stopped`,
        'Lashing work stopped by death; the pieces and cord lie where the person died in their actual configuration.',
        summary(w, j),
        str(j.binding) ?? j.id,
      );
      if (relaxed) relaxedEvent(say, w, j, relaxed);
      sync(a, j);
    }
  },
};
