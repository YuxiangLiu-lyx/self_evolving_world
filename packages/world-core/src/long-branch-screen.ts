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
import { SIMPLE_SHELTER_LIMITS as LIMITS } from './long-shelter-exposure.js';
import { SIMPLE_SHELTER_WEAR as WEAR } from './long-simple-shelter.js';
import {
  BRANCH_SCREEN_GEOMETRY as G,
  BRANCH_SCREEN_KIND as KIND,
  BRANCH_SCREEN_REVISION as REVISION,
  BRANCH_SCREEN_SOUND as SOUND,
  branchScreenExposure,
  branchScreenInLee,
  branchScreenShield,
  branchScreenSolidity,
  branchScreenSound,
} from './long-branch-screen-exposure.js';

const ID = 'branch-screen';
const STATE = `long:work:${ID}`;
const TRIALS = `long:${ID}:trials`;
const PART = 'branchScreenPart';
/** Energy per paid assembly or repair round, per dismantling round, and per single-round mode. */
const ROUND = 1.5;
const DISMANTLE = 1;
const LOOK = 0.2;
const TRIAL = 0.5;
/** Pieces taken out per dismantling round. */
const GROUP = 3;
/** Coded thresholds on existing material values: ex15's branch strength for load-bearing members,
 * and the flexibility for a gentle open weave (rods deflect about one upright thickness). */
const STRENGTH = 0.3;
const WEAVE = 0.2;
const TREATED = [
  'physical',
  'materialLayer',
  'mantle',
  'frictionKit',
  'waterCup',
  'fuelMoisture',
  'canopyDrying',
  'componentLots',
] as const;

interface Slot {
  slot: string;
  role: 'upright' | 'rod';
  /** Position along the screen and height above ground of the piece. */
  y: number;
  z: number;
}
const SLOTS: Slot[] = [
  ...G.uprights.map((y, i) => ({
    slot: `upright-${String(i)}`,
    role: 'upright' as const,
    y,
    z: 0,
  })),
  ...Array.from({ length: G.rods }, (_, i) => ({
    slot: `rod-${String(i)}`,
    role: 'rod' as const,
    y: 0,
    z: v7RoundNumber(0.05 + i * 0.05),
  })),
];
/** Eight paid assembly rounds (World Agent specification). */
const ASSEMBLY: { stage: string; slots: string[] }[] = [
  { stage: 'seat-uprights', slots: ['upright-0', 'upright-2'] },
  { stage: 'seat-uprights', slots: ['upright-1'] },
  { stage: 'weave-rods', slots: ['rod-0', 'rod-1'] },
  { stage: 'weave-rods', slots: ['rod-2', 'rod-3'] },
  { stage: 'weave-rods', slots: ['rod-4', 'rod-5'] },
  { stage: 'weave-rods', slots: ['rod-6', 'rod-7'] },
  { stage: 'align-gaps', slots: [] },
  { stage: 'stability-check', slots: [] },
];

/** An installed piece keeps the moved stack's identity, quantity, origin and age. */
interface Piece extends V7Data {
  id: string;
  resource: string;
  quantity: number;
  origin: string;
  slot: string;
  role: string;
  condition: number;
  installedAt: number;
  sourceOwner: string;
}
interface Round extends V7Data {
  stage: string;
  fit: { slot: string; escrow: string }[];
  remove: string[];
}
const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const statusOf = (o: V7Object) =>
  typeof o.data.status === 'string' ? o.data.status : 'planned';
const pieces = (o: V7Object): Piece[] =>
  Array.isArray(o.data.components)
    ? (o.data.components as unknown as Piece[])
    : [];
const rounds = (j: CollectiveWork): Round[] =>
  Array.isArray(j.rounds) ? (j.rounds as unknown as Round[]) : [];
const slotIndex = (slot: string) => SLOTS.findIndex((s) => s.slot === slot);
const mass = (w: V7World, c: { resource: string; quantity: number }) =>
  (w.resources.find((r) => r.id === c.resource)?.mass ?? 0) * c.quantity;
const material = (w: V7World, id: string) => {
  const r = w.resources.find((r) => r.id === id);
  return r ? openMaterial(r) : null;
};
function omit(value: object, keys: string[]): V7Data {
  const out: V7Data = {};
  for (const [k, v] of Object.entries(value) as [string, unknown][])
    if (!keys.includes(k) && v !== undefined) out[k] = v7Json(v);
  return out;
}
/** World point at local offsets (u across, v along) from a spatial centre. */
function at(s: { x: number; y: number; angle: number }, u: number, v: number) {
  return {
    x: s.x + u * Math.cos(s.angle) - v * Math.sin(s.angle),
    y: s.y + u * Math.sin(s.angle) + v * Math.cos(s.angle),
  };
}
function rect(
  s: { x: number; y: number; angle: number },
  u: number,
  width: number,
  height: number,
  solid = true,
): V7Spatial {
  return {
    ...at(s, u, 0),
    angle: s.angle,
    shape: { kind: 'rectangle', width, height },
    solid,
    interaction: 0,
    entrances: [],
  };
}
const footprint = (s: { x: number; y: number; angle: number }) =>
  rect(s, 0, G.site.across, G.site.along);
const leeFloor = (s: { x: number; y: number; angle: number }) =>
  rect(
    s,
    -(G.lee.near + G.lee.far) / 2,
    G.lee.far - G.lee.near,
    G.width,
    false,
  );
