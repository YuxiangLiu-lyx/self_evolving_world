import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Package,
  V7Resource,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import {
  v7Clone,
  v7Id,
  v7Json,
  v7Number,
  v7Record,
  v7RoundNumber,
  v7String,
} from './continuous-data.js';
import { v7Distance } from './continuous-geometry.js';
import { forestEvent } from './forest-climate.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { materialPortion } from './material-lots.js';
import { openConditions, openMaterial } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workCreate,
  workPay,
  workReserve,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';

const ID = 'hand-twist-fiber-cord';
const REVISION = `${ID}@1`;
const STATE = `long:work:${ID}`;
const SAMPLES = `long:${ID}:samples`;
/** Processing key of fiber that passed through this operation (tested lot, scrap, workpiece, cord). */
const PART = 'fiberCord';
const LAW = 'fiber-cord@1';
const SAMPLE = 0.5;
const STEP = 1;
const LOOK = 0.2;
const TRIAL = 0.5;
const STAGES = [
  'separate-align',
  'twist-first-section',
  'counter-ply-extend',
  'release-check',
];
/** Thin stems separate into strands: the stem set of ex16 hand-weave-fiber-mat@1. */
const STEMS = ['dry-grass', 'reed'];
interface Strand {
  /** Stem length in m: an upper bound on the ply length, since no splices are made. */
  length: number;
  /** Solid density in kg/m3 (mass units read as kg). */
  density: number;
  /** Dry tensile strength and modulus in Pa. */
  strength: number;
  modulus: number;
  wetWeakening: number;
  creep: number;
}
/** Registered strand laws. Reed reuses the existing reed law of open-shelter-material.ts
 * (version 2) unchanged; no law exists for dry grass, so its strand length and tensile
 * response stay unrepresented and no cord can be made from it. */
const STRANDS: Partial<Record<string, Strand>> = {
  reed: {
    length: 1.8,
    density: 500,
    strength: 8e6,
    modulus: 2e8,
    wetWeakening: 0.55,
    creep: 0.003,
  },
};
/** Flexibility needed to bend strands round a tight twist without cracking (the mat's crossings need 0.4). */
const BEND = 0.5;
/** ex15/ex16 sound condition: the intact share needed to separate, twist and hold form. */
const SOUND = 0.5;
/** A 30 degree ply helix: twist take-up 1/cos 30 and load efficiency cos^2 30. */
const TAKEUP = 2 / Math.sqrt(3);
const EFFICIENCY = 0.75;
/** Untwisted end of each ply held at each end of the cord: its loose ends. */
const END = 0.02;
/** Ply diameters a bare-handed person can roll and twist tightly. */
const PLY = { min: 0.001, max: 0.012 };
const LENGTH = { min: 0.05, max: 0.3 };
/** The sample's two-ply test twist and its small opposing-hand pull (N). */
const TEST_LENGTH = 0.1;
const TEST_PULL = 5;
/** Two-hand pull at full health (N), grip per metre of cord width (N/m), cord held per hand and free span (m). */
const HAND_PULL = 200;
const GRIP = 10000;
const HOLD = 0.05;
const SPAN = 0.02;
/** A day spans 80 rounds; read as 24 hours, one round lasts 1080 s. */
const ROUND_SECONDS = 1080;
/** A load above this share of the breaking force breaks the share of strands above it. */
const ONSET = 0.5;
/** Worked fiber wears at ex16 hand-weave-fiber-mat@1's exposed rate per round. */
const WEAR = 0.0005;
/** A passing sample covers its source and processing down to this much lower condition. */
const TOLERANCE = 0.05;
const WORKED = ['workpiece', 'cord', 'fragment'];
/** Stack treatments other packages represent; no twisting law applies over them. */
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
/** Arguments each mode accepts besides mode; any other supplied argument is refused. */
const ARGS: Partial<Record<string, string[]>> = {
  sample: ['materials'],
  make: ['materials', 'requestedLength', 'workId'],
  inspect: ['targetId', 'workId'],
  trial: ['targetId', 'trialForce', 'trialDuration'],
  cancel: ['workId'],
};

/** Observed reasons a sample fails, keyed as recorded. */
const FAILURES = {
  'not-stems':
    'no thin stems: the material does not separate into twistable strands',
  'broken-stems': 'broken stems do not separate into continuous strands',
  cracked: 'the strands cracked instead of bending into a twist',
  'no-strand-law':
    'strand length and tensile response of this fiber are not represented, so no cord can be made from it in this version',
  'broke-under-pull': 'the test twist broke under the small pull',
} as const;

interface Sample extends V7Data {
  resource: string;
  origin: string;
  class: string;
  condition: number;
  passed: boolean;
  tick: number;
  lot: string;
}

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const record = (v: unknown): V7Data =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as V7Data) : {};
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const tenths = (s: { quantity: number }) => foodTenths(s.quantity);
/** Reported lengths in m to 0.1 mm, forces in N to 0.1 N. */
const metres = (x: number) => Math.round(x * 1e4) / 1e4;
const newtons = (x: number) => Math.round(x * 10) / 10;
const part = (s: V7Stack): V7Data => record(s.processing?.[PART]);
const roleOf = (s: V7Stack) => {
  const role = part(s).role;
  return typeof role === 'string' ? role : null;
};
const material = (w: V7World, id: string) =>
  w.resources.find((r) => r.id === id);
const band = (c: number) =>
  c >= 0.95 ? 'intact' : c >= SOUND ? 'worn' : 'broken';
function conditionOf(s: V7Stack): number {
  const own = part(s).condition,
    mat = record(s.processing?.fiberMatLot).condition;
  return typeof own === 'number' ? own : typeof mat === 'number' ? mat : 1;
}
/** Water share of fresh mass: the existing hydration rule of open-woven-physics.ts. */
const wetness = (r: V7Resource) =>
  Math.min(0.9, Math.max(0, r.properties?.moisture ?? 0));
const weakening = (law: Strand, r: V7Resource) =>
  Math.max(0.2, 1 - law.wetWeakening * wetness(r));

