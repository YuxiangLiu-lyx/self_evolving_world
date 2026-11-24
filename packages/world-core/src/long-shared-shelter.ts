import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Point,
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
import { openConditions } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workCreate,
  workFind,
  workPay,
  workReserve,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import {
  SIMPLE_SHELTER_GEOMETRY as G,
  SIMPLE_SHELTER_LIMITS as LIMITS,
} from './long-shelter-exposure.js';
import {
  SIMPLE_SHELTER_BUILT as BUILT,
  SIMPLE_SHELTER_PLAN as PLAN,
  SIMPLE_SHELTER_SOUND as SOUND,
  SIMPLE_SHELTER_STAGES as STAGES,
  SIMPLE_SHELTER_WEAR as WEAR,
  simpleShelterAllocate as allocate,
  simpleShelterComponents as components,
  simpleShelterInstall as install,
  simpleShelterNeeds as needs,
  simpleShelterPieces as pieces,
  simpleShelterRefresh,
  simpleShelterRelease as release,
  simpleShelterVerify,
} from './long-simple-shelter.js';
import {
  SHARED_SHELTER_KIND as KIND,
  SHARED_SHELTER_REVISION as REVISION,
  sharedBayOccupants,
  sharedBayShield,
} from './long-shared-shelter-exposure.js';

const ID = 'shared-shelter';
const STATE = 'long:work:shared-shelter';
/** Paid increments per bay: the inherited simple-shelter plan, unchanged. */
const PER_BAY = PLAN.length;
const BAYS = { min: 2, max: 4 };
/** Depth of the clear approach strip in front of the shared open side (local -x), in metres. */
const APPROACH = 1;
/** Per-bay recipe of the inherited plan: 13 branch, 4 vine and 6 bark. */
const PER_BAY_RECIPE = needs(PLAN.flatMap((i) => i.parts));
const recipe = (bays: number) =>
  Object.fromEntries(
    Object.entries(PER_BAY_RECIPE).map(([k, n]) => [k, n * bays]),
  );

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const statusOf = (o: V7Object) =>
  typeof o.data.status === 'string' ? o.data.status : 'unfinished';
const bayIds = (j: CollectiveWork) =>
  (Array.isArray(j.bays) ? j.bays : []).filter(
    (x): x is string => typeof x === 'string',
  );
const bayNo = (o: V7Object) => Number(o.data.bay ?? 0);
const structureOf = (o: V7Object) =>
  typeof o.data.structure === 'string' ? o.data.structure : '';
const siblings = (w: V7World, structure: unknown) =>
  w.objects
    .filter((o) => o.kind === KIND && o.data.structure === structure)
    .sort((a, b) => Number(a.data.bay) - Number(b.data.bay));
/** Global increment g (1-based) belongs to bay floor((g - 1) / 12) as its local increment. */
const locate = (g: number) => ({
  bay: Math.floor((g - 1) / PER_BAY),
  increment: ((g - 1) % PER_BAY) + 1,
});

/** World point at local offsets (u across the bay, v along the ridge) from a centre. */
function at(s: { x: number; y: number; angle: number }, u: number, v: number) {
  return {
    x: s.x + u * Math.cos(s.angle) - v * Math.sin(s.angle),
    y: s.y + u * Math.sin(s.angle) + v * Math.cos(s.angle),
  };
}
function rect(
  c: V7Point,
  angle: number,
  width: number,
  height: number,
  reserved: boolean,
): V7Spatial {
  return {
    x: c.x,
    y: c.y,
    angle,
    shape: { kind: 'rectangle', width, height },
    solid: false,
    ...(reserved ? { reserved: true } : {}),
    interaction: 0.65,
    entrances: [],
  };
}
/** Sample points every 0.5 m over a rectangle, corners included (the simple-shelter site density). */
function grid(s: V7Spatial): V7Point[] {
  if (s.shape.kind !== 'rectangle') return [];
  const steps = (size: number) =>
    Array.from(
      { length: Math.round(size / 0.5) + 1 },
      (_, i) => -size / 2 + i * 0.5,
    );
  const height = s.shape.height;
  return steps(s.shape.width).flatMap((u) =>
    steps(height).map((v) => at(s, u, v)),
  );
}
/** Adjacent 2 m x 2 m bays along the ridge, sharing one open side at local -x. */
function layout(x: number, y: number, angle: number, bays: number) {
  const centre = { x, y, angle },
    length = G.site * bays;
  return {
    footprint: rect({ x, y }, angle, G.site, length, true),
    bays: Array.from({ length: bays }, (_, i) =>
      rect(
        at(centre, 0, (i - (bays - 1) / 2) * G.site),
        angle,
        G.site,
        G.site,
        true,
      ),
    ),
    approach: rect(
      at(centre, -(G.site + APPROACH) / 2, 0),
      angle,
      APPROACH,
      length,
      false,
    ),
  };
}
const bayApproach = (o: V7Object) =>
  rect(
    at(o.spatial, -(G.site + APPROACH) / 2, 0),
    o.spatial.angle,
    APPROACH,
    G.site,
    false,
  );
