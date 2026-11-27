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
import { v7Id, v7Json, v7Number, v7RoundNumber } from './continuous-data.js';
import { v7Inside, v7Reach, v7ShapesOverlap } from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { materialPortion } from './material-lots.js';
import {
  foodWaterExpose,
  foodWaterInitialize,
  foodWaterRead,
  foodWaterSurfaceArea,
  foodWaterWithdraw,
} from './food-water.js';
import { preservationPhysics } from './open-preservation-physics.js';
import { openConditions } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workAllocations,
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
import { airExposureUnsupported } from './long-ex19-food-air-exposure.js';
import { AIR_DRY_FOOTPRINT } from './long-ex21-air-dry-food.js';
import {
  SMALL_FIRE,
  smallFireRod,
} from './long-ex21-small-combustion-physics.js';
import { SIMPLE_SHELTER_WEAR as WEAR } from './long-simple-shelter.js';
import {
  VENTILATED_RACK as G,
  VENTILATED_RACK_COEFFICIENT as COEFFICIENT,
  VENTILATED_RACK_KIND as KIND,
  VENTILATED_RACK_REVISION as REVISION,
  rackAt,
  rackLying,
  rackPieces,
  rackStandingWater,
  rackState,
  rackVentilation,
  rackKey,
} from './long-ex24-ventilated-storage-physics.js';
import type {
  RackLot,
  RackPiece,
  RackState,
} from './long-ex24-ventilated-storage-physics.js';

/** ex24: prepare ventilated food storage. A small open raised lattice of two branch supports and
 * three crosspieces holds one lot of separated whole food off the soil under the installed food
 * water representation; the decay update applies the declared storage coefficient to compatible
 * intact roots only while every coded condition check passes (long-ex24-ventilated-storage-
 * physics). A paired comparison reads the stored lot against its tracked carried control. */

const ID = 'prepare-ventilated-food-storage';
const HANDLER = `long.${ID}`;
const STATE = `long:work:${ID}`;
const MODES = [
  'prepare',
  'load',
  'unload',
  'inspect',
  'compare',
  'maintain',
  'dismantle',
  'cancel',
] as const;
/** World Agent specification costs: material and site inspection 1 round and 1 energy; three
 * assembly rounds of 1 energy; loading or unloading 0.5 energy per unit; inspection or comparison
 * 0.5; maintenance 1 plus the replacement pieces. Dismantling is declared at 1 like maintenance. */
const COST = {
  inspect: 1,
  assembly: 1,
  handle: 0.5,
  look: 0.5,
  maintain: 1,
  dismantle: 1,
};
/** A same-start pair can be compared after at least this many paired rounds (specification). */
const PAIRED = 5;
/** Wood pieces with the declared ex21 rod geometry (smallFireRod: 900 kg/m3, 25 diameters). */
const ROD_WOODS = ['branch', 'willow', 'birch', 'oak'];
/** material-geometry@1 wood values as restated by the ex19 lever comparator (Pa). */
const WOOD = { modulus: 4e9, strength: 45e6 };
/** Declared load-rating terms: a safety factor of 2 on bending strength, and the ex19 visible
 * bending limit of 0.02 of the half-beam for a central point load. */
const SAFETY = 2;
const SAG = 0.02;
const GRAVITY = 9.81;
/** The representation's evaporation limit per unit area (open-preservation-physics, 0.025 x area x
 * temperature factor), applied here only to rain water lying on food on the open deck. */
const SURFACE_DRYING = 0.025;
/** Processing record of a used piece taken out of a rack, with its worn condition. */
const PIECE = 'ventilatedRackPiece';
const TREATED = [
  'mantle',
  'frictionKit',
  'waterCup',
  'componentLots',
  'materialLayer',
  'canopyDrying',
  'fuelMoisture',
] as const;
const DECK_AREA = G.deck.length * G.deck.width;
const CAPACITY = Math.floor(DECK_AREA / AIR_DRY_FOOTPRINT + 1e-9);

interface Slot {
  slot: string;
  role: 'support' | 'crosspiece';
  u: number;
  v: number;
}
const SLOTS: Slot[] = [
  { slot: 'support-0', role: 'support', u: -G.span / 2, v: 0 },
  { slot: 'support-1', role: 'support', u: G.span / 2, v: 0 },
  { slot: 'crosspiece-0', role: 'crosspiece', u: 0, v: -G.slat },
  { slot: 'crosspiece-1', role: 'crosspiece', u: 0, v: 0 },
  { slot: 'crosspiece-2', role: 'crosspiece', u: 0, v: G.slat },
];
/** Three paid assembly rounds; the last also runs the coded stability and load check. */
const STAGES = [
  { stage: 'lay-supports', slots: ['support-0', 'support-1'] },
  { stage: 'lay-crosspieces', slots: ['crosspiece-0', 'crosspiece-1'] },
  { stage: 'last-crosspiece-and-check', slots: ['crosspiece-2'] },
];

interface Prep extends CollectiveWork {
  plan: V7Data[];
}

const round = (x: number) => v7RoundNumber(x);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const nothing = (why: string) => new Error(`${why} Nothing was spent.`);
const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const jobs = (w: V7World) => collectiveJobs(w, ID).map((j) => j as Prep);
const sync = (a: V7Actor, j: CollectiveWork) => {
  a.extensionState[STATE] = v7Json(j);
};
const slotOf = (slot: string) => SLOTS.find((s) => s.slot === slot);
const racks = (w: V7World) => w.objects.filter((o) => o.kind === KIND);
const statusOf = (o: V7Object) => text(o.data.status) || 'planned';
const color = (w: V7World, resource: string) =>
  w.resources.find((r) => r.id === resource)?.color ?? '#8d704e';
const pieceCondition = (s: V7Stack) =>
  Number((s.processing?.[PIECE] as V7Data | undefined)?.condition ?? 1);
const unitMass = (w: V7World, s: V7Stack) =>
  s.physical?.unitMass ?? w.resources.find((r) => r.id === s.resource)?.mass;
const whole = (s: V7Stack) => Math.floor(foodTenths(s.quantity) / 10);
function omit(value: object, keys: string[]): V7Data {
  const out: V7Data = {};
  for (const [k, v] of Object.entries(value) as [string, unknown][])
    if (!keys.includes(k) && v !== undefined) out[k] = v7Json(v);
  return out;
}

/** Declared size and load rating of one whole piece: the ex21 rod and a central point load over
 * the crosspiece span, limited by bending strength / 2 and by a visible bend of 0.02 half-span. */
function rod(w: V7World, s: V7Stack) {
  const { diameter, length } = smallFireRod(w, s),
    inertia = (Math.PI * diameter ** 4) / 64,
    section = (Math.PI * diameter ** 3) / 32,
    strength = (4 * section * WOOD.strength) / SAFETY / G.span,
    stiffness =
      (48 * WOOD.modulus * inertia * SAG * (G.span / 2)) / G.span ** 3;
  return {
    diameter,
    length,
    strengthKg: round(strength / GRAVITY),
    stiffnessKg: round(stiffness / GRAVITY),
    rating: round(Math.min(strength, stiffness) / GRAVITY),
  };
}
/** Deck rating: a load bears on at least two crosspieces, so twice the weakest one's rating. */
const deckRating = (pieces: { role: string; rating: number }[]) =>
  round(
    2 *
      Math.min(
        ...pieces.filter((p) => p.role === 'crosspiece').map((p) => p.rating),
      ),
  );

