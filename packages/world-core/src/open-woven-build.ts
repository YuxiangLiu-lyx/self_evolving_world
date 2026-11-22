import type {
  V7ActionContext,
  V7World,
  V7Actor,
  V7Object,
  V7Stack,
  V7Data,
} from './continuous-types.js';
import { v7Id, v7Json, v7Number, v7String } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import {
  v7ShapesOverlap,
  v7ShapeDistance,
  v7SegmentClear,
} from './continuous-geometry.js';
import { foodUnitMass, foodTenths } from './forest-food-accounting.js';
import { wovenLaw } from './open-woven-physics.js';
import { wovenTested, wovenTool } from './open-woven-tests.js';
import {
  wovenActive,
  wovenCreate,
  wovenInputs,
  wovenReserve,
  wovenConsume,
} from './open-woven-work.js';
export function wovenShape(
  x: number,
  y: number,
  mesh = false,
): V7Object['spatial'] {
  return {
    x,
    y,
    angle: 0,
    shape: { kind: 'rectangle', width: mesh ? 0.4 : 0.8, height: 0.4 },
    solid: true,
    interaction: 0.65,
    entrances: [],
  };
}
export function wovenPlacement(w: V7World, a: V7Actor, x: number, y: number) {
  const shapes = [wovenShape(x, y), wovenShape(x, y + 0.65, true)];
  for (const p of shapes) {
    const half = p.shape.kind === 'rectangle' ? p.shape.width / 2 : 0;
    if (
      p.x - half < 0 ||
      p.x + half > w.config.width ||
      p.y - 0.2 < 0 ||
      p.y + 0.2 > w.config.height ||
      v7ShapeDistance(a.position, p) > 0.65
    )
      throw new Error(
        'Both actual footprints and hand access must lie within bounds and 0.65 reach.',
      );
    for (let yy = Math.floor(p.y - 0.2); yy <= Math.floor(p.y + 0.2); yy++)
      for (let xx = Math.floor(p.x - half); xx <= Math.floor(p.x + half); xx++)
        if (['~', '='].includes(w.terrain[yy]?.[xx] ?? '~'))
          throw new Error('Apparatus requires supported dry ground.');
    if (
      w.objects.some(
        (o) =>
          (o.spatial.solid || o.spatial.reserved) &&
          v7ShapesOverlap(p, o.spatial),
      ) ||
      w.actors.some(
        (a) => !v7SegmentClear(a.position, a.position, a.radius, [p]),
      )
    )
      throw new Error('Actual object/actor collision prevents this placement.');
  }
  if (
    v7ShapesOverlap(
      shapes[0] ?? wovenShape(x, y),
      shapes[1] ?? wovenShape(x, y, true),
    )
  )
    throw new Error('Balance and mesh cannot overlap.');
  return shapes;
}
function unique(
  stacks: V7Stack[],
  resource: string,
  quantity: number,
): V7Stack {
  const found = stacks.filter(
    (s) => s.resource === resource && s.quantity >= quantity && !s.reservedFor,
  );
  if (found.length !== 1 || !found[0])
    throw new Error(
      `Explicitly allocate one sufficient ${resource}; actual matching controls: ${found.map((s) => s.id).join(', ') || 'none'}.`,
    );
  return found[0];
}
export function wovenBuild(c: V7ActionContext) {
  const { world: w, actor: a } = c;
  let j = wovenActive(w, a);
  if (!j) {
    const branch = w.stacks.find(
      (s) =>
        s.id === c.action.args.target &&
        s.owner === a.id &&
        s.resource === 'branch' &&
        s.quantity >= 1 &&
        !s.reservedFor,
    );
    if (!branch) throw new Error('One actual owned branch unit is required.');
    const controls = wovenInputs(c),
      vine = unique(controls, 'vine', 3),
      stones = controls.filter((s) => wovenTool(w, s.id, a.id));
    if (
      stones.length !== 2 ||
      !stones[0] ||
      !stones[1] ||
      controls.some((s) => s.id === branch.id)
    )
      throw new Error(
        'Allocate vine and two distinct real hard stones: retained tool first, subdivision source second. No duplicate input.',
      );
    const beamTest = wovenTested(w, a.id, branch),
      vineTest = wovenTested(w, a.id, vine);
    if (!beamTest || !vineTest)
      throw new Error(
        'Personal successful beam and dry/wet vine tests of these actual source batches are required.',
      );
    const safe = Math.min(
      Number(beamTest.safeWorkingLoad),
      Number(vineTest.safeWorkingLoad),
    );
    const componentMass = foodUnitMass(w, branch) + 3 * foodUnitMass(w, vine),
      designLoad = (componentMass + 0.4) * 9.81;
    if (!Number.isFinite(safe) || safe < 2 * designLoad)
      throw new Error(
        'Measured conservative safe loads do not exceed the computed loaded assembly force by a factor of two.',
      );
    const x = v7Number(c.action.args.x, 'placement x'),
      y = v7Number(c.action.args.y, 'placement y'),
      shapes = wovenPlacement(w, a, x, y);
    if (a.vitals.energy < 0.5)
      return { complete: false, remaining: 14, writes: [] };
    j = wovenCreate(c, 'assemble', 17);
    j.tools = [stones[0].id];
    j.x = x;
    j.y = y;
    j.safeLoad = safe;
    j.designLoad = designLoad;
    j.componentMass = componentMass;
    const beam = wovenReserve(c, j, branch, 1),
      suspension = wovenReserve(c, j, vine, 1),
      baskets = wovenReserve(c, j, vine, 1),
      mesh = wovenReserve(c, j, vine, 1),
      stone = wovenReserve(c, j, stones[1], 1);
    j.allocations = {
      beam: beam.id,
      suspension: suspension.id,
      baskets: baskets.id,
      mesh: mesh.id,
      stone: stone.id,
    };
    j.balance = v7Id(w, 'object');
    j.mesh = v7Id(w, 'object');
    for (const [id, spatial, kind] of [
      [j.balance, shapes[0], 'balance'],
      [j.mesh, shapes[1], 'mesh'],
    ] as const) {
      if (!spatial) throw new Error('Missing validated footprint');
      w.objects.push({
        id,
        kind: 'woven-site',
        name: `Incomplete woven ${kind}`,
        spatial,
        visual: {
          component: 'rock',
          color: '#b5a26c',
          accent: '#e4d3a4',
          label: 'Unfinished woven apparatus',
          state: 'working',
        },
        data: {
          variant: 'woven',
          project: j.id,
          part: kind,
          progress: 0,
          calibrated: false,
          service: 200,
        },
        createdBy: a.id,
        createdAt: w.tick,
        revision: 'assay-woven-supports@1',
      });
    }
  }
  if (j.stage >= 14)
    throw new Error(
      'Assembly is finished but the actual instrument requires explicit calibration.',
    );
  const balance = w.objects.find((o) => o.id === j.balance),
    mesh = w.objects.find((o) => o.id === j.mesh);
  if (!balance || !mesh)
    throw new Error('The real partial apparatus no longer exists.');
  if (
    [balance, mesh].some((o) => v7ShapeDistance(a.position, o.spatial) > 0.65)
  )
    throw new Error(
      'Actual hand access to both partial apparatuses is required.',
    );
  if (!wovenTool(w, j.tools[0] ?? '', a.id) || a.vitals.energy < 0.5)
    return { complete: false, remaining: 14 - j.stage, writes: [] };
  v7Spend(a, 0.5);
  j.paid += 0.5;
  j.stage++;
  const allocations = j.allocations as V7Data;
  const take = (field: string, component: string) =>
    wovenConsume(
      w,
      j,
      v7String(allocations[field], 'allocated component'),
      component,
    );
  if (j.stage === 1) take('beam', 'beam');
  if (j.stage === 3) take('suspension', 'suspension');
  if (j.stage === 5) take('baskets', 'two woven baskets');
  if (j.stage === 9) take('mesh', 'woven mesh');
  if (j.stage === 12) {
    const source = j.components.find((p) => p.component === 'woven mesh');
    if (!source) throw new Error('Missing actual woven fibres.');
    const sample = source as unknown as V7Stack,
      law = wovenLaw(w, sample),
      solid =
        sample.physical?.unitSolids ?? foodUnitMass(w, sample) * (1 - 0.7);
    const strandLength = law.length * 8,
      strandWidth =
        2 * Math.sqrt(solid / (law.density * law.length * 8 * Math.PI));
    const meshAperture = Math.max(0, (2 * 0.16) / strandLength - strandWidth),
      basketAperture = Math.max(0, (4 * 0.04) / strandLength - strandWidth);
    balance.kind = 'comparison-balance';
    balance.name = 'Uncalibrated woven balance';
    balance.data.geometry = {
      leftArm: 0.3,
      rightArm: 0.3,
      pans: 2,
      height: 0.6,
      baskets: true,
    };
    balance.data.aperture = basketAperture;
    balance.data.safeWorkingLoad = j.safeLoad ?? 0;
    balance.data.componentMass = j.componentMass ?? 0;
    mesh.kind = 'drying-tray';
    mesh.name = 'Woven drying mesh';
    mesh.data.aperture = meshAperture;
    mesh.data.safeWorkingLoad = j.safeLoad ?? 0;
    balance.visual.label = 'Uncalibrated woven balance';
    mesh.visual.label = 'Woven drying mesh';
    j.apertures = {
      basket: basketAperture,
      mesh: meshAperture,
      strandWidth,
      strandLength,
    };
  }
  if (j.stage === 13) take('stone', 'comparison stone in subdivision');
  if (j.stage === 14) {
    const stone = j.components.find(
      (p) => p.component === 'comparison stone in subdivision',
    );
    if (!stone) throw new Error('Missing actual subdivided stone');
    const original = stone as unknown as V7Stack;
    const pieces: V7Stack[] = [0.1, 0.1, 0.2, 0.2, 0.4].map((quantity) => ({
      ...original,
      id: v7Id(w, 'item'),
      quantity,
      quantityTenths: foodTenths(quantity),
      owner: a.id,
      position: { ...a.position },
      processing: {
        comparisonWeight: {
          balance: balance.id,
          source: original.id,
          paidEnergy: 1,
        },
      },
    }));
    for (const p of pieces) {
      delete p.reservedFor;
      w.stacks.push(p);
    }
    j.components = j.components.filter((p) => p !== stone);
    j.weights = pieces.map((p) => p.id);
    balance.data.weights = j.weights;
    j.status = 'awaiting-calibration';
    delete a.extensionState['open:woven-active'];
  }
  balance.data.workStatus = j.status;
  balance.data.remainingWork = j.total - j.stage;
  balance.data.allocatedItems = j.escrow;
  balance.data.progress = j.stage;
  mesh.data.progress = j.stage;
  balance.data.paidEnergy = j.paid;
  mesh.data.paidEnergy = j.paid;
  balance.data.components = v7Json(
    j.components.map((p) => ({
      resource: p.resource,
      quantity: p.quantity,
      component: p.component,
      origin: p.origin,
    })),
  );
  c.emit(
    'woven-support-progress',
    j.stage === 14
      ? 'Real woven components and comparison pieces are assembled; the instrument remains uncalibrated.'
      : 'Paid cutting, tying or weaving advanced the actual allocated components.',
    {
      project: j.id,
      stage: j.stage,
      remainingWork: 17 - j.stage,
      paidEnergy: j.paid,
      balance: balance.id,
      mesh: mesh.id,
      apertures: j.apertures ?? null,
    },
    balance.id,
  );
  return {
    complete: j.stage === 14,
    remaining: Math.max(0, 14 - j.stage),
    writes: [balance.id, mesh.id],
  };
}
