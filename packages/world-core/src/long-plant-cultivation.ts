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
import { v7ObjectSchema } from './continuous-base.js';
import {
  v7Id,
  v7Json,
  v7Number,
  v7RoundNumber,
  v7String,
} from './continuous-data.js';
import { v7Distance } from './continuous-geometry.js';
import { forestEvent } from './forest-climate.js';
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
import {
  CULTIVATION_LAW as LAW,
  CULTIVATION_TREATED as TREATED,
  cultivationInputs as inputs,
  cultivationLifetime as lifetime,
  cultivationPlantOf as plantOf,
  cultivationPosition as position,
  cultivationReach as reach,
  cultivationUnspoiled as unspoiled,
} from './long-cultivation-trial.js';

const ID = 'cultivate-plants';
const REVISION = `${ID}@1`;
const STATE = `long:work:${ID}`;
/** Object kind of a plot; it is drawn with the ex15 cultivation-trial drawing. */
const KIND = 'cultivation-plot';
const VISUAL = 'cultivation-trial';
/** Prepare and record the site, then transfer the unit (World Agent specification). */
const STAGES = 2;
const STAGE_ENERGY = 1.5;

type Lifecycle = 'preparing' | 'planted' | 'established' | 'dead' | 'ended';
/** Persistent plot record. Like every plant the plot carries `createdBy: null`, so observers
 * see only public plant fields; growth interval, dispersal schedule and planter stay here. */
type PlotRecord = {
  lifecycle: Lifecycle;
  planter: string;
  workId: string | null;
  stages: number;
  species: string;
  source: string;
  sourceName: string;
  sourceCapacity: number;
  sourceInterval: number;
  /** The owned stack the unit was taken from, and the transferred unit itself. */
  item: string;
  lot: string | null;
  lotOrigin: string;
  quantity: number;
  unitMass: number;
  /** Food condition of the unit when it entered the soil. */
  transferDecay: number | null;
  preparedAt: number;
  plantedAt: number | null;
  establishedAt: number | null;
  maturedAt: number | null;
  endedAt: number | null;
  cause: string | null;
  absorbedUnits: number;
  absorbedMass: number;
  observations: V7Data[];
};

const LABELS: Record<Lifecycle, string> = {
  preparing: 'Prepared plot',
  planted: 'Planted plot, no sprout seen',
  established: 'Sprouted plot',
  dead: 'Failed plot',
  ended: 'Ended plot',
};

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const record = (o: V7Object) => o.data.plot as PlotRecord;
/** A plot. A plant later dispersed from an established plot clones its kind and revision
 * under the existing law but carries no record: it is an ordinary plant. */
const isPlot = (o: V7Object) =>
  o.revision === REVISION &&
  o.kind === KIND &&
  !!o.data.plot &&
  typeof o.data.plot === 'object' &&
  !Array.isArray(o.data.plot);
/** The unit lying in the plot once transferred (owned by nobody, reserved for the plot). */
const buried = (w: V7World, o: V7Object) => {
  const id = record(o).lot;
  return id
    ? w.stacks.find((s) => s.id === id && s.reservedFor === o.id)
    : undefined;
};

function sync(a: V7Actor, j: CollectiveWork) {
  a.extensionState[STATE] = v7Json(j);
}

/** Public plant fields, drawing metadata and labels; it confers no growth or reward. */
function refresh(w: V7World, o: V7Object) {
  const t = record(o);
  const elapsed = t.plantedAt === null ? 0 : w.tick - t.plantedAt;
  o.data.mode = t.lifecycle;
  o.data.progress = v7RoundNumber(t.stages / STAGES);
  o.data.elapsed = elapsed;
  o.visual.state = t.lifecycle;
  o.visual.label = LABELS[t.lifecycle];
  o.data.view = v7Json({
    component: VISUAL,
    plot: o.id,
    species: t.species,
    source: t.source,
    lot: t.lot,
    site: { x: o.spatial.x, y: o.spatial.y, radius: LAW.radius },
    quantityPlanted: t.lot ? t.quantity : 0,
    stagesCompleted: t.stages,
    stages: STAGES,
    lifecycle: t.lifecycle,
    // Carried while the site is prepared and buried once transferred: never drawn.
    unitVisible: false,
    unitPresent: !!buried(w, o),
    sprouted: t.lifecycle === 'established',
    harvestableStock:
      t.lifecycle === 'established' ? Number(o.data.stock ?? 0) : 0,
    observedAt: t.observations.map((r) => r.tick ?? null),
    elapsed,
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
          plot: o.id,
          x: o.spatial.x,
          y: o.spatial.y,
          species: record(o).species,
          lifecycle: record(o).lifecycle,
          stage: typeof o.data.stage === 'string' ? o.data.stage : null,
          stock: Number(o.data.stock ?? 0),
          view: o.data.view ?? null,
          record: v7Json(record(o)),
        }
      : {}),
    tick: w.tick,
  };
}

