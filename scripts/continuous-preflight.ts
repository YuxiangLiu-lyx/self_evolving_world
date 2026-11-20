import {
  continuousRegistry,
  v7Step,
  v7Reach,
  v7Distance,
  v7Observe,
} from '@self-evolving-world/world-core';
import type { V7Action } from '@self-evolving-world/world-core';
import { initialContinuousWorld } from '../apps/simulator/src/continuous-scenario.js';

/** An explicitly simulated feasibility oracle. This policy is never imported by model input or execution. */
export function continuousPreflight(rounds = 1000) {
  let world = initialContinuousWorld();
  const initial = world,
    calls = 0,
    actions: Record<string, number> = {},
    firstMeals: Record<string, number> = {},
    distance: Record<string, number> = {},
    minimumSatiety: Record<string, number> = {},
    minimumHealth: Record<string, number> = {};
  for (let tick = 0; tick < rounds; tick++) {
    const intents: Record<string, V7Action> = {};
    for (const actor of world.actors) {
      const owned = world.stacks.find(
        (s) =>
          s.owner === actor.id &&
          world.resources.some((r) => r.id === s.resource && r.nutrition > 0),
      );
      if (actor.vitals.energy < 4)
        intents[actor.id] = { interface: 'rest', args: {} };
      else if (actor.vitals.satiety < 78 && owned)
        intents[actor.id] = {
          interface: 'eat',
          args: { target: owned.id, quantity: 1 },
        };
      else if (actor.vitals.satiety < 78) {
        const source = v7Observe(world, actor.id)
          .objects.filter(
            (o) =>
              Number(o.data.stock) > 0 &&
              world.resources.some(
                (r) => r.id === o.data.resource && r.nutrition > 0,
              ),
          )
          .sort(
            (a, b) =>
              v7Distance(actor.position, a.spatial) -
              v7Distance(actor.position, b.spatial),
          )[0];
        if (!source)
          throw new Error(
            'Offline survival feasibility has no observed food source.',
          );
        intents[actor.id] = v7Reach(actor, source.spatial)
          ? { interface: 'gather', args: { target: source.id, quantity: 1 } }
          : { interface: 'navigate', args: { target: source.id, x: 0, y: 0 } };
      } else
        intents[actor.id] = {
          interface: actor.vitals.energy < 38 ? 'rest' : 'wait',
          args: {},
        };
    }
    const result = v7Step(world, intents, continuousRegistry());
    if (result.paused) throw new Error(result.paused);
    if (Object.values(result.outcomes).some((o) => !o.success))
      throw new Error(
        `Offline feasibility action failed: ${JSON.stringify(result.outcomes)}`,
      );
    world = result.world;
    for (const event of world.events)
      if (event.actor && event.interface) {
        actions[event.interface] = (actions[event.interface] ?? 0) + 1;
        if (event.type === 'ate') firstMeals[event.actor] ??= world.tick;
        if (event.type === 'moved' || event.type === 'arrived')
          distance[event.actor] =
            (distance[event.actor] ?? 0) + Number(event.data.distance ?? 0);
      }
    for (const actor of world.actors) {
      minimumSatiety[actor.id] = Math.min(
        minimumSatiety[actor.id] ?? 100,
        actor.vitals.satiety,
      );
      minimumHealth[actor.id] = Math.min(
        minimumHealth[actor.id] ?? 100,
        actor.vitals.health,
      );
    }
  }
  if (world.actors.some((a) => a.vitals.health !== 100))
    throw new Error(
      'Offline long-window baseline survival was not maintained.',
    );
  return {
    version: 7,
    controller: 'isolated-feasibility-oracle',
    purpose:
      'Prove baseline feasibility only; this policy and its routes are excluded from ordinary prompts, calls and discovery evidence.',
    rounds,
    modelCalls: calls,
    configuration: world.config,
    starts: initial.actors.map((a) => ({
      actor: a.id,
      position: a.position,
      nearestObservedFoodDistance: Math.min(
        ...v7Observe(initial, a.id)
          .objects.filter((o) =>
            initial.resources.some(
              (r) => r.id === o.data.resource && r.nutrition > 0,
            ),
          )
          .map((o) => v7Distance(a.position, o.spatial)),
      ),
    })),
    initialFoodUnits: initial.objects
      .filter((o) =>
        initial.resources.some(
          (r) => r.id === o.data.resource && r.nutrition > 0,
        ),
      )
      .reduce((n, o) => n + Number(o.data.stock), 0),
    renewal:
      'Twelve established perennial sources each replenish at most one ripe unit per twelve rounds using declared external daylight and groundwater, only below standing capacity twelve. Harvest and consumption require separate paid actions.',
    metabolicDemand: rounds * 3 * world.config.hunger,
    firstMeals,
    minimumSatiety,
    minimumHealth,
    movementDistance: distance,
    actionDistribution: actions,
    final: world.actors.map((a) => ({
      id: a.id,
      vitals: a.vitals,
      wellbeing: a.wellbeing,
    })),
  };
}
