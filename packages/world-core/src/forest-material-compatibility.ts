import type { V7World } from './continuous-types.js';
/** Reviewed physical substitutes; names alone never establish recipe compatibility. */
export function forestMaterialRole(w: V7World, resource: string): string {
  if (w.state.willowMaterials !== 1) return resource;
  const r = w.resources.find((r) => r.id === resource);
  if (
    resource === 'willow-bark' &&
    r?.mass === 0.3 &&
    r.properties?.flexibility === 6
  )
    return 'bark';
  if (
    resource === 'bast-cord' &&
    r?.mass === 0.5 &&
    r.properties?.flexibility === 9
  )
    return 'vine';
  return resource;
}
export function forestFireFuel(w: V7World, resource: string): boolean {
  return (
    ['branch', 'bark', 'dry-grass', 'wood'].includes(resource) ||
    (w.state.willowMaterials === 1 &&
      ['willow-bark', 'bast-cord', 'willow-offcut'].includes(resource))
  );
}
