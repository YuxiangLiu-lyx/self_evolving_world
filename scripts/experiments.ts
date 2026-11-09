import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  RANDOM_POLICY,
  runRandomWorld,
  validateParameters,
} from '../apps/simulator/src/random-run.js';
import {
  analyzeRun,
  experimentChart,
  experimentReport,
} from './experiment-analysis.js';

import {
  ROUND_SCHEDULE,
  SYNCHRONOUS_POLICY,
  runSynchronousWorld,
} from '../apps/simulator/src/synchronous-run.js';
import {
  analyzeSynchronousRun,
  synchronousReport,
  synchronousChart,
} from './synchronous-analysis.js';
import { measureSurvival, SURVIVAL_POLICY } from './survival-analysis.js';

export const EXPERIMENT_SCENES = [
  'initial',
  'midpoint',
  'final',
  'overview',
] as const;
export function experimentFiles(
  manifest: Record<string, unknown>,
): readonly string[] {
  return manifest.version === 3
    ? [...EXPERIMENT_FILES, 'model-calls.json']
    : EXPERIMENT_FILES;
}
export const EXPERIMENT_FILES = [
  'replay.json',
  'results.json',
  'report.md',
  'overview.svg',
  'browser.json',
  ...EXPERIMENT_SCENES.map((scene) => `${scene}.png`),
] as const;
export const EXPERIMENT_OBJECTIVE =
  'Check whether the founding world runs normally under bounded random actions without an external agent or model, and preserve reproducible results and visual evidence.';
export const BROWSER_ASSERTIONS = [
  'replay-import',
  'initial-midpoint-final-state',
  'all-agent-positions-and-inventories',
  'historical-controls-disabled',
  'playback-and-export-invariance',
  'layout-and-runtime-health',
  'visuals-decode',
] as const;

export function jsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an experiment JSON object.');
  return value as Record<string, unknown>;
}
export function readExperimentJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}
export function writeExperimentJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
export function digest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
export function experimentId(id: string): void {
  if (!/^ex[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id.slice(2))))
    throw new Error('Experiment IDs must be ex1, ex2, and so on.');
}
export function experimentIds(root: string): string[] {
  const directory = resolve(root, 'experiment');
  if (!existsSync(directory)) return [];
  if (!lstatSync(directory).isDirectory())
    throw new Error('experiment must be a real directory.');
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.name === 'README.md' && entry.isFile()) return [];
      // Behavioral reviews are companions, never additional numbered runs.
      if (entry.name === 'analyses' && entry.isDirectory()) return [];
      experimentId(entry.name);
      if (!entry.isDirectory())
        throw new Error(`Expected experiment directory: ${entry.name}`);
      return [entry.name];
    })
    .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
}
/** mkdir is exclusive: a competing process or existing run can never be overwritten. */
export function allocateExperiment(root: string): string {
  const ids = experimentIds(root);
  const id = `ex${String(Number(ids.at(-1)?.slice(2) ?? 0) + 1)}`;
  experimentId(id);
  mkdirSync(resolve(root, 'experiment'), { recursive: true });
  mkdirSync(resolve(root, 'experiment', id));
  return id;
}

export interface ExperimentConfig {
  readonly id: string;
  readonly objective: string;
  readonly seed?: number;
  readonly steps: number;
  readonly schedule?: typeof ROUND_SCHEDULE | 'survival-v1';
  readonly totalActions?: number;
}

export function measureSynchronous(
  id: string,
  objective: string,
  seed: number,
  rounds: number,
) {
  const run = runSynchronousWorld(seed, rounds);
  const results = analyzeSynchronousRun(run);
  return {
    run,
    results,
    report: synchronousReport(id, objective, seed, results),
    chart: synchronousChart(id, run, results),
  };
}
function measureLegacy(
  id: string,
  objective: string,
  seed: number,
  steps: number,
) {
  const run = runRandomWorld(seed, steps);
  const results = analyzeRun(run);
  return {
    run,
    results,
    report: experimentReport(id, objective, seed, results),
    chart: experimentChart(id, run, results),
  };
}