function line(s: { x: number; y: number; angle: number }): V7Spatial {
  return {
    ...rect(s, 0, G.thickness, G.width, false),
    reserved: true,
    interaction: 0.65,
  };
}
function grid(r: V7Spatial): V7Point[] {
  const { width, height } =
    r.shape.kind === 'rectangle' ? r.shape : { width: 0, height: 0 };
  return [-0.5, -0.25, 0, 0.25, 0.5].flatMap((u) =>
    [-0.5, -0.25, 0, 0.25, 0.5].map((v) => at(r, u * width, v * height)),
  );
}
const body = (a: V7Actor): V7Spatial => ({
  ...a.position,
  angle: 0,
  shape: { kind: 'circle', radius: a.radius },
  solid: true,
  interaction: 0,
  entrances: [],
});
const conditionOf = (s: V7Stack) =>
  Number((s.processing?.[PART] as V7Data | undefined)?.condition ?? 1);
/** Untreated branch units, or unbroken recovered screen pieces at least as sound as `min`. */
function usable(s: V7Stack, min = SOUND) {
  const keys = Object.keys(s.processing ?? {});
  return (
    s.resource === 'branch' &&
    !s.reservedFor &&
    TREATED.every((k) => s[k] === undefined) &&
    keys.every((k) => k === PART) &&
    (s.processing?.[PART] as V7Data | undefined)?.broken !== true &&
    conditionOf(s) >= min
  );
}

function site(c: V7ActionContext) {
  const orientation = v7Number(
    c.action.args.orientation ?? 0,
    'orientation',
    0,
    360,
  );
  return {
    x: v7Number(c.action.args.x, 'site x'),
    y: v7Number(c.action.args.y, 'site y'),
    orientation,
    angle: (orientation * Math.PI) / 180,
  };
}
/** Coded site checks of the footprint and the lee floor beside it; nothing is reserved. */
function survey(
  w: V7World,
  a: V7Actor,
  s: { x: number; y: number; angle: number },
  self: string | null,
) {
  const foot = footprint(s),
    lee = leeFloor(s),
    feet = grid(foot),
    floor = grid(lee),
    problems: string[] = [];
  if (!v7Reach(a, line(s))) problems.push('the screen line is beyond reach');
  if ([...feet, ...floor].some((p) => !v7Inside(w, p, 0.05)))
    problems.push('part of the footprint or lee floor is outside the world');
  else {
    const ground = feet.map((p) => openConditions(w, p));
    if (ground.some((g) => g.ground !== '.'))
      problems.push('part of the footprint is not ordinary soil');
    if (
      ground.some(
        (g) => g.waterlogging > LIMITS.waterlogging || g.hazards.length,
      )
    )
      problems.push('part of the footprint is saturated or under a hazard');
    if (floor.some((p) => ['~', '='].includes(openConditions(w, p).ground)))
      problems.push('the lee floor is water');
  }
  const others = w.objects.filter((o) => o.id !== self);
  if (others.some((o) => v7ShapesOverlap(foot, { ...o.spatial, solid: true })))
    problems.push('the footprint overlaps a plant, object or site');
  if (others.some((o) => v7ShapesOverlap({ ...lee, solid: true }, o.spatial)))
    problems.push('the lee floor overlaps a solid object or site');
  if (
    others.some((o) =>
      o.spatial.entrances.some(
        (p) => v7ShapeDistance(at(o.spatial, p.x, p.y), foot) <= 0,
      ),
    )
  )
    problems.push('the footprint blocks an entrance');
  if (
    w.actors.some((x) => x.vitals.health > 0 && v7ShapesOverlap(foot, body(x)))
  )
    problems.push('a person occupies the footprint');
  return { problems, ground: openConditions(w, s) };
}

function refresh(w: V7World, o: V7Object) {
  const list = pieces(o),
    status = statusOf(o),
    sound = branchScreenSound(o),
    solidity = branchScreenSolidity(sound.uprights, sound.rods);
  o.spatial.solid = list.length > 0;
  o.data.integrity = list.length
    ? v7RoundNumber(Math.min(...list.map((p) => p.condition)))
    : 0;
  o.data.solidity = solidity;
  o.data.porosity = v7RoundNumber(1 - solidity);
  o.data.mass = v7RoundNumber(list.reduce((n, p) => n + mass(w, p), 0));
  o.visual.state = status;
  o.data.view = {
    component: KIND,
    project: o.id,
    operation: o.data.operation ?? null,
    status,
    stage: o.data.stage ?? null,
    position: { x: o.spatial.x, y: o.spatial.y },
    orientation: o.data.orientation ?? 0,
    width: G.width,
    height: G.height,
    porosity: o.data.porosity,
    integrity: o.data.integrity,
    installed: list.length,
    required: SLOTS.length,
    pieces: list.map((p) => {
      const s = SLOTS[slotIndex(p.slot)];
      return {
        slot: p.slot,
        role: p.role,
        y: s?.y ?? 0,
        z: s?.z ?? 0,
        length: p.role === 'upright' ? G.uprightLength : G.rodLength,
        condition: v7RoundNumber(p.condition),
        color: w.resources.find((r) => r.id === p.resource)?.color ?? '#8d704e',
      };
    }),
  };
}

