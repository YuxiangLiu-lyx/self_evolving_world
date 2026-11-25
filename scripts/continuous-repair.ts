import {
  LONG_CALL_PAUSE,
  longWorldInput,
} from '../apps/simulator/src/long-context.js';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { countedDevelopments } from '../apps/simulator/src/collective-controller.js';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { v7Clone } from '@self-evolving-world/world-core';
import type {
  V7Execution,
  V7CallRecord,
} from '../apps/simulator/src/continuous-run.js';
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

/** A dead experiment process plus absent workers establishes abandonment, never an API outcome. */
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
    'The experiment process and inference worker were terminated before a durable result. API outcome and usage are unknown; the original invocation is never resent and retains its complete reservation.';
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

/** The last failed or rejected ordinary attempt of the current round. */
function currentOrdinaryFailure(state: V7Execution) {
  return state.attempts
    .filter(
      (a) =>
        a.tick === state.world.tick &&
        a.role === 'ordinary' &&
        ['failed', 'rejected'].includes(a.status),
    )
    .at(-1);
}
/** A durable long-call pause with no barrier or unsettled call, inside the window. */
function settledLongCallPause(state: V7Execution): boolean {
  return (
    state.phase === 'paused' &&
    state.reason === LONG_CALL_PAUSE &&
    state.barrier === null &&
    !state.pendingCall &&
    !state.attempts.some((a) => a.status === 'started') &&
    state.world.tick < state.windowTarget
  );
}

/** Opt-in (`longDevelopment.transportRecovery: 'uncounted'`): a long-call pause whose
 * failing ordinary call ended without any response but with transport evidence (for
 * example `server_is_overloaded`) or was proved abandoned. Such a pause resumes without a
 * development handoff; rejected model output, context or computation pauses stay counted
 * unless `rejectionRecovery` is also set. */
export function uncountedTransportPause(
  state: V7Execution,
  record: V7CallRecord | null,
): boolean {
  const failure = currentOrdinaryFailure(state);
  return (
    state.world.config.longDevelopment?.transportRecovery === 'uncounted' &&
    settledLongCallPause(state) &&
    failure?.status === 'failed' &&
    record?.attempt.id === failure.id &&
    record.response === null &&
    !!record.failureEvidence
  );
}

/** Consecutive rejected ordinary outputs: the trailing run, in attempt order across all
 * actors and rounds, of ordinary attempts whose model output was rejected. An accepted
 * ordinary attempt (including a read-only query batch) ends the run. A transport `failed`
 * attempt has no model output, so it neither extends nor ends the run; World Agent
 * attempts and development handoffs are ignored. */
export function consecutiveRejectedOutputs(state: V7Execution): number {
  let run = 0;
  for (const attempt of [...state.attempts].reverse()) {
    if (attempt.role !== 'ordinary') continue;
    if (attempt.status === 'accepted') break;
    if (attempt.status === 'rejected') run += 1;
  }
  return run;
}

/** Opt-in (`longDevelopment.rejectionRecovery`): the number of consecutive rejected
 * ordinary outputs when a long-call pause caused by a rejected output has reached
 * `stopAfter`, at which point the run stops for review; otherwise `null`. Such a pause is
 * never resumed by `repair`, and never becomes a counted technical handoff. */
export function rejectionReviewStop(state: V7Execution): number | null {
  const policy = state.world.config.longDevelopment?.rejectionRecovery;
  if (
    !policy ||
    state.phase !== 'paused' ||
    state.reason !== LONG_CALL_PAUSE ||
    currentOrdinaryFailure(state)?.status !== 'rejected'
  )
    return null;
  const run = consecutiveRejectedOutputs(state);
  return run >= policy.stopAfter ? run : null;
}

/** Opt-in (`longDevelopment.rejectionRecovery: { mode: 'uncounted' }`): a long-call pause
 * whose failing ordinary call returned a response that was rejected by validation, with
 * fewer than `stopAfter` consecutive rejected ordinary outputs. Such a pause resumes
 * without a development handoff: the rejected output never becomes an action, keeps its
 * charge, and the actor decides again with the retained validation error. */
