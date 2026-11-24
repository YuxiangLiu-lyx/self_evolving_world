import {
  initialLongWorld,
  LONG_SCENARIOS,
  longObjective,
} from '../apps/simulator/src/long-scenario.js';
import type { LongScenario } from '../apps/simulator/src/long-scenario.js';
import { longPreflight } from './long-preflight.js';
import { OPEN_OBJECTIVE } from './open-analysis.js';
import {
  initialCollectiveWorld,
  collectivePhysicalGenesis,
  COLLECTIVE_OBJECTIVE,
} from '../apps/simulator/src/collective-scenario.js';
import { renewableAccessToken } from '../apps/simulator/src/chatgpt-renewal.js';
import { prepareContinuousWindow } from './continuous-window.js';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { initialOpenWorld } from '../apps/simulator/src/open-scenario.js';
import { openPreflight } from './open-preflight.js';
import type { V7World } from '@self-evolving-world/world-core';
import { selectModel } from '../apps/simulator/src/responses.js';
import { continuousProvider } from '../apps/simulator/src/continuous-provider.js';
import {
  continueContinuousExecution,
  newContinuousExecution,
  issueContinuousDevelopment,
} from '../apps/simulator/src/continuous-run.js';
import type { V7Execution } from '../apps/simulator/src/continuous-run.js';
import { repairContinuousRun } from './continuous-repair.js';
import { allocateExperiment, checkExperiments } from './experiments.js';
import {
  continuousAtomic,
  continuousRead,
  continuousSink,
  buildContinuousReplay,
  reconstructContinuousSegment,
  continuousArchivePaths,
  continuousHash,
} from './continuous-store.js';
import type { V7ReplaySegment } from './continuous-store.js';
import {
  continuousCheckpoint,
  submitContinuousDevelopment,
} from './continuous-files.js';
import {
  saveContinuousSource,
  captureContinuousBaseline,
} from './continuous-source.js';
import {
  measureContinuous,
  continuousChart,
  continuousReport,
} from './continuous-analysis.js';

const USAGE = `Usage:
  pnpm experiment:continuous -- new open|long|long-fixes|collective-a
  pnpm experiment:continuous -- new collective-b exA
  pnpm experiment:continuous -- continue exN
  pnpm experiment:continuous -- develop exN validation-results/development.json
  pnpm experiment:continuous -- extend exN rounds
  pnpm experiment:continuous -- repair exN [--abandoned-pid PID]`;

const root = process.cwd();
const [command, target, extra, ...rest] = process.argv
  .slice(2)
  .filter((a) => a !== '--');
