import type { V7Configuration } from './continuous-types.js';

/** Protected run policy. Runtime extension packages cannot replace this configuration. */
export const V7_CONFIG: V7Configuration = Object.freeze({
  protocol: 'continuous-v1',
  seed: 20261120,
  width: 24,
  height: 24,
  dt: 1,
  speed: 0.8,
  vision: 5,
  interaction: 0.65,
  hunger: 2,
  starvation: 10,
  energyCap: 40,
  restRecovery: 4,
  physicalCap: 10,
  mentalCap: 90,
  budgets: Object.freeze({ ordinary: 400, world: 60, development: 20 }),
  computation: Object.freeze({
    workPerRound: 2_000_000,
    inputBytes: 120_000,
    stateBytes: 32_000_000,
  }),
});

export const V7_GOAL =
  'Maintain your health and survival, and improve your wellbeing. Choose your next actions from the environment, experiences and action results you actually observe.';
export const V7_WINDOW = 1000;
export const V7_STAGE_INTERVAL = 200;
