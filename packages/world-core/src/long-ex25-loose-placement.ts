import type {
  V7Ability,
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
import { v7Load, v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Id, v7Json, v7RoundNumber, v7Signature } from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7ShapeDistance,
  v7ShapesOverlap,
  v7Visible,
} from './continuous-geometry.js';
import { forestEvent } from './forest-climate.js';
import { FOREST_BASE } from './forest-foundation.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { materialPortion } from './material-lots.js';
import { geometryTransfer } from './open-material-geometry.js';
import { openConditions } from './open-physical.js';
import { ex19MaterialGround } from './long-ex19-material-contact.js';
import {
  SMALL_FIRE,
  smallFireComposition,
  smallFireRod,
} from './long-ex21-small-combustion-physics.js';

/** ex25: lay one carried loose unit on clear ground within reach at a chosen point and angle.
 * Stage 1 is a paid inspection that reserves the exact unit, still carried; stage 2 moves it
 * through the ordinary drop of foundation-forest@1 (handler forest.drop), whose ownership,
 * quantity, conservation and transfer checks and 0.5 energy are its own, then sets the dropped
 * item at the chosen point and records its angle and footprint. Base pickup recovers it. The
 * shape is the declared ex21 rod of rigid wood units; any other shape is unknown and placement
 * stays unavailable for it. Nothing is shaped, joined, fastened, copied or rewarded. */

const ID = 'position-loose-material';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
/** The open (ready or paused) placement work; the key is shown with the person's active work. */
const OPEN = `${ID}:work:open`;
/** The person's latest closed inspection and placement records, newest last. */
const RECORDS = `${ID}:records`;
const KEEP = 3;
/** The footprint record of a placed unit, its drawing, and the record on its ground item. */
const KIND = 'placed-loose-material';
const COMPONENT = 'placed-rod';
const MARK = 'groundPlacement';
/** World Agent specification: inspection 0.2 energy, the move and orientation 0.5 energy (the
 * energy ordinary drop charges), progress inspection 0.2, study 0.2. */
const COST = { inspect: 0.2, move: 0.5, check: 0.2, study: 0.2 };
const DROP = {
  ability: 'drop',
  revision: 'foundation-forest@1',
  handler: 'forest.drop',
};
/** Wood whose whole units carry the ex21 declared rod shape, as prepare-ventilated-food-
 * storage@1 uses it; only rigid ones (flexibility at most SMALL_FIRE.rigid) lie straight. */
const RODS = ['branch', 'willow', 'birch', 'oak'];
const BASIS =
  'declared rod of small-combustion-source@1: 900 kg/m3, length 25 diameters; a model, not a measurement';
/** Items with their own persistent representation or combined lots have no rod shape. */
const OWN_FORM = [
  'mantle',
  'frictionKit',
  'waterCup',
  'componentLots',
  'materialLayer',
] as const;
const MODES = ['inspect', 'place', 'inspect-progress', 'resume', 'cancel'];
const TURN = 6.2832;
const EVENTS = {
  inspected: 'material-placement-inspected',
  paused: 'material-placement-paused',
  infeasible: 'material-placement-infeasible',
  completed: 'material-placement-completed',
  cancelled: 'material-placement-cancelled',
  checked: 'material-placement-checked',
  ended: 'material-placement-ended',
  removed: 'material-placement-removed',
} as const;

interface Transform {
  x: number;
  y: number;
  angle: number;
}
interface Shape extends V7Data {
  known: boolean;
  kind: string | null;
  length: number | null;
  diameter: number | null;
  mass: number | null;
  basis: string;
  missing: string[];
}
interface Work extends V7Data {
  id: string;
  actor: string;
  mode: string;
  status: string;
  stage: string;
  item: string;
  unit: string | null;
  output: string | null;
  object: string | null;
  quantity: number;
  x: number | null;
  y: number | null;
  angle: number | null;
  length: number | null;
  diameter: number | null;
  findings: V7Data;
  unitFacts: V7Data;
  paidEnergy: number;
  paidRounds: number;
  stages: V7Data[];
  reason: string | null;
  startedAt: number;
  lastWorked: number;
  endedAt: number | null;
}
type Say = (type: string, description: string, data: V7Data) => void;

const round = (x: number) => v7RoundNumber(x);
const shown = (x: number) => String(Math.round(x * 1000) / 1000);
const nothing = (why: string) => new Error(`${why} Nothing was spent.`);
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const openWork = (a: V7Actor) => record(a.extensionState[OPEN]) as Work | null;
const records = (a: V7Actor): Work[] => {
  const list = a.extensionState[RECORDS];
  return Array.isArray(list) ? (list as unknown as Work[]) : [];
};
const placed = (w: V7World) =>
  w.objects.filter((o) => o.kind === KIND && o.revision === REVISION);
const colorOf = (w: V7World, resource: string) =>
  w.resources.find((r) => r.id === resource)?.color ?? '#8d704e';
