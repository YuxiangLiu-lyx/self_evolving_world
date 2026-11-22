import type { V7Actor, V7Spatial, V7World } from './continuous-types.js';
import {
  v7Inside,
  v7Obstacles,
  v7ShapeDistance,
  v7ShapesOverlap,
} from './continuous-geometry.js';
import { openConditions } from './open-physical.js';

/** Original root worksite predicates, shared without changing their order or thresholds. */
export function rootPlacement(
  w: V7World,
  a: V7Actor,
  spatial: V7Spatial,
  radius: number,
) {
  const inside = v7Inside(w, spatial, radius);
  const distance = v7ShapeDistance(a.position, spatial);
  const reach = distance <= a.radius + 0.65;
  const samples = [-radius, 0, radius].flatMap((dx) =>
    [-radius, 0, radius].map((dy) => {
      const point = { x: spatial.x + dx, y: spatial.y + dy };
      const local = openConditions(w, point);
      return {
        ...point,
        ground: local.ground,
        waterlogging: local.waterlogging,
      };
    }),
  );
  const support = samples.every(
    (p) => !['~', '=', ','].includes(p.ground) && p.waterlogging <= 0.1,
  );
  const occupied = [
    ...v7Obstacles(w),
    ...w.objects.filter((o) => o.spatial.reserved).map((o) => o.spatial),
    ...w.actors
      .filter((a) => a.vitals.health > 0)
      .map((a) => ({
        ...a.position,
        angle: 0,
        shape: { kind: 'circle' as const, radius: a.radius },
        solid: true,
        interaction: 0,
        entrances: [],
      })),
  ];
  const clearance = !occupied.some((o) => v7ShapesOverlap(spatial, o));
  const error =
    !inside || !reach
      ? 'Choose an in-bounds ground worksite within actual reach.'
      : !support
        ? 'The actual work surface must be accessible ground, not standing water.'
        : !clearance
          ? 'Worksite overlaps an actual obstacle, person or reserved surface.'
          : null;
  return { inside, distance, reach, samples, support, clearance, error };
}