export function uncountedRejectionPause(
  state: V7Execution,
  record: V7CallRecord | null,
): boolean {
  const policy = state.world.config.longDevelopment?.rejectionRecovery;
  const failure = currentOrdinaryFailure(state);
  return (
    policy?.mode === 'uncounted' &&
    settledLongCallPause(state) &&
    failure?.status === 'rejected' &&
    record?.attempt.id === failure.id &&
    record.response !== null &&
    consecutiveRejectedOutputs(state) < policy.stopAfter
  );
}

/** The repair a paused run receives: an uncounted transport or rejection resume, or a
 * counted technical development handoff. A rejection pause that reached the stop rule is
 * refused and never falls back to a counted handoff. */
export function technicalRepairKind(
  state: V7Execution,
  record: V7CallRecord | null,
): 'transport' | 'rejection' | 'development' {
  const stopped = rejectionReviewStop(state);
  if (stopped !== null)
    throw new Error(
      `The run stops for review after ${String(stopped)} consecutive rejected ordinary outputs (rejectionRecovery.stopAfter ${String(state.world.config.longDevelopment?.rejectionRecovery?.stopAfter)}); repair neither resumes it nor issues a technical development handoff.`,
    );
  if (uncountedTransportPause(state, record)) return 'transport';
  if (uncountedRejectionPause(state, record)) return 'rejection';
  assertContinuousTechnicalRepair(state);
  return 'development';
}

/** The retained directory of this technical pause. A round keeps one pause; with the opt-in
 * `rejectionRecovery`, a later pause in the same round (after an uncounted resume) is kept
 * as `round-N-2`, `round-N-3`, ... unless one of them already retained this exact state. */
export function technicalPausePrefix(
  directory: string,
  state: V7Execution,
): string {
  const base = `technical-pauses/round-${String(state.world.tick)}`;
  if (!existsSync(resolve(directory, base))) return base;
  if (state.world.config.longDevelopment?.rejectionRecovery)
    for (let index = 2; ; index += 1) {
      const previous = index === 2 ? base : `${base}-${String(index - 1)}`;
      const recovery = resolve(directory, previous, 'recovery.json');
      if (
        !existsSync(recovery) ||
        continuousRead<{ attemptsHash?: unknown }>(recovery).attemptsHash ===
          continuousHash(state.attempts)
      )
        break;
      const next = `${base}-${String(index)}`;
      if (!existsSync(resolve(directory, next))) return next;
    }
  throw new Error(
    'Technical pause already retained; inspect its recovery before repeating.',
  );
}

/** Seconds added to the server's retry-after before a transport recovery resumes (the user's rule). */
export const TRANSPORT_RETRY_MARGIN_SECONDS = 60;
/** At most this many transport recoveries of one experiment within any 60 minutes. */
export const TRANSPORT_RECOVERY_LIMIT = { recoveries: 6, windowMs: 3_600_000 };

/** The last retry-after in retained failure evidence, in milliseconds (`retry-after-ms` first), or null. */
export function transportRetryAfterMs(
  evidence: string | null | undefined,
): number | null {
  if (!evidence) return null;
  const last = (pattern: RegExp) => [...evidence.matchAll(pattern)].at(-1)?.[1];
  const ms = last(/"retry-after-ms"\s*:\s*"?(\d+(?:\.\d+)?)"?/gi);
  if (ms !== undefined) return Math.ceil(Number(ms));
  const seconds = last(/"retry-after"\s*:\s*"?(\d+(?:\.\d+)?)"?/gi);
  return seconds === undefined ? null : Math.ceil(Number(seconds) * 1000);
}

/** The last error code in retained failure evidence, or null. */
export function transportErrorCode(
  evidence: string | null | undefined,
): string | null {
  if (!evidence) return null;
  return [...evidence.matchAll(/"code"\s*:\s*"([^"]+)"/g)].at(-1)?.[1] ?? null;
}

