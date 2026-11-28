import type {
  V7Ability,
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
import { v7Id, v7Json, v7RoundNumber, v7Signature } from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7ShapeDistance,
  v7ShapesOverlap,
  v7Visible,
} from './continuous-geometry.js';
import { forestEvent } from './forest-climate.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { materialPortion } from './material-lots.js';
import { geometryTransfer } from './open-material-geometry.js';
import { openConditions } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import {
  ex19MaterialGround,
  ex19MaterialPiece,
  ex19MaterialWhole,
} from './long-ex19-material-contact.js';
import {
  SMALL_FIRE,
  smallFireComposition,
  smallFireRod,
} from './long-ex21-small-combustion-physics.js';
import {
  FRICTION_HEAT,
  frictionEmber,
  frictionEmberWindow,
  frictionPower,
  frictionStroke,
  frictionThermal,
  frictionWeather,
  frictionWindow,
} from './long-ex25-friction-heat-physics.js';
import type {
  FrictionEmber,
  FrictionPiece,
  FrictionResult,
  FrictionThermal,
} from './long-ex25-friction-heat-physics.js';

/** ex25: Wren's friction-heating trial. A person rubs the end of one owned rigid wood piece along
 * another braced on clear firm ground beside them, paying for each worked round. The contact model
 * (long-ex25-friction-heat-physics.ts) heats, wears, wets and cools the pieces from the actual
 * effort, materials and weather; warmth, dust and failure are ordinary outcomes. Only dust of 2 g
 * or more reaching 350 C forms one ember, a located source that smoulders, cools and goes out
 * every round on its own, after cancellation or death too. Nothing else is lit or heated. */

const ID = 'friction-heating-trial';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
/** The open work (shown with the person's active work) and the latest closed records. */
const OPEN = `${ID}:work:open`;
const RECORDS = `${ID}:records`;
const KEEP = 3;
/** World state: the full record of each work, every work still cooling, the latest inspection. */
const STATE = `${ID}:state:`;
const WORKS = `${ID}:works`;
const LOOKED = `${ID}:inspection:`;
const KIND = 'friction-ember';
const COMPONENT = 'friction-heat-trial';
/** The wear record on a worked piece. */
const MARK = 'frictionHeating';
const MODES = ['inspect', 'trial', 'inspect-progress', 'resume', 'cancel'];
/** World Agent specification costs. */
const COST = {
  study: 0.2,
  inspect: 0.2,
  rub: FRICTION_HEAT.rubEnergy,
  check: 0.2,
};
const BOUT = { initial: 3, max: 10 };
/** An inspection of the same unchanged pieces stays attached for this many rounds. */
const INSPECTED = 10;
/** Wood whose whole units carry the declared rod of small-combustion-source@1. */
const RODS = ['branch', 'birch', 'oak', 'willow'];
const GEOMETRY = 'small-combustion-source@1';
const OWN_FORM = [
  'mantle',
  'frictionKit',
  'waterCup',
  'componentLots',
  'materialLayer',
] as const;
/** The base is braced across in front of the person, its middle this far beyond the body. */
const GAP = 0.3;
/** Effort is unsafe below this health, at zero satiety, or outside the body temperatures where
 * forest physiology deals thermal damage. */
const SAFE = { health: 20, cold: 7, hot: 34 };
const ORIENTATION =
  'the end of the rubbing piece drawn back and forth along the top of the base piece, which lies across in front of you';
const EVENTS = {
  inspected: 'friction-heat-inspected',
  started: 'friction-heat-started',
  rubbed: 'friction-heat-rubbed',
  paused: 'friction-heat-paused',
  finished: 'friction-heat-bout-finished',
  ended: 'friction-heat-ended',
  cancelled: 'friction-heat-cancelled',
  checked: 'friction-heat-checked',
  ember: 'friction-heat-ember-formed',
  out: 'friction-heat-ember-out',
  burn: 'friction-heat-ember-burn',
} as const;

interface Shape {
  known: boolean;
  length: number | null;
  diameter: number | null;
  missing: string[];
}
interface Site extends V7Data {
  x: number;
  y: number;
  angle: number;
}
interface Piece extends V7Data {
  role: string;
  named: string;
  item: string;
  resource: string;
  origin: string;
  harvestedAt: number | null;
  length: number;
  diameter: number;
}
interface Bout extends V7Data {
  number: number;
  requested: number;
  done: number;
  startedAt: number;
}
/** Exact mass (kg) and heat (J) ledger of one work. */
interface Ledger extends V7Data {
  input: number;
  work: number;
  spotHeat: number;
  zoneHeat: number;
  convection: number;
  radiation: number;
  zoneLoss: number;
  evaporation: number;
  stored: number;
  emberHeat: number;
  wornRubbing: number;
  wornBase: number;
  dustRubbing: number;
  dustBase: number;
  wornWater: number;
  drawn: number;
  vapour: number;
  emberDust: number;
  residueDust: number;
  residueWater: number;
}
/** Dust (g) and contact water (kg) left where the base lay when a work ends. */
interface Residue extends V7Data {
  dust: number;
  water: number;
  at: V7Data;
  tick: number;
}
interface Work extends V7Data {
  id: string;
  actor: string;
  status: string;
  stage: string;
  display: string;
  pieces: Piece[];
  facts: V7Data[];
  physical: string[];
  site: Site | null;
  at: V7Data | null;
  contact: V7Data;
  inspection: V7Data;
  bout: Bout;
  rounds: V7Data[];
  results: V7Data[];
  paidEnergy: number;
  paidRounds: number;
  rubRounds: number;
  rubSeconds: number;
  thermal: FrictionThermal;
  /** The pieces' water shares at the last worked round, for the zones' heat capacity. */
  shares: number[];
  ledger: Ledger;
  observations: string[];
  ember: string | null;
  residue: Residue | null;
  reason: string | null;
  startedAt: number;
  lastWorked: number;
  endedAt: number | null;
}
type Say = (type: string, description: string, data: V7Data) => void;

const round = (x: number) => v7RoundNumber(x);
const shown = (x: number) => String(Math.round(x * 1000) / 1000);
const grams = (kg: number) => Math.round(kg * 10000) / 10;
const nothing = (why: string) => new Error(`${why} Nothing was spent.`);
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const resource = (w: V7World, id: string) =>
  w.resources.find((r) => r.id === id);
const internal = (w: V7World, id: unknown): Work | null =>
  typeof id === 'string' ? (record(w.state[STATE + id]) as Work | null) : null;
const openWork = (w: V7World, a: V7Actor): Work | null =>
  internal(w, record(a.extensionState[OPEN])?.id);
const records = (a: V7Actor): V7Data[] => {
  const list = a.extensionState[RECORDS];
  return Array.isArray(list) ? (list as V7Data[]) : [];
};
const isEmber = (o: V7Object) =>
  o.kind === KIND && o.revision === REVISION && !!record(o.data.ember);
const emberOf = (o: V7Object) => o.data.ember as FrictionEmber;
const body = (a: V7Actor): V7Spatial => ({
  ...a.position,
  angle: 0,
  shape: { kind: 'circle', radius: a.radius },
  solid: true,
  interaction: 0,
  entrances: [],
});
const reading = (t: number) => Math.round(t / 10) * 10;
const ids = (c: V7ActionContext): string[] => {
  const v = c.action.args.targetIds;
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : [];
};

/** Item facts that only other causes change: identity, place, ownership, reservation, ageing,
 * the represented composition and this operation's own wear record are left out. */
function factsOf(s: V7Stack, own: boolean): V7Data {
  const out: V7Data = {};
  for (const [k, v] of Object.entries(s) as [string, unknown][]) {
    if (
      v === undefined ||
      [
        'id',
        'position',
        'owner',
        'reservedFor',
        'decay',
        'quantityTenths',
      ].includes(k) ||
      (!own && k === 'physical')
    )
      continue;
    if (k === 'processing' && !own) {
      const rest = Object.fromEntries(
        Object.entries(s.processing ?? {}).filter(([key]) => key !== MARK),
      );
      if (Object.keys(rest).length) out[k] = v7Json(rest);
      continue;
    }
    out[k] = v7Json(v);
  }
  return out;
}
/** The represented composition as the step stores it (canonical 8-decimal numbers). */
const physicalOf = (s: V7Stack) =>
  v7Signature(
    s.physical
      ? {
          unitMass: round(s.physical.unitMass),
          unitWater: round(s.physical.unitWater),
          unitSolids: round(s.physical.unitSolids),
        }
      : null,
  );
