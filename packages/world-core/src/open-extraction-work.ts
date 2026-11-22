import type { V7ActionContext, V7Stack, V7Data } from './continuous-types.js';
import { v7String } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { foodTenths } from './forest-food-accounting.js';
import { waterItem, waterPoint } from './open-water-state.js';
import { cupSync } from './open-water-cup.js';
import {
  preservationTrayArea,
  preservationPhysics,
} from './open-preservation-physics.js';
import { assayRelativeReading } from './open-assay-reading.js';
import {
  extractionKey,
  extractionWork,
  extractionId,
  extractionEquipment,
  extractionPortion,
  extractionEmpty,
  extractionData,
} from './open-extraction-state.js';
import type { ExtractionWork } from './open-extraction-state.js';
import {
  extractionSeparate,
  extractionPhysicalSummary,
} from './open-extraction-process.js';
export function extractionReading(
  c: V7ActionContext,
  j: ExtractionWork,
  s: V7Stack,
): V7Data {
  const { balance, weight } = extractionEquipment(
    c,
    [j.balance, j.weight, j.tray, ...j.arms.map((a) => a.cup)],
    extractionKey(j.owner, j.id),
  );
  const r = assayRelativeReading(c.world, balance, s, weight),
    mass =
      (weight.physical?.unitMass ??
        c.world.resources.find((r) => r.id === weight.resource)?.mass ??
        0) * weight.quantity;
  if (!(r.resolution > 0 && mass > 0))
    throw new Error('Unresolved real weighing reference.');
  balance.data.service = Number(balance.data.service) - 0.1;
  return {
    tick: c.world.tick,
    relative: r.reading,
    resolution: r.resolution,
    lower: Math.max(0, r.reading - r.resolution / 2) * mass,
    upper: (r.reading + r.resolution / 2) * mass,
    units: 'Model mass relative to retained original weight; not certified SI.',
  };
}
function held(c: V7ActionContext, id: string, n: number) {
  const s = waterItem(c.world, c.actor, id);
  if (s.owner !== c.actor.id || s.reservedFor || foodTenths(s.quantity) < n)
    throw new Error('Insufficient exact owned unreserved food.');
  return s;
}
export function extractionPrepare(c: V7ActionContext) {
  const id = v7String(c.action.args.project, 'project');
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(id))
    throw new Error('Use a bounded stable personal project identity.');
  const key = extractionKey(c.actor.id, id),
    prior = c.world.state[key];
  if (prior) {
    const j = extractionWork(c.world, c.actor, id);
    if (
      c.action.args.sample !== j.arms[0]?.source ||
      c.action.args.reference !== j.arms[1]?.source ||
      c.action.args.water !== j.water ||
      c.action.args.quantityTenths !== j.quantityTenths ||
      c.action.args.waterMl !== j.waterMl ||
      JSON.stringify(c.action.args.apparatus) !==
        JSON.stringify(j.suppliedApparatus)
    )
      throw new Error('Continuing work must bind the same exact allocations.');
    return extractionAdvance(c, j);
  }
  const n = Number(c.action.args.quantityTenths),
    ml = Number(c.action.args.waterMl);
  if (
    !Number.isSafeInteger(n) ||
    n <= 0 ||
    !Number.isSafeInteger(ml) ||
    ml <= 0
  )
    throw new Error(
      'Positive integer food tenths and water ml per arm are required.',
    );
  const sample = held(c, v7String(c.action.args.sample, 'sample'), n),
    reference = held(c, v7String(c.action.args.reference, 'reference'), n);
  const known = c.actor.memory.discoveries?.[reference.resource];
  if (
    sample.id === reference.id ||
    !known ||
    Number(known.nutrition) <= 0 ||
    known.toxicity !== 0
  )
    throw new Error(
      'Distinct sample and personally evidenced known-food reference are required. Their safety does not transfer.',
    );
  const raw = c.action.args.apparatus;
  if (!Array.isArray(raw))
    throw new Error('Explicit apparatus roles are required.');
  const ids = raw.map((r) => extractionId(c, r)),
    equipment = extractionEquipment(c, ids),
    source = waterItem(
      c.world,
      c.actor,
      v7String(c.action.args.water, 'retained water'),
    );
  if (
    !source.waterCup ||
    source.reservedFor ||
    Number(source.waterCup.waterMl) < ml * 2
  )
    throw new Error(
      'An actual accessible intact cup must retain water for both arms.',
    );
  if (
    equipment.cups.some(
      (s) =>
        s.reservedFor ||
        (s.id !== source.id && Number(s.waterCup?.waterMl) !== 0),
    )
  )
    throw new Error(
      'Allocate unreserved empty cups, except the explicit retained-water source.',
    );
  const area = preservationTrayArea(c.world, equipment.tray);
  if (
    c.world.stacks.some(
      (s) =>
        preservationPhysics(s)?.tray === equipment.tray.id ||
        s.processing?.extractionTray === equipment.tray.id,
    )
  )
    throw new Error('Actual tray regions are already occupied.');
  for (const s of [sample, reference]) {
    const r = c.world.resources.find((r) => r.id === s.resource);
    if (!r || !['root', 'tuber'].includes(r.id))
      throw new Error(
        'This physical model supports root/tuber only; other composition is unresolved.',
      );
    const mass = ((s.physical?.unitMass ?? r.mass) * n) / 10,
      solids = ((s.physical?.unitSolids ?? r.mass * 0.25) * n) / 10;
    if (
      ml / 1000 < 2 * solids ||
      ml + mass * 1000 > 100 ||
      ml / 1000 + solids * 0.2 > (0.2 * area) / 2
    )
      throw new Error(
        'Allocated material/water exceeds actual 100-ml cup or half-tray capacity, or lacks twice dry mass of water.',
      );
    if (r.properties?.decay && (s.decay ?? 0) >= r.properties.decay)
      throw new Error('The original food has spoiled.');
  }
  if (c.actor.vitals.energy < 0.5)
    return { complete: false, remaining: 8, writes: [] };
  const cups = equipment.cups;
  const arms = [sample, reference].map((s, i) => {
    const cup = cups[i];
    if (!cup) throw new Error('Missing arm cup.');
    const point = waterPoint(c.world, cup),
      tissue = extractionPortion(c, s, n, key),
      liquid = extractionEmpty(c, tissue, 'liquid');
    for (const material of [tissue, liquid]) {
      material.owner = null;
      material.position = { ...point };
      material.processing = {
        ...material.processing,
        extractionTray: equipment.tray.id,
      };
    }
    return {
      source: s.id,
      origin: s.origin,
      tissue: tissue.id,
      liquid: liquid.id,
      cup: cup.id,
      initialSolids: tissue.physical?.unitSolids ?? 0,
      extracted: 0,
      mixedAt: -1,
      lastWater: 0,
      leakedSolids: 0,
      contactRounds: 0,
      separated: false,
      baseline: null,
    };
  });
  for (const cup of [...cups, source]) {
    cup.position = { ...waterPoint(c.world, cup) };
    cup.owner = null;
    cup.reservedFor = key;
  }
  const j: ExtractionWork = {
    id,
    owner: c.actor.id,
    stage: 0,
    paid: 0,
    status: 'preparing',
    balance: equipment.balance.id,
    weight: equipment.weight.id,
    tray: equipment.tray.id,
    water: source.id,
    waterMl: ml,
    quantityTenths: n,
    suppliedApparatus: raw as string[],
    arms,
    readings: [],
    x: c.actor.position.x,
    y: c.actor.position.y,
    invalid: [],
  };
  c.world.state[key] = j;
  c.world.processes.push({
    id: key,
    handler: 'open.extraction',
    owner: c.actor.id,
    object: j.tray,
    next: c.world.tick + 1,
    revision: 'noningestive-extractability@1',
    data: { project: id },
  });
  return extractionAdvance(c, j);
}
export function extractionAdvance(c: V7ActionContext, j: ExtractionWork) {
  if (!['preparing', 'paused'].includes(j.status))
    throw new Error('Only unfinished extraction preparation can resume.');
  const unpaid = () => ({
    complete: false,
    remaining: 8 - j.stage,
    writes: [] as string[],
  });
  try {
    extractionEquipment(
      c,
      [j.balance, j.weight, j.tray, ...j.arms.map((a) => a.cup)],
      extractionKey(j.owner, j.id),
    );
  } catch {
    return unpaid();
  }
  if (c.actor.vitals.energy < 0.5) return unpaid();
  const index = j.stage % 2,
    arm = j.arms[index];
  if (!arm) throw new Error('Missing retained experimental arm.');
  const tissue = c.world.stacks.find((s) => s.id === arm.tissue),
    cup = c.world.stacks.find((s) => s.id === arm.cup),
    source = c.world.stacks.find((s) => s.id === j.water);
  if (!tissue || !cup?.waterCup || !source?.waterCup)
    throw new Error('The original retained inputs are unavailable.');
  if (j.stage >= 6 && (arm.contactRounds < 2 || c.world.tick - arm.mixedAt < 2))
    return unpaid();
  if (j.stage === 2 || j.stage === 3) {
    if (source.id !== cup.id) {
      if (
        Number(source.waterCup.waterMl) < j.waterMl ||
        Number(cup.waterCup.waterMl) + j.waterMl > 100
      )
        return unpaid();
      source.waterCup.waterMl = Number(source.waterCup.waterMl) - j.waterMl;
      cup.waterCup.waterMl = Number(cup.waterCup.waterMl) + j.waterMl;
    } else if (Number(cup.waterCup.waterMl) < j.waterMl) return unpaid();
    cupSync(source);
    cupSync(cup);
  }
  if (j.stage >= 4 && j.stage < 6) {
    if (
      Number(cup.waterCup.waterMl) + (tissue.physical?.unitMass ?? 0) * 1000 >
      100
    )
      throw new Error(
        'Actual retained water and allocated tissue exceed the cup capacity.',
      );
    if (Number(cup.waterCup.waterMl) / 1000 < 2 * arm.initialSolids)
      return unpaid();
    arm.mixedAt = c.world.tick;
    arm.lastWater = Number(cup.waterCup.waterMl);
    extractionData(tissue).location = 'cup';
  }
  if (j.stage < 2) arm.baseline = extractionReading(c, j, tissue);
  if (j.stage >= 6) extractionSeparate(c.world, j, arm, index);
  v7Spend(c.actor, 0.5);
  j.paid += 0.5;
  j.stage++;
  j.status = j.stage === 8 ? 'passive' : 'preparing';
  c.actor.extensionState['extraction:active'] = j.id;
  if (j.stage === 8) delete c.actor.extensionState['extraction:active'];
  c.emit(
    'extraction-progress',
    'Paid one arm handling stage; conserved material and real elapsed contact determine remaining work.',
    {
      operationId: extractionKey(j.owner, j.id),
      stage: j.stage,
      paidEnergy: j.paid,
      remainingWork: 8 - j.stage,
      arms: extractionPhysicalSummary(c.world, j),
    },
    j.tray,
  );
  return {
    complete: j.stage === 8,
    remaining: 8 - j.stage,
    writes: [
      ...j.arms.flatMap((a) => [a.tissue, a.liquid, a.cup]),
      j.water,
      j.tray,
      j.balance,
    ],
  };
}
