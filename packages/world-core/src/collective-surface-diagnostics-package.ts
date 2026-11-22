import type { V7Package } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { ROOT_SURFACE, surfaceExecute } from './collective-root-surface.js';
import {
  diagnoseSurface,
  migrateSurfaceDiagnostics,
  SURFACE_DIAGNOSTICS,
} from './collective-surface-diagnostics.js';
export const SURFACE_DIAGNOSTIC_PACKAGE: V7Package = {
  id: 'root-preparation',
  version: 3,
  scope: 'collective-ex12',
  dependencies: ['root-preparation@2'],
  description:
    'Requirement-level explanations and dated personal reads for the unchanged fractional preparation assessment.',
  reuse: {
    experiment: 'ex12 root-preparation@2',
    source:
      'collective-root-surface.ts; collective-root-work.ts; continuous-geometry.ts',
    description:
      'Reuses the existing material, support, collision, reach and feedback rules. Only diagnostic detail and retained reads are new; no recipe, material, geometry guarantee or personal mastery is granted.',
  },
  abilities: [
    {
      id: SURFACE_DIAGNOSTICS,
      name: 'Read requirement-level surface assessments',
      function:
        'Explain every existing sheet, tool, support, reach and clearance requirement independently, or read an owned dated assessment unchanged.',
      equivalence:
        'roots:physical-surface-assessment:requirement-diagnostics:1',
      parameters: {
        ...v7ObjectSchema({
          operation: { type: 'string', enum: ['assess-surface'] },
          barkId: { type: 'string' },
          toolId: { type: 'string' },
          site: v7ObjectSchema({
            x: { type: 'number' },
            y: { type: 'number' },
          }),
          assessmentId: { type: 'string' },
        }),
        required: ['operation'],
      },
      prerequisites: [ROOT_SURFACE],
      learning: 1,
      costs:
        'One additional personal study round after root-preparation-surface. A fresh assessment or retained-result read costs one active round and 0.2 energy. Supply barkId/toolId and optional site for assessment; supply assessmentId to read an owned retained result without current recomputation. No root is required.',
      effects:
        'Return dated independent pass/fail/unknown checks, actual versus required values, evidence identities and model assumptions. Unknown evidence never passes. The existing preparation requirements and costs remain unchanged; later preparation still revalidates actual conditions. The site must clear all living bodies including yours, actual obstacles and reserved surfaces. No separate bark-extraction tool inspection is required here. The last eight results and legacy unknown-detail records are personal. Explanation and rereading earn no feedback; existing genuinely new paid suitability evidence retains its canonical deduplicated rule. No stock, mastery or physical object is created.',
      handler: 'collective.root-diagnostics',
      revision: 'root-preparation@3',
      authored: false,
      practiceEvidence: 'root-surface-assessed',
      references: {},
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'One round before commitment, zero after the atomic paid assessment. Death or interruption before execution produces no debit or result; no escrow or automatic continuation exists.',
      },
      dependencies: {
        abilities: [ROOT_SURFACE],
        resources: ['bark', 'stone'],
        knowledge: [],
      },
    },
  ],
  handlers: {
    'collective.root-diagnostics': diagnoseSurface,
    'collective.root-preparation.v3': (c) => {
      if (
        c.action.args.operation === 'assess-surface' &&
        c.actor.mastered.includes(SURFACE_DIAGNOSTICS)
      )
        return diagnoseSurface(c);
      if (c.action.args.assessmentId !== undefined)
        throw new Error(
          'Learn root-surface-diagnostics before reading retained assessments.',
        );
      return surfaceExecute(c);
    },
  },
  processes: {},
  resources: [],
  satisfaction: [],
  visualComponents: ['root-work-surface'],
  events: ['root-surface-assessed', 'information-confirmed'],
  migrate(w) {
    for (const id of [ROOT_SURFACE, 'root-preparation']) {
      const a = w.abilities.find((a) => a.id === id);
      if (!a) throw new Error('Missing prerequisite preparation interface.');
      a.handler = 'collective.root-preparation.v3';
      a.parameters.properties = {
        ...a.parameters.properties,
        assessmentId: { type: 'string' },
      };
      a.costs +=
        ' Requirement-level assessment detail and dated assessmentId reads require one additional root-surface-diagnostics study; existing operations retain their previous behavior until that study.';
    }
    migrateSurfaceDiagnostics(w);
    const rule = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!rule?.maintenance)
      throw new Error('Missing unchanged canonical understanding source.');
    const trigger = {
      event: 'information-confirmed',
      interface: SURFACE_DIAGNOSTICS,
    };
    rule.alternativeTriggers = [...(rule.alternativeTriggers ?? []), trigger];
    rule.maintenance.alternativeTriggers = [
      ...(rule.maintenance.alternativeTriggers ?? []),
      trigger,
    ];
    return w;
  },
};
