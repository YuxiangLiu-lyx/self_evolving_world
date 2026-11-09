import type { WorldState } from './world.js';
import type {
  LearningAction,
  LearningRound,
  WorldReview,
} from './learning-types.js';
import {
  learningData,
  parseLearningAction,
  parseLearningRound,
  stepLearningRound,
} from './learning.js';
import {
  boundedText,
  count,
  dataObject,
  exactKeys,
  freeze,
  list,
} from './skill-code.js';

export const LEARNING_LIMITS = freeze({
  rounds: 18,
  callsPerAgent: 12,
  worldAttempts: 12,
  attemptsPerBatch: 2,
  planRounds: 4,
  codeCharacters: 4000,
});
export interface LearningProgram {
  readonly agentId: string;
  readonly tick: number;
  readonly call: number;
  readonly code: string | null;
  readonly summary: string;
}
export interface LearningCursor {
  readonly calls: number;
  readonly active: LearningProgram | null;
  readonly remaining: readonly LearningAction[];
  readonly startSatiety: number;
  readonly interruption: string | null;
}
export interface LearningRun {
  readonly frames: readonly WorldState[];
  readonly rounds: readonly LearningRound[];
  readonly programs: readonly LearningProgram[];
  readonly cursors: Readonly<Record<string, LearningCursor>>;
}

