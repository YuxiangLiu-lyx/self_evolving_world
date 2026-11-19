import {
  acceptCoevolutionProgram,
  advanceCoevolutionRound,
  lastCoevolutionFrame,
  coevolutionActions,
  coevolutionData,
  parseCoevolutionCode,
  parseCoevolutionProposal,
  EMPTY_COEVOLUTION_PROPOSAL,
  pendingCoevolutionPrograms,
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
import {
  ordinaryCoevolutionInput,
  worldCoevolutionInput,
} from './coevolution-input.js';
import type {
  OrdinaryCoevolutionInput,
  WorldCoevolutionInput,
} from './coevolution-input.js';
import type { CoevolutionProvider } from './coevolution-provider.js';
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
  readonly reviewer: 'current-codex-conversation';
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
export function newCoevolutionExecution(
  model: string,
  controller: CoevolutionExecution['controller'],
): CoevolutionExecution {
  return {
    version: 1,
    controller,
    model,
    programs: [],
    rounds: [],
    attempts: [],
    developments: [],
    developmentAttempts: [],
    phase: 'running',
    barrier: null,
    stopReason: null,
    checkpoints: [],
    developmentMetering:
      'Conversation interventions capped at 10; internal model calls and tokens unavailable, not zero.',
  };
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
      { barrier: b, proposal, notes, reviewer: 'current-codex-conversation' },
    ],
  };
}

/** Record failed handoff submissions as well as accepted ones; internal model usage remains unknown. */
export function recordCDevelopmentAttempt(
  state: CoevolutionExecution,
  input: unknown,
): { state: CoevolutionExecution; error: string | null } {
  if (
    !state.barrier ||
    state.phase !== 'development' ||
    state.developmentAttempts.length >= 10
  )
    throw new Error('No eligible development attempt remains.');
  const submittedAt = new Date().toISOString(),
    began = performance.now();
  let next = state,
    error: string | null = null;
  try {
    next = acceptCDevelopment(state, input);
  } catch (cause) {
    error =
      cause instanceof Error ? cause.message : 'Development validation failed.';
  }
  const attempt: CDevelopmentAttempt = {
    barrierId: state.barrier.id,
    tick: state.barrier.tick,
    submittedAt,
    elapsedMs: performance.now() - began,
    input,
    status: error ? 'rejected' : 'accepted',
    error,
    modelCalls: null,
    inputTokens: null,
    outputTokens: null,
  };
  next = {
    ...next,
    developmentAttempts: [...state.developmentAttempts, attempt],
  };
  if (next.developmentAttempts.length === 10)
    next = {
      ...next,
      phase: 'paused',
      stopReason:
        'Development submission budget exhausted, including failures; entire world paused. Internal model calls remain unmetered.',
    };
  return { state: next, error };
}

