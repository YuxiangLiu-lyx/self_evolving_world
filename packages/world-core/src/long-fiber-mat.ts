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

const ID = 'hand-weave-fiber-mat';
const KIND = 'fiber-mat';
const REVISION = `${ID}@1`;
const STATE = `long:work:${ID}`;
const TESTS = `long:${ID}:tests`;
/** Processing key of fiber that passed through this operation (sample, offcut, scrap, carried mat). */
const PART = 'fiberMatLot';
/** Nominal mat side in metres (World Agent specification). */
const SIDE = 0.45;
/** Declared plaiting geometry (mass units read as kg): two crossing layers of 0.6 per m2 each,
 * times 1.5 for overlapping ends and edges tucked back about 0.05 m per side. */
const NEED = v7RoundNumber(SIDE * SIDE * 2 * 0.6 * 1.5);
/** Thin grass-like stems: the only materials given a plaiting geometry here. */
const STEMS = ['dry-grass', 'reed'];
/** Bending through plaited crossings: twice ex16 branch-screen@1's 0.2 for a gentle open weave,
 * below ex15 simple-shelter@1's 0.7 for wrapped load-bearing binding. */
const BEND = 0.4;
/** ex15 sound condition; the largest opening is OPENING x (1 - condition), so 0.03 m at 0.5. */
const SOUND = 0.5;
const OPENING = 0.06;
/** The recipe allocation in tenths (4 units) and the repair allocation (1 unit). */
const RECIPE = 40;
const PATCH = 10;
const WEAR = { exposed: 0.0005, occupied: 0.002 };
const LOOK = 0.2;
const TEST = 0.5;
const LAYOUT = 0.5;
const STEP = 1;
const DISMANTLE = 0.5;
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
const ASSEMBLY = [
  'layout',
  'strip-forming',
  'strip-forming',
  'interlacing',
  'interlacing',
  'edge-tucking',
  'lift-check',
];
const REPAIR = ['remove-broken', 'interlace', 'lift-check'];
/** Statuses of a mat whose fiber has all passed the lift-check stage at least once. */
const FINISHED = ['complete', 'needs-repair', 'failed'];

/** Fiber held inside a lying mat; keeps the moved stack's identity fields, origin and age. */
interface Lot extends V7Data {
  id: string;
  resource: string;
  quantity: number;
  quantityTenths: number;
  origin: string;
  /** Intact share of the stems in this lot. */
  condition: number;
  sourceOwner: string;
  incorporatedAt: number;
}
interface Test extends V7Data {
  resource: string;
  origin: string;
  passed: boolean;
  tick: number;
  sample: string;
}

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const record = (v: unknown): V7Data =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as V7Data) : {};
const statusOf = (o: V7Object) =>
  typeof o.data.status === 'string' ? o.data.status : 'layout';
const resourceOf = (o: V7Object) =>
  typeof o.data.resource === 'string' ? o.data.resource : '';
const holderOf = (o: V7Object) =>
  typeof o.data.holder === 'string' ? o.data.holder : null;
const lotsOf = (o: V7Object): Lot[] =>
  Array.isArray(o.data.lots) ? (o.data.lots as unknown as Lot[]) : [];
const tenths = (x: { quantity: number }) => foodTenths(x.quantity);
const sum = (l: { quantity: number }[]) => l.reduce((n, x) => n + tenths(x), 0);
const unitMass = (w: V7World, resource: string) =>
  w.resources.find((r) => r.id === resource)?.mass ?? 0;
/** Tenths a mat of this fiber retains: the declared fiber mass, rounded up to whole tenths. */
const needed = (w: V7World, resource: string) =>
  Math.ceil((NEED / Math.max(1e-9, unitMass(w, resource))) * 10 - 1e-9);
const part = (s: V7Stack) => record(s.processing?.[PART]);
const conditionOf = (s: V7Stack) => Number(part(s).condition ?? 1);
const reserved = (w: V7World, id: string) =>
  w.stacks.filter((s) => s.reservedFor === id && s.quantity > 0);
const carried = (w: V7World, o: V7Object) => reserved(w, o.id);
/** Fiber now in the mat: inside it while lying, reserved stacks of the holder while carried. */
const fiber = (w: V7World, o: V7Object): Lot[] =>
  holderOf(o) ? carried(w, o).map(lotOf) : lotsOf(o);
function untreated(s: V7Stack) {
  return (
    TREATED.every((k) => s[k] === undefined) &&
    Object.keys(s.processing ?? {}).every((k) => k === PART)
  );
}
function omit(value: object, keys: string[]): V7Data {
  const out: V7Data = {};
  for (const [k, v] of Object.entries(value) as [string, unknown][])
    if (!keys.includes(k) && v !== undefined) out[k] = v7Json(v);
  return out;
}
function lotOf(s: V7Stack): Lot {
  const p = part(s);
  return {
    ...omit(s, ['reservedFor', 'owner', 'position', 'processing']),
    quantityTenths: tenths(s),
    condition: Number(p.condition ?? 1),
    sourceOwner: typeof p.sourceOwner === 'string' ? p.sourceOwner : '',
    incorporatedAt: Number(p.incorporatedAt ?? -1),
  } as Lot;
}
/** A real stack made from (part of) a lot, keeping its origin and age. */
function stackOf(
  w: V7World,
  l: Lot,
  n: number,
  owner: string | null,
  position: V7Point,
  role: string,
  mat: string | null = null,
): V7Stack {
  const s = {
    ...(omit(l, [
      'condition',
      'sourceOwner',
      'incorporatedAt',
    ]) as unknown as V7Stack),
    id: mat ? l.id : v7Id(w, 'item'),
    quantity: n / 10,
    quantityTenths: n,
    owner,
    position: { ...position },
    processing: {
      [PART]: {
        role,
        condition: v7RoundNumber(l.condition),
        sourceOwner: l.sourceOwner,
        incorporatedAt: l.incorporatedAt,
        ...(mat ? { mat } : {}),
      },
    },
  };
  if (mat) s.reservedFor = mat;
  w.stacks.push(s);
  return s;
}
function tests(a: V7Actor): Test[] {
  const raw = a.extensionState[TESTS];
  return Array.isArray(raw) ? (raw as unknown as Test[]) : [];
}
const covered = (a: V7Actor, s: V7Stack) =>
  tests(a).some(
    (t) => t.passed && t.resource === s.resource && t.origin === s.origin,
  );

