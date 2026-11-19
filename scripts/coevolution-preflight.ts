import {
  cWalkable,
  coevolutionData,
  stepCoevolutionRound,
  EMPTY_COEVOLUTION_PROPOSAL,
  COEVOLUTION_CONFIG,
} from '@self-evolving-world/world-core';
import type {
  Cell,
  CoevolutionAction,
  WorldState,
  Direction,
} from '@self-evolving-world/world-core';
import { initialCoevolutionWorld } from '../apps/simulator/src/coevolution-scenario.js';
const directions: readonly (readonly [Direction, number, number])[] = [
  ['north', 0, -1],
  ['east', 1, 0],
  ['south', 0, 1],
  ['west', -1, 0],
];
export function legalRoute(
  world: WorldState,
  from: Cell,
  to: Cell,
  avoidActors = false,
): readonly Direction[] | null {
  const data = coevolutionData(world),
    queue: { p: Cell; path: Direction[] }[] = [{ p: from, path: [] }],
    seen = new Set([`${String(from.x)},${String(from.y)}`]);
  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    if (!entry) break;
    if (entry.p.x === to.x && entry.p.y === to.y) return entry.path;
    for (const [direction, dx, dy] of directions) {
      const p = { x: entry.p.x + dx, y: entry.p.y + dy },
        key = `${String(p.x)},${String(p.y)}`;
      if (
        seen.has(key) ||
        !cWalkable(data, p) ||
        (avoidActors &&
          world.agents.some(
            (a) => a.position.x === p.x && a.position.y === p.y,
          ))
      )
        continue;
      seen.add(key);
      queue.push({ p, path: [...entry.path, direction] });
    }
  }
  return null;
}
/** An explicit omniscient feasibility control. Never sent to a real actor or counted as discovery. */
export function coevolutionPreflight() {
  let world = initialCoevolutionWorld();
  const initial = world,
    data = coevolutionData(world),
    starts = world.agents.map((a) => {
      const distances = data.stacks
        .filter(
          (s) =>
            s.position &&
            data.types.some(
              (t) => t.id === s.type && t.nutrition > 0 && t.toxicity === 0,
            ),
        )
        .map(
          (s) =>
            legalRoute(world, a.position, s.position ?? a.position)?.length ??
            Infinity,
        );
      return {
        actor: a.id,
        firstFoodDistance: Math.min(...distances),
        firstMealRounds: Math.min(...distances) + 2,
        commonAreaDistance:
          legalRoute(world, a.position, { x: 10, y: 9 })?.length ?? null,
        otherStartDistances: world.agents
          .filter((b) => b.id !== a.id)
          .map((b) => ({
            actor: b.id,
            distance: legalRoute(world, a.position, b.position)?.length ?? null,
          })),
      };
    });
  const actions: Record<string, Record<string, number>> = Object.fromEntries(
      world.agents.map((a) => [a.id, {}]),
    ),
    minSatiety: Record<string, number> = Object.fromEntries(
      world.agents.map((a) => [a.id, 80]),
    );
  for (let tick = 0; tick < COEVOLUTION_CONFIG.rounds; tick++) {
    const d = coevolutionData(world),
      batch: CoevolutionAction[] = world.agents.map((a) => {
        const food = d.stacks.find(
          (s) =>
            s.owner === a.id &&
            s.quantity > 0 &&
            d.types.some(
              (t) => t.id === s.type && t.nutrition > 0 && t.toxicity === 0,
            ),
        );
        if ((d.energy[a.id] ?? 0) < 8) return { type: 'rest', agentId: a.id };
        if (food && (d.vitals[a.id]?.satiety ?? 0) <= 76)
          return {
            type: 'use',
            agentId: a.id,
            skillId: 'ability-1',
            args: { item: food.id },
          };
        if (!food) {
          const targets = d.stacks
            .filter(
              (s) =>
                s.position &&
                s.quantity > 0 &&
                d.types.some(
                  (t) => t.id === s.type && t.nutrition > 0 && t.toxicity === 0,
                ),
            )
            .map((s) => ({
              s,
              path: legalRoute(
                world,
                a.position,
                s.position ?? a.position,
                true,
              ),
            }))
            .filter((t) => t.path !== null)
            .sort(
              (a, b) =>
                (a.path?.length ?? Infinity) - (b.path?.length ?? Infinity) ||
                a.s.id.localeCompare(b.s.id),
            );
          const t = targets[0];
          if (t?.path?.length === 0)
            return { type: 'pickup', agentId: a.id, itemId: t.s.id };
          if (t?.path?.[0])
            return { type: 'move', agentId: a.id, direction: t.path[0] };
        }
        return { type: 'rest', agentId: a.id };
      });
    world = stepCoevolutionRound(world, {
      actions: batch,
      proposal: EMPTY_COEVOLUTION_PROPOSAL,
    });
    for (const e of coevolutionData(world).events) {
      const counts = actions[e.action.agentId];
      if (counts) counts[e.action.type] = (counts[e.action.type] ?? 0) + 1;
      minSatiety[e.action.agentId] = Math.min(
        minSatiety[e.action.agentId] ?? 80,
        coevolutionData(world).vitals[e.action.agentId]?.satiety ?? 0,
      );
    }
  }
  const final = coevolutionData(world),
    nutrition = data.stacks.reduce(
      (n, s) =>
        n +
        s.quantity * (data.types.find((t) => t.id === s.type)?.nutrition ?? 0),
      0,
    );
  if (
    starts.some(
      (s) => s.firstFoodDistance > 5 || s.commonAreaDistance === null,
    ) ||
    Object.values(final.vitals).some((v) => v.health !== 100)
  )
    throw new Error('Coevolution offline survival feasibility failed.');
  return {
    version: 1,
    controller: 'simulated-test',
    purpose:
      'Offline omniscient feasibility only; never ordinary context or autonomous evidence.',
    configuration: COEVOLUTION_CONFIG,
    foodUnits: data.stacks
      .filter((s) => data.types.some((t) => t.id === s.type && t.nutrition > 0))
      .reduce((n, s) => n + s.quantity, 0),
    nutrition,
    initialSatiety: initial.agents.length * 80,
    metabolicDemand: initial.agents.length * 180 * 2,
    starts,
    rounds: world.tick,
    finalVitals: final.vitals,
    minSatiety,
    actionDistribution: actions,
    remainingFoodNutrition: final.stacks.reduce(
      (n, s) =>
        n +
        s.quantity * (final.types.find((t) => t.id === s.type)?.nutrition ?? 0),
      0,
    ),
  };
}
