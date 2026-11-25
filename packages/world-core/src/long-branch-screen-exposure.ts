import type {
  V7Actor,
  V7Object,
  V7Point,
  V7World,
} from './continuous-types.js';
import { v7RoundNumber } from './continuous-data.js';
import { v7Local } from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import {
  SIMPLE_SHELTER_LIMITS as LIMITS,
  simpleShelterExposure,
} from './long-shelter-exposure.js';
import { sharedShelterExposure } from './long-shared-shelter-exposure.js';

export const BRANCH_SCREEN_REVISION = 'branch-screen@1';
export const BRANCH_SCREEN_KIND = 'branch-screen';
/** The ex15 simple-shelter sound condition: a piece below it has loosened. */
export const BRANCH_SCREEN_SOUND = 0.5;
/** Declared version-1 geometry in metres. Local +x is the windward face normal; local y runs
 * along the screen. One whole branch unit is one piece of the declared size. */
export const BRANCH_SCREEN_GEOMETRY = {
  /** Screen width along local y, and the upright positions along it. */
  width: 0.9,
  uprights: [-0.45, 0, 0.45],
  rods: 8,
  /** A 0.7 m upright inserted 0.25 m stands 0.45 m; the rods weave a 0.4 m high face. */
  uprightLength: 0.7,
  depth: 0.25,
  height: 0.45,
  woven: 0.4,
  rodLength: 1.1,
  uprightThickness: 0.025,
  rodThickness: 0.015,
  /** Physical thickness of the woven line across local x, used for collision only. */
  thickness: 0.06,
  /** Clear footprint centred on the line: 0.6 m across and 1.2 m along. */
  site: { across: 0.6, along: 1.2 },
  /** Lee floor behind the line (local -x), from one to three screen heights, beyond the fall reach. */
  lee: { near: 0.45, far: 1.35 },
};
const G = BRANCH_SCREEN_GEOMETRY;

/** Projected solid share of the woven face from the sound uprights and rods present. */
export function branchScreenSolidity(uprights: number, rods: number): number {
  const solid =
    rods * G.rodThickness * G.width +
    uprights * G.uprightThickness * G.woven -
    rods * uprights * G.rodThickness * G.uprightThickness;
  return v7RoundNumber(Math.max(0, solid) / (G.width * G.woven));
}

/** Sound installed uprights and rods of a screen. */
export function branchScreenSound(o: V7Object) {
  const list = (Array.isArray(o.data.components)
    ? o.data.components
    : []) as unknown as { role: string; condition: number }[];
  const sound = list.filter((p) => p.condition >= BRANCH_SCREEN_SOUND);
  return {
    uprights: sound.filter((p) => p.role === 'upright').length,
    rods: sound.filter((p) => p.role === 'rod').length,
  };
}

/** The whole body circle lies on the lee floor behind the screen. */
export function branchScreenInLee(o: V7Object, p: V7Point, radius: number) {
  const q = v7Local(p, o.spatial);
  return (
    q.x - radius >= -G.lee.far &&
    q.x + radius <= -G.lee.near &&
    Math.abs(q.y) + radius <= G.width / 2
  );
}

/** The wind shielding this screen would give a body on its lee floor under the given wind. */
export function branchScreenShield(o: V7Object, wind: number) {
  const sound = branchScreenSound(o),
    solidity = branchScreenSolidity(sound.uprights, sound.rods),
    // Existing exposure convention (ex10 refuge, ex15 shelters): wind arrives from +x.
    facing = v7RoundNumber(Math.max(0, Math.cos(o.spatial.angle))),
    withheld =
      o.data.status !== 'complete'
        ? 'the screen is not complete'
        : wind > LIMITS.wind
          ? 'wind beyond the light-weather limit'
          : facing <= 0
            ? 'the wind does not meet the windward face'
            : null;
  return {
    solidity,
    porosity: v7RoundNumber(1 - solidity),
    facing,
    withheld,
    windShield: withheld
      ? 0
      : v7RoundNumber(Math.min(LIMITS.windShield, solidity) * facing),
  };
}

/** Actual wind shielding for one person; null when no complete screen's lee floor holds the body. */
export function branchScreenExposure(w: V7World, a: V7Actor) {
  if (!w.revisions.includes(BRANCH_SCREEN_REVISION) || !w.config.experience)
    return null;
  const climate = forestClimate(w, a.position);
  // An enclosure or a roofed shelter applies its own rule; reductions never stack.
  if (
    climate.indoor ||
    simpleShelterExposure(w, a) ||
    sharedShelterExposure(w, a)
  )
    return null;
  const rain = climate.rain ?? 0,
    wind = climate.wind ?? 0;
  const best = w.objects
    .filter(
      (o) =>
        o.kind === BRANCH_SCREEN_KIND &&
        o.data.status === 'complete' &&
        branchScreenInLee(o, a.position, a.radius),
    )
    .map((o) => ({ o, ...branchScreenShield(o, wind) }))
    .sort(
      (x, y) => y.windShield - x.windShield || x.o.id.localeCompare(y.o.id),
    )[0];
  if (!best) return null;
  const exposure = w.config.experience.exposure;
  return {
    target: best.o.id,
    rain,
    wind,
    windFrom: '+x',
    facing: best.facing,
    solidity: best.solidity,
    porosity: best.porosity,
    withheld: best.withheld,
    rainShield: 0,
    windShield: best.windShield,
    outdoorChill: v7RoundNumber(exposure * (rain + wind)),
    avoidedChill: v7RoundNumber(exposure * wind * best.windShield),
    ambient: climate.temperature,
  };
}

/** Physiology hook: only the avoided part of the existing outdoor wind chill changes. */
export function branchScreenPhysiology(
  w: V7World,
  a: V7Actor,
  ambient: number,
): number {
  if (!w.revisions.includes(BRANCH_SCREEN_REVISION)) return ambient;
  const m = branchScreenExposure(w, a);
  // Another shelter rule already changed this round's exposure: never stack.
  if (!m || m.wind <= 0 || ambient !== m.ambient) return ambient;
  forestEvent(
    w,
    'branch-screen-exposure-measured',
    m.withheld
      ? `The screen gave no wind shielding this round: ${m.withheld}.`
      : 'The screen removed part of the real wind chill on its lee floor; rain chill and air temperature are unchanged.',
    a.position,
    a.id,
    m,
    m.target,
  );
  return ambient + m.avoidedChill;
}
