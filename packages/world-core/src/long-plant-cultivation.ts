import type {
  V7Ability,
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Json,
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

/** Object kind of a plot; it is drawn with the ex15 cultivation-trial drawing. */
const KIND = 'cultivation-plot';
const VISUAL = 'cultivation-trial';
/** Prepare and record the site, then transfer the unit (World Agent specification). ex18
 * instead pays three rounds: loosen, place, cover. */
const STAGES = 2;

/** `placed` and `uncovered` occur only in the three-round ex18 variant: a placed unit lies in
 * the open plot before covering, and stays uncovered when its work stops there. */
type Lifecycle =
  | 'preparing'
  | 'placed'
  | 'uncovered'
  | 'planted'
  | 'established'
  | 'dead'
  | 'ended';
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
  /** ex18 only: the round the unit was placed in the open plot, before covering. */
  placedAt?: number | null;
  plantedAt: number | null;
  establishedAt: number | null;
  maturedAt: number | null;
  endedAt: number | null;
  cause: string | null;
  absorbedUnits: number;
  absorbedMass: number;
  observations: V7Data[];
};

/** Additions of the ex17 planting trial; ex16 has none. */
type Trial = {
  /** Observation window after placement and its optional check rounds: a schedule only. */
  window: number;
  checks: number[];
  /** Energy of one tending round on one plot; null (ex18) when no hand treatment can change a
   * plot, so the care mode is refused before any cost. */
  tend: number | null;
};
/** One variant of the shared operation; ex16 cultivate-plants@1 keeps its original values. */
type Variant = {
  id: string;
  scope: string;
  handler: string;
  /** Energy of each paid planting round. */
  energy: number;
  /** ex18: three paid rounds (loosen, place, cover) instead of two (prepare, transfer). */
  stages?: number;
  /** The mode that stops unfinished planting. */
  stop: string;
  /** ex18: the name of the care mode (ex16 and ex17: 'tend'). */
  care?: string;
  trial: Trial | null;
  description: string;
  reuse: NonNullable<V7Package['reuse']>;
  text: Pick<V7Ability, 'function' | 'equivalence' | 'costs' | 'effects'> & {
    modes: string[];
    progress: string;
  };
  events: string[];
};
/** Production ledger of a placed ex17 plot, kept in its hidden data: what the existing
 * establishment and growth rule produced in actual rounds and which stock units left. */
type Ledger = {
  rounds: number;
  qualifyingRounds: number;
  establishment: number;
  growth: number;
  unitsProduced: number;
  unitsRemoved: number;
  stock: number;
  lastGrowth: number;
};

const LABELS: Record<Lifecycle, string> = {
  preparing: 'Prepared plot',
  placed: 'Plot with placed unit, not covered',
  uncovered: 'Uncovered plot, not planted',
  planted: 'Planted plot, no sprout seen',
  established: 'Sprouted plot',
  dead: 'Failed plot',
  ended: 'Ended plot',
};
/** Visible plot fields compared between two looks by the same person (ex17). */
const VISIBLE = ['lifecycle', 'stage', 'visibleStock', 'sprouted'] as const;

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const record = (o: V7Object) => o.data.plot as PlotRecord;
/** The unit lying in the plot once transferred (owned by nobody, reserved for the plot). */
const buried = (w: V7World, o: V7Object) => {
  const id = record(o).lot;
  return id
    ? w.stacks.find((s) => s.id === id && s.reservedFor === o.id)
    : undefined;
};

/** A placed unit that is not yet, or never was, covered (ex18 only). */
const exposed = (t: PlotRecord) =>
  t.lifecycle === 'placed' || t.lifecycle === 'uncovered';

