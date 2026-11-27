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
import { collectiveFoodProfile } from './collective-food-profile.js';
import { forestEvent } from './forest-climate.js';
import {
  foodWaterExpose,
  foodWaterInitialize,
  foodWaterRead,
  foodWaterSurfaceArea,
  foodWaterWithdraw,
} from './food-water.js';
import type { FoodWaterSurface } from './food-water.js';
import { OPEN_FOUNDATION, openRemember } from './open-foundation.js';
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
import {
  ex19MaterialContact,
  ex19MaterialPiece,
  ex19MaterialWhole,
} from './long-ex19-material-contact.js';

/** ex21: a passive, unheated air-drying trial of whole food on an obtained food-contact support,
 * beside an equal untreated reference from the same stack, over the installed food water
 * representation. Under that representation whole food neither evaporates nor absorbs vapour
 * (CULTURE_SCENARIO section G), so this trial records exposure, rain and ordinary decay; it
 * never dries, preserves or makes food safe. */

const ID = 'air-dry-food-trial';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
const STATE = `long:work:${ID}`;
/** Setup: one active round and 1 energy (World Agent specification). */
const SETUP = 1;
/** Turning or repositioning: one active round and 0.2 energy (World Agent specification). */
const TEND = 0.2;
/** Inspection reuses probe observe, which charges its own 0.2 energy; nothing is added. */
const LOOK = 0.2;
/** Default observation interval in elapsed rounds after setup (World Agent specification). */
const DURATION = 10;
/** Single-layer footprint of one whole unit, the declared ex19 whole-food footprint (0.2 x 0.2).
 * Modeling assumption: one whole support unit offers this footprint for one food unit. */
const FOOTPRINT = 0.04;
/** A dry support: represented water fraction at most this (the driest material class). */
const DRY = 0.1;
/** A rigid support: contact-resistance index at least this (the world's intact-stone threshold of
 * its existing tool rules) and flexibility 0. */
const RIGID = 8;
/** Stack records that mark represented treatments, residues or wetness; clean supports carry none. */
const TREATMENTS = [
  'processing',
  'materialLayer',
  'canopyDrying',
  'fuelMoisture',
] as const;
/** Readings kept in the trial record; older inspections stay in the personal record only. */
const OBSERVATIONS = 12;

