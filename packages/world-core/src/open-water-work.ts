import type {
  V7ActionContext,
  V7World,
  V7Actor,
  V7Data,
  V7Stack,
} from './continuous-types.js';
import { v7Clone, v7Id, v7Json, v7String } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import {
  foodTenths,
  foodSetQuantity,
  foodUnitMass,
} from './forest-food-accounting.js';
import {
  v7SegmentClear,
  v7Obstacles,
  v7Distance,
} from './continuous-geometry.js';
import { forestEvent } from './forest-climate.js';
import { waterItem, waterReach } from './open-water-state.js';
import { cupProcess, cupSync } from './open-water-cup.js';

interface WaterWork extends V7Data {
  id: string;
  project: string;
  owner: string;
  status: string;
  stage: number;
  paid: number;
  x: number;
  y: number;
  footprint: string;
  escrow: V7Data;
}
export function waterActive(w: V7World, a: V7Actor): WaterWork | null {
  const key = a.extensionState['water:active'];
  return typeof key === 'string' ? (w.state[key] as WaterWork) : null;
}
export function waterStop(w: V7World, a: V7Actor, reason: string) {
  const j = waterActive(w, a);
  if (!j || ['completed', 'cancelled'].includes(j.status)) return;
  const s = v7Clone(j.escrow) as unknown as V7Stack;
  s.owner = null;
  s.position = { x: j.x, y: j.y };
  delete s.reservedFor;
  s.processing = {
    ...s.processing,
    waterForming: { operation: j.id, stage: j.stage, paidEnergy: j.paid },
  };
  w.stacks.push(s);
  j.status = 'cancelled';
  w.objects = w.objects.filter((o) => o.id !== j.footprint);
  delete a.extensionState['water:active'];
  forestEvent(
    w,
    'water-operation-stopped',
    'Unfinished forming cancelled; actual surviving clay returned once without effort refund.',
    { x: j.x, y: j.y },
    a.id,
    {
      operationId: j.id,
      stage: j.stage,
      remainingWork: 3 - j.stage,
      paidEnergy: j.paid,
      item: s.id,
      reason,
    },
    s.id,
  );
}
function start(c: V7ActionContext): WaterWork | null {
  const { world: w, actor: a } = c,
    project = v7String(c.action.args.project, 'project'),
    s = waterItem(w, a, v7String(c.action.args.target, 'wet clay'));
  if (!project || s.resource !== 'clay' || s.owner !== a.id)
    throw new Error('Name a project and explicitly owned wet clay.');
  const mass = foodUnitMass(w, s),
    fraction = s.physical
      ? s.physical.unitWater / mass
      : (w.resources.find((r) => r.id === 'clay')?.properties?.moisture ?? 0);
  if (!(mass > 0) || !(fraction > 0))
    throw new Error('Represented clay is not wet workable material.');
  const tenths = Math.ceil(5 / mass - 1e-9),
    quantity = tenths / 10;
  if (foodTenths(s.quantity) < tenths)
    throw new Error(
      'At least 0.5 kg actual wet clay is required before allocation.',
    );
  const point = { x: Number(c.action.args.x), y: Number(c.action.args.y) };
  if (
    !waterReach(w, a, point) ||
    !v7SegmentClear(point, point, 0.03, v7Obstacles(w)) ||
    w.actors.some(
      (other) => v7Distance(other.position, point) < other.radius + 0.03,
    ) ||
    a.vitals.energy < 0.5
  )
    return null;
  const base = `water:work:${a.id}:${project}`,
    n = Number(w.state[`${base}:sequence`] ?? 0) + 1,
    id = `${base}:${String(n)}`;
  const part = {
    ...v7Clone(s),
    id: v7Id(w, 'item'),
    quantity,
    quantityTenths: tenths,
    owner: a.id,
    position: point,
    physical: s.physical ?? {
      unitMass: mass,
      unitWater: mass * fraction,
      unitSolids: mass * (1 - fraction),
    },
    reservedFor: id,
  };
  foodSetQuantity(s, foodTenths(s.quantity) - tenths);
  w.stacks = w.stacks.filter((s) => s.quantity > 0);
  const footprint = v7Id(w, 'object');
  const j: WaterWork = {
    id,
    project,
    owner: a.id,
    status: 'active',
    stage: 0,
    paid: 0,
    x: point.x,
    y: point.y,
    footprint,
    escrow: v7Json(part) as V7Data,
    source: s.id,
  };
  w.state[`${base}:sequence`] = n;
  w.state[`${base}:latest`] = id;
  w.state[id] = j;
  a.extensionState['water:active'] = id;
  w.objects.push({
    id: footprint,
    kind: 'water-cup-work',
    name: 'Actual wet-clay forming',
    spatial: {
      ...point,
      angle: 0,
      shape: { kind: 'circle', radius: 0.03 },
      solid: false,
      interaction: 0.65,
      entrances: [],
    },
    visual: {
      component: 'rock',
      color: '#a97c61',
      accent: '#6d96a2',
      label: 'Unfinished cup',
      state: 'forming',
    },
    data: {
      operation: id,
      stage: 0,
      remainingWork: 3,
      paidEnergy: 0,
      clayMass: mass * quantity,
    },
    createdBy: a.id,
    createdAt: w.tick,
    revision: 'river-contact-water@1',
  });
  return j;
}
export function waterForm(c: V7ActionContext) {
  const { world: w, actor: a } = c,
    mode = v7String(c.action.args.mode, 'mode');
  if (mode === 'cancel') {
    const j = waterActive(w, a);
    if (!j || j.project !== c.action.args.project)
      throw new Error('No matching unfinished personal forming operation.');
    waterStop(w, a, 'Explicit cancellation.');
    return { complete: true, writes: [] };
  }
  let j = waterActive(w, a);
  if (mode === 'resume' && (!j || j.project !== c.action.args.project))
    throw new Error(
      'No matching remaining personal forming work; terminal work cannot resume.',
    );
  j ??= start(c);
  if (!j) {
    c.emit(
      'water-cup-progress',
      'Actual work access or energy is unavailable; no materials or effort charged.',
      { stage: 0, remainingWork: 3, paidEnergy: 0 },
    );
    return { complete: false, remaining: 3, writes: [] };
  }
  if (!waterReach(w, a, { x: j.x, y: j.y }) || a.vitals.energy < 0.5) {
    j.status = 'paused';
    c.emit(
      'water-cup-progress',
      'Forming is paused without charge; exact surviving escrow and paid stages remain.',
      {
        operationId: j.id,
        stage: j.stage,
        remainingWork: 3 - j.stage,
        paidEnergy: j.paid,
      },
    );
    return { complete: false, remaining: 3 - j.stage, writes: [] };
  }
  j.status = 'active';
  v7Spend(a, 0.5);
  j.stage++;
  j.paid += 0.5;
  const o = w.objects.find((o) => o.id === j.footprint);
  if (!o) throw new Error('Exact forming footprint is unavailable.');
  o.data.stage = j.stage;
  o.data.remainingWork = 3 - j.stage;
  o.data.paidEnergy = j.paid;
  if (j.stage === 3) {
    const input = j.escrow as unknown as V7Stack,
      m = input.physical;
    if (!m) throw new Error('Missing actual clay composition.');
    const total = m.unitMass * input.quantity,
      fraction = m.unitWater / m.unitMass;
    const cup: V7Stack = {
      id: v7Id(w, 'item'),
      resource: 'unfired-water-cup',
      quantity: 1,
      owner: null,
      position: { x: j.x, y: j.y },
      origin: input.origin,
      processing: { input: v7Json(input), operation: j.id, paidEnergy: j.paid },
      waterCup: {
        capacityMl: 100,
        waterMl: 0,
        wallMass: 0.5,
        wallWaterFraction: fraction,
        leakedMl: 0,
        erodedClay: 0,
        withdrawnMl: 0,
        contactMl: 0,
        provenance: [],
        radius: 0.03,
        height: 0.07,
        contamination: 'unknown',
        model:
          'river-contact-water@1: unfired wall erosion and finite open contents',
      },
    };
    cupSync(cup);
    w.stacks.push(cup);
    if (total > 0.5 + 1e-9)
      w.stacks.push({
        id: v7Id(w, 'item'),
        resource: 'wet-clay-fragments',
        quantity: 1,
        owner: null,
        position: { x: j.x, y: j.y },
        origin: input.origin,
        physical: {
          unitMass: total - 0.5,
          unitWater: (total - 0.5) * fraction,
          unitSolids: (total - 0.5) * (1 - fraction),
        },
        processing: {
          input: input.id,
          operation: j.id,
          reason: 'Exact surplus retained after 0.5 kg wall allocation.',
        },
      });
    j.status = 'completed';
    j.output = cup.id;
    delete a.extensionState['water:active'];
    w.objects = w.objects.filter((x) => x.id !== o.id);
    cupProcess(w);
    c.emit(
      'water-cup-completed',
      'Actual paid forming produced one fragile empty cup and retained all surplus clay; no water or mastery was supplied.',
      {
        operationId: j.id,
        input: input.id,
        inputMass: total,
        cup: cup.id,
        wallMass: 0.5,
        surplusMass: total - 0.5,
        stage: 3,
        remainingWork: 0,
        paidEnergy: j.paid,
      },
      cup.id,
    );
  }
  c.emit(
    'water-cup-progress',
    'Performed only the next paid stage on the same actual clay.',
    {
      operationId: j.id,
      stage: j.stage,
      remainingWork: 3 - j.stage,
      paidEnergy: j.paid,
    },
    j.output as string | undefined,
  );
  return {
    complete: j.stage === 3,
    remaining: 3 - j.stage,
    writes: [j.id, j.footprint],
  };
}