/** The coded low-force stability check against installed pieces, ground and material values. */
function verify(w: V7World, o: V7Object) {
  const list = pieces(o),
    ups = list.filter((p) => p.role === 'upright'),
    rods = list.filter((p) => p.role === 'rod'),
    sound = (l: Piece[]) => l.every((p) => p.condition >= SOUND),
    weakest = (l: Piece[]) =>
      l.length ? v7RoundNumber(Math.min(...l.map((p) => p.condition))) : null,
    ground = G.uprights.map((y) => openConditions(w, at(o.spatial, 0, y))),
    branch = material(w, 'branch');
  const tests = [
    {
      test: 'upright seating',
      passed:
        ups.length === G.uprights.length &&
        sound(ups) &&
        ground.every(
          (g) =>
            g.ground === '.' &&
            g.waterlogging <= LIMITS.waterlogging &&
            !g.hazards.length,
        ) &&
        (branch?.strength ?? 0) >= STRENGTH,
      measured: {
        uprights: ups.length,
        depth: G.depth,
        weakest: weakest(ups),
        ground: ground.map((g) => g.regime),
        waterlogging: Math.max(...ground.map((g) => g.waterlogging)),
        strength: branch?.strength ?? null,
      },
    },
    {
      test: 'weave retention',
      passed:
        rods.length === G.rods &&
        sound(rods) &&
        (branch?.flexibility ?? 0) >= WEAVE,
      measured: {
        rods: rods.length,
        weakest: weakest(rods),
        flexibility: branch?.flexibility ?? null,
      },
    },
  ];
  return {
    passed: tests.every((t) => t.passed),
    tests,
    loose: list.filter((p) => p.condition < SOUND).map((p) => p.slot),
  };
}

function summary(w: V7World, j: CollectiveWork): V7Data {
  const o = w.objects.find((o) => o.id === j.target);
  return {
    workId: j.id,
    structure: j.target,
    operation: j.mode,
    status: j.status,
    completedRounds: j.completedWork,
    remaining: j.remainingWork,
    paidEnergy: v7RoundNumber(j.paidEnergy),
    nextStage: rounds(j)[j.completedWork]?.stage ?? null,
    reserved: v7Json(j.sources),
    view: o?.data.view ?? null,
  };
}
function sync(a: V7Actor, j: CollectiveWork) {
  a.extensionState[STATE] = v7Json(j);
}

/** Exact owned whole branch units; returns one-unit pieces in the given order. */
function allocate(c: V7ActionContext, n: number) {
  const list = workAllocations(c, c.action.args.materials);
  let total = 0;
  for (const { stack, quantity } of list) {
    if (!usable(stack))
      throw new Error(
        'Use untreated branch units or sound recovered screen pieces; nothing was reserved.',
      );
    if (!Number.isInteger(quantity))
      throw new Error('Whole branch units are required; nothing was reserved.');
    total += quantity;
  }
  if (total !== n)
    throw new Error(
      `Exactly ${String(n)} owned whole branch units are required; nothing was reserved.`,
    );
  return list.flatMap((a) =>
    Array.from({ length: a.quantity }, () => ({ stack: a.stack, quantity: 1 })),
  );
}
function install(
  w: V7World,
  o: V7Object,
  s: V7Stack,
  slot: string,
  owner: string,
) {
  const piece = {
    ...omit(s, ['reservedFor', 'owner', 'position', 'processing']),
    slot,
    role: SLOTS[slotIndex(slot)]?.role ?? 'rod',
    condition: conditionOf(s),
    installedAt: w.tick,
    sourceOwner: owner,
  } as Piece;
  w.stacks = w.stacks.filter((x) => x.id !== s.id);
  o.data.components = [...pieces(o), piece];
  return piece;
}
/** A removed piece becomes an ordinary unowned ground stack at its place, keeping its condition. */
function release(w: V7World, o: V7Object, p: Piece): string {
  const id = v7Id(w, 'item'),
    s = SLOTS[slotIndex(p.slot)];
  w.stacks.push({
    ...(omit(p, [
      'slot',
      'role',
      'condition',
      'installedAt',
      'sourceOwner',
    ]) as unknown as V7Stack),
    id,
    owner: null,
    position: at(o.spatial, 0, s?.y ?? 0),
    processing: {
      [PART]: {
        structure: o.id,
        piece: p.id,
        role: p.role,
        condition: v7RoundNumber(p.condition),
        removedAt: w.tick,
      },
    },
  });
  o.data.components = pieces(o).filter((x) => x.id !== p.id);
  return id;
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
    'branch-screen-paused',
    `${reason} Completed rounds and reserved pieces are kept; nothing was spent.`,
    { ...summary(c.world, j), ...data },
    j.target,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id] };
}
/** After cancel, failure or death, installed pieces stay as an explicitly incomplete screen
 * without shielding; a full set can still be rechecked through repair, anything less only dismantled. */
function settle(w: V7World, o: V7Object | undefined) {
  if (!o) return;
  o.data.workId = null;
  if (!pieces(o).length) {
    w.objects = w.objects.filter((x) => x.id !== o.id);
    return;
  }
  o.data.status = 'incomplete';
  refresh(w, o);
}

