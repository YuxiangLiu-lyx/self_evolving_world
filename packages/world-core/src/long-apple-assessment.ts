import { sourceFoodAssessment } from './long-food-evidence.js';
import type { V7Package } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
const ID = 'bounded-unfamiliar-food-assessment';
export const LONG_APPLE_ASSESSMENT: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: ['foundation-open@1'],
  description:
    'Paid source-bound exterior and personal evidence-limit report; no ingestion or safety test.',
  reuse: {
    experiment: 'ex13; historical food-assessment inspected but not installed',
    source:
      'foundation-open@1/open.probe; owned-hazelnut-assessment@1; forest-references.ts; continuous-base.ts',
    description:
      'Reuses owned-item access, atomic0.2 viewing cost, actual rendered exterior color and private evidence pattern. Generic probe observe returns source/soil fields and publicly emits detailed trial findings, so its handler is not invoked for this private specimen report. Historical examine/sample semantics are not equivalent and are not activated. No second probe, consumption or inherited mastery.',
  },
  abilities: [
    {
      id: ID,
      name: 'Bounded unfamiliar specimen assessment',
      function:
        'Examine the represented exterior of Sol actual owned apple item-125-sol-735 and separate supplied personal evidence from unresolved food safety and preparation.',
      equivalence: 'food:apple:private-exterior-evidence-limit:1',
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
        'Study1 round/0.2 energy. Assess(specimenId,evidenceRefs=[]):one atomic round/0.2 energy for gentle viewing/reorientation and a private report. Exact owned unreserved item-125-sol-735 quantity1, origin forest-apple-2 harvested125. Optional exact personal knowledge keys only; unavailable/incomplete references remain unavailable, no automatic hidden lookup or consultation. No tools, materials, tasting, sniff challenge, wetting, pressing, opening, sampling or heat. Invalid specimen/access/energy fails before charge.',
      effects:
        'Uses only the actual rendered exterior color; current engine supplies no source-appropriate specimen shape, texture, damage, geometry, interior or toxin observation model for this apple. Such features remain unavailable rather than borrowing hazelnut anatomy. Report separates method/direct observation, exact supplied own evidence, unsupported preparation and remaining uncertainty. Resource name, source maturity, provenance and color do not prove nutrition, edibility or absence of toxins. Complete retained personally known records are cited without elevating their claims or reading anyone else knowledge; further actual knowledge can arrive through existing consultation/communication. Dated reports are appended, not overwritten. Same quantity, identity, owner and location remain with ordinary ageing; no stock changes, marker, passive work or free recovery. Atomic interruption before commit gives no paid record; after commit no refund. This precursor confirms no new property beyond already observable rendering/control metadata, so it emits no curiosity/practice/comfort/nutrition reward, including repeated reports. A model limitation printed from this contract is not new information.',
      handler: 'long.apple-assess',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'apple-assessment-practice',
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'Atomic validation/payment/observation commit; no ongoing escrow or repeated charge.',
      },
    },
  ],
  handlers: {
    'long.apple-assess': sourceFoodAssessment({
      actor: 'sol',
      item: 'item-125-sol-735',
      resource: 'apple',
      origin: 'forest-apple-2',
      harvestedAt: 125,
      prefix: 'apple-assessment',
      event: 'apple-assessment-completed',
      label: 'Apple',
    }),
  },
  resources: [],
  processes: {},
  satisfaction: [],
  visualComponents: [],
  events: ['apple-assessment-completed', 'apple-assessment-practice'],
};
