import type { V7Package } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { assessTray, TRAY_CLEARANCE } from './collective-tray-clearance.js';
export const TRAY_CLEARANCE_PACKAGE: V7Package = {
  id: TRAY_CLEARANCE,
  version: 1,
  scope: 'collective-ex12',
  dependencies: ['root-air-drying@1'],
  description:
    'Paid personal geometry inspection of the unchanged root tray placement rules.',
  reuse: {
    experiment: 'ex12 root-air-drying@1',
    source:
      'collective-root-work.ts; collective-tray-placement.ts; continuous-geometry.ts',
    description:
      'Extracts and reuses existing construction predicates. This new diagnostic grants no materials, facilities, reservation or mastery.',
  },
  abilities: [
    {
      id: TRAY_CLEARANCE,
      name: 'Inspect tray placement clearance',
      function:
        'Record every observable placement condition at a chosen site, including your own body and actual blockers; read dated personal results.',
      equivalence: 'roots:tray-placement:geometry-diagnostics:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: ['assess', 'read'] },
          site: v7ObjectSchema({
            x: { type: 'number' },
            y: { type: 'number' },
          }),
          angle: { type: 'number' },
          assessmentId: { type: 'string' },
        }),
        required: ['mode'],
      },
      prerequisites: ['root-air-drying'],
      learning: 1,
      costs:
        'One additional personal study round. Each assess or read costs one round and 0.2 energy, no materials. Assess requires explicit finite in-bounds site coordinates. Read requires your retained assessmentId.',
      effects:
        'Dated radius 0.4 circular footprint, reach, bounds, nine-point ground support, actual observed blockers and unknown coverage. The angle is geometrically irrelevant for this existing circle. No separate approach corridor predicate is added. Non-solid unreserved plants do not obstruct. Last eight personal assessments retained; reads preserve original evidence time. No reservation or construction guarantee; building rechecks live physical state. Only personally new paid placement facts can qualify for the existing bounded understanding source; reads and repeated unchanged checks do not reward.',
      handler: 'collective.tray-clearance',
      revision: TRAY_CLEARANCE + '@1',
      authored: false,
      practiceEvidence: 'information-confirmed',
      references: {},
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'One pending round, zero remaining work after atomic paid commitment. Cancellation/death before commitment has no payment or result; no escrow or rollback after completion.',
      },
      dependencies: {
        abilities: ['root-air-drying'],
        resources: [],
        knowledge: [],
      },
    },
  ],
  handlers: { 'collective.tray-clearance': assessTray },
  processes: {},
  resources: [],
  satisfaction: [],
  visualComponents: [],
  events: [
    'tray-clearance-assessed',
    'tray-clearance-read',
    'information-confirmed',
  ],
  migrate(w) {
    const rule = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!rule?.maintenance)
      throw new Error('Missing canonical understanding source.');
    const trigger = {
      event: 'information-confirmed',
      interface: TRAY_CLEARANCE,
    };
    rule.alternativeTriggers = [...(rule.alternativeTriggers ?? []), trigger];
    rule.maintenance.alternativeTriggers = [
      ...(rule.maintenance.alternativeTriggers ?? []),
      trigger,
    ];
    return w;
  },
};
