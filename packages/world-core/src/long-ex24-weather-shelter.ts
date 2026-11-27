import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Spatial,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import {
  v7Id,
  v7Json,
  v7Number,
  v7Record,
  v7RoundNumber,
  v7String,
} from './continuous-data.js';
import {
  v7Inside,
  v7Local,
  v7Reach,
  v7ShapesOverlap,
} from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { forestResolveReference } from './forest-references.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { materialPortion } from './material-lots.js';
import { openConditions } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workCreate,
  workFind,
  workPay,
  workReserve,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import {
  ex19MaterialContact,
  ex19MaterialGround,
} from './long-ex19-material-contact.js';
import { rackAt } from './long-ex24-ventilated-storage-physics.js';
import {
  SHELTER_PART as PART,
  SHELTER_RAIN_KG,
  SHELTER_SLOPE as SLOPE,
  SHELTER_SLOTS as SLOTS,
  WEATHER_SHELTER as G,
  WEATHER_SHELTER_KIND as KIND,
  WEATHER_SHELTER_REVISION as REVISION,
  shelterBeddingDry,
  shelterBodies,
  shelterCordNeed,
  shelterCover,
  shelterDrying,
  shelterFits,
  shelterJointCondition,
  shelterJointList,
  shelterJoints,
  shelterMeasure,
  shelterMinLength,
  shelterOccupants,
  shelterPanelCover,
  shelterPanelList,
  shelterPanels,
  shelterParts,
  shelterUnsuitable,
  shelterWithheld,
} from './long-ex24-weather-shelter-physics.js';
import type {
  ShelterJoint,
  ShelterMeasure,
  ShelterPanel,
  ShelterPart,
} from './long-ex24-weather-shelter-physics.js';

/** ex24: construct and maintain a small weather shelter. A hand-lashed, low A-frame of 20 wood
 * rods carries a tied thin-stem covering and dry bedding for one reclining person. Staged paid
 * work moves escrowed inputs into one shelter object; only a passing final inspection makes it
 * complete, and protection follows actual position, fit and capacity through the exposure hook
 * (long-ex24-weather-shelter-physics). Water balance and wear run every round. */

const ID = 'construct-weather-shelter';
const HANDLER = `long.${ID}`;
const STATE = `long:work:${ID}`;
const MODES = ['inspect', 'build', 'repair', 'dismantle', 'cancel'] as const;
const ROLES = ['rod', 'binding', 'thatch', 'bedding'];
/** Every paid round costs 1 energy (specification). */
const ENERGY = 1;
/** Repair work: one round per rod or metre of cord, or per 0.05 m3 of covering or bedding. */
const REPAIR_VOLUME = 0.05;
/** Share of rain met by the covering that the stems hold, up to their own dry mass of water. */
const RETAIN = 0.5;
const HOLD = 1;
/** Friction of a vine lashing on wood and the safety factor of the joint check. */
const FRICTION = 0.3;
const SAFETY = 2;
/** material-geometry@1 wood strength (Pa) as restated by ex19 lever-mass-comparator@1. */
const WOOD_STRENGTH = 45e6;
const GRAVITY = 9.81;
/** Design wind pressure at the 5 m/s rating: 0.5 x 1.2 kg/m3 x (5 m/s)^2. */
const WIND_PRESSURE = 15;
/** Tributary covering area (m2) of a joint by kind; a tie of a thatch panel bears the panel. */
const TRIBUTARY = {
  apex: v7RoundNumber(SLOPE * (G.length / 2)),
  foot: v7RoundNumber(SLOPE * (G.length / 2)),
  batten: v7RoundNumber((SLOPE / 2) * (G.length / 4)),
};
const ROOF_AREA = v7RoundNumber(2 * SLOPE * G.length + (G.width * G.ridge) / 2);
const FLOOR_AREA = G.width * G.length;
/** Nine paid rounds after the 1-round inspection. */
const STAGES: {
  stage: string;
  rods?: (s: (typeof SLOTS)[number]) => boolean;
  joints?: (j: ShelterJoint) => boolean;
  panels?: string[];
  bedding?: boolean;
}[] = [
  {
    stage: 'legs-and-apex-lashings',
    rods: (s) => s.role === 'leg',
    joints: (j) => j.kind === 'apex',
  },
  {
    stage: 'ridge-rails-and-foot-lashings',
    rods: (s) => s.role === 'ridge' || s.role === 'rail',
    joints: (j) => j.kind === 'foot',
  },
  {
    stage: 'left-battens',
    rods: (s) => s.role === 'batten' && s.side === 'L',
    joints: (j) =>
      j.kind === 'batten' && !!j.members[0]?.startsWith('batten-L'),
  },
  {
    stage: 'right-battens',
    rods: (s) => s.role === 'batten' && s.side === 'R',
    joints: (j) =>
      j.kind === 'batten' && !!j.members[0]?.startsWith('batten-R'),
  },
  {
    stage: 'lower-courses',
    panels: ['L-lower-0', 'L-lower-1', 'R-lower-0', 'R-lower-1'],
  },
  { stage: 'left-upper-course', panels: ['L-upper-0', 'L-upper-1'] },
  { stage: 'right-upper-course', panels: ['R-upper-0', 'R-upper-1'] },
  { stage: 'rear-end', panels: ['rear'] },
  { stage: 'bedding-and-final-inspection', bedding: true },
];
const TOTAL = STAGES.length + 1;

type Take = { escrow: string; tenths: number };
interface Plan extends V7Data {
  rods: { slot: string; escrow: string }[];
  strands: { escrow: string; length: number }[];
  thatch: { panel: string; takes: Take[] }[];
  bedding: Take[];
}
interface Job extends CollectiveWork {
  plan: Plan;
  cordUsed: number;
  previous: string;
  replace: V7Data;
}

const round = (x: number) => v7RoundNumber(x);
/** Volumes in reports to 0.0001 m3. */
const shown = (x: number) => Math.round(x * 1e4) / 1e4;
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const nothing = (why: string) => new Error(`${why} Nothing was spent.`);
const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const jobs = (w: V7World) => collectiveJobs(w, ID).map((j) => j as Job);
const sync = (a: V7Actor, j: CollectiveWork) => {
  a.extensionState[STATE] = v7Json(j);
};
const shelters = (w: V7World) => w.objects.filter((o) => o.kind === KIND);
const statusOf = (o: V7Object) => text(o.data.status) || 'planned';
const color = (w: V7World, resource: string) =>
  w.resources.find((r) => r.id === resource)?.color ?? '#8d704e';
const tenthsOf = (s: { quantity: number }) => foodTenths(s.quantity);
const lotVolume = (p: V7Data) =>
  Number(p.unitVolume ?? 0) * Number(p.quantity ?? 0);
function omit(value: object, keys: string[]): V7Data {
  const out: V7Data = {};
  for (const [k, v] of Object.entries(value) as [string, unknown][])
    if (!keys.includes(k) && v !== undefined) out[k] = v7Json(v);
  return out;
}
const PART_KEYS = [
  'escrow',
  'role',
  'slot',
  'condition',
  'installedAt',
  'sourceOwner',
  'diameter',
  'length',
  'unitVolume',
  'waterShare',
  'breaking',
  'mass',
];

function spatial(s: { x: number; y: number; angle: number }): V7Spatial {
  return {
    x: s.x,
    y: s.y,
    angle: s.angle,
    shape: { kind: 'rectangle', width: G.outer.width, height: G.outer.length },
    solid: false,
    reserved: true,
    interaction: 0.65,
    entrances: [],
  };
}
/** A local rectangle (centre u, v; size along x and y) as a solid test shape. */
function area(
  s: { x: number; y: number; angle: number },
  u: number,
  v: number,
  across: number,
  along: number,
): V7Spatial {
  return {
    ...rackAt(s, u, v),
    angle: s.angle,
    shape: { kind: 'rectangle', width: across, height: along },
    solid: true,
    interaction: 0,
    entrances: [],
  };
}
const body = (a: V7Actor): V7Spatial => ({
  ...a.position,
  angle: 0,
  shape: { kind: 'circle', radius: a.radius },
  solid: true,
  interaction: 0,
  entrances: [],
});
const footprint = (s: { x: number; y: number; angle: number }) =>
  area(s, 0, 0, G.outer.width, G.outer.length);
const approach = (s: { x: number; y: number; angle: number }) =>
  area(s, 0, -G.outer.length / 2 - G.approach / 2, G.width, G.approach);
const working = (s: { x: number; y: number; angle: number }) =>
  area(
    s,
    0,
    0,
    G.outer.width + 2 * G.clearance,
    G.outer.length + 2 * G.clearance,
  );

/** Visible site problems: ground, hazards, vegetation and objects, people and enclosure. */
function siteProblems(
  w: V7World,
  s: { x: number; y: number; angle: number },
  actor: string,
  self: string | null,
): string[] {
  const points = [
      [0, 0],
      [-G.outer.width / 2, -G.outer.length / 2],
      [G.outer.width / 2, -G.outer.length / 2],
      [-G.outer.width / 2, G.outer.length / 2],
      [G.outer.width / 2, G.outer.length / 2],
      [0, -G.outer.length / 2 - G.approach],
    ].map(([u = 0, v = 0]) => rackAt(s, u, v)),
    foot = footprint(s),
    front = approach(s),
    clear = working(s),
    others = w.objects.filter((o) => o.id !== self),
    problems: string[] = [];
  if (points.some((p) => ex19MaterialGround(w, p)))
    problems.push(
      'the ground is water, a wet bank or waterlogged, not firm and drained',
    );
  if (points.some((p) => openConditions(w, p).hazards.length))
    problems.push('the ground is under a hazard');
  const blocking = others
    .filter(
      (o) =>
        v7ShapesOverlap(foot, { ...o.spatial, solid: true }) ||
        v7ShapesOverlap(front, { ...o.spatial, solid: true }),
    )
    .map((o) => o.id);
  if (blocking.length)
    problems.push(
      `the footprint or entrance overlaps ${blocking.join(', ')}; clearing is not done here`,
    );
  const solids = others
    .filter(
      (o) =>
        o.spatial.solid &&
        !blocking.includes(o.id) &&
        v7ShapesOverlap(clear, o.spatial),
    )
    .map((o) => o.id);
  if (solids.length)
    problems.push(`the working clearance holds ${solids.join(', ')}`);
  const living = w.actors.filter((x) => x.vitals.health > 0);
  if (living.some((x) => v7ShapesOverlap(foot, body(x))))
    problems.push('a person is on the footprint');
  if (
    living.some(
      (x) =>
        x.id !== actor &&
        (v7ShapesOverlap(front, body(x)) || v7ShapesOverlap(clear, body(x))),
    )
  )
    problems.push('another person is in the entrance or working clearance');
  if (forestClimate(w, s).indoor) problems.push('the site is enclosed');
  if (!v7Inside(w, s, G.outer.length))
    problems.push('the site is at the world edge');
  return problems;
}