const body = (a: V7Actor): V7Spatial => ({
  ...a.position,
  angle: 0,
  shape: { kind: 'circle', radius: a.radius },
  solid: true,
  interaction: 0,
  entrances: [],
});
/** The unit's material facts: ageing (decay), position, ownership and reservation are not
 * material changes, so they are left out. */
function unitFacts(s: V7Stack): V7Data {
  const out: V7Data = {};
  for (const [k, v] of Object.entries(s) as [string, unknown][])
    if (
      ![
        'id',
        'position',
        'owner',
        'reservedFor',
        'decay',
        'quantityTenths',
      ].includes(k) &&
      v !== undefined
    )
      out[k] = v7Json(v);
  return out;
}

/** The represented shape of one unit, or the facts that are missing for it. */
function shapeOf(w: V7World, s: V7Stack): Shape {
  const flex = w.resources.find((r) => r.id === s.resource)?.properties
    ?.flexibility;
  const missing: string[] = [];
  if (!RODS.includes(s.resource))
    missing.push(
      `no shape is represented for ${s.resource}; only branch, birch and oak units have a declared rod shape`,
    );
  else if (flex === undefined || flex > SMALL_FIRE.rigid)
    missing.push(
      `${s.resource} bends (flexibility ${String(flex ?? 'unknown')}; rigid is at most ${String(SMALL_FIRE.rigid)}), so its lying shape is not represented`,
    );
  if (
    OWN_FORM.some((k) => s[k] !== undefined) ||
    Object.keys(s.processing ?? {}).some((k) => k !== MARK)
  )
    missing.push(
      'the unit is worked, combined or equipment, and its changed shape is not represented',
    );
  if (foodTenths(s.quantity) < 10)
    missing.push('less than one whole unit: a part has no represented shape');
  if (missing.length)
    return {
      known: false,
      kind: null,
      length: null,
      diameter: null,
      mass: null,
      basis: 'not represented',
      missing,
    };
  const rod = smallFireRod(w, s);
  return {
    known: true,
    kind: 'straight rod',
    length: rod.length,
    diameter: rod.diameter,
    mass: smallFireComposition(w, s).unitMass,
    basis: BASIS,
    missing: [],
  };
}
/** Handling: a unit the person carries whose rod fits the ex21 two-handed grip. */
function handlingProblem(a: V7Actor, s: V7Stack, shape: Shape): string | null {
  if (s.owner !== a.id) return 'you do not carry this unit';
  const d = shape.diameter;
  if (d === null) return null;
  if (d < SMALL_FIRE.gripMin - 1e-9 || d > SMALL_FIRE.gripMax + 1e-9)
    return `the rod is ${shown(d)} m thick, outside the two-handed grip of ${String(SMALL_FIRE.gripMin)}-${String(SMALL_FIRE.gripMax)} m, so it needs assistance or equipment that is not represented`;
  return null;
}

const along = (p: Transform, length: number, t: number): V7Point => ({
  x: p.x + t * length * Math.cos(p.angle),
  y: p.y + t * length * Math.sin(p.angle),
});
function footprint(p: Transform, length: number, diameter: number): V7Spatial {
  return {
    x: p.x,
    y: p.y,
    angle: p.angle,
    shape: { kind: 'rectangle', width: length, height: diameter },
    solid: true,
    interaction: 0,
    entrances: [],
  };
}
function corners(p: Transform, length: number, diameter: number): V7Point[] {
  const c = Math.cos(p.angle),
    s = Math.sin(p.angle);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([u = 0, v = 0]) => ({
    x: p.x + (u * length * c) / 2 - (v * diameter * s) / 2,
    y: p.y + (u * length * s) / 2 + (v * diameter * c) / 2,
  }));
}
const samples = (p: Transform, length: number | null) =>
  length === null
    ? [{ x: p.x, y: p.y }]
    : [-0.5, -0.25, 0, 0.25, 0.5].map((t) => along(p, length, t));
/** Firm ground under every sample point: not water, a wet bank or waterlogged (ex19). */
const firm = (w: V7World, p: Transform, length: number | null) =>
  samples(p, length).every((q) => !ex19MaterialGround(w, q));

