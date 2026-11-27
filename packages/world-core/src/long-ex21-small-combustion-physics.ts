import type {
  V7Actor,
  V7Data,
  V7Object,
  V7Point,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7RoundNumber } from './continuous-data.js';
import {
  v7Distance,
  v7Obstacles,
  v7SegmentClear,
  v7ShapeDistance,
} from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { BURN, HEAT } from './long-thermal-physics.js';

/** ex21 small-combustion-source@1: the mass, heat and hazard rules of a small open fuel bed. They
 * are declared version-1 modeling values of this operation, not discovered facts, and they change
 * no other rule of the simulation. Combustion, ignition limits and warmth reuse local-fire@1 and
 * ex17 hearth values (long-thermal-physics.ts) unchanged. */

export const SMALL_FIRE_ID = 'small-combustion-source';
export const SMALL_FIRE_REVISION = `${SMALL_FIRE_ID}@1`;
export const SMALL_FIRE_ABILITY = 'operate-small-combustion-source';
export const SMALL_FIRE_KIND = 'small-combustion-source';

export const SMALL_FIRE = {
  version: 1,
  /** World Agent specification: the fuel bed radius and the probe interaction reach (m). */
  bedRadius: 0.2,
  reach: 0.65,
  /** ex17 open-hearth rim: loose fuel within 0.25 m of the edge of a burning bed catches. */
  rim: 0.25,
  /** Fresh fuel mass the bed holds (kg): local-fire's 8 mass for a 0.45 m hearth scaled by area. */
  capacity: 1.6,
  /** Declared energy conversion: one world energy unit is at most 21.6 kJ of hand work, the ex17
   * 20 W hand friction power over the 1080 s thermal round. */
  workPerEnergy: 20 * HEAT.roundSeconds,
  /** Bed of soil, ash and embers (J/K) and its loss conductance (W/K): ex17's 0.45 m bed scaled by
   * area. A fifth of the released heat enters the bed and a tenth is the near-field radiant share;
   * the rest leaves with the flame gases. At the full open-air burn rate the bed holds about 620 K
   * above the air and cools with a time constant of about 1.2 rounds. */
  bedCapacity: 800,
  bedLoss: 0.6,
  bedShare: 0.2,
  nearShare: 0.1,
  /** local-fire@1 warmth: 0.6 x burn fraction x (1 - d / 2) x (1 - 0.5 x wind) degrees per round. */
  warmth: 0.6,
  warmthRange: 2,
  /** Heat capacity booked per degree of the world's body temperature: 70 kg at 3.5 kJ/kg/K. */
  body: 245_000,
  /** Health lost per round by a body standing on the bed at the full burn fraction. */
  contactBurn: 5,
  /** Smothering covers the bed 1 cm deep in granular or plastic earth at 1600 kg/m3 (2.01 kg). */
  coverDepth: 0.01,
  coverDensity: 1600,
  coverHeat: 800,
  /** Bed temperature (C) at which retained heat lights dry tinder; handling and cooled margins. */
  hotIgnition: 300,
  handHot: 60,
  cooled: 5,
  /** Highest represented water share of a fuel lot after rain. */
  maxWater: 0.9,
  /** Declared v1 piece geometry: a round rod of green wood at 900 kg/m3, length 25 diameters; a
   * rubbing piece is gripped two-handed between 1.5 and 5 cm thick, a base holds a groove at 3 cm or
   * more, both at least 0.3 m long and rigid (flexibility at most 3). */
  woodDensity: 900,
  slenderness: 25,
  gripMin: 0.015,
  gripMax: 0.05,
  baseMin: 0.03,
  lengthMin: 0.3,
  rigid: 3,
} as const;
/** Noncombustible covering materials that close the bed to air: granular sand and plastic clay. */
export const SMALL_FIRE_COVERS = ['sand', 'clay'] as const;
export const SMALL_FIRE_COVER_MASS = v7RoundNumber(
  Math.PI *
    SMALL_FIRE.bedRadius ** 2 *
    SMALL_FIRE.coverDepth *
    SMALL_FIRE.coverDensity,
);
/** Loose items and combustible stock within this distance of the bed centre are exposed. */
export const SMALL_FIRE_EXPOSURE = SMALL_FIRE.bedRadius + SMALL_FIRE.rim;

