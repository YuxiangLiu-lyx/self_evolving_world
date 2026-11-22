import {
  toolAssessmentResult,
  toolAssessmentHistory,
} from '@self-evolving-world/world-core';
import {
  trayClearanceResult,
  trayClearanceHistory,
} from '@self-evolving-world/world-core';
import {
  personalInventoryResult,
  smallDryingAssessment,
  surfaceDiagnosticResult,
  surfaceDiagnosticHistory,
  collectiveGroups,
  collectiveShared,
  forestClimate,
  v7Observe,
  v7Json,
  v7Load,
  v7Distance,
} from '@self-evolving-world/world-core';
import { forestExperienceSummary } from './forest-experience-context.js';
import type {
  V7Ability,
  V7Cursor,
  V7Data,
  V7World,
} from '@self-evolving-world/world-core';
import { COLLECTIVE_GOAL } from './collective-scenario.js';

export interface CollectiveInput {
  protocol: 'continuous-v1';
  tick: number;
  goal: string;
  collective: {
    mode: 'individual' | 'coordination' | 'shared-control';
    arm: 'A' | 'B';
    group: string;
    eligible: string[];
    output: number;
  };
  catalogue: { interfaces: V7Ability[]; events: string[] };
  payload: V7Data;
}
/** Select complete records with explicit omitted counts; never convert a partial quote into a fact. */
export function collectiveRecords<T>(
  values: T[],
  limit: number,
  characters: number,
) {
  const shown: T[] = [];
  let size = 0;
  for (const record of values) {
    const cost = JSON.stringify(record).length;
    if (shown.length < limit && size + cost <= characters) {
      shown.push(record);
      size += cost;
    }
  }
  return { shown, omitted: values.length - shown.length };
}
const records = collectiveRecords;
function personal(
  world: V7World,
  id: string,
  cursor?: V7Cursor,
  compact = false,
) {
  const o = v7Observe(world, id),
    a = o.self;
  const experience = forestExperienceSummary(a);
  const object = (x: (typeof o.objects)[number]) => ({
    id: x.id,
    kind: x.kind,
    spatial: x.spatial,
    data: x.data,
  });
  const own = o.stacks.filter((s) => s.owner === id);
  const inspectedInventory = personalInventoryResult(world, a);
  const surfaceAssessment = surfaceDiagnosticResult(a);
  return {
    id: a.id,
    name: a.name,
    position: a.position,
    vitals: a.vitals,
    learning: a.learning,
    mastered: records([...a.mastered].reverse(), 32, 1500),
    lives: a.life,
    load: v7Load(world, a),
    wellbeing: {
      total: a.wellbeing.total,
      sources: records(
        a.wellbeing.sources.filter((s) => s.value > 0),
        5,
        1500,
      ),
    },
    experience:
      compact && experience
        ? {
            mentalState: experience.mentalState,
            monotony: experience.monotony,
            trend: experience.trend,
            timeByAction: experience.timeByAction,
            totalEffort: experience.totalEffort,
            recoveredEnergy: experience.recoveredEnergy,
            repeatedFailures: experience.repeatedFailures,
          }
        : experience,
    preferences: a.collective?.tendencies,
    trust: a.collective?.trust,
    commitments: a.collective?.commitments,
    intention: a.memory.intention ?? '',
    personalIntent: a.collective?.intent ?? null,
    operation: cursor?.operation ?? null,
    previousTask: cursor
      ? {
          reason: cursor.reason,
          step: cursor.step,
          repetition: cursor.repetition,
          cycle: cursor.cycle,
        }
      : null,
    projects: records(
      Object.values(a.memory.projects ?? {}).sort(
        (x, y) => (y.updatedAt ?? 0) - (x.updatedAt ?? 0),
      ),
      compact ? 1 : 4,
      compact ? 1200 : 4200,
    ),
    knowledge: records(
      Object.values(a.memory.knowledge ?? {}).sort((x, y) => y.tick - x.tick),
      compact ? 2 : 8,
      compact ? 500 : 1600,
    ),
    received: records(
      [...(a.collective?.received ?? [])].reverse(),
      compact ? 1 : 4,
      compact ? 900 : 4200,
    ),
    notes: records(a.memory.notes, compact ? 2 : 6, compact ? 300 : 1000),
    discoveries: records(
      Object.entries(a.memory.discoveries ?? {}).map(([resource, facts]) => ({
        resource,
        facts,
      })),
      compact ? 4 : 12,
      compact ? 500 : 1600,
    ),
    ...(toolAssessmentResult(a)
      ? {
          toolAssessment: toolAssessmentResult(a),
          retainedToolAssessments: toolAssessmentHistory(a).map((r) => ({
            assessmentId: r.assessmentId,
            tick: r.tick,
          })),
        }
      : {}),
    ...(trayClearanceResult(a)
      ? {
          trayClearance: trayClearanceResult(a),
          retainedTrayAssessments: trayClearanceHistory(a).map((r) => ({
            assessmentId: r.assessmentId,
            tick: r.tick,
          })),
        }
      : {}),
    ...(smallDryingAssessment(a)
      ? { smallDryingAssessment: smallDryingAssessment(a) }
      : {}),
    ...(a.extensionState['root-small-drying:inspection']
      ? {
          smallDryingInspection:
            a.extensionState['root-small-drying:inspection'],
        }
      : {}),
    ...(inspectedInventory ? { inspectedInventory } : {}),
    ...(surfaceAssessment
      ? {
          surfaceAssessment,
          retainedSurfaceAssessments: surfaceDiagnosticHistory(a).map((r) => ({
            assessmentId: r.assessmentId,
            tick: r.tick,
            legacy: r.legacy ?? false,
          })),
        }
      : {}),
    inventory: records(own, compact ? 8 : 16, compact ? 1600 : 3200),
    observation: {
      actors: o.actors,
      objects: records(
        o.objects
          .sort(
            (x, y) =>
              v7Distance(a.position, x.spatial) -
              v7Distance(a.position, y.spatial),
          )
          .map(object),
        compact ? 5 : 14,
        compact ? 1600 : 4200,
      ),
      ground: records(
        o.stacks.filter((s) => s.owner === null),
        compact ? 2 : 8,
        compact ? 500 : 1800,
      ),
      terrain: o.terrain.map((t) => [t.x, t.y, t.kind]),
      events: records(o.events, compact ? 3 : 8, compact ? 700 : 2200),
    },
    remembered: records(
      a.memory.objects
        .filter((m) => !o.objects.some((x) => x.id === m.object.id))
        .sort(
          (x, y) =>
            v7Distance(a.position, x.object.spatial) -
            v7Distance(a.position, y.object.spatial),
        )
        .map((m) => ({ ...object(m.object), seenAt: m.seenAt })),
      compact ? 2 : 6,
      compact ? 600 : 1800,
    ),
    environment: forestClimate(world, a.position),
    factualNeeds: {
      roundsSinceParticipation: world.tick - (a.collective?.lastSocial ?? 0),
      roundsSinceConfirmedProgress:
        world.tick - (a.collective?.lastProgress ?? 0),
    },
  };
}
export function collectiveInput(
  world: V7World,
  groupId: string,
  eligible: string[],
  cursors: Record<string, V7Cursor>,
  mode: CollectiveInput['collective']['mode'],
  remainingCalls: number,
): CollectiveInput {
  const policy = world.config.collective;
  if (!policy) throw new Error('Missing collective input policy.');
  const group = collectiveGroups(world).find((g) => g.id === groupId);
  if (
    !group ||
    eligible.some((id) => !group.members.includes(id)) ||
    (mode === 'individual' && eligible.length !== 1)
  )
    throw new Error(
      'Decision context must address only the selected group members.',
    );
  const shared = collectiveShared(world, groupId);
  const selected = world.actors.filter((a) =>
    mode === 'shared-control'
      ? group.members.includes(a.id)
      : eligible.includes(a.id),
  );
  // Public B coordination reads ONLY immutable public identity metadata and actual reports.
  const known = new Set([
    ...(world.config.development?.baseline ?? []),
    ...(mode === 'coordination'
      ? shared.reports.flatMap((r) => r.knownAbilities)
      : selected.flatMap((a) => a.collective?.knownAbilities ?? [])),
  ]);
  const details = new Set([
    ...(world.config.development?.baseline ?? []),
    ...selected.flatMap((a) =>
      [
        ...(a.memory.abilityDetails ?? []),
        ...a.mastered
          .filter((x) => !world.config.development?.baseline.includes(x))
          .reverse(),
      ].slice(0, 4),
    ),
  ]);
  const catalogue = {
    interfaces: world.abilities.filter(
      (a) => known.has(a.id) && details.has(a.id),
    ),
    events: [
      ...new Set([
        ...(Array.isArray(world.state['collective:baselineEvents'])
          ? world.state['collective:baselineEvents'].filter(
              (x): x is string => typeof x === 'string',
            )
          : []),
        ...selected.flatMap((a) =>
          v7Observe(world, a.id).events.map((e) => e.type),
        ),
        ...world.abilities
          .filter((a) => known.has(a.id) && a.practiceEvidence)
          .map((a) => a.practiceEvidence ?? ''),
      ]),
    ],
  };
  const payload: V7Data = {
    group: v7Json(group),
    remainingSharedOrdinaryCalls: remainingCalls,
    rules: v7Json({
      hunger: world.config.hunger,
      starvation: world.config.starvation,
      restRecovery: world.config.restRecovery,
      energyCap: world.config.energyCap,
      speed: world.config.speed,
      interaction: world.config.interaction,
      bounds: { width: world.config.width, height: world.config.height },
      lives: world.config.forest?.lives,
      year: world.config.forest?.year,
    }),
    recordAccess:
      'Omitted personal records remain retained: consult project/knowledge with an ID or page:N. Current-world capability discovery uses consult ability page:N at the meeting location, or actual nearby teaching. Individual mastery still requires learning. Capability contracts shown below are executable interfaces, not recommendations.',
    knownCapabilityIndex: v7Json(
      records(
        world.abilities
          .filter((a) => known.has(a.id) && !details.has(a.id))
          .map((a) => ({
            id: a.id,
            function: a.function,
            learning: a.learning,
          })),
        12,
        1800,
      ),
    ),
  };
  if (mode === 'coordination')
    payload.shared = v7Json({
      board: shared.board,
      reports: shared.reports.map((report) => ({
        ...report,
        facts: records(report.facts, 4, 1200),
        inventory: records(report.inventory, 12, 1800),
        knownAbilities: records(report.knownAbilities, 32, 1500),
      })),
    });
  else
    payload.members = v7Json(
      selected.map((a) =>
        personal(world, a.id, cursors[a.id], mode === 'shared-control'),
      ),
    );
  const input: CollectiveInput = {
    protocol: world.protocol,
    tick: world.tick,
    goal: COLLECTIVE_GOAL,
    collective: {
      mode,
      arm: policy.arm,
      group: groupId,
      eligible,
      output: policy.tokens.output,
    },
    catalogue,
    payload,
  };
  return input;
}
