import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { v7Clone } from '@self-evolving-world/world-core';
import type {
  V7DevelopmentAttempt,
  V7Execution,
  V7Sink,
} from '../apps/simulator/src/continuous-run.js';
import {
  issueContinuousDevelopment,
  newContinuousExecution,
  resolveContinuousDevelopment,
} from '../apps/simulator/src/continuous-run.js';
import {
  collectivePhaseUsed,
  countedDevelopments,
} from '../apps/simulator/src/collective-controller.js';
import { initialLongWorld } from '../apps/simulator/src/long-scenario.js';
import type { LongScenario } from '../apps/simulator/src/long-scenario.js';
import {
  LONG_CALL_PAUSE,
  longWorldInput,
} from '../apps/simulator/src/long-context.js';
import { assertContinuousTechnicalRepair } from './continuous-repair.js';
import { emptyHandoff } from './continuous-source.js';
import {
  continuousAtomic,
  continuousStage,
  readContinuousExecution,
} from './continuous-store.js';

const sink: V7Sink = {
  save: () => Promise.resolve(),
  call: () => Promise.resolve(),
  findCall: () => Promise.resolve(null),
  round: () => Promise.resolve(),
  checkpoint: () => Promise.resolve(),
};
function handoff(
  index: number,
  status: V7DevelopmentAttempt['status'],
  counted?: false,
): V7DevelopmentAttempt {
  return {
    id: `development-${String(index)}`,
    tick: 0,
    status,
    startedAt: '2026-11-24T00:00:00.000Z',
    finishedAt: status === 'started' ? null : '2026-11-24T00:01:00.000Z',
    reason: null,
    ...(counted === false ? { counted } : {}),
    internalModelCalls: null,
    inputTokens: null,
    outputTokens: null,
  };
}
function run(scenario: LongScenario = 'long-culture-v2'): V7Execution {
  return newContinuousExecution(
    'fixture',
    'isolated-fixture',
    initialLongWorld('long-ex1', scenario),
  );
}
/** A technical long-call barrier awaiting its development handoff. */
function barrier(state: V7Execution): V7Execution {
  const next = v7Clone(state);
  next.barrier = {
    id: 'context-0',
    tick: 0,
    actions: {},
    requests: {},
    reviews: [],
    worldAttempts: 0,
    errors: [],
    input: longWorldInput(next.world, {}),
    developmentAttempt: null,
    technicalReason: LONG_CALL_PAUSE,
  };
  return next;
}

it('treats only an accepted v2 handoff without packages or runtime changes as empty', () => {
  const v2 = run().world;
  expect(v2.config.longDevelopment?.emptyHandoffs).toBe('uncounted');
  expect(emptyHandoff(v2, [], [])).toBe(true);
  expect(emptyHandoff(v2, ['shelter@1'], [])).toBe(false);
  expect(
    emptyHandoff(v2, [], ['packages/world-core/src/open-shelter.ts']),
  ).toBe(false);
  for (const scenario of ['long-culture', 'long-fixes', 'long'] as const) {
    const old = run(scenario).world;
    expect(old.config.longDevelopment?.emptyHandoffs).toBeUndefined();
    expect(emptyHandoff(old, [], [])).toBe(false);
  }
});

it('counts every handoff except an accepted empty one recorded uncounted', () => {
  const developments = [
    handoff(1, 'accepted', false),
    handoff(2, 'accepted'),
    handoff(3, 'failed'),
    handoff(4, 'started'),
  ];
  expect(countedDevelopments(developments)).toBe(3);
  const state = run();
  state.developments = developments;
  expect(collectivePhaseUsed(state, 'development')).toBe(3);
  expect(continuousStage(state).calls).toMatchObject({
    developmentHandoffs: 4,
    countedDevelopmentHandoffs: 3,
  });
  // Archived scenarios report no new field.
  const old = run('long-culture');
  old.developments = developments.slice(1);
  expect(continuousStage(old).calls).not.toHaveProperty(
    'countedDevelopmentHandoffs',
  );
  // A resolved empty handoff is accepted without the field; only the file adapter marks it.
  const issued = barrier(run());
  issued.developments.push(handoff(1, 'started'));
  if (issued.barrier) issued.barrier.developmentAttempt = 'development-1';
  issued.phase = 'development';
  const resolved = resolveContinuousDevelopment(
    issued,
    [],
    {},
    'Inspected the retained pause; no package, source or world change.',
  );
  expect(resolved.developments[0]).toEqual({
    ...handoff(1, 'accepted'),
    startedAt: issued.developments[0]?.startedAt,
    finishedAt: resolved.developments[0]?.finishedAt,
    reason: 'Inspected the retained pause; no package, source or world change.',
  });
  expect(resolved.developments[0]).not.toHaveProperty('counted');
});

it('does not exhaust the handoff budget with empty handoffs, while failed and installing ones count', async () => {
  const state = barrier(run());
  state.world.config.budgets.development = 1;
  state.phase = 'paused';
  state.reason = LONG_CALL_PAUSE;
  const empty = v7Clone(state);
  empty.developments = [handoff(1, 'accepted', false)];
  await issueContinuousDevelopment(empty, sink);
  expect(empty.phase).toBe('development');
  expect(empty.developments.map((d) => d.id)).toEqual([
    'development-1',
    'development-2',
  ]);
  for (const used of [handoff(1, 'accepted'), handoff(1, 'failed')]) {
    const counted = v7Clone(state);
    counted.developments = [used];
    await issueContinuousDevelopment(counted, sink);
    expect(counted.phase).toBe('paused');
    expect(counted.reason).toBe(
      'Conversation development-handoff budget exhausted.',
    );
    expect(counted.developments).toHaveLength(1);
  }
  // The technical-repair guard compares the same counted handoffs.
  const pause = v7Clone(run());
  pause.world.config.budgets.development = 1;
  pause.attempts.push({
    id: 'ordinary-1',
    role: 'ordinary',
    actor: 'lin',
    tick: 0,
    reason: 'isolated context fixture',
    status: 'failed',
    startedAt: '2026-11-24T00:00:00.000Z',
    elapsedMs: 10,
    usage: null,
    error: 'Responses ended with error; no decision was accepted.',
    reservedTokens: 30000,
  });
  pause.phase = 'paused';
  pause.reason = LONG_CALL_PAUSE;
  pause.developments = [handoff(1, 'accepted', false)];
  expect(() => {
    assertContinuousTechnicalRepair(pause);
  }).not.toThrow();
  pause.developments = [handoff(1, 'accepted')];
  expect(() => {
    assertContinuousTechnicalRepair(pause);
  }).toThrow('Only a durable');
});

it('verifies a checkpoint against counted handoffs only', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'empty-handoff-'));
  try {
    const state = run();
    const budget = state.world.config.budgets.development;
    const path = resolve(root, 'experiment/ex1/execution.json');
    state.developments = [
      ...Array.from({ length: budget }, (_, i) => handoff(i + 1, 'accepted')),
      handoff(budget + 1, 'accepted', false),
    ];
    continuousAtomic(path, state);
    expect(readContinuousExecution(root, 'ex1').developments).toHaveLength(
      budget + 1,
    );
    const over = v7Clone(state);
    over.developments.push(handoff(budget + 2, 'failed'));
    continuousAtomic(path, over);
    expect(() => readContinuousExecution(root, 'ex1')).toThrow(
      'exceed their fixed shared budget',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
