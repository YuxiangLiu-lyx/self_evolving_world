import type {
  V7ActionContext,
  V7HandlerResult,
  V7Package,
  V7Stack,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7RoundNumber, v7String } from './continuous-data.js';
import { FOREST_BASE } from './forest-foundation.js';
import {
  forestReferenceSpelling,
  forestResolveReference,
} from './forest-references.js';

/** ex24: eat a whole-unit quantity of one named food resource from one owned stack chosen
 * deterministically: among the person's own unreserved stacks of exactly that resource that
 * ordinary eat could target and that each hold the whole quantity alone, the earliest-harvested,
 * stacks without a harvest round last, ties by exact item id in code-unit order. The eating is
 * the ordinary eat of foundation-forest@1 (handler forest.eat), called with that exact item id,
 * so its energy, nutrition, toxicity, satiety cap, food condition, meal effects, events and
 * failures are its own; this operation adds no cost, food, safety claim or reward. Stacks are
 * never combined. Eat is atomic, so nothing is reserved or held across rounds. */

const ID = 'eat-oldest-owned-food';
const REVISION = `${ID}@1`;
const HANDLER = `long.${ID}`;
const EVENT = 'oldest-food-stack-eaten';
/** The ordinary eat this operation calls; that handler does all of the eating. */
const EAT = {
  ability: 'eat',
  revision: 'foundation-forest@1',
  handler: 'forest.eat',
};
const RESOURCE = /^resource:([^\s:]+)$/;
const RULE =
  'earliest harvest round first, stacks without one last, then exact item id in code-unit order';

const nothing = (why: string) => new Error(`${why} Nothing was spent.`);