/** The open side must stay walkable, inside the world, free of solid objects and wider than every living body. */
function approachProblems(w: V7World, s: V7Spatial): string[] {
  const problems: string[] = [],
    points = grid(s);
  if (points.some((p) => !v7Inside(w, p, 0.05)))
    problems.push('the open approach leaves the world');
  else if (points.some((p) => openConditions(w, p).ground === '~'))
    problems.push('the open approach crosses open water');
  if (
    w.objects.some(
      (o) =>
        o.spatial.solid && v7ShapesOverlap({ ...s, solid: true }, o.spatial),
    )
  )
    problems.push('a solid object blocks the open approach');
  const widest = Math.max(
    0,
    ...w.actors.filter((a) => a.vitals.health > 0).map((a) => 2 * a.radius),
  );
  if (widest > APPROACH)
    problems.push('the open approach is narrower than a person');
  return problems;
}

/** Inherited condition and drawing metadata, plus the structure, bay, approach and occupancy fields. */
function refresh(w: V7World, o: V7Object) {
  simpleShelterRefresh(w, o);
  const installed = new Set(components(o).map((p) => p.increment)),
    view =
      o.data.view &&
      typeof o.data.view === 'object' &&
      !Array.isArray(o.data.view)
        ? o.data.view
        : {};
  o.visual.label = `Bay ${String(bayNo(o))}`;
  o.data.view = {
    ...view,
    kind: 'braced lean-to bay',
    structure: o.data.structure ?? null,
    bay: o.data.bay ?? null,
    bays: siblings(w, o.data.structure).map((b) => b.id),
    structureFootprint: o.data.structureFootprint ?? null,
    openApproach: o.data.approach ?? null,
    // Assembly increments 1-11 that hold installed parts; the twelfth is the final check.
    installedMask: PLAN.slice(0, BUILT).map((_, i) => installed.has(i + 1)),
    frameCondition: o.data.frameCondition ?? null,
    roofCondition: o.data.roofCondition ?? null,
    occupants: o.data.occupants ?? [],
    protectedOccupant: o.data.protectedOccupant ?? null,
  };
}

/** The inherited stability, binding, roof-load and runoff checks for this bay, plus its open approach. */
function verify(w: V7World, o: V7Object) {
  const check = simpleShelterVerify(w, o),
    blocked = approachProblems(w, bayApproach(o));
  const supportedLoad = Number(
    (check.tests[2]?.measured as V7Data | undefined)?.supportedLoad ?? 0,
  );
  return {
    passed: check.passed && !blocked.length,
    supportedLoad,
    tests: v7Json([
      ...check.tests,
      {
        test: 'open approach',
        passed: !blocked.length,
        measured: { depth: APPROACH, length: G.site, problems: blocked },
      },
    ]),
  };
}

