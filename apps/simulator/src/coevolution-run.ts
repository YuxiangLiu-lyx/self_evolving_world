import type { DevelopmentReviewer } from './development-identity.js';
import {
  lastCoevolutionFrame,
  coevolutionActions,
  coevolutionData,
  parseCoevolutionCode,
  parseCoevolutionProposal,
  reconstructCoevolutionRun,
  registerCoevolution,
  COEVOLUTION_LIMITS,
  parseProject,
} from '@self-evolving-world/world-core';
import type {
  CoevolutionProgram,
  CoevolutionRound,
  CoevolutionRun,
  CoevolutionProposal,
  PersonalProject,
  WorldState,
} from '@self-evolving-world/world-core';
import { initialCoevolutionWorld } from './coevolution-scenario.js';
import { worldCoevolutionInput } from './coevolution-input.js';
import type {
  OrdinaryCoevolutionInput,
  WorldCoevolutionInput,
} from './coevolution-input.js';
import type { ProgramResponse } from './survival-run.js';
import { record, string } from './remote-data.js';

export interface CoevolutionAttempt {
  readonly role: 'ordinary' | 'world';
  readonly actor: string;
  readonly tick: number;
  readonly call: number;
  readonly input: OrdinaryCoevolutionInput | WorldCoevolutionInput;
  readonly status:
    'started' | 'accepted' | 'rejected' | 'failed' | 'development';
  readonly response?: ProgramResponse;
  readonly error?: string;
  readonly reason: string;
  readonly startedAt: string;
  readonly elapsedMs: number | null;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  } | null;
}
export interface CDevelopmentBarrier {
  readonly id: string;
  readonly tick: number;
  readonly input: WorldCoevolutionInput;
  readonly errors: readonly string[];
  readonly proposed: string | null;
}
export interface CDevelopmentResult {
  readonly barrier: CDevelopmentBarrier;
  readonly proposal: CoevolutionProposal;
  readonly notes: string;
  readonly reviewer: DevelopmentReviewer;
}
export interface CDevelopmentAttempt {
  readonly barrierId: string;
  readonly tick: number;
  readonly submittedAt: string;
  readonly elapsedMs: number;
  readonly input: unknown;
  readonly status: 'accepted' | 'rejected';
  readonly error: string | null;
  readonly modelCalls: null;
  readonly inputTokens: null;
  readonly outputTokens: null;
}
export interface CoevolutionExecution {
  readonly version: 1;
  readonly controller: 'chatgpt-plan' | 'simulated-test';
  readonly model: string;
  readonly programs: readonly CoevolutionProgram[];
  readonly rounds: readonly CoevolutionRound[];
  readonly attempts: readonly CoevolutionAttempt[];
  readonly developments: readonly CDevelopmentResult[];
  readonly developmentAttempts: readonly CDevelopmentAttempt[];
  readonly phase: 'running' | 'development' | 'paused' | 'completed';
  readonly stopReason: string | null;
  readonly checkpoints: readonly CoevolutionCheckpoint[];
  readonly developmentMetering: 'Conversation interventions capped at 10; internal model calls and tokens unavailable, not zero.';
  readonly barrier: CDevelopmentBarrier | null;
}
export function coevolutionExecutionRun(
  state: CoevolutionExecution,
): CoevolutionRun {
  return reconstructCoevolutionRun(
    initialCoevolutionWorld(),
    state.programs,
    state.rounds,
  );
}
export function parseOrdinaryCoevolution(
  answer: string,
  actor: string,
  tick: number,
): {
  code: string;
  summary: string;
  project: PersonalProject;
} {
  const value = record(JSON.parse(answer) as unknown);
  if (Object.keys(value).sort().join(',') !== 'code,project,summary')
    throw new Error('Expected code, summary and project.');
  const code = string(value.code, 'code'),
    summary = string(value.summary, 'summary');
  if (!summary.trim() || summary.length > 400)
    throw new Error('Invalid program summary.');
  parseCoevolutionCode(code, actor, 180 - tick);
  return { code, summary, project: parseProject(value.project) };
}
export function parseWorldCoevolution(answer: string): {
  proposal: CoevolutionProposal;
  needsDevelopment: boolean;
} {
  const value = record(JSON.parse(answer) as unknown);
  if (
    Object.keys(value).sort().join(',') !== 'needsDevelopment,proposal' ||
    typeof value.needsDevelopment !== 'boolean'
  )
    throw new Error('Invalid World Agent envelope.');
  return {
    proposal: parseCoevolutionProposal(value.proposal),
    needsDevelopment: value.needsDevelopment,
  };
}
/** A response repairs only the saved barrier. It neither advances time nor invokes inference. */
export function acceptCDevelopment(
  state: CoevolutionExecution,
  input: unknown,
  reviewer: DevelopmentReviewer = 'current-codex-conversation',
): CoevolutionExecution {
  const data = record(input),
    b = state.barrier;
  if (
    state.developmentAttempts.length >=
      COEVOLUTION_LIMITS.developmentInterventions ||
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
  const proposal = parseCoevolutionProposal(data.proposal),
    run = coevolutionExecutionRun(state);
  if (
    lastCoevolutionFrame(run).tick !== b.tick ||
    JSON.stringify(worldCoevolutionInput(run)) !== JSON.stringify(b.input)
  )
    throw new Error('Development barrier input changed.');
  registerCoevolution(
    lastCoevolutionFrame(run),
    coevolutionActions(run),
    proposal,
  );
  return {
    ...state,
    phase: 'running',
    barrier: null,
    developments: [
      ...state.developments,
      { barrier: b, proposal, notes, reviewer },
    ],
  };
}

export interface CoevolutionCheckpoint {
  readonly tick: number;
  readonly world: WorldState;
  readonly programs: number;
  readonly attempts: number;
  readonly developments: number;
  readonly developmentAttempts: number;
  readonly projects: Readonly<Record<string, PersonalProject | null>>;
  readonly report: {
    readonly survivors: number;
    readonly minimumSatiety: number;
    readonly objects: number;
    readonly benefitEvents: number;
    readonly sustainedProjectProgress: boolean;
  };
}
export function coevolutionProgress(run: CoevolutionRun): boolean {
  const world = lastCoevolutionFrame(run),
    data = coevolutionData(world);
  if (data.benefits.length) return true;
  return world.agents.some((a) => {
    const project = run.cursors[a.id]?.project;
    if (!project || /^none[. ]*$/i.test(project.problem)) return false;
    const events = run.frames
      .slice(-30)
      .flatMap(
        (f) =>
          f.coevolution?.events.filter(
            (e) =>
              e.action.agentId === a.id &&
              ((e.outcome === 'used' && e.skillId !== 'ability-1') ||
                e.outcome === 'studying' ||
                (e.outcome === 'learned' && e.skillId !== 'ability-1')),
          ) ?? [],
      );
    return events.length >= 2;
  });
}
export function makeCoevolutionCheckpoint(
  run: CoevolutionRun,
  state: CoevolutionExecution,
): CoevolutionCheckpoint {
  const world = lastCoevolutionFrame(run),
    data = coevolutionData(world);
  return {
    tick: world.tick,
    world,
    programs: run.programs.length,
    attempts: state.attempts.length,
    developments: state.developments.length,
    developmentAttempts: state.developmentAttempts.length,
    projects: Object.fromEntries(
      Object.entries(run.cursors).map(([id, c]) => [id, c.project]),
    ),
    report: {
      survivors: Object.values(data.vitals).filter((v) => v.health > 0).length,
      minimumSatiety: Math.min(
        ...Object.values(data.vitals).map((v) => v.satiety),
      ),
      objects: data.objects.length,
      benefitEvents: data.benefits.length,
      sustainedProjectProgress: coevolutionProgress(run),
    },
  };
}
