import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { accessToken } from '../apps/simulator/src/chatgpt-auth.js';
import { selectModel } from '../apps/simulator/src/responses.js';
import { programProvider } from '../apps/simulator/src/program-provider.js';
import {
  runSurvivalPrograms,
  SURVIVAL_OBJECTIVE,
} from '../apps/simulator/src/survival-run.js';
import { serializeReplay } from '../apps/viewer/src/timeline.js';
import {
  allocateExperiment,
  checkExperiments,
  writeExperimentJson,
} from './experiments.js';
import {
  measureSurvival,
  modelCallArchive,
  SURVIVAL_POLICY,
} from './survival-analysis.js';

const root = process.cwd();
try {
  if (process.argv.slice(2).filter((a) => a !== '--').length !== 0)
    throw new Error(
      'Usage: pnpm experiment:survival. Fixed protocol: 60 rounds, five calls per actor maximum.',
    );
  checkExperiments(root);
  const token = await accessToken();
  const model = await selectModel(token);
  const id = allocateExperiment(root),
    directory = resolve(root, 'experiment', id);
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const manifest = {
    format: 'self-evolving-world/experiment',
    version: 3,
    id,
    objective: SURVIVAL_OBJECTIVE,
    steps: 60,
    schedule: 'survival-v1',
    policy: SURVIVAL_POLICY,
    controller: 'chatgpt-plan',
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
  let attemptCount = 0;
  try {
    const { run, attempts } = await runSurvivalPrograms(
      programProvider(token, model),
      async (attempts, run) => {
        attemptCount = attempts.length;
        writeExperimentJson(
          resolve(directory, 'model-calls.json'),
          modelCallArchive(model, attempts),
        );
        writeFileSync(
          resolve(directory, 'replay.json'),
          serializeReplay({
            schedule: 'survival-v1',
            frames: run.frames,
            programs: run.programs,
          }) + '\n',
        );
        writeExperimentJson(manifestPath, {
          ...manifest,
          status: 'running',
          externalModelCalls: attemptCount,
        });
        const last = attempts.at(-1);
        if (last && run.frames.length - 1 === last.tick)
          console.log(
            `${id}: ${last.agentId} call ${String(last.call)}/5 at round ${String(last.tick)}: ${last.status}`,
          );
        await Promise.resolve();
      },
    );
    const replay: unknown = JSON.parse(
      serializeReplay({
        schedule: 'survival-v1',
        frames: run.frames,
        programs: run.programs,
      }),
    );
    const measured = measureSurvival(
      id,
      manifest.objective,
      replay,
      modelCallArchive(model, attempts),
    );
    writeExperimentJson(resolve(directory, 'results.json'), measured.results);
    writeFileSync(resolve(directory, 'report.md'), measured.report);
    writeFileSync(resolve(directory, 'overview.svg'), measured.chart);
    // Capture resumption cannot invoke inference; it only completes saved visual evidence.
    const captured = spawnSync('pnpm', ['experiment:resume', '--', id], {
      cwd: root,
      stdio: 'inherit',
    });
    if (captured.error) throw captured.error;
    if (captured.status !== 0)
      throw new Error(
        'Saved simulation needs visual capture repair; never repeat inference in this archive.',
      );
    console.log(
      `${id}: ${String(attemptCount)} attempted calls, ${String(measured.results.survivors)} survivors. Full task validation and review still required.`,
    );
  } catch (error) {
    writeExperimentJson(manifestPath, {
      ...manifest,
      status: 'failed',
      externalModelCalls: attemptCount,
      error:
        error instanceof Error ? error.message : 'Survival experiment failed.',
    });
    throw error;
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Survival experiment failed.',
  );
  process.exitCode = 1;
}
