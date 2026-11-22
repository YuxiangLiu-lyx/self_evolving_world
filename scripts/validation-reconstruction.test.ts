import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EvidenceCache } from './validation-cache.js';
import { experimentFingerprint } from './experiments.js';
import {
  reconstructSelected,
  verifiedWorkerMetric,
} from './validation-reconstruction.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'reconstruction-workers-'));
  mkdirSync(resolve(root, 'experiment/ex1'), { recursive: true });
  writeFileSync(resolve(root, 'experiment/ex1/manifest.json'), '{"version":1}');
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it('schedules each selected archive once with at most two active readers', async () => {
  let active = 0,
    maximum = 0;
  const starts: string[] = [],
    releases: (() => void)[] = [];
  const running = reconstructSelected(['ex1', 'ex9', 'ex8'], async (id) => {
    starts.push(id);
    maximum = Math.max(maximum, ++active);
    await new Promise<void>((done) => releases.push(done));
    active--;
  });
  expect(starts).toEqual(['ex9', 'ex8']);
  releases.shift()?.();
  await Promise.resolve();
  await Promise.resolve();
  expect(starts).toEqual(['ex9', 'ex8', 'ex1']);
  for (const done of releases) done();
  await running;
  expect(maximum).toBe(2);
  expect(active).toBe(0);
});

it('rejects duplicate selection before starting any worker', async () => {
  const starts: string[] = [];
  await expect(
    reconstructSelected(['ex1', 'ex1'], (id) => {
      starts.push(id);
      return Promise.resolve();
    }),
  ).rejects.toThrow('Duplicate');
  expect(starts).toEqual([]);
});

it('drains active work and blocks delivery after a selected failure', async () => {
  const starts: string[] = [];
  let release = () => {},
    settled = false;
  const running = reconstructSelected(['ex1', 'ex2', 'ex3'], async (id) => {
    starts.push(id);
    if (id === 'ex3') throw new Error('Archive corruption');
    await new Promise<void>((done) => {
      release = done;
    });
  });
  const result = running.catch((error: unknown) => {
    settled = true;
    return error as Error;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  release();
  expect((await result)?.message).toBe('Archive corruption');
  expect(starts).toEqual(['ex3', 'ex2']);
});

function bound() {
  const cache = new EvidenceCache(root, 'current');
  const input = experimentFingerprint(root, 'ex1');
  cache.write('experiment:ex1', input, { checked: true }, 17);
  const metric = {
    id: 'ex1',
    input,
    originRun: 'current',
    status: 'passed',
    durationMs: 17,
    deepRebuilds: 1,
  };
  return { cache, metric };
}
it('accepts current receipts and retains truthful reuse origin and rebuild count', () => {
  const { cache, metric } = bound();
  expect(
    verifiedWorkerMetric(root, 'ex1', JSON.stringify(metric), cache),
  ).toEqual(metric);
  const next = new EvidenceCache(root, 'later');
  const reused = {
    ...metric,
    status: 'reused',
    durationMs: 2,
    deepRebuilds: 0,
  };
  expect(
    verifiedWorkerMetric(root, 'ex1', JSON.stringify(reused), next),
  ).toEqual(reused);
  expect(() =>
    verifiedWorkerMetric(root, 'ex1', JSON.stringify(metric), next),
  ).toThrow('mismatched');
});

it('does not accept stale input or unsigned child PASS as acceptance', () => {
  const { cache, metric } = bound();
  writeFileSync(resolve(root, 'experiment/ex1/new-file.json'), '{}');
  expect(() =>
    verifiedWorkerMetric(root, 'ex1', JSON.stringify(metric), cache),
  ).toThrow('mismatched');
  const current = { ...metric, input: experimentFingerprint(root, 'ex1') };
  expect(() =>
    verifiedWorkerMetric(root, 'ex1', JSON.stringify(current), cache),
  ).toThrow('mismatched');
});

it('rejects false rebuild counts, durations, origins and failed status', () => {
  const { cache, metric } = bound();
  for (const changed of [
    { deepRebuilds: 0 },
    { durationMs: -1 },
    { durationMs: 18 },
    { originRun: 'foreign' },
    { status: 'failed' },
  ])
    expect(() =>
      verifiedWorkerMetric(
        root,
        'ex1',
        JSON.stringify({ ...metric, ...changed }),
        cache,
      ),
    ).toThrow('mismatched');
});