const wearOf = (s: V7Stack) => record(s.processing?.[MARK]);
const depthOf = (s: V7Stack) => Number(wearOf(s)?.depth ?? 0);

/** The represented rod of one unit, or what is missing for it. */
function shapeOf(w: V7World, s: V7Stack): Shape {
  const flex = resource(w, s.resource)?.properties?.flexibility;
  const missing: string[] = [];
  if (!RODS.includes(s.resource))
    missing.push(
      `no rod shape is represented for ${s.resource}; only branch, birch and oak units have the declared rod of ${GEOMETRY}`,
    );
  else if (flex === undefined || flex > SMALL_FIRE.rigid)
    missing.push(`${s.resource} bends, and a rubbing contact needs rigid wood`);
  if (
    OWN_FORM.some((k) => s[k] !== undefined) ||
    Object.keys(s.processing ?? {}).some((k) => k !== MARK)
  )
    missing.push(
      'the unit is worked, combined or equipment, and its changed shape is not represented',
    );
  if (foodTenths(s.quantity) < 10)
    missing.push('it is less than one whole unit');
  if (missing.length)
    return { known: false, length: null, diameter: null, missing };
  const rod = smallFireRod(w, s);
  return {
    known: true,
    length: rod.length,
    diameter: rod.diameter,
    missing: [],
  };
}
/** Why a represented rod cannot take a role, or null: ex21's handling and base limits, and a
 * base track worn half through. */
function roleProblem(s: V7Stack, shape: Shape, role: string): string | null {
  const { length, diameter } = shape;
  if (length === null || diameter === null)
    return 'its shape is not represented';
  if (length < SMALL_FIRE.lengthMin - 1e-9)
    return `it is ${shown(length)} m long, and holding it needs ${String(SMALL_FIRE.lengthMin)} m`;
  if (
    role === 'rubbing' &&
    (diameter < SMALL_FIRE.gripMin - 1e-9 ||
      diameter > SMALL_FIRE.gripMax + 1e-9)
  )
    return `it is ${shown(diameter)} m thick, and a two-handed grip needs ${String(SMALL_FIRE.gripMin)}-${String(SMALL_FIRE.gripMax)} m`;
  if (role === 'base' && diameter < SMALL_FIRE.baseMin - 1e-9)
    return `it is ${shown(diameter)} m thick, and a base for a track needs ${String(SMALL_FIRE.baseMin)} m or more`;
  if (
    role === 'base' &&
    depthOf(s) >= FRICTION_HEAT.wornThrough * diameter * 1000 - 1e-9
  )
    return 'its track is worn half through, so it no longer supports a contact';
  return null;
}
/** Why a named id is not one of the person's own plain pieces, or null. */
function ownership(w: V7World, a: V7Actor, id: string): string | null {
  const s = w.stacks.find((x) => x.id === id);
  if (!s)
    return w.objects.some((o) => o.id === id)
      ? `${id} is an object in the world, not an item you hold`
      : `${id} is not an item you hold`;
  if (s.owner === null)
    return `${id} is a ground item, not yours; pick it up first`;
  if (s.owner !== a.id)
    return `${id} belongs to someone else; the trial uses only your own possessions`;
  return null;
}

/** The base footprint across in front of the person and its clearance. */
function footprint(site: Site, length: number, diameter: number): V7Spatial {
  return {
    x: site.x,
    y: site.y,
    angle: site.angle,
    shape: { kind: 'rectangle', width: length, height: diameter },
    solid: true,
    interaction: 0,
    entrances: [],
  };
}
function siteProblems(
  w: V7World,
  a: V7Actor,
  site: Site,
  length: number,
  diameter: number,
): string[] {
  const out: string[] = [];
  const ends = [-0.5, 0, 0.5].map((t) => ({
    x: site.x + t * length * Math.cos(site.angle),
    y: site.y + t * length * Math.sin(site.angle),
  }));
  if (ends.some((p) => !v7Inside(w, p, diameter / 2)))
    out.push('the base would leave the world');
  if (v7Distance(a.position, site) > a.radius + w.config.interaction + 1e-9)
    out.push('the contact point is beyond your reach');
  if (ends.some((p) => !v7Visible(w, a.position, p)))
    out.push('part of that ground is out of your sight');
  if (
    ends.some(
      (p) =>
        ex19MaterialGround(w, p) ||
        openConditions(w, p).regime === 'saturated soil',
    )
  )
    out.push(
      'the ground there is water, a wet bank, waterlogged or saturated, not firm ground',
    );
  const foot = footprint(site, length, diameter);
  const blockers = [
    ...w.actors
      .filter((x) => x.vitals.health > 0 && v7ShapesOverlap(foot, body(x)))
      .map((x) => (x.id === a.id ? 'your own body' : x.id)),
    ...w.objects
      .filter((o) => v7ShapesOverlap(foot, { ...o.spatial, solid: true }))
      .map((o) => o.id),
    ...w.stacks
      .filter(
        (s) => s.owner === null && v7ShapeDistance(s.position, foot) <= 1e-9,
      )
      .map((s) => s.id),
  ];
  if (blockers.length)
    out.push(`the base footprint is not clear: ${blockers.join(', ')}`);
  return out;
}
/** The first of eight directions, from east counterclockwise, with clear firm ground. */
function siteFor(
  w: V7World,
  a: V7Actor,
  length: number,
  diameter: number,
): { site: Site | null; problems: string[] } {
  let first: string[] = [];
  for (let k = 0; k < 8; k++) {
    const dir = (k * Math.PI) / 4,
      d = a.radius + GAP;
    const site: Site = {
      x: round(a.position.x + d * Math.cos(dir)),
      y: round(a.position.y + d * Math.sin(dir)),
      angle: round((dir + Math.PI / 2) % (2 * Math.PI)),
    };
    const problems = siteProblems(w, a, site, length, diameter);
    if (!problems.length) return { site, problems: [] };
    if (k === 0) first = problems;
  }
  return {
    site: null,
    problems: [
      `no clear firm ground beside you holds the base in any of eight directions (east: ${first.join('; ')})`,
    ],
  };
}
function unsafe(a: V7Actor): string[] {
  const out: string[] = [];
  if (a.vitals.health < SAFE.health)
    out.push(
      `your health is ${shown(a.vitals.health)}, below ${String(SAFE.health)}, so hard effort is unsafe`,
    );
  if (a.vitals.satiety <= 0)
    out.push('you are starving, so hard effort is unsafe');
  if (a.vitals.temperature < SAFE.cold || a.vitals.temperature > SAFE.hot)
    out.push(
      `your body temperature is outside ${String(SAFE.cold)}-${String(SAFE.hot)} C, where exposure already harms you`,
    );
  return out;
}

/** The contact model of one piece now: its represented water share and water and hardness. */
function model(w: V7World, s: V7Stack): FrictionPiece {
  const c = smallFireComposition(w, s);
  return {
    share: c.unitMass > 0 ? c.unitWater / c.unitMass : 0,
    water: c.unitWater,
    hardness: resource(w, s.resource)?.properties?.hardness ?? 1,
  };
}
function pieceReport(w: V7World, a: V7Actor, id: string, role: string | null) {
  const owner = ownership(w, a, id);
  const s = w.stacks.find((x) => x.id === id);
  if (owner || !s) return { id, usable: false, problem: owner, role };
  const reserved = s.reservedFor
    ? `reserved for ${s.reservedFor === record(a.extensionState[OPEN])?.id ? 'your open friction trial' : 'other unfinished work'}`
    : null;
  const plain = reserved ? null : ex19MaterialPiece(w, a, s);
  const shape = shapeOf(w, s);
  const roleIssue = role && shape.known ? roleProblem(s, shape, role) : null;
  const wear = wearOf(s);
  return {
    id,
    role,
    resource: s.resource,
    quantity: s.quantity,
    wholeUnits: ex19MaterialWhole(s),
    origin: s.origin,
    harvestedAt: s.harvestedAt ?? null,
    condition: {
      decay: s.decay ?? null,
      fromFrictionTrials: wear
        ? { dust: grams(Number(wear.dust ?? 0)), trackDepth: depthOf(s) }
        : null,
      reserved,
    },
    shape: shape.known
      ? {
          kind: 'straight rod',
          length: shape.length,
          diameter: shape.diameter,
          basis: `declared rod of ${GEOMETRY} (900 kg/m3, length 25 diameters); a model, not a measurement`,
        }
      : { kind: null, unknown: shape.missing },
    surfaces: shape.known
      ? 'the rounded side along the whole length and both cut ends'
      : 'unknown',
    species: 'unknown: the tree it came from is not identified',
    moisture:
      'unknown: wetness is not visible by eye and this unit has no drying or weighing record',
    usable: !plain && !reserved && shape.known && !roleIssue,
    problem:
      plain ??
      reserved ??
      (shape.known ? roleIssue : (shape.missing[0] ?? null)),
  };
}
/** The paid inspection report: owned pieces, the contact, the site, weather, light and safety,
 * with every unknown and unmet requirement. Hidden properties are never reported as facts. */
