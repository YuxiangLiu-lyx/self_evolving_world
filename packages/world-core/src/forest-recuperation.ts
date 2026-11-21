import type {
  V7Actor,
  V7Data,
  V7Package,
  V7RoundResult,
  V7World,
} from './continuous-types.js';
import {
  v7Clone,
  v7Id,
  v7RoundNumber,
  v7Signature,
} from './continuous-data.js';
import { forestEvent } from './forest-environment.js';
import { forestClearOperation } from './forest-operations.js';

interface Job extends V7Data {
  id: string;
  actor: string;
  life: string;
  rounds: number;
  remaining: number;
  paidRounds: number;
  healed: number;
  consecutive: number;
  qualified: boolean;
  x: number;
  y: number;
  lastTick: number;
  before: V7Data;
  recovered: number;
}
function job(a: V7Actor): Job | null {
  const value = a.extensionState['recuperation:pending'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const j = value as Job;
  if (
    !Number.isSafeInteger(j.rounds) ||
    j.rounds < 1 ||
    j.rounds > 12 ||
    !Number.isSafeInteger(j.paidRounds) ||
    j.paidRounds < 0 ||
    j.paidRounds > j.rounds ||
    j.remaining !== j.rounds - j.paidRounds ||
    !Number.isFinite(j.healed) ||
    j.healed < 0
  )
    throw new Error('Invalid recuperation operation counters.');
  return j;
}
function event(
  w: V7World,
  a: V7Actor,
  j: Job,
  type: string,
  data: V7Data = {},
) {
  forestEvent(
    w,
    type,
    `Recuperation: ${type.replace('recuperation-', '')}; ${String(j.paidRounds)} paid rounds, ${String(j.remaining)} remaining; ${j.healed.toFixed(3)} health restored.${typeof data.reason === 'string' ? ` ${data.reason}` : ''}`,
    a.position,
    a.id,
    {
      operation: j.id,
      actor: j.actor,
      requestedRounds: j.rounds,
      remaining: j.remaining,
      paidRounds: j.paidRounds,
      cumulativeHealing: j.healed,
      ...data,
    },
  );
  const e = w.events.at(-1);
  if (e) e.interface = 'recuperate';
}
function cancel(w: V7World, a: V7Actor, reason: string) {
  const j = job(a);
  if (!j) return;
  const last = a.extensionState['recuperation:lastRound'];
  if (
    !last ||
    typeof last !== 'object' ||
    Array.isArray(last) ||
    last.tick !== w.tick
  )
    a.extensionState['recuperation:lastRound'] = {
      tick: w.tick,
      before: j.before,
      after: { ...a.vitals },
      energyCost: j.lastTick === w.tick ? 0.5 : 0,
      satietyCost: j.lastTick === w.tick ? 0.2 : 0,
      recoveredEnergy: j.lastTick === w.tick ? j.recovered : 0,
      healing: 0,
      remaining: j.remaining,
      cumulativeHealing: j.healed,
      cancellationReason: reason,
    };
  event(w, a, j, 'recuperation-cancelled', {
    reason,
    refunded: false,
    healing: 0,
  });
  a.extensionState['recuperation:lastStatus'] = {
    ...v7Clone(j),
    status: 'cancelled',
    reason,
    tick: w.tick,
  };
  delete a.extensionState['recuperation:pending'];
  forestClearOperation(a);
}
function eligibility(a: V7Actor): string | null {
  if (a.vitals.health <= 0) return 'A living performer is required.';
  if (a.vitals.health >= 100) return 'Health is already full.';
  if (a.vitals.satiety < 40) return 'Recuperation requires satiety at least40.';
  if (a.vitals.energy < 4) return 'Recuperation requires energy at least4.';
  if (a.vitals.temperature < 16 || a.vitals.temperature > 22)
    return 'Recuperation requires actual body temperature16..22.';
  return null;
}
export const FOREST_RECUPERATION: V7Package = {
  id: 'recuperate',
  version: 1,
  dependencies: ['willow-operation-continuity@1'],
  description:
    'Paid stationary recuperation heals only after actual safe exposure and without same-round injury.',
  resources: [],
  processes: {},
  visualComponents: [],
  events: [
    'recuperation-started',
    'recuperation-progress',
    'recuperation-completed',
    'recuperation-cancelled',
    'recuperation-relief-qualified',
  ],
  abilities: [
    {
      id: 'recuperate',
      name: 'Recuperate from injury',
      function:
        'Spend stationary recovery time under suitable actual conditions to gradually restore lost health.',
      equivalence: 'health:stationary-safe-fed-recovery:0.25-per-paid-round',
      parameters: {
        type: 'object',
        properties: { rounds: { type: 'integer', minimum: 1, maximum: 12 } },
        required: ['rounds'],
        additionalProperties: false,
      },
      references: {},
      execution: {
        duration: null,
        interruption: 'cancel',
        progress:
          'One execution requests1..12 paid rounds, ending early at full health. Repeat counts complete executions. Identical continuation and global pauses preserve exact work. Changed action, movement, lost conditions or death cancel; paid costs and already healed health remain, without deferred healing or refunds.',
      },
      prerequisites: [],
      learning: 3,
      handler: 'recuperate.work@1',
      revision: 'recuperate@1',
      authored: false,
      costs:
        'Every round needs life, health below100, satiety>=40, energy>=4 and actual body temperature16..22. Pay0.5energy and0.2satiety in addition to normal metabolism; recover up to2energy capped40 instead of ordinary rest. No materials, furniture or medicine supplied.',
      effects:
        'After normal exposure and damage, heal up to0.25 only if eligibility still holds and no injury occurred. Never offsets same-round damage or revives anyone. Four consecutive eligible paid rounds and at least1 actual restored health qualify once per operation for transient recovery relief0.5, cap0.5, duration6, cooldown12; no separate maintained source or learning/request reward.',
    },
  ],
  handlers: {
    'recuperate.work@1': ({ world: w, actor: a, action }) => {
      const reason = eligibility(a);
      if (reason) throw new Error(reason);
      const rounds = Number(action.args.rounds);
      let j = job(a);
      if (
        j &&
        (j.rounds !== rounds ||
          j.x !== a.position.x ||
          j.y !== a.position.y ||
          j.lastTick !== w.tick - 1 ||
          j.actor !== a.id ||
          j.life !== v7Signature(a.life ?? null))
      ) {
        cancel(w, a, 'Requested work, position, life or continuity changed.');
        j = null;
      }
      if (!j) {
        j = {
          id: v7Id(w, 'recuperation'),
          actor: a.id,
          life: v7Signature(a.life ?? null),
          rounds,
          remaining: rounds,
          paidRounds: 0,
          healed: 0,
          consecutive: 0,
          qualified: false,
          x: a.position.x,
          y: a.position.y,
          lastTick: w.tick,
          before: {},
          recovered: 0,
        };
        a.extensionState['recuperation:pending'] = j;
        event(w, a, j, 'recuperation-started');
      }
      j.before = { ...a.vitals };
      a.vitals.energy = v7RoundNumber(a.vitals.energy - 0.5);
      a.vitals.satiety = v7RoundNumber(a.vitals.satiety - 0.2);
      j.recovered = Math.min(2, 40 - a.vitals.energy);
      a.vitals.energy = v7RoundNumber(a.vitals.energy + j.recovered);
      j.paidRounds++;
      j.remaining--;
      j.lastTick = w.tick;
      // Completion and eligibility are authoritative only after this round's physical damage.
      return { complete: false, remaining: j.remaining, writes: [] };
    },
  },
  satisfaction: [
    {
      id: 'injury-recovery-relief',
      name: 'Personally experienced injury recovery',
      equivalence: 'experience:actual-health-recuperation-relief',
      event: 'recuperation-relief-qualified',
      interface: 'recuperate',
      conditions: [{ path: 'qualified', comparison: 'eq', value: true }],
      amount: 0.5,
      cap: 0.5,
      duration: 6,
      mode: 'hold',
      repetition: 'refresh',
      cooldown: 12,
      rationale:
        'At least four consecutive paid eligible rounds and one actual restored health in the same operation; once per operation, no maintained tissue-repair account or duplicate warmth/meal reward.',
      revision: 'recuperate@1',
    },
  ],
  beforeAction: (w, a, action, continuing) => {
    if (job(a) && (action.interface !== 'recuperate' || !continuing))
      cancel(w, a, 'Action or exact operation changed.');
  },
  onDeath: (w, a) => {
    cancel(w, a, 'Performer died.');
  },
  migrate: (w) => {
    if (!w.config.experience)
      throw new Error('Recuperation requires the reviewed experience policy.');
    w.state.recuperation = 1;
    for (const a of w.actors) a.extensionState['harness:recuperate'] = true;
    return w;
  },
  harness: {
    recuperate: (o) => ({
      pending: o.self.extensionState['recuperation:pending'] ?? null,
      lastRound: o.self.extensionState['recuperation:lastRound'] ?? null,
      lastStatus: o.self.extensionState['recuperation:lastStatus'] ?? null,
      currentEligibility:
        eligibility(o.self) ??
        'Eligible before the next actual round; exposure can still invalidate recovery.',
    }),
  },
};

/** Settles once after exposure/death. A terminal result also ends the real task operation. */
export function recuperationAfterRound(
  w: V7World,
  outcomes: V7RoundResult['outcomes'],
): void {
  if (w.state.recuperation !== 1) return;
  for (const a of w.actors) {
    const j = job(a);
    if (!j) continue;
    const injury = Math.max(0, Number(j.before.health) - a.vitals.health);
    const reason =
      j.lastTick !== w.tick || j.x !== a.position.x || j.y !== a.position.y
        ? 'Actual attention or stationary position was interrupted.'
        : injury > 0 ||
            w.events.some(
              (e) => e.actor === a.id && ['injured', 'died'].includes(e.type),
            )
          ? 'Same-round injury forbids recuperation healing.'
          : eligibility(a);
    const healing = reason ? 0 : Math.min(0.25, 100 - a.vitals.health);
    const beforeHealing = { ...a.vitals };
    a.vitals.health = v7RoundNumber(a.vitals.health + healing);
    j.healed = v7RoundNumber(j.healed + healing);
    if (!reason) j.consecutive++;
    const measurement = {
      tick: w.tick,
      before: j.before,
      afterExposure: beforeHealing,
      after: { ...a.vitals },
      energyCost: j.lastTick === w.tick ? 0.5 : 0,
      satietyCost: j.lastTick === w.tick ? 0.2 : 0,
      recoveredEnergy: j.lastTick === w.tick ? j.recovered : 0,
      injury,
      healing,
      remaining: j.remaining,
      cumulativeHealing: j.healed,
    };
    a.extensionState['recuperation:lastRound'] = measurement;
    if (j.lastTick === w.tick)
      event(w, a, j, 'recuperation-progress', measurement);
    if (reason) {
      cancel(w, a, reason);
      const outcome = outcomes[a.id];
      if (outcome) {
        outcome.success = false;
        outcome.complete = true;
        outcome.reason = reason;
      }
      continue;
    }
    if (!j.qualified && j.consecutive >= 4 && j.healed >= 1) {
      j.qualified = true;
      event(w, a, j, 'recuperation-relief-qualified', {
        qualified: true,
        consecutive: j.consecutive,
      });
    }
    if (j.remaining === 0 || a.vitals.health === 100) {
      event(w, a, j, 'recuperation-completed', {
        reason:
          a.vitals.health === 100
            ? 'Full health reached.'
            : 'Requested paid rounds completed.',
      });
      a.extensionState['recuperation:lastStatus'] = {
        ...v7Clone(j),
        status: 'completed',
        tick: w.tick,
      };
      delete a.extensionState['recuperation:pending'];
      forestClearOperation(a);
      const outcome = outcomes[a.id];
      if (outcome) outcome.complete = true;
    }
  }
}
