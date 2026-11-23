import type { V7Object, V7Stack } from '@self-evolving-world/world-core';
export function joiningPaths(o: V7Object) {
  if (o.kind !== 'loose-wrap-trial' || !Array.isArray(o.data.paths)) return [];
  return o.data.paths.flatMap((p) => {
    if (
      !p ||
      typeof p !== 'object' ||
      Array.isArray(p) ||
      !Array.isArray(p.points) ||
      typeof p.diameter !== 'number'
    )
      return [];
    const points = p.points.flatMap((v) =>
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      typeof v.x === 'number' &&
      typeof v.y === 'number' &&
      typeof v.z === 'number'
        ? [{ x: v.x, y: v.y, z: v.z }]
        : [],
    );
    return points.length === p.points.length
      ? [{ kind: p.kind, diameter: p.diameter, points }]
      : [];
  });
}
export function joiningContains(objects: readonly V7Object[], s: V7Stack) {
  return objects.some(
    (o) =>
      o.kind === 'loose-wrap-trial' &&
      o.id === s.reservedFor &&
      Array.isArray(o.data.parts) &&
      o.data.parts.includes(s.id),
  );
}
export function joiningVisual(o: V7Object) {
  return joiningPaths(o)
    .map(
      (p) =>
        `<polyline points="${p.points.map((v) => `${String(v.x)},${String(v.y - v.z)}`).join(' ')}" fill="none" stroke="${p.kind === 'branch' ? '#92734d' : '#a8b77b'}" stroke-width="${String(p.diameter)}"/>`,
    )
    .join('');
}