/** The existing dispersal law turns one stock unit of a living plant into a propagule; a whole,
 * untreated, unspoiled unit of the same food gathered from such a plant is that propagule. */
function propagule(w: V7World, s: V7Stack): V7Object {
  const source = w.objects.find((o) => o.id === s.origin);
  if (
    !source ||
    !plantOf(source, s.resource) ||
    s.resource === 'fish' ||
    lifetime(w, s) <= 0
  )
    throw new Error(
      'Only a food unit gathered from a living plant of the same food is a propagule under the existing plant rules. Nothing was reserved.',
    );
  if (TREATED.some((key) => s[key] !== undefined))
    throw new Error(
      'A dried, processed, combined or otherwise treated unit has no established living state. Nothing was reserved.',
    );
  if (!unspoiled(w, s))
    throw new Error(
      'A spoiled unit is not a living propagule. Nothing was reserved.',
    );
  return source;
}

/** Hand-workable ground plus the site conditions under which the existing law starts a plant. */
function siteError(
  w: V7World,
  a: V7Actor,
  spatial: V7Spatial,
  species: string,
  self?: string,
): string | null {
  const others = w.objects.filter((o) => o.id !== self);
  const site = longPlantingSite({ ...w, objects: others }, a, spatial);
  if (site.error) return site.error;
  const soil = openConditions(w, spatial);
  if (soil.moisture < LAW.soilMin || soil.moisture > LAW.soilMax)
    return `Soil moisture here is ${String(soil.moisture)}; a propagule starts only at 0.3-1.2.`;
  if (others.some((o) => v7Distance(o.spatial, spatial) < LAW.spacing))
    return 'A new plant needs 0.6 m clear of any other object.';
  const crowd = others.filter(
    (o) =>
      v7Distance(o.spatial, spatial) < LAW.crowdingRadius &&
      (plantOf(o, species) ||
        (isPlot(o) &&
          record(o).lifecycle === 'preparing' &&
          record(o).species === species)),
  ).length;
  if (crowd >= LAW.crowdingLimit)
    return `${String(crowd)} ${species} plants or prepared plots already stand within 5 m; the existing rule starts no new plant there.`;
  return null;
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
    `${reason} The prepared site and the unit are kept; nothing was spent.`,
    summary(c.world, o, j),
    o.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, o.id] };
}

/** Settle unfinished work once: the reserved unit is released and the empty site cleared. */
function settle(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  reason: string,
  ground = false,
) {
  const o = w.objects.find((x) => x.id === j.target && isPlot(x));
  if (ground) {
    j.x = a.position.x;
    j.y = a.position.y;
  }
  workStop(w, a, j, reason, ground);
  if (o) {
    const t = record(o);
    t.workId = null;
    t.lifecycle = 'ended';
    t.endedAt = w.tick;
    t.cause = reason;
    // Hand-loosened soil is not a represented lasting state, so no object remains.
    w.objects = w.objects.filter((x) => x.id !== o.id);
  }
  sync(a, j);
  return o;
}

function fail(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
): V7HandlerResult {
  const o = settle(c.world, c.actor, j, reason);
  c.emit(
    'cultivation-trial-failed',
    `${reason} Spent energy and time are not refunded.`,
    summary(c.world, o, j),
    o?.id ?? j.id,
  );
  return { complete: true, writes: [j.id, ...j.escrow] };
}