/** Earliest harvest round first, stacks without one last, then exact item id in code-unit order. */
function order(a: V7Stack, b: V7Stack): number {
  if (a.harvestedAt !== b.harvestedAt) {
    if (a.harvestedAt === undefined) return 1;
    if (b.harvestedAt === undefined) return -1;
    return a.harvestedAt - b.harvestedAt;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Ordinary eat's own target check on an exact item id: the owned-reference resolution eat runs
 * before its handler (owned, unreserved, personally accessible and holding the quantity). */
function targetable(c: V7ActionContext, s: V7Stack, quantity: number): boolean {
  if (s.reservedFor || s.owner !== c.actor.id || s.quantity + 1e-8 < quantity)
    return false;
  if (!c.world.config.experience) return true;
  try {
    return (
      forestResolveReference(c.world, c.actor, s.id, 'owned', quantity) === s.id
    );
  } catch {
    return false;
  }
}

function execute(c: V7ActionContext): V7HandlerResult {
  const supplied = v7String(c.action.args.resource, 'resource');
  const resource = RESOURCE.exec(
    forestReferenceSpelling(c.world, supplied),
  )?.[1];
  if (!resource)
    throw nothing(
      `malformed-resource: ${JSON.stringify(supplied)} is not resource:ID (for example resource:berry); item ids and bare names are not accepted here.`,
    );
  const quantity = c.action.args.quantity;
  if (
    typeof quantity !== 'number' ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1
  )
    throw nothing('quantity must be a whole number of units, at least 1.');
  const ref = `resource:${resource}`;
  // Only the person's own stacks are read; nobody else's stock is consulted or reported.
  const owned = c.world.stacks
    .filter((s) => s.owner === c.actor.id && s.resource === resource)
    .sort(order);
  const stack = owned.find((s) => targetable(c, s, quantity));
  if (!stack)
    throw nothing(
      owned.some((s) => targetable(c, s, 0))
        ? `no-single-stack-with-requested-quantity: none of your usable stacks of ${ref} holds ${String(quantity)} alone. Stacks are not combined; ask for fewer units or eat an exact item.`
        : `no-matching-owned-stock: you hold no stack of ${ref} that ordinary eat could use; stacks reserved by ongoing work are not used. Nothing is gathered or substituted.`,
    );
  const eat = FOREST_BASE.handlers[EAT.handler];
  if (!eat) throw nothing('Ordinary eat is unavailable.');
  const item = stack.id,
    before = stack.quantity;
  let result: V7HandlerResult;
  try {
    result = eat({
      ...c,
      action: { interface: EAT.ability, args: { target: item, quantity } },
    });
  } catch (error) {
    throw nothing(
      `Ordinary eat refused ${item}: ${error instanceof Error ? error.message : 'unknown failure.'}`,
    );
  }
  const ate = c.world.events
    .filter((e) => e.type === 'ate' && e.target === item)
    .at(-1);
  if (!ate) throw nothing(`Ordinary eat reported no meal from ${item}.`);
  const consumed = v7RoundNumber(
    before - (c.world.stacks.find((s) => s.id === item)?.quantity ?? 0),
  );
  // No top-level progress, elapsed or remaining field: this is a meal, not ongoing work.
  c.emit(
    EVENT,
    `Ate from ${item}, the earliest-harvested owned stack of ${ref} holding ${String(quantity)}. ${ate.description}`,
    {
      operation: ID,
      actor: c.actor.id,
      resource: ref,
      requestedQuantity: quantity,
      item,
      selected: [item],
      harvestedAt: stack.harvestedAt ?? null,
      rule: RULE,
      consumedQuantity: consumed,
      outcome: 'eaten',
      delegated: { ...EAT, event: ate.id },
      view: {
        operation: ID,
        phase: 'completed',
        actor: c.actor.id,
        resource: ref,
        item,
        quantity,
        consumedQuantity: consumed,
        progress: 1,
        outcome: 'eaten',
      },
    },
    item,
  );
  return { complete: true, writes: result.writes };
}

/** ex24: Sol's request to eat from owned food stacks without naming a future item id. */
export const LONG_EX24_FOOD_STACK_SELECTION: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex24',
  dependencies: ['foundation-forest@1'],
  description:
    'Eat a whole-unit quantity of one named food resource from the single earliest-harvested owned stack that holds it alone, through ordinary eat with that exact item id. Stacks are never combined; the choice adds no cost, food, safety claim or reward.',
  reuse: {
    experiment:
      'foundation-forest@1 eat (handler forest.eat), called with the chosen exact item id; the owned-reference resolution eat runs on its target',
    source:
      'forest-foundation.ts (FOREST_BASE.handlers forest.eat); forest-references.ts (forestResolveReference, forestReferenceSpelling)',
    description:
      'A code dependency, not a copy: the eating, its energy, nutrition, toxicity, satiety cap, food condition, discoveries, meal effects, events and failures are all those of eat. New: only the deterministic choice of one owned stack and the free refusals. Every existing package is unchanged.',
  },
  abilities: [
    {
      id: ID,
      name: 'Eat from the oldest owned food stack',
      function:
        'Eat a whole-unit quantity of one named food resource from the one owned stack harvested earliest that holds it alone, through ordinary eat, instead of failing when several owned stacks match.',
      equivalence: 'food:owned-stack:oldest-harvested-first-eat:1',
      parameters: v7ObjectSchema({
        resource: { type: 'string', maxLength: 200 },
        quantity: { type: 'integer', minimum: 1 },
      }),
      references: {},
      prerequisites: [],
      learning: 1,
      learningEnergy: 0.2,
      costs:
        'Study: 1 round, 0.2 energy. Use: exactly the ordinary eat it calls (eat, foundation-forest@1, handler forest.eat): one round, the meal energy of eat (stated as 1) and the units actually eaten. Choosing the stack adds no time, energy or material. Every refusal comes before any cost.',
      effects:
        'resource is resource:ID, for example resource:berry; quantity is whole units. Candidates are your own unreserved stacks of exactly that resource that ordinary eat could target and that each hold the whole quantity alone, ordered by harvest round, earliest first, stacks without one last, ties by exact item id in code-unit order. The first is eaten by ordinary eat with its exact id, so its checks, nutrition, toxicity, satiety cap, food condition, meal effects and failures apply unchanged. One stack only: stacks are never combined, no other resource is substituted, nothing is gathered and no edibility or safety is inferred. Refusals: malformed-resource; no-matching-owned-stock (no usable stack of it); no-single-stack-with-requested-quantity (none holds the quantity alone). Each use chooses again. One event, oldest-food-stack-eaten, names the eaten item and quantities; other candidates stay private. No reward.',
      handler: HANDLER,
      revision: REVISION,
      authored: false,
      // The event never carries a qualified flag: eating this way earns no practice milestone.
      practiceEvidence: EVENT,
      dependencies: { abilities: [EAT.ability], resources: [], knowledge: [] },
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'Atomic like eat: the choice and the eating commit together in one round. Nothing is reserved or held; a refused or interrupted round commits nothing, and each new use, including each repeat of a plan step, chooses the stack again.',
      },
    },
  ],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: [EVENT],
  resources: [],
  satisfaction: [],
};