function findings(
  w: V7World,
  a: V7Actor,
  list: string[],
  need: number,
): V7Data {
  const pair = list.length === 2;
  const items = list.map((id, i) =>
    pieceReport(w, a, id, pair ? (i === 0 ? 'rubbing' : 'base') : null),
  );
  const same = pair && list[0] === list[1];
  const base = w.stacks.find((s) => s.id === list[1]);
  const baseShape = base ? shapeOf(w, base) : null;
  const unmet: string[] = [];
  if (!pair)
    unmet.push(
      'a trial needs exactly two pieces, rubbing then base; no other apparatus has represented mechanics',
    );
  for (const x of items) if (x.problem) unmet.push(`${x.id}: ${x.problem}`);
  if (same && base && ex19MaterialWhole(base) < 2)
    unmet.push(`${base.id} holds fewer than two whole units`);
  let site: V7Data | null = null,
    contact: V7Data | null = null;
  if (
    pair &&
    base &&
    baseShape?.known &&
    baseShape.length !== null &&
    baseShape.diameter !== null
  ) {
    const found = siteFor(w, a, baseShape.length, baseShape.diameter);
    site = found.site
      ? { ...found.site, ground: openConditions(w, found.site).ground }
      : null;
    unmet.push(...found.problems);
    const stroke = frictionStroke(baseShape.length);
    contact = {
      orientation: ORIENTATION,
      ...frictionPower(stroke),
      trackDepth: depthOf(base),
      share: round(
        Math.min(
          1,
          FRICTION_HEAT.contactBase +
            depthOf(base) / FRICTION_HEAT.contactDepth,
        ),
      ),
    };
  }
  const safety = unsafe(a);
  unmet.push(...safety);
  if (a.vitals.energy < need - 1e-9)
    unmet.push(
      `energy ${shown(a.vitals.energy)} is below the ${String(need)} the trial needs before its first rubbing round`,
    );
  const wx = frictionWeather(w, a.position);
  return {
    items: v7Json(items),
    contact,
    site,
    weather: {
      air: Math.round(wx.temperature),
      rain: round(wx.rain),
      wind: round(wx.wind),
      roof: wx.indoor,
      light: round(wx.light),
    },
    safety,
    unknown: [
      'the wood species',
      'the water in each piece',
      'whether this pair will glow: only a trial shows it',
    ],
    unmet,
    feasible: unmet.length === 0,
  };
}

function ledger(): Ledger {
  return {
    input: 0,
    work: 0,
    spotHeat: 0,
    zoneHeat: 0,
    convection: 0,
    radiation: 0,
    zoneLoss: 0,
    evaporation: 0,
    stored: 0,
    emberHeat: 0,
    wornRubbing: 0,
    wornBase: 0,
    dustRubbing: 0,
    dustBase: 0,
    wornWater: 0,
    drawn: 0,
    vapour: 0,
    emberDust: 0,
    residueDust: 0,
    residueWater: 0,
  };
}
const elapsed = (j: Work) => j.rubSeconds;
/** Friction-trial view metadata: what is actually happening, never a success mark. */
function view(j: Work): V7Data {
  const last = j.rounds.at(-1);
  return {
    component: COMPONENT,
    work: j.id,
    actor: j.actor,
    materials: j.pieces.map((p) => p.item),
    location: j.site ? { x: j.site.x, y: j.site.y } : null,
    contact: j.site ? { angle: j.site.angle, orientation: ORIENTATION } : null,
    stage: j.stage,
    display: j.display,
    paid: { energy: j.paidEnergy, rounds: j.paidRounds },
    elapsedSeconds: elapsed(j),
    warmth: reading(j.thermal.spot),
    dust: j.thermal.dust > 0 ? grams(j.thermal.dust) : null,
    smoke: j.display === 'rubbing' && last?.smoke === true,
    glow: false,
    flame: false,
    ember: j.ember,
  };
}
function warmth(t: FrictionThermal): V7Data {
  return {
    method: 'touch and sight; an estimate in 10 C steps, not a measurement',
    contact: reading(t.spot),
    rubbingPiece: Math.round(t.rubbing),
    basePiece: Math.round(t.base),
    air: Math.round(t.air),
    peak: reading(t.peak),
  };
}
/** What the person may see of the work: no water share, water or vapour mass. */
function publicWork(j: Work): V7Data {
  return {
    id: j.id,
    operation: ID,
    revision: REVISION,
    geometry: GEOMETRY,
    status: j.status,
    stage: j.stage,
    display: j.display,
    pieces: j.pieces,
    site: j.site,
    contact: j.contact,
    inspection: j.inspection,
    bout: j.bout,
    paidEnergy: j.paidEnergy,
    paidRounds: j.paidRounds,
    rubRounds: j.rubRounds,
    rubSeconds: j.rubSeconds,
    warmth: warmth(j.thermal),
    dust: grams(j.thermal.dust),
    trackDepth: j.thermal.depth,
    observations: j.observations,
    rounds: j.rounds.slice(-3),
    ember: j.ember,
    residue: j.residue
      ? { dust: j.residue.dust, at: j.residue.at, tick: j.residue.tick }
      : null,
    reason: j.reason,
    startedAt: j.startedAt,
    lastWorked: j.lastWorked,
    endedAt: j.endedAt,
  };
}
function summary(j: Work, extra: V7Data = {}): V7Data {
  return {
    operation: ID,
    work: j.id,
    by: j.actor,
    status: j.status,
    stage: j.stage,
    display: j.display,
    pieces: j.pieces.map((p) => p.item),
    site: j.site,
    bout: j.bout,
    paidEnergy: j.paidEnergy,
    paidRounds: j.paidRounds,
    warmth: warmth(j.thermal),
    dust: grams(j.thermal.dust),
    trackDepth: j.thermal.depth,
    ember: j.ember,
    reason: j.reason,
    view: view(j),
    ...extra,
  };
}
function save(w: V7World, a: V7Actor | null, j: Work) {
  w.state[STATE + j.id] = v7Json(j);
  if (a && ['active', 'paused'].includes(j.status))
    a.extensionState[OPEN] = publicWork(j);
}
/** Releases the reserved units, once; they stay carried. */
function release(w: V7World, j: Work): boolean {
  let released = false;
  for (const p of j.pieces) {
    const s = w.stacks.find((x) => x.id === p.item && x.reservedFor === j.id);
    if (!s) continue;
    delete s.reservedFor;
    released = true;
  }
  return released;
}
/** Ends the work once: reservations released, dust and contact water left where it was. */
function close(
  w: V7World,
  a: V7Actor,
  j: Work,
  status: string,
  display: string,
  why: string,
): boolean {
  const released = release(w, j);
  const t = j.thermal;
  if (j.site && (t.dust > 0 || t.pool > 0)) {
    j.residue = {
      dust: grams(t.dust),
      water: t.pool,
      at: { x: j.site.x, y: j.site.y },
      tick: w.tick,
    };
    j.ledger.residueDust = round(j.ledger.residueDust + t.dust);
    j.ledger.residueWater = round(j.ledger.residueWater + t.pool);
  }
  t.dust = 0;
  t.pool = 0;
  j.status = status;
  j.display = display;
  j.stage = 'done';
  j.reason = why;
  j.endedAt = w.tick;
  if (record(a.extensionState[OPEN])?.id === j.id)
    delete a.extensionState['friction-heating-trial:work:open'];
  a.extensionState[RECORDS] = [...records(a), publicWork(j)].slice(-KEEP);
  save(w, a, j);
  return released;
}
function pause(
  w: V7World,
  a: V7Actor,
  j: Work,
  display: string,
  why: string[],
  say: Say,
) {
  j.status = 'paused';
  j.stage = 'paused';
  j.display = display;
  j.reason = why.join('; ');
  save(w, a, j);
  say(
    EVENTS.paused,
    `Friction trial ${j.id} paused without charge: ${j.reason}. Rubbing stopped; the pieces stay reserved and the contact keeps cooling. resume rechecks and continues; cancel ends it.`,
    summary(j),
  );
}
function end(
  w: V7World,
  a: V7Actor,
  j: Work,
  status: string,
  why: string,
  say: Say,
) {
  const released = close(w, a, j, status, status, why);
  say(
    EVENTS.ended,
    `Friction trial ${j.id} ended: ${why}. ${released ? 'The pieces were released and stay with you' : 'No reservation was left to release'}; dust stays where it fell. Nothing is refunded.`,
    summary(j, { released }),
  );
}

