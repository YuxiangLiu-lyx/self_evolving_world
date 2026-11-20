import {
  V7_CONFIG,
  V7_BASE,
  continuousRegistry,
  v7Install,
  v7Freeze,
  v7Remember,
  v7Wellbeing,
  v7AssertWorld,
  v7Clone,
} from '@self-evolving-world/world-core';
import type {
  V7Actor,
  V7Object,
  V7World,
} from '@self-evolving-world/world-core';

/** Independently seeded scenario. No offline test route or actor decision is retained here. */
export function initialContinuousWorld(): V7World {
  const terrain = Array.from({ length: 24 }, (_, y) =>
    Array.from({ length: 24 }, (_, x) =>
      x === 17
        ? [6, 7, 13, 14].includes(y)
          ? '='
          : '~'
        : x === 16 || x === 18
          ? ','
          : x < 8
            ? 'f'
            : x > 19 && y < 9
              ? ':'
              : '.',
    ).join(''),
  );
  const actors: V7Actor[] = [
    ['lin', 'Lin', 5.2, 6.4],
    ['moss', 'Moss', 11.8, 6.4],
    ['sol', 'Sol', 8.5, 11.5],
  ].map(([id, name, x, y]) => ({
    id: String(id),
    name: String(name),
    position: { x: Number(x), y: Number(y) },
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
  }));
  const objects: V7Object[] = [];
  const place = (
    id: string,
    kind: string,
    x: number,
    y: number,
    resource: string,
    stock: number,
    renewable = false,
  ): void => {
    objects.push({
      id,
      kind,
      name:
        kind === 'berry-shrub'
          ? 'Berry shrub'
          : kind === 'root-patch'
            ? 'Root patch'
            : kind === 'tree'
              ? 'Broadleaf tree'
              : 'Weathered rock',
      spatial: {
        x,
        y,
        angle: (objects.length * 0.73) % (Math.PI * 2),
        shape: {
          kind: 'circle',
          radius: kind === 'tree' ? 0.52 : kind === 'rock' ? 0.48 : 0.35,
        },
        solid: kind === 'tree' || kind === 'rock',
        interaction: 0.65,
        entrances: [],
      },
      visual: {
        component: kind,
        color:
          kind === 'berry-shrub'
            ? '#427452'
            : kind === 'root-patch'
              ? '#7d965c'
              : kind === 'tree'
                ? '#365f45'
                : '#899591',
        accent: resource === 'berry' ? '#be5166' : '#d4b978',
        label: id,
        state: 'ready',
      },
      data: {
        resource,
        stock,
        capacity: stock,
        interval: renewable ? 12 : 0,
        next: renewable ? 12 : 0,
        produced: 0,
        mechanism: renewable
          ? 'Perennial root system with groundwater and daylight; standing ripe stock is bounded by plant size. Gathering removes real stock.'
          : 'Finite exposed loose material; gathering does not fell or break the standing object.',
      },
      createdBy: null,
      createdAt: 0,
      revision: 'foundation-v7@1',
    });
  };
  [
    [4.3, 5.1],
    [5.7, 8.1],
    [10.5, 5.1],
    [13.1, 7.8],
    [7.1, 10.1],
    [10.1, 12.8],
    [3.1, 12.4],
    [5.4, 15.1],
    [12.8, 12.2],
    [14.2, 16.3],
    [8.4, 18.6],
    [20.7, 13.4],
  ].forEach(([x, y], i) => {
    place(
      `food-${String(i + 1)}`,
      i % 3 === 2 ? 'root-patch' : 'berry-shrub',
      x ?? 0,
      y ?? 0,
      i % 3 === 2 ? 'root' : 'berry',
      12,
      true,
    );
  });
  [
    [3.3, 3.4],
    [6.6, 4.2],
    [4.1, 9.6],
    [7.4, 7.4],
    [9.8, 8.9],
    [12.8, 3.4],
    [11.4, 10.3],
    [6.1, 13.2],
    [14.9, 10.5],
    [13.3, 18.3],
    [4.8, 18.8],
    [20.6, 10.5],
  ].forEach(([x, y], i) => {
    place(`tree-${String(i + 1)}`, 'tree', x ?? 0, y ?? 0, 'branch', 10);
  });
  [
    [2.5, 7.2],
    [9.4, 3.2],
    [14.1, 9.3],
    [10.2, 15.6],
    [20.1, 4.5],
  ].forEach(([x, y], i) => {
    place(`rock-${String(i + 1)}`, 'rock', x ?? 0, y ?? 0, 'stone', 8);
  });
  let world: V7World = {
    protocol: 'continuous-v1',
    tick: 0,
    time: 0,
    config: v7Clone(V7_CONFIG),
    terrain,
    actors,
    objects,
    stacks: [],
    resources: [],
    processes: objects
      .filter((o) => Number(o.data.interval) > 0)
      .map((o) => ({
        id: `ripening-${o.id}`,
        handler: 'base.ripening',
        owner: null,
        object: o.id,
        next: 12,
        data: {},
        revision: 'foundation-v7@1',
      })),
    abilities: [],
    satisfaction: [],
    revisions: [],
    state: {},
    events: [],
    nextIdentity: 0,
    identityScope: 'world',
  };
  world = v7Clone(v7Install(world, continuousRegistry(), 'foundation-v7@1'));
  v7Wellbeing(world);
  world.events = [];
  v7Remember(world);
  v7AssertWorld(world);
  return v7Freeze(world);
}
