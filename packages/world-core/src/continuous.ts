import { FOREST_RECUPERATION } from './forest-recuperation.js';
import { FOREST_CANOPY } from './forest-canopy.js';
import { FOREST_WILLOW, FOREST_OPERATION_CONTINUITY } from './forest-willow.js';
import { FOREST_FIRE } from './forest-fire.js';
import { FOREST_ROUTE_INSPECTION } from './forest-route-inspection.js';
import { FOREST_INSULATION } from './forest-insulation.js';
import { FOREST_WARMING } from './forest-warming.js';
import { FOREST_FOOD_ASSESSMENT } from './forest-food-assessment.js';
import { FOREST_SHELTER } from './forest-shelter.js';
import { FOREST_PERCEPTION } from './forest-perception.js';
import type { V7Package, V7World } from './continuous-types.js';
import { FOREST_WILDLIFE } from './forest-wildlife.js';
import { FOREST_BASE } from './forest-foundation.js';
import { V7_BASE } from './continuous-base.js';
import { V7_NATURE } from './continuous-nature.js';
import { V7_MOSAIC } from './continuous-mosaic.js';
import { v7Registry } from './continuous-registry.js';

/** Append reviewed package versions here; historical handlers retain their versioned identities. */
export const V7_PACKAGES: V7Package[] = [
  V7_BASE,
  V7_NATURE,
  V7_MOSAIC,
  FOREST_BASE,
  FOREST_WILDLIFE,
  FOREST_PERCEPTION,
  FOREST_FOOD_ASSESSMENT,
  FOREST_SHELTER,
  FOREST_WARMING,
  FOREST_ROUTE_INSPECTION,
  FOREST_INSULATION,
  FOREST_FIRE,
  FOREST_WILLOW,
  FOREST_OPERATION_CONTINUITY,
  FOREST_CANOPY,
  FOREST_RECUPERATION,
];
export const continuousRegistry = () => v7Registry(V7_PACKAGES);
export function v7PublicCatalogue(world: V7World, actorId?: string) {
  return {
    revisions: world.revisions,
    interfaces: world.abilities,
    satisfactionSources: world.satisfaction,
    resources:
      world.config.forest && actorId
        ? world.resources
            .filter((r) => {
              const actor = world.actors.find((a) => a.id === actorId);
              return (
                actor?.memory.objects.some(
                  (m) => m.object.data.resource === r.id,
                ) || actor?.memory.discoveries?.[r.id]
              );
            })
            .map((r) => ({
              id: r.id,
              name: r.name,
              mass: r.mass,
              color: r.color,
              ...(world.actors.find((a) => a.id === actorId)?.memory
                .discoveries?.[r.id] ?? {}),
            }))
        : world.resources,
    ...(world.eventTypes ? { events: world.eventTypes } : {}),
  };
}
