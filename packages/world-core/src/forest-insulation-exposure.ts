import type { V7Actor, V7Data, V7World } from './continuous-types.js';
import { v7RoundNumber } from './continuous-data.js';

/** Applied once by the physical exposure solver, never by an achievement or inventory label. */
export function insulationExposure(
  w: V7World,
  a: V7Actor,
  before: number,
  temperature: number,
  coldLoss: number,
  climate: { indoor: boolean; rain?: number },
  emit: (type: string, item: string, data: V7Data) => void,
): number {
  if (w.state.portableInsulation !== 1) return temperature;
  const item = w.stacks.find(
      (s) => s.owner === a.id && s.mantle?.equipped && s.quantity === 1,
    ),
    m = item?.mantle;
  if (!item || !m || m.lastTick === w.tick) return temperature;
  if (item.canopyDrying?.tick !== w.tick)
    m.moisture = v7RoundNumber(
      Math.max(
        0,
        Math.min(
          1,
          m.moisture +
            (!climate.indoor && (climate.rain ?? 0) > 0 ? 0.1 : -0.02),
        ),
      ),
    );
  const factor = (0.25 - 0.15 * m.moisture) * Math.min(1, m.condition / 40),
    avoided = coldLoss * factor;
  const result = v7RoundNumber(temperature + avoided);
  const previousCondition = m.condition;
  m.condition = Math.max(0, m.condition - 1);
  m.lastTick = w.tick;
  const measurement = {
    tick: w.tick,
    item: item.id,
    beforeTemperature: before,
    unprotectedTemperature: temperature,
    temperature: result,
    netChange: v7RoundNumber(result - before),
    avoidedCooling: avoided,
    remainingCooling: coldLoss - avoided,
    coldDiscomfort: Math.max(0, 16 - result) / 12,
    unprotectedColdDiscomfort: Math.max(0, 16 - temperature) / 12,
    condition: m.condition,
    moisture: m.moisture,
  };
  a.extensionState['insulation:exposure'] = measurement;
  emit('insulation-exposure-measured', item.id, measurement);
  const drying = item.canopyDrying;
  if (drying?.tick === w.tick) {
    const counterfactual =
      temperature +
      coldLoss *
        (0.25 - 0.15 * drying.before) *
        Math.min(1, previousCondition / 40);
    const data = {
      ...drying,
      item: item.id,
      equipped: true,
      participant: a.id,
      temperature: result,
      counterfactualTemperature: v7RoundNumber(counterfactual),
      avoidedCooling: Math.max(0, result - counterfactual),
      coldDiscomfort: Math.max(0, 16 - result) / 12,
      counterfactualColdDiscomfort: Math.max(0, 16 - counterfactual) / 12,
    };
    a.extensionState['canopy:exposure'] = data;
    emit('rain-canopy-exposure-measured', drying.canopy, data);
  }
  if (previousCondition > 0 && !m.condition)
    emit('insulation-worn-out', item.id, { condition: 0 });
  return result;
}
