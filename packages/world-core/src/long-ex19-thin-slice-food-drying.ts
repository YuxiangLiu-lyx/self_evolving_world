import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Point,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Clone, v7Json, v7Number, v7RoundNumber } from './continuous-data.js';
import { v7Distance, v7Reach } from './continuous-geometry.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import { foodTenths, foodUnitMass } from './forest-food-accounting.js';
import { forestEvent } from './forest-climate.js';
import {
  foodWaterExpose,
  foodWaterRead,
  foodWaterSurfaceArea,
} from './food-water.js';
import type { FoodWaterSurface } from './food-water.js';
import { preservationPhysics } from './open-preservation-physics.js';
import { scratchPhysical, scratchVisible } from './open-hardness-physics.js';
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

/** One cut-and-lay round of one whole unit (World Agent specification: 1.5 energy). */
const CUT = 1.5;
/** Inspection and resume: one round and the probe observation cost of 0.2. */
const LOOK = 0.2;
/** Study: 0.5 energy in each of the four rounds (World Agent specification). */
const STUDY = 0.5;
/** The food water representation exchanges water only in a thin layer: at most 0.2 mass of
 * food per unit area of its surface (open-preservation-physics `spread`). */
const LOADING = 0.2;
/** The existing usable-edge predicate of stone-edge bark separation (collective-bark): stone
 * or flint, contact-resistance index at least 8, contact-model edge radius at most 0.0002,
 * controlled contact, neither fractured nor contaminated. */
const EDGE_MATERIALS = ['stone', 'flint'];
const EDGE_HARDNESS = 8;
const EDGE_RADIUS = 0.0002;
/** Equipment and combined lots are never used as implements (as in mechanical food handling). */
const EQUIPMENT = [
  'mantle',
  'frictionKit',
  'waterCup',
  'componentLots',
] as const;
/** Readings kept in the trial record; older inspections stay in the personal record only. */
const OBSERVATIONS = 12;
const NO_INSTRUMENT =
  'No calibrated weighing instrument with represented resolution exists in this world, so mass and water readings are unavailable. Nothing was spent.';
const ONE_UNIT =
  'This version cuts exactly one whole unit per trial: units cut in different rounds age differently, and the food water representation keeps one water and decay record per stack and one sample per surface. Nothing was spent.';

/** The persistent trial record: one paid cutting round, then unattended exposure. */
interface Trial extends CollectiveWork {
  stage: string;
  input: string;
  resource: string;
  /** The cut unit's identity at cutting; `slices` follows it through a pickup by the owner. */
  unit: string;
  slices: string;
  control: string | null;
  tool: V7Data;
  placement: V7Data;
  cutAt: number;
  placedAt: number;
  relaid: number;
  quantity: number;
  slicesDecay0: number;
  slicesDecay: number;
  controlDecay0: number | null;
  controlDecay: number | null;
  controlSpoiledAt: number | null;
  rainRounds: number;
  wet: boolean;
  observations: V7Data[];
  lastUpdate: number;
  endedAt: number | null;
  takenBy: string | null;
}

const open = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const round = (x: number) => v7RoundNumber(x);
const wholeUnits = (s: V7Stack) => Math.floor(foodTenths(s.quantity) / 10);
const spoiledNow = (w: V7World, id: string) =>
  w.events.some((e) => e.type === 'spoiled' && e.target === id);
const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** Area one thin layer of this food needs: the representation's loading of 0.2 mass per area,
 * on its initial unit mass, which is what the exchange compares. */
function layerArea(w: V7World, s: V7Stack, quantity: number): number {
  const mass = preservationPhysics(s)?.initialUnitMass ?? foodUnitMass(w, s);
  return round((mass * quantity) / LOADING);
}

/** Visible shrinkage of the slices, classed from their actual current over initial mass. It is a
 * look, not a measurement: it never establishes how much water left. */
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

/** The tool's contact state under the world contact model (open-hardness-physics), read on a
 * copy of its record so that a refused attempt stores nothing. */
function contactOf(w: V7World, s: V7Stack) {
  const key = `hardness:intrinsic:${s.id}`,
    old = w.state[key],
    state: V7Data = { ...w.state };
  if (old !== undefined) state[key] = v7Clone(old);
  const copy: V7World = { ...w, state };
  return {
    resistance: Number(scratchPhysical(copy, s).resistance),
    ...scratchVisible(copy, s),
  };
}

