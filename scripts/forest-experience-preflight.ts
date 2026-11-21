import {
  continuousRegistry,
  v7Step,
  v7Observe,
  v7Reach,
  v7Distance,
  forestRoute,
  v7Work,
  v7Approach,
  v7Clone,
} from '@self-evolving-world/world-core';
import type { V7Action } from '@self-evolving-world/world-core';
import { initialForestExperienceWorld } from '../apps/simulator/src/forest-experience-scenario.js';

/** Isolated feasibility oracle. This file and its policy are never sent to the ordinary model. */
export function forestExperiencePreflight(rounds = 1200) {
  let world = initialForestExperienceWorld();
  const registry = continuousRegistry(),
    initial = world;
  const actions: Record<string, number> = {},
    failures: Record<string, number> = {},
    minima: Record<string, { health: number; satiety: number }> = {},
    firstFood: Record<string, number> = {};
  const food = (id: unknown) =>
    world.resources.find(
      (r) => r.id === id && r.nutrition > 0 && r.toxicity === 0,
    );
  const blocked = new Map<string, Set<string>>();
  for (let tick = 0; tick < rounds; tick++) {
    // This omniscient feasibility oracle is deliberately separate from private formal observations.
    world = v7Clone(world);
    for (const a of world.actors) {
      a.memory.objects = world.objects.map((object) => ({
        object: v7Clone(object),
        seenAt: world.tick,
      }));
      a.memory.cells = world.terrain.flatMap((row, y) =>
        Array.from(
          { length: row.length },
          (_, x) => `${String(x)},${String(y)}`,
        ),
      );
    }
    const intents: Record<string, V7Action> = {};
    for (const actor of world.actors) {
      const o = v7Observe(world, actor.id);
      const owned = world.stacks.find(
        (s) => s.owner === actor.id && !s.reservedFor && food(s.resource),
      );
      const available = [
        ...o.objects,
        ...actor.memory.objects
          .filter((m) => !o.objects.some((x) => x.id === m.object.id))
          .map((m) => m.object),
      ]
        .filter(
          (x) =>
            food(x.data.resource) &&
            Number(x.data.stock) > 0 &&
            !blocked.get(actor.id)?.has(x.id) &&
            initial.actors
              .slice()
              .sort(
                (a, b) =>
                  v7Distance(a.position, x.spatial) -
                  v7Distance(b.position, x.spatial),
              )[0]?.id === actor.id,
        )
        .sort(
          (a, b) =>
            v7Distance(actor.position, a.spatial) -
            v7Distance(actor.position, b.spatial),
        );
      const source = available[0];
      const visibleSource =
        source ??
        world.objects
          .filter(
            (x) =>
              food(x.data.resource) &&
              Number(x.data.stock) > 0 &&
              !blocked.get(actor.id)?.has(x.id) &&
              initial.actors
                .slice()
                .sort(
                  (a, b) =>
                    v7Distance(a.position, x.spatial) -
                    v7Distance(b.position, x.spatial),
                )[0]?.id === actor.id,
          )
          .sort(
            (a, b) =>
              v7Distance(actor.position, a.spatial) -
              v7Distance(actor.position, b.spatial),
          )[0];
      if (actor.learning) intents[actor.id] = { interface: 'wait', args: {} };
      else if (tick === 0)
        intents[actor.id] = {
          interface: 'learn',
          args: { ability: 'active-warming' },
        };
      else if (actor.vitals.satiety < 78 && owned)
        intents[actor.id] = {
          interface: 'eat',
          args: { target: owned.id, quantity: 1 },
        };
      else if (actor.vitals.energy < 8)
        intents[actor.id] = { interface: 'rest', args: {} };
      else if (
        actor.vitals.satiety >= 35 &&
        actor.vitals.temperature < 13 &&
        actor.mastered.includes('active-warming')
      )
        intents[actor.id] = {
          interface: 'active-warming',
          args: { rounds: 1 },
        };
      else if (actor.vitals.satiety < 78 && visibleSource) {
        if (v7Reach(actor, visibleSource.spatial))
          intents[actor.id] = {
            interface: 'gather',
            args: { target: visibleSource.id, quantity: 1 },
          };
        else {
          // The isolated oracle may search real interaction points; it still pays continuous movement and collision costs.
          const center = visibleSource.spatial;
          const points = [
            v7Approach(actor, center),
            ...Array.from({ length: 16 }, (_, i) => ({
              x: center.x + Math.cos((i * Math.PI) / 8) * 0.8,
              y: center.y + Math.sin((i * Math.PI) / 8) * 0.8,
            })),
          ];
          const point = points.find(
            (p) =>
              forestRoute(
                world,
                actor,
                p,
                v7Work(world.config.computation.workPerRound),
              ).path.length > 0,
          );
          if (point)
            intents[actor.id] = {
              interface: 'navigate',
              args: { target: '', x: point.x, y: point.y },
            };
          else {
            const set = blocked.get(actor.id) ?? new Set<string>();
            set.add(visibleSource.id);
            blocked.set(actor.id, set);
            intents[actor.id] = { interface: 'wait', args: {} };
          }
        }
      } else
        intents[actor.id] = {
          interface: actor.vitals.energy < 35 ? 'rest' : 'wait',
          args: {},
        };
    }
    const result = v7Step(world, intents, registry);
    if (result.paused) throw new Error(result.paused);
    world = result.world;
    for (const actor of world.actors) {
      const action = intents[actor.id],
        outcome = result.outcomes[actor.id];
      actions[action?.interface ?? 'none'] =
        (actions[action?.interface ?? 'none'] ?? 0) + 1;
      if (outcome && !outcome.success) {
        failures[outcome.reason] = (failures[outcome.reason] ?? 0) + 1;
        if (typeof action?.args.target === 'string') {
          const set = blocked.get(actor.id) ?? new Set<string>();
          set.add(action.args.target);
          blocked.set(actor.id, set);
        }
      }
      if (
        action?.interface === 'gather' &&
        outcome?.success &&
        firstFood[actor.id] === undefined
      )
        firstFood[actor.id] = world.tick;
      const prior = minima[actor.id] ?? { health: 100, satiety: 100 };
      minima[actor.id] = {
        health: Math.min(prior.health, actor.vitals.health),
        satiety: Math.min(prior.satiety, actor.vitals.satiety),
      };
      if ((actor.life?.deaths ?? 0) > 0)
        throw new Error(
          `Isolated baseline lost a life: ${actor.id} at ${String(world.tick)}; ${JSON.stringify({ minima, actions, failures })}`,
        );
    }
    if (tick % 80 === 79) blocked.clear();
  }
  const spare = actions.wait ?? 0;
  if (spare < rounds * 3 * 0.15)
    throw new Error('Baseline leaves less than 15% optional activity time.');
  return {
    version: 1,
    controller: 'isolated-experience-feasibility',
    modelCalls: 0,
    rounds,
    seed: initial.config.seed,
    configuration: initial.config,
    firstFoodRound: firstFood,
    initialSafeNutrition: initial.objects.reduce(
      (n, x) =>
        n + Number(x.data.stock ?? 0) * (food(x.data.resource)?.nutrition ?? 0),
      0,
    ),
    nearestFoodDistances: initial.actors.map((a) => ({
      actor: a.id,
      distance: Math.min(
        ...initial.objects
          .filter((x) => food(x.data.resource))
          .map((x) => v7Distance(a.position, x.spatial)),
      ),
    })),
    minima,
    actions,
    failures,
    optionalRounds: spare,
    optionalShare: spare / (rounds * 3),
    final: world.actors.map((a) => ({
      id: a.id,
      vitals: a.vitals,
      lives: a.life,
      mental: a.experience?.mental,
    })),
    limitation:
      'Authored offline feasibility only; no autonomous discovery or causal guarantee. Oracle uses actual safe definitions, which are excluded from ordinary inputs.',
  };
}
