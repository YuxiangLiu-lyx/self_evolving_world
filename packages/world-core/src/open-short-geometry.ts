import type {
  V7Object,
  V7Spatial,
  V7Point,
  V7World,
  V7Actor,
} from './continuous-types.js';
import {
  v7Local,
  v7Inside,
  v7ShapesOverlap,
  v7ShapeDistance,
  v7SegmentClear,
} from './continuous-geometry.js';
export interface ShortDimensions {
  width: number;
  length: number;
  height: number;
  poleRadii?: number[];
  poleLengths?: number[];
  ridgeLength?: number;
}
export function shortDimensions(o: V7Object): ShortDimensions {
  return {
    width: Number(o.data.width),
    length: Number(o.data.length),
    height: Number(o.data.height),
    ridgeLength: Number(o.data.ridgeLength ?? o.data.length),
    poleRadii: Array.isArray(o.data.poleRadii)
      ? o.data.poleRadii.map(Number)
      : [],
    poleLengths: Array.isArray(o.data.poleLengths)
      ? o.data.poleLengths.map(Number)
      : [],
  };
}
export function shortShape(
  x: number,
  y: number,
  angle: number,
  d: ShortDimensions,
): V7Spatial {
  const r = Math.max(0.025, ...(d.poleRadii ?? [])),
    projection =
      (Math.max(0, ...(d.poleLengths ?? [])) * d.width) /
      (2 * Math.hypot(d.height, d.width / 2));
  return {
    x,
    y,
    angle,
    shape: {
      kind: 'rectangle',
      width: Math.max(d.length, d.ridgeLength ?? d.length) + 2 * r,
      height: Math.max(d.width, 2 * Math.abs(d.width / 2 - projection)) + 2 * r,
    },
    solid: false,
    reserved: true,
    interaction: 0.65,
    entrances: [],
  };
}
export function shortPoint(s: V7Spatial, x: number, y: number): V7Point {
  return {
    x: s.x + x * Math.cos(s.angle) - y * Math.sin(s.angle),
    y: s.y + x * Math.sin(s.angle) + y * Math.cos(s.angle),
  };
}
/** Capsule footprint is the exact union of a rectangle and its two circular ends. */
export function shortCapsules(s: V7Spatial, d: ShortDimensions): V7Spatial[] {
  return [-1, 1].flatMap((side, sideIndex) =>
    [-1, 1].flatMap((end, endIndex) => {
      const x = (end * d.length) / 2,
        r = d.poleRadii?.[sideIndex * 2 + endIndex] ?? 0.025,
        projected =
          ((d.poleLengths?.[sideIndex * 2 + endIndex] ??
            Math.hypot(d.height, d.width / 2)) *
            d.width) /
          (2 * Math.hypot(d.height, d.width / 2)),
        foot = (side * d.width) / 2,
        tip = foot - side * projected,
        mid = shortPoint(s, x, (foot + tip) / 2);
      return [
        {
          ...mid,
          angle: s.angle + Math.PI / 2,
          shape: {
            kind: 'rectangle' as const,
            width: projected,
            height: r * 2,
          },
          solid: true,
          interaction: 0.3,
          entrances: [],
        },
        ...[foot, tip].map((y) => ({
          ...shortPoint(s, x, y),
          angle: 0,
          shape: { kind: 'circle' as const, radius: r },
          solid: true,
          interaction: 0.3,
          entrances: [],
        })),
      ];
    }),
  );
}
export function shortPlacement(
  w: V7World,
  a: V7Actor,
  s: V7Spatial,
  d: ShortDimensions,
  ignore = '',
) {
  if (v7ShapeDistance(a.position, s) > 0.65)
    throw new Error('Actual layout is beyond 0.65 reach.');
  if (d.width <= 0 || d.length <= 0 || d.height <= 0)
    throw new Error(
      'Positive dimensions bound to actual measured specimens are required.',
    );
  const length = s.shape.kind === 'rectangle' ? s.shape.width : d.length,
    width = s.shape.kind === 'rectangle' ? s.shape.height : d.width;
  for (const x of [-length / 2, 0, length / 2])
    for (const y of [-width / 2, 0, width / 2]) {
      const p = shortPoint(s, x, y),
        terrain = w.terrain[Math.floor(p.y)]?.[Math.floor(p.x)];
      if (!v7Inside(w, p, 0.1) || !terrain || ['~', '=', '#'].includes(terrain))
        throw new Error('Both frames require actual supported dry ground.');
    }
  if (
    w.objects.some(
      (o) =>
        o.id !== ignore &&
        o.assemblyParent !== ignore &&
        (o.spatial.solid || o.spatial.reserved) &&
        v7ShapesOverlap(s, o.spatial),
    )
  )
    throw new Error('The proposed footprint overlaps an actual obstacle.');
  if (
    w.actors.some(
      (other) =>
        !v7SegmentClear(
          other.position,
          other.position,
          other.radius,
          shortCapsules(s, d),
        ),
    )
  )
    throw new Error('An actor occupies an actual pole capsule.');
}
/** Two finite triangular-section roof surfaces with explicit repeating interlace apertures. */
export function shortRay(
  o: V7Object,
  p: V7Point,
  dx: number,
  dy: number,
): number {
  if (
    o.data.proven !== true ||
    o.data.collapsed === true ||
    Number(o.data.integrity) <= 0
  )
    return 0;
  const d = shortDimensions(o),
    q = v7Local(p, o.spatial),
    u = dx * Math.cos(o.spatial.angle) + dy * Math.sin(o.spatial.angle),
    v = -dx * Math.sin(o.spatial.angle) + dy * Math.cos(o.spatial.angle),
    h = Math.max(0, d.height - Number(o.data.sag ?? 0));
  for (const side of [-1, 1]) {
    const denominator = 1 + (side * v * 2 * h) / d.width;
    if (denominator <= 0) continue;
    const z = (h - (side * q.y * 2 * h) / d.width) / denominator,
      x = q.x + u * z,
      y = q.y + v * z;
    if (
      z < 0 ||
      z > h ||
      Math.abs(x) > d.length / 2 ||
      side * y < 0 ||
      side * y > d.width / 2
    )
      continue;
    const spacing = 0.08,
      coverage = Number(o.data.coverage ?? 0),
      stripe = (((x + d.length / 2) % spacing) + spacing) % spacing;
    if (stripe <= spacing * coverage)
      return Math.max(0, Math.min(1, Number(o.data.integrity)));
  }
  return 0;
}
