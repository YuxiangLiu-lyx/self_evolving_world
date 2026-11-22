import type {
  V7World,
  V7Actor,
  V7ActionContext,
  V7Data,
  V7Stack,
  V7Object,
} from './continuous-types.js';
import { v7Clone, v7Id, v7String } from './continuous-data.js';
import {
  foodSetQuantity,
  foodUnitMass,
  foodTenths,
} from './forest-food-accounting.js';
import { geometryTransfer, poleShape } from './open-material-geometry.js';
import { forestEvent } from './forest-climate.js';
import type { ShortInput } from './open-short-material.js';
export interface ShortWork extends V7Data {
  id: string;
  owner: string;
  mode: string;
  status: string;
  stage: number;
  total: number;
  paid: number;
  x: number;
  y: number;
  structure: string;
  escrow: string[];
  roles: V7Data;
  target: string;
}
export const shortKey = (owner: string, id: string) =>
  `short:work:${owner}:${id}`;
export function shortWork(w: V7World, a: V7Actor, id: string): ShortWork {
  const j = w.state[shortKey(a.id, id)];
  if (!j || typeof j !== 'object' || Array.isArray(j))
    throw new Error('No exact personal short-refuge operation.');
  return j as ShortWork;
}
export function shortActive(w: V7World, a: V7Actor): ShortWork | null {
  const id = a.extensionState['short:active'];
  return typeof id === 'string' ? shortWork(w, a, id) : null;
}
export function shortStart(
  c: V7ActionContext,
  rows: ShortInput[],
  o: V7Object | null,
  total: number,
): ShortWork {
  const { world: w, actor: a } = c,
    id = v7String(c.action.args.project, 'new project ID'),
    key = shortKey(a.id, id);
  if (w.state[key])
    throw new Error(
      'Work ID already exists; resume remaining stages or choose a new actual operation.',
    );
  const x = o?.spatial.x ?? Number(c.action.args.x),
    y = o?.spatial.y ?? Number(c.action.args.y);
  const j: ShortWork = {
    id,
    owner: a.id,
    mode: v7String(c.action.args.mode, 'mode'),
    status: 'active',
    stage: 0,
    total,
    paid: 0,
    x,
    y,
    structure: o?.id ?? '',
    escrow: [],
    roles: {},
    target:
      typeof c.action.args.target === 'string' ? c.action.args.target : '',
  };
  for (const r of rows) {
    const shape = poleShape(w, r.s),
      part = {
        ...v7Clone(r.s),
        id: v7Id(w, 'item'),
        quantity: r.quantity,
        quantityTenths: Math.round(r.quantity * 10),
        reservedFor: key,
        position: { x, y },
      };
    if (r.role === 'binding' || r.role === 'cover') {
      const mass = foodUnitMass(w, part);
      part.physical ??= {
        unitMass: mass,
        unitWater: mass * 0.2,
        unitSolids: mass * 0.8,
      };
      part.processing = {
        ...part.processing,
        shortIntegrity: 1,
        shortGrassModel:
          'short-material-refuge@1: unmeasured conservative grass law, initial unrepresented water fraction 0.2; existing physical state retained',
      };
    }
    part.processing = {
      ...part.processing,
      shortRole: r.role,
      shortInput: {
        source: r.s.id,
        origin: r.s.origin,
        quantity: r.quantity,
        operation: key,
      },
      ...(shape ? { shortShape: v7Clone(shape) } : {}),
    };
    foodSetQuantity(r.s, foodTenths(r.s.quantity) - foodTenths(r.quantity));
    geometryTransfer(w, r.s, part);
    w.stacks.push(part);
    j.escrow.push(part.id);
    j.roles[part.id] = r.role;
  }
  if (
    rows.some((r) => ['binding', 'cover'].includes(r.role)) &&
    !w.processes.some((p) => p.handler === 'open.short-stock')
  )
    w.processes.push({
      id: v7Id(w, 'process'),
      handler: 'open.short-stock',
      owner: null,
      object: null,
      next: w.tick + 1,
      revision: 'short-material-refuge@1',
      data: {},
    });
  w.stacks = w.stacks.filter((s) => s.quantity > 0);
  w.state[key] = j;
  a.extensionState['short:active'] = id;
  return j;
}
export function shortRelease(
  w: V7World,
  j: ShortWork,
  status: string,
  reason: string,
) {
  if (['completed', 'stopped'].includes(j.status)) return;
  for (const id of j.escrow) {
    const s = w.stacks.find((s) => s.id === id);
    if (s?.reservedFor !== shortKey(j.owner, j.id)) continue;
    delete s.reservedFor;
    s.owner = null;
    s.position = { x: j.x, y: j.y };
  }
  j.escrow = [];
  j.status = status;
  const a = w.actors.find((a) => a.id === j.owner);
  if (a?.extensionState['short:active'] === j.id)
    delete a.extensionState['short:active'];
  forestEvent(
    w,
    'short-refuge-stopped',
    reason,
    { x: j.x, y: j.y },
    j.owner,
    {
      operationId: shortKey(j.owner, j.id),
      stage: j.stage,
      remainingWork: j.total - j.stage,
      paidEnergy: j.paid,
    },
    j.structure || j.target,
  );
}
export function shortPause(w: V7World, a: V7Actor) {
  const j = shortActive(w, a);
  if (j) {
    j.status = 'paused';
    delete a.extensionState['short:active'];
  }
}
export function shortResume(c: V7ActionContext): ShortWork {
  const j = shortWork(
    c.world,
    c.actor,
    v7String(c.action.args.project, 'project'),
  );
  if (j.status !== 'paused')
    throw new Error('Only an unfinished paused operation can resume.');
  if (
    j.escrow.some(
      (id) =>
        !c.world.stacks.some(
          (s) =>
            s.id === id &&
            s.owner === c.actor.id &&
            s.reservedFor === shortKey(j.owner, j.id),
        ),
    )
  )
    throw new Error('Exact surviving escrow is unavailable.');
  j.status = 'active';
  c.actor.extensionState['short:active'] = j.id;
  return j;
}
export function shortIncorporate(
  w: V7World,
  j: ShortWork,
  o: V7Object,
  ids: string[],
) {
  const parts = (o.data.components ?? []) as unknown as V7Stack[];
  for (const id of ids) {
    const s = w.stacks.find(
      (s) => s.id === id && s.reservedFor === shortKey(j.owner, j.id),
    );
    if (!s) throw new Error('Exact incorporated component is missing.');
    const part = v7Clone(s);
    delete part.reservedFor;
    part.owner = null;
    parts.push(part);
    w.stacks = w.stacks.filter((s) => s.id !== id);
    j.escrow = j.escrow.filter((x) => x !== id);
  }
  o.data.components = parts as unknown as V7Data[];
}
export function shortReturnPart(w: V7World, o: V7Object, s: V7Stack) {
  const part = v7Clone(s);
  part.id = v7Id(w, 'item');
  part.owner = null;
  part.position = { x: o.spatial.x, y: o.spatial.y };
  delete part.reservedFor;
  part.processing = {
    ...part.processing,
    shortSalvage: {
      structure: o.id,
      original: s.id,
      integrity: o.data.integrity ?? 1,
    },
  };
  w.stacks.push(part);
}
