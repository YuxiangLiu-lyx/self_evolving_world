import {
  LONG_CALL_PAUSE,
  longOrdinaryInput,
  longWorldInput,
  longRetrieve,
  parseLongDecision,
} from './long-context.js';
import {
  longTokenBudget,
  longTokenCeiling,
  longRequestMeasure,
} from './long-tokens.js';
import { forestPlanArguments } from './forest-plan-arguments.js';
import {
  collectiveAttention,
  collectiveDecisions,
  collectiveLimit,
  collectivePhaseUsed,
  collectiveTokenBudget,
  parseCollectiveDecision,
  canContinueCollective,
} from './collective-controller.js';
import { continuousInputText } from './forest-input-encoding.js';
import {
  V7_WINDOW,
  V7_STAGE_INTERVAL,
  continuousRegistry,
  openSaveProjects,
  v7Clone,
  v7Cursor,
  v7ParsePlan,
  v7TaskAction,
  v7FinishTasks,
  v7Step,
  v7Signature,
  v7Validate,
  v7Record,
  v7String,
  v7Number,
  v7Install,
  V7ComputePause,
  collectiveSettle,
  expressionArgumentIssue,
  expressionSaveMemory,
} from '@self-evolving-world/world-core';
import type {
  V7World,
  V7Action,
  V7Review,
  V7Registry,
} from '@self-evolving-world/world-core';
import { initialContinuousWorld } from './continuous-scenario.js';
import {
  ordinaryContinuousInput,
  worldContinuousInput,
} from './continuous-input.js';
import { V7TransportError, continuousRequest } from './continuous-provider.js';
import type {
  V7Provider,
  V7ProviderResult,
  ContinuousModelInput,
} from './continuous-provider.js';

