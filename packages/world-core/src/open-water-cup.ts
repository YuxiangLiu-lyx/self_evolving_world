import type {
  V7World,
  V7Stack,
  V7Point,
  V7Process,
  V7Data,
} from './continuous-types.js';
import { v7Id, v7Clone } from './continuous-data.js';
import { forestEvent } from './forest-climate.js';
import { waterPoint } from './open-water-state.js';

export function cupSync(s: V7Stack) {
  const c = s.waterCup;
  if (!c) throw new Error('Not an actual unfired water cup.');
  const wall = Number(c.wallMass),
    fraction = Number(c.wallWaterFraction),
    water = Number(c.waterMl) / 1000;
  s.physical = {
    unitMass: wall + water,
    unitWater: wall * fraction + water,
    unitSolids: wall * (1 - fraction),
  };
}
/** Deposits share a cell-sized audit footprint; every actual deposition coordinate remains in its event. */
export function waterSpill(
  w: V7World,
  point: V7Point,
  ml: number,
  clay: number,
  wallWaterFraction: number,
  source: string,
) {
  if (ml <= 0 && clay <= 0) return;
  const cell = `${String(Math.floor(point.x))}:${String(Math.floor(point.y))}`;
  let o = w.objects.find(
    (o) => o.kind === 'water-spill' && o.data.cell === cell,
  );
  if (!o) {
    o = {
      id: v7Id(w, 'object'),
      kind: 'water-spill',
      name: 'Located water and clay deposits',
      spatial: {
        x: Math.floor(point.x) + 0.5,
        y: Math.floor(point.y) + 0.5,
        angle: 0,
        shape: { kind: 'rectangle', width: 1, height: 1 },
        solid: false,
        interaction: 0,
        entrances: [],
      },
      visual: {
        component: 'rock',
        color: '#687f79',
        accent: '#a97c61',
        label: 'Water and clay deposits',
        state: 'wet',
      },
      data: {
        cell,
        waterMl: 0,
        clayMass: 0,
        clayWater: 0,
        claySolids: 0,
        sources: [],
        interpretation:
          'Cell audit footprint, not a uniform flooded surface; exact deposit points are recorded events.',
      },
      createdBy: null,
      createdAt: w.tick,
      revision: 'river-contact-water@1',
    };
    w.objects.push(o);
  }
  o.data.waterMl = Number(o.data.waterMl) + ml;
  o.data.clayMass = Number(o.data.clayMass) + clay;
  o.data.clayWater = Number(o.data.clayWater) + clay * wallWaterFraction;
  o.data.claySolids =
    Number(o.data.claySolids) + clay * (1 - wallWaterFraction);
  const sources = o.data.sources as string[];
  if (!sources.includes(source)) sources.push(source);
  forestEvent(
    w,
    'water-spilled',
    'Actual water and wall clay remain at their deposition location; no potable source is created.',
    point,
    null,
    {
      source,
      waterMl: ml,
      clayMass: clay,
      clayWater: clay * wallWaterFraction,
      claySolids: clay * (1 - wallWaterFraction),
      deposit: o.id,
    },
    o.id,
  );
}
export function cupFail(w: V7World, s: V7Stack, reason: string) {
  const c = s.waterCup;
  if (!c) return;
  const point = waterPoint(w, s),
    wall = Number(c.wallMass),
    fraction = Number(c.wallWaterFraction);
  waterSpill(w, point, Number(c.waterMl), 0, fraction, s.id);
  s.resource = 'wet-clay-fragments';
  s.physical = {
    unitMass: wall,
    unitWater: wall * fraction,
    unitSolids: wall * (1 - fraction),
  };
  s.processing = { ...s.processing, failedCup: v7Clone(c), failure: reason };
  s.owner = null;
  s.position = { ...point };
  delete s.waterCup;
  forestEvent(
    w,
    'water-cup-failed',
    'The unfired vessel failed; its water spilled and all remaining wall mass became actual wet fragments.',
    point,
    null,
    { item: s.id, wallMass: wall, reason },
    s.id,
  );
}
export function cupAdvance(w: V7World, p: V7Process) {
  for (const s of w.stacks) {
    const c = s.waterCup;
    if (!c) continue;
    const point = waterPoint(w, s);
    s.position = { ...point };
    if (Number(c.waterMl) > 0) {
      const ml = Math.min(1, Number(c.waterMl)),
        clay = Math.min(0.0001, Number(c.wallMass));
      c.waterMl = Number(c.waterMl) - ml;
      c.wallMass = Number(c.wallMass) - clay;
      c.leakedMl = Number(c.leakedMl) + ml;
      c.erodedClay = Number(c.erodedClay) + clay;
      waterSpill(w, point, ml, clay, Number(c.wallWaterFraction), s.id);
    }
    if (Number(c.wallMass) < 0.45 - 1e-9)
      cupFail(w, s, 'Remaining unfired wall mass fell below 0.45 kg.');
    else cupSync(s);
  }
  if (!w.stacks.some((s) => s.waterCup))
    w.processes = w.processes.filter((x) => x.id !== p.id);
  else p.next = w.tick + 1;
}
export function cupProcess(w: V7World) {
  if (!w.processes.some((p) => p.handler === 'open.water-cups'))
    w.processes.push({
      id: v7Id(w, 'process'),
      handler: 'open.water-cups',
      owner: null,
      object: null,
      next: w.tick + 1,
      revision: 'river-contact-water@1',
      data: {},
    });
}
export function cupContents(s: V7Stack): V7Data {
  if (!s.waterCup) throw new Error('An actual intact unfired cup is required.');
  return s.waterCup;
}

/** Movement rejection and physiological damage are not mechanical impact. */
export function cupImpacts(w: V7World) {
  for (const s of w.stacks) {
    if (!s.waterCup || !s.owner) continue;
    const impact = w.events.some(
      (e) =>
        e.tick === w.tick &&
        e.actor === s.owner &&
        e.type === 'injured' &&
        (e.data.cause === 'collision' ||
          e.data.collision === true ||
          w.objects.some((o) => o.id === e.target && o.kind === 'animal')),
    );
    if (impact)
      cupFail(w, s, 'Actual holder mechanical impact; fragile vessel dropped.');
  }
}
