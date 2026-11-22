import type {
  V7World,
  V7Process,
  V7Stack,
  V7Data,
} from './continuous-types.js';
import { v7Id, v7Json } from './continuous-data.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { wovenHydrate, wovenLaw } from './open-woven-physics.js';
import { wovenKey, wovenPause, type WovenWork } from './open-woven-work.js';
import { foodUnitMass } from './forest-food-accounting.js';
function evaporate(
  w: V7World,
  s: V7Stack,
  position: { x: number; y: number },
  key: string,
): number {
  wovenHydrate(w, s);
  const m = s.physical;
  if (!m) return 0;
  const climate = forestClimate(w, position),
    humidity = Math.min(
      1,
      climate.moisture * 0.65 + (climate.rain ?? 0) * 0.35,
    );
  const loss = Math.min(
    Math.max(0, m.unitWater - m.unitSolids * humidity * 0.12),
    Math.max(0, climate.temperature - 2) * 0.001 * (1 - humidity),
  );
  if ((climate.rain ?? 0) > 0.7) return 0;
  m.unitWater -= loss;
  m.unitMass = m.unitSolids + m.unitWater;
  const ledger = (w.state['open:water-ledger'] ?? {}) as V7Data;
  ledger[key] = Number(ledger[key] ?? 0) + loss * s.quantity;
  w.state['open:water-ledger'] = ledger;
  return loss * s.quantity;
}
export function wovenProcess(w: V7World, p: V7Process): void {
  const owner = w.actors.find((a) => a.id === p.owner),
    project = typeof p.data.project === 'string' ? p.data.project : '',
    j = w.state[wovenKey(project, p.owner ?? '')] as WovenWork | undefined;
  if (!j || j.status === 'destroyed') {
    w.processes = w.processes.filter((x) => x.id !== p.id);
    return;
  }
  p.next = w.tick + 1;
  if (j.mode !== 'assemble') {
    const sample = w.stacks.find((s) => s.id === j.specimen);
    if (sample && j.mode === 'test-vine') {
      evaporate(
        w,
        sample,
        sample.owner
          ? (w.actors.find((a) => a.id === sample.owner)?.position ??
              sample.position)
          : sample.position,
        p.id,
      );
      const data = sample.processing?.wovenSpecimen;
      if (data && typeof data === 'object' && !Array.isArray(data))
        data.dryReady =
          !!sample.physical &&
          sample.physical.unitWater / sample.physical.unitMass <= 0.2;
    }
    if (!sample || j.status === 'completed')
      w.processes = w.processes.filter((x) => x.id !== p.id);
    return;
  }
  const balance = w.objects.find((o) => o.id === j.balance),
    mesh = w.objects.find((o) => o.id === j.mesh);
  if (
    !balance ||
    !mesh ||
    Number(balance.data.service) <= 0 ||
    Number(mesh.data.service) <= 0
  ) {
    if (owner)
      wovenPause(w, owner, 'Actual apparatus was destroyed or worn out.');
    for (const raw of j.components) {
      const s = raw as unknown as V7Stack;
      const salvage: V7Stack = {
        ...s,
        id: v7Id(w, 'item'),
        owner: null,
        position: { x: j.x, y: j.y },
        processing: {
          ...(s.processing ?? {}),
          wovenDamage: {
            project: j.id,
            broken: true,
            reason:
              'structural destruction; conserved salvage, not pristine input',
          },
        },
      };
      delete salvage.reservedFor;
      w.stacks.push(salvage);
    }
    for (const id of j.escrow) {
      const s = w.stacks.find((s) => s.id === id);
      if (s?.reservedFor === wovenKey(j.id, j.owner)) delete s.reservedFor;
    }
    j.components = [];
    j.status = 'destroyed';
    w.objects = w.objects.filter((o) => o.id !== j.balance && o.id !== j.mesh);
    w.processes = w.processes.filter((x) => x.id !== p.id);
    forestEvent(
      w,
      'apparatus-load-failed',
      'Destroyed apparatus left conserved damaged salvage; no pristine component or spent effort was refunded.',
      { x: j.x, y: j.y },
      j.owner,
      { project: j.id, paidEnergy: j.paid, stage: j.stage },
      j.balance,
    );
    return;
  }
  for (const raw of j.components) {
    const s = raw as unknown as V7Stack;
    if (!['branch', 'vine'].includes(s.resource)) continue;
    evaporate(w, s, balance.spatial, p.id);
  }
  if (j.stage < 12) return;
  const basket = j.components.find(
    (x) => x.component === 'two woven baskets',
  ) as unknown as V7Stack | undefined;
  if (!basket) return;
  const mass = foodUnitMass(w, basket) * basket.quantity,
    g = balance.data.geometry as V7Data;
  // Differential exposure dries one side slightly faster; both sides retain the same total material.
  const water = (basket.physical?.unitWater ?? 0) * basket.quantity,
    asymmetry = water * 0.01;
  g.leftPanMass = mass / 2 + asymmetry;
  g.rightPanMass = mass / 2 - asymmetry;
  const suspension = j.components.find(
    (x) => x.component === 'suspension',
  ) as unknown as V7Stack | undefined;
  if (suspension) {
    const law = wovenLaw(w, suspension),
      wet =
        (suspension.physical?.unitWater ?? 0) /
        Math.max(1e-9, foodUnitMass(w, suspension));
    balance.data.creep =
      Number(balance.data.creep ?? 0) + law.creep * wet * 0.001;
    balance.data.deflection = balance.data.creep * 0.3;
  }
  balance.data.friction = 0.01;
  balance.data.currentComponentMass = j.components.reduce((n, raw) => {
    const s = raw as unknown as V7Stack;
    return n + foodUnitMass(w, s) * s.quantity;
  }, 0);
  balance.data.components = v7Json(
    j.components.map((s) => ({
      resource: s.resource,
      quantity: s.quantity,
      component: s.component,
      origin: s.origin,
      physical: s.physical ?? null,
    })),
  );
  balance.data.service = Math.max(0, Number(balance.data.service) - 0.001);
  mesh.data.service = Math.max(0, Number(mesh.data.service) - 0.001);
}
