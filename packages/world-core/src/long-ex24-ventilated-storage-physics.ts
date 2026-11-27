import type {
  V7Data,
  V7Object,
  V7Point,
  V7Spatial,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7RoundNumber } from './continuous-data.js';
import { v7ShapeDistance, v7ShapesOverlap } from './continuous-geometry.js';
import { forestClimate } from './forest-climate.js';
import { foodWaterRead } from './food-water.js';
import { preservationOnTray } from './open-preservation-physics.js';
import { ex19MaterialGround } from './long-ex19-material-contact.js';
import { BRANCH_SCREEN_SOUND } from './long-branch-screen-exposure.js';

/** ex24: the storage-condition modifier of a small open raised branch rack. It is read by the
 * ordinary food decay update (forest-environment) only while this revision is installed, and only
 * for the one food lot an intact rack records as lying on its deck, so every other world and every
 * other stack keeps the ordinary decay unchanged. */
export const VENTILATED_RACK_REVISION = 'prepare-ventilated-food-storage@1';
export const VENTILATED_RACK_KIND = 'ventilated-food-rack';
/** The World Agent specification's declared simulation coefficient: the positive decay increment
 * of compatible intact roots on an intact, clean, not overloaded rack while measured conditions
 * permit passive drying. It is a bounded game value, not a measured shelf life. */
export const VENTILATED_RACK_COEFFICIENT = 0.8;
/** Declared version-1 rack geometry in metres. Local x runs along the crosspieces, across the two
 * supports; local y runs along the supports. */
export const VENTILATED_RACK = {
  /** Centre spacing of the two supports, which is the crosspiece span. */
  span: 0.8,
  /** Centre spacing of the three crosspieces, so a 0.2 m root bears on at least two of them. */
  slat: 0.08,
  /** The deck the food lies on: the span by the crosspiece band; it is the food surface. */
  deck: { length: 0.8, width: 0.2 },
  /** Clear margin around the deck that no solid object may occupy for adequate ventilation. */
  margin: 0.25,
  /** Foods the declared coefficient applies to: whole meadow roots. */
  compatible: ['root'],
  /** The ex15/ex16 sound condition: a piece below it has loosened. */
  sound: BRANCH_SCREEN_SOUND,
} as const;
const R = VENTILATED_RACK;
/** Represented treatments that take precedence over this rack (no stacking of treatments). */
const TREATED = [
  'materialLayer',
  'canopyDrying',
  'frictionKit',
  'waterCup',
  'mantle',
  'fuelMoisture',
  'componentLots',
] as const;
const EPS = 1e-9;

/** One installed piece of the rack, keeping the identity, origin and age of the moved unit. */
export interface RackPiece extends V7Data {
  id: string;
  resource: string;
  origin: string;
  slot: string;
  role: string;
  condition: number;
  installedAt: number;
  sourceOwner: string;
  diameter: number;
  length: number;
  /** Declared central point-load rating over the span, in kg. */
  rating: number;
}

/** The paired storage record of one food lot on a rack: the lot on the deck and its tracked
 * carried control, both split from one stack with the same decay. */
export interface RackLot extends V7Data {
  serial: number;
  lot: string;
  control: string | null;
  source: string;
  resource: string;
  quantity: number;
  controlQuantity: number;
  loadedAt: number;
  loadedBy: string;
  status: string;
  endedAt: number | null;
  decay0: number;
  lotDecay: number;
  controlDecay: number | null;
  controlPresent: boolean;
  /** Water per unit (kg) and water fraction at loading: the composition carried food keeps. */
  water0: number;
  waterFraction0: number;
  /** What the last check compared with: the control, or the lot's own loading state. */
  reference: string;
  /** Last evaluation by the decay update. */
  checkedAt: number;
  ordinary: number;
  applied: number;
  favourable: boolean;
  announced: boolean | null;
  failed: string[];
  temperature: number | null;
  controlTemperature: number | null;
  rain: number;
  wetter: boolean;
  rounds: number;
  ordinaryTotal: number;
  appliedTotal: number;
  /** Accumulated over rounds in which both the lot and its control were tracked. */
  pairRounds: number;
  lotGain: number;
  controlGain: number;
  allowance: number;
  favourableRounds: number;
  rainRounds: number;
  wetRounds: number;
  unequalRounds: number;
  temperatureDifference: number;
  maxTemperatureDifference: number;
  wetted: boolean;
  dried: number;
  comparison: V7Data | null;
}
/** Hidden per-rack accounting; world state never reaches ordinary inputs. */
export interface RackState extends V7Data {
  rack: string;
  serial: number;
  lot: RackLot | null;
  ended: RackLot[];
}
export const rackKey = (id: string) => `ventilated-rack:${id}`;
export function rackState(w: V7World, o: V7Object): RackState {
  const v = w.state[rackKey(o.id)];
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as RackState;
  const fresh: RackState = { rack: o.id, serial: 0, lot: null, ended: [] };
  w.state[rackKey(o.id)] = fresh;
  return fresh;
}
export const rackPieces = (o: V7Object): RackPiece[] =>
  Array.isArray(o.data.pieces) ? (o.data.pieces as unknown as RackPiece[]) : [];