function measure(w: V7World, o: V7Object) {
  const list = fiber(w, o),
    total = sum(list),
    intact = list.reduce((n, l) => n + tenths(l) * l.condition, 0),
    condition = total ? v7RoundNumber(intact / total) : 0;
  return {
    fiber: total / 10,
    mass: v7RoundNumber((total / 10) * unitMass(w, resourceOf(o))),
    condition,
    brokenTenths: Math.round(total - intact),
    missingTenths: Math.max(0, Number(o.data.required ?? 0) - total),
    largestOpening: total ? v7RoundNumber(OPENING * (1 - condition)) : null,
  };
}
function refresh(w: V7World, o: V7Object) {
  const m = measure(w, o),
    status = statusOf(o);
  o.data.condition = m.condition;
  o.visual.state = holderOf(o) ? 'carried' : status;
  o.data.view = {
    component: KIND,
    mat: o.id,
    status,
    stage: o.data.stage ?? null,
    steps: Number(o.data.steps ?? 0),
    total: ASSEMBLY.length,
    carried: !!holderOf(o),
    holder: holderOf(o),
    width: SIDE,
    length: SIDE,
    fiber: m.fiber,
    mass: m.mass,
    condition: m.condition,
    largestOpening: m.largestOpening,
    color:
      w.resources.find((r) => r.id === o.data.resource)?.color ?? '#c4b679',
    position: { x: o.spatial.x, y: o.spatial.y },
  };
}

function square(x: number, y: number): V7Spatial {
  return {
    x,
    y,
    angle: 0,
    shape: { kind: 'rectangle', width: SIDE, height: SIDE },
    solid: false,
    interaction: 0.65,
    entrances: [],
  };
}
const body = (a: V7Actor): V7Spatial => ({
  ...a.position,
  angle: 0,
  shape: { kind: 'circle', radius: a.radius },
  solid: true,
  interaction: 0,
  entrances: [],
});
/** Living people other than `self` whose body touches the square. */
const others = (w: V7World, s: V7Spatial, self: string) =>
  w.actors.filter(
    (a) =>
      a.id !== self &&
      a.vitals.health > 0 &&
      v7ShapesOverlap({ ...s, solid: true }, body(a)),
  );
/** Coded checks of a 0.45 m work or placement square; nothing is reserved. */
function survey(w: V7World, a: V7Actor, s: V7Spatial, self: string | null) {
  const problems: string[] = [],
    grid = [-0.5, 0, 0.5].flatMap((u) =>
      [-0.5, 0, 0.5].map((v) => ({ x: s.x + u * SIDE, y: s.y + v * SIDE })),
    );
  if (!v7Reach(a, s)) problems.push('the square is beyond reach');
  if (grid.some((p) => !v7Inside(w, p, 0.02)))
    problems.push('the square is outside the world');
  else if (grid.some((p) => ['~', '='].includes(openConditions(w, p).ground)))
    problems.push('the square is over water');
  const ground = w.objects.filter(
    (o) => o.id !== self && !(o.kind === KIND && holderOf(o)),
  );
  if (
    ground.some((o) =>
      v7ShapesOverlap({ ...s, solid: true }, { ...o.spatial, solid: true }),
    )
  )
    problems.push('the square overlaps a plant, object or site');
  if (
    ground.some((o) =>
      o.spatial.entrances.some(
        (p) =>
          v7ShapeDistance(
            {
              x:
                o.spatial.x +
                p.x * Math.cos(o.spatial.angle) -
                p.y * Math.sin(o.spatial.angle),
              y:
                o.spatial.y +
                p.x * Math.sin(o.spatial.angle) +
                p.y * Math.cos(o.spatial.angle),
            },
            s,
          ) <= 0,
      ),
    )
  )
    problems.push('the square blocks an entrance');
  if (others(w, s, a.id).length) problems.push('another person is on it');
  return problems;
}
function place(c: V7ActionContext, self: string | null) {
  const s = square(
      v7Number(c.action.args.x, 'x'),
      v7Number(c.action.args.y, 'y'),
    ),
    problems = survey(c.world, c.actor, s, self);
  if (problems.length)
    throw new Error(
      `Square unsuitable: ${problems.join('; ')}. Nothing was spent.`,
    );
  return s;
}

