import type {
  V7ActionContext,
  V7Actor,
  V7World,
  V7Data,
  V7Stack,
  V7Object,
} from './continuous-types.js';
import { v7Clone, v7Id, v7String, v7Json } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { foodSetQuantity, foodTenths } from './forest-food-accounting.js';
import { forestResolveReference } from './forest-references.js';
import {
  v7ShapesOverlap,
  v7Reach,
  v7ShapeDistance,
} from './continuous-geometry.js';
import { forestEvent } from './forest-climate.js';
export const ASSAY_KEY = 'open:assay-work';
export const ASSAY_LIMIT =
  'Relative physical mass only; no certified grams, calories, digestibility or toxin absence. Volatile loss and contamination remain possible confounds.';
export interface AssayWork extends V7Data {
  mode: string;
  object: string;
  stage: number;
  paid: number;
  x: number;
  y: number;
  tools: string[];
  inputs: V7Data[];
}
export const assayWork = (a: V7Actor) =>
  a.extensionState[ASSAY_KEY] as AssayWork | undefined;
export function assayControls(c: V7ActionContext): V7Stack[] {
  const raw = c.action.args.controls;
  if (!Array.isArray(raw))
    throw new Error('Explicit control/input item IDs are required.');
  const ids = raw.map((r) =>
    forestResolveReference(
      c.world,
      c.actor,
      v7String(r, 'allocated item'),
      'owned',
    ),
  );
  if (new Set(ids).size !== ids.length)
    throw new Error('Duplicate material allocation is not allowed.');
  return ids.map((id) => {
    const s = c.world.stacks.find((s) => s.id === id);
    if (!s) throw new Error('Missing allocated material.');
    return s;
  });
}
export function assayNearby(
  c: V7ActionContext,
  id: string,
  kind: string,
): V7Object {
  const o = c.world.objects.find((o) => o.id === id && o.kind === kind);
  if (
    !o ||
    !v7Reach(c.actor, o.spatial) ||
    v7ShapeDistance(c.actor.position, o.spatial) > 0.65 ||
    Number(o.data.service) <= 0
  )
    throw new Error(
      'A real maintained apparatus within 0.65 of its boundary is required.',
    );
  return o;
}
export function assayReleaseWork(w: V7World, a: V7Actor, reason: string): void {
  const j = assayWork(a);
  if (!j) return;
  const o = w.objects.find((o) => o.id === j.object);
  if (j.mode.startsWith('prepare') && o?.kind === 'assay-site') {
    for (const raw of j.inputs) {
      const s = raw as unknown as V7Stack;
      w.stacks.push({
        ...v7Clone(s),
        id: v7Id(w, 'item'),
        owner: null,
        position: { x: j.x, y: j.y },
      });
    }
    w.objects = w.objects.filter((o) => o.id !== j.object);
  }
  delete a.extensionState['open:assay-work'];
  forestEvent(
    w,
    'process-stopped',
    'Active assay handling stopped; actual partial equipment and altered materials are retained, with no effort refund.',
    { x: j.x, y: j.y },
    a.id,
    { reason, paidEnergy: j.paid, stage: j.stage, apparatus: j.object },
  );
}
function allocation(stacks: V7Stack[], resource: string, quantity: number) {
  const choices = stacks.filter(
    (s) => s.resource === resource && !s.reservedFor && s.quantity >= quantity,
  );
  if (choices.length !== 1)
    throw new Error(
      `Explicitly allocate one sufficient ${resource} input; matching allocated candidates: ${choices.map((s) => s.id).join(', ') || 'none'}.`,
    );
  const s = choices[0];
  if (!s) throw new Error('Missing allocation.');
  const out = { ...v7Clone(s), quantity, quantityTenths: foodTenths(quantity) };
  foodSetQuantity(s, foodTenths(s.quantity) - foodTenths(quantity));
  return out;
}
export function assayEquipment(c: V7ActionContext) {
  const { world: w, actor: a } = c,
    mode = v7String(c.action.args.mode, 'preparation');
  let j = assayWork(a);
  if (!j) {
    const target = w.stacks.find(
      (s) =>
        s.id === c.action.args.target && s.owner === a.id && !s.reservedFor,
    );
    if (!target)
      throw new Error('Actual owned construction input is required.');
    const controls = assayControls(c),
      balance = mode === 'prepare-balance';
    if (controls.some((s) => s.id === target.id))
      throw new Error('Target cannot be allocated twice.');
    if (
      target.processing?.wovenDamage ||
      (target.processing?.wovenSpecimen &&
        typeof target.processing.wovenSpecimen === 'object' &&
        !Array.isArray(target.processing.wovenSpecimen) &&
        target.processing.wovenSpecimen.broken === true)
    )
      throw new Error(
        'Actual damaged material cannot serve as an intact construction member.',
      );
    if (target.resource !== (balance ? 'branch' : 'bark'))
      throw new Error(
        'The specified target is not the required construction material.',
      );
    if (
      balance &&
      (w.resources.find((r) => r.id === 'vine')?.properties?.flexibility ?? 0) <
        6
    )
      throw new Error(
        'The actual allocated suspension material cannot flex without failure.',
      );
    const tools = controls.filter(
      (s) => s.resource === 'stone' || s.resource === 'flint',
    );
    if (balance && (tools.length !== 2 || tools.some((s) => s.quantity < 1)))
      throw new Error(
        'Balance preparation requires two explicitly allocated hard stone items: one retained hammer and one subdivided comparison mass.',
      );
    if (
      balance &&
      (w.resources.find((r) => r.id === target.resource)?.properties
        ?.hardness ?? 0) < 3
    )
      throw new Error(
        'The actual branch cannot support the equal-arm geometry.',
      );
    const x = a.position.x + 0.65,
      y = a.position.y;
    const spatial: V7Object['spatial'] = {
      x,
      y,
      angle: 0,
      shape: { kind: 'circle', radius: balance ? 0.4 : 0.18 },
      solid: true,
      interaction: 0.65,
      entrances: [],
    };
    const ground = w.terrain[Math.floor(y)]?.[Math.floor(x)];
    if (
      !ground ||
      ['~', '='].includes(ground) ||
      w.objects.some(
        (o) =>
          (o.spatial.solid || o.spatial.reserved) &&
          v7ShapesOverlap(spatial, o.spatial),
      ) ||
      w.actors.some(
        (other) =>
          Math.hypot(other.position.x - x, other.position.y - y) <
          (balance ? 0.4 : 0.18) + 0.2,
      )
    )
      throw new Error(
        'Actual unobstructed supported ground is required east of the performer.',
      );
    if (a.vitals.energy < (balance ? 1 : 0.5))
      return { complete: false, remaining: balance ? 9 : 2, writes: [] };
    v7Spend(a, balance ? 1 : 0.5);
    const inputs = balance
      ? [
          allocation([target], 'branch', 1),
          allocation(controls, 'vine', 1),
          allocation(controls, 'bark', 0.4),
        ]
      : [allocation([target], 'bark', 0.4)];
    const object = v7Id(w, 'object');
    w.objects.push({
      id: object,
      kind: 'assay-site',
      name: balance
        ? 'Comparison balance in progress'
        : 'Drying tray in progress',
      spatial,
      visual: {
        component: 'rock',
        color: '#9b805c',
        accent: '#ddd4af',
        label: 'Paid assembly',
        state: 'working',
      },
      data: { progress: 1, materials: v7Json(inputs), service: 200 },
      createdBy: a.id,
      createdAt: w.tick,
      revision: 'food-assay@1',
    });
    j = {
      mode,
      object,
      stage: 1,
      paid: balance ? 1 : 0.5,
      x: a.position.x,
      y: a.position.y,
      tools: tools.map((s) => s.id),
      inputs: v7Json(inputs) as V7Data[],
    };
    a.extensionState[ASSAY_KEY] = j;
  } else {
    const o = assayNearby(
      c,
      j.object,
      j.mode === 'prepare-balance' && j.stage >= 4
        ? 'comparison-balance'
        : 'assay-site',
    );
    if (
      j.tools.some(
        (id) =>
          !w.stacks.some(
            (s) =>
              s.id === id &&
              s.owner === a.id &&
              s.quantity >= (j?.stage === 5 ? 0 : 1),
          ),
      )
    )
      return {
        complete: false,
        remaining: (mode === 'prepare-balance' ? 9 : 2) - j.stage,
        writes: [],
      };
    const cost = mode === 'prepare-dryer' || j.stage >= 6 ? 0.5 : 1;
    if (a.vitals.energy < cost)
      return {
        complete: false,
        remaining: (mode === 'prepare-balance' ? 9 : 2) - j.stage,
        writes: [],
      };
    v7Spend(a, cost);
    j.paid += cost;
    j.stage++;
    o.data.progress = j.stage;
    if (mode === 'prepare-balance' && j.stage === 4) {
      o.kind = 'comparison-balance';
      o.name = 'Uncalibrated comparison balance';
      o.visual.label = 'Uncalibrated balance';
      o.data.geometry = {
        leftArm: 0.3,
        rightArm: 0.3,
        pans: 2,
        suspension: 'actual allocated vine',
        leftPanMass:
          0.2 * (w.resources.find((r) => r.id === 'bark')?.mass ?? 0),
        rightPanMass:
          0.2 * (w.resources.find((r) => r.id === 'bark')?.mass ?? 0),
      };
    }
    if (mode === 'prepare-balance' && j.stage === 6) {
      const stone = w.stacks.find((s) => s.id === j?.tools[1]);
      if (!stone || stone.quantity < 1)
        throw new Error('Subdivision source is unavailable.');
      const pieces = [0.1, 0.1, 0.2, 0.2, 0.4].map((quantity) => ({
        ...v7Clone(stone),
        id: v7Id(w, 'item'),
        quantity,
        quantityTenths: foodTenths(quantity),
        processing: {
          comparisonWeight: { balance: o.id, source: stone.id, paidEnergy: 2 },
        },
      }));
      foodSetQuantity(stone, foodTenths(stone.quantity) - 10);
      w.stacks.push(...pieces);
      o.data.weights = pieces.map((s) => s.id);
      o.data.subdivision = {
        source: stone.id,
        pieces: pieces.map((s) => s.quantity),
        waste: 0,
      };
      j.tools = j.tools.slice(0, 1);
    }
    if (mode === 'prepare-balance' && j.stage >= 7) {
      const weights = o.data.weights as string[];
      if (
        !weights.length ||
        weights.some(
          (id) => !w.stacks.some((s) => s.id === id && s.owner === a.id),
        )
      )
        throw new Error(
          'Calibration requires the same actual retained weights.',
        );
      const geometry = o.data.geometry as V7Data;
      const left = Number(geometry.leftArm),
        right = Number(geometry.rightArm);
      const loads = weights.slice(0, 2).map((id) => {
        const s = w.stacks.find((s) => s.id === id);
        if (!s) throw new Error('Missing comparison load');
        return (
          s.quantity * (w.resources.find((r) => r.id === s.resource)?.mass ?? 0)
        );
      });
      const first = loads[0] ?? 0,
        second = loads[1] ?? 0;
      const reference = first * left;
      if (!(reference > 0))
        throw new Error('The balance has no physical reference moment.');
      const tare =
        Number(geometry.leftPanMass) * left -
        Number(geometry.rightPanMass) * right;
      const difference =
        j.stage === 7
          ? tare / reference
          : j.stage === 8
            ? (second * left - first * right + tare) / reference
            : (first * left - second * right + tare) / reference;
      if (Math.abs(difference) > 0.05)
        throw new Error(
          'Actual exchanged loads do not repeat within the mechanical resolution; calibration failed.',
        );
      const history = (o.data.calibrationHistory ?? []) as V7Data[];
      history.push({
        tick: w.tick,
        test:
          [
            'empty pans zero',
            'exchange equal loads',
            'repeat retained-weight comparison',
          ][j.stage - 7] ?? 'repeat',
        passed: Math.abs(difference) <= 0.05,
        relativeImbalance: difference,
        resolution: 0.05,
        weights,
        paidEnergy: 0.5,
      });
      o.data.calibrationHistory = history;
    }
  }
  const total = mode === 'prepare-balance' ? 9 : 2,
    complete = j.stage === total;
  const o = w.objects.find((o) => o.id === j.object);
  if (!o) throw new Error('Missing actual assembly.');
  if (complete) {
    o.kind = mode === 'prepare-balance' ? 'comparison-balance' : 'drying-tray';
    o.name =
      mode === 'prepare-balance'
        ? 'Calibrated comparison balance'
        : 'Passive drying tray';
    o.visual.label = o.name;
    o.visual.state = 'ready';
    o.data.resolution = mode === 'prepare-balance' ? 0.05 : 0;
    o.data.calibrated = mode === 'prepare-balance';
    o.data.paidEnergy = j.paid;
    delete a.extensionState['open:assay-work'];
  }
  c.emit(
    'process-progress',
    complete
      ? 'Completed actual equipment; no sample result or mastery is supplied.'
      : 'Paid equipment work advanced; material and comparison steps remain real.',
    {
      apparatus: o.id,
      stage: j.stage,
      remainingWork: total - j.stage,
      paidEnergy: j.paid,
      calibrated: complete && mode === 'prepare-balance',
    },
    o.id,
  );
  return { complete, remaining: total - j.stage, writes: [o.id] };
}
