import type {
  V7Data,
  V7Object,
  V7Spatial,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7Clone } from './continuous-data.js';
import {
  v7Inside,
  v7Obstacles,
  v7ShapesOverlap,
} from './continuous-geometry.js';
import { openConditions } from './open-physical.js';

export const SMALL_DRYING = 'root-small-drying';
export function smallSpatial(x: number, y: number, g: V7Data): V7Spatial {
  return {
    x,
    y,
    angle: 0,
    shape: {
      kind: 'rectangle',
      width: Number(g.width),
      height: Number(g.height),
    },
    solid: false,
    reserved: true,
    interaction: 0.65,
    entrances: [],
  };
}
/** Pure physical conditions; no actor knowledge is inferred or disclosed here. */
export function smallSite(
  w: V7World,
  spatial: V7Spatial,
  exclude: string[] = [],
) {
  const width = spatial.shape.kind === 'rectangle' ? spatial.shape.width : 0,
    height = spatial.shape.kind === 'rectangle' ? spatial.shape.height : 0;
  const points = [-0.5, 0, 0.5].flatMap((x) =>
    [-0.5, 0, 0.5].map((y) =>
      openConditions(w, {
        x: spatial.x + x * width,
        y: spatial.y + y * height,
      }),
    ),
  );
  const obstacles = v7Obstacles({
    ...w,
    objects: w.objects.filter((o) => !exclude.includes(o.id)),
  });
  const occupied = [
    ...obstacles,
    ...w.objects
      .filter((o) => o.spatial.reserved && !exclude.includes(o.id))
      .map((o) => o.spatial),
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
  return {
    bounds: v7Inside(w, spatial, Math.hypot(width, height) / 2),
    firm: points.every(
      (p) => !['~', '=', ','].includes(p.ground) && p.waterlogging <= 0.1,
    ),
    clear: !occupied.some((o) => v7ShapesOverlap(spatial, o)),
  };
}
export function smallComponents(w: V7World, o: V7Object): V7Stack[] {
  const ids = Array.isArray(o.data.components) ? o.data.components : [];
  return w.stacks.filter((s) => ids.includes(s.id) && s.reservedFor === o.id);
}
export function smallSupportValidity(w: V7World, o: V7Object) {
  const children = w.objects.filter((x) => x.data.smallSupport === o.id),
    condition = smallSite(w, o.spatial, [o.id, ...children.map((x) => x.id)]),
    components = smallComponents(w, o),
    geometry = o.data.geometry as V7Data,
    sheet = components.find((s) => s.resource === 'bark'),
    stones = components.filter((s) => s.resource === 'stone');
  const current =
    sheet?.materialLayer ??
    (sheet?.processing?.rootSurface as V7Data | undefined) ??
    geometry;
  const materials =
    !!sheet &&
    sheet.quantity === Number(geometry.quantity) &&
    !sheet.processing?.fragmented &&
    Number(current.condition) >= 0.8 &&
    current.connected === true &&
    Number(current.holes ?? 0) === 0 &&
    Math.abs(
      (sheet.physical?.unitMass ??
        w.resources.find((r) => r.id === sheet.resource)?.mass ??
        0) *
        sheet.quantity -
        Number(geometry.mass),
    ) < 1e-8 &&
    components.every(
      (s) => s.position.x === o.spatial.x && s.position.y === o.spatial.y,
    ) &&
    stones.every(
      (s) =>
        (w.resources.find((r) => r.id === s.resource)?.properties?.hardness ??
          0) >= 3 &&
        !s.processing?.wovenDamage &&
        !s.processing?.gravimetricAssay,
    ) &&
    stones.reduce((n, s) => n + s.quantity, 0) === 0.5;
  const contacts =
    children.length === 1 &&
    children.every(
      (x) =>
        x.spatial.solid &&
        x.spatial.x === o.spatial.x + 0.09 &&
        x.spatial.y === o.spatial.y,
    ) &&
    o.visual.state === 'ready';
  const valid =
    materials &&
    contacts &&
    condition.bounds &&
    condition.firm &&
    condition.clear;
  return {
    valid,
    materials,
    contacts,
    ...condition,
    reason: valid
      ? 'Valid ground-supported exposure'
      : 'Evaporation paused: support components, ballast position, firm ground or clearance is unavailable.',
  };
}
export function smallFoodEvidence(w: V7World, o: V7Object) {
  const food = w.stacks.find(
    (s) => s.id === o.data.foodId && s.reservedFor === o.id,
  );
  return food
    ? v7Clone({
        id: food.id,
        quantity: food.quantity,
        physical: food.physical ?? null,
        decay: food.decay ?? 0,
        processing: food.processing ?? null,
      })
    : null;
}
