import { expect, it } from 'vitest';
import { v7Clone } from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import { longOrdinaryInput, OPEN_LIFE_GOAL } from '../src/long-context.js';
import {
  CULTURE_EXCLUDED_WORDS,
  CULTURE_OPTIONS,
  CULTURE_TENDENCIES,
  LONG_CULTURE_V2,
} from '../src/long-culture.js';
import {
  longRequest,
  OPEN_GOAL_ORDINARY,
  VOICE_ORDINARY,
} from '../src/long-request.js';
import {
  initialLongWorld,
  LONG_CULTURE_V2_INCENTIVES_OBJECTIVE,
  LONG_CULTURE_V2_OBJECTIVE,
  longObjective,
  longScenario,
} from '../src/long-scenario.js';
import { newContinuousExecution } from '../src/continuous-run.js';

const policy = (world: V7World) => {
  const p = world.config.longDevelopment;
  if (!p) throw new Error('Missing long policy');
  return p;
};
const V2_FIELDS = [
  'compaction',
  'rejectionRecovery',
  'emptyHandoffs',
  'abilityTextLimit',
] as const;

it('freezes both culture v2 scenarios as the culture genesis plus the v2 context, prompt and handoff fields', () => {
  for (const [scenario, objective, incentives] of [
    ['long-culture-v2', LONG_CULTURE_V2_OBJECTIVE, false],
    ['long-culture-v2-incentives', LONG_CULTURE_V2_INCENTIVES_OBJECTIVE, true],
  ] as const) {
    const world = initialLongWorld('long-ex16', scenario);
    const p = policy(world);
    expect(p).toMatchObject({
      scenario: incentives ? 'culture-v2-incentives' : 'culture-v2',
      inputEstimateLimit: 24_000,
      exactRecordWidth: 6_000,
      compaction: { version: 1, recentAbilityRounds: 25 },
      rejectionRecovery: { mode: 'uncounted', stopAfter: 3 },
      emptyHandoffs: 'uncounted',
      abilityTextLimit: 3_500,
      transportRecovery: 'uncounted',
      tokens: incentives ? 4_000_000 : 10_000_000,
      tokenCeilings: [{ through: 80, tokens: 3_200_000 }],
      checkpoints: incentives ? [80, 120] : [80, 150, 250],
      culture: { ...CULTURE_OPTIONS, incentives, goal: 'open' },
    });
    expect(world.config.computation.inputBytes).toBe(
      LONG_CULTURE_V2.inputBytes,
    );
    expect(world.config.budgets).toEqual({
      ordinary: 1800,
      world: 300,
      development: incentives ? 16 : 40,
    });
    expect(longScenario(p)).toBe(scenario);
    expect(longObjective(p)).toBe(objective);
    expect(
      newContinuousExecution('fixture', 'isolated-fixture', world).windowTarget,
    ).toBe(incentives ? 120 : 80);
    // Apart from the v2 fields, the world is exactly the matching culture genesis.
    const v1 = initialLongWorld(
      'long-ex16',
      incentives ? 'long-culture-incentives' : 'long-culture',
    );
    const strip = (w: V7World) => {
      const c = v7Clone(w);
      const q = policy(c);
      for (const field of V2_FIELDS) delete q[field];
      delete q.scenario;
      delete q.culture?.goal;
      q.inputEstimateLimit = 0;
      q.exactRecordWidth = 0;
      c.config.computation.inputBytes = 0;
      return c;
    };
    expect(strip(world)).toEqual(strip(v1));
  }
  // The culture genesis that ex15 verifies against carries none of the v2 fields.
  const ex15 = policy(initialLongWorld('long-ex15', 'long-culture'));
  for (const field of V2_FIELDS) expect(ex15[field]).toBeUndefined();
  expect(ex15.culture?.goal).toBeUndefined();
  expect(ex15.inputEstimateLimit).toBe(14_000);
  expect(ex15.exactRecordWidth).toBe(4_000);
});

it('gives every person the open goal and their own leaning in the second person, without new symbolic guidance', () => {
  const world = initialLongWorld('long-ex16', 'long-culture-v2');
  const goal =
    'Keep yourself healthy and safe; that is required. Beyond that, how you live, what you do and what you care about is up to you.';
  expect(OPEN_LIFE_GOAL).toBe(goal);
  expect(OPEN_GOAL_ORDINARY.startsWith(goal)).toBe(true);
  expect(OPEN_GOAL_ORDINARY).not.toContain('develop reusable abilities');
  expect(OPEN_GOAL_ORDINARY).not.toContain('improve personal and shared');
  world.actors.forEach((actor, i) => {
    const input = longOrdinaryInput(world, actor.id);
    const request = longRequest('model', input);
    const leaning = CULTURE_TENDENCIES[i]?.leaning ?? '';
    expect(input.longContext).toMatchObject({
      voice: true,
      goal: 'open',
      leaning,
      compaction: true,
    });
    expect(input.packet.goal).toBe(goal);
    expect(
      request.instructions.startsWith(
        `${goal} You tend to value ${leaning}. Names, stories, views`,
      ),
    ).toBe(true);
    expect(request.instructions.match(/You tend to value/g)).toHaveLength(1);
    expect(request.instructions).toContain(
      'summaries for the others; read a summarized interface by exact id before using it.',
    );
    expect(`${request.instructions}${JSON.stringify(input)}`).not.toMatch(
      CULTURE_EXCLUDED_WORDS,
    );
    // Apart from the goal, the leaning and the summary sentence, the prompt is the ex15 voice prompt.
    const v1 = longRequest('model', {
      ...input,
      longContext: {
        ...input.longContext,
        goal: undefined,
        leaning: undefined,
        compaction: undefined,
      },
    }).instructions;
    expect(v1.startsWith(VOICE_ORDINARY)).toBe(true);
    expect(request.instructions).toBe(
      v1
        .replace(
          'Maintain health and tolerable risk, understand unknowns through evidence, develop reusable abilities and improve personal and shared living. Choose your own questions, projects and activities; none is required.',
          `${goal} You tend to value ${leaning}.`,
        )
        .replace(
          'Use the exact schemas supplied once under abilities.',
          'Use the exact schemas supplied once under abilities: full contracts for interfaces you used recently or need now, summaries for the others; read a summarized interface by exact id before using it.',
        ),
    );
  });
  // The v2 prompt adds no guidance about the symbolic interfaces beyond the ex15 prompt.
  for (const word of ['name', 'mark', 'invite', 'tell'])
    expect(
      OPEN_GOAL_ORDINARY.toLowerCase().split(word).length,
    ).toBeLessThanOrEqual(VOICE_ORDINARY.toLowerCase().split(word).length);
  // The ex15 scenario keeps its exact prompt and goal.
  const old = initialLongWorld('long-ex15', 'long-culture');
  const input = longOrdinaryInput(old, 'lin');
  expect(input.longContext.goal).toBeUndefined();
  expect(input.longContext.leaning).toBeUndefined();
  expect(input.longContext.compaction).toBeUndefined();
  expect(
    longRequest('model', input).instructions.startsWith(VOICE_ORDINARY),
  ).toBe(true);
});
