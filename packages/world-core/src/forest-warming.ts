import type {
  V7Actor,
  V7Data,
  V7Package,
  V7World,
} from './continuous-types.js';
import { v7RoundNumber, v7Number } from './continuous-data.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { forestEvent } from './forest-environment.js';

interface WarmingJob extends V7Data {
  rounds: number;
  remainingRounds: number;
  x: number;
  y: number;
  lastTick: number;
  resolvedTick: number;
  consecutiveReliefRounds: number;
  temperatureBefore: number;
  healthBefore: number;
}
function job(actor: V7Actor): WarmingJob | null {
  const raw = actor.extensionState['warming:pending'];
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as WarmingJob)
    : null;
}
function event(
  world: V7World,
  actor: V7Actor,
  type: string,
  description: string,
  data: V7Data = {},
) {
  forestEvent(world, type, description, actor.position, actor.id, data);
  const last = world.events.at(-1);
  if (last) last.interface = 'active-warming';
}
function cancel(world: V7World, actor: V7Actor, reason: string) {
  if (!job(actor)) return;
  delete actor.extensionState['warming:pending'];
  actor.extensionState['warming:lastStatus'] = {
    tick: world.tick,
    status: 'cancelled',
    reason,
  };
  event(
    world,
    actor,
    'warming-cancelled',
    `Exercise cancelled: ${reason}. Completed effort is not refunded.`,
  );
}
export const FOREST_WARMING: V7Package = {
  id: 'active-warming',
  version: 1,
  dependencies: ['shelter-construction@1'],
  description:
    'Paid stationary exertion with measured thermal changes and shared relief history.',
  resources: [],
  processes: {},
  visualComponents: [],
  satisfaction: [],
  events: [
    'warming-started',
    'warming-round-completed',
    'warming-completed',
    'warming-cancelled',
    'warming-comfort-qualified',
  ],
  abilities: [
    {
      id: 'active-warming',
      name: 'Active warming',
      function:
        'Perform stationary physical exercise for modest measured bodily warmth.',
      equivalence: 'warming:stationary-exertion:3energy:035heat',
      parameters: v7ObjectSchema({
        rounds: { type: 'integer', minimum: 1, maximum: 6 },
      }),
      prerequisites: [],
      learning: 2,
      costs:
        '1–6 consecutive stationary rounds, 3 energy each, ordinary metabolism and environmental exposure. Each round requires energy >=3, satiety >=20 and temperature below 16. Reuse the same rounds argument throughout one operation.',
      effects:
        'After normal environmental processing, add at most 0.35 temperature units up to 16. Net temperature may still fall. No healing, rest recovery, insulation or immunity. Three consecutive measured relief rounds without starvation or health loss may qualify for the existing thermal-refuge source with its shared cap and cooldown.',
      handler: 'warming.exert@1',
      revision: 'active-warming@1',
      authored: false,
    },
  ],
  handlers: {
    'warming.exert@1': ({ world, actor, action }) => {
      const rounds = v7Number(action.args.rounds, 'rounds');
      if (
        actor.vitals.health <= 0 ||
        actor.vitals.satiety < 20 ||
        actor.vitals.temperature >= 16
      )
        throw new Error(
          'Exercise requires a living, sufficiently nourished actor below the actual 16-degree comfort boundary.',
        );
      v7Spend(actor, 3);
      let current = job(actor);
      if (
        current &&
        (current.rounds !== rounds ||
          current.x !== actor.position.x ||
          current.y !== actor.position.y ||
          current.lastTick !== world.tick - 1)
      ) {
        cancel(
          world,
          actor,
          'position, duration or consecutive execution changed',
        );
        current = null;
      }
      if (!current) {
        current = {
          rounds,
          remainingRounds: rounds,
          x: actor.position.x,
          y: actor.position.y,
          lastTick: world.tick,
          resolvedTick: -1,
          consecutiveReliefRounds: 0,
          temperatureBefore: actor.vitals.temperature,
          healthBefore: actor.vitals.health,
        };
        actor.extensionState['warming:pending'] = current;
        event(
          world,
          actor,
          'warming-started',
          `Started stationary exercise for up to ${String(rounds)} paid rounds.`,
          { rounds },
        );
      }
      current.lastTick = world.tick;
      current.temperatureBefore = actor.vitals.temperature;
      current.healthBefore = actor.vitals.health;
      return {
        complete: current.remainingRounds === 1,
        writes: [],
        ...(world.config.experience
          ? { remaining: Math.max(0, current.remainingRounds - 1) }
          : {}),
      };
    },
  },
  migrate: (world) => {
    world.state.activeWarming = 1;
    const refuge = world.satisfaction.find(
      (source) => source.id === 'thermal-refuge',
    );
    if (!refuge)
      throw new Error('The existing shared thermal-refuge source is required.');
    refuge.alternativeTriggers = [
      ...(refuge.alternativeTriggers ?? []),
      { event: 'warming-comfort-qualified', interface: 'active-warming' },
    ];
    for (const actor of world.actors)
      actor.extensionState['harness:active-warming'] = true;
    return world;
  },
  harness: {
    'active-warming': (observation) => ({
      pending: observation.self.extensionState['warming:pending'] ?? null,
      lastRound: observation.self.extensionState['warming:lastRound'] ?? null,
      lastStatus: observation.self.extensionState['warming:lastStatus'] ?? null,
      note: 'Signed temperature changes are measured at the actual location; exertion does not guarantee a net temperature gain.',
    }),
  },
  onDeath: (world, actor) => {
    cancel(world, actor, 'performer died');
  },
};
/** Called after ordinary physiology exactly once, before death and wellbeing settlement. */
export function warmingAfterPhysiology(world: V7World): void {
  if (world.state.activeWarming !== 1) return;
  for (const actor of world.actors) {
    const current = job(actor);
    if (!current) continue;
    if (
      current.lastTick !== world.tick ||
      current.x !== actor.position.x ||
      current.y !== actor.position.y
    ) {
      cancel(
        world,
        actor,
        'actual action, prerequisites or position interrupted exercise',
      );
      continue;
    }
    if (current.resolvedTick === world.tick) continue;
    current.resolvedTick = world.tick;
    if (actor.vitals.health <= 0) continue; // The existing death hook cancels; exertion never rescues death.
    const noExertion = actor.vitals.temperature,
      heat = Math.max(0, Math.min(0.35, 16 - noExertion)),
      discomfort = (temperature: number) =>
        Math.min(1, Math.max(0, 16 - temperature) / 12);
    actor.vitals.temperature = v7RoundNumber(noExertion + heat);
    current.remainingRounds--;
    const measurement = {
      tick: world.tick,
      energySpent: 3,
      temperatureBefore: current.temperatureBefore,
      environmentalChange: v7RoundNumber(
        noExertion - current.temperatureBefore,
      ),
      exertionHeat: v7RoundNumber(heat),
      finalTemperature: actor.vitals.temperature,
      netChange: v7RoundNumber(
        actor.vitals.temperature - current.temperatureBefore,
      ),
      coldDiscomfort: discomfort(actor.vitals.temperature),
      noExertionColdDiscomfort: discomfort(noExertion),
      remainingRounds: current.remainingRounds,
    };
    actor.extensionState['warming:lastRound'] = measurement;
    event(
      world,
      actor,
      'warming-round-completed',
      `Exercise spent 3 energy; environment ${measurement.environmentalChange >= 0 ? '+' : ''}${measurement.environmentalChange.toFixed(3)}, exertion +${heat.toFixed(3)}, net ${measurement.netChange >= 0 ? '+' : ''}${measurement.netChange.toFixed(3)} temperature.`,
      measurement,
    );
    const qualifies =
      measurement.coldDiscomfort < measurement.noExertionColdDiscomfort &&
      actor.vitals.satiety >= 20 &&
      actor.vitals.health >= current.healthBefore &&
      !world.events.some(
        (e) => e.actor === actor.id && ['injured', 'died'].includes(e.type),
      );
    current.consecutiveReliefRounds = qualifies
      ? current.consecutiveReliefRounds + 1
      : 0;
    if (current.consecutiveReliefRounds >= 3) {
      event(
        world,
        actor,
        'warming-comfort-qualified',
        'Three completed exertion rounds measurably reduced cold discomfort without starvation or health loss.',
        { qualified: true, rounds: 3, measurement },
      );
      current.consecutiveReliefRounds = 0;
    }
    if (!current.remainingRounds) {
      delete actor.extensionState['warming:pending'];
      actor.extensionState['warming:lastStatus'] = {
        tick: world.tick,
        status: 'completed',
      };
      event(
        world,
        actor,
        'warming-completed',
        'Completed stationary exercise; no continuing heat or automatic reward.',
      );
    }
  }
}
