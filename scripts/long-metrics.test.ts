import { expect, it } from 'vitest';
import { boundInterface, longMetrics } from './long-metrics.js';
import {
  compatibilityDifferences,
  compatibilityDigest,
} from './long-compatibility.js';

it('reproduces the ex13 baselines used by the fix log', () => {
  const full = longMetrics('experiment/ex13');
  expect(full).toMatchObject({
    rounds: 280,
    agents: 3,
    calls: { ordinary: 433, world: 91, unknownUsage: 6 },
    tokens: { input: 4_200_130, output: 213_517 },
    followUps: { calls: 219 },
    continuationQueries: 163,
    continuationFollowUps: { only: 22, any: 88 },
    exhaustedDecisions: { total: 87, withUnfinishedRecord: 52 },
    decisions: { plans: 211, medianGap: 3, withInterrupts: 0 },
    reviews: { develop: 28, reuse: 1, reject: 0 },
    interfaces: {
      developed: 28,
      boundToOneActorOrItem: 19,
      masteredByAtMostOne: 23,
    },
  });
  expect(Math.round(full.tokens.perAgentRound)).toBe(5254);
  const early = longMetrics('experiment/ex13', 80);
  expect(early).toMatchObject({
    rounds: 80,
    calls: { ordinary: 178, world: 36, unknownUsage: 3 },
    followUps: { calls: 92 },
    decisions: { plans: 84, medianGap: 2 },
    reviews: { develop: 11, reuse: 0 },
    interfaces: { developed: 12, boundToOneActorOrItem: 5 },
  });
  expect(Math.round(early.tokens.perAgentRound)).toBe(6632);
});

it('treats named sources, people and instances as bound and material names as general', () => {
  const general = {
    id: 'moss-resting-pad-trial',
    function: 'Place owned moss, inspect the resulting arrangement.',
    equivalence: 'loose-moss:placement-contact-trial:1',
  };
  expect(boundInterface(general, ['lin', 'moss', 'sol'])).toBe(false);
  expect(
    boundInterface(
      {
        ...general,
        equivalence: 'surface-residue:transfer:1:surface-34-sol-201',
      },
      ['lin', 'moss', 'sol'],
    ),
  ).toBe(true);
  expect(
    boundInterface(
      { ...general, function: 'Compare Lin retained trial records.' },
      ['lin', 'moss', 'sol'],
    ),
  ).toBe(true);
});

it('fingerprints every retained ex13 request and paused ordinary input', () => {
  const digest = compatibilityDigest('experiment/ex13');
  expect(Object.keys(digest.requests)).toHaveLength(524);
  expect(Object.keys(digest.pauseInputs)).toHaveLength(27);
  expect(compatibilityDifferences(digest, digest)).toEqual([]);
  const changed = {
    ...digest,
    requests: { ...digest.requests, 'ordinary-1': 'changed' },
  };
  expect(compatibilityDifferences(digest, changed)).toEqual([
    'request ordinary-1',
  ]);
});
