import {
  V7_CONFIG,
  FOREST_BASE,
  continuousRegistry,
  v7Install,
  v7Clone,
  v7Remember,
  v7Wellbeing,
  v7Freeze,
  v7AssertWorld,
  v7SegmentClear,
  v7Obstacles,
  v7Distance,
} from '@self-evolving-world/world-core';
import type {
  V7Configuration,
  V7Object,
  V7World,
} from '@self-evolving-world/world-core';
import { initialContinuousWorld } from './continuous-scenario.js';

export const FOREST_CONFIG: V7Configuration = {
  ...V7_CONFIG,
  width: 48,
  height: 36,
  hunger: 0.65,
  starvation: 8,
  forest: { version: 1, day: 80, year: 800, respawnSatiety: 80, lives: 3 },
};

/** Genesis only. No policy, proposed activity or feasibility route enters the real experiment. */
export function initialForestWorld(): V7World {
  const world = v7Clone(initialContinuousWorld());
  world.config = v7Clone(FOREST_CONFIG);
  world.terrain = Array.from({ length: 36 }, (_, y) =>
    Array.from({ length: 48 }, (_, x) => {
      const river = 25 + Math.round(2 * Math.sin(y / 7));
      if (Math.abs(x - river) < 1.4)
        return [12, 13, 24, 25].includes(y) ? '=' : '~';
      if (Math.abs(x - river) < 4 || (x > 17 && x < 24 && y > 16 && y < 24))
        return ',';
      if (x > 31 && y < 17) return ':';
      if (x < 15 || y > 25) return 'f';
      return '.';
    }).join(''),
  );
  const starts = [
    { x: 8.5, y: 10.5 },
    { x: 18.5, y: 12.5 },
    { x: 14.5, y: 22.5 },
  ];
  world.actors.forEach((actor, i) => {
    actor.position = starts[i] ?? { x: 8.5, y: 10.5 };
    actor.life = {
      total: 3,
      deaths: 0,
      spawn: { ...actor.position },
      lastDeath: null,
    };
    actor.memory = {
      cells: [],
      objects: [],
      stacks: [],
      experiences: [],
      important: [],
      discoveries: {
        berry: { nutrition: 8, toxicity: 0 },
        root: { nutrition: 14, toxicity: 0 },
      },
      notes: [],
      preferences: [],
    };
  });
  world.objects = [];
  world.processes = [];
  world.resources = [];
  world.abilities = [];
  world.revisions = [];
  world.satisfaction = [];
  world.state = { season: 'spring', environment: 'forest-v1' };
  world.events = [];
  const source = (
    id: string,
    resource: string,
    x: number,
    y: number,
    stock: number,
    growth = 0,
  ): void => {
    const r = FOREST_BASE.resources.find((r) => r.id === resource);
    if (!r) throw new Error('Missing authored resource.');
    const tree = ['branch', 'bark', 'oak', 'birch', 'willow', 'resin'].includes(
      resource,
    );
    const rock = ['stone', 'flint'].includes(resource);
    const object: V7Object = {
      id,
      name: r.name,
      kind: tree ? 'tree' : rock ? 'rock' : 'plant',
      spatial: {
        x,
        y,
        angle: 0,
        shape: { kind: 'circle', radius: tree ? 0.42 : rock ? 0.36 : 0.25 },
        solid: tree || rock,
        interaction: 0.65,
        entrances: [],
      },
      visual: {
        component: tree ? 'tree' : rock ? 'rock' : 'plant',
        color: tree ? '#48674b' : r.color,
        accent: r.color,
        label: r.name,
        state: 'ready',
      },
      data: {
        resource,
        stock,
        capacity: stock,
        interval: growth,
        growth: 0,
        produced: 0,
      },
      createdBy: null,
      createdAt: 0,
      revision: 'foundation-forest@1',
    };
    if (
      !v7SegmentClear(
        object.spatial,
        object.spatial,
        0.65,
        v7Obstacles(world),
      ) ||
      world.actors.some((a) => v7Distance(a.position, object.spatial) < 1)
    )
      return;
    world.objects.push(object);
  };
  starts.forEach((p, i) => {
    source(`start-${String(i)}-berries`, 'berry', p.x - 1.8, p.y - 1.3, 5, 12);
    source(`start-${String(i)}-roots`, 'root', p.x + 1.6, p.y + 1.5, 6, 18);
    source(`start-${String(i)}-nuts`, 'hazelnut', p.x - 3.1, p.y + 2, 5, 28);
    source(`start-${String(i)}-branches`, 'branch', p.x + 2, p.y - 2.1, 9);
    source(`start-${String(i)}-stone`, 'stone', p.x - 3.5, p.y - 2, 7);
  });
  FOREST_BASE.resources.forEach((r, i) => {
    for (let n = 0; n < 3; n++) {
      let x = 3.2 + ((i * 7 + n * 11) % 41),
        y = 3.3 + ((i * 5 + n * 13) % 28);
      if (r.id === 'fish') {
        y = n === 1 ? 24.5 : 12.3 + n * 0.4;
        x = 25 + Math.round(2 * Math.sin(y / 7)) + (n - 1) * 0.6;
      } else if (['reed', 'clay', 'sand', 'willow', 'tuber'].includes(r.id)) {
        x = 25 + Math.round(2 * Math.sin(y / 7)) + (n % 2 ? 2.8 : -2.8);
      } else if (['flint', 'stone'].includes(r.id)) {
        x = 33.2 + n * 4;
        y = 3.3 + ((i * 3 + n * 4) % 12);
      } else if (['mushroom', 'red-fungus', 'moss'].includes(r.id)) {
        x = 3.2 + n * 4;
        y = 16.3 + ((i + n * 3) % 10);
      }
      source(
        `forest-${r.id}-${String(n)}`,
        r.id,
        x,
        y,
        r.nutrition > 0 ? 4 + (i % 4) : 7 + (i % 6),
        r.nutrition > 0 && r.id !== 'fish' ? 15 + (i % 13) : 0,
      );
    }
  });
  for (let n = 0; n < 75; n++) {
    const x = 2.4 + ((n * 17) % 43),
      y = 2.2 + ((n * 11) % 31);
    if (
      world.terrain[Math.floor(y)]?.[Math.floor(x)] === 'f' &&
      starts.every((p) => v7Distance(p, { x, y }) > 3)
    )
      source(`canopy-${String(n)}`, 'branch', x, y, 2);
  }
  // Reserve genuine enterable interiors; no hidden teleport or separate simulation map.
  for (const [i, x, y] of [
    [1, 35, 8],
    [2, 6, 29],
  ]) {
    if (i === undefined || x === undefined || y === undefined) continue;
    world.objects = world.objects.filter(
      (o) => Math.abs(o.spatial.x - x) > 3.3 || Math.abs(o.spatial.y - y) > 3.3,
    );
    world.objects.push({
      id: `cave-${String(i)}`,
      kind: 'cave',
      name: 'Rock cave',
      spatial: {
        x,
        y,
        angle: 0,
        shape: { kind: 'rectangle', width: 5, height: 4 },
        solid: false,
        reserved: true,
        interaction: 0.65,
        entrances: [{ x: 0, y: 2 }],
        enclosure: { wall: 0.45, doorway: 1.6, roof: '#626c64' },
      },
      visual: {
        component: 'cave',
        color: '#72796b',
        accent: '#b3b598',
        label: 'Cave entrance',
        state: 'natural',
      },
      data: { insulation: 2, buffering: 0.72 },
      createdBy: null,
      createdAt: 0,
      revision: 'foundation-forest@1',
    });
  }
  for (const [species, x, y] of [
    ['deer', 18, 28],
    ['deer', 8, 18],
    ['boar', 32, 23],
    ['wolf', 40, 18],
    ['wolf', 39, 29],
  ] as const)
    world.objects.push({
      id: `${species}-${String(x)}-${String(y)}`,
      kind: 'animal',
      name:
        species === 'wolf'
          ? 'Forest wolf'
          : species === 'boar'
            ? 'Wild boar'
            : 'Roe deer',
      spatial: {
        x,
        y,
        angle: 0,
        shape: { kind: 'circle', radius: 0.35 },
        solid: false,
        interaction: 0.65,
        entrances: [],
      },
      visual: {
        component: 'animal',
        color:
          species === 'wolf'
            ? '#92958e'
            : species === 'boar'
              ? '#665c4d'
              : '#b69a6a',
        accent: '#dfcfac',
        label: species,
        state: 'foraging',
      },
      data: { species, mode: 'foraging', homeX: x, homeY: y },
      createdBy: null,
      createdAt: 0,
      revision: 'foundation-forest@1',
    });
  const installed = v7Clone(
    v7Install(world, continuousRegistry(), 'foundation-forest@1'),
  );
  installed.actors.forEach((a) => {
    a.mastered = FOREST_BASE.abilities.map((b) => b.id);
  });
  v7Wellbeing(installed);
  installed.events = [];
  v7Remember(installed);
  v7AssertWorld(installed);
  return v7Freeze(installed);
}
