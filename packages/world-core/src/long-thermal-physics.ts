import type {
  V7Data,
  V7Resource,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7Clone } from './continuous-data.js';

/** Declared modeling values of ex17 thermal food preparation. They are physical assumptions of
 * this operation, not discovered facts, and they change no other rule of the simulation. */
export const HEAT = {
  /** Thermal time of one round: one eightieth of the 80-round day, 18 minutes. It is used only
   * inside this heat integration; every other rule keeps its own per-round values. */
  roundSeconds: 1080,
  substeps: 36,
  /** Heat of one fuel unit of the local-fire@1 combustion rule: a 1.1 kg branch holds 8 units,
   * about 16 MJ of air-dry wood, so about 2 MJ per unit. */
  fuelJoules: 2_000_000,
  /** Hot soil and ash of the cleared bed (about 5 kg at 0.8 kJ/kg/K) and its loss conductance to
   * the surroundings: a fire at the full burn rate holds the bed about 600 K above ambient. */
  bedCapacity: 4000,
  bedLoss: 3,
  /** Combined contact and radiant coefficient between the bed and the food face lying on it,
   * still-air coefficient of an exposed face, and conductivity of water-rich food. */
  bedContact: 15,
  airContact: 10,
  conductivity: 0.5,
  /** Food is a sphere of water-rich tissue (1000 kg/m3); two surface faces of 15% each and a core. */
  density: 1000,
  faceShare: 0.15,
  waterHeat: 4180,
  solidHeat: 1500,
  latent: 2_260_000,
  boil: 100,
  /** Dry tissue chars above 200 C at 2e-5 per K per second; 30% of charred solids stay as char. */
  charStart: 200,
  charRate: 0.00002,
  charYield: 0.3,
  /** Cooked label: core at least 85 C for a cumulative 10 minutes. */
  cookedCore: 85,
  cookedSeconds: 600,
  charredShare: 0.2,
  /** Below a tenth of the original solids nothing edible remains. */
  destroyedShare: 0.1,
  /** Hand handling: food surface at most 50 C, bed at most 60 C; otherwise a stick is needed. */
  handFood: 50,
  handBed: 60,
} as const;

/** local-fire@1 combustion and ignition values, reused unchanged for this hearth. */
export const BURN = {
  perRound: 1,
  ash: 0.1,
  embers: 3,
  rainOut: 0.6,
  litDrying: 0.08,
  wetting: 0.08,
  drying: 0.01,
  capacity: 8,
  rain: 0.15,
  wind: 0.65,
  moisture: 0.35,
  tinder: 0.5,
  kindling: 0.5,
} as const;

/** Declared hand-drill values: drill power at the contact, dust heat-loss conductance (raised by
 * wind), wood-dust ember temperature, socket abrasion and wear per round, socket warm-up per
 * consecutive round, and tinder burned by ember transfer and by first tending. */
export const DRILL = {
  rounds: 12,
  power: 20,
  loss: 0.04,
  windLoss: 0.5,
  ember: 350,
  smoke: 200,
  dust: 0.002,
  socket: 1.5,
  socketFull: 3,
  boardWear: 0.0015,
  spindleWear: 0.0005,
  warm: 15,
  energy: 1.5,
  stage: 0.5,
  tinderBurn: 0.1,
} as const;

export interface Weather {
  temperature: number;
  rain: number;
  wind: number;
}
export interface FuelLot extends V7Data {
  item: string;
  resource: string;
  quantity: number;
  mass: number;
  energy: number;
  moisture: number;
}
export interface FoodNode extends V7Data {
  water: number;
  solids: number;
  char: number;
  t: number;
}
export type FoodState =
  'unheated' | 'partly-heated' | 'cooked' | 'charred' | 'destroyed';
