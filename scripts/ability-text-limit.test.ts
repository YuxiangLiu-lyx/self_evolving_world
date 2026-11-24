import { expect, it } from 'vitest';
import type { V7Ability } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../apps/simulator/src/long-scenario.js';
import { abilityTextIssue } from './continuous-source.js';

/** A copy of an authored interface padded to exactly `length` serialized code units. */
function sized(base: V7Ability, length: number): V7Ability {
  const ability = { ...base, id: 'fixture-interface', function: '' };
  const padding = length - JSON.stringify(ability).length;
  if (padding < 0) throw new Error('Fixture base is too long.');
  return { ...ability, function: 'x'.repeat(padding) };
}

it('rejects a developed interface above the v2 text limit and accepts one at the limit', () => {
  const world = initialLongWorld('long-ex16', 'long-culture-v2');
  const limit = world.config.longDevelopment?.abilityTextLimit;
  expect(limit).toBe(3500);
  const base = world.abilities.find((a) => a.id === 'wait');
  if (!base || !limit) throw new Error('Missing fixture interface.');
  const exact = sized(base, limit);
  expect(JSON.stringify(exact).length).toBe(limit);
  expect(abilityTextIssue(world, [base, exact])).toBeNull();
  const over = sized(base, limit + 1);
  expect(abilityTextIssue(world, [base, over])).toBe(
    'Developed interface fixture-interface serializes to 3501 code units, above the frozen abilityTextLimit of 3500; shorten its function, effects, costs or parameter text.',
  );
  // Every authored interface fits.
  expect(abilityTextIssue(world, world.abilities)).toBeNull();
  // The limit is absent and inactive in the archived scenarios.
  for (const scenario of ['long-culture', 'long-fixes', 'long'] as const) {
    const old = initialLongWorld('long-ex15', scenario);
    expect(old.config.longDevelopment?.abilityTextLimit).toBeUndefined();
    expect(abilityTextIssue(old, [sized(base, 20_000)])).toBeNull();
  }
});