function summary(w: V7World, j: CollectiveWork): V7Data {
  const o = w.objects.find((o) => o.id === j.target),
    plan = j.mode === 'repair' ? REPAIR : ASSEMBLY;
  return {
    workId: j.id,
    mat: j.target,
    operation: j.mode,
    status: j.status,
    completedRounds: j.completedWork,
    remaining: j.remainingWork,
    paidEnergy: v7RoundNumber(j.paidEnergy),
    nextStage: plan[j.completedWork] ?? null,
    reserved: sum(reserved(w, j.id)) / 10,
    view: o?.data.view ?? null,
  };
}
function sync(a: V7Actor, j: CollectiveWork) {
  a.extensionState[STATE] = v7Json(j);
}
function pause(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
  data: V7Data = {},
): V7HandlerResult {
  j.status = 'paused';
  j.reason = reason;
  c.emit(
    'fiber-mat-paused',
    `${reason} Completed rounds and reserved fiber are kept; nothing was spent.`,
    { ...summary(c.world, j), ...data },
    j.target,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id] };
}
/** After cancel, loss or death: a partial workpiece stays real; a repaired mat needs a check. */
function settle(w: V7World, o: V7Object | undefined, j: CollectiveWork) {
  if (!o) return;
  o.data.workId = null;
  if (j.mode === 'assemble') {
    if (!lotsOf(o).length) {
      w.objects = w.objects.filter((x) => x.id !== o.id);
      return;
    }
    o.data.status = 'loose';
  } else {
    const m = measure(w, o);
    o.data.status =
      m.missingTenths || m.condition < SOUND
        ? 'needs-repair'
        : typeof j.prior === 'string'
          ? j.prior
          : 'complete';
  }
  o.data.passedTrials = [];
  refresh(w, o);
}

/** Exact owned allocation of one tested stem fiber; nothing is reserved on failure. */
function allocate(c: V7ActionContext, n: number, resource?: string) {
  const list = workAllocations(c, c.action.args.materials);
  for (const { stack } of list) {
    if (!STEMS.includes(stack.resource) || !untreated(stack))
      throw new Error(
        'Use untreated thin stem fiber or fiber from this operation; nothing was reserved.',
      );
    if (!covered(c.actor, stack))
      throw new Error(
        'First pass a plaiting test on fiber from the same source; nothing was reserved.',
      );
  }
  const kinds = new Set(list.map((a) => a.stack.resource));
  if (kinds.size !== 1 || (resource && !kinds.has(resource)))
    throw new Error(
      'Use one fiber material, and the mat fiber for repair; nothing was reserved.',
    );
  if (list.reduce((t, a) => t + foodTenths(a.quantity), 0) !== n)
    throw new Error(
      `Exactly ${String(n / 10)} units are required; nothing was reserved.`,
    );
  return list;
}
/** Moves up to `n` tenths of reserved fiber into the mat as lots, keeping identity and origin. */
function incorporate(
  c: V7ActionContext,
  j: CollectiveWork,
  o: V7Object,
  n: number,
) {
  const w = c.world,
    moved: V7Data[] = [];
  for (const s of reserved(w, j.id)) {
    if (n <= 0) break;
    const k = Math.min(n, tenths(s)),
      whole = k === tenths(s),
      piece = whole ? s : { ...materialPortion(s, k), id: v7Id(w, 'item') };
    if (!whole) foodSetQuantity(s, tenths(s) - k);
    else w.stacks = w.stacks.filter((x) => x.id !== s.id);
    const l: Lot = {
      ...lotOf(piece),
      sourceOwner: c.actor.id,
      incorporatedAt: w.tick,
    };
    o.data.lots = [...lotsOf(o), l];
    moved.push({ id: l.id, quantity: l.quantity, origin: l.origin });
    n -= k;
  }
  j.pending = sum(reserved(w, j.id));
  return moved;
}

function check(c: V7ActionContext, j: CollectiveWork, o: V7Object) {
  const w = c.world,
    trimmed: { item: string; quantity: number; condition: number }[] = [];
  if (j.mode === 'assemble') {
    // The needed tenths stay in the mat, most intact first; the rest is trimmed off.
    let left = Number(o.data.required);
    const kept: Lot[] = [];
    for (const l of [...lotsOf(o)].sort((a, b) => b.condition - a.condition)) {
      const q = tenths(l),
        k = Math.min(q, left);
      left -= k;
      if (k) kept.push({ ...l, quantity: k / 10, quantityTenths: k });
      if (q > k) {
        const s = stackOf(
          w,
          l,
          q - k,
          c.actor.id,
          c.actor.position,
          l.condition < SOUND ? 'scrap' : 'offcut',
        );
        trimmed.push({
          item: s.id,
          quantity: s.quantity,
          condition: l.condition,
        });
      }
    }
    o.data.lots = kept;
    o.data.steps = ASSEMBLY.length;
  }
  for (const s of reserved(w, j.id)) delete s.reservedFor;
  const m = measure(w, o),
    passed = m.missingTenths === 0 && m.condition >= SOUND;
  j.status = 'completed';
  j.outputs = [o.id, ...trimmed.map((t) => t.item)];
  o.data.status = passed ? 'complete' : 'failed';
  o.data.stage = 'lift-check';
  o.data.workId = null;
  o.data.checkedAt = w.tick;
  o.data.passedTrials = [];
  refresh(w, o);
  const data = {
    mat: o.id,
    operation: j.mode,
    passed,
    ...m,
    retainsFootprint: passed,
    trimmed: v7Json(trimmed),
    returned: v7Json(
      j.escrow.filter((id) => w.stacks.some((s) => s.id === id)),
    ),
  };
  if (j.mode === 'repair')
    c.emit(
      'fiber-mat-repaired',
      'Repair rounds finished and the lift check was rerun.',
      data,
      o.id,
    );
  c.emit(
    passed ? 'fiber-mat-completed' : 'fiber-mat-check-failed',
    passed
      ? `Lift check passed: the mat kept its 0.45 m square when lifted and laid down; largest opening ${String(m.largestOpening)} m.`
      : 'Lift check failed: missing fiber or openings over 0.03 m. It stays a failed mat with no use until repaired.',
    data,
    o.id,
  );
}

