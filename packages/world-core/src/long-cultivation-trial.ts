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
  v7RoundNumber,
  v7String,
} from './continuous-data.js';
import { v7Distance, v7ShapeDistance } from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { openConditions } from './open-physical.js';
import { longPlantingSite } from './long-planting-site.js';
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
import { OPEN_FOUNDATION, openRemember } from './open-foundation.js';

const ID = 'cultivation-trial';
const REVISION = `${ID}@1`;
const STATE = 'long:work:cultivation-trial';
/** Object kind and drawing of a trial position. */
const KIND = 'cultivation-trial';
/** The only species whose harvested unit is itself the vegetative propagule in this version. */
const SPECIES = 'root';
const STAGES = 3;
/** Observation horizon: a status, not a maturity deadline or unlock. */
const HORIZON = 80;
/** The existing propagation law (open-ecology.ts, seed dispersal): footprint of every root plant,
 * spacing from other objects, crowding radius and limit, soil moisture band, a new plant's
 * capacity ceiling and the delay before its own first dispersal. */
const LAW = {
  radius: 0.25,
  spacing: 0.6,
  crowdingRadius: 5,
  crowdingLimit: 3,
  soilMin: 0.3,
  soilMax: 1.2,
  capacity: 4,
  dispersalDelay: 600,
};
/** Represented treatments after which a unit has no established living state. */
const TREATED = [
  'physical',
  'materialLayer',
  'canopyDrying',
  'frictionKit',
  'waterCup',
  'mantle',
  'fuelMoisture',
  'processing',
  'componentLots',
] as const;

type Lifecycle =
  | 'preparing'
  | 'placed'
  | 'uncovered'
  | 'planted'
  | 'established'
  | 'dead'
  | 'removed';
/** Persistent trial record. The position object carries `createdBy: null` like every plant, so
 * observers see only the public plant fields (resource, stock, capacity, stage, soil,
 * establishment, species, mode = lifecycle, progress = paid stages, elapsed = planted rounds);
 * growth interval and dispersal schedule stay hidden, and the planter is kept here. */
type TrialRecord = {
  lifecycle: Lifecycle;
  planter: string;
  workId: string | null;
  stages: number;
  source: string;
  sourceCapacity: number;
  sourceInterval: number;
  lot: string | null;
  lotOrigin: string;
  quantity: number;
  unitMass: number;
  preparedAt: number;
  placedAt: number | null;
  plantedAt: number | null;
  establishedAt: number | null;
  endedAt: number | null;
  cause: string | null;
  absorbedUnits: number;
  absorbedMass: number;
  harvested: number;
  harvests: V7Data[];
  observations: V7Data[];
  inputs: V7Data | null;
  observationStatus: string;
};

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const record = (o: V7Object) => o.data.trial as TrialRecord;
/** A trial position. A plant later dispersed from an established trial clones its kind and
 * revision under the existing law but carries no record: it is an ordinary plant. */
const isTrial = (o: V7Object) =>
  o.revision === REVISION &&
  o.kind === KIND &&
  !!o.data.trial &&
  typeof o.data.trial === 'object' &&
  !Array.isArray(o.data.trial);
const lifetime = (w: V7World, s: V7Stack) =>
  w.resources.find((r) => r.id === s.resource)?.properties?.decay ?? 0;
const unspoiled = (w: V7World, s: V7Stack) =>
  lifetime(w, s) > 0 && (s.decay ?? 0) < lifetime(w, s);
/** The unit lying in the position once placed (owned by nobody, reserved for the trial). */
const placedUnit = (w: V7World, o: V7Object) => {
  const id = record(o).lot;
  return id
    ? w.stacks.find((s) => s.id === id && s.reservedFor === o.id)
    : undefined;
};
/** A plant of the resource in the existing ecology: it has a growth interval. */
const plantOf = (o: V7Object, resource: string) =>
  o.kind !== 'animal' &&
  o.data.resource === resource &&
  Number(o.data.interval) > 0;

function sync(a: V7Actor, j: CollectiveWork) {
  a.extensionState[STATE] = v7Json(j);
}

