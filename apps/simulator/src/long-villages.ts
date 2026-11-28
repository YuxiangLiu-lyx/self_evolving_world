import {
  v7Clone,
  v7RoundNumber,
  v7String,
} from '@self-evolving-world/world-core';
import type {
  V7Object,
  V7Point,
  V7World,
} from '@self-evolving-world/world-core';
import {
  CULTURE_SLACK,
  CULTURE_START_RADIUS,
  clearSpot,
  round2,
} from './long-culture.js';
import type { CultureLayout } from './long-culture.js';

/** Frozen budgets of the culture v2 villages run (experiment D): six people for 200 rounds.
 * The first window ends at round 100; `extend exN 200` follows. */
export const LONG_CULTURE_VILLAGES = {
  developments: 16,
  tokens: 3_000_000,
  firstWindow: 100,
  checkpoints: [100, 200],
  /** Three times the v2 per-round computation budget: the map has three times the area, and six
   * long navigations in one round exhaust the v2 budget (an engine limit, not a rule agents see). */
  workPerRound: 6_000_000,
};
/** The wide map: the ex13 neighborhood (48 x 36) on the west, its mirror image on the east and,
 * between them, a meadow that continues the ex13 terrain rule east of x = 31 (rocky north,
 * grass in the middle rows, forest south). See docs/CULTURE_SCENARIO.md, Villages. */
export const VILLAGES = {
  copy: 48,
  width: 144,
  /** Start-ring centre of the west group: the clearing of every culture genesis. The east
   * centre is its mirror image, (130, 15). */
  center: { x: 14, y: 15 },
  startRadius: CULTURE_START_RADIUS,
  groupSize: 3,
  /** Person ids in actor order: the first three start in the west, the last three in the east. */
  groups: [
    ['lin', 'moss', 'sol'],
    ['kai', 'wren', 'ivo'],
  ],
  /** Each east person starts at the mirror image of a west person with a similar leaning:
   * Kai (fairness) of Moss (belonging), Wren (mastery) of Sol (beauty), Ivo (calm) of Lin
   * (freedom). Indices are actor positions. */
  counterparts: [1, 2, 0],
  /** Copied object ids of the east neighborhood: index offsets per ex13 id family. */
  offsets: { start: 3, forest: 3, canopy: 75, cave: 2, waterlogging: 2 },
};
/** Food near each village. Every copied ex13 food plant keeps its kind, place, toxicity and
 * capacity but starts harvested and regrows ten times slower (no unit within 200 rounds).
 * Each person has one berry bush and one root patch at the v2 ring-0 places (radius 3.8,
 * 0.3 rad either side of the start) holding 4 units each and regrowing four times slower
 * than the v2 commons. Per village that is 264 nutrition, about 98 rounds for three people
 * at 0.9 satiety per round; the calculation is in docs/CULTURE_SCENARIO.md, Villages. */
export const VILLAGE_FOOD = {
  plantSlowdown: 10,
  radius: CULTURE_SLACK.foodRadius[0],
  spread: CULTURE_SLACK.foodSpread,
  berry: { stock: 4, interval: CULTURE_SLACK.food.berry.interval * 4 },
  root: { stock: 4, interval: CULTURE_SLACK.food.root.interval * 4 },
};
/** The richer middle area: twice the renewable sources of the culture v2 commons (24 berry
 * bushes and 24 root patches with the commons capacity 20 and growth intervals 5 and 8) in
 * four rows of twelve on the meadow grass, symmetric about x = 72. Nothing points to it. Its
 * regrowth alone (about 7,700 nutrition a year without depletion) exceeds what six people
 * eat (4,320), which the 24 commons sources (about 3,800) do not. */
export const MIDDLE_FOOD = {
  center: { x: 72, y: 21.5 },
  /** Distances east and west of the centre line. */
  columns: [1, 3, 5, 7, 9, 11],
  rows: [18.5, 20.5, 22.5, 24.5],
  food: CULTURE_SLACK.food,
};

