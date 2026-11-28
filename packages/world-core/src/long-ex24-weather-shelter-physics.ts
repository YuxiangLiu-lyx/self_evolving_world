import type {
  V7Actor,
  V7Data,
  V7Object,
  V7Point,
  V7Stack,
  V7World,
} from './continuous-types.js';
import { v7RoundNumber } from './continuous-data.js';
import { v7Local } from './continuous-geometry.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { openConditions } from './open-physical.js';
import {
  SMALL_FIRE,
  smallFireComposition,
  smallFireRod,
} from './long-ex21-small-combustion-physics.js';

/** ex24: geometry, material measures, coverage, occupancy and exposure of a hand-lashed, low
 * A-frame thatched weather shelter for one reclining person. The physiology hook is read by the
 * ordinary exposure chain (forest-environment) and returns its input unchanged unless this
 * revision is installed, so every other world keeps its exposure arithmetic. */
export const WEATHER_SHELTER_REVISION = 'construct-weather-shelter@1';
export const WEATHER_SHELTER_KIND = 'thatched-weather-shelter';
/** Declared version-1 recipe in metres. Local x runs across the floor, local y along the ridge;
 * the entrance is the open end at local -y and the rear end at +y is covered. */
export const WEATHER_SHELTER = {
  length: 1.6,
  width: 0.8,
  ridge: 0.6,
  /** Three A-frames 0.8 m apart along the ridge. */
  frames: [-0.8, 0, 0.8],
  /** Installed covering thickness. */
  thickness: 0.1,
  /** The floor plus the covering at both eaves and the rear, and the same margin at the open end. */
  outer: { width: 1, length: 1.8 },
  /** Clear approach in front of the open end, and working clearance around the outer footprint. */
  approach: 0.6,
  clearance: 0.3,
  rods: 20,
  /** Minimum rod diameter, read at the specification's 0.01 m precision. */
  diameter: 0.04,
  precision: 0.01,
  /** Lashing overlap of two rods meeting at the middle frame, and leg crossing above the ridge. */
  overlap: 0.2,
  crossing: 0.1,
  /** Specification minimum binding length (m) and covering and bedding volumes (m3). */
  cord: 30,
  thatch: 0.26,
  bedding: 0.1,
  /** Water share at or below which stems are dry: the world's air-dry stem resource (dry grass). */
  dry: 0.4,
  /** Solid volume share of installed stems: tied thatch and loose bedding. */
  packing: { thatch: 0.15, bedding: 0.1 },
  /** Design protection: at most 20% of incident rain reaches a covered occupant, wind exposure is
   * halved, and dry bedding halves the ground-contact share of the body's heat loss. */
  rainShield: 0.8,
  windShield: 0.5,
  groundShare: 0.25,
  beddingCut: 0.5,
  /** Design rating: rain up to 5 mm/h and wind up to 5 m/s. */
  rating: { rain: 5, wind: 5 },
  /** Below 0.75 a component shows measured gaps; below 0.5 it has loosened (ex15 rule). */
  sound: 0.75,
  loose: 0.5,
  /** Normalized joint and cover wear per round, doubled while rain or wind is present. */
  wear: 0.001,
} as const;
const G = WEATHER_SHELTER;
/** The food water representation's rain amount: index 1 brings 0.01 kg per m2 per round, and
 * a round lasts 1080 s (a day of 80 rounds read as 24 hours), so mm/h = index x 0.01 x 3600/1080. */
export const SHELTER_RAIN_KG = 0.01;
export const shelterRainMmPerHour = (rain: number) =>
  v7RoundNumber((rain * SHELTER_RAIN_KG * 3600) / 1080);
/** No wind speed is represented; the 0-1 wind index is read as 0-5 m/s (assumption). */
export const shelterWindMs = (wind: number) => v7RoundNumber(wind * 5);
/** The existing open-refuge convention: wind-driven rain arrives from world +x, slanting 0.25 x
 * wind per unit of fall. */
const SLANT = 0.25;
/** The representation's evaporation limit per m2 of exposed surface (open-preservation-physics). */
export const shelterDrying = (w: V7World, p: V7Point, area: number) =>
  0.025 *
  area *
  Math.max(0, Math.min(2, (forestClimate(w, p).temperature - 5) / 20));

