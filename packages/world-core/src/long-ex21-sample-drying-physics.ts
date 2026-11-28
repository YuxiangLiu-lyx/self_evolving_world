import type { V7Data } from './continuous-types.js';
import { v7RoundNumber } from './continuous-data.js';
import { HEAT } from './long-thermal-physics.js';

/** ex21 compare-material-samples@1: declared values of the exposed-surface moisture transfer of
 * prepared food pieces. They are physical assumptions of this operation, not discovered facts,
 * and change no other rule of the simulation. Masses are kg (the world's mass units), lengths m,
 * areas m2, temperatures C, time s and heat J. */
export const SAMPLE_EXCHANGE = {
  /** One round: the 1080 s thermal round of ex17, one eightieth of the 80-round day. */
  roundSeconds: HEAT.roundSeconds,
  /** Water-rich food tissue (ex17) and the heat capacities of its water and dry matter. */
  density: HEAT.density,
  waterHeat: HEAT.waterHeat,
  solidHeat: HEAT.solidHeat,
  /** Latent heat of evaporation near 20 C. */
  latent: 2_450_000,
  /** The still-air face coefficient of ex17, raised by wind as ex17's dust loss is:
   * h = 10 x (1 + 0.5 x wind index) W/(m2 K). */
  airContact: HEAT.airContact,
  windGain: 0.5,
  /** Volumetric heat capacity of air, J/(m3 K): vapour transfer h / 1200 m/s by the heat and
   * mass transfer analogy (Lewis number 1). */
  airHeat: 1200,
  /** Gas constant of water vapour, J/(kg K). */
  vapourGas: 461.5,
  /** Effective moisture diffusivity of fresh plant tissue, m2/s: free water within
   * sqrt(D x round), about 0.33 mm under an exposed face, can reach that face in one round. */
  diffusivity: 1e-10,
  /** Rain uptake of the food water representation: 0.01 x rain index x footprint per round. */
  rainCapture: 0.01,
  /** Thickest slab a slice cut leaves: 5 mm, an assumed even cut with a hand-held stone edge. */
  slice: 0.005,
  /** The inherited single-layer footprint per food unit (ex19 and air-dry-food-trial@1). */
  footprintPerUnit: 0.04,
  /** Fixed bisection steps of the face heat balance, so every result is deterministic. */
  steps: 60,
} as const;

const round = (x: number) => v7RoundNumber(x);
const S = SAMPLE_EXCHANGE;

/** Saturation water vapour density over liquid water, kg/m3 (Magnus formula). */
export function saturationDensity(temperature: number): number {
  const pressure =
    611.2 * Math.exp((17.62 * temperature) / (243.12 + temperature));
  return pressure / (S.vapourGas * (temperature + 273.15));
}

/** Water fraction of total mass that stays bound at a given air humidity: the food water
 * representation's equilibrium 0.1 + 0.25 x humidity, between 0.1 and 0.35. */
export function equilibriumFraction(humidity: number): number {
  return Math.max(0.1, Math.min(0.35, 0.1 + 0.25 * humidity));
}

export type SampleForm = 'whole' | 'split' | 'slice';

/** Pieces of one prepared sample, from its mass. The uncut sample is taken as one compact piece,
 * a sphere of water-rich tissue (ex17's food shape) whose whole surface is skin. Split cuts it
 * through the centre into two halves; slice cuts it into equal slabs no thicker than 5 mm. Each
 * piece lies in one layer with one new cut face up, open to the air, and its larger face down;
 * the skin and the faces on the support exchange no water. */
export interface SampleGeometry extends V7Data {
  form: string;
  pieces: number;
  cutPlanes: number;
  diameter: number;
  thickness: number | null;
  /** New cut faces made, both sides of every cut. */
  cutArea: number;
  /** New cut faces lying face up. */
  exposed: number;
  /** Ground the pieces cover in one layer. */
  footprint: number;
}

export function sampleGeometry(form: SampleForm, mass: number): SampleGeometry {
  const volume = mass / S.density,
    r = Math.cbrt((3 * volume) / (4 * Math.PI));
  if (form === 'whole')
    return {
      form,
      pieces: 1,
      cutPlanes: 0,
      diameter: round(2 * r),
      thickness: null,
      cutArea: 0,
      exposed: 0,
      footprint: round(Math.PI * r * r),
    };
  const n = form === 'split' ? 2 : Math.max(2, Math.ceil((2 * r) / S.slice));
  const planes = Array.from({ length: n - 1 }, (_, k) => {
    const z = -r + ((k + 1) * 2 * r) / n;
    return Math.PI * (r * r - z * z);
  });
  const first = planes[0] ?? 0,
    lastPlane = planes.at(-1) ?? 0;
  let exposed = first + lastPlane,
    footprint = first + lastPlane;
  for (let j = 1; j < planes.length; j++) {
    const a = planes[j - 1] ?? 0,
      b = planes[j] ?? 0;
    exposed += Math.min(a, b);
    footprint += Math.max(a, b);
  }
  return {
    form,
    pieces: n,
    cutPlanes: n - 1,
    diameter: round(2 * r),
    thickness: form === 'slice' ? round((2 * r) / n) : null,
    cutArea: round(2 * planes.reduce((x, y) => x + y, 0)),
    exposed: round(exposed),
    footprint: round(footprint),
  };
}

