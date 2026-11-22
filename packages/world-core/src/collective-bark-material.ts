import type {
  V7Data,
  V7Resource,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7Clone } from './continuous-data.js';

export interface BranchLayer extends V7Data {
  originalMass: number;
  maximum: number;
  remaining: number;
  work: number;
  waterFraction: number;
  fuelDensity: number;
  nutritionDensity: number;
  toxicityDensity: number;
  assumption: string;
}
export function barkProfile(w: V7World, s: V7Stack): V7Resource | undefined {
  return w.revisions.includes('bark-extraction@1') && s.processing?.barkProfile
    ? (s.processing.barkProfile as unknown as V7Resource)
    : undefined;
}
export function branchLayer(w: V7World, s: V7Stack): BranchLayer | null {
  const prior = s.processing?.branchLayer;
  if (prior && typeof prior === 'object' && !Array.isArray(prior))
    return v7Clone(prior) as BranchLayer;
  if (s.resource !== 'branch' || s.processing || s.materialLayer) return null;
  const r = w.resources.find((r) => r.id === s.resource);
  if (!r) return null;
  const mass = s.physical?.unitMass ?? r.mass;
  if (mass <= 0) return null;
  return {
    originalMass: mass,
    maximum: mass * 0.1,
    remaining: mass * 0.1,
    work: 2,
    waterFraction: s.physical
      ? s.physical.unitWater / mass
      : (r.properties?.moisture ?? 0),
    fuelDensity: (r.properties?.fuel ?? 0) / mass,
    nutritionDensity: r.nutrition / mass,
    toxicityDensity: r.toxicity / mass,
    assumption:
      'bark-extraction@1: previously unspecified intact branch has at most 10% separable outer mass. Existing represented composition overrides this default; unknown standing trunks remain unresolved.',
  };
}
export function setBarkMaterial(
  w: V7World,
  s: V7Stack,
  unitMass: number,
  layer: BranchLayer,
) {
  const base = w.resources.find((r) => r.id === s.resource);
  if (!base || !base.properties)
    throw new Error('Missing material property schema.');
  s.physical = {
    unitMass,
    unitWater: unitMass * layer.waterFraction,
    unitSolids: unitMass * (1 - layer.waterFraction),
  };
  s.processing ??= {};
  s.processing.barkProfile = {
    ...base,
    mass: unitMass,
    nutrition: unitMass * layer.nutritionDensity,
    toxicity: unitMass * layer.toxicityDensity,
    properties: { ...base.properties, fuel: unitMass * layer.fuelDensity },
  };
}
