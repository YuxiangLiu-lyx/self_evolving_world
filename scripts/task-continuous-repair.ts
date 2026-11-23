import {
  LONG_CALL_PAUSE,
  longWorldInput,
} from '../apps/simulator/src/long-context.js';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { v7Clone } from '@self-evolving-world/world-core';
import type {
  V7Execution,
  V7CallRecord,
} from '../apps/simulator/src/continuous-run.js';
import { collectiveAttention } from '../apps/simulator/src/collective-controller.js';
import { worldContinuousInput } from '../apps/simulator/src/continuous-input.js';
import { issueContinuousDevelopment } from '../apps/simulator/src/continuous-run.js';
import { continuousCheckpoint } from './continuous-files.js';
import { captureContinuousBaseline } from './continuous-source.js';
import {
  continuousAtomic,
  continuousHash,
  continuousSink,
  continuousRead,
} from './continuous-store.js';
import { readExperiment } from './experiments.js';
import type { TaskContext } from './task-context.js';

export const TRANSPORT_REPAIR =
  'A bounded collective response reader failed; the stopped transport attempt remains charged and will not be repeated.';
export const BARK_FEEDBACK_REPAIR =
  'Reviewed bark feedback and personal inspection retention are incomplete; repair the preserved implementation without changing experimental policy.';

/** A dead coordinator lease plus absent workers establishes abandonment, never an API outcome. */
export function abandonedLongTransport(
  saved: V7Execution,
  evidence: {
    coordinatorPid: number;
    observedAt: string;
    coordinatorAbsent: boolean;
    workerAbsent: boolean;
  },
): { state: V7Execution; record: V7CallRecord } {
  const state = v7Clone(saved),
    pending = state.pendingCall;
  const attempt = state.attempts.at(-1);
  if (
    !state.world.config.longDevelopment ||
    state.phase !== 'running' ||
    state.barrier ||
    !pending ||
    !attempt ||
    attempt.id !== pending.id ||
    attempt.role !== 'ordinary' ||
    attempt.status !== 'started' ||
    attempt.tick !== state.world.tick ||
    state.attempts.filter((a) => a.status === 'started').length !== 1 ||
    !attempt.reservedTokens ||
    !Number.isSafeInteger(evidence.coordinatorPid) ||
    evidence.coordinatorPid < 1 ||
    !Number.isFinite(Date.parse(evidence.observedAt)) ||
    !evidence.coordinatorAbsent ||
    !evidence.workerAbsent
  )
    throw new Error(
      'Only a proved abandoned long-run ordinary invocation can be reconciled as unknown.',
    );
  attempt.status = 'failed';
  attempt.usage = null;
  attempt.elapsedMs = null;
  attempt.error =
    'The coordinator and inference worker were terminated before a durable result. API outcome and usage are unknown; the original invocation is never resent and retains its complete reservation.';
  const record: V7CallRecord = {
    attempt: v7Clone(attempt),
    input: pending.input,
    response: null,
    failureEvidence: JSON.stringify({
      kind: 'abandoned-long-invocation',
      ...evidence,
      checkpointHash: continuousHash(saved),
      apiOutcomeKnown: false,
      usageKnown: false,
    }),
  };
  state.pendingCall = null;
  state.phase = 'paused';
  state.reason = LONG_CALL_PAUSE;
  state.longRetrieval ??= {};
  const old = state.longRetrieval[attempt.actor];
  state.longRetrieval[attempt.actor] = {
    tick: state.world.tick,
    batches: old?.tick === state.world.tick ? old.batches : 0,
    results: [
      ...(old?.tick === state.world.tick ? old.results : []),
      {
        abandonedInvocation: attempt.id,
        notice:
          'No decision or physical action was accepted from this unknown invocation. After technical review, make a fresh decision using the preserved state; prior costs remain charged.',
      },
    ],
  };
  return { state, record };
}

