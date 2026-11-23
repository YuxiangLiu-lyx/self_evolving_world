import type {
  V7ActionContext,
  V7Data,
  V7Stack,
  V7World,
  V7Json,
} from './continuous-types.js';
import { v7FoodEffect } from './continuous-base.js';
import {
  v7Json,
  v7Record,
  v7Signature,
  v7String,
  v7RoundNumber,
} from './continuous-data.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { forestRestFactor } from './forest-experience.js';
import { FOREST_RESOURCES } from './forest-foundation.js';

export const APPLE_TRIAL_ID = 'moss-source-bound-apple-food-trial';
export const APPLE_TRIAL_ITEM = 'item-261-moss-1554';
export const APPLE_REPORT_PREFIX = 'moss-apple-assessment';
export const quoteKey = (assessmentId: string) =>
  'apple-trial-quote:' + assessmentId;
const data = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? v7Record(v) : {};
const limit =
  'One immediate personal response, not general food safety or absence of delayed hazards. No delayed response model exists in this foundation.';
export function appleInputs(c: V7ActionContext): V7Stack {
  const s = c.world.stacks.find((s) => s.id === APPLE_TRIAL_ITEM);
  if (
    c.actor.id !== 'moss' ||
    c.actor.vitals.health <= 0 ||
    !s ||
    s.owner !== c.actor.id ||
    s.reservedFor ||
    s.quantity !== 1 ||
    s.quantityTenths !== 10 ||
    s.origin !== 'forest-apple-2' ||
    s.harvestedAt !== 261 ||
    s.resource !== 'apple' ||
    s.processing ||
    s.componentLots
  )
    throw Error(
      'The living reviewed owner and unchanged whole unreserved collected apple are required.',
    );
  return s;
}
function supported(w: V7World, s: V7Stack) {
  const actual = w.resources.find((r) => r.id === s.resource),
    original = FOREST_RESOURCES.find((r) => r.id === 'apple');
  return (
    actual &&
    original &&
    v7Signature(actual) === v7Signature(original) &&
    (s.decay ?? 0) < Number(actual.properties?.decay)
  );
}
/** Immutable conditional contract. Reading this own state record is QuoteTrial, not an action. */
export function appleQuote(
  c: V7ActionContext,
  assessmentId: string,
  s: V7Stack,
): V7Data {
  return {
    assessmentId,
    quote: supported(c.world, s)
      ? {
          id: 'apple-dose:' + assessmentId,
          actor: c.actor.id,
          specimenId: s.id,
          origin: s.origin,
          harvestedAt: s.harvestedAt ?? null,
          revision: APPLE_TRIAL_ID + '@1',
          physiology: 'foundation-forest@1/v7FoodEffect',
          quantity: 0.1,
          quantityTenths: 1,
          preparation:
            'None modeled; whole raw-source tenths are the supported inventory portion, not an anatomical section.',
          tools: [],
          time: 1,
          effort:
            '1 / current forestRestFactor (bounded 0.85..1.10); sufficient energy required before commit.',
          nutrition:
            'Immediate satiety increases by dose times actual material nutrition, capped at 100. The value is unknown before personal exposure; no hidden chemistry is disclosed by quotation.',
          adverse:
            'Immediate health loss is dose times actual material toxicity, bounded by current health. Actual values are unknown before exposure. No delayed response is modeled.',
          observationWindow:
            'The committed bite records before/after immediate physiology in the same action. Later world changes are not attributed to the bite without an implemented causal response.',
          conditions:
            'Whole unreserved unchanged raw specimen, living Moss health>=80, satiety<=90, enough current effort. Ordinary ageing and carrying remain allowed while material exists below the existing spoil threshold; processing, quantity, ownership, source or model changes invalidate this quote.',
          authorization:
            'begin with exact quoteId and explicitAuthorization=true; one dose only. Study, assessment and reading never authorize ingestion.',
          stopping:
            'Refusal/cancel/lost prerequisites/adverse response stop further doses. One-shot authorization expires on this bite. A committed bite is irreversible, including death; no locks, passive dosing or refunds.',
          conservation:
            'Original 10 tenths = remaining 9 tenths + swallowed 1 tenth; no product or loss.',
          limitations: limit,
        }
      : null,
    missing: supported(c.world, s)
      ? []
      : [
          'Unchanged source-applicable foundation consumption profile or surviving specimen condition. No executable dose can be quoted.',
        ],
    status: 'unexecuted',
    controlRead:
      'Query own state with exact id ' +
      quoteKey(assessmentId) +
      '; no world time, energy, reward or authorization. This retained conditional quote is revalidated at execution, not refreshed automatically.',
  };
}
function normalized(value: V7Json): V7Json {
  if (typeof value === 'number') return v7RoundNumber(value);
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, normalized(v)]),
    );
  return value;
}
/** Compare at the world data precision while retaining original serialized evidence. */
function sameFinding(a: unknown, b: string): boolean {
  if (typeof a !== 'string') return false;
  try {
    return (
      v7Signature(normalized(v7Json(JSON.parse(a) as unknown))) ===
      v7Signature(normalized(v7Json(JSON.parse(b) as unknown)))
    );
  } catch {
    return false;
  }
}
export function appleBegin(c: V7ActionContext) {
  const requested = v7String(c.action.args.quoteId, 'quoteId'),
    entry = Object.entries(c.actor.extensionState).find(
      ([key, v]) =>
        key.startsWith('apple-trial-quote:') &&
        data(data(v).quote).id === requested,
    )?.[1],
    record = data(entry),
    q = data(record.quote);
  if (
    !entry ||
    record.status !== 'unexecuted' ||
    c.action.args.explicitAuthorization !== true ||
    q.revision !== APPLE_TRIAL_ID + '@1'
  )
    throw Error(
      'An unspent own executable quote and separate explicitAuthorization=true are required.',
    );
  const s = appleInputs(c),
    r = c.world.resources.find((r) => r.id === 'apple'),
    effort = 1 / forestRestFactor(c.world, c.actor);
  if (
    !r ||
    !supported(c.world, s) ||
    c.actor.vitals.health < 80 ||
    c.actor.vitals.satiety > 90 ||
    c.actor.vitals.energy < effort
  )
    throw Error(
      'Quoted physical prerequisites changed; no dose or effort charged. Reassess before another quote.',
    );
  const before = { ...c.actor.vitals };
  v7FoodEffect(c.actor, r, 0.1, c.world, s);
  foodSetQuantity(s, foodTenths(s.quantity) - 1);
  record.status = 'consumed';
  const response = {
    satiety: c.actor.vitals.satiety - before.satiety,
    health: c.actor.vitals.health - before.health,
  };
  c.emit(
    'apple-trial-consumed',
    'Separately authorized 0.1 portion swallowed; actual immediate personal response recorded, general safety unresolved.',
    {
      quoteId: requested,
      assessmentId: v7Json(record.assessmentId ?? null),
      specimenId: s.id,
      origin: s.origin,
      sourceRevision: APPLE_TRIAL_ID + '@1',
      position: { ...c.actor.position },
      observedTick: c.world.tick,
      method: 'explicit-single-tenth-ingestion',
      evidenceScope:
        'Detailed before/after response remains in the actor private record.',
      swallowedTenths: 1,
      remainingTenths: 9,
      originalTenths: 10,
      phase: 'committed',
      qualified: false,
    },
    s.id,
  );
  const eventId = c.world.events.at(-1)?.id ?? '';
  record.consumptionEvent = eventId;
  if (response.health < 0)
    c.emit(
      'injured',
      'Actual trial ingestion caused immediate health loss.',
      {
        cause: 'food exposure',
        consumptionEvent: eventId,
        before: before.health,
        after: c.actor.vitals.health,
      },
      s.id,
    );
  const canonicalKey = v7Signature({
      source: s.origin,
      resource: s.resource,
      preparation: 'unprocessed',
      property: 'immediate-personal-response-per-tenth',
      response,
    }),
    seen = c.actor.extensionState['long:confirmed-physical-properties'],
    prior = Array.isArray(seen) ? seen : [],
    known =
      prior.some((key) => sameFinding(key, canonicalKey)) ||
      Object.values(c.actor.memory.knowledge ?? {}).some(
        (k) =>
          k.verified && sameFinding(data(k.value).canonicalKey, canonicalKey),
      ),
    key = 'apple-response:' + requested;
  c.actor.memory.knowledge ??= {};
  c.actor.memory.knowledge[key] = {
    key,
    subject: s.id,
    property: 'immediate personal response to one actual portion',
    value: v7Json({
      response,
      before,
      after: { ...c.actor.vitals },
      paidEnergy: before.energy - c.actor.vitals.energy,
      dose: 0.1,
      source: s.origin,
      canonicalKey,
      consumptionEvent: eventId,
      limitation: limit,
    }),
    method: 'actual one-shot exposure with before/after own vitals',
    condition: limit,
    verified: true,
    evidence: eventId,
    tick: c.world.tick,
  };
  if (!known) {
    c.actor.extensionState['long:confirmed-physical-properties'] = [
      ...prior,
      canonicalKey,
    ];
    if (c.world.satisfaction.some((r) => r.id === 'grounded-understanding'))
      c.emit(
        'information-confirmed',
        'A new measured immediate personal response; no general safety claim.',
        { key, evidence: eventId, qualified: true },
        s.id,
      );
  }
  return { complete: true, writes: [s.id] };
}
