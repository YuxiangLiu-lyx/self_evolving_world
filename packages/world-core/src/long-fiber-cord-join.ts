import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Json,
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

const ID = 'hand-join-fiber-cords';
const REVISION = `${ID}@1`;
const STATE = `long:work:${ID}`;
/** Processing key of one cord's part in a join; the join is a relation of two items, never a third. */
const JOIN = 'cordJoin';
const LAW = 'cord-bend@1';
const METHOD = 'sheet-bend';
/** Energy of one attempt or untie round, of an inspection and of a trial. */
const STEP = 0.5;
const LOOK = 0.2;
const TRIAL = 0.5;
const TIE = [
  'measure-form-bight',
  'pass-second-end',
  'wrap-and-tuck',
  'dress-release-check',
];
const UNTIE = ['withdraw-tucked-end', 'withdraw-through-bight'];
/** cord-bend@1 retention, part 3 (modeling assumption): static friction of twisted fiber on the
 * same fiber. No world value existed; 0.3 lies in the 0.25-0.5 range of dry plant-fiber cordage.
 * Wetness, wear and dynamic friction do not change it in this version. Other fibers are unsupported. */
const FRICTION: Partial<Record<string, number>> = { reed: 0.3 };
/** Dressing pull per end: the 5 N small opposing-hand pull of the fiber-cord@1 sample test. */
const DRESS = 5;
/** Arguments each mode accepts besides mode; any other supplied argument is refused. */
const ARGS: Partial<Record<string, string[]>> = {
  attempt: ['cordIds', 'method', 'workId'],
  inspect: ['joinId', 'workId'],
  trial: ['joinId', 'trialForce', 'trialDuration'],
  untie: ['joinId', 'workId'],
  cancel: ['workId'],
};
const WORK = ['attempt', 'untie'];
const ROLES = ['cord', 'fragment'];
type State = 'straight' | 'bight' | 'threaded' | 'wrapped' | 'tied';
type Part = 'bight' | 'wrap';
/** States whose crossings hold without hands: the cords stay a linked assembly. */
const RETAINED: State[] = ['wrapped', 'tied'];
const UP: V7Data = {
  pass: 'up-through-bight',
  over: 'bight',
  under: 'wrap',
  at: 'crown',
};
const AROUND = (over: Part, at: string): V7Data => ({
  pass: 'around-behind-both-legs',
  over,
  under: over === 'bight' ? 'wrap' : 'bight',
  at,
});
/** Over/under crossings each state has reached, by cord part. */
const CROSSINGS: Record<State, V7Data[]> = {
  straight: [],
  bight: [],
  threaded: [UP],
  wrapped: [],
  tied: [],
};
CROSSINGS.wrapped = [
  UP,
  AROUND('bight', 'standing-leg'),
  AROUND('bight', 'short-leg'),
  AROUND('wrap', 'short-leg'),
  AROUND('wrap', 'standing-leg'),
  {
    pass: 'under-own-entering-part',
    over: 'wrap-entering-part',
    under: 'wrap-end',
    at: 'tuck',
  },
];
CROSSINGS.tied = CROSSINGS.wrapped;

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const record = (v: unknown): V7Data =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as V7Data) : {};
const num = (v: unknown) => (typeof v === 'number' ? v : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : null);
/** The join a work forms or binds: its id is set when the work starts. */
const joinIdOf = (j: CollectiveWork) => str(j.join) ?? j.id;
const m = F.metres;
const mm = (x: number) => Math.round(x * 1e4) / 10;
const joinOf = (s: V7Stack) => record(s.processing?.[JOIN]);
function stateOf(s: V7Stack): State {
  const v = joinOf(s).state;
  return v === 'bight' || v === 'threaded' || v === 'wrapped' || v === 'tied'
    ? v
    : 'straight';
}
const trialsOf = (s: V7Stack): V7Data[] => {
  const t = joinOf(s).trials;
  return Array.isArray(t) ? t.map(record) : [];
};
const friction = (a: V7Stack, b: V7Stack) => {
  const x = FRICTION[a.resource],
    y = FRICTION[b.resource];
  return x === undefined || y === undefined ? null : Math.min(x, y);
};

