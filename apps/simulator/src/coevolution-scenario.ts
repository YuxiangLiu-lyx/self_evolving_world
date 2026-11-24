import {
  COEVOLUTION_CONFIG,
  createCoevolutionWorld,
} from '@self-evolving-world/world-core';
import type {
  WorldSetup,
  CoevolutionEnvironment,
  EStack,
  CSite,
} from '@self-evolving-world/world-core';
export const COEVOLUTION_SETUP: WorldSetup = {
  settings: { width: 24, height: 24, visionRadius: 5 },
  agents: [
    { id: 'lin', name: 'Lin', position: { x: 6, y: 8 } },
    { id: 'moss', name: 'Moss', position: { x: 14, y: 8 } },
    { id: 'sol', name: 'Sol', position: { x: 10, y: 12 } },
  ],
};
export function coevolutionEnvironment(): CoevolutionEnvironment {
  const terrain = Array.from({ length: 24 }, (_, y) =>
    Array.from({ length: 24 }, (_, x) =>
      x === 19
        ? y === 8 || y === 14
          ? 'S'
          : 'W'
        : x === 18
          ? 'B'
          : x < 9 && y < 14
            ? 'F'
            : y > 13 && x < 15
              ? 'R'
              : x < 6 && y > 16
                ? 'M'
                : 'G',
    ).join(''),
  );
  const types = [
    {
      id: 'berry',
      name: 'Berry',
      appearance: 'Small ripe berries',
      nutrition: 18,
      toxicity: 0,
      durability: 0,
    },
    {
      id: 'root',
      name: 'Edible root',
      appearance: 'Firm pale roots',
      nutrition: 18,
      toxicity: 0,
      durability: 0,
    },
    {
      id: 'branch',
      name: 'Fallen branch',
      appearance: 'Dry woody lengths',
      nutrition: 0,
      toxicity: 0,
      durability: 0,
    },
    {
      id: 'stone',
      name: 'Loose stone',
      appearance: 'Rough hard fragments',
      nutrition: 0,
      toxicity: 0,
      durability: 0,
    },
  ];
  const stacks: EStack[] = [],
    sites: CSite[] = [];
  const foodPoints = [
    [5, 8],
    [7, 8],
    [6, 6],
    [4, 7],
    [8, 5],
    [4, 10],
    [7, 11],
    [3, 5],
    [13, 8],
    [15, 8],
    [14, 6],
    [16, 7],
    [12, 5],
    [16, 10],
    [13, 11],
    [17, 5],
    [9, 12],
    [11, 12],
    [10, 14],
    [8, 15],
    [12, 15],
    [7, 14],
    [13, 14],
    [10, 17],
  ] as const;
  for (const [i, p] of foodPoints.entries())
    stacks.push({
      id: `food-${String(i + 1)}`,
      type: i < 16 ? 'berry' : 'root',
      quantity: 3,
      durability: 0,
      owner: null,
      position: { x: p[0], y: p[1] },
    });
  for (const [i, p] of [
    [5, 9],
    [15, 9],
    [9, 13],
    [11, 9],
    [8, 7],
    [12, 11],
  ].entries()) {
    const x = p[0] ?? 0,
      y = p[1] ?? 0;
    stacks.push({
      id: `material-${String(i + 1)}`,
      type: i % 2 ? 'stone' : 'branch',
      quantity: 4,
      durability: 0,
      owner: null,
      position: { x, y },
    });
  }
  for (const [i, p] of [
    [4, 8],
    [8, 9],
    [6, 4],
    [14, 4],
    [16, 9],
    [8, 13],
    [12, 13],
    [10, 16],
    [19, 7],
    [19, 11],
  ].entries()) {
    const x = p[0] ?? 0,
      y = p[1] ?? 0,
      kind = x === 19 ? 'water' : i % 3 === 1 ? 'rock' : 'tree';
    sites.push({
      id: `site-${String(i + 1)}`,
      kind,
      appearance:
        kind === 'water'
          ? 'Shallow-edged river reach'
          : kind === 'rock'
            ? 'Exposed stone formation'
            : 'Standing woody growth',
      position: { x, y },
      capacity: 4,
      energyLimit: 24,
      allocation: null,
      stock:
        kind === 'water' ? {} : kind === 'rock' ? { stone: 6 } : { branch: 6 },
    });
  }
  return {
    seed: COEVOLUTION_CONFIG.seed,
    terrain,
    types,
    stacks,
    sites,
    ecology: [],
  };
}
export function initialCoevolutionWorld() {
  return createCoevolutionWorld(COEVOLUTION_SETUP, coevolutionEnvironment());
}
