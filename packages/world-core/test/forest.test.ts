import { describe, expect, it } from 'vitest';
import {
  FOREST_BASE,
  v7Clone,
  v7Registry,
  v7Step,
  v7Cursor,
  v7FinishTasks,
  v7ParsePlan,
  v7Remember,
  v7TaskAction,
  v7Observe,
  v7PublicCatalogue,
  v7Install,
  v7Walls,
  v7Interior,
  v7SegmentClear,
  forestClimate,
  forestGrowth,
  v7Signature,
} from '../src/index.js';
import type { V7Action, V7World, V7Plan } from '../src/index.js';
import {
  forestFixture,
  forestFixturePackage,
} from './fixtures/forest-extension.js';
const wait: V7Action = { interface: 'wait', args: {} };
const registry = v7Registry([FOREST_BASE, forestFixturePackage]);
const plan: V7Plan = {
  intention: 'An actor-authored prior intention',
  steps: [{ action: wait, repeat: 100, until: null, guard: null }],
  repeat: 1,
  until: null,
  interrupts: [],
  notes: [],
  preferences: [],
};
function step(world: V7World, a: V7Action = wait) {
  return v7Step(world, { a, b: wait }, registry);
}
function actor(world: V7World) {
  const a = world.actors[0];
  if (!a) throw new Error('Missing fixture actor');
  return a;
}