/** One paid round after revalidating reach, site, unit and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const o = c.world.objects.find((x) => x.id === j.target && isPlot(x));
  if (!o) throw new Error('The prepared plot no longer exists.');
  const t = record(o);
  const unit = c.world.stacks.find(
    (s) => s.id === j.escrow[0] && s.reservedFor === j.id,
  );
  if (!unit || unit.quantity < t.quantity || !unspoiled(c.world, unit))
    return fail(
      c,
      j,
      'The reserved unit was lost or spoiled, so the planting cannot continue.',
    );
  const blocked = !reach(c.actor, o)
    ? 'Return within reach of the plot.'
    : siteError(c.world, c.actor, o.spatial, t.species, o.id);
  if (blocked) return pause(c, j, o, blocked);
  if (c.actor.vitals.energy < STAGE_ENERGY)
    return pause(c, j, o, 'Not enough energy for the next round of work.');
  const resumed = j.status === 'paused';
  if (!workPay(c, j, STAGE_ENERGY))
    throw new Error('Energy changed before the paid round.');
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
      'cultivation-site-prepared',
      'A small plot was loosened by hand and recorded; the unit is still carried and owned.',
      summary(c.world, o, j),
      o.id,
    );
  } else {
    // Transfer moves the unit, with its origin, mass and age, out of the inventory into the
    // soil, where the plot becomes a propagule exactly like a naturally dispersed one.
    unit.owner = null;
    unit.reservedFor = o.id;
    unit.position = { x: o.spatial.x, y: o.spatial.y };
    t.lot = unit.id;
    t.transferDecay = unit.decay ?? 0;
    t.plantedAt = c.world.tick;
    t.lifecycle = 'planted';
    t.workId = null;
    o.data.resource = t.species;
    o.data.stock = 0;
    o.data.capacity = Math.min(LAW.capacity, t.sourceCapacity);
    o.data.interval = t.sourceInterval;
    o.data.stage = 'seedling';
    o.data.establishment = 0;
    o.data.seedUnits = t.quantity;
    o.data.parent = t.source;
    o.data.nextDispersal = c.world.tick + LAW.dispersalDelay;
    j.status = 'completed';
    j.outputs = [o.id];
    refresh(c.world, o);
    c.emit(
      'cultivation-propagule-planted',
      'The unit was transferred into the plot and covered. It establishes only through actual temperature, light, soil moisture and season, and may stall or rot; no food was produced.',
      { ...summary(c.world, o, j), unit: v7Json(unit) },
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

function plant(c: V7ActionContext): V7HandlerResult {
  const existing = workFind(c);
  if (existing && open(existing)) return advance(c, existing);
  if (c.operation?.first === false)
    throw new Error('The bound planting work is already settled.');
  if (c.action.args.quantity !== undefined && c.action.args.quantity !== 1)
    throw new Error(
      'The existing propagation rule starts one plant from one unit; plant exactly one. Nothing was spent.',
    );
  const x = v7Number(c.action.args.x, 'plot x'),
    y = v7Number(c.action.args.y, 'plot y');
  const allocations = workAllocations(c, [
    { itemId: c.action.args.inputStackId, quantity: 1 },
  ]);
  const unit = allocations[0]?.stack;
  if (!unit) throw new Error('One owned unit is required.');
  const source = propagule(c.world, unit);
  const spatial = position(x, y);
  const site = siteError(c.world, c.actor, spatial, unit.resource);
  if (site) throw new Error(`${site} Nothing was spent.`);
  if (c.actor.vitals.energy < STAGE_ENERGY)
    throw new Error(
      '1.5 energy is required for the first round. Nothing was spent.',
    );
  const j = workCreate(c, 'plant', STAGES);
  j.x = x;
  j.y = y;
  workReserve(c, j, allocations);
  const r = c.world.resources.find((r) => r.id === unit.resource);
  const plot: PlotRecord = {
    lifecycle: 'preparing',
    planter: c.actor.id,
    workId: j.id,
    stages: 0,
    species: unit.resource,
    source: source.id,
    sourceName: source.name,
    sourceCapacity: Number(source.data.capacity),
    sourceInterval: Number(source.data.interval),
    item: unit.id,
    lot: null,
    lotOrigin: unit.origin,
    quantity: 1,
    unitMass: r?.mass ?? 0,
    transferDecay: null,
    preparedAt: c.world.tick,
    plantedAt: null,
    establishedAt: null,
    maturedAt: null,
    endedAt: null,
    cause: null,
    absorbedUnits: 0,
    absorbedMass: 0,
    observations: [],
  };
  const o: V7Object = {
    id: v7Id(c.world, 'plot'),
    kind: KIND,
    name: 'Cultivation plot',
    spatial,
    visual: {
      component: VISUAL,
      color: '#7a5f40',
      accent: r?.color ?? '#cfaf79',
      label: LABELS.preparing,
      state: 'preparing',
    },
    data: { species: unit.resource, plot },
    // Like every plant: observers see public plant fields only; the planter is in the record.
    createdBy: null,
    createdAt: c.world.tick,
    revision: REVISION,
  };
  j.target = o.id;
  c.world.objects.push(o);
  return advance(c, j);
}

function end(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c);
  if (!j || !open(j))
    throw new Error(
      'No unfinished planting to end; a transferred unit stays in its plot under the world rules. Nothing was spent.',
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
    'Ended before transfer; the reserved unit returns once in its current condition. Spent energy and time are not refunded.',
  );
  c.emit(
    'cultivation-trial-ended',
    'Planting ended before transfer; the unit was returned once in its current condition and the prepared site was cleared.',
    { ...summary(c.world, o, j), returned },
    o?.id ?? j.id,
  );
  return { complete: true, writes: [j.id, ...j.escrow] };
}

/** The exact visible plot or plant source within reach. */
function subject(c: V7ActionContext): V7Object {
  const id = v7String(c.action.args.target, 'target');
  const o = c.world.objects.find((x) => x.id === id);
  const resource = typeof o?.data.resource === 'string' ? o.data.resource : '';
  if (!o || !(isPlot(o) || plantOf(o, resource)))
    throw new Error(
      'Target a plot or a visible plant source. Nothing was spent.',
    );
  if (!reach(c.actor, o))
    throw new Error('Move within reach of the target. Nothing was spent.');
  return o;
}

