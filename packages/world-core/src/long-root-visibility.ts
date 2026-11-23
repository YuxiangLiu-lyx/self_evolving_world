import type { V7World } from './continuous-types.js';
/** Physical covering hides current specimen quantities and spoil events, not dated personal records. */
export function rootSpecimenVisible(w: V7World, item: string | null): boolean {
  return (
    !w.revisions.includes('root-assessment@1') ||
    !w.objects.some(
      (o) =>
        o.revision === 'root-planting-trial@1' &&
        typeof o.data.plantedAt === 'number' &&
        o.data.inputItem === item &&
        o.data.exposed !== true,
    )
  );
}
