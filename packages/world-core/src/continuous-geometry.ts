import type {
  V7Point,
  V7Spatial,
  V7World,
  V7Actor,
  V7Work,
} from './continuous-types.js';
import { v7RoundNumber } from './continuous-data.js';

export const v7Distance = (a: V7Point, b: V7Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function v7Local(point: V7Point, shape: V7Spatial): V7Point {
  const dx = point.x - shape.x,
    dy = point.y - shape.y;
  return {
    x: dx * Math.cos(shape.angle) + dy * Math.sin(shape.angle),
    y: -dx * Math.sin(shape.angle) + dy * Math.cos(shape.angle),
  };
}
export function v7ShapeDistance(point: V7Point, shape: V7Spatial): number {
  if (shape.shape.kind === 'circle')
    return Math.max(0, v7Distance(point, shape) - shape.shape.radius);
  const p = v7Local(point, shape);
  return Math.hypot(
    Math.max(0, Math.abs(p.x) - shape.shape.width / 2),
    Math.max(0, Math.abs(p.y) - shape.shape.height / 2),
  );
}
export function v7SegmentDistance(a: V7Point, b: V7Point, p: V7Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length),
        );
  return v7Distance({ x: a.x + t * dx, y: a.y + t * dy }, p);
}
/** Swept disc against a circle or an oriented rectangle; no frame-rate dependence. */
export function v7SegmentClear(
  a: V7Point,
  b: V7Point,
  radius: number,
  obstacles: V7Spatial[],
  work?: V7Work,
): boolean {
  for (const obstacle of obstacles) {
    work?.spend();
    if (!obstacle.solid) continue;
    if (obstacle.shape.kind === 'circle') {
      if (
        v7SegmentDistance(a, b, obstacle) <
        radius + obstacle.shape.radius - 1e-8
      )
        return false;
    } else {
      const p = v7Local(a, obstacle),
        q = v7Local(b, obstacle);
      const hx = obstacle.shape.width / 2 + radius,
        hy = obstacle.shape.height / 2 + radius;
      let low = 0,
        high = 1;
      for (const [start, delta, half] of [
        [p.x, q.x - p.x, hx],
        [p.y, q.y - p.y, hy],
      ]) {
        if (start === undefined || delta === undefined || half === undefined)
          throw new Error('Missing collision axis.');
        if (Math.abs(delta) < 1e-10) {
          if (Math.abs(start) >= half - 1e-8) {
            low = 2;
            break;
          }
        } else {
          const x = (-half - start) / delta,
            y = (half - start) / delta;
          low = Math.max(low, Math.min(x, y));
          high = Math.min(high, Math.max(x, y));
        }
      }
      if (low < high - 1e-8 && low <= 1 && high >= 0) return false;
    }
  }
  return true;
}
export function v7TerrainObstacles(
  world: V7World,
  known?: Set<string>,
): V7Spatial[] {
  const result: V7Spatial[] = [];
  world.terrain.forEach((row, y) => {
    Array.from(row).forEach((cell, x) => {
      if (cell === '~' && (!known || known.has(`${String(x)},${String(y)}`)))
        result.push({
          x: x + 0.5,
          y: y + 0.5,
          angle: 0,
          shape: { kind: 'rectangle', width: 1, height: 1 },
          solid: true,
          interaction: 0,
          entrances: [],
        });
    });
  });
  return result;
}
export function v7Obstacles(world: V7World, actor?: V7Actor): V7Spatial[] {
  return [
    ...v7TerrainObstacles(
      world,
      actor ? new Set(actor.memory.cells) : undefined,
    ),
    ...(actor ? actor.memory.objects.map((x) => x.object) : world.objects)
      .filter((x) => x.spatial.solid)
      .map((x) => x.spatial),
    ...(actor
      ? world.actors
          .filter(
            (other) =>
              other.id !== actor.id &&
              v7Distance(actor.position, other.position) <= world.config.vision,
          )
          .map((other): V7Spatial => ({
            ...other.position,
            angle: 0,
            shape: { kind: 'circle', radius: other.radius },
            solid: true,
            interaction: 0,
            entrances: [],
          }))
      : []),
  ];
}
export function v7Inside(world: V7World, p: V7Point, radius: number): boolean {
  return (
    p.x >= radius &&
    p.y >= radius &&
    p.x <= world.config.width - radius &&
    p.y <= world.config.height - radius
  );
}
export function v7Reach(actor: V7Actor, object: V7Spatial, extra = 0): boolean {
  if (object.entrances.length)
    return object.entrances.some(
      (p) =>
        v7Distance(actor.position, {
          x:
            object.x +
            p.x * Math.cos(object.angle) -
            p.y * Math.sin(object.angle),
          y:
            object.y +
            p.x * Math.sin(object.angle) +
            p.y * Math.cos(object.angle),
        }) <=
        actor.radius + object.interaction + extra,
    );
  return (
    v7ShapeDistance(actor.position, object) <=
    actor.radius + object.interaction + extra
  );
}
export function v7Approach(actor: V7Actor, object: V7Spatial): V7Point {
  if (v7Reach(actor, object)) return { ...actor.position };
  const near = (anchor: V7Point): V7Point => {
    const distance = v7Distance(actor.position, anchor),
      offset = Math.min(distance, (actor.radius + object.interaction) * 0.75);
    return {
      x: anchor.x + ((actor.position.x - anchor.x) / distance) * offset,
      y: anchor.y + ((actor.position.y - anchor.y) / distance) * offset,
    };
  };
  if (object.entrances.length)
    return near(
      object.entrances
        .map((p) => ({
          x:
            object.x +
            p.x * Math.cos(object.angle) -
            p.y * Math.sin(object.angle),
          y:
            object.y +
            p.x * Math.sin(object.angle) +
            p.y * Math.cos(object.angle),
        }))
        .sort(
          (a, b) =>
            v7Distance(actor.position, a) - v7Distance(actor.position, b),
        )[0] ?? object,
    );
  if (!object.solid) return near(object);
  const delta = v7Distance(actor.position, object) || 1;
  const extent =
    object.shape.kind === 'circle'
      ? object.shape.radius
      : Math.hypot(object.shape.width / 2, object.shape.height / 2);
  const reach =
    extent + actor.radius + Math.max(0.05, object.interaction * 0.65);
  return {
    x: object.x + ((actor.position.x - object.x) / delta) * reach,
    y: object.y + ((actor.position.y - object.y) / delta) * reach,
  };
}
/** A private-knowledge route mesh is a numerical planner, not a restriction on world positions. */
export function v7Route(
  world: V7World,
  actor: V7Actor,
  goal: V7Point,
  work: V7Work,
): V7Point[] {
  if (!v7Inside(world, goal, actor.radius))
    throw new Error('Destination is outside the traversable world boundary.');
  const obstacles = v7Obstacles(world, actor),
    start = actor.position;
  if (v7SegmentClear(start, goal, actor.radius, obstacles, work)) return [goal];
  const spacing = 0.5,
    width = Math.round(world.config.width / spacing),
    height = Math.round(world.config.height / spacing);
  const position = (id: number): V7Point => ({
    x: ((id % width) + 0.5) * spacing,
    y: (Math.floor(id / width) + 0.5) * spacing,
  });
  const open = new Set<number>(),
    scores = new Map<number, number>(),
    previous = new Map<number, number>();
  const sx = Math.floor(start.x / spacing),
    sy = Math.floor(start.y / spacing);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = sx + dx,
        y = sy + dy,
        id = y * width + x;
      if (
        x >= 0 &&
        y >= 0 &&
        x < width &&
        y < height &&
        v7Inside(world, position(id), actor.radius) &&
        v7SegmentClear(start, position(id), actor.radius, obstacles, work)
      ) {
        open.add(id);
        scores.set(id, v7Distance(start, position(id)));
      }
    }
  const closed = new Set<number>();
  while (open.size) {
    work.spend(open.size);
    let current = -1,
      best = Infinity;
    for (const id of open) {
      const score =
        (scores.get(id) ?? Infinity) + v7Distance(position(id), goal);
      if (score < best) {
        best = score;
        current = id;
      }
    }
    if (current < 0) break;
    open.delete(current);
    closed.add(current);
    const p = position(current);
    if (
      v7Distance(p, goal) < 1.5 &&
      v7SegmentClear(p, goal, actor.radius, obstacles, work)
    ) {
      const path = [goal, p];
      let parent = previous.get(current);
      while (parent !== undefined) {
        path.push(position(parent));
        parent = previous.get(parent);
      }
      path.reverse();
      const smooth: V7Point[] = [];
      let from = start;
      for (let i = 0; i < path.length;) {
        let j = path.length - 1;
        while (
          j > i &&
          !v7SegmentClear(from, path[j] ?? goal, actor.radius, obstacles, work)
        )
          j--;
        from = path[j] ?? goal;
        smooth.push(from);
        i = j + 1;
      }
      return smooth;
    }
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = (current % width) + dx,
          y = Math.floor(current / width) + dy,
          id = y * width + x;
        if (x < 0 || y < 0 || x >= width || y >= height || closed.has(id))
          continue;
        const q = position(id),
          score = (scores.get(current) ?? Infinity) + v7Distance(p, q);
        if (
          score >= (scores.get(id) ?? Infinity) ||
          !v7Inside(world, q, actor.radius) ||
          !v7SegmentClear(p, q, actor.radius, obstacles, work)
        )
          continue;
        scores.set(id, score);
        previous.set(id, current);
        open.add(id);
      }
  }
  throw new Error(
    'No route in currently observed terrain; choose another destination or investigate the obstruction.',
  );
}
export function v7Travel(
  start: V7Point,
  path: V7Point[],
  distance: number,
): { position: V7Point; path: V7Point[]; distance: number } {
  let p = { ...start },
    remaining = distance;
  const next = [...path];
  while (next.length && remaining > 1e-8) {
    const target = next[0];
    if (!target) break;
    const length = v7Distance(p, target);
    if (length <= remaining) {
      p = { ...target };
      next.shift();
      remaining -= length;
    } else {
      p = {
        x: v7RoundNumber(p.x + ((target.x - p.x) * remaining) / length),
        y: v7RoundNumber(p.y + ((target.y - p.y) * remaining) / length),
      };
      remaining = 0;
    }
  }
  return { position: p, path: next, distance: distance - remaining };
}

