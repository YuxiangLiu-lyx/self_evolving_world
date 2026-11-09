import { stepWorld } from '@self-evolving-world/world-core';
import type {
  Direction,
  WorldAction,
  WorldState,
} from '@self-evolving-world/world-core';
import { experimentWorld } from './experiment.js';
import type { ExperimentResult } from './experiment.js';

export const RANDOM_POLICY = 'xorshift32-observation-v1';
export const DEFAULT_SEED = 20261107;
export const DEFAULT_STEPS = 480;

export function validateParameters(seed: number, steps: number): void {
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffffffff)
    throw new RangeError('Seed must be an integer from 1 to 4294967295.');
  if (!Number.isSafeInteger(steps) || steps < 3 || steps > 500)
    throw new RangeError('Steps must be an integer from 3 to 500.');
}

/** Explicit, reproducible randomness at the application boundary, never in the core. */
function randomSource(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 0x100000000;
  };
}

function choose<T>(values: readonly T[], random: () => number): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new Error('Cannot choose from an empty list.');
  return value;
}

export interface RandomRun {
  readonly frames: readonly WorldState[];
  readonly replay: ExperimentResult['replay'];
}

export function runRandomWorld(seed: number, steps: number): RandomRun {
  validateParameters(seed, steps);
  const random = randomSource(seed);
  const initial = experimentWorld();
  const frames: WorldState[] = [initial];
  const actions: WorldAction[] = [];
  let state = initial;
  const directions: readonly Direction[] = ['north', 'east', 'south', 'west'];
  for (let turn = 0; turn < steps; turn++) {
    const observation = state.observations[turn % initial.agents.length];
    if (observation === undefined) throw new Error('Missing scheduled agent.');
    const { self, items } = observation;
    const category = random();
    let action: WorldAction;
    if (category < 0.8) {
      action = {
        type: 'move',
        agentId: self.id,
        direction: choose(directions, random),
      };
    } else if (category < 0.9) {
      const local = items.filter(
        (item) =>
          item.position.x === self.position.x &&
          item.position.y === self.position.y,
      );
      const targets = local.length ? local : items;
      action = {
        type: 'pickup',
        agentId: self.id,
        itemId: targets.length ? choose(targets, random).id : 'unseen-item',
      };
    } else {
      action = {
        type: 'try',
        agentId: self.id,
        skill: choose(['fly', 'plant', 'trade'], random),
      };
    }
    state = stepWorld(state, action);
    actions.push(action);
    frames.push(state);
  }
  return {
    frames,
    replay: {
      format: 'self-evolving-world/replay',
      version: 1,
      coreVersion: '1',
      initial: {
        settings: initial.settings,
        agents: initial.agents.map(({ id, name, position }) => ({
          id,
          name,
          position,
        })),
        items: initial.items,
      },
      actions,
    },
  };
}
