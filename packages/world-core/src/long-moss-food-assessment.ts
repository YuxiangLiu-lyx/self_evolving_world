import type { V7Package } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { sourceFoodAssessment } from './long-food-evidence.js';
const ID = 'bounded-hazelnut-food-assessment';
export const LONG_MOSS_FOOD_ASSESSMENT: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: [
    'owned-hazelnut-assessment@1',
    'bounded-unfamiliar-food-assessment@1',
  ],
  description:
    'Source-binding adapter for Moss actual forest hazelnut; existing evidence machinery, no new food facts.',
  reuse: {
    experiment: 'ex13',
    source:
      'owned-hazelnut-assessment@1; bounded-unfamiliar-food-assessment@1; long-food-evidence.ts; forest-references.ts',
    description:
      'Explicit current-run dependencies and shared private evidence implementation. The Lin exterior model applies only to start-0-nuts item119, not this forest source; therefore only actual rendered color is available here. No anatomy transfer, historical skill or independent reinvention.',
  },
  abilities: [
    {
      id: ID,
      name: 'Forest hazelnut evidence-limit assessment',
      function:
        'Perform a bounded nondestructive assessment of Moss actual owned item-140-moss-811, reporting represented exterior and food uncertainties without ingestion.',
      equivalence: 'food:forest-hazelnut:private-exterior-evidence-limit:1',
      parameters: {
        ...v7ObjectSchema({
          specimenId: { type: 'string' },
          evidenceRefs: {
            type: 'array',
            items: { type: 'string', maxLength: 200 },
          },
        }),
        required: ['specimenId'],
      },
      references: { specimenId: 'owned' },
      prerequisites: [],
      learning: 1,
      learningEnergy: 0.2,
      costs:
        'Study1 round/0.2 energy. Assess(specimenId,evidenceRefs=[]):one atomic active round/0.2 energy. Exact Moss-owned unreserved whole item-140-moss-811 from forest-hazelnut-1 harvested140. At most8 distinct exact complete personally known record keys; missing/partial/other-private references are unavailable. No tools, consumables, travel, further gathering, tasting, sniff exposure, pressing, opening, sampling or hidden consultation. Invalid access/identity/energy fails before charge.',
      effects:
        'Reuses current-run specimen access and the apple private report machinery with a new exact source binding. The start-0-nuts exterior model is not applicable; only actual rendered color is supported, not shape, covering anatomy, openings, dimensions or internal state. Unavailable observations are not negative findings. Unique dated private report records source, method, exact evidence citations, observed-state fingerprint, edible portions/preparation/safety as unresolved and missing observation/evidence prerequisites. No kernel, shell, mandatory preparation, safe raw-food conclusion or toxin absence inferred from the label, maturity, gathering, eat interface or inability to see inside. No extra item, nutrition, condition restoration or marker; normal ageing continues. Atomic commit only, no ongoing work/escrow/maintenance or automatic refresh; precommit cancellation/death gives no assessment charge/record, completed effort has no refund. Existing color or repeated implementation limitations are not new verified knowledge, so this precursor emits zero curiosity/practice/comfort reward. Detailed findings remain private until real communication, with no other person answer or consent supplied.',
      handler: 'long.moss-food-assess',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'moss-food-assessment-practice',
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'Atomic paid report with no partially successful output or persistent reservation.',
      },
    },
  ],
  handlers: {
    'long.moss-food-assess': sourceFoodAssessment({
      actor: 'moss',
      item: 'item-140-moss-811',
      resource: 'hazelnut',
      origin: 'forest-hazelnut-1',
      harvestedAt: 140,
      prefix: 'moss-food-assessment',
      event: 'moss-food-assessment-completed',
      label: 'Hazelnut',
      extended: true,
    }),
  },
  resources: [],
  processes: {},
  satisfaction: [],
  visualComponents: [],
  events: ['moss-food-assessment-completed', 'moss-food-assessment-practice'],
};