/** One round of the pieces' state and weather. Wind and rain are the world's 0-1 indices. */
export interface SampleExchangeInput {
  water: number;
  solids: number;
  exposed: number;
  footprint: number;
  /** Temperature of the pieces at the start of the round. */
  temperature: number;
  air: number;
  humidity: number;
  wind: number;
  rain: number;
}

/** One round of exposed-surface exchange: positive `moved` is evaporation into the air, negative
 * is condensation onto colder faces; the heat balance of the pieces sets the face temperature. */
export interface SampleExchange extends V7Data {
  water: number;
  temperature: number;
  evaporated: number;
  condensed: number;
  received: number;
  bound: number;
  accessible: number;
  /** Latent heat taken up by evaporation (negative when condensing), J. */
  latent: number;
  /** Heat the air gave the exposed faces by convection (negative when it took heat), J. */
  sensible: number;
  /** Change of the pieces' own heat content, J. */
  stored: number;
  limit: string;
}

/** A bounded transfer: evaporation is h_m x exposed area x (saturation vapour density at the
 * face - air humidity x saturation density at the air temperature) over the round, limited by
 * the free water above the humidity equilibrium within the accessible depth; the face
 * temperature solves C (T - T0) = h A (T_air - T) dt - L x moved. Dry matter never changes; rain
 * on the footprint adds water. With no exposed face nothing evaporates (whole food). */
export function sampleExchange(i: SampleExchangeInput): SampleExchange {
  const dt = S.roundSeconds,
    bound =
      (i.solids * equilibriumFraction(i.humidity)) /
      (1 - equilibriumFraction(i.humidity)),
    free = Math.max(0, i.water - bound),
    volume = (i.water + i.solids) / S.density,
    depth = Math.sqrt(S.diffusivity * dt),
    accessible =
      volume > 0 ? free * Math.min(1, (i.exposed * depth) / volume) : 0,
    received = round(S.rainCapture * Math.max(0, i.rain) * i.footprint);
  if (!(i.exposed > 0))
    return {
      water: round(i.water + received),
      temperature: round(i.air),
      evaporated: 0,
      condensed: 0,
      received,
      bound: round(bound),
      accessible: 0,
      latent: 0,
      sensible: 0,
      stored: 0,
      limit: 'no exposed cut face',
    };
  const capacity = i.water * S.waterHeat + i.solids * S.solidHeat,
    h = S.airContact * (1 + S.windGain * Math.max(0, i.wind)),
    hm = h / S.airHeat,
    vapour = Math.max(0, Math.min(1, i.humidity)) * saturationDensity(i.air);
  const potential = (t: number) =>
    hm * i.exposed * (saturationDensity(t) - vapour) * dt;
  const moved = (t: number) => {
    const f = potential(t);
    return f > 0 ? Math.min(f, accessible) : f;
  };
  // Strictly increasing in T, negative at the lower and positive at the upper bound.
  const balance = (t: number) =>
    capacity * (t - i.temperature) -
    h * i.exposed * (i.air - t) * dt +
    S.latent * moved(t);
  let lo = Math.min(i.temperature, i.air) - 40,
    hi = Math.max(i.temperature, i.air) + 1;
  for (let k = 0; k < S.steps; k++) {
    const mid = (lo + hi) / 2;
    if (balance(mid) > 0) hi = mid;
    else lo = mid;
  }
  const t = (lo + hi) / 2,
    m = round(moved(t)),
    f = potential(t);
  return {
    water: round(i.water - m + received),
    temperature: round(t),
    evaporated: Math.max(0, m),
    condensed: Math.max(0, -m),
    received,
    bound: round(bound),
    accessible: round(accessible),
    latent: round(S.latent * m),
    sensible: round(h * i.exposed * (i.air - t) * dt),
    stored: round(capacity * (t - i.temperature)),
    limit:
      f > 0 && m >= round(accessible) - 1e-12
        ? 'accessible water'
        : m > 0
          ? 'vapour transfer and heat'
          : m < 0
            ? 'condensation'
            : 'none',
  };
}