export type {
  V7Attempt,
  V7CallRecord,
  V7DevelopmentAttempt,
  V7Barrier,
  V7Execution,
  V7RoundRecord,
  V7Sink,
} from './continuous-run-types.js';
import type {
  V7Attempt,
  V7CallRecord,
  V7DevelopmentAttempt,
  V7Barrier,
  V7Execution,
  V7RoundRecord,
  V7Sink,
} from './continuous-run-types.js';
export function newContinuousExecution(
  model: string,
  controller: V7Execution['controller'] = 'chatgpt-plan',
  world = initialContinuousWorld(),
): V7Execution {
  return {
    version: 7,
    controller,
    model,
    world,
    cursors: {},
    attempts: [],
    developments: [],
    phase: 'running',
    reason: null,
    windowTarget:
      world.config.longDevelopment?.firstWindow ??
      world.config.experience?.targetRounds ??
      V7_WINDOW,
    barrier: null,
    pendingCall: null,
    registrations: [],
    stages: [],
  };
}
export function parseContinuousReviews(
  text: string,
  barrier: V7Barrier,
  world: V7World,
): V7Review[] {
  const parsed = v7Record(JSON.parse(text) as unknown);
  if (
    Object.keys(parsed).join(',') !== 'reviews' ||
    !Array.isArray(parsed.reviews)
  )
    throw new Error('Expected a complete review batch.');
  const result = parsed.reviews.map((raw: unknown): V7Review => {
    const r = v7Record(raw),
      actor = v7String(r.actor, 'review actor'),
      decision = v7String(r.decision, 'decision');
    if (!['reuse', 'develop', 'reject'].includes(decision))
      throw new Error('Invalid review decision.');
    const ability = r.ability === null ? null : v7String(r.ability, 'ability'),
      learning = v7Number(r.learning, 'learning duration', 0);
    if (
      !Number.isSafeInteger(learning) ||
      (decision === 'develop' && learning < 1)
    )
      throw new Error('Learning duration must reflect actual positive study.');
    if (decision === 'reuse') {
      const found = world.abilities.find((a) => a.id === ability);
      if (!found || found.learning !== learning)
        throw new Error(
          'Reuse must reference the existing public interface and its study duration.',
        );
    } else if (ability !== null)
      throw new Error(
        'Unimplemented or rejected requests cannot name an available interface.',
      );
    return {
      actor,
      decision: decision as V7Review['decision'],
      ability,
      learning,
      reason: v7String(r.reason, 'review reason'),
      ...(world.config.forest
        ? {
            experienceReview: v7String(
              r.experienceReview,
              'explicit experience review',
            ),
            visualReview: v7String(r.visualReview, 'explicit visual review'),
          }
        : {}),
      specification: typeof r.specification === 'string' ? r.specification : '',
    };
  });
  if (
    v7Signature(result.map((r) => r.actor).sort()) !==
    v7Signature(Object.keys(barrier.requests).sort())
  )
    throw new Error('Every requester needs exactly one review.');
  return result;
}
function parsePlan(text: string, state: V7Execution, actor?: string) {
  const culture = state.world.config.longDevelopment?.culture;
  const plan = v7ParsePlan(
    JSON.parse(text) as unknown,
    state.world.eventTypes,
    !!state.world.config.development,
    !!culture?.voice,
  );
  for (const person of Object.keys(plan.views ?? {}))
    if (
      person === actor ||
      !state.world.actors.some((other) => other.id === person)
    )
      throw new Error('views keys must be the ids of other people.');
  if (text.length * 2 > state.world.config.computation.inputBytes)
    throw new V7ComputePause(
      'Plan input exceeds parsing protection; world paused.',
    );
  for (const step of plan.steps) {
    const ability = state.world.abilities.find(
      (a) => a.id === step.action.interface,
    );
    if (!ability)
      throw new Error(
        'Plan names an unimplemented interface; use the functional request interface.',
      );
    if (state.world.config.experience)
      step.action.args = forestPlanArguments(
        ability.parameters,
        step.action.args,
      );
    const bounded = culture?.symbols
      ? expressionArgumentIssue(step.action)
      : null;
    if (bounded) throw new Error(bounded);
    v7Validate(ability.parameters, step.action.args);
  }
  return plan;
}
function acceptCall(state: V7Execution, record: V7CallRecord): void {
  const index = state.attempts.findIndex((a) => a.id === record.attempt.id);
  if (index < 0 || state.attempts[index]?.status !== 'started')
    throw new Error(
      'Attempt recovery must match one pending persisted invocation.',
    );
  state.attempts[index] = record.attempt;
  state.pendingCall = null;
  if ('longContext' in record.input) {
    const key = record.attempt.actor;
    state.longRetrieval ??= {};
    const old = state.longRetrieval[key];
    if (record.attempt.status === 'accepted' && record.response) {
      const result = parseLongDecision(record.response.text);
      if (result.queries.length) {
        state.longRetrieval[key] = {
          tick: state.world.tick,
          batches: (old?.batches ?? 0) + 1,
          results: [
            ...(old?.results ?? []),
            ...longRetrieve(
              state.world,
              key,
              record.attempt.role,
              result.queries,
            ),
          ],
        };
        if (record.attempt.role === 'world' && state.barrier)
          state.barrier.input = longWorldInput(
            state.world,
            state.barrier.requests,
            state.longRetrieval[key],
          );
        return;
      }
      state.longRetrieval = Object.fromEntries(
        Object.entries(state.longRetrieval).filter(([id]) => id !== key),
      );
      if (record.attempt.role === 'ordinary')
        state.cursors[key] = v7Cursor(
          parsePlan(result.decision ?? '', state, key),
          state.world.tick,
        );
      else {
        if (!state.barrier) throw new Error('Missing world-review barrier.');
        state.barrier.worldAttempts += 1;
        state.barrier.reviews = parseContinuousReviews(
          result.decision ?? '',
          state.barrier,
          state.world,
        );
      }
    } else {
      const failures = state.attempts.filter(
        (a) =>
          a.actor === key &&
          a.tick === state.world.tick &&
          ['failed', 'rejected'].includes(a.status),
      );
      state.longRetrieval[key] = {
        tick: state.world.tick,
        batches: old?.batches ?? 0,
        results: [
          ...(old?.results ?? []),
          { validationError: record.attempt.error },
        ],
      };
      if (record.attempt.role === 'world' && state.barrier) {
        state.barrier.worldAttempts += 1;
        state.barrier.errors.push(record.attempt.error ?? 'Failed review.');
        state.barrier.input = longWorldInput(
          state.world,
          state.barrier.requests,
          state.longRetrieval[key],
        );
      }
      if (
        record.attempt.role === 'ordinary' &&
        (failures.length >= 2 || record.attempt.status === 'failed')
      ) {
        state.phase = 'paused';
        state.reason = LONG_CALL_PAUSE;
      }
    }
    return;
  }
  if ('collective' in record.input) {
    const attention = collectiveAttention(state);
    for (const id of record.input.collective.eligible)
      attention.lastDecision[id] = state.world.tick;
    if (record.attempt.status === 'accepted' && record.response) {
      const decision = parseCollectiveDecision(
        record.response.text,
        record.input,
        (text) => parsePlan(text, state),
      );
      Object.assign(attention.intents, decision.intents);
      for (const [id, plan] of Object.entries(decision.plans)) {
        state.cursors[id] = v7Cursor(plan, state.world.tick);
        attention.lastDecision[id] = state.world.tick;
        attention.needsSince = Object.fromEntries(
          Object.entries(attention.needsSince).filter(([key]) => key !== id),
        );
      }
      if (decision.coordination) attention.pending.push(decision.coordination);
    }
    if (record.input.collective.mode === 'coordination') {
      attention.lastPublicAttempt[record.input.collective.group] =
        state.world.tick;
      if (record.attempt.status === 'accepted')
        attention.lastCoordination[record.input.collective.group] =
          state.world.tick;
    }
    return;
  }
  if (record.attempt.role === 'ordinary') {
    if (record.attempt.status === 'accepted' && record.response)
      state.cursors[record.attempt.actor] = v7Cursor(
        parsePlan(record.response.text, state),
        state.world.tick,
      );
    else
      state.cursors[record.attempt.actor] = v7Cursor(
        {
          intention:
            'One failed-decision interval; the next decision remains budgeted.',
          steps: [
            {
              action: { interface: 'wait', args: {} },
              repeat: 1,
              until: null,
              guard: null,
            },
          ],
          repeat: 1,
          until: null,
          interrupts: [],
          notes:
            state.world.actors.find((a) => a.id === record.attempt.actor)
              ?.memory.notes ?? [],
          preferences:
            state.world.actors.find((a) => a.id === record.attempt.actor)
              ?.memory.preferences ?? [],
        },
        state.world.tick,
      );
  } else {
    if (!state.barrier) throw new Error('Missing saved world-review barrier.');
    state.barrier.worldAttempts += 1;
    if (record.attempt.status === 'accepted' && record.response)
      state.barrier.reviews = parseContinuousReviews(
        record.response.text,
        state.barrier,
        state.world,
      );
    else
      state.barrier.errors.push(record.attempt.error ?? 'World review failed.');
  }
}
async function invoke(
  state: V7Execution,
  role: 'ordinary' | 'world',
  actor: string,
  input: ContinuousModelInput,
  reason: string,
  provider: V7Provider,
  sink: V7Sink,
): Promise<void> {
  const used = collectivePhaseUsed(state, role);
  if (used >= collectiveLimit(state, role)) {
    state.phase = 'paused';
    state.reason = `${role} attempted-call budget exhausted.`;
    await sink.save(state);
    await sink.checkpoint(state, state.reason);
    return;
  }
  const tokenBudget = longTokenBudget(state) ?? collectiveTokenBudget(state);
  const measure = state.world.config.longDevelopment
    ? longRequestMeasure(
        continuousRequest(state.model, role, input),
        state.world.config.longDevelopment.outputTokens,
      )
    : null;
  // Conservative reservation includes the complete serialized request and bounded output,
  // with room for protocol framing. Unknown usage retains its reservation rather than zero.
  const reservation =
    measure?.reservation ??
    (tokenBudget
      ? new TextEncoder().encode(
          JSON.stringify(continuousRequest(state.model, role, input)),
        ).length +
        (state.world.config.collective?.tokens.output ?? 0) +
        4096
      : 0);
  if (tokenBudget && tokenBudget.used + reservation > tokenBudget.limit) {
    state.phase = 'paused';
    state.reason =
      'Frozen token budget cannot reserve the next complete attempt; world paused.';
    await sink.save(state);
    await sink.checkpoint(state, state.reason);
    return;
  }
  const ceiling = tokenBudget ? longTokenCeiling(state) : null;
  if (
    tokenBudget &&
    ceiling &&
    tokenBudget.used + reservation > ceiling.tokens
  ) {
    state.phase = 'paused';
    state.reason = `Frozen token ceiling of ${String(ceiling.tokens)} before round ${String(ceiling.through)} cannot reserve the next complete attempt; world paused.`;
    await sink.save(state);
    await sink.checkpoint(state, state.reason);
    return;
  }
  if (
    (measure &&
      measure.inputEstimate >
        (state.world.config.longDevelopment?.inputEstimateLimit ?? 0)) ||
    continuousInputText(input).length * 2 >
      state.world.config.computation.inputBytes ||
    (state.world.config.collective &&
      continuousInputText(input).length >
        state.world.config.collective.contextCharacters)
  ) {
    state.phase = 'paused';
    state.reason =
      'Observation input exceeds computational context protection; no hidden truncation or inference.';
    await sink.save(state);
    await sink.checkpoint(state, state.reason);
    return;
  }
  const attempt: V7Attempt = {
    id: `${role}-${String(state.attempts.length + 1)}`,
    role,
    actor,
    tick: state.world.tick,
    reason,
    status: 'started',
    startedAt: new Date().toISOString(),
    ...(state.world.config.development
      ? {
          contextBytes: new TextEncoder().encode(continuousInputText(input))
            .length,
          contextCodeUnits: continuousInputText(input).length,
        }
      : {}),
    ...(tokenBudget ? { reservedTokens: reservation } : {}),
    ...(measure ? { requestMeasure: measure } : {}),
    elapsedMs: null,
    usage: null,
    error: null,
  };
  if ('collective' in input)
    collectiveAttention(state).lastSlot[input.collective.group] =
      state.world.tick;
  state.attempts.push(v7Clone(attempt));
  state.pendingCall = { id: attempt.id, input };
  await sink.save(state);
  const start = performance.now();
  let response: V7ProviderResult | null = null,
    failureEvidence = '';
  try {
    response = await provider(role, input);
    attempt.usage = response.usage;
    if (
      tokenBudget &&
      response.usage &&
      ([response.usage.inputTokens, response.usage.outputTokens].some(
        (n) => !Number.isSafeInteger(n) || n < 0,
      ) ||
        response.usage.inputTokens + response.usage.outputTokens >
          reservation ||
        response.usage.outputTokens >
          (state.world.config.longDevelopment?.outputTokens ??
            state.world.config.collective?.tokens.output ??
            0))
    )
      throw new V7ComputePause(
        'Provider usage violated the frozen reservation or output limit; retained for audit without advancing the world.',
      );
    if ('longContext' in input) {
      const result = parseLongDecision(response.text);
      if (result.queries.length) {
        if (input.longContext.remainingQueryBatches <= 0)
          throw new Error(
            'Read-only query batch limit reached; submit a decision using retained results.',
          );
        longRetrieve(state.world, actor, role, result.queries);
      } else if (role === 'ordinary') {
        const plan = parsePlan(result.decision ?? '', state, actor);
        if (
          plan.steps.length > 6 ||
          (plan.projects?.length ?? 0) > 4 ||
          !v7TaskAction(state.world, actor, v7Cursor(plan, state.world.tick))
        )
          throw new Error('Expected a bounded executable personal plan.');
      } else {
        if (!state.barrier) throw new Error('Missing world-review barrier.');
        parseContinuousReviews(
          result.decision ?? '',
          state.barrier,
          state.world,
        );
      }
    } else if ('collective' in input) {
      const decision = parseCollectiveDecision(response.text, input, (text) =>
        parsePlan(text, state),
      );
      for (const [id, plan] of Object.entries(decision.plans))
        if (!v7TaskAction(state.world, id, v7Cursor(plan, state.world.tick)))
          throw new Error(
            'A selected member plan has no current executable action.',
          );
    } else if (role === 'ordinary') {
      const plan = parsePlan(response.text, state),
        cursor = v7Cursor(plan, state.world.tick);
      if (!v7TaskAction(state.world, actor, cursor))
        throw new Error(
          'Plan has no executable action in the current observed state.',
        );
    } else {
      if (!state.barrier) throw new Error('Missing world-review barrier.');
      parseContinuousReviews(response.text, state.barrier, state.world);
    }
    attempt.status = 'accepted';
  } catch (error) {
    attempt.status = response ? 'rejected' : 'failed';
    attempt.error =
      error instanceof Error ? error.message : 'Model invocation failed.';
    if (error instanceof V7TransportError) {
      failureEvidence = error.evidence;
      attempt.usage = error.usage;
    }
    if (error instanceof V7ComputePause) {
      state.phase = 'paused';
      state.reason = error.message;
    }
  }
  attempt.elapsedMs = performance.now() - start;
  const record: V7CallRecord = {
    attempt: v7Clone(attempt),
    input,
    response,
    failureEvidence,
  };
  // The result journal is immutable and recoverable before the checkpoint advances.
  await sink.call(record);
  acceptCall(state, record);
  await sink.save(state);
}
export async function issueContinuousDevelopment(
  state: V7Execution,
  sink: V7Sink,
): Promise<void> {
  if (!state.barrier) throw new Error('No development barrier.');
  const current = state.developments.find(
    (a) => a.id === state.barrier?.developmentAttempt,
  );
  if (current?.status === 'started') {
    state.phase = 'development';
    return;
  }
  if (
    collectivePhaseUsed(state, 'development') >=
    collectiveLimit(state, 'development')
  ) {
    state.phase = 'paused';
    state.reason = 'Conversation development-handoff budget exhausted.';
    await sink.save(state);
    await sink.checkpoint(state, state.reason);
    return;
  }
  const attempt: V7DevelopmentAttempt = {
    id: `development-${String(state.developments.length + 1)}`,
    tick: state.world.tick,
    status: 'started',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    reason: null,
    internalModelCalls: null,
    inputTokens: null,
    outputTokens: null,
  };
  state.developments.push(attempt);
  state.barrier.developmentAttempt = attempt.id;
  state.phase = 'development';
  state.reason = 'A versioned current-conversation implementation is required.';
  await sink.save(state);
  await sink.checkpoint(state, state.reason);
}
/** No provider is called during replay, passive processes, learning or an unfinished valid task. */
export async function continueContinuousExecution(
  saved: V7Execution,
  provider: V7Provider,
  sink: V7Sink,
  registry: V7Registry = continuousRegistry(saved.world),
): Promise<V7Execution> {
  const state = v7Clone(saved);
  if (state.pendingCall) {
    const record = await sink.findCall(state.pendingCall.id);
    if (!record) {
      state.phase = 'paused';
      state.reason =
        'An interrupted started call has no durable result; inference will not be repeated.';
      await sink.save(state);
      await sink.checkpoint(state, state.reason);
      return state;
    }
    acceptCall(state, record);
    await sink.save(state);
  }
  while (isRunning(state) && state.world.tick < state.windowTarget) {
    if (!state.world.actors.some((a) => a.vitals.health > 0)) {
      state.phase = 'paused';
      state.reason =
        'No living actors remain; the retained world can still be inspected.';
      break;
    }
    try {
      if (!state.barrier) {
        if (state.world.config.collective) {
          const decisions = collectiveDecisions(state);
          // All packets are constructed from one round-start world before any response.
          for (const decision of decisions) {
            await invoke(
              state,
              'ordinary',
              decision.actor,
              decision.input,
              decision.reason,
              provider,
              sink,
            );
            if (!isRunning(state)) return state;
          }
        } else
          for (const actor of state.world.actors.filter(
            (a) => a.vitals.health > 0,
          )) {
            if (actor.learning) continue;
            let cursor = state.cursors[actor.id];
            while (!cursor || !v7TaskAction(state.world, actor.id, cursor)) {
              const reason =
                cursor?.reason ??
                'Initial decision for this persistent identity.';
              await invoke(
                state,
                'ordinary',
                actor.id,
                state.world.config.longDevelopment
                  ? longOrdinaryInput(
                      state.world,
                      actor.id,
                      cursor,
                      state.longRetrieval?.[actor.id],
                    )
                  : ordinaryContinuousInput(
                      state.world,
                      actor.id,
                      cursor,
                      state.world.config.budgets.ordinary -
                        state.attempts.filter((a) => a.role === 'ordinary')
                          .length,
                    ),
                reason,
                provider,
                sink,
              );
              if (!isRunning(state)) return state;
              cursor = state.cursors[actor.id];
              if (!state.world.config.longDevelopment) break;
            }
            if (!cursor) throw new Error('Missing persisted actor task.');
          }
        const actions: Record<string, V7Action> = {};
        for (const actor of state.world.actors.filter(
          (a) => a.vitals.health > 0,
        )) {
          const cursor = state.cursors[actor.id];
          let action = actor.learning
            ? { interface: 'wait', args: {} }
            : cursor
              ? v7TaskAction(state.world, actor.id, cursor)
              : null;
          if (!action && state.world.config.collective) {
            const attention = collectiveAttention(state);
            const waiting =
              state.world.tick -
              (attention.needsSince[actor.id] ?? state.world.tick);
            if (waiting >= state.world.config.collective.maxDecisionWait) {
              state.phase = 'paused';
              state.reason =
                'Maximum member decision wait exceeded; world paused for diagnosis.';
              await sink.save(state);
              await sink.checkpoint(state, state.reason);
              return state;
            }
            attention.queuedRounds[actor.id] =
              (attention.queuedRounds[actor.id] ?? 0) + 1;
            action = { interface: 'wait', args: {} };
          }
          if (!action)
            throw new Error('Missing executable simultaneous intent.');
          actions[actor.id] = action;
        }
        const requests = Object.fromEntries(
          Object.entries(actions).filter(
            ([id, a]) =>
              a.interface === 'request' &&
              !state.world.actors.find((x) => x.id === id)?.learning,
          ),
        );
        state.barrier = {
          id: `round-${String(state.world.tick)}`,
          tick: state.world.tick,
          actions,
          requests,
          reviews: [],
          worldAttempts: 0,
          errors: [],
          input: state.world.config.longDevelopment
            ? longWorldInput(state.world, requests)
            : worldContinuousInput(state.world, requests),
          developmentAttempt: null,
        };
        await sink.save(state);
      }
      const barrier = state.barrier;
      while (
        Object.keys(barrier.requests).length &&
        !barrier.reviews.length &&
        barrier.worldAttempts < 2 &&
        isRunning(state)
      )
        await invoke(
          state,
          'world',
          'world',
          barrier.input,
          `Batched functional requests from ${Object.keys(barrier.requests).join(', ')}.`,
          provider,
          sink,
        );
      if (!isRunning(state)) return state;
      if (
        Object.keys(barrier.requests).length &&
        (!barrier.reviews.length ||
          barrier.reviews.some((r) => r.decision === 'develop'))
      ) {
        await issueContinuousDevelopment(state, sink);
        return state;
      }
      const before = state.world,
        input = v7Clone(before),
        memory: V7RoundRecord['memory'] = {};
      for (const actor of input.actors) {
        const plan = state.cursors[actor.id]?.plan;
        if (plan) {
          memory[actor.id] = {
            notes: plan.notes,
            preferences: plan.preferences,
            ...(state.attention?.intents[actor.id]
              ? { collectiveIntent: v7Clone(state.attention.intents[actor.id]) }
              : {}),
            ...(input.config.forest ? { intention: plan.intention } : {}),
            ...(input.config.development &&
            state.cursors[actor.id]?.startedAt === input.tick &&
            plan.projects
              ? { projects: plan.projects }
              : {}),
            // Opt-in private memory, applied once when its plan starts.
            ...(state.cursors[actor.id]?.startedAt === input.tick &&
            plan.cares !== undefined
              ? { cares: plan.cares }
              : {}),
            ...(state.cursors[actor.id]?.startedAt === input.tick && plan.views
              ? { views: plan.views }
              : {}),
          };
          const entry = memory[actor.id];
          if (entry?.cares !== undefined || entry?.views)
            expressionSaveMemory(actor, entry, input.tick);
          const projects = memory[actor.id]?.projects;
          const intent = memory[actor.id]?.collectiveIntent;
          if (intent && actor.collective)
            actor.collective.intent = v7Clone(intent);
          if (projects) openSaveProjects(actor, projects, input.tick);
          actor.memory.notes = plan.notes;
          actor.memory.preferences = plan.preferences;
          if (input.config.forest) actor.memory.intention = plan.intention;
        }
      }
      const result = v7Step(
        input,
        barrier.actions,
        registry,
        state.cursors,
        barrier.reviews,
      );
      if (result.paused) {
        state.phase = 'paused';
        state.reason = result.paused;
        await sink.save(state);
        await sink.checkpoint(state, state.reason);
        return state;
      }
      v7FinishTasks(before, result, state.cursors);
      const coordination = state.attention?.pending ?? [];
      state.world = collectiveSettle(result.world, coordination);
      const record: V7RoundRecord = {
        tick: result.world.tick,
        before: v7Signature(before),
        after: v7Signature(state.world),
        actions: barrier.actions,
        reviews: barrier.reviews,
        registrations: [...state.registrations],
        memory,
        events: state.world.events,
        ...(state.world.config.collective
          ? { coordination: v7Clone(coordination) }
          : {}),
        tasks: v7Clone(state.cursors),
      };
      state.barrier = null;
      if (state.attention) {
        state.attention.pending = [];
        state.attention.intents = {};
      }
      state.registrations = [];
      if (
        state.world.config.longDevelopment
          ? state.world.config.longDevelopment.checkpoints.includes(
              state.world.tick,
            )
          : state.world.tick % V7_STAGE_INTERVAL === 0
      )
        state.stages.push(state.world.tick);
      if (state.world.tick >= state.windowTarget) {
        state.phase = 'window-complete';
        state.reason = `Observation window reached ${String(state.world.tick)}; the world is resumable, not terminal.`;
      }
      await sink.round(record, state);
      await sink.save(state);
      if (
        state.world.config.longDevelopment
          ? state.world.config.longDevelopment.checkpoints.includes(
              state.world.tick,
            )
          : state.world.tick % V7_STAGE_INTERVAL === 0
      )
        await sink.checkpoint(
          state,
          'Scheduled observation stage; no actor hint.',
        );
    } catch (error) {
      state.phase = 'paused';
      state.reason =
        error instanceof Error
          ? `Execution paused: ${error.message}`
          : 'Execution paused.';
      await sink.save(state);
      await sink.checkpoint(state, state.reason);
      throw error;
    }
  }
  await sink.save(state);
  return state;
}

