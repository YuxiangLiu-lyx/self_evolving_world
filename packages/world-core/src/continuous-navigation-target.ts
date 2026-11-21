import type {
  V7Action,
  V7Actor,
  V7Point,
  V7World,
} from './continuous-types.js';
import { v7Number } from './continuous-data.js';
import { v7Approach, v7Distance } from './continuous-geometry.js';

/** Shared target semantics for movement and paid observation; no destination is substituted. */
export function v7NavigationTarget(
  world: V7World,
  actor: V7Actor,
  action: V7Action,
): {
  target: string;
  goal: V7Point;
  arrival: { description: string; target: string | null } | null;
} {
  const target =
    typeof action.args.target === 'string' ? action.args.target : '';
  if (!target)
    return {
      target,
      goal: {
        x: v7Number(action.args.x, 'destination x'),
        y: v7Number(action.args.y, 'destination y'),
      },
      arrival: null,
    };
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
  const goal = object
    ? v7Approach(actor, object.spatial)
    : { x: stack?.position.x ?? 0, y: stack?.position.y ?? 0 };
  const actual = world.objects.find((o) => o.id === target);
  const arrival =
    actual && object && v7Distance(actor.position, goal) < 0.05
      ? { description: `Arrived at ${target}.`, target }
      : stack &&
          v7Distance(actor.position, goal) <=
            actor.radius + world.config.interaction * 0.8
        ? {
            description: `Within pickup reach of ${stack.id}.`,
            target: stack.id,
          }
        : null;
  return { target, goal, arrival };
}
