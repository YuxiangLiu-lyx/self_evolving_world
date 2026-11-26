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
import { v7Json, v7RoundNumber, v7String } from './continuous-data.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { forestEvent } from './forest-climate.js';
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

const ID = 'unheated-food-preparation';
const REVISION = `${ID}@1`;
const STATE = `long:work:${ID}`;
/** The treatment record on a prepared lot (`processing.unheatedPreparation`). */
const KEY = 'unheatedPreparation';
/** One paid unit round: its visible check and hand brushing (World Agent specification). */
const UNIT_ENERGY = 0.5;
/** The baseline probe observation cost, reused for both inspections. */
const LOOK_ENERGY = 0.2;
/** Represented treatments for which dry hand brushing has no defined result in this version. */
const TREATED = [
  'physical',
  'materialLayer',
  'canopyDrying',
  'frictionKit',
  'waterCup',
  'mantle',
  'fuelMoisture',
  'componentLots',
] as const;

/** The outcome of one paid unit round, kept in the job record. */
type Unit = {
  item: string;
  outcome: 'prepared' | 'unsuitable';
  lot: string | null;
  decay: number;
  condition: number | null;
  tick: number;
  reason: string | null;
};

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const units = (j: CollectiveWork) =>
  (Array.isArray(j.units) ? j.units : []) as unknown as Unit[];
const lifetime = (w: V7World, s: V7Stack) =>
  w.resources.find((r) => r.id === s.resource)?.properties?.decay ?? 0;
/** Spoiled under the existing ageing rule: decay has reached the food's lifetime. */
const spoiled = (w: V7World, s: V7Stack) =>
  lifetime(w, s) > 0 && (s.decay ?? 0) >= lifetime(w, s);
const wholeUnits = (s: V7Stack) => Math.floor(foodTenths(s.quantity) / 10);
/** The treatment record of an earlier pass of this method, if any. */
function record(s: V7Stack): V7Data | null {
  const p = s.processing?.[KEY];
  return p && typeof p === 'object' && !Array.isArray(p) ? p : null;
}
const treatments = (s: V7Stack) => [
  ...TREATED.filter((k) => s[k] !== undefined),
  ...Object.keys(s.processing ?? {}),
];

function sync(a: V7Actor, j: CollectiveWork) {
  a.extensionState[STATE] = v7Json(j);
}

/** Reusable metadata keyed by job, input and lot; it confers no safety, nutrition or reward. */
function summary(w: V7World, j: CollectiveWork): V7Data {
  const lot = w.stacks.find((s) => s.id === j.lot);
  return {
    operation: ID,
    workId: j.id,
    status: j.status,
    stage: j.stage ?? null,
    input: j.input ?? null,
    lot: j.lot ?? null,
    requestedUnits: j.initialWork,
    completedUnits: units(j).filter((u) => u.outcome === 'prepared').length,
    pendingUnits: j.status === 'completed' ? 0 : j.remainingWork,
    paidEnergy: v7RoundNumber(j.paidEnergy),
    lotQuantity: lot?.quantity ?? 0,
    raw: true,
    heated: false,
    safety: 'unknown',
    reason: j.reason ?? null,
    tick: w.tick,
  };
}

/** Why this method cannot take a unit from the stack, or null. Edibility is the eat test. */
function unsupported(w: V7World, s: V7Stack): string | null {
  const r = collectiveFoodProfile(w, s);
  if (!r || r.nutrition <= 0)
    return 'This is not food; only edible food can be prepared.';
  if (
    TREATED.some((k) => s[k] !== undefined) ||
    Object.keys(s.processing ?? {}).some((k) => k !== KEY)
  )
    return 'Food with another represented treatment (water composition, drying, layers, combination or equipment) has no defined result for this method.';
  if (wholeUnits(s) < 1)
    return 'Less than one whole unit remains; this method works on whole units.';
  return null;
}

/** What a careful look at held food shows: visible condition and recorded treatment only.
 * Loose soil on food is not represented, so none is reported or removed. Also reused by
 * thermal-food-preparation@1's assessment. */
export function look(w: V7World, s: V7Stack): V7Data {
  const life = lifetime(w, s),
    decay = s.decay ?? 0;
  return {
    item: s.id,
    resource: s.resource,
    quantity: s.quantity,
    origin: s.origin,
    harvestedAt: s.harvestedAt ?? null,
    decay: v7RoundNumber(decay),
    condition: life > 0 ? v7RoundNumber(Math.max(0, 1 - decay / life)) : null,
    visibleSpoilage: spoiled(w, s) ? 'spoiled' : 'none seen',
    looseDebris: 'not represented',
    treatment: treatments(s),
    safety: 'unknown',
  };
}