/** Fiber classes a lot carries for sample coverage; null if no twisting rule applies to it. */
function classesOf(s: V7Stack): string[] | null {
  if (TREATED.some((k) => s[k] !== undefined)) return null;
  const keys = Object.keys(s.processing ?? {}),
    role = roleOf(s);
  if (!keys.length) return ['raw'];
  if (role) {
    const list = strings(part(s).classes);
    return ['tested-lot', 'workpiece'].includes(role) && list.length
      ? list
      : null;
  }
  const mat = record(s.processing?.fiberMatLot).role;
  return keys.length === 1 && keys[0] === 'fiberMatLot'
    ? [`fiber-mat-${typeof mat === 'string' ? mat : 'lot'}`]
    : null;
}
function samples(a: V7Actor): Sample[] {
  const raw = a.extensionState[SAMPLES];
  return Array.isArray(raw) ? (raw as unknown as Sample[]) : [];
}
function covered(a: V7Actor, s: V7Stack, classes: string[]) {
  const c = conditionOf(s);
  return classes.every((k) =>
    samples(a).some(
      (t) =>
        t.passed &&
        t.resource === s.resource &&
        t.origin === s.origin &&
        t.class === k &&
        c >= t.condition - TOLERANCE - 1e-9,
    ),
  );
}

/** Cord geometry from conserved solid volume: two plies, each holding half the volume over the
 * twisted length times the take-up plus one loose end at each end. Strands longer than the ply
 * are doubled back inside it, so volume, not stem length, sets the section. */
function shape(r: V7Resource, law: Strand, n: number, length: number) {
  const volume = ((n / 10) * r.mass * (1 - wetness(r))) / law.density,
    fiber = length * TAKEUP + 2 * END,
    area = volume / 2 / fiber;
  return {
    volume,
    plyFiberLength: fiber,
    plyArea: area,
    plyDiameter: 2 * Math.sqrt(area / Math.PI),
  };
}
const breaking = (r: V7Resource, law: Strand, area: number, c: number) =>
  2 * area * law.strength * weakening(law, r) * EFFICIENCY * c;
/** Twisted lengths whose plies stay within the hand-twistable thickness, given the volume. */
function feasible(law: Strand, volume: number): number[] | null {
  const length = (area: number) => (volume / 2 / area - 2 * END) / TAKEUP,
    low = Math.max(LENGTH.min, length((Math.PI * PLY.max ** 2) / 4)),
    high = Math.min(
      LENGTH.max,
      length((Math.PI * PLY.min ** 2) / 4),
      (law.length - 2 * END) / TAKEUP,
    );
  return low <= high ? [metres(low), metres(high)] : null;
}

/** Hands and room for a short cord: no other person within the body radius plus half its length. */
function crowded(w: V7World, a: V7Actor, length: number): string | null {
  if (a.vitals.health <= 0) return 'no usable hands';
  if (['~', '='].includes(openConditions(w, a.position).ground))
    return 'you are standing in water';
  return w.actors.some(
    (o) =>
      o.id !== a.id &&
      o.vitals.health > 0 &&
      v7Distance(o.position, a.position) < a.radius + length / 2 + o.radius,
  )
    ? 'another person is within the work circle'
    : null;
}
function relevant(c: V7ActionContext, mode: string, allowed = ARGS[mode]) {
  const extra = Object.keys(c.action.args).filter(
    (k) =>
      k !== 'mode' &&
      c.action.args[k] !== undefined &&
      !(allowed ?? []).includes(k),
  );
  if (extra.length)
    throw new Error(
      `Irrelevant argument(s) for ${mode}: ${extra.join(', ')}. Nothing was spent.`,
    );
}
/** Exact owned, unreserved items and 0.1-step quantities; never a resource name. */
function allocations(c: V7ActionContext) {
  const raw = c.action.args.materials;
  if (!Array.isArray(raw) || !raw.length || raw.length > 10)
    throw new Error(
      'materials must list 1-10 exact owned items with quantities; nothing was spent.',
    );
  const used = new Set<string>();
  return raw.map((v) => {
    const r = v7Record(v),
      id = v7String(r.stackId, 'stackId'),
      q = v7Number(r.quantity, 'quantity', 0.1),
      n = Math.round(q * 10);
    if (Math.abs(q * 10 - n) > 1e-7)
      throw new Error('Quantities use 0.1-unit steps; nothing was spent.');
    if (used.has(id))
      throw new Error('List each item once; nothing was spent.');
    used.add(id);
    const stack = c.world.stacks.find(
      (s) =>
        s.id === id &&
        s.owner === c.actor.id &&
        !s.reservedFor &&
        s.quantity > 0,
    );
    if (!stack)
      throw new Error(
        'stackId must be the exact id of an owned, unreserved item; resource names are not accepted. Nothing was spent.',
      );
    if (tenths(stack) < n)
      throw new Error(
        `${id} holds only ${String(stack.quantity)}; nothing was spent.`,
      );
    return { stack, quantity: n / 10 };
  });
}

/** Reusable visual metadata of a lot from this operation: measured values only. */
function view(w: V7World, s: V7Stack): V7Data {
  const p = part(s),
    d = Number(p.plyDiameter ?? 0),
    role = roleOf(s);
  return {
    component: 'fiber-cord',
    item: s.id,
    state:
      role === 'workpiece' && typeof p.status === 'string' ? p.status : role,
    color: material(w, s.resource)?.color ?? '#b9b875',
    quantity: s.quantity,
    length: typeof p.length === 'number' ? p.length : null,
    twistedLength: typeof p.twisted === 'number' ? p.twisted : null,
    overallLength: typeof p.overall === 'number' ? p.overall : null,
    plies: typeof p.plies === 'number' ? p.plies : null,
    plyDiameter: d ? metres(d) : null,
    sectionRange: d ? [metres(d), metres(2 * d)] : null,
    twist: p.twist ?? null,
    looseEnds: typeof p.looseEnds === 'number' ? p.looseEnds : null,
    frayedEnds: Number(p.frayedEnds ?? 0),
    fraying: v7RoundNumber(1 - conditionOf(s)),
    condition: v7RoundNumber(conditionOf(s)),
    progress: role === 'workpiece' ? Number(p.stages ?? 0) / 4 : null,
    fragments: p.fragments ?? null,
    trials: Array.isArray(p.trials) ? p.trials.length : 0,
  };
}
/** Everything inspection can record; strength and safe load stay unknown. */
function look(w: V7World, s: V7Stack): V7Data {
  const v = view(w, s),
    c = conditionOf(s),
    p = part(s);
  return {
    ...v,
    role: roleOf(s),
    resource: s.resource,
    origin: s.origin,
    mass: v7RoundNumber(s.quantity * (material(w, s.resource)?.mass ?? 0)),
    reserved: !!s.reservedFor,
    visibleDamage:
      c < 1
        ? `about ${String(Math.round((1 - c) * 100))}% of strands broken or frayed`
        : 'none',
    lastTrial: Array.isArray(p.trials) ? (p.trials.at(-1) ?? null) : null,
    breakingForce: null,
    unknown:
      'breaking force, safe load and moisture change are not determined by inspection',
  };
}

