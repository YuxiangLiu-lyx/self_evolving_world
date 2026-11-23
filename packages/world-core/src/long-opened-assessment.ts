import type { V7Package } from './continuous-types.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import {
  v7Id,
  v7Json,
  v7Record,
  v7Signature,
  v7String,
} from './continuous-data.js';
import { forestResolveReference } from './forest-references.js';
import { v7Visible } from './continuous-geometry.js';
import { nutModel, nutRevision, NUT_REV } from './long-nut-contact.js';
import { personalEvidence } from './long-food-evidence.js';
const ID = 'opened-hazelnut-preparation-assessment',
  ITEM = 'item-141-lin-821',
  TOOL = 'item-131-lin-766',
  KEY = 'long:nut:retrieved-assembly';
export const LONG_OPENED_ASSESSMENT: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex13',
  dependencies: [
    'source-bound-hazelnut-opening-trial@1',
    'bounded-hazelnut-food-assessment@1',
    'bounded-unfamiliar-food-assessment@1',
  ],
  description:
    'Private nondestructive access/evidence assessment of the actually retrieved opened assembly; no further opening or separation.',
  reuse: {
    experiment: 'ex13',
    source:
      'source-bound-hazelnut-opening-trial@1; long-nut-contact.ts; long-food-evidence.ts; bounded-hazelnut-food-assessment@1',
    description:
      'Reuses actual contact ledger, unchanged visible-region model and private exact personal evidence helper. Binds pickup141 event-141-lin-822 from original item119 to actual item141, without resetting contacts, stock, condition or permissions. No reinvention or inherited skill.',
  },
  migrate: (w) => {
    const s = w.stacks.find((s) => s.id === ITEM),
      j = v7Record(w.state['collective:work:manual-138-lin-799']),
      m = nutModel(w);
    if (
      !s ||
      s.owner !== 'lin' ||
      s.origin !== 'start-0-nuts' ||
      s.harvestedAt !== 119 ||
      s.quantity !== 1 ||
      m.contacts !== 2 ||
      !m.exposed ||
      j.status !== 'completed' ||
      j.currentRevision !== m.currentRevision ||
      v7Signature(j.condition) !== v7Signature(s.processing)
    )
      throw Error(
        'The actual retrieved retained assembly and exhausted contact ledger must match.',
      );
    w.state[KEY] = {
      sourceRevision: nutRevision(s),
      sourceItem: 'item-119-lin-699',
      currentItem: ITEM,
      pickupEvent: 'event-141-lin-822',
      processId: v7String(j.id, 'source process'),
      model: NUT_REV,
    };
    return w;
  },
  abilities: [
    {
      id: ID,
      name: 'Opened assembly access and preparation assessment',
      function:
        'Assess the actual opened retained specimen for supported access evidence and unresolved separation/preparation prerequisites; no further physical transformation.',
      equivalence: 'food:opened-hazelnut:access-evidence-limit:1',
      parameters: {
        ...v7ObjectSchema({
          specimenId: { type: 'string' },
          evidenceRefs: {
            type: 'array',
            items: { type: 'string', maxLength: 200 },
          },
          optionalToolId: { type: 'string' },
        }),
        required: ['specimenId'],
      },
      references: { specimenId: 'owned' },
      prerequisites: [],
      learning: 1,
      learningEnergy: 0.2,
      costs:
        'Study1 round/0.2 energy. Assess(specimenId=item-141-lin-821,evidenceRefs=[],optionalToolId omitted or empty):one atomic active round/0.5 energy. At most8 exact complete personal evidence keys. Optional actual owned stone item-131-lin-766 is observed only, not used or worn. Exact unchanged own unreserved assembly/access/energy checked before charge. No travel, tools supplied, consumables, support, receiver, heat, water, touching exposed interior, tasting, sniff challenge, pressing, striking, prying, opening or separation.',
      effects:
        'Reuses actual source lineage, exhausted2-contact ledger and represented limited visible region. Gentler whole-assembly viewing preserves identity/quantity/owner/location/processing and ordinary ageing. Private dated report separates observed discontinuity/exposure and supported body-scale geometry (world-distance resolution0.02 uncertainty0.01) from unresolved clearance/retention/graspability/detachability. Model assumptions are not calibrated measurement or food facts. Accounting fractions are never edible yields. Opening does not establish separability, food identification, preparation sufficiency, toxin absence or nutrition. An independently implemented bounded separation method with actual actuator/support/receiver if needed, source allocation, cost, failure and fragment conservation is still missing; this action does not authorize it or reset contacts. Current findings repeat prior evidence and model limitations, so no novelty/practice/comfort reward. Supplied own complete records keep scope/provenance; no other person answer, hidden lookup or consent. Atomic precommit failure/cancellation/death yields no paid report, completion no refund; no escrow, persistent work, maintenance or automatic refresh. No new material, interior region, food certificate or world object.',
      handler: 'long.opened-assessment',
      revision: ID + '@1',
      authored: false,
      practiceEvidence: 'opened-assessment-practice',
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'Atomic paid private assessment; no partially successful separation or remaining work.',
      },
    },
  ],
  handlers: {
    'long.opened-assessment': (c) => {
      const id = forestResolveReference(
          c.world,
          c.actor,
          v7String(c.action.args.specimenId, 'specimenId'),
          'owned',
          1,
        ),
        s = c.world.stacks.find((s) => s.id === id),
        b = v7Record(c.world.state[KEY]),
        m = nutModel(c.world);
      if (
        c.actor.id !== 'lin' ||
        c.actor.vitals.health <= 0 ||
        !s ||
        s.id !== ITEM ||
        s.quantity !== 1 ||
        s.origin !== 'start-0-nuts' ||
        s.harvestedAt !== 119 ||
        s.reservedFor ||
        nutRevision(s) !== b.sourceRevision ||
        m.contacts !== 2 ||
        !m.exposed ||
        !v7Visible(c.world, c.actor.position, c.actor.position)
      )
        throw Error(
          'The living owner and unchanged actual retrieved assembly with exhausted contact ledger are required.',
        );
      let tool = null;
      if (c.action.args.optionalToolId) {
        const toolId = forestResolveReference(
            c.world,
            c.actor,
            v7String(c.action.args.optionalToolId, 'optionalToolId'),
            'owned',
            1,
          ),
          t = c.world.stacks.find((s) => s.id === toolId);
        if (
          !t ||
          toolId !== TOOL ||
          t.quantity !== 1 ||
          t.resource !== 'stone' ||
          t.reservedFor ||
          t.processing?.method !== NUT_REV ||
          t.processing.blunting !== 0.004 ||
          t.processing.diameter !== 0.12
        )
          throw Error(
            'The optional exact unreserved owned unchanged stone is required; no tool supplied.',
          );
        tool = {
          itemId: t.id,
          diameter: 0.12,
          recordedBlunting: 0.004,
          suitability: 'not established by geometry',
          used: false,
        };
      }
      const { refs, evidence } = personalEvidence(c);
      v7Spend(c.actor, 0.5);
      const reportId = v7Id(c.world, 'opened-assessment');
      c.emit(
        'opened-assessment-completed',
        'Assessment recorded; separability and food safety remain unresolved.',
        {
          actorId: c.actor.id,
          specimenId: s.id,
          reportId,
          method: 'whole-assembly-exterior-view',
          observedTick: c.world.tick,
          stage: 'committed',
          status: 'observed-exposure-separation-unresolved',
          visibleRegion: 0.2,
          evidenceCount: refs.length,
          qualified: false,
        },
        s.id,
      );
      const eventId = c.world.events.at(-1)?.id ?? '',
        key = 'opened-assessment:' + reportId;
      c.actor.memory.knowledge ??= {};
      c.actor.memory.knowledge[key] = {
        key,
        subject: ITEM,
        property: 'dated opened-assembly access and evidence limits',
        value: v7Json({
          reportId,
          eventId,
          observedTick: c.world.tick,
          sourceRevision: nutRevision(s),
          revisionMeaning:
            'Control/source accounting signature, not measured edible yield.',
          lineage: b,
          method:
            'Nondamaging viewing and gentle whole-assembly reorientation; no interior contact.',
          observations: {
            covering: 'contact discontinuity',
            limitedExposure: true,
            visibleRegion: 0.2,
            interior: {
              color: m.interiorColor,
              texture: m.interiorTexture,
              scope:
                'Only the already represented exposed region; remaining interior unavailable.',
            },
            bodyScale: {
              length: Math.round(m.exteriorLength / 0.02) * 0.02,
              width: Math.round(m.exteriorWidth / 0.02) * 0.02,
              resolution: 0.02,
              uncertainty: 0.01,
              unit: 'world-distance',
              boundary:
                'Existing source model and approximate body comparison, not calibrated measurements.',
            },
          },
          access: {
            clearance: 'unresolved',
            retention: 'unresolved',
            graspability: 'unresolved',
            detachability: 'not established',
          },
          food: {
            identification: 'unresolved',
            ediblePortions: 'unresolved',
            conditionSafety: 'unresolved',
            preparation: 'unresolved',
            nutrition: 'unresolved',
          },
          missing: [
            'Source-specific accessibility/retention observation or a separately implemented bounded physical trial.',
            'A real suitable actuator/tool, reaction support and reachable material-retaining receiver if the future method requires them.',
            'Exact allocations, work/energy limits, failure response and fragment/residue conservation before later separation.',
            'Personally applicable food evidence; appearance and eat availability do not certify safety.',
          ],
          tool,
          suppliedPersonalEvidence: evidence,
          openingContactsRemaining: 0,
          materialConsumed: 0,
          paidEnergy: 0.5,
          novelInformation: false,
        }),
        method: 'paid nondestructive source-bound view',
        condition: 'No separation or food-safety claim',
        verified: false,
        tick: c.world.tick,
        evidence: eventId,
      };
      return { complete: true, writes: [] };
    },
  },
  resources: [],
  processes: {},
  satisfaction: [],
  visualComponents: [],
  events: ['opened-assessment-completed', 'opened-assessment-practice'],
};
