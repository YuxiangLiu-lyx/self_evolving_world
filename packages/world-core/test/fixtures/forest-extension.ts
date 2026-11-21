import {
  FOREST_BASE,
  V7_CONFIG,
  v7Clone,
  v7Install,
  v7Registry,
  v7Remember,
  v7ObjectSchema,
  v7Spend,
  v7ConsumeMaterials,
  v7Id,
  v7Interior,
} from '../../src/index.js';
import type { V7Package, V7World } from '../../src/index.js';
import { continuousFixture } from './continuous-extension.js';

export function forestFixture(): V7World {
  const world = continuousFixture();
  world.config = {
    ...V7_CONFIG,
    hunger: 0.65,
    forest: { version: 1, day: 80, year: 800, respawnSatiety: 80, lives: 3 },
  };
  world.state.season = 'spring';
  world.abilities = [];
  world.resources = [];
  world.revisions = [];
  world.actors.forEach((a) => {
    a.life = { total: 3, deaths: 0, spawn: { ...a.position }, lastDeath: null };
    a.memory.important = [];
    a.memory.discoveries = {};
  });
  const result = v7Clone(
    v7Install(world, v7Registry([FOREST_BASE]), 'foundation-forest@1'),
  );
  v7Remember(result);
  return result;
}
/** An explicit isolated fixture, never installed in a formal genesis or sent as model guidance. */
export const forestFixturePackage: V7Package = {
  id: 'isolated-forest-room',
  version: 1,
  description:
    'Isolated paid enclosure and experience regression; not an autonomous discovery.',
  dependencies: ['foundation-forest@1'],
  resources: [],
  processes: {},
  visualComponents: ['enclosure'],
  events: ['fixture-built', 'fixture-experienced'],
  abilities: [
    {
      id: 'fixture-build',
      name: 'Isolated room',
      function: 'Construct a real enclosure from owned material.',
      equivalence: 'fixture-room-build',
      parameters: v7ObjectSchema({}),
      prerequisites: [],
      learning: 3,
      costs: 'Four branches, two stone and six energy.',
      effects: 'Creates wall segments, doorway and a buffered indoor area.',
      handler: 'isolated.build',
      revision: 'isolated-forest-room@1',
      authored: false,
    },
    {
      id: 'fixture-experience',
      name: 'Isolated shared experience',
      function: 'Experience the interior of a real shared enclosure.',
      equivalence: 'fixture-room-experience',
      parameters: v7ObjectSchema({ target: { type: 'string' } }),
      prerequisites: [],
      learning: 2,
      costs: 'One energy and one round.',
      effects: 'Records personal completed experience only when indoors.',
      handler: 'isolated.experience',
      revision: 'isolated-forest-room@1',
      authored: false,
    },
  ],
  satisfaction: [
    {
      id: 'fixture-contentment',
      name: 'Isolated indoor contentment',
      equivalence: 'fixture-contentment',
      event: 'fixture-experienced',
      interface: 'fixture-experience',
      conditions: [],
      amount: 4,
      cap: 6,
      duration: 30,
      mode: 'hold',
      repetition: 'refresh',
      cooldown: 5,
      rationale:
        'The actor actually spends time experiencing a shared sheltered place. This isolated test is not evidence of spontaneous preference.',
      revision: 'isolated-forest-room@1',
    },
  ],
  handlers: {
    'isolated.build': ({ world, actor, emit }) => {
      v7Spend(actor, 6);
      v7ConsumeMaterials(world, actor, [
        { resource: 'branch', quantity: 4 },
        { resource: 'stone', quantity: 2 },
      ]);
      const id = v7Id(world, 'fixture-room');
      world.objects.push({
        id,
        kind: 'fixture-room',
        name: 'Isolated test building',
        spatial: {
          x: actor.position.x,
          y: actor.position.y - 2.3,
          angle: 0,
          shape: { kind: 'rectangle', width: 4, height: 4 },
          solid: false,
          reserved: true,
          interaction: 0.65,
          entrances: [{ x: 0, y: 2 }],
          enclosure: { wall: 0.3, doorway: 1.4, roof: '#95815a' },
        },
        visual: {
          component: 'enclosure',
          color: '#998568',
          accent: '#ead2a1',
          label: 'Isolated building',
          state: 'built',
        },
        data: {
          insulation: 2,
          buffering: 0.5,
          contents: [
            { resource: 'branch', quantity: 4 },
            { resource: 'stone', quantity: 2 },
          ],
        },
        createdBy: actor.id,
        createdAt: world.tick,
        revision: 'isolated-forest-room@1',
      });
      emit(
        'fixture-built',
        'Completed an isolated material-backed building.',
        {},
        id,
      );
      return { complete: true, writes: [] };
    },
    'isolated.experience': ({ world, actor, action, emit }) => {
      const room = world.objects.find((o) => o.id === action.args.target);
      if (!room || !v7Interior(actor.position, room.spatial))
        throw new Error('Actual indoor participation is required.');
      v7Spend(actor, 1);
      emit(
        'fixture-experienced',
        'Completed the isolated indoor experience.',
        { participants: [actor.id] },
        room.id,
      );
      return { complete: true, writes: [] };
    },
  },
};
