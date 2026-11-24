import type {
  V7Actor,
  V7Object,
  V7Point,
  V7World,
} from './continuous-types.js';
import { v7RoundNumber } from './continuous-data.js';
import { v7Local } from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { openConditions } from './open-physical.js';

export const SIMPLE_SHELTER_REVISION = 'simple-shelter@1';
export const SIMPLE_SHELTER_KIND = 'simple-shelter';
/** Declared version-1 geometry. Local +x faces the low weather edge; local y runs along the ridge. */
export const SIMPLE_SHELTER_GEOMETRY = {
  /** Clear site checked before work: 2 m along the ridge by 2 m across. */
  site: 2,
  /** Covered floor: 2 m along the ridge by 1 m deep, at most 2 square metres. */
  length: 2,
  depth: 1,
  /** Ridge height above the ground after hand insertion of the forked posts. */
  ridgeHeight: 1.2,
};
/** Roof slope from the ridge down to the low weather edge (about 50 degrees). */
export const SIMPLE_SHELTER_SLOPE = v7RoundNumber(
  (Math.atan2(
    SIMPLE_SHELTER_GEOMETRY.ridgeHeight,
    SIMPLE_SHELTER_GEOMETRY.depth,
  ) *
    180) /
    Math.PI,
);
/** Light-weather limits and the largest reductions the specification allows. */
export const SIMPLE_SHELTER_LIMITS = {
  rain: 0.8,
  wind: 0.8,
  rainShield: 0.5,
  windShield: 0.35,
  waterlogging: 0.1,
};
/** Existing open-refuge convention: wind-driven rain arrives from +x, slanting 0.25 x wind per unit of fall. */
const SLANT = 0.25;

/** The whole body circle lies on the covered floor. */
export function simpleShelterCovers(o: V7Object, p: V7Point, radius: number) {
  const q = v7Local(p, o.spatial);
  return (
    Math.abs(q.x) + radius <= SIMPLE_SHELTER_GEOMETRY.depth / 2 &&
    Math.abs(q.y) + radius <= SIMPLE_SHELTER_GEOMETRY.length / 2
  );
}

/** Whether a wind-slanted rain ray from a floor point meets the single sloping roof plane. */
function roofed(o: V7Object, p: V7Point, wind: number): boolean {
  const { depth: d, length: l, ridgeHeight: h } = SIMPLE_SHELTER_GEOMETRY,
    q = v7Local(p, o.spatial),
    u = SLANT * wind * Math.cos(o.spatial.angle),
    v = -SLANT * wind * Math.sin(o.spatial.angle),
    // Roof height falls from h at the ridge (x = -d/2) to 0 at the low edge (x = d/2).
    z = (h * (d / 2 - q.x)) / (d + h * u),
    x = q.x + u * z,
    y = q.y + v * z;
  return z >= 0 && Math.abs(x) <= d / 2 && Math.abs(y) <= l / 2;
}

/** Actual shielding for one person; null when no commissioned shelter covers the body. */
export function simpleShelterExposure(w: V7World, a: V7Actor) {
  if (!w.revisions.includes(SIMPLE_SHELTER_REVISION) || !w.config.experience)
    return null;
  const climate = forestClimate(w, a.position);
  // An enclosure already removes the outdoor chill; reductions never stack.
  if (climate.indoor) return null;
  const rain = climate.rain ?? 0,
    wind = climate.wind ?? 0;
  const candidates = w.objects
    .filter(
      (o) =>
        o.kind === SIMPLE_SHELTER_KIND &&
        o.data.status === 'commissioned' &&
        simpleShelterCovers(o, a.position, a.radius),
    )
    .map((o) => {
      const occupants = w.actors.filter(
        (x) =>
          x.vitals.health > 0 && simpleShelterCovers(o, x.position, x.radius),
      ).length;
      const roof = Math.max(0, Math.min(1, Number(o.data.roofCondition ?? 0)));
      const facing = Math.max(0, Math.cos(o.spatial.angle));
      const samples = [
        [0, 0],
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [
          Math.cos((i * Math.PI) / 4) * a.radius,
          Math.sin((i * Math.PI) / 4) * a.radius,
        ]),
      ];
      const coverage =
        samples.filter(([dx = 0, dy = 0]) =>
          roofed(o, { x: a.position.x + dx, y: a.position.y + dy }, wind),
        ).length / samples.length;
      const withheld =
        occupants !== 1
          ? 'more than one person on the single-person floor'
          : rain > SIMPLE_SHELTER_LIMITS.rain ||
              wind > SIMPLE_SHELTER_LIMITS.wind
            ? 'weather beyond the light-weather limits'
            : openConditions(w, o.spatial).waterlogging >
                SIMPLE_SHELTER_LIMITS.waterlogging
              ? 'water pooling on the floor'
              : null;
      const rainShield = withheld
          ? 0
          : SIMPLE_SHELTER_LIMITS.rainShield * roof * coverage,
        windShield = withheld
          ? 0
          : SIMPLE_SHELTER_LIMITS.windShield * roof * facing;
      return {
        o,
        occupants,
        roof,
        facing,
        coverage,
        withheld,
        rainShield,
        windShield,
      };
    })
    .sort(
      (x, y) =>
        y.rainShield * rain +
          y.windShield * wind -
          x.rainShield * rain -
          x.windShield * wind || x.o.id.localeCompare(y.o.id),
    );
  const best = candidates[0];
  if (!best) return null;
  const exposure = w.config.experience.exposure;
  const avoided = exposure * (rain * best.rainShield + wind * best.windShield);
  return {
    target: best.o.id,
    rain,
    wind,
    windFrom: '+x',
    facing: v7RoundNumber(best.facing),
    roofCondition: v7RoundNumber(best.roof),
    roofCoverage: v7RoundNumber(best.coverage),
    occupants: best.occupants,
    withheld: best.withheld,
    rainShield: v7RoundNumber(best.rainShield),
    windShield: v7RoundNumber(best.windShield),
    outdoorChill: v7RoundNumber(exposure * (rain + wind)),
    avoidedChill: v7RoundNumber(avoided),
    ambient: climate.temperature,
  };
}

/** Physiology hook: only the avoided part of the existing outdoor rain and wind chill changes. */
export function simpleShelterPhysiology(
  w: V7World,
  a: V7Actor,
  ambient: number,
): number {
  const m = simpleShelterExposure(w, a);
  if (!m || m.rain + m.wind <= 0) return ambient;
  forestEvent(
    w,
    'simple-shelter-exposure-measured',
    m.withheld
      ? `Shelter gave no protection this round: ${m.withheld}.`
      : 'The roof shielded part of the real rain and wind chill on the covered floor; air temperature is unchanged.',
    a.position,
    a.id,
    m,
    m.target,
  );
  return ambient + m.avoidedChill;
}

/** The roof-ray geometry, reused per bay by later shelter packages without changing this rule. */
export { roofed as simpleShelterRoofed };