/** Registered strand and stem laws (open-shelter-material.ts version 2, simple-shelter@1's 3 m
 * vine binding); no law exists for dry grass, so its stems stay unrepresented. */
const LAWS: Partial<
  Record<
    string,
    { length: number; density: number; strength: number; wet: number }
  >
> = {
  vine: { length: 3, density: 500, strength: 8e6, wet: 0.55 },
  reed: { length: 1.8, density: 500, strength: 8e6, wet: 0.55 },
};
/** Thin stems that lay into a covering (ex16 hand-weave-fiber-mat@1 stem set). */
const STEMS = ['dry-grass', 'reed'];
/** Wood units with the ex21 rod geometry (prepare-ventilated-food-storage@1's piece set). */
const WOODS = ['branch', 'willow', 'birch', 'oak'];
/** Binding needs flexibility 5 of 10 to wrap a rod (ex16 hand-twist-fiber-cord@1 bend limit). */
const BEND = 5;
/** Represented treatments that make a unit unusable as a plain part. */
const TREATED = [
  'mantle',
  'frictionKit',
  'waterCup',
  'componentLots',
  'materialLayer',
  'canopyDrying',
  'fuelMoisture',
] as const;
export const SHELTER_PART = 'weatherShelterPart';
const round = (x: number) => v7RoundNumber(x);

/** Measured properties of one unit of a stack: composition, geometry and strength. */
export function shelterMeasure(w: V7World, s: V7Stack) {
  const r = w.resources.find((x) => x.id === s.resource),
    c = smallFireComposition(w, s),
    share = c.unitMass > 0 ? round(c.unitWater / c.unitMass) : 0,
    law = LAWS[s.resource],
    flexibility = r?.properties?.flexibility ?? 0,
    part = s.processing?.[SHELTER_PART] as V7Data | undefined,
    condition = Number(part?.condition ?? 1),
    treated =
      TREATED.some((k) => s[k] !== undefined) ||
      Object.keys(s.processing ?? {}).some((k) => k !== SHELTER_PART);
  const rod = WOODS.includes(s.resource) ? smallFireRod(w, s) : null,
    area = law ? c.unitSolids / (law.density * law.length) : 0;
  return {
    resource: s.resource,
    origin: s.origin,
    unitMass: c.unitMass,
    waterShare: share,
    flexibility,
    condition,
    treated,
    rod: rod
      ? {
          ...rod,
          rigid: flexibility <= SMALL_FIRE.rigid,
          measured: round(Math.round(rod.diameter / G.precision) * G.precision),
        }
      : null,
    strand: law
      ? {
          length: law.length,
          diameter: round(Math.sqrt((4 * area) / Math.PI)),
          breaking: round(law.strength * (1 - law.wet * share) * area),
        }
      : null,
    stem:
      STEMS.includes(s.resource) && law
        ? {
            thatch: round(c.unitSolids / law.density / G.packing.thatch),
            bedding: round(c.unitSolids / law.density / G.packing.bedding),
          }
        : null,
  };
}
export type ShelterMeasure = ReturnType<typeof shelterMeasure>;

/** Why a unit cannot fill this role, from its records, or null. */
export function shelterUnsuitable(
  m: ShelterMeasure,
  role: string,
): string | null {
  if (m.treated)
    return 'worked or treated; only plain untreated units are used';
  if (m.condition < G.sound)
    return `a used part at condition ${String(round(m.condition))}`;
  if (role === 'rod') {
    if (!m.rod) return `${m.resource} is not a wood rod`;
    if (!m.rod.rigid)
      return `${m.resource} bends too easily (flexibility ${String(m.flexibility)}; at most ${String(SMALL_FIRE.rigid)})`;
    if (m.rod.measured + 1e-9 < G.diameter)
      return `${String(m.rod.diameter)} m thick, under ${String(G.diameter)} m`;
    return null;
  }
  if (role === 'binding') {
    if (!m.strand)
      return `${m.resource} has no represented strand length or strength`;
    if (m.flexibility < BEND)
      return `${m.resource} is too stiff to wrap (flexibility ${String(m.flexibility)}; at least ${String(BEND)})`;
    return null;
  }
  if (!STEMS.includes(m.resource))
    return `${m.resource} is not a thin stem material`;
  if (!m.stem)
    return `${m.resource} stem length and solid density are not represented, so its installed volume cannot be measured`;
  if (m.waterShare > G.dry + 1e-9)
    return `${m.resource} is not dry (water share ${String(m.waterShare)}; at most ${String(G.dry)})`;
  return null;
}