/** World point at local offsets (u along local x, v along local y) of a spatial centre. */
export function rackAt(
  s: { x: number; y: number; angle: number },
  u: number,
  v: number,
): V7Point {
  return {
    x: s.x + u * Math.cos(s.angle) - v * Math.sin(s.angle),
    y: s.y + u * Math.sin(s.angle) + v * Math.cos(s.angle),
  };
}
/** The deck spatial grown by a margin, as a solid test shape. */
export function rackMargin(o: V7Object, margin: number): V7Spatial {
  return {
    ...o.spatial,
    shape: {
      kind: 'rectangle',
      width: R.deck.length + 2 * margin,
      height: R.deck.width + 2 * margin,
    },
    solid: true,
    reserved: true,
    entrances: [],
  };
}
/** Water, shallow water, a wet bank or waterlogged ground under the deck. */
export function rackStandingWater(w: V7World, o: V7Object): boolean {
  return [
    [0, 0],
    [-R.span / 2, -R.deck.width / 2],
    [R.span / 2, -R.deck.width / 2],
    [-R.span / 2, R.deck.width / 2],
    [R.span / 2, R.deck.width / 2],
  ].some(([u = 0, v = 0]) => ex19MaterialGround(w, rackAt(o.spatial, u, v)));
}
/** Measured ventilation: outdoors, moving air and no solid object in the clear margin. */
export function rackVentilation(w: V7World, o: V7Object) {
  const c = forestClimate(w, o.spatial),
    around = rackMargin(o, R.margin),
    blocked = w.objects
      .filter(
        (x) =>
          x.id !== o.id &&
          x.spatial.solid &&
          v7ShapesOverlap(around, x.spatial),
      )
      .map((x) => x.id);
  return {
    outdoors: !c.indoor,
    wind: c.wind ?? 0,
    blocked,
    adequate: !c.indoor && (c.wind ?? 0) > 0 && !blocked.length,
  };
}
/** Pieces present, all sound, and the stability check passed. */
export function rackIntact(o: V7Object): boolean {
  const list = rackPieces(o);
  return (
    o.data.status === 'complete' &&
    list.length === 5 &&
    list.every((p) => p.condition >= R.sound)
  );
}
/** The stack lies unowned on this rack's deck in the food water representation. */
export function rackLying(o: V7Object, s: V7Stack): boolean {
  const surface = foodWaterRead(s)?.surface;
  return (
    s.owner === null &&
    s.quantity > 0 &&
    surface?.kind === 'object' &&
    surface.id === o.id &&
    v7ShapeDistance(s.position, o.spatial) <= 0.01
  );
}
/** Whole, unprepared food without any other represented treatment. */
export function rackIntactFood(s: V7Stack): boolean {
  const r = foodWaterRead(s);
  return (
    !!r &&
    !r.prepared &&
    r.opening === 1 &&
    TREATED.every((k) => s[k] === undefined) &&
    Object.keys(s.processing ?? {}).every((k) => k === 'preservationPhysics')
  );
}
/** Where a stack ages under the ordinary decay update. */
function agingPoint(w: V7World, s: V7Stack): V7Point {
  const owner = w.actors.find((a) => a.id === s.owner);
  return preservationOnTray(s) ? s.position : (owner?.position ?? s.position);
}