function check(c: V7ActionContext, o: V7Object, j: CollectiveWork) {
  const v = verify(c.world, o);
  o.data.tests = [
    ...(Array.isArray(o.data.tests) ? o.data.tests : []),
    {
      tick: c.world.tick,
      by: c.actor.id,
      passed: v.passed,
      tests: v7Json(v.tests),
    },
  ].slice(-6);
  o.data.status = v.passed ? 'complete' : 'unstable';
  refresh(c.world, o);
  const data = {
    structure: o.id,
    operation: j.mode,
    tests: v7Json(v.tests),
    looseComponents: v.loose,
    displacement: 'not represented; loose pieces are counted instead',
    porosity: o.data.porosity ?? null,
    status: statusOf(o),
  };
  if (j.mode === 'repair')
    c.emit(
      'branch-screen-repaired',
      'Repair rounds finished and the stability check was rerun.',
      { ...data, replaced: v7Json(j.replaced ?? []) },
      o.id,
    );
  c.emit(
    v.passed ? 'branch-screen-completed' : 'branch-screen-check-failed',
    v.passed
      ? 'The low-force stability check passed: the porous screen is complete. It shields only wind on its lee floor, under the coded rule.'
      : 'The stability check failed; the screen is unstable and gives no shielding until repaired and checked.',
    data,
    o.id,
  );
}

/** One paid round after revalidating materials, reach, site, occupancy and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const w = c.world,
    o = w.objects.find((o) => o.id === j.target && o.kind === KIND);
  if (!open(j) || !o) throw new Error('This screen work is already settled.');
  const plan = rounds(j);
  if (
    plan
      .slice(j.completedWork)
      .some((r) =>
        r.fit.some(
          (f) =>
            !w.stacks.some(
              (s) =>
                s.id === f.escrow && s.reservedFor === j.id && s.quantity === 1,
            ),
        ),
      )
  ) {
    j.x = c.actor.position.x;
    j.y = c.actor.position.y;
    workStop(
      w,
      c.actor,
      j,
      'A reserved piece was lost; surviving pieces returned.',
      false,
    );
    settle(w, o);
    c.emit(
      'branch-screen-failed',
      'Work stopped because a reserved piece was lost; installed pieces stay at the site.',
      summary(w, j),
      j.target,
    );
    sync(c.actor, j);
    return { complete: true, writes: [j.id] };
  }
  if (!v7Reach(c.actor, o.spatial))
    return pause(c, j, 'The screen line is beyond working reach.');
  const foot = footprint(o.spatial);
  if (
    grid(foot).some((p) => {
      const g = openConditions(w, p);
      return g.waterlogging > LIMITS.waterlogging || g.hazards.length > 0;
    })
  )
    return pause(c, j, 'The footprint is saturated or under a hazard.');
  if (
    w.actors.some((x) => x.vitals.health > 0 && v7ShapesOverlap(foot, body(x)))
  )
    return pause(c, j, 'A person occupies the footprint.');
  if (c.actor.vitals.energy < ROUND)
    return pause(c, j, 'Not enough energy for the next paid round.', {
      requiredEnergy: ROUND,
    });
  const resumed = j.status === 'paused';
  if (!workPay(c, j, ROUND))
    throw new Error('Energy changed before the paid round.');
  if (resumed)
    c.emit(
      'branch-screen-resumed',
      'Unfinished screen work resumed after rechecking site, pieces and energy.',
      summary(w, j),
      o.id,
    );
  const n = j.completedWork,
    round = plan[n - 1] ?? { stage: '', fit: [], remove: [] };
  const removed = round.remove.flatMap((id) => {
    const p = pieces(o).find((p) => p.id === id);
    return p
      ? [
          {
            slot: p.slot,
            condition: v7RoundNumber(p.condition),
            item: release(w, o, p),
          },
        ]
      : [];
  });
  const installed = round.fit.flatMap((f) => {
    const s = w.stacks.find((s) => s.id === f.escrow);
    return s ? [install(w, o, s, f.slot, c.actor.id)] : [];
  });
  o.data.stage = round.stage;
  o.data.status = 'in-progress';
  refresh(w, o);
  if (n >= plan.length) {
    j.status = 'completed';
    j.outputs = [o.id];
    o.data.workId = null;
    check(c, o, j);
    sync(c.actor, j);
    return { complete: true, remaining: 0, writes: [j.id, o.id] };
  }
  c.emit(
    'branch-screen-progress',
    `Paid round ${String(n)} of ${String(plan.length)} (${round.stage}). An unchecked screen gives no shielding.`,
    {
      ...summary(w, j),
      round: n,
      stage: round.stage,
      installed: v7Json(installed),
      removed: v7Json(removed),
      ...(installed.some((p) => p.role === 'upright')
        ? { insertionDepth: G.depth }
        : {}),
    },
    o.id,
  );
  sync(c.actor, j);
  return { complete: false, remaining: j.remainingWork, writes: [j.id, o.id] };
}

/** The person's own passing post trial lies inside this footprint. */
function trialPassed(a: V7Actor, foot: V7Spatial) {
  const list = Array.isArray(a.extensionState[TRIALS])
    ? (a.extensionState[TRIALS] as unknown as {
        x: number;
        y: number;
        inserted: boolean;
      }[])
    : [];
  return list.some((t) => t.inserted && v7ShapeDistance(t, foot) <= 0);
}

