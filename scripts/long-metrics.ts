import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { V7Execution } from '../apps/simulator/src/continuous-run.js';
import { continuousRead } from './continuous-store.js';

/** Deterministic cost and development metrics of a long-development archive, from retained files only. */
export interface LongMetrics {
  archive: string;
  rounds: number;
  agents: number;
  calls: { ordinary: number; world: number; unknownUsage: number };
  tokens: { input: number; output: number; perAgentRound: number };
  followUps: { calls: number; share: number };
  continuationQueries: number;
  /** Same-round follow-ups that answered continuation-part queries, which whole exact reads remove:
   * a lower bound (every query was a continuation part) and an upper bound (any was). */
  continuationFollowUps: {
    only: number;
    any: number;
    ordinaryInputShare: [number, number];
  };
  exhaustedDecisions: { total: number; withUnfinishedRecord: number };
  decisions: {
    plans: number;
    medianGap: number | null;
    singleExecutionShare: number;
    withInterrupts: number;
    afterCompletedPlanShare: number;
  };
  reviews: { develop: number; reuse: number; reject: number };
  interfaces: {
    developed: number;
    boundToOneActorOrItem: number;
    masteredByAtMostOne: number;
  };
}

interface Call {
  attempt: {
    id: string;
    role: 'ordinary' | 'world';
    tick: number;
    status: string;
    reason?: string;
    usage: { inputTokens: number; outputTokens: number } | null;
  };
  input: {
    longContext?: { remainingQueryBatches: number };
    retrieval?: unknown[];
  };
  response: { text: string } | null;
}
interface Step {
  repeat?: number;
  until?: unknown;
}
interface Plan {
  steps?: Step[];
  repeat?: number;
  until?: unknown;
  interrupts?: unknown[];
}

