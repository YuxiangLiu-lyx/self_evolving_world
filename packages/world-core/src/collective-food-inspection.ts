import type { V7Package } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { collectiveJobs } from './collective-work.js';
import {
  executeFoodInspection,
  FOOD_INSPECTION,
  pauseFoodInspection,
  stopFoodInspection,
} from './collective-food-inspection-work.js';
export const COLLECTIVE_FOOD_INSPECTION: V7Package = {
  id: FOOD_INSPECTION,
  version: 1,
  scope: 'collective-ex12',
  dependencies: ['foundation-open@1'],
  description:
    'Reviewed paid mechanical opening and bounded non-ingestive appearance; never a food safety assay.',
  reuse: {
    experiment:
      'ex11 generic material escrow and ex10 physical contact helpers',
    source: 'collective-work.ts; open-hardness-physics.ts',
    description:
      'Code reuse only. No historical generated assay, skill, tool, resource or personal knowledge is activated.',
  },
  abilities: [
    {
      id: FOOD_INSPECTION,
      name: 'Open and inspect an actual food sample',
      function:
        'Use a real hard tool to open a small owned hazelnut portion and retain its mechanical exposure and observed state without ingesting or certifying safety.',
      equivalence:
        'hazelnut:paid-mechanical-opening:non-ingestive-inspection:1',
      parameters: {
        ...v7ObjectSchema({
          action: {
            type: 'string',
            enum: ['start', 'continue', 'inspect', 'cancel'],
          },
          sampleId: { type: 'string' },
          toolId: { type: 'string' },
          processId: { type: 'string' },
        }),
        required: ['action'],
      },
      prerequisites: [],
      learning: 2,
      costs:
        'Start requires sampleId and toolId: reserve 0.1 actual hazelnut unit and one reusable stone/flint of sufficient intrinsic hardness. Two active rounds at 0.5 energy each expose the same-mass sample. Inspect costs one round and 0.2 energy. Continue/cancel use the exact personal processId and no replacement inputs.',
      effects:
        'Adjacent clear reachable ground and usable hard-tool contact are required each paid round. Existing age, composition, ownership and provenance persist. Cancellation/death leaves actual partial material and tool at the worksite. Previously paid partial opening remains in the sample. Nutrition, toxicity, anatomy and safety remain unknown; no edible yield, sterilization or preservation is inferred. Baseline aging remains because the applicability of crushed-food aging to merely opened hazelnut is unvalidated. Only a first completed paid opening can confirm mechanical access through the unchanged canonical understanding rule.',
      handler: 'collective.food-inspection',
      revision: FOOD_INSPECTION + '@1',
      authored: false,
      practiceEvidence: 'information-confirmed',
      references: {},
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Actual processId, completed and remaining work, reserved sample/tool and paid energy. Other actions pause; continue resumes; cancellation and death retain actual partial progress without refunds.',
      },
      dependencies: {
        abilities: [],
        resources: ['hazelnut', 'stone'],
        knowledge: [],
      },
    },
  ],
  handlers: { 'collective.food-inspection': executeFoodInspection },
  processes: {},
  resources: [],
  satisfaction: [],
  visualComponents: [],
  events: [
    'food-inspection-started',
    'food-inspection-progress',
    'food-inspection-completed',
    'food-inspection-stopped',
    'food-inspection-observed',
    'trial-result',
    'information-confirmed',
  ],
  migrate(w) {
    const rule = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!rule?.maintenance)
      throw new Error('Missing canonical grounded-understanding source.');
    const trigger = {
      event: 'information-confirmed',
      interface: FOOD_INSPECTION,
    };
    rule.alternativeTriggers = [...(rule.alternativeTriggers ?? []), trigger];
    rule.maintenance.alternativeTriggers = [
      ...(rule.maintenance.alternativeTriggers ?? []),
      trigger,
    ];
    return w;
  },
  beforeAction(w, a, action) {
    if (action.interface !== FOOD_INSPECTION) pauseFoodInspection(w, a);
  },
  onDeath(w, a) {
    for (const j of collectiveJobs(w, FOOD_INSPECTION).filter(
      (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
    ))
      stopFoodInspection(
        w,
        a,
        j,
        'Performer died; the actual partial sample and reusable tool remain at the work location.',
      );
  },
};