/** Baseline probe observation plus a personal unverified record of what is visible. */
function inspect(c: V7ActionContext): V7HandlerResult {
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
  const conditions = inputs(c.world, o);
  if (!isPlot(o)) {
    c.emit(
      'cultivation-condition-observed',
      'The plant source was observed with the baseline probe; only its visible state was recorded.',
      {
        scope: 'plant source',
        source: o.id,
        resource: o.data.resource ?? null,
        stage: o.data.stage ?? null,
        stock: Number(o.data.stock ?? 0),
        conditions,
        tick: c.world.tick,
      },
      o.id,
    );
    return { complete: true, writes: [o.id] };
  }
  const t = record(o);
  const value: V7Data = {
    lifecycle: t.lifecycle,
    stage: o.data.stage ?? null,
    elapsedSincePlanting: t.plantedAt === null ? 0 : c.world.tick - t.plantedAt,
    visibleStock: t.lifecycle === 'established' ? Number(o.data.stock) : 0,
    sprouted: t.lifecycle === 'established',
    conditions,
    species: t.species,
  };
  openRemember(c, {
    key: `${o.id}:plot-record`,
    subject: t.species,
    property: 'cultivation plot record',
    value,
    method: 'direct observation of the plot',
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
    'cultivation-condition-observed',
    'The plot was observed; only visible state and local conditions were recorded.',
    { ...summary(c.world, o), scope: 'plot', observation: value },
    o.id,
  );
  return { complete: true, writes: [o.id] };
}

function tend(): V7HandlerResult {
  throw new Error(
    'No tending treatment is supported yet: this world has no carried water, fertilizer or soil amendment, and its plant rules have no weed competition, so no input could change a plot. Nothing was spent.',
  );
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'plant') return plant(c);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'end') return end(c);
  if (mode === 'tend') return tend();
  throw new Error('Unknown cultivation mode.');
}

