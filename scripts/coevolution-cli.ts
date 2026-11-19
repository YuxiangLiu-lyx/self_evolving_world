import { coevolutionPreflight } from './coevolution-preflight.js';
import { COEVOLUTION_CONFIG } from '@self-evolving-world/world-core';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { accessToken } from '../apps/simulator/src/chatgpt-auth.js';
import { selectModel } from '../apps/simulator/src/responses.js';
import { coevolutionProvider } from '../apps/simulator/src/coevolution-provider.js';
import {
  continueCoevolutionExecution,
  newCoevolutionExecution,
} from '../apps/simulator/src/coevolution-run.js';
import type { CoevolutionExecution } from '../apps/simulator/src/coevolution-run.js';
import { COEVOLUTION_OBJECTIVE } from '../apps/simulator/src/coevolution-scenario.js';
import { requireTaskWorker } from './task-worker.js';
import {
  allocateExperiment,
  checkExperiments,
  readExperimentJson,
} from './experiments.js';
import {
  coevolutionCallArchive,
  COEVOLUTION_POLICY,
  measureCoevolution,
  readCoevolutionExecution,
  coevolutionRegistry,
} from './coevolution-analysis.js';
import { learningEngineHash as coevolutionEngineHash } from './learning-files.js';
import {
  readSourceHistory,
  sourceRevision,
  saveSourceHistory,
  collectSourceArtifacts,
} from './coevolution-source.js';

const root = process.cwd();
export function atomicJson(path: string, value: unknown): void {
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n');
  renameSync(`${path}.tmp`, path);
}
try {
  const context = requireTaskWorker(
    root,
    'coevolution',
    process.argv.slice(2).filter((a) => a !== '--'),
  );
  if (!context.experiment) throw new Error('Missing experiment journal.');
  let id = context.experiment.id,
    token: string | undefined,
    state: CoevolutionExecution;
  const codeHash = coevolutionEngineHash(root);
  if (!id) {
    checkExperiments(root);
    const smoke = coevolutionPreflight();
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
      version: 6,
      id,
      objective: COEVOLUTION_OBJECTIVE,
      steps: 180,
      schedule: 'coevolution-v1',
      policy: COEVOLUTION_POLICY,
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
    atomicJson(resolve(root, 'experiment', id, 'preflight.json'), smoke);
    atomicJson(
      resolve(root, 'experiment', id, 'configuration.json'),
      COEVOLUTION_CONFIG,
    );
    state = newCoevolutionExecution(model, 'chatgpt-plan');
    saveSourceHistory(root, id, [
      sourceRevision(
        root,
        state,
        'Initial frozen engine; no world extension has been applied.',
      ),
    ]);
    atomicJson(resolve(root, 'experiment', id, 'execution.json'), state);
  } else {
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'experiment', id, 'manifest.json'), 'utf8'),
    ) as {
      version?: unknown;
      status?: unknown;
      provenance?: { engineHash?: unknown };
    };
    if (manifest.version !== 6 || manifest.status === 'completed')
      throw new Error(
        'Coevolution continuation requires the same saved protocol/source and an unfinished archive.',
      );
    state = readCoevolutionExecution(
      readExperimentJson(resolve(root, 'experiment', id, 'execution.json')),
    );
    if (readSourceHistory(root, id, state).at(-1)?.engineHash !== codeHash)
      throw new Error(
        'Source changes require a validated versioned development handoff before continuation.',
      );
  }
  const directory = resolve(root, 'experiment', id),
    manifestPath = resolve(directory, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
    string,
    unknown
  >;
  const save = (s: CoevolutionExecution): Promise<void> => {
    atomicJson(resolve(directory, 'execution.json'), s);
    atomicJson(
      resolve(directory, 'model-calls.json'),
      coevolutionCallArchive(s),
    );
    atomicJson(manifestPath, {
      ...manifest,
      status: 'running',
      externalModelCalls: s.attempts.length,
      sourceArtifacts: collectSourceArtifacts(directory),
      steps: ['completed', 'paused'].includes(s.phase) ? s.rounds.length : 180,
    });
    console.log(
      `${id}: round ${String(s.rounds.length)}/180, ${String(s.attempts.length)} attempted calls, ${s.phase}; last ${s.attempts.at(-1)?.status ?? 'none'}`,
    );
    atomicJson(resolve(directory, 'checkpoints.json'), s.checkpoints);
    atomicJson(
      resolve(directory, 'stages.json'),
      s.checkpoints.map((c) => ({
        tick: c.tick,
        ...c.report,
        projects: c.projects,
      })),
    );
    return Promise.resolve();
  };
  if (state.phase === 'running') {
    if (state.attempts.some((a) => a.status === 'started'))
      throw new Error(
        'Uncertain interrupted call; inspect the retained attempt without repeating inference.',
      );
    token ??= await accessToken();
    state = await continueCoevolutionExecution(
      state,
      coevolutionProvider(token, state.model),
      save,
    );
  }
  if (state.phase === 'completed' || state.phase === 'paused') {
    await save(state);
    const calls = coevolutionCallArchive(state),
      measured = measureCoevolution(id, COEVOLUTION_OBJECTIVE, state, calls);
    atomicJson(resolve(directory, 'model-calls.json'), calls);
    atomicJson(resolve(directory, 'replay.json'), measured.run.replay);
    atomicJson(resolve(directory, 'skills.json'), coevolutionRegistry(state));
    atomicJson(resolve(directory, 'results.json'), measured.results);
    writeFileSync(resolve(directory, 'report.md'), measured.report);
    writeFileSync(resolve(directory, 'overview.svg'), measured.chart);
    console.log(
      `${id}: observation saved (${state.phase}); the coordinator must capture, analyze and validate the saved record.`,
    );
  } else if (state.phase === 'development')
    console.log(
      JSON.stringify({
        status: 'needs_development',
        experiment: id,
        barrier: state.barrier,
        schema: 'apps/simulator/src/coevolution-run.ts#acceptCDevelopment',
      }),
    );
} catch (error) {
  // The checkpoint remains authoritative; never delete a partial record or reissue uncertain calls.
  console.error(
    error instanceof Error ? error.message : 'Coevolution experiment failed.',
  );
  process.exitCode = 1;
}
