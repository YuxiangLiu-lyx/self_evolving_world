import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7Object,
  V7Package,
  V7World,
} from './continuous-types.js';
import {
  v7Id,
  v7Number,
  v7Record,
  v7RoundNumber,
  v7Signature,
  v7String,
} from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7Reach,
  v7ShapesOverlap,
  v7ShapeDistance,
} from './continuous-geometry.js';

const revision = 'stone-mosaic@1';
const workKind = 'stone-mosaic-work';
const finishedKind = 'stone-mosaic';
function spend(actor: V7Actor, energy: number): void {
  if (actor.vitals.energy < energy)
    throw new Error(`Mosaic work needs ${String(energy)} energy.`);
  actor.vitals.energy = v7RoundNumber(actor.vitals.energy - energy);
}
function returnStones(
  world: V7World,
  object: V7Object,
  owner: V7Actor | undefined,
): number {
  if (!Array.isArray(object.data.contents))
    throw new Error('Missing conserved mosaic contents.');
  let count = 0;
  for (const raw of object.data.contents) {
    const content = v7Record(raw),
      quantity = v7Number(content.quantity, 'escrow quantity', 1);
    world.stacks.push({
      id: v7Id(world, 'item'),
      resource: 'stone',
      quantity,
      origin: v7String(content.origin, 'stone origin'),
      owner: owner?.id ?? null,
      position: owner
        ? { ...owner.position }
        : { x: object.spatial.x, y: object.spatial.y },
    });
    count += quantity;
  }
  world.objects = world.objects.filter((o) => o.id !== object.id);
  return count;
}
function validateSite(world: V7World, actor: V7Actor, object: V7Object): void {
  if (
    actor.vitals.satiety <= 0 ||
    v7Distance(actor.position, object.spatial) > 0.65 + 1e-8 ||
    v7Distance(actor.position, object.spatial) + 0.5 > world.config.vision ||
    !v7Inside(world, object.spatial, 0.5)
  )
    throw new Error(
      'Mosaic work requires positive satiety and a visible, reachable placement disk inside world bounds.',
    );
  if (
    world.objects.some(
      (o) => o.id !== object.id && v7ShapesOverlap(object.spatial, o.spatial),
    )
  )
    throw new Error(
      'The mosaic disk overlaps solid geometry or a reserved arrangement.',
    );
  if (
    world.actors.some(
      (a) =>
        a.id !== actor.id &&
        v7Distance(a.position, object.spatial) < a.radius + 0.5,
    )
  )
    throw new Error('Another participant occupies the mosaic work area.');
  for (
    let y = Math.floor(object.spatial.y - 0.5);
    y <= Math.floor(object.spatial.y + 0.5);
    y++
  )
    for (
      let x = Math.floor(object.spatial.x - 0.5);
      x <= Math.floor(object.spatial.x + 0.5);
      x++
    )
      if (
        world.terrain[y]?.[x] === '~' &&
        v7ShapeDistance(object.spatial, {
          x: x + 0.5,
          y: y + 0.5,
          angle: 0,
          solid: true,
          shape: { kind: 'rectangle', width: 1, height: 1 },
          interaction: 0,
          entrances: [],
        }) < 0.5
      )
        throw new Error('Mosaics need exposed ground, not water.');
}
/** A registered target extension of pickup; all historical pickup paths remain unchanged. */
export function v7MosaicPickup(
  context: Pick<V7ActionContext, 'world' | 'actor' | 'action' | 'emit'>,
): boolean {
  const { world, actor, action, emit } = context;
  if (!world.revisions.includes(revision)) return false;
  const object = world.objects.find(
    (o) => o.id === action.args.target && o.kind === finishedKind,
  );
  if (!object) return false;
  if (object.createdBy !== actor.id || !v7Reach(actor, object.spatial))
    throw new Error(
      'Only the creator within interaction reach can dismantle this mosaic.',
    );
  const total = Number(object.data.units);
  if (action.args.quantity !== total)
    throw new Error(
      `Dismantling requires pickup of all ${String(total)} committed stone units atomically.`,
    );
  const mass = world.resources.find((r) => r.id === 'stone')?.mass;
  if (mass === undefined) throw new Error('Missing registered stone material.');
  spend(actor, 1 + total * mass * 0.2);
  returnStones(world, object, actor);
  emit(
    'mosaic_dismantled',
    `Dismantled the mosaic and recovered ${String(total)} original stone units.`,
    { quantity: total, resource: 'stone' },
    object.id,
  );
  return true;
}
export const V7_MOSAIC: V7Package = {
  id: 'stone-mosaic',
  version: 1,
  dependencies: ['foundation-v7@1'],
  description:
    'Material-conserving three-round ground arrangement with interruptible escrow and creator pickup recovery.',
  resources: [],
  satisfaction: [],
  visualComponents: ['stone-mosaic'],
  abilities: [
    {
      id: 'arrange_stone_mosaic',
      name: 'Arrange a small stone mosaic',
      function:
        'Arrange owned stones on nearby ground into a persistent inspectable mosaic.',
      equivalence:
        'stone:escrow:stationary-three-round-arrangement:recoverable-ground-art',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          offsets: {
            type: 'array',
            items: {
              type: 'object',
              properties: { dx: { type: 'number' }, dy: { type: 'number' } },
              required: ['dx', 'dy'],
              additionalProperties: false,
            },
          },
        },
        required: ['x', 'y', 'offsets'],
        additionalProperties: false,
      },
      prerequisites: [],
      learning: 2,
      costs:
        'Two to eight owned stone units, three consecutive stationary rounds at two energy each, positive satiety. Initiation requires six energy. Placement center within 0.65; offsets within radius 0.5 and at least 0.16 apart.',
      effects:
        'Creates a walkable reserved mosaic after complete paid work. Interruption returns escrow without energy refund. No happiness or facility effect. Creator may dismantle using pickup(target=mosaic ID, quantity=all committed units) at ordinary pickup mass cost.',
      handler: 'mosaic.arrange@1',
      revision,
      authored: false,
    },
  ],
  handlers: {
    'mosaic.arrange@1': ({ world, actor, action, emit }) => {
      if (
        !Array.isArray(action.args.offsets) ||
        action.args.offsets.length < 2 ||
        action.args.offsets.length > 8
      )
        throw new Error('A small mosaic requires two to eight stone offsets.');
      const offsets = action.args.offsets.map((raw) => {
        const o = v7Record(raw);
        return {
          dx: v7Number(o.dx, 'stone dx'),
          dy: v7Number(o.dy, 'stone dy'),
        };
      });
      if (
        offsets.some(
          (o, i) =>
            Math.hypot(o.dx, o.dy) > 0.5 ||
            offsets
              .slice(i + 1)
              .some((p) => Math.hypot(o.dx - p.dx, o.dy - p.dy) < 0.16),
        )
      )
        throw new Error(
          'Stone centers must fit the disk and remain at least 0.16 apart.',
        );
      let object = world.objects.find(
        (o) => o.kind === workKind && o.createdBy === actor.id,
      );
      if (
        object &&
        (object.data.lastTick !== world.tick - 1 ||
          object.data.actorX !== actor.position.x ||
          object.data.actorY !== actor.position.y ||
          object.data.arguments !== v7Signature(action.args))
      )
        throw new Error(
          'Mosaic work must continue stationary with the same arrangement.',
        );
      if (!object) {
        if (actor.vitals.energy < 6)
          throw new Error('Starting a mosaic requires six energy.');
        object = {
          id: v7Id(world, 'mosaic'),
          kind: workKind,
          name: 'Stone mosaic in progress',
          spatial: {
            x: v7Number(action.args.x, 'placement x'),
            y: v7Number(action.args.y, 'placement y'),
            angle: 0,
            shape: { kind: 'circle', radius: 0.5 },
            solid: false,
            reserved: true,
            interaction: 0.65,
            entrances: [],
          },
          visual: {
            component: 'stone-mosaic',
            color: '#8c9690',
            accent: '#ded6b8',
            label: 'Stone mosaic',
            state: 'working-1',
          },
          data: {
            offsets,
            units: offsets.length,
            contents: [],
            elapsed: 0,
            startTick: world.tick,
            arguments: v7Signature(action.args),
            actorX: actor.position.x,
            actorY: actor.position.y,
          },
          createdBy: actor.id,
          createdAt: world.tick,
          revision,
        };
        validateSite(world, actor, object);
        const contents: V7Data[] = [];
        let needed = offsets.length;
        for (const stack of world.stacks
          .filter((s) => s.owner === actor.id && s.resource === 'stone')
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
          const quantity = Math.min(needed, stack.quantity);
          if (quantity > 0) {
            contents.push({ quantity, origin: stack.origin, source: stack.id });
            stack.quantity -= quantity;
            needed -= quantity;
          }
        }
        if (needed)
          throw new Error(
            'Insufficient personally owned stone units for the requested arrangement.',
          );
        object.data.contents = contents;
        world.objects.push(object);
        world.processes.push({
          id: v7Id(world, 'mosaic-work'),
          handler: 'mosaic.interruption@1',
          owner: actor.id,
          object: object.id,
          next: world.tick,
          data: {},
          revision,
        });
      }
      validateSite(world, actor, object);
      spend(actor, 2);
      object.data.elapsed = Number(object.data.elapsed) + 1;
      object.data.lastTick = world.tick;
      if (object.data.elapsed === 3) {
        object.kind = finishedKind;
        object.name = 'Stone mosaic';
        object.createdAt = world.tick;
        object.visual.state = 'completed';
        emit(
          'mosaic_completed',
          `Completed a stone mosaic with ${String(offsets.length)} conserved stone units after three work rounds.`,
          {
            units: offsets.length,
            contents: object.data.contents ?? [],
            startTick: object.data.startTick ?? world.tick,
            endTick: world.tick,
          },
          object.id,
        );
        return { complete: true, writes: [] };
      }
      object.visual.state = `working-${String(object.data.elapsed)}`;
      emit(
        'mosaic_progress',
        `Arranged stone work: ${String(object.data.elapsed)} of three rounds, two energy spent.`,
        { elapsed: object.data.elapsed, units: offsets.length },
        object.id,
      );
      return { complete: false, writes: [] };
    },
  },
  processes: {
    'mosaic.interruption@1': (world, process) => {
      const object = world.objects.find((o) => o.id === process.object);
      if (object?.kind === workKind) {
        const actor = world.actors.find((a) => a.id === process.owner);
        let valid = !!actor && object.data.lastTick === world.tick;
        if (actor && valid) {
          try {
            validateSite(world, actor, object);
          } catch {
            valid = false;
          }
        }
        if (!valid) {
          const count = returnStones(world, object, actor);
          world.events.push({
            id: v7Id(world, 'event'),
            tick: world.tick,
            actor: actor?.id ?? null,
            type: 'mosaic_cancelled',
            interface: 'arrange_stone_mosaic',
            success: false,
            description: `Mosaic work interrupted; returned ${String(count)} escrowed stones without refunding energy.`,
            position: { x: object.spatial.x, y: object.spatial.y },
            target: object.id,
            data: { units: count, elapsed: object.data.elapsed ?? 0 },
          });
        } else {
          process.next = world.tick + 1;
          return;
        }
      }
      world.processes = world.processes.filter((p) => p.id !== process.id);
    },
  },
};
