import { geometryTransfer } from './open-material-geometry.js';
import type {
  V7Data,
  V7Stack,
  V7World,
  V7Actor,
  V7ActionContext,
} from './continuous-types.js';
import { v7Clone, v7Id, v7String } from './continuous-data.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { v7Distance } from './continuous-geometry.js';
import { forestEvent } from './forest-climate.js';
export interface RefugeWork extends V7Data {
  id: string;
  owner: string;
  mode: string;
  status: string;
  stage: number;
  total: number;
  paid: number;
  x: number;
  y: number;
  angle: number;
  escrow: string[];
  components: V7Data[];
  structure: string | null;
}
export const refugeKey = (owner: string, id: string) =>
  `refuge:work:${owner}:${id}`;
export function refugeRecord(w: V7World, a: V7Actor, id: string): RefugeWork {
  const r = w.state[refugeKey(a.id, id)];
  if (!r || typeof r !== 'object' || Array.isArray(r))
    throw new Error('No exact personal shelter work ID.');
  return r as RefugeWork;
}
export function refugeActive(w: V7World, a: V7Actor): RefugeWork | null {
  const id = a.extensionState['refuge:active'];
  return typeof id === 'string' ? refugeRecord(w, a, id) : null;
}
export function refugeCreate(
  c: V7ActionContext,
  mode: string,
  total: number,
): RefugeWork {
  const id = v7String(c.action.args.project, 'new personal work ID');
  if (c.world.state[refugeKey(c.actor.id, id)])
    throw new Error(
      'Work already exists; explicitly resume its remaining stages.',
    );
  const j: RefugeWork = {
    id,
    owner: c.actor.id,
    mode,
    status: 'active',
    stage: 0,
    total,
    paid: 0,
    x: c.actor.position.x,
    y: c.actor.position.y,
    angle: 0,
    escrow: [],
    components: [],
    structure: null,
  };
  c.world.state[refugeKey(j.owner, j.id)] = j;
  c.actor.extensionState['refuge:active'] = id;
  return j;
}
export function refugeReserve(
  c: V7ActionContext,
  j: RefugeWork,
  s: V7Stack,
  q: number,
) {
  const part: V7Stack = {
    ...v7Clone(s),
    id: v7Id(c.world, 'item'),
    quantity: q,
    quantityTenths: foodTenths(q),
    reservedFor: refugeKey(j.owner, j.id),
    processing: { ...(s.processing ?? {}), refugeSource: s.id },
  };
  foodSetQuantity(s, foodTenths(s.quantity) - foodTenths(q));
  geometryTransfer(c.world, s, part);
  c.world.stacks.push(part);
  j.escrow.push(part.id);
  return part;
}
export function refugeStop(
  w: V7World,
  a: V7Actor,
  j: RefugeWork,
  reason: string,
  dead = false,
) {
  for (const id of j.escrow) {
    const s = w.stacks.find((s) => s.id === id);
    if (s?.reservedFor !== refugeKey(j.owner, j.id)) continue;
    delete s.reservedFor;
    if (dead) {
      s.owner = null;
      s.position = { x: j.x, y: j.y };
    }
  }
  delete a.extensionState['refuge:active'];
  j.status = 'stopped';
  forestEvent(
    w,
    'shelter-stopped',
    reason,
    a.position,
    a.id,
    {
      project: j.id,
      stage: j.stage,
      remainingWork: j.total - j.stage,
      paidEnergy: j.paid,
    },
    j.structure,
  );
}
export function refugeResume(c: V7ActionContext) {
  const j = refugeRecord(
    c.world,
    c.actor,
    v7String(c.action.args.project, 'personal work ID'),
  );
  if (j.status === 'completed' || j.stage >= j.total)
    throw new Error('This work is already complete.');
  for (const id of j.escrow) {
    const s = c.world.stacks.find((s) => s.id === id);
    if (
      !s ||
      (s.owner !== c.actor.id &&
        !(
          s.owner === null && v7Distance(s.position, c.actor.position) <= 0.65
        )) ||
      (s.reservedFor && s.reservedFor !== refugeKey(j.owner, j.id))
    )
      throw new Error('The same actual remaining component is unavailable.');
  }
  for (const id of j.escrow) {
    const s = c.world.stacks.find((s) => s.id === id);
    if (s) {
      s.owner = c.actor.id;
      s.reservedFor = refugeKey(j.owner, j.id);
    }
  }
  c.actor.extensionState['refuge:active'] = j.id;
  j.status = 'active';
  return j;
}
export function refugeInstall(c: V7ActionContext, j: RefugeWork, id: string) {
  const s = c.world.stacks.find(
    (s) => s.id === id && s.reservedFor === refugeKey(j.owner, j.id),
  );
  if (!s) throw new Error('Missing actual reserved component.');
  const part = v7Clone(s);
  delete part.reservedFor;
  part.owner = null;
  part.position = { x: j.x, y: j.y };
  j.components.push(part as unknown as V7Data);
  j.escrow = j.escrow.filter((x) => x !== id);
  c.world.stacks = c.world.stacks.filter((s) => s.id !== id);
}
export function refugeSalvage(
  w: V7World,
  component: V7Data,
  x: number,
  y: number,
) {
  const s = v7Clone(component) as unknown as V7Stack;
  if (w.stacks.some((other) => other.id === s.id))
    throw new Error('Component already returned.');
  s.owner = null;
  s.position = { x, y };
  delete s.reservedFor;
  s.processing = {
    ...(s.processing ?? {}),
    refugeSalvage: { altered: true, condition: component.condition ?? 1 },
  };
  w.stacks.push(s);
}