/** Ordinary simulation: unattended work pauses; planted units establish, stall or rot. */
function lifecycle(w: V7World) {
  for (const j of collectiveJobs(w, ID).filter(open)) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a) continue;
    const o = w.objects.find((x) => x.id === j.target && isPlot(x));
    // Before transfer the reserved unit is still carried.
    for (const id of j.escrow) {
      const s = w.stacks.find((s) => s.id === id && s.reservedFor === j.id);
      if (s) s.position = { ...a.position };
    }
    if (j.status === 'active' && j.lastPaid < w.tick) {
      j.status = 'paused';
      j.reason =
        'Not worked this round; the prepared site and the reserved unit are kept.';
      forestEvent(
        w,
        'cultivation-work-paused',
        'Planting paused because it was not worked this round; the prepared site and the unit are kept.',
        a.position,
        a.id,
        summary(w, o, j),
        o?.id ?? j.id,
      );
    }
    sync(a, j);
  }
  for (const o of w.objects.filter(isPlot)) {
    const t = record(o);
    const unit = buried(w, o);
    if (t.lifecycle === 'planted' && o.data.stage === 'mature') {
      // The existing establishment rule completed this round: the unit became the plant.
      if (unit) w.stacks = w.stacks.filter((s) => s.id !== unit.id);
      t.absorbedUnits = unit?.quantity ?? 0;
      t.absorbedMass = v7RoundNumber(t.absorbedUnits * t.unitMass);
      t.lifecycle = 'established';
      t.establishedAt = w.tick;
      // It is now an ordinary plant of its kind; a plant it disperses inherits this name.
      o.name = t.sourceName;
      forestEvent(
        w,
        'cultivation-plot-established',
        'A sprout was established in the plot through actual growing conditions. It has no stock yet; stock grows only under the existing growth rule.',
        o.spatial,
        null,
        { ...summary(w, o), planter: t.planter },
        o.id,
      );
    } else if (t.lifecycle === 'planted' && !unit) {
      // The unit spoiled under the existing ageing law before establishing.
      o.data.interval = 0;
      o.data.stage = 'dead';
      o.data.stock = 0;
      delete o.data.resource;
      t.lifecycle = 'dead';
      t.endedAt = w.tick;
      t.cause = 'The planted unit decayed before establishing.';
      forestEvent(
        w,
        'cultivation-trial-failed',
        'The unit in the plot rotted before any sprout appeared; nothing grew.',
        o.spatial,
        null,
        { ...summary(w, o), planter: t.planter },
        o.id,
      );
    }
    if (
      t.lifecycle === 'established' &&
      t.maturedAt === null &&
      Number(o.data.stock ?? 0) >= 1
    ) {
      t.maturedAt = w.tick;
      forestEvent(
        w,
        'cultivation-crop-matured',
        'The planted plant grew its first harvestable unit under the existing growth rule; it is harvested with gather.',
        o.spatial,
        null,
        { ...summary(w, o), planter: t.planter },
        o.id,
      );
    }
    refresh(w, o);
  }
  // A plant dispersed from an established plot is ordinary: it shows its plant name, not a plot label.
  for (const o of w.objects.filter(
    (o) => o.revision === REVISION && o.kind === KIND && !isPlot(o),
  ))
    o.visual.label = o.name;
}