function commission(c: V7ActionContext, o: V7Object, again: boolean) {
  const check = verify(c.world, o);
  o.data.tests = [
    ...(Array.isArray(o.data.tests) ? o.data.tests : []),
    {
      tick: c.world.tick,
      by: c.actor.id,
      passed: check.passed,
      tests: check.tests,
    },
  ].slice(-6);
  if (check.passed) {
    o.data.status = 'commissioned';
    o.data.limits = v7Json(LIMITS);
    o.data.supportedLoad = check.supportedLoad;
    refresh(c.world, o);
    c.emit(
      'shared-shelter-bay-commissioned',
      `Bay ${String(bayNo(o))}: stability, binding, roof-load, runoff and open-approach checks passed${again ? ' on reinspection' : ''}; one person wholly on this bay floor is partly shielded from rain and wind within the light-weather limits, independently of the other bays.`,
      {
        structure: o.data.structure ?? null,
        bay: o.id,
        index: o.data.bay ?? null,
        tests: check.tests,
        limits: v7Json(LIMITS),
        supportedLoad: check.supportedLoad,
        again,
      },
      o.id,
    );
  } else {
    if (o.data.status === 'commissioned' || !again)
      o.data.status = again ? 'unsafe' : 'unverified';
    refresh(c.world, o);
    c.emit(
      'shared-shelter-test-failed',
      `Bay ${String(bayNo(o))}: a structural, runoff or approach check failed; this bay gives no protection until repaired and reinspected.`,
      {
        structure: o.data.structure ?? null,
        bay: o.id,
        tests: check.tests,
        status: statusOf(o),
      },
      o.id,
    );
  }
  return check.passed;
}

function summary(w: V7World, j: CollectiveWork): V7Data {
  const ids = bayIds(j),
    next = j.completedWork < j.initialWork ? locate(j.completedWork + 1) : null;
  return {
    workId: j.id,
    structure: j.target,
    bays: ids,
    status: j.status,
    completedIncrements: j.completedWork,
    totalIncrements: j.initialWork,
    remaining: j.remainingWork,
    paidEnergy: v7RoundNumber(j.paidEnergy),
    nextBay: next ? (ids[next.bay] ?? null) : null,
    nextStage: next ? (PLAN[next.increment - 1]?.stage ?? null) : null,
    site: j.site ?? null,
    reserved: v7Json(j.sources),
    bayStatus: ids.map((id) => {
      const o = w.objects.find((o) => o.id === id);
      return {
        bay: id,
        status: o ? statusOf(o) : 'removed',
        installedIncrements: o ? (o.data.installedIncrements ?? []) : [],
      };
    }),
  };
}
function sync(a: V7Actor, j: CollectiveWork) {
  a.extensionState[STATE] = v7Json(j);
}
interface Piece {
  escrow: string;
  bay: number;
  increment: number;
  role: string;
  quantity: number;
}
const pending = (j: CollectiveWork) =>
  (Array.isArray(j.pieces) ? j.pieces : []) as unknown as Piece[];

/** The inherited per-increment split, applied bay after bay to what earlier bays left. */
function split(
  allocations: { stack: V7Stack; quantity: number }[],
  bays: number,
) {
  const left = allocations.map((a) => ({ ...a })),
    out: {
      stack: V7Stack;
      quantity: number;
      bay: number;
      increment: number;
      role: string;
    }[] = [];
  for (let bay = 0; bay < bays; bay++)
    for (const p of pieces(
      left.filter((a) => a.quantity > 0),
      PLAN.map((_, i) => i + 1),
    )) {
      out.push({ ...p, bay });
      const source = left.find((a) => a.stack === p.stack);
      if (source) source.quantity -= p.quantity;
    }
  return out;
}

