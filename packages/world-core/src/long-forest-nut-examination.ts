import type { V7Package } from './continuous-types.js';
import { sourceExteriorExamination } from './long-exterior-examination.js';
const ID = 'moss-source-bound-hazelnut-physical-examination';
const base = sourceExteriorExamination({
  id: ID,
  item: 'item-140-moss-811',
  stateKey: 'long:forest-nut:exterior',
  owner: 'moss',
  origin: 'forest-hazelnut-1',
  harvestedAt: 140,
  handler: 'long.forest-nut-examine',
  energy: 0.5,
  extended: true,
});
export const LONG_FOREST_NUT_EXAMINATION: V7Package = {
  ...base,
  dependencies: [
    'bounded-hazelnut-food-assessment@1',
    'owned-hazelnut-assessment@1',
    'source-bound-hazelnut-opening-trial@1',
  ],
  description:
    'Source-specific exterior representation and real paid examination of Moss forest specimen; no opening or food claim.',
  reuse: {
    experiment: 'ex13',
    source:
      'long-exterior-examination.ts; long-food-evidence.ts; owned-hazelnut-assessment@1; bounded-hazelnut-food-assessment@1; source-bound-hazelnut-opening-trial@1',
    description:
      'Shares nondestructive examination, resolution, exact ownership and personal evidence machinery. New deterministic forest-source exterior model is an explicit newly introduced assumption, never Lin measurement or plant graphics. Only prerequisite boundaries of the opening method are referenced; no source permission or contact implementation is transferred.',
  },
  abilities: base.abilities.map((a) => ({
    ...a,
    name: 'Forest specimen physical exterior examination',
    function:
      'Examine Moss actual whole owned item-140-moss-811 from forest-hazelnut-1, observing supported exterior and reporting controlled interior-access limitations.',
    equivalence: 'specimen:forest-hazelnut:direct-exterior:1',
    parameters: {
      ...a.parameters,
      properties: {
        ...a.parameters.properties,
        evidenceRefs: {
          type: 'array',
          items: { type: 'string', maxLength: 200 },
        },
      },
    },
    costs:
      'Study1 active round/0.2 energy. Examine(specimenId,evidenceRefs=[]):one atomic active round/0.5 energy for gentle nondamaging viewing/reorientation; no consumables, tools, support, travel, touching interior, sniff challenge, tasting, pressing, striking, prying, sampling or opening. Exact owned unreserved item-140-moss-811 quantity1 origin forest-hazelnut-1 harvested140. At most8 distinct complete personal evidence keys; missing/partial/other-private records unavailable. Carried inventory is local; stored coordinates do not mean remote access. Invalid live source/access/energy fails before payment.',
    effects:
      'Installs a deterministic source-specific exterior model for the unchanged existing forest specimen; assumptions are new modeling decisions, not prior observations or imported Lin anatomy. Paid direct viewing exposes supported shape, rendered color, surface features, covering, visible openings/discontinuities and approximate body-scale dimensions in world-distance resolution0.02 uncertainty0.01. Unexposed interior, food identity/safety/nutrition and unmodeled features remain unknown; decay is not a visible symptom. Detailed dated records stay private, with source/model revision, canonical state fingerprint, exact supplied evidence and per-property status. No actual opening/tool/support has been nominated or assessed; a future destructive method requires a separate explicit decision, source-appropriate response/conservation mechanism and actual acquired inputs, not automatic reuse of Lin permissions. Same identity/amount/owner/location/condition, ordinary ageing, no fragments or marker. Atomic validation/payment/report, no partial escrow or passive work; precommit cancellation/death costs no observation, committed effort no refund. Only genuinely new supported physical findings can invoke existing grounded-understanding0.8/cap1/duration8/cooldown12/maintained0.035/decay0.0015; missing rule zero. Canonical specimen/property/state deduplication prevents rewards for repeats, names, registration, study, report creation, unchanged color or printed limitations. No food, comfort, health or safety certificate.',
    practiceEvidence: 'forest-nut-examination-practice',
  })),
  events: [...(base.events ?? []), 'forest-nut-examination-practice'],
};