function assess(c: V7ActionContext): V7HandlerResult {
  const s = site(c),
    w = c.world;
  if (!v7Reach(c.actor, line(s)))
    throw new Error('Move within reach of the site first; nothing was spent.');
  if (!v7Inside(w, s, 0.05)) throw new Error('The site is outside the world.');
  const post = typeof c.action.args.post === 'string' ? c.action.args.post : '';
  const climate = forestClimate(w, s);
  if (post) {
    const stack = w.stacks.find((x) => x.id === post);
    if (
      !stack ||
      stack.owner !== c.actor.id ||
      !usable(stack, 0) ||
      stack.quantity < 1
    )
      throw new Error(
        'The post must be an owned, unreserved whole branch unit; nothing was spent.',
      );
    if (
      w.objects.some(
        (o) => o.spatial.solid && v7ShapeDistance(s, o.spatial) <= 0,
      )
    )
      throw new Error(
        'The point lies inside a solid object; nothing was spent.',
      );
    v7Spend(c.actor, TRIAL);
    const g = openConditions(w, s),
      condition = conditionOf(stack),
      broken = condition < SOUND,
      reason = broken
        ? 'the post broke under the push'
        : g.ground !== '.'
          ? 'not ordinary soil: hand insertion is not supported here'
          : g.waterlogging > LIMITS.waterlogging
            ? 'saturated soil would not hold the post'
            : g.hazards.length
              ? 'the ground is under a hazard'
              : (material(w, 'branch')?.strength ?? 0) < STRENGTH
                ? 'the material is too weak to push in'
                : null;
    let damaged: string | null = null;
    if (broken) {
      const part: V7Stack = {
        ...materialPortion(stack, 10),
        id: v7Id(w, 'item'),
        quantity: 1,
        quantityTenths: 10,
        position: { ...c.actor.position },
        processing: {
          [PART]: { condition: 0, broken: true, brokenAt: w.tick },
        },
      };
      foodSetQuantity(stack, foodTenths(stack.quantity) - 10);
      w.stacks.push(part);
      w.stacks = w.stacks.filter((x) => x.quantity > 0);
      damaged = part.id;
    }
    const value = {
      x: s.x,
      y: s.y,
      inserted: !reason,
      depth: reason ? 0 : G.depth,
      retained: !reason,
      resistance:
        reason ?? 'ordinary soil admitted the point by hand and held it',
      soil: g.regime,
      moisture: g.moisture,
      waterlogging: g.waterlogging,
      postCondition: v7RoundNumber(condition),
      damagedItem: damaged,
    };
    c.actor.extensionState[TRIALS] = v7Json(
      [
        ...(Array.isArray(c.actor.extensionState[TRIALS])
          ? c.actor.extensionState[TRIALS]
          : []),
        { x: s.x, y: s.y, tick: w.tick, inserted: !reason },
      ].slice(-6),
    );
    openRemember(c, {
      key: `branch-screen:post-trial:${s.x.toFixed(1)},${s.y.toFixed(1)}`,
      subject: 'branch',
      property: 'hand insertion of a branch post',
      value,
      method: 'physical post trial',
      condition: g.regime,
      verified: false,
    });
    c.emit(
      'branch-screen-trial',
      reason
        ? `Post trial failed: ${reason}. No support was made.`
        : 'Post trial: the post went 0.25 m in by hand and held; it was pulled out intact. No support was made.',
      { ...value, post, wind: climate.wind ?? null },
      null,
    );
    return { complete: true, writes: damaged ? [damaged] : [] };
  }
  v7Spend(c.actor, LOOK);
  const found = survey(w, c.actor, s, null);
  const units = w.stacks
    .filter((x) => x.owner === c.actor.id && usable(x))
    .reduce((n, x) => n + Math.floor(x.quantity), 0);
  const value = {
    x: s.x,
    y: s.y,
    orientation: s.orientation,
    suitable: !found.problems.length,
    problems: found.problems,
    soil: found.ground.regime,
    ground: found.ground.ground,
    moisture: found.ground.moisture,
    waterlogging: found.ground.waterlogging,
    wind: climate.wind ?? null,
    rain: climate.rain ?? null,
    windFrom: '+x',
    facing: v7RoundNumber(Math.max(0, Math.cos(s.angle))),
    requiredBranchUnits: SLOTS.length,
    ownedUsableBranchUnits: units,
    passingTrialHere: trialPassed(c.actor, footprint(s)),
  };
  openRemember(c, {
    key: `branch-screen:site:${s.x.toFixed(1)},${s.y.toFixed(1)}`,
    subject: 'branch-screen-site',
    property: 'visible site conditions',
    value,
    method: 'direct observation',
    condition: found.ground.regime,
    verified: false,
  });
  c.emit(
    'branch-screen-assessed',
    found.problems.length
      ? `Site unsuitable: ${found.problems.join('; ')}.`
      : 'The site looks suitable; a post trial must test the soil before assembly.',
    value,
    null,
  );
  return { complete: true, writes: [] };
}

