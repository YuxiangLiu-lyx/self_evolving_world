import { it, expect } from 'vitest';
import { v7Clone } from '@self-evolving-world/world-core';
import { newContinuousExecution } from '../apps/simulator/src/continuous-run.js';
import { initialLongWorld } from '../apps/simulator/src/long-scenario.js';
import {
  longOrdinaryInput,
  LONG_CALL_PAUSE,
} from '../apps/simulator/src/long-context.js';
import { longTokenBudget } from '../apps/simulator/src/long-tokens.js';
import {
  abandonedLongTransport,
  assertContinuousTechnicalRepair,
} from './task-continuous-repair.js';
it('charges an abandoned invocation as unknown, preserves work and requires both coordinator and worker absence', () => {
  const s = newContinuousExecution(
    'fixture',
    'isolated-fixture',
    initialLongWorld(),
  );
  s.attempts.push({
    id: 'ordinary-1',
    role: 'ordinary',
    actor: 'lin',
    tick: 0,
    reason: 'isolated interruption fixture',
    status: 'started',
    startedAt: '2026-11-23T00:00:00.000Z',
    elapsedMs: null,
    usage: null,
    error: null,
    reservedTokens: 30000,
  });
  s.pendingCall = {
    id: 'ordinary-1',
    input: longOrdinaryInput(s.world, 'lin'),
  };
  const evidence = {
    coordinatorPid: 1234,
    observedAt: '2026-11-23T00:01:00.000Z',
    coordinatorAbsent: true,
    workerAbsent: true,
  };
  const r = abandonedLongTransport(s, evidence);
  expect(r.state.world).toEqual(s.world);
  expect(r.state.cursors).toEqual(s.cursors);
  expect(r.state.pendingCall).toBeNull();
  expect(r.state.reason).toBe(LONG_CALL_PAUSE);
  expect(r.record.response).toBeNull();
  expect(r.record.attempt.usage).toBeNull();
  expect(r.record.attempt.status).toBe('failed');
  expect(longTokenBudget(r.state)?.used).toBe(30000);
  expect(r.state.longRetrieval?.lin?.results).toEqual([
    expect.objectContaining({ abandonedInvocation: 'ordinary-1' }),
  ]);
  expect(() => {
    assertContinuousTechnicalRepair(r.state);
  }).not.toThrow();
  for (const missing of ['coordinatorAbsent', 'workerAbsent'])
    expect(() =>
      abandonedLongTransport(s, { ...evidence, [missing]: false }),
    ).toThrow('proved abandoned');
  expect(() => abandonedLongTransport(r.state, evidence)).toThrow();
  const ambiguous = v7Clone(s);
  const first = s.attempts[0];
  if (!first) throw new Error('Missing fixture attempt.');
  ambiguous.attempts.push({ ...first, id: 'ordinary-2' });
  expect(() => abandonedLongTransport(ambiguous, evidence)).toThrow();
});
