import { assayRelativeReading } from './open-assay-reading.js';
import {
  preservationInitialize,
  preservationExchange,
  preservationPhysics,
  preservationReleaseSurface,
} from './open-preservation-physics.js';
import {
  wovenRetention,
  wovenDrift,
  wovenContact,
} from './open-woven-contract.js';
import type {
  V7ActionContext,
  V7World,
  V7Process,
  V7Data,
  V7Stack,
} from './continuous-types.js';
import {
  v7Clone,
  v7Id,
  v7Number,
  v7String,
  v7RoundNumber,
} from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import {
  foodTenths,
  foodSetQuantity,
  foodUnitMass,
} from './forest-food-accounting.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { v7ShapeDistance } from './continuous-geometry.js';
import { openRemember } from './open-foundation.js';
import {
  ASSAY_KEY,
  ASSAY_LIMIT,
  assayWork,
  assayControls,
  assayNearby,
} from './open-assay-equipment.js';
interface Drying extends V7Data {
  sample: string;
  balance: string;
  tray: string;
  source: string;
  originalActor: string;
  weight: string;
  initial: number;
  readings: V7Data[];
  dryingRounds: number;
  evaporated: number;
  paid: number;
  started: number;
  lastReading: number;
  history: V7Data[];
  active: boolean;
}
export const dryingData = (p: V7Process) => p.data as Drying;
function physical(w: V7World, s: V7Stack) {
  if (s.physical) return s.physical;
  const r = w.resources.find((r) => r.id === s.resource);
  if (!r) throw new Error('Unknown actual material');
  const water = Math.max(0, Math.min(0.95, r.properties?.moisture ?? 0));
  s.physical = {
    unitMass: r.mass,
    unitWater: r.mass * water,
    unitSolids: r.mass * (1 - water),
  };
  return s.physical;
}
export function assayStopDrying(
  w: V7World,
  p: V7Process,
  reason: string,
): void {
  const d = dryingData(p),
    sample = w.stacks.find((s) => s.id === d.sample);
  if (sample) {
    preservationReleaseSurface(w, sample);
    delete sample.reservedFor;
    sample.processing = {
      ...(sample.processing ?? {}),
      assayPartial: {
        process: p.id,
        readings: d.readings,
        paidEnergy: d.paid,
        reason,
        limitations: ASSAY_LIMIT,
      },
    };
  }
  w.processes = w.processes.filter((x) => x.id !== p.id);
  forestEvent(
    w,
    'assay-invalidated',
    'The assay ended without a certified composition or safety result; actual remaining material and losses are preserved.',
    sample?.position ?? { x: 0, y: 0 },
    d.originalActor,
    {
      process: p.id,
      reason,
      sample: d.sample,
      paidEnergy: d.paid,
      readings: d.readings,
    },
    d.sample,
  );
}
/** Physical drying continues without a performer; no result or reward is produced by passive time alone. */
export function assayDrying(w: V7World, p: V7Process): void {
  const d = dryingData(p),
    s = w.stacks.find((s) => s.id === d.sample),
    tray = w.objects.find((o) => o.id === d.tray && o.kind === 'drying-tray');
  if (
    !s ||
    !tray ||
    Number(tray.data.service) <= 0 ||
    s.owner !== null ||
    Math.hypot(s.position.x - tray.spatial.x, s.position.y - tray.spatial.y) >
      0.3
  ) {
    assayStopDrying(w, p, 'Sample spoiled, moved or lost its actual tray.');
    return;
  }
  if (w.tick - d.started > 120) {
    assayStopDrying(
      w,
      p,
      'Drying observation timed out with incomplete evidence.',
    );
    return;
  }
  const balance = w.objects.find((o) => o.id === d.balance);
  if (
    balance &&
    (balance.data.variant === 'woven' || tray.data.variant === 'woven')
  ) {
    const retention = wovenRetention(w, balance, tray, s, s.quantity),
      drift = wovenDrift(balance);
    const transferred = wovenContact(w, tray, s);
    if (retention.reason || drift || transferred > 0) {
      if (retention.reason) {
        s.position = { x: tray.spatial.x + 0.26, y: tray.spatial.y };
        s.processing = {
          ...(s.processing ?? {}),
          escapedMesh: {
            tray: tray.id,
            tick: w.tick,
            diameter: retention.diameter,
            aperture: retention.aperture,
          },
        };
      }
      assayStopDrying(
        w,
        p,
        retention.reason ??
          drift ??
          'Actual support water entered the sample; analytical mass history is invalid.',
      );
      return;
    }
  }
  p.next = w.tick + 1;
  if (d.initial < 0) return;
  const climate = forestClimate(w, tray.spatial),
    m = physical(w, s);
  if (w.state.foodPreservation === 1) {
    const dPhysical = preservationInitialize(w, s);
    dPhysical.prepared = true;
    dPhysical.opening = 1.1;
    dPhysical.tray = tray.id;
    const before = dPhysical.evaporated;
    preservationExchange(w, s);
    d.evaporated += dPhysical.evaporated - before;
    if (dPhysical.evaporated > before) d.dryingRounds++;
    return;
  }
  const humidity = Math.min(
    1,
    Math.max(0, climate.moisture * 0.65 + (climate.rain ?? 0) * 0.35),
  );
  const equilibrium = m.unitSolids * humidity * 0.12;
  const surface = Math.min(1, 0.6 / Math.max(0.1, s.quantity));
  const loss = Math.min(
    Math.max(0, m.unitWater - equilibrium),
    Math.max(0, climate.temperature - 2) * 0.0008 * (1 - humidity) * surface,
  );
  if (climate.temperature <= 2 || humidity >= 1 || (climate.rain ?? 0) > 0.7) {
    tray.data.status = 'Drying paused by actual wet/cold conditions';
    return;
  }
  m.unitWater = v7RoundNumber(m.unitWater - loss);
  m.unitMass = v7RoundNumber(m.unitWater + m.unitSolids);
  const transferred = loss * s.quantity;
  d.evaporated += transferred;
  d.dryingRounds++;
  tray.data.service = Number(tray.data.service) - 0.01;
  const ledger = (w.state['open:water-ledger'] ?? {}) as V7Data;
  ledger[p.id] = Number(ledger[p.id] ?? 0) + transferred;
  w.state['open:water-ledger'] = ledger;
  d.history.push({
    tick: w.tick,
    temperature: climate.temperature,
    humidity,
    evaporated: transferred,
  });
  tray.data.status = 'Actual water evaporating';
  tray.data.progress = d.dryingRounds;
  forestEvent(
    w,
    'process-progress',
    'The sample experienced actual drying conditions; any evaporated water entered the environmental ledger. Stable equilibrium is possible; nutrition and toxin totals did not change.',
    tray.spatial,
    d.active ? d.originalActor : null,
    {
      process: p.id,
      sample: s.id,
      dryingRounds: d.dryingRounds,
      temperature: climate.temperature,
      humidity,
    },
    s.id,
  );
}
export function assayDetach(w: V7World, actor: string): void {
  for (const p of w.processes.filter(
    (p) =>
      p.handler === 'open.assay-drying' &&
      dryingData(p).originalActor === actor &&
      dryingData(p).active,
  )) {
    const d = dryingData(p),
      s = w.stacks.find((s) => s.id === d.sample);
    d.active = false;
    p.owner = null;
    if (s) delete s.reservedFor;
  }
}
export function assayMeasure(c: V7ActionContext) {
  const { world: w, actor: a } = c;
  let j = assayWork(a),
    p = j ? w.processes.find((p) => p.id === j?.process) : undefined;
  if (!j) {
    const target = v7String(c.action.args.target, 'sample');
    const source = w.stacks.find((s) => s.id === target);
    if (!source) throw new Error('Missing actual sample');
    const r = w.resources.find((r) => r.id === source.resource);
    if (!r || r.nutrition <= 0) throw new Error('Actual food sample required.');
    const apparatus = v7String(c.action.args.apparatus, 'balance');
    const balance = assayNearby(c, apparatus, 'comparison-balance');
    if (
      balance.data.calibrated !== true ||
      !Array.isArray(balance.data.calibrationHistory) ||
      balance.data.calibrationHistory.length !== 3
    )
      throw new Error(
        'Actual zero, exchanged-load and repeated-weight calibration is required.',
      );
    const trays = w.objects.filter(
      (o) =>
        o.kind === 'drying-tray' &&
        Number(o.data.service) > 0 &&
        v7ShapeDistance(a.position, o.spatial) <= 0.65,
    );
    if (trays.length !== 1)
      throw new Error(
        `One unambiguous reachable drying tray is required; actual nearby candidates: ${trays.map((t) => t.id).join(', ') || 'none'}. Move to disambiguate.`,
      );
    const tray = trays[0];
    if (!tray) throw new Error('Missing tray');
    if (
      w.state.foodPreservation === 1 &&
      w.stacks.some((s) => preservationPhysics(s)?.tray === tray.id)
    )
      throw new Error(
        'The actual tray is occupied by another physical food batch.',
      );
    const controls = assayControls(c),
      weights = balance.data.weights as string[];
    if (
      controls.length !== 1 ||
      !controls[0] ||
      !weights.includes(controls[0].id)
    )
      throw new Error(
        'Explicitly allocate one original calibrated retained comparison weight.',
      );
    const weight = controls[0];
    const quantity = v7Number(
      c.action.args.quantity ?? 0.1,
      'sample quantity',
      0.1,
    );
    foodTenths(quantity);
    if (
      source.owner !== a.id ||
      source.quantity < quantity ||
      source.reservedFor
    )
      throw new Error('Insufficient owned unreserved sample quantity.');
    const relative =
      (foodUnitMass(w, source) * quantity) /
      (foodUnitMass(w, weight) * weight.quantity);
    if (relative < Number(balance.data.resolution) * 2)
      throw new Error(
        'Sample load is below two balance resolution steps; no precise assay or free sample is produced.',
      );
    const retention = wovenRetention(w, balance, tray, source, quantity);
    const drift = wovenDrift(balance);
    if (drift) throw new Error(drift);
    if (retention.reason) throw new Error(retention.reason);
    if (a.vitals.energy < 0.5)
      return { complete: false, remaining: null, writes: [] };
    v7Spend(a, 0.5);
    const id = v7Id(w, 'process'),
      sample: V7Stack = {
        ...v7Clone(source),
        id: v7Id(w, 'item'),
        quantity,
        quantityTenths: foodTenths(quantity),
        owner: null,
        position: { x: tray.spatial.x, y: tray.spatial.y },
        reservedFor: id,
      };
    physical(w, sample);
    foodSetQuantity(source, foodTenths(source.quantity) - foodTenths(quantity));
    w.stacks.push(sample);
    p = {
      id,
      handler: 'open.assay-drying',
      owner: a.id,
      object: tray.id,
      next: w.tick + 1,
      revision: 'food-assay@1',
      data: {
        sample: sample.id,
        balance: balance.id,
        tray: tray.id,
        source: source.id,
        originalActor: a.id,
        weight: weight.id,
        initial: -1,
        readings: [],
        dryingRounds: 0,
        evaporated: 0,
        paid: 0.5,
        started: w.tick,
        lastReading: -1,
        history: [],
        active: true,
      },
    };
    w.processes.push(p);
    j = {
      mode: 'dry-mass',
      object: balance.id,
      process: id,
      stage: 0,
      paid: 0.5,
      x: a.position.x,
      y: a.position.y,
      tools: [weight.id],
      inputs: [],
    };
    a.extensionState[ASSAY_KEY] = j;
    if (balance.data.variant === 'woven' || tray.data.variant === 'woven') {
      sample.processing = {
        ...(sample.processing ?? {}),
        meshRetention: {
          balance: balance.id,
          tray: tray.id,
          diameter: retention.diameter,
          aperture: retention.aperture,
          paidEnergy: 0.5,
          tick: w.tick,
        },
      };
      c.emit(
        'assay-reading',
        'Paid real sample placement tested retention above measured apertures; this is not a mass or safety conclusion.',
        { sample: sample.id, ...retention, paidEnergy: 0.5 },
        sample.id,
      );
    }
    c.emit(
      'food-assay-started',
      'Spread the real escrowed sample on an actual tray; an initial paid weighing remains.',
      {
        process: id,
        sample: sample.id,
        balance: balance.id,
        tray: tray.id,
        paidEnergy: 0.5,
        remainingWork: null,
        limitations: ASSAY_LIMIT,
      },
      sample.id,
    );
    return { complete: false, remaining: null, writes: [sample.id] };
  }
  if (!p)
    throw new Error(
      'The prior physical assay no longer exists; inspect retained material and invalidation evidence.',
    );
  const d = dryingData(p),
    sample = w.stacks.find((s) => s.id === d.sample);
  if (!sample) throw new Error('The actual sample spoiled or disappeared.');
  const balance = assayNearby(c, d.balance, 'comparison-balance');
  const tray = assayNearby(c, d.tray, 'drying-tray');
  const drift = wovenDrift(balance),
    retention = wovenRetention(w, balance, tray, sample, sample.quantity);
  if (drift || retention.reason) {
    if (retention.reason) {
      sample.position = { x: tray.spatial.x + 0.26, y: tray.spatial.y };
      sample.processing = {
        ...(sample.processing ?? {}),
        escapedMesh: {
          tray: tray.id,
          tick: w.tick,
          diameter: retention.diameter,
          aperture: retention.aperture,
        },
      };
    }
    assayStopDrying(w, p, drift ?? retention.reason ?? 'Invalid apparatus');
    return { complete: true, remaining: 0, writes: [sample.id] };
  }
  const weight = w.stacks.find(
    (s) => s.id === d.weight && s.owner === a.id && !s.reservedFor,
  );
  if (
    !weight ||
    a.vitals.energy < 0.5 ||
    (d.initial >= 0 && d.dryingRounds - d.lastReading < 3)
  )
    return { complete: false, remaining: null, writes: [] };
  const { resolution, reading } = assayRelativeReading(
    w,
    balance,
    sample,
    weight,
  );
  v7Spend(a, 0.5);
  d.paid += 0.5;
  j.paid = d.paid;
  j.stage++;
  balance.data.service = Number(balance.data.service) - 0.1;
  if (d.initial < 0) d.initial = reading;
  d.lastReading = d.dryingRounds;
  const row = {
    tick: w.tick,
    relativeMass: v7RoundNumber(reading),
    resolution,
    reference: weight.id,
    dryingRounds: d.dryingRounds,
    paidEnergy: 0.5,
  };
  d.readings.push(row);
  balance.data.lastReading = row;
  c.emit(
    'assay-reading',
    'Paid comparison against an actual retained weight; relative reading has finite resolution, not certified grams.',
    row,
    sample.id,
  );
  const recent = d.readings.slice(-3),
    stable =
      d.readings.length >= 4 &&
      recent.every(
        (r) => Math.abs(Number(r.relativeMass) - reading) <= resolution / 2,
      );
  if (!stable) return { complete: false, remaining: null, writes: [sample.id] };
  const fraction = d.initial > 0 ? reading / d.initial : 0,
    uncertainty = Math.min(
      1,
      (2 * resolution) / Math.max(resolution, d.initial),
    );
  const result = {
    residualFraction: v7RoundNumber(fraction),
    massLossFraction: v7RoundNumber(1 - fraction),
    uncertainty,
    stableReadings: 3,
    limitations: ASSAY_LIMIT,
  };
  sample.owner = a.id;
  preservationReleaseSurface(w, sample);
  sample.position = { ...a.position };
  delete sample.reservedFor;
  sample.processing = {
    ...(sample.processing ?? {}),
    gravimetricAssay: {
      source: d.source,
      apparatus: d.balance,
      tray: d.tray,
      readings: d.readings,
      paidEnergy: d.paid,
      result,
      completedAt: w.tick,
      waterLedger: p.id,
    },
  };
  openRemember(c, {
    key: `${sample.resource}:dry-residue`,
    subject: sample.resource,
    property: 'relative stable residue fraction',
    value: result,
    method: 'paid calibrated comparison and real passive drying',
    condition: 'ambient drying; finite resolution; no composition identity',
    verified: true,
  });
  c.emit(
    'food-assay-completed',
    'Retained actual altered residue; relative mass loss does not identify nutrition or toxic hazards.',
    {
      sample: sample.id,
      source: d.source,
      apparatus: d.balance,
      tray: d.tray,
      paidEnergy: d.paid,
      remainingWork: 0,
      result,
    },
    sample.id,
  );
  w.processes = w.processes.filter((x) => x.id !== p.id);
  delete a.extensionState['open:assay-work'];
  return { complete: true, remaining: 0, writes: [sample.id] };
}
