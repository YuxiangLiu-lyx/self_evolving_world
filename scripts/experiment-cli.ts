import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_SEED,
  validateParameters,
} from '../apps/simulator/src/random-run.js';
import {
  DEFAULT_ROUNDS,
  SYNCHRONOUS_POLICY,
  ROUND_SCHEDULE,
  SYNCHRONOUS_OBJECTIVE,
} from '../apps/simulator/src/synchronous-run.js';
import {
  allocateExperiment,
  checkExperiments,
  digest,
  experimentFiles,
  measureSynchronous,
  readExperiment,
  writeExperimentJson,
} from './experiments.js';

const root = process.cwd();
const [command, ...args] = process.argv.slice(2).filter((arg) => arg !== '--');
function run(command: string, args: string[], env = process.env): void {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed.`);
}
function captureRecord(id: string, manifest: Record<string, unknown>): void {
  const directory = resolve(root, 'experiment', id);
  const path = resolve(directory, 'manifest.json');
  try {
    // Additional capture only; never a substitute for final full validation.
    run('pnpm', ['exec', 'playwright', 'test', 'experiments.spec.ts'], {
      ...process.env,
      WORLD_EXPERIMENT_CAPTURE: id,
    });
    writeExperimentJson(path, {
      ...manifest,
      status: 'completed',
      artifacts: Object.fromEntries(
        experimentFiles(manifest).map((file) => [
          file,
          digest(resolve(directory, file)),
        ]),
      ),
    });
    readExperiment(root, id);
  } catch (error) {
    writeExperimentJson(path, {
      ...manifest,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
try {
  if (command === 'check' && args.length === 0) {
    const ids = checkExperiments(root);
    console.log(
      `Experiment artifacts passed: ${ids.join(', ') || 'no recorded experiments'}.`,
    );
  } else if (command === 'resume' && args.length === 1 && args[0]) {
    const { directory, manifest } = readExperiment(root, args[0], true);
    if (manifest.status === 'completed')
      throw new Error('Completed experiments cannot be overwritten.');
    run('pnpm', ['build']);
    const previousFailures: readonly unknown[] = Array.isArray(
      manifest.captureFailures,
    )
      ? manifest.captureFailures
      : [];
    const resumed: Record<string, unknown> = {
      ...manifest,
      status: 'running',
      captureFailures: [
        ...previousFailures,
        ...(typeof manifest.error === 'string' ? [manifest.error] : []),
      ],
    };
    delete resumed.error;
    writeExperimentJson(resolve(directory, 'manifest.json'), resumed);
    captureRecord(args[0], resumed);
    console.log(
      `Completed visual evidence for ${args[0]}; the saved simulation was preserved.`,
    );
  } else if (command === 'run' && args.length <= 2) {
    const seed = args[0] === undefined ? DEFAULT_SEED : Number(args[0]);
    const steps = args[1] === undefined ? DEFAULT_ROUNDS : Number(args[1]);
    validateParameters(seed, steps);
    checkExperiments(root);
    run('pnpm', ['build']);
    const id = allocateExperiment(root);
    const directory = resolve(root, 'experiment', id);
    const git = (...parts: string[]): string =>
      execFileSync('git', parts, { cwd: root, encoding: 'utf8' }).trim();
    const manifest = {
      format: 'self-evolving-world/experiment',
      version: 2,
      id,
      objective: SYNCHRONOUS_OBJECTIVE,
      seed,
      steps,
      policy: SYNCHRONOUS_POLICY,
      schedule: ROUND_SCHEDULE,
      controller: 'seeded-random',
      externalModelCalls: 0,
      createdAt: new Date().toISOString(),
      provenance: {
        revision: git('rev-parse', 'HEAD'),
        dirty: git('status', '--porcelain') !== '',
        node: process.version,
        platform: process.platform,
      },
    };
    const manifestPath = resolve(directory, 'manifest.json');
    writeExperimentJson(manifestPath, { ...manifest, status: 'running' });
    try {
      const {
        run: simulation,
        results,
        report,
        chart,
      } = measureSynchronous(id, manifest.objective, seed, steps);
      writeExperimentJson(resolve(directory, 'replay.json'), simulation.replay);
      writeExperimentJson(resolve(directory, 'results.json'), results);
      writeFileSync(resolve(directory, 'report.md'), report);
      writeFileSync(resolve(directory, 'overview.svg'), chart);
      captureRecord(id, manifest);
      console.log(
        `Saved ${id}: ${String(steps)} rounds / ${String(results.totalActions)} actions, ${String(results.framesChecked)} checked snapshots, ${String(results.invariantFailures)} invariant failures. Read experiment/${id}/report.md, then run full task validation and review.`,
      );
    } catch (error) {
      writeExperimentJson(manifestPath, {
        ...manifest,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  } else
    throw new Error(
      'Usage: pnpm experiment:run -- [seed] [rounds] / pnpm experiment:resume -- exN / pnpm experiment:check',
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
