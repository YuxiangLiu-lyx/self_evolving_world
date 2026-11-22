import type { V7Actor, V7World } from './continuous-types.js';
import { v7Local } from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export function leanExposure(w: V7World, a: V7Actor) {
  if (!w.revisions.includes('weather-lean-to@1')) return null;
  const climate = forestClimate(w, a.position),
    rain = climate.rain ?? 0,
    wind = climate.wind ?? 0;
  const shelter = w.objects
    .filter((o) => o.kind === 'weather-lean-to' && Number(o.data.integrity) > 0)
    .filter((o) => {
      const p = v7Local(a.position, o.spatial);
      return Math.abs(p.x) + a.radius <= 1 && Math.abs(p.y) + a.radius <= 1;
    })
    .sort(
      (a, b) =>
        Number(b.data.integrity) - Number(a.data.integrity) ||
        a.id.localeCompare(b.id),
    )[0];
  const integrity = Number(shelter?.data.integrity ?? 0),
    localRain = rain * (1 - 0.8 * integrity),
    localWind = wind * (1 - 0.6 * integrity);
  const wet = clamp(
    Number(a.extensionState['lean-to:wetness'] ?? 0) +
      0.05 * localRain -
      0.02 * (1 - localRain),
  );
  const outdoorWet = clamp(
    Number(a.extensionState['lean-to:wetness'] ?? 0) +
      0.05 * rain -
      0.02 * (1 - rain),
  );
  const ambient =
    climate.temperature +
    (w.config.experience?.exposure ?? 0) *
      (rain + wind - localRain - localWind);
  const effective =
    ambient + Math.min(0, ambient - a.vitals.temperature) * 0.5 * wet;
  return {
    target: shelter?.id ?? null,
    integrity,
    rain,
    wind,
    localRain,
    localWind,
    wet,
    outdoorWet,
    ambient,
    effective,
    exposureReduction:
      rain + wind > 0 ? 1 - (localRain + localWind) / (rain + wind) : 0,
    restFactor: 1 - 0.15 * localRain - 0.1 * localWind,
    outdoorRestFactor: 1 - 0.15 * rain - 0.1 * wind,
  };
}
export function leanRest(w: V7World, a: V7Actor, recovered: number) {
  if (!w.revisions.includes('weather-lean-to@1')) return;
  a.extensionState['lean-to:rest'] = {
    tick: w.tick,
    recovered,
    health: a.vitals.health,
    temperature: a.vitals.temperature,
  };
}
export function leanPhysiology(w: V7World, a: V7Actor, ambient: number) {
  const m = leanExposure(w, a);
  if (!m) return ambient;
  a.extensionState['lean-to:wetness'] = m.wet;
  a.extensionState['lean-to:exposure'] = { ...m, tick: w.tick };
  if (m.target)
    forestEvent(
      w,
      'shelter-exposure',
      'Measured local exposure and wetness under an actual roof.',
      a.position,
      a.id,
      { ...m },
      m.target,
    );
  return m.effective;
}
export function leanAfterPhysiology(w: V7World, a: V7Actor) {
  if (!w.revisions.includes('weather-lean-to@1')) return;
  const raw = a.extensionState['lean-to:rest'];
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    raw.tick !== w.tick
  )
    return;
  const m = leanExposure(w, a);
  if (
    !m?.target ||
    m.exposureReduction < 0.25 ||
    Math.max(m.rain, m.wind) < 0.2 ||
    Number(raw.recovered) <= 0 ||
    a.vitals.health <= 0 ||
    a.vitals.health < Number(raw.health) ||
    w.events.some((e) => e.actor === a.id && e.type === 'injured')
  )
    return;
  forestEvent(
    w,
    'sheltered-rest',
    'Personally completed rest reduced weather exposure and actual fatigue without acute injury.',
    a.position,
    a.id,
    { ...m, recovered: raw.recovered ?? 0 },
    m.target,
  );
  const e = w.events.at(-1);
  if (e) e.interface = 'rest';
}
