import {
  v7Step,
  v7Registry,
  V7_PACKAGES,
  v7Install,
  v7Observe,
  v7Reach,
  v7Distance,
  v7Clone,
} from '@self-evolving-world/world-core';
import type { V7Action } from '@self-evolving-world/world-core';
import { initialForestWorld } from '../apps/simulator/src/forest-scenario.js';
import { forestFixturePackage } from '../packages/world-core/test/fixtures/forest-extension.js';

/** Offline viability calculation only. This controller and its fixture ability never enter real inputs. */
export function forestPreflight(rounds = 200, respawn = false) {
  const registry = v7Registry([...V7_PACKAGES, forestFixturePackage]);
  let world = v7Install(
    initialForestWorld(),
    registry,
    'isolated-forest-room@1',
  );
  if (respawn) {
    const damaged = v7Clone(world);
    damaged.actors.forEach((a) => {
      a.vitals.health = 1;
      a.vitals.satiety = 0;
    });
    damaged.objects
      .filter((o) => o.id.startsWith('start-') && o.data.resource === 'berry')
      .forEach((o) => {
        o.data.stock = 0;
      });
    const death = v7Step(
      damaged,
      Object.fromEntries(
        damaged.actors.map((a) => [a.id, { interface: 'wait', args: {} }]),
      ),
      registry,
    );
    if (death.paused) throw new Error(death.paused);
    world = death.world;
    if (
      world.actors.some((a) => a.life?.deaths !== 1) ||
      world.objects.some(
        (o) =>
          o.id.startsWith('start-') &&
          o.data.resource === 'berry' &&
          o.data.stock !== 0,
      )
    )
      throw new Error(
        'Respawn calibration changed life counts or refreshed depleted food.',
      );
  }
  const initial = world,
    actions: Record<string, number> = {},
    minima: Record<string, { health: number; satiety: number }> = {},
    distance: Record<string, number> = {};
  for (let tick = 0; tick < rounds; tick++) {
    const intents: Record<string, V7Action> = {};
    for (const actor of world.actors) {
      const observation = v7Observe(world, actor.id);
      const owned = world.stacks.find(
        (s) =>
          s.owner === actor.id &&
          world.resources.some(
            (r) => r.id === s.resource && r.nutrition > 0 && r.toxicity === 0,
          ),
      );
      if (tick === 0)
        intents[actor.id] = {
          interface: 'learn',
          args: { ability: 'fixture-build' },
        };
      else if (actor.learning)
        intents[actor.id] = { interface: 'wait', args: {} };
      else if (actor.vitals.energy < 5)
        intents[actor.id] = { interface: 'rest', args: {} };
      else if (actor.vitals.satiety < 72 && owned)
        intents[actor.id] = {
          interface: 'eat',
          args: { target: owned.id, quantity: 1 },
        };
      else if (actor.vitals.satiety < 72) {
        const sources = observation.objects
          .filter(
            (o) =>
              Number(o.data.stock) > 0 &&
              world.resources.some(
                (r) =>
                  r.id === o.data.resource &&
                  r.nutrition > 0 &&
                  r.toxicity === 0,
              ),
          )
          .sort(
            (a, b) =>
              v7Distance(actor.position, a.spatial) -
              v7Distance(actor.position, b.spatial),
          );
        const source = sources[0];
        if (!source)
          throw new Error(
            `No safe observed food during isolated feasibility: ${actor.id} at ${String(tick)}.`,
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
    const result = v7Step(world, intents, registry);
    if (result.paused || Object.values(result.outcomes).some((o) => !o.success))
      throw new Error(
        `Forest feasibility execution: ${JSON.stringify(result.outcomes)} ${result.paused ?? ''}`,
      );
    world = result.world;
    for (const event of world.events)
      if (event.interface && event.actor) {
        actions[event.interface] = (actions[event.interface] ?? 0) + 1;
        distance[event.actor] =
          (distance[event.actor] ?? 0) + Number(event.data.distance ?? 0);
      }
    for (const actor of world.actors) {
      const old = minima[actor.id] ?? { health: 100, satiety: 100 };
      minima[actor.id] = {
        health: Math.min(old.health, actor.vitals.health),
        satiety: Math.min(old.satiety, actor.vitals.satiety),
      };
      if (
        (actor.life?.deaths ?? 0) > (respawn ? 1 : 0) ||
        actor.vitals.health <= 0
      )
        throw new Error(
          'The suitable-season baseline did not preserve its initial life.',
        );
    }
  }
  return {
    version: 1,
    controller: 'isolated-forest-feasibility',
    modelCalls: 0,
    respawn,
    rounds,
    purpose:
      'Demonstrate complete travel/gather/eat/rest and actual individual study costs in suitable conditions. This is not a winter survival claim or an autonomous policy.',
    configuration: initial.config,
    initialResources: initial.resources.length,
    initialObjects: initial.objects.length,
    learning:
      'All three actors spend three real rounds learning an isolated interface, never executing its authored activity. The package and policy are excluded from real genesis and prompts.',
    minima,
    movementDistance: distance,
    actionDistribution: actions,
    spareRounds: (actions.wait ?? 0) - 6,
    final: world.actors.map((a) => ({
      actor: a.id,
      vitals: a.vitals,
      lives: a.life,
    })),
  };
}