/** Visible environmental inputs at the position; the accumulated establishment stays hidden. */
function inputs(w: V7World, o: V7Object): V7Data {
  const soil = openConditions(w, o.spatial),
    climate = forestClimate(w, o.spatial);
  return {
    tick: w.tick,
    temperature: v7RoundNumber(climate.temperature),
    light: v7RoundNumber(climate.light),
    season: climate.season,
    soilMoisture: soil.moisture,
    regime: soil.regime,
  };
}

/** Public plant fields, drawing metadata and labels; it confers no growth or reward. */
function refresh(w: V7World, o: V7Object) {
  const t = record(o);
  const elapsed = t.plantedAt === null ? 0 : w.tick - t.plantedAt;
  o.data.mode = t.lifecycle;
  o.data.progress = v7RoundNumber(t.stages / STAGES);
  o.data.elapsed = elapsed;
  o.visual.state = t.lifecycle;
  o.visual.label =
    t.lifecycle === 'established'
      ? 'Planted root plant'
      : t.lifecycle === 'dead'
        ? 'Failed root trial'
        : t.lifecycle === 'planted'
          ? 'Covered root trial'
          : 'Root trial position';
  const unit = placedUnit(w, o);
  o.data.view = v7Json({
    component: KIND,
    trial: o.id,
    source: t.source,
    lot: t.lot,
    site: { x: o.spatial.x, y: o.spatial.y, radius: LAW.radius },
    quantityPlaced: t.lot ? t.quantity : 0,
    stagesCompleted: t.stages,
    stages: STAGES,
    lifecycle: t.lifecycle,
    // A covered unit is hidden; only an uncovered one is drawn on the surface.
    unitVisible: t.lifecycle === 'placed' || t.lifecycle === 'uncovered',
    unitPresent: !!unit,
    sprouted: t.lifecycle === 'established',
    harvestableStock:
      t.lifecycle === 'established' ? Number(o.data.stock ?? 0) : 0,
    observedAt: t.observations.map((r) => r.tick ?? null),
    lastObservation: t.observations.at(-1) ?? null,
    elapsed,
    observationStatus: t.observationStatus,
  });
}

function summary(w: V7World, o: V7Object | undefined, j?: CollectiveWork) {
  return {
    ...(j
      ? {
          workId: j.id,
          status: j.status,
          completedRounds: j.completedWork,
          remaining: j.remainingWork,
          paidEnergy: v7RoundNumber(j.paidEnergy),
        }
      : {}),
    ...(o
      ? {
          trial: o.id,
          lifecycle: record(o).lifecycle,
          stock: Number(o.data.stock ?? 0),
          view: o.data.view ?? null,
          record: v7Json(record(o)),
        }
      : {}),
    tick: w.tick,
  };
}

/** A whole, untreated, unspoiled root unit whose origin is a living root plant of the ecology. */
function propagule(w: V7World, s: V7Stack): V7Object {
  if (s.resource !== SPECIES)
    throw new Error(
      'This version plants meadow-root units only: for them the existing plant rules treat one harvested unit as a vegetative propagule. Nothing was reserved.',
    );
  if (TREATED.some((key) => s[key] !== undefined))
    throw new Error(
      'A dried, processed, combined or otherwise treated unit has no established living state. Nothing was reserved.',
    );
  if (!unspoiled(w, s))
    throw new Error(
      'A spoiled unit is not a living propagule. Nothing was reserved.',
    );
  const source = w.objects.find((o) => o.id === s.origin);
  if (!source || !plantOf(source, s.resource))
    throw new Error(
      'The unit does not come from a living root plant, so its identity as a propagule is not established. Nothing was reserved.',
    );
  return source;
}

function position(x: number, y: number): V7Spatial {
  return {
    x,
    y,
    angle: 0,
    shape: { kind: 'circle', radius: LAW.radius },
    solid: false,
    reserved: true,
    interaction: 0.65,
    entrances: [],
  };
}

