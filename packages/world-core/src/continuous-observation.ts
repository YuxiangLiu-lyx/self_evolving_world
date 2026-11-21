import type {
  V7Actor,
  V7Condition,
  V7Data,
  V7Observation,
  V7World,
} from './continuous-types.js';
import {
  v7Distance,
  v7ShapeDistance,
  v7Visible,
} from './continuous-geometry.js';
import { v7Clone } from './continuous-data.js';

export function v7Observe(world: V7World, id: string): V7Observation {
  const actor = world.actors.find((a) => a.id === id);
  if (!actor) throw new Error('Unknown observer.');
  const radius = world.config.vision;
  const terrain: V7Observation['terrain'] = [];
  for (let y = 0; y < world.config.height; y++)
    for (let x = 0; x < world.config.width; x++) {
      if (
        v7Distance(actor.position, { x: x + 0.5, y: y + 0.5 }) <= radius &&
        v7Visible(world, actor.position, { x: x + 0.5, y: y + 0.5 })
      )
        terrain.push({ x, y, kind: world.terrain[y]?.[x] ?? '?' });
    }
  return v7Clone({
    tick: world.tick,
    time: world.time,
    self: actor,
    actors: world.actors
      .filter(
        (a) =>
          a.id !== id &&
          v7Distance(actor.position, a.position) <= radius &&
          v7Visible(world, actor.position, a.position),
      )
      .map((a) => ({
        id: a.id,
        name: a.name,
        position: a.position,
        alive: a.vitals.health > 0,
      })),
    objects: world.objects
      .filter(
        (o) =>
          v7ShapeDistance(actor.position, o.spatial) <= radius &&
          (o.spatial.enclosure || v7Visible(world, actor.position, o.spatial)),
      )
      .map((o) =>
        world.config.forest
          ? {
              ...o,
              data: Object.fromEntries(
                Object.entries(o.data).filter(
                  ([key]) =>
                    [
                      'resource',
                      'stock',
                      'capacity',
                      'mode',
                      'species',
                      'contents',
                      'progress',
                      'elapsed',
                      'heating',
                      'insulation',
                      'light',
                    ].includes(key) || o.createdBy !== null,
                ),
              ),
            }
          : o,
      ),
    stacks: world.stacks
      .filter(
        (s) =>
          s.owner === id ||
          (s.owner === null &&
            v7Distance(actor.position, s.position) <= radius &&
            v7Visible(world, actor.position, s.position)),
      )
      .map((s) =>
        world.state.foodAssessment === 1 && s.owner === id
          ? { ...s, position: { ...actor.position } }
          : s,
      ),
    terrain,
    events: world.events.filter(
      (e) =>
        e.actor === id ||
        (e.type === 'message' && e.target === id) ||
        (e.position &&
          v7Distance(actor.position, e.position) <= radius &&
          e.type !== 'message' &&
          v7Visible(world, actor.position, e.position)),
    ),
  });
}
export function v7Remember(world: V7World): void {
  for (const actor of world.actors) {
    if (
      world.config.forest &&
      actor.vitals.health <= 0 &&
      !world.events.some((e) => e.actor === actor.id && e.type === 'died')
    )
      continue;
    const observation = v7Observe(world, actor.id),
      memory = actor.memory;
    memory.cells = [
      ...new Set([
        ...memory.cells,
        ...observation.terrain.map((p) => `${String(p.x)},${String(p.y)}`),
      ]),
    ].sort();
    const visibleObjects = new Set(observation.objects.map((o) => o.id)),
      visibleStacks = new Set(observation.stacks.map((o) => o.id));
    memory.objects = memory.objects.filter(
      (m) =>
        !visibleObjects.has(m.object.id) &&
        v7ShapeDistance(actor.position, m.object.spatial) > world.config.vision,
    );
    memory.objects.push(
      ...observation.objects.map((object) => ({ object, seenAt: world.tick })),
    );
    memory.stacks = memory.stacks.filter(
      (m) =>
        !visibleStacks.has(m.stack.id) &&
        m.stack.owner !== actor.id &&
        v7Distance(actor.position, m.stack.position) > world.config.vision,
    );
    memory.stacks.push(
      ...observation.stacks.map((stack) => ({ stack, seenAt: world.tick })),
    );
    for (const event of observation.events.filter(
      (e) => e.actor === actor.id || e.target === actor.id,
    )) {
      if (world.config.forest) {
        if (
          [
            'died',
            'respawned',
            'injured',
            'satisfaction',
            'mastered',
            'message',
            'given',
            'discovered',
            'review-rejected',
          ].includes(event.type) ||
          (![
            'rested',
            'waited',
            'wellbeing',
            'moved',
            'arrived',
            'learning',
            'gathered',
            'ate',
          ].includes(event.type) &&
            event.interface)
        ) {
          memory.important ??= [];
          if (!memory.important.some((x) => x.event === event.id))
            memory.important.push({
              tick: event.tick,
              event: event.id,
              type: event.type,
              summary: event.description,
            });
        }
        if (
          event.type === 'wellbeing' ||
          event.type === 'waited' ||
          (event.type === 'rested' && event.data.recovered === 0)
        )
          continue;
      }
      if (!memory.experiences.some((x) => x.event === event.id))
        memory.experiences.push({
          tick: event.tick,
          event: event.id,
          summary: event.description,
        });
    }
    // The full experience stream lives in the segmented event journal; this is a bounded working memory.
    memory.experiences = memory.experiences.slice(-24);
  }
}
export function v7ReadPath(data: unknown, path: string): unknown {
  let result = data;
  for (const key of path.split('.')) {
    if (
      !result ||
      typeof result !== 'object' ||
      ['__proto__', 'constructor', 'prototype'].includes(key)
    )
      return undefined;
    result = (result as Record<string, unknown>)[key];
  }
  return result;
}
export function v7Condition(
  condition: V7Condition | null,
  data: unknown,
): boolean {
  if (!condition) return false;
  const actual = v7ReadPath(data, condition.path),
    expected = condition.value;
  if (condition.comparison === 'eq') return actual === expected;
  if (condition.comparison === 'neq') return actual !== expected;
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;
  if (condition.comparison === 'lt') return actual < expected;
  if (condition.comparison === 'lte') return actual <= expected;
  if (condition.comparison === 'gt') return actual > expected;
  return actual >= expected;
}
export function v7ConditionContext(world: V7World, actor: V7Actor): V7Data {
  const quantities: V7Data = {};
  for (const stack of world.stacks.filter((s) => s.owner === actor.id))
    quantities[stack.resource] =
      Number(quantities[stack.resource] ?? 0) + stack.quantity;
  return {
    self: {
      ...actor.vitals,
      happiness: actor.wellbeing.total,
      inventory: quantities,
    },
    tick: world.tick,
  };
}
