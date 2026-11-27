import type { V7Data, V7Point, V7World } from './continuous-types.js';
import { v7RoundNumber } from './continuous-data.js';
import { forestClimate } from './forest-climate.js';
import { BURN, DRILL, HEAT } from './long-thermal-physics.js';
import { SMALL_FIRE } from './long-ex21-small-combustion-physics.js';

/** ex25 friction-heating-trial@1: the declared version-1 values of hand rubbing between two wood
 * pieces, the heating and cooling of their contact and the smouldering of an ember of the worn
 * dust. They are modeling assumptions of this operation, not discovered facts, and they change no
 * other rule of the simulation. The energy conversion, thermal round, wear rate, contact law,
 * smoke, ember and rain limits and the contact-burn law are reused from ex17, local-fire@1 and
 * small-combustion-source@1 (long-thermal-physics.ts and long-ex21-small-combustion-physics.ts). */

const SIGMA = 5.670374419e-8;
const KELVIN = 273.15;

export const FRICTION_HEAT = {
  version: 1,
  /** World Agent specification: the paid effort of one rubbing round. */
  rubEnergy: 0.8,
  /** small-combustion-source@1: one energy unit is at most 21.6 kJ of hand work. */
  workPerEnergy: SMALL_FIRE.workPerEnergy,
  /** Bounded two-handed effort: press force (N), wood-on-wood friction coefficient, the longest
   * stroke (m) and the share of the base length a stroke may use, and cycles per second (each
   * cycle is two strokes). A full 0.25 m stroke gives 1 m/s and ex17's 20 W hand friction. */
  force: 50,
  friction: 0.4,
  strokeMax: 0.25,
  strokeShare: 0.5,
  rate: 2,
  /** ex17 thermal time: one round is 1080 s, integrated in 10 s steps. */
  roundSeconds: HEAT.roundSeconds,
  step: 10,
  /** The hot spot under the rubbing end: heat capacity (J/K, its wood layer, water and dust),
   * exposed area (m2), conduction into each piece's zone (W/K) and emissivity. Convection uses
   * ex17's still-air coefficient raised by wind as ex17 dust cooling is. */
  spotCapacity: 6,
  spotArea: 0.0004,
  conduction: 0.012,
  emissivity: 0.9,
  airContact: HEAT.airContact,
  windLoss: DRILL.windLoss,
  /** ex17 contact law: the share of friction heat released in the hot spot is 0.5 plus the track
   * depth over 3 mm, at most 1; the rest heats the two zones equally. */
  contactBase: 0.5,
  contactDepth: DRILL.socketFull,
  /** The zone of each piece beside the contact (kg of that piece) and its exposed area (m2). */
  zoneMass: 0.05,
  zoneArea: 0.01,
  /** Water the wood draws to the hot spot (kg/s per unit of the pieces' mean water share), up to
   * the water its 4 g wood layer and dust hold at that share; it evaporates above 100 C. */
  supply: 0.000019,
  layer: 0.004,
  /** ex17 wear: 2 g of wood per 21.6 kJ of friction work, split inversely by hardness; worn
   * solids collect as dust; the base track is 1 cm wide in 900 kg/m3 wood along the stroke; a
   * track half the base thickness deep leaves no supported contact. */
  wear:
    (DRILL.boardWear + DRILL.spindleWear) / (DRILL.power * HEAT.roundSeconds),
  trackWidth: 0.01,
  density: SMALL_FIRE.woodDensity,
  wornThrough: 0.5,
  /** ex17: smoke from a 200 C contact; 2 g of dust at 350 C forms an ember; local-fire@1: rain
   * above 0.15 wets it. */
  smoke: DRILL.smoke,
  ember: DRILL.ember,
  emberDust: DRILL.dust,
  rain: BURN.rain,
  /** Ember of dry wood dust: heat of combustion (J/kg), still-air burn time constant (s, divided
   * by 1 + wind), local-fire's 10% ash, area (m2), conduction into the ground (W/K), heat
   * capacity (J/kg/K), the glow it needs to sustain itself (C), the burned-out mass (kg) and its
   * footprint radius (m). */
  emberHeat: 18_000_000,
  emberSeconds: 600,
  ash: BURN.ash,
  emberArea: 0.0015,
  emberGround: 0.01,
  emberCapacity: 1000,
  emberOut: 300,
  emberMin: 0.00005,
  emberRadius: 0.03,
  /** small-combustion-source@1 contact burn: 5 health per 2 MJ released under a body. */
  contactBurn: SMALL_FIRE.contactBurn,
  burnJoules: HEAT.fuelJoules,
} as const;