export function hasReviewedBarkFeedbackDefect(state: V7Execution): boolean {
  return (
    state.world.config.development?.scope === 'collective-ex12' &&
    state.world.revisions.includes('bark-extraction@1') &&
    !state.world.revisions.includes('bark-feedback@1') &&
    state.world.actors.some((a) =>
      Object.keys(a.extensionState).some((key) =>
        key.startsWith('bark:assessment:'),
      ),
    ) &&
    state.world.satisfaction.some(
      (r) =>
        r.id === 'grounded-understanding' &&
        !!r.maintenance &&
        !r.alternativeTriggers?.some((t) => t.interface === 'bark-extraction'),
    )
  );
}

/** Reconcile an actually terminated invocation as unknown, never as an invented API response. */
export function abandonedCollectiveTransport(
  saved: V7Execution,
  commandFailure: string,
  reviewedFeedback = false,
): { state: V7Execution; record: V7CallRecord } {
  const state = v7Clone(saved),
    pending = state.pendingCall;
  const index = state.attempts.findIndex((a) => a.id === pending?.id),
    attempt = state.attempts[index];
  if (
    !state.world.config.collective ||
    state.phase !== 'running' ||
    state.barrier ||
    !pending ||
    !attempt ||
    attempt.status !== 'started' ||
    !commandFailure.includes('experiment:continuous failed (143)') ||
    state.attempts.filter((a) => a.status === 'started').length !== 1 ||
    !(reviewedFeedback
      ? hasReviewedBarkFeedbackDefect(state)
      : state.attempts.some(
          (a) => a.error === 'Expected exactly one bounded decision output.',
        ))
  )
    throw new Error(
      'Transport reconciliation requires the retained collective reader failure and a terminated command with exactly one pending invocation.',
    );
  const finished = {
    ...attempt,
    status: 'failed' as const,
    usage: null,
    elapsedMs: null,
    error: `Operator terminated transport after a confirmed ${reviewedFeedback ? 'reviewed bark implementation defect' : 'response-reader failure'}. Invocation outcome and token usage are unknown; this attempt is not retried.`,
  };
  const record: V7CallRecord = {
    attempt: finished,
    input: pending.input,
    response: null,
    failureEvidence: JSON.stringify({
      kind: 'operator-transport-interruption',
      commandFailure,
      pendingId: pending.id,
      checkpointHash: continuousHash(saved),
      apiResponseObserved: false,
      usageKnown: false,
    }),
  };
  state.attempts[index] = finished;
  if ('collective' in pending.input)
    for (const member of pending.input.collective.eligible)
      collectiveAttention(state).lastDecision[member] = state.world.tick;
  state.pendingCall = null;
  state.phase = 'paused';
  state.reason = reviewedFeedback ? BARK_FEEDBACK_REPAIR : TRANSPORT_REPAIR;
  return { state, record };
}

/** Recover the task relation only when an accidentally advanced B startup made no allocation. */
export function restoreUnstartedCollectiveArm(
  task: TaskContext,
  prior: V7Execution,
  presentIds: string[],
): void {
  const a = task.comparison?.a,
    startup = task.experiment;
  if (
    task.status !== 'needs_fix' ||
    task.comparison?.stage !== 'B-short' ||
    !a ||
    task.comparison.b ||
    startup?.id ||
    !startup?.before.includes(a) ||
    !startup.error?.includes('experiment:continuous failed (143)') ||
    presentIds.some((id) => !startup.before.includes(id)) ||
    prior.world.config.collective?.arm !== 'A' ||
    prior.world.config.development?.scope !== `collective-${a}`
  )
    throw new Error(
      'Cannot restore an arm after allocation, inference, an unrelated failure or an unverified task relation.',
    );
  assertContinuousTechnicalRepair(prior);
  task.history.push({
    step: 'experiment',
    detail: `Retained failed unallocated B startup ${JSON.stringify(startup)}. Restored this same task's ${a} technical pause; no call, world, budget or allocated experiment was replaced.`,
  });
  task.comparison.stage = 'A';
  task.experiment = {
    id: a,
    before: startup.before.filter((id) => id !== a),
    phase: 'recorded',
  };
}