interface Entry {
  stack: V7Stack;
  tenths: number;
  role: string;
}
/** Owned items named with a role; one item may serve two roles within its quantity. */
function entries(c: V7ActionContext, roles: string[]): Entry[] {
  const raw = c.action.args.materials;
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 24)
    throw nothing('materials lists up to 24 {itemId, quantity, role} entries.');
  const used = new Map<string, number>();
  return raw.map((v: unknown) => {
    let r, quantity, role, id, tenths;
    try {
      r = v7Record(v);
      quantity = v7Number(r.quantity, 'quantity', 0.1);
      tenths = foodTenths(quantity);
      role = v7String(r.role, 'role');
      id = forestResolveReference(
        c.world,
        c.actor,
        v7String(r.itemId, 'itemId'),
        'owned',
        quantity,
      );
    } catch (error) {
      throw nothing(
        `materials: ${error instanceof Error ? error.message : 'unusable entry'}`,
      );
    }
    if (!roles.includes(role))
      throw nothing(`role is one of ${roles.join(', ')}.`);
    const stack = c.world.stacks.find((s) => s.id === id);
    if (!stack || stack.owner !== c.actor.id)
      throw nothing(`${id} is not one of your carried items.`);
    if (stack.reservedFor)
      throw nothing(`${id} is reserved for unfinished work.`);
    const total = (used.get(id) ?? 0) + tenths;
    if (total > tenthsOf(stack))
      throw nothing(`${id} holds ${String(stack.quantity)}, less than named.`);
    if (['rod', 'binding'].includes(role) && tenths % 10)
      throw nothing('Rods and binding are named in whole units.');
    used.set(id, total);
    return { stack, tenths, role };
  });
}

interface Survey {
  deficits: string[];
  rods: { stack: V7Stack; slot: string; m: ShelterMeasure }[];
  strands: { stack: V7Stack; m: ShelterMeasure }[];
  thatch: { panel: string; takes: { stack: V7Stack; tenths: number }[] }[];
  bedding: { stack: V7Stack; tenths: number }[];
  joints: ShelterJoint[];
  cordNeed: number;
  metres: number;
  thatchVolume: number;
  beddingVolume: number;
  measured: V7Data[];
}
/** Record-level measures of the named items against the recipe's needs. `need` limits the
 * survey to some roles (repair); the plan takes only what is needed, in the order named. */
function survey(
  w: V7World,
  list: Entry[],
  need: {
    rods: string[];
    cord: number | null;
    panels: ShelterPanel[];
    bedding: number;
  },
  rodDiameters: Record<string, number>,
): Survey {
  const measured: V7Data[] = [],
    deficits: string[] = [],
    bad = new Set<string>();
  const of = (role: string) => list.filter((e) => e.role === role);
  const judge = (e: Entry) => {
    const m = shelterMeasure(w, e.stack),
      why = shelterUnsuitable(m, e.role),
      contact = ex19MaterialContact(w, e.stack);
    measured.push({
      item: e.stack.id,
      role: e.role,
      quantity: e.tenths / 10,
      ...(v7Json(m) as V7Data),
      suitable: !why,
      problem: why,
      contaminated: contact.contaminated,
      fractured: contact.fractured,
    });
    if (why && !bad.has(e.stack.id)) {
      bad.add(e.stack.id);
      deficits.push(`${e.stack.id}: ${why}`);
    }
    return why ? null : m;
  };
  // Rods: whole units into the open slots in order.
  const rods: Survey['rods'] = [];
  for (const e of of('rod')) {
    const m = judge(e);
    if (!m?.rod) continue;
    for (let i = 0; i < e.tenths / 10 && rods.length < need.rods.length; i++) {
      const slot = need.rods[rods.length] ?? '',
        role = SLOTS.find((s) => s.slot === slot)?.role ?? 'leg';
      if (m.rod.length + 1e-9 < shelterMinLength(role)) {
        deficits.push(
          `${e.stack.id}: a ${String(m.rod.length)} m rod is short for ${slot} (at least ${String(shelterMinLength(role))} m)`,
        );
        break;
      }
      rods.push({ stack: e.stack, slot, m });
    }
  }
  if (rods.length < need.rods.length)
    deficits.push(
      `rods: ${String(rods.length)} of ${String(need.rods.length)} suitable rods named`,
    );
  const d = { ...rodDiameters };
  for (const r of rods) d[r.slot] = r.m.rod?.diameter ?? G.diameter;
  for (const s of SLOTS) d[s.slot] ??= G.diameter;
  const joints = shelterJoints(d),
    cordNeed = need.cord ?? shelterCordNeed(joints);
  // Binding: whole strands until the metres are covered.
  const strands: Survey['strands'] = [];
  let metres = 0;
  for (const e of of('binding')) {
    const m = judge(e);
    if (!m?.strand) continue;
    for (let i = 0; i < e.tenths / 10 && metres + 1e-9 < cordNeed; i++) {
      strands.push({ stack: e.stack, m });
      metres += m.strand.length;
    }
  }
  if (metres + 1e-9 < cordNeed)
    deficits.push(
      `binding: ${String(round(metres))} of ${String(cordNeed)} m of suitable strand named`,
    );
  // Covering: tenths per panel, greedy in the order named; bedding likewise.
  const pool = (role: 'thatch' | 'bedding') =>
    of(role).flatMap((e) => {
      const m = judge(e);
      return m?.stem
        ? [{ stack: e.stack, left: e.tenths, per: m.stem[role] / 10 }]
        : [];
    });
  const cover = pool('thatch'),
    thatch: Survey['thatch'] = [];
  let thatchVolume = 0;
  let short = false;
  for (const p of need.panels) {
    const takes: { stack: V7Stack; tenths: number }[] = [];
    let got = 0;
    for (const q of cover) {
      if (got + 1e-9 >= p.volume) break;
      if (!q.left) continue;
      const n = Math.min(q.left, Math.ceil((p.volume - got) / q.per - 1e-9));
      q.left -= n;
      got += n * q.per;
      takes.push({ stack: q.stack, tenths: n });
    }
    if (got + 1e-9 < p.volume) short = true;
    thatchVolume += got;
    thatch.push({ panel: p.id, takes });
  }
  const neededThatch = need.panels.reduce((n, p) => n + p.volume, 0);
  if (short)
    deficits.push(
      `covering: ${String(shown(thatchVolume))} of ${String(shown(neededThatch))} m3 of measurable dry thin stems named`,
    );
  const bed = pool('bedding'),
    bedding: Survey['bedding'] = [];
  let beddingVolume = 0;
  for (const q of bed) {
    if (beddingVolume + 1e-9 >= need.bedding) break;
    const n = Math.min(
      q.left,
      Math.ceil((need.bedding - beddingVolume) / q.per - 1e-9),
    );
    if (!n) continue;
    beddingVolume += n * q.per;
    bedding.push({ stack: q.stack, tenths: n });
  }
  if (beddingVolume + 1e-9 < need.bedding)
    deficits.push(
      `bedding: ${String(shown(beddingVolume))} of ${String(need.bedding)} m3 of measurable dry bedding named`,
    );
  return {
    deficits,
    rods,
    strands,
    thatch,
    bedding,
    joints,
    cordNeed,
    metres: round(metres),
    thatchVolume: round(thatchVolume),
    beddingVolume: round(beddingVolume),
    measured,
  };
}

/** Covering load (Pa): covering mass with the water it can hold, plus the rated wind pressure. */
function pressure(lots: { mass: number; solids: number }[]) {
  const mass = lots.reduce((n, l) => n + l.mass + HOLD * l.solids, 0);
  return round((mass * GRAVITY) / ROOF_AREA + WIND_PRESSURE);
}
/** Friction capacity (N) of a joint lashed with these strands at their weakest condition. */
const capacity = (j: ShelterJoint, breaking: number, condition: number) =>
  round((j.wraps * 2 * breaking * FRICTION * condition) / SAFETY);
const jointLoad = (j: ShelterJoint, p: number) =>
  round(
    p *
      (j.kind === 'thatch'
        ? (shelterPanels().find((x) => `thatch-${x.id}` === j.id)?.area ?? 0)
        : TRIBUTARY[j.kind]),
  );
/** Bending stress (Pa) of a batten or ridge rod over the 0.8 m frame spacing. */
const bending = (diameter: number, p: number) => {
  const w = p * (SLOPE / 2) * 2,
    span = G.length / 2;
  return round((w * span ** 2) / 8 / ((Math.PI * diameter ** 3) / 32));
};

/** Design checks of a set of rods, strands and covering: geometry, overlap, joints, bending. */
function design(
  rods: { slot: string; diameter: number; length: number; condition: number }[],
  joints: ShelterJoint[],
  strandOf: (j: ShelterJoint) => { breaking: number; condition: number } | null,
  lots: { mass: number; solids: number }[],
) {
  const p = pressure(lots),
    bySlot = (slot: string) => rods.find((r) => r.slot === slot),
    runs = [
      'ridge',
      'rail-L',
      'rail-R',
      'batten-L-lower',
      'batten-L-upper',
      'batten-R-lower',
      'batten-R-upper',
    ],
    overlaps = runs.map((run) => {
      const a = bySlot(`${run}-0`),
        b = bySlot(`${run}-1`);
      return {
        run,
        overlap: a && b ? round(a.length + b.length - G.length) : null,
      };
    }),
    loads = joints.map((j) => {
      const s = strandOf(j),
        load = jointLoad(j, p),
        cap = s ? capacity(j, s.breaking, s.condition) : 0;
      j.load = load;
      j.capacity = cap;
      return {
        joint: j.id,
        load,
        capacity: cap,
        held: !!s && s.condition >= G.loose && cap >= load,
      };
    }),
    stressed = rods
      .filter((r) => r.slot.startsWith('batten') || r.slot.startsWith('ridge'))
      .map((r) => ({ slot: r.slot, stress: bending(r.diameter, p) })),
    allowed = WOOD_STRENGTH / SAFETY;
  const tests = [
    {
      test: 'rods present, sound and of the declared size',
      passed:
        rods.length === G.rods &&
        rods.every(
          (r) =>
            r.condition >= G.loose &&
            Math.round(r.diameter / G.precision) * G.precision + 1e-9 >=
              G.diameter &&
            r.length + 1e-9 >=
              shelterMinLength(
                SLOTS.find((s) => s.slot === r.slot)?.role ?? 'leg',
              ),
        ),
      measured: {
        rods: rods.length,
        thinnest: rods.length ? Math.min(...rods.map((r) => r.diameter)) : null,
        shortest: rods.length ? Math.min(...rods.map((r) => r.length)) : null,
      },
    },
    {
      test: 'rods overlap at the middle frame',
      passed: overlaps.every(
        (o) => o.overlap !== null && o.overlap + 1e-9 >= G.overlap,
      ),
      measured: { required: G.overlap, overlaps },
    },
    {
      test: 'every joint is lashed and holds its design load',
      passed: loads.every((l) => l.held),
      measured: {
        pressurePa: p,
        weakest: loads.length
          ? loads.reduce((a, b) =>
              b.capacity - b.load < a.capacity - a.load ? b : a,
            )
          : null,
        failed: loads.filter((l) => !l.held).map((l) => l.joint),
      },
    },
    {
      test: 'battens and ridge carry the covering',
      passed:
        stressed.length === 10 && stressed.every((s) => s.stress <= allowed),
      measured: {
        allowedPa: allowed,
        largestPa: stressed.length
          ? Math.max(...stressed.map((s) => s.stress))
          : null,
      },
    },
  ];
  return { tests, passed: tests.every((t) => t.passed), pressure: p };
}

