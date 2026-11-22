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
  retainedRequestCompiler,
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
  const compiler = retainedRequestCompiler();
  const builders = history.map((revision) => {
    const files = JSON.parse(
      readFileSync(
        `experiment/ex11/sources/revision-${String(revision.id)}.json`,
        'utf8',
      ),
    ) as Record<string, string>;
    expect(continuousHash(files)).toBe(revision.sourceHash);
    return compiler.build(files);
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

it('compiles identical source once while isolating revision state and changed dependencies', () => {
  const compiler = retainedRequestCompiler();
  const files = {
    'apps/simulator/src/continuous-provider.ts':
      'import { value } from "./fixture.js"; let calls = 0; export function continuousRequest() { return [value, ++calls]; }',
    'apps/simulator/src/fixture.ts': 'export const value = "first";',
  };
  const first = compiler.build(files);
  const same = compiler.build(files);
  expect(compiler.compiledSources).toBe(2);
  const changed = compiler.build({
    ...files,
    'apps/simulator/src/fixture.ts': 'export const value = "changed";',
  });
  expect(compiler.compiledSources).toBe(3);
  expect(Reflect.apply(first, null, [])).toEqual(['first', 1]);
  expect(Reflect.apply(first, null, [])).toEqual(['first', 2]);
  expect(Reflect.apply(same, null, [])).toEqual(['first', 1]);
  expect(Reflect.apply(changed, null, [])).toEqual(['changed', 1]);
  expect(() =>
    compiler.build({ ...files, 'apps/simulator/src/fixture.ts': '' }),
  ).toThrow('Missing retained');
  expect(retainedRequestCompiler().compiledSources).toBe(0);
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