describe('forest lifecycle, conditions and ex7 regressions', () => {
  it('conserves quantities across separate owned stacks and records real toxicity before respawn', () => {
    const w = forestFixture();
    w.stacks.push(
      ...['one', 'two'].map((id) => ({
        id,
        resource: 'fish',
        quantity: 1,
        owner: 'a',
        position: { x: 2, y: 2 },
        origin: 'isolated',
      })),
    );
    actor(w).vitals.health = 1;
    const result = step(w, {
      interface: 'eat',
      args: { target: 'resource:fish', quantity: 2 },
    });
    expect(result.outcomes.a?.success).toBe(true);
    expect(result.world.stacks).toHaveLength(0);
    expect(actor(result.world).life?.deaths).toBe(1);
    expect(actor(result.world).life?.lastDeath?.cause).toContain('toxicity');
    expect(actor(result.world).memory.discoveries?.fish).toMatchObject({
      nutrition: 24,
      toxicity: 4,
    });
  });
  it('runs animal warning, injury and escape deterministically without a model', () => {
    let w = forestFixture();
    w.objects.push({
      id: 'wolf',
      kind: 'animal',
      name: 'Fixture wolf',
      spatial: {
        x: 2.7,
        y: 2,
        angle: 0,
        shape: { kind: 'circle', radius: 0.3 },
        solid: false,
        interaction: 0.6,
        entrances: [],
      },
      visual: {
        component: 'animal',
        color: '#888888',
        accent: '#aaaaaa',
        label: 'wolf',
        state: 'foraging',
      },
      data: { species: 'wolf', homeX: 2.7, homeY: 2 },
      createdBy: null,
      createdAt: 0,
      revision: 'fixture',
    });
    const first = step(w);
    expect(first.world.events.some((e) => e.type === 'animal-alert')).toBe(
      true,
    );
    expect(
      first.world.events.some(
        (e) => e.type === 'injured' && e.target === 'wolf',
      ),
    ).toBe(true);
    expect(v7Signature(first)).toBe(v7Signature(step(w)));
    w = v7Clone(first.world);
    const health = actor(w).vitals.health;
    for (let i = 0; i < 9; i++)
      w = v7Clone(
        step(w, { interface: 'navigate', args: { target: '', x: 2, y: 10 } })
          .world,
      );
    expect(actor(w).vitals.health).toBe(health);
  });
  it('spoils real perishable inventory and interrupts the affected plan without deleting its lesson', () => {
    const w = forestFixture();
    w.stacks.push({
      id: 'old-fruit',
      resource: 'berry',
      quantity: 2,
      owner: 'a',
      position: { x: 2, y: 2 },
      origin: 'fixture',
      decay: 100,
    });
    const cursors = { a: v7Cursor(plan, 0) };
    const result = v7Step(w, { a: wait, b: wait }, registry, cursors);
    v7FinishTasks(w, result, cursors);
    expect(result.world.stacks).toHaveLength(0);
    expect(result.world.events.some((e) => e.type === 'spoiled')).toBe(true);
    expect(cursors.a.reason).toContain('fresh decision');
  });
  it('settles exactly three deaths, conserves possessions and world progress, and keeps cross-life learning and important memory', () => {
    let w = forestFixture();
    const a = actor(w);
    a.mastered.push('fixture-remembered');
    a.memory.notes = ['A retained personal lesson'];
    a.relationships.b = 'known';
    a.memory.intention = plan.intention;
    w.stacks.push({
      id: 'unique',
      resource: 'stone',
      quantity: 3,
      position: { ...a.position },
      owner: 'a',
      origin: 'finite-source',
    });
    w.state.depleted = 7;
    const cursors = { a: v7Cursor(plan, 0) };
    for (let death = 1; death <= 3; death++) {
      actor(w).position = { x: 8, y: 8 };
      actor(w).vitals.health = 1;
      actor(w).vitals.satiety = 0;
      const result = v7Step(w, { a: wait, b: wait }, registry, cursors);
      expect(result.paused).toBeNull();
      v7FinishTasks(w, result, cursors);
      w = v7Clone(result.world);
      expect(actor(w).life?.deaths).toBe(death);
      expect(w.state.depleted).toBe(7);
      expect(w.time).toBe(death);
      expect(w.stacks).toHaveLength(1);
      expect(w.stacks[0]).toMatchObject({
        id: 'unique',
        owner: null,
        quantity: 3,
        position: { x: 8, y: 8 },
      });
      expect(actor(w).memory.notes).toContain('A retained personal lesson');
      expect(actor(w).mastered).toContain('fixture-remembered');
      expect(actor(w).relationships.b).toBe('known');
      expect(actor(w).life?.lastDeath?.priorPlan).toBe(plan.intention);
      expect(actor(w).memory.important?.some((e) => e.type === 'died')).toBe(
        true,
      );
      expect(cursors.a.reason).toContain('fresh decision');
      expect(actor(w).vitals.health).toBe(death < 3 ? 100 : 0);
    }
    const result = step(w);
    expect(actor(result.world).life?.deaths).toBe(3);
    expect(result.world.events.some((e) => e.type === 'respawned')).toBe(false);
  });
  it('selects an unoccupied spawn without removing an obstruction or refreshing consumed stocks', () => {
    const w = forestFixture(),
      a = actor(w);
    const other = w.actors[1];
    if (!other) throw new Error('Missing other actor');
    other.position = { ...a.position };
    a.position = { x: 9, y: 9 };
    a.vitals.health = 1;
    a.vitals.satiety = 0;
    const result = step(w);
    expect(result.paused).toBeNull();
    expect(actor(result.world).position).not.toEqual(a.life?.spawn);
    expect(result.world.objects).toEqual(w.objects);
  });
  it('rejects the actual invalid ex7 interrupt aliases and replans before a stale inventory reference executes', () => {
    const w = forestFixture();
    expect(() =>
      v7ParsePlan(
        {
          ...plan,
          interrupts: ['action_failed', 'health_changed', 'learning_completed'],
        },
        w.eventTypes,
      ),
    ).toThrow('Unknown interrupt');
    const c = v7Cursor(
      {
        ...plan,
        steps: [
          {
            action: {
              interface: 'eat',
              args: { target: 'missing-old-item', quantity: 2 },
            },
            repeat: 30,
            until: null,
            guard: null,
          },
        ],
      },
      0,
    );
    w.tick = 1;
    expect(v7TaskAction(w, 'a', c)).toBeNull();
    expect(c.reason).toContain('owned quantity');
  });
  it('keeps important events after long no-effect rest and hides undiscovered material properties', () => {
    let w = forestFixture();
    w.events = [
      {
        id: 'important',
        tick: 0,
        actor: 'a',
        type: 'message',
        interface: 'message',
        success: true,
        description: 'A retained delivered message',
        position: { x: 2, y: 2 },
        target: 'a',
        data: {},
      },
    ];
    v7Remember(w);
    for (let i = 0; i < 40; i++)
      w = v7Clone(step(w, { interface: 'rest', args: {} }).world);
    expect(
      actor(w).memory.important?.some((e) => e.event === 'important'),
    ).toBe(true);
    expect(
      actor(w).memory.experiences.some(
        (e) => e.summary === 'Recovered 0 energy.',
      ),
    ).toBe(false);
    const text = JSON.stringify(v7PublicCatalogue(w, 'a'));
    expect(text).not.toContain('"toxicity":24');
    expect(text).not.toContain('minGrowth');
  });
  it('uses gradual seasons and locally alterable growth constraints instead of a winter prohibition', () => {
    const w = forestFixture();
    const source = {
      id: 'plant',
      name: 'Test plant',
      kind: 'plant',
      spatial: {
        x: 8,
        y: 8,
        angle: 0,
        shape: { kind: 'circle' as const, radius: 0.2 },
        solid: false,
        interaction: 0.6,
        entrances: [],
      },
      visual: {
        component: 'plant',
        color: '#777777',
        accent: '#aaaaaa',
        label: 'plant',
        state: 'growing',
      },
      data: { resource: 'berry', stock: 0, capacity: 3, interval: 10 },
      createdBy: null,
      createdAt: 0,
      revision: 'fixture',
    };
    w.time = 620;
    const cold = forestClimate(w, source.spatial);
    const natural = forestGrowth(w, source);
    source.data = Object.assign(source.data, {
      warming: 25,
      light: 1,
      moisture: 1,
    });
    expect(forestGrowth(w, source)).toBeGreaterThan(natural);
    w.time = 621;
    expect(
      Math.abs(forestClimate(w, source.spatial).temperature - cold.temperature),
    ).toBeLessThan(1);
  });
  it('shares exact wall/door/interior geometry for caves and buildings, blocks walls, and occludes interiors', () => {
    const w = forestFixture();
    const shape = {
      x: 10,
      y: 10,
      angle: 0,
      shape: { kind: 'rectangle' as const, width: 4, height: 4 },
      solid: false,
      interaction: 0.6,
      entrances: [{ x: 0, y: 2 }],
      enclosure: { wall: 0.3, doorway: 1.4, roof: '#777777' },
    };
    expect(
      v7SegmentClear({ x: 10, y: 13 }, { x: 10, y: 10 }, 0.22, v7Walls(shape)),
    ).toBe(true);
    expect(
      v7SegmentClear({ x: 7, y: 10 }, { x: 10, y: 10 }, 0.22, v7Walls(shape)),
    ).toBe(false);
    expect(v7Interior({ x: 10, y: 10 }, shape)).toBe(true);
    w.objects.push({
      id: 'room',
      kind: 'cave',
      name: 'Cave',
      spatial: shape,
      visual: {
        component: 'cave',
        color: '#777777',
        accent: '#aaaaaa',
        label: 'cave',
        state: 'natural',
      },
      data: {},
      createdBy: null,
      createdAt: 0,
      revision: 'fixture',
    });
    actor(w).position = { x: 7, y: 10 };
    w.stacks.push({
      id: 'inside',
      resource: 'stone',
      quantity: 1,
      position: { x: 10, y: 10 },
      owner: null,
      origin: 'fixture',
    });
    expect(v7Observe(w, 'a').stacks).toHaveLength(0);
  });
  it('awards no happiness for installation or mastery, then bounded repeated experience and separately learned reuse', () => {
    let w = v7Clone(
      v7Install(forestFixture(), registry, 'isolated-forest-room@1'),
    );
    actor(w).position = { x: 8, y: 8 };
    w.stacks.push(
      {
        id: 'wood',
        resource: 'branch',
        quantity: 4,
        position: { x: 8, y: 8 },
        owner: 'a',
        origin: 'fixture',
      },
      {
        id: 'stone',
        resource: 'stone',
        quantity: 2,
        position: { x: 8, y: 8 },
        owner: 'a',
        origin: 'fixture',
      },
    );
    w = v7Clone(
      step(w, { interface: 'learn', args: { ability: 'fixture-build' } }).world,
    );
    for (let i = 0; i < 2; i++) w = v7Clone(step(w).world);
    expect(actor(w).mastered).toContain('fixture-build');
    expect(actor(w).wellbeing.mental).toBe(0);
    w = v7Clone(step(w, { interface: 'fixture-build', args: {} }).world);
    const room = w.objects[0];
    expect(room).toBeDefined();
    expect(w.stacks).toHaveLength(0);
    expect(actor(w).wellbeing.mental).toBe(0);
    w = v7Clone(
      step(w, { interface: 'learn', args: { ability: 'fixture-experience' } })
        .world,
    );
    w = v7Clone(step(w).world);
    actor(w).position = { x: 8, y: 6 };
    w = v7Clone(
      step(w, {
        interface: 'fixture-experience',
        args: { target: room?.id ?? 'missing' },
      }).world,
    );
    expect(actor(w).wellbeing.mental).toBe(4);
    const before = v7Signature(w);
    for (let i = 0; i < 15; i++)
      w = v7Clone(
        step(w, {
          interface: 'fixture-experience',
          args: { target: room?.id ?? 'missing' },
        }).world,
      );
    expect(actor(w).wellbeing.mental).toBe(4);
    expect(before).not.toBe(v7Signature(w));
    expect(w.actors[1]?.mastered).not.toContain('fixture-experience');
    w = v7Clone(
      v7Step(
        w,
        {
          a: wait,
          b: { interface: 'learn', args: { ability: 'fixture-experience' } },
        },
        registry,
      ).world,
    );
    w = v7Clone(step(w).world);
    expect(w.actors[1]?.mastered).toContain('fixture-experience');
  });
});
