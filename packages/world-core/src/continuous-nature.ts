import type { V7Package } from './continuous-types.js';
import { v7Id, v7Json, v7Record, v7String } from './continuous-data.js';
import { v7ObjectSchema, v7Spend } from './continuous-base.js';
import { v7Observe } from './continuous-observation.js';
import { v7Reach } from './continuous-geometry.js';

const activeKey = 'nature-observation@1';
/** Ex7's first reviewed request: actual attention and experience, without a scoring grant. */
export const V7_NATURE: V7Package = {
  id: 'nature-observation',
  version: 1,
  description:
    'Two consecutive rounds attending to a personally visible natural object.',
  dependencies: ['foundation-v7@1'],
  resources: [],
  satisfaction: [],
  visualComponents: [],
  abilities: [
    {
      id: 'observe_nature',
      name: 'Observe nearby nature',
      function:
        'Complete an attentive observation of a reachable, personally visible natural plant or geological feature.',
      equivalence:
        'nature:visible-reachable:attention-two-rounds:experience-no-reward',
      parameters: v7ObjectSchema({
        target: { type: 'string', maxLength: 1000 },
      }),
      prerequisites: [],
      learning: 1,
      costs:
        'Two consecutive stationary rounds, one energy per round, normal metabolism. Initiation requires energy >= 2 and satiety >= 4; each round requires positive satiety and one energy.',
      effects:
        'Record one completed observation and its currently observable target state. No stock consumption, rest recovery, extra information or mental satisfaction. Incompatible actions interrupt without refund.',
      handler: 'nature.observe@1',
      revision: 'nature-observation@1',
      authored: false,
    },
  ],
  handlers: {
    'nature.observe@1': ({ world, actor, action, emit }) => {
      const target = v7String(action.args.target, 'natural target');
      const object = v7Observe(world, actor.id).objects.find(
        (o) => o.id === target,
      );
      if (
        !object ||
        object.createdBy !== null ||
        !['tree', 'rock', 'berry-shrub', 'root-patch'].includes(object.kind) ||
        !v7Reach(actor, object.spatial)
      )
        throw new Error(
          'A natural plant or geological feature must be personally visible and within interaction range.',
        );
      const stored = actor.extensionState[activeKey];
      const prior =
        stored && typeof stored === 'object' && !Array.isArray(stored)
          ? v7Record(stored)
          : null;
      const continuing =
        prior?.target === target &&
        prior.lastTick === world.tick - 1 &&
        prior.x === actor.position.x &&
        prior.y === actor.position.y;
      if (
        actor.vitals.satiety <= 0 ||
        (!continuing && (actor.vitals.energy < 2 || actor.vitals.satiety < 4))
      )
        throw new Error(
          'Observation requires adequate energy and satiety; prior spent attention is not refunded.',
        );
      v7Spend(actor, 1);
      if (continuing) {
        delete actor.extensionState['nature-observation@1'];
        emit(
          'nature_observed',
          `Completed a two-round observation of ${object.name}; recorded its currently visible state.`,
          {
            startTick:
              typeof prior.startTick === 'number'
                ? prior.startTick
                : world.tick - 1,
            endTick: world.tick,
            elapsed: 2,
            observable: v7Json({
              id: object.id,
              name: object.name,
              kind: object.kind,
              spatial: { ...object.spatial },
              data: object.data,
              state: object.visual.state,
            }),
          },
          target,
        );
        return { complete: true, writes: [] };
      }
      actor.extensionState[activeKey] = {
        target,
        startTick: world.tick,
        lastTick: world.tick,
        elapsed: 1,
        x: actor.position.x,
        y: actor.position.y,
      };
      if (
        !world.processes.some(
          (p) => p.handler === 'nature.interruption@1' && p.owner === actor.id,
        )
      )
        world.processes.push({
          id: v7Id(world, 'attention'),
          handler: 'nature.interruption@1',
          owner: actor.id,
          object: null,
          next: world.tick + 1,
          data: {},
          revision: 'nature-observation@1',
        });
      emit(
        'nature_attending',
        `Attending to ${object.name}; one of two rounds completed.`,
        { elapsed: 1 },
        target,
      );
      return { complete: false, writes: [] };
    },
  },
  processes: {
    'nature.interruption@1': (world, process) => {
      const actor = world.actors.find((a) => a.id === process.owner);
      const stored = actor?.extensionState[activeKey];
      const active =
        stored && typeof stored === 'object' && !Array.isArray(stored)
          ? v7Record(stored)
          : null;
      if (actor && active && active.lastTick !== world.tick) {
        delete actor.extensionState['nature-observation@1'];
        world.events.push({
          id: v7Id(world, 'event'),
          tick: world.tick,
          actor: actor.id,
          type: 'nature_interrupted',
          interface: 'observe_nature',
          success: false,
          description:
            'Attention was interrupted; elapsed time and energy remain spent.',
          position: { ...actor.position },
          target: typeof active.target === 'string' ? active.target : null,
          data: {
            elapsed: typeof active.elapsed === 'number' ? active.elapsed : 1,
            startTick:
              typeof active.startTick === 'number'
                ? active.startTick
                : world.tick - 1,
          },
        });
      }
      if (!actor?.extensionState[activeKey])
        world.processes = world.processes.filter((p) => p.id !== process.id);
      else process.next = world.tick + 1;
    },
  },
};
