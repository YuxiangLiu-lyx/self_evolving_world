import { smallSupportValidity } from './collective-small-drying-site.js';
import { v7RoundNumber } from './continuous-data.js';
import type { V7Stack, V7World, V7Data } from './continuous-types.js';
import { v7Interior } from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { refugeRay } from './open-shelter-geometry.js';
import { rootProcessing, rootDecayRate } from './collective-root-food.js';
/** Actual per-lot exchange precedes this round's decay, including after unloading. */
export function rootWater(w: V7World, s: V7Stack): void {
  const p = rootProcessing(w, s),
    physical = s.physical;
  if (
    !p ||
    !physical ||
    !p.drying ||
    p.fraction <= 0 ||
    p.lastTick === w.tick ||
    s.quantity <= 0
  )
    return;
  p.lastTick = w.tick;
  const tray = w.objects.find((o) => o.id === p.tray),
    owner = w.actors.find((a) => a.id === s.owner),
    point = tray?.spatial ?? owner?.position ?? s.position,
    climate = forestClimate(w, point);
  const covered =
    climate.indoor ||
    w.objects.some(
      (o) =>
        (o.kind === 'open-refuge' && refugeRay(o, point, 0, 0) >= 0.99) ||
        (o.kind === 'weather-lean-to' &&
          Number(o.data.integrity) >= 0.99 &&
          v7Interior(point, o.spatial)),
    );
  const small =
    p.smallSupport || tray?.kind === 'small-root-drying-support'
      ? tray?.kind === 'small-root-drying-support'
        ? smallSupportValidity(w, tray)
        : {
            valid: false,
            reason: 'Evaporation paused: actual small support is missing.',
          }
      : null;
  const rain = covered ? 0 : (climate.rain ?? 0),
    before = physical.unitWater,
    minimum = v7RoundNumber((physical.unitSolids * 0.12) / 0.88);
  let status = small && !small.valid ? small.reason : 'Exposure paused';
  if (rain > 0) {
    physical.unitWater = Math.min(
      p.originalWater,
      physical.unitWater + 0.01 * rain,
    );
    status = 'Rain rewetting';
  } else if (
    !covered &&
    (!small || small.valid) &&
    climate.temperature >= 10 &&
    climate.temperature <= 40
  ) {
    physical.unitWater = Math.max(
      minimum,
      physical.unitWater - 0.005 * p.fraction * (small ? 0.5 : 1),
    );
    status = 'Passive drying';
  }
  physical.unitWater = v7RoundNumber(physical.unitWater);
  physical.unitMass = v7RoundNumber(physical.unitWater + physical.unitSolids);
  const evaporated = Math.max(0, before - physical.unitWater) * s.quantity,
    received = Math.max(0, physical.unitWater - before) * s.quantity,
    wasDry = p.dry;
  p.evaporated += evaporated;
  p.receivedWater += received;
  p.dry =
    p.fraction >= 1 && physical.unitWater / physical.unitMass <= 0.12 + 1e-7;
  const ledger = (w.state['collective:root-water'] ?? {}) as V7Data;
  ledger.evaporated = Number(ledger.evaporated ?? 0) + evaporated;
  ledger.received = Number(ledger.received ?? 0) + received;
  w.state['collective:root-water'] = ledger;
  const row = {
    ...(small
      ? {
          exposureMultiplier: 0.5,
          supportCondition: small,
          accumulatedAge: s.decay ?? 0,
          performer: p.depositor,
          support: p.tray,
        }
      : {}),
    tick: w.tick,
    temperature: climate.temperature,
    rain,
    covered,
    status,
    evaporated,
    received,
    waterFraction: physical.unitWater / physical.unitMass,
    unitMass: physical.unitMass,
    massRatio: physical.unitMass / p.originalUnitMass,
    remainingWaterRemoval:
      Math.max(0, physical.unitWater - minimum) * s.quantity,
    decayMultiplier: rootDecayRate(w, s),
  };
  p.history = [...p.history, row].slice(-12);
  if (tray) tray.data.food = { id: s.id, quantity: s.quantity, ...row };
  if (evaporated > 0 || received > 0)
    forestEvent(
      w,
      received > 0
        ? 'food-rewetted'
        : small
          ? 'small-drying-progress'
          : 'food-drying-progress',
      status,
      point,
      s.owner,
      { item: s.id, ...row },
      tray?.id ?? s.id,
    );
  if (p.dry && !wasDry)
    forestEvent(
      w,
      'food-drying-completed',
      'Actual water fraction reached 0.12; lower decay applies only while dry. Nutrition and accumulated spoilage are unchanged.',
      point,
      s.owner,
      { item: s.id, ...row },
      tray?.id ?? s.id,
    );
}
export function rootAge(w: V7World, s: V7Stack, ambient: number) {
  const p = rootProcessing(w, s),
    actual = ambient * rootDecayRate(w, s);
  if (p) {
    p.baselineDecay += ambient;
    p.actualDecay += actual;
  }
  return actual;
}