function assemble(c: V7ActionContext): V7HandlerResult {
  const w = c.world;
  if (c.action.args.target)
    throw new Error('No unfinished screen work of yours on this target.');
  const own = workFind(c);
  if (own && open(own))
    throw new Error(
      'Unfinished screen work exists; resume it by target or cancel it.',
    );
  const s = site(c),
    found = survey(w, c.actor, s, null);
  if (found.problems.length)
    throw new Error(
      `Site check failed: ${found.problems.join('; ')}. Nothing was reserved.`,
    );
  if (!trialPassed(c.actor, footprint(s)))
    throw new Error(
      'First pass a post trial (assess with post) inside this footprint; nothing was reserved.',
    );
  const split = allocate(c, SLOTS.length);
  if (c.actor.vitals.energy < ROUND)
    throw new Error(
      'Not enough energy for the first paid round; nothing was reserved.',
    );
  const j = workCreate(c, 'assemble', ASSEMBLY.length);
  const o: V7Object = {
    id: v7Id(w, 'screen'),
    kind: KIND,
    name: 'Woven branch screen',
    spatial: line(s),
    visual: {
      component: KIND,
      color: '#8d704e',
      accent: '#c9b48a',
      label: 'Branch screen',
      state: 'planned',
    },
    data: {
      status: 'planned',
      operation: 'assemble',
      builder: c.actor.id,
      workId: j.id,
      orientation: s.orientation,
      components: [],
      tests: [],
    },
    createdBy: c.actor.id,
    createdAt: w.tick,
    revision: REVISION,
  };
  w.objects.push(o);
  j.target = o.id;
  workReserve(c, j, split);
  w.stacks = w.stacks.filter((x) => x.quantity > 0);
  j.rounds = ASSEMBLY.map((r) => ({
    stage: r.stage,
    fit: r.slots.map((slot) => ({
      slot,
      escrow: j.escrow[slotIndex(slot)] ?? '',
    })),
    remove: [],
  }));
  refresh(w, o);
  c.emit(
    'branch-screen-started',
    'Site check and post trial passed; eleven branch units were reserved and stay carried until paid rounds install them.',
    {
      ...summary(w, j),
      siteCheck: 'reachable, ordinary dry soil, clear and unoccupied',
    },
    o.id,
  );
  return advance(c, j);
}

function structure(c: V7ActionContext, builderOnly: boolean): V7Object {
  const id = v7String(c.action.args.target, 'target'),
    o = c.world.objects.find((o) => o.id === id && o.kind === KIND);
  if (!o) throw new Error('The target is not a branch screen.');
  if (!v7Reach(c.actor, o.spatial))
    throw new Error('The screen is beyond reach.');
  if (builderOnly && o.createdBy !== c.actor.id)
    throw new Error('Only the person who built this screen may change it.');
  if (builderOnly && o.data.workId)
    throw new Error('Work on it is still open; resume or cancel it first.');
  return o;
}

function repair(c: V7ActionContext): V7HandlerResult {
  const own = workFind(c);
  if (own && open(own))
    throw new Error(
      'Unfinished screen work exists; resume it by target or cancel it.',
    );
  const o = structure(c, true),
    raw: unknown = c.action.args.components ?? [];
  if (pieces(o).length !== SLOTS.length)
    throw new Error(
      'Only a fully installed screen can be repaired; dismantle it instead.',
    );
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string'))
    throw new Error('components must list installed piece ids.');
  const ids = [...new Set(raw as string[])];
  if (
    ids.length !== raw.length ||
    ids.some((id) => !pieces(o).some((p) => p.id === id))
  )
    throw new Error('Name distinct installed pieces of this screen.');
  const split = ids.length ? allocate(c, ids.length) : [];
  if (c.actor.vitals.energy < ROUND)
    throw new Error(
      'Not enough energy for the first paid round; nothing was reserved.',
    );
  const j = workCreate(c, 'repair', 2 * ids.length + 1);
  j.target = o.id;
  workReserve(c, j, split);
  c.world.stacks = c.world.stacks.filter((x) => x.quantity > 0);
  const slots = ids.map((id) => pieces(o).find((p) => p.id === id)?.slot ?? '');
  j.replaced = slots;
  j.rounds = [
    ...ids.flatMap((id, i) => [
      { stage: 'remove', fit: [], remove: [id] },
      {
        stage: 'fit',
        fit: [{ slot: slots[i] ?? '', escrow: j.escrow[i] ?? '' }],
        remove: [],
      },
    ]),
    { stage: 'stability-check', fit: [], remove: [] },
  ];
  o.data.workId = j.id;
  o.data.operation = 'repair';
  o.data.status = 'in-progress';
  refresh(c.world, o);
  c.emit(
    'branch-screen-started',
    'Repair started; replacement units are reserved and the screen gives no shielding until checked.',
    summary(c.world, j),
    o.id,
  );
  return advance(c, j);
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const o = structure(c, false),
    w = c.world;
  v7Spend(c.actor, LOOK);
  const list = pieces(o),
    climate = forestClimate(w, o.spatial),
    shield = branchScreenShield(o, climate.wind ?? 0);
  const lee = w.actors
    .filter(
      (a) => a.vitals.health > 0 && branchScreenInLee(o, a.position, a.radius),
    )
    .map((a) => ({
      actor: a.id,
      avoidedChill: branchScreenExposure(w, a)?.avoidedChill ?? 0,
    }));
  const value = {
    status: statusOf(o),
    installed: list.length,
    missing: SLOTS.filter((s) => !list.some((p) => p.slot === s.slot)).map(
      (s) => s.slot,
    ),
    loose: list.filter((p) => p.condition < SOUND).map((p) => p.slot),
    integrity: o.data.integrity ?? 0,
    porosity: o.data.porosity ?? 1,
    wind: climate.wind ?? null,
    rain: climate.rain ?? null,
    windFrom: '+x',
    facing: shield.facing,
    leeWindShieldNow: shield.windShield,
    withheld: shield.withheld,
    lee: v7Json(lee),
    lastWeather: o.data.weather ?? null,
  };
  openRemember(c, {
    key: `${o.id}:screen-condition`,
    subject: o.id,
    property: 'installed pieces, gaps, condition and local wind',
    value,
    method: 'direct inspection',
    condition: 'Accessible condition only; nothing was repaired.',
    verified: false,
  });
  c.emit(
    'branch-screen-inspected',
    'Screen inspected; only observable condition, gaps and the current wind rule are reported.',
    { structure: o.id, ...value },
    o.id,
  );
  return { complete: true, writes: [o.id] };
}

