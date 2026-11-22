import type { V7World, V7Object, V7Stack, V7Data } from './continuous-types.js';
import { foodUnitMass } from './forest-food-accounting.js';
import { wovenTare } from './open-woven-calibration.js';
import type { WovenWork } from './open-woven-work.js';
/** Conditional shared apparatus contract: existing bark equipment follows its unchanged path. */
export function wovenRetention(
  w: V7World,
  b: V7Object,
  t: V7Object,
  s: V7Stack,
  quantity: number,
): { reason: string | null; diameter: number; aperture: number } {
  if (b.data.variant !== 'woven' && t.data.variant !== 'woven')
    return { reason: null, diameter: 0, aperture: 0 };
  const aperture = Math.max(
    Number(b.data.aperture ?? 0),
    Number(t.data.aperture ?? 0),
  );
  const physical = s.physical,
    mass = foodUnitMass(w, s) * quantity;
  // One represented solid piece; opened tissue is represented as four fragments. No apparent name establishes retention.
  const pieces = s.processing?.foodExamination ? 4 : 1;
  const diameter = 2 * Math.cbrt((3 * mass) / (4 * Math.PI * 900 * pieces));
  const p = s.processing ?? {},
    form = p.form,
    crumbles = p.crumbling === true;
  let reason: string | null = null;
  if (
    ['liquid', 'powder'].includes(typeof form === 'string' ? form : '') ||
    crumbles ||
    (s.decay ?? 0) >=
      0.75 *
        (w.resources.find((r) => r.id === s.resource)?.properties?.decay ??
          Infinity)
  )
    reason =
      'Liquid, powder, crumbling or deteriorated material is not retained by open mesh.';
  else if (diameter <= aperture * 1.2)
    reason =
      'Actual sample/fragment dimensions do not clear the measured aperture with retention margin.';
  else if (physical && physical.unitSolids <= 0)
    reason = 'No actual solid piece can remain in the mesh.';
  else if (
    mass * 9.81 * 2 >
    Math.min(
      Number(b.data.safeWorkingLoad ?? Infinity),
      Number(t.data.safeWorkingLoad ?? Infinity),
    )
  )
    reason =
      'Actual sample load exceeds the tested conservative working range.';
  return { reason, diameter, aperture };
}
export function wovenDrift(b: V7Object): string | null {
  if (b.data.variant !== 'woven') return null;
  const delta = Math.abs(wovenTare(b) - Number(b.data.calibrationTare ?? 0));
  if (
    b.data.calibrated !== true ||
    delta > 0.0003 ||
    Math.abs(Number(b.data.creep ?? 0) - Number(b.data.calibrationCreep ?? 0)) >
      0.005
  ) {
    b.data.calibrated = false;
    return 'Actual basket tare or suspension drift changed; three new paid calibration readings are required.';
  }
  return null;
}
/** Actual contact water leaves the support, enters the sample, and invalidates that analytical estimate. */
export function wovenContact(w: V7World, t: V7Object, s: V7Stack): number {
  if (t.data.variant !== 'woven' || !s.physical) return 0;
  const j = Object.values(w.state).find(
    (v) =>
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      v.mode === 'assemble' &&
      v.mesh === t.id,
  ) as WovenWork | undefined;
  const raw = j?.components.find((c) => c.component === 'woven mesh');
  if (!raw) return 0;
  const component = raw as unknown as V7Stack,
    m = component.physical;
  if (!m) return 0;
  const excess = Math.max(0, m.unitWater - m.unitSolids * 0.3),
    transfer = Math.min(0.0001, excess * component.quantity);
  if (transfer <= 1e-9) return 0;
  m.unitWater -= transfer / component.quantity;
  m.unitMass = m.unitSolids + m.unitWater;
  s.physical.unitWater += transfer / s.quantity;
  s.physical.unitMass = s.physical.unitWater + s.physical.unitSolids;
  const ledger = (w.state['woven:contact-water'] ?? {}) as V7Data;
  ledger[t.id] = Number(ledger[t.id] ?? 0) + transfer;
  w.state['woven:contact-water'] = ledger;
  return transfer;
}