export interface TransportWait {
  failedAt: string;
  errorCode: string | null;
  retryAfterSeconds: number | null;
  marginSeconds: number;
  /** The earliest resume time: failure + retry-after + margin; the failure time without a retry-after. */
  resumeAfter: string;
}

/** When a transport recovery may resume; the failure time is the attempt start plus its elapsed time. */
export function transportWait(
  attempt: { startedAt: string; elapsedMs: number | null },
  evidence: string | null | undefined,
): TransportWait {
  const failed = Math.ceil(
    Date.parse(attempt.startedAt) + (attempt.elapsedMs ?? 0),
  );
  if (!Number.isFinite(failed))
    throw new Error('The failed attempt has no valid start time.');
  const retry = transportRetryAfterMs(evidence);
  const resume =
    retry === null
      ? failed
      : failed + retry + TRANSPORT_RETRY_MARGIN_SECONDS * 1000;
  return {
    failedAt: new Date(failed).toISOString(),
    errorCode: transportErrorCode(evidence),
    retryAfterSeconds: retry === null ? null : retry / 1000,
    marginSeconds: retry === null ? 0 : TRANSPORT_RETRY_MARGIN_SECONDS,
    resumeAfter: new Date(resume).toISOString(),
  };
}

/** Recovery times of the retained transport recoveries that record one (records before 7d do not). */
export function transportRecoveryTimes(directory: string): number[] {
  const pauses = resolve(directory, 'technical-pauses');
  if (!existsSync(pauses)) return [];
  return readdirSync(pauses)
    .map((name) => resolve(pauses, name, 'recovery.json'))
    .filter((path) => existsSync(path))
    .map((path) =>
      continuousRead<{ transportRecovery?: unknown; recoveredAt?: unknown }>(
        path,
      ),
    )
    .filter((r) => r.transportRecovery === true)
    .map((r) =>
      typeof r.recoveredAt === 'string' ? Date.parse(r.recoveredAt) : NaN,
    )
    .filter((t) => Number.isFinite(t));
}

/** Refuse a transport recovery beyond the limit within the trailing window ending at `at`. */
export function assertTransportRecoveryLimit(
  times: number[],
  at: number,
): void {
  const recent = times.filter(
    (t) => t > at - TRANSPORT_RECOVERY_LIMIT.windowMs && t <= at,
  ).length;
  if (recent >= TRANSPORT_RECOVERY_LIMIT.recoveries)
    throw new Error(
      `${String(recent)} transport recoveries in the last 60 minutes reach the limit of ${String(TRANSPORT_RECOVERY_LIMIT.recoveries)}; stop and wait for the user before resuming.`,
    );
}

export interface RepairClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  log: (message: string) => void;
}
const SYSTEM_CLOCK: RepairClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
  log: (message) => {
    console.log(message);
  },
};

/** Wait until a transport recovery may resume, refusing one beyond the rate limit before and after. */
export async function waitForTransportResume(
  directory: string,
  id: string,
  attempt: { startedAt: string; elapsedMs: number | null },
  evidence: string | null | undefined,
  clock: RepairClock,
): Promise<TransportWait & { waitedMs: number }> {
  const times = transportRecoveryTimes(directory);
  assertTransportRecoveryLimit(times, clock.now());
  const wait = transportWait(attempt, evidence);
  const start = clock.now();
  const remaining = Date.parse(wait.resumeAfter) - start;
  if (remaining > 0) {
    clock.log(
      `${id}: waiting ${String(Math.ceil(remaining / 1000))} s for the retry-after (${String(wait.retryAfterSeconds)} s after the ${String(wait.errorCode)} failure at ${wait.failedAt}, plus ${String(wait.marginSeconds)} s) before resuming.`,
    );
    await clock.sleep(remaining);
  }
  assertTransportRecoveryLimit(times, clock.now());
  return { ...wait, waitedMs: Math.max(0, clock.now() - start) };
}