function spatial(s: { x: number; y: number; angle: number }): V7Spatial {
  return {
    x: s.x,
    y: s.y,
    angle: s.angle,
    shape: { kind: 'rectangle', width: G.deck.length, height: G.deck.width },
    solid: false,
    reserved: true,
    interaction: 0.65,
    entrances: [],
  };
}
function square(
  s: { x: number; y: number; angle: number },
  side: number,
): V7Spatial {
  return {
    x: s.x,
    y: s.y,
    angle: s.angle,
    shape: { kind: 'rectangle', width: side, height: side },
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

/** Why a named unit cannot be a rack piece in this role, found by handling it, or null. */
function pieceProblem(
  w: V7World,
  s: V7Stack,
  role: string,
  supportDiameter: number,
): string | null {
  const r = w.resources.find((r) => r.id === s.resource);
  if (
    TREATED.some((k) => s[k] !== undefined) ||
    Object.keys(s.processing ?? {}).some((k) => k !== PIECE)
  )
    return `${s.id} is worked or treated; only clean untreated pieces are used`;
  const contact = ex19MaterialContact(w, s);
  if (contact.contaminated || contact.fractured)
    return `${s.id} is contaminated or fractured`;
  const flex = r?.properties?.flexibility ?? 10;
  if (flex > SMALL_FIRE.rigid)
    return `${s.id} bends too easily (flexibility ${String(flex)}; at most ${String(SMALL_FIRE.rigid)} is rigid)`;
  if (pieceCondition(s) < G.sound)
    return `${s.id} is a loosened used piece (condition ${String(round(pieceCondition(s)))})`;
  const g = rod(w, s);
  if (role === 'crosspiece' && g.length < G.span + supportDiameter)
    return `${s.id} is ${String(g.length)} m long, too short to span the supports (${String(round(G.span + supportDiameter))} m)`;
  if (role === 'support' && g.length < G.deck.width + 2 * g.diameter)
    return `${s.id} is too short to carry the crosspieces`;
  return null;
}

/** Visible site problems found by the paid inspection. */
function siteProblems(
  w: V7World,
  s: { x: number; y: number; angle: number },
  side: number,
  self: string | null,
): string[] {
  const foot = square(s, side),
    corners = [
      [0, 0],
      [-side / 2, -side / 2],
      [side / 2, -side / 2],
      [-side / 2, side / 2],
      [side / 2, side / 2],
    ].map(([u = 0, v = 0]) => rackAt(s, u, v)),
    problems: string[] = [];
  if (corners.some((p) => ex19MaterialGround(w, p)))
    problems.push('the ground is water, a wet bank or waterlogged');
  if (corners.some((p) => openConditions(w, p).hazards.length))
    problems.push('the ground is under a hazard');
  const others = w.objects.filter((o) => o.id !== self);
  if (others.some((o) => v7ShapesOverlap(foot, { ...o.spatial, solid: true })))
    problems.push('the footprint overlaps a plant, object or site');
  if (
    w.actors.some((x) => x.vitals.health > 0 && v7ShapesOverlap(foot, body(x)))
  )
    problems.push('a person occupies the footprint');
  if (forestClimate(w, s).indoor)
    problems.push('the site is enclosed, without outdoor air');
  const margin: V7Spatial = {
    ...spatial(s),
    shape: {
      kind: 'rectangle',
      width: G.deck.length + 2 * G.margin,
      height: G.deck.width + 2 * G.margin,
    },
    solid: true,
  };
  if (others.some((o) => o.spatial.solid && v7ShapesOverlap(margin, o.spatial)))
    problems.push('a solid object closes the 0.25 m ventilation margin');
  return problems;
}

/** One new stack of `units` whole units split exactly from `s`; every other field is kept. */
function split(w: V7World, s: V7Stack, units: number): V7Stack {
  const part: V7Stack = {
    ...materialPortion(s, units * 10),
    id: v7Id(w, 'item'),
    quantity: units,
    quantityTenths: units * 10,
  };
  delete part.reservedFor;
  foodSetQuantity(s, foodTenths(s.quantity) - units * 10);
  w.stacks.push(part);
  return part;
}

function refresh(w: V7World, o: V7Object) {
  const list = rackPieces(o),
    status = statusOf(o),
    st = rackState(w, o),
    r = st.lot,
    s = r ? w.stacks.find((x) => x.id === r.lot) : undefined,
    last = r ?? st.ended.at(-1) ?? null,
    stages = STAGES.filter((x) =>
      x.slots.every((slot) => list.some((p) => p.slot === slot)),
    ).length,
    vent = rackVentilation(w, o),
    reading = s ? foodWaterRead(s) : null,
    lastRow = reading?.last;
  o.spatial.solid = list.length > 0;
  o.spatial.reserved = list.length === 0;
  o.data.integrity = list.length
    ? round(Math.min(...list.map((p) => p.condition)))
    : 0;
  o.data.mass = round(list.reduce((n, p) => n + Number(p.mass ?? 0), 0));
  o.data.foodSurface = ['complete', 'damaged'].includes(status);
  o.visual.state = status;
  const favourable =
    !!r && r.status === 'stored' && r.checkedAt === w.tick && r.favourable;
  o.data.view = {
    component: KIND,
    rack: o.id,
    owner: text(o.data.owner) || null,
    status,
    stage: o.data.stage ?? null,
    position: { x: o.spatial.x, y: o.spatial.y },
    orientation: o.data.orientation ?? 0,
    footprint: Number(o.data.footprint ?? 0),
    deck: {
      length: G.deck.length,
      width: G.deck.width,
      height: Number(o.data.height ?? 0),
    },
    work: {
      completed: stages,
      required: STAGES.length,
      fraction: round(stages / STAGES.length),
    },
    integrity: o.data.integrity,
    installed: list.length,
    required: SLOTS.length,
    pieces: list.map((p) => {
      const at = slotOf(p.slot);
      return {
        slot: p.slot,
        role: p.role,
        u: at?.u ?? 0,
        v: at?.v ?? 0,
        length: p.length,
        diameter: p.diameter,
        condition: round(p.condition),
        color: color(w, p.resource),
      };
    }),
    capacity: Number(o.data.capacity ?? 0),
    rating: Number(o.data.rating ?? 0),
    occupied: s && r?.status === 'stored' ? s.quantity : 0,
    food:
      s && r?.status === 'stored'
        ? {
            item: s.id,
            resource: s.resource,
            color: color(w, s.resource),
            quantity: s.quantity,
            wet: r.wetted,
          }
        : null,
    exposure: {
      rain:
        lastRow && lastRow.tick === w.tick
          ? Number(lastRow.rain ?? 0)
          : (forestClimate(w, o.spatial).rain ?? 0),
      standingWater: rackStandingWater(w, o),
      ventilated: vent.adequate,
    },
    favourable,
    conditionalRate: favourable ? COEFFICIENT : 1,
    demonstrated: last?.comparison?.verdict === 'slower decay shown',
    comparison: last?.comparison ? text(last.comparison.verdict) : null,
  };
}

function summary(w: V7World, j: Prep): V7Data {
  const o = w.objects.find((o) => o.id === j.target);
  return {
    workId: j.id,
    rack: j.target,
    status: j.status,
    completedRounds: j.completedWork,
    remainingRounds: j.remainingWork,
    paidEnergy: round(j.paidEnergy),
    nextStage: STAGES[j.completedWork]?.stage ?? null,
    reserved: v7Json(
      j.escrow.filter((id) =>
        w.stacks.some((s) => s.id === id && s.reservedFor === j.id),
      ),
    ),
    view: o?.data.view ?? null,
  };
}

/** The coded stability and load check of an assembled rack. */
function verify(w: V7World, o: V7Object) {
  const list = rackPieces(o),
    supports = list.filter((p) => p.role === 'support'),
    crosspieces = list.filter((p) => p.role === 'crosspiece'),
    widest = Math.max(0, ...supports.map((p) => p.diameter)),
    ground = SLOTS.filter((s) => s.role === 'support').flatMap((s) =>
      [-1, 0, 1].map((k) =>
        rackAt(o.spatial, s.u, (k * Number(o.data.footprint ?? 0)) / 2),
      ),
    ),
    rating = crosspieces.length ? deckRating(crosspieces) : 0,
    tests = [
      {
        test: 'supports seated on firm ground',
        passed:
          supports.length === 2 &&
          supports.every((p) => p.condition >= G.sound) &&
          ground.every((p) => !ex19MaterialGround(w, p)),
        measured: {
          supports: supports.length,
          weakest: supports.length
            ? round(Math.min(...supports.map((p) => p.condition)))
            : null,
        },
      },
      {
        test: 'crosspieces span and carry the deck load',
        passed:
          crosspieces.length === 3 &&
          crosspieces.every(
            (p) => p.condition >= G.sound && p.length >= G.span + widest,
          ) &&
          rating >=
            CAPACITY * (w.resources.find((r) => r.id === 'root')?.mass ?? 0),
        measured: {
          crosspieces: crosspieces.length,
          span: G.span,
          shortest: crosspieces.length
            ? Math.min(...crosspieces.map((p) => p.length))
            : null,
          ratingKg: rating,
        },
      },
    ];
  return { passed: tests.every((t) => t.passed), tests, rating };
}
function check(w: V7World, o: V7Object, actor: string | null) {
  const v = verify(w, o),
    list = rackPieces(o);
  o.data.tests = [
    ...(Array.isArray(o.data.tests) ? o.data.tests : []),
    { tick: w.tick, by: actor, passed: v.passed, tests: v7Json(v.tests) },
  ].slice(-4);
  o.data.status = v.passed ? 'complete' : 'unstable';
  o.data.rating = v.passed ? v.rating : 0;
  o.data.capacity = v.passed ? CAPACITY : 0;
  o.data.height = round(
    Math.max(
      0,
      ...list.filter((p) => p.role === 'support').map((p) => p.diameter),
    ) +
      Math.max(
        0,
        ...list.filter((p) => p.role === 'crosspiece').map((p) => p.diameter),
      ),
  );
  refresh(w, o);
  return v;
}

/** Moves one reserved or split unit into the rack as an installed piece. */
function install(
  w: V7World,
  o: V7Object,
  s: V7Stack,
  slot: string,
  owner: string,
): RackPiece {
  const g = rod(w, s),
    piece = {
      ...omit(s, ['reservedFor', 'owner', 'position', 'processing']),
      slot,
      role: slotOf(slot)?.role ?? 'crosspiece',
      condition: pieceCondition(s),
      installedAt: w.tick,
      sourceOwner: owner,
      diameter: g.diameter,
      length: g.length,
      rating: g.rating,
      mass: round((unitMass(w, s) ?? 0) * s.quantity),
    } as unknown as RackPiece;
  w.stacks = w.stacks.filter((x) => x.id !== s.id);
  o.data.pieces = [...rackPieces(o), piece];
  return piece;
}
/** A removed piece becomes an unowned ground stack at its place, keeping its worn condition. */
function release(w: V7World, o: V7Object, p: RackPiece): string {
  const id = v7Id(w, 'item'),
    at = slotOf(p.slot);
  w.stacks.push({
    ...(omit(p, [
      'slot',
      'role',
      'condition',
      'installedAt',
      'sourceOwner',
      'diameter',
      'length',
      'rating',
      'mass',
    ]) as unknown as V7Stack),
    id,
    owner: null,
    position: rackAt(o.spatial, at?.u ?? 0, at?.v ?? 0),
    processing: {
      [PIECE]: {
        rack: o.id,
        slot: p.slot,
        piece: p.id,
        condition: round(p.condition),
        removedAt: w.tick,
      },
    },
  });
  o.data.pieces = rackPieces(o).filter((x) => x.id !== p.id);
  return id;
}

/** Ends the stored lot once: the record is kept for comparison and the control released. */
function endLot(w: V7World, st: RackState, r: RackLot, status: string) {
  r.status = status;
  r.endedAt = w.tick;
  const c = r.control ? w.stacks.find((s) => s.id === r.control) : undefined;
  if (c && c.reservedFor === controlReservation(st.rack)) delete c.reservedFor;
  st.ended = [...st.ended, r].slice(-3);
  st.lot = null;
}
const controlReservation = (rack: string) => `${rack}:control`;

/** Removes an empty rack and its hidden record. */
function remove(w: V7World, o: V7Object) {
  const key = rackKey(o.id);
  w.objects = w.objects.filter((x) => x.id !== o.id);
  w.state = Object.fromEntries(
    Object.entries(w.state).filter(([k]) => k !== key),
  );
}
/** After cancel, a lost piece or death, installed pieces stay as an incomplete rack. */
function settle(w: V7World, o: V7Object | undefined) {
  if (!o) return;
  o.data.workId = null;
  if (!rackPieces(o).length) {
    remove(w, o);
    return;
  }
  o.data.status = 'incomplete';
  refresh(w, o);
}

function pause(
  c: V7ActionContext,
  j: Prep,
  reason: string,
  data: V7Data = {},
): V7HandlerResult {
  j.status = 'paused';
  j.reason = reason;
  const o = c.world.objects.find((o) => o.id === j.target);
  if (o) {
    o.data.status = 'paused';
    refresh(c.world, o);
  }
  c.emit(
    'food-rack-paused',
    `${reason} Completed rounds, installed pieces and reserved pieces are kept; nothing was spent.`,
    { ...summary(c.world, j), ...data },
    j.target,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id] };
}

/** Coded rechecks before a paid assembly round; returns the problem or null. */
function recheck(c: V7ActionContext, j: Prep, o: V7Object): string | null {
  const w = c.world;
  if (!v7Reach(c.actor, o.spatial))
    return 'The rack site is beyond working reach.';
  const side = Number(o.data.footprint ?? 0),
    s = o.spatial,
    corners = [
      [0, 0],
      [-side / 2, -side / 2],
      [side / 2, -side / 2],
      [-side / 2, side / 2],
      [side / 2, side / 2],
    ].map(([u = 0, v = 0]) => rackAt(s, u, v));
  if (
    corners.some(
      (p) => ex19MaterialGround(w, p) || openConditions(w, p).hazards.length,
    )
  )
    return 'The ground of the site is now wet, waterlogged or under a hazard.';
  if (
    w.actors.some(
      (x) => x.vitals.health > 0 && v7ShapesOverlap(square(s, side), body(x)),
    )
  )
    return 'A person occupies the footprint.';
  if (c.actor.vitals.energy < COST.assembly)
    return 'Not enough energy for the next paid assembly round.';
  if (
    j.escrow
      .slice(
        STAGES.slice(0, j.completedWork).reduce(
          (n, s) => n + s.slots.length,
          0,
        ),
      )
      .some(
        (id) =>
          !w.stacks.some(
            (x) => x.id === id && x.reservedFor === j.id && x.quantity === 1,
          ),
      )
  )
    return 'lost';
  return null;
}

/** One paid assembly round; `explicit` refuses at no cost instead of pausing. */
function advance(
  c: V7ActionContext,
  j: Prep,
  explicit: boolean,
): V7HandlerResult {
  const w = c.world,
    o = w.objects.find((o) => o.id === j.target && o.kind === KIND);
  if (!open(j) || !o) throw nothing('This rack work is already settled.');
  const problem = recheck(c, j, o);
  if (problem === 'lost') {
    j.x = c.actor.position.x;
    j.y = c.actor.position.y;
    workStop(
      w,
      c.actor,
      j,
      'A reserved piece was lost; surviving reserved pieces returned.',
      false,
    );
    settle(w, o);
    c.emit(
      'food-rack-failed',
      'Assembly stopped because a reserved piece was lost; installed pieces stay at the site.',
      summary(w, j),
      j.target,
    );
    sync(c.actor, j);
    return { complete: true, writes: [j.id] };
  }
  if (problem) {
    if (explicit) throw nothing(problem);
    return pause(c, j, problem);
  }
  const resumed = j.status === 'paused';
  if (!workPay(c, j, COST.assembly))
    throw new Error('Energy changed before the paid round.');
  c.actor.vitals.energy = round(c.actor.vitals.energy);
  if (resumed)
    c.emit(
      'food-rack-resumed',
      'Unfinished rack work resumed after rechecking reach, site, pieces and energy.',
      summary(w, j),
      o.id,
    );
  const n = j.completedWork,
    stage = STAGES[n - 1] ?? { stage: '', slots: [] },
    first = STAGES.slice(0, n - 1).reduce((k, s) => k + s.slots.length, 0),
    installed = stage.slots.flatMap((slot, i) => {
      const s = w.stacks.find((x) => x.id === j.escrow[first + i]);
      return s ? [install(w, o, s, slot, c.actor.id)] : [];
    });
  o.data.stage = stage.stage;
  o.data.status = 'in-progress';
  refresh(w, o);
  if (n >= STAGES.length) {
    j.status = 'completed';
    j.outputs = [o.id];
    o.data.workId = null;
    const v = check(w, o, c.actor.id);
    c.emit(
      v.passed ? 'food-rack-completed' : 'food-rack-check-failed',
      v.passed
        ? `Round 3 of 3: the last crosspiece is laid and the stability and load check passed. The rack holds up to ${String(CAPACITY)} separated units in one layer, rated ${String(v.rating)} kg. Preservation is not shown by building it.`
        : 'Round 3 of 3: the stability and load check failed; the rack is unstable and holds no food until maintained.',
      {
        rack: o.id,
        tests: v7Json(v.tests),
        installed: v7Json(installed),
        status: statusOf(o),
        view: o.data.view ?? null,
      },
      o.id,
    );
    sync(c.actor, j);
    return { complete: true, remaining: 0, writes: [j.id, o.id] };
  }
  c.emit(
    'food-rack-progress',
    `Paid assembly round ${String(n)} of ${String(STAGES.length)} (${stage.stage}): ${String(rackPieces(o).length)} of 5 pieces laid. An unfinished rack holds no food.`,
    { ...summary(w, j), round: n, installed: v7Json(installed) },
    o.id,
  );
  sync(c.actor, j);
  return { complete: false, remaining: j.remainingWork, writes: [j.id, o.id] };
}

/** Owned whole wood units named in `materials`, flattened to one-unit pieces in order. */
function allocate(c: V7ActionContext, n: number) {
  let list;
  try {
    list = workAllocations(c, c.action.args.materials);
  } catch (error) {
    throw nothing(
      `materials: ${error instanceof Error ? error.message : 'unusable'}`,
    );
  }
  let total = 0;
  for (const { stack, quantity } of list) {
    if (stack.reservedFor)
      throw nothing(`${stack.id} is reserved for unfinished work.`);
    if (!ROD_WOODS.includes(stack.resource))
      throw nothing(
        `${stack.id} is ${stack.resource}; rack pieces are whole wood units (${ROD_WOODS.join(', ')}).`,
      );
    if (stack.componentLots || !Number.isInteger(quantity))
      throw nothing('Name whole single wood units, not combined lots.');
    if (whole(stack) < quantity)
      throw nothing(`${stack.id} holds fewer than ${String(quantity)} units.`);
    total += quantity;
  }
  if (total !== n)
    throw nothing(
      `Exactly ${String(n)} owned whole wood units are needed; ${String(total)} named.`,
    );
  return list.flatMap((a) =>
    Array.from({ length: a.quantity }, () => ({ stack: a.stack, quantity: 1 })),
  );
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

/** Round 1 of prepare: the paid material and site inspection, then reservation. */
function prepare(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor;
  if (workFind(c))
    throw nothing(
      'Unfinished rack work exists; prepare naming its rack resumes it, or cancel it.',
    );
  if (text(c.action.args.rack))
    throw nothing('No unfinished rack work of yours on that rack.');
  let s;
  try {
    s = site(c);
  } catch (error) {
    throw nothing(error instanceof Error ? error.message : 'Give x and y.');
  }
  if (!v7Inside(w, s, 0.6)) throw nothing('The site is outside the world.');
  if (!v7Reach(a, spatial(s)))
    throw nothing('Move within reach of the rack site first.');
  const units = allocate(c, SLOTS.length);
  const foodId = text(c.action.args.food);
  const food = foodId ? w.stacks.find((x) => x.id === foodId) : undefined;
  if (foodId && (!food || food.owner !== a.id))
    throw nothing('food must name one of your own food stacks.');
  const proposed =
    c.action.args.quantity === undefined ? CAPACITY : c.action.args.quantity;
  if (
    typeof proposed !== 'number' ||
    !Number.isSafeInteger(proposed) ||
    proposed < 1
  )
    throw nothing('quantity is a whole number of food units, at least 1.');
  if (a.vitals.energy + 1e-9 < COST.inspect)
    throw nothing('The material and site inspection needs 1 energy.');
  // Every request check passed: the inspection round is paid whatever it finds.
  v7Spend(a, COST.inspect);
  const loadMass = round(
    proposed *
      (food
        ? (unitMass(w, food) ?? 0)
        : (w.resources.find((r) => r.id === 'root')?.mass ?? 0)),
  );
  const geometry = units.map((u, i) => ({
    item: u.stack.id,
    resource: u.stack.resource,
    role: SLOTS[i]?.role ?? 'crosspiece',
    ...rod(w, u.stack),
  }));
  const widest = Math.max(
    ...geometry.filter((g) => g.role === 'support').map((g) => g.diameter),
  );
  const side = round(Math.max(...geometry.map((g) => g.length)));
  const pieceProblems = units.flatMap((u, i) => {
    const why = pieceProblem(
      w,
      u.stack,
      SLOTS[i]?.role ?? 'crosspiece',
      widest,
    );
    return why ? [`${SLOTS[i]?.slot ?? ''}: ${why}`] : [];
  });
  const rating = deckRating(geometry);
  const loadProblems = [
    ...(proposed > CAPACITY
      ? [
          `${String(proposed)} units do not fit one separated layer of ${String(CAPACITY)} on the 0.8 x 0.2 m deck; a larger load needs another rack`,
        ]
      : []),
    ...(loadMass > rating
      ? [
          `the proposed ${String(loadMass)} kg exceeds the ${String(rating)} kg rating`,
        ]
      : []),
  ];
  const problems = [
    ...pieceProblems,
    ...siteProblems(w, s, side, null),
    ...loadProblems,
  ];
  const finding = {
    x: s.x,
    y: s.y,
    orientation: s.orientation,
    suitable: !problems.length,
    problems,
    pieces: v7Json(geometry),
    footprint: side,
    deck: { length: G.deck.length, width: G.deck.width, area: DECK_AREA },
    capacity: CAPACITY,
    ratingKg: rating,
    proposedLoad: {
      item: food?.id ?? null,
      units: proposed,
      kg: loadMass,
    },
    ground: openConditions(w, s).regime,
    energy: COST.inspect,
  };
  openRemember(c, {
    key: `food-rack:site:${s.x.toFixed(1)},${s.y.toFixed(1)}`,
    subject: 'food-rack-site',
    property: 'pieces, site and proposed load checked by handling and looking',
    value: v7Json(finding),
    method: 'direct inspection',
    condition: openConditions(w, s).regime,
    verified: false,
  });
  c.emit(
    'food-rack-materials-inspected',
    problems.length
      ? `Inspection found a shortfall: ${problems.join('; ')}. Nothing was reserved and no food was touched.`
      : 'Pieces and site passed the inspection; the five pieces are reserved and assembly continues.',
    finding,
    null,
  );
  if (problems.length) return { complete: true, writes: [] };
  const j = workCreate(c, 'prepare', STAGES.length) as Prep;
  j.paidEnergy = COST.inspect;
  j.lastPaid = w.tick;
  const o: V7Object = {
    id: v7Id(w, 'rack'),
    kind: KIND,
    name: 'Ventilated branch rack',
    spatial: spatial(s),
    visual: {
      component: KIND,
      color: color(w, units[0]?.stack.resource ?? 'branch'),
      accent: '#c9b48a',
      label: 'Branch rack',
      state: 'planned',
    },
    data: {
      status: 'planned',
      owner: a.id,
      workId: j.id,
      stage: null,
      orientation: s.orientation,
      footprint: side,
      pieces: [],
      tests: [],
      capacity: 0,
      rating: 0,
      height: 0,
      foodSurface: false,
    },
    createdBy: a.id,
    createdAt: w.tick,
    revision: REVISION,
  };
  w.objects.push(o);
  j.target = o.id;
  workReserve(c, j, units);
  w.stacks = w.stacks.filter((x) => x.quantity > 0);
  j.plan = SLOTS.map((slot, i) => ({
    slot: slot.slot,
    role: slot.role,
    escrow: j.escrow[i] ?? '',
    source: units[i]?.stack.id ?? '',
  }));
  rackState(w, o);
  refresh(w, o);
  c.emit(
    'food-rack-started',
    'Five pieces are reserved and stay carried until paid rounds lay them; a progress record holds the site, recipe, capacity and costs.',
    { ...summary(w, j), recipe: v7Json(j.plan), finding: v7Json(finding) },
    o.id,
  );
  sync(a, j);
  return { complete: false, remaining: STAGES.length, writes: [j.id, o.id] };
}

/** The named rack within reach; `owner` also requires the person to be its builder. */
function rackOf(c: V7ActionContext, owner: boolean): V7Object {
  const id = text(c.action.args.rack),
    o = c.world.objects.find((o) => o.id === id && o.kind === KIND);
  if (!o) throw nothing('rack must name a branch rack in view.');
  if (!v7Reach(c.actor, o.spatial)) throw nothing('The rack is beyond reach.');
  if (owner && o.data.owner !== c.actor.id)
    throw nothing('Only the person who built this rack may do that.');
  return o;
}
function idle(c: V7ActionContext, o: V7Object) {
  if (jobs(c.world).some((j) => j.target === o.id && open(j)))
    throw nothing('Work on this rack is still open; resume or cancel it.');
}
function count(v: unknown, name: string, min: number) {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min)
    throw nothing(
      `${name} is a whole number of units, at least ${String(min)}.`,
    );
  return v;
}

function load(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    o = rackOf(c, true);
  idle(c, o);
  const st = rackState(w, o);
  if (statusOf(o) !== 'complete')
    throw nothing(
      `The rack is ${statusOf(o)}; only a complete rack holds food.`,
    );
  if (st.lot) throw nothing('The rack already holds a lot; unload it first.');
  const food = w.stacks.find((s) => s.id === text(c.action.args.food));
  if (!food || food.owner !== a.id)
    throw nothing('food must name one of your own food stacks.');
  if (food.reservedFor) throw nothing('That food is reserved for other work.');
  const unsupported = airExposureUnsupported(w, food);
  if (unsupported) throw nothing(unsupported);
  const n = count(c.action.args.quantity ?? 1, 'quantity', 1),
    k = count(c.action.args.controlQuantity ?? 0, 'controlQuantity', 0);
  if (n > CAPACITY)
    throw nothing(
      `The deck holds ${String(CAPACITY)} separated units in one layer.`,
    );
  if (n + k > whole(food))
    throw nothing(
      `${food.id} holds ${String(food.quantity)}; ${String(n)} loaded and ${String(k)} control whole units are needed.`,
    );
  const mass = round(n * (unitMass(w, food) ?? 0));
  if (mass > Number(o.data.rating ?? 0))
    throw nothing(`${String(mass)} kg exceeds the rack rating.`);
  try {
    foodWaterSurfaceArea(w, { kind: 'object', id: o.id });
  } catch (error) {
    throw nothing(
      error instanceof Error ? error.message : 'The deck is unusable.',
    );
  }
  const energy = round(COST.handle * n);
  if (a.vitals.energy + 1e-9 < energy)
    throw nothing(`Loading ${String(n)} units needs ${String(energy)} energy.`);
  v7Spend(a, energy);
  const before = {
    item: food.id,
    quantity: food.quantity,
    decay: round(food.decay ?? 0),
    harvestedAt: food.harvestedAt ?? null,
    origin: food.origin,
  };
  const lot = split(w, food, n);
  lot.owner = null;
  foodWaterExpose(w, lot, { kind: 'object', id: o.id }, false);
  const control = k ? split(w, food, k) : null;
  if (control) {
    control.reservedFor = controlReservation(o.id);
    foodWaterInitialize(w, control);
  }
  w.stacks = w.stacks.filter((s) => s.quantity > 0);
  st.serial += 1;
  const decay0 = round(lot.decay ?? 0);
  const record: RackLot = {
    serial: st.serial,
    lot: lot.id,
    control: control?.id ?? null,
    source: food.id,
    resource: lot.resource,
    quantity: n,
    controlQuantity: k,
    loadedAt: w.tick,
    loadedBy: a.id,
    status: 'stored',
    endedAt: null,
    decay0,
    lotDecay: lot.decay ?? 0,
    controlDecay: control ? (control.decay ?? 0) : null,
    controlPresent: !!control,
    water0: lot.physical?.unitWater ?? 0,
    waterFraction0: foodWaterRead(lot)?.waterFraction ?? 0,
    reference: control ? 'control' : 'loading state',
    checkedAt: -1,
    ordinary: 0,
    applied: 0,
    favourable: false,
    announced: null,
    failed: [],
    temperature: null,
    controlTemperature: null,
    rain: 0,
    wetter: false,
    rounds: 0,
    ordinaryTotal: 0,
    appliedTotal: 0,
    pairRounds: 0,
    lotGain: 0,
    controlGain: 0,
    allowance: 0,
    favourableRounds: 0,
    rainRounds: 0,
    wetRounds: 0,
    unequalRounds: 0,
    temperatureDifference: 0,
    maxTemperatureDifference: 0,
    wetted: false,
    dried: 0,
    comparison: null,
  };
  st.lot = record;
  refresh(w, o);
  c.emit(
    'food-rack-loaded',
    `${String(n)} whole ${lot.resource} laid separated on the rack deck${control ? `, ${String(k)} kept carried as the tracked control` : ' without a tracked control (checks then compare with its loading state)'}; ${String(food.quantity)} remain in ${food.id}. Quantity, harvest time, decay, nutrition and origin are unchanged.`,
    {
      rack: o.id,
      source: before,
      lot: { item: lot.id, quantity: lot.quantity, decay: decay0 },
      control: control
        ? { item: control.id, quantity: control.quantity, decay: decay0 }
        : null,
      remaining: food.quantity,
      energy,
      view: o.data.view ?? null,
    },
    o.id,
  );
  return { complete: true, writes: [o.id, lot.id, food.id] };
}

function unload(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    o = rackOf(c, true),
    st = rackState(w, o),
    r = st.lot,
    s = r ? w.stacks.find((x) => x.id === r.lot) : undefined;
  if (!r || !s || !rackLying(o, s))
    throw nothing('No food lies on this rack deck.');
  const energy = round(COST.handle * Math.ceil(s.quantity - 1e-9));
  if (a.vitals.energy + 1e-9 < energy)
    throw nothing(`Unloading needs ${String(energy)} energy.`);
  v7Spend(a, energy);
  foodWaterWithdraw(w, s);
  s.owner = a.id;
  s.position = { ...a.position };
  endLot(w, st, r, 'unloaded');
  refresh(w, o);
  c.emit(
    'food-rack-unloaded',
    `${String(s.quantity)} ${s.resource} taken off the rack into your carried food; the control returns to ordinary use. Decay and harvest time are unchanged.`,
    {
      rack: o.id,
      item: s.id,
      quantity: s.quantity,
      decay: round(s.decay ?? 0),
      control: r.control,
      energy,
    },
    o.id,
  );
  return { complete: true, writes: [o.id, s.id] };
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    o = rackOf(c, false);
  if (c.actor.vitals.energy + 1e-9 < COST.look)
    throw nothing('Inspection needs 0.5 energy.');
  v7Spend(c.actor, COST.look);
  const st = rackState(w, o),
    r = st.lot,
    s = r ? w.stacks.find((x) => x.id === r.lot) : undefined,
    list = rackPieces(o),
    climate = forestClimate(w, o.spatial),
    vent = rackVentilation(w, o);
  const value = {
    rack: o.id,
    owner: text(o.data.owner),
    status: statusOf(o),
    pieces: list.map((p) => ({
      slot: p.slot,
      role: p.role,
      resource: p.resource,
      condition: round(p.condition),
      sound: p.condition >= G.sound,
    })),
    missing: SLOTS.filter((x) => !list.some((p) => p.slot === x.slot)).map(
      (x) => x.slot,
    ),
    integrity: o.data.integrity ?? 0,
    footprint: o.data.footprint ?? null,
    deckHeight: o.data.height ?? 0,
    capacity: o.data.capacity ?? 0,
    ratingKg: o.data.rating ?? 0,
    food:
      s && r
        ? {
            item: s.id,
            resource: s.resource,
            quantity: s.quantity,
            surface: r.wetted ? 'wet from rain' : 'no visible wetness',
          }
        : null,
    rain: climate.indoor ? 0 : (climate.rain ?? 0),
    wind: vent.wind,
    standingWater: rackStandingWater(w, o),
    ventilationBlockedBy: vent.blocked,
    storageChecks:
      r && r.checkedAt >= 0
        ? {
            at: r.checkedAt,
            favourable: r.favourable,
            failed: r.failed,
            rate: r.favourable ? COEFFICIENT : 1,
          }
        : null,
  };
  openRemember(c, {
    key: `${o.id}:rack-condition`,
    subject: o.id,
    property: 'rack pieces, food on the deck and storage conditions',
    value: v7Json(value),
    method: 'direct inspection',
    condition: 'Observable condition only; nothing was repaired.',
    verified: false,
  });
  c.emit(
    'food-rack-inspected',
    `Rack ${statusOf(o)}, ${String(list.length)} of 5 pieces, integrity ${String(Number(o.data.integrity ?? 0))}; ${value.storageChecks ? (value.storageChecks.favourable ? 'the coded storage checks passed this round' : `storage checks failed: ${r?.failed.join(', ') ?? ''}`) : 'no food stored'}.`,
    { ...value, energy: COST.look },
    o.id,
  );
  return { complete: true, writes: [o.id] };
}

function compare(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    o = rackOf(c, true),
    st = rackState(w, o),
    r = st.lot ?? st.ended.at(-1);
  if (!r) throw nothing('No food has been stored on this rack.');
  if (!r.control)
    throw nothing('That lot has no tracked control; nothing can be compared.');
  if (r.pairRounds < PAIRED)
    throw nothing(
      `A comparison needs at least ${String(PAIRED)} paired rounds; ${String(r.pairRounds)} so far.`,
    );
  if (c.actor.vitals.energy + 1e-9 < COST.look)
    throw nothing('A comparison needs 0.5 energy.');
  v7Spend(c.actor, COST.look);
  const life =
      w.resources.find((x) => x.id === r.resource)?.properties?.decay ?? 0,
    difference = round(r.controlGain - r.lotGain),
    shown = difference > r.allowance + 1e-6;
  const comparison = {
    tick: w.tick,
    rack: o.id,
    lot: r.lot,
    control: r.control,
    resource: r.resource,
    quantity: r.quantity,
    controlQuantity: r.controlQuantity,
    loadedAt: r.loadedAt,
    storage: r.status,
    pairedRounds: r.pairRounds,
    lotDecayGained: round(r.lotGain),
    controlDecayGained: round(r.controlGain),
    lotPerRound: round(r.lotGain / r.pairRounds),
    controlPerRound: round(r.controlGain / r.pairRounds),
    lotShareOfLifetime: life ? round(r.lotGain / life) : null,
    controlShareOfLifetime: life ? round(r.controlGain / life) : null,
    ratio: r.controlGain > 0 ? round(r.lotGain / r.controlGain) : null,
    difference,
    exposure: {
      favourableRounds: r.favourableRounds,
      rainRounds: r.rainRounds,
      wetterRounds: r.wetRounds,
      unequalTemperatureRounds: r.unequalRounds,
      meanTemperatureDifference: round(r.temperatureDifference / r.pairRounds),
      maxTemperatureDifference: round(r.maxTemperatureDifference),
      controlTracked: r.controlPresent,
      handling:
        'the lot lay on the rack deck; the control was carried; places differ',
    },
    allowance: round(r.allowance),
    verdict: shown ? 'slower decay shown' : 'no demonstrated benefit',
    limits:
      'decay readings are world values for one lot and one control; unequal temperature is allowed for; water, microbes and safety are not measured; the storage rate is a declared model coefficient, not a measurement',
  };
  r.comparison = comparison;
  refresh(w, o);
  openRemember(c, {
    key: `${r.lot}:rack-comparison`,
    subject: r.resource,
    property: 'stored lot against its carried control',
    value: v7Json(comparison),
    method: 'paired decay comparison from the same start',
    condition: 'one lot, one control; preservation and safety unverified',
    verified: false,
  });
  c.emit(
    'food-rack-compared',
    shown
      ? `Over ${String(r.pairRounds)} paired rounds the stored lot gained ${String(comparison.lotDecayGained)} decay and the control ${String(comparison.controlDecayGained)}; the difference ${String(difference)} exceeds the ${String(comparison.allowance)} that unequal temperatures explain: slower decay shown for this lot.`
      : `Over ${String(r.pairRounds)} paired rounds the stored lot gained ${String(comparison.lotDecayGained)} decay and the control ${String(comparison.controlDecayGained)}; the difference ${String(difference)} does not exceed the ${String(comparison.allowance)} that unequal temperatures explain: no demonstrated benefit.`,
    { ...comparison, energy: COST.look, view: o.data.view ?? null },
    o.id,
  );
  return { complete: true, writes: [o.id] };
}

function maintain(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    o = rackOf(c, true);
  idle(c, o);
  const st = rackState(w, o);
  if (st.lot) throw nothing('Unload the food first.');
  if (!['complete', 'unstable', 'damaged', 'collapsed'].includes(statusOf(o)))
    throw nothing('Only an assembled rack can be maintained.');
  const raw: unknown = c.action.args.replace ?? [];
  if (
    !Array.isArray(raw) ||
    !raw.length ||
    raw.some((x) => typeof x !== 'string')
  )
    throw nothing('replace must list the installed piece ids to replace.');
  const ids = [...new Set(raw as string[])],
    list = rackPieces(o);
  if (
    ids.length !== raw.length ||
    ids.some((id) => !list.some((p) => p.id === id))
  )
    throw nothing('Name distinct installed pieces of this rack.');
  const fresh = allocate(c, ids.length);
  if (a.vitals.energy + 1e-9 < COST.maintain)
    throw nothing('Maintenance needs 1 energy.');
  v7Spend(a, COST.maintain);
  const targets = ids.map((id) => list.find((p) => p.id === id) as RackPiece),
    widest = Math.max(
      ...list.filter((p) => p.role === 'support').map((p) => p.diameter),
    ),
    problems = fresh.flatMap((u, i) => {
      const why = pieceProblem(w, u.stack, targets[i]?.role ?? '', widest);
      return why ? [`${targets[i]?.slot ?? ''}: ${why}`] : [];
    });
  if (problems.length) {
    c.emit(
      'food-rack-materials-inspected',
      `Maintenance stopped at the inspection: ${problems.join('; ')}. Nothing was replaced.`,
      { rack: o.id, suitable: false, problems, energy: COST.maintain },
      o.id,
    );
    return { complete: true, writes: [o.id] };
  }
  const removed = targets.map((p) => ({
      slot: p.slot,
      condition: round(p.condition),
      item: release(w, o, p),
    })),
    installed = fresh.map((u, i) =>
      install(w, o, split(w, u.stack, 1), targets[i]?.slot ?? '', a.id),
    );
  w.stacks = w.stacks.filter((s) => s.quantity > 0);
  const v = check(w, o, a.id);
  c.emit(
    'food-rack-maintained',
    `${String(installed.length)} piece(s) replaced; the old pieces lie at the rack with their worn condition. The check ${v.passed ? 'passed: the rack is complete' : 'failed: the rack is unstable'}. Food freshness is not restored.`,
    {
      rack: o.id,
      removed,
      installed: v7Json(installed),
      tests: v7Json(v.tests),
      status: statusOf(o),
      energy: COST.maintain,
    },
    o.id,
  );
  return { complete: true, writes: [o.id] };
}

function dismantle(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    o = rackOf(c, true);
  idle(c, o);
  if (rackState(w, o).lot) throw nothing('Unload the food first.');
  if (!rackPieces(o).length) throw nothing('Nothing is laid to take apart.');
  if (c.actor.vitals.energy + 1e-9 < COST.dismantle)
    throw nothing('Dismantling needs 1 energy.');
  v7Spend(c.actor, COST.dismantle);
  const returned = [...rackPieces(o)].map((p) => ({
    slot: p.slot,
    condition: round(p.condition),
    item: release(w, o, p),
  }));
  remove(w, o);
  c.emit(
    'food-rack-dismantled',
    `The rack was taken apart; its ${String(returned.length)} pieces lie at the site with their condition. Nothing is refunded.`,
    { rack: o.id, returned, energy: COST.dismantle },
    null,
  );
  return { complete: true, writes: returned.map((r) => r.item) };
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c) as Prep | undefined;
  if (!j || !open(j)) throw nothing('No unfinished rack work of yours.');
  const o = c.world.objects.find((o) => o.id === j.target);
  const returned = j.escrow.filter((id) =>
    c.world.stacks.some((s) => s.id === id && s.reservedFor === j.id),
  );
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  workStop(
    c.world,
    c.actor,
    j,
    'Cancelled; unlaid reserved pieces returned once. Spent energy and time are not refunded.',
    false,
  );
  settle(c.world, o);
  c.emit(
    'food-rack-cancelled',
    'Rack work cancelled; unlaid pieces are back in your carried items, laid pieces stay as an incomplete rack that holds no food.',
    { ...summary(c.world, j), returned },
    j.target,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...returned] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = text(c.action.args.mode),
    own = workFind(c) as Prep | undefined;
  if (own && open(own) && mode === 'prepare') {
    if (c.operation?.first === false) return advance(c, own, false);
    if (text(c.action.args.rack) === own.target) return advance(c, own, true);
  }
  if (mode === 'prepare') return prepare(c);
  if (mode === 'load') return load(c);
  if (mode === 'unload') return unload(c);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'compare') return compare(c);
  if (mode === 'maintain') return maintain(c);
  if (mode === 'dismantle') return dismantle(c);
  if (mode === 'cancel') return cancel(c);
  throw nothing('Unknown rack mode.');
}