export interface FoodLot extends V7Data {
  stack: string;
  cook: string;
  resource: string;
  quantity: number;
  source: string;
  origin: string;
  placedAt: number;
  onBed: boolean;
  /** Index of the face lying on the bed (0 or 1); node 2 is the core. */
  down: number;
  nodes: FoodNode[];
  area: number;
  radius: number;
  /** Solids at placement, and before any heating (the nutrition reference). */
  initialSolids: number;
  originalSolids: number;
  initialWater: number;
  startT: number;
  exposure: number;
  peakCore: number;
  peakSurface: number;
  evaporated: number;
  gases: number;
  turned: number;
  heating: boolean;
  state: FoodState;
}
export interface HeatLedger extends V7Data {
  /** Joules released by burning, delivered from the bed to food, lost by the bed to the
   * surroundings, lost by food to air, carried off by vapour and by pyrolysis gases. */
  released: number;
  food: number;
  surroundings: number;
  foodLoss: number;
  evaporation: number;
  vented: number;
}
export interface Hearth extends V7Data {
  version: number;
  builder: string;
  prepared: boolean;
  preparedAt: number | null;
  lit: boolean;
  litAt: number | null;
  embers: number;
  burnFraction: number;
  lots: FuelLot[];
  /** Mass ledger: fuel burned, its ash and released gases; food char, drill dust and discarded food. */
  burned: number;
  ash: number;
  released: number;
  residue: number;
  bed: number;
  lastTick: number;
  heat: HeatLedger;
  food: FoodLot[];
  ignitions: number;
  smothered: number;
  failures: number;
  history: V7Data[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const sum = (xs: number[]) => xs.reduce((n, x) => n + x, 0);
export const nodeCapacity = (n: FoodNode) =>
  Math.max(
    1e-9,
    HEAT.waterHeat * n.water + HEAT.solidHeat * (n.solids + n.char),
  );

/** Exact relaxation of two lumped bodies over dt; `cb` Infinity is an ambient reservoir.
 * Returns the heat (J) moved from a to b. */
function relax(
  ta: number,
  ca: number,
  tb: number,
  cb: number,
  g: number,
  dt: number,
): number {
  if (!(ca > 0) || !(cb > 0) || g <= 0) return 0;
  const inv = 1 / ca + (Number.isFinite(cb) ? 1 / cb : 0);
  return ((ta - tb) * (1 - Math.exp(-g * dt * inv))) / inv;
}

/** Sphere geometry of a food portion of mass m (kg): exposed area (m2) and radius (m). */
export function foodGeometry(mass: number) {
  const volume = mass / HEAT.density;
  return {
    area: Math.cbrt(36 * Math.PI) * volume ** (2 / 3),
    radius: Math.cbrt((3 * volume) / (4 * Math.PI)),
  };
}

/** A new food lot at ambient temperature from its real water and solids (kg). */
export function foodLot(
  base: Pick<
    FoodLot,
    'stack' | 'cook' | 'resource' | 'quantity' | 'source' | 'origin'
  >,
  water: number,
  solids: number,
  t: number,
  tick: number,
  prior: { exposure: number; originalSolids: number } | null,
): FoodLot {
  const share = [HEAT.faceShare, HEAT.faceShare, 1 - 2 * HEAT.faceShare];
  const shape = foodGeometry(water + solids);
  const lot: FoodLot = {
    ...base,
    placedAt: tick,
    onBed: true,
    down: 0,
    nodes: share.map((f) => ({
      water: water * f,
      solids: solids * f,
      char: 0,
      t,
    })),
    area: shape.area,
    radius: shape.radius,
    initialSolids: solids,
    originalSolids: Math.max(solids, prior?.originalSolids ?? 0),
    initialWater: water,
    startT: t,
    exposure: prior?.exposure ?? 0,
    peakCore: t,
    peakSurface: t,
    evaporated: 0,
    gases: 0,
    turned: 0,
    heating: false,
    state: 'unheated',
  };
  lot.state = foodStatus(lot);
  return lot;
}

/** Edible remainder: uncharred solids and their water, as a share of the original solids. */
export function foodYield(l: FoodLot) {
  const solids = sum(l.nodes.map((n) => n.solids)),
    water = sum(l.nodes.map((n) => n.water)),
    char = sum(l.nodes.map((n) => n.char));
  const share =
    l.originalSolids > 0 ? Math.min(1, solids / l.originalSolids) : 0;
  return { solids, water, char, share, burnt: 1 - share };
}

export function foodStatus(l: FoodLot): FoodState {
  const y = foodYield(l);
  if (y.share < HEAT.destroyedShare) return 'destroyed';
  if (y.burnt >= HEAT.charredShare) return 'charred';
  if (l.exposure >= HEAT.cookedSeconds) return 'cooked';
  if (l.peakCore >= l.startT + 5 || l.peakSurface >= l.startT + 15)
    return 'partly-heated';
  return 'unheated';
}

/** Hottest surface face. */
export const foodSurface = (l: FoodLot) =>
  Math.max(l.nodes[0]?.t ?? 0, l.nodes[1]?.t ?? 0);

/** One round of the local-fire@1 fuel rule on this hearth's open bed: lot moisture drift, rain
 * dousing, at most one fuel unit per round scaled by dryness, 10% ash, three ember rounds. */
export function burnRound(h: Hearth, c: Weather) {
  for (const lot of h.lots)
    lot.moisture = clamp01(
      lot.moisture -
        (h.lit ? BURN.litDrying : 0) +
        (c.rain > 0 ? BURN.wetting * c.rain : -BURN.drying * (1 + c.wind)),
    );
  h.burnFraction = 0;
  let doused = false,
    exhausted = false;
  if (c.rain > BURN.rainOut && h.lit) {
    h.lit = false;
    h.embers = 0;
    doused = true;
  }
  const consumed: V7Data[] = [];
  if (h.lit) {
    let left: number = BURN.perRound;
    for (const lot of h.lots) {
      const energy =
        Math.min(left, lot.quantity * lot.energy) * (1 - lot.moisture);
      if (energy <= 1e-8) continue;
      const quantity = energy / lot.energy,
        mass = quantity * lot.mass;
      lot.quantity -= quantity;
      left -= energy;
      h.burned += mass;
      h.ash += mass * BURN.ash;
      h.released += mass * (1 - BURN.ash);
      consumed.push({
        item: lot.item,
        resource: lot.resource,
        quantity,
        mass,
        energy,
      });
      if (left <= 1e-8) break;
    }
    h.lots = h.lots.filter((l) => l.quantity > 1e-8);
    h.burnFraction = BURN.perRound - left;
    h.embers = h.burnFraction > 0 ? BURN.embers : Math.max(0, h.embers - 1);
    if (!h.embers) {
      h.lit = false;
      exhausted = true;
    }
  }
  const joules = h.burnFraction * HEAT.fuelJoules;
  h.heat.released += joules;
  return { consumed, doused, exhausted, joules };
}

/** Water leaves a node above boiling; dry tissue chars above 200 C. Energy and mass are kept in
 * the ledgers exactly. */
function phase(h: Hearth, l: FoodLot, n: FoodNode, dt: number) {
  if (n.t > HEAT.boil && n.water > 0) {
    const excess = nodeCapacity(n) * (n.t - HEAT.boil);
    const vapour = Math.min(n.water, excess / HEAT.latent);
    const left = excess - vapour * HEAT.latent;
    n.water -= vapour;
    if (n.water < 1e-12) n.water = 0;
    const capacity = nodeCapacity(n);
    n.t = HEAT.boil + (capacity > 0 ? left / capacity : 0);
    l.evaporated += vapour;
    h.heat.evaporation += vapour * (HEAT.latent + HEAT.waterHeat * HEAT.boil);
  }
  if (n.water <= 0 && n.t > HEAT.charStart && n.solids > 0) {
    const burnt =
      n.solids * Math.min(1, HEAT.charRate * (n.t - HEAT.charStart) * dt);
    const gas = burnt * (1 - HEAT.charYield);
    n.solids -= burnt;
    n.char += burnt * HEAT.charYield;
    l.gases += gas;
    h.heat.vented += gas * HEAT.solidHeat * n.t;
  }
}

/** One round of heat flow: fire power into the bed, bed loss to the surroundings, bed to the face
 * of each food lying on it, exposed faces to air and faces to core, by exact pairwise
 * relaxation over sub-steps. Food set aside on the rim exchanges only with air. */
export function heatRound(h: Hearth, air: number, joules: number) {
  const dt = HEAT.roundSeconds / HEAT.substeps,
    power = joules / HEAT.roundSeconds;
  for (const l of h.food) l.heating = false;
  for (let k = 0; k < HEAT.substeps; k++) {
    h.bed += (power * dt) / HEAT.bedCapacity;
    const loss = relax(
      h.bed,
      HEAT.bedCapacity,
      air,
      Infinity,
      HEAT.bedLoss,
      dt,
    );
    h.bed -= loss / HEAT.bedCapacity;
    h.heat.surroundings += loss;
    for (const l of h.food) {
      const face = l.area / 2,
        core = l.nodes[2],
        down = l.nodes[l.down],
        up = l.nodes[1 - l.down];
      if (!core || !down || !up) continue;
      const cool = (n: FoodNode) => {
        const q = relax(
          n.t,
          nodeCapacity(n),
          air,
          Infinity,
          HEAT.airContact * face,
          dt,
        );
        n.t -= q / nodeCapacity(n);
        h.heat.foodLoss += q;
      };
      if (l.onBed) {
        const q = relax(
          h.bed,
          HEAT.bedCapacity,
          down.t,
          nodeCapacity(down),
          HEAT.bedContact * face,
          dt,
        );
        h.bed -= q / HEAT.bedCapacity;
        down.t += q / nodeCapacity(down);
        h.heat.food += q;
        if (q > 0) l.heating = true;
      } else cool(down);
      cool(up);
      const g = (HEAT.conductivity * face) / Math.max(1e-6, l.radius / 2);
      for (const n of [down, up]) {
        const q = relax(
          n.t,
          nodeCapacity(n),
          core.t,
          nodeCapacity(core),
          g,
          dt,
        );
        n.t -= q / nodeCapacity(n);
        core.t += q / nodeCapacity(core);
      }
      for (const n of l.nodes) phase(h, l, n, dt);
      if (core.t >= HEAT.cookedCore) l.exposure += dt;
      l.peakCore = Math.max(l.peakCore, core.t);
      l.peakSurface = Math.max(l.peakSurface, foodSurface(l));
    }
  }
  for (const l of h.food) l.state = foodStatus(l);
}

/** Model estimate for one food lot under the current weather and loaded fuel, without new
 * fuel, turning or other action: rounds until the cooked criterion and fuel units burned. */
export function heatEstimate(
  h: Hearth,
  stack: string,
  c: Weather,
  horizon = 24,
) {
  const copy = v7Clone(h);
  const now = copy.food.find((x) => x.stack === stack);
  if (!now) return null;
  if (now.state === 'destroyed' || now.state === 'charred')
    return { rounds: null, fuel: 0, outcome: now.state, within: 0 };
  if (now.exposure >= HEAT.cookedSeconds)
    return { rounds: 0, fuel: 0, outcome: now.state, within: 0 };
  let fuel = 0;
  for (let round = 1; round <= horizon; round++) {
    const burn = burnRound(copy, c);
    fuel += copy.burnFraction;
    heatRound(copy, c.temperature, burn.joules);
    const l = copy.food.find((x) => x.stack === stack);
    if (!l) return null;
    if (l.state === 'destroyed' || l.state === 'charred')
      return { rounds: null, fuel, outcome: l.state, within: round };
    if (l.exposure >= HEAT.cookedSeconds)
      return { rounds: round, fuel, outcome: l.state, within: round };
    if (!copy.lit && copy.bed < (l.nodes[2]?.t ?? 0) + 1 && !burn.joules)
      return { rounds: null, fuel, outcome: l.state, within: round };
  }
  return { rounds: null, fuel, outcome: 'not reached', within: horizon };
}

export interface Drill extends V7Data {
  stage: string;
  rounds: number;
  streak: number;
  socket: number;
  dust: number;
  last: number;
  peak: number;
  boardWear: number;
  spindleWear: number;
  charred: number;
  embers: number;
}
/** One worked hand-drill round. Contact grows as the spindle wears a socket into the board;
 * damp pieces lose the heat to their water (no ember above moisture 0.35); wind cools the dust;
 * the socket wood warms with consecutive rounds. An ember needs 2 g of dust at 350 C. */
export function drillRound(d: Drill, moisture: number, c: Weather) {
  const contact = Math.min(1, 0.5 + d.socket / DRILL.socketFull);
  const dryness = clamp01(1 - moisture / BURN.moisture);
  const loss = DRILL.loss * (1 + DRILL.windLoss * c.wind);
  d.rounds += 1;
  d.streak += 1;
  const peak =
    c.temperature +
    DRILL.warm * (d.streak - 1) +
    (contact * dryness * DRILL.power) / loss;
  d.socket += DRILL.socket;
  d.boardWear += DRILL.boardWear;
  d.spindleWear += DRILL.spindleWear;
  d.dust += DRILL.boardWear + DRILL.spindleWear;
  d.last = peak;
  d.peak = Math.max(d.peak, peak);
  if (peak >= DRILL.smoke) d.charred = d.dust;
  const ember = peak >= DRILL.ember && d.dust >= DRILL.dust - 1e-9;
  return { peak, contact, dryness, ember, smoke: peak >= DRILL.smoke };
}

/** Eating profile of heat-prepared food: the same food, one unit at its original nutrition
 * times the remaining solids share, never more; no new meal method or quality. Only worlds with
 * this operation installed read it. */
export function hearthFoodProfile(
  w: V7World,
  s: V7Stack,
): V7Resource | undefined {
  const record = s.processing?.hearthPreparation;
  if (
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record) ||
    record.version !== 1 ||
    typeof record.nutritionPerUnit !== 'number' ||
    !w.revisions.includes('hearth-food-preparation@1')
  )
    return undefined;
  const base = w.resources.find((r) => r.id === s.resource);
  if (!base) return undefined;
  return {
    ...base,
    name: `Heat-prepared ${base.name.toLowerCase()}`,
    nutrition: Math.min(base.nutrition, record.nutritionPerUnit),
    mass: s.physical?.unitMass ?? base.mass,
  };
}
