import type {
  V7ActionContext,
  V7Actor,
  V7Data,
  V7HandlerResult,
  V7Object,
  V7Package,
  V7Point,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7ObjectSchema } from './continuous-base.js';
import { v7RoundNumber } from './continuous-data.js';
import { v7Distance, v7Reach } from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { openConditions } from './open-physical.js';
import { cupSync } from './open-water-cup.js';
import { waterSurface } from './open-water-state.js';
import {
  ROOT_ZONE_LAW,
  ROOT_ZONE_REVISION,
  rootZoneCell,
  rootZoneKey,
} from './long-ex23-root-zone-water.js';
import type { RootZoneCell } from './long-ex23-root-zone-water.js';

/** ex23: Lin's narrowed plant watering. A small amount of river or shallow water is scooped by
 * hand (or into a water vessel that already exists) and poured onto the soil plot of a plant that
 * is already rooted, where it becomes retained root-zone water of that terrain cell
 * (long-ex23-root-zone-water.ts). The soil moisture read by the existing growth code then includes
 * it; growth itself is not changed, claimed or rewarded. */

const ID = 'rooted-plant-watering';
const HANDLER = `long.${ID}`;
const MODES = ['collect', 'water', 'status'];
/** Water held in two cupped hands: actor state, not an inventory item. It leaks between the
 * fingers at every round end (the collection round included) and while walking. */
const HANDS = {
  litres: 0.2,
  spillPerRound: 0.4,
  spillPerMetre: 0.2,
  emptyBelow: 0.005,
} as const;
/** Kneeling at the edge and scooping. */
const COLLECT_ENERGY = 0.3;
/** The specification's 2 energy per litre, charged on the litres actually poured; a pour of up
 * to 0.5 L is one round (2 work rounds per litre). A fifth of a hand pour misses the root zone,
 * a twentieth of a pour from a vessel. */
const POUR = {
  energyPerLitre: 2,
  minEnergy: 0.05,
  maxLitres: 0.5,
  loss: 0.2,
  vesselLoss: 0.05,
} as const;
/** Hazard waterlogging above which soil is treated as waterlogged (the world's site rules). */
const WATERLOGGED = 0.1;

interface Hands extends V7Data {
  actor: string;
  litres: number;
  source: string | null;
  collectedAt: number;
  x: number;
  y: number;
  collected: number;
  poured: number;
  delivered: number;
  pourSpilled: number;
  carrySpilled: number;
  withdrawals: V7Data;
}
interface Carrier {
  kind: 'hands' | 'vessel';
  id: string;
  litres: number;
  capacity: number;
  stack: V7Stack | null;
}

const r = (x: number) => v7RoundNumber(x);
const shown = (x: number) => String(Math.round(x * 1000) / 1000);
const nothing = (reason: string) => new Error(`${reason} Nothing was spent.`);
const handsKey = (actor: string) => `${ID}:hands:${actor}`;
const cellOf = (p: V7Point) => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
const centre = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5 });

function handsOf(w: V7World, actor: string): Hands | undefined {
  const v = w.state[handsKey(actor)];
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Hands)
    : undefined;
}
function newHands(a: V7Actor): Hands {
  return {
    actor: a.id,
    litres: 0,
    source: null,
    collectedAt: -1,
    x: a.position.x,
    y: a.position.y,
    collected: 0,
    poured: 0,
    delivered: 0,
    pourSpilled: 0,
    carrySpilled: 0,
    withdrawals: {},
  };
}

function view(
  w: V7World,
  a: V7Actor,
  phase: string,
  extra: V7Data = {},
): V7Data {
  return {
    component: null,
    operation: ID,
    actor: a.id,
    phase,
    x: a.position.x,
    y: a.position.y,
    updatedAt: w.tick,
    ...extra,
  };
}

/** Hands by default; with container, an owned existing vessel that has a water record. */
function carrierOf(c: V7ActionContext): Carrier {
  const { world: w, actor: a } = c;
  const raw = c.action.args.container;
  const ref = typeof raw === 'string' ? raw : '';
  if (!ref) {
    const h = handsOf(w, a.id);
    return {
      kind: 'hands',
      id: 'hands',
      litres: h?.litres ?? 0,
      capacity: HANDS.litres,
      stack: null,
    };
  }
  const s = w.stacks.find(
    (s) => s.id === ref && s.owner === a.id && !s.reservedFor,
  );
  if (!s) throw nothing(`No item ${ref} of yours is at hand.`);
  if (!s.waterCup)
    throw nothing(
      `${s.id} (${s.resource}) is not a water vessel: nothing in it holds water. Use your hands (no container).`,
    );
  return {
    kind: 'vessel',
    id: s.id,
    litres: Number(s.waterCup.waterMl) / 1000,
    capacity: Number(s.waterCup.capacityMl) / 1000,
    stack: s,
  };
}