/** Public plant fields, drawing metadata and labels; it confers no growth or reward. */
function refresh(w: V7World, o: V7Object, stages = STAGES) {
  const t = record(o);
  const elapsed = t.plantedAt === null ? 0 : w.tick - t.plantedAt;
  o.data.mode = t.lifecycle;
  o.data.progress = v7RoundNumber(t.stages / stages);
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
    stages,
    lifecycle: t.lifecycle,
    // Carried while the site is prepared and buried once covered: drawn only while it lies
    // uncovered in the plot (ex18).
    unitVisible: exposed(t),
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

/** The plot's unit is gone before establishing: the plot stops growing and is a failed plot. */
function kill(w: V7World, o: V7Object, cause: string) {
  const t = record(o);
  o.data.interval = 0;
  o.data.stage = 'dead';
  o.data.stock = 0;
  delete o.data.resource;
  t.lifecycle = 'dead';
  t.endedAt = w.tick;
  t.cause = cause;
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

/** The shared operation. Every ex16 path, text and identity is unchanged; `v.trial` adds the
 * ex17 unit and site inspection, progress comparison, tending and production ledger. */
function cultivation(v: Variant): V7Package {
  const ID = v.id;
  const REVISION = `${ID}@1`;
  const STATE = `long:work:${ID}`;
  const STAGE_ENERGY = v.energy;
  const ROUNDS = v.stages ?? STAGES;
  const CARE = v.care ?? 'tend';
  const draw = (w: V7World, o: V7Object) => {
    refresh(w, o, ROUNDS);
  };

  /** A plot. A plant later dispersed from an established plot clones its kind and revision
   * under the existing law but carries no record: it is an ordinary plant. */
  const isPlot = (o: V7Object) =>
    o.revision === REVISION &&
    o.kind === KIND &&
    !!o.data.plot &&
    typeof o.data.plot === 'object' &&
    !Array.isArray(o.data.plot);

  function sync(a: V7Actor, j: CollectiveWork) {
    a.extensionState[STATE] = v7Json(j);
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
            (record(o).lifecycle === 'preparing' ||
              record(o).lifecycle === 'placed') &&
            record(o).species === species)),
    ).length;
    if (crowd >= LAW.crowdingLimit)
      return `${String(crowd)} ${species} plants or prepared plots already stand within 5 m; the existing rule starts no new plant there.`;
    return null;
  }

  /** ex18: the open work's unit already lies in its plot (placed, not covered). */
  const placedPlot = (w: V7World, j: CollectiveWork) => {
    const o = w.objects.find((x) => x.id === j.target && isPlot(x));
    return !!o && record(o).lot !== null;
  };

  function pause(
    c: V7ActionContext,
    j: CollectiveWork,
    o: V7Object,
    reason: string,
  ): V7HandlerResult {
    j.status = 'paused';
    j.reason = reason;
    draw(c.world, o);
    c.emit(
      'cultivation-work-paused',
      `${reason} The prepared site and the unit are kept; nothing was spent.`,
      summary(c.world, o, j),
      o.id,
    );
    sync(c.actor, j);
    return { complete: true, writes: [j.id, o.id] };
  }

  /** Settle unfinished work once: the reserved unit is released and the empty site cleared.
   * ex18: once placed, the unit stays uncovered in the plot, which remains. */
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
      if (t.lot) {
        if (buried(w, o)) {
          t.lifecycle = 'uncovered';
          t.cause = reason;
        } else if (t.lifecycle !== 'dead') kill(w, o, reason);
        draw(w, o);
      } else {
        t.lifecycle = 'ended';
        t.endedAt = w.tick;
        t.cause = reason;
        // Hand-loosened soil is not a represented lasting state, so no object remains.
        w.objects = w.objects.filter((x) => x.id !== o.id);
      }
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
    // ex18: after the placing round the unit lies in the plot, reserved for it.
    const unit = t.lot
      ? buried(c.world, o)
      : c.world.stacks.find(
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
    // Transfer moves the unit, with its origin, mass and age, out of the inventory into the soil.
    const transfer = () => {
      unit.owner = null;
      unit.reservedFor = o.id;
      unit.position = { x: o.spatial.x, y: o.spatial.y };
      t.lot = unit.id;
      t.transferDecay = unit.decay ?? 0;
    };
    if (t.stages === 1) {
      draw(c.world, o);
      c.emit(
        'cultivation-site-prepared',
        'A small plot was loosened by hand and recorded; the unit is still carried and owned.',
        summary(c.world, o, j),
        o.id,
      );
    } else if (t.stages < ROUNDS) {
      // ex18 placing round: the unit lies in the open plot; only covering completes planting.
      transfer();
      t.placedAt = c.world.tick;
      t.lifecycle = 'placed';
      draw(c.world, o);
      c.emit(
        'cultivation-unit-placed',
        'The unit was placed in the loosened plot and left uncovered; it can no longer be eaten or used, and only covering completes planting.',
        { ...summary(c.world, o, j), unit: v7Json(unit) },
        o.id,
      );
    } else {
      // At the last round the plot becomes a propagule exactly like a naturally dispersed one.
      const placed = !!t.lot;
      if (!placed) transfer();
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
      if (v.trial) {
        const ledger: Ledger = {
          rounds: 0,
          qualifyingRounds: 0,
          establishment: 0,
          growth: 0,
          unitsProduced: 0,
          unitsRemoved: 0,
          stock: 0,
          lastGrowth: 0,
        };
        o.data.ledger = ledger;
      }
      j.status = 'completed';
      j.outputs = [o.id];
      draw(c.world, o);
      c.emit(
        'cultivation-propagule-planted',
        placed
          ? 'The placed unit was covered with soil, completing planting, not establishment. It establishes only through actual temperature, light, soil moisture and season, and may stall or rot; no food was produced.'
          : 'The unit was transferred into the plot and covered. It establishes only through actual temperature, light, soil moisture and season, and may stall or rot; no food was produced.',
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
        `${String(STAGE_ENERGY)} energy is required for the first round. Nothing was spent.`,
      );
    const j = workCreate(c, 'plant', ROUNDS);
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
      ...(ROUNDS > STAGES ? { placedAt: null } : {}),
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
        `No unfinished planting to ${v.stop}; a transferred unit stays in its plot under the world rules. Nothing was spent.`,
      );
    const returned = j.escrow.flatMap((id) => {
      const s = c.world.stacks.find(
        (s) => s.id === id && s.reservedFor === j.id,
      );
      return s
        ? [{ itemId: s.id, quantity: s.quantity, decay: s.decay ?? 0 }]
        : [];
    });
    // ex18: after the placing round the unit already lies in the plot and stays there.
    const placed = placedPlot(c.world, j);
    const o = settle(
      c.world,
      c.actor,
      j,
      placed
        ? 'Cancelled after placing; the unit stays uncovered in the plot, where it does not establish. Spent energy and time are not refunded.'
        : 'Ended before transfer; the reserved unit returns once in its current condition. Spent energy and time are not refunded.',
    );
    c.emit(
      'cultivation-trial-ended',
      placed
        ? 'Planting cancelled after placing; the unit stays uncovered in the plot, keeps ageing and does not establish.'
        : 'Planting ended before transfer; the unit was returned once in its current condition and the prepared site was cleared.',
      { ...summary(c.world, o, j), returned },
      o?.id ?? j.id,
    );
    return { complete: true, writes: [j.id, ...j.escrow] };
  }

  /** The exact visible plot or plant source within reach. */
  function subject(c: V7ActionContext): V7Object {
    const id = v7String(c.action.args.target, 'target');
    const o = c.world.objects.find((x) => x.id === id);
    const resource =
      typeof o?.data.resource === 'string' ? o.data.resource : '';
    if (!o || !(isPlot(o) || plantOf(o, resource)))
      throw new Error(
        'Target a plot or a visible plant source. Nothing was spent.',
      );
    if (!reach(c.actor, o))
      throw new Error('Move within reach of the target. Nothing was spent.');
    return o;
  }

  /** ex17: visible fields that differ from this person's previous look at the plot (or from the
   * covered state at placement); no visible change is inconclusive, never success or failure. */
  function compare(
    c: V7ActionContext,
    o: V7Object,
    value: V7Data,
    trial: Trial,
  ): V7Data {
    const t = record(o);
    const old = c.actor.memory.knowledge?.[`${o.id}:plot-record`]?.value;
    const last: V7Data | null =
      old && typeof old === 'object' && !Array.isArray(old)
        ? old
        : t.plantedAt === null
          ? null
          : {
              lifecycle: 'planted',
              stage: 'seedling',
              visibleStock: 0,
              sprouted: false,
            };
    const changes: V7Json[] = last
      ? VISIBLE.filter(
          (k) =>
            JSON.stringify(last[k] ?? null) !==
            JSON.stringify(value[k] ?? null),
        ).map((k) => ({
          field: k,
          before: last[k] ?? null,
          after: value[k] ?? null,
        }))
      : [];
    const elapsed = Number(value.elapsedSincePlanting);
    return {
      result: changes.length ? 'changed' : 'inconclusive',
      changes,
      window:
        t.plantedAt === null
          ? null
          : {
              rounds: trial.window,
              endsAt: t.plantedAt + trial.window,
              open: elapsed <= trial.window,
              nextCheck: trial.checks.find((n) => n >= elapsed) ?? null,
            },
    };
  }

  /** The visible plot state as an unverified personal record. */
  function look(c: V7ActionContext, o: V7Object, conditions: V7Data): V7Data {
    const t = record(o);
    const value: V7Data = {
      lifecycle: t.lifecycle,
      stage: o.data.stage ?? null,
      elapsedSincePlanting:
        t.plantedAt === null ? 0 : c.world.tick - t.plantedAt,
      visibleStock: t.lifecycle === 'established' ? Number(o.data.stock) : 0,
      sprouted: t.lifecycle === 'established',
      conditions,
      species: t.species,
    };
    // ex18: an uncovered unit is visible in the plot, so its food condition can be seen.
    const unit = exposed(t) ? buried(c.world, o) : undefined;
    if (exposed(t))
      value.unitCondition = unit
        ? v7RoundNumber(
            Math.max(0, 1 - (unit.decay ?? 0) / lifetime(c.world, unit)),
          )
        : null;
    if (v.trial) Object.assign(value, compare(c, o, value, v.trial));
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
    draw(c.world, o);
    return value;
  }

  /** Baseline probe observation plus a personal unverified record of what is visible. */
  function observe(c: V7ActionContext, o: V7Object): V7HandlerResult {
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
    const value = look(c, o, conditions);
    c.emit(
      'cultivation-condition-observed',
      'The plot was observed; only visible state and local conditions were recorded.',
      { ...summary(c.world, o), scope: 'plot', observation: value },
      o.id,
    );
    return { complete: true, writes: [o.id] };
  }

  /** ex17: whether a site within reach can take a unit of this food, with its local soil. */
  function site(c: V7ActionContext, species: string): V7Data {
    const x = v7Number(c.action.args.x, 'site x'),
      y = v7Number(c.action.args.y, 'site y');
    const spatial = position(x, y);
    if (v7ShapeDistance(c.actor.position, spatial) > c.actor.radius + 0.65)
      throw new Error('Move within reach of the site. Nothing was spent.');
    const soil = openConditions(c.world, spatial);
    const error = siteError(c.world, c.actor, spatial, species);
    return {
      x,
      y,
      ground: soil.ground,
      moisture: soil.moisture,
      waterlogging: soil.waterlogging,
      regime: soil.regime,
      plantable: error === null,
      reason: error,
    };
  }

  /** ex17: the observable integrity of one owned unit and, with x, y, of a site for it. It
   * spends the baseline observation cost, changes nothing and never reports viability. */
  function inspectUnit(c: V7ActionContext, id: string): V7HandlerResult {
    const s = c.world.stacks.find((s) => s.id === id && s.owner === c.actor.id);
    if (!s) throw new Error('Name one of your own units. Nothing was spent.');
    if (s.reservedFor)
      throw new Error(
        'That unit is reserved for unfinished work. Nothing was spent.',
      );
    let reason: string | null = null;
    try {
      propagule(c.world, s);
      if (s.quantity < 1)
        reason = 'Less than one whole unit remains; planting needs one.';
    } catch (e) {
      reason = (e instanceof Error ? e.message : String(e)).replace(
        ' Nothing was reserved.',
        '',
      );
    }
    const where =
      c.action.args.x === undefined && c.action.args.y === undefined
        ? null
        : site(c, s.resource);
    v7Spend(c.actor, 0.2);
    const life = lifetime(c.world, s);
    const value: V7Data = {
      resource: s.resource,
      quantity: s.quantity,
      origin: s.origin,
      harvestedAt: s.harvestedAt ?? null,
      decay: v7RoundNumber(s.decay ?? 0),
      condition:
        life > 0 ? v7RoundNumber(Math.max(0, 1 - (s.decay ?? 0) / life)) : null,
      treated: TREATED.filter((key) => s[key] !== undefined),
      buds: 'not represented',
      viability: 'unknown',
      plantable: reason === null,
      reason,
      site: where,
    };
    openRemember(c, {
      key: `${s.id}:planting-unit`,
      subject: s.resource,
      property: 'planting unit condition',
      value,
      method: 'direct inspection of the unit',
      condition: openConditions(c.world, c.actor.position).regime,
      verified: false,
    });
    c.emit(
      'cultivation-condition-observed',
      'The unit was inspected; only its visible condition was recorded, not whether it will grow.',
      { scope: 'unit', item: s.id, observation: value, tick: c.world.tick },
      s.id,
    );
    return { complete: true, writes: [] };
  }

  function inspect(c: V7ActionContext): V7HandlerResult {
    const unit = c.action.args.inputStackId;
    if (v.trial && typeof unit === 'string' && unit)
      return inspectUnit(c, unit);
    return observe(c, subject(c));
  }

  /** ex17: a progress look at a plot through the baseline probe observation. */
  function progress(c: V7ActionContext): V7HandlerResult {
    const o = subject(c);
    if (!isPlot(o))
      throw new Error('Inspect-progress targets a plot. Nothing was spent.');
    return observe(c, o);
  }

  /** ex17: one round of hand care on one placed plot. The existing plant rules keep 0.6 m around
   * every plant clear, so no competing plant can stand there and nothing is removed; tending adds
   * no water, nutrient or growth. */
  function tend(c: V7ActionContext, energy: number): V7HandlerResult {
    const o = subject(c);
    if (!isPlot(o)) throw new Error('Tend targets a plot. Nothing was spent.');
    const t = record(o);
    if (t.lifecycle !== 'planted' && t.lifecycle !== 'established')
      throw new Error(
        'Only a planted or sprouted plot can be tended. Nothing was spent.',
      );
    v7Spend(c.actor, energy);
    const competing = c.world.objects
      .filter(
        (x) =>
          x.id !== o.id &&
          x.kind !== 'animal' &&
          Number(x.data.interval) > 0 &&
          v7Distance(x.spatial, o.spatial) < LAW.spacing,
      )
      .map((x) => x.id);
    const value = look(c, o, inputs(c.world, o));
    c.emit(
      'cultivation-plot-tended',
      competing.length
        ? 'The plot was checked by hand. A plant stands within 0.6 m, but removing a plant is not represented, so nothing was removed; no water, nutrient or growth was added.'
        : 'The plot and its 0.6 m clearance were checked by hand. No competing plant stands there, so nothing was removed; no water, nutrient or growth was added.',
      {
        ...summary(c.world, o),
        observation: value,
        competingPlants: competing,
        removed: 0,
        energy,
      },
      o.id,
    );
    return { complete: true, writes: [o.id] };
  }

  function untended(): V7HandlerResult {
    throw new Error(
      'No tending treatment is supported yet: this world has no carried water, fertilizer or soil amendment, and its plant rules have no weed competition, so no input could change a plot. Nothing was spent.',
    );
  }

  /** ex18: maintenance is enabled only with a real input and effect; none exists yet. */
  function unmaintained(): V7HandlerResult {
    throw new Error(
      'No maintenance can be performed yet: watering needs a measured reachable water supply and a way to carry it, and this world has neither; no fertilizer or amendment exists; and the plant rules keep 0.6 m around a plot clear, so no obstruction or surface condition can be changed by hand. Use inspect-progress to observe a plot. Nothing was spent.',
    );
  }

  function execute(c: V7ActionContext): V7HandlerResult {
    const mode = v7String(c.action.args.mode, 'mode');
    if (mode === 'plant') return plant(c);
    if (mode === 'inspect') return inspect(c);
    if (mode === v.stop) return end(c);
    if (mode === CARE)
      return !v.trial
        ? untended()
        : v.trial.tend === null
          ? unmaintained()
          : tend(c, v.trial.tend);
    if (v.trial && mode === 'inspect-progress') return progress(c);
    throw new Error('Unknown cultivation mode.');
  }

  /** ex17: one round of the production ledger after the unchanged ecology has run. */
  function account(o: V7Object) {
    const t = record(o);
    const l = o.data.ledger as Ledger | undefined;
    if (!l || (t.lifecycle !== 'planted' && t.lifecycle !== 'established'))
      return;
    const growth = Number(o.data.growth ?? 0),
      interval = Number(o.data.interval),
      produced = Number(o.data.produced ?? 0),
      stock = Number(o.data.stock ?? 0),
      establishment = Number(o.data.establishment ?? 0);
    // The growth counter wraps by the interval whenever the rule completes a unit.
    const grown =
      growth >= l.lastGrowth
        ? growth - l.lastGrowth
        : growth + interval - l.lastGrowth;
    l.rounds += 1;
    if (establishment > l.establishment || grown > 0) l.qualifyingRounds += 1;
    l.establishment = v7RoundNumber(establishment);
    l.growth = v7RoundNumber(l.growth + grown);
    // Units leave only through gather, foraging or dispersal; the plant itself stays.
    l.unitsRemoved += Math.max(0, l.stock + produced - l.unitsProduced - stock);
    l.unitsProduced = produced;
    l.stock = stock;
    l.lastGrowth = growth;
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
      if (v.trial) account(o);
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
      } else if ((t.lifecycle === 'planted' || exposed(t)) && !unit) {
        // The unit spoiled under the existing ageing law before establishing (ex18: or while
        // it lay uncovered in the plot).
        kill(
          w,
          o,
          exposed(t)
            ? 'The placed unit decayed before it was covered.'
            : 'The planted unit decayed before establishing.',
        );
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
      draw(w, o);
    }
    // A plant dispersed from an established plot is ordinary: it shows its plant name, not a plot label.
    for (const o of w.objects.filter(
      (o) => o.revision === REVISION && o.kind === KIND && !isPlot(o),
    ))
      o.visual.label = o.name;
  }

  return {
    id: ID,
    version: 1,
    scope: v.scope,
    dependencies: ['foundation-open@1'],
    description: v.description,
    reuse: v.reuse,
    abilities: [
      {
        id: ID,
        name: 'Cultivate plants',
        function: v.text.function,
        equivalence: v.text.equivalence,
        parameters: {
          ...v7ObjectSchema({
            mode: { type: 'string', enum: v.text.modes },
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
        costs: v.text.costs,
        effects: v.text.effects,
        handler: v.handler,
        revision: REVISION,
        authored: false,
        // The planting event carries no qualified flag: planting earns no milestone.
        practiceEvidence: 'cultivation-propagule-planted',
        dependencies: { abilities: [], resources: [], knowledge: [] },
        execution: {
          duration: null,
          interruption: 'cancel',
          progress: v.text.progress,
        },
      },
    ],
    handlers: { [v.handler]: execute },
    processes: {},
    visualComponents: [VISUAL],
    events: v.events,
    resources: [],
    satisfaction: [],
    afterEnvironment: lifecycle,
    onDeath(w, a) {
      for (const j of collectiveJobs(w, ID).filter(
        (j) => j.owner === a.id && open(j),
      )) {
        // ex18: a unit already placed stays uncovered in its plot.
        const placed = placedPlot(w, j);
        const o = settle(
          w,
          a,
          j,
          placed
            ? 'Performer died after placing; the unit stays uncovered in the plot.'
            : 'Performer died before transfer; the reserved unit was left where they died.',
          true,
        );
        forestEvent(
          w,
          'cultivation-trial-failed',
          placed
            ? 'Planting stopped by death after placing; the unit stays uncovered in the plot and does not establish.'
            : 'Planting stopped by death before transfer; the unit lies where the person died.',
          a.position,
          a.id,
          summary(w, o, j),
          o?.id ?? j.id,
        );
      }
    },
  };
}

const EVENTS = [
  'cultivation-site-prepared',
  'cultivation-propagule-planted',
  'cultivation-work-paused',
  'cultivation-work-resumed',
  'cultivation-trial-ended',
  'cultivation-trial-failed',
  'cultivation-condition-observed',
  'cultivation-plot-established',
  'cultivation-crop-matured',
];

export const LONG_PLANT_CULTIVATION: V7Package = cultivation({
  id: 'cultivate-plants',
  scope: 'long-ex16',
  handler: 'long.cultivate-plants',
  energy: 1.5,
  stop: 'end',
  trial: null,
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
  text: {
    function:
      'Plant one owned food unit from a living plant in a small hand-prepared soil plot, where it may establish as a new plant under the existing plant rules; inspect plots or plant sources; end unfinished planting.',
    equivalence: 'cultivation:plant-propagule:plant-inspect:1',
    modes: ['plant', 'tend', 'inspect', 'end'],
    costs:
      'Study: 3 rounds. Plant: inputStackId names one whole owned, untreated, unspoiled food unit (quantity 1) gathered from a living plant; x, y a 0.25 m plot within reach on ordinary meadow soil (.), waterlogging at most 0.1, soil moisture 0.3-1.2, 0.6 m clear of objects and people, with fewer than 3 plants of that food within 5 m. Two paid rounds of 1.5 energy: prepare the site, then transfer the unit; the action continues itself, and plant resumes paused work after rechecking reach, site, unit and energy. Inspect: target a plot or plant source in reach; one round, 0.2 energy (baseline probe observation). End: stops unfinished planting; one round, no energy. Tend is refused at no cost: no water, fertilizer or other treatment exists yet. Harvest uses gather. No tool, water or seed is provided.',
    effects:
      'Preparing keeps the unit carried, owned and ageing. Transfer moves it, with origin and age, into the plot, where it cannot be eaten or used; the plot becomes a propagule exactly like a naturally dispersed one. It gains establishment only from actual temperature, light, soil moisture and season, so cold, darkness or drought stall it; if the buried unit spoils first, the plot dies. On establishing, the unit becomes a new plant with no stock and a ceiling of at most 4, regrowing under the natural rule, harvested by anyone through gather; nothing is copied or guaranteed. Inspect records only visible stage, stock, soil and weather as an unverified personal record. An unworked round pauses; low energy, leaving reach or a changed site pause without charge; a lost or spoiled unit stops the work. End, or death, before transfer returns the unit once (where the person died); a transferred unit stays planted. No reward or refund.',
    progress:
      'Two paid one-round stages whose job, reserved unit and plot persist across interruption; resuming pays only the remaining stage after revalidation; completion, failure, ending and death settle once. Growth proceeds only in ordinary simulation.',
  },
  events: EVENTS,
});

/** ex17: the same operation as a planting trial with unit and site inspection, progress
 * comparison, hand tending and a production ledger, at 1 energy per planting round. */
export const LONG_EX17_PLANT_CULTIVATION: V7Package = cultivation({
  id: 'plant-cultivation',
  scope: 'long-ex17',
  handler: 'long.plant-cultivation',
  energy: 1,
  stop: 'abandon',
  trial: { window: 20, checks: [5, 10, 20], tend: 0.5 },
  description:
    'A general planting trial: one owned food unit from a living plant is moved in two paid rounds into a hand-dug plot, where it roots, stalls or rots under the existing plant propagation, growth and ageing rules, with unit, site and progress inspection, hand tending and a production ledger.',
  reuse: {
    experiment:
      'ex16 cultivate-plants@1 (the same operation code through a shared factory; ex16 text, handler and behavior unchanged); ex15 cultivation-trial@1 (law constants, propagule and site predicates, observation inputs, footprint, reach and drawing)',
    source:
      'open-ecology.ts (existing seedling establishment, growth, dispersal and spacing law, unchanged); forest-environment.ts (existing food ageing); long-planting-site.ts (hand-workable site); collective-work.ts (escrow, paid work, stop); open-foundation.ts (baseline probe and personal records); base gather (harvest)',
    description:
      'Implementation reuse only; no earlier ability, plot or mastery is inherited. Planting creates nothing: one real unit becomes a propagule exactly like a naturally dispersed one, and all growth comes from the existing ecology.',
  },
  text: {
    function:
      'Plant one owned food unit from a living plant in a small hand-dug plot, where it may root as a new plant under the existing plant rules; inspect units, sites, plants and plot progress; tend plots; abandon unfinished planting.',
    equivalence: 'cultivation:plant-propagule:trial-inspect-tend:1',
    modes: ['inspect', 'plant', 'tend', 'inspect-progress', 'abandon'],
    costs:
      'Study: 3 rounds. Plant: inputStackId names one whole owned, untreated, unspoiled food unit (quantity 1; one plot per unit) gathered from a living plant; x, y a 0.25 m plot within reach on ordinary meadow soil (.), waterlogging at most 0.1, soil moisture 0.3-1.2, 0.6 m clear of objects and people, with fewer than 3 plants of that food within 5 m. Two paid rounds of 1 energy: dig, then place and cover the unit; plant resumes paused work after rechecking reach, site, unit and energy. Inspect and inspect-progress: one round, 0.2 energy. Inspect: inputStackId checks a unit (with x, y also a site for it), or target a plant source or plot in reach. Inspect-progress: target a plot in reach. Tend: target a planted plot in reach; one round, 0.5 energy. Abandon: stops unfinished planting; one round, no energy. Harvest uses gather. No tool, water or seed is given.',
    effects:
      'Digging keeps the unit carried, owned and ageing. Placing moves it, with origin and age, into the plot, where it cannot be eaten or used; the plot becomes a propagule exactly like a naturally dispersed one. It establishes only through actual temperature, light, soil moisture and season; cold, darkness or drought stall it; if the buried unit spoils first, the plot dies. On rooting, the unit becomes a new plant with no stock (ceiling 4), regrowing under the natural rule, harvested by anyone with gather; a ledger records growth and units produced and removed. Nothing is copied or guaranteed. A unit check reports decay, treatment, origin and whether it can be planted, never viability. Inspect-progress reports visible changes since your last look, else inconclusive; trial window 20 rounds, optional checks at 5, 10 and 20; not a growth date. Tend checks the plot and its 0.6 m clearance, kept free of plants by the plant rules; it removes nothing and adds no water, nutrient or growth. Records are unverified. An unworked round pauses; low energy, leaving reach or a changed site pause without charge; a lost or spoiled unit stops the work. Abandon, or death, before placement returns the unit once (where the person died); a placed unit stays. No reward or refund.',
    progress:
      'Two paid one-round stages; job, reserved unit and plot persist across interruption; resuming pays only the remaining stage after revalidation; completion, failure, abandoning and death settle once. Growth runs only in ordinary simulation.',
  },
  events: [...EVENTS, 'cultivation-plot-tended'],
});

/** ex18: the same operation as a three-round establishment trial (loosen, place, cover) with
 * unit, site and progress inspection, a 120-round observation window and a production ledger.
 * Maintenance is refused before any cost: no water transfer, amendment or hand-changeable
 * obstruction exists in this world. */
export const LONG_EX18_PLANT_ESTABLISHMENT: V7Package = cultivation({
  id: 'plant-establishment-trial',
  scope: 'long-ex18',
  handler: 'long.plant-establishment-trial',
  energy: 1,
  stages: 3,
  stop: 'cancel',
  care: 'maintain',
  trial: {
    window: 120,
    checks: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120],
    tend: null,
  },
  description:
    'A general plant establishment trial: one owned food unit from a living plant is loosened into, placed in and covered by a hand-dug plot in three paid rounds, where it roots, stalls or rots under the existing plant propagation, growth and ageing rules, with unit, site and progress inspection and a production ledger; maintenance is refused while no real treatment exists.',
  reuse: {
    experiment:
      'ex17 plant-cultivation@1 and ex16 cultivate-plants@1 (the same operation code through the shared factory; their texts, handlers and behavior unchanged); ex15 cultivation-trial@1 (three-round loosen, place, cover design, law constants, propagule and site predicates, observation inputs, footprint, reach and drawing)',
    source:
      'open-ecology.ts (existing seedling establishment, growth, dispersal and spacing law, unchanged); forest-environment.ts (existing food ageing); long-planting-site.ts (hand-workable site); collective-work.ts (escrow, paid work, stop); open-foundation.ts (baseline probe and personal records); base gather (harvest)',
    description:
      'Implementation reuse only; no earlier ability, plot or mastery is inherited. Planting creates nothing: one real unit becomes a propagule exactly like a naturally dispersed one, and all growth comes from the existing ecology.',
  },
  text: {
    function:
      'Plant one owned food unit from a living plant in a small hand-dug plot, where it may root as a new plant under the existing plant rules; inspect units, sites, plants and plot progress; cancel unfinished planting.',
    equivalence: 'cultivation:plant-propagule:loosen-place-cover:1',
    modes: ['inspect', 'plant', 'inspect-progress', 'maintain', 'cancel'],
    costs:
      'Study: 3 rounds. Plant: inputStackId names one whole owned, untreated, unspoiled food unit (quantity 1; one plot per unit) gathered from a living plant; stock still on a plant is not owned. x, y: a 0.25 m plot within reach on ordinary meadow soil (.), waterlogging at most 0.1, soil moisture 0.3-1.2, 0.6 m clear of objects and people, fewer than 3 plants of that food within 5 m. Three paid rounds of 1 energy: loosen, place, cover; plant resumes paused work after rechecking reach, site, unit and energy. Inspect and inspect-progress: one round, 0.2 energy. Inspect: inputStackId checks a unit (with x, y also a site for it), or target a plant source or plot in reach. Inspect-progress: target a plot in reach. Maintain: refused at no cost. Cancel: one round, no energy. Harvest uses gather. No tool, water or seed is given.',
    effects:
      'Loosening keeps the unit carried, owned and ageing. Placing moves it, with origin and age, into the open plot, where it cannot be eaten or used. Covering completes planting, not establishment: the plot becomes a propagule exactly like a naturally dispersed one, rooting only through actual temperature, light, soil moisture and season; cold, darkness or drought stall it; if the buried unit spoils first, the plot dies. On rooting, the unit becomes a new plant with no stock (ceiling 4), regrowing under the natural rule, harvested by anyone with gather; a ledger records growth and units produced and removed. Nothing is copied or guaranteed. A unit check reports decay, treatment, origin and whether it can be planted, never viability. Inspect-progress reports visible changes since your last look, else inconclusive; trial window 120 rounds, checks every 10; not a growth date. Maintain: no water transfer, amendment or hand-changeable obstruction exists. Records are unverified. An unworked round pauses; low energy, leaving reach or a changed site pause without charge; a lost or spoiled unit stops the work. Cancel, or death, before placing returns the unit once (where the person died); after placing, the unit stays uncovered, does not root and ages. No reward or refund.',
    progress:
      'Three paid one-round stages; job, reserved unit and plot persist across interruption; resuming pays only the remaining stages after revalidation; completion, failure, cancelling and death settle once. Growth runs only in ordinary simulation.',
  },
  events: [...EVENTS, 'cultivation-unit-placed'],
});
