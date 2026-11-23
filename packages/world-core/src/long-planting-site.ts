import { representedSurface, surfaceBare } from './long-surface.js';
import type { V7Actor, V7Spatial, V7World } from './continuous-types.js';
import { v7Distance } from './continuous-geometry.js';
import { openConditions } from './open-physical.js';
import { rootPlacement } from './collective-tray-placement.js';
/** Shared read-only predicates; surface eligibility is this minimal operation's limit, not a claim of universal infertility. */
export function longPlantingSite(w: V7World, a: V7Actor, spatial: V7Spatial) {
  const placement = rootPlacement(w, a, spatial, 0.2),
    surface = openConditions(w, spatial);
  const cover = representedSurface(w, spatial);
  if (cover && surfaceBare(cover)) surface.ground = '.';
  const empty = !w.objects.some(
    (o) => o.id !== cover?.id && v7Distance(o.spatial, spatial) < 0.5,
  );
  return {
    placement,
    surface,
    cover,
    empty,
    error:
      placement.error ??
      (surface.ground !== '.'
        ? 'Hand preparation currently requires ordinary soil.'
        : !empty
          ? 'Choose an actually unoccupied small patch.'
          : null),
  };
}
