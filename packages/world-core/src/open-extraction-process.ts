import type {
  V7World,
  V7Stack,
  V7Process,
  V7Data,
} from './continuous-types.js';
import { cupSync } from './open-water-cup.js';
import { v7Clone, v7Id } from './continuous-data.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import {
  preservationExchange,
  preservationPhysics,
} from './open-preservation-physics.js';
import {
  extractionKey,
  extractionData,
  extractionTransfer,
  EXTRACTION_LIMIT,
} from './open-extraction-state.js';
import type { ExtractionWork, ExtractionArm } from './open-extraction-state.js';
export function extractionStop(w: V7World, j: ExtractionWork, reason: string) {
  if (['stopped', 'removed'].includes(j.status)) return;
  const key = extractionKey(j.owner, j.id);
  for (const arm of j.arms) {
    const cup = w.stacks.find((s) => s.id === arm.cup),
      liquid = w.stacks.find((s) => s.id === arm.liquid);
    if (!arm.separated && cup?.waterCup && liquid?.physical) {
      liquid.physical.unitWater += Number(cup.waterCup.waterMl) / 1000;
      liquid.physical.unitMass =
        liquid.physical.unitSolids + liquid.physical.unitWater;
      cup.waterCup.waterMl = 0;
      cupSync(cup);
      arm.separated = true;
      extractionData(liquid).location = 'ground mixture';
    }
  }
  for (const s of w.stacks.filter((s) => s.reservedFor === key)) {
    delete s.reservedFor;
    s.owner = null;
    if (s.processing) delete s.processing.extractionTray;
  }
  j.status = 'stopped';
  const a = w.actors.find((a) => a.id === j.owner);
  if (a) delete a.extensionState['extraction:active'];
  // The installed physical process becomes ownerless; liquids, leakage and weather keep advancing.
  const process = w.processes.find((p) => p.id === key);
  if (process) process.owner = null;
  forestEvent(
    w,
    'extraction-stopped',
    reason,
    { x: j.x, y: j.y },
    j.owner,
    {
      operationId: key,
      stage: j.stage,
      paidEnergy: j.paid,
      remainingWork: Math.max(0, 8 - j.stage),
      limitation: EXTRACTION_LIMIT,
    },
    j.tray,
  );
}
function deposit(w: V7World, s: V7Stack, amount: number, source: string) {
  if (amount <= 0) return;
  const d = {
    ...v7Clone(s),
    id: v7Id(w, 'item'),
    owner: null,
    physical: { unitMass: 0, unitWater: 0, unitSolids: 0 },
  };
  delete d.reservedFor;
  if (d.processing) {
    delete d.processing.extractionTray;
    delete d.processing.preservationPhysics;
    delete d.processing.extractionRegion;
  }
  const data = extractionData(d);
  for (const k of ['nutrition', 'toxins', 'originalQuantity']) data[k] = 0;
  data.role = 'leakage deposit';
  data.location = 'ground';
  data.source = source;
  extractionTransfer(s, d, amount);
  w.stacks.push(d);
}
function advanceArm(w: V7World, j: ExtractionWork, arm: ExtractionArm) {
  const cup = w.stacks.find((s) => s.id === arm.cup),
    tissue = w.stacks.find((s) => s.id === arm.tissue),
    liquid = w.stacks.find((s) => s.id === arm.liquid);
  if (!tissue || !liquid) {
    j.invalid.push('Allocated analytical material unavailable.');
    return;
  }
  const c = cup?.waterCup;
  if (!arm.separated && arm.mixedAt >= 0) {
    const remaining = Number(c?.waterMl ?? 0),
      lost = Math.max(0, arm.lastWater - remaining);
    if (lost > 0 && arm.lastWater > 0) {
      const solids = liquid.physical?.unitSolids ?? 0,
        amount = solids * Math.min(1, lost / arm.lastWater);
      deposit(w, liquid, amount, arm.cup);
      arm.leakedSolids += amount;
      if (
        !j.invalid.includes(
          'Unmeasured liquid leakage prevents a quantitative recovery estimate.',
        )
      )
        j.invalid.push(
          'Unmeasured liquid leakage prevents a quantitative recovery estimate.',
        );
    }
    arm.lastWater = remaining;
    if (!c) {
      j.invalid.push(
        'Cup collapsed; surviving tissue and liquid deposits remain.',
      );
      arm.separated = true;
      return;
    }
    if (remaining > 0 && w.tick > arm.mixedAt) {
      const amount = Math.min(
        tissue.physical?.unitSolids ?? 0,
        Math.max(0, arm.initialSolids * 0.2 - arm.extracted) / 2,
      );
      extractionTransfer(tissue, liquid, amount);
      arm.extracted += amount;
      arm.contactRounds++;
    }
  }
  for (const s of [tissue, liquid]) {
    const d = extractionData(s),
      climate = forestClimate(w, s.position);
    d.decay = Number(d.decay) + Math.max(0.15, (climate.temperature + 4) / 24);
    if (Number(d.lifetime) > 0 && d.decay >= Number(d.lifetime)) {
      d.spoiled = true;
      if (!j.invalid.includes('An actual allocated material spoiled.'))
        j.invalid.push('An actual allocated material spoiled.');
    }
    if (preservationPhysics(s)) preservationExchange(w, s);
  }
}
export function extractionProcess(w: V7World, p: V7Process) {
  const j = w.state[p.id] as ExtractionWork | undefined;
  if (!j) throw new Error('Missing persistent extraction controller.');
  const old = j.invalid.length;
  for (const arm of j.arms) advanceArm(w, j, arm);
  if (j.invalid.length > old)
    forestEvent(
      w,
      'extraction-invalidated',
      'Actual losses, vessel state or deterioration limit the experiment; physical material is retained.',
      { x: j.x, y: j.y },
      j.owner,
      {
        operationId: p.id,
        limits: [...new Set(j.invalid)],
        stage: j.stage,
        paidEnergy: j.paid,
        remainingWork: Math.max(0, 8 - j.stage),
        arms: extractionPhysicalSummary(w, j),
      },
      j.tray,
    );
  p.next = w.tick + 1;
}
/** Transfer actual free liquid, retaining a one-ml cup film rather than erasing transfer loss. */
export function extractionSeparate(
  w: V7World,
  j: ExtractionWork,
  arm: ExtractionArm,
  slot: number,
) {
  const cup = w.stacks.find((s) => s.id === arm.cup),
    liquid = w.stacks.find((s) => s.id === arm.liquid),
    tray = w.objects.find((o) => o.id === j.tray);
  if (!cup?.waterCup || !liquid?.physical || !tray)
    throw new Error('Actual separation apparatus or mixture is unavailable.');
  const water = Number(cup.waterCup.waterMl),
    film = Math.min(1, water),
    fraction = water > 0 ? film / water : 0;
  deposit(w, liquid, liquid.physical.unitSolids * fraction, arm.cup);
  cup.waterCup.waterMl = film;
  liquid.physical.unitWater += (water - film) / 1000;
  liquid.physical.unitMass =
    liquid.physical.unitSolids + liquid.physical.unitWater;
  liquid.position = { x: tray.spatial.x, y: tray.spatial.y };
  const shape = tray.spatial.shape,
    area =
      (shape.kind === 'circle'
        ? Math.PI * shape.radius ** 2
        : shape.width * shape.height) / 2;
  liquid.processing = {
    ...liquid.processing,
    extractionRegion: { project: extractionKey(j.owner, j.id), area, slot },
    preservationPhysics: {
      version: 1,
      initialWaterFraction:
        liquid.physical.unitWater / Math.max(1e-10, liquid.physical.unitMass),
      initialUnitMass: liquid.physical.unitMass,
      opening: 1.1,
      prepared: true,
      tray: tray.id,
      area,
      evaporated: 0,
      absorbed: 0,
      rainAdded: 0,
      lastTick: -1,
      baselineDeterioration: 0,
      actualDeterioration: 0,
      history: [],
      contamination:
        'Unresolved vessel and water contamination; no safety inference.',
      initialization:
        'Conserved actual liquid/residue; two disjoint half-tray regions.',
    },
  };
  extractionData(liquid).location = 'tray';
  arm.separated = true;
  arm.lastWater = film;
  j.invalid.push(
    'One-ml retained film and unresolved water/vessel contamination limit the result.',
  );
}
export function extractionPhysicalSummary(
  w: V7World,
  j: ExtractionWork,
): V7Data[] {
  return j.arms.map((arm) => ({
    cup: arm.cup,
    tissue: arm.tissue,
    liquid: arm.liquid,
    contactRounds: arm.contactRounds,
    leakedSolids: arm.leakedSolids,
    separated: arm.separated,
    waterMl: w.stacks.find((s) => s.id === arm.cup)?.waterCup?.waterMl ?? null,
    limitation: EXTRACTION_LIMIT,
  }));
}