export interface SmallFireLot extends V7Data {
  item: string;
  resource: string;
  origin: string;
  role: string;
  quantity: number;
  unitSolids: number;
  unitWater: number;
  /** Fuel units per unit (the resource's fuel value); one unit releases 2 MJ when dry. */
  energy: number;
  joinedAt: number;
}
export interface SmallFireCover extends V7Data {
  item: string;
  resource: string;
  origin: string;
  quantity: number;
  mass: number;
  water: number;
}
/** Mass ledger (kg). In: fuel laid (with brands carried in), caught, rain water and burned ember
 * dust. Out: remaining lots, burned solids (10% ash, 90% exhaust), water leaving as vapour and
 * brands carried to another bed. Unburned friction dust, the cover and the cover water boiled off
 * are kept apart. */
export interface SmallFireLedger extends V7Data {
  laid: number;
  caught: number;
  rain: number;
  ember: number;
  brands: number;
  burned: number;
  ash: number;
  exhaust: number;
  vapour: number;
  dust: number;
  cover: number;
  coverVapour: number;
}
/** Heat ledger (J). Released heat = vapour + delivered into the bed + received by people + lost
 * directly to the surroundings (including unreceived near-field heat) + this round's open
 * near-field share. The bed's stored heat leaves as bed loss, probe draws and boiling cover water. */
export interface SmallFireHeat extends V7Data {
  released: number;
  vapour: number;
  bed: number;
  actors: number;
  environment: number;
  loss: number;
  probes: number;
  cover: number;
}
export interface SmallFire extends V7Data {
  version: number;
  builder: string;
  laidAt: number;
  lit: boolean;
  litAt: number | null;
  embers: number;
  burnFraction: number;
  covered: boolean;
  coveredAt: number | null;
  covers: SmallFireCover[];
  lots: SmallFireLot[];
  /** Bed temperature (C), and the air temperature and wind at the bed this round. */
  bed: number;
  air: number;
  wind: number;
  rain: number;
  /** This round's near-field heat not yet received (J), and the heat offered to probes (MJ). */
  pool: number;
  offered: number;
  ledger: SmallFireLedger;
  heat: SmallFireHeat;
  ignitions: number;
  failures: number;
  inspections: V7Data[];
  verifiedCold: number | null;
  flameOutAt: number | null;
  lastTick: number;
  log: V7Data[];
}

const round = (x: number) => v7RoundNumber(x);
const clamp = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));
const resource = (w: V7World, id: string) =>
  w.resources.find((r) => r.id === id);

export const isSmallFire = (o: V7Object) =>
  o.kind === SMALL_FIRE_KIND &&
  o.revision === SMALL_FIRE_REVISION &&
  !!o.data.fire &&
  typeof o.data.fire === 'object' &&
  !Array.isArray(o.data.fire);
export const smallFireOf = (o: V7Object) => o.data.fire as SmallFire;
export const smallFireLotMass = (l: SmallFireLot) =>
  l.quantity * (l.unitSolids + l.unitWater);
export const smallFireLotWater = (l: SmallFireLot) =>
  l.unitSolids + l.unitWater > 0
    ? l.unitWater / (l.unitSolids + l.unitWater)
    : 0;
export const smallFireFuelMass = (f: SmallFire) =>
  f.lots.reduce((n, l) => n + smallFireLotMass(l), 0);
export const smallFireCapacity = (f: SmallFire) =>
  SMALL_FIRE.bedCapacity +
  f.covers.reduce((n, c) => n + c.mass * SMALL_FIRE.coverHeat, 0);
export function smallFireWeather(w: V7World, p: V7Point) {
  const c = forestClimate(w, p);
  return { temperature: c.temperature, rain: c.rain ?? 0, wind: c.wind ?? 0 };
}

/** An inedible material with a represented fuel value. */
export function smallFireCombustible(w: V7World, id: string): boolean {
  const r = resource(w, id);
  return !!r && r.nutrition === 0 && (r.properties?.fuel ?? 0) > 0;
}
/** Fine fibrous fuel that takes an ember: combustible, at most 0.3 kg a unit, flexibility 5+
 * (dry grass, bark, moss, reed). */
export function smallFireTinder(w: V7World, id: string): boolean {
  const r = resource(w, id);
  return (
    smallFireCombustible(w, id) &&
    !!r &&
    r.mass <= 0.3 &&
    (r.properties?.flexibility ?? 0) >= 5
  );
}

/** Friction wear recorded on a returned piece: role, groove depth (mm) and worn mass per unit (kg). */
export function smallFireWear(s: V7Stack): V7Data | null {
  const v = s.processing?.smallFireFriction;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}
