import type {
  V7ActionContext,
  V7Object,
  V7Spatial,
  V7World,
  V7Actor,
} from './continuous-types.js';
import { v7Id, v7Json, v7Number, v7String } from './continuous-data.js';
import { v7ShapeDistance } from './continuous-geometry.js';
import { forestResolveReference } from './forest-references.js';
import { rootPlacement } from './collective-tray-placement.js';
import {
  collectiveJobs,
  workAllocations,
  workCreate,
  workFind,
  workPay,
  workReserve,
  workResult,
  workStop,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';
import {
  rootInitialize,
  rootProcessing,
  rootFoodProfile,
} from './collective-root-food.js';
interface RootJob extends CollectiveWork {
  foodIds: string[];
  toolIds: string[];
  startingFraction: number;
}
export function rootWorkSite(c: V7ActionContext, radius: number): V7Spatial {
  const x =
      c.action.args.x === undefined
        ? c.actor.position.x + c.actor.radius + radius + 0.05
        : v7Number(c.action.args.x, 'x'),
    y =
      c.action.args.y === undefined
        ? c.actor.position.y
        : v7Number(c.action.args.y, 'y');
  const spatial: V7Spatial = {
    x,
    y,
    angle: 0,
    shape: { kind: 'circle', radius },
    solid: false,
    reserved: true,
    interaction: 0.65,
    entrances: [],
  };
  const result = rootPlacement(c.world, c.actor, spatial, radius);
  if (result.error) throw new Error(result.error);
  return spatial;
}
export function rootWorkSurface(
  c: V7ActionContext,
  spatial: V7Spatial,
  kind: string,
  revision: string,
): V7Object {
  const o: V7Object = {
    id: v7Id(c.world, 'object'),
    kind,
    name:
      kind === 'root-work' ? 'Root preparation worksite' : 'Root drying tray',
    spatial,
    visual: {
      component: 'root-work-surface',
      color: '#b99e73',
      accent: '#7a8580',
      label: 'Paid root work',
      state: 'partial',
    },
    data: { components: [], food: null, activeWork: null, remainingWork: 0 },
    createdBy: c.actor.id,
    createdAt: c.world.tick,
    revision,
  };
  c.world.objects.push(o);
  return o;
}
function actualTray(c: V7ActionContext): V7Object {
  const id = forestResolveReference(
    c.world,
    c.actor,
    v7String(c.action.args.trayId, 'trayId'),
    'visible',
  );
  const o = c.world.objects.find(
    (o) =>
      o.id === id &&
      o.kind === 'root-drying-tray' &&
      o.visual.state === 'ready',
  );
  if (!o) throw new Error('An actual completed root drying tray is required.');
  if (v7ShapeDistance(c.actor.position, o.spatial) > c.actor.radius + 0.65)
    throw new Error('Move within reach of the actual tray.');
  return o;
}
function foodAllocation(c: V7ActionContext, maximum: number) {
  const quantity = v7Number(c.action.args.quantity, 'quantity', 1);
  if (!Number.isSafeInteger(quantity) || quantity > maximum)
    throw new Error(`Use 1–${String(maximum)} whole original root units.`);
  const values = workAllocations(c, [
    { itemId: c.action.args.inputStackId, quantity },
  ]);
  const s = values[0]?.stack,
    r = s
      ? (rootFoodProfile(c.world, s) ??
        c.world.resources.find((r) => r.id === s.resource))
      : undefined;
  if (
    !s ||
    !(
      r?.id === 'root' ||
      (c.action.interface === 'root-air-drying' && r?.id === 'crushed-root')
    ) ||
    r.nutrition !== 14 ||
    r.toxicity !== 0 ||
    (s.decay ?? 0) >= (r.properties?.decay ?? 0)
  )
    throw new Error('Require actual owned unspoiled safe meadow roots.');
  return values;
}
function tools(c: V7ActionContext, count: number) {
  const ids = count === 1 ? [c.action.args.stoneId] : c.action.args.stoneIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > count)
    throw new Error('Supply actual stone stack identities.');
  // One stack can hold both units, or two explicit stacks can provide one each.
  const allocations = workAllocations(c, [
    ...ids.map((itemId) => ({
      itemId,
      quantity: ids.length === 1 ? count : 1,
    })),
    { itemId: c.action.args.barkId, quantity: 1 },
  ]);
  if (
    allocations.some(
      (p, i) => p.stack.resource !== (i < ids.length ? 'stone' : 'bark'),
    )
  )
    throw new Error(
      'Actual reusable stone and bark are required; names cannot substitute materials.',
    );
  return allocations;
}
function begin(c: V7ActionContext, mode: string): RootJob {
  let o: V7Object;
  const food =
    mode === 'build' ? [] : foodAllocation(c, mode === 'load' ? 2 : 4);
  const implements_ = mode === 'load' ? [] : tools(c, mode === 'build' ? 2 : 1);
  if (mode === 'load') {
    o = actualTray(c);
    if (
      o.data.activeWork ||
      c.world.stacks.some(
        (s) =>
          s.reservedFor === o.id &&
          !(o.data.components as string[]).includes(s.id),
      )
    )
      throw new Error(
        'The actual tray is already occupied; unload or finish existing work.',
      );
    const components = c.world.stacks.filter(
      (s) =>
        s.reservedFor === o.id &&
        (o.data.components as string[]).includes(s.id),
    );
    if (
      components
        .filter((s) => s.resource === 'stone')
        .reduce((n, s) => n + s.quantity, 0) !== 2 ||
      components
        .filter((s) => s.resource === 'bark')
        .reduce((n, s) => n + s.quantity, 0) !== 1
    )
      throw new Error('The tray lacks its actual conserved components.');
  } else
    o = rootWorkSurface(
      c,
      rootWorkSite(c, mode === 'build' ? 0.4 : 0.3),
      mode === 'build' ? 'root-drying-tray' : 'root-work',
      mode === 'build' ? 'root-air-drying@1' : 'root-preparation@1',
    );
  const startingFraction = food[0]
    ? (rootProcessing(c.world, food[0].stack)?.fraction ?? 0)
    : 0;
  const j = workCreate(
    c,
    mode,
    mode === 'build'
      ? 2
      : Math.max(
          1,
          Math.ceil(2 * (food[0]?.quantity ?? 0) * (1 - startingFraction)),
        ),
  ) as RootJob;
  j.startingFraction = startingFraction;
  j.x = o.spatial.x;
  j.y = o.spatial.y;
  j.target = o.id;
  workReserve(c, j, food, true);
  j.foodIds = [...j.escrow];
  workReserve(c, j, implements_, true);
  j.toolIds = j.escrow.filter((id) => !j.foodIds.includes(id));
  o.data.activeWork = j.id;
  o.data.remainingWork = j.remainingWork;
  c.emit(
    'food-preparation-started',
    'Real inputs are reserved at the paid worksite; no food or capability was granted.',
    { ...j },
    o.id,
  );
  return j;
}
export function rootStop(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  reason: string,
) {
  const job = j as RootJob,
    o = w.objects.find((o) => o.id === j.target);
  workStop(w, a, j, reason, true);
  for (const s of w.stacks.filter((s) => job.foodIds.includes(s.id))) {
    const p = rootProcessing(w, s);
    if (p) p.tray = '';
  }
  if (o) {
    if (j.mode === 'load') {
      o.data.activeWork = null;
      o.data.remainingWork = 0;
      o.data.food = null;
    } else w.objects = w.objects.filter((x) => x.id !== o.id);
  }
}
function advance(c: V7ActionContext, j: RootJob) {
  const o = c.world.objects.find((o) => o.id === j.target),
    escrow = c.world.stacks.filter(
      (s) => j.escrow.includes(s.id) && s.reservedFor === j.id,
    );
  if (!o || escrow.length !== j.escrow.length) {
    rootStop(
      c.world,
      c.actor,
      j,
      'Worksite or perishable input was lost; surviving material released once.',
    );
    return workResult(j);
  }
  if (v7ShapeDistance(c.actor.position, o.spatial) > c.actor.radius + 0.65) {
    j.status = 'paused';
    j.reason = 'Out of actual reach; costs and progress retained.';
    return workResult(j);
  }
  if (!workPay(c, j, 1)) return workResult(j);
  for (const s of escrow.filter((s) => j.foodIds.includes(s.id))) {
    const p = rootInitialize(c.world, s, c.actor.id);
    p.fraction = Math.max(
      p.fraction,
      j.startingFraction +
        ((1 - j.startingFraction) * j.completedWork) / j.initialWork,
    );
    if (j.mode === 'load') {
      p.drying = true;
      p.tray = o.id;
    }
  }
  o.data.remainingWork = j.remainingWork;
  o.data.paidEnergy = j.paidEnergy;
  o.data.food = v7Json(
    escrow
      .filter((s) => j.foodIds.includes(s.id))
      .map((s) => ({
        id: s.id,
        quantity: s.quantity,
        processing: s.processing,
        decay: s.decay ?? 0,
      })),
  );
  if (j.remainingWork > 0) return workResult(j);
  for (const s of escrow) {
    if (j.foodIds.includes(s.id)) {
      s.resource = 'crushed-root';
      s.processing = {
        ...s.processing,
        sourceOrigin: s.origin,
        completedBy: j.id,
      };
      s.origin = j.id;
      j.outputs.push(s.id);
      if (j.mode === 'load') {
        s.reservedFor = o.id;
        s.owner = null;
      } else {
        delete s.reservedFor;
        s.owner = c.actor.id;
        s.position = { ...c.actor.position };
      }
    } else if (j.mode === 'build') {
      s.reservedFor = o.id;
    } else {
      delete s.reservedFor;
      s.processing = { ...s.processing, collectiveWorkReleased: j.id };
    }
  }
  if (j.mode === 'build') {
    o.data.components = j.toolIds;
    o.visual.state = 'ready';
    o.visual.label = 'Root drying tray';
    c.emit(
      'drying-tray-built',
      'Two paid rounds assembled actual stones and bark; no food is loaded.',
      { components: j.toolIds },
      o.id,
    );
  } else {
    c.emit(
      'food-preparation-completed',
      'Actual root crushing completed; conserved nutrition and mass, with no preservation from crushing alone.',
      { ...j },
      o.id,
    );
    if (j.mode === 'prepare')
      c.world.objects = c.world.objects.filter((x) => x.id !== o.id);
  }
  o.data.activeWork = null;
  o.data.remainingWork = 0;
  j.status = 'completed';
  c.emit('process-completed', 'Paid operation completed once.', { ...j }, o.id);
  return workResult(j);
}
export function rootExecute(c: V7ActionContext) {
  const mode = v7String(c.action.args.operation, 'operation');
  if (mode === 'unload' || mode === 'dismantle') {
    const o = actualTray(c);
    if (o.data.activeWork)
      throw new Error('Finish or cancel the active tray operation first.');
    const contents = c.world.stacks.filter((s) => s.reservedFor === o.id),
      food = contents.filter((s) => !!rootProcessing(c.world, s));
    if (
      food.some((s) => {
        const p = rootProcessing(c.world, s);
        return (
          p &&
          p.depositor !== c.actor.id &&
          c.world.actors.some(
            (a) => a.id === p.depositor && a.vitals.health > 0,
          )
        );
      })
    )
      throw new Error(
        'Stored food belongs to another living depositor; actual permission or transfer is required.',
      );
    if (mode === 'unload' && !food.length)
      throw new Error('The tray contains no actual food.');
    if (c.actor.vitals.energy < 1)
      throw new Error(
        'One energy is required; nothing is moved or dismantled.',
      );
    c.actor.vitals.energy--;
    for (const s of mode === 'unload' ? food : contents) {
      delete s.reservedFor;
      s.owner = mode === 'unload' ? c.actor.id : null;
      s.position =
        mode === 'unload'
          ? { ...c.actor.position }
          : { x: o.spatial.x, y: o.spatial.y };
      const p = rootProcessing(c.world, s);
      if (p) p.tray = '';
      else if (mode === 'dismantle')
        s.processing = {
          ...s.processing,
          collectiveWorkReleased: 'dismantled:' + o.id,
        };
    }
    o.data.food = null;
    if (mode === 'dismantle')
      c.world.objects = c.world.objects.filter((x) => x.id !== o.id);
    c.emit(
      'process-completed',
      mode === 'unload'
        ? 'Transferred the actual stored food; exposure and decay continue.'
        : 'Dismantled the actual tray; all components and food remain at its location.',
      { mode, items: contents.map((s) => s.id) },
      o.id,
    );
    return { complete: true, writes: [o.id, ...contents.map((s) => s.id)] };
  }
  let j = workFind(c) as RootJob | undefined;
  if (['prepare', 'build', 'load'].includes(mode)) {
    if (!j) j = begin(c, mode);
    else if (c.operation?.first !== false)
      throw new Error(
        'Existing personal work requires explicit continue or cancel.',
      );
  }
  if (!j) throw new Error('No exact existing personal operation.');
  if (mode === 'inspect') {
    c.emit(
      'process-inspected',
      'Actual paid work and remaining inputs.',
      { ...j },
      j.target,
    );
    return { complete: true, writes: [] };
  }
  if (mode === 'cancel') {
    rootStop(
      c.world,
      c.actor,
      j,
      'Explicit cancellation leaves actual partially processed food and tools; no effort refund.',
    );
    return workResult(j);
  }
  return advance(c, j);
}
export function rootMaintain(w: V7World, ability: string) {
  if (ability === 'root-air-drying')
    for (const o of w.objects.filter((o) => o.kind === 'root-drying-tray'))
      if (!w.stacks.some((s) => s.reservedFor === o.id && rootProcessing(w, s)))
        o.data.food = null;
  for (const j of collectiveJobs(w, ability).filter((j) =>
    ['active', 'paused'].includes(j.status),
  )) {
    const a = w.actors.find((a) => a.id === j.owner);
    if (
      a &&
      j.escrow.some(
        (id) => !w.stacks.some((s) => s.id === id && s.reservedFor === j.id),
      )
    )
      rootStop(
        w,
        a,
        j,
        'Perishable work input expired; survivors released once.',
      );
  }
}
