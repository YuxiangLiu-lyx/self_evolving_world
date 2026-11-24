import {
  lastEvolutionFrame,
  evolutionActions,
  evolutionData,
  parseEvolutionCode,
  parseEvolutionProposal,
  EMPTY_PROPOSAL,
  reconstructEvolutionRun,
  registerEvolution,
} from '@self-evolving-world/world-core';
import type {
  EvolutionProgram,
  EvolutionRound,
  EvolutionRun,
  EvolutionProposal,
} from '@self-evolving-world/world-core';
import { initialEvolutionWorld } from './evolution-scenario.js';
import { worldEvolutionInput } from './evolution-input.js';
import type {
  OrdinaryEvolutionInput,
  WorldEvolutionInput,
} from './evolution-input.js';
import type { ProgramResponse } from './survival-run.js';
import { record, string } from './remote-data.js';

export interface EvolutionAttempt {
  readonly role: 'ordinary' | 'world';
  readonly actor: string;
  readonly tick: number;
  readonly call: number;
  readonly input: OrdinaryEvolutionInput | WorldEvolutionInput;
  readonly status:
    'started' | 'accepted' | 'rejected' | 'failed' | 'development';
  readonly response?: ProgramResponse;
  readonly error?: string;
}
export interface DevelopmentBarrier {
  readonly id: string;
  readonly tick: number;
  readonly input: WorldEvolutionInput;
  readonly errors: readonly string[];
  readonly proposed: string | null;
}
export interface DevelopmentResult {
  readonly barrier: DevelopmentBarrier;
  readonly proposal: EvolutionProposal;
  readonly notes: string;
  readonly reviewer: 'current-codex-conversation';
}
export interface EvolutionExecution {
  readonly version: 1;
  readonly controller: 'chatgpt-plan' | 'simulated-test';
  readonly model: string;
  readonly programs: readonly EvolutionProgram[];
  readonly rounds: readonly EvolutionRound[];
  readonly attempts: readonly EvolutionAttempt[];
  readonly developments: readonly DevelopmentResult[];
  readonly phase: 'running' | 'development' | 'completed';
  readonly barrier: DevelopmentBarrier | null;
}
export function evolutionExecutionRun(state: EvolutionExecution): EvolutionRun {
  return reconstructEvolutionRun(
    initialEvolutionWorld(),
    state.programs,
    state.rounds,
  );
}
export function parseOrdinaryEvolution(
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
  parseEvolutionCode(code, actor, 120 - tick);
  return { code, summary };
}
export function parseWorldEvolution(answer: string): {
  proposal: EvolutionProposal;
  needsDevelopment: boolean;
} {
  const value = record(JSON.parse(answer) as unknown);
  if (
    Object.keys(value).sort().join(',') !== 'needsDevelopment,proposal' ||
    typeof value.needsDevelopment !== 'boolean'
  )
    throw new Error('Invalid World Agent envelope.');
  return {
    proposal: parseEvolutionProposal(value.proposal),
    needsDevelopment: value.needsDevelopment,
  };
}
export function budgetReviews(run: EvolutionRun): EvolutionProposal {
  return {
    ...EMPTY_PROPOSAL,
    reviews: evolutionActions(run)
      .filter(
        (a) =>
          a.type === 'learn' &&
          evolutionData(lastEvolutionFrame(run)).vitals[a.agentId]?.health !==
            0,
      )
      .map((a) => ({
        agentId: a.agentId,
        decision: 'reject',
        reason: 'World attempt budget exhausted; no extension approved.',
        prerequisites: [],
        learningRounds: 0,
        mechanicId: null,
      })),
  };
}
/** A response repairs only the saved barrier. It neither advances time nor invokes inference. */
export function acceptDevelopment(
  state: EvolutionExecution,
  input: unknown,
): EvolutionExecution {
  const data = record(input),
    b = state.barrier;
  if (
    !b ||
    state.phase !== 'development' ||
    data.barrierId !== b.id ||
    data.tick !== b.tick ||
    Object.keys(data).sort().join(',') !== 'barrierId,notes,proposal,tick' ||
    !data.proposal
  )
    throw new Error(
      'Development result does not match the current saved barrier.',
    );
  const notes = string(data.notes, 'development review');
  if (notes.trim().length < 30 || notes.length > 4000)
    throw new Error(
      'Record the actual constrained-code review and its limits.',
    );
  const proposal = parseEvolutionProposal(data.proposal),
    run = evolutionExecutionRun(state);
  if (
    lastEvolutionFrame(run).tick !== b.tick ||
    JSON.stringify(worldEvolutionInput(run)) !== JSON.stringify(b.input)
  )
    throw new Error('Development barrier input changed.');
  registerEvolution(lastEvolutionFrame(run), evolutionActions(run), proposal);
  return {
    ...state,
    phase: 'running',
    barrier: null,
    developments: [
      ...state.developments,
      { barrier: b, proposal, notes, reviewer: 'current-codex-conversation' },
    ],
  };
}
