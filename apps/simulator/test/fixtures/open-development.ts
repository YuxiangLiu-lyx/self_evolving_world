import {
  continuousRegistry,
  v7Registry,
  v7Clone,
  v7String,
  v7Spend,
  openStartProcess,
  v7ObjectSchema,
} from '@self-evolving-world/world-core';
import type {
  V7Ability,
  V7Package,
  V7World,
} from '@self-evolving-world/world-core';
import { initialOpenWorld } from '../../src/open-scenario.js';

/** Synthetic contracts test composition only. Never imported by production contexts or genesis. */
export function openFixture(scope = 'isolated-a') {
  const world = v7Clone(initialOpenWorld(scope));
  world.actors = world.actors.slice(0, 1);
  world.objects = [];
  world.stacks = [];
  world.terrain = world.terrain.map((row) => '.'.repeat(row.length));
  const actor = world.actors[0];
  if (!actor) throw new Error('Missing fixture actor.');
  actor.position = { x: 8, y: 8 };
  world.objects.push({
    id: 'fixture-station',
    kind: 'fixture-station',
    name: 'Fixture station',
    spatial: {
      x: 8.8,
      y: 8,
      angle: 0,
      shape: { kind: 'circle', radius: 0.2 },
      solid: false,
      interaction: 0.7,
      entrances: [],
    },
    visual: {
      component: 'rock',
      color: '#888888',
      accent: '#ffffff',
      label: 'Fixture',
      state: 'ready',
    },
    data: { service: 10, availableHeat: 10 },
    createdBy: actor.id,
    createdAt: 0,
    revision: 'foundation-open@1',
  });
  world.stacks.push({
    id: 'fixture-input',
    owner: actor.id,
    resource: 'branch',
    quantity: 2,
    position: { ...actor.position },
    origin: 'fixture-only',
  });
  const ability = (
    id: string,
    resource: string,
    dependency: string[],
  ): V7Ability => ({
    id,
    name: id,
    function: `Synthetic ${id} conversion`,
    equivalence: `fixture:${id}`,
    parameters: v7ObjectSchema({ target: { type: 'string' } }),
    prerequisites: dependency,
    dependencies: {
      abilities: dependency,
      resources: [resource],
      knowledge: [],
    },
    learning: 2,
    costs:
      'One energy and one actual input; persistent work consumes heat and station service.',
    effects: 'Conserved physical conversion, no automatic mastery.',
    handler: `fixture.${id}`,
    revision: 'fixture-package@1',
    authored: false,
    references: { target: 'owned' },
    execution: {
      duration: 1,
      interruption: 'cancel',
      progress: 'Start one persistent batch.',
    },
  });
  const pkg: V7Package = {
    id: 'fixture-package',
    version: 1,
    scope,
    description: 'Isolated tests only.',
    dependencies: ['foundation-open@1'],
    resources: [
      {
        id: 'fixture-strip',
        name: 'Fixture strip',
        mass: 1.1,
        nutrition: 0,
        toxicity: 0,
        color: '#aaaaaa',
      },
      {
        id: 'fixture-joined',
        name: 'Fixture joined material',
        mass: 1.1,
        nutrition: 0,
        toxicity: 0,
        color: '#bbbbbb',
      },
    ],
    abilities: [
      ability('fixture-first', 'branch', []),
      ability('fixture-second', 'fixture-strip', ['fixture-first']),
    ],
    handlers: Object.fromEntries(
      ['first', 'second'].map((stage) => [
        `fixture.fixture-${stage}`,
        (c) => {
          v7Spend(c.actor, 1);
          openStartProcess(c, {
            kind: `fixture-${stage}`,
            inputs: [
              { item: v7String(c.action.args.target, 'input'), quantity: 1 },
            ],
            outputs: [
              {
                resource:
                  stage === 'first' ? 'fixture-strip' : 'fixture-joined',
                quantity: 1,
              },
            ],
            station: 'fixture-station',
            work: 3,
            temperature: [-20, 50],
            moisture: [0, 2],
            heatPerRound: 0.2,
            wearPerRound: 0.1,
            maximumStall: 5,
            dependencies: {
              abilities: stage === 'first' ? [] : ['fixture-first'],
              knowledge: [],
            },
          });
          return { complete: true, writes: [] };
        },
      ]),
    ),
    processes: {},
    visualComponents: ['rock'],
    satisfaction: [],
    events: [],
  };
  return {
    world,
    pkg,
    registry: v7Registry([...continuousRegistry(world).packages, pkg]),
  };
}
export const openWait = { interface: 'wait', args: {} };
export const actorOf = (w: V7World) => {
  const a = w.actors[0];
  if (!a) throw new Error('Missing actor.');
  return a;
};