const COMPLETED = 'The actor-defined task is complete.';
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const parse = (text: string | undefined): Record<string, unknown> => {
  try {
    return object(JSON.parse(text ?? 'null'));
  } catch {
    return {};
  }
};
const asPlan = (value: Record<string, unknown>): Plan => value;
const ratio = (part: number, whole: number) => (whole ? part / whole : 0);
function median(values: number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** A plan runs every step exactly once when nothing repeats or waits for a condition. */
function singleExecution(plan: Plan): boolean {
  const once = (s: { repeat?: number; until?: unknown }) =>
    (s.repeat ?? 1) <= 1 && (s.until === null || s.until === undefined);
  return once(plan) && (plan.steps ?? []).every(once);
}

const INSTANCE = /\b(item|surface)-\d+-[a-z]+-\d+\b|\bforest-[a-z]+-\d+\b/;
/** Bound to one actor or item: the id says source-bound, the function names a person,
 * or the function or equivalence key names one item, surface or forest-source instance. */
export function boundInterface(
  ability: { id: string; function: string; equivalence: string },
  actors: string[],
): boolean {
  const names = actors.map((a) => a.charAt(0).toUpperCase() + a.slice(1));
  return (
    ability.id.includes('source-bound') ||
    INSTANCE.test(ability.function) ||
    INSTANCE.test(ability.equivalence) ||
    names.some((n) => new RegExp(`\\b${n}\\b`).test(ability.function))
  );
}

/** Metrics over calls made before round `through`; without it, over every retained call. */
export function longMetrics(archive: string, through?: number): LongMetrics {
  const state = continuousRead<V7Execution>(join(archive, 'execution.json'));
  const policy = state.world.config.longDevelopment;
  if (!policy) throw new Error(`${archive} is not a long-development archive.`);
  const rounds = Math.min(through ?? state.world.tick, state.world.tick);
  const actors = state.world.actors.map((a) => a.id);
  const calls = readdirSync(join(archive, 'calls'))
    .map((file) => continuousRead<Call>(join(archive, 'calls', file)))
    .filter((c) => through === undefined || c.attempt.tick < through);
  const ordinary = calls.filter((c) => c.attempt.role === 'ordinary');
  const opening = (c: Call) =>
    (c.input.longContext?.remainingQueryBatches ?? 0) >=
    policy.queriesPerDecision;
  const accepted = ordinary.filter((c) => c.attempt.status === 'accepted');
  const responses = accepted.map((c) => ({
    call: c,
    body: parse(c.response?.text),
  }));
  const plans = responses.flatMap(({ call, body }) =>
    typeof body.result_json === 'string'
      ? [{ call, plan: asPlan(parse(body.result_json)) }]
      : [],
  );
  const gaps = actors.flatMap((actor) => {
    const ticks = plans
      .filter((p) => (p.call.attempt as { actor?: string }).actor === actor)
      .map((p) => p.call.attempt.tick)
      .sort((a, b) => a - b);
    return ticks.slice(1).map((tick, i) => tick - (ticks[i] ?? tick));
  });
  // A paged record is unfinished when some of its parts were never retrieved in this round.
  const unfinished = (c: Call) => {
    const parts = new Map<string, { seen: Set<number>; total: number }>();
    for (const result of c.input.retrieval ?? []) {
      const section = String(object(object(result).query).section);
      const records =
        (object(result).records as Record<string, unknown>[] | undefined) ?? [];
      for (const r of records)
        if (typeof r.part === 'number' && typeof r.parts === 'number') {
          const key = `${section}:${String(r.id)}`;
          const entry = parts.get(key) ?? { seen: new Set(), total: r.parts };
          entry.seen.add(r.part);
          parts.set(key, entry);
        }
    }
    return [...parts.values()].some((p) => p.seen.size < p.total);
  };
  const exhausted = plans.filter(
    (p) => p.call.input.longContext?.remainingQueryBatches === 0,
  );
  const redecisions = ordinary.filter((c) => opening(c) && c.attempt.tick > 0);
  const followUps = { only: 0, any: 0, onlyInput: 0, anyInput: 0 };
  const sequence = [...ordinary].sort(
    (a, b) =>
      Number(a.attempt.id.split('-')[1]) - Number(b.attempt.id.split('-')[1]),
  );
  sequence.forEach((call, index) => {
    const body = parse(call.response?.text);
    const queries = (body.queries as { part?: number }[] | undefined) ?? [];
    if (
      call.attempt.status !== 'accepted' ||
      body.result_json ||
      !queries.length
    )
      return;
    const actor = (call.attempt as { actor?: string }).actor;
    const next = sequence
      .slice(index + 1)
      .find((c) => (c.attempt as { actor?: string }).actor === actor);
    if (next?.attempt.tick !== call.attempt.tick) return;
    const continued = queries.filter((q) => (q.part ?? 0) > 0).length;
    const tokens = next.attempt.usage?.inputTokens ?? 0;
    if (continued === queries.length) {
      followUps.only++;
      followUps.onlyInput += tokens;
    }
    if (continued) {
      followUps.any++;
      followUps.anyInput += tokens;
    }
  });
  const ordinaryInput = ordinary.reduce(
    (n, c) => n + (c.attempt.usage?.inputTokens ?? 0),
    0,
  );
  const reviews = { develop: 0, reuse: 0, reject: 0 };
  for (const c of calls)
    if (c.attempt.role === 'world' && c.attempt.status === 'accepted') {
      const result = parse(parse(c.response?.text).result_json as string);
      for (const review of (result.reviews as
        { decision?: string }[] | undefined) ?? [])
        if (
          review.decision === 'develop' ||
          review.decision === 'reuse' ||
          review.decision === 'reject'
        )
          reviews[review.decision]++;
    }
  const history = continuousRead<
    { tick: string | number; packages: string[] }[]
  >(join(archive, 'source-history.json')).filter(
    (r) => Number(r.tick) < rounds,
  );
  const installed = new Set(history.at(-1)?.packages ?? []);
  const developed = state.world.abilities.filter(
    (a) => !a.authored && installed.has(a.revision),
  );
  const mastery = (id: string) =>
    state.world.actors.filter((a) => a.mastered.includes(id)).length;
  const input = calls.reduce(
    (n, c) => n + (c.attempt.usage?.inputTokens ?? 0),
    0,
  );
  const output = calls.reduce(
    (n, c) => n + (c.attempt.usage?.outputTokens ?? 0),
    0,
  );
  return {
    archive,
    rounds,
    agents: actors.length,
    calls: {
      ordinary: ordinary.length,
      world: calls.length - ordinary.length,
      unknownUsage: calls.filter((c) => !c.attempt.usage).length,
    },
    tokens: {
      input,
      output,
      perAgentRound: ratio(input + output, actors.length * rounds),
    },
    followUps: {
      calls: ordinary.filter((c) => !opening(c)).length,
      share: ratio(ordinary.filter((c) => !opening(c)).length, ordinary.length),
    },
    continuationQueries: responses.reduce(
      (n, { body }) =>
        n +
        ((body.queries as { part?: number }[] | undefined) ?? []).filter(
          (q) => (q.part ?? 0) > 0,
        ).length,
      0,
    ),
    continuationFollowUps: {
      only: followUps.only,
      any: followUps.any,
      ordinaryInputShare: [
        ratio(followUps.onlyInput, ordinaryInput),
        ratio(followUps.anyInput, ordinaryInput),
      ],
    },
    exhaustedDecisions: {
      total: exhausted.length,
      withUnfinishedRecord: exhausted.filter((p) => unfinished(p.call)).length,
    },
    decisions: {
      plans: plans.length,
      medianGap: median(gaps),
      singleExecutionShare: ratio(
        plans.filter((p) => singleExecution(p.plan)).length,
        plans.length,
      ),
      withInterrupts: plans.filter((p) => (p.plan.interrupts ?? []).length)
        .length,
      afterCompletedPlanShare: ratio(
        redecisions.filter((c) => c.attempt.reason === COMPLETED).length,
        redecisions.length,
      ),
    },
    reviews,
    interfaces: {
      developed: developed.length,
      boundToOneActorOrItem: developed.filter((a) => boundInterface(a, actors))
        .length,
      masteredByAtMostOne: developed.filter((a) => mastery(a.id) <= 1).length,
    },
  };
}

if (process.argv[1]?.endsWith('long-metrics.ts')) {
  const [archive = 'experiment/ex13', through] = process.argv
    .slice(2)
    .filter((a) => a !== '--');
  console.log(
    JSON.stringify(
      longMetrics(archive, through === undefined ? undefined : Number(through)),
      null,
      2,
    ),
  );
}
