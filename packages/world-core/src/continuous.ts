import { LONG_BRANCH_ASSESSMENT } from './long-branch-assessment.js';
import { LONG_MOSS_APPLE } from './long-moss-apple.js';
import { LONG_PLUM_ASSESSMENT } from './long-plum-assessment.js';
import { LONG_MOSS_SEPARATION } from './long-moss-separation.js';
import { LONG_BIRCH_ASSESSMENT } from './long-birch-assessment.js';
import { LONG_MOSS_RECOVERY } from './long-moss-recovery.js';
import { LONG_MOSS_OPENING } from './long-moss-opening.js';
import { LONG_NUT_ACCESS } from './long-nut-access.js';
import { LONG_FOREST_NUT_EXAMINATION } from './long-forest-nut-examination.js';
import { LONG_OPENED_ASSESSMENT } from './long-opened-assessment.js';
import { LONG_MOSS_FOOD_ASSESSMENT } from './long-moss-food-assessment.js';
import { LONG_APPLE_ASSESSMENT } from './long-apple-assessment.js';
import { LONG_NUT_OPENING } from './long-nut-opening.js';
import { LONG_NUT_EXAMINATION } from './long-nut-examination.js';
import { LONG_JOIN_RECONCILIATION } from './long-join-reconciliation.js';
import { LONG_JOINING } from './long-joining.js';
import { LONG_JOIN_ASSESSMENT } from './long-join-assessment.js';
import { LONG_MOSS_DIAGNOSTIC } from './long-moss-diagnostic.js';
import {
  LONG_PREPARED_PLANTING,
  LONG_MOSS_PREPARED_PLANTING,
} from './long-prepared-planting.js';
import {
  LONG_RESIDUE,
  LONG_SOL_RESIDUE,
  LONG_MOSS_RESIDUE,
} from './long-residue.js';
import { LONG_MOSS } from './long-moss.js';
import { LONG_SURFACE } from './long-surface-work.js';
import { LONG_SITE_ASSESSMENT } from './long-site-assessment.js';
import { LONG_ROOT_ASSESSMENT } from './long-root-assessment.js';
import { LONG_PLANTING } from './long-planting.js';
import { TOOL_ASSESSMENT_PACKAGE } from './collective-tool-assessment.js';
import { TRAY_CLEARANCE_PACKAGE } from './collective-tray-clearance-package.js';
import { SMALL_DRYING_PACKAGE } from './collective-small-drying.js';
import { SURFACE_DIAGNOSTIC_PACKAGE } from './collective-surface-diagnostics-package.js';
import { COLLECTIVE_INVENTORY } from './collective-inventory.js';
import { ROOT_SURFACE_PACKAGE } from './collective-root-surface-package.js';
import { COLLECTIVE_MATERIAL_COMBINE } from './collective-material-combine.js';
import { COLLECTIVE_FOOD_INSPECTION } from './collective-food-inspection.js';
import { COLLECTIVE_BARK } from './collective-bark.js';
import { COLLECTIVE_BARK_FEEDBACK } from './collective-bark-feedback.js';
import {
  ROOT_FOOD_MATRIX,
  ROOT_PREPARATION,
  ROOT_AIR_DRYING,
} from './collective-roots.js';
import { COLLECTIVE_FOOD } from './collective-food.js';
import { COLLECTIVE_SHELTER } from './collective-shelter.js';
import { OPEN_EXTRACTION } from './open-extraction.js';
import { collectiveFoundation } from './collective-social.js';
import { expressionFoundation } from './expression.js';
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
import { LONG_CULTIVATION } from './long-cultivation.js';
import { LONG_FOOD_TRIAL } from './long-food-trial.js';
import { LONG_WEATHER_BARRIER } from './long-weather-barrier.js';
import { LONG_AIR_DRYING } from './long-air-drying.js';
import { LONG_RESTING_MATERIAL } from './long-resting-material.js';
import { LONG_CORDAGE } from './long-cordage.js';
import { LONG_FOOD_PREPARATION } from './long-food-preparation.js';
import { LONG_SIMPLE_SHELTER } from './long-simple-shelter.js';
import { LONG_SHARED_SHELTER } from './long-shared-shelter.js';
import { LONG_CULTIVATION_TRIAL } from './long-cultivation-trial.js';
import { LONG_BARK_SEPARATION } from './long-bark-separation.js';
import {
  LONG_PLANT_CULTIVATION,
  LONG_EX17_PLANT_CULTIVATION,
  LONG_EX18_PLANT_ESTABLISHMENT,
} from './long-plant-cultivation.js';
import { LONG_BRANCH_SCREEN } from './long-branch-screen.js';
import { LONG_FIBER_MAT } from './long-fiber-mat.js';
import { LONG_HAND_BREAK_FOOD } from './long-hand-break-food.js';
import { LONG_FIBER_CORD } from './long-fiber-cord.js';
import { LONG_CORD_KNOT } from './long-cord-knot.js';
import { LONG_UNHEATED_FOOD_PREPARATION } from './long-unheated-food-preparation.js';
import { LONG_THERMAL_FOOD_PREPARATION } from './long-thermal-food-preparation.js';
import { LONG_HEARTH_FOOD_PREPARATION } from './long-thermal-food.js';
import { LONG_MECHANICAL_FOOD_HANDLING } from './long-mechanical-food-handling.js';
import { LONG_FIBER_CORD_JOIN } from './long-fiber-cord-join.js';
import { LONG_CROSSING_BINDING } from './long-crossing-binding.js';
import { LONG_SECTIONED_CORD } from './long-sectioned-fiber-cord.js';
import { LONG_CROSSING_LASHING } from './long-crossing-lashing.js';
import { LONG_CROSSING_FRAPPING } from './long-crossing-frapping.js';
import { LONG_EXTENDED_SECTIONED_CORD } from './long-extended-sectioned-cord.js';
import { LONG_EX19_FOOD_AIR_EXPOSURE } from './long-ex19-food-air-exposure.js';
import { LONG_EX19_THIN_SLICE_FOOD_DRYING } from './long-ex19-thin-slice-food-drying.js';
import { LONG_EX19_CUTTING_EDGE_ASSESSMENT } from './long-ex19-cutting-edge-assessment.js';
import { LONG_EX19_SHELL_COMPRESSION_OPENING } from './long-ex19-shell-compression-opening.js';
import { LONG_EX19_LEVER_MASS_COMPARATOR } from './long-ex19-lever-mass-comparison.js';
import { LONG_EX20_SURFACE_MARKING } from './long-ex20-surface-marking.js';
import { LONG_EX20_SAMPLE_OPENING } from './long-ex20-sample-opening.js';
import { LONG_EX21_AIR_DRY_FOOD } from './long-ex21-air-dry-food.js';
import { LONG_EX21_SMALL_COMBUSTION } from './long-ex21-small-combustion.js';
import { LONG_EX21_BEAM_MASS_COMPARATOR } from './long-ex21-beam-mass-comparator.js';
import { LONG_EX21_SAMPLE_DRYING } from './long-ex21-sample-drying.js';
import { LONG_EX21_CONSTITUENT_TEST } from './long-ex21-constituent-test.js';
import { LONG_EX22_SHELLED_FOOD } from './long-ex22-shelled-food.js';
import { LONG_EX22_OBSERVATIONAL_DRAWING } from './long-ex22-observational-drawing.js';
import { LONG_EX22_SLEEP } from './long-ex22-sleep.js';
import { LONG_EX23_PLANT_WATERING } from './long-ex23-plant-watering.js';
import { LONG_EX23_CASING_CRACKING } from './long-ex23-casing-cracking.js';
import { LONG_EX23_DIGGING_TOOL } from './long-ex23-digging-tool.js';
import { LONG_EX23_SEED_PROPAGATION } from './long-ex23-seed-propagation.js';
import { LONG_EX24_VENTILATED_STORAGE } from './long-ex24-ventilated-storage.js';
import { LONG_EX24_WEATHER_SHELTER } from './long-ex24-weather-shelter.js';
import { LONG_EX24_MATERIAL_EXAMINATION } from './long-ex24-material-examination.js';
import { LONG_EX24_LENGTH_REFERENCE } from './long-ex24-length-reference.js';
import { LONG_EX24_FOOD_EVIDENCE } from './long-ex24-food-evidence.js';
import { LONG_EX24_FOOD_STACK_SELECTION } from './long-ex24-food-stack-selection.js';