/** Called only after the existing file adapter validates a pre-counted implementation handoff. */
export function resolveContinuousDevelopment(
  saved: V7Execution,
  packages: string[],
  assignments: Record<string, string>,
  review: string,
  registry: V7Registry = continuousRegistry(saved.world),
): V7Execution {
  const state = v7Clone(saved),
    barrier = state.barrier;
  const attempt = state.developments.find(
    (a) => a.id === barrier?.developmentAttempt,
  );
  if (
    state.phase !== 'development' ||
    !barrier ||
    !attempt ||
    attempt.status !== 'started' ||
    (!barrier.reviews.length &&
      !(
        [
          LONG_CALL_PAUSE,
          'Simulation computation budget exhausted; checkpoint the entire world.',
          'Observation input exceeds computational context protection; no hidden truncation or inference.',
          'A bounded collective response reader failed; the stopped transport attempt remains charged and will not be repeated.',
          'Reviewed bark feedback and personal inspection retention are incomplete; repair the preserved implementation without changing experimental policy.',
        ].includes(barrier.technicalReason ?? '') &&
        Object.keys(barrier.requests).length === 0
      ))
  )
    throw new Error(
      'No complete reviewed and pre-counted implementation handoff.',
    );
  for (const key of packages)
    state.world = v7Install(state.world, registry, key);
  barrier.reviews = barrier.reviews.map((r) => {
    if (r.decision !== 'develop') return r;
    const ability = state.world.abilities.find(
      (a) => a.id === assignments[r.actor],
    );
    const alreadyMastered =
      saved.world.actors
        .find((a) => a.id === r.actor)
        ?.mastered.includes(ability?.id ?? '') &&
      saved.world.abilities.some(
        (a) => a.id === ability?.id && a.learning === ability.learning,
      );
    if (!ability || (ability.learning !== r.learning && !alreadyMastered))
      throw new Error(
        'Implemented assignment must preserve the reviewed learning duration.',
      );
    return {
      ...r,
      decision: 'reuse',
      ability: ability.id,
      reason: `${r.reason} Implemented at the preserved round boundary.`,
    };
  });
  if (
    barrier.technicalReason ===
    'Reviewed bark feedback and personal inspection retention are incomplete; repair the preserved implementation without changing experimental policy.'
  ) {
    if (
      Object.keys(barrier.actions).length ||
      barrier.reviews.length ||
      Object.keys(barrier.requests).length ||
      Object.keys(assignments).length ||
      packages.length !== 1 ||
      packages[0] !== 'bark-feedback@1' ||
      saved.world.config.development?.scope !== 'collective-ex12' ||
      !saved.world.revisions.includes('bark-extraction@1')
    )
      throw new Error(
        'Reviewed feedback repair may only install its exact corrective package, without actor actions or assignments.',
      );
    state.barrier = null;
  }
  if (
    [
      LONG_CALL_PAUSE,
      'Observation input exceeds computational context protection; no hidden truncation or inference.',
      'A bounded collective response reader failed; the stopped transport attempt remains charged and will not be repeated.',
    ].includes(barrier.technicalReason ?? '')
  ) {
    if (
      Object.keys(barrier.actions).length ||
      barrier.reviews.length ||
      packages.length ||
      Object.keys(assignments).length
    )
      throw new Error(
        'Context-only recovery cannot execute, install or review an actor action.',
      );
    state.barrier = null;
  }
  state.registrations.push(...packages);
  attempt.status = 'accepted';
  attempt.finishedAt = new Date().toISOString();
  attempt.reason = review;
  state.phase = 'running';
  state.reason = null;
  return state;
}
/** Observation windows can extend without resetting identities, knowledge, tasks or shared budgets. */
export function extendContinuousWindow(
  saved: V7Execution,
  target: number,
): V7Execution {
  if (
    (saved.phase !== 'window-complete' && !canContinueCollective(saved)) ||
    !Number.isSafeInteger(target) ||
    target <= saved.windowTarget
  )
    throw new Error(
      'Only a completed observation window can extend to a later explicit target.',
    );
  const state = v7Clone(saved);
  if (saved.world.config.collective) {
    if (!canContinueCollective(saved) || target !== 1600)
      throw new Error(
        'Only the frozen B continuation can extend this collective checkpoint.',
      );
    state.collectiveContinuation = {
      round: saved.world.tick,
      attempts: saved.attempts.length,
      developments: saved.developments.length,
    };
  }
  state.windowTarget = target;
  state.phase = 'running';
  state.reason = null;
  return state;
}

function isRunning(state: V7Execution): boolean {
  return state.phase === 'running';
}
