import type {
  V7ActionContext,
  V7Actor,
  V7HandlerResult,
  V7Object,
  V7Package,
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
import { v7Distance } from './continuous-geometry.js';
import { FOREST_BASE } from './forest-foundation.js';
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

const ID = 'arrange-resting-material';
const REVISION = `${ID}@1`;
const STATE = 'long:work:resting-material';
/** Only loose moss has implemented ground-placement applicability in this first version. */
const MATERIALS = ['moss'];
const RADIUS = 0.25;

const sync = (a: V7Actor, j: CollectiveWork) => {
  a.extensionState[STATE] = v7Json(j);
};
const contents = (w: V7World, patch: V7Object) =>
  w.stacks.filter((s) => s.reservedFor === patch.id && s.quantity > 0);
const occupied = (w: V7World, patch: V7Object, self: string) =>
  w.actors.some(
    (a) => a.id !== self && v7Distance(a.position, patch.spatial) < RADIUS,
  );

function patchInReach(c: V7ActionContext) {
  const target = v7String(c.action.args.target, 'patch target');
  const patch = c.world.objects.find(
    (o) => o.id === target && o.revision === REVISION,
  );
  if (!patch) throw new Error('The target is not an existing resting patch.');
  if (v7Distance(c.actor.position, patch.spatial) > c.actor.radius + 0.65)
    throw new Error('Return within actual reach of the patch.');
  return patch;
}

function stopArrange(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  ground: boolean,
) {
  workStop(
    w,
    a,
    j,
    'Unfinished arrangement stopped; reserved material released once. Paid effort is not refunded.',
    ground,
  );
  w.objects = w.objects.filter((o) => o.id !== j.target);
  sync(a, j);
}

function arrange(c: V7ActionContext): V7HandlerResult {
  let j = workFind(c);
  if (c.action.args.mode === 'cancel') {
    if (!j) throw new Error('No unfinished personal arrangement to cancel.');
    stopArrange(c.world, c.actor, j, false);
    return workResult(j);
  }
  if (!j) {
    if (c.action.args.mode !== 'arrange')
      throw new Error('No unfinished personal arrangement to resume.');
    const quantity = v7Number(c.action.args.quantity ?? 0.5, 'quantity', 0.1);
    if (Math.abs(quantity * 10 - Math.round(quantity * 10)) > 1e-9)
      throw new Error('Quantity uses 0.1-unit increments.');
    const spatial: V7Object['spatial'] = {
      x: v7Number(c.action.args.x, 'site x'),
      y: v7Number(c.action.args.y, 'site y'),
      angle: 0,
      shape: { kind: 'circle', radius: RADIUS },
      solid: false,
      reserved: true,
      interaction: 0.65,
      entrances: [],
    };
    const placement = rootPlacement(c.world, c.actor, spatial, RADIUS);
    if (placement.error) throw new Error(placement.error);
    const allocation = workAllocations(c, [
      { itemId: c.action.args.inputStackId, quantity },
    ]);
    const input = allocation[0]?.stack;
    if (!input || !MATERIALS.includes(input.resource))
      throw new Error(
        'Only owned loose moss has implemented ground-placement applicability.',
      );
    if (c.actor.vitals.energy < 1)
      throw new Error('One energy is required before arranging material.');
    j = workCreate(c, 'arrange', 2);
    j.x = spatial.x;
    j.y = spatial.y;
    workReserve(c, j, allocation, true);
    const patch: V7Object = {
      id: v7Id(c.world, 'resting-patch'),
      kind: 'resting-material-patch',
      name: 'Resting material patch',
      spatial,
      visual: {
        component: 'loose-material',
        color: '#6f925c',
        accent: '#a9c193',
        label: 'Resting patch',
        state: 'partial',
      },
      data: {
        stage: 'arranging',
        material: input.resource,
        quantity,
        workId: j.id,
        tests: [],
      },
      createdBy: c.actor.id,
      createdAt: c.world.tick,
      revision: REVISION,
    };
    j.target = patch.id;
    c.world.objects.push(patch);
  } else if (
    c.action.args.mode === 'arrange' &&
    (c.action.args.x !== j.x || c.action.args.y !== j.y)
  )
    throw new Error(
      'A different arrangement cannot replace paid work. Resume or cancel the existing process.',
    );
  const patch = c.world.objects.find((o) => o.id === j.target);
  if (!patch || !['active', 'paused'].includes(j.status))
    throw new Error('The arrangement is already settled or unavailable.');
  if (v7Distance(c.actor.position, patch.spatial) > c.actor.radius + 0.65)
    throw new Error(
      'Return within actual reach of the site; paid work remains.',
    );
  const reserved = j.escrow
    .map((id) =>
      c.world.stacks.find((s) => s.id === id && s.reservedFor === j.id),
    )
    .filter((s) => s !== undefined);
  if (reserved.length !== j.escrow.length) {
    stopArrange(c.world, c.actor, j, true);
    return workResult(j);
  }
  if (!workPay(c, j, 1)) {
    sync(c.actor, j);
    return workResult(j);
  }
  if (j.remainingWork === 0) {
    j.status = 'completed';
    j.outputs = [patch.id];
    for (const s of reserved) {
      s.reservedFor = patch.id;
      s.owner = null;
      s.position = { x: patch.spatial.x, y: patch.spatial.y };
    }
    patch.data.stage = 'arranged';
    patch.data.arrangedAt = c.world.tick;
    patch.data.remainingQuantity = v7RoundNumber(
      reserved.reduce((n, s) => n + s.quantity, 0),
    );
    patch.visual.state = 'ready';
    c.emit(
      'resting-patch-arranged',
      'Loose material placed as a small ground patch; no thickness, coverage, warmth or comfort is inferred.',
      {
        patch: patch.id,
        items: reserved.map((s) => s.id),
        quantity: patch.data.remainingQuantity,
        energy: j.paidEnergy,
      },
      patch.id,
    );
  }
  sync(c.actor, j);
  return workResult(j);
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const patch = patchInReach(c);
  v7Spend(c.actor, 0.2);
  const value = {
    stage: patch.data.stage ?? null,
    material: patch.data.material ?? null,
    remainingQuantity: v7RoundNumber(
      contents(c.world, patch).reduce((n, s) => n + s.quantity, 0),
    ),
    occupied: occupied(c.world, patch, c.actor.id),
    tests: patch.data.tests ?? [],
  };
  openRemember(c, {
    key: `${patch.id}:visible-state`,
    subject: patch.id,
    property: 'visible placement, remaining quantity, occupancy and tests',
    value,
    method: 'direct inspection',
    condition:
      'Quality, sanitation, warmth and insulation are not represented.',
    verified: false,
  });
  c.emit(
    'resting-patch-inspected',
    'Resting patch inspected; unknown material properties stay unknown.',
    { patch: patch.id, ...value },
    patch.id,
  );
  return { complete: true, writes: [patch.id] };
}

function trialRest(c: V7ActionContext): V7HandlerResult {
  const patch = patchInReach(c);
  if (patch.data.stage !== 'arranged')
    throw new Error('Only a completed patch can be used for a rest trial.');
  if (v7Distance(c.actor.position, patch.spatial) > RADIUS)
    throw new Error('Move onto the patch before a rest trial.');
  if (occupied(c.world, patch, c.actor.id))
    throw new Error('Another person occupies the patch.');
  const rest = FOREST_BASE.handlers['forest.rest'];
  if (!rest) throw new Error('Missing baseline rest.');
  const before = c.actor.vitals.energy;
  const result = rest({ ...c, action: { interface: 'rest', args: {} } });
  const test = {
    tick: c.world.tick,
    actor: c.actor.id,
    energyBefore: before,
    energyAfter: c.actor.vitals.energy,
    facilityBonus: 0,
  };
  patch.data.tests = [
    ...(Array.isArray(patch.data.tests) ? patch.data.tests : []),
    test,
  ].slice(-8);
  c.emit(
    'resting-patch-rest-trial',
    'One ordinary rest on the patch; the patch is not a registered facility, so no comfort or recovery bonus applies.',
    { patch: patch.id, ...test },
    patch.id,
  );
  return { complete: true, writes: [patch.id, ...result.writes] };
}

function remove(c: V7ActionContext): V7HandlerResult {
  const patch = patchInReach(c);
  if (patch.createdBy !== c.actor.id)
    throw new Error('Only the person who arranged the patch may remove it.');
  if (patch.data.stage !== 'arranged')
    throw new Error('Finish or cancel the arrangement first.');
  if (occupied(c.world, patch, c.actor.id))
    throw new Error('Another person occupies the patch.');
  v7Spend(c.actor, 1);
  const left = contents(c.world, patch);
  for (const s of left) {
    delete s.reservedFor;
    s.owner = c.actor.id;
    s.position = { x: patch.spatial.x, y: patch.spatial.y };
  }
  c.world.objects = c.world.objects.filter((o) => o.id !== patch.id);
  c.emit(
    'resting-patch-removed',
    'Remaining material returned as owned material at the site; nothing replaced or certified.',
    {
      patch: patch.id,
      items: left.map((s) => s.id),
      quantity: v7RoundNumber(left.reduce((n, s) => n + s.quantity, 0)),
      tests: patch.data.tests ?? [],
      energy: 1,
    },
    null,
  );
  return { complete: true, writes: left.map((s) => s.id) };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = c.action.args.mode;
  if (mode === 'inspect') return inspect(c);
  if (mode === 'trial-rest') return trialRest(c);
  if (mode === 'remove') return remove(c);
  return arrange(c);
}

export const LONG_RESTING_MATERIAL: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex14',
  dependencies: ['foundation-open@1'],
  description:
    'General loose resting-material arrangement with paid placement, inspection, ordinary-rest trials and removal; no bedding, warmth or comfort effect is modeled.',
  reuse: {
    experiment: 'ex13 moss-resting-pad-trial@1 design; ex10/ex12 paid work',
    source:
      'collective-work.ts (escrow, portions, paid work); collective-tray-placement.ts (site check); forest-foundation.ts (baseline rest); open-foundation.ts (personal records)',
    description:
      'Follows the ex13 loose-moss trial design and reuses existing escrow, site checks and the baseline rest handler unchanged. No ex13 ability, patch or mastery is inherited.',
  },
  abilities: [
    {
      id: ID,
      name: 'Arrange resting material',
      function:
        'Arrange owned loose moss as a small ground patch, inspect it, try one ordinary rest on it, or take back what remains; resume or cancel unfinished arranging.',
      equivalence: 'resting-material:loose-ground-patch:rest-trial:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: [
              'arrange',
              'resume',
              'cancel',
              'inspect',
              'trial-rest',
              'remove',
            ],
          },
          inputStackId: { type: 'string' },
          quantity: { type: 'number', minimum: 0.1 },
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
        'Arrange: inputStackId of owned moss, quantity in 0.1 steps (default 0.5) and an unoccupied ordinary-ground x/y within 0.65 plus body radius; two work rounds at one energy each. Resume/cancel use personal processId. Inspect: one round and 0.2 energy in reach. Trial-rest: stand on a completed, unoccupied patch; one ordinary rest round. Remove: the arranger only, unoccupied patch, one round and one energy.',
      effects:
        'A completed patch holds the reserved material in a 0.25-radius footprint used only for occupancy and drawing; no thickness, coverage, body fit, warmth, insulation or comfort is inferred. Trial-rest runs the existing rest action unchanged and records energy before and after; the patch is not a registered facility, so it adds no recovery bonus. Inspect records visible placement, remaining quantity, occupancy and tests as a personal unverified record. Remove returns the remaining material as an owned stack at the site and deletes the patch; pickup stays a separate action. Cancel releases reserved material once; death releases it on the ground. Spent effort is never refunded. No reward, regrowth, repair or top-up.',
      handler: 'long.resting-material',
      revision: REVISION,
      authored: false,
      practiceEvidence: 'resting-patch-inspected',
      dependencies: { abilities: [], resources: ['moss'], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Arranging is paid work whose exact job and escrow persist across interruption; resume pays only remaining work and cancellation/death settles once. Inspect, trial-rest and remove are atomic.',
      },
    },
  ],
  handlers: { 'long.resting-material': execute },
  processes: {},
  visualComponents: ['loose-material'],
  events: [
    'resting-patch-arranged',
    'resting-patch-inspected',
    'resting-patch-rest-trial',
    'resting-patch-removed',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment(w) {
    for (const j of collectiveJobs(w, ID).filter((j) =>
      ['active', 'paused'].includes(j.status),
    )) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (!a) continue;
      if (j.lastPaid < w.tick) j.status = 'paused';
      sync(a, j);
    }
    for (const patch of w.objects.filter(
      (o) => o.revision === REVISION && o.data.stage === 'arranged',
    ))
      patch.data.remainingQuantity = v7RoundNumber(
        contents(w, patch).reduce((n, s) => n + s.quantity, 0),
      );
  },
  onDeath: (w, a) => {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
    ))
      stopArrange(w, a, j, true);
  },
};