/** The installed state as design inputs. */
function installedDesign(o: V7Object) {
  const rods = shelterParts(o, 'rods').map((r) => ({
      slot: r.slot,
      diameter: Number(r.diameter ?? 0),
      length: Number(r.length ?? 0),
      condition: r.condition,
    })),
    strands = shelterParts(o, 'strands'),
    lots = shelterPanelList(o).flatMap((p) =>
      p.lots.map((l) => ({
        mass: Number(l.mass ?? 0),
        solids: Number(l.mass ?? 0) * (1 - Number(l.waterShare ?? 0)),
      })),
    );
  return design(
    rods,
    shelterJointList(o),
    (j) => {
      const list = strands.filter((s) => j.strands.includes(s.id));
      return list.length
        ? {
            breaking: Math.min(...list.map((s) => Number(s.breaking ?? 0))),
            condition: shelterJointCondition(o, j),
          }
        : null;
    },
    lots,
  );
}

/** The final geometry, tie and coverage inspection. */
function verify(w: V7World, o: V7Object) {
  const d = installedDesign(o),
    panels = shelterPanelList(o),
    cover = o.data.cover as V7Data | undefined,
    bedding = o.data.bedding as V7Data | undefined,
    site = siteProblems(w, o.spatial, '', o.id).filter(
      (p) =>
        !p.startsWith('another person') &&
        !p.startsWith('a person') &&
        !p.startsWith('the working clearance'),
    );
  const tests = [
    ...d.tests,
    {
      test: 'covering laid in full, sound and dry',
      passed:
        panels.length === 9 &&
        panels.every(
          (p) =>
            p.installed + 1e-9 >= p.volume &&
            shelterPanelCover(o, p) >= 1 - 1e-9,
        ) &&
        Number(cover?.waterShare ?? 1) <= G.dry + 1e-9,
      measured: {
        covered: shelterCover(o, true),
        waterShare: cover?.waterShare ?? null,
        short: panels
          .filter((p) => p.installed + 1e-9 < p.volume)
          .map((p) => p.id),
      },
    },
    {
      test: 'bedding laid in full and dry',
      passed: shelterBeddingDry(o),
      measured: {
        installed: bedding?.installed ?? 0,
        required: G.bedding,
        waterShare: bedding?.waterShare ?? null,
      },
    },
    {
      test: 'floor firm and drained, entrance clear',
      passed: !site.length,
      measured: { problems: site },
    },
  ];
  return { tests, passed: tests.every((t) => t.passed) };
}
function check(w: V7World, o: V7Object, actor: string | null) {
  const v = verify(w, o);
  o.data.tests = [
    ...(Array.isArray(o.data.tests) ? o.data.tests : []),
    { tick: w.tick, by: actor, passed: v.passed, tests: v7Json(v.tests) },
  ].slice(-3);
  o.data.status = v.passed ? 'complete' : 'failed';
  refresh(w, o);
  return v;
}

/** Covering and bedding composition with held water: per-lot dry solids and water share. */
function moisture(o: V7Object, key: 'cover' | 'bedding', lots: V7Data[]) {
  const rec = (o.data[key] ?? {}) as V7Data,
    mass = lots.reduce((n, l) => n + Number(l.mass ?? 0), 0),
    water = lots.reduce(
      (n, l) => n + Number(l.mass ?? 0) * Number(l.waterShare ?? 0),
      0,
    ),
    held = Number(rec.held ?? 0);
  return {
    mass: round(mass),
    solids: round(mass - water),
    held: round(held),
    waterShare: mass > 0 ? round((water + held) / (mass + held)) : 0,
  };
}
const coverLots = (o: V7Object) => shelterPanelList(o).flatMap((p) => p.lots);
const beddingLots = (o: V7Object) =>
  Array.isArray((o.data.bedding as V7Data | undefined)?.lots)
    ? ((o.data.bedding as V7Data).lots as V7Data[])
    : [];

function refresh(w: V7World, o: V7Object) {
  const status = statusOf(o),
    rods = shelterParts(o, 'rods'),
    joints = shelterJointList(o),
    panels = shelterPanelList(o),
    bedLots = beddingLots(o),
    cover = moisture(o, 'cover', coverLots(o)),
    bed = moisture(o, 'bedding', bedLots),
    water = (o.data.water ?? {}) as V7Data,
    climate = forestClimate(w, o.spatial),
    occupants = shelterOccupants(o),
    withheld = shelterWithheld(
      w,
      o,
      climate.rain ?? 0,
      climate.wind ?? 0,
      climate.temperature,
    ),
    lashed = joints.filter((j) => j.strands.length),
    conditions = lashed.map((j) => shelterJointCondition(o, j));
  o.data.cover = { ...((o.data.cover ?? {}) as V7Data), ...cover };
  o.data.bedding = {
    ...((o.data.bedding ?? {}) as V7Data),
    ...bed,
    installed: round(bedLots.reduce((n, l) => n + lotVolume(l), 0)),
  };
  o.visual.state = status;
  const rounds = Number(o.data.rounds ?? 0),
    covered = shelterCover(o, true);
  o.data.view = {
    component: KIND,
    shelter: o.id,
    type: 'hand-lashed low A-frame thatched shelter for one reclining person',
    owner: text(o.data.owner) || null,
    status,
    stage: o.data.stage ?? null,
    position: { x: o.spatial.x, y: o.spatial.y },
    orientation: o.data.orientation ?? 0,
    footprint: { length: G.length, width: G.width, outer: v7Json(G.outer) },
    ridgeHeight: G.ridge,
    entrance: { end: 'front', width: G.width, height: G.ridge, open: true },
    work: {
      completed: rounds,
      required: TOTAL,
      fraction: round(rounds / TOTAL),
    },
    rods: rods.map((r) => {
      const s = SLOTS.find((x) => x.slot === r.slot);
      return {
        slot: r.slot,
        role: s?.role ?? null,
        side: s?.side ?? null,
        row: s?.row ?? null,
        from: s?.from ?? 0,
        to: s?.to ?? 0,
        condition: round(r.condition),
        color: color(w, r.resource),
      };
    }),
    joints: {
      lashed: lashed.length,
      total: joints.length,
      weakest: conditions.length ? round(Math.min(...conditions)) : null,
      broken: conditions.filter((c) => c < G.loose).length,
    },
    panels: panels.map((p) => ({
      id: p.id,
      side: p.side,
      course: p.course,
      bay: p.bay,
      laid: p.volume > 0 ? round(Math.min(1, p.installed / p.volume)) : 0,
      cover: shelterPanelCover(o, p),
      condition: round(p.condition),
    })),
    coveredFraction: covered,
    materials: {
      rods: rods[0] ? color(w, rods[0].resource) : null,
      binding: shelterParts(o, 'strands')[0]
        ? color(w, shelterParts(o, 'strands')[0]?.resource ?? '')
        : null,
      covering: coverLots(o)[0]
        ? color(w, text(coverLots(o)[0]?.resource))
        : null,
      bedding: bedLots[0] ? color(w, text(bedLots[0].resource)) : null,
    },
    moisture: {
      covering: cover.waterShare,
      held: cover.held,
      saturated: water.saturated === true,
      bedding: bed.waterShare,
    },
    bedding: {
      laid: round(Number(o.data.bedding.installed ?? 0) / G.bedding),
      dry: shelterBeddingDry(o),
    },
    dripping: Number(water.leakage ?? 0) > 0,
    occupants: occupants.length,
    protectionActive:
      status === 'complete' &&
      !withheld &&
      occupants.length === 1 &&
      shelterBodies(w, o).length === 1,
    withheld,
  };
}

function summary(w: V7World, j: Job): V7Data {
  const o = w.objects.find((o) => o.id === j.target);
  return {
    workId: j.id,
    mode: j.mode,
    shelter: j.target,
    status: j.status,
    completedRounds: j.completedWork,
    remainingRounds: j.remainingWork,
    paidEnergy: round(j.paidEnergy),
    reserved: v7Json(
      j.escrow.filter((id) =>
        w.stacks.some((s) => s.id === id && s.reservedFor === j.id),
      ),
    ),
    view: o?.data.view ?? null,
  };
}

