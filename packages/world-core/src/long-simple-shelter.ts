import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Spatial,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import {
  v7Id,
  v7Json,
  v7Number,
  v7RoundNumber,
  v7String,
} from './continuous-data.js';
import {
  v7Inside,
  v7Reach,
  v7ShapeDistance,
  v7ShapesOverlap,
} from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { forestResolveReference } from './forest-references.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { materialPortion } from './material-lots.js';
import { openConditions, openMaterial } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workAllocations,
  workCreate,
  workFind,
  workPay,
  workReserve,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import {
  SIMPLE_SHELTER_GEOMETRY as G,
  SIMPLE_SHELTER_KIND as KIND,
  SIMPLE_SHELTER_LIMITS as LIMITS,
  SIMPLE_SHELTER_REVISION as REVISION,
  SIMPLE_SHELTER_SLOPE as SLOPE,
  simpleShelterCovers,
} from './long-shelter-exposure.js';

const ID = 'simple-shelter';
const STATE = 'long:work:simple-shelter';
/** Reused ex11 weather-lean-to wear law per round: 0.0005 + 0.002 x rain + 0.002 x wind. */
const WEAR = { base: 0.0005, rain: 0.002, wind: 0.002 };
/** A component below this condition has loosened; the structure is unsafe. */
const SOUND = 0.5;
const STAGES = ['posts', 'ridge-and-braces', 'ribs-and-binding', 'roofing'];

interface Part {
  role: string;
  resource: string;
  quantity: number;
}
/** Twelve paid increments; one branch unit is one usable member, one vine unit 3 m of binding, one bark unit 0.5 m2 of overlapped roofing. */
const PLAN: { stage: string; parts: Part[] }[] = [
  {
    stage: 'posts',
    parts: [{ role: 'forked post', resource: 'branch', quantity: 1 }],
  },
  {
    stage: 'posts',
    parts: [{ role: 'forked post', resource: 'branch', quantity: 1 }],
  },
  {
    stage: 'ridge-and-braces',
    parts: [{ role: 'ridge pole', resource: 'branch', quantity: 1 }],
  },
  {
    stage: 'ridge-and-braces',
    parts: [{ role: 'diagonal brace', resource: 'branch', quantity: 2 }],
  },
  {
    stage: 'ridge-and-braces',
    parts: [{ role: 'diagonal brace', resource: 'branch', quantity: 2 }],
  },
  {
    stage: 'ribs-and-binding',
    parts: [
      { role: 'roof rib', resource: 'branch', quantity: 2 },
      { role: 'binding', resource: 'vine', quantity: 1 },
    ],
  },
  {
    stage: 'ribs-and-binding',
    parts: [
      { role: 'roof rib', resource: 'branch', quantity: 2 },
      { role: 'binding', resource: 'vine', quantity: 1 },
    ],
  },
  {
    stage: 'ribs-and-binding',
    parts: [
      { role: 'roof rib', resource: 'branch', quantity: 2 },
      { role: 'binding', resource: 'vine', quantity: 2 },
    ],
  },
  {
    stage: 'roofing',
    parts: [{ role: 'roofing course', resource: 'bark', quantity: 2 }],
  },
  {
    stage: 'roofing',
    parts: [{ role: 'roofing course', resource: 'bark', quantity: 2 }],
  },
  {
    stage: 'roofing',
    parts: [{ role: 'roofing course', resource: 'bark', quantity: 2 }],
  },
  { stage: 'final-inspection', parts: [] },
];
const BUILT = PLAN.length - 1;
const needs = (parts: Part[]) => {
  const totals: Record<string, number> = {};
  for (const p of parts)
    totals[p.resource] = (totals[p.resource] ?? 0) + p.quantity;
  return totals;
};
const RECIPE = needs(PLAN.flatMap((i) => i.parts));

/** An installed component keeps the moved stack's identity, quantity, origin and age. */
interface Component extends V7Data {
  id: string;
  resource: string;
  quantity: number;
  origin: string;
  increment: number;
  stage: string;
  role: string;
  condition: number;
  installedAt: number;
  sourceOwner: string;
}
const components = (o: V7Object): Component[] =>
  Array.isArray(o.data.components)
    ? (o.data.components as unknown as Component[])
    : [];
const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const statusOf = (o: V7Object) =>
  typeof o.data.status === 'string' ? o.data.status : 'unfinished';
/** A JSON copy without the named fields. */
function omit(value: object, keys: string[]): V7Data {
  const out: V7Data = {};
  for (const [k, v] of Object.entries(value) as [string, unknown][])
    if (!keys.includes(k) && v !== undefined) out[k] = v7Json(v);
  return out;
}
const mass = (w: V7World, c: { resource: string; quantity: number }) =>
  (w.resources.find((r) => r.id === c.resource)?.mass ?? 0) * c.quantity;