/** A computation pause is unfinished work, never a new experiment or an actor-authored request. */
export async function requestContinuousTechnicalRepair(
  root: string,
  task: TaskContext,
  abandonedCoordinator?: number,
): Promise<void> {
  if (
    !task.experiment?.id &&
    task.comparison?.a &&
    task.comparison.stage === 'B-short'
  )
    restoreUnstartedCollectiveArm(
      task,
      continuousCheckpoint(root, task.comparison.a),
      readdirSync(resolve(root, 'experiment')).filter((id) =>
        /^ex[1-9]\d*$/.test(id),
      ),
    );
  const id = task.experiment?.id;
  if (
    !id ||
    task.intent.experiment.mode !== 'continuous' ||
    task.intent.experiment.allocation !== 'new' ||
    task.experiment?.before.includes(id) ||
    !task.prepared ||
    task.status === 'completed' ||
    task.publication
  )
    throw new Error(
      "Technical repair requires this task's own unpublished continuous run.",
    );
  const original = continuousCheckpoint(root, id);
  const commandFailure = task.experiment?.error ?? task.reason;
  const feedback = hasReviewedBarkFeedbackDefect(original);
  let abandoned: ReturnType<typeof abandonedLongTransport> | null = null;
  if (
    abandonedCoordinator !== undefined &&
    original.world.config.longDevelopment &&
    task.status === 'running' &&
    task.step === 'experiment' &&
    original.pendingCall
  ) {
    try {
      process.kill(abandonedCoordinator, 0);
      throw new Error('The previous coordinator is still alive.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    const runningWorker = execFileSync('ps', ['-axo', 'pid=,args='], {
      encoding: 'utf8',
    })
      .split('\n')
      .some((line) =>
        /\bnode(?:js)?\b.*(?:scripts\/continuous-cli\.ts|apps\/simulator\/dist\/continuous)/.test(
          line,
        ),
      );
    if (runningWorker)
      throw new Error(
        'A continuous inference worker is still alive; do not reconcile or duplicate it.',
      );
    abandoned = abandonedLongTransport(original, {
      coordinatorPid: abandonedCoordinator,
      observedAt: new Date().toISOString(),
      coordinatorAbsent: true,
      workerAbsent: true,
    });
  }
  const interrupted =
    abandoned ??
    (task.status === 'needs_fix' && original.pendingCall && commandFailure
      ? abandonedCollectiveTransport(original, commandFailure, feedback)
      : null);
  const state = interrupted?.state ?? original;
  assertContinuousTechnicalRepair(state);
  const reason = state.reason;
  // A failed browser capture must not prevent repairing its durable paused world.
  // This metadata read is not acceptance; source-prefix and selected browser gates remain mandatory.
  const directory = resolve(root, 'experiment', id);
  const record = interrupted
    ? {
        manifest: continuousRead<Record<string, unknown>>(
          resolve(directory, 'manifest.json'),
        ),
      }
    : readExperiment(root, id, true);
  if (record.manifest.id !== id || record.manifest.version !== 7)
    throw new Error(
      'Technical repair metadata does not identify the retained run.',
    );
  const prefix = `technical-pauses/round-${String(state.world.tick)}`;
  if (existsSync(resolve(directory, prefix)))
    throw new Error(
      'Technical pause already retained; inspect its recovery before repeating.',
    );
  mkdirSync(resolve(directory, prefix), { recursive: true });
  // Immutable calls, segments, source snapshots and existing checkpoints stay at their original paths.
  const retained: Record<string, string> = {};
  const missingCaptureFiles: string[] = [];
  for (const file of [
    'manifest.json',
    'execution.json',
    'replay.json',
    'results.json',
    'report.md',
    'browser.json',
    'initial.png',
    'midpoint.png',
    'final.png',
    'overview.svg',
    'overview.png',
  ]) {
    if (!existsSync(resolve(directory, file))) {
      missingCaptureFiles.push(file);
      continue;
    }
    const target = `${prefix}/${file === 'report.md' ? 'report.txt' : file}`;
    copyFileSync(resolve(directory, file), resolve(directory, target));
    retained[target] = continuousHash(readFileSync(resolve(directory, target)));
  }
  if (interrupted) {
    const sink = continuousSink(root, id);
    if (await sink.findCall(interrupted.record.attempt.id))
      throw new Error(
        'A durable transport result already exists; reconcile that result instead.',
      );
    await sink.call(interrupted.record);
    await sink.save(state);
  }
  continuousAtomic(resolve(directory, prefix, 'recovery.json'), {
    kind: 'technical-computation-recovery',
    captureStatus: record.manifest.status,
    captureNote:
      'Retained files can include an interrupted or stale browser capture. No current PASS is asserted; full source-prefix and selected browser verification remain mandatory.',
    reason,
    tick: state.world.tick,
    retained,
    missingCaptureFiles,
    abandonedTransport: interrupted ? interrupted.record.attempt.id : null,
    worldHash: continuousHash(state.world),
    attemptsHash: continuousHash(state.attempts),
    target: state.windowTarget,
    basis:
      'The current task requires repairing technical blockers and continuing the same original run.',
    actorRequest: false,
    modelCalls: 0,
  });
  const next = v7Clone(state);
  // Structural extension is serialized here before the runtime receives its typed recovery contract.
  if (!reason) throw new Error('Missing validated technical reason.');
  const barrier = {
    ...(state.barrier ?? {
      id: `context-${String(state.world.tick)}`,
      tick: state.world.tick,
      actions: {},
      requests: {},
      reviews: [],
      worldAttempts: 0,
      errors: [],
      input: state.world.config.longDevelopment
        ? longWorldInput(state.world, {})
        : worldContinuousInput(state.world, {}),
      developmentAttempt: null,
    }),
    technicalReason: reason,
  };
  next.barrier = barrier;
  await issueContinuousDevelopment(next, continuousSink(root, id));
  captureContinuousBaseline(root, id, next);
  const manifest = { ...record.manifest };
  delete manifest.artifacts;
  continuousAtomic(resolve(directory, 'manifest.json'), {
    ...manifest,
    status: 'running',
    windowPhase: 'development',
    files: [],
  });
  if (!task.experiment) throw new Error('Missing task experiment journal.');
  task.experiment.phase = 'started';
  delete task.request;
  delete task.validation;
  delete task.review;
  delete task.body;
  delete task.remoteReview;
  delete task.completion;
  task.history.push({
    step: 'development',
    detail: `Retained ${id} at round ${String(state.world.tick)} under ${prefix}; requested counted technical development without inference, actor requests, parameter changes or replacing the run.`,
  });
}

