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
import {
  v7Inside,
  v7Obstacles,
  v7SegmentClear,
} from './continuous-geometry.js';
import { forestEvent } from './forest-climate.js';
import {
  foodSetQuantity,
  foodTenths,
  foodUnitMass,
} from './forest-food-accounting.js';
import { materialPortion } from './material-lots.js';
import { openConditions } from './open-physical.js';
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

const ID = 'hand-bind-crossing';
const REVISION = `${ID}@1`;
const STATE = `long:work:${ID}`;
/** Processing key of one item's part in a crossing binding; the binding is a relation of three items. */
const BIND = 'crossingBinding';
const LAW = 'crossing-contact@1';
const METHOD = 'single-wrap-overhand-closure';
/** Energy of one attempt or untie round, of an inspection and of a trial. */
const STEP = 0.5;
const LOOK = 0.2;
const TRIAL = 0.5;
const TIE = [
  'measure-position',
  'route-wrap',
  'form-tuck-closure',
  'dress-release-check',
];
const UNTIE = ['withdraw-closure-end', 'open-remove-wrap'];
interface Rigid {
  /** Member length of one whole unit (m), solid density (kg/m3), modulus and strength (Pa). */
  length: number;
  density: number;
  modulus: number;
  strength: number;
  wetWeakening: number;
}
/** Registered rigid-piece laws, re-stated without calling them: the branch values of the existing
 * law of open-shelter-material.ts (version 2), whose reed values fiber-cord@1 re-states. One whole
 * unit is one 2 m member whose section follows from its conserved solid volume. No other material
 * has a rigid-piece law, so no other piece is supported in this version. */
const RIGID: Partial<Record<string, Rigid>> = {
  branch: {
    length: 2,
    density: 350,
    modulus: 4e9,
    strength: 45e6,
    wetWeakening: 0.6,
  },
};
/** crossing-contact@1 (modeling assumption): static friction of twisted plant-fiber cord on dry
 * branch bark. No world value existed; 0.3 is the low end of dry fiber rope on wood (about 0.3-0.5),
 * declared for this contact pair rather than inferred from cord-bend@1's cord-on-cord value.
 * Wetness, wear and dynamic friction do not change it; bark on bark at the crossing is not
 * represented and resists nothing in this version, which understates holding. */
const BARK: Partial<Record<string, number>> = { reed: 0.3 };
/** Stacked thickness one hand can close round to hold a crossing while the other routes the cord. */
const HAND_SPAN = 0.1;
/** Standard gravity, as in the existing metrology and shelter load rules (mass units read as kg). */
const GRAVITY = 9.81;
const ANGLE = { min: 30, max: 90 };
/** Directions (degrees, world frame) tried in order for the top piece when laying the crossing out. */
const LAYOUTS = [0, 45, 90, 135];
/** Supported trial load modes; twisting, bending and hanging loads are not represented. */
const DIRECTIONS = ['separate', 'slide'];
/** Stack treatments other packages represent; no rigid-piece law applies over them. */
const TREATED = [
  'physical',
  'materialLayer',
  'mantle',
  'frictionKit',
  'waterCup',
  'fuelMoisture',
  'canopyDrying',
  'componentLots',
] as const;
/** Arguments each mode accepts besides mode; any other supplied argument is refused. */
const ARGS: Partial<Record<string, string[]>> = {
  attempt: ['pieceIds', 'cordId', 'crossingAngle', 'workId'],
  inspect: ['bindingId', 'workId'],
  trial: ['bindingId', 'trialForce', 'trialDuration', 'trialDirection'],
  untie: ['bindingId', 'workId'],
  cancel: ['workId'],
};
const WORK = ['attempt', 'untie'];
const ROLES = ['cord', 'fragment'];
type State = 'separate' | 'positioned' | 'wrapped' | 'tucked' | 'bound';
type Part = 'top' | 'bottom' | 'cord';
/** States whose closure holds without hands: the three items stay a linked assembly. */
const RETAINED: State[] = ['tucked', 'bound'];
/** The cord's over/under crossings each state has reached. */
const CROSSINGS: Record<State, string[]> = {
  separate: [],
  positioned: [],
  wrapped: ['over-top-piece', 'under-bottom-piece'],
  tucked: [
    'over-top-piece',
    'under-bottom-piece',
    'end-over-end',
    'end-tucked-under-end',
  ],
  bound: [],
};
CROSSINGS.bound = CROSSINGS.tucked;

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const record = (v: unknown): V7Data =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as V7Data) : {};
const num = (v: unknown) => (typeof v === 'number' ? v : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const numbers = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((x) => num(x)) : [];
const m = F.metres;
const mm = (x: number) => Math.round(x * 1e4) / 10;
const rad = (d: number) => (d * Math.PI) / 180;
const recOf = (s: V7Stack) => record(s.processing?.[BIND]);
function stateOf(s: V7Stack): State {
  const v = recOf(s).state;
  return v === 'positioned' ||
    v === 'wrapped' ||
    v === 'tucked' ||
    v === 'bound'
    ? v
    : 'separate';
}
const trialsOf = (s: V7Stack): V7Data[] => {
  const t = recOf(s).trials;
  return Array.isArray(t) ? t.map(record) : [];
};
const pieceCondition = (s: V7Stack) => {
  const c = recOf(s).condition;
  return typeof c === 'number' ? c : 1;
};
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

/** A whole-unit rigid piece as measured on the live item under its piece law. */
interface Piece {
  stack: V7Stack;
  law: Rigid;
  length: number;
  diameter: number;
  condition: number;
  /** Mass of the one whole unit (read as kg) and its water share. */
  mass: number;
  water: number;
}
function measurePiece(w: V7World, s: V7Stack): Piece | null {
  const law = RIGID[s.resource],
    r = F.material(w, s.resource);
  if (!law || !r) return null;
  const mass = foodUnitMass(w, s),
    water = F.wetness(r),
    volume = (mass * (1 - water)) / law.density;
  return {
    stack: s,
    law,
    length: law.length,
    diameter: 2 * Math.sqrt(volume / (Math.PI * law.length)),
    condition: pieceCondition(s),
    mass,
    water,
  };
}
/** Bending strength of a piece: the law strength weakened by its water share, times its condition. */
const bendingStrength = (p: Piece) =>
  p.law.strength * (1 - p.law.wetWeakening * p.water) * p.condition;

/** A cord as measured on the live item: cord-knot@1's width, centreline and tightest bend. */
interface Cord {
  stack: V7Stack;
  width: number;
  overall: number;
  bend: number | null;
  condition: number;
}
function measureCord(w: V7World, s: V7Stack): Cord | null {
  const g = K.bend(w, s);
  return g
    ? {
        stack: s,
        width: g.width,
        overall: g.length,
        bend: g.bend,
        condition: F.conditionOf(s),
      }
    : null;
}

/** crossing-contact@1, part 2: a piece of radius r cut by the wrap plane at angle beta to its axis
 * is an ellipse with semi-axes r / sin beta across and r up; the cord centreline runs half a width
 * outside it, taken again as an ellipse. Half its Ramanujan perimeter is the arc on this piece. The
 * tightest centreline radius is b^2 / a at the sides; a cord whose bend limit exceeds it bridges
 * there and touches over the share tight / limit of the half turn. */
interface Section {
  a: number;
  b: number;
  half: number;
  tight: number;
  contact: number;
}
function section(r: number, width: number, sin: number, bend: number): Section {
  const a = r / sin + width / 2,
    b = r + width / 2,
    half = (Math.PI / 2) * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))),
    tight = (b * b) / a;
  return { a, b, half, tight, contact: Math.PI * Math.min(1, tight / bend) };
}

