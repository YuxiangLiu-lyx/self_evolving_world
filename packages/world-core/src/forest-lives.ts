import type { V7Cursor, V7World, V7Registry } from './continuous-types.js';
import { v7Clone, V7ComputePause } from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7Obstacles,
  v7SegmentClear,
} from './continuous-geometry.js';
import { forestEvent } from './forest-environment.js';

/** Death settles once after the simultaneous actions/environment, before the next decision. */
export function forestLives(
  before: V7World,
  world: V7World,
  cursors: Record<string, V7Cursor>,
  registry: V7Registry,
): void {
  if (!world.config.forest) return;
  for (const actor of world.actors) {
    const previous = before.actors.find((a) => a.id === actor.id),
      life = actor.life;
    if (
      !life ||
      !previous ||
      previous.vitals.health <= 0 ||
      actor.vitals.health > 0
    )
      continue;
    const position = { ...actor.position };
    life.deaths += 1;
    for (const pkg of registry.packages.filter((p) =>
      world.revisions.includes(`${p.id}@${String(p.version)}`),
    ))
      pkg.onDeath?.(world, actor);
    const evidence = world.events.filter(
      (e) => e.actor === actor.id && ['injured', 'ate'].includes(e.type),
    );
    const remaining = Math.max(0, life.total - life.deaths);
    life.lastDeath = {
      tick: world.tick,
      position,
      before: { ...previous.vitals },
      after: { ...actor.vitals },
      evidence: evidence.map((e) => ({
        id: e.id,
        description: e.description,
        data: e.data,
      })),
      cause: evidence.length
        ? evidence.map((e) => e.description).join(' ')
        : 'Unknown: no attributable damage event was recorded.',
      unknown: 'Unrecorded contributing factors are unknown.',
      priorPlan:
        actor.memory.intention ??
        cursors[actor.id]?.plan.intention ??
        'Unknown',
      remainingLives: remaining,
    };
    for (const stack of world.stacks.filter((s) => s.owner === actor.id)) {
      stack.owner = null;
      stack.position = { ...position };
    }
    actor.learning = null;
    actor.wellbeing.sources = [];
    forestEvent(
      world,
      'died',
      `${actor.name} died. ${String(remaining)} lives remain. ${typeof life.lastDeath.cause === 'string' ? life.lastDeath.cause : 'Unknown'}`,
      position,
      actor.id,
      v7Clone(life.lastDeath),
    );
    if (remaining === 0) continue;
    const candidates = [{ ...life.spawn }];
    for (let radius = 0.6; radius <= 3; radius += 0.6)
      for (let index = 0; index < 16; index++)
        candidates.push({
          x: life.spawn.x + radius * Math.cos((index * Math.PI) / 8),
          y: life.spawn.y + radius * Math.sin((index * Math.PI) / 8),
        });
    const spawn = candidates.find(
      (p) =>
        v7Inside(world, p, actor.radius) &&
        v7SegmentClear(p, p, actor.radius, v7Obstacles(world)) &&
        world.actors.every(
          (other) =>
            other.id === actor.id ||
            v7Distance(p, other.position) >= actor.radius + other.radius,
        ) &&
        world.objects
          .filter(
            (o) =>
              o.kind === 'animal' &&
              (o.data.species === 'wolf' || o.data.species === 'boar'),
          )
          .every((o) => v7Distance(p, o.spatial) > 3),
    );
    if (!spawn)
      throw new V7ComputePause(
        'No safe traversable spawn position remains; preserve the round for review instead of overwriting structures.',
      );
    actor.position = spawn;
    actor.vitals = {
      health: 100,
      satiety: world.config.forest.respawnSatiety,
      energy: world.config.energyCap,
      temperature: 22,
    };
    forestEvent(
      world,
      'respawned',
      `${actor.name} returned to the initial region with ${String(remaining)} lives. Possessions remain at the death location.`,
      spawn,
      actor.id,
      { deathPosition: position, remainingLives: remaining },
    );
  }
}