/** The exact own, unreserved stack named by inputStackId (also reused by thermal-food-preparation@1). */
export function owned(c: V7ActionContext): V7Stack {
  const id = v7String(c.action.args.inputStackId, 'inputStackId');
  const s = c.world.stacks.find((s) => s.id === id);
  if (!s || s.owner !== c.actor.id)
    throw new Error(
      'Name one of your own food stacks by its exact item id. Nothing was spent.',
    );
  if (s.reservedFor)
    throw new Error(
      'That item is reserved for unfinished work. Nothing was spent.',
    );
  return s;
}

function pause(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
): V7HandlerResult {
  j.status = 'paused';
  j.stage = 'paused';
  j.reason = reason;
  c.emit(
    'unheated-preparation-paused',
    `${reason} Completed units stay in the lot; nothing was spent.`,
    summary(c.world, j),
    j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id] };
}

/** The unit joins the job's lot when it is the same material (same food, origin, harvest and
 * decay); otherwise, for the first unit or after the lot was eaten or given away, it becomes
 * the job's new lot. Nothing is created, refreshed or lost. */
function addToLot(
  c: V7ActionContext,
  j: CollectiveWork,
  unit: V7Stack,
): V7Stack {
  delete unit.reservedFor;
  unit.owner = c.actor.id;
  unit.position = { ...c.actor.position };
  const lot = c.world.stacks.find(
    (s) => s.id === j.lot && s.owner === c.actor.id && !s.reservedFor,
  );
  const kept = lot ? record(lot) : null;
  if (
    lot &&
    kept &&
    kept.workId === j.id &&
    lot.resource === unit.resource &&
    lot.origin === unit.origin &&
    lot.harvestedAt === unit.harvestedAt &&
    (lot.decay ?? 0) === (unit.decay ?? 0)
  ) {
    foodSetQuantity(lot, foodTenths(lot.quantity) + foodTenths(unit.quantity));
    kept.units = Number(kept.units) + 1;
    c.world.stacks = c.world.stacks.filter((s) => s.id !== unit.id);
    return lot;
  }
  const prior = record(unit);
  unit.processing = {
    [KEY]: {
      method: 'dry hand brushing of held whole units',
      raw: true,
      heated: false,
      water: false,
      tool: false,
      looseDebris: 'not represented; none removed',
      safety: 'unknown',
      from: typeof j.input === 'string' ? j.input : null,
      workId: j.id,
      by: c.actor.id,
      at: c.world.tick,
      units: 1,
      passes: Number(prior?.passes ?? 0) + 1,
    },
  };
  j.lot = unit.id;
  j.outputs = [...j.outputs, unit.id];
  return unit;
}

/** One paid unit round: revalidate before any charge, split one whole unit with the existing
 * escrow helper, pay, check it by eye, then brush it into the lot or report it unsuitable. */
