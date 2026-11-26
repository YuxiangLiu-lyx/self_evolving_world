import type {
  V7Actor,
  V7Data,
  V7Point,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7Clone } from './continuous-data.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import { forestClimate } from './forest-climate.js';
import { foodTenths } from './forest-food-accounting.js';
import { openConditions } from './open-physical.js';
import { scratchPhysical, scratchVisible } from './open-hardness-physics.js';

/** Shared material and contact checks of the ex19 edge assessment and shell compression
 * operations. They read existing world state only and never write it. */

/** The light at which the world tells people they are in daylight rather than low light
 * (forest-perception). Indoors the dimmed or object-provided light must exceed it instead. */
const LIGHT = 0.1;
/** Water, shallow water and wet banks: the firm-ground exclusion of the food water
 * representation (food-water-surface) and of earlier ground drying sites. */
const WET_GROUND = ['~', '=', ','];
/** Items with their own persistent representation are never used as plain material pieces. */
const EQUIPMENT = [
  'mantle',
  'frictionKit',
  'waterCup',
  'componentLots',
] as const;

export const ex19MaterialWhole = (s: V7Stack) =>
  Math.floor(foodTenths(s.quantity) / 10);

/** Why the light where the person stands is too low to see surfaces, or null. */
export function ex19MaterialDark(w: V7World, a: V7Actor): string | null {
  const c = forestClimate(w, a.position);
  const lit = c.indoor ? c.light > LIGHT : c.daylight > LIGHT;
  return lit
    ? null
    : `It is too dark to see the surfaces here (local light ${String(c.light)}); wait for daylight or work in a lit place.`;
}

/** Why a point is not firm ordinary ground for a resting piece, or null. */
export function ex19MaterialGround(w: V7World, p: V7Point): string | null {
  const c = openConditions(w, p);
  return WET_GROUND.includes(c.ground) || c.waterlogging > 0.1
    ? 'The lower piece needs firm ordinary ground where you stand, not water, a wet bank or waterlogged ground.'
    : null;
}

/** The contact state of a stack under the world contact model (open-hardness-physics), read
 * on a copy of its record so that reading stores nothing. */
export function ex19MaterialContact(w: V7World, s: V7Stack) {
  const key = `hardness:intrinsic:${s.id}`,
    old = w.state[key],
    state: V7Data = { ...w.state };
  if (old !== undefined) state[key] = v7Clone(old);
  const copy: V7World = { ...w, state };
  return {
    resistance: Number(scratchPhysical(copy, s).resistance),
    ...scratchVisible(copy, s),
  };
}

/** Why an item cannot serve as one of the person's own plain whole material pieces, or null. */
export function ex19MaterialPiece(
  w: V7World,
  a: V7Actor,
  s: V7Stack | undefined,
): string | null {
  if (!s || s.owner !== a.id)
    return 'Name one of your own carried items by its exact item id.';
  if (s.reservedFor) return `${s.id} is reserved for unfinished work.`;
  const m = collectiveFoodProfile(w, s);
  if (!m) return `${s.id} has no represented material.`;
  if (m.nutrition > 0) return `${s.id} is food, not a material piece.`;
  if (EQUIPMENT.some((k) => s[k] !== undefined))
    return 'Equipment and combined lots are not used as plain material pieces.';
  if (ex19MaterialWhole(s) < 1)
    return `${s.id} holds less than one whole unit.`;
  return null;
}
