import type {
  V7Actor,
  V7Data,
  V7Package,
  V7Point,
  V7Spatial,
  V7World,
} from './continuous-types.js';
import {
  v7Clone,
  v7Id,
  v7Number,
  v7String,
  v7RoundNumber,
} from './continuous-data.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import {
  v7Distance,
  v7Inside,
  v7Interior,
  v7Obstacles,
  v7SegmentClear,
  v7ShapesOverlap,
  v7Walls,
} from './continuous-geometry.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { forestEvent } from './forest-environment.js';
import { v7Observe } from './continuous-observation.js';

const pendingKey = 'shelter:pending';
interface ShelterJob extends V7Data {
  id: string;
  mode: string;
  target: string;
  x: number;
  y: number;
  angle: number;
  actorX: number;
  actorY: number;
  elapsed: number;
  lastTick: number;
  startedAt: number;
  escrow: string[];
}
function job(actor: V7Actor): ShelterJob | null {
  const raw = actor.extensionState[pendingKey];
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as ShelterJob)
    : null;
}
function event(
  world: V7World,
  actor: V7Actor,
  type: string,
  description: string,
  target: string,
  data: V7Data = {},
): void {
  forestEvent(world, type, description, actor.position, actor.id, data, target);
  const e = world.events.at(-1);
  if (e)
    e.interface =
      type.includes('maintenance') || data.mode === 'maintenance'
        ? 'shelter-maintain'
        : 'build-shelter';
}
export function shelterSpatial(x: number, y: number, angle: number): V7Spatial {
  return {
    x: v7RoundNumber(x),
    y: v7RoundNumber(y),
    angle: v7RoundNumber(angle),
    shape: { kind: 'rectangle', width: 2, height: 2 },
    solid: false,
    reserved: true,
    interaction: 0.65,
    entrances: [{ x: 0, y: 1 }],
    enclosure: { wall: 0.1, doorway: 1, roof: '#a49565' },
  };
}
function point(s: V7Spatial, x: number, y: number): V7Point {
  return {
    x: s.x + x * Math.cos(s.angle) - y * Math.sin(s.angle),
    y: s.y + x * Math.sin(s.angle) + y * Math.cos(s.angle),
  };
}
function reach(
  world: V7World,
  actor: V7Actor,
  spatial: V7Spatial,
  ignore: string,
): void {
  const entrance = point(spatial, 0, 1),
    approach = point(spatial, 0, 1 + actor.radius + 0.1);
  const obstacles = v7Obstacles({
    ...world,
    objects: world.objects.filter((o) => o.id !== ignore),
  });
  if (
    v7Distance(actor.position, entrance) > 0.65 ||
    !v7Inside(world, approach, actor.radius) ||
    !v7SegmentClear(actor.position, approach, actor.radius, obstacles) ||
    !v7SegmentClear(approach, spatial, actor.radius, [
      ...obstacles,
      ...v7Walls(spatial),
    ])
  )
    throw new Error(
      'A clear exterior approach and navigable doorway within 0.65 of the builder are required.',
    );
}
function site(
  world: V7World,
  actor: V7Actor,
  spatial: V7Spatial,
  ignore = '',
): void {
  const corners = [-1, 1].flatMap((x) =>
    [-1, 1].map((y) => point(spatial, x, y)),
  );
  const others = [
    ...v7Obstacles({
      ...world,
      objects: world.objects.filter((o) => o.id !== ignore),
    }),
    ...world.objects.filter((o) => o.id !== ignore).map((o) => o.spatial),
  ];
  if (
    corners.some((p) => !v7Inside(world, p, 0)) ||
    others.some((s) => v7ShapesOverlap(spatial, s)) ||
    world.actors.some((a) =>
      v7ShapesOverlap(spatial, {
        ...a.position,
        angle: 0,
        shape: { kind: 'circle', radius: a.radius },
        solid: true,
        interaction: 0,
        entrances: [],
      }),
    )
  )
    throw new Error(
      'The rotated shelter footprint overlaps a body, solid, reserved site or world boundary.',
    );
  reach(world, actor, spatial, ignore);
}
function reserve(
  world: V7World,
  actor: V7Actor,
  id: string,
  recipe: { resource: string; quantity: number }[],
): string[] {
  const ids: string[] = [];
  for (const cost of recipe) {
    let left = foodTenths(cost.quantity);
    for (const stack of [...world.stacks].filter(
      (s) =>
        s.owner === actor.id && !s.reservedFor && s.resource === cost.resource,
    )) {
      const amount = Math.min(left, foodTenths(stack.quantity));
      if (!amount) continue;
      const escrow = {
        ...v7Clone(stack),
        id: v7Id(world, 'shelter-material'),
        reservedFor: id,
        position: { ...actor.position },
      };
      foodSetQuantity(escrow, amount);
      foodSetQuantity(stack, foodTenths(stack.quantity) - amount);
      world.stacks.push(escrow);
      ids.push(escrow.id);
      left -= amount;
    }
    if (left)
      throw new Error(
        `Insufficient actual unreserved ${cost.resource} for shelter work.`,
      );
  }
  return ids;
}
function cancel(
  world: V7World,
  actor: V7Actor,
  reason: string,
  dead = false,
): void {
  const current = job(actor);
  if (!current) return;
  for (const stack of world.stacks.filter(
    (s) => current.escrow.includes(s.id) && s.reservedFor === current.id,
  )) {
    delete stack.reservedFor;
    stack.owner = dead ? null : actor.id;
    stack.position = { ...actor.position };
  }
  if (current.mode === 'build')
    world.objects = world.objects.filter((o) => o.id !== current.target);
  else {
    const object = world.objects.find((o) => o.id === current.target);
    if (object) {
      delete object.data.maintenance;
      object.visual.state =
        Number(object.data.remainingService) > 0 ? 'protected' : 'expired';
    }
  }
  actor.extensionState['shelter:lastWork'] = {
    ...v7Clone(current),
    status: 'cancelled',
    tick: world.tick,
    reason,
  };
  event(
    world,
    actor,
    current.mode === 'build'
      ? 'shelter-build-cancelled'
      : 'shelter-maintenance-cancelled',
    `Shelter work cancelled: ${reason}. Only surviving unconsumed material is released; effort remains spent.`,
    current.target,
    { operation: current.id, elapsed: current.elapsed },
  );
  delete actor.extensionState['shelter:pending'];
}
function work(
  world: V7World,
  actor: V7Actor,
  mode: string,
  spatial: V7Spatial,
  target: string,
) {
  let current = job(actor);
  if (
    current &&
    (current.mode !== mode ||
      (mode === 'maintenance' && current.target !== target) ||
      current.x !== spatial.x ||
      current.y !== spatial.y ||
      current.angle !== spatial.angle ||
      current.actorX !== actor.position.x ||
      current.actorY !== actor.position.y ||
      current.lastTick !== world.tick - 1)
  ) {
    cancel(world, actor, 'position, site or consecutive attention changed');
    current = null;
  }
  if (mode === 'build') site(world, actor, spatial, current?.target);
  else reach(world, actor, spatial, target);
  v7Spend(actor, mode === 'build' ? 2 : 1);
  if (!current) {
    const id = v7Id(world, 'shelter-work');
    const escrow = reserve(
      world,
      actor,
      id,
      mode === 'build'
        ? [
            { resource: 'branch', quantity: 6 },
            { resource: 'dry-grass', quantity: 8 },
          ]
        : [{ resource: 'dry-grass', quantity: 4 }],
    );
    const targetId = mode === 'build' ? v7Id(world, 'shelter') : target;
    if (mode === 'build') {
      const footprint = v7Clone(spatial);
      delete footprint.enclosure;
      world.objects.push({
        id: targetId,
        name: 'Reserved shelter construction site',
        kind: 'shelter-site',
        spatial: { ...footprint, solid: true },
        visual: {
          component: 'construction',
          color: '#a49565',
          accent: '#e1cb8b',
          label: 'Construction site',
          state: 'unfinished',
        },
        data: { progress: 0, total: 6, operation: id },
        createdBy: actor.id,
        createdAt: world.tick,
        revision: 'shelter-construction@1',
      });
    } else {
      const object = world.objects.find((o) => o.id === targetId);
      if (!object || object.data.maintenance)
        throw new Error(
          'The actual shelter is absent or already under maintenance.',
        );
      object.data.maintenance = id;
      object.visual.state = 'maintenance';
    }
    current = {
      id,
      mode,
      target: targetId,
      x: spatial.x,
      y: spatial.y,
      angle: spatial.angle,
      actorX: actor.position.x,
      actorY: actor.position.y,
      elapsed: 0,
      lastTick: world.tick,
      startedAt: world.tick,
      escrow,
    };
    actor.extensionState[pendingKey] = current;
    event(
      world,
      actor,
      mode === 'build'
        ? 'shelter-build-started'
        : 'shelter-maintenance-started',
      `Started paid shelter ${mode}; actual material is reserved and remains carried.`,
      targetId,
      { operation: id, escrow },
    );
  }
  if (
    !current.escrow.every((id) =>
      world.stacks.some(
        (s) =>
          s.id === id && s.reservedFor === current.id && s.owner === actor.id,
      ),
    )
  )
    throw new Error('Reserved shelter material is no longer available.');
  current.elapsed++;
  current.lastTick = world.tick;
  const object = world.objects.find((o) => o.id === current.target);
  if (!object)
    throw new Error('The actual shelter site is no longer available.');
  object.data.progress = current.elapsed;
  event(
    world,
    actor,
    'shelter-build-progress',
    `${mode === 'build' ? 'Constructing' : 'Maintaining'} shelter: ${String(current.elapsed)} / ${mode === 'build' ? '6' : '2'} paid rounds.`,
    current.target,
    {
      operation: current.id,
      mode,
      elapsed: current.elapsed,
      energy: mode === 'build' ? 2 : 1,
    },
  );
  return {
    complete: current.elapsed >= (mode === 'build' ? 6 : 2),
    writes: [],
  };
}
export const FOREST_SHELTER: V7Package = {
  id: 'shelter-construction',
  version: 1,
  dependencies: ['food-assessment@1'],
  description:
    'Material-backed rotated enclosure, perishable cold protection and measured personal refuge.',
  resources: [],
  processes: {},
  visualComponents: [],
  events: [
    'shelter-build-started',
    'shelter-build-progress',
    'shelter-build-completed',
    'shelter-build-cancelled',
    'shelter-maintenance-started',
    'shelter-maintenance-completed',
    'shelter-maintenance-cancelled',
    'shelter-protection-expired',
    'shelter-exposure-measured',
    'shelter-comfort-qualified',
  ],
  abilities: [
    {
      id: 'build-shelter',
      name: 'Build insulating shelter',
      function:
        'Construct a persistent two-by-two branch and packed-grass refuge with a real doorway.',
      equivalence: 'shelter:2x2:branch-grass:paid-six-rounds:cold-half',
      parameters: v7ObjectSchema({
        x: { type: 'number' },
        y: { type: 'number' },
        angle: { type: 'number' },
      }),
      prerequisites: [],
      learning: 5,
      costs:
        '6 owned branch and 8 dry-grass units, 6 consecutive stationary rounds at 2 energy each. Center (x,y), angle in radians, front entrance at local (0,1); stand outside within 0.65 of that entrance. Entire footprint and approach must be clear. Real escrow is released once on interruption or death.',
      effects:
        'Actual interior halves the below-comfort cooling component for 160 rounds. Ambient temperature, heat exposure, ordinary rest and food costs stay unchanged. Cold damage can remain. Maintenance requires separate personal study. No building or ownership reward.',
      handler: 'shelter.build@1',
      revision: 'shelter-construction@1',
      authored: false,
    },
    {
      id: 'shelter-maintain',
      name: 'Maintain shelter covering',
      function: 'Replace packed-grass insulation on a real existing shelter.',
      equivalence: 'shelter:grass-maintenance:two-rounds:restore160',
      parameters: v7ObjectSchema({ target: { type: 'string' } }),
      prerequisites: ['build-shelter'],
      learning: 2,
      costs:
        '4 owned dry-grass units and 2 consecutive stationary rounds at 1 energy each within 0.65 of the actual entrance. Escrow ages and is released once on interruption or death.',
      effects:
        'Restores remaining cold protection to 160 rounds, never adds beyond 160. Expired walls remain real obstacles. No direct healing, food, rest bonus or completion reward.',
      handler: 'shelter.maintain@1',
      revision: 'shelter-construction@1',
      authored: false,
    },
  ],
  handlers: {
    'shelter.build@1': ({ world, actor, action }) =>
      work(
        world,
        actor,
        'build',
        shelterSpatial(
          v7Number(action.args.x, 'x'),
          v7Number(action.args.y, 'y'),
          v7Number(action.args.angle, 'angle'),
        ),
        '',
      ),
    'shelter.maintain@1': ({ world, actor, action }) => {
      const target = v7String(action.args.target, 'shelter target'),
        object = world.objects.find(
          (o) => o.id === target && o.kind === 'insulating-shelter',
        );
      if (!object) throw new Error('An actual completed shelter is required.');
      return work(world, actor, 'maintenance', object.spatial, target);
    },
  },
  satisfaction: [
    {
      id: 'thermal-refuge',
      name: 'Thermal refuge',
      equivalence: 'experience:measured-cold-refuge',
      event: 'shelter-comfort-qualified',
      interface: 'build-shelter',
      participants: 'actor',
      conditions: [{ path: 'qualified', comparison: 'eq', value: true }],
      amount: 1,
      cap: 1,
      duration: 6,
      cooldown: 12,
      repeatWindow: { rounds: 12, amount: 1 },
      mode: 'hold',
      repetition: 'refresh',
      rationale:
        'Three consecutive stationary resting/waiting rounds with measured avoided cold loss and lower cold discomfort, without starvation or health loss. Ownership, construction, application and study alone do not qualify.',
      revision: 'shelter-construction@1',
    },
  ],
  migrate: (world) => {
    world.state.shelterConstruction = 1;
    world.state.shelterRegistry = [];
    for (const a of world.actors)
      a.extensionState['harness:build-shelter'] = true;
    return world;
  },
  harness: {
    'build-shelter': (o) => ({
      pending: o.self.extensionState[pendingKey] ?? null,
      lastWork: o.self.extensionState['shelter:lastWork'] ?? null,
      lastExposure: o.self.extensionState['shelter:exposure'] ?? null,
      note: 'Exposure is dated evidence of the current interior, never a promise of warmth or immunity.',
    }),
  },
  onDeath: (world, actor) => {
    cancel(world, actor, 'builder died', true);
    delete actor.extensionState['shelter:comfort'];
  },
};
export function shelterAfterRound(before: V7World, world: V7World): void {
  if (world.state.shelterConstruction !== 1) return;
  for (const object of world.objects.filter(
    (o) => o.kind === 'insulating-shelter',
  )) {
    const remaining = Number(object.data.remainingService);
    if (remaining > 0) {
      object.data.remainingService = remaining - 1;
      if (remaining === 1) {
        object.visual.state = object.data.maintenance
          ? 'maintenance-expired'
          : 'expired';
        const observers = world.actors.filter(
          (a) =>
            a.vitals.health > 0 &&
            v7Observe(world, a.id).objects.some((o) => o.id === object.id),
        );
        for (const observer of observers.length ? observers : [null])
          forestEvent(
            world,
            'shelter-protection-expired',
            'The packed-grass protection expired; the physical frame and walls remain.',
            object.spatial,
            observer?.id ?? null,
            { remainingService: 0 },
            object.id,
          );
      }
    }
    object.data.occupants = world.actors
      .filter(
        (a) => a.vitals.health > 0 && v7Interior(a.position, object.spatial),
      )
      .map((a) => a.id);
    object.data.measurements = world.actors.flatMap((a) => {
      const e = a.extensionState['shelter:exposure'];
      return e &&
        typeof e === 'object' &&
        !Array.isArray(e) &&
        e.tick === world.tick &&
        e.target === object.id
        ? [e]
        : [];
    });
  }
  for (const actor of world.actors) {
    const current = job(actor);
    if (current) {
      const object = world.objects.find((o) => o.id === current.target);
      const intact = current.escrow.every((id) =>
        world.stacks.some(
          (s) =>
            s.id === id && s.reservedFor === current.id && s.owner === actor.id,
        ),
      );
      if (
        !object ||
        !intact ||
        current.lastTick !== world.tick ||
        current.actorX !== actor.position.x ||
        current.actorY !== actor.position.y
      )
        cancel(world, actor, 'actual work, materials or site were interrupted');
      else if (current.elapsed >= (current.mode === 'build' ? 6 : 2)) {
        try {
          if (current.mode === 'build')
            site(
              world,
              actor,
              shelterSpatial(current.x, current.y, current.angle),
              current.target,
            );
          else reach(world, actor, object.spatial, object.id);
          world.stacks = world.stacks.filter(
            (s) => !current.escrow.includes(s.id),
          );
          if (current.mode === 'build') {
            object.kind = 'insulating-shelter';
            object.name = 'Branch-and-grass shelter';
            object.spatial = shelterSpatial(
              current.x,
              current.y,
              current.angle,
            );
            object.visual = {
              component: 'enclosure',
              color: '#8b7957',
              accent: '#d5bf81',
              label: 'Insulating shelter',
              state: 'protected',
            };
            object.data = {
              recipe: 'branch6-grass8@1',
              condition: 'intact',
              remainingService: 160,
              constructedAt: world.tick,
              creator: actor.id,
              occupants: [],
              measurements: [],
            };
            const registry = world.state.shelterRegistry;
            world.state.shelterRegistry = [
              ...(Array.isArray(registry) ? registry : []),
              object.id,
            ];
          } else {
            object.data.remainingService = 160;
            object.data.maintainedAt = world.tick;
            delete object.data.maintenance;
            object.visual.state = 'protected';
          }
          actor.extensionState['shelter:lastWork'] = {
            ...v7Clone(current),
            status: 'completed',
            tick: world.tick,
          };
          event(
            world,
            actor,
            current.mode === 'build'
              ? 'shelter-build-completed'
              : 'shelter-maintenance-completed',
            `Completed paid shelter ${current.mode}; 160 service rounds remain. No construction reward.`,
            object.id,
            {
              operation: current.id,
              elapsed: current.elapsed,
              remainingService: 160,
            },
          );
          delete actor.extensionState['shelter:pending'];
        } catch (error) {
          cancel(
            world,
            actor,
            error instanceof Error ? error.message : 'Site invalidated',
          );
        }
      }
    }
    const exposure = actor.extensionState['shelter:exposure'],
      old = before.actors.find((a) => a.id === actor.id);
    const e =
      exposure && typeof exposure === 'object' && !Array.isArray(exposure)
        ? exposure
        : null;
    const protectedNow = world.objects.some(
      (o) => o.id === e?.target && Number(o.data.remainingService) > 0,
    );
    const restful = world.events.some(
      (e) => e.actor === actor.id && ['rested', 'waited'].includes(e.type),
    );
    const qualifies =
      !!old &&
      !!e &&
      e.tick === world.tick &&
      Number(e.avoidedColdLoss) > 0 &&
      Number(e.coldDiscomfort) < Number(e.unshelteredColdDiscomfort) &&
      protectedNow &&
      restful &&
      !old.learning &&
      !actor.learning &&
      old.vitals.satiety > 0 &&
      actor.vitals.health >= old.vitals.health &&
      actor.vitals.health > 0 &&
      v7Distance(old.position, actor.position) === 0 &&
      !world.events.some(
        (e) => e.actor === actor.id && ['injured', 'died'].includes(e.type),
      );
    const raw = actor.extensionState['shelter:comfort'],
      previous =
        raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    if (!qualifies) {
      delete actor.extensionState['shelter:comfort'];
      continue;
    }
    const count =
      previous &&
      previous.target === e.target &&
      previous.tick === world.tick - 1
        ? Number(previous.count) + 1
        : 1;
    actor.extensionState['shelter:comfort'] = {
      target: e.target ?? null,
      tick: world.tick,
      count: count >= 3 ? 0 : count,
    };
    if (count >= 3)
      event(
        world,
        actor,
        'shelter-comfort-qualified',
        'Three actual restful sheltered rounds reduced cold discomfort without health loss.',
        typeof e.target === 'string' ? e.target : '',
        { qualified: true, rounds: 3, measurement: e },
      );
  }
}
