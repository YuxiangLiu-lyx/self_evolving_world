import type { V7World, V7Stack, V7Data } from './continuous-types.js';
import { v7Clone, v7Id } from './continuous-data.js';
import { foodUnitMass } from './forest-food-accounting.js';
export const HARDNESS_SCALE =
  'Engine contact-resistance index (dimensionless 0–10), not Mohs or an absolute laboratory hardness unit. Existing tool predicates require an intrinsic index >=8; a name or successful load trial is not a measurement of that index.';
export function scratchPhysical(w: V7World, s: V7Stack): V7Data {
  const key = `hardness:intrinsic:${s.id}`,
    old = w.state[key];
  if (old && typeof old === 'object' && !Array.isArray(old)) {
    old.fractured = old.fractured === true || !!s.processing?.wovenDamage;
    old.usable =
      foodUnitMass(w, s) * s.quantity >= 0.005 &&
      !old.fractured &&
      (w.resources.find((r) => r.id === s.resource)?.properties?.hardness ??
        0) >= 1;
    return old;
  }
  const r = w.resources.find((r) => r.id === s.resource);
  if (!r) throw new Error('Missing actual material');
  const mass = foodUnitMass(w, s) * s.quantity,
    damage = !!s.processing?.wovenDamage;
  const value: V7Data = {
    version: 1,
    resistance: r.properties?.hardness ?? 0,
    edgeRadius: 0.001 / Math.max(1, r.properties?.hardness ?? 0),
    wear: 0,
    fractured: damage,
    contaminated: !!s.processing?.gravimetricAssay,
    usable: mass >= 0.005 && (r.properties?.hardness ?? 0) >= 1 && !damage,
    source: s.origin,
    quantity: s.quantity,
  };
  w.state[key] = value;
  return value;
}
export function scratchVisible(w: V7World, s: V7Stack) {
  const p = scratchPhysical(w, s);
  return {
    specimen: s.id,
    origin: s.origin,
    surface: `${s.id}:contact-surface`,
    edgeRadius: Number(p.edgeRadius),
    wear: Number(p.wear),
    fractured: p.fractured === true,
    contaminated: p.contaminated === true,
    controlledContact: p.usable === true,
  };
}
function dust(w: V7World, s: V7Stack, project: string): string | null {
  const r = w.resources.find((r) => r.id === s.resource);
  if (!r || r.nutrition > 0 || r.toxicity > 0) return null;
  if (!s.physical) {
    const wet = r.properties?.moisture ?? 0;
    s.physical = {
      unitMass: r.mass,
      unitWater: r.mass * wet,
      unitSolids: r.mass * (1 - wet),
    };
  }
  const amount = 0.0001;
  if (s.physical.unitSolids * s.quantity < amount) return null;
  s.physical.unitSolids -= amount / s.quantity;
  s.physical.unitMass = s.physical.unitWater + s.physical.unitSolids;
  const id = v7Id(w, 'item');
  w.stacks.push({
    id,
    resource: 'scratch-debris',
    quantity: 0.1,
    quantityTenths: 1,
    owner: s.owner,
    position: { ...s.position },
    origin: s.origin,
    physical: { unitMass: 0.001, unitWater: 0, unitSolids: 0.001 },
    processing: {
      scratchDebris: {
        project,
        source: s.id,
        originalResource: s.resource,
        mass: amount,
      },
    },
  });
  return id;
}
export function scratchStroke(
  w: V7World,
  tool: V7Stack,
  target: V7Stack,
  project: string,
  forceScale = 1,
): V7Data {
  if (!Number.isFinite(forceScale) || forceScale <= 0 || forceScale > 1)
    throw new Error(
      'Controlled contact force scale must remain within the existing safe envelope.',
    );
  const t = scratchPhysical(w, tool),
    s = scratchPhysical(w, target),
    radius = Number(t.edgeRadius),
    force =
      forceScale *
      Math.min(30, 5 + foodUnitMass(w, tool) * tool.quantity * 9.81),
    pressure = force / (Math.PI * radius ** 2);
  const interpretable =
    t.usable === true &&
    s.usable === true &&
    !t.fractured &&
    !s.fractured &&
    !t.contaminated &&
    !s.contaminated;
  const contact = pressure > 1e6 * Math.max(1, Number(s.resistance));
  const groove =
    interpretable &&
    contact &&
    Number(t.resistance) - Number(s.resistance) >= 0.5;
  const toolMaterial = w.resources.find((r) => r.id === tool.resource);
  const powder =
    interpretable &&
    contact &&
    Number(t.resistance) <= Number(s.resistance) &&
    toolMaterial?.nutrition === 0 &&
    toolMaterial.toxicity === 0;
  const worn = groove ? target : powder ? tool : null,
    debris = worn ? dust(w, worn, project) : null;
  if (worn) {
    const state = scratchPhysical(w, worn);
    state.wear = Number(state.wear) + 0.0001;
    state.edgeRadius = Number(state.edgeRadius) + 0.00001;
    worn.processing = {
      ...(worn.processing ?? {}),
      scratchAlteration: {
        project,
        surface: `${worn.id}:contact-surface`,
        groove: groove && worn === target,
        transferredPowder: powder && worn === tool,
        deformation: debris
          ? 'detached abrasive dust'
          : groove
            ? 'retained plastic groove'
            : 'rounded edge',
        wear: state.wear,
        debris,
        strokeAt: w.tick,
      },
    };
  }
  return {
    tool: tool.id,
    target: target.id,
    toolSurface: `${tool.id}:contact-surface`,
    targetSurface: `${target.id}:contact-surface`,
    edgeRadius: radius,
    force,
    pressure,
    interpretable,
    persistentGroove: groove,
    transferredPowder: powder,
    debris,
    detachedMass: debris ? 0.0001 : 0,
    uncertainty: interpretable ? 0.5 : 1,
    inspectedBothSurfaces: true,
    alterations: v7Clone([scratchVisible(w, tool), scratchVisible(w, target)]),
  };
}