/** A reserved unit gone, not yours or changed by something other than this work. */
function materialChange(w: V7World, a: V7Actor, j: Work): string | null {
  for (const [i, p] of j.pieces.entries()) {
    const s = w.stacks.find((x) => x.id === p.item);
    if (!s || s.owner !== a.id || s.reservedFor !== j.id)
      return `${p.item} is no longer yours and reserved for this work`;
    if (foodTenths(s.quantity) !== 10)
      return `${p.item} is no longer one whole unit`;
    if (v7Signature(factsOf(s, false)) !== v7Signature(j.facts[i] ?? null))
      return `${p.item} was changed by something other than this trial`;
    if (physicalOf(s) !== j.physical[i])
      return `the material of ${p.item} changed outside this trial`;
  }
  return null;
}
/** Live checks before a worked round: where the person is, the site, safety and energy. */
function liveProblems(w: V7World, a: V7Actor, j: Work): string[] {
  const base = j.pieces[1];
  if (!j.site || !j.at || !base) return ['no contact site is recorded'];
  const out: string[] = [];
  if (v7Distance(a.position, { x: Number(j.at.x), y: Number(j.at.y) }) > 1e-6)
    out.push('you moved away from the braced base');
  else out.push(...siteProblems(w, a, j.site, base.length, base.diameter));
  out.push(...unsafe(a));
  if (a.vitals.energy < COST.rub - 1e-9)
    out.push(
      `not enough energy: ${shown(a.vitals.energy)} of the ${String(COST.rub)} a rubbing round needs`,
    );
  return out;
}
/** A base track worn half through ends the work. */
function wornThrough(j: Work): string | null {
  const base = j.pieces[1];
  return base &&
    j.thermal.depth >= FRICTION_HEAT.wornThrough * base.diameter * 1000 - 1e-9
    ? 'the base track is worn half through the base, so it no longer supports a contact'
    : null;
}

/** Debits one unit by its wear and drawn water and records the visible wear on it. */
function debit(
  w: V7World,
  s: V7Stack,
  role: string,
  dust: number,
  water: number,
  depth: number,
  work: string,
) {
  const c = smallFireComposition(w, s);
  const solids = Math.max(0, c.unitSolids - dust),
    left = Math.max(0, c.unitWater - water);
  s.physical = {
    unitMass: round(solids + left),
    unitWater: round(left),
    unitSolids: round(solids),
  };
  const old = wearOf(s);
  s.processing = {
    ...(s.processing ?? {}),
    [MARK]: {
      role,
      dust: round(Number(old?.dust ?? 0) + dust),
      depth: role === 'base' ? depth : Number(old?.depth ?? 0),
      rounds: Number(old?.rounds ?? 0) + 1,
      work,
    },
  };
}
function book(j: Work, r: FrictionResult) {
  const l = j.ledger;
  const add = (k: string, v: number) => {
    l[k] = round(Number(l[k] ?? 0) + v);
  };
  add('work', r.work);
  add('spotHeat', r.spotHeat);
  add('zoneHeat', r.zoneHeat);
  add('convection', r.convection);
  add('radiation', r.radiation);
  add('zoneLoss', r.zoneLoss);
  add('evaporation', r.evaporation);
  add('stored', r.stored);
  add('emberHeat', r.emberHeat);
  add('wornRubbing', r.wornRubbing);
  add('wornBase', r.wornBase);
  add('dustRubbing', r.dustRubbing);
  add('dustBase', r.dustBase);
  add('wornWater', r.wornWaterRubbing + r.wornWaterBase);
  add('drawn', r.drawnRubbing + r.drawnBase);
  add('vapour', r.vapour);
  add('emberDust', r.emberDust);
}
function observed(j: Work, r: FrictionResult, rain: number): string[] {
  const t = j.thermal;
  return [
    ...(rain > FRICTION_HEAT.rain ? ['rain fell on the contact'] : []),
    ...(r.peak > t.air + 10 ? ['the contact warmed'] : []),
    ...(r.peak >= 60 ? ['too hot to touch at the contact'] : []),
    ...(r.vapour > 0 ? ['vapour rose from the contact'] : []),
    ...(r.smoke ? ['smoke rose from the dust'] : []),
    ...(r.dustRubbing + r.dustBase > 0 ? ['fine dust collected'] : []),
    ...(r.emberAt !== null ? ['the dust began to glow'] : []),
  ];
}

/** One cooling window of a round without rubbing, at the zones' last represented water shares;
 * no water reaches the spot and nothing is worn. */
function cool(w: V7World, j: Work) {
  const wx = frictionWeather(w, j.site ?? { x: 0.5, y: 0.5 });
  const piece = (share: number): FrictionPiece => ({
    share,
    water: 0,
    hardness: 1,
  });
  const result = frictionWindow(j.thermal, {
    air: wx.temperature,
    wind: wx.wind,
    rain: wx.rain,
    stroke: 0,
    rubSeconds: 0,
    seconds: FRICTION_HEAT.roundSeconds,
    rubbing: piece(j.shares[0] ?? 0),
    base: piece(j.shares[1] ?? 0),
    supply: false,
  });
  book(j, result);
  j.thermal.tick = w.tick;
}

function newWork(
  c: V7ActionContext,
  list: { stack: V7Stack; role: string; shape: Shape }[],
  site: Site,
  attached: V7Data | null,
  rounds: number,
): Work {
  const { world: w, actor: a } = c;
  const base = list[1]?.stack;
  const length = list[1]?.shape.length ?? 0;
  const id = v7Id(w, 'friction');
  const air = frictionWeather(w, site).temperature;
  const thermal = frictionThermal(air, w.tick);
  thermal.depth = base ? depthOf(base) : 0;
  const pieces: Piece[] = [];
  const facts: V7Data[] = [];
  const physical: string[] = [];
  for (const x of list) {
    const unit = reserve(w, x.stack, id);
    pieces.push({
      role: x.role,
      named: x.stack.id,
      item: unit.id,
      resource: unit.resource,
      origin: unit.origin,
      harvestedAt: unit.harvestedAt ?? null,
      length: x.shape.length ?? 0,
      diameter: x.shape.diameter ?? 0,
    });
    facts.push(factsOf(unit, false));
    physical.push(physicalOf(unit));
  }
  const j: Work = {
    id,
    actor: a.id,
    status: 'active',
    stage: attached ? 'rubbing' : 'inspection',
    display: attached ? 'rubbing' : 'inspection',
    pieces,
    facts,
    physical,
    site,
    at: { x: a.position.x, y: a.position.y },
    contact: {
      orientation: ORIENTATION,
      ...frictionPower(frictionStroke(length)),
    },
    inspection: attached ?? {
      source: 'paid in the first round of this trial',
      tick: w.tick,
    },
    bout: { number: 1, requested: rounds, done: 0, startedAt: w.tick },
    rounds: [],
    results: [],
    paidEnergy: 0,
    paidRounds: 0,
    rubRounds: 0,
    rubSeconds: 0,
    thermal,
    shares: list.map((x) => round(model(w, x.stack).share)),
    ledger: ledger(),
    observations: [],
    ember: null,
    residue: null,
    reason: null,
    startedAt: w.tick,
    lastWorked: w.tick,
    endedAt: null,
  };
  const list2 = w.state[WORKS];
  w.state[WORKS] = [
    ...(Array.isArray(list2)
      ? list2.filter((x): x is string => typeof x === 'string')
      : []),
    id,
  ];
  return j;
}
/** The exact unit: the item itself when it is one unit, else one whole unit split exactly from
 * it with every field kept (as collective-work reserves), mapped one to one. */
