import { personalEvidence } from './long-food-evidence.js';
import type { V7Package, V7Stack } from './continuous-types.js';
import {
  v7Json,
  v7Record,
  v7Signature,
  v7Id,
  v7String,
} from './continuous-data.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { forestResolveReference } from './forest-references.js';
import { v7Visible } from './continuous-geometry.js';

const revision = (s: V7Stack) =>
  v7Signature({
    id: s.id,
    origin: s.origin,
    harvestedAt: s.harvestedAt,
    resource: s.resource,
    quantity: s.quantity,
    processing: s.processing ?? null,
  });
function sample(key: string) {
  let n = 2166136261;
  for (const c of key) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0;
  return n / 4294967296;
}
interface ExteriorBinding {
  id: string;
  item: string;
  stateKey: string;
  owner: string;
  origin: string;
  harvestedAt: number;
  handler: string;
  energy: number;
  extended?: boolean;
}
export function sourceExteriorExamination(binding: ExteriorBinding): V7Package {
  const { id: ID, item: ITEM, stateKey: KEY } = binding;
  return {
    id: ID,
    version: 1,
    scope: 'long-ex13',
    dependencies: ['foundation-open@1'],
    description:
      'Nondestructive observation of one actually held specimen, with explicit modeled exterior and occluded interior; no food certificate.',
    reuse: {
      experiment: 'ex13; existing open foundation',
      source:
        'foundation-open@1/open.probe; forest-references.ts; grounded-understanding; continuous-wellbeing.ts',
      description:
        'Reuses exact live ownership, carried-item observation, real energy and existing bounded information feedback. Adds specimen exterior representation and observation rather than treating probe null plant fields as condition evidence. No destructive probe is invoked.',
    },
    migrate(w) {
      const s = w.stacks.find((s) => s.id === ITEM);
      if (
        !s ||
        s.resource !== 'hazelnut' ||
        s.origin !== binding.origin ||
        s.harvestedAt !== binding.harvestedAt ||
        s.quantity !== 1 ||
        s.processing
      )
        throw new Error(
          'The reviewed intact accounting specimen is unavailable.',
        );
      w.state[KEY] = {
        introducedAt: w.tick,
        revision: ID + '@1',
        sourceRevision: revision(s),
        assumption:
          'Versioned external appearance model for the surviving specimen, not a prior measurement: a small ovoid with opaque brown covering and fine surface ridges. No internal anatomy, safety, edibility, mass or nutrient transformation is modeled or inferred.',
        color: w.resources.find((r) => r.id === s.resource)?.color ?? '#a5814f',
        length:
          0.04 + 0.02 * sample(`${String(w.config.seed)}:${s.origin}:exterior`),
        width: 0.035,
        shape: 'ovoid',
        texture: 'fine visible ridges',
        covering: 'opaque shell-like exterior, anatomy unconfirmed',
        visibleOpenings: [],
        visibleDiscontinuities: [],
      };
      const rule = w.satisfaction.find(
        (r) => r.id === 'grounded-understanding',
      );
      // Reuse the existing schedule unchanged, or give zero if no applicable rule.
      if (rule?.maintenance) {
        const trigger = { event: 'information-confirmed', interface: ID };
        rule.alternativeTriggers = [
          ...(rule.alternativeTriggers ?? []),
          trigger,
        ];
        rule.maintenance.alternativeTriggers = [
          ...(rule.maintenance.alternativeTriggers ?? []),
          trigger,
        ];
      }
      return w;
    },
    abilities: [
      {
        id: ID,
        name: 'Examine the owned hazelnut exterior',
        function:
          'Nondestructively examine Lin actual item-119-lin-699 for supported exterior observations and explicit interior/access limits; no tasting, opening or safety inference.',
        equivalence: 'specimen:hazelnut:direct-exterior:1',
        parameters: v7ObjectSchema({ specimenId: { type: 'string' } }),
        references: { specimenId: 'owned' },
        prerequisites: [],
        learning: 1,
        learningEnergy: 0.2,
        costs:
          'Personal study1 round/0.2 energy. Examine(specimenId):one atomic round/0.2 energy, exact owned unreserved item-119-lin-699 quantity1 origin start-0-nuts harvested119. Carried inventory is locally accessible; an old stored stack coordinate does not locate a remote arrangement. No tools, travel, materials or sampling. Invalid references/access/energy fail before payment. No ongoing task to resume or cancel after atomic completion; cancel before execution costs no inspection energy, death follows ordinary ownership rules.',
        effects:
          'Paid gentle viewing/reorientation leaves original identity, quantity, position and condition unchanged. A new versioned source exterior model supports represented exterior shape, rendered color, surface features, covering and approximate body-scale dimensions in world-distance units (resolution0.02, uncertainty0.01). Model assumptions are not prior measurements. Interior observation is possible only through an already represented visible opening; otherwise anatomy/condition/composition remain unavailable. Inaccessibility implies only that a separate opening trial would be needed to see inside, not that preparation is necessary before eating. Unmodeled or altered features remain unavailable; no decay metadata is exposed as a visible symptom. Dated full findings stay private. First genuinely new current exterior evidence may trigger only existing grounded-understanding (0.8 short source,cap1,duration8,cooldown12,maintained gain0.035/decay0.0015); missing rule means zero. Canonical specimen/property/state deduplication spans equivalent observations; unchanged repeats, requests, registration and mastery earn nothing. No satiety, health, food, tool, shell/kernel product or safety certificate. Existing ageing continues.',
        handler: binding.handler,
        revision: ID + '@1',
        authored: false,
        practiceEvidence: 'nut-examination-practice',
        execution: {
          duration: 1,
          interruption: 'cancel',
          progress:
            'Atomic paid observation; no persistent escrow, partial transformation, passive labor or maintenance.',
        },
      },
    ],
    handlers: {
      [binding.handler]: (c) => {
        const id = forestResolveReference(
          c.world,
          c.actor,
          v7String(c.action.args.specimenId, 'specimenId'),
          'owned',
          1,
        );
        const s = c.world.stacks.find((s) => s.id === id);
        if (
          c.actor.id !== binding.owner ||
          !s ||
          id !== ITEM ||
          s.origin !== binding.origin ||
          s.harvestedAt !== binding.harvestedAt ||
          s.quantity !== 1 ||
          s.reservedFor
        )
          throw new Error(
            'The nominated whole surviving owned specimen is required.',
          );
        if (
          c.actor.vitals.health <= 0 ||
          !v7Visible(c.world, c.actor.position, c.actor.position) ||
          c.actor.vitals.energy < binding.energy
        )
          throw new Error(
            `A living actor, local visible carried-item access and${String(binding.energy)} energy are required.`,
          );
        const exterior = v7Record(c.world.state[KEY]),
          supported = exterior.sourceRevision === revision(s);
        if (binding.extended && !supported)
          throw new Error(
            'The source changed outside its installed exterior representation; no supported observation or charge.',
          );
        const findings = supported
          ? {
              shape: exterior.shape,
              color: exterior.color,
              texture: exterior.texture,
              covering: exterior.covering,
              visibleOpenings: exterior.visibleOpenings,
              visibleDiscontinuities: exterior.visibleDiscontinuities,
              approximateLength:
                Math.round(Number(exterior.length) / 0.02) * 0.02,
              approximateWidth:
                Math.round(Number(exterior.width) / 0.02) * 0.02,
              unit: 'world-distance',
              reference: 'direct visual comparison to body diameter',
              resolution: 0.02,
              uncertainty: 0.01,
              interpretation:
                'No visible opening through the opaque modeled exterior; the internal state is inaccessible by this nondestructive method. No healthy/intact/safe/edible certificate.',
            }
          : {
              unavailable:
                'Source processing or amount changed; the installed exterior representation cannot resolve current features. No healthy or damaged state inferred.',
            };
        const { refs, evidence: providedEvidence } = binding.extended
          ? personalEvidence(c)
          : { refs: [], evidence: [] };
        const canonicalKey = `${id}:visible-exterior`;
        const key = binding.extended
          ? `forest-exterior:${v7Id(c.world, 'forest-examination')}`
          : canonicalKey;
        const signatures =
          c.actor.extensionState[
            binding.extended
              ? 'long:forest-nut:confirmed-exteriors'
              : 'long:nut:confirmed-exteriors'
          ];
        const confirmed = Array.isArray(signatures) ? signatures : [];
        const signature = v7Signature(findings);
        c.actor.memory.knowledge ??= {};
        const previous = Object.values(c.actor.memory.knowledge).filter(
          (k) => k.subject === id,
        );
        const known =
          confirmed.includes(signature) ||
          previous.some(
            (k) =>
              k.verified &&
              k.property === 'visible exterior' &&
              v7Signature(v7Record(k.value).findings ?? k.value) ===
                v7Signature(findings),
          );
        const processId = v7Id(c.world, 'examination');
        s.reservedFor = processId;
        c.emit(
          'specimen-examination-started',
          'Began actual nondestructive handling of a carried specimen.',
          {
            component: 'specimen-examination',
            processId,
            progress: 0,
            status: 'inspecting',
          },
          s.id,
        );
        v7Spend(c.actor, binding.energy);
        delete s.reservedFor;
        c.emit(
          'specimen-examination-completed',
          'Paid exterior examination completed; internal condition, preparation needs and food safety remain unverified.',
          {
            component: 'specimen-examination',
            processId,
            progress: 1,
            status: supported ? 'exterior-observed' : 'unavailable',
            paidEnergy: binding.energy,
            property: 'visible exterior',
            interiorVisible: false,
            qualified: false,
            ...(binding.extended
              ? {
                  modelRevision: ID + '@1',
                  origin: s.origin,
                  method: 'exterior-observe',
                  evidenceAvailability: supported,
                  uncertainty: 0.01,
                }
              : {}),
          },
          s.id,
        );
        const evidence = c.world.events.at(-1)?.id ?? '';
        c.actor.memory.knowledge[key] = {
          key,
          subject: id,
          property: 'visible exterior',
          value: v7Json({
            processId,
            tick: c.world.tick,
            actor: c.actor.id,
            specimenId: s.id,
            quantity: s.quantity,
            sourceRevision: revision(s),
            location: c.actor.position,
            method: 'nondamaging local viewing and gentle reorientation',
            modelBoundary: exterior.assumption,
            findings,
            unavailable: [
              'interior anatomy and condition: occluded',
              'mass and composition: not measured',
              'edibility, toxicity, preparation requirements: not tested',
              'microscopic or unmodeled damage: unavailable',
            ],
            previousEvidence: (binding.extended
              ? previous.slice(-4)
              : previous
            ).map((k) => ({
              evidence: k.evidence,
              tick: k.tick,
              property: k.property,
            })),
            materialConsumed: 0,
            ...(binding.extended
              ? {
                  modelRevision: ID + '@1',
                  canonicalKey,
                  observedStateFingerprint: signature,
                  suppliedPersonalEvidence: providedEvidence,
                  evidenceKeys: refs,
                  propertyStatus: {
                    exterior: supported ? 'observed' : 'unavailable',
                    interior: 'unavailable',
                  },
                  destructiveAccess: {
                    status: 'not assessed or authorized',
                    prerequisites:
                      'Separate explicit decision and source-appropriate contact/conservation model with actual independently obtained tool/support if required.',
                  },
                }
              : {}),
          }),
          method: 'paid source-bound direct exterior observation',
          condition: 'current represented exterior only; not food safety',
          verified: supported,
          tick: c.world.tick,
          evidence,
        };
        if (supported && !confirmed.includes(signature))
          c.actor.extensionState[
            binding.extended
              ? 'long:forest-nut:confirmed-exteriors'
              : 'long:nut:confirmed-exteriors'
          ] = [...confirmed, signature];
        if (supported && !known) {
          c.emit(
            'information-confirmed',
            'Actual local examination established previously unrecorded exterior information; detailed findings remain personal.',
            {
              key,
              evidence,
              qualified: true,
              ...(binding.extended ? { canonicalKey } : {}),
            },
            s.id,
          );
        }
        return { complete: true, writes: [] };
      },
    },
    resources: [],
    processes: {},
    satisfaction: [],
    visualComponents: [],
    events: [
      'specimen-examination-started',
      'specimen-examination-completed',
      'information-confirmed',
      'nut-examination-practice',
    ],
  };
}