/** Recomputes condition, coverage and drawing metadata from the actual installed parts. */
function refresh(w: V7World, o: V7Object) {
  const parts = components(o),
    installed = [...new Set(parts.map((p) => p.increment))].sort(
      (a, b) => a - b,
    ),
    frame = parts.filter((p) => p.stage !== 'roofing'),
    courses = PLAN.flatMap((step, i) =>
      step.stage === 'roofing'
        ? [parts.filter((p) => p.increment === i + 1)]
        : [],
    );
  const frameCondition = frame.length
    ? Math.min(...frame.map((p) => p.condition))
    : 0;
  const courseConditions = courses.map((c) =>
    c.length ? Math.min(...c.map((p) => p.condition)) : 0,
  );
  const roofCondition =
    courseConditions.reduce((n, c) => n + c, 0) / courseConditions.length;
  o.data.installedIncrements = installed;
  o.data.frameCondition = v7RoundNumber(frameCondition);
  o.data.roofCondition = v7RoundNumber(roofCondition);
  const roofCoverage = v7RoundNumber(
    courseConditions.filter((c) => c > 0).length / courseConditions.length,
  );
  o.data.roofCoverage = roofCoverage;
  o.data.mass = v7RoundNumber(parts.reduce((n, p) => n + mass(w, p), 0));
  const status = statusOf(o);
  o.visual.state = status;
  o.visual.color = roofCoverage > 0 ? '#cec5ac' : '#8d704e';
  o.data.view = {
    component: 'shelter',
    kind: 'braced lean-to',
    status: status === 'commissioned' ? 'complete' : status,
    footprint: { length: G.site, depth: G.site },
    coveredFloor: { length: G.length, depth: G.depth },
    orientation: o.data.orientation ?? 0,
    roofSlope: SLOPE,
    ridgeHeight: G.ridgeHeight,
    stage: installed.length
      ? (PLAN[(installed.at(-1) ?? 1) - 1]?.stage ?? null)
      : null,
    roofCoverage: o.data.roofCoverage,
    visibleDamage: v7RoundNumber(
      1 - Math.min(1, ...parts.map((p) => p.condition)),
    ),
    components: parts.map((p) => ({
      role: p.role,
      resource: p.resource,
      quantity: p.quantity,
      condition: v7RoundNumber(p.condition),
      color: w.resources.find((r) => r.id === p.resource)?.color ?? '#8d704e',
    })),
  };
}

/** Coded checks against the installed parts and the site; material values are the existing ones probe reveals. */
function verify(w: V7World, o: V7Object) {
  const parts = components(o),
    group = (stage: string) => parts.filter((p) => p.stage === stage),
    sound = (list: Component[]) =>
      list.length > 0 && list.every((p) => p.condition >= SOUND),
    complete = PLAN.slice(0, BUILT).every((_, i) =>
      parts.some((p) => p.increment === i + 1),
    ),
    ground = openConditions(w, o.spatial),
    material = (id: string) => {
      const r = w.resources.find((r) => r.id === id);
      return r ? openMaterial(r) : null;
    };
  const branch = material('branch'),
    vine = material('vine'),
    bark = material('bark');
  const tests = [
    {
      test: 'lateral stability',
      passed:
        complete &&
        sound([...group('posts'), ...group('ridge-and-braces')]) &&
        ground.ground === '.' &&
        ground.waterlogging <= LIMITS.waterlogging,
      measured: {
        postsAndBraces: Math.min(
          1,
          ...[...group('posts'), ...group('ridge-and-braces')].map(
            (p) => p.condition,
          ),
        ),
        ground: ground.ground,
        waterlogging: ground.waterlogging,
      },
    },
    {
      test: 'binding pull',
      passed:
        sound(parts.filter((p) => p.role === 'binding')) &&
        (vine?.flexibility ?? 0) >= 0.7,
      measured: {
        binding: Math.min(
          1,
          ...parts.filter((p) => p.role === 'binding').map((p) => p.condition),
        ),
        flexibility: vine?.flexibility ?? null,
      },
    },
    {
      test: 'roof load',
      passed:
        sound(parts.filter((p) => p.resource === 'branch')) &&
        (branch?.strength ?? 0) >= 0.3,
      measured: {
        supportedLoad: v7RoundNumber(
          [
            ...group('roofing'),
            ...parts.filter((p) => p.role === 'roof rib'),
          ].reduce((n, p) => n + mass(w, p), 0),
        ),
        strength: branch?.strength ?? null,
      },
    },
    {
      test: 'runoff',
      passed:
        Number(o.data.roofCoverage) === 1 &&
        sound(group('roofing')) &&
        (bark?.waterResistance ?? 0) >= 0.8 &&
        SLOPE >= 35,
      measured: {
        courses: group('roofing').length,
        waterResistance: bark?.waterResistance ?? null,
        slope: SLOPE,
      },
    },
  ];
  return { passed: tests.every((t) => t.passed), tests };
}

