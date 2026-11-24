import type { V7Data, V7Stack, V7World } from './continuous-types.js';
import {
  foodSurfaceOccupied,
  foodSurfaceRelease,
  preservationInitialize,
  preservationPhysics,
  preservationRate,
} from './open-preservation-physics.js';
import type { PreservationPhysics } from './open-preservation-physics.js';
import { foodGroundArea, foodObjectArea } from './food-water-surface.js';
import type { FoodWaterSurface } from './food-water-surface.js';

export type {
  FoodGroundFootprint,
  FoodWaterSurface,
} from './food-water-surface.js';
export type { PreservationPhysics } from './open-preservation-physics.js';

/** General food water-content representation: ex10's reviewed moisture model
 * (open-preservation-physics) without its tray apparatus, packages or interfaces. It is
 * installed by the `foodWater` world-state flag and adds no interface: packages developed
 * later call these functions after their own reach, ownership and cost checks. The per-tick
 * exchange and the decay rate then follow the ex10 equations unchanged. */
export function foodWaterActive(w: V7World): boolean {
  return w.state.foodWater === 1;
}
function required(w: V7World): void {
  if (!foodWaterActive(w))
    throw new Error('This world has no food water representation.');
}

/** Current state of one food stack in the representation; serializable as event data. */
export type FoodWaterReading = {
  sample: string;
  resource: string;
  quantity: number;
  /** Water mass over total mass of the food now. */
  waterFraction: number;
  /** Current over initial per-unit mass. */
  massRatio: number;
  /** Exposed area at the last evaluation; 0 when unexposed, obstructed or occupied. */
  area: number;
  prepared: boolean;
  /** Persistent deterioration multiplier of opening the food. */
  opening: number;
  /** Current deterioration multiplier applied to ambient decay. */
  rate: number;
  surface: FoodWaterSurface | null;
  /** Last per-tick exchange row (tick, temperature, rh, area, rain, evaporated, absorbed,
   * received, water, solids), or null before the first exchange. */
  last: V7Data | null;
};

/** Gives food its water composition (version-1 berry 0.85 / root 0.75 assumption, or the
 * composition it already represents). Other foods are rejected; none is invented. */
export function foodWaterInitialize(
  w: V7World,
  s: V7Stack,
): PreservationPhysics {
  required(w);
  return preservationInitialize(w, s);
}

/** Exposed area a surface offers this sample now; throws the reason when it offers none. */
export function foodWaterSurfaceArea(
  w: V7World,
  surface: FoodWaterSurface,
  sample = '',
): number {
  required(w);
  let area: number;
  if (surface.kind === 'object') {
    const o = w.objects.find((o) => o.id === surface.id);
    if (!o) throw new Error(`No actual object ${surface.id}.`);
    area = foodObjectArea(w, o);
  } else area = foodGroundArea(w, surface);
  if (foodSurfaceOccupied(w, sample, surface))
    throw new Error(
      'The surface already carries other material; it holds one sample at a time.',
    );
  return area;
}

/** Lays an unowned food stack on a surface, at the surface's centre. Callers check reach and
 * pay costs first. `prepared` (opened and spread thin) is irreversible: it applies ex10's
 * persistent opening damage 1.1 and lets the food exchange water when it fits a thin
 * layer (mass at most 0.2 per unit area). Unprepared food only receives rain. */
export function foodWaterExpose(
  w: V7World,
  s: V7Stack,
  surface: FoodWaterSurface,
  prepared: boolean,
): FoodWaterReading {
  required(w);
  if (!w.stacks.includes(s))
    throw new Error('Only an actual stack of this world can be exposed.');
  if (s.owner !== null)
    throw new Error(
      'Only food lying in the world, not carried food, can lie on a surface.',
    );
  if (s.componentLots)
    throw new Error('Combined lots have no single surface representation.');
  if (!(s.quantity > 0)) throw new Error('No food remains to expose.');
  const current = preservationPhysics(s);
  if (current?.tray || current?.surface)
    throw new Error('The food already lies on a surface; withdraw it first.');
  const area = foodWaterSurfaceArea(w, surface, s.id);
  const center =
    surface.kind === 'ground'
      ? { x: surface.x, y: surface.y }
      : w.objects.find((o) => o.id === surface.id)?.spatial;
  if (!center) throw new Error('No actual surface object.');
  const d = preservationInitialize(w, s);
  s.position = { x: center.x, y: center.y };
  d.tray = surface.kind === 'object' ? surface.id : '';
  d.surface = { ...surface };
  d.area = area;
  if (prepared && !d.prepared) {
    d.prepared = true;
    d.opening = 1.1;
  }
  const reading = foodWaterRead(s);
  if (!reading) throw new Error('Missing food water record.');
  return reading;
}

/** Ends the exposure in place; the food keeps its water, preparation, age and history. */
export function foodWaterWithdraw(w: V7World, s: V7Stack): void {
  required(w);
  if (!preservationPhysics(s)?.surface)
    throw new Error('The food does not lie on a general surface.');
  foodSurfaceRelease(w, s);
}

/** Current state of a stack with a water composition, or null without one. */
export function foodWaterRead(s: V7Stack): FoodWaterReading | null {
  const d = preservationPhysics(s),
    p = s.physical;
  if (!d || !p) return null;
  const last = d.history.at(-1);
  return {
    sample: s.id,
    resource: s.resource,
    quantity: s.quantity,
    waterFraction: p.unitMass > 0 ? p.unitWater / p.unitMass : 0,
    massRatio: p.unitMass / d.initialUnitMass,
    area: d.area,
    prepared: d.prepared,
    opening: d.opening,
    rate: preservationRate(s),
    surface: d.surface ? { ...d.surface } : null,
    last: last ? { ...last } : null,
  };
}