/** Refuse ambiguous calls, budget exhaustion, settled windows and actor review barriers. */
export function assertContinuousTechnicalRepair(state: V7Execution): void {
  const longFailure =
    !!state.world.config.longDevelopment &&
    state.reason === LONG_CALL_PAUSE &&
    state.barrier === null &&
    state.attempts.some(
      (a) =>
        a.tick === state.world.tick &&
        a.role === 'ordinary' &&
        ['failed', 'rejected'].includes(a.status),
    );
  const computation =
    state.reason ===
      'Simulation computation budget exhausted; checkpoint the entire world.' &&
    !!state.barrier;
  const context =
    state.reason ===
      'Observation input exceeds computational context protection; no hidden truncation or inference.' &&
    state.barrier === null &&
    !!state.world.config.experience;
  const transport =
    state.reason === TRANSPORT_REPAIR &&
    state.barrier === null &&
    !!state.world.config.collective;
  const feedback =
    state.reason === BARK_FEEDBACK_REPAIR &&
    state.barrier === null &&
    hasReviewedBarkFeedbackDefect(state);
  if (
    state.phase !== 'paused' ||
    !(computation || context || transport || feedback || longFailure) ||
    state.pendingCall ||
    state.attempts.some((a) => a.status === 'started') ||
    state.world.tick >= state.windowTarget ||
    state.developments.length >= state.world.config.budgets.development ||
    (state.barrier &&
      (Object.keys(state.barrier.requests).length ||
        state.barrier.reviews.length)) ||
    (context &&
      (['ordinary', 'world'] as const).some(
        (role) =>
          state.attempts.filter((a) => a.role === role).length >=
          state.world.config.budgets[role],
      ))
  )
    throw new Error(
      'Only a durable, unsettled computation or pre-inference context pause can request technical development; budgets and uncertain calls cannot be bypassed.',
    );
}