/** Thermal and dust state of one contact; temperatures in C, masses in kg, depth in mm. */
export interface FrictionThermal extends V7Data {
  air: number;
  spot: number;
  rubbing: number;
  base: number;
  pool: number;
  dust: number;
  depth: number;
  peak: number;
  tick: number;
}
/** One piece as the contact model sees it: its water share and water (kg) and hardness. */
export interface FrictionPiece {
  share: number;
  water: number;
  hardness: number;
}
export interface FrictionWindow {
  air: number;
  wind: number;
  rain: number;
  /** Stroke (m); 0 when the pieces are not in contact. */
  stroke: number;
  /** Seconds of rubbing from the start of the window; the rest only cools. */
  rubSeconds: number;
  seconds: number;
  rubbing: FrictionPiece;
  base: FrictionPiece;
  /** Water reaches the hot spot only while the pieces are rubbed together. */
  supply: boolean;
}
/** What one window did: joules, kilograms and the ember second, if any. */
export interface FrictionResult extends V7Data {
  seconds: number;
  rubbed: number;
  power: number;
  work: number;
  spotHeat: number;
  zoneHeat: number;
  convection: number;
  radiation: number;
  zoneLoss: number;
  evaporation: number;
  stored: number;
  emberHeat: number;
  wornRubbing: number;
  wornBase: number;
  dustRubbing: number;
  dustBase: number;
  wornWaterRubbing: number;
  wornWaterBase: number;
  drawnRubbing: number;
  drawnBase: number;
  vapour: number;
  peak: number;
  smoke: boolean;
  emberAt: number | null;
  emberDust: number;
  emberTemperature: number;
}

const round = (x: number) => v7RoundNumber(x);
const radiation = (area: number, t: number, air: number) =>
  FRICTION_HEAT.emissivity *
  SIGMA *
  area *
  ((t + KELVIN) ** 4 - (air + KELVIN) ** 4);

/** Speed (m/s) and friction power (W) of a stroke; friction work never exceeds the paid input. */
export function frictionPower(stroke: number) {
  const speed = 2 * stroke * FRICTION_HEAT.rate;
  const power = FRICTION_HEAT.friction * FRICTION_HEAT.force * speed;
  const input = FRICTION_HEAT.rubEnergy * FRICTION_HEAT.workPerEnergy;
  return {
    force: FRICTION_HEAT.force,
    friction: FRICTION_HEAT.friction,
    stroke: round(stroke),
    speed: round(speed),
    power: round(power),
    input,
    seconds:
      power > 0
        ? round(Math.min(FRICTION_HEAT.roundSeconds, input / power))
        : 0,
  };
}
/** The stroke a base of this length supports (m). */
export const frictionStroke = (length: number) =>
  round(Math.min(FRICTION_HEAT.strokeMax, length * FRICTION_HEAT.strokeShare));

export function frictionThermal(air: number, tick: number): FrictionThermal {
  return {
    air: round(air),
    spot: round(air),
    rubbing: round(air),
    base: round(air),
    pool: 0,
    dust: 0,
    depth: 0,
    peak: round(air),
    tick,
  };
}
const zoneCapacity = (share: number) =>
  FRICTION_HEAT.zoneMass *
  (HEAT.solidHeat * (1 - share) + HEAT.waterHeat * share);

/** Integrates one window of the contact in 10 s steps: friction heat split between the hot spot
 * and the two zones, conduction from the spot into the zones, convection and radiation from the
 * spot, convection from the zones, water drawn from the wood and evaporated above 100 C, wear
 * debited from both pieces and collected as dust. The first step whose dust is 2 g or more at
 * 350 C or more while rubbing, with rain of 0.15 or less, forms an ember: rubbing stops, the dust
 * leaves with its heat and the rest of the window only cools. Every joule and kilogram is booked:
 * work = stored + convection + radiation + zone loss + evaporation + ember heat. */
