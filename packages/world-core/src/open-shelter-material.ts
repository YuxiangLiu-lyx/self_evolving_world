import {
  poleShapes,
  poleMeasurement,
  poleShape,
} from './open-material-geometry.js';
import type {
  V7World,
  V7Stack,
  V7Data,
  V7ActionContext,
} from './continuous-types.js';
import { v7Record, v7String, v7Number } from './continuous-data.js';
import { forestResolveReference } from './forest-references.js';
import { wovenHydrate } from './open-woven-physics.js';
import { foodUnitMass } from './forest-food-accounting.js';

/** Once-per-source geometry. Previously measured woven laws take precedence, including short beams. */
export function refugeMaterial(w: V7World, s: V7Stack): V7Data {
  if (!['branch', 'reed', 'vine'].includes(s.resource))
    throw new Error('Actual branch, reed or vine material is required.');
  const shapes = poleShapes(w, s);
  if (shapes.length) {
    wovenHydrate(w, s);
    const p = shapes[0];
    if (!p) throw new Error('Missing represented shape.');
    const mass = foodUnitMass(w, s),
      water = s.physical?.unitWater ?? p.water,
      diameter = Math.min(...shapes.map((p) => p.diameter * p.taper)),
      length = Math.min(...shapes.map((p) => p.length - 2 * p.curvature)),
      wet = water / mass,
      area = (Math.PI * diameter ** 2) / 4;
    return {
      version: 'material-geometry@1',
      resource: s.resource,
      origin: s.origin,
      length,
      diameter,
      density: p.density,
      modulus: p.modulus,
      strength: p.strength,
      unitMass: mass,
      water,
      solid: mass - water,
      wetness: wet,
      area,
      volume: (mass - water) / p.density,
      intact:
        !s.processing?.metrologyDamage &&
        !s.processing?.refugeSalvage &&
        !s.processing?.refugeTest &&
        !s.processing?.wovenSpecimen &&
        !s.processing?.scratchSpecimen &&
        !s.processing?.wovenDamage,
      capacity:
        (p.strength *
          (1 - p.defects) *
          (1 - 0.6 * wet) *
          Math.PI *
          (diameter / 2) ** 3) /
        Math.max(length, 0.01),
      matArea: 0,
      creep: 0.0005,
      wetWeakening: 0.6,
    };
  }
  const key = `woven:law:${s.resource}:${s.origin}`;
  if (
    w.revisions.includes('material-geometry@1') &&
    s.resource === 'branch' &&
    !w.state[key]
  )
    throw new Error(
      'Branch shape is unresolved after alteration or source allocation; no replacement geometry is inferred.',
    );
  let law = w.state[key] as V7Data | undefined;
  if (!law) {
    law = {
      version: 2,
      resource: s.resource,
      origin: s.origin,
      length: s.resource === 'branch' ? 2 : s.resource === 'reed' ? 1.8 : 3,
      density: s.resource === 'branch' ? 350 : 500,
      modulus: s.resource === 'branch' ? 4e9 : 2e8,
      strength: s.resource === 'branch' ? 45e6 : 8e6,
      wetWeakening: s.resource === 'branch' ? 0.6 : 0.55,
      creep: s.resource === 'branch' ? 0.0005 : 0.003,
    };
    w.state[key] = law;
  }
  wovenHydrate(w, s);
  const mass = foodUnitMass(w, s),
    water = s.physical?.unitWater ?? 0,
    solid = s.physical?.unitSolids ?? mass,
    length = Number(law.length),
    area = solid / (Number(law.density) * length),
    radius = Math.sqrt(area / Math.PI),
    wet = water / Math.max(0.000001, mass),
    strength = Number(law.strength) * (1 - Number(law.wetWeakening) * wet),
    intact =
      !s.processing?.refugeTest &&
      !s.processing?.wovenSpecimen &&
      !s.processing?.scratchSpecimen &&
      !s.processing?.refugeSalvage &&
      !s.processing?.wovenDamage;
  return {
    ...law,
    unitMass: mass,
    water,
    solid,
    diameter: radius * 2,
    wetness: wet,
    intact,
    area,
    volume: solid / Number(law.density),
    capacity:
      s.resource === 'branch'
        ? (strength * Math.PI * radius ** 3) / length
        : strength * area * 0.12,
    // Reed bundles weave into a porous mat; actual material volume fixes its area.
    matArea: s.resource === 'reed' ? solid / Number(law.density) / 0.0004 : 0,
  };
}
export function refugeInputs(c: V7ActionContext) {
  const raw = c.action.args.materials;
  if (!Array.isArray(raw))
    throw new Error('Explicit material allocations are required.');
  const result = raw.map((v) => {
    const r = v7Record(v),
      supplied = v7String(r.item, 'exact material ID'),
      id =
        c.world.state.refugeDiagnostics === 1 && supplied.startsWith('item:')
          ? supplied.slice(5)
          : supplied,
      q = v7Number(r.quantity, 'quantity', 0.1);
    if (Math.abs(q * 10 - Math.round(q * 10)) > 1e-8)
      throw new Error('Material allocations use actual tenths of a unit.');
    if (!c.world.stacks.some((s) => s.id === id && s.owner === c.actor.id))
      throw new Error(
        'Use an exact owned persistent item ID, not an alias or encoded marker.',
      );
    forestResolveReference(c.world, c.actor, id, 'owned');
    const s = c.world.stacks.find((s) => s.id === id);
    if (!s || s.reservedFor || s.quantity < q)
      throw new Error('Actual unreserved quantity is insufficient.');
    const material = refugeMaterial(c.world, s);
    if (poleShapes(c.world, s).length) {
      const measurement = poleMeasurement(c.world, c.actor.id, s);
      material.length = measurement?.usableLengthLower ?? 0;
    }
    return { s, q, material };
  });
  if (new Set(result.map((r) => r.s.id)).size !== result.length)
    throw new Error('Duplicate material allocation.');
  return result;
}
export const refugeTestKey = (owner: string, s: V7Stack) =>
  `refuge:test:${owner}:${s.resource}:${s.origin}`;
export function refugeCapacity(w: V7World, owner: string, s: V7Stack): number {
  const p = poleShape(w, s);
  if (p) {
    const tested = w.state[`metrology:tested:${owner}:${p.unit}`] as
      V7Data | undefined;
    const wet = (s.physical?.unitWater ?? p.water) / foodUnitMass(w, s);
    return tested?.passed === true &&
      Number(tested.span) >= 1.8 &&
      wet <= Number(tested.wetness) + 1e-8
      ? Math.min(
          Number(tested.safeCapacity),
          Number(refugeMaterial(w, s).capacity),
        )
      : 0;
  }
  if (poleShapes(w, s).length) return 0;
  const record = w.state[refugeTestKey(owner, s)] as V7Data | undefined;
  return record?.passed === true
    ? Math.min(
        Number(record.safeCapacity),
        Number(refugeMaterial(w, s).capacity),
      )
    : 0;
}
