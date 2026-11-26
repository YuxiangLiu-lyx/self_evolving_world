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
  v7Json,
  v7Number,
  v7RoundNumber,
  v7String,
} from './continuous-data.js';
import { forestEvent } from './forest-climate.js';
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
import { MULTI_TURN_CONTACT as M } from './long-crossing-lashing.js';

const ID = 'hand-frap-crossing';
const REVISION = `${ID}@1`;
const STATE = `long:work:${ID}`;
/** Processing key of the cord's transverse turns; the lashing relation keeps hand-lash-crossing@1's key. */
const KEY = 'crossingFrapping';
const LAW = 'transverse-contact@1';
const METHOD = 'same-cord-transverse-turns-overhand-closure';
const PREFIX = 'crossing-frapping-';
/** The lashing relation's state while this package holds it open by hand, and once it is frapped. */
const HELD = 'frapping';
const FRAPPED = 'frapped';
/** Energy of one attempt or untie round, of an assessment, an inspection and a trial. */
const STEP = 0.5;
const ASSESS = 0.5;
const LOOK = 0.2;
const TRIAL = 0.5;
const FRAPS = { min: 1, max: 3 };
const TURNS = { min: 2, max: 4 };
/** Wedge rays, route normals, points per leg disc, coarse tangent scan and arc intervals. */
const RAYS = 360;
const ROUTE = 720;
const DISC = 144;
const SCAN = 48;
const ARC = 64;
/** Route points kept per transverse turn in the schematic view. */
const VIEW_POINTS = 24;
/** Arguments each mode accepts besides mode; any other supplied argument is refused. */
const ARGS: Partial<Record<string, string[]>> = {
  assess: [
    'bindingId',
    'pieceIds',
    'cordId',
    'crossingAngle',
    'wrapCount',
    'frapCount',
  ],
  attempt: ['bindingId', 'frapCount', 'workId'],
  inspect: ['bindingId', 'workId'],
  trial: ['bindingId', 'trialForce', 'trialDuration', 'trialDirection'],
  untie: ['bindingId', 'workId'],
  cancel: ['workId'],
};
const WORK = ['attempt', 'untie'];
type State = 'separate' | 'released' | 'routed' | 'frapped' | 'opened';
/** Mechanics transverse-contact@1 does not resolve; they are reported with every frapped result. */
const UNVALIDATED = [
  'tension transfer where the end passes from the outer turn to the transverse turns',
  'wedging the pieces apart where transverse turns bear on the bark',
  'friction redistribution of the added tension along each turn',
];

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
const tieStages = (fraps: number) => [
  'measure-plan',
  'release-closure',
  ...range(fraps).map((i) => `route-frap-${String(i + 1)}`),
  'close-dress-release-check',
];
const untieStages = (fraps: number, turns: number) => [
  'withdraw-closure-end',
  ...range(fraps).map((i) => `unwrap-frap-${String(fraps - i)}`),
  ...range(turns).map((i) => `unwrap-turn-${String(turns - i)}`),
];
const recOf = (s: V7Stack) => record(s.processing?.[KEY]);
function stateOf(s: V7Stack): State {
  const v = recOf(s).state;
  return v === 'released' || v === 'routed' || v === 'frapped' || v === 'opened'
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

type Plan = ReturnType<typeof M.plan>;
type Model = NonNullable<ReturnType<typeof M.modelOf>>;
type Tensions = ReturnType<typeof M.tensions>;
type Piece = NonNullable<ReturnType<typeof M.measurePiece>>;
type Cord = NonNullable<ReturnType<typeof X.measureCord>>;
interface Parts {
  top?: V7Stack | undefined;
  bottom?: V7Stack | undefined;
  cord?: V7Stack | undefined;
}
const listOf = (p: Parts) =>
  [p.top, p.bottom, p.cord].filter((s): s is V7Stack => !!s);

/** transverse-contact@1, part 1: the base turns' legs in their own planes. Each turn plane cuts the
 * pieces in multi-turn-contact@1's ellipses; the centreline runs half a width outside them. */
type Pt = [number, number];
interface Ell {
  a: number;
  b: number;
  x: number;
  z: number;
}
/** Support value and point of an ellipse offset by half a cord width, at outward normal angle phi. */
function sup(e: Ell, half: number, phi: number) {
  const c = Math.cos(phi),
    s = Math.sin(phi),
    q = Math.sqrt(e.a * e.a * c * c + e.b * e.b * s * s);
  return {
    h: e.x * c + e.z * s + q + half,
    x: e.x + (e.a * e.a * c) / q + half * c,
    z: e.z + (e.b * e.b * s) / q + half * s,
  };
}
/** Offset-curve length between normal angles: the ellipse radius a^2 b^2 / q^3 plus half a width. */
function arcLength(e: Ell, half: number, from: number, to: number) {
  const r = (phi: number) => {
      const c = Math.cos(phi),
        s = Math.sin(phi),
        q = Math.sqrt(e.a * e.a * c * c + e.b * e.b * s * s);
      return (e.a * e.a * e.b * e.b) / (q * q * q) + half;
    },
    h = (to - from) / ARC;
  let total = r(from) + r(to);
  for (let i = 1; i < ARC; i++) total += (i % 2 ? 4 : 2) * r(from + i * h);
  return (total * h) / 3;
}
const beyond = (e: Ell, half: number, p: Pt, phi: number) =>
  p[0] * Math.cos(phi) + p[1] * Math.sin(phi) - sup(e, half, phi).h;
/** A sign change of f in [lo, hi], found by bisection; null without one. */
function bisect(
  f: (x: number) => number,
  lo: number,
  hi: number,
  steps = 60,
): number | null {
  let a = lo,
    fa = Math.max(-1, Math.min(1, f(lo))),
    b = hi;
  const fb = Math.max(-1, Math.min(1, f(hi)));
  if (fa * fb > 0) return null;
  for (let i = 0; i < steps; i++) {
    const mid = (a + b) / 2,
      fm = Math.max(-1, Math.min(1, f(mid)));
    if (fa * fm <= 0) b = mid;
    else {
      a = mid;
      fa = fm;
    }
  }
  return (a + b) / 2;
}
/** The normal angle in (from, to) at which p lies farthest outside the curve; null when p is not outside. */
function farthest(e: Ell, half: number, p: Pt, from: number, to: number) {
  const step = (to - from) / SCAN;
  let best = from + step,
    value = -Infinity;
  for (let i = 1; i < SCAN; i++) {
    const phi = from + step * i,
      v = beyond(e, half, p, phi);
    if (v > value) {
      value = v;
      best = phi;
    }
  }
  let lo = Math.max(from, best - step),
    hi = Math.min(to, best + step);
  for (let i = 0; i < 40; i++) {
    const u = lo + (hi - lo) / 3,
      v = hi - (hi - lo) / 3;
    if (beyond(e, half, p, u) < beyond(e, half, p, v)) lo = u;
    else hi = v;
  }
  best = (lo + hi) / 2;
  return beyond(e, half, p, best) > 1e-12 ? best : null;
}
/** Normal angle where the cord from p touches a section: side 0 climbs anticlockwise over the top
 * section and descends clockwise under the bottom one; side 1 mirrors it. */
function touch(
  e: Ell,
  half: number,
  p: Pt,
  side: 0 | 1,
  upper: boolean,
): number | null {
  const from = side ? Math.PI / 2 : -Math.PI / 2,
    best = farthest(e, half, p, from, from + Math.PI);
  if (best === null) return null;
  const f = (phi: number) => beyond(e, half, p, phi);
  if (side === 0)
    return upper ? bisect(f, best, Math.PI / 2) : bisect(f, -Math.PI / 2, best);
  return upper
    ? bisect(f, Math.PI / 2, best)
    : bisect(f, best, (3 * Math.PI) / 2);
}
interface Leg {
  /** In-plane position where the leg crosses the contact plane of the pieces, and its parts above and below. */
  x: number;
  upper: number;
  lower: number;
}
interface Turn {
  index: number;
  offset: number;
  top: Ell;
  bottom: Ell;
  legs: [Leg, Leg];
  planar: number;
  room: [number, number];
}
interface SidePath {
  top: number;
  bottom: number;
  segments: number;
  slope: number;
}
/** The leg on one side drawn in by delta at the contact plane: tangents from the drawn point to
 * both sections (collision-free by construction), their length and d(length)/d(delta). */
function sidePath(
  t: Turn,
  half: number,
  side: 0 | 1,
  delta: number,
): SidePath | null {
  const leg = t.legs[side],
    p: Pt = [leg.x + (side ? delta : -delta), 0],
    up = touch(t.top, half, p, side, true),
    down = touch(t.bottom, half, p, side, false);
  if (up === null || down === null) return null;
  const u = sup(t.top, half, up),
    v = sup(t.bottom, half, down),
    du = Math.hypot(p[0] - u.x, p[1] - u.z),
    dv = Math.hypot(p[0] - v.x, p[1] - v.z),
    inward = side ? 1 : -1;
  return {
    top: up,
    bottom: down,
    segments: du + dv,
    slope:
      du > 1e-12 && dv > 1e-12
        ? inward * ((p[0] - u.x) / du + (p[0] - v.x) / dv)
        : 0,
  };
}
const turnPlanar = (t: Turn, half: number, a: SidePath, b: SidePath) =>
  arcLength(t.top, half, a.top, b.top) +
  arcLength(t.bottom, half, b.bottom, a.bottom + 2 * Math.PI) +
  a.segments +
  b.segments;
/** One base turn's plane: both sections, where each leg crosses the contact plane and how far it can
 * be drawn in before it meets a section. Null when a leg does not span the contact plane. */
function turnGeometry(
  f: Plan,
  index: number,
  offset: number,
  half: number,
): Turn | null {
  const sin = Math.sin(f.beta),
    shift = Math.cos(f.beta) / sin,
    rT = f.top.diameter / 2,
    rB = f.bottom.diameter / 2,
    top: Ell = { a: rT / sin, b: rT, x: offset * shift, z: rT },
    bottom: Ell = { a: rB / sin, b: rB, x: -offset * shift, z: -rB },
    legs: Leg[] = [];
  for (const side of [0, 1] as const) {
    const g = (phi: number) => sup(top, half, phi).h - sup(bottom, half, phi).h,
      phi = side
        ? bisect(g, Math.PI / 2, 1.5 * Math.PI)
        : bisect(g, -Math.PI / 2, Math.PI / 2);
    if (phi === null) return null;
    const u = sup(top, half, phi),
      d = sup(bottom, half, phi);
    if (!(u.z > 1e-9 && d.z < -1e-9)) return null;
    const x = u.x + ((d.x - u.x) * u.z) / (u.z - d.z);
    legs.push({
      x,
      upper: Math.hypot(u.x - x, u.z),
      lower: Math.hypot(d.x - x, d.z),
    });
  }
  const [l0, l1] = legs;
  if (!l0 || !l1) return null;
  const t: Turn = {
      index,
      offset,
      top,
      bottom,
      legs: [l0, l1],
      planar: 0,
      room: [0, 0],
    },
    a = sidePath(t, half, 0, 0),
    b = sidePath(t, half, 1, 0);
  if (!a || !b) return null;
  t.planar = turnPlanar(t, half, a, b);
  t.room = [0, 1].map((s) => {
    const side = s ? 1 : 0,
      x = Math.abs(t.legs[side].x),
      clear = (delta: number) => {
        const p: Pt = [t.legs[side].x + (side ? delta : -delta), 0],
          from = side ? Math.PI / 2 : -Math.PI / 2;
        return farthest(top, half, p, from, from + Math.PI) !== null &&
          farthest(bottom, half, p, from, from + Math.PI) !== null
          ? 1
          : -1;
      };
    return clear(x) > 0 ? x : (bisect(clear, 0, x, 40) ?? 0) * (1 - 1e-6);
  }) as [number, number];
  return t;
}

/** transverse-contact@1, part 2: the wedge between the pieces in plan (x along the acute bisector,
 * y along the obtuse bisector). A cord fits where a sphere of its width clears both pieces:
 * under the top piece (axis at height rT) and over the bottom one (axis at -rB). */
interface Wedge {
  s: number;
  c: number;
  rT: number;
  rB: number;
  half: number;
}
function gapAt(g: Wedge, p: Pt) {
  const dT = Math.abs(p[0] * g.s - p[1] * g.c),
    dB = Math.abs(p[0] * g.s + p[1] * g.c),
    up =
      dT >= g.rT + g.half
        ? Infinity
        : g.rT - Math.sqrt((g.rT + g.half) ** 2 - dT * dT),
    lo =
      dB >= g.rB + g.half
        ? -Infinity
        : -g.rB + Math.sqrt((g.rB + g.half) ** 2 - dB * dB);
  return { up, lo, clearance: up - lo };
}
/** The closed boundary of the wedge zone where the gap between the pieces is narrower than the cord. */
function wedgeBoundary(g: Wedge): { points: Pt[]; rho: number[] } {
  const points = range(RAYS).map((i): Pt => {
      const alpha = (2 * Math.PI * i) / RAYS,
        cx = Math.cos(alpha),
        cy = Math.sin(alpha),
        k = Math.max(
          Math.abs(cx * g.s - cy * g.c),
          Math.abs(cx * g.s + cy * g.c),
        ),
        hi = (Math.max(g.rT, g.rB) + 2 * g.half) / Math.max(1e-9, k),
        r =
          bisect((x) => gapAt(g, [x * cx, x * cy]).clearance, 0, hi * 1.01) ??
          0;
      return [r * cx, r * cy];
    }),
    at = (i: number) => points[(i + RAYS) % RAYS] ?? [0, 0];
  return {
    points,
    rho: points.map((_, i) => {
      const [p, q, r] = [at(i - 4), at(i), at(i + 4)],
        ab = Math.hypot(q[0] - p[0], q[1] - p[1]),
        bc = Math.hypot(r[0] - q[0], r[1] - q[1]),
        ca = Math.hypot(p[0] - r[0], p[1] - r[1]),
        area = Math.abs(
          (q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1]),
        );
      return area > 1e-18 ? (ab * bc * ca) / (2 * area) : Infinity;
    }),
  };
}