/** A cord as measured on the live item: cord-knot@1's width, centreline and tightest bend. */
interface Cord {
  stack: V7Stack;
  width: number;
  overall: number;
  /** Tightest bend radius without cracking; null when the strands take no bend. */
  bend: number | null;
  condition: number;
}
function measure(w: V7World, s: V7Stack): Cord | null {
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

/** cord-bend@1, parts 1-2: a sheet bend with its bight in b and the end of x passed through it,
 * once round both bight legs and under its own entering part. Pairs are [bight, wrap]. */
interface Fit {
  bight: Cord;
  wrap: Cord;
  /** Centreline distance at which two touching cords meet: their mean width. */
  support: number;
  bightRadius: number;
  formRadius: number;
  wrapRadius: number;
  path: [number, number];
  formPath: [number, number];
  tailNeed: [number, number];
  formStanding: [number, number];
  standing: [number, number];
  tail: [number, number];
  shortfall: string | null;
  gripShortfall: string | null;
}
/** With measured false the bend limits are ignored: the least any material could need. */
function fit(b: Cord, x: Cord, measured: boolean): Fit {
  const a = (b.width + x.width) / 2,
    pair: [Cord, Cord] = [b, x],
    stiff = measured ? pair.find((c) => c.bend === null) : undefined,
    rB = Math.max(measured ? (b.bend ?? 0) : 0, a),
    rForm = Math.max(rB, (Math.max(K.OPENING, x.width) + b.width) / 2),
    rW = Math.max(measured ? (x.bend ?? 0) : 0, a),
    // One turn round both legs (centres 2 r apart) at radius rW >= a: arcs touch the outer legs.
    around = (r: number) =>
      2 * Math.max(0, 2 * r - 2 * (rW - a)) + 2 * Math.PI * rW,
    paths = (r: number): [number, number] => [
      Math.PI * r + 4 * x.width,
      b.width + around(r) + x.width,
    ],
    path = paths(rB),
    formPath = paths(rForm),
    tailNeed: [number, number] = [F.END + b.width, F.END + x.width],
    formStanding: [number, number] = [
      b.overall - formPath[0] - tailNeed[0],
      x.overall - formPath[1] - tailNeed[1],
    ],
    standing: [number, number] = [
      formStanding[0] + (formPath[0] - path[0]) / 2,
      formStanding[1] + (formPath[1] - path[1]) / 2,
    ],
    tail: [number, number] = [
      tailNeed[0] + (formPath[0] - path[0]) / 2,
      tailNeed[1] + (formPath[1] - path[1]) / 2,
    ],
    names = ['bight', 'wrap'],
    short = [0, 1].find((i) => (formStanding[i] ?? 0) < K.PINCH - 1e-9),
    weak = [0, 1].find((i) => (standing[i] ?? 0) < K.CLEAR - 1e-9);
  const at = (i: number) => {
    const c = pair[i] ?? b;
    return `the ${names[i] ?? ''} cord ${c.stack.id} is ${String(m(c.overall))} m; the bend needs ${String(m(K.PINCH + (formPath[i] ?? 0) + (tailNeed[i] ?? 0)))} m of it (a ${String(K.PINCH)} m standing pinch, ${String(m(formPath[i] ?? 0))} m in the bend and a ${String(m(tailNeed[i] ?? 0))} m tail)`;
  };
  return {
    bight: b,
    wrap: x,
    support: a,
    bightRadius: rB,
    formRadius: rForm,
    wrapRadius: rW,
    path,
    formPath,
    tailNeed,
    formStanding,
    standing,
    tail,
    shortfall: stiff
      ? `the strands of ${stiff.stack.id} resisted bending, so it formed no ${stiff === b ? 'bight' : 'turn round the legs'}`
      : short === undefined
        ? null
        : at(short),
    gripShortfall:
      weak === undefined
        ? null
        : `the standing part of ${pair[weak]?.stack.id ?? ''} would be ${String(m(standing[weak] ?? 0))} m; a trial hand needs ${String(m(K.CLEAR))} m (a ${String(F.HOLD)} m grip kept ${String(m(K.CLEAR - F.HOLD))} m clear of the bend)`,
  };
}
/** Both assignments, best first: a fit, then one leaving both trial grips, then the longer
 * shorter standing part, the wider and then the better-conditioned bight, then input order. */
function select(p: Cord, q: Cord, measured: boolean): Fit[] {
  const score = (f: Fit) => [
    f.shortfall ? 0 : 1,
    f.gripShortfall ? 0 : 1,
    Math.min(...f.standing),
    f.bight.width,
    f.bight.condition,
  ];
  return [fit(p, q, measured), fit(q, p, measured)].sort((f, g) => {
    const a = score(f),
      b = score(g);
    for (let i = 0; i < a.length; i++) {
      const d = (b[i] ?? 0) - (a[i] ?? 0);
      if (Math.abs(d) > 1e-9) return d;
    }
    return 0;
  });
}
function describe(f: Fit): V7Data {
  const stiff = f.shortfall?.includes('resisted bending') === true;
  return {
    bight: f.bight.stack.id,
    wrap: f.wrap.stack.id,
    widths: [m(f.bight.width), m(f.wrap.width)],
    tightestBightRadius: stiff ? null : m(f.bightRadius),
    passingOpening: stiff ? null : m(2 * f.formRadius - f.bight.width),
    wrapRadius: stiff ? null : m(f.wrapRadius),
    pathInBend: stiff ? null : f.path.map(m),
    tailNeeded: f.tailNeed.map(m),
    standingParts: stiff ? null : f.standing.map(m),
    tails: stiff ? null : f.tail.map(m),
    fits: !f.shortfall,
    trialGrips: !f.shortfall && !f.gripShortfall,
    shortfall: f.shortfall,
    gripShortfall: f.shortfall ? null : f.gripShortfall,
  };
}

/** cord-bend@1, part 3: capstan friction round each tail's contact arcs and a two-face nip.
 * An arc wider than what it wraps touches over the share support / radius of its angle. */
function retention(mu: number, k: V7Data) {
  const a = num(k.support),
    conformity: [number, number] = [
      Math.min(1, a / num(k.bightRadius)),
      Math.min(1, a / num(k.wrapRadius)),
    ],
    angle: [number, number] = [
      Math.PI * conformity[0],
      2 * Math.PI * conformity[1],
    ],
    slip = angle.map((t) => {
      const e = Math.exp(-mu * t);
      return e <= 2 * mu ? null : (2 * mu * DRESS) / (e - 2 * mu);
    }),
    loads = slip.filter((x): x is number => x !== null);
  return {
    conformity,
    angle,
    slip,
    load: loads.length ? Math.min(...loads) : null,
    tail: loads.length ? slip.indexOf(Math.min(...loads)) : -1,
  };
}

interface Side {
  standing: number;
  path: number;
  tail: number;
  width: number;
  overall: number;
}
/** Schematic centrelines in one local plane (m): the crown at the origin pointing +x, short ends toward -x. */
function centerlines(
  state: State,
  b: Side,
  x: Side,
  rB: number,
  a: number,
): [V7Json, V7Json] {
  const pts = (list: number[][]) => list.map((p) => p.map(m));
  if (state === 'straight')
    return [
      pts([
        [0, rB],
        [b.overall, rB],
      ]),
      pts([
        [0, -rB],
        [x.overall, -rB],
      ]),
    ];
  const L = 2 * x.width,
    c = Math.SQRT1_2 * rB,
    bight = pts([
      [-(L + b.standing), rB],
      [-L, rB],
      [0, rB],
      [c, c],
      [rB, 0],
      [c, -c],
      [0, -rB],
      [-L, -rB],
      [-(L + b.tail), -rB],
    ]),
    enter = rB + b.width / 2,
    inside = rB - b.width / 2,
    y = rB + a;
  if (state === 'bight')
    return [
      bight,
      pts([
        [rB + b.width, 0],
        [rB + b.width + x.overall, 0],
      ]),
    ];
  if (state === 'threaded')
    return [
      bight,
      pts([
        [enter + x.standing, 0],
        [enter, 0],
        [inside, 0],
        [inside - x.tail, 0],
      ]),
    ];
  return [
    bight,
    pts([
      [enter + x.standing, 0],
      [enter, 0],
      [inside, 0],
      [-x.width, y],
      [-L, y],
      [-L, -y],
      [-x.width, -y],
      [-x.width, 0],
      [-x.width - x.tail, 0],
    ]),
  ];
}

/** Writes one cord's part of the join on the same item; joined roles keep other cord operations off it. */
function write(w: V7World, s: V7Stack, state: State, data: V7Data) {
  const p = F.part(s),
    k = joinOf(s),
    role = F.roleOf(s),
    prior =
      role === 'joined' && typeof k.priorRole === 'string'
        ? k.priorRole
        : (role ?? 'cord');
  p.role = RETAINED.includes(state) ? 'joined' : prior;
  s.processing = {
    ...(s.processing ?? {}),
    [JOIN]: {
      law: LAW,
      revision: REVISION,
      method: METHOD,
      state,
      ...data,
      retainedCreep: num(k.retainedCreep),
      priorRole: prior,
      trials: trialsOf(s),
      updatedAt: w.tick,
    },
  };
}
function straighten(w: V7World, s: V7Stack, last: string) {
  const p = F.part(s),
    overall = Number(p.overall);
  write(w, s, 'straight', {
    joinId: null,
    workId: null,
    part: null,
    partner: null,
    width: m(2 * Number(p.plyDiameter)),
    centreline: overall,
    standing: overall,
    path: 0,
    tail: 0,
    crossings: 0,
    sequence: [],
    last,
  });
  joinOf(s).retainedCreep = 0;
}
/** Both cords' measured parts for a state; tails take the remainder, so each ledger closes exactly. */
function place(
  w: V7World,
  joinId: string,
  workId: string | null,
  b: V7Stack,
  x: V7Stack,
  state: State,
  g: { standing: [number, number]; path: [number, number] },
  radii: { support: number; bightRadius: number; wrapRadius: number },
  last: string | null = null,
) {
  const both: [V7Stack, V7Stack] = [b, x],
    sides = both.map((s, i): Side => {
      const overall = Number(F.part(s).overall),
        standing = m(g.standing[i] ?? overall),
        path = m(g.path[i] ?? 0);
      return {
        standing,
        path,
        tail: m(overall - standing - path),
        width: 2 * Number(F.part(s).plyDiameter),
        overall,
      };
    }),
    [sb, sx] = sides as [Side, Side],
    lines = centerlines(state, sb, sx, radii.bightRadius, radii.support);
  both.forEach((s, i) => {
    const side = sides[i] ?? sb,
      part: Part = i ? 'wrap' : 'bight',
      arc = i ? radii.wrapRadius : radii.bightRadius,
      conformity = Math.min(1, radii.support / arc);
    write(w, s, state, {
      joinId,
      workId,
      part,
      partner: (i ? b : x).id,
      width: m(side.width),
      centreline: side.overall,
      standing: side.standing,
      path: side.path,
      tail: side.tail,
      support: m(radii.support),
      bightRadius: m(radii.bightRadius),
      wrapRadius: m(radii.wrapRadius),
      arcRadius: m(arc),
      conformity: v7RoundNumber(conformity),
      contactAngle: v7RoundNumber((i ? 2 : 1) * Math.PI * conformity),
      crossings: CROSSINGS[state].length,
      sequence: CROSSINGS[state].map((c) => c.pass ?? null),
      centerline: lines[i] ?? [],
      last,
    });
  });
}
const placeFit = (
  w: V7World,
  j: CollectiveWork,
  f: Fit,
  state: State,
  last: string | null = null,
) => {
  const seated = state === 'tied',
    b = f.bight.stack,
    x = f.wrap.stack;
  place(
    w,
    joinIdOf(j),
    seated ? null : j.id,
    b,
    x,
    state,
    {
      standing: seated
        ? f.standing
        : [
            f.formStanding[0],
            state === 'bight' ? f.wrap.overall : f.formStanding[1],
          ],
      path: seated
        ? f.path
        : [
            f.formPath[0],
            state === 'bight'
              ? 0
              : state === 'threaded'
                ? f.bight.width
                : f.formPath[1],
          ],
    },
    {
      support: f.support,
      bightRadius: seated ? f.bightRadius : f.formRadius,
      wrapRadius: f.wrapRadius,
    },
    last,
  );
};

/** Members of a join, bight first; the relation is found on the items themselves. */
function members(w: V7World, joinId: string): V7Stack[] {
  const list = w.stacks.filter((s) => joinOf(s).joinId === joinId);
  return [
    ...list.filter((s) => joinOf(s).part === 'bight'),
    ...list.filter((s) => joinOf(s).part !== 'bight'),
  ];
}
const label = (cords: V7Stack[]) => {
  const s = cords[0],
    state = s ? stateOf(s) : 'straight',
    last = s ? str(joinOf(s).last) : null,
    trial = s ? trialsOf(s).at(-1) : undefined;
  if (state === 'tied')
    return last === 'jammed'
      ? 'jammed'
      : trial?.outcome === 'held'
        ? 'held-at-recorded-load'
        : 'tied-but-untested';
  if (state !== 'straight') return 'incomplete';
  return last === 'untied'
    ? 'untied'
    : last?.startsWith('slipped')
      ? 'slipped'
      : last?.startsWith('broke')
        ? 'broken'
        : last?.startsWith('infeasible')
          ? 'geometrically-infeasible'
          : last?.startsWith('released')
            ? 'released'
            : 'separate';
};
/** Reusable visual metadata of the two conserved cords; only measured values, no success badge. */
function view(w: V7World, cords: V7Stack[], joinId: string | null): V7Data {
  const s = cords[0],
    k = s ? joinOf(s) : {},
    state = s ? stateOf(s) : 'straight',
    trial = s ? trialsOf(s).at(-1) : undefined;
  return {
    component: 'cord-join',
    reuses: 'fiber-cord',
    law: LAW,
    method: METHOD,
    joinId,
    state,
    status: label(cords),
    // A completed appearance needs all passes and the passed release check.
    completedAppearance: state === 'tied',
    schematic: true,
    bightRadius: state === 'straight' ? null : num(k.bightRadius),
    wrapRadius: RETAINED.includes(state) ? num(k.wrapRadius) : null,
    crossings: (CROSSINGS[state] as V7Json[]).map((c) => {
      const r = record(c),
        id = (p: unknown) =>
          p === 'bight' || p === 'wrap'
            ? (cords.find((x) => joinOf(x).part === p)?.id ?? p)
            : p === 'wrap-entering-part' || p === 'wrap-end'
              ? `${cords.find((x) => joinOf(x).part === 'wrap')?.id ?? 'wrap'}:${p === 'wrap-end' ? 'end' : 'entering-part'}`
              : null;
      return { ...r, over: id(r.over), under: id(r.under) };
    }),
    cords: cords.map((c, i) => {
      const x = joinOf(c);
      return {
        item: c.id,
        part: str(x.part),
        drawAs: i ? 'outlined' : 'solid',
        color: F.material(w, c.resource)?.color ?? '#b9b875',
        width: num(x.width),
        standing: num(x.standing),
        path: num(x.path),
        tail: num(x.tail),
        centerline: x.centerline ?? null,
        condition: v7RoundNumber(F.conditionOf(c)),
        cord: F.view(w, c),
      };
    }),
    lastTrial: trial
      ? {
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
/** The work's cords, bight first once assigned. */
function held(w: V7World, j: CollectiveWork): V7Stack[] {
  const bight = str(j.bight),
    wrap = str(j.wrap),
    order = bight && wrap ? [bight, wrap] : j.escrow;
  return order.flatMap((id) => w.stacks.filter((s) => s.id === id));
}
const stageName = (j: CollectiveWork, n: number) =>
  (j.mode === 'untie' ? UNTIE[n] : TIE[n + num(j.offset)]) ?? null;
function summary(w: V7World, j: CollectiveWork): V7Data {
  return {
    workId: j.id,
    actor: j.owner,
    mode: j.mode,
    status: j.status,
    law: LAW,
    revision: REVISION,
    method: METHOD,
    joinId: str(j.join),
    stage: j.completedWork ? stageName(j, j.completedWork - 1) : 'reserved',
    nextStage: open(j) ? stageName(j, j.completedWork) : null,
    completedRounds: j.completedWork,
    remaining: j.remainingWork,
    paidEnergy: v7RoundNumber(j.paidEnergy),
    cords: [...j.escrow],
    bight: str(j.bight),
    wrap: str(j.wrap),
    position: { x: j.x, y: j.y },
    visual: view(w, held(w, j), str(j.join)),
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
/** A retained join of two of the actor's own cords, bound by the join and not by work. */
function ownJoin(c: V7ActionContext, free = true): [V7Stack, V7Stack] {
  const id = v7String(c.action.args.joinId, 'joinId'),
    [b, x, ...rest] = members(c.world, id);
  if (
    !b ||
    !x ||
    rest.length ||
    joinOf(b).part !== 'bight' ||
    joinOf(x).part !== 'wrap' ||
    b.owner !== c.actor.id ||
    x.owner !== c.actor.id ||
    !RETAINED.includes(stateOf(b))
  )
    throw new Error(
      'joinId must be the exact id of a join of two of your own cords, both in your possession; nothing was spent.',
    );
  if (free && (b.reservedFor !== id || x.reservedFor !== id))
    throw new Error(
      'This join is bound by unfinished work; nothing was spent.',
    );
  return [b, x];
}
/** Bounded verified finding: the same outcome for the same materials and widths confirms nothing new. */
function remember(
  c: V7ActionContext,
  cords: (Cord | V7Stack)[],
  kind: string,
  outcome: string,
  value: V7Data,
  method: string,
) {
  const items = cords.map((x) => ('stack' in x ? x.stack : x)),
    widths = cords.map((x) =>
      mm('stack' in x ? x.width : 2 * Number(F.part(x).plyDiameter)),
    ),
    [b, s] = items;
  if (!b || !s) return;
  openRemember(c, {
    key: `${ID}:${kind}:${b.resource}-${s.resource}:${widths.join('-')}mm:${outcome}`,
    subject: b.resource,
    property: `sheet bend ${kind} between ${widths.join(' mm and ')} mm two-ply cords`,
    value: v7Json({ outcome, ...value }),
    method,
    condition:
      'bare hands; no tool, anchor, attachment, added fiber or second person',
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
    'cord-join-paused',
    `${reason} Paid stages, both reserved cords and their configuration are kept; nothing was spent.`,
    { ...summary(c.world, j), requiredEnergy: STEP },
    str(j.join) ?? j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id] };
}
/** Releases the work reservation once: a retained bend stays a bound assembly; unretained crossings open. */
function release(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  reason: string,
  ground: boolean,
) {
  const cords = held(w, j),
    state = cords[0] ? stateOf(cords[0]) : 'straight',
    retained = RETAINED.includes(state),
    opened = !retained && state !== 'straight';
  j.x = a.position.x;
  j.y = a.position.y;
  workStop(w, a, j, reason, ground);
  for (const s of cords) {
    if (retained) {
      s.reservedFor = joinIdOf(j);
      joinOf(s).workId = null;
    } else if (opened) straighten(w, s, 'released-unsupported-crossing-opened');
    else if (s.processing?.[JOIN]) joinOf(s).workId = null;
  }
  return { cords, opened, retained };
}
function released(c: V7ActionContext, j: CollectiveWork, cords: V7Stack[]) {
  c.emit(
    'cord-join-released',
    'Released without hands, the unretained crossing opened: both cords lie separate, with their lengths unchanged.',
    { ...summary(c.world, j), visual: view(c.world, cords, null) },
    str(j.join) ?? j.id,
  );
}
function stop(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
): V7HandlerResult {
  const { cords, opened } = release(c.world, c.actor, j, reason, false);
  c.emit(
    'cord-join-stopped',
    `${reason} Nothing is refunded.`,
    summary(c.world, j),
    str(j.join) ?? j.id,
  );
  if (opened) released(c, j, cords);
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}
/** Settles the work: a tied bend binds both cords to the join; separate cords are free. */
function finish(
  c: V7ActionContext,
  j: CollectiveWork,
  cords: V7Stack[],
  bound: boolean,
): V7HandlerResult {
  for (const s of cords) {
    if (bound) s.reservedFor = joinIdOf(j);
    else delete s.reservedFor;
    joinOf(s).workId = null;
  }
  j.status = 'completed';
  j.outputs = cords.map((s) => s.id);
  sync(c.actor, j);
  return { complete: true, remaining: 0, writes: [j.id, ...j.outputs] };
}
function progress(
  c: V7ActionContext,
  j: CollectiveWork,
  cords: V7Stack[],
  stage: string,
  before: V7Data,
  measured: V7Data,
  note: string,
): V7HandlerResult {
  c.emit(
    'cord-join-stage',
    `Paid round ${String(j.completedWork)} (${stage}): ${note}`,
    {
      ...summary(c.world, j),
      round: j.completedWork,
      operation: stage,
      before,
      after: view(c.world, cords, str(j.join)),
      conditions: cords.map((s) => F.conditionOf(s)),
      handPinch: K.PINCH,
      ...measured,
    },
    str(j.join) ?? j.id,
  );
  sync(c.actor, j);
  return {
    complete: false,
    remaining: j.remainingWork,
    writes: [j.id, ...cords.map((s) => s.id)],
  };
}
/** A measured limit ends the work at this paid stage; the cords stay as they actually are. */
function infeasible(
  c: V7ActionContext,
  j: CollectiveWork,
  pair: [Cord, Cord],
  stage: string,
  outcome: string,
  problem: string,
  before: V7Data,
  measured: V7Data,
): V7HandlerResult {
  const { cords, opened } = release(
    c.world,
    c.actor,
    j,
    `Measured at ${stage}: ${problem}. Both cords are released as they are; the round's energy is not refunded.`,
    false,
  );
  for (const s of cords)
    if (stateOf(s) === 'straight')
      straighten(c.world, s, `infeasible-${outcome}`);
  remember(
    c,
    pair,
    'attempt',
    outcome,
    { stage, problem, ...measured },
    `${String(j.completedWork)} paid round(s) of bare-hand bending and passing`,
  );
  c.emit(
    'cord-join-infeasible',
    `Measured at ${stage}: ${problem}. No join formed; both cords are released as they actually are and nothing is refunded.`,
    {
      ...summary(c.world, j),
      operation: stage,
      outcome,
      problem,
      before,
      after: view(c.world, cords, null),
      conditions: cords.map((s) => F.conditionOf(s)),
      ...measured,
    },
    str(j.join) ?? j.id,
  );
  if (opened) released(c, j, cords);
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

/** One paid attempt stage on the re-read cords: bight, pass, wrap and tuck, dress and check. */
function tie(
  c: V7ActionContext,
  j: CollectiveWork,
  cords: V7Stack[],
): V7HandlerResult {
  const w = c.world,
    n = num(j.offset) + j.completedWork - 1,
    stage = TIE[n] ?? '',
    [p, q] = cords,
    mp = p ? measure(w, p) : null,
    mq = q ? measure(w, q) : null,
    before = view(w, cords, str(j.join));
  if (!p || !q || !mp || !mq)
    return stop(c, j, 'A cord has no measurable geometry.');
  if (n === 0) {
    const fits = select(mp, mq, true),
      f = fits[0];
    const candidates = fits.map(describe);
    if (!f || f.shortfall) {
      const stiff = fits.every((x) => x.shortfall?.includes('resisted'));
      return infeasible(
        c,
        j,
        [mp, mq],
        stage,
        stiff ? 'no-bend' : 'too-short',
        f?.shortfall ?? 'no assignment fits',
        before,
        { candidates },
      );
    }
    j.bight = f.bight.stack.id;
    j.wrap = f.wrap.stack.id;
    j.assignment = describe(f);
    placeFit(w, j, f, 'bight');
    return progress(
      c,
      j,
      [f.bight.stack, f.wrap.stack],
      stage,
      before,
      { candidates, assignment: describe(f) },
      `${f.bight.stack.id} is bent into a bight of radius ${String(m(f.formRadius))} m held open by ${String(m(2 * f.formRadius - f.bight.width))} m for passing; ${f.wrap.stack.id} is the passing cord. No crossing exists yet.`,
    );
  }
  const f = fit(mp, mq, true),
    mu = friction(p, q);
  if (f.shortfall || mu === null)
    return infeasible(
      c,
      j,
      [mp, mq],
      stage,
      'geometry-changed',
      f.shortfall ?? 'no friction law applies to these fibers',
      before,
      {},
    );
  if (n === 1) {
    const beyond = mq.overall - f.formStanding[1] - mp.width;
    if (beyond < K.PINCH - 1e-9)
      return infeasible(
        c,
        j,
        [mp, mq],
        stage,
        'end-too-short',
        `passing the end through the bight leaves ${String(m(Math.max(0, beyond)))} m beyond it; pinching it needs ${String(K.PINCH)} m`,
        before,
        { endBeyondPassage: m(beyond) },
      );
    placeFit(w, j, f, 'threaded');
    return progress(
      c,
      j,
      cords,
      stage,
      before,
      {
        endBeyondPassage: m(beyond),
        passingOpening: m(2 * f.formRadius - mp.width),
      },
      'the second end is up through the bight: one crossing, held by hand; it is no join.',
    );
  }
  if (n === 2) {
    const beyond = f.tailNeed[1];
    if (beyond < K.PINCH - 1e-9)
      return infeasible(
        c,
        j,
        [mp, mq],
        stage,
        'end-too-short',
        `after the turn round both legs ${String(m(beyond))} m of end is left; tucking it needs ${String(K.PINCH)} m`,
        before,
        { endBeyondTuck: m(beyond) },
      );
    placeFit(w, j, f, 'wrapped');
    return progress(
      c,
      j,
      cords,
      stage,
      before,
      { endBeyondTuck: m(beyond), wrapRadius: m(f.wrapRadius) },
      'the end went round behind both bight legs and under its own entering part: a loose, undressed bend, not yet checked.',
    );
  }
  // Dressing seats both arcs at their measured limits; the slack is shared by standing part and tail.
  const ret = retention(mu, {
      support: f.support,
      bightRadius: f.bightRadius,
      wrapRadius: f.wrapRadius,
    }),
    short = [0, 1].find((i) => (f.tail[i] ?? 0) < (f.tailNeed[i] ?? 0) - 1e-9),
    slips = ret.load !== null && ret.load <= DRESS,
    ok = short === undefined && !slips,
    value = {
      bightRadius: m(f.bightRadius),
      wrapRadius: m(f.wrapRadius),
      pathInBend: f.path.map(m),
      standingParts: f.standing.map(m),
      tails: f.tail.map(m),
      tailNeeded: f.tailNeed.map(m),
      contactAngles: ret.angle.map(v7RoundNumber),
      dressingPull: DRESS,
      trialGrips: !f.gripShortfall,
      gripShortfall: f.gripShortfall,
    };
  if (ok) placeFit(w, j, f, 'tied', 'tied');
  else
    for (const s of cords)
      straighten(w, s, slips ? 'slipped-on-dressing' : 'slipped-on-release');
  remember(
    c,
    [mp, mq],
    'attempt',
    ok ? 'tied' : 'slipped',
    value,
    'four paid rounds of bare-hand bending, passing, wrapping, dressing and a release check',
  );
  const data: V7Data = {
    ...summary(w, j),
    round: j.completedWork,
    operation: stage,
    outcome: ok ? 'tied' : 'slipped',
    before,
    conditions: cords.map((s) => F.conditionOf(s)),
    ...value,
  };
  const done = finish(c, j, cords, ok);
  data.status = j.status;
  data.nextStage = null;
  data.after = view(w, cords, ok ? str(j.join) : null);
  data.visual = data.after;
  c.emit(
    ok ? 'cord-join-tied' : 'cord-join-slipped',
    ok
      ? `Dressed and released: a sheet bend joins ${p.id} (bight) and ${q.id}, with ${String(value.pathInBend[0])} and ${String(value.pathInBend[1])} m in the bend, standing parts of ${String(value.standingParts[0])} and ${String(value.standingParts[1])} m and tails of ${String(value.tails[0])} and ${String(value.tails[1])} m. Its load behavior is untested.${f.gripShortfall ? ` No two-hand trial is possible: ${f.gripShortfall}.` : ''}`
      : `Released after dressing: ${short === undefined ? `the bend did not keep the ${String(DRESS)} N dressing pull` : 'a tail was shorter than a crossing needs'}, so it came apart and both cords lie separate.`,
    data,
    str(j.join) ?? j.id,
  );
  return done;
}

/** One paid untie stage: draw the tucked end back off both legs, then out of the bight. */
function untie(
  c: V7ActionContext,
  j: CollectiveWork,
  cords: V7Stack[],
): V7HandlerResult {
  const w = c.world,
    n = j.completedWork - 1,
    stage = UNTIE[n] ?? '',
    [b, x] = cords,
    before = view(w, cords, str(j.join));
  if (!b || !x) return stop(c, j, 'A reserved cord is missing.');
  const kb = joinOf(b),
    kx = joinOf(x),
    pair: [V7Stack, V7Stack] = [b, x];
  if (n === 0) {
    const cond = Math.min(F.conditionOf(b), F.conditionOf(x)),
      pressed = (s: V7Stack) =>
        num(joinOf(s).conformity) >= 1 - 1e-9 &&
        trialsOf(s).some((t) => num(t.loadShare) >= F.ONSET),
      jammed = pressed(b) || pressed(x),
      problem = jammed
        ? 'a hugging arc was pressed into its crossing by an earlier load above half the breaking force and the fingers cannot draw the end back'
        : cond < F.SOUND
          ? 'too many strands at the crossings are broken to draw the end back without parting them'
          : null;
    if (problem) {
      release(
        w,
        c.actor,
        j,
        `The bend resisted untying: ${problem}. It stays as it is; nothing is refunded.`,
        false,
      );
      for (const s of pair) joinOf(s).last = jammed ? 'jammed' : 'damaged';
      remember(
        c,
        pair,
        'untie',
        jammed ? 'jammed' : 'damaged',
        { problem, condition: cond },
        'a paid bare-hand untying round',
      );
      c.emit(
        'cord-join-resisted',
        `The bend resisted untying: ${problem}. Both cords stay joined; nothing is refunded.`,
        {
          ...summary(w, j),
          operation: stage,
          problem,
          outcome: jammed ? 'jammed' : 'damaged',
          before,
          conditions: pair.map((s) => F.conditionOf(s)),
        },
        str(j.join) ?? j.id,
      );
      sync(c.actor, j);
      return { complete: true, writes: [j.id, ...j.escrow] };
    }
    place(
      w,
      joinIdOf(j),
      j.id,
      b,
      x,
      'threaded',
      {
        standing: [num(kb.standing), num(kx.standing)],
        path: [num(kb.path), num(kb.width)],
      },
      {
        support: num(kb.support),
        bightRadius: num(kb.bightRadius),
        wrapRadius: num(kb.wrapRadius),
      },
    );
    return progress(
      c,
      j,
      cords,
      stage,
      before,
      {},
      'the end was drawn back from under its entering part and off both legs; it still passes through the bight and is held by hand.',
    );
  }
  for (const s of pair) straighten(w, s, 'untied');
  remember(
    c,
    pair,
    'untie',
    'untied',
    { conditions: pair.map((s) => F.conditionOf(s)) },
    'two paid bare-hand untying rounds',
  );
  const data: V7Data = {
    ...summary(w, j),
    operation: stage,
    before,
    conditions: pair.map((s) => F.conditionOf(s)),
  };
  const done = finish(c, j, cords, false);
  data.status = j.status;
  data.nextStage = null;
  data.after = view(w, cords, null);
  data.visual = data.after;
  c.emit(
    'cord-join-untied',
    'Untied: the passes were reversed and both cords lie separate with their own lengths; any set from bending or creep is not undone.',
    data,
    str(j.join) ?? j.id,
  );
  return done;
}

/** One paid round after rechecking both reserved cords, hands, footing, room and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const w = c.world;
  if (!open(j)) throw new Error('This join work is already settled.');
  const cords = held(w, j);
  if (
    cords.length !== 2 ||
    cords.some((s) => s.reservedFor !== j.id || s.owner !== c.actor.id)
  )
    return stop(c, j, 'A reserved cord is missing.');
  if (j.mode === 'attempt' && cords.some((s) => F.conditionOf(s) < F.SOUND))
    return stop(
      c,
      j,
      'More than half of the strands of a cord are now broken; it cannot be bent into a bend.',
    );
  const blocked = F.crowded(
    w,
    c.actor,
    cords.reduce((n, s) => n + Number(F.part(s).overall), 0),
  );
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
      'cord-join-resumed',
      'Unfinished join work resumed after rechecking both cords, hands, footing, room and energy.',
      summary(w, j),
      str(j.join) ?? j.id,
    );
  return j.mode === 'untie' ? untie(c, j, cords) : tie(c, j, cords);
}

function reserve(c: V7ActionContext, j: CollectiveWork, cords: V7Stack[]) {
  for (const s of cords) {
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
    if (s.processing?.[JOIN]) joinOf(s).workId = j.id;
  }
}
function guard(c: V7ActionContext, length: number) {
  const blocked = F.crowded(c.world, c.actor, length);
  if (blocked)
    throw new Error(`No room to work: ${blocked}. Nothing was spent.`);
  if (c.actor.vitals.energy < STEP)
    throw new Error(
      'Not enough energy for the first paid round; nothing was reserved.',
    );
}
function cordIds(c: V7ActionContext): [string, string] {
  const raw = c.action.args.cordIds;
  if (
    !Array.isArray(raw) ||
    raw.length !== 2 ||
    raw.some((x) => typeof x !== 'string' || !x.trim()) ||
    raw[0] === raw[1]
  )
    throw new Error(
      'cordIds must list the exact ids of two different cords; nothing was spent.',
    );
  const [p, q] = raw as [string, string];
  return [p, q];
}

function attempt(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor;
  if (current(w, a))
    throw new Error(
      'Unfinished join work exists; resume it with its mode and workId, or cancel it. Nothing was spent.',
    );
  if (c.action.args.workId !== undefined)
    throw new Error(
      'No unfinished join work of yours has this workId; nothing was spent.',
    );
  if (v7String(c.action.args.method, 'method') !== METHOD)
    throw new Error(
      'Only a single sheet bend is supported in this version; nothing was spent.',
    );
  const cords = cordIds(c).map((id) => {
    const s = w.stacks.find((x) => x.id === id && x.owner === a.id);
    if (!s || ![...ROLES, 'joined', 'knotted'].includes(F.roleOf(s) ?? ''))
      throw new Error(
        'cordIds must be the exact ids of two of your own finished cords or cord fragments from hand-twist-fiber-cord; nothing was spent.',
      );
    return s;
  });
  const [p, q] = cords as [V7Stack, V7Stack],
    joinId = str(joinOf(p).joinId),
    loose =
      joinId !== null &&
      joinOf(q).joinId === joinId &&
      stateOf(p) === 'wrapped' &&
      stateOf(q) === 'wrapped' &&
      p.reservedFor === joinId &&
      q.reservedFor === joinId;
  if (!loose)
    for (const s of cords) {
      if (F.roleOf(s) === 'joined')
        throw new Error(
          `${s.id} is part of a join; untie that join first. Nothing was spent.`,
        );
      if (s.reservedFor)
        throw new Error(
          `${s.id} is reserved by other work; nothing was spent.`,
        );
      if (F.roleOf(s) === 'knotted' || K.state(s) !== 'straight')
        throw new Error(
          `${s.id} holds an overhand knot; untie it with hand-tie-cord-knot first. Nothing was spent.`,
        );
    }
  for (const s of cords) {
    const pp = F.part(s);
    if (!F.material(w, s.resource) || !F.STRANDS[s.resource])
      throw new Error(
        `Unsupported material: no strand law exists for ${s.resource}, so its bending is not represented; nothing was spent.`,
      );
    if (FRICTION[s.resource] === undefined)
      throw new Error(
        `Unsupported material: no fiber friction law exists for ${s.resource}, so no holding can be computed; nothing was spent.`,
      );
    if (pp.plied !== true || !(Number(pp.plyDiameter) > 0))
      throw new Error(
        `${s.id} has no represented two-ply section; nothing was spent.`,
      );
    if (F.conditionOf(s) < F.SOUND)
      throw new Error(
        `More than half of the strands of ${s.id} are broken; it cannot be bent into a bend. Nothing was spent.`,
      );
  }
  const mp = measure(w, p),
    mq = measure(w, q);
  if (!mp || !mq)
    throw new Error('A cord has no measurable geometry; nothing was spent.');
  const least = select(mp, mq, false)[0];
  if (!loose && least?.shortfall)
    throw new Error(
      `Whatever the material, ${least.shortfall}. Nothing was spent.`,
    );
  guard(c, mp.overall + mq.overall);
  const offset = loose ? 3 : 0,
    j = workCreate(c, 'attempt', TIE.length - offset);
  j.offset = offset;
  j.law = LAW;
  j.method = METHOD;
  j.join = loose ? joinId : v7Id(w, 'join');
  j.target = j.join;
  if (loose) {
    const [b, x] = members(w, joinId);
    j.bight = b?.id ?? null;
    j.wrap = x?.id ?? null;
  }
  reserve(c, j, loose ? members(w, joinId) : cords);
  c.emit(
    'cord-join-started',
    `Both cords are reserved and held for a bare-hand sheet bend${offset ? ' (dressing only: the loose bend is already wrapped and tucked)' : ''}; no tool, anchor, added fiber or second person is used.`,
    { ...summary(w, j), method: METHOD },
    joinIdOf(j),
  );
  return advance(c, j);
}

function startUntie(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor;
  if (current(w, a))
    throw new Error(
      'Unfinished join work exists; resume it with its mode and workId, or cancel it. Nothing was spent.',
    );
  if (c.action.args.workId !== undefined)
    throw new Error(
      'No unfinished join work of yours has this workId; nothing was spent.',
    );
  const [b, x] = ownJoin(c),
    tails = [num(joinOf(b).tail), num(joinOf(x).tail)];
  if (Math.min(...tails) < K.PINCH - 1e-9)
    throw new Error(
      `The tails are ${tails.join(' and ')} m; drawing an end back needs a ${String(K.PINCH)} m pinch. Nothing was spent.`,
    );
  guard(c, Number(F.part(b).overall) + Number(F.part(x).overall));
  const j = workCreate(c, 'untie', UNTIE.length);
  j.law = LAW;
  j.method = METHOD;
  j.join = str(joinOf(b).joinId);
  j.target = j.join;
  j.bight = b.id;
  j.wrap = x.id;
  reserve(c, j, [b, x]);
  c.emit(
    'cord-join-started',
    'Both joined cords are reserved and held for untying with bare hands.',
    summary(w, j),
    joinIdOf(j),
  );
  return advance(c, j);
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    { workId, joinId } = c.action.args;
  if ((workId === undefined) === (joinId === undefined))
    throw new Error(
      'Inspect needs exactly one of joinId or workId; nothing was spent.',
    );
  const j =
    typeof workId === 'string'
      ? ownJobs(w, a).find((x) => x.id === workId)
      : undefined;
  if (typeof workId === 'string' && !j)
    throw new Error(
      'No join work of yours has this workId; nothing was spent.',
    );
  const cords = j ? held(w, j) : ownJoin(c, false),
    id = j ? str(j.join) : str(joinId);
  if (cords.length !== 2)
    throw new Error(
      'The cords of this work are no longer together; nothing was spent.',
    );
  v7Spend(a, LOOK);
  const trials = cords[0] ? trialsOf(cords[0]) : [],
    joined = cords.every((s) => joinOf(s).joinId === id && id !== null),
    standing = cords.map((s) => num(joinOf(s).standing)),
    value: V7Data = {
      ...(j ? summary(w, j) : {}),
      joinId: id,
      join: view(w, cords, joined ? id : null),
      cords: cords.map((s) => F.look(w, s)),
      ledgers: cords.map((s) => {
        const k = joinOf(s);
        return {
          item: s.id,
          part: str(k.part),
          centreline: num(k.centreline),
          standing: num(k.standing),
          path: num(k.path),
          tail: num(k.tail),
          retainedCreep: num(k.retainedCreep),
        };
      }),
      trialGrips:
        joined && stateOf(cords[0] as V7Stack) === 'tied'
          ? {
              standingParts: standing,
              needed: m(K.CLEAR),
              possible: Math.min(...standing) >= K.CLEAR - 1e-9,
            }
          : null,
      joinTrials: trials,
      lastJoinTrial: trials.at(-1) ?? null,
      holdingForce: null,
      unknown:
        'holding force, slip load, safe load and behavior under other loads are not determined by inspection',
    };
  openRemember(c, {
    key: `${id ?? j?.id ?? ''}:cord-join-geometry`,
    subject: id ?? j?.id ?? '',
    property:
      'bend state, crossings, assignment, arcs, paths, standing parts, tails, condition and recorded tests',
    value: v7Json(value),
    method: 'direct inspection',
    condition: 'visible and measurable features only; no load is applied',
    verified: false,
  });
  c.emit(
    'cord-join-inspected',
    'Only visible bend geometry, condition and recorded tests are reported; no load was applied and nothing was changed.',
    value,
    id ?? j?.id ?? null,
  );
  return { complete: true, writes: [] };
}

/** Breaks one cord at its loaded arc into two owned fragments of conserved fiber and length. */
function fragment(
  w: V7World,
  a: V7Actor,
  s: V7Stack,
  at: number,
  condition: number,
  trials: V7Data[],
): V7Stack[] {
  const p = F.part(s),
    n = foodTenths(s.quantity),
    overall = Number(p.overall),
    length = Number(p.length),
    cut = m(Math.min(overall - 1e-4, Math.max(1e-4, at))),
    lengths = [cut, m(overall - cut)],
    first = Math.min(n - 1, Math.max(1, Math.round((n * cut) / overall))),
    quantities = [first, n - first],
    twisted = m((length * cut) / overall),
    plies = [twisted, m(length - twisted)],
    ids = [v7Id(w, 'item'), v7Id(w, 'item')],
    frayed = Number(p.frayedEnds ?? 0);
  return [0, 1].map((i) => {
    const f: V7Stack = {
      ...v7Clone(s),
      id: ids[i] ?? '',
      quantity: (quantities[i] ?? 0) / 10,
      quantityTenths: quantities[i] ?? 0,
      position: { ...a.position },
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
      [JOIN]: {
        law: LAW,
        revision: REVISION,
        method: METHOD,
        state: 'straight',
        joinId: null,
        workId: null,
        part: null,
        partner: null,
        width: m(2 * Number(p.plyDiameter)),
        centreline: lengths[i] ?? 0,
        standing: lengths[i] ?? 0,
        path: 0,
        tail: 0,
        crossings: 0,
        sequence: [],
        retainedCreep: 0,
        priorRole: 'fragment',
        trials,
        last: 'broke-at-bend',
        fragmentOf: s.id,
        fragments: ids,
        brokenAt: cut,
        updatedAt: w.tick,
      },
    };
    // A later knot or join of a fragment must restore the fragment role, not the parent's.
    if (processing[K.KNOT])
      processing[K.KNOT] = {
        ...record(processing[K.KNOT]),
        priorRole: 'fragment',
        workId: null,
      };
    f.processing = processing;
    return f;
  });
}

/** Opposing two-hand pull on the two standing parts through the dressed bend (cord-bend@1, part 4). */
function trial(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    [b, x] = ownJoin(c),
    id = str(joinOf(b).joinId) ?? '';
  if (stateOf(b) !== 'tied' || stateOf(x) !== 'tied')
    throw new Error(
      'joinId must name your own dressed, release-checked join; nothing was spent.',
    );
  const pair: [V7Stack, V7Stack] = [b, x],
    mats = pair.map((s) => F.material(w, s.resource)),
    laws = pair.map((s) => F.STRANDS[s.resource]),
    mu = friction(b, x);
  if (mats.some((r) => !r) || laws.some((l) => !l) || mu === null)
    throw new Error(
      'Unsupported material: no strand or friction law applies; nothing was spent.',
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
  const kb = joinOf(b),
    kx = joinOf(x),
    standing: [number, number] = [num(kb.standing), num(kx.standing)];
  if (Math.min(...standing) < K.CLEAR - 1e-9)
    throw new Error(
      `The standing parts are ${standing.join(' and ')} m; each hand needs ${String(m(K.CLEAR))} m (a ${String(F.HOLD)} m grip kept ${String(m(K.CLEAR - F.HOLD))} m clear of the bend). No force was applied; nothing was spent.`,
    );
  if (pair.some((s) => foodTenths(s.quantity) < 2))
    throw new Error(
      'A load trial needs at least 0.2 units in each cord so that a break leaves two inventory lots; nothing was spent.',
    );
  const extent = 2 * num(kx.width) + num(kb.bightRadius) + num(kb.width) / 2,
    endToEnd = standing[0] + standing[1] + extent,
    blocked = F.crowded(w, a, endToEnd);
  if (blocked)
    throw new Error(`No room to work: ${blocked}. Nothing was spent.`);
  v7Spend(a, TRIAL);
  const before = view(w, pair, id),
    loaded = pair.map((s, i) => {
      const p = F.part(s),
        k = joinOf(s),
        r = mats[i],
        law = laws[i],
        d = Number(p.plyDiameter),
        area = (Math.PI * d * d) / 4,
        cond = F.conditionOf(s),
        width = num(k.width),
        arc = num(k.arcRadius);
      if (!r || !law) throw new Error('Missing strand law.');
      return {
        s,
        p,
        k,
        r,
        law,
        d,
        area,
        cond,
        width,
        // The curvature rule of cord-knot@1: outer strands on an arc follow (R + w/2)/R.
        concentration: 1 + width / (2 * arc),
        strength: F.breaking(r, law, area, cond) / (1 + width / (2 * arc)),
        span: num(k.standing) - F.HOLD + num(k.path),
        stiffness: law.modulus * F.weakening(law, r) * F.EFFICIENCY * 2 * area,
      };
    }),
    [lb, lx] = loaded as [(typeof loaded)[0], (typeof loaded)[0]],
    hand = (F.HAND_PULL * Math.max(0, Math.min(100, a.vitals.health))) / 100,
    grip = F.GRIP * Math.min(lb.width, lx.width),
    limit = Math.min(force, hand, grip),
    ret = retention(mu, kb),
    weakest = lb.strength <= lx.strength ? 0 : 1,
    strength = Math.min(lb.strength, lx.strength),
    outcome =
      strength <= limit && (ret.load === null || strength <= ret.load)
        ? 'broke'
        : ret.load !== null && ret.load <= limit
          ? 'slipped'
          : force > grip && grip <= hand
            ? 'grip-lost'
            : 'held',
    achieved =
      outcome === 'broke'
        ? strength
        : outcome === 'slipped'
          ? (ret.load ?? limit)
          : limit,
    effect = loaded.map((l) => {
      const ratio = Math.min(1, achieved / Math.max(1e-12, l.strength)),
        damage = Math.max(0, ratio - F.ONSET);
      return {
        ratio,
        damage,
        after: v7RoundNumber(l.cond * (1 - damage)),
        extension: (achieved * l.span) / l.stiffness,
        creep:
          outcome === 'held'
            ? l.law.creep *
              F.wetness(l.r) *
              ratio *
              (seconds / F.ROUND_SECONDS) *
              l.span
            : 0,
      };
    }),
    tails = [num(kb.tail), num(kx.tail)],
    result = {
      tick: w.tick,
      actor: a.id,
      joinId: id,
      items: pair.map((s) => s.id),
      law: LAW,
      reuses: `${F.LAW} opposing two-hand trial, here on two standing parts`,
      outcome,
      requestedForce: force,
      achievedForce: F.newtons(achieved),
      handLimit: force > hand && hand < grip ? F.newtons(hand) : null,
      gripSlippedAt: outcome === 'grip-lost' ? F.newtons(grip) : null,
      slipLoad: ret.load === null ? null : F.newtons(ret.load),
      requestedDuration: seconds,
      heldSeconds: outcome === 'held' ? seconds : 0,
      slippingTail: outcome === 'slipped' ? (pair[ret.tail]?.id ?? null) : null,
      tailDisplacement: pair.map((_, i) =>
        outcome === 'slipped' && i === ret.tail
          ? m((tails[i] ?? 0) + num(joinOf(pair[i] as V7Stack).path))
          : 0,
      ),
      breakAt:
        outcome === 'broke'
          ? `${pair[weakest].id}:${weakest ? 'wrap' : 'crown'}`
          : null,
      gripStanding: standing,
      gripTails: tails,
      contactAngles: ret.angle.map(v7RoundNumber),
      concentration: loaded.map((l) => v7RoundNumber(l.concentration)),
      freeSpans: loaded.map((l) => m(l.span)),
      elasticExtension: effect.map((e) => m(e.extension)),
      retainedDeformation: effect.map((e) => m(e.creep)),
      strandsBroken: effect.map((e) => v7RoundNumber(e.damage)),
      conditionBefore: loaded.map((l) => l.cond),
      conditionAfter: effect.map((e) => e.after),
    },
    entry = (i: number): V7Data => ({
      tick: w.tick,
      outcome,
      requestedForce: force,
      achievedForce: result.achievedForce,
      heldSeconds: result.heldSeconds,
      loadShare: v7RoundNumber(effect[i]?.ratio ?? 0),
      conditionBefore: loaded[i]?.cond ?? 0,
    });
  const outputs: V7Stack[] = [];
  pair.forEach((s, i) => {
    const l = loaded[i],
      e = effect[i];
    if (!l || !e) return;
    const trials = [...trialsOf(s), entry(i)].slice(-4);
    if (outcome === 'broke' && i === weakest) {
      const at =
        num(l.k.standing) +
        (i
          ? num(kb.width)
          : 2 * num(kx.width) + (Math.PI * num(kb.bightRadius)) / 2);
      outputs.push(...fragment(w, a, s, at, e.after, trials));
      w.stacks = w.stacks.filter((y) => y !== s);
      return;
    }
    l.p.condition = e.after;
    l.k.trials = trials;
    if (outcome === 'broke' || outcome === 'slipped') {
      delete s.reservedFor;
      straighten(
        w,
        s,
        outcome === 'broke' ? 'broke-partner-freed' : 'slipped-apart',
      );
      return;
    }
    const length = Number(l.p.length),
      overall = Number(l.p.overall),
      stretched = m(length + e.creep);
    if (stretched > length) {
      // fiber-cord@1's retained stretch keeps volume; the arcs keep their radius and the standing part takes it.
      const grown = m(overall + stretched - length);
      l.p.length = stretched;
      l.p.twisted = stretched;
      l.p.overall = grown;
      l.p.plyDiameter = l.d * Math.sqrt(length / stretched);
      l.k.standing = m(num(l.k.standing) + grown - overall);
      l.k.centreline = grown;
      l.k.retainedCreep = m(num(l.k.retainedCreep) + grown - overall);
    }
  });
  remember(
    c,
    pair,
    `trial-${F.band(Math.min(lb.cond, lx.cond))}`,
    outcome,
    result,
    `opposing two-hand pull of ${String(result.achievedForce)} N on both standing parts`,
  );
  const after =
      outcome === 'broke'
        ? [...outputs, ...pair.filter((_, i) => i !== weakest)]
        : pair,
    data = {
      ...result,
      before,
      after: view(
        w,
        after,
        outcome === 'held' || outcome === 'grip-lost' ? id : null,
      ),
      visual: {
        ...view(
          w,
          after,
          outcome === 'held' || outcome === 'grip-lost' ? id : null,
        ),
        trial: {
          outcome,
          achievedForce: result.achievedForce,
          heldSeconds: result.heldSeconds,
        },
      },
      fragments: outputs.map((f) => f.id),
      energy: TRIAL,
    };
  w.stacks.push(...outputs);
  c.emit(
    'cord-join-trial',
    outcome === 'broke'
      ? `${pair[weakest].id} broke at its ${weakest ? 'turn round the legs' : 'crown'} at ${String(result.achievedForce)} N into two owned fragments of the same fiber; the join is gone.`
      : outcome === 'slipped'
        ? `The bend slipped at ${String(result.achievedForce)} N: a tail was drawn through and both cords came apart.`
        : outcome === 'grip-lost'
          ? `A standing part slipped through the hand at ${String(result.achievedForce)} N; the trial stopped.`
          : `The bend held ${String(result.achievedForce)} N for ${String(seconds)} s between both standing parts. A pass means only this force for this time, not a safe load.`,
    data,
    id,
  );
  if (
    effect.some(
      (e, i) => e.damage > 0 && !(outcome === 'broke' && i === weakest),
    )
  )
    c.emit('cord-join-damaged', 'Some strands broke under the load.', data, id);
  if (outcome === 'slipped')
    c.emit(
      'cord-join-slipped',
      'Slipped under load: the bend came apart and both conserved cords lie separate.',
      data,
      id,
    );
  if (outcome === 'broke')
    c.emit(
      'cord-join-broken',
      'Broken in the bend: two owned fragments keep all of the broken cord; the other cord is free and nothing vanished.',
      data,
      id,
    );
  return {
    complete: true,
    writes: [...outputs.map((f) => f.id), ...after.map((s) => s.id)],
  };
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    workId = c.action.args.workId,
    j = current(w, c.actor);
  if (!j || (typeof workId === 'string' && workId !== j.id))
    throw new Error(
      'No unfinished join work of yours to cancel; nothing was spent.',
    );
  const { cords, opened, retained } = release(
    w,
    c.actor,
    j,
    'Cancelled; both cords are released once as they actually are. Paid energy is not refunded.',
    false,
  );
  c.emit(
    'cord-join-cancelled',
    opened
      ? 'Join work cancelled: the unretained crossing opened when released, so both cords lie separate; nothing is refunded.'
      : retained
        ? 'Join work cancelled: the bend keeps its actual configuration and stays a linked pair; nothing is refunded or untied.'
        : 'Join work cancelled: both cords are free; nothing is refunded.',
    { ...summary(w, j), opened, retained },
    str(j.join) ?? j.id,
  );
  if (opened) released(c, j, cords);
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = v7String(c.action.args.mode, 'mode'),
    j = current(c.world, c.actor);
  if (!ARGS[mode]) throw new Error('Unknown join mode.');
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
    throw new Error('The bound join work is already settled.');
  relevant(c, mode);
  if (mode === 'attempt') return attempt(c);
  if (mode === 'untie') return startUntie(c);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'trial') return trial(c);
  return cancel(c);
}

/** Reserved cords stay in the owner's hands; an unworked round pauses; joined cords wear once. */
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
        'Not worked this round; paid stages, both reserved cords and their configuration are kept.';
      forestEvent(
        w,
        'cord-join-paused',
        'Join work paused because it was not worked this round; nothing was spent.',
        a.position,
        a.id,
        summary(w, j),
        str(j.join) ?? j.id,
      );
    }
    sync(a, j);
  }
  // fiber-cord@1 wears cords and fragments and cord-knot@1 knotted cords; joined cords wear here at that rate.
  for (const s of w.stacks) {
    const p = s.processing?.[F.PART];
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const cond = Number(p.condition ?? 0);
    if (p.role === 'joined' && cond > 0)
      p.condition = v7RoundNumber(Math.max(0, cond - F.WEAR));
  }
}

/** The cord-bend@1 friction, dressing pull and tail retention rule, exported unchanged for
 * packages that work on the same cords (ex16 hand-bind-crossing@1). */
export const CORD_BEND = {
  LAW,
  JOIN,
  FRICTION,
  DRESS,
  /** Static fiber-on-fiber friction of two cords (null: no friction law applies). */
  friction: (a: V7Stack, b: V7Stack): number | null => friction(a, b),
  retention,
};

export const LONG_FIBER_CORD_JOIN: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex16',
  dependencies: [
    'foundation-open@1',
    'hand-twist-fiber-cord@1',
    'hand-tie-cord-knot@1',
  ],
  description:
    'General bare-hand sheet bend joining two owned fiber-cord@1 cords end to end: four paid rounds on two conserved centrelines under the cord-bend@1 geometry and friction rules, inspection, a bounded two-hand trial on both standing parts that reuses the fiber-cord@1 trial, untying and cancel. The join is a relation of both items. No reward, rating or added material.',
  reuse: {
    experiment:
      'ex16 hand-twist-fiber-cord@1 (cord item, width, condition, strand law, breaking force, grip and hand limits, extension, creep, damage onset, fragments, wear and visual metadata, through its exported FIBER_CORD); ex16 hand-tie-cord-knot@1 (revision hand-tie-cord-knot@1, handler long.hand-tie-cord-knot, law cord-knot@1: bend-limit measurement, opening, pinch, trial clearance and bounds, the arc curvature rule and the staged reserved-work pattern, through its new CORD_KNOT export)',
    source:
      'long-fiber-cord.ts FIBER_CORD; long-cord-knot.ts CORD_KNOT (bend, state, KNOT, OPENING, PINCH, CLEAR, MAX_FORCE, MAX_SECONDS); collective-work.ts (paid work, stop); open-foundation.ts (personal records); forest-climate.ts (events)',
    description:
      'Implementation reuse only; both packages keep their behavior and ability text, and neither ability is a prerequisite. The overhand topology, path formula and non-spilling assumption are not reused. The two-cord sheet bend geometry, assignment, friction retention, slip, break location and untie rules are new, registered as cord-bend@1.',
  },
  abilities: [
    {
      id: ID,
      name: 'Hand-join fiber cords',
      function:
        'Join two of your own fiber cords end to end with a bare-hand sheet bend in four paid rounds, inspect it, load-trial it by both standing parts, untie it, or cancel; actual cords and material decide results.',
      equivalence: 'cordage:hand-tied-two-cord-sheet-bend:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['attempt', 'inspect', 'trial', 'untie', 'cancel'],
          },
          cordIds: { type: 'array', items: { type: 'string' } },
          method: { type: 'string', enum: [METHOD] },
          workId: { type: 'string' },
          joinId: { type: 'string' },
          trialForce: { type: 'number', minimum: 0, maximum: K.MAX_FORCE },
          trialDuration: {
            type: 'number',
            minimum: 0,
            maximum: K.MAX_SECONDS,
          },
        }),
        required: ['mode'],
      },
      references: {},
      prerequisites: [],
      learning: 3,
      learningEnergy: 0.2,
      costs:
        'Study: 3 rounds at 0.2 energy. attempt (cordIds: exact ids of two own unreserved, unknotted hand-twist-fiber-cord cords or fragments; method: sheet-bend): reserves both, then 4 paid rounds of 0.5 (measure-form-bight, pass-second-end, wrap-and-tuck, dress-release-check), continuing each round; a loose undressed join needs only the last; resume with attempt and workId only. inspect (joinId or workId): 1 round, 0.2. trial (dressed join; trialForce N above 0 to 10; trialDuration s above 0 to 60): 1 round, 0.5. untie: 2 paid rounds of 0.5 (withdraw-tucked-end, withdraw-through-bight). cancel: none. Work needs dry footing and nobody within your radius plus half of both cords. Unworked rounds or low energy pause uncharged; refusals spend nothing; no refunds.',
      effects:
        'Law cord-bend@1 keeps both items and lengths; the join is a relation. w = 2 ply diameters, a = mean w; each centreline = standing part + path in the bend + tail. Round 1 bends both to their cord-knot@1 bend limit and picks the bight that leaves both trial grips, else longer standing parts. Bight radius rB = max(limit, a), opened 0.02 m (or other w) to pass; path pi rB + 4 x other w. The other end passes up through it, round both legs at rW = max(its limit, a) and under itself: path = bight w + 2 max(0, 2rB - 2(rW - a)) + 2 pi rW + own w. Tails get 0.02 m + w; a standing part under a 0.02 m pinch is a measured shortfall. Dressing seats both arcs; slack is split between tail and standing part. Retention: friction mu 0.3 (reed; other fibers unsupported), contact angles pi a/rB and 2 pi a/rW; a tail holds while 2 mu e^(mu angle) >= 1, else up to 2 mu x 5 N / (e^(-mu angle) - 2 mu). Trial: 0.05 m grips 0.01 m clear on both standing parts; force = min(trialForce, 200 N x health/100, 10000 N/m x narrower w, slip, break); a cord breaks at fiber-cord breaking force / (1 + w/(2 x its arc radius)). Records extension, creep, strand damage above half that force, a slip parting the cords or a break into two owned fragments. Untying needs condition 0.5; a hugging arc loaded above half its breaking force jams. Released unretained crossings open. Joined cords wear 0.0005 per round, once. A pass means only that force for that time. No reward or rating.',
      handler: 'long.hand-join-fiber-cords',
      revision: REVISION,
      authored: false,
      // The tied event carries no qualified flag: a join earns no milestone.
      practiceEvidence: 'cord-join-tied',
      dependencies: { abilities: [], resources: ['reed'], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Paid stages persist across interruption; resuming by workId pays only the next stage after rechecks. Other modes take one round.',
      },
    },
  ],
  handlers: { 'long.hand-join-fiber-cords': execute },
  processes: {},
  visualComponents: [],
  events: [
    'cord-join-started',
    'cord-join-stage',
    'cord-join-infeasible',
    'cord-join-paused',
    'cord-join-resumed',
    'cord-join-released',
    'cord-join-tied',
    'cord-join-slipped',
    'cord-join-resisted',
    'cord-join-untied',
    'cord-join-cancelled',
    'cord-join-stopped',
    'cord-join-inspected',
    'cord-join-trial',
    'cord-join-damaged',
    'cord-join-broken',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath(w, a) {
    for (const j of ownJobs(w, a).filter(open)) {
      const { opened } = release(
        w,
        a,
        j,
        'Performer died; both cords were left where they died, once, as they actually are. Nothing is refunded.',
        true,
      );
      forestEvent(
        w,
        'cord-join-stopped',
        'Join work stopped by death; both cords lie where the person died in their actual configuration.',
        a.position,
        a.id,
        summary(w, j),
        str(j.join) ?? j.id,
      );
      if (opened)
        forestEvent(
          w,
          'cord-join-released',
          'Released without hands at death, the unretained crossing opened: both cords lie separate.',
          a.position,
          a.id,
          summary(w, j),
          str(j.join) ?? j.id,
        );
      sync(a, j);
    }
  },
};