/** A living rooted plant whose growth the existing plant rules simulate. */
function plantOf(c: V7ActionContext): V7Object {
  const target = c.action.args.target;
  if (typeof target !== 'string' || !target)
    throw nothing('Give target: a plant rooted in the ground.');
  const o = c.world.objects.find((o) => o.id === target);
  const resource = c.world.resources.find((x) => x.id === o?.data.resource);
  if (
    !o ||
    o.kind !== 'plant' ||
    !(Number(o.data.interval) > 0) ||
    resource?.id === 'fish' ||
    !resource?.properties?.moisture
  )
    throw nothing(
      `${target} is not a growing plant rooted in the ground; only the soil plot of such a plant can be watered, not bare ground, water or items.`,
    );
  return o;
}

/** The plant's measured soil and the moisture its growth reads. */
function measure(w: V7World, o: V7Object) {
  const soil = openConditions(w, o.spatial),
    climate = forestClimate(w, o.spatial);
  const requirement =
    w.resources.find((x) => x.id === o.data.resource)?.properties?.moisture ??
    1;
  const read =
    o.data.moisture === undefined ? climate.moisture : Number(o.data.moisture);
  return {
    soil,
    moisture: soil.moisture,
    read,
    requirement,
    factor: r(Math.min(1, read / Math.max(0.1, requirement))),
  };
}

/** Plants rooted in a terrain cell share its root-zone water. */
const rootedIn = (w: V7World, x: number, y: number) =>
  w.objects
    .filter(
      (o) =>
        o.kind === 'plant' &&
        Number(o.data.interval) > 0 &&
        Math.floor(o.spatial.x) === x &&
        Math.floor(o.spatial.y) === y,
    )
    .map((o) => o.id);

function collect(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  const x = typeof action.args.x === 'number' ? action.args.x : NaN,
    y = typeof action.args.y === 'number' ? action.args.y : NaN;
  if (!Number.isInteger(x) || !Number.isInteger(y))
    throw nothing(
      'collect needs x and y: the whole-number cell of visible river (~) or shallow water (=).',
    );
  let surface: ReturnType<typeof waterSurface>;
  try {
    surface = waterSurface(w, a, '', x, y);
  } catch (e) {
    throw nothing(e instanceof Error ? e.message : 'No visible surface.');
  }
  if (!surface.surface)
    throw nothing(
      `Cell ${String(x)},${String(y)} is not river or shallow water (ground ${surface.conditions.ground}).`,
    );
  if (!surface.reachable)
    throw nothing(
      `The water edge of cell ${String(x)},${String(y)} is ${shown(v7Distance(a.position, surface.point))} m away; stand on the bank within 0.65 m of it with a clear reach.`,
    );
  const carrier = carrierOf(c);
  const room = r(carrier.capacity - carrier.litres);
  if (room < 0.001)
    throw nothing(
      `Your ${carrier.kind === 'hands' ? 'hands already hold' : `vessel ${carrier.id} already holds`} ${shown(carrier.litres)} L, all it can.`,
    );
  const ml = Math.round(room * 1000);
  const finite = w.state[`water:cell:${surface.key}`];
  const compartment =
    finite && typeof finite === 'object' && !Array.isArray(finite)
      ? finite
      : null;
  if (compartment && Number(compartment.remainingMl) < ml)
    throw nothing(
      `The represented compartment of ${surface.key} holds ${String(Number(compartment.remainingMl))} ml, less than ${String(ml)} ml.`,
    );
  if (a.vitals.energy < COLLECT_ENERGY)
    throw nothing(
      `Scooping needs ${String(COLLECT_ENERGY)} energy; you have ${shown(a.vitals.energy)}.`,
    );
  a.vitals.energy = r(a.vitals.energy - COLLECT_ENERGY);
  if (compartment) {
    compartment.remainingMl = Number(compartment.remainingMl) - ml;
    compartment.withdrawnMl = Number(compartment.withdrawnMl) + ml;
  }
  const litres = ml / 1000;
  let held: number;
  if (carrier.stack?.waterCup) {
    const cup = carrier.stack.waterCup;
    cup.waterMl = Number(cup.waterMl) + ml;
    cup.withdrawnMl = Number(cup.withdrawnMl ?? 0) + ml;
    cupSync(carrier.stack);
    held = cup.waterMl / 1000;
  } else {
    const h = handsOf(w, a.id) ?? newHands(a);
    h.litres = r(h.litres + litres);
    h.collected = r(h.collected + litres);
    h.source = surface.key;
    h.collectedAt = w.tick;
    h.x = a.position.x;
    h.y = a.position.y;
    h.withdrawals[surface.key] = r(
      Number(h.withdrawals[surface.key] ?? 0) + litres,
    );
    w.state[handsKey(a.id)] = h;
    held = h.litres;
  }
  c.emit(
    'plant-watering-collected',
    `Scooped ${shown(litres)} L from ${surface.key} into your ${carrier.kind === 'hands' ? 'cupped hands' : `vessel ${carrier.id}`} (${shown(held)} L held) for ${String(COLLECT_ENERGY)} energy.${carrier.kind === 'hands' ? ` Hands leak: ${String(HANDS.spillPerRound * 100)}% of what is left is lost at each round end and ${String(HANDS.spillPerMetre * 100)}% per metre walked.` : ''} The source is not represented as finite here unless it was inspected as a compartment.`,
    {
      source: surface.key,
      litres,
      held,
      carrier: carrier.id,
      energy: COLLECT_ENERGY,
      finiteSource: !!compartment,
      view: view(w, a, 'collect', {
        source: surface.key,
        carrier: carrier.id,
        litres: held,
      }),
    },
    surface.key,
  );
  return {
    complete: true,
    remaining: 0,
    writes: [compartment ? `water:cell:${surface.key}` : handsKey(a.id)],
  };
}