const mirrorX = (x: number) => v7RoundNumber(VILLAGES.width - x);
/** The mirror image of a point about the centre line x = width / 2. */
export function villagesMirror(p: V7Point): V7Point {
  return { x: mirrorX(p.x), y: p.y };
}
/** The id of the east copy of an ex13 object, in the ex13 naming scheme. */
function mirrorId(id: string): string {
  const o = VILLAGES.offsets;
  const start = /^start-(\d+)-(.+)$/.exec(id),
    forest = /^forest-(.+)-(\d+)$/.exec(id),
    canopy = /^canopy-(\d+)$/.exec(id),
    cave = /^cave-(\d+)$/.exec(id),
    animal = /^(deer|boar|wolf)-(\d+)-(\d+)$/.exec(id);
  if (start?.[1] && start[2])
    return `start-${String(Number(start[1]) + o.start)}-${start[2]}`;
  if (forest?.[1] && forest[2])
    return `forest-${forest[1]}-${String(Number(forest[2]) + o.forest)}`;
  if (canopy?.[1]) return `canopy-${String(Number(canopy[1]) + o.canopy)}`;
  if (cave?.[1]) return `cave-${String(Number(cave[1]) + o.cave)}`;
  if (animal?.[1] && animal[2] && animal[3])
    return `${animal[1]}-${String(mirrorX(Number(animal[2])))}-${animal[3]}`;
  throw new Error(`No mirror id for ${id}.`);
}
function mirrorObject(object: V7Object): V7Object {
  const s = object.spatial;
  // Every genesis object has angle 0 and left-right symmetric local geometry, so its
  // mirror image is the same shape at the mirrored centre.
  if (s.angle !== 0 || s.entrances.some((e) => e.x !== 0))
    throw new Error(`Object ${object.id} is not mirror-symmetric.`);
  const copy = v7Clone(object);
  copy.id = mirrorId(object.id);
  copy.spatial.x = mirrorX(s.x);
  if (copy.kind === 'animal') {
    copy.data.homeX = mirrorX(Number(copy.data.homeX));
    // A separate herd, so that animals group with their own neighbors only.
    copy.data.group = `${v7String(copy.data.species, 'species')}-2`;
  }
  return copy;
}
function nutritious(world: V7World, object: V7Object): boolean {
  return (
    (world.resources.find((r) => r.id === object.data.resource)?.nutrition ??
      0) > 0
  );
}

/** Widen a long-fixes-shaped genesis into the villages map (in place, before the people and
 * their food are placed): terrain, the mirrored neighborhood, harvested ex13 food plants
 * and mirrored hazards. */
export function villagesWorld(world: V7World): V7World {
  const { copy, width } = VILLAGES,
    development = world.config.development;
  if (
    !development ||
    world.config.width !== copy ||
    world.terrain.some((row) => row.length !== copy)
  )
    throw new Error('The villages map copies the 48-wide ex13 neighborhood.');
  world.terrain = world.terrain.map(
    (row) =>
      row +
      (row[copy - 1] ?? '.').repeat(width - 2 * copy) +
      Array.from(row).reverse().join(''),
  );
  world.config.width = width;
  for (const object of world.objects.filter((o) => nutritious(world, o))) {
    const interval =
      Number(object.data.interval ?? 0) * VILLAGE_FOOD.plantSlowdown;
    object.data = { ...object.data, stock: 0, interval, growth: 0 };
    object.visual.state = interval > 0 ? 'growing' : 'exhausted';
  }
  const east = world.objects.map(mirrorObject);
  world.objects = [...world.objects, ...east];
  if (new Set(world.objects.map((o) => o.id)).size !== world.objects.length)
    throw new Error('Mirrored identities collide.');
  development.hazards = [
    ...development.hazards,
    ...development.hazards.map((h) => ({
      ...h,
      id: h.id.startsWith('west-drought-')
        ? h.id.replace('west-', 'east-')
        : h.id.replace(/(\d+)$/, (n) =>
            String(Number(n) + VILLAGES.offsets.waterlogging),
          ),
      x: mirrorX(h.x),
    })),
  ];
  return world;
}

