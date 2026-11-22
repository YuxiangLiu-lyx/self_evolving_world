import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7Package,
  V7Stack,
  V7World,
} from './continuous-types.js';
import {
  v7Clone,
  v7Id,
  v7Number,
  v7String,
  v7Signature,
} from './continuous-data.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Distance, v7Reach, v7Visible } from './continuous-geometry.js';
import { forestResolveReference } from './forest-references.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { forestEvent } from './forest-climate.js';
import { openRemember } from './open-foundation.js';
import { scratchPhysical, scratchVisible } from './open-hardness-physics.js';
import {
  collectiveJobs,
  workAllocations,
  workCreate,
  workFind,
  workReserve,
  workResult,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import { branchLayer, setBarkMaterial } from './collective-bark-material.js';
import type { BranchLayer } from './collective-bark-material.js';
interface BarkJob extends CollectiveWork {
  source: string;
  tool: string;
  layer: BranchLayer;
  quantity: number;
  input: string;
  bark: string;
  fines: string;
  removed: number;
  sourceMass: number;
}
const identity = (s: V7Stack) =>
  v7Signature({
    resource: s.resource,
    origin: s.origin,
    physical: s.physical ?? null,
    processing: s.processing ?? null,
    materialLayer: s.materialLayer ?? null,
  });
function inspectTarget(c: V7ActionContext) {
  const id = forestResolveReference(
    c.world,
    c.actor,
    v7String(c.action.args.targetId, 'targetId'),
    'visible',
  );
  const s = c.world.stacks.find((s) => s.id === id),
    o = c.world.objects.find((o) => o.id === id);
  if (s && (s.owner !== c.actor.id || s.reservedFor))
    throw new Error('Assess an actual owned unreserved material.');
  if (
    o &&
    (!v7Reach(c.actor, o.spatial) ||
      !v7Visible(c.world, c.actor.position, o.spatial))
  )
    throw new Error('Move within actual visible interaction reach.');
  if (!s && !o) throw new Error('The actual subject is unavailable.');
  v7Spend(c.actor, 0.2);
  const layer = s ? branchLayer(c.world, s) : null;
  const stone = !!s && ['stone', 'flint'].includes(s.resource);
  const contact = stone ? scratchVisible(c.world, s) : null;
  const usableEdge =
    !!contact &&
    contact.controlledContact &&
    !contact.fractured &&
    !contact.contaminated &&
    contact.edgeRadius <= 0.0002;
  if (s)
    c.actor.extensionState['bark:assessment:' + s.id] = {
      signature: identity(s),
      usableEdge,
      tick: c.world.tick,
    };
  c.emit(
    'bark-assessed',
    layer
      ? 'Finite outer-layer model inspected; actual separation remains untested.'
      : stone
        ? 'Inspected actual tool contact geometry; absolute hardness is not certified by naming.'
        : 'No represented removable trunk tissue; exposed stock can still be gathered normally.',
    {
      target: id,
      layer,
      contact,
      usableEdge,
      requiredHardness: 8,
      recoverableMass: layer && s ? layer.remaining * s.quantity : null,
      uncertainty:
        'Inspection alone earns no discovery feedback and supplies no material.',
    },
    id,
  );
  return { complete: true, writes: [] };
}
function start(c: V7ActionContext): BarkJob {
  const quantity = v7Number(c.action.args.quantity, 'quantity', 0.1);
  foodTenths(quantity);
  if (quantity > 8)
    throw new Error(
      'Select at most eight original branch units per operation.',
    );
  const inputs = workAllocations(c, [
    { itemId: c.action.args.targetId, quantity },
    { itemId: c.action.args.toolId, quantity: 1 },
  ]);
  const source = inputs[0]?.stack,
    tool = inputs[1]?.stack;
  if (!source || !tool)
    throw new Error('Actual owned branch and implement required.');
  const layer = branchLayer(c.world, source),
    inspection = c.actor.extensionState['bark:assessment:' + tool.id] as
      V7Data | undefined;
  const physical = scratchPhysical(c.world, tool);
  if (
    !['stone', 'flint'].includes(tool.resource) ||
    Number(physical.resistance) < 8 ||
    !inspection?.usableEdge ||
    inspection.signature !== identity(tool) ||
    physical.fractured ||
    physical.contaminated ||
    !physical.usable
  )
    throw new Error(
      'Assess an actual owned stone/flint with a usable contact edge; intrinsic hardness must be at least 8. No tool is supplied.',
    );
  if (!layer || layer.remaining <= 1e-10 || layer.work <= 0)
    throw new Error(
      'No finite removable layer remains on this actual branch material; standing trunks are ineligible.',
    );
  const j = workCreate(c, 'peel', layer.work * quantity) as BarkJob;
  j.source = source.id;
  j.tool = tool.id;
  j.layer = layer;
  j.quantity = quantity;
  j.sourceMass =
    (source.physical?.unitMass ??
      c.world.resources.find((r) => r.id === source.resource)?.mass ??
      0) * quantity;
  j.removed = 0;
  workReserve(c, j, inputs);
  j.input = j.escrow[0] ?? '';
  const toolEscrow = j.escrow[1];
  if (toolEscrow)
    c.world.state['hardness:intrinsic:' + toolEscrow] = v7Clone(physical);
  j.bark = '';
  j.fines = '';
  c.emit(
    'bark-peeling-started',
    'Reserved actual branch and reusable tool; no bark is supplied before paid separation.',
    { ...j },
    j.id,
  );
  return j;
}
function output(
  c: V7ActionContext,
  j: BarkJob,
  field: 'bark' | 'fines',
  resource: string,
): V7Stack {
  let s = c.world.stacks.find((s) => s.id === j[field]);
  if (s) return s;
  const input = c.world.stacks.find((s) => s.id === j.input);
  if (!input) throw new Error('Missing conserved input.');
  s = {
    id: v7Id(c.world, 'item'),
    resource,
    quantity: 0,
    quantityTenths: 0,
    owner: c.actor.id,
    reservedFor: j.id,
    position: { x: j.x, y: j.y },
    origin: input.origin,
    ...(input.harvestedAt === undefined
      ? {}
      : { harvestedAt: input.harvestedAt }),
    ...(input.decay === undefined ? {} : { decay: input.decay }),
    processing: {
      source: j.source,
      sourceOrigin: input.origin,
      sourceHistory: v7Clone(input.processing ?? {}),
      work: j.id,
      separated: true,
    },
  };
  j[field] = s.id;
  j.escrow.push(s.id);
  j.outputs.push(s.id);
  c.world.stacks.push(s);
  return s;
}
function release(
  w: V7World,
  a: V7Actor,
  j: BarkJob,
  reason: string,
  completed = false,
) {
  if (completed) {
    for (const id of j.escrow) {
      const s = w.stacks.find((s) => s.id === id && s.reservedFor === j.id);
      if (!s) continue;
      delete s.reservedFor;
      s.owner = a.id;
      s.position = { ...a.position };
    }
    j.status = 'completed';
  } else {
    workStop(w, a, j, reason, true);
    for (const s of w.stacks.filter((s) => j.escrow.includes(s.id))) {
      s.processing ??= {};
      s.processing.collectiveWorkReleased = j.id;
    }
  }
  forestEvent(
    w,
    completed ? 'bark-peeling-completed' : 'bark-peeling-stopped',
    reason,
    { x: j.x, y: j.y },
    a.id,
    { ...j },
    j.id,
  );
}
function advance(c: V7ActionContext, j: BarkJob) {
  if (!['active', 'paused'].includes(j.status))
    throw new Error('This operation is already settled.');
  const source = c.world.stacks.find((s) => s.id === j.input),
    tool = c.world.stacks.find((s) => s.id === j.escrow[1]);
  const effort = Math.min(1, j.remainingWork);
  if (
    !source ||
    !tool ||
    [source, tool].some(
      (s) => s.owner !== c.actor.id || s.reservedFor !== j.id,
    ) ||
    v7Distance(c.actor.position, j) > 0.65 ||
    c.actor.vitals.energy < effort
  ) {
    j.status = 'paused';
    j.reason =
      'Actual access, reach or energy unavailable; paid progress remains.';
    return {
      ...workResult(j),
      remaining: Math.ceil(Math.max(0, j.remainingWork - 1e-9)),
    };
  }
  if (j.lastPaid === c.world.tick)
    throw new Error('This round was already paid.');
  v7Spend(c.actor, effort);
  j.lastPaid = c.world.tick;
  j.paidEnergy += effort;
  j.completedWork += effort;
  j.remainingWork = Math.max(0, j.initialWork - j.completedWork);
  j.status = 'active';
  delete j.reason;
  const fraction = j.completedWork / j.initialWork;
  j.removed = j.layer.remaining * j.quantity * fraction;
  const b = output(c, j, 'bark', 'bark'),
    f = output(c, j, 'fines', 'bark-fines');
  // Public quantities use exact tenths. Residual sub-unit mass remains real fines, never rounded into useful bark.
  const units = Math.floor((j.removed + 1e-10) / 0.03);
  foodSetQuantity(b, units);
  setBarkMaterial(c.world, b, 0.3, j.layer);
  const fineMass = Math.max(0, j.removed - units * 0.03);
  foodSetQuantity(f, fineMass > 1e-10 ? 10 : 0);
  setBarkMaterial(c.world, f, fineMass, j.layer);
  source.resource = 'peeled-branch';
  source.processing ??= {};
  source.processing.branchLayer = {
    ...j.layer,
    remaining: j.layer.remaining * (1 - fraction),
    work: j.layer.work * (1 - fraction),
  };
  source.processing.source = j.source;
  source.processing.work = j.id;
  setBarkMaterial(
    c.world,
    source,
    (j.sourceMass - j.removed) / j.quantity,
    j.layer,
  );
  c.emit(
    'bark-peeling-progress',
    'Paid separation conserves bark, fines, residual wood, fuel and prior material history.',
    {
      ...j,
      barkQuantity: b.quantity,
      finesMass: fineMass,
      residualMass: j.sourceMass - j.removed,
    },
    j.id,
  );
  openRemember(c, {
    key: 'branch:separable-outer-layer:paid-peeling-v1',
    subject: 'branch',
    property: 'usable outer material separated by actual peeling',
    value: { separable: true, maximumMassFraction: 0.1 },
    method: 'paid physical separation using inspected contact',
    condition:
      'only this represented material model; not a standing-trunk certificate',
    verified: true,
  });
  if (j.remainingWork <= 1e-9)
    release(
      c.world,
      c.actor,
      j,
      'Completed all paid separation. Actual outputs and reusable tool are available; no capacity limit is invented.',
      true,
    );
  return {
    ...workResult(j),
    remaining: Math.ceil(Math.max(0, j.remainingWork - 1e-9)),
  };
}
function execute(c: V7ActionContext) {
  const mode = v7String(c.action.args.action, 'action');
  if (mode === 'assess') return inspectTarget(c);
  let j = workFind(c) as BarkJob | undefined;
  if (
    j &&
    mode === 'peel' &&
    c.operation?.first !== false &&
    (c.action.args.targetId || c.action.args.toolId)
  )
    throw new Error(
      'Existing personal work retains its exact inputs. Resume with processId and omit new material references, or cancel first.',
    );
  if (mode === 'peel' && !j) j = start(c);
  if (!j) throw new Error('No exact personal bark operation.');
  if (mode === 'inspect') {
    c.emit(
      'bark-assessed',
      'Retained actual work, not a new trial.',
      { ...j },
      j.id,
    );
    return { complete: true, writes: [] };
  }
  if (mode === 'cancel') {
    release(
      c.world,
      c.actor,
      j,
      'Cancelled; actual separated material, partly peeled input and tool remain at the work location.',
    );
    return {
      ...workResult(j),
      remaining: Math.ceil(Math.max(0, j.remainingWork - 1e-9)),
    };
  }
  return advance(c, j);
}
export const COLLECTIVE_BARK: V7Package = {
  id: 'bark-extraction',
  version: 1,
  scope: 'collective-ex12',
  dependencies: ['foundation-open@1'],
  description:
    'Reviewed finite branch-layer precursor; no invented trunk reserve or automatic apparatus.',
  reuse: {
    experiment: 'ex11 generic escrow and ex10 contact geometry implementation',
    source: 'collective-work.ts; open-hardness-physics.ts',
    description:
      'Reuses exact reservation and actual contact inspection functions, not historical bark/hardness abilities, source pools or personal knowledge. New branch-layer partition is explicitly modeled only after this ex12 review.',
  },
  abilities: [
    {
      id: 'bark-extraction',
      name: 'Assess and peel actual branch bark',
      function:
        'Assess actual materials and separate a finite branch outer layer using a personally inspected reusable stone or flint contact.',
      equivalence: 'branch:finite-outer-layer:paid-peeling:1',
      parameters: {
        ...v7ObjectSchema({
          action: {
            type: 'string',
            enum: ['assess', 'peel', 'inspect', 'cancel'],
          },
          targetId: { type: 'string' },
          toolId: { type: 'string' },
          quantity: { type: 'number', minimum: 0.1, maximum: 8 },
          processId: { type: 'string' },
        }),
        required: ['action'],
      },
      prerequisites: [],
      learning: 2,
      costs:
        'Assess: one round and 0.2 energy. Peel: two active work-round equivalents and two energy per original branch unit, proportionally less for fractional or partly peeled inputs; one final partial simulation round pays only remaining effort. Reserve actual source and one reusable inspected hard stone/flint. No hard inventory capacity exists; actual load costs continue.',
      effects:
        'Standing trunks without represented tissue remain ineligible. Unspecified intact branch partitions at most 10% of existing mass into outer bark. Exact-tenth bark units round down; sub-unit mass stays bark-fines. Peeled core cannot satisfy intact-branch recipes. Existing composition, nutrients, toxins, fuel and age persist. Cancellation/death releases actual partial materials once. Assessment alone has no reward; a new verified paid separation can use existing grounded understanding.',
      handler: 'collective.bark',
      revision: 'bark-extraction@1',
      authored: false,
      practiceEvidence: 'information-confirmed',
      references: {},
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Exact personal processId, paid and remaining effort, reserved tool, actual separated mass and residual layer. Reissue peel with processId to resume. Other actions pause; cancel/death terminates without refund.',
      },
      dependencies: {
        abilities: [],
        resources: ['branch', 'stone', 'bark'],
        knowledge: [],
      },
    },
  ],
  handlers: { 'collective.bark': execute },
  processes: {},
  resources: ['peeled-branch', 'bark-fines'].map((id) => ({
    id,
    name:
      id === 'peeled-branch'
        ? 'Partly or fully peeled branch'
        : 'Separated bark fines',
    mass: 0,
    nutrition: 0,
    toxicity: 0,
    color: '#b29a73',
    properties: {
      hardness: id === 'peeled-branch' ? 3 : 1,
      flexibility: id === 'peeled-branch' ? 2 : 6,
      fuel: 0,
      decay: 0,
      minGrowth: 0,
      optimalGrowth: 20,
      moisture: 0,
    },
  })),
  satisfaction: [],
  visualComponents: [],
  events: [
    'bark-assessed',
    'bark-peeling-started',
    'bark-peeling-progress',
    'bark-peeling-completed',
    'bark-peeling-stopped',
    'information-confirmed',
  ],
  beforeAction(w, a, action) {
    if (action.interface !== 'bark-extraction')
      for (const j of collectiveJobs(w, 'bark-extraction').filter(
        (j) => j.owner === a.id && j.status === 'active',
      ))
        j.status = 'paused';
  },
  onDeath(w, a) {
    for (const j of collectiveJobs(w, 'bark-extraction').filter(
      (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
    ))
      release(
        w,
        a,
        j as BarkJob,
        'Performer died; actual partial material and reusable tool remain.',
      );
  },
};