function dismantle(c: V7ActionContext): V7HandlerResult {
  const o = structure(c, true),
    group = [...pieces(o)]
      .sort((a, b) => slotIndex(b.slot) - slotIndex(a.slot))
      .slice(0, GROUP);
  if (!group.length) throw new Error('Nothing installed remains to dismantle.');
  v7Spend(c.actor, DISMANTLE);
  const returned = group.map((p) => release(c.world, o, p)),
    left = pieces(o).length;
  if (!left) c.world.objects = c.world.objects.filter((x) => x.id !== o.id);
  else {
    o.data.status = 'incomplete';
    o.data.stage = 'dismantling';
    refresh(c.world, o);
  }
  c.emit(
    'branch-screen-dismantled',
    `${String(group.length)} pieces were taken out and left on the ground with their condition${left ? '' : '; the screen is gone'}. Nothing is refunded.`,
    {
      structure: o.id,
      returned,
      slots: group.map((p) => p.slot),
      conditions: group.map((p) => v7RoundNumber(p.condition)),
      remainingPieces: left,
      status: left ? 'incomplete' : 'dismantled',
      energy: DISMANTLE,
    },
    left ? o.id : null,
  );
  return { complete: true, writes: [...returned, ...(left ? [o.id] : [])] };
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c);
  if (!j || !open(j))
    throw new Error('No unfinished screen work of yours to cancel.');
  const o = c.world.objects.find((o) => o.id === j.target);
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  workStop(
    c.world,
    c.actor,
    j,
    'Cancelled; uninstalled reserved pieces returned once. Spent energy and time are not refunded.',
    false,
  );
  settle(c.world, o);
  c.emit(
    'branch-screen-cancelled',
    'Screen work cancelled; installed pieces stay as a screen without shielding until checked or dismantled.',
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
  const mode = v7String(c.action.args.mode, 'mode'),
    own = workFind(c);
  // The bound action continues each round; assemble or repair naming the screen resumes it.
  if (
    own &&
    open(own) &&
    ['assemble', 'repair'].includes(mode) &&
    (c.operation?.first === false ||
      (!!own.target && c.action.args.target === own.target) ||
      c.action.args.processId === own.id)
  )
    return advance(c, own);
  if (mode === 'assess') return assess(c);
  if (mode === 'assemble') return assemble(c);
  if (mode === 'repair') return repair(c);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'dismantle') return dismantle(c);
  if (mode === 'cancel') return cancel(c);
  throw new Error('Unknown screen mode.');
}

/** Unworked rounds pause; installed pieces wear under the reused ex11 lean-to wear law. */
function weather(w: V7World) {
  for (const j of collectiveJobs(w, ID).filter(open)) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a) continue;
    for (const s of w.stacks.filter((s) => s.reservedFor === j.id))
      s.position = { ...a.position };
    if (j.status === 'active' && j.lastPaid < w.tick) {
      j.status = 'paused';
      j.reason =
        'Not worked this round; completed rounds and reserved pieces are kept.';
      forestEvent(
        w,
        'branch-screen-paused',
        'Screen work paused because it was not worked this round.',
        a.position,
        a.id,
        summary(w, j),
        j.target,
      );
    }
    sync(a, j);
  }
  for (const o of w.objects.filter(
    (o) => o.kind === KIND && pieces(o).length,
  )) {
    const climate = forestClimate(w, o.spatial),
      rain = climate.rain ?? 0,
      wind = climate.wind ?? 0,
      wear = WEAR.base + WEAR.rain * rain + WEAR.wind * wind,
      before = branchScreenSound(o),
      weakest = Math.min(...pieces(o).map((p) => p.condition));
    for (const p of pieces(o)) p.condition = Math.max(0, p.condition - wear);
    o.data.weather = { tick: w.tick, rain, wind, wear: v7RoundNumber(wear) };
    const after = branchScreenSound(o),
      lowest = Math.min(...pieces(o).map((p) => p.condition));
    if (statusOf(o) === 'complete' && after.uprights < before.uprights) {
      o.data.status = 'damaged';
      refresh(w, o);
      forestEvent(
        w,
        'branch-screen-damaged',
        'Weather wear loosened an upright; the screen is damaged and gives no shielding until repaired and checked.',
        o.spatial,
        null,
        { structure: o.id, integrity: v7RoundNumber(lowest) },
        o.id,
      );
      continue;
    }
    refresh(w, o);
    if (
      after.rods < before.rods ||
      Math.floor(weakest * 10) !== Math.floor(lowest * 10)
    )
      forestEvent(
        w,
        'branch-screen-deteriorated',
        `Weather wear reduced the weakest piece to condition ${lowest.toFixed(2)}${after.rods < before.rods ? '; a loose rod no longer closes its gap' : ''}.`,
        o.spatial,
        null,
        {
          structure: o.id,
          integrity: v7RoundNumber(lowest),
          porosity: o.data.porosity ?? null,
          wear: v7RoundNumber(wear),
        },
        o.id,
      );
  }
}

