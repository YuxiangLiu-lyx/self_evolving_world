import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { v7Clone } from '@self-evolving-world/world-core';
import type {
  V7Attempt,
  V7CallRecord,
  V7Execution,
  V7Sink,
} from '../apps/simulator/src/continuous-run.js';
import {
  continueContinuousExecution,
  newContinuousExecution,
} from '../apps/simulator/src/continuous-run.js';
import type { V7Provider } from '../apps/simulator/src/continuous-provider.js';
import { initialLongWorld } from '../apps/simulator/src/long-scenario.js';
import type { LongScenario } from '../apps/simulator/src/long-scenario.js';
import {
  longOrdinaryInput,
  LONG_CALL_PAUSE,
} from '../apps/simulator/src/long-context.js';
import {
  assertContinuousTechnicalRepair,
  consecutiveRejectedOutputs,
  rejectionReviewStop,
  technicalPausePrefix,
  technicalRepairKind,
  uncountedRejectionPause,
  uncountedTransportPause,
} from './continuous-repair.js';
import { continuousAtomic, continuousHash } from './continuous-store.js';

type Status = 'accepted' | 'rejected' | 'failed';
const response = {
  text: '{"queries":[],"result_json":"not a plan"}',
  responseId: 'resp-fixture',
  usage: { inputTokens: 1, outputTokens: 1 },
  http: { status: 200, requestId: null, contentType: null },
  evidence: 'isolated fixture',
};

function attempt(
  index: number,
  status: Status,
  actor = 'lin',
  role: V7Attempt['role'] = 'ordinary',
): V7Attempt {
  return {
    id: `${role}-${String(index)}`,
    role,
    actor,
    tick: 0,
    reason: 'isolated rejection fixture',
    status,
    startedAt: '2026-11-24T00:00:00.000Z',
    elapsedMs: 10,
    usage: status === 'failed' ? null : { inputTokens: 1, outputTokens: 1 },
    error: status === 'accepted' ? null : 'Expected a bounded plan.',
    reservedTokens: 30000,
  };
}

/** A paused run whose round-0 attempts end with the given statuses, plus the last record. */
function paused(
  statuses: readonly (
    Status | readonly [Status, string] | readonly [Status, string, 'world']
  )[],
  scenario: LongScenario = 'long-culture-v2',
): { state: V7Execution; record: V7CallRecord } {
  const state = newContinuousExecution(
    'fixture',
    'isolated-fixture',
    initialLongWorld('long-ex16', scenario),
  );
  statuses.forEach((entry, index) => {
    const [status, actor, role = 'ordinary'] =
      typeof entry === 'string' ? [entry, 'lin'] : entry;
    state.attempts.push(attempt(index + 1, status, actor, role));
  });
  state.phase = 'paused';
  state.reason = LONG_CALL_PAUSE;
  const last = state.attempts.at(-1);
  if (!last) throw new Error('Missing fixture attempt.');
  return {
    state,
    record: {
      attempt: v7Clone(last),
      input: longOrdinaryInput(state.world, last.actor),
      response: last.status === 'failed' ? null : response,
      failureEvidence:
        last.status === 'failed'
          ? 'event: error\ndata: {"code":"server_is_overloaded"}'
          : '',
    },
  };
}

it('resumes a v2 rejection pause without a handoff after one or two consecutive rejected outputs', () => {
  const two = paused(['rejected', 'rejected']);
  expect(two.state.world.config.longDevelopment?.rejectionRecovery).toEqual({
    mode: 'uncounted',
    stopAfter: 3,
  });
  expect(consecutiveRejectedOutputs(two.state)).toBe(2);
  expect(rejectionReviewStop(two.state)).toBeNull();
  expect(uncountedRejectionPause(two.state, two.record)).toBe(true);
  expect(uncountedTransportPause(two.state, two.record)).toBe(false);
  expect(technicalRepairKind(two.state, two.record)).toBe('rejection');
  // One rejected output: after a retained transport failure, or after an accepted
  // read-only query batch of the same actor in the same round.
  for (const statuses of [
    ['failed', 'rejected'],
    ['rejected', 'accepted', 'rejected'],
  ] as const) {
    const one = paused(statuses);
    expect(consecutiveRejectedOutputs(one.state)).toBe(1);
    expect(technicalRepairKind(one.state, one.record)).toBe('rejection');
  }
  // It never uses the handoff budget, so an exhausted budget does not block it.
  const exhausted = v7Clone(two.state);
  exhausted.world.config.budgets.development = 0;
  expect(technicalRepairKind(exhausted, two.record)).toBe('rejection');
  expect(() => {
    assertContinuousTechnicalRepair(exhausted);
  }).toThrow('Only a durable');
});

