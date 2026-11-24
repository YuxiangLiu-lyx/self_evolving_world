import type { V7Actor, V7Object, V7World } from './continuous-types.js';
import { v7RoundNumber } from './continuous-data.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { openConditions } from './open-physical.js';
import {
  SIMPLE_SHELTER_LIMITS as LIMITS,
  simpleShelterCovers,
  simpleShelterExposure,
  simpleShelterRoofed,
} from './long-shelter-exposure.js';

export const SHARED_SHELTER_REVISION = 'shared-shelter@1';
export const SHARED_SHELTER_KIND = 'shared-shelter-bay';

/** Living people whose whole body lies on this bay's covered floor (the inherited simple-shelter floor test). */
export function sharedBayOccupants(w: V7World, bay: V7Object): V7Actor[] {
  return w.actors.filter(
    (x) =>
      x.vitals.health > 0 && simpleShelterCovers(bay, x.position, x.radius),
  );
}

/** The inherited simple-shelter shielding law applied to one bay alone; people in other bays never count. */
export function sharedBayShield(
  w: V7World,
  bay: V7Object,
  a: V7Actor,
  rain: number,
  wind: number,
) {
  const occupants = sharedBayOccupants(w, bay).length;
  const roof = Math.max(0, Math.min(1, Number(bay.data.roofCondition ?? 0)));
  const facing = Math.max(0, Math.cos(bay.spatial.angle));
  const samples = [
    [0, 0],
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [
      Math.cos((i * Math.PI) / 4) * a.radius,
      Math.sin((i * Math.PI) / 4) * a.radius,
    ]),
  ];
  const coverage =
    samples.filter(([dx = 0, dy = 0]) =>
      simpleShelterRoofed(
        bay,
        { x: a.position.x + dx, y: a.position.y + dy },
        wind,
      ),
    ).length / samples.length;
  const withheld =
    bay.data.status !== 'commissioned'
      ? 'the bay is not commissioned'
      : occupants !== 1
        ? 'more than one person on this bay floor'
        : rain > LIMITS.rain || wind > LIMITS.wind
          ? 'weather beyond the light-weather limits'
          : openConditions(w, bay.spatial).waterlogging > LIMITS.waterlogging
            ? 'water pooling on the floor'
            : null;
  return {
    occupants,
    roof,
    facing,
    coverage,
    withheld,
    rainShield: withheld ? 0 : LIMITS.rainShield * roof * coverage,
    windShield: withheld ? 0 : LIMITS.windShield * roof * facing,
  };
}

/** Actual shielding for one person on one bay floor; null when no commissioned bay covers the body. */
export function sharedShelterExposure(w: V7World, a: V7Actor) {
  if (!w.revisions.includes(SHARED_SHELTER_REVISION) || !w.config.experience)
    return null;
  const climate = forestClimate(w, a.position);
  // An enclosure already removes the outdoor chill, and a simple shelter applies its own rule: never stack.
  if (climate.indoor || simpleShelterExposure(w, a)) return null;
  const rain = climate.rain ?? 0,
    wind = climate.wind ?? 0;
  const best = w.objects
    .filter(
      (o) =>
        o.kind === SHARED_SHELTER_KIND &&
        o.data.status === 'commissioned' &&
        simpleShelterCovers(o, a.position, a.radius),
    )
    .map((o) => ({ o, ...sharedBayShield(w, o, a, rain, wind) }))
    .sort(
      (x, y) =>
        y.rainShield * rain +
          y.windShield * wind -
          x.rainShield * rain -
          x.windShield * wind || x.o.id.localeCompare(y.o.id),
    )[0];
  if (!best) return null;
  const exposure = w.config.experience.exposure;
  return {
    target: best.o.id,
    structure:
      typeof best.o.data.structure === 'string' ? best.o.data.structure : null,
    bay: Number(best.o.data.bay ?? 0),
    rain,
    wind,
    windFrom: '+x',
    facing: v7RoundNumber(best.facing),
    roofCondition: v7RoundNumber(best.roof),
    roofCoverage: v7RoundNumber(best.coverage),
    // Leak measures: body share that wind-driven rain still reaches, and roof shielding lost to wear.
    exposedBodyShare: v7RoundNumber(1 - best.coverage),
    roofWear: v7RoundNumber(1 - best.roof),
    occupants: best.occupants,
    withheld: best.withheld,
    rainShield: v7RoundNumber(best.rainShield),
    windShield: v7RoundNumber(best.windShield),
    outdoorChill: v7RoundNumber(exposure * (rain + wind)),
    avoidedChill: v7RoundNumber(
      exposure * (rain * best.rainShield + wind * best.windShield),
    ),
    ambient: climate.temperature,
  };
}

/** Physiology hook: only the avoided part of the existing outdoor rain and wind chill changes. */
export function sharedShelterPhysiology(
  w: V7World,
  a: V7Actor,
  ambient: number,
): number {
  const m = sharedShelterExposure(w, a);
  if (!m || m.rain + m.wind <= 0) return ambient;
  forestEvent(
    w,
    'shared-shelter-exposure-measured',
    m.withheld
      ? `Bay ${String(m.bay)} gave no protection this round: ${m.withheld}.`
      : `Bay ${String(m.bay)} shielded part of the real rain and wind chill on its covered floor; air temperature is unchanged.${m.rain > 0 && m.exposedBodyShare > 0 ? ` Wind-driven rain still reached ${String(Math.round(m.exposedBodyShare * 100))}% of the body past the roof edge.` : ''}`,
    a.position,
    a.id,
    m,
    m.target,
  );
  return ambient + m.avoidedChill;
}
