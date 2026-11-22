import type {
  V7ActionContext,
  V7Package,
  V7Spatial,
  V7Object,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import {
  v7Clone,
  v7Id,
  v7Json,
  v7Number,
  v7Record,
  v7String,
} from './continuous-data.js';
import {
  v7Inside,
  v7Obstacles,
  v7ShapesOverlap,
  v7ShapeDistance,
  v7SegmentClear,
} from './continuous-geometry.js';
import { forestResolveReference } from './forest-references.js';
import { forestClimate } from './forest-climate.js';
import { openConditions } from './open-physical.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
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
const point = (s: V7Spatial, x: number, y: number) => ({
  x: s.x + x * Math.cos(s.angle) - y * Math.sin(s.angle),
  y: s.y + x * Math.sin(s.angle) + y * Math.cos(s.angle),
});
function site(c: V7ActionContext): V7Spatial {
  const r = v7Record(c.action.args.site),
    s: V7Spatial = {
      x: v7Number(r.x, 'x'),
      y: v7Number(r.y, 'y'),
      angle: v7Number(r.angle, 'angle'),
      shape: { kind: 'rectangle', width: 2, height: 2 },
      solid: false,
      reserved: true,
      interaction: 0.65,
      entrances: [{ x: 0, y: 1 }],
    };
  const corridor: V7Spatial = {
    ...s,
    ...point(s, 0, 1.4),
    shape: { kind: 'rectangle', width: 0.8, height: 0.8 },
  };
  for (const area of [s, corridor]) {
    for (const x of [-1, 0, 1])
      for (const y of [-1, 0, 1]) {
        const p = point(
            area,
            (x * (area.shape.kind === 'rectangle' ? area.shape.width : 2)) / 2,
            (y * (area.shape.kind === 'rectangle' ? area.shape.height : 2)) / 2,
          ),
          conditions = openConditions(c.world, p);
        if (
          !v7Inside(c.world, p, 0.01) ||
          ['~', '=', ','].includes(conditions.ground) ||
          conditions.waterlogging > 0.1 ||
          conditions.moisture > 0.8
        )
          throw new Error(
            'Requires dry stable ground over the entire footprint and entrance.',
          );
      }
    const occupied = [
      ...v7Obstacles(c.world),
      ...c.world.objects
        .filter((o) => o.spatial.reserved)
        .map((o) => o.spatial),
      ...c.world.actors
        .filter((a) => a.vitals.health > 0)
        .map((a) => ({
          ...a.position,
          angle: 0,
          shape: { kind: 'circle' as const, radius: a.radius },
          solid: true,
          interaction: 0,
          entrances: [],
        })),
    ];
    if (occupied.some((o) => v7ShapesOverlap(area, o)))
      throw new Error(
        'Footprint or entrance intersects a solid, living occupant or reserved site.',
      );
  }
  if (v7ShapeDistance(c.actor.position, s) > c.actor.radius + 0.65)
    throw new Error('Stand adjacent to the actual worksite.');
  return s;
}
function allocate(c: V7ActionContext, recipe: Record<string, number>) {
  const allocations = workAllocations(c, c.action.args.materials),
    totals: Record<string, number> = {};
  for (const p of allocations) {
    if (
      (p.stack.processing && !p.stack.processing.recoveredFrom) ||
      p.stack.physical
    )
      throw new Error(
        'Use intact baseline material units, not transformed items.',
      );
    totals[p.stack.resource] = (totals[p.stack.resource] ?? 0) + p.quantity;
  }
  if (
    Object.keys(totals).length !== Object.keys(recipe).length ||
    Object.entries(recipe).some(
      ([k, n]) => Math.abs((totals[k] ?? 0) - n) > 1e-8,
    )
  )
    throw new Error(
      'Exact required material totals are unavailable: ' +
        JSON.stringify(recipe),
    );
  return allocations;
}
function target(c: V7ActionContext): V7Object {
  const id = forestResolveReference(
    c.world,
    c.actor,
    v7String(c.action.args.shelterId, 'shelterId'),
    'object',
  );
  const o = c.world.objects.find(
    (o) => o.id === id && o.kind === 'weather-lean-to',
  );
  if (!o) throw new Error('No actual completed weather lean-to.');
  if (v7ShapeDistance(c.actor.position, o.spatial) > c.actor.radius + 0.65)
    throw new Error('Shelter is outside interaction reach.');
  return o;
}
function settle(c: V7ActionContext, j: CollectiveWork, o: V7Object) {
  const escrow = c.world.stacks.filter(
    (s) => j.escrow.includes(s.id) && s.reservedFor === j.id,
  );
  if (escrow.length !== j.escrow.length)
    throw new Error('Reserved material no longer exists.');
  const components = escrow.map((s) => ({
    ...v7Clone(s),
    sourceOwner: j.owner,
    installedAt: c.world.tick,
  }));
  if (j.mode === 'start') {
    o.kind = 'weather-lean-to';
    o.name = 'Bark weather lean-to';
    o.data.integrity = 1;
    o.data.components = v7Json(components);
    o.visual.state = 'complete';
    for (const [x, y] of [
      [-0.9, -0.9],
      [0.9, -0.9],
      [-0.9, 0],
    ]) {
      const p = point(o.spatial, x ?? 0, y ?? 0),
        id = v7Id(c.world, 'post');
      c.world.objects.push({
        id,
        assemblyParent: o.id,
        kind: 'lean-to-post',
        name: 'Lean-to support',
        spatial: {
          ...p,
          angle: 0,
          shape: { kind: 'circle', radius: 0.1 },
          solid: true,
          interaction: 0,
          entrances: [],
        },
        visual: {
          component: 'lean-to-post',
          color: '#8d704e',
          accent: '#749851',
          label: 'Support',
          state: 'solid',
        },
        data: {},
        createdBy: c.actor.id,
        createdAt: c.world.tick,
        revision: 'weather-lean-to@1',
      });
    }
  } else if (j.mode === 'repair') {
    const before = Number(o.data.integrity);
    o.data.integrity = Math.min(1, before + 0.25);
    j.integrityRestored = o.data.integrity - before;
    o.data.components = [
      ...(Array.isArray(o.data.components) ? o.data.components : []),
      ...components.map((c) => v7Json(c)),
    ];
  } else {
    const components = Array.isArray(o.data.components)
      ? o.data.components
      : [];
    let debrisMass = 0;
    for (const raw of components) {
      const r = v7Record(raw),
        quantity = v7Number(r.quantity, 'component quantity'),
        resource = v7String(r.resource, 'component resource'),
        integrity = Number(o.data.integrity),
        surviving = Math.floor((quantity * integrity + 1e-9) * 10) / 10;
      const mass = c.world.resources.find((r) => r.id === resource)?.mass ?? 0;
      debrisMass += (quantity - surviving) * mass;
      if (surviving > 0) {
        const id = v7Id(c.world, 'item');
        c.world.stacks.push({
          id,
          resource,
          quantity: surviving,
          quantityTenths: foodTenths(surviving),
          owner: null,
          position: { x: j.x, y: j.y },
          origin: o.id,
          processing: { recoveredFrom: v7Json(raw), integrity },
        });
        j.outputs.push(id);
      }
    }
    j.unusableDebrisMass = debrisMass;
    j.dismantledComponents = v7Json(components);
    c.world.objects = c.world.objects.filter(
      (x) => x.id !== o.id && x.assemblyParent !== o.id,
    );
  }
  for (const s of escrow) foodSetQuantity(s, 0);
  j.status = 'completed';
  o.data.activeWork = null;
  o.data.remainingWork = 0;
  c.emit(
    'process-completed',
    'Paid shelter operation settled once against actual components.',
    { ...j },
    o.id,
  );
}
function execute(c: V7ActionContext) {
  const mode = v7String(c.action.args.operation, 'operation');
  let j = workFind(c);
  if (mode === 'inspect') {
    const o =
      typeof c.action.args.shelterId === 'string' && c.action.args.shelterId
        ? target(c)
        : c.world.objects.find((o) => o.id === j?.target);
    if (!j && !o)
      throw new Error('Supply an existing process or reachable shelter.');
    c.emit(
      'process-inspected',
      'Actual geometry, component ledger, integrity and remaining work.',
      { process: j ? { ...j } : null, shelter: o ? v7Json(o) : null },
      o?.id ?? j?.id,
    );
    return { complete: true, writes: [] };
  }
  if (mode === 'cancel') {
    if (!j) throw new Error('No personal work to cancel.');
    const o = c.world.objects.find((o) => o.id === j?.target);
    workStop(
      c.world,
      c.actor,
      j,
      'Explicit cancellation; surviving escrow released at the site.',
      true,
    );
    if (o) o.data.activeWork = null;
    return { complete: true, writes: [j.id, ...(o ? [o.id] : [])] };
  }
  if (!j && ['start', 'repair', 'dismantle'].includes(mode)) {
    let o: V7Object;
    const allocations =
      mode === 'start'
        ? allocate(c, { branch: 4, vine: 2, bark: 6 })
        : mode === 'repair'
          ? allocate(c, { bark: 1, vine: 0.5 })
          : [];
    if (mode === 'start') {
      const spatial = site(c);
      j = workCreate(c, mode, 8);
      o = {
        id: v7Id(c.world, 'shelter'),
        kind: 'lean-to-work',
        name: 'Reserved lean-to worksite',
        spatial,
        visual: {
          component: 'weather-lean-to',
          color: '#b2a582',
          accent: '#749851',
          label: 'Lean-to',
          state: 'work',
        },
        data: {
          integrity: 0,
          components: [],
          activeWork: j.id,
          remainingWork: 8,
        },
        createdBy: c.actor.id,
        createdAt: c.world.tick,
        revision: 'weather-lean-to@1',
      };
      c.world.objects.push(o);
    } else {
      o = target(c);
      if (o.data.activeWork)
        throw new Error('Another real operation already holds this shelter.');
      j = workCreate(c, mode, 2);
      o.data.activeWork = j.id;
    }
    j.target = o.id;
    j.x = o.spatial.x;
    j.y = o.spatial.y;
    workReserve(c, j, allocations, true);
  } else if (
    ['start', 'repair', 'dismantle'].includes(mode) &&
    c.operation?.first !== false
  )
    throw new Error(
      'Existing work must be resumed with work and its processId.',
    );
  if (!j) throw new Error('No personal shelter work.');
  const o = c.world.objects.find((o) => o.id === j.target);
  if (!o) throw new Error('Worksite no longer exists.');
  if (v7ShapeDistance(c.actor.position, o.spatial) > c.actor.radius + 0.65) {
    j.status = 'paused';
    j.reason = 'Worksite outside reach.';
    return workResult(j);
  }
  const obstructions = [
    ...v7Obstacles(c.world),
    ...c.world.actors
      .filter((a) => a.id !== c.actor.id && a.vitals.health > 0)
      .map((a) => ({
        ...a.position,
        angle: 0,
        shape: { kind: 'circle' as const, radius: a.radius },
        solid: true,
        interaction: 0,
        entrances: [],
      })),
  ];
  if (
    !v7SegmentClear(c.actor.position, o.spatial, c.actor.radius, obstructions)
  ) {
    j.status = 'paused';
    j.reason = 'Physical access to the worksite is blocked.';
    return workResult(j);
  }
  // Every future post position must remain free until the final installation transaction.
  if (
    j.mode === 'start' &&
    j.remainingWork === 1 &&
    c.world.actors.some(
      (a) =>
        a.vitals.health > 0 &&
        v7ShapesOverlap(
          { ...o.spatial, solid: true },
          {
            ...a.position,
            angle: 0,
            shape: { kind: 'circle', radius: a.radius },
            solid: true,
            interaction: 0,
            entrances: [],
          },
        ),
    )
  ) {
    j.status = 'paused';
    j.reason = 'A living occupant blocks completion.';
    return workResult(j);
  }
  if (!workPay(c, j, j.mode === 'dismantle' ? 1 : 2)) return workResult(j);
  o.data.remainingWork = j.remainingWork;
  o.data.completedWork = j.completedWork;
  if (j.remainingWork === 0) settle(c, j, o);
  return workResult(j);
}
function weather(w: V7World) {
  for (const o of w.objects.filter((o) => o.kind === 'weather-lean-to')) {
    const c = forestClimate(w, o.spatial),
      before = Number(o.data.integrity),
      wear = 0.0005 + 0.002 * (c.rain ?? 0) + 0.002 * (c.wind ?? 0);
    o.data.integrity = Math.max(0, before - wear);
    o.data.weather = {
      tick: w.tick,
      rain: c.rain ?? 0,
      wind: c.wind ?? 0,
      wear: before - o.data.integrity,
    };
    o.data.totalWear =
      Number(o.data.totalWear ?? 0) + before - o.data.integrity;
  }
}
export const COLLECTIVE_SHELTER: V7Package = {
  id: 'weather-lean-to',
  version: 1,
  scope: 'collective-ex11',
  description:
    'Actual paid bark-covered lean-to with wear and conditional relief.',
  dependencies: ['foundation-open@1'],
  reuse: {
    experiment:
      'Shared geometry, thermal and satisfaction engine; independent ex11 request',
    source:
      'packages/world-core/src/continuous-geometry.ts; forest-climate.ts; continuous-wellbeing.ts',
    description:
      'Reuses generic collision, weather, state transactions and event-grounded reward machinery. No ex10 shelter package, material geometry or mastery is enabled.',
  },
  abilities: [
    {
      id: 'weather-lean-to',
      name: 'Build and maintain a weather lean-to',
      function:
        'Create an oriented traversable 2 by 2 roof with three physical posts from actual branches, vines and bark; use, repair and dismantle its persistent components.',
      equivalence: 'lashed-bark-weather-refuge',
      parameters: {
        ...v7ObjectSchema({
          operation: {
            type: 'string',
            enum: ['start', 'work', 'cancel', 'inspect', 'repair', 'dismantle'],
          },
          processId: { type: 'string' },
          shelterId: { type: 'string' },
          site: v7ObjectSchema({
            x: { type: 'number' },
            y: { type: 'number' },
            angle: { type: 'number' },
          }),
          materials: {
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
      learning: 4,
      costs:
        'Start: 4 branch + 2 vine + 6 bark, clear dry 2x2 site and 0.8 entrance; 8 rounds at 2 energy. Repair: 1 bark + 0.5 vine, 2 rounds at 2 energy. Dismantle: 2 rounds at 1 energy. Start pays first round; bound repetition continues, work resumes exact processId. Material transfers never teleport.',
      effects:
        'Full body under roof receives rain reduction 0.8*integrity, wind 0.6*integrity, measured wetness/thermal/rest effects; outdoor wetness follows the same model. Wear 0.0005+0.002*rain+0.002*wind each round. Repair +0.25 integrity; dismantle recovers only surviving components. Only real beneficial rest can qualify for bounded experience.',
      handler: 'collective.lean-to',
      revision: 'weather-lean-to@1',
      authored: false,
      practiceEvidence: 'information-confirmed',
      references: {},
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Escrow, geometry reservation and remaining paid rounds persist through plan changes; cancel/death releases untransformed materials once.',
      },
    },
  ],
  handlers: { 'collective.lean-to': execute },
  processes: {},
  resources: [],
  visualComponents: ['weather-lean-to', 'lean-to-post'],
  events: [
    'information-confirmed',
    'process-progress',
    'process-completed',
    'process-stopped',
    'process-inspected',
    'shelter-exposure',
    'sheltered-rest',
  ],
  satisfaction: [
    {
      id: 'weather-refuge',
      name: 'Experienced weather relief',
      equivalence: 'actual-weather-refuge',
      event: 'sheltered-rest',
      interface: 'rest',
      conditions: [],
      amount: 0.3,
      cap: 0.6,
      duration: 4,
      mode: 'hold',
      repetition: 'refresh',
      cooldown: 8,
      maintenance: {
        event: 'sheltered-rest',
        interface: 'rest',
        gain: 0.015,
        cap: 0.4,
        decay: 0.003,
      },
      rationale:
        'Independent completed beneficial rest only; no construction, ownership, requests or mastery reward.',
      revision: 'weather-lean-to@1',
    },
  ],
  afterEnvironment: weather,
  beforeAction(w, a, action) {
    if (action.interface !== 'weather-lean-to')
      for (const j of collectiveJobs(w, 'weather-lean-to').filter(
        (j) => j.owner === a.id && j.status === 'active',
      ))
        j.status = 'paused';
  },
  onDeath(w, a) {
    for (const j of collectiveJobs(w, 'weather-lean-to').filter(
      (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
    )) {
      const o = w.objects.find((o) => o.id === j.target);
      workStop(
        w,
        a,
        j,
        'Performer died; installed components remain and escrow returns to the site.',
        true,
      );
      if (o) o.data.activeWork = null;
    }
  },
};
