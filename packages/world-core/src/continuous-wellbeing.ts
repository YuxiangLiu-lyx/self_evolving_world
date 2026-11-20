import type { V7Actor, V7World } from './continuous-types.js';
import { v7RoundNumber, v7Id } from './continuous-data.js';
import { v7Condition } from './continuous-observation.js';
import { v7Reach } from './continuous-geometry.js';

export function v7Ambient(world: V7World, actor: V7Actor): number {
  const ground =
    world.terrain[Math.floor(actor.position.y)]?.[
      Math.floor(actor.position.x)
    ] ?? '.';
  return (
    21 +
    4 * Math.sin((world.time * Math.PI) / 120) +
    (ground === ':' ? 3 : ground === ',' ? -2 : 0)
  );
}
export function v7Physiology(world: V7World, actor: V7Actor): void {
  if (actor.vitals.health <= 0) return;
  const v = actor.vitals,
    ambient = v7Ambient(world, actor);
  const shelter = Math.max(
    0,
    ...world.objects
      .filter((o) => v7Reach(actor, o.spatial))
      .map((o) =>
        typeof o.data.insulation === 'number' ? o.data.insulation : 0,
      ),
  );
  v.temperature = v7RoundNumber(
    v.temperature + ((ambient - v.temperature) * 0.08) / (1 + shelter),
  );
  if (v.satiety <= 0)
    v.health = Math.max(0, v.health - world.config.starvation);
  const thermalDamage =
    Math.max(0, 10 - v.temperature, v.temperature - 35) * 0.2;
  v.health = v7RoundNumber(Math.max(0, v.health - thermalDamage));
  v.satiety = Math.max(0, v.satiety - world.config.hunger * world.config.dt);
}
/** Only successful executed events can ground nonphysical satisfaction. */
export function v7Wellbeing(world: V7World): void {
  const executed = [...world.events];
  for (const actor of world.actors) {
    const old = actor.wellbeing.total;
    for (const rule of world.satisfaction) {
      let source = actor.wellbeing.sources.find((s) => s.source === rule.id);
      if (source && world.tick > source.expires) source.value = 0;
      else if (source && rule.mode === 'linear')
        source.value = Math.max(0, source.value - rule.cap / rule.duration);
      else if (
        source &&
        rule.mode === 'maintained' &&
        world.tick > source.lastTick + rule.duration
      )
        source.value = 0;
      for (const event of executed) {
        if (
          !event.success ||
          event.actor !== actor.id ||
          event.type !== rule.event ||
          event.interface !== rule.interface ||
          ['requested', 'learning', 'mastered', 'registered'].includes(
            event.type,
          ) ||
          !rule.conditions.every((c) => v7Condition(c, event.data))
        )
          continue;
        if (
          source &&
          (source.lastEvent === event.id ||
            world.tick - source.lastTick < rule.cooldown)
        )
          continue;
        if (!source) {
          source = {
            source: rule.id,
            value: 0,
            lastEvent: '',
            lastTick: -1,
            expires: 0,
            exposures: 0,
          };
          actor.wellbeing.sources.push(source);
        }
        const amplitude =
          rule.repetition === 'diminish'
            ? rule.amount / (1 + source.exposures * 0.15)
            : rule.amount;
        source.value = Math.min(
          rule.cap,
          rule.repetition === 'add' ? source.value + amplitude : amplitude,
        );
        source.lastEvent = event.id;
        source.lastTick = world.tick;
        source.expires = world.tick + rule.duration;
        source.exposures += 1;
        world.events.push({
          id: v7Id(world, 'event'),
          tick: world.tick,
          actor: actor.id,
          type: 'satisfaction',
          interface: event.interface,
          success: true,
          description: `${rule.name}: ${String(v7RoundNumber(source.value))} satisfaction, grounded in ${event.id}.`,
          position: { ...actor.position },
          target: rule.id,
          data: { source: rule.id, evidence: event.id, value: source.value },
        });
      }
    }
    const v = actor.vitals;
    const thermal = Math.max(
      0,
      1 - Math.max(0, 16 - v.temperature, v.temperature - 27) / 12,
    );
    actor.wellbeing.physical = v7RoundNumber(
      world.config.physicalCap *
        ((0.3 * v.health) / 100 +
          (0.25 * v.satiety) / 100 +
          (0.25 * v.energy) / world.config.energyCap +
          0.2 * thermal),
    );
    actor.wellbeing.mental = v7RoundNumber(
      Math.min(
        world.config.mentalCap,
        actor.wellbeing.sources.reduce((n, s) => n + s.value, 0),
      ),
    );
    actor.wellbeing.total =
      v.health <= 0
        ? 0
        : v7RoundNumber(actor.wellbeing.physical + actor.wellbeing.mental);
    if (Math.abs(old - actor.wellbeing.total) > 1e-7)
      world.events.push({
        id: v7Id(world, 'event'),
        tick: world.tick,
        actor: actor.id,
        type: 'wellbeing',
        interface: null,
        success: true,
        description: `Wellbeing ${String(actor.wellbeing.total)}: physical ${String(actor.wellbeing.physical)}, other satisfaction ${String(actor.wellbeing.mental)}.`,
        position: { ...actor.position },
        target: null,
        data: {
          before: old,
          after: actor.wellbeing.total,
          physical: actor.wellbeing.physical,
          mental: actor.wellbeing.mental,
        },
      });
  }
}
