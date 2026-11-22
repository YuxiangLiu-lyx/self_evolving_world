import type { V7World } from '@self-evolving-world/world-core';
import type { V7RoundRecord } from '../apps/simulator/src/continuous-run.js';

/** Descriptive evidence, not inferred purpose, causality or automatic success scores. */
export function openEvidence(frames: V7World[], rounds: V7RoundRecord[]) {
  const events = rounds.flatMap((r) => r.events);
  const continuing = new Map<
    string,
    {
      actor: string;
      ability: string;
      startedAt: number;
      firstObserved: number;
      lastObserved: number;
      observedRounds: number;
      maximumElapsed: number;
      unchangedRemainingTransitions: number;
      remaining: number | null;
    }
  >();
  for (const r of rounds)
    for (const [actor, task] of Object.entries(r.tasks)) {
      const op = task.operation;
      if (!op) continue;
      const key = `${actor}:${String(op.startedAt)}:${op.action.interface}`;
      const previous = continuing.get(key);
      continuing.set(key, {
        actor,
        ability: op.action.interface,
        startedAt: op.startedAt,
        firstObserved: previous?.firstObserved ?? r.tick,
        lastObserved: r.tick,
        observedRounds: (previous?.observedRounds ?? 0) + 1,
        maximumElapsed: Math.max(previous?.maximumElapsed ?? 0, op.elapsed),
        unchangedRemainingTransitions:
          (previous?.unchangedRemainingTransitions ?? 0) +
          (previous &&
          previous.lastObserved === r.tick - 1 &&
          op.remaining !== null &&
          op.remaining === previous.remaining
            ? 1
            : 0),
        remaining: op.remaining,
      });
    }
  const objects = new Map(
    frames.flatMap((f) =>
      f.objects
        .filter((o) => o.createdBy !== null)
        .map((o) => [o.id, o] as const),
    ),
  );
  const updates = new Map<string, { tick: number; status: string }>();
  const transitions: {
    tick: number;
    actor: string;
    project: string;
    previous: string;
    status: string;
  }[] = [];
  for (const r of rounds)
    for (const [actor, memory] of Object.entries(r.memory))
      for (const p of memory.projects ?? []) {
        const key = `${actor}:${p.id}`,
          previous = updates.get(key);
        if (previous && previous.status !== p.status)
          transitions.push({
            tick: r.tick,
            actor,
            project: p.id,
            previous: previous.status,
            status: p.status,
          });
        updates.set(key, { tick: r.tick, status: p.status });
      }
  return {
    interpretation:
      'Continuing work is not completed use. Unchanged remaining work is a stall candidate, not proof of a bug: passive waiting can be legitimate. Cross-actor object interactions are successful targeted events, not automatically benefits. Project status is an actor claim. Exposure readings are distinct from completed beneficial rest.',
    continuingOperations: [...continuing.values()],
    projectStatusTransitions: transitions,
    physicalMeasurements: events.filter((e) =>
      [
        'assay-reading',
        'food-examination-completed',
        'shelter-inspected',
        'shelter-material-tested',
        'woven-support-test',
        'hardness-comparison-completed',
        'contact-calibration-completed',
        'metrology-measured',
        'metrology-load-tested',
        'preservation-reading',
        'short-refuge-trial',
        'short-refuge-exposure',
      ].includes(e.type),
    ),
    repeatedObstructions: events.filter(
      (e) =>
        e.type.endsWith('-progress') &&
        /missing|unavailable|insufficient|waiting/i.test(e.description),
    ),
    preservationTrials: events.filter((e) =>
      [
        'preservation-inspected',
        'preservation-reading',
        'preservation-completed',
        'preservation-stopped',
      ].includes(e.type),
    ),
    foodWaterTransfers: events.filter(
      (e) => e.type === 'preservation-progress' && e.data.audit !== undefined,
    ),
    shortRefugeTrials: events.filter((e) =>
      [
        'short-refuge-assessed',
        'short-refuge-trial',
        'short-refuge-completed',
        'short-refuge-exposure',
        'short-refuge-stopped',
      ].includes(e.type),
    ),
    waterOperations: events.filter((e) =>
      [
        'water-access-inspected',
        'water-cup-completed',
        'water-withdrawn',
        'material-contact-wetted',
        'water-cup-failed',
        'water-operation-stopped',
      ].includes(e.type),
    ),
    waterDeposits: events.filter((e) => e.type === 'water-spilled'),
    crossActorObjectInteractions: events.flatMap((e) => {
      const object = e.target ? objects.get(e.target) : undefined;
      return object && e.success && e.actor && e.actor !== object.createdBy
        ? [
            {
              tick: e.tick,
              actor: e.actor,
              creator: object.createdBy,
              object: object.id,
              type: e.type,
              interface: e.interface,
              data: e.data,
            },
          ]
        : [];
    }),
    completedBeneficialRest: events.filter(
      (e) => e.type === 'shelter-rest-experience',
    ),
    exposureReadings: events.filter(
      (e) => e.type === 'shelter-exposure-measured',
    ),
    actualPracticeMilestones: events.filter(
      (e) => e.type === 'practice-confirmed',
    ),
    finalGeneratedObjects: [...objects.values()].map((o) => ({
      id: o.id,
      kind: o.kind,
      creator: o.createdBy,
      createdAt: o.createdAt,
      revision: o.revision,
      presentAtBoundary: frames
        .at(-1)
        ?.objects.some((current) => current.id === o.id),
      state: o.data,
    })),
  };
}