function unitRound(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const input = c.world.stacks.find(
    (s) => s.id === j.input && s.owner === c.actor.id && !s.reservedFor,
  );
  if (!input)
    return pause(
      c,
      j,
      'The input stack is no longer yours or no longer exists.',
    );
  const problem = unsupported(c.world, input);
  if (problem) return pause(c, j, problem);
  if (c.actor.vitals.energy < UNIT_ENERGY)
    return pause(c, j, 'Not enough energy: one unit needs 0.5.');
  const resumed = j.status === 'paused';
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  workReserve(c, j, workAllocations(c, [{ itemId: input.id, quantity: 1 }]));
  const unit = c.world.stacks.find((s) => s.id === j.escrow.at(-1));
  if (!unit) throw new Error('The separated unit is missing.');
  if (!workPay(c, j, UNIT_ENERGY))
    throw new Error('Energy changed before the paid round.');
  c.actor.vitals.energy = v7RoundNumber(Math.max(0, c.actor.vitals.energy));
  j.paidEnergy = v7RoundNumber(j.paidEnergy);
  if (resumed)
    c.emit(
      'unheated-preparation-resumed',
      'Unfinished preparation resumed after rechecking the input and energy.',
      summary(c.world, j),
      j.id,
    );
  const seen = look(c.world, unit);
  c.emit(
    'food-unit-checked',
    'One held unit was checked by eye. No visible defect is not proof of safety.',
    { workId: j.id, unit: seen },
    unit.id,
  );
  j.escrow = j.escrow.filter((id) => id !== unit.id);
  const entry = (outcome: Unit['outcome'], lot: string | null) =>
    ({
      item: unit.id,
      outcome,
      lot,
      decay: Number(seen.decay),
      condition: typeof seen.condition === 'number' ? seen.condition : null,
      tick: c.world.tick,
      reason:
        outcome === 'unsuitable' ? 'Spoiled under the existing ageing.' : null,
    }) satisfies Unit;
  if (spoiled(c.world, unit)) {
    delete unit.reservedFor;
    unit.position = { ...c.actor.position };
    j.units = v7Json([...units(j), entry('unsuitable', null)]);
    // Every unit of one stack shares its age and decay, so the rest would be the same.
    workStop(
      c.world,
      c.actor,
      j,
      'The checked unit is spoiled; it stays an unprepared unit and the work stops. Spent energy is not refunded.',
      false,
    );
    j.stage = 'unsuitable';
    c.emit(
      'food-unit-unsuitable',
      'The checked unit is spoiled, so it was not prepared; it stays with you as an unprepared unit.',
      { ...summary(c.world, j), unit: unit.id },
      unit.id,
    );
    sync(c.actor, j);
    return { complete: true, writes: [j.id, input.id, unit.id] };
  }
  const lot = addToLot(c, j, unit);
  j.units = v7Json([...units(j), entry('prepared', lot.id)]);
  j.stage = j.remainingWork === 0 ? 'completed' : 'unit-prepared';
  c.emit(
    'food-unit-prepared',
    'The unit was brushed by hand while held and moved into your prepared lot, raw and unchanged in quantity, age and decay. Loose soil is not represented, so none was measured or removed.',
    { ...summary(c.world, j), unit: unit.id },
    lot.id,
  );
  if (j.remainingWork === 0) {
    j.status = 'completed';
    c.emit(
      'unheated-preparation-completed',
      'All requested units were prepared. The lot is raw food with its original nutrition, hazards and ageing; eating or giving it are separate actions.',
      { ...summary(c.world, j), lotItem: look(c.world, lot) },
      lot.id,
    );
  }
  sync(c.actor, j);
  return {
    complete: j.status === 'completed',
    remaining: j.status === 'completed' ? 0 : j.remainingWork,
    writes: [j.id, input.id, lot.id, unit.id],
  };
}

function prepare(c: V7ActionContext): V7HandlerResult {
  const existing = workFind(c);
  if (existing && open(existing)) {
    const id = c.action.args.inputStackId,
      n = c.action.args.quantity;
    if (
      (typeof id === 'string' && id && id !== existing.input) ||
      (n !== undefined && n !== existing.initialWork)
    )
      throw new Error(
        `Unfinished preparation ${existing.id} of ${typeof existing.input === 'string' ? existing.input : 'its input'} (${String(existing.initialWork)} units) exists; prepare with the same input and quantity to resume it, or cancel it. Nothing was spent.`,
      );
    return unitRound(c, existing);
  }
  if (c.operation?.first === false)
    throw new Error(
      'The bound preparation is already settled. Nothing was spent.',
    );
  const quantity = c.action.args.quantity;
  if (
    typeof quantity !== 'number' ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1
  )
    throw new Error(
      'Prepare needs quantity: a whole number of units, at least 1. Nothing was spent.',
    );
  const s = owned(c);
  const problem = unsupported(c.world, s);
  if (problem) throw new Error(`${problem} Nothing was spent.`);
  if (wholeUnits(s) < quantity)
    throw new Error(
      `${s.id} holds ${String(s.quantity)} units, fewer than ${String(quantity)} whole units. Nothing was spent.`,
    );
  if (c.actor.vitals.energy < UNIT_ENERGY)
    throw new Error('One unit needs 0.5 energy. Nothing was spent.');
  const j = workCreate(c, 'dry-brush', quantity);
  j.input = s.id;
  j.resource = s.resource;
  j.stage = 'started';
  j.lot = null;
  j.units = [];
  c.emit(
    'unheated-preparation-started',
    'Preparation started: one held whole unit is checked and brushed per paid round; the rest of the input stays yours and usable.',
    summary(c.world, j),
    j.id,
  );
  return unitRound(c, j);
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c);
  if (!j || !open(j))
    throw new Error(
      'No unfinished preparation of yours to cancel. Nothing was spent.',
    );
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  // Units are separated only inside their own paid round, so normally none is held here; the
  // existing stop helper would release any once.
  const released = j.escrow.filter((id) =>
    c.world.stacks.some((s) => s.id === id && s.reservedFor === j.id),
  );
  workStop(
    c.world,
    c.actor,
    j,
    'Cancelled; completed units stay in the lot and the rest of the input stays yours. Spent energy and time are not refunded.',
    false,
  );
  j.stage = 'cancelled';
  c.emit(
    'unheated-preparation-cancelled',
    'Preparation cancelled; completed units stay in the lot and no unit was refunded or replaced.',
    { ...summary(c.world, j), released },
    j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...released] };
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const s = owned(c);
  v7Spend(c.actor, LOOK_ENERGY);
  const reason = unsupported(c.world, s);
  const own = c.actor.memory.discoveries?.[s.resource];
  const value: V7Data = {
    ...look(c.world, s),
    wholeUnits: wholeUnits(s),
    preparable: reason === null,
    reason,
    // The person's own earlier eating record of this food, not a test of this stack.
    eatingRecord: own
      ? {
          nutrition: own.nutrition ?? null,
          toxicity: own.toxicity ?? null,
          observedAt: own.observedAt ?? null,
        }
      : null,
  };
  openRemember(c, {
    key: `${s.id}:food-condition`,
    subject: s.resource,
    property: 'visible food condition',
    value,
    method: 'direct look at the held food',
    condition: 'visible condition only; not a safety test',
    verified: false,
  });
  c.emit(
    'food-condition-inspected',
    'The food was looked over; only its visible condition and recorded treatment were noted. No visible defect is not proof of safety.',
    { item: s.id, observation: value, tick: c.world.tick },
    s.id,
  );
  return { complete: true, writes: [] };
}

