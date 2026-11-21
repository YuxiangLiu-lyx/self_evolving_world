import type {
  V7Actor,
  V7Data,
  V7Package,
  V7Resource,
  V7Stack,
  V7World,
} from './continuous-types.js';
import {
  forestClearOperation,
  forestSaveOperation,
} from './forest-operations.js';
import { v7Signature } from './continuous-data.js';
import { v7Clone, v7Id } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import {
  v7Distance,
  v7Obstacles,
  v7Reach,
  v7SegmentClear,
  v7ShapeDistance,
} from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';
import { forestClimate, forestEvent } from './forest-environment.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';

interface Job extends V7Data {
  id: string;
  mode: string;
  target: string;
  source: string;
  x: number;
  y: number;
  elapsed: number;
  lastTick: number;
  escrow: string;
  inputs: V7Data[];
  eligibleRounds: number;
  eligible: boolean;
}
function job(a: V7Actor): Job | null {
  const j = a.extensionState['willow:pending'];
  return j && typeof j === 'object' && !Array.isArray(j) ? (j as Job) : null;
}
const duration = (mode: string) => (mode === 'strip' ? 4 : 3);
function event(
  w: V7World,
  a: V7Actor,
  type: string,
  target: string,
  data: V7Data = {},
) {
  const j = job(a);
  if (w.state.operationContinuity === 1 && j) {
    validateJob(j);
    data = {
      ...data,
      operation: j.id,
      mode: j.mode,
      resolvedTarget: j.target,
      originalReference: j.originalReference ?? j.target,
      actor: a.id,
      life: j.life ?? v7Signature(a.life ?? null),
      totalRounds: duration(j.mode),
      paidRounds: j.elapsed,
      remainingRounds: Math.max(0, duration(j.mode) - j.elapsed),
      elapsed: j.elapsed,
      remaining: Math.max(0, duration(j.mode) - j.elapsed),
      chargedEffort: j.elapsed * (j.mode === 'strip' ? 2 : 1),
      escrow: j.escrow,
    };
  }
  forestEvent(
    w,
    type,
    `Willow processing: ${type.replace('willow-', '')}.${typeof data.elapsed === 'number' ? ` Paid ${String(data.elapsed)} rounds; ${String(Number(data.remaining))} remaining.` : ''}`,
    a.position,
    a.id,
    data,
    target,
  );
  const e = w.events.at(-1);
  if (e) e.interface = 'process-willow';
}
function cancel(w: V7World, a: V7Actor, reason: string) {
  const j = job(a);
  if (!j) return;
  const s = w.stacks.find((s) => s.id === j.escrow && s.reservedFor === j.id);
  if (s) delete s.reservedFor;
  event(w, a, 'willow-work-cancelled', j.target, {
    reason,
    released: s?.id ?? null,
    sourceRestored: false,
    elapsed: j.elapsed,
    spentEffortRefunded: false,
  });
  a.extensionState['willow:lastWork'] = {
    ...v7Clone(j),
    status: 'cancelled',
    reason,
  };
  delete a.extensionState['willow:pending'];
  if (w.state.operationContinuity === 1) forestClearOperation(a);
}
function source(w: V7World, a: V7Actor, id: string) {
  const o = w.objects.find(
    (o) => o.id === id && o.kind === 'tree' && o.data.resource === 'willow',
  );
  if (
    !o ||
    !v7Observe(w, a.id).objects.some((x) => x.id === o.id) ||
    !v7Reach(a, o.spatial) ||
    v7ShapeDistance(a.position, o.spatial) < a.radius
  )
    throw new Error(
      'An actually visible reachable willow surface outside the trunk is required.',
    );
  const d = v7Distance(a.position, o.spatial),
    r = o.spatial.shape.kind === 'circle' ? o.spatial.shape.radius : 0;
  const edge = {
    x: o.spatial.x + ((a.position.x - o.spatial.x) / d) * (r + 0.001),
    y: o.spatial.y + ((a.position.y - o.spatial.y) / d) * (r + 0.001),
  };
  if (
    !v7SegmentClear(
      a.position,
      edge,
      0,
      v7Obstacles({ ...w, objects: w.objects.filter((x) => x.id !== o.id) }),
    )
  )
    throw new Error('A wall or obstacle blocks the actual harvesting reach.');
  return o;
}
const resource = (
  id: string,
  name: string,
  mass: number,
  flexibility: number,
  fuel: number,
): V7Resource => ({
  id,
  name,
  mass,
  nutrition: 0,
  toxicity: 0,
  color:
    id === 'willow-bark'
      ? '#b5a47a'
      : id === 'bast-cord'
        ? '#8d9964'
        : '#aa9970',
  properties: {
    hardness: 1,
    flexibility,
    fuel,
    decay: 0,
    minGrowth: 4,
    optimalGrowth: 19,
    moisture: 0.8,
  },
});
export const FOREST_WILLOW: V7Package = {
  id: 'willow-materials',
  version: 1,
  dependencies: ['local-fire@1', 'portable-insulation@1'],
  description:
    'Finite willow-stock separation into real panels, bast and offcuts; paid cord manufacture and qualified recipe compatibility.',
  resources: [
    resource(
      'willow-shoot-bundle',
      'Unprocessed willow shoot bundle',
      1.2,
      7,
      7,
    ),
    resource('willow-bark', 'Willow bark panels', 0.3, 6, 7 / 4),
    resource('willow-bast', 'Separated willow bast fibres', 0.5, 7, 2),
    resource('bast-cord', 'Twisted willow bast binding cord', 0.5, 9, 2),
    resource('willow-offcut', 'Willow processing offcuts', 0.1, 2, 7 / 12),
  ],
  processes: {},
  visualComponents: [],
  events: [
    'willow-work-started',
    'willow-work-progress',
    'willow-work-completed',
    'willow-work-cancelled',
    'willow-engagement-qualified',
  ],
  abilities: [
    {
      id: 'process-willow',
      name: 'Process willow material',
      function:
        'Separate real willow shoots into panels and bast; twist owned bast into usable binding.',
      equivalence: 'willow:stock1:panels2-bast1-offcut1:cord1',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['strip', 'twist'] },
          target: { type: 'string', maxLength: 1000 },
        },
        required: ['mode', 'target'],
        additionalProperties: false,
      },
      references: { target: 'visible' },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Strip takes four stationary rounds, twist three; repeat counts completed transformations. Global pauses preserve escrow. Cancellation releases the actual unprocessed bundle or bast once; never restores standing stock or spent effort. An owned cancelled bundle can restart the full four-round process.',
      },
      prerequisites: [],
      learning: 4,
      handler: 'willow.work@1',
      revision: 'willow-materials@1',
      authored: false,
      costs:
        'Strip: a reachable visible willow with at least1 actual stock, or one owned unprocessed willow-shoot-bundle;4 stationary rounds2 energy each. Twist: one owned willow-bast;3 stationary rounds1 energy each. Source access uses surface interaction0.65, excludes trunk overlap and blocked reach. Materials remain carried escrow; failure, movement, changed action, lost reach/visibility or death cancels. Paid effort is never refunded.',
      effects:
        'One1.2-mass willow stock unit becomes2 willow-bark panels(0.6 mass),1 willow-bast(0.5) and1 offcut(0.1). One bast becomes one0.5-mass binding cord. Panels and cord qualify for existing bark/vine recipe slots at unchanged quantities/mass, retain willow provenance and moisture; neither creates nutrition, warmth or mastery. At least3 paid healthy fed attentive rounds and successful usable output may qualify the performer for transient willow engagement1 for6 rounds/cooldown12 across both modes. Actual qualifying rounds settle a maintained component0.025 each only on successful completion; otherwise it decays0.003. Max of components capped1. Cancelled work never rewards.',
    },
  ],
  handlers: {
    'willow.work@1': ({ world: w, actor: a, action, operation }) => {
      const mode = typeof action.args.mode === 'string' ? action.args.mode : '',
        target =
          typeof action.args.target === 'string' ? action.args.target : '';
      let j = job(a);
      if (
        j &&
        (j.mode !== mode ||
          j.target !== target ||
          j.x !== a.position.x ||
          j.y !== a.position.y ||
          j.lastTick !== w.tick - 1)
      ) {
        cancel(w, a, 'work, target, position or continuity changed');
        j = null;
      }
      if (j && w.state.operationContinuity === 1) validateJob(j);
      if (!j) {
        j = {
          id: v7Id(w, 'willow-work'),
          mode,
          target,
          source: '',
          x: a.position.x,
          y: a.position.y,
          elapsed: 0,
          lastTick: w.tick,
          escrow: '',
          inputs: [],
          eligibleRounds: 0,
          eligible: true,
        };
        if (w.state.operationContinuity === 1) {
          j.actor = a.id;
          j.life = v7Signature(a.life ?? null);
          j.originalReference = operation?.request?.args.target ?? target;
          j.totalRounds = duration(mode);
          j.paidRounds = 0;
          j.remainingRounds = duration(mode);
          j.status = 'pending';
        }
        let material: V7Stack;
        const tree = w.objects.find((o) => o.id === target);
        if (mode === 'strip' && tree) {
          const o = source(w, a, target);
          if (Number(o.data.stock) < 1)
            throw new Error(
              'The finite observed willow stock has less than one unit remaining.',
            );
          o.data.stock = Number(o.data.stock) - 1;
          j.source = o.id;
          material = {
            id: v7Id(w, 'willow-bundle'),
            resource: 'willow-shoot-bundle',
            quantity: 1,
            owner: a.id,
            position: { ...a.position },
            origin: o.id,
            harvestedAt: w.tick,
            fuelMoisture: forestClimate(w, o.spatial).moisture,
            processing: {
              source: o.id,
              resource: 'willow',
              quantity: 1,
              mass: 1.2,
              harvestedAt: w.tick,
            },
          };
          w.stacks.push(material);
        } else {
          const s = w.stacks.find(
            (s) =>
              s.id === target &&
              s.owner === a.id &&
              !s.reservedFor &&
              s.resource ===
                (mode === 'strip' ? 'willow-shoot-bundle' : 'willow-bast') &&
              s.quantity >= 1,
          );
          if (!s)
            throw new Error(
              'An actual owned unreserved shoot bundle or bast unit is required for this mode.',
            );
          material = { ...v7Clone(s), id: v7Id(w, 'willow-material') };
          foodSetQuantity(material, 10);
          foodSetQuantity(s, foodTenths(s.quantity) - 10);
          w.stacks.push(material);
        }
        material.reservedFor = j.id;
        j.escrow = material.id;
        j.inputs = [
          {
            item: target,
            escrow: material.id,
            source: material.origin,
            resource: material.resource,
            quantity: 1,
            mass: mode === 'strip' ? 1.2 : 0.5,
            moisture: material.fuelMoisture ?? 0.8,
            harvestedAt: material.harvestedAt ?? w.tick,
          },
        ];
        a.extensionState['willow:pending'] = j;
        event(w, a, 'willow-work-started', target, {
          mode,
          inputs: j.inputs,
          total: duration(mode),
          stock: tree?.data.stock ?? null,
        });
      }
      if (j.source) source(w, a, j.source);
      const material = w.stacks.find(
        (s) =>
          s.id === j.escrow &&
          s.owner === a.id &&
          s.reservedFor === j.id &&
          s.quantity === 1,
      );
      if (!material)
        throw new Error(
          'The actual reserved processing input no longer survives.',
        );
      v7Spend(a, mode === 'strip' ? 2 : 1);
      j.elapsed++;
      if (w.state.operationContinuity === 1) {
        j.paidRounds = j.elapsed;
        j.remainingRounds = duration(mode) - j.elapsed;
      }
      j.lastTick = w.tick;
      j.eligible = j.eligible && a.vitals.satiety >= 20;
      event(w, a, 'willow-work-progress', target, {
        mode,
        elapsed: j.elapsed,
        remaining: duration(mode) - j.elapsed,
        energy: mode === 'strip' ? 2 : 1,
        escrow: j.escrow,
      });
      return {
        complete: j.elapsed === duration(mode),
        remaining: duration(mode) - j.elapsed,
        writes: [],
      };
    },
  },
  satisfaction: [
    {
      id: 'willow-engagement',
      name: 'Willow tactile engagement',
      equivalence: 'experience:actual-attentive-willow-processing',
      event: 'willow-engagement-qualified',
      interface: 'process-willow',
      conditions: [{ path: 'qualified', comparison: 'eq', value: true }],
      amount: 1,
      cap: 1,
      duration: 6,
      mode: 'hold',
      repetition: 'refresh',
      cooldown: 12,
      maintenance: {
        event: 'willow-engagement-qualified',
        interface: 'process-willow',
        gain: 0.025,
        decay: 0.003,
        roundsField: 'eligibleRounds',
        maxRounds: 4,
      },
      rationale:
        'Actual uninterrupted fed healthy tactile processing with useful output; pending-round credit settles only on completion so cancelled work cannot earn satisfaction. Both modes share one capped transient/maintained source.',
      revision: 'willow-materials@1',
    },
  ],
  migrate: (w) => {
    if (!w.config.experience)
      throw new Error(
        'Willow processing requires the reviewed experience policy.',
      );
    w.state.willowMaterials = 1;
    for (const a of w.actors) {
      a.extensionState['harness:process-willow'] = true;
      // Activate the fire adapter under its actual learned interface at this version boundary.
      a.extensionState['harness:tend-fire'] = true;
    }
    return w;
  },
  harness: {
    'process-willow': (o) => ({
      pending: o.self.extensionState['willow:pending'] ?? null,
      lastWork: o.self.extensionState['willow:lastWork'] ?? null,
      ownedMaterials: o.stacks
        .filter(
          (s) =>
            s.owner === o.self.id &&
            [
              'willow-shoot-bundle',
              'willow-bark',
              'willow-bast',
              'bast-cord',
              'willow-offcut',
            ].includes(s.resource),
        )
        .map((s) => ({
          item: s.id,
          resource: s.resource,
          quantity: s.quantity,
          moisture: s.fuelMoisture ?? null,
          provenance: s.processing ?? null,
        })),
      compatibility:
        'Willow bark panels satisfy bark slots; manufactured bast cord satisfies vine-binding slots. Quantities and costs are unchanged.',
    }),
  },
  onDeath: (w, a) => {
    cancel(w, a, 'owner died');
  },
};
export function willowAfterRound(before: V7World, w: V7World) {
  if (w.state.willowMaterials !== 1) return;
  for (const a of w.actors) {
    const j = job(a);
    if (!j) continue;
    const s = w.stacks.find(
        (s) =>
          s.id === j.escrow &&
          s.owner === a.id &&
          s.reservedFor === j.id &&
          s.quantity === 1,
      ),
      old = before.actors.find((old) => old.id === a.id);
    let reachable = true;
    if (j.source) {
      try {
        source(w, a, j.source);
      } catch {
        reachable = false;
      }
    }
    if (
      !s ||
      j.lastTick !== w.tick ||
      j.x !== a.position.x ||
      j.y !== a.position.y ||
      !reachable ||
      a.vitals.health <= 0
    ) {
      cancel(
        w,
        a,
        'attention, stationary access, material or life invalidated',
      );
      continue;
    }
    j.eligible =
      j.eligible &&
      !!old &&
      old.vitals.satiety >= 20 &&
      a.vitals.satiety >= 20 &&
      a.vitals.health >= old.vitals.health &&
      !w.events.some(
        (e) => e.actor === a.id && ['injured', 'died'].includes(e.type),
      );
    if (j.eligible) j.eligibleRounds++;
    if (j.elapsed !== duration(j.mode)) continue;
    const outputs: V7Stack[] = (
      j.mode === 'strip'
        ? [
            ['willow-bark', 2],
            ['willow-bast', 1],
            ['willow-offcut', 1],
          ]
        : [['bast-cord', 1]]
    ).map(([r, n]) => ({
      id: v7Id(w, 'willow-product'),
      resource: String(r),
      quantity: Number(n),
      owner: a.id,
      position: { ...a.position },
      origin: s.origin,
      harvestedAt: s.harvestedAt ?? w.tick,
      fuelMoisture: s.fuelMoisture ?? 0.8,
      processing: {
        source: s.origin,
        input: s.id,
        mode: j.mode,
        completedAt: w.tick,
        lineage: s.processing ?? {},
        inputs: j.inputs,
      },
    }));
    w.stacks = w.stacks.filter((item) => item.id !== s.id);
    w.stacks.push(...outputs);
    event(w, a, 'willow-work-completed', j.target, {
      mode: j.mode,
      inputs: j.inputs,
      outputs: outputs.map((s) => ({
        item: s.id,
        resource: s.resource,
        quantity: s.quantity,
        mass: w.resources.find((r) => r.id === s.resource)?.mass ?? 0,
        moisture: s.fuelMoisture ?? 0,
      })),
      elapsed: j.elapsed,
      remaining: 0,
    });
    if (j.eligible && j.eligibleRounds >= 3)
      event(w, a, 'willow-engagement-qualified', j.target, {
        qualified: true,
        eligibleRounds: j.eligibleRounds,
        output: outputs.map((s) => s.id),
        mode: j.mode,
      });
    a.extensionState['willow:lastWork'] = {
      ...v7Clone(j),
      status: 'completed',
      outputs: outputs.map((s) => s.id),
    };
    delete a.extensionState['willow:pending'];
  }
}

