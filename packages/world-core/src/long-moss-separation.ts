import type { V7ActionContext, V7Package } from './continuous-types.js';
import { v7Id, v7Json, v7Record, v7String } from './continuous-data.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { personalEvidence } from './long-food-evidence.js';
import {
  SEPARATION_ID as ID,
  SEPARATION_ITEM as ITEM,
  installSeparation,
  validateSeparation,
  separationFinding,
  separationCanonical,
} from './long-moss-separation-model.js';
function execute(c: V7ActionContext) {
  const mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'cancel') {
    const record =
      c.actor.memory.knowledge?.[
        'separation:' + v7String(c.action.args.assessmentId, 'assessmentId')
      ];
    if (
      c.actor.id !== 'moss' ||
      !record ||
      record.subject !== ITEM ||
      !record.evidence
    )
      throw Error('Name your own completed prerequisite assessment.');
    c.emit(
      'separation-cancelled',
      'No contact process or locks were created; no refund or material movement.',
      {
        assessmentId: c.action.args.assessmentId ?? null,
        releasedLocks: 0,
        qualified: false,
      },
      ITEM,
    );
    return { complete: true, writes: [] };
  }
  if (mode !== 'assess')
    throw Error(
      'No executable separation quote or process: internal path, retention response, conserved output partition and receiver are unresolved. Begin/resume cannot charge or perform unsupported contact.',
    );
  const { model, s, t } = validateSeparation(c),
    { evidence } = personalEvidence(c),
    finding = separationFinding(Number(model.aperture));
  v7Spend(c.actor, 0.5);
  const assessmentId = v7Id(c.world, 'separation-assessment'),
    key = 'separation:' + assessmentId,
    canonicalKey = separationCanonical(finding),
    known = Object.values(c.actor.memory.knowledge ?? {}).some(
      (k) => k.verified && v7Record(k.value).canonicalKey === canonicalKey,
    );
  c.emit(
    'separation-assessed',
    'Actual exterior clearance examined; no supported separation quote.',
    {
      assessmentId,
      sourceId: s.id,
      actuatorRef: t.id,
      sourceRevision: v7Json(model.sourceRevision ?? null),
      modelRevision: ID + '@1',
      phase: 'prerequisites-unresolved',
      observedTick: c.world.tick,
      position: { ...c.actor.position },
      method: 'gentle-exterior-observation',
      remainingWork: 0,
      contacts: 0,
      transferred: 0,
      qualified: false,
    },
    s.id,
  );
  const eventId = c.world.events.at(-1)?.id ?? '';
  c.actor.memory.knowledge ??= {};
  c.actor.memory.knowledge[key] = {
    key,
    subject: s.id,
    property: 'dated exposed-aperture clearance and separation prerequisites',
    value: v7Json({
      assessmentId,
      eventId,
      canonicalKey,
      observedState: finding,
      sourceRevision: model.sourceRevision,
      toolRevision: model.toolRevision,
      sourceLineage: model.sourceLineage,
      toolLineage: model.toolLineage,
      observedTick: c.world.tick,
      observedRegion: 'local exposed aperture only',
      modelAssumption: model.assumption,
      suppliedPersonalEvidence: evidence,
      quote: null,
      retention: 'unresolved',
      internalPath: 'unresolved',
      receiverAccess: 'not assessed; none supplied',
      missing: [
        'source-applicable retention/release response',
        'supported actuator/path',
        'conserved detachable allocation',
        'actual receiver geometry',
      ],
      allocations: { parent: 1, detached: 0, residue: 0, loss: 0 },
      materialMoved: 0,
      paidEnergy: 0.5,
      wear: 0,
      contactAttempts: 0,
      interpretation:
        'Measured stone clearance is a limited physical finding, not a general impossibility result. No opening contact, insertion, food or safe manipulation is established.',
    }),
    method:
      'paid gentle reorientation and approximate body-scale aperture comparison',
    condition:
      'Only observedState is verified; all separation prerequisites remain unresolved.',
    verified: true,
    tick: c.world.tick,
    evidence: eventId,
  };
  const raw = c.actor.extensionState['long:confirmed-physical-properties'],
    seen = Array.isArray(raw) ? raw : [];
  if (!known && !seen.includes(canonicalKey)) {
    c.actor.extensionState['long:confirmed-physical-properties'] = [
      ...seen,
      canonicalKey,
    ];
    if (c.world.satisfaction.some((r) => r.id === 'grounded-understanding'))
      c.emit(
        'information-confirmed',
        'New paid source-specific clearance finding; no separation or food benefit.',
        { key, canonicalKey, evidence: eventId, qualified: true },
        s.id,
      );
  }
  return { complete: true, writes: [] };
}
export const LONG_MOSS_SEPARATION: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: [
    'moss-exposed-hazelnut-assessment-and-recovery@1',
    'source-bound-opened-hazelnut-access-trial@1',
  ],
  description:
    'Recovered-source access measurement precursor; no supported separation quote or detached material.',
  reuse: {
    experiment: 'ex13',
    source:
      'long-nut-access-model.ts/rimResponse; long-moss-recovery.ts; long-nut-contact.ts; collective-work.ts; long-food-evidence.ts',
    description:
      'Inspected full access/contact/recovery and residue-transfer implementations. Reuses deterministic source-bound aperture law, actual exhausted contact ledger, source revision and private evidence. Residue code moves already external parcels and cannot supply an interior partition. New recovered forest-source applicability, not independent invention or inherited Lin outcomes. No copied source permissions or mastery.',
  },
  migrate: installSeparation,
  abilities: [
    {
      id: ID,
      name: 'Recovered forest specimen separation prerequisites',
      function:
        'Measure actual exposed aperture of Moss recovered item-184-moss-1091 against owned stone item-185-moss-1097; report unresolved separation prerequisites without detaching material.',
      equivalence:
        'specimen:forest-hazelnut:recovered-clearance-prerequisite:1',
      parameters: {
        ...v7ObjectSchema({
          mode: {
            type: 'string',
            enum: ['assess', 'begin', 'resume', 'cancel'],
          },
          specimenId: { type: 'string' },
          actuatorRef: { type: 'string' },
          assessmentId: { type: 'string' },
          processId: { type: 'string' },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
        }),
        required: ['mode'],
      },
      references: {},
      prerequisites: [],
      learning: 2,
      learningEnergy: 0.2,
      costs:
        'Study2 active rounds/0.2 each. Assess(specimenId=item-184-moss-1091,actuatorRef=item-185-moss-1097,evidenceRefs=[]):1 atomic round/0.5 energy, exact whole owned unreserved recovered inputs, original completed process and unchanged condition. Carried access; no support needed for viewing. No tool wear/material consumption/placement. Missing/changed/foreign inputs or energy fail before pay. Cancel(assessmentId):administrative action/0energy, no process/locks/refund. Begin/resume fail before cost: no executable quote exists in this precursor.',
      effects:
        'New seed/provenance aperture model within existing exterior envelope, explicit assumption not prior measurement or visibleRegion-derived anatomy. Paid observation resolution0.02 uncertainty0.01 compares actual exterior aperture with represented stone diameter; no sub-resolution safety claim. No internal path, loose component, retention/release law, conserved output partition or receiver is supported: quote remains null. No contact, displacement, opening reset, tool wear, separation, new stock, food or passive effect. Parent1/detached0/loss0, original2 contacts remain exhausted. No escrow or unfinished physical work; interruption before atomic commit has no charge, after commit paid study/examination persists. Ordinary ageing and separate real pickup apply. Reassessment cannot create contact allowance or replenish original ledger. Private dated findings; canonical source/property/state dedup excludes IDs/timestamps, repeated/missing facts0. Only new verified clearance can invoke existing grounded-understanding; missing rule0, no new reward parameters. No practice/comfort/nutrition/safety benefit.',
      handler: 'long.moss-separation',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'separation-practice',
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'Atomic examination; no supported contact quote or resumable separation work.',
      },
    },
  ],
  handlers: { 'long.moss-separation': execute },
  resources: [],
  processes: {},
  satisfaction: [],
  visualComponents: [],
  events: [
    'separation-assessed',
    'separation-cancelled',
    'separation-practice',
    'information-confirmed',
  ],
};
