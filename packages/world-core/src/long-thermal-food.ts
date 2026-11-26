import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Point,
  V7Spatial,
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
  v7Distance,
  v7Inside,
  v7Interior,
  v7Reach,
  v7ShapeDistance,
} from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { forestFireFuel } from './forest-material-compatibility.js';
import { hearthSpatial } from './forest-fire.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { materialPortion } from './material-lots.js';
import { openConditions } from './open-physical.js';
import { foodWaterActive, foodWaterInitialize } from './food-water.js';
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
  BURN,
  DRILL,
  HEAT,
  burnRound,
  drillRound,
  foodLot,
  foodSurface,
  foodYield,
  heatEstimate,
  heatRound,
} from './long-thermal-physics.js';
import type {
  Drill,
  FoodLot,
  FuelLot,
  Hearth,
  Weather,
} from './long-thermal-physics.js';

const ID = 'hearth-food-preparation';
const REVISION = `${ID}@1`;
const HANDLER = 'long.hearth-food-preparation';
/** Object kind and drawing of a cleared open hearth. */
const KIND = 'open-hearth';
const STATE = `long:work:${ID}`;
/** local-fire@1 hearth clearance; loose fuel within the rim of a lit bed catches. */
const CLEAR = 0.7;
const RIM = 0.25;
/** Meadow, dry and forest ground; never water, a ford or wet ground. */
const GROUND = ['.', ':', 'f'];
const PREPARE_ROUNDS = 2;
const MODES = [
  'prepare-hearth',
  'ignite',
  'tend',
  'cook',
  'inspect',
  'retrieve',
  'extinguish',
  'cancel',
];
const LABELS: Record<string, string> = {
  unprepared: 'Hearth being cleared',
  prepared: 'Cleared hearth',
  'friction-in-progress': 'Hand-drill friction',
  'failed-cooled': 'Friction failed, cooled',
  ember: 'Glowing embers',
  burning: 'Fire burning',
  extinguished: 'Fire out',
};

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const isHearth = (o: V7Object) =>
  o.kind === KIND &&
  o.revision === REVISION &&
  !!o.data.hearth &&
  typeof o.data.hearth === 'object' &&
  !Array.isArray(o.data.hearth);
const hearthOf = (o: V7Object) => o.data.hearth as Hearth;
const drillOf = (j: CollectiveWork) => j.drill as Drill;
const round = (x: number) => v7RoundNumber(x);
const resource = (w: V7World, id: string) =>
  w.resources.find((r) => r.id === id);
const hardness = (w: V7World, id: string) =>
  resource(w, id)?.properties?.hardness ?? 0;
/** The world's wood materials: inedible, fuel value at least 7, hardness at least 3. */
function woody(w: V7World, id: string): boolean {
  const r = resource(w, id);
  return (
    !!r &&
    r.nutrition === 0 &&
    (r.properties?.fuel ?? 0) >= 7 &&
    (r.properties?.hardness ?? 0) >= 3
  );
}
const tracked = (w: V7World, id: string) =>
  forestFireFuel(w, id) || woody(w, id);
const holder = (w: V7World, s: V7Stack): V7Point =>
  w.actors.find((a) => a.id === s.owner)?.position ?? s.position;
function weather(w: V7World, p: V7Point): Weather {
  const c = forestClimate(w, p);
  return { temperature: c.temperature, rain: c.rain ?? 0, wind: c.wind ?? 0 };
}
/** local-fire@1 rule: material keeps its tracked moisture, else takes the current rain. */
function moisture(w: V7World, s: V7Stack): number {
  return s.fuelMoisture ?? forestClimate(w, holder(w, s)).rain ?? 0;
}
const wetness = (m: number) =>
  m <= 0.05 ? 'dry' : m <= BURN.moisture ? 'damp' : 'wet';
const wear = (s: V7Stack) => {
  const v = s.processing?.frictionWear;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
};
/** Mass of one unit of fuel, less any wood worn away by drilling. */
function unitMass(w: V7World, s: V7Stack): number {
  const base = resource(w, s.resource)?.mass ?? 0;
  const worn = Number(wear(s)?.worn ?? 0);
  return Math.max(0, base - worn / Math.max(1, s.quantity));
}
const fuelOf = (h: Hearth, id: string) =>
  h.lots.filter((l) => l.resource === id).reduce((n, l) => n + l.quantity, 0);
/** An owned, unreserved whole branch serves as a raking and turning stick; it is not used up. */
function stick(c: V7ActionContext, spent = 0): boolean {
  return (
    c.world.stacks
      .filter(
        (s) =>
          s.owner === c.actor.id && !s.reservedFor && s.resource === 'branch',
      )
      .reduce((n, s) => n + s.quantity, 0) -
      spent >=
    1 - 1e-8
  );
}
function sync(a: V7Actor, j: CollectiveWork) {
  a.extensionState[STATE] = v7Json(j);
}
function history(h: Hearth, tick: number, entry: V7Data) {
  h.history = [...h.history, { tick, ...entry }].slice(-12);
}

/** Visible face appearance and touch class; core state is never measured. */
function look(l: FoodLot) {
  return l.nodes.slice(0, 2).map((n, i) => {
    const solids = n.solids + n.char;
    const water0 = l.initialWater * HEAT.faceShare;
    return {
      side: i === l.down && l.onBed ? 'down' : 'up',
      look:
        solids > 0 && n.char / solids >= 0.5
          ? 'charred'
          : n.char > 0
            ? 'browned and blackening'
            : water0 > 0 && n.water / water0 < 0.3
              ? 'dry and browned'
              : n.t >= 90 && n.water > 0
                ? 'steaming'
                : n.t >= 60
                  ? 'heated'
                  : 'raw-looking',
      feel: n.t > HEAT.handFood ? 'hot' : n.t >= 35 ? 'warm' : 'cool',
    };
  });
}
const foodView = (l: FoodLot) =>
  l.heating && ['unheated', 'partly-heated'].includes(l.state)
    ? 'food-heating'
    : l.state;
function bedFeel(h: Hearth, air: number) {
  const d = h.bed - air;
  return d < 5 ? 'cold' : d < 40 ? 'warm' : 'hot';
}

