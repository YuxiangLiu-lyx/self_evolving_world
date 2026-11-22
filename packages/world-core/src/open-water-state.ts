import type {
  V7World,
  V7Actor,
  V7Stack,
  V7Point,
  V7Data,
} from './continuous-types.js';
import { v7Observe } from './continuous-observation.js';
import {
  v7Distance,
  v7Obstacles,
  v7SegmentClear,
} from './continuous-geometry.js';
import { forestResolveReference } from './forest-references.js';
import { openConditions } from './open-physical.js';

export const waterPoint = (w: V7World, s: V7Stack): V7Point =>
  s.owner && !s.reservedFor
    ? (w.actors.find((a) => a.id === s.owner)?.position ?? s.position)
    : s.position;
export function waterReach(w: V7World, a: V7Actor, point: V7Point): boolean {
  return (
    !['~', '='].includes(
      w.terrain[Math.floor(a.position.y)]?.[Math.floor(a.position.x)] ?? '~',
    ) &&
    v7Distance(a.position, point) <= 0.65 + 1e-8 &&
    v7SegmentClear(a.position, point, 0, v7Obstacles(w))
  );
}
export function waterItem(w: V7World, a: V7Actor, ref: string): V7Stack {
  const id = forestResolveReference(w, a, ref, 'optional-exact-visible');
  const s = w.stacks.find(
    (s) => s.id === id && (s.owner === null || s.owner === a.id),
  );
  if (!s || !waterReach(w, a, waterPoint(w, s)))
    throw new Error(
      'Exact personally accessible material must be within clear 0.65 reach.',
    );
  return s;
}
export function waterSurface(
  w: V7World,
  a: V7Actor,
  ref: string,
  x = 0,
  y = 0,
) {
  if (ref) {
    const match = /^river:([0-9]+):([0-9]+)$/.exec(ref);
    if (!match)
      throw new Error(
        'Use an exact inspected river:x:y identity; resource aliases are not water sources.',
      );
    x = Number(match[1]);
    y = Number(match[2]);
  }
  x = Math.floor(x);
  y = Math.floor(y);
  const visible = v7Observe(w, a.id).terrain.some(
    (t) => t.x === x && t.y === y,
  );
  if (!visible)
    throw new Error('No personally visible surface at those coordinates.');
  const key = `river:${String(x)}:${String(y)}`,
    kind = w.terrain[y]?.[x];
  if (kind !== '~' && kind !== '=')
    return {
      key,
      x,
      y,
      surface: false,
      reachable: false,
      point: { x, y },
      conditions: openConditions(w, { x, y }),
    };
  const point = {
    x: Math.max(x, Math.min(x + 1, a.position.x)),
    y: Math.max(y, Math.min(y + 1, a.position.y)),
  };
  // The segment terminates on the represented water-cell boundary, never inside its solid area.
  return {
    key,
    x,
    y,
    surface: true,
    reachable: waterReach(w, a, point),
    point,
    conditions: openConditions(w, point),
  };
}
export function waterCell(w: V7World, key: string): V7Data {
  const value = w.state[`water:cell:${key}`];
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Inspect the actual river compartment before withdrawal.');
  return value;
}
export function waterInspectCell(
  w: V7World,
  key: string,
  x: number,
  y: number,
) {
  const old = w.state[`water:cell:${key}`];
  if (old) return waterCell(w, key);
  const previous = w.state[`woven:water:${String(x)}:${String(y)}`] as
    V7Data | undefined;
  const priorMl = Math.min(
    10000,
    Math.ceil(Number(previous?.withdrawn ?? 0) * 1000),
  );
  const cell = {
    initialMl: 10000,
    remainingMl: 10000 - priorMl,
    withdrawnMl: priorMl,
    legacyWithdrawalMl: priorMl,
    replenishmentMl: 0,
    contamination: 'unknown',
    surfaceArea: 1,
    depth: 0.01,
    law: 'river-contact-water@1: one coordinate-area cell, declared 1 cm finite surface compartment; not measured drinking safety',
    x,
    y,
  };
  w.state[`water:cell:${key}`] = cell;
  return cell;
}
export function waterWithdraw(w: V7World, a: V7Actor, key: string, ml: number) {
  const surface = waterSurface(w, a, key),
    cell = waterCell(w, key);
  if (!surface.surface || !surface.reachable)
    throw new Error(
      'Actual supported bank and clear surface reach are required; no movement or remote withdrawal.',
    );
  if (!a.memory.knowledge?.[`water:access:${key}`])
    throw new Error('This actor has not inspected that surface.');
  if (!Number.isSafeInteger(ml) || ml <= 0 || Number(cell.remainingMl) < ml)
    throw new Error(
      'Finite compartment has insufficient water for this exact positive ml allocation.',
    );
  cell.remainingMl = Number(cell.remainingMl) - ml;
  cell.withdrawnMl = Number(cell.withdrawnMl) + ml;
  return {
    source: key,
    ml,
    tick: w.tick,
    position: surface.point,
    contamination: 'unknown',
  };
}
