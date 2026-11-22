import type { V7Package } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { collectiveJobs } from './collective-work.js';
import { rootExecute, rootMaintain, rootStop } from './collective-root-work.js';
const events = [
  'food-preparation-started',
  'food-preparation-completed',
  'drying-tray-built',
  'food-drying-progress',
  'food-drying-completed',
  'food-rewetted',
  'process-progress',
  'process-completed',
  'process-stopped',
  'process-inspected',
  'information-confirmed',
];
const common = {
  processId: { type: 'string' as const },
  inputStackId: { type: 'string' as const },
  quantity: { type: 'integer' as const, minimum: 1, maximum: 4 },
  x: { type: 'number' as const },
  y: { type: 'number' as const },
  stoneId: { type: 'string' as const },
  barkId: { type: 'string' as const },
  stoneIds: { type: 'array' as const, items: { type: 'string' as const } },
  trayId: { type: 'string' as const },
};
export const ROOT_FOOD_MATRIX: V7Package = {
  id: 'root-food-matrix',
  version: 1,
  scope: 'collective-ex12',
  description:
    'Shared per-lot composition substrate for the two independently reviewed ex12 functions.',
  dependencies: ['foundation-open@1'],
  abilities: [],
  handlers: {},
  processes: {},
  visualComponents: [],
  satisfaction: [],
  events: [],
  resources: [
    {
      id: 'crushed-root',
      name: 'Crushed meadow roots',
      mass: 0.4,
      nutrition: 0,
      toxicity: 0,
      color: '#c0a77e',
    },
  ],
  reuse: {
    experiment: 'ex11 generic manual-work implementation',
    source:
      'packages/world-core/src/collective-work.ts; collective-food-profile.ts',
    description:
      'Reuses conserved escrow, exact references and per-lot edible adapters, not the ex11 hand-mashing ability, recipe or personal mastery. No historical preservation package or physics is activated.',
  },
};
function rootPackage(drying: boolean): V7Package {
  const id = drying ? 'root-air-drying' : 'root-preparation';
  return {
    id,
    version: 1,
    scope: 'collective-ex12',
    description: drying
      ? 'Paid reusable tray and actual weather-dependent food moisture.'
      : 'Paid stone-and-bark preparation of actual roots.',
    dependencies: ['foundation-open@1', 'root-food-matrix@1'],
    ...(ROOT_FOOD_MATRIX.reuse ? { reuse: ROOT_FOOD_MATRIX.reuse } : {}),
    abilities: [
      {
        id,
        name: drying ? 'Root air drying' : 'Stone-crush roots',
        function: drying
          ? 'Assemble a reusable stone-and-bark tray, process actual roots and allow weather-dependent drying with reversible preservation while sufficiently dry.'
          : 'Use actual reusable stone and bark to crush roots for later eating, conserving nutrients and age.',
        equivalence: drying
          ? 'roots:weather-air-drying:1'
          : 'roots:stone-crushing:1',
        parameters: {
          ...v7ObjectSchema({
            operation: {
              type: 'string',
              enum: drying
                ? [
                    'build',
                    'load',
                    'unload',
                    'dismantle',
                    'continue',
                    'cancel',
                    'inspect',
                  ]
                : ['prepare', 'continue', 'cancel', 'inspect'],
            },
            ...common,
          }),
          required: ['operation'],
        },
        prerequisites: [],
        learning: drying ? 4 : 2,
        costs: drying
          ? 'Build: two stone units and one bark, two rounds at one energy. Load: up to two original root units, two crushing rounds per raw root at one energy. Already crushed compatible food needs one transfer round, with its prior costs and composition preserved. Unload/dismantle: one round and one energy. Passive weather exchange costs no actor rounds.'
          : 'One actual stone and bark are reserved reusable implements; prepare 1–4 owned roots with two rounds per raw root, one energy per round. Defaults to a nearby eastward worksite; explicit x/y select another actual site. No silent relocation if blocked.',
        effects: drying
          ? 'Food begins at its represented composition or the reviewed 50% root water assumption. Uncovered dry weather at 10–40 C removes at most 0.005 water mass per root per round to fraction 0.12; rain returns up to 0.01 per root, capped at original water. At fraction <=0.12 decay is 0.35 baseline, otherwise crushed food is 1.25 baseline. Exposure continues after unloading. No lost nutrients, reverse spoilage, sterilization or free materials.'
          : 'Preserve mass, nutrients, toxicity and accumulated spoilage. Crushed food ages at 1.25 baseline. Partial cancellation retains its actual processing fraction and age. No cooking or preservation benefit is implied.',
        handler: 'collective.' + id,
        revision: id + '@1',
        authored: false,
        practiceEvidence: 'information-confirmed',
        references: {},
        execution: {
          duration: null,
          interruption: 'cancel',
          progress:
            'Exact processId, actual site, escrow, reusable tools, paid energy and remaining work. Continue resumes; changing actions or lost reach pauses. Cancel/death releases actual material once without effort refunds.',
        },
        dependencies: {
          abilities: [],
          resources: ['root', 'stone', 'bark'],
          knowledge: [],
        },
      },
    ],
    handlers: { ['collective.' + id]: rootExecute },
    processes: {},
    resources: [],
    satisfaction: [],
    events,
    visualComponents: ['root-work-surface'],
    afterEnvironment(w) {
      rootMaintain(w, id);
    },
    beforeAction(w, a, action) {
      if (action.interface !== id)
        for (const j of collectiveJobs(w, id).filter(
          (j) => j.owner === a.id && j.status === 'active',
        ))
          j.status = 'paused';
    },
    onDeath(w, a) {
      for (const j of collectiveJobs(w, id).filter(
        (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
      ))
        rootStop(
          w,
          a,
          j,
          'Performer died; actual partly processed food and implements remain at their location.',
        );
    },
  };
}
export const ROOT_PREPARATION = rootPackage(false);
export const ROOT_AIR_DRYING = rootPackage(true);
