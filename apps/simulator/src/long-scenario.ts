import {
  v7Clone,
  v7Freeze,
  v7AssertWorld,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import { initialOpenWorld } from './open-scenario.js';

export const LONG_OBJECTIVE =
  'Observe evidence-based open development, persistent projects, capability dependencies and actual benefits under frozen recurring pressures; no particular invention or activity is required.';

/** Opt-in policy; historical genesis and generated registries remain unchanged. */
export function initialLongWorld(scope = 'long-preflight') {
  const world = v7Clone(initialOpenWorld(scope));
  world.config.seed = 20261123;
  world.config.budgets = { ordinary: 1800, world: 100, development: 40 };
  world.config.longDevelopment = {
    version: 1,
    tokens: 10_000_000,
    inputEstimateLimit: 14_000,
    outputTokens: 3500,
    queriesPerDecision: 2,
    checkpoints: [200, 400, 800, 1200, 1600],
    cycle: 800,
    pressureStart: 220,
    difficultyStart: 380,
    recoveryStart: 600,
    recoveryEnd: 740,
    cold: 1.5,
    rain: 0.8,
    growthFloor: 0.3,
  };
  if (!world.config.experience || !world.config.development)
    throw new Error('Missing fresh foundation.');
  world.config.experience.mentalRate = 0.04;
  world.config.experience.mentalDecay = 0.002;
  world.config.development.climateOffset = 5;
  world.state.environment = 'long-development-v1';
  world.actors.forEach((a, index) => {
    a.extensionState['long:tendencies'] = {
      curiosity: [0.55, 0.48, 0.52][index] ?? 0.5,
      riskTolerance: [0.48, 0.54, 0.5][index] ?? 0.5,
      socialNeed: [0.51, 0.47, 0.56][index] ?? 0.5,
      comfortPreference: [0.48, 0.55, 0.51][index] ?? 0.5,
    };
  });
  v7AssertWorld(world, continuousRegistry(world));
  return v7Freeze(world);
}