function commission(c: V7ActionContext, o: V7Object, again: boolean) {
  const check = verify(c.world, o);
  o.data.tests = [
    ...(Array.isArray(o.data.tests) ? o.data.tests : []),
    {
      tick: c.world.tick,
      by: c.actor.id,
      passed: check.passed,
      tests: v7Json(check.tests),
    },
  ].slice(-6);
  if (check.passed) {
    o.data.status = 'commissioned';
    o.data.limits = v7Json(LIMITS);
    o.data.supportedLoad = check.tests[2]?.measured.supportedLoad ?? 0;
    refresh(c.world, o);
    c.emit(
      'simple-shelter-commissioned',
      `Stability, binding, roof-load and runoff checks passed${again ? ' on reinspection' : ''}; one person on the covered floor is partly shielded from rain and wind within the light-weather limits.`,
      {
        structure: o.id,
        tests: v7Json(check.tests),
        limits: v7Json(LIMITS),
        supportedLoad: o.data.supportedLoad,
        again,
      },
      o.id,
    );
  } else {
    if (o.data.status === 'commissioned' || !again)
      o.data.status = again ? 'unsafe' : 'unverified';
    refresh(c.world, o);
    c.emit(
      'simple-shelter-test-failed',
      'A structural or runoff check failed; the structure gives no protection until repaired and reinspected.',
      {
        structure: o.id,
        tests: v7Json(check.tests),
        status: statusOf(o),
      },
      o.id,
    );
  }
  return check.passed;
}

function summary(w: V7World, j: CollectiveWork): V7Data {
  const o = w.objects.find((o) => o.id === j.target);
  return {
    workId: j.id,
    structure: j.target,
    status: j.status,
    completedIncrements: j.completedWork,
    remaining: j.remainingWork,
    paidEnergy: v7RoundNumber(j.paidEnergy),
    nextStage: PLAN[j.completedWork]?.stage ?? null,
    site: o
      ? { x: o.spatial.x, y: o.spatial.y, orientation: o.data.orientation ?? 0 }
      : null,
    reserved: v7Json(j.sources),
    view: o?.data.view ?? null,
  };
}
function sync(a: V7Actor, j: CollectiveWork) {
  a.extensionState[STATE] = v7Json(j);
}

/** Recipe totals over exact owned whole units; recovered shelter parts keep their measured condition. */
function allocate(c: V7ActionContext, recipe: Record<string, number>) {
  const allocations = workAllocations(c, c.action.args.materials),
    totals: Record<string, number> = {};
  for (const { stack: s, quantity } of allocations) {
    const treated =
      Object.keys(s.processing ?? {}).some((k) => k !== 'simpleShelterPart') ||
      [
        s.physical,
        s.materialLayer,
        s.mantle,
        s.frictionKit,
        s.waterCup,
        s.fuelMoisture,
      ].some((x) => x !== undefined);
    if (treated)
      throw new Error('Use untreated material units; nothing was reserved.');
    if (!Number.isInteger(quantity))
      throw new Error(
        'Whole material units are required; nothing was reserved.',
      );
    totals[s.resource] = (totals[s.resource] ?? 0) + quantity;
  }
  if (
    Object.keys(totals).length !== Object.keys(recipe).length ||
    Object.entries(recipe).some(([k, n]) => totals[k] !== n)
  )
    throw new Error(
      `Exact owned whole units are required: ${JSON.stringify(recipe)}; nothing was reserved.`,
    );
  return allocations;
}
/** Splits allocations into per-increment pieces in the order given. */
function pieces(
  allocations: { stack: V7Stack; quantity: number }[],
  steps: number[],
) {
  const left = allocations.map((a) => ({ ...a })),
    out: {
      stack: V7Stack;
      quantity: number;
      increment: number;
      role: string;
    }[] = [];
  for (const increment of steps)
    for (const part of PLAN[increment - 1]?.parts ?? []) {
      let need = part.quantity;
      for (const a of left.filter(
        (a) => a.stack.resource === part.resource && a.quantity > 0,
      )) {
        const take = Math.min(need, a.quantity);
        if (!take) continue;
        out.push({
          stack: a.stack,
          quantity: take,
          increment,
          role: part.role,
        });
        a.quantity -= take;
        need -= take;
      }
    }
  return out;
}
function install(
  w: V7World,
  o: V7Object,
  s: V7Stack,
  increment: number,
  role: string,
  owner: string,
): Component {
  const condition = Number(
    (s.processing?.simpleShelterPart as V7Data | undefined)?.condition ?? 1,
  );
  const part = {
    ...omit(s, ['reservedFor', 'owner', 'position', 'processing']),
    increment,
    stage: PLAN[increment - 1]?.stage ?? '',
    role,
    condition,
    installedAt: w.tick,
    sourceOwner: owner,
  } as Component;
  w.stacks = w.stacks.filter((x) => x.id !== s.id);
  o.data.components = [...components(o), part];
  return part;
}
/** Removed parts become ordinary unowned ground stacks at the site, keeping their measured condition. */
function release(w: V7World, o: V7Object, part: Component): string {
  const id = v7Id(w, 'item');
  const record = omit(part, [
    'increment',
    'stage',
    'role',
    'condition',
    'installedAt',
    'sourceOwner',
  ]);
  w.stacks.push({
    ...(record as unknown as V7Stack),
    id,
    owner: null,
    position: { x: o.spatial.x, y: o.spatial.y },
    processing: {
      simpleShelterPart: {
        structure: o.id,
        component: part.id,
        role: part.role,
        condition: v7RoundNumber(part.condition),
        removedAt: w.tick,
      },
    },
  });
  return id;
}

