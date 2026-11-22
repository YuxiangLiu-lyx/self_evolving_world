import { shortRay } from './open-short-geometry.js';
import type {
  V7World,
  V7Actor,
  V7Object,
  V7Spatial,
  V7Point,
} from './continuous-types.js';
import {
  v7Inside,
  v7ShapesOverlap,
  v7SegmentClear,
  v7Obstacles,
  v7ShapeDistance,
  v7Local,
} from './continuous-geometry.js';
export const refugeShape = (
  x: number,
  y: number,
  angle: number,
): V7Spatial => ({
  x,
  y,
  angle,
  shape: { kind: 'rectangle', width: 1.8, height: 1.2 },
  solid: false,
  reserved: true,
  interaction: 0.65,
  entrances: [],
});
export function refugePoint(s: V7Spatial, x: number, y: number): V7Point {
  return {
    x: s.x + x * Math.cos(s.angle) - y * Math.sin(s.angle),
    y: s.y + x * Math.sin(s.angle) + y * Math.cos(s.angle),
  };
}
export function refugePoles(s: V7Spatial): V7Spatial[] {
  return [-0.9, 0.9].flatMap((x) =>
    [-0.6, 0.6].map((y) => ({
      ...refugePoint(s, x, y),
      angle: 0,
      shape: { kind: 'circle' as const, radius: 0.06 },
      solid: true,
      interaction: 0.3,
      entrances: [],
    })),
  );
}
export function refugePlacement(w: V7World, a: V7Actor, s: V7Spatial) {
  if (v7ShapeDistance(a.position, s) > 0.65)
    throw new Error('Actual work surface is beyond 0.65 reach.');
  for (let x = -1.3; x <= 1.3; x += 0.2)
    for (let y = -0.7; y <= 0.7; y += 0.2) {
      const p = refugePoint(s, x, y);
      if (
        !v7Inside(w, p, 0.1) ||
        ['~', '='].includes(
          w.terrain[Math.floor(p.y)]?.[Math.floor(p.x)] ?? '~',
        )
      )
        throw new Error('Supported ground and both open exits are required.');
    }
  if (
    w.objects.some(
      (o) =>
        (o.spatial.solid || o.spatial.reserved) &&
        v7ShapesOverlap(s, o.spatial),
    )
  )
    throw new Error('Actual footprint is obstructed.');
  const poles = refugePoles(s);
  if (
    w.actors.some(
      (a) => !v7SegmentClear(a.position, a.position, a.radius, poles),
    )
  )
    throw new Error('An actual actor occupies a pole location.');
  if (
    !v7SegmentClear(refugePoint(s, -1.3, 0), refugePoint(s, 1.3, 0), a.radius, [
      ...v7Obstacles(w),
      ...poles,
    ])
  )
    throw new Error('Open ends are not passable.');
}
/** Exact intersections of a directional overhead ray with the two finite sloping roof polygons. */
export function refugeRay(
  o: V7Object,
  p: V7Point,
  dx: number,
  dy: number,
): number {
  if (o.kind === 'short-refuge') return shortRay(o, p, dx, dy);
  if (o.data.proven !== true || Number(o.data.condition) <= 0.2) return 0;
  const q = v7Local(p, o.spatial),
    u = dx * Math.cos(o.spatial.angle) + dy * Math.sin(o.spatial.angle),
    v = -dx * Math.sin(o.spatial.angle) + dy * Math.cos(o.spatial.angle);
  for (const side of [-1, 1]) {
    const denominator = 1 + (side * v) / 0.6;
    if (denominator <= 0) continue;
    const z = (1 - (side * q.y) / 0.6) / denominator,
      x = q.x + u * z,
      y = q.y + v * z;
    if (
      z >= 0 &&
      z <= 1 &&
      Math.abs(x) <= 0.9 &&
      side * y >= 0 &&
      side * y <= 0.6
    )
      return Math.min(1, Number(o.data.coverage) * Number(o.data.condition));
  }
  return 0;
}
