import {
  acceptLearningProgram,
  advanceLearningRound,
  lastLearningFrame,
  learningActions,
  learningData,
  parseLearningCode,
  parseWorldReview,
  pendingLearningPrograms,
  reconstructLearningRun,
  reviewedSkills,
  LEARNING_LIMITS,
} from '@self-evolving-world/world-core';
import type {
  LearningProgram,
  LearningRound,
  LearningRun,
  WorldReview,
} from '@self-evolving-world/world-core';
import { initialLearningWorld } from './learning-scenario.js';
import { ordinaryLearningInput, worldLearningInput } from './learning-input.js';
import type {
  OrdinaryLearningInput,
  WorldLearningInput,
} from './learning-input.js';
import type { LearningProvider } from './learning-provider.js';
import type { ProgramResponse } from './survival-run.js';
import { record, string } from './remote-data.js';

export interface LearningAttempt {
  readonly role: 'ordinary' | 'world';
  readonly actor: string;
  readonly tick: number;
  readonly call: number;
  readonly input: OrdinaryLearningInput | WorldLearningInput;
  readonly status:
    'started' | 'accepted' | 'rejected' | 'failed' | 'development';
  readonly response?: ProgramResponse;
  readonly error?: string;
}
export interface DevelopmentBarrier {
  readonly id: string;
  readonly tick: number;
  readonly input: WorldLearningInput;
  readonly errors: readonly string[];
  readonly proposed: string | null;
}
export interface DevelopmentResult {
  readonly barrier: DevelopmentBarrier;
  readonly reviews: readonly WorldReview[];
  readonly notes: string;
  readonly reviewer: 'current-codex-conversation';
}
export interface LearningExecution {
  readonly version: 1;
  readonly controller: 'chatgpt-plan' | 'simulated-test';
  readonly model: string;
  readonly programs: readonly LearningProgram[];
  readonly rounds: readonly LearningRound[];
  readonly attempts: readonly LearningAttempt[];
  readonly developments: readonly DevelopmentResult[];
  readonly phase: 'running' | 'development' | 'completed';
  readonly barrier: DevelopmentBarrier | null;
}
export function newLearningExecution(
  model: string,
  controller: LearningExecution['controller'],
): LearningExecution {
  return {
    version: 1,
    controller,
    model,
    programs: [],
    rounds: [],
    attempts: [],
    developments: [],
    phase: 'running',
    barrier: null,
  };
}
export function learningExecutionRun(state: LearningExecution): LearningRun {
  return reconstructLearningRun(
    initialLearningWorld(),
    state.programs,
    state.rounds,
  );
}
export function parseOrdinaryLearning(
  answer: string,
  actor: string,
  tick: number,
): { code: string; summary: string } {
  const value = record(JSON.parse(answer) as unknown);
  if (Object.keys(value).sort().join(',') !== 'code,summary')
    throw new Error('Expected only code and summary.');
  const code = string(value.code, 'code'),
    summary = string(value.summary, 'summary');
  if (!summary.trim() || summary.length > 400)
    throw new Error('Invalid program summary.');
  parseLearningCode(code, actor, 18 - tick);
  return { code, summary };
}
export function parseWorldLearning(answer: string): {
  reviews: readonly WorldReview[];
  needsDevelopment: boolean;
} {
  const value = record(JSON.parse(answer) as unknown);
  if (
    Object.keys(value).sort().join(',') !== 'needsDevelopment,reviews' ||
    typeof value.needsDevelopment !== 'boolean' ||
    !Array.isArray(value.reviews) ||
    value.reviews.length > 32
  )
    throw new Error('Invalid World Agent response envelope.');
  return {
    reviews: value.reviews.map(parseWorldReview),
    needsDevelopment: value.needsDevelopment,
  };
}
export function budgetReviews(run: LearningRun): readonly WorldReview[] {
  return learningActions(run)
    .filter((a) => a.type === 'learn')
    .map((a) => ({
      agentId: a.agentId,
      decision: 'reject',
      reason:
        'World Agent attempt budget exhausted; no capability was approved.',
      prerequisites: [],
      learningRounds: 0,
      skillId: null,
      specification: null,
    }));
}
/** A response repairs only the saved barrier. It neither advances time nor invokes inference. */
export function acceptDevelopment(
  state: LearningExecution,
  input: unknown,
): LearningExecution {
  const data = record(input),
    b = state.barrier;
  if (
    !b ||
    state.phase !== 'development' ||
    data.barrierId !== b.id ||
    data.tick !== b.tick ||
    Object.keys(data).sort().join(',') !== 'barrierId,notes,reviews,tick' ||
    !Array.isArray(data.reviews)
  )
    throw new Error(
      'Development result does not match the current saved barrier.',
    );
  const notes = string(data.notes, 'development review');
  if (notes.trim().length < 30 || notes.length > 4000)
    throw new Error(
      'Record the actual constrained-code review and its limits.',
    );
  const reviews = data.reviews.map(parseWorldReview),
    run = learningExecutionRun(state);
  if (
    lastLearningFrame(run).tick !== b.tick ||
    JSON.stringify(worldLearningInput(run)) !== JSON.stringify(b.input)
  )
    throw new Error('Development barrier input changed.');
  reviewedSkills(lastLearningFrame(run), learningActions(run), reviews);
  return {
    ...state,
    phase: 'running',
    barrier: null,
    developments: [
      ...state.developments,
      { barrier: b, reviews, notes, reviewer: 'current-codex-conversation' },
    ],
  };
}
/** Durable decisions before the atomic round barrier. No automatic retry of an uncertain call. */
export async function continueLearningExecution(
  input: LearningExecution,
  provider: LearningProvider,
  persist: (state: LearningExecution) => Promise<void>,
): Promise<LearningExecution> {
  let state = input,
    run = learningExecutionRun(state);
  if (state.attempts.some((a) => a.status === 'started'))
    throw new Error(
      'An interrupted model attempt has uncertain outcome. Do not repeat it; inspect the retained attempt before recovery.',
    );
  if (state.phase === 'development') return state;
  const save = async () => {
    state = { ...state, programs: run.programs, rounds: run.rounds };
    await persist(state);
  };
  while (lastLearningFrame(run).tick < LEARNING_LIMITS.rounds) {
    const tick = lastLearningFrame(run).tick;
    for (const actor of pendingLearningPrograms(run)) {
      const input = ordinaryLearningInput(run, actor),
        call = (run.cursors[actor]?.calls ?? 0) + 1;
      const started: LearningAttempt = {
        role: 'ordinary',
        actor,
        tick,
        call,
        input,
        status: 'started',
      };
      const index = state.attempts.length;
      state = { ...state, attempts: [...state.attempts, started] };
      await save();
      let response: ProgramResponse | undefined,
        program: LearningProgram,
        attempt: LearningAttempt;
      try {
        response = await provider('ordinary', input);
        program = {
          agentId: actor,
          tick,
          call,
          ...parseOrdinaryLearning(response.decision.text, actor, tick),
        };
        attempt = { ...started, response, status: 'accepted' };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Ordinary decision failed.';
        program = {
          agentId: actor,
          tick,
          call,
          code: null,
          summary:
            'No accepted decision; one-round wait fallback. The attempted call consumed budget.',
        };
        attempt = {
          ...started,
          status: response ? 'rejected' : 'failed',
          ...(response ? { response } : {}),
          error: message,
        };
      }
      state = {
        ...state,
        attempts: state.attempts.map((a, i) => (i === index ? attempt : a)),
      };
      run = acceptLearningProgram(run, program);
      await save();
    }
    const requests = learningActions(run).filter(
      (a) =>
        a.type === 'learn' &&
        learningData(lastLearningFrame(run)).vitals[a.agentId]?.health !== 0,
    );
    let reviews: readonly WorldReview[] = [];
    if (requests.length) {
      const development = state.developments.find(
        (d) => d.barrier.tick === tick,
      );
      const accepted = state.attempts.find(
        (a) => a.role === 'world' && a.tick === tick && a.status === 'accepted',
      );
      if (development) reviews = development.reviews;
      else if (accepted?.response)
        reviews = parseWorldLearning(accepted.response.decision.text).reviews;
      else {
        const prior = state.attempts.filter(
          (a) => a.role === 'world' && a.tick === tick,
        );
        const errors = prior.flatMap((a) => (a.error ? [a.error] : []));
        let resolved = false,
          proposed: string | null =
            prior.at(-1)?.response?.decision.text ?? null;
        for (
          let retry = prior.length;
          retry < LEARNING_LIMITS.attemptsPerBatch &&
          prior.at(-1)?.status !== 'development';
          retry++
        ) {
          const calls = state.attempts.filter((a) => a.role === 'world').length;
          if (calls >= LEARNING_LIMITS.worldAttempts) {
            reviews = budgetReviews(run);
            resolved = true;
            break;
          }
          const input = worldLearningInput(run, errors.at(-1) ?? null),
            started: LearningAttempt = {
              role: 'world',
              actor: 'world',
              tick,
              call: calls + 1,
              input,
              status: 'started',
            };
          const index = state.attempts.length;
          state = { ...state, attempts: [...state.attempts, started] };
          await save();
          let response: ProgramResponse | undefined, attempt: LearningAttempt;
          try {
            response = await provider('world', input);
            proposed = response.decision.text;
            const result = parseWorldLearning(proposed);
            if (result.needsDevelopment) {
              errors.push(
                'World Agent requested current-conversation constrained implementation development.',
              );
              attempt = {
                ...started,
                status: 'development',
                response,
                error: errors.at(-1) ?? 'Development requested.',
              };
            } else {
              reviewedSkills(
                lastLearningFrame(run),
                learningActions(run),
                result.reviews,
              );
              reviews = result.reviews;
              resolved = true;
              attempt = { ...started, status: 'accepted', response };
            }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'World review failed.';
            errors.push(message);
            attempt = {
              ...started,
              status: response ? 'rejected' : 'failed',
              ...(response ? { response } : {}),
              error: message,
            };
          }
          state = {
            ...state,
            attempts: state.attempts.map((a, i) => (i === index ? attempt : a)),
          };
          await save();
          if (resolved || attempt.status === 'development') break;
        }
        if (!resolved) {
          const barrier: DevelopmentBarrier = {
            id: `round-${String(tick)}-world-${String(state.attempts.filter((a) => a.role === 'world').length)}`,
            tick,
            input: worldLearningInput(run),
            errors,
            proposed,
          };
          state = { ...state, phase: 'development', barrier };
          await save();
          return state;
        }
      }
    }
    run = advanceLearningRound(run, reviews);
    await save();
  }
  state = { ...state, phase: 'completed' };
  await save();
  return state;
}
