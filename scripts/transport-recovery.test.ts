import { expect, it } from 'vitest';
import { v7Clone } from '@self-evolving-world/world-core';
import type {
  V7CallRecord,
  V7Execution,
} from '../apps/simulator/src/continuous-run.js';
import { newContinuousExecution } from '../apps/simulator/src/continuous-run.js';
import { initialLongWorld } from '../apps/simulator/src/long-scenario.js';
import type { LongScenario } from '../apps/simulator/src/long-scenario.js';
import {
  longOrdinaryInput,
  LONG_CALL_PAUSE,
} from '../apps/simulator/src/long-context.js';
import {
  abandonedLongTransport,
  assertContinuousTechnicalRepair,
  uncountedTransportPause,
} from './continuous-repair.js';

/** A paused run whose round-0 ordinary call ended with a provider transport failure. */
function paused(scenario: LongScenario): {
  state: V7Execution;
  record: V7CallRecord;
} {
  const state = newContinuousExecution(
    'fixture',
    'isolated-fixture',
    initialLongWorld('long-ex15', scenario),
  );
  state.attempts.push({
    id: 'ordinary-1',
    role: 'ordinary',
    actor: 'lin',
    tick: 0,
    reason: 'isolated transport fixture',
    status: 'failed',
    startedAt: '2026-11-24T00:00:00.000Z',
    elapsedMs: 10,
    usage: null,
    error: 'Responses ended with error; no decision was accepted.',
    reservedTokens: 30000,
  });
  state.phase = 'paused';
  state.reason = LONG_CALL_PAUSE;
  const attempt = state.attempts[0];
  if (!attempt) throw new Error('Missing fixture attempt.');
  return {
    state,
    record: {
      attempt: v7Clone(attempt),
      input: longOrdinaryInput(state.world, 'lin'),
      response: null,
      failureEvidence: 'event: error\ndata: {"code":"server_is_overloaded"}',
    },
  };
}

it('resumes a culture-scope transport failure without a handoff and keeps every other pause counted', () => {
  const { state, record } = paused('long-culture');
  expect(state.world.config.longDevelopment?.transportRecovery).toBe(
    'uncounted',
  );
  expect(uncountedTransportPause(state, record)).toBe(true);
  // The opt-in does not exist in long-fixes (E1), ex13 or earlier runs.
  for (const scenario of ['long-fixes', 'long'] as const) {
    const old = paused(scenario);
    expect(old.state.world.config.longDevelopment?.transportRecovery).toBe(
      undefined,
    );
    expect(uncountedTransportPause(old.state, old.record)).toBe(false);
    expect(() => {
      assertContinuousTechnicalRepair(old.state);
    }).not.toThrow();
  }
  // Rejected model output (a response exists) and missing evidence stay counted.
  expect(
    uncountedTransportPause(state, {
      ...record,
      response: {
        text: '{}',
        responseId: 'resp-fixture',
        usage: { inputTokens: 1, outputTokens: 1 },
        http: { status: 200, requestId: null, contentType: null },
        evidence: '',
      },
    }),
  ).toBe(false);
  expect(
    uncountedTransportPause(state, { ...record, failureEvidence: '' }),
  ).toBe(false);
  const rejected = v7Clone(state);
  const last = rejected.attempts[0];
  if (last) last.status = 'rejected';
  expect(uncountedTransportPause(rejected, record)).toBe(false);
  // The record must belong to the failing attempt, at the current round, while paused.
  expect(
    uncountedTransportPause(state, {
      ...record,
      attempt: { ...record.attempt, id: 'ordinary-0' },
    }),
  ).toBe(false);
  for (const change of [
    (s: V7Execution) => {
      s.reason = 'Conversation development-handoff budget exhausted.';
    },
    (s: V7Execution) => {
      s.phase = 'running';
    },
    (s: V7Execution) => {
      s.windowTarget = s.world.tick;
    },
    (s: V7Execution) => {
      s.world.tick += 1;
    },
  ]) {
    const changed = v7Clone(state);
    change(changed);
    expect(uncountedTransportPause(changed, record)).toBe(false);
  }
  // It does not depend on the remaining handoff budget, which it never uses.
  const exhausted = v7Clone(state);
  exhausted.world.config.budgets.development = 0;
  expect(uncountedTransportPause(exhausted, record)).toBe(true);
  expect(() => {
    assertContinuousTechnicalRepair(exhausted);
  }).toThrow('Only a durable');
});

it('treats a proved abandoned culture-scope invocation as a transport failure', () => {
  const { state } = paused('long-culture');
  const s = v7Clone(state);
  s.attempts = [];
  s.phase = 'running';
  s.reason = null;
  s.attempts.push({
    id: 'ordinary-1',
    role: 'ordinary',
    actor: 'lin',
    tick: 0,
    reason: 'isolated interruption fixture',
    status: 'started',
    startedAt: '2026-11-24T00:00:00.000Z',
    elapsedMs: null,
    usage: null,
    error: null,
    reservedTokens: 30000,
  });
  s.pendingCall = { id: 'ordinary-1', input: longOrdinaryInput(s.world, 'lin') };
  const r = abandonedLongTransport(s, {
    coordinatorPid: 1234,
    observedAt: '2026-11-24T00:01:00.000Z',
    coordinatorAbsent: true,
    workerAbsent: true,
  });
  expect(uncountedTransportPause(r.state, r.record)).toBe(true);
});