function friction(w: V7World, o: V7Object) {
  return collectiveJobs(w, ID).find(
    (j) => open(j) && j.mode === 'ignite' && j.target === o.id,
  );
}
function hearthState(w: V7World, o: V7Object): string {
  const h = hearthOf(o),
    j = friction(w, o);
  if (!h.prepared) return 'unprepared';
  if (h.lit)
    return h.burnFraction > 0 || h.litAt === w.tick ? 'burning' : 'ember';
  if (j)
    return drillOf(j).stage === 'friction' ? 'friction-in-progress' : 'ember';
  if (h.ignitions > 0) return 'extinguished';
  return h.failures > 0 ? 'failed-cooled' : 'prepared';
}
/** Reusable drawing metadata and the public mode; it confers no fire, food or reward. */
function refresh(w: V7World, o: V7Object) {
  const h = hearthOf(o),
    state = hearthState(w, o),
    j = friction(w, o),
    prep = collectiveJobs(w, ID).find(
      (x) => open(x) && x.mode === 'prepare-hearth' && x.target === o.id,
    );
  o.visual.state = state;
  o.visual.label = LABELS[state] ?? 'Open hearth';
  o.data.mode = state;
  o.data.progress = h.prepared
    ? 1
    : round((prep?.completedWork ?? 0) / PREPARE_ROUNDS);
  o.data.view = v7Json({
    component: KIND,
    hearth: o.id,
    state,
    x: o.spatial.x,
    y: o.spatial.y,
    radius: 0.45,
    prepared: h.prepared,
    fuelMass: round(h.lots.reduce((n, l) => n + l.quantity * l.mass, 0)),
    fuelEnergy: round(h.lots.reduce((n, l) => n + l.quantity * l.energy, 0)),
    flame: state === 'burning',
    smoke: h.burnFraction > 0,
    ember: state === 'ember',
    friction: j
      ? {
          stage: drillOf(j).stage,
          rounds: drillOf(j).rounds,
          smoke: drillOf(j).last >= DRILL.smoke,
        }
      : null,
    ash: round(h.ash),
    residue: round(h.residue),
    food: h.food.map((l) => ({
      stack: l.stack,
      state: foodView(l),
      quantity: l.quantity,
      onBed: l.onBed,
      surface: look(l).find((f) => f.side === 'down')?.look ?? 'raw-looking',
    })),
  });
}
function summary(w: V7World, o: V7Object | undefined, j?: CollectiveWork) {
  return {
    ...(j
      ? {
          workId: j.id,
          mode: j.mode,
          status: j.status,
          completedRounds: j.completedWork,
          remaining: j.remainingWork,
          paidEnergy: round(j.paidEnergy),
          ...(j.drill ? { drill: v7Json(j.drill) } : {}),
        }
      : {}),
    ...(o
      ? {
          hearth: o.id,
          x: o.spatial.x,
          y: o.spatial.y,
          view: o.data.view ?? null,
        }
      : {}),
    tick: w.tick,
  };
}

/** Site of a new open bed: local-fire@1 footprint and clearance, plus dry open ground. */
function siteError(
  w: V7World,
  a: V7Actor,
  spatial: V7Spatial,
  self?: string,
): string | null {
  if (!v7Inside(w, spatial, CLEAR))
    return 'The hearth must lie inside the world.';
  if (!v7Reach(a, spatial)) return 'Stand within reach of the hearth site.';
  const points = [
    spatial,
    ...[0, 1, 2, 3].map((i) => ({
      x: spatial.x + 0.45 * Math.cos((i * Math.PI) / 2),
      y: spatial.y + 0.45 * Math.sin((i * Math.PI) / 2),
    })),
  ];
  for (const p of points) {
    const ground = openConditions(w, p);
    if (!GROUND.includes(ground.ground))
      return 'The bed needs dry open ground, not water, a ford or wet ground.';
    if (ground.regime === 'saturated soil')
      return 'The soil here is saturated.';
  }
  if (
    forestClimate(w, spatial).indoor ||
    w.objects.some((o) => v7Interior(spatial, o.spatial))
  )
    return 'A hearth needs open sky, not a roof or enclosure.';
  const near = w.objects.find(
    (o) => o.id !== self && v7ShapeDistance(spatial, o.spatial) - 0.45 < CLEAR,
  );
  if (near)
    return `${near.name} stands within 0.7 m of the bed; vegetation and objects must be clear.`;
  if (
    w.stacks.some(
      (s) => s.owner === null && v7ShapeDistance(s.position, spatial) < CLEAR,
    )
  )
    return 'Loose material lies within 0.7 m of the bed.';
  if (
    w.actors.some(
      (p) =>
        p.vitals.health > 0 &&
        v7Distance(p.position, spatial) < p.radius + CLEAR,
    )
  )
    return 'People, including you, must stand at least 0.7 m from the bed centre.';
  return null;
}

/** The exact visible prepared hearth within reach. */
function target(c: V7ActionContext, prepared = true): V7Object {
  const id = v7String(c.action.args.target, 'target');
  const o = c.world.objects.find((x) => x.id === id && isHearth(x));
  if (!o)
    throw new Error(
      'Target an open hearth of this operation. Nothing was spent.',
    );
  if (!v7Reach(c.actor, o.spatial))
    throw new Error('Move within reach of the hearth. Nothing was spent.');
  if (prepared && !hearthOf(o).prepared)
    throw new Error('The hearth is not cleared yet. Nothing was spent.');
  return o;
}

function pause(
  c: V7ActionContext,
  j: CollectiveWork,
  o: V7Object | undefined,
  reason: string,
): V7HandlerResult {
  j.status = 'paused';
  j.reason = reason;
  if (o) refresh(c.world, o);
  c.emit(
    'hearth-work-paused',
    `${reason} The work and any reserved pieces are kept; nothing was spent this round.`,
    summary(c.world, o, j),
    o?.id ?? j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id] };
}

/** Writes drill wear onto the released pieces; the drill dust stays at the hearth. */
function wearOut(w: V7World, j: CollectiveWork, o: V7Object | undefined) {
  const d = drillOf(j);
  j.escrow.forEach((id, i) => {
    const s = w.stacks.find((x) => x.id === id);
    if (!s) return;
    const old = wear(s);
    s.processing = {
      ...s.processing,
      frictionWear: {
        role: i === 0 ? 'board' : 'spindle',
        socket: i === 0 ? round(d.socket) : 0,
        worn: round(
          Number(old?.worn ?? 0) + (i === 0 ? d.boardWear : d.spindleWear),
        ),
        attempts: Number(old?.attempts ?? 0) + 1,
      },
    };
  });
  if (o) {
    const h = hearthOf(o);
    h.residue += d.dust;
    history(h, w.tick, {
      type: 'drill-dust',
      mass: round(d.dust),
      charred: d.charred > 0,
    });
  }
  d.dust = 0;
}

/** Ends unfinished personal work once: reserved pieces return (or drop where the person died),
 * an uncleared site is abandoned, spent effort is never refunded. */
function settle(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  reason: string,
  ground = false,
) {
  const o = w.objects.find((x) => x.id === j.target && isHearth(x));
  j.x = a.position.x;
  j.y = a.position.y;
  workStop(w, a, j, reason, ground);
  if (j.mode === 'ignite') wearOut(w, j, o);
  if (o && j.mode === 'prepare-hearth' && !hearthOf(o).prepared)
    w.objects = w.objects.filter((x) => x.id !== o.id);
  else if (o) refresh(w, o);
  sync(a, j);
  return o;
}

function newHearth(a: V7Actor, air: number): Hearth {
  return {
    version: 1,
    builder: a.id,
    prepared: false,
    preparedAt: null,
    lit: false,
    litAt: null,
    embers: 0,
    burnFraction: 0,
    lots: [],
    burned: 0,
    ash: 0,
    released: 0,
    residue: 0,
    bed: air,
    lastTick: -1,
    heat: {
      released: 0,
      food: 0,
      surroundings: 0,
      foodLoss: 0,
      evaporation: 0,
      vented: 0,
    },
    food: [],
    ignitions: 0,
    smothered: 0,
    failures: 0,
    history: [],
  };
}