/** Rod slots: six legs, two ridge rods, four base rails and eight battens. `from`/`to` are the
 * frames a spanning rod joins; legs stand in one frame. */
export interface ShelterSlot {
  slot: string;
  role: 'leg' | 'ridge' | 'rail' | 'batten';
  side: 'L' | 'R' | null;
  row: 'lower' | 'upper' | null;
  from: number;
  to: number;
}
const SIDES = ['L', 'R'] as const;
const ROWS = ['lower', 'upper'] as const;
export const SHELTER_SLOTS: ShelterSlot[] = [
  ...[0, 1, 2].flatMap((f) =>
    SIDES.map((side) => ({
      slot: `leg-${side}-${String(f)}`,
      role: 'leg' as const,
      side,
      row: null,
      from: f,
      to: f,
    })),
  ),
  ...[0, 1].map((k) => ({
    slot: `ridge-${String(k)}`,
    role: 'ridge' as const,
    side: null,
    row: null,
    from: k,
    to: k + 1,
  })),
  ...SIDES.flatMap((side) =>
    [0, 1].map((k) => ({
      slot: `rail-${side}-${String(k)}`,
      role: 'rail' as const,
      side,
      row: null,
      from: k,
      to: k + 1,
    })),
  ),
  ...SIDES.flatMap((side) =>
    ROWS.flatMap((row) =>
      [0, 1].map((k) => ({
        slot: `batten-${side}-${row}-${String(k)}`,
        role: 'batten' as const,
        side,
        row,
        from: k,
        to: k + 1,
      })),
    ),
  ),
];
/** Half the roof slope from eave to ridge. */
export const SHELTER_SLOPE = round(Math.hypot(G.width / 2, G.ridge));
/** Minimum rod length for its role. */
export const shelterMinLength = (role: string) =>
  role === 'leg'
    ? round(SHELTER_SLOPE + G.crossing)
    : round((G.length + G.overlap) / 2);

/** A lashed joint. Structural joints (apex, foot) carry the frame; ties hold battens and
 * covering. Metres follow from the member diameters: a wrap goes once round both rods, 2 (d1+d2);
 * a frap goes between them, d1 + d2; a covering tie turn goes round a rod and the 0.1 m layer. */
export interface ShelterJoint extends V7Data {
  id: string;
  kind: 'apex' | 'foot' | 'batten' | 'thatch';
  members: string[];
  wraps: number;
  metres: number;
  /** Design load (N) and friction capacity (N) at the last check. */
  load: number;
  capacity: number;
  strands: string[];
}
export interface ShelterPanel extends V7Data {
  id: string;
  side: string | null;
  course: string | null;
  bay: number | null;
  area: number;
  /** Required covering volume (m3), installed volume and condition. */
  volume: number;
  installed: number;
  condition: number;
  lots: V7Data[];
}
const PANELS = [
  ...SIDES.flatMap((side) =>
    ROWS.flatMap((course) =>
      [0, 1].map((bay) => ({
        id: `${side}-${course}-${String(bay)}`,
        side,
        course,
        bay,
        area: round((SHELTER_SLOPE / 2) * (G.length / 2)),
      })),
    ),
  ),
  {
    id: 'rear',
    side: null,
    course: null,
    bay: null,
    area: round((G.width * G.ridge) / 2),
  },
];
/** Panel covering volume: area x thickness, scaled so the nine panels hold the 0.26 m3 recipe
 * (the extra 0.005 m3 is the lap over the ridge). */
