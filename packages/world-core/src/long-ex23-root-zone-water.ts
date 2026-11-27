import type { V7Data, V7Point, V7World } from './continuous-types.js';

/** ex23: water retained in the root zone of a watered planted cell. A record exists only after
 * rooted-plant-watering@1 actually delivered water to a cell, and it is read only while that
 * revision is installed, so every other world keeps the ground-derived soil moisture unchanged.
 * The record belongs to the terrain cell, so every plant rooted in that cell shares it. */
export const ROOT_ZONE_REVISION = 'rooted-plant-watering@1';

/** Documented root-zone law of one 1 m x 1 m terrain cell. The soil moisture index of
 * openConditions (0.65 ordinary soil, 0.9 wet bank, 0.25 rocky ground, bounded 0.05-1.5) is the
 * unit; these values convert litres to that index. */
export const ROOT_ZONE_LAW = {
  /** Litres held in the top 0.15 m of one square metre that raise the moisture index by 1. */
  litresPerUnit: 30,
  /** Index above which retained water drains. */
  fieldCapacity: 1,
  /** Index above which no more water is retained: the rest runs off the surface. */
  saturation: 1.3,
  /** Share of the water above field capacity that drains below the root zone each round. */
  drainage: 0.5,
  /** Share of the retained water that evaporates each round from the wetted soil. */
  evaporationShare: 0.1,
  /** At most this many litres evaporate from the cell each round: 3 L per square metre per
   * 80-round day, the whole cell surface wet. */
  evaporation: 0.0375,
  /** A remaining trace below this many litres evaporates at once. */
  traceLitres: 0.001,
} as const;

/** One watered cell. Conservation: received = litres + runoff + drained + evaporated. */
export interface RootZoneCell extends V7Data {
  x: number;
  y: number;
  litres: number;
  received: number;
  runoff: number;
  drained: number;
  evaporated: number;
  lastTick: number;
}

export const rootZoneKey = (x: number, y: number) =>
  `root-zone-water:${String(x)}:${String(y)}`;

export function rootZoneCell(
  world: V7World,
  point: V7Point,
): RootZoneCell | undefined {
  const value =
    world.state[rootZoneKey(Math.floor(point.x), Math.floor(point.y))];
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  return value as RootZoneCell;
}

/** The moisture index added by retained root-zone water at a point: 0 without a record, without
 * retained litres, or without the installed revision. */
export function rootZoneMoisture(world: V7World, point: V7Point): number {
  const cell = rootZoneCell(world, point);
  if (!cell || !(cell.litres > 0)) return 0;
  if (!world.revisions.includes(ROOT_ZONE_REVISION)) return 0;
  return cell.litres / ROOT_ZONE_LAW.litresPerUnit;
}
