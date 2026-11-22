import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7Clone, v7Id, v7String } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { v7ShapeDistance } from './continuous-geometry.js';
import { forestEvent } from './forest-climate.js';
import {
  preservationInitialize,
  preservationPhysics,
  preservationTrayArea,
} from './open-preservation-physics.js';
export interface PreservationWork extends V7Data {
  id: string;
  owner: string;
  source: string;
  sample: string;
  tray: string;
  stage: number;
  paid: number;
  status: string;
  x: number;
  y: number;
  quantity: number;
  initialDecay: number;
  readings: V7Data[];
}
export const preservationKey = (owner: string, id: string) =>
  `preservation:work:${owner}:${id}`;
export function preservationWork(
  w: V7World,
  a: V7Actor,
  id: string,
): PreservationWork {
  const r = w.state[preservationKey(a.id, id)];
  if (!r || typeof r !== 'object' || Array.isArray(r))
    throw new Error('No exact personally owned preservation project.');
  return r as PreservationWork;
}
export function preservationAccessible(c: V7ActionContext, id: string) {
  const tray = c.world.objects.find((o) => o.id === id);
  if (!tray || v7ShapeDistance(c.actor.position, tray.spatial) > 0.65)
    throw new Error('Approach the actual maintained tray within 0.65.');
  preservationTrayArea(c.world, tray);
  return tray;
}
export function preservationStop(
  w: V7World,
  j: PreservationWork,
  reason: string,
  remove = false,
): void {
  if (j.status === 'stopped' || j.status === 'removed') return;
  const s = w.stacks.find((s) => s.id === j.sample),
    tray = w.objects.find((o) => o.id === j.tray);
  if (s) {
    delete s.reservedFor;
    s.owner = remove ? j.owner : null;
    s.position = tray
      ? { x: tray.spatial.x, y: tray.spatial.y }
      : { ...s.position };
    const d = preservationPhysics(s);
    if (d) {
      d.tray = '';
      d.area = 0;
    }
    s.processing = {
      ...s.processing,
      preservationEnded: {
        project: preservationKey(j.owner, j.id),
        reason,
        paid: j.paid,
        stage: j.stage,
      },
    };
  }
  if (
    tray?.data.preservation &&
    typeof tray.data.preservation === 'object' &&
    !Array.isArray(tray.data.preservation) &&
    tray.data.preservation.sample === j.sample
  )
    delete tray.data.preservation;
  w.processes = w.processes.filter(
    (p) => p.id !== preservationKey(j.owner, j.id),
  );
  const a = w.actors.find((a) => a.id === j.owner);
  if (a?.extensionState['preservation:active'] === j.id)
    delete a.extensionState['preservation:active'];
  j.status = remove ? 'removed' : 'stopped';
  forestEvent(
    w,
    'preservation-stopped',
    reason,
    s?.position ?? { x: j.x, y: j.y },
    j.owner,
    {
      operationId: preservationKey(j.owner, j.id),
      sample: j.sample,
      inputs: [j.source],
      paidEnergy: j.paid,
      remainingWork: 2 - j.stage,
      surviving: !!s,
    },
    j.tray,
  );
}
export function preservationAdvance(c: V7ActionContext, j: PreservationWork) {
  if (!['preparing', 'paused'].includes(j.status))
    throw new Error(
      'Only unfinished preparation can resume; passive work is already installed.',
    );
  const s = c.world.stacks.find(
    (s) =>
      s.id === j.sample && s.reservedFor === preservationKey(j.owner, j.id),
  );
  if (!s)
    throw new Error(
      'The original escrowed food is unavailable; no replacement is supplied.',
    );
  try {
    preservationAccessible(c, j.tray);
  } catch {
    return { complete: false, remaining: 2 - j.stage, writes: [] };
  }
  if (c.actor.vitals.energy < 0.5)
    return { complete: false, remaining: 2 - j.stage, writes: [] };
  v7Spend(c.actor, 0.5);
  j.paid += 0.5;
  j.stage++;
  j.status = j.stage === 2 ? 'passive' : 'preparing';
  j.x = c.actor.position.x;
  j.y = c.actor.position.y;
  c.actor.extensionState['preservation:active'] = j.id;
  const d = preservationPhysics(s);
  if (!d) throw new Error('Missing actual composition record');
  d.prepared = j.stage === 2;
  if (j.stage === 2) delete c.actor.extensionState['preservation:active'];
  c.emit(
    'preservation-progress',
    'Paid one remaining preparation stage on the same allocated food; no evidence or reward is granted.',
    {
      operationId: preservationKey(j.owner, j.id),
      owner: j.owner,
      inputs: [j.source],
      sample: s.id,
      paidEnergy: j.paid,
      remainingWork: 2 - j.stage,
      status: j.status,
    },
    j.tray,
  );
  return {
    complete: j.stage === 2,
    remaining: 2 - j.stage,
    writes: [s.id, j.tray],
  };
}
export function preservationPrepare(c: V7ActionContext) {
  const id = v7String(c.action.args.project, 'project'),
    key = preservationKey(c.actor.id, id);
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(id))
    throw new Error('Use a bounded stable personal project identity.');
  const prior = c.world.state[key];
  if (prior) {
    const j = preservationWork(c.world, c.actor, id);
    if (
      c.action.args.target !== j.source ||
      c.action.args.apparatus !== j.tray ||
      c.action.args.quantityTenths !== j.quantity * 10
    )
      throw new Error(
        'Continuing preparation must bind the original exact allocation.',
      );
    return preservationAdvance(c, j);
  }
  const n = c.action.args.quantityTenths;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0)
    throw new Error('Positive integer tenths of actual food are required.');
  const source = c.world.stacks.find(
    (s) =>
      s.id === c.action.args.target && s.owner === c.actor.id && !s.reservedFor,
  );
  if (!source || foodTenths(source.quantity) < n)
    throw new Error('Insufficient owned unreserved food.');
  const r = c.world.resources.find((r) => r.id === source.resource);
  if (
    !r ||
    r.nutrition <= 0 ||
    (r.properties?.decay && (source.decay ?? 0) >= r.properties.decay)
  )
    throw new Error('No surviving food batch to preserve.');
  const tray = preservationAccessible(
      c,
      v7String(c.action.args.apparatus, 'tray'),
    ),
    area = preservationTrayArea(c.world, tray);
  if (
    c.world.stacks.some(
      (s) =>
        preservationPhysics(s)?.tray === tray.id ||
        (s.owner === null && v7ShapeDistance(s.position, tray.spatial) < 0.01),
    )
  )
    throw new Error(
      'The actual tray already carries material; it cannot be allocated twice.',
    );
  const sample: V7Stack = {
    ...v7Clone(source),
    id: v7Id(c.world, 'item'),
    quantity: n / 10,
    quantityTenths: n,
    position: { x: tray.spatial.x, y: tray.spatial.y },
    reservedFor: key,
  };
  const d = preservationInitialize(c.world, sample);
  if (d.initialUnitMass * sample.quantity > 0.2 * area + 1e-8)
    throw new Error(
      `Actual thin-layer capacity is ${String(0.2 * area)} mass units; the selected batch does not fit.`,
    );
  if (c.actor.vitals.energy < 0.5)
    return { complete: false, remaining: 2, writes: [] };
  d.opening = 1.1;
  d.tray = tray.id;
  d.area = area;
  d.prepared = false;
  sample.processing = {
    ...sample.processing,
    preservationInput: {
      source: source.id,
      origin: source.origin,
      quantity: n / 10,
      harvestedAt: source.harvestedAt ?? null,
      decay: source.decay ?? 0,
      nutrition: (r.nutrition * n) / 10,
      toxins: (r.toxicity * n) / 10,
      damage:
        'Opened and manually softened; persistent 1.1 deterioration multiplier.',
    },
  };
  foodSetQuantity(source, foodTenths(source.quantity) - n);
  c.world.stacks.push(sample);
  const j: PreservationWork = {
    id,
    owner: c.actor.id,
    source: source.id,
    sample: sample.id,
    tray: tray.id,
    stage: 0,
    paid: 0,
    status: 'preparing',
    x: c.actor.position.x,
    y: c.actor.position.y,
    quantity: n / 10,
    initialDecay: sample.decay ?? 0,
    readings: [],
  };
  c.world.state[key] = j;
  c.world.processes.push({
    id: key,
    handler: 'open.preservation',
    owner: c.actor.id,
    object: tray.id,
    next: c.world.tick + 1,
    revision: 'measured-food-preservation@1',
    data: { owner: c.actor.id, project: id },
  });
  return preservationAdvance(c, j);
}