function water(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a, action } = c;
  const o = plantOf(c);
  if (!v7Reach(a, o.spatial))
    throw nothing(
      `${o.id} is ${shown(v7Distance(a.position, o.spatial))} m away; its soil plot must be within your reach.`,
    );
  const m = measure(w, o);
  const values = `soil moisture ${shown(m.moisture)}, waterlogging ${shown(m.soil.waterlogging)}, requirement ${shown(m.requirement)} for ${typeof o.data.resource === 'string' ? o.data.resource : 'this plant'}`;
  if (
    m.soil.waterlogging > WATERLOGGED ||
    m.moisture >= ROOT_ZONE_LAW.saturation
  )
    throw nothing(
      `The plot of ${o.id} is waterlogged (${values}); added water would only run off or deepen the waterlogging.`,
    );
  if (Math.abs(m.read - m.moisture) > 1e-9)
    throw nothing(
      `Growth of ${o.id} reads moisture ${shown(m.read)} from its cover, not the soil (${values}); soil water would not reach it.`,
    );
  if (m.moisture >= m.requirement)
    throw nothing(
      `Not needed: ${values}. Its growth water factor min(1, moisture / requirement) is already ${shown(m.factor)}, so added water cannot help it.`,
    );
  const carrier = carrierOf(c);
  if (carrier.litres < 0.001)
    throw nothing(
      `Your ${carrier.kind === 'hands' ? 'hands hold' : `vessel ${carrier.id} holds`} no water; collect first.`,
    );
  const asked =
    action.args.quantityLitres === undefined
      ? Math.min(carrier.litres, POUR.maxLitres)
      : Number(action.args.quantityLitres);
  if (!(asked > 0) || asked > carrier.litres + 1e-9 || asked > POUR.maxLitres)
    throw nothing(
      `quantityLitres must be above 0 and at most the ${shown(carrier.litres)} L held and ${String(POUR.maxLitres)} L per pour.`,
    );
  const q = r(Math.min(asked, carrier.litres));
  const cost = r(Math.max(POUR.minEnergy, POUR.energyPerLitre * q));
  if (a.vitals.energy < cost)
    throw nothing(
      `Pouring ${shown(q)} L needs ${shown(cost)} energy; you have ${shown(a.vitals.energy)}.`,
    );
  a.vitals.energy = r(a.vitals.energy - cost);
  const spilled = r(
    q * (carrier.kind === 'hands' ? POUR.loss : POUR.vesselLoss),
  );
  const delivered = r(q - spilled);
  const cell = cellOf(o.spatial);
  const key = rootZoneKey(cell.x, cell.y);
  const record: RootZoneCell = rootZoneCell(w, o.spatial) ?? {
    ...cell,
    litres: 0,
    received: 0,
    runoff: 0,
    drained: 0,
    evaporated: 0,
    lastTick: w.tick,
  };
  const k = openConditions(w, centre(cell.x, cell.y));
  const base = k.unwatered ?? k.moisture;
  const room = Math.max(
    0,
    (ROOT_ZONE_LAW.saturation - base) * ROOT_ZONE_LAW.litresPerUnit -
      record.litres,
  );
  const retained = r(Math.min(delivered, room));
  const runoff = r(delivered - retained);
  record.litres = r(record.litres + retained);
  record.received = r(record.received + delivered);
  record.runoff = r(record.runoff + runoff);
  record.lastTick = w.tick;
  w.state[key] = record;
  if (carrier.stack?.waterCup) {
    const cup = carrier.stack.waterCup;
    cup.waterMl = Math.max(0, Number(cup.waterMl) - Math.round(q * 1000));
    cupSync(carrier.stack);
  } else {
    const h = handsOf(w, a.id) ?? newHands(a);
    h.litres = r(Math.max(0, h.litres - q));
    h.poured = r(h.poured + q);
    h.delivered = r(h.delivered + delivered);
    h.pourSpilled = r(h.pourSpilled + spilled);
    w.state[handsKey(a.id)] = h;
  }
  const after = measure(w, o);
  const sharing = rootedIn(w, cell.x, cell.y);
  c.emit(
    'plant-watering-poured',
    `Poured ${shown(q)} L onto the plot of ${o.id} (cell ${String(cell.x)},${String(cell.y)}) for ${shown(cost)} energy: ${shown(spilled)} L missed the root zone, ${shown(retained)} L was retained and ${shown(runoff)} L ran off. Soil moisture ${shown(m.moisture)} to ${shown(after.moisture)} (requirement ${shown(m.requirement)}); the root zone now holds ${shown(record.litres)} L, shared by ${sharing.join(', ')}. Growth is not changed or promised; later growth follows the existing plant rules and actual conditions.`,
    {
      target: o.id,
      cell: `${String(cell.x)}:${String(cell.y)}`,
      sharedBy: sharing,
      carrier: carrier.id,
      poured: q,
      spilled,
      delivered,
      retained,
      runoff,
      energy: cost,
      moistureBefore: m.moisture,
      moistureAfter: after.moisture,
      requirement: m.requirement,
      factorBefore: m.factor,
      factorAfter: after.factor,
      rootZoneLitres: record.litres,
      growthClaimed: false,
      view: view(w, a, 'pour', {
        target: o.id,
        cell: `${String(cell.x)}:${String(cell.y)}`,
        carrier: carrier.id,
        litres: q,
        retained,
        progress: 1,
      }),
    },
    o.id,
  );
  return {
    complete: true,
    remaining: 0,
    writes: [key, ...(carrier.stack ? [] : [handsKey(a.id)])],
  };
}

