import { it, expect } from 'vitest';
import {
  v7Clone,
  openPlants,
  openAnimals,
  openStartProcess,
  v7Step,
  continuousRegistry,
  v7Install,
} from '@self-evolving-world/world-core';
import type { V7ActionContext, V7World } from '@self-evolving-world/world-core';
import { initialOpenWorld } from '../src/open-scenario.js';
import { openFixture, actorOf, openWait } from './fixtures/open-development.js';

it('establishes real propagules from parent stock with conditional growth and bounded local density', () => {
  const w = v7Clone(initialOpenWorld());
  w.actors = [];
  const parent = w.objects.find((o) => o.data.resource === 'root');
  if (!parent) throw new Error('Missing plant');
  w.objects = [parent];
  w.tick = 180;
  w.time = 180;
  parent.data.nextDispersal = 0;
  parent.data.stock = 6;
  parent.data.growth = 0;
  openPlants(w);
  const child = w.objects.find((o) => o.id !== parent.id);
  expect(child?.data.stage).toBe('seedling');
  expect(parent.data.stock).toBe(5);
  expect(
    w.events.find((e) => e.type === 'seed-dispersed')?.data.inputQuantity,
  ).toBe(1);
  for (let n = 0; n < 220; n++) {
    w.tick++;
    w.time++;
    openPlants(w);
  }
  expect(child?.data.stage).toBe('mature');
  expect(Number(child?.data.stock)).toBeGreaterThan(0);
  expect(w.objects.length).toBeLessThanOrEqual(3);
});
it('animals consume actual food, respond to approach, reproduce after paid gestation and retain injuries', () => {
  const w = v7Clone(initialOpenWorld()),
    deer = w.objects.filter((o) => o.data.species === 'deer');
  if (deer.length !== 2) throw new Error('Missing authored herd');
  const first = deer[0],
    second = deer[1];
  if (!first || !second) throw new Error('Missing deer');
  const food = w.objects.find((o) => o.data.resource === 'berry');
  if (!food) throw new Error('Missing food');
  w.objects = [first, second, food];
  w.actors = [];
  first.spatial.x = 8;
  first.spatial.y = 8;
  second.spatial.x = 8.6;
  second.spatial.y = 8;
  food.spatial.x = 8.2;
  food.spatial.y = 8;
  first.data.satiety = 50;
  second.data.satiety = 90;
  const stock = Number(food.data.stock);
  w.tick = 20;
  openAnimals(w);
  expect(Number(food.data.stock)).toBe(stock - 1);
  expect(first.data.satiety).toBeGreaterThan(60);
  // Preserved carcasses do not consume the living population capacity.
  for (let i = 0; i < 8; i++) {
    const dead = v7Clone(first);
    dead.id = `dead-${String(i)}`;
    dead.data.health = 0;
    w.objects.push(dead);
  }
  first.data.satiety = 90;
  first.data.health = 80;
  w.tick = 400;
  openAnimals(w);
  expect(first.data.satiety).toBeLessThan(75);
  expect(first.data.gestation ?? second.data.gestation).toBe(480);
  w.tick = 480;
  openAnimals(w);
  expect(
    w.objects.filter(
      (o) => o.kind === 'animal' && Number(o.data.health ?? 100) > 0,
    ),
  ).toHaveLength(3);
  expect(w.events.some((e) => e.type === 'animal-born')).toBe(true);
  expect(first.data.health).toBeLessThan(90);
  const a = actorOf(v7Clone(initialOpenWorld()));
  a.position = { x: first.spatial.x + 1, y: first.spatial.y };
  w.actors = [a];
  openAnimals(w);
  expect(first.data.mode).toBe('fleeing');
  expect(first.data.fear).toBeGreaterThan(0);
});
it('rejects unconserved recipes and leaves input, station energy and process state unchanged', () => {
  const f = openFixture(),
    w = f.world,
    a = actorOf(w),
    before = JSON.stringify(w);
  const context: V7ActionContext = {
    world: w,
    actor: a,
    action: { interface: 'fixture', args: {} },
    work: { remaining: 100, spend() {} },
    emit() {},
  };
  expect(() =>
    openStartProcess(context, {
      kind: 'invalid',
      inputs: [{ item: 'fixture-input', quantity: 1 }],
      outputs: [{ resource: 'stone', quantity: 2 }],
      work: 3,
      station: 'fixture-station',
      temperature: [-30, 50],
      moisture: [0, 2],
      heatPerRound: 1,
      wearPerRound: 1,
      maximumStall: 3,
      dependencies: { abilities: [], knowledge: [] },
    }),
  ).toThrow(/mass/);
  expect(JSON.stringify(w)).toBe(before);
});
it('does not grant the second actor personal mastery of an implemented same-world function', () => {
  const f = openFixture(),
    other = actorOf(v7Clone(initialOpenWorld()));
  other.id = 'other';
  other.position = { x: 15, y: 15 };
  f.world.actors.push(other);
  let w = v7Clone(v7Install(f.world, f.registry, 'fixture-package@1'));
  actorOf(w).mastered.push('fixture-first');
  let r = v7Step(
    w,
    {
      lin: openWait,
      other: { interface: 'fixture-first', args: { target: 'fixture-input' } },
    },
    f.registry,
  );
  expect(r.outcomes.other?.success).toBe(false);
  w = r.world;
  r = v7Step(
    w,
    {
      lin: openWait,
      other: { interface: 'learn', args: { ability: 'fixture-first' } },
    },
    f.registry,
  );
  w = v7Step(r.world, { lin: openWait, other: openWait }, f.registry).world;
  expect(w.actors[1]?.mastered).toContain('fixture-first');
});
it('retains resumed learning and finite mood without giving a reward for mastery or absent pleasure', () => {
  const f = openFixture();
  let w = v7Install(f.world, f.registry, 'fixture-package@1');
  w = v7Step(
    w,
    { lin: { interface: 'learn', args: { ability: 'fixture-first' } } },
    f.registry,
  ).world;
  const serialized = JSON.stringify(w);
  w = JSON.parse(serialized) as V7World;
  expect(actorOf(w).learning?.remaining).toBe(1);
  w = v7Step(w, { lin: openWait }, f.registry).world;
  expect(w.events.some((e) => e.type === 'satisfaction')).toBe(false);
  expect(actorOf(w).experience?.mental).toBe(0);
  expect(
    continuousRegistry(initialOpenWorld()).packages.some(
      (p) => p.id === 'fixture-package',
    ),
  ).toBe(false);
});
