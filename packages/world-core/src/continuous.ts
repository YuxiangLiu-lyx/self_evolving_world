import type { V7Package, V7World } from './continuous-types.js';
import { V7_BASE } from './continuous-base.js';
import { V7_NATURE } from './continuous-nature.js';
import { V7_MOSAIC } from './continuous-mosaic.js';
import { v7Registry } from './continuous-registry.js';

/** Append reviewed package versions here; historical handlers retain their versioned identities. */
export const V7_PACKAGES: V7Package[] = [V7_BASE, V7_NATURE, V7_MOSAIC];
export const continuousRegistry = () => v7Registry(V7_PACKAGES);
export function v7PublicCatalogue(world: V7World) {
  return {
    revisions: world.revisions,
    interfaces: world.abilities,
    satisfactionSources: world.satisfaction,
    resources: world.resources,
  };
}
