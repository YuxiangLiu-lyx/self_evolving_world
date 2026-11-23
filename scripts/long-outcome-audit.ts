import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  V7CallRecord,
  V7Execution,
} from '../apps/simulator/src/continuous-run.js';
import type { V7ReplayIndex, V7ReplaySegment } from './continuous-store.js';
import { longTokenBudget } from '../apps/simulator/src/long-tokens.js';

// Read retained records only. Acceptance owns deep reconstruction; this report
// neither launches inference nor substitutes for the archive validation receipt.
const id = process.argv[2] ?? 'ex13';
if (!/^ex\d+$/.test(id)) throw new Error('Expected an experiment identity.');
const directory = resolve('experiment', id);
const read = (path: string): unknown =>
  JSON.parse(readFileSync(resolve(directory, path), 'utf8')) as unknown;
const state = read('execution.json') as V7Execution;
if (
  !state.world.config.longDevelopment ||
  !['paused', 'window-complete'].includes(state.phase)
)
  throw new Error('A settled long-development observation is required.');
const index = read('replay.json') as V7ReplayIndex;
if (index.observed !== state.world.tick)
  throw new Error('Capture is not current.');
const rounds = index.segments.flatMap(
  (p) => (read(p.path) as V7ReplaySegment).rounds,
);
const events = rounds.flatMap((r) => r.events);
const calls = state.attempts.map(
  (a) => read(`calls/${a.id}.json`) as V7CallRecord,
);
function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length;
  const low = sorted[Math.floor((n - 1) / 2)],
    high = sorted[Math.floor(n / 2)];
  return {
    n,
    min: sorted[0] ?? null,
    median: low === undefined || high === undefined ? null : (low + high) / 2,
    p95: sorted[Math.max(0, Math.ceil(n * 0.95) - 1)] ?? null,
    max: sorted.at(-1) ?? null,
    sum: values.reduce((a, b) => a + b, 0),
  };
}
function counts(values: string[]) {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}
function responseKind(call: V7CallRecord): string {
  if (!call.response) return 'no-parsed-response';
  try {
    const value = JSON.parse(call.response.text) as {
      queries?: unknown[];
      result_json?: string | null;
    };
    return value.queries?.length
      ? 'query-batch'
      : value.result_json
        ? 'decision'
        : 'invalid';
  } catch {
    return 'invalid';
  }
}
const roles = (['ordinary', 'world'] as const).map((role) => {
  const records = calls.filter((c) => c.attempt.role === role),
    attempts = records.map((c) => c.attempt);
  const moduleNames = [
    ...new Set(
      attempts.flatMap((a) => Object.keys(a.requestMeasure?.modules ?? {})),
    ),
  ].sort();
  return {
    role,
    attempts: attempts.length,
    statuses: counts(attempts.map((a) => a.status)),
    actualInput: distribution(
      attempts.flatMap((a) => (a.usage ? [a.usage.inputTokens] : [])),
    ),
    actualOutput: distribution(
      attempts.flatMap((a) => (a.usage ? [a.usage.outputTokens] : [])),
    ),
    completeInputEstimate: distribution(
      attempts.flatMap((a) =>
        a.requestMeasure ? [a.requestMeasure.inputEstimate] : [],
      ),
    ),
    modules: Object.fromEntries(
      moduleNames.map((key) => [
        key,
        distribution(
          attempts.flatMap((a) => {
            const n = a.requestMeasure?.modules[key];
            return n === undefined ? [] : [n];
          }),
        ),
      ]),
    ),
    unknownReservations: attempts
      .filter((a) => !a.usage)
      .map((a) => ({
        id: a.id,
        tick: a.tick,
        reservation:
          a.reservedTokens ?? state.world.config.longDevelopment?.tokens,
      })),
    elapsedMs: distribution(
      attempts.flatMap((a) => (a.elapsedMs === null ? [] : [a.elapsedMs])),
    ),
    parsedResponses: counts(records.map(responseKind)),
    queryKnownTokens: records
      .filter((c) => responseKind(c) === 'query-batch')
      .reduce(
        (n, c) =>
          n +
          (c.attempt.usage
            ? c.attempt.usage.inputTokens + c.attempt.usage.outputTokens
            : 0),
        0,
      ),
    withRetrievalInput: records.filter(
      (c) => 'retrieval' in c.input && c.input.retrieval.length > 0,
    ).length,
    reasons: counts(attempts.map((a) => a.reason)),
    failures: attempts
      .filter((a) => a.status !== 'accepted')
      .map((a) => ({
        id: a.id,
        tick: a.tick,
        actor: a.actor,
        status: a.status,
        error: a.error,
      })),
  };
});
const people = state.world.actors.map((actor) => {
  const actions = rounds.flatMap((r) => {
    const action = r.actions[actor.id];
    return action ? [{ tick: r.tick, action }] : [];
  });
  const own = events.filter((e) => e.actor === actor.id);
  const ownCalls = calls.filter(
    (c) => c.attempt.role === 'ordinary' && c.attempt.actor === actor.id,
  );
  return {
    id: actor.id,
    vitals: actor.vitals,
    life: actor.life,
    wellbeing: actor.wellbeing,
    experience: actor.experience,
    actions: counts(actions.map((a) => a.action.interface)),
    actionRounds: actions.length,
    calls: {
      attempts: ownCalls.length,
      perEnvironmentRound: ownCalls.length / state.world.tick,
      parsedResponses: counts(ownCalls.map(responseKind)),
      knownTokens: ownCalls.reduce(
        (n, c) =>
          n +
          (c.attempt.usage
            ? c.attempt.usage.inputTokens + c.attempt.usage.outputTokens
            : 0),
        0,
      ),
      reasons: counts(ownCalls.map((c) => c.attempt.reason)),
    },
    failedActions: own.filter((e) => e.type === 'failed'),
    eventCounts: counts(own.map((e) => e.type)),
    requests: own.filter((e) => e.type === 'requested'),
    mastery: own.filter((e) => e.type === 'mastered'),
    recovery: own.filter((e) => e.type === 'rested'),
    experienceEvents: own.filter((e) =>
      /meal|mental-state|satisfaction|information-confirmed/.test(e.type),
    ),
    evidence: own.filter((e) =>
      /completed|planted|trial-result|information-confirmed|surface-preparation-ended|message|given|died|respawned/.test(
        e.type,
      ),
    ),
    projectsClaimedByActor: actor.memory.projects,
  };
});
const output =
  process.argv[3] ??
  `docs/exec-plans/evidence/pr-31-long-open-development/outcome-metrics.json`;
