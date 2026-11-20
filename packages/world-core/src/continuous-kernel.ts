import type {
  V7Action,
  V7Actor,
  V7Cursor,
  V7Data,
  V7Event,
  V7HandlerResult,
  V7Point,
  V7Registry,
  V7RoundResult,
  V7World,
  V7Work,
} from './continuous-types.js';
import {
  V7ComputePause,
  v7Clone,
  v7CanonicalNumbers,
  v7Json,
  v7Freeze,
  v7Id,
  v7Number,
  v7Signature,
  v7String,
  v7Validate,
  v7Work,
} from './continuous-data.js';
import {
  v7Approach,
  v7Reach,
  v7Distance,
  v7Inside,
  v7Obstacles,
  v7Route,
  v7SegmentClear,
  v7SegmentDistance,
  v7Travel,
  v7ShapesOverlap,
} from './continuous-geometry.js';
import { v7Load, v7Spend } from './continuous-base.js';
import { v7Remember } from './continuous-observation.js';
import { v7Physiology, v7Wellbeing } from './continuous-wellbeing.js';

export interface V7Review {
  actor: string;
  decision: 'reuse' | 'develop' | 'reject';
  ability: string | null;
  reason: string;
  specification: string;
  learning: number;
}
interface Proposal {
  actor: string;
  world: V7World;
  writes: string[];
  events: V7Event[];
  complete: boolean;
  error: string | null;
  moved: boolean;
  cursor: V7Cursor | null;
}
const collections = ['actors', 'objects', 'stacks', 'processes'] as const;
function changes(before: V7World, after: V7World): string[] {
  const keys: string[] = [];
  for (const collection of collections) {
    const old = new Map<string, unknown>(
      before[collection].map((x) => [x.id, x]),
    );
    const next = new Map<string, unknown>(
      after[collection].map((x) => [x.id, x]),
    );
    for (const id of new Set([...old.keys(), ...next.keys()]))
      if (
        v7Signature(old.get(id) ?? null) !== v7Signature(next.get(id) ?? null)
      )
        keys.push(`${collection}:${id}`);
  }
  for (const key of new Set([
    ...Object.keys(before.state),
    ...Object.keys(after.state),
  ]))
    if (
      v7Signature(before.state[key] ?? null) !==
      v7Signature(after.state[key] ?? null)
    )
      keys.push(`state:${key}`);
  return keys;
}
function mergeProposal(target: V7World, source: V7World, keys: string[]): void {
  for (const key of keys) {
    const split = key.indexOf(':'),
      collection = key.slice(0, split),
      id = key.slice(split + 1);
    if (collection === 'state') {
      const value = source.state[id];
      if (value === undefined)
        target.state = Object.fromEntries(
          Object.entries(target.state).filter(([key]) => key !== id),
        );
      else target.state[id] = v7Clone(value);
      continue;
    }
    // Keep collections separately typed; this is a generic identity transaction, not host-code dispatch.
    if (collection === 'actors')
      target.actors = replace(target.actors, source.actors, id);
    if (collection === 'objects')
      target.objects = replace(target.objects, source.objects, id);
    if (collection === 'stacks')
      target.stacks = replace(target.stacks, source.stacks, id);
    if (collection === 'processes')
      target.processes = replace(target.processes, source.processes, id);
  }
  target.nextIdentity = Math.max(target.nextIdentity, source.nextIdentity);
}
function replace<T extends { id: string }>(
  target: T[],
  source: T[],
  id: string,
): T[] {
  const value = source.find((x) => x.id === id),
    index = target.findIndex((x) => x.id === id);
  if (!value) return target.filter((x) => x.id !== id);
  if (index < 0) return [...target, v7Clone(value)];
  return target.map((x) => (x.id === id ? v7Clone(value) : x));
}
function navigation(
  world: V7World,
  actor: V7Actor,
  action: V7Action,
  cursor: V7Cursor | null,
  work: V7Work,
  emit: (
    type: string,
    description: string,
    data?: V7Data,
    target?: string | null,
  ) => void,
): V7HandlerResult {
  const target =
    typeof action.args.target === 'string' ? action.args.target : '';
  let goal: V7Point;
  if (target) {
    const object = actor.memory.objects.find(
      (m) => m.object.id === target,
    )?.object;
    const stack = actor.memory.stacks
      .filter(
        (m) =>
          m.stack.owner === null &&
          (m.stack.id === target || `resource:${m.stack.resource}` === target),
      )
      .sort(
        (a, b) =>
          v7Distance(actor.position, a.stack.position) -
          v7Distance(actor.position, b.stack.position),
      )[0]?.stack;
    if (!object && !stack)
      throw new Error(
        'Navigation target is not in personal observations or memory.',
      );
    goal = object
      ? v7Approach(actor, object.spatial)
      : { x: stack?.position.x ?? 0, y: stack?.position.y ?? 0 };
    const actual = world.objects.find((o) => o.id === target);
    if (actual && object && v7Distance(actor.position, goal) < 0.05) {
      emit('arrived', `Arrived at ${target}.`, { distance: 0 }, target);
      return { complete: true, writes: [] };
    }
    if (
      stack &&
      v7Distance(actor.position, goal) <=
        actor.radius + world.config.interaction * 0.8
    ) {
      emit(
        'arrived',
        `Within pickup reach of ${stack.id}.`,
        { distance: 0 },
        stack.id,
      );
      return { complete: true, writes: [] };
    }
  } else
    goal = {
      x: v7Number(action.args.x, 'destination x'),
      y: v7Number(action.args.y, 'destination y'),
    };
  const obstacleKey = v7Signature(v7Obstacles(world, actor));
  // Route from authoritative personal memory each tick; cache is diagnostic, never hidden replay state.
  const path = v7Route(world, actor, goal, work);
  if (v7Distance(actor.position, goal) < 0.03) {
    emit('arrived', 'Arrived at the selected position.', { distance: 0 });
    return { complete: true, writes: [] };
  }
  const waypoint = path[0];
  if (!waypoint) throw new Error('Navigation produced no reachable waypoint.');
  const traveled = v7Travel(
    actor.position,
    [waypoint],
    world.config.speed * world.config.dt,
  );
  if (
    !v7Inside(world, traveled.position, actor.radius) ||
    !v7SegmentClear(
      actor.position,
      traveled.position,
      actor.radius,
      v7Obstacles(world),
      work,
    )
  )
    throw new Error(
      'Movement blocked by an actual obstacle; update the route from current observations.',
    );
  const load = v7Load(world, actor),
    effort = traveled.distance * 2 * (1 + Math.max(0, load - 3) * 0.15);
  v7Spend(actor, effort);
  actor.angle = Math.atan2(
    traveled.position.y - actor.position.y,
    traveled.position.x - actor.position.x,
  );
  actor.position = traveled.position;
  if (cursor)
    cursor.navigation = {
      goal,
      obstacleKey,
      path: traveled.path.length ? path : path.slice(1),
    };
  const reachedObject = target
    ? world.objects.find((o) => o.id === target)
    : undefined;
  const complete =
    v7Distance(actor.position, goal) < 0.03 ||
    (reachedObject !== undefined && v7Reach(actor, reachedObject.spatial));
  emit(
    complete ? 'arrived' : 'moved',
    `${complete ? 'Arrived after traveling' : 'Traveled'} ${traveled.distance.toFixed(3)} distance; spent ${effort.toFixed(3)} energy.`,
    {
      distance: traveled.distance,
      effort,
      load,
      destinationX: goal.x,
      destinationY: goal.y,
    },
    target || null,
  );
  return { complete, writes: [] };
}
export function v7AssertWorld(world: V7World, registry?: V7Registry): void {
  v7Json(world.state);
  const ids = new Set<string>();
  for (const collection of collections)
    for (const entity of world[collection]) {
      if (ids.has(entity.id)) throw new Error('Duplicate persistent identity.');
      ids.add(entity.id);
    }
  for (const actor of world.actors) {
    if (
      !v7Inside(world, actor.position, actor.radius) ||
      !Object.values(actor.vitals).every(Number.isFinite) ||
      actor.vitals.health < 0 ||
      actor.vitals.health > 100 ||
      actor.vitals.satiety < 0 ||
      actor.vitals.satiety > 100 ||
      actor.vitals.energy < 0 ||
      actor.vitals.energy > world.config.energyCap
    )
      throw new Error('Invalid actor state.');
    if (
      !v7SegmentClear(
        actor.position,
        actor.position,
        actor.radius,
        v7Obstacles(world),
      )
    )
      throw new Error('An object would overlap an actor body.');
  }
  for (let i = 0; i < world.actors.length; i++)
    for (const b of world.actors.slice(i + 1)) {
      const a = world.actors[i];
      if (a && v7Distance(a.position, b.position) < a.radius + b.radius - 1e-8)
        throw new Error('Actor bodies overlap.');
    }
  for (const object of world.objects) {
    v7Json(object.data);
    for (const pkg of registry?.packages.filter((p) =>
      world.revisions.includes(`${p.id}@${String(p.version)}`),
    ) ?? []) {
      const schema = pkg.stateSchemas?.[object.kind];
      if (schema) v7Validate(schema, object.data, object.id);
    }
    const s = object.spatial;
    if (
      ![
        s.x,
        s.y,
        s.angle,
        s.interaction,
        ...(s.shape.kind === 'circle'
          ? [s.shape.radius]
          : [s.shape.width, s.shape.height]),
      ].every(Number.isFinite) ||
      s.interaction < 0 ||
      (s.shape.kind === 'circle'
        ? s.shape.radius <= 0
        : s.shape.width <= 0 || s.shape.height <= 0) ||
      s.entrances.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
    )
      throw new Error('Invalid object geometry.');
  }
  const solids = world.objects.filter(
    (o) => o.spatial.solid || o.spatial.reserved,
  );
  for (let i = 0; i < solids.length; i++)
    for (const other of solids.slice(i + 1)) {
      const object = solids[i];
      if (object && v7ShapesOverlap(object.spatial, other.spatial))
        throw new Error('Solid object footprints overlap.');
    }
  for (const stack of world.stacks)
    if (
      !Number.isSafeInteger(stack.quantity) ||
      stack.quantity < 1 ||
      !world.resources.some((r) => r.id === stack.resource) ||
      (stack.owner !== null && !world.actors.some((a) => a.id === stack.owner))
    )
      throw new Error('Invalid material identity, quantity or ownership.');
  if (JSON.stringify(world).length * 2 > world.config.computation.stateBytes)
    throw new V7ComputePause(
      'State-memory protection reached; persist and pause instead of deleting objects.',
    );
}
/** Each intent evaluates against the same start state. Conflicting writes and swept actor collisions all reject. */
export function v7Step(
  world: V7World,
  actions: Record<string, V7Action>,
  registry: V7Registry,
  cursors: Record<string, V7Cursor> = {},
  reviews: V7Review[] = [],
): V7RoundResult {
  const work = v7Work(world.config.computation.workPerRound),
    proposals: Proposal[] = [],
    outcomes: V7RoundResult['outcomes'] = {};
  try {
    for (const original of world.actors.filter((a) => a.vitals.health > 0)) {
      work.spend();
      const actorId = original.id,
        action = actions[actorId];
      if (!action)
        throw new Error(`Missing simultaneous action for ${actorId}.`);
      const trial = v7Clone(world);
      trial.tick += 1;
      trial.time += world.config.dt;
      trial.events = [];
      trial.identityScope = actorId;
      const actor = trial.actors.find((a) => a.id === actorId);
      if (!actor) throw new Error('Missing action actor.');
      const cursor = cursors[actorId] ? v7Clone(cursors[actorId]) : null;
      const emit = (
        type: string,
        description: string,
        data: V7Data = {},
        target: string | null = null,
      ): void => {
        trial.events.push({
          id: v7Id(trial, 'event'),
          tick: trial.tick,
          actor: actorId,
          type,
          interface: action.interface,
          success: true,
          description,
          position: { ...actor.position },
          target,
          data,
        });
      };
      try {
        let result: V7HandlerResult;
        if (actor.learning) {
          actor.learning.remaining -= 1;
          const ability = actor.learning.ability;
          if (actor.learning.remaining <= 0) {
            actor.mastered.push(ability);
            actor.learning = null;
            emit('mastered', `Mastered ${ability} through actual study.`, {
              ability,
            });
          } else
            emit(
              'learning',
              `Studying ${ability}; ${String(actor.learning.remaining)} rounds remain.`,
              { ability, remaining: actor.learning.remaining },
            );
          result = { complete: false, writes: [] };
        } else {
          const ability = trial.abilities.find(
            (a) => a.id === action.interface,
          );
          if (!ability)
            throw new Error(
              'Interface is not implemented in this world revision; request functional development.',
            );
          if (!actor.mastered.includes(ability.id))
            throw new Error(
              'Interface exists, but this actor has not mastered it.',
            );
          v7Validate(ability.parameters, action.args);
          if (ability.handler === 'kernel.navigate')
            result = navigation(trial, actor, action, cursor, work, emit);
          else if (
            ability.handler === 'kernel.request' ||
            ability.handler === 'kernel.learn'
          ) {
            const review = reviews.find((r) => r.actor === actorId);
            let target: string;
            if (ability.handler === 'kernel.request') {
              emit(
                'requested',
                v7String(action.args.function, 'requested function'),
                { request: action.args },
              );
              if (!review || review.decision === 'develop')
                throw new Error(
                  'Unresolved development barrier; no round may execute.',
                );
              if (review.decision === 'reject' || !review.ability) {
                emit('review-rejected', review.reason);
                result = { complete: true, writes: [] };
                proposals.push({
                  actor: actorId,
                  world: trial,
                  writes: changes(world, trial),
                  events: trial.events,
                  complete: result.complete,
                  error: null,
                  moved: false,
                  cursor,
                });
                continue;
              }
              target = review.ability;
            } else target = v7String(action.args.ability, 'ability');
            const learned = trial.abilities.find((a) => a.id === target);
            if (
              !learned ||
              learned.prerequisites.some((id) => !actor.mastered.includes(id))
            )
              throw new Error(
                'Unimplemented ability or missing individual prerequisites.',
              );
            if (!actor.mastered.includes(target)) {
              if (learned.learning <= 1) {
                actor.mastered.push(target);
                emit(
                  'mastered',
                  `Mastered ${target} after one round of study.`,
                  { ability: target },
                );
              } else {
                actor.learning = {
                  ability: target,
                  remaining: learned.learning - 1,
                  startedAt: trial.tick,
                };
                emit(
                  'learning',
                  `Started ${target}; ${String(learned.learning - 1)} study rounds remain.`,
                  { ability: target, remaining: learned.learning - 1 },
                );
              }
            } else
              emit(
                'already-mastered',
                `${target} is already mastered; no new reward.`,
              );
            result = { complete: true, writes: [] };
          } else {
            const handler = registry.handlers[ability.handler];
            if (!handler) throw new Error('Missing versioned implementation.');
            result = handler({ world: trial, actor, action, work, emit });
            for (const old of world.actors) {
              const after = trial.actors.find((a) => a.id === old.id);
              if (
                !after ||
                v7Signature({
                  wellbeing: after.wellbeing,
                  mastered: after.mastered,
                  learning: after.learning,
                }) !==
                  v7Signature({
                    wellbeing: old.wellbeing,
                    mastered: old.mastered,
                    learning: old.learning,
                  })
              )
                throw new Error(
                  'Action implementations cannot rewrite protected wellbeing or individual learning accounts.',
                );
            }
          }
        }
        for (const field of [
          'config',
          'terrain',
          'abilities',
          'resources',
          'satisfaction',
          'revisions',
        ] as const)
          if (v7Signature(trial[field]) !== v7Signature(world[field]))
            throw new Error(
              'Runtime actions cannot change registered rules or protected run policy.',
            );
        trial.stacks = trial.stacks.filter((s) => s.quantity > 0);
        v7AssertWorld(trial, registry);
        proposals.push({
          actor: actorId,
          world: trial,
          writes: [
            ...new Set([
              ...changes(world, trial),
              ...result.writes.map((key) => `lock:${key}`),
            ]),
          ],
          events: trial.events,
          complete: result.complete,
          error: null,
          moved: v7Distance(original.position, actor.position) > 1e-8,
          cursor,
        });
      } catch (error) {
        if (error instanceof V7ComputePause) throw error;
        proposals.push({
          actor: actorId,
          world: trial,
          writes: [],
          events: [],
          complete: true,
          error: error instanceof Error ? error.message : 'Execution failed.',
          moved: false,
          cursor: null,
        });
      }
    }
    const conflicts = new Set<string>();
    for (let i = 0; i < proposals.length; i++)
      for (let j = i + 1; j < proposals.length; j++) {
        const a = proposals[i],
          b = proposals[j];
        if (!a || !b || a.error || b.error) continue;
        const aObjects = a.world.objects.filter((o) =>
            a.writes.includes(`objects:${o.id}`),
          ),
          bObjects = b.world.objects.filter((o) =>
            b.writes.includes(`objects:${o.id}`),
          );
        if (
          aObjects.some((object) =>
            bObjects.some(
              (other) =>
                object.id !== other.id &&
                v7ShapesOverlap(object.spatial, other.spatial),
            ),
          )
        ) {
          conflicts.add(a.actor);
          conflicts.add(b.actor);
        }
        if (a.writes.some((key) => b.writes.includes(key))) {
          conflicts.add(a.actor);
          conflicts.add(b.actor);
        }
        const aa = world.actors.find((x) => x.id === a.actor),
          bb = world.actors.find((x) => x.id === b.actor),
          an = a.world.actors.find((x) => x.id === a.actor),
          bn = b.world.actors.find((x) => x.id === b.actor);
        if (aa && bb && an && bn && (a.moved || b.moved)) {
          const relativeStart = {
              x: aa.position.x - bb.position.x,
              y: aa.position.y - bb.position.y,
            },
            relativeEnd = {
              x: an.position.x - bn.position.x,
              y: an.position.y - bn.position.y,
            };
          if (
            v7SegmentDistance(relativeStart, relativeEnd, { x: 0, y: 0 }) <
            aa.radius + bb.radius - 1e-8
          ) {
            if (a.moved) conflicts.add(a.actor);
            if (b.moved) conflicts.add(b.actor);
          }
        }
      }
    for (const mover of proposals.filter((p) => p.moved && !p.error)) {
      const before = world.actors.find((a) => a.id === mover.actor),
        after = mover.world.actors.find((a) => a.id === mover.actor);
      if (!before || !after) continue;
      for (const other of proposals.filter(
        (p) => p.actor !== mover.actor && !p.error,
      )) {
        if (
          !v7SegmentClear(
            before.position,
            after.position,
            before.radius,
            v7Obstacles(other.world),
            work,
          )
        ) {
          conflicts.add(mover.actor);
          conflicts.add(other.actor);
        }
      }
    }
    // Rejected movers remain at their start positions; propagate conservative blocking until stable.
    let altered = true;
    while (altered) {
      altered = false;
      for (const p of proposals.filter(
        (p) => p.moved && !p.error && !conflicts.has(p.actor),
      )) {
        const before = world.actors.find((a) => a.id === p.actor),
          after = p.world.actors.find((a) => a.id === p.actor);
        if (!before || !after) continue;
        for (const other of world.actors.filter(
          (a) =>
            a.id !== p.actor &&
            (conflicts.has(a.id) ||
              proposals.some((q) => q.actor === a.id && q.error)),
        ))
          if (
            v7SegmentDistance(before.position, after.position, other.position) <
            before.radius + other.radius - 1e-8
          ) {
            conflicts.add(p.actor);
            altered = true;
            break;
          }
      }
    }
    const next = v7Clone(world);
    next.tick += 1;
    next.time += world.config.dt;
    next.events = [];
    next.identityScope = 'world';
    for (const p of proposals) {
      const error =
        p.error ??
        (conflicts.has(p.actor)
          ? 'Simultaneous resource or swept-body conflict; all conflicting actions were rejected.'
          : null);
      outcomes[p.actor] = {
        complete: error ? true : p.complete,
        success: !error,
        reason: error ?? p.events.at(-1)?.description ?? 'Action executed.',
      };
      if (error)
        next.events.push({
          id: v7Id(next, 'event'),
          tick: next.tick,
          actor: p.actor,
          type: 'failed',
          interface: actions[p.actor]?.interface ?? null,
          success: false,
          description: error,
          position:
            world.actors.find((a) => a.id === p.actor)?.position ?? null,
          target: null,
          data: {},
        });
      else {
        mergeProposal(next, p.world, p.writes);
        next.events.push(...p.events);
      }
    }
    const protectedProcessState = v7Signature({
      config: next.config,
      terrain: next.terrain,
      abilities: next.abilities,
      resources: next.resources,
      satisfaction: next.satisfaction,
      revisions: next.revisions,
      accounts: next.actors.map((a) => ({
        id: a.id,
        mastered: a.mastered,
        learning: a.learning,
        wellbeing: a.wellbeing,
      })),
    });
    for (const process of [...next.processes])
      if (next.tick >= process.next) {
        work.spend();
        const handler = registry.processes[process.handler];
        if (!handler)
          throw new Error('Missing registered process implementation.');
        handler(next, process, work);
      }
    if (
      protectedProcessState !==
      v7Signature({
        config: next.config,
        terrain: next.terrain,
        abilities: next.abilities,
        resources: next.resources,
        satisfaction: next.satisfaction,
        revisions: next.revisions,
        accounts: next.actors.map((a) => ({
          id: a.id,
          mastered: a.mastered,
          learning: a.learning,
          wellbeing: a.wellbeing,
        })),
      })
    )
      throw new Error(
        'Processes cannot rewrite protected rules, learning or wellbeing accounts.',
      );
    for (const actor of next.actors) v7Physiology(next, actor);
    v7Wellbeing(next);
    v7Remember(next);
    v7AssertWorld(next, registry);
    for (const p of proposals)
      if (!p.error && !conflicts.has(p.actor) && p.cursor && cursors[p.actor])
        cursors[p.actor] = p.cursor;
    return {
      world: v7Freeze(v7CanonicalNumbers(next)),
      outcomes,
      paused: null,
    };
  } catch (error) {
    if (error instanceof V7ComputePause)
      return { world, outcomes: {}, paused: error.message };
    throw error;
  }
}