/** Hand-workable ground plus the site conditions under which the existing law starts a plant. */
function siteError(
  w: V7World,
  a: V7Actor,
  spatial: V7Spatial,
  self?: string,
): string | null {
  const others = w.objects.filter((o) => o.id !== self);
  const site = longPlantingSite({ ...w, objects: others }, a, spatial);
  if (site.error) return site.error;
  const soil = openConditions(w, spatial);
  if (soil.moisture < LAW.soilMin || soil.moisture > LAW.soilMax)
    return `Soil moisture here is ${String(soil.moisture)}; a root propagule starts only at 0.3-1.2.`;
  if (others.some((o) => v7Distance(o.spatial, spatial) < LAW.spacing))
    return 'A new plant needs 0.6 m clear of any other object.';
  const crowd = others.filter(
    (o) =>
      v7Distance(o.spatial, spatial) < LAW.crowdingRadius &&
      (plantOf(o, SPECIES) ||
        (isTrial(o) && ['preparing', 'placed'].includes(record(o).lifecycle))),
  ).length;
  if (crowd >= LAW.crowdingLimit)
    return `${String(crowd)} root plants or trials already stand within 5 m; the existing rule starts no new root plant there.`;
  return null;
}

function reach(a: V7Actor, o: V7Object) {
  return v7ShapeDistance(a.position, o.spatial) <= a.radius + 0.65;
}

function pause(
  c: V7ActionContext,
  j: CollectiveWork,
  o: V7Object,
  reason: string,
): V7HandlerResult {
  j.status = 'paused';
  j.reason = reason;
  refresh(c.world, o);
  c.emit(
    'cultivation-work-paused',
    `${reason} Paid stages and the unit are kept; nothing was spent.`,
    summary(c.world, o, j),
    o.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, o.id] };
}

/** Settle unfinished work once: unplaced units return; a placed unit stays in the position. */
function settle(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  reason: string,
  ground = false,
) {
  const o = w.objects.find((x) => x.id === j.target);
  if (ground) {
    j.x = a.position.x;
    j.y = a.position.y;
  }
  workStop(w, a, j, reason, ground);
  if (o) {
    const t = record(o);
    t.workId = null;
    if (t.stages < 2) w.objects = w.objects.filter((x) => x.id !== o.id);
    else {
      t.lifecycle = placedUnit(w, o) ? 'uncovered' : 'dead';
      if (t.lifecycle === 'dead') {
        t.endedAt = w.tick;
        t.cause = 'The placed unit was lost or spoiled.';
      }
      refresh(w, o);
    }
  }
  sync(a, j);
  return o && w.objects.includes(o) ? o : undefined;
}

function fail(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
): V7HandlerResult {
  const o = settle(c.world, c.actor, j, reason);
  c.emit(
    'cultivation-work-failed',
    `${reason} Spent energy and time are not refunded.`,
    summary(c.world, o, j),
    o?.id ?? j.id,
  );
  return { complete: true, writes: [j.id, ...j.escrow] };
}

