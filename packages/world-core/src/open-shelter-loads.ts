import type { V7World, V7Object, V7Stack } from './continuous-types.js';
import { refugeMaterial } from './open-shelter-material.js';
import { forestClimate } from './forest-climate.js';
export function refugeComponents(o: V7Object): V7Stack[] {
  return (o.data.components ?? []) as unknown as V7Stack[];
}
/** Installed mass and source-tested capacities, reduced by current water/condition. No name-based certificate. */
export function refugeLoads(w: V7World, o: V7Object) {
  const parts = refugeComponents(o),
    entries = parts.map((s) => ({
      s,
      m: refugeMaterial(w, s),
      safe: Math.min(
        Number(s.processing?.refugeCapacity ?? 0),
        Number(refugeMaterial(w, s).capacity) * 0.5,
      ),
    })),
    forResource = (resource: string) =>
      entries.filter((r) => r.s.resource === resource),
    minimum = (resource: string) => {
      const all = forResource(resource);
      return all.length ? Math.min(...all.map((r) => r.safe)) : 0;
    },
    condition = Number(o.data.condition),
    wind = forestClimate(w, o.spatial).wind ?? 0;
  const mass = entries.reduce(
      (n, r) => n + Number(r.m.unitMass) * r.s.quantity,
      0,
    ),
    roofMass = forResource('reed').reduce(
      (n, r) => n + Number(r.m.unitMass) * r.s.quantity,
      0,
    ),
    roofArea = forResource('reed').reduce(
      (n, r) => n + Number(r.m.matArea) * r.s.quantity,
      0,
    ),
    capacity = Math.min(4 * minimum('branch'), 6 * minimum('vine')) * condition,
    roofCapacity =
      forResource('reed').reduce((n, r) => n + r.safe * r.s.quantity, 0) *
      condition,
    load = mass * 9.81 + wind * 15 * roofArea,
    roofLoad = roofMass * 9.81 + wind * 15 * roofArea;
  const loadMargin =
    load > 0
      ? Math.min(
          capacity / (2 * load),
          roofCapacity / (2 * Math.max(0.001, roofLoad)),
        )
      : 0;
  Object.assign(o.data, {
    mass,
    roofMass,
    roofArea,
    capacity,
    roofCapacity,
    load,
    roofLoad,
    loadMargin,
    coverage: Math.min(0.9, roofArea / (2 * 1.8 * Math.hypot(1, 0.6))) * 0.85,
  });
  return {
    capacity,
    load,
    roofCapacity,
    roofLoad,
    loadMargin,
    sound: condition > 0.2 && loadMargin >= 1,
  };
}