function site(c: V7ActionContext): V7Spatial {
  const x = v7Number(c.action.args.x, 'site x'),
    y = v7Number(c.action.args.y, 'site y'),
    orientation = v7Number(
      c.action.args.orientation ?? 0,
      'orientation',
      0,
      360,
    );
  const s: V7Spatial = {
    x,
    y,
    angle: (orientation * Math.PI) / 180,
    shape: { kind: 'rectangle', width: G.site, height: G.site },
    solid: false,
    reserved: true,
    interaction: 0.65,
    entrances: [],
  };
  const problems: string[] = [];
  const points = [-1, -0.5, 0, 0.5, 1].flatMap((u) =>
    [-1, -0.5, 0, 0.5, 1].map((v) => ({
      x: x + u * Math.cos(s.angle) - v * Math.sin(s.angle),
      y: y + u * Math.sin(s.angle) + v * Math.cos(s.angle),
    })),
  );
  if (v7ShapeDistance(c.actor.position, s) > c.actor.radius + 0.65)
    problems.push('the site is beyond working reach');
  if (points.some((p) => !v7Inside(c.world, p, 0.05)))
    problems.push('part of the footprint is outside the world');
  else {
    const ground = points.map((p) => openConditions(c.world, p));
    if (ground.some((g) => g.ground !== '.'))
      problems.push('part of the footprint is not ordinary soil');
    if (
      ground.some(
        (g) => g.waterlogging > LIMITS.waterlogging || g.hazards.length,
      )
    )
      problems.push('part of the footprint is waterlogged or under a hazard');
  }
  if (
    c.world.objects.some(
      (o) =>
        (o.spatial.solid || o.spatial.reserved) &&
        v7ShapesOverlap(s, o.spatial),
    )
  )
    problems.push('the footprint overlaps a solid object or another site');
  if (
    c.world.actors.some(
      (a) =>
        a.vitals.health > 0 &&
        v7ShapesOverlap(s, {
          ...a.position,
          angle: 0,
          shape: { kind: 'circle', radius: a.radius },
          solid: true,
          interaction: 0,
          entrances: [],
        }),
    )
  )
    problems.push('a person occupies the footprint');
  if (problems.length)
    throw new Error(
      `Site check failed: ${problems.join('; ')}. Nothing was reserved.`,
    );
  return s;
}

function pause(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
  data: V7Data = {},
) {
  j.status = 'paused';
  j.reason = reason;
  c.emit(
    'simple-shelter-paused',
    `${reason} Paid progress and reserved materials are kept; nothing was spent.`,
    { ...summary(c.world, j), ...data },
    j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id] };
}