/** Durable decisions before the atomic round barrier. No automatic retry of an uncertain call. */
export async function continueCoevolutionExecution(
  input: CoevolutionExecution,
  provider: CoevolutionProvider,
  persist: (state: CoevolutionExecution) => Promise<void>,
): Promise<CoevolutionExecution> {
  let state = input,
    run = coevolutionExecutionRun(state);
  if (state.attempts.some((a) => a.status === 'started'))
    throw new Error(
      'An interrupted model attempt has uncertain outcome. Do not repeat it; inspect the retained attempt before recovery.',
    );
  if (state.phase !== 'running') return state;
  const save = async () => {
    state = { ...state, programs: run.programs, rounds: run.rounds };
    const world = lastCoevolutionFrame(run);
    if (
      COEVOLUTION_LIMITS.stages.includes(world.tick) &&
      !state.checkpoints.some((c) => c.tick === world.tick)
    )
      state = {
        ...state,
        checkpoints: [
          ...state.checkpoints,
          makeCoevolutionCheckpoint(run, state),
        ],
      };
    await persist(state);
  };
  while (lastCoevolutionFrame(run).tick < COEVOLUTION_LIMITS.rounds) {
    const tick = lastCoevolutionFrame(run).tick;
    const pause = async (reason: string) => {
      state = { ...state, phase: 'paused', stopReason: reason };
      await save();
      return state;
    };
    if (
      state.attempts.filter((a) => a.role === 'ordinary').length >=
      COEVOLUTION_LIMITS.ordinaryAttempts
    )
      return pause(
        'Ordinary attempted-call budget exhausted; entire world paused before the next round.',
      );
    if (
      state.attempts.filter((a) => a.role === 'world').length >=
      COEVOLUTION_LIMITS.worldAttempts
    )
      return pause(
        'World attempted-call budget exhausted; entire world paused before the next round.',
      );
    if (tick === 60 && !coevolutionProgress(run)) {
      state = {
        ...state,
        phase: 'completed',
        stopReason:
          'Preregistered round-60 stop: neither measured benefit nor sustained project progress.',
      };
      await save();
      return state;
    }
    for (const actor of pendingCoevolutionPrograms(run)) {
      const input = ordinaryCoevolutionInput(run, actor),
        call = (run.cursors[actor]?.calls ?? 0) + 1;
      const started: CoevolutionAttempt = {
        role: 'ordinary',
        actor,
        tick,
        call,
        input,
        status: 'started',
        reason:
          run.cursors[actor]?.interruption ?? 'Plan ended or initial decision.',
        startedAt: new Date().toISOString(),
        elapsedMs: null,
        usage: null,
      };
      const index = state.attempts.length;
      state = { ...state, attempts: [...state.attempts, started] };
      await save();
      if (
        state.attempts.filter((a) => a.role === 'ordinary').length >
        COEVOLUTION_LIMITS.ordinaryAttempts
      )
        throw new Error('Ordinary budget reservation exceeded.');
      const began = performance.now();
      let response: Awaited<ReturnType<CoevolutionProvider>> | undefined,
        program: CoevolutionProgram,
        attempt: CoevolutionAttempt;
      try {
        response = await provider('ordinary', input);
        program = {
          agentId: actor,
          tick,
          call,
          ...parseOrdinaryCoevolution(response.decision.text, actor, tick),
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
          project: null,
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
      attempt = {
        ...attempt,
        elapsedMs: performance.now() - began,
        usage: response?.usage ?? null,
      };
      state = {
        ...state,
        attempts: state.attempts.map((a, i) => (i === index ? attempt : a)),
      };
      run = acceptCoevolutionProgram(run, program);
      await save();
      if (
        state.attempts.filter((a) => a.role === 'ordinary').length >=
        COEVOLUTION_LIMITS.ordinaryAttempts
      )
        return pause(
          'Ordinary attempted-call budget exhausted; pending plans retained without advancing time.',
        );
    }
    const requests = coevolutionActions(run).filter(
      (a) =>
        a.type === 'learn' &&
        coevolutionData(lastCoevolutionFrame(run)).vitals[a.agentId]?.health !==
          0,
    );
    let proposal: CoevolutionProposal = EMPTY_COEVOLUTION_PROPOSAL;
    if (requests.length) {
      const development = state.developments.find(
        (d) => d.barrier.tick === tick,
      );
      const accepted = state.attempts.find(
        (a) => a.role === 'world' && a.tick === tick && a.status === 'accepted',
      );
      if (development) proposal = development.proposal;
      else if (accepted?.response)
        proposal = parseWorldCoevolution(
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
          retry < COEVOLUTION_LIMITS.attemptsPerBatch &&
          prior.at(-1)?.status !== 'development';
          retry++
        ) {
          const calls = state.attempts.filter((a) => a.role === 'world').length;
          if (calls >= COEVOLUTION_LIMITS.worldAttempts) {
            return pause(
              'World attempted-call budget exhausted; unresolved review and world retained.',
            );
          }
          const input = worldCoevolutionInput(run, errors.at(-1) ?? null),
            started: CoevolutionAttempt = {
              role: 'world',
              actor: 'world',
              tick,
              call: calls + 1,
              input,
              status: 'started',
              reason: retry
                ? 'Retry failed batched review.'
                : 'Batched functional capability requests.',
              startedAt: new Date().toISOString(),
              elapsedMs: null,
              usage: null,
            };
          const index = state.attempts.length;
          state = { ...state, attempts: [...state.attempts, started] };
          await save();
          const began = performance.now();
          let response: Awaited<ReturnType<CoevolutionProvider>> | undefined,
            attempt: CoevolutionAttempt;
          try {
            response = await provider('world', input);
            proposed = response.decision.text;
            const result = parseWorldCoevolution(proposed);
            if (result.needsDevelopment) {
              errors.push(
                'World Agent requested current-conversation constrained implementation development.',
              );
              attempt = {
                ...started,
                status: 'development',
                response,
                error: errors.at(-1) ?? 'CDevelopment requested.',
              };
            } else {
              registerCoevolution(
                lastCoevolutionFrame(run),
                coevolutionActions(run),
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
          attempt = {
            ...attempt,
            elapsedMs: performance.now() - began,
            usage: response?.usage ?? null,
          };
          state = {
            ...state,
            attempts: state.attempts.map((a, i) => (i === index ? attempt : a)),
          };
          await save();
          if (resolved || attempt.status === 'development') break;
        }
        if (!resolved) {
          if (
            state.developmentAttempts.length >=
            COEVOLUTION_LIMITS.developmentInterventions
          )
            return pause(
              'Development intervention budget exhausted; actual conversation model usage is unavailable.',
            );
          const barrier: CDevelopmentBarrier = {
            id: `round-${String(tick)}-world-${String(state.attempts.filter((a) => a.role === 'world').length)}`,
            tick,
            input: worldCoevolutionInput(run),
            errors,
            proposed,
          };
          state = { ...state, phase: 'development', barrier };
          await save();
          return state;
        }
      }
    }
    run = advanceCoevolutionRound(run, proposal);
    await save();
  }
  state = {
    ...state,
    phase: 'completed',
    stopReason: 'Target of 180 rounds reached.',
  };
  await save();
  return state;
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