/** crossing-contact@1, parts 1-3, for one crossing angle (degrees between the piece axes). */
interface Fit {
  angle: number;
  beta: number;
  top: Piece;
  bottom: Piece;
  cord: Cord;
  sections: [Section, Section];
  sides: number;
  wrap: number;
  route: number;
  closureRadius: number;
  formRadius: number;
  closurePath: number;
  formPath: number;
  tailNeed: number;
  tails: number;
  formEnds: number;
  routeEnds: number;
  need: number;
  formNeed: number;
  arcRadius: number;
  stack: number;
  lift: number;
  liftLimit: number;
  grips: [number, number];
  gripsFit: boolean;
  code: string | null;
  shortfall: string | null;
}
function fit(
  a: V7Actor,
  top: Piece,
  bottom: Piece,
  cord: Cord,
  angle: number,
): Fit {
  const w = cord.width,
    L = cord.overall,
    theta = rad(angle),
    // The wrap runs in the plane through the obtuse bisector of the crossing, at beta to both axes.
    beta = (Math.PI - theta) / 2,
    sin = Math.sin(beta),
    bend = cord.bend ?? Infinity,
    rT = top.diameter / 2,
    rB = bottom.diameter / 2,
    sT = section(rT, w, sin, bend),
    sB = section(rB, w, sin, bend),
    sides = 2 * Math.hypot(rT + rB, sT.a - sB.a),
    wrap = sT.half + sB.half + sides,
    // Routing passes the end under the lifted crossing with a fingertip's opening round it.
    route = wrap + 2 * K.OPENING,
    // The closure: each end turns half round the other, no tighter than one width nor its bend limit.
    closureRadius = Math.max(bend, w),
    formRadius = Math.max(closureRadius, (K.OPENING + w) / 2),
    closurePath = Math.PI * closureRadius + w,
    formPath = Math.PI * formRadius + w,
    tailNeed = F.END + w,
    tails = (L - wrap - 2 * closurePath) / 2,
    formEnds = (L - route - 2 * formPath) / 2,
    routeEnds = (L - route) / 2,
    need = wrap + 2 * closurePath + 2 * tailNeed,
    formNeed = route + 2 * formPath + 2 * K.PINCH,
    arcRadius = Math.max(bend, Math.min(sT.tight, sB.tight)),
    stack = top.diameter + bottom.diameter,
    lift = (top.mass + bottom.mass) * GRAVITY,
    liftLimit =
      ((F.HAND_PULL / 2) * Math.max(0, Math.min(100, a.vitals.health))) / 100,
    // A trial hand grips 0.05 m of each piece with its inner edge 0.01 m beyond the crossing's
    // footprint on that piece: the other piece's width along it, or the wrap's, plus half the cord.
    gripAt = (other: number, own: Section) =>
      Math.max(other / Math.sin(theta), own.a * Math.cos(beta)) +
      w / 2 +
      (K.CLEAR - F.HOLD) +
      F.HOLD / 2,
    grips: [number, number] = [gripAt(rB, sT), gripAt(rT, sB)],
    gripsFit =
      grips[0] + F.HOLD / 2 <= top.length / 2 + 1e-9 &&
      grips[1] + F.HOLD / 2 <= bottom.length / 2 + 1e-9,
    longest = Math.max(need, formNeed),
    code =
      cord.bend === null
        ? 'no-bend'
        : stack > HAND_SPAN + 1e-9
          ? 'hand-span'
          : lift > liftLimit + 1e-9
            ? 'lift'
            : L < longest - 1e-9
              ? 'too-short'
              : null,
    shortfall =
      code === 'no-bend'
        ? `the strands of ${cord.stack.id} resisted bending round the crossing, so no wrap formed`
        : code === 'hand-span'
          ? `the crossing is ${String(m(stack))} m thick; one hand closes round at most ${String(HAND_SPAN)} m to hold it while the other routes the cord`
          : code === 'lift'
            ? `lifting the crossing to pass the cord under it takes ${String(F.newtons(lift))} N; one hand gives ${String(F.newtons(liftLimit))} N`
            : code === 'too-short'
              ? `the cord is ${String(m(L))} m; this binding needs ${String(m(longest))} m: a ${String(m(wrap))} m wrap (routed ${String(m(route))} m loose), a closure of 2 x ${String(m(formPath))} m while forming and 2 x ${String(m(closurePath))} m seated, ${String(K.PINCH)} m to pinch each end and tails of ${String(m(tailNeed))} m`
              : null;
  return {
    angle,
    beta,
    top,
    bottom,
    cord,
    sections: [sT, sB],
    sides,
    wrap,
    route,
    closureRadius,
    formRadius,
    closurePath,
    formPath,
    tailNeed,
    tails,
    formEnds,
    routeEnds,
    need,
    formNeed,
    arcRadius,
    stack,
    lift,
    liftLimit,
    grips,
    gripsFit,
    code,
    shortfall,
  };
}
/** The shortest cord any binding of this width needs whatever the pieces and material: a wrap round
 * vanishing pieces, a closure at the formation opening and a pinch at each end. Visible before costs. */
const least = (width: number) =>
  Math.PI * width +
  2 * (Math.PI * Math.max(width, (K.OPENING + width) / 2) + width) +
  2 * K.PINCH;
/** Stored measured geometry of a fit (rounded for reports; ledgers take remainders). */
function describe(f: Fit): V7Data {
  const stiff = f.code === 'no-bend',
    [sT, sB] = f.sections;
  return {
    crossingAngle: f.angle,
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
    sections: stiff
      ? null
      : [
          [m(sT.a), m(sT.b)],
          [m(sB.a), m(sB.b)],
        ],
    wrap: stiff ? null : m(f.wrap),
    route: stiff ? null : m(f.route),
    closureRadius: stiff ? null : m(f.closureRadius),
    formRadius: stiff ? null : m(f.formRadius),
    closurePath: stiff ? null : m(f.closurePath),
    formPath: stiff ? null : m(f.formPath),
    arcRadius: stiff ? null : m(f.arcRadius),
    arcs: stiff ? null : [m(sT.half), m(sB.half)],
    sides: stiff ? null : m(f.sides),
    contact: stiff
      ? null
      : [v7RoundNumber(sT.contact), v7RoundNumber(sB.contact)],
    tailNeed: m(f.tailNeed),
    tails: stiff ? null : m(f.tails),
    need: stiff ? null : m(Math.max(f.need, f.formNeed)),
    stack: m(f.stack),
    handSpan: HAND_SPAN,
    liftForce: F.newtons(f.lift),
    oneHandLimit: F.newtons(f.liftLimit),
    grips: [m(f.grips[0]), m(f.grips[1])],
    gripsFit: f.gripsFit,
    fits: f.code === null,
    shortfall: f.shortfall,
  };
}

/** Both pieces laid crossed at their midpoints at this point: dry land inside the world, clear of solids. */
function clearLayout(
  w: V7World,
  at: V7Point,
  length: number,
  diameter: number,
  angle: number,
  orientation: number,
): boolean {
  const obstacles = v7Obstacles(w);
  for (const d of [orientation, orientation + angle]) {
    const u = { x: Math.cos(rad(d)), y: Math.sin(rad(d)) },
      p = { x: at.x - (u.x * length) / 2, y: at.y - (u.y * length) / 2 },
      q = { x: at.x + (u.x * length) / 2, y: at.y + (u.y * length) / 2 };
    if (!v7SegmentClear(p, q, diameter / 2, obstacles)) return false;
    for (let i = 0; i <= 8; i++) {
      const point = {
        x: p.x + ((q.x - p.x) * i) / 8,
        y: p.y + ((q.y - p.y) * i) / 8,
      };
      if (
        !v7Inside(w, point, diameter / 2) ||
        ['~', '='].includes(openConditions(w, point).ground)
      )
        return false;
    }
  }
  return true;
}
/** Hands, footing and room for the crossing; a fixed orientation is rechecked, else the first clear one is chosen. */
function space(
  w: V7World,
  a: V7Actor,
  pieces: Piece[],
  angle: number,
  orientation: number | null,
): { blocked: string | null; orientation: number | null } {
  const length = Math.max(...pieces.map((p) => p.length)),
    diameter = Math.max(...pieces.map((p) => p.diameter)),
    crowd = F.crowded(w, a, length);
  if (crowd) return { blocked: crowd, orientation: null };
  const found =
    orientation === null
      ? (LAYOUTS.find((o) =>
          clearLayout(w, a.position, length, diameter, angle, o),
        ) ?? null)
      : clearLayout(w, a.position, length, diameter, angle, orientation)
        ? orientation
        : null;
  return found === null
    ? {
        blocked: `the ${String(length)} m pieces laid crossed at your place would reach water, leave the world or meet a solid object${orientation === null ? ' in every tried direction' : ' where they were laid'}`,
        orientation: null,
      }
    : { blocked: null, orientation: found };
}

