import { describe, expect, it } from 'vitest';
import {
  V7_BASE,
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Remember,
  v7Step,
  v7Work,
  v7Route,
  v7Distance,
  v7Registry,
  v7Cursor,
  v7TaskAction,
  v7FinishTasks,
  v7ParsePlan,
} from '../src/index.js';
import type { V7World, V7Action, V7Package, V7Plan } from '../src/index.js';

import {
  continuousFixture as fixture,
  tensionPackage,
} from './fixtures/continuous-extension.js';
const wait: V7Action = { interface: 'wait', args: {} };
const move = (x: number, y: number): V7Action => ({
  interface: 'navigate',
  args: { target: '', x, y },
});
function step(
  world: V7World,
  action: V7Action,
  other = wait,
  registry = continuousRegistry(),
) {
  return v7Step(world, { a: action, b: other }, registry);
}

describe('continuous-v1 authoritative spatial and extension kernel', () => {
  it('moves in an arbitrary direction with fractional positions and exact distance-based effort', () => {
    const before = fixture(),
      result = step(before, move(6.4, 4.7)),
      a = result.world.actors[0];
    expect(result.paused).toBeNull();
    expect(result.outcomes.a?.success).toBe(true);
    expect(
      v7Distance(present(before.actors[0]).position, present(a).position),
    ).toBeCloseTo(0.8, 7);
    expect(a?.vitals.energy).toBeCloseTo(38.4);
    expect(a?.position.x).not.toBe(Math.round(present(a).position.x));
    expect(a?.position.y).not.toBe(2);
    expect(before.tick).toBe(0);
    expect(result.world.time).toBe(1);
  });
  it('routes around observed geometry while unknown object IDs and hidden obstacles never guide planning', () => {
    const world = fixture();
    world.objects.push({
      id: 'wall',
      kind: 'wall',
      name: 'Wall',
      spatial: {
        x: 3.2,
        y: 2,
        angle: 0,
        shape: { kind: 'rectangle', width: 0.4, height: 2 },
        solid: true,
        interaction: 0.5,
        entrances: [],
      },
      visual: {
        component: 'wall',
        color: '#777777',
        accent: '#cccccc',
        label: 'Wall',
        state: 'solid',
      },
      data: {},
      createdBy: null,
      createdAt: 0,
      revision: 'fixture',
    });
    expect(
      v7Route(
        world,
        present(world.actors[0]),
        { x: 4.4, y: 2 },
        v7Work(2_000_000),
      ),
    ).toEqual([{ x: 4.4, y: 2 }]);
    const failed = step(world, {
      interface: 'navigate',
      args: { target: 'wall', x: 0, y: 0 },
    });
    expect(failed.outcomes.a?.success).toBe(false);
    v7Remember(world);
    const path = v7Route(
      world,
      present(world.actors[0]),
      { x: 4.4, y: 2 },
      v7Work(2_000_000),
    );
    expect(path.length).toBeGreaterThan(1);
    expect(path.some((p) => Math.abs(p.y - 2) > 1)).toBe(true);
  });
  it('rejects simultaneous swept-body crossing rather than resolving by actor ordering', () => {
    const world = fixture();
    present(world.actors[1]).position = { x: 2.8, y: 2 };
    const result = step(world, move(2.8, 2), move(2, 2));
    expect(result.outcomes.a?.success).toBe(false);
    expect(result.outcomes.b?.success).toBe(false);
    expect(result.world.actors.map((a) => a.position)).toEqual(
      world.actors.map((a) => a.position),
    );
  });
  it('rejects both shared-stock writes and conserves distinct same-round inventory identities', () => {
    const world = fixture();
    present(world.actors[1]).position = { x: 2.6, y: 2 };
    world.stacks.push({
      id: 'food',
      resource: 'berry',
      quantity: 2,
      owner: null,
      position: { x: 2.3, y: 2 },
      origin: 'fixture',
    });
    const action = {
      interface: 'pickup',
      args: { target: 'food', quantity: 1 },
    };
    const result = step(world, action, action);
    expect(result.world.stacks).toEqual(world.stacks);
    expect(Object.values(result.outcomes).every((o) => !o.success)).toBe(true);
    world.stacks.push({ ...present(world.stacks[0]), id: 'food-b' });
    const accepted = step(world, action, {
      interface: 'pickup',
      args: { target: 'food-b', quantity: 1 },
    });
    expect(new Set(accepted.world.stacks.map((s) => s.id)).size).toBe(4);
    expect(accepted.world.stacks.reduce((n, s) => n + s.quantity, 0)).toBe(4);
  });
  it('pauses computation atomically without metabolism, effects or cursor movement', () => {
    const world = fixture();
    world.config.computation.workPerRound = 0;
    const result = step(world, move(3, 4));
    expect(result.paused).toMatch(/computation/);
    expect(result.world).toBe(world);
    expect(result.world.tick).toBe(0);
  });
  it('installs an absent mechanism without gifting stock or mastery, then permits paid shared use and event-grounded satisfaction', () => {
    let world = fixture();
    const registry = v7Registry([V7_BASE, tensionPackage]);
    expect(
      step(world, { interface: 'fixture-build', args: {} }, wait, registry)
        .outcomes.a?.success,
    ).toBe(false);
    const original = JSON.stringify(world);
    world = v7Clone(v7Install(world, registry, 'fixture-tension@1'));
    expect(world.objects).toHaveLength(0);
    expect(world.actors[0]?.mastered).not.toContain('fixture-build');
    expect((JSON.parse(original) as V7World).objects).toEqual([]);
    world.stacks.push({
      id: 'material',
      resource: 'branch',
      quantity: 2,
      owner: 'a',
      position: { x: 2, y: 2 },
      origin: 'fixture',
    });
    world = step(
      world,
      { interface: 'learn', args: { ability: 'fixture-build' } },
      { interface: 'learn', args: { ability: 'fixture-touch' } },
      registry,
    ).world;
    expect(world.actors[0]?.learning?.remaining).toBe(1);
    expect(world.actors[1]?.wellbeing.mental).toBe(0);
    world = step(world, wait, wait, registry).world;
    world = step(
      world,
      { interface: 'fixture-build', args: {} },
      wait,
      registry,
    ).world;
    expect(world.objects).toHaveLength(1);
    expect(world.stacks).toHaveLength(0);
    expect(world.actors[0]?.vitals.energy).toBe(37);
    const id = present(world.objects[0]).id;
    world = v7Clone(world);
    present(world.actors[1]).position = { x: 2.8, y: 2.1 };
    v7Remember(world);
    world = step(
      world,
      wait,
      { interface: 'fixture-touch', args: { target: id } },
      registry,
    ).world;
    expect(world.objects[0]?.data.uses).toBe(1);
    expect(world.actors[1]?.wellbeing.mental).toBe(12);
    expect(world.actors[0]?.wellbeing.mental).toBe(0);
    world = step(world, wait, wait, registry).world;
    expect(world.objects[0]?.data.tension).toBeLessThan(10);
    const restored = v7Clone(world);
    expect(step(restored, wait, wait, registry)).toEqual(
      step(world, wait, wait, registry),
    );
    expect(() => v7Install(world, registry, 'fixture-tension@1')).toThrow(
      /Duplicate|duplicate/,
    );
  });
  it('supports persistent conditional tasks well beyond twelve rounds without inventing a strategy', () => {
    const world = fixture();
    present(world.actors[0]).vitals.energy = 2;
    const plan: V7Plan = {
      intention: '',
      steps: [
        {
          action: { interface: 'rest', args: {} },
          repeat: 100,
          until: { path: 'self.energy', comparison: 'gte', value: 40 },
          guard: null,
        },
        { action: wait, repeat: 50, until: null, guard: null },
      ],
      repeat: 2,
      until: null,
      interrupts: [],
      notes: [],
      preferences: [],
    };
    const cursor = v7Cursor(v7ParsePlan(plan), 0),
      cursors = { a: cursor };
    expect(v7TaskAction(world, 'a', cursor)?.interface).toBe('rest');
    const result = v7Step(
      world,
      { a: { interface: 'rest', args: {} }, b: wait },
      continuousRegistry(),
      cursors,
    );
    v7FinishTasks(world, result, cursors);
    expect(cursors.a.reason).toBeNull();
    expect(cursors.a.repetition).toBe(1);
    expect(v7TaskAction(result.world, 'a', cursors.a)?.interface).toBe('rest');
  });
  it('protects satisfaction and configuration at installation instead of rewarding application text', () => {
    const world = fixture();
    const bad: V7Package = {
      ...tensionPackage,
      migrate: (w) => {
        present(w.actors[0]).wellbeing.total = 100;
        return w;
      },
    };
    expect(() =>
      v7Install(world, v7Registry([V7_BASE, bad]), 'fixture-tension@1'),
    ).toThrow(/protected/);
    const clone: V7Package = {
      ...tensionPackage,
      id: 'renamed',
      satisfaction: [
        { ...present(tensionPackage.satisfaction[0]), event: 'mastered' },
      ],
    };
    expect(() =>
      v7Install(world, v7Registry([V7_BASE, clone]), 'renamed@1'),
    ).toThrow(/ungrounded/);
  });
});

