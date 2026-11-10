import {
  createEvolutionWorld,
  EVOLUTION_CONFIG,
  seededUnit,
} from '@self-evolving-world/world-core';
import type {
  EResourceType,
  ESite,
  EStack,
} from '@self-evolving-world/world-core';
export const EVOLUTION_OBJECTIVE =
  'Observe heterogeneous autonomous survival and persistent World Agent-designed resource, ecology and mechanic growth across four actors over120 synchronous rounds, retaining failures, deaths, exploration and actual individual experience.';
export const STARTING_REGIONS = {
  lin: 'fruit-potential forest',
  moss: 'riverbank',
  sol: 'rocky terrain',
  reed: 'mushroom-rich damp woodland',
} as const;
export function initialEvolutionWorld() {
  const seed = EVOLUTION_CONFIG.seed,
    width = 48,
    height = 48;
  const terrain = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const river = 27 + (Math.floor(y / 12) % 2);
      if (x === river) return [12, 28, 40].includes(y) ? 'S' : 'W';
      if (Math.abs(x - river) === 1) return 'B';
      if (x < 22 && y < 22) return 'F';
      if (x < 22 && y > 26) return 'R';
      if (x > 29 && y > 26) return 'M';
      return 'G';
    }).join(''),
  );
  const types: EResourceType[] = [
    {
      id: 'fallen-berry',
      name: 'Golden fallen berry',
      appearance: 'Small golden skin, soft pulp',
      nutrition: 16,
      toxicity: 0,
      durability: 0,
    },
    {
      id: 'ochre-cap',
      name: 'Ochre-capped mushroom',
      appearance: 'Ochre cap with fine pale gills',
      nutrition: 18,
      toxicity: 0,
      durability: 0,
    },
    {
      id: 'ivory-cap',
      name: 'Ivory-capped mushroom',
      appearance: 'Ivory cap with a narrow dark ring',
      nutrition: 18,
      toxicity: 18,
      durability: 0,
    },
    {
      id: 'russet-cap',
      name: 'Russet-capped mushroom',
      appearance: 'Russet cap with coarse brown gills',
      nutrition: 22,
      toxicity: 8,
      durability: 0,
    },
    {
      id: 'branch',
      name: 'Dry branch',
      appearance: 'Short dry wooden branch',
      nutrition: 0,
      toxicity: 0,
      durability: 0,
    },
    {
      id: 'stone',
      name: 'Loose stone',
      appearance: 'Palm-sized rough stone',
      nutrition: 0,
      toxicity: 0,
      durability: 0,
    },
  ];
  const stacks: EStack[] = [];
  const ground = (
    id: string,
    type: string,
    x: number,
    y: number,
    quantity = 1,
  ) =>
    stacks.push({
      id,
      type,
      quantity,
      durability: 0,
      owner: null,
      position: { x, y },
    });
  ground('forest-fallen', 'fallen-berry', 9, 8, 2);
  ground('bank-fallen', 'fallen-berry', 24, 11);
  ground('rock-fallen', 'fallen-berry', 11, 32);
  const mushroomPositions = [
    [36, 33],
    [34, 35],
    [37, 36],
    [33, 32],
    [36, 30],
    [32, 35],
  ];
  for (const [i, p] of mushroomPositions.entries()) {
    const x = p[0],
      y = p[1];
    if (x === undefined || y === undefined)
      throw new Error('Invalid scenario coordinate.');
    ground(
      `mushroom-${String(i + 1)}`,
      ['ochre-cap', 'ivory-cap', 'russet-cap'][i % 3] ?? 'ochre-cap',
      x,
      y,
    );
  }
  const sites: ESite[] = [];
  const site = (
    kind: string,
    x: number,
    y: number,
    capacity: number,
    energyLimit: number,
    stock: Readonly<Record<string, number>> = {},
  ) =>
    sites.push({
      id: `${kind}-${String(x)}-${String(y)}`,
      kind,
      appearance:
        kind === 'tree'
          ? 'Leafy standing tree; yield unexamined'
          : kind === 'water'
            ? 'River reach; life beneath surface unexamined'
            : kind === 'fungus'
              ? 'Damp shaded growth bed'
              : 'Exposed rough outcrop',
      position: { x, y },
      capacity,
      energyLimit,
      allocation: null,
      stock,
    });
  for (const [x, y] of [
    [10, 8],
    [8, 11],
    [15, 8],
    [17, 12],
    [13, 16],
    [6, 18],
    [3, 3],
    [18, 3],
    [3, 12],
    [18, 19],
    [35, 8],
    [41, 18],
    [20, 32],
    [39, 43],
  ] as const)
    site('tree', x, y, 2, 30, { branch: 2 });
  for (const y of [10, 18, 26, 34, 42])
    site('water', 27 + (Math.floor(y / 12) % 2), y, 1, 30);
  for (const [x, y] of [
    [7, 34],
    [11, 35],
    [8, 38],
    [14, 31],
    [17, 40],
    [3, 44],
    [6, 28],
    [18, 27],
    [40, 23],
  ] as const)
    site('rock', x, y, 2, 0, { stone: 3 });
  for (const [x, y] of [
    [38, 34],
    [43, 39],
    [34, 42],
    [42, 29],
    [31, 45],
  ] as const)
    site('fungus', x, y, 1, 30);
  for (const [i, [x, y]] of (
    [
      [8, 9],
      [25, 12],
      [10, 34],
      [35, 34],
      [15, 18],
      [23, 25],
      [37, 43],
      [16, 39],
      [31, 18],
      [43, 10],
    ] as const
  ).entries()) {
    ground(`branch-pile-${String(i + 1)}`, 'branch', x, y, 2);
    ground(
      `stone-pile-${String(i + 1)}`,
      'stone',
      x + 1,
      y + 1,
      1 + Math.floor(seededUnit(seed, `stones:${String(i)}`) * 2),
    );
  }
  // Farther resources reward travel without prescribing routes or scheduled milestones.
  for (const [i, [x, y]] of (
    [
      [18, 18],
      [5, 22],
      [21, 36],
      [40, 8],
      [44, 23],
      [31, 43],
    ] as const
  ).entries())
    ground(
      `far-food-${String(i + 1)}`,
      i % 2 ? 'ochre-cap' : 'fallen-berry',
      x,
      y,
      2,
    );
  return createEvolutionWorld(
    {
      settings: { width, height, visionRadius: 5 },
      agents: [
        { id: 'lin', name: 'Lin', position: { x: 8, y: 8 } },
        { id: 'moss', name: 'Moss', position: { x: 25, y: 10 } },
        { id: 'sol', name: 'Sol', position: { x: 9, y: 34 } },
        { id: 'reed', name: 'Reed', position: { x: 35, y: 33 } },
      ],
    },
    { seed, terrain, types, stacks, sites, ecology: [] },
  );
}