function site(c: V7ActionContext, bays: number) {
  const x = v7Number(c.action.args.x, 'site x'),
    y = v7Number(c.action.args.y, 'site y'),
    orientation = v7Number(
      c.action.args.orientation ?? 0,
      'orientation',
      0,
      360,
    );
  const plan = layout(x, y, (orientation * Math.PI) / 180, bays),
    problems: string[] = [];
  const first = plan.bays[0];
  if (
    !first ||
    v7ShapeDistance(c.actor.position, first) > c.actor.radius + 0.65
  )
    problems.push('the site is beyond working reach');
  const points = grid(plan.footprint);
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
        v7ShapesOverlap(plan.footprint, o.spatial),
    )
  )
    problems.push('the footprint overlaps a solid object or another site');
  if (
    c.world.actors.some(
      (a) =>
        a.vitals.health > 0 &&
        v7ShapesOverlap(plan.footprint, {
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
  problems.push(...approachProblems(c.world, plan.approach));
  if (problems.length)
    throw new Error(
      `Site check failed: ${problems.join('; ')}. Nothing was reserved.`,
    );
  return { ...plan, orientation };
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
    'shared-shelter-paused',
    `${reason} Paid progress and reserved materials are kept; nothing was spent.`,
    { ...summary(c.world, j), ...data },
    j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id] };
}

/** One paid increment of the next unfinished bay after revalidating reach, site, reserved materials and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const w = c.world,
    ids = bayIds(j),
    next = locate(j.completedWork + 1),
    o = w.objects.find((o) => o.id === ids[next.bay]);
  if (!open(j) || !o) throw new Error('This shelter work is already settled.');
  const queued = pending(j);
  if (
    queued.some(
      (p) =>
        p.bay * PER_BAY + p.increment > j.completedWork &&
        !w.stacks.some(
          (s) =>
            s.id === p.escrow &&
            s.reservedFor === j.id &&
            s.quantity === p.quantity,
        ),
    )
  ) {
    settle(
      w,
      c.actor,
      j,
      'A reserved material was lost; surviving reserved materials were returned.',
      false,
    );
    c.emit(
      'shared-shelter-failed',
      'Work stopped because a reserved material was lost; installed parts stay at the site.',
      summary(w, j),
      j.target,
    );
    sync(c.actor, j);
    return { complete: true, writes: [j.id, ...ids] };
  }
  if (!v7Reach(c.actor, o.spatial))
    return pause(c, j, `Bay ${String(next.bay + 1)} is beyond working reach.`);
  const ground = openConditions(w, o.spatial);
  if (ground.waterlogging > LIMITS.waterlogging || ground.hazards.length) {
    c.emit(
      'shared-shelter-test-failed',
      'Site test failed: the ground is waterlogged or under a hazard, so posts cannot be set or held.',
      { structure: j.target, bay: o.id, ground: v7Json(ground) },
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
    return pause(c, j, 'Another person occupies the bay being built.');
  if (c.actor.vitals.energy < 1)
    return pause(c, j, 'Not enough energy for the next work increment.', {
      requiredEnergy: 1,
    });
  const resumed = j.status === 'paused';
  if (!workPay(c, j, 1))
    throw new Error('Energy changed before the paid increment.');
  if (resumed)
    c.emit(
      'shared-shelter-resumed',
      'Unfinished shelter work resumed after revalidating site, materials and energy.',
      summary(w, j),
      o.id,
    );
  const g = j.completedWork,
    { increment } = locate(g),
    installed = queued
      .filter((p) => p.bay === next.bay && p.increment === increment)
      .flatMap((p) => {
        const s = w.stacks.find((s) => s.id === p.escrow);
        return s ? [install(w, o, s, increment, p.role, c.actor.id)] : [];
      });
  refresh(w, o);
  if (increment === PER_BAY) {
    // Each bay is checked and commissioned on its own final increment.
    o.data.workId = null;
    commission(c, o, false);
    if (g === j.initialWork) {
      j.status = 'completed';
      j.outputs = ids.filter((id) => w.objects.some((x) => x.id === id));
      sync(c.actor, j);
      return { complete: true, remaining: 0, writes: [j.id, ...ids] };
    }
    sync(c.actor, j);
    return {
      complete: false,
      remaining: j.remainingWork,
      writes: [j.id, ...ids],
    };
  }
  c.emit(
    'shared-shelter-progress',
    `Paid increment ${String(g)} of ${String(j.initialWork)} (bay ${String(next.bay + 1)}, ${PLAN[increment - 1]?.stage ?? ''}).${increment > 8 ? '' : ' A frame without roofing gives no rain protection.'}`,
    {
      ...summary(w, j),
      increment: g,
      bay: o.id,
      bayIncrement: increment,
      installed: v7Json(installed),
    },
    o.id,
  );
  sync(c.actor, j);
  return {
    complete: false,
    remaining: j.remainingWork,
    writes: [j.id, ...ids],
  };
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
  const count = c.action.args.bays ?? BAYS.min;
  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < BAYS.min ||
    count > BAYS.max
  )
    throw new Error(
      'Name a whole number of 2-4 bays (one bay is the simple shelter); nothing was reserved.',
    );
  const plan = site(c, count);
  const allocations = allocate(c, recipe(count));
  if (c.actor.vitals.energy < 1)
    throw new Error(
      'Not enough energy for the first work increment; nothing was reserved.',
    );
  const j = workCreate(c, 'build', PER_BAY * count);
  const structure = v7Id(c.world, 'structure');
  const footprint = {
    x: plan.footprint.x,
    y: plan.footprint.y,
    length: G.site * count,
    depth: G.site,
    orientation: plan.orientation,
  };
  const approach = {
    side: 'open ridge side (local -x)',
    x: v7RoundNumber(plan.approach.x),
    y: v7RoundNumber(plan.approach.y),
    depth: APPROACH,
    length: G.site * count,
  };
  const bays = plan.bays.map((spatial, i): V7Object => ({
    id: v7Id(c.world, 'shelter'),
    kind: KIND,
    name: `Shared lean-to bay ${String(i + 1)} of ${String(count)}`,
    spatial,
    // Reuses the simple-shelter drawing: footprint, ridge and installed roof courses, dashed until commissioned.
    visual: {
      component: 'simple-shelter',
      color: '#8d704e',
      accent: '#cec5ac',
      label: `Bay ${String(i + 1)}`,
      state: 'unfinished',
    },
    data: {
      status: 'unfinished',
      builder: c.actor.id,
      workId: j.id,
      structure,
      bay: i + 1,
      orientation: plan.orientation,
      structureFootprint: footprint,
      approach,
      components: [],
      tests: [],
      occupants: [],
      protectedOccupant: null,
    },
    createdBy: c.actor.id,
    createdAt: c.world.tick,
    revision: REVISION,
  }));
  c.world.objects.push(...bays);
  j.target = structure;
  j.bays = bays.map((b) => b.id);
  j.site = { ...footprint };
  const parts = split(allocations, count);
  workReserve(
    c,
    j,
    parts.map((p) => ({ stack: p.stack, quantity: p.quantity })),
  );
  j.pieces = parts.map((p, i) => ({
    escrow: j.escrow[i] ?? '',
    bay: p.bay,
    increment: p.increment,
    role: p.role,
    quantity: p.quantity,
  }));
  for (const b of bays) refresh(c.world, b);
  c.emit(
    'shared-shelter-started',
    `Site check passed for ${String(count)} adjacent bays sharing one open side, and the exact materials were reserved; they stay carried until each paid increment installs them.`,
    {
      ...summary(c.world, j),
      siteCheck:
        'reachable, inside the world, ordinary dry soil, unobstructed and unoccupied, with a clear walkable approach along the shared open side',
      approach,
    },
    structure,
  );
  return advance(c, j);
}

function target(c: V7ActionContext, builderOnly: boolean): V7Object {
  const id = forestResolveReference(
    c.world,
    c.actor,
    v7String(c.action.args.target, 'target'),
    'object',
  );
  const o = c.world.objects.find((o) => o.id === id && o.kind === KIND);
  if (!o) throw new Error('The target is not a shared shelter bay.');
  if (!v7Reach(c.actor, o.spatial))
    throw new Error('The bay is beyond working reach.');
  if (builderOnly && o.createdBy !== c.actor.id)
    throw new Error('Only the person who built this shelter may change it.');
  if (builderOnly && o.data.workId)
    throw new Error(
      'Construction of this bay is still open; resume or cancel it first.',
    );
  return o;
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const o = target(c, false);
  v7Spend(c.actor, 0.2);
  const all = siblings(c.world, o.data.structure),
    reached = all.filter((b) => v7Reach(c.actor, b.spatial));
  for (const b of reached) {
    const complete = PLAN.slice(0, BUILT).every((_, i) =>
        components(b).some((p) => p.increment === i + 1),
      ),
      status = statusOf(b);
    // Reinspection reruns the coded checks per bay: it can withdraw protection or restore it after repair.
    if (
      complete &&
      !b.data.workId &&
      ['commissioned', 'unsafe', 'unverified'].includes(status) &&
      (status !== 'commissioned' || !verify(c.world, b).passed)
    )
      commission(c, b, true);
  }
  const value = {
    structure: o.data.structure ?? null,
    bays: reached.map((b) => ({
      bay: b.id,
      index: b.data.bay ?? null,
      status: b.data.status ?? null,
      frameCondition: b.data.frameCondition ?? null,
      roofCondition: b.data.roofCondition ?? null,
      roofCoverage: b.data.roofCoverage ?? null,
      installedIncrements: b.data.installedIncrements ?? [],
      lastWeather: b.data.weather ?? null,
      occupants: sharedBayOccupants(c.world, b).map((a) => ({
        id: a.id,
        x: a.position.x,
        y: a.position.y,
      })),
    })),
    outOfReach: all.filter((b) => !reached.includes(b)).map((b) => b.id),
  };
  openRemember(c, {
    key: `${structureOf(o)}:shared-shelter-condition`,
    subject: o.id,
    property:
      'installed parts, condition, coverage, status and occupancy of each bay in reach',
    value,
    method: 'direct inspection',
    condition: 'Accessible condition only; nothing was repaired.',
    verified: false,
  });
  c.emit(
    'shared-shelter-inspected',
    'Shelter bays in reach inspected; only accessible condition is reported and nothing is repaired.',
    value,
    o.id,
  );
  return { complete: true, writes: all.map((b) => b.id) };
}

function repair(c: V7ActionContext): V7HandlerResult {
  const o = target(c, true),
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
    'shared-shelter-repaired',
    `Bay ${String(bayNo(o))}: exact replacement parts were installed and the removed parts left at the site; only the replaced condition is restored, and a bay that lost protection needs reinspection.`,
    {
      structure: o.data.structure ?? null,
      bay: o.id,
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
  const o = target(c, true),
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
  for (const b of siblings(c.world, o.data.structure)) refresh(c.world, b);
  c.emit(
    'shared-shelter-dismantled',
    `Bay ${String(bayNo(o))}: one installed stage was taken apart; every part was returned to the ground at the bay with its measured condition. Other bays are untouched and nothing is refunded.`,
    {
      structure: o.data.structure ?? null,
      bay: o.id,
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

/** Settles open work once: uninstalled reservations return (or drop at death); installed bays stay. */
function settle(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  reason: string,
  ground: boolean,
) {
  j.x = a.position.x;
  j.y = a.position.y;
  workStop(w, a, j, reason, ground);
  for (const b of siblings(w, j.target)) {
    if (b.data.workId === j.id) b.data.workId = null;
    if (!components(b).length)
      w.objects = w.objects.filter((x) => x.id !== b.id);
  }
  for (const b of siblings(w, j.target)) refresh(w, b);
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c);
  if (!j || !open(j))
    throw new Error('No unfinished personal shelter work to cancel.');
  settle(
    c.world,
    c.actor,
    j,
    'Cancelled; uninstalled reserved materials returned once. Spent energy and time are not refunded.',
    false,
  );
  c.emit(
    'shared-shelter-cancelled',
    'Shelter work cancelled; installed parts stay as visibly unfinished bays without protection, and bays already commissioned stay as they are.',
    {
      ...summary(c.world, j),
      returned: j.escrow.filter((id) =>
        c.world.stacks.some((s) => s.id === id && s.owner === c.actor.id),
      ),
    },
    j.target,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow, ...bayIds(j)] };
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

