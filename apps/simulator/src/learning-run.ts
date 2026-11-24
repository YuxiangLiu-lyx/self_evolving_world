import {
  lastLearningFrame,
  learningActions,
  parseLearningCode,
  parseWorldReview,
  reconstructLearningRun,
  reviewedSkills,
} from '@self-evolving-world/world-core';
import type {
  LearningProgram,
  LearningRound,
  LearningRun,
  WorldReview,
} from '@self-evolving-world/world-core';
import { initialLearningWorld } from './learning-scenario.js';
import { worldLearningInput } from './learning-input.js';
import type {
  OrdinaryLearningInput,
  WorldLearningInput,
} from './learning-input.js';
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
