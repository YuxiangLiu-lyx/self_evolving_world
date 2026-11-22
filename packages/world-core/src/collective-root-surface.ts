import { rootToolPredicate } from './collective-tool-predicate.js';
import type {
  V7ActionContext,
  V7Data,
  V7Stack,
  V7World,
  V7Actor,
} from './continuous-types.js';
import {
  v7Clone,
  v7Json,
  v7Number,
  v7String,
  v7RoundNumber,
} from './continuous-data.js';
import { foodTenths, foodUnitMass } from './forest-food-accounting.js';
import { collectiveFoodProfile } from './collective-food-profile.js';
import { forestResolveReference } from './forest-references.js';
import { forestEvent } from './forest-climate.js';
import { v7Spend } from './continuous-base.js';
import {
  v7Distance,
  v7ShapeDistance,
  v7Obstacles,
  v7SegmentClear,
  v7ShapesOverlap,
} from './continuous-geometry.js';
import { openConditions } from './open-physical.js';
import { openRemember } from './open-foundation.js';
import {
  rootExecute,
  rootWorkSite,
  rootWorkSurface,
  rootStop,
} from './collective-root-work.js';
import { rootInitialize, rootProcessing } from './collective-root-food.js';
import {
  collectiveJobs,
  workAllocations,
  workCreate,
  workFind,
  workReserve,
  workResult,
} from './collective-work.js';
import type { CollectiveWork } from './collective-work.js';

