import { barkProfile } from './collective-bark-material.js';
import { rootFoodProfile } from './collective-root-food.js';
import { hearthFoodProfile } from './long-thermal-physics.js';
import type { V7Resource, V7Stack, V7World } from './continuous-types.js';
/** Per-stack edible properties only after the corresponding scoped package is installed. */
export function collectiveFoodProfile(
  w: V7World,
  s: V7Stack,
): V7Resource | undefined {
  const peeled = barkProfile(w, s);
  if (peeled) return peeled;
  const preparedRoot = rootFoodProfile(w, s);
  if (preparedRoot) return preparedRoot;
  const heated = hearthFoodProfile(w, s);
  if (heated) return heated;
  const base = w.resources.find((r) => r.id === s.resource);
  if (
    !w.revisions.includes('prepare-food@1') ||
    s.resource !== 'hand-mashed-food' ||
    !s.processing?.edible
  )
    return base;
  return s.processing.edible as unknown as V7Resource;
}
