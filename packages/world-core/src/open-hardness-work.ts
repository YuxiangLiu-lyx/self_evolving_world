import { scratchPhysical } from './open-hardness-physics.js';
import type {
  V7World,
  V7Actor,
  V7ActionContext,
  V7Data,
  V7Stack,
} from './continuous-types.js';
import { v7Clone, v7Id, v7String, v7Json } from './continuous-data.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { forestEvent } from './forest-climate.js';
export interface ScratchWork extends V7Data {
  id: string;
  owner: string;
  status: string;
  stage: number;
  paid: number;
  sources: string[];
  specimens: string[];
  observations: V7Data[];
  x: number;
  y: number;
  tests: number;
  history: V7Data[];
}
export const scratchKey = (a: string, id: string) =>
  `hardness:project:${a}:${id}`;
export function scratchRecord(
  w: V7World,
  a: V7Actor,
  id: string,
): ScratchWork | null {
  const v = w.state[scratchKey(a.id, id)];
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as ScratchWork)
    : null;
}
export function scratchActive(w: V7World, a: V7Actor): ScratchWork | null {
  const id = a.extensionState['open:hardness-work'];
  return typeof id === 'string' ? scratchRecord(w, a, id) : null;
}
export function scratchProject(c: V7ActionContext): ScratchWork {
  const id = v7String(c.action.args.project, 'personal project'),
    old = scratchRecord(c.world, c.actor, id);
  if (old) return old;
  const j: ScratchWork = {
    id,
    owner: c.actor.id,
    status: 'new',
    stage: 0,
    paid: 0,
    sources: [],
    specimens: [],
    observations: [],
    x: c.actor.position.x,
    y: c.actor.position.y,
    tests: 0,
    history: [],
  };
  c.world.state[scratchKey(c.actor.id, id)] = j;
  return j;
}
export function scratchReserve(
  c: V7ActionContext,
  j: ScratchWork,
  s: V7Stack,
  reservation = scratchKey(j.owner, j.id),
): V7Stack {
  const portion: V7Stack = {
    ...v7Clone(s),
    id: v7Id(c.world, 'item'),
    quantity: 0.1,
    quantityTenths: 1,
    reservedFor: reservation,
    position: { ...c.actor.position },
    processing: {
      ...(s.processing ?? {}),
      scratchSpecimen: {
        project: j.id,
        source: s.id,
        sourceBatch: s.origin,
        quantity: 0.1,
      },
    },
  };
  c.world.state[`hardness:intrinsic:${portion.id}`] = {
    ...v7Clone(scratchPhysical(c.world, s)),
    quantity: 0.1,
  };
  foodSetQuantity(s, foodTenths(s.quantity) - 1);
  c.world.stacks.push(portion);
  j.specimens.push(portion.id);
  return portion;
}
export function scratchRelease(
  w: V7World,
  a: V7Actor,
  j: ScratchWork,
  reason: string,
  dead = false,
  complete = false,
): void {
  for (const id of j.specimens) {
    const s = w.stacks.find((s) => s.id === id);
    if (s?.reservedFor !== scratchKey(a.id, j.id)) continue;
    delete s.reservedFor;
    if (dead) {
      s.owner = null;
      s.position = { ...a.position };
    }
  }
  j.status = complete ? 'completed' : 'cancelled';
  delete a.extensionState['open:hardness-work'];
  if (!complete)
    forestEvent(
      w,
      'hardness-test-stopped',
      'Active scratching stopped; altered specimens and partial evidence persist, unperformed work was not charged.',
      a.position,
      a.id,
      {
        project: j.id,
        stage: j.stage,
        remainingWork: 2 - j.stage,
        paidEnergy: j.paid,
        reason,
        specimens: j.specimens,
      },
      j.specimens[0] ?? null,
    );
}
export function scratchArchive(j: ScratchWork): void {
  if (j.tests > 0)
    j.history.push(
      v7Json({
        test: j.tests,
        status: j.status,
        stage: j.stage,
        paidEnergy: j.paid,
        sources: j.sources,
        specimens: j.specimens,
        observations: j.observations,
      }) as V7Data,
    );
}