function reserve(w: V7World, s: V7Stack, id: string): V7Stack {
  if (foodTenths(s.quantity) === 10) {
    s.reservedFor = id;
    return s;
  }
  const unit: V7Stack = {
    ...materialPortion(s, 10),
    id: v7Id(w, 'item'),
    quantity: 1,
    quantityTenths: 10,
    reservedFor: id,
  };
  foodSetQuantity(s, foodTenths(s.quantity) - 10);
  w.stacks.push(unit);
  geometryTransfer(w, s, unit);
  return unit;
}

/** The two named pieces, checked before any cost. */
function chosen(
  c: V7ActionContext,
): { stack: V7Stack; role: string; shape: Shape }[] {
  const { world: w, actor: a } = c;
  const list = ids(c);
  if (list.length !== 2)
    throw nothing(
      'A trial needs targetIds [rubbing piece, base piece]: direct rubbing of two pieces is the only represented contact, and no other apparatus has represented mechanics.',
    );
  const q = c.action.args.quantity;
  if (q !== undefined && q !== 1)
    throw nothing(
      'quantity is 1: one whole unit of each named piece is rubbed; other quantities are not supported.',
    );
  const same = list[0] === list[1];
  return list.map((id, i) => {
    const role = i === 0 ? 'rubbing' : 'base';
    const owner = ownership(w, a, id);
    if (owner) throw nothing(`${owner}.`);
    const s = w.stacks.find((x) => x.id === id);
    const plain = ex19MaterialPiece(w, a, s);
    if (plain || !s) throw nothing(plain ?? `${id} is not an item you hold.`);
    if (same && ex19MaterialWhole(s) < 2)
      throw nothing(
        `${s.id} holds fewer than two whole units; name two pieces.`,
      );
    const shape = shapeOf(w, s);
    if (!shape.known)
      throw nothing(`${s.id} cannot be rubbed: ${shape.missing.join('; ')}.`);
    const why = roleProblem(s, shape, role);
    if (why)
      throw nothing(`${s.id} cannot serve as the ${role} piece: ${why}.`);
    return { stack: s, role, shape };
  });
}
function effort(c: V7ActionContext): number {
  const v = c.action.args.effortRounds;
  if (v === undefined) return BOUT.initial;
  if (
    typeof v !== 'number' ||
    !Number.isSafeInteger(v) ||
    v < 1 ||
    v > BOUT.max
  )
    throw nothing(
      `effortRounds is a whole number from 1 to ${String(BOUT.max)}.`,
    );
  return v;
}
/** The latest inspection of exactly these unchanged pieces within 10 rounds, if any. */
function attachedInspection(
  w: V7World,
  a: V7Actor,
  list: V7Stack[],
): V7Data | null {
  const look = record(w.state[LOOKED + a.id]);
  if (
    !look ||
    w.tick - Number(look.tick) > INSPECTED ||
    v7Signature(look.ids) !== v7Signature(list.map((s) => s.id)) ||
    v7Signature(look.facts) !== v7Signature(list.map((s) => factsOf(s, true)))
  )
    return null;
  return {
    source: 'your unchanged inspection of these pieces',
    tick: Number(look.tick),
    event: typeof look.event === 'string' ? look.event : null,
  };
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c;
  const list = ids(c);
  if (!list.length || list.length > 4)
    throw nothing('Name 1 to 4 exact item ids in targetIds to inspect.');
  if (a.vitals.energy < COST.inspect - 1e-9)
    throw nothing(
      `Not enough energy: inspecting needs ${String(COST.inspect)}, you have ${shown(a.vitals.energy)}.`,
    );
  v7Spend(a, COST.inspect);
  // A trial of these unchanged pieces now attaches this inspection and needs one rubbing round.
  const f = findings(w, a, list, COST.rub);
  openRemember(c, {
    key: `${list[0] ?? ID}:friction-heating-inspection`,
    subject: list[0] ?? ID,
    property: 'friction trial readiness',
    value: f,
    method:
      'direct look and handling of your own pieces and the ground beside you',
    condition: openConditions(w, a.position).regime,
    verified: false,
  });
  c.emit(
    EVENTS.inspected,
    `Inspected ${list.join(' and ')} for ${String(COST.inspect)} energy: ${f.feasible ? 'a trial could start now; whether the pair warms, smokes or glows is unknown until it is rubbed' : `not ready for a trial: ${(f.unmet as string[]).join('; ')}`}. Nothing was reserved or used.`,
    {
      operation: ID,
      by: a.id,
      targets: list,
      findings: f,
      energy: COST.inspect,
      view: {
        component: COMPONENT,
        actor: a.id,
        materials: list,
        display: 'inspection',
        glow: false,
        flame: false,
      },
    },
    list[0] ?? null,
  );
  const event = w.events.at(-1)?.id ?? null;
  const stacks = list
    .map((id) => w.stacks.find((s) => s.id === id))
    .filter((s): s is V7Stack => !!s);
  w.state[LOOKED + a.id] = {
    tick: w.tick,
    ids: list,
    facts:
      stacks.length === list.length ? stacks.map((s) => factsOf(s, true)) : [],
    event,
  };
  return { complete: true, remaining: 0, writes: list };
}

function start(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c;
  const list = chosen(c);
  const rounds = effort(c);
  const base = list[1];
  if (!base?.shape.length || !base.shape.diameter)
    throw nothing('The base shape is not represented.');
  const found = siteFor(w, a, base.shape.length, base.shape.diameter);
  if (!found.site) throw nothing(`${found.problems.join('; ')}.`);
  const safety = unsafe(a);
  if (safety.length) throw nothing(`Rubbing is refused: ${safety.join('; ')}.`);
  const attached = attachedInspection(
    w,
    a,
    list.map((x) => x.stack),
  );
  const need = (attached ? 0 : COST.inspect) + COST.rub;
  if (a.vitals.energy < need - 1e-9)
    throw nothing(
      `Not enough energy: ${attached ? '' : 'the paid inspection and '}one rubbing round need ${String(need)}, you have ${shown(a.vitals.energy)}.`,
    );
  const f = attached
    ? null
    : findings(
        w,
        a,
        list.map((x) => x.stack.id),
        need,
      );
  const j = newWork(c, list, found.site, attached, rounds);
  if (attached) return rub(c, j, true);
  v7Spend(a, COST.inspect);
  j.paidEnergy = COST.inspect;
  j.paidRounds = 1;
  j.lastWorked = w.tick;
  j.observations = [];
  save(w, a, j);
  openRemember(c, {
    key: `${j.pieces[0]?.named ?? ID}:friction-heating-inspection`,
    subject: j.pieces[0]?.named ?? ID,
    property: 'friction trial readiness',
    value: f,
    method:
      'direct look and handling of your own pieces and the ground beside you',
    condition: openConditions(w, a.position).regime,
    verified: false,
  });
  c.emit(
    EVENTS.started,
    `Round 1: inspected ${j.pieces.map((p) => `${p.item} (${p.role})`).join(' and ')} and braced the base on firm ground at (${shown(found.site.x)}, ${shown(found.site.y)}) for ${String(COST.inspect)} energy. Both stay with you, reserved for this trial; rubbing starts next round at ${String(COST.rub)} energy a round for up to ${String(rounds)} rounds.`,
    summary(j, { findings: f, energy: COST.inspect }),
    j.id,
  );
  return {
    complete: false,
    remaining: rounds,
    writes: [j.id, ...j.pieces.map((p) => p.item)],
  };
}

/** One paid rubbing round: fresh checks, the charge, the contact model, the debits and, if the
 * dust glows, exactly one ember. */
