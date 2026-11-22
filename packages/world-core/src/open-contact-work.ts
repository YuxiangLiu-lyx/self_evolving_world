import type {
  V7World,
  V7Actor,
  V7ActionContext,
  V7Data,
} from './continuous-types.js';
import { v7Id, v7String } from './continuous-data.js';
import { v7Distance } from './continuous-geometry.js';
import { forestEvent } from './forest-climate.js';
import type { ScratchWork } from './open-hardness-work.js';
export const CONTACT_MODEL: V7Data = {
  version: 1,
  law: 'hardness-assessment@1 contact law',
  force: 'scale * min(30, 5 + represented mass * 9.81)',
  pressure: 'force / (pi * actual edgeRadius^2)',
  groove:
    'interpretable contact, pressure > 1e6 * target intrinsic index, and tool index - target index >= 0.5',
  units:
    'uncalibrated engine mass, length and force conventions; not independent SI measurements',
  anchors: null,
  identifiability:
    'Force is achieved by the represented actuator law, not read from an independent instrument. Initial edge radius depends on intrinsic index, so its inversion would be circular. Relative response observations do not supply independent absolute standards. No supported finite absolute bound is available.',
  bounds: null,
};
export const contactKey = (owner: string, id: string) =>
  `contact:project:${owner}:${id}`;
export function contactRecord(
  w: V7World,
  a: V7Actor,
  id: string,
): ScratchWork | null {
  const r = w.state[contactKey(a.id, id)];
  return r && typeof r === 'object' && !Array.isArray(r)
    ? (r as ScratchWork)
    : null;
}
export function contactActive(w: V7World, a: V7Actor): ScratchWork | null {
  const id = a.extensionState['open:contact-work'];
  return typeof id === 'string' ? contactRecord(w, a, id) : null;
}
export function contactProject(
  c: V7ActionContext,
  create = false,
): ScratchWork {
  const id = v7String(c.action.args.project, 'personal project'),
    old = contactRecord(c.world, c.actor, id);
  if (old) return old;
  if (!create)
    throw new Error(
      'No actual actor-owned contact project exists with this ID.',
    );
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
    model: CONTACT_MODEL,
    inspections: [],
  };
  c.world.state[contactKey(c.actor.id, id)] = j;
  return j;
}
export function contactProcess(w: V7World, j: ScratchWork): void {
  if (
    !w.processes.some(
      (p) =>
        p.handler === 'open.contact-cleanup' &&
        p.owner === j.owner &&
        p.data.project === j.id,
    )
  )
    w.processes.push({
      id: v7Id(w, 'process'),
      handler: 'open.contact-cleanup',
      owner: j.owner,
      object: null,
      next: w.tick + 1,
      revision: 'contact-resistance-calibration@1',
      data: { project: j.id },
    });
}
export function contactRelease(
  w: V7World,
  a: V7Actor,
  j: ScratchWork,
  reason: string,
  dead = false,
): void {
  if (j.status === 'cancelled') return;
  for (const id of j.specimens) {
    const s = w.stacks.find((s) => s.id === id);
    if (s?.reservedFor !== contactKey(a.id, j.id)) continue;
    delete s.reservedFor;
    if (dead) {
      s.owner = null;
      s.position = { ...a.position };
    }
  }
  j.status = 'cancelled';
  delete a.extensionState['open:contact-work'];
  forestEvent(
    w,
    'contact-calibration-stopped',
    'Active contact work stopped once; actual altered portions and partial observations remain, without effort refund.',
    a.position,
    a.id,
    {
      project: j.id,
      reason,
      stage: j.stage,
      remainingWork: Math.max(0, 6 - j.stage),
      paidEnergy: j.paid,
      specimens: j.specimens,
    },
    j.specimens[0] ?? null,
  );
}
export function contactResume(c: V7ActionContext): ScratchWork {
  const j = contactProject(c);
  if (!['cancelled', 'awaiting-assessment'].includes(j.status))
    throw new Error('This exact project is not awaiting resumption.');
  if (!j.specimens.length)
    throw new Error('No actual preserved portions exist to resume.');
  for (const id of j.specimens) {
    const s = c.world.stacks.find((s) => s.id === id);
    if (
      !s ||
      s.reservedFor ||
      (s.owner !== c.actor.id &&
        !(s.owner === null && v7Distance(s.position, c.actor.position) <= 0.65))
    )
      throw new Error(
        'Resume requires the same surviving owned or actually reachable portions; no replacement is supplied.',
      );
  }
  for (const id of j.specimens) {
    const s = c.world.stacks.find((s) => s.id === id);
    if (s) {
      s.owner = c.actor.id;
      s.position = { ...c.actor.position };
      s.reservedFor = contactKey(j.owner, j.id);
    }
  }
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  j.status = 'active';
  c.actor.extensionState['open:contact-work'] = j.id;
  contactProcess(c.world, j);
  return j;
}
