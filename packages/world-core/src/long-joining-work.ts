import type {
  V7ActionContext,
  V7Actor,
  V7Object,
  V7World,
} from './continuous-types.js';
import { v7Id, v7Json, v7Number, v7Signature } from './continuous-data.js';
import {
  v7Distance,
  v7Visible,
  v7ShapesOverlap,
  v7SegmentClear,
  v7Obstacles,
} from './continuous-geometry.js';
import { rootPlacement } from './collective-tray-placement.js';
import {
  collectiveJobs,
  workCreate,
  workFind,
  workPay,
  workResult,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import {
  JOIN_ID,
  JOIN_REV,
  joinPaths,
  joinSources,
} from './long-joining-geometry.js';
export function syncJoin(a: V7Actor, j: CollectiveWork) {
  if (['active', 'paused'].includes(j.status))
    a.extensionState['long:work:joining'] = v7Json(j);
  else {
    delete a.extensionState['long:work:joining'];
    a.extensionState['long:last-joining'] = v7Json(j);
  }
}
export function joinSite(
  c: V7ActionContext,
  p: { x: number; y: number },
  existing?: V7Object,
) {
  const others = c.world.objects.filter((o) => o.id !== existing?.id);
  const shape = {
    ...p,
    angle: 0,
    shape: { kind: 'circle' as const, radius: 0.2 },
    solid: false,
    reserved: true,
    interaction: 0.65,
    entrances: [],
  };
  const check = rootPlacement(
    { ...c.world, objects: others },
    c.actor,
    shape,
    0.2,
  );
  const ground = c.world.stacks.filter(
    (s) =>
      s.owner === null &&
      s.quantity > 0 &&
      !(existing && s.reservedFor === existing.id),
  );
  if (
    check.error ||
    v7Distance(c.actor.position, p) > 0.65 ||
    others.some((o) => v7ShapesOverlap(shape, o.spatial)) ||
    ground.some((s) => v7Distance(s.position, p) < 0.25)
  )
    throw new Error(
      check.error ??
        'Reach a currently clear radius0.2 worksite without real matter or other work.',
    );
  for (const path of [
    ...joinPaths(c.world, false),
    ...joinPaths(c.world, true),
  ])
    for (const q of path.points) {
      const point = { x: p.x + q.x, y: p.y + q.y };
      if (
        Math.hypot(q.x, q.y) + path.diameter / 2 > 0.2 ||
        v7Distance(c.actor.position, point) > c.actor.radius + 0.65 ||
        !v7Visible(c.world, c.actor.position, point) ||
        !v7SegmentClear(
          c.actor.position,
          point,
          0.005,
          v7Obstacles({ ...c.world, objects: others }),
          c.work,
        )
      )
        throw new Error(
          'All real manipulated extents need clear local access within the nominated footprint.',
        );
    }
  return shape;
}
export function stopJoin(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  reason: string,
) {
  if (!['active', 'paused'].includes(j.status))
    throw new Error('Joining work is already settled.');
  j.status = 'stopped';
  j.reason = reason;
  const o = w.objects.find((o) => o.id === j.target);
  if (o) {
    o.data.activeWork = null;
    o.data.stage = 'cancelled-positioned';
    o.spatial.reserved = false;
    o.visual.state = 'cancelled';
    o.visual.label = 'Positioned material; wrapping cancelled';
  }
  // Material remains allocated to its real placed assembly, not to a living worker.
  // These are containment references, not unreleased personal work locks.
  syncJoin(a, j);
}
export function joiningWork(c: V7ActionContext) {
  const mode = c.action.args.mode;
  let j = workFind(c),
    o = j ? c.world.objects.find((o) => o.id === j?.target) : undefined;
  if (mode === 'cancel') {
    if (!j || c.action.args.processId !== j.id)
      throw new Error('Cancel requires the exact unfinished personal process.');
    stopJoin(
      c.world,
      c.actor,
      j,
      'Cancelled; paid placement and physical material remain. Recovery is a separate paid local action.',
    );
    return workResult(j);
  }
  if (!j) {
    if (mode !== 'wrap')
      throw new Error('No exact unfinished wrapping process.');
    const knowledge = c.actor.memory.knowledge?.['joining-geometry'];
    if (!knowledge || c.action.args.measurementId !== knowledge.evidence)
      throw new Error('Supply the exact personal geometry measurement event.');
    const sources = joinSources(c),
      paths = joinPaths(c.world, false);
    const expected = paths.map((p) => p.id);
    if (
      c.action.args.branchPieceA !== expected[0] ||
      c.action.args.branchPieceB !== expected[1] ||
      c.action.args.vinePiece !== expected[2] ||
      c.action.args.segmentStart !== 0 ||
      c.action.args.segmentEnd !== 1
    )
      throw new Error(
        'Select the measured two distinct branches and whole continuous vine endpoints0..1; fractional allocation is not implemented.',
      );
    const p = {
        x: v7Number(c.action.args.x, 'x'),
        y: v7Number(c.action.args.y, 'y'),
      },
      spatial = joinSite(c, p);
    if (c.actor.vitals.energy < 0.5)
      throw new Error('Positioning requires0.5 energy.');
    j = workCreate(c, 'wrap', 2);
    j.x = p.x;
    j.y = p.y;
    j.measurementId = knowledge.evidence;
    j.selection = v7Json(c.action.args);
    j.sources = sources.map((s) => ({
      itemId: s.id,
      quantity: s.quantity,
      origin: s.origin,
    }));
    o = {
      id: v7Id(c.world, 'loose-wrap'),
      kind: 'loose-wrap-trial',
      name: 'Ground-supported loose wrapping trial',
      spatial,
      visual: {
        component: 'loose-wrap',
        color: '#92734d',
        accent: '#9baf67',
        label: 'Actual pieces positioned; wrap unfinished',
        state: 'partial',
      },
      data: {
        stage: 'positioned',
        paths: v7Json(paths),
        parts: sources.map((s) => s.id),
        activeWork: j.id,
        completedWork: 1,
        remainingWork: 1,
        force: null,
        utility: 'unverified',
      },
      createdBy: c.actor.id,
      createdAt: c.world.tick,
      revision: JOIN_REV,
    };
    j.target = o.id;
    c.world.objects.push(o);
    for (const s of sources) {
      s.owner = null;
      s.position = { ...p };
      s.reservedFor = o.id;
    }
    j.placed = sources.map((s) => s.id);
    workPay(c, j, 0.5);
    syncJoin(c.actor, j);
    c.emit(
      'joining-positioned',
      'Placed actual whole pieces on the ground; no attachment or strength established.',
      { processId: j.id, arrangementId: o.id, qualified: false },
      o.id,
    );
    return workResult(j);
  }
  if (
    !o ||
    !['active', 'paused'].includes(j.status) ||
    (mode === 'resume' && c.action.args.processId !== j.id)
  )
    throw new Error('Resume the exact existing unfinished wrapping operation.');
  if (
    mode === 'wrap' &&
    v7Signature(c.action.args) !== v7Signature(j.selection)
  )
    throw new Error('A new selection cannot replace already paid work.');
  try {
    joinSources(c, o.id);
    joinSite(c, o.spatial, o);
  } catch (error) {
    j.status = 'paused';
    j.reason =
      error instanceof Error
        ? error.message
        : 'Physical prerequisites changed.';
    syncJoin(c.actor, j);
    return workResult(j);
  }
  if (!workPay(c, j, 0.5)) {
    syncJoin(c.actor, j);
    return workResult(j);
  }
  o.data.paths = v7Json(joinPaths(c.world, true));
  o.data.stage = 'wrapped-unverified';
  o.data.activeWork = null;
  o.data.completedWork = 2;
  o.data.remainingWork = 0;
  o.spatial.reserved = false;
  o.visual.label = 'Loose wrap; strength untested';
  o.visual.state = 'wrapped-unverified';
  j.status = 'completed';
  j.outputs = [o.id];
  syncJoin(c.actor, j);
  c.emit(
    'joining-wrapped',
    'Completed one actual loose unknotted wrap; no calibrated force, joint strength or practical utility established.',
    {
      processId: j.id,
      arrangementId: o.id,
      paidEnergy: j.paidEnergy,
      qualified: false,
    },
    o.id,
  );
  return workResult(j);
}
export function joiningDeath(w: V7World, a: V7Actor) {
  for (const j of collectiveJobs(w, JOIN_ID).filter(
    (j) => j.owner === a.id && ['active', 'paused'].includes(j.status),
  ))
    stopJoin(
      w,
      a,
      j,
      'Actor died; placed matter remains; no remote return or refund.',
    );
}
