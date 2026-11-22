import type {
  V7Data,
  V7Resource,
  V7Stack,
  V7World,
} from './continuous-types.js';
export interface RootProcessing extends V7Data {
  version: 1;
  fraction: number;
  drying: boolean;
  tray: string;
  depositor: string;
  originalUnitMass: number;
  originalWater: number;
  evaporated: number;
  receivedWater: number;
  lastTick: number;
  baselineDecay: number;
  actualDecay: number;
  dry: boolean;
  history: V7Data[];
}
export function rootEnabled(w: V7World) {
  return (
    w.revisions.includes('root-preparation@1') ||
    w.revisions.includes('root-air-drying@1')
  );
}
export function rootProcessing(w: V7World, s: V7Stack): RootProcessing | null {
  const p = s.processing?.collectiveRoot;
  return rootEnabled(w) &&
    p &&
    typeof p === 'object' &&
    !Array.isArray(p) &&
    p.version === 1
    ? (p as RootProcessing)
    : null;
}
export function rootInitialize(
  w: V7World,
  s: V7Stack,
  depositor: string,
): RootProcessing {
  const old = rootProcessing(w, s);
  if (old) return old;
  const r = w.resources.find((r) => r.id === s.resource);
  if (r?.id !== 'root' || r.nutrition !== 14 || r.toxicity !== 0)
    throw new Error('This reviewed process requires actual safe meadow roots.');
  const represented = !!s.physical;
  s.physical ??= {
    unitMass: r.mass,
    unitWater: r.mass * 0.5,
    unitSolids: r.mass * 0.5,
  };
  const p: RootProcessing = {
    version: 1,
    fraction: 0,
    drying: false,
    tray: '',
    depositor,
    originalUnitMass: s.physical.unitMass,
    originalWater: s.physical.unitWater,
    evaporated: 0,
    receivedWater: 0,
    lastTick: -1,
    baselineDecay: 0,
    actualDecay: 0,
    dry: false,
    history: [],
  };
  s.processing = {
    ...s.processing,
    collectiveRoot: p,
    compositionBasis: represented
      ? 'Retained actual represented composition.'
      : 'Reviewed ex12 physical assumption: unprocessed roots are 50% water by mass; not an agent measurement.',
    initialResource: s.resource,
    initialHarvestedAt: s.harvestedAt ?? null,
    initialDecay: s.decay ?? 0,
  };
  return p;
}
export function rootFoodProfile(
  w: V7World,
  s: V7Stack,
): V7Resource | undefined {
  const p = rootProcessing(w, s);
  if (!p) return undefined;
  const base = w.resources.find((r) => r.id === 'root');
  if (!base) throw new Error('Missing original root composition.');
  return {
    ...base,
    id: s.resource,
    name:
      p.fraction >= 1 ? 'Crushed meadow roots' : 'Partly crushed meadow roots',
    mass: s.physical?.unitMass ?? base.mass,
    food: {
      ingredients: [{ resource: 'root', share: 1 }],
      method: p.dry
        ? 'air-dried-crushed'
        : p.fraction >= 1
          ? 'stone-crushed'
          : 'partly-crushed',
      quality: base.food?.quality ?? 0.8,
    },
  };
}
export function rootDecayRate(w: V7World, s: V7Stack) {
  const p = rootProcessing(w, s);
  return p
    ? p.drying && p.fraction >= 1 && p.dry
      ? 0.35
      : 1 + 0.25 * p.fraction
    : 1;
}
