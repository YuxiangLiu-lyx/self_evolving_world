import type { V7ActionContext, V7Package } from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Id, v7Json, v7Signature, v7String } from './continuous-data.js';
import { forestResolveReference } from './forest-references.js';
import { personalEvidence } from './long-food-evidence.js';
import { sourceRevision } from './long-joining-geometry.js';
const ID = 'sol-branch-rain-screen-feasibility',
  ITEM = 'item-279-sol-1666';
function assess(c: V7ActionContext) {
  const id = forestResolveReference(
      c.world,
      c.actor,
      v7String(c.action.args.specimenId, 'specimenId'),
      'owned',
      1,
    ),
    s = c.world.stacks.find((s) => s.id === id);
  if (
    c.actor.id !== 'sol' ||
    c.actor.vitals.health <= 0 ||
    !s ||
    id !== ITEM ||
    s.resource !== 'branch' ||
    s.origin !== 'start-1-branches' ||
    s.harvestedAt !== 279 ||
    s.quantity !== 1 ||
    s.quantityTenths !== 10 ||
    s.processing ||
    s.reservedFor ||
    s.componentLots
  )
    throw Error(
      'The living reviewed owner and actual whole unchanged unreserved branch are required.',
    );
  const { evidence, refs } = personalEvidence(c),
    revision = sourceRevision(s),
    observed = {
      renderedColor:
        c.world.resources.find((r) => r.id === 'branch')?.color ?? null,
    },
    fingerprint = v7Signature({ source: revision, observed });
  v7Spend(c.actor, 0.5);
  const reportId = v7Id(c.world, 'branch-assessment');
  c.emit(
    'branch-assessment-completed',
    'Geometry unavailable; no load test or rain screen performed.',
    {
      actorId: c.actor.id,
      specimenId: id,
      reportId,
      location: { ...c.actor.position },
      observedTick: c.world.tick,
      method: 'in-place-exterior-view',
      sourceRevision: revision,
      modelRevision: ID + '@1',
      observedStateFingerprint: fingerprint,
      phase: 'committed',
      progress: 1,
      status: 'geometry-unavailable-no-load-test',
      evidenceCount: refs.length,
      paidEnergy: 0.5,
      materialConsumed: 0,
      qualified: false,
    },
    id,
  );
  const eventId = c.world.events.at(-1)?.id ?? '',
    key = 'branch-assessment:' + reportId;
  c.actor.memory.knowledge ??= {};
  c.actor.memory.knowledge[key] = {
    key,
    subject: id,
    property: 'dated rain-screen support prerequisites and observation limits',
    value: v7Json({
      reportId,
      eventId,
      specimenId: id,
      sourceRevision: revision,
      modelRevision: ID + '@1',
      observedStateFingerprint: fingerprint,
      observedTick: c.world.tick,
      location: { ...c.actor.position },
      performedMethod:
        'View the actually carried material in place. No unsupported lifting/reorientation or added mechanical load.',
      observed,
      source: {
        origin: s.origin,
        harvestedAt: s.harvestedAt,
        quantity: s.quantity,
        owner: s.owner,
        interpretation:
          'An accounting lot, not measured piece count, usable span or dimensions.',
      },
      suppliedPersonalEvidence: evidence.map((e) => ({
        ...e,
        applicability: !e.available
          ? 'unavailable'
          : [ITEM, 'branch', 'start-1-branches'].includes(
                e.record?.subject ?? '',
              )
            ? 'subject matches; original method and scope retained'
            : 'unrelated source; no geometry or strength inference transferred',
      })),
      properties: {
        dimensions: 'unavailable',
        pieceCount: 'unavailable',
        straightness: 'unavailable',
        forks: 'unavailable',
        condition: 'unavailable',
        handlingConstraints: 'unavailable',
        massMeasurement: 'unavailable',
        stiffness: 'unavailable',
        loadCapacity: 'unavailable',
      },
      feasibility: {
        status: 'undetermined',
        reason:
          'No source-applicable specimen geometry or mechanical response is represented. This is not a failed construction or a universal impossibility conclusion.',
      },
      unresolved: [
        'Actual dimensions and condition',
        'Safe contact/support points and load-response model',
        'Actually acquired covering with relevant mass and rain behavior',
        'An executable attachment and stable anchorage method',
        'Actual site conditions and clear actor exclusion region',
      ],
      modelBoundary:
        'Lin canopy-18 joining pieces and hazelnut anatomy do not describe this start-1-branches lot. Marker/sprite geometry, resource name and quantity are not specimen measurements. No physical assumption is added in this precursor.',
      trialQuote: null,
      nextBoundary:
        'Any load trial requires a separately reviewed executable source-specific response, real support/load identities, safe geometry, exclusion area, load/time limits, stop rules, removal method, costs and conserved damage fragments. These are unresolved conditions, not a prescribed material recipe.',
      materialConsumed: 0,
      materialMoved: 0,
      paidEnergy: 0.5,
      novelInformation: false,
    }),
    method:
      'actual paid in-place exterior view and exact own evidence citations',
    condition:
      'Geometry and mechanical response unresolved; no strength, shelter or comfort certificate.',
    verified: false,
    tick: c.world.tick,
    evidence: eventId,
  };
  return { complete: true, writes: [] };
}
export const LONG_BRANCH_ASSESSMENT: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: ['foundation-open@1'],
  description:
    'Actual owned-branch geometry and rain-screen prerequisite assessment, without a load trial or shelter.',
  reuse: {
    experiment: 'ex13',
    source:
      'source-bound-joining-trial@1/long-joining-geometry.ts/sourceRevision; sol-birch-container-feasibility@1; long-food-evidence.ts/personalEvidence; forest-references.ts',
    description:
      'Full joining and birch implementations compared. Reuses exact source reconciliation, private evidence, atomic payment and append-only report/event pattern. The source/person binding and rain-screen questions differ; Lin geometry/permissions and Sol birch claims do not transfer. No historical ability, mastery, physical shape or new reward is installed.',
  },
  abilities: [
    {
      id: ID,
      name: 'Branch rain-screen prerequisite assessment',
      function:
        'Assess Sol actual owned item-279-sol-1666 for supported form and prerequisites of a small rain-screen support; unavailable geometry and load response remain explicit.',
      equivalence: 'branch:source-bound-rain-screen-prerequisite-assessment:1',
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
        'Study1 active round/.2 energy. Assess(specimenId=item-279-sol-1666,evidenceRefs=[]):one atomic round/.5 energy, exact whole owned unreserved branch, origin start-1-branches harvested279. Up to8 distinct complete own evidence keys. Living actual carried access, sufficient energy; invalid input fails before payment. No tools, load, support, covering, travel, consumption or reservation.',
      effects:
        'Observe actual rendering in place; safe lifting/reorientation is not represented and is not performed. Private dated report distinguishes existing facts, personal evidence and missing dimensions/condition/contact/support/load response/covering/rain behavior/attachments/anchorage/site constraints. No source geometry, arbitrary safe load or named recipe is invented; no load trial, standing structure, fragments, rain protection, comfort or strength certificate. Quantity1 is not measured span or a usable single piece. Same identity/quantity/ownership/location/condition, with normal ageing. No marker, passive effect, escrow or partial work. Before commit interruption/death has no charge/report; after commit effort is retained. Repeat is a new paid dated assessment. Missing model details and report creation give no curiosity/practice/satisfaction reward. Future physical trials require new implementation and explicit executable quotes; existing knowledge or mastery is not transferred.',
      handler: 'long.branch-assessment',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'branch-assessment-practice',
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'Atomic not-started or committed report; no ongoing work, locks or automatic refresh.',
      },
    },
  ],
  handlers: { 'long.branch-assessment': assess },
  resources: [],
  processes: {},
  satisfaction: [],
  visualComponents: [],
  events: ['branch-assessment-completed', 'branch-assessment-practice'],
};
