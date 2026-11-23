import type { V7ActionContext, V7Package } from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Json, v7String } from './continuous-data.js';
import {
  collectiveJobs,
  workAllocations,
  workFind,
} from './collective-work.js';
import {
  preparedSite,
  PREPARED_ID as ID,
  PREPARED_SURFACE,
  MOSS_PREPARED_ID,
  MOSS_PREPARED_SURFACE,
} from './long-prepared-site.js';
import {
  executeRootPlanting,
  stopRootPlanting,
  updateRootPlanting,
} from './long-planting.js';
function execute(c: V7ActionContext) {
  const moss = c.action.interface === MOSS_PREPARED_ID,
    surfaceId = moss ? MOSS_PREPARED_SURFACE : PREPARED_SURFACE;
  const mode = c.action.args.mode,
    job = workFind(c);
  if (mode === 'resume' || mode === 'cancel') {
    if (!job || c.action.args.processId !== job.id)
      throw new Error(
        'Resume or cancel requires the exact personal processId.',
      );
    return executeRootPlanting(c);
  }
  if (mode !== 'plant' && mode !== 'examine')
    throw new Error('Unsupported adapter mode.');
  if (c.action.args.preparedSurfaceId !== surfaceId)
    throw new Error('Supply the exact nominated preparedSurfaceId.');
  if (job) {
    if (
      mode !== 'plant' ||
      job.preparedSurfaceId !== c.action.args.preparedSurfaceId
    )
      throw new Error('Resume or cancel the current exact paid process first.');
    return executeRootPlanting({
      ...c,
      action: { ...c.action, args: { ...c.action.args, x: job.x, y: job.y } },
    });
  }
  if (
    collectiveJobs(c.world, 'root-planting-trial').some(
      (j) => j.owner === c.actor.id && ['active', 'paused'].includes(j.status),
    )
  )
    throw new Error(
      'Resolve the existing personal root-placement work before starting another.',
    );
  if (mode === 'plant' && !c.actor.mastered.includes('root-planting-trial'))
    throw new Error(
      'Placement additionally requires individual root-planting-trial study.',
    );
  if (moss && mode === 'plant') {
    const input = workAllocations(c, [
      { itemId: c.action.args.inputStackId, quantity: 1 },
    ])[0]?.stack;
    if (
      !input ||
      input.resource !== 'root' ||
      (input.decay ?? 0) >=
        (c.world.resources.find((r) => r.id === 'root')?.properties?.decay ?? 0)
    )
      throw new Error(
        'Supply one actually owned unspoiled root unit before a planting examination; no stock is granted.',
      );
  }
  const site = preparedSite(c, surfaceId);
  if (c.actor.vitals.energy < 0.5)
    throw new Error('An examination requires0.5 energy.');
  let materialError: string | null = null;
  if (mode === 'plant' && !site.error) {
    try {
      const input = workAllocations(c, [
        { itemId: c.action.args.inputStackId, quantity: 1 },
      ])[0]?.stack;
      if (
        !input ||
        (!moss && input.id !== 'item-3-lin-12') ||
        input.resource !== 'root' ||
        (input.decay ?? 0) >=
          (c.world.resources.find((r) => r.id === input.resource)?.properties
            ?.decay ?? 0)
      )
        materialError =
          'This source-bound version requires one actually unspoiled owned unit of the nominated root stack; no substitution or grant.';
    } catch (e) {
      materialError =
        e instanceof Error ? e.message : 'Material could not be validated.';
    }
  }
  const report = {
    tick: c.world.tick,
    actor: c.actor.id,
    surfaceId: site.surface.id,
    x: site.surface.spatial.x,
    y: site.surface.spatial.y,
    radius: 0.2,
    paidEnergy: 0.5,
    compatibility: site.error
      ? 'incompatible'
      : 'currently clear for the bounded placement precursor',
    reason: site.error,
    materialError,
    scope:
      'Actual extents, cover, residue, support and current access only; no fertility or viability inference.',
    qualified: false,
  };
  c.emit(
    'prepared-placement-examined',
    'Completed a paid physical compatibility examination; no reward or planted specimen is inferred.',
    report,
    site.surface.id,
  );
  c.actor.memory.knowledge ??= {};
  c.actor.memory.knowledge['prepared-placement:' + site.surface.id] = {
    key: 'prepared-placement:' + site.surface.id,
    subject: site.surface.id,
    property: 'dated placement compatibility',
    value: v7Json(report),
    method: 'local physical examination with source-bound material geometry',
    condition: 'current conditions only',
    verified: false,
    tick: c.world.tick,
    evidence: c.world.events.at(-1)?.id ?? '',
  };
  if (mode === 'examine' || site.error || materialError) {
    v7Spend(c.actor, 0.5);
    return { complete: true, writes: [] };
  }
  return executeRootPlanting(
    {
      ...c,
      action: {
        ...c.action,
        args: {
          ...c.action.args,
          inputStackId: moss
            ? v7String(c.action.args.inputStackId, 'inputStackId')
            : 'item-3-lin-12',
          x: site.surface.spatial.x,
          y: site.surface.spatial.y,
        },
      },
    },
    site.surface.id,
  );
}
export const LONG_PREPARED_PLANTING: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: [
    'root-planting-trial@1',
    'soil-worksite-assessment@1',
    'small-soil-patch-preparation@1',
    'bounded-surface-residue-transfer@1',
  ],
  description:
    'Source-bound compatibility adapter reusing actual planting escrow and labor, with physical constituent geometry rather than center-only annotation exclusion.',
  reuse: {
    experiment: 'ex13',
    source:
      'long-planting.ts; long-site-assessment.ts; collective-work.ts; collective-tray-placement.ts',
    description:
      'Reuses the existing placement operation, learning requirements, ageing, private dated evidence and paid conserved work. A new adapter adds no biological process or reward.',
  },
  abilities: [
    {
      id: ID,
      name: 'Prepared-surface root placement',
      function:
        'Examine a nominated prepared surface and, only if feasible, place one real root through the existing paid trial operation.',
      equivalence: 'root:prepared-surface-compatibility:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['examine', 'plant', 'resume', 'cancel'],
          },
          preparedSurfaceId: { type: 'string' },
          inputStackId: { type: 'string' },
          processId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: {
        preparedSurfaceId: 'optional-exact-visible',
        inputStackId: 'optional-owned',
      },
      prerequisites: [],
      learning: 1,
      learningEnergy: 0.2,
      costs:
        'Study1 round/0.2 energy. Examine(preparedSurfaceId) costs1 round/0.5 energy. Plant additionally requires personal root-planting-trial mastery; its first round examines and reserves one unspoiled root, followed by two1-energy work rounds. This version is bound to Lin, surface-21-lin-113 and owned root item-3-lin-12. Valid visible access within0.65 plus body radius is required. Resume/cancel need exact processId. No other inputs supplied.',
      effects:
        'Checks real cover, residue extents, people, obstacles, reservations, ground matter and access. The clear non-solid annotation alone is not matter. Live conflicts pause before further payment. Exact root escrow and paid progress persist; cancel/death releases surviving unplanted root on the actual worksite ground once, never remote inventory. Successful commitment links the existing surface to one actual trial plot; completed placement cannot be cancelled into food. Existing ageing continues. No propagation, growth, harvest, fertility, free soil removal, food output, maintenance, reward or viability guarantee. Private dated evidence only; the30-round observation remains inconclusive.',
      handler: 'long.prepared-root-placement',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'prepared-placement-qualified-practice',
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'One examination plus two paid work rounds; exact surface, root provenance, reservation, job ID, remaining work and prior payments persist.',
      },
    },
  ],
  handlers: { 'long.prepared-root-placement': execute },
  processes: {},
  resources: [],
  satisfaction: [],
  visualComponents: ['plant', 'surface-work'],
  events: [
    'prepared-placement-examined',
    'prepared-placement-paused',
    'prepared-placement-qualified-practice',
  ],
  afterEnvironment: (w) => {
    updateRootPlanting(w, ID);
  },
  onDeath(w, a) {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
    ))
      stopRootPlanting(w, a, j, true);
  },
};

