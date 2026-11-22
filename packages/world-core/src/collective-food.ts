import type {
  V7ActionContext,
  V7Package,
  V7Resource,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7Id, v7Json, v7String } from './continuous-data.js';
import { foodUnitMass } from './forest-food-accounting.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
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
function execute(c: V7ActionContext) {
  const mode = v7String(c.action.args.operation, 'operation');
  let j = workFind(c);
  if (mode === 'start' && !j) {
    const inputs = workAllocations(c, c.action.args.inputs),
      units = inputs.reduce((n, p) => n + p.quantity, 0);
    if (units < 1 || units > 4)
      throw new Error('Prepare 1–4 original food units.');
    for (const { stack } of inputs) {
      const r = collectiveFoodProfile(c.world, stack);
      if (
        !r ||
        !['root', 'berry'].includes(r.id) ||
        r.nutrition <= 0 ||
        (stack.decay ?? 0) >= (r.properties?.decay ?? 0)
      )
        throw new Error('Require actual unspoiled edible roots or berries.');
    }
    const mass = inputs.reduce(
      (n, p) => n + foodUnitMass(c.world, p.stack) * p.quantity,
      0,
    );
    j = workCreate(c, 'prepare', Math.max(1, Math.ceil((mass - 1e-9) / 0.4)));
    workReserve(c, j, inputs);
  } else if (mode === 'start' && c.operation?.first !== false)
    throw new Error('Work already exists; continue its exact processId.');
  if (!j) throw new Error('No existing personal preparation process.');
  if (mode === 'inspect') {
    c.emit(
      'process-inspected',
      'Actual food work, escrow and expiry.',
      {
        ...j,
        escrowState: v7Json(
          c.world.stacks.filter((s) => j.escrow.includes(s.id)),
        ),
      },
      j.id,
    );
    return { complete: true, writes: [] };
  }
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  if (mode === 'cancel') {
    workStop(
      c.world,
      c.actor,
      j,
      'Explicit cancellation; paid work is not refunded.',
      false,
    );
    return { complete: true, writes: [j.id] };
  }
  const stacks = c.world.stacks.filter(
    (s) => j.escrow.includes(s.id) && s.reservedFor === j.id,
  );
  if (stacks.length !== j.escrow.length) {
    workStop(
      c.world,
      c.actor,
      j,
      'An escrow ingredient spoiled; surviving inputs returned.',
      false,
    );
    return { complete: true, writes: [j.id] };
  }
  if (!workPay(c, j, 1) || j.remainingWork > 0) return workResult(j);
  const units = stacks.reduce((n, s) => n + s.quantity, 0),
    portions = Math.round(units * 10);
  let mass = 0,
    nutrition = 0,
    toxicity = 0,
    quality = 0,
    lifetime = Infinity;
  const composition: Record<string, number> = {};
  for (const s of stacks) {
    const r = collectiveFoodProfile(c.world, s);
    if (!r?.properties) throw new Error('Missing real edible composition.');
    mass += foodUnitMass(c.world, s) * s.quantity;
    nutrition += r.nutrition * s.quantity;
    toxicity += r.toxicity * s.quantity;
    const remaining = r.properties.decay - (s.decay ?? 0);
    lifetime = Math.min(lifetime, remaining);
    quality +=
      (((r.food?.quality ?? 0.8) * remaining) / r.properties.decay) *
      r.nutrition *
      s.quantity;
    for (const i of r.food?.ingredients ?? [{ resource: r.id, share: 1 }])
      composition[i.resource] =
        (composition[i.resource] ?? 0) + i.share * r.nutrition * s.quantity;
  }
  const edible: V7Resource = {
    id: 'hand-mashed-food',
    name: 'Hand-mashed food portions',
    mass: mass / portions,
    nutrition: nutrition / portions,
    toxicity: toxicity / portions,
    color: '#ba9764',
    food: {
      ingredients: Object.entries(composition).map(([resource, n]) => ({
        resource,
        share: n / nutrition,
      })),
      method: 'hand-mashed',
      quality: quality / nutrition,
    },
    properties: {
      hardness: 0,
      flexibility: 0,
      fuel: 0,
      decay: lifetime,
      minGrowth: 0,
      optimalGrowth: 0,
      moisture: 0,
    },
  };
  const id = v7Id(c.world, 'item');
  c.world.stacks.push({
    id,
    resource: edible.id,
    quantity: portions,
    quantityTenths: portions * 10,
    owner: c.actor.id,
    position: { ...c.actor.position },
    origin: j.id,
    harvestedAt: Math.min(...stacks.map((s) => s.harvestedAt ?? c.world.tick)),
    decay: 0,
    ...(stacks.every((s) => !!s.physical)
      ? {
          physical: {
            unitMass: edible.mass,
            unitWater:
              stacks.reduce(
                (n, s) => n + (s.physical?.unitWater ?? 0) * s.quantity,
                0,
              ) / portions,
            unitSolids:
              stacks.reduce(
                (n, s) => n + (s.physical?.unitSolids ?? 0) * s.quantity,
                0,
              ) / portions,
          },
        }
      : {}),
    processing: {
      edible: v7Json(edible),
      waterComposition: stacks.every((s) => !!s.physical)
        ? 'Retained represented water/solid totals.'
        : 'Unrepresented water fraction; no drying or water removal occurs.',
      inputs: v7Json(stacks),
      portionOriginalUnits: 0.1,
      remainingDecayAtPreparation: lifetime,
      preparedAt: c.world.tick,
    },
  });
  for (const s of stacks) s.quantity = 0;
  j.status = 'completed';
  j.outputs = [id];
  j.composition = v7Json(edible);
  j.mass = mass;
  c.emit(
    'process-completed',
    'Actual ingredients transformed once; no added nutrients or preservation.',
    { ...j },
    id,
  );
  return workResult(j);
}
export const COLLECTIVE_FOOD: V7Package = {
  id: 'prepare-food',
  version: 1,
  scope: 'collective-ex11',
  description: 'Reviewed cold hand-mashing of actual owned food.',
  dependencies: ['foundation-open@1'],
  reuse: {
    experiment: 'Shared ex9/ex10 engine; independent ex11 request',
    source:
      'packages/world-core/src/continuous-base.ts; forest-food-accounting.ts; forest-experience.ts',
    description:
      'Reuses exact references, integer tenths, eating, spoilage and meal history; no historical generated food skill enabled.',
  },
  abilities: [
    {
      id: 'prepare-food',
      name: 'Hand-mash food',
      function:
        'Turn owned unspoiled roots and berries into divisible food while preserving actual ingredients, mass, nutrients and shortest remaining spoilage budget.',
      equivalence: 'cold-hand-mash:roots-berries',
      parameters: {
        ...v7ObjectSchema({
          operation: {
            type: 'string',
            enum: ['start', 'continue', 'cancel', 'inspect'],
          },
          processId: { type: 'string' },
          inputs: {
            type: 'array',
            items: v7ObjectSchema({
              itemId: { type: 'string' },
              quantity: { type: 'number', minimum: 0.1 },
            }),
          },
        }),
        required: ['operation'],
      },
      prerequisites: [],
      learning: 2,
      costs:
        '1–4 original units; ceil(mass/0.4) work rounds, 1 energy each. Start pays first round, continuing start resumes bound work. Explicit continue resumes paused work. One output portion represents 0.1 original units; eat an actual number of portions. Soft carrying burden counts escrow and equal output mass; no hard inventory cap exists.',
      effects:
        'Cold preparation only: no detoxification, preservation, bonus nutrition or preparation reward. Cancel returns surviving escrow once, death drops it. Actual eat uses ingredient-weighted ordinary meals.',
      handler: 'collective.prepare-food',
      revision: 'prepare-food@1',
      authored: false,
      practiceEvidence: 'information-confirmed',
      references: {},
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Persistent processId, completed/remaining work, paid energy, ingredients and output IDs; changing action pauses without refund.',
      },
    },
  ],
  handlers: { 'collective.prepare-food': execute },
  processes: {},
  visualComponents: [],
  resources: [
    {
      id: 'hand-mashed-food',
      name: 'Hand-mashed food portions',
      mass: 0.04,
      nutrition: 0,
      toxicity: 0,
      color: '#ba9764',
    },
  ],
  satisfaction: [],
  events: [
    'information-confirmed',
    'process-progress',
    'process-completed',
    'process-stopped',
    'process-inspected',
  ],
  afterEnvironment(w) {
    for (const j of collectiveJobs(w, 'prepare-food').filter((j) =>
      ['active', 'paused'].includes(j.status),
    )) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (!a) continue;
      j.x = a.position.x;
      j.y = a.position.y;
      const survivors = w.stacks.filter(
        (s) => j.escrow.includes(s.id) && s.reservedFor === j.id,
      );
      for (const s of survivors) s.position = { ...a.position };
      if (survivors.length !== j.escrow.length)
        workStop(
          w,
          a,
          j,
          'Escrow ingredient expired during suspended work; surviving inputs returned.',
          a.vitals.health <= 0,
        );
    }
  },
  onDeath(w, a) {
    for (const j of collectiveJobs(w, 'prepare-food').filter(
      (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
    )) {
      j.x = a.position.x;
      j.y = a.position.y;
      workStop(w, a, j, 'Performer died; surviving escrow dropped once.', true);
    }
  },
  beforeAction(w, a, action) {
    if (action.interface !== 'prepare-food')
      for (const j of collectiveJobs(w, 'prepare-food').filter(
        (j) => j.owner === a.id && j.status === 'active',
      ))
        j.status = 'paused';
  },
};