/** Why this item cannot cut the food, or null when its represented edge qualifies. */
function edgeProblem(
  w: V7World,
  a: V7Actor,
  tool: V7Stack | undefined,
  food: V7Stack,
): string | null {
  if (!tool || tool.owner !== a.id)
    return 'Name your own carried cutting tool by its exact item id in toolId.';
  if (tool.reservedFor) return 'The tool is reserved for unfinished work.';
  if (tool.id === food.id) return 'Food cannot cut itself.';
  const m = collectiveFoodProfile(w, tool);
  if (!m || m.nutrition > 0) return 'Food is not a cutting tool.';
  if (EQUIPMENT.some((k) => tool[k] !== undefined))
    return 'Equipment and combined lots are not cutting tools.';
  if (!EDGE_MATERIALS.includes(tool.resource))
    return 'Only stone or flint carries a represented cutting edge in this world.';
  if (wholeUnits(tool) < 1)
    return 'A cutting tool must be at least one whole unit.';
  const c = contactOf(w, tool),
    softer = collectiveFoodProfile(w, food)?.properties?.hardness ?? 0;
  if (c.resistance < Math.max(EDGE_HARDNESS, softer))
    return `${tool.id} has contact-resistance index ${String(c.resistance)}, below the required ${String(Math.max(EDGE_HARDNESS, softer))}.`;
  if (!c.controlledContact || c.fractured || c.contaminated)
    return `The edge of ${tool.id} is fractured, contaminated or too small for controlled contact.`;
  if (c.edgeRadius > EDGE_RADIUS + 1e-12)
    return `The edge of ${tool.id} is too blunt: radius ${String(round(c.edgeRadius))}, above 0.0002.`;
  return null;
}

/** The slices while they lie, unowned, on their surface. */
function lying(w: V7World, j: Trial): V7Stack | undefined {
  const s = w.stacks.find((s) => s.id === j.slices);
  return s && s.owner === null && s.quantity > 0 && foodWaterRead(s)?.surface
    ? s
    : undefined;
}
/** The slices while their owner carries them after picking them up. */
function carried(w: V7World, j: Trial): V7Stack | undefined {
  return w.stacks.find(
    (s) => s.id === j.slices && s.owner === j.owner && s.quantity > 0,
  );
}
/** The surface the slices were last laid on. */
function surfaceOf(j: Trial): FoodWaterSurface {
  const p = j.placement;
  return p.kind === 'object'
    ? { kind: 'object', id: text(p.id) }
    : { kind: 'ground', x: Number(p.x), y: Number(p.y), area: Number(p.area) };
}
/** Where the slices are: the footprint centre, the support, or with their carrier. */
function where(w: V7World, j: Trial, a: V7Actor): V7Point {
  if (j.stage === 'carried') return { ...a.position };
  const p = j.placement,
    o = w.objects.find((o) => o.id === p.id);
  if (p.kind === 'ground') return { x: Number(p.x), y: Number(p.y) };
  return o ? { x: o.spatial.x, y: o.spatial.y } : { ...a.position };
}

/** Reusable drawing metadata; it never shows dryness, preservation or success. */
function view(w: V7World, j: Trial, a: V7Actor): V7Data {
  const s = w.stacks.find((s) => s.id === j.slices),
    p = j.placement,
    at = s?.position ?? where(w, j, a);
  return {
    component: 'ground-stack',
    operation: j.ability,
    trial: j.id,
    actor: j.owner,
    item: j.slices,
    resource: j.resource,
    color: w.resources.find((r) => r.id === j.resource)?.color ?? '#cfaf79',
    quantity: s?.quantity ?? 0,
    placement:
      j.stage === 'carried'
        ? 'carried'
        : p.kind === 'object'
          ? 'support'
          : 'ground',
    support: p.kind === 'object' ? (p.id ?? null) : null,
    tool: j.tool.id ?? null,
    x: at.x,
    y: at.y,
    form: 'thin slices',
    layerArea: p.area ?? null,
    state: j.stage,
    surface: j.wet ? 'wet from rain' : shrinkage(s),
    preservation: 'unverified',
  };
}