/** Represented unit composition (kg): an explicit composition where one exists, else the
 * material's mass at its represented water share, less worn friction mass. */
export function smallFireComposition(w: V7World, s: V7Stack) {
  const r = resource(w, s.resource);
  const mass = s.physical?.unitMass ?? r?.mass ?? 0;
  const water = s.physical
    ? s.physical.unitWater
    : mass * clamp(r?.properties?.moisture ?? 0, 0, SMALL_FIRE.maxWater);
  // Wear is recorded per unit: pieces are worked as whole units and splits keep the per-unit loss.
  const worn = Number(smallFireWear(s)?.worn ?? 0);
  const keep = mass > 0 ? Math.max(0, (mass - worn) / mass) : 0;
  return {
    unitMass: round(mass * keep),
    unitWater: round(water * keep),
    unitSolids: round((mass - water) * keep),
    basis: s.physical ? 'represented composition' : 'material water share',
  };
}
export const smallFireWaterShare = (w: V7World, s: V7Stack) => {
  const c = smallFireComposition(w, s);
  return c.unitMass > 0 ? round(c.unitWater / c.unitMass) : 0;
};

/** Declared v1 rod geometry of one whole unit of a piece (m). */
export function smallFireRod(w: V7World, s: V7Stack) {
  const volume = smallFireComposition(w, s).unitMass / SMALL_FIRE.woodDensity;
  const diameter = Math.cbrt((4 * volume) / (Math.PI * SMALL_FIRE.slenderness));
  return {
    diameter: round(diameter),
    length: round(diameter * SMALL_FIRE.slenderness),
  };
}

function note(f: SmallFire, tick: number, entry: V7Data) {
  f.log = [...f.log, { tick, ...entry }].slice(-12);
}
function event(
  w: V7World,
  o: V7Object,
  type: string,
  description: string,
  data: V7Data,
  actor: V7Actor | null = null,
) {
  forestEvent(
    w,
    type,
    description,
    actor?.position ?? { x: o.spatial.x, y: o.spatial.y },
    actor?.id ?? null,
    { source: o.id, tick: w.tick, ...data },
    o.id,
  );
  const e = w.events.at(-1);
  if (e) e.interface = SMALL_FIRE_ABILITY;
}

/** A combustible lot from a represented unit composition. */
export function smallFireLot(
  w: V7World,
  base: { item: string; resource: string; origin: string; role: string },
  quantity: number,
  unit: { unitSolids: number; unitWater: number },
): SmallFireLot {
  return {
    ...base,
    quantity: round(quantity),
    unitSolids: round(unit.unitSolids),
    unitWater: round(unit.unitWater),
    energy: resource(w, base.resource)?.properties?.fuel ?? 0,
    joinedAt: w.tick,
  };
}

/** Burns a quantity of fuel units from the bed, tinder first when asked (ignition flames). Returns
 * the heat released (J); solids leave as 10% ash and 90% exhaust, their water as vapour. */
export function smallFireConsume(
  f: SmallFire,
  units: number,
  tinderFirst: boolean,
): { joules: number; consumed: V7Data[]; vapourHeat: number } {
  let left = units,
    joules = 0,
    vapourHeat = 0;
  const consumed: V7Data[] = [];
  const order = tinderFirst
    ? [
        ...f.lots.filter((l) => l.role === 'tinder'),
        ...f.lots.filter((l) => l.role !== 'tinder'),
      ]
    : f.lots;
  for (const lot of order) {
    const energy =
      Math.min(left, lot.quantity * lot.energy) * (1 - smallFireLotWater(lot));
    if (energy <= 1e-9 || lot.energy <= 0) continue;
    const quantity = Math.min(lot.quantity, energy / lot.energy),
      solids = quantity * lot.unitSolids,
      water = quantity * lot.unitWater;
    lot.quantity = round(lot.quantity - quantity);
    left -= energy;
    f.ledger.burned = round(f.ledger.burned + solids);
    f.ledger.ash = round(f.ledger.ash + solids * BURN.ash);
    f.ledger.exhaust = round(f.ledger.exhaust + solids * (1 - BURN.ash));
    f.ledger.vapour = round(f.ledger.vapour + water);
    joules += energy * HEAT.fuelJoules;
    vapourHeat += water * (HEAT.latent + HEAT.waterHeat * (HEAT.boil - f.air));
    consumed.push({
      item: lot.item,
      resource: lot.resource,
      quantity: round(quantity),
      solids: round(solids),
      water: round(water),
    });
    if (left <= 1e-9) break;
  }
  f.lots = f.lots.filter((l) => l.quantity > 1e-8);
  return { joules, consumed, vapourHeat: Math.min(vapourHeat, joules) };
}