/** Writes the cord's part of the binding; retained states take the bound role, keeping other cord operations off it. */
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
    [BIND]: {
      bindingId: null,
      workId: null,
      ...k,
      law: LAW,
      revision: REVISION,
      method: METHOD,
      part: 'cord',
      slack: num(k.slack),
      retainedCreep: num(k.retainedCreep),
      pretension: num(k.pretension),
      crossingShift: num(k.crossingShift),
      trials: trialsOf(s),
      last: k.last ?? null,
      ...data,
      state,
      priorRole: prior,
      updatedAt: w.tick,
    },
  };
}
/** The cord lies straight and free: a fresh binding starts from no slack, shift or tension. */
function freeCord(w: V7World, s: V7Stack, last: string) {
  writeCord(w, s, 'separate', {
    bindingId: null,
    workId: null,
    pieces: [],
    geometry: null,
    pose: null,
    at: null,
    slack: 0,
    pretension: 0,
    crossingShift: 0,
    last,
  });
}
function writePiece(w: V7World, s: V7Stack, data: V7Data) {
  s.processing = {
    ...(s.processing ?? {}),
    [BIND]: {
      ...recOf(s),
      law: LAW,
      revision: REVISION,
      ...data,
      updatedAt: w.tick,
    },
  };
}
/** A released piece keeps no record unless it was damaged, so it stays an ordinary branch unit. */
function freePiece(w: V7World, s: V7Stack, last: string) {
  const k = recOf(s);
  if (pieceCondition(s) < 1 || k.broken === true) {
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
  if (!s.processing?.[BIND]) return;
  const rest = Object.fromEntries(
    Object.entries(s.processing).filter(([key]) => key !== BIND),
  );
  if (Object.keys(rest).length) s.processing = rest;
  else delete s.processing;
}

/** The cord's centreline ledger in a state: wrap, closure and slack; the tails take the remainder. */
function ledger(g: V7Data, state: State, slack: number) {
  const L = num(g.centreline),
    wrap =
      state === 'bound'
        ? num(g.wrap)
        : state === 'wrapped' || state === 'tucked'
          ? num(g.route)
          : 0,
    closure =
      state === 'bound'
        ? num(g.closurePath)
        : state === 'tucked'
          ? num(g.formPath)
          : 0,
    free = L - wrap - 2 * closure - slack,
    first = wrap ? m(free / 2) : m(L);
  return {
    wrap,
    closure,
    slack: m(slack),
    tails: [first, m(free - first)],
  };
}
/** Schematic centreline in the wrap plane (m): across the bisector and up, origin at the piece contact. */
function centerline(g: V7Data, state: State, tails: number[]): V7Json {
  const [dT, dB] = numbers(g.pieceDiameters),
    L = num(g.centreline),
    w = num(g.width),
    sections = Array.isArray(g.sections) ? g.sections.map(numbers) : [],
    [aT, bT] = sections[0] ?? [0, 0],
    [aB, bB] = sections[1] ?? [0, 0],
    zT = (dT ?? 0) / 2,
    zB = -(dB ?? 0) / 2,
    pts = (list: number[][]) => list.map((p) => p.map((x) => m(x)));
  if (state === 'separate' || state === 'positioned' || !aT)
    return pts([
      [-L / 2, zB - (dB ?? 0) / 2 - w],
      [L / 2, zB - (dB ?? 0) / 2 - w],
    ]);
  const crown = zT + (bT ?? 0),
    hull = [
      [aT, zT],
      [aB ?? 0, zB],
      [0, zB - (bB ?? 0)],
      [-(aB ?? 0), zB],
      [-aT, zT],
    ];
  return state === 'wrapped'
    ? pts([
        [-(tails[0] ?? 0), crown + w],
        [0, crown],
        ...hull,
        [0, crown],
        [tails[1] ?? 0, crown + w],
      ])
    : pts([
        [-(tails[0] ?? 0), crown + 2 * w],
        [0, crown + w],
        [0, crown],
        ...hull,
        [0, crown],
        [0, crown + w],
        [tails[1] ?? 0, crown + 2 * w],
      ]);
}

const label = (cord: V7Stack | undefined) => {
  if (!cord) return 'separate';
  const state = stateOf(cord),
    k = recOf(cord),
    last = str(k.last),
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
    book = ledger(g, state, num(k.slack)),
    trial = cord ? trialsOf(cord).at(-1) : undefined;
  return {
    component: 'crossing-binding',
    reuses: ['fiber-cord', 'cord-knot'],
    provenance:
      'cord drawn from long-fiber-cord.ts FIBER_CORD.view (fiber-cord, fragment); closure bend limits from long-cord-knot.ts CORD_KNOT; crossing geometry from crossing-contact@1',
    law: LAW,
    method: METHOD,
    bindingId,
    workId: str(k.workId),
    state,
    status: label(cord),
    // A completed appearance needs the routed wrap, the tucked closure and the passed release check.
    completedAppearance: state === 'bound',
    schematic: true,
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
            condition: v7RoundNumber(pieceCondition(s)),
            broken: recOf(s).broken === true,
          }
        : null,
    ),
    cord: cord
      ? {
          item: cord.id,
          width: num(g.width) || m(2 * Number(F.part(cord).plyDiameter)),
          centreline: Number(F.part(cord).overall),
          wrap: book.wrap,
          closurePerEnd: book.closure,
          slack: book.slack,
          tails: book.tails,
          crossings: CROSSINGS[state],
          centerline: g.width ? centerline(g, state, book.tails) : null,
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
        ? num(k.pretension) > 0
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
const stageName = (j: CollectiveWork, n: number) =>
  (j.mode === 'untie' ? UNTIE[n] : TIE[n]) ?? null;
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
/** The three items of a binding, found on the items themselves. */
function members(w: V7World, bindingId: string): Parts {
  const list = w.stacks.filter((s) => recOf(s).bindingId === bindingId),
    find = (part: Part) => list.find((s) => recOf(s).part === part);
  return { top: find('top'), bottom: find('bottom'), cord: find('cord') };
}
/** A retained binding of the actor's own three items, bound by the relation and not by work. */
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
      'bindingId must be the exact id of a binding of your own two pieces and cord, all in your possession; nothing was spent.',
    );
  if (free && list.some((s) => s.reservedFor !== id))
    throw new Error(
      'This binding is held by unfinished work; nothing was spent.',
    );
  return { ...parts, id };
}
/** Bounded verified finding keyed by the functional observation, not by the ability name. */
function remember(
  c: V7ActionContext,
  kind: string,
  cord: V7Stack,
  pieces: V7Stack[],
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
    key: `${kind}:${cord.resource}-${String(width)}mm:${pieces[0]?.resource ?? 'piece'}-${sizes.join('-')}mm:${outcome}`,
    subject: cord.resource,
    property: `${kind} of a ${String(width)} mm two-ply cord round a crossing of ${sizes.join(' mm and ')} mm pieces`,
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

/** A hand-held stage relaxes when hands leave it; returns what relaxed, or null. */
function relax(w: V7World, j: CollectiveWork, moved: boolean): string | null {
  const reached = num(j.reached),
    { cord } = held(w, j);
  if (j.mode !== 'attempt' || reached === 0 || reached >= 3) return null;
  if (reached === 1 && !moved) return null;
  j.reached = moved ? 0 : 1;
  j.remainingWork = TIE.length - num(j.reached);
  if (cord)
    writeCord(w, cord, moved ? 'separate' : 'positioned', {
      bindingId: null,
      workId: j.id,
      last: reached === 2 ? 'wrap-fell-loose' : 'layout-moved',
    });
  if (moved) j.pose = null;
  return reached === 2
    ? moved
      ? 'The hand-held wrap fell loose and the crossed pieces were carried from where they were laid, so positioning and routing must be redone.'
      : 'The hand-held wrap fell loose off the crossing; the crossed pieces still lie where they were laid, so routing must be redone.'
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
    retained = j.mode === 'attempt' ? reached >= 3 : reached === 0,
    handHeld = j.mode === 'attempt' ? reached === 2 : reached === 1,
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
              ? 'untied-wrap-fell-open'
              : 'released-wrap-fell-loose'
            : (str(recOf(s).last) ?? 'released'),
        );
    } else freePiece(w, s, 'released');
  }
  return {
    parts,
    retained,
    relaxed: handHeld
      ? j.mode === 'untie'
        ? 'Released without hands, the unclosed wrap fell open: both pieces and the cord are free.'
        : 'Released without hands, the routed wrap fell loose: both pieces and the cord are free.'
      : null,
  };
}
function relaxedEvent(emit: Emit, w: V7World, j: CollectiveWork, note: string) {
  emit(
    'crossing-binding-relaxed',
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
  if (j.mode === 'untie' && num(j.reached) === 1) return stop(c, j, reason);
  const note = relax(c.world, j, false);
  j.status = 'paused';
  j.reason = reason;
  c.emit(
    'crossing-binding-paused',
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
    'crossing-binding-stopped',
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
    if (s.processing?.[BIND]) recOf(s).workId = null;
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
    type,
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
  f: Fit,
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
    'crossing-wrap-fit',
    f.cord.stack,
    [f.top.stack, f.bottom.stack],
    `shortfall-${code}`,
    { workId: j.id, stage, problem, crossingAngle: f.angle, measured },
    `${String(j.completedWork)} paid round(s) of bare-hand positioning, measuring and routing`,
  );
  c.emit(
    'crossing-binding-shortfall',
    `Measured at ${stage}: ${problem}. No binding was completed; the items are released as they actually are${retained ? ' (the tucked closure still holds them loosely)' : ''} and nothing is refunded.`,
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

/** Shared data of the cord at a stage, from the work's measured fit; only a closure makes it a relation. */
function relation(
  j: CollectiveWork,
  f: Fit,
  closed: boolean,
  extra: V7Data = {},
): V7Data {
  return {
    bindingId: closed ? str(j.binding) : null,
    workId: j.id,
    pieces: strings(j.pieces),
    geometry: describe(f),
    pose: v7Json(j.pose ?? null),
    ...extra,
  };
}
/** Slip load of the closure: each end turns half round the other like cord-bend@1's crown, nipped on
 * two faces; null when self-locking, undefined when no cord friction law applies. */
function closureSlip(
  cord: V7Stack,
  width: number,
  radius: number,
): number | null | undefined {
  const mu = B.friction(cord, cord);
  if (mu === null) return undefined;
  return (
    B.retention(mu, {
      support: width,
      bightRadius: radius,
      wrapRadius: radius,
    }).slip[0] ?? null
  );
}

/** The closure slip load on the live cord: its current width and seated radius max(bend limit, width). */
function liveSlip(w: V7World, cord: V7Stack): number | null | undefined {
  const mc = measureCord(w, cord);
  if (!mc || mc.bend === null) return undefined;
  return closureSlip(cord, mc.width, Math.max(mc.bend, mc.width));
}

/** One paid attempt stage on the re-read items: measure and position, route, form and tuck, dress and check. */
function tie(
  c: V7ActionContext,
  j: CollectiveWork,
  parts: Parts,
  orientation: number | null,
): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    n = num(j.reached),
    stage = TIE[n] ?? '',
    { top, bottom, cord } = parts,
    pt = top ? measurePiece(w, top) : null,
    pb = bottom ? measurePiece(w, bottom) : null,
    mc = cord ? measureCord(w, cord) : null,
    before = view(w, parts, str(j.binding));
  j.lastStage = stage;
  if (!top || !bottom || !cord || !pt || !pb || !mc)
    return stop(c, j, 'A piece or the cord has no measurable geometry.');
  const f = fit(a, pt, pb, mc, num(j.angle));
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
    j.remainingWork = TIE.length - 1;
    writeCord(w, cord, 'positioned', relation(j, f, false, { last: null }));
    remember(
      c,
      'crossing-wrap-fit',
      cord,
      [top, bottom],
      'fits',
      { workId: j.id, crossingAngle: f.angle, measured: describe(f) },
      'a paid bare-hand positioning and measuring round',
    );
    return progress(
      c,
      j,
      'crossing-binding-stage',
      stage,
      before,
      { measured: describe(f) },
      `the pieces lie crossed at ${String(f.angle)} degrees (${top.id} on top), ${String(m(pt.diameter))} and ${String(m(pb.diameter))} m thick; the cord's ${String(m(mc.overall))} m covers the ${String(m(Math.max(f.need, f.formNeed)))} m this binding needs. Nothing is bound yet.`,
    );
  }
  if (n < 3 && f.code)
    return infeasible(
      c,
      j,
      f,
      stage,
      'geometry-changed',
      f.shortfall ?? '',
      before,
    );
  if (n === 1) {
    if (f.routeEnds < K.PINCH - 1e-9)
      return infeasible(
        c,
        j,
        f,
        stage,
        'end-too-short',
        `the routed wrap leaves ${String(m(Math.max(0, f.routeEnds)))} m at each end; holding an end needs ${String(K.PINCH)} m`,
        before,
      );
    writeCord(w, cord, 'wrapped', relation(j, f, false));
    j.reached = 2;
    j.remainingWork = TIE.length - 2;
    return progress(
      c,
      j,
      'crossing-binding-wrap-routed',
      stage,
      before,
      {
        lift: F.newtons(f.lift),
        passingOpening: K.OPENING,
        routedWrap: m(f.route),
        endsBeyondWrap: m(f.routeEnds),
      },
      `one hand lifted the crossing and the other passed the cord over ${top.id} and under ${bottom.id}: a ${String(m(f.route))} m wrap held by hand, with ${String(m(f.routeEnds))} m at each end. It is no binding.`,
    );
  }
  if (n === 2) {
    if (f.formEnds < K.PINCH - 1e-9)
      return infeasible(
        c,
        j,
        f,
        stage,
        'end-too-short',
        `forming the closure leaves ${String(m(Math.max(0, f.formEnds)))} m beyond it; pinching an end needs ${String(K.PINCH)} m`,
        before,
      );
    const id = str(j.binding) ?? '';
    writeCord(
      w,
      cord,
      'tucked',
      relation(j, f, true, { at: { ...a.position } }),
    );
    for (const [s, part, partner] of [
      [top, 'top', bottom],
      [bottom, 'bottom', top],
    ] as const)
      writePiece(w, s, {
        state: 'tucked',
        bindingId: id,
        workId: j.id,
        part,
        partner: partner.id,
        cord: cord.id,
        length: part === 'top' ? pt.length : pb.length,
        diameter: m(part === 'top' ? pt.diameter : pb.diameter),
        condition: v7RoundNumber(part === 'top' ? pt.condition : pb.condition),
      });
    j.reached = 3;
    j.remainingWork = TIE.length - 3;
    return progress(
      c,
      j,
      'crossing-binding-closure-tucked',
      stage,
      before,
      {
        formRadius: m(f.formRadius),
        closurePerEnd: m(f.formPath),
        endsBeyondClosure: m(f.formEnds),
      },
      `both ends crossed over the top piece and one was tucked half round the other at ${String(m(f.formRadius))} m: a loose closure that holds without hands, not yet dressed or checked.`,
    );
  }
  // Dressing seats the closure at its limit and the wrap on the hull; the slack goes evenly into both tails.
  const slip = closureSlip(cord, mc.width, f.closureRadius),
    short = f.tails < f.tailNeed - 1e-9,
    slips = slip === undefined || (slip !== null && slip <= B.DRESS),
    ok = !short && !slips,
    value = {
      wrap: m(f.wrap),
      closureRadius: m(f.closureRadius),
      closurePerEnd: m(f.closurePath),
      tails: [m(f.tails), m(f.tails)],
      tailNeeded: m(f.tailNeed),
      contactAngles: f.sections.map((s) => v7RoundNumber(s.contact)),
      closureContactAngle: v7RoundNumber(
        Math.PI * Math.min(1, mc.width / f.closureRadius),
      ),
      dressingPull: B.DRESS,
      closureSlipLoad:
        slip === null || slip === undefined ? null : F.newtons(slip),
      selfLocking: slip === null,
      wrapTension: ok ? B.DRESS : 0,
      gripsFit: f.gripsFit,
    };
  if (ok)
    writeCord(
      w,
      cord,
      'bound',
      relation(j, f, true, {
        workId: null,
        at: { ...a.position },
        pretension: B.DRESS,
        slack: 0,
        last: 'release-held',
        boundAt: w.tick,
      }),
    );
  else {
    freeCord(
      w,
      cord,
      short ? 'released-tail-slipped-out' : 'released-closure-slipped',
    );
    for (const s of [top, bottom]) freePiece(w, s, 'released-loosened');
  }
  remember(
    c,
    'crossing-wrap-fit',
    cord,
    [top, bottom],
    ok ? 'release-held' : 'release-loosened',
    { workId: j.id, crossingAngle: f.angle, ...value },
    'four paid rounds of bare-hand positioning, wrapping, closing, dressing and a release check',
  );
  j.reached = TIE.length;
  const data: V7Data = {
    ...summary(w, j),
    round: j.completedWork,
    operation: stage,
    stageStarted: true,
    stageCompleted: true,
    outcome: ok ? 'release-held' : 'release-loosened',
    before,
    ...value,
  };
  const done = finish(c, j, parts, ok);
  data.status = j.status;
  data.nextStage = null;
  data.after = view(w, parts, ok ? str(j.binding) : null);
  data.visual = data.after;
  c.emit(
    ok ? 'crossing-binding-release-held' : 'crossing-binding-release-loosened',
    ok
      ? `Dressed and released: the closed wrap holds ${top.id} and ${bottom.id} where they cross, with ${String(value.wrap)} m round the crossing, 2 x ${String(value.closurePerEnd)} m in the closure and tails of ${String(m(f.tails))} m. Its load behavior is untested; it is no rated lashing and gives no shelter.${f.gripsFit ? '' : ' No hand test is possible: a piece is too short for a grip clear of the crossing.'}`
      : `Released after dressing: ${short ? 'a tail was shorter than the closure needs and slipped out' : `the closure did not keep the ${String(B.DRESS)} N dressing pull`}, so the wrap opened and both pieces and the cord are free.`,
    data,
    str(j.binding) ?? j.id,
  );
  return done;
}

/** One paid untie stage: withdraw the closure end, then open and remove the wrap. */
function untie(
  c: V7ActionContext,
  j: CollectiveWork,
  parts: Parts,
): V7HandlerResult {
  const w = c.world,
    n = num(j.reached),
    stage = UNTIE[n] ?? '',
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
        'crossing-untie',
        cord,
        [top, bottom],
        jammed ? 'jammed' : 'damaged',
        { bindingId: str(j.binding), problem, condition: cond },
        'a paid bare-hand untying round',
      );
      c.emit(
        'crossing-binding-resisted',
        `The closure resisted untying: ${problem}. The binding stays as it is; nothing is refunded.`,
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
    writeCord(w, cord, 'wrapped', { workId: j.id, last: 'closure-withdrawn' });
    for (const s of [top, bottom])
      writePiece(w, s, { state: 'wrapped', workId: j.id });
    j.reached = 1;
    j.remainingWork = UNTIE.length - 1;
    return progress(
      c,
      j,
      'crossing-binding-stage',
      stage,
      before,
      {},
      'the tucked end was drawn back out of the closure; the open wrap is held round the crossing by hand.',
    );
  }
  freeCord(w, cord, 'untied');
  for (const s of [top, bottom]) freePiece(w, s, 'untied');
  remember(
    c,
    'crossing-untie',
    cord,
    [top, bottom],
    'untied',
    { bindingId: str(j.binding), condition: cond },
    'two paid bare-hand untying rounds',
  );
  j.reached = UNTIE.length;
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
    'crossing-binding-untied',
    'Untied: the closure was withdrawn and the wrap removed; both pieces and the same cord are free, and any set from bending or creep is not undone.',
    data,
    str(j.binding) ?? j.id,
  );
  return done;
}