/** Moves `tenths` of a stack (all of it by default) into the shelter as one installed part. */
function install(
  w: V7World,
  s: V7Stack,
  role: string,
  slot: string,
  owner: string,
  extra: V7Data,
  tenths = tenthsOf(s),
): ShelterPart {
  const portion = materialPortion(s, tenths),
    m = shelterMeasure(w, portion),
    part = {
      ...omit(portion, ['reservedFor', 'owner', 'position', 'processing']),
      role,
      slot,
      condition: m.condition,
      installedAt: w.tick,
      sourceOwner: owner,
      waterShare: m.waterShare,
      mass: round(m.unitMass * portion.quantity),
      ...extra,
    } as unknown as ShelterPart;
  foodSetQuantity(s, tenthsOf(s) - tenths);
  return part;
}
/** A removed part becomes an unowned ground stack at the shelter with its condition and water. */
function release(w: V7World, o: V7Object, p: V7Data, held = 0): string {
  const id = v7Id(w, 'item'),
    quantity = Number(p.quantity ?? 0),
    unitMass = quantity > 0 ? Number(p.mass ?? 0) / quantity : 0,
    unitWater =
      unitMass * Number(p.waterShare ?? 0) +
      (quantity > 0 ? held / quantity : 0);
  const stack = {
    ...(omit(p, PART_KEYS) as unknown as V7Stack),
    id,
    owner: null,
    position: { x: o.spatial.x, y: o.spatial.y },
    processing: {
      [PART]: {
        shelter: o.id,
        role: text(p.role),
        slot: text(p.slot),
        part: text(p.id),
        condition: round(Number(p.condition ?? 1)),
        removedAt: w.tick,
      },
    },
  } as V7Stack;
  if (held > 0 || stack.physical)
    stack.physical = {
      unitMass: round(unitMass + (quantity > 0 ? held / quantity : 0)),
      unitWater: round(unitWater),
      unitSolids: round(unitMass * (1 - Number(p.waterShare ?? 0))),
    };
  w.stacks.push(stack);
  return id;
}

function pause(c: V7ActionContext, j: Job, reason: string): V7HandlerResult {
  j.status = 'paused';
  j.reason = reason;
  const o = c.world.objects.find((o) => o.id === j.target);
  if (o) refresh(c.world, o);
  c.emit(
    'weather-shelter-paused',
    `${reason} Completed rounds, installed parts and reserved inputs are kept; nothing was spent.`,
    summary(c.world, j),
    j.target,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id] };
}

/** Rechecks before a paid round; 'lost' when a reserved input is gone. */
function recheck(c: V7ActionContext, j: Job, o: V7Object): string | null {
  const w = c.world;
  if (!v7Reach(c.actor, o.spatial))
    return 'The shelter site is beyond working reach.';
  if (j.mode === 'build') {
    const p = siteProblems(w, o.spatial, c.actor.id, o.id).filter(
      (x) => !x.startsWith('the working clearance'),
    );
    if (p.length) return `The site changed: ${p.join('; ')}.`;
  } else if (shelterBodies(w, o).length)
    return 'A person is inside; work waits until occupants leave by themselves.';
  if (c.actor.vitals.energy + 1e-9 < ENERGY)
    return 'Not enough energy for the next paid round.';
  if (
    needed(j, o).some(
      (id) => !w.stacks.some((x) => x.id === id && x.reservedFor === j.id),
    )
  )
    return 'lost';
  return null;
}
/** Escrow ids that the remaining rounds still build in. */
function needed(j: Job, o: V7Object): string[] {
  if (j.mode === 'dismantle') return [];
  if (j.mode === 'repair') return [...j.escrow];
  const next = STAGES.slice(j.completedWork),
    slots = SLOTS.filter((s) => next.some((t) => t.rods?.(s))).map(
      (s) => s.slot,
    ),
    panels = next.flatMap((t) => t.panels ?? []),
    used = shelterParts(o, 'strands').map((p) => text(p.escrow));
  return [
    ...j.plan.rods.filter((r) => slots.includes(r.slot)).map((r) => r.escrow),
    ...j.plan.strands
      .filter((s) => !used.includes(s.escrow))
      .map((s) => s.escrow),
    ...j.plan.thatch
      .filter((t) => panels.includes(t.panel))
      .flatMap((t) => t.takes.map((k) => k.escrow)),
    ...(next.some((t) => t.bedding) ? j.plan.bedding.map((b) => b.escrow) : []),
  ];
}
/** Escrow ids that later stages still need. */
function remainingEscrow(w: V7World, j: Job): string[] {
  return j.escrow.filter((id) =>
    w.stacks.some((x) => x.id === id && x.reservedFor === j.id),
  );
}

/** Lashes a joint with the next metres of reserved strand, installing strands as first used. */
function lash(
  w: V7World,
  o: V7Object,
  j: Job,
  joint: ShelterJoint,
  owner: string,
) {
  const start = j.cordUsed,
    end = start + joint.metres;
  let at = 0;
  const ids: string[] = [];
  for (const s of j.plan.strands) {
    const from = at,
      to = at + s.length;
    at = to;
    if (to <= start + 1e-9 || from >= end - 1e-9) continue;
    const installed = shelterParts(o, 'strands').find(
      (p) => p.escrow === s.escrow,
    );
    if (installed) {
      ids.push(installed.id);
      continue;
    }
    const stack = w.stacks.find(
      (x) => x.id === s.escrow && x.reservedFor === j.id,
    );
    if (!stack) continue;
    const m = shelterMeasure(w, stack),
      part = install(w, stack, 'binding', 'strand', owner, {
        escrow: s.escrow,
        length: s.length,
        breaking: m.strand?.breaking ?? 0,
        diameter: m.strand?.diameter ?? 0,
      });
    o.data.strands = [...shelterParts(o, 'strands'), part];
    ids.push(part.id);
  }
  joint.strands = ids;
  j.cordUsed = round(end);
}

/** One paid round of build, repair or dismantle; `explicit` refuses at no cost instead of pausing. */
function advance(
  c: V7ActionContext,
  j: Job,
  explicit: boolean,
): V7HandlerResult {
  const w = c.world,
    o = w.objects.find((o) => o.id === j.target && o.kind === KIND);
  if (!open(j) || !o) throw nothing('This shelter work is already settled.');
  const problem = recheck(c, j, o);
  if (problem === 'lost') {
    stop(
      c,
      j,
      o,
      'A reserved input was lost; surviving reserved inputs returned.',
    );
    c.emit(
      'weather-shelter-failed',
      'Work stopped because a reserved input was lost; installed parts stay as an unfinished shelter.',
      summary(w, j),
      o.id,
    );
    return { complete: true, writes: [j.id] };
  }
  if (problem) {
    if (explicit) throw nothing(problem);
    return pause(c, j, problem);
  }
  const resumed = j.status === 'paused';
  if (!workPay(c, j, ENERGY))
    throw new Error('Energy changed before the paid round.');
  c.actor.vitals.energy = round(c.actor.vitals.energy);
  if (resumed)
    c.emit(
      'weather-shelter-resumed',
      'Unfinished shelter work resumed after rechecking reach, site, occupants, reserved inputs and energy.',
      summary(w, j),
      o.id,
    );
  if (j.mode === 'build') return buildRound(c, j, o);
  if (j.mode === 'repair') return repairRound(c, j, o);
  return dismantleRound(c, j, o);
}

function buildRound(c: V7ActionContext, j: Job, o: V7Object): V7HandlerResult {
  const w = c.world,
    n = j.completedWork,
    stage = STAGES[n - 1] ?? { stage: '' },
    owner = c.actor.id,
    added: V7Data[] = [];
  if (stage.rods) {
    const slots = SLOTS.filter(stage.rods).map((s) => s.slot);
    for (const r of j.plan.rods.filter((r) => slots.includes(r.slot))) {
      const s = w.stacks.find(
        (x) => x.id === r.escrow && x.reservedFor === j.id,
      );
      if (!s) continue;
      const m = shelterMeasure(w, s),
        part = install(w, s, 'rod', r.slot, owner, {
          diameter: m.rod?.diameter ?? 0,
          length: m.rod?.length ?? 0,
        });
      o.data.rods = [...shelterParts(o, 'rods'), part];
      added.push({ slot: r.slot, item: part.id });
    }
  }
  const joints = shelterJointList(o);
  if (stage.joints)
    for (const joint of joints.filter(stage.joints)) {
      lash(w, o, j, joint, owner);
      added.push({
        joint: joint.id,
        metres: joint.metres,
        strands: v7Json(joint.strands),
      });
    }
  if (stage.panels) {
    const panels = shelterPanelList(o);
    for (const id of stage.panels) {
      const p = panels.find((x) => x.id === id),
        planned = j.plan.thatch.find((t) => t.panel === id);
      if (!p || !planned) continue;
      for (const t of planned.takes) {
        const s = w.stacks.find(
          (x) => x.id === t.escrow && x.reservedFor === j.id,
        );
        if (!s) continue;
        const m = shelterMeasure(w, s),
          part = install(
            w,
            s,
            'thatch',
            id,
            owner,
            { unitVolume: m.stem?.thatch ?? 0 },
            Math.min(t.tenths, tenthsOf(s)),
          );
        p.lots = [...p.lots, part];
      }
      p.installed = round(p.lots.reduce((k, l) => k + lotVolume(l), 0));
      const tie = joints.find((x) => x.id === `thatch-${id}`);
      if (tie) lash(w, o, j, tie, owner);
      added.push({ panel: id, installed: p.installed, volume: p.volume });
    }
    o.data.panels = panels;
  }
  if (stage.bedding) {
    const lots: V7Data[] = [];
    for (const t of j.plan.bedding) {
      const s = w.stacks.find(
        (x) => x.id === t.escrow && x.reservedFor === j.id,
      );
      if (!s) continue;
      const m = shelterMeasure(w, s);
      lots.push(
        install(w, s, 'bedding', 'floor', owner, {
          unitVolume: m.stem?.bedding ?? 0,
        }),
      );
    }
    o.data.bedding = {
      ...((o.data.bedding ?? {}) as V7Data),
      lots: v7Json(lots),
      held: 0,
    };
    added.push({ bedding: lots.length });
    // Strand metres beyond the joints' need go on as extra wraps: nothing is left over.
    for (const s of j.plan.strands) {
      const stack = w.stacks.find(
        (x) => x.id === s.escrow && x.reservedFor === j.id,
      );
      if (!stack) continue;
      const m = shelterMeasure(w, stack);
      o.data.strands = [
        ...shelterParts(o, 'strands'),
        install(w, stack, 'binding', 'extra-wraps', owner, {
          escrow: s.escrow,
          length: s.length,
          breaking: m.strand?.breaking ?? 0,
          diameter: m.strand?.diameter ?? 0,
        }),
      ];
    }
  }
  o.data.joints = joints;
  w.stacks = w.stacks.filter((s) => s.quantity > 0);
  o.data.stage = stage.stage;
  o.data.rounds = n + 1;
  o.data.status = 'in-progress';
  refresh(w, o);
  if (n >= STAGES.length) {
    j.status = 'completed';
    j.outputs = [o.id];
    o.data.workId = null;
    const v = check(w, o, c.actor.id);
    c.emit(
      v.passed ? 'weather-shelter-completed' : 'weather-shelter-check-failed',
      v.passed
        ? `Round ${String(TOTAL)} of ${String(TOTAL)}: bedding laid and the final geometry, joint, coverage and bedding inspection passed. The shelter is complete for one reclining person within its rating.`
        : `Round ${String(TOTAL)} of ${String(TOTAL)}: the final inspection failed (${v.tests
            .filter((t) => !t.passed)
            .map((t) => t.test)
            .join('; ')}); no protection until repaired and reinspected.`,
      {
        shelter: o.id,
        tests: v7Json(v.tests),
        status: statusOf(o),
        view: o.data.view ?? null,
      },
      o.id,
    );
    sync(c.actor, j);
    return { complete: true, remaining: 0, writes: [j.id, o.id] };
  }
  c.emit(
    'weather-shelter-progress',
    `Paid round ${String(n + 1)} of ${String(TOTAL)} (${stage.stage}). An unfinished shelter gives no protection.`,
    {
      ...summary(w, j),
      stage: stage.stage,
      round: n + 1,
      added: v7Json(added),
    },
    o.id,
  );
  sync(c.actor, j);
  return { complete: false, remaining: j.remainingWork, writes: [j.id, o.id] };
}