export const LONG_BRANCH_SCREEN: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex16',
  dependencies: ['foundation-open@1'],
  description:
    'A small porous woven branch windbreak: site assessment, a physical post trial, eight paid assembly rounds with real branch units, a coded stability check, wind-only shielding through the existing exposure chill, wear, inspection, repair and dismantling.',
  reuse: {
    experiment:
      'ex15 simple-shelter@1 (staged paid assembly pattern, sound condition, wear law, light-weather wind limit and largest wind shield, +x wind convention); ex14 weather-barrier@1 (first release resolved here); ex11 weather-lean-to@1 (wear law)',
    source:
      'collective-work.ts (escrow, paid work, stop); material-lots.ts; open-physical.ts (ground conditions and probe-revealed material values); forest-climate.ts (wind, rain and the outdoor exposure chill); open-foundation.ts (personal records); long-branch-screen-exposure.ts (physiology hook)',
    description:
      'Implementation reuse only; no earlier ability, structure or mastery is inherited and the ex15 packages are unchanged. Gathering uses the unchanged base gather.',
  },
  abilities: [
    {
      id: ID,
      name: 'Construct a branch screen',
      function:
        'Assess a site and test a post, then build a small porous woven branch windbreak (no roof) beside a resting place; inspect, repair, dismantle or cancel.',
      equivalence: 'shelter:woven-branch-windbreak:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: [
              'assess',
              'assemble',
              'cancel',
              'inspect',
              'repair',
              'dismantle',
            ],
          },
          x: { type: 'number' },
          y: { type: 'number' },
          orientation: { type: 'number', minimum: 0, maximum: 360 },
          post: { type: 'string' },
          materials: {
            type: 'array',
            items: v7ObjectSchema({
              itemId: { type: 'string' },
              quantity: { type: 'number', minimum: 1 },
            }),
          },
          target: { type: 'string' },
          components: { type: 'array', items: { type: 'string' } },
          processId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: { target: 'optional-exact-visible', post: 'optional-owned' },
      prerequisites: [],
      learning: 4,
      costs:
        'Study: 4 rounds. One branch unit is one piece; a screen takes 11 (3 uprights, 8 rods). assess (x, y, orientation; within reach): 1 round, 0.2 energy; checks a clear 1.2 x 0.6 m footprint of ordinary dry soil and the lee floor. assess with post (owned branch unit): post trial at x, y; 1 round, 0.5 energy. assemble (x, y, orientation, materials: exactly 11 owned untreated or sound recovered branch units) needs your passing trial in the footprint; 8 paid rounds of 1.5 energy (2 seat uprights, 4 weave rods, 1 align, 1 stability check), continuing each round; with target it resumes. repair (builder; target, components: installed piece ids, materials: as many units): 1.5 energy per round, one removal and one fitting round per piece, then a check round; components [] only rechecks. inspect (target in reach): 1 round, 0.2 energy. dismantle (builder): 1 round and 1 energy per 3 pieces. cancel: no energy.',
      effects:
        'Units stay carried and owned until a paid round installs them with origin and age; nothing is created or used up. A trial on ordinary soil (waterlogging at most 0.1, no hazard) seats the post 0.25 m and you keep it; elsewhere it fails; a post below condition 0.5 breaks into damaged material. The check passes only if every piece has condition at least 0.5 and the uprights stand in such soil; else the screen is unstable. World wind has no direction; the exposure law takes it as coming from +x (orientation 0 faces it). A complete screen removes min(0.35, solid share of sound pieces, about 0.36) x facing of the wind part of the outdoor chill for a body wholly on the 0.9 x 0.9 m lee floor 0.45-1.35 m behind it; never rain chill or air temperature; none in wind above 0.8 or with another shelter. Wear per round 0.0005 + 0.002 x (rain + wind); a loose rod opens a gap, a loose upright ends the effect until repair. Removed pieces lie at the site. Unworked rounds, low energy, leaving reach, wet ground or a person on the footprint pause at no charge. Cancel or death returns uninstalled units once. No reward or refund.',
      handler: 'long.branch-screen',
      revision: REVISION,
      authored: false,
      // The completion event carries no qualified flag: a finished screen earns no milestone.
      practiceEvidence: 'branch-screen-completed',
      dependencies: { abilities: [], resources: ['branch'], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Paid one-round stages that persist across interruption; resuming pays only the next stage after rechecks. Other modes take one round.',
      },
    },
  ],
  handlers: { 'long.branch-screen': execute },
  processes: {},
  visualComponents: [KIND],
  events: [
    'branch-screen-assessed',
    'branch-screen-trial',
    'branch-screen-started',
    'branch-screen-progress',
    'branch-screen-paused',
    'branch-screen-resumed',
    'branch-screen-cancelled',
    'branch-screen-failed',
    'branch-screen-completed',
    'branch-screen-check-failed',
    'branch-screen-inspected',
    'branch-screen-deteriorated',
    'branch-screen-damaged',
    'branch-screen-repaired',
    'branch-screen-dismantled',
    'branch-screen-exposure-measured',
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
        'Performer died; uninstalled pieces were left on the ground once.',
        true,
      );
      settle(w, o);
      forestEvent(
        w,
        'branch-screen-failed',
        'Screen work stopped by death; installed pieces stay at the site.',
        a.position,
        a.id,
        summary(w, j),
        j.target,
      );
      sync(a, j);
    }
  },
};
