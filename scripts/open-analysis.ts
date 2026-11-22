import { openEvidence } from './open-evidence.js';
import { continuousRegistry } from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import type {
  V7Execution,
  V7RoundRecord,
} from '../apps/simulator/src/continuous-run.js';

export const OPEN_OBJECTIVE =
  'Observe early cumulative open development in one fresh three-actor world for a target 1600 rounds under fixed policy and 650/60/20 attempt budgets. Grounded questions, dependent capabilities and non-survival experiences are observations, not mandatory inventions or evidence of inevitable civilization.';
export function measureOpen(
  state: V7Execution,
  frames: V7World[],
  rounds: V7RoundRecord[],
) {
  const world = state.world,
    events = rounds.flatMap((r) => r.events);
  const packages = continuousRegistry(world).packages.filter((p) =>
    world.revisions.includes(`${p.id}@${String(p.version)}`),
  );
  return {
    evidence: openEvidence(frames, rounds),
    inheritSkills: world.config.development?.inheritSkills,
    scope: world.config.development?.scope,
    authoredBaseline: world.config.development?.baseline,
    initialRevisions: frames[0]?.revisions,
    implementations: packages
      .filter((p) => p.scope)
      .map((p) => ({
        package: `${p.id}@${String(p.version)}`,
        scope: p.scope,
        reuse: p.reuse ?? null,
        abilities: p.abilities.map((a) => ({
          id: a.id,
          equivalence: a.equivalence,
          dependencies: a.dependencies ?? null,
        })),
      })),
    projectUpdates: rounds.flatMap((r) =>
      Object.entries(r.memory).flatMap(([actor, m]) =>
        (m.projects ?? []).map((p) => ({ tick: r.tick, actor, project: p })),
      ),
    ),
    finalPersonalRecords: world.actors.map((a) => ({
      actor: a.id,
      projects: a.memory.projects ?? {},
      knowledge: a.memory.knowledge ?? {},
      relationships: a.relationships,
    })),
    confirmedInformation: events.filter(
      (e) => e.type === 'information-confirmed',
    ),
    trials: events.filter(
      (e) => e.type === 'trial-result' || e.type === 'trial-material-consumed',
    ),
    practice: events.filter((e) => e.type === 'practice-confirmed'),
    exchanges: events.filter(
      (e) => e.type === 'finding-offered' || e.type === 'finding-accepted',
    ),
    processes: events.filter((e) =>
      ['process-progress', 'process-completed', 'process-stopped'].includes(
        e.type,
      ),
    ),
    ecology: events.filter((e) =>
      [
        'seed-dispersed',
        'plant-established',
        'animal-fed',
        'animal-born',
        'animal-injured',
        'local-hazard',
      ].includes(e.type),
    ),
    outstandingProcesses: world.processes,
    materialProvenance: world.stacks
      .filter((s) => s.processing)
      .map((s) => ({
        id: s.id,
        resource: s.resource,
        quantity: s.quantity,
        owner: s.owner,
        origin: s.origin,
        processing: s.processing,
      })),
    context: state.attempts.map((a) => ({
      id: a.id,
      role: a.role,
      tick: a.tick,
      reason: a.reason,
      status: a.status,
      inputUtf8Bytes: a.contextBytes ?? null,
      inputCodeUnits: a.contextCodeUnits ?? null,
      inputTokens: a.usage?.inputTokens ?? null,
      outputTokens: a.usage?.outputTokens ?? null,
      elapsedMs: a.elapsedMs,
    })),
    interpretation:
      'Project completion and benefit fields are actor claims. Corroborate them with actual events, material provenance and subsequent execution. Fixtures and historical implementation reuse are not independent emergent discoveries. Context byte measurements cover input content; reported provider tokens include actual model accounting. Internal development usage is unknown.',
  };
}