/** One paid round after rechecking fiber, reach, the square and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const w = c.world,
    o = w.objects.find((o) => o.id === j.target && o.kind === KIND);
  if (!open(j) || !o) throw new Error('This mat work is already settled.');
  if (sum(reserved(w, j.id)) < Number(j.pending ?? 0)) {
    j.x = c.actor.position.x;
    j.y = c.actor.position.y;
    workStop(
      w,
      c.actor,
      j,
      'Reserved fiber was lost; the rest returned.',
      false,
    );
    settle(w, o, j);
    c.emit(
      'fiber-mat-failed',
      'Work stopped because reserved fiber was lost; incorporated fiber stays at the square.',
      summary(w, j),
      j.target,
    );
    sync(c.actor, j);
    return { complete: true, writes: [j.id] };
  }
  if (!v7Reach(c.actor, o.spatial))
    return pause(c, j, 'The mat square is beyond working reach.');
  if (others(w, o.spatial, c.actor.id).length)
    return pause(c, j, 'Another person is on the mat square.');
  const cost = j.mode === 'assemble' && j.completedWork === 0 ? LAYOUT : STEP;
  if (c.actor.vitals.energy < cost)
    return pause(c, j, 'Not enough energy for the next paid round.', {
      requiredEnergy: cost,
    });
  const resumed = j.status === 'paused';
  if (!workPay(c, j, cost))
    throw new Error('Energy changed before the paid round.');
  if (resumed)
    c.emit(
      'fiber-mat-resumed',
      'Unfinished mat work resumed after rechecking fiber, reach, square and energy.',
      summary(w, j),
      o.id,
    );
  const n = j.completedWork,
    plan = j.mode === 'repair' ? REPAIR : ASSEMBLY,
    stage = plan[n - 1] ?? '';
  let change: V7Data = {};
  if (j.mode === 'assemble' && n === 1) {
    const list = reserved(w, j.id),
      intact = v7RoundNumber(
        list.reduce(
          (t, s) => t + s.quantity * unitMass(w, s.resource) * conditionOf(s),
          0,
        ),
      ),
      layout = {
        intactMass: intact,
        requiredMass: NEED,
        layers: 2,
        footprint: [SIDE, SIDE],
        stemLength: 'not represented',
      };
    if (intact + 1e-9 < NEED) {
      workStop(
        w,
        c.actor,
        j,
        'Layout shortfall; all reserved fiber returned once. The layout energy is not refunded.',
        false,
      );
      w.objects = w.objects.filter((x) => x.id !== o.id);
      c.emit(
        'fiber-mat-shortfall',
        `Dry layout short by ${String(v7RoundNumber(NEED - intact))} mass of intact fiber for two crossing layers; no mat was made.`,
        {
          ...summary(w, j),
          ...layout,
          shortfall: v7RoundNumber(NEED - intact),
        },
        null,
      );
      sync(c.actor, j);
      return { complete: true, writes: [j.id] };
    }
    o.data.status = 'weaving';
    o.data.layout = layout;
    change = layout;
  } else if (j.mode === 'assemble' && (n === 2 || n === 3))
    change = {
      incorporated: v7Json(incorporate(c, j, o, n === 2 ? RECIPE / 2 : RECIPE)),
    };
  else if (j.mode === 'repair' && n === 1) {
    // Broken stems come out as scraps, at most one unit per session.
    let left = PATCH;
    const removed: V7Data[] = [];
    for (const l of [...lotsOf(o)].sort((a, b) => a.condition - b.condition)) {
      const q = tenths(l),
        k = Math.min(left, Math.floor(q * (1 - l.condition) + 1e-9));
      if (k <= 0) continue;
      left -= k;
      const s = stackOf(
        w,
        { ...l, condition: 0 },
        k,
        c.actor.id,
        c.actor.position,
        'scrap',
      );
      l.condition = q > k ? v7RoundNumber((q * l.condition) / (q - k)) : 0;
      l.quantity = (q - k) / 10;
      l.quantityTenths = q - k;
      removed.push({ item: s.id, quantity: s.quantity, from: l.id });
    }
    o.data.lots = lotsOf(o).filter((l) => l.quantity > 0);
    change = { removed: v7Json(removed) };
  } else if (j.mode === 'repair' && n === 2)
    change = {
      incorporated: v7Json(
        incorporate(c, j, o, Math.min(PATCH, measure(w, o).missingTenths)),
      ),
    };
  o.data.stage = stage;
  if (j.mode === 'assemble') o.data.steps = n;
  refresh(w, o);
  if (n >= plan.length) {
    check(c, j, o);
    sync(c.actor, j);
    return { complete: true, remaining: 0, writes: [j.id, o.id] };
  }
  c.emit(
    n === 1 && j.mode === 'assemble'
      ? 'fiber-mat-layout'
      : 'fiber-mat-progress',
    `Paid round ${String(n)} of ${String(plan.length)} (${stage}). Unchecked work cannot be used.`,
    { ...summary(w, j), round: n, stage, ...change },
    o.id,
  );
  sync(c.actor, j);
  return { complete: false, remaining: j.remainingWork, writes: [j.id, o.id] };
}

function test(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    id = v7String(c.action.args.sample, 'sample'),
    s = w.stacks.find(
      (x) => x.id === id && x.owner === c.actor.id && !x.reservedFor,
    ),
    r = w.resources.find((r) => r.id === s?.resource);
  if (
    !s ||
    !r ||
    tenths(s) < 1 ||
    s.componentLots ||
    s.mantle ||
    s.frictionKit ||
    s.waterCup
  )
    throw new Error(
      'The sample must be an owned, unreserved, divisible stack of at least 0.1; nothing was spent.',
    );
  v7Spend(c.actor, TEST);
  const m = openMaterial(r),
    condition = conditionOf(s),
    bends = m.flexibility >= BEND,
    intact = condition >= SOUND,
    reason = !STEMS.includes(s.resource)
      ? 'no thin stems: continuous strips cannot form'
      : !untreated(s)
        ? 'treated material: plaiting it is not represented'
        : !bends
          ? 'the stems snap or spring back at the crossings'
          : !intact
            ? 'broken stems do not hold a tucked end'
            : null;
  const scrap: V7Stack = {
    ...materialPortion(s, 1),
    id: v7Id(w, 'item'),
    position: { ...c.actor.position },
    owner: c.actor.id,
    processing: {
      ...(s.processing ?? {}),
      [PART]: {
        role: 'tested-scrap',
        condition: 0,
        from: s.id,
        testedAt: w.tick,
      },
    },
  };
  foodSetQuantity(s, tenths(s) - 1);
  w.stacks.push(scrap);
  w.stacks = w.stacks.filter((x) => x.quantity > 0);
  const value = {
    resource: s.resource,
    origin: s.origin,
    sample: scrap.id,
    passed: !reason,
    reason,
    flexibility: m.flexibility,
    strength: m.strength,
    brittle: !bends || !intact,
    sampleCondition: v7RoundNumber(condition),
    strips: STEMS.includes(s.resource),
    retainingEdge: !reason,
    stemLength: null,
    moisture: null,
    rain: forestClimate(w, c.actor.position).rain ?? null,
  };
  c.actor.extensionState[TESTS] = v7Json(
    [
      ...tests(c.actor).filter(
        (t) => !(t.resource === s.resource && t.origin === s.origin),
      ),
      {
        resource: s.resource,
        origin: s.origin,
        passed: !reason,
        tick: w.tick,
        sample: scrap.id,
      },
    ].slice(-8),
  );
  openRemember(c, {
    key: `${ID}:test:${s.resource}:${s.origin}`,
    subject: s.resource,
    property: 'hand plaiting retention',
    value,
    method: 'physical bend, twist, cross and tuck trial of a 0.1 sample',
    condition: `source ${s.origin}; stem length and moisture not represented`,
    verified: true,
  });
  c.emit(
    'fiber-mat-tested',
    reason
      ? `Plaiting test failed: ${reason}. The sample is kept as tested scrap.`
      : 'Plaiting test passed: stems overlapped into a strip, bent through the crossings and held a tucked end. The sample is kept as tested scrap.',
    value,
    scrap.id,
  );
  return {
    complete: true,
    writes: [scrap.id, ...(w.stacks.includes(s) ? [s.id] : [])],
  };
}

function assemble(c: V7ActionContext): V7HandlerResult {
  const w = c.world;
  if (c.action.args.target)
    throw new Error('No unfinished mat work of yours on this target.');
  const own = workFind(c);
  if (own && open(own))
    throw new Error(
      'Unfinished mat work exists; resume it by target or cancel it.',
    );
  const s = place(c, null),
    list = allocate(c, RECIPE),
    resource = list[0]?.stack.resource ?? '';
  if (c.actor.vitals.energy < LAYOUT)
    throw new Error(
      'Not enough energy for the layout round; nothing was reserved.',
    );
  const j = workCreate(c, 'assemble', ASSEMBLY.length),
    o: V7Object = {
      id: v7Id(w, 'mat'),
      kind: KIND,
      name: 'Fiber mat',
      spatial: s,
      visual: {
        component: KIND,
        color: w.resources.find((r) => r.id === resource)?.color ?? '#c4b679',
        accent: '#6e5639',
        label: 'Fiber mat',
        state: 'layout',
      },
      data: {
        status: 'layout',
        stage: 'reserved',
        steps: 0,
        maker: c.actor.id,
        workId: j.id,
        resource,
        required: needed(w, resource),
        holder: null,
        lots: [],
        trials: [],
        passedTrials: [],
        inspectedBy: {},
      },
      createdBy: c.actor.id,
      createdAt: w.tick,
      revision: REVISION,
    };
  w.objects.push(o);
  j.target = o.id;
  workReserve(c, j, list);
  w.stacks = w.stacks.filter((x) => x.quantity > 0);
  j.pending = RECIPE;
  refresh(w, o);
  c.emit(
    'fiber-mat-started',
    'Square checked; four units of tested fiber were reserved and stay carried until the strip rounds use them.',
    summary(w, j),
    o.id,
  );
  return advance(c, j);
}

function mat(c: V7ActionContext, makerOnly: boolean): V7Object {
  const id = v7String(c.action.args.target, 'target'),
    o = c.world.objects.find((o) => o.id === id && o.kind === KIND);
  if (!o) throw new Error('The target is not a fiber mat.');
  if (holderOf(o) !== c.actor.id && !v7Reach(c.actor, o.spatial))
    throw new Error('The mat is beyond reach.');
  if (makerOnly && o.data.maker !== c.actor.id)
    throw new Error('Only the person who made this mat may change or move it.');
  if (makerOnly && o.data.workId)
    throw new Error('Work on it is still open; resume or cancel it first.');
  return o;
}
function lying(c: V7ActionContext, o: V7Object, what: string) {
  if (holderOf(o)) throw new Error(`Place the mat before you ${what} it.`);
  if (others(c.world, o.spatial, c.actor.id).length)
    throw new Error('Someone else is on the mat; nothing was spent.');
}

function repair(c: V7ActionContext): V7HandlerResult {
  const own = workFind(c);
  if (own && open(own))
    throw new Error(
      'Unfinished mat work exists; resume it by target or cancel it.',
    );
  const w = c.world,
    o = mat(c, true);
  lying(c, o, 'repair');
  if (!FINISHED.includes(statusOf(o)))
    throw new Error(
      'Only a finished mat can be repaired; dismantle loose work.',
    );
  if (
    Number(record(o.data.inspectedBy)[c.actor.id] ?? -1) <
    Number(o.data.checkedAt ?? 0)
  )
    throw new Error(
      'Inspect the mat after its last check to find the damage; nothing was reserved.',
    );
  const broken = lotsOf(o).reduce(
    (n, l) => n + Math.floor(tenths(l) * (1 - l.condition) + 1e-9),
    0,
  );
  if (!Math.min(PATCH, broken) && !measure(w, o).missingTenths)
    throw new Error('No broken or missing fiber found; nothing was reserved.');
  const list = allocate(c, PATCH, resourceOf(o));
  if (c.actor.vitals.energy < STEP)
    throw new Error(
      'Not enough energy for the first paid round; nothing was reserved.',
    );
  const j = workCreate(c, 'repair', REPAIR.length);
  j.target = o.id;
  j.prior = statusOf(o);
  workReserve(c, j, list);
  w.stacks = w.stacks.filter((x) => x.quantity > 0);
  j.pending = PATCH;
  o.data.workId = j.id;
  o.data.status = 'repairing';
  o.data.passedTrials = [];
  refresh(w, o);
  c.emit(
    'fiber-mat-started',
    'Repair started; one replacement unit is reserved and the mat cannot be used until checked.',
    summary(w, j),
    o.id,
  );
  return advance(c, j);
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const o = mat(c, false),
    w = c.world;
  v7Spend(c.actor, LOOK);
  const m = measure(w, o),
    value = {
      status: statusOf(o),
      stage: o.data.stage ?? null,
      resource: o.data.resource ?? null,
      width: SIDE,
      length: SIDE,
      ...m,
      looseEnds: m.brokenTenths > 0,
      moisture: null,
      rain: forestClimate(w, o.spatial).rain ?? null,
      position: { x: o.spatial.x, y: o.spatial.y },
      holder: holderOf(o),
      maker: o.data.maker ?? null,
      on: holderOf(o) ? [] : others(w, o.spatial, '').map((a) => a.id),
      passedTrials: o.data.passedTrials ?? [],
    };
  o.data.inspectedBy = { ...record(o.data.inspectedBy), [c.actor.id]: w.tick };
  openRemember(c, {
    key: `${o.id}:mat-condition`,
    subject: o.id,
    property: 'size, fiber, gaps and condition',
    value: v7Json(value),
    method: 'direct inspection',
    condition: 'Moisture is not represented; nothing was repaired.',
    verified: false,
  });
  c.emit(
    'fiber-mat-inspected',
    'Mat inspected; only visible size, fiber, openings and condition are reported.',
    { mat: o.id, ...value },
    o.id,
  );
  return { complete: true, writes: [o.id] };
}

function trial(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    o = mat(c, false);
  lying(c, o, 'sit on');
  if (statusOf(o) !== 'complete')
    throw new Error(
      'Only a complete mat that passed its lift check can be sat on; nothing was spent.',
    );
  if (v7ShapeDistance(c.actor.position, o.spatial) > 0)
    throw new Error('Move onto the mat first; nothing was spent.');
  const g = openConditions(w, o.spatial),
    climate = forestClimate(w, o.spatial),
    rain = climate.rain ?? 0,
    problems = [
      ...(['~', '=', ','].includes(g.ground) ? ['water or a wet bank'] : []),
      ...(g.waterlogging > LIMITS.waterlogging || g.hazards.length
        ? ['saturated or hazardous ground']
        : []),
      ...(!climate.indoor && rain > 0 ? ['rain on the mat'] : []),
    ];
  if (problems.length)
    throw new Error(
      `Sitting needs dry firm ground: ${problems.join('; ')}. Nothing was spent.`,
    );
  v7Spend(c.actor, LOOK);
  const m = measure(w, o),
    held = m.condition >= SOUND && m.missingTenths === 0,
    result = {
      actor: c.actor.id,
      tick: w.tick,
      passed: held,
      weaveRetained: held,
      slipped: false,
      broke: !held,
      skinContact: held ? 'tucked dry stems' : 'loose broken stems',
      flattening: 'not represented',
      condition: m.condition,
      ground: g.regime,
      rain,
      comfort: 0,
    };
  o.data.trials = [
    ...(Array.isArray(o.data.trials) ? o.data.trials : []),
    result,
  ].slice(-6);
  if (held)
    o.data.passedTrials = [
      ...new Set([
        ...(Array.isArray(o.data.passedTrials)
          ? o.data.passedTrials.map(String)
          : []),
        c.actor.id,
      ]),
    ];
  c.emit(
    'fiber-mat-trial',
    held
      ? 'Sat on the mat for one round: the weave held under this person, did not slip and showed no loose sharp stems. No comfort or warmth effect is represented.'
      : 'Sitting trial failed: the weave did not hold under this person.',
    { mat: o.id, ...result },
    o.id,
  );
  return { complete: true, writes: [o.id] };
}

function lift(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    o = mat(c, true);
  lying(c, o, 'lift');
  if (!FINISHED.includes(statusOf(o)))
    throw new Error(
      'Loose work falls apart when lifted; dismantle it instead.',
    );
  v7Spend(c.actor, LOOK);
  for (const l of lotsOf(o))
    stackOf(w, l, tenths(l), c.actor.id, c.actor.position, 'mat', o.id);
  o.data.lots = [];
  o.data.holder = c.actor.id;
  o.spatial = { ...o.spatial, x: c.actor.position.x, y: c.actor.position.y };
  refresh(w, o);
  c.emit(
    'fiber-mat-lifted',
    'Mat lifted and carried; its fiber counts as carried load.',
    { mat: o.id, ...measure(w, o), status: statusOf(o) },
    o.id,
  );
  return { complete: true, writes: [o.id] };
}

function put(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    o = mat(c, true);
  if (holderOf(o) !== c.actor.id)
    throw new Error('Lift the mat before placing it.');
  const s = place(c, o.id);
  v7Spend(c.actor, LOOK);
  o.data.lots = carried(w, o).map(lotOf);
  w.stacks = w.stacks.filter((x) => x.reservedFor !== o.id);
  o.data.holder = null;
  o.spatial = s;
  refresh(w, o);
  c.emit(
    'fiber-mat-placed',
    'The same mat was laid on the square; it does not block movement.',
    { mat: o.id, x: s.x, y: s.y, ...measure(w, o), status: statusOf(o) },
    o.id,
  );
  return { complete: true, writes: [o.id] };
}

function dismantle(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    o = mat(c, true);
  lying(c, o, 'dismantle');
  v7Spend(c.actor, DISMANTLE);
  const recovered: string[] = [],
    scraps: string[] = [];
  for (const l of lotsOf(o)) {
    const q = tenths(l),
      good = Math.min(q, Math.round(q * l.condition + 1e-9));
    if (good)
      recovered.push(
        stackOf(
          w,
          { ...l, condition: 1 },
          good,
          c.actor.id,
          c.actor.position,
          'recovered',
        ).id,
      );
    if (q > good)
      scraps.push(
        stackOf(
          w,
          { ...l, condition: 0 },
          q - good,
          c.actor.id,
          c.actor.position,
          'scrap',
        ).id,
      );
  }
  w.objects = w.objects.filter((x) => x.id !== o.id);
  const total = (ids: string[]) =>
    sum(w.stacks.filter((s) => ids.includes(s.id))) / 10;
  c.emit(
    'fiber-mat-dismantled',
    'Mat taken apart: intact stems are recovered and broken ones kept as scraps. Nothing is refunded.',
    {
      mat: o.id,
      recovered,
      scraps,
      recoveredQuantity: total(recovered),
      scrapQuantity: total(scraps),
      energy: DISMANTLE,
    },
    null,
  );
  return { complete: true, writes: [...recovered, ...scraps] };
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const j = workFind(c);
  if (!j || !open(j))
    throw new Error('No unfinished mat work of yours to cancel.');
  const o = c.world.objects.find((o) => o.id === j.target);
  workStop(
    c.world,
    c.actor,
    j,
    'Cancelled; unincorporated reserved fiber returned once. Spent energy is not refunded.',
    false,
  );
  settle(c.world, o, j);
  c.emit(
    'fiber-mat-cancelled',
    'Mat work cancelled; incorporated fiber stays at the square as real work.',
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
  // The bound action continues each round; assemble or repair naming the mat resumes it.
  if (
    own &&
    open(own) &&
    ['assemble', 'repair'].includes(mode) &&
    (c.operation?.first === false ||
      (!!own.target && c.action.args.target === own.target) ||
      c.action.args.processId === own.id)
  )
    return advance(c, own);
  if (mode === 'test') return test(c);
  if (mode === 'assemble') return assemble(c);
  if (mode === 'repair') return repair(c);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'trial') return trial(c);
  if (mode === 'lift') return lift(c);
  if (mode === 'place') return put(c);
  if (mode === 'dismantle') return dismantle(c);
  if (mode === 'cancel') return cancel(c);
  throw new Error('Unknown mat mode.');
}

/** Unworked rounds pause; carried mats follow their holder; mat fiber wears every round. */
function environment(w: V7World) {
  for (const j of collectiveJobs(w, ID).filter(open)) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a) continue;
    for (const s of reserved(w, j.id)) s.position = { ...a.position };
    if (j.status === 'active' && j.lastPaid < w.tick) {
      j.status = 'paused';
      j.reason =
        'Not worked this round; completed rounds and reserved fiber are kept.';
      forestEvent(
        w,
        'fiber-mat-paused',
        'Mat work paused because it was not worked this round.',
        a.position,
        a.id,
        summary(w, j),
        j.target,
      );
    }
    sync(a, j);
  }
  for (const o of w.objects.filter((o) => o.kind === KIND)) {
    const holder = w.actors.find((a) => a.id === holderOf(o));
    if (holder) {
      o.spatial = { ...o.spatial, x: holder.position.x, y: holder.position.y };
      for (const s of carried(w, o)) s.position = { ...holder.position };
    }
    const occupied =
        !holder &&
        w.actors.some(
          (a) =>
            a.vitals.health > 0 && v7ShapeDistance(a.position, o.spatial) <= 0,
        ),
      loss = occupied ? WEAR.occupied : WEAR.exposed;
    for (const l of lotsOf(o))
      l.condition = v7RoundNumber(Math.max(0, l.condition - loss));
    for (const s of holder ? carried(w, o) : []) {
      const p = part(s);
      p.condition = v7RoundNumber(Math.max(0, Number(p.condition ?? 1) - loss));
    }
    o.data.wear = { tick: w.tick, occupied, loss };
    const m = measure(w, o);
    if (statusOf(o) === 'complete' && m.condition < SOUND) {
      o.data.status = 'needs-repair';
      o.data.passedTrials = [];
      forestEvent(
        w,
        'fiber-mat-damaged',
        `Wear lowered the mat to condition ${String(m.condition)}; openings exceed 0.03 m and it needs repair and a new sitting trial.`,
        o.spatial,
        null,
        { mat: o.id, ...m },
        o.id,
      );
    }
    refresh(w, o);
  }
}

