import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Package,
  V7Point,
  V7Resource,
  V7Spatial,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Id, v7Json, v7Number, v7RoundNumber } from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7Reach,
  v7ShapeDistance,
  v7Visible,
} from './continuous-geometry.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import {
  foodSetQuantity,
  foodTenths,
  foodUnitMass,
} from './forest-food-accounting.js';
import { forestEvent } from './forest-climate.js';
import { openConditions, openMaterial } from './open-physical.js';
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
  ex19MaterialContact,
  ex19MaterialGround,
  ex19MaterialPiece,
} from './long-ex19-material-contact.js';
import {
  SMALL_FIRE,
  SMALL_FIRE_COVERS,
  smallFireRod,
} from './long-ex21-small-combustion-physics.js';

/** ex23: a general operation that shapes the end of an owned wooden piece into a blunt digging
 * point by controlled abrasion on a hard surface, and uses the shaped piece to lever small
 * amounts of loose surface soil out of a reachable patch into a heap beside it. Wood removed by
 * abrasion becomes attributable dust on the ground; soil is moved, never deleted or produced. */

const ID = 'shape-and-use-wooden-digging-tool';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
/** Record on a blank or tool, on dust and fragment items, and on a worn abrasive item. */
const KEY = 'diggingTool';
const DEBRIS_KEY = 'diggingToolDebris';
const WEAR_KEY = 'diggingToolAbrasion';
/** World state key prefix of a dug soil patch. */
const PATCH_KEY = 'digging-soil';
const WOOD_DEBRIS = 'wood-shaping-debris';
const GRIT_DEBRIS = 'abrasive-grit-debris';
const PLANS = ['shape', 'maintain'] as const;
type Plan = (typeof PLANS)[number];
const MODES = [
  'inspect',
  'shape',
  'use',
  'maintain',
  'pause',
  'resume',
  'cancel',
] as const;
/** Represented treatments without an abrasion law in this version. */
const TREATED = [
  'componentLots',
  'materialLayer',
  'frictionKit',
  'waterCup',
  'mantle',
  'fuelMoisture',
  'canopyDrying',
] as const;

/** Declared version-1 parameters. Every value is a modeling assumption recorded in the review. */
export const DIGGING_TOOL = {
  /** World Agent costs: inspection 0.5 energy; each shaping, maintenance or use stroke 1. */
  inspectEnergy: 0.5,
  strokeEnergy: 1,
  /** At most four strokes per submitted work segment; more need explicit continuation. */
  segment: 4,
  /** open-hardness-physics scratchStroke dust quantum (kg) detached by one abrasive contact. */
  quantum: 0.0001,
  /** Controlled abrasive passes in one stroke round, each one scratch contact: at most 0.01 kg
   * of wood per stroke. With ex21's 21.6 kJ of hand work per energy this is about 1.9 J per
   * cubic millimetre of green wood, a slow hand abrasion on rough stone. */
  passes: 100,
  /** ex21 small-combustion-source@1 declared rod: green wood 900 kg/m3, 25 diameters long per
   * whole unit (a fallen-branch unit: 0.04 m thick, 0.99 m long). */
  density: SMALL_FIRE.woodDensity,
  /** The working end tapers over 3 diameters. Release: tip diameter at most 0.35 of the
   * diameter, with at least the ex21 0.3 m two-handed grip length behind the taper. Strokes never
   * take the tip below 0.2 of the diameter: a finer point is not a digging end. */
  taper: 3,
  release: 0.35,
  floor: 0.2,
  shaft: SMALL_FIRE.lengthMin,
  /** ex21 grip and rigidity bounds of a hand-held wooden piece. */
  gripMin: SMALL_FIRE.gripMin,
  gripMax: SMALL_FIRE.gripMax,
  rigid: SMALL_FIRE.rigid,
  /** Use: the probe load scale (0-1, 0.25 by default) is a hand push of load x 500 N. */
  fullLoad: 500,
  defaultLoad: 0.25,
  /** One stroke presses and levers the end 30 times (one every 36 s of the 1080 s round); each
   * lever breaks out a cone of soil as deep and as wide as the penetration (45 degree failure).
   * At most 0.001 m3 (1000 cm3) moves per stroke (World Agent cap). */
  jabs: 30,
  cap: 1000,
  /** A patch is a 0.25 m circle on a 0.25 m grid; its loose top 0.15 m (the ex23 root-zone
   * depth) can be moved; firmer ground below is not dug in this version. */
  grid: 0.25,
  radius: 0.125,
  looseDepth: 0.15,
  /** The heap of moved soil lies 0.25 m from the patch centre toward the worker. */
  heap: 0.25,
  /** Penetration resistance at the ordinary soil moisture 0.65 (Pa): loose forest floor and
   * rooted meadow topsoil; drier soil is harder by (0.65 / moisture)^1.5 within 0.5-8 times. */
  resistance: { f: 300000, '.': 800000 } as Record<string, number>,
  ordinaryMoisture: 0.65,
  dryExponent: 1.5,
  factorMin: 0.5,
  factorMax: 8,
  /** Hazard waterlogging above this is waterlogged ground (the world's site rules). */
  waterlogged: 0.1,
  /** The open.probe press rule: wood holds a load not above its strength (hardness / 10); a split
   * end holds half. */
  cracked: 0.5,
  /** Mineral grit in soil, or rock, wears the tip by one quantum per stroke with ground contact. */
  useWear: 1,
} as const;
const P = DIGGING_TOOL;
const GROUND_NAMES: Record<string, string> = {
  f: 'forest floor',
  '.': 'meadow ground',
  ':': 'rocky ground',
  ',': 'wet bank',
  '~': 'water',
  '=': 'shallow water',
};

const round = (x: number) => v7RoundNumber(x);
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const nothing = (reason: string) => new Error(`${reason} Nothing was spent.`);
const isOpen = (j: CollectiveWork) => ['active', 'paused'].includes(j.status);
const hardness = (r: V7Resource) => r.properties?.hardness ?? 0;
const record = (v: unknown): V7Data | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as V7Data) : null;

/** Current shape of a piece's working end (m): the end region is `region` long; the tip tapers
 * over `taper` of it from `tip` to the full diameter. A flat end has tip = diameter. */
interface End extends V7Data {
  diameter: number;
  length: number;
  region: number;
  taper: number;
  tip: number;
}
interface MassLedger extends V7Data {
  input: number;
  shaping: number;
  use: number;
  fragments: number;
}
interface Counts extends V7Data {
  shaping: number;
  maintenance: number;
  use: number;
}
/** The persistent record of a blank or shaped tool. */
interface Tool extends V7Data {
  version: number;
  revision: string;
  status: string;
  condition: string;
  cracks: number;
  verified: boolean;
  verifiedAt: number | null;
  evidence: string | null;
  material: string;
  parent: string;
  work: string | null;
  end: End;
  mass: MassLedger;
  strokes: Counts;
  displaced: number;
}
/** One dug patch. Conservation: displaced = heap volume (cm3 of in-place soil). */
interface Patch extends V7Data {
  x: number;
  y: number;
  radius: number;
  ground: string;
  looseVolume: number;
  displaced: number;
  heap: { x: number; y: number; volume: number };
  strokes: number;
  toolDust: number;
  lastTick: number;
}
interface Dig extends CollectiveWork {
  plan: string;
  stage: string;
  phase: string;
  source: string;
  blank: string;
  resource: string;
  quantity: number;
  abrasive: string;
  abrasiveKind: string;
  abrasiveMaterial: string;
  support: string;
  strokes: number;
  segment: number;
  removed: number;
  abrasiveWorn: number;
  quote: V7Data;
  pausedAt: number | null;
  startedAt: number;
  endedAt: number | null;
}
interface Gear {
  kind: 'object' | 'item';
  id: string;
  material: V7Resource;
  item: V7Stack | null;
  support: string;
}

/** Volume of the end region as it now is: the frustum of the taper and the full cylinder behind. */
function regionVolume(e: End): number {
  const d = e.diameter;
  return (
    (Math.PI * e.taper * (d * d + d * e.tip + e.tip * e.tip)) / 12 +
    (Math.PI * d * d * (e.region - e.taper)) / 4
  );
}
/** Volume of the region tapered over its whole length to a given tip. */
function taperedVolume(e: End, tip: number): number {
  const d = e.diameter;
  return (Math.PI * e.region * (d * d + d * tip + tip * tip)) / 12;
}
/** The end after abrading a volume off it: the region tapers over its whole length to the tip
 * that leaves exactly the remaining volume. */