const ownJobs = (w: V7World, a: V7Actor) =>
  collectiveJobs(w, ID).filter((j) => j.owner === a.id);
const current = (w: V7World, a: V7Actor) => ownJobs(w, a).find(open);
const workpieceOf = (w: V7World, j: CollectiveWork) =>
  j.target ? w.stacks.find((s) => s.id === j.target) : undefined;
/** Reserved input fiber of the work not yet handled. */
const pending = (w: V7World, j: CollectiveWork) =>
  w.stacks.filter(
    (s) => s.reservedFor === j.id && s.id !== j.target && s.quantity > 0,
  );
function summary(w: V7World, j: CollectiveWork): V7Data {
  const piece = workpieceOf(w, j);
  return {
    workId: j.id,
    actor: j.owner,
    status: j.status,
    stage: STAGES[j.completedWork - 1] ?? 'reserved',
    nextStage: open(j) ? (STAGES[j.completedWork] ?? null) : null,
    completedRounds: j.completedWork,
    remaining: j.remainingWork,
    paidEnergy: v7RoundNumber(j.paidEnergy),
    resource: typeof j.resource === 'string' ? j.resource : null,
    origin: typeof j.origin === 'string' ? j.origin : null,
    requestedLength: Number(j.cordLength ?? 0),
    reserved: pending(w, j).map((s) => ({ item: s.id, quantity: s.quantity })),
    workpiece: piece?.id ?? null,
    scrap: strings(j.scrap),
    position: { x: j.x, y: j.y },
    visual: piece ? view(w, piece) : null,
  };
}
function sync(a: V7Actor, j: CollectiveWork) {
  a.extensionState[STATE] = v7Json(j);
}
/** A released workpiece stays as the real unfinished or failed material it is. */
function settle(piece: V7Stack | undefined, status: string) {
  const p = piece ? part(piece) : null;
  if (!p || roleOf(piece as V7Stack) !== 'workpiece') return;
  p.status = status;
  p.workId = null;
}
function pause(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
): V7HandlerResult {
  j.status = 'paused';
  j.reason = reason;
  c.emit(
    'fiber-cord-paused',
    `${reason} Paid stages, reserved fiber and the workpiece are kept; nothing was spent.`,
    { ...summary(c.world, j), requiredEnergy: STEP },
    j.target ?? j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id] };
}
function fail(
  c: V7ActionContext,
  j: CollectiveWork,
  reason: string,
): V7HandlerResult {
  const w = c.world,
    piece = workpieceOf(w, j);
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  workStop(w, c.actor, j, reason, false);
  settle(piece, 'failed');
  c.emit(
    'fiber-cord-failed',
    `${reason} The actual loose, twisted or damaged fiber stays as it is; nothing is refunded.`,
    summary(w, j),
    piece?.id ?? j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

/** Round 1: measure the usable fiber, set broken strands aside and align two ply bundles. */
function align(
  c: V7ActionContext,
  j: CollectiveWork,
  inputs: V7Stack[],
): V7HandlerResult {
  const w = c.world,
    resource = typeof j.resource === 'string' ? j.resource : '',
    r = material(w, resource),
    law = STRANDS[resource];
  if (!r || !law) throw new Error('Missing strand law.');
  const total = inputs.reduce((n, s) => n + tenths(s), 0),
    intact = inputs.reduce((n, s) => n + tenths(s) * conditionOf(s), 0),
    broken = Math.min(total, Math.floor(total - intact + 1e-9)),
    usable = total - broken,
    length = Number(j.cordLength),
    g = shape(r, law, usable, length),
    measured = {
      totalTenths: total,
      brokenTenths: broken,
      usableTenths: usable,
      requestedLength: length,
      plyFiberLength: metres(g.plyFiberLength),
      plyDiameter: metres(g.plyDiameter),
      strandLength: law.length,
      waterShare: wetness(r),
      feasibleLength: feasible(law, g.volume),
    },
    problem =
      usable < 2
        ? 'too little intact fiber for two plies'
        : g.plyFiberLength > law.length
          ? `${String(law.length)} m strands are shorter than the ${String(metres(g.plyFiberLength))} m ply and no splices are made`
          : g.plyDiameter < PLY.min
            ? 'plies would be thinner than 1 mm, too fine to roll by hand'
            : g.plyDiameter > PLY.max
              ? 'plies would be thicker than 12 mm, too thick to twist tightly by hand'
              : null;
  if (problem) {
    workStop(
      w,
      c.actor,
      j,
      `Measured shortfall: ${problem}. All reserved fiber returned once; the round's energy is not refunded.`,
      false,
    );
    openRemember(c, {
      key: `${ID}:make:${resource}:shortfall:${problem.split(' ').slice(0, 3).join('-')}`,
      subject: resource,
      property: 'hand-twisted two-ply cord feasibility',
      value: v7Json({ outcome: 'shortfall', problem, ...measured }),
      method: 'separating and aligning the reserved fiber into two bundles',
      condition: `${String(usable / 10)} usable units for a ${String(length)} m cord`,
      verified: true,
    });
    c.emit(
      'fiber-cord-shortfall',
      `Separating and aligning showed a shortfall: ${problem}. No cord was started; all reserved fiber is returned.`,
      { ...summary(w, j), ...measured, shortfall: problem },
      j.id,
    );
    sync(c.actor, j);
    return { complete: true, writes: [j.id, ...j.escrow] };
  }
  // Broken strands come out first, from the least intact lots, as owned damaged scrap.
  let left = broken;
  const scraps: V7Stack[] = [],
    classes = new Set<string>();
  for (const s of [...inputs].sort(
    (a, b) => conditionOf(a) - conditionOf(b) || (a.id < b.id ? -1 : 1),
  )) {
    for (const k of classesOf(s) ?? []) classes.add(k);
    const k = Math.min(tenths(s), left);
    left -= k;
    if (!k) continue;
    const scrap: V7Stack = {
      ...materialPortion(s, k),
      id: v7Id(w, 'item'),
      owner: c.actor.id,
      position: { ...c.actor.position },
      processing: {
        [PART]: {
          role: 'scrap',
          classes: classesOf(s) ?? [],
          condition: 0,
          from: s.id,
          workId: j.id,
          at: w.tick,
        },
      },
    };
    delete scrap.reservedFor;
    scraps.push(scrap);
  }
  const base = inputs[0];
  if (!base) throw new Error('Missing reserved fiber.');
  const ages = inputs.flatMap((s) =>
      typeof s.harvestedAt === 'number' ? [s.harvestedAt] : [],
    ),
    piece: V7Stack = {
      ...v7Clone(base),
      id: v7Id(w, 'item'),
      quantity: usable / 10,
      quantityTenths: usable,
      owner: c.actor.id,
      reservedFor: j.id,
      position: { ...c.actor.position },
      processing: {
        [PART]: {
          role: 'workpiece',
          status: 'aligned',
          stage: STAGES[0] ?? '',
          stages: 1,
          workId: j.id,
          law: LAW,
          classes: [...classes].sort(),
          condition: v7RoundNumber(Math.min(1, intact / usable)),
          length,
          twisted: 0,
          plied: false,
          plies: 2,
          twist: { ply: 'S', lay: 'Z' },
          overall: metres(length + 2 * END),
          plyDiameter: g.plyDiameter,
          looseEnds: 4,
          frayedEnds: 0,
          from: inputs.map((s) => s.id),
          madeBy: c.actor.id,
          startedAt: w.tick,
        },
      },
    };
  if (ages.length) piece.harvestedAt = Math.min(...ages);
  w.stacks = w.stacks.filter((s) => !inputs.includes(s));
  w.stacks.push(piece, ...scraps);
  j.escrow.push(piece.id);
  j.target = piece.id;
  j.scrap = scraps.map((s) => s.id);
  c.emit(
    'fiber-cord-progress',
    `Paid round 1 of 4 (separate-align): ${String(usable / 10)} units aligned in two bundles${broken ? `, ${String(broken / 10)} broken set aside as scrap` : ''}. Unfinished work is no cord.`,
    {
      ...summary(w, j),
      round: 1,
      ...measured,
      handled: { incorporatedTenths: usable, scrapTenths: broken },
    },
    piece.id,
  );
  sync(c.actor, j);
  return {
    complete: false,
    remaining: j.remainingWork,
    writes: [j.id, piece.id],
  };
}

/** Release check: two interlocked plies must keep a coherent form with positive dimensions. */
function check(
  c: V7ActionContext,
  j: CollectiveWork,
  piece: V7Stack,
): V7HandlerResult {
  const w = c.world,
    p = part(piece),
    r = material(w, piece.resource),
    holds =
      !!r &&
      conditionOf(piece) >= SOUND &&
      openMaterial(r).flexibility >= BEND &&
      p.plied === true &&
      Number(p.length) > 0 &&
      Number(p.plyDiameter) > 0;
  delete piece.reservedFor;
  p.workId = null;
  p.stage = 'release-check';
  p.stages = 4;
  if (holds) {
    p.role = 'cord';
    p.status = 'complete';
    p.untested = true;
    p.completedAt = w.tick;
    p.trials = [];
  } else p.status = 'failed';
  j.status = 'completed';
  j.outputs = [piece.id, ...strings(j.scrap)];
  const value = {
    outcome: holds ? 'complete' : 'unravelled',
    length: Number(p.length),
    plies: 2,
    plyDiameter: metres(Number(p.plyDiameter)),
    condition: conditionOf(piece),
  };
  openRemember(c, {
    key: `${ID}:make:${piece.resource}:${band(conditionOf(piece))}:${value.outcome}`,
    subject: piece.resource,
    property: 'hand-twisted two-ply cord form after release',
    value,
    method: 'four paid rounds of separating, twisting and counter-plying',
    condition: 'bare hands; no tool, anchor, water or added fiber',
    verified: true,
  });
  c.emit(
    holds ? 'fiber-cord-completed' : 'fiber-cord-check-failed',
    holds
      ? `Released: two interlocked plies kept a ${String(value.length)} m cord, ply ${String(value.plyDiameter)} m thick. It is untested; no strength is known.`
      : 'Released: the plies did not keep their form; it stays a failed workpiece, not a cord.',
    { ...summary(w, j), ...value },
    piece.id,
  );
  sync(c.actor, j);
  return {
    complete: true,
    remaining: 0,
    writes: [j.id, ...j.outputs],
  };
}

/** One paid stage after rechecking hands, room, reservation and energy. */
function advance(c: V7ActionContext, j: CollectiveWork): V7HandlerResult {
  const w = c.world;
  if (!open(j)) throw new Error('This cord work is already settled.');
  const inputs = pending(w, j),
    piece = workpieceOf(w, j);
  if (
    j.completedWork === 0
      ? inputs.reduce((n, s) => n + tenths(s), 0) !== Number(j.reservedTenths)
      : piece?.reservedFor !== j.id
  )
    return fail(c, j, 'Reserved fiber or the workpiece is missing.');
  const blocked = crowded(w, c.actor, Number(j.cordLength));
  if (blocked) return pause(c, j, `No room to work: ${blocked}.`);
  if (c.actor.vitals.energy < STEP)
    return pause(c, j, 'Not enough energy for the next paid round.');
  const resumed = j.status === 'paused';
  if (!workPay(c, j, STEP))
    throw new Error('Energy changed before the paid round.');
  c.actor.vitals.energy = v7RoundNumber(Math.max(0, c.actor.vitals.energy));
  j.paidEnergy = v7RoundNumber(j.paidEnergy);
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  if (resumed)
    c.emit(
      'fiber-cord-resumed',
      'Unfinished cord work resumed after rechecking hands, room, reserved fiber and energy.',
      summary(w, j),
      j.target ?? j.id,
    );
  const n = j.completedWork;
  if (n === 1) return align(c, j, inputs);
  if (!piece) throw new Error('Missing workpiece.');
  if (n >= STAGES.length) return check(c, j, piece);
  const p = part(piece),
    r = material(w, piece.resource);
  if (!r || conditionOf(piece) < SOUND || openMaterial(r).flexibility < BEND)
    return fail(c, j, 'Strands broke while being twisted.');
  const length = Number(p.length),
    stage = STAGES[n - 1] ?? '',
    twisted = n === 2 ? metres(length / 2) : length;
  p.twisted = twisted;
  p.plied = n === 3;
  p.status = n === 2 ? 'twisting' : 'plied';
  p.stage = stage;
  p.stages = n;
  c.emit(
    'fiber-cord-progress',
    `Paid round ${String(n)} of 4 (${stage}): ${String(twisted)} m twisted${n === 3 ? ' and counter-plied' : ''}. Unfinished work is no cord.`,
    { ...summary(w, j), round: n, handled: { incorporatedTenths: 0 } },
    piece.id,
  );
  sync(c.actor, j);
  return {
    complete: false,
    remaining: j.remainingWork,
    writes: [j.id, piece.id],
  };
}

function sample(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    list = allocations(c),
    first = list[0];
  if (list.length !== 1 || !first || first.quantity !== 0.1)
    throw new Error(
      'A sample is exactly 0.1 of one owned item; nothing was spent.',
    );
  const s = first.stack,
    r = material(w, s.resource),
    classes = classesOf(s),
    kind = classes?.[0];
  if (!r || r.nutrition > 0)
    throw new Error('Sample non-food material; nothing was spent.');
  if (!kind || roleOf(s))
    throw new Error(
      'Sample untreated material or fiber-mat lots; tested lots, workpieces, cords and scrap are not resampled. Nothing was spent.',
    );
  const blocked = crowded(w, c.actor, TEST_LENGTH);
  if (blocked)
    throw new Error(`No room to work: ${blocked}. Nothing was spent.`);
  v7Spend(c.actor, SAMPLE);
  const law = STRANDS[r.id],
    cond = conditionOf(s),
    stem = STEMS.includes(r.id),
    separated = stem && cond >= SOUND,
    bends = separated && openMaterial(r).flexibility >= BEND,
    test = law && bends ? shape(r, law, 1, TEST_LENGTH) : null,
    held =
      law && test ? breaking(r, law, test.plyArea, cond) > TEST_PULL : null,
    damaged = (separated && !bends) || held === false,
    code = !stem
      ? 'not-stems'
      : !separated
        ? 'broken-stems'
        : !bends
          ? 'cracked'
          : !law
            ? 'no-strand-law'
            : !held
              ? 'broke-under-pull'
              : 'passed',
    reason = code === 'passed' ? null : FAILURES[code],
    passed = reason === null,
    scrap = damaged || (stem && !separated);
  const lot: V7Stack = {
    ...materialPortion(s, 1),
    id: v7Id(w, 'item'),
    owner: c.actor.id,
    position: { ...c.actor.position },
    processing: {
      ...(s.processing ?? {}),
      [PART]: {
        role: scrap ? 'tested-scrap' : 'tested-lot',
        classes,
        condition: damaged ? 0 : v7RoundNumber(cond),
        from: s.id,
        sampledAt: w.tick,
        passed,
      },
    },
  };
  foodSetQuantity(s, tenths(s) - 1);
  w.stacks.push(lot);
  w.stacks = w.stacks.filter((x) => x.quantity > 0);
  c.actor.extensionState[SAMPLES] = v7Json(
    [
      ...samples(c.actor).filter(
        (t) =>
          !(
            t.resource === s.resource &&
            t.origin === s.origin &&
            t.class === kind
          ),
      ),
      {
        resource: s.resource,
        origin: s.origin,
        class: kind,
        condition: v7RoundNumber(cond),
        passed,
        tick: w.tick,
        lot: lot.id,
      },
    ].slice(-12),
  );
  const value = {
    item: s.id,
    lot: lot.id,
    resource: s.resource,
    origin: s.origin,
    processing: kind,
    condition: v7RoundNumber(cond),
    quantity: 0.1,
    passed,
    reason,
    separated,
    bentWithoutCracking: separated ? bends : null,
    retainedTwist: bends ? v7RoundNumber(cond) : null,
    visibleFractures: damaged || (stem && !separated),
    strandLength: law && separated ? law.length : null,
    waterShare: law && separated ? wetness(r) : null,
    testTwist: test
      ? {
          length: TEST_LENGTH,
          plies: 2,
          plyDiameter: metres(test.plyDiameter),
        }
      : null,
    appliedForce: test ? TEST_PULL : 0,
    held,
    covers: passed
      ? `${s.resource} from ${s.origin}, ${kind}, condition at least ${String(v7RoundNumber(cond - TOLERANCE))}`
      : null,
  };
  openRemember(c, {
    key: `${ID}:sample:${s.resource}:${kind}:${band(cond)}:${code}`,
    subject: s.resource,
    property: 'separation, bending, twist retention and small pull',
    value: v7Json(value),
    method:
      'hand separation, bending, two-ply test twist and a 5 N opposing-hand pull of a 0.1 sample',
    condition: `source ${s.origin}; ${kind}; condition ${String(v7RoundNumber(cond))}`,
    verified: true,
  });
  c.emit(
    'fiber-cord-sampled',
    passed
      ? 'Sample passed: strands separated, bent into a two-ply test twist, kept it on release and held a 5 N pull. It covers only this source, processing and condition and rates no strength.'
      : `Sample failed: ${reason}. The sample is kept as ${scrap ? 'tested scrap' : 'a tested lot'}.`,
    { ...value, energy: SAMPLE, visual: view(w, lot) },
    lot.id,
  );
  return {
    complete: true,
    writes: [lot.id, ...(w.stacks.includes(s) ? [s.id] : [])],
  };
}

function start(c: V7ActionContext): V7HandlerResult {
  const w = c.world;
  if (current(w, c.actor))
    throw new Error(
      'Unfinished cord work exists; resume it with make and its workId, or cancel it. Nothing was spent.',
    );
  if (c.action.args.workId !== undefined)
    throw new Error(
      'No unfinished cord work of yours has this workId; nothing was spent.',
    );
  const list = allocations(c),
    first = list[0]?.stack,
    length = metres(
      v7Number(
        c.action.args.requestedLength,
        'requestedLength',
        LENGTH.min,
        LENGTH.max,
      ),
    ),
    n = list.reduce((t, a) => t + foodTenths(a.quantity), 0);
  if (n < 2 || n > 10)
    throw new Error(
      'Select 0.2-1 unit in total, at least 0.1 per ply; nothing was reserved.',
    );
  if (
    !first ||
    list.some(
      (a) =>
        a.stack.resource !== first.resource || a.stack.origin !== first.origin,
    )
  )
    throw new Error(
      'Use one fiber material from one source; nothing was reserved.',
    );
  if (!material(w, first.resource) || !STRANDS[first.resource])
    throw new Error(
      'No strand law exists for this material, so no cord can be made from it; nothing was reserved.',
    );
  for (const { stack, quantity } of list) {
    const classes = classesOf(stack);
    if (!classes)
      throw new Error(
        'Treated material, scrap, cords and fragments cannot be twisted in this version; nothing was reserved.',
      );
    if (roleOf(stack) === 'workpiece' && foodTenths(quantity) !== tenths(stack))
      throw new Error(
        'Supply an unfinished workpiece whole; nothing was reserved.',
      );
    if (!covered(c.actor, stack, classes))
      throw new Error(
        `First pass a cord sample covering the source, processing and current condition of ${stack.id}; nothing was reserved.`,
      );
  }
  const blocked = crowded(w, c.actor, length);
  if (blocked)
    throw new Error(`No room to work: ${blocked}. Nothing was reserved.`);
  if (c.actor.vitals.energy < STEP)
    throw new Error(
      'Not enough energy for the first paid round; nothing was reserved.',
    );
  const j = workCreate(c, 'make', STAGES.length);
  j.resource = first.resource;
  j.origin = first.origin;
  j.cordLength = length;
  j.reservedTenths = n;
  j.scrap = [];
  workReserve(c, j, list);
  w.stacks = w.stacks.filter((x) => x.quantity > 0);
  c.emit(
    'fiber-cord-started',
    `${String(n / 10)} unit(s) of sampled fiber reserved and held for a ${String(length)} m two-ply cord; no tool, anchor, water or extra fiber is used.`,
    summary(w, j),
    j.id,
  );
  return advance(c, j);
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    { workId, targetId } = c.action.args;
  if ((workId === undefined) === (targetId === undefined))
    throw new Error(
      'Inspect needs exactly one of targetId or workId; nothing was spent.',
    );
  const j =
      typeof workId === 'string'
        ? ownJobs(w, a).find((x) => x.id === workId)
        : undefined,
    s = j
      ? workpieceOf(w, j)
      : w.stacks.find((x) => x.id === targetId && x.owner === a.id);
  if (typeof workId === 'string' && !j)
    throw new Error(
      'No cord work of yours has this workId; nothing was spent.',
    );
  if (!j && (!s || !roleOf(s)))
    throw new Error(
      'targetId must be your own item from this operation (tested lot, scrap, workpiece, cord or fragment); nothing was spent.',
    );
  v7Spend(a, LOOK);
  const subject = j?.id ?? s?.id ?? '',
    value: V7Data = {
      ...(j ? summary(w, j) : {}),
      ...(s ? look(w, s) : {}),
    };
  if (s) part(s).inspectedAt = w.tick;
  openRemember(c, {
    key: `${subject}:fiber-cord-condition`,
    subject,
    property:
      'length, section, plies, loose ends, fraying, damage, condition and work stage',
    value: v7Json(value),
    method: 'direct inspection',
    condition:
      'visible and measurable features only; breaking force and safe load stay unknown',
    verified: false,
  });
  c.emit(
    'fiber-cord-inspected',
    'Only measurable length, section, plies, loose ends, fraying, damage, condition and stage are reported; untested strength stays unknown and nothing was repaired.',
    value,
    subject,
  );
  return { complete: true, writes: [] };
}

function trial(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    a = c.actor,
    id = v7String(c.action.args.targetId, 'targetId'),
    s = w.stacks.find((x) => x.id === id && x.owner === a.id && !x.reservedFor);
  if (!s || !['cord', 'fragment'].includes(roleOf(s) ?? ''))
    throw new Error(
      'targetId must be your own finished cord or cord fragment; nothing was spent.',
    );
  const r = material(w, s.resource),
    law = STRANDS[s.resource],
    p = part(s);
  if (!r || !law) throw new Error('No strand law applies; nothing was spent.');
  const force = v7Number(c.action.args.trialForce, 'trialForce', 1),
    seconds = v7Number(
      c.action.args.trialDuration,
      'trialDuration',
      1,
      ROUND_SECONDS,
    ),
    overall = Number(p.overall ?? 0),
    span = overall - 2 * HOLD;
  if (span < SPAN - 1e-9)
    throw new Error(
      `The item is ${String(overall)} m long; two hands need ${String(metres(2 * HOLD + SPAN))} m to grip a free span. Nothing was spent.`,
    );
  if (tenths(s) < 2)
    throw new Error(
      'A load trial needs at least 0.2 units so that a break leaves two inventory lots; nothing was spent.',
    );
  const blocked = crowded(w, a, overall);
  if (blocked)
    throw new Error(`No room to work: ${blocked}. Nothing was spent.`);
  v7Spend(a, TRIAL);
  // Only the ply diameter is stored: world numbers are kept to 1e-8, too coarse for areas in m2.
  const cond = conditionOf(s),
    diameter = Number(p.plyDiameter),
    area = (Math.PI * diameter * diameter) / 4,
    length = Number(p.length),
    hand = (HAND_PULL * Math.max(0, Math.min(100, a.vitals.health))) / 100,
    grip = GRIP * 2 * diameter,
    limit = Math.min(force, hand, grip),
    strength = breaking(r, law, area, cond),
    outcome =
      strength <= limit
        ? 'broke'
        : force > grip && grip <= hand
          ? 'grip-lost'
          : 'held',
    achieved = outcome === 'broke' ? strength : limit,
    ratio = Math.min(1, achieved / Math.max(1e-12, strength)),
    damage = Math.max(0, ratio - ONSET),
    after = v7RoundNumber(cond * (1 - damage)),
    stiffness = law.modulus * weakening(law, r) * EFFICIENCY * 2 * area,
    extension = (achieved * span) / stiffness,
    creep =
      outcome === 'held'
        ? law.creep * wetness(r) * ratio * (seconds / ROUND_SECONDS) * span
        : 0,
    result = {
      tick: w.tick,
      actor: a.id,
      item: s.id,
      outcome,
      requestedForce: force,
      achievedForce: newtons(achieved),
      handLimit: force > hand && hand < grip ? newtons(hand) : null,
      gripSlippedAt: outcome === 'grip-lost' ? newtons(grip) : null,
      requestedDuration: seconds,
      heldSeconds: outcome === 'held' ? seconds : 0,
      freeSpan: metres(span),
      elasticExtension: metres(extension),
      retainedDeformation: metres(creep),
      strandsBroken: v7RoundNumber(damage),
      conditionBefore: cond,
      conditionAfter: after,
      lengthBefore: length,
    },
    entry = {
      tick: w.tick,
      outcome,
      achievedForce: result.achievedForce,
      heldSeconds: result.heldSeconds,
      conditionBefore: cond,
    },
    trials = [...(Array.isArray(p.trials) ? p.trials : []), entry].slice(-4);
  const outputs: V7Stack[] = [];
  if (outcome === 'broke') {
    // The cord parts at the middle of the free span into two owned fragments of conserved fiber.
    const n = tenths(s),
      ids = [v7Id(w, 'item'), v7Id(w, 'item')],
      frayed = Number(p.frayedEnds ?? 0);
    [Math.floor(n / 2), n - Math.floor(n / 2)].forEach((k, i) => {
      const f: V7Stack = {
        ...v7Clone(s),
        id: ids[i] ?? '',
        quantity: k / 10,
        quantityTenths: k,
        position: { ...a.position },
        processing: {
          ...v7Clone(s.processing ?? {}),
          [PART]: {
            ...v7Clone(p),
            role: 'fragment',
            status: 'broken',
            condition: after,
            length: metres(length / 2),
            twisted: metres(length / 2),
            overall: metres(overall / 2),
            frayedEnds: Math.min(2, 1 + (frayed > i ? 1 : 0)),
            fragmentOf: s.id,
            fragments: ids,
            trials,
          },
        },
      };
      outputs.push(f);
    });
    w.stacks = w.stacks.filter((x) => x !== s);
    w.stacks.push(...outputs);
  } else {
    p.condition = after;
    p.trials = trials;
    p.untested = false;
    const stretched = metres(length + creep);
    if (stretched > length) {
      // Measurable permanent stretch keeps the volume: the plies thin as the cord lengthens.
      p.length = stretched;
      p.twisted = stretched;
      p.overall = metres(overall + stretched - length);
      p.plyDiameter = diameter * Math.sqrt(length / stretched);
    }
  }
  openRemember(c, {
    key: `${ID}:trial:${s.resource}:${band(cond)}:${outcome}`,
    subject: s.resource,
    property: 'two-hand load response of a hand-twisted two-ply cord',
    value: v7Json(result),
    method: `opposing two-hand pull of ${String(result.achievedForce)} N`,
    condition: `${String(length)} m cord, ply ${String(metres(Number(p.plyDiameter)))} m, condition ${String(cond)}; no anchor, hanging or added weight`,
    verified: true,
  });
  const data = {
    ...result,
    visual: outputs.length ? outputs.map((f) => view(w, f)) : [view(w, s)],
    fragments: outputs.map((f) => f.id),
    energy: TRIAL,
  };
  c.emit(
    'fiber-cord-trial',
    outcome === 'broke'
      ? `The cord broke at ${String(result.achievedForce)} N into two owned fragments of the same fiber.`
      : outcome === 'grip-lost'
        ? `The cord slipped through the hands at ${String(result.achievedForce)} N; the trial stopped.`
        : `Held ${String(result.achievedForce)} N for ${String(seconds)} s between both hands${damage ? `; about ${String(Math.round(damage * 100))}% of strands broke` : ''}. A pass means only this force for this time, not a safe load.`,
    data,
    outputs[0]?.id ?? s.id,
  );
  if (outcome === 'broke')
    c.emit(
      'fiber-cord-broken',
      'Broken cord: two owned fragments with all of its fiber; nothing vanished.',
      data,
      outputs[0]?.id ?? null,
    );
  return {
    complete: true,
    writes: outputs.length ? outputs.map((f) => f.id) : [s.id],
  };
}

function cancel(c: V7ActionContext): V7HandlerResult {
  const w = c.world,
    workId = c.action.args.workId,
    j = current(w, c.actor);
  if (!j || (typeof workId === 'string' && workId !== j.id))
    throw new Error(
      'No unfinished cord work of yours to cancel; nothing was spent.',
    );
  const returned = pending(w, j).map((s) => s.id),
    piece = workpieceOf(w, j);
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  workStop(
    w,
    c.actor,
    j,
    'Cancelled; unworked reserved fiber returned once and the workpiece stays as it is. Paid energy is not refunded.',
    false,
  );
  settle(piece, 'unfinished');
  c.emit(
    'fiber-cord-cancelled',
    'Cord work cancelled: unworked fiber is returned once and any workpiece stays an owned unfinished item.',
    { ...summary(w, j), returned },
    piece?.id ?? j.id,
  );
  sync(c.actor, j);
  return { complete: true, writes: [j.id, ...j.escrow] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = v7String(c.action.args.mode, 'mode'),
    j = current(c.world, c.actor);
  if (!ARGS[mode]) throw new Error('Unknown cord mode.');
  // The bound action continues each round; make naming the work resumes it.
  if (j && mode === 'make' && c.operation?.first === false)
    return advance(c, j);
  if (j && mode === 'make' && c.action.args.workId === j.id) {
    relevant(c, mode, ['workId']);
    return advance(c, j);
  }
  if (c.operation?.first === false && mode === 'make')
    throw new Error('The bound cord work is already settled.');
  relevant(c, mode);
  if (mode === 'sample') return sample(c);
  if (mode === 'make') return start(c);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'trial') return trial(c);
  return cancel(c);
}

/** Reserved fiber stays in the owner's hands; an unworked round pauses; worked fiber wears. */
function environment(w: V7World) {
  for (const j of collectiveJobs(w, ID).filter(open)) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a) continue;
    j.x = a.position.x;
    j.y = a.position.y;
    for (const s of w.stacks.filter((s) => s.reservedFor === j.id))
      s.position = { ...a.position };
    if (j.status === 'active' && j.lastPaid < w.tick) {
      j.status = 'paused';
      j.reason =
        'Not worked this round; paid stages, reserved fiber and the workpiece are kept.';
      forestEvent(
        w,
        'fiber-cord-paused',
        'Cord work paused because it was not worked this round; nothing was spent.',
        a.position,
        a.id,
        summary(w, j),
        j.target ?? j.id,
      );
    }
    sync(a, j);
  }
  for (const s of w.stacks) {
    const p = s.processing?.[PART];
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const c = Number(p.condition ?? 0);
    if (typeof p.role === 'string' && WORKED.includes(p.role) && c > 0)
      p.condition = v7RoundNumber(Math.max(0, c - WEAR));
  }
}

