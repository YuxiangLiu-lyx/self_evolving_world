import { OPEN_EXTRACTION } from './open-extraction.js';
import { OPEN_WATER } from './open-water.js';
import { OPEN_SHORT_DIAGNOSTICS } from './open-short-diagnostics.js';
import { OPEN_SHORT_REFUGE } from './open-short.js';
import { OPEN_PRESERVATION } from './open-preservation.js';
import { MATERIAL_GEOMETRY } from './open-material-geometry.js';
import { OPEN_METROLOGY } from './open-metrology.js';
import { OPEN_SHELTER_DIAGNOSTICS } from './open-shelter-diagnostics.js';
import { OPEN_SHELTER } from './open-shelter.js';
import { OPEN_CONTACT } from './open-contact.js';
import { OPEN_HARDNESS } from './open-hardness.js';
import { OPEN_WOVEN } from './open-woven.js';
import { OPEN_BARK } from './open-bark.js';
import { OPEN_FOOD_ASSAY } from './open-food-assay.js';
import { OPEN_FOOD_EXAMINATION } from './open-food-examination.js';
import { OPEN_FOUNDATION } from './open-foundation.js';
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
  OPEN_FOUNDATION,
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
  OPEN_FOOD_EXAMINATION,
  OPEN_FOOD_ASSAY,
  OPEN_BARK,
  OPEN_WOVEN,
  OPEN_HARDNESS,
  OPEN_CONTACT,
  OPEN_SHELTER,
  OPEN_SHELTER_DIAGNOSTICS,
  MATERIAL_GEOMETRY,
  OPEN_METROLOGY,
  OPEN_PRESERVATION,
  OPEN_SHORT_REFUGE,
  OPEN_WATER,
  OPEN_SHORT_DIAGNOSTICS,
  OPEN_EXTRACTION,
];
export const continuousRegistry = (world?: V7World) =>
  v7Registry(
    world?.config.development
      ? V7_PACKAGES.filter(
          (p) =>
            ['foundation-forest', 'foundation-open'].includes(p.id) ||
            p.scope === world.config.development?.scope,
        )
      : V7_PACKAGES,
  );
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