/** The observable site facts for one unit at a transform, with every unmet requirement. */
function siteOf(
  w: V7World,
  a: V7Actor,
  p: Transform,
  length: number | null,
  diameter: number | null,
) {
  const unmet: string[] = [];
  const blockers: string[] = [];
  const reach = round(a.radius + w.config.interaction);
  const distance = round(v7Distance(a.position, p));
  if (distance > reach + 1e-9)
    unmet.push(
      `the point is ${shown(distance)} m from you, beyond your ${shown(reach)} m reach (body radius plus interaction range)`,
    );
  const points = samples(p, length);
  if (points.some((q) => !v7Visible(w, a.position, q)))
    unmet.push('part of that ground is out of your sight');
  if (!firm(w, p, length))
    unmet.push(
      'the ground there is water, a wet bank or waterlogged, not firm ground',
    );
  if (length !== null && diameter !== null) {
    const foot = footprint(p, length, diameter);
    if (corners(p, length, diameter).some((q) => !v7Inside(w, q, 0)))
      unmet.push(
        `the footprint leaves the world (${String(w.config.width)} x ${String(w.config.height)})`,
      );
    for (const x of w.actors)
      if (x.vitals.health > 0 && v7ShapesOverlap(foot, body(x)))
        blockers.push(x.id === a.id ? 'your own body' : x.id);
    for (const o of w.objects)
      if (v7ShapesOverlap(foot, { ...o.spatial, solid: true }))
        blockers.push(o.id);
    for (const s of w.stacks)
      if (s.owner === null && v7ShapeDistance(s.position, foot) <= 1e-9)
        blockers.push(s.id);
    if (blockers.length)
      unmet.push(`the footprint is not clear: ${blockers.join(', ')}`);
  } else if (!v7Inside(w, p, 0)) unmet.push('the point is outside the world');
  return {
    x: p.x,
    y: p.y,
    angle: p.angle,
    distance,
    reach,
    ground: points.map((q) => openConditions(w, q).ground),
    firm: firm(w, p, length),
    blockers,
    unmet,
  };
}
/** The paid inspection report: observable unit and site facts, unknowns and unmet needs. */
function findings(
  w: V7World,
  a: V7Actor,
  s: V7Stack,
  p: Transform | null,
): V7Data {
  const shape = shapeOf(w, s);
  const handling = handlingProblem(a, s, shape);
  const site = p ? siteOf(w, a, p, shape.length, shape.diameter) : null;
  const unmet = [...(handling ? [handling] : []), ...(site?.unmet ?? [])];
  return {
    item: {
      id: s.id,
      material: s.resource,
      quantity: s.quantity,
      selected: 1,
      origin: s.origin,
      harvestedAt: s.harvestedAt ?? null,
      decay: s.decay ?? null,
      carried: s.owner === a.id,
      carriedLoad: round(v7Load(w, a)),
    },
    shape,
    handling:
      handling ??
      (shape.known
        ? 'you carry it and the rod fits a two-handed grip'
        : 'unknown until a shape is represented'),
    site,
    unknown: shape.missing,
    unmet,
    placeable: p ? !shape.missing.length && !unmet.length : null,
  };
}

/** Loose-material view metadata from the work record; provisional until the unit is placed. */
function view(w: V7World, j: Work): V7Data {
  const item = record(j.findings.item);
  const material = item?.material;
  return {
    component: COMPONENT,
    status: j.status,
    provisional: j.status !== 'completed',
    material: typeof material === 'string' ? material : null,
    color: colorOf(w, typeof material === 'string' ? material : ''),
    x: j.x,
    y: j.y,
    angle: j.angle,
    length: j.length,
    diameter: j.diameter,
    condition: typeof item?.decay === 'number' ? { decay: item.decay } : null,
    reason: j.reason,
  };
}
function summary(w: V7World, j: Work, extra: V7Data = {}): V7Data {
  return {
    operation: ID,
    work: j.id,
    by: j.actor,
    mode: j.mode,
    status: j.status,
    stage: j.stage,
    item: j.item,
    unit: j.unit,
    output: j.output,
    object: j.object,
    destination: j.x === null || j.y === null ? null : { x: j.x, y: j.y },
    angle: j.angle,
    paidEnergy: j.paidEnergy,
    paidRounds: j.paidRounds,
    reason: j.reason,
    view: view(w, j),
    ...extra,
  };
}
function file(a: V7Actor, j: Work) {
  a.extensionState[RECORDS] = [...records(a), j].slice(-KEEP);
}
function close(w: V7World, a: V7Actor, j: Work, status: string, why: string) {
  j.status = status;
  j.reason = why;
  j.endedAt = w.tick;
  if (openWork(a)?.id === j.id)
    delete a.extensionState['position-loose-material:work:open'];
  file(a, j);
}
/** Releases the unit reserved for the work, once; it stays carried. */
function release(w: V7World, j: Work): boolean {
  const unit = w.stacks.find((s) => s.id === j.unit && s.reservedFor === j.id);
  if (!unit) return false;
  delete unit.reservedFor;
  return true;
}
function pause(w: V7World, j: Work, reasons: string[], say: Say) {
  j.status = 'paused';
  j.reason = reasons.join('; ');
  say(
    EVENTS.paused,
    `Placement paused before moving ${j.unit ?? j.item}: ${j.reason}. It stays carried and reserved; nothing was charged for the move. resume rechecks and continues; cancel ends it.`,
    summary(w, j),
  );
}
function infeasible(w: V7World, a: V7Actor, j: Work, why: string, say: Say) {
  const released = release(w, j);
  close(w, a, j, 'infeasible', why);
  say(
    EVENTS.infeasible,
    `Placement cannot continue: ${why}. ${released ? `${j.unit ?? j.item} stays carried and is free again; place it again for a new paid inspection` : 'No reservation was left to release'}. Nothing is refunded.`,
    summary(w, j, { released }),
  );
}

