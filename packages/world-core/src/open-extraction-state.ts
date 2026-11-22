import {
  v7Distance,
  v7Obstacles,
  v7SegmentClear,
} from './continuous-geometry.js';
import type {
  V7World,
  V7Actor,
  V7Stack,
  V7Data,
  V7ActionContext,
} from './continuous-types.js';
import { forestResolveReference } from './forest-references.js';
import { v7String, v7Clone, v7Id } from './continuous-data.js';
import { foodTenths, foodSetQuantity } from './forest-food-accounting.js';
import { waterItem, waterReach, waterPoint } from './open-water-state.js';
import { assayNearby } from './open-assay-equipment.js';
import { wovenDrift } from './open-woven-contract.js';
export const EXTRACTION_LIMIT =
  'Not a safety or nutrition certificate. Solubility does not establish digestibility, nutrient identity, sterility or toxin absence.';
export interface ExtractionArm extends V7Data {
  source: string;
  origin: string;
  tissue: string;
  liquid: string;
  cup: string;
  initialSolids: number;
  extracted: number;
  mixedAt: number;
  lastWater: number;
  leakedSolids: number;
  contactRounds: number;
  separated: boolean;
  baseline: V7Data | null;
}
export interface ExtractionWork extends V7Data {
  id: string;
  owner: string;
  stage: number;
  paid: number;
  status: string;
  balance: string;
  weight: string;
  tray: string;
  water: string;
  waterMl: number;
  quantityTenths: number;
  suppliedApparatus: string[];
  arms: ExtractionArm[];
  readings: V7Data[];
  x: number;
  y: number;
  invalid: string[];
}
export const extractionKey = (owner: string, id: string) =>
  `extraction:${owner}:${id}`;
