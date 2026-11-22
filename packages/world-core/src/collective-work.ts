import { materialPortion } from './material-lots.js';
import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7Id, v7Number, v7Record, v7String } from './continuous-data.js';
import { forestResolveReference } from './forest-references.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { forestEvent } from './forest-climate.js';

/** Reviewed explicit labor; persisted separately from disposable plan cursors. */
export interface CollectiveWork extends V7Data {
  id: string;
  owner: string;
  ability: string;
  mode: string;
  status: string;
  initialWork: number;
  completedWork: number;
  remainingWork: number;
  paidEnergy: number;
  escrow: string[];
  sources: V7Data[];
  x: number;
  y: number;
  target: string | null;
  outputs: string[];
  lastPaid: number;
}
export const workKey = (id: string) => `collective:work:${id}`;
export function collectiveJobs(w: V7World, ability: string): CollectiveWork[] {
  return Object.entries(w.state)
    .filter(([k]) => k.startsWith('collective:work:'))
    .map(([, v]) => v as CollectiveWork)
    .filter((j) => j.ability === ability);
}
export function workFind(c: V7ActionContext): CollectiveWork | undefined {
  const id = c.action.args.processId;
  const jobs = collectiveJobs(c.world, c.action.interface).filter(
    (j) => j.owner === c.actor.id,
  );
  if (typeof id === 'string' && id) {
    const j = jobs.find((j) => j.id === id);
    if (!j) throw new Error('No exact personal process identity.');
    return j;
  }
  return jobs.find((j) => j.status === 'active' || j.status === 'paused');
}
export function workCreate(
  c: V7ActionContext,
  mode: string,
  rounds: number,
): CollectiveWork {
  if (workFind(c))
    throw new Error('Inspect, resume or cancel existing work first.');
  const j: CollectiveWork = {
    id: v7Id(c.world, 'manual'),
    owner: c.actor.id,
    ability: c.action.interface,
    mode,
    status: 'active',
    initialWork: rounds,
    completedWork: 0,
    remainingWork: rounds,
    paidEnergy: 0,
    escrow: [],
    sources: [],
    ...c.actor.position,
    target: null,
    outputs: [],
    lastPaid: -1,
  };
  c.world.state[workKey(j.id)] = j;
  c.actor.extensionState[`collective:work:${j.ability}`] = j.id;
  return j;
}
export function workAllocations(
  c: V7ActionContext,
  value: unknown,
): { stack: V7Stack; quantity: number }[] {
  if (!Array.isArray(value) || !value.length || value.length > 24)
    throw new Error('Supply 1–24 actual item allocations.');
  const used = new Set<string>();
  return value.map((raw: unknown) => {
    const r = v7Record(raw),
      quantity = v7Number(r.quantity, 'quantity', 0.1);
    foodTenths(quantity);
    const id = forestResolveReference(
      c.world,
      c.actor,
      v7String(r.itemId, 'itemId'),
      'owned',
      quantity,
    );
    if (used.has(id)) throw new Error('Duplicate input identity.');
    used.add(id);
    const stack = c.world.stacks.find((s) => s.id === id);
    if (!stack) throw new Error('Resolved item no longer exists.');
    return { stack, quantity };
  });
}
export function workReserve(
  c: V7ActionContext,
  j: CollectiveWork,
  allocations: ReturnType<typeof workAllocations>,
  ground = false,
) {
  for (const { stack, quantity } of allocations) {
    const part: V7Stack = {
      ...materialPortion(stack, foodTenths(quantity)),
      id: v7Id(c.world, 'item'),
      quantity,
      quantityTenths: foodTenths(quantity),
      reservedFor: j.id,
      position: { x: j.x, y: j.y },
      owner: ground ? null : c.actor.id,
    };
    foodSetQuantity(stack, foodTenths(stack.quantity) - foodTenths(quantity));
    c.world.stacks.push(part);
    j.escrow.push(part.id);
    j.sources.push({
      itemId: stack.id,
      escrowId: part.id,
      resource: part.resource,
      quantity,
      owner: c.actor.id,
      origin: part.origin,
      harvestedAt: part.harvestedAt ?? null,
      decay: part.decay ?? 0,
    });
  }
}
export function workStop(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  reason: string,
  ground: boolean,
) {
  if (!['active', 'paused'].includes(j.status))
    throw new Error('This process is already settled.');
  for (const id of j.escrow) {
    const s = w.stacks.find((s) => s.id === id && s.reservedFor === j.id);
    if (!s) continue;
    delete s.reservedFor;
    s.owner = ground ? null : a.id;
    s.position = ground ? { x: j.x, y: j.y } : { ...a.position };
  }
  j.status = 'stopped';
  j.reason = reason;
  const o = w.objects.find(
    (o) => o.id === j.target && o.kind === 'lean-to-work',
  );
  if (o) w.objects = w.objects.filter((x) => x.id !== o.id);
  forestEvent(
    w,
    'process-stopped',
    reason,
    { x: j.x, y: j.y },
    a.id,
    { ...j },
    j.id,
  );
}
export function workPay(
  c: V7ActionContext,
  j: CollectiveWork,
  cost: number,
): boolean {
  if (!['active', 'paused'].includes(j.status))
    throw new Error('This process is already settled.');
  if (j.lastPaid === c.world.tick)
    throw new Error('This round of work was already paid.');
  if (c.actor.vitals.energy < cost) {
    j.status = 'paused';
    j.reason = 'Insufficient energy; remaining work and escrow retained.';
    return false;
  }
  c.actor.vitals.energy -= cost;
  j.paidEnergy += cost;
  j.completedWork++;
  j.remainingWork--;
  j.lastPaid = c.world.tick;
  j.status = 'active';
  delete j.reason;
  c.emit(
    'process-progress',
    'One explicit paid work round completed.',
    { ...j },
    j.id,
  );
  return true;
}
export function workResult(j: CollectiveWork) {
  return {
    complete: j.status === 'completed' || j.status === 'stopped',
    remaining: j.remainingWork,
    writes: [j.id, ...(j.target ? [j.target] : [])],
  };
}
