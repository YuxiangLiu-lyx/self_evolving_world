import type {
  V7ActionContext,
  V7HandlerResult,
  V7Package,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7String } from './continuous-data.js';
import { v7Distance } from './continuous-geometry.js';
import { collectiveJobs } from './collective-work.js';
import {
  executeRootPlanting,
  stopRootPlanting,
  updateRootPlanting,
} from './long-planting.js';
import type { RootTrialKind } from './long-planting.js';
import { OPEN_FOUNDATION } from './open-foundation.js';

const ID = 'cultivate-plant';
const REVISION = `${ID}@1`;
const KIND: RootTrialKind = {
  revision: REVISION,
  stateKey: 'long:work:cultivation',
};

/** The exact persistent plot this actor may handle: a completed or emptied trial in reach. */
function ownPlot(c: V7ActionContext) {
  const target = v7String(c.action.args.target, 'plot target');
  const plot = c.world.objects.find(
    (o) => o.id === target && o.revision === REVISION,
  );
  if (!plot) throw new Error('The target is not an existing cultivation plot.');
  if (v7Distance(c.actor.position, plot.spatial) > c.actor.radius + 0.65)
    throw new Error('Return within actual reach of the plot.');
  return plot;
}

/** Inspection is the baseline probe observation of the plot, at its existing cost. */
function inspect(c: V7ActionContext): V7HandlerResult {
  const plot = ownPlot(c);
  const probe = OPEN_FOUNDATION.handlers['open.probe'];
  if (!probe) throw new Error('Missing baseline probe.');
  const result = probe({
    ...c,
    action: {
      interface: 'probe',
      args: { target: plot.id, mode: 'observe', intensity: 0 },
    },
  });
  c.emit(
    'cultivation-plot-inspected',
    'The plot was observed with baseline probe mechanics; only visible state was recorded.',
    { plot: plot.id, stage: plot.data.stage ?? null },
    plot.id,
  );
  return result;
}

/** Remove returns only the physically remaining planted material to its planter. */
function remove(c: V7ActionContext): V7HandlerResult {
  const plot = ownPlot(c);
  if (plot.createdBy !== c.actor.id)
    throw new Error('Only the planter may remove material from this plot.');
  if (typeof plot.data.plantedAt !== 'number')
    throw new Error('No completed planting remains in this plot.');
  v7Spend(c.actor, 1);
  const material = c.world.stacks.find(
    (s) => s.id === plot.data.inputItem && s.reservedFor === plot.id,
  );
  const recovered = material && material.quantity > 0 ? material.quantity : 0;
  if (material) {
    delete material.reservedFor;
    material.owner = c.actor.id;
    material.position = { ...c.actor.position };
  }
  plot.data.plantedRound = plot.data.plantedAt;
  delete plot.data.plantedAt;
  plot.data.removedAt = c.world.tick;
  plot.data.remainingRootUnits = 0;
  plot.data.stage = 'emptied-plot';
  plot.visual.state = 'partial';
  c.emit(
    'cultivation-plot-removed',
    'Remaining planted material was taken back; no fresh replacement or growth was produced.',
    { plot: plot.id, inputItem: material?.id ?? null, recovered, energy: 1 },
    plot.id,
  );
  return {
    complete: true,
    writes: [plot.id, ...(material ? [material.id] : [])],
  };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = c.action.args.mode;
  if (mode === 'inspect') return inspect(c);
  if (mode === 'remove') return remove(c);
  if (mode === 'tend') {
    ownPlot(c);
    throw new Error(
      'No tending intervention is available: plots are made on bare soil, no competing cover is represented on them, and watering needs an implemented water input. Nothing was spent.',
    );
  }
  if (mode === 'plant' && c.action.args.quantity !== undefined) {
    if (c.action.args.quantity !== 1)
      throw new Error('Each trial plants exactly one root unit.');
  }
  return executeRootPlanting(c, undefined, KIND);
}

export const LONG_CULTIVATION: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex14',
  dependencies: ['foundation-open@1'],
  description:
    'General cultivation operation for any learned actor: a paid one-unit root planting trial with baseline-probe inspection and recovery of remaining material. No propagation, growth or yield rule exists for roots, so replenishment remains unverified.',
  reuse: {
    experiment: 'ex13 root-planting-trial@1; ex10/ex12 infrastructure',
    source:
      'long-planting.ts (paid two-round placement, escrow, ageing and death handling, parameterized by plot revision); open-foundation.ts (baseline probe observation); collective-work.ts',
    description:
      'Reuses the ex13 planting precursor implementation and the baseline probe unchanged. The fresh ex14 request was independently reviewed; this is recorded implementation reuse, not reinvention, and no ex13 ability, plot, knowledge or mastery is inherited.',
  },
  abilities: [
    {
      id: ID,
      name: 'Cultivate plant',
      function:
        'Plant one owned root unit in a small soil plot as a persistent trial, inspect a plot by direct observation, or take back remaining planted material; resume or cancel unfinished planting.',
      equivalence: 'cultivation:root-trial:plant-inspect-remove:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['plant', 'resume', 'cancel', 'inspect', 'tend', 'remove'],
          },
          target: { type: 'string' },
          inputStackId: { type: 'string' },
          quantity: { type: 'integer', minimum: 1, maximum: 1 },
          processId: { type: 'string' },
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
        'Plant: one owned unspoiled root unit (quantity 1); two work rounds at one energy each, at an unoccupied ordinary-soil x/y within 0.65 plus body radius; supply inputStackId. Resume/cancel use personal processId. Inspect: one round and 0.2 energy, the baseline probe observation of a plot in reach (target). Remove: one round and 1 energy, planter only (target). Tend is unavailable and spends nothing. No tools or water are granted.',
      effects:
        'Completed planting places the real root unit in the plot; it keeps ageing under existing environmental decay while the planter is absent. Plot state records stage, observation rounds, soil moisture and temperature/rain exposure. There is no propagation, growth, harvest or replenishment rule for roots, so a plot never produces food. Inspect records only visible state. Remove returns only the material that physically remains, never a replacement; the emptied plot remains. Cancel releases unplanted material once; death releases it on the ground. Spent effort is never refunded. No reward for planting, inspecting or removing; genuine observed changes use the existing evidence-deduplicated probe feedback only.',
      handler: 'long.cultivate-plant',
      revision: REVISION,
      authored: false,
      practiceEvidence: 'cultivation-plot-inspected',
      dependencies: { abilities: [], resources: ['root'], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Planting is paid work whose exact job and escrow persist across interruption; resume pays only remaining work and cancellation/death settles once. Inspect and remove are atomic one-round actions.',
      },
    },
  ],
  handlers: { 'long.cultivate-plant': execute },
  processes: {},
  visualComponents: ['plant'],
  events: [
    'root-trial-planted',
    'cultivation-plot-inspected',
    'cultivation-plot-removed',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: (w) => {
    updateRootPlanting(w, ID, KIND);
  },
  onDeath: (w, a) => {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
    ))
      stopRootPlanting(w, a, j, true, KIND);
  },
};
