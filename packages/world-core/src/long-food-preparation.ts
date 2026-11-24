import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Package,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7Id, v7Json, v7RoundNumber, v7String } from './continuous-data.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import { foodTenths } from './forest-food-accounting.js';
import { forestEvent } from './forest-climate.js';
import {
  materialLots,
  materialRefresh,
  materialValidate,
} from './material-lots.js';
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

const ID = 'food-preparation';
const REVISION = `${ID}@1`;
const STATE = 'long:work:food-preparation';
/** The only implemented preparation: hand portioning and combining, without heat or equipment. */
const MODE = 'cold-combined';
/** Represented treatments whose combination has no law in this version. */
const TREATED = [
  'physical',
  'materialLayer',
  'canopyDrying',
  'frictionKit',
  'waterCup',
  'mantle',
  'fuelMoisture',
] as const;

const total = (j: CollectiveWork) => Number(j.quantityTenths ?? 0);
const worked = (j: CollectiveWork) => Number(j.workedTenths ?? 0);
const food = (j: CollectiveWork) =>
  typeof j.ingredient === 'string' ? j.ingredient : '';
const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const reserved = (w: V7World, j: CollectiveWork) =>
  j.escrow.map((id) =>
    w.stacks.find((s) => s.id === id && s.reservedFor === j.id),
  );

/** Reusable drawing metadata; it confers no safety, nutrition, experience or mastery. */
function view(w: V7World, j: CollectiveWork): V7Data {
  const ingredient = food(j);
  return {
    component: 'prepared-food',
    mode: MODE,
    state:
      j.status === 'completed'
        ? 'prepared'
        : j.status === 'active'
          ? 'in-progress'
          : j.status,
    progress: total(j) ? v7RoundNumber(worked(j) / total(j)) : 0,
    quantity: total(j) / 10,
    ingredients: [{ resource: ingredient, share: 1 }],
    palette: [w.resources.find((r) => r.id === ingredient)?.color ?? '#9a8f80'],
  };
}
function sync(w: V7World, a: V7Actor, j: CollectiveWork) {
  j.visual = view(w, j);
  a.extensionState[STATE] = v7Json(j);
}
function summary(w: V7World, j: CollectiveWork): V7Data {
  return {
    workId: j.id,
    status: j.status,
    ingredient: food(j),
    inputs: v7Json(j.sources),
    quantity: total(j) / 10,
    workedQuantity: worked(j) / 10,
    completedRounds: j.completedWork,
    remaining: j.remainingWork,
    paidEnergy: v7RoundNumber(j.paidEnergy),
    position: { x: j.x, y: j.y },
    visual: view(w, j),
  };
}

/** One unspoiled, untreated, edible food the actor personally knows as nontoxic. */
function ingredientOf(c: V7ActionContext, s: V7Stack): string {
  const known = c.actor.memory.discoveries?.[s.resource];
  if (!known || known.toxicity !== 0 || Number(known.nutrition ?? 0) <= 0)
    throw new Error(
      'You need your own record of this food as edible and nontoxic before preparing it; nothing was reserved.',
    );
  if (TREATED.some((key) => s[key] !== undefined))
    throw new Error(
      'Food with another represented treatment (water composition, drying, layers or equipment) has no combination law in this version; nothing was reserved.',
    );
  if (Object.keys(s.processing ?? {}).some((key) => key !== 'preparedFood'))
    throw new Error(
      'Food under another represented process has no combination law in this version; nothing was reserved.',
    );
  const r = collectiveFoodProfile(c.world, s);
  if (!r || r.id !== s.resource || r.nutrition <= 0)
    throw new Error(
      'Only actual edible food can be prepared; nothing was reserved.',
    );
  if (!fresh(c.world, s)) throw new Error('Spoiled food cannot be prepared.');
  return r.id;
}
/** Every original lot is still within its own resource lifetime. */
function fresh(w: V7World, s: V7Stack): boolean {
  return materialLots(s).every((lot) => {
    const lifetime = collectiveFoodProfile(w, lot)?.properties?.decay ?? 0;
    return !lifetime || (lot.decay ?? 0) < lifetime;
  });
}

