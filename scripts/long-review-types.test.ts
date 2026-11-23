import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parseContinuousReviews } from '../apps/simulator/src/continuous-run.js';
import type {
  V7Execution,
  V7CallRecord,
} from '../apps/simulator/src/continuous-run.js';
import { continuousHash } from './continuous-store.js';
import { forestCheckpointRepair } from './forest-checkpoint-repair.js';
it('retains both actual ex13 quoted-duration failures and permits only the exact type-wording repair', () => {
  const source = JSON.parse(
    readFileSync('experiment/ex13/sources/revision-1.json', 'utf8'),
  ) as Record<string, string>;
  const path = 'apps/simulator/src/long-request.ts';
  const before = source[path];
  if (!before) throw new Error('Missing source.');
  const after = readFileSync(path, 'utf8');
  expect(after).toBe(
    before.replace(
      'Remaining fields are concise strings.',
      'learning must be a JSON number, never a quoted string. actor, decision, reason, specification, experienceReview and visualReview are strings; ability is a string or null.',
    ),
  );
  expect(
    forestCheckpointRepair(
      path,
      continuousHash(before),
      continuousHash(after),
      'long-review-field-types-v1',
    ),
  ).toBe(true);
  expect(
    forestCheckpointRepair(
      path,
      continuousHash(before),
      continuousHash(after + ' '),
      'long-review-field-types-v1',
    ),
  ).toBe(false);
  const state = JSON.parse(
    readFileSync('experiment/ex13/execution.json', 'utf8'),
  ) as V7Execution;
  const request = { moss: { interface: 'request', args: {} } };
  for (const id of ['world-12', 'world-13']) {
    const call = JSON.parse(
      readFileSync(`experiment/ex13/calls/${id}.json`, 'utf8'),
    ) as V7CallRecord;
    expect(call.attempt.status).toBe('rejected');
    expect(call.attempt.usage?.inputTokens).toBeGreaterThan(0);
    const outer = JSON.parse(call.response?.text ?? '{}') as {
      result_json: string;
    };
    const barrier = {
      id: 'fixture',
      tick: 7,
      actions: {},
      requests: request,
      reviews: [],
      worldAttempts: 2,
      errors: [],
      input: call.input,
      developmentAttempt: null,
    };
    expect(() =>
      parseContinuousReviews(
        outer.result_json,
        barrier as NonNullable<V7Execution['barrier']>,
        state.world,
      ),
    ).toThrow('learning duration');
  }
});
