import type {
  V7ActionContext,
  V7Actor,
  V7Object,
  V7Package,
  V7Spatial,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7Id, v7Json, v7Number, v7RoundNumber } from './continuous-data.js';
import {
  v7Distance,
  v7ShapesOverlap,
  v7Visible,
} from './continuous-geometry.js';
import { longPlantingSite } from './long-planting-site.js';
import { openConditions } from './open-physical.js';
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
import {
  SURFACE_ID as ID,
  SURFACE_REV as REV,
  representedSurface,
  surfaceBare,
} from './long-surface.js';
const radius = 0.2;
function sync(a: V7Actor, j: CollectiveWork) {
  if (['active', 'paused'].includes(j.status))
    a.extensionState['long:work:surface'] = v7Json(j);
  else {
    delete a.extensionState['long:work:surface'];
    a.extensionState['long:last-surface'] = v7Json(j);
  }
}
function close(w: V7World, a: V7Actor, j: CollectiveWork, reason: string) {
  workStop(w, a, j, reason, false);
  const o = w.objects.find((o) => o.id === j.target);
  if (o) {
    o.data.activeWork = null;
    o.data.outcome = 'cancelled';
  }
  sync(a, j);
}
function site(c: V7ActionContext, p: V7Spatial, o?: V7Object) {
  if (
    v7Distance(c.actor.position, p) > c.actor.radius + 0.65 ||
    !v7Visible(c.world, c.actor.position, p)
  )
    throw new Error(
      'Reach a visible footprint before starting or continuing manual surface work.',
    );
  const others = c.world.objects.filter((x) => x.id !== o?.id);
  const check = rootPlacement(
    { ...c.world, objects: others },
    c.actor,
    p,
    radius,
  );
  if (check.error)
    throw new Error(
      'The nominated footprint is inaccessible, occupied or reserved; no surface work started.',
    );
  if (
    others.some(
      (x) => v7ShapesOverlap(x.spatial, p) || v7Distance(x.spatial, p) < 0.5,
    )
  )
    throw new Error(
      'The footprint overlaps another actual object or represented surface.',
    );
  return openConditions(c.world, p);
}
function execute(c: V7ActionContext) {
  const mode = c.action.args.mode;
  let j = workFind(c),
    o = j ? c.world.objects.find((o) => o.id === j?.target) : undefined;
  if (mode === 'cancel') {
    if (!j) throw new Error('No unfinished personal surface work.');
    close(
      c.world,
      c.actor,
      j,
      'Surface work cancelled; committed cover and residues remain.',
    );
    return workResult(j);
  }
  let p: V7Spatial;
  if (j) {
    if (!o || !['active', 'paused'].includes(j.status))
      throw new Error('The exact surface work is already settled.');
    p = o.spatial;
    if (
      mode === 'start' &&
      (c.action.args.x !== p.x || c.action.args.y !== p.y)
    )
      throw new Error(
        'A substituted footprint cannot replace paid work; use the exact process.',
      );
  } else {
    if (mode !== 'start')
      throw new Error('No unfinished surface work to resume.');
    p = {
      x: v7Number(c.action.args.x, 'x'),
      y: v7Number(c.action.args.y, 'y'),
      angle: 0,
      shape: { kind: 'circle', radius },
      solid: false,
      reserved: false,
      interaction: 0.65,
      entrances: [],
    };
    o = representedSurface(c.world, p);
  }
  const soil = site(c, p, o);
  if (o?.data.activeWork && o.data.activeWork !== j?.id)
    throw new Error('Another actual worker holds the transient surface lock.');
  if (!j) {
    if (c.actor.vitals.energy < 0.5)
      throw new Error('A fresh feasibility examination requires 0.5 energy.');
    j = workCreate(c, 'prepare', 3);
    j.x = p.x;
    j.y = p.y;
    workPay(c, j, 0.5);
    if (!o && soil.ground === 'f') {
      o = {
        id: v7Id(c.world, 'surface'),
        kind: 'prepared-surface',
        name: 'Examined forest-floor footprint',
        spatial: p,
        visual: {
          component: 'surface-work',
          color: '#8f7959',
          accent: '#d6be87',
          label: 'Examined ground',
          state: 'examined',
        },
        data: {
          source: `terrain-footprint:${String(p.x)}:${String(p.y)}:0.2`,
          initialCoverMass: 0.04,
          coverMass: 0.04,
          residueMass: 0,
          residues: [],
          exposedArea: 0,
          activeWork: j.id,
          outcome: 'examined',
          coverModel:
            'Finite 0.04 mass units of loose surface litter for this 0.2-radius forest footprint; an authored extension model, not a botanical discovery. No food or inventory resource.',
          handCapacity: 0.02,
        },
        createdBy: c.actor.id,
        createdAt: c.world.tick,
        revision: REV,
      };
      c.world.objects.push(o);
    }
    if (o) {
      j.target = o.id;
      o.data.activeWork = j.id;
    }
    c.emit(
      'surface-examined',
      'A fresh paid surface feasibility examination completed; no clearing has occurred in this round.',
      {
        process: j.id,
        x: p.x,
        y: p.y,
        radius,
        ground: soil.ground,
        represented: !!o,
        qualified: false,
      },
      o?.id ?? null,
    );
    if (!o || Number(o.data.coverMass) <= 0) {
      j.status = 'completed';
      j.remainingWork = 0;
      if (o) o.data.activeWork = null;
      c.emit(
        'surface-preparation-ended',
        'No supported removable loose cover remains in this operation. Existing residue cannot be moved outside the footprint; bare-ground compatibility is not assumed.',
        {
          outcome: !longPlantingSite(c.world, c.actor, p).error
            ? 'verified-bare'
            : 'blocked',
          process: j.id,
          qualified: false,
        },
        o?.id ?? null,
      );
    }
    sync(c.actor, j);
    return workResult(j);
  }
  if (!o) throw new Error('Missing conserved surface representation.');
  if (!workPay(c, j, 1)) {
    sync(c.actor, j);
    return workResult(j);
  }
  const mass = Math.min(Number(o.data.coverMass), Number(o.data.handCapacity));
  o.data.coverMass = v7RoundNumber(Number(o.data.coverMass) - mass);
  o.data.residueMass = v7RoundNumber(Number(o.data.residueMass) + mass);
  const residues = Array.isArray(o.data.residues) ? o.data.residues : [];
  if (mass > 0)
    residues.push({
      source: o.data.source ?? null,
      mass,
      x: p.x + (j.completedWork === 2 ? 0.15 : -0.15),
      y: p.y,
      radius: 0.03,
      edible: false,
      harvestable: false,
    });
  o.data.residues = residues;
  o.data.exposedArea = v7RoundNumber(
    Math.PI *
      radius *
      radius *
      (1 - o.data.coverMass / Number(o.data.initialCoverMass)),
  );
  o.data.completedPaidRounds = j.completedWork;
  o.data.activeWork = j.id;
  o.data.outcome = 'partial';
  o.visual.state = 'partial';
  o.visual.label = 'Partial ground preparation';
  c.emit(
    'surface-cover-displaced',
    'Actual loose cover moved to conserved non-food residue piles inside the same footprint.',
    {
      process: j.id,
      displacedMass: mass,
      remainingCover: o.data.coverMass,
      residueMass: o.data.residueMass,
      affectedArea: o.data.exposedArea,
      paidEnergy: j.paidEnergy,
      remainingWork: j.remainingWork,
      qualified: false,
    },
    o.id,
  );
  if (j.remainingWork === 0 || surfaceBare(o)) {
    j.status = 'completed';
    j.remainingWork = 0;
    j.outputs = [o.id];
    o.data.activeWork = null;
    // Residue within the required footprint is not exposed bare soil, even when central loose cover was moved.
    const compatible = !longPlantingSite(c.world, c.actor, p).error;
    o.data.outcome = compatible ? 'verified-bare' : 'partial';
    c.emit(
      'surface-preparation-ended',
      'The bounded attempt ended. Remaining cover or residue still prevents the unchanged entire-footprint bare-ground requirement.',
      {
        process: j.id,
        outcome: o.data.outcome,
        rootCompatible: compatible,
        paidEnergy: j.paidEnergy,
        qualified: false,
      },
      o.id,
    );
  }
  sync(c.actor, j);
  return workResult(j);
}
export const LONG_SURFACE: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: ['soil-worksite-assessment@1'],
  description:
    'Finite modeled hand-displaceable forest litter and conserved in-footprint residues; a bounded real attempt, not guaranteed bare soil.',
  reuse: {
    experiment: 'ex13 site/planting; ex12 work infrastructure',
    source:
      'long-planting-site.ts; collective-work.ts; collective-tray-placement.ts',
    description:
      'Reuses actual reach, collision and paid work with immutable old predicates; new local surface representation is explicit and does not reinterpret sprite pixels as resource stock.',
  },
  abilities: [
    {
      id: ID,
      name: 'Prepare a small soil patch',
      function:
        'Examine one nominated radius-0.2 footprint, then attempt at most two rounds of manual loose-cover displacement, conserving debris inside the original boundary.',
      equivalence: 'local-cover:bounded-hand-displacement:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: ['start', 'resume', 'cancel'] },
          x: { type: 'number' },
          y: { type: 'number' },
          processId: { type: 'string' },
        }),
        required: ['mode'],
      },
      prerequisites: [],
      learning: 1,
      costs:
        'Fresh start: one round and 0.5 energy for feasibility. Up to two additional work rounds cost one energy each. Radius is fixed at 0.2; x/y bind the job and cannot be substituted. No tool, root, water, food or inventory material is given or consumed.',
      effects:
        'Supports explicitly modeled loose forest-floor cover only. Each supported footprint begins with finite 0.04 cover mass units, with hand capacity 0.02 per work round. All displaced matter remains non-food non-harvestable residue inside the boundary. Repeated attempts reuse actual remaining cover/residues, never reset quantities. Partial changes persist; cancel/death closes only the work lock, without restoration or refund. Entire-footprint root eligibility remains false while any cover or residue remains; exhausting work does not prove suitable soil. No unattended work, regrowth suppression, planting, food, moisture/fertility improvement or reward. Study and surface changes are separate.',
      handler: 'long.surface-preparation',
      revision: REV,
      authored: false,
      references: {},
      practiceEvidence: 'surface-qualified-practice',
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Exact personal process ID, footprint, paid rounds, original cover and residues persist. Resume pays outstanding rounds only. Final/blocked attempts close their transient lock.',
      },
    },
  ],
  handlers: { 'long.surface-preparation': execute },
  processes: {},
  resources: [],
  satisfaction: [],
  events: [
    'surface-examined',
    'surface-cover-displaced',
    'surface-preparation-ended',
    'surface-qualified-practice',
  ],
  visualComponents: ['surface-work'],
  afterEnvironment(w) {
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
      close(
        w,
        a,
        j,
        'Death ended surface work; actual cover and residue remain.',
      );
  },
};
