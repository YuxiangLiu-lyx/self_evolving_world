import { preservationOnTray } from './open-preservation-physics.js';
import { geometryGather, geometryTransfer } from './open-material-geometry.js';
import { refugeExposure, refugeRest } from './open-shelter-exposure.js';
import { barkGatherState } from './open-bark-accounting.js';
import { foodUnitMass } from './forest-food-accounting.js';
import { forestResolveReference } from './forest-references.js';
import { forestMeal, forestRestFactor } from './forest-experience.js';
import { foodTenths } from './forest-food-accounting.js';
import type {
  V7Ability,
  V7ActionContext,
  V7HandlerResult,
  V7Package,
  V7Schema,
  V7World,
  V7Actor,
  V7Stack,
  V7Resource,
} from './continuous-types.js';
import { v7Id, v7Number, v7String, v7RoundNumber } from './continuous-data.js';
import { v7Distance, v7Reach } from './continuous-geometry.js';
import { v7MosaicPickup } from './continuous-mosaic.js';

const str: V7Schema = { type: 'string', maxLength: 1000 };
const num: V7Schema = { type: 'number' };
const quantity: V7Schema = { type: 'integer', minimum: 1 };
export const v7ObjectSchema = (
  properties: Record<string, V7Schema>,
): V7Schema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
function ability(
  id: string,
  name: string,
  purpose: string,
  params: Record<string, V7Schema>,
  costs: string,
  effects: string,
  handler = `base.${id}`,
): V7Ability {
  return {
    id,
    name,
    function: purpose,
    equivalence: `base:${id}:1`,
    parameters: v7ObjectSchema(params),
    prerequisites: [],
    learning: 0,
    costs,
    effects,
    handler,
    revision: 'foundation-v7@1',
    authored: true,
  };
}
export function v7Load(world: V7World, actor: V7Actor): number {
  return world.stacks
    .filter(
      (s) =>
        s.owner === actor.id &&
        !preservationOnTray(s) &&
        !(
          world.state.shortRefuge === 1 &&
          s.reservedFor?.startsWith('short:work:')
        ),
    )
    .reduce((n, s) => n + s.quantity * foodUnitMass(world, s), 0);
}
export function v7Spend(actor: V7Actor, amount: number): void {
  v7Number(amount, 'effort', 0);
  if (actor.vitals.energy + 1e-8 < amount)
    throw new Error(
      `Insufficient energy: need ${String(v7RoundNumber(amount))}, have ${String(actor.vitals.energy)}.`,
    );
  actor.vitals.energy = v7RoundNumber(
    Math.max(0, actor.vitals.energy - amount),
  );
}
export function v7Owned(
  world: V7World,
  actor: V7Actor,
  target: string,
): V7Stack {
  if (world.config.experience)
    target = forestResolveReference(world, actor, target, 'owned');
  const stack = world.stacks.find(
    (s) =>
      !s.reservedFor &&
      s.owner === actor.id &&
      (s.id === target || `resource:${s.resource}` === target),
  );
  if (!stack) throw new Error('The requested owned item is unavailable.');
  return stack;
}
export function v7ConsumeMaterials(
  world: V7World,
  actor: V7Actor,
  costs: { resource: string; quantity: number }[],
): void {
  for (const cost of costs) {
    let remaining = cost.quantity;
    for (const stack of world.stacks.filter(
      (s) =>
        !s.reservedFor && s.owner === actor.id && s.resource === cost.resource,
    )) {
      const count = Math.min(stack.quantity, remaining);
      stack.quantity -= count;
      remaining -= count;
    }
    if (remaining > 0) throw new Error(`Missing material: ${cost.resource}.`);
  }
  world.stacks = world.stacks.filter((s) => s.quantity > 0);
}
function done(writes: string[] = []): V7HandlerResult {
  return { complete: true, writes };
}
export const V7_BASE: V7Package = {
  id: 'foundation-v7',
  version: 1,
  description:
    'Authored survival, perception, interaction and navigation interfaces; no mental satisfaction sources.',
  dependencies: [],
  abilities: [
    ability(
      'navigate',
      'Navigate',
      'Travel toward a self-chosen coordinate or known object/item using observed obstacles.',
      { target: str, x: num, y: num },
      'Actual distance times 2, increased by carried mass; speed 0.8 per simulation second.',
      'Continues until within the target interaction area or a real failure. Empty target uses x/y. A resource:ID target selects only a remembered ground stack.',
      'kernel.navigate',
    ),
    ability(
      'rest',
      'Rest',
      'Recover available physical energy at the current position.',
      {},
      'One simulation round.',
      'Base recovery 4, modified by actually accessible registered facilities; capped at 40.',
    ),
    ability(
      'wait',
      'Wait',
      'Allow one simulation round to pass at the current position.',
      {},
      'One simulation round; metabolism continues.',
      'No automatic energy recovery.',
    ),
    ability(
      'pickup',
      'Pick up',
      'Transfer a nearby ground stack into personal inventory.',
      { target: str, quantity },
      '1 + 0.2 times transferred mass energy.',
      'Requires actual distance within pickup reach; resource:ID means a matching nearby visible ground stack.',
    ),
    ability(
      'eat',
      'Eat',
      'Consume an owned edible resource.',
      { target: str, quantity },
      'Consumed food and 1 energy.',
      'Actual nutrition and toxicity apply. Food never directly heals. resource:ID selects an owned stack.',
    ),
    ability(
      'gather',
      'Gather accessible material',
      'Collect exposed ripe food or loose material from a nearby natural source.',
      { target: str, quantity },
      '2 energy per unit, finite current source stock.',
      'Transfers real source stock to inventory; requires the source interaction range. No processing or felling is implied.',
    ),
    ability(
      'drop',
      'Drop',
      'Place owned units on the ground.',
      { target: str, quantity },
      '0.5 energy and transferred units.',
      'Other actors may subsequently collect the ground stack.',
    ),
    ability(
      'give',
      'Give',
      'Hand owned units to an adjacent actor.',
      { target: str, quantity, recipient: str },
      '0.5 energy and transferred units.',
      'Actual recipient identity and distance required; no relationship or happiness is inferred.',
    ),
    ability(
      'message',
      'Message',
      'Send a short message to a currently visible actor.',
      { recipient: str, text: str },
      'One simulation round.',
      'Delivered after the round barrier; recipient text is data, not authority.',
    ),
    ability(
      'learn',
      'Learn a public interface',
      'Study an already implemented ability with its declared prerequisites.',
      { ability: str },
      'The interface-specific number of simulation rounds.',
      'Implementation does not grant mastery. Already mastered interfaces are reused without new rewards.',
      'kernel.learn',
    ),
    ability(
      'request',
      'Request a capability',
      'Describe an intended function and its conditions, inputs, costs and expected real effects for review.',
      {
        name: str,
        function: str,
        conditions: str,
        inputs: str,
        costs: str,
        effects: str,
      },
      'A game round to begin study after review; implementation time does not advance simulation.',
      'World review reuses equivalents or returns a structured development request. No request, learning or descriptive reward.',
      'kernel.request',
    ),
  ],
  satisfaction: [],
  resources: [
    {
      id: 'berry',
      name: 'Ripe berries',
      mass: 0.25,
      nutrition: 18,
      toxicity: 0,
      color: '#ba4b64',
    },
    {
      id: 'root',
      name: 'Edible roots',
      mass: 0.4,
      nutrition: 18,
      toxicity: 0,
      color: '#cfab69',
    },
    {
      id: 'branch',
      name: 'Loose branches',
      mass: 1.2,
      nutrition: 0,
      toxicity: 0,
      color: '#98734f',
    },
    {
      id: 'stone',
      name: 'Loose stone',
      mass: 2,
      nutrition: 0,
      toxicity: 0,
      color: '#8c9a9c',
    },
  ],
  visualComponents: [
    'actor',
    'tree',
    'rock',
    'berry-shrub',
    'root-patch',
    'ground-stack',
  ],
  handlers: {
    'base.rest': ({ world, actor, emit }) => {
      const refuge = refugeExposure(world, actor);
      const bonus =
        (refuge?.bonus ?? 0) +
        Math.max(
          0,
          ...world.objects
            .filter((o) => v7Reach(actor, o.spatial))
            .map((o) =>
              typeof o.data.restBonus === 'number' ? o.data.restBonus : 0,
            ),
        );
      const before = actor.vitals.energy;
      actor.vitals.energy = Math.min(
        world.config.energyCap,
        before +
          (world.config.restRecovery + bonus) * forestRestFactor(world, actor),
      );
      refugeRest(world, actor, refuge, actor.vitals.energy - before);
      emit(
        'rested',
        `Recovered ${String(v7RoundNumber(actor.vitals.energy - before))} energy.`,
        {
          recovered: actor.vitals.energy - before,
          ...(world.config.experience
            ? {
                mentalFactor: forestRestFactor(world, actor),
                nominal: world.config.restRecovery + bonus,
              }
            : {}),
          bonus: Math.max(
            0,
            actor.vitals.energy - before - world.config.restRecovery,
          ),
        },
      );
      return done();
    },
    'base.wait': ({ emit }) => {
      emit('waited', 'Waited one simulation round.');
      return done();
    },
    'base.pickup': ({ world, actor, action, emit }) => {
      if (v7MosaicPickup({ world, actor, action, emit })) return done();
      const target = v7String(action.args.target, 'target'),
        n = v7Number(
          action.args.quantity,
          'quantity',
          world.state.foodAssessment === 1 || !!world.config.development
            ? 0.1
            : 1,
        );
      if (world.state.foodAssessment === 1 || !!world.config.development)
        foodTenths(n);
      const stack = world.stacks
        .filter(
          (s) =>
            s.owner === null &&
            (s.id === target || `resource:${s.resource}` === target) &&
            v7Distance(actor.position, s.position) <=
              actor.radius + world.config.interaction,
        )
        .sort(
          (a, b) =>
            v7Distance(actor.position, a.position) -
            v7Distance(actor.position, b.position),
        )[0];
      if (!stack || stack.quantity < n)
        throw new Error(
          'Requested quantity is not on the ground within pickup reach.',
        );
      const resource = world.resources.find((r) => r.id === stack.resource);
      if (!resource) throw new Error('Unknown material.');
      if ((stack.mantle || stack.frictionKit || stack.waterCup) && n !== 1)
        throw new Error('Equipment is one indivisible persistent item.');
      v7Spend(actor, 1 + n * foodUnitMass(world, stack) * 0.2);
      if (stack.mantle || stack.frictionKit || stack.waterCup) {
        stack.owner = actor.id;
        stack.position = { ...actor.position };
        if (stack.mantle) stack.mantle.equipped = false;
        emit(
          'picked-up',
          stack.mantle
            ? 'Collected the same persistent mantle.'
            : stack.waterCup
              ? 'Collected the same persistent unfired cup.'
              : 'Collected the same persistent friction kit.',
          {
            quantity: 1,
            resource: stack.resource,
            item: stack.id,
            origin: stack.origin,
          },
          stack.id,
        );
        return done([stack.id]);
      }
      stack.quantity -= n;
      const id = v7Id(world, 'item');
      world.stacks.push({
        ...stack,
        id,
        quantity: n,
        owner: actor.id,
        position: { ...actor.position },
      });
      const picked = world.stacks.find((s) => s.id === id);
      if (picked) geometryTransfer(world, stack, picked);
      emit(
        'picked-up',
        `Collected ${String(n)} ${resource.name}; pickup does not nourish.`,
        { quantity: n, resource: resource.id, item: id, origin: stack.origin },
        stack.id,
      );
      return done([stack.id]);
    },
    'base.eat': ({ world, actor, action, emit }) => {
      const stack = v7Owned(
          world,
          actor,
          v7String(action.args.target, 'target'),
        ),
        n = v7Number(
          action.args.quantity,
          'quantity',
          world.state.foodPreservation === 1 ? 0.1 : 1,
        );
      if (world.state.foodPreservation === 1) foodTenths(n);
      const resource = world.resources.find((r) => r.id === stack.resource);
      if (!resource || resource.nutrition <= 0 || stack.quantity < n)
        throw new Error(
          'Requested owned food quantity is unavailable or inedible.',
        );
      const before = actor.vitals.satiety;
      v7FoodEffect(actor, resource, n, world, stack);
      stack.quantity -= n;
      emit(
        'ate',
        `Consumed ${String(n)} ${resource.name}; gained ${String(actor.vitals.satiety - before)} satiety.`,
        {
          quantity: n,
          resource: resource.id,
          nutrition: n * resource.nutrition,
          realized: actor.vitals.satiety - before,
          origin: stack.origin,
        },
        stack.id,
      );
      return done([stack.id]);
    },
    'base.gather': ({ world, actor, action, emit }) => {
      const target = v7String(action.args.target, 'target'),
        n = v7Number(action.args.quantity, 'quantity', 1),
        object = world.objects.find((o) => o.id === target);
      if (
        !object ||
        !v7Reach(actor, object.spatial) ||
        typeof object.data.resource !== 'string' ||
        typeof object.data.stock !== 'number' ||
        object.data.stock < n
      )
        throw new Error(
          'Source has insufficient accessible ripe or loose stock within interaction range.',
        );
      v7Spend(actor, 2 * n);
      object.data.stock -= n;
      if (world.config.experience)
        object.data.depletion = Number(object.data.depletion ?? 0) + n;
      const id = v7Id(world, 'item');
      world.stacks.push({
        id,
        resource: object.data.resource,
        quantity: n,
        position: { ...actor.position },
        owner: actor.id,
        origin: object.id,
        ...barkGatherState(object),
      });
      const gathered = world.stacks.find((s) => s.id === id);
      if (gathered) geometryGather(world, gathered);
      object.visual.state =
        object.data.stock > 0
          ? 'ready'
          : object.data.interval
            ? 'growing'
            : 'exhausted';
      emit(
        'gathered',
        `Collected ${String(n)} ${object.data.resource} from ${object.id}.`,
        {
          quantity: n,
          resource: object.data.resource,
          item: id,
          remaining: object.data.stock,
        },
        object.id,
      );
      return done([object.id]);
    },
    'base.drop': (context) => transfer(context, false),
    'base.give': (context) => transfer(context, true),
    'base.message': ({ world, actor, action, emit }) => {
      const id = v7String(action.args.recipient, 'recipient'),
        recipient = world.actors.find(
          (a) => a.id === id && a.vitals.health > 0,
        );
      if (
        !recipient ||
        id === actor.id ||
        v7Distance(actor.position, recipient.position) > world.config.vision
      )
        throw new Error(
          'Message recipient is not a visible living other actor.',
        );
      emit(
        'message',
        v7String(action.args.text, 'message'),
        {
          recipient: id,
          ...(world.config.experience
            ? {
                urgency: action.args.urgency ?? 'ordinary',
                subject: action.args.subject ?? '',
              }
            : {}),
        },
        id,
      );
      return done();
    },
  },
  processes: {
    'base.ripening': (world, process, work) => {
      work.spend();
      const object = world.objects.find((o) => o.id === process.object);
      if (!object) {
        world.processes = world.processes.filter((p) => p.id !== process.id);
        return;
      }
      const stock = Number(object.data.stock),
        capacity = Number(object.data.capacity),
        interval = Number(object.data.interval);
      if (world.tick >= process.next && stock < capacity) {
        // This authored perennial mechanism converts external daylight and groundwater into bounded standing stock.
        object.data.stock = stock + 1;
        object.data.produced = Number(object.data.produced ?? 0) + 1;
        object.visual.state = 'ready';
        world.events.push({
          id: v7Id(world, 'event'),
          tick: world.tick,
          actor: null,
          type: 'ripened',
          interface: null,
          success: true,
          description: `${object.name} produced one ripe unit from daylight and groundwater.`,
          position: { x: object.spatial.x, y: object.spatial.y },
          target: object.id,
          data: {
            quantity: 1,
            resource: object.data.resource ?? null,
            stock: stock + 1,
          },
        });
      }
      if (world.tick >= process.next) process.next = world.tick + interval;
      object.data.next = process.next;
    },
  },
};
function transfer(
  { world, actor, action, emit }: V7ActionContext,
  give: boolean,
): V7HandlerResult {
  const stack = v7Owned(world, actor, v7String(action.args.target, 'target')),
    n = v7Number(
      action.args.quantity,
      'quantity',
      world.state.foodAssessment === 1 || !!world.config.development ? 0.1 : 1,
    );
  if (world.state.foodAssessment === 1 || !!world.config.development)
    foodTenths(n);
  if (stack.quantity < n) throw new Error('Insufficient owned quantity.');
  if ((stack.mantle || stack.frictionKit || stack.waterCup) && n !== 1)
    throw new Error('Equipment is one indivisible persistent item.');
  const recipient = give
    ? world.actors.find(
        (a) =>
          a.id === action.args.recipient &&
          a.id !== actor.id &&
          a.vitals.health > 0,
      )
    : undefined;
  if (
    give &&
    (!recipient ||
      v7Distance(actor.position, recipient.position) >
        actor.radius + recipient.radius + world.config.interaction)
  )
    throw new Error('Recipient is outside actual handoff reach.');
  v7Spend(actor, 0.5);
  if (stack.mantle || stack.frictionKit || stack.waterCup) {
    if (stack.mantle?.equipped)
      emit(
        'insulation-unequipped',
        'Transfer removes the worn mantle before handoff.',
        { item: stack.id },
        stack.id,
      );
    if (stack.mantle) stack.mantle.equipped = false;
    stack.owner = recipient?.id ?? null;
    stack.position = { ...(recipient?.position ?? actor.position) };
    emit(
      give ? 'given' : 'dropped',
      stack.mantle
        ? 'Transferred the same persistent mantle.'
        : stack.waterCup
          ? 'Transferred the same persistent unfired cup.'
          : 'Transferred the same persistent friction kit.',
      {
        quantity: 1,
        resource: stack.resource,
        item: stack.id,
        recipient: recipient?.id ?? null,
      },
      stack.id,
    );
    return done([stack.id]);
  }
  stack.quantity -= n;
  const id = v7Id(world, 'item');
  world.stacks.push({
    ...stack,
    id,
    quantity: n,
    owner: recipient?.id ?? null,
    position: { ...(recipient?.position ?? actor.position) },
  });
  const transferred = world.stacks.find((s) => s.id === id);
  if (transferred) geometryTransfer(world, stack, transferred);
  emit(
    give ? 'given' : 'dropped',
    `Transferred ${String(n)} ${stack.resource}${recipient ? ` to ${recipient.name}` : ' onto the ground'}.`,
    {
      quantity: n,
      resource: stack.resource,
      item: id,
      recipient: recipient?.id ?? null,
    },
    stack.id,
  );
  return done([stack.id]);
}

/** Shared actual ingestion physiology; callers own material accounting and public evidence. */
export function v7FoodEffect(
  actor: V7Actor,
  resource: V7Resource,
  quantity: number,
  world?: V7World,
  stack?: V7Stack,
): void {
  v7Number(quantity, 'consumed food quantity', 0.1);
  if (resource.nutrition <= 0)
    throw new Error('The actual material is not edible.');
  const before = actor.vitals.satiety;
  const mealEffort = world?.config.experience
    ? 1 / forestRestFactor(world, actor)
    : 1;
  // Basic ingestion remains possible at zero energy; mood changes effort, never food nutrition.
  if (world?.config.experience)
    actor.vitals.energy = Math.max(0, actor.vitals.energy - mealEffort);
  else v7Spend(actor, 1);
  actor.vitals.satiety = Math.min(
    100,
    actor.vitals.satiety + quantity * resource.nutrition,
  );
  actor.vitals.health = Math.max(
    0,
    actor.vitals.health - quantity * resource.toxicity,
  );
  if (world)
    forestMeal(
      world,
      actor,
      resource,
      quantity,
      actor.vitals.satiety - before,
      stack,
    );
}
