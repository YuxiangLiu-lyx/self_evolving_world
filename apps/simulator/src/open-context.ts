import type { V7Actor, V7World } from '@self-evolving-world/world-core';
import { v7PublicCatalogue, v7Json } from '@self-evolving-world/world-core';

export const OPEN_GOAL =
  'Maintain health and tolerable risk, understand unknowns through evidence, develop reusable capabilities, and improve personal and shared living. You may choose, revise, pause or abandon your own questions and projects.';
/** Bounded views do not erase retained records. consult provides details and page-index discovery. */
export function openMemory(world: V7World, actor: V7Actor) {
  const config = world.config.development;
  if (!config) return {};
  const projects = Object.values(actor.memory.projects ?? {}).sort(
    (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
  );
  const knowledge = Object.values(actor.memory.knowledge ?? {}).sort(
    (a, b) => b.tick - a.tick,
  );
  return {
    offers: Object.fromEntries(
      Object.entries(world.state).filter(([key]) =>
        key.startsWith(`open:offer:${actor.id}:`),
      ),
    ),
    projects: projects.slice(0, config.projectLimit),
    projectIndex: projects
      .slice(0, 24)
      .map((p) => ({ id: p.id, status: p.status, updatedAt: p.updatedAt })),
    projectCount: projects.length,
    knowledge: knowledge.slice(0, config.knowledgeLimit),
    knowledgeCount: knowledge.length,
    recordAccess:
      'consult project or knowledge with its ID for details, or subject page:N for zero-based index pages of 24 records. Records are retained; claims are not verified physical accomplishments.',
  };
}
export function openCatalogue(world: V7World, actor?: V7Actor) {
  const catalogue = v7PublicCatalogue(world, actor?.id),
    config = world.config.development;
  if (!config) return catalogue;
  const detailed = new Set([
    ...config.baseline,
    ...(actor
      ? [
          ...new Set([
            ...(actor.memory.abilityDetails ?? []),
            ...actor.mastered
              .filter((id) => !config.baseline.includes(id))
              .reverse(),
          ]),
        ].slice(0, config.detailLimit)
      : world.abilities
          .filter((a) => !a.authored)
          .slice(-config.detailLimit)
          .map((a) => a.id)),
    ...(actor?.learning ? [actor.learning.ability] : []),
  ]);
  return {
    ...catalogue,
    interfaces: catalogue.interfaces.filter((a) => detailed.has(a.id)),
    capabilityIndex: world.abilities.map((a) => ({
      id: a.id,
      function: a.function.slice(0, 240),
      equivalence: a.equivalence,
      prerequisites: a.prerequisites,
      learning: a.learning,
      costSummary: a.costs.slice(0, 160),
      effectSummary: a.effects.slice(0, 240),
      mastered: actor?.mastered.includes(a.id) ?? false,
    })),
    detailAccess:
      'All entries belong to this experiment. Use consult ability with its ID to retain its full executable schema for subsequent decisions. Public implementation does not grant personal mastery.',
  };
}
export function openExtensionSummary(actor: V7Actor) {
  return Object.fromEntries(
    Object.entries(actor.extensionState)
      .filter(
        ([key]) =>
          key.startsWith('open:offer:') ||
          key === 'execution:operation' ||
          key === 'refuge:wetness' ||
          key === 'refuge:exposure' ||
          key.startsWith('open:archive:'),
      )
      .map(([key, value]) => [
        key,
        v7Json(
          key.startsWith('open:archive:') && Array.isArray(value)
            ? {
                records: value.length,
                access: 'archive-project inspect with the exact project ID',
              }
            : value,
        ),
      ]),
  );
}
