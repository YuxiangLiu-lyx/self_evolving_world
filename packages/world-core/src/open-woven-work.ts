import type {
  V7World,
  V7Actor,
  V7ActionContext,
  V7Data,
  V7Stack,
} from './continuous-types.js';
import { v7Clone, v7Id, v7Json, v7String } from './continuous-data.js';
import { foodTenths, foodSetQuantity } from './forest-food-accounting.js';
import { forestResolveReference } from './forest-references.js';
import { v7Distance } from './continuous-geometry.js';
import { forestEvent } from './forest-climate.js';
export interface WovenWork extends V7Data {
  id: string;
  owner: string;
  mode: string;
  stage: number;
  total: number;
  paid: number;
  status: string;
  x: number;
  y: number;
  tools: string[];
  escrow: string[];
  components: V7Data[];
  specimen: string | null;
  balance: string | null;
  mesh: string | null;
  weights: string[];
  started: number;
  measurements: V7Data[];
}
export const wovenKey = (id: string, owner: string) =>
  `woven:work:${owner}:${id}`;
export function wovenRecord(w: V7World, a: V7Actor, id: string): WovenWork {
  const raw = w.state[wovenKey(id, a.id)];
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    raw.owner !== a.id
  )
    throw new Error(
      'No actor-owned work record with that exact ID is available.',
    );
  return raw as WovenWork;
}
export function wovenActive(w: V7World, a: V7Actor): WovenWork | null {
  const id = a.extensionState['open:woven-active'];
  return typeof id === 'string' ? wovenRecord(w, a, id) : null;
}
export function wovenCreate(
  c: V7ActionContext,
  mode: string,
  total: number,
): WovenWork {
  const supplied =
      typeof c.action.args.project === 'string'
        ? c.action.args.project.trim()
        : v7String(c.action.args.project, 'project'),
    id = supplied || v7Id(c.world, 'work');
  if (c.world.state[wovenKey(id, c.actor.id)])
    throw new Error(
      'This work record already exists; use explicit resume or calibrate rather than duplicate allocation.',
    );
  const j: WovenWork = {
    id,
    owner: c.actor.id,
    mode,
    stage: 0,
    total,
    paid: 0,
    status: 'active',
    x: c.actor.position.x,
    y: c.actor.position.y,
    tools: [],
    escrow: [],
    components: [],
    specimen: null,
    balance: null,
    mesh: null,
    weights: [],
    started: c.world.tick,
    measurements: [],
  };
  c.world.state[wovenKey(id, c.actor.id)] = j;
  c.actor.extensionState['open:woven-active'] = id;
  c.world.processes.push({
    id: v7Id(c.world, 'process'),
    handler: 'open.woven-process',
    owner: c.actor.id,
    object: null,
    next: c.world.tick + 1,
    revision: 'assay-woven-supports@1',
    data: { project: id },
  });
  return j;
}
export function wovenInputs(c: V7ActionContext): V7Stack[] {
  const raw = c.action.args.controls;
  if (!Array.isArray(raw))
    throw new Error('Explicit owned control item IDs are required.');
  const ids = raw.map((x) =>
    forestResolveReference(c.world, c.actor, v7String(x, 'control'), 'owned'),
  );
  if (new Set(ids).size !== ids.length)
    throw new Error('A material may not be allocated twice.');
  return ids.map((id) => {
    const s = c.world.stacks.find((s) => s.id === id);
    if (!s) throw new Error('Missing actual control');
    return s;
  });
}
export function wovenReserve(
  c: V7ActionContext,
  j: WovenWork,
  s: V7Stack,
  n: number,
): V7Stack {
  if (s.owner !== c.actor.id || s.reservedFor || s.quantity < n)
    throw new Error('Insufficient actual unreserved input.');
  const specimen: V7Stack = {
    ...v7Clone(s),
    id: v7Id(c.world, 'item'),
    quantity: n,
    quantityTenths: foodTenths(n),
    reservedFor: wovenKey(j.id, j.owner),
    position: { ...c.actor.position },
    processing: {
      ...(s.processing ?? {}),
      wovenWork: { project: j.id, source: s.id },
    },
  };
  foodSetQuantity(s, foodTenths(s.quantity) - foodTenths(n));
  c.world.stacks.push(specimen);
  j.escrow.push(specimen.id);
  return specimen;
}
export function wovenConsume(
  w: V7World,
  j: WovenWork,
  id: string,
  component: string,
): V7Data {
  const s = w.stacks.find(
    (s) => s.id === id && s.reservedFor === wovenKey(j.id, j.owner),
  );
  if (!s) throw new Error('The actual reserved component is unavailable.');
  const record = v7Json({ ...s, component }) as V7Data;
  j.components.push(record);
  w.stacks = w.stacks.filter((s) => s.id !== id);
  j.escrow = j.escrow.filter((x) => x !== id);
  return record;
}
export function wovenPause(
  w: V7World,
  a: V7Actor,
  reason: string,
  dead = false,
): void {
  const j = wovenActive(w, a);
  if (!j) return;
  for (const id of j.escrow) {
    const s = w.stacks.find((s) => s.id === id);
    if (s?.reservedFor !== wovenKey(j.id, j.owner)) continue;
    delete s.reservedFor;
    if (dead) {
      s.owner = null;
      s.position = { ...a.position };
    }
  }
  j.status = 'paused';
  for (const o of w.objects.filter(
    (o) => o.id === j.balance || o.id === j.mesh,
  )) {
    o.data.workStatus = j.status;
    o.data.remainingWork = j.total - j.stage;
    o.data.allocatedItems = j.escrow;
  }

  delete a.extensionState['open:woven-active'];
  forestEvent(
    w,
    'woven-support-stopped',
    'Active work paused; consumed components remain real and surviving unconsumed allocations are released once. Resume names this exact work record.',
    a.position,
    a.id,
    {
      project: j.id,
      stage: j.stage,
      remainingWork: j.total - j.stage,
      paidEnergy: j.paid,
      reason,
    },
    j.balance ?? j.specimen,
  );
}
export function wovenResume(c: V7ActionContext): WovenWork {
  const j = wovenRecord(
    c.world,
    c.actor,
    v7String(c.action.args.project, 'project'),
  );
  if (!['paused', 'awaiting-calibration'].includes(j.status))
    throw new Error(
      'This exact work record is not awaiting explicit resumption.',
    );
  const controls = wovenInputs(c);
  if (controls.length) {
    if (
      controls.some(
        (s) =>
          (c.world.resources.find((r) => r.id === s.resource)?.properties
            ?.hardness ?? 0) < 8 || s.quantity < 1,
      )
    )
      throw new Error(
        'Replacement retained tools must be explicitly allocated real hard stones.',
      );
    j.tools = controls.map((s) => s.id);
  }
  for (const id of j.escrow) {
    const s = c.world.stacks.find((s) => s.id === id);
    if (
      !s ||
      (s.owner !== c.actor.id &&
        !(
          s.owner === null &&
          v7Distance(s.position, c.actor.position) <= 0.65 + c.actor.radius
        )) ||
      s.reservedFor
    )
      throw new Error(
        'The same surviving allocated material must be actually owned or reachable on the ground; no substitute is supplied.',
      );
    s.owner = c.actor.id;
    s.reservedFor = wovenKey(j.id, j.owner);
  }
  j.status = 'active';
  c.actor.extensionState['open:woven-active'] = j.id;
  return j;
}
export function wovenRelease(w: V7World, a: V7Actor, j: WovenWork): void {
  for (const id of j.escrow) {
    const s = w.stacks.find((s) => s.id === id);
    if (s?.reservedFor === wovenKey(j.id, j.owner)) delete s.reservedFor;
  }
  j.status = 'completed';
  delete a.extensionState['open:woven-active'];
}