/** Exact relaxation of the bed over one round with `joules` delivered into it; the loss goes to the
 * surroundings ledger. */
function bedRound(f: SmallFire, joules: number) {
  const capacity = smallFireCapacity(f),
    k = (SMALL_FIRE.bedLoss * HEAT.roundSeconds) / capacity,
    decay = Math.exp(-k),
    power = joules / HEAT.roundSeconds;
  const before = f.bed - f.air,
    after = before * decay + (power / SMALL_FIRE.bedLoss) * (1 - decay);
  const loss = joules - capacity * (after - before);
  f.heat.bed = round(f.heat.bed + joules);
  f.heat.loss = round(f.heat.loss + loss);
  f.bed = round(f.air + after);
}

/** Heat stored in the bed above the air, offered to probe heat trials in reach (MJ). */
function offer(o: V7Object, f: SmallFire) {
  f.offered = round((smallFireCapacity(f) * Math.max(0, f.bed - f.air)) / 1e6);
  o.data.availableHeat = f.offered;
}

/** Exposed loose combustible items and standing combustible stock within the exposure radius. */
export function smallFireExposed(w: V7World, o: V7Object) {
  const centre = { x: o.spatial.x, y: o.spatial.y };
  return {
    items: w.stacks.filter(
      (s) =>
        s.owner === null &&
        !s.reservedFor &&
        smallFireCombustible(w, s.resource) &&
        v7Distance(s.position, centre) <= SMALL_FIRE_EXPOSURE + 1e-9,
    ),
    objects: w.objects.filter(
      (x) =>
        x.id !== o.id &&
        !isSmallFire(x) &&
        typeof x.data.resource === 'string' &&
        smallFireCombustible(w, x.data.resource) &&
        Number(x.data.stock ?? 0) >= 1 &&
        v7ShapeDistance(centre, x.spatial) <= SMALL_FIRE_EXPOSURE + 1e-9,
    ),
  };
}

/** One ordinary simulation round of a bed: probe draws, rain, dousing, catching of exposed fuel,
 * open-air combustion of present fuel, drying of burning fuel, heat allocation and bed cooling.
 * It runs every round whoever is present; nothing but fuel, air, rain or a cover ends it. */