/** Append reviewed package versions here; historical handlers retain their versioned identities. */
export const V7_PACKAGES: V7Package[] = [
  V7_BASE,
  V7_NATURE,
  V7_MOSAIC,
  FOREST_BASE,
  OPEN_FOUNDATION,
  collectiveFoundation('collective-foundation'),
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
  COLLECTIVE_FOOD,
  COLLECTIVE_SHELTER,
  ROOT_FOOD_MATRIX,
  ROOT_PREPARATION,
  ROOT_AIR_DRYING,
  TRAY_CLEARANCE_PACKAGE,
  COLLECTIVE_BARK,
  COLLECTIVE_BARK_FEEDBACK,
  COLLECTIVE_FOOD_INSPECTION,
  COLLECTIVE_MATERIAL_COMBINE,
  ROOT_SURFACE_PACKAGE,
  COLLECTIVE_INVENTORY,
  SURFACE_DIAGNOSTIC_PACKAGE,
  TOOL_ASSESSMENT_PACKAGE,
  SMALL_DRYING_PACKAGE,
  LONG_PLANTING,
  LONG_ROOT_ASSESSMENT,
  LONG_SITE_ASSESSMENT,
  LONG_SURFACE,
  LONG_MOSS,
  LONG_RESIDUE,
  LONG_PREPARED_PLANTING,
  LONG_SOL_RESIDUE,
  LONG_MOSS_RESIDUE,
  LONG_MOSS_DIAGNOSTIC,
  LONG_MOSS_PREPARED_PLANTING,
  LONG_JOIN_ASSESSMENT,
  LONG_JOINING,
  LONG_JOIN_RECONCILIATION,
  LONG_NUT_EXAMINATION,
  LONG_NUT_OPENING,
  LONG_APPLE_ASSESSMENT,
  LONG_MOSS_FOOD_ASSESSMENT,
  LONG_OPENED_ASSESSMENT,
  LONG_FOREST_NUT_EXAMINATION,
  LONG_NUT_ACCESS,
  LONG_MOSS_OPENING,
  LONG_MOSS_RECOVERY,
  LONG_BIRCH_ASSESSMENT,
  LONG_MOSS_SEPARATION,
  LONG_PLUM_ASSESSMENT,
  LONG_MOSS_APPLE,
  LONG_BRANCH_ASSESSMENT,
  LONG_CULTIVATION,
  LONG_FOOD_TRIAL,
  LONG_WEATHER_BARRIER,
  LONG_AIR_DRYING,
  LONG_RESTING_MATERIAL,
  LONG_CORDAGE,
  LONG_FOOD_PREPARATION,
  LONG_SIMPLE_SHELTER,
  LONG_SHARED_SHELTER,
  LONG_CULTIVATION_TRIAL,
  LONG_BARK_SEPARATION,
  LONG_PLANT_CULTIVATION,
  LONG_BRANCH_SCREEN,
  LONG_FIBER_MAT,
  LONG_EX17_PLANT_CULTIVATION,
  LONG_HAND_BREAK_FOOD,
  LONG_FIBER_CORD,
  LONG_CORD_KNOT,
  LONG_EX18_PLANT_ESTABLISHMENT,
  LONG_UNHEATED_FOOD_PREPARATION,
  LONG_THERMAL_FOOD_PREPARATION,
  LONG_HEARTH_FOOD_PREPARATION,
  LONG_MECHANICAL_FOOD_HANDLING,
  LONG_FIBER_CORD_JOIN,
  LONG_CROSSING_BINDING,
  LONG_SECTIONED_CORD,
  LONG_CROSSING_LASHING,
  LONG_CROSSING_FRAPPING,
  LONG_EXTENDED_SECTIONED_CORD,
  LONG_EX19_FOOD_AIR_EXPOSURE,
  LONG_EX19_THIN_SLICE_FOOD_DRYING,
  LONG_EX19_CUTTING_EDGE_ASSESSMENT,
  LONG_EX19_SHELL_COMPRESSION_OPENING,
  LONG_EX19_LEVER_MASS_COMPARATOR,
  LONG_EX20_SURFACE_MARKING,
  LONG_EX20_SAMPLE_OPENING,
  LONG_EX21_AIR_DRY_FOOD,
  LONG_EX21_SMALL_COMBUSTION,
  LONG_EX21_BEAM_MASS_COMPARATOR,
  LONG_EX21_SAMPLE_DRYING,
  LONG_EX21_CONSTITUENT_TEST,
  LONG_EX22_SHELLED_FOOD,
  LONG_EX22_OBSERVATIONAL_DRAWING,
  LONG_EX22_SLEEP,
  LONG_EX23_PLANT_WATERING,
  LONG_EX23_CASING_CRACKING,
  LONG_EX23_DIGGING_TOOL,
  LONG_EX23_SEED_PROPAGATION,
  LONG_EX24_VENTILATED_STORAGE,
  LONG_EX24_WEATHER_SHELTER,
  LONG_EX24_MATERIAL_EXAMINATION,
  LONG_EX24_LENGTH_REFERENCE,
  LONG_EX24_FOOD_EVIDENCE,
  LONG_EX24_FOOD_STACK_SELECTION,
];
export const continuousRegistry = (world?: V7World) =>
  v7Registry(
    world?.config.development
      ? [
          ...V7_PACKAGES.filter((p) =>
            ['foundation-forest', 'foundation-open'].includes(p.id),
          ),
          ...(world.config.collective
            ? [collectiveFoundation(world.config.development.scope)]
            : []),
          ...(world.config.longDevelopment?.culture &&
          (world.config.longDevelopment.culture.symbols ||
            world.config.longDevelopment.culture.incentives)
            ? [
                expressionFoundation(
                  world.config.development.scope,
                  world.config.longDevelopment.culture,
                  world.config.vision,
                ),
              ]
            : []),
          // Imported worlds only: packages of inherited scopes keep their handlers,
          // processes and state schemas; v7Install still rejects them for new installs.
          ...(world.config.development.inherited?.length
            ? V7_PACKAGES.filter(
                (p) =>
                  p.scope !== undefined &&
                  !!world.config.development?.inherited?.includes(p.scope),
              )
            : []),
          ...V7_PACKAGES.filter(
            (p) => p.scope === world.config.development?.scope,
          ),
        ]
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