/** One paid increment after revalidating reach, site, reserved materials and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const w = c.world,
    o = w.objects.find((o) => o.id === j.target);
  if (!open(j) || !o) throw new Error('This shelter work is already settled.');
  const pending = (Array.isArray(j.pieces) ? j.pieces : []) as unknown as {
    escrow: string;
    increment: number;
    role: string;
    quantity: number;
  }[];
  if (
    pending.some(
      (p) =>
        p.increment > j.completedWork &&
        !w.stacks.some(
          (s) =>
            s.id === p.escrow &&
            s.reservedFor === j.id &&
            s.quantity === p.quantity,
        ),
    )
  ) {
    j.x = c.actor.position.x;
    j.y = c.actor.position.y;
    workStop(
      w,
      c.actor,
      j,
      'A reserved material was lost; surviving reserved materials were returned.',
      false,
    );
    o.data.workId = null;
    refresh(w, o);
    c.emit(
      'simple-shelter-failed',
      'Work stopped because a reserved material was lost; installed parts stay at the site.',
      summary(w, j),
      o.id,
    );
    sync(c.actor, j);
    return { complete: true, writes: [j.id, o.id] };
  }
  if (!v7Reach(c.actor, o.spatial))
    return pause(c, j, 'The worksite is beyond working reach.');
  const ground = openConditions(w, o.spatial);
  if (ground.waterlogging > LIMITS.waterlogging || ground.hazards.length) {
    c.emit(
      'simple-shelter-test-failed',
      'Site test failed: the ground is waterlogged or under a hazard, so posts cannot be set or held.',
      { structure: o.id, ground: v7Json(ground) },
      o.id,
    );
    return pause(c, j, 'Site test failed.');
  }
  if (
    w.actors.some(
      (a) =>
        a.id !== c.actor.id &&
        a.vitals.health > 0 &&
        v7ShapeDistance(a.position, o.spatial) < a.radius,
    )
  )
    return pause(c, j, 'Another person occupies the worksite.');
  if (c.actor.vitals.energy < 1)
    return pause(c, j, 'Not enough energy for the next work increment.', {
      requiredEnergy: 1,
    });
  const resumed = j.status === 'paused';
  if (!workPay(c, j, 1))
    throw new Error('Energy changed before the paid increment.');
  if (resumed)
    c.emit(
      'simple-shelter-resumed',
      'Unfinished shelter work resumed after revalidating site, materials and energy.',
      summary(w, j),
      o.id,
    );
  const increment = j.completedWork,
    installed = pending
      .filter((p) => p.increment === increment)
      .flatMap((p) => {
        const s = w.stacks.find((s) => s.id === p.escrow);
        return s ? [install(w, o, s, increment, p.role, c.actor.id)] : [];
      });
  refresh(w, o);
  if (increment === PLAN.length) {
    j.status = 'completed';
    j.outputs = [o.id];
    o.data.workId = null;
    commission(c, o, false);
    sync(c.actor, j);
    return { complete: true, remaining: 0, writes: [j.id, o.id] };
  }
  c.emit(
    'simple-shelter-progress',
    `Paid increment ${String(increment)} of ${String(PLAN.length)} (${PLAN[increment - 1]?.stage ?? ''}).${increment > 8 ? '' : ' A frame without roofing gives no rain protection.'}`,
    { ...summary(w, j), increment, installed: v7Json(installed) },
    o.id,
  );
  sync(c.actor, j);
  return { complete: false, remaining: j.remainingWork, writes: [j.id, o.id] };
}

function start(c: V7ActionContext): V7HandlerResult {
  const existing = workFind(c);
  if (existing && c.operation?.first === false && open(existing))
    return advance(c, existing);
  if (existing)
    throw new Error(
      'Unfinished shelter work exists; resume or cancel it first.',
    );
  if (c.operation?.first === false)
    throw new Error('The bound shelter work is already settled.');
  const spatial = site(c);
  const allocations = allocate(c, RECIPE);
  if (c.actor.vitals.energy < 1)
    throw new Error(
      'Not enough energy for the first work increment; nothing was reserved.',
    );
  const j = workCreate(c, 'build', PLAN.length);
  const o: V7Object = {
    id: v7Id(c.world, 'shelter'),
    kind: KIND,
    name: 'Simple lean-to shelter',
    spatial,
    visual: {
      component: KIND,
      color: '#8d704e',
      accent: '#cec5ac',
      label: 'Lean-to',
      state: 'unfinished',
    },
    data: {
      status: 'unfinished',
      builder: c.actor.id,
      workId: j.id,
      orientation: v7Number(c.action.args.orientation ?? 0, 'orientation'),
      components: [],
      tests: [],
    },
    createdBy: c.actor.id,
    createdAt: c.world.tick,
    revision: REVISION,
  };
  c.world.objects.push(o);
  j.target = o.id;
  const split = pieces(
    allocations,
    PLAN.map((_, i) => i + 1),
  );
  workReserve(c, j, split);
  j.pieces = split.map((p, i) => ({
    escrow: j.escrow[i] ?? '',
    increment: p.increment,
    role: p.role,
    quantity: p.quantity,
  }));
  refresh(c.world, o);
  c.emit(
    'simple-shelter-started',
    'Site check passed and the exact materials were reserved; they stay carried until each paid increment installs them.',
    {
      ...summary(c.world, j),
      siteCheck:
        'reachable, inside the world, ordinary dry soil, unobstructed and unoccupied',
    },
    o.id,
  );
  return advance(c, j);
}

function structure(c: V7ActionContext, builderOnly: boolean): V7Object {
  const id = forestResolveReference(
    c.world,
    c.actor,
    v7String(c.action.args.target, 'target'),
    'object',
  );
  const o = c.world.objects.find((o) => o.id === id && o.kind === KIND);
  if (!o) throw new Error('The target is not a simple shelter.');
  if (!v7Reach(c.actor, o.spatial))
    throw new Error('The shelter is beyond working reach.');
  if (builderOnly && o.createdBy !== c.actor.id)
    throw new Error('Only the person who built this shelter may change it.');
  if (builderOnly && o.data.workId)
    throw new Error('Construction is still open; resume or cancel it first.');
  return o;
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const o = structure(c, false);
  v7Spend(c.actor, 0.2);
  const complete = PLAN.slice(0, BUILT).every((_, i) =>
    components(o).some((p) => p.increment === i + 1),
  );
  // Reinspection reruns the coded checks: it can withdraw protection or restore it after repair.
  const status = statusOf(o);
  if (
    complete &&
    !o.data.workId &&
    (status !== 'commissioned' || !verify(c.world, o).passed) &&
    ['commissioned', 'unsafe', 'unverified'].includes(status)
  )
    commission(c, o, true);
  const occupants = c.world.actors
    .filter(
      (a) =>
        a.vitals.health > 0 && simpleShelterCovers(o, a.position, a.radius),
    )
    .map((a) => a.id);
  const value = {
    status: o.data.status ?? null,
    frameCondition: o.data.frameCondition ?? null,
    roofCondition: o.data.roofCondition ?? null,
    roofCoverage: o.data.roofCoverage ?? null,
    view: o.data.view ?? null,
    lastWeather: o.data.weather ?? null,
    occupants,
  };
  openRemember(c, {
    key: `${o.id}:shelter-condition`,
    subject: o.id,
    property: 'installed parts, condition, coverage and status',
    value,
    method: 'direct inspection',
    condition: 'Accessible condition only; nothing was repaired.',
    verified: false,
  });
  c.emit(
    'simple-shelter-inspected',
    'Shelter inspected; only accessible condition is reported and nothing is repaired.',
    { structure: o.id, ...value },
    o.id,
  );
  return { complete: true, writes: [o.id] };
}

function repair(c: V7ActionContext): V7HandlerResult {
  const o = structure(c, true),
    increment = v7Number(c.action.args.increment, 'increment', 1, BUILT),
    old = components(o).filter((p) => p.increment === increment);
  if (!Number.isInteger(increment) || !old.length)
    throw new Error('Name an installed assembly increment (1-11) to repair.');
  const allocations = allocate(c, needs(PLAN[increment - 1]?.parts ?? []));
  v7Spend(c.actor, 1);
  const before = Math.min(...old.map((p) => p.condition));
  o.data.components = components(o).filter((p) => p.increment !== increment);
  const removed = old.map((p) => release(c.world, o, p));
  const installed = pieces(allocations, [increment]).map((p) => {
    const part: V7Stack = {
      ...materialPortion(p.stack, foodTenths(p.quantity)),
      id: v7Id(c.world, 'item'),
      quantity: p.quantity,
      quantityTenths: foodTenths(p.quantity),
    };
    foodSetQuantity(
      p.stack,
      foodTenths(p.stack.quantity) - foodTenths(p.quantity),
    );
    c.world.stacks.push(part);
    return install(c.world, o, part, increment, p.role, c.actor.id);
  });
  c.world.stacks = c.world.stacks.filter((s) => s.quantity > 0);
  refresh(c.world, o);
  c.emit(
    'simple-shelter-repaired',
    'Exact replacement parts were installed and the removed parts left at the site; only the replaced condition is restored, and a structure that lost protection needs reinspection.',
    {
      structure: o.id,
      increment,
      before,
      after: Math.min(...installed.map((p) => p.condition)),
      removed,
      installed: v7Json(installed),
      energy: 1,
      status: statusOf(o),
    },
    o.id,
  );
  return { complete: true, writes: [o.id, ...removed] };
}

function dismantle(c: V7ActionContext): V7HandlerResult {
  const o = structure(c, true),
    stage = [...STAGES]
      .reverse()
      .find((s) => components(o).some((p) => p.stage === s));
  if (!stage) throw new Error('Nothing installed remains to dismantle.');
  v7Spend(c.actor, 1);
  const parts = components(o).filter((p) => p.stage === stage);
  o.data.components = components(o).filter((p) => p.stage !== stage);
  const returned = parts.map((p) => release(c.world, o, p));
  o.data.status = 'unfinished';
  const left = components(o).length;
  if (!left) c.world.objects = c.world.objects.filter((x) => x.id !== o.id);
  else refresh(c.world, o);
  c.emit(
    'simple-shelter-dismantled',
    'One installed stage was taken apart; every part was returned to the ground at the site with its measured condition. Nothing is refunded.',
    {
      structure: o.id,
      stage,
      returned,
      conditions: parts.map((p) => v7RoundNumber(p.condition)),
      remainingParts: left,
      energy: 1,
    },
    left ? o.id : null,
  );
  return { complete: true, writes: [o.id, ...returned] };
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c);
  if (!j || !open(j))
    throw new Error('No unfinished personal shelter work to cancel.');
  const o = c.world.objects.find((o) => o.id === j.target);
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  workStop(
    c.world,
    c.actor,
    j,
    'Cancelled; uninstalled reserved materials returned once. Spent energy and time are not refunded.',
    false,
  );
  if (o && components(o).length) {
    o.data.workId = null;
    refresh(c.world, o);
  } else if (o) c.world.objects = c.world.objects.filter((x) => x.id !== o.id);
  c.emit(
    'simple-shelter-cancelled',
    'Shelter work cancelled; installed parts stay as a visibly unfinished structure without protection.',
    {
      ...summary(c.world, j),
      returned: j.escrow.filter((id) =>
        c.world.stacks.some((s) => s.id === id && s.owner === c.actor.id),
      ),
    },
    j.target,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'start') return start(c);
  if (mode === 'resume') {
    const j = workFind(c);
    if (!j || !open(j))
      throw new Error('No unfinished personal shelter work to resume.');
    return advance(c, j);
  }
  if (mode === 'cancel') return cancel(c);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'repair') return repair(c);
  if (mode === 'dismantle') return dismantle(c);
  throw new Error('Unknown shelter mode.');
}

/** Installed parts suffer the reused lean-to weather wear; a commissioned structure that loosens loses protection. */
function weather(w: V7World) {
  for (const j of collectiveJobs(w, ID).filter(open)) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a) continue;
    for (const s of w.stacks.filter((s) => s.reservedFor === j.id))
      s.position = { ...a.position };
    if (j.status === 'active' && j.lastPaid < w.tick) {
      j.status = 'paused';
      j.reason =
        'Not worked this round; paid progress and reserved materials are kept.';
      forestEvent(
        w,
        'simple-shelter-paused',
        'Shelter work paused because it was not worked this round.',
        a.position,
        a.id,
        summary(w, j),
        j.id,
      );
    }
    sync(a, j);
  }
  for (const o of w.objects.filter(
    (o) => o.kind === KIND && components(o).length,
  )) {
    const climate = forestClimate(w, o.spatial),
      rain = climate.rain ?? 0,
      wind = climate.wind ?? 0,
      wear = WEAR.base + WEAR.rain * rain + WEAR.wind * wind,
      before = Math.min(...components(o).map((p) => p.condition));
    for (const p of components(o))
      p.condition = Math.max(0, p.condition - wear);
    o.data.weather = { tick: w.tick, rain, wind, wear: v7RoundNumber(wear) };
    refresh(w, o);
    const after = Math.min(...components(o).map((p) => p.condition));
    if (o.data.status === 'commissioned' && after < SOUND) {
      o.data.status = 'unsafe';
      refresh(w, o);
      forestEvent(
        w,
        'simple-shelter-damaged',
        'Weather wear loosened parts below the sound condition; the shelter is unsafe and gives no protection until repaired and reinspected.',
        o.spatial,
        null,
        { structure: o.id, condition: v7RoundNumber(after) },
        o.id,
      );
    } else if (Math.floor(before * 10) !== Math.floor(after * 10))
      forestEvent(
        w,
        'simple-shelter-deteriorated',
        `Weather wear reduced the weakest installed part to condition ${after.toFixed(2)}.`,
        o.spatial,
        null,
        {
          structure: o.id,
          condition: v7RoundNumber(after),
          wear: v7RoundNumber(wear),
        },
        o.id,
      );
  }
}

