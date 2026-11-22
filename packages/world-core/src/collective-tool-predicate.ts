import type { V7Stack, V7World } from './continuous-types.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
/** The unchanged fractional preparation tool predicate; provenance-backed, not a physical hardness experiment. */
export function rootToolPredicate(w: V7World, s: V7Stack) {
  const hardness = collectiveFoodProfile(w, s)?.properties?.hardness;
  const form = s.resource === 'stone' && s.quantity >= 1;
  const contact = !s.processing?.wovenDamage && !s.processing?.gravimetricAssay;
  return {
    hardness: hardness ?? null,
    form,
    contact,
    suitable: form && contact && (hardness ?? 0) >= 3,
  };
}