const PANEL_AREA = PANELS.reduce((n, p) => n + p.area, 0);
export function shelterPanels(): ShelterPanel[] {
  return PANELS.map((p) => ({
    ...p,
    volume: round((G.thatch * p.area) / PANEL_AREA),
    installed: 0,
    condition: 1,
    lots: [],
  }));
}
/** The joints of the recipe for the given rod diameters by slot. */
export function shelterJoints(d: Record<string, number>): ShelterJoint[] {
  const pair = (a: string, b: string) => (d[a] ?? 0) + (d[b] ?? 0),
    joint = (
      id: string,
      kind: ShelterJoint['kind'],
      members: string[],
      wraps: number,
      metres: number,
    ): ShelterJoint => ({
      id,
      kind,
      members,
      wraps,
      metres: round(metres),
      load: 0,
      capacity: 0,
      strands: [],
    });
  const out: ShelterJoint[] = [];
  for (const f of [0, 1, 2]) {
    const ridge = SHELTER_SLOTS.filter(
        (s) => s.role === 'ridge' && (s.from === f || s.to === f),
      ).map((s) => s.slot),
      span = pair(`leg-L-${String(f)}`, `leg-R-${String(f)}`);
    out.push(
      joint(
        `apex-${String(f)}`,
        'apex',
        [`leg-L-${String(f)}`, `leg-R-${String(f)}`, ...ridge],
        6,
        6 * 2 * span + 2 * span,
      ),
    );
  }
  for (const side of SIDES)
    for (const f of [0, 1, 2]) {
      const rails = SHELTER_SLOTS.filter(
          (s) =>
            s.role === 'rail' &&
            s.side === side &&
            (s.from === f || s.to === f),
        ).map((s) => s.slot),
        span = pair(`leg-${side}-${String(f)}`, rails[0] ?? '');
      out.push(
        joint(
          `foot-${side}-${String(f)}`,
          'foot',
          [`leg-${side}-${String(f)}`, ...rails],
          6,
          6 * 2 * span + 2 * span,
        ),
      );
    }
  for (const s of SHELTER_SLOTS.filter((s) => s.role === 'batten'))
    for (const f of [s.from, s.to]) {
      const leg = `leg-${s.side ?? 'L'}-${String(f)}`;
      out.push(
        joint(
          `tie-${s.slot}-${String(f)}`,
          'batten',
          [s.slot, leg],
          3,
          3 * 2 * pair(s.slot, leg),
        ),
      );
    }
  for (const p of PANELS) {
    const holder =
      p.side === null
        ? 'leg-L-2'
        : `batten-${p.side}-${p.course}-${String(p.bay)}`;
    out.push(
      joint(
        `thatch-${p.id}`,
        'thatch',
        [holder],
        4,
        4 * 2 * ((d[holder] ?? 0) + G.thickness),
      ),
    );
  }
  return out;
}
/** Binding the recipe needs: the joints' metres, and never less than the specification's 30 m. */
export const shelterCordNeed = (joints: ShelterJoint[]) =>
  round(
    Math.max(
      G.cord,
      joints.reduce((n, j) => n + j.metres, 0),
    ),
  );

/** One installed part: the moved unit's record plus its role and measured values. */
export interface ShelterPart extends V7Data {
  id: string;
  resource: string;
  origin: string;
  quantity: number;
  role: string;
  slot: string;
  condition: number;
  installedAt: number;
  sourceOwner: string;
}
export const shelterParts = (o: V7Object, key: string): ShelterPart[] =>
  Array.isArray(o.data[key]) ? (o.data[key] as unknown as ShelterPart[]) : [];
export const shelterJointList = (o: V7Object): ShelterJoint[] =>
  Array.isArray(o.data.joints)
    ? (o.data.joints as unknown as ShelterJoint[])
    : [];
export const shelterPanelList = (o: V7Object): ShelterPanel[] =>
  Array.isArray(o.data.panels)
    ? (o.data.panels as unknown as ShelterPanel[])
    : [];
const strandCondition = (o: V7Object, j: ShelterJoint) => {
  const list = shelterParts(o, 'strands').filter((s) =>
    j.strands.includes(s.id),
  );
  return list.length ? Math.min(...list.map((s) => s.condition)) : 0;
};
/** A joint is lashed when its strands are installed; its condition is their weakest. */
export const shelterJointCondition = (o: V7Object, j: ShelterJoint) =>
  j.strands.length ? strandCondition(o, j) : 0;

/** Effective cover of a panel: installed share, held by sound ties, with measured gaps once its
 * condition falls below 0.75. */