/** One paid stage after revalidating reach, site, unit and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  if (!open(j)) throw new Error('This planting work is already settled.');
  const o = c.world.objects.find((x) => x.id === j.target);
  if (!o) throw new Error('The prepared position no longer exists.');
  const t = record(o);
  const unit =
    t.stages < 2
      ? c.world.stacks.find(
          (s) => s.id === j.escrow[0] && s.reservedFor === j.id,
        )
      : placedUnit(c.world, o);
  if (!unit || unit.quantity < t.quantity || !unspoiled(c.world, unit))
    return fail(
      c,
      j,
      'The reserved unit was lost or spoiled, so the planting cannot continue.',
    );
  const blocked = !reach(c.actor, o)
    ? 'Return within reach of the position.'
    : siteError(c.world, c.actor, o.spatial, o.id);
  if (blocked) return pause(c, j, o, blocked);
  if (c.actor.vitals.energy < 1)
    return pause(c, j, o, 'Not enough energy for the next stage.');
  const resumed = j.status === 'paused';
  if (!workPay(c, j, 1))
    throw new Error('Energy changed before the paid stage.');
  c.actor.vitals.energy = v7RoundNumber(Math.max(0, c.actor.vitals.energy));
  t.stages = j.completedWork;
  if (resumed)
    c.emit(
      'cultivation-work-resumed',
      'Unfinished planting resumed after rechecking reach, site, unit and energy.',
      summary(c.world, o, j),
      o.id,
    );
  if (t.stages === 1) {
    refresh(c.world, o);
    c.emit(
      'cultivation-position-prepared',
      'A small planting position was loosened by hand; the unit is still carried and owned.',
      summary(c.world, o, j),
      o.id,
    );
  } else if (t.stages === 2) {
    // Placement moves the unit, with its origin, mass and age, out of the inventory.
    unit.owner = null;
    unit.reservedFor = o.id;
    unit.position = { x: o.spatial.x, y: o.spatial.y };
    t.lot = unit.id;
    t.placedAt = c.world.tick;
    t.lifecycle = 'placed';
    refresh(c.world, o);
    c.emit(
      'cultivation-unit-placed',
      'The unit was placed in the position; it can no longer be eaten or planted elsewhere.',
      { ...summary(c.world, o, j), unit: v7Json(unit) },
      o.id,
    );
  } else {
    // Covered, the position becomes a planted propagule under the existing plant rules.
    o.data.resource = SPECIES;
    o.data.stock = 0;
    o.data.capacity = Math.min(LAW.capacity, t.sourceCapacity);
    o.data.interval = t.sourceInterval;
    o.data.stage = 'seedling';
    o.data.establishment = 0;
    o.data.seedUnits = t.quantity;
    o.data.parent = t.source;
    o.data.nextDispersal = c.world.tick + LAW.dispersalDelay;
    t.plantedAt = c.world.tick;
    t.lifecycle = 'planted';
    t.workId = null;
    t.observationStatus = 'observation interval open';
    t.inputs = inputs(c.world, o);
    j.status = 'completed';
    j.outputs = [o.id];
    refresh(c.world, o);
    c.emit(
      'cultivation-planted',
      'The unit was covered and recorded. It establishes only through actual temperature, light, soil moisture and season, and may stall or rot; no food was produced.',
      summary(c.world, o, j),
      o.id,
    );
  }
  sync(c.actor, j);
  return {
    complete: j.remainingWork === 0,
    remaining: j.remainingWork,
    writes: [j.id, o.id, unit.id],
  };
}

function establish(c: V7ActionContext): V7HandlerResult {
  const existing = workFind(c);
  if (existing && c.operation?.first === false && open(existing))
    return advance(c, existing);
  if (existing && open(existing))
    throw new Error(
      'Unfinished planting work exists; resume or cancel its processId first. Nothing was spent.',
    );
  if (c.operation?.first === false)
    throw new Error('The bound planting work is already settled.');
  if (c.action.args.quantity !== undefined && c.action.args.quantity !== 1)
    throw new Error(
      'The existing propagation rule starts one plant from one unit; plant exactly one. Nothing was spent.',
    );
  const x = v7Number(c.action.args.x, 'position x'),
    y = v7Number(c.action.args.y, 'position y');
  const allocations = workAllocations(c, [
    { itemId: c.action.args.inputStackId, quantity: 1 },
  ]);
  const unit = allocations[0]?.stack;
  if (!unit) throw new Error('One owned unit is required.');
  const source = propagule(c.world, unit);
  const target = c.action.args.target;
  if (typeof target === 'string' && target && target !== source.id)
    throw new Error(
      `The unit comes from ${source.id}, not from ${target}. Nothing was spent.`,
    );
  const spatial = position(x, y);
  const site = siteError(c.world, c.actor, spatial);
  if (site) throw new Error(`${site} Nothing was spent.`);
  if (c.actor.vitals.energy < 1)
    throw new Error(
      'One energy is required for the first stage. Nothing was spent.',
    );
  const j = workCreate(c, 'establish', STAGES);
  j.x = x;
  j.y = y;
  workReserve(c, j, allocations);
  const r = c.world.resources.find((r) => r.id === unit.resource);
  const trial: TrialRecord = {
    lifecycle: 'preparing',
    planter: c.actor.id,
    workId: j.id,
    stages: 0,
    source: source.id,
    sourceCapacity: Number(source.data.capacity),
    sourceInterval: Number(source.data.interval),
    lot: null,
    lotOrigin: unit.origin,
    quantity: 1,
    unitMass: r?.mass ?? 0,
    preparedAt: c.world.tick,
    placedAt: null,
    plantedAt: null,
    establishedAt: null,
    endedAt: null,
    cause: null,
    absorbedUnits: 0,
    absorbedMass: 0,
    harvested: 0,
    harvests: [],
    observations: [],
    inputs: null,
    observationStatus: 'not planted',
  };
  const o: V7Object = {
    id: v7Id(c.world, 'cultivation'),
    kind: KIND,
    name: 'Root planting trial',
    spatial,
    visual: {
      component: KIND,
      color: '#7a5f40',
      accent: r?.color ?? '#cfaf79',
      label: 'Root trial position',
      state: 'preparing',
    },
    data: { species: SPECIES, trial },
    // Like every plant: observers see public plant fields only; the planter is in the record.
    createdBy: null,
    createdAt: c.world.tick,
    revision: REVISION,
  };
  j.target = o.id;
  c.world.objects.push(o);
  return advance(c, j);
}

function resume(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c);
  if (!j || !open(j))
    throw new Error('No unfinished personal planting work to resume.');
  return advance(c, j);
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c);
  if (!j || !open(j))
    throw new Error(
      'No unfinished personal planting work to cancel; planted positions stay in place.',
    );
  const returned = j.escrow.flatMap((id) => {
    const s = c.world.stacks.find((s) => s.id === id && s.reservedFor === j.id);
    return s
      ? [{ itemId: s.id, quantity: s.quantity, decay: s.decay ?? 0 }]
      : [];
  });
  const o = settle(
    c.world,
    c.actor,
    j,
    'Cancelled; an unplaced unit returns in its current condition and a placed unit stays uncovered in the position. Spent energy and time are not refunded.',
  );
  c.emit(
    'cultivation-work-cancelled',
    returned.length
      ? 'Planting cancelled; the unplaced unit was returned once in its current condition.'
      : 'Planting cancelled; the placed unit stays uncovered in the position and will not establish.',
    { ...summary(c.world, o, j), returned },
    o?.id ?? j.id,
  );
  return { complete: true, writes: [j.id, ...j.escrow] };
}

/** The exact visible trial position or plant source within reach. */
function subject(c: V7ActionContext): V7Object {
  const id = v7String(c.action.args.target, 'target');
  const o = c.world.objects.find((x) => x.id === id);
  const resource = typeof o?.data.resource === 'string' ? o.data.resource : '';
  if (!o || !(isTrial(o) || plantOf(o, resource)))
    throw new Error(
      'Target a trial position or a visible plant source. Nothing was spent.',
    );
  if (!reach(c.actor, o))
    throw new Error('Move within reach of the target. Nothing was spent.');
  return o;
}