/** Everything inspection can record: quantities, model decay, visible changes and rain. */
function report(w: V7World, j: Trial): V7Data {
  const elapsed = w.tick - j.cutAt,
    s = w.stacks.find((s) => s.id === j.slices),
    slices = airExposureTrack(
      w,
      j.slices,
      j.slicesDecay0,
      j.slicesDecay,
      elapsed,
      j.resource,
    ),
    control =
      j.control && j.controlDecay0 !== null
        ? airExposureTrack(
            w,
            j.control,
            j.controlDecay0,
            j.controlDecay ?? j.controlDecay0,
            elapsed,
            j.resource,
          )
        : null;
  const ground = j.placement.kind === 'ground';
  let exposure = j.stage === 'carried' ? 'carried; not exposed' : 'open';
  if (j.stage !== 'carried' && s && s.owner === null)
    try {
      foodWaterSurfaceArea(w, surfaceOf(j), s.id);
    } catch (error) {
      exposure = `blocked: ${error instanceof Error ? error.message : 'unusable surface'}`;
    }
  return {
    trial: j.id,
    stage: j.stage,
    method: 'thin slices cut with a stone or flint edge, one thin layer',
    resource: j.resource,
    input: j.input,
    unit: j.unit,
    tool: j.tool,
    placement: j.placement,
    cutAt: j.cutAt,
    placedAt: j.placedAt,
    relaid: j.relaid,
    tick: w.tick,
    elapsedRounds: elapsed,
    slices,
    control,
    controlSpoiledAt: j.controlSpoiledAt,
    decayDifference: control
      ? round(Number(slices.decayGained) - Number(control.decayGained))
      : null,
    decayReadings: 'model decay readings, not a microbial test',
    visible: {
      method: 'visual',
      shrinkage: shrinkage(s),
      wetness: j.wet ? 'wet from rain' : 'no visible wetness',
      spoilage: slices.visibleSpoilage ?? null,
    },
    exposure,
    handling: control
      ? `Slices ${j.stage === 'carried' ? 'carried by you' : `lying on ${ground ? 'open ground' : 'the support'}`}; whole control carried by you. Form, location and handling differ.`
      : 'No control was kept.',
    rainRounds: j.rainRounds,
    wetNow: j.wet,
    takenBy: j.takenBy,
    water:
      'not measured; visible shrinkage does not establish how much water left',
    mass: 'not weighed; no calibrated weighing instrument exists',
    offcuts: 0,
    contamination: `${ground ? 'ground' : 'support'} contact; not assessed`,
    safety: 'unverified',
    preservation: 'unverified',
    paidEnergy: round(j.paidEnergy),
  };
}

function sync(a: V7Actor, j: Trial, key: string) {
  a.extensionState[key] = v7Json(j);
}

/** Ends a trial once: releases the carried control and keeps the final report. */
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
  j.x = a.position.x;
  j.y = a.position.y;
  workStop(w, a, j, reason, ground);
  j.stage = stage;
  j.endedAt = w.tick;
  j.outcome = v7Json(report(w, j));
  return released;
}

/** A general thin-slice air-drying trial over the installed food water representation, reusing
 * the whole-food air-exposure trial's input check, control and decay readings. */