const mossTemplate = LONG_PREPARED_PLANTING.abilities[0];
if (!mossTemplate) throw new Error('Missing prepared placement template');
export const LONG_MOSS_PREPARED_PLANTING: V7Package = {
  ...LONG_PREPARED_PLANTING,
  id: MOSS_PREPARED_ID,
  dependencies: [
    ...LONG_PREPARED_PLANTING.dependencies,
    'prepared-surface-root-placement@1',
    'moss-surface-residue-transfer@1',
    'moss-prepared-surface-diagnostic@1',
  ],
  description:
    'Moss applicability bridge reusing the actual paid root operation, with complete surface/deposit provenance and an explicit current exposed-soil support case.',
  reuse: {
    experiment: 'ex13',
    source:
      'long-prepared-planting.ts; long-planting.ts; long-moss-representation.ts; collective-tray-placement.ts',
    description:
      'Same physical placement and conservation function as Lin, with a reviewed source binding and a live owned fresh root rather than an invented input. Added applicability and substrate evidence are not a new biological invention.',
  },
  abilities: [
    {
      ...mossTemplate,
      id: MOSS_PREPARED_ID,
      name: 'Moss prepared root placement',
      function:
        'Examine and, only when currently supported, place one owned fresh root on Moss surface-38-moss-234 using conserved paid work.',
      equivalence: 'root:prepared-surface-compatibility:1:moss-source',
      handler: 'long.moss-prepared-root-placement',
      revision: MOSS_PREPARED_ID + '@1',
      costs:
        'Study one round/0.2 energy. Examine one round/0.5 energy with no root. Plant additionally requires root-planting-trial mastery and one exact owned unspoiled root; first round examines/reserves, then two paid work rounds at1 energy each. Missing/invalid root fails before charge. Source bound to Moss and surface-38-moss-234; exact processId for resume/cancel.',
      effects:
        'Require complete conserved surface/deposit provenance, actual completed exposure of the original forest floor and nine current dry soil/forest substrate samples, in addition to live physical clearance and reach. This minimal mechanical placement case is not fertility, hardness or viability certification; unsupported substrate remains unknown. Preserve deposit matter. Exact root escrow and paid work persist; conflicts pause before further cost. Cancel/death releases surviving unplanted root on the actual ground once. Completed placement retains one planted-unverified specimen and ages normally. No growth, harvest, reward, free material, maintenance or automatic mastery.',
    },
  ],
  handlers: { 'long.moss-prepared-root-placement': execute },
  afterEnvironment(w) {
    updateRootPlanting(w, MOSS_PREPARED_ID);
  },
  onDeath(w, a) {
    for (const j of collectiveJobs(w, MOSS_PREPARED_ID).filter(
      (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
    ))
      stopRootPlanting(w, a, j, true);
  },
};