/** One paid round after rechecking the reserved items, hands, footing, room, layout and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const w = c.world,
    a = c.actor;
  if (!open(j)) throw new Error('This binding work is already settled.');
  const parts = held(w, j),
    list = listOf(parts);
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
    laid = j.mode === 'attempt' && (reached === 1 || reached === 2),
    moved =
      laid &&
      Math.hypot(a.position.x - num(pose.x), a.position.y - num(pose.y)) > 1e-6;
  // A laid-out crossing stays only where it was laid; moving relays it at the next paid round.
  const relaxed = moved ? relax(w, j, true) : null;
  if (relaxed) relaxedEvent(emitter(c), w, j, relaxed);
  const fixed =
      j.mode === 'attempt' && num(j.reached) >= 1 && num(j.reached) <= 2
        ? num(record(j.pose).orientation)
        : null,
    lay = space(w, a, pieces, num(j.angle), fixed);
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
      'crossing-binding-resumed',
      'Unfinished binding work resumed after rechecking the pieces, the cord, hands, footing, room and energy.',
      summary(w, j),
      str(j.binding) ?? j.id,
    );
  return j.mode === 'untie'
    ? untie(c, j, parts)
    : tie(c, j, parts, lay.orientation);
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
  const hold = (s: V7Stack) => {
    s.reservedFor = j.id;
    j.escrow.push(s.id);
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
    if (s.processing?.[BIND]) recOf(s).workId = j.id;
  };
  for (const id of ids) {
    // Members of a loose binding are taken over from it in place; free pieces must be unreserved.
    const s = w.stacks.find(
      (x) => x.id === id && (x.reservedFor ?? null) === bound,
    );
    if (!s) throw new Error('Missing validated piece.');
    if (bound !== null || foodTenths(s.quantity) === 10) {
      hold(s);
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
    hold(part);
    pieces.push(part.id);
    split.push({ from: s.id, item: part.id, quantity: 1 });
  }
  hold(cord);
  j.pieces = pieces;
  j.cord = cord.id;
  j.split = split;
}
function guard(c: V7ActionContext, pieces: Piece[], angle: number) {
  const lay = space(c.world, c.actor, pieces, angle, null);
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
    if (!RIGID[s.resource] || !F.material(c.world, s.resource))
      throw new Error(
        `Unsupported material: no rigid-piece law exists for ${s.resource}, so its section, contact and bending are not represented; nothing was spent.`,
      );
    if (s.reservedFor)
      throw new Error(`${s.id} is reserved by other work; nothing was spent.`);
    const k = recOf(s),
      other = Object.keys(s.processing ?? {}).filter((x) => x !== BIND);
    if (TREATED.some((x) => s[x] !== undefined) || other.length)
      throw new Error(
        `${s.id} is treated, recovered or processed material; only untreated loose pieces have a represented piece geometry in this version. Nothing was spent.`,
      );
    if (k.broken === true || pieceCondition(s) < F.SOUND)
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
      'cordId must be the exact id of your own finished cord or cord fragment from hand-twist-fiber-cord; nothing was spent.',
    );
  if (loose !== null) return s;
  if (role === 'bound')
    throw new Error(
      `${s.id} already closes a binding; untie it first. Nothing was spent.`,
    );
  const joined = record(s.processing?.[B.JOIN]).state;
  if (role === 'joined' || (joined !== undefined && joined !== 'straight'))
    throw new Error(
      `${s.id} is part of a join; untie it first. Routing a wrap through a join is not supported in this version. Nothing was spent.`,
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
  if (B.FRICTION[s.resource] === undefined || BARK[s.resource] === undefined)
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
  return s;
}

function attempt(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor;
  if (current(w, a))
    throw new Error(
      'Unfinished binding work exists; resume it with its mode and workId, or cancel it. Nothing was spent.',
    );
  if (c.action.args.workId !== undefined)
    throw new Error(
      'No unfinished binding work of yours has this workId; nothing was spent.',
    );
  // A loose tucked binding of exactly these items needs only its dressing round.
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
    relationAngle = loose
      ? num(record(recOf(cord).geometry).crossingAngle)
      : null,
    angle =
      c.action.args.crossingAngle === undefined && relationAngle !== null
        ? relationAngle
        : v7Number(
            c.action.args.crossingAngle,
            'crossingAngle',
            ANGLE.min,
            ANGLE.max,
          );
  if (relationAngle !== null && Math.abs(angle - relationAngle) > 1e-9)
    throw new Error(
      `This loose binding crosses at ${String(relationAngle)} degrees; dress it as it is or untie it. Nothing was spent.`,
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
  const mc = measureCord(w, cord);
  if (!mc)
    throw new Error('The cord has no measurable geometry; nothing was spent.');
  if (!loose && mc.overall < least(mc.width) - 1e-9)
    throw new Error(
      `The cord is ${String(m(mc.overall))} m; whatever the pieces, a wrap and closure in a cord ${String(m(mc.width))} m wide need at least ${String(m(least(mc.width)))} m. Nothing was spent.`,
    );
  guard(c, pieces, angle);
  const offset = loose ? 3 : 0,
    j = workCreate(c, 'attempt', TIE.length - offset);
  j.law = LAW;
  j.method = METHOD;
  j.binding = loose ?? v7Id(w, 'binding');
  j.target = j.binding;
  j.angle = angle;
  j.reached = offset;
  j.offset = offset;
  j.pose = loose ? v7Json(record(recOf(cord).pose)) : null;
  j.fit = loose ? v7Json(record(recOf(cord).geometry)) : null;
  j.lastStage = null;
  reserve(c, j, ids, cord, loose);
  c.emit(
    'crossing-binding-started',
    `Two pieces and the cord are reserved and held for a bare-hand crossing binding${offset ? ' (dressing only: the loose closure is already tucked)' : ''}; no tool, anchor, added cord or second person is used.`,
    { ...summary(w, j), stageStarted: TIE[offset] ?? null },
    j.binding,
  );
  return advance(c, j);
}

function startUntie(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor;
  if (current(w, a))
    throw new Error(
      'Unfinished binding work exists; resume it with its mode and workId, or cancel it. Nothing was spent.',
    );
  if (c.action.args.workId !== undefined)
    throw new Error(
      'No unfinished binding work of yours has this workId; nothing was spent.',
    );
  const b = ownBinding(c),
    cord = b.cord as V7Stack,
    tails = ledger(
      record(recOf(cord).geometry),
      stateOf(cord),
      num(recOf(cord).slack),
    ).tails;
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
  guard(c, pieces, num(record(recOf(cord).geometry).crossingAngle));
  const j = workCreate(c, 'untie', UNTIE.length);
  j.law = LAW;
  j.method = METHOD;
  j.binding = b.id;
  j.target = b.id;
  j.angle = num(record(recOf(cord).geometry).crossingAngle);
  j.reached = 0;
  j.pose = v7Json(record(recOf(cord).pose));
  j.fit = v7Json(record(recOf(cord).geometry));
  j.lastStage = null;
  j.pieces = [b.top?.id ?? '', b.bottom?.id ?? ''];
  j.cord = cord.id;
  j.split = [];
  for (const s of listOf(b)) {
    s.reservedFor = j.id;
    j.escrow.push(s.id);
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
    recOf(s).workId = j.id;
  }
  c.emit(
    'crossing-binding-started',
    'The bound pieces and cord are reserved and held for untying with bare hands.',
    { ...summary(w, j), stageStarted: UNTIE[0] ?? null },
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
      'No binding work of yours has this workId; nothing was spent.',
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
    g = record(k.geometry),
    trials = trialsOf(cord),
    book = ledger(g, state, num(k.slack)),
    value: V7Data = {
      ...(j ? summary(w, j) : {}),
      bindingId: id,
      binding: view(w, parts, bound ? id : null),
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
      ledger: {
        centreline: Number(F.part(cord).overall),
        wrap: book.wrap,
        closurePerEnd: book.closure,
        slack: book.slack,
        tails: book.tails,
        retainedCreep: num(k.retainedCreep),
      },
      displacement: m(num(k.crossingShift)),
      visibleRetention:
        state === 'bound'
          ? num(k.pretension) > 0
            ? 'snug round the crossing'
            : 'slack round the crossing'
          : state === 'tucked'
            ? 'loose closure, not dressed'
            : 'not closed',
      bindingTrials: trials,
      lastBindingTrial: trials.at(-1) ?? null,
      holdingForce: null,
      unknown:
        'holding force, slip load, safe load and behavior under other loads are not determined by inspection',
    };
  openRemember(c, {
    key: `${id ?? j?.id ?? ''}:crossing-binding-geometry`,
    subject: id ?? j?.id ?? '',
    property:
      'binding state, crossing, wrap, closure, tails, slack, displacement, condition and recorded tests',
    value: v7Json(value),
    method: 'direct inspection',
    condition: 'visible and measurable features only; no load is applied',
    verified: false,
  });
  c.emit(
    'crossing-binding-inspected',
    'Only visible routing, closure, tails, slack, displacement, damage and recorded tests are reported; no load was applied and nothing was changed or repaired.',
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
      [BIND]: {
        law: LAW,
        revision: REVISION,
        method: METHOD,
        part: 'cord',
        state: 'separate',
        bindingId: null,
        workId: null,
        pieces: [],
        geometry: null,
        pose: null,
        at: null,
        slack: 0,
        retainedCreep: 0,
        pretension: 0,
        crossingShift: 0,
        trials,
        last: 'broke-in-binding',
        fragmentOf: s.id,
        fragments: ids,
        brokenAt: point,
        priorRole: 'fragment',
        updatedAt: w.tick,
      },
    };
    // A later knot or join of a fragment must restore the fragment role, not the parent's.
    for (const key of [K.KNOT, B.JOIN])
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
/** Where the cord parts, measured along it from its first end: at the tightest arc of the wrap,
 * the side of the top section, half way round the top arc from the closure. */
