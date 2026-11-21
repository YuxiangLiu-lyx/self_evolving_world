import type { V7Package, V7Resource } from './continuous-types.js';
import { v7Number, v7String } from './continuous-data.js';
import { V7_BASE, v7FoodEffect } from './continuous-base.js';
import { FOREST_EVENTS } from './forest-environment.js';

/** Genesis catalogue for forest-v1. Hidden physical properties are never a public recipe list. */
const definitions: [
  string,
  string,
  number,
  number,
  number,
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
][] = [
  ['berry', 'Red berries', 0.2, 8, 0, '#b34f66', 0, 0, 0, 100, 6, 20, 0.6],
  ['root', 'Meadow roots', 0.4, 14, 0, '#cfaf79', 1, 0, 0, 240, 3, 16, 0.5],
  ['branch', 'Fallen branches', 1.1, 0, 0, '#8d704e', 3, 2, 8, 0, 0, 20, 0.5],
  ['stone', 'Weathered stone', 2, 0, 0, '#869189', 8, 0, 0, 0, 0, 20, 0.1],
  ['bark', 'Birch bark', 0.3, 0, 0, '#cec5ac', 1, 6, 5, 0, 4, 18, 0.5],
  ['vine', 'Forest vines', 0.5, 0, 0, '#749851', 1, 9, 2, 0, 7, 22, 0.7],
  ['reed', 'River reeds', 0.25, 0, 0, '#b9b875', 1, 7, 3, 0, 5, 21, 0.9],
  ['flint', 'Dark flint', 1.3, 0, 0, '#58646a', 9, 0, 0, 0, 0, 20, 0.1],
  ['clay', 'Wet clay', 1.5, 0, 0, '#a97c61', 0, 8, 0, 0, 0, 20, 0.9],
  [
    'apple',
    'Small wild apples',
    0.3,
    10,
    0,
    '#b87953',
    1,
    0,
    0,
    140,
    8,
    23,
    0.6,
  ],
  ['plum', 'Wild plums', 0.2, 9, 0, '#7f5689', 0, 0, 0, 80, 8, 23, 0.6],
  ['hazelnut', 'Hazelnuts', 0.2, 18, 0, '#a5814f', 4, 0, 1, 800, 7, 19, 0.5],
  ['walnut', 'Walnuts', 0.3, 22, 0, '#716044', 5, 0, 2, 900, 9, 22, 0.5],
  ['acorn', 'Bitter acorns', 0.25, 16, 5, '#987c48', 3, 0, 1, 700, 7, 20, 0.5],
  ['tuber', 'Marsh tubers', 0.6, 20, 0, '#c6b389', 1, 0, 0, 300, 4, 18, 0.8],
  [
    'fern-root',
    'Fibrous fern roots',
    0.4,
    9,
    3,
    '#9d8a61',
    2,
    3,
    0,
    180,
    5,
    18,
    0.7,
  ],
  [
    'mushroom',
    'Brown mushrooms',
    0.15,
    6,
    0,
    '#ba9877',
    0,
    0,
    0,
    55,
    4,
    15,
    0.8,
  ],
  [
    'red-fungus',
    'Red-capped fungi',
    0.15,
    5,
    24,
    '#cf5c51',
    0,
    0,
    0,
    65,
    6,
    18,
    0.8,
  ],
  ['fish', 'River fish', 0.8, 24, 4, '#8cb6b7', 0, 1, 0, 50, 5, 17, 0.9],
  ['willow', 'Willow wood', 1.2, 0, 0, '#9d8c66', 3, 7, 7, 0, 4, 19, 0.8],
  ['oak', 'Oak wood', 2.2, 0, 0, '#756042', 7, 2, 12, 0, 6, 20, 0.5],
  ['birch', 'Birch wood', 1.5, 0, 0, '#c8bba0', 5, 3, 9, 0, 4, 18, 0.5],
  ['resin', 'Pine resin', 0.2, 0, 12, '#d3a44d', 0, 1, 11, 0, 8, 23, 0.4],
  ['moss', 'Soft moss', 0.1, 0, 0, '#6f925c', 0, 8, 1, 0, 1, 13, 0.8],
  ['sand', 'River sand', 1.4, 0, 0, '#d4c8a0', 6, 0, 0, 0, 0, 20, 0.2],
  ['dry-grass', 'Dry grass', 0.1, 0, 0, '#c4b679', 0, 5, 4, 0, 3, 20, 0.4],
];
export const FOREST_RESOURCES: V7Resource[] = definitions.map(
  ([
    id,
    name,
    mass,
    nutrition,
    toxicity,
    color,
    hardness,
    flexibility,
    fuel,
    decay,
    minGrowth,
    optimalGrowth,
    moisture,
  ]) => ({
    id,
    name,
    mass,
    nutrition,
    toxicity,
    color,
    properties: {
      hardness,
      flexibility,
      fuel,
      decay,
      minGrowth,
      optimalGrowth,
      moisture,
    },
  }),
);