function site(c: V7ActionContext) {
  const orientation = v7Number(
    c.action.args.orientation ?? 0,
    'orientation',
    0,
    360,
  );
  return {
    x: v7Number(c.action.args.x, 'site x'),
    y: v7Number(c.action.args.y, 'site y'),
    orientation,
    angle: (orientation * Math.PI) / 180,
  };
}
const fullNeed = () => ({
  rods: SLOTS.map((s) => s.slot),
  cord: null,
  panels: shelterPanels(),
  bedding: G.bedding,
});

/** Paid handling and site findings after the record checks; with the design check of the plan. */
function inspection(
  c: V7ActionContext,
  s: ReturnType<typeof site>,
  plan: Survey,
) {
  const w = c.world,
    handled = plan.measured
      .filter((m) => m.contaminated === true || m.fractured === true)
      .map((m) => `${text(m.item)} is contaminated or fractured`),
    lots = plan.thatch.flatMap((t) =>
      t.takes.map((k) => {
        const m = shelterMeasure(w, k.stack);
        return {
          mass: (m.unitMass * k.tenths) / 10,
          solids: (m.unitMass * (1 - m.waterShare) * k.tenths) / 10,
        };
      }),
    ),
    d = design(
      plan.rods.map((r) => ({
        slot: r.slot,
        diameter: r.m.rod?.diameter ?? 0,
        length: r.m.rod?.length ?? 0,
        condition: r.m.condition,
      })),
      plan.joints,
      () => {
        const list = plan.strands.map((x) => x.m.strand?.breaking ?? 0);
        return list.length
          ? { breaking: Math.min(...list), condition: 1 }
          : null;
      },
      lots,
    ),
    problems = [
      ...plan.deficits,
      ...handled,
      ...siteProblems(w, s, c.actor.id, null),
      ...(plan.deficits.length
        ? []
        : d.tests
            .filter((t) => !t.passed)
            .map((t) => `design check failed: ${t.test}`)),
    ];
  return {
    problems,
    finding: {
      x: s.x,
      y: s.y,
      orientation: s.orientation,
      suitable: !problems.length,
      problems,
      needs: {
        rods: G.rods,
        bindingMetres: plan.cordNeed,
        coveringM3: G.thatch,
        beddingM3: G.bedding,
      },
      named: {
        rods: plan.rods.length,
        bindingMetres: plan.metres,
        coveringM3: plan.thatchVolume,
        beddingM3: plan.beddingVolume,
      },
      materials: v7Json(plan.measured),
      design: v7Json(d.tests),
      ground: openConditions(w, s).regime,
      energy: ENERGY,
    },
  };
}
function remember(
  c: V7ActionContext,
  key: string,
  value: V7Data,
  property: string,
) {
  openRemember(c, {
    key,
    subject: 'weather-shelter',
    property,
    value: v7Json(value),
    method: 'direct inspection by handling and looking',
    condition: 'observable condition only; nothing was changed',
    verified: false,
  });
}

/** Build round 1: record checks refuse at no cost; the paid inspection then reserves on a pass. */
function build(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor;
  if (workFind(c))
    throw nothing(
      'Unfinished shelter work exists; build naming its shelter resumes it, or cancel it.',
    );
  if (text(c.action.args.shelter))
    throw nothing('No unfinished shelter work of yours on that shelter.');
  let s;
  try {
    s = site(c);
  } catch (error) {
    throw nothing(error instanceof Error ? error.message : 'Give x and y.');
  }
  if (!v7Reach(a, spatial(s)))
    throw nothing('Move within reach of the shelter site first.');
  const plan = survey(w, entries(c, ROLES), fullNeed(), {});
  if (plan.deficits.length)
    throw nothing(
      `Measured shortfall for the recipe: ${plan.deficits.join('; ')}.`,
    );
  if (a.vitals.energy + 1e-9 < ENERGY)
    throw nothing('The inspection round needs 1 energy.');
  v7Spend(a, ENERGY);
  const { problems, finding } = inspection(c, s, plan);
  remember(
    c,
    `weather-shelter:site:${s.x.toFixed(1)},${s.y.toFixed(1)}`,
    finding,
    'site and named materials',
  );
  c.emit(
    'weather-shelter-materials-tested',
    `Measured ${String(plan.measured.length)} named lots by handling: ${String(plan.rods.length)} rods, ${String(plan.metres)} m of binding, ${String(plan.thatchVolume)} m3 of covering and ${String(plan.beddingVolume)} m3 of bedding.`,
    { materials: v7Json(plan.measured) },
    null,
  );
  c.emit(
    'weather-shelter-inspected',
    problems.length
      ? `Inspection found: ${problems.join('; ')}. Nothing was reserved.`
      : 'Site and materials passed the inspection and the design check; the inputs are reserved and building continues.',
    finding,
    null,
  );
  if (problems.length) return { complete: true, writes: [] };
  const j = workCreate(c, 'build', STAGES.length) as Job;
  j.paidEnergy = ENERGY;
  j.lastPaid = w.tick;
  j.cordUsed = 0;
  const o: V7Object = {
    id: v7Id(w, 'shelter'),
    kind: KIND,
    name: 'Thatched weather shelter',
    spatial: spatial(s),
    visual: {
      component: KIND,
      color: color(w, plan.rods[0]?.stack.resource ?? 'branch'),
      accent: color(w, plan.thatch[0]?.takes[0]?.stack.resource ?? 'reed'),
      label: 'Weather shelter',
      state: 'planned',
    },
    data: {
      status: 'planned',
      owner: a.id,
      workId: j.id,
      stage: 'inspection',
      rounds: 1,
      orientation: s.orientation,
      rods: [],
      strands: [],
      joints: v7Json(plan.joints),
      panels: v7Json(shelterPanels()),
      bedding: { lots: [], held: 0 },
      cover: { held: 0 },
      water: { saturated: false, leakage: 0 },
      occupants: [],
      last: {},
      tests: [],
    },
    createdBy: a.id,
    createdAt: w.tick,
    revision: REVISION,
  };
  w.objects.push(o);
  j.target = o.id;
  // Exact inputs, in order: one unit per rod and strand, the planned tenths of covering and bedding.
  const covering = new Map<V7Stack, number>();
  for (const t of plan.thatch)
    for (const k of t.takes)
      covering.set(k.stack, (covering.get(k.stack) ?? 0) + k.tenths);
  const allocations = [
    ...plan.rods.map((r) => ({ stack: r.stack, quantity: 1 })),
    ...plan.strands.map((r) => ({ stack: r.stack, quantity: 1 })),
    ...[...covering].map(([stack, n]) => ({ stack, quantity: n / 10 })),
    ...plan.bedding.map((b) => ({ stack: b.stack, quantity: b.tenths / 10 })),
  ];
  workReserve(c, j, allocations);
  const ids = [...j.escrow],
    rods = plan.rods.map((r) => ({ slot: r.slot, escrow: ids.shift() ?? '' })),
    strands = plan.strands.map((r) => ({
      escrow: ids.shift() ?? '',
      length: r.m.strand?.length ?? 0,
    })),
    lots = new Map<V7Stack, { id: string; left: number }>();
  for (const [stack, n] of covering)
    lots.set(stack, { id: ids.shift() ?? '', left: n });
  j.plan = {
    rods,
    strands,
    thatch: plan.thatch.map((t) => ({
      panel: t.panel,
      takes: t.takes.map((k) => ({
        escrow: lots.get(k.stack)?.id ?? '',
        tenths: k.tenths,
      })),
    })),
    bedding: plan.bedding.map((b) => ({
      escrow: ids.shift() ?? '',
      tenths: b.tenths,
    })),
  };
  w.stacks = w.stacks.filter((x) => x.quantity > 0);
  refresh(w, o);
  c.emit(
    'weather-shelter-started',
    `The ${String(allocations.length)} named inputs are reserved to this shelter and stay carried until paid rounds build them in; 9 paid rounds remain.`,
    { ...summary(w, j), plan: v7Json(j.plan), finding: v7Json(finding) },
    o.id,
  );
  sync(a, j);
  return { complete: false, remaining: STAGES.length, writes: [j.id, o.id] };
}

