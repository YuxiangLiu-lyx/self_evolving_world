import type { V7World, V7Spatial, V7Object } from './continuous-types.js';
import { v7Distance } from './continuous-geometry.js';
export const SURFACE_ID = 'small-soil-patch-preparation';
export const SURFACE_REV = SURFACE_ID + '@1';
/** Explicit finite local cover, never harvestable inventory or a terrain-wide mutation. */
export function representedSurface(
  w: V7World,
  p: V7Spatial,
): V7Object | undefined {
  if (!w.revisions.includes(SURFACE_REV)) return undefined;
  return w.objects.find(
    (o) =>
      o.revision === SURFACE_REV &&
      v7Distance(o.spatial, p) < 1e-7 &&
      o.spatial.shape.kind === 'circle' &&
      o.spatial.shape.radius === 0.2,
  );
}
export function surfaceBare(o: V7Object): boolean {
  return Number(o.data.coverMass) === 0 && Number(o.data.residueMass) === 0;
}