function preparing(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const o = c.world.objects.find((x) => x.id === j.target && isHearth(x));
  if (!o) throw new Error('The hearth site no longer exists.');
  const blocked = siteError(c.world, c.actor, o.spatial, o.id);
  if (blocked) return pause(c, j, o, blocked);
  if (c.actor.vitals.energy < 1)
    return pause(c, j, o, 'Not enough energy for the next round of clearing.');
  const resumed = j.status === 'paused';
  if (!workPay(c, j, 1))
    throw new Error('Energy changed before the paid round.');
  c.actor.vitals.energy = round(Math.max(0, c.actor.vitals.energy));
  if (resumed)
    c.emit(
      'hearth-work-resumed',
      'Unfinished clearing resumed after rechecking reach, ground and clearance.',
      summary(c.world, o, j),
      o.id,
    );
  const h = hearthOf(o);
  if (j.remainingWork === 0) {
    h.prepared = true;
    h.preparedAt = c.world.tick;
    h.bed = weather(c.world, o.spatial).temperature;
    j.status = 'completed';
    j.outputs = [o.id];
  }
  refresh(c.world, o);
  c.emit(
    h.prepared ? 'hearth-prepared' : 'hearth-work-progress',
    h.prepared
      ? 'Litter and loose matter were scraped aside to bare soil in a 0.45 m bed; no stock was made and no fire exists.'
      : 'One round of clearing the bed by hand was paid.',
    summary(c.world, o, j),
    o.id,
  );
  sync(c.actor, j);
  return {
    complete: j.remainingWork === 0,
    remaining: j.remainingWork,
    writes: [j.id, o.id],
  };
}

function prepare(c: V7ActionContext): V7HandlerResult {
  const existing = workFind(c);
  if (existing && open(existing)) {
    if (existing.mode !== 'prepare-hearth')
      throw new Error(
        'Continue or cancel your unfinished friction work first. Nothing was spent.',
      );
    return preparing(c, existing);
  }
  if (c.operation?.first === false)
    throw new Error('The bound hearth clearing is already settled.');
  const spatial = hearthSpatial(
    v7Number(c.action.args.x, 'hearth x'),
    v7Number(c.action.args.y, 'hearth y'),
  );
  const error = siteError(c.world, c.actor, spatial);
  if (error) throw new Error(`${error} Nothing was spent.`);
  if (c.actor.vitals.energy < 1)
    throw new Error(
      '1 energy is required for the first round. Nothing was spent.',
    );
  const j = workCreate(c, 'prepare-hearth', PREPARE_ROUNDS);
  const o: V7Object = {
    id: v7Id(c.world, 'hearth'),
    kind: KIND,
    name: 'Open hearth',
    spatial,
    visual: {
      component: KIND,
      color: '#6f6350',
      accent: '#c9b48a',
      label: LABELS.unprepared ?? 'Open hearth',
      state: 'unprepared',
    },
    data: { hearth: newHearth(c.actor, weather(c.world, spatial).temperature) },
    // Observers see only the public mode and progress; the physical record stays hidden.
    createdBy: null,
    createdAt: c.world.tick,
    revision: REVISION,
  };
  j.target = o.id;
  c.world.objects.push(o);
  return preparing(c, j);
}

/** Pieces that can physically serve: a soft wood board and a harder wood spindle, both whole,
 * owned and no wetter than 0.35. */
function piecesError(
  w: V7World,
  board: V7Stack,
  spindle: V7Stack,
): string | null {
  if (!woody(w, board.resource) || hardness(w, board.resource) > 3)
    return 'The board must be a whole unit of soft deadwood (hardness of a fallen branch or willow).';
  if (
    !woody(w, spindle.resource) ||
    hardness(w, spindle.resource) <= hardness(w, board.resource)
  )
    return 'The spindle must be a whole unit of a wood harder than the board.';
  for (const [name, s] of [
    ['board', board],
    ['spindle', spindle],
  ] as const)
    if (moisture(w, s) > BURN.moisture)
      return `The ${name} is wet (moisture ${String(round(moisture(w, s)))} above 0.35); its heat goes into water and no ember can form.`;
  return null;
}
/** Tinder and kindling loaded on the bed (local-fire@1 ignition requirement). */
function fuelError(h: Hearth, stage = 'friction'): string | null {
  // After the ember transfer the bundle only needs the tinder that first tending burns.
  const tinder = stage === 'tinder' ? DRILL.tinderBurn : BURN.tinder;
  if (
    fuelOf(h, 'dry-grass') + 1e-8 < tinder ||
    fuelOf(h, 'branch') + 1e-8 < BURN.kindling
  )
    return 'Load at least 0.5 dry grass tinder and 0.5 branch kindling on the bed with tend first; an ember needs a ready bundle.';
  if (h.lots.some((l) => l.moisture > BURN.moisture))
    return 'Loaded fuel is wetter than 0.35 moisture.';
  return null;
}
function weatherError(c: Weather): string | null {
  return c.rain > BURN.rain
    ? 'Rain above 0.15 wets the dust and tinder.'
    : c.wind > BURN.wind
      ? 'Wind above 0.65 scatters the dust and tinder.'
      : null;
}
/** Burns tinder from the loaded dry grass; its small flame heat is lost to the surroundings. */
function burnTinder(h: Hearth, quantity: number) {
  let left = quantity,
    mass = 0;
  for (const l of h.lots.filter((l) => l.resource === 'dry-grass')) {
    const used = Math.min(left, l.quantity);
    l.quantity -= used;
    left -= used;
    mass += used * l.mass;
    const joules = used * l.energy * (1 - l.moisture) * HEAT.fuelJoules;
    h.heat.released += joules;
    h.heat.surroundings += joules;
    if (left <= 1e-8) break;
  }
  h.lots = h.lots.filter((l) => l.quantity > 1e-8);
  h.burned += mass;
  h.ash += mass * BURN.ash;
  h.released += mass * (1 - BURN.ash);
  return mass;
}
function obstacle(d: Drill, m: number, c: Weather): string {
  const parts = [
    `drill dust peaked near ${String(Math.round(d.peak))} C, below the 350 C ember temperature`,
  ];
  if (m > 0) parts.push(`the pieces hold moisture ${String(round(m))}`);
  if (c.wind > 0.3) parts.push(`wind ${String(round(c.wind))} cools the dust`);
  if (c.temperature < 10) parts.push('the air is cold');
  return `${parts.join('; ')}.`;
}

function failDrill(
  c: V7ActionContext,
  j: CollectiveWork,
  o: V7Object | undefined,
  reason: string,
): V7HandlerResult {
  if (o) hearthOf(o).failures += 1;
  const d = v7Clone(drillOf(j));
  settle(c.world, c.actor, j, reason);
  c.emit(
    'friction-ignition-failed',
    `${reason} The pieces return worn; any charred dust stays at the hearth; no fire exists. Spent energy is not refunded.`,
    { ...summary(c.world, o, j), drill: d },
    o?.id ?? j.id,
  );
  return { complete: true, writes: [j.id, ...j.escrow] };
}

