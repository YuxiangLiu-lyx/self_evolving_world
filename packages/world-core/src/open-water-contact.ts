import type {
  V7ActionContext,
  V7World,
  V7Actor,
  V7Stack,
  V7Data,
} from './continuous-types.js';
import { v7String, v7Json, v7Clone } from './continuous-data.js';
import { v7Spend } from './continuous-base.js';
import { wovenHydrate, wovenMeasurement } from './open-woven-physics.js';
import { waterItem, waterWithdraw, waterPoint } from './open-water-state.js';
import { cupContents, cupSync, waterSpill } from './open-water-cup.js';

export function appliedWater(
  w: V7World,
  a: V7Actor,
  s: V7Stack,
  tool: V7Stack,
): V7Data | null {
  if (w.state.riverWater !== 1) return null;
  const raw = s.processing?.contactWater;
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    raw.used === true ||
    raw.owner !== a.id ||
    raw.specimen !== s.id ||
    raw.tool !== tool.id
  )
    return null;
  const dry = raw.first as V7Data,
    physical = s.physical;
  if (
    !physical ||
    physical.unitWater / physical.unitMass <= Number(dry.wetness) + 1e-6
  )
    return null;
  return raw;
}
export function waterWet(c: V7ActionContext) {
  const { world: w, actor: a } = c,
    s = waterItem(w, a, v7String(c.action.args.target, 'specimen'));
  const j = Object.values(w.state).find(
    (v) =>
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      v.owner === a.id &&
      v.mode === 'test-vine' &&
      v.stage === 1 &&
      v.specimen === s.id,
  ) as V7Data | undefined;
  if (!a.mastered.includes('assay-woven-supports') || !j)
    throw new Error(
      'An actual local unfinished personal vine comparison and its prior ability are required.',
    );
  const toolId = (j.tools as string[])[0],
    tool = w.stacks.find(
      (s) =>
        s.id === toolId &&
        s.owner === a.id &&
        !s.reservedFor &&
        s.quantity >= 1,
    );
  if (
    !tool ||
    (w.resources.find((r) => r.id === tool.resource)?.properties?.hardness ??
      0) < 8
  )
    throw new Error(
      'The original comparison needs an actual retained hard-stone tool.',
    );
  wovenHydrate(w, s);
  const physical = s.physical;
  if (!physical) throw new Error('Missing actual specimen composition.');
  const wetness = physical.unitWater / physical.unitMass;
  if (wetness > 0.2)
    throw new Error(
      'The actual specimen must first reach its dry comparison condition; no dry result is invented.',
    );
  const first = v7Json(wovenMeasurement(w, s, tool, wetness)),
    ml = Math.ceil(100 * s.quantity - 1e-9),
    source = v7String(c.action.args.container, 'explicit water source');
  const cup = source.startsWith('river:') ? null : waterItem(w, a, source),
    contents = cup ? cupContents(cup) : null;
  if (contents && Number(contents.waterMl) < ml)
    throw new Error(
      'Actual cup contents are insufficient for the full contact dose.',
    );
  if (a.vitals.energy < 0.3)
    return { complete: false, remaining: 1, writes: [] };
  const lineage = cup
    ? {
        source: cup.id,
        ml,
        tick: w.tick,
        provenance: v7Clone(contents?.provenance ?? []),
      }
    : waterWithdraw(w, a, source, ml);
  if (contents && cup) {
    contents.waterMl = Number(contents.waterMl) - ml;
    contents.contactMl = Number(contents.contactMl) + ml;
    cupSync(cup);
  }
  v7Spend(a, 0.3);
  const retained = Math.min(
      ml / 1000,
      Math.max(0, physical.unitSolids * 2 - physical.unitWater) * s.quantity,
    ),
    runoff = ml / 1000 - retained;
  physical.unitWater += retained / s.quantity;
  physical.unitMass = physical.unitSolids + physical.unitWater;
  const point = waterPoint(w, s);
  waterSpill(w, point, runoff * 1000, 0, 0, cup?.id ?? source);
  const water = {
    source: cup?.id ?? source,
    withdrawn: ml / 1000,
    retained,
    runoff,
    quantityMl: ml,
    lineage: v7Json(lineage),
  };
  s.processing = {
    ...s.processing,
    contactWater: {
      owner: a.id,
      specimen: s.id,
      tool: tool.id,
      project: v7String(j.id, 'comparison project'),
      at: w.tick,
      first,
      water,
      used: false,
    },
  };
  c.emit(
    'material-contact-wetted',
    'Paid local water contact changed this actual specimen. Its separate comparison still requires remaining paid work and gives no automatic pass.',
    {
      specimen: s.id,
      project: v7String(j.id, 'comparison project'),
      position: { ...point },
      ...water,
      paidEnergy: 0.3,
      remainingWork: 0,
    },
    s.id,
  );
  return { complete: true, writes: [s.id, cup?.id ?? `water:cell:${source}`] };
}