export const FOREST_BASE: V7Package = {
  ...V7_BASE,
  id: 'foundation-forest',
  version: 1,
  description:
    'Forest-v1 authored survival interfaces, physical materials and bounded event vocabulary. No prescribed development activities or mental reward.',
  abilities: V7_BASE.abilities.map((a) => ({
    ...a,
    revision: 'foundation-forest@1',
    costs: a.costs.replace('simulation second', 'simulation time unit'),
    handler: a.handler.startsWith('base.')
      ? a.handler.replace('base.', 'forest.')
      : a.handler,
  })),
  resources: FOREST_RESOURCES,
  events: FOREST_EVENTS,
  visualComponents: [
    ...V7_BASE.visualComponents,
    'plant',
    'animal',
    'cave',
    'enclosure',
  ],
  processes: {},
  handlers: Object.fromEntries(
    Object.entries(V7_BASE.handlers).map(([key, handler]) => [
      key.replace('base.', 'forest.'),
      (context) => {
        const before = new Set(context.world.stacks.map((s) => s.id));
        const healthBefore = context.actor.vitals.health;
        let result;
        if (
          context.action.interface === 'eat' &&
          v7String(context.action.args.target, 'food target').startsWith(
            'resource:',
          )
        ) {
          const id = v7String(context.action.args.target, 'food target').slice(
              9,
            ),
            n = v7Number(context.action.args.quantity, 'quantity', 1);
          const stacks = context.world.stacks.filter(
              (s) =>
                !s.reservedFor &&
                s.owner === context.actor.id &&
                s.resource === id,
            ),
            resource = context.world.resources.find((r) => r.id === id);
          if (
            !resource ||
            resource.nutrition <= 0 ||
            stacks.reduce((sum, s) => sum + s.quantity, 0) < n
          )
            throw new Error(
              'The actual owned edible quantity is insufficient.',
            );

          let remaining = n;
          for (const stack of stacks) {
            const used = Math.min(remaining, stack.quantity);
            stack.quantity -= used;
            remaining -= used;
          }
          const before = context.actor.vitals.satiety;
          v7FoodEffect(context.actor, resource, n);
          context.emit(
            'ate',
            `Consumed ${String(n)} ${resource.name}; gained ${String(context.actor.vitals.satiety - before)} satiety.`,
            {
              quantity: n,
              resource: id,
              nutrition: n * resource.nutrition,
              realized: context.actor.vitals.satiety - before,
              origins: stacks.map((s) => s.origin),
            },
          );
          result = { complete: true, writes: stacks.map((s) => s.id) };
        } else result = handler(context);
        if (context.actor.vitals.health < healthBefore)
          context.emit('injured', 'Food toxicity caused health loss.', {
            cause: 'food toxicity',
            before: healthBefore,
            after: context.actor.vitals.health,
          });
        for (const stack of context.world.stacks)
          if (!before.has(stack.id) && stack.harvestedAt === undefined)
            stack.harvestedAt = context.world.tick;
        if (context.action.interface === 'eat') {
          const event = context.world.events.find((e) => e.type === 'ate');
          const resource = context.world.resources.find(
            (r) => r.id === event?.data.resource,
          );
          if (resource) {
            context.actor.memory.discoveries ??= {};
            context.actor.memory.discoveries[resource.id] = {
              nutrition: resource.nutrition,
              toxicity: resource.toxicity,
              observedAt: context.world.tick,
            };
          }
        }
        return result;
      },
    ]),
  ),
};