/** Baseline probe observation plus a personal unverified record of what is visible. */
function observe(c: V7ActionContext): V7HandlerResult {
  const o = subject(c);
  const probe = OPEN_FOUNDATION.handlers['open.probe'];
  if (!probe) throw new Error('Missing baseline probe.');
  probe({
    ...c,
    action: {
      interface: 'probe',
      args: { target: o.id, mode: 'observe', intensity: 0 },
    },
  });
  const seen = inputs(c.world, o);
  if (!isTrial(o)) {
    c.emit(
      'cultivation-patch-observed',
      'The plant source was observed with the baseline probe; only its visible state was recorded.',
      {
        source: o.id,
        resource: o.data.resource ?? null,
        stock: Number(o.data.stock ?? 0),
        conditions: seen,
      },
      o.id,
    );
    return { complete: true, writes: [o.id] };
  }
  const t = record(o);
  const unit = placedUnit(c.world, o);
  const visible = t.lifecycle === 'placed' || t.lifecycle === 'uncovered';
  const value: V7Data = {
    lifecycle: t.lifecycle,
    elapsedSincePlanting: t.plantedAt === null ? 0 : c.world.tick - t.plantedAt,
    visibleStock: t.lifecycle === 'established' ? Number(o.data.stock) : 0,
    sprouted: t.lifecycle === 'established',
    observationStatus: t.observationStatus,
    unitCondition:
      visible && unit
        ? v7RoundNumber(1 - (unit.decay ?? 0) / lifetime(c.world, unit))
        : null,
    conditions: seen,
    source: t.source,
  };
  openRemember(c, {
    key: `${o.id}:trial-record`,
    subject: SPECIES,
    property: 'planting trial record',
    value,
    method: 'direct observation of the planting position',
    condition: openConditions(c.world, o.spatial).regime,
    verified: false,
  });
  t.observations = [
    ...t.observations,
    {
      tick: c.world.tick,
      actor: c.actor.id,
      lifecycle: t.lifecycle,
      stock: Number(value.visibleStock),
    },
  ].slice(-12);
  refresh(c.world, o);
  c.emit(
    'cultivation-trial-observed',
    'The trial position was observed; only visible state and local conditions were recorded.',
    { ...summary(c.world, o), observation: value },
    o.id,
  );
  return { complete: true, writes: [o.id] };
}