export function shelterPanelCover(o: V7Object, p: ShelterPanel): number {
  if (o.data.status === 'collapsed') return 0;
  const joints = shelterJointList(o),
    ties = joints.filter(
      (j) =>
        j.id === `thatch-${p.id}` ||
        (p.side !== null &&
          j.kind === 'batten' &&
          j.members[0] ===
            `batten-${p.side}-${p.course ?? ''}-${String(p.bay ?? 0)}`),
    ),
    held = ties.every((j) => shelterJointCondition(o, j) >= G.loose),
    share = p.volume > 0 ? Math.min(1, p.installed / p.volume) : 0;
  return held && ties.length
    ? round(share * Math.min(1, p.condition / G.sound))
    : 0;
}
/** Area-weighted cover of the roof panels (rear excluded) or of all nine. */
export function shelterCover(o: V7Object, rear: boolean): number {
  const list = shelterPanelList(o).filter((p) => rear || p.id !== 'rear'),
    area = list.reduce((n, p) => n + p.area, 0);
  return area > 0
    ? round(
        list.reduce((n, p) => n + p.area * shelterPanelCover(o, p), 0) / area,
      )
    : 0;
}

/** The whole body circle lies on the floor and the roof over its centre clears the body. */
export function shelterFits(o: V7Object, p: V7Point, radius: number): boolean {
  const q = v7Local(p, o.spatial);
  return (
    Math.abs(q.x) + radius <= G.width / 2 + 1e-9 &&
    Math.abs(q.y) + radius <= G.length / 2 + 1e-9 &&
    G.ridge * (1 - Math.abs(q.x) / (G.width / 2)) >= radius
  );
}
/** Living bodies that overlap the floor at all. */
export function shelterBodies(w: V7World, o: V7Object): V7Actor[] {
  return w.actors.filter((a) => {
    if (a.vitals.health <= 0) return false;
    const q = v7Local(a.position, o.spatial);
    return (
      Math.abs(q.x) < G.width / 2 + a.radius &&
      Math.abs(q.y) < G.length / 2 + a.radius
    );
  });
}
export const shelterOccupants = (o: V7Object): string[] =>
  Array.isArray(o.data.occupants)
    ? o.data.occupants.filter((x): x is string => typeof x === 'string')
    : [];

/** Cover met by a wind-slanted rain ray from a floor point: the panel it leaves through, the
 * covered rear end, or 0 through the open end. */
function rayCover(o: V7Object, x0: number, y0: number, wind: number) {
  const a = o.spatial.angle,
    u = SLANT * wind * Math.cos(a),
    v = -SLANT * wind * Math.sin(a),
    H = G.ridge,
    k = H / (G.width / 2),
    plus = (H - k * x0) / (1 + k * u),
    z = x0 + u * plus >= 0 ? plus : (H + k * x0) / (1 - k * u),
    panel = (id: string) => shelterPanelList(o).find((p) => p.id === id);
  if (v < 0 && (-G.length / 2 - y0) / v < z) return 0;
  if (v > 0 && (G.length / 2 - y0) / v < z) {
    const p = panel('rear');
    return p ? shelterPanelCover(o, p) : 0;
  }
  const xe = x0 + u * z,
    ye = y0 + v * z,
    p = panel(
      `${xe < 0 ? 'L' : 'R'}-${z < H / 2 ? 'lower' : 'upper'}-${ye < 0 ? '0' : '1'}`,
    );
  return p ? shelterPanelCover(o, p) : 0;
}

/** Bedding is laid in full and dry. */
export function shelterBeddingDry(o: V7Object): boolean {
  const b = o.data.bedding as V7Data | undefined;
  return (
    !!b &&
    Number(b.installed ?? 0) + 1e-9 >= G.bedding &&
    Number(b.waterShare ?? 1) <= G.dry + 1e-9
  );
}
/** Why the rating is suspended for this shelter now, or null. */
export function shelterWithheld(
  w: V7World,
  o: V7Object,
  rain: number,
  wind: number,
  temperature: number,
): string | null {
  if (o.data.status !== 'complete')
    return `the shelter is ${typeof o.data.status === 'string' ? o.data.status : 'not complete'}`;
  if (shelterRainMmPerHour(rain) > G.rating.rain)
    return 'rain beyond the 5 mm/h rating';
  if (shelterWindMs(wind) > G.rating.wind)
    return 'wind beyond the 5 m/s rating';
  if (rain > 0 && temperature <= 0) return 'snow load beyond the rating';
  if (openConditions(w, o.spatial).waterlogging > 0.1)
    return 'water standing on the floor';
  return null;
}

