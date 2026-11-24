import type {
  V7ActionContext,
  V7HandlerResult,
  V7Package,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7String } from './continuous-data.js';
import { v7Distance } from './continuous-geometry.js';

const ID = 'air-dry-food';
const REVISION = `${ID}@1`;
export const AIR_DRYING_UNSUPPORTED =
  'Unsupported in this run: stone records carry only mass, hardness and moisture, with no shape, exposed area or cleanliness, so no drying support can be validated, and this run has no food water-content or drying model. A reviewed moisture model exists only for ex10 (open-preservation-physics), bound to its tray apparatus and source-bound items; using it here needs a separately decided support representation. Nothing was reserved, moved or spent.';

/** Real checks of the nominated food and support, reported with the unsupported conditions. */
function setUpReport(c: V7ActionContext): string {
  const food = c.world.stacks.find(
    (s) =>
      s.id === v7String(c.action.args.inputStackId, 'inputStackId') &&
      s.owner === c.actor.id &&
      !s.reservedFor,
  );
  const resource = c.world.resources.find((r) => r.id === food?.resource);
  const eligible =
    !!food &&
    !!resource &&
    resource.nutrition > 0 &&
    resource.toxicity === 0 &&
    (food.decay ?? 0) < (resource.properties?.decay ?? 0);
  const supportId =
    typeof c.action.args.supportId === 'string' ? c.action.args.supportId : '';
  const ownedStone = c.world.stacks.find(
    (s) =>
      s.id === supportId && s.owner === c.actor.id && s.resource === 'stone',
  );
  const visibleStone = c.world.objects.find(
    (o) => o.id === supportId && o.data.resource === 'stone',
  );
  const support = ownedStone
    ? `owned stone ${ownedStone.id}`
    : visibleStone
      ? v7Distance(c.actor.position, visibleStone.spatial) <=
        c.actor.radius + 0.65
        ? `stone source ${visibleStone.id} in reach (a source, not an owned piece)`
        : `stone source ${visibleStone.id} out of reach`
      : 'no owned stone or stone source named';
  return `Food check: ${eligible ? `${food.id} is owned, unspoiled, nontoxic food` : 'no owned, unspoiled, nontoxic food stack was named'}. Support check: ${support}.`;
}

function execute(c: V7ActionContext): V7HandlerResult {
  if (c.action.args.mode === 'set-up')
    throw new Error(`${setUpReport(c)} ${AIR_DRYING_UNSUPPORTED}`);
  throw new Error(
    `No drying batch exists to inspect, retrieve, resume or cancel. ${AIR_DRYING_UNSUPPORTED}`,
  );
}

export const LONG_AIR_DRYING: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex14',
  dependencies: ['foundation-open@1'],
  description:
    'First release of a general air-drying operation: real food and support checks that report the unsupported physical conditions; no drying exists yet.',
  reuse: {
    experiment: 'ex14 weather-barrier@1 first-release pattern; ex13 precedent',
    source: 'continuous-geometry.ts (reach)',
    description:
      'Reuses existing reach and stack checks only. The ex10 preservation physics is identified but not installed, because it is bound to ex10 apparatus and items.',
  },
  abilities: [
    {
      id: ID,
      name: 'Air-dry food',
      function:
        'Check owned food and a stone support for air-drying and report what the world cannot yet support; no food can currently be dried.',
      equivalence: 'food:stone-support:air-drying:first-release:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['set-up', 'inspect', 'retrieve', 'resume', 'cancel'],
          },
          inputStackId: { type: 'string' },
          quantity: { type: 'number', minimum: 0.1 },
          supportId: { type: 'string' },
          target: { type: 'string' },
          processId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: {
        inputStackId: 'optional-owned',
        target: 'optional-exact-visible',
      },
      prerequisites: [],
      learning: 4,
      costs:
        'Set-up with inputStackId and supportId checks the food (owned, unspoiled, nontoxic) and the support (an owned stone piece or a stone source in reach), then fails without spending anything. Other modes fail at no cost because no batch can exist.',
      effects:
        'Currently unsupported: stone records have no shape, exposed area or cleanliness, so a support cannot be validated, and this run has no food water-content or drying model. Food keeps its existing decay. No reservation, drying, preservation, safety claim or reward is produced. A working operation needs a separately decided support representation and the installation of a reviewed moisture model; none is invented here.',
      handler: 'long.air-dry-food',
      revision: REVISION,
      authored: false,
      dependencies: { abilities: [], resources: ['stone'], knowledge: [] },
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress: 'Atomic check; no work, escrow or batch persists.',
      },
    },
  ],
  handlers: { 'long.air-dry-food': execute },
  processes: {},
  visualComponents: [],
  events: [],
  resources: [],
  satisfaction: [],
};