/** A computation pause is unfinished work, never a new experiment or an actor-authored request. */
export async function repairContinuousRun(
  root: string,
  id: string,
  abandonedPid?: number,
  clock: RepairClock = SYSTEM_CLOCK,
): Promise<'transport' | 'rejection' | 'development'> {
  const original = continuousCheckpoint(root, id);
  let abandoned: ReturnType<typeof abandonedLongTransport> | null = null;
  if (abandonedPid !== undefined) {
    if (!original.world.config.longDevelopment || !original.pendingCall)
      throw new Error(
        'Abandoned-invocation repair requires a long-development run with one pending call.',
      );
    try {
      process.kill(abandonedPid, 0);
      throw new Error('The previous experiment process is still alive.');
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
      coordinatorPid: abandonedPid,
      observedAt: new Date().toISOString(),
      coordinatorAbsent: true,
      workerAbsent: true,
    });
  }
  const state = abandoned?.state ?? original;
  const failed = state.attempts
    .filter((a) => a.tick === state.world.tick && a.role === 'ordinary')
    .at(-1);
  const failedRecord = abandoned
    ? abandoned.record
    : failed
      ? await continuousSink(root, id).findCall(failed.id)
      : null;
  const kind = technicalRepairKind(state, failedRecord);
  const uncounted = kind !== 'development';
  const directory = resolve(root, 'experiment', id);
  // A transport recovery waits for the server's retry-after plus a margin, within a rate limit.
  const waited =
    kind === 'transport' && failed
      ? await waitForTransportResume(
          directory,
          id,
          failed,
          failedRecord?.failureEvidence,
          clock,
        )
      : null;
  const reason = state.reason;
  // A failed browser capture must not prevent repairing its durable paused world.
  const record = abandoned
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
  const prefix = technicalPausePrefix(directory, state);
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
  if (abandoned) {
    const sink = continuousSink(root, id);
    if (await sink.findCall(abandoned.record.attempt.id))
      throw new Error(
        'A durable transport result already exists; reconcile that result instead.',
      );
    await sink.call(abandoned.record);
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
    abandonedTransport: abandoned ? abandoned.record.attempt.id : null,
    worldHash: continuousHash(state.world),
    attemptsHash: continuousHash(state.attempts),
    target: state.windowTarget,
    basis:
      kind === 'transport'
        ? 'Resume after a provider transport failure; the failed call is never resent and keeps its charge.'
        : kind === 'rejection'
          ? 'Resume after rejected model output; the rejected output never becomes an action and keeps its charge, and the actor decides again with the retained validation error.'
          : 'Repair technical blockers and continue the same original run.',
    actorRequest: false,
    modelCalls: 0,
    ...(kind === 'transport'
      ? {
          transportRecovery: true,
          developmentHandoff: false,
          ...(waited
            ? {
                recoveredAt: new Date(clock.now()).toISOString(),
                transportWait: waited,
              }
            : {}),
        }
      : kind === 'rejection'
        ? {
            rejectionRecovery: true,
            consecutiveRejectedOutputs: consecutiveRejectedOutputs(state),
            stopAfter:
              state.world.config.longDevelopment?.rejectionRecovery?.stopAfter,
            developmentHandoff: false,
          }
        : {}),
  });
  if (uncounted) {
    const resumed = v7Clone(state);
    resumed.phase = 'running';
    resumed.reason = null;
    await continuousSink(root, id).save(resumed);
    const manifest = { ...record.manifest };
    delete manifest.artifacts;
    continuousAtomic(resolve(directory, 'manifest.json'), {
      ...manifest,
      status: 'running',
      windowPhase: 'running',
      files: [],
    });
    return kind;
  }
  const next = v7Clone(state);
  if (!reason) throw new Error('Missing validated technical reason.');
  next.barrier = {
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
  return 'development';
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
  if (
    state.phase !== 'paused' ||
    !(computation || context || longFailure) ||
    state.pendingCall ||
    state.attempts.some((a) => a.status === 'started') ||
    state.world.tick >= state.windowTarget ||
    countedDevelopments(state.developments) >=
      state.world.config.budgets.development ||
    rejectionReviewStop(state) !== null ||
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