function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Required fixture value is missing.');
  return value;
}

it('rejects a simultaneous new solid footprint and intersecting motion without consuming construction materials', () => {
  const world = fixture(),
    registry = v7Registry([V7_BASE, tensionPackage]);
  const installed = v7Clone(v7Install(world, registry, 'fixture-tension@1'));
  present(installed.actors[0]).mastered.push('fixture-build');
  present(installed.actors[1]).position = { x: 2.8, y: 2.8 };
  installed.stacks.push({
    id: 'materials',
    resource: 'branch',
    quantity: 2,
    owner: 'a',
    position: { x: 2, y: 2 },
    origin: 'fixture',
  });
  const result = step(
    installed,
    { interface: 'fixture-build', args: {} },
    move(2, 2.8),
    registry,
  );
  expect(result.outcomes.a?.success).toBe(false);
  expect(result.outcomes.b?.success).toBe(false);
  expect(result.world.objects).toHaveLength(0);
  expect(result.world.stacks[0]?.quantity).toBe(2);
});
it('refreshes a real repeated experience within its cap, expires it and rejects renamed equivalents', () => {
  const world = fixture(),
    registry = v7Registry([V7_BASE, tensionPackage]);
  let installed = v7Clone(v7Install(world, registry, 'fixture-tension@1'));
  present(installed.actors[0]).mastered.push('fixture-build', 'fixture-touch');
  installed.stacks.push({
    id: 'materials',
    resource: 'branch',
    quantity: 2,
    owner: 'a',
    position: { x: 2, y: 2 },
    origin: 'fixture',
  });
  installed = step(
    installed,
    { interface: 'fixture-build', args: {} },
    wait,
    registry,
  ).world;
  const id = present(installed.objects[0]).id,
    use = { interface: 'fixture-touch', args: { target: id } };
  installed = step(installed, use, wait, registry).world;
  expect(installed.actors[0]?.wellbeing.mental).toBe(12);
  for (let i = 0; i < 4; i++)
    installed = step(installed, use, wait, registry).world;
  expect(installed.actors[0]?.wellbeing.mental).toBe(12);
  for (let i = 0; i < 10; i++)
    installed = step(installed, wait, wait, registry).world;
  expect(installed.actors[0]?.wellbeing.mental).toBe(0);
  const alias: V7Package = {
    id: 'alias',
    version: 1,
    description: 'Fixture equivalent alias rejection.',
    dependencies: ['fixture-tension@1'],
    resources: [],
    abilities: [],
    handlers: {},
    processes: {},
    visualComponents: [],
    satisfaction: [
      { ...present(tensionPackage.satisfaction[0]), id: 'alias-source' },
    ],
  };
  expect(() =>
    v7Install(
      installed,
      v7Registry([V7_BASE, tensionPackage, alias]),
      'alias@1',
    ),
  ).toThrow(/Equivalent/);
});
it('runs a paid removal and partial recycle lifecycle, removes its process and releases the same physical location', () => {
  const lifecycle: V7Package = {
    id: 'fixture-lifecycle',
    version: 1,
    description: 'Isolated paid dismantling and material conservation.',
    dependencies: ['fixture-tension@1'],
    resources: [],
    satisfaction: [],
    processes: {},
    visualComponents: [],
    abilities: [
      {
        ...present(tensionPackage.abilities[1]),
        id: 'fixture-remove',
        name: 'Dismantle surface',
        equivalence: 'fixture:remove',
        handler: 'fixture.remove@1',
        learning: 1,
      },
    ],
    handlers: {
      'fixture.remove@1': ({ world, actor, action, emit }) => {
        const object = world.objects.find((o) => o.id === action.args.target);
        if (!object || actor.vitals.energy < 2)
          throw new Error('Missing fixture object or effort.');
        actor.vitals.energy -= 2;
        world.objects = world.objects.filter((o) => o.id !== object.id);
        world.processes = world.processes.filter((p) => p.object !== object.id);
        world.stacks.push({
          id: `recycled-${object.id}`,
          resource: 'branch',
          quantity: 1,
          owner: actor.id,
          position: actor.position,
          origin: object.id,
        });
        emit(
          'dismantled',
          'One of two branches recovered after paid dismantling.',
          { quantity: 1 },
          object.id,
        );
        return { complete: true, writes: [] };
      },
    },
  };
  const registry = v7Registry([V7_BASE, tensionPackage, lifecycle]);
  let world = v7Clone(
    v7Install(
      v7Install(fixture(), registry, 'fixture-tension@1'),
      registry,
      'fixture-lifecycle@1',
    ),
  );
  present(world.actors[0]).mastered.push('fixture-build', 'fixture-remove');
  world.stacks.push({
    id: 'materials',
    resource: 'branch',
    quantity: 3,
    owner: 'a',
    position: { x: 2, y: 2 },
    origin: 'fixture',
  });
  world = step(
    world,
    { interface: 'fixture-build', args: {} },
    wait,
    registry,
  ).world;
  const original = present(world.objects[0]);
  world = step(
    world,
    { interface: 'fixture-remove', args: { target: original.id } },
    wait,
    registry,
  ).world;
  expect(world.objects).toHaveLength(0);
  expect(world.processes).toHaveLength(0);
  expect(world.stacks.reduce((n, s) => n + s.quantity, 0)).toBe(2);
  world = step(
    world,
    { interface: 'fixture-build', args: {} },
    wait,
    registry,
  ).world;
  expect(world.objects).toHaveLength(1);
  expect(world.objects[0]?.spatial).toEqual(original.spatial);
  expect(world.objects[0]?.id).not.toBe(original.id);
  expect(world.stacks).toHaveLength(0);
});

it('navigates to an actual entrance interaction area without requiring a body to occupy the entrance boundary', () => {
  let world = fixture();
  const registry = v7Registry([V7_BASE, tensionPackage]);
  world = v7Clone(v7Install(world, registry, 'fixture-tension@1'));
  present(world.actors[0]).mastered.push('fixture-build');
  world.stacks.push({
    id: 'materials',
    resource: 'branch',
    quantity: 2,
    owner: 'a',
    position: { x: 2, y: 2 },
    origin: 'fixture',
  });
  world = step(
    world,
    { interface: 'fixture-build', args: {} },
    wait,
    registry,
  ).world;
  const id = present(world.objects[0]).id;
  let arrived = false;
  for (let i = 0; i < 12 && !arrived; i++) {
    const result = step(
      world,
      wait,
      { interface: 'navigate', args: { target: id, x: 0, y: 0 } },
      registry,
    );
    expect(result.outcomes.b?.success).toBe(true);
    arrived = result.outcomes.b?.complete ?? false;
    world = result.world;
  }
  expect(arrived).toBe(true);
  expect(present(world.actors[1]).position).not.toEqual({ x: 2, y: 2.8 });
});