function fail(c: V7ActionContext, j: CollectiveWork, reason: string) {
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  workStop(c.world, c.actor, j, reason, false);
  c.emit(
    'food-preparation-failed',
    `${reason} No food was completed; spent energy and time are not refunded.`,
    summary(c.world, j),
    j.id,
  );
  sync(c.world, c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

function complete(c: V7ActionContext, j: CollectiveWork, parts: V7Stack[]) {
  const ingredient = food(j);
  const output: V7Stack = {
    id: v7Id(c.world, 'item'),
    resource: ingredient,
    quantity: total(j) / 10,
    quantityTenths: total(j),
    position: { ...c.actor.position },
    owner: c.actor.id,
    origin: j.id,
    // Flat original lots keep their own origin, harvest date and decay.
    componentLots: parts.flatMap(materialLots).map((lot) => {
      delete lot.reservedFor;
      delete lot.processing;
      return lot;
    }),
  };
  // Refresh keeps the oldest harvest date and the largest lot decay: no shelf-life reset.
  materialRefresh(output);
  materialValidate(output);
  if (output.quantityTenths !== total(j))
    throw new Error('Prepared food must conserve the reserved quantity.');
  j.status = 'completed';
  j.outputs = [output.id];
  output.processing = {
    preparedFood: {
      mode: MODE,
      ingredient,
      workId: j.id,
      preparedBy: c.actor.id,
      preparedAt: c.world.tick,
      visual: view(c.world, j),
    },
  };
  c.world.stacks = c.world.stacks.filter((s) => !j.escrow.includes(s.id));
  c.world.stacks.push(output);
  const r = collectiveFoodProfile(c.world, output);
  c.emit(
    'food-preparation-completed',
    'The reserved food was portioned and combined by hand into one carried stack with the same quantity, mass, nutrition, toxicity and age. Preparing does not feed anyone; eat it separately.',
    {
      ...summary(c.world, j),
      output: output.id,
      nominalNutrition: v7RoundNumber((r?.nutrition ?? 0) * output.quantity),
      toxicity: v7RoundNumber((r?.toxicity ?? 0) * output.quantity),
      componentLots: v7Json(output.componentLots),
    },
    output.id,
  );
  sync(c.world, c.actor, j);
  return {
    complete: true,
    remaining: 0,
    writes: [...j.escrow, output.id, j.id],
  };
}

/** One paid increment of at most one food unit, after revalidating the real inputs and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  if (!open(j)) throw new Error('This food preparation is already settled.');
  const parts = reserved(c.world, j);
  const intact = parts.every(
    (s, i) =>
      !!s &&
      fresh(c.world, s) &&
      foodTenths(s.quantity) === foodTenths(Number(j.sources[i]?.quantity)),
  );
  if (!intact)
    return fail(
      c,
      j,
      'A reserved ingredient was lost or spoiled, so it cannot support completion; the surviving ingredients were returned in their current condition.',
    );
  const increment = Math.min(10, total(j) - worked(j)) / 10;
  const resumed = j.status === 'paused';
  if (c.actor.vitals.energy < increment) {
    j.status = 'paused';
    j.reason =
      'Insufficient energy for the next work increment; nothing was spent.';
    c.emit(
      'food-preparation-paused',
      'Paused before work: not enough energy for the next increment. Paid progress and the reserved ingredients are kept.',
      { ...summary(c.world, j), requiredEnergy: increment },
      j.id,
    );
    sync(c.world, c.actor, j);
    return { complete: true, writes: [j.id] };
  }
  if (!workPay(c, j, increment))
    throw new Error('Energy changed before the paid increment.');
  c.actor.vitals.energy = v7RoundNumber(Math.max(0, c.actor.vitals.energy));
  j.paidEnergy = v7RoundNumber(j.paidEnergy);
  j.workedTenths = worked(j) + Math.round(increment * 10);
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  if (resumed)
    c.emit(
      'food-preparation-resumed',
      'Unfinished preparation resumed after revalidating the reserved ingredients and energy.',
      summary(c.world, j),
      j.id,
    );
  if (j.remainingWork === 0)
    return complete(
      c,
      j,
      parts.filter((s) => s !== undefined),
    );
  c.emit(
    'food-preparation-progress',
    'One round of hand portioning and combining was paid.',
    summary(c.world, j),
    j.id,
  );
  sync(c.world, c.actor, j);
  return { complete: false, remaining: j.remainingWork, writes: [j.id] };
}

function start(c: V7ActionContext): V7HandlerResult {
  const existing = workFind(c);
  if (existing && c.operation?.first === false && open(existing))
    return advance(c, existing);
  if (existing)
    throw new Error(
      'Unfinished food preparation exists; resume or cancel its processId first.',
    );
  if (c.operation?.first === false)
    throw new Error('The bound food preparation is already settled.');
  // The schema admits only cold-combine; only living people act, and hands are not represented.
  const allocations = workAllocations(c, c.action.args.inputs);
  const ingredients = allocations.map(({ stack }) => ingredientOf(c, stack));
  const ingredient = ingredients[0];
  if (!ingredient || ingredients.some((id) => id !== ingredient))
    throw new Error(
      'This version combines one food at a time: a mixture of different foods has no represented per-portion law, so nothing was reserved.',
    );
  const tenths = allocations.reduce((n, p) => n + foodTenths(p.quantity), 0);
  if (c.actor.vitals.energy < Math.min(10, tenths) / 10)
    throw new Error(
      'Not enough energy for the first work increment; nothing was reserved.',
    );
  const j = workCreate(c, 'cold-combine', Math.ceil(tenths / 10));
  j.preparation = 'cold-combine';
  j.ingredient = ingredient;
  j.quantityTenths = tenths;
  j.workedTenths = 0;
  workReserve(c, j, allocations);
  c.emit(
    'food-preparation-started',
    'Selected food moved into a reserved, carried in-progress portion; it keeps its owner, origin, age and decay. No vessel, water, fuel or tool is used or provided.',
    summary(c.world, j),
    j.id,
  );
  return advance(c, j);
}

function resume(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c);
  if (!j || !open(j))
    throw new Error('No unfinished personal food preparation to resume.');
  return advance(c, j);
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c);
  if (!j || !open(j))
    throw new Error('No unfinished personal food preparation to cancel.');
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  workStop(
    c.world,
    c.actor,
    j,
    'Cancelled; the remaining reserved ingredients return in their current condition. Spent energy and time are not refunded.',
    false,
  );
  const returned = j.escrow.flatMap((id) => {
    const s = c.world.stacks.find((s) => s.id === id);
    return s
      ? [{ itemId: s.id, quantity: s.quantity, decay: s.decay ?? 0 }]
      : [];
  });
  c.emit(
    'food-preparation-cancelled',
    'Preparation cancelled; only the actual remaining ingredients were returned, never fresh replacements.',
    { ...summary(c.world, j), returned },
    j.id,
  );
  sync(c.world, c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'start') return start(c);
  if (mode === 'resume') return resume(c);
  if (mode === 'cancel') return cancel(c);
  throw new Error('Unknown food preparation mode.');
}

export const LONG_FOOD_PREPARATION: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex15',
  dependencies: ['foundation-open@1'],
  description:
    'General food preparation, first mode cold hand portioning and combining of one known edible food. Organization changes, nutrition and spoilage do not.',
  reuse: {
    experiment:
      'ex11 prepare-food@1 escrow pattern; ex12 component lots; ex14 paid-work packages',
    source:
      'collective-work.ts (escrow, portions, paid work, stop); material-lots.ts (conserved original lots, refresh without rejuvenation); collective-food-profile.ts and the existing eat path and meal experience policy',
    description:
      'Implementation reuse only. The ex11 hand-mashing interface is a different transformation with its own work rule and output model, so it is not enabled; no historical ability, item or mastery is inherited.',
  },
  abilities: [
    {
      id: ID,
      name: 'Prepare food',
      function:
        'Portion and combine owned food you know as edible and nontoxic into one carried prepared stack by hand, without heat, water or equipment; resume or cancel unfinished work.',
      equivalence: 'food:prepare:cold-portion-combine:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: ['start', 'resume', 'cancel'] },
          preparation: { type: 'string', enum: ['cold-combine'] },
          inputs: {
            type: 'array',
            items: v7ObjectSchema({
              itemId: { type: 'string' },
              quantity: { type: 'number', minimum: 0.1 },
            }),
          },
          processId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: {},
      prerequisites: [],
      learning: 1,
      costs:
        'Start: inputs lists 1-24 {itemId, quantity} allocations in 0.1 steps from exact owned, unreserved, unspoiled stacks of one food that your own record shows as edible with toxicity 0 (raw, or food already combined this way); preparation is cold-combine (default). Work equals the selected quantity: one food unit per round at one energy per unit worked, so 3 units take 3 rounds and 3 energy and a final partial unit costs its fraction. Start pays the first increment and the same action continues each round; resume pays the next increment of the unfinished process; cancel takes one round and no energy. No vessel, water, fuel or tool is needed or provided. Travel, gathering and eating are separate actions with their own costs.',
      effects:
        'Start moves the selected quantities into a reserved in-progress portion that stays carried and owned, keeps its origin, age and decay, and keeps ageing. Completion replaces it with one portable prepared stack of the same food holding the same quantity and mass, with the original lots kept as separate component records. It eats exactly like that food through eat (same nutrition and toxicity per unit, the ordinary eat cost and satiety cap; a part eaten debits those lots), and each lot spoils under the existing rules without any shelf-life reset. No washing, cutting, heating, detoxification, preservation, digestibility change, extra nutrition, mastery or reward; preparing does not feed anyone. Work not continued in a round pauses with progress and ingredients kept; too little energy pauses without spending. A lost or spoiled reserved ingredient stops the work and returns the survivors. Cancel returns the remaining reserved food in its current condition; spent energy and time are never refunded. Death stops the work and leaves the unfinished food on the ground. Different foods cannot be combined in this version because no consistent per-portion mixture rule is represented; heated, wet or tool-based preparation is not implemented.',
      handler: 'long.food-preparation',
      revision: REVISION,
      authored: false,
      // The completion event carries no qualified flag: producing prepared food earns no milestone.
      practiceEvidence: 'food-preparation-completed',
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Paid work in one-unit increments whose exact job, escrow, worked quantity and position persist across interruption; resume pays only the next increment after revalidation; completion, failure, cancellation and death settle once.',
      },
    },
  ],
  handlers: { 'long.food-preparation': execute },
  processes: {},
  visualComponents: [],
  events: [
    'food-preparation-started',
    'food-preparation-progress',
    'food-preparation-paused',
    'food-preparation-resumed',
    'food-preparation-cancelled',
    'food-preparation-failed',
    'food-preparation-completed',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment(w) {
    for (const j of collectiveJobs(w, ID).filter(open)) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (!a) continue;
      j.x = a.position.x;
      j.y = a.position.y;
      for (const s of reserved(w, j)) if (s) s.position = { ...a.position };
      // No unattended progress: a round without paid work leaves the process paused.
      if (j.status === 'active' && j.lastPaid < w.tick) {
        j.status = 'paused';
        j.reason =
          'Not worked this round; paid progress and the reserved ingredients are kept.';
        forestEvent(
          w,
          'food-preparation-paused',
          'Preparation paused because it was not worked this round; progress and ingredients are kept.',
          a.position,
          a.id,
          summary(w, j),
          j.id,
        );
      }
      sync(w, a, j);
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
        'Performer died; the unfinished food was left on the ground once, neither completed nor refunded.',
        true,
      );
      forestEvent(
        w,
        'food-preparation-failed',
        'Preparation stopped by death; the actual unfinished food lies on the ground.',
        a.position,
        a.id,
        summary(w, j),
        j.id,
      );
      sync(w, a, j);
    }
  },
};
