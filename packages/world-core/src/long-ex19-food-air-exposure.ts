import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Point,
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
import { v7Distance, v7Reach } from './continuous-geometry.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import { foodTenths } from './forest-food-accounting.js';
import { forestEvent } from './forest-climate.js';
import {
  foodWaterActive,
  foodWaterExpose,
  foodWaterRead,
  foodWaterSurfaceArea,
} from './food-water.js';
import type { FoodWaterSurface } from './food-water.js';
import { openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workAllocations,
  workCreate,
  workPay,
  workReserve,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';

/** Start: one active round of 1 + 0.5 energy per exposed whole unit (World Agent specification). */
const START_BASE = 1;
const START_PER_UNIT = 0.5;
/** Inspection: one round and the probe observation cost of 0.2. */
const LOOK = 0.2;
/** Declared footprint of whole units laid singly on open ground: about 0.2 x 0.2 per unit. */
const GROUND_AREA_PER_UNIT = 0.04;
/** Readings kept in the trial record; older inspections stay in the personal record only. */
const OBSERVATIONS = 12;
/** Represented treatments for which whole-food exposure has no defined result. */
const TREATED = [
  'materialLayer',
  'canopyDrying',
  'frictionKit',
  'waterCup',
  'mantle',
  'fuelMoisture',
  'componentLots',
] as const;

/** The persistent trial record: one paid placement round, then unattended exposure. */
interface Trial extends CollectiveWork {
  stage: string;
  input: string;
  resource: string;
  batch: string;
  control: string | null;
  placement: V7Data;
  placedAt: number;
  quantity: number;
  initialQuantity: number;
  controlQuantity: number;
  batchDecay0: number;
  batchDecay: number;
  controlDecay0: number | null;
  controlDecay: number | null;
  controlSpoiledAt: number | null;
  rainRounds: number;
  wet: boolean;
  observations: V7Data[];
  lastUpdate: number;
  endedAt: number | null;
  takenBy: string | null;
}

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const round = (x: number) => v7RoundNumber(x);
const wholeUnits = (s: V7Stack) => Math.floor(foodTenths(s.quantity) / 10);
const lifetime = (w: V7World, resource: string) =>
  w.resources.find((r) => r.id === resource)?.properties?.decay ?? 0;
const spoiledNow = (w: V7World, id: string) =>
  w.events.some((e) => e.type === 'spoiled' && e.target === id);

/** The exposed batch while it still lies, unowned, on its surface. */
function lying(w: V7World, j: Trial): V7Stack | undefined {
  const s = w.stacks.find((s) => s.id === j.batch);
  return s && s.owner === null && s.quantity > 0 && foodWaterRead(s)?.surface
    ? s
    : undefined;
}
/** Where the batch was laid: the ground footprint centre or the support. */
function where(w: V7World, j: Trial, a: V7Actor): V7Point {
  const p = j.placement,
    o = w.objects.find((o) => o.id === p.id);
  if (p.kind === 'ground') return { x: Number(p.x), y: Number(p.y) };
  return o ? { x: o.spatial.x, y: o.spatial.y } : { ...a.position };
}

/** Why this method cannot expose the stack, or null. */
function unsupported(w: V7World, s: V7Stack): string | null {
  const r = collectiveFoodProfile(w, s);
  if (!r || r.nutrition <= 0) return 'Only edible food can be exposed.';
  if (lifetime(w, s.resource) > 0 && (s.decay ?? 0) >= lifetime(w, s.resource))
    return 'Spoiled food cannot be exposed.';
  if (!foodWaterActive(w))
    return 'This world has no food water representation.';
  if (
    TREATED.some((k) => s[k] !== undefined) ||
    Object.keys(s.processing ?? {}).some((k) => k !== 'preservationPhysics')
  )
    return 'Food with another represented treatment (layers, combination, equipment or processing) has no defined exposure result.';
  const water = foodWaterRead(s);
  if (water?.prepared)
    return 'Opened food is not whole; this trial exposes only whole food.';
  if (water?.surface)
    return 'The food already lies on a surface; take it up first.';
  if (!s.physical && !['berry', 'root'].includes(s.resource))
    return 'Water composition is represented only for berries and roots; none is invented.';
  return null;
}

/** One trajectory of real decay since placement; a vanished stack keeps its last reading. */
function track(
  w: V7World,
  id: string,
  start: number,
  last: number,
  elapsed: number,
  resource: string,
): V7Data {
  const s = w.stacks.find((s) => s.id === id),
    decay = s ? (s.decay ?? 0) : last,
    life = lifetime(w, resource);
  return {
    item: id,
    present: !!s,
    quantity: s?.quantity ?? 0,
    decayAtPlacement: round(start),
    decay: round(decay),
    decayGained: round(decay - start),
    decayPerRound: elapsed > 0 ? round((decay - start) / elapsed) : null,
    lifetime: life,
    visibleSpoilage: !s ? 'gone' : decay >= life ? 'spoiled' : 'none seen',
  };
}

/** Reusable food-batch visual metadata; it never shows dryness or preservation. */
function view(w: V7World, j: Trial, a: V7Actor): V7Data {
  const s = w.stacks.find((s) => s.id === j.batch),
    p = j.placement,
    at = s?.position ?? where(w, j, a);
  return {
    component: 'ground-stack',
    item: j.batch,
    resource: j.resource,
    color: w.resources.find((r) => r.id === j.resource)?.color ?? '#cfaf79',
    quantity: s?.quantity ?? 0,
    placement: p.kind === 'object' ? 'support' : 'ground',
    support: p.kind === 'object' ? (p.id ?? null) : null,
    x: at.x,
    y: at.y,
    form: 'intact',
    state: j.stage,
    surface: j.wet ? 'wet from rain' : 'no visible change',
    preservation: 'unverified',
  };
}

/** Everything inspection can record: actual quantities, decay and rain on the batch. */
function report(w: V7World, j: Trial): V7Data {
  const elapsed = w.tick - j.placedAt,
    exposed = track(
      w,
      j.batch,
      j.batchDecay0,
      j.batchDecay,
      elapsed,
      j.resource,
    ),
    control =
      j.control && j.controlDecay0 !== null
        ? track(
            w,
            j.control,
            j.controlDecay0,
            j.controlDecay ?? j.controlDecay0,
            elapsed,
            j.resource,
          )
        : null;
  const ground = j.placement.kind === 'ground';
  return {
    trial: j.id,
    stage: j.stage,
    mode: 'whole-food',
    resource: j.resource,
    input: j.input,
    placement: j.placement,
    placedAt: j.placedAt,
    tick: w.tick,
    elapsedRounds: elapsed,
    exposed,
    control,
    controlSpoiledAt: j.controlSpoiledAt,
    decayDifference: control
      ? round(Number(exposed.decayGained) - Number(control.decayGained))
      : null,
    handling: control
      ? `Batch lying on ${ground ? 'open ground' : 'the support'}; control carried by you. Location and handling differ.`
      : 'No control was kept.',
    rainRounds: j.rainRounds,
    wetNow: j.wet,
    takenBy: j.takenBy,
    water: 'not measured; no weighing or moisture reading was made',
    drying: 'none for whole food under the represented rules',
    contamination: `${ground ? 'ground' : 'support'} contact; not assessed`,
    safety: 'unverified',
    preservation: 'unverified',
    paidEnergy: round(j.paidEnergy),
  };
}

function sync(a: V7Actor, j: Trial, key: string) {
  a.extensionState[key] = v7Json(j);
}

/** Ends a trial once: releases the carried control and keeps the final report. */
function settle(
  w: V7World,
  a: V7Actor,
  j: Trial,
  stage: string,
  reason: string,
  ground: boolean,
): string[] {
  const released = j.escrow.filter((id) =>
    w.stacks.some((s) => s.id === id && s.reservedFor === j.id),
  );
  j.x = a.position.x;
  j.y = a.position.y;
  workStop(w, a, j, reason, ground);
  j.stage = stage;
  j.endedAt = w.tick;
  j.outcome = v7Json(report(w, j));
  return released;
}

/** A general whole-food air-exposure trial over the installed food water representation. */
export function foodAirExposurePackage(id: string, scope: string): V7Package {
  const revision = `${id}@1`;
  const handler = `long.${id}`;
  const stateKey = `long:work:${id}`;
  const trials = (w: V7World) => collectiveJobs(w, id).map((j) => j as Trial);
  const current = (w: V7World, a: V7Actor) =>
    trials(w).find((j) => j.owner === a.id && open(j));

  function placement(c: V7ActionContext, quantity: number): FoodWaterSurface {
    const { world: w, actor: a, action } = c;
    const support =
      typeof action.args.supportId === 'string' ? action.args.supportId : '';
    if (support) {
      if (action.args.x !== undefined || action.args.y !== undefined)
        throw new Error(
          'Give either x and y or supportId, not both. Nothing was spent.',
        );
      const o: V7Object | undefined = w.objects.find((o) => o.id === support);
      if (!o)
        throw new Error(`No actual object ${support}. Nothing was spent.`);
      if (!v7Reach(a, o.spatial))
        throw new Error(`${support} is out of reach. Nothing was spent.`);
      return { kind: 'object', id: support };
    }
    const point: V7Point = {
      x:
        action.args.x === undefined
          ? a.position.x
          : v7Number(action.args.x, 'x'),
      y:
        action.args.y === undefined
          ? a.position.y
          : v7Number(action.args.y, 'y'),
    };
    if (v7Distance(a.position, point) > a.radius + w.config.interaction)
      throw new Error(
        'The placement point is beyond hand reach; walk there first. Nothing was spent.',
      );
    return {
      kind: 'ground',
      x: point.x,
      y: point.y,
      area: round(GROUND_AREA_PER_UNIT * quantity),
    };
  }

  function start(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const existing = current(w, a);
    if (existing)
      throw new Error(
        `Your exposure trial ${existing.id} is still open; stop it first. Nothing was spent.`,
      );
    const input = w.stacks.find(
      (s) => s.id === v7String(action.args.inputStackId, 'inputStackId'),
    );
    if (!input || input.owner !== a.id)
      throw new Error(
        'Name one of your own food stacks by its exact item id. Nothing was spent.',
      );
    if (input.reservedFor)
      throw new Error(
        'That item is reserved for unfinished work. Nothing was spent.',
      );
    const problem = unsupported(w, input);
    if (problem) throw new Error(`${problem} Nothing was spent.`);
    const quantity = action.args.quantity,
      control = action.args.controlQuantity ?? 0;
    if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity))
      throw new Error(
        'Start needs quantity: whole units to expose, at least 1. Nothing was spent.',
      );
    if (typeof control !== 'number' || !Number.isSafeInteger(control))
      throw new Error(
        'controlQuantity must be a whole number of units. Nothing was spent.',
      );
    if (quantity + control > wholeUnits(input))
      throw new Error(
        `${input.id} holds ${String(input.quantity)} units, fewer than ${String(quantity + control)} whole units. Nothing was spent.`,
      );
    const surface = placement(c, quantity);
    try {
      foodWaterSurfaceArea(w, surface);
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : 'The placement is unusable.'} Nothing was spent.`,
        { cause: error },
      );
    }
    const cost = START_BASE + START_PER_UNIT * quantity;
    if (a.vitals.energy < cost)
      throw new Error(
        `Placing ${String(quantity)} units needs ${String(cost)} energy. Nothing was spent.`,
      );
    const j = workCreate(c, 'whole-food', 1) as Trial;
    if (!workPay(c, j, cost))
      throw new Error('Energy changed before the paid round.');
    a.vitals.energy = round(Math.max(0, a.vitals.energy));
    j.paidEnergy = round(j.paidEnergy);
    workReserve(
      c,
      j,
      workAllocations(c, [{ itemId: input.id, quantity }]),
      true,
    );
    const batch = w.stacks.find((s) => s.id === j.escrow.at(-1));
    if (!batch) throw new Error('The separated batch is missing.');
    // Food lying in the world is unowned and unreserved, like any dropped stack.
    delete batch.reservedFor;
    j.escrow = [];
    const water = foodWaterExpose(w, batch, surface, false);
    // The control stays carried and reserved, in ordinary handling, without a water record.
    if (control)
      workReserve(
        c,
        j,
        workAllocations(c, [{ itemId: input.id, quantity: control }]),
      );
    const kept = control
      ? w.stacks.find((s) => s.id === j.escrow.at(-1))
      : undefined;
    Object.assign(j, {
      stage: 'exposed',
      input: input.id,
      resource: input.resource,
      batch: batch.id,
      control: kept?.id ?? null,
      placement: { ...surface, area: water.area },
      placedAt: w.tick,
      quantity: batch.quantity,
      initialQuantity: batch.quantity,
      controlQuantity: kept?.quantity ?? 0,
      batchDecay0: round(batch.decay ?? 0),
      batchDecay: round(batch.decay ?? 0),
      controlDecay0: kept ? round(kept.decay ?? 0) : null,
      controlDecay: kept ? round(kept.decay ?? 0) : null,
      controlSpoiledAt: null,
      rainRounds: 0,
      wet: false,
      observations: [],
      lastUpdate: w.tick,
      endedAt: null,
      takenBy: null,
      target: batch.id,
      outputs: [batch.id],
    });
    c.emit(
      'air-exposure-placed',
      `${String(quantity)} whole ${input.resource} laid ${surface.kind === 'ground' ? 'on open ground' : `on ${surface.id}`}${kept ? `; ${String(control)} kept carried as a control` : ''}. Exposure is under way; nothing is preserved or made safe by it.`,
      { ...report(w, j), view: view(w, j, a) },
      batch.id,
    );
    sync(a, j, stateKey);
    return {
      complete: true,
      writes: [j.id, input.id, batch.id, ...(kept ? [kept.id] : [])],
    };
  }

  function inspect(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const j = current(w, a);
    if (!j)
      throw new Error(
        'You have no open exposure trial to inspect. Nothing was spent.',
      );
    const batch = lying(w, j);
    if (!batch)
      throw new Error('The batch no longer lies there. Nothing was spent.');
    const o = w.objects.find((o) => o.id === j.placement.id);
    const reach =
      j.placement.kind === 'object' && o
        ? v7Reach(a, o.spatial)
        : v7Distance(a.position, batch.position) <=
          a.radius + w.config.interaction;
    if (!reach)
      throw new Error(
        'Return within hand reach of the batch to inspect it. Nothing was spent.',
      );
    if (a.vitals.energy < LOOK)
      throw new Error('Inspection needs 0.2 energy. Nothing was spent.');
    v7Spend(a, LOOK);
    const value = report(w, j),
      kept = j.control ? w.stacks.find((s) => s.id === j.control) : undefined;
    j.observations = [
      ...j.observations,
      {
        tick: w.tick,
        elapsedRounds: w.tick - j.placedAt,
        batchDecay: round(batch.decay ?? 0),
        controlDecay: kept ? round(kept.decay ?? 0) : null,
        rainRounds: j.rainRounds,
      },
    ].slice(-OBSERVATIONS);
    openRemember(c, {
      key: `${j.batch}:air-exposure`,
      subject: j.resource,
      property: 'air exposure trial readings',
      value,
      method: 'direct look at the exposed batch and the carried control',
      condition:
        'whole food; water content not measured; preservation and safety unverified',
      verified: false,
    });
    c.emit(
      'air-exposure-inspected',
      `Batch inspected after ${String(w.tick - j.placedAt)} rounds: decay readings recorded; water content was not measured and no preservation or safety is established.`,
      { ...value, view: view(w, j, a) },
      j.batch,
    );
    sync(a, j, stateKey);
    return { complete: true, writes: [j.id] };
  }

  function stop(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const j = current(w, a);
    if (!j)
      throw new Error(
        'You have no open exposure trial to stop. Nothing was spent.',
      );
    const released = settle(
      w,
      a,
      j,
      'stopped',
      'Exposure trial stopped; the control returns to ordinary use and the batch stays where it lies. Spent energy and time are not refunded.',
      false,
    );
    const value = report(w, j);
    openRemember(c, {
      key: `${j.batch}:air-exposure`,
      subject: j.resource,
      property: 'air exposure trial readings',
      value,
      method: 'own trial record at stopping',
      condition:
        'whole food; water content not measured; preservation and safety unverified',
      verified: false,
    });
    c.emit(
      'air-exposure-stopped',
      `Trial stopped after ${String(w.tick - j.placedAt)} rounds. The batch stays where it lies and keeps ageing; take it with pickup. Preservation unverified.`,
      { ...value, released, view: view(w, j, a) },
      j.batch,
    );
    sync(a, j, stateKey);
    return { complete: true, writes: [j.id, ...released] };
  }

  function execute(c: V7ActionContext): V7HandlerResult {
    const mode = v7String(c.action.args.mode, 'mode');
    if (mode === 'start') return start(c);
    if (mode === 'inspect') return inspect(c);
    if (mode === 'stop') return stop(c);
    throw new Error('Unknown exposure trial mode.');
  }

  /** Unattended exposure: record actual rain, removal and spoilage; no labor or charge. */
  function environment(w: V7World) {
    for (const j of trials(w).filter(open)) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (!a) continue;
      const kept = j.control
        ? w.stacks.find((s) => s.id === j.control)
        : undefined;
      if (j.control && kept) j.controlDecay = round(kept.decay ?? 0);
      else if (j.control && j.controlSpoiledAt === null) {
        j.controlSpoiledAt = w.tick;
        forestEvent(
          w,
          'air-exposure-control-spoiled',
          'The carried control spoiled under the ordinary ageing; the batch trial continues without it.',
          a.position,
          a.id,
          {
            trial: j.id,
            control: j.control,
            spoiled: spoiledNow(w, j.control),
          },
          j.control,
        );
      }
      const batch = lying(w, j);
      if (!batch) {
        const spoiled = spoiledNow(w, j.batch);
        j.takenBy = spoiled
          ? null
          : (w.events.find(
              (e) => e.type === 'picked-up' && e.target === j.batch,
            )?.actor ?? null);
        const stage = spoiled ? 'spoiled' : 'removed';
        settle(
          w,
          a,
          j,
          stage,
          spoiled
            ? 'The exposed batch spoiled under the existing ageing; the trial ended and the control returns to ordinary use.'
            : 'The exposed batch was taken from its place; the trial ended and the control returns to ordinary use.',
          false,
        );
        forestEvent(
          w,
          spoiled ? 'air-exposure-spoiled' : 'air-exposure-removed',
          spoiled
            ? 'The exposed batch spoiled and is gone; the trial ended without preservation.'
            : 'The exposed batch was taken away; the trial ended. Preservation unverified.',
          where(w, j, a),
          a.id,
          { ...report(w, j), view: view(w, j, a) },
          j.batch,
        );
        sync(a, j, stateKey);
        continue;
      }
      j.batchDecay = round(batch.decay ?? 0);
      if (batch.quantity < j.quantity - 1e-9) {
        const taken = round(j.quantity - batch.quantity);
        j.quantity = batch.quantity;
        forestEvent(
          w,
          'air-exposure-reduced',
          `${String(taken)} of the exposed batch was taken; the rest stays exposed.`,
          batch.position,
          a.id,
          { trial: j.id, taken, quantity: batch.quantity, view: view(w, j, a) },
          batch.id,
        );
      }
      const last = foodWaterRead(batch)?.last;
      const wet = last?.tick === w.tick && Number(last.received) > 0;
      if (wet) {
        j.rainRounds += 1;
        if (!j.wet) {
          j.wet = true;
          forestEvent(
            w,
            'air-exposure-rained-on',
            'Rain is falling on the uncovered batch and wetting it.',
            batch.position,
            a.id,
            {
              trial: j.id,
              rainRounds: j.rainRounds,
              view: view(w, j, a),
            },
            batch.id,
          );
        }
      } else j.wet = false;
      j.lastUpdate = w.tick;
      sync(a, j, stateKey);
    }
  }

  return {
    id,
    version: 1,
    scope,
    dependencies: ['foundation-open@1'],
    description:
      'A general whole-food air-exposure trial: owned whole food is laid on open ground or an existing food surface under the installed food water representation, with an optional carried control; readings report actual decay and rain; nothing is dried, preserved or made safe.',
    reuse: {
      experiment:
        'ex14 controlled-food-processing-trial@1 (paired ground exposure; not reused: learning 3 and its text says no food moisture model exists, false here); ex14 air-dry-food@1 (first release); ex10 measured-food-preservation@1 and collective-ex12 drying (tray- or sheet-bound); ex18 unheated-food-preparation@1 (whole-unit checks)',
      source:
        'food-water.ts (foodWaterExpose, foodWaterSurfaceArea, foodWaterRead; exchange and decay in forest-environment.ts); collective-work.ts (workCreate, workAllocations, workReserve, workPay, workStop, collectiveJobs); open-foundation.ts (openRemember); collective-food-profile.ts; forest-food-accounting.ts; base pickup',
      description:
        'No equivalent interface is installed in this scope, and none of the earlier drying or exposure packages fits unchanged. New work is the trial record, the carried control, the readings and the environment response; the moisture and decay rules are the existing representation, unchanged.',
    },
    abilities: [
      {
        id,
        name: 'Food air-exposure trial',
        function:
          'Lay whole units of your own food on open ground or an existing food surface to expose them to actual weather, optionally keeping a carried control from the same stack; inspect both decay trajectories; stop the trial.',
        equivalence: 'food:whole-unit:air-exposure-trial:1',
        parameters: {
          ...v7ObjectSchema({
            mode: { type: 'string', enum: ['start', 'inspect', 'stop'] },
            inputStackId: { type: 'string' },
            quantity: { type: 'integer', minimum: 1 },
            controlQuantity: { type: 'integer', minimum: 0 },
            x: { type: 'number' },
            y: { type: 'number' },
            supportId: { type: 'string' },
          }),
          required: ['mode'],
        },
        references: {
          inputStackId: 'optional-exact-visible',
          supportId: 'optional-exact-visible',
        },
        prerequisites: [],
        learning: 2,
        costs:
          'Study: 2 rounds. Start: inputStackId is the exact id of your own unspoiled, untreated berry or root stack (or food whose water composition is already represented); quantity whole units to expose; optional controlQuantity whole units of the same stack kept carried and reserved (together at most its whole units). Place at x,y (default your position) within 0.65 plus your body radius, or on supportId, an existing food surface in reach. One round and 1 + 0.5 x quantity energy; all checks run before any charge; walking there is a separate navigate. Inspect: your open trial, within reach of the batch; one round, 0.2 energy. Stop: one round, no energy. Taking the food back uses pickup at its own cost. No tool, fuel, cutting or material is used or made.',
        effects:
          'Start separates the units and lays them, unowned, on a ground footprint of 0.04 per unit (firm ordinary ground inside the world, not water, wet bank or waterlogged ground, unobstructed, nothing else lying there) or on the support, and gives them the world food water record (assumed water fraction root 0.75, berry 0.85). Every later round the existing rules apply: whole food loses no water; rain on the uncovered surface adds 0.01 x rain x area water; decay continues at the ordinary rate for the temperature where the food lies and is never reset. The control ages normally while carried. So no dryness, preservation or safety status can be reached: they stay unverified; nutrition and toxicity are unchanged; contamination is not assessed. Anyone may pick up food lying in the world: taking part reduces the batch, taking all ends the trial. Inspect records elapsed rounds, quantities, decay at placement and now and per round for batch and control, their difference and rain on the batch, as an unverified personal record; water content is not measured. Spoilage under the existing rule or removal ends the trial; stop ends it and leaves the batch where it lies. Ending releases the control once; death ends it the same way. No refund, reward or comfort.',
        handler,
        revision,
        authored: false,
        // The placement event carries no qualified flag: exposure earns no practice milestone.
        practiceEvidence: 'air-exposure-placed',
        dependencies: { abilities: [], resources: [], knowledge: [] },
        execution: {
          duration: 1,
          interruption: 'cancel',
          progress:
            'Each mode is one atomic round. The trial record (batch, control, placement, readings, rain rounds, last update) persists; exposure continues unattended without charge until stop, removal, spoilage or death.',
        },
      },
    ],
    handlers: { [handler]: execute },
    processes: {},
    visualComponents: [],
    events: [
      'air-exposure-placed',
      'air-exposure-inspected',
      'air-exposure-rained-on',
      'air-exposure-reduced',
      'air-exposure-removed',
      'air-exposure-spoiled',
      'air-exposure-control-spoiled',
      'air-exposure-stopped',
      'air-exposure-interrupted',
      // Emitted by the food water exchange for exposed food (CULTURE_SCENARIO section G).
      'preservation-progress',
    ],
    resources: [],
    satisfaction: [],
    afterEnvironment: environment,
    onDeath(w, a) {
      for (const j of trials(w).filter((j) => j.owner === a.id && open(j))) {
        settle(
          w,
          a,
          j,
          'ended-by-death',
          'Performer died; the trial ended and the control is released under the death rules. The batch stays where it lies; nothing is refunded.',
          true,
        );
        forestEvent(
          w,
          'air-exposure-interrupted',
          'The trial ended by death; the batch stays where it lies and keeps ageing.',
          a.position,
          a.id,
          { ...report(w, j), view: view(w, j, a) },
          j.batch,
        );
        sync(a, j, stateKey);
      }
    },
  };
}

/** ex19: Wren's general air-exposure food-preservation trial, whole-food mode. */
export const LONG_EX19_FOOD_AIR_EXPOSURE = foodAirExposurePackage(
  'food-air-exposure-trial',
  'long-ex19',
);

/** Shared unchanged with later food trials: the whole untreated food check and one real decay
 * trajectory, so their inputs and decay readings follow this trial's semantics. */
export { unsupported as airExposureUnsupported, track as airExposureTrack };
