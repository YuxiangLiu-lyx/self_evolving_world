import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7Object,
  V7World,
} from './continuous-types.js';
import {
  v7Clone,
  v7Id,
  v7RoundNumber,
  v7Signature,
} from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import {
  v7Obstacles,
  v7SegmentClear,
  v7ShapeDistance,
} from './continuous-geometry.js';
import { rootInitialize, rootProcessing } from './collective-root-food.js';
import {
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
  smallMaterialRevision,
  smallDryingAssessment,
  smallGeometry,
  smallOwned,
  smallSample,
  smallStone,
} from './collective-small-drying-assessment.js';
import {
  SMALL_DRYING,
  smallSite,
  smallSpatial,
  smallSupportValidity,
} from './collective-small-drying-site.js';

export interface SmallJob extends CollectiveWork {
  geometry: V7Data;
  foodId: string;
  startingFraction: number;
}
function support(c: V7ActionContext, g: V7Data, x: number, y: number) {
  const o: V7Object = {
    id: v7Id(c.world, 'object'),
    kind: 'small-root-drying-support',
    name: 'Small ground drying support',
    spatial: smallSpatial(x, y, g),
    visual: {
      component: 'small-root-drying',
      color: '#c6a374',
      accent: '#77867b',
      label: 'Partial paid construction',
      state: 'partial',
    },
    data: {
      geometry: v7Clone(g),
      components: [],
      foodId: null,
      owner: c.actor.id,
      remainingWork: 2,
      paidEnergy: 0,
    },
    createdBy: c.actor.id,
    createdAt: c.world.tick,
    revision: SMALL_DRYING + '@1',
  };
  c.world.objects.push(o);
  return o;
}
function requireSite(c: V7ActionContext, o: V7Object) {
  const excluded = [
      o.id,
      ...c.world.objects
        .filter((x) => x.data.smallSupport === o.id)
        .map((x) => x.id),
    ],
    state = smallSite(c.world, o.spatial, excluded),
    obstacles = v7Obstacles({
      ...c.world,
      objects: c.world.objects.filter((x) => !excluded.includes(x.id)),
    });
  return (
    state.bounds &&
    state.firm &&
    state.clear &&
    v7ShapeDistance(c.actor.position, o.spatial) <= c.actor.radius + 0.65 &&
    v7SegmentClear(c.actor.position, o.spatial, 0, obstacles)
  );
}
export function smallBeginBuild(c: V7ActionContext): SmallJob {
  const r = smallDryingAssessment(c.actor);
  if (!r || r.id !== c.action.args.assessmentId || r.suitable !== true)
    throw new Error('Use an exact personally retained passing assessment.');
  const bark = smallOwned(c, r.barkId),
    stones = (r.stoneIds as string[]).map((id) => smallOwned(c, id)),
    g = smallGeometry(c.world, bark),
    site = r.site as V7Data;
  if (
    smallMaterialRevision([bark, ...stones]) !==
      (
        c.world.state['small-drying:binding:' + c.actor.id] as
          V7Data | undefined
      )?.signature ||
    v7Signature(g) !== v7Signature(r.geometry)
  )
    throw new Error('Assessed materials changed; perform a new assessment.');
  const spatial = smallSpatial(Number(site.x), Number(site.y), g),
    conditions = smallSite(c.world, spatial);
  if (
    !conditions.bounds ||
    !conditions.clear ||
    !conditions.firm ||
    v7ShapeDistance(c.actor.position, spatial) > c.actor.radius + 0.65 ||
    !v7SegmentClear(c.actor.position, spatial, 0, v7Obstacles(c.world))
  )
    throw new Error('Assessed site is no longer clear, firm and reachable.');
  if (c.actor.vitals.energy < 0.5)
    throw new Error('Construction needs 0.5 energy per active round.');
  let remaining = 0.5;
  const stoneAllocations = stones.flatMap((s) => {
    const q = v7RoundNumber(Math.min(remaining, s.quantity));
    remaining = v7RoundNumber(remaining - q);
    return q > 0 ? [{ itemId: s.id, quantity: q }] : [];
  });
  if (remaining > 0 || !stones.every((s) => smallStone(c.world, s)))
    throw new Error('Actual suitable ballast is insufficient.');
  const allocations = workAllocations(c, [
    { itemId: bark.id, quantity: bark.quantity },
    ...stoneAllocations,
  ]);
  const j = workCreate(c, 'build', 2) as SmallJob,
    o = support(c, g, spatial.x, spatial.y);
  j.geometry = v7Clone(g);
  j.foodId = '';
  j.startingFraction = 0;
  j.target = o.id;
  j.x = spatial.x;
  j.y = spatial.y;
  workReserve(c, j, allocations, true);
  o.data.activeWork = j.id;
  o.data.assessment = v7Clone(r);
  return j;
}
export function smallBeginLoad(c: V7ActionContext, o: V7Object): SmallJob {
  if (
    o.data.activeWork ||
    o.data.foodId ||
    !smallSupportValidity(c.world, o).valid ||
    !requireSite(c, o)
  )
    throw new Error(
      'Require an empty physically valid reachable completed support.',
    );
  const s = smallOwned(c, c.action.args.sampleId),
    sample = smallSample(c.world, s);
  if (
    !sample.safe ||
    !Number.isFinite(sample.volume) ||
    sample.volume <= 0 ||
    sample.volume > 0.16 * 0.16 * 0.003
  )
    throw new Error(
      'The actual 0.1-root portion is unsafe, spoiled or exceeds the 0.003 m food layer.',
    );
  const prior = rootProcessing(c.world, s)?.fraction ?? 0,
    work = v7RoundNumber(0.2 * (1 - prior)),
    energy = work > 0 ? work : 0.1;
  if (c.actor.vitals.energy < energy)
    throw new Error('Insufficient energy for the real loading increment.');
  const j = workCreate(c, 'load', work > 0 ? work : 0.1) as SmallJob;
  j.target = o.id;
  j.x = o.spatial.x;
  j.y = o.spatial.y;
  j.geometry = v7Clone(o.data.geometry as V7Data);
  j.startingFraction = prior;
  workReserve(
    c,
    j,
    workAllocations(c, [{ itemId: s.id, quantity: 0.1 }]),
    true,
  );
  j.foodId = j.escrow[0] ?? '';
  o.data.activeWork = j.id;
  o.data.remainingWork = j.remainingWork;
  return j;
}
export function smallStop(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  reason: string,
) {
  const o = w.objects.find((o) => o.id === j.target);
  workStop(w, a, j, reason, true);
  for (const s of w.stacks.filter((s) => j.escrow.includes(s.id))) {
    s.processing = {
      ...s.processing,
      collectiveWorkReleased: j.id,
      previousOwner: j.owner,
    };
    const p = rootProcessing(w, s);
    if (p) {
      p.tray = '';
      p.drying = false;
    }
  }
  if (o) {
    if (j.mode === 'build')
      w.objects = w.objects.filter(
        (x) => x.id !== o.id && x.data.smallSupport !== o.id,
      );
    else {
      o.data.activeWork = null;
      o.data.remainingWork = 0;
    }
  }
  const e = w.events.at(-1);
  if (e) {
    e.type = 'small-drying-stopped';
    e.interface = SMALL_DRYING;
  }
}
export function smallAdvance(c: V7ActionContext, j: SmallJob) {
  if (!['active', 'paused'].includes(j.status))
    throw new Error('This work is already settled.');
  const o = c.world.objects.find((o) => o.id === j.target),
    parts = c.world.stacks.filter(
      (s) => j.escrow.includes(s.id) && s.reservedFor === j.id,
    );
  if (!o || parts.length !== j.escrow.length) {
    smallStop(
      c.world,
      c.actor,
      j,
      'Actual input or support was lost; surviving material released once.',
    );
    return workResult(j);
  }
  let valid =
    j.mode === 'build'
      ? parts.some(
          (s) =>
            s.resource === 'bark' &&
            s.quantity === Number(j.geometry.quantity) &&
            !s.processing?.fragmented,
        ) &&
        parts
          .filter((s) => s.resource === 'stone')
          .every((s) => smallStone(c.world, s))
      : smallSupportValidity(c.world, o).valid;
  if (j.mode === 'build') {
    const sheet = parts.find((s) => s.resource === 'bark');
    try {
      if (!sheet) throw new Error('Missing sheet.');
      const g = smallGeometry(c.world, sheet);
      valid =
        valid &&
        g.connected === true &&
        Number(g.holes) === 0 &&
        Number(g.condition) >= 0.8 &&
        Number(g.width) >= 0.2 - 1e-8 &&
        Number(g.height) >= 0.2 - 1e-8 &&
        Math.abs(Number(g.mass) - Number(j.geometry.mass)) < 1e-8 &&
        parts
          .filter((s) => s.resource === 'stone')
          .reduce((n, s) => n + s.quantity, 0) === 0.5 &&
        parts.every((s) => s.position.x === j.x && s.position.y === j.y);
    } catch {
      valid = false;
    }
  }
  if (!valid || !requireSite(c, o) || c.actor.vitals.health <= 0) {
    j.status = 'paused';
    j.reason =
      'Actual material, clear firm support or reach unavailable; work retained while food ages.';
    return workResult(j);
  }
  if (j.mode === 'build') {
    if (!workPay(c, j, 0.5)) return workResult(j);
  } else {
    if (j.lastPaid === c.world.tick)
      throw new Error('This work increment was already paid.');
    const effort = j.remainingWork;
    if (c.actor.vitals.energy < effort) {
      j.status = 'paused';
      j.reason = 'Insufficient energy; actual progress retained.';
      return workResult(j);
    }
    v7Spend(c.actor, effort);
    j.paidEnergy = v7RoundNumber(j.paidEnergy + effort);
    j.completedWork = v7RoundNumber(j.completedWork + effort);
    j.remainingWork = 0;
    j.lastPaid = c.world.tick;
    j.status = 'active';
    const food = parts.find((s) => s.id === j.foodId);
    if (!food) throw new Error('Actual reserved sample is missing.');
    const p = rootInitialize(c.world, food, c.actor.id);
    p.fraction = 1;
    food.processing = {
      ...food.processing,
      sourceOrigin: food.origin,
      completedBy: j.id,
    };
    food.origin = j.id;
    food.resource = 'crushed-root';
    c.emit(
      'process-progress',
      'Proportional sample crushing/transfer work paid once.',
      { ...j },
      o.id,
    );
  }
  delete j.reason;
  o.data.remainingWork = j.remainingWork;
  o.data.paidEnergy = j.paidEnergy;
  if (j.remainingWork > 0) return workResult(j);
  for (const s of parts) s.reservedFor = o.id;
  if (j.mode === 'build') {
    o.data.components = [...j.escrow];
    o.visual.state = 'ready';
    o.visual.label = 'Empty small drying support';
    const contact: V7Object = {
      id: v7Id(c.world, 'object'),
      assemblyParent: o.id,
      kind: 'small-drying-ballast',
      name: 'Actual stone ballast contact',
      spatial: {
        ...smallSpatial(o.spatial.x + 0.09, o.spatial.y, {
          width: 0.02,
          height: 0.16,
        }),
        solid: true,
        reserved: false,
      },
      visual: {
        component: 'small-root-drying',
        color: '#77867b',
        accent: '#39433d',
        label: 'Actual ballast',
        state: 'ready',
      },
      data: {
        smallSupport: o.id,
        components: parts
          .filter((s) => s.resource === 'stone')
          .map((s) => s.id),
      },
      createdBy: c.actor.id,
      createdAt: c.world.tick,
      revision: SMALL_DRYING + '@1',
    };
    c.world.objects.push(contact);
    c.emit(
      'small-drying-built',
      'Actual sheet and half-unit ballast assembled after two paid rounds; no food loaded or reward.',
      { ...j, support: o.id, contact: contact.id, components: j.escrow },
      o.id,
    );
  } else {
    const s = parts[0];
    if (!s) throw new Error('Missing actual sample.');
    const p = rootInitialize(c.world, s, c.actor.id);
    p.drying = true;
    p.tray = o.id;
    p.smallSupport = o.id;
    o.data.foodId = s.id;
    o.data.loadRecord = {
      actor: c.actor.id,
      tick: c.world.tick,
      foodId: s.id,
      quantity: s.quantity,
      water: s.physical?.unitWater ?? null,
      decay: s.decay ?? 0,
      volume: smallSample(c.world, s).volume,
      volumeBasis: smallSample(c.world, s).basis,
    };
    c.emit(
      'small-drying-loaded',
      'One actual 0.1-root sample loaded; passive exposure starts after completion.',
      {
        ...j,
        support: o.id,
        food: s.id,
        water: s.physical?.unitWater ?? null,
        decay: s.decay ?? 0,
      },
      o.id,
    );
  }
  o.data.activeWork = null;
  o.data.remainingWork = 0;
  j.status = 'completed';
  j.outputs = [o.id, ...j.escrow];
  return workResult(j);
}
export function smallCurrent(c: V7ActionContext) {
  return workFind(c) as SmallJob | undefined;
}
