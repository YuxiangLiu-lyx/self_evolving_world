import type { V7Object } from './continuous-types.js';
import type { V7World, V7Actor, V7Data } from './continuous-types.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { refugeRay } from './open-shelter-geometry.js';
/** No installed package => byte-for-byte legacy thermal/rest arithmetic. No ambient world edits. */
export function refugeExposure(w: V7World, a: V7Actor) {
  if (!w.revisions.includes('resting-shelter@1')) return null;
  const climate = forestClimate(w, a.position),
    sunAngle = (w.time * Math.PI * 2) / (w.config.forest?.day ?? 80),
    wind = climate.wind ?? 0,
    rain = climate.rain ?? 0;
  const candidates = w.objects
    .filter((o) => o.kind === 'open-refuge' || o.kind === 'short-refuge')
    .map((o) => ({
      o,
      sun: bodyRay(o, a, Math.cos(sunAngle) * 0.5, Math.sin(sunAngle) * 0.5),
      rain: bodyRay(o, a, wind * 0.25, 0),
      overhead: bodyRay(o, a, 0, 0),
    }))
    .filter((r) => r.overhead > 0);
  candidates.sort(
    (a, b) => b.sun + b.rain - a.sun - a.rain || a.o.id.localeCompare(b.o.id),
  );
  const best = candidates[0];
  if (!best) return null;
  const solar = 4 * climate.daylight,
    blockedSolar = solar * 0.65 * best.sun,
    rainAvoided = rain * 0.4 * best.rain,
    windAvoided = wind * Math.min(0.2, best.overhead * 0.1),
    trappedHeat = Math.max(0, climate.temperature - 28) * windAvoided * 0.2;
  const ambient =
    climate.temperature -
    blockedSolar +
    trappedHeat +
    (w.config.experience?.exposure ?? 0) * (rainAvoided + windAvoided);
  const before = a.vitals.temperature,
    plain = before + (climate.temperature - before) * 0.035,
    protectedTemperature = before + (ambient - before) * 0.035;
  const discomfort = (t: number) => Math.max(0, 16 - t, t - 28) / 12;
  const oldWet = Number(a.extensionState['refuge:wetness'] ?? 0),
    plainWet = Math.max(
      0,
      Math.min(1, oldWet + rain * 0.025 - climate.daylight * 0.01),
    ),
    wet = Math.max(
      0,
      Math.min(
        1,
        oldWet + (rain - rainAvoided) * 0.025 - climate.daylight * 0.01,
      ),
    );
  const plainDiscomfort = discomfort(plain) + plainWet * 0.1,
    actualDiscomfort = discomfort(protectedTemperature) + wet * 0.1,
    removed = Math.max(0, plainDiscomfort - actualDiscomfort);
  return {
    target: best.o.id,
    sunCoverage: best.sun,
    rainCoverage: best.rain,
    windAvoided,
    blockedSolar,
    rainAvoided,
    trappedHeat,
    ambient,
    plainTemperature: plain,
    temperature: protectedTemperature,
    plainWet,
    wet,
    plainDiscomfort,
    actualDiscomfort,
    removed,
    bonus: Math.min(0.4, removed * 4),
  };
}
export function refugePhysiology(
  w: V7World,
  a: V7Actor,
  ambient: number,
): number {
  const measured = refugeExposure(w, a);
  if (!measured) {
    if (w.revisions.includes('resting-shelter@1')) {
      const climate = forestClimate(w, a.position);
      a.extensionState['refuge:wetness'] = Math.max(
        0,
        Math.min(
          1,
          Number(a.extensionState['refuge:wetness'] ?? 0) +
            (climate.rain ?? 0) * 0.025 -
            climate.daylight * 0.01,
        ),
      );
    }
    return ambient;
  }
  a.extensionState['refuge:wetness'] = measured.wet;
  a.extensionState['refuge:exposure'] = { ...measured, tick: w.tick };
  forestEvent(
    w,
    'shelter-exposure-measured',
    'Actual finite roof intersections changed incident heat, rain and projected wind; body temperature still evolves continuously.',
    a.position,
    a.id,
    measured,
    measured.target,
  );
  return measured.ambient;
}
export function refugeRest(
  w: V7World,
  a: V7Actor,
  measured: ReturnType<typeof refugeExposure>,
  recovered: number,
) {
  if (
    !measured ||
    recovered <= 0 ||
    measured.removed <= 1e-8 ||
    measured.actualDiscomfort > measured.plainDiscomfort
  )
    return;
  const previous = a.extensionState['refuge:occupied-rests'],
    history = Array.isArray(previous)
      ? previous.filter(
          (n): n is number => typeof n === 'number' && w.tick - n <= 20,
        )
      : [];
  history.push(w.tick);
  a.extensionState['refuge:occupied-rests'] = history.slice(-20);
  const data: V7Data = {
    ...measured,
    recovered,
    qualifyingRests: history.length,
    qualified: true,
  };
  forestEvent(
    w,
    'shelter-rest-experience',
    'A completed occupied rest reduced actual physical exposure without worsening total discomfort.',
    a.position,
    a.id,
    data,
    measured.target,
  );
  const event = w.events.at(-1);
  if (event) event.interface = 'rest';
  const last = Number(a.extensionState['refuge:last-maintenance'] ?? -1000);
  if (history.length >= 3 && w.tick - last >= 12) {
    a.extensionState['refuge:last-maintenance'] = w.tick;
    forestEvent(
      w,
      'shelter-refuge-maintained',
      'Repeated beneficial occupied rest maintained this personal refuge source.',
      a.position,
      a.id,
      data,
      measured.target,
    );
    const e = w.events.at(-1);
    if (e) e.interface = 'rest';
  }
}

function bodyRay(o: V7Object, a: V7Actor, dx: number, dy: number): number {
  if (o.kind !== 'short-refuge') return refugeRay(o, a.position, dx, dy);
  const samples = [
    [0, 0],
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [
      Math.cos((i * Math.PI) / 4) * a.radius,
      Math.sin((i * Math.PI) / 4) * a.radius,
    ]),
  ];
  return (
    samples.reduce(
      (sum, p) =>
        sum +
        refugeRay(
          o,
          { x: a.position.x + (p[0] ?? 0), y: a.position.y + (p[1] ?? 0) },
          dx,
          dy,
        ),
      0,
    ) / samples.length
  );
}