function rub(c: V7ActionContext, j: Work, fresh: boolean): V7HandlerResult {
  const { world: w, actor: a } = c;
  const say: Say = (type, description, data) => {
    c.emit(type, description, data, j.id);
  };
  const done = (): V7HandlerResult => ({
    complete: true,
    remaining: 0,
    writes: [j.id, ...j.pieces.map((p) => p.item)],
  });
  const change = materialChange(w, a, j);
  const worn = wornThrough(j);
  if (change ?? worn) {
    end(
      w,
      a,
      j,
      change ? 'invalidated' : 'infeasible',
      change ?? worn ?? '',
      say,
    );
    return done();
  }
  const live = liveProblems(w, a, j);
  if (live.length) {
    if (fresh)
      throw nothing(`The trial cannot continue now: ${live.join('; ')}.`);
    pause(w, a, j, 'paused', live, say);
    return done();
  }
  const units = j.pieces.map((p) => w.stacks.find((s) => s.id === p.item));
  const [r, b] = units;
  if (!r || !b || !j.site)
    throw nothing('The reserved pieces are unavailable.');
  const wx = frictionWeather(w, j.site);
  const stroke = Number(j.contact.stroke);
  const power = frictionPower(stroke);
  const result = frictionWindow(j.thermal, {
    air: wx.temperature,
    wind: wx.wind,
    rain: wx.rain,
    stroke,
    rubSeconds: power.seconds,
    seconds: FRICTION_HEAT.roundSeconds,
    rubbing: model(w, r),
    base: model(w, b),
    supply: true,
  });
  debit(
    w,
    r,
    'rubbing',
    result.dustRubbing,
    result.wornWaterRubbing + result.drawnRubbing,
    j.thermal.depth,
    j.id,
  );
  debit(
    w,
    b,
    'base',
    result.dustBase,
    result.wornWaterBase + result.drawnBase,
    j.thermal.depth,
    j.id,
  );
  // The round is paid for the rubbing actually done: all of it unless an ember stopped it.
  const charge = round(
    COST.rub *
      Math.min(1, power.seconds > 0 ? result.rubbed / power.seconds : 0),
  );
  v7Spend(a, charge);
  j.physical = [physicalOf(r), physicalOf(b)];
  j.shares = [round(model(w, r).share), round(model(w, b).share)];
  book(j, result);
  j.ledger.input = round(j.ledger.input + charge * FRICTION_HEAT.workPerEnergy);
  j.thermal.tick = w.tick;
  j.bout.done += 1;
  j.paidEnergy = round(j.paidEnergy + charge);
  j.paidRounds += 1;
  j.rubRounds += 1;
  j.rubSeconds = round(j.rubSeconds + result.rubbed);
  j.lastWorked = w.tick;
  j.status = 'active';
  j.stage = 'rubbing';
  j.display = 'rubbing';
  j.reason = null;
  j.observations = observed(j, result, wx.rain);
  j.results = [...j.results, { tick: w.tick, ...result }].slice(-10);
  const entry: V7Data = {
    tick: w.tick,
    bout: j.bout.number,
    round: j.bout.done,
    rubbedSeconds: result.rubbed,
    totalSeconds: j.rubSeconds,
    energy: charge,
    input: round(charge * FRICTION_HEAT.workPerEnergy),
    frictionWork: result.work,
    force: power.force,
    speed: power.speed,
    stroke: power.stroke,
    peak: reading(result.peak),
    end: reading(j.thermal.spot),
    dustAdded: grams(result.dustRubbing + result.dustBase),
    dust: grams(j.thermal.dust),
    trackDepth: j.thermal.depth,
    smoke: result.smoke,
    observations: j.observations,
    stop: result.emberAt === null ? null : 'the dust glowed',
  };
  j.rounds = [...j.rounds, entry].slice(-10);
  save(w, a, j);
  say(
    EVENTS.rubbed,
    `Rubbed for ${String(Math.round(result.rubbed))} s (${String(charge)} energy, ${String(Math.round(result.work / 1000))} kJ of friction): ${j.observations.length ? j.observations.join(', ') : 'no visible change'}; the contact felt about ${String(reading(result.peak))} C at most.`,
    summary(j, { round: entry, energy: charge }),
  );
  if (result.emberAt !== null) {
    const o = kindle(w, a, j, result, wx.temperature);
    j.ember = o.id;
    const released = close(
      w,
      a,
      j,
      'completed',
      'ember',
      'An ember formed in the dust; rubbing stopped.',
    );
    remember(c, j);
    c.emit(
      EVENTS.ember,
      `The dust at the contact began to glow: ${String(grams(result.emberDust))} g of it lies as a small ember at (${shown(o.spatial.x)}, ${shown(o.spatial.y)}). It smoulders on its own until it cools, burns out or rain reaches it; it is not a flame. The pieces were released.`,
      summary(j, {
        source: o.id,
        dust: grams(result.emberDust),
        released,
        view: { ...view(j), display: 'ember', glow: true },
      }),
      o.id,
    );
    return { ...done(), writes: [...done().writes, o.id] };
  }
  if (j.bout.done >= j.bout.requested) {
    j.status = 'paused';
    j.stage = 'bout finished';
    j.display = 'no ember';
    j.reason = `the ${String(j.bout.requested)} requested rounds of bout ${String(j.bout.number)} were rubbed without an ember`;
    save(w, a, j);
    remember(c, j);
    say(
      EVENTS.finished,
      `Bout ${String(j.bout.number)} ended after ${String(j.bout.done)} rounds without an ember: the contact peaked near ${String(reading(j.thermal.peak))} C. The pieces stay reserved and cool; give trial with the same targetIds for another bout, inspect-progress to check, or cancel. Spent effort is not refunded.`,
      summary(j),
    );
    return done();
  }
  return {
    complete: false,
    remaining: j.bout.requested - j.bout.done,
    writes: [j.id, ...j.pieces.map((p) => p.item)],
  };
}
function remember(c: V7ActionContext, j: Work) {
  openRemember(c, {
    key: `${j.id}:friction-heating-trial`,
    subject: j.pieces[0]?.resource ?? ID,
    property: 'friction trial outcome',
    value: {
      work: j.id,
      pieces: j.pieces.map((p) => p.item),
      rounds: j.rubRounds,
      seconds: j.rubSeconds,
      peak: reading(j.thermal.peak),
      dust: grams(j.ledger.dustRubbing + j.ledger.dustBase),
      trackDepth: j.thermal.depth,
      ember: j.ember,
      observations: j.observations,
    },
    method: 'your own paid rubbing of the two pieces',
    condition: openConditions(c.world, c.actor.position).regime,
    verified: false,
  });
}

function emberView(o: V7Object): V7Data {
  const e = emberOf(o);
  return {
    component: KIND,
    source: o.id,
    provenance: o.data.provenance ?? null,
    remainingFuelKg: e.mass,
    ashKg: e.ash,
    thermal: { temperature: Math.round(e.temperature), air: Math.round(e.air) },
    intensity: e.power,
    glow: e.glowing,
    smoke: e.glowing,
    flame: false,
    extinction: {
      glowing: e.glowing,
      status: e.status,
      reason: e.reason,
      outAt: e.outAt,
    },
  };
}
function emberRefresh(o: V7Object) {
  const e = emberOf(o);
  const warm = e.temperature > e.air + 5;
  const state = e.glowing ? 'glowing' : warm ? 'cooling' : 'cold';
  o.visual.state = state;
  o.visual.color = e.glowing ? '#c4562f' : warm ? '#6b5a4a' : '#a4a49a';
  o.visual.accent = e.glowing ? '#e39c3c' : '#7d776c';
  o.visual.label = e.glowing
    ? 'Glowing ember'
    : warm
      ? 'Ember out, still warm'
      : 'Cold ember residue';
  const heat = round(Math.max(0, e.stored) / 1e6);
  o.data.availableHeat = heat;
  o.data.offered = heat;
  o.data.view = emberView(o);
}
function kindle(
  w: V7World,
  a: V7Actor,
  j: Work,
  r: FrictionResult,
  air: number,
): V7Object {
  const site = j.site ?? { x: a.position.x, y: a.position.y };
  const e = frictionEmber(
    r.emberDust,
    r.emberHeat,
    air,
    w.tick,
    r.emberAt ?? 0,
  );
  const o: V7Object = {
    id: v7Id(w, 'ember'),
    kind: KIND,
    name: 'Friction ember',
    spatial: {
      x: site.x,
      y: site.y,
      angle: 0,
      shape: { kind: 'circle', radius: FRICTION_HEAT.emberRadius },
      solid: false,
      interaction: w.config.interaction,
      entrances: [],
    },
    visual: {
      component: KIND,
      color: '#c4562f',
      accent: '#e39c3c',
      label: 'Glowing ember',
      state: 'glowing',
    },
    data: {
      ember: e,
      provenance: {
        operation: REVISION,
        work: j.id,
        by: a.id,
        pieces: j.pieces.map((p) => p.item),
        dustKg: r.emberDust,
        formedAt: w.tick,
        formedSecond: r.emberAt ?? 0,
      },
      availableHeat: 0,
      offered: 0,
    },
    // The person is recorded in the provenance; the ember is not counted as made work.
    createdBy: null,
    createdAt: w.tick,
    revision: REVISION,
  };
  emberRefresh(o);
  w.objects.push(o);
  return o;
}