export const LONG_FIBER_MAT: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex16',
  dependencies: ['foundation-open@1'],
  description:
    'A small hand-plaited portable sitting mat from tested thin stem fiber: a material test, a paid layout, six paid weaving rounds and a lift check, inspection, sitting trials, wear, repair, carrying, placing and dismantling. No comfort, warmth or weather effect.',
  reuse: {
    experiment:
      'ex16 branch-screen@1 and ex15 simple-shelter@1 (staged paid work, pause, resume, cancel, death, sound condition 0.5, inspect, repair, dismantle); ex14 arrange-resting-material@1 (resting surface with no facility bonus)',
    source:
      'collective-work.ts (escrow, paid work, stop); material-lots.ts; open-physical.ts (ground conditions and probe-revealed material values); open-foundation.ts (personal records); forest-climate.ts (rain); long-shelter-exposure.ts (waterlogging limit)',
    description:
      'Implementation reuse only; no earlier ability, object or mastery is inherited and earlier packages are unchanged. Fiber comes from the unchanged base gather.',
  },
  abilities: [
    {
      id: ID,
      name: 'Hand-weave a fiber mat',
      function:
        'Test a 0.1 sample of owned fiber, then hand-plait 4 units into one portable 0.45 x 0.45 m sitting mat; inspect, sit on, repair, lift, place, dismantle or cancel.',
      equivalence: 'mat:hand-plaited-fiber-sitting-mat:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: [
              'test',
              'assemble',
              'inspect',
              'trial',
              'repair',
              'lift',
              'place',
              'dismantle',
              'cancel',
            ],
          },
          sample: { type: 'string' },
          materials: {
            type: 'array',
            items: v7ObjectSchema({
              itemId: { type: 'string' },
              quantity: { type: 'number', minimum: 0.1 },
            }),
          },
          x: { type: 'number' },
          y: { type: 'number' },
          target: { type: 'string' },
          processId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: {
        target: 'optional-exact-visible',
        sample: 'optional-owned',
      },
      prerequisites: [],
      learning: 3,
      costs:
        'Study: 3 rounds. A unit is one world unit of fiber (dry grass: 0.1 mass). test (sample: owned stack): 1 round, 0.5 energy. assemble (x, y: a 0.45 m square in reach on land, clear of plants, objects and other people; materials: exactly 4 owned units of one fiber from sources your passing test covers): a 0.5-energy layout round, then 6 paid rounds of 1 energy (2 strip-forming, 3 interlacing and edge-tucking, 1 lift check), continuing each round; with target it resumes. inspect (target in reach): 1 round, 0.2. trial (stand on a complete mat on firm ground, waterlogging at most 0.1, no rain, nobody else on it): 1 round, 0.2. Maker only: repair (target inspected since its last check; materials: 1 unit of its fiber): 3 rounds of 1 energy (remove broken stems, interlace, lift check); lift, or place (carried mat; x, y as for assemble): 1 round, 0.2; dismantle: 1 round, 0.5. cancel: none.',
      effects:
        'A test passes only for thin stems (dry grass, reeds) with flexibility at least 0.4 and an intact untreated sample, which stays as owned tested scrap; stem length and moisture are not represented. The layout needs 0.3645 mass of intact fiber (two crossing layers of 0.6 per m2, x1.5 for overlaps and tucked edges); less is a measured shortfall that returns all fiber. Strip rounds move the fiber into the work. The lift check keeps the needed tenths (dry grass 3.7), returns the rest as owned offcuts or scraps, and passes with full fiber and condition at least 0.5 (largest opening 0.06 x (1 - condition) m); else the mat stays failed. Condition (intact share) falls 0.0005 per round, 0.002 with a person on the mat; below 0.5 it needs repair and a new trial. Repair turns up to 1 unit of broken stems into scrap and refills with new fiber. Dismantle returns intact fiber and scraps. A carried mat is reserved owned fiber and counts as load. Trials record hold, slip and loose stems only; no comfort, warmth, rain, wind or rest effect. Unworked rounds, low energy, leaving reach or a person on the square pause at no charge; cancel or death returns unused fiber once and leaves the work. Nothing is refunded.',
      handler: 'long.hand-weave-fiber-mat',
      revision: REVISION,
      authored: false,
      // The completion event carries no qualified flag: a finished mat earns no milestone.
      practiceEvidence: 'fiber-mat-completed',
      dependencies: { abilities: [], resources: ['dry-grass'], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Paid one-round stages persist across interruption; resuming pays only the next stage after rechecks. Other modes take one round.',
      },
    },
  ],
  handlers: { 'long.hand-weave-fiber-mat': execute },
  processes: {},
  visualComponents: [KIND],
  events: [
    'fiber-mat-tested',
    'fiber-mat-started',
    'fiber-mat-layout',
    'fiber-mat-shortfall',
    'fiber-mat-progress',
    'fiber-mat-paused',
    'fiber-mat-resumed',
    'fiber-mat-cancelled',
    'fiber-mat-failed',
    'fiber-mat-completed',
    'fiber-mat-check-failed',
    'fiber-mat-inspected',
    'fiber-mat-trial',
    'fiber-mat-lifted',
    'fiber-mat-placed',
    'fiber-mat-damaged',
    'fiber-mat-repaired',
    'fiber-mat-dismantled',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
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
        'Performer died; unincorporated reserved fiber was left on the ground once.',
        true,
      );
      settle(w, o, j);
      forestEvent(
        w,
        'fiber-mat-failed',
        'Mat work stopped by death; incorporated fiber stays at the square.',
        a.position,
        a.id,
        summary(w, j),
        j.target,
      );
      sync(a, j);
    }
    // A carried mat is laid down where its holder died, as the same mat.
    for (const o of w.objects.filter(
      (o) => o.kind === KIND && holderOf(o) === a.id,
    )) {
      o.data.lots = carried(w, o).map(lotOf);
      w.stacks = w.stacks.filter((x) => x.reservedFor !== o.id);
      o.data.holder = null;
      o.spatial = square(a.position.x, a.position.y);
      refresh(w, o);
      forestEvent(
        w,
        'fiber-mat-placed',
        'The carried mat was left where its holder died.',
        a.position,
        a.id,
        { mat: o.id, reason: 'holder died', ...measure(w, o) },
        o.id,
      );
    }
  },
};
