import {
  acceptEvolutionProgram,
  advanceEvolutionRound,
  lastEvolutionFrame,
  evolutionActions,
  evolutionData,
  parseEvolutionCode,
  parseEvolutionProposal,
  EMPTY_PROPOSAL,
  pendingEvolutionPrograms,
  reconstructEvolutionRun,
  registerEvolution,
  EVOLUTION_LIMITS,
} from '@self-evolving-world/world-core';
import type {
  EvolutionProgram,
  EvolutionRound,
  EvolutionRun,
  EvolutionProposal,
} from '@self-evolving-world/world-core';
import { initialEvolutionWorld } from './evolution-scenario.js';
import {
  ordinaryEvolutionInput,
  worldEvolutionInput,
} from './evolution-input.js';
import type {
  OrdinaryEvolutionInput,
  WorldEvolutionInput,
} from './evolution-input.js';
import type { EvolutionProvider } from './evolution-provider.js';
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
export function newEvolutionExecution(
  model: string,
  controller: EvolutionExecution['controller'],
): EvolutionExecution {
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
/** Durable decisions before the atomic round barrier. No automatic retry of an uncertain call. */
export async function continueEvolutionExecution(
  input: EvolutionExecution,
  provider: EvolutionProvider,
  persist: (state: EvolutionExecution) => Promise<void>,
): Promise<EvolutionExecution> {
  let state = input,
    run = evolutionExecutionRun(state);
  if (state.attempts.some((a) => a.status === 'started'))
    throw new Error(
      'An interrupted model attempt has uncertain outcome. Do not repeat it; inspect the retained attempt before recovery.',
    );
  if (state.phase === 'development') return state;
  const save = async () => {
    state = { ...state, programs: run.programs, rounds: run.rounds };
    await persist(state);
  };
  while (lastEvolutionFrame(run).tick < EVOLUTION_LIMITS.rounds) {
    const tick = lastEvolutionFrame(run).tick;
    for (const actor of pendingEvolutionPrograms(run)) {
      const input = ordinaryEvolutionInput(run, actor),
        call = (run.cursors[actor]?.calls ?? 0) + 1;
      const started: EvolutionAttempt = {
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
        program: EvolutionProgram,
        attempt: EvolutionAttempt;
      try {
        response = await provider('ordinary', input);
        program = {
          agentId: actor,
          tick,
          call,
          ...parseOrdinaryEvolution(response.decision.text, actor, tick),
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
      run = acceptEvolutionProgram(run, program);
      await save();
    }
    const requests = evolutionActions(run).filter(
      (a) =>
        a.type === 'learn' &&
        evolutionData(lastEvolutionFrame(run)).vitals[a.agentId]?.health !== 0,
    );
    let proposal: EvolutionProposal = EMPTY_PROPOSAL;
    if (requests.length) {
      const development = state.developments.find(
        (d) => d.barrier.tick === tick,
      );
      const accepted = state.attempts.find(
        (a) => a.role === 'world' && a.tick === tick && a.status === 'accepted',
      );
      if (development) proposal = development.proposal;
      else if (accepted?.response)
        proposal = parseWorldEvolution(
          accepted.response.decision.text,
        ).proposal;
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
          retry < EVOLUTION_LIMITS.attemptsPerBatch &&
          prior.at(-1)?.status !== 'development';
          retry++
        ) {
          const calls = state.attempts.filter((a) => a.role === 'world').length;
          if (calls >= EVOLUTION_LIMITS.worldAttempts) {
            proposal = budgetReviews(run);
            resolved = true;
            break;
          }
          const input = worldEvolutionInput(run, errors.at(-1) ?? null),
            started: EvolutionAttempt = {
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
          let response: ProgramResponse | undefined, attempt: EvolutionAttempt;
          try {
            response = await provider('world', input);
            proposed = response.decision.text;
            const result = parseWorldEvolution(proposed);
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
              registerEvolution(
                lastEvolutionFrame(run),
                evolutionActions(run),
                result.proposal,
              );
              proposal = result.proposal;
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
            input: worldEvolutionInput(run),
            errors,
            proposed,
          };
          state = { ...state, phase: 'development', barrier };
          await save();
          return state;
        }
      }
    }
    run = advanceEvolutionRound(run, proposal);
    await save();
  }
  state = { ...state, phase: 'completed' };
  await save();
  return state;
}
