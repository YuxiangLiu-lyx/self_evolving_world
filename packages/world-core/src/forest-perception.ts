import type { V7Package, V7World } from './continuous-types.js';
import { v7Observe } from './continuous-observation.js';
import { v7Distance, v7Visible } from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-environment.js';

/** Technical event repair is versioned separately so the retained earlier rounds stay exact. */
export const FOREST_PERCEPTION: V7Package = {
  id: 'forest-perception',
  version: 1,
  dependencies: ['foundation-forest@1'],
  description:
    'Ground declared perception subscriptions in actual personal changes without choosing an action.',
  abilities: [],
  satisfaction: [],
  resources: [],
  handlers: {},
  processes: {},
  visualComponents: [],
  events: ['actor-seen', 'discovered', 'weather-changed', 'target-changed'],
  migrate: (world) => {
    world.state.forestPerception = 1;
    return world;
  },
};
function thermal(value: number): string {
  return value < 7
    ? 'cold'
    : value < 16
      ? 'cool'
      : value <= 27
        ? 'mild'
        : value <= 34
          ? 'warm'
          : 'hot';
}
export function forestPerception(before: V7World, world: V7World): void {
  if (world.state.forestPerception !== 1) return;
  for (const actor of world.actors.filter((a) => a.vitals.health > 0)) {
    const old = before.actors.find((a) => a.id === actor.id);
    if (!old) continue;
    const prior = v7Observe(before, actor.id),
      current = v7Observe(world, actor.id);
    for (const other of current.actors.filter(
      (a) => !prior.actors.some((p) => p.id === a.id),
    ))
      forestEvent(
        world,
        'actor-seen',
        `${actor.name} now sees ${other.name}.`,
        actor.position,
        actor.id,
        { observedActor: other.id },
        other.id,
      );
    for (const [resource, knowledge] of Object.entries(
      actor.memory.discoveries ?? {},
    ))
      if (!old.memory.discoveries?.[resource])
        forestEvent(
          world,
          'discovered',
          `Observed properties of ${resource} through actual use.`,
          actor.position,
          actor.id,
          { resource, observed: knowledge },
          resource,
        );
    const a = forestClimate(before, old.position),
      b = forestClimate(world, actor.position);
    if (
      thermal(a.temperature) !== thermal(b.temperature) ||
      a.daylight > 0.1 !== b.daylight > 0.1 ||
      a.indoor !== b.indoor
    )
      forestEvent(
        world,
        'weather-changed',
        `Local conditions changed: ${thermal(b.temperature)}, ${b.daylight > 0.1 ? 'daylight' : 'low light'}, ${b.indoor ? 'inside' : 'outside'}.`,
        actor.position,
        actor.id,
        { temperature: b.temperature, light: b.light, indoor: b.indoor },
      );
    for (const previous of prior.objects.filter((o) => o.kind !== 'animal')) {
      const observed = current.objects.find((o) => o.id === previous.id);
      const disappeared =
        !observed &&
        v7Distance(actor.position, previous.spatial) <= world.config.vision &&
        v7Visible(world, actor.position, previous.spatial);
      const changed = observed && observed.data.stock !== previous.data.stock;
      const ownChange = world.events.some(
        (e) => e.actor === actor.id && e.target === previous.id && e.interface,
      );
      if ((disappeared || changed) && !ownChange)
        forestEvent(
          world,
          'target-changed',
          `Observed source ${previous.name} ${disappeared ? 'is no longer at its previous visible location' : 'has a changed visible quantity'}.`,
          actor.position,
          actor.id,
          { source: previous.id, available: observed?.data.stock ?? null },
          previous.id,
        );
    }
  }
}
