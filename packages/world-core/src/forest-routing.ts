import type {
  V7Actor,
  V7Data,
  V7Point,
  V7Spatial,
  V7Work,
  V7World,
} from './continuous-types.js';
import {
  V7ComputePause,
  v7Json,
  v7RoundNumber,
  v7Signature,
} from './continuous-data.js';
import {
  v7Distance,
  v7IndexedClear,
  v7Inside,
  v7Local,
  v7Route,
  v7SegmentClear,
  v7TerrainObstacles,
  v7Walls,
} from './continuous-geometry.js';
import { v7Observe } from './continuous-observation.js';

interface Obstacle {
  id: string;
  segment: string;
  spatial: V7Spatial;
}
export interface ForestRouteEvidence {
  tick: number;
  status: 'reachable' | 'blocked' | 'unknown';
  reasonCode: string;
  start: V7Point;
  goal: V7Point;
  path: V7Point[];
  partialEndpoint: V7Point | null;
  observedBlockers: string[];
  limitingSegments: string[];
  clearance: {
    start: number | null;
    goal: number | null;
    doorway: number | null;
  };
  geometryRevision: string;
  observationLimited: true;
  walls: { id: string; spatial: V7Spatial }[];
  attemptedDoorway: V7Point | null;
  note: string;
}
export class ForestRouteFailure extends Error {
  constructor(readonly evidence: ForestRouteEvidence) {
    super(
      `Navigation ${evidence.status}: ${evidence.reasonCode}. ${evidence.note}`,
    );
  }
}
class SearchLimit extends Error {}
function bounded(work: V7Work, limit: number): V7Work {
  return {
    remaining: limit,
    spend(amount = 1) {
      this.remaining -= amount;
      if (this.remaining < 0) throw new SearchLimit();
      work.spend(amount);
    },
  };
}
function globalPoint(s: V7Spatial, x: number, y: number): V7Point {
  return {
    x: s.x + x * Math.cos(s.angle) - y * Math.sin(s.angle),
    y: s.y + x * Math.sin(s.angle) + y * Math.cos(s.angle),
  };
}
function margin(p: V7Point, obstacle: V7Spatial, radius: number): number {
  if (obstacle.shape.kind === 'circle')
    return v7Distance(p, obstacle) - obstacle.shape.radius - radius;
  const local = v7Local(p, obstacle);
  return (
    Math.max(
      Math.abs(local.x) - obstacle.shape.width / 2,
      Math.abs(local.y) - obstacle.shape.height / 2,
    ) - radius
  );
}
function revision(value: unknown): string {
  let hash = 2166136261;
  for (const c of v7Signature(value))
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `observed-routing-v1:${(hash >>> 0).toString(16)}`;
}
export function forestRoute(
  world: V7World,
  actor: V7Actor,
  goal: V7Point,
  work: V7Work,
): ForestRouteEvidence {
  const observation = v7Observe(world, actor.id),
    cells = new Set(actor.memory.cells);
  for (const c of observation.terrain)
    cells.add(`${String(c.x)},${String(c.y)}`);
  const objects = new Map(
    actor.memory.objects.map((m) => [m.object.id, m.object]),
  );
  for (const o of observation.objects) objects.set(o.id, o);
  const seenIds = new Set(observation.actors.map((a) => a.id));
  const others = world.actors.filter((a) => seenIds.has(a.id));
  const obstacles: Obstacle[] = [
    ...v7TerrainObstacles(world, cells).map((spatial) => ({
      id: `terrain:${String(Math.floor(spatial.x))},${String(Math.floor(spatial.y))}`,
      segment: 'water',
      spatial,
    })),
    ...[...objects.values()].flatMap((o) =>
      v7Walls(o.spatial).map((spatial, i) => ({
        id: o.id,
        segment: `wall:${String(i)}`,
        spatial,
      })),
    ),
    ...others.map((a) => ({
      id: a.id,
      segment: 'body',
      spatial: {
        ...a.position,
        angle: 0,
        shape: { kind: 'circle' as const, radius: a.radius },
        solid: true,
        interaction: 0,
        entrances: [],
      },
    })),
  ];
  const known = (p: V7Point) =>
    cells.has(`${String(Math.floor(p.x))},${String(Math.floor(p.y))}`);
  const knownSegment = (a: V7Point, b: V7Point): boolean => {
    // Include exact grid crossings and interval midpoints; no unobserved cell is silently traversed.
    const cuts = [0, 1];
    for (const axis of ['x', 'y'] as const) {
      const delta = b[axis] - a[axis];
      if (!delta) continue;
      for (
        let v = Math.floor(Math.min(a[axis], b[axis])) + 1;
        v < Math.max(a[axis], b[axis]);
        v++
      )
        cuts.push((v - a[axis]) / delta);
    }
    cuts.sort((a, b) => a - b);
    return cuts.every((t, i) => {
      const mid = (t + (cuts[i + 1] ?? t)) / 2;
      return known({ x: a.x + (b.x - a.x) * mid, y: a.y + (b.y - a.y) * mid });
    });
  };
  const shapes = obstacles.map((o) => o.spatial),
    start = { ...actor.position };
  const directBlockers = obstacles.filter(
    (o) => !v7SegmentClear(start, goal, actor.radius, [o.spatial]),
  );
  const wallObjects = [...objects.values()].filter(
    (o) =>
      o.spatial.enclosure &&
      v7Distance(start, o.spatial) < world.config.vision + 3,
  );
  const clearance = (p: V7Point) =>
    obstacles.length
      ? v7RoundNumber(
          Math.min(...obstacles.map((o) => margin(p, o.spatial, actor.radius))),
        )
      : null;
  const e: ForestRouteEvidence = {
    tick: world.tick,
    status: 'unknown',
    reasonCode: 'search-incomplete',
    start,
    goal: { ...goal },
    path: [],
    partialEndpoint: null,
    observedBlockers: [...new Set(directBlockers.map((o) => o.id))],
    limitingSegments: directBlockers.map((o) => `${o.id}/${o.segment}`),
    clearance: {
      start: clearance(start),
      goal: known(goal) ? clearance(goal) : null,
      doorway: null,
    },
    geometryRevision: revision({ cells: [...cells].sort(), obstacles }),
    observationLimited: true,
    walls: obstacles
      .filter((o) => wallObjects.some((w) => w.id === o.id))
      .map((o) => ({ id: `${o.id}/${o.segment}`, spatial: o.spatial })),
    attemptedDoorway: null,
    note: 'Only observed or dated remembered geometry is used. Direct-segment blockers do not prove that every alternative route is blocked. Clearance is the signed margin under the authoritative inflated-shape collision rule.',
  };
  if (!v7Inside(world, goal, actor.radius)) {
    e.status = 'blocked';
    e.reasonCode = 'world-boundary';
    return e;
  }
  if (!v7SegmentClear(start, start, actor.radius, shapes)) {
    e.status = 'blocked';
    e.reasonCode = 'start-overlap';
    return e;
  }
  if (known(goal) && !v7SegmentClear(goal, goal, actor.radius, shapes)) {
    e.status = 'blocked';
    e.reasonCode = 'goal-overlap';
    return e;
  }
  // A covered sole-door cross-section proves blockage; search exhaustion alone never does.
  for (const object of wallObjects) {
    const s = object.spatial;
    if (!s.enclosure || s.shape.kind !== 'rectangle') continue;
    const p = v7Local(start, s),
      q = v7Local(goal, s),
      cut = s.shape.height / 2 - s.enclosure.wall - actor.radius + 0.001;
    if (
      p.y < cut === q.y < cut ||
      Math.abs(p.x) >= s.shape.width / 2 ||
      Math.abs(q.x) > s.shape.width / 2 + 1
    )
      continue;
    e.attemptedDoorway = globalPoint(s, 0, s.shape.height / 2);
    e.clearance.doorway = v7RoundNumber(s.enclosure.doorway - 2 * actor.radius);
    const lo = -s.enclosure.doorway / 2 + actor.radius,
      hi = s.enclosure.doorway / 2 - actor.radius;
    if (lo >= hi) {
      e.status = 'blocked';
      e.reasonCode = 'doorway-too-narrow';
      e.observedBlockers = [object.id];
      return e;
    }
    const intervals = others
      .flatMap((a) => {
        const local = v7Local(a.position, s),
          dy = Math.abs(local.y - cut),
          r = actor.radius + a.radius;
        if (dy >= r) return [];
        const span = Math.sqrt(r * r - dy * dy);
        return [{ lo: local.x - span, hi: local.x + span, id: a.id }];
      })
      .sort((a, b) => a.lo - b.lo);
    let end = lo;
    const blockers: string[] = [];
    for (const interval of intervals)
      if (interval.lo <= end && interval.hi > end) {
        end = interval.hi;
        blockers.push(interval.id);
      }
    if (end >= hi) {
      e.status = 'blocked';
      e.reasonCode = 'occupied-passage';
      e.observedBlockers = blockers;
      e.note +=
        ' The observed bodies cover the full usable doorway cross-section.';
      return e;
    }
  }
  const budget = bounded(work, 450_000),
    clear = v7IndexedClear(shapes, actor.radius, budget);
  const verified = (a: V7Point, b: V7Point) =>
    knownSegment(a, b) && clear(a, b);
  try {
    if (verified(start, goal)) {
      e.status = 'reachable';
      e.reasonCode = 'verified-route';
      e.path = [goal];
      return e;
    }
    // Preserve the existing broad route when it verifies against current observed actors and cells.
    try {
      const knowledge = { ...world, actors: [actor, ...others] },
        path = v7Route(knowledge, actor, goal, bounded(budget, 100_000));
      let from = start;
      if (
        path.every((p) => {
          const ok = verified(from, p);
          from = p;
          return ok;
        })
      ) {
        e.status = 'reachable';
        e.reasonCode = 'verified-route';
        e.path = path;
        return e;
      }
    } catch (error) {
      if (error instanceof V7ComputePause || !(error instanceof Error))
        throw error;
    }
    // Continuous obstacle corners and circumscribed body tangents avoid grid-center snapping.
    const nodes: V7Point[] = [start, goal],
      add = (p: V7Point) => {
        if (
          v7Distance(start, p) > world.config.vision + 2 ||
          !v7Inside(world, p, actor.radius) ||
          !known(p) ||
          !clear(p, p)
        )
          return;
        if (!nodes.some((n) => v7Distance(n, p) < 1e-5)) nodes.push(p);
      };
    for (const obstacle of obstacles) {
      const s = obstacle.spatial;
      if (v7Distance(start, s) > world.config.vision + 3) continue;
      if (s.shape.kind === 'rectangle') {
        const hx = s.shape.width / 2 + actor.radius + 0.001,
          hy = s.shape.height / 2 + actor.radius + 0.001;
        for (const x of [-hx, hx])
          for (const y of [-hy, hy]) add(globalPoint(s, x, y));
      } else {
        const r =
          (s.shape.radius + actor.radius + 0.002) / Math.cos(Math.PI / 16);
        for (let i = 0; i < 16; i++)
          add({
            x: s.x + r * Math.cos((i * Math.PI) / 8),
            y: s.y + r * Math.sin((i * Math.PI) / 8),
          });
      }
    }
    for (const object of wallObjects) {
      const s = object.spatial;
      if (s.shape.kind !== 'rectangle') continue;
      for (const y of [
        0,
        s.shape.height / 2 - actor.radius - 0.11,
        s.shape.height / 2 + actor.radius + 0.11,
      ])
        add(globalPoint(s, 0, y));
    }
    // Observed local frontier candidates support a bounded partial approach, never an invented destination.
    for (let y = Math.floor(start.y) - 5; y <= Math.floor(start.y) + 5; y++)
      for (let x = Math.floor(start.x) - 5; x <= Math.floor(start.x) + 5; x++)
        add({ x: x + 0.5, y: y + 0.5 });
    const node = (id: number): V7Point => {
      const p = nodes[id];
      if (!p) throw new Error('Missing routing node.');
      return p;
    };
    const distance = new Map<number, number>([[0, 0]]),
      previous = new Map<number, number>(),
      closed = new Set<number>();
    let best = 0;
    while (closed.size < nodes.length) {
      budget.spend(nodes.length);
      let selected = -1,
        score = Infinity;
      for (const [id, d] of distance)
        if (!closed.has(id) && d + v7Distance(node(id), goal) < score) {
          selected = id;
          score = d + v7Distance(node(id), goal);
        }
      if (selected < 0) break;
      closed.add(selected);
      const point = node(selected);
      if (v7Distance(point, goal) < v7Distance(node(best), goal))
        best = selected;
      if (selected === 1) {
        best = 1;
        break;
      }
      for (let i = 1; i < nodes.length; i++) {
        if (closed.has(i) || i === selected) continue;
        const next = node(i),
          d = (distance.get(selected) ?? 0) + v7Distance(point, next);
        if (d >= (distance.get(i) ?? Infinity) || !verified(point, next))
          continue;
        distance.set(i, d);
        previous.set(i, selected);
      }
    }
    if (best !== 0) {
      const path: V7Point[] = [];
      let id = best;
      while (id !== 0) {
        path.push(node(id));
        id = previous.get(id) ?? 0;
      }
      path.reverse();
      if (best === 1) {
        e.status = 'reachable';
        e.reasonCode = 'verified-continuous-route';
        e.path = path;
        return e;
      }
      if (v7Distance(start, goal) - v7Distance(node(best), goal) > 0.05) {
        e.path = path;
        e.partialEndpoint = node(best);
      }
    }
    e.reasonCode = known(goal) ? 'search-incomplete' : 'unobserved-terrain';
  } catch (error) {
    if (!(error instanceof SearchLimit)) throw error;
    e.reasonCode = 'bounded-search-exhausted';
    e.path = [];
    e.partialEndpoint = null;
  }
  return e;
}
export const forestRouteData = (e: ForestRouteEvidence): V7Data =>
  v7Json(e) as V7Data;