function progress(c: V7ActionContext): V7HandlerResult {
  const mine = collectiveJobs(c.world, ID).filter(
    (j) => j.owner === c.actor.id,
  );
  const j = mine.find(open) ?? mine.at(-1);
  if (!j)
    throw new Error('You have no preparation to inspect. Nothing was spent.');
  v7Spend(c.actor, LOOK_ENERGY);
  const lot = c.world.stacks.find(
    (s) => s.id === j.lot && s.owner === c.actor.id,
  );
  const value: V7Data = {
    ...summary(c.world, j),
    units: v7Json(units(j)),
    lotItem: lot ? look(c.world, lot) : null,
  };
  openRemember(c, {
    key: `${j.id}:preparation-progress`,
    subject: typeof j.resource === 'string' ? j.resource : ID,
    property: 'preparation progress',
    value,
    method: 'direct look at the work and the lot',
    condition: 'only completed units are in the lot',
    verified: false,
  });
  c.emit(
    'unheated-preparation-inspected',
    'Progress was looked over: only completed units are in the lot; pending units are still in the input.',
    value,
    j.id,
  );
  return { complete: true, writes: [] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'prepare') return prepare(c);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'inspect-progress') return progress(c);
  if (mode === 'cancel') return cancel(c);
  throw new Error('Unknown preparation mode.');
}

/** ex18: a general unheated, dry, whole-unit food preparation. Each paid round checks one held
 * unit by eye and brushes it by hand into an owned lot of the same food; no heat, water, tool,
 * cleanliness, nutrition or safety change exists, and eating or giving stay separate. */