/** The named shelter within reach; `owner` also requires its builder. */
function shelterOf(c: V7ActionContext, owner: boolean): V7Object {
  const id = text(c.action.args.shelter),
    o = c.world.objects.find((o) => o.id === id && o.kind === KIND);
  if (!o) throw nothing('shelter must name a weather shelter in view.');
  if (!v7Reach(c.actor, o.spatial))
    throw nothing('The shelter is beyond reach.');
  if (owner && o.data.owner !== c.actor.id)
    throw nothing('Only the person who built this shelter may do that.');
  return o;
}
function idle(c: V7ActionContext, o: V7Object) {
  if (jobs(c.world).some((j) => j.target === o.id && open(j)))
    throw nothing('Work on this shelter is still open; resume or cancel it.');
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const w = c.world;
  if (!text(c.action.args.shelter)) {
    let s;
    try {
      s = site(c);
    } catch (error) {
      throw nothing(
        error instanceof Error ? error.message : 'Give x and y or a shelter.',
      );
    }
    if (!v7Reach(c.actor, spatial(s)))
      throw nothing('Move within reach of the site first.');
    const plan = survey(w, entries(c, ROLES), fullNeed(), {});
    if (c.actor.vitals.energy + 1e-9 < ENERGY)
      throw nothing('Inspection needs 1 energy.');
    v7Spend(c.actor, ENERGY);
    const { problems, finding } = inspection(c, s, plan);
    remember(
      c,
      `weather-shelter:site:${s.x.toFixed(1)},${s.y.toFixed(1)}`,
      finding,
      'site and named materials',
    );
    if (plan.measured.length)
      c.emit(
        'weather-shelter-materials-tested',
        `Measured ${String(plan.measured.length)} named lots by handling; nothing was reserved.`,
        { materials: v7Json(plan.measured) },
        null,
      );
    c.emit(
      'weather-shelter-inspected',
      problems.length
        ? `Inspection found: ${problems.join('; ')}. Nothing was reserved.`
        : 'Site and named materials pass the recipe checks. Nothing was reserved.',
      finding,
      null,
    );
    return { complete: true, writes: [] };
  }
  const o = shelterOf(c, false);
  if (c.actor.vitals.energy + 1e-9 < ENERGY)
    throw nothing('Inspection needs 1 energy.');
  v7Spend(c.actor, ENERGY);
  const v = verify(w, o),
    joints = shelterJointList(o),
    value = {
      shelter: o.id,
      owner: text(o.data.owner),
      status: statusOf(o),
      tests: v7Json(v.tests),
      defects: v7Json(defects(o)),
      joints: joints.map((j) => ({
        joint: j.id,
        kind: j.kind,
        condition: round(shelterJointCondition(o, j)),
      })),
      view: o.data.view ?? null,
    };
  remember(
    c,
    `${o.id}:shelter-condition`,
    value,
    'shelter joints, covering, bedding and water',
  );
  c.emit(
    'weather-shelter-inspected',
    `Shelter ${statusOf(o)}: ${
      v.passed
        ? 'every inspection check passes'
        : `failing checks: ${v.tests
            .filter((t) => !t.passed)
            .map((t) => t.test)
            .join('; ')}`
    }; ${String(defects(o).length)} defective component(s).`,
    { ...value, energy: ENERGY },
    o.id,
  );
  return { complete: true, writes: [o.id] };
}

/** Defective components: worn or loose strands, covering with gaps or short, wet or short bedding. */
function defects(o: V7Object) {
  const row = (
    part: string,
    kind: string,
    metres: number,
    volume: number,
    condition: number,
  ) => ({
    part,
    kind,
    metres,
    volume,
    condition: round(condition),
  });
  return [
    ...shelterParts(o, 'strands')
      .filter((s) => s.condition < G.sound)
      .map((s) => row(s.id, 'binding', Number(s.length ?? 0), 0, s.condition)),
    ...shelterPanelList(o)
      .filter((p) => p.installed + 1e-9 < p.volume || p.condition < G.sound)
      .map((p) => row(p.id, 'covering', 0, p.volume, p.condition)),
    ...(shelterBeddingDry(o)
      ? []
      : [row('bedding', 'bedding', 0, G.bedding, 1)]),
  ];
}

function repair(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    o = shelterOf(c, true);
  idle(c, o);
  if (!['complete', 'failed', 'collapsed'].includes(statusOf(o)))
    throw nothing(
      `The shelter is ${statusOf(o)}; only a built shelter is repaired.`,
    );
  if (shelterBodies(w, o).length)
    throw nothing(
      'A person is inside; repair waits until occupants leave by themselves.',
    );
  const list = defects(o);
  if (!list.length) throw nothing('No defective component was found.');
  const strands = list.filter((d) => d.kind === 'binding'),
    panels = shelterPanelList(o).filter((p) =>
      list.some((d) => d.part === p.id),
    ),
    bed = list.some((d) => d.kind === 'bedding');
  const metres = strands.reduce((n, d) => n + d.metres, 0),
    plan = survey(
      w,
      entries(c, ['binding', 'thatch', 'bedding']),
      {
        rods: [],
        cord: metres,
        panels: panels.map((p) => ({ ...p, installed: 0 })),
        bedding: bed ? G.bedding : 0,
      },
      {},
    );
  const olds = shelterParts(o, 'strands');
  if (
    plan.strands.length !== strands.length ||
    plan.strands.some(
      (r, i) =>
        (r.m.strand?.length ?? 0) + 1e-9 <
        Number(olds.find((x) => x.id === strands[i]?.part)?.length ?? 0),
    )
  )
    plan.deficits.push(
      `binding: ${String(strands.length)} replacement strand(s), each as long as the one it replaces, are needed`,
    );
  if (plan.deficits.length)
    throw nothing(
      `Defective: ${list.map((d) => d.part).join(', ')}. Replacement shortfall: ${plan.deficits.join('; ')}.`,
    );
  const rounds =
    Math.ceil(metres - 1e-9) +
    panels.reduce((n, p) => n + Math.ceil(p.volume / REPAIR_VOLUME - 1e-9), 0) +
    (bed ? Math.ceil(G.bedding / REPAIR_VOLUME - 1e-9) : 0);
  if (a.vitals.energy + 1e-9 < ENERGY)
    throw nothing('A repair round needs 1 energy.');
  const j = workCreate(c, 'repair', rounds) as Job;
  j.target = o.id;
  j.previous = statusOf(o);
  j.cordUsed = 0;
  const covering = new Map<V7Stack, number>();
  for (const t of plan.thatch)
    for (const k of t.takes)
      covering.set(k.stack, (covering.get(k.stack) ?? 0) + k.tenths);
  workReserve(c, j, [
    ...plan.strands.map((r) => ({ stack: r.stack, quantity: 1 })),
    ...[...covering].map(([stack, n]) => ({ stack, quantity: n / 10 })),
    ...plan.bedding.map((b) => ({ stack: b.stack, quantity: b.tenths / 10 })),
  ]);
  const ids = [...j.escrow],
    lots = new Map<V7Stack, string>();
  const strandPlan = plan.strands.map((r) => ({
    escrow: ids.shift() ?? '',
    length: r.m.strand?.length ?? 0,
  }));
  for (const [stack] of covering) lots.set(stack, ids.shift() ?? '');
  j.plan = {
    rods: [],
    strands: strandPlan,
    thatch: plan.thatch.map((t) => ({
      panel: t.panel,
      takes: t.takes.map((k) => ({
        escrow: lots.get(k.stack) ?? '',
        tenths: k.tenths,
      })),
    })),
    bedding: plan.bedding.map((b) => ({
      escrow: ids.shift() ?? '',
      tenths: b.tenths,
    })),
  };
  j.replace = {
    strands: strands.map((d) => d.part),
    panels: panels.map((p) => p.id),
    bedding: bed,
  };
  w.stacks = w.stacks.filter((x) => x.quantity > 0);
  o.data.status = 'repairing';
  o.data.workId = j.id;
  c.emit(
    'weather-shelter-repair-started',
    `Defective components identified: ${list.map((d) => d.part).join(', ')}. Replacements are reserved; ${String(rounds)} paid round(s) of 1 energy follow, then reinspection.`,
    { ...summary(w, j), defects: v7Json(list) },
    o.id,
  );
  return advance(c, j, true);
}

function repairRound(c: V7ActionContext, j: Job, o: V7Object): V7HandlerResult {
  const w = c.world;
  if (j.remainingWork > 0) {
    refresh(w, o);
    c.emit(
      'weather-shelter-progress',
      `Repair round ${String(j.completedWork)} of ${String(j.initialWork)}: removing and replacing defective components.`,
      summary(w, j),
      o.id,
    );
    sync(c.actor, j);
    return {
      complete: false,
      remaining: j.remainingWork,
      writes: [j.id, o.id],
    };
  }
  const removed: V7Data[] = [],
    replace = j.replace,
    owner = c.actor.id,
    gone = (Array.isArray(replace.strands) ? replace.strands : []) as string[];
  // Strands: each defective strand is replaced by the next reserved one in every joint it served.
  const fresh: ShelterPart[] = [];
  for (const s of j.plan.strands) {
    const stack = w.stacks.find(
      (x) => x.id === s.escrow && x.reservedFor === j.id,
    );
    if (!stack) continue;
    const m = shelterMeasure(w, stack);
    fresh.push(
      install(w, stack, 'binding', 'strand', owner, {
        escrow: s.escrow,
        length: s.length,
        breaking: m.strand?.breaking ?? 0,
        diameter: m.strand?.diameter ?? 0,
      }),
    );
  }
  const joints = shelterJointList(o),
    strands = shelterParts(o, 'strands');
  gone.forEach((id, i) => {
    const old = strands.find((s) => s.id === id),
      neu = fresh[i];
    if (!old || !neu) return;
    removed.push({
      role: 'binding',
      item: release(w, o, old),
      condition: round(old.condition),
    });
    for (const jt of joints)
      jt.strands = jt.strands.map((x) => (x === id ? neu.id : x));
  });
  o.data.strands = [
    ...strands.filter((s) => !gone.includes(s.id)),
    ...fresh.slice(0, gone.length),
  ];
  o.data.joints = joints;
  const panels = shelterPanelList(o),
    cover = (o.data.cover ?? {}) as V7Data,
    held = Number(cover.held ?? 0),
    total = moisture(o, 'cover', coverLots(o)).solids,
    solids = (l: V7Data) =>
      Number(l.mass ?? 0) * (1 - Number(l.waterShare ?? 0));
  let away = 0;
  for (const t of j.plan.thatch) {
    const p = panels.find((x) => x.id === t.panel);
    if (!p) continue;
    // Held water leaves with the removed stems in proportion to their dry solids.
    for (const l of p.lots) {
      const part = total > 0 ? (held * solids(l)) / total : 0;
      away += part;
      removed.push({
        role: 'thatch',
        item: release(w, o, l, part),
        condition: round(p.condition),
      });
    }
    p.lots = [];
    for (const k of t.takes) {
      const s = w.stacks.find(
        (x) => x.id === k.escrow && x.reservedFor === j.id,
      );
      if (!s) continue;
      const m = shelterMeasure(w, s);
      p.lots.push(
        install(
          w,
          s,
          'thatch',
          p.id,
          owner,
          { unitVolume: m.stem?.thatch ?? 0 },
          Math.min(k.tenths, tenthsOf(s)),
        ),
      );
    }
    p.installed = round(p.lots.reduce((n, l) => n + lotVolume(l), 0));
    p.condition = 1;
  }
  cover.held = round(Math.max(0, held - away));
  o.data.cover = cover;
  o.data.panels = panels;
  if (replace.bedding === true) {
    const bed = (o.data.bedding ?? {}) as V7Data,
      old = beddingLots(o),
      bheld = Number(bed.held ?? 0);
    for (const l of old)
      removed.push({
        role: 'bedding',
        item: release(w, o, l, bheld / Math.max(1, old.length)),
        condition: 1,
      });
    const lots: V7Data[] = [];
    for (const t of j.plan.bedding) {
      const s = w.stacks.find(
        (x) => x.id === t.escrow && x.reservedFor === j.id,
      );
      if (!s) continue;
      const m = shelterMeasure(w, s);
      lots.push(
        install(w, s, 'bedding', 'floor', owner, {
          unitVolume: m.stem?.bedding ?? 0,
        }),
      );
    }
    o.data.bedding = { ...bed, lots: v7Json(lots), held: 0 };
  }
  w.stacks = w.stacks.filter((s) => s.quantity > 0);
  j.status = 'completed';
  o.data.workId = null;
  const v = check(w, o, owner);
  c.emit(
    'weather-shelter-repaired',
    `Repair finished: ${String(removed.length)} removed lot(s) lie at the shelter as degraded material. Reinspection ${v.passed ? 'passed: the rating is restored' : 'failed: no protection'}.`,
    {
      shelter: o.id,
      removed: v7Json(removed),
      tests: v7Json(v.tests),
      status: statusOf(o),
      view: o.data.view ?? null,
    },
    o.id,
  );
  sync(c.actor, j);
  return { complete: true, remaining: 0, writes: [j.id, o.id] };
}