/** Actual protection for one person; null when no shelter holds this person as an occupant. */
export function weatherShelterExposure(w: V7World, a: V7Actor) {
  if (!w.revisions.includes(WEATHER_SHELTER_REVISION) || !w.config.experience)
    return null;
  const climate = forestClimate(w, a.position);
  if (climate.indoor) return null;
  const o = w.objects.find(
    (o) =>
      o.kind === WEATHER_SHELTER_KIND &&
      shelterOccupants(o).includes(a.id) &&
      shelterFits(o, a.position, a.radius),
  );
  if (!o) return null;
  const rain = climate.rain ?? 0,
    wind = climate.wind ?? 0,
    bodies = shelterBodies(w, o).length,
    water = o.data.water as V7Data | undefined,
    saturated = water?.saturated === true,
    withheld =
      bodies > 1
        ? 'more than one person on the one-person floor'
        : shelterWithheld(w, o, rain, wind, climate.temperature),
    q = v7Local(a.position, o.spatial),
    samples = [
      [0, 0],
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [
        Math.cos((i * Math.PI) / 4) * a.radius,
        Math.sin((i * Math.PI) / 4) * a.radius,
      ]),
    ],
    roofCover = round(
      samples.reduce(
        (n, [dx = 0, dy = 0]) => n + rayCover(o, q.x + dx, q.y + dy, wind),
        0,
      ) / samples.length,
    ),
    openFacing = round(Math.max(0, Math.sin(o.spatial.angle))),
    enclosure = round(shelterCover(o, true) * (1 - openFacing)),
    rainShield = withheld || saturated ? 0 : round(G.rainShield * roofCover),
    windShield = withheld ? 0 : round(G.windShield * enclosure),
    exposure = w.config.experience.exposure,
    bedding = !withheld && shelterBeddingDry(o);
  return {
    target: o.id,
    rain,
    wind,
    rainMmPerHour: shelterRainMmPerHour(rain),
    windMs: shelterWindMs(wind),
    windFrom: '+x',
    roofCover,
    openFacing,
    enclosure,
    saturated,
    occupants: bodies,
    withheld,
    rainShield,
    windShield,
    rainReaching: round(rain * (1 - rainShield)),
    outdoorChill: round(exposure * (rain + wind)),
    avoidedChill: round(exposure * (rain * rainShield + wind * windShield)),
    bedding,
    ambient: climate.temperature,
  };
}

/** Physiology hook: the avoided part of the existing rain and wind chill, and dry bedding's cut of
 * the ground-contact share of body cooling. It never raises the exchange temperature above the
 * body, never stacks on another shelter rule and leaves air temperature unchanged. */
export function weatherShelterPhysiology(
  w: V7World,
  a: V7Actor,
  ambient: number,
): number {
  if (!w.revisions.includes(WEATHER_SHELTER_REVISION)) return ambient;
  const m = weatherShelterExposure(w, a);
  if (!m || ambient !== m.ambient) return ambient;
  const shielded = ambient + m.avoidedChill,
    body = a.vitals.temperature,
    cut = m.bedding && shielded < body ? G.groundShare * G.beddingCut : 0,
    exchange = round(shielded - (shielded - body) * cut);
  forestEvent(
    w,
    'weather-shelter-exposure-measured',
    m.withheld
      ? `The shelter gave no protection this round: ${m.withheld}.`
      : `Covered floor: ${String(Math.round(m.rainReaching * 100) / 100)} of rain index ${String(Math.round(m.rain * 100) / 100)} reached the body and wind exposure was cut by ${String(Math.round(m.windShield * 100))}%${cut ? '; dry bedding halved ground-contact cooling' : ''}. Air temperature is unchanged.`,
    a.position,
    a.id,
    { ...m, groundCut: round(cut), exchange, body },
    m.target,
  );
  return exchange;
}
