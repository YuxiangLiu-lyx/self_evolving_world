import { openProjects } from './open-projects.js';
import { forestBoundOperation } from './forest-operations.js';
import { forestResolveAction } from './forest-references.js';
import type {
  V7Action,
  V7Condition,
  V7Cursor,
  V7Plan,
  V7TaskStep,
  V7World,
  V7RoundResult,
} from './continuous-types.js';
import {
  V7ComputePause,
  v7Clone,
  v7Json,
  v7Number,
  v7Record,
  v7String,
  v7Signature,
} from './continuous-data.js';
import { v7Distance, v7Reach } from './continuous-geometry.js';
import {
  v7Condition,
  v7ConditionContext,
  v7Observe,
} from './continuous-observation.js';

function condition(value: unknown): V7Condition | null {
  if (value === null) return null;
  const c = v7Record(value),
    path = v7String(c.path, 'condition path');
  if (
    !/^(self\.(health|satiety|energy|temperature|happiness|inventory\.[a-z0-9-]+)|tick)$/.test(
      path,
    )
  )
    throw new Error('Conditions must use registered personal state paths.');
  if (
    !['lt', 'lte', 'gt', 'gte', 'eq', 'neq'].includes(String(c.comparison)) ||
    !['number', 'boolean', 'string'].includes(typeof c.value)
  )
    throw new Error('Invalid condition.');
  return {
    path,
    comparison: c.comparison as V7Condition['comparison'],
    value: c.value as V7Condition['value'],
  };
}
function repeat(value: unknown): number {
  const result = v7Number(value, 'task repeat count', 1);
  if (!Number.isSafeInteger(result))
    throw new Error('Task repeats must be safe integers.');
  return result;
}
export function v7ParsePlan(
  value: unknown,
  eventTypes?: readonly string[],
  allowProjects = false,
): V7Plan {
  const p = v7Record(value);
  if (
    Object.keys(p).sort().join(',') !==
    (allowProjects && 'projects' in p
      ? 'intention,interrupts,notes,preferences,projects,repeat,steps,until'
      : 'intention,interrupts,notes,preferences,repeat,steps,until')
  )
    throw new Error('Expected the registered task plan shape.');
  if (!Array.isArray(p.steps) || !p.steps.length)
    throw new Error('A decision needs at least one explicit action.');
  const strings = (v: unknown): string[] => {
    if (!Array.isArray(v) || v.some((x: unknown) => typeof x !== 'string'))
      throw new Error('Expected text records.');
    return v as string[];
  };
  if (eventTypes && strings(p.interrupts).some((e) => !eventTypes.includes(e)))
    throw new Error(
      'Unknown interrupt event; use the registered event catalogue.',
    );
  const steps: V7TaskStep[] = p.steps.map((raw: unknown) => {
    const s = v7Record(raw),
      a = v7Record(s.action),
      args = v7Json(a.args);
    if (!args || typeof args !== 'object' || Array.isArray(args))
      throw new Error('Action arguments must be an object.');
    return {
      action: { interface: v7String(a.interface, 'interface'), args },
      repeat: repeat(s.repeat),
      until: condition(s.until),
      guard: condition(s.guard),
    };
  });
  return {
    intention: typeof p.intention === 'string' ? p.intention : '',
    steps,
    repeat: repeat(p.repeat),
    until: condition(p.until),
    interrupts: strings(p.interrupts),
    notes: strings(p.notes),
    preferences: strings(p.preferences),
    ...(allowProjects && p.projects !== undefined
      ? { projects: openProjects(p.projects) }
      : {}),
  };
}
export function v7Cursor(plan: V7Plan, tick: number): V7Cursor {
  return {
    plan: v7Clone(plan),
    step: 0,
    repetition: 0,
    cycle: 0,
    startedAt: tick,
    navigation: null,
    reason: null,
  };
}
function advance(cursor: V7Cursor): void {
  cursor.repetition += 1;
  if (cursor.repetition >= (cursor.plan.steps[cursor.step]?.repeat ?? 1)) {
    cursor.step += 1;
    cursor.repetition = 0;
  }
  if (cursor.step >= cursor.plan.steps.length) {
    cursor.step = 0;
    cursor.cycle += 1;
  }
  cursor.navigation = null;
  if (cursor.operation !== undefined) cursor.operation = null;
}
export function v7TaskAction(
  world: V7World,
  actorId: string,
  cursor: V7Cursor,
): V7Action | null {
  const actor = world.actors.find((a) => a.id === actorId);
  if (!actor || actor.vitals.health <= 0) return null;
  if (actor.learning) return { interface: 'wait', args: {} };
  if (cursor.reason) return null;
  const context = v7ConditionContext(world, actor);
  let examined = 0;
  while (cursor.cycle < cursor.plan.repeat) {
    if (++examined > world.config.computation.workPerRound)
      throw new V7ComputePause(
        'Conditional task evaluation exhausted the computation budget.',
      );
    if (v7Condition(cursor.plan.until, context)) {
      cursor.reason = 'The actor-defined plan condition is satisfied.';
      return null;
    }
    const step = cursor.plan.steps[cursor.step];
    if (!step) throw new Error('Missing task step.');
    if (step.guard && !v7Condition(step.guard, context)) {
      cursor.reason = 'The actor-defined guard no longer holds.';
      return null;
    }
    if (v7Condition(step.until, context)) {
      cursor.repetition = step.repeat - 1;
      advance(cursor);
      continue;
    }
    if (world.state.operationContinuity === 1)
      cursor.operation = forestBoundOperation(world, actor, step.action);
    if (
      world.config.forest &&
      cursor.startedAt < world.tick &&
      !cursor.operation
    ) {
      const problem = v7ReferenceIssue(world, actorId, step.action);
      if (problem) {
        cursor.reason = problem;
        return null;
      }
    }
    return step.action;
  }
  cursor.reason = 'The actor-defined task is complete.';
  return null;
}
export function v7FinishTasks(
  before: V7World,
  result: V7RoundResult,
  cursors: Record<string, V7Cursor>,
): void {
  if (result.paused) return;
  for (const actor of result.world.actors) {
    const cursor = cursors[actor.id],
      old = before.actors.find((a) => a.id === actor.id),
      outcome = result.outcomes[actor.id];
    if (!cursor || !old || !outcome) continue;
    if (
      result.world.config.forest &&
      result.world.events.some(
        (e) =>
          (result.world.config.experience &&
            e.type === 'message' &&
            e.target === actor.id &&
            e.data.urgency === 'urgent' &&
            (e.data.subject === actor.id ||
              e.data.subject === cursor.operation?.action.args.target)) ||
          ((e.actor === actor.id || e.target === actor.id) &&
            ([
              'died',
              'respawned',
              'mastered',
              ...(!result.world.config.experience ? ['message'] : []),
              'animal-alert',
              'season-changed',
              'spoiled',
              'shelter-protection-expired',
            ].includes(e.type) ||
              (e.type === 'injured' &&
                (old.vitals.health - actor.vitals.health >= 8 ||
                  Math.floor(old.vitals.health / 20) !==
                    Math.floor(actor.vitals.health / 20) ||
                  !before.events.some(
                    (p) =>
                      p.actor === actor.id &&
                      p.type === 'injured' &&
                      p.description === e.description,
                  ))))),
      )
    ) {
      if (
        result.world.config.experience &&
        result.world.events.some(
          (e) => e.actor === actor.id && ['died', 'respawned'].includes(e.type),
        )
      )
        cursor.operation = null;
      cursor.reason =
        'Important observed change requires a fresh decision: ' +
        result.world.events
          .filter((e) => e.actor === actor.id || e.target === actor.id)
          .map((e) => e.type)
          .join(', ');
      cursor.navigation = null;
      continue;
    }
    if (!outcome.success) cursor.reason = outcome.reason;
    else if (
      result.world.events.some(
        (e) => e.actor === actor.id && e.type === 'mastered',
      )
    )
      cursor.reason =
        'A studied interface is now mastered; the available action catalogue changed.';
    else if (!old.learning && outcome.complete) advance(cursor);
    if (
      (old.vitals.satiety > 8 && actor.vitals.satiety <= 8) ||
      (old.vitals.health > 60 && actor.vitals.health <= 60) ||
      (old.vitals.health > 20 && actor.vitals.health <= 20) ||
      (old.vitals.energy > 1 && actor.vitals.energy <= 1) ||
      (Math.abs(old.vitals.temperature - 22) < 10 &&
        Math.abs(actor.vitals.temperature - 22) >= 10)
    )
      cursor.reason = 'New urgent physiological risk requires a decision.';
    if (
      result.world.events.some(
        (e) =>
          cursor.plan.interrupts.includes(e.type) &&
          (e.actor === actor.id || e.target === actor.id) &&
          (!result.world.config.experience ||
            e.type !== 'message' ||
            (e.target === actor.id &&
              e.data.urgency === 'urgent' &&
              (e.data.subject === actor.id ||
                e.data.subject === cursor.operation?.action.args.target))),
      )
    )
      cursor.reason = 'An actor-selected interrupt event occurred.';
  }
}