export const LONG_PLANT_CULTIVATION: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex16',
  dependencies: ['foundation-open@1'],
  description:
    'A general planting and inspection operation: one owned food unit from a living plant is transferred in two paid rounds into a hand-prepared plot, where it establishes, stalls or rots under the existing plant propagation, growth and ageing rules.',
  reuse: {
    experiment:
      'ex15 cultivation-trial@1 (propagation-law constants, propagule and site predicates, observation inputs, plot footprint, reach and drawing, reused through its exports with unchanged behavior); ex14 cultivate-plant@1 and ex13 root-planting-trial@1 (design lineage)',
    source:
      'open-ecology.ts (existing seedling establishment, growth, dispersal and spacing law, unchanged); forest-environment.ts (existing food ageing and spoilage); long-planting-site.ts (hand-workable site predicate); collective-work.ts (escrow, paid work, stop); open-foundation.ts (baseline probe and personal records); base gather (harvest)',
    description:
      'Implementation reuse only; no earlier ability, plot or mastery is inherited and the ex15 package is unchanged. Planting creates nothing: one real unit becomes a propagule exactly like a naturally dispersed one, and all growth comes from the existing ecology.',
  },
  abilities: [
    {
      id: ID,
      name: 'Cultivate plants',
      function:
        'Plant one owned food unit from a living plant in a small hand-prepared soil plot, where it may establish as a new plant under the existing plant rules; inspect plots or plant sources; end unfinished planting.',
      equivalence: 'cultivation:plant-propagule:plant-inspect:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: ['plant', 'tend', 'inspect', 'end'] },
          target: { type: 'string' },
          inputStackId: { type: 'string' },
          quantity: { type: 'integer', minimum: 1, maximum: 1 },
          x: { type: 'number' },
          y: { type: 'number' },
        }),
        required: ['mode'],
      },
      references: {
        target: 'optional-exact-visible',
        inputStackId: 'optional-owned',
      },
      prerequisites: [],
      learning: 3,
      costs:
        'Study: 3 rounds. Plant: inputStackId names one whole owned, untreated, unspoiled food unit (quantity 1) gathered from a living plant; x, y a 0.25 m plot within reach on ordinary meadow soil (.), waterlogging at most 0.1, soil moisture 0.3-1.2, 0.6 m clear of objects and people, with fewer than 3 plants of that food within 5 m. Two paid rounds of 1.5 energy: prepare the site, then transfer the unit; the action continues itself, and plant resumes paused work after rechecking reach, site, unit and energy. Inspect: target a plot or plant source in reach; one round, 0.2 energy (baseline probe observation). End: stops unfinished planting; one round, no energy. Tend is refused at no cost: no water, fertilizer or other treatment exists yet. Harvest uses gather. No tool, water or seed is provided.',
      effects:
        'Preparing keeps the unit carried, owned and ageing. Transfer moves it, with origin and age, into the plot, where it cannot be eaten or used; the plot becomes a propagule exactly like a naturally dispersed one. It gains establishment only from actual temperature, light, soil moisture and season, so cold, darkness or drought stall it; if the buried unit spoils first, the plot dies. On establishing, the unit becomes a new plant with no stock and a ceiling of at most 4, regrowing under the natural rule, harvested by anyone through gather; nothing is copied or guaranteed. Inspect records only visible stage, stock, soil and weather as an unverified personal record. An unworked round pauses; low energy, leaving reach or a changed site pause without charge; a lost or spoiled unit stops the work. End, or death, before transfer returns the unit once (where the person died); a transferred unit stays planted. No reward or refund.',
      handler: 'long.cultivate-plants',
      revision: REVISION,
      authored: false,
      // The planting event carries no qualified flag: planting earns no milestone.
      practiceEvidence: 'cultivation-propagule-planted',
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Two paid one-round stages whose job, reserved unit and plot persist across interruption; resuming pays only the remaining stage after revalidation; completion, failure, ending and death settle once. Growth proceeds only in ordinary simulation.',
      },
    },
  ],
  handlers: { 'long.cultivate-plants': execute },
  processes: {},
  visualComponents: [VISUAL],
  events: [
    'cultivation-site-prepared',
    'cultivation-propagule-planted',
    'cultivation-work-paused',
    'cultivation-work-resumed',
    'cultivation-trial-ended',
    'cultivation-trial-failed',
    'cultivation-condition-observed',
    'cultivation-plot-established',
    'cultivation-crop-matured',
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
        'Performer died before transfer; the reserved unit was left where they died.',
        true,
      );
      forestEvent(
        w,
        'cultivation-trial-failed',
        'Planting stopped by death before transfer; the unit lies where the person died.',
        a.position,
        a.id,
        summary(w, o, j),
        o?.id ?? j.id,
      );
    }
  },
};