try {
  let id: string, state: V7Execution, token: string | undefined;
  if (command === 'new') {
    const scenario = target;
    if (
      !['open', ...LONG_SCENARIOS, 'collective-a', 'collective-b'].includes(
        scenario ?? '',
      ) ||
      (scenario === 'collective-b'
        ? !/^ex[1-9]\d*$/.test(extra ?? '')
        : extra) ||
      rest.length
    )
      throw new Error(USAGE);
    checkExperiments(root);
    const comparison = scenario?.startsWith('collective-') ?? false;
    const long: LongScenario | undefined = LONG_SCENARIOS.find(
      (s) => s === scenario,
    );
    const arm = scenario === 'collective-a' ? 'A' : 'B';
    const genesis = comparison
      ? initialCollectiveWorld('collective-preflight', arm)
      : long
        ? initialLongWorld('long-preflight', long)
        : initialOpenWorld();
    const physicalHash = comparison
      ? continuousHash(collectivePhysicalGenesis(genesis))
      : null;
    let preflight: {
      baseline: ReturnType<typeof openPreflight>;
      physicalHash?: string;
      reusedFrom?: string;
      stationary?: ReturnType<typeof longPreflight>;
    };
    if (scenario === 'collective-b' && extra) {
      const prior = continuousRead<typeof preflight>(
        resolve(root, 'experiment', extra, 'preflight.json'),
      );
      const priorWorld = continuousRead<V7World>(
        resolve(root, 'experiment', extra, 'initial.json'),
      );
      if (
        prior.physicalHash !== physicalHash ||
        continuousHash(collectivePhysicalGenesis(priorWorld)) !==
          physicalHash ||
        prior.baseline.rounds !== 1600
      )
        throw new Error(
          'The second arm must preserve the actually preflighted physical baseline.',
        );
      preflight = { ...prior, reusedFrom: extra };
    } else
      preflight = {
        baseline: openPreflight(1600, genesis),
        ...(long ? { stationary: longPreflight(genesis) } : {}),
        ...(physicalHash ? { physicalHash } : {}),
      };
    token = await renewableAccessToken();
    const model = await selectModel(token, 'gpt-6.1-sol');
    id = allocateExperiment(root);
    const directory = resolve(root, 'experiment', id),
      git = (...args: string[]) =>
        execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    state = newContinuousExecution(
      model,
      'chatgpt-plan',
      comparison
        ? initialCollectiveWorld(`collective-${id}`, arm)
        : long
          ? initialLongWorld(`long-${id}`, long)
          : initialOpenWorld(`open-${id}`),
    );
    if (comparison) state.windowTarget = 200;
    continuousAtomic(resolve(directory, 'manifest.json'), {
      format: 'self-evolving-world/experiment',
      version: 7,
      id,
      objective: comparison
        ? COLLECTIVE_OBJECTIVE
        : state.world.config.longDevelopment
          ? longObjective(state.world.config.longDevelopment)
          : OPEN_OBJECTIVE,
      schedule: 'continuous-v1',
      controller: 'chatgpt-plan',
      steps: 0,
      targetWindow: state.windowTarget,
      status: 'running',
      externalModelCalls: 0,
      createdAt: new Date().toISOString(),
      provenance: {
        revision: git('rev-parse', 'HEAD'),
        dirty: git('status', '--porcelain') !== '',
        node: process.version,
        platform: process.platform,
      },
      files: [],
    });
    continuousAtomic(
      resolve(directory, 'configuration.json'),
      state.world.config,
    );
    continuousAtomic(resolve(directory, 'preflight.json'), preflight);
    continuousAtomic(resolve(directory, 'initial.json'), state.world);
    continuousAtomic(resolve(directory, 'execution.json'), state);
    saveContinuousSource(
      root,
      id,
      state,
      'Initial open-development-v1 fresh policy, inheritSkills=false, with only the explicit authored baseline. No historical generated skills, objects, rewards or mastery. Offline policies and composition fixtures are excluded from ordinary inputs.',
    );
    console.log(`Allocated ${id} (${scenario ?? ''}).`);
  } else {
    if (!target || !/^ex[1-9]\d*$/.test(target)) throw new Error(USAGE);
    id = target;
    if (command === 'continue' && !extra) {
      // Resume the saved checkpoint; uncertain calls are never resent.
    } else if (command === 'develop' && extra && !rest.length)
      submitContinuousDevelopment(
        root,
        id,
        continuousRead<unknown>(resolve(root, extra)),
      );
    else if (command === 'extend' && extra && !rest.length) {
      const rounds = Number(extra);
      if (!Number.isSafeInteger(rounds) || rounds < 1) throw new Error(USAGE);
      prepareContinuousWindow(root, id, rounds);
    } else if (
      command === 'repair' &&
      (extra === undefined ||
        (extra === '--abandoned-pid' && rest.length === 1))
    ) {
      await repairContinuousRun(
        root,
        id,
        rest[0] === undefined ? undefined : Number(rest[0]),
      );
      console.log(
        `${id}: technical pause retained; submit the counted development handoff with develop.`,
      );
    } else throw new Error(USAGE);
    state = continuousCheckpoint(root, id);
  }
  const directory = resolve(root, 'experiment', id),
    sink = continuousSink(root, id),
    manifestPath = resolve(directory, 'manifest.json');
  const manifest = continuousRead<Record<string, unknown>>(manifestPath);
  if (manifest.status === 'completed')
    throw new Error(
      'A captured observation window cannot be overwritten; continuation requires an explicitly preserved new window.',
    );
  if (
    state.phase === 'development' &&
    state.developments.find((a) => a.id === state.barrier?.developmentAttempt)
      ?.status === 'failed'
  ) {
    await issueContinuousDevelopment(state, sink);
  }
  if (state.phase === 'running' || state.pendingCall) {
    token ??= await renewableAccessToken();
    state = await continueContinuousExecution(
      state,
      continuousProvider(renewableAccessToken, state.model),
      sink,
    );
  }
  await sink.save(state);
  continuousAtomic(manifestPath, {
    ...manifest,
    steps: state.world.tick,
    externalModelCalls: state.attempts.length,
    windowPhase: state.phase,
  });
  if (state.phase === 'development') {
    captureContinuousBaseline(root, id, state);
    console.log(
      JSON.stringify({
        status: 'needs_development',
        experiment: id,
        barrier: state.barrier,
        budget: state.world.config.budgets,
        attempts: state.developments,
        declaration: {
          developer: 'current-claude-conversation',
          packages: ['package-id@version'],
          paths: ['Every changed source or visual path'],
          assignments: { requester: 'implemented-interface' },
          review:
            'Concrete implementation, geometry, costs, duration, happiness, dependencies, migration and visual review.',
        },
      }),
    );
  }
  if (['paused', 'window-complete'].includes(state.phase)) {
    const initial = continuousRead<V7World>(resolve(directory, 'initial.json')),
      index = buildContinuousReplay(root, id, initial, state),
      frames: V7World[] = [],
      rounds: V7ReplaySegment['rounds'] = [];
    for (const part of index.segments) {
      const segment = continuousRead<V7ReplaySegment>(
          resolve(directory, part.path),
        ),
        values = reconstructContinuousSegment(segment);
      frames.push(...(frames.length ? values.slice(1) : values));
      rounds.push(...segment.rounds);
    }
    const results = measureContinuous(state, frames, rounds);
    continuousAtomic(resolve(directory, 'results.json'), results);
    writeFileSync(
      resolve(directory, 'report.md'),
      continuousReport(id, state, results),
    );
    writeFileSync(
      resolve(directory, 'overview.svg'),
      continuousChart(state, frames),
    );
    continuousAtomic(manifestPath, {
      ...manifest,
      steps: state.world.tick,
      externalModelCalls: state.attempts.length,
      windowPhase: state.phase,
      files: [
        ...new Set([
          ...continuousArchivePaths(directory),
          'browser.json',
          'initial.png',
          'midpoint.png',
          'final.png',
          'overview.png',
        ]),
      ].sort(),
    });
    console.log(
      `${id}: ${state.phase} at round ${String(state.world.tick)}; raw evidence retained. Capturing replay screenshots.`,
    );
    const capture = spawnSync('pnpm', ['experiment:capture', '--', id], {
      cwd: root,
      stdio: 'inherit',
    });
    if (capture.status !== 0)
      throw new Error(
        `Capture failed for ${id}; the simulation is preserved. Fix the failure and run pnpm experiment:capture -- ${id}.`,
      );
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Continuous experiment failed.',
  );
  process.exitCode = 1;
}
