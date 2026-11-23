import type { V7Package } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { forestReferenceSpelling } from './forest-references.js';
import {
  NUT_ID as ID,
  NUT_REV as REV,
  installNutContact,
} from './long-nut-contact.js';
import { nutExecute, nutDeath } from './long-nut-work.js';
export const LONG_NUT_OPENING: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: ['owned-hazelnut-assessment@1'],
  description:
    'Actual bounded stone contact on one reviewed specimen, with conserved retained assembly and private inspection.',
  reuse: {
    experiment: 'ex13',
    source:
      'owned-hazelnut-assessment@1; forest-references.ts; collective-work.ts; continuous-geometry.ts',
    description:
      'Reuses prior exterior representation, actual ownership/geometry/work and existing bounded information feedback. New response model is an explicit assumption, not prior measurement or a historical skill installation.',
  },
  migrate: installNutContact,
  abilities: [
    {
      id: ID,
      name: 'Bounded source specimen opening trial',
      function:
        'Assess actual prerequisites, apply at most two paid contacts, then inspect the conserved specimen without safety or food claims.',
      equivalence: 'specimen:hazelnut:bounded-stone-opening:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['assess', 'begin', 'resume', 'cancel', 'inspect'],
          },
          specimenId: { type: 'string' },
          toolId: { type: 'string' },
          supportId: { type: 'string' },
          assessmentId: { type: 'string' },
          processId: { type: 'string' },
        }),
        required: ['mode'],
      },
      references: {},
      prerequisites: [],
      learning: 2,
      learningEnergy: 0.2,
      costs:
        'Study2 rounds at0.2 energy. Assess(specimenId, optional toolId/supportId):1 round/0.5 energy; missing prerequisites reported without transforming/reserving matter. Exact owned item-119-lin-699; executable method needs one actually owned whole stone and a reachable free solid rock support, not bare hands or a non-solid marker. Begin(specimenId,assessmentId):at most2 total lifetime contacts at1 energy each; exact stone blunts0.002/contact (no fracture under this bounded model), zero matter consumed. Resume/cancel(processId) preserve irreversible paid changes. Inspect(processId):1 round/0.2 energy. Failed access/identity/energy checks precede payment; work pauses before another charge.',
      effects:
        'Versioned abstract contact response relates actual stone hardness, bounded effort, contact geometry, current tool blunting and specimen condition to real discontinuity/exposure; not calibrated force, measured shell strength or guaranteed opening. Geometry/body comparison resolution0.02 uncertainty0.01; model assumptions explicitly reported. No bare-hand method. Inputs locked against conflicting use; real specimen placed at supported reachable contact region, no remote material return. Progress survives pauses/restoration; cancellation/death releases locks once without refund/repair. Whole identity remains quantity1 with retained internal source fractions; no additional contents, debris loss, nutrition, safety certificate, comfort or passive work. Existing ageing continues. Pickup after completion/cancellation requires actual local action. Detailed findings stay personal; interior is not disclosed until actual exposure. Actual new verified inspection may reuse existing grounded-understanding0.8/cap1/duration8/cooldown12/maintained0.035/decay0.0015; missing rule zero. Requests, registration, study, prerequisite reports and repeated unchanged findings earn zero. This version does not model detached fragments, preparation requirements or tool utility beyond this contact.',
      handler: 'long.nut-opening',
      revision: REV,
      authored: false,
      practiceEvidence: 'nut-opening-practice',
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'Exact processId, source/tool/support locks, paid contacts and remaining bounded effort retained; each contact is a real round.',
      },
    },
  ],
  handlers: { 'long.nut-opening': nutExecute },
  resources: [],
  processes: {},
  satisfaction: [],
  visualComponents: [],
  events: [
    'nut-opening-assessed',
    'nut-opening-contact',
    'nut-opening-completed',
    'nut-opening-inspected',
    'nut-opening-stopped',
    'information-confirmed',
    'nut-opening-practice',
  ],
  onDeath: nutDeath,
  beforeAction: (w, _a, action) => {
    if (
      [
        'navigate',
        'wait',
        'rest',
        'message',
        ID,
        'moss-source-bound-hazelnut-interior-access-trial',
        'moss-exposed-hazelnut-assessment-and-recovery',
      ].includes(action.interface)
    )
      return;
    for (const o of w.objects.filter((o) => o.data.nutContactLock)) {
      if (
        Object.values(action.args).some(
          (v) =>
            typeof v === 'string' &&
            forestReferenceSpelling(w, v).replace(/^object:/, '') === o.id,
        )
      )
        throw new Error(
          'The actual support contact surface is reserved by unfinished work.',
        );
    }
  },
};
