import {
  collectiveGroups,
  collectiveShared,
} from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import type {
  V7Execution,
  V7RoundRecord,
} from '../apps/simulator/src/continuous-run.js';

export function measureCollective(
  state: V7Execution,
  frames: V7World[],
  rounds: V7RoundRecord[],
) {
  const policy = state.world.config.collective;
  if (!policy)
    throw new Error('Collective measurements require a collective experiment.');
  const window = (start: number, end: number, continuation: boolean) => {
    const selected = rounds.filter((r) => r.tick > start && r.tick <= end),
      events = selected.flatMap((r) => r.events);
    const boundary = state.collectiveContinuation;
    const attempts = continuation
      ? state.attempts.slice(boundary?.attempts ?? state.attempts.length)
      : state.attempts.slice(0, boundary?.attempts ?? state.attempts.length);
    const observations = frames.filter((f) => f.tick >= start && f.tick <= end),
      final = observations.at(-1) ?? state.world;
    const histogram = (values: string[]) =>
      values.reduce<Record<string, number>>((r, value) => {
        r[value] = (r[value] ?? 0) + 1;
        return r;
      }, {});
    const progress = events.filter(
      (e) =>
        e.success &&
        (e.type === 'information-confirmed' ||
          e.type === 'practice-confirmed') &&
        e.data.qualified === true,
    );
    const measuredTokens = attempts.reduce(
      (n, a) => n + (a.usage ? a.usage.inputTokens + a.usage.outputTokens : 0),
      0,
    );
    return {
      start,
      end: Math.min(end, state.world.tick),
      rounds: selected.length,
      members: final.actors.map((a) => {
        const personal = events.filter((e) => e.actor === a.id);
        return {
          id: a.id,
          group: a.collective?.group,
          vitals: a.vitals,
          lives: a.life,
          happiness: a.wellbeing.total,
          mental: a.experience?.mental,
          tendencies: a.collective?.tendencies,
          currentIntent: a.collective?.intent,
          trust: a.collective?.trust,
          experienceChanges: a.collective?.updates,
          actions: histogram(
            selected.flatMap((r) =>
              r.actions[a.id]?.interface
                ? [r.actions[a.id]?.interface ?? '']
                : [],
            ),
          ),
          requests: personal
            .filter((e) => e.type === 'requested')
            .map((e) => ({ tick: e.tick, id: e.id, function: e.description })),
          mastered: a.mastered.filter(
            (id) => !state.world.config.development?.baseline.includes(id),
          ),
          intentions: [
            ...new Set(
              selected.flatMap((r) =>
                r.memory[a.id]?.intention
                  ? [r.memory[a.id]?.intention ?? '']
                  : [],
              ),
            ),
          ],
          projects: Object.values(a.memory.projects ?? {}),
          personallyVerified: Object.values(a.memory.knowledge ?? {}).filter(
            (k) => k.verified,
          ),
          failureReasons: histogram(
            personal.filter((e) => !e.success).map((e) => e.description),
          ),
        };
      }),
      groups: collectiveGroups(final).map((g) => ({
        ...g,
        reports: collectiveShared(final, g.id).reports.map((r) => ({
          actor: r.actor,
          tick: r.tick,
          findings: r.facts.length,
        })),
        board: collectiveShared(final, g.id).board,
      })),
      informationEvents: events.filter((e) =>
        [
          'message',
          'collective-report',
          'collective-read',
          'collective-response',
          'lesson-offered',
          'lesson-accepted',
          'finding-offered',
          'finding-accepted',
        ].includes(e.type),
      ),
      groundedProgressEvents: progress,
      persistentOutputs: final.objects
        .filter((o) => o.createdBy !== null)
        .map((o) => ({
          id: o.id,
          kind: o.kind,
          createdAt: o.createdAt,
          createdBy: o.createdBy,
          revision: o.revision,
          state: o.data,
        })),
      deaths: events.filter((e) => e.type === 'died'),
      cost: {
        attempts: attempts.length,
        roles: histogram(attempts.map((a) => a.role)),
        ordinaryModes: histogram(
          attempts
            .filter((a) => a.role === 'ordinary')
            .map((a) =>
              policy.arm === 'A'
                ? 'shared-control'
                : collectiveGroups(final).some((g) => g.id === a.actor)
                  ? 'coordination'
                  : 'individual',
            ),
        ),
        decisionReasons: histogram(
          attempts.filter((a) => a.role === 'ordinary').map((a) => a.reason),
        ),
        failureReasons: histogram(
          attempts
            .filter((a) => a.error)
            .map((a) => a.error ?? 'Unknown failure'),
        ),
        knownInputTokens: attempts.reduce(
          (n, a) => n + (a.usage?.inputTokens ?? 0),
          0,
        ),
        knownOutputTokens: attempts.reduce(
          (n, a) => n + (a.usage?.outputTokens ?? 0),
          0,
        ),
        unknownUsageAttempts: attempts.filter((a) => !a.usage).length,
        unknownUsageReservations: attempts
          .filter((a) => !a.usage)
          .reduce((n, a) => n + (a.reservedTokens ?? 0), 0),
        maximumContextBytes: Math.max(
          0,
          ...attempts.map((a) => a.contextBytes ?? 0),
        ),
        meanContextBytes: attempts.length
          ? attempts.reduce((n, a) => n + (a.contextBytes ?? 0), 0) /
            attempts.length
          : 0,
        elapsedMs: attempts.reduce((n, a) => n + (a.elapsedMs ?? 0), 0),
        environmentRoundsPerOrdinaryCall:
          selected.length /
          Math.max(1, attempts.filter((a) => a.role === 'ordinary').length),
        groundedProgressEventsPerMillionKnownTokens: measuredTokens
          ? (progress.length * 1e6) / measuredTokens
          : null,
        developmentHandoffs: continuation
          ? state.developments.length -
            (boundary?.developments ?? state.developments.length)
          : (boundary?.developments ?? state.developments.length),
        developmentTokens: null,
      },
    };
  };
  return {
    policy,
    initialBaseline: state.world.config.development?.baseline,
    attention: state.attention,
    continuationBoundary: state.collectiveContinuation ?? null,
    short: window(
      0,
      state.collectiveContinuation?.round ??
        Math.min(policy.shortRounds, state.world.tick),
      false,
    ),
    continuation: state.collectiveContinuation
      ? window(state.collectiveContinuation.round, state.world.tick, true)
      : null,
    interpretation:
      'Architecture comparison only. Authored scheduling, preferences and feedback are not inventions. Actor projects are claims; event counts are not sustained productivity or a causal effect. Progress per token includes only recorded grounded-information/practice events; unknown development usage prevents an all-cost efficiency claim.',
  };
}