export function extractionWork(
  w: V7World,
  a: V7Actor,
  id: string,
): ExtractionWork {
  const j = w.state[extractionKey(a.id, id)];
  if (!j || typeof j !== 'object' || Array.isArray(j))
    throw new Error('No exact personally owned extraction project.');
  return j as ExtractionWork;
}
export function extractionId(c: V7ActionContext, ref: unknown): string {
  return forestResolveReference(
    c.world,
    c.actor,
    v7String(ref, 'exact apparatus identity'),
    'optional-exact-visible',
  );
}
export function extractionEquipment(
  c: V7ActionContext,
  ids: string[],
  retainedKey = '',
) {
  if (ids.length !== 5 || new Set(ids).size !== 5)
    throw new Error(
      'Apparatus roles must be five distinct exact IDs: calibrated balance, original weight, tray, sample cup, reference cup.',
    );
  const balance = assayNearby(c, ids[0] ?? '', 'comparison-balance'),
    tray = assayNearby(c, ids[2] ?? '', 'drying-tray');
  const weight = waterItem(c.world, c.actor, ids[1] ?? ''),
    cups = ids.slice(3).map((id) => {
      if (!retainedKey) return waterItem(c.world, c.actor, id);
      const s = c.world.stacks.find(
        (s) => s.id === id && s.reservedFor === retainedKey,
      );
      if (!s || !waterReach(c.world, c.actor, waterPoint(c.world, s)))
        throw new Error(
          'The original escrowed cup must remain physically reachable.',
        );
      return s;
    });
  if (
    weight.owner !== c.actor.id ||
    weight.reservedFor ||
    balance.data.calibrated !== true ||
    !Array.isArray(balance.data.calibrationHistory) ||
    balance.data.calibrationHistory.length !== 3 ||
    !Array.isArray(balance.data.weights) ||
    !balance.data.weights.includes(weight.id) ||
    wovenDrift(balance)
  )
    throw new Error(
      'A personally held original comparison weight and maintained calibrated balance are required.',
    );
  if (cups.some((s) => !s.waterCup || Number(s.waterCup.wallMass) < 0.45))
    throw new Error('Two intact physical cups are required.');
  for (const o of [balance, tray])
    if (
      !v7SegmentClear(
        c.actor.position,
        o.spatial,
        0,
        v7Obstacles(c.world).filter((shape) => shape !== o.spatial),
      )
    )
      throw new Error('Actual apparatus requires a clear hand-access segment.');
  const first = cups[0],
    second = cups[1];
  if (
    first &&
    second &&
    v7Distance(waterPoint(c.world, first), waterPoint(c.world, second)) < 0.06
  )
    throw new Error('Two actual cup footprints cannot overlap.');
  return { balance, weight, tray, cups };
}
export function extractionData(s: V7Stack): V7Data {
  const d = s.processing?.extraction;
  if (!d || typeof d !== 'object' || Array.isArray(d))
    throw new Error('Missing retained analytical material lineage.');
  return d;
}
/** Analytical material retains nutrients/toxins as an explicit unresolved account; it is not an automatically edible new food. */
export function extractionPortion(
  c: V7ActionContext,
  source: V7Stack,
  n: number,
  key: string,
): V7Stack {
  const r = c.world.resources.find((r) => r.id === source.resource);
  if (!r || !['root', 'tuber'].includes(r.id))
    throw new Error(
      'Only modeled root/tuber composition is available; unsupported materials remain unknown.',
    );
  const p = source.physical ?? {
    unitMass: r.mass,
    unitWater: r.mass * 0.75,
    unitSolids: r.mass * 0.25,
  };
  if (
    Math.abs(p.unitMass - p.unitWater - p.unitSolids) > 1e-7 ||
    p.unitSolids < 0 ||
    p.unitWater < 0
  )
    throw new Error('Inconsistent actual composition.');
  const q = n / 10;
  const out: V7Stack = {
    ...v7Clone(source),
    id: v7Id(c.world, 'item'),
    resource: 'extraction-material',
    quantity: 1,
    quantityTenths: 10,
    reservedFor: key,
    physical: {
      unitMass: p.unitMass * q,
      unitWater: p.unitWater * q,
      unitSolids: p.unitSolids * q,
    },
    processing: {
      ...v7Clone(source.processing ?? {}),
      extraction: {
        source: source.id,
        origin: source.origin,
        originalResource: r.id,
        originalQuantity: q,
        nutrition: q * r.nutrition,
        toxins: q * r.toxicity,
        decay: source.decay ?? 0,
        lifetime: r.properties?.decay ?? 0,
        model: 'root-tuber-aqueous-partition@1',
        initialization: source.physical
          ? 'Retained represented composition'
          : 'Authored physical assumption: water fraction 0.75; not measured',
        extractableFraction: 0.2,
        role: 'tissue',
        location: 'allocated',
        limitation: EXTRACTION_LIMIT,
      },
    },
  };
  delete out.processing?.preservationPhysics;
  foodSetQuantity(source, foodTenths(source.quantity) - n);
  c.world.stacks.push(out);
  return out;
}
export function extractionEmpty(
  c: V7ActionContext,
  source: V7Stack,
  role: string,
): V7Stack {
  const s = {
    ...v7Clone(source),
    id: v7Id(c.world, 'item'),
    physical: { unitMass: 0, unitWater: 0, unitSolids: 0 },
  };
  const d = extractionData(s);
  d.nutrition = 0;
  d.toxins = 0;
  d.originalQuantity = 0;
  d.role = role;
  c.world.stacks.push(s);
  return s;
}
/** Transfer tracked constituents; no nutrient/toxin inference, destruction or creation. */
export function extractionTransfer(
  from: V7Stack,
  to: V7Stack,
  solid: number,
  water = 0,
) {
  if (
    !from.physical ||
    !to.physical ||
    solid < 0 ||
    water < 0 ||
    solid > from.physical.unitSolids + 1e-9 ||
    water > from.physical.unitWater + 1e-9
  )
    throw new Error('Invalid conserved analytical transfer.');
  const a = extractionData(from),
    b = extractionData(to),
    fraction =
      from.physical.unitSolids > 0 ? solid / from.physical.unitSolids : 0;
  for (const k of ['nutrition', 'toxins', 'originalQuantity']) {
    const amount = Number(a[k]) * fraction;
    a[k] = Number(a[k]) - amount;
    b[k] = Number(b[k]) + amount;
  }
  from.physical.unitSolids -= solid;
  to.physical.unitSolids += solid;
  from.physical.unitWater -= water;
  to.physical.unitWater += water;
  from.physical.unitMass = from.physical.unitSolids + from.physical.unitWater;
  to.physical.unitMass = to.physical.unitSolids + to.physical.unitWater;
}