const breakPoint = (g: V7Data, tails: number[]) =>
  (tails[0] ?? 0) + num(g.closurePath) + (numbers(g.arcs)[0] ?? 0) / 2;

/** The binding's cord as loaded in the wrap: breaking force at the tightest arc and stiffness. */
function cordLoad(w: V7World, cord: V7Stack) {
  const r = F.material(w, cord.resource),
    law = F.STRANDS[cord.resource],
    g = record(recOf(cord).geometry);
  if (!r || !law) return null;
  const p = F.part(cord),
    d = Number(p.plyDiameter),
    area = (Math.PI * d * d) / 4,
    width = num(g.width),
    arc = Math.max(1e-9, Math.min(num(g.arcRadius), num(g.closureRadius))),
    // The curvature rule of cord-knot@1: outer strands on an arc follow (R + w/2)/R.
    concentration = 1 + width / (2 * arc);
  return {
    r,
    law,
    p,
    d,
    concentration,
    strength: F.breaking(r, law, area, F.conditionOf(cord)) / concentration,
    stiffness: law.modulus * F.weakening(law, r) * F.EFFICIENCY * 2 * area,
    wrap: num(g.wrap),
  };
}
/** fiber-cord@1's retained creep lengthens the cord at constant volume; in a closed wrap it is slack
 * that lowers the wrap tension by stiffness x slack / wrap. Returns the added length (m). */