export function smallFireRound(w: V7World, o: V7Object) {
  const f = smallFireOf(o);
  if (f.lastTick === w.tick) return;
  f.lastTick = w.tick;
  const c = smallFireWeather(w, o.spatial);
  f.air = round(c.temperature);
  f.wind = round(c.wind);
  f.rain = round(c.rain);
  // Unreceived near-field heat of the last round left to the surroundings.
  f.heat.environment = round(f.heat.environment + f.pool);
  f.pool = 0;
  // Probe heat trials drew 0.1 MJ each from the heat offered last round.
  const drawn = Math.max(0, f.offered - Number(o.data.availableHeat ?? 0));
  if (drawn > 0) {
    const joules = Math.min(
      drawn * 1e6,
      smallFireCapacity(f) * Math.max(0, f.bed - f.air),
    );
    f.bed = round(f.bed - joules / smallFireCapacity(f));
    f.heat.probes = round(f.heat.probes + joules);
    note(f, w.tick, { type: 'probe-draw', joules: round(joules) });
  }
  if (c.rain > 0 && !f.covered)
    for (const lot of f.lots) {
      const share = smallFireLotWater(lot),
        next = Math.min(SMALL_FIRE.maxWater, share + BURN.wetting * c.rain);
      if (next <= share) continue;
      const unitWater = (lot.unitSolids * next) / (1 - next);
      f.ledger.rain = round(
        f.ledger.rain + lot.quantity * (unitWater - lot.unitWater),
      );
      lot.unitWater = round(unitWater);
    }
  f.burnFraction = 0;
  if (f.lit && c.rain > BURN.rainOut) {
    f.lit = false;
    f.embers = 0;
    f.flameOutAt = w.tick;
    note(f, w.tick, { type: 'doused', rain: f.rain });
    event(
      w,
      o,
      'small-fire-doused',
      'Heavy rain put the small fire out; the bed keeps its stored heat as it cools.',
      {
        rain: f.rain,
        bedTemperature: f.bed,
      },
    );
  }
  let released = 0,
    vapourHeat = 0;
  if (f.lit && !f.covered) {
    const exposed = smallFireExposed(w, o);
    for (const s of exposed.items) {
      const unit = smallFireComposition(w, s);
      f.lots.push(
        smallFireLot(
          w,
          { item: s.id, resource: s.resource, origin: s.origin, role: 'fuel' },
          s.quantity,
          unit,
        ),
      );
      f.ledger.caught = round(f.ledger.caught + s.quantity * unit.unitMass);
    }
    if (exposed.items.length)
      w.stacks = w.stacks.filter((s) => !exposed.items.includes(s));
    for (const x of exposed.objects) {
      const r = resource(
        w,
        typeof x.data.resource === 'string' ? x.data.resource : '',
      );
      if (!r) continue;
      const water =
        r.mass * clamp(r.properties?.moisture ?? 0, 0, SMALL_FIRE.maxWater);
      x.data.stock = Number(x.data.stock) - 1;
      f.lots.push(
        smallFireLot(
          w,
          { item: `${x.id}:stock`, resource: r.id, origin: x.id, role: 'fuel' },
          1,
          { unitSolids: r.mass - water, unitWater: water },
        ),
      );
      f.ledger.caught = round(f.ledger.caught + r.mass);
    }
    if (exposed.items.length || exposed.objects.length) {
      note(f, w.tick, {
        type: 'caught',
        items: exposed.items.map((s) => s.id),
        objects: exposed.objects.map((x) => x.id),
      });
      event(
        w,
        o,
        'small-fire-spread',
        'Exposed combustible material within 0.45 m of the burning bed caught fire and joined it.',
        {
          items: exposed.items.map((s) => s.id),
          objects: exposed.objects.map((x) => x.id),
          radius: SMALL_FIRE_EXPOSURE,
        },
      );
    }
    const burn = smallFireConsume(f, BURN.perRound, true);
    released = burn.joules;
    vapourHeat = burn.vapourHeat;
    f.burnFraction = round(burn.joules / HEAT.fuelJoules);
    // Burning fuel dries by 0.08 water share a round, paid from the released heat.
    let budget = Math.max(0, released - vapourHeat);
    const perKg = HEAT.latent + HEAT.waterHeat * (HEAT.boil - f.air);
    for (const lot of f.lots) {
      const share = smallFireLotWater(lot);
      if (share <= 0 || budget <= 0) continue;
      const next = Math.max(0, share - BURN.litDrying),
        unitWater = next > 0 ? (lot.unitSolids * next) / (1 - next) : 0;
      const water = Math.min(
        lot.quantity * (lot.unitWater - unitWater),
        budget / perKg,
      );
      if (water <= 0) continue;
      lot.unitWater = round(lot.unitWater - water / lot.quantity);
      f.ledger.vapour = round(f.ledger.vapour + water);
      vapourHeat += water * perKg;
      budget -= water * perKg;
    }
    f.embers = f.burnFraction > 0 ? BURN.embers : Math.max(0, f.embers - 1);
    if (burn.consumed.length)
      event(
        w,
        o,
        'small-fire-burned',
        'The small fire burned present fuel: 10% of the burned solids stays as ash, the rest leaves as exhaust and the water as vapour.',
        {
          consumed: burn.consumed,
          burnFraction: f.burnFraction,
          releasedJoules: round(released),
          remainingFuelMass: round(smallFireFuelMass(f)),
          ash: f.ledger.ash,
        },
      );
    if (!f.embers) {
      f.lit = false;
      f.flameOutAt = w.tick;
      note(f, w.tick, { type: 'flame-out' });
      event(
        w,
        o,
        'small-fire-flame-out',
        'No fuel burned for three rounds: the flames and embers died. The bed keeps its stored heat as it cools.',
        {
          bedTemperature: f.bed,
          remainingFuelMass: round(smallFireFuelMass(f)),
        },
      );
    }
  }
  f.heat.released = round(f.heat.released + released);
  f.heat.vapour = round(f.heat.vapour + vapourHeat);
  const rest = Math.max(0, released - vapourHeat);
  f.pool = round(rest * SMALL_FIRE.nearShare);
  f.heat.environment = round(
    f.heat.environment +
      rest * (1 - SMALL_FIRE.bedShare - SMALL_FIRE.nearShare),
  );
  bedRound(f, rest * SMALL_FIRE.bedShare);
  offer(o, f);
}

