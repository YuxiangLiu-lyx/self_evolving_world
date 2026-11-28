import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Package,
  V7Point,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Clone, v7Json, v7Number, v7RoundNumber } from './continuous-data.js';
import { v7Distance, v7Reach } from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { foodTenths, foodUnitMass } from './forest-food-accounting.js';
import { foodWaterInitialize, foodWaterSurfaceArea } from './food-water.js';
import type { FoodWaterSurface } from './food-water.js';
import { preservationPhysics } from './open-preservation-physics.js';
import { refugeRay } from './open-shelter-geometry.js';
import { scratchPhysical } from './open-hardness-physics.js';
import { openRemember } from './open-foundation.js';
import {
  collectiveJobs,
  workAllocations,
  workCreate,
  workPay,
  workReserve,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import {
  airExposureTrack,
  airExposureUnsupported,
} from './long-ex19-food-air-exposure.js';
import { ex19MaterialWhole } from './long-ex19-material-contact.js';
import { thinSliceEdgeProblem } from './long-ex19-thin-slice-food-drying.js';
import {
  AIR_DRY_FOOTPRINT,
  airDryShrinkage,
  airDrySupportProblem,
} from './long-ex21-air-dry-food.js';
import { LONG_EX21_BEAM_MASS_KIT } from './long-ex21-beam-mass-comparator.js';
import type { LeverWeighing } from './long-ex19-lever-mass-comparison.js';
import {
  sampleExchange,
  sampleGeometry,
} from './long-ex21-sample-drying-physics.js';
import type { SampleExchange } from './long-ex21-sample-drying-physics.js';

/** ex21: Moss's prepared-sample comparison. A small sample and an equal reference are taken from
 * one owned food stack; the sample is split or sliced with an acquired stone or flint edge and
 * laid on a validated support, where only its new cut faces exchange water with the actual
 * weather (long-ex21-sample-drying-physics.ts); both are weighed on a tested comparator of
 * beam-mass-comparator@1. Whole and carried food keep the food water representation's rules. */

const ID = 'compare-material-samples';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
const STATE = `long:work:${ID}`;
/** Hidden physical state of lying pieces (temperature and last exchange round), world audit only. */
const PIECES = `long:${ID}:pieces`;
/** Audit ledger of this process's water and heat; never shown to people. */
const LEDGER = `long:${ID}:exchange`;
/** The general food water ledger, which this process adds its water to. */
const WATER = 'preservation:water';
const COMPARATOR = LONG_EX21_BEAM_MASS_KIT.package.id;
/** World Agent costs: start 0.2, each attempted split or slice 0.5, each item weighed 0.2,
 * tend 0.2, stop nothing; every mode one round. */
const START = 0.2;
const CUT = 0.5;
const WEIGH = 0.2;
const TEND = 0.2;
/** Default sample and reference quantity, the largest sample (the comparator seat holds one piece
 * of at most 1 unit) and the default exposure window in rounds. */
const SAMPLE = 0.1;
const LARGEST = 1;
const DURATION = 10;
/** The food water representation's persistent opening damage of cut food. */
const OPENING = 1.1;
/** Latest weighings kept in the trial record beside each item's first (baseline) weighing. */
const KEEP = 12;
const EVENT = (name: string) => `sample-trial-${name}`;
const ARGS: Record<string, string[]> = {
  start: ['sourceItemId', 'sampleQuantity', 'durationRounds'],
  prepare: ['preparation', 'toolId', 'supportId', 'location', 'trialId'],
  measure: ['measurementDeviceId', 'trialId'],
  tend: ['location', 'trialId'],
  stop: ['trialId'],
};
const LIMITS =
  'mass relative to the comparator reference only; the comparator cannot tell water from other matter; no water content, contamination, preservation or safety is measured';

/** The persistent trial record. It holds only what was done, seen or weighed. */
interface Trial extends CollectiveWork {
  stage: string;
  source: string;
  resource: string;
  sample: string;
  reference: string;
  quantity: number;
  startedAt: number;
  duration: number;
  preparation: V7Data | null;
  support: V7Data | null;
  /** The exact support item record while it lies committed under the pieces. */
  supportItem: V7Data | null;
  placement: V7Data | null;
  placedAt: number | null;
  sampleDecay0: number;
  sampleDecay: number;
  referenceDecay0: number;
  referenceDecay: number;
  referenceSpoiledAt: number | null;
  baseline: V7Data;
  weighings: Weighing[];
  turns: number;
  moves: number;
  rainRounds: number;
  wet: boolean;
  comparison: V7Data | null;
  lastUpdate: number;
  endedAt: number | null;
  takenBy: string | null;
}
interface Weighing extends V7Data {
  event: string;
  tick: number;
  role: string;
  item: string;
  quantity: number;
  form: string;
  device: string;
  reference: string;
  ratio: number[] | null;
}

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const round = (x: number) => v7RoundNumber(x);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const nothing = (why: string, cause?: unknown) =>
  new Error(`${why} Nothing was spent.`, cause ? { cause } : undefined);
const spoiledNow = (w: V7World, id: string) =>
  w.events.some((e) => e.type === 'spoiled' && e.target === id);
const trials = (w: V7World) => collectiveJobs(w, ID).map((j) => j as Trial);
const current = (w: V7World, a: V7Actor) =>
  trials(w).find((j) => j.owner === a.id && open(j));
const sync = (a: V7Actor, j: Trial) => {
  a.extensionState[STATE] = v7Json(j);
};
const reach = (w: V7World, a: V7Actor, p: V7Point) =>
  v7Distance(a.position, p) <= a.radius + w.config.interaction;
const record = (v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as V7Data) : null;
/** The pieces' geometry, present on every stack this operation has cut. */
const geometry = (s: V7Stack) => {
  const g = record(s.processing?.preparedSample);
  return g && g.operation === ID ? g : null;
};

/** Visual status of the trial; elapsed time alone never shows success. */
function status(j: Trial): string {
  if (j.stage === 'allocated') return 'pending';
  if (j.stage === 'exposed') return 'active';
  if (j.stage === 'completed' || j.stage === 'indeterminate') return j.stage;
  return j.stage === 'spoiled' ? 'failed' : 'interrupted';
}

/** Where the pieces lie, or where the person stands before preparation. */
function site(w: V7World, j: Trial): V7Point {
  const p = j.placement;
  if (p?.kind === 'ground') return { x: Number(p.x), y: Number(p.y) };
  const o = w.objects.find((o) => o.id === p?.id);
  return o ? { x: o.spatial.x, y: o.spatial.y } : { x: j.x, y: j.y };
}

/** The cut pieces while they lie, unowned, where they were laid. */
function lying(w: V7World, j: Trial): V7Stack | undefined {
  if (j.stage !== 'exposed') return undefined;
  const s = w.stacks.find((s) => s.id === j.sample),
    at = site(w, j);
  return s &&
    s.owner === null &&
    s.quantity > 0 &&
    geometry(s) &&
    v7Distance(s.position, at) < 1e-6
    ? s
    : undefined;
}
/** A carried item of the trial still reserved for it: the reference, or the uncut sample. */
function held(w: V7World, a: V7Actor, j: Trial, id: string) {
  return w.stacks.find(
    (s) => s.id === id && s.owner === a.id && s.reservedFor === j.id,
  );
}

/** A point named by `location`, or the person's position without one. */
function location(c: V7ActionContext): V7Point | null {
  const raw = c.action.args.location;
  if (raw === undefined || raw === null) return null;
  const r = record(raw);
  if (!r) throw nothing('location is an object with numeric x and y.');
  return { x: v7Number(r.x, 'location.x'), y: v7Number(r.y, 'location.y') };
}

/** Reusable drawing metadata; it never shows dryness, a reading badge or success. */
function view(w: V7World, j: Trial): V7Data {
  const s = w.stacks.find((s) => s.id === j.sample),
    at = j.stage === 'allocated' ? { x: j.x, y: j.y } : site(w, j),
    weighed = j.weighings.at(-1);
  return v7Json({
    component: 'ground-stack',
    operation: 'prepared_sample_comparison',
    revision: REVISION,
    trial: j.id,
    actor: j.owner,
    source: j.source,
    item: j.sample,
    reference: j.reference,
    resource: j.resource,
    color: w.resources.find((r) => r.id === j.resource)?.color ?? '#cfaf79',
    quantity: s?.quantity ?? 0,
    form: text(j.preparation?.form) || 'whole',
    pieces: j.preparation?.pieces ?? 1,
    placement: j.placement ? 'support' : 'carried',
    support: j.support?.id ?? null,
    tool: j.preparation?.tool ?? null,
    instrument: weighed?.device ?? null,
    x: at.x,
    y: at.y,
    footprint: j.placement?.area ?? null,
    startedAt: j.startedAt,
    updatedAt: j.lastUpdate,
    progress: {
      basis: 'elapsed_exposure',
      elapsed: j.placedAt === null ? 0 : w.tick - j.placedAt,
      duration: j.duration,
    },
    visible: j.wet ? 'wet from rain' : airDryShrinkage(s),
    state: status(j),
    preservation: 'unverified',
    badge: null,
    evidence: j.weighings.map((r) => r.event),
  }) as V7Data;
}

/** Mass change of one item between two weighings on the same comparator and reference. */
function change(before: Weighing, after: Weighing): V7Data {
  const base = {
    role: after.role,
    item: after.item,
    before: before.event,
    after: after.event,
    beforeTick: before.tick,
    afterTick: after.tick,
  };
  const unresolved = (reason: string) => ({
    ...base,
    massChange: null,
    ratio: null,
    result: 'unresolved',
    reason,
  });
  if (!before.ratio || !after.ratio)
    return unresolved('a weighing found no tip inside the slide');
  if (before.device !== after.device || before.reference !== after.reference)
    return unresolved('the weighings used different comparators or references');
  if (before.quantity !== after.quantity)
    return unresolved('the quantity changed between the weighings');
  const [bl = 0, bh = 0] = before.ratio,
    [al = 0, ah = 0] = after.ratio;
  const low = bh > 0 ? round(al / bh) : null,
    high = bl > 0 ? round(ah / bl) : null,
    ratio = [low, high];
  const result =
    high !== null && high < 1
      ? 'decrease'
      : low !== null && low > 1
        ? 'increase'
        : 'unresolved';
  return {
    ...base,
    // Fractions of the reference mass; the interval carries every reading's resolution.
    massChange: [round(al - bh), round(ah - bl)],
    ratio,
    result,
    reason:
      result === 'unresolved'
        ? 'the after/before interval includes 1: any change is below the resolution, not zero'
        : null,
  };
}

/** Sample and reference changes from their first to their latest weighing, and the sample's
 * change relative to the reference's, each an interval carrying all four readings. */
function comparisons(j: Trial): V7Data | null {
  const of = (role: string) => {
    const list = j.weighings.filter((r) => r.role === role),
      first = list[0],
      latest = list.at(-1);
    return first && latest && latest.tick > first.tick
      ? change(first, latest)
      : null;
  };
  const sample = of('sample'),
    reference = of('reference');
  if (!sample && !reference) return null;
  const s = (sample?.ratio ?? null) as (number | null)[] | null,
    r = (reference?.ratio ?? null) as (number | null)[] | null;
  let adjusted: V7Data | null = null;
  if (s && r) {
    const lo =
        s[0] !== null && r[1] !== null && r[1] !== undefined && r[1] > 0
          ? round((s[0] ?? 0) / r[1])
          : null,
      hi =
        s[1] !== null && r[0] !== null && r[0] !== undefined && r[0] > 0
          ? round((s[1] ?? 0) / r[0])
          : null;
    adjusted = {
      ratio: [lo, hi],
      result:
        hi !== null && hi < 1
          ? 'decrease'
          : lo !== null && lo > 1
            ? 'increase'
            : 'unresolved',
    };
  }
  return {
    basis: 'your weighings on the same comparator only',
    sample,
    reference,
    referenceAdjusted: adjusted,
    meaning:
      'net mass change relative to the comparator reference; reported as mass change, not as water loss, contamination, preservation or safety',
  };
}

/** Everything the person has done, seen or weighed; never the represented water content. */
function report(w: V7World, j: Trial): V7Data {
  const elapsed = w.tick - (j.placedAt ?? j.startedAt),
    s = w.stacks.find((s) => s.id === j.sample);
  return v7Json({
    trial: j.id,
    stage: j.stage,
    status: status(j),
    source: j.source,
    resource: j.resource,
    quantity: j.quantity,
    baseline: j.baseline,
    preparation: j.preparation,
    support: j.support,
    placement: j.placement,
    startedAt: j.startedAt,
    placedAt: j.placedAt,
    durationRounds: j.duration,
    tick: w.tick,
    elapsedRounds: elapsed,
    sample: airExposureTrack(
      w,
      j.sample,
      j.sampleDecay0,
      j.sampleDecay,
      elapsed,
      j.resource,
    ),
    reference: airExposureTrack(
      w,
      j.reference,
      j.referenceDecay0,
      j.referenceDecay,
      elapsed,
      j.resource,
    ),
    visible: {
      method: 'visual',
      shrinkage: airDryShrinkage(s),
      wetness: j.wet ? 'wet from rain' : 'no visible wetness',
    },
    handling:
      'The sample pieces lie on the support; the reference stays whole and carried by you. Form, location and handling differ.',
    turns: j.turns,
    moves: j.moves,
    rainRounds: j.rainRounds,
    weighings: j.weighings.length,
    comparison: comparisons(j),
    water:
      'not measured; weighings give mass relative to the comparator reference only',
    contamination: 'support contact; not assessed',
    safety: 'unverified',
    preservation: 'unverified',
    paidEnergy: round(j.paidEnergy),
  }) as V7Data;
}

/** Returns a held support item to the world, lying at the site; returns its id. */
function restore(w: V7World, j: Trial): string | null {
  if (!j.supportItem) return null;
  const s = v7Clone(j.supportItem) as unknown as V7Stack;
  w.stacks.push({ ...s, owner: null, position: site(w, j) });
  j.supportItem = null;
  j.support = { ...j.support, returnedAt: w.tick };
  return s.id;
}

/** Ends a trial once: reserved items are released, the support item lies at the site and the cut
 * pieces stay where they are, still exchanging water; spent work is not refunded. */
function settle(
  w: V7World,
  a: V7Actor,
  j: Trial,
  stage: string,
  reason: string,
  ground: boolean,
): string[] {
  const released = j.escrow.filter((id) =>
    w.stacks.some((s) => s.id === id && s.reservedFor === j.id),
  );
  const back = restore(w, j);
  j.x = a.position.x;
  j.y = a.position.y;
  workStop(w, a, j, reason, ground);
  j.stage = stage;
  j.endedAt = w.tick;
  j.comparison = comparisons(j);
  j.outcome = report(w, j);
  return back ? [...released, back] : released;
}

/** The open trial a mode acts on: the person's own, checked against trialId when given. */
function trialOf(c: V7ActionContext, verb: string): Trial {
  const j = current(c.world, c.actor),
    named = text(c.action.args.trialId);
  if (!j) throw nothing(`You have no open sample trial to ${verb}.`);
  if (named && named !== j.id)
    throw nothing(`${named} is not your open sample trial; yours is ${j.id}.`);
  return j;
}

function start(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  const existing = current(w, a);
  if (existing)
    throw nothing(
      `Your sample trial ${existing.id} is still open; stop it first.`,
    );
  const source = w.stacks.find((s) => s.id === action.args.sourceItemId);
  if (!source || source.owner !== a.id)
    throw nothing(
      'Name one of your own food stacks by its exact item id in sourceItemId.',
    );
  if (source.reservedFor)
    throw nothing('That food is reserved for unfinished work.');
  const problem = airExposureUnsupported(w, source);
  if (problem) throw nothing(problem);
  const quantity = action.args.sampleQuantity ?? SAMPLE,
    duration = action.args.durationRounds ?? DURATION;
  if (
    typeof quantity !== 'number' ||
    !Number.isFinite(quantity) ||
    Math.abs(quantity * 10 - Math.round(quantity * 10)) > 1e-9 ||
    quantity < SAMPLE - 1e-9 ||
    quantity > LARGEST + 1e-9
  )
    throw nothing(
      'sampleQuantity is 0.1 to 1 in tenths of a unit (default 0.1).',
    );
  if (
    typeof duration !== 'number' ||
    !Number.isSafeInteger(duration) ||
    duration < 1
  )
    throw nothing('durationRounds is a whole number of rounds, at least 1.');
  const tenths = Math.round(quantity * 10),
    amount = tenths / 10;
  if (foodTenths(source.quantity) - 2 * tenths < 1)
    throw nothing(
      `${source.id} holds ${String(source.quantity)}; a ${String(amount)} sample and an equal reference must leave part of it unreserved.`,
    );
  if (a.vitals.energy + 1e-9 < START)
    throw nothing('Starting a sample trial needs 0.2 energy.');
  // All checks passed: one paid round separates the sample and the reference.
  const j = workCreate(c, 'sample-comparison', 1) as Trial;
  if (!workPay(c, j, START))
    throw new Error('Energy changed before the paid round.');
  a.vitals.energy = round(Math.max(0, a.vitals.energy));
  j.paidEnergy = round(j.paidEnergy);
  const take = () => {
    workReserve(
      c,
      j,
      workAllocations(c, [{ itemId: source.id, quantity: amount }]),
    );
    const s = w.stacks.find((s) => s.id === j.escrow.at(-1));
    if (!s) throw new Error('The separated portion is missing.');
    // The world water record of the stack's food; a composition, not a measurement.
    foodWaterInitialize(w, s);
    return s;
  };
  const sample = take(),
    reference = take();
  Object.assign(j, {
    stage: 'allocated',
    source: source.id,
    resource: source.resource,
    sample: sample.id,
    reference: reference.id,
    quantity: amount,
    startedAt: w.tick,
    duration,
    preparation: null,
    support: null,
    supportItem: null,
    placement: null,
    placedAt: null,
    sampleDecay0: round(sample.decay ?? 0),
    sampleDecay: round(sample.decay ?? 0),
    referenceDecay0: round(reference.decay ?? 0),
    referenceDecay: round(reference.decay ?? 0),
    referenceSpoiledAt: null,
    baseline: {
      tick: w.tick,
      quantity: amount,
      sourceRemaining: source.quantity,
      decay: round(sample.decay ?? 0),
      harvestedAt: sample.harvestedAt ?? null,
      origin: sample.origin,
      form: 'whole portions of the stack, no cut made',
      composition: 'assumed water record of the world model; not measured',
    },
    weighings: [],
    turns: 0,
    moves: 0,
    rainRounds: 0,
    wet: false,
    comparison: null,
    lastUpdate: w.tick,
    endedAt: null,
    takenBy: null,
    target: sample.id,
    outputs: [sample.id, reference.id],
  });
  c.emit(
    EVENT('allocated'),
    `A ${String(amount)} ${source.resource} sample and an equal reference were separated from ${source.id}, which keeps ${String(source.quantity)}. Both stay whole, carried and reserved; separating them made no cut and no exposed surface.`,
    { ...report(w, j), energy: START, view: view(w, j) },
    sample.id,
  );
  sync(a, j);
  return {
    complete: true,
    writes: [j.id, source.id, sample.id, reference.id],
  };
}

/** Checked support and placement of the pieces' footprint, before any charge. */
function placement(
  c: V7ActionContext,
  j: Trial,
  need: number,
  tool: string,
): { surface: FoodWaterSurface; item: V7Stack | undefined; units: number } {
  const { world: w, actor: a, action } = c;
  const id = text(action.args.supportId);
  if (!id)
    throw nothing(
      'Name the support in supportId: your own clean, dry, rigid item, or an existing food surface in reach.',
    );
  if (id === tool)
    throw nothing('The cutting tool cannot also be the support.');
  const units = Math.max(1, Math.ceil(need / AIR_DRY_FOOTPRINT - 1e-9));
  const o = w.objects.find((o) => o.id === id);
  let surface: FoodWaterSurface;
  let item: V7Stack | undefined;
  if (o) {
    if (action.args.location !== undefined)
      throw nothing(
        'Pieces on an existing surface lie at its centre; give location only with your own support item.',
      );
    if (!v7Reach(a, o.spatial)) throw nothing(`${id} is out of reach.`);
    const owner = o.data.owner;
    if (typeof owner === 'string' && owner !== a.id)
      throw nothing(`${id} belongs to ${owner}.`);
    surface = { kind: 'object', id };
  } else {
    item = w.stacks.find((s) => s.id === id);
    const why = airDrySupportProblem(w, a, item, 1);
    if (why) throw nothing(why);
    if (item && ex19MaterialWhole(item) < units)
      throw nothing(
        `${id} holds ${String(item.quantity)}; these pieces cover ${String(need)} and need ${String(units)} whole support units at 0.04 each.`,
      );
    const point = location(c) ?? { ...a.position };
    if (!reach(w, a, point))
      throw nothing(
        'The placement point is beyond hand reach; walk there first.',
      );
    surface = { kind: 'ground', x: point.x, y: point.y, area: need };
  }
  let area: number;
  try {
    area = foodWaterSurfaceArea(w, surface, j.sample);
  } catch (error) {
    throw nothing(
      error instanceof Error ? error.message : 'The placement is unusable.',
      error,
    );
  }
  if (area + 1e-9 < need)
    throw nothing(
      `${id} offers ${String(round(area))} of surface; the pieces cover ${String(need)}.`,
    );
  return { surface, item, units };
}

function prepare(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  const j = trialOf(c, 'prepare');
  if (j.stage !== 'allocated')
    throw nothing('The sample is already cut; each trial prepares it once.');
  const method = action.args.preparation;
  if (method !== 'split' && method !== 'slice')
    throw nothing('preparation is split or slice.');
  const sample = held(w, a, j, j.sample);
  if (!sample) throw nothing('The allocated sample is no longer with you.');
  if (action.args.toolId === undefined)
    throw nothing(
      'Cutting needs toolId: your own carried stone or flint unit with a usable edge. Hands, food and plants do not cut.',
    );
  const tool = w.stacks.find((s) => s.id === action.args.toolId);
  // The sample is reserved for this trial, so the shared edge rule sees the tool alone.
  const blunt = thinSliceEdgeProblem(w, a, tool, sample);
  if (blunt || !tool) throw nothing(blunt ?? 'Name your cutting tool.');
  const mass = sample.quantity * foodUnitMass(w, sample),
    g = sampleGeometry(method, mass),
    need = round(Math.max(g.footprint, AIR_DRY_FOOTPRINT * sample.quantity));
  const { surface, item, units } = placement(c, j, need, tool.id);
  if (a.vitals.energy + 1e-9 < CUT)
    throw nothing('Cutting and laying the sample needs 0.5 energy.');
  // All checks passed: one paid round cuts the sample and lays the pieces on the support.
  v7Spend(a, CUT);
  j.paidEnergy = round(j.paidEnergy + CUT);
  // The contact record is stored as used. Under the existing contact law a harder body alters
  // only the softer one, so cutting food wears the edge by nothing.
  const edge = scratchPhysical(w, tool);
  const centre =
    surface.kind === 'ground'
      ? { x: surface.x, y: surface.y }
      : (() => {
          const o = w.objects.find((o) => o.id === surface.id);
          return o ? { x: o.spatial.x, y: o.spatial.y } : { ...a.position };
        })();
  let support: V7Stack | null = null;
  if (item) {
    // The support units leave the carried load and lie committed under the pieces at the site.
    workReserve(
      c,
      j,
      workAllocations(c, [{ itemId: item.id, quantity: units }]),
      true,
    );
    const part = w.stacks.find((s) => s.id === j.escrow.at(-1));
    if (!part) throw new Error('The support unit is missing.');
    w.stacks = w.stacks.filter((s) => s.id !== part.id);
    j.escrow = j.escrow.filter((id) => id !== part.id);
    support = { ...v7Clone(part), owner: null, position: { ...centre } };
    delete support.reservedFor;
  }
  // The cut pieces lie in the world, unowned and unreserved, like any dropped stack.
  delete sample.reservedFor;
  sample.owner = null;
  sample.position = { ...centre };
  j.escrow = j.escrow.filter((id) => id !== sample.id);
  const water = preservationPhysics(sample) ?? foodWaterInitialize(w, sample);
  // The representation's irreversible opened state (as foodWaterExpose with prepared applies
  // it). The pieces get no representation surface: their water moves by this operation's
  // exposed-face exchange, never also by the representation's thin-layer rule.
  water.prepared = true;
  water.opening = OPENING;
  const q = sample.quantity;
  sample.processing = {
    ...sample.processing,
    preparedSample: v7Json({
      version: 1,
      operation: ID,
      ...g,
      exposedPerUnit: round(g.exposed / q),
      footprintPerUnit: round(g.footprint / q),
      cutAt: w.tick,
      tool: tool.id,
      trial: j.id,
    }),
  };
  const preparation = {
    form: method,
    tool: tool.id,
    cutAt: w.tick,
    outcome: 'cut',
    pieces: g.pieces,
    cutPlanes: g.cutPlanes,
    thickness: g.thickness,
    diameter: g.diameter,
    cutArea: g.cutArea,
    exposedArea: g.exposed,
    footprint: g.footprint,
    edge: {
      resource: tool.resource,
      origin: tool.origin,
      resistance: Number(edge.resistance),
      edgeRadius: round(Number(edge.edgeRadius)),
      wear: round(Number(edge.wear)),
      wearAdded: 0,
      fractured: edge.fractured === true,
      contaminated: edge.contaminated === true,
    },
    offcuts: 0,
    crumbs: 0,
    residue: 'none represented on the edge',
    reference: 'kept whole and uncut',
  };
  Object.assign(j, {
    stage: 'exposed',
    preparation,
    support: support
      ? {
          kind: 'item',
          id: support.id,
          resource: support.resource,
          quantity: support.quantity,
          origin: support.origin,
          from: item?.id ?? null,
        }
      : {
          kind: 'object',
          id: surface.kind === 'object' ? surface.id : '',
          resource: text(
            w.objects.find(
              (o) => surface.kind === 'object' && o.id === surface.id,
            )?.data.resource,
          ),
        },
    supportItem: support ? v7Json(support) : null,
    placement: { ...surface, area: need },
    placedAt: w.tick,
    lastUpdate: w.tick,
  });
  c.emit(
    EVENT('cut'),
    `The ${String(q)} ${j.resource} sample was ${method === 'split' ? 'split in two' : `sliced into ${String(g.pieces)} pieces`} with ${tool.id}, exposing new cut faces. Its mass, dry matter, nutrition, toxicity and decay are unchanged; no offcut or crumb is represented and the edge shows no wear. The reference stays whole.`,
    { trial: j.id, ...preparation, energy: CUT, view: view(w, j) },
    sample.id,
  );
  c.emit(
    EVENT('placed'),
    `The pieces lie cut face up on ${text(j.support?.id)}, covering ${String(need)}. Their water now follows the actual weather; nothing is dried, preserved or made safe by laying them out.`,
    { ...report(w, j), view: view(w, j) },
    sample.id,
  );
  sync(a, j);
  return {
    complete: true,
    writes: [j.id, sample.id, tool.id, ...(item ? [item.id] : [])],
  };
}

/** One paid weighing round of the sample, the reference or both on a tested comparator. */
function measure(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  const j = trialOf(c, 'weigh');
  const deviceId = text(action.args.measurementDeviceId);
  if (!deviceId)
    throw nothing(
      `Weighing needs measurementDeviceId: your own tested ${COMPARATOR} in reach. Counts and inventory quantities are not measurements.`,
    );
  const cal = LONG_EX21_BEAM_MASS_KIT.calibrated(w, a, deviceId);
  if (typeof cal === 'string')
    throw nothing(`Missing measuring prerequisite: ${cal}.`);
  // Both trial items are weighed each round; a reference that has spoiled is no longer there.
  const items: [string, V7Stack, LeverWeighing][] = [];
  for (const [role, id] of [
    ['sample', j.sample],
    ['reference', j.reference],
  ] as const) {
    if (role === 'reference' && j.referenceSpoiledAt !== null) continue;
    const s =
      role === 'sample' && j.stage === 'exposed'
        ? lying(w, j)
        : held(w, a, j, id);
    if (!s || (s.owner === null && !reach(w, a, s.position)))
      throw nothing(`The ${role} ${id} is not within your reach.`);
    const reading = LONG_EX21_BEAM_MASS_KIT.weigh(w, cal, s);
    if (typeof reading === 'string') throw nothing(`${id}: ${reading}.`);
    items.push([role, s, reading]);
  }
  const cost = round(WEIGH * items.length);
  if (a.vitals.energy + 1e-9 < cost)
    throw nothing(
      `Weighing ${String(items.length)} item(s) needs ${String(cost)} energy.`,
    );
  // All checks passed: each item is seated, the reference slid from both ends, then returned.
  v7Spend(a, cost);
  j.paidEnergy = round(j.paidEnergy + cost);
  const calibration = {
    beam: cal.beam.id,
    testedAt: cal.test.testedAt ?? null,
    testReadings: cal.test.readings ?? [],
    tare: cal.emptyNull,
  };
  const readings: Weighing[] = items.map(([role, s, r]) => ({
    event: '',
    tick: w.tick,
    trial: j.id,
    role,
    item: s.id,
    quantity: s.quantity,
    form: text(geometry(s)?.form) || 'whole',
    device: cal.device,
    reference: cal.reference.id,
    calibration,
    outward: r.outward,
    inward: r.inward,
    nullRange: r.nullRange,
    ratio: r.ratio,
    resolution: r.resolution,
    uncertainty: r.ratio
      ? round(((r.ratio[1] ?? 0) - (r.ratio[0] ?? 0)) / 2)
      : null,
    unit: 'mass as a fraction of the comparator reference',
  }));
  // The first weighing of each item stays as its baseline; later ones keep the latest few.
  const all = [...j.weighings, ...readings],
    tail = all.slice(-KEEP),
    baselines = ['sample', 'reference']
      .map((role) => all.find((r) => r.role === role))
      .filter((r): r is Weighing => !!r && !tail.includes(r));
  j.weighings = [...baselines, ...tail];
  const compared = comparisons(j);
  j.lastUpdate = w.tick;
  const said = readings
    .map((r) =>
      r.ratio
        ? `${r.role} ${String(r.ratio[0])} to ${String(r.ratio[1])} of the reference`
        : `${r.role} outside the comparator's range`,
    )
    .join('; ');
  // The personal record keeps this round's readings and the comparison; ids follow the event.
  openRemember(c, {
    key: `${j.id}:sample-weighings`,
    subject: j.resource,
    property:
      'sample and reference masses relative to the comparator reference',
    value: v7Json({
      trial: j.id,
      tick: w.tick,
      readings: readings.map((r) => ({
        role: r.role,
        item: r.item,
        quantity: r.quantity,
        form: r.form,
        device: r.device,
        ratio: r.ratio,
        uncertainty: r.uncertainty,
      })),
      comparison: compared,
    }),
    method: 'paid weighings on your tested comparator',
    condition: LIMITS,
    verified: false,
  });
  c.emit(
    EVENT('weighed'),
    `Weighed on ${cal.device}: ${said}. These are masses relative to the reference piece, with the comparator's resolution; water content is not measured.`,
    v7Json({
      trial: j.id,
      readings,
      comparison: compared,
      motion: readings.map((r) => ({
        item: r.item,
        outward: r.outward,
        inward: r.inward,
      })),
      energy: cost,
      method:
        'seat the item; slide the reference in from each end until the beam tips',
      limits: LIMITS,
      view: view(w, j),
    }) as V7Data,
    cal.device,
  );
  const event = w.events.at(-1)?.id ?? '';
  for (const r of readings) r.event = event;
  sync(a, j);
  return { complete: true, writes: [j.id] };
}

function tend(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c;
  const j = trialOf(c, 'tend');
  const t = lying(w, j);
  if (!t)
    throw nothing(
      j.stage === 'allocated'
        ? 'The sample is not cut and laid out yet.'
        : 'The pieces no longer lie on the support.',
    );
  if (!reach(w, a, t.position))
    throw nothing('Return within hand reach of the pieces to tend them.');
  const point = location(c);
  let surface: FoodWaterSurface | null = null;
  if (point) {
    if (!j.supportItem)
      throw nothing(
        'An existing surface cannot be moved; tend without location turns the pieces in place.',
      );
    if (!reach(w, a, point))
      throw nothing('The new point is beyond hand reach; walk there first.');
    surface = {
      kind: 'ground',
      x: point.x,
      y: point.y,
      area: Number(j.placement?.area),
    };
    try {
      foodWaterSurfaceArea(w, surface, t.id);
    } catch (error) {
      throw nothing(
        error instanceof Error ? error.message : 'The new point is unusable.',
        error,
      );
    }
  }
  if (a.vitals.energy + 1e-9 < TEND) throw nothing('Tending needs 0.2 energy.');
  v7Spend(a, TEND);
  j.paidEnergy = round(j.paidEnergy + TEND);
  if (surface) {
    // Support and pieces move together; the weather of the new point applies from now on.
    t.position = { x: surface.x, y: surface.y };
    j.placement = { ...surface };
    if (j.supportItem)
      j.supportItem = { ...j.supportItem, position: { ...t.position } };
    j.moves += 1;
  } else j.turns += 1;
  j.lastUpdate = w.tick;
  c.emit(
    EVENT('tended'),
    surface
      ? 'The support and the pieces were moved to a new point in reach; its rain, temperature, humidity and wind apply from now on.'
      : 'The pieces were turned in place. Equal faces are up after turning, so the represented exchange is unchanged; no water is taken by turning.',
    {
      trial: j.id,
      action: surface ? 'repositioned' : 'turned',
      energy: TEND,
      placement: j.placement,
      turns: j.turns,
      moves: j.moves,
      view: view(w, j),
    },
    t.id,
  );
  sync(a, j);
  return { complete: true, writes: [j.id, t.id] };
}

function stop(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c;
  const j = trialOf(c, 'stop');
  const released = settle(
    w,
    a,
    j,
    'stopped',
    'Sample trial stopped; the reference returns to ordinary use and any cut pieces and the support stay at the site. Spent energy, time and material are not refunded.',
    false,
  );
  openRemember(c, {
    key: `${j.id}:sample-trial`,
    subject: j.resource,
    property: 'prepared sample trial record',
    value: report(w, j),
    method: 'own trial record at stopping',
    condition: LIMITS,
    verified: false,
  });
  c.emit(
    EVENT('stopped'),
    `Trial stopped. ${j.placedAt === null ? 'The sample was never cut and returns whole.' : 'The cut pieces keep exchanging water with the weather and keep ageing where they lie; recover them with pickup.'} Preservation unverified.`,
    { ...report(w, j), released, view: view(w, j) },
    j.sample,
  );
  sync(a, j);
  return { complete: true, writes: [j.id, ...released] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = text(c.action.args.mode),
    allowed = ARGS[mode];
  if (!allowed) throw nothing('Unknown sample trial mode.');
  // Empty values are absent; any other argument this mode does not use is refused.
  const extra = Object.keys(c.action.args).filter(
    (k) =>
      k !== 'mode' &&
      !allowed.includes(k) &&
      c.action.args[k] !== null &&
      c.action.args[k] !== '',
  );
  if (extra.length) throw nothing(`${mode} does not use ${extra.join(', ')}.`);
  if (mode === 'start') return start(c);
  if (mode === 'prepare') return prepare(c);
  if (mode === 'measure') return measure(c);
  if (mode === 'tend') return tend(c);
  return stop(c);
}

/** One round of exposed-face exchange for every lying piece this operation has cut, whether or
 * not its trial is still open: it is an environmental process, not work. Carried food exchanges
 * nothing, as in the food water representation. Water and heat go to hidden audit ledgers. */
function exchange(w: V7World): Map<string, SampleExchange> {
  const before = record(w.state[PIECES]) ?? {},
    after: V7Data = {},
    done = new Map<string, SampleExchange>();
  const ledger = { ...(record(w.state[LEDGER]) ?? {}) },
    water = { ...(record(w.state[WATER]) ?? {}) };
  for (const s of w.stacks) {
    const g = geometry(s),
      p = s.physical;
    if (!g || !p || s.owner !== null || !(s.quantity > 0)) continue;
    const c = forestClimate(w, s.position, true),
      roof = Math.max(
        0,
        ...w.objects
          .filter((o) => o.kind === 'open-refuge')
          .map((o) => refugeRay(o, s.position, (c.wind ?? 0) * 0.25, 0)),
      ),
      last = record(before[s.id]),
      q = s.quantity;
    const r = sampleExchange({
      water: p.unitWater * q,
      solids: p.unitSolids * q,
      exposed: Number(g.exposedPerUnit) * q,
      footprint: Number(g.footprintPerUnit) * q,
      // Pieces laid again after being carried start at the air temperature.
      temperature:
        last && last.tick === w.tick - 1
          ? Number(last.temperature)
          : c.temperature,
      air: c.temperature,
      humidity: c.airHumidity ?? 0.65,
      wind: c.indoor ? 0 : (c.wind ?? 0),
      rain: c.indoor ? 0 : (c.rain ?? 0) * (1 - roof),
    });
    p.unitWater = round(r.water / q);
    p.unitMass = round(p.unitWater + p.unitSolids);
    after[s.id] = { temperature: r.temperature, tick: w.tick };
    done.set(s.id, r);
    const add = (o: V7Data, k: string, v: number) => {
      o[k] = round(Number(o[k] ?? 0) + v);
    };
    add(ledger, 'evaporated', r.evaporated);
    add(ledger, 'condensed', r.condensed);
    add(ledger, 'rain', r.received);
    add(ledger, 'latentHeat', r.latent);
    add(ledger, 'heatFromAir', r.sensible);
    add(ledger, 'pieceHeat', r.stored);
    add(water, 'evaporated', r.evaporated);
    add(water, 'absorbed', r.condensed);
    add(water, 'rain', r.received);
  }
  if (done.size || Object.keys(before).length) w.state[PIECES] = after;
  if (done.size) {
    w.state[LEDGER] = ledger;
    w.state[WATER] = water;
  }
  return done;
}

/** Ends the trial when the sample is gone, and reports how. A carried reserved sample can only
 * spoil; lying pieces can also be taken. */
function gone(w: V7World, a: V7Actor, j: Trial) {
  const spoiled = j.stage === 'allocated' || spoiledNow(w, j.sample);
  j.takenBy = spoiled
    ? null
    : (w.events.find((e) => e.type === 'picked-up' && e.target === j.sample)
        ?.actor ?? null);
  const at = site(w, j);
  settle(
    w,
    a,
    j,
    spoiled ? 'spoiled' : 'removed',
    spoiled
      ? 'The sample spoiled under the ordinary ageing; the trial failed and the reference returns to ordinary use.'
      : 'The pieces were taken or moved off the support; the trial was interrupted and the reference returns to ordinary use.',
    false,
  );
  forestEvent(
    w,
    EVENT(spoiled ? 'spoiled' : 'removed'),
    spoiled
      ? 'The sample spoiled and is gone; the trial failed without preservation.'
      : 'The pieces are gone from the support; the trial was interrupted. Preservation unverified.',
    at,
    a.id,
    { ...report(w, j), view: view(w, j) },
    j.sample,
  );
}

/** The window has elapsed: weighed comparisons, or indeterminate without any. */
function finish(w: V7World, a: V7Actor, j: Trial) {
  const compared = comparisons(j),
    at = site(w, j),
    weighed = !!compared?.sample;
  settle(
    w,
    a,
    j,
    weighed ? 'completed' : 'indeterminate',
    weighed
      ? 'The exposure window ended; the comparison uses your weighings only. The reference returns to ordinary use and the pieces and support stay at the site.'
      : 'The exposure window ended without a before and after weighing of the sample, so no measured result exists. The reference returns to ordinary use and the pieces and support stay at the site.',
    false,
  );
  forestEvent(
    w,
    EVENT(weighed ? 'compared' : 'indeterminate'),
    weighed
      ? `The ${String(j.duration)}-round window ended. Weighed sample change: ${text(record(compared.sample)?.result)}. Elapsed time certifies nothing; preservation and safety are unverified.`
      : `The ${String(j.duration)}-round window ended without a before and after weighing; the result is indeterminate.`,
    at,
    a.id,
    { ...report(w, j), view: view(w, j) },
    j.sample,
  );
}

/** Exposure continues unattended: the exchange, rain, removal, spoilage and the window end. */
function environment(w: V7World) {
  const done = exchange(w);
  for (const j of trials(w).filter(open)) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a) continue;
    const ref = w.stacks.find((s) => s.id === j.reference);
    if (ref) j.referenceDecay = round(ref.decay ?? 0);
    else if (j.referenceSpoiledAt === null) {
      j.referenceSpoiledAt = w.tick;
      forestEvent(
        w,
        EVENT('reference-spoiled'),
        'The carried reference spoiled under the ordinary ageing; the sample stays without it.',
        a.position,
        a.id,
        {
          trial: j.id,
          reference: j.reference,
          spoiled: spoiledNow(w, j.reference),
        },
        j.reference,
      );
    }
    if (j.stage === 'allocated') {
      // Before the cut nothing is exposed and no window runs; the portions age as carried food.
      const s = w.stacks.find((s) => s.id === j.sample);
      if (!s) gone(w, a, j);
      else {
        j.sampleDecay = round(s.decay ?? 0);
        j.lastUpdate = w.tick;
      }
      sync(a, j);
      continue;
    }
    const t = lying(w, j);
    if (!t) {
      gone(w, a, j);
      sync(a, j);
      continue;
    }
    j.sampleDecay = round(t.decay ?? 0);
    if (t.quantity < j.quantity - 1e-9) {
      const taken = round(j.quantity - t.quantity);
      j.quantity = t.quantity;
      forestEvent(
        w,
        EVENT('reduced'),
        `${String(taken)} of the pieces was taken; the rest stays on the support.`,
        t.position,
        a.id,
        { trial: j.id, taken, quantity: t.quantity, view: view(w, j) },
        t.id,
      );
    }
    const r = done.get(t.id),
      wet = !!r && r.received > 0;
    if (wet) {
      j.rainRounds += 1;
      if (!j.wet)
        forestEvent(
          w,
          EVENT('rained-on'),
          'Rain is falling on the uncovered pieces; their cut faces take up water.',
          t.position,
          a.id,
          {
            trial: j.id,
            rainRounds: j.rainRounds,
            view: { ...view(w, j), visible: 'wet from rain' },
          },
          t.id,
        );
    }
    j.wet = wet;
    j.lastUpdate = w.tick;
    // A simulation event, not a reading: it carries what can be seen, never amounts.
    forestEvent(
      w,
      EVENT('exchange'),
      'The cut faces exchanged water with the air this round under the actual weather; nothing was measured.',
      t.position,
      a.id,
      {
        trial: j.id,
        item: t.id,
        process: 'exposed cut-face moisture exchange',
        measured: false,
        view: view(w, j),
      },
      t.id,
    );
    if (j.placedAt !== null && w.tick - j.placedAt >= j.duration)
      finish(w, a, j);
    sync(a, j);
  }
}