export const ROOT_SURFACE = 'root-preparation-surface';
interface SurfaceJob extends CollectiveWork {
  foodIds: string[];
  toolIds: string[];
  startingFraction: number;
  quantity: number;
  geometry: V7Data;
}
export function surfaceOwned(c: V7ActionContext, key: string) {
  const id = forestResolveReference(
    c.world,
    c.actor,
    v7String(c.action.args[key], key),
    'owned',
    0.1,
  );
  const s = c.world.stacks.find((s) => s.id === id);
  if (!s) throw new Error('Actual implement is unavailable.');
  return s;
}
export function surfaceGeometry(w: V7World, s: V7Stack): V7Data {
  const mass = foodUnitMass(w, s) * s.quantity,
    record = s.processing?.rootSurface;
  if (record && typeof record === 'object' && !Array.isArray(record)) {
    if (
      record.quantity !== s.quantity ||
      Math.abs(Number(record.mass) - mass) > 1e-8
    )
      throw new Error(
        'Sheet quantity or mass changed; its previous connected geometry is no longer established.',
      );
    return v7Clone(record);
  }
  const lot = s.componentLots?.length === 1 ? s.componentLots[0] : s;
  if (s.componentLots && s.componentLots.length !== 1)
    throw new Error(
      'Combining separate supplies does not join their sheets. Select one actual connected piece.',
    );
  if (
    !lot ||
    s.resource !== 'bark' ||
    lot.processing?.separated !== true ||
    lot.processing.fragmented === true ||
    lot.processing.barkFines ||
    lot.processing.wovenDamage
  )
    throw new Error(
      'No represented connected extraction-derived bark sheet; fines and fragmented material cannot be inferred intact.',
    );
  const prior = lot.materialLayer;
  if (
    prior &&
    (typeof prior.width !== 'number' || typeof prior.height !== 'number')
  )
    throw new Error(
      'Existing material geometry cannot be replaced by an assumed sheet.',
    );
  const density = prior
    ? v7Number(prior.density, 'actual sheet density', 0.001)
    : 500;
  const thickness = prior
    ? v7Number(prior.thickness, 'actual sheet thickness', 0.000001)
    : 0.003;
  const area = mass / density / thickness;
  const width = prior
    ? v7Number(prior.width, 'sheet width', 0)
    : Math.sqrt(area * 1.5);
  const height = prior
    ? v7Number(prior.height, 'sheet height', 0)
    : Math.sqrt(area / 1.5);
  if (width * height * density * thickness > mass + 1e-8)
    throw new Error(
      'Represented sheet geometry exceeds its actual conserved mass.',
    );
  return {
    mass,
    quantity: s.quantity,
    width,
    height,
    density,
    thickness,
    connected: prior ? prior.connected === true : true,
    holes: prior ? Number(prior.holes ?? 0) : 0,
    condition: prior ? Number(prior.condition ?? 1) : 1,
    source: s.id,
    origin: s.origin,
    basis: prior
      ? 'Retained represented geometry; no replacement dimensions.'
      : 'Model-derived rectangular sheet: density 500 kg/m3, thickness 0.003 m, aspect ratio 1.5. Dimensions are not personal measurements.',
    uncertainty: prior
      ? 'Applicability depends on retained condition and actual support.'
      : 'Single unfragmented extraction lot is modelled as one sheet; continuity and dimensions are an explicit reviewed assumption.',
    footprint: { width: 0.16, height: 0.16 },
  };
}
function adequacy(
  w: V7World,
  sheet: V7Stack,
  stone: V7Stack,
  geometry: V7Data,
) {
  const missing: string[] = [];
  if (
    geometry.connected !== true ||
    Number(geometry.holes) > 0 ||
    Number(geometry.condition) < 0.8
  )
    missing.push(
      'An intact connected sheet without holes and condition at least 0.8.',
    );
  if (Number(geometry.width) < 0.16 || Number(geometry.height) < 0.16)
    missing.push(
      'A usable 0.16 by 0.16 metre rectangle including containment margin.',
    );
  if ((collectiveFoodProfile(w, sheet)?.properties?.flexibility ?? 0) < 1)
    missing.push('A flexible containing sheet.');
  if (!rootToolPredicate(w, stone).suitable)
    missing.push('One actual usable stone with intrinsic hardness at least 3.');
  return missing;
}
function siteContext(c: V7ActionContext) {
  const raw = c.action.args.site;
  if (
    raw !== undefined &&
    (!raw || typeof raw !== 'object' || Array.isArray(raw))
  )
    throw new Error('Site requires actual x and y coordinates.');
  return {
    ...c,
    action: {
      ...c.action,
      args: { ...c.action.args, ...(raw as V7Data | undefined) },
    },
  };
}
export function surfaceRemember(
  c: V7ActionContext,
  geometry: V7Data,
  suitable: boolean,
  trial = false,
) {
  openRemember(c, {
    key: `bark:grounded-root-surface:${trial ? 'performed' : 'assessed'}:${suitable ? 'sufficient' : 'insufficient'}`,
    subject: 'bark',
    property: trial
      ? 'actual small-root preparation on a containing sheet'
      : 'surface adequacy under the recorded geometric model',
    value: { suitable, geometry: v7Json(geometry), trial },
    method: trial
      ? 'Actual paid crushing with real sheet, stone and support'
      : 'Paid assessment of actual material using retained or explicitly modelled geometry',
    condition:
      'A containing sheet on firm support, not freestanding impact support. Dimensions retain their stated uncertainty.',
    verified: true,
  });
  const e = c.world.events.at(-1);
  if (e?.type === 'information-confirmed') e.data.practiceEligible = false;
}
function assess(c: V7ActionContext) {
  const sheet = surfaceOwned(c, 'barkId'),
    stone = surfaceOwned(c, 'toolId'),
    geometry = surfaceGeometry(c.world, sheet),
    missing = adequacy(c.world, sheet, stone, geometry);
  let spatial = null;
  try {
    spatial = rootWorkSite(
      siteContext(c),
      Math.max(
        0.2,
        Math.hypot(Number(geometry.width), Number(geometry.height)) / 2,
      ),
    );
    if (!v7SegmentClear(c.actor.position, spatial, 0, v7Obstacles(c.world)))
      missing.push('Unobstructed access to the actual supporting patch.');
  } catch (error: unknown) {
    missing.push(
      error instanceof Error
        ? error.message
        : 'Actual supporting site unavailable.',
    );
  }
  v7Spend(c.actor, 0.2);
  sheet.processing ??= {};
  sheet.processing.rootSurface = geometry;
  const row = {
    sheetId: sheet.id,
    toolId: stone.id,
    geometry,
    suitable: missing.length === 0,
    missing,
    site: spatial ? v7Json(spatial) : null,
    costs: { energy: 0.2, rounds: 1 },
  };
  c.emit(
    'root-surface-assessed',
    'Actual fractional surface assessment; dimensions retain their explicit model or measurement basis.',
    row,
    sheet.id,
  );
  surfaceRemember(c, geometry, missing.length === 0);
  return { complete: true, writes: [sheet.id] };
}
function begin(c: V7ActionContext): SurfaceJob {
  const sheet = surfaceOwned(c, 'barkId'),
    stone = surfaceOwned(c, 'toolId'),
    geometry = surfaceGeometry(c.world, sheet);
  if (!sheet.processing?.rootSurface)
    throw new Error(
      'Perform a paid assessment of this actual sheet before preparation.',
    );
  const missing = adequacy(c.world, sheet, stone, geometry);
  if (missing.length) throw new Error(missing.join(' '));
  const quantity = v7Number(
    c.action.args.quantity ?? 1,
    'selected root quantity',
    0.1,
    1,
  );
  foodTenths(quantity);
  const food = workAllocations(c, [{ itemId: c.action.args.rootId, quantity }]);
  const input = food[0]?.stack;
  if (!input || input.resource !== 'root' || input.componentLots)
    throw new Error(
      'Select actual uncombined meadow roots; no food is supplied.',
    );
  const r = collectiveFoodProfile(c.world, input);
  if (
    r?.nutrition !== 14 ||
    r.toxicity !== 0 ||
    (input.decay ?? 0) >= (r.properties?.decay ?? 0)
  )
    throw new Error('Require actual unspoiled safe meadow roots.');
  const spatial = rootWorkSite(
    siteContext(c),
    Math.max(
      0.2,
      Math.hypot(Number(geometry.width), Number(geometry.height)) / 2,
    ),
  );
  if (!v7SegmentClear(c.actor.position, spatial, 0, v7Obstacles(c.world)))
    throw new Error('The actual support patch has obstructed access.');
  const o = rootWorkSurface(c, spatial, 'root-work', 'root-preparation@2');
  o.name = 'Fractional sheet preparation';
  const fraction = rootProcessing(c.world, input)?.fraction ?? 0;
  if (fraction >= 1)
    throw new Error('This root portion is already fully prepared.');
  const j = workCreate(
    c,
    'prepare-small',
    v7RoundNumber(2 * quantity * (1 - fraction)),
  ) as SurfaceJob;
  j.x = spatial.x;
  j.y = spatial.y;
  j.target = o.id;
  j.quantity = quantity;
  j.geometry = geometry;
  j.startingFraction = fraction;
  workReserve(c, j, food, true);
  j.foodIds = [...j.escrow];
  workReserve(
    c,
    j,
    workAllocations(c, [
      { itemId: stone.id, quantity: 1 },
      { itemId: sheet.id, quantity: sheet.quantity },
    ]),
    true,
  );
  j.toolIds = j.escrow.filter((id) => !j.foodIds.includes(id));
  o.data = {
    ...o.data,
    activeWork: j.id,
    remainingWork: j.remainingWork,
    geometry,
    food: null,
  };
  c.emit(
    'food-preparation-started',
    'Only the selected root portion and actual reusable implements were reserved.',
    { ...j },
    o.id,
  );
  return j;
}
export function surfaceStop(
  w: V7World,
  a: V7Actor,
  j: CollectiveWork,
  reason: string,
) {
  rootStop(w, a, j, reason);
  forestEvent(
    w,
    'root-preparation-stopped',
    reason,
    { x: j.x, y: j.y },
    a.id,
    { ...j },
    j.id,
  );
}
function advance(c: V7ActionContext, j: SurfaceJob) {
  if (!['active', 'paused'].includes(j.status))
    throw new Error('This operation is already settled.');
  const o = c.world.objects.find((o) => o.id === j.target),
    escrow = c.world.stacks.filter(
      (s) => j.escrow.includes(s.id) && s.reservedFor === j.id,
    ),
    food = escrow.find((s) => j.foodIds.includes(s.id)),
    stone = escrow.find((s) => s.resource === 'stone'),
    sheet = escrow.find((s) => s.resource === 'bark');
  if (!o || !food || !stone || !sheet) {
    surfaceStop(
      c.world,
      c.actor,
      j,
      'Actual input or work patch was lost; surviving material released once.',
    );
    return workResult(j);
  }
  const obstacles = v7Obstacles(c.world).filter((s) => s !== o.spatial),
    p = openConditions(c.world, o.spatial);
  const clear =
    !obstacles.some((s) => v7ShapesOverlap(s, o.spatial)) &&
    !c.world.actors.some(
      (a) =>
        a.vitals.health > 0 &&
        v7Distance(a.position, o.spatial) <
          a.radius +
            (o.spatial.shape.kind === 'circle' ? o.spatial.shape.radius : 0.2),
    );
  const effort = v7RoundNumber(Math.min(1, j.remainingWork));
  if (
    c.actor.vitals.health <= 0 ||
    c.actor.vitals.energy < effort ||
    v7ShapeDistance(c.actor.position, o.spatial) > c.actor.radius + 0.65 ||
    !clear ||
    !v7SegmentClear(c.actor.position, o.spatial, 0, obstacles) ||
    ['~', '=', ','].includes(p.ground) ||
    p.waterlogging > 0.1 ||
    adequacy(c.world, sheet, stone, j.geometry).length
  ) {
    j.status = 'paused';
    j.reason =
      'Actual reach, clear firm support, usable implements or sufficient energy is unavailable; food keeps aging.';
    return workResult(j);
  }
  if (j.lastPaid === c.world.tick)
    throw new Error('This work increment was already paid.');
  v7Spend(c.actor, effort);
  j.paidEnergy = v7RoundNumber(j.paidEnergy + effort);
  j.completedWork = v7RoundNumber(j.completedWork + effort);
  j.remainingWork = v7RoundNumber(j.remainingWork - effort);
  j.lastPaid = c.world.tick;
  j.status = 'active';
  delete j.reason;
  const processing = rootInitialize(c.world, food, c.actor.id);
  processing.fraction =
    j.startingFraction +
    ((1 - j.startingFraction) * j.completedWork) / j.initialWork;
  o.data.remainingWork = j.remainingWork;
  o.data.paidEnergy = j.paidEnergy;
  o.data.food = v7Json([
    {
      id: food.id,
      quantity: food.quantity,
      processing: food.processing,
      decay: food.decay ?? 0,
    },
  ]);
  c.emit(
    'process-progress',
    'Actual fractional crushing work paid once; other roots remain untouched.',
    { ...j },
    j.id,
  );
  if (j.remainingWork > 0) return workResult(j);
  food.resource = 'crushed-root';
  food.processing = {
    ...food.processing,
    sourceOrigin: food.origin,
    completedBy: j.id,
  };
  food.origin = j.id;
  for (const s of escrow) {
    delete s.reservedFor;
    s.owner = s.id === food.id ? c.actor.id : null;
    s.position = s.owner ? { ...c.actor.position } : { x: j.x, y: j.y };
  }
  j.outputs = [food.id];
  j.status = 'completed';
  c.world.objects = c.world.objects.filter((x) => x.id !== o.id);
  c.emit(
    'food-preparation-completed',
    'Only the actually reserved root portion was crushed; nutrition, age and mass retained, with no preservation benefit.',
    { ...j },
    food.id,
  );
  surfaceRemember(c, j.geometry, true, true);
  return workResult(j);
}
export function surfaceExecute(original: V7ActionContext) {
  const mode = v7String(original.action.args.operation, 'operation');
  const explicit = original.action.args.processId;
  if (
    original.action.interface === 'root-preparation' &&
    !['assess-surface', 'prepare-small', 'status'].includes(mode) &&
    ((typeof explicit === 'string' &&
      collectiveJobs(original.world, 'root-preparation').some(
        (j) => j.id === explicit && j.owner === original.actor.id,
      )) ||
      (explicit === undefined &&
        collectiveJobs(original.world, 'root-preparation').some(
          (j) =>
            j.owner === original.actor.id &&
            ['active', 'paused'].includes(j.status),
        )))
  )
    return rootExecute(original);
  const c = {
    ...original,
    action: { ...original.action, interface: ROOT_SURFACE },
  };
  const job = workFind(c) as SurfaceJob | undefined;
  const selected =
    job?.mode === 'prepare-small' &&
    ['continue', 'cancel', 'status', 'inspect'].includes(mode);
  if (
    !selected &&
    !['assess-surface', 'prepare-small', 'status'].includes(mode) &&
    original.action.interface === 'root-preparation'
  )
    return rootExecute(original);
  if (!c.actor.mastered.includes(ROOT_SURFACE))
    throw new Error(
      'Fractional surface setup requires separate individual root-preparation-surface study. Legacy preparation is unchanged.',
    );
  if (mode === 'assess-surface') return assess(c);
  if (['status', 'inspect', 'cancel'].includes(mode)) {
    if (!original.action.args.processId || !job)
      throw new Error('Name the exact personal processId.');
    if (mode === 'cancel') {
      surfaceStop(
        c.world,
        c.actor,
        job,
        'Cancelled; actual partial roots and reusable implements remain at the supporting patch.',
      );
      return workResult(job);
    }
    c.emit(
      'process-inspected',
      'Actual fractional work and original surface geometry.',
      { ...job },
      job.id,
    );
    return { complete: true, writes: [] };
  }
  if (mode === 'prepare-small') {
    if (job && c.operation?.first !== false)
      throw new Error(
        'Continue or cancel the actual existing operation; no replacement roots or implements.',
      );
    return advance(c, job ?? begin(c));
  }
  if (mode !== 'continue' || !job || !original.action.args.processId)
    throw new Error('No exact ongoing fractional preparation.');
  return advance(c, job);
}