/** Rain water on food on the open deck evaporates at the representation's own limit; the food's
 * own water never goes below its loading composition (whole food does not dry). Returns whether
 * the food is at its loading water content after this round. */
function surfaceDrying(w: V7World, o: V7Object, s: V7Stack, r: RackLot) {
  const p = s.physical,
    d = preservationPhysics(s);
  if (!p || !d || !(s.quantity > 0)) return false;
  const surplus = (p.unitWater - r.water0) * s.quantity;
  if (surplus <= 1e-12) return true;
  const climate = forestClimate(w, o.spatial);
  if (climate.indoor) return false;
  const limit =
    SURFACE_DRYING *
    DECK_AREA *
    Math.max(0, Math.min(2, (climate.temperature - 5) / 20));
  const evaporated = Math.min(surplus, limit);
  p.unitWater =
    surplus <= limit
      ? r.water0
      : round((p.unitWater * s.quantity - evaporated) / s.quantity);
  p.unitMass = round(p.unitWater + p.unitSolids);
  d.evaporated += evaporated;
  r.dried = round(r.dried + evaporated);
  return surplus <= limit;
}

/** Per-round tracking of the stored lot and its control after the ordinary decay update. */
function track(w: V7World, o: V7Object, st: RackState, r: RackLot) {
  const s = w.stacks.find((x) => x.id === r.lot);
  if (!s || !rackLying(o, s)) {
    const spoiled = w.events.some(
      (e) => e.type === 'spoiled' && e.target === r.lot,
    );
    if (s && foodWaterRead(s)?.surface) foodWaterWithdraw(w, s);
    endLot(w, st, r, spoiled ? 'spoiled' : 'removed');
    forestEvent(
      w,
      spoiled ? 'food-rack-food-spoiled' : 'food-rack-food-removed',
      spoiled
        ? 'The stored food spoiled under the ordinary ageing and is gone.'
        : `The stored food was taken off the rack${s?.owner ? ` by ${s.owner}` : ''}; it now follows its new conditions.`,
      o.spatial,
      null,
      { rack: o.id, item: r.lot, takenBy: s?.owner ?? null },
      o.id,
    );
    return;
  }
  if (s.quantity < r.quantity - 1e-9) {
    const taken = round(r.quantity - s.quantity);
    r.quantity = s.quantity;
    forestEvent(
      w,
      'food-rack-food-removed',
      `${String(taken)} of the stored units was taken off the rack; ${String(s.quantity)} remain on the deck.`,
      o.spatial,
      null,
      { rack: o.id, item: s.id, taken, remaining: s.quantity },
      o.id,
    );
  }
  const control = r.control
    ? w.stacks.find((x) => x.id === r.control && x.quantity > 0)
    : undefined;
  if (r.control && !control && r.controlPresent) {
    r.controlPresent = false;
    forestEvent(
      w,
      'food-rack-control-lost',
      "The tracked control is gone; the storage checks now compare with the lot's own loading state and the comparison keeps its paired readings.",
      o.spatial,
      null,
      { rack: o.id, control: r.control },
      o.id,
    );
  }
  const lotIncrement = (s.decay ?? 0) - r.lotDecay;
  if (control && r.controlPresent && r.checkedAt === w.tick) {
    const controlIncrement = (control.decay ?? 0) - (r.controlDecay ?? 0),
      gap =
        r.temperature !== null && r.controlTemperature !== null
          ? r.temperature - r.controlTemperature
          : 0;
    r.pairRounds += 1;
    r.lotGain = round(r.lotGain + lotIncrement);
    r.controlGain = round(r.controlGain + controlIncrement);
    r.allowance = round(r.allowance + Math.abs(r.ordinary - controlIncrement));
    if (r.favourable) r.favourableRounds += 1;
    if (r.rain > 0) r.rainRounds += 1;
    if (r.wetter) r.wetRounds += 1;
    if (Math.abs(gap) > 1e-9) r.unequalRounds += 1;
    r.temperatureDifference = round(r.temperatureDifference + gap);
    r.maxTemperatureDifference = Math.max(
      r.maxTemperatureDifference,
      round(Math.abs(gap)),
    );
  }
  r.lotDecay = s.decay ?? 0;
  if (control) r.controlDecay = control.decay ?? 0;
  const last = foodWaterRead(s)?.last;
  if (last?.tick === w.tick && Number(last.received) > 0) {
    if (!r.wetted) {
      r.wetted = true;
      forestEvent(
        w,
        'food-rack-wetted',
        'Rain is falling on the food on the open deck and wetting it; the storage rate does not apply while it rains or while the food is wetter than its control.',
        o.spatial,
        null,
        { rack: o.id, item: s.id, received: Number(last.received) },
        o.id,
      );
    }
  } else if (surfaceDrying(w, o, s, r) && r.wetted) {
    r.wetted = false;
    forestEvent(
      w,
      'food-rack-dried',
      'The rain water on the food on the open deck has evaporated; the food is back to its loading water content.',
      o.spatial,
      null,
      { rack: o.id, item: s.id, evaporated: r.dried },
      o.id,
    );
  }
  if (r.checkedAt === w.tick && r.announced !== r.favourable) {
    r.announced = r.favourable;
    forestEvent(
      w,
      'food-rack-conditions',
      r.favourable
        ? 'Every coded storage check passes: the declared storage rate applies to the stored roots this round. It is a model coefficient, not a shown result.'
        : `The storage rate does not apply: ${r.failed.join(', ')}.`,
      o.spatial,
      null,
      {
        rack: o.id,
        item: s.id,
        favourable: r.favourable,
        failed: r.failed,
        rate: r.favourable ? COEFFICIENT : 1,
      },
      o.id,
    );
  }
}

