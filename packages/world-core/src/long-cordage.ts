import type {
  V7ActionContext,
  V7HandlerResult,
  V7Package,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';

const ID = 'make-and-test-cordage';
const REVISION = `${ID}@1`;
export const CORDAGE_UNSUPPORTED =
  'Unsupported in this run: material records carry only mass, hardness, flexibility and moisture, with no strand continuity, workable length, joining behavior or response to tension, so no cord can be formed and no load test can give a result; these measurements are labeled unsupported rather than given numbers. Nothing was reserved, changed or spent.';

/** Real checks of the nominated owned sample, reported with the unsupported measurements. */
function prepareReport(c: V7ActionContext): string {
  const id =
    typeof c.action.args.inputStackId === 'string'
      ? c.action.args.inputStackId
      : '';
  const sample = c.world.stacks.find(
    (s) => s.id === id && s.owner === c.actor.id && !s.reservedFor,
  );
  const quantity =
    typeof c.action.args.quantity === 'number' ? c.action.args.quantity : 1;
  const stepped = Math.abs(quantity * 10 - Math.round(quantity * 10)) < 1e-9;
  const sampleCheck = !sample
    ? 'no owned unreserved material stack was named'
    : !stepped || quantity < 0.1
      ? `quantity ${String(quantity)} is not a 0.1-unit amount of at least 0.1`
      : quantity > sample.quantity
        ? `${sample.id} holds only ${String(sample.quantity)}`
        : `${sample.id} (${sample.resource}) holds enough for ${String(quantity)}`;
  return `Sample check: ${sampleCheck}.`;
}

function execute(c: V7ActionContext): V7HandlerResult {
  if (c.action.args.mode === 'prepare')
    throw new Error(`${prepareReport(c)} ${CORDAGE_UNSUPPORTED}`);
  throw new Error(
    `No prepared sample, cord or test exists for this mode. ${CORDAGE_UNSUPPORTED}`,
  );
}

export const LONG_CORDAGE: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex14',
  dependencies: ['foundation-open@1'],
  description:
    'First release of a general cordage operation: real sample checks that report the unsupported material measurements; no cord or load test exists yet.',
  reuse: {
    experiment:
      'ex14 weather-barrier@1 and air-dry-food@1 first-release pattern',
    source: 'stack ownership checks only',
    description:
      'No material-behavior, joining or tension model is added or inherited; the ex13 piece model belongs to another run and is not installed.',
  },
  abilities: [
    {
      id: ID,
      name: 'Make and test cordage',
      function:
        'Check an owned flexible material sample for cord making and report which measurements the world cannot yet support; no cord can currently be made or tested.',
      equivalence: 'cordage:hand-formed:load-test:first-release:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: [
              'prepare',
              'form',
              'test',
              'inspect',
              'resume',
              'cancel',
              'recover-material',
            ],
          },
          inputStackId: { type: 'string' },
          productId: { type: 'string' },
          quantity: { type: 'number', minimum: 0.1 },
          method: { type: 'string' },
          testLoad: { type: 'number', minimum: 0 },
          processId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: { inputStackId: 'optional-owned' },
      prerequisites: [],
      learning: 4,
      costs:
        'Prepare with inputStackId and quantity (0.1 steps, default 1) checks the owned sample, then fails without spending anything. Other modes fail at no cost because no prepared sample, cord or test can exist.',
      effects:
        'Currently unsupported: strand continuity, workable length, joining behavior and response to tension are not represented, so no cord, binding, strength value or load-test result is produced; these are labeled unsupported. Material is unchanged. No reward. A working operation needs a separately decided material-behavior and tension model; none is invented here.',
      handler: 'long.cordage',
      revision: REVISION,
      authored: false,
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress: 'Atomic check; no work, escrow or product persists.',
      },
    },
  ],
  handlers: { 'long.cordage': execute },
  processes: {},
  visualComponents: [],
  events: [],
  resources: [],
  satisfaction: [],
};
