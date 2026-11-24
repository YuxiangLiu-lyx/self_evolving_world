import type { V7Actor, V7Plan } from './continuous-types.js';
import { v7Record } from './continuous-data.js';

/** Bounds of the opt-in private memory written through the plan output. */
export const EXPRESSION_MEMORY = { cares: 300, people: 8, view: 200 } as const;

export type ExpressionPersonal = Pick<V7Plan, 'cares' | 'views'>;

/** Parse the optional private memory fields of a plan. Null means omitted. Violations
 * are ordinary errors, so a rejected decision can receive one bounded correction. */
export function expressionPersonal(
  plan: Record<string, unknown>,
): ExpressionPersonal {
  const result: ExpressionPersonal = {};
  if (plan.cares !== undefined && plan.cares !== null) {
    if (typeof plan.cares !== 'string')
      throw new Error('cares must be text or null.');
    if (plan.cares.length > EXPRESSION_MEMORY.cares)
      throw new Error(
        `cares is limited to ${String(EXPRESSION_MEMORY.cares)} characters.`,
      );
    result.cares = plan.cares;
  }
  if (plan.views !== undefined && plan.views !== null) {
    const entries = Object.entries(v7Record(plan.views));
    if (entries.length > EXPRESSION_MEMORY.people)
      throw new Error(
        `views holds at most ${String(EXPRESSION_MEMORY.people)} people.`,
      );
    for (const [person, view] of entries) {
      if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(person))
        throw new Error('views keys must be person ids.');
      if (typeof view !== 'string')
        throw new Error('Each view must be text; an empty string forgets it.');
      if (view.length > EXPRESSION_MEMORY.view)
        throw new Error(
          `Each view is limited to ${String(EXPRESSION_MEMORY.view)} characters.`,
        );
    }
    result.views = Object.fromEntries(entries) as Record<string, string>;
  }
  return result;
}

/** Apply a private memory update. Omitted fields persist; an empty text forgets.
 * At most the eight most recently updated people are kept. Views are applied in
 * person-id order so replay does not depend on object key order. */
export function expressionSaveMemory(
  actor: V7Actor,
  update: ExpressionPersonal,
  tick: number,
): void {
  if (update.cares !== undefined) {
    if (update.cares === '') delete actor.memory.cares;
    else actor.memory.cares = update.cares;
  }
  if (!update.views) return;
  let views = actor.memory.views ?? [];
  for (const person of Object.keys(update.views).sort()) {
    const view = update.views[person] ?? '';
    views = views.filter((v) => v.person !== person);
    if (view !== '') views.push({ person, view, updatedAt: tick });
  }
  views = views.slice(-EXPRESSION_MEMORY.people);
  if (views.length) actor.memory.views = views;
  else delete actor.memory.views;
}
