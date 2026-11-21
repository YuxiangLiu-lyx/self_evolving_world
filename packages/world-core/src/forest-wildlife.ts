import type {
  V7Actor,
  V7Data,
  V7Object,
  V7Package,
  V7World,
} from './continuous-types.js';
import { v7Id, v7String } from './continuous-data.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Observe } from './continuous-observation.js';
import { v7Distance } from './continuous-geometry.js';

const pendingKey = 'wildlife:pending';
const memoryKey = 'wildlife:sightings';
function pending(actor: V7Actor): V7Data | null {
  const value = actor.extensionState[pendingKey];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null;
}
function cancel(world: V7World, actor: V7Actor, reason: string): void {
  const operation = pending(actor);
  if (!operation) return;
  world.events.push({
    id: v7Id(world, 'event'),
    tick: world.tick,
    actor: actor.id,
    type: 'wildlife-observation-cancelled',
    interface: 'observe-wildlife',
    success: false,
    description: `Wildlife observation cancelled: ${reason}. Spent attention remains spent; samples are past sightings.`,
    position: { ...actor.position },
    target: typeof operation.target === 'string' ? operation.target : null,
    data: { ...operation, reason },
  });
  delete actor.extensionState['wildlife:pending'];
}
function sample(world: V7World, object: V7Object): V7Data {
  return {
    tick: world.tick,
    target: object.id,
    species: object.data.species ?? 'unknown',
    position: { x: object.spatial.x, y: object.spatial.y },
    behavior: object.data.mode ?? 'unknown',
  };
}
/** Delivered for Sol's real ex8 round-17 request. Installation grants no observations or rewards. */
export const FOREST_WILDLIFE: V7Package = {
  id: 'forest-wildlife',
  version: 1,
  description:
    'Two-round visible wildlife attention, dated sightings and bounded nature appreciation.',
  dependencies: ['foundation-forest@1'],
  resources: [],
  visualComponents: [],
  events: [
    'wildlife-observation-started',
    'wildlife-observation-sampled',
    'wildlife-observation-completed',
    'wildlife-observation-cancelled',
  ],
  abilities: [
    {
      id: 'observe-wildlife',
      name: 'Observe wildlife',
      function:
        'Quietly observe an actually visible animal for two consecutive stationary rounds.',
      equivalence:
        'nature:visible-animal:two-round-attention:dated-samples:bounded-appreciation',
      parameters: v7ObjectSchema({
        target: { type: 'string', maxLength: 1000 },
      }),
      prerequisites: [],
      learning: 2,
      costs:
        'Two consecutive stationary rounds, 0.5 energy each round and ordinary metabolism. Incompatible actions, insufficient energy, death or lost visibility cancel without refund.',
      effects:
        'Retain only timestamped visible species, positions and behavior. A completed observation may activate registered nature appreciation: 3 for 12 rounds, 8-round cooldown; another rewarded completion within 24 rounds gives 1 with its own 12-round expiry. Overlapping awards use their maximum, never their sum. No animal control, movement, recovery or hidden knowledge.',
      handler: 'wildlife.observe@1',
      revision: 'forest-wildlife@1',
      authored: false,
    },
  ],
  satisfaction: [
    {
      id: 'nature-appreciation',
      name: 'Nature appreciation',
      equivalence: 'experience:nature-appreciation',
      interface: 'observe-wildlife',
      event: 'wildlife-observation-completed',
      conditions: [{ path: 'elapsed', comparison: 'eq', value: 2 }],
      amount: 3,
      cap: 3,
      duration: 12,
      mode: 'hold',
      repetition: 'refresh',
      cooldown: 8,
      repeatWindow: { rounds: 24, amount: 1 },
      participants: 'actor',
      rationale:
        'Actual sustained perception of wildlife provides personal sensory engagement; no proposal, study or partial sample qualifies.',
      revision: 'forest-wildlife@1',
    },
  ],
  migrate: (world) => {
    for (const actor of world.actors) {
      actor.extensionState[memoryKey] = [];
      actor.extensionState['harness:observe-wildlife'] = true;
    }
    return world;
  },
  harness: {
    'observe-wildlife': (observation) => ({
      pending: observation.self.extensionState[pendingKey] ?? null,
      pastSightings: observation.self.extensionState[memoryKey] ?? [],
      meaning:
        'Timestamped samples are past sightings, not live animal tracking.',
    }),
  },
  handlers: {
    'wildlife.observe@1': ({ world, actor, action, emit }) => {
      const target = v7String(action.args.target, 'animal target');
      const object = v7Observe(world, actor.id).objects.find(
        (o) =>
          o.id === target &&
          o.kind === 'animal' &&
          v7Distance(actor.position, o.spatial) <= world.config.vision,
      );
      if (!object || actor.vitals.health <= 0)
        throw new Error(
          'A living observer must currently see the actual animal through ordinary vision.',
        );
      const prior = pending(actor);
      const continuing =
        prior?.target === target &&
        prior.lastTick === world.tick - 1 &&
        prior.x === actor.position.x &&
        prior.y === actor.position.y;
      if (prior && !continuing)
        cancel(world, actor, 'attention or target changed');
      v7Spend(actor, 0.5);
      const sighting = sample(world, object);
      const remembered = actor.extensionState[memoryKey];
      actor.extensionState[memoryKey] = [
        ...(Array.isArray(remembered) ? remembered : []),
        sighting,
      ].slice(-16);
      const samples =
        continuing && Array.isArray(prior.samples)
          ? [...prior.samples, sighting]
          : [sighting];
      if (continuing) {
        delete actor.extensionState['wildlife:pending'];
        emit(
          'wildlife-observation-sampled',
          `Past sighting at round ${String(world.tick)}: ${object.name}, ${typeof object.data.mode === 'string' ? object.data.mode : 'unknown'}.`,
          sighting,
          target,
        );
        emit(
          'wildlife-observation-completed',
          `Completed two visible rounds observing ${object.name}; dated samples retained.`,
          {
            operation: prior.operation ?? '',
            startTick: prior.startTick ?? world.tick - 1,
            endTick: world.tick,
            elapsed: 2,
            samples,
          },
          target,
        );
        return { complete: true, writes: [] };
      }
      actor.extensionState[pendingKey] = {
        operation: v7Id(world, 'observation'),
        target,
        startTick: world.tick,
        lastTick: world.tick,
        elapsed: 1,
        x: actor.position.x,
        y: actor.position.y,
        samples,
      };
      if (
        !world.processes.some(
          (p) =>
            p.handler === 'wildlife.interruption@1' && p.owner === actor.id,
        )
      )
        world.processes.push({
          id: v7Id(world, 'attention'),
          handler: 'wildlife.interruption@1',
          owner: actor.id,
          object: null,
          next: world.tick + 1,
          data: {},
          revision: 'forest-wildlife@1',
        });
      emit(
        'wildlife-observation-started',
        `Watching ${object.name}: 1 / 2 rounds; current visible target only.`,
        { target, elapsed: 1, samples },
        target,
      );
      emit(
        'wildlife-observation-sampled',
        `Past sighting at round ${String(world.tick)}: ${object.name}, ${typeof object.data.mode === 'string' ? object.data.mode : 'unknown'}.`,
        sighting,
        target,
      );
      return { complete: false, writes: [] };
    },
  },
  processes: {
    'wildlife.interruption@1': (world, process) => {
      const actor = world.actors.find((a) => a.id === process.owner);
      if (actor && pending(actor)?.lastTick !== world.tick)
        cancel(world, actor, 'the next attention round did not execute');
      if (!actor || !pending(actor))
        world.processes = world.processes.filter((p) => p.id !== process.id);
      else process.next = world.tick + 1;
    },
  },
  onDeath: (world, actor) => {
    cancel(world, actor, 'observer died');
    for (const event of world.events.filter(
      (e) =>
        e.actor === actor.id && e.type === 'wildlife-observation-completed',
    )) {
      event.success = false;
      event.type = 'wildlife-observation-cancelled';
      event.description =
        'Observation ended in the same round as death; past sightings remain, but completion grants no satisfaction.';
    }
    world.processes = world.processes.filter(
      (p) => !(p.owner === actor.id && p.handler === 'wildlife.interruption@1'),
    );
  },
};
