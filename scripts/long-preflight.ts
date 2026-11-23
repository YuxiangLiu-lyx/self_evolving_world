import {
  continuousRegistry,
  v7Clone,
  v7Step,
  v7Reach,
  v7Distance,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
/** Deliberately constrained no-model counterexample, never an ordinary decision hint. */
export function longPreflight(genesis: V7World) {
  let world = v7Clone(genesis);
  const registry = continuousRegistry(world),
    selected: Record<string, string> = {},
    firstDepletion: Record<string, number> = {},
    firstDeath: Record<string, number> = {};
  for (const a of world.actors) {
    const source = world.objects
      .filter((o) =>
        world.resources.some(
          (r) =>
            r.id === o.data.resource && r.nutrition > 0 && r.toxicity === 0,
        ),
      )
      .sort(
        (x, y) =>
          v7Distance(a.position, x.spatial) - v7Distance(a.position, y.spatial),
      )[0];
    if (source) selected[a.id] = source.id;
  }
  for (let tick = 0; tick < 1600; tick++) {
    const actions: Record<string, V7Action> = {};
    for (const a of world.actors) {
      const source = world.objects.find((o) => o.id === selected[a.id]);
      const food = world.stacks.find(
        (s) =>
          s.owner === a.id &&
          world.resources.some(
            (r) => r.id === s.resource && r.nutrition > 0 && r.toxicity === 0,
          ),
      );
      if (a.vitals.satiety < 78 && food)
        actions[a.id] = {
          interface: 'eat',
          args: { target: food.id, quantity: Math.min(1, food.quantity) },
        };
      else if (a.vitals.energy < 20)
        actions[a.id] = { interface: 'rest', args: {} };
      else if (source && !v7Reach(a, source.spatial))
        actions[a.id] = {
          interface: 'navigate',
          args: { target: source.id, x: 0, y: 0 },
        };
      else if (source && a.vitals.satiety < 78 && Number(source.data.stock) > 0)
        actions[a.id] = {
          interface: 'gather',
          args: { target: source.id, quantity: 1 },
        };
      else actions[a.id] = { interface: 'wait', args: {} };
      if (source && Number(source.data.stock) < 1)
        firstDepletion[a.id] ??= tick;
    }
    const result = v7Step(world, actions, registry);
    if (result.paused) throw new Error(result.paused);
    world = result.world;
    for (const a of world.actors)
      if ((a.life?.deaths ?? 0) > 0) firstDeath[a.id] ??= world.tick;
  }
  if (
    Object.keys(firstDepletion).length !== genesis.actors.length ||
    Object.keys(firstDeath).length === 0
  )
    throw new Error(
      'Single-source subsistence is too easy across the frozen difficult period.',
    );
  return {
    version: 1,
    modelCalls: 0,
    rounds: 1600,
    selected,
    firstDepletion,
    firstDeath,
    final: world.actors.map((a) => ({
      id: a.id,
      vitals: a.vitals,
      life: a.life,
    })),
    limitation:
      'Isolated single-source controller; this is not autonomous evidence or proof that every stationary strategy fails. No fixture policy enters the formal context.',
  };
}