function dismantle(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    o = shelterOf(c, true);
  idle(c, o);
  if (shelterBodies(w, o).length)
    throw nothing(
      'A person is inside; dismantling waits until occupants leave by themselves.',
    );
  if (c.actor.vitals.energy + 1e-9 < ENERGY)
    throw nothing('A dismantling round needs 1 energy.');
  const j = workCreate(c, 'dismantle', 2) as Job;
  j.target = o.id;
  j.previous = statusOf(o);
  j.plan = { rods: [], strands: [], thatch: [], bedding: [] };
  j.cordUsed = 0;
  j.replace = {};
  o.data.workId = j.id;
  o.data.status = 'dismantling';
  return advance(c, j, true);
}

function dismantleRound(
  c: V7ActionContext,
  j: Job,
  o: V7Object,
): V7HandlerResult {
  const w = c.world,
    out: V7Data[] = [];
  if (j.completedWork === 1) {
    const held = Number((o.data.cover as V7Data | undefined)?.held ?? 0),
      lots = coverLots(o),
      bed = beddingLots(o),
      bheld = Number((o.data.bedding as V7Data | undefined)?.held ?? 0);
    for (const l of lots)
      out.push({
        role: 'thatch',
        item: release(w, o, l, held / Math.max(1, lots.length)),
      });
    for (const l of bed)
      out.push({
        role: 'bedding',
        item: release(w, o, l, bheld / Math.max(1, bed.length)),
      });
    o.data.panels = v7Json(
      shelterPanelList(o).map((p) => ({ ...p, lots: [], installed: 0 })),
    );
    o.data.bedding = { lots: [], held: 0 };
    o.data.cover = { held: 0 };
    refresh(w, o);
    c.emit(
      'weather-shelter-dismantle-progress',
      `Dismantling round 1 of 2: covering and bedding taken off (${String(out.length)} lot(s) at the site).`,
      { ...summary(w, j), output: v7Json(out) },
      o.id,
    );
    sync(c.actor, j);
    return { complete: false, remaining: 1, writes: [j.id, o.id] };
  }
  for (const s of shelterParts(o, 'strands'))
    out.push({ role: 'binding', item: release(w, o, s) });
  for (const r of shelterParts(o, 'rods'))
    out.push({ role: 'rod', item: release(w, o, r) });
  w.objects = w.objects.filter((x) => x.id !== o.id);
  j.status = 'completed';
  c.emit(
    'weather-shelter-dismantled',
    `The shelter was taken down; ${String(out.length)} part(s) lie at the site with their condition, water and origin. Nothing is refunded.`,
    { shelter: o.id, output: v7Json(out), energy: round(j.paidEnergy) },
    null,
  );
  sync(c.actor, j);
  return { complete: true, remaining: 0, writes: [j.id] };
}

/** Stops a job once: unincorporated reserved inputs return; installed parts stay. */
function stop(
  c: V7ActionContext,
  j: Job,
  o: V7Object | undefined,
  reason: string,
) {
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  workStop(c.world, c.actor, j, reason, false);
  settle(c.world, j, o);
  sync(c.actor, j);
}
function settle(w: V7World, j: Job, o: V7Object | undefined) {
  if (!o) return;
  o.data.workId = null;
  if (j.mode === 'build') {
    if (!shelterParts(o, 'rods').length && !shelterParts(o, 'strands').length) {
      w.objects = w.objects.filter((x) => x.id !== o.id);
      return;
    }
    o.data.status = 'unfinished';
  } else
    o.data.status =
      j.mode === 'dismantle' ? 'unfinished' : j.previous || 'failed';
  refresh(w, o);
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c) as Job | undefined;
  if (!j || !open(j)) throw nothing('No unfinished shelter work of yours.');
  const o = c.world.objects.find((o) => o.id === j.target),
    returned = remainingEscrow(c.world, j);
  stop(
    c,
    j,
    o,
    'Cancelled; unincorporated reserved inputs returned once. Spent energy and time are not refunded.',
  );
  c.emit(
    'weather-shelter-cancelled',
    'Shelter work cancelled; reserved inputs not yet built in are back in your carried items, built-in parts stay as an unfinished structure until dismantled.',
    { ...summary(c.world, j), returned },
    j.target,
  );
  return { complete: true, writes: [j.id, ...returned] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = text(c.action.args.mode),
    own = workFind(c) as Job | undefined;
  if (own && open(own) && mode === own.mode) {
    if (c.operation?.first === false) return advance(c, own, false);
    if (text(c.action.args.shelter) === own.target)
      return advance(c, own, true);
  }
  if (mode === 'inspect') return inspect(c);
  if (mode === 'build') return build(c);
  if (mode === 'repair') return repair(c);
  if (mode === 'dismantle') return dismantle(c);
  if (mode === 'cancel') return cancel(c);
  throw nothing('Unknown shelter mode.');
}

/** Occupancy: a body counts once it has come onto the floor through the open end. */
function occupancy(w: V7World, o: V7Object) {
  const last = (o.data.last ?? {}) as V7Data,
    before = shelterOccupants(o),
    now: string[] = [],
    seen: V7Data = {};
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    const q = v7Local(a.position, o.spatial),
      prev = last[a.id] as { x: number; y: number } | undefined,
      fits = shelterFits(o, a.position, a.radius);
    seen[a.id] = { x: round(q.x), y: round(q.y) };
    if (!fits) {
      if (before.includes(a.id))
        forestEvent(
          w,
          'weather-shelter-left',
          `${a.name} left the shelter floor.`,
          a.position,
          a.id,
          { shelter: o.id },
          o.id,
        );
      continue;
    }
    if (before.includes(a.id)) {
      now.push(a.id);
      continue;
    }
    const through = !!prev && prev.y <= -G.length / 2 + 1e-9,
      wasIn =
        !!prev &&
        Math.abs(prev.x) < G.width / 2 &&
        Math.abs(prev.y) < G.length / 2;
    if (through) now.push(a.id);
    if (!wasIn || through)
      forestEvent(
        w,
        'weather-shelter-entered',
        through
          ? `${a.name} came onto the shelter floor through the open end.`
          : `${a.name} reached the floor across a covered side, which this world does not block; not counted until entering by the open end.`,
        a.position,
        a.id,
        { shelter: o.id, admitted: through, fits },
        o.id,
      );
  }
  o.data.occupants = now;
  o.data.last = seen;
}

/** Water balance of the covering and bedding: received = runoff + held + leakage, and held water
 * evaporates at the representation's limit. */
function waterBalance(w: V7World, o: V7Object) {
  const climate = forestClimate(w, o.spatial),
    rain = climate.indoor ? 0 : (climate.rain ?? 0),
    water = (o.data.water ?? {}) as V7Data,
    cover = (o.data.cover ?? {}) as V7Data,
    lots = coverLots(o),
    composition = moisture(o, 'cover', lots),
    roof = shelterCover(o, false),
    received = rain * SHELTER_RAIN_KG * FLOOR_AREA,
    leakage = received * (1 - roof),
    intercepted = received - leakage,
    capacity = HOLD * composition.solids,
    held0 = Number(cover.held ?? 0),
    retained = Math.min(intercepted * RETAIN, Math.max(0, capacity - held0)),
    runoff = intercepted - retained,
    evaporated = Math.min(
      held0 + retained,
      shelterDrying(w, o.spatial, ROOF_AREA * roof),
    ),
    held = held0 + retained - evaporated,
    // Full while rain meets it: the round's rain found no room left in the covering.
    saturated = capacity > 0 && rain > 0 && held0 + retained + 1e-9 >= capacity,
    bed = (o.data.bedding ?? {}) as V7Data,
    bheld0 = Number(bed.held ?? 0),
    bedded = beddingLots(o).length > 0,
    bdry = bedded
      ? Math.min(bheld0 + leakage, shelterDrying(w, o.spatial, FLOOR_AREA))
      : 0,
    bheld = bedded ? bheld0 + leakage - bdry : 0,
    wasWet = !shelterBeddingDry(o);
  cover.held = round(held);
  bed.held = round(bheld);
  o.data.cover = cover;
  o.data.bedding = bed;
  const total = (k: string, x: number) => round(Number(water[k] ?? 0) + x);
  o.data.water = {
    tick: w.tick,
    rain: round(rain),
    received: round(received),
    runoff: round(runoff),
    retained: round(retained),
    leakage: round(leakage),
    evaporated: round(evaporated),
    held: round(held),
    capacity: round(capacity),
    saturated,
    beddingHeld: round(bheld),
    totalReceived: total('totalReceived', received),
    totalRunoff: total('totalRunoff', runoff),
    totalLeakage: total('totalLeakage', leakage),
    totalEvaporated: total('totalEvaporated', evaporated + bdry),
  };
  refresh(w, o);
  if (leakage > 0 && !(Number(water.leakage ?? 0) > 0))
    forestEvent(
      w,
      'weather-shelter-leaking',
      `Rain is reaching the floor through ${roof > 0 ? 'gaps in the covering' : 'the uncovered frame'}: ${String(round(leakage))} kg this round.`,
      o.spatial,
      null,
      { shelter: o.id, leakage: round(leakage), cover: roof },
      o.id,
    );
  if (saturated && water.saturated !== true)
    forestEvent(
      w,
      'weather-shelter-saturated',
      'The covering holds all the water it can; rain protection is suspended until it dries.',
      o.spatial,
      null,
      { shelter: o.id, held: round(held) },
      o.id,
    );
  const wet = bedded && !shelterBeddingDry(o);
  if (bedded && wet !== wasWet)
    forestEvent(
      w,
      wet ? 'weather-shelter-bedding-wet' : 'weather-shelter-dried',
      wet
        ? 'The bedding is wet and gives no insulation until it dries.'
        : 'The bedding is dry again.',
      o.spatial,
      null,
      {
        shelter: o.id,
        waterShare: o.data.bedding.waterShare ?? null,
      },
      o.id,
    );
}