export function thinSliceFoodDryingPackage(
  id: string,
  scope: string,
  dependencies: string[],
): V7Package {
  const revision = `${id}@1`;
  const handler = `long.${id}`;
  const stateKey = `long:work:${id}`;
  const trials = (w: V7World) => collectiveJobs(w, id).map((j) => j as Trial);
  const current = (w: V7World, a: V7Actor) =>
    trials(w).find((j) => j.owner === a.id && open(j));

  /** Checked placement of one thin layer of `need` area, before any charge. */
  function placement(
    c: V7ActionContext,
    need: number,
    sample: string,
  ): FoodWaterSurface {
    const { world: w, actor: a, action } = c;
    const support =
      typeof action.args.supportId === 'string' ? action.args.supportId : '';
    let surface: FoodWaterSurface;
    if (support) {
      if (action.args.x !== undefined || action.args.y !== undefined)
        throw new Error(
          'Give either x and y or supportId, not both. Nothing was spent.',
        );
      const o: V7Object | undefined = w.objects.find((o) => o.id === support);
      if (!o)
        throw new Error(`No actual object ${support}. Nothing was spent.`);
      if (!v7Reach(a, o.spatial))
        throw new Error(`${support} is out of reach. Nothing was spent.`);
      surface = { kind: 'object', id: support };
    } else {
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
      if (v7Distance(a.position, point) > a.radius + w.config.interaction)
        throw new Error(
          'The layer centre is beyond hand reach; walk there first. Nothing was spent.',
        );
      surface = { kind: 'ground', x: point.x, y: point.y, area: need };
    }
    let area: number;
    try {
      area = foodWaterSurfaceArea(w, surface, sample);
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : 'The placement is unusable.'} Nothing was spent.`,
        { cause: error },
      );
    }
    if (area + 1e-8 < need)
      throw new Error(
        `${support} offers ${String(round(area))} of surface; one thin layer of these slices needs ${String(need)}. Nothing was spent.`,
      );
    return surface;
  }

  function prepare(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const existing = current(w, a);
    if (existing)
      throw new Error(
        `Your drying trial ${existing.id} is still open; stop it first. Nothing was spent.`,
      );
    if (action.args.instrumentId !== undefined) throw new Error(NO_INSTRUMENT);
    const input = w.stacks.find((s) => s.id === action.args.inputStackId);
    if (!input || input.owner !== a.id)
      throw new Error(
        'Name one of your own food stacks by its exact item id in inputStackId. Nothing was spent.',
      );
    if (input.reservedFor)
      throw new Error(
        'That item is reserved for unfinished work. Nothing was spent.',
      );
    if (foodWaterRead(input)?.prepared)
      throw new Error(
        'This food is already cut or opened; it cannot be cut as a whole unit again. Nothing was spent.',
      );
    const problem = airExposureUnsupported(w, input);
    if (problem) throw new Error(`${problem} Nothing was spent.`);
    const quantity = action.args.quantity ?? 1,
      control = action.args.controlQuantity ?? 0;
    if (quantity !== 1) throw new Error(ONE_UNIT);
    if (typeof control !== 'number' || !Number.isSafeInteger(control))
      throw new Error(
        'controlQuantity must be a whole number of units. Nothing was spent.',
      );
    if (1 + control > wholeUnits(input))
      throw new Error(
        `${input.id} holds ${String(input.quantity)} units, fewer than ${String(1 + control)} whole units. Nothing was spent.`,
      );
    if (action.args.toolId === undefined)
      throw new Error(
        'Cutting needs toolId: your own carried stone or flint unit with a usable edge. Hands, food and plants do not cut. Nothing was spent.',
      );
    const tool = w.stacks.find((s) => s.id === action.args.toolId);
    const blunt = edgeProblem(w, a, tool, input);
    if (blunt || !tool) throw new Error(`${blunt ?? ''} Nothing was spent.`);
    const need = layerArea(w, input, 1);
    const surface = placement(c, need, '');
    if (a.vitals.energy + 1e-8 < CUT)
      throw new Error(
        'Cutting and laying one unit needs 1.5 energy. Nothing was spent.',
      );
    // All checks passed: one paid round commits the cut and the placement.
    const j = workCreate(c, 'thin-section', 1) as Trial;
    if (!workPay(c, j, CUT))
      throw new Error('Energy changed before the paid round.');
    a.vitals.energy = round(Math.max(0, a.vitals.energy));
    j.paidEnergy = round(j.paidEnergy);
    // The contact record is stored as used. Under the existing contact law (scratchStroke) a
    // harder body alters only the softer one, so cutting food adds no wear to the edge.
    const edge = scratchPhysical(w, tool);
    workReserve(
      c,
      j,
      workAllocations(c, [{ itemId: input.id, quantity: 1 }]),
      true,
    );
    const slices = w.stacks.find((s) => s.id === j.escrow.at(-1));
    if (!slices) throw new Error('The cut unit is missing.');
    // Food lying in the world is unowned and unreserved, like any dropped stack.
    delete slices.reservedFor;
    j.escrow = [];
    // `prepared` is the representation's irreversible opened-and-spread-thin state.
    const water = foodWaterExpose(w, slices, surface, true);
    if (control)
      workReserve(
        c,
        j,
        workAllocations(c, [{ itemId: input.id, quantity: control }]),
      );
    const kept = control
      ? w.stacks.find((s) => s.id === j.escrow.at(-1))
      : undefined;
    Object.assign(j, {
      stage: 'exposed',
      input: input.id,
      resource: input.resource,
      unit: slices.id,
      slices: slices.id,
      control: kept?.id ?? null,
      tool: {
        id: tool.id,
        resource: tool.resource,
        origin: tool.origin,
        resistance: Number(edge.resistance),
        edgeRadius: round(Number(edge.edgeRadius)),
        wear: round(Number(edge.wear)),
        fractured: edge.fractured === true,
        contaminated: edge.contaminated === true,
        wearAdded: 0,
      },
      placement: { ...surface, area: water.area },
      cutAt: w.tick,
      placedAt: w.tick,
      relaid: 0,
      quantity: slices.quantity,
      slicesDecay0: round(slices.decay ?? 0),
      slicesDecay: round(slices.decay ?? 0),
      controlDecay0: kept ? round(kept.decay ?? 0) : null,
      controlDecay: kept ? round(kept.decay ?? 0) : null,
      controlSpoiledAt: null,
      rainRounds: 0,
      wet: false,
      observations: [],
      lastUpdate: w.tick,
      endedAt: null,
      takenBy: null,
      target: slices.id,
      outputs: [slices.id],
    });
    c.emit(
      'slice-drying-cut',
      `One whole ${input.resource} was cut into thin slices with ${tool.id}. Its mass, water, nutrition, toxicity, decay and age are unchanged; no offcut is represented and the edge shows no wear.`,
      {
        trial: j.id,
        unit: slices.id,
        parent: input.id,
        tool: j.tool,
        support: surface.kind === 'object' ? surface.id : 'ground',
        geometry: { form: 'thin slices', layerArea: water.area },
        energy: CUT,
        offcuts: 0,
        view: view(w, j, a),
      },
      slices.id,
    );
    c.emit(
      'slice-drying-placed',
      `The slices lie in one thin layer ${surface.kind === 'ground' ? 'on open ground' : `on ${surface.id}`}${kept ? `; ${String(control)} whole unit kept carried as a control` : ''}. Drying follows the actual weather; nothing is preserved or made safe by it.`,
      { ...report(w, j), view: view(w, j, a) },
      slices.id,
    );
    sync(a, j, stateKey);
    return {
      complete: true,
      writes: [j.id, input.id, tool.id, slices.id, ...(kept ? [kept.id] : [])],
    };
  }

  function inspect(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const j = current(w, a);
    if (!j)
      throw new Error(
        'You have no open drying trial to inspect. Nothing was spent.',
      );
    if (action.args.instrumentId !== undefined) throw new Error(NO_INSTRUMENT);
    const s = j.stage === 'carried' ? carried(w, j) : lying(w, j);
    if (!s) throw new Error('The slices are not there. Nothing was spent.');
    const o = w.objects.find((o) => o.id === j.placement.id);
    const reach =
      j.stage === 'carried' ||
      (j.placement.kind === 'object' && o
        ? v7Reach(a, o.spatial)
        : v7Distance(a.position, s.position) <=
          a.radius + w.config.interaction);
    if (!reach)
      throw new Error(
        'Return within hand reach of the slices to inspect them. Nothing was spent.',
      );
    if (a.vitals.energy + 1e-8 < LOOK)
      throw new Error('Inspection needs 0.2 energy. Nothing was spent.');
    v7Spend(a, LOOK);
    const value = report(w, j),
      look = shrinkage(s),
      kept = j.control ? w.stacks.find((s) => s.id === j.control) : undefined;
    j.observations = [
      ...j.observations,
      {
        tick: w.tick,
        elapsedRounds: w.tick - j.cutAt,
        slicesDecay: round(s.decay ?? 0),
        controlDecay: kept ? round(kept.decay ?? 0) : null,
        shrinkage: look,
        rainRounds: j.rainRounds,
      },
    ].slice(-OBSERVATIONS);
    openRemember(c, {
      key: `${j.unit}:thin-slice-drying`,
      subject: j.resource,
      property: 'thin-slice drying trial readings',
      value,
      method: 'direct look at the slices and the carried control',
      condition:
        'visual only; mass and water not measured; spoilage, preservation and safety unverified',
      verified: false,
    });
    c.emit(
      'slice-drying-inspected',
      `Slices inspected ${String(w.tick - j.cutAt)} rounds after cutting: ${look} to the eye; decay readings recorded. Water was not measured and no preservation or safety is established.`,
      { ...value, view: view(w, j, a) },
      j.slices,
    );
    sync(a, j, stateKey);
    return { complete: true, writes: [j.id] };
  }

  function resume(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const j = current(w, a);
    if (!j)
      throw new Error(
        'You have no open drying trial to resume. Nothing was spent.',
      );
    if (j.stage !== 'carried')
      throw new Error(
        'Your slices still lie exposed; resume lays again only slices you picked up. Nothing was spent.',
      );
    const s = carried(w, j);
    if (!s || s.reservedFor)
      throw new Error('You no longer carry the slices. Nothing was spent.');
    const need = layerArea(w, s, s.quantity);
    const surface = placement(c, need, s.id);
    if (a.vitals.energy + 1e-8 < LOOK)
      throw new Error(
        'Laying the slices again needs 0.2 energy. Nothing was spent.',
      );
    v7Spend(a, LOOK);
    s.owner = null;
    // Already prepared: the representation adds no second opening and nothing is cut again.
    const water = foodWaterExpose(w, s, surface, true);
    Object.assign(j, {
      stage: 'exposed',
      placement: { ...surface, area: water.area },
      placedAt: w.tick,
      relaid: j.relaid + 1,
      quantity: s.quantity,
      wet: false,
    });
    c.emit(
      'slice-drying-resumed',
      `The slices you carried lie again in one thin layer ${surface.kind === 'ground' ? 'on open ground' : `on ${surface.id}`}; they were not cut again.`,
      { ...report(w, j), energy: LOOK, view: view(w, j, a) },
      s.id,
    );
    sync(a, j, stateKey);
    return { complete: true, writes: [j.id, s.id] };
  }

  function stop(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const j = current(w, a);
    if (!j)
      throw new Error(
        'You have no open drying trial to stop. Nothing was spent.',
      );
    const released = settle(
      w,
      a,
      j,
      'stopped',
      'Drying trial stopped; the control returns to ordinary use and the slices stay where they are. Spent energy and time are not refunded.',
      false,
    );
    const value = report(w, j);
    openRemember(c, {
      key: `${j.unit}:thin-slice-drying`,
      subject: j.resource,
      property: 'thin-slice drying trial readings',
      value,
      method: 'own trial record at stopping',
      condition:
        'visual only; mass and water not measured; spoilage, preservation and safety unverified',
      verified: false,
    });
    c.emit(
      'slice-drying-stopped',
      `Trial stopped ${String(w.tick - j.cutAt)} rounds after cutting. Slices left lying keep drying or wetting with the weather and keep ageing; take them with pickup. Preservation unverified.`,
      { ...value, released, view: view(w, j, a) },
      j.slices,
    );
    sync(a, j, stateKey);
    return { complete: true, writes: [j.id, ...released] };
  }

  function execute(c: V7ActionContext): V7HandlerResult {
    const mode = text(c.action.args.mode);
    if (mode === 'prepare') return prepare(c);
    if (mode === 'inspect') return inspect(c);
    if (mode === 'resume') return resume(c);
    if (mode === 'stop') return stop(c);
    throw new Error('Unknown drying trial mode. Nothing was spent.');
  }

  /** Ends the trial when the slices are gone, and reports how. */
  function gone(w: V7World, a: V7Actor, j: Trial) {
    const spoiled = spoiledNow(w, j.slices);
    if (!spoiled && j.stage === 'exposed')
      j.takenBy =
        w.events.find((e) => e.type === 'picked-up' && e.target === j.slices)
          ?.actor ?? null;
    const stage = spoiled ? 'spoiled' : 'removed';
    settle(
      w,
      a,
      j,
      stage,
      spoiled
        ? 'The slices spoiled under the existing ageing; the trial ended and the control returns to ordinary use.'
        : 'The slices were taken or used; the trial ended and the control returns to ordinary use.',
      false,
    );
    forestEvent(
      w,
      spoiled ? 'slice-drying-spoiled' : 'slice-drying-removed',
      spoiled
        ? 'The slices spoiled and are gone; the trial ended without preservation.'
        : 'The slices are gone from the trial; it ended. Preservation unverified.',
      where(w, j, a),
      a.id,
      { ...report(w, j), view: view(w, j, a) },
      j.slices,
    );
  }

  /** Unattended exposure: record actual rain, pickup, removal and spoilage; no labor or charge. */
  function environment(w: V7World) {
    for (const j of trials(w).filter(open)) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (!a) continue;
      const kept = j.control
        ? w.stacks.find((s) => s.id === j.control)
        : undefined;
      if (j.control && kept) j.controlDecay = round(kept.decay ?? 0);
      else if (j.control && j.controlSpoiledAt === null) {
        j.controlSpoiledAt = w.tick;
        forestEvent(
          w,
          'slice-drying-control-spoiled',
          'The carried control spoiled under the ordinary ageing; the slices trial continues without it.',
          a.position,
          a.id,
          {
            trial: j.id,
            control: j.control,
            spoiled: spoiledNow(w, j.control),
          },
          j.control,
        );
      }
      if (j.stage === 'carried') {
        const s = carried(w, j);
        if (!s) gone(w, a, j);
        else {
          j.slicesDecay = round(s.decay ?? 0);
          j.quantity = s.quantity;
          j.lastUpdate = w.tick;
        }
        sync(a, j, stateKey);
        continue;
      }
      const s = lying(w, j);
      if (!s) {
        // The owner picking up all the slices pauses the trial; anyone else's taking ends it.
        const picked = spoiledNow(w, j.slices)
          ? undefined
          : w.events.find(
              (e) => e.type === 'picked-up' && e.target === j.slices,
            );
        const item = text(picked?.data.item);
        const mine =
          picked?.actor === j.owner &&
          w.stacks.some((x) => x.id === item && x.owner === j.owner);
        if (mine) {
          j.slices = item;
          j.stage = 'carried';
          j.wet = false;
          const now = carried(w, j);
          j.quantity = now?.quantity ?? j.quantity;
          j.slicesDecay = round(now?.decay ?? j.slicesDecay);
          j.lastUpdate = w.tick;
          forestEvent(
            w,
            'slice-drying-carried',
            'You picked up the slices; exposure is paused while you carry them. Use resume to lay them again.',
            a.position,
            a.id,
            { ...report(w, j), view: view(w, j, a) },
            item,
          );
        } else gone(w, a, j);
        sync(a, j, stateKey);
        continue;
      }
      // Pickup moves whole units, so the one-unit layer is taken all at once or not at all.
      j.slicesDecay = round(s.decay ?? 0);
      const last = foodWaterRead(s)?.last;
      const wet = last?.tick === w.tick && Number(last.received) > 0;
      if (wet) {
        j.rainRounds += 1;
        if (!j.wet) {
          j.wet = true;
          forestEvent(
            w,
            'slice-drying-rained-on',
            'Rain is falling on the uncovered slices and wetting them.',
            s.position,
            a.id,
            { trial: j.id, rainRounds: j.rainRounds, view: view(w, j, a) },
            s.id,
          );
        }
      } else j.wet = false;
      j.lastUpdate = w.tick;
      sync(a, j, stateKey);
    }
  }

  return {
    id,
    version: 1,
    scope,
    dependencies,
    description:
      'A general thin-slice air-drying trial: one owned whole root or berry unit is cut with a carried stone or flint edge that passes the world contact model and laid in one thin layer on open ground or an existing food surface under the installed food water representation, with an optional carried control; readings are visual and model decay only; nothing is preserved or made safe.',
    reuse: {
      experiment:
        'ex19 food-air-exposure-trial@1 (whole untreated food check, carried control, decay trajectory, placement, stop and removal semantics); ex12 bark separation (stone or flint usable-edge predicate); ex10 measured-food-preservation@1 (thin-layer drying and moisture-dependent decay equations, through the food water representation)',
      source:
        'long-ex19-food-air-exposure.ts (airExposureUnsupported, airExposureTrack); food-water.ts (foodWaterExpose with prepared, foodWaterSurfaceArea, foodWaterRead; exchange and decay in open-preservation-physics.ts and forest-environment.ts); open-hardness-physics.ts (scratchPhysical, scratchVisible); collective-work.ts; open-foundation.ts (openRemember); base pickup',
      description:
        'Implementation reuse only; no tool, surface, food, skill or mastery is supplied. New work is the edge qualification, the thin-layer area, the cutting round, the visible shrinkage classes and the pickup-and-resume handling; the moisture, rain and decay rules are the existing representation, unchanged.',
    },
    abilities: [
      {
        id,
        name: 'Thin-slice food drying trial',
        function:
          'Cut one whole unit of your own root or berry into thin slices with a carried stone or flint edge, lay them in one thin layer on open ground or a food surface to air-dry under actual weather, optionally keeping a carried same-stack control; inspect; re-lay slices you picked up; stop.',
        equivalence: 'food:thin-slice:air-drying-trial:1',
        parameters: {
          ...v7ObjectSchema({
            mode: {
              type: 'string',
              enum: ['prepare', 'inspect', 'resume', 'stop'],
            },
            inputStackId: { type: 'string' },
            quantity: { type: 'integer', minimum: 1 },
            controlQuantity: { type: 'integer', minimum: 0 },
            toolId: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            supportId: { type: 'string' },
            instrumentId: { type: 'string' },
          }),
          required: ['mode'],
        },
        references: {
          inputStackId: 'optional-exact-visible',
          toolId: 'optional-exact-visible',
          supportId: 'optional-exact-visible',
        },
        prerequisites: [],
        learning: 4,
        learningEnergy: STUDY,
        costs:
          'Study: 4 rounds, 0.5 energy each. prepare: inputStackId, your own unspoiled uncut root or berry stack with 1 + controlQuantity whole units (one unit per trial); toolId, your own carried whole stone or flint unit whose edge passes the world contact model (radius at most 0.0002, hardness 8+, not fractured or contaminated); a layer area of 5 x unit mass: a ground footprint centred at x,y (default your position) within 0.65 plus your radius, or supportId, a food surface in reach at least that large. One round, 1.5 energy. inspect: in reach of the slices or carrying them; one round, 0.2 energy. resume: re-lays slices you picked up, same placement rules, no cutting; one round, 0.2 energy. stop: one round, no energy. All checks run before any charge; travel, gathering and pickup are separate. instrumentId is refused: no calibrated balance exists.',
        effects:
          "Cutting keeps the unit's mass, water, nutrition, toxicity, decay and age; no offcut is represented; the edge gains no wear. Slices lie unowned as one sample with the world food water record (assumed water fraction root 0.75, berry 0.85; opening damage 1.1). Each round: water moves toward an equilibrium fraction 0.1 + 0.25 x air humidity (0.1-0.35) by at most 0.025 x area x (temperature - 5)/20 (0-2), so no gradient or warmth, no drying; rain on the uncovered layer adds 0.01 x rain x area; decay is the ordinary rate x 1.1 x (0.15 + 0.85 x water fraction/initial) (0.15-1.5), never reset. The control ages normally while carried. Inspect records elapsed rounds, quantities, model decay of slices and control and their difference, visible shrinkage and wetness, and rain rounds as an unverified record; shrinkage does not measure water; spoilage, contamination, preservation and safety stay unverified. Anyone may take lying food: you taking the slices pauses the trial until resume; others taking them, spoilage, stop or death end it and release the control once. No refund or reward.",
        handler,
        revision,
        authored: false,
        // The cut event carries no qualified flag: cutting earns no practice milestone.
        practiceEvidence: 'slice-drying-cut',
        dependencies: { abilities: [], resources: [], knowledge: [] },
        execution: {
          duration: 1,
          interruption: 'cancel',
          progress:
            'Each mode is one atomic round; a cut commits only when its round completes. The trial record persists; exposure continues unattended without charge until stop, removal, spoilage or death.',
        },
      },
    ],
    handlers: { [handler]: execute },
    processes: {},
    visualComponents: [],
    events: [
      'slice-drying-cut',
      'slice-drying-placed',
      'slice-drying-inspected',
      'slice-drying-rained-on',
      'slice-drying-carried',
      'slice-drying-resumed',
      'slice-drying-removed',
      'slice-drying-spoiled',
      'slice-drying-control-spoiled',
      'slice-drying-stopped',
      'slice-drying-interrupted',
      // Emitted by the food water exchange for exposed food (CULTURE_SCENARIO section G).
      'preservation-progress',
    ],
    resources: [],
    satisfaction: [],
    afterEnvironment: environment,
    onDeath(w, a) {
      for (const j of trials(w).filter((j) => j.owner === a.id && open(j))) {
        settle(
          w,
          a,
          j,
          'ended-by-death',
          'Performer died; the trial ended and the control is released under the death rules. Slices stay where they are and keep drying or wetting and ageing; nothing is refunded.',
          true,
        );
        forestEvent(
          w,
          'slice-drying-interrupted',
          'The trial ended by death; the slices stay where they are and keep changing with the weather.',
          a.position,
          a.id,
          { ...report(w, j), view: view(w, j, a) },
          j.slices,
        );
        sync(a, j, stateKey);
      }
    },
  };
}

/** ex19: Wren's thin-slice drying trial, beside the whole-food air-exposure trial it reuses. */
export const LONG_EX19_THIN_SLICE_FOOD_DRYING = thinSliceFoodDryingPackage(
  'thin-slice-food-drying-trial',
  'long-ex19',
  ['foundation-open@1', 'food-air-exposure-trial@1'],
);
