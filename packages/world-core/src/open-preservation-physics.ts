import type { V7Data, V7Object, V7Stack, V7World } from './continuous-types.js';
import { v7RoundNumber } from './continuous-data.js';
import { forestClimate, forestEvent } from './forest-climate.js';
import { refugeRay } from './open-shelter-geometry.js';
import {
  v7Distance,
  v7ShapeDistance,
  v7ShapesOverlap,
} from './continuous-geometry.js';
import {
  foodGroundArea,
  foodGroundRadius,
  foodGroundSpatial,
  foodObjectArea,
} from './food-water-surface.js';
import type { FoodWaterSurface } from './food-water-surface.js';
export interface PreservationPhysics extends V7Data {
  version: number;
  initialWaterFraction: number;
  initialUnitMass: number;
  opening: number;
  prepared: boolean;
  tray: string;
  area: number;
  evaporated: number;
  absorbed: number;
  rainAdded: number;
  lastTick: number;
  baselineDeterioration: number;
  actualDeterioration: number;
  history: V7Data[];
  contamination: string;
  initialization: string;
  /** Opt-in general surface of the food water representation (`foodWater` worlds only).
   * Absent in every ex10 record; an object surface also keeps its id in `tray`. */
  surface?: FoodWaterSurface;
}
export function preservationPhysics(s: V7Stack): PreservationPhysics | null {
  const d = s.processing?.preservationPhysics;
  return d && typeof d === 'object' && !Array.isArray(d) && d.version === 1
    ? (d as PreservationPhysics)
    : null;
}
export function preservationInitialize(
  w: V7World,
  s: V7Stack,
): PreservationPhysics {
  const old = preservationPhysics(s);
  if (old) return old;
  const r = w.resources.find((r) => r.id === s.resource);
  if (!r || r.nutrition <= 0) throw new Error('Actual food is required.');
  const represented = !!s.physical;
  if (!s.physical) {
    const fraction =
      s.resource === 'berry' ? 0.85 : s.resource === 'root' ? 0.75 : null;
    if (fraction === null)
      throw new Error(
        'Composition is unrepresented; no drying composition is invented.',
      );
    s.physical = {
      unitMass: r.mass,
      unitWater: r.mass * fraction,
      unitSolids: r.mass * (1 - fraction),
    };
  }
  const d: PreservationPhysics = {
    version: 1,
    initialWaterFraction: s.physical.unitWater / s.physical.unitMass,
    initialUnitMass: s.physical.unitMass,
    opening: 1,
    prepared: false,
    tray: '',
    area: 0,
    evaporated: 0,
    absorbed: 0,
    rainAdded: 0,
    lastTick: -1,
    baselineDeterioration: 0,
    actualDeterioration: 0,
    history: [],
    contamination: 'Unresolved; drying never sterilizes or removes toxins.',
    initialization: represented
      ? 'Retained existing represented composition; not a new measurement.'
      : 'Version-1 berry/root water fraction is a physical-model assumption, not measured evidence.',
  };
  s.processing = { ...s.processing, preservationPhysics: d };
  return d;
}
export function preservationOnTray(s: V7Stack): boolean {
  return !!preservationPhysics(s)?.tray;
}
export function preservationTrayArea(w: V7World, tray: V7Object): number {
  if (tray.kind !== 'drying-tray' || Number(tray.data.service) <= 0)
    throw new Error('An intact actual drying tray is required.');
  const shape = tray.spatial.shape;
  const area =
    shape.kind === 'circle'
      ? Math.PI * shape.radius ** 2
      : shape.width * shape.height;
  if (
    !(area > 0) ||
    w.objects.some(
      (o) =>
        o.id !== tray.id &&
        o.kind !== 'open-refuge' &&
        (o.spatial.solid || o.spatial.reserved) &&
        v7ShapesOverlap(o.spatial, tray.spatial),
    )
  )
    throw new Error('The actual tray surface is obstructed.');
  return area;
}
export function preservationRate(s: V7Stack): number {
  const d = preservationPhysics(s),
    p = s.physical;
  if (!d || !p) return 1;
  const fraction = p.unitMass > 0 ? p.unitWater / p.unitMass : 0;
  return (
    d.opening *
    (d.prepared
      ? Math.max(
          0.15,
          Math.min(
            1.5,
            0.15 +
              (0.85 * fraction) / Math.max(0.000001, d.initialWaterFraction),
          ),
        )
      : 1)
  );
}
/** Shared weather, distinct from soil moisture. Surface identity and conservation remain explicit. */
export function preservationExchange(w: V7World, s: V7Stack): void {
  const d = preservationPhysics(s),
    p = s.physical;
  if (!d || !p || d.lastTick === w.tick || s.quantity <= 0) return;
  d.lastTick = w.tick;
  // Opt-in food water representation; every ex10 world takes the original path.
  const general = w.state.foodWater === 1;
  if (general) foodSurfaceRetain(w, s);
  const tray = w.objects.find((o) => o.id === d.tray),
    owner = w.actors.find((a) => a.id === s.owner);
  const point = tray?.spatial ?? owner?.position ?? s.position;
  const climate = forestClimate(w, point, general),
    rh = climate.airHumidity ?? 0.65;
  let area = 0;
  if (tray) {
    try {
      area =
        general && tray.data.foodSurface === true
          ? foodObjectArea(w, tray)
          : preservationTrayArea(w, tray);
    } catch {
      area = 0;
    }
    const region =
      w.state.extractionPhysics === 1 ? s.processing?.extractionRegion : null;
    const allocated =
      region && typeof region === 'object' && !Array.isArray(region)
        ? region
        : null;
    if (allocated) area = Math.min(area / 2, Number(allocated.area));
    if (
      w.stacks.some(
        (x) =>
          x.id !== s.id &&
          !(
            allocated &&
            x.processing?.extractionRegion &&
            typeof x.processing.extractionRegion === 'object' &&
            !Array.isArray(x.processing.extractionRegion) &&
            x.processing.extractionRegion.project === allocated.project &&
            x.processing.extractionRegion.slot !== allocated.slot
          ) &&
          (preservationPhysics(x)?.tray === tray.id ||
            (x.owner === null &&
              v7ShapeDistance(x.position, tray.spatial) <= 0.01)),
      )
    )
      area = 0;
  } else if (general && d.surface?.kind === 'ground') {
    try {
      area = foodGroundArea(w, d.surface);
    } catch {
      area = 0;
    }
    if (foodSurfaceOccupied(w, s.id, d.surface)) area = 0;
  }
  d.area = area;
  const roof = Math.max(
    0,
    ...w.objects
      .filter((o) => o.kind === 'open-refuge')
      .map((o) => refugeRay(o, point, (climate.wind ?? 0) * 0.25, 0)),
  );
  const rain = climate.indoor ? 0 : (climate.rain ?? 0) * (1 - roof);
  const received = rain * area * 0.01;
  const currentWater = p.unitWater * s.quantity,
    solids = p.unitSolids * s.quantity;
  const equilibrium = Math.max(0.1, Math.min(0.35, 0.1 + 0.25 * rh));
  const target = (solids * equilibrium) / (1 - equilibrium);
  const spread =
    d.prepared && d.initialUnitMass * s.quantity <= 0.2 * area + 1e-8;
  const limit = spread
    ? 0.025 * area * Math.max(0, Math.min(2, (climate.temperature - 5) / 20))
    : 0;
  const exchange = Math.max(-limit, Math.min(limit, currentWater - target));
  p.unitWater = v7RoundNumber(
    (currentWater - exchange + received) / s.quantity,
  );
  p.unitMass = v7RoundNumber(p.unitWater + p.unitSolids);
  const evaporated = Math.max(0, exchange),
    absorbed = Math.max(0, -exchange);
  d.evaporated += evaporated;
  d.absorbed += absorbed;
  d.rainAdded += received;
  const ledger = (w.state['preservation:water'] ?? {}) as V7Data;
  ledger.evaporated = Number(ledger.evaporated ?? 0) + evaporated;
  ledger.absorbed = Number(ledger.absorbed ?? 0) + absorbed;
  ledger.rain = Number(ledger.rain ?? 0) + received;
  w.state['preservation:water'] = ledger;
  const row = {
    tick: w.tick,
    temperature: climate.temperature,
    rh,
    area,
    rain,
    evaporated,
    absorbed,
    received,
    water: p.unitWater * s.quantity,
    solids,
  };
  d.history = [...d.history, row].slice(-12);
  if (tray) {
    tray.data.preservation = {
      sample: s.id,
      owner: s.owner,
      quantity: s.quantity,
      resource: s.resource,
      area,
      waterFraction: p.unitWater / p.unitMass,
      massRatio: p.unitMass / d.initialUnitMass,
      prepared: d.prepared,
    };
    // A general food surface wears only when it carries a service account.
    if (spread && (!general || 'service' in tray.data))
      tray.data.service = Math.max(0, Number(tray.data.service) - 0.01);
  }
  if (area > 0)
    forestEvent(
      w,
      'preservation-progress',
      'Passive batch exposure evaluated with actual surface and weather; this is not a paid measurement or safety result.',
      point,
      s.owner,
      {
        audit: { ...row, rate: preservationRate(s) },
        temperature: climate.temperature,
        airHumidity: rh,
        area,
        sample: s.id,
        process: s.reservedFor ?? null,
        prepared: d.prepared,
      },
      s.id,
    );
}
export function preservationReleaseSurface(w: V7World, s: V7Stack): void {
  const d = preservationPhysics(s);
  if (!d) return;
  const tray = w.objects.find((o) => o.id === d.tray);
  const view = tray?.data.preservation;
  if (
    tray &&
    view &&
    typeof view === 'object' &&
    !Array.isArray(view) &&
    view.sample === s.id
  )
    delete tray.data.preservation;
  d.tray = '';
  d.area = 0;
}
export function preservationAge(s: V7Stack, ambient: number): number {
  const d = preservationPhysics(s),
    rate = preservationRate(s);
  if (d) {
    d.baselineDeterioration += ambient;
    d.actualDeterioration += ambient * rate;
  }
  return ambient * rate;
}