export function frictionWindow(
  t: FrictionThermal,
  i: FrictionWindow,
): FrictionResult {
  const { power } = frictionPower(i.stroke);
  const h = FRICTION_HEAT.airContact * (1 + FRICTION_HEAT.windLoss * i.wind);
  const spotAir = h * FRICTION_HEAT.spotArea,
    zoneAir = h * FRICTION_HEAT.zoneArea,
    g = FRICTION_HEAT.conduction;
  const cs = FRICTION_HEAT.spotCapacity,
    cr = zoneCapacity(i.rubbing.share),
    cb = zoneCapacity(i.base.share);
  const latent = HEAT.latent + HEAT.waterHeat * (HEAT.boil - i.air);
  const share = (i.rubbing.share + i.base.share) / 2;
  const before = cs * t.spot + cr * t.rubbing + cb * t.base;
  const softR = 1 / Math.max(1, i.rubbing.hardness),
    softB = 1 / Math.max(1, i.base.hardness);
  let waterR = i.rubbing.water,
    waterB = i.base.water,
    rubUntil = i.rubSeconds;
  const r: FrictionResult = {
    seconds: i.seconds,
    rubbed: 0,
    power,
    work: 0,
    spotHeat: 0,
    zoneHeat: 0,
    convection: 0,
    radiation: 0,
    zoneLoss: 0,
    evaporation: 0,
    stored: 0,
    emberHeat: 0,
    wornRubbing: 0,
    wornBase: 0,
    dustRubbing: 0,
    dustBase: 0,
    wornWaterRubbing: 0,
    wornWaterBase: 0,
    drawnRubbing: 0,
    drawnBase: 0,
    vapour: 0,
    peak: t.spot,
    smoke: false,
    emberAt: null,
    emberDust: 0,
    emberTemperature: 0,
  };
  for (let s = 0; s < i.seconds - 1e-9; s += FRICTION_HEAT.step) {
    const dt = Math.min(FRICTION_HEAT.step, i.seconds - s);
    const rubbing = Math.max(0, Math.min(dt, rubUntil - s));
    const q = Math.min(
      1,
      FRICTION_HEAT.contactBase + t.depth / FRICTION_HEAT.contactDepth,
    );
    const work = power * rubbing;
    if (work > 0) {
      const worn = FRICTION_HEAT.wear * work,
        wornR = (worn * softR) / (softR + softB),
        wornB = worn - wornR;
      const wetR = Math.min(waterR, wornR * i.rubbing.share),
        wetB = Math.min(waterB, wornB * i.base.share);
      waterR -= wetR;
      waterB -= wetB;
      r.wornRubbing += wornR;
      r.wornBase += wornB;
      r.wornWaterRubbing += wetR;
      r.wornWaterBase += wetB;
      r.dustRubbing += wornR - wetR;
      r.dustBase += wornB - wetB;
      t.dust += wornR - wetR + wornB - wetB;
      t.pool += wetR + wetB;
      t.depth +=
        (wornB /
          (FRICTION_HEAT.density * FRICTION_HEAT.trackWidth * i.stroke)) *
        1000;
      r.rubbed += rubbing;
      r.work += work;
    }
    if (i.supply && rubbing > 0 && share > 0 && share < 1) {
      const cap = ((FRICTION_HEAT.layer + t.dust) * share) / (1 - share);
      const want = Math.min(
        FRICTION_HEAT.supply * share * dt,
        Math.max(0, cap - t.pool),
        waterR + waterB,
      );
      if (want > 0) {
        const fromR = Math.min(
          waterR,
          (want * i.rubbing.share) / (i.rubbing.share + i.base.share),
        );
        const fromB = Math.min(waterB, want - fromR);
        waterR -= fromR;
        waterB -= fromB;
        r.drawnRubbing += fromR;
        r.drawnBase += fromB;
        t.pool += fromR + fromB;
      }
    }
    const toR = g * (t.spot - t.rubbing),
      toB = g * (t.spot - t.base),
      conv = spotAir * (t.spot - i.air),
      rad = radiation(FRICTION_HEAT.spotArea, t.spot, i.air);
    const lossR = zoneAir * (t.rubbing - i.air),
      lossB = zoneAir * (t.base - i.air);
    let spot = t.spot + (q * work - (toR + toB + conv + rad) * dt) / cs;
    if (spot > HEAT.boil && t.pool > 0) {
      const vapour = Math.min(t.pool, (cs * (spot - HEAT.boil)) / latent);
      spot -= (vapour * latent) / cs;
      t.pool -= vapour;
      r.vapour += vapour;
      r.evaporation += vapour * latent;
    }
    t.rubbing += (((1 - q) * work) / 2 + (toR - lossR) * dt) / cr;
    t.base += (((1 - q) * work) / 2 + (toB - lossB) * dt) / cb;
    t.spot = spot;
    r.spotHeat += q * work;
    r.zoneHeat += (1 - q) * work;
    r.convection += conv * dt;
    r.radiation += rad * dt;
    r.zoneLoss += (lossR + lossB) * dt;
    r.peak = Math.max(r.peak, t.spot);
    if (rubbing > 0 && t.spot >= FRICTION_HEAT.smoke && t.dust > 0)
      r.smoke = true;
    if (
      rubbing > 0 &&
      r.emberAt === null &&
      t.spot >= FRICTION_HEAT.ember &&
      t.dust >= FRICTION_HEAT.emberDust - 1e-12 &&
      i.rain <= FRICTION_HEAT.rain
    ) {
      // The glowing dust leaves the spot with its own heat; rubbing stops.
      const heat = Math.min(
        FRICTION_HEAT.emberCapacity * t.dust * (t.spot - i.air),
        cs * (t.spot - i.air),
      );
      r.emberAt = round(s + rubbing);
      r.emberDust = t.dust;
      r.emberTemperature = round(t.spot);
      r.emberHeat = heat;
      t.spot -= heat / cs;
      t.dust = 0;
      rubUntil = s + rubbing;
    }
  }
  r.stored = cs * t.spot + cr * t.rubbing + cb * t.base - before;
  t.air = round(i.air);
  t.spot = round(t.spot);
  t.rubbing = round(t.rubbing);
  t.base = round(t.base);
  t.pool = round(Math.max(0, t.pool));
  t.dust = round(t.dust);
  t.depth = round(t.depth);
  t.peak = round(Math.max(t.peak, r.peak));
  for (const k of Object.keys(r) as (keyof FrictionResult)[]) {
    const v = r[k];
    if (typeof v === 'number') (r as V7Data)[k] = round(v);
  }
  return r;
}

