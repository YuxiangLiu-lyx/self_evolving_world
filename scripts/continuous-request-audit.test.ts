import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type {
  V7Execution,
  V7CallRecord,
} from '../apps/simulator/src/continuous-run.js';
import type { ContinuousSourceRevision } from './continuous-source.js';
import { continuousHash } from './continuous-store.js';
import {
  requestRevisionBoundaries,
  retainedRequestBuilder,
} from './continuous-request-audit.js';

it('reconstructs actual pre/post repair reservations from their source and exact attempt boundary without inference', () => {
  const state = JSON.parse(
    readFileSync('experiment/ex11/execution.json', 'utf8'),
  ) as V7Execution;
  const history = JSON.parse(
    readFileSync('experiment/ex11/source-history.json', 'utf8'),
  ) as ContinuousSourceRevision[];
  const boundaries = requestRevisionBoundaries(history, state.attempts);
  expect(boundaries.slice(0, 4)).toEqual([0, 4, 8, 14]);
  const builders = history.map((revision) => {
    const files = JSON.parse(
      readFileSync(
        `experiment/ex11/sources/revision-${String(revision.id)}.json`,
        'utf8',
      ),
    ) as Record<string, string>;
    expect(continuousHash(files)).toBe(revision.sourceHash);
    return retainedRequestBuilder(files);
  });
  for (const [index, attempt] of state.attempts.entries()) {
    const call = JSON.parse(
      readFileSync(`experiment/ex11/calls/${attempt.id}.json`, 'utf8'),
    ) as V7CallRecord;
    const builder =
      builders[boundaries.findLastIndex((start) => start <= index)];
    if (!builder) throw new Error('Missing source fixture.');
    const expected =
      Buffer.byteLength(
        JSON.stringify(builder(state.model, attempt.role, call.input)),
      ) +
      8192 +
      4096;
    expect(attempt.reservedTokens).toBe(expected);
  }
  const altered = structuredClone(history);
  if (!altered[1]) throw new Error('Missing source fixture.');
  altered[1].attemptsHash = 'unbound';
  expect(() => requestRevisionBoundaries(altered, state.attempts)).toThrow(
    'attempt prefix',
  );
});

it('rejects absent and external imports rather than loading the current tree or a network service', () => {
  expect(() => retainedRequestBuilder({})).toThrow('Missing retained');
  expect(() =>
    retainedRequestBuilder({
      'apps/simulator/src/continuous-provider.ts':
        'import fs from "node:fs"; export const continuousRequest = fs.readFileSync;',
    }),
  ).toThrow('External retained request import rejected');
});
