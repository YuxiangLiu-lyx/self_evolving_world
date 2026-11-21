import { forestFireFuel } from './forest-material-compatibility.js';
import type { V7Actor, V7Data, V7Object, V7World } from './continuous-types.js';
import { forestClimate, forestEvent } from './forest-environment.js';
import { v7RoundNumber } from './continuous-data.js';
import { fireState } from './forest-fire-exposure.js';

export function fireEvent(
  w: V7World,
  a: V7Actor | null,
  type: string,
  target: string,
  data: V7Data = {},
) {
  const o = w.objects.find((o) => o.id === target);
  forestEvent(
    w,
    type,
    `Local fire: ${type.replace('fire-', '')}.${typeof data.elapsed === 'number' ? ` Paid work ${String(data.elapsed)}; remaining ${String(Number(data.remaining))}.` : ''}`,
    a?.position ?? o?.spatial ?? { x: 0, y: 0 },
    a?.id ?? null,
    data,
    target,
  );
  const e = w.events.at(-1);
  if (e) e.interface = 'tend-fire';
}
export function fireWeather(w: V7World, o: V7Object) {
  const c = forestClimate(w, o.spatial),
    f = fireState(o);
  return {
    rain: (c.rain ?? 0) * (0.2 + 0.8 * (1 - f.condition / 80)),
    wind: (c.wind ?? 0) * (f.condition > 0 ? 0.75 : 1),
  };
}
export function fireEnvironment(w: V7World) {
  if (w.state.localFire !== 1) return;
  for (const s of w.stacks) {
    const r = w.resources.find((r) => r.id === s.resource);
    if (
      !(r?.properties && r.properties.fuel > 0) ||
      !forestFireFuel(w, s.resource)
    )
      continue;
    const c = forestClimate(
      w,
      w.actors.find((a) => a.id === s.owner)?.position ?? s.position,
    );
    s.fuelMoisture = v7RoundNumber(
      Math.max(
        0,
        Math.min(
          1,
          (s.fuelMoisture ?? c.rain ?? 0) +
            ((c.rain ?? 0) > 0 && !c.indoor
              ? 0.08 * (c.rain ?? 0)
              : -0.01 * (1 + (c.wind ?? 0))),
        ),
      ),
    );
  }
  for (const o of w.objects.filter((o) => o.kind === 'stone-hearth')) {
    const f = fireState(o);
    if (f.lastTick === w.tick) continue;
    const c = forestClimate(w, o.spatial),
      weather = fireWeather(w, o);
    f.rain = weather.rain;
    f.wind = weather.wind;
    f.lastTick = w.tick;
    if ((c.rain ?? 0) > 0) f.condition = Math.max(0, f.condition - 0.25);
    f.burnFraction = 0;
    for (const lot of f.lots)
      lot.moisture = Math.max(
        0,
        Math.min(
          1,
          lot.moisture -
            (f.lit ? 0.08 : 0) +
            (weather.rain > 0
              ? 0.08 * weather.rain
              : -0.01 * (1 + weather.wind)),
        ),
      );
    f.moisture = f.lots.length
      ? f.lots.reduce((n, l) => n + l.moisture * l.quantity, 0) /
        f.lots.reduce((n, l) => n + l.quantity, 0)
      : 0;
    if (weather.rain > 0.6 && (f.lit || f.embers > 0)) {
      f.lit = false;
      f.embers = 0;
      fireEvent(w, null, 'fire-extinguished', o.id, { reason: 'rain' });
    }
    if (!f.lit) {
      f.embers = Math.max(0, f.embers - 1);
      continue;
    }
    let energyLeft = 1;
    const consumed: V7Data[] = [];
    for (const lot of f.lots) {
      const energy =
        Math.min(energyLeft, lot.quantity * lot.energy) * (1 - lot.moisture);
      if (energy <= 1e-8) continue;
      const quantity = energy / lot.energy,
        mass = quantity * lot.mass;
      lot.quantity -= quantity;
      energyLeft -= energy;
      f.burnedMass += mass;
      f.ash += mass * 0.1;
      f.releasedMass += mass * 0.9;
      consumed.push({
        item: lot.item,
        resource: lot.resource,
        quantity,
        mass,
        energy,
      });
      if (energyLeft <= 1e-8) break;
    }
    f.lots = f.lots.filter((l) => l.quantity > 1e-8);
    f.burnFraction = 1 - energyLeft;
    if (f.burnFraction > 0) f.embers = 3;
    else f.embers = Math.max(0, f.embers - 1);
    if (!f.embers) {
      f.lit = false;
      fireEvent(w, null, 'fire-extinguished', o.id, {
        reason: 'no combustible heat; embers exhausted',
      });
    }
    if (f.burnFraction > 0)
      fireEvent(w, null, 'fire-burned', o.id, {
        consumed,
        burnFraction: f.burnFraction,
        ash: f.ash,
        releasedMass: f.releasedMass,
        remainingEnergy: f.lots.reduce((n, l) => n + l.quantity * l.energy, 0),
      });
    o.visual.state = f.lit ? 'burning' : f.embers ? 'embers' : 'cold';
  }
}
