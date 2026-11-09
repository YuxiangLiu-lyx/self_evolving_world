import { stepWorldRound } from '@self-evolving-world/world-core';
import type {
  Direction,
  Observation,
  WorldAction,
  WorldState,
} from '@self-evolving-world/world-core';
import { experimentWorld } from './experiment.js';
import { validateParameters } from './random-run.js';

export const SYNCHRONOUS_POLICY = 'xorshift32-collection-v2';
export const ROUND_SCHEDULE = 'simultaneous-v1';
export const DEFAULT_ROUNDS = 160;
export const SYNCHRONOUS_OBJECTIVE =
  'Check synchronous world rounds with reproducible random exploration, successful same-cell collection, no learning attempts and no external agent or model.';

const directions: readonly { direction: Direction; x: number; y: number }[] = [
  { direction: 'north', x: 0, y: -1 },
  { direction: 'east', x: 1, y: 0 },
  { direction: 'south', x: 0, y: 1 },
  { direction: 'west', x: -1, y: 0 },
];
function choose<T>(values: readonly T[], random: () => number): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new Error('Cannot choose from an empty list.');
  return value;
}

export function collectionAction(
  observation: Observation,
  random: () => number,
): WorldAction {
  const { self, items } = observation;
  const local = items.filter(
    (item) =>
      item.position.x === self.position.x &&
      item.position.y === self.position.y,
  );
  if (local.length > 0)
    return {
      type: 'pickup',
      agentId: self.id,
      itemId: choose(local, random).id,
    };
  // Exploration remains random. Attraction uses only currently visible items.
  let choices = directions;
  if (items.length > 0 && random() < 0.65) {
    const distances = items.map(
      (item) =>
        Math.abs(item.position.x - self.position.x) +
        Math.abs(item.position.y - self.position.y),
    );
    const nearest = Math.min(...distances);
    const target = choose(
      items.filter((_, index) => distances[index] === nearest),
      random,
    );
    choices = directions.filter(
      ({ x, y }) =>
        Math.abs(target.position.x - self.position.x - x) +
          Math.abs(target.position.y - self.position.y - y) <
        nearest,
    );
  }
  return {
    type: 'move',
    agentId: self.id,
    direction: choose(choices, random).direction,
  };
}

export function runSynchronousWorld(seed: number, rounds: number) {
  validateParameters(seed, rounds);
  let value = seed >>> 0;
  const random = (): number => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 0x100000000;
  };
  const initial = experimentWorld();
  let state = initial;
  const frames: WorldState[] = [initial];
  const batches: WorldAction[][] = [];
  for (let round = 0; round < rounds; round++) {
    const actions = state.observations.map((observation) =>
      collectionAction(observation, random),
    );
    state = stepWorldRound(state, actions);
    frames.push(state);
    batches.push(actions);
  }
  return {
    frames,
    replay: {
      format: 'self-evolving-world/replay' as const,
      version: 2 as const,
      coreVersion: '1' as const,
      schedule: ROUND_SCHEDULE,
      initial: {
        settings: initial.settings,
        agents: initial.agents.map(({ id, name, position }) => ({
          id,
          name,
          position,
        })),
        items: initial.items,
      },
      rounds: batches,
    },
  };
}
export type SynchronousRun = ReturnType<typeof runSynchronousWorld>;
