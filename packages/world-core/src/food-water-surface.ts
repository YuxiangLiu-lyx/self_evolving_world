import type {
  V7Object,
  V7Point,
  V7Spatial,
  V7World,
} from './continuous-types.js';
import { v7Inside, v7ShapesOverlap } from './continuous-geometry.js';
import { openConditions } from './open-physical.js';

/** A general surface a food stack can lie exposed on in the opt-in food water
 * representation: an actual object marked `data.foodSurface === true`, or a circular
 * footprint of open ground. Absent in every ex10 record, which names only its tray. */
export type FoodWaterSurface =
  | { kind: 'object'; id: string }
  | { kind: 'ground'; x: number; y: number; area: number };
export type FoodGroundFootprint = Extract<FoodWaterSurface, { kind: 'ground' }>;

/** Water, shallow water and wet banks; the same exclusion as earlier ground drying sites. */
const WET_GROUND = ['~', '=', ','];

export function foodGroundRadius(g: FoodGroundFootprint): number {
  return Math.sqrt(g.area / Math.PI);
}
/** The footprint as a reserved, walkable circle for overlap tests. */
export function foodGroundSpatial(g: FoodGroundFootprint): V7Spatial {
  return {
    x: g.x,
    y: g.y,
    angle: 0,
    shape: { kind: 'circle', radius: foodGroundRadius(g) },
    solid: false,
    reserved: true,
    interaction: 0,
    entrances: [],
  };
}
/** Solid, reserved and food-surface objects occupy ground; open refuges only shade it. */
function blocking(o: V7Object): boolean {
  return (
    o.kind !== 'open-refuge' &&
    (o.spatial.solid || !!o.spatial.reserved || o.data.foodSurface === true)
  );
}
function overlapping(a: V7Spatial, b: V7Spatial): boolean {
  return v7ShapesOverlap({ ...a, reserved: true }, { ...b, reserved: true });
}
/** Geometric area of an object food surface; throws the reason when it cannot carry food.
 * Occupancy by other food is checked separately. */
export function foodObjectArea(w: V7World, o: V7Object): number {
  if (o.data.foodSurface !== true)
    throw new Error(`${o.id} is not a food surface.`);
  if (o.spatial.enclosure)
    throw new Error(`${o.id} is an enclosure, not a flat food surface.`);
  if ('service' in o.data && !(Number(o.data.service) > 0))
    throw new Error(`${o.id} is worn out.`);
  const shape = o.spatial.shape;
  const area =
    shape.kind === 'circle'
      ? Math.PI * shape.radius ** 2
      : shape.width * shape.height;
  if (!(area > 0)) throw new Error(`${o.id} has no surface area.`);
  if (
    w.objects.some(
      (x) => x.id !== o.id && blocking(x) && overlapping(x.spatial, o.spatial),
    )
  )
    throw new Error(`The surface of ${o.id} is obstructed.`);
  return area;
}
/** Area of a ground footprint; throws the reason when the ground cannot carry food.
 * Occupancy by other food is checked separately. */
export function foodGroundArea(w: V7World, g: FoodGroundFootprint): number {
  if (
    !Number.isFinite(g.x) ||
    !Number.isFinite(g.y) ||
    !Number.isFinite(g.area) ||
    !(g.area > 0)
  )
    throw new Error(
      'A ground footprint needs a finite point and a positive finite area.',
    );
  const radius = foodGroundRadius(g);
  if (!v7Inside(w, g, radius))
    throw new Error('The ground footprint must lie entirely inside the world.');
  const samples: V7Point[] = [
    { x: g.x, y: g.y },
    ...Array.from({ length: 8 }, (_, i) => ({
      x: g.x + radius * Math.cos((i * Math.PI) / 4),
      y: g.y + radius * Math.sin((i * Math.PI) / 4),
    })),
  ];
  if (
    samples.some((p) => {
      const c = openConditions(w, p);
      return WET_GROUND.includes(c.ground) || c.waterlogging > 0.1;
    })
  )
    throw new Error(
      'The ground footprint must lie on firm ordinary ground, not on water, wet banks or waterlogged ground.',
    );
  const spatial = foodGroundSpatial(g);
  if (w.objects.some((o) => blocking(o) && overlapping(o.spatial, spatial)))
    throw new Error(
      'The ground footprint is obstructed by a solid, reserved or food-surface object.',
    );
  return g.area;
}
