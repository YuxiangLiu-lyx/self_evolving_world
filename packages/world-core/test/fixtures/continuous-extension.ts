import {
  V7_CONFIG,
  V7_BASE,
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Remember,
  v7ObjectSchema,
  v7Spend,
  v7ConsumeMaterials,
  v7Id,
  v7Reach,
} from '../../src/index.js';
import type { V7Actor, V7World, V7Package } from '../../src/index.js';
export function continuousFixture(): V7World {
  const actor = (id: string, x: number): V7Actor => ({
    id,
    name: id,
    position: { x, y: 2 },
    angle: 0,
    radius: 0.22,
    vitals: { health: 100, satiety: 80, energy: 40, temperature: 22 },
    wellbeing: { physical: 0, mental: 0, total: 0, sources: [] },
    mastered: V7_BASE.abilities.map((a) => a.id),
    learning: null,
    memory: {
      cells: [],
      objects: [],
      stacks: [],
      experiences: [],
      notes: [],
      preferences: [],
    },
    relationships: {},
    extensionState: {},
    bornAt: 0,
    parents: [],
  });
  let world: V7World = {
    protocol: 'continuous-v1',
    tick: 0,
    time: 0,
    config: v7Clone(V7_CONFIG),
    terrain: Array.from({ length: 24 }, () => '.'.repeat(24)),
    actors: [actor('a', 2), actor('b', 5)],
    objects: [],
    stacks: [],
    resources: [],
    processes: [],
    abilities: [],
    satisfaction: [],
    revisions: [],
    state: {},
    events: [],
    nextIdentity: 0,
    identityScope: 'world',
  };
  world = v7Clone(v7Install(world, continuousRegistry(), 'foundation-v7@1'));
  v7Remember(world);
  return world;
}
export const tensionPackage: V7Package = {
  id: 'fixture-tension',
  version: 1,
  description:
    'Isolated initially absent tension surface, not part of real actor context.',
  dependencies: ['foundation-v7@1'],
  resources: [],
  abilities: [
    {
      id: 'fixture-build',
      name: 'Tension surface',
      function: 'Create a material-backed shared resonant surface.',
      equivalence: 'fixture:tension:build',
      parameters: v7ObjectSchema({}),
      prerequisites: [],
      learning: 2,
      costs: 'Two branches and three energy.',
      effects:
        'Creates a shared surface and starts a measurable relaxation process.',
      handler: 'fixture.build@1',
      revision: 'fixture-tension@1',
      authored: false,
    },
    {
      id: 'fixture-touch',
      name: 'Use tension surface',
      function: 'Interact with a shared surface.',
      equivalence: 'fixture:tension:touch',
      parameters: v7ObjectSchema({ target: { type: 'string' } }),
      prerequisites: [],
      learning: 1,
      costs: 'One energy.',
      effects:
        'Actually increments surface uses and emits a verified interaction event.',
      handler: 'fixture.touch@1',
      revision: 'fixture-tension@1',
      authored: false,
    },
  ],
  satisfaction: [
    {
      id: 'fixture-satisfaction',
      name: 'Resonance experience',
      equivalence: 'fixture:resonance',
      event: 'resonated',
      interface: 'fixture-touch',
      conditions: [],
      amount: 12,
      cap: 12,
      duration: 8,
      mode: 'hold',
      repetition: 'refresh',
      cooldown: 2,
      rationale: 'Fixture-only event-grounded repeatable enjoyment.',
      revision: 'fixture-tension@1',
    },
  ],
  visualComponents: ['fixture-tension-surface'],
  handlers: {
    'fixture.build@1': ({ world, actor, emit }) => {
      v7Spend(actor, 3);
      v7ConsumeMaterials(world, actor, [{ resource: 'branch', quantity: 2 }]);
      const id = v7Id(world, 'surface');
      world.objects.push({
        id,
        kind: 'tension-surface',
        name: 'Tension surface',
        spatial: {
          x: actor.position.x,
          y: actor.position.y + 0.8,
          angle: Math.PI / 8,
          shape: { kind: 'rectangle', width: 0.8, height: 0.4 },
          solid: true,
          interaction: 0.8,
          entrances: [{ x: 0, y: -0.4 }],
        },
        visual: {
          component: 'fixture-tension-surface',
          color: '#94744e',
          accent: '#efd49b',
          label: 'Tension surface',
          state: 'taut',
        },
        data: { uses: 0, tension: 10 },
        createdBy: actor.id,
        createdAt: world.tick,
        revision: 'fixture-tension@1',
      });
      world.processes.push({
        id: v7Id(world, 'relaxation'),
        handler: 'fixture.relax@1',
        object: id,
        owner: actor.id,
        next: world.tick + 2,
        data: {},
        revision: 'fixture-tension@1',
      });
      emit('built', 'Created a paid resonant surface.', { object: id }, id);
      return { complete: true, writes: [] };
    },
    'fixture.touch@1': ({ world, actor, action, emit }) => {
      const object = world.objects.find((o) => o.id === action.args.target);
      if (!object || !v7Reach(actor, object.spatial))
        throw new Error('Surface is outside its entrance interaction zone.');
      v7Spend(actor, 1);
      object.data.uses = Number(object.data.uses) + 1;
      emit(
        'resonated',
        'The surface resonated after actual contact.',
        { uses: object.data.uses },
        object.id,
      );
      return { complete: true, writes: [object.id] };
    },
  },
  processes: {
    'fixture.relax@1': (world, process) => {
      const object = world.objects.find((o) => o.id === process.object);
      if (object) {
        object.data.tension = Math.max(0, Number(object.data.tension) - 1);
        object.visual.state = object.data.tension > 0 ? 'taut' : 'slack';
      }
      process.next = world.tick + 2;
    },
  },
};
