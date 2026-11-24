import { forestClimate, forestPhysiology } from './forest-environment.js';
import { collectiveExperienceScale } from './collective-social.js';
import type { V7Actor, V7World } from './continuous-types.js';
import { v7RoundNumber, v7Id } from './continuous-data.js';
import { v7Condition } from './continuous-observation.js';
import { v7Reach } from './continuous-geometry.js';

export function v7Ambient(world: V7World, actor: V7Actor): number {
  if (world.config.forest)
    return forestClimate(world, actor.position).temperature;
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
  if (world.config.forest) {
    forestPhysiology(world, actor);
    return;
  }
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
      if (source && rule.maintenance)
        source.value = source.transient ?? source.value;
      const historyKey = `satisfaction-history:${rule.id}`;
      const previousReward = actor.extensionState[historyKey];
      let lastReward =
        source?.lastTick ??
        (typeof previousReward === 'number' ? previousReward : -Infinity);
      if (source && rule.repeatWindow) {
        source.layers = (source.layers ?? []).filter(
          (p) => p.expires >= world.tick,
        );
        source.value = Math.max(0, ...source.layers.map((p) => p.value));
      } else if (
        source &&
        world.config.experience &&
        rule.mode === 'maintained'
      )
        source.value = Math.max(0, source.value * Math.exp(-1 / rule.duration));
      else if (source && world.tick > source.expires) source.value = 0;
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
          (world.config.forest &&
            (actor.vitals.health <= 0 ||
              world.events.some(
                (e) => e.actor === actor.id && e.type === 'died',
              ))) ||
          !(rule.participants === 'participants'
            ? Array.isArray(event.data.participants) &&
              event.data.participants.includes(actor.id)
            : event.actor === actor.id) ||
          ![
            { event: rule.event, interface: rule.interface },
            ...(rule.alternativeTriggers ?? []),
          ].some(
            (trigger) =>
              event.type === trigger.event &&
              (rule.derived
                ? event.interface === null
                : event.interface === trigger.interface),
          ) ||
          ['requested', 'learning', 'mastered', 'registered'].includes(
            event.type,
          ) ||
          !rule.conditions.every((c) =>
            v7Condition(
              c,
              world.config.forest
                ? {
                    ...event.data,
                    self: {
                      ...actor.vitals,
                      relationships: actor.relationships,
                      preferences: actor.memory.preferences,
                    },
                  }
                : event.data,
            ),
          )
        )
          continue;
        if (
          (source && source.lastEvent === event.id) ||
          world.tick -
            (rule.repeatWindow ? lastReward : (source?.lastTick ?? -Infinity)) <
            rule.cooldown
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
          collectiveExperienceScale(actor, event.type) *
          (rule.repeatWindow &&
          world.tick - lastReward <= rule.repeatWindow.rounds
            ? rule.repeatWindow.amount
            : rule.repetition === 'diminish'
              ? rule.amount / (1 + source.exposures * 0.15)
              : rule.amount);
        source.value = Math.min(
          rule.cap,
          world.config.experience && rule.mode === 'maintained'
            ? source.value + amplitude / 6
            : rule.repetition === 'add'
              ? source.value + amplitude
              : amplitude,
        );
        if (rule.repeatWindow) {
          source.layers = [
            ...(source.layers ?? []),
            { value: amplitude, expires: world.tick + rule.duration },
          ];
          source.value = Math.min(
            rule.cap,
            Math.max(...source.layers.map((p) => p.value)),
          );
          actor.extensionState[historyKey] = world.tick;
          lastReward = world.tick;
        }
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
      if (rule.maintenance) {
        const m = rule.maintenance;
        const evidence = executed.find(
          (e) =>
            e.success &&
            (world.config.development && rule.participants === 'participants'
              ? Array.isArray(e.data.participants) &&
                e.data.participants.includes(actor.id)
              : e.actor === actor.id) &&
            (!world.config.development ||
              rule.conditions.every((c) =>
                v7Condition(c, {
                  ...e.data,
                  self: {
                    ...actor.vitals,
                    relationships: actor.relationships,
                    preferences: actor.memory.preferences,
                  },
                }),
              )) &&
            [
              { event: m.event, interface: m.interface },
              ...(m.alternativeTriggers ?? []),
            ].some(
              (trigger) =>
                e.type === trigger.event &&
                (rule.derived
                  ? e.interface === null
                  : e.interface === trigger.interface),
            ),
        );
        if (evidence && actor.vitals.health > 0 && !source) {
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
        if (source) {
          source.transient = source.value;
          source.sustained = Math.min(
            m.cap ?? rule.cap,
            Math.max(
              0,
              (source.sustained ?? 0) +
                (evidence && actor.vitals.health > 0
                  ? m.gain *
                      (m.roundsField
                        ? Math.max(
                            0,
                            Math.min(
                              m.maxRounds ?? 1,
                              Number(evidence.data[m.roundsField] ?? 0),
                            ),
                          )
                        : 1) -
                    (m.decayOnGain ? m.decay : 0)
                  : -m.decay),
            ),
          );
          source.value = Math.min(
            rule.cap,
            Math.max(source.transient, source.sustained),
          );
          if (evidence)
            world.events.push({
              id: v7Id(world, 'event'),
              tick: world.tick,
              actor: actor.id,
              type: 'satisfaction-maintained',
              interface: evidence.interface,
              success: true,
              description: `${rule.name}: actual activity maintained the shared satisfaction source.`,
              position: { ...actor.position },
              target: rule.id,
              data: {
                evidence: evidence.id,
                sustained: source.sustained,
                value: source.value,
              },
            });
        }
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
    if (world.config.forest && v.health <= 0) actor.wellbeing.physical = 0;
    actor.wellbeing.mental = v7RoundNumber(
      Math.min(
        world.config.mentalCap,
        actor.wellbeing.sources.reduce((n, s) => n + s.value, 0) +
          (world.config.experience &&
          world.tick <= (actor.experience?.pleasureUntil ?? -1)
            ? (actor.experience?.pleasure ?? 0)
            : 0),
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