function trial(c: V7ActionContext, open: Work | null): V7HandlerResult {
  const { world: w } = c;
  if (!open) return start(c);
  const list = ids(c);
  const same =
    list.length === 2 &&
    open.pieces.every((p, i) => list[i] === p.named || list[i] === p.item);
  if (!same)
    throw nothing(
      `Your friction trial ${open.id} is open on ${open.pieces.map((p) => p.item).join(' and ')}; give trial with those targetIds for another bout, resume, inspect-progress or cancel it.`,
    );
  if (
    open.status === 'active' &&
    open.lastWorked === w.tick - 1 &&
    open.bout.done < open.bout.requested
  )
    return rub(c, open, false);
  return bout(c, open, effort(c));
}
/** A new bout on open work: fresh checks, the attached inspection, then a rubbing round. */
function bout(c: V7ActionContext, j: Work, rounds: number): V7HandlerResult {
  const { world: w, actor: a } = c;
  relocate(w, a, j);
  j.bout = {
    number: j.bout.number + 1,
    requested: rounds,
    done: 0,
    startedAt: w.tick,
  };
  return rub(c, j, true);
}
/** After moving, the base is braced again beside where the person now is, if clear ground
 * exists; the contact state goes with the pieces. */
function relocate(w: V7World, a: V7Actor, j: Work) {
  const base = j.pieces[1];
  if (!base || !j.at) return;
  if (v7Distance(a.position, { x: Number(j.at.x), y: Number(j.at.y) }) <= 1e-6)
    return;
  const found = siteFor(w, a, base.length, base.diameter);
  if (!found.site) throw nothing(`${found.problems.join('; ')}.`);
  j.site = found.site;
  j.at = { x: a.position.x, y: a.position.y };
}
function resume(c: V7ActionContext, open: Work | null): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (!open)
    throw nothing('There is no open friction trial to resume; give trial.');
  if (open.status === 'active' && open.lastWorked === w.tick - 1)
    return rub(c, open, false);
  if (open.bout.done >= open.bout.requested)
    throw nothing(
      `Bout ${String(open.bout.number)} is finished; give trial with the same targetIds and effortRounds for another bout.`,
    );
  relocate(w, a, open);
  return rub(c, open, true);
}
function cancel(c: V7ActionContext, open: Work | null): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (!open)
    throw nothing(
      'There is no open friction trial to cancel; dust and any ember stay where they are.',
    );
  const released = close(
    w,
    a,
    open,
    'cancelled',
    'cancelled',
    'Cancelled on request.',
  );
  c.emit(
    EVENTS.cancelled,
    `Cancelled friction trial ${open.id}: the pieces stay with you${released ? ' and are free again' : ''}, worn as they are; dust stays where it fell; the ${String(open.paidEnergy)} energy already paid is not refunded.`,
    summary(open, { released }),
    open.id,
  );
  return { complete: true, remaining: 0, writes: [open.id] };
}
/** The open work with live checks, or the latest closed record; an ember only while in view. */
function check(c: V7ActionContext, open: Work | null): V7HandlerResult {
  const { world: w, actor: a } = c;
  const j = open ?? internal(w, records(a).at(-1)?.id);
  if (!j) throw nothing('There is no friction trial to report.');
  if (a.vitals.energy < COST.check - 1e-9)
    throw nothing(
      `Not enough energy: checking needs ${String(COST.check)}, you have ${shown(a.vitals.energy)}.`,
    );
  v7Spend(a, COST.check);
  const o = j.ember ? w.objects.find((x) => x.id === j.ember) : undefined;
  const seen =
    !!o &&
    v7Distance(a.position, o.spatial) <= w.config.vision &&
    v7Visible(w, a.position, o.spatial);
  const live = open
    ? {
        materialChange: materialChange(w, a, open) ?? wornThrough(open),
        liveProblems: liveProblems(w, a, open),
        roundEnergy: COST.rub,
      }
    : {};
  c.emit(
    EVENTS.checked,
    `Checked friction trial ${j.id} for ${String(COST.check)} energy: ${j.status}${j.reason ? ` (${j.reason})` : ''}; ${String(j.paidEnergy)} energy paid over ${String(j.paidRounds)} round(s); the contact feels about ${String(reading(j.thermal.spot))} C.`,
    summary(j, {
      current: {
        ...live,
        ember: o
          ? seen
            ? { inView: true, ...emberView(o) }
            : { inView: false }
          : null,
      },
      energy: COST.check,
    }),
    j.id,
  );
  return { complete: true, remaining: 0, writes: [j.id] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = typeof c.action.args.mode === 'string' ? c.action.args.mode : '';
  const open = openWork(c.world, c.actor);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'trial') return trial(c, open);
  if (mode === 'inspect-progress') return check(c, open);
  if (mode === 'resume') return resume(c, open);
  if (mode === 'cancel') return cancel(c, open);
  throw nothing(`Give mode ${MODES.join(', ')}.`);
}

/** Every round: reserved pieces follow the person, changed pieces end their work, unworked open
 * work pauses, every contact cools and every ember smoulders, cools and burns whoever stands on
 * it, whoever is present. */
function environment(w: V7World) {
  for (const a of w.actors) {
    if (a.vitals.health <= 0) continue;
    const j = openWork(w, a);
    if (!j) continue;
    const say: Say = (type, description, data) => {
      forestEvent(w, type, description, a.position, a.id, data, j.id);
    };
    for (const p of j.pieces) {
      const s = w.stacks.find((x) => x.id === p.item && x.reservedFor === j.id);
      if (s) s.position = { ...a.position };
    }
    const change = materialChange(w, a, j);
    if (change) {
      end(w, a, j, 'invalidated', change, say);
      continue;
    }
    if (j.status === 'active' && j.lastWorked < w.tick)
      pause(
        w,
        a,
        j,
        'interrupted',
        [
          'this round went to another action, a refused action or no action, so rubbing stopped',
        ],
        say,
      );
  }
  const list = w.state[WORKS];
  const keep: string[] = [];
  for (const id of Array.isArray(list) ? list : []) {
    const j = internal(w, id);
    if (!j) continue;
    const open = ['active', 'paused'].includes(j.status);
    if (j.thermal.tick < w.tick) cool(w, j);
    const t = j.thermal;
    if (
      open ||
      Math.max(
        Math.abs(t.spot - t.air),
        Math.abs(t.rubbing - t.air),
        Math.abs(t.base - t.air),
      ) > 0.5
    )
      keep.push(j.id);
    w.state[STATE + j.id] = v7Json(j);
    const a = w.actors.find((x) => x.id === j.actor);
    if (a && open && record(a.extensionState[OPEN])?.id === j.id)
      a.extensionState[OPEN] = publicWork(j);
  }
  w.state[WORKS] = keep;
  for (const o of w.objects.filter(isEmber)) {
    const e = emberOf(o);
    if (e.lastTick >= w.tick) continue;
    const wx = frictionWeather(w, o.spatial);
    const capacity =
      FRICTION_HEAT.emberCapacity * Math.max(1e-6, e.mass + e.ash);
    // Heat another interface drew from the offered heat since the last round.
    const drawn = Math.min(
      Math.max(0, e.stored),
      Math.max(
        0,
        Number(o.data.offered ?? 0) - Number(o.data.availableHeat ?? 0),
      ) * 1e6,
    );
    if (drawn > 0) {
      e.temperature = round(e.temperature - drawn / capacity);
      e.drawn = round(e.drawn + drawn);
    }
    const seconds =
      e.formedAt === w.tick
        ? FRICTION_HEAT.roundSeconds - e.formedSecond
        : FRICTION_HEAT.roundSeconds;
    const result = frictionEmberWindow(
      e,
      wx.temperature,
      wx.wind,
      wx.rain,
      seconds,
      w.tick,
    );
    emberRefresh(o);
    if (result.out)
      forestEvent(
        w,
        EVENTS.out,
        `The ember at (${shown(o.spatial.x)}, ${shown(o.spatial.y)}) stopped glowing: ${String(e.reason)}. ${String(grams(e.mass))} g of unburned dust and ${String(grams(e.ash))} g of ash remain and cool.`,
        { x: o.spatial.x, y: o.spatial.y },
        null,
        { operation: ID, source: o.id, view: emberView(o) },
        o.id,
      );
    if (result.released <= 0) continue;
    for (const a of w.actors) {
      if (
        a.vitals.health <= 0 ||
        v7Distance(a.position, o.spatial) >=
          a.radius + FRICTION_HEAT.emberRadius
      )
        continue;
      const loss = round(
        Math.min(
          a.vitals.health,
          (FRICTION_HEAT.contactBurn * result.released) /
            FRICTION_HEAT.burnJoules,
        ),
      );
      if (loss <= 0) continue;
      a.vitals.health = round(a.vitals.health - loss);
      forestEvent(
        w,
        EVENTS.burn,
        `Standing on the glowing ember burned this person: ${String(loss)} health lost.`,
        a.position,
        a.id,
        {
          operation: ID,
          source: o.id,
          loss,
          released: result.released,
          distance: round(v7Distance(a.position, o.spatial)),
        },
        o.id,
      );
    }
  }
}
/** Death ends open work and releases the pieces once to the death rules; dust and any ember
 * stay where they are. */
