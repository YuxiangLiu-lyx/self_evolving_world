import type {
  V7ActionContext,
  V7Actor,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Id, v7Json, v7Number, v7String } from './continuous-data.js';
import { v7Distance } from './continuous-geometry.js';
import { rootPlacement } from './collective-tray-placement.js';
import {
  collectiveJobs,
  workAllocations,
  workCreate,
  workFind,
  workPay,
  workReserve,
  workResult,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import { openRemember } from './open-foundation.js';

const ID = 'controlled-food-processing-trial';
const REVISION = `${ID}@1`;
const STATE = 'long:work:food-trial';
/** A predeclared observation checkpoint, not a processing duration or preservation threshold. */
export const FOOD_TRIAL_CHECKPOINT = 10;
const OFFSETS = [-0.1, 0.1];
const NO_MODEL =
  'No food moisture, drying or preservation model exists in this world; both samples keep the existing decay rules.';

const sync = (a: V7Actor, j: CollectiveWork) => {
  a.extensionState[STATE] = v7Json(j);
};
const samples = (w: V7World, trial: V7Object) =>
  (Array.isArray(trial.data.samples) ? trial.data.samples : [])
    .map((id) =>
      w.stacks.find((s) => s.id === id && s.reservedFor === trial.id),
    )
    .filter((s) => s !== undefined);

function trialInReach(c: V7ActionContext) {
  const target = v7String(c.action.args.target, 'trial target');
  const trial = c.world.objects.find(
    (o) => o.id === target && o.revision === REVISION,
  );
  if (!trial) throw new Error('The target is not an existing food trial.');
  if (v7Distance(c.actor.position, trial.spatial) > c.actor.radius + 0.65)
    throw new Error('Return within actual reach of the trial.');
  return trial;
}

function stopSetup(w: V7World, a: V7Actor, j: CollectiveWork, ground: boolean) {
  workStop(
    w,
    a,
    j,
    'Unfinished food trial setup cancelled; reserved food released once. Paid effort is not refunded.',
    ground,
  );
  w.objects = w.objects.filter((o) => o.id !== j.target);
  sync(a, j);
}

function start(c: V7ActionContext): V7HandlerResult {
  let j = workFind(c);
  if (c.action.args.mode === 'cancel') {
    if (j) {
      stopSetup(c.world, c.actor, j, false);
      return workResult(j);
    }
    const trial = trialInReach(c);
    if (trial.createdBy !== c.actor.id || trial.data.stage !== 'exposed')
      throw new Error('Only the operator can end an ongoing exposure.');
    trial.data.stage = 'ended';
    trial.data.endedAt = c.world.tick;
    c.emit(
      'food-trial-ended',
      'Observation ended; the samples stay in place and keep ageing until retrieved.',
      { trial: trial.id },
      trial.id,
    );
    return { complete: true, writes: [trial.id] };
  }
  if (!j) {
    if (c.action.args.mode !== 'start')
      throw new Error('No existing personal food trial setup to resume.');
    const quantity = c.action.args.quantity ?? 2;
    if (quantity !== 1 && quantity !== 2)
      throw new Error('A trial uses one or two whole food units.');
    const spatial: V7Object['spatial'] = {
      x: v7Number(c.action.args.x, 'workspace x'),
      y: v7Number(c.action.args.y, 'workspace y'),
      angle: 0,
      shape: { kind: 'circle', radius: 0.2 },
      solid: false,
      reserved: true,
      interaction: 0.65,
      entrances: [],
    };
    const placement = rootPlacement(c.world, c.actor, spatial, 0.2);
    if (placement.error) throw new Error(placement.error);
    const id = v7String(c.action.args.inputStackId, 'inputStackId');
    const units = Array.from({ length: quantity }, () =>
      workAllocations(c, [{ itemId: id, quantity: 1 }]),
    );
    const stack = units[0]?.[0]?.stack;
    const resource = c.world.resources.find((r) => r.id === stack?.resource);
    if (
      !stack ||
      !resource ||
      resource.nutrition <= 0 ||
      resource.toxicity !== 0 ||
      (stack.decay ?? 0) >= (resource.properties?.decay ?? 0) ||
      stack.quantity < quantity
    )
      throw new Error(
        'Whole units of an owned, unspoiled, known nontoxic food are required.',
      );
    if (c.actor.vitals.energy < 1)
      throw new Error('One energy is required before placing samples.');
    j = workCreate(c, 'expose', 2);
    j.x = spatial.x;
    j.y = spatial.y;
    for (const allocation of units) workReserve(c, j, allocation, true);
    const trial: V7Object = {
      id: v7Id(c.world, 'food-trial'),
      kind: 'food-trial',
      name: 'Food exposure trial',
      spatial,
      visual: {
        component: 'loose-material',
        color: '#b99e73',
        accent: '#ddd0aa',
        label: 'Food trial',
        state: 'partial',
      },
      data: {
        stage: 'setup',
        resource: resource.id,
        samples: [...j.escrow],
        matchedControl: quantity === 2,
        treatmentDifference: 'none modeled',
        model: NO_MODEL,
        workId: j.id,
      },
      createdBy: c.actor.id,
      createdAt: c.world.tick,
      revision: REVISION,
    };
    j.target = trial.id;
    c.world.objects.push(trial);
  } else if (
    c.action.args.mode === 'start' &&
    (c.action.args.x !== j.x || c.action.args.y !== j.y)
  )
    throw new Error(
      'A different trial cannot replace paid setup. Resume or cancel the existing process.',
    );
  const trial = c.world.objects.find((o) => o.id === j.target);
  if (!trial || !['active', 'paused'].includes(j.status))
    throw new Error('The food trial setup is already settled or unavailable.');
  if (v7Distance(c.actor.position, trial.spatial) > c.actor.radius + 0.65)
    throw new Error(
      'Return within actual reach of the trial; paid work remains.',
    );
  const reserved = j.escrow
    .map((id) =>
      c.world.stacks.find((s) => s.id === id && s.reservedFor === j.id),
    )
    .filter((s) => s !== undefined);
  if (reserved.length !== j.escrow.length) {
    stopSetup(c.world, c.actor, j, true);
    return workResult(j);
  }
  if (!workPay(c, j, 1)) {
    sync(c.actor, j);
    return workResult(j);
  }
  if (j.remainingWork === 0) {
    j.status = 'completed';
    j.outputs = [trial.id];
    reserved.forEach((s, i) => {
      s.reservedFor = trial.id;
      s.owner = null;
      s.position = {
        x: trial.spatial.x + (OFFSETS[i] ?? 0),
        y: trial.spatial.y,
      };
    });
    trial.data.stage = 'exposed';
    trial.data.placedAt = c.world.tick;
    trial.data.roundsExposed = 0;
    trial.data.endpointReached = false;
    trial.visual.state = 'ready';
    c.emit(
      'food-trial-placed',
      `Food samples placed at two ground positions for observation. ${NO_MODEL}`,
      {
        trial: trial.id,
        samples: reserved.map((s) => s.id),
        matchedControl: reserved.length === 2,
        energy: j.paidEnergy,
        rounds: j.completedWork,
      },
      trial.id,
    );
  }
  sync(c.actor, j);
  return workResult(j);
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const trial = trialInReach(c);
  v7Spend(c.actor, 0.2);
  const value = {
    stage: trial.data.stage ?? null,
    roundsExposed: trial.data.roundsExposed ?? 0,
    endpointReached: trial.data.endpointReached ?? false,
    samples: samples(c.world, trial).map((s) => ({
      id: s.id,
      quantity: s.quantity,
      decay: s.decay ?? 0,
    })),
  };
  openRemember(c, {
    key: `${trial.id}:sample-condition`,
    subject: trial.id,
    property: 'sample quantity and decay under ordinary ground exposure',
    value,
    method: 'direct inspection',
    condition: NO_MODEL,
    verified: false,
  });
  c.emit(
    'food-trial-inspected',
    'Food trial samples inspected; no preserved status or safety certification exists.',
    { trial: trial.id, ...value },
    trial.id,
  );
  return { complete: true, writes: [trial.id] };
}

function retrieve(c: V7ActionContext): V7HandlerResult {
  const trial = trialInReach(c);
  if (trial.createdBy !== c.actor.id)
    throw new Error('Only the operator may retrieve these samples.');
  if (trial.data.stage !== 'exposed' && trial.data.stage !== 'ended')
    throw new Error('No placed samples remain in this trial.');
  v7Spend(c.actor, 1);
  const recovered = samples(c.world, trial);
  for (const s of recovered) {
    delete s.reservedFor;
    s.owner = c.actor.id;
    s.position = { ...c.actor.position };
  }
  trial.data.stage = 'retrieved';
  trial.data.retrievedAt = c.world.tick;
  trial.visual.state = 'partial';
  c.emit(
    'food-trial-retrieved',
    'Only the actually remaining sample material was taken back.',
    {
      trial: trial.id,
      recovered: recovered.map((s) => ({ id: s.id, quantity: s.quantity })),
      energy: 1,
    },
    trial.id,
  );
  return { complete: true, writes: [trial.id, ...recovered.map((s) => s.id)] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = c.action.args.mode;
  if (mode === 'inspect') return inspect(c);
  if (mode === 'retrieve') return retrieve(c);
  return start(c);
}

export function updateFoodTrials(w: V7World) {
  for (const j of collectiveJobs(w, ID).filter((j) =>
    ['active', 'paused'].includes(j.status),
  )) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a) continue;
    if (j.lastPaid < w.tick) j.status = 'paused';
    sync(a, j);
  }
  for (const trial of w.objects.filter(
    (o) => o.revision === REVISION && o.data.stage === 'exposed',
  )) {
    const rounds = w.tick - Number(trial.data.placedAt);
    const present = samples(w, trial);
    trial.data.roundsExposed = rounds;
    trial.data.endpointReached = rounds >= FOOD_TRIAL_CHECKPOINT;
    trial.data.remaining = present.reduce((n, s) => n + s.quantity, 0);
    if (!present.some((s) => s.quantity > 0)) trial.data.stage = 'spoiled-out';
  }
}

