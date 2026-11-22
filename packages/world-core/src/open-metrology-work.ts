import type {
  V7World,
  V7Actor,
  V7ActionContext,
  V7Data,
  V7Spatial,
  V7Stack,
} from './continuous-types.js';
import { v7String, v7Id, v7Number, v7Clone } from './continuous-data.js';
import {
  v7Distance,
  v7Inside,
  v7ShapesOverlap,
  v7ShapeDistance,
  v7SegmentClear,
  v7Obstacles,
} from './continuous-geometry.js';
import { forestEvent } from './forest-climate.js';
import {
  poleShape,
  poleMeasurement,
  geometryTransfer,
} from './open-material-geometry.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
export interface MetrologyWork extends V7Data {
  id: string;
  owner: string;
  mode: string;
  target: string;
  unit: string;
  status: string;
  stage: number;
  paid: number;
  x: number;
  y: number;
  angle: number;
  span: number;
  actorX: number;
  actorY: number;
  object: string;
  escrow: string[];
  loads: string[];
  quantities: V7Data;
}
export const metrologyKey = (owner: string, id: string) =>
  `metrology:work:${owner}:${id}`;
export function metrologyRecord(
  w: V7World,
  a: V7Actor,
  id: string,
): MetrologyWork {
  const r = w.state[metrologyKey(a.id, id)];
  if (!r || typeof r !== 'object' || Array.isArray(r))
    throw new Error('No exact personal metrology work ID.');
  return r as MetrologyWork;
}
export function metrologyActive(w: V7World, a: V7Actor): MetrologyWork | null {
  const id = a.extensionState['metrology:active'];
  return typeof id === 'string' ? metrologyRecord(w, a, id) : null;
}
export function metrologyPlacement(
  w: V7World,
  a: V7Actor,
  s: V7Spatial,
  ignore = '',
) {
  if (v7ShapeDistance(a.position, s) > 0.65)
    throw new Error('Reachable actual ground layout is required.');
  const length = s.shape.kind === 'rectangle' ? s.shape.width : 0;
  for (let t = -0.5; t <= 0.501; t += 0.05) {
    const p = {
      x: s.x + t * length * Math.cos(s.angle),
      y: s.y + t * length * Math.sin(s.angle),
    };
    if (
      !v7Inside(w, p, 0.1) ||
      ['~', '='].includes(w.terrain[Math.floor(p.y)]?.[Math.floor(p.x)] ?? '~')
    )
      throw new Error(
        'Both supports and the entire specimen require actual dry supported ground.',
      );
    if (
      !v7SegmentClear(
        a.position,
        p,
        0,
        v7Obstacles(w).filter(
          (o) => o !== w.objects.find((x) => x.id === ignore)?.spatial,
        ),
      )
    )
      throw new Error(
        'An endpoint or section is occluded; exact hidden dimensions cannot be measured.',
      );
  }
  if (
    w.objects.some(
      (o) =>
        o.id !== ignore &&
        (o.spatial.solid || o.spatial.reserved) &&
        v7ShapesOverlap(s, o.spatial),
    )
  )
    throw new Error(
      'Actual specimen layout overlaps an existing obstacle or source lock.',
    );
  if (
    w.actors.some(
      (other) =>
        !v7SegmentClear(other.position, other.position, other.radius, [s]),
    )
  )
    throw new Error('An actor occupies the actual specimen footprint.');
}
export function metrologyStop(
  w: V7World,
  a: V7Actor,
  j: MetrologyWork,
  reason: string,
  dead = false,
) {
  if (j.status !== 'active') return;
  for (const id of j.escrow) {
    const s = w.stacks.find((s) => s.id === id);
    if (s?.reservedFor !== metrologyKey(j.owner, j.id)) continue;
    delete s.reservedFor;
    if (dead) s.owner = null;
    s.position = { x: j.x, y: j.y };
  }
  j.status = 'stopped';
  delete a.extensionState['metrology:active'];
  w.objects = w.objects.filter((o) => o.id !== j.object);
  forestEvent(
    w,
    'metrology-stopped',
    reason,
    { x: j.x, y: j.y },
    a.id,
    {
      operationId: metrologyKey(j.owner, j.id),
      stage: j.stage,
      paidEnergy: j.paid,
      remainingWork: 2 - j.stage,
      escrow: j.escrow,
    },
    j.target,
  );
}
export function metrologyStart(
  c: V7ActionContext,
  specimen: V7Stack,
  loads: { s: V7Stack; quantity: number }[],
) {
  const { world: w, actor: a } = c,
    id = v7String(c.action.args.project, 'new work ID');
  if (w.state[metrologyKey(a.id, id)])
    throw new Error(
      'Work ID already exists; use resume without restarting charges.',
    );
  const p = poleShape(w, specimen);
  if (!p)
    throw new Error(
      'An exact intact whole specimen with resolved physical shape is required.',
    );
  const x = v7Number(c.action.args.x, 'x'),
    y = v7Number(c.action.args.y, 'y'),
    angle = v7Number(c.action.args.angle, 'angle');
  const shape: V7Spatial = {
    x,
    y,
    angle,
    shape: {
      kind: 'rectangle',
      width: p.length,
      height: p.diameter + p.curvature * 2,
    },
    solid: true,
    interaction: 0.65,
    entrances: [],
  };
  metrologyPlacement(w, a, shape);
  const j: MetrologyWork = {
    id,
    owner: a.id,
    mode: v7String(c.action.args.mode, 'mode'),
    target: specimen.id,
    unit: p.unit,
    status: 'active',
    stage: 0,
    paid: 0,
    x,
    y,
    angle,
    span: Number(c.action.args.span),
    actorX: a.position.x,
    actorY: a.position.y,
    object: v7Id(w, 'object'),
    escrow: [specimen.id],
    loads: [],
    quantities: { [specimen.id]: specimen.quantity },
  };
  specimen.reservedFor = metrologyKey(a.id, id);
  specimen.position = { x, y };
  for (const load of loads) {
    const part = {
      ...v7Clone(load.s),
      id: v7Id(w, 'item'),
      quantity: load.quantity,
      quantityTenths: foodTenths(load.quantity),
      position: { x, y },
      reservedFor: metrologyKey(a.id, id),
    };
    foodSetQuantity(
      load.s,
      foodTenths(load.s.quantity) - foodTenths(load.quantity),
    );
    geometryTransfer(w, load.s, part);
    w.stacks.push(part);
    j.escrow.push(part.id);
    j.loads.push(part.id);
    j.quantities[part.id] = part.quantity;
  }
  w.state[metrologyKey(a.id, id)] = j;
  a.extensionState['metrology:active'] = id;
  w.objects.push({
    id: j.object,
    kind: 'metrology-layout',
    name: 'Actual specimen layout',
    spatial: shape,
    visual: {
      component: 'rock',
      color: '#9b7851',
      accent: '#dad5b4',
      label: 'Specimen layout',
      state: 'active',
    },
    data: {
      specimen: specimen.id,
      unit: p.unit,
      modelAddition: p.provenance,
      length: p.length,
      diameter: p.diameter,
      taper: p.taper,
      curvature: p.curvature,
      span: j.span,
      loads: j.loads,
      stage: 0,
      paidEnergy: 0,
      measured: j.mode === 'load-test',
      measurement:
        j.mode === 'load-test' ? poleMeasurement(w, a.id, specimen) : null,
      deflection: 0,
    },
    createdBy: a.id,
    createdAt: w.tick,
    revision: 'shelter-material-metrology@1',
  });
  return j;
}
export function metrologyResume(c: V7ActionContext) {
  const j = metrologyRecord(
    c.world,
    c.actor,
    v7String(c.action.args.project, 'personal work ID'),
  );
  if (j.status !== 'stopped' || j.stage >= 2)
    throw new Error('Only stopped unfinished work can resume.');
  for (const id of j.escrow) {
    const s = c.world.stacks.find((s) => s.id === id);
    if (
      !s ||
      s.quantity !== j.quantities[id] ||
      s.reservedFor ||
      (s.owner !== c.actor.id &&
        !(s.owner === null && v7Distance(s.position, c.actor.position) <= 0.65))
    )
      throw new Error(
        'The same surviving specimen and load quantities must remain accessible.',
      );
  }
  const specimen = c.world.stacks.find((s) => s.id === j.target),
    p = specimen && poleShape(c.world, specimen);
  if (!p) throw new Error('The same intact specimen is unavailable.');
  const shape: V7Spatial = {
    x: j.x,
    y: j.y,
    angle: j.angle,
    shape: {
      kind: 'rectangle',
      width: p.length,
      height: p.diameter + 2 * p.curvature,
    },
    solid: true,
    interaction: 0.65,
    entrances: [],
  };
  metrologyPlacement(c.world, c.actor, shape);
  for (const id of j.escrow) {
    const s = c.world.stacks.find((s) => s.id === id);
    if (s) {
      s.owner = c.actor.id;
      s.reservedFor = metrologyKey(j.owner, j.id);
    }
  }
  c.world.objects.push({
    id: j.object,
    kind: 'metrology-layout',
    name: 'Resumed actual specimen',
    spatial: shape,
    visual: {
      component: 'rock',
      color: '#9b7851',
      accent: '#dad5b4',
      label: 'Resumed specimen',
      state: 'active',
    },
    data: {
      specimen: j.target,
      unit: p.unit,
      modelAddition: p.provenance,
      length: p.length,
      diameter: p.diameter,
      taper: p.taper,
      curvature: p.curvature,
      span: j.span,
      loads: j.loads,
      stage: j.stage,
      paidEnergy: j.paid,
      measured: j.mode === 'load-test',
      deflection: 0,
    },
    createdBy: j.owner,
    createdAt: c.world.tick,
    revision: 'shelter-material-metrology@1',
  });
  j.actorX = c.actor.position.x;
  j.actorY = c.actor.position.y;
  j.status = 'active';
  c.actor.extensionState['metrology:active'] = j.id;
  return j;
}
