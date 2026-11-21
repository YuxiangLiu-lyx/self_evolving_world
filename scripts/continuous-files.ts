import { v7Clone } from '@self-evolving-world/world-core';
import { resolveContinuousDevelopment } from '../apps/simulator/src/continuous-run.js';
import { resolve } from 'node:path';
import {
  continuousAtomic,
  readContinuousExecution,
} from './continuous-store.js';
import {
  currentContinuousRuntimeMatches,
  captureContinuousBaseline,
  validateContinuousDevelopment,
  saveContinuousSource,
} from './continuous-source.js';

export function continuousCheckpoint(root: string, id: string) {
  const state = readContinuousExecution(root, id);
  if (
    !currentContinuousRuntimeMatches(root, id) &&
    state.phase !== 'development'
  )
    throw new Error(
      'Continuous run source changed outside a versioned development handoff.',
    );
  captureContinuousBaseline(root, id, state);
  return state;
}
export function submitContinuousDevelopment(
  root: string,
  id: string,
  input: unknown,
): void {
  const state = continuousCheckpoint(root, id),
    attempt = state.developments.find(
      (a) => a.id === state.barrier?.developmentAttempt,
    );
  if (!state.barrier || !attempt || attempt.status !== 'started')
    throw new Error('No current, pre-counted development attempt.');
  const path = resolve(root, 'experiment', id, 'execution.json');
  try {
    const accepted = validateContinuousDevelopment(root, id, state, input);
    const reviewed = v7Clone(state);
    if (!reviewed.barrier) throw new Error('Missing validated review barrier.');
    reviewed.barrier.reviews = accepted.reviews;
    const resolved = resolveContinuousDevelopment(
      reviewed,
      accepted.packages,
      accepted.assignments,
      accepted.review,
    );
    saveContinuousSource(
      root,
      id,
      resolved,
      accepted.review,
      accepted.validation,
    );
    continuousAtomic(
      resolve(
        root,
        'experiment',
        id,
        'development',
        `${attempt.id}-declaration.json`,
      ),
      input,
    );
    continuousAtomic(path, resolved);
  } catch (error) {
    attempt.status = 'failed';
    attempt.finishedAt = new Date().toISOString();
    attempt.reason =
      error instanceof Error ? error.message : 'Development validation failed.';
    state.phase = 'development';
    state.reason = attempt.reason;
    continuousAtomic(path, state);
    throw error;
  }
}
