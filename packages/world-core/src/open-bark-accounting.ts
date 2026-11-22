import type { V7Data, V7Stack, V7Object, V7World } from './continuous-types.js';
import { v7Clone } from './continuous-data.js';
export interface BarkLayer extends V7Data {
  resource: string;
  unitMass: number;
  unitLayerMass: number;
  separable: boolean;
  sheetArea: number;
  moisture: number;
  evidence: string;
}
export function barkLayer(value: unknown): BarkLayer | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const d = value as V7Data;
  if (
    typeof d.resource !== 'string' ||
    typeof d.separable !== 'boolean' ||
    typeof d.evidence !== 'string' ||
    !d.evidence
  )
    return null;
  for (const key of ['unitMass', 'unitLayerMass', 'sheetArea', 'moisture'])
    if (typeof d[key] !== 'number' || !Number.isFinite(d[key]) || d[key] < 0)
      return null;
  if (Number(d.unitLayerMass) > Number(d.unitMass) + 1e-8) return null;
  return d as BarkLayer;
}
/** Gathering transfers the same intensive composition, after finite source stock is debited. */
export function barkGatherState(object: V7Object): Partial<V7Stack> {
  if (object.data.barkLock)
    throw new Error(
      'This actual substrate is locked by unfinished bark extraction.',
    );
  const p = barkLayer(object.data.materialLayer);
  if (!p) return {};
  return {
    materialLayer: v7Clone(p),
    physical: { unitMass: p.unitMass, unitWater: 0, unitSolids: p.unitMass },
  };
}
export function barkSubstrate(w: V7World, id: string) {
  const stack = w.stacks.find((s) => s.id === id),
    object = w.objects.find((o) => o.id === id);
  const layer = barkLayer(stack?.materialLayer ?? object?.data.materialLayer);
  return {
    stack,
    object,
    layer,
    quantity: stack?.quantity ?? Number(object?.data.stock ?? 0),
    resource:
      stack?.resource ??
      (typeof object?.data.resource === 'string'
        ? object.data.resource
        : 'unknown'),
  };
}
