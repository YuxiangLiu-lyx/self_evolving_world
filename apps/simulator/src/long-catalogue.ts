import type { V7Ability, V7World } from '@self-evolving-world/world-core';
import { longVisibleAbilities } from './long-capability-view.js';
export const CATALOGUE_ACCESS =
  'Catalogue summaries only; use exact ids with section abilities for complete schema, applicability, costs and effects. Public availability is not personal mastery or permission. Original retrieval records remain retained.';
export function catalogueSummary(a: V7Ability, mastered: string[] | undefined) {
  return {
    id: a.id,
    name: a.name,
    function: a.function.slice(0, 240),
    learning: a.learning,
    ...(mastered ? { mastered: mastered.includes(a.id) } : {}),
  };
}
const object = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
/** Render broad catalogue searches as an index, including pre-repair retained pages.
 * Exact-id queries, physical observations and operation/escrow details are untouched. */
export function catalogueRetrievalView(
  world: V7World,
  actor: string,
  results: unknown[],
): unknown[] {
  const abilities = new Map(
      longVisibleAbilities(world, actor).map((a) => [a.id, a]),
    ),
    mastered = world.actors.find((a) => a.id === actor)?.mastered;
  return results.map((raw) => {
    const result = object(raw),
      query = object(result?.query);
    if (
      !result ||
      query?.section !== 'abilities' ||
      !Array.isArray(query.ids) ||
      query.ids.length !== 0 ||
      !Array.isArray(result.records)
    )
      return raw;
    const rows = result.records.map(object);
    if (
      rows.some((r) => !r || typeof r.id !== 'string' || !abilities.has(r.id))
    )
      return raw;
    return {
      ...result,
      access: CATALOGUE_ACCESS,
      records: rows.map((r) => {
        const a =
          r && typeof r.id === 'string' ? abilities.get(r.id) : undefined;
        if (!a) throw new Error('Missing same-scope catalogue entry.');
        return { id: a.id, value: catalogueSummary(a, mastered) };
      }),
    };
  });
}
