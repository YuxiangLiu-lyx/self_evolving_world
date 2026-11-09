import { parseSurvivalAction, stepSurvivalRound } from './survival.js';
import type { SurvivalAction, WorldState } from './world.js';

export const PROGRAM_LIMITS = Object.freeze({
  rounds: 60,
  callsPerAgent: 5,
  codeCharacters: 4000,
});
export interface ProgramRecord {
  readonly agentId: string;
  /** Round-start observation tick, before executing the first instruction. */
  readonly tick: number;
  readonly call: number;
  readonly code: string | null;
  readonly summary: string;
}

/** A finite command language, not JavaScript. Never eval, import or execute host code. */
export function parseBehaviorCode(
  code: string,
  agentId: string,
  remaining = 60,
): readonly SurvivalAction[] {
  if (
    typeof code !== 'string' ||
    !code.trim() ||
    code.length > PROGRAM_LIMITS.codeCharacters ||
    !Number.isInteger(remaining) ||
    remaining < 1 ||
    remaining > 60
  )
    throw new RangeError('Invalid behavior program length.');
  const actions: SurvivalAction[] = [];
  const statement = /\s*(move|pickup|learn|wait)\(([^()]*)\)\s*;/gy;
  let offset = 0;
  while (offset < code.trimEnd().length) {
    statement.lastIndex = offset;
    const match = statement.exec(code);
    if (!match)
      throw new RangeError(
        'Only move, pickup, learn and wait statements are supported.',
      );
    const args: unknown = JSON.parse(`[${match[2] ?? ''}]`);
    if (!Array.isArray(args))
      throw new RangeError('Invalid program arguments.');
    const name = match[1];
    const duration: unknown =
      name === 'move' ? args[1] : name === 'wait' ? args[0] : 1;
    if (
      args.length !== (name === 'move' ? 2 : 1) ||
      typeof duration !== 'number' ||
      !Number.isInteger(duration) ||
      duration < 1 ||
      actions.length + duration > remaining
    )
      throw new RangeError(
        'Program duration exceeds remaining rounds or has invalid arguments.',
      );
    const action = parseSurvivalAction({
      type: name,
      agentId,
      ...(name === 'move'
        ? { direction: args[0] as unknown }
        : name === 'pickup'
          ? { itemId: args[0] as unknown }
          : name === 'learn'
            ? { skill: args[0] as unknown }
            : {}),
    });
    actions.push(...Array.from({ length: duration }, () => action));
    offset = statement.lastIndex;
  }
  return Object.freeze(actions);
}

export function parseProgramRecords(input: unknown): readonly ProgramRecord[] {
  if (!Array.isArray(input) || input.length > 160)
    throw new RangeError('Invalid program records.');
  return Object.freeze(
    input.map((value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new RangeError('Invalid program record.');
      const p = value as Record<string, unknown>;
      if (
        Object.keys(p).sort().join(',') !== 'agentId,call,code,summary,tick' ||
        typeof p.agentId !== 'string' ||
        typeof p.tick !== 'number' ||
        !Number.isInteger(p.tick) ||
        p.tick < 0 ||
        p.tick >= 60 ||
        typeof p.call !== 'number' ||
        !Number.isInteger(p.call) ||
        p.call < 1 ||
        p.call > 5 ||
        (p.code !== null && typeof p.code !== 'string') ||
        typeof p.summary !== 'string' ||
        !p.summary.trim() ||
        p.summary.length > 240
      )
        throw new RangeError('Invalid program fields.');
      if (p.code !== null) parseBehaviorCode(p.code, p.agentId, 60 - p.tick);
      return Object.freeze({
        agentId: p.agentId,
        tick: p.tick,
        call: p.call,
        code: p.code,
        summary: p.summary,
      });
    }),
  );
}