function tend(c: V7ActionContext): V7HandlerResult {
  const o = subject(c);
  if (!isTrial(o)) throw new Error('Tend targets a trial position.');
  throw new Error(
    'No tending intervention is supported at this position: no competing plant stands within its 0.6 m spacing, no displaced soil is represented, and watering needs actually collected water and a delivery method that this world does not provide. Nothing was spent.',
  );
}

function remove(c: V7ActionContext): V7HandlerResult {
  const o = subject(c);
  if (!isTrial(o)) throw new Error('Remove targets a trial position.');
  const t = record(o);
  if (t.planter !== c.actor.id)
    throw new Error(
      'Only the planter may remove material from this position. Nothing was spent.',
    );
  if (t.lifecycle === 'preparing' || t.lifecycle === 'placed')
    throw new Error(
      'Planting work is unfinished here; resume or cancel it. Nothing was spent.',
    );
  if (t.lifecycle === 'established')
    throw new Error(
      'An established plant is an ordinary root source; harvest its stock with gather. Uprooting an established plant is not represented. Nothing was spent.',
    );
  v7Spend(c.actor, 1);
  const unit = placedUnit(c.world, o);
  const returned = unit
    ? { itemId: unit.id, quantity: unit.quantity, decay: unit.decay ?? 0 }
    : null;
  if (unit) {
    delete unit.reservedFor;
    unit.owner = c.actor.id;
    unit.position = { ...c.actor.position };
  }
  t.lifecycle = 'removed';
  t.endedAt = c.world.tick;
  t.cause = 'Removed by the planter.';
  const final = summary(c.world, o);
  c.world.objects = c.world.objects.filter((x) => x.id !== o.id);
  c.emit(
    'cultivation-trial-removed',
    unit
      ? 'The unit was taken back in its current condition and the position cleared; no fresh replacement exists.'
      : 'Nothing recoverable remained; the position was cleared.',
    { ...final, returned, energy: 1 },
    o.id,
  );
  return { complete: true, writes: [o.id, ...(unit ? [unit.id] : [])] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'establish') return establish(c);
  if (mode === 'resume') return resume(c);
  if (mode === 'cancel') return cancel(c);
  if (mode === 'observe') return observe(c);
  if (mode === 'tend') return tend(c);
  if (mode === 'remove') return remove(c);
  throw new Error('Unknown planting trial mode.');
}