export function readExperiment(root: string, id: string, pending = false) {
  experimentId(id);
  const directory = resolve(root, 'experiment', id);
  if (!lstatSync(directory).isDirectory())
    throw new Error('Experiment directory cannot be a symlink.');
  const manifestPath = resolve(directory, 'manifest.json');
  if (
    !lstatSync(manifestPath).isFile() ||
    lstatSync(manifestPath).size > 2_000_000
  )
    throw new Error('Invalid experiment manifest file.');
  const manifest = jsonObject(readExperimentJson(manifestPath));
  const files = experimentFiles(manifest);
  const required = pending
    ? [
        'manifest.json',
        'replay.json',
        'results.json',
        'report.md',
        'overview.svg',
        ...(manifest.version === 3 ? ['model-calls.json'] : []),
      ]
    : ['manifest.json', ...files];
  for (const file of required) {
    const path = resolve(directory, file);
    if (!lstatSync(path).isFile() || lstatSync(path).size > 2_000_000)
      throw new Error(`Missing, oversized or non-file artifact: ${id}/${file}`);
  }
  if (
    manifest.format !== 'self-evolving-world/experiment' ||
    !(
      (manifest.version === 1 &&
        manifest.policy === RANDOM_POLICY &&
        manifest.schedule === undefined) ||
      (manifest.version === 2 &&
        manifest.policy === SYNCHRONOUS_POLICY &&
        manifest.schedule === ROUND_SCHEDULE) ||
      (manifest.version === 3 &&
        manifest.policy === SURVIVAL_POLICY &&
        manifest.schedule === 'survival-v1')
    ) ||
    manifest.id !== id ||
    (manifest.version === 3
      ? manifest.controller !== 'chatgpt-plan' ||
        typeof manifest.externalModelCalls !== 'number' ||
        manifest.externalModelCalls < 3 ||
        manifest.externalModelCalls > 15
      : manifest.controller !== 'seeded-random' ||
        manifest.externalModelCalls !== 0)
  )
    throw new Error(`Invalid experiment identity or policy: ${id}`);
  if (
    manifest.status !== 'completed' &&
    !(
      pending &&
      (manifest.status === 'running' || manifest.status === 'failed')
    )
  )
    throw new Error(`Experiment did not complete: ${id}`);
  const { objective, seed, steps } = manifest;
  if (
    typeof objective !== 'string' ||
    objective.trim().length < 20 ||
    objective.length > 1000 ||
    /[\r\n]/.test(objective)
  )
    throw new Error(
      'Experiment objective must be a single paragraph of 20-1000 characters.',
    );
  if (
    typeof steps !== 'number' ||
    (manifest.version === 3
      ? seed !== undefined || steps !== 60
      : typeof seed !== 'number')
  )
    throw new Error('Missing numeric experiment parameters.');
  if (typeof seed === 'number') validateParameters(seed, steps);
  const provenance = jsonObject(manifest.provenance);
  if (
    typeof provenance.revision !== 'string' ||
    !/^[a-f\d]{40}$/.test(provenance.revision) ||
    typeof provenance.dirty !== 'boolean' ||
    typeof provenance.node !== 'string' ||
    typeof provenance.platform !== 'string' ||
    typeof manifest.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(manifest.createdAt))
  )
    throw new Error('Missing experiment provenance.');
  const measurement =
    manifest.version === 3
      ? measureSurvival(
          id,
          objective,
          readExperimentJson(resolve(directory, 'replay.json')),
          readExperimentJson(resolve(directory, 'model-calls.json')),
        )
      : manifest.version === 2
        ? measureSynchronous(id, objective, Number(seed), steps)
        : measureLegacy(id, objective, Number(seed), steps);
  const { run, results, report, chart } = measurement;
  if (manifest.externalModelCalls !== results.externalModelCalls)
    throw new Error('Model call count disagrees with evidence.');
  for (const [file, expected] of [
    ['replay.json', run.replay],
    ['results.json', results],
  ] as const) {
    if (
      !isDeepStrictEqual(readExperimentJson(resolve(directory, file)), expected)
    )
      throw new Error(
        `Experiment does not match seeded reconstruction: ${id}/${file}`,
      );
  }
  if (readFileSync(resolve(directory, 'report.md'), 'utf8') !== report)
    throw new Error(`Report disagrees with measured results: ${id}`);
  if (readFileSync(resolve(directory, 'overview.svg'), 'utf8') !== chart)
    throw new Error(`Chart disagrees with measured results: ${id}`);
  if (!pending) {
    const entries = readdirSync(directory).sort();
    if (!isDeepStrictEqual(entries, [...required].sort()))
      throw new Error(`Unexpected experiment artifacts: ${id}`);
    const hashes = jsonObject(manifest.artifacts);
    if (!isDeepStrictEqual(Object.keys(hashes).sort(), [...files].sort()))
      throw new Error(`Incomplete artifact manifest: ${id}`);
    for (const file of files) {
      if (hashes[file] !== digest(resolve(directory, file)))
        throw new Error(`Artifact hash mismatch: ${id}/${file}`);
    }
    for (const scene of EXPERIMENT_SCENES) {
      const png = readFileSync(resolve(directory, `${scene}.png`));
      if (
        png.length < 1000 ||
        !png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
        png.readUInt32BE(16) < 100 ||
        png.readUInt32BE(20) < 100
      )
        throw new Error(`Invalid PNG visualization: ${id}/${scene}`);
    }
    const browser = jsonObject(
      readExperimentJson(resolve(directory, 'browser.json')),
    );
    if (
      browser.status !== 'passed' ||
      browser.id !== id ||
      browser.replayHash !== digest(resolve(directory, 'replay.json')) ||
      !isDeepStrictEqual(browser.frameTicks, [
        0,
        Math.floor(steps / 2),
        steps,
      ]) ||
      !isDeepStrictEqual(browser.assertions, BROWSER_ASSERTIONS) ||
      !isDeepStrictEqual(browser.errors, [])
    )
      throw new Error(`Missing or failed browser checks: ${id}`);
  }
  return {
    directory,
    manifest,
    config: {
      id,
      objective,
      ...(typeof seed === 'number' ? { seed } : {}),
      steps,
      ...(manifest.version === 2 || manifest.version === 3
        ? {
            schedule:
              manifest.version === 3
                ? ('survival-v1' as const)
                : ROUND_SCHEDULE,
            totalActions: steps * (run.frames[0]?.agents.length ?? 0),
          }
        : {}),
    },
    run,
    results,
  };
}

export function checkExperiments(root: string): string[] {
  const ids = experimentIds(root);
  for (const id of ids) readExperiment(root, id);
  return ids;
}
