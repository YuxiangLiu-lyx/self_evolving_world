import { resolveContinuousDevelopment } from '../apps/simulator/src/continuous-run.js';
import { worldContinuousInput } from '../apps/simulator/src/continuous-input.js';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { v7Clone, v7Signature } from '@self-evolving-world/world-core';
import type { V7Execution } from '../apps/simulator/src/continuous-run.js';
import {
  BARK_FEEDBACK_REPAIR,
  assertContinuousTechnicalRepair,
  abandonedCollectiveTransport,
} from './task-continuous-repair.js';
import { collectiveTokenBudget } from '../apps/simulator/src/collective-controller.js';

it('permits only the retained unsettled computation pause and refuses ambiguous calls, completed targets and exhausted development budgets', () => {
  const state = JSON.parse(
    readFileSync(
      'experiment/ex8/technical-pauses/round-166/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  expect(() => {
    assertContinuousTechnicalRepair(state);
  }).not.toThrow();
  for (const change of [
    (s: V7Execution) => {
      s.reason = 'Ordinary decision budget exhausted';
    },
    (s: V7Execution) => {
      s.windowTarget = s.world.tick;
    },
    (s: V7Execution) => {
      s.phase = 'window-complete';
    },
    (s: V7Execution) => {
      s.world.config = {
        ...s.world.config,
        budgets: { ...s.world.config.budgets, development: 0 },
      };
    },
    (s: V7Execution) => {
      const a = s.attempts[0];
      if (a) a.status = 'started';
    },
  ]) {
    const changed = v7Clone(state);
    change(changed);
    expect(() => {
      assertContinuousTechnicalRepair(changed);
    }).toThrow('Only a durable');
  }
});

it('recovers the actual pre-inference context pause without advancing a round, manufacturing reviews or bypassing budgets', () => {
  const state = JSON.parse(
    readFileSync(
      'experiment/ex9/technical-pauses/round-451/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  expect(() => {
    assertContinuousTechnicalRepair(state);
  }).not.toThrow();
  for (const role of ['ordinary', 'world'] as const) {
    const exhausted = v7Clone(state);
    exhausted.world.config.budgets[role] = exhausted.attempts.filter(
      (a) => a.role === role,
    ).length;
    expect(() => {
      assertContinuousTechnicalRepair(exhausted);
    }).toThrow('Only a durable');
  }
  const pending = v7Clone(state);
  const first = pending.attempts[0];
  if (first) first.status = 'started';
  expect(() => {
    assertContinuousTechnicalRepair(pending);
  }).toThrow('Only a durable');
  const saved = v7Clone(state);
  saved.phase = 'development';
  saved.barrier = {
    technicalReason: state.reason ?? '',
    id: 'isolated-context',
    tick: state.world.tick,
    actions: {},
    requests: {},
    reviews: [],
    worldAttempts: 0,
    errors: [],
    input: worldContinuousInput(state.world, {}),
    developmentAttempt: 'isolated-development',
  };
  saved.developments.push({
    id: 'isolated-development',
    tick: state.world.tick,
    status: 'started',
    startedAt: '2026-11-21T00:00:00.000Z',
    finishedAt: null,
    reason: null,
    internalModelCalls: null,
    inputTokens: null,
    outputTokens: null,
  });
  const resolved = resolveContinuousDevelopment(
    saved,
    [],
    {},
    'Isolated context codec recovery review',
  );
  expect(resolved.world).toEqual(state.world);
  expect(resolved.attempts).toEqual(state.attempts);
  expect(resolved.cursors).toEqual(state.cursors);
  expect(resolved.barrier).toBeNull();
  expect(resolved.phase).toBe('running');
  const bad = v7Clone(saved);
  if (bad.barrier) bad.barrier.actions.lin = { interface: 'wait', args: {} };
  expect(() =>
    resolveContinuousDevelopment(bad, [], {}, 'No invented actor action'),
  ).toThrow('Context-only recovery');
});

it('keeps the actual round-123 browser-capture failure eligible only as an unsettled technical pause', () => {
  const state = JSON.parse(
    readFileSync(
      'experiment/ex10/technical-pauses/round-123/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  expect(() => {
    assertContinuousTechnicalRepair(state);
  }).not.toThrow();
  expect(state.pendingCall).toBeNull();
  const settled = v7Clone(state);
  settled.phase = 'window-complete';
  expect(() => {
    assertContinuousTechnicalRepair(settled);
  }).toThrow('Only a durable');
});