/** Exact static overlap for the supported footprint shapes; touching boundaries are permitted. */
export function v7ShapesOverlap(a: V7Spatial, b: V7Spatial): boolean {
  if (!(a.solid || a.reserved) || !(b.solid || b.reserved)) return false;
  if (a.shape.kind === 'circle' && b.shape.kind === 'circle')
    return v7Distance(a, b) < a.shape.radius + b.shape.radius - 1e-8;
  if (a.shape.kind === 'circle')
    return v7ShapeDistance(a, b) < a.shape.radius - 1e-8;
  if (b.shape.kind === 'circle')
    return v7ShapeDistance(b, a) < b.shape.radius - 1e-8;
  const axes = [a.angle, a.angle + Math.PI / 2, b.angle, b.angle + Math.PI / 2];
  for (const angle of axes) {
    const separation = Math.abs(
      (b.x - a.x) * Math.cos(angle) + (b.y - a.y) * Math.sin(angle),
    );
    const radiusA =
      (Math.abs(Math.cos(a.angle - angle)) * a.shape.width) / 2 +
      (Math.abs(Math.sin(a.angle - angle)) * a.shape.height) / 2;
    const radiusB =
      (Math.abs(Math.cos(b.angle - angle)) * b.shape.width) / 2 +
      (Math.abs(Math.sin(b.angle - angle)) * b.shape.height) / 2;
    if (separation >= radiusA + radiusB - 1e-8) return false;
  }
  return true;
}