export const LONG_UNHEATED_FOOD_PREPARATION: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex18',
  dependencies: ['foundation-open@1'],
  description:
    'A general unheated food preparation: whole units of owned food are checked by eye and brushed by hand, one paid round per unit, into an owned prepared lot with the same food, quantity, age, decay, nutrition and toxicity; no heat, water, tool or cleanliness claim.',
  reuse: {
    experiment:
      'ex15 food-preparation@1 (paid one-unit increments, escrow, settle-once lifecycle and conserved food lot; not reused directly because its cold-combine recipe, cost and text differ); ex18 plant-establishment-trial@1 (direct unit inspection with personal records)',
    source:
      'collective-work.ts (workCreate, workAllocations, workReserve, workPay, workStop, collectiveJobs); forest-food-accounting.ts (exact tenths); collective-food-profile.ts (the eat edibility test); open-foundation.ts (openRemember and the probe observation cost of 0.2); forest-environment.ts (existing ageing and spoilage); base eat and give',
    description:
      'Implementation reuse only; no earlier ability, item or mastery is inherited and earlier packages are unchanged. New work is the paid per-unit check-and-brush round and the conserved prepared lot. The probe handler is not invoked: its object-state record has no food-condition fields, and its destructive material trial is no substitute.',
  },
  abilities: [
    {
      id: ID,
      name: 'Prepare unheated food',
      function:
        'Prepare whole units of your own food without heat, water or tools: each paid round checks one held unit by eye, brushes it by hand and moves it into your prepared lot; inspect food or progress; cancel unfinished work.',
      equivalence: 'food:prepare:unheated-dry-whole-unit:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['inspect', 'prepare', 'inspect-progress', 'cancel'],
          },
          inputStackId: { type: 'string' },
          quantity: { type: 'integer', minimum: 1 },
        }),
        required: ['mode'],
      },
      references: { inputStackId: 'optional-exact-visible' },
      prerequisites: [],
      learning: 2,
      costs:
        'Study: 2 rounds. Prepare: inputStackId is the exact item id of your own edible food stack, quantity the whole units to prepare (at most its whole units); one round and 0.5 energy per unit, so 7 units take 7 rounds and 3.5 energy. Every round is checked before any charge; prepare resumes your paused work (inputStackId and quantity may be omitted). Inspect (inputStackId of your own food) and inspect-progress (your latest preparation): one round, 0.2 energy, no food used. Cancel: one round, no energy. No vessel, water, fuel, tool or ground surface is used or given. Eating and giving use eat and give at their own costs.',
      effects:
        'Each paid round separates one whole unit from the input, checks it by eye and brushes it by hand, held, never set on the ground. A usable unit joins one owned lot of the same food with unchanged quantity, origin, age, decay, nutrition and toxicity, recorded as raw, unheated, dry-brushed, safety unknown. Loose soil on food is not represented, so no debris is measured or removed and no cleanliness is claimed. A spoiled unit is reported unsuitable, stays unprepared and ends the work. Nothing is cooked, peeled, washed, made safe or kept fresher; food keeps ageing, and the planting trial treats prepared units as processed. The lot holds only completed units. Inspections record visible condition, treatment and your own eating record (not a safety test) as an unverified personal record. An unworked round, too little energy, or an input no longer yours with a whole unit pauses without charge. Cancel or death ends the work; completed units stay. No refund or reward; nobody is fed.',
      handler: 'long.unheated-food-preparation',
      revision: REVISION,
      authored: false,
      // The unit event carries no qualified flag: preparing earns no practice milestone.
      practiceEvidence: 'food-unit-prepared',
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Paid one-unit rounds; job, input, unit outcomes and lot persist across pauses; resuming pays only the remaining units after revalidation; completion, an unsuitable unit, cancelling and death settle once. No unattended progress.',
      },
    },
  ],
  handlers: { 'long.unheated-food-preparation': execute },
  processes: {},
  visualComponents: [],
  events: [
    'unheated-preparation-started',
    'food-unit-checked',
    'food-unit-prepared',
    'food-unit-unsuitable',
    'unheated-preparation-paused',
    'unheated-preparation-resumed',
    'unheated-preparation-cancelled',
    'unheated-preparation-failed',
    'unheated-preparation-completed',
    'food-condition-inspected',
    'unheated-preparation-inspected',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment(w) {
    for (const j of collectiveJobs(w, ID).filter(open)) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (!a) continue;
      j.x = a.position.x;
      j.y = a.position.y;
      // No unattended progress: a round without paid work leaves the job paused.
      if (j.status === 'active' && j.lastPaid < w.tick) {
        j.status = 'paused';
        j.stage = 'paused';
        j.reason = 'Not worked this round; completed units stay in the lot.';
        forestEvent(
          w,
          'unheated-preparation-paused',
          'Preparation paused because it was not worked this round; nothing was spent.',
          a.position,
          a.id,
          summary(w, j),
          j.id,
        );
      }
      sync(a, j);
    }
  },
  onDeath(w, a) {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && open(j),
    )) {
      j.x = a.position.x;
      j.y = a.position.y;
      workStop(
        w,
        a,
        j,
        'Performer died; the work ended. Completed units stay in the lot under the existing death rules; nothing is refunded.',
        true,
      );
      j.stage = 'ended-by-death';
      forestEvent(
        w,
        'unheated-preparation-failed',
        'Preparation stopped by death; only completed units exist, in the lot.',
        a.position,
        a.id,
        summary(w, j),
        j.id,
      );
      sync(a, j);
    }
  },
};