function drilling(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const o = c.world.objects.find((x) => x.id === j.target && isHearth(x));
  if (!o) return failDrill(c, j, undefined, 'The hearth is gone.');
  const h = hearthOf(o),
    d = drillOf(j);
  const pieces = j.escrow.map((id) =>
    c.world.stacks.find((s) => s.id === id && s.reservedFor === j.id),
  );
  const [board, spindle] = pieces;
  if (!board || !spindle)
    return failDrill(c, j, o, 'A reserved drill piece is gone.');
  if (h.lit) {
    settle(
      c.world,
      c.actor,
      j,
      'The hearth is already burning; drilling ended.',
    );
    c.emit(
      'hearth-work-cancelled',
      'Drilling ended because the hearth is already burning; the pieces were returned.',
      summary(c.world, o, j),
      o.id,
    );
    return { complete: true, writes: [j.id, o.id] };
  }
  if (!v7Reach(c.actor, o.spatial))
    return pause(c, j, o, 'Return within reach of the hearth.');
  const wx = weather(c.world, o.spatial);
  const blocked =
    weatherError(wx) ??
    fuelError(h, d.stage) ??
    (d.stage === 'friction' ? piecesError(c.world, board, spindle) : null);
  if (blocked) return pause(c, j, o, blocked);
  const cost = d.stage === 'friction' ? DRILL.energy : DRILL.stage;
  if (c.actor.vitals.energy < cost)
    return pause(c, j, o, 'Not enough energy for the next round.');
  const resumed = j.status === 'paused';
  if (!workPay(c, j, cost))
    throw new Error('Energy changed before the paid round.');
  c.actor.vitals.energy = round(Math.max(0, c.actor.vitals.energy));
  j.paidEnergy = round(j.paidEnergy);
  if (resumed)
    c.emit(
      'hearth-work-resumed',
      'Unfinished friction work resumed after rechecking reach, pieces, fuel and weather.',
      summary(c.world, o, j),
      o.id,
    );
  if (d.stage === 'friction') {
    const m = Math.max(moisture(c.world, board), moisture(c.world, spindle));
    const r = drillRound(d, m, wx);
    if (r.ember) {
      d.stage = 'ember';
      d.embers += 1;
      j.remainingWork = 2;
      refresh(c.world, o);
      c.emit(
        'friction-ember-formed',
        'Hot drill dust in the socket began to glow: an ember formed. Transfer it into the tinder next round or it dies.',
        summary(c.world, o, j),
        o.id,
      );
    } else if (d.rounds >= DRILL.rounds)
      return failDrill(
        c,
        j,
        o,
        `No ember formed in ${String(DRILL.rounds)} drilling rounds: ${obstacle(d, m, wx)}`,
      );
    else {
      j.remainingWork = DRILL.rounds - d.rounds;
      refresh(c.world, o);
      c.emit(
        'friction-progress',
        r.smoke
          ? 'One drilling round: the socket wore deeper and the dust smoked, but no ember formed.'
          : 'One drilling round: the socket wore deeper and dust collected without smoke.',
        { ...summary(c.world, o, j), smoke: r.smoke },
        o.id,
      );
    }
  } else if (d.stage === 'ember') {
    const ember = d.dust;
    h.burned += ember;
    h.ash += ember * BURN.ash;
    h.released += ember * (1 - BURN.ash);
    d.dust = 0;
    const tinder = burnTinder(h, DRILL.tinderBurn);
    d.stage = 'tinder';
    history(h, c.world.tick, {
      type: 'ember-transfer',
      ember: round(ember),
      tinder: round(tinder),
    });
    refresh(c.world, o);
    c.emit(
      'hearth-ember-transferred',
      'The ember was tipped into the tinder bundle on the bed and blown into a small flame.',
      {
        ...summary(c.world, o, j),
        tinderBurned: round(tinder),
        emberMass: round(ember),
      },
      o.id,
    );
  } else {
    const tinder = burnTinder(h, DRILL.tinderBurn);
    h.lit = true;
    h.embers = BURN.embers;
    h.litAt = c.world.tick;
    h.ignitions += 1;
    j.status = 'completed';
    j.outputs = [o.id];
    for (const s of [board, spindle]) {
      delete s.reservedFor;
      s.position = { ...c.actor.position };
    }
    wearOut(c.world, j, o);
    history(h, c.world.tick, { type: 'ignited', tinder: round(tinder) });
    refresh(c.world, o);
    c.emit(
      'hearth-ignited',
      'First tending caught the branch kindling: the hearth is burning on its loaded fuel only. The drill pieces were returned worn.',
      { ...summary(c.world, o, j), tinderBurned: round(tinder) },
      o.id,
    );
  }
  sync(c.actor, j);
  const done = j.status === 'completed';
  return {
    complete: done,
    remaining: done ? 0 : j.remainingWork,
    writes: [j.id, o.id, ...j.escrow],
  };
}

function ignite(c: V7ActionContext): V7HandlerResult {
  const existing = workFind(c);
  if (existing && open(existing)) {
    if (existing.mode !== 'ignite')
      throw new Error(
        'Continue or cancel your unfinished hearth clearing first. Nothing was spent.',
      );
    return drilling(c, existing);
  }
  if (c.operation?.first === false)
    throw new Error('The bound friction work is already settled.');
  const o = target(c),
    h = hearthOf(o);
  if (h.lit)
    throw new Error('This hearth is already burning. Nothing was spent.');
  if (
    typeof c.action.args.board !== 'string' ||
    !c.action.args.board ||
    typeof c.action.args.spindle !== 'string' ||
    !c.action.args.spindle
  )
    throw new Error(
      'Name an owned board and spindle to start drilling. Nothing was spent.',
    );
  const pieces = workAllocations(c, [
    { itemId: c.action.args.board, quantity: 1 },
    { itemId: c.action.args.spindle, quantity: 1 },
  ]);
  const [board, spindle] = pieces.map((p) => p.stack);
  if (!board || !spindle) throw new Error('Two owned pieces are required.');
  const blocked =
    piecesError(c.world, board, spindle) ??
    fuelError(h) ??
    weatherError(weather(c.world, o.spatial));
  if (blocked) throw new Error(`${blocked} Nothing was spent.`);
  if (c.actor.vitals.energy < DRILL.energy)
    throw new Error(
      '1.5 energy is required for a drilling round. Nothing was spent.',
    );
  const j = workCreate(c, 'ignite', DRILL.rounds);
  j.target = o.id;
  const drill: Drill = {
    stage: 'friction',
    rounds: 0,
    streak: 0,
    socket: Number(wear(board)?.socket ?? 0),
    dust: 0,
    last: 0,
    peak: 0,
    boardWear: 0,
    spindleWear: 0,
    charred: 0,
    embers: 0,
  };
  j.drill = drill;
  workReserve(c, j, pieces);
  return drilling(c, j);
}