function creepInto(
  cord: V7Stack,
  load: NonNullable<ReturnType<typeof cordLoad>>,
  creep: number,
): number {
  const p = load.p,
    k = recOf(cord),
    length = Number(p.length),
    overall = Number(p.overall),
    stretched = m(length + creep);
  if (!(stretched > length)) return 0;
  const grown = m(overall + stretched - length),
    added = m(grown - overall);
  p.length = stretched;
  p.twisted = stretched;
  p.overall = grown;
  p.plyDiameter = load.d * Math.sqrt(length / stretched);
  k.slack = m(num(k.slack) + added);
  k.retainedCreep = m(num(k.retainedCreep) + added);
  k.geometry = { ...record(k.geometry), centreline: grown };
  k.pretension = v7RoundNumber(
    Math.max(
      0,
      num(k.pretension) - (load.stiffness * added) / Math.max(1e-9, load.wrap),
    ),
  );
  return added;
}
/** The binding came apart: the cord lies straight and both pieces are free. */
function separate(w: V7World, parts: Parts, last: string) {
  for (const s of listOf(parts)) {
    delete s.reservedFor;
    if (s === parts.cord) freeCord(w, s, last);
    else freePiece(w, s, last);
  }
}
/** Slack from creep leaves a closed but loose wrap. */
function slacken(w: V7World, cord: V7Stack) {
  writeCord(w, cord, 'tucked', { last: 'loosened-by-creep', pretension: 0 });
}