/** Ordinary simulation: unattended work pauses; planted units establish, stall or rot. */
function lifecycle(w: V7World) {
  for (const j of collectiveJobs(w, ID).filter(open)) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a) continue;
    const o = w.objects.find((x) => x.id === j.target);
    if (o && record(o).stages < 2)
      for (const id of j.escrow) {
        const s = w.stacks.find((s) => s.id === id && s.reservedFor === j.id);
        if (s) s.position = { ...a.position };
      }
    if (j.status === 'active' && j.lastPaid < w.tick) {
      j.status = 'paused';
      j.reason =
        'Not worked this round; paid stages and the reserved unit are kept.';
      forestEvent(
        w,
        'cultivation-work-paused',
        'Planting paused because it was not worked this round; paid stages and the unit are kept.',
        a.position,
        a.id,
        summary(w, o, j),
        o?.id ?? j.id,
      );
    }
    sync(a, j);
  }
  for (const o of w.objects.filter(isTrial)) {
    const t = record(o);
    const unit = placedUnit(w, o);
    if (t.lifecycle === 'planted' && o.data.stage === 'mature') {
      // The existing establishment rule completed this round: the unit became the plant.
      if (unit) w.stacks = w.stacks.filter((s) => s.id !== unit.id);
      t.absorbedUnits = unit?.quantity ?? 0;
      t.absorbedMass = v7RoundNumber(t.absorbedUnits * t.unitMass);
      t.lifecycle = 'established';
      t.establishedAt = w.tick;
      // It is now a meadow-root plant; a plant it later disperses inherits this name.
      o.name = 'Meadow roots';
      t.observationStatus = 'established';
      forestEvent(
        w,
        'cultivation-trial-established',
        'The planted unit established as a new root plant through actual growing conditions. It has no stock yet; stock regrows only under the existing growth rule.',
        o.spatial,
        null,
        { ...summary(w, o), planter: t.planter },
        o.id,
      );
    } else if (
      (t.lifecycle === 'planted' || t.lifecycle === 'uncovered') &&
      !unit
    ) {
      // The unit spoiled under the existing ageing law before establishing.
      o.data.interval = 0;
      o.data.stage = 'dead';
      o.data.stock = 0;
      t.lifecycle = 'dead';
      t.endedAt = w.tick;
      t.cause = 'The unit decayed before establishing.';
      t.observationStatus = 'died';
      forestEvent(
        w,
        'cultivation-trial-died',
        'The unit in the trial position rotted before establishing; nothing grew.',
        o.spatial,
        null,
        { ...summary(w, o), planter: t.planter },
        o.id,
      );
    } else if (t.lifecycle === 'planted' && t.plantedAt !== null) {
      t.observationStatus =
        w.tick - t.plantedAt >= HORIZON
          ? 'inconclusive'
          : 'observation interval open';
    }
    if (t.lifecycle === 'established') {
      const gathered = w.events.filter(
        (e) => e.type === 'gathered' && e.target === o.id && e.success,
      );
      for (const e of gathered) {
        const quantity = Number(e.data.quantity ?? 0);
        t.harvested += quantity;
        t.harvests = [
          ...t.harvests,
          { tick: w.tick, actor: e.actor, quantity },
        ].slice(-12);
        forestEvent(
          w,
          'cultivation-trial-harvested',
          'Real stock of the planted root plant was harvested through gather.',
          o.spatial,
          e.actor,
          { ...summary(w, o), quantity, item: e.data.item ?? null },
          o.id,
        );
      }
    }
    if (t.lifecycle === 'planted' || t.lifecycle === 'established')
      t.inputs = inputs(w, o);
    refresh(w, o);
  }
}

/** Pure law constants and predicates shared with later cultivation packages (ex16
 * cultivate-plants@1); exporting them leaves this package's behavior unchanged. */
export {
  LAW as CULTIVATION_LAW,
  TREATED as CULTIVATION_TREATED,
  lifetime as cultivationLifetime,
  unspoiled as cultivationUnspoiled,
  plantOf as cultivationPlantOf,
  inputs as cultivationInputs,
  position as cultivationPosition,
  reach as cultivationReach,
};