/** Ember state; masses in kg, temperatures in C, heat in J. */
export interface FrictionEmber extends V7Data {
  version: number;
  mass: number;
  initialMass: number;
  ash: number;
  exhaust: number;
  temperature: number;
  air: number;
  wind: number;
  rain: number;
  glowing: boolean;
  status: string;
  reason: string | null;
  released: number;
  convection: number;
  radiation: number;
  ground: number;
  drawn: number;
  stored: number;
  power: number;
  lastReleased: number;
  formedAt: number;
  formedSecond: number;
  outAt: number | null;
  lastTick: number;
}
/** A new ember of the given dust (kg) carrying the heat (J) it took from the hot spot. */
export function frictionEmber(
  dust: number,
  heat: number,
  air: number,
  tick: number,
  second: number,
): FrictionEmber {
  return {
    version: 1,
    mass: round(dust),
    initialMass: round(dust),
    ash: 0,
    exhaust: 0,
    temperature: round(air + heat / (FRICTION_HEAT.emberCapacity * dust)),
    air: round(air),
    wind: 0,
    rain: 0,
    glowing: true,
    status: 'glowing',
    reason: null,
    released: 0,
    convection: 0,
    radiation: 0,
    ground: 0,
    drawn: 0,
    stored: round(heat),
    power: 0,
    lastReleased: 0,
    formedAt: tick,
    formedSecond: second,
    outAt: null,
    lastTick: -1,
  };
}
const emberCapacity = (e: FrictionEmber) =>
  FRICTION_HEAT.emberCapacity * Math.max(1e-6, e.mass + e.ash);