/** transverse-contact@1, part 3: the transverse route, the shortest-found closed curve enclosing the
 * leg bundles and the wedge zone whose radius never falls below the cord's bend limit R: the boundary
 * of C + disc(R), C grown greedily from the crossing until every obstacle lies within R of it. */
interface Obstacle {
  p: Pt;
  /** 0: leg bundle on side 0 (+y), 1: leg bundle on side 1 (-y), 2: wedge between the pieces. */
  part: 0 | 1 | 2;
  rho: number;
}
const cross = (o: Pt, a: Pt, b: Pt) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function convex(list: Pt[]): Pt[] {
  const pts = [...list].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const lower: Pt[] = [],
    upper: Pt[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2] ?? p, lower[lower.length - 1] ?? p, p) <=
        1e-18
    )
      lower.pop();
    lower.push(p);
  }
  for (const p of [...pts].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2] ?? p, upper[upper.length - 1] ?? p, p) <=
        1e-18
    )
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function toSegment(p: Pt, a: Pt, b: Pt): { d: number; q: Pt } {
  const vx = b[0] - a[0],
    vy = b[1] - a[1],
    l = vx * vx + vy * vy,
    t =
      l > 0
        ? Math.max(
            0,
            Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l),
          )
        : 0,
    q: Pt = [a[0] + t * vx, a[1] + t * vy];
  return { d: Math.hypot(p[0] - q[0], p[1] - q[1]), q };
}
function nearest(poly: Pt[], p: Pt): { d: number; q: Pt } {
  const [first] = poly;
  if (!first) return { d: Infinity, q: p };
  if (poly.length === 1)
    return { d: Math.hypot(p[0] - first[0], p[1] - first[1]), q: first };
  if (
    poly.length >= 3 &&
    poly.every((a, i) => cross(a, poly[(i + 1) % poly.length] ?? a, p) >= 0)
  )
    return { d: 0, q: p };
  let best = { d: Infinity, q: p };
  poly.forEach((a, i) => {
    const r = toSegment(p, a, poly[(i + 1) % poly.length] ?? a);
    if (r.d < best.d) best = r;
  });
  return best;
}
interface Route {
  centre: Pt[];
  radius: number;
  normals: number[];
  /** Per normal step: which obstacle the route bears on and that obstacle's own radius there. */
  parts: number[];
  rho: number[];
  turning: [number, number, number];
}
function routeOf(obstacles: Obstacle[], radius: number): Route | null {
  const zs: Pt[] = [[0, 0]];
  let centre = convex(zs),
    done = false;
  for (let it = 0; it < 2000; it++) {
    let worst = -1,
      excess = 1e-7;
    obstacles.forEach((o, i) => {
      const e = nearest(centre, o.p).d - radius;
      if (e > excess) {
        excess = e;
        worst = i;
      }
    });
    const o = obstacles[worst];
    if (!o) {
      done = true;
      break;
    }
    const { q } = nearest(centre, o.p),
      l = Math.hypot(q[0] - o.p[0], q[1] - o.p[1]);
    zs.push([
      o.p[0] + ((q[0] - o.p[0]) * radius) / l,
      o.p[1] + ((q[1] - o.p[1]) * radius) / l,
    ]);
    centre = convex(zs);
  }
  if (!done) return null;
  const contacts = obstacles.flatMap((o) => {
    const r = nearest(centre, o.p);
    return r.d >= radius - 1e-6
      ? [{ o, phi: Math.atan2(o.p[1] - r.q[1], o.p[0] - r.q[0]) }]
      : [];
  });
  if (!contacts.length) return null;
  // Normals run anticlockwise from the apex over the side-0 bundle (+y) round to it again.
  const normals = range(ROUTE + 1).map(
      (j) => Math.PI / 2 - 2 * Math.PI + (2 * Math.PI * j) / ROUTE,
    ),
    parts: number[] = [],
    rho: number[] = [],
    turning: [number, number, number] = [0, 0, 0];
  for (let j = 0; j < ROUTE; j++) {
    const mid = ((normals[j] ?? 0) + (normals[j + 1] ?? 0)) / 2;
    let best = contacts[0],
      gap = Infinity;
    for (const k of contacts) {
      const d = Math.abs(
        ((((mid - k.phi) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) -
          Math.PI,
      );
      if (d < gap) {
        gap = d;
        best = k;
      }
    }
    const part = best?.o.part ?? 2;
    parts.push(part);
    rho.push(best?.o.rho ?? Infinity);
    turning[part] += (2 * Math.PI) / ROUTE;
  }
  return { centre, radius, normals, parts, rho, turning };
}
/** The route's point at a normal angle for a turn lying r outside C. */
function routePoint(route: Route, phi: number, r: number): Pt {
  const n: Pt = [Math.cos(phi), Math.sin(phi)];
  let best = route.centre[0] ?? [0, 0],
    value = -Infinity;
  for (const v of route.centre) {
    const h = v[0] * n[0] + v[1] * n[1];
    if (h > value) {
      value = h;
      best = v;
    }
  }
  return [best[0] + r * n[0], best[1] + r * n[1]];
}
/** One transverse turn's centreline in 3D: the plan route (its straight runs subdivided every
 * millimetre), dipping under the top piece and rising over the bottom one only as far as the gap
 * requires (z from the contact plane of the pieces). */
function routeLine(route: Route, g: Wedge, r: number): number[][] {
  const plan = route.normals.map((phi) => routePoint(route, phi, r)),
    dense: Pt[] = [];
  plan.forEach((p, j) => {
    const q = plan[j - 1];
    if (q) {
      const n = Math.floor(Math.hypot(p[0] - q[0], p[1] - q[1]) / 1e-3);
      for (let i = 1; i <= n; i++)
        dense.push([
          q[0] + ((p[0] - q[0]) * i) / (n + 1),
          q[1] + ((p[1] - q[1]) * i) / (n + 1),
        ]);
    }
    dense.push(p);
  });
  return dense.map((p) => {
    const b = gapAt(g, p),
      z = b.lo > b.up ? (b.lo + b.up) / 2 : Math.min(b.up, Math.max(b.lo, 0));
    return [p[0], p[1], z];
  });
}
const lineLength = (line: number[][]) =>
  sum(
    line.slice(1).map((q, i) => {
      const p = line[i] ?? q;
      return Math.hypot(
        (q[0] ?? 0) - (p[0] ?? 0),
        (q[1] ?? 0) - (p[1] ?? 0),
        (q[2] ?? 0) - (p[2] ?? 0),
      );
    }),
  );

/** transverse-contact@1, part 4: snugging. Each transverse turn is pulled with the existing 5 N hand
 * pull at its exit; going back round it the tension falls by the capstan relation over each contact
 * (cord on cord over the leg bundles and earlier turns, cord on bark in the wedge), taken over the
 * crossing-contact@1 bridging share rho / R where the stiff cord bridges a tighter obstacle. The force
 * on an obstacle is the cord's tension difference across the arc it carries, T_b t_b - T_a t_a. */
interface Snug {
  start: number;
  exit: number;
  push: [number, number];
  wedge: number;
  contact: [number, number, number];
}
function snug(
  route: Route,
  turn: number,
  width: number,
  muCord: number,
  muBark: number,
): Snug {
  const r = route.radius + (turn - 1) * width,
    T = new Array<number>(ROUTE + 1).fill(B.DRESS),
    contact: [number, number, number] = [0, 0, 0],
    force: Pt[] = [
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    step = (2 * Math.PI) / ROUTE;
  for (let j = ROUTE - 1; j >= 0; j--) {
    const part = route.parts[j] === 0 ? 0 : route.parts[j] === 1 ? 1 : 2,
      share = turn > 1 ? 1 : Math.min(1, (route.rho[j] ?? Infinity) / r),
      mu = turn > 1 || part !== 2 ? muCord : muBark;
    contact[part] += share * step;
    T[j] = (T[j + 1] ?? B.DRESS) * Math.exp(-mu * share * step);
  }
  for (let j = 0; j < ROUTE; j++) {
    const a = route.normals[j] ?? 0,
      b = route.normals[j + 1] ?? 0,
      ta = T[j] ?? 0,
      tb = T[j + 1] ?? 0,
      f = force[route.parts[j] ?? 2];
    if (!f) continue;
    f[0] += tb * -Math.sin(b) - ta * -Math.sin(a);
    f[1] += tb * Math.cos(b) - ta * Math.cos(a);
  }
  return {
    start: T[0] ?? 0,
    exit: B.DRESS,
    push: [-(force[0]?.[1] ?? 0), force[1]?.[1] ?? 0],
    wedge: Math.hypot(force[2]?.[0] ?? 0, force[2]?.[1] ?? 0),
    contact,
  };
}

/** transverse-contact@1, part 5: drawing in. The transverse push moves each bundle's legs inward
 * together at the contact plane; each turn lengthens along its exact tangents and its tension rises
 * by the fiber-cord@1 stiffness x lengthening / turn length, a uniform increment as multi-turn-contact@1
 * takes loads (slack is taken up first). Each side balances where the legs' tensions x d(length)/
 * d(delta) equal the push; a bundle stops where it meets the pieces. */
interface Drawn {
  deflection: [number, number];
  bottomed: [boolean, boolean];
  extra: number[];
  resisting: [number, number];
  planar: number[];
  rest: Tensions;
}
function drawIn(
  turns: Turn[],
  model: Model,
  stiffness: number,
  pitch: number,
  push: [number, number],
  half: number,
): Drawn | null {
  const base = turns.map((t) => Math.hypot(t.planar, pitch)),
    paths = (side: 0 | 1, delta: number) =>
      turns.map((t) => sidePath(t, half, side, delta)),
    rooms: [number, number] = [
      Math.min(...turns.map((t) => t.room[0])),
      Math.min(...turns.map((t) => t.room[1])),
    ],
    evaluate = (p0: (SidePath | null)[], p1: (SidePath | null)[]) => {
      const planar: number[] = [];
      for (const [k, t] of turns.entries()) {
        const a = p0[k],
          b = p1[k];
        if (!a || !b) return null;
        planar.push(turnPlanar(t, half, a, b));
      }
      const extra = planar.map((l, k) =>
          Math.max(
            0,
            (stiffness * (Math.hypot(l, pitch) - (base[k] ?? 0))) /
              Math.max(1e-9, model.turns[k]?.length ?? 1),
          ),
        ),
        rest = M.tensions(model, extra),
        resisting: [number, number] = [0, 0];
      turns.forEach((_, k) => {
        resisting[0] += (rest.sides[k]?.[0] ?? 0) * (p0[k]?.slope ?? 0);
        resisting[1] += (rest.sides[k]?.[1] ?? 0) * (p1[k]?.slope ?? 0);
      });
      return { planar, extra, rest, resisting };
    };
  const deflection: [number, number] = [0, 0],
    bottomed: [boolean, boolean] = [false, false];
  let p0 = paths(0, 0),
    p1 = paths(1, 0);
  for (let it = 0; it < 12; it++) {
    const before = [...deflection];
    for (const side of [0, 1] as const) {
      const limit = rooms[side] * (1 - 1e-6),
        resist = (delta: number) => {
          const own = paths(side, delta),
            r = side ? evaluate(p0, own) : evaluate(own, p1);
          return r ? r.resisting[side] : Infinity;
        };
      if (resist(limit) <= push[side]) {
        deflection[side] = limit;
        bottomed[side] = true;
      } else {
        deflection[side] =
          bisect((d) => resist(d) - push[side], 0, limit, 48) ?? 0;
        bottomed[side] = false;
      }
      if (side) p1 = paths(1, deflection[1]);
      else p0 = paths(0, deflection[0]);
    }
    if (
      Math.max(...deflection.map((d, i) => Math.abs(d - (before[i] ?? 0)))) <
      1e-9
    )
      break;
  }
  const r = evaluate(p0, p1);
  return r ? { deflection, bottomed, ...r } : null;
}

/** transverse-contact@1 for one crossing, base lashing and transverse turn count, optionally with
 * the legs drawn in: legs, wedge, route, contacts, turn lengths, travel and every stage's length. */
interface Stage {
  stage: string;
  occupied: number;
  need: number;
}
interface Frap {
  base: Plan;
  count: number;
  slack: number;
  turns: Turn[];
  wedge: Wedge;
  reach: [number, number];
  route: Route | null;
  radius: number;
  lines: number[][][];
  lengths: number[];
  snugs: Snug[];
  push: [number, number];
  clearance: number;
  legGap: number;
  travel: number;
  travelUp: number;
  stages: Stage[];
  need: number;
  worst: Stage | null;
  tails: number;
  wedgeBlocked: boolean;
  code: string | null;
  problem: string | null;
}
function frapPlan(
  base: Plan,
  count: number,
  slack: number,
  proposed: boolean,
  muCord: number,
  muBark: number,
  delta: [number, number] = [0, 0],
): Frap {
  const w = base.cord.width,
    half = w / 2,
    L = base.cord.overall,
    theta = rad(base.angle),
    wedge: Wedge = {
      s: Math.sin(theta / 2),
      c: Math.cos(theta / 2),
      rT: base.top.diameter / 2,
      rB: base.bottom.diameter / 2,
      half,
    },
    turns = base.turns.map((t) => turnGeometry(base, t.index, t.offset, half)),
    found = turns.filter((t): t is Turn => t !== null),
    whole = found.length === turns.length,
    zone = wedgeBoundary(wedge),
    reach: [number, number] = [
      Math.max(...zone.points.map((p) => Math.abs(p[0]))),
      Math.max(...zone.points.map((p) => Math.abs(p[1]))),
    ],
    radius = Math.max(base.cord.bend ?? Infinity, half),
    obstacles: Obstacle[] = [
      ...zone.points.map((p, i) => ({
        p,
        part: 2 as const,
        rho: zone.rho[i] ?? Infinity,
      })),
      ...found.flatMap((t) =>
        ([0, 1] as const).flatMap((side) => {
          const y = t.legs[side].x + (side ? delta[1] : -delta[0]);
          return range(DISC).map((i): Obstacle => {
            const a = (2 * Math.PI * i) / DISC;
            return {
              p: [t.offset + w * Math.cos(a), y + w * Math.sin(a)],
              part: side,
              rho: w,
            };
          });
        }),
      ),
    ],
    route =
      whole && Number.isFinite(radius) ? routeOf(obstacles, radius) : null,
    lines = route
      ? range(count).map((i) => routeLine(route, wedge, radius + i * w))
      : [],
    closed = lines.map(lineLength),
    // Each transverse turn lies on the one before; its radial step of one width is its advance.
    lengths = closed.map((l) => Math.hypot(l, w)),
    snugs = route
      ? range(count).map((i) => snug(route, i + 1, w, muCord, muBark))
      : [],
    push: [number, number] = [
      sum(snugs.map((s) => s.push[0])),
      sum(snugs.map((s) => s.push[1])),
    ],
    first = lines[0] ?? [],
    clearance = first.length
      ? Math.min(
          ...first.map((p) => gapAt(wedge, [p[0] ?? 0, p[1] ?? 0]).clearance),
        )
      : 0,
    legGap = first.length
      ? Math.min(
          ...first.flatMap((p) =>
            found.flatMap((t) =>
              ([0, 1] as const).map((side) =>
                Math.hypot(
                  (p[0] ?? 0) - t.offset,
                  (p[1] ?? 0) -
                    (t.legs[side].x + (side ? delta[1] : -delta[0])),
                ),
              ),
            ),
          ),
        ) - w
      : 0,
    // The end leaves the outer turn's crown beside it and runs down its side to the contact plane.
    outer = turnGeometry(
      base,
      count + 1,
      (base.turns.at(-1)?.offset ?? 0) + base.pitch,
      half,
    ),
    travel = outer
      ? (() => {
          const phi =
              bisect(
                (x) => sup(outer.top, half, x).h - sup(outer.bottom, half, x).h,
                -Math.PI / 2,
                Math.PI / 2,
              ) ?? 0,
            u = sup(outer.top, half, phi);
          return (
            arcLength(outer.top, half, phi, Math.PI / 2) +
            Math.hypot(u.x - outer.legs[0].x, u.z)
          );
        })()
      : 0,
    // Back up beside the transverse turns and over the turns to the closure over the middle.
    travelUp = travel + base.bridge + count * w,
    wrap = base.wrap + slack,
    transverse = sum(lengths),
    routing = range(count).map(
      (k) => wrap + travel + sum(lengths.slice(0, k + 1)) + 2 * K.OPENING,
    ),
    tied = wrap + base.bridge + travel + transverse + travelUp,
    forming = tied + 2 * K.OPENING + 2 * base.formPath,
    seated = tied + 2 * base.closurePath,
    stages: Stage[] = [
      ...(proposed
        ? base.stages.map((s) => ({ ...s, stage: `lash-${s.stage}` }))
        : []),
      { stage: 'release-closure', occupied: wrap, need: wrap + 2 * K.PINCH },
      ...routing.map((o, k) => ({
        stage: `route-frap-${String(k + 1)}`,
        occupied: o,
        need: o + 2 * K.PINCH,
      })),
      {
        stage: 'close-form-closure',
        occupied: forming,
        need: forming + 2 * K.PINCH,
      },
      {
        stage: 'close-seat-tails',
        occupied: seated,
        need: seated + 2 * base.tailNeed,
      },
    ],
    need = Math.max(...stages.map((s) => s.need)),
    worst = stages.reduce<Stage | null>(
      (x, y) => (!x || y.need > x.need ? y : x),
      null,
    ),
    wedgeBlocked = (route?.turning[2] ?? 0) > 1e-9,
    code =
      base.cord.bend === null
        ? 'no-bend'
        : base.code === 'hand-span'
          ? 'hand-span'
          : proposed && base.code === 'lift'
            ? 'lift'
            : !whole
              ? 'blocked-gap'
              : !route
                ? 'unresolved-route'
                : push[0] <= 1e-9 || push[1] <= 1e-9
                  ? 'blocked-gap'
                  : clearance < -1e-5 || legGap < -1e-5
                    ? 'route-intersects'
                    : L < need - 1e-9
                      ? 'too-short'
                      : null,
    problem =
      code === 'no-bend'
        ? `the strands of ${base.cord.stack.id} resisted bending, so no turn can be routed`
        : code === 'hand-span'
          ? `with its turns the crossing is ${String(m(base.hold))} m thick; one hand closes round at most ${String(X.HAND_SPAN)} m to support the turns while the other passes the cord`
          : code === 'lift'
            ? `lifting the crossing to pass the base turns under it takes ${String(F.newtons(base.lift))} N; one hand gives ${String(F.newtons(base.liftLimit))} N`
            : code === 'blocked-gap'
              ? 'no transverse path between the pieces bears on the leg bundles of the turns'
              : code === 'unresolved-route'
                ? 'no transverse route at the cord bend limit was resolved'
                : code === 'route-intersects'
                  ? 'the measured transverse route meets a piece or a turn'
                  : code === 'too-short'
                    ? `the cord is ${String(m(L))} m; ${String(count)} transverse turn(s) need ${String(m(need))} m at ${worst?.stage ?? ''}: ${String(m(wrap))} m of base turns, ${String(m(travel))} m from the outer turn to the contact plane and ${String(m(travelUp))} m back to the closure, transverse turns of ${lengths.map((l) => String(m(l))).join(' + ')} m (${String(K.OPENING * 2)} m loose on the turn being passed), ${String(m(base.bridge))} m for the other end, a closure of 2 x ${String(m(base.formPath))} m forming and 2 x ${String(m(base.closurePath))} m seated, ${String(K.PINCH)} m to pinch each end and tails of ${String(m(base.tailNeed))} m; short by ${String(m(need - L))} m (a separate or joined frapping cord is not supported in this version)`
                    : null;
  return {
    base,
    count,
    slack,
    turns: found,
    wedge,
    reach,
    route,
    radius,
    lines,
    lengths,
    snugs,
    push,
    clearance,
    legGap,
    travel,
    travelUp,
    stages,
    need,
    worst,
    tails: (L - seated) / 2,
    wedgeBlocked,
    code,
    problem,
  };
}
/** The least cord any transverse turns need on an existing lashing whatever the angle: its own seated
 * length and tails, at least twice the top piece's height to reach the contact plane and back, and per
 * turn twice the span of both legs (at least the thinner piece's diameter apart) plus a full turn round
 * a cord-width disc at its stacking offset. Visible before costs. */
function least(cord: V7Stack, fraps: number) {
  const k = M.recOf(cord),
    g = record(k.geometry),
    book = M.ledger(cord),
    w = num(g.width),
    d = numbers(g.pieceDiameters),
    r = Math.min(d[0] ?? 0, d[1] ?? 0) / 2,
    seated = book.wrap + book.slack + 2 * book.bridgePerEnd + 2 * book.closure;
  return (
    seated +
    2 * num(g.tailNeed) +
    2 * (d[0] ?? 0) +
    sum(range(fraps).map((i) => 4 * r + 2 * Math.PI * (i + 1) * w))
  );
}
/** Stored measured geometry, rounded for reports; the tension model keeps full values. */
function describe(f: Frap): V7Data {
  // Evenly spaced points of the subdivided route, closed (first and last coincide).
  const keep = (line: number[][]) =>
    range(VIEW_POINTS + 1).map((i) =>
      (line[Math.round(((line.length - 1) * i) / VIEW_POINTS)] ?? []).map(m),
    );
  return {
    law: LAW,
    crossingAngle: f.base.angle,
    wrapCount: f.base.count,
    frapCount: f.count,
    items: [f.base.top.stack.id, f.base.bottom.stack.id, f.base.cord.stack.id],
    pieceDiameters: [m(f.base.top.diameter), m(f.base.bottom.diameter)],
    width: m(f.base.cord.width),
    centreline: f.base.cord.overall,
    cordCondition: v7RoundNumber(f.base.cord.condition),
    bendLimit: f.base.cord.bend === null ? null : m(f.base.cord.bend),
    routeRadius: Number.isFinite(f.radius) ? m(f.radius) : null,
    baseWrap: m(f.base.wrap),
    baseSlack: m(f.slack),
    bridgePerEnd: m(f.base.bridge),
    legs: f.turns.map((t) => ({
      turn: t.index,
      offset: m(t.offset),
      atContactPlane: t.legs.map((l) => m(l.x)),
      aboveAndBelow: t.legs.map((l) => [m(l.upper), m(l.lower)]),
      roomToDrawIn: t.room.map(m),
    })),
    wedge: {
      reachAlongAcuteBisector: m(f.reach[0]),
      reachAlongObtuseBisector: m(f.reach[1]),
      bearsOnWedge: f.wedgeBlocked,
    },
    transverseTurns: f.lengths.map((l, i) => ({
      turn: i + 1,
      stackOffset: m(i * f.base.cord.width),
      length: m(l),
      contactTurning: f.route
        ? {
            legBundles: v7RoundNumber(f.route.turning[0] + f.route.turning[1]),
            wedge: v7RoundNumber(f.route.turning[2]),
          }
        : null,
      centerline: v7Json(keep(f.lines[i] ?? [])),
    })),
    minimumClearance: m(f.clearance),
    minimumLegGap: m(f.legGap),
    travelDown: m(f.travel),
    travelUp: m(f.travelUp),
    routingOpening: 2 * K.OPENING,
    closurePath: m(f.base.closurePath),
    formPath: m(f.base.formPath),
    tailNeed: m(f.base.tailNeed),
    stages: f.stages.map((s) => ({
      stage: s.stage,
      occupied: m(s.occupied),
      need: m(s.need),
    })),
    need: m(f.need),
    limitingStage: f.worst?.stage ?? null,
    shortfall: f.code === 'too-short' ? m(f.need - f.base.cord.overall) : 0,
    tails: m(f.tails),
    fits: f.code === null,
    problem: f.problem,
  };
}

/** The frapped tension model: multi-turn-contact@1's model with each turn's uniform increment from the
 * transverse turns written as a negative creep loss, so its tension, load, creep and wear rules apply. */
function frappedModel(model: Model, extra: number[]): Model {
  return {
    ...model,
    turns: model.turns.map((t, k) => ({
      ...t,
      loss: t.loss - (extra[k] ?? 0),
    })),
  };
}
/** Closure ends: end 1 leaves the first turn; end 2 carries the transverse turns' 5 N exit or the
 * outer turn's end tension, whichever is larger. */
const closureEnds = (rest: Tensions, exit: number): [number, number] => [
  rest.ends[0],
  Math.max(rest.ends[1], exit),
];
const peakOf = (rest: Tensions, exit: number) => Math.max(rest.max, exit);

/** Writes the cord's transverse-turn record; frapped takes the bound role, keeping other cord operations off it. */
function writeFrap(w: V7World, s: V7Stack, state: State, data: V7Data) {
  const k = recOf(s);
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
      trials: trialsOf(s),
      evidence: strings(k.evidence),
      last: k.last ?? null,
      ...data,
      state,
      updatedAt: w.tick,
    },
  };
}
/** Sets the lashing relation's state on its three items (hand-lash-crossing@1 treats it as not its own
 * retained lashing) and the cord's role: bound while frapped, its prior role while open in the hands. */
function writeLashing(
  w: V7World,
  parts: Parts,
  state: string,
  workId: string | null,
) {
  for (const s of listOf(parts)) {
    const k = M.recOf(s);
    if (!s.processing?.[M.KEY]) continue;
    s.processing[M.KEY] = { ...k, state, workId, updatedAt: w.tick };
    if (s === parts.cord) {
      const prior = typeof k.priorRole === 'string' ? k.priorRole : 'cord';
      F.part(s).role = state === FRAPPED ? 'bound' : prior;
    }
  }
}
/** The transverse turns are off the cord: it keeps its trials and evidence only. */
function clearFrap(w: V7World, s: V7Stack, last: string) {
  if (!s.processing?.[KEY]) return;
  writeFrap(w, s, 'separate', {
    bindingId: null,
    workId: null,
    frapCount: 0,
    routedFraps: 0,
    remainingFraps: 0,
    remainingTurns: 0,
    geometry: null,
    model: null,
    frap: null,
    pose: null,
    last,
  });
}
/** All three items come free: the lashing is gone, the cord lies straight and the pieces are released. */
function separate(w: V7World, parts: Parts, last: string) {
  for (const s of listOf(parts)) {
    delete s.reservedFor;
    if (s === parts.cord) {
      M.freeCord(w, s, last);
      clearFrap(w, s, last);
    } else M.freePiece(w, s, last);
  }
}
function addEvidence(w: V7World, cord: V7Stack | undefined) {
  const id = w.events.at(-1)?.id;
  if (!cord || !id || !cord.processing?.[KEY]) return;
  const k = recOf(cord);
  k.evidence = [...strings(k.evidence), id].slice(-16);
}

/** The cord's centreline ledger in its state; the ends take the rest. */
function ledger(cord: V7Stack) {
  const k = recOf(cord),
    g = record(k.geometry),
    state = stateOf(cord),
    L = Number(F.part(cord).overall),
    model = M.modelOf(k),
    wrap = num(g.baseWrap) + num(g.baseSlack),
    lengths = records(g.transverseTurns).map((t) => num(t.length)),
    shown =
      state === 'routed'
        ? num(k.routedFraps)
        : state === 'opened'
          ? num(k.remainingFraps)
          : state === 'frapped'
            ? lengths.length
            : 0,
    closed = state === 'frapped',
    creep =
      model && closed
        ? sum(model.turns.map((t) => t.slack)) - num(g.baseSlack)
        : 0,
    used =
      state === 'separate'
        ? 0
        : wrap +
          Math.max(0, creep) +
          (shown ? num(g.travelDown) + sum(lengths.slice(0, shown)) : 0) +
          (closed
            ? num(g.bridgePerEnd) + num(g.travelUp) + 2 * num(g.closurePath)
            : state === 'routed'
              ? 2 * K.OPENING
              : 0),
    free = L - used,
    first = used ? m(free / 2) : m(L);
  return {
    baseTurns: m(wrap),
    transverseTurns: m(sum(lengths.slice(0, shown))),
    travel: shown ? m(num(g.travelDown) + (closed ? num(g.travelUp) : 0)) : 0,
    closure: closed ? m(num(g.closurePath)) : 0,
    tails: [first, m(free - first)],
  };
}
const label = (cord: V7Stack | undefined) => {
  if (!cord) return 'separate';
  const state = stateOf(cord),
    last = str(recOf(cord).last),
    trial = trialsOf(cord).at(-1);
  if (state === 'frapped')
    return last === 'jammed'
      ? 'jammed'
      : trial?.outcome === 'held'
        ? 'held-at-recorded-load'
        : trial?.outcome === 'crossing-slipped'
          ? 'slipped-at-recorded-load'
          : 'frapped-untested';
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
/** Reusable visual metadata of the three conserved items; measured or simulated values only. An
 * assessment overlay is a measured route, never a completed frap. */
function view(
  w: V7World,
  parts: Parts,
  bindingId: string | null,
  overlay: V7Data | null = null,
): V7Data {
  const cord = parts.cord,
    k = cord ? recOf(cord) : {},
    lash = cord ? M.recOf(cord) : {},
    state = cord ? stateOf(cord) : 'separate',
    g = record(k.geometry),
    base = record(lash.geometry),
    pose = record(lash.pose),
    placed = typeof pose.x === 'number' && str(lash.bindingId) !== null,
    model = M.modelOf(k),
    rest = model && state === 'frapped' ? M.tensions(model) : null,
    frap = record(k.frap),
    planned = records(g.transverseTurns),
    shown =
      state === 'routed'
        ? num(k.routedFraps)
        : state === 'opened'
          ? num(k.remainingFraps)
          : state === 'frapped'
            ? planned.length
            : 0,
    baseShown =
      state === 'opened'
        ? num(k.remainingTurns)
        : str(lash.bindingId)
          ? num(base.wrapCount)
          : 0,
    book = cord && state !== 'separate' ? ledger(cord) : null,
    trial = cord ? trialsOf(cord).at(-1) : undefined,
    held = state === 'released' || state === 'routed' || state === 'opened';
  return {
    component: 'crossing-frapping',
    reuses: ['crossing-lashing', 'crossing-binding', 'fiber-cord', 'cord-knot'],
    provenance:
      'pieces, crossing pose and base turns drawn as the long-crossing-lashing.ts crossing-lashing view (its 13-point turn centrelines); cord from long-fiber-cord.ts FIBER_CORD.view; transverse turns from transverse-contact@1',
    law: LAW,
    method: METHOD,
    bindingId,
    workId: str(k.workId),
    state,
    status: label(cord),
    // A completed appearance needs every transverse turn, the closure and the passed release check.
    completedAppearance: state === 'frapped',
    schematic: true,
    frame:
      'x along the acute bisector (normal to the base turns), y along the obtuse bisector, z up from the contact of the pieces',
    crossing: placed
      ? {
          point: { x: num(pose.x), y: num(pose.y) },
          crossingAngle: num(base.crossingAngle),
          topDirection: num(pose.orientation),
          shiftAlongTop: m(num(lash.crossingShift)),
        }
      : null,
    pieces: [parts.top, parts.bottom].map((s, i) =>
      s
        ? {
            item: s.id,
            part: i ? 'bottom' : 'top',
            drawAs: i ? 'outlined' : 'solid',
            color: F.material(w, s.resource)?.color ?? '#8d704e',
            diameter: numbers(base.pieceDiameters)[i] ?? null,
            condition: v7RoundNumber(M.measurePiece(w, s)?.condition ?? 1),
            broken: M.recOf(s).broken === true,
          }
        : null,
    ),
    baseTurns: {
      count: baseShown,
      state: held
        ? 'held-by-hand'
        : rest
          ? 'snug'
          : state === 'frapped'
            ? 'slack'
            : baseShown
              ? 'lashed'
              : 'none',
      centerlines: v7Json(
        (Array.isArray(lash.points) ? lash.points : []).slice(0, baseShown),
      ),
      slack: model ? model.turns.map((t) => m(Math.max(0, t.slack))) : null,
      migration: model ? model.turns.map((t) => m(t.migration)) : null,
      drawnIn: state === 'frapped' ? v7Json(frap.deflection ?? null) : null,
    },
    transverse: {
      planned: planned.length,
      shown,
      turns: planned.slice(0, shown).map((t, i) => ({
        turn: i + 1,
        length: t.length ?? null,
        state:
          state === 'frapped'
            ? 'snugged-under-closure'
            : state === 'routed'
              ? i + 1 < shown
                ? 'snugged-pinned-by-next'
                : 'snugged-held-by-hand'
              : 'held-open-by-hand',
        centerline: t.centerline ?? null,
      })),
    },
    closure:
      state === 'frapped'
        ? 'tied-over-transverse-turns'
        : held
          ? 'open'
          : str(lash.bindingId)
            ? 'original-overhand'
            : 'none',
    ledger: book,
    cord: cord
      ? {
          item: cord.id,
          condition: v7RoundNumber(F.conditionOf(cord)),
          cord: F.view(w, cord),
        }
      : null,
    retention:
      state === 'frapped'
        ? rest && rest.max > 1e-9
          ? 'snug'
          : 'slack'
        : 'none',
    mechanics:
      state === 'frapped' ? { resolved: true, unvalidated: UNVALIDATED } : null,
    lastTrial: trial
      ? {
          direction: trial.direction ?? null,
          outcome: trial.outcome ?? null,
          achievedForce: trial.achievedForce ?? null,
          heldSeconds: trial.heldSeconds ?? null,
        }
      : null,
    overlay: overlay
      ? {
          kind: 'measured-route-not-tied',
          distinguished: true,
          ...overlay,
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
  j.mode === 'untie'
    ? untieStages(num(j.fraps), num(j.turns))
    : tieStages(num(j.fraps));
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
    frapCount: num(j.fraps),
    stage: str(j.lastStage) ?? 'reserved',
    nextStage: open(j) ? stageName(j, num(j.reached)) : null,
    completedRounds: j.completedWork,
    reachedStages: num(j.reached),
    remaining: j.remainingWork,
    paidEnergy: v7RoundNumber(j.paidEnergy),
    crossingAngle: num(j.angle),
    pieces: strings(j.pieces),
    cord: str(j.cord),
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
/** The actor's own lashing by exact id, all three items in possession, in the lashing state named. */
function ownLashing(
  c: V7ActionContext,
  states: string[],
  free = true,
): Parts & { id: string } {
  const id = v7String(c.action.args.bindingId, 'bindingId'),
    parts = M.members(c.world, id),
    list = listOf(parts);
  if (
    list.length !== 3 ||
    list.some((s) => s.owner !== c.actor.id) ||
    !parts.cord ||
    !states.includes(str(M.recOf(parts.cord).state) ?? '')
  )
    throw new Error(
      states.includes(FRAPPED) && states.length === 1
        ? 'bindingId must be the exact id of a frapped lashing of your own two pieces and cord, all in your possession; nothing was spent.'
        : 'bindingId must be the exact id of a dressed hand-lash-crossing lashing of your own two pieces and cord, all in your possession and not yet frapped; nothing was spent.',
    );
  if (free && list.some((s) => s.reservedFor !== id))
    throw new Error(
      'This lashing is held by unfinished work; nothing was spent.',
    );
  return { ...parts, id };
}
const frapCount = (c: V7ActionContext) => {
  const n = v7Number(
    c.action.args.frapCount,
    'frapCount',
    FRAPS.min,
    FRAPS.max,
  );
  if (!Number.isSafeInteger(n))
    throw new Error(
      'frapCount must be a whole number of transverse turns from 1 to 3; nothing was spent.',
    );
  return n;
};
/** Static friction laws of the contacts: cord on cord (cord-bend@1) and cord on bark (crossing-contact@1). */
function frictions(cord: V7Stack): [number, number] {
  const cc = B.friction(cord, cord),
    bark = X.BARK[cord.resource];
  if (cc === null || bark === undefined)
    throw new Error(
      `Unsupported material: no cord-on-cord or cord-on-bark friction law exists for ${cord.resource}; nothing was spent.`,
    );
  return [cc, bark];
}
/** Bounded verified finding keyed by material, geometry, condition and measured outcome, not by the ability name. */
function remember(
  c: V7ActionContext,
  kind: string,
  cord: V7Stack,
  pieces: V7Stack[],
  turns: number,
  fraps: number,
  angle: number,
  outcome: string,
  value: V7Data,
  method: string,
  verified = true,
) {
  const width = mm(2 * Number(F.part(cord).plyDiameter)),
    sizes = pieces.map((s) => {
      const p = M.measurePiece(c.world, s);
      return p ? mm(p.diameter) : 0;
    });
  openRemember(c, {
    key: `${kind}:${cord.resource}-${String(width)}mm:${pieces[0]?.resource ?? 'piece'}-${sizes.join('-')}mm:${String(angle)}deg:${String(turns)}-turns:${String(fraps)}-transverse:${outcome}`,
    subject: cord.resource,
    property: `${kind} of ${String(fraps)} transverse turn(s) over ${String(turns)} adjacent turns of a ${String(width)} mm two-ply cord round a ${String(angle)} degree crossing of ${sizes.join(' mm and ')} mm pieces`,
    value: v7Json({
      outcome,
      items: [...pieces.map((s) => s.id), cord.id],
      tick: c.world.tick,
      ...value,
    }),
    method,
    condition:
      'bare hands on dry footing; the lashing cord itself, no tool, anchor, added cord or second person',
    verified,
  });
}

/** Releases the work once: a lashing still closed keeps the relation; anything open in the hands falls loose. */
function release(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  reason: string,
  ground: boolean,
) {
  const parts = held(w, j),
    reached = num(j.reached),
    retained = j.mode === 'attempt' ? reached <= 1 : reached === 0,
    id = str(j.binding);
  j.x = a.position.x;
  j.y = a.position.y;
  workStop(w, a, j, reason, ground);
  if (retained && id) {
    for (const s of listOf(parts)) {
      s.reservedFor = id;
      if (s.processing?.[M.KEY]) M.recOf(s).workId = null;
    }
    if (parts.cord && j.mode === 'attempt')
      clearFrap(w, parts.cord, 'released');
    if (parts.cord && j.mode === 'untie') recOf(parts.cord).workId = null;
  } else
    separate(
      w,
      parts,
      j.mode === 'untie'
        ? 'untied-turns-fell-open'
        : 'released-turns-fell-loose',
    );
  return {
    parts,
    retained,
    relaxed: retained
      ? null
      : 'Released without hands, the open closure let every transverse and base turn fall loose: both pieces and the cord are free, and the lashing is gone.',
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
/** A closed lashing waits uncharged; turns open in the hands cannot wait and fall loose. */
function pause(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
): V7HandlerResult {
  if (j.mode === 'attempt' ? num(j.reached) >= 2 : num(j.reached) >= 1)
    return stop(c, j, `${reason} The turns open in the hands could not wait.`);
  j.status = 'paused';
  j.reason = reason;
  c.emit(
    `${PREFIX}paused`,
    `${reason} Paid stages and the reserved items are kept; nothing was spent.`,
    { ...summary(c.world, j), requiredEnergy: STEP },
    str(j.binding) ?? j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id] };
}
function finish(
  c: V7ActionContext,
  j: CollectiveWork,
  parts: Parts,
  kept: boolean,
): V7HandlerResult {
  const id = str(j.binding);
  for (const s of listOf(parts)) {
    if (kept && id) s.reservedFor = id;
    else delete s.reservedFor;
    if (s.processing?.[M.KEY]) M.recOf(s).workId = null;
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

/** The live measured plan of the work's items: the lashing's own planner on the live pieces and cord. */
function measure(
  w: V7World,
  a: V7Actor,
  parts: Parts,
  angle: number,
  turns: number,
  fraps: number,
  proposed: boolean,
  delta?: [number, number],
): { f: Frap; model: Model | null; mc: Cord } | null {
  const { top, bottom, cord } = parts,
    pt = top ? M.measurePiece(w, top) : null,
    pb = bottom ? M.measurePiece(w, bottom) : null,
    mc = cord ? X.measureCord(w, cord) : null;
  if (!cord || !pt || !pb || !mc) return null;
  const cc = B.friction(cord, cord),
    bark = X.BARK[cord.resource];
  if (cc === null || bark === undefined) return null;
  const model = proposed ? null : M.modelOf(M.recOf(cord)),
    slack = model ? sum(model.turns.map((t) => Math.max(0, t.slack))) : 0,
    base = M.plan(a, pt, pb, mc, angle, turns);
  return {
    f: frapPlan(base, fraps, slack, proposed, cc, bark, delta),
    model,
    mc,
  };
}
/** A measured limit ends the work at this paid stage; the items stay as they actually are. */
function infeasible(
  c: V7ActionContext,
  j: CollectiveWork,
  f: Frap,
  stage: string,
  code: string,
  problem: string,
  before: V7Data,
): V7HandlerResult {
  const { parts, relaxed, retained } = release(
    c.world,
    c.actor,
    j,
    `Measured at ${stage}: ${problem}. The items are left as they actually are; the round's energy is not refunded.`,
    false,
  );
  const measured = describe(f);
  if (parts.cord && !retained) recOf(parts.cord).last = `infeasible-${code}`;
  remember(
    c,
    'frapping-fit',
    f.base.cord.stack,
    [f.base.top.stack, f.base.bottom.stack],
    f.base.count,
    f.count,
    f.base.angle,
    `shortfall-${code}`,
    { workId: j.id, stage, problem, measured },
    `${String(j.completedWork)} paid round(s) of bare-hand measuring and routing on the lashing`,
  );
  c.emit(
    `${PREFIX}shortfall`,
    `Measured at ${stage}: ${problem}. No transverse turn was completed; ${retained ? 'the lashing stays closed as it was' : 'the open turns fell loose and the items are free'}, and nothing is refunded.`,
    {
      ...summary(c.world, j),
      operation: stage,
      outcome: code,
      problem,
      measuredShortfall: true,
      measured,
      before,
      after: view(c.world, parts, retained ? str(j.binding) : null, {
        route: measured.transverseTurns ?? null,
        shortfall: measured.shortfall ?? null,
      }),
    },
    str(j.binding) ?? j.id,
  );
  if (relaxed) relaxedEvent(emitter(c), c.world, j, relaxed);
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}
/** The closure resists opening: hand-lash-crossing@1's jam and condition rules for its untie. */
function resists(cord: V7Stack): string | null {
  const g = record(M.recOf(cord).geometry),
    conformity = Math.min(
      1,
      num(g.width) / Math.max(1e-9, num(g.closureRadius)),
    ),
    loaded = [...M.trialsOf(cord), ...trialsOf(cord)].some(
      (t) => num(t.loadShare) >= F.ONSET,
    );
  if (conformity >= 1 - 1e-9 && loaded)
    return 'the closure hugs the other end and was pressed into it by an earlier load above half the breaking force, so the fingers cannot draw the end back';
  if (F.conditionOf(cord) < F.SOUND)
    return 'too many strands at the closure are broken to draw the end back without parting them';
  return null;
}
function resisted(
  c: V7ActionContext,
  j: CollectiveWork,
  parts: Parts,
  stage: string,
  problem: string,
  before: V7Data,
): V7HandlerResult {
  const cord = parts.cord as V7Stack,
    jammed = problem.startsWith('the closure hugs');
  release(
    c.world,
    c.actor,
    j,
    `The closure resisted opening: ${problem}. It stays as it is; nothing is refunded.`,
    false,
  );
  if (j.mode === 'untie') recOf(cord).last = jammed ? 'jammed' : 'damaged';
  remember(
    c,
    j.mode === 'untie' ? 'frapped-untie' : 'frapping-closure-release',
    cord,
    [parts.top, parts.bottom].filter((s): s is V7Stack => !!s),
    num(j.turns),
    num(j.fraps),
    num(j.angle),
    jammed ? 'jammed' : 'damaged',
    { bindingId: str(j.binding), problem, condition: F.conditionOf(cord) },
    'a paid bare-hand round drawing the closure end back',
  );
  c.emit(
    `${PREFIX}resisted`,
    `The closure resisted opening: ${problem}. The lashing stays as it is; nothing is refunded.`,
    {
      ...summary(c.world, j),
      operation: stage,
      outcome: jammed ? 'jammed' : 'damaged',
      problem,
      before,
      condition: F.conditionOf(cord),
    },
    str(j.binding) ?? j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

/** One paid attempt stage on the re-read items: measure and plan, release the closure, route and snug
 * one transverse turn, or close, dress and check. */
function tie(
  c: V7ActionContext,
  j: CollectiveWork,
  parts: Parts,
): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    n = num(j.reached),
    fraps = num(j.fraps),
    count = num(j.turns),
    stage = tieStages(fraps)[n] ?? '',
    { top, bottom, cord } = parts,
    before = view(w, parts, str(j.binding));
  j.lastStage = stage;
  const live = measure(w, a, parts, num(j.angle), count, fraps, false);
  if (!top || !bottom || !cord || !live)
    return stop(
      c,
      j,
      'A piece or the cord has no measurable geometry or friction law.',
    );
  const { f } = live;
  if (n === 0) {
    if (f.code)
      return infeasible(c, j, f, stage, f.code, f.problem ?? '', before);
    j.fit = describe(f);
    j.reached = 1;
    j.remainingWork = tieStages(fraps).length - 1;
    writeFrap(w, cord, 'separate', {
      bindingId: str(j.binding),
      workId: j.id,
      frapCount: fraps,
      routedFraps: 0,
      geometry: describe(f),
      last: null,
    });
    remember(
      c,
      'frapping-fit',
      cord,
      [top, bottom],
      count,
      fraps,
      f.base.angle,
      'fits',
      { workId: j.id, measured: describe(f) },
      'a paid bare-hand measuring round on the closed lashing',
    );
    return progress(
      c,
      j,
      'measured',
      stage,
      before,
      { measured: describe(f) },
      `the closed ${String(count)}-turn lashing was measured for ${String(fraps)} transverse turn(s): each leg bundle can be drawn in by up to ${String(m(Math.min(...f.turns.flatMap((t) => t.room))))} m, the turns need ${f.lengths.map((l) => String(m(l))).join(' + ')} m and the whole work ${String(m(f.need))} m of the ${String(m(f.base.cord.overall))} m cord. Nothing was changed.`,
    );
  }
  if (f.code)
    return infeasible(
      c,
      j,
      f,
      stage,
      'geometry-changed',
      f.problem ?? '',
      before,
    );
  if (n === 1) {
    const problem = resists(cord);
    if (problem) return resisted(c, j, parts, stage, problem, before);
    writeLashing(w, parts, HELD, j.id);
    writeFrap(w, cord, 'released', {
      bindingId: str(j.binding),
      workId: j.id,
      geometry: describe(f),
      pose: v7Json(record(j.pose)),
    });
    j.reached = 2;
    j.remainingWork = tieStages(fraps).length - 2;
    return progress(
      c,
      j,
      'closure-released',
      stage,
      before,
      { releasedEnds: 2 },
      `the overhand closure was drawn open while one hand pinned the ${String(count)} turns round the crossing; the turns are held only by hand.`,
    );
  }
  if (n <= fraps + 1) {
    const k = n - 1,
      routing = f.stages.find((s) => s.stage === `route-frap-${String(k)}`),
      ends = (f.base.cord.overall - (routing?.occupied ?? Infinity)) / 2;
    if (ends < K.PINCH - 1e-9)
      return infeasible(
        c,
        j,
        f,
        stage,
        'end-too-short',
        `routing transverse turn ${String(k)} leaves ${String(m(Math.max(0, ends)))} m at each end; holding an end needs ${String(K.PINCH)} m`,
        before,
      );
    writeFrap(w, cord, 'routed', { routedFraps: k, geometry: describe(f) });
    j.reached = n + 1;
    j.remainingWork = tieStages(fraps).length - j.reached;
    const s = f.snugs[k - 1],
      data = {
        transverseTurn: k,
        turnLength: m(f.lengths[k - 1] ?? 0),
        stackOffset: m((k - 1) * f.base.cord.width),
        routeRadius: m(f.radius),
        snuggingPull: B.DRESS,
        tensionAtExit: s ? F.newtons(s.exit) : null,
        tensionAtStart: s ? F.newtons(s.start) : null,
        effectiveContact: s ? s.contact.map(v7RoundNumber) : null,
        endsBeyondTurns: m(ends),
      };
    progress(
      c,
      j,
      'turn-routed',
      stage,
      before,
      data,
      `the end was passed between the pieces round both leg bundles for transverse turn ${String(k)} of ${String(fraps)} (${String(data.turnLength)} m), held by hand with ${String(m(ends))} m at each end.`,
    );
    return progress(
      c,
      j,
      'turn-snugged',
      stage,
      view(w, parts, str(j.binding)),
      data,
      `transverse turn ${String(k)} was snugged with the ${String(B.DRESS)} N hand pull at its exit; it falls to ${String(data.tensionAtStart)} N round the turn by friction. The base turns are still open in the hands; nothing holds without them.`,
    );
  }
  return close(c, j, parts, live.model, live.mc, f, before);
}
/** The closing round: re-form the overhand over the transverse turns, dress both ends, draw the legs in
 * and check the release. A slipping closure, a short tail or a cord too weak for the tension opens it. */
function close(
  c: V7ActionContext,
  j: CollectiveWork,
  parts: Parts,
  model: Model | null,
  mc: Cord,
  f: Frap,
  before: V7Data,
): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    { top, bottom } = parts,
    cord = parts.cord as V7Stack,
    stage = 'close-dress-release-check',
    fraps = num(j.fraps),
    count = num(j.turns),
    load = model ? M.cordLoad(w, cord, model) : null;
  if (!model || !load || !top || !bottom)
    return stop(c, j, 'The lashing has no tension model or strand law.');
  const drawn = drawIn(
    f.turns,
    model,
    load.stiffness,
    f.base.pitch,
    f.push,
    f.base.cord.width / 2,
  );
  if (!drawn)
    return stop(
      c,
      j,
      'The drawn-in legs could not be resolved against the pieces.',
    );
  const after = measure(
      w,
      a,
      parts,
      num(j.angle),
      count,
      fraps,
      false,
      drawn.deflection,
    ),
    g = after?.f ?? f,
    frapped = frappedModel(model, drawn.extra),
    rest = M.tensions(frapped),
    ends = closureEnds(rest, B.DRESS),
    peak = peakOf(rest, B.DRESS),
    slip = X.closureSlip(cord, mc.width, f.base.closureRadius),
    short = g.tails < f.base.tailNeed - 1e-9,
    slips =
      slip === undefined ||
      (slip !== null && slip <= Math.max(...ends, B.DRESS)),
    broke = load.strength <= peak,
    outcome = broke
      ? 'cord-broke'
      : short
        ? 'tail-slipped'
        : slips
          ? 'closure-slipped'
          : 'release-held',
    ok = outcome === 'release-held',
    unfrapped = M.tensions(model),
    value = {
      frapCount: fraps,
      transverseTurns: g.lengths.map(m),
      drawnInRoute: g.lengths.map(m),
      plannedRoute: f.lengths.map(m),
      travel: [m(f.travel), m(f.travelUp)],
      tails: [m(g.tails), m(g.tails)],
      tailNeeded: m(f.base.tailNeed),
      dressingPull: B.DRESS,
      cordOnCordFriction: B.friction(cord, cord),
      cordOnBarkFriction: X.BARK[cord.resource] ?? null,
      transversePush: f.push.map(F.newtons),
      transverseTensions: f.snugs.map((s) => [
        F.newtons(s.start),
        F.newtons(s.exit),
      ]),
      wedgeForce: F.newtons(sum(f.snugs.map((s) => s.wedge))),
      legDeflection: drawn.deflection.map(m),
      bundleBearsOnPieces: drawn.bottomed,
      turnIncrements: drawn.extra.map(F.newtons),
      turnTensionsBefore: M.turnText(unfrapped),
      turnTensions: M.turnText(rest),
      endTensions: ends.map(F.newtons),
      peakTension: F.newtons(peak),
      breakingForce: F.newtons(load.strength),
      closureSlipLoad:
        slip === null || slip === undefined ? null : F.newtons(slip),
      selfLocking: slip === null,
      unvalidated: UNVALIDATED,
    },
    frap: V7Data = {
      count: fraps,
      deflection: drawn.deflection.map(m),
      bottomed: drawn.bottomed,
      increments: drawn.extra.map(v7RoundNumber),
      push: f.push.map(v7RoundNumber),
      transverse: f.snugs.map((s) => ({
        start: v7RoundNumber(s.start),
        exit: v7RoundNumber(s.exit),
      })),
      exit: B.DRESS,
    };
  let outputs: V7Stack[] = [];
  if (ok) {
    writeLashing(w, parts, FRAPPED, null);
    writeFrap(w, cord, 'frapped', {
      bindingId: str(j.binding),
      workId: null,
      frapCount: fraps,
      routedFraps: fraps,
      geometry: describe(g),
      model: M.modelJson(frapped),
      frap,
      at: { ...a.position },
      frappedAt: w.tick,
      last: 'release-held',
    });
  } else if (broke) {
    outputs = breakCord(
      w,
      a.position,
      cord,
      frapped,
      rest,
      describe(g),
      M.trialsOf(cord),
      [g.tails, g.tails],
    );
    separate(w, { top, bottom }, 'broke-cord-parted');
  } else
    separate(
      w,
      parts,
      short ? 'released-tail-slipped-out' : 'released-closure-slipped',
    );
  remember(
    c,
    'frapping-fit',
    outputs[0] ?? cord,
    [top, bottom],
    count,
    fraps,
    f.base.angle,
    ok ? 'release-held' : `release-failed-${outcome}`,
    { workId: j.id, ...value },
    `${String(j.completedWork)} paid rounds of measuring, opening the closure, ${String(fraps)} transverse turn(s), closing, dressing and a release check`,
  );
  j.reached = tieStages(fraps).length;
  const data: V7Data = {
    ...summary(w, j),
    round: j.completedWork,
    operation: stage,
    stageStarted: true,
    stageCompleted: true,
    outcome,
    before,
    ...value,
    fragments: outputs.map((s) => s.id),
  };
  const done = finish(c, j, outputs.length ? { top, bottom } : parts, ok);
  if (outputs.length)
    done.writes = [...done.writes, ...outputs.map((s) => s.id)];
  data.status = j.status;
  data.nextStage = null;
  data.after = view(
    w,
    outputs.length ? { top, bottom } : parts,
    ok ? str(j.binding) : null,
  );
  data.visual = data.after;
  c.emit(
    ok ? `${PREFIX}release-held` : `${PREFIX}release-failed`,
    ok
      ? `Closed and dressed over ${String(fraps)} transverse turn(s): the legs were drawn in ${drawn.deflection.map((d) => String(m(d))).join(' and ')} m and the base turns' tension rose by ${drawn.extra.map((x) => String(F.newtons(x))).join(', ')} N, as computed; the closure held. Its load behavior is untested; it is no rated lashing and gives no shelter.`
      : outcome === 'cord-broke'
        ? `The cord parted under ${String(F.newtons(peak))} N while dressing over the transverse turns, into two owned fragments; both pieces are free.`
        : outcome === 'tail-slipped'
          ? 'A tail was shorter than the closure needs and slipped out; every turn fell loose and both pieces and the cord are free.'
          : `The closure did not keep the ${String(F.newtons(Math.max(...ends)))} N end tension it now carries; it slipped, every turn fell loose and both pieces and the cord are free.`,
    data,
    str(j.binding) ?? j.id,
  );
  if (outcome === 'closure-slipped' || outcome === 'tail-slipped')
    c.emit(
      `${PREFIX}closure-slipped`,
      'The closure slipped while dressing; all three items are conserved.',
      data,
      str(j.binding) ?? j.id,
    );
  if (outcome === 'cord-broke')
    c.emit(
      `${PREFIX}broken`,
      'Broken while dressing: two owned fragments keep all of the cord; both pieces are free and nothing vanished.',
      data,
      str(j.binding) ?? j.id,
    );
  if (ok) addEvidence(c.world, cord);
  return done;
}

/** One paid untie stage: withdraw the closure end, unwind one transverse turn per round, then one base turn per round. */
function untie(
  c: V7ActionContext,
  j: CollectiveWork,
  parts: Parts,
): V7HandlerResult {
  const w = c.world,
    n = num(j.reached),
    fraps = num(j.fraps),
    count = num(j.turns),
    stage = untieStages(fraps, count)[n] ?? '',
    { top, bottom, cord } = parts,
    before = view(w, parts, str(j.binding));
  j.lastStage = stage;
  if (!top || !bottom || !cord)
    return stop(c, j, 'A reserved piece or the cord is missing.');
  const cond = F.conditionOf(cord);
  if (n === 0) {
    const problem = resists(cord);
    if (problem) return resisted(c, j, parts, stage, problem, before);
    writeLashing(w, parts, HELD, j.id);
    writeFrap(w, cord, 'opened', {
      workId: j.id,
      remainingFraps: fraps,
      remainingTurns: count,
      last: 'closure-withdrawn',
    });
    j.reached = 1;
    j.remainingWork = untieStages(fraps, count).length - 1;
    return progress(
      c,
      j,
      'closure-withdrawn',
      stage,
      before,
      {},
      `the tucked end was drawn back out of the closure; ${String(fraps)} transverse and ${String(count)} base turns are held round the crossing by hand.`,
    );
  }
  const last = untieStages(fraps, count).length - 1;
  if (n < last) {
    const k = recOf(cord),
      frapsLeft = Math.max(0, fraps - n),
      turnsLeft = n <= fraps ? count : count - (n - fraps);
    writeFrap(w, cord, 'opened', {
      remainingFraps: frapsLeft,
      remainingTurns: turnsLeft,
      last: k.last ?? null,
    });
    j.reached = n + 1;
    j.remainingWork = untieStages(fraps, count).length - j.reached;
    return progress(
      c,
      j,
      n <= fraps ? 'frap-unwrapped' : 'turn-unwrapped',
      stage,
      before,
      { remainingTransverse: frapsLeft, remainingTurns: turnsLeft },
      n <= fraps
        ? `one transverse turn was unwound from between the pieces; ${String(frapsLeft)} transverse and ${String(turnsLeft)} base turn(s) remain in the hands.`
        : `one base turn was unwound from the crossing; ${String(turnsLeft)} open turn(s) remain in the hands.`,
    );
  }
  separate(w, parts, 'untied');
  remember(
    c,
    'frapped-untie',
    cord,
    [top, bottom],
    count,
    fraps,
    num(j.angle),
    'untied',
    { bindingId: str(j.binding), condition: cond },
    `${String(last + 1)} paid bare-hand untying rounds`,
  );
  j.reached = untieStages(fraps, count).length;
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
    'Untied: the closure was withdrawn and every transverse and base turn unwound; both pieces and the same cord are free, and any set from bending, creep or damage is not undone.',
    data,
    str(j.binding) ?? j.id,
  );
  return done;
}

/** One paid round after rechecking the reserved items, hands, footing, room, layout and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const w = c.world,
    a = c.actor;
  if (!open(j)) throw new Error('This frapping work is already settled.');
  const parts = held(w, j),
    list = listOf(parts);
  if (
    list.length !== 3 ||
    list.some((s) => s.reservedFor !== j.id || s.owner !== a.id)
  )
    return stop(c, j, 'A reserved piece or the cord is missing.');
  const cord = parts.cord as V7Stack,
    pieces = [parts.top, parts.bottom].flatMap((s) => {
      const p = s ? M.measurePiece(w, s) : null;
      return p ? [p] : [];
    });
  if (pieces.length !== 2)
    return stop(c, j, 'A piece no longer has a represented rigid-piece law.');
  if (j.mode === 'attempt' && F.conditionOf(cord) < F.SOUND)
    return stop(
      c,
      j,
      'More than half of the strands of the cord are now broken; it cannot be bent round the turns.',
    );
  const reached = num(j.reached),
    pose = record(j.pose),
    handHeld = j.mode === 'attempt' ? reached >= 2 : reached >= 1,
    moved =
      reached >= 1 &&
      typeof pose.x === 'number' &&
      Math.hypot(a.position.x - num(pose.x), a.position.y - num(pose.y)) > 1e-6;
  // Turns open in the hands cannot be carried away; a closed lashing is simply laid out again.
  if (moved && handHeld)
    return stop(c, j, 'The crossing was carried from where it was worked.');
  const lay = X.space(
    w,
    a,
    pieces,
    num(j.angle),
    handHeld && !moved ? num(pose.orientation) : null,
  );
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
  if (!handHeld)
    j.pose = {
      x: a.position.x,
      y: a.position.y,
      orientation: lay.orientation ?? 0,
    };
  if (resumed)
    c.emit(
      `${PREFIX}resumed`,
      'Unfinished frapping work resumed by workId after rechecking the pieces, the cord, hands, footing, room and energy; earlier paid rounds are kept and the route is measured again.',
      summary(w, j),
      str(j.binding) ?? j.id,
    );
  return j.mode === 'untie' ? untie(c, j, parts) : tie(c, j, parts);
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
  if (s.processing?.[M.KEY]) M.recOf(s).workId = j.id;
}
function guard(
  c: V7ActionContext,
  pieces: Piece[],
  angle: number,
  cost: number,
) {
  const lay = X.space(c.world, c.actor, pieces, angle, null);
  if (lay.blocked)
    throw new Error(`No room to work: ${lay.blocked}. Nothing was spent.`);
  if (c.actor.vitals.energy < cost)
    throw new Error(
      'Not enough energy for the first paid round; nothing was reserved.',
    );
}
function noWork(c: V7ActionContext) {
  if (current(c.world, c.actor))
    throw new Error(
      'Unfinished frapping work exists; resume it with its mode and workId, or cancel it. Nothing was spent.',
    );
  if (c.action.args.workId !== undefined)
    throw new Error(
      'No unfinished frapping work of yours has this workId; nothing was spent.',
    );
}
const piecesOf = (w: V7World, parts: Parts) =>
  [parts.top, parts.bottom].flatMap((s) => {
    const p = s ? M.measurePiece(w, s) : null;
    return p ? [p] : [];
  });

function attempt(c: V7ActionContext): V7HandlerResult {
  const w = c.world;
  noWork(c);
  const b = ownLashing(c, ['bound', 'tucked']),
    cord = b.cord as V7Stack,
    k = M.recOf(cord),
    g = record(k.geometry),
    fraps = frapCount(c);
  if (k.state !== 'bound' || k.seated !== true || !M.modelOf(k))
    throw new Error(
      'This lashing is loose; dress it with hand-lash-crossing first. Nothing was spent.',
    );
  frictions(cord);
  if (F.conditionOf(cord) < F.SOUND)
    throw new Error(
      `More than half of the strands of ${cord.id} are broken; it cannot be bent round the turns. Nothing was spent.`,
    );
  const { tails } = M.ledger(cord);
  if (Math.min(...tails) < K.PINCH - 1e-9)
    throw new Error(
      `The tails are ${tails.join(' and ')} m; drawing the closure end back needs a ${String(K.PINCH)} m pinch. Nothing was spent.`,
    );
  const L = Number(F.part(cord).overall),
    low = least(cord, fraps);
  if (L < low - 1e-9)
    throw new Error(
      `The cord is ${String(m(L))} m; this lashing already takes ${String(m(L - Math.min(...tails) * 2 + 2 * num(g.tailNeed)))} m with its tails, and ${String(fraps)} transverse turn(s) need at least ${String(m(low))} m whatever the route (down to the contact plane and back, and each turn round both leg bundles). Nothing was spent.`,
    );
  const pieces = piecesOf(w, b);
  if (pieces.length !== 2)
    throw new Error('A piece has no represented geometry; nothing was spent.');
  guard(c, pieces, num(g.crossingAngle), STEP);
  const stages = tieStages(fraps),
    j = workCreate(c, 'attempt', stages.length);
  j.law = LAW;
  j.method = METHOD;
  j.binding = b.id;
  j.target = b.id;
  j.angle = num(g.crossingAngle);
  j.turns = num(g.wrapCount);
  j.fraps = fraps;
  j.reached = 0;
  j.pose = null;
  j.fit = null;
  j.lastStage = null;
  j.pieces = [b.top?.id ?? '', b.bottom?.id ?? ''];
  j.cord = cord.id;
  for (const s of listOf(b)) holdItem(c, j, s);
  c.emit(
    `${PREFIX}started`,
    `The lashed pieces and cord are reserved and held for ${String(fraps)} bare-hand transverse turn(s) with the lashing's own cord; no tool, anchor, added cord or second person is used.`,
    { ...summary(w, j), stageStarted: stages[0] ?? null },
    b.id,
  );
  return advance(c, j);
}

function startUntie(c: V7ActionContext): V7HandlerResult {
  const w = c.world;
  noWork(c);
  const b = ownLashing(c, [FRAPPED]),
    cord = b.cord as V7Stack,
    k = recOf(cord),
    g = M.recOf(cord),
    { tails } = ledger(cord);
  if (Math.min(...tails) < K.PINCH - 1e-9)
    throw new Error(
      `The tails are ${tails.join(' and ')} m; drawing an end back needs a ${String(K.PINCH)} m pinch. Nothing was spent.`,
    );
  const pieces = piecesOf(w, b),
    base = record(g.geometry);
  if (pieces.length !== 2)
    throw new Error('A piece has no represented geometry; nothing was spent.');
  guard(c, pieces, num(base.crossingAngle), STEP);
  const fraps = num(k.frapCount),
    count = num(base.wrapCount),
    j = workCreate(c, 'untie', untieStages(fraps, count).length);
  j.law = LAW;
  j.method = METHOD;
  j.binding = b.id;
  j.target = b.id;
  j.angle = num(base.crossingAngle);
  j.turns = count;
  j.fraps = fraps;
  j.reached = 0;
  j.pose = null;
  j.fit = v7Json(record(k.geometry));
  j.lastStage = null;
  j.pieces = [b.top?.id ?? '', b.bottom?.id ?? ''];
  j.cord = cord.id;
  for (const s of listOf(b)) holdItem(c, j, s);
  recOf(cord).workId = j.id;
  c.emit(
    `${PREFIX}started`,
    `The frapped pieces and cord are reserved and held for untying ${String(fraps)} transverse and ${String(count)} base turns with bare hands.`,
    { ...summary(w, j), stageStarted: untieStages(fraps, count)[0] ?? null },
    b.id,
  );
  return advance(c, j);
}

/** One paid round of positioning, route measurement and clearance checking; it ties and changes nothing. */
function assess(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    fraps = frapCount(c),
    existing = c.action.args.bindingId !== undefined;
  if (
    existing &&
    ['pieceIds', 'cordId', 'crossingAngle', 'wrapCount'].some(
      (x) => c.action.args[x] !== undefined,
    )
  )
    throw new Error(
      'Assess either an existing lashing by bindingId or a proposed crossing by pieceIds, cordId, crossingAngle and wrapCount; nothing was spent.',
    );
  let parts: Parts, angle: number, count: number, id: string | null;
  if (existing) {
    const b = ownLashing(c, ['bound', 'tucked']),
      g = record(M.recOf(b.cord as V7Stack).geometry);
    if (M.recOf(b.cord as V7Stack).state !== 'bound')
      throw new Error(
        'This lashing is loose; dress it with hand-lash-crossing first. Nothing was spent.',
      );
    parts = b;
    angle = num(g.crossingAngle);
    count = num(g.wrapCount);
    id = b.id;
  } else {
    const ids = M.pieceIds(c, null),
      cord = M.ownCord(c, null),
      [tid, bid] = ids;
    angle = v7Number(
      c.action.args.crossingAngle,
      'crossingAngle',
      X.ANGLE.min,
      X.ANGLE.max,
    );
    count = v7Number(
      c.action.args.wrapCount,
      'wrapCount',
      TURNS.min,
      TURNS.max,
    );
    if (!Number.isSafeInteger(count))
      throw new Error(
        'wrapCount must be a whole number of base turns from 2 to 4; nothing was spent.',
      );
    parts = {
      top: w.stacks.find((s) => s.id === tid),
      bottom: w.stacks.find((s) => s.id === bid),
      cord,
    };
    id = null;
  }
  const cord = parts.cord as V7Stack;
  frictions(cord);
  const pieces = piecesOf(w, parts);
  if (pieces.length !== 2)
    throw new Error('A piece has no represented geometry; nothing was spent.');
  guard(c, pieces, angle, ASSESS);
  const live = measure(w, a, parts, angle, count, fraps, !existing);
  if (!live)
    throw new Error('The cord has no measurable geometry; nothing was spent.');
  v7Spend(a, ASSESS);
  const { f } = live,
    measured = describe(f),
    outcome = f.code ? `shortfall-${f.code}` : 'fits';
  remember(
    c,
    'frapping-fit',
    cord,
    [parts.top, parts.bottom].filter((s): s is V7Stack => !!s),
    count,
    fraps,
    angle,
    outcome,
    { bindingId: id, measured, assessment: true },
    existing
      ? 'a paid bare-hand assessment of the closed lashing: positioning, route measurement and clearance checking'
      : 'a paid bare-hand assessment of the proposed crossing laid out by hand: positioning, route measurement and clearance checking; nothing was lashed',
  );
  c.emit(
    `${PREFIX}assessed`,
    f.code
      ? `Assessed ${String(fraps)} transverse turn(s) ${existing ? 'on this lashing' : 'on the proposed crossing'}: ${f.problem ?? ''}. Nothing was tied or changed.`
      : `Assessed ${String(fraps)} transverse turn(s) ${existing ? 'on this lashing' : 'on the proposed crossing'}: the measured route fits (${String(m(f.need))} m needed of ${String(m(f.base.cord.overall))} m at ${f.worst?.stage ?? ''}). Nothing was tied or changed, and no holding is implied.`,
    {
      mode: 'assess',
      bindingId: id,
      outcome,
      measuredShortfall: f.code !== null,
      limitingStage: f.worst?.stage ?? null,
      shortfall: measured.shortfall ?? null,
      measured,
      energy: ASSESS,
      visual: view(w, parts, id, {
        route: measured.transverseTurns ?? null,
        shortfall: measured.shortfall ?? null,
        limitingStage: f.worst?.stage ?? null,
      }),
    },
    id ?? cord.id,
  );
  return { complete: true, writes: [] };
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
      'No frapping work of yours has this workId; nothing was spent.',
    );
  const parts = j ? held(w, j) : ownLashing(c, [FRAPPED], false),
    id = j ? str(j.binding) : str(bindingId);
  if (listOf(parts).length !== 3)
    throw new Error(
      'The items of this work are no longer together; nothing was spent.',
    );
  v7Spend(a, LOOK);
  const cord = parts.cord as V7Stack,
    k = recOf(cord),
    state = stateOf(cord),
    model = M.modelOf(k),
    rest = model && state === 'frapped' ? M.tensions(model) : null,
    trials = trialsOf(cord),
    value: V7Data = {
      ...(j ? summary(w, j) : {}),
      bindingId: id,
      frapping: view(w, parts, id),
      cord: F.look(w, cord),
      pieces: [parts.top, parts.bottom].map((s) => {
        const p = s ? M.measurePiece(w, s) : null;
        return s && p
          ? {
              item: s.id,
              resource: s.resource,
              diameter: m(p.diameter),
              condition: v7RoundNumber(p.condition),
              visibleDamage:
                M.recOf(s).broken === true
                  ? 'broken'
                  : p.condition < 1
                    ? 'cracked fibres'
                    : 'none',
            }
          : null;
      }),
      ledger: {
        centreline: Number(F.part(cord).overall),
        ...(state === 'separate' ? {} : ledger(cord)),
      },
      transverseTurnsRound:
        state === 'frapped'
          ? num(k.frapCount)
          : state === 'routed'
            ? num(k.routedFraps)
            : state === 'opened'
              ? num(k.remainingFraps)
              : 0,
      visibleRetention:
        state === 'frapped'
          ? rest && rest.max > 1e-9
            ? 'snug round the crossing, closure tied over the transverse turns'
            : 'slack round the crossing'
          : state === 'separate'
            ? 'the original closure, no transverse turns'
            : 'open, held by hand',
      displacement: m(num(M.recOf(cord).crossingShift)),
      frappingTrials: trials,
      lastFrappingTrial: trials.at(-1) ?? null,
      holdingForce: null,
      unknown:
        'turn tensions, holding force, slip load, safe load and behavior under other loads are not determined by inspection',
    };
  openRemember(c, {
    key: `${id ?? j?.id ?? ''}:crossing-frapping-geometry`,
    subject: id ?? j?.id ?? '',
    property:
      'frapped lashing state, base and transverse turns, closure, tails, displacement, condition and recorded tests',
    value: v7Json(value),
    method: 'direct inspection',
    condition: 'visible and measurable features only; no load is applied',
    verified: false,
  });
  c.emit(
    `${PREFIX}inspected`,
    'Only visible turns, closure, tails, displacement, damage and recorded tests are reported; no load was applied and nothing was changed or repaired.',
    value,
    id ?? j?.id ?? null,
  );
  return { complete: true, writes: [] };
}

/** Parts the cord where the more loaded closure end enters its turns, into two owned fragments of conserved fiber. */
function breakCord(
  w: V7World,
  at: { x: number; y: number },
  cord: V7Stack,
  model: Model,
  rest: Tensions,
  geometry: V7Data,
  trials: V7Data[],
  tails: number[],
): V7Stack[] {
  const g = record(geometry),
    L = Number(F.part(cord).overall),
    ends = closureEnds(rest, B.DRESS),
    cut =
      ends[0] >= ends[1]
        ? (tails[0] ?? 0) + model.closurePath + model.bridge
        : L - ((tails[1] ?? 0) + num(g.closurePath) + num(g.travelUp)),
    pieces = M.fragmentCord(w, at, cord, cut, F.conditionOf(cord), trials);
  for (const f of pieces) {
    const k = record(f.processing?.[KEY]);
    if (f.processing && f.processing[KEY])
      f.processing[KEY] = {
        ...k,
        state: 'separate',
        bindingId: null,
        workId: null,
        geometry: null,
        model: null,
        frap: null,
        last: 'broke-in-frapped-lashing',
        fragmentOf: cord.id,
        updatedAt: w.tick,
      };
  }
  w.stacks = w.stacks.filter((s) => s !== cord);
  w.stacks.push(...pieces);
  return pieces;
}

/** A bounded two-hand test of the frapped lashing, one hand on each piece beyond the turns, with
 * multi-turn-contact@1's trial rules on the frapped turn tensions. */
function trial(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    b = ownLashing(c, [FRAPPED]),
    { top, bottom } = b,
    cord = b.cord as V7Stack;
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
    lash = M.recOf(cord),
    g = record(lash.geometry),
    grips = numbers(g.grips),
    model = M.modelOf(k);
  if (g.gripsFit !== true)
    throw new Error(
      'A piece is too short for a 0.05 m hand grip clear of the turns; no opposed hand pair is possible. Nothing was spent.',
    );
  const pt = top ? M.measurePiece(w, top) : null,
    pb = bottom ? M.measurePiece(w, bottom) : null,
    load = model ? M.cordLoad(w, cord, model) : null,
    slip = M.liveSlip(w, cord);
  if (!top || !bottom || !pt || !pb || !model || !load || slip === undefined)
    throw new Error(
      'Unsupported material: no piece, strand or friction law applies; nothing was spent.',
    );
  const lay = X.space(w, a, [pt, pb], num(g.crossingAngle), null);
  if (lay.blocked)
    throw new Error(`No room to work: ${lay.blocked}. Nothing was spent.`);
  v7Spend(a, TRIAL);
  const before = view(w, b, b.id),
    exit = num(record(k.frap).exit) || B.DRESS,
    rest = M.tensions(model),
    pieces = [pt, pb],
    hand = (F.HAND_PULL * Math.max(0, Math.min(100, a.vitals.health))) / 100,
    grip = F.GRIP * Math.min(pt.diameter, pb.diameter),
    limit = Math.min(force, hand, grip),
    slideLoad = model.mu * sum(rest.top),
    under = (f: number) =>
      direction === 'separate'
        ? M.tensions(model, M.separated(model, load.stiffness, f).extra)
        : rest,
    loads: { kind: string; load: number; piece?: number }[] = [];
  if (direction === 'separate') {
    if (slip !== null)
      loads.push({
        kind: 'closure-slipped',
        load: M.threshold(
          limit,
          (f) => Math.max(...closureEnds(under(f), exit)) >= slip,
        ),
      });
    loads.push({
      kind: 'cord-broke',
      load: M.threshold(limit, (f) => peakOf(under(f), exit) >= load.strength),
    });
  } else {
    loads.push({ kind: 'crossing-slipped', load: slideLoad });
    if (slip !== null && slip <= Math.max(...closureEnds(rest, exit)))
      loads.push({ kind: 'closure-slipped', load: 0 });
    if (load.strength <= peakOf(rest, exit))
      loads.push({ kind: 'cord-broke', load: 0 });
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
        ? M.separated(model, load.stiffness, achieved)
        : null,
    loaded = sep ? M.tensions(model, sep.extra) : rest,
    ratio = Math.min(1, peakOf(loaded, exit) / Math.max(1e-12, load.strength)),
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
        damage: broke ? 1 : v7RoundNumber(Math.max(0, share - F.ONSET)),
        conditionBefore: v7RoundNumber(p.condition),
        conditionAfter: broke
          ? 0
          : v7RoundNumber(p.condition * (1 - Math.max(0, share - F.ONSET))),
      };
    }),
    heldSeconds = outcome === 'held' ? seconds : 0,
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
      frapCount: num(k.frapCount),
      reuses:
        'multi-turn-contact@1 separate, slide, closure, breaking, bending and creep rules on the frapped turn tensions; fiber-cord@1 grip, hand, breaking, stiffness and creep; cord-knot@1 curvature; cord-bend@1 closure friction; crossing-contact@1 cord-on-bark friction, grip sites and bending',
      direction,
      gripSites: grips.map((d, i) => ({
        piece: i ? bottom.id : top.id,
        fromCrossing: d,
        length: F.HOLD,
      })),
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
      turnTensionsBefore: M.turnText(rest),
      turnTensions: M.turnText(loaded),
      transverseExitTension: exit,
      endTensions: closureEnds(loaded, exit).map(F.newtons),
      clampingForce: F.newtons(
        sep ? sep.clamping : M.separated(model, load.stiffness, 0).resting,
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
      retainedDeformation: m(sum(creep)),
      cordConcentration: v7RoundNumber(load.concentration),
      cordLoadShare: v7RoundNumber(ratio),
      strandsBroken: v7RoundNumber(damage),
      conditionBefore: cond,
      conditionAfter: after,
      pieces: bending,
      unvalidated: UNVALIDATED,
    },
    entry: V7Data = {
      tick: w.tick,
      direction,
      outcome,
      requestedForce: force,
      achievedForce: result.achievedForce,
      requestedDuration: seconds,
      heldSeconds,
      loadShare: v7RoundNumber(ratio),
      conditionBefore: cond,
    },
    trials = [...trialsOf(cord), entry].slice(-4);
  const outputs: V7Stack[] = [];
  bending.forEach((p, i) => {
    const s = i ? bottom : top;
    if (p.conditionAfter < p.conditionBefore || p.damage >= 1)
      M.writePiece(w, s, {
        condition: p.conditionAfter,
        ...(p.damage >= 1 ? { broken: true, brokenAt: w.tick } : {}),
      });
  });
  F.part(cord).condition = after;
  k.trials = trials;
  let loosened = false;
  if (outcome === 'cord-broke') {
    outputs.push(
      ...breakCord(
        w,
        a.position,
        cord,
        model,
        loaded,
        record(k.geometry),
        M.trialsOf(cord),
        ledger(cord).tails,
      ),
    );
    for (const f of outputs) record(f.processing?.[KEY]).trials = trials;
    separate(w, { top, bottom }, 'broke-cord-parted');
  } else if (outcome === 'closure-slipped')
    separate(w, b, 'slipped-closure-under-load');
  else if (outcome === 'piece-broke') separate(w, b, 'broke-piece-cracked');
  else {
    if (outcome === 'crossing-slipped') {
      lash.crossingShift = m(num(lash.crossingShift) + migrated);
      for (const t of model.turns) t.migration += migrated;
    }
    M.creepInto(load, model, creep);
    k.model = M.modelJson(model);
    if (M.tensions(model).max <= 1e-9) loosened = true;
  }
  remember(
    c,
    `frapped-hand-load-${direction}`,
    outputs[0] ?? cord,
    [top, bottom],
    model.turns.length,
    num(k.frapCount),
    num(g.crossingAngle),
    `${F.band(cond)}-${String(force)}N-${String(seconds)}s-${outcome}`,
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
      ? `The frapped ${String(model.turns.length)}-turn lashing held ${String(result.achievedForce)} N (${direction}) for ${String(seconds)} s between both hands. A pass means only this arrangement, force and time, not a safe load.`
      : outcome === 'grip-lost'
        ? `A hand slipped on its piece at ${String(result.achievedForce)} N; the test stopped.`
        : outcome === 'crossing-slipped'
          ? `The crossing slipped at ${String(result.achievedForce)} N: the turns slid along the top piece with the bottom piece; the test stopped and the lashing stays closed.`
          : outcome === 'closure-slipped'
            ? `The closure slipped at ${String(result.achievedForce)} N; every turn opened and both pieces and the cord are free.`
            : outcome === 'cord-broke'
              ? `The cord parted at ${String(result.achievedForce)} N into two owned fragments of the same fiber; the pieces are free.`
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
      'Broken in the frapped lashing: two owned fragments keep all of the cord; both pieces are free and nothing vanished.',
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
      'Creep left every base turn slack: the closure still holds them, but the lashing is loose.',
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
      'No unfinished frapping work of yours to cancel; nothing was spent.',
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
      ? 'Frapping work cancelled: the closure still keeps the three items together as they are; nothing is refunded or untied.'
      : 'Frapping work cancelled: the turns were open in the hands and fell loose, so both pieces and the cord are free; nothing is refunded.',
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
  if (!ARGS[mode]) throw new Error('Unknown frapping mode.');
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
    throw new Error('The bound frapping work is already settled.');
  relevant(c, mode);
  if (mode === 'assess') return assess(c);
  if (mode === 'attempt') return attempt(c);
  if (mode === 'untie') return startUntie(c);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'trial') return trial(c);
  return cancel(c);
}

/** Reserved items stay in the owner's hands; an unworked round pauses a closed lashing and lets turns
 * open in the hands fall loose. A frapped lashing is carried as owned items (no hanging load); its cord
 * wears through hand-bind-crossing@1's once-per-round wear of the bound role, and parts in place when it
 * can no longer carry its own tensions. */
function environment(w: V7World) {
  for (const j of collectiveJobs(w, ID).filter(open)) {
    const a = w.actors.find((x) => x.id === j.owner);
    if (!a) continue;
    j.x = a.position.x;
    j.y = a.position.y;
    for (const s of w.stacks.filter((s) => s.reservedFor === j.id))
      s.position = { ...a.position };
    if (j.status === 'active' && j.lastPaid < w.tick) {
      const say = announcer(w, a),
        handHeld =
          j.mode === 'attempt' ? num(j.reached) >= 2 : num(j.reached) >= 1;
      if (handHeld) {
        const { relaxed } = release(
          w,
          a,
          j,
          'Not worked this round; the turns open in the hands fell loose.',
          false,
        );
        say(
          `${PREFIX}stopped`,
          'Frapping work stopped because it was not worked this round while the turns were open; nothing was spent.',
          summary(w, j),
          str(j.binding) ?? j.id,
        );
        if (relaxed) relaxedEvent(say, w, j, relaxed);
      } else {
        j.status = 'paused';
        j.reason =
          'Not worked this round; paid stages and the reserved items are kept.';
        say(
          `${PREFIX}paused`,
          'Frapping work paused because it was not worked this round; nothing was spent.',
          summary(w, j),
          str(j.binding) ?? j.id,
        );
      }
    }
    sync(a, j);
  }
  for (const cord of w.stacks.filter((s) => stateOf(s) === 'frapped')) {
    const k = recOf(cord),
      id = str(k.bindingId),
      model = M.modelOf(k);
    if (!id || cord.reservedFor !== id || !model) continue;
    const load = M.cordLoad(w, cord, model),
      rest = M.tensions(model),
      exit = num(record(k.frap).exit) || B.DRESS;
    if (!load || load.strength > peakOf(rest, exit)) continue;
    const parts = M.members(w, id),
      owner = w.actors.find((x) => x.id === cord.owner && x.vitals.health > 0),
      at = owner ? owner.position : cord.position,
      pieces = breakCord(
        w,
        at,
        cord,
        model,
        rest,
        record(k.geometry),
        M.trialsOf(cord),
        ledger(cord).tails,
      );
    for (const f of pieces) record(f.processing?.[KEY]).trials = trialsOf(cord);
    separate(w, { top: parts.top, bottom: parts.bottom }, 'broke-cord-parted');
    forestEvent(
      w,
      `${PREFIX}broken`,
      'Under its own frapped tensions the worn cord parted where the more loaded closure end enters the turns, into two owned fragments of the same fiber; both pieces are free and nothing vanished.',
      at,
      owner?.id ?? null,
      {
        bindingId: id,
        endTensions: closureEnds(rest, exit).map(F.newtons),
        fragments: pieces.map((f) => f.id),
        visual: view(w, { top: parts.top, bottom: parts.bottom }, null),
      },
      id,
    );
  }
}

export const LONG_CROSSING_FRAPPING: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex16',
  dependencies: [
    'foundation-open@1',
    'hand-twist-fiber-cord@1',
    'hand-tie-cord-knot@1',
    'hand-join-fiber-cords@1',
    'hand-bind-crossing@1',
    'hand-lash-crossing@1',
  ],
  description:
    'General bare-hand frapping of an existing hand-lash-crossing@1 lashing with its own cord: 1-3 transverse turns between the pieces round both leg bundles, under the transverse-contact@1 route, snugging and drawing-in rules; assessment, frapCount + 3 paid rounds, inspection, a bounded two-hand test, full untying and cancel. The lashing stays a relation of the three conserved items. No reward, rating, hanging load, shelter or added material.',
  reuse: {
    experiment:
      'ex16 hand-lash-crossing@1 (law multi-turn-contact@1: planner, turn geometry, stage pattern, closure, tension, separate and slide trial, creep, fragments, relation and ownership helpers, through a new append-only MULTI_TURN_CONTACT export); ex16 hand-bind-crossing@1 (crossing-contact@1 pieces, cord measure, bark friction, room, closure slip, bending and its bound-role wear, through CROSSING_CONTACT); ex16 hand-twist-fiber-cord@1 (FIBER_CORD); ex16 hand-tie-cord-knot@1 (CORD_KNOT); ex16 hand-join-fiber-cords@1 (CORD_BEND friction and dressing pull); cords from hand-twist-sectioned-cord@1 are ordinary cords',
    source:
      'long-crossing-lashing.ts MULTI_TURN_CONTACT (appended); long-crossing-binding.ts CROSSING_CONTACT; long-fiber-cord.ts FIBER_CORD; long-cord-knot.ts CORD_KNOT; long-fiber-cord-join.ts CORD_BEND; collective-work.ts (paid work, stop); open-foundation.ts (personal records); forest-climate.ts (events)',
    description:
      'Implementation reuse only; the five cord and binding packages keep their behavior and ability text, and no ability is a prerequisite. Only the leg tangents, wedge, bend-limited transverse route, snugging forces, drawing-in balance and the frapped stage, untie and release rules are new, registered as transverse-contact@1.',
  },
  abilities: [
    {
      id: ID,
      name: 'Hand-frap crossing lashings',
      function:
        'Draw the turns of your own hand-lash-crossing lashing together with 1-3 transverse turns of its own cord between the pieces; assess, attempt, inspect, hand-test, untie or cancel; measured geometry and tensions decide results.',
      equivalence: 'binding:hand-frapped-crossing-lashing:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['assess', 'attempt', 'inspect', 'trial', 'untie', 'cancel'],
          },
          bindingId: { type: 'string' },
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
          frapCount: {
            type: 'integer',
            minimum: FRAPS.min,
            maximum: FRAPS.max,
          },
          workId: { type: 'string' },
          trialForce: { type: 'number', minimum: 0, maximum: K.MAX_FORCE },
          trialDuration: { type: 'number', minimum: 0, maximum: K.MAX_SECONDS },
          trialDirection: { type: 'string', enum: X.DIRECTIONS },
        }),
        required: ['mode'],
      },
      references: {},
      prerequisites: [],
      learning: 3,
      learningEnergy: 0.2,
      costs:
        'Study: 3 rounds at 0.2. assess (frapCount 1-3 with bindingId, or with pieceIds, cordId, crossingAngle, wrapCount): 0.5, ties nothing. attempt (bindingId of your dressed lashing, frapCount): reserves it, then frapCount + 3 paid rounds of 0.5 (measure-plan, release-closure, route-frap-1..n, close-dress-release-check); resume: attempt + workId. inspect (bindingId or workId): 0.2. trial (frapped; trialForce N >0-10; trialDuration s >0-60; trialDirection): 0.5. untie: frapCount + wrapCount + 1 rounds of 0.5. cancel: free. Same room, footing and bystander rules as hand-lash-crossing. A closed lashing pauses uncharged; turns open in the hands fall loose when not worked. Refusals spend nothing; no refunds.',
      effects:
        'transverse-contact@1 reuses multi-turn-contact@1 turns, closure, tensions and trials. Turns use the lashing cord: one end goes to the contact plane, round both leg bundles and back over the closure; separate or joined cord is not supported. Route: shortest found around the legs and the wedge where the gap is under the cord width, never tighter than the bend limit; later turns lie on earlier ones. Need = the longest stage incl. 0.04 m on the turn being passed, closure and 0.02 m + w tails; a measured shortfall stops before the closure opens. Each turn is snugged 5 N at its exit and falls by exp(-0.3 x contact); the push draws the legs in until their tension x d(length)/d(draw) balances it, raising each turn by stiffness x lengthening / length; the closure must hold the higher end tension. Trials use these tensions. Bound cords wear 0.0005/round once. No reward, rating, hanging load or shelter.',
      handler: 'long.hand-frap-crossing',
      revision: REVISION,
      authored: false,
      // The release-held event carries no qualified flag: frapping earns no milestone.
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
  handlers: { 'long.hand-frap-crossing': execute },
  processes: {},
  visualComponents: [],
  events: [
    'assessed',
    'started',
    'measured',
    'shortfall',
    'resisted',
    'closure-released',
    'turn-routed',
    'turn-snugged',
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
    'closure-withdrawn',
    'frap-unwrapped',
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
        'Frapping work stopped by death; the pieces and cord lie where the person died in their actual configuration.',
        summary(w, j),
        str(j.binding) ?? j.id,
      );
      if (relaxed) relaxedEvent(say, w, j, relaxed);
      sync(a, j);
    }
  },
};
