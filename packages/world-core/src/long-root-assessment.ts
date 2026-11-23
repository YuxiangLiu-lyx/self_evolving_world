import type {
  V7ActionContext,
  V7Actor,
  V7Object,
  V7Package,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7Json, v7String } from './continuous-data.js';
import { v7Reach } from './continuous-geometry.js';
import { openRemember, OPEN_FOUNDATION } from './open-foundation.js';
import { rootPlacement } from './collective-tray-placement.js';
import {
  collectiveJobs,
  workCreate,
  workFind,
  workPay,
  workResult,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
const ID = 'root-assessment',
  REV = ID + '@1';
function sync(a: V7Actor, j: CollectiveWork) {
  if (['active', 'paused'].includes(j.status))
    a.extensionState['long:work:root-assessment'] = v7Json(j);
  else {
    delete a.extensionState['long:work:root-assessment'];
    a.extensionState['long:last-root-assessment'] = v7Json(j);
  }
}
function release(w: V7World, a: V7Actor, j: CollectiveWork) {
  workStop(
    w,
    a,
    j,
    'Inspection stopped; real exposed or covered state and paid effort remain.',
    false,
  );
  const o = w.objects.find((o) => o.id === j.target);
  if (o) {
    o.data.activeAssessment = null;
    o.data.inspectionStatus = 'stopped';
  }
  sync(a, j);
}
function target(c: V7ActionContext, j?: CollectiveWork): V7Object {
  const id =
    typeof c.action.args.target === 'string' && c.action.args.target
      ? c.action.args.target
      : j?.target;
  const o = c.world.objects.find(
    (o) =>
      o.id === id &&
      o.revision === 'root-planting-trial@1' &&
      typeof o.data.plantedAt === 'number',
  );
  if (!o || !v7Reach(c.actor, o.spatial))
    throw new Error('An actual reachable completed root plot is required.');
  if (j && j.target !== o.id)
    throw new Error(
      'A different plot cannot replace the existing paid assessment.',
    );
  return o;
}
function observe(c: V7ActionContext, o: V7Object) {
  const handler = OPEN_FOUNDATION.handlers['open.probe'];
  if (!handler) throw new Error('Missing baseline observation implementation.');
  return handler({
    ...c,
    action: {
      interface: ID,
      args: { target: o.id, mode: 'observe', intensity: 0 },
    },
  });
}
function inspectionFinding(c: V7ActionContext, o: V7Object) {
  const s = c.world.stacks.find(
    (s) =>
      s.id === o.data.inputItem && s.reservedFor === o.id && s.quantity > 0,
  );
  const condition = s
    ? 'original specimen remains; propagation unverified'
    : 'original specimen visibly decayed; no surviving edible output';
  const key = o.id + ':exposed-root-condition';
  const old = c.actor.memory.knowledge?.[key];
  openRemember(c, {
    key,
    subject: o.id,
    property: 'actually exposed specimen condition',
    value: condition,
    method: 'paid physical uncovering',
    condition: 'original planted material; no viability or growth test',
    verified: false,
  });
  if (old && old.value !== condition && c.world.tick - old.tick >= 20)
    openRemember(c, {
      key: o.id + ':physical-transition:' + condition,
      subject: o.id,
      property: 'dated physical specimen change',
      value: { before: old.value, after: condition },
      method: 'paid repeated uncovering',
      condition: 'actual surviving material or its loss, not a timer',
      verified: true,
    });
  c.emit(
    'root-inspected',
    'The reserved specimen was physically exposed; only actual present condition is recorded.',
    { plot: o.id, condition, qualified: false },
    o.id,
  );
}
function execute(c: V7ActionContext) {
  const mode = v7String(c.action.args.mode, 'assessment mode');
  let j = workFind(c);
  if (mode === 'cancel') {
    if (!j) throw new Error('No personal unfinished assessment.');
    release(c.world, c.actor, j);
    return workResult(j);
  }
  const o = target(c, mode === 'observe' ? undefined : j);
  if (mode === 'observe') return observe(c, o);
  if (o.createdBy !== c.actor.id)
    throw new Error(
      'Physical inspection requires the plot creator; observing does not grant handling permission.',
    );
  if (o.data.activeAssessment && o.data.activeAssessment !== j?.id)
    throw new Error('Another actual assessment holds the plot work lock.');
  if (mode === 'begin') {
    if (j)
      throw new Error(
        'Use observe, inspect, resume or cancel for the existing assessment.',
      );
    const result = observe(c, o);
    j = workCreate(c, 'inspect', 2);
    j.target = o.id;
    j.x = o.spatial.x;
    j.y = o.spatial.y;
    j.status = 'paused';
    j.baselineAt = c.world.tick;
    o.data.activeAssessment = j.id;
    o.data.inspectionStatus = 'baseline-recorded';
    sync(c.actor, j);
    return { ...result, writes: [...result.writes, o.id, j.id] };
  }
  const placement = rootPlacement(
    { ...c.world, objects: c.world.objects.filter((x) => x.id !== o.id) },
    c.actor,
    o.spatial,
    0.2,
  );
  if (placement.error) throw new Error(placement.error);
  if (!j) {
    if (mode !== 'inspect')
      throw new Error('No unfinished personal inspection to resume.');
    if (c.actor.vitals.energy < 1)
      throw new Error('One energy is required to begin physical inspection.');
    j = workCreate(c, 'inspect', 2);
    j.target = o.id;
    j.x = o.spatial.x;
    j.y = o.spatial.y;
    o.data.activeAssessment = j.id;
  }
  if (!workPay(c, j, 1)) {
    sync(c.actor, j);
    return workResult(j);
  }
  if (j.completedWork === 1) {
    o.data.exposed = true;
    o.data.displacedSoil = 0.05;
    o.data.inspectionStatus = 'exposed';
    inspectionFinding(c, o);
  } else {
    o.data.exposed = false;
    o.data.displacedSoil = 0;
    o.data.inspectionStatus = 'covered';
    o.data.activeAssessment = null;
    j.status = 'completed';
    j.outputs = [o.id];
    c.emit(
      'root-inspection-completed',
      'Displaced soil was replaced after actual inspection; no root, freshness, biomass or food was created.',
      {
        plot: o.id,
        paidEnergy: j.paidEnergy,
        rounds: j.completedWork,
        qualified: false,
      },
      o.id,
    );
  }
  o.data.inspectionProgress = j.completedWork / 2;
  o.data.inspectionRemaining = j.remainingWork;
  sync(c.actor, j);
  return workResult(j);
}
export const LONG_ROOT_ASSESSMENT: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: ['root-planting-trial@1'],
  description:
    'Persistent nonproductive planted-root assessment with real uncovering and re-covering; no unobserved viability or timer-based growth.',
  reuse: {
    experiment: 'ex13 planting; ex10/ex12 infrastructure',
    source:
      'long-planting.ts; open-foundation.ts; collective-work.ts; collective-tray-placement.ts',
    description:
      'Reuses current-scope plots, baseline probe/evidence, paid escrow-independent work and placement checks. No historical capability activation or claim of independent code reinvention.',
  },
  abilities: [
    {
      id: ID,
      name: 'Assess a planted root',
      function:
        'Record a planted-root baseline, observe, or physically uncover and cover an existing specimen while retaining actual progress and private evidence.',
      equivalence: 'planted-root:paid-inspection:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['begin', 'observe', 'inspect', 'resume', 'cancel'],
          },
          target: { type: 'string' },
          processId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: { target: 'optional-exact-visible' },
      prerequisites: [],
      learning: 2,
      costs:
        'Begin/observe: one round and 0.2 energy. Inspect: two paid work rounds, one energy each, no consumed root or tools. Only the creator may handle a plot; anyone may observe reachable public state. Provide target plot ID; resume/cancel can use exact personal processId.',
      effects:
        'Begin records an external baseline and claims a personal work lock. Inspect uncovers the existing reserved root, records actual present condition, then replaces displaced soil. Interruption retains exposure and paid work; resume completes outstanding work only. Cancel/death releases the lock without automatically covering or refunding effort. Existing specimen ageing continues while unattended. Repeated unchanged observations and the 30-round checkpoint create no reward. No inferred germination, tending benefit, harvested food or biomass is supplied. Relevant dated physical changes may use the single existing grounded-understanding rule. Records remain personal until actual communication.',
      handler: 'long.root-assessment',
      revision: REV,
      authored: false,
      practiceEvidence: 'root-assessment-qualified-practice',
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'The job survives disposable cursor interruption. Remaining inspection rounds, exact plot, exposure and paid effort are retained; explicit cancel/death settles the lock once.',
      },
    },
  ],
  handlers: { 'long.root-assessment': execute },
  processes: {},
  resources: [],
  satisfaction: [],
  events: [
    'root-inspected',
    'root-inspection-completed',
    'root-assessment-qualified-practice',
  ],
  visualComponents: ['plant'],
  migrate(w) {
    const r = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!r?.maintenance) throw new Error('Missing existing grounded feedback.');
    const trigger = { event: 'information-confirmed', interface: ID };
    r.alternativeTriggers = [...(r.alternativeTriggers ?? []), trigger];
    r.maintenance.alternativeTriggers = [
      ...(r.maintenance.alternativeTriggers ?? []),
      trigger,
    ];
    return w;
  },
  afterEnvironment(w) {
    for (const o of w.objects.filter(
      (o) =>
        o.revision === 'root-planting-trial@1' &&
        typeof o.data.plantedAt === 'number',
    )) {
      // Burial hides current specimen condition. Administrative and paid work metadata are not growth evidence.
      o.data.stage = 'planted-unverified';
      if (o.data.exposed !== true) delete o.data.remainingRootUnits;
      o.visual.state = o.data.exposed === true ? 'exposed' : 'covered';
    }
    for (const j of collectiveJobs(w, ID).filter((j) =>
      ['active', 'paused'].includes(j.status),
    )) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (a) {
        if (j.lastPaid < w.tick) j.status = 'paused';
        sync(a, j);
      }
    }
  },
  onDeath(w, a) {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
    ))
      release(w, a, j);
  },
};
