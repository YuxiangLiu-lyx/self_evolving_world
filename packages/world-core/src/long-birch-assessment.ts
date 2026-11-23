import type { V7ActionContext, V7Package } from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Id, v7Json, v7String } from './continuous-data.js';
import { forestResolveReference } from './forest-references.js';
import { personalEvidence } from './long-food-evidence.js';
import { sourceRevision } from './long-joining-geometry.js';

const ID = 'sol-birch-container-feasibility',
  ITEM = 'item-66-sol-388';
function assess(c: V7ActionContext) {
  const id = forestResolveReference(
    c.world,
    c.actor,
    v7String(c.action.args.specimenId, 'specimenId'),
    'owned',
    0.8,
  );
  const s = c.world.stacks.find((s) => s.id === id);
  if (
    c.actor.id !== 'sol' ||
    c.actor.vitals.health <= 0 ||
    !s ||
    id !== ITEM ||
    s.resource !== 'birch' ||
    s.origin !== 'forest-birch-2' ||
    s.harvestedAt !== 66 ||
    s.quantity !== 0.8 ||
    s.quantityTenths !== 8 ||
    s.processing ||
    s.reservedFor
  )
    throw new Error(
      'The exact living owner and unchanged surviving birch lot of0.8 are required.',
    );
  const { evidence, refs } = personalEvidence(c),
    revision = sourceRevision(s);
  // Carried items have actual owner access. Their historical ground coordinates
  // do not create a remote worksite or a new physical shape.
  v7Spend(c.actor, 0.5);
  const reportId = v7Id(c.world, 'birch-assessment');
  c.emit(
    'birch-assessment-completed',
    'Paid assessment ended with unavailable source geometry; no container was made.',
    {
      actorId: c.actor.id,
      specimenId: id,
      reportId,
      sourceRevision: revision,
      modelRevision: ID + '@1',
      observedStateFingerprint: revision,
      observedTick: c.world.tick,
      method: 'gentle-exterior-observation',
      phase: 'committed',
      status: 'geometry-unavailable',
      materialConsumed: 0,
      paidEnergy: 0.5,
      evidenceCount: refs.length,
      qualified: false,
    },
    id,
  );
  const eventId = c.world.events.at(-1)?.id ?? '',
    key = 'birch-assessment:' + reportId;
  c.actor.memory.knowledge ??= {};
  c.actor.memory.knowledge[key] = {
    key,
    subject: id,
    property: 'dated container prerequisites and observation limits',
    value: v7Json({
      reportId,
      eventId,
      specimenId: id,
      sourceRevision: revision,
      modelRevision: ID + '@1',
      observedStateFingerprint: revision,
      observedTick: c.world.tick,
      location: c.actor.position,
      method:
        'Gentle exterior viewing/reorientation only; no bending, loading, cutting or food contact.',
      source: {
        origin: s.origin,
        harvestedAt: s.harvestedAt,
        quantity: s.quantity,
        owner: s.owner,
        processing: null,
        interpretation:
          'Surviving accounting lot, not proof of a whole piece or sheet.',
      },
      suppliedPersonalEvidence: evidence,
      properties: {
        pieceCount: 'unavailable',
        form: 'unavailable',
        boundaries: 'unavailable',
        continuity: 'unavailable',
        surfaceCondition: 'unavailable',
        dimensions: 'unavailable',
        candidateEdges: 'unavailable',
        fasteningMethod: 'unresolved',
        meansOfHoldingJoin: 'unresolved',
        jointRetention: 'unresolved',
      },
      feasibility: {
        status: 'undetermined',
        reason:
          'No source-applicable exterior representation reconciles this remaining lot to physical pieces. Joining evidence is also unresolved; this is not universal impossibility.',
      },
      modelBoundary:
        'No birch sheet, block or geometry is introduced. The separate Lin vine/branch model has different sources and is not applicable. Existing sprite size and resource name are not physical measurements.',
      priorPressLimits:
        'Only supplied complete personal records are cited. A press response does not establish sheet geometry, joining, carrying strength, food safety or waterproofing. No hidden property or other actor record was consulted.',
      unsupportedClaims: [
        'capacity',
        'food suitability',
        'comfort',
        'strength',
        'durability',
        'waterproofing',
      ],
      materialConsumed: 0,
      materialMoved: 0,
      paidEnergy: 0.5,
      novelInformation: false,
    }),
    method:
      'actual paid nondestructive handling with exact personal evidence references',
    condition:
      'Unresolved source geometry; report is neither construction nor certification.',
    verified: false,
    tick: c.world.tick,
    evidence: eventId,
  };
  return { complete: true, writes: [] };
}
export const LONG_BIRCH_ASSESSMENT: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: ['foundation-open@1'],
  description:
    'Source-bound nondestructive birch feasibility precursor; no represented piece geometry or fabrication.',
  reuse: {
    experiment: 'ex13',
    source:
      'long-joining-geometry.ts/sourceRevision; long-food-evidence.ts/personalEvidence; forest-references.ts',
    description:
      'Reuses exact source revision reconciliation and private dated evidence reporting. Lin geometry and source permissions do not transfer. The only new behavior is the Sol source adapter and explicit container prerequisite evaluation; no historical skill or mastery is inherited.',
  },
  abilities: [
    {
      id: ID,
      name: 'Birch container prerequisite assessment',
      function:
        'Assess Sol surviving item-66-sol-388 for represented form and container prerequisites; unsupported geometry remains unavailable.',
      equivalence: 'birch:source-bound-container-prerequisite-assessment:1',
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
        'Study1 round/0.2 energy. Assess(specimenId,evidenceRefs=[]):one atomic round/0.5 energy. Exact owned unreserved birch item-66-sol-388, origin forest-birch-2, harvested66, remaining0.8/8tenths, unchanged processing. Up to8 distinct complete personal evidence keys; absent/partial references remain unavailable. Living owner carried-item access; invalid identity, access or energy fails before charge. No tools, support, destructive sample or additional material.',
      effects:
        'Gentle exterior viewing/reorientation yields an append-only private dated prerequisite report. Current source has no piece-count, form, boundary, continuity, surface-condition or dimension representation; quantity and render size do not establish them. No convenient sheet geometry is added. Joining method and retention remain unresolved; conclusion undetermined rather than impossible. Supplied own press evidence retains its method/limits and proves no container strength, capacity, food safety, comfort or waterproofing. Same identity, owner, quantity, position and condition remain, subject to ordinary ageing. No physical product, marker, stock, reservation, ongoing work or passive effect. Before atomic commit interruption/death creates no charge/event; after commit spent effort is not refunded and the private record persists. Repeated actions revalidate and create distinct dated observations, never replay a prior committed charge. Unavailable model facts and existing control metadata are not new discovery: zero curiosity, practice, satisfaction or nutrition reward.',
      handler: 'long.birch-assessment',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'birch-assessment-practice',
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress: 'Atomic not-started or committed; no partial work or escrow.',
      },
    },
  ],
  handlers: { 'long.birch-assessment': assess },
  resources: [],
  processes: {},
  satisfaction: [],
  visualComponents: [],
  events: ['birch-assessment-completed', 'birch-assessment-practice'],
};
