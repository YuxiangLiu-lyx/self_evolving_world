import type { V7World, V7Actor, V7Data, V7Object } from './continuous-types.js';
import {
  v7Distance,
  v7Obstacles,
  v7SegmentClear,
} from './continuous-geometry.js';
import { v7RoundNumber } from './continuous-data.js';

export interface FireLot extends V7Data {
  item: string;
  resource: string;
  quantity: number;
  mass: number;
  energy: number;
  moisture: number;
}
export interface FireState extends V7Data {
  condition: number;
  lit: boolean;
  embers: number;
  lots: FireLot[];
  inputs: V7Data[];
  ash: number;
  releasedMass: number;
  burnedMass: number;
  burnFraction: number;
  rain: number;
  wind: number;
  moisture: number;
  lastTick: number;
  history: V7Data[];
}
export const fireState = (o: V7Object): FireState => o.data as FireState;
/** Heat enters the physical solver before ordinary cold/overheat damage, exactly once per source. */
export function fireExposure(
  w: V7World,
  a: V7Actor,
  temperature: number,
  emit: (id: string, data: V7Data) => void,
): number {
  if (w.state.localFire !== 1) return temperature;
  let heat = 0;
  const sources: string[] = [];
  for (const o of w.objects.filter((o) => o.kind === 'stone-hearth')) {
    const f = fireState(o),
      d = v7Distance(a.position, o.spatial);
    if (f.lastTick !== w.tick || f.burnFraction <= 0 || d >= 2) continue;
    const edge = {
      x: o.spatial.x + ((a.position.x - o.spatial.x) / d) * 0.451,
      y: o.spatial.y + ((a.position.y - o.spatial.y) / d) * 0.451,
    };
    if (
      !v7SegmentClear(
        a.position,
        edge,
        0,
        v7Obstacles({
          ...w,
          objects: w.objects.filter((other) => other.id !== o.id),
        }),
      )
    )
      continue;
    const gain =
      0.6 * f.burnFraction * Math.max(0, 1 - d / 2) * (1 - 0.5 * f.wind);
    heat += gain;
    sources.push(o.id);
    emit(o.id, {
      gain,
      burnFraction: f.burnFraction,
      distance: d,
      wind: f.wind,
    });
  }
  const result = v7RoundNumber(temperature + heat);
  a.extensionState['fire:exposure'] = {
    tick: w.tick,
    heat,
    sources,
    before: temperature,
    after: result,
    reducedCold: Math.max(0, 16 - temperature) - Math.max(0, 16 - result),
  };
  return result;
}
