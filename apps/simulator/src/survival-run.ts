import {
  acceptProgram,
  advanceProgramRound,
  createProgramRun,
  createSurvivalWorld,
  parseBehaviorCode,
  pendingPrograms,
  PROGRAM_LIMITS,
} from '@self-evolving-world/world-core';
import type {
  ProgramRecord,
  ProgramRun,
  WorldState,
} from '@self-evolving-world/world-core';
import { experimentWorld } from './experiment.js';
import type { ModelDecision } from './experiment.js';
import { record, string } from './remote-data.js';

export const SURVIVAL_OBJECTIVE =
  'Verify ChatGPT plan-funded behavior programs for three agents over 60 synchronous survival rounds, with at most five calls per agent, mild conditions and every learning request denied without a World Agent.';
export function initialSurvivalWorld(): WorldState {
  const initial = experimentWorld();
  return createSurvivalWorld({
    settings: initial.settings,
    agents: initial.agents,
    items: initial.items,
  });
}
export function programInput(run: ProgramRun, agentId: string) {
  const frame = run.frames.at(-1),
    cursor = run.cursors[agentId];
  const observation = frame?.observations.find((o) => o.self.id === agentId);
  const vitals = frame?.survival?.vitals[agentId];
  if (!frame?.survival || !cursor || !observation || !vitals)
    throw new Error('Missing program observation.');
  return {
    observation,
    vitals,
    settings: frame.settings,
    rules: frame.rules,
    survival: frame.survival.config,
    remainingRounds: PROGRAM_LIMITS.rounds - frame.tick,
    remainingCalls: PROGRAM_LIMITS.callsPerAgent - cursor.calls,
    previousProgram: cursor.active,
    previousOutcome:
      frame.survival.events.find((e) => e.action.agentId === agentId) ?? null,
  };
}
export type ProgramInput = ReturnType<typeof programInput>;
export interface ProgramResponse {
  readonly decision: ModelDecision;
  readonly http: {
    readonly status: number;
    readonly requestId: string | null;
    readonly contentType: string | null;
  };
}
export interface ModelAttempt {
  readonly agentId: string;
  readonly tick: number;
  readonly call: number;
  readonly input: ProgramInput;
  readonly status: 'started' | 'accepted' | 'rejected' | 'failed';
  readonly response?: ProgramResponse;
  readonly error?: string;
}
export function programDecision(
  answer: string,
  agentId: string,
  remaining: number,
): { code: string; summary: string } {
  const value = record(JSON.parse(answer) as unknown);
  if (Object.keys(value).sort().join(',') !== 'code,summary')
    throw new Error('Expected only code and summary.');
  const code = string(value.code, 'behavior code'),
    summary = string(value.summary, 'program summary').trim();
  if (!summary || summary.length > 240)
    throw new Error('Program summary must contain 1-240 characters.');
  parseBehaviorCode(code, agentId, remaining);
  return { code, summary };
}
export async function runSurvivalPrograms(
  provider: (input: ProgramInput) => Promise<ProgramResponse>,
  persist: (
    attempts: readonly ModelAttempt[],
    run: ProgramRun,
  ) => Promise<void>,
): Promise<{ run: ProgramRun; attempts: readonly ModelAttempt[] }> {
  let run = createProgramRun(initialSurvivalWorld());
  const attempts: ModelAttempt[] = [];
  while (run.frames.length <= PROGRAM_LIMITS.rounds) {
    // Network requests may be sequential; every actor still observes the same round-start world.
    for (const agentId of pendingPrograms(run)) {
      const input = programInput(run, agentId);
      const call = (run.cursors[agentId]?.calls ?? 0) + 1;
      const started: ModelAttempt = {
        agentId,
        tick: input.observation.tick,
        call,
        input,
        status: 'started',
      };
      const index = attempts.push(started) - 1;
      // Persist before inference. Interrupted attempts remain consumed and cannot be silently resumed.
      await persist(attempts, run);
      let response: ProgramResponse | undefined;
      let program: ProgramRecord;
      try {
        response = await provider(input);
        const decision = programDecision(
          response.decision.text,
          agentId,
          input.remainingRounds,
        );
        program = { agentId, tick: started.tick, call, ...decision };
        attempts[index] = { ...started, status: 'accepted', response };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Program request failed.';
        program = {
          agentId,
          tick: started.tick,
          call,
          code: null,
          summary:
            'No accepted program. Wait for this round; the attempted call consumed budget.',
        };
        attempts[index] = {
          ...started,
          status: response ? 'rejected' : 'failed',
          ...(response ? { response } : {}),
          error: message,
        };
      }
      run = acceptProgram(run, program);
      await persist(attempts, run);
    }
    run = advanceProgramRound(run);
    await persist(attempts, run);
  }
  return { run, attempts: Object.freeze(attempts) };
}