function tend(c: V7ActionContext): V7HandlerResult {
  const o = target(c),
    h = hearthOf(o);
  const turn = c.action.args.turn === true;
  const feeding = c.action.args.inputs !== undefined;
  if (!turn && !feeding)
    throw new Error(
      'Tend feeds fuel (inputs) or turns your food (turn: true). Nothing was spent.',
    );
  const allocations = feeding ? workAllocations(c, c.action.args.inputs) : [];
  const lots: FuelLot[] = allocations.map(({ stack, quantity }) => {
    const r = resource(c.world, stack.resource);
    if (
      !r?.properties ||
      r.properties.fuel <= 0 ||
      !forestFireFuel(c.world, stack.resource)
    )
      throw new Error(
        'Only branch, bark or dry grass can be fed to the bed. Nothing was spent.',
      );
    return {
      item: stack.id,
      resource: stack.resource,
      quantity,
      mass: unitMass(c.world, stack),
      energy: r.properties.fuel,
      moisture: moisture(c.world, stack),
    };
  });
  if (
    [...h.lots, ...lots].reduce((n, l) => n + l.quantity * l.mass, 0) >
    BURN.capacity + 1e-8
  )
    throw new Error(
      'The bed holds at most 8 mass units of fuel. Nothing was spent.',
    );
  const food = turn ? h.food.find((l) => l.cook === c.actor.id) : undefined;
  if (turn) {
    if (!food?.onBed)
      throw new Error(
        'You have no food lying on this bed to turn. Nothing was spent.',
      );
    const branches = allocations
      .filter((a) => a.stack.resource === 'branch')
      .reduce((n, a) => n + a.quantity, 0);
    if (h.bed > HEAT.handBed && !stick(c, branches))
      throw new Error(
        'The bed is too hot to turn food by hand; keep an owned whole branch as a stick. Nothing was spent.',
      );
  }
  v7Spend(c.actor, 0.5);
  for (const { stack, quantity } of allocations)
    foodSetQuantity(stack, foodTenths(stack.quantity) - foodTenths(quantity));
  if (lots.length) {
    h.lots.push(...lots);
    history(h, c.world.tick, {
      type: 'fed',
      actor: c.actor.id,
      lots: v7Json(lots),
    });
  }
  if (food) {
    food.down = 1 - food.down;
    food.turned += 1;
  }
  refresh(c.world, o);
  if (lots.length)
    c.emit(
      'hearth-fed',
      'Real fuel was moved from your inventory onto the bed; it burns only if the hearth is lit.',
      { ...summary(c.world, o), lots: v7Json(lots), energy: 0.5 },
      o.id,
    );
  if (food)
    c.emit(
      'hearth-food-turned',
      'Your food was turned on the bed; the other face now lies on the heat.',
      {
        ...summary(c.world, o),
        stack: food.stack,
        turned: food.turned,
        energy: 0.5,
      },
      o.id,
    );
  return {
    complete: true,
    writes: [o.id, ...allocations.map((a) => a.stack.id)],
  };
}

/** Food whose water composition is represented, whole, unspoiled and not combined. */
function foodError(w: V7World, s: V7Stack): string | null {
  const r = resource(w, s.resource);
  if (!r || r.nutrition <= 0) return 'Only actual food can be cooked.';
  if (s.componentLots)
    return 'Combined food has no single thermal representation.';
  if ((s.decay ?? 0) >= (r.properties?.decay ?? Infinity))
    return 'Spoiled food cannot be cooked.';
  if (!foodWaterActive(w))
    return 'This world has no food water representation.';
  if (!s.physical && !['berry', 'root'].includes(s.resource))
    return 'This world represents water composition only for berries and roots; none is invented.';
  return null;
}

function cook(c: V7ActionContext): V7HandlerResult {
  const o = target(c),
    h = hearthOf(o);
  if (h.food.length)
    throw new Error(
      'The bed already holds a food portion; one portion lies on a hearth at a time. Nothing was spent.',
    );
  const allocations = workAllocations(c, c.action.args.inputs);
  const choice = allocations[0];
  if (allocations.length !== 1 || !choice)
    throw new Error('Cook one owned food stack at a time. Nothing was spent.');
  const { stack, quantity } = choice;
  if (foodTenths(quantity) !== 10)
    throw new Error(
      'A trial roasts exactly one whole unit: the existing eat path consumes whole units. Nothing was spent.',
    );
  const error = foodError(c.world, stack);
  if (error) throw new Error(`${error} Nothing was spent.`);
  if (h.bed > HEAT.handBed && !stick(c))
    throw new Error(
      'The bed is too hot to place food by hand; keep an owned whole branch as a stick. Nothing was spent.',
    );
  v7Spend(c.actor, 0.5);
  const tenths = foodTenths(quantity);
  const part: V7Stack = {
    ...materialPortion(stack, tenths),
    id: v7Id(c.world, 'item'),
    quantity: tenths / 10,
    quantityTenths: tenths,
    owner: null,
    reservedFor: o.id,
    position: { x: o.spatial.x, y: o.spatial.y },
  };
  foodSetQuantity(stack, foodTenths(stack.quantity) - tenths);
  c.world.stacks.push(part);
  foodWaterInitialize(c.world, part);
  const p = part.physical;
  if (!p) throw new Error('Missing food composition.');
  const prior = part.processing?.hearthPreparation;
  // Earlier heating carries its exposure and its pre-heating solids reference.
  const before =
    prior && typeof prior === 'object' && !Array.isArray(prior)
      ? {
          exposure: Number(prior.exposureSeconds ?? 0),
          originalSolids: Number(prior.originalUnitSolids ?? 0) * part.quantity,
        }
      : null;
  const lot = foodLot(
    {
      stack: part.id,
      cook: c.actor.id,
      resource: part.resource,
      quantity: part.quantity,
      source: stack.id,
      origin: stack.origin,
    },
    p.unitWater * part.quantity,
    p.unitSolids * part.quantity,
    weather(c.world, o.spatial).temperature,
    c.world.tick,
    before,
  );
  h.food.push(lot);
  history(h, c.world.tick, {
    type: 'food-placed',
    actor: c.actor.id,
    stack: part.id,
    quantity: part.quantity,
  });
  refresh(c.world, o);
  c.emit(
    'hearth-food-placed',
    'Your food was laid on the bed, supported by the hearth surface; it heats only from actual bed heat and keeps ageing. Nothing is guaranteed.',
    {
      ...summary(c.world, o),
      stack: part.id,
      source: stack.id,
      quantity: part.quantity,
      water: round(lot.initialWater),
      solids: round(lot.initialSolids),
      energy: 0.5,
    },
    o.id,
  );
  return { complete: true, writes: [o.id, stack.id, part.id] };
}

