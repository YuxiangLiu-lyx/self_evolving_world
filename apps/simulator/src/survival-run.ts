import {
  createSurvivalWorld,
  parseBehaviorCode,
  PROGRAM_LIMITS,
} from '@self-evolving-world/world-core';
import type { ProgramRun, WorldState } from '@self-evolving-world/world-core';
import { experimentWorld } from './experiment.js';
import type { ModelDecision } from './experiment.js';
import { record, string } from './remote-data.js';

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