function onDeath(w: V7World, a: V7Actor) {
  const j = openWork(w, a);
  if (!j) return;
  end(
    w,
    a,
    j,
    'ended',
    'The person died; the pieces are handled with the rest of what was carried',
    (type, description, data) => {
      forestEvent(w, type, description, a.position, a.id, data, j.id);
    },
  );
}

const ABILITY: V7Ability = {
  id: ID,
  name: 'Friction heating trial',
  function:
    'Rub the end of one owned rigid wood piece along another braced on the ground to heat their contact, after inspecting them; warmth, dust or failure are ordinary outcomes and an ember forms only if the modeled contact gets hot enough.',
  equivalence: 'heat:two-piece-hand-friction:inspected-trial:1',
  parameters: {
    ...v7ObjectSchema({
      mode: { type: 'string', enum: MODES },
      targetIds: { type: 'array', items: { type: 'string', maxLength: 1000 } },
      quantity: { type: 'integer', minimum: 1 },
      effortRounds: { type: 'integer', minimum: 1, maximum: BOUT.max },
    }),
    required: ['mode'],
  },
  references: {},
  prerequisites: [],
  learning: 4,
  learningEnergy: COST.study,
  costs: `Study: 4 rounds, ${String(COST.study)} energy each. inspect: targetIds 1-4 of your items; 1 round, ${String(COST.inspect)}; reserves and uses nothing. trial: targetIds [rubbing piece, base piece], whole units (one id twice needs 2 units), quantity 1, effortRounds 1-10 (default 3): a paid inspection round (${String(COST.inspect)}) unless you inspected those unchanged pieces within 10 rounds, then ${String(COST.rub)} energy per rubbing round (a round an ember stops pays only the rubbing done). trial again on open work starts a new bout after fresh checks; resume continues a paused bout; inspect-progress: 1 round, ${String(COST.check)}; cancel: 1 round, no energy. Refusals come before any cost. No tool, tinder or fuel is given.`,
  effects:
    'Pieces: branch, birch or oak units as the small-combustion-source@1 rod (900 kg/m3, 25 diameters long, rigid); rubbing piece 1.5-5 cm thick, base 3 cm+, both 0.3 m+; the base is braced on clear firm ground beside you. Model (1 energy = 21.6 kJ): 50 N press, friction 0.4, stroke min(0.25 m, base/2) at 2 cycles/s: 20 W for up to 864 s a round. A share 0.5+track mm/3 (max 1) heats a 6 J/K spot, the rest two 50 g zones; losses: 0.012 W/K into each zone, convection 10 W/m2K on 4 cm2 x (1+0.5 wind), radiation (emissivity 0.9), zone convection on 100 cm2, and water the wood draws (1.9e-5 kg/s x water share) boiling off above 100 C. Wear: 2 g per 21.6 kJ, split inversely by hardness, debited from the pieces; dry solids become dust; the 1 cm base track ends the work half through the base. Dust of 2 g+ at 350 C+, rain 0.15 or less, becomes one ember: 18 MJ/kg, burning dust x dt/(600 s/(1+wind)), 10% ash, glowing until below 300 C, burned out or rain above 0.15; standing on it costs 5 health per 2 MJ released. Contacts cool every round; resume keeps the cooled state. Another action, lost site, unsafe effort (health under 20, starving, body outside 7-34 C) or low energy pauses free; changed pieces end it; cancel or death ends it, releases the pieces once and leaves dust and any ember. No flame, tinder, food heating, warmth, refund or reward.',
  handler: HANDLER,
  revision: REVISION,
  authored: false,
  // The ember event never carries a qualified flag: an ember earns no practice milestone.
  practiceEvidence: EVENTS.ember,
  dependencies: { abilities: [], resources: [], knowledge: [] },
  execution: {
    duration: null,
    interruption: 'cancel',
    progress:
      'trial pays an inspection round unless one is attached, then rubs one paid round per round up to effortRounds; an ember, a finished bout, a pause or cancel ends the action. inspect, inspect-progress and cancel take one round.',
  },
};

/** ex25: Wren's request for a friction ember or small heat source from owned wood. */
export const LONG_EX25_FRICTION_HEAT: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex25',
  dependencies: ['foundation-open@1'],
  description:
    'A general friction-heating trial: two owned rigid wood pieces are inspected, reserved and rubbed in paid rounds on clear firm ground; a published contact model resolves force, stroke, speed and friction power from the geometry and the paid effort, splits the heat between a hot spot and the two pieces, subtracts conduction, convection, radiation and evaporation of water the wood actually holds, debits wear from the pieces and collects it as dust. Dust of 2 g or more at 350 C or more forms one located ember that smoulders, cools and goes out on its own each round, with a mass and heat ledger and a contact burn for anyone standing on it. Pause, resume, new bouts, cancellation and death keep the cooled state and release the pieces once. No flame, tinder, spread, food heating, warming or reward.',
  reuse: {
    experiment:
      'small-combustion-source@1 (ex21): the energy conversion 1 energy = 21.6 kJ, the declared rod geometry (900 kg/m3, length 25 diameters), grip, base and length limits, rigidity, the represented composition and the contact-burn law; hearth-food-preparation@1 (ex17): the thermal round of 1080 s, the 20 W hand friction power, the contact law 0.5 + depth/3 mm, wear of 2 g per round of that power, smoke at 200 C, an ember from 2 g of dust at 350 C, wind cooling 1 + 0.5 wind, still-air coefficient, water and wood heat and latent heat; local-fire@1: the 0.15 rain limit and 10% ash; foundation-open@1 probe: unverified personal records and the available-heat convention; ex19 material checks. ex21 drillRound is not called: it has no force, stroke, heat capacity or persistent thermal state. ex21 beds, tinder ignition, combustion and burns of beds are not reused: the specification asks for no bed, tinder or flame.',
    source:
      'long-thermal-physics.ts (HEAT, BURN, DRILL); long-ex21-small-combustion-physics.ts (SMALL_FIRE, smallFireComposition, smallFireRod); long-ex19-material-contact.ts (ex19MaterialPiece, ex19MaterialWhole, ex19MaterialGround); open-foundation.ts (openRemember); material-lots.ts, forest-food-accounting.ts and open-material-geometry.ts (one-unit split as collective-work.ts reserves); forest-climate.ts (forestClimate, forestEvent); continuous-geometry.ts; long-ex25-friction-heat-physics.ts (new contact and ember model)',
    description:
      'Implementation reuse only: no fire, fuel, tool or mastery is granted, and the ex21 package and modules are unchanged. New: the contact heating and cooling model, the dust ember, the trial lifecycle and their ledgers.',
  },
  abilities: [ABILITY],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: Object.values(EVENTS),
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath,
};
