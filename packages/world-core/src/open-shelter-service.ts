import type {
  V7ActionContext,
  V7Data,
  V7World,
  V7Process,
} from './continuous-types.js';
import { v7String } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { v7Reach } from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { refugeInputs, refugeCapacity } from './open-shelter-material.js';
import {
  refugeActive,
  refugeCreate,
  refugeReserve,
  refugeInstall,
  refugeStop,
  refugeSalvage,
} from './open-shelter-work.js';
import { refugeComponents, refugeLoads } from './open-shelter-loads.js';
export function refugeService(c: V7ActionContext) {
  const { world: w, actor: a } = c;
  let j = refugeActive(w, a);
  if (!j) {
    const mode = v7String(c.action.args.mode, 'service mode'),
      id = v7String(c.action.args.target, 'exact structure ID'),
      o = w.objects.find(
        (o) => o.id === id && o.kind === 'open-refuge' && v7Reach(a, o.spatial),
      );
    if (!o) throw new Error('An exact reachable structure is required.');
    if (
      w.actors.some((other) => {
        const active = refugeActive(w, other);
        return active?.structure === o.id;
      })
    )
      throw new Error('Another actor is working on this structure.');
    const inputs = refugeInputs(c);
    if (
      mode === 'repair' &&
      (inputs.length !== 1 ||
        !inputs[0] ||
        !['vine', 'reed'].includes(inputs[0].s.resource) ||
        !refugeCapacity(w, a.id, inputs[0].s) ||
        inputs[0].material.intact !== true)
    )
      throw new Error(
        'Allocate one tested intact compatible vine joint or reed panel replacement.',
      );
    const input = inputs[0],
      old = input
        ? refugeComponents(o).find((part) => part.resource === input.s.resource)
        : null;
    if (mode === 'repair' && (!old || !input || input.q !== old.quantity))
      throw new Error(
        'Replace one existing complete joint/panel allocation with its same actual quantity.',
      );
    j = refugeCreate(c, mode, mode === 'repair' ? 2 : 4);
    j.structure = o.id;
    j.x = o.spatial.x;
    j.y = o.spatial.y;
    j.oldComponent = old?.id ?? null;
    if (input) {
      const replacement = refugeReserve(c, j, input.s, input.q);
      replacement.processing = {
        ...(replacement.processing ?? {}),
        refugeMaterial: input.material,
        refugeCapacity: refugeCapacity(w, a.id, input.s),
      };
    }
  }
  const o = w.objects.find((o) => o.id === j.structure);
  if (!o) throw new Error('Structure is absent.');
  const cost = j.mode === 'repair' ? 0.8 : 0.5;
  if (!v7Reach(a, o.spatial) || a.vitals.energy < cost)
    return { complete: false, remaining: j.total - j.stage, writes: [] };
  if (
    j.escrow.some(
      (id) => !w.stacks.some((s) => s.id === id && s.owner === a.id),
    )
  )
    return { complete: false, remaining: j.total - j.stage, writes: [] };
  v7Spend(a, cost);
  j.stage++;
  j.paid += cost;
  if (j.mode === 'repair' && j.stage === 2) {
    const parts = refugeComponents(o),
      old = parts.find((s) => s.id === j.oldComponent),
      id = j.escrow[0];
    if (!old || !id)
      throw new Error('Original component or replacement disappeared.');
    refugeSalvage(w, old as unknown as V7Data, j.x, j.y);
    refugeInstall(c, j, id);
    o.data.components = [
      ...parts.filter((s) => s.id !== old.id),
      ...j.components,
    ] as unknown as V7Data[];
    // A joint/panel repair cannot restore decayed poles or certify a failed frame.
    o.data.condition = Math.min(
      Number(o.data.frameCondition ?? 1),
      Number(o.data.condition) + 0.15,
    );
    refugeLoads(w, o);
    c.emit(
      'shelter-repaired',
      'Paid compatible replacement retained the removed altered material; frame proof is not granted.',
      {
        paidEnergy: j.paid,
        removed: old.id,
        installed: j.components,
        condition: o.data.condition,
      },
      o.id,
    );
  } else if (j.mode === 'dismantle') {
    const parts = refugeComponents(o),
      count = Math.ceil(parts.length / (5 - j.stage)),
      removed = parts.slice(0, count);
    for (const part of removed)
      refugeSalvage(w, part as unknown as V7Data, j.x, j.y);
    o.data.components = parts.slice(count) as unknown as V7Data[];
    o.data.proven = false;
    o.visual.state = 'dismantling';
    c.emit(
      'shelter-dismantled',
      'Paid disassembly returned only these surviving installed components.',
      {
        stage: j.stage,
        remainingWork: 4 - j.stage,
        returned: removed.map((s) => s.id),
        paidEnergy: j.paid,
      },
      o.id,
    );
    if (j.stage === 4)
      w.objects = w.objects.filter(
        (x) => x.id !== o.id && x.data.parent !== o.id,
      );
  }
  if (j.stage === j.total) {
    refugeStop(w, a, j, 'Service work complete.');
    j.status = 'completed';
  }
  return {
    complete: j.stage === j.total,
    remaining: j.total - j.stage,
    writes: [o.id],
  };
}
export function refugeWeather(w: V7World, p: V7Process) {
  const o = w.objects.find((o) => o.id === p.object);
  if (!o) {
    w.processes = w.processes.filter((x) => x.id !== p.id);
    return;
  }
  const climate = forestClimate(w, o.spatial),
    rain = climate.rain ?? 0,
    wind = climate.wind ?? 0,
    parts = refugeComponents(o);
  let mass = 0,
    waterIn = 0,
    waterOut = 0;
  for (const part of parts) {
    const m = part.physical;
    if (!m) continue;
    const gain = Math.min(
        Math.max(0, m.unitSolids * 3 - m.unitWater),
        rain * 0.002,
      ),
      loss = Math.min(
        m.unitWater,
        Math.max(0, climate.temperature) * 0.00002 * (1 - rain),
      );
    m.unitWater += gain - loss;
    m.unitMass = m.unitSolids + m.unitWater;
    waterIn += gain * part.quantity;
    waterOut += loss * part.quantity;
    mass += m.unitMass * part.quantity;
  }
  o.data.rainWater = Number(o.data.rainWater ?? 0) + waterIn;
  o.data.evaporatedWater = Number(o.data.evaporatedWater ?? 0) + waterOut;
  o.data.wetness = Math.max(
    0,
    Math.min(1, Number(o.data.wetness) + rain * 0.01 - (1 - rain) * 0.004),
  );
  const wear = 0.00004 + o.data.wetness * 0.00008 + wind * 0.00004;
  o.data.condition = Math.max(0, Number(o.data.condition) - wear);
  o.data.frameCondition = Math.max(
    0,
    Number(o.data.frameCondition ?? 1) - wear * 0.3,
  );
  o.data.creep = Number(o.data.creep) + wind * 0.00002;
  o.data.mass = mass || o.data.mass || 0;
  o.data.roofMass = parts
    .filter((s) => s.resource === 'reed')
    .reduce((n, s) => n + (s.physical?.unitMass ?? 0) * s.quantity, 0);
  if (o.data.proven === true) {
    const { load, loadMargin: margin, sound } = refugeLoads(w, o);
    if (!sound) {
      o.data.proven = false;
      o.visual.state = 'failed';
      forestEvent(
        w,
        'shelter-damaged',
        'Actual wet loading, wear or wind exceeded the proven margin; overhead coverage is removed.',
        o.spatial,
        null,
        { load, margin, condition: o.data.condition },
        o.id,
      );
    }
  }
  p.next = w.tick + 1;
}