function abradedEnd(e: End, volume: number): End {
  const d = e.diameter,
    left = regionVolume(e) - volume;
  const root = Math.sqrt(
    Math.max(d * d, (48 * left) / (Math.PI * e.region) - 3 * d * d),
  );
  return { ...e, taper: e.region, tip: round(Math.max(0, (root - d) / 2)) };
}
/** Whole quanta to take off the end until its tip reaches a goal (0 when it is there). */
function quantaTo(e: End, tip: number): number {
  const volume = regionVolume(e) - taperedVolume(e, tip);
  return volume <= 0
    ? 0
    : Math.max(0, Math.ceil((volume * P.density) / P.quantum - 1e-6));
}
const meets = (e: End) =>
  e.tip <= P.release * e.diameter + 1e-9 && e.length - e.region >= P.shaft;
/** The tip after soil grit wore a volume off it: the end shortens along its taper. */
function wornEnd(e: End, volume: number): End {
  if (e.taper <= 0 || e.tip >= e.diameter) return e;
  const slope = (e.diameter - e.tip) / e.taper;
  const first = (4 * volume) / (Math.PI * e.tip * e.tip);
  const wider = e.tip + slope * first;
  const shorter =
    (12 * volume) / (Math.PI * (e.tip * e.tip + e.tip * wider + wider * wider));
  if (shorter >= e.taper)
    return {
      ...e,
      length: round(e.length - e.taper),
      taper: e.region,
      tip: e.diameter,
    };
  return {
    ...e,
    length: round(e.length - shorter),
    taper: round(e.taper - shorter),
    tip: round(e.tip + slope * shorter),
  };
}
const endView = (e: End): V7Data => ({
  shape: shapeOf(e),
  length: round(e.length),
  diameter: round(e.diameter),
  tip: round(e.tip),
  taper: round(e.taper),
  meetsCriterion: meets(e),
});
function shapeOf(e: End) {
  return e.tip >= e.diameter - 1e-9
    ? 'flat end'
    : meets(e)
      ? 'tapered blunt point'
      : 'partly tapered end';
}

/** Owned wood the operation can shape: inedible, combustible (wood), rigid and hard enough. */
function woodProblem(r: V7Resource | undefined): string | null {
  if (!r || !r.properties) return 'It has no represented material.';
  if (r.nutrition > 0) return 'Food is not shaped into a digging end.';
  if (r.properties.fuel <= 0 || hardness(r) < 1)
    return `${r.name} is not represented as wood.`;
  if (r.properties.flexibility > P.rigid)
    return `${r.name} bends too much to hold a working end.`;
  return null;
}
/** Why a material cannot serve as the hard abrasive surface, or null. */
function abrasiveProblem(r: V7Resource | undefined): string | null {
  if (!r || !r.properties)
    return 'The abrasive has no represented physical material.';
  if (r.nutrition > 0 || r.toxicity > 0)
    return 'The abrasive must be an inedible material.';
  if (r.properties.fuel > 0)
    return 'A combustible surface is not an abrasive here: rubbing wood on it is friction heating, which this operation excludes.';
  if ((SMALL_FIRE_COVERS as readonly string[]).includes(r.id))
    return `${r.name} is granular or plastic, not a rigid abrasive face.`;
  if (hardness(r) < 1 || r.properties.flexibility > P.rigid)
    return 'The abrasive must be a rigid surface.';
  return null;
}
/** The existing scratch rule applied to rubbing, where each surface slides over the other: a
 * surface no harder than the other sheds one quantum per pass; one harder is not worn. The
 * contact needs scratchStroke's pressure above 1e6 x the other surface's resistance. */
function rub(blankMass: number, wood: number, abrasive: number) {
  const force = Math.min(30, 5 + blankMass * 9.81),
    radius = 0.001 / Math.max(1, wood),
    contact = force / (Math.PI * radius * radius) > 1e6 * Math.max(1, abrasive);
  return {
    contact,
    wood: contact && wood <= abrasive,
    abrasive: contact && abrasive <= wood,
  };
}
/** Penetration resistance of the patch's soil (Pa), or why it does not yield. */
function soilOf(w: V7World, p: V7Point) {
  const k = openConditions(w, p);
  const name = GROUND_NAMES[k.ground] ?? 'unrepresented ground';
  const base = P.resistance[k.ground];
  const reason = ['~', '='].includes(k.ground)
    ? 'open water: nothing holds together to be levered out'
    : k.ground === ','
      ? 'the wet bank is saturated: loosened soil flows back into the hole'
      : k.waterlogging > P.waterlogged
        ? 'the soil is waterlogged: loosened soil flows back into the hole'
        : k.ground === ':'
          ? 'rocky ground resists the end: it does not enter'
          : base === undefined
            ? `${name} is not represented as loose soil`
            : null;
  const factor = Math.min(
    P.factorMax,
    Math.max(
      P.factorMin,
      (P.ordinaryMoisture / Math.max(0.05, k.moisture)) ** P.dryExponent,
    ),
  );
  return {
    k,
    name,
    reason,
    water: ['~', '='].includes(k.ground),
    resistance: reason || base === undefined ? Infinity : base * factor,
  };
}

