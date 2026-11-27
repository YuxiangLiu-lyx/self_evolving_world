import {
  initialLongWorld,
  LONG_SCENARIOS,
  longCultureScenario,
  longObjective,
} from '../apps/simulator/src/long-scenario.js';
import type { LongScenario } from '../apps/simulator/src/long-scenario.js';
import { longAllocationNote, parseLongAllocation } from './long-allocation.js';
import { longPreflight } from './long-preflight.js';
import {
  importLongWorld,
  LONG_IMPORT,
  parseLongNewcomers,
} from '../apps/simulator/src/long-import.js';
import type { LongImport } from '../apps/simulator/src/long-import.js';
import { readLongImportSource } from './long-import.js';
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
import {
  consecutiveRejectedOutputs,
  rejectionReviewStop,
  repairContinuousRun,
} from './continuous-repair.js';
import { countedDevelopments } from '../apps/simulator/src/collective-controller.js';
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
  pnpm experiment:continuous -- new open|long|long-fixes|long-culture|long-culture-incentives|long-culture-v2|long-culture-v2-incentives|long-culture-v2-oldgoal|long-culture-v3|long-culture-v3-incentives|collective-a
  pnpm experiment:continuous -- new long-culture-TAG [--seed N] [--development N] [--tokens N]
  pnpm experiment:continuous -- new collective-b exA
  pnpm experiment:continuous -- new long-culture-v2 --import exN --newcomers file.json
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
    const long: LongScenario | undefined = LONG_SCENARIOS.find(
      (s) => s === scenario,
    );
    // Opt-in import: a completed culture window as genesis, plus newcomers.
    const importing = scenario === 'long-culture-v2' && extra === '--import';
    // Only the long culture tags take allocation options; every other tag takes none.
    const allocates =
      !importing && long !== undefined && longCultureScenario(long);
    if (
      !['open', ...LONG_SCENARIOS, 'collective-a', 'collective-b'].includes(
        scenario ?? '',
      ) ||
      (importing
        ? rest.length !== 3 ||
          !/^ex[1-9]\d*$/.test(rest[0] ?? '') ||
          rest[1] !== '--newcomers'
        : !allocates &&
          ((scenario === 'collective-b'
            ? !/^ex[1-9]\d*$/.test(extra ?? '')
            : extra) ||
            rest.length))
    )
      throw new Error(USAGE);
    // Set once at genesis, before the first call; no flag keeps the tag's frozen values.
    const allocation = allocates
      ? parseLongAllocation(extra === undefined ? [] : [extra, ...rest])
      : {};
    const note = longAllocationNote(allocation);
    checkExperiments(root);
    const source = importing ? readLongImportSource(root, rest[0] ?? '') : null;
    const newcomers = source
      ? parseLongNewcomers(
          continuousRead<unknown>(resolve(root, rest[2] ?? '')),
          source.world,
        )
      : [];
    const imported = (scope: string): LongImport | null =>
      source
        ? importLongWorld(source.world, {
            experiment: source.proof.experiment,
            scope,
            newcomers,
          })
        : null;
    const comparison = scenario?.startsWith('collective-') ?? false;
    const arm = scenario === 'collective-a' ? 'A' : 'B';
    const genesis =
      imported('long-preflight')?.world ??
      (comparison
        ? initialCollectiveWorld('collective-preflight', arm)
        : long
          ? initialLongWorld('long-preflight', long, allocation)
          : initialOpenWorld());
    const physicalHash = comparison
      ? continuousHash(collectivePhysicalGenesis(genesis))
      : null;
    let preflight: {
      baseline: ReturnType<typeof openPreflight>;
      physicalHash?: string;
      reusedFrom?: string;
      stationary?: ReturnType<typeof longPreflight>;
      importedFrom?: NonNullable<typeof source>['proof'];
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
    } else if (source)
      // The baseline oracle covers the imported window; see docs/CULTURE_SCENARIO.md.
      preflight = {
        baseline: openPreflight(LONG_IMPORT.rounds, genesis),
        stationary: longPreflight(genesis, { requireHardship: false }),
        importedFrom: source.proof,
      };
    else
      preflight = {
        baseline: openPreflight(1600, genesis),
        ...(long
          ? {
              stationary: longPreflight(genesis, {
                requireHardship:
                  !genesis.config.longDevelopment?.culture?.slack,
              }),
            }
          : {}),
        ...(physicalHash ? { physicalHash } : {}),
      };
    token = await renewableAccessToken();
    const model = await selectModel(token, 'gpt-6.1-sol');
    id = allocateExperiment(root);
    const directory = resolve(root, 'experiment', id),
      git = (...args: string[]) =>
        execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    const imports = imported(`long-${id}`);
    state = newContinuousExecution(
      model,
      'chatgpt-plan',
      imports?.world ??
        (comparison
          ? initialCollectiveWorld(`collective-${id}`, arm)
          : long
            ? initialLongWorld(`long-${id}`, long, allocation)
            : initialOpenWorld(`open-${id}`)),
    );
    if (comparison) state.windowTarget = 200;
    continuousAtomic(resolve(directory, 'manifest.json'), {
      format: 'self-evolving-world/experiment',
      version: 7,
      id,
      objective: comparison
        ? COLLECTIVE_OBJECTIVE
        : state.world.config.longDevelopment
          ? `${longObjective(state.world.config.longDevelopment)}${note ? ` ${note}` : ''}`
          : OPEN_OBJECTIVE,
      // The verifier rebuilds the genesis of a culture run with this recorded allocation.
      ...(note ? { allocation } : {}),
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
      ...(source && imports
        ? {
            importedFrom: source.proof,
            newcomers: {
              temperament: imports.temperament,
              placements: imports.newcomers,
            },
          }
        : {}),
      files: [],
    });
    continuousAtomic(
      resolve(directory, 'configuration.json'),
      imports
        ? { ...state.world.config, importChanges: imports.changes }
        : state.world.config,
    );
    continuousAtomic(resolve(directory, 'preflight.json'), preflight);
    continuousAtomic(resolve(directory, 'initial.json'), state.world);
    continuousAtomic(resolve(directory, 'execution.json'), state);
    saveContinuousSource(
      root,
      id,
      state,
      source
        ? `Imported ${source.proof.experiment} round-${String(source.proof.round)} world (world hash ${source.proof.worldHash}, equal to its exact replay) with the listed configuration changes and ${String(newcomers.length)} newcomers without memory; packages of ${source.proof.scope} stay available, new handoffs use this scope. Offline policies and composition fixtures are excluded from ordinary inputs.`
        : 'Initial open-development-v1 fresh policy, inheritSkills=false, with only the explicit authored baseline. No historical generated skills, objects, rewards or mastery. Offline policies and composition fixtures are excluded from ordinary inputs.',
    );
    console.log(
      `Allocated ${id} (${scenario ?? ''}${source ? ` imported from ${source.proof.experiment} at round ${String(source.proof.round)}` : ''}).${note ? ` ${note}` : ''}`,
    );
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
      const repaired = await repairContinuousRun(
        root,
        id,
        rest[0] === undefined ? undefined : Number(rest[0]),
      );
      const recovered =
        repaired === 'rejection' ? continuousCheckpoint(root, id) : null;
      console.log(
        repaired === 'transport'
          ? `${id}: transport failure retained; resuming without a development handoff.`
          : recovered
            ? `${id}: rejected model output retained (${String(consecutiveRejectedOutputs(recovered))} consecutive; the run stops for review at ${String(recovered.world.config.longDevelopment?.rejectionRecovery?.stopAfter)}); resuming without a development handoff.`
            : `${id}: technical pause retained; submit the counted development handoff with develop.`,
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
        ...(state.world.config.longDevelopment?.emptyHandoffs
          ? { countedHandoffs: countedDevelopments(state.developments) }
          : {}),
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
    const stopped = rejectionReviewStop(state);
    if (stopped !== null)
      console.log(
        `${id}: the run stops for review after ${String(stopped)} consecutive rejected ordinary outputs; repair will not resume it or issue a technical development handoff.`,
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