function retrieve(c: V7ActionContext): V7HandlerResult {
  const o = target(c),
    h = hearthOf(o);
  const lot = h.food.find((l) => l.cook === c.actor.id);
  const stack = lot && c.world.stacks.find((s) => s.id === lot.stack);
  if (!lot || !stack)
    throw new Error('You have no food on this hearth. Nothing was spent.');
  const surface = foodSurface(lot);
  if (surface > HEAT.handFood || (lot.onBed && h.bed > HEAT.handBed)) {
    if (!lot.onBed)
      throw new Error(
        `Your food is still too hot to hold (${look(lot)
          .map((f) => f.feel)
          .join(', ')}); let it cool. Nothing was spent.`,
      );
    if (!stick(c))
      throw new Error(
        'The food or bed is too hot to handle by hand; keep an owned whole branch as a stick to rake it aside. Nothing was spent.',
      );
    v7Spend(c.actor, 0.5);
    lot.onBed = false;
    history(h, c.world.tick, {
      type: 'raked-aside',
      actor: c.actor.id,
      stack: lot.stack,
    });
    refresh(c.world, o);
    c.emit(
      'hearth-food-raked',
      'Your food was raked off the bed with a stick onto the cool rim, where it now cools in air.',
      { ...summary(c.world, o), stack: lot.stack, energy: 0.5 },
      o.id,
    );
    return { complete: true, writes: [o.id] };
  }
  v7Spend(c.actor, 0.5);
  const y = foodYield(lot);
  h.food = h.food.filter((l) => l !== lot);
  h.residue += y.char;
  const base = resource(c.world, stack.resource)?.nutrition ?? 0;
  const record = {
    version: 1,
    state: lot.state,
    criterion:
      'core at least 85 C for 10 minutes (model exposure, not a safety or nutrition test)',
    exposureSeconds: round(lot.exposure),
    hearth: o.id,
    source: lot.source,
    placedAt: lot.placedAt,
    retrievedAt: c.world.tick,
    turned: lot.turned,
    evaporated: round(lot.evaporated),
    charDiscarded: round(y.char),
    gases: round(lot.gases),
    burntSolidsShare: round(y.burnt),
    originalUnitSolids: round(lot.originalSolids / lot.quantity),
    // Never above the original nutrition per unit: reduced by burnt solids only.
    nutritionPerUnit: Math.min(base, Math.floor(base * y.share * 1e6) / 1e6),
  };
  // The same traceable unit leaves the hearth; destroyed food stays as residue.
  let output: V7Stack | null = null;
  if (lot.state !== 'destroyed') {
    output = stack;
    delete output.reservedFor;
    output.owner = c.actor.id;
    output.position = { ...c.actor.position };
    output.physical = {
      unitMass: round(y.water + y.solids),
      unitWater: round(y.water),
      unitSolids: round(y.solids),
    };
    output.processing = { ...stack.processing, hearthPreparation: record };
  } else {
    c.world.stacks = c.world.stacks.filter((s) => s.id !== stack.id);
    h.residue += y.solids + y.water;
  }
  history(h, c.world.tick, {
    type: 'food-retrieved',
    actor: c.actor.id,
    output: output?.id ?? null,
    state: lot.state,
  });
  refresh(c.world, o);
  c.emit(
    'hearth-food-retrieved',
    output
      ? `Retrieved your ${stack.resource} (${lot.state}); char was scraped off onto the hearth. It eats through eat as one unit at ${String(round(record.nutritionPerUnit))} nutrition (original times remaining solids), keeps its age and spoils as before.`
      : 'Nothing edible remained; the destroyed food was left on the hearth as residue.',
    {
      ...summary(c.world, o),
      output: output?.id ?? null,
      quantity: output?.quantity ?? 0,
      record,
      energy: 0.5,
    },
    output?.id ?? o.id,
  );
  return {
    complete: true,
    writes: [o.id, stack.id],
  };
}

function extinguish(c: V7ActionContext): V7HandlerResult {
  const o = target(c),
    h = hearthOf(o);
  if (!h.lit)
    throw new Error(
      'The hearth is not burning; there is nothing to smother. Nothing was spent.',
    );
  v7Spend(c.actor, 0.5);
  h.lit = false;
  h.embers = 0;
  h.burnFraction = 0;
  h.smothered += 1;
  history(h, c.world.tick, { type: 'smothered', actor: c.actor.id });
  refresh(c.world, o);
  c.emit(
    'hearth-extinguished',
    'The fire was smothered with the soil scraped aside when the bed was cleared; unburned fuel stays, and the bed keeps its stored heat as it cools.',
    {
      ...summary(c.world, o),
      reason: 'smothered',
      remainingFuel: v7Json(h.lots),
      energy: 0.5,
    },
    o.id,
  );
  return { complete: true, writes: [o.id] };
}

function inspectItems(c: V7ActionContext): V7HandlerResult {
  const allocations = workAllocations(c, c.action.args.inputs);
  if (allocations.length > 4)
    throw new Error('Inspect at most four items at a time. Nothing was spent.');
  v7Spend(c.actor, 0.2);
  const findings = allocations.map(({ stack: s }) => {
    const m = tracked(c.world, s.resource) ? round(moisture(c.world, s)) : null;
    const food = foodError(c.world, s);
    const value = {
      item: s.id,
      resource: s.resource,
      quantity: s.quantity,
      moisture: m,
      wetness: m === null ? null : wetness(m),
      fuel: forestFireFuel(c.world, s.resource),
      tinder: s.resource === 'dry-grass',
      wood: woody(c.world, s.resource)
        ? hardness(c.world, s.resource) <= 3
          ? 'soft: can serve as a board'
          : 'hard: can serve as a spindle on a softer board'
        : null,
      wear: wear(s) ? v7Json(wear(s)) : null,
      cookable: food === null,
      reason: food,
    };
    openRemember(c, {
      key: `${s.id}:thermal-material`,
      subject: s.resource,
      property: 'hearth material check',
      value,
      method: 'handling and touch',
      condition: openConditions(c.world, c.actor.position).regime,
      verified: false,
    });
    return value;
  });
  c.emit(
    'hearth-inspected',
    'Your items were handled and checked by touch; only perceivable condition was recorded.',
    { scope: 'items', findings, energy: 0.2, tick: c.world.tick },
  );
  return { complete: true, writes: [] };
}

