import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { v7Clone } from '@self-evolving-world/world-core';
import type { V7Execution } from '../apps/simulator/src/continuous-run.js';
import { worldContinuousInput } from '../apps/simulator/src/continuous-input.js';
import { issueContinuousDevelopment } from '../apps/simulator/src/continuous-run.js';
import { continuousCheckpoint } from './continuous-files.js';
import { captureContinuousBaseline } from './continuous-source.js';
import {
  continuousAtomic,
  continuousHash,
  continuousSink,
} from './continuous-store.js';
import { readExperiment } from './experiments.js';
import type { TaskContext } from './task-context.js';

/** A computation pause is unfinished work, never a new experiment or an actor-authored request. */
export async function requestContinuousTechnicalRepair(
  root: string,
  task: TaskContext,
): Promise<void> {
  const id = task.experiment?.id;
  if (
    !id ||
    task.intent.experiment.mode !== 'continuous' ||
    task.intent.experiment.allocation !== 'new' ||
    task.experiment?.before.includes(id) ||
    !task.prepared ||
    task.status === 'completed' ||
    task.publication
  )
    throw new Error(
      "Technical repair requires this task's own unpublished continuous run.",
    );
  const state = continuousCheckpoint(root, id);
  assertContinuousTechnicalRepair(state);
  const reason = state.reason;
  const record = readExperiment(root, id);
  const directory = resolve(root, 'experiment', id);
  const prefix = `technical-pauses/round-${String(state.world.tick)}`;
  if (existsSync(resolve(directory, prefix)))
    throw new Error(
      'Technical pause already retained; inspect its recovery before repeating.',
    );
  mkdirSync(resolve(directory, prefix), { recursive: true });
  // Immutable calls, segments, source snapshots and existing checkpoints stay at their original paths.
  const retained: Record<string, string> = {};
  for (const file of [
    'manifest.json',
    'execution.json',
    'replay.json',
    'results.json',
    'report.md',
    'browser.json',
    'initial.png',
    'midpoint.png',
    'final.png',
    'overview.svg',
    'overview.png',
  ]) {
    const target = `${prefix}/${file === 'report.md' ? 'report.txt' : file}`;
    copyFileSync(resolve(directory, file), resolve(directory, target));
    retained[target] = continuousHash(readFileSync(resolve(directory, target)));
  }
  continuousAtomic(resolve(directory, prefix, 'recovery.json'), {
    kind: 'technical-computation-recovery',
    reason,
    tick: state.world.tick,
    retained,
    worldHash: continuousHash(state.world),
    attemptsHash: continuousHash(state.attempts),
    target: state.windowTarget,
    basis:
      'The current task requires repairing technical blockers and continuing the same original run.',
    actorRequest: false,
    modelCalls: 0,
  });
  const next = v7Clone(state);
  // Structural extension is serialized here before the runtime receives its typed recovery contract.
  if (!reason) throw new Error('Missing validated technical reason.');
  const barrier = {
    ...(state.barrier ?? {
      id: `context-${String(state.world.tick)}`,
      tick: state.world.tick,
      actions: {},
      requests: {},
      reviews: [],
      worldAttempts: 0,
      errors: [],
      input: worldContinuousInput(state.world, {}),
      developmentAttempt: null,
    }),
    technicalReason: reason,
  };
  next.barrier = barrier;
  await issueContinuousDevelopment(next, continuousSink(root, id));
  captureContinuousBaseline(root, id, next);
  const manifest = { ...record.manifest };
  delete manifest.artifacts;
  continuousAtomic(resolve(directory, 'manifest.json'), {
    ...manifest,
    status: 'running',
    windowPhase: 'development',
    files: [],
  });
  if (!task.experiment) throw new Error('Missing task experiment journal.');
  task.experiment.phase = 'started';
  delete task.request;
  delete task.validation;
  delete task.review;
  delete task.body;
  delete task.remoteReview;
  delete task.completion;
  task.history.push({
    step: 'development',
    detail: `Retained ${id} at round ${String(state.world.tick)} under ${prefix}; requested counted technical development without inference, actor requests, parameter changes or replacing the run.`,
  });
}

/** Refuse ambiguous calls, budget exhaustion, settled windows and actor review barriers. */
export function assertContinuousTechnicalRepair(state: V7Execution): void {
  const computation =
    state.reason ===
      'Simulation computation budget exhausted; checkpoint the entire world.' &&
    !!state.barrier;
  const context =
    state.reason ===
      'Observation input exceeds computational context protection; no hidden truncation or inference.' &&
    state.barrier === null &&
    !!state.world.config.experience;
  if (
    state.phase !== 'paused' ||
    !(computation || context) ||
    state.pendingCall ||
    state.attempts.some((a) => a.status === 'started') ||
    state.world.tick >= state.windowTarget ||
    state.developments.length >= state.world.config.budgets.development ||
    (state.barrier &&
      (Object.keys(state.barrier.requests).length ||
        state.barrier.reviews.length)) ||
    (context &&
      (['ordinary', 'world'] as const).some(
        (role) =>
          state.attempts.filter((a) => a.role === role).length >=
          state.world.config.budgets[role],
      ))
  )
    throw new Error(
      'Only a durable, unsettled computation or pre-inference context pause can request technical development; budgets and uncertain calls cannot be bypassed.',
    );
}