/** Weather wear of installed pieces under the reused ex11/ex15 lean-to wear law. */
function wear(w: V7World, o: V7Object, st: RackState) {
  const list = rackPieces(o),
    climate = forestClimate(w, o.spatial),
    rain = climate.indoor ? 0 : (climate.rain ?? 0),
    wind = climate.wind ?? 0,
    amount = WEAR.base + WEAR.rain * rain + WEAR.wind * wind,
    weakest = Math.min(...list.map((p) => p.condition));
  for (const p of list) p.condition = round(Math.max(0, p.condition - amount));
  const lowest = Math.min(...list.map((p) => p.condition)),
    status = statusOf(o),
    loose = (role: string) =>
      list.some((p) => p.role === role && p.condition < G.sound);
  o.data.weather = { tick: w.tick, rain, wind, wear: round(amount) };
  if (['complete', 'damaged'].includes(status) && loose('support')) {
    o.data.status = 'collapsed';
    const r = st.lot,
      s = r ? w.stacks.find((x) => x.id === r.lot) : undefined;
    if (r && s && rackLying(o, s)) foodWaterWithdraw(w, s);
    if (r) endLot(w, st, r, 'fallen');
    forestEvent(
      w,
      'food-rack-collapsed',
      `A support loosened (condition below ${String(G.sound)}); the deck sank onto the soil${r ? ' and the stored food now lies on the ground under ordinary conditions' : ''}.`,
      o.spatial,
      null,
      { rack: o.id, integrity: round(lowest), fallen: r?.lot ?? null },
      o.id,
    );
  } else if (status === 'complete' && loose('crosspiece')) {
    o.data.status = 'damaged';
    forestEvent(
      w,
      'food-rack-damaged',
      'A crosspiece loosened; the rack is damaged and the storage rate does not apply until it is maintained.',
      o.spatial,
      null,
      { rack: o.id, integrity: round(lowest) },
      o.id,
    );
  } else if (Math.floor(weakest * 10 - 1e-9) !== Math.floor(lowest * 10 - 1e-9))
    forestEvent(
      w,
      'food-rack-deteriorated',
      `Weather wear reduced the weakest rack piece to condition ${lowest.toFixed(2)}.`,
      o.spatial,
      null,
      { rack: o.id, integrity: round(lowest), wear: round(amount) },
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
        'Not worked this round; completed rounds and reserved pieces are kept.';
      const o = w.objects.find((o) => o.id === j.target);
      if (o) o.data.status = 'paused';
      forestEvent(
        w,
        'food-rack-paused',
        'Rack work paused because it was not worked this round; nothing was charged.',
        a.position,
        a.id,
        summary(w, j),
        j.target,
      );
    }
    sync(a, j);
  }
  for (const o of racks(w)) {
    const st = rackState(w, o);
    if (rackPieces(o).length) wear(w, o, st);
    if (st.lot?.status === 'stored') track(w, o, st, st.lot);
    refresh(w, o);
  }
}

