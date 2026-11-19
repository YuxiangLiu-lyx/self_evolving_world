import type { AgentState } from './world.js';
import type {
  CoevolutionAction,
  CoevolutionData,
  PersistentObject,
} from './coevolution-types.js';
import { COEVOLUTION_CONFIG } from './coevolution-schema.js';
export function availableObjects(
  data: CoevolutionData,
  actor: AgentState,
): readonly PersistentObject[] {
  return data.objects.filter(
    (o) =>
      o.owner === actor.id ||
      (o.position &&
        Math.abs(o.position.x - actor.position.x) +
          Math.abs(o.position.y - actor.position.y) <=
          1),
  );
}
export function carryingLoad(data: CoevolutionData, id: string): number {
  return (
    data.stacks
      .filter((s) => s.owner === id)
      .reduce((n, s) => n + s.quantity, 0) +
    data.objects.filter((o) => o.owner === id).length
  );
}
export function actionEffort(
  data: CoevolutionData,
  actor: AgentState,
  action: CoevolutionAction,
  withAid = true,
): number {
  const aid = withAid
    ? Math.min(
        8,
        data.objects
          .filter((o) => o.owner === actor.id)
          .reduce(
            (n, o) =>
              Math.max(
                n,
                data.blueprints.find((b) => b.id === o.blueprint)?.carryBonus ??
                  0,
              ),
            0,
          ),
      )
    : 0;
  if (action.type === 'move')
    return (
      2 + Math.ceil(Math.max(0, carryingLoad(data, actor.id) - 3 - aid) / 2)
    );
  if (action.type === 'pickup')
    return (
      1 +
      Math.ceil(
        (data.stacks.find((s) => s.id === action.itemId)?.quantity ?? 0) / 3,
      )
    );
  if (action.type === 'use') return 2;
  if (action.type === 'give' || action.type === 'drop') return 1;
  return 0;
}
/** Only explicit finite production schedules advance. No request or restart grants stock. */
export function advanceResourceProcesses(
  data: CoevolutionData,
  tick: number,
): CoevolutionData {
  const sites = new Map(data.sites.map((s) => [s.id, s]));
  const allocations = data.allocations.map((a) => {
    if (!a.renewEvery || tick < a.next || !a.remaining || !a.ceiling) return a;
    const site = sites.get(a.site);
    if (!site) throw new RangeError('Missing process habitat.');
    const amount = Math.min(
      1,
      a.remaining,
      Math.max(0, a.ceiling - (site.stock[a.resource] ?? 0)),
    );
    sites.set(site.id, {
      ...site,
      stock: {
        ...site.stock,
        [a.resource]: (site.stock[a.resource] ?? 0) + amount,
      },
    });
    return { ...a, remaining: a.remaining - amount, next: tick + a.renewEvery };
  });
  const stacks = [...data.stacks],
    benefits = [...data.benefits];
  const jobs = data.jobs.map((j) => {
    if (j.completed || j.due > tick) return j;
    const object = data.objects.find((o) => o.id === j.object),
      type = data.types.find((t) => t.id === j.output);
    if (!object?.position || !type)
      throw new RangeError('Invalid scheduled processing output.');
    stacks.push({
      id: `output-${j.id}`,
      type: type.id,
      quantity: j.quantity,
      durability: type.durability,
      owner: null,
      position: object.position,
    });
    benefits.push({
      tick,
      actor: j.actor,
      object: object.id,
      kind: 'process',
      amount: j.quantity,
    });
    return { ...j, completed: true };
  });
  const objects = data.objects.map((object) => {
    const growth = object.growth,
      rule = data.blueprints.find((b) => b.id === object.blueprint)?.growth;
    if (
      !growth ||
      !rule ||
      !object.position ||
      tick < growth.next ||
      growth.produced >= rule.lifetime
    )
      return object;
    const prefix = `yield-${object.id}-`,
      stock = stacks
        .filter((s) => s.id.startsWith(prefix) && s.owner === null)
        .reduce((n, s) => n + s.quantity, 0),
      output = data.types.find((t) => t.id === rule.output);
    if (!output) throw new RangeError('Missing growth output type.');
    const amount = stock < rule.ceiling ? 1 : 0;
    if (amount) {
      stacks.push({
        id: `${prefix}${String(growth.produced + 1)}`,
        type: output.id,
        quantity: 1,
        durability: output.durability,
        owner: null,
        position: object.position,
      });
      benefits.push({
        tick,
        actor: object.creator,
        object: object.id,
        kind: 'growth',
        amount,
      });
    }
    return {
      ...object,
      growth: {
        next: tick + rule.interval,
        produced: growth.produced + amount,
        environmentalEnergy:
          growth.environmentalEnergy + amount * output.nutrition,
      },
    };
  });
  return {
    ...data,
    sites: [...sites.values()],
    allocations,
    stacks,
    jobs,
    benefits,
    objects,
  };
}
export function recovery(data: CoevolutionData, actor: AgentState) {
  const eligible = availableObjects(data, actor)
    .map((o) => ({
      object: o.id,
      bonus: data.blueprints.find((b) => b.id === o.blueprint)?.restBonus ?? 0,
    }))
    .sort((a, b) => b.bonus - a.bonus || a.object.localeCompare(b.object));
  return {
    amount: COEVOLUTION_CONFIG.restRecovery + (eligible[0]?.bonus ?? 0),
    object: eligible[0]?.object ?? null,
  };
}
