import type {
  V7World,
  V7Stack,
  V7Data,
  V7Package,
} from './continuous-types.js';
import { foodUnitMass } from './forest-food-accounting.js';
import { v7Clone } from './continuous-data.js';
export interface PoleShape extends V7Data {
  unit: string;
  source: string;
  slot: number;
  seed: number;
  version: number;
  length: number;
  diameter: number;
  taper: number;
  curvature: number;
  defects: number;
  density: number;
  modulus: number;
  strength: number;
  unitMass: number;
  water: number;
  solid: number;
  provenance: string;
}
const allocationKey = (id: string) => `geometry:allocation:${id}`;
function random(key: string) {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h / 4294967296;
}
function sampled(
  w: V7World,
  source: string,
  slot: number,
  mass: number,
): PoleShape {
  const seed = w.config.seed,
    key = `${String(seed)}:${source}:${String(slot)}`,
    slenderness = 15 + 55 * random(`${key}:slenderness`),
    taper = 0.45 + 0.45 * random(`${key}:taper`),
    density = 600,
    water = mass * 0.5,
    solid = mass - water,
    diameter = Math.cbrt(
      (12 * solid) /
        density /
        (Math.PI * slenderness * (1 + taper + taper ** 2)),
    ),
    length = slenderness * diameter;
  return {
    unit: `${source}:${String(slot)}`,
    source,
    slot,
    seed,
    version: 1,
    length,
    diameter,
    taper,
    curvature: 0.015 + 0.1 * random(`${key}:curve`),
    defects: 0.05 + 0.4 * random(`${key}:defects`),
    density,
    modulus: 4e9,
    strength: 45e6,
    unitMass: mass,
    water,
    solid,
    provenance:
      'material-geometry@1 physical-model addition; not measured evidence',
  };
}
function allocation(w: V7World, s: V7Stack): string[] | null {
  const a = w.state[allocationKey(s.id)] as V7Data | undefined;
  return a && a.quantity === s.quantity && Array.isArray(a.units)
    ? a.units.filter((x): x is string => typeof x === 'string')
    : null;
}
function setAllocation(w: V7World, s: V7Stack, units: string[]) {
  w.state[allocationKey(s.id)] = { quantity: s.quantity, units };
}
/** Only exact conserved, whole-unit allocations have a reconstructible pole shape. */
export function poleShapes(w: V7World, s: V7Stack): PoleShape[] {
  if (!w.revisions.includes('material-geometry@1') || s.resource !== 'branch')
    return [];
  const ids = allocation(w, s);
  if (!ids || ids.length !== s.quantity || !Number.isInteger(s.quantity))
    return [];
  return ids.flatMap((id) => {
    const shape = w.state[`geometry:unit:${id}`] as PoleShape | undefined;
    return shape && typeof shape === 'object' && !Array.isArray(shape)
      ? [shape]
      : [];
  });
}
export function poleShape(w: V7World, s: V7Stack): PoleShape | null {
  const shapes = poleShapes(w, s);
  if (shapes.length !== 1 || s.quantity !== 1 || s.processing?.metrologyDamage)
    return null;
  const p = shapes[0];
  if (
    !p ||
    s.processing?.scratchAlteration ||
    s.processing?.wovenDamage ||
    s.processing?.refugeTest ||
    s.processing?.refugeSalvage ||
    (s.physical && Math.abs(s.physical.unitSolids - p.solid) > 1e-8)
  )
    return null;
  return p;
}
/** Called only after an actual finite source debit and actual stack creation. */
export function geometryGather(w: V7World, s: V7Stack) {
  if (!w.revisions.includes('material-geometry@1') || s.resource !== 'branch')
    return;
  const pool = w.state[`geometry:pool:${s.origin}`] as V7Data | undefined;
  if (!pool || !Array.isArray(pool.available) || !Number.isInteger(s.quantity))
    return;
  if (pool.available.length < s.quantity) return;
  const ids = pool.available
    .splice(0, s.quantity)
    .filter((x): x is string => typeof x === 'string');
  setAllocation(w, s, ids);
}
/** Basic transfer preserves exact unit lineage. Cutting fractional quantities invalidates geometry, never duplicates it. */
export function geometryTransfer(w: V7World, source: V7Stack, part: V7Stack) {
  if (
    !w.revisions.includes('material-geometry@1') ||
    source.resource !== 'branch'
  )
    return;
  const a = w.state[allocationKey(source.id)] as V7Data | undefined;
  if (
    !a ||
    !Array.isArray(a.units) ||
    a.quantity !== source.quantity + part.quantity
  )
    return;
  if (!Number.isInteger(source.quantity) || !Number.isInteger(part.quantity)) {
    w.state[allocationKey(source.id)] = {
      quantity: source.quantity,
      units: [],
      unresolved: 'Actual fractional split; shape not inferred',
    };
    return;
  }
  const units = a.units.filter((x): x is string => typeof x === 'string');
  setAllocation(w, part, units.slice(0, part.quantity));
  setAllocation(w, source, units.slice(part.quantity));
}
export const MATERIAL_GEOMETRY: V7Package = {
  id: 'material-geometry',
  version: 1,
  scope: 'open-ex10',
  dependencies: ['foundation-open@1'],
  description:
    'Versioned finite source-slot tapered geometry; no added stock, inferred bark, measured evidence or structural certificate.',
  abilities: [],
  resources: [],
  satisfaction: [],
  handlers: {},
  processes: {},
  visualComponents: ['rock'],
  migrate(w) {
    const mass = w.resources.find((r) => r.id === 'branch')?.mass ?? 1.1;
    for (const source of w.objects.filter(
      (o) => o.data.resource === 'branch' && o.data.interval === 0,
    )) {
      const capacity = Number(source.data.capacity),
        stock = Number(source.data.stock);
      if (
        !Number.isInteger(capacity) ||
        !Number.isInteger(stock) ||
        capacity < stock
      )
        continue;
      const used = capacity - stock,
        old = w.state[`woven:law:branch:${source.id}`] as V7Data | undefined;
      for (let i = 0; i < capacity; i++) {
        const shape = sampled(w, source.id, i, mass);
        if (old) {
          shape.length = Number(old.length);
          shape.density = Number(old.density);
          shape.diameter = Math.sqrt(
            (4 * shape.solid) / (Math.PI * shape.density * shape.length),
          );
          shape.taper = 1;
          shape.curvature = 0;
          shape.defects = 0;
          shape.provenance =
            'Previously represented source law preserved; not new measured evidence';
        }
        w.state[`geometry:unit:${shape.unit}`] = shape;
      }
      // Reserve already withdrawn slots first. Only intact surviving whole units can be reconciled.
      const held = w.stacks
        .filter(
          (s) =>
            s.origin === source.id &&
            s.resource === 'branch' &&
            Number.isInteger(s.quantity) &&
            s.quantity > 0 &&
            !s.processing &&
            Math.abs(foodUnitMass(w, s) - mass) < 1e-8,
        )
        .sort(
          (a, b) =>
            (a.harvestedAt ?? 0) - (b.harvestedAt ?? 0) ||
            a.id.localeCompare(b.id),
        );
      const retained = held.reduce((n, s) => n + s.quantity, 0);
      let slot = Math.max(0, used - retained);
      if (retained <= used)
        for (const s of held) {
          const ids = Array.from(
            { length: s.quantity },
            () => `${source.id}:${String(slot++)}`,
          );
          setAllocation(w, s, ids);
        }
      w.state[`geometry:pool:${source.id}`] = {
        capacity,
        usedAtMigration: used,
        retainedWholeUnits: retained,
        unresolvedWithdrawals: Math.max(0, used - retained),
        migratedAt: w.tick,
        available: Array.from(
          { length: stock },
          (_, i) => `${source.id}:${String(used + i)}`,
        ),
      };
    }
    return w;
  },
};
export function poleMeasurement(
  w: V7World,
  actor: string,
  s: V7Stack,
): V7Data | null {
  const p = poleShape(w, s);
  if (!p) return null;
  const record = w.state[`metrology:measured:${actor}:${p.unit}`] as
    V7Data | undefined;
  return record ? v7Clone(record) : null;
}