/** A changed unit, shape or ground needs a new paid inspection; null if none changed. */
function materialChange(w: V7World, a: V7Actor, j: Work): string | null {
  const unit = w.stacks.find((s) => s.id === j.unit);
  if (!unit || unit.owner !== a.id || unit.reservedFor !== j.id)
    return 'the reserved unit is no longer carried and reserved for this work';
  if (v7Signature(unitFacts(unit)) !== v7Signature(j.unitFacts))
    return 'the unit changed since the paid inspection';
  const shape = shapeOf(w, unit);
  if (shape.length !== j.length || shape.diameter !== j.diameter)
    return 'the represented shape of the unit changed';
  if (
    j.x === null ||
    j.y === null ||
    j.angle === null ||
    !firm(w, { x: j.x, y: j.y, angle: j.angle }, j.length)
  )
    return 'the ground under the footprint is no longer firm';
  return null;
}
/** Live conditions rechecked before the move: reach, sight, clearance and energy. */
function liveProblems(w: V7World, a: V7Actor, j: Work): string[] {
  if (j.x === null || j.y === null || j.angle === null)
    return ['no destination is recorded'];
  const out = siteOf(
    w,
    a,
    { x: j.x, y: j.y, angle: j.angle },
    j.length,
    j.diameter,
  ).unmet;
  if (a.vitals.energy < COST.move - 1e-9)
    out.push(
      `not enough energy: ${shown(a.vitals.energy)} of the ${String(COST.move)} the move needs`,
    );
  return out;
}

/** The named carried item and the one unit asked for; unsupported quantities are refused. */
function ownedItem(c: V7ActionContext): V7Stack {
  const target =
    typeof c.action.args.target === 'string' ? c.action.args.target : '';
  if (!target) throw nothing('Name one of your carried items as target.');
  const s = c.world.stacks.find((x) => x.id === target);
  if (!s || s.owner !== c.actor.id)
    throw nothing(`${target} is not an item you carry.`);
  if (s.reservedFor) throw nothing(`${s.id} is reserved for unfinished work.`);
  const q = c.action.args.quantity === undefined ? 1 : c.action.args.quantity;
  if (typeof q !== 'number' || !Number.isSafeInteger(q) || q < 1)
    throw nothing('quantity must be a whole number of units.');
  if (q !== 1)
    throw nothing(
      `One independently placed unit at a time is supported; ${String(q)} units were not used.`,
    );
  return s;
}
function transformOf(c: V7ActionContext, required: boolean): Transform | null {
  const { x, y, angle } = c.action.args;
  if (x === undefined && y === undefined && angle === undefined && !required)
    return null;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof angle !== 'number'
  )
    throw nothing('Give x, y and angle (radians) together.');
  return { x, y, angle };
}
function work(
  w: V7World,
  a: V7Actor,
  mode: string,
  s: V7Stack,
  p: Transform | null,
  f: V7Data,
): Work {
  const shape = record(f.shape);
  return {
    id: v7Id(w, 'placement'),
    actor: a.id,
    mode,
    status: 'inspected',
    stage: 'inspection',
    item: s.id,
    unit: null,
    output: null,
    object: null,
    quantity: 1,
    x: p?.x ?? null,
    y: p?.y ?? null,
    angle: p?.angle ?? null,
    length: typeof shape?.length === 'number' ? shape.length : null,
    diameter: typeof shape?.diameter === 'number' ? shape.diameter : null,
    findings: f,
    unitFacts: {},
    paidEnergy: COST.inspect,
    paidRounds: 1,
    stages: [{ stage: 'inspection', tick: w.tick, energy: COST.inspect }],
    reason: null,
    startedAt: w.tick,
    lastWorked: w.tick,
    endedAt: null,
  };
}
/** The exact unit for the work: the item itself when it is one unit, else one whole unit split
 * exactly from it with every other field kept (as collective-work reserves), mapped one to one. */
function reserve(w: V7World, s: V7Stack, id: string): V7Stack {
  if (foodTenths(s.quantity) === 10) {
    s.reservedFor = id;
    return s;
  }
  const unit: V7Stack = {
    ...materialPortion(s, 10),
    id: v7Id(w, 'item'),
    quantity: 1,
    quantityTenths: 10,
    reservedFor: id,
  };
  foodSetQuantity(s, foodTenths(s.quantity) - 10);
  w.stacks.push(unit);
  geometryTransfer(w, s, unit);
  return unit;
}

function inspect(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c;
  const s = ownedItem(c);
  const p = transformOf(c, false);
  if (a.vitals.energy < COST.inspect - 1e-9)
    throw nothing(
      `Not enough energy: inspecting needs ${String(COST.inspect)}, you have ${shown(a.vitals.energy)}.`,
    );
  v7Spend(a, COST.inspect);
  const f = findings(w, a, s, p);
  const j = work(w, a, 'inspect', s, p, f);
  const unknown = (f.unknown as string[]).length,
    unmet = (f.unmet as string[]).length;
  const status = unknown || unmet ? 'infeasible' : 'inspected';
  j.stages = [
    {
      stage: 'inspection',
      tick: w.tick,
      energy: COST.inspect,
      outcome: status,
    },
  ];
  close(
    w,
    a,
    j,
    status,
    status === 'inspected'
      ? p
        ? 'The unit and the site meet every placement requirement now.'
        : 'Unit inspected; no site was given.'
      : [...(f.unknown as string[]), ...(f.unmet as string[])].join('; '),
  );
  c.emit(
    EVENTS.inspected,
    `Inspected ${s.id} (${s.resource})${p ? ` for placement at (${shown(p.x)}, ${shown(p.y)}), angle ${shown(p.angle)} rad` : ''} for ${String(COST.inspect)} energy: ${status === 'inspected' ? (p ? 'it can be placed there now' : 'its shape is represented') : `not placeable: ${String(j.reason)}`}.`,
    summary(w, j, { findings: f }),
    s.id,
  );
  return { complete: true, remaining: 0, writes: [j.id] };
}