/** The exact point, which must already be clear for a body of `radius` with `gap`. */
function exactSpot(world: V7World, p: V7Point, radius: number, gap: number) {
  const spot = clearSpot(world, p, radius, gap);
  if (!spot || spot.x !== p.x || spot.y !== p.y)
    throw new Error(
      `The mirrored point (${String(p.x)}, ${String(p.y)}) is not clear.`,
    );
  return spot;
}
function food(
  world: V7World,
  id: string,
  resource: 'berry' | 'root',
  at: V7Point,
  stock: number,
  interval: number,
): V7Object {
  const template = world.objects.find(
    (o) =>
      o.id === (resource === 'berry' ? 'start-0-berries' : 'start-0-roots'),
  );
  if (!template) throw new Error('Missing authored food template.');
  const object: V7Object = v7Clone(template);
  object.id = id;
  object.spatial.x = at.x;
  object.spatial.y = at.y;
  object.visual.state = 'ready';
  object.data = {
    ...object.data,
    stock,
    capacity: stock,
    interval,
    growth: 0,
    produced: 0,
  };
  return object;
}
function ringAngle(i: number) {
  return (i * 2 * Math.PI) / VILLAGES.groupSize;
}
/** People and food of the villages genesis. West starts lie on the v2 ring (radius 2.2,
 * 120 degrees apart) around the clearing; east starts are exact mirror images. */
export const VILLAGES_LAYOUT: CultureLayout = {
  start(world, i, count) {
    const west = VILLAGES.groupSize;
    if (count !== 2 * west) throw new Error('The villages hold six people.');
    if (i < west)
      return {
        x: round2(
          VILLAGES.center.x + Math.cos(ringAngle(i)) * VILLAGES.startRadius,
        ),
        y: round2(
          VILLAGES.center.y + Math.sin(ringAngle(i)) * VILLAGES.startRadius,
        ),
      };
    const counterpart = world.actors[VILLAGES.counterparts[i - west] ?? -1];
    if (!counterpart) throw new Error('Missing west counterpart.');
    return villagesMirror(counterpart.position);
  },
  food(world) {
    const west = VILLAGES.groupSize,
      larder: V7Object[] = [];
    for (let i = 0; i < west; i++)
      for (const [resource, offset] of [
        ['berry', -VILLAGE_FOOD.spread],
        ['root', VILLAGE_FOOD.spread],
      ] as const) {
        const angle = ringAngle(i) + offset,
          spot = clearSpot(
            world,
            {
              x: round2(
                VILLAGES.center.x + Math.cos(angle) * VILLAGE_FOOD.radius,
              ),
              y: round2(
                VILLAGES.center.y + Math.sin(angle) * VILLAGE_FOOD.radius,
              ),
            },
            0.65,
            1,
          );
        if (!spot) throw new Error('No clear village food site.');
        const object = food(
          world,
          `commons-${resource}-${String(i)}-0`,
          resource,
          spot,
          VILLAGE_FOOD[resource].stock,
          VILLAGE_FOOD[resource].interval,
        );
        world.objects.push(object);
        larder.push(object);
      }
    VILLAGES.counterparts.forEach((c, j) => {
      for (const source of larder.filter((o) =>
        o.id.endsWith(`-${String(c)}-0`),
      )) {
        const resource = source.data.resource === 'berry' ? 'berry' : 'root';
        world.objects.push(
          food(
            world,
            `commons-${resource}-${String(west + j)}-0`,
            resource,
            exactSpot(world, villagesMirror(source.spatial), 0.65, 1),
            VILLAGE_FOOD[resource].stock,
            VILLAGE_FOOD[resource].interval,
          ),
        );
      }
    });
    const counts = { berry: 0, root: 0 };
    MIDDLE_FOOD.rows.forEach((y, row) => {
      for (const dx of [
        ...[...MIDDLE_FOOD.columns].reverse().map((d) => -d),
        ...MIDDLE_FOOD.columns,
      ]) {
        const resource =
          (MIDDLE_FOOD.columns.indexOf(Math.abs(dx)) + row) % 2 === 0
            ? 'berry'
            : 'root';
        world.objects.push(
          food(
            world,
            `wild-${resource}-${String(counts[resource]++)}`,
            resource,
            exactSpot(world, { x: MIDDLE_FOOD.center.x + dx, y }, 0.65, 1),
            MIDDLE_FOOD.food[resource].capacity,
            MIDDLE_FOOD.food[resource].interval,
          ),
        );
      }
    });
  },
};
