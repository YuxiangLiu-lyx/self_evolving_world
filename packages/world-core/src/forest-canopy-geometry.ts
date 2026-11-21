import type {
  V7Actor,
  V7Object,
  V7Point,
  V7Spatial,
  V7World,
} from './continuous-types.js';
import {
  v7Distance,
  v7Inside,
  v7Local,
  v7Obstacles,
  v7SegmentClear,
  v7ShapesOverlap,
} from './continuous-geometry.js';
export const canopyPoint = (s: V7Spatial, x: number, y: number): V7Point => ({
  x: s.x + x * Math.cos(s.angle) - y * Math.sin(s.angle),
  y: s.y + x * Math.sin(s.angle) + y * Math.cos(s.angle),
});
export const canopySpatial = (
  x: number,
  y: number,
  angle: number,
): V7Spatial => ({
  x,
  y,
  angle,
  shape: { kind: 'rectangle', width: 2, height: 2 },
  solid: false,
  interaction: 0.65,
  entrances: [],
});
export const canopyPosts = (s: V7Spatial): V7Spatial[] =>
  [-1, 1].flatMap((x) =>
    [-1, 1].map((y) => ({
      ...canopyPoint(s, x, y),
      angle: 0,
      shape: { kind: 'circle' as const, radius: 0.08 },
      solid: true,
      interaction: 0.65,
      entrances: [],
    })),
  );
export function canopyTransmission(o: V7Object): number {
  return Math.max(
    0.1,
    Math.min(1, 0.1 + 0.9 * (1 - Number(o.data.condition) / 120)),
  );
}
export function canopyCover(
  w: V7World,
  p: V7Point,
  radius = 0,
): V7Object | undefined {
  if (w.state.rainCanopy !== 1) return undefined;
  return w.objects
    .filter((o) => o.kind === 'rain-canopy' && Number(o.data.condition) > 0)
    .filter((o) => {
      const q = v7Local(p, o.spatial);
      return (
        Math.abs(q.x) + radius <= 1 + 1e-8 && Math.abs(q.y) + radius <= 1 + 1e-8
      );
    })
    .sort(
      (a, b) =>
        canopyTransmission(a) - canopyTransmission(b) ||
        a.id.localeCompare(b.id, 'en'),
    )[0];
}
export function canopySite(
  w: V7World,
  a: V7Actor,
  s: V7Spatial,
  ignore = '',
): void {
  const front = canopyPoint(s, 0, 1),
    posts = canopyPosts(s);
  const obstacles = v7Obstacles({
    ...w,
    objects: w.objects.filter((o) => o.id !== ignore),
  });
  const structures = w.objects
    .filter(
      (o) =>
        o.id !== ignore &&
        (o.spatial.enclosure ||
          ['rain-canopy', 'rain-canopy-work'].includes(o.kind)),
    )
    .map((o) => {
      const s = { ...o.spatial };
      delete s.enclosure;
      s.reserved = true;
      return s;
    });
  if (
    ![s.x, s.y, s.angle].every(Number.isFinite) ||
    posts.some((p) => !v7Inside(w, p, 0.08)) ||
    [...obstacles, ...structures].some(
      (o) =>
        v7ShapesOverlap({ ...s, reserved: true }, o) ||
        posts.some((p) => v7ShapesOverlap(p, o)),
    ) ||
    w.actors.some((other) => {
      const body: V7Spatial = {
        ...other.position,
        angle: 0,
        shape: { kind: 'circle', radius: other.radius },
        solid: true,
        interaction: 0,
        entrances: [],
      };
      return (
        (other.id !== a.id &&
          v7ShapesOverlap({ ...s, reserved: true }, body)) ||
        posts.some((p) => v7ShapesOverlap(p, body))
      );
    }) ||
    v7Distance(a.position, front) > a.radius + 0.65 ||
    !v7SegmentClear(a.position, front, 0, obstacles)
  )
    throw new Error(
      'Rain canopy needs a clear in-bounds dry footprint, post clearance, and unobstructed front-edge surface reach within 0.65.',
    );
}