/** Checks only personally observable references; it never selects a replacement strategy. */
export function v7ReferenceIssue(
  world: V7World,
  id: string,
  action: V7Action,
): string | null {
  if (world.config.experience) {
    const actor = world.actors.find((a) => a.id === id);
    if (!actor) return 'Unknown actor.';
    try {
      forestResolveAction(world, actor, action);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Invalid reference.';
    }
  }
  const observation = v7Observe(world, id),
    actor = observation.self;
  const target = action.args.target,
    quantity = Number(action.args.quantity ?? 1);
  if (['eat', 'drop', 'give'].includes(action.interface)) {
    const stacks = observation.stacks.filter(
      (s) =>
        !s.reservedFor &&
        s.owner === id &&
        (s.id === target || `resource:${s.resource}` === target),
    );
    if (stacks.reduce((n, s) => n + s.quantity, 0) < quantity)
      return 'The required owned quantity no longer exists.';
  }
  if (action.interface === 'gather') {
    const object = observation.objects.find((o) => o.id === target);
    if (
      !object ||
      !v7Reach(actor, object.spatial) ||
      Number(object.data.stock) < quantity
    )
      return 'The source, position or available quantity changed; inspect current facts.';
  }
  if (action.interface === 'pickup') {
    if (
      !observation.stacks.some(
        (s) =>
          s.owner === null &&
          (s.id === target || `resource:${s.resource}` === target) &&
          s.quantity >= quantity &&
          v7Distance(actor.position, s.position) <=
            actor.radius + world.config.interaction,
      )
    )
      return 'The required ground stack or pickup position is no longer available.';
  }
  if (action.interface === 'navigate' && typeof target === 'string' && target) {
    const remembered = actor.memory.objects.find(
      (m) => m.object.id === target,
    )?.object;
    const stack = actor.memory.stacks.find(
      (m) =>
        m.stack.owner === null &&
        (m.stack.id === target || `resource:${m.stack.resource}` === target),
    )?.stack;
    if (!remembered && !stack)
      return 'The navigation target is no longer in observed or dated remembered state.';
  }
  return null;
}
/** Restore accepted plan boundaries before replaying actual actions; never choose a new strategy. */
export function v7PrepareReplayCursors(
  world: V7World,
  recorded: Record<string, V7Cursor>,
  cursors: Record<string, V7Cursor>,
): void {
  for (const [id, saved] of Object.entries(recorded)) {
    const previous = cursors[id];
    if (
      !previous ||
      previous.startedAt !== saved.startedAt ||
      v7Signature(previous.plan) !== v7Signature(saved.plan)
    )
      cursors[id] = v7Cursor(saved.plan, saved.startedAt);
    const cursor = cursors[id];
    if (cursor) v7TaskAction(world, id, cursor);
  }
}
