import { resolveContinuousDevelopment } from '../apps/simulator/src/continuous-run.js';
import { worldContinuousInput } from '../apps/simulator/src/continuous-input.js';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { v7Clone } from '@self-evolving-world/world-core';
import type { V7Execution } from '../apps/simulator/src/continuous-run.js';
import { assertContinuousTechnicalRepair } from './task-continuous-repair.js';

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
