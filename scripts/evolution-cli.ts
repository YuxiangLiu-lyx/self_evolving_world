import { evolutionSmoke } from './evolution-smoke.js';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { accessToken } from '../apps/simulator/src/chatgpt-auth.js';
import { selectModel } from '../apps/simulator/src/responses.js';
import { evolutionProvider } from '../apps/simulator/src/evolution-provider.js';
import {
  continueEvolutionExecution,
  newEvolutionExecution,
} from '../apps/simulator/src/evolution-run.js';
import type { EvolutionExecution } from '../apps/simulator/src/evolution-run.js';
import { EVOLUTION_OBJECTIVE } from '../apps/simulator/src/evolution-scenario.js';
import { requireTaskWorker } from './task-worker.js';
import {
  allocateExperiment,
  checkExperiments,
  readExperimentJson,
} from './experiments.js';
import {
  evolutionCallArchive,
  EVOLUTION_POLICY,
  measureEvolution,
  readEvolutionExecution,
} from './evolution-analysis.js';
import { learningEngineHash as evolutionEngineHash } from './learning-files.js';

const root = process.cwd();
export function atomicJson(path: string, value: unknown): void {
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n');
  renameSync(`${path}.tmp`, path);
}
try {
  const context = requireTaskWorker(
    root,
    'evolution',
    process.argv.slice(2).filter((a) => a !== '--'),
  );
  if (!context.experiment) throw new Error('Missing experiment journal.');
  let id = context.experiment.id,
    token: string | undefined,
    state: EvolutionExecution;
  const codeHash = evolutionEngineHash(root);
  if (!id) {
    checkExperiments(root);
    const smoke = evolutionSmoke();
    token = await accessToken();
    const model = await selectModel(token);
    id = allocateExperiment(root);
    context.experiment.id = id;
    atomicJson(
      resolve(root, 'validation-results/tasks', `${context.intent.id}.json`),
      context,
    );
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    atomicJson(resolve(root, 'experiment', id, 'manifest.json'), {
      format: 'self-evolving-world/experiment',
      version: 5,
      id,
      objective: EVOLUTION_OBJECTIVE,
      steps: 120,
      schedule: 'evolution-v1',
      policy: EVOLUTION_POLICY,
      controller: 'chatgpt-plan',
      externalModelCalls: 0,
      createdAt: new Date().toISOString(),
      status: 'running',
      provenance: {
        revision: git('rev-parse', 'HEAD'),
        dirty: git('status', '--porcelain') !== '',
        node: process.version,
        platform: process.platform,
        engineHash: codeHash,
      },
    });
    atomicJson(resolve(root, 'experiment', id, 'smoke.json'), smoke);
    state = newEvolutionExecution(model, 'chatgpt-plan');
    atomicJson(resolve(root, 'experiment', id, 'execution.json'), state);
  } else {
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'experiment', id, 'manifest.json'), 'utf8'),
    ) as {
      version?: unknown;
      status?: unknown;
      provenance?: { engineHash?: unknown };
    };
    if (
      manifest.version !== 5 ||
      manifest.status === 'completed' ||
      manifest.provenance?.engineHash !== codeHash
    )
      throw new Error(
        'Evolution continuation requires the same saved protocol/source and an unfinished archive.',
      );
    state = readEvolutionExecution(
      readExperimentJson(resolve(root, 'experiment', id, 'execution.json')),
    );
  }
  const directory = resolve(root, 'experiment', id),
    manifestPath = resolve(directory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
    string,
    unknown
  >;
  const save = (s: EvolutionExecution): Promise<void> => {
    atomicJson(resolve(directory, 'execution.json'), s);
    atomicJson(resolve(directory, 'model-calls.json'), evolutionCallArchive(s));
    atomicJson(manifestPath, {
      ...manifest,
      status: 'running',
      externalModelCalls: s.attempts.length,
    });
    console.log(
      `${id}: round ${String(s.rounds.length)}/120, ${String(s.attempts.length)} attempted calls, ${s.phase}; last ${s.attempts.at(-1)?.status ?? 'none'}`,
    );
    return Promise.resolve();
  };
  if (state.phase !== 'development' && state.phase !== 'completed') {
    if (state.attempts.some((a) => a.status === 'started'))
      throw new Error(
        'Uncertain interrupted call; inspect the retained attempt without repeating inference.',
      );
    token ??= await accessToken();
    state = await continueEvolutionExecution(
      state,
      evolutionProvider(token, state.model),
      save,
    );
  }
  if (state.phase === 'completed') {
    const calls = evolutionCallArchive(state),
      measured = measureEvolution(id, EVOLUTION_OBJECTIVE, state, calls);
    atomicJson(resolve(directory, 'model-calls.json'), calls);
    atomicJson(resolve(directory, 'replay.json'), measured.run.replay);
    atomicJson(resolve(directory, 'skills.json'), {
      resources: measured.run.frames.at(-1)?.evolution?.types,
      ecology: measured.run.frames.at(-1)?.evolution?.ecology,
      mechanics: measured.run.frames.at(-1)?.evolution?.mechanics,
      skills: measured.run.frames.at(-1)?.evolution?.skills,
    });
    atomicJson(resolve(directory, 'results.json'), measured.results);
    writeFileSync(resolve(directory, 'report.md'), measured.report);
    writeFileSync(resolve(directory, 'overview.svg'), measured.chart);
    console.log(
      `${id}: simulation finished; the coordinator must capture, analyze and validate the saved record.`,
    );
  } else if (state.phase === 'development')
    console.log(
      JSON.stringify({
        status: 'needs_development',
        experiment: id,
        barrier: state.barrier,
        schema: 'apps/simulator/src/evolution-run.ts#acceptDevelopment',
      }),
    );
} catch (error) {
  // The checkpoint remains authoritative; never delete a partial record or reissue uncertain calls.
  console.error(
    error instanceof Error ? error.message : 'Evolution experiment failed.',
  );
  process.exitCode = 1;
}