/** Joint and covering wear: 0.001 a round, doubled while rain or wind is present. */
function wear(w: V7World, o: V7Object) {
  const climate = forestClimate(w, o.spatial),
    weather =
      (!climate.indoor && (climate.rain ?? 0) > 0) || (climate.wind ?? 0) > 0,
    amount = G.wear * (weather ? 2 : 1),
    strands = shelterParts(o, 'strands'),
    panels = shelterPanelList(o),
    cover0 = shelterCover(o, true);
  for (const s of strands)
    s.condition = round(Math.max(0, s.condition - amount));
  for (const p of panels)
    if (p.lots.length) p.condition = round(Math.max(0, p.condition - amount));
  o.data.strands = strands;
  o.data.panels = panels;
  const joints = shelterJointList(o),
    failed = joints.filter(
      (j) =>
        ['apex', 'foot'].includes(j.kind) &&
        j.strands.length &&
        shelterJointCondition(o, j) < G.loose,
    );
  if (['complete', 'failed'].includes(statusOf(o)) && failed.length) {
    o.data.status = 'collapsed';
    forestEvent(
      w,
      'weather-shelter-collapsed',
      `Load-bearing lashings failed (${failed.map((j) => j.id).join(', ')}); the frame collapsed onto its footprint and gives no protection. Its parts stay recoverable by dismantling.`,
      o.spatial,
      null,
      {
        shelter: o.id,
        failed: failed.map((j) => j.id),
        occupants: v7Json(shelterOccupants(o)),
      },
      o.id,
    );
    return;
  }
  const cover1 = shelterCover(o, true);
  if (
    statusOf(o) === 'complete' &&
    cover1 < cover0 - 1e-12 &&
    cover0 >= 1 - 1e-9
  )
    forestEvent(
      w,
      'weather-shelter-worn',
      `Weather wear opened gaps in the covering: ${String(Math.round(cover1 * 1000) / 10)}% still covered; protection now follows the measured gaps.`,
      o.spatial,
      null,
      { shelter: o.id, covered: cover1, wear: round(amount) },
      o.id,
    );
}

function environment(w: V7World) {
  for (const j of jobs(w).filter(open)) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a) continue;
    for (const s of w.stacks.filter((s) => s.reservedFor === j.id))
      s.position = { ...a.position };
    if (j.status === 'active' && j.lastPaid < w.tick) {
      j.status = 'paused';
      j.reason =
        'Not worked this round; completed rounds and reserved inputs are kept.';
      forestEvent(
        w,
        'weather-shelter-paused',
        'Shelter work paused because it was not worked this round; nothing was charged.',
        a.position,
        a.id,
        summary(w, j),
        j.target,
      );
    }
    sync(a, j);
  }
  for (const o of shelters(w)) {
    occupancy(w, o);
    if (shelterParts(o, 'strands').length || coverLots(o).length) wear(w, o);
    waterBalance(w, o);
  }
}

/** ex24: Kai's small thatched weather shelter. */
export const LONG_EX24_WEATHER_SHELTER: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex24',
  dependencies: ['foundation-open@1'],
  description:
    'A hand-lashed, low A-frame thatched weather shelter for one reclining person: record checks that refuse a measured shortfall at no cost, a paid site and material inspection with a design check, exact escrow, nine paid building rounds into one shelter object, a final geometry, joint, coverage and bedding inspection, occupancy by actual position, fit, entry and capacity, rated rain and wind protection and a dry-bedding ground-contact cut through a gated exposure hook, a covering and bedding water balance, wear, collapse, repair and dismantling.',
  reuse: {
    experiment:
      'ex24 prepare-ventilated-food-storage@1 (exact escrow, staged paid assembly into one object, installed-part provenance, pause, resume, cancel, death, release of removed parts, local placement); ex15 simple-shelter@1 and shared-shelter@1 (the avoided rain and wind chill law, whole-body floor test, one-person capacity, 3 m vine binding); ex10 resting-shelter@1 (wind-slanted rain rays); ex16 branch-screen@1 (a physiology hook gated on its revision that never stacks); ex16 hand-weave-fiber-mat@1 and hand-twist-fiber-cord@1 (thin-stem set, bend limit, dry grass without a stem law); ex21 small-combustion-source@1 (rod geometry, composition, rigidity); ex19 lever-mass-comparator@1 (wood strength)',
    source:
      'long-ex24-ventilated-storage.ts and its physics (rackAt); long-shelter-exposure.ts and long-shared-shelter-exposure.ts (exposure law, occupancy); long-branch-screen-exposure.ts (gated hook); open-shelter-exposure.ts (rain slant); open-shelter-material.ts (version 2 vine and reed laws); long-fiber-cord.ts and long-fiber-mat.ts (stems); long-ex21-small-combustion-physics.ts (smallFireRod, smallFireComposition, SMALL_FIRE.rigid); open-preservation-physics.ts (rain amount and evaporation limit); long-ex19-material-contact.ts; collective-work.ts; material-lots.ts; open-foundation.ts',
    description:
      'Implementation reuse only; every existing package is unchanged and no ability or mastery is inherited. New: the A-frame geometry, joint and bending checks, panel coverage, bedding, entry tracking, the gated exposure hook, the water balance and wear rules, repair and the shelter drawing.',
  },
  abilities: [
    {
      id: ID,
      name: 'Construct and maintain a small weather shelter',
      function:
        'Build a hand-lashed low A-frame thatched shelter for one reclining person from rods, binding, dry stems and bedding; inspect, resume, repair, dismantle or cancel it.',
      equivalence: 'shelter:lashed-thatched-a-frame:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: [...MODES] },
          shelter: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          orientation: { type: 'number', minimum: 0, maximum: 360 },
          materials: {
            type: 'array',
            items: v7ObjectSchema({
              itemId: { type: 'string' },
              quantity: { type: 'number', minimum: 0.1 },
              role: { type: 'string', enum: [...ROLES] },
            }),
          },
        }),
        required: ['mode'],
      },
      references: { shelter: 'optional-exact-visible' },
      prerequisites: [],
      learning: 4,
      costs:
        'Study 4 rounds. Every paid round is 1 energy. build: x, y in reach, orientation (open end faces local -y), materials as own items with role rod, binding, thatch or bedding; a measured shortfall is refused at no cost. Round 1 inspects site and items; a failure reserves nothing. Then 9 rounds: legs, ridge and rails, battens twice, covering four times, bedding with final inspection. build naming the shelter resumes. inspect (anyone, site or shelter): 1 round. repair: replacements for defects, a round per metre of binding or 0.05 m3 of covering or bedding. dismantle (empty): 2 rounds. cancel: free. Gathering and travel are extra.',
      effects:
        'Recipe: 20 rigid wood rods (diameter 0.04 m at 0.01 m precision; legs 0.82 m, others 0.9 m long), at least 30 m of strand (vine 3 m, reed 1.8 m a unit), 0.26 m3 of dry thin-stem covering and 0.1 m3 of dry bedding, volumes from mass, water share (dry at most 0.4) and the stem law; dry grass has none. Inputs become one shelter, 1.6 x 0.8 m under a 0.6 m ridge. Complete only after the final inspection. Occupant: one body wholly on the floor that came in by the open end; a second body voids protection. Rated to rain 5 mm/h (index 1 brings 0.033 mm/h) and wind 5 m/s (index 1 read as 5 m/s): rain on the body x(1 - 0.8 x cover), wind chill x(1 - 0.5 x cover x shelter not facing the wind with its open end), dry bedding halves the ground share (0.25) of cooling; air temperature unchanged. Covering holds rain up to its dry mass, leaks through gaps, dries. Strands and covering wear 0.001 a round, 0.002 in rain or wind; below 0.75 gaps open, below 0.5 lashings fail and the frame collapses. Cancel returns unbuilt inputs once; death stops the work and drops them where the person died; built parts stay until dismantled, returned with condition and water. No reward or refund.',
      handler: HANDLER,
      revision: REVISION,
      authored: false,
      // The completion event carries no qualified flag: building earns no practice milestone.
      practiceEvidence: 'weather-shelter-completed',
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'build: an inspection round, then paid rounds that persist across interruption; repair and dismantle likewise; inspect takes one round.',
      },
    },
  ],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [KIND],
  events: [
    'weather-shelter-materials-tested',
    'weather-shelter-inspected',
    'weather-shelter-started',
    'weather-shelter-progress',
    'weather-shelter-paused',
    'weather-shelter-resumed',
    'weather-shelter-cancelled',
    'weather-shelter-failed',
    'weather-shelter-completed',
    'weather-shelter-check-failed',
    'weather-shelter-repair-started',
    'weather-shelter-repaired',
    'weather-shelter-dismantle-progress',
    'weather-shelter-dismantled',
    'weather-shelter-entered',
    'weather-shelter-left',
    'weather-shelter-exposure-measured',
    'weather-shelter-leaking',
    'weather-shelter-saturated',
    'weather-shelter-bedding-wet',
    'weather-shelter-dried',
    'weather-shelter-worn',
    'weather-shelter-collapsed',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath(w, a) {
    for (const j of jobs(w).filter((j) => j.owner === a.id && open(j))) {
      const o = w.objects.find((o) => o.id === j.target);
      j.x = a.position.x;
      j.y = a.position.y;
      workStop(
        w,
        a,
        j,
        'Performer died; reserved inputs not yet built in lie where the person died.',
        true,
      );
      settle(w, j, o);
      forestEvent(
        w,
        'weather-shelter-failed',
        'Shelter work stopped by death; built-in parts stay at the site and nothing is refunded or passed on.',
        a.position,
        a.id,
        summary(w, j),
        j.target,
      );
      sync(a, j);
    }
  },
};