/** Smothering closes the bed to air. The cover, laid at air temperature, shares the bed's stored
 * heat (the heat stays in the covered bed); water in the cover boils off above 100 C. */
export function smallFireCover(f: SmallFire, covers: SmallFireCover[]) {
  const heat = smallFireCapacity(f) * (f.bed - f.air);
  f.covers.push(...covers);
  const capacity = smallFireCapacity(f);
  f.bed = round(f.air + heat / capacity);
  for (const c of covers) {
    if (f.bed <= HEAT.boil || c.water <= 0) continue;
    const water = Math.min(
      c.water,
      (capacity * (f.bed - HEAT.boil)) / HEAT.latent,
    );
    c.water = round(c.water - water);
    f.bed = round(f.bed - (water * HEAT.latent) / capacity);
    f.ledger.coverVapour = round(f.ledger.coverVapour + water);
    f.heat.cover = round(f.heat.cover + water * HEAT.latent);
  }
  f.ledger.cover = round(
    f.ledger.cover + covers.reduce((n, c) => n + c.mass, 0),
  );
  f.covered = true;
  f.lit = false;
  f.embers = 0;
  f.burnFraction = 0;
}

/** The source's stored bed heat offered to probes after a direct change. */
export function smallFireOffer(o: V7Object) {
  offer(o, smallFireOf(o));
}

/** Burning, uncovered sources this round. */
function burning(w: V7World) {
  return w.objects.filter((o) => {
    if (!isSmallFire(o)) return false;
    const f = smallFireOf(o);
    return f.lastTick === w.tick && f.burnFraction > 0 && !f.covered;
  });
}

/** Heat a body actually receives from burning beds before thermal damage: the local-fire@1 warmth
 * law along a clear line, limited to each bed's near-field share so nothing is counted twice. */
export function smallFireExposure(
  w: V7World,
  a: V7Actor,
  temperature: number,
): number {
  if (!w.revisions.includes(SMALL_FIRE_REVISION)) return temperature;
  let total = 0;
  for (const o of burning(w)) {
    const f = smallFireOf(o),
      centre = { x: o.spatial.x, y: o.spatial.y },
      d = v7Distance(a.position, centre);
    if (d >= SMALL_FIRE.warmthRange) continue;
    if (!v7SegmentClear(a.position, centre, 0, v7Obstacles(w))) continue;
    const raw =
      SMALL_FIRE.warmth *
      f.burnFraction *
      Math.max(0, 1 - d / SMALL_FIRE.warmthRange) *
      (1 - 0.5 * f.wind);
    const gain = round(Math.max(0, Math.min(raw, f.pool / SMALL_FIRE.body)));
    if (gain <= 0) continue;
    f.pool = round(f.pool - gain * SMALL_FIRE.body);
    f.heat.actors = round(f.heat.actors + gain * SMALL_FIRE.body);
    total += gain;
    event(
      w,
      o,
      'small-fire-heat-received',
      `Heat from the burning bed reached this person at ${d.toFixed(2)} m before thermal damage: +${gain.toFixed(3)} degrees.`,
      {
        distance: round(d),
        gain,
        raw: round(raw),
        burnFraction: f.burnFraction,
        wind: f.wind,
        limited: gain < round(raw),
      },
      a,
    );
  }
  return total ? round(temperature + total) : temperature;
}

/** A body standing on a burning bed is burned (after the ordinary thermal damage rule). */
export function smallFireBurn(w: V7World, a: V7Actor) {
  if (!w.revisions.includes(SMALL_FIRE_REVISION) || a.vitals.health <= 0)
    return;
  for (const o of burning(w)) {
    const f = smallFireOf(o),
      d = v7Distance(a.position, o.spatial);
    if (d >= SMALL_FIRE.bedRadius + a.radius) continue;
    const loss = round(SMALL_FIRE.contactBurn * f.burnFraction);
    const before = a.vitals.health;
    a.vitals.health = round(Math.max(0, before - loss));
    event(
      w,
      o,
      'small-fire-actor-burned',
      `Standing on the burning bed burned this person: ${String(round(before - a.vitals.health))} health lost.`,
      {
        distance: round(d),
        loss: round(before - a.vitals.health),
        burnFraction: f.burnFraction,
      },
      a,
    );
  }
}