function place(c: V7ActionContext, open: Work | null): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (open) {
    const args = c.action.args;
    if (
      open.status === 'ready' &&
      open.lastWorked === w.tick - 1 &&
      c.operation?.first === false &&
      args.target === open.item &&
      args.x === open.x &&
      args.y === open.y &&
      args.angle === open.angle
    )
      return move(c, open, false);
    throw nothing(
      `Your placement work ${open.id} is ${open.status} after its paid inspection; give resume to move the unit, inspect-progress to check it, or cancel to end it.`,
    );
  }
  const s = ownedItem(c);
  const p = transformOf(c, true);
  if (!p) throw nothing('Give x, y and angle (radians) together.');
  const shape = shapeOf(w, s);
  if (!shape.known)
    throw nothing(
      `Placement is unavailable for ${s.id}: ${shape.missing.join('; ')}. inspect reports these facts.`,
    );
  const handling = handlingProblem(a, s, shape);
  if (handling) throw nothing(`You cannot place ${s.id}: ${handling}.`);
  const site = siteOf(w, a, p, shape.length, shape.diameter);
  if (site.unmet.length)
    throw nothing(`You cannot place ${s.id} there: ${site.unmet.join('; ')}.`);
  if (a.vitals.energy < COST.inspect - 1e-9)
    throw nothing(
      `Not enough energy: the inspection needs ${String(COST.inspect)}, you have ${shown(a.vitals.energy)}.`,
    );
  v7Spend(a, COST.inspect);
  const f = findings(w, a, s, p);
  const j = work(w, a, 'place', s, p, f);
  const unit = reserve(w, s, j.id);
  j.unit = unit.id;
  j.unitFacts = unitFacts(unit);
  j.status = 'ready';
  j.stage = 'move-and-orient';
  j.stages = [
    {
      stage: 'inspection',
      tick: w.tick,
      energy: COST.inspect,
      outcome: 'ready',
    },
  ];
  a.extensionState[OPEN] = j;
  c.emit(
    EVENTS.inspected,
    `Stage 1 of 2: inspected ${s.id} (${s.resource}, a ${shown(shape.length ?? 0)} x ${shown(shape.diameter ?? 0)} m rod) and the site at (${shown(p.x)}, ${shown(p.y)}), angle ${shown(p.angle)} rad, for ${String(COST.inspect)} energy. ${unit.id === s.id ? 'It stays carried' : `One unit, ${unit.id}, was set apart from it and stays carried`}, reserved for this work; the next round moves and orients it for ${String(COST.move)} energy.`,
    summary(w, j, { findings: f }),
    s.id,
  );
  return { complete: false, remaining: 1, writes: [j.id, unit.id, s.id] };
}