function inspectHearth(c: V7ActionContext): V7HandlerResult {
  const o = target(c, false),
    h = hearthOf(o);
  v7Spend(c.actor, 0.2);
  const wx = weather(c.world, o.spatial);
  const own = h.food.find((l) => l.cook === c.actor.id);
  const j = friction(c.world, o);
  const estimate = own && h.prepared ? heatEstimate(h, own.stack, wx) : null;
  const value = {
    state: hearthState(c.world, o),
    prepared: h.prepared,
    flame: hearthState(c.world, o) === 'burning',
    smoke: h.burnFraction > 0,
    bed: bedFeel(h, wx.temperature),
    fuel: h.lots.map((l) => ({
      resource: l.resource,
      quantity: round(l.quantity),
      wetness: wetness(l.moisture),
    })),
    ash: round(h.ash),
    residue: round(h.residue),
    weather: { rain: round(wx.rain), wind: round(wx.wind) },
    friction:
      j?.owner === c.actor.id
        ? {
            stage: drillOf(j).stage,
            rounds: drillOf(j).rounds,
            dust:
              drillOf(j).last >= DRILL.smoke
                ? 'smoking dark dust'
                : 'pale dust',
          }
        : null,
    food: own
      ? {
          state: foodView(own),
          onBed: own.onBed,
          faces: look(own),
          core: 'not measured',
          estimate: estimate
            ? {
                roundsToCookedCriterion: estimate.rounds,
                fuelUnitsBurned: round(estimate.fuel),
                outcome: estimate.outcome,
                basis:
                  'model estimate from the loaded fuel and current weather, without new fuel or turning',
              }
            : null,
        }
      : null,
  };
  openRemember(c, {
    key: `${o.id}:hearth-inspection`,
    subject: o.id,
    property: 'hearth and food condition',
    value,
    method: 'direct observation at the hearth',
    condition: openConditions(c.world, o.spatial).regime,
    verified: false,
  });
  c.emit(
    'hearth-inspected',
    'The hearth was observed; only perceivable fire, fuel and food condition and a model estimate were recorded.',
    {
      ...summary(c.world, o),
      scope: 'hearth',
      observation: value,
      energy: 0.2,
    },
    o.id,
  );
  return { complete: true, writes: [o.id] };
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c);
  if (!j || !open(j))
    throw new Error(
      'No unfinished hearth clearing or friction work to cancel. Nothing was spent.',
    );
  const o = settle(
    c.world,
    c.actor,
    j,
    'Cancelled; reserved pieces return once in their current condition. Spent energy and burned tinder are not refunded.',
  );
  c.emit(
    'hearth-work-cancelled',
    'Unfinished work was cancelled; only unconsumed reserved pieces were returned.',
    summary(c.world, o, j),
    o?.id ?? j.id,
  );
  return { complete: true, writes: [j.id, ...j.escrow] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'prepare-hearth') return prepare(c);
  if (mode === 'ignite') return ignite(c);
  if (mode === 'tend') return tend(c);
  if (mode === 'cook') return cook(c);
  if (mode === 'retrieve') return retrieve(c);
  if (mode === 'extinguish') return extinguish(c);
  if (mode === 'cancel') return cancel(c);
  if (mode === 'inspect')
    return c.action.args.inputs !== undefined
      ? inspectItems(c)
      : inspectHearth(c);
  throw new Error('Unknown thermal preparation mode.');
}

/** Ordinary simulation: material moisture, unworked pauses, dying embers and the actual fire,
 * bed and food heat of every hearth. */
function environment(w: V7World) {
  for (const s of w.stacks.filter((s) => tracked(w, s.resource))) {
    const c = forestClimate(w, holder(w, s)),
      rain = c.rain ?? 0;
    s.fuelMoisture = round(
      Math.max(
        0,
        Math.min(
          1,
          (s.fuelMoisture ?? rain) +
            (rain > 0 && !c.indoor
              ? BURN.wetting * rain
              : -BURN.drying * (1 + (c.wind ?? 0))),
        ),
      ),
    );
  }
  for (const j of collectiveJobs(w, ID).filter(open)) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a) continue;
    for (const id of j.escrow) {
      const s = w.stacks.find((s) => s.id === id && s.reservedFor === j.id);
      if (s) s.position = { ...a.position };
    }
    const o = w.objects.find((x) => x.id === j.target && isHearth(x));
    if (j.status === 'active' && j.lastPaid < w.tick) {
      j.status = 'paused';
      j.reason =
        'Not worked this round; the work and reserved pieces are kept.';
      const d = j.mode === 'ignite' ? drillOf(j) : null;
      const died = !!d && d.stage !== 'friction';
      if (d) {
        d.streak = 0;
        if (died) {
          d.stage = 'friction';
          d.dust = 0;
          j.remainingWork = Math.max(0, DRILL.rounds - d.rounds);
        }
      }
      forestEvent(
        w,
        died ? 'friction-ember-died' : 'hearth-work-paused',
        died
          ? 'The ember was not worked this round and died; drilling must start a new ember.'
          : 'Work paused because it was not worked this round; drill heat is lost as the socket cools.',
        a.position,
        a.id,
        summary(w, o, j),
        o?.id ?? j.id,
      );
      if (d && j.remainingWork === 0) {
        if (o) hearthOf(o).failures += 1;
        settle(w, a, j, 'No drilling rounds remain after the ember died.');
        forestEvent(
          w,
          'friction-ignition-failed',
          'The attempt ended without fire; the pieces returned worn.',
          a.position,
          a.id,
          summary(w, o, j),
          o?.id ?? j.id,
        );
      }
    }
    sync(a, j);
  }
  for (const o of w.objects.filter(isHearth)) {
    const h = hearthOf(o);
    if (!h.prepared || h.lastTick === w.tick) {
      refresh(w, o);
      continue;
    }
    h.lastTick = w.tick;
    const c = weather(w, o.spatial);
    for (const l of h.food.filter(
      (l) => !w.stacks.some((s) => s.id === l.stack),
    ))
      forestEvent(
        w,
        'hearth-food-changed',
        'The food on the hearth spoiled under the existing ageing rule and is gone.',
        o.spatial,
        null,
        { hearth: o.id, stack: l.stack, cook: l.cook, state: 'spoiled' },
        o.id,
      );
    h.food = h.food.filter((l) => w.stacks.some((s) => s.id === l.stack));
    if (h.lit) {
      const caught = w.stacks.filter(
        (s) =>
          s.owner === null &&
          !s.reservedFor &&
          forestFireFuel(w, s.resource) &&
          v7ShapeDistance(s.position, o.spatial) <= RIM,
      );
      for (const s of caught)
        h.lots.push({
          item: s.id,
          resource: s.resource,
          quantity: s.quantity,
          mass: unitMass(w, s),
          energy: resource(w, s.resource)?.properties?.fuel ?? 0,
          moisture: moisture(w, s),
        });
      if (caught.length) {
        w.stacks = w.stacks.filter((s) => !caught.includes(s));
        forestEvent(
          w,
          'hearth-material-caught',
          'Loose fuel lying on the rim of the burning bed caught fire and joined it.',
          o.spatial,
          null,
          { hearth: o.id, items: caught.map((s) => s.id) },
          o.id,
        );
      }
    }
    const before = h.food.map((l) => l.state);
    const burn = burnRound(h, c);
    heatRound(h, c.temperature, burn.joules);
    for (const l of h.food) {
      const s = w.stacks.find((s) => s.id === l.stack);
      if (!s?.physical) continue;
      const water = l.nodes.reduce((n, x) => n + x.water, 0),
        solids = l.nodes.reduce((n, x) => n + x.solids + x.char, 0);
      s.physical = {
        unitMass: round((water + solids) / s.quantity),
        unitWater: round(water / s.quantity),
        unitSolids: round(solids / s.quantity),
      };
    }
    if (burn.consumed.length)
      forestEvent(
        w,
        'hearth-fuel-burned',
        'The hearth burned real loaded fuel: 10% stays as ash, the rest leaves as smoke and gases.',
        o.spatial,
        null,
        {
          hearth: o.id,
          consumed: burn.consumed,
          burnFraction: round(h.burnFraction),
          ash: round(h.ash),
          released: round(h.released),
          remainingEnergy: round(
            h.lots.reduce((n, l) => n + l.quantity * l.energy, 0),
          ),
        },
        o.id,
      );
    if (burn.doused || burn.exhausted)
      forestEvent(
        w,
        'hearth-extinguished',
        burn.doused
          ? 'Heavy rain put the fire out.'
          : 'No fuel burned for three rounds; the embers died.',
        o.spatial,
        null,
        { hearth: o.id, reason: burn.doused ? 'rain' : 'fuel exhausted' },
        o.id,
      );
    h.food.forEach((l, i) => {
      if (l.state !== before[i])
        forestEvent(
          w,
          'hearth-food-changed',
          `Food on the hearth is now ${l.state} by its modeled heat exposure.`,
          o.spatial,
          null,
          {
            hearth: o.id,
            stack: l.stack,
            cook: l.cook,
            state: l.state,
            before: before[i] ?? null,
          },
          o.id,
        );
    });
    if (burn.joules > 0)
      history(h, w.tick, { type: 'burned', fuel: round(h.burnFraction) });
    refresh(w, o);
  }
}

