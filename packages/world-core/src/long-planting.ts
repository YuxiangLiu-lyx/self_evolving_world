import { preparedSite } from './long-prepared-site.js';
import { longPlantingSite } from './long-planting-site.js';
import type {
  V7ActionContext,
  V7Actor,
  V7Object,
  V7Package,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7Id, v7Json, v7Number } from './continuous-data.js';
import { v7Distance } from './continuous-geometry.js';
import { forestClimate } from './forest-climate.js';
import { openConditions } from './open-physical.js';
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

const ID = 'root-planting-trial';
const REVISION = ID + '@1';
/** Which package owns a root trial: its plot revision and its personal work-state key. */
export interface RootTrialKind {
  revision: string;
  stateKey: string;
}
const ROOT_TRIAL: RootTrialKind = {
  revision: REVISION,
  stateKey: 'long:work:planting',
};
const sync = (a: V7Actor, j: CollectiveWork, kind = ROOT_TRIAL) => {
  a.extensionState[kind.stateKey] = v7Json(j);
};
export function stopRootPlanting(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  ground: boolean,
  kind = ROOT_TRIAL,
) {
  workStop(
    w,
    a,
    j,
    'Unfinished planting cancelled; surviving unplanted material released once. Paid effort is not refunded.',
    ground || j.preparedSurfaceId !== undefined,
  );
  const surface = w.objects.find((o) => o.id === j.preparedSurfaceId);
  if (surface?.data.activeWork === j.id) surface.data.activeWork = null;
  w.objects = w.objects.filter((o) => o.id !== j.target);
  sync(a, j, kind);
}
export function executeRootPlanting(
  c: V7ActionContext,
  preparedSurfaceId?: string,
  kind = ROOT_TRIAL,
) {
  const mode = c.action.args.mode;
  let j = workFind(c);
  if (mode === 'cancel') {
    if (!j)
      throw new Error(
        'No personal unfinished planting work. Completed specimens cannot be cancelled into food.',
      );
    stopRootPlanting(c.world, c.actor, j, false, kind);
    return workResult(j);
  }
  if (!j) {
    if (mode !== 'plant')
      throw new Error('No existing personal planting work to resume.');
    const spatial: V7Object['spatial'] = {
      x: v7Number(c.action.args.x, 'patch x'),
      y: v7Number(c.action.args.y, 'patch y'),
      angle: 0,
      shape: { kind: 'circle', radius: 0.2 },
      solid: false,
      reserved: true,
      interaction: 0.65,
      entrances: [],
    };
    if (!preparedSurfaceId) {
      const site = longPlantingSite(c.world, c.actor, spatial);
      if (site.error) throw new Error(site.error);
    } else {
      const site = preparedSite(c, preparedSurfaceId);
      if (site.error) throw new Error(site.error);
    }
    const allocations = workAllocations(c, [
      { itemId: c.action.args.inputStackId, quantity: 1 },
    ]);
    const input = allocations[0]?.stack;
    const resource = c.world.resources.find((r) => r.id === input?.resource);
    if (
      !input ||
      input.resource !== 'root' ||
      (input.decay ?? 0) >= (resource?.properties?.decay ?? 0)
    )
      throw new Error(
        'One actual unspoiled owned root unit is required. Edibility does not establish propagation viability.',
      );
    if (c.actor.vitals.energy < (preparedSurfaceId ? 0.5 : 1))
      throw new Error('One energy is required before preparing a patch.');
    j = workCreate(c, 'plant', preparedSurfaceId ? 3 : 2);
    if (preparedSurfaceId) j.preparedSurfaceId = preparedSurfaceId;
    j.x = spatial.x;
    j.y = spatial.y;
    workReserve(c, j, allocations, true);
    const plot: V7Object = {
      id: v7Id(c.world, 'root-trial'),
      kind: 'root-trial',
      name: 'Root planting trial',
      spatial,
      visual: {
        component: 'plant',
        color: '#8e7254',
        accent: '#d6be87',
        label: 'Root trial',
        state: 'partial',
      },
      data: {
        stage: 'prepared-soil',
        elapsed: 0,
        remainingWork: 2,
        progress: 0,
        inputItem: j.escrow[0] ?? '',
        source: input.origin,
        rootUnits: 1,
        workId: j.id,
      },
      createdBy: c.actor.id,
      createdAt: c.world.tick,
      revision: kind.revision,
    };
    j.target = plot.id;
    c.world.objects.push(plot);
    if (preparedSurfaceId) {
      plot.data.preparedSurfaceId = preparedSurfaceId;
      plot.data.stage = 'examination-completed';
      const surface = c.world.objects.find((o) => o.id === preparedSurfaceId);
      if (surface) surface.data.activeWork = j.id;
      workPay(c, j, 0.5);
      sync(c.actor, j, kind);
      return workResult(j);
    }
  }
  const plot = c.world.objects.find((o) => o.id === j.target);
  if (!plot || !['active', 'paused'].includes(j.status))
    throw new Error('The planting work is already settled or unavailable.');
  if (
    mode === 'plant' &&
    (c.action.args.x !== j.x ||
      c.action.args.y !== j.y ||
      c.action.args.inputStackId !== j.sources[0]?.itemId)
  )
    throw new Error(
      'A different planting request cannot replace paid work. Resume or cancel the exact existing process.',
    );
  if (typeof j.preparedSurfaceId === 'string') {
    let error: string | null;
    try {
      error = preparedSite(c, j.preparedSurfaceId, plot.id, j.id).error;
    } catch (e) {
      error =
        e instanceof Error
          ? e.message
          : 'Compatibility could not be established.';
    }
    if (error) {
      j.status = 'paused';
      j.reason = error;
      sync(c.actor, j, kind);
      c.emit(
        'prepared-placement-paused',
        error,
        { processId: j.id, paidEnergy: j.paidEnergy },
        plot.id,
      );
      return workResult(j);
    }
  }
  const placement = rootPlacement(
    { ...c.world, objects: c.world.objects.filter((o) => o.id !== plot.id) },
    c.actor,
    plot.spatial,
    0.2,
  );
  if (placement.error) throw new Error(placement.error);
  if (v7Distance(c.actor.position, plot.spatial) > c.actor.radius + 0.65)
    throw new Error(
      'Return within actual reach of the existing patch; paid work remains.',
    );
  const material = c.world.stacks.find(
    (s) => s.id === j.escrow[0] && s.reservedFor === j.id,
  );
  const expired =
    j.preparedSurfaceId !== undefined &&
    material &&
    (material.decay ?? 0) >=
      (c.world.resources.find((r) => r.id === material.resource)?.properties
        ?.decay ?? 0);
  if (!material || material.quantity < 1 || expired) {
    stopRootPlanting(c.world, c.actor, j, true, kind);
    return workResult(j);
  }
  if (!workPay(c, j, 1)) {
    sync(c.actor, j, kind);
    return workResult(j);
  }
  plot.data.elapsed = j.completedWork;
  plot.data.remainingWork = j.remainingWork;
  plot.data.progress = (j.completedWork - (j.preparedSurfaceId ? 1 : 0)) / 2;
  if (j.remainingWork === 0) {
    j.status = 'completed';
    j.outputs = [plot.id];
    if (j.preparedSurfaceId) {
      const surface = c.world.objects.find((o) => o.id === j.preparedSurfaceId);
      if (surface) {
        surface.data.activeWork = null;
        surface.data.rootTrial = plot.id;
      }
    }
    material.reservedFor = plot.id;
    material.owner = null;
    material.position = { x: j.x, y: j.y };
    plot.data.stage = 'planted-unverified';
    plot.data.plantedAt = c.world.tick;
    plot.data.observationRounds = 0;
    plot.data.remainingRootUnits = material.quantity;
    plot.data.viability =
      'Unverified; this precursor supplies no propagation or harvest rule.';
    plot.visual.state = 'planted-unverified';
    c.emit(
      'root-trial-planted',
      'One real root unit was placed in prepared soil. Propagation remains unverified; no edible output was produced.',
      {
        plot: plot.id,
        inputItem: material.id,
        source: material.origin,
        quantity: 1,
        energy: j.paidEnergy,
        rounds: j.completedWork,
        qualified: false,
      },
      plot.id,
    );
  }
  sync(c.actor, j, kind);
  return workResult(j);
}
export function updateRootPlanting(
  w: V7World,
  ability = ID,
  kind = ROOT_TRIAL,
) {
  for (const j of collectiveJobs(w, ability).filter(
    (j) => j.status === 'active' || j.status === 'paused',
  )) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a) continue;
    if (j.lastPaid < w.tick) j.status = 'paused';
    sync(a, j, kind);
  }
  if (ability !== ID && kind === ROOT_TRIAL) return;
  for (const o of w.objects.filter(
    (o) => o.revision === kind.revision && typeof o.data.plantedAt === 'number',
  )) {
    const s = w.stacks.find(
      (s) => s.id === o.data.inputItem && s.reservedFor === o.id,
    );
    const rounds = w.tick - Number(o.data.plantedAt);
    o.data.observationRounds = rounds;
    o.data.remainingRootUnits = s?.quantity ?? 0;
    o.data.soil = openConditions(w, o.spatial).moisture;
    o.data.exposure = {
      temperature: forestClimate(w, o.spatial).temperature,
      rain: forestClimate(w, o.spatial).rain ?? 0,
    };
    o.data.observationStatus =
      rounds >= 30 ? 'inconclusive' : 'observation interval open';
    // The administrative deadline is not a physical change or an information-gain event.
    o.data.stage =
      !s || s.quantity <= 0 ? 'visibly-decayed' : 'planted-unverified';
    o.visual.state = o.data.stage;
  }
}
export const LONG_PLANTING: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: ['foundation-open@1'],
  description:
    'A paid two-round planting observation precursor. Actual root material persists and ages; no inferred viability, biomass multiplication or food yield.',
  reuse: {
    experiment: 'ex10/ex12 generic infrastructure',
    source:
      'collective-work.ts; collective-tray-placement.ts; open-foundation.ts; forest-environment.ts',
    description:
      'Reuses escrow, paid work, geometry, observation and ageing implementation. No historical generated ability, knowledge, mastery or reward is inherited. The fresh functional request is independent; this infrastructure reuse is not a reimplementation claim.',
  },
  abilities: [
    {
      id: ID,
      name: 'Root planting trial',
      function:
        'Prepare a small soil patch and place one real root unit for a persistent observation trial; resume or cancel unfinished work.',
      equivalence: 'root:paid-placement:observation-trial:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: ['plant', 'resume', 'cancel'] },
          inputStackId: { type: 'string' },
          processId: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
        }),
        required: ['mode'],
      },
      prerequisites: [],
      learning: 2,
      costs:
        'Plant: one owned unspoiled root unit; two work rounds at one energy each. Supply inputStackId and an unoccupied ordinary-soil x/y patch within 0.65 plus body radius. Resume/cancel use personal processId (omitting it selects the sole unfinished job). No tools or water are granted.',
      effects:
        'Preparation and exact escrow persist when other actions interrupt work. Resume pays only remaining work. Cancel releases surviving unplanted material once; death releases it on the ground. Spent effort and spoiled material are never refunded. Completed plots retain the real reserved root while existing environmental ageing runs. Reinspect with baseline probe: 30 elapsed rounds mark an inconclusive observation interval, not maturity or inferred death. There is no propagation, tending or harvest rule in this precursor, and no reward for placing it. Genuine observed changes can use existing evidence-deduplicated probe feedback. Other people can observe the actual plot; execution requires personal study.',
      handler: 'long.root-planting',
      revision: REVISION,
      authored: false,
      references: { inputStackId: 'optional-owned' },
      practiceEvidence: 'root-trial-observed',
      dependencies: { abilities: [], resources: ['root'], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'A disposable action cursor may end; the exact paid job and escrow persist. Two completed work rounds are required. Resume restores remaining work; cancellation/death settles once.',
      },
    },
  ],
  handlers: { 'long.root-planting': (c) => executeRootPlanting(c) },
  processes: {},
  visualComponents: ['plant'],
  events: ['root-trial-planted', 'root-trial-observed'],
  resources: [],
  satisfaction: [],
  afterEnvironment: (w) => {
    updateRootPlanting(w);
  },
  onDeath: (w, a) => {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
    ))
      stopRootPlanting(w, a, j, true);
  },
};
