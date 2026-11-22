import type {
  V7ActionContext,
  V7Process,
  V7World,
  V7Data,
  V7Stack,
} from './continuous-types.js';
import { foodTenths } from './forest-food-accounting.js';
import {
  v7Clone,
  v7String,
  v7Id,
  v7Json,
  v7Number,
  v7RoundNumber,
} from './continuous-data.js';
import { v7Reach } from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { openConditions } from './open-physical.js';

/** Reviewed packages select contracts; genesis exposes no production recipes. */
export interface OpenProcessSpec {
  kind: string;
  inputs: { item: string; quantity: number }[];
  outputs: {
    resource: string;
    quantity: number;
    physical?: V7Stack['physical'];
  }[];
  work: number;
  station: string;
  temperature: [number, number];
  moisture: [number, number];
  heatPerRound: number;
  wearPerRound: number;
  maximumStall: number;
  dependencies: { abilities: string[]; knowledge: string[] };
}
export function openStartProcess(
  c: V7ActionContext,
  spec: OpenProcessSpec,
): string {
  if (!c.world.config.development)
    throw new Error(
      'Persistent development processes require the fresh policy.',
    );
  const station = c.world.objects.find((o) => o.id === spec.station);
  if (!station || !v7Reach(c.actor, station.spatial))
    throw new Error('Actual reachable process station is required.');
  v7Number(spec.work, 'process work', 1, 100000);
  v7Number(spec.heatPerRound, 'heat consumption', 0);
  v7Number(spec.wearPerRound, 'service wear', 0);
  v7Number(spec.maximumStall, 'maximum stalled rounds', 1, 100000);
  for (const range of [spec.temperature, spec.moisture]) {
    v7Number(range[0], 'condition minimum');
    v7Number(range[1], 'condition maximum', range[0]);
  }
  if (
    spec.dependencies.abilities.some((id) => !c.actor.mastered.includes(id)) ||
    spec.dependencies.knowledge.some(
      (key) => !c.actor.memory.knowledge?.[key]?.verified,
    )
  )
    throw new Error('The initiator lacks actual personal dependencies.');
  if (
    new Set(spec.inputs.map((x) => x.item)).size !== spec.inputs.length ||
    !spec.inputs.length
  )
    throw new Error('A process requires unique actual input stacks.');
  const inputs = spec.inputs.map((input) => {
    v7Number(input.quantity, 'input quantity', 0.1);
    foodTenths(input.quantity);
    const stack = c.world.stacks.find(
      (s) => s.id === input.item && s.owner === c.actor.id && !s.reservedFor,
    );
    if (!stack || stack.quantity < input.quantity)
      throw new Error('Insufficient owned unreserved input.');
    return { stack, quantity: input.quantity };
  });
  const mass = (resource: string, quantity: number) => {
    const r = c.world.resources.find((r) => r.id === resource);
    if (!r) throw new Error('Unimplemented process material.');
    return r.mass * quantity;
  };
  for (const output of spec.outputs) mass(output.resource, 0);
  const inputMass = inputs.reduce(
    (sum, i) =>
      sum +
      (i.stack.physical?.unitMass ?? mass(i.stack.resource, 1)) * i.quantity,
    0,
  );
  const outputMass = spec.outputs.reduce(
    (sum, o) =>
      sum +
      (o.physical?.unitMass ?? mass(o.resource, 1)) *
        (foodTenths(v7Number(o.quantity, 'output quantity', 0.1)) / 10),
    0,
  );
  if (Math.abs(inputMass - outputMass) > 1e-7)
    throw new Error(
      'All input mass must trace to real outputs, including declared residues.',
    );
  // Once composition is represented, neither nominal catalogue mass nor omitted fields may erase it.
  if (
    inputs.some((i) => i.stack.physical) ||
    spec.outputs.some((o) => o.physical)
  ) {
    if (
      inputs.some((i) => !i.stack.physical) ||
      spec.outputs.some((o) => !o.physical)
    )
      throw new Error(
        'Modeled composition requires explicit physical inputs and outputs; no undeclared transformation.',
      );
    for (const p of [
      ...inputs.map((i) => i.stack.physical),
      ...spec.outputs.map((o) => o.physical),
    ]) {
      if (!p) throw new Error('Missing explicit process composition.');
      for (const value of [p.unitMass, p.unitWater, p.unitSolids])
        v7Number(value, 'physical process mass', 0);
      if (Math.abs(p.unitMass - p.unitWater - p.unitSolids) > 1e-7)
        throw new Error('Process water and solids must sum to actual mass.');
    }
    for (const key of ['unitWater', 'unitSolids'] as const) {
      const before = inputs.reduce(
        (n, i) => n + (i.stack.physical?.[key] ?? 0) * i.quantity,
        0,
      );
      const after = spec.outputs.reduce(
        (n, o) => n + (o.physical?.[key] ?? 0) * o.quantity,
        0,
      );
      if (Math.abs(before - after) > 1e-7)
        throw new Error(
          'Process water and solids must have explicit conserved outputs.',
        );
    }
  }
  const id = v7Id(c.world, 'process');
  const escrow = inputs.map(({ stack, quantity }) => {
    const snapshot = v7Clone(stack);
    snapshot.quantity = quantity;
    if (snapshot.quantityTenths !== undefined)
      snapshot.quantityTenths = foodTenths(quantity);
    stack.quantity = v7RoundNumber(stack.quantity - quantity);
    if (stack.quantityTenths !== undefined)
      stack.quantityTenths = Math.round(stack.quantity * 10);
    return {
      resource: stack.resource,
      quantity,
      origin: stack.origin,
      item: stack.id,
      harvestedAt: stack.harvestedAt ?? c.world.tick,
      decay: stack.decay ?? 0,
      snapshot: v7Json(snapshot),
    };
  });
  const p: V7Process = {
    id,
    handler: 'open.process',
    owner: c.actor.id,
    object: station.id,
    next: c.world.tick + 1,
    revision: 'foundation-open@1',
    data: {
      spec: v7Json(spec),
      escrow: v7Json(escrow),
      progress: 0,
      stalled: 0,
      heatUsed: 0,
      wearUsed: 0,
      startedAt: c.world.tick,
      ability: c.action.interface,
      inputMass,
      position: { x: station.spatial.x, y: station.spatial.y },
    },
  };
  c.world.processes.push(p);
  c.emit(
    'process-progress',
    'Started a costed persistent process with owned inputs in exclusive escrow.',
    {
      process: id,
      station: station.id,
      inputMass,
      dependencies: v7Json(spec.dependencies),
    },
    station.id,
  );
  return id;
}
/** Terminal cancellation returns surviving uncommitted inputs once; spent heat, work and wear stay spent. */
export function openStopProcess(
  world: V7World,
  process: V7Process,
  reason: string,
): void {
  if (!world.processes.some((p) => p.id === process.id)) return;
  const station = world.objects.find((o) => o.id === process.object);
  const point =
    station?.spatial ??
    (process.data.position as { x: number; y: number } | undefined);
  if (!point)
    throw new Error('Process escrow has no physical recovery location.');
  for (const item of process.data.escrow as V7Data[]) {
    const snapshot = item.snapshot
      ? (v7Clone(item.snapshot) as unknown as V7Stack)
      : null;
    world.stacks.push({
      ...(snapshot ?? {}),
      id: v7Id(world, 'item'),
      resource: v7String(item.resource, 'process provenance'),
      quantity: Number(item.quantity),
      position: { x: point.x, y: point.y },
      owner: null,
      origin: `returned:${process.id}:${v7String(item.origin, 'process provenance')}`,
      harvestedAt: Number(item.harvestedAt),
      decay: Number(item.decay),
    });
  }
  world.processes = world.processes.filter((p) => p.id !== process.id);
  forestEvent(
    world,
    'process-stopped',
    'Persistent process stopped; uncommitted surviving inputs returned at its actual location once.',
    point,
    process.owner,
    {
      process: process.id,
      reason,
      progress: Number(process.data.progress),
      heatUsed: Number(process.data.heatUsed),
      wearUsed: Number(process.data.wearUsed),
    },
    process.object,
  );
}
export function openAdvanceProcess(world: V7World, process: V7Process): void {
  const spec = process.data.spec as unknown as OpenProcessSpec,
    station = world.objects.find((o) => o.id === process.object);
  if (!station) {
    openStopProcess(world, process, 'station unavailable');
    return;
  }
  process.data.position = { x: station.spatial.x, y: station.spatial.y };
  const climate = forestClimate(world, station.spatial),
    soil = openConditions(world, station.spatial);
  // Escrow remains physical: perishable inputs continue to decay while work or weather stalls.
  for (const input of process.data.escrow as V7Data[]) {
    const lifetime =
      world.resources.find((r) => r.id === input.resource)?.properties?.decay ??
      0;
    if (lifetime)
      input.decay =
        Number(input.decay) +
        Math.max(0.15, (climate.temperature + 4) / 24) *
          Math.max(0.1, Math.min(1, Number(station.data.preservation ?? 1)));
    if (lifetime && Number(input.decay) >= lifetime) {
      process.data.escrow = (process.data.escrow as V7Data[]).filter(
        (x) => x !== input,
      );
      forestEvent(
        world,
        'spoiled',
        'A real escrow input spoiled; the batch cannot produce its outputs.',
        station.spatial,
        process.owner,
        {
          process: process.id,
          resource: v7String(input.resource, 'process provenance'),
          quantity: Number(input.quantity),
        },
        station.id,
      );
      openStopProcess(world, process, 'input spoiled');
      return;
    }
  }
  const ready =
    climate.temperature >= spec.temperature[0] &&
    climate.temperature <= spec.temperature[1] &&
    soil.moisture >= spec.moisture[0] &&
    soil.moisture <= spec.moisture[1] &&
    Number(station.data.availableHeat ?? 0) >= spec.heatPerRound &&
    Number(station.data.service ?? 0) >= spec.wearPerRound;
  if (!ready) {
    process.data.stalled = Number(process.data.stalled) + 1;
    process.data.status = 'conditions unmet';
    process.next = world.tick + 1;
    if (process.data.stalled >= spec.maximumStall)
      openStopProcess(world, process, 'maximum condition stall reached');
    return;
  }
  process.data.stalled = 0;
  process.data.status = 'working';
  station.data.availableHeat =
    Number(station.data.availableHeat ?? 0) - spec.heatPerRound;
  station.data.service = Number(station.data.service ?? 0) - spec.wearPerRound;
  process.data.heatUsed = Number(process.data.heatUsed) + spec.heatPerRound;
  process.data.wearUsed = Number(process.data.wearUsed) + spec.wearPerRound;
  process.data.progress = Number(process.data.progress) + 1;
  process.next = world.tick + 1;
  station.data.progress = process.data.progress / spec.work;
  station.visual.state = 'working';
  if (process.data.progress < spec.work) return;
  const provenance = {
    process: process.id,
    ability: v7String(process.data.ability, 'process provenance'),
    inputs: v7Clone(process.data.escrow ?? []),
    dependencies: v7Json(spec.dependencies),
    station: station.id,
    heatUsed: process.data.heatUsed,
    wearUsed: process.data.wearUsed,
  };
  for (const output of spec.outputs)
    world.stacks.push({
      id: v7Id(world, 'item'),
      resource: output.resource,
      quantity: output.quantity,
      owner: null,
      position: { x: station.spatial.x, y: station.spatial.y },
      origin: process.id,
      harvestedAt: world.tick,
      ...(output.physical ? { physical: v7Clone(output.physical) } : {}),
      processing: provenance,
    });
  world.processes = world.processes.filter((p) => p.id !== process.id);
  station.visual.state = 'ready';
  station.data.progress = 1;
  forestEvent(
    world,
    'process-completed',
    'Persistent work consumed escrow and produced its declared conserved outputs.',
    station.spatial,
    process.owner,
    {
      ...provenance,
      outputs: v7Json(spec.outputs),
      inputMass: Number(process.data.inputMass),
      elapsed: world.tick - Number(process.data.startedAt),
    },
    station.id,
  );
}