function status(c: V7ActionContext): V7HandlerResult {
  const { world: w, actor: a } = c;
  const carrier = carrierOf(c);
  const target = c.action.args.target;
  let plot: V7Data | null = null;
  if (typeof target === 'string' && target) {
    const o = plantOf(c);
    if (!v7Reach(a, o.spatial, 1))
      throw nothing(`${o.id} is too far to inspect its soil plot.`);
    const m = measure(w, o);
    const cell = cellOf(o.spatial);
    plot = {
      target: o.id,
      cell: `${String(cell.x)}:${String(cell.y)}`,
      sharedBy: rootedIn(w, cell.x, cell.y),
      moisture: m.moisture,
      waterlogging: m.soil.waterlogging,
      requirement: m.requirement,
      factor: m.factor,
      rootZone: rootZoneCell(w, o.spatial) ?? null,
    };
  }
  const h = handsOf(w, a.id) ?? null;
  c.emit(
    'plant-watering-status',
    `${carrier.kind === 'hands' ? 'Hands hold' : `Vessel ${carrier.id} holds`} ${shown(carrier.litres)} L.${plot ? ` Plot of ${typeof target === 'string' ? target : ''}: soil moisture ${shown(Number(plot.moisture))}, requirement ${shown(Number(plot.requirement))}, waterlogging ${shown(Number(plot.waterlogging))}.` : ''}`,
    {
      carrier: carrier.id,
      litres: carrier.litres,
      hands: h,
      plot,
      law: {
        hands: HANDS,
        collectEnergy: COLLECT_ENERGY,
        pour: POUR,
        rootZone: ROOT_ZONE_LAW,
      },
      view: view(w, a, 'status'),
    },
    typeof target === 'string' && target ? target : null,
  );
  return { complete: true, remaining: 0, writes: [] };
}