export const LONG_CULTIVATION_TRIAL: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex15',
  dependencies: ['foundation-open@1'],
  description:
    'A general root planting trial: one owned, living root unit is placed in a small hand-prepared position in three paid stages and then establishes, stalls or rots under the existing plant propagation, growth and ageing rules.',
  reuse: {
    experiment:
      'ex13 root-planting-trial@1 and ex14 cultivate-plant@1 (site checks, escrowed placement, observation-only precursor resolved here); ex15 food-preparation@1 (paid-work pattern)',
    source:
      'open-ecology.ts (existing seedling establishment, growth, dispersal and spacing law, unchanged); forest-environment.ts (existing food ageing and spoilage); long-planting-site.ts (hand-workable site predicate); collective-work.ts (escrow, paid work, stop); open-foundation.ts (baseline probe and personal records); base gather (harvest)',
    description:
      'Implementation reuse only; no earlier ability, plot or mastery is inherited and the ex13/ex14 packages are unchanged. Planting creates nothing: one real unit becomes a propagule exactly like a naturally dispersed one, and all growth comes from the existing ecology.',
  },
  abilities: [
    {
      id: ID,
      name: 'Establish and tend a cultivation trial',
      function:
        'Plant one owned, unspoiled meadow-root unit from a living root plant in a small hand-prepared soil position, where it can establish as a new root plant under the existing plant rules; observe trial positions or plant sources, take back what remains, or resume or cancel unfinished planting.',
      equivalence: 'cultivation:root-propagule:establish-observe-remove:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: [
              'establish',
              'resume',
              'cancel',
              'observe',
              'tend',
              'remove',
            ],
          },
          target: { type: 'string' },
          inputStackId: { type: 'string' },
          quantity: { type: 'integer', minimum: 1, maximum: 1 },
          x: { type: 'number' },
          y: { type: 'number' },
          processId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: {
        target: 'optional-exact-visible',
        inputStackId: 'optional-owned',
      },
      prerequisites: [],
      learning: 2,
      costs:
        'Study: 2 rounds. Establish: inputStackId names one whole owned, untreated, unspoiled root unit (quantity 1) gathered from a living root plant (target, if given, must be that plant); x, y name a 0.25 m position within reach (0.65 m plus body radius) on ordinary meadow soil (.) inside the world, not standing water, waterlogging at most 0.1, soil moisture 0.3-1.2, at least 0.6 m from any object and clear of people, with fewer than 3 root plants or unfinished trials within 5 m. Three paid stages of one round and 1 energy each: prepare the position, place the unit, cover and record; establish pays the first and the same action continues each round. Resume pays the next stage after rechecking reach, site, unit and energy; cancel takes one round and no energy; processId selects the work. Observe: target a trial position or a plant source in reach, one round and 0.2 energy (the baseline probe observation). Remove (planter only): target in reach, one round and 1 energy. Tend has no supported intervention yet and is refused at no cost. Harvest uses gather at its own cost. No tool, water, fertilizer or seed is provided.',
      effects:
        'The unit stays carried, owned and ageing until the placing stage moves it, with its origin, mass and age, out of the inventory into the position; then it cannot be eaten or planted elsewhere. Covering makes the position a planted root propagule under the existing plant rules: it gains establishment only from actual temperature, light, soil moisture and season, so cold, darkness, drought or waterlogging stall it, and if the buried unit spoils under the existing ageing law first, the trial dies. When establishment completes the unit becomes a new root plant (it leaves the food stocks) with no stock and a stock ceiling of at most 4, regrowing under the same growth rule as natural root plants and harvested by anyone only through gather; nothing is copied, reset or guaranteed. After 80 planted rounds without establishing or dying the trial reports an inconclusive status and continues. Observe records only visible stage, stock, soil and weather as an unverified personal record; repeated probe observations follow the existing evidence rules. Work not continued in a round pauses; too little energy, leaving reach or a changed site pauses without charge; a lost or spoiled unit stops the work. Cancel returns an unplaced unit once and leaves a placed unit uncovered in the position, where it does not establish. Death drops an unplaced unit where the person died and leaves placed or planted units to the ecology. Remove returns a placed or covered unit in its current condition, nothing for a dead trial, never an established plant, and clears the position. No reward, milestone or refund.',
      handler: 'long.cultivation-trial',
      revision: REVISION,
      authored: false,
      // The planting event carries no qualified flag: planting earns no milestone.
      practiceEvidence: 'cultivation-planted',
      dependencies: { abilities: [], resources: [SPECIES], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Paid work in three one-round stages whose exact job, reserved unit and position persist across interruption; resume pays only the next stage after revalidation; completion, failure, cancellation and death settle once. Observe and remove are single rounds; growth proceeds only in ordinary simulation.',
      },
    },
  ],
  handlers: { 'long.cultivation-trial': execute },
  processes: {},
  visualComponents: [KIND],
  events: [
    'cultivation-position-prepared',
    'cultivation-unit-placed',
    'cultivation-planted',
    'cultivation-work-paused',
    'cultivation-work-resumed',
    'cultivation-work-cancelled',
    'cultivation-work-failed',
    'cultivation-trial-observed',
    'cultivation-patch-observed',
    'cultivation-trial-established',
    'cultivation-trial-died',
    'cultivation-trial-harvested',
    'cultivation-trial-removed',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: lifecycle,
  onDeath(w, a) {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && open(j),
    )) {
      const o = settle(
        w,
        a,
        j,
        'Performer died; an unplaced unit was left where they died and a placed unit stays in the position.',
        true,
      );
      forestEvent(
        w,
        'cultivation-work-failed',
        'Planting stopped by death; any placed unit is left to the ecology.',
        a.position,
        a.id,
        summary(w, o, j),
        o?.id ?? j.id,
      );
    }
  },
};