it('retains the terminated invocation as unknown and charged without replacing prior results or advancing time', () => {
  const original = JSON.parse(
    readFileSync(
      'experiment/ex11/technical-pauses/round-1/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  const { state, record } = abandonedCollectiveTransport(
    original,
    'pnpm experiment:continuous failed (143). Actual terminated-command fixture.',
  );
  expect(v7Signature(state.world)).toBe(v7Signature(original.world));
  expect(state.attempts.slice(0, -1)).toEqual(original.attempts.slice(0, -1));
  expect(state.attempts).toHaveLength(original.attempts.length);
  expect(record.response).toBeNull();
  expect(record.attempt.usage).toBeNull();
  expect(record.attempt.elapsedMs).toBeNull();
  expect(record.attempt.reservedTokens).toBe(
    original.attempts.at(-1)?.reservedTokens,
  );
  expect(collectiveTokenBudget(state)?.used).toBe(
    collectiveTokenBudget(original)?.used,
  );
  expect(() => {
    assertContinuousTechnicalRepair(state);
  }).not.toThrow();
  expect(() =>
    abandonedCollectiveTransport(
      state,
      'pnpm experiment:continuous failed (143)',
    ),
  ).toThrow();
  expect(() =>
    abandonedCollectiveTransport(original, 'An unverified operator claim.'),
  ).toThrow();
});

it('charges the actual ex12 interrupted call and limits feedback recovery to its preserved empty technical boundary', () => {
  const original = JSON.parse(
    readFileSync(
      'experiment/ex12/technical-pauses/round-56/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  const { state, record } = abandonedCollectiveTransport(
    original,
    'pnpm experiment:continuous failed (143)',
    true,
  );
  expect(state.reason).toBe(BARK_FEEDBACK_REPAIR);
  expect(state.world).toEqual(original.world);
  expect(state.attempts.slice(0, -1)).toEqual(original.attempts.slice(0, -1));
  expect(record.response).toBeNull();
  expect(record.attempt.usage).toBeNull();
  expect(record.attempt.reservedTokens).toBe(61425);
  expect(collectiveTokenBudget(state)?.used).toBe(
    collectiveTokenBudget(original)?.used,
  );
  expect(() => {
    assertContinuousTechnicalRepair(state);
  }).not.toThrow();
  for (const change of [
    (s: V7Execution) => {
      if (s.world.config.development)
        s.world.config.development.scope = 'collective-ex11';
    },
    (s: V7Execution) => {
      s.world.revisions.push('bark-feedback@1');
    },
    (s: V7Execution) => {
      s.phase = 'window-complete';
    },
    (s: V7Execution) => {
      if (s.attempts[0]) s.attempts[0].status = 'started';
    },
  ]) {
    const invalid = v7Clone(original);
    change(invalid);
    expect(() =>
      abandonedCollectiveTransport(
        invalid,
        'pnpm experiment:continuous failed (143)',
        true,
      ),
    ).toThrow();
  }
  expect(() =>
    abandonedCollectiveTransport(original, 'Unverified interruption', true),
  ).toThrow();
  const saved = v7Clone(state);
  saved.phase = 'development';
  saved.barrier = {
    technicalReason: BARK_FEEDBACK_REPAIR,
    id: 'isolated-feedback',
    tick: state.world.tick,
    actions: {},
    requests: {},
    reviews: [],
    worldAttempts: 0,
    errors: [],
    input: worldContinuousInput(state.world, {}),
    developmentAttempt: 'isolated-development',
  };
  saved.developments.push({
    id: 'isolated-development',
    tick: state.world.tick,
    status: 'started',
    startedAt: '2026-11-22T00:00:00.000Z',
    finishedAt: null,
    reason: null,
    internalModelCalls: null,
    inputTokens: null,
    outputTokens: null,
  });
  const result = resolveContinuousDevelopment(
    saved,
    ['bark-feedback@1'],
    {},
    'Actual contract repair fixture',
  );
  expect(result.world.actors).toEqual(state.world.actors);
  expect(result.world.stacks).toEqual(state.world.stacks);
  expect(result.world.tick).toBe(56);
  expect(result.attempts).toEqual(state.attempts);
  expect(result.cursors).toEqual(state.cursors);
  expect(result.barrier).toBeNull();
  expect(result.registrations).toContain('bark-feedback@1');
  expect(() =>
    resolveContinuousDevelopment(saved, [], {}, 'Missing corrective package'),
  ).toThrow();
  expect(() =>
    resolveContinuousDevelopment(
      saved,
      ['bark-feedback@1'],
      { 'ash-1': 'bark-extraction' },
      'Invented mastery',
    ),
  ).toThrow();
  const invented = v7Clone(saved);
  if (invented.barrier)
    invented.barrier.actions['ash-1'] = { interface: 'wait', args: {} };
  expect(() =>
    resolveContinuousDevelopment(
      invented,
      ['bark-feedback@1'],
      {},
      'Invented actor action',
    ),
  ).toThrow();
});
