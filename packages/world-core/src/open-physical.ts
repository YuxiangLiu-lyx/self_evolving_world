import type { V7Point, V7Resource, V7World } from './continuous-types.js';
import { v7Distance } from './continuous-geometry.js';
import { v7RoundNumber } from './continuous-data.js';

/** Immutable, local forcing. Recovery is gradual; elapsed time never unlocks capabilities. */
export function openConditions(world: V7World, point: V7Point) {
  const ground =
    world.terrain[Math.floor(point.y)]?.[Math.floor(point.x)] ?? '.';
  let drought = 0,
    waterlogging = 0;
  const hazards: string[] = [];
  for (const h of world.config.development?.hazards ?? []) {
    const elapsed = world.tick - h.start;
    const distance = v7Distance(point, h);
    if (
      elapsed < 0 ||
      elapsed >= h.duration + h.recovery ||
      distance >= h.radius
    )
      continue;
    const ramp =
      elapsed < h.duration
        ? Math.min(1, elapsed / 20)
        : 1 - (elapsed - h.duration) / h.recovery;
    const intensity = h.severity * ramp * (1 - distance / h.radius);
    if (h.kind === 'drought') drought = Math.max(drought, intensity);
    else waterlogging = Math.max(waterlogging, intensity);
    hazards.push(h.id);
  }
  const base =
    ground === ',' || ground === '=' ? 0.9 : ground === ':' ? 0.25 : 0.65;
  const moisture = Math.max(0.05, Math.min(1.5, base - drought + waterlogging));
  return {
    ground,
    moisture: v7RoundNumber(moisture),
    drought: v7RoundNumber(drought),
    waterlogging: v7RoundNumber(waterlogging),
    travelFactor: v7RoundNumber(1 + waterlogging * 0.6),
    hazards,
    regime:
      drought > 0.25
        ? 'drying soil'
        : waterlogging > 0.25
          ? 'saturated soil'
          : 'ordinary soil',
  };
}

/** Constitutive values are engine facts, revealed through paid trials rather than public recipes. */
export function openMaterial(resource: V7Resource) {
  const p = resource.properties;
  return {
    strength: (p?.hardness ?? 0) / 10,
    flexibility: (p?.flexibility ?? 0) / 10,
    waterResistance:
      resource.id === 'clay'
        ? 0.15
        : resource.id === 'bark' || resource.id === 'resin'
          ? 0.9
          : (p?.hardness ?? 0) >= 6
            ? 0.95
            : 0.55,
    fuel: p?.fuel ?? 0,
    heatSoftening:
      resource.id === 'resin'
        ? 0.9
        : resource.id === 'clay'
          ? -0.8
          : (p?.fuel ?? 0) > 0
            ? 0.5
            : 0.05,
  };
}
