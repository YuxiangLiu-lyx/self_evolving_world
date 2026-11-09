import { isVisible } from './world.js';
import type { WorldState } from './world.js';
import type {
  Cell,
  EnvironmentObject,
  LearningEnvironment,
  Resource,
  ResourceKind,
} from './learning-types.js';
import {
  boundedText,
  count,
  dataObject,
  exactKeys,
  freeze,
  list,
  resourceKind,
} from './skill-code.js';

export const RESOURCE_PROPERTIES: Readonly<
  Record<
    ResourceKind,
    { nutrition: number; toxicity: number; durability: number }
  >
> = freeze({
  fruit: { nutrition: 24, toxicity: 0, durability: 0 },
  'poison-fruit': { nutrition: 12, toxicity: 35, durability: 0 },
  branch: { nutrition: 0, toxicity: 0, durability: 0 },
  stone: { nutrition: 0, toxicity: 0, durability: 0 },
  timber: { nutrition: 0, toxicity: 0, durability: 0 },
  fish: { nutrition: 30, toxicity: 5, durability: 0 },
  rod: { nutrition: 0, toxicity: 0, durability: 3 },
  axe: { nutrition: 0, toxicity: 0, durability: 3 },
});
export function resource(
  id: string,
  kind: ResourceKind,
  quantity: number,
): Resource {
  return freeze({ id, kind, quantity, ...RESOURCE_PROPERTIES[kind] });
}
export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}
export function parseEnvironment(
  input: unknown,
  world: WorldState,
): LearningEnvironment {
  const e = dataObject(input);
  exactKeys(e, ['era', 'river', 'shallows', 'objects', 'resources']);
  if (e.era !== 'primitive')
    throw new RangeError('Only the primitive era is supported.');
  const cell = (input: unknown): Cell => {
    const p = dataObject(input);
    exactKeys(p, ['x', 'y']);
    return {
      x: count(p.x, 0, world.settings.width - 1),
      y: count(p.y, 0, world.settings.height - 1),
    };
  };
  const river = list(e.river, 4096).map(cell),
    shallows = list(e.shallows, 4096).map(cell);
  if (
    [river, shallows].some(
      (cells) =>
        new Set(cells.map((p) => `${String(p.x)},${String(p.y)}`)).size !==
        cells.length,
    ) ||
    shallows.some((p) => !river.some((r) => sameCell(r, p)))
  )
    throw new RangeError('Invalid river or shallow cells.');
  const objects = list(e.objects, 128).map((input): EnvironmentObject => {
    const o = dataObject(input);
    exactKeys(o, ['id', 'kind', 'position', 'stock']);
    const kind = o.kind;
    if (kind !== 'tree' && kind !== 'rock' && kind !== 'fishery')
      throw new RangeError('Unknown environment object.');
    const stock = dataObject(o.stock);
    const allowed =
      kind === 'tree'
        ? ['fruit', 'branch', 'timber']
        : kind === 'rock'
          ? ['stone']
          : ['fish'];
    if (
      !Object.keys(stock).length ||
      Object.keys(stock).some((k) => !allowed.includes(k))
    )
      throw new RangeError('Object stock does not match its material.');
    const position = cell(o.position);
    if (kind === 'fishery' && !river.some((r) => sameCell(r, position)))
      throw new RangeError('A fishery requires a river cell.');
    return {
      id: boundedText(o.id, 80),
      kind,
      position,
      stock: Object.fromEntries(
        Object.entries(stock).map(([k, n]) => [k, count(n, 1, 30)]),
      ),
    };
  });
  const resources = list(e.resources, 256).map((input): Resource => {
    const r = dataObject(input);
    exactKeys(r, [
      'id',
      'kind',
      'quantity',
      'nutrition',
      'toxicity',
      'durability',
    ]);
    const kind = resourceKind(r.kind),
      expected = RESOURCE_PROPERTIES[kind];
    if (
      r.nutrition !== expected.nutrition ||
      r.toxicity !== expected.toxicity ||
      r.durability !== expected.durability
    )
      throw new RangeError(
        'Resource properties must match immutable learning-v1 rules.',
      );
    return resource(boundedText(r.id, 80), kind, count(r.quantity, 1, 30));
  });
  const ids = [
    ...world.agents.map((a) => a.id),
    ...world.items.map((i) => i.id),
    ...objects.map((o) => o.id),
  ];
  if (
    new Set(ids).size !== ids.length ||
    new Set(resources.map((r) => r.id)).size !== resources.length ||
    resources.length !== world.items.length ||
    world.items.some((i) => !resources.some((r) => r.id === i.id))
  )
    throw new RangeError('Environment and item identities disagree.');
  const env: LearningEnvironment = freeze({
    era: 'primitive',
    river,
    shallows,
    objects,
    resources,
  });
  if (world.agents.some((a) => !walkable(env, a.position)))
    throw new RangeError('An actor starts on blocked terrain.');
  return env;
}
export function walkable(env: LearningEnvironment, position: Cell): boolean {
  if (
    env.river.some((p) => sameCell(p, position)) &&
    !env.shallows.some((p) => sameCell(p, position))
  )
    return false;
  return !env.objects.some(
    (o) => o.kind !== 'fishery' && sameCell(o.position, position),
  );
}
export function visibleEnvironment(world: WorldState, agentId: string) {
  const actor = world.agents.find((a) => a.id === agentId),
    learning = world.learning;
  if (!actor || !learning)
    throw new RangeError('Missing learning observation.');
  const visible = (p: Cell) =>
    isVisible(actor.position, p, world.settings.visionRadius);
  const own = new Set(actor.inventory.map((i) => i.id));
  const ground = new Set(
    world.items.filter((i) => visible(i.position)).map((i) => i.id),
  );
  return freeze({
    era: learning.environment.era,
    river: learning.environment.river.filter(visible),
    shallows: learning.environment.shallows.filter(visible),
    objects: learning.environment.objects.filter((o) => visible(o.position)),
    resources: learning.environment.resources.filter(
      (r) => own.has(r.id) || ground.has(r.id),
    ),
  });
}