/** Stage 2: fresh checks, then the ordinary drop and the chosen transform, or a free pause. */
function move(c: V7ActionContext, j: Work, resumed: boolean): V7HandlerResult {
  const { world: w, actor: a } = c;
  const say: Say = (type, description, data) => {
    c.emit(type, description, data, j.id);
  };
  const change = materialChange(w, a, j);
  if (change) {
    infeasible(w, a, j, change, say);
    return { complete: true, remaining: 0, writes: [j.id] };
  }
  const unmet = liveProblems(w, a, j);
  if (unmet.length) {
    if (resumed)
      throw nothing(
        `You cannot resume the placement now: ${unmet.join('; ')}.`,
      );
    pause(w, j, unmet, say);
    return { complete: true, remaining: 0, writes: [j.id] };
  }
  const unit = w.stacks.find((s) => s.id === j.unit);
  const drop = FOREST_BASE.handlers[DROP.handler];
  if (!unit || !drop || j.x === null || j.y === null || j.angle === null)
    throw nothing('The reserved unit or ordinary drop is unavailable.');
  delete unit.reservedFor;
  const before = a.vitals.energy;
  try {
    drop({
      ...c,
      action: {
        interface: DROP.ability,
        args: { target: unit.id, quantity: 1 },
      },
    });
  } catch (error) {
    throw nothing(
      `Ordinary drop refused ${unit.id}: ${error instanceof Error ? error.message : 'unknown failure.'}`,
    );
  }
  const dropped = w.events
    .filter((e) => e.type === 'dropped' && e.target === unit.id)
    .at(-1);
  const ground = w.stacks.find(
    (s) => s.id === dropped?.data.item && s.owner === null,
  );
  if (!dropped || !ground)
    throw nothing('Ordinary drop reported no ground item.');
  const spent = round(before - a.vitals.energy);
  const length = j.length ?? 0,
    diameter = j.diameter ?? 0;
  const objectId = v7Id(w, 'placed');
  ground.position = { x: j.x, y: j.y };
  ground.processing = {
    ...(ground.processing ?? {}),
    [MARK]: {
      x: j.x,
      y: j.y,
      angle: j.angle,
      length,
      diameter,
      object: objectId,
      by: a.id,
      at: w.tick,
      from: unit.id,
    },
  };
  const color = colorOf(w, ground.resource);
  const object: V7Object = {
    id: objectId,
    kind: KIND,
    name: `Placed ${ground.resource}`,
    spatial: {
      x: j.x,
      y: j.y,
      angle: j.angle,
      shape: { kind: 'rectangle', width: length, height: diameter },
      solid: false,
      reserved: true,
      // Reaching the footprint keeps its item within pickup reach (interaction range less the
      // rod's half diagonal).
      interaction: round(
        Math.max(
          0,
          w.config.interaction - Math.hypot(length / 2, diameter / 2),
        ),
      ),
      entrances: [],
    },
    visual: {
      component: COMPONENT,
      color,
      accent: '#4f3d2a',
      label: `Placed ${ground.resource}`,
      state: 'placed',
    },
    data: {
      item: ground.id,
      from: unit.id,
      material: ground.resource,
      quantity: 1,
      length,
      diameter,
      mass: smallFireComposition(w, ground).unitMass,
      origin: ground.origin,
      harvestedAt: ground.harvestedAt ?? null,
      decay: ground.decay ?? null,
      placedBy: a.id,
      placedAt: w.tick,
      work: j.id,
      shape: 'declared straight rod; curvature and surface are not represented',
      view: {
        component: COMPONENT,
        status: 'placed',
        provisional: false,
        color,
        angle: j.angle,
        length,
        diameter,
        condition: ground.decay === undefined ? null : { decay: ground.decay },
      },
    },
    createdBy: a.id,
    createdAt: w.tick,
    revision: REVISION,
  };
  w.objects.push(object);
  j.output = ground.id;
  j.object = objectId;
  j.stage = 'done';
  j.paidEnergy = round(j.paidEnergy + spent);
  j.paidRounds += 1;
  j.lastWorked = w.tick;
  j.stages = [
    ...j.stages,
    {
      stage: 'move-and-orient',
      tick: w.tick,
      energy: spent,
      outcome: 'completed',
      drop: dropped.id,
    },
  ];
  close(w, a, j, 'completed', 'The unit lies at the chosen point and angle.');
  c.emit(
    EVENTS.completed,
    `Stage 2 of 2: moved ${unit.id} out of your inventory through ordinary drop (${shown(spent)} energy) and laid it at (${shown(j.x)}, ${shown(j.y)}), angle ${shown(j.angle)} rad, as ground item ${ground.id}: one ${ground.resource} unit, a ${shown(length)} x ${shown(diameter)} m rod, origin ${ground.origin}. Anyone may pick it up.`,
    summary(w, j, {
      material: ground.resource,
      quantity: 1,
      transform: { x: j.x, y: j.y, angle: j.angle },
      footprint: { length, diameter },
      provenance: {
        origin: ground.origin,
        harvestedAt: ground.harvestedAt ?? null,
      },
      mapping: { carried: unit.id, ground: ground.id },
      stageEnergy: spent,
      drop: dropped.id,
      resumed,
    }),
    objectId,
  );
  const done = w.events.at(-1);
  if (done) done.position = { x: j.x, y: j.y };
  return {
    complete: true,
    remaining: 0,
    writes: [j.id, ground.id, objectId],
  };
}

