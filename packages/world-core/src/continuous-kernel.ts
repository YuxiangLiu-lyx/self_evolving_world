import { materialValidate } from './material-lots.js';
import { collectiveAfterRound, collectiveAssert } from './collective-social.js';
import { openPractice } from './open-experience.js';
import { openConditions } from './open-physical.js';
import { recuperationAfterRound } from './forest-recuperation.js';
import { canopyAfterRound } from './forest-canopy.js';
import { canopyEnvironment } from './forest-canopy-environment.js';
import {
  forestBoundOperation,
  forestSaveOperation,
} from './forest-operations.js';
import { willowAfterRound } from './forest-willow.js';
import { fireEnvironment } from './forest-fire-environment.js';
import { fireAfterRound } from './forest-fire.js';
import { forestExperienceAfterRound } from './forest-experience.js';
import { insulationAfterRound } from './forest-insulation.js';
import {
  forestResolveAction,
  ForestReferenceError,
} from './forest-references.js';
import { v7NavigationTarget } from './continuous-navigation-target.js';
import {
  ForestRouteFailure,
  forestRoute,
  forestRouteData,
} from './forest-routing.js';
import { routeInspectionAfterRound } from './forest-route-inspection.js';
import { warmingAfterPhysiology } from './forest-warming.js';
import {
  normalizeFoodAccounting,
  foodTenths,
} from './forest-food-accounting.js';
import { foodAssessmentAfterRound } from './forest-food-assessment.js';
import { shelterAfterRound } from './forest-shelter.js';
import { forestPerception } from './forest-perception.js';
import { forestEnvironment } from './forest-environment.js';
import { forestLives } from './forest-lives.js';
import type {
  V7Action,
  V7Actor,
  V7Cursor,
  V7Data,
  V7Event,
  V7HandlerResult,
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
  v7Signature,
  v7Equivalent,
  v7String,
  v7Validate,
  v7Work,
} from './continuous-data.js';
import {
  v7Reach,
  v7Distance,
  v7ShapeDistance,
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
  experienceReview?: string;
  visualReview?: string;
  learning: number;
}
interface Proposal {
  actor: string;
  world: V7World;
  writes: string[];
  events: V7Event[];
  complete: boolean;
  error: string | null;
  diagnostic?: V7Data;
  moved: boolean;
  cursor: V7Cursor | null;
}
function protectedProcessAccounts(state: V7World): string {
  return v7Signature({
    config: state.config,
    terrain: state.terrain,
    abilities: state.abilities,
    resources: state.resources,
    satisfaction: state.satisfaction,
    revisions: state.revisions,
    accounts: state.actors.map((a) => ({
      id: a.id,
      mastered: a.mastered,
      learning: a.learning,
      wellbeing: a.wellbeing,
      ...(state.config.experience ? { mental: a.experience?.mental } : {}),
      life: a.life ?? null,
    })),
  });
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
      if (!v7Equivalent(old.get(id) ?? null, next.get(id) ?? null))
        keys.push(`${collection}:${id}`);
  }
  for (const key of new Set([
    ...Object.keys(before.state),
    ...Object.keys(after.state),
  ]))
    if (!v7Equivalent(before.state[key] ?? null, after.state[key] ?? null))
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
  const { target, goal, arrival } = v7NavigationTarget(world, actor, action);
  if (arrival) {
    emit('arrived', arrival.description, { distance: 0 }, arrival.target);
    return { complete: true, writes: [] };
  }
  const obstacleKey = v7Signature(v7Obstacles(world, actor));
  // Route from authoritative personal memory each tick; cache is diagnostic, never hidden replay state.
  const diagnostic =
    world.state.forestRouting === 1
      ? forestRoute(world, actor, goal, work)
      : null;
  if (
    diagnostic &&
    !diagnostic.path.length &&
    v7Distance(actor.position, goal) >= 0.03
  )
    throw new ForestRouteFailure(diagnostic);
  const path = diagnostic?.path ?? v7Route(world, actor, goal, work);
  if (v7Distance(actor.position, goal) < 0.03) {
    emit('arrived', 'Arrived at the selected position.', { distance: 0 });
    return { complete: true, writes: [] };
  }
  const waypoint = path[0];
  if (!waypoint) throw new Error('Navigation produced no reachable waypoint.');
  const traveled = v7Travel(
    actor.position,
    [waypoint],
    (world.config.speed * world.config.dt) /
      (world.config.development
        ? openConditions(world, actor.position).travelFactor
        : 1),
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
    effort =
      traveled.distance *
      (world.config.development
        ? openConditions(world, actor.position).travelFactor
        : 1) *
      2 *
      (1 +
        Math.max(0, load - 3) *
          0.15 *
          (world.config.experience?.carryingScale ?? 1));
  v7Spend(actor, effort);
  actor.angle = Math.atan2(
    traveled.position.y - actor.position.y,
    traveled.position.x - actor.position.x,
  );
  actor.position = traveled.position;
  if (cursor)
    cursor.navigation = {
      goal,
      obstacleKey: diagnostic?.geometryRevision ?? obstacleKey,
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
  collectiveAssert(world);
  v7Json(world.state);
  const ids = new Set<string>();
  for (const collection of collections)
    for (const entity of world[collection]) {
      if (ids.has(entity.id)) throw new Error('Duplicate persistent identity.');
      ids.add(entity.id);
    }
  for (const actor of world.actors) {
    if (world.config.experience) {
      const state = actor.experience;
      if (
        !state ||
        ![state.mental, state.pleasure, state.monotony].every(
          Number.isFinite,
        ) ||
        state.mental < -1 ||
        state.mental > 1 ||
        state.pleasure < 0 ||
        state.pleasure > 1 ||
        state.monotony < 0 ||
        state.monotony > 1 + 1e-8 ||
        state.meals.length > world.config.experience.mealWindow ||
        state.recent.length > 40
      )
        throw new Error('Invalid bounded experience state.');
    }
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
    if (object.assemblyParent) {
      const parent = world.objects.find((p) => p.id === object.assemblyParent);
      if (
        !parent ||
        parent.spatial.solid ||
        !parent.spatial.reserved ||
        !object.spatial.solid ||
        parent.assemblyParent ||
        v7ShapeDistance(object.spatial, parent.spatial) > 1e-8
      )
        throw new Error(
          'A physical component needs an actual non-solid reserved parent footprint containing its anchor.',
        );
    }
    for (const pkg of registry?.packages.filter((p) =>
      world.revisions.includes(`${p.id}@${String(p.version)}`),
    ) ?? []) {
      const schema = pkg.stateSchemas?.[object.kind];
      if (schema) v7Validate(schema, object.data, object.id);
    }
    const s = object.spatial;
    if (
      s.enclosure &&
      (s.shape.kind !== 'rectangle' ||
        s.enclosure.wall <= 0 ||
        s.enclosure.doorway <= 0 ||
        s.enclosure.doorway >= s.shape.width ||
        s.enclosure.wall * 2 >= Math.min(s.shape.width, s.shape.height))
    )
      throw new Error('Invalid enclosure walls or doorway.');
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
      if (
        object &&
        object.assemblyParent !== other.id &&
        other.assemblyParent !== object.id &&
        !(
          world.state.shortRefuge === 1 &&
          object.kind === 'short-pole' &&
          other.kind === 'short-pole' &&
          !!object.assemblyParent &&
          object.assemblyParent === other.assemblyParent
        ) &&
        v7ShapesOverlap(object.spatial, other.spatial)
      )
        throw new Error('Solid object footprints overlap.');
    }
  for (const stack of world.stacks) {
    materialValidate(stack);
    if (
      (world.state.foodAssessment === 1 || !!world.config.development
        ? stack.quantity <= 0 ||
          foodTenths(stack.quantity) < 1 ||
          (stack.quantityTenths !== undefined &&
            stack.quantityTenths !== foodTenths(stack.quantity))
        : !Number.isSafeInteger(stack.quantity) || stack.quantity < 1) ||
      !world.resources.some((r) => r.id === stack.resource) ||
      (stack.owner !== null && !world.actors.some((a) => a.id === stack.owner))
    )
      throw new Error('Invalid material identity, quantity or ownership.');
  }
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
  const savedWorld = world;
  if (world.state.foodAssessment === 1 || !!world.config.development) {
    const encoded = v7Clone(world);
    normalizeFoodAccounting(encoded);
    world = v7Freeze(encoded);
  }
  const work = v7Work(world.config.computation.workPerRound),
    proposals: Proposal[] = [],
    outcomes: V7RoundResult['outcomes'] = {};
  try {
    for (const original of world.actors.filter((a) => a.vitals.health > 0)) {
      work.spend();
      const actorId = original.id;
      const submitted = actions[actorId];
      if (!submitted)
        throw new Error(`Missing simultaneous action for ${actorId}.`);
      let action: V7Action = submitted;
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
        if (trial.config.forest && !trial.eventTypes?.includes(type))
          throw new Error(`Undeclared event: ${type}.`);
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
        const bound = forestBoundOperation(world, original, action);
        if (trial.state.operationContinuity === 1) {
          if (cursor) cursor.operation = bound;
          for (const pkg of registry.packages)
            if (trial.revisions.includes(`${pkg.id}@${String(pkg.version)}`))
              pkg.beforeAction?.(trial, actor, action, !!bound);
        }
        if (actor.learning) {
          const studyEnergy =
            trial.abilities.find((a) => a.id === actor.learning?.ability)
              ?.learningEnergy ?? 0;
          if (actor.vitals.energy < studyEnergy) {
            const rest = trial.abilities.find((a) => a.id === 'rest');
            const handler =
              rest && actor.mastered.includes(rest.id)
                ? registry.handlers[rest.handler]
                : undefined;
            if (action.interface !== 'rest' || !handler)
              throw new Error(
                'Insufficient energy for study; use the known rest interface to recover while retaining progress.',
              );
            result = handler({ world: trial, actor, action, work, emit });
            emit(
              'learning',
              'Study paused for actual recovery; paid learning progress retained.',
              {
                ability: actor.learning.ability,
                remaining: actor.learning.remaining,
              },
            );
          } else {
            if (studyEnergy) actor.vitals.energy -= studyEnergy;
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
          }
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
          if (world.config.experience) {
            if (
              cursor?.operation &&
              v7Signature(action) !==
                v7Signature(cursor.plan.steps[cursor.step]?.action ?? null)
            )
              cursor.operation = null;
            action =
              cursor?.operation?.action ??
              bound?.action ??
              forestResolveAction(
                trial.state.operationContinuity === 1 ? trial : world,
                trial.state.operationContinuity === 1 ? actor : original,
                action,
              );
          }
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
            if (actor.collective) {
              if (
                ability.handler === 'kernel.request' &&
                !actor.collective.knownAbilities.includes(target)
              )
                actor.collective.knownAbilities.push(target);
              if (!actor.collective.knownAbilities.includes(target))
                throw new Error(
                  'Discover this capability through actual consultation, reporting or teaching before individual study.',
                );
            }
            const learned = trial.abilities.find((a) => a.id === target);
            if (
              !learned ||
              learned.prerequisites.some((id) => !actor.mastered.includes(id))
            )
              throw new Error(
                'Unimplemented ability or missing individual prerequisites.',
              );
            if (!actor.mastered.includes(target)) {
              const studyEnergy = learned.learningEnergy ?? 0;
              if (actor.vitals.energy < studyEnergy)
                throw new Error(
                  'Insufficient energy to begin this study round.',
                );
              if (studyEnergy) actor.vitals.energy -= studyEnergy;
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
            if (
              trial.config.development &&
              ability.dependencies &&
              (ability.dependencies.abilities.some(
                (id) => !actor.mastered.includes(id),
              ) ||
                ability.dependencies.knowledge.some(
                  (key) => !actor.memory.knowledge?.[key]?.verified,
                ))
            )
              throw new Error(
                'Missing actual personal capability or verified knowledge dependency.',
              );
            const handler = registry.handlers[ability.handler];
            if (!handler) throw new Error('Missing versioned implementation.');
            result = handler({
              world: trial,
              actor,
              action,
              work,
              emit,
              ...(world.config.experience
                ? {
                    operation: {
                      first: !(cursor?.operation ?? bound),
                      ...(trial.state.operationContinuity === 1
                        ? { request: submitted }
                        : {}),
                      elapsed:
                        cursor?.operation?.elapsed ?? bound?.elapsed ?? 0,
                      startedAt:
                        cursor?.operation?.startedAt ??
                        bound?.startedAt ??
                        trial.tick,
                    },
                  }
                : {}),
            });
            openPractice(world, trial, actor, ability, result.complete, emit);
            for (const old of world.actors) {
              const after = trial.actors.find((a) => a.id === old.id);
              if (
                !after ||
                v7Signature({
                  wellbeing: after.wellbeing,
                  ...(world.config.experience
                    ? { mental: after.experience?.mental }
                    : {}),
                  life: after.life ?? null,
                  mastered: after.mastered,
                  learning: after.learning,
                }) !==
                  v7Signature({
                    wellbeing: old.wellbeing,
                    ...(world.config.experience
                      ? { mental: old.experience?.mental }
                      : {}),
                    life: old.life ?? null,
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
        if (
          world.config.experience &&
          (cursor || trial.state.operationContinuity === 1) &&
          !original.learning &&
          !actor.learning
        ) {
          const ability = trial.abilities.find(
            (a) => a.id === action.interface,
          );
          const elapsed =
            (cursor?.operation?.elapsed ?? bound?.elapsed ?? 0) + 1;
          const remaining =
            result.remaining ??
            (ability?.execution?.duration == null
              ? null
              : Math.max(0, ability.execution.duration - elapsed));
          if (
            remaining !== null &&
            (!Number.isSafeInteger(remaining) || remaining < 0)
          )
            throw new Error('Invalid remaining work.');
          if (
            ability?.execution?.duration != null &&
            result.complete !== elapsed >= ability.execution.duration
          )
            throw new Error(
              'Completion disagrees with the declared operation duration.',
            );
          if (!result.complete && !ability?.execution)
            throw new Error(
              'Continuing interfaces require an execution/progress contract.',
            );
          const operation = result.complete
            ? null
            : {
                action,
                elapsed,
                remaining,
                startedAt:
                  cursor?.operation?.startedAt ??
                  bound?.startedAt ??
                  trial.tick,
              };
          if (cursor) cursor.operation = operation;
          forestSaveOperation(trial, actor, submitted, operation);
        }
        for (const field of [
          'config',
          'terrain',
          'abilities',
          'resources',
          'satisfaction',
          'revisions',
          ...(world.config.forest ? ['eventTypes' as const] : []),
        ] as const)
          if (v7Signature(trial[field]) !== v7Signature(world[field]))
            throw new Error(
              'Runtime actions cannot change registered rules or protected run policy.',
            );
        trial.stacks = trial.stacks.filter((s) => s.quantity > 0);
        normalizeFoodAccounting(trial);
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
          ...(error instanceof ForestRouteFailure
            ? { diagnostic: forestRouteData(error.evidence) }
            : error instanceof ForestReferenceError
              ? {
                  diagnostic: {
                    reasonCode: `reference-${error.code}`,
                    candidates: error.candidates,
                    ...(error.details ?? {}),
                  },
                }
              : {}),
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
          data:
            p.diagnostic ??
            (world.state.forestRouting === 1 &&
            actions[p.actor]?.interface === 'navigate'
              ? {
                  reasonCode: conflicts.has(p.actor)
                    ? 'simultaneous-conflict'
                    : 'invalid-target-or-movement',
                  observedBlockers: [],
                  clearance: null,
                  observationLimited: true,
                }
              : {}),
        });
      else {
        mergeProposal(next, p.world, p.writes);
        next.events.push(...p.events);
      }
      if (error && p.diagnostic?.contract === 'shelter-reference-diagnostics@1')
        next.events.push({
          id: v7Id(next, 'event'),
          tick: next.tick,
          actor: p.actor,
          type: 'shelter-reference-diagnostic',
          interface: actions[p.actor]?.interface ?? null,
          success: false,
          description: error,
          position:
            world.actors.find((a) => a.id === p.actor)?.position ?? null,
          target:
            typeof p.diagnostic.resolvedId === 'string'
              ? p.diagnostic.resolvedId
              : null,
          data: p.diagnostic,
        });
    }
    const protectedProcessState = protectedProcessAccounts(next);
    for (const process of [...next.processes])
      if (next.tick >= process.next) {
        work.spend();
        const handler = registry.processes[process.handler];
        if (!handler)
          throw new Error('Missing registered process implementation.');
        handler(next, process, work);
      }
    if (protectedProcessState !== protectedProcessAccounts(next))
      throw new Error(
        'Processes cannot rewrite protected rules, learning or wellbeing accounts.',
      );
    forestEnvironment(next);
    const responses = registry.packages.filter(
      (pkg) =>
        pkg.afterEnvironment &&
        next.revisions.includes(`${pkg.id}@${String(pkg.version)}`),
    );
    if (responses.length) {
      const protectedEnvironmentState = protectedProcessAccounts(next);
      for (const pkg of responses) {
        work.spend();
        pkg.afterEnvironment?.(next);
      }
      if (protectedEnvironmentState !== protectedProcessAccounts(next))
        throw new Error(
          'Environmental responses cannot rewrite protected rules, learning or wellbeing accounts.',
        );
    }
    fireEnvironment(next);
    canopyEnvironment(next);
    for (const actor of next.actors) v7Physiology(next, actor);
    warmingAfterPhysiology(next);
    forestLives(world, next, cursors, registry);
    foodAssessmentAfterRound(world, next);
    shelterAfterRound(world, next);
    insulationAfterRound(world, next);
    fireAfterRound(world, next);
    willowAfterRound(world, next);
    canopyAfterRound(world, next);
    recuperationAfterRound(next, outcomes);
    routeInspectionAfterRound(next);
    normalizeFoodAccounting(next);
    forestPerception(world, next);
    collectiveAfterRound(world, next);
    v7Wellbeing(next);
    forestExperienceAfterRound(world, next);
    v7Remember(next);
    v7AssertWorld(next, registry);
    for (const p of proposals)
      if (!p.error && !conflicts.has(p.actor) && p.cursor && cursors[p.actor]) {
        if (
          next.state.recuperation === 1 &&
          p.cursor.operation?.action.interface === 'recuperate' &&
          !next.actors.find((a) => a.id === p.actor)?.extensionState[
            'recuperation:pending'
          ]
        )
          p.cursor.operation = null;
        cursors[p.actor] = p.cursor;
      }
    return {
      world: v7Freeze(v7CanonicalNumbers(next)),
      outcomes,
      paused: null,
    };
  } catch (error) {
    if (error instanceof V7ComputePause)
      return { world: savedWorld, outcomes: {}, paused: error.message };
    throw error;
  }
}