/** Every coded storage-condition check for the recorded lot this round. */
export function rackConditions(
  w: V7World,
  o: V7Object,
  record: RackLot,
  s: V7Stack,
  temperature: number,
) {
  const failed: string[] = [],
    reading = foodWaterRead(s),
    last = reading?.last,
    climate = forestClimate(w, o.spatial),
    rain =
      last && last.tick === w.tick
        ? Number(last.rain ?? 0)
        : climate.indoor
          ? 0
          : (climate.rain ?? 0),
    unitMass = s.physical?.unitMass ?? 0,
    control = record.control
      ? w.stacks.find((x) => x.id === record.control && x.quantity > 0)
      : undefined,
    controlReading = control ? foodWaterRead(control) : null,
    controlTemperature = control
      ? forestClimate(w, agingPoint(w, control)).temperature
      : null;
  if (!rackIntact(o)) failed.push('rack not intact');
  if (!rackLying(o, s)) failed.push('food not lying on the deck');
  if (
    !(R.compatible as readonly string[]).includes(s.resource) ||
    !rackIntactFood(s)
  )
    failed.push('not compatible intact roots');
  if (
    s.quantity > Number(o.data.capacity ?? 0) + EPS ||
    s.quantity * unitMass > Number(o.data.rating ?? 0) + EPS
  )
    failed.push('overloaded');
  if (rain > 0) failed.push('rain');
  if (rackStandingWater(w, o)) failed.push('standing water');
  if (!rackVentilation(w, o).adequate) failed.push('inadequate ventilation');
  if (
    w.stacks.some(
      (x) =>
        x.id !== s.id &&
        x.owner === null &&
        x.quantity > 0 &&
        v7ShapeDistance(x.position, o.spatial) <= 0.01,
    )
  )
    failed.push('other material on the deck');
  // The ordinary-storage comparison: the tracked carried control while it exists; without one,
  // or once it is gone, the lot's own tracked loading state (the water
  // content carried or ground-stored food keeps under the representation) and the air at the
  // rack, which ordinary storage beside it would share.
  const reference =
      control && controlReading
        ? {
            basis: 'control',
            water: controlReading.waterFraction,
            temperature: controlTemperature ?? temperature,
          }
        : {
            basis: 'loading state',
            water: record.waterFraction0,
            temperature,
          },
    wetter = !!reading && reading.waterFraction > reference.water + EPS;
  if (!reading) failed.push('food water unknown');
  if (wetter) failed.push(`wetter than the ${reference.basis}`);
  if (temperature > reference.temperature + EPS)
    failed.push(`warmer than the ${reference.basis}`);
  return {
    favourable: !failed.length,
    failed,
    rain: v7RoundNumber(rain),
    wetter,
    controlTemperature,
    reference: reference.basis,
  };
}

/** The recorded rack and lot for a stack lying in this world, or null. */
function rackOfLot(w: V7World, s: V7Stack) {
  for (const o of w.objects) {
    if (o.kind !== VENTILATED_RACK_KIND) continue;
    const v = w.state[rackKey(o.id)] as RackState | undefined,
      record = v?.lot;
    if (
      record &&
      record.status === 'stored' &&
      record.lot === s.id &&
      w.stacks.find((x) => x.id === s.id) === s
    )
      return { o, record };
  }
  return null;
}

/** Decay hook: the increment the ordinary decay update adds to this stack. Without the revision,
 * or for any stack that is not the recorded lot of a rack, the ordinary increment is returned
 * unchanged. One treatment applies at a time: food with any other represented treatment,
 * preparation or enclosure is not compatible, so the rack never stacks on another modifier. */
export function ventilatedRackDecay(
  w: V7World,
  s: V7Stack,
  increment: number,
  temperature: number,
): number {
  if (!w.revisions.includes(VENTILATED_RACK_REVISION)) return increment;
  const found = rackOfLot(w, s);
  if (!found) return increment;
  const { o, record } = found,
    check = rackConditions(w, o, record, s, temperature),
    applied =
      check.favourable && increment > 0
        ? increment * VENTILATED_RACK_COEFFICIENT
        : increment;
  Object.assign(record, {
    checkedAt: w.tick,
    ordinary: increment,
    applied,
    favourable: check.favourable,
    failed: check.failed,
    temperature,
    controlTemperature: check.controlTemperature,
    rain: check.rain,
    wetter: check.wetter,
    reference: check.reference,
    rounds: record.rounds + 1,
    ordinaryTotal: record.ordinaryTotal + increment,
    appliedTotal: record.appliedTotal + applied,
  });
  return applied;
}