function resume(c: V7ActionContext, open: Work | null): V7HandlerResult {
  if (!open)
    throw nothing('There is no open placement work to resume; give place.');
  return move(c, open, true);
}
function cancel(c: V7ActionContext, open: Work | null): V7HandlerResult {
  const { world: w, actor: a } = c;
  if (!open)
    throw nothing(
      'There is no open placement work to cancel; placed items stay where they lie (recover them with pickup).',
    );
  const released = release(w, open);
  close(w, a, open, 'cancelled', 'Cancelled on request.');
  c.emit(
    EVENTS.cancelled,
    `Cancelled placement work ${open.id}: ${open.unit ?? open.item} stays in your inventory${released ? ' and is free again' : ''}; the ${String(open.paidEnergy)} energy already paid is not refunded.`,
    summary(w, open, { released }),
    open.id,
  );
  return { complete: true, remaining: 0, writes: [open.id] };
}
/** Existing work facts and, for open work, the live checks; a placed unit only when in view. */
function current(w: V7World, a: V7Actor, j: Work): V7Data {
  if (j.status === 'ready' || j.status === 'paused') {
    const unit = w.stacks.find((s) => s.id === j.unit);
    const change = materialChange(w, a, j);
    return {
      unitCarried: !!unit && unit.owner === a.id,
      unitReserved: unit?.reservedFor === j.id,
      materialChange: change,
      liveProblems: change ? [] : liveProblems(w, a, j),
      moveEnergy: COST.move,
    };
  }
  if (j.status === 'completed' && j.x !== null && j.y !== null) {
    const at = { x: j.x, y: j.y };
    if (
      v7Distance(a.position, at) > w.config.vision ||
      !v7Visible(w, a.position, at)
    )
      return { inView: false };
    const o = w.objects.find((x) => x.id === j.object);
    const s = w.stacks.find((x) => x.id === j.output);
    return {
      inView: true,
      footprintPresent: !!o,
      itemOnGround: !!s && s.owner === null,
      transform: o
        ? { x: o.spatial.x, y: o.spatial.y, angle: o.spatial.angle }
        : null,
    };
  }
  return {};
}
function check(c: V7ActionContext, open: Work | null): V7HandlerResult {
  const { world: w, actor: a } = c;
  const j = open ?? records(a).at(-1) ?? null;
  if (!j) throw nothing('There is no placement work or inspection to report.');
  if (a.vitals.energy < COST.check - 1e-9)
    throw nothing(
      `Not enough energy: checking needs ${String(COST.check)}, you have ${shown(a.vitals.energy)}.`,
    );
  v7Spend(a, COST.check);
  const facts = current(w, a, j);
  c.emit(
    EVENTS.checked,
    `Checked placement work ${j.id} for ${String(COST.check)} energy: ${j.status}${j.reason ? ` (${j.reason})` : ''}; ${String(j.paidEnergy)} energy paid over ${String(j.paidRounds)} round(s).`,
    summary(w, j, { current: facts, checkEnergy: COST.check }),
    j.id,
  );
  return { complete: true, remaining: 0, writes: [j.id] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  const mode = typeof c.action.args.mode === 'string' ? c.action.args.mode : '';
  const open = openWork(c.actor);
  if (mode === 'inspect') return inspect(c);
  if (mode === 'place') return place(c, open);
  if (mode === 'inspect-progress') return check(c, open);
  if (mode === 'resume') return resume(c, open);
  if (mode === 'cancel') return cancel(c, open);
  throw nothing(`Give mode ${MODES.join(', ')}.`);
}

/** After the round: pause ready work whose round went to something else, end the footprint
 * record of any placed unit that was taken, divided or moved, and clear stale ground records. */
function environment(w: V7World) {
  for (const a of w.actors) {
    if (a.vitals.health <= 0) continue;
    const j = openWork(a);
    if (j?.status !== 'ready' || j.lastWorked >= w.tick) continue;
    pause(
      w,
      j,
      [
        'this round did not move and orient the unit: another action, a refused action or no action took it',
      ],
      (type, description, data) => {
        forestEvent(w, type, description, a.position, a.id, data, j.id);
      },
    );
  }
  for (const o of placed(w)) {
    const s = w.stacks.find((x) => x.id === o.data.item);
    const taker = w.events.find(
      (e) => e.type === 'picked-up' && e.success && e.target === o.data.item,
    );
    const why =
      s && s.owner === null && foodTenths(s.quantity) !== 10
        ? 'part of the unit was taken'
        : taker || (s && s.owner !== null)
          ? 'it was picked up'
          : !s
            ? 'the ground item is gone'
            : v7Distance(s.position, o.spatial) > 1e-9
              ? 'the item is no longer where it was placed'
              : null;
    if (!why) continue;
    w.objects = w.objects.filter((x) => x.id !== o.id);
    forestEvent(
      w,
      EVENTS.removed,
      `The placed ${typeof o.data.material === 'string' ? o.data.material : 'loose'} unit at (${shown(o.spatial.x)}, ${shown(o.spatial.y)}) no longer lies as placed: ${why}. Its footprint record ended.`,
      { x: o.spatial.x, y: o.spatial.y },
      taker?.actor ?? null,
      {
        operation: ID,
        object: o.id,
        item: o.data.item ?? null,
        reason: why,
        by: taker?.actor ?? null,
        pickup: taker?.id ?? null,
        view: {
          component: COMPONENT,
          status: 'removed',
          provisional: false,
        },
      },
      o.id,
    );
  }
  const live = placed(w);
  for (const s of w.stacks) {
    if (s.processing?.[MARK] === undefined) continue;
    if (
      s.owner === null &&
      live.some(
        (o) =>
          o.data.item === s.id && v7Distance(s.position, o.spatial) <= 1e-9,
      )
    )
      continue;
    const rest = Object.fromEntries(
      Object.entries(s.processing ?? {}).filter(([k]) => k !== MARK),
    );
    if (Object.keys(rest).length) s.processing = rest;
    else delete s.processing;
  }
}
/** Death ends unfinished work and releases the unit once; death rules then handle it with the
 * rest of what the person carried. Placed units stay where they lie. */
function onDeath(w: V7World, a: V7Actor) {
  const j = openWork(a);
  if (!j) return;
  const released = release(w, j);
  close(
    w,
    a,
    j,
    'ended',
    'Died before the move: the work ended and the unit is handled with the rest of what was carried.',
  );
  forestEvent(
    w,
    EVENTS.ended,
    `Placement work ${j.id} ended by death before the move; nothing is refunded.`,
    a.position,
    a.id,
    summary(w, j, { released }),
    j.id,
  );
}

const ABILITY: V7Ability = {
  id: ID,
  name: 'Position loose material',
  function:
    'Lay one carried loose unit on clear ground within reach at a chosen point and angle, as a ground item anyone can pick up; inspect the unit and site first.',
  equivalence: 'material:loose-unit:inspected-ground-placement:1',
  parameters: {
    ...v7ObjectSchema({
      mode: { type: 'string', enum: MODES },
      target: { type: 'string', maxLength: 1000 },
      quantity: { type: 'integer', minimum: 1 },
      x: { type: 'number' },
      y: { type: 'number' },
      angle: { type: 'number', minimum: -TURN, maximum: TURN },
    }),
    required: ['mode'],
  },
  references: { target: 'optional-owned' },
  prerequisites: [],
  learning: 1,
  learningEnergy: COST.study,
  costs: `Study: 1 round, ${String(COST.study)} energy. inspect: target (your carried item), optional x, y and angle (radians); 1 round, ${String(COST.inspect)} energy; reports the unit and site facts. place: target, x, y, angle, quantity 1 (one unit at a time). Round 1 is the same paid inspection (${String(COST.inspect)}) and reserves the unit, still carried; round 2 moves and orients it through ordinary drop (${String(COST.move)}): 2 rounds, 0.7 energy in all. inspect-progress: 1 round, ${String(COST.check)}. resume continues the unpaid round 2 after fresh checks; cancel: 1 round, no energy; both use only mode. Refusals come before any cost; travel and pickup cost separately.`,
  effects:
    'Needs a represented shape: branch, birch and oak units are the declared rod of small-combustion-source@1 (900 kg/m3, length 25 diameters; a branch is about 0.04 x 0.99 m), straight and rigid. Other materials, bending willow, worked, combined or partial units are reported as unknown shape and cannot be placed. Handling: a unit you carry whose rod fits a two-handed grip (1.5-5 cm thick). Site: the centre within your reach (body radius + 0.65), the whole footprint inside the world, on firm visible ground (not water, a wet bank or waterlogged), clear of people (you included), objects, placed units and loose ground items. Placing debits exactly that unit and lays it, with its material, origin and age, as one ground item (the new id that drop gives, mapped) at x, y and the angle, plus a footprint record others see; nothing is copied, merged, shaped, joined or fastened. Another action, an obstruction, lost reach or low energy pauses before round 2 without charge; a changed unit or ground ends the work (place again). Cancel or death releases the unit once; nothing is refunded. Recover it with pickup; the footprint record ends when the item is taken or moved. No reward, comfort or skill gain.',
  handler: HANDLER,
  revision: REVISION,
  authored: false,
  // The completion event never carries a qualified flag: placing earns no practice milestone.
  practiceEvidence: EVENTS.completed,
  dependencies: { abilities: [DROP.ability], resources: [], knowledge: [] },
  execution: {
    duration: null,
    interruption: 'cancel',
    progress:
      'place inspects in its first round and moves the unit in the next round of the same action; resume continues a paused placement; inspect, inspect-progress and cancel take one round.',
  },
};

/** ex25: Sol's request to position an owned fallen branch on clear ground. */
export const LONG_EX25_LOOSE_PLACEMENT: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex25',
  dependencies: ['foundation-forest@1'],
  description:
    'Lay one carried loose unit with a represented rod shape on clear, firm ground within reach at a chosen point and angle: a paid inspection, a reserved unit, then ordinary drop and the chosen transform, with pause, resume, cancel and death handling, a footprint record others see, and recovery by ordinary pickup. No shaping, joining, fastening or reward.',
  reuse: {
    experiment:
      'foundation-forest@1 drop (handler forest.drop) moves the unit from carried inventory to the ground with its own ownership, quantity and transfer checks, 0.5 energy and the item mapping of its dropped event; base pickup recovers the ground item',
    source:
      'forest-foundation.ts (FOREST_BASE.handlers forest.drop); long-ex21-small-combustion-physics.ts (smallFireRod, smallFireComposition, SMALL_FIRE rigid and grip limits); long-ex19-material-contact.ts (ex19MaterialGround); continuous-geometry.ts (v7ShapesOverlap, v7ShapeDistance, v7Inside, v7Visible); material-lots.ts, forest-food-accounting.ts and open-material-geometry.ts (one-unit split as collective-work.ts reserves); forest-climate.ts (forestEvent)',
    description:
      'A code dependency, not a copy: drop does the transfer and its contract is unchanged; this operation checks first, reserves the exact unit, then sets the dropped item at the chosen point and records its angle and footprint. New: the inspection, the placement work lifecycle and the footprint record and its drawing.',
  },
  abilities: [ABILITY],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [COMPONENT],
  events: Object.values(EVENTS),
  resources: [],
  satisfaction: [],
  afterEnvironment: environment,
  onDeath,
};