function execute(c: V7ActionContext): V7HandlerResult {
  if (c.actor.vitals.health <= 0)
    throw nothing('Only a living person can do this.');
  const mode = c.action.args.mode;
  if (mode === 'collect') return collect(c);
  if (mode === 'water') return water(c);
  if (mode === 'status') return status(c);
  throw nothing(`Give mode: ${MODES.join(', ')}.`);
}

/** Hand water leaks at each round end and with distance walked. */
function leak(w: V7World) {
  for (const [key, value] of Object.entries(w.state)) {
    if (!key.startsWith(`${ID}:hands:`)) continue;
    const h = value as Hands;
    if (!(h.litres > 0)) continue;
    const a = w.actors.find((x) => x.id === h.actor);
    if (!a) continue;
    const walked = v7Distance(a.position, h);
    let left =
      h.litres *
      (1 - HANDS.spillPerRound) *
      Math.pow(1 - HANDS.spillPerMetre, walked);
    if (left < HANDS.emptyBelow) left = 0;
    left = r(left);
    const lost = r(h.litres - left);
    h.litres = left;
    h.carrySpilled = r(h.carrySpilled + lost);
    h.x = a.position.x;
    h.y = a.position.y;
    forestEvent(
      w,
      'plant-watering-spilled',
      `${shown(lost)} L leaked from your hands${walked > 1e-6 ? ` over ${shown(walked)} m walked` : ''}; ${shown(left)} L left.`,
      a.position,
      a.id,
      {
        lost,
        left,
        walked: r(walked),
        view: view(w, a, 'spill', { carrier: 'hands', litres: left }),
      },
    );
  }
}

/** Retained root-zone water: runoff above saturation, drainage above field capacity, then
 * evaporation from the wetted soil (proportional, capped at the whole-cell rate), each round, with the cell's ground-derived moisture measured at its centre. */
function soil(w: V7World) {
  for (const [key, value] of Object.entries(w.state)) {
    if (!key.startsWith('root-zone-water:')) continue;
    const cell = value as RootZoneCell;
    if (!(cell.litres > 0)) continue;
    const k = openConditions(w, centre(cell.x, cell.y));
    const base = k.unwatered ?? k.moisture;
    const L = ROOT_ZONE_LAW.litresPerUnit;
    let litres = cell.litres;
    const runoff = Math.max(
      0,
      Math.min(litres, (base + litres / L - ROOT_ZONE_LAW.saturation) * L),
    );
    litres -= runoff;
    const drained = Math.max(
      0,
      Math.min(
        litres,
        (base + litres / L - ROOT_ZONE_LAW.fieldCapacity) *
          L *
          ROOT_ZONE_LAW.drainage,
      ),
    );
    litres -= drained;
    const evaporated = Math.min(
      litres * ROOT_ZONE_LAW.evaporationShare,
      ROOT_ZONE_LAW.evaporation,
    );
    litres -= evaporated;
    cell.runoff = r(cell.runoff + runoff);
    cell.drained = r(cell.drained + drained);
    // Derived from the ledger so that it closes exactly: received = litres + runoff + drained +
    // evaporated. A last trace counts as evaporated.
    if (litres < ROOT_ZONE_LAW.traceLitres) {
      cell.evaporated = r(cell.received - cell.runoff - cell.drained);
      cell.litres = 0;
    } else {
      cell.evaporated = r(cell.evaporated + evaporated);
      cell.litres = r(
        cell.received - cell.runoff - cell.drained - cell.evaporated,
      );
    }
    cell.lastTick = w.tick;
    if (cell.litres <= 0)
      forestEvent(
        w,
        'plant-watering-plot-dry',
        `The root zone of cell ${String(cell.x)},${String(cell.y)} no longer holds added water; its soil moisture is ground-derived again.`,
        centre(cell.x, cell.y),
        null,
        { ...cell },
      );
  }
}

