import type {
  V7World,
  V7Actor,
  V7Stack,
  V7Data,
  V7Point,
} from './continuous-types.js';
import { foodUnitMass } from './forest-food-accounting.js';
import { v7Visible, v7Distance } from './continuous-geometry.js';
import { v7RoundNumber } from './continuous-data.js';
/** Constitutive assumptions, not observed suitability or an automatic grant of a usable tool. */
export interface WovenLaw extends V7Data {
  version: number;
  resource: string;
  origin: string;
  density: number;
  length: number;
  modulus: number;
  strength: number;
  wetWeakening: number;
  creep: number;
}
export function wovenLaw(w: V7World, s: V7Stack): WovenLaw {
  if (!['branch', 'vine'].includes(s.resource))
    throw new Error(
      'This physical test requires actual branch or vine material.',
    );
  const key = `woven:law:${s.resource}:${s.origin}`,
    old = w.state[key];
  if (old && typeof old === 'object' && !Array.isArray(old))
    return old as WovenLaw;
  if (w.revisions.includes('material-geometry@1') && s.resource === 'branch')
    throw new Error(
      'This source has specimen-specific geometry; a legacy uniform beam law cannot replace it.',
    );
  const law: WovenLaw = {
    version: 1,
    resource: s.resource,
    origin: s.origin,
    density: s.resource === 'branch' ? 350 : 500,
    length: s.resource === 'branch' ? 0.8 : 3,
    modulus: s.resource === 'branch' ? 4e9 : 2e8,
    strength: s.resource === 'branch' ? 45e6 : 8e6,
    wetWeakening: s.resource === 'branch' ? 0.6 : 0.55,
    creep: s.resource === 'branch' ? 0.0005 : 0.003,
  };
  w.state[key] = law;
  return law;
}
export function wovenHydrate(w: V7World, s: V7Stack): void {
  if (s.physical) return;
  const r = w.resources.find((r) => r.id === s.resource);
  if (!r) throw new Error('Missing actual material.');
  const wet = Math.min(0.9, Math.max(0, r.properties?.moisture ?? 0));
  s.physical = {
    unitMass: r.mass,
    unitWater: r.mass * wet,
    unitSolids: r.mass * (1 - wet),
  };
}
export function wovenMeasurement(
  w: V7World,
  s: V7Stack,
  tool: V7Stack,
  wet: number,
) {
  const law = wovenLaw(w, s),
    mass = foodUnitMass(w, s) * s.quantity;
  wovenHydrate(w, s);
  const solidMass = (s.physical?.unitSolids ?? 0) * s.quantity;
  const area = solidMass / (law.density * law.length),
    radius = Math.sqrt(area / Math.PI),
    moment = (Math.PI * radius ** 4) / 4;
  // The real stone weight plus a bounded paid manual force loads the actual specimen.
  const force = foodUnitMass(w, tool) * tool.quantity * 9.81 + 10;
  const weakening = Math.max(0.2, 1 - law.wetWeakening * wet),
    modulus = law.modulus * weakening;
  const stress =
    law.resource === 'branch'
      ? (force * (law.length / 4) * radius) / moment
      : force / area;
  const deflection =
    law.resource === 'branch'
      ? (force * law.length ** 3) / (48 * modulus * moment)
      : (force * law.length) / (modulus * area);
  const slip =
    law.resource === 'vine'
      ? Math.min(
          1,
          law.creep *
            wet *
            (force / Math.max(1, law.strength * weakening * area)),
        )
      : 0;
  const passed = stress <= law.strength * weakening && slip < 0.01;
  const scale =
    law.resource === 'branch' ? (1 / s.quantity) ** 1.5 : 1 / s.quantity;
  return {
    lawVersion: 1,
    resource: s.resource,
    origin: s.origin,
    length: law.length,
    diameter: 2 * radius,
    mass,
    appliedForce: force,
    wetness: wet,
    deflection,
    creep: slip,
    passed,
    safeWorkingLoad: passed ? force * scale * 0.25 : 0,
    uncertainty: 0.5,
    interpretation:
      'Conservative scaled working-load estimate from this actual specimen and versioned material law; fabrication and calibration must still pass real load tests.',
  };
}
/** Fixed finite availability belongs to an already existing reachable water cell, never a reroll or gifted item. */
export function wovenWater(
  w: V7World,
  a: V7Actor,
  quantity: number,
): { source: string; position: V7Point; quantity: number } {
  const candidates: V7Point[] = [];
  for (
    let y = Math.max(0, Math.floor(a.position.y) - 1);
    y <= Math.min(w.config.height - 1, Math.floor(a.position.y) + 1);
    y++
  )
    for (
      let x = Math.max(0, Math.floor(a.position.x) - 1);
      x <= Math.min(w.config.width - 1, Math.floor(a.position.x) + 1);
      x++
    ) {
      const p = { x: x + 0.5, y: y + 0.5 };
      if (
        ['~', '='].includes(w.terrain[y]?.[x] ?? '') &&
        v7Distance(a.position, p) <= 0.65 + a.radius &&
        v7Visible(w, a.position, p)
      )
        candidates.push(p);
    }
  candidates.sort(
    (p, q) =>
      v7Distance(a.position, p) - v7Distance(a.position, q) ||
      p.y - q.y ||
      p.x - q.x,
  );
  const point = candidates[0];
  if (!point)
    throw new Error(
      'Missing actual reachable water; no test water is supplied.',
    );
  const key = `woven:water:${String(Math.floor(point.x))}:${String(Math.floor(point.y))}`;
  const ledger = (w.state[key] ?? {
    initial: 20,
    remaining: 20,
    withdrawn: 0,
    runoff: 0,
  }) as V7Data;
  if (Number(ledger.remaining) < quantity)
    throw new Error('This actual finite water allocation is depleted.');
  ledger.remaining = v7RoundNumber(Number(ledger.remaining) - quantity);
  ledger.withdrawn = v7RoundNumber(Number(ledger.withdrawn) + quantity);
  w.state[key] = ledger;
  return { source: key, position: point, quantity };
}
export function wovenWetSample(
  w: V7World,
  s: V7Stack,
  water: { source: string; quantity: number },
): V7Data {
  wovenHydrate(w, s);
  const m = s.physical;
  if (!m) throw new Error('Missing physical sample.');
  const retained = Math.min(
    water.quantity,
    Math.max(0, m.unitSolids * 2 - m.unitWater) * s.quantity,
  );
  m.unitWater += retained / s.quantity;
  m.unitMass = m.unitSolids + m.unitWater;
  const ledger = w.state[water.source] as V7Data;
  ledger.runoff = Number(ledger.runoff) + water.quantity - retained;
  return {
    withdrawn: water.quantity,
    retained,
    runoff: water.quantity - retained,
    source: water.source,
  };
}