export const LONG_SIMPLE_SHELTER: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex15',
  dependencies: ['foundation-open@1'],
  description:
    'A small hand-assembled braced lean-to from owned branches, vines and bark, built in paid increments, with real rain and wind shielding for one person, weather wear, inspection, repair and dismantling.',
  reuse: {
    experiment:
      'ex11 weather-lean-to@1 (wear law, 6-bark roof); ex10 resting-shelter@1 (wind-driven rain direction, ray-against-roof coverage); ex14 weather-barrier@1 (site checks, first release resolved here); ex15 food-preparation@1 (paid-work pattern)',
    source:
      'collective-work.ts (escrow, paid work, stop); material-lots.ts; open-physical.ts (ground conditions and the constitutive values probe reveals); forest-climate.ts (rain, wind and the outdoor exposure chill); open-foundation.ts (personal records); long-shelter-exposure.ts (physiology hook)',
    description:
      'Implementation reuse only; no earlier ability, structure or mastery is inherited. Shielding removes part of the existing outdoor rain and wind chill through the existing body-temperature update, using the open-refuge convention that wind-driven rain arrives from +x.',
  },
  abilities: [
    {
      id: ID,
      name: 'Assemble and maintain a simple shelter',
      function:
        'Build a low single-person braced lean-to with a sloping bark roof from owned branches, vines and bark at a clear site; inspect, repair or dismantle it, or resume or cancel unfinished work.',
      equivalence: 'shelter:hand-assembled-braced-lean-to:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: [
              'start',
              'resume',
              'cancel',
              'inspect',
              'repair',
              'dismantle',
            ],
          },
          x: { type: 'number' },
          y: { type: 'number' },
          orientation: { type: 'number', minimum: 0, maximum: 360 },
          materials: {
            type: 'array',
            items: v7ObjectSchema({
              itemId: { type: 'string' },
              quantity: { type: 'number', minimum: 1 },
            }),
          },
          target: { type: 'string' },
          increment: { type: 'number', minimum: 1, maximum: BUILT },
          processId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: { target: 'optional-exact-visible' },
      prerequisites: [],
      learning: 4,
      costs:
        'Study: 4 rounds. Start: x, y, orientation (degrees; 0 points the low roof edge toward increasing x, where wind comes from) and materials as exact owned, untreated whole units totalling 13 branch, 4 vine and 6 bark; stand within reach of a 2 m x 2 m footprint of ordinary dry soil that is inside the world, unobstructed and unoccupied. Twelve paid increments, one round and 1 energy each: 2 posts, 3 ridge and braces, 3 ribs and binding, 3 roofing courses, 1 final check; start pays the first and the same action continues each round. Resume pays the next increment of the unfinished work; cancel takes one round and no energy. Inspect: target in reach, one round, 0.2 energy. Repair (builder only): target, increment 1-11 and the exact replacement units of that increment, one round, 1 energy. Dismantle (builder only): target, one round and 1 energy per stage, removing the last installed stage. Gathering, travel and probe tests are separate actions with their own costs.',
      effects:
        'Reserved materials stay carried and owned until each paid increment moves them into the structure as installed parts with the same quantity, origin and age; nothing is created or used up. After the final stability, binding, roof-load and runoff checks the shelter is commissioned: a 2 m x 1 m covered floor under a 1.2 m ridge and a roof sloping about 50 degrees. While exactly one person lies wholly on that floor in rain and wind up to 0.8, it removes up to 50% of the rain part and up to 35% of the wind part of the existing outdoor exposure chill, scaled by roof condition, by the share of the body under the roof along the wind-driven rain, and for wind by how directly the low edge faces the wind; wind entering the open side, stronger weather, water pooling on the floor or a second person gives no protection. Air temperature, hunger, nutrition and rest are unchanged, and copies never stack. A frame without its three roofing courses gives no rain protection. Each round installed parts wear by 0.0005 + 0.002 x rain + 0.002 x wind; a part below condition 0.5 makes a commissioned shelter unsafe with no protection until repair and a passing reinspection. Repair restores only the replaced parts; removed and dismantled parts return to the ground at the site with their condition and can be reused at that condition. Work not continued in a round pauses; a lost reserved material stops it. Cancel returns uninstalled materials once and leaves installed parts as an unfinished structure; death stops the work, drops uninstalled materials where the person died and leaves installed parts. No reward, mastery or refund.',
      handler: 'long.simple-shelter',
      revision: REVISION,
      authored: false,
      // The commissioning event carries no qualified flag: a finished structure earns no milestone.
      practiceEvidence: 'simple-shelter-commissioned',
      dependencies: {
        abilities: [],
        resources: ['branch', 'vine', 'bark'],
        knowledge: [],
      },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Paid work in twelve one-round increments whose exact job, reserved pieces, installed parts and site persist across interruption; resume pays only the next increment after revalidation; completion, cancellation, failure and death settle once. Inspect, repair and dismantle are single rounds.',
      },
    },
  ],
  handlers: { 'long.simple-shelter': execute },
  processes: {},
  visualComponents: [KIND],
  events: [
    'simple-shelter-started',
    'simple-shelter-progress',
    'simple-shelter-paused',
    'simple-shelter-resumed',
    'simple-shelter-cancelled',
    'simple-shelter-failed',
    'simple-shelter-test-failed',
    'simple-shelter-commissioned',
    'simple-shelter-inspected',
    'simple-shelter-deteriorated',
    'simple-shelter-damaged',
    'simple-shelter-repaired',
    'simple-shelter-dismantled',
    'simple-shelter-exposure-measured',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: weather,
  onDeath(w, a) {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && open(j),
    )) {
      const o = w.objects.find((o) => o.id === j.target);
      j.x = a.position.x;
      j.y = a.position.y;
      workStop(
        w,
        a,
        j,
        'Performer died; uninstalled materials were left on the ground once.',
        true,
      );
      if (o && components(o).length) {
        o.data.workId = null;
        refresh(w, o);
      } else if (o) w.objects = w.objects.filter((x) => x.id !== o.id);
      forestEvent(
        w,
        'simple-shelter-failed',
        'Shelter work stopped by death; installed parts stay at the site.',
        a.position,
        a.id,
        summary(w, j),
        j.target,
      );
      sync(a, j);
    }
  },
};