export const LONG_EX23_PLANT_WATERING: V7Package = {
  id: ID,
  version: 1,
  scope: 'long-ex23',
  dependencies: ['foundation-open@1'],
  description:
    'Scoop a small amount of river or shallow water by hand (or into an existing water vessel), carry it with leakage and pour it onto the soil plot of an already rooted plant, where it is retained as root-zone water of that terrain cell with documented field capacity, saturation runoff, drainage and evaporation. Refused before any cost when the measured moisture already meets the plant requirement or the soil is waterlogged. No growth claim and no reward.',
  reuse: {
    experiment:
      'ex10 river-contact-water@1 water-surface identity, visibility and bank reach (waterSurface, waterReach) and represented compartment debit; ex10 water cup record (cupSync); foundation soil moisture (openConditions) and the existing plant growth reads (openPlants, forestGrowth)',
    source:
      'open-water-state.ts (waterSurface); open-water-cup.ts (cupSync); open-physical.ts (openConditions, with the gated root-zone hook); open-ecology.ts and forest-climate.ts (growth reads moisture as min(1, moisture / requirement) with the waterlogging penalty, unchanged); continuous-geometry.ts (v7Reach, v7Distance)',
    description: `New: root-zone water records per terrain cell read by openConditions only while ${ROOT_ZONE_REVISION} is installed and water was delivered; hand water with leakage; collect, water and status modes.`,
  },
  abilities: [
    {
      id: ID,
      name: 'Water a rooted plant',
      function:
        'Scoop a little river or shallow water by hand and pour it onto the soil plot of a rooted plant whose measured soil is drier than it needs.',
      equivalence: 'plant:root-zone-water-dose:1',
      parameters: {
        ...v7ObjectSchema({
          mode: { type: 'string', enum: MODES },
          x: { type: 'integer' },
          y: { type: 'integer' },
          target: { type: 'string' },
          container: { type: 'string' },
          quantityLitres: { type: 'number', minimum: 0.001, maximum: 0.5 },
        }),
        required: ['mode'],
      },
      references: { target: 'optional-exact-visible' },
      prerequisites: [],
      learning: 3,
      costs:
        'Study: 3 rounds. collect (x, y: a visible ~ or = cell whose edge is within 0.65 m of you on the bank): 1 round, 0.3 energy; fills cupped hands to 0.2 L (or an owned water vessel given as container to its capacity). water (target: a rooted growing plant in reach; quantityLitres optional, default all held, at most 0.5): 1 round, 2 energy per litre poured (at least 0.05). status (target optional): 1 round, no energy. Refused before any cost, with the measured values, when soil moisture already meets the plant requirement (berry 0.6, root 0.5, tuber 0.8, fern-root 0.7), the plot is waterlogged (hazard waterlogging above 0.1 or moisture 1.3+), the target is not a rooted plant, or no water is held.',
      effects:
        'Hand water is not an item: 40% of what is left leaks at each round end and 20% per metre walked; below 0.005 L it is gone. A pour loses 20% (from a vessel 5%) outside the root zone. The rest enters the root zone of the plant cell (1 m x 1 m, shared by every plant rooted there): 30 L raise soil moisture by 1; above 1.3 it runs off; above 1 half the excess drains each round; 10% evaporates each round (at most 0.0375 L). Soil moisture, which growth reads as min(1, moisture / requirement), includes it until it is gone. Growth is not boosted or promised. No reward.',
      handler: HANDLER,
      revision: ROOT_ZONE_REVISION,
      authored: false,
      // The pour event never carries a qualified flag: watering earns no practice milestone.
      practiceEvidence: 'plant-watering-poured',
      dependencies: { abilities: [], resources: [], knowledge: [] },
      execution: {
        duration: 1,
        interruption: 'cancel',
        progress:
          'Each mode is one round; nothing is left pending between rounds.',
      },
    },
  ],
  handlers: { [HANDLER]: execute },
  processes: {},
  visualComponents: [],
  events: [
    'plant-watering-collected',
    'plant-watering-poured',
    'plant-watering-spilled',
    'plant-watering-plot-dry',
    'plant-watering-status',
  ],
  resources: [],
  satisfaction: [],
  afterEnvironment(w) {
    leak(w);
    soil(w);
  },
  onDeath(w, a) {
    const h = handsOf(w, a.id);
    if (!h || !(h.litres > 0)) return;
    const lost = h.litres;
    h.carrySpilled = r(h.carrySpilled + lost);
    h.litres = 0;
    forestEvent(
      w,
      'plant-watering-spilled',
      'Water in the hands was lost at death.',
      a.position,
      a.id,
      {
        lost,
        left: 0,
        view: view(w, a, 'spill', { carrier: 'hands', litres: 0 }),
      },
    );
  },
};