/** The fiber-cord@1 cord representation, strand law, trial constants and helpers, exported
 * unchanged for packages that work on its cords (ex16 hand-tie-cord-knot@1). */
export const FIBER_CORD = {
  PART,
  LAW,
  STRANDS,
  BEND,
  SOUND,
  END,
  HOLD,
  SPAN,
  HAND_PULL,
  GRIP,
  ROUND_SECONDS,
  ONSET,
  WEAR,
  EFFICIENCY,
  material,
  part,
  roleOf,
  conditionOf,
  wetness,
  weakening,
  breaking,
  crowded,
  view,
  look,
  metres,
  newtons,
  band,
};

export const LONG_FIBER_CORD: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex16',
  dependencies: ['foundation-open@1'],
  description:
    'General hand-twisting of short two-ply cord from owned fiber with bare hands: a sample test, four paid making rounds with cord geometry from conserved volume, inspection and bounded two-hand load trials that may damage or break the cord. No strength rating, reward or shelter effect.',
  reuse: {
    experiment:
      'ex16 hand-weave-fiber-mat@1 (thin-stem set, fiber-lot provenance and condition, sample-covered inputs, sound condition 0.5, exposed wear rate); ex16 hand-break-food@1 (exact-id inputs, staged escrowed work, pause, resume by workId, cancel, death); probe-style verified personal records',
    source:
      'collective-work.ts (escrow, paid work, stop); material-lots.ts; open-physical.ts (engine flexibility, ground); open-foundation.ts (personal records); forest-climate.ts (events); the reed strand law values of open-shelter-material.ts and the hydration rule of open-woven-physics.ts, re-stated without calling them',
    description:
      'Implementation reuse only; earlier packages are unchanged and no ability, item or mastery is inherited. Mat weaving is not a prerequisite. The cord geometry, grip, load and breakage rules are new and registered as fiber-cord@1.',
  },
  abilities: [
    {
      id: ID,
      name: 'Hand-twist fiber cord',
      function:
        'Sample owned fiber, hand-twist a two-ply cord up to 0.30 m in four paid rounds, inspect it, load-trial it between both hands, or cancel; actual material and geometry decide results.',
      equivalence: 'cordage:hand-twisted-two-ply-fiber-cord:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['sample', 'make', 'inspect', 'trial', 'cancel'],
          },
          materials: {
            type: 'array',
            items: v7ObjectSchema({
              stackId: { type: 'string' },
              quantity: { type: 'number', minimum: 0.1 },
            }),
          },
          targetId: { type: 'string' },
          workId: { type: 'string' },
          requestedLength: {
            type: 'number',
            minimum: LENGTH.min,
            maximum: LENGTH.max,
          },
          trialForce: { type: 'number', minimum: 1 },
          trialDuration: { type: 'number', minimum: 1, maximum: ROUND_SECONDS },
        }),
        required: ['mode'],
      },
      references: {},
      prerequisites: [],
      learning: 3,
      learningEnergy: 0.2,
      costs:
        'Study: 3 rounds at 0.2 energy. materials: [{stackId: exact owned unreserved item id, quantity in 0.1 steps}]. sample: one non-food item, 0.1; 1 round, 0.5 energy. make (materials: 0.2-1 unit of one fiber and source, each covered by your passing sample of its source and processing at most 0.05 above its condition; requestedLength m): reserves it, then 4 paid rounds of 1 energy (separate-align, twist, counter-ply, release-check), continuing each round; resume with make and workId only. inspect (targetId: your item from this work, or workId): 1 round, 0.2. trial (targetId: your cord or fragment of at least 0.2 unit and 0.12 m; trialForce N; trialDuration s): 1 round, 0.5. cancel: none. Work needs dry footing and nobody within your radius plus half the cord. Unworked rounds or low energy pause uncharged; refusals and irrelevant arguments spend nothing; nothing is refunded.',
      effects:
        'Only thin stems separate; only reed has a strand law (existing reed law: 1.8 m stems, 500 kg/m3, 8 MPa x (1 - 0.55 x water share 0.9), creep 0.003); dry grass reports the gap. A sample is split, bent, twisted and pulled at 5 N, kept as a tested lot or cracked scrap, and reports only separation, retained twist, fractures and force. Make round 1 sets broken strands aside as scrap and derives the cord from conserved volume: two plies, each half the solid volume over length x 1.155 twist take-up + 0.02 m loose ends; plies of 1-12 mm and strands no shorter than a ply, else a measured shortfall returns the fiber. The release check needs condition 0.5 and gives an owned untested cord. Trial force = min(trialForce, 200 N x health/100, grip 10000 N/m x cord width); breaking force = 2 x ply area x wet strength x 0.75 x condition. It records grip slip, extension and creep; load above half the breaking force breaks that share of strands; a break leaves two owned fragments. Worked fiber loses 0.0005 condition per round. A pass means only that force for that time. Cancel or death releases unworked fiber once and leaves the workpiece. No reward or strength rating.',
      handler: 'long.hand-twist-fiber-cord',
      revision: REVISION,
      authored: false,
      // The completion event carries no qualified flag: a finished cord earns no milestone.
      practiceEvidence: 'fiber-cord-completed',
      dependencies: { abilities: [], resources: ['reed'], knowledge: [] },
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Paid stages persist across interruption; resuming by workId pays only the next stage after rechecks. Other modes take one round.',
      },
    },
  ],
  handlers: { 'long.hand-twist-fiber-cord': execute },
  processes: {},
  visualComponents: [],
  events: [
    'fiber-cord-sampled',
    'fiber-cord-started',
    'fiber-cord-progress',
    'fiber-cord-shortfall',
    'fiber-cord-paused',
    'fiber-cord-resumed',
    'fiber-cord-failed',
    'fiber-cord-completed',
    'fiber-cord-check-failed',
    'fiber-cord-cancelled',
    'fiber-cord-inspected',
    'fiber-cord-trial',
    'fiber-cord-broken',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath(w, a) {
    for (const j of ownJobs(w, a).filter(open)) {
      const piece = workpieceOf(w, j);
      j.x = a.position.x;
      j.y = a.position.y;
      workStop(
        w,
        a,
        j,
        'Performer died; reserved fiber and the workpiece were left where they died, once. Nothing is refunded.',
        true,
      );
      settle(piece, 'unfinished');
      forestEvent(
        w,
        'fiber-cord-failed',
        'Cord work stopped by death; reserved fiber and the unfinished workpiece lie where the person died.',
        a.position,
        a.id,
        summary(w, j),
        piece?.id ?? j.id,
      );
      sync(a, j);
    }
  },
};

/** The fiber-cord@1 making rules and its sample and trial modes, exported unchanged for ex16
 * hand-twist-sectioned-cord@1, which makes longer cords of the same kind in sections. The sample
 * and trial modes announce fiber-cord-* events; a caller may rename them through its context. */
export const FIBER_CORD_SECTIONING = {
  SAMPLES,
  LENGTH,
  PLY,
  TAKEUP,
  STEP,
  LOOK,
  classesOf,
  covered,
  allocations,
  relevant,
  shape,
  sample,
  trial,
};