/** ex24: Wren's ventilated food storage on a raised branch rack. */
export const LONG_EX24_VENTILATED_STORAGE: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex24',
  dependencies: ['foundation-open@1'],
  description:
    'A small open raised lattice of two supports and three crosspieces of whole wood units, with a paid material and site inspection, three paid assembly rounds, a coded stability and load check, loading of one lot of separated whole food beside an optional tracked carried control, the declared 0.8 storage coefficient on the ordinary decay increment of compatible intact roots only while every coded condition passes, a paired comparison, wear, maintenance and dismantling.',
  reuse: {
    experiment:
      'ex16 branch-screen@1 (paid staged assembly of whole branch units into one real object, installed-piece records, pause, resume, cancel, death, wear and release of removed pieces; its drawing is a vertical screen and does not render a rack); ex21 small-combustion-source@1 (smallFireRod rod geometry, rigidity limit); ex19 lever-mass-comparator@1 (material-geometry@1 wood modulus and strength, visible bending limit); ex19 food-air-exposure-trial@1 (whole untreated food check, carried control); ex21 air-dry-food-trial@1 (food on a support, 0.04 per-unit footprint); ex11/ex15 lean-to wear law and sound condition',
    source:
      'forest-environment.ts (ordinary decay update, hooked behind this revision through long-ex24-ventilated-storage-physics.ts); food-water.ts (foodWaterExpose, foodWaterInitialize, foodWaterRead, foodWaterSurfaceArea, foodWaterWithdraw; rain exchange in open-preservation-physics.ts); long-ex19-food-air-exposure.ts (airExposureUnsupported); long-ex19-material-contact.ts (ex19MaterialContact, ex19MaterialGround); long-ex21-small-combustion-physics.ts (smallFireRod, SMALL_FIRE.rigid); long-ex21-air-dry-food.ts (AIR_DRY_FOOTPRINT); long-simple-shelter.ts (wear law); long-branch-screen-exposure.ts (sound condition); collective-work.ts; material-lots.ts; open-foundation.ts (openRemember)',
    description:
      'Implementation reuse only; every existing package is unchanged and no ability, structure or mastery is inherited. New: the rack geometry and load rating, its inspection, assembly, check, storage record, condition checks and decay hook, rain-water drying on the open deck, the paired comparison, maintenance and the rack drawing.',
  },
  abilities: [
    {
      id: ID,
      name: 'Prepare ventilated food storage',
      function:
        'Build a small open raised rack of 2 wood supports and 3 crosspieces that holds separated whole food off the soil; load and unload it, inspect it, compare stored roots with a carried control, maintain or dismantle it.',
      equivalence: 'food:raised-branch-rack-storage:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: [...MODES] },
          rack: { type: 'string' },
          food: { type: 'string' },
          quantity: { type: 'integer', minimum: 1 },
          controlQuantity: { type: 'integer', minimum: 0 },
          materials: {
            type: 'array',
            items: v7ObjectSchema({
              itemId: { type: 'string' },
              quantity: { type: 'number', minimum: 1 },
            }),
          },
          replace: { type: 'array', items: { type: 'string' } },
          x: { type: 'number' },
          y: { type: 'number' },
          orientation: { type: 'number', minimum: 0, maximum: 360 },
        }),
        required: ['mode'],
      },
      references: {
        rack: 'optional-exact-visible',
        food: 'optional-exact-visible',
      },
      prerequisites: [],
      learning: 3,
      costs:
        'Study: 3 rounds. prepare: x, y in reach, orientation; materials: exactly 5 own whole untreated wood units (first 2 supports); optional food and quantity, the proposed load. Round 1 inspects pieces and site, 1 energy; a shortfall is reported and nothing reserved. Then 3 assembly rounds, 1 energy each; prepare naming the rack resumes. load: rack, food (own stack), quantity (at most 4), controlQuantity kept carried as tracked control; 1 round, 0.5 per unit loaded. unload: 0.5 per unit. inspect (anyone) or compare (at least 5 paired rounds): 1 round, 0.5. maintain: replace (piece ids) and as many materials; 1 round, 1. dismantle (empty): 1. cancel: 0. Refusals cost nothing; an unworked round pauses free.',
      effects:
        'A unit is a 0.04 x 0.99 m rod (branch). Supports lie 0.8 m apart on firm ground; crosspieces 0.08 m apart make a 0.8 x 0.2 m deck 0.08 m up, one layer of 4 units, rated twice the weakest crosspiece (37 kg each: wood strength/2, bend 0.02 half-span). Pieces become one rack; none stays loose. Loading splits the stack exactly (decay, harvest, origin kept) and lays the lot on the deck under the food water rules; rain wets it, and rain water dries off at their evaporation limit. The decay increment of whole roots there is x0.8 (declared model coefficient) only while the rack is complete and sound, the lot fits, no other material lies on it, there is no rain or standing water, it is outdoors with wind and 0.25 m clear of solids, and the lot is not wetter or warmer than its control (without one, its loading water); else x1. Compare: decay gained by lot and control, exposure, the share unequal temperature explains, verdict. Wear 0.0005 + 0.002 x (rain + wind) a round; a loose crosspiece stops the rate, a loose support drops the food. No reward, refund or food.',
      handler: HANDLER,
      revision: REVISION,
      authored: false,
      // The completion event carries no qualified flag: building earns no practice milestone.
      practiceEvidence: 'food-rack-completed',
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'prepare: an inspection round, then paid assembly rounds that persist across interruption; other modes take one round.',
      },
    },
  ],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [KIND],
  events: [
    'food-rack-materials-inspected',
    'food-rack-started',
    'food-rack-progress',
    'food-rack-paused',
    'food-rack-resumed',
    'food-rack-cancelled',
    'food-rack-failed',
    'food-rack-completed',
    'food-rack-check-failed',
    'food-rack-loaded',
    'food-rack-unloaded',
    'food-rack-inspected',
    'food-rack-compared',
    'food-rack-conditions',
    'food-rack-wetted',
    'food-rack-dried',
    'food-rack-food-removed',
    'food-rack-food-spoiled',
    'food-rack-control-lost',
    'food-rack-deteriorated',
    'food-rack-damaged',
    'food-rack-collapsed',
    'food-rack-maintained',
    'food-rack-dismantled',
    // Emitted by the food water exchange for exposed food (CULTURE_SCENARIO section G).
    'preservation-progress',
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
        'Performer died; unlaid pieces were left where the person died.',
        true,
      );
      settle(w, o);
      forestEvent(
        w,
        'food-rack-failed',
        'Rack work stopped by death; laid pieces stay at the site and nothing is refunded.',
        a.position,
        a.id,
        summary(w, j),
        j.target,
      );
      sync(a, j);
    }
    // A stored lot stays on its rack; the carried control becomes an ordinary stack where the
    // person died and stays tracked.
    for (const o of racks(w)) {
      const c = w.stacks.find(
        (s) => s.owner === a.id && s.reservedFor === controlReservation(o.id),
      );
      if (c) delete c.reservedFor;
    }
  },
};
