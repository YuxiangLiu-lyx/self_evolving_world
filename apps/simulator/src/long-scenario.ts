import {
  v7Clone,
  v7Freeze,
  v7AssertWorld,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import { initialOpenWorld } from './open-scenario.js';
import {
  applyCulture,
  CULTURE_OPTIONS,
  CULTURE_V2_OPTIONS,
  CULTURE_V3_OPTIONS,
  LONG_CULTURE,
  LONG_CULTURE_INCENTIVES,
  LONG_CULTURE_V2,
} from './long-culture.js';

export const LONG_OBJECTIVE =
  'Observe evidence-based open development, persistent projects, capability dependencies and actual benefits under frozen recurring pressures; no particular invention or activity is required.';
export const LONG_FIXES_OBJECTIVE =
  'Under the ex13 rules and seed, check whether whole exact reads, plan-horizon guidance and general-capability guidance lower per-agent token use and broaden developed capabilities; no particular invention or activity is required.';

export const LONG_CULTURE_OBJECTIVE =
  'Under the ex13 rules and seed with six people, reduced survival pressure, names, marks, spoken words, meeting invitations and private views, observe what people make and keep; no particular outcome, activity or invention is required.';
export const LONG_CULTURE_INCENTIVES_OBJECTIVE =
  'As the culture run, with bounded, decaying satisfaction from being answered or remembered, two-way contact and noticed own work; no particular outcome, activity or invention is required.';
export const LONG_CULTURE_V2_OBJECTIVE =
  'As the culture run, with an open goal beyond health and safety, a stated value leaning, lossless context compaction and uncounted recovery handoffs; no particular outcome, activity or invention is required.';
export const LONG_CULTURE_V3_OBJECTIVE =
  'As the culture v2 run, with the open goal also leaving open with whom to live and a stated fact that rest restores only missing energy; no particular outcome, activity or invention is required.';
export const LONG_CULTURE_V3_INCENTIVES_OBJECTIVE =
  'As the culture v3 run, with bounded, decaying satisfaction from being answered or remembered, two-way contact and noticed own work; no particular outcome, activity or invention is required.';
export const LONG_CULTURE_V2_INCENTIVES_OBJECTIVE =
  'As the culture v2 run, with bounded, decaying satisfaction from being answered or remembered, two-way contact and noticed own work; no particular outcome, activity or invention is required.';
/** Scenario tag of a culture v2 world imported from a retained archive with newcomers
 * (`new long-culture-v2 --import exN --newcomers file`); see docs/CULTURE_SCENARIO.md. */
export const LONG_IMPORT_SCENARIO = 'culture-v2-import';
export const LONG_IMPORT_OBJECTIVE =
  'Under the culture v2 prompt and rules without incentives, continue a retained world with its residents and their memories, and observe what newcomers without memory learn from what the world shows them; no particular outcome, activity or invention is required.';

/** Named long scenarios. `long` is the frozen ex13 baseline. */
export type LongScenario =
  | 'long'
  | 'long-fixes'
  | 'long-culture'
  | 'long-culture-incentives'
  | 'long-culture-v2'
  | 'long-culture-v2-incentives'
  | 'long-culture-v3'
  | 'long-culture-v3-incentives';
export const LONG_SCENARIOS: readonly LongScenario[] = [
  'long',
  'long-fixes',
  'long-culture',
  'long-culture-incentives',
  'long-culture-v2',
  'long-culture-v2-incentives',
  'long-culture-v3',
  'long-culture-v3-incentives',
];
const CULTURE_SCENARIOS = {
  'long-culture': 'culture',
  'long-culture-incentives': 'culture-incentives',
  'long-culture-v2': 'culture-v2',
  'long-culture-v2-incentives': 'culture-v2-incentives',
  'long-culture-v3': 'culture-v3',
  'long-culture-v3-incentives': 'culture-v3-incentives',
} as const;

/** The fix-verification run: ex13 rules and seed with the three opt-in fixes and smaller limits.
 * The first window stops at round 40 for the comparison gate; it is then extended to `rounds`. */
export const LONG_FIXES = {
  exactRecordWidth: 4000,
  guidance: ['plan-horizon', 'general-capabilities'] as const,
  developments: 8,
  tokens: 1_600_000,
  gate: 40,
  rounds: 80,
};

export function longScenario(
  policy: NonNullable<V7World['config']['longDevelopment']>,
): LongScenario {
  if (policy.scenario === 'fixes') return 'long-fixes';
  // An imported world runs the culture v2 prompt and rules; its configuration is
  // verified against longImportConfig, not against a genesis.
  if (policy.scenario === LONG_IMPORT_SCENARIO) return 'long-culture-v2';
  const culture = Object.entries(CULTURE_SCENARIOS).find(
    ([, value]) => value === policy.scenario,
  );
  return culture ? (culture[0] as LongScenario) : 'long';
}

export function longObjective(
  policy: NonNullable<V7World['config']['longDevelopment']>,
): string {
  if (policy.scenario === LONG_IMPORT_SCENARIO) return LONG_IMPORT_OBJECTIVE;
  const scenario = longScenario(policy);
  return scenario === 'long-fixes'
    ? LONG_FIXES_OBJECTIVE
    : scenario === 'long-culture'
      ? LONG_CULTURE_OBJECTIVE
      : scenario === 'long-culture-incentives'
        ? LONG_CULTURE_INCENTIVES_OBJECTIVE
        : scenario === 'long-culture-v2'
          ? LONG_CULTURE_V2_OBJECTIVE
          : scenario === 'long-culture-v2-incentives'
            ? LONG_CULTURE_V2_INCENTIVES_OBJECTIVE
            : scenario === 'long-culture-v3'
              ? LONG_CULTURE_V3_OBJECTIVE
              : scenario === 'long-culture-v3-incentives'
                ? LONG_CULTURE_V3_INCENTIVES_OBJECTIVE
                : LONG_OBJECTIVE;
}

/** Opt-in policy; historical genesis and generated registries remain unchanged. */
export function initialLongWorld(
  scope = 'long-preflight',
  scenario: LongScenario = 'long',
) {
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
  if (scenario === 'long-fixes') {
    const policy = world.config.longDevelopment;
    policy.scenario = 'fixes';
    policy.exactRecordWidth = LONG_FIXES.exactRecordWidth;
    policy.guidance = [...LONG_FIXES.guidance];
    policy.tokens = LONG_FIXES.tokens;
    policy.checkpoints = [LONG_FIXES.gate, LONG_FIXES.rounds];
    world.config.budgets.development = LONG_FIXES.developments;
    world.config.experience.targetRounds = LONG_FIXES.gate;
  }
  if (scenario in CULTURE_SCENARIOS) {
    const policy = world.config.longDevelopment;
    const name = CULTURE_SCENARIOS[scenario as keyof typeof CULTURE_SCENARIOS];
    const incentives = name.endsWith('incentives'),
      v3 = name.startsWith('culture-v3'),
      // Culture v3 keeps every culture v2 field; only the prompt wording differs.
      v2 = v3 || name.startsWith('culture-v2');
    policy.scenario = name;
    policy.exactRecordWidth = LONG_CULTURE.exactRecordWidth;
    policy.guidance = [...LONG_CULTURE.guidance];
    policy.tokens = LONG_CULTURE.tokens;
    policy.tokenCeilings = LONG_CULTURE.tokenCeilings.map((c) => ({ ...c }));
    policy.checkpoints = [...LONG_CULTURE.checkpoints];
    policy.transportRecovery = 'uncounted';
    world.config.budgets.development = LONG_CULTURE.developments;
    world.config.budgets.world = LONG_CULTURE.worldCalls;
    world.config.experience.targetRounds = LONG_CULTURE.gate;
    if (v2) {
      policy.inputEstimateLimit = LONG_CULTURE_V2.inputEstimateLimit;
      policy.exactRecordWidth = LONG_CULTURE_V2.exactRecordWidth;
      policy.compaction = {
        version: 1,
        recentAbilityRounds: LONG_CULTURE_V2.recentAbilityRounds,
      };
      policy.rejectionRecovery = {
        mode: 'uncounted',
        stopAfter: LONG_CULTURE_V2.rejectionStop,
      };
      policy.emptyHandoffs = 'uncounted';
      policy.abilityTextLimit = LONG_CULTURE_V2.abilityTextLimit;
      world.config.computation.inputBytes = LONG_CULTURE_V2.inputBytes;
    }
    if (incentives) {
      policy.tokens = LONG_CULTURE_INCENTIVES.tokens;
      policy.checkpoints = [...LONG_CULTURE_INCENTIVES.checkpoints];
      world.config.budgets.development = LONG_CULTURE_INCENTIVES.developments;
      world.config.experience.targetRounds = LONG_CULTURE_INCENTIVES.rounds;
    }
    const cultured = applyCulture(world, {
      ...(v3 ? CULTURE_V3_OPTIONS : v2 ? CULTURE_V2_OPTIONS : CULTURE_OPTIONS),
      incentives,
    });
    v7AssertWorld(cultured, continuousRegistry(cultured));
    return v7Freeze(cultured);
  }
  v7AssertWorld(world, continuousRegistry(world));
  return v7Freeze(world);
}