/** The inherited wear law per bay, plus each bay's actual occupants and whether its protection checks pass. */
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
        'shared-shelter-paused',
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
    const after = Math.min(...components(o).map((p) => p.condition));
    if (o.data.status === 'commissioned' && after < SOUND) {
      o.data.status = 'unsafe';
      forestEvent(
        w,
        'shared-shelter-damaged',
        `Bay ${String(bayNo(o))}: weather wear loosened parts below the sound condition; this bay is unsafe and gives no protection until repaired and reinspected. Other bays are unaffected.`,
        o.spatial,
        null,
        {
          structure: o.data.structure ?? null,
          bay: o.id,
          condition: v7RoundNumber(after),
        },
        o.id,
      );
    } else if (Math.floor(before * 10) !== Math.floor(after * 10))
      forestEvent(
        w,
        'shared-shelter-deteriorated',
        `Bay ${String(bayNo(o))}: weather wear reduced the weakest installed part to condition ${after.toFixed(2)}.`,
        o.spatial,
        null,
        {
          structure: o.data.structure ?? null,
          bay: o.id,
          condition: v7RoundNumber(after),
          wear: v7RoundNumber(wear),
        },
        o.id,
      );
    const people = sharedBayOccupants(w, o),
      previous = (Array.isArray(o.data.occupants) ? o.data.occupants : [])
        .map((x) =>
          x &&
          typeof x === 'object' &&
          !Array.isArray(x) &&
          typeof x.id === 'string'
            ? x.id
            : '',
        )
        .join(',');
    const shield = people[0]
      ? sharedBayShield(w, o, people[0], rain, wind)
      : null;
    o.data.occupants = people.map((a) => ({
      id: a.id,
      x: a.position.x,
      y: a.position.y,
    }));
    o.data.protectedOccupant =
      people.length === 1 &&
      shield &&
      !shield.withheld &&
      (shield.rainShield > 0 || shield.windShield > 0)
        ? (people[0]?.id ?? null)
        : null;
    refresh(w, o);
    if (previous !== people.map((a) => a.id).join(','))
      forestEvent(
        w,
        'shared-shelter-occupancy',
        `Bay ${String(bayNo(o))} floor now holds ${people.length ? people.map((a) => a.id).join(' and ') : 'nobody'}${o.data.protectedOccupant ? '; its protection checks pass' : people.length ? `; no protection: ${shield?.withheld ?? 'nothing to shield'}` : ''}.`,
        o.spatial,
        null,
        {
          structure: o.data.structure ?? null,
          bay: o.id,
          occupants: v7Json(o.data.occupants),
          protectedOccupant: o.data.protectedOccupant,
          withheld: shield?.withheld ?? null,
          status: statusOf(o),
        },
        o.id,
      );
  }
}

