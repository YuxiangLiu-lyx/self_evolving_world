import type { V7Package } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { forestReferenceSpelling } from './forest-references.js';
import { ACCESS_ID as ID, installAccess } from './long-nut-access-model.js';
import { accessExecute, accessDeath } from './long-nut-access-work.js';
export const LONG_NUT_ACCESS: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: ['opened-hazelnut-preparation-assessment@1'],
  description:
    'Source-bound local clearance and bounded exterior-rim contact; no internal transfer.',
  reuse: {
    experiment: 'ex13',
    source:
      'source-bound-hazelnut-opening-trial@1; opened-hazelnut-preparation-assessment@1; collective-work.ts; forest-references.ts; continuous-geometry.ts; long-food-evidence.ts',
    description:
      'Reuses the actual exhausted contact ledger, specimen lineage, private evidence, exact references and paid work. Inspected bounded-surface-residue-transfer@1 and source-bound-joining-trial@1: their surface parcels/whole-piece paths cannot represent an internal loose component or receiver, so no transfer contract or branch/vine anatomy is borrowed. Source-unit conservation and explicit locks follow their shared work design. New aperture/compliance assumptions are not prior measurements or independent invention.',
  },
  migrate: installAccess,
  abilities: [
    {
      id: ID,
      name: 'Opened specimen clearance and exterior contact trial',
      function:
        'Measure actual local clearance, position owned specimen/stone on a real support, then test only the covering rim with bounded nonimpact contacts. Internal access and transfer remain unresolved.',
      equivalence: 'specimen:opened-hazelnut:bounded-clearance-rim-contact:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['assess', 'begin', 'resume', 'cancel'],
          },
          specimenId: { type: 'string' },
          actuatorRef: { type: 'string' },
          supportRef: { type: 'string' },
          receiverRef: { type: 'string' },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
          assessmentId: { type: 'string' },
          targetComponentRef: { type: 'string' },
          processId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: {},
      prerequisites: [],
      learning: 2,
      learningEnergy: 0.2,
      costs:
        'Study2 rounds/0.2 energy each. Assess(specimenId=item-141-lin-821,actuatorRef=item-131-lin-766,supportRef=actual rock,optional evidenceRefs):1 round/0.5 energy; exact owned whole unreserved inputs and clear reachable support before pay. Omit receiverRef: no transfer in this release. Assessment actually positions both items on support, unreserved; quote invalid if moved/picked up. Begin(assessmentId,optional targetComponentRef=item-141-lin-821:covering-rim):at most2 lifetime contact rounds/0.5 each, actual work travel at most0.02/round, abstract effort0.1 below represented fracture threshold, zero wear/consumption. Resume/cancel(processId), no refunds; actual pickup after release is separate.',
      effects:
        'Paid body-comparison geometry resolution0.02 uncertainty0.01 and deterministic new source model; neither visibleRegion nor fractions imply aperture or anatomy. Only exterior covering-rim contact, no internal insertion, detachment, receiver, new tool/hand, fragments, food or nutrition. Retained1/transferred0/loss0; covering0.35/interior0.65 remain bookkeeping. Actual stone/source positions persist, locks prevent conflicting use. Insufficient energy/reach or changed inputs pauses before next payment; resume retains exact progress. Cancellation/death releases once at real positions, no remote return or contact reset. Existing ageing continues. Elastic response returns within each step; sub-resolution displacement and retention remain unresolved. No passive effects/maintenance benefit. Private dated findings; only novel verified clearance may use existing grounded-understanding rule, unchanged or missing rule yields0. Contact repetition, requests, study and completion yield0; no new reward account. Original2 opening contacts remain exhausted.',
      handler: 'long.nut-access',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'nut-access-practice',
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Actual processId, source/actuator/support locks, completedWork and remainingWork; two bounded exterior contacts, never completed extraction.',
      },
    },
  ],
  handlers: { 'long.nut-access': accessExecute },
  resources: [],
  processes: {},
  satisfaction: [],
  visualComponents: [],
  events: [
    'nut-access-assessed',
    'nut-access-observed',
    'nut-access-contact',
    'nut-access-completed',
    'nut-access-stopped',
    'nut-access-practice',
    'information-confirmed',
  ],
  onDeath: accessDeath,
  beforeAction: (w, _a, action) => {
    if (['navigate', 'wait', 'rest', 'message', ID].includes(action.interface))
      return;
    for (const o of w.objects.filter((o) => o.data.accessLock))
      if (
        Object.values(action.args).some(
          (v) =>
            typeof v === 'string' &&
            forestReferenceSpelling(w, v).replace(/^object:/, '') === o.id,
        )
      )
        throw Error('Actual support reserved by unfinished access work.');
  },
};
