import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { V7Execution } from '../apps/simulator/src/continuous-run.js';
import {
  continuousReport,
  type measureContinuous,
} from './continuous-analysis.js';
const read = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf8')) as unknown;
it('reports the actual long policy without changing legacy report objectives', () => {
  const state = read(
    'experiment/ex13/technical-pauses/round-157/execution.json',
  ) as V7Execution;
  const results = read(
    'experiment/ex13/technical-pauses/round-157/results.json',
  ) as ReturnType<typeof measureContinuous>;
  const report = continuousReport('ex13', state, results);
  expect(report).toContain('1800/100/40');
  expect(report).toContain('10000000');
  expect(report).not.toContain('650/60/20');
  const old = read('experiment/ex10/execution.json') as V7Execution;
  const oldResults = read('experiment/ex10/results.json') as ReturnType<
    typeof measureContinuous
  >;
  expect(continuousReport('ex10', old, oldResults)).toBe(
    readFileSync('experiment/ex10/report.md', 'utf8'),
  );
});