export const LONG_FOOD_TRIAL: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex14',
  dependencies: ['foundation-open@1'],
  description:
    'General paired food exposure-and-observation trial. No food moisture or preservation model exists, so samples keep existing decay and no preserved status is awarded.',
  reuse: {
    experiment: 'ex10/ex12 paid-work infrastructure; ex13 placement checks',
    source:
      'collective-work.ts (escrow, paid work, portions); collective-tray-placement.ts (site check); open-foundation.ts (personal records)',
    description:
      'Reuses escrow, fractional portions that keep origin, age and decay, paid work and placement checks. The ex12 drying physics is not reused: it belongs to a different food representation with moisture state that this world lacks.',
  },
  abilities: [
    {
      id: ID,
      name: 'Controlled food processing trial',
      function:
        'Place one or two whole units of an owned food on the ground as a paired exposure trial, inspect their quantity and decay, end the observation or retrieve what remains.',
      equivalence: 'food:paired-ground-exposure:observation-trial:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['start', 'resume', 'cancel', 'inspect', 'retrieve'],
          },
          inputStackId: { type: 'string' },
          quantity: { type: 'integer', minimum: 1, maximum: 2 },
          x: { type: 'number' },
          y: { type: 'number' },
          target: { type: 'string' },
          processId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: {
        inputStackId: 'optional-owned',
        target: 'optional-exact-visible',
      },
      prerequisites: [],
      learning: 3,
      costs:
        'Start: inputStackId of an owned, unspoiled, nontoxic food, quantity 1 or 2 whole units (default 2), and an unoccupied ordinary-ground x/y within 0.65 plus body radius; two work rounds at one energy each. Resume/cancel use personal processId. Inspect: target trial in reach, one round and 0.2 energy. Retrieve: operator only, one round and one energy. Cancel of an exposed trial ends observation at no cost. No supports, tools, water or fuel are used or granted.',
      effects:
        'Completed setup places the samples at two ground positions 0.2 apart under the same ambient conditions; with one unit there is no matched control. No food moisture, drying or preservation model exists in this world: both samples keep the existing decay rules, so no treatment difference, preserved status, safety certification or extended lifetime is produced. The trial records rounds exposed and marks a 10-round observation checkpoint; ageing continues while unattended and after the checkpoint. Inspect records sample quantity and decay as a personal unverified record. Retrieve returns only the remaining material, never a replacement. Setup interruption keeps paid work; cancel releases reserved food once; death releases it on the ground. Spent effort is never refunded. No reward for starting, inspecting or retrieving.',
      handler: 'long.food-trial',
      revision: REVISION,
      authored: false,
      practiceEvidence: 'food-trial-inspected',
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Setup is paid work whose exact job and escrow persist across interruption; resume pays only remaining work and cancellation/death settles once. Inspect, retrieve and ending observation are atomic.',
      },
    },
  ],
  handlers: { 'long.food-trial': execute },
  processes: {},
  visualComponents: ['loose-material'],
  events: [
    'food-trial-placed',
    'food-trial-inspected',
    'food-trial-ended',
    'food-trial-retrieved',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: updateFoodTrials,
  onDeath: (w, a) => {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
    ))
      stopSetup(w, a, j, true);
  },
};
