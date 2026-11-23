import type { V7ActionContext, V7HandlerResult } from './continuous-types.js';
import { v7Spend } from './continuous-base.js';
import { v7Id, v7Json, v7String, v7Signature } from './continuous-data.js';
import { forestResolveReference } from './forest-references.js';
import { v7Visible } from './continuous-geometry.js';
interface FoodBinding {
  actor: string;
  item: string;
  resource: string;
  origin: string;
  harvestedAt: number;
  prefix: string;
  event: string;
  label: string;
  extended?: boolean;
}
/** Shared source adapter. The legacy apple binding preserves its exact serialized evidence. */
export function sourceFoodAssessment(
  binding: FoodBinding,
): (c: V7ActionContext) => V7HandlerResult {
  return (c) => {
    const id = forestResolveReference(
        c.world,
        c.actor,
        v7String(c.action.args.specimenId, 'specimenId'),
        'owned',
        1,
      ),
      s = c.world.stacks.find((s) => s.id === id);
    if (
      c.actor.id !== binding.actor ||
      !s ||
      id !== binding.item ||
      s.resource !== binding.resource ||
      s.quantity !== 1 ||
      s.origin !== binding.origin ||
      s.harvestedAt !== binding.harvestedAt ||
      s.reservedFor ||
      s.processing
    )
      throw new Error(
        `The nominated unchanged whole owned ${binding.resource} is required.`,
      );
    if (
      c.actor.vitals.health <= 0 ||
      !v7Visible(c.world, c.actor.position, c.actor.position)
    )
      throw new Error(
        'A living actor and actual carried-item access are required.',
      );
    const { refs, evidence } = personalEvidence(c);
    v7Spend(c.actor, 0.2);
    const reportId = v7Id(c.world, binding.prefix),
      color =
        c.world.resources.find((r) => r.id === binding.resource)?.color ?? null;
    c.emit(
      binding.event,
      'Paid exterior handling and evidence-limit report completed; safety remains unestablished.',
      {
        actorId: c.actor.id,
        specimenId: id,
        originId: s.origin,
        reportId,
        method: 'exterior-observe',
        observedTick: c.world.tick,
        stage: 'complete',
        outcome: 'inconclusive-food-safety',
        evidenceCount: refs.length,
        qualified: false,
        ...(binding.extended
          ? {
              sourceAbility: c.action.interface,
              sourceRevision: c.action.interface + '@1',
              phase: 'committed',
              status: 'completed-with-limited-evidence',
              observedStateFingerprint: v7Signature({ specimenId: id, color }),
            }
          : {}),
      },
      id,
    );
    const eventId = c.world.events.at(-1)?.id ?? '',
      key = binding.prefix + ':' + reportId;
    c.actor.memory.knowledge ??= {};
    c.actor.memory.knowledge[key] = {
      key,
      subject: id,
      property: 'dated exterior and evidence limits',
      value: v7Json({
        reportId,
        eventId,
        specimenId: id,
        origin: s.origin,
        observedTick: c.world.tick,
        location: c.actor.position,
        performedMethod:
          'Gentle exterior viewing/reorientation; no destructive or ingestion test.',
        directObservation: {
          renderedColor: color,
          source:
            'Existing actual resource rendering, not hidden food chemistry.',
          evidence: eventId,
          limitations: [
            `No ${binding.resource}-specific geometry, surface-condition or internal model is implemented.`,
            'No decay, toxin, composition or nutritional engine field is observed.',
          ],
        },
        suppliedPersonalEvidence: evidence,
        supportedPreparation: {
          status: 'unestablished',
          evidence: [],
          reason: 'No preparation efficacy demonstrated by this examination.',
        },
        remainingUncertainty: [
          'Food safety, nutrition and absence of toxins cannot be established by available examination.',
          `${binding.label} label, source maturity and visual color are not safety evidence.`,
          'Shape, texture, damage, body-scale dimensions and internal state are unavailable.',
        ],
        materialConsumed: 0,
        paidEnergy: 0.2,
        novelInformation: false,
        ...(binding.extended
          ? {
              sourceBinding: {
                actor: binding.actor,
                item: binding.item,
                origin: binding.origin,
                harvestedAt: binding.harvestedAt,
              },
              observedStateFingerprint: v7Signature({ specimenId: id, color }),
              foodQuestions: {
                ediblePortions: { status: 'unresolved', evidence: [] },
                preparation: { status: 'unresolved', evidence: [] },
                safety: { status: 'unresolved', evidence: [] },
              },
              missingPrerequisites: [
                'Source-applicable physical observation support beyond rendering.',
                'Actual personally applicable food evidence; this action supplies no other participant answer or consent.',
              ],
              sourceModelBoundary:
                'The prior start-0-nuts exterior model is not applicable to forest-hazelnut-1. No anatomy or dimensions transferred.',
            }
          : {}),
      }),
      method:
        'actual paid nondestructive exterior view with exact supplied personal evidence',
      condition:
        'Source-bound precursor; completed report is not a safe-food certificate.',
      verified: false,
      tick: c.world.tick,
      evidence: eventId,
    };
    return { complete: true, writes: [] };
  };
}

export function personalEvidence(c: V7ActionContext) {
  const refs = c.action.args.evidenceRefs ?? [];
  if (
    !Array.isArray(refs) ||
    refs.length > 8 ||
    refs.some((r) => typeof r !== 'string') ||
    new Set(refs).size !== refs.length
  )
    throw new Error(
      'Evidence references must be distinct exact personal record keys.',
    );
  const evidence = refs.map((ref) => {
    const key = v7String(ref, 'evidence reference'),
      k = c.actor.memory.knowledge?.[key];
    if (
      !k ||
      !k.evidence ||
      k.tick > c.world.tick ||
      (k.value &&
        typeof k.value === 'object' &&
        !Array.isArray(k.value) &&
        k.value.encoding === 'paged-json')
    )
      return {
        key,
        available: false,
        reason:
          'No complete dated personally retained evidence record; no hidden search performed.',
      };
    return {
      key,
      available: true,
      record: {
        key: k.key,
        subject: k.subject,
        property: k.property,
        method: k.method,
        condition: k.condition,
        verified: k.verified,
        tick: k.tick,
        evidence: k.evidence,
      },
      content:
        'Exact source record remains in retained personal evidence and its event archive; no recursive report copies.',
      interpretation:
        'Retained claim and original verification flag, not an independent safety conclusion.',
    };
  });

  return { refs, evidence };
}