/** The persistent trial record: one paid setup round, then unattended exposure. */
interface Trial extends CollectiveWork {
  stage: string;
  input: string;
  resource: string;
  treated: string;
  reference: string;
  /** The support: an own item held at the site while in use, or an existing food surface. */
  support: V7Data;
  /** The exact support item record while it lies committed under the treated units. */
  supportItem: V7Data | null;
  placement: V7Data;
  placedAt: number;
  duration: number;
  quantity: number;
  initialQuantity: number;
  treatedDecay0: number;
  treatedDecay: number;
  referenceDecay0: number;
  referenceDecay: number;
  referenceSpoiledAt: number | null;
  baseline: V7Data;
  turns: number;
  moves: number;
  rainRounds: number;
  wet: boolean;
  inspections: number;
  observations: V7Data[];
  comparison: V7Data | null;
  lastUpdate: number;
  endedAt: number | null;
  takenBy: string | null;
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

/** Visual status of the trial; elapsed time alone never shows success. */
function status(j: Trial): string {
  if (j.stage === 'exposed') return 'exposed';
  if (j.stage === 'completed' || j.stage === 'indeterminate') return j.stage;
  return j.stage === 'spoiled' ? 'failed' : 'interrupted';
}

/** Visible shrinkage from the actual current over initial mass: a look, not a measurement. */
function shrinkage(s: V7Stack | undefined): string {
  const ratio = s ? foodWaterRead(s)?.massRatio : undefined;
  if (ratio === undefined) return 'not seen';
  return ratio >= 0.95
    ? 'no visible shrinkage'
    : ratio >= 0.75
      ? 'slightly shrunken'
      : ratio >= 0.5
        ? 'clearly shrunken'
        : 'shrivelled';
}

/** The treated units while they lie, unowned, exposed on their surface. */
function lying(w: V7World, j: Trial): V7Stack | undefined {
  const s = w.stacks.find((s) => s.id === j.treated);
  return s && s.owner === null && s.quantity > 0 && foodWaterRead(s)?.surface
    ? s
    : undefined;
}

/** Where the treated units lie: the support site. */
function site(w: V7World, j: Trial): V7Point {
  const p = j.placement;
  if (p.kind === 'ground') return { x: Number(p.x), y: Number(p.y) };
  const o = w.objects.find((o) => o.id === p.id);
  return o ? { x: o.spatial.x, y: o.spatial.y } : { x: j.x, y: j.y };
}

/** Why an own item cannot be a food-contact support for `units` food units, or null. The world
 * represents no dirt on gathered material, so clean means no contamination, residue, marking or
 * treatment record; the support's own ground contact is not food contact. */
function supportProblem(
  w: V7World,
  a: V7Actor,
  s: V7Stack | undefined,
  units: number,
): string | null {
  const piece = ex19MaterialPiece(w, a, s);
  if (piece || !s) return piece ?? 'Name your own support item.';
  const m = collectiveFoodProfile(w, s);
  if (!m) return `${s.id} has no represented material.`;
  if (m.toxicity > 0) return `${s.id} is toxic and cannot touch food.`;
  if ((m.properties?.decay ?? 0) > 0)
    return `${s.id} is perishable material, not a stable support.`;
  if (TREATMENTS.some((k) => s[k] !== undefined))
    return `${s.id} carries a treatment, residue, marking or wetness record; only clean untreated material may touch food.`;
  const c = ex19MaterialContact(w, s);
  if (c.contaminated || c.fractured)
    return `${s.id} is contaminated or fractured.`;
  const water =
    s.physical && s.physical.unitMass > 0
      ? s.physical.unitWater / s.physical.unitMass
      : (m.properties?.moisture ?? 1);
  if (water > DRY + 1e-9)
    return `${s.id} is not dry: water fraction ${String(round(water))}, above ${String(DRY)}.`;
  if (c.resistance < RIGID || (m.properties?.flexibility ?? 1) > 0)
    return `${s.id} is not rigid: contact-resistance index ${String(c.resistance)} (8+ needed) and flexibility ${String(m.properties?.flexibility ?? 0)} (0 needed).`;
  if (ex19MaterialWhole(s) < units)
    return `${s.id} holds ${String(s.quantity)}; one whole support unit is needed per food unit, ${String(units)} here.`;
  return null;
}

/** Reusable drawing metadata; it never shows dryness, preservation or success. */
function view(w: V7World, j: Trial): V7Data {
  const s = w.stacks.find((s) => s.id === j.treated),
    at = site(w, j);
  return {
    component: 'ground-stack',
    operation: 'passive_food_drying',
    trial: j.id,
    actor: j.owner,
    source: j.input,
    item: j.treated,
    reference: j.reference,
    resource: j.resource,
    color: w.resources.find((r) => r.id === j.resource)?.color ?? '#cfaf79',
    quantity: s?.quantity ?? 0,
    placement: 'support',
    support: j.support,
    x: at.x,
    y: at.y,
    form: 'intact',
    startedAt: j.placedAt,
    updatedAt: j.lastUpdate,
    progress: {
      basis: 'elapsed_exposure',
      elapsed: w.tick - j.placedAt,
      duration: j.duration,
    },
    visible: j.wet ? 'wet from rain' : shrinkage(s),
    status: status(j),
    preservation: 'unverified',
    evidence: j.observations.map((o) => o.event ?? null),
  };
}

/** Everything inspection can record: quantities, decay of both units, visible changes, rain. */
function report(w: V7World, j: Trial): V7Data {
  const elapsed = w.tick - j.placedAt,
    s = w.stacks.find((s) => s.id === j.treated),
    treated = airExposureTrack(
      w,
      j.treated,
      j.treatedDecay0,
      j.treatedDecay,
      elapsed,
      j.resource,
    ),
    reference = airExposureTrack(
      w,
      j.reference,
      j.referenceDecay0,
      j.referenceDecay,
      elapsed,
      j.resource,
    );
  return {
    trial: j.id,
    stage: j.stage,
    status: status(j),
    method: 'passive unheated air-drying of whole units on a support',
    resource: j.resource,
    source: j.input,
    support: j.support,
    placement: j.placement,
    baseline: j.baseline,
    placedAt: j.placedAt,
    durationRounds: j.duration,
    tick: w.tick,
    elapsedRounds: elapsed,
    treated,
    reference,
    decayDifference: round(
      Number(treated.decayGained) - Number(reference.decayGained),
    ),
    visible: {
      method: 'visual',
      shrinkage: shrinkage(s),
      wetness: j.wet ? 'wet from rain' : 'no visible wetness',
      spoilage: treated.visibleSpoilage ?? null,
    },
    handling:
      'Treated units lie on the support at the site; the reference is carried by you. Location and handling differ.',
    turns: j.turns,
    moves: j.moves,
    rainRounds: j.rainRounds,
    wetNow: j.wet,
    inspections: j.inspections,
    takenBy: j.takenBy,
    water: 'not measured; no weighing or moisture reading exists',
    drying: 'none for whole food under the represented rules',
    contamination: 'support contact; not assessed',
    safety: 'unverified',
    preservation: 'unverified',
    paidEnergy: round(j.paidEnergy),
  };
}

/** The end-of-interval comparison, built from recorded inspections only. */
function compare(j: Trial): V7Data | null {
  const first = j.observations[0],
    last = j.observations.at(-1);
  if (!first || !last) return null;
  return {
    basis: 'your recorded inspections only',
    inspections: j.inspections,
    firstAt: first.tick ?? null,
    lastAt: last.tick ?? null,
    elapsedAtLast: last.elapsedRounds ?? null,
    treatedDecayGained: last.treatedDecayGained ?? null,
    referenceDecayGained: last.referenceDecayGained ?? null,
    decayDifference: last.decayDifference ?? null,
    treatedVisible: last.visible ?? null,
    rainRounds: last.rainRounds ?? null,
    evidence: j.observations.map((o) => o.event ?? null),
    handling:
      'treated units lay on the support at the site; the reference was carried; location and handling differ',
    limits:
      'decay readings are world values, not a microbial test; water was not measured; appearance cannot establish safety',
    preservation: 'unverified',
    safety: 'unverified',
  };
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

/** Ends a trial once: the reference is released, the treated units stop lying exposed and the
 * support item lies at the site; spent work is not refunded. */
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
  const t = lying(w, j);
  if (t) foodWaterWithdraw(w, t);
  const back = restore(w, j);
  j.x = a.position.x;
  j.y = a.position.y;
  workStop(w, a, j, reason, ground);
  j.stage = stage;
  j.endedAt = w.tick;
  j.outcome = v7Json(report(w, j));
  return back ? [...released, back] : released;
}

/** Checked support and placement of one layer of `quantity` whole units, before any charge. */
function placement(
  c: V7ActionContext,
  quantity: number,
): { surface: FoodWaterSurface; item: V7Stack | undefined } {
  const { world: w, actor: a, action } = c;
  const id = text(action.args.supportId);
  if (!id)
    throw nothing(
      'Name the support in supportId: your own clean, dry, rigid item, or an existing food surface in reach.',
    );
  const need = round(FOOTPRINT * quantity);
  const o = w.objects.find((o) => o.id === id);
  let surface: FoodWaterSurface;
  let item: V7Stack | undefined;
  if (o) {
    if (action.args.x !== undefined || action.args.y !== undefined)
      throw nothing(
        'Food on an existing surface lies at its centre; give x and y only with your own support item.',
      );
    if (!v7Reach(a, o.spatial)) throw nothing(`${id} is out of reach.`);
    const owner = o.data.owner;
    if (typeof owner === 'string' && owner !== a.id)
      throw nothing(`${id} belongs to ${owner}.`);
    surface = { kind: 'object', id };
  } else {
    item = w.stacks.find((s) => s.id === id);
    const why = supportProblem(w, a, item, quantity);
    if (why) throw nothing(why);
    const point: V7Point = {
      x:
        action.args.x === undefined
          ? a.position.x
          : v7Number(action.args.x, 'x'),
      y:
        action.args.y === undefined
          ? a.position.y
          : v7Number(action.args.y, 'y'),
    };
    if (!reach(w, a, point))
      throw nothing(
        'The placement point is beyond hand reach; walk there first.',
      );
    surface = { kind: 'ground', x: point.x, y: point.y, area: need };
  }
  let area: number;
  try {
    area = foodWaterSurfaceArea(w, surface);
  } catch (error) {
    throw nothing(
      error instanceof Error ? error.message : 'The placement is unusable.',
      error,
    );
  }
  if (area + 1e-9 < need)
    throw nothing(
      `${id} offers ${String(round(area))} of surface; ${String(quantity)} units in one layer need ${String(need)}.`,
    );
  return { surface, item };
}

function start(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  const existing = current(w, a);
  if (existing)
    throw nothing(
      `Your drying trial ${existing.id} is still open; stop it first.`,
    );
  const input = w.stacks.find((s) => s.id === action.args.inputStackId);
  if (!input || input.owner !== a.id)
    throw nothing(
      'Name one of your own food stacks by its exact item id in inputStackId.',
    );
  if (input.reservedFor)
    throw nothing('That food is reserved for unfinished work.');
  const problem = airExposureUnsupported(w, input);
  if (problem) throw nothing(problem);
  const quantity = action.args.quantity ?? 1,
    duration = action.args.durationRounds ?? DURATION;
  if (
    typeof quantity !== 'number' ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1
  )
    throw nothing('quantity is a whole number of units, at least 1.');
  if (
    typeof duration !== 'number' ||
    !Number.isSafeInteger(duration) ||
    duration < 1
  )
    throw nothing('durationRounds is a whole number of rounds, at least 1.');
  if (2 * quantity > ex19MaterialWhole(input))
    throw nothing(
      `${input.id} holds ${String(input.quantity)} units; ${String(quantity)} treated and ${String(quantity)} reference whole units are needed.`,
    );
  const { surface, item } = placement(c, quantity);
  if (a.vitals.energy + 1e-9 < SETUP)
    throw nothing('Setting up the trial needs 1 energy.');
  // All checks passed: one paid round separates the units and lays them on the support.
  const j = workCreate(c, 'passive-air-drying', 1) as Trial;
  if (!workPay(c, j, SETUP))
    throw new Error('Energy changed before the paid round.');
  a.vitals.energy = round(Math.max(0, a.vitals.energy));
  j.paidEnergy = round(j.paidEnergy);
  let held: V7Stack | null = null;
  if (item) {
    // The support units leave the carried load and lie committed under the food at the site.
    workReserve(
      c,
      j,
      workAllocations(c, [{ itemId: item.id, quantity }]),
      true,
    );
    const part = w.stacks.find((s) => s.id === j.escrow.at(-1));
    if (!part) throw new Error('The support unit is missing.');
    w.stacks = w.stacks.filter((s) => s.id !== part.id);
    j.escrow = [];
    held = {
      ...v7Clone(part),
      owner: null,
      position:
        surface.kind === 'ground'
          ? { x: surface.x, y: surface.y }
          : part.position,
    };
    delete held.reservedFor;
  }
  workReserve(c, j, workAllocations(c, [{ itemId: input.id, quantity }]), true);
  const treated = w.stacks.find((s) => s.id === j.escrow.at(-1));
  if (!treated) throw new Error('The separated treated units are missing.');
  // Food lying in the world is unowned and unreserved, like any dropped stack.
  delete treated.reservedFor;
  j.escrow = [];
  const water = foodWaterExpose(w, treated, surface, false);
  // The reference stays carried and reserved, untreated, with the same water record.
  workReserve(c, j, workAllocations(c, [{ itemId: input.id, quantity }]));
  const reference = w.stacks.find((s) => s.id === j.escrow.at(-1));
  if (!reference) throw new Error('The separated reference is missing.');
  foodWaterInitialize(w, reference);
  const support: V7Data = held
    ? {
        kind: 'item',
        id: held.id,
        resource: held.resource,
        quantity: held.quantity,
        origin: held.origin,
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
      };
  Object.assign(j, {
    stage: 'exposed',
    input: input.id,
    resource: input.resource,
    treated: treated.id,
    reference: reference.id,
    support,
    supportItem: held ? v7Json(held) : null,
    placement: { ...surface, area: water.area },
    placedAt: w.tick,
    duration,
    quantity: treated.quantity,
    initialQuantity: treated.quantity,
    treatedDecay0: round(treated.decay ?? 0),
    treatedDecay: round(treated.decay ?? 0),
    referenceDecay0: round(reference.decay ?? 0),
    referenceDecay: round(reference.decay ?? 0),
    referenceSpoiledAt: null,
    baseline: {
      tick: w.tick,
      quantity: treated.quantity,
      referenceQuantity: reference.quantity,
      sourceRemaining: input.quantity,
      decay: round(treated.decay ?? 0),
      harvestedAt: treated.harvestedAt ?? null,
      origin: treated.origin,
      moisture: 'assumed composition of the world model; not measured',
      visible: shrinkage(treated),
    },
    turns: 0,
    moves: 0,
    rainRounds: 0,
    wet: false,
    inspections: 0,
    observations: [],
    comparison: null,
    lastUpdate: w.tick,
    endedAt: null,
    takenBy: null,
    target: treated.id,
    outputs: [treated.id, reference.id],
  });
  c.emit(
    'air-dry-trial-placed',
    `${String(quantity)} whole ${input.resource} laid in one layer on ${text(support.id)}, with ${String(quantity)} kept carried as the untreated reference; ${String(input.quantity)} remain in ${input.id}. Exposure is under way for ${String(duration)} rounds; nothing is dried, preserved or made safe by it.`,
    { ...report(w, j), energy: SETUP, view: view(w, j) },
    treated.id,
  );
  sync(a, j);
  return {
    complete: true,
    writes: [
      j.id,
      input.id,
      treated.id,
      reference.id,
      ...(item ? [item.id] : []),
    ],
  };
}

/** The open trial and its treated units within hand reach, or the reason to refuse. */
function reachable(c: V7ActionContext, verb: string): [Trial, V7Stack] {
  const { world: w, actor: a } = c;
  const j = current(w, a);
  if (!j) throw nothing(`You have no open drying trial to ${verb}.`);
  const t = lying(w, j);
  if (!t) throw nothing('The treated units no longer lie on the support.');
  if (!reach(w, a, t.position))
    throw nothing(
      `Return within hand reach of the treated units to ${verb} them.`,
    );
  return [j, t];
}

function tend(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  const [j, t] = reachable(c, 'tend');
  const moving = action.args.x !== undefined || action.args.y !== undefined;
  let surface: FoodWaterSurface | null = null;
  if (moving) {
    if (j.support.kind !== 'item')
      throw nothing(
        'An existing surface cannot be moved; tend without x and y turns the units in place.',
      );
    const point: V7Point = {
      x:
        action.args.x === undefined
          ? t.position.x
          : v7Number(action.args.x, 'x'),
      y:
        action.args.y === undefined
          ? t.position.y
          : v7Number(action.args.y, 'y'),
    };
    if (!reach(w, a, point))
      throw nothing('The new point is beyond hand reach; walk there first.');
    surface = {
      kind: 'ground',
      x: point.x,
      y: point.y,
      area: Number(j.placement.area),
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
    // Support and units move together; the exposure starts again at the new point.
    foodWaterWithdraw(w, t);
    const water = foodWaterExpose(w, t, surface, false);
    j.placement = { ...surface, area: water.area };
    if (j.supportItem)
      j.supportItem = { ...j.supportItem, position: { ...t.position } };
    j.moves += 1;
    j.wet = false;
  } else j.turns += 1;
  j.lastUpdate = w.tick;
  c.emit(
    'air-dry-trial-tended',
    surface
      ? `The support and treated units were moved to a new point in reach. Rain and temperature there now apply; whole food still does not dry.`
      : 'The treated units were turned in place. Under the represented rules whole food exchanges no water on any side, so turning changes no food state.',
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

function inspect(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c;
  const [j, t] = reachable(c, 'inspect');
  if (a.vitals.energy + 1e-9 < LOOK)
    throw nothing('Inspection reuses probe observe and needs 0.2 energy.');
  const probe = OPEN_FOUNDATION.handlers['open.probe'];
  if (!probe) throw new Error('Missing baseline probe.');
  // The reused probe observation: one round and its own 0.2 energy; no fee is added.
  probe({
    ...c,
    action: {
      interface: c.action.interface,
      args: { target: t.id, mode: 'observe', intensity: 0 },
    },
  });
  j.inspections += 1;
  const value = report(w, j);
  openRemember(c, {
    key: `${j.treated}:air-dry-trial`,
    subject: j.resource,
    property: 'air-dry trial readings',
    value,
    method: 'direct look at the treated units and the carried reference',
    condition:
      'whole food; water not measured; preservation and safety unverified',
    verified: false,
  });
  c.emit(
    'air-dry-trial-inspected',
    `Treated units inspected after ${String(w.tick - j.placedAt)} of ${String(j.duration)} rounds: ${String(Number(value.decayDifference))} decay difference from the reference, ${j.wet ? 'wet from rain' : shrinkage(t)}. Water was not measured and no preservation or safety is established.`,
    { ...value, view: view(w, j) },
    j.treated,
  );
  const treated = value.treated as V7Data,
    reference = value.reference as V7Data;
  j.observations = [
    ...j.observations,
    {
      tick: w.tick,
      elapsedRounds: w.tick - j.placedAt,
      treatedDecayGained: treated.decayGained ?? null,
      referenceDecayGained: reference.decayGained ?? null,
      decayDifference: value.decayDifference ?? null,
      visible: j.wet ? 'wet from rain' : shrinkage(t),
      rainRounds: j.rainRounds,
      event: w.events.at(-1)?.id ?? null,
    },
  ].slice(-OBSERVATIONS);
  sync(a, j);
  return { complete: true, writes: [j.id] };
}

function stop(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c;
  const j = current(w, a);
  if (!j) throw nothing('You have no open drying trial to stop.');
  const released = settle(
    w,
    a,
    j,
    'stopped',
    'Drying trial stopped before its interval ended; the reference returns to ordinary use and the treated units and support stay at the site. Spent energy and time are not refunded.',
    false,
  );
  const value = report(w, j);
  openRemember(c, {
    key: `${j.treated}:air-dry-trial`,
    subject: j.resource,
    property: 'air-dry trial readings',
    value,
    method: 'own trial record at stopping',
    condition:
      'whole food; water not measured; preservation and safety unverified',
    verified: false,
  });
  c.emit(
    'air-dry-trial-stopped',
    `Trial stopped after ${String(w.tick - j.placedAt)} of ${String(j.duration)} rounds. The treated units and support lie at the site and the units keep ageing; recover them with pickup. Preservation unverified.`,
    { ...value, released, view: view(w, j) },
    j.treated,
  );
  sync(a, j);
  return { complete: true, writes: [j.id, ...released] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = text(c.action.args.mode);
  if (mode === 'start') return start(c);
  if (mode === 'tend') return tend(c);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'stop') return stop(c);
  throw nothing('Unknown drying trial mode.');
}

/** Ends the trial when the treated units are gone, and reports how. */
function gone(w: V7World, a: V7Actor, j: Trial) {
  const spoiled = spoiledNow(w, j.treated);
  j.takenBy = spoiled
    ? null
    : (w.events.find((e) => e.type === 'picked-up' && e.target === j.treated)
        ?.actor ?? null);
  const at = site(w, j);
  settle(
    w,
    a,
    j,
    spoiled ? 'spoiled' : 'removed',
    spoiled
      ? 'The treated units spoiled under the ordinary ageing; the trial failed and the reference returns to ordinary use.'
      : 'The treated units were taken from the support; the trial was interrupted and the reference returns to ordinary use.',
    false,
  );
  forestEvent(
    w,
    spoiled ? 'air-dry-trial-spoiled' : 'air-dry-trial-removed',
    spoiled
      ? 'The treated units spoiled and are gone; the trial failed without preservation.'
      : 'The treated units were taken away; the trial was interrupted. Preservation unverified.',
    at,
    a.id,
    { ...report(w, j), view: view(w, j) },
    j.treated,
  );
}

/** The observation interval has elapsed: a comparison of recorded readings, or indeterminate. */
function finish(w: V7World, a: V7Actor, j: Trial) {
  const comparison = compare(j);
  j.comparison = comparison;
  const at = site(w, j);
  settle(
    w,
    a,
    j,
    comparison ? 'completed' : 'indeterminate',
    comparison
      ? 'The observation interval ended; the comparison uses your recorded readings. The reference returns to ordinary use and the treated units and support stay at the site.'
      : 'The observation interval ended without any inspection, so no comparison exists. The reference returns to ordinary use and the treated units and support stay at the site.',
    false,
  );
  forestEvent(
    w,
    comparison ? 'air-dry-trial-compared' : 'air-dry-trial-indeterminate',
    comparison
      ? `The ${String(j.duration)}-round interval ended. Recorded readings: decay difference ${String(Number(comparison.decayDifference))} from the reference. Elapsed time certifies nothing; preservation and safety are unverified.`
      : `The ${String(j.duration)}-round interval ended without any inspection; the result is indeterminate.`,
    at,
    a.id,
    { ...report(w, j), comparison, view: view(w, j) },
    j.treated,
  );
}

/** Unattended exposure: actual rain, removal, spoilage and the interval end; no labor or charge. */
function environment(w: V7World) {
  for (const j of trials(w).filter(open)) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (!a) continue;
    const ref = w.stacks.find((s) => s.id === j.reference);
    if (ref) j.referenceDecay = round(ref.decay ?? 0);
    else if (j.referenceSpoiledAt === null) {
      j.referenceSpoiledAt = w.tick;
      forestEvent(
        w,
        'air-dry-trial-reference-spoiled',
        'The carried reference spoiled under the ordinary ageing; the treated units stay exposed without it.',
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
    const t = lying(w, j);
    if (!t) {
      gone(w, a, j);
      sync(a, j);
      continue;
    }
    j.treatedDecay = round(t.decay ?? 0);
    if (t.quantity < j.quantity - 1e-9) {
      const taken = round(j.quantity - t.quantity);
      j.quantity = t.quantity;
      forestEvent(
        w,
        'air-dry-trial-reduced',
        `${String(taken)} of the treated units was taken; the rest stays on the support.`,
        t.position,
        a.id,
        { trial: j.id, taken, quantity: t.quantity, view: view(w, j) },
        t.id,
      );
    }
    const last = foodWaterRead(t)?.last;
    const wet = last?.tick === w.tick && Number(last.received) > 0;
    if (wet) {
      j.rainRounds += 1;
      if (!j.wet) {
        j.wet = true;
        forestEvent(
          w,
          'air-dry-trial-rained-on',
          'Rain is falling on the uncovered treated units and wetting them; their water rises.',
          t.position,
          a.id,
          {
            trial: j.id,
            change: 'water added by rain',
            rainRounds: j.rainRounds,
            view: view(w, j),
          },
          t.id,
        );
      }
    } else j.wet = false;
    j.lastUpdate = w.tick;
    if (w.tick - j.placedAt >= j.duration) finish(w, a, j);
    sync(a, j);
  }
}

/** ex21: Sol's passive air-drying trial of whole food on an obtained support. */
export const LONG_EX21_AIR_DRY_FOOD: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex21',
  dependencies: ['foundation-open@1'],
  description:
    'A general passive, unheated air-drying trial: whole units of owned food lie in one layer on an obtained clean, dry, rigid support or an existing food surface under the installed food water representation, beside an equal carried untreated reference from the same stack, with tending, probe inspection and a set observation interval. Whole food does not dry under the represented rules; nothing is preserved or made safe.',
  reuse: {
    experiment:
      'ex19 food-air-exposure-trial@1 (whole untreated food check, decay trajectory, carried paired reference, removal and spoilage semantics; its factory is not extended, see the description); ex19 material contact checks (own non-food piece, contact model); ex20 apply-marking-material@1 (calling probe for its own cost)',
    source:
      'long-ex19-food-air-exposure.ts (airExposureUnsupported, airExposureTrack); long-ex19-material-contact.ts (ex19MaterialPiece, ex19MaterialContact, ex19MaterialWhole); food-water.ts (foodWaterExpose, foodWaterInitialize, foodWaterRead, foodWaterSurfaceArea, foodWaterWithdraw; exchange and decay in open-preservation-physics.ts and forest-environment.ts); collective-work.ts; open-foundation.ts (open.probe observe, openRemember); base gather, pickup, navigate, learn and eat as separate actions',
    description:
      'The ex19 factory lays food on open ground with an optional control and three modes; this specification needs a committed obtained support, a turning and moving mode, probe inspection and an observation interval with a comparison, which would change nearly every behaviour and text of that package. A new module reuses its shared helpers instead and leaves ex19 untouched. The moisture, rain and decay rules are the existing representation, unchanged.',
  },
  abilities: [
    {
      id: ID,
      name: 'Air-dry food trial',
      function:
        'Lay whole units of your own berries or roots in one layer on a clean, dry, rigid support to air-dry in actual weather, beside an equal carried untreated reference from the same stack; tend (turn or move), inspect, stop.',
      equivalence: 'food:whole-unit:passive-air-drying-trial:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: ['start', 'tend', 'inspect', 'stop'] },
          inputStackId: { type: 'string' },
          quantity: { type: 'integer', minimum: 1 },
          supportId: { type: 'string' },
          x: { type: 'number' },
          y: { type: 'number' },
          durationRounds: { type: 'integer', minimum: 1 },
        }),
        required: ['mode'],
      },
      references: {
        inputStackId: 'optional-exact-visible',
        supportId: 'optional-exact-visible',
      },
      prerequisites: [],
      learning: 3,
      costs:
        "Study: 3 rounds. start: inputStackId, your own unspoiled untreated whole berry or root stack with 2 x quantity whole units (default quantity 1); supportId, your own carried item with quantity whole units that is non-food, non-toxic, non-perishable, dry (water fraction 0.1 or less), rigid (contact-resistance index 8+, flexibility 0), unfractured and clean (no contamination, residue, marking or treatment record), laid on firm ordinary unobstructed ground at x,y (default your position) within 0.65 plus your radius; or an existing food surface in reach, not another person's, of at least 0.04 x quantity area; durationRounds, default 10. One round, 1 energy. tend: within reach of the units; one round, 0.2 energy; turns them in place, or with x,y moves your support and the units to a new ground point in reach. inspect: within reach; reuses probe observe, one round and 0.2 energy. stop: one round, no energy. All checks precede any charge; gathering, travel and pickup cost separately.",
      effects:
        'Start separates quantity treated and quantity reference units from the stack with their tenths, decay, harvest time and origin, and gives both the world food water record (assumed water fraction berry 0.85, root 0.75). The treated units lie unowned on the support over 0.04 per unit, the support item held there; the reference stays carried and reserved. Each round the existing rules apply: whole food neither evaporates nor absorbs vapour, so it never dries; rain on an uncovered surface adds 0.01 x rain x area water; decay continues at the ordinary rate where each lies, never reset; nutrition and toxicity are unchanged; contamination is not assessed. Turning changes no represented food state. Inspect records elapsed rounds, quantities, both decays and their difference, visible shrinkage, wetness, spoilage and rain rounds, unverified; water is not measured. After durationRounds the trial ends with a comparison of your recorded readings, or indeterminate without any; spoilage, anyone taking all treated units, stop or death end it early. Ending releases the reference once and leaves the units and support lying at the site for pickup. No preservation, safety, refund or reward.',
      handler: HANDLER,
      revision: REVISION,
      authored: false,
      // The placement event carries no qualified flag: exposure earns no practice milestone.
      practiceEvidence: 'air-dry-trial-placed',
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'Each mode is one atomic round; the trial record persists and exposure continues unattended, without charge, until the interval ends, stop, removal, spoilage or death.',
      },
    },
  ],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: [
    'air-dry-trial-placed',
    'air-dry-trial-tended',
    'air-dry-trial-inspected',
    'air-dry-trial-rained-on',
    'air-dry-trial-reduced',
    'air-dry-trial-removed',
    'air-dry-trial-spoiled',
    'air-dry-trial-reference-spoiled',
    'air-dry-trial-compared',
    'air-dry-trial-indeterminate',
    'air-dry-trial-stopped',
    'air-dry-trial-interrupted',
    // Emitted by the food water exchange for exposed food (CULTURE_SCENARIO section G).
    'preservation-progress',
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
        'Performer died; the trial ended and the reference is released under the death rules. The treated units and support stay at the site; nothing is refunded.',
        true,
      );
      forestEvent(
        w,
        'air-dry-trial-interrupted',
        'The trial ended by death; the treated units and support stay at the site and the units keep ageing.',
        at,
        a.id,
        { ...report(w, j), view: view(w, j) },
        j.treated,
      );
      sync(a, j);
    }
  },
};

/** The food-contact support rule, per-unit footprint and visible shrinkage classes, shared with
 * later reviewed trials. */
export {
  supportProblem as airDrySupportProblem,
  FOOTPRINT as AIR_DRY_FOOTPRINT,
  shrinkage as airDryShrinkage,
};