/** One window of the ember in 10 s implicit steps: it burns a share dt / tau of its dust while
 * glowing, releasing 18 MJ/kg (10% ash), and loses heat by convection, radiation and conduction
 * into the ground. It stops glowing when it cools below 300 C, burns out or rain above 0.15
 * reaches it; then it only cools. No heat is released without dust. released = stored change +
 * convection + radiation + ground. */
export function frictionEmberWindow(
  e: FrictionEmber,
  air: number,
  wind: number,
  rain: number,
  seconds: number,
  tick: number,
): { released: number; out: boolean } {
  const h = FRICTION_HEAT.airContact * (1 + FRICTION_HEAT.windLoss * wind);
  const linear = h * FRICTION_HEAT.emberArea + FRICTION_HEAT.emberGround;
  let stored = emberCapacity(e) * (e.temperature - air),
    released = 0,
    out = false;
  const stop = (why: string) => {
    e.glowing = false;
    e.status = 'out';
    e.reason = why;
    e.outAt = tick;
    out = true;
  };
  if (e.glowing && rain > FRICTION_HEAT.rain)
    stop('rain reached it and put the glow out');
  for (let s = 0; s < seconds - 1e-9; s += FRICTION_HEAT.step) {
    const dt = Math.min(FRICTION_HEAT.step, seconds - s);
    let heat = 0;
    if (e.glowing) {
      const tau = FRICTION_HEAT.emberSeconds / (1 + wind);
      const burned = Math.min(e.mass, (e.mass * dt) / tau);
      e.mass -= burned;
      e.ash += burned * FRICTION_HEAT.ash;
      e.exhaust += burned * (1 - FRICTION_HEAT.ash);
      heat = burned * FRICTION_HEAT.emberHeat;
    }
    const c = emberCapacity(e);
    // Backward Euler: c (T - air) + loss(T) dt = stored + heat, monotone in T.
    let lo = Math.min(air, e.temperature) - 1,
      hi = Math.max(air, e.temperature) + (Math.abs(stored) + heat) / c + 1;
    for (let n = 0; n < 80; n++) {
      const mid = (lo + hi) / 2;
      const f =
        c * (mid - air) +
        (linear * (mid - air) + radiation(FRICTION_HEAT.emberArea, mid, air)) *
          dt -
        stored -
        heat;
      if (f > 0) hi = mid;
      else lo = mid;
    }
    const temperature = (lo + hi) / 2;
    e.convection += h * FRICTION_HEAT.emberArea * (temperature - air) * dt;
    e.ground += FRICTION_HEAT.emberGround * (temperature - air) * dt;
    e.radiation += radiation(FRICTION_HEAT.emberArea, temperature, air) * dt;
    stored = c * (temperature - air);
    e.temperature = temperature;
    released += heat;
    if (
      e.glowing &&
      (e.mass < FRICTION_HEAT.emberMin || temperature < FRICTION_HEAT.emberOut)
    )
      stop(
        e.mass < FRICTION_HEAT.emberMin
          ? 'its dust burned out'
          : 'it cooled below a self-sustaining glow',
      );
  }
  e.released = round(e.released + released);
  e.lastReleased = round(released);
  e.power = seconds > 0 ? round(released / seconds) : 0;
  e.mass = round(e.mass);
  e.ash = round(e.ash);
  e.exhaust = round(e.exhaust);
  e.temperature = round(e.temperature);
  e.stored = round(stored);
  e.air = round(air);
  e.wind = round(wind);
  e.rain = round(rain);
  e.convection = round(e.convection);
  e.radiation = round(e.radiation);
  e.ground = round(e.ground);
  e.lastTick = tick;
  return { released: round(released), out };
}

/** Air temperature, rain and wind at a point; a roof keeps rain off. */
export function frictionWeather(w: V7World, p: V7Point) {
  const c = forestClimate(w, p);
  return {
    temperature: c.temperature,
    rain: c.indoor ? 0 : (c.rain ?? 0),
    wind: c.wind ?? 0,
    indoor: c.indoor,
    light: c.indoor ? c.light : c.daylight,
  };
}