export const LONG_SHARED_SHELTER: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex15',
  dependencies: ['foundation-open@1', 'simple-shelter@1'],
  description:
    'Two to four adjacent, independently braced lean-to bays sharing one open side, each assembled with the simple-shelter plan, checked and commissioned separately, and protecting one person per bay.',
  reuse: {
    experiment:
      'ex15 simple-shelter@1 (staged assembly plan, per-increment material split, provenance-keeping installation and removal, stability, binding, roof-load and runoff checks, wear law, roof-ray coverage and shielding law, site checks, drawing); ex15 food-preparation@1 (paid-work pattern)',
    source:
      'long-simple-shelter.ts (plan, allocation, split, install, release, refresh, checks, wear constants); long-shelter-exposure.ts (geometry, limits, floor test, roof ray, simple-shelter exposure for no stacking); collective-work.ts (escrow, paid work, stop); open-physical.ts; forest-climate.ts; open-foundation.ts (personal records)',
    description:
      'An occupancy and composition extension of simple-shelter@1, not a new construction method: each bay is one inherited lean-to with its own parts, checks, condition and single-person floor. No earlier ability, structure or mastery is inherited.',
  },
  abilities: [
    {
      id: ID,
      name: 'Assemble and maintain a multi-bay rain shelter',
      function:
        'Build two to four adjacent, independently braced lean-to bays reached from one shared open side, from owned branches, vines and bark at a clear site; each bay shelters one person. Inspect, repair or dismantle bays, or resume or cancel unfinished work.',
      equivalence:
        'shelter:hand-assembled-braced-lean-to-bays:shared-open-side:1',
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
          bays: { type: 'number', minimum: BAYS.min, maximum: BAYS.max },
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
        "Study: 4 rounds. Start: x, y (the centre of the whole footprint), orientation (degrees; 0 points every low roof edge toward increasing x, where wind comes from, and the shared open side toward decreasing x), bays (2-4, default 2) and materials as exact owned, untreated whole units totalling 13 branch, 4 vine and 6 bark per bay (26, 8 and 12 for two bays); stone is not accepted. The footprint is 2 m across by 2 m per bay along the ridge, of ordinary dry soil, inside the world, unobstructed and unoccupied, and you stand within reach of the first bay; a 1 m strip along the open side must be walkable, inside the world and free of solid objects. Twelve paid increments per bay, one round and 1 energy each (24 rounds and 24 energy for two bays), bay after bay: 2 posts, 3 ridge and braces, 3 ribs and binding, 3 roofing courses, 1 final check; start pays the first and the same action continues each round; each increment needs reach to the bay being built. Resume pays the next increment of the unfinished work; cancel takes one round and no energy. Inspect: a bay in reach as target, one round, 0.2 energy, covering every bay of the structure in reach. Repair (builder only): target bay, increment 1-11 and the exact replacement units of that increment, one round, 1 energy. Dismantle (builder only): target bay, one round and 1 energy per stage, removing that bay's last installed stage. Gathering, travel, messages and probe tests are separate actions with their own costs.",
      effects:
        "Reserved materials stay carried and owned until each paid increment moves them into its bay as installed parts with the same quantity, origin and age; nothing is created or used up. Each bay is a full braced lean-to with its own posts and braces (no spanning roof or shared members) and its own 2 m x 1 m covered floor under a 1.2 m ridge. A bay's final stability, binding, roof-load, runoff and open-approach checks commission that bay alone. While exactly one person lies wholly on a commissioned bay's floor in rain and wind up to 0.8, that bay removes up to 50% of the rain part and up to 35% of the wind part of the existing outdoor exposure chill, scaled by its roof condition, by the share of the body under its roof along the wind-driven rain, and for wind by how directly its low edge faces the wind; people on other bays do not change it, but two people on the same bay floor, wind into the open side, stronger weather or water pooling on the floor give that bay no protection. Air temperature, hunger, nutrition and rest are unchanged, and shelters never stack. Each round every installed part wears by 0.0005 + 0.002 x rain + 0.002 x wind; a part below condition 0.5 makes that bay unsafe with no protection until repair and a passing reinspection. Changes in who lies on each bay floor are reported. Repair restores only the replaced parts; removed and dismantled parts return to the ground at the bay with their condition and can be reused. Work not continued in a round pauses; a lost reserved material stops it. Cancel returns uninstalled materials once, leaves partly built bays unfinished and keeps commissioned bays; death stops the work, drops uninstalled materials where the person died and leaves installed parts. Nobody else is moved, helped or given access; each person acts and pays for themselves. No reward, mastery or refund.",
      handler: 'long.shared-shelter',
      revision: REVISION,
      authored: false,
      // The commissioning event carries no qualified flag: a finished bay earns no milestone.
      practiceEvidence: 'shared-shelter-bay-commissioned',
      dependencies: {
        abilities: [],
        resources: ['branch', 'vine', 'bark'],
        knowledge: [],
      },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Paid work in twelve one-round increments per bay whose exact job, reserved pieces per bay and increment, installed parts and site persist across interruption; resume pays only the next increment after revalidation; completion, cancellation, failure and death settle once. Inspect, repair and dismantle are single rounds.',
      },
    },
  ],
  handlers: { 'long.shared-shelter': execute },
  processes: {},
  visualComponents: ['simple-shelter'],
  events: [
    'shared-shelter-started',
    'shared-shelter-progress',
    'shared-shelter-paused',
    'shared-shelter-resumed',
    'shared-shelter-cancelled',
    'shared-shelter-failed',
    'shared-shelter-test-failed',
    'shared-shelter-bay-commissioned',
    'shared-shelter-inspected',
    'shared-shelter-deteriorated',
    'shared-shelter-damaged',
    'shared-shelter-repaired',
    'shared-shelter-dismantled',
    'shared-shelter-occupancy',
    'shared-shelter-exposure-measured',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: weather,
  onDeath(w, a) {
    for (const j of collectiveJobs(w, ID).filter(
      (j) => j.owner === a.id && open(j),
    )) {
      settle(
        w,
        a,
        j,
        'Performer died; uninstalled materials were left on the ground once.',
        true,
      );
      forestEvent(
        w,
        'shared-shelter-failed',
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
