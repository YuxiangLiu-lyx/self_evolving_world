import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { v7Clone } from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import { longOrdinaryInput, longWorldInput } from '../src/long-context.js';
import {
  GENERAL_CAPABILITY_GUIDANCE,
  longRequest,
  PLAN_HORIZON_GUIDANCE,
} from '../src/long-request.js';
import {
  initialLongWorld,
  LONG_FIXES,
  LONG_FIXES_OBJECTIVE,
  LONG_OBJECTIVE,
  longObjective,
  longScenario,
} from '../src/long-scenario.js';

const archived = (file: string) =>
  JSON.parse(readFileSync(`experiment/ex13/${file}`, 'utf8')) as V7World;

it('keeps the baseline long genesis identical to the ex13 archive', () => {
  const world = initialLongWorld('long-ex13');
  expect(world).toEqual(archived('initial.json'));
  expect(world.config).toEqual(archived('configuration.json'));
  const policy = world.config.longDevelopment;
  if (!policy) throw new Error('Missing long policy');
  expect(longScenario(policy)).toBe('long');
  expect(longObjective(policy)).toBe(LONG_OBJECTIVE);
});

it('changes only the fixes and their limits in the long-fixes scenario', () => {
  const baseline = initialLongWorld('long-ex14');
  const fixes = initialLongWorld('long-ex14', 'long-fixes');
  const policy = fixes.config.longDevelopment;
  if (!policy) throw new Error('Missing long policy');
  expect(policy).toMatchObject({
    scenario: 'fixes',
    exactRecordWidth: 4000,
    guidance: ['plan-horizon', 'general-capabilities'],
    tokens: 1_600_000,
    checkpoints: [40, 80],
  });
  expect(fixes.config.budgets).toEqual({
    ...baseline.config.budgets,
    development: LONG_FIXES.developments,
  });
  expect(fixes.config.experience?.targetRounds).toBe(LONG_FIXES.gate);
  expect(longScenario(policy)).toBe('long-fixes');
  expect(longObjective(policy)).toBe(LONG_FIXES_OBJECTIVE);
  // Reverting exactly those fields recovers the baseline genesis: same rules, seed and world.
  const reverted = v7Clone(fixes);
  const revertedPolicy = reverted.config.longDevelopment;
  const baselinePolicy = baseline.config.longDevelopment;
  if (!revertedPolicy || !baselinePolicy || !reverted.config.experience)
    throw new Error('Missing policy');
  delete revertedPolicy.scenario;
  delete revertedPolicy.exactRecordWidth;
  delete revertedPolicy.guidance;
  revertedPolicy.tokens = baselinePolicy.tokens;
  revertedPolicy.checkpoints = baselinePolicy.checkpoints;
  reverted.config.budgets.development = baseline.config.budgets.development;
  reverted.config.experience.targetRounds =
    baseline.config.experience?.targetRounds ?? 0;
  expect(reverted).toEqual(baseline);
});

it('sends each fix addendum only to its role in the long-fixes scenario', () => {
  const world = initialLongWorld('long-ex14', 'long-fixes');
  const ordinary = longRequest('fixture', longOrdinaryInput(world, 'lin'));
  expect(ordinary.instructions.endsWith(PLAN_HORIZON_GUIDANCE)).toBe(true);
  expect(ordinary.instructions).not.toContain(GENERAL_CAPABILITY_GUIDANCE);
  const reviewer = longRequest('fixture', longWorldInput(world, {}));
  expect(reviewer.instructions.endsWith(GENERAL_CAPABILITY_GUIDANCE)).toBe(
    true,
  );
  const access = String(longOrdinaryInput(world, 'lin').packet.access);
  expect(access).toContain('complete record of up to 4000 code units');
});
