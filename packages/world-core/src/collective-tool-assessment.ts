import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7Package,
} from './continuous-types.js';
import {
  v7Clone,
  v7Id,
  v7Json,
  v7Signature,
  v7String,
} from './continuous-data.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { rootToolPredicate } from './collective-tool-predicate.js';
import { surfaceOwned } from './collective-root-surface.js';
import { scratchVisible } from './open-hardness-physics.js';
export const TOOL_ASSESSMENT = 'tool-suitability-assessment';
export function toolAssessmentHistory(a: V7Actor): V7Data[] {
  const value = a.extensionState[TOOL_ASSESSMENT + ':history'];
  return Array.isArray(value)
    ? value
        .filter(
          (v): v is V7Data => !!v && typeof v === 'object' && !Array.isArray(v),
        )
        .map(v7Clone)
    : [];
}
export function toolAssessmentResult(a: V7Actor): V7Data | null {
  const value = a.extensionState[TOOL_ASSESSMENT + ':result'];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? v7Clone(value)
    : null;
}
function execute(c: V7ActionContext) {
  if (c.actor.vitals.health <= 0)
    throw new Error('A living performer is required.');
  const mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'read') {
    const id = v7String(c.action.args.assessmentId, 'assessmentId');
    const result = toolAssessmentHistory(c.actor).find(
      (r) => r.assessmentId === id,
    );
    if (!result) throw new Error('No such retained personal tool assessment.');
    v7Spend(c.actor, 0.2);
    c.actor.extensionState[TOOL_ASSESSMENT + ':result'] = v7Clone(result);
    c.emit(
      'tool-suitability-read',
      'Read a dated tool-only result; later conditions are not substituted.',
      { ...result, historicalRead: true, readAt: c.world.tick },
      c.actor.id,
    );
    const e = c.world.events.at(-1);
    if (e) e.position = null;
    return { complete: true, writes: [] };
  }
  if (
    mode !== 'assess' ||
    c.action.args.requirement !== 'root-preparation-surface:hard-tool'
  )
    throw new Error(
      'Select assess and the supported versioned tool requirement.',
    );
  // In this engine an owned unreserved stack is carried; its saved coordinates are not a second inventory authority.
  // Ground/escrow items are unavailable through the shared owned resolver; no remote ownership exception is introduced.
  const s = surfaceOwned(c, 'toolId');
  const predicate = rootToolPredicate(c.world, s);
  const represented = c.world.state['hardness:intrinsic:' + s.id];
  // Inspection reuses the existing contact model on a copy, without installing a latent physical profile or changing the tool.
  const contact = scratchVisible(v7Clone(c.world), v7Clone(s));
  const checks: V7Data[] = [
    {
      code: 'availability',
      status: 'pass',
      observed: {
        owner: s.owner,
        carried: true,
        reserved: false,
        quantity: s.quantity,
      },
      required: 'Actual owned unreserved carried item.',
    },
    {
      code: 'intrinsic-hardness',
      status:
        predicate.hardness === null
          ? 'unknown'
          : predicate.hardness >= 3
            ? 'pass'
            : 'fail',
      observed: predicate.hardness,
      required: {
        minimum: 3,
        unit: 'engine contact-resistance index, not Mohs',
      },
      basis:
        'Resolved actual material profile/registered property. Model-backed; not a scratch-test measurement.',
    },
    {
      code: 'usable-form-and-contact',
      status: predicate.form && predicate.contact ? 'pass' : 'fail',
      observed: {
        materialForm: s.resource,
        quantity: s.quantity,
        damaged: !!s.processing?.wovenDamage,
        assayAltered: !!s.processing?.gravimetricAssay,
      },
      required:
        'Existing preparation predicate: one actual stone unit, no represented woven damage or gravimetric alteration. No new edge-radius threshold is added.',
    },
  ];
  v7Spend(c.actor, 0.2);
  const result: V7Data = {
    assessmentId: v7Id(c.world, 'assessment'),
    actor: c.actor.id,
    tick: c.world.tick,
    itemId: s.id,
    itemRevision: v7Signature({
      resource: s.resource,
      quantity: s.quantity,
      origin: s.origin,
      hardness: predicate.hardness,
      contact: v7Json(contact),
      damaged: !!s.processing?.wovenDamage,
      assayAltered: !!s.processing?.gravimetricAssay,
    }),
    requirement: 'root-preparation-surface:hard-tool',
    requirementRevision: 'root-preparation@2',
    checks,
    contact: v7Json(contact),
    evidenceSource: {
      origin: s.origin,
      resource: s.resource,
      resolvedHardness: predicate.hardness,
      contact: represented
        ? 'Existing represented contact geometry, visually inspected without alteration.'
        : 'Existing registry-backed contact model; no material geometry experiment.',
    },
    uncertainty:
      'No scratch test, reference specimen, bark, food or complete worksite was examined. The result certifies only the existing tool predicate at this round. Use revalidates current state.',
    suitable: predicate.suitable && checks.every((r) => r.status === 'pass'),
    entireSetupCertified: false,
    costs: { rounds: 1, energy: 0.2 },
    remainingWork: 0,
  };
  c.actor.extensionState[TOOL_ASSESSMENT + ':result'] = v7Clone(result);
  c.actor.extensionState[TOOL_ASSESSMENT + ':history'] = [
    ...toolAssessmentHistory(c.actor),
    v7Clone(result),
  ].slice(-8);
  c.emit(
    'tool-suitability-assessed',
    'Paid tool-only inspection; intrinsic hardness is provenance-backed, not measured.',
    v7Clone(result),
    s.id,
  );
  // The minimal interface performs no physical test: registry/model reports and known condition reads never mint discovery rewards.
  return { complete: true, writes: [] };
}
export const TOOL_ASSESSMENT_PACKAGE: V7Package = {
  id: TOOL_ASSESSMENT,
  version: 1,
  scope: 'collective-ex12',
  dependencies: ['root-preparation@2'],
  description:
    'Paid tool-only suitability inspection with explicit provenance and no material consumption.',
  reuse: {
    experiment:
      'ex12 preparation predicates and generic ex10 contact geometry implementation',
    source:
      'collective-root-surface.ts; collective-tool-predicate.ts; open-hardness-physics.ts; forest-references.ts',
    description:
      'Reuses exact ownership, actual material requirements and existing contact representation. No historical hardness capability, personal knowledge or scratch reference is installed.',
  },
  abilities: [
    {
      id: TOOL_ASSESSMENT,
      name: 'Assess an actual preparation tool',
      function:
        'Inspect one actual owned tool against the existing preparation tool predicate without requiring bark or food; retain and read dated tool-only results.',
      equivalence: 'roots:preparation-tool:standalone-suitability:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: ['assess', 'read'] },
          toolId: { type: 'string' },
          requirement: {
            type: 'string',
            enum: ['root-preparation-surface:hard-tool'],
          },
          assessmentId: { type: 'string' },
        }),
        required: ['mode'],
      },
      prerequisites: ['root-preparation-surface'],
      learning: 1,
      costs:
        'One additional study round. Assess or read: one active round and 0.2 energy, no materials. Assess names exact owned available toolId and requirement; read names a personal retained assessmentId.',
      effects:
        'Dated pass/fail/unknown hardness >=3, usable form/contact and availability with exact provenance. Current unreserved owned stacks are carried regardless of stale stored coordinates; escrow and unowned ground items cannot be remotely inspected as owned tools. Contact uses existing represented geometry or explicitly labeled registry-backed modeling. No destructive test, reference sample, preparation, reservation or entire-setup guarantee. Last eight records survive restore. Registry/model facts, inconclusive inspections and reads receive no new-knowledge or mastery award.',
      handler: 'collective.tool-assessment',
      revision: TOOL_ASSESSMENT + '@1',
      authored: false,
      practiceEvidence: 'information-confirmed',
      references: {},
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'One pending active round; atomic completion has zero remaining work. Cancel/death before commitment has no cost or record. No escrow or rollback.',
      },
      dependencies: {
        abilities: ['root-preparation-surface'],
        resources: [],
        knowledge: [],
      },
    },
  ],
  handlers: { 'collective.tool-assessment': execute },
  processes: {},
  resources: [],
  satisfaction: [],
  events: [
    'tool-suitability-assessed',
    'tool-suitability-read',
    'information-confirmed',
  ],
  visualComponents: [],
  migrate(w) {
    const rule = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (!rule?.maintenance)
      throw new Error('Missing canonical understanding source.');
    const trigger = {
      event: 'information-confirmed',
      interface: TOOL_ASSESSMENT,
    };
    rule.alternativeTriggers = [...(rule.alternativeTriggers ?? []), trigger];
    rule.maintenance.alternativeTriggers = [
      ...(rule.maintenance.alternativeTriggers ?? []),
      trigger,
    ];
    return w;
  },
};
