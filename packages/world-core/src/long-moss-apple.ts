import type { V7ActionContext, V7Package } from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7Record, v7String, v7Json, v7Signature } from './continuous-data.js';
import { sourceFoodAssessment } from './long-food-evidence.js';
import {
  APPLE_TRIAL_ID as ID,
  APPLE_TRIAL_ITEM as ITEM,
  APPLE_REPORT_PREFIX as PREFIX,
  appleInputs,
  appleQuote,
  appleBegin,
  quoteKey,
} from './long-apple-trial.js';
const assess = sourceFoodAssessment({
  actor: 'moss',
  item: ITEM,
  resource: 'apple',
  origin: 'forest-apple-2',
  harvestedAt: 261,
  prefix: PREFIX,
  event: 'moss-apple-assessment-completed',
  label: 'Apple',
});
function execute(c: V7ActionContext) {
  const mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'begin') return appleBegin(c);
  if (mode === 'cancel') {
    const key = quoteKey(v7String(c.action.args.assessmentId, 'assessmentId')),
      q = v7Record(c.actor.extensionState[key]);
    if (c.actor.id !== 'moss' || !q.assessmentId)
      throw Error('Name your own retained assessment.');
    if (q.status === 'unexecuted') q.status = 'cancelled';
    c.emit(
      'apple-trial-cancelled',
      'No further dose authorized; paid assessment and any swallowed material remain irreversible.',
      {
        assessmentId: v7Json(q.assessmentId),
        status: v7Json(q.status ?? null),
        releasedLocks: 0,
        refunded: 0,
      },
      ITEM,
    );
    return { complete: true, writes: [] };
  }
  if (mode !== 'assess')
    throw Error(
      'Use assess, begin or cancel. QuoteTrial is a read-only own-state query, never a simulated action.',
    );
  const s = appleInputs(c),
    result = assess(c),
    event = c.world.events.at(-1),
    reportId = v7String(event?.data.reportId, 'assessmentId');
  c.actor.extensionState[quoteKey(reportId)] = appleQuote(c, reportId, s);
  if (event) {
    event.data.sourceRevision = ID + '@1';
    event.data.position = { ...c.actor.position };
    event.data.quoteStateKey = quoteKey(reportId);
    event.data.status = 'assessment-complete-ingestion-unperformed';
    event.data.observedStateFingerprint = v7Signature({
      specimenId: ITEM,
      renderedColor:
        c.world.resources.find((r) => r.id === 'apple')?.color ?? null,
    });
    const value = v7Record(
      c.actor.memory.knowledge?.[PREFIX + ':' + reportId]?.value,
    );
    if (Array.isArray(value.suppliedPersonalEvidence))
      value.suppliedPersonalEvidence = value.suppliedPersonalEvidence.map(
        (raw) => {
          const e = v7Record(raw),
            record = e.record ? v7Record(e.record) : {};
          return {
            ...e,
            applicability: !e.available
              ? 'unavailable'
              : [ITEM, 'apple', 'forest-apple-2'].includes(
                    typeof record.subject === 'string' ? record.subject : '',
                  )
                ? 'subject matches; original evidence scope remains'
                : 'unrelated source; no inference transferred',
          };
        },
      );
  }
  return result;
}
export const LONG_MOSS_APPLE: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: ['foundation-open@1'],
  description:
    'Source-bound private evidence assessment and separately authorized single-tenth personal ingestion using actual foundation physiology.',
  reuse: {
    experiment:
      'ex13 assessments; historical forest food-assessment implementation inspected, not installed or inherited',
    source:
      'bounded-unfamiliar-food-assessment@1; bounded-hazelnut-food-assessment@1; foundation-forest@1/base.eat and v7FoodEffect; foundation-open@1/open.probe; forest-food-accounting.ts',
    description:
      'Reuses exact owned assessment/private evidence, actual immutable apple nutrition/toxicity, fixed-tenths conservation and ingestion/meal accounting. Historical examine/sample five-round workflow and rewards are not activated. New explicit one-shot authorization and source applicability; no new nutrition, toxins, waiting interval or personal mastery. Existing physiology is an immediate response only, not a general safety assay.',
  },
  abilities: [
    {
      id: ID,
      name: 'Source-bound apple assessment and optional personal trial',
      function:
        'Assess Moss actual apple item-261-moss-1554, read its conditional trial quote, and only by separate explicit choice execute one conserved 0.1-unit exposure and record actual immediate response.',
      equivalence:
        'food:forest-apple-2:private-assess-explicit-tenth-response:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: ['assess', 'begin', 'cancel'] },
          specimenId: { type: 'string' },
          evidenceRefs: {
            type: 'array',
            items: { type: 'string', maxLength: 200 },
          },
          assessmentId: { type: 'string' },
          quoteId: { type: 'string' },
          explicitAuthorization: { type: 'boolean' },
        }),
        required: ['mode'],
      },
      references: { specimenId: 'owned' },
      prerequisites: [],
      learning: 1,
      learningEnergy: 0.2,
      costs:
        'Study1/.2. assess(specimenId=item-261-moss-1554,evidenceRefs=[]):atomic1/.2, whole owned unreserved unchanged apple. QuoteTrial(assessmentId):query own state exact id apple-trial-quote:ASSESSMENT_ID, zero simulation time/energy. begin(quoteId,explicitAuthorization=true):one atomic round, exactly0.1 apple, 1/current forestRestFactor energy; living health>=80, satiety<=90 and enough effort. cancel(assessmentId):administrative action0energy, no locks/refund. No automatic repeat dose.',
      effects:
        'Assessment gives only represented color and supplied complete own evidence; unavailable/partial/unrelated food evidence remains limited. It grants no reward or safety finding. Read the retained conditional quote for source/model, dose, effort, response timing and stopping rules; quote is available because actual foundation apple physiology and exact tenths already exist, not because appearance establishes safety. Normal ageing/carrying is allowed; changed quantity, processing, owner, source/model or loss of surviving condition invalidates execution. Separate explicit one-shot ingestion conserves original10tenths=remaining9+swallowed1, updates actual satiety and health through existing v7FoodEffect, independent of mood; no hidden chemistry revealed in advance. Actual immediate personal before/after evidence stays private; one dose is not general safety or absence of delayed hazards. No delayed physiology exists and no safe waiting interval is invented. No preparation products, extra food, facility, passive work, locks or repeated charge. Before commit interruption/death charges nothing; after commit no refund even on cancellation/death. Existing meal substantial-intake rules prevent a tiny dose earning diversity bonuses. Only new actual verified response may invoke unchanged grounded-understanding; names/queries/mastery/assessment/repeats0. No historical package effects activated.',
      handler: 'long.moss-apple',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'moss-apple-practice',
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'Atomic assessment or separately authorized bite; no partial process or automatic observation wait.',
      },
    },
  ],
  handlers: { 'long.moss-apple': execute },
  resources: [],
  processes: {},
  satisfaction: [],
  visualComponents: [],
  events: [
    'moss-apple-assessment-completed',
    'moss-apple-practice',
    'apple-trial-consumed',
    'apple-trial-cancelled',
    'information-confirmed',
  ],
  migrate(w) {
    const r = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    if (r?.maintenance) {
      const trigger = { event: 'information-confirmed', interface: ID };
      r.alternativeTriggers = [...(r.alternativeTriggers ?? []), trigger];
      r.maintenance.alternativeTriggers = [
        ...(r.maintenance.alternativeTriggers ?? []),
        trigger,
      ];
    }
    return w;
  },
};