export const LONG_HEARTH_FOOD_PREPARATION: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex17',
  dependencies: ['foundation-open@1'],
  description:
    'A general heat preparation of owned food: a hand-cleared open hearth, hand-drill friction ignition gated by real pieces, moisture and weather, the local-fire combustion rule, and a lumped bed and food heat model with evaporation, charring and a declared cooked criterion.',
  reuse: {
    experiment:
      'local-fire@1 (hearth footprint and clearance, fuel set, per-unit fuel values, burn, ash, ember, rain and ignition limits and fuel moisture rule, reused as values with local-fire unchanged); ex17 plant-cultivation@1 and ex15 food-preparation@1 (paid-work, escrow and hidden-record patterns)',
    source:
      'forest-fire.ts (hearthSpatial); forest-material-compatibility.ts (fuel set); food-water.ts and open-preservation-physics.ts (version-1 food water composition); forest-environment.ts (unchanged ageing); collective-food-profile.ts (existing per-stack eating-profile hook, read only for this record); collective-work.ts (escrow, paid work, stop); open-foundation.ts (personal records); base gather, pickup, drop and eat unchanged',
    description:
      'Implementation reuse only; no fire, tool, food, skill or mastery is granted. Thermal values, the 18-minute heat time of a round, drill and food heat rules are declared modeling assumptions.',
  },
  abilities: [
    {
      id: ID,
      name: 'Heat-prepare food',
      function:
        'Heat-prepare owned food on an open hearth: clear a bed, light it by hand-drill friction, feed fuel, roast and turn food, inspect, retrieve, smother or cancel.',
      equivalence: 'food:heat-prepare:hearth-drill-roast:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: MODES },
          target: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          inputs: {
            type: 'array',
            items: v7ObjectSchema({
              itemId: { type: 'string' },
              quantity: { type: 'number', minimum: 0.1 },
            }),
          },
          board: { type: 'string' },
          spindle: { type: 'string' },
          turn: { type: 'boolean' },
        }),
        required: ['mode'],
      },
      references: {
        target: 'optional-exact-visible',
        board: 'optional-owned',
        spindle: 'optional-owned',
      },
      prerequisites: [],
      learning: 3,
      costs:
        'Study 3 rounds. Unless stated, a mode takes 1 round. prepare-hearth: x,y in reach on dry open ground 0.7 m clear of objects, loose items and people; 2 paid rounds of 1 energy clear a 0.45 m bed, no stock. tend: inputs owned branch, bark or dry-grass in tenths (bed holds 8 mass) and/or turn:true; 0.5 energy. ignite: unlit hearth loaded with dry-grass 0.5 and branch 0.5; board one owned branch or willow, spindle one owned harder birch or oak; up to 12 drilling rounds of 1.5 energy, then ember transfer and first tending at 0.5 each; repeat ignite to continue. cook: inputs one whole owned root or berry (quantity 1); 0.5 energy. inspect: target, or up to 4 inputs; 0.2 energy. retrieve or extinguish: 0.5 energy. cancel: no energy. Gather and travel cost extra.',
      effects:
        'Fuel and wood moisture starts at current rain, +0.08*rain per rainy round, else -0.01*(1+wind). Drilling wears a socket and makes dust; an ember forms only when 2 g of dust reaches 350 C (20 W drill; wind cools, moisture cuts, none above 0.35; warms with consecutive rounds), else the trial fails after 12 rounds, leaving worn pieces and dust. Drilling and transfer need rain<=0.15, wind<=0.65, fuel moisture<=0.35; an unworked ember dies. A lit fire burns at most 1 fuel unit per round times dryness (10% ash), keeps embers 3 rounds, is doused by rain>0.6 and catches loose fuel on its rim. Heat: 2 MJ per fuel unit, 18 minutes per round (heat only); the bed stores and loses heat; food on it heats from below, loses water at 100 C and chars above 200 C once dry. Cooked: core 85 C for 10 minutes; charred: 20% of solids burnt. Handling on a bed over 60 C or food over 50 C needs an owned branch as a stick; raked-aside food cools. Retrieved food keeps its age and spoilage and eats as one unit at its original nutrition times its unburnt solids share; char stays as residue. No detoxification, preservation, warmth or reward. Inspect records perceivable state and a model estimate, not core temperature.',
      handler: HANDLER,
      revision: REVISION,
      authored: false,
      // The retrieval event carries no qualified flag: cooking earns no milestone.
      practiceEvidence: 'hearth-food-retrieved',
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Paid clearing and drilling rounds; job and reserved pieces persist; an unworked round pauses unpaid; resuming rechecks reach, pieces, fuel and weather. Fire, bed and food change only in actual rounds, also after cancel or death.',
      },
    },
  ],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [KIND],
  events: [
    'hearth-work-progress',
    'hearth-prepared',
    'hearth-work-paused',
    'hearth-work-resumed',
    'hearth-work-cancelled',
    'friction-progress',
    'friction-ember-formed',
    'friction-ember-died',
    'friction-ignition-failed',
    'hearth-ember-transferred',
    'hearth-ignited',
    'hearth-fed',
    'hearth-fuel-burned',
    'hearth-extinguished',
    'hearth-material-caught',
    'hearth-food-placed',
    'hearth-food-turned',
    'hearth-food-changed',
    'hearth-food-raked',
    'hearth-food-retrieved',
    'hearth-inspected',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath(w, a) {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && open(j),
    )) {
      const o = settle(
        w,
        a,
        j,
        'Performer died; reserved pieces were left where they died. Fire and food stay.',
        true,
      );
      forestEvent(
        w,
        'hearth-work-cancelled',
        'Work stopped by death; reserved pieces lie where the person died.',
        a.position,
        a.id,
        summary(w, o, j),
        o?.id ?? j.id,
      );
    }
  },
};