/** JSON arguments plus finite calls: quoted punctuation is data, never host syntax. */
export function parseLearningCode(
  code: string,
  agentId: string,
  remaining = 4,
): readonly LearningAction[] {
  boundedText(code, LEARNING_LIMITS.codeCharacters);
  count(remaining, 1, 18);
  const actions: LearningAction[] = [];
  let offset = 0;
  const start = /\s*(move|pickup|learn|use|wait)\(/y;
  while (offset < code.trimEnd().length) {
    start.lastIndex = offset;
    const match = start.exec(code);
    if (!match)
      throw new RangeError(
        'Only finite move, pickup, learn, use and wait calls are supported.',
      );
    const begin = start.lastIndex;
    let end = begin,
      quoted = false,
      escaped = false;
    for (; end < code.length; end++) {
      const ch = code[end];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (quoted && ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') quoted = !quoted;
      if (!quoted && ch === ')') break;
    }
    const tail = /^\)\s*;/.exec(code.slice(end));
    if (!tail || quoted) throw new RangeError('Incomplete finite statement.');
    const args = list(JSON.parse(`[${code.slice(begin, end)}]`) as unknown, 2),
      type = match[1];
    const expected = type === 'move' || type === 'use' ? 2 : 1;
    if (args.length !== expected)
      throw new RangeError('Wrong action argument count.');
    const duration =
      type === 'move'
        ? count(args[1], 1, 4)
        : type === 'wait'
          ? count(args[0], 1, 4)
          : 1;
    if (
      actions.length + duration >
      Math.min(remaining, LEARNING_LIMITS.planRounds)
    )
      throw new RangeError('Plans cover at most four remaining rounds.');
    const action = parseLearningAction({
      type,
      agentId,
      ...(type === 'move'
        ? { direction: args[0] }
        : type === 'pickup'
          ? { itemId: args[0] }
          : type === 'learn'
            ? { request: args[0] }
            : type === 'use'
              ? { skillId: args[0], args: args[1] }
              : {}),
    });
    for (let n = 0; n < duration; n++) actions.push(action);
    offset = end + tail[0].length;
  }
  return freeze(actions);
}
export function parseLearningProgram(input: unknown): LearningProgram {
  const p = dataObject(input);
  exactKeys(p, ['agentId', 'tick', 'call', 'code', 'summary']);
  const agentId = boundedText(p.agentId, 80),
    tick = count(p.tick, 0, 17),
    call = count(p.call, 1, 12),
    summary = boundedText(p.summary, 400);
  const code = p.code === null ? null : boundedText(p.code, 4000);
  if (code !== null) parseLearningCode(code, agentId, 18 - tick);
  return freeze({ agentId, tick, call, code, summary });
}
export function createLearningRun(initial: WorldState): LearningRun {
  const data = learningData(initial);
  if (initial.tick !== 0)
    throw new RangeError('Learning run must begin at tick zero.');
  return freeze({
    frames: [initial],
    rounds: [],
    programs: [],
    cursors: Object.fromEntries(
      initial.agents.map((a) => [
        a.id,
        {
          calls: 0,
          active: null,
          remaining: [],
          startSatiety: data.vitals[a.id]?.satiety ?? 15,
          interruption: null,
        },
      ]),
    ),
  });
}
export function lastLearningFrame(run: LearningRun): WorldState {
  const f = run.frames.at(-1);
  if (!f) throw new RangeError('Missing learning frame.');
  return f;
}
export function pendingLearningPrograms(run: LearningRun): readonly string[] {
  const world = lastLearningFrame(run),
    data = learningData(world);
  if (world.tick >= 18) return [];
  return world.agents
    .filter(
      ({ id }) =>
        data.vitals[id]?.health !== 0 &&
        !data.knowledge[id]?.pending &&
        run.cursors[id]?.remaining.length === 0 &&
        run.cursors[id].calls < 12 &&
        run.cursors[id].active?.tick !== world.tick,
    )
    .map((a) => a.id);
}
export function acceptLearningProgram(
  run: LearningRun,
  input: unknown,
): LearningRun {
  const p = parseLearningProgram(input),
    world = lastLearningFrame(run),
    c = run.cursors[p.agentId];
  if (
    !c ||
    !pendingLearningPrograms(run).includes(p.agentId) ||
    p.tick !== world.tick ||
    p.call !== c.calls + 1
  )
    throw new RangeError(
      'Program is not eligible for this actor, round or budget.',
    );
  return freeze({
    ...run,
    programs: [...run.programs, p],
    cursors: {
      ...run.cursors,
      [p.agentId]: {
        calls: p.call,
        active: p,
        remaining:
          p.code === null
            ? []
            : parseLearningCode(p.code, p.agentId, 18 - world.tick),
        startSatiety: learningData(world).vitals[p.agentId]?.satiety ?? 0,
        interruption: null,
      },
    },
  });
}
export function learningActions(run: LearningRun): readonly LearningAction[] {
  if (pendingLearningPrograms(run).length)
    throw new RangeError(
      'Resolve every pending ordinary decision before the round barrier.',
    );
  const world = lastLearningFrame(run),
    data = learningData(world);
  return freeze(
    world.agents.map(({ id }): LearningAction =>
      data.knowledge[id]?.pending && data.vitals[id]?.health !== 0
        ? { type: 'study', agentId: id }
        : (run.cursors[id]?.remaining[0] ?? { type: 'wait', agentId: id }),
    ),
  );
}
export function advanceLearningRound(
  run: LearningRun,
  reviews: readonly WorldReview[],
): LearningRun {
  const world = lastLearningFrame(run);
  if (world.tick >= 18) throw new RangeError('Experiment horizon reached.');
  const round = { actions: learningActions(run), reviews };
  const next = stepLearningRound(world, round),
    data = learningData(next);
  const cursors = Object.fromEntries(
    Object.entries(run.cursors).map(([id, cursor]) => {
      const outcome = data.events.find((e) => e.action.agentId === id),
        before = learningData(world).vitals[id],
        after = data.vitals[id];
      let interruption: string | null = null;
      if (
        outcome &&
        [
          'learned',
          'studying',
          'learning-rejected',
          'already-learned',
        ].includes(outcome.outcome)
      )
        interruption = `Learning feedback: ${outcome.outcome}.`;
      else if (
        outcome &&
        /failed|blocked|bounds|occupied|conflict|not-found|out-of-reach/.test(
          outcome.outcome,
        )
      )
        interruption = `Action failed: ${outcome.outcome}.`;
      else if (
        before &&
        after &&
        (after.health < before.health ||
          cursor.startSatiety - after.satiety >= 9 ||
          (before.satiety > 0 && after.satiety === 0))
      )
        interruption =
          'Vital state deteriorated; reconsider the remaining plan.';
      return [
        id,
        {
          ...cursor,
          remaining: interruption ? [] : cursor.remaining.slice(1),
          interruption,
        },
      ];
    }),
  );
  return freeze({
    frames: [...run.frames, next],
    rounds: [...run.rounds, round],
    programs: run.programs,
    cursors,
  });
}
export function reconstructLearningRun(
  initial: WorldState,
  rawPrograms: unknown,
  rawRounds: unknown,
): LearningRun {
  const programs = list(rawPrograms, 384).map(parseLearningProgram),
    rounds = list(rawRounds, 18).map(parseLearningRound);
  let run = createLearningRun(initial),
    index = 0;
  for (const round of rounds) {
    while (programs[index]?.tick === run.rounds.length) {
      run = acceptLearningProgram(run, programs[index]);
      index++;
    }
    if (JSON.stringify(learningActions(run)) !== JSON.stringify(round.actions))
      throw new RangeError(
        'Recorded actions disagree with programs, interruption or learning progress.',
      );
    run = advanceLearningRound(run, round.reviews);
  }
  // A persisted round barrier may have accepted programs before any action commits.
  while (programs[index]?.tick === run.rounds.length) {
    run = acceptLearningProgram(run, programs[index]);
    index++;
  }
  if (index !== programs.length)
    throw new RangeError('Unused or out-of-order learning programs.');
  return run;
}
