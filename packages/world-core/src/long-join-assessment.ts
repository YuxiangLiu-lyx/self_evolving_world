import type {
  V7ActionContext,
  V7Package,
  V7Spatial,
  V7Stack,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Json, v7Number, v7String } from './continuous-data.js';
import { forestResolveReference } from './forest-references.js';
import { rootPlacement } from './collective-tray-placement.js';
import { v7Distance, v7Visible } from './continuous-geometry.js';
import { collectiveJobs, workCreate, workResult } from './collective-work.js';
const ID = 'recoverable-vine-joining-assessment',
  VINE = 'item-66-lin-388';
const missing = [
  'source-bound branch unit segmentation, centerlines and contact geometry',
  'source-bound continuous vine segment length, diameter, endpoints and bend compatibility',
  'a represented way to select 0.2 vine without silently cutting a continuous segment',
  'bounded wrap/contact/tension parameters and an actual separation mechanism',
];
function owned(
  c: V7ActionContext,
  key: string,
  resource: string,
  quantity: number,
): V7Stack {
  const id = forestResolveReference(
      c.world,
      c.actor,
      v7String(c.action.args[key], key),
      'owned',
      quantity,
    ),
    stack = c.world.stacks.find((s) => s.id === id);
  if (!stack || stack.resource !== resource)
    throw new Error(
      'The exact owned material and sufficient quantity are required.',
    );
  return stack;
}
function execute(c: V7ActionContext) {
  if (c.action.args.mode === 'inspect') {
    const trial = collectiveJobs(c.world, ID).find(
      (j) =>
        j.id === c.action.args.trialId &&
        j.owner === c.actor.id &&
        j.status === 'completed',
    );
    if (
      !trial ||
      v7Distance(c.actor.position, trial) > c.actor.radius + 0.65 ||
      !v7Visible(c.world, c.actor.position, trial)
    )
      throw new Error(
        'Reach the exact personal recorded assessment location before inspection.',
      );
    v7Spend(c.actor, 0.2);
    c.emit(
      'join-assessment-inspected',
      'The record describes unresolved geometry, not a placed or wrapped assembly.',
      {
        paidEnergy: 0.2,
        stage: trial.stage ?? null,
        physicalComponents: 0,
        forceApplied: false,
        qualified: false,
      },
      trial.id,
    );
    return { complete: true, writes: [] };
  }
  if (c.action.args.mode !== 'begin' || c.actor.id !== 'lin')
    throw new Error(
      'This reviewed assessment requires Lin and begin or a personal marker inspection.',
    );
  const vine = owned(c, 'vineStackId', 'vine', 0.2),
    a = owned(c, 'branchStackIdA', 'branch', 1),
    b = owned(c, 'branchStackIdB', 'branch', 1);
  if (vine.id !== VINE)
    throw new Error(
      'This source-bound precursor requires the nominated surviving vine stack.',
    );
  if (a.id === b.id && a.quantity < 2)
    throw new Error(
      'Two branch units are required even when one stack is nominated twice.',
    );
  const footprint: V7Spatial = {
    x: v7Number(c.action.args.x, 'x'),
    y: v7Number(c.action.args.y, 'y'),
    angle: 0,
    shape: { kind: 'circle', radius: 0.2 },
    solid: false,
    reserved: true,
    interaction: 0.65,
    entrances: [],
  };
  const site = rootPlacement(c.world, c.actor, footprint, 0.2);
  if (
    site.error ||
    v7Distance(c.actor.position, footprint) > 0.65 ||
    !v7Visible(c.world, c.actor.position, footprint)
  )
    throw new Error(
      site.error ??
        'Reach the visible clear footprint within 0.65 before examining materials.',
    );
  if (c.actor.vitals.energy < 0.5)
    throw new Error('The examination requires 0.5 energy.');
  const job = workCreate(c, 'geometry-assessment', 1);
  job.x = footprint.x;
  job.y = footprint.y;
  // Reserve identity, not a fabricated physical cut or piece. The atomic assessment
  // releases these original stacks unchanged when geometry cannot be established.
  const stacks = [...new Map([vine, a, b].map((s) => [s.id, s])).values()];
  job.escrow = stacks.map((s) => s.id);
  job.sources = [
    { itemId: vine.id, requestedQuantity: 0.2 },
    { itemId: a.id, requestedQuantity: a.id === b.id ? 2 : 1 },
    ...(a.id === b.id ? [] : [{ itemId: b.id, requestedQuantity: 1 }]),
  ];
  for (const stack of stacks) stack.reservedFor = job.id;
  v7Spend(c.actor, 0.5);
  job.paidEnergy = 0.5;
  job.completedWork = 1;
  job.remainingWork = 0;
  job.lastPaid = c.world.tick;
  for (const stack of stacks) delete stack.reservedFor;
  job.status = 'completed';
  job.escrow = [];
  job.stage = 'geometry-unresolved';
  job.missingMechanisms = [...missing];
  const trialId = job.id;
  const report = {
    actor: c.actor.id,
    tick: c.world.tick,
    processId: job.id,
    trialId,
    paidEnergy: 0.5,
    paidRounds: 1,
    remainingWork: 0,
    allocations: job.sources,
    sourceSnapshots: v7Json(
      stacks.map((s) => ({
        id: s.id,
        resource: s.resource,
        quantity: s.quantity,
        origin: s.origin,
        processing: s.processing ?? null,
      })),
    ),
    materialMoved: 0,
    materialConsumed: 0,
    reservationsReleased: true,
    physicalComponents: 0,
    stage: 'geometry-unresolved',
    missingMechanisms: [...missing],
    interpretation:
      'Quantity and the earlier press response do not establish physical piece geometry or joining strength. No wrap, force, cutting or recovery was performed. Further world development must supply actual geometry and contact mechanics before those operations can be exposed.',
    qualified: false,
  };
  // Full item identities and findings stay private. The rendering annotation has no inventory data or collision footprint.
  c.emit(
    'join-geometry-assessed',
    'Paid examination ended with unresolved piece geometry; original materials remain available and no joint was formed.',
    {
      processId: job.id,
      trialId,
      x: job.x,
      y: job.y,
      paidEnergy: 0.5,
      physicalComponents: 0,
      materialMoved: 0,
      stage: 'geometry-unresolved',
      qualified: false,
    },
    trialId,
  );
  c.actor.memory.knowledge ??= {};
  const key = 'join-assessment:' + trialId;
  c.actor.memory.knowledge[key] = {
    key,
    subject: trialId,
    property: 'dated prerequisite assessment, not joint performance',
    value: v7Json(report),
    method: 'paid physical material and interface assessment',
    condition: 'source-bound current state; no strength inference',
    verified: false,
    tick: c.world.tick,
    evidence: c.world.events.at(-1)?.id ?? '',
  };
  return workResult(job);
}
export const LONG_JOIN_ASSESSMENT: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: ['foundation-open@1', 'foundation-forest@1'],
  description:
    'The approved geometry-assessment precursor only; persistent private record and an explicitly nonphysical planning marker, with unchanged conserved inputs.',
  reuse: {
    experiment: 'ex13; ex12 generic paid work',
    source:
      'forest-references.ts; collective-work.ts; collective-tray-placement.ts; foundation-open probe evidence',
    description:
      'Reuses exact owned transfers, atomic paid progress and dated personal findings. Historical geometry or joining skills are not activated. No wrap or separation law is claimed implemented.',
  },
  abilities: [
    {
      id: ID,
      name: 'Assess recoverable joining prerequisites',
      function:
        'Examine Lin owned item-66-lin-388 vine and two owned branch units for a bounded joining trial. This first release records unresolved geometry and releases unused reservations; it does not wrap or test force.',
      equivalence: 'joining:paid-source-geometry-assessment:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: ['begin', 'inspect'] },
          vineStackId: { type: 'string' },
          branchStackIdA: { type: 'string' },
          branchStackIdB: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          trialId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: {
        vineStackId: 'optional-owned',
        branchStackIdA: 'optional-owned',
        branchStackIdB: 'optional-owned',
      },
      prerequisites: [],
      learning: 2,
      learningEnergy: 0.2,
      costs:
        'Two personal study rounds at 0.2 energy each. Begin requires the nominated owned vine quantity at least0.2 and two actual branch units, a clear radius0.2 footprint within0.65, then one round/0.5 energy for examination. Inspection of the personal marker costs one round/0.2 energy. Invalid identity, access or energy does not charge.',
      effects:
        'Geometry-only precursor: quantity is not length or discrete pieces, and flexibility is not joint strength. Returns unused identity reservations atomically without splitting, consuming, moving or replacing materials. A dashed display annotation contains no world object or joined components; full source findings are private. Missing source geometry, segment selection and separation mechanics remain explicit development prerequisites. No wrap, separate, resume, recovery or maintenance operation is exposed; there is no placed material to recover. Cancel before execution creates no work or cost; after completion the record and spent effort persist, with all materials under ordinary death/ownership rules. No viability, joint usefulness or experience reward.',
      handler: 'long.join-assessment',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'join-assessment-qualified',
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'One atomic assessment; original identities released unchanged on geometry-unresolved. No ongoing assembly or force application.',
      },
    },
  ],
  handlers: { 'long.join-assessment': execute },
  processes: {},
  resources: [],
  satisfaction: [],
  visualComponents: [],
  events: [
    'join-geometry-assessed',
    'join-assessment-inspected',
    'join-assessment-qualified',
  ],
};
