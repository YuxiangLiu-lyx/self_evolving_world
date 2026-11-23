import type { V7ActionContext, V7Package } from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Id, v7Json, v7Signature, v7String } from './continuous-data.js';
import { forestResolveReference } from './forest-references.js';
import { v7Reach, v7Visible } from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';
import { personalEvidence } from './long-food-evidence.js';
const ID = 'source-bound-plum-food-assessment',
  SOURCE = 'forest-plum-2';
function assess(c: V7ActionContext) {
  const id = forestResolveReference(
      c.world,
      c.actor,
      v7String(c.action.args.sourceId, 'sourceId'),
      'object',
    ),
    o = v7Observe(c.world, c.actor.id).objects.find((o) => o.id === id);
  if (
    c.actor.id !== 'lin' ||
    c.actor.vitals.health <= 0 ||
    id !== SOURCE ||
    !o ||
    o.revision !== 'foundation-forest@1' ||
    o.data.resource !== 'plum' ||
    !v7Reach(c.actor, o.spatial) ||
    !v7Visible(c.world, c.actor.position, o.spatial)
  )
    throw Error(
      'Reach the actual visible standing plum source with the living reviewed actor before assessment; no automatic approach.',
    );
  const { evidence, refs } = personalEvidence(c);
  const supplied = evidence.map((e) => ({
    ...e,
    applicability: !e.available
      ? 'unavailable'
      : [SOURCE, 'plum'].includes(e.record?.subject ?? '')
        ? 'subject matches; original claim and method still require evaluation'
        : 'unrelated source/property; no food-safety inference transferred',
  }));
  const observed = {
    id: o.id,
    revision: o.revision,
    position: { x: o.spatial.x, y: o.spatial.y },
    label: o.name,
    resourceLabel: o.data.resource,
    stock: o.data.stock ?? null,
    stage: o.data.stage ?? null,
    renderingState: o.visual.state,
    renderedColor: o.visual.color,
  };
  const fingerprint = v7Signature(observed);
  v7Spend(c.actor, 0.2);
  const reportId = v7Id(c.world, 'plum-assessment'),
    key = 'plum-assessment:' + reportId;
  c.emit(
    'plum-assessment-completed',
    'Standing source examined; consumption support is not established.',
    {
      actorId: c.actor.id,
      sourceId: id,
      sourceRevision: o.revision,
      observedStateFingerprint: fingerprint,
      observedTick: c.world.tick,
      reportId,
      method: 'local-nondestructive-source-view',
      methodRevision: ID + '@1',
      component: 'assessment-report',
      state: 'completed-evidence-limited',
      safetyStatus: 'unresolved',
      label: 'Source assessment',
      evidenceCount: refs.length,
      qualified: false,
    },
    id,
  );
  const eventId = c.world.events.at(-1)?.id ?? '';
  c.actor.memory.knowledge ??= {};
  c.actor.memory.knowledge[key] = {
    key,
    subject: id,
    property: 'dated standing-source food evidence limits',
    value: v7Json({
      reportId,
      eventId,
      sourceRevision: o.revision,
      methodRevision: ID + '@1',
      observedTick: c.world.tick,
      observedStateFingerprint: fingerprint,
      directObservations: observed,
      suppliedPersonalEvidence: supplied,
      consumptionSupport: 'not established',
      evidenceScope:
        'Only supplied complete personal records were cited. Their original claims are not a source-specific consumption or preparation demonstration. Other known foods do not establish this source.',
      unavailableProperties: [
        'botanical identification',
        'edible portions',
        'ingestion hazards',
        'toxin absence',
        'preparation efficacy',
        'nutrition',
      ],
      missingPrerequisites: [
        'source-applicable identification and food evidence',
        'supported source-specific observation or preparation method',
      ],
      nextBoundary:
        'If a closer specimen trial is needed, actual approach and separate collection must precede its reviewed method. Existing communication/knowledge exchange needs real participants. No preparation or tasting procedure is certified or automatically performed.',
      limitation:
        'Current public availability, maturity, name and rendering are not proof of safety or poisoning. No new food property is modeled by this precursor.',
      paidEnergy: 0.2,
      materialConsumed: 0,
      novelInformation: false,
    }),
    method:
      'paid local nondestructive source observation and exact own evidence review',
    condition:
      'Dated availability only; safety and consumption remain unresolved.',
    verified: false,
    tick: c.world.tick,
    evidence: eventId,
  };
  return { complete: true, writes: [] };
}
export const LONG_PLUM_ASSESSMENT: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: ['foundation-open@1'],
  description:
    'Standing-source applicability of the evidence-limited food assessment; no food or safety certification.',
  reuse: {
    experiment: 'ex13',
    source:
      'long-food-evidence.ts/personalEvidence; bounded-unfamiliar-food-assessment@1; bounded-hazelnut-food-assessment@1; continuous-observation.ts; forest-references.ts',
    description:
      'Reuses exact references, complete personal evidence citations, atomic payment and dated private reporting. Adds standing-source access instead of inventing an owned specimen or copying source permission; this is an applicability adapter, not independent food identification.',
  },
  abilities: [
    {
      id: ID,
      name: 'Standing plum source food evidence assessment',
      function:
        'Physically assess Lin nearby forest-plum-2 availability and source-applicable evidence; consumption and preparation remain unestablished without supporting evidence.',
      equivalence: 'food:plum:standing-source-evidence-limit:1',
      parameters: {
        ...v7ObjectSchema({
          sourceId: { type: 'string' },
          evidenceRefs: { type: 'array', items: { type: 'string' } },
        }),
        required: ['sourceId'],
      },
      references: { sourceId: 'object' },
      prerequisites: [],
      learning: 1,
      learningEnergy: 0.2,
      costs:
        'Study1 active round/0.2 energy. AssessSource(sourceId=forest-plum-2,evidenceRefs=[]):1 atomic active round/0.2 energy. Living Lin must actually see and reach the foundation-forest@1 standing source under normal interaction rules. Approach is separate. Up to8 distinct complete exact own evidence keys; missing, partial and unrelated records are labeled, never silently reconstructed. Invalid access/references/energy fails before charge. No owned specimen, tools, gathering, destructive sample or reservation.',
      effects:
        'Reobserve public position/availability/stage/rendering at execution, not guaranteed tick234 stock. Private append-only dated report distinguishes those facts from unsupported identification, edible portions, hazards, preparation and nutrition. Exact cited records retain original scope; other food knowledge and labels cannot certify this source. Consumption support not established is neither poisonous nor safe. Specific missing identity/source-applicability and preparation evidence remains explicit; later source examination or collection and reviewed missing mechanisms are separate actions. No ingestion, manipulation, heat, material/stock/ownership/location/condition change, product, marker, passive work or automatic refresh; ordinary ageing/ecology continue. Before atomic commit interruption/cancel/death adds no charge or report; after commit spent effort is not refunded and record persists. Repeats pay for new dated execution. No curiosity, pleasure, maintained satisfaction, comfort or nutrition reward for this metadata/evidence-limit precursor.',
      handler: 'long.plum-assessment',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'plum-assessment-practice',
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'Atomic not-started or committed; no escrow, locks or partial work.',
      },
    },
  ],
  handlers: { 'long.plum-assessment': assess },
  resources: [],
  processes: {},
  satisfaction: [],
  visualComponents: [],
  events: ['plum-assessment-completed', 'plum-assessment-practice'],
};