/** The legacy elapsed counter is authoritative paid work; derived display counters never add work. */
function validateJob(j: Job) {
  if (
    !['strip', 'twist'].includes(j.mode) ||
    !Number.isSafeInteger(j.elapsed) ||
    j.elapsed < 0 ||
    j.elapsed > duration(j.mode) ||
    !Number.isSafeInteger(j.lastTick)
  )
    throw new Error(
      'Invalid willow operation counters; no work or material may be synthesized.',
    );
  if (
    (j.paidRounds !== undefined && j.paidRounds !== j.elapsed) ||
    (j.totalRounds !== undefined && j.totalRounds !== duration(j.mode)) ||
    (j.remainingRounds !== undefined &&
      j.remainingRounds !== duration(j.mode) - j.elapsed)
  )
    throw new Error('Inconsistent willow operation counters.');
}
export const FOREST_OPERATION_CONTINUITY: V7Package = {
  id: 'willow-operation-continuity',
  version: 1,
  dependencies: ['willow-materials@1'],
  description:
    'Repair shared paid-operation identity across plan replacement; retain material and learning policy.',
  abilities: [],
  resources: [],
  satisfaction: [],
  handlers: {},
  processes: {},
  visualComponents: [],
  events: [],
  migrate: (w) => {
    w.state.operationContinuity = 1;
    for (const a of w.actors) {
      const j = job(a);
      if (!j) continue;
      // No terminal work is reconstructed. Only valid, currently owned live escrow can migrate.
      validateJob(j);
      const s = w.stacks.find(
        (s) =>
          s.id === j.escrow &&
          s.reservedFor === j.id &&
          s.owner === a.id &&
          s.quantity === 1,
      );
      if (
        !s ||
        a.vitals.health <= 0 ||
        j.lastTick !== w.tick ||
        j.elapsed < 1 ||
        j.elapsed >= duration(j.mode)
      )
        throw new Error('Cannot migrate invalid live willow escrow.');
      j.actor = a.id;
      j.life = v7Signature(a.life ?? null);
      j.originalReference = j.target;
      j.totalRounds = duration(j.mode);
      j.paidRounds = j.elapsed;
      j.remainingRounds = duration(j.mode) - j.elapsed;
      j.status = 'pending';
      const action = {
        interface: 'process-willow',
        args: { mode: j.mode, target: j.target },
      };
      forestSaveOperation(w, a, action, {
        action,
        elapsed: j.elapsed,
        remaining: duration(j.mode) - j.elapsed,
        startedAt: j.lastTick - j.elapsed + 1,
      });
    }
    return w;
  },
  beforeAction: (w, a, action, continuing) => {
    const j = job(a);
    if (!j) return;
    validateJob(j);
    if (
      !continuing ||
      action.interface !== 'process-willow' ||
      j.life !== v7Signature(a.life ?? null) ||
      j.x !== a.position.x ||
      j.y !== a.position.y
    )
      cancel(w, a, 'action, resolved identity, life or position changed');
  },
  onDeath: (_w, a) => {
    forestClearOperation(a);
  },
};