it('requires the durable rejected record of a settled long-call pause in the current round', () => {
  const { state, record } = paused(['rejected', 'rejected']);
  expect(uncountedRejectionPause(state, null)).toBe(false);
  expect(uncountedRejectionPause(state, { ...record, response: null })).toBe(
    false,
  );
  expect(
    uncountedRejectionPause(state, {
      ...record,
      attempt: { ...record.attempt, id: 'ordinary-1' },
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
    (s: V7Execution) => {
      s.pendingCall = {
        id: 'ordinary-2',
        input: longOrdinaryInput(s.world, 'lin'),
      };
    },
  ]) {
    const changed = v7Clone(state);
    change(changed);
    expect(uncountedRejectionPause(changed, record)).toBe(false);
  }
});

it('stops for review at three consecutive rejected outputs and never falls back to a counted handoff', () => {
  for (const statuses of [
    ['rejected', 'rejected', 'rejected'],
    // A transport failure neither extends nor ends the run.
    ['rejected', 'rejected', 'failed', 'rejected'],
    // The run spans actors.
    [
      ['rejected', 'moss'],
      ['rejected', 'lin'],
      ['rejected', 'lin'],
    ],
  ] as const) {
    const { state, record } = paused(statuses);
    expect(consecutiveRejectedOutputs(state)).toBe(3);
    expect(rejectionReviewStop(state)).toBe(3);
    expect(uncountedRejectionPause(state, record)).toBe(false);
    expect(() => technicalRepairKind(state, record)).toThrow(
      'The run stops for review after 3 consecutive rejected ordinary outputs',
    );
    expect(() => {
      assertContinuousTechnicalRepair(state);
    }).toThrow('Only a durable');
  }
  // A later transport failure is still recovered as transport; the run is not extended.
  const transport = paused(['rejected', 'rejected', 'failed']);
  expect(consecutiveRejectedOutputs(transport.state)).toBe(2);
  expect(rejectionReviewStop(transport.state)).toBeNull();
  expect(technicalRepairKind(transport.state, transport.record)).toBe(
    'transport',
  );
});

it('resets the count at an accepted ordinary attempt and ignores World Agent attempts', () => {
  const reset = paused([
    'rejected',
    'rejected',
    'accepted',
    'rejected',
    'rejected',
  ]);
  expect(consecutiveRejectedOutputs(reset.state)).toBe(2);
  expect(technicalRepairKind(reset.state, reset.record)).toBe('rejection');
  const world = paused([
    'rejected',
    ['accepted', 'world', 'world'],
    'rejected',
    'rejected',
  ]);
  expect(consecutiveRejectedOutputs(world.state)).toBe(3);
  expect(rejectionReviewStop(world.state)).toBe(3);
});

it('keeps the counted rejection path and no stop rule in the archived scenarios', () => {
  for (const scenario of ['long-culture', 'long-fixes', 'long'] as const) {
    for (const statuses of [
      ['rejected', 'rejected'],
      ['rejected', 'rejected', 'rejected'],
    ] as const) {
      const { state, record } = paused(statuses, scenario);
      expect(
        state.world.config.longDevelopment?.rejectionRecovery,
      ).toBeUndefined();
      expect(uncountedRejectionPause(state, record)).toBe(false);
      expect(rejectionReviewStop(state)).toBeNull();
      expect(technicalRepairKind(state, record)).toBe('development');
    }
    // Transport recovery is unchanged: uncounted only in long-culture.
    const transport = paused(['failed'], scenario);
    expect(technicalRepairKind(transport.state, transport.record)).toBe(
      scenario === 'long-culture' ? 'transport' : 'development',
    );
  }
  const v2 = paused(['failed']);
  expect(technicalRepairKind(v2.state, v2.record)).toBe('transport');
});

it('retains repeated v2 pauses of one round separately but never the same pause twice', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'rejection-pauses-'));
  try {
    const { state } = paused(['failed', 'rejected']);
    expect(technicalPausePrefix(root, state)).toBe('technical-pauses/round-0');
    const earlier = v7Clone(state);
    earlier.attempts.pop();
    mkdirSync(resolve(root, 'technical-pauses/round-0'), { recursive: true });
    // A directory without its recovery record is an interrupted repair.
    expect(() => technicalPausePrefix(root, state)).toThrow(
      'Technical pause already retained',
    );
    continuousAtomic(resolve(root, 'technical-pauses/round-0/recovery.json'), {
      attemptsHash: continuousHash(earlier.attempts),
    });
    expect(technicalPausePrefix(root, state)).toBe(
      'technical-pauses/round-0-2',
    );
    continuousAtomic(
      resolve(root, 'technical-pauses/round-0-2/recovery.json'),
      { attemptsHash: continuousHash(state.attempts) },
    );
    expect(() => technicalPausePrefix(root, state)).toThrow(
      'Technical pause already retained',
    );
    // Archived scenarios keep one retained pause per round.
    const old = paused(['failed', 'rejected'], 'long-culture');
    expect(() => technicalPausePrefix(root, old.state)).toThrow(
      'Technical pause already retained',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const WAIT = { interface: 'wait', args: {} };
const PLAN = JSON.stringify({
  intention: 'Fixture only',
  steps: [{ action: WAIT, repeat: 1, until: null, guard: null }],
  repeat: 1,
  until: null,
  interrupts: [],
  notes: [],
  preferences: [],
});
function store() {
  const calls = new Map<string, V7CallRecord>();
  const sink: V7Sink = {
    save: () => Promise.resolve(),
    call: (r) => {
      calls.set(r.attempt.id, v7Clone(r));
      return Promise.resolve();
    },
    findCall: (id) => Promise.resolve(calls.get(id) ?? null),
    round: () => Promise.resolve(),
    checkpoint: () => Promise.resolve(),
  };
  return { sink, calls };
}
/** Lin's output is rejected `rejections` times; every other decision is a valid plan. */
function provider(rejections: number): V7Provider {
  let rejected = 0;
  return (_role, input) => {
    const actor = 'longContext' in input ? input.longContext.actor : '';
    const reject = actor === 'lin' && rejected < rejections;
    if (reject) rejected += 1;
    return Promise.resolve({
      ...response,
      text: JSON.stringify({
        queries: [],
        result_json: reject ? 'not a plan' : PLAN,
      }),
      usage: { inputTokens: 100, outputTokens: 10 },
    });
  };
}
function resume(state: V7Execution): V7Execution {
  const next = v7Clone(state);
  next.phase = 'running';
  next.reason = null;
  return next;
}

it('gives each decision three tries: an uncounted resume, then a review stop at the next rejection', async () => {
  const db = store();
  const state = newContinuousExecution(
    'fixture',
    'isolated-fixture',
    initialLongWorld('long-ex16', 'long-culture-v2'),
  );
  state.windowTarget = 1;
  const lin = provider(10);
  const first = await continueContinuousExecution(state, lin, db.sink);
  expect(first.reason).toBe(LONG_CALL_PAUSE);
  expect(first.attempts.map((a) => a.status)).toEqual(['rejected', 'rejected']);
  const record = (s: V7Execution) => db.calls.get(s.attempts.at(-1)?.id ?? '');
  expect(technicalRepairKind(first, record(first) ?? null)).toBe('rejection');
  // After the uncounted resume, the same actor's next rejection pauses immediately.
  const second = await continueContinuousExecution(resume(first), lin, db.sink);
  expect(second.reason).toBe(LONG_CALL_PAUSE);
  expect(second.world.tick).toBe(0);
  expect(second.attempts).toHaveLength(3);
  expect(second.developments).toEqual([]);
  expect(() => technicalRepairKind(second, record(second) ?? null)).toThrow(
    'stops for review after 3 consecutive',
  );
  // A third try that is accepted ends the run and the round completes.
  const retry = store();
  const paused2 = await continueContinuousExecution(
    v7Clone(state),
    provider(2),
    retry.sink,
  );
  const done = await continueContinuousExecution(
    resume(paused2),
    provider(0),
    retry.sink,
  );
  expect(done.phase).toBe('window-complete');
  expect(done.world.tick).toBe(1);
  expect(consecutiveRejectedOutputs(done)).toBe(0);
  expect(done.developments).toEqual([]);
});