export interface ProgramCursor {
  readonly calls: number;
  readonly active: ProgramRecord | null;
  readonly remaining: readonly SurvivalAction[];
}
export interface ProgramRun {
  readonly frames: readonly WorldState[];
  readonly programs: readonly ProgramRecord[];
  readonly cursors: Readonly<Record<string, ProgramCursor>>;
}
export function createProgramRun(initial: WorldState): ProgramRun {
  if (!initial.survival || initial.tick !== 0)
    throw new RangeError('A program run requires a new survival world.');
  return Object.freeze({
    frames: Object.freeze([initial]),
    programs: Object.freeze([]),
    cursors: Object.freeze(
      Object.fromEntries(
        initial.agents.map(({ id }) => [
          id,
          Object.freeze({
            calls: 0,
            active: null,
            remaining: Object.freeze([]),
          }),
        ]),
      ),
    ),
  });
}
export function pendingPrograms(run: ProgramRun): readonly string[] {
  const frame = run.frames.at(-1);
  if (!frame || frame.tick >= 60) return [];
  return frame.agents
    .filter(
      ({ id }) =>
        (frame.survival?.vitals[id]?.health ?? 0) > 0 &&
        run.cursors[id]?.remaining.length === 0 &&
        run.cursors[id].calls < 5 &&
        run.cursors[id].active?.tick !== frame.tick,
    )
    .map(({ id }) => id);
}
/** Failed attempts consume budget and wait one round; exhausted actors wait explicitly. */
export function acceptProgram(
  run: ProgramRun,
  input: ProgramRecord,
): ProgramRun {
  const program = parseProgramRecords([input])[0],
    frame = run.frames.at(-1);
  if (!program || !frame || !pendingPrograms(run).includes(program.agentId))
    throw new RangeError('Actor is not eligible for a new program.');
  const current = run.cursors[program.agentId];
  if (
    !current ||
    program.tick !== frame.tick ||
    program.call !== current.calls + 1
  )
    throw new RangeError('Program revision or budget mismatch.');
  return Object.freeze({
    ...run,
    programs: Object.freeze([...run.programs, program]),
    cursors: Object.freeze({
      ...run.cursors,
      [program.agentId]: Object.freeze({
        calls: program.call,
        active: program,
        remaining:
          program.code === null
            ? Object.freeze([])
            : parseBehaviorCode(program.code, program.agentId, 60 - frame.tick),
      }),
    }),
  });
}
export function advanceProgramRound(run: ProgramRun): ProgramRun {
  const frame = run.frames.at(-1);
  if (!frame || frame.tick >= 60 || pendingPrograms(run).length > 0)
    throw new RangeError(
      'Resolve pending requests before advancing an available round.',
    );
  const actions = frame.agents.map(
    ({ id }): SurvivalAction =>
      run.cursors[id]?.remaining[0] ?? { type: 'wait', agentId: id },
  );
  const next = stepSurvivalRound(frame, actions);
  return Object.freeze({
    ...run,
    frames: Object.freeze([...run.frames, next]),
    cursors: Object.freeze(
      Object.fromEntries(
        Object.entries(run.cursors).map(([id, cursor]) => [
          id,
          Object.freeze({
            ...cursor,
            remaining: Object.freeze(cursor.remaining.slice(1)),
          }),
        ]),
      ),
    ),
  });
}
/** Reconstruct scheduling, budget and all transitions from saved programs, with no I/O. */
export function replayPrograms(
  initial: WorldState,
  input: unknown,
  rounds = 60,
): ProgramRun {
  const programs = parseProgramRecords(input);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 60)
    throw new RangeError('Invalid program round count.');
  let run = createProgramRun(initial),
    index = 0;
  while (run.frames.length <= rounds) {
    while (programs[index]?.tick === run.frames.length - 1) {
      const program = programs[index++];
      if (program) run = acceptProgram(run, program);
    }
    run = advanceProgramRound(run);
  }
  if (index !== programs.length)
    throw new RangeError('Program records are out of order or unused.');
  return run;
}