// Opt-in general surfaces of the food water representation (`foodWater` worlds only).
// Ex10 trays keep their own rules above; these rules apply only to records with `surface`.

/** One sample per surface: another sample bound to it, or other loose material lying on it. */
export function foodSurfaceOccupied(
  w: V7World,
  sample: string,
  surface: FoodWaterSurface,
): boolean {
  if (surface.kind === 'object') {
    const o = w.objects.find((o) => o.id === surface.id);
    return (
      !!o &&
      w.stacks.some(
        (x) =>
          x.id !== sample &&
          (preservationPhysics(x)?.tray === o.id ||
            (x.owner === null &&
              v7ShapeDistance(x.position, o.spatial) <= 0.01)),
      )
    );
  }
  const spatial = foodGroundSpatial(surface),
    radius = foodGroundRadius(surface);
  return w.stacks.some((x) => {
    if (x.id === sample) return false;
    const other = preservationPhysics(x)?.surface;
    if (other?.kind === 'ground')
      return (
        v7Distance(other, surface) < foodGroundRadius(other) + radius - 1e-8
      );
    return x.owner === null && v7ShapeDistance(x.position, spatial) <= 0.01;
  });
}
/** Exposed food lies on its surface only while some remains, it is not carried and it has
 * not moved off the surface. */
export function foodSurfaceLying(
  w: V7World,
  s: V7Stack,
  surface: FoodWaterSurface,
): boolean {
  if (s.owner !== null || s.quantity <= 0) return false;
  if (surface.kind === 'ground')
    return v7Distance(s.position, surface) <= foodGroundRadius(surface);
  const o = w.objects.find((o) => o.id === surface.id);
  return !!o && v7ShapeDistance(s.position, o.spatial) <= 0.01;
}
/** Ends a general surface exposure. Composition, preparation, age and history persist. */
export function foodSurfaceRelease(w: V7World, s: V7Stack): void {
  const d = preservationPhysics(s);
  if (!d) return;
  preservationReleaseSurface(w, s);
  delete d.surface;
}
/** Food that was picked up, given or removed from its surface stops exchanging there. */
function foodSurfaceRetain(w: V7World, s: V7Stack): void {
  for (const x of [s, ...w.stacks]) {
    const surface = preservationPhysics(x)?.surface;
    if (surface && !foodSurfaceLying(w, x, surface)) foodSurfaceRelease(w, x);
  }
}
