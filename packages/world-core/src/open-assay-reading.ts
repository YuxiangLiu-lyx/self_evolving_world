import type { V7Object, V7Stack, V7World } from './continuous-types.js';
import { foodUnitMass } from './forest-food-accounting.js';
/** Same finite-resolution comparison arithmetic for assay and preservation. */
export function assayRelativeReading(
  w: V7World,
  balance: V7Object,
  sample: V7Stack,
  weight: V7Stack,
) {
  const resolution = Number(balance.data.resolution),
    ratio =
      (foodUnitMass(w, sample) * sample.quantity) /
      (foodUnitMass(w, weight) * weight.quantity);
  return { resolution, reading: Math.round(ratio / resolution) * resolution };
}