/** A bounded two-hand test, one hand on each piece clear of the crossing (crossing-contact@1, part 4). */
function trial(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    b = ownBinding(c),
    { top, bottom } = b,
    cord = b.cord as V7Stack;
  if (stateOf(cord) !== 'bound' || !top || !bottom)
    throw new Error(
      'bindingId must name your own dressed, release-checked binding; a loose closure is dressed with attempt first. Nothing was spent.',
    );
  const direction = v7String(c.action.args.trialDirection, 'trialDirection');
  if (!DIRECTIONS.includes(direction))
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
    grips = numbers(g.grips);
  if (g.gripsFit !== true)
    throw new Error(
      'A piece is too short for a 0.05 m hand grip clear of the crossing; no opposed hand pair is possible. Nothing was spent.',
    );
  if (foodTenths(cord.quantity) < 2)
    throw new Error(
      'A test needs a cord of at least 0.2 units so that a break leaves two inventory lots; nothing was spent.',
    );
  const pt = measurePiece(w, top),
    pb = measurePiece(w, bottom),
    load = cordLoad(w, cord),
    mu = BARK[cord.resource],
    slip = liveSlip(w, cord);
  if (!pt || !pb || !load || mu === undefined || slip === undefined)
    throw new Error(
      'Unsupported material: no piece, strand or friction law applies; nothing was spent.',
    );
  const lay = space(w, a, [pt, pb], num(g.crossingAngle), null);
  if (lay.blocked)
    throw new Error(`No room to work: ${lay.blocked}. Nothing was spent.`);
  v7Spend(a, TRIAL);
  const before = view(w, b, b.id),
    tension0 = num(k.pretension),
    contactTop = numbers(g.contact)[0] ?? 0,
    pieces = [pt, pb],
    hand = (F.HAND_PULL * Math.max(0, Math.min(100, a.vitals.health))) / 100,
    grip = F.GRIP * Math.min(pt.diameter, pb.diameter),
    limit = Math.min(force, hand, grip),
    // Applied force at which each failure starts.
    loads: { kind: string; load: number; piece?: number }[] = [];
  if (direction === 'separate') {
    // The wrap's tension clamps the pieces with 2 T; beyond that each side of the wrap carries half the pull.
    if (slip !== null)
      loads.push({
        kind: 'closure-slipped',
        load: slip > tension0 ? 2 * slip : 0,
      });
    loads.push({
      kind: 'cord-broke',
      load: load.strength > tension0 ? 2 * load.strength : 0,
    });
  } else {
    // Drawn along the top piece, the wrap slides on it: friction x tension x its contact angle there.
    loads.push({ kind: 'crossing-slipped', load: mu * tension0 * contactTop });
    if (slip !== null && slip <= tension0)
      loads.push({ kind: 'closure-slipped', load: 0 });
    if (load.strength <= tension0) loads.push({ kind: 'cord-broke', load: 0 });
  }
  pieces.forEach((p, i) =>
    loads.push({
      kind: 'piece-broke',
      piece: i,
      load:
        (bendingStrength(p) * Math.PI * p.diameter ** 3) /
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
    tension =
      direction === 'separate' ? Math.max(tension0, achieved / 2) : tension0,
    ratio = Math.min(1, tension / Math.max(1e-12, load.strength)),
    damage = outcome === 'cord-broke' ? 0 : Math.max(0, ratio - F.ONSET),
    cond = F.conditionOf(cord),
    after = v7RoundNumber(cond * (1 - damage)),
    bending = pieces.map((p, i) => {
      const moment = achieved * (grips[i] ?? 0),
        stress = (32 * moment) / (Math.PI * p.diameter ** 3),
        share = Math.min(1, stress / Math.max(1e-12, bendingStrength(p))),
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
    creep =
      outcome === 'held'
        ? load.law.creep *
          F.wetness(load.r) *
          ratio *
          (seconds / F.ROUND_SECONDS) *
          load.wrap
        : 0,
    gap =
      direction === 'separate'
        ? (Math.max(0, achieved / 2 - tension0) * load.wrap) /
          load.stiffness /
          2
        : 0,
    result = {
      tick: w.tick,
      actor: a.id,
      bindingId: b.id,
      items: [top.id, bottom.id, cord.id],
      law: LAW,
      reuses: `${F.LAW} grip, hand, breaking, stiffness and creep rules; cord-knot@1 curvature rule; cord-bend@1 closure friction`,
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
      wrapTensionBefore: F.newtons(tension0),
      wrapTension: F.newtons(tension),
      clampingForce:
        direction === 'separate'
          ? F.newtons(Math.max(0, 2 * tension0 - achieved))
          : F.newtons(2 * tension0),
      crossingSlipLoad:
        direction === 'slide' ? F.newtons(mu * tension0 * contactTop) : null,
      closureSlipLoad: slip === null ? null : F.newtons(slip),
      crossingDisplacement:
        outcome === 'crossing-slipped' ? m(num(g.width)) : 0,
      separationGap: m(gap),
      elasticExtension: m((tension * load.wrap) / load.stiffness),
      retainedDeformation: m(creep),
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
    const tails = ledger(g, 'bound', num(k.slack)).tails;
    outputs.push(
      ...fragmentCord(w, a.position, cord, breakPoint(g, tails), after, trials),
    );
    w.stacks = w.stacks.filter((s) => s !== cord);
    w.stacks.push(...outputs);
    separate(w, { top, bottom }, 'broke-cord-parted');
  } else if (outcome === 'closure-slipped')
    separate(w, b, 'slipped-closure-under-load');
  else if (outcome === 'piece-broke') separate(w, b, 'broke-piece-cracked');
  else {
    if (outcome === 'crossing-slipped')
      k.crossingShift = m(num(k.crossingShift) + num(g.width));
    if (creepInto(cord, load, creep) > 0 && num(recOf(cord).pretension) <= 0) {
      slacken(w, cord);
      loosened = true;
    }
  }
  remember(
    c,
    `crossing-hand-load-${direction}`,
    outputs[0] ?? cord,
    [top, bottom],
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
    'crossing-binding-trial',
    outcome === 'held'
      ? `The binding held ${String(result.achievedForce)} N (${direction}) for ${String(seconds)} s between both hands. A pass means only this arrangement, force and time, not a safe load.`
      : outcome === 'grip-lost'
        ? `A hand slipped on its piece at ${String(result.achievedForce)} N; the test stopped.`
        : outcome === 'crossing-slipped'
          ? `The crossing slipped at ${String(result.achievedForce)} N: the wrap slid along the top piece with the bottom piece; the test stopped and the binding stays closed.`
          : outcome === 'closure-slipped'
            ? `The closure slipped at ${String(result.achievedForce)} N; the wrap opened and both pieces and the cord are free.`
            : outcome === 'cord-broke'
              ? `The cord parted in the wrap at ${String(result.achievedForce)} N into two owned fragments of the same fiber; the pieces are free.`
              : `A piece cracked at ${String(result.achievedForce)} N; the binding came apart and the damaged piece is kept.`,
    data,
    b.id,
  );
  const extra: Record<string, [string, string] | undefined> = {
    'grip-lost': [
      'crossing-binding-grip-slipped',
      'A hand slipped on its piece; nothing moved at the crossing.',
    ],
    'crossing-slipped': [
      'crossing-binding-crossing-slipped',
      'The pieces moved relative to each other at the crossing by about one cord width before the hands stopped.',
    ],
    'closure-slipped': [
      'crossing-binding-closure-slipped',
      'The closure slipped under the load; the binding came apart and all three items are conserved.',
    ],
    'cord-broke': [
      'crossing-binding-broken',
      'Broken in the wrap: two owned fragments keep all of the cord; both pieces are free and nothing vanished.',
    ],
    'piece-broke': [
      'crossing-binding-broken',
      'A piece cracked at the crossing; it is kept as damaged material and nothing vanished.',
    ],
  };
  const more = extra[outcome];
  if (more) c.emit(more[0], more[1], data, b.id);
  if (
    outcome !== 'cord-broke' &&
    (damage > 0 || bending.some((p) => p.damage > 0 && p.damage < 1))
  )
    c.emit(
      'crossing-binding-damaged',
      'Some fibres broke under the load.',
      data,
      b.id,
    );
  if (loosened)
    c.emit(
      'crossing-binding-loosened',
      'Creep left slack in the wrap: the closure still holds it, but the binding is loose.',
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
      'No unfinished binding work of yours to cancel; nothing was spent.',
    );
  const { relaxed, retained } = release(
    w,
    c.actor,
    j,
    'Cancelled; the pieces and cord are released once as they actually are. Paid energy is not refunded.',
    false,
  );
  c.emit(
    'crossing-binding-cancelled',
    retained
      ? 'Binding work cancelled: the closure keeps the three items together as they are; nothing is refunded or untied.'
      : 'Binding work cancelled: nothing held the items together, so both pieces and the cord are free; nothing is refunded.',
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
  if (!ARGS[mode]) throw new Error('Unknown binding mode.');
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
    throw new Error('The bound binding work is already settled.');
  relevant(c, mode);
  if (mode === 'attempt') return attempt(c);
  if (mode === 'untie') return startUntie(c);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'trial') return trial(c);
  return cancel(c);
}

/** A retained binding between rounds: its own wrap tension always loads the cord; a carried one also
 * hangs its bottom piece in the wrap while the carrier holds the top piece. */
function resolve(w: V7World, cord: V7Stack, carrier: V7Actor | null) {
  const k = recOf(cord),
    id = str(k.bindingId) ?? '',
    parts = members(w, id),
    load = cordLoad(w, cord),
    pb = parts.bottom ? measurePiece(w, parts.bottom) : null,
    g = record(k.geometry),
    at = carrier ? carrier.position : cord.position,
    say: Emit = (type, description, data, target) => {
      forestEvent(w, type, description, at, carrier?.id ?? null, data, target);
    };
  if (carrier) {
    k.at = { ...carrier.position };
    for (const s of listOf(parts)) s.position = { ...carrier.position };
  }
  if (!load || !pb) return;
  const hanging = carrier ? pb.mass * GRAVITY : 0,
    tension0 = num(k.pretension),
    tension = Math.max(tension0, hanging / 2),
    slip = liveSlip(w, cord),
    data: V7Data = {
      bindingId: id,
      carriedBy: carrier?.id ?? null,
      hangingLoad: F.newtons(hanging),
      wrapTension: F.newtons(tension),
      visual: view(w, parts, id),
    };
  if (load.strength <= tension) {
    const tails = ledger(g, stateOf(cord), num(k.slack)).tails,
      pieces = fragmentCord(
        w,
        at,
        cord,
        breakPoint(g, tails),
        F.conditionOf(cord),
        trialsOf(cord),
      );
    w.stacks = w.stacks.filter((s) => s !== cord);
    w.stacks.push(...pieces);
    separate(w, { top: parts.top, bottom: parts.bottom }, 'broke-cord-parted');
    say(
      'crossing-binding-broken',
      `${carrier ? 'Carried with the bottom piece hanging, the' : 'Under its own wrap tension, the'} worn cord parted in the wrap into two owned fragments of the same fiber; both pieces are free and nothing vanished.`,
      { ...data, fragments: pieces.map((f) => f.id) },
      id,
    );
    return;
  }
  if (!carrier) return;
  if (slip !== null && slip !== undefined && tension >= slip) {
    separate(w, parts, 'slipped-closure-carried');
    say(
      'crossing-binding-loosened',
      'Carried with the bottom piece hanging, the closure slipped: the binding came apart and all three items are conserved.',
      data,
      id,
    );
    return;
  }
  // One round of carrying at this tension under fiber-cord@1's creep law.
  const creep =
    load.law.creep *
    F.wetness(load.r) *
    Math.min(1, tension / load.strength) *
    load.wrap;
  if (creepInto(cord, load, creep) > 0 && num(recOf(cord).pretension) <= 0) {
    slacken(w, cord);
    say(
      'crossing-binding-loosened',
      'Carrying with the bottom piece hanging crept the cord: the closure still holds the wrap, but it is slack.',
      { ...data, visual: view(w, parts, id) },
      id,
    );
  }
}

/** Reserved items stay in the owner's hands; an unworked round pauses and relaxes hand-held stages;
 * bound cords wear once; a carried binding takes its hanging load. */
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
      if (j.mode === 'untie' && num(j.reached) === 1) {
        const { relaxed } = release(
          w,
          a,
          j,
          'Not worked this round; the open wrap held only by hand fell open.',
          false,
        );
        say(
          'crossing-binding-stopped',
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
          'crossing-binding-paused',
          'Binding work paused because it was not worked this round; nothing was spent.',
          summary(w, j),
          str(j.binding) ?? j.id,
        );
        if (note) relaxedEvent(say, w, j, note);
      }
    }
    sync(a, j);
  }
  // fiber-cord@1 wears cords and fragments; a cord closing a binding wears here at that rate, once.
  for (const s of w.stacks) {
    const p = s.processing?.[F.PART];
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const cond = Number(p.condition ?? 0);
    if (p.role === 'bound' && cond > 0)
      p.condition = v7RoundNumber(Math.max(0, cond - F.WEAR));
  }
  for (const cord of w.stacks.filter(
    (s) => stateOf(s) === 'bound' && F.roleOf(s) === 'bound',
  )) {
    const k = recOf(cord),
      id = str(k.bindingId);
    // A binding held by untie work is in the hands; only a free relation is resolved here.
    if (!id || cord.reservedFor !== id) continue;
    const a = w.actors.find((x) => x.id === cord.owner && x.vitals.health > 0),
      at = record(k.at),
      moved =
        !!a &&
        Math.hypot(a.position.x - num(at.x), a.position.y - num(at.y)) > 1e-6;
    resolve(w, cord, moved ? a : null);
  }
}

export const LONG_CROSSING_BINDING: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex16',
  dependencies: [
    'foundation-open@1',
    'hand-twist-fiber-cord@1',
    'hand-tie-cord-knot@1',
    'hand-join-fiber-cords@1',
  ],
  description:
    'General bare-hand binding of two owned rigid branch pieces where they cross with one owned fiber-cord@1 cord: one enclosing wrap closed by an overhand in its ends, four paid rounds under the crossing-contact@1 geometry, hand and friction rules, inspection, a bounded two-hand test, untying and cancel. The binding is a relation of the three conserved items. No reward, rating, shelter or added material.',
  reuse: {
    experiment:
      'ex16 hand-twist-fiber-cord@1 (cord item, width, condition, strand law, breaking force, grip and hand limits, stiffness, creep, damage onset, wear and visual metadata through FIBER_CORD); ex16 hand-tie-cord-knot@1 (law cord-knot@1: bend-limit measurement, knot state, opening, pinch, trial clearance and bounds, the arc curvature rule, through CORD_KNOT); ex16 hand-join-fiber-cords@1 (law cord-bend@1: reed-on-reed friction, dressing pull and tail retention rule for the cord-on-cord closure, its join key, through a new append-only CORD_BEND export); ex16 branch-screen@1 (staged paid work on whole branch units; its windbreak effect and slot sizes are not used)',
    source:
      'long-fiber-cord.ts FIBER_CORD; long-cord-knot.ts CORD_KNOT; long-fiber-cord-join.ts CORD_BEND (appended); collective-work.ts (paid work, stop); material-lots.ts; continuous-geometry.ts (segment clearance, world bounds); open-physical.ts (ground); open-foundation.ts (personal records); forest-climate.ts (events); the branch values of the open-shelter-material.ts law (version 2), re-stated without calling it',
    description:
      'Implementation reuse only; the three cord packages and branch-screen keep their behavior and ability text, and no ability is a prerequisite. The piece measurement, wrap hull, hand span and lift, cord-on-bark friction, closure geometry, release check, opposed-hand test, carrying load and untie rules are new, registered as crossing-contact@1.',
  },
  abilities: [
    {
      id: ID,
      name: 'Hand-bind crossing pieces',
      function:
        'Bind two own branch pieces where they cross with your own fiber cord (one wrap closed by an overhand in its ends) in four paid rounds; inspect, hand-test, untie or cancel; measured pieces and cord decide results.',
      equivalence: 'binding:hand-bound-two-piece-crossing:1',
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
            minimum: ANGLE.min,
            maximum: ANGLE.max,
          },
          workId: { type: 'string' },
          bindingId: { type: 'string' },
          trialForce: { type: 'number', minimum: 0, maximum: K.MAX_FORCE },
          trialDuration: { type: 'number', minimum: 0, maximum: K.MAX_SECONDS },
          trialDirection: { type: 'string', enum: DIRECTIONS },
        }),
        required: ['mode'],
      },
      references: {},
      prerequisites: [],
      learning: 4,
      learningEnergy: 0.2,
      costs:
        'Study: 4 rounds at 0.2 energy. attempt (pieceIds: two own untreated branch items, one whole unit each, first on top; a 2-unit lot may be named twice; cordId: own straight, unknotted, unjoined hand-twist-fiber-cord cord or fragment; crossingAngle 30-90 deg): reserves them, then 4 paid rounds of 0.5 (measure-position, route-wrap, form-tuck-closure, dress-release-check), continuing each round; a loose binding needs only the last; resume by attempt and workId. inspect (bindingId or workId): 0.2. trial (bound; trialForce N >0-10; trialDuration s >0-60; trialDirection): 0.5. untie: 2 paid rounds of 0.5. cancel: free. Needs dry footing, clear dry land for the 2 m pieces crossed at your place and nobody within your radius + 1 m. Unworked rounds, low energy or blocked room pause uncharged; refusals spend nothing; no refunds.',
      effects:
        'crossing-contact@1 keeps all three items; the binding is a relation. Round 1 measures each piece by the existing branch law (2 m, 350 kg/m3 solid, water share 0.5, section from volume) and the cord: width w, cord-knot@1 bend limit R. The wrap runs in the obtuse bisector plane round both sections (ellipses r and r/sin b, offset w/2): two half perimeters + sides, routed 0.04 m loose. Closure: each end turns half round the other at Rc = max(R, w), pi Rc + w each (formed at 0.02 m opening); tails need 0.02 m + w, ends a 0.02 m pinch. A short cord, a crossing over 0.1 m thick for one hand or over 100 N x health/100 to lift: paid measured shortfall. Hand-held stages relax when interrupted. Release check: the cord-bend@1 tail rule (reed friction 0.3) must hold 5 N; then 5 N wrap tension. Trial: one hand per piece beyond the crossing; force = min(trialForce, 200 N x health/100, 10000 N/m x piece width); separate: tension max(5 N, F/2) against closure slip and cord break (fiber-cord force / (1 + w/2R)); slide: slips at 0.3 (reed on bark) x tension x top contact angle. Records bending, creep slack, damage over half breaking load, fragments. Carrying hangs the bottom piece. Untie needs condition 0.5. Bound cords wear 0.0005 per round. No reward or shelter.',
      handler: 'long.hand-bind-crossing',
      revision: REVISION,
      authored: false,
      // The release-held event carries no qualified flag: a binding earns no milestone.
      practiceEvidence: 'crossing-binding-release-held',
      dependencies: {
        abilities: [],
        resources: ['branch', 'reed'],
        knowledge: [],
      },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Retained paid stages persist; resuming by workId pays only the next stage. Other modes take one round.',
      },
    },
  ],
  handlers: { 'long.hand-bind-crossing': execute },
  processes: {},
  visualComponents: [],
  events: [
    'crossing-binding-started',
    'crossing-binding-stage',
    'crossing-binding-shortfall',
    'crossing-binding-wrap-routed',
    'crossing-binding-closure-tucked',
    'crossing-binding-release-held',
    'crossing-binding-release-loosened',
    'crossing-binding-relaxed',
    'crossing-binding-paused',
    'crossing-binding-resumed',
    'crossing-binding-cancelled',
    'crossing-binding-stopped',
    'crossing-binding-inspected',
    'crossing-binding-trial',
    'crossing-binding-grip-slipped',
    'crossing-binding-crossing-slipped',
    'crossing-binding-closure-slipped',
    'crossing-binding-damaged',
    'crossing-binding-broken',
    'crossing-binding-loosened',
    'crossing-binding-resisted',
    'crossing-binding-untied',
  ],
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
        'crossing-binding-stopped',
        'Binding work stopped by death; the pieces and cord lie where the person died in their actual configuration.',
        summary(w, j),
        str(j.binding) ?? j.id,
      );
      if (relaxed) relaxedEvent(say, w, j, relaxed);
      sync(a, j);
    }
  },
};

/** The crossing-contact@1 piece, cord, section, room and closure rules, exported unchanged for
 * packages that bind the same crossings (ex16 hand-lash-crossing@1). */
export const CROSSING_CONTACT = {
  LAW,
  REVISION,
  BIND,
  RIGID,
  BARK,
  HAND_SPAN,
  GRAVITY,
  ANGLE,
  DIRECTIONS,
  TREATED,
  measurePiece,
  bendingStrength,
  measureCord,
  section,
  space,
  closureSlip,
};