export function diggingToolPackage(scope: string): V7Package {
  const id = ID;
  const works = (w: V7World) => collectiveJobs(w, id).map((j) => j as Dig);
  const current = (w: V7World, a: V7Actor) =>
    works(w).find((j) => j.owner === a.id && isOpen(j));
  const stateKey = `long:work:${id}`;
  const sync = (a: V7Actor, j: Dig) => {
    a.extensionState[stateKey] = v7Json(j);
  };
  const reserved = (w: V7World, j: Dig) =>
    w.stacks.find((s) => s.id === j.blank && s.reservedFor === j.id);
  const toolOf = (s: V7Stack): Tool | null => {
    const r = record(s.processing?.[KEY]);
    return r && r.revision === REVISION ? (r as Tool) : null;
  };
  const setTool = (s: V7Stack, t: Tool) => {
    s.processing = { ...(s.processing ?? {}), [KEY]: v7Json(t) };
  };
  const massOf = (w: V7World, s: V7Stack) =>
    round(foodUnitMass(w, s) * s.quantity);

  /** Sets the per-unit mass of a piece from its exact ledger, keeping its water share. */
  function setMass(w: V7World, s: V7Stack, mass: number) {
    const r = w.resources.find((r) => r.id === s.resource);
    const share = s.physical
      ? s.physical.unitWater / Math.max(1e-12, s.physical.unitMass)
      : (r?.properties?.moisture ?? 0);
    const unit = round(mass / s.quantity);
    s.physical = {
      unitMass: unit,
      unitWater: round(unit * share),
      unitSolids: round(unit - round(unit * share)),
    };
  }
  /** A fresh record for a selected piece of owned wood (ex21 rod geometry). */
  function freshTool(w: V7World, s: V7Stack, q: number): Tool {
    const rod = smallFireRod(w, s),
      d = rod.diameter;
    return {
      version: 1,
      revision: REVISION,
      status: 'unfinished',
      condition: 'sound',
      cracks: 0,
      verified: false,
      verifiedAt: null,
      evidence: null,
      material: s.resource,
      parent: s.id,
      work: null,
      end: {
        diameter: d,
        length: round(rod.length * q),
        region: round(P.taper * d),
        taper: round(P.taper * d),
        tip: d,
      },
      mass: {
        input: round(foodUnitMass(w, s) * q),
        shaping: 0,
        use: 0,
        fragments: 0,
      },
      strokes: { shaping: 0, maintenance: 0, use: 0 },
      displaced: 0,
    };
  }
  const left = (t: Tool) =>
    round(t.mass.input - t.mass.shaping - t.mass.use - t.mass.fragments);
  const toolState = (t: Tool) =>
    t.status === 'broken'
      ? 'broken end'
      : t.status === 'unfinished'
        ? 'unfinished blank'
        : t.verified
          ? 'use-verified tool'
          : 'shaped, use unverified';
  function condition(t: Tool | null, s: V7Stack): V7Data {
    if (!t) return { item: s.id, state: 'unworked stock' };
    return {
      item: s.id,
      state: toolState(t),
      condition: t.condition,
      cracks: t.cracks,
      end: endView(t.end),
      mass: left(t),
      verified: t.verified,
    };
  }
  /** Reusable drawing metadata, carried by every event. Only displacement events show earth. */
  function view(
    w: V7World,
    a: V7Actor,
    mode: string,
    phase: string,
    extra: V7Data = {},
  ): V7Data {
    return {
      component: null,
      operation: id,
      mode,
      phase,
      actor: a.id,
      x: round(a.position.x),
      y: round(a.position.y),
      tick: w.tick,
      displacedEarth: false,
      finishedEnd: false,
      badge: null,
      ...extra,
    };
  }
  function summary(w: V7World, j: Dig, extra: V7Data = {}): V7Data {
    const blank = w.stacks.find((s) => s.id === j.blank);
    const t = blank ? toolOf(blank) : null;
    const shown = blank ? condition(t, blank) : null;
    const a = w.actors.find((a) => a.id === j.owner);
    return {
      workId: j.id,
      plan: j.plan,
      stage: j.stage,
      status: j.status,
      source: j.source,
      blank: j.blank,
      abrasive: j.abrasive,
      support: j.support,
      strokes: j.strokes,
      segment: j.segment,
      removed: round(j.removed),
      abrasiveWorn: round(j.abrasiveWorn),
      debris: [...j.outputs],
      paidEnergy: round(j.paidEnergy),
      tool: shown,
      ...(a
        ? {
            view: view(w, a, j.plan, j.phase, {
              workId: j.id,
              target: j.blank,
              source: j.source,
              abrasive: j.abrasive,
              material: j.resource,
              progress: {
                strokes: j.strokes,
                segment: j.segment,
                of: P.segment,
                paidEnergy: round(j.paidEnergy),
              },
              end: t ? endView(t.end) : null,
              visibleCondition: t ? toolState(t) : null,
              debrisMass: round(j.removed),
              position: { x: round(j.x), y: round(j.y) },
              ...extra,
            }),
          }
        : {}),
    };
  }

  /** The pinned or named abrasive and its support, or the physical problem with them. */
  function gearOf(
    c: V7ActionContext,
    ref: string,
    exclude: string[],
  ): Gear | string {
    const { world: w, actor: a } = c;
    if (!ref)
      throw nothing(
        'Shaping needs abrasive: a hard rough surface in reach or your own whole stone piece.',
      );
    if (exclude.includes(ref))
      throw nothing('The piece and the abrasive must be different.');
    const o = w.objects.find((o) => o.id === ref);
    if (o) {
      const m = w.resources.find((r) => r.id === o.data.resource);
      if (
        !o.spatial.solid ||
        o.spatial.reserved ||
        ['plant', 'animal'].includes(o.kind)
      )
        return 'The abrasive must be a solid, unreserved surface, not a plant or an animal.';
      const issue = abrasiveProblem(m);
      if (issue || !m) return issue ?? 'The abrasive is missing.';
      if (!v7Reach(a, o.spatial) || !v7Visible(w, a.position, o.spatial))
        return 'Move within reach of the abrasive surface.';
      // A solid outcrop is its own stable support.
      return {
        kind: 'object',
        id: o.id,
        material: m,
        item: null,
        support: o.id,
      };
    }
    const s = w.stacks.find((s) => s.id === ref);
    const piece = ex19MaterialPiece(w, a, s);
    if (piece || !s) return piece ?? 'The abrasive is missing.';
    const m = collectiveFoodProfile(w, s);
    const issue = abrasiveProblem(m);
    if (issue || !m) return issue ?? 'The abrasive is missing.';
    const contact = ex19MaterialContact(w, s);
    if (contact.fractured || !contact.controlledContact)
      return `${s.id} is fractured or too small to give a sound face.`;
    const ground = ex19MaterialGround(w, a.position);
    if (ground)
      return 'The abrasive piece must rest on firm ordinary ground where you stand, not water, a wet bank or waterlogged ground.';
    return {
      kind: 'item',
      id: s.id,
      material: m,
      item: s,
      support: `ground:${String(Math.floor(a.position.x))}:${String(Math.floor(a.position.y))}`,
    };
  }

  /** The own piece to shape or maintain, its record and the selected quantity, or a refusal. */
  function targetOf(c: V7ActionContext, plan: Plan) {
    const { world: w, actor: a, action } = c;
    const s = w.stacks.find((s) => s.id === text(action.args.target));
    if (!s || s.owner !== a.id)
      throw nothing(
        'Name one of your own items by its exact item id in target.',
      );
    if (s.reservedFor)
      throw nothing(`${s.id} is reserved for unfinished work.`);
    const r = collectiveFoodProfile(w, s);
    const problem = woodProblem(r);
    if (problem || !r) throw nothing(problem ?? 'It is missing.');
    if (
      TREATED.some((k) => s[k] !== undefined) ||
      Object.keys(s.processing ?? {}).some((k) => k !== KEY)
    )
      throw nothing(
        'Material under another represented treatment has no abrasion law in this version.',
      );
    const old = record(s.processing?.[KEY]);
    if (old && old.revision !== REVISION)
      throw nothing('This item carries another revision of this record.');
    const contact = ex19MaterialContact(w, s);
    if (contact.fractured)
      throw nothing(`${s.id} is fractured; no sound working end can be made.`);
    const t = toolOf(s);
    if (plan === 'shape' && t && t.status !== 'unfinished')
      throw nothing(
        `${s.id} is already a ${toolState(t)}: use it, or maintain its end.`,
      );
    if (plan === 'maintain') {
      if (!t || t.status === 'unfinished')
        throw nothing(
          `${s.id} is not a shaped tool of this operation; shape it first.`,
        );
      if (t.status !== 'broken' && meets(t.end))
        throw nothing(
          `The end of ${s.id} already meets the end criterion (tip ${String(round(t.end.tip))} m); nothing to maintain. Abrasion cannot heal a split.`,
        );
    }
    let q = foodTenths(s.quantity);
    if (!t) q = Math.min(10, q);
    if (action.args.quantity !== undefined) {
      const n = v7Number(action.args.quantity, 'quantity', 0.1, 1);
      if (Math.abs(n * 10 - Math.round(n * 10)) > 1e-7)
        throw nothing('quantity is given in exact tenths of a unit.');
      q = Math.round(n * 10);
    }
    if (t && q !== foodTenths(s.quantity))
      throw nothing(
        `${s.id} is one worked piece of ${String(s.quantity)}; it is worked whole.`,
      );
    if (q < 1 || q > Math.min(10, foodTenths(s.quantity)))
      throw nothing(
        `${s.id} holds ${String(s.quantity)}; one piece is at most one whole unit; ${String(q / 10)} was selected.`,
      );
    const tool = t ?? freshTool(w, s, q / 10);
    const e = tool.end;
    if (e.diameter < P.gripMin || e.diameter > P.gripMax)
      throw nothing(
        `The piece is ${String(round(e.diameter))} m thick; a hand-held digging piece is ${String(P.gripMin)}-${String(P.gripMax)} m thick.`,
      );
    if (e.length - e.region < P.shaft)
      throw nothing(
        `A ${String(q / 10)} piece is ${String(round(e.length))} m long; a ${String(round(e.region))} m working end needs a ${String(P.shaft)} m shaft behind it, so at least ${String(round(e.region + P.shaft))} m.`,
      );
    return { s, r, q, tool };
  }

  function quoteOf(
    plan: Plan,
    s: V7Stack,
    q: number,
    tool: Tool,
    gear: Gear,
  ): V7Data {
    const goal = Math.max(P.floor, P.release) * tool.end.diameter;
    const quanta = quantaTo(tool.end, goal);
    const strokes = Math.ceil(quanta / P.passes);
    return {
      plan,
      target: s.id,
      resource: s.resource,
      quantity: q / 10,
      mass: left(tool),
      piece: condition(tool, s),
      criterion: {
        tipAtMost: round(P.release * tool.end.diameter),
        taperLength: tool.end.region,
        shaftAtLeast: P.shaft,
      },
      removal: {
        needed: round(quanta * P.quantum),
        perStrokeAtMost: round(P.passes * P.quantum),
      },
      strokes,
      segments: Math.ceil(strokes / P.segment),
      energy: strokes * P.strokeEnergy,
      abrasive: { ref: gear.id, kind: gear.kind, support: gear.support },
      abrasiveWearAtMostPerStroke: round(P.passes * P.quantum),
      note: 'Removal happens only if the surface abrades this wood; a surface that does not is a paid stroke that removes nothing.',
      excludes: 'travel, getting an abrasive and study',
    };
  }

  /** Opens a work record and reserves the selected piece. */
  function begin(
    c: V7ActionContext,
    plan: Plan,
    t: ReturnType<typeof targetOf>,
    gear: Gear,
    quote: V7Data,
  ): Dig {
    const { world: w, actor: a } = c;
    const j = workCreate(c, plan, Math.max(1, Number(quote.strokes))) as Dig;
    let blank: V7Stack | undefined;
    if (t.q === foodTenths(t.s.quantity)) {
      t.s.reservedFor = j.id;
      t.s.position = { x: j.x, y: j.y };
      j.escrow.push(t.s.id);
      j.sources.push({
        itemId: t.s.id,
        escrowId: t.s.id,
        resource: t.s.resource,
        quantity: t.s.quantity,
        owner: a.id,
        origin: t.s.origin,
      });
      blank = t.s;
    } else {
      workReserve(
        c,
        j,
        workAllocations(c, [{ itemId: t.s.id, quantity: t.q / 10 }]),
      );
      blank = w.stacks.find((x) => x.id === j.escrow[0]);
      w.stacks = w.stacks.filter((x) => x.id !== t.s.id || x.quantity > 0);
    }
    if (!blank) throw new Error('The reserved piece is missing.');
    const tool: Tool = { ...t.tool, work: j.id, parent: t.tool.parent };
    setTool(blank, tool);
    Object.assign(j, {
      plan,
      stage: 'working',
      phase: plan,
      source: t.s.id,
      blank: blank.id,
      resource: blank.resource,
      quantity: t.q / 10,
      abrasive: gear.id,
      abrasiveKind: gear.kind,
      abrasiveMaterial: gear.material.id,
      support: gear.support,
      strokes: 0,
      segment: 0,
      removed: 0,
      abrasiveWorn: 0,
      quote: { ...quote, reserved: blank.id },
      pausedAt: null,
      startedAt: w.tick,
      endedAt: null,
    });
    c.emit(
      'digging-tool-started',
      `${String(t.q / 10)} of ${t.s.id} is reserved as ${blank.id} in work ${j.id} (${plan}) against ${gear.id}: about ${String(Number(quote.strokes))} strokes and ${String(Number(quote.energy))} energy if the surface abrades this wood.`,
      summary(w, j, { quote: j.quote }),
      blank.id,
    );
    sync(a, j);
    return j;
  }

  /** Adds detached mass to a work's ground item of a debris material at a point, or lays a new
   * one there. Debris carries its source piece, material and work. */
  function deposit(
    w: V7World,
    outputs: string[],
    work: string,
    resource: string,
    quanta: number,
    source: { id: string; resource: string; origin: string },
    at: V7Point,
    kind: string,
  ): string {
    const into = w.stacks.find(
      (s) =>
        outputs.includes(s.id) &&
        s.resource === resource &&
        s.owner === null &&
        v7Distance(s.position, at) < 1e-6,
    );
    if (into) {
      foodSetQuantity(into, foodTenths(into.quantity) + quanta);
      return into.id;
    }
    const item: V7Stack = {
      id: v7Id(w, 'item'),
      resource,
      quantity: quanta / 10,
      quantityTenths: quanta,
      position: { x: at.x, y: at.y },
      owner: null,
      origin: source.origin,
      processing: {
        [DEBRIS_KEY]: {
          revision: REVISION,
          work,
          source: source.id,
          material: source.resource,
          kind,
        },
      },
    };
    w.stacks.push(item);
    outputs.push(item.id);
    return item.id;
  }
  /** Debits abrasive wear from an own abrasive piece's solids and records it on the piece. */
  function wearAbrasive(w: V7World, s: V7Stack, mass: number): number {
    const r = w.resources.find((r) => r.id === s.resource);
    if (!r) return 0;
    if (!s.physical) {
      const wet = r.properties?.moisture ?? 0;
      s.physical = {
        unitMass: r.mass,
        unitWater: round(r.mass * wet),
        unitSolids: round(r.mass * (1 - wet)),
      };
    }
    const taken = Math.min(
      mass,
      Math.floor((s.physical.unitSolids * s.quantity) / P.quantum + 1e-6) *
        P.quantum,
    );
    if (taken <= 0) return 0;
    s.physical.unitSolids = round(s.physical.unitSolids - taken / s.quantity);
    s.physical.unitMass = round(s.physical.unitWater + s.physical.unitSolids);
    const old = record(s.processing?.[WEAR_KEY]);
    s.processing = {
      ...(s.processing ?? {}),
      [WEAR_KEY]: {
        revision: REVISION,
        contacts: Number(old?.contacts ?? 0) + Math.round(taken / P.quantum),
        worn: round(Number(old?.worn ?? 0) + taken),
        lastTick: w.tick,
      },
    };
    return round(taken);
  }

  function remaining(w: V7World, j: Dig): number {
    const blank = reserved(w, j),
      t = blank ? toolOf(blank) : null;
    if (!t) return 0;
    const need = Math.ceil(
      quantaTo(t.end, P.release * t.end.diameter) / P.passes,
    );
    return Math.max(0, Math.min(P.segment - j.segment, need));
  }
  function result(c: V7ActionContext, j: Dig): V7HandlerResult {
    j.remainingWork = remaining(c.world, j);
    j.initialWork = j.completedWork + j.remainingWork;
    sync(c.actor, j);
    const writes = [j.id, j.blank, ...j.outputs];
    return j.remainingWork > 0 && isOpen(j)
      ? { complete: false, remaining: j.remainingWork, writes }
      : { complete: true, remaining: 0, writes };
  }
  /** Records a pause before any charge; completed strokes, the blank and debris remain. */
  function pause(c: V7ActionContext, j: Dig, reason: string) {
    j.status = 'paused';
    j.reason = reason;
    j.pausedAt = c.world.tick;
    j.phase = 'paused';
    c.emit(
      'digging-tool-paused',
      `${reason} The work is paused; completed strokes, the reserved piece and the dust remain.`,
      summary(c.world, j, { result: reason }),
      j.id,
    );
    sync(c.actor, j);
    return {
      complete: true,
      remaining: 0,
      writes: [j.id, j.blank, ...j.outputs],
    };
  }
  /** Ends open work whose reserved piece is gone; nothing is refunded. */
  function lost(w: V7World, a: V7Actor, j: Dig, reason: string) {
    j.escrow = reserved(w, j) ? [j.blank] : [];
    workStop(w, a, j, reason, false);
    j.stage = 'failed';
    j.phase = 'done';
    j.endedAt = w.tick;
    forestEvent(
      w,
      'digging-tool-failed',
      `${reason} The work ended; nothing is refunded.`,
      a.position,
      a.id,
      { ...summary(w, j), cause: 'piece lost' },
      j.id,
    );
    j.escrow = [];
    sync(a, j);
  }
  /** Releases the piece to its owner and settles the work. */
  function finish(
    c: V7ActionContext,
    j: Dig,
    outcome: string,
    type: string,
    extra: V7Data = {},
  ) {
    const { world: w, actor: a } = c;
    const s = reserved(w, j);
    if (s) {
      delete s.reservedFor;
      s.owner = a.id;
      s.position = { ...a.position };
    }
    j.status = 'completed';
    j.stage = 'completed';
    j.phase = 'done';
    j.reason = outcome;
    j.endedAt = w.tick;
    j.remainingWork = 0;
    j.initialWork = j.completedWork;
    j.escrow = [];
    c.emit(
      type,
      `Work ${j.id} ended: ${outcome}`,
      { ...summary(w, j, extra), outcome },
      j.blank,
    );
    sync(a, j);
    return {
      complete: true,
      remaining: 0,
      writes: [j.id, j.blank, ...j.outputs],
    };
  }

  /** One paid abrasion stroke of the reserved end against the pinned surface. */
  function abrade(
    c: V7ActionContext,
    j: Dig,
    g: Gear,
    blank: V7Stack,
    fresh: boolean,
  ): V7HandlerResult {
    const { world: w, actor: a } = c;
    const t = toolOf(blank);
    const r = w.resources.find((r) => r.id === blank.resource);
    if (!t || !r) throw new Error('Invalid digging work record.');
    const resumed = j.pausedAt !== null;
    if (fresh) j.segment = 0;
    j.remainingWork = Math.max(1, j.remainingWork);
    j.initialWork = j.completedWork + j.remainingWork;
    if (!workPay(c, j, P.strokeEnergy))
      throw new Error('Energy changed before the paid stroke.');
    a.vitals.energy = round(Math.max(0, a.vitals.energy));
    j.paidEnergy = round(j.paidEnergy);
    j.x = a.position.x;
    j.y = a.position.y;
    if (resumed) {
      j.pausedAt = null;
      c.emit(
        'digging-tool-resumed',
        'The paused work resumed after rechecking the piece, the abrasive, reach and energy.',
        summary(w, j),
        j.id,
      );
    }
    j.strokes += 1;
    j.segment += 1;
    j.phase = j.plan;
    const before = { ...t.end };
    const contact = rub(massOf(w, blank), hardness(r), hardness(g.material));
    const woodQuanta = contact.wood
      ? Math.min(P.passes, quantaTo(t.end, P.floor * t.end.diameter))
      : 0;
    const woodMass = round(woodQuanta * P.quantum);
    const at = { x: j.x, y: j.y };
    let debris: string | null = null;
    if (woodQuanta > 0) {
      t.end = abradedEnd(t.end, woodMass / P.density);
      t.mass.shaping = round(t.mass.shaping + woodMass);
      setMass(w, blank, left(t));
      debris = deposit(
        w,
        j.outputs,
        j.id,
        WOOD_DEBRIS,
        woodQuanta,
        blank,
        at,
        'wood dust and shavings abraded from the end',
      );
      j.removed = round(j.removed + woodMass);
    }
    let grit = 0,
      gritItem: string | null = null;
    if (contact.abrasive) {
      grit = g.item ? wearAbrasive(w, g.item, P.passes * P.quantum) : 0;
      if (grit > 0 && g.item)
        gritItem = deposit(
          w,
          j.outputs,
          j.id,
          GRIT_DEBRIS,
          Math.round(grit / P.quantum),
          g.item,
          at,
          'grit worn from the abrasive face',
        );
      // An outcrop's own mass is not represented: its wear is recorded in the ledger only.
      j.abrasiveWorn = round(
        j.abrasiveWorn + (g.item ? grit : P.passes * P.quantum),
      );
    }
    if (j.plan === 'maintain') t.strokes.maintenance += 1;
    else t.strokes.shaping += 1;
    setTool(blank, t);
    const end = endView(t.end);
    const shown = {
      phase: woodQuanta > 0 ? 'abrasion contact' : 'contact without removal',
      pose: 'rubbing the end of the piece against the abrasive face',
      endBefore: v7Json(before),
      end,
      visibleCondition: toolState(t),
      debrisMass: woodMass,
      abrasiveWear: grit,
      evidence: `${j.id}:stroke-${String(j.strokes)}`,
    };
    const data = {
      ...summary(w, j, shown),
      energy: P.strokeEnergy,
      removed: woodMass,
      debrisItem: debris,
      abrasiveWear: g.item ? grit : contact.abrasive ? P.passes * P.quantum : 0,
      abrasiveMassRepresented: g.kind === 'item',
      ledger: v7Json({ ...t.mass, now: left(t) }),
    };
    if (woodQuanta > 0)
      c.emit(
        'digging-tool-abraded',
        `One stroke of 100 passes against ${g.id} took ${String(woodMass)} kg of wood off the end of ${blank.id} as dust beside you; the tip is now ${String(round(t.end.tip))} m across.`,
        data,
        blank.id,
      );
    else
      c.emit(
        'digging-tool-no-removal',
        `One stroke against ${g.id} removed no wood: the surface did not abrade the end of ${blank.id}.`,
        data,
        blank.id,
      );
    if (contact.abrasive)
      c.emit(
        'digging-tool-abrasive-wear',
        `The abrasive face wore: ${g.item ? `${g.id} lost ${String(grit)} kg as grit beside you` : `${g.id} was marked; its mass is not represented`}.`,
        { ...data, gritItem },
        g.id,
      );
    openRemember(c, {
      key: `${r.id}:end-abrasion:on-${g.material.id}:${woodQuanta > 0 ? 'removes-wood' : 'no-removal'}`,
      subject: r.id,
      property: 'response of a wooden end to one abrasion stroke',
      value: {
        abrasive: g.id,
        removed: woodMass,
        tip: round(t.end.tip),
        abrasiveWear: data.abrasiveWear,
      },
      method: 'one stroke of controlled abrasion against a surface',
      condition: `${g.kind === 'object' ? 'surface in reach' : 'own piece on firm ground'}; by hand and eye`,
      verified: true,
    });
    if (woodQuanta === 0)
      return finish(
        c,
        j,
        contact.wood
          ? `the tip is already at the finest digging point (${String(P.floor)} of the diameter). The piece returned as it now is.`
          : `${g.id} did not abrade the wood; further strokes against it would not change the end. The piece returned as it now is.`,
        'digging-tool-ended',
        { result: 'no removal' },
      );
    if (meets(t.end)) {
      const was = t.status;
      t.status = 'shaped';
      if (was === 'broken') {
        t.condition = 'sound';
        t.cracks = 0;
      }
      t.work = null;
      setTool(blank, t);
      return finish(
        c,
        j,
        `the measured end (tip ${String(round(t.end.tip))} m, taper ${String(round(t.end.region))} m, shaft ${String(round(t.end.length - t.end.region))} m) meets the declared criterion; ${blank.id} is released: ${toolState(t)}.`,
        j.plan === 'maintain'
          ? 'digging-tool-maintained'
          : 'digging-tool-released',
        {
          phase: 'completed geometry',
          finishedEnd: true,
          end: endView(t.end),
          visibleCondition: toolState(t),
          result: 'end criterion met',
        },
      );
    }
    if (j.segment >= P.segment)
      return pause(
        c,
        j,
        `This segment's ${String(P.segment)} strokes are done and the end does not yet meet the criterion; resume work ${j.id} for another segment.`,
      );
    return result(c, j);
  }

  /** The next stroke of open work, after rechecks. A fresh start or explicit continuation
   * refuses at no cost; a continuing round pauses at no charge. */
  function proceed(
    c: V7ActionContext,
    j: Dig,
    fresh: boolean,
  ): V7HandlerResult {
    const { world: w, actor: a } = c;
    const halt = (problem: string) => {
      if (fresh) throw nothing(problem);
      return pause(c, j, problem);
    };
    const blank = reserved(w, j);
    if (!blank) {
      lost(w, a, j, 'The reserved piece is gone.');
      return { complete: true, remaining: 0, writes: [j.id] };
    }
    const g = gearOf(c, j.abrasive, [j.blank]);
    if (typeof g === 'string') return halt(g);
    if (a.vitals.energy + 1e-8 < P.strokeEnergy)
      return halt(`A stroke needs ${String(P.strokeEnergy)} energy.`);
    return abrade(c, j, g, blank, fresh);
  }

  /** The person's own work named by workId, else their one open work. */
  function named(c: V7ActionContext): Dig | undefined {
    const workId = text(c.action.args.workId);
    if (!workId) return current(c.world, c.actor);
    const j = works(c.world).find(
      (j) => j.id === workId && j.owner === c.actor.id,
    );
    if (!j) throw nothing('No digging-tool work of yours has this workId.');
    if (!isOpen(j)) throw nothing(`Work ${j.id} is already settled.`);
    return j;
  }

  function work(c: V7ActionContext, plan: Plan): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const open = named(c);
    if (open) {
      const target = text(action.args.target);
      if (
        open.plan !== plan ||
        (target && target !== open.source && target !== open.blank) ||
        action.args.quoteOnly === true ||
        (action.args.quantity !== undefined &&
          action.args.quantity !== open.quantity)
      )
        throw nothing(
          `Your work ${open.id} (${open.plan}) is still open; resume, pause or cancel it.`,
        );
      if (
        text(action.args.abrasive) &&
        text(action.args.abrasive) !== open.abrasive
      )
        throw nothing(
          `The abrasive of work ${open.id} is pinned to ${open.abrasive}.`,
        );
      return proceed(c, open, open.status === 'paused');
    }
    if (!text(action.args.target))
      throw nothing('Give target: one of your own wooden items.');
    const t = targetOf(c, plan);
    const g = gearOf(c, text(action.args.abrasive), [t.s.id]);
    if (typeof g === 'string') throw nothing(g);
    if (a.vitals.energy + 1e-8 < P.strokeEnergy)
      throw nothing(`The first stroke needs ${String(P.strokeEnergy)} energy.`);
    const quote = quoteOf(plan, t.s, t.q, t.tool, g);
    if (action.args.quoteOnly === true) {
      c.emit(
        'digging-tool-quoted',
        `Quote for ${plan} of ${String(t.q / 10)} of ${t.s.id} against ${g.id}: ${String(Number(quote.strokes))} strokes, ${String(Number(quote.segments))} segments and ${String(Number(quote.energy))} energy if the surface abrades this wood; nothing was reserved or spent.`,
        {
          quote,
          view: view(w, a, plan, 'quote', {
            target: t.s.id,
            abrasive: g.id,
            result: 'quoted',
          }),
        },
        t.s.id,
      );
      return { complete: true, remaining: 0, writes: [] };
    }
    return proceed(c, begin(c, plan, t, g, quote), true);
  }

  /** The patch at a requested soil point, snapped to the patch grid, or a refusal. */
  function patchAt(c: V7ActionContext) {
    const { world: w, actor: a, action } = c;
    if (action.args.x === undefined || action.args.y === undefined)
      throw nothing('Give x and y: a soil point within your reach.');
    const x = v7Number(action.args.x, 'x'),
      y = v7Number(action.args.y, 'y');
    const centre = {
      x: round(Math.round(x / P.grid) * P.grid),
      y: round(Math.round(y / P.grid) * P.grid),
    };
    const spatial: V7Spatial = {
      ...centre,
      angle: 0,
      shape: { kind: 'circle', radius: P.radius },
      solid: false,
      interaction: w.config.interaction,
      entrances: [],
    };
    if (!v7Inside(w, centre, P.radius))
      throw nothing('The patch lies outside the world.');
    if (!v7Reach(a, spatial) || !v7Visible(w, a.position, centre))
      throw nothing(
        `The patch centred at ${String(centre.x)}, ${String(centre.y)} is out of reach.`,
      );
    const blocked = w.objects.find(
      (o) => v7ShapeDistance(centre, o.spatial) < P.radius,
    );
    if (blocked)
      throw nothing(
        `The patch overlaps ${blocked.id}; choose ground clear of objects and plants.`,
      );
    const key = `${PATCH_KEY}:${String(centre.x)}:${String(centre.y)}`;
    const old = record(w.state[key]) as Patch | null;
    return { centre, key, old, soil: soilOf(w, centre) };
  }
  function patchView(p: Patch | null): V7Data | null {
    if (!p) return null;
    const area = Math.PI * p.radius * p.radius;
    return {
      x: p.x,
      y: p.y,
      ground: p.ground,
      holeDepth: round(p.displaced / 1e6 / area),
      displaced: round(p.displaced / 1e6),
      heap: { x: p.heap.x, y: p.heap.y, volume: round(p.heap.volume / 1e6) },
      looseLeft: round((p.looseVolume - p.displaced) / 1e6),
      strokes: p.strokes,
      balanced: p.displaced === p.heap.volume,
    };
  }

  /** One paid use stroke of an own shaped tool on a reachable soil patch. */
  function use(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const s = w.stacks.find((s) => s.id === text(action.args.target));
    if (!s || s.owner !== a.id)
      throw nothing('Give target: your own shaped digging tool.');
    if (s.reservedFor)
      throw nothing(`${s.id} is reserved for unfinished work.`);
    const t = toolOf(s);
    const r = w.resources.find((r) => r.id === s.resource);
    if (!t || !r)
      throw nothing(`${s.id} is not a digging tool shaped by this operation.`);
    if (t.status === 'unfinished')
      throw nothing(`${s.id} is an unfinished blank; finish shaping it first.`);
    if (t.status === 'broken')
      throw nothing(
        `The working end of ${s.id} is broken; maintain it before use.`,
      );
    const load =
      action.args.load === undefined
        ? P.defaultLoad
        : v7Number(action.args.load, 'load', 0.05, 1);
    const p = patchAt(c);
    if (a.vitals.energy + 1e-8 < P.strokeEnergy)
      throw nothing(`A use stroke needs ${String(P.strokeEnergy)} energy.`);
    v7Spend(a, P.strokeEnergy);
    const before = { ...t.end };
    const strength =
      openMaterial(r).strength * (t.condition === 'cracked' ? P.cracked : 1);
    const band = `load-band-${String(Math.floor(load * 3))}`;
    let outcome = 'displaced',
      reason: string | null = null,
      cm3 = 0,
      depth = 0,
      dust = 0,
      fragment: string | null = null;
    t.strokes.use += 1;
    let patch: Patch | null = p.old;
    if (load > strength + 1e-9) {
      // open.probe press rule: the wood does not hold a load above its strength.
      if (t.condition === 'sound') {
        outcome = 'split';
        reason = 'the end split along the grain under the load';
        t.condition = 'cracked';
        t.cracks += 1;
      } else {
        outcome = 'broke';
        reason = 'the split end broke off under the load';
        const volume =
          (Math.PI *
            t.end.taper *
            (t.end.diameter ** 2 +
              t.end.diameter * t.end.tip +
              t.end.tip ** 2)) /
          12;
        const quanta = Math.min(
          Math.round((volume * P.density) / P.quantum),
          Math.floor(left(t) / P.quantum),
        );
        t.mass.fragments = round(t.mass.fragments + quanta * P.quantum);
        t.end = {
          ...t.end,
          length: round(t.end.length - t.end.taper),
          taper: t.end.region,
          tip: t.end.diameter,
        };
        t.status = 'broken';
        t.condition = 'broken';
        t.cracks = 0;
        setMass(w, s, left(t));
        if (quanta > 0)
          fragment = deposit(
            w,
            [],
            `${s.id}:use-${String(t.strokes.use)}`,
            WOOD_DEBRIS,
            quanta,
            s,
            p.centre,
            'broken-off working end',
          );
      }
    } else if (p.soil.water) {
      outcome = 'no-displacement';
      reason = p.soil.reason;
    } else {
      // Ground contact: grit or rock wears the tip by the scratch rule (both harder than wood).
      const quanta = Math.min(P.useWear, Math.floor(left(t) / P.quantum));
      dust = round(quanta * P.quantum);
      if (dust > 0) {
        t.mass.use = round(t.mass.use + dust);
        t.end = wornEnd(t.end, dust / P.density);
        setMass(w, s, left(t));
      }
      const area = Math.PI * P.radius * P.radius;
      const looseVolume =
        P.resistance[p.soil.k.ground] === undefined
          ? 0
          : Math.floor(area * P.looseDepth * 1e6);
      patch ??= {
        x: p.centre.x,
        y: p.centre.y,
        radius: P.radius,
        ground: p.soil.name,
        looseVolume,
        displaced: 0,
        heap: { ...heapAt(a.position, p.centre), volume: 0 },
        strokes: 0,
        toolDust: 0,
        lastTick: w.tick,
      };
      const looseLeft = patch.looseVolume - patch.displaced;
      const deep = P.looseDepth - patch.displaced / 1e6 / area;
      if (p.soil.reason) reason = p.soil.reason;
      else if (looseLeft <= 0 || deep <= 1e-9)
        reason =
          'the loose surface layer of this patch is used up; the firmer ground below is not dug';
      else {
        const force = load * P.fullLoad;
        const bearing = Math.sqrt((4 * force) / (Math.PI * p.soil.resistance));
        const e = before;
        depth =
          bearing <= e.tip
            ? 0
            : bearing >= e.diameter
              ? deep
              : Math.min(
                  deep,
                  (e.taper * (bearing - e.tip)) / (e.diameter - e.tip),
                );
        const levered = (P.jabs * Math.PI * depth ** 3) / 3;
        cm3 = Math.max(
          0,
          Math.min(P.cap, looseLeft, Math.floor(levered * 1e6 + 1e-6)),
        );
        if (depth <= 0)
          reason = 'the end is too blunt to enter this soil at this load';
        else if (cm3 <= 0)
          reason = 'the end entered too shallowly to lever soil out';
      }
      if (cm3 <= 0) outcome = 'no-displacement';
      patch.displaced += cm3;
      patch.heap = { ...patch.heap, volume: patch.heap.volume + cm3 };
      patch.strokes += 1;
      patch.toolDust = round(patch.toolDust + dust);
      patch.lastTick = w.tick;
      w.state[p.key] = v7Json(patch);
    }
    const volume = round(cm3 / 1e6);
    t.displaced = round(t.displaced + volume);
    const first = cm3 > 0 && !t.verified;
    setTool(s, t);
    const shown = view(
      w,
      a,
      'use',
      cm3 > 0 ? 'soil displacement' : 'failed soil stroke',
      {
        target: s.id,
        material: s.resource,
        patch: patchView(patch) ?? {
          x: p.centre.x,
          y: p.centre.y,
          ground: p.soil.name,
        },
        load,
        penetration: round(depth),
        displaced: volume,
        displacedEarth: cm3 > 0,
        endBefore: v7Json(before),
        end: endView(t.end),
        visibleCondition: toolState(t),
        tipWear: dust,
        fragment,
        result: reason ?? 'soil moved to the heap',
        pose: 'pressing and levering the end into the patch',
      },
    );
    const data: V7Data = {
      tool: s.id,
      patch: p.key,
      ground: p.soil.name,
      moisture: p.soil.k.moisture,
      load,
      outcome,
      reason,
      penetration: round(depth),
      displaced: volume,
      tipWear: dust,
      fragment,
      energy: P.strokeEnergy,
      condition: condition(t, s),
      soil: patchView(patch),
      ledger: v7Json({ ...t.mass, now: left(t) }),
      view: shown,
    };
    c.emit(
      'digging-tool-stroke',
      `One use stroke of ${s.id} at load ${String(load)} on the ${p.soil.name} patch at ${String(p.centre.x)}, ${String(p.centre.y)}.`,
      data,
      s.id,
    );
    if (outcome === 'split')
      c.emit(
        'digging-tool-cracked',
        `The end of ${s.id} split under load ${String(load)}; nothing was displaced. A split end holds half the load and abrasion cannot heal it.`,
        data,
        s.id,
      );
    if (outcome === 'broke')
      c.emit(
        'digging-tool-broke',
        `The split end of ${s.id} broke off under load ${String(load)}; the fragment lies at the patch as ${fragment ?? ''}. The piece has a flat broken end and must be maintained before use.`,
        data,
        s.id,
      );
    if (cm3 > 0)
      c.emit(
        'digging-tool-displaced',
        `${String(volume)} m3 of loose surface soil was levered out of the patch onto the heap beside it (patch total ${String(round((patch?.displaced ?? 0) / 1e6))} m3).`,
        data,
        p.key,
      );
    else
      c.emit(
        'digging-tool-no-displacement',
        `No soil was displaced: ${reason ?? 'no contact'}.`,
        data,
        p.key,
      );
    if (first) {
      t.verified = true;
      t.verifiedAt = w.tick;
      t.evidence = w.events.at(-1)?.id ?? null;
      setTool(s, t);
      c.emit(
        'digging-tool-use-verified',
        `${s.id} is now a use-verified digging tool: an actual stroke displaced ${String(volume)} m3 of soil.`,
        { ...data, condition: condition(t, s) },
        s.id,
      );
    }
    openRemember(c, {
      key: `${r.id}:digging-stroke:${p.soil.name.replace(' ', '-')}:${band}:${outcome}`,
      subject: r.id,
      property: 'soil displaced by one stroke of a shaped wooden end',
      value: {
        tool: s.id,
        ground: p.soil.name,
        load,
        penetration: round(depth),
        displaced: volume,
        outcome,
        reason,
      },
      method: 'one paid press-and-lever stroke on a soil patch',
      condition: `${p.soil.name}, ${p.soil.k.regime}; ${band}`,
      verified: true,
    });
    return {
      complete: true,
      writes: [s.id, p.key, ...(fragment ? [fragment] : [])],
    };
  }
  function heapAt(from: V7Point, centre: V7Point): V7Point {
    const dx = from.x - centre.x,
      dy = from.y - centre.y,
      n = Math.hypot(dx, dy);
    return n < 1e-9
      ? { x: round(centre.x + P.heap), y: centre.y }
      : {
          x: round(centre.x + (P.heap * dx) / n),
          y: round(centre.y + (P.heap * dy) / n),
        };
  }

  /** A paid local look at an own piece or tool and/or a reachable soil patch. */
  function inspect(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a, action } = c;
    const ref = text(action.args.target);
    let piece: V7Data | null = null,
      item: V7Stack | undefined;
    if (ref) {
      item = w.stacks.find((s) => s.id === ref);
      if (!item || item.owner !== a.id)
        throw nothing('Inspect one of your own items, or a soil point.');
      const r = collectiveFoodProfile(w, item);
      const problem = woodProblem(r);
      if (problem) throw nothing(problem);
      const t = toolOf(item);
      const rod = smallFireRod(w, item);
      const whole = Math.floor(item.quantity + 1e-9);
      const rest = round(item.quantity - whole);
      const contact = ex19MaterialContact(w, item);
      const minimum = Math.ceil(
        ((P.taper * rod.diameter + P.shaft) / rod.length) * 10 - 1e-9,
      );
      piece = t
        ? condition(t, item)
        : {
            item: item.id,
            state: 'unworked stock',
            pieces: {
              whole,
              wholeLength: rod.length,
              rest: rest > 0 ? round(rest * rod.length) : 0,
            },
            diameter: rod.diameter,
            ends: 'flat broken ends',
            condition: contact.fractured ? 'fractured' : 'sound, no split seen',
            achievableEnd: {
              taperLength: round(P.taper * rod.diameter),
              tipAtMost: round(P.release * rod.diameter),
              shaftAtLeast: P.shaft,
              smallestPiece: minimum / 10,
              possibleHere: Math.min(10, foodTenths(item.quantity)) >= minimum,
            },
          };
    }
    const patch =
      action.args.x !== undefined || action.args.y !== undefined
        ? patchAt(c)
        : null;
    if (!piece && !patch)
      throw nothing('Give target (your own item) or x and y (a soil point).');
    v7Spend(a, P.inspectEnergy);
    const soil = patch
      ? {
          key: patch.key,
          ground: patch.soil.name,
          moisture: patch.soil.k.moisture,
          waterlogging: patch.soil.k.waterlogging,
          yielding: patch.soil.reason === null,
          reason: patch.soil.reason,
          looseDepth: P.looseDepth,
          dug: patchView(patch.old),
        }
      : null;
    const data: V7Data = {
      piece,
      soil,
      energy: P.inspectEnergy,
      view: view(w, a, 'inspect', 'inspection', {
        target: item?.id ?? null,
        patch: soil ? v7Json(soil) : null,
        result: 'observed',
      }),
    };
    c.emit(
      'digging-tool-inspected',
      `Inspected ${[item?.id, patch?.key].filter(Boolean).join(' and ')} by hand and eye.`,
      data,
      item?.id ?? patch?.key ?? null,
    );
    openRemember(c, {
      key: `${item?.id ?? patch?.key ?? ''}:digging-inspection`,
      subject: item?.resource ?? 'soil',
      property: 'dimensions, condition and soil seen and felt',
      value: v7Json({ piece, soil }),
      method: 'direct look and touch',
      condition: 'current local conditions',
      verified: false,
    });
    return { complete: true, writes: [] };
  }

  function resume(c: V7ActionContext): V7HandlerResult {
    const j = named(c);
    if (!j) throw nothing('You have no open digging-tool work to resume.');
    return proceed(c, j, true);
  }
  function pauseMode(c: V7ActionContext): V7HandlerResult {
    const j = named(c);
    if (!j) throw nothing('You have no open digging-tool work to pause.');
    if (j.status === 'paused') throw nothing(`Work ${j.id} is already paused.`);
    return pause(c, j, 'Paused on request.');
  }
  function cancel(c: V7ActionContext): V7HandlerResult {
    const { world: w, actor: a } = c;
    const j = named(c);
    if (!j) throw nothing('You have no open digging-tool work to cancel.');
    const s = reserved(w, j);
    j.escrow = s ? [s.id] : [];
    j.x = a.position.x;
    j.y = a.position.y;
    workStop(
      w,
      a,
      j,
      'Work cancelled; the piece returns to you as it now is. Spent energy, time, removed wood and wear are not refunded.',
      false,
    );
    j.stage = 'cancelled';
    j.phase = 'done';
    j.endedAt = w.tick;
    c.emit(
      'digging-tool-cancelled',
      `Work cancelled. ${s ? `${s.id} returned to you as it now is` : 'No reserved piece was left'}; the dust stays where it fell.`,
      { ...summary(w, j, { result: 'cancelled' }), released: s ? [s.id] : [] },
      j.id,
    );
    j.escrow = [];
    sync(a, j);
    return { complete: true, remaining: 0, writes: [j.id, j.blank] };
  }

  function execute(c: V7ActionContext): V7HandlerResult {
    if (c.actor.vitals.health <= 0)
      throw nothing('Only a living person can work.');
    const mode = text(c.action.args.mode);
    if ((PLANS as readonly string[]).includes(mode))
      return work(c, mode as Plan);
    if (mode === 'use') return use(c);
    if (mode === 'inspect') return inspect(c);
    if (mode === 'resume') return resume(c);
    if (mode === 'pause') return pauseMode(c);
    if (mode === 'cancel') return cancel(c);
    throw nothing(`Give mode: ${MODES.join(', ')}.`);
  }

  /** A vanished piece ends the work; reserved pieces stay with their owner; a round without a
   * paid stroke pauses the work at no charge. Nothing runs by itself. */
  function environment(w: V7World) {
    for (const j of works(w).filter(isOpen)) {
      const a = w.actors.find((a) => a.id === j.owner);
      if (!a || a.vitals.health <= 0) continue;
      const s = reserved(w, j);
      if (!s) {
        lost(w, a, j, 'The reserved piece is gone.');
        continue;
      }
      s.position = { ...a.position };
      if (j.status === 'active' && j.lastPaid < w.tick) {
        j.status = 'paused';
        j.pausedAt = w.tick;
        j.phase = 'paused';
        j.reason = `No stroke was made this round; the work waits. Resume work ${j.id}, or cancel it.`;
        forestEvent(
          w,
          'digging-tool-paused',
          'The work paused because no stroke was made this round; the piece and the dust remain and nothing was charged.',
          a.position,
          a.id,
          summary(w, j, { result: 'paused: no stroke this round' }),
          j.id,
        );
      }
      sync(a, j);
    }
  }

  return {
    id,
    version: 1,
    scope,
    dependencies: ['foundation-open@1'],
    description:
      'Shaping of an owned wooden piece into a blunt digging point by controlled abrasion against a hard rough surface, with conserved wood dust on the ground and scratch-rule abrasive wear, release only when the measured end meets a declared criterion, and use strokes that lever a bounded volume of loose surface soil from a reachable patch into a heap beside it, resolved from the end geometry, the soil resistance and the load.',
    reuse: {
      experiment:
        'open-hardness-physics scratchStroke contact rule, 0.0001 kg dust quantum and its pressure predicate (re-applied, not called); ex21 small-combustion-source@1 declared rod geometry (smallFireRod, 900 kg/m3, 25 diameters), grip, rigidity and 0.3 m length bounds and 21.6 kJ per energy, and its granular and plastic cover materials; foundation-open@1 open.probe press rule (strength = hardness / 10) and openRemember; ex19 shell-compression-opening@1 and cutting-edge-assessment@1 shared piece, contact and firm-ground checks; ex22 draw-from-observation@1 yielding-ground classes (forest floor and meadow yield; rocky ground, wet bank and waterlogged soil do not); ex23 rooted-plant-watering@1 root-zone depth 0.15 m; ex23 crack-and-separate-casing@1 work lifecycle, pinned gear, wear record and ledger pattern',
      source:
        'open-hardness-physics.ts (rules re-applied); long-ex21-small-combustion-physics.ts (SMALL_FIRE, SMALL_FIRE_COVERS, smallFireRod); long-ex19-material-contact.ts (ex19MaterialPiece, ex19MaterialContact, ex19MaterialGround); open-physical.ts (openConditions, openMaterial); open-foundation.ts (openRemember); collective-work.ts (workCreate, workAllocations, workReserve, workPay, workStop, collectiveJobs); forest-food-accounting.ts; collective-food-profile.ts; continuous-geometry.ts',
      description:
        'Implementation reuse only; every existing package, the ex23 rooted-plant-watering@1 and crack-and-separate-casing@1 packages included, is unchanged and no ability, item or mastery is inherited. New: per-stroke wood removal and end geometry, wood dust and abrasive grit items, the release criterion, maintenance, soil patches with a conserved heap of moved soil, penetration from end geometry, load and soil resistance, tip wear, split and broken ends, quote, pause, resume, cancel and death handling.',
    },
    abilities: [
      {
        id,
        name: 'Shape and use a wooden digging tool',
        function:
          'Rub the end of your own wooden piece, such as a branch, into a blunt digging point on a hard rough surface, then use it to lever small amounts of loose surface soil out of a patch within reach.',
        equivalence: 'material:wood-end-abrasion-soil-displacement:1',
        parameters: {
          ...v7ObjectSchema({
            mode: { type: 'string', enum: [...MODES] },
            target: { type: 'string' },
            quantity: { type: 'number', minimum: 0.1, maximum: 1 },
            abrasive: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            load: { type: 'number', minimum: 0.05, maximum: 1 },
            workId: { type: 'string' },
            quoteOnly: { type: 'boolean' },
          }),
          required: ['mode'],
        },
        references: {
          target: 'optional-exact-visible',
          abrasive: 'optional-exact-visible',
        },
        prerequisites: [],
        learning: 4,
        costs:
          'Study: 4 rounds. inspect: 1 round, 0.5 energy; target an own wooden item or tool and/or x, y a soil point in reach. shape: target an own unreserved rigid wooden item; quantity in tenths (default the item, at most 1 unit, one piece); abrasive: a rigid inedible noncombustible surface in reach, e.g. a rock, or your own whole piece of it on firm ground; both pinned to one work (workId). Each stroke: 1 round, 1 energy; at most 4 per segment; resume continues paused work. maintain: the same strokes on your own shaped or broken tool. use: target your shaped tool; x, y a soil point in reach; load 0.05-1 (default 0.25); 1 round, 1 energy. quoteOnly true quotes shape or maintain free. pause, resume, cancel: no energy. Refusals cost nothing; failed rechecks pause work free. Travel and getting a stone are separate.',
        effects:
          "A whole branch unit is a 0.04 m by 0.99 m green-wood rod; a piece is that part of it. A stroke is 100 passes; by the scratch rule a surface no harder than the other loses 0.0001 kg per pass, so the end loses up to 0.01 kg as dust beside you (piece plus dust equals input). The end tapers over 3 diameters; release needs a tip at most 0.35 diameter and a 0.3 m shaft (a whole branch: about 7 strokes). A shaped tool is unverified until a stroke moves soil. A use stroke presses and levers 30 times at load x 500 N: the tip enters forest or meadow soil until the soil resistance (higher when drier) bears it and moves up to 0.001 m3 of the patch's loose top 0.15 m into a heap beside it; rock, wet bank, waterlogged soil and water move 0. Ground contact wears 0.0001 kg off the tip. Above strength (hardness/10, half if split) the end splits, then breaks. Cancel returns the piece as it is; death leaves it at the worksite. No edge, fire, water, binding, gathering bonus or reward.",
        handler: HANDLER,
        revision: REVISION,
        authored: false,
        // The release event carries no qualified flag: this operation earns no practice milestone.
        practiceEvidence: 'digging-tool-released',
        dependencies: { abilities: [], resources: [], knowledge: [] },
        execution: {
          duration: null,
          interruption: 'cancel',
          progress:
            'One stroke per paid round, at most 4 per segment; the work, the reserved piece, its end and the pinned abrasive persist.',
        },
      },
    ],
    handlers: { [HANDLER]: execute },
    processes: {},
    visualComponents: [],
    events: [
      'digging-tool-quoted',
      'digging-tool-inspected',
      'digging-tool-started',
      'digging-tool-abraded',
      'digging-tool-no-removal',
      'digging-tool-abrasive-wear',
      'digging-tool-released',
      'digging-tool-maintained',
      'digging-tool-ended',
      'digging-tool-stroke',
      'digging-tool-displaced',
      'digging-tool-no-displacement',
      'digging-tool-use-verified',
      'digging-tool-cracked',
      'digging-tool-broke',
      'digging-tool-paused',
      'digging-tool-resumed',
      'digging-tool-cancelled',
      'digging-tool-failed',
    ],
    resources: [
      {
        id: WOOD_DEBRIS,
        name: 'Abraded wood dust and fragments',
        mass: 0.001,
        nutrition: 0,
        toxicity: 0,
        color: '#b79b72',
      },
      {
        id: GRIT_DEBRIS,
        name: 'Worn abrasive grit',
        mass: 0.001,
        nutrition: 0,
        toxicity: 0,
        color: '#9a9e98',
      },
    ],
    satisfaction: [],
    afterEnvironment: environment,
    onDeath(w, a) {
      for (const j of works(w).filter((j) => j.owner === a.id && isOpen(j))) {
        const s = reserved(w, j);
        j.escrow = s ? [s.id] : [];
        workStop(
          w,
          a,
          j,
          'Performer died; the piece stays at the worksite as it now is. Nothing is refunded or restored.',
          true,
        );
        j.stage = 'failed';
        j.phase = 'done';
        j.endedAt = w.tick;
        forestEvent(
          w,
          'digging-tool-failed',
          'The work ended by death; the piece and the dust were left at the worksite.',
          { x: j.x, y: j.y },
          a.id,
          { ...summary(w, j, { result: 'ended by death' }), cause: 'death' },
          j.id,
        );
        j.escrow = [];
        sync(a, j);
      }
    },
  };
}

/** ex23: Moss's shaping and use of a wooden digging tool. */
export const LONG_EX23_DIGGING_TOOL = diggingToolPackage('long-ex23');
