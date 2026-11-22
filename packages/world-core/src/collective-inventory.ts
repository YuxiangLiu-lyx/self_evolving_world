import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7Package,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7Clone, v7Json, v7Number, v7Signature } from './continuous-data.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Observe } from './continuous-observation.js';
export const INVENTORY_INSPECTION = 'inventory-inspection';
const RESULT = 'inventory-inspection:result';
function form(s: V7Stack): V7Data {
  const processing = s.processing ?? {},
    root = processing.collectiveRoot,
    sample = processing.foodInspection;
  return {
    resourceForm: s.resource,
    ...(processing.separated === true ? { separated: true } : {}),
    ...(root &&
    typeof root === 'object' &&
    !Array.isArray(root) &&
    typeof root.fraction === 'number'
      ? { crushingFraction: root.fraction }
      : {}),
    ...(sample &&
    typeof sample === 'object' &&
    !Array.isArray(sample) &&
    typeof sample.fraction === 'number'
      ? { openingFraction: sample.fraction }
      : {}),
    ...(s.componentLots
      ? { separateOriginalLots: s.componentLots.length }
      : {}),
  };
}
function listed(w: V7World, a: V7Actor): V7Data[] {
  // Use the existing personal observation filter, then a deliberately smaller public schema.
  // Physical/chemical profiles and suitability inferences never enter the administrative page.
  return v7Observe(w, a.id)
    .stacks.filter((s) => s.owner === a.id)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((s) => ({
      id: s.id,
      resource: s.resource,
      quantity: s.quantity,
      ...(s.quantityTenths === undefined
        ? {}
        : { quantityTenths: s.quantityTenths }),
      form: form(s),
      available: !s.reservedFor,
      reservedFor: s.reservedFor ?? null,
    }));
}
/** Recorded execution-time result only. It never queries later holdings or another person's state. */
export function personalInventoryResult(w: V7World, a: V7Actor): V7Data | null {
  if (!w.revisions.includes(INVENTORY_INSPECTION + '@1')) return null;
  const value = a.extensionState[RESULT];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? v7Clone(value)
    : null;
}
export function personalInventoryHistory(w: V7World, a: V7Actor): V7Data[] {
  if (!w.revisions.includes(INVENTORY_INSPECTION + '@1')) return [];
  const history = a.extensionState['inventory-inspection:history'];
  return Array.isArray(history)
    ? history
        .filter(
          (r): r is V7Data => !!r && typeof r === 'object' && !Array.isArray(r),
        )
        .map(v7Clone)
    : [];
}
function privateEvent(
  c: V7ActionContext,
  type: string,
  description: string,
  data: V7Data,
) {
  c.emit(type, description, data, c.actor.id);
  const e = c.world.events.at(-1);
  if (e?.type === type) e.position = null;
}
function execute(c: V7ActionContext) {
  const mode = c.action.args.mode ?? 'page';
  if (mode !== 'page' && mode !== 'item')
    throw new Error('Inventory inspection mode must be page or item.');
  const page = v7Number(c.action.args.page ?? 0, 'inventory page', 0),
    pageSize = v7Number(
      c.action.args.pageSize ?? 8,
      'inventory page size',
      1,
      16,
    );
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(pageSize))
    throw new Error('Inventory pages and page sizes require integers.');
  if (c.actor.vitals.health <= 0) {
    privateEvent(
      c,
      'inventory-inspection-stopped',
      'Personal read cancelled before completion; no inventory changed.',
      {
        success: false,
        reason: 'Performer is not alive.',
        parameters: v7Json(c.action.args),
      },
    );
    return { complete: true, writes: [] };
  }
  v7Spend(c.actor, 0.2);
  const all = listed(c.world, c.actor),
    signature = v7Signature(all),
    key = 'inventory-inspection:version:' + c.actor.id;
  const previous = c.world.state[key];
  const state =
    previous && typeof previous === 'object' && !Array.isArray(previous)
      ? previous
      : null;
  const changed = !!state && state.signature !== signature;
  const revision =
    Number(state?.revision ?? 0) + (state ? (changed ? 1 : 0) : 1);
  c.world.state[key] = { revision, signature };
  const id =
    typeof c.action.args.itemId === 'string' ? c.action.args.itemId : '';
  const exact = id.startsWith('item:') ? id.slice(5) : id;
  const items =
    mode === 'item'
      ? all.filter(
          (s) =>
            s.id === exact &&
            !!exact &&
            !/^(item|object|resource):/.test(exact),
        )
      : all.slice(page * pageSize, (page + 1) * pageSize);
  const result: V7Data = {
    actor: c.actor.id,
    tick: c.world.tick,
    mode,
    inventoryRevision: `${c.actor.id}:inventory:${String(revision)}`,
    revisionChanged: changed,
    previousRevision: state
      ? `${c.actor.id}:inventory:${String(Number(state.revision))}`
      : null,
    revisionScope:
      'Observable carried identities, quantities, forms and reservation availability; not a chemical measurement.',
    page,
    pageSize,
    totalItems: all.length,
    totalPages: Math.ceil(all.length / pageSize),
    hasPrevious: mode === 'page' && page > 0,
    hasNext: mode === 'page' && (page + 1) * pageSize < all.length,
    items,
    omittedItems: all.length - items.length,
    unavailable: mode === 'item' && items.length === 0,
    costs: { energy: 0.2, rounds: 1 },
    remainingWork: 0,
    ...(changed
      ? {
          notice:
            'Carried holdings changed since the previous inspection; pages may shift. Restart pagination if a consistent enumeration is needed.',
        }
      : {}),
  };
  c.actor.extensionState[RESULT] = v7Clone(result);
  c.actor.extensionState['inventory-inspection:history'] = [
    ...personalInventoryHistory(c.world, c.actor),
    v7Clone(result),
  ].slice(-8);
  privateEvent(
    c,
    'inventory-inspected',
    'Recorded a complete bounded page of actual personal carried supplies; no discovery or material change.',
    { ...result, success: true, parameters: v7Json(c.action.args) },
  );
  return { complete: true, writes: [] };
}
export const COLLECTIVE_INVENTORY: V7Package = {
  id: INVENTORY_INSPECTION,
  version: 1,
  scope: 'collective-ex12',
  dependencies: ['foundation-open@1'],
  description:
    'Paid private paginated identities from actual carried supplies; no inferred material properties.',
  reuse: {
    experiment:
      'existing continuous personal observation and action scheduling',
    source: 'continuous-observation.ts; continuous-base.ts',
    description:
      'Reuses real ownership filtering and paid single-round execution. The paginated read is a newly requested interface, not inherited knowledge, stock or mastery.',
  },
  abilities: [
    {
      id: INVENTORY_INSPECTION,
      name: 'Inspect personal carried inventory',
      function:
        'Read a complete bounded page or exact carried-item record, including omitted inventory identities, quantities and represented forms without hidden properties.',
      equivalence: 'inventory:private-current-carried:paginated-read:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: ['page', 'item'] },
          page: { type: 'integer', minimum: 0 },
          pageSize: { type: 'integer', minimum: 1, maximum: 16 },
          itemId: { type: 'string' },
        }),
        required: [],
      },
      prerequisites: [],
      learning: 1,
      costs:
        'One active round and 0.2 energy. Defaults mode page, page 0, pageSize 8. Item mode uses an exact bare item ID or one item: prefix; no resource alias. No tool or material is needed.',
      effects:
        'Read only your actual carried supplies, sorted by exact identity; show availability and represented form, never hidden composition or assumed suitability. Ground and other people are excluded. Each result is dated and complete for its requested page; the next read flags changes to listed holdings. It is a past read, not guaranteed current inventory. No material mutation, reward, mastery, ongoing process or world object. Full bounded result is preserved separately from the shortened default summary.',
      handler: 'collective.inventory',
      revision: INVENTORY_INSPECTION + '@1',
      authored: false,
      practiceEvidence: 'inventory-inspected',
      references: {},
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'One atomic read; zero remaining work at completion. Death or interruption before execution produces no successful output; nothing is reserved or refunded.',
      },
      dependencies: { abilities: [], resources: [], knowledge: [] },
    },
  ],
  handlers: { 'collective.inventory': execute },
  processes: {},
  resources: [],
  satisfaction: [],
  visualComponents: [],
  events: ['inventory-inspected', 'inventory-inspection-stopped'],
};
