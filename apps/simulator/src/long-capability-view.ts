import { v7Observe } from '@self-evolving-world/world-core';
import type { V7World, V7Ability } from '@self-evolving-world/world-core';
/** Public implementations do not make scoped instance identities universal personal knowledge. */
export function longVisibleAbilities(
  world: V7World,
  actor: string,
): V7Ability[] {
  if (actor === 'world') return world.abilities;
  const o = v7Observe(world, actor),
    known = new Set([
      ...o.objects.map((o) => o.id),
      ...o.stacks.map((s) => s.id),
      ...o.self.memory.objects.map((m) => m.object.id),
      ...world.objects.filter((o) => o.createdBy === actor).map((o) => o.id),
    ]);
  const hidden = [
    ...world.objects.map((o) => o.id),
    ...world.stacks.map((s) => s.id),
  ]
    .filter((id) => !known.has(id))
    .sort((a, b) => b.length - a.length);
  if (!hidden.length) return world.abilities;
  const pattern = new RegExp(
    hidden
      .map((id) =>
        JSON.stringify(id)
          .slice(1, -1)
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .join('|'),
    'g',
  );
  return world.abilities.map(
    (a) =>
      JSON.parse(
        JSON.stringify(a).replace(pattern, '[unobserved instance]'),
      ) as V7Ability,
  );
}