/** ex21: Moss's general prepared-sample comparison. */
export const LONG_EX21_SAMPLE_DRYING: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex21',
  dependencies: ['foundation-open@1', `${COMPARATOR}@1`],
  description:
    'A general prepared-sample comparison: a small sample and an equal reference from one owned food stack; the sample is split or sliced with an acquired stone or flint edge and laid on a validated support, where only its new cut faces exchange water with the actual weather by a bounded heat and vapour transfer; both are weighed on a tested beam comparator as reference-relative mass intervals. No preservation, safety or reward.',
  reuse: {
    experiment:
      'ex21 air-dry-food-trial@1 (support rule, footprint, shrinkage classes, reference handling, lifecycle and endings), ex19 food-air-exposure-trial@1 (whole-food check, decay readings), ex19 thin-slice-food-drying-trial@1 (stone or flint edge rule), ex19 lever-mass-comparator@1 through beam-mass-comparator@1 (calibration and weighing physics), ex17 thermal food preparation (food sphere, heat capacities, round length), the food water representation (composition, opening damage, equilibrium, rain coefficient, ledger)',
    source:
      'long-ex21-air-dry-food.ts (airDrySupportProblem, AIR_DRY_FOOTPRINT, airDryShrinkage); long-ex19-food-air-exposure.ts (airExposureUnsupported, airExposureTrack); long-ex19-thin-slice-food-drying.ts (thinSliceEdgeProblem); long-ex21-beam-mass-comparator.ts (calibrated, weigh); long-thermal-physics.ts (HEAT); food-water.ts; open-hardness-physics.ts (scratchPhysical); collective-work.ts; open-foundation.ts (openRemember); probe, navigate, gather, pickup and drop stay separate actions',
    description:
      'Implementation reuse only; no tool, support, instrument, food, skill or mastery is supplied and every reused package is unchanged. New work is the sample allocation, the split and slice geometry, the exposed-face heat and vapour exchange and the weighing comparisons.',
  },
  abilities: [
    {
      id: ID,
      name: 'Compare prepared material samples',
      function:
        'Take a small sample and equal reference from your own food; split or slice the sample with your stone or flint edge onto a clean support in actual weather; weigh both on your tested beam comparator; tend; stop.',
      equivalence: 'material:prepared-sample:mass-comparison:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['start', 'prepare', 'measure', 'tend', 'stop'],
          },
          sourceItemId: { type: 'string' },
          sampleQuantity: { type: 'number' },
          preparation: { type: 'string', enum: ['split', 'slice'] },
          toolId: { type: 'string' },
          supportId: { type: 'string' },
          measurementDeviceId: { type: 'string' },
          location: v7ObjectSchema({
            x: { type: 'number' },
            y: { type: 'number' },
          }),
          durationRounds: { type: 'integer', minimum: 1 },
          trialId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: {
        sourceItemId: 'optional-exact-visible',
        toolId: 'optional-exact-visible',
        supportId: 'optional-exact-visible',
        measurementDeviceId: 'optional-exact-visible',
      },
      prerequisites: [],
      learning: 4,
      costs:
        'Study: 4 rounds. start: sourceItemId, your unspoiled whole berry or root stack; sampleQuantity 0.1-1 (default 0.1; over twice it must remain); durationRounds, exposure window (default 10); 1 round, 0.2 energy. prepare: preparation; toolId, your carried whole stone or flint unit with a usable edge; supportId, your clean, dry, rigid, non-toxic item (a whole unit per 0.04 covered) laid at location in reach on firm clear ground, or a food surface in reach; 1 round, 0.5. measure: measurementDeviceId, your tested beam-mass-comparator in reach, weighs the sample and the reference; 1 round, 0.2 per item. tend: in reach; location moves your support and pieces; 1 round, 0.2. stop: 1 round, 0. Checks precede any charge; travel, gathering and comparator work cost separately.',
      effects:
        'Start separates sample and reference with tenths, decay, harvest time, origin and the world water record (assumed root 0.75, berry 0.85); both stay whole, carried, reserved. Prepare cuts the sample, taken as a 1000 kg/m3 sphere, into 2 halves or slabs of at most 5 mm laid cut face up (at least 0.04 per unit); no mass, wear or offcut; opening damage 1.1. Each round only lying cut faces exchange water: rate h/1200 x (saturation vapour density at the face - humidity x that of the air), h = 10 x (1 + 0.5 wind), face temperature from the heat balance with latent heat 2.45 MJ/kg, bounded by free water above the humidity equilibrium within 0.33 mm; rain adds 0.01 x rain x area; dry matter and nutrition stay. A weighing slides the reference both ways: mass as a reference fraction at 0.02 resolution against the tested tare; repeats give after/before and reference-adjusted intervals, a change only if 1 is excluded, else unresolved. No water content is shown. The window ends completed (weighed) or indeterminate; spoilage, removal, stop or death end it early, releasing the reference once; pieces and support stay. No preservation, safety or reward.',
      handler: HANDLER,
      revision: REVISION,
      authored: false,
      // The weighing event carries no qualified flag: weighing earns no practice milestone.
      practiceEvidence: EVENT('weighed'),
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'One atomic round per mode; lying cut pieces keep exchanging water unattended, without charge.',
      },
    },
  ],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: [
    EVENT('allocated'),
    EVENT('cut'),
    EVENT('placed'),
    EVENT('weighed'),
    EVENT('tended'),
    EVENT('exchange'),
    EVENT('rained-on'),
    EVENT('reduced'),
    EVENT('removed'),
    EVENT('spoiled'),
    EVENT('reference-spoiled'),
    EVENT('compared'),
    EVENT('indeterminate'),
    EVENT('stopped'),
    EVENT('interrupted'),
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath(w, a) {
    for (const j of trials(w).filter((j) => j.owner === a.id && open(j))) {
      const at = site(w, j);
      settle(
        w,
        a,
        j,
        'ended-by-death',
        'Performer died; the trial ended and reserved portions lie where the person died under the death rules. Cut pieces and the support stay at the site; nothing is refunded.',
        true,
      );
      forestEvent(
        w,
        EVENT('interrupted'),
        'The trial ended by death; cut pieces stay at the site and keep exchanging water and ageing.',
        at,
        a.id,
        { ...report(w, j), view: view(w, j) },
        j.sample,
      );
      sync(a, j);
    }
  },
};