writeFileSync(
  output,
  JSON.stringify(
    {
      version: 1,
      experiment: id,
      observedRounds: state.world.tick,
      target: state.windowTarget,
      phase: state.phase,
      reason: state.reason,
      method:
        'Read-only retained call and event audit. Actual provider usage is separate from approximate complete-request BPE and conservative unknown reservations. Module counts overlap. Parsed query responses omit unparsed failures; every attempted call remains charged. Action counts include continued work and successful examinations with negative findings; they are not completed products or benefits. Actor-written projects are claims. Functional grouping and causal interpretation require the accompanying analysis.',
      budget: longTokenBudget(state),
      roles,
      people,
      pendingBarrier: state.barrier
        ? {
            id: state.barrier.id,
            tick: state.barrier.tick,
            requestActions: Object.fromEntries(
              Object.entries(state.barrier.actions).filter(
                ([, action]) => action.interface === 'request',
              ),
            ),
            reviews: state.barrier.reviews.map((review) => ({
              actor: review.actor,
              decision: review.decision,
              ability: review.ability,
            })),
            interpretation:
              'Pending decision/review at a stopped barrier is not a committed requested action, implementation, personal mastery or actual use. Full evidence remains in execution.json and retained calls.',
          }
        : null,
      developments: state.developments,
      developmentInternalUsage: null,
      developmentUsageNote:
        'Internal model, preparation, review and tool usage is unmetered and unknown, not zero or part of the ordinary/world token cap.',
      abilities: state.world.abilities
        .filter((a) => !a.authored)
        .map((a) => ({
          id: a.id,
          equivalence: a.equivalence,
          learning: a.learning,
          prerequisites: a.prerequisites,
          masteredBy: state.world.actors
            .filter((p) => p.mastered.includes(a.id))
            .map((p) => p.id),
          execution: rounds.flatMap((r) =>
            Object.entries(r.actions)
              .filter(([, action]) => action.interface === a.id)
              .map(([actor]) => ({
                tick: r.tick,
                actor,
                failed: r.events.some(
                  (e) => e.actor === actor && e.type === 'failed',
                ),
              })),
          ),
        })),
      objects: state.world.objects.filter((o) => o.createdBy !== null),
      processes: state.world.processes,
      revisions: state.world.revisions,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    experiment: id,
    observed: state.world.tick,
    output,
    budget: longTokenBudget(state),
  }),
);
