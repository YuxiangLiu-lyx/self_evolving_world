import type { WorldState } from './world.js';
import type { LearningAction } from './learning-types.js';
import type { EvolutionRound, EvolutionProposal } from './evolution-types.js';
import { evolutionData } from './evolution-environment.js';
import { parseLearningAction } from './learning.js';
import { parseEvolutionRound, stepEvolutionRound } from './evolution.js';
import { EVOLUTION_CONFIG } from './evolution-schema.js';
import {
  boundedText,
  count,
  dataObject,
  exactKeys,
  freeze,
  list,
} from './skill-code.js';

export const EVOLUTION_LIMITS = freeze({
  ...EVOLUTION_CONFIG,
  codeCharacters: 4000,
});
export interface EvolutionProgram {
  readonly agentId: string;
  readonly tick: number;
  readonly call: number;
  readonly code: string | null;
  readonly summary: string;
}
export interface EvolutionCursor {
  readonly calls: number;
  readonly active: EvolutionProgram | null;
  readonly remaining: readonly LearningAction[];
  readonly startSatiety: number;
  readonly interruption: string | null;
}
export interface EvolutionRun {
  readonly frames: readonly WorldState[];
  readonly rounds: readonly EvolutionRound[];
  readonly programs: readonly EvolutionProgram[];
  readonly cursors: Readonly<Record<string, EvolutionCursor>>;
  readonly interruptions: readonly {
    tick: number;
    actor: string;
    reason: string;
    discarded: number;
  }[];
}

/** JSON arguments plus finite calls: quoted punctuation is data, never host syntax. */
export function parseEvolutionCode(
  code: string,
  agentId: string,
  remaining = 12,
): readonly LearningAction[] {
  boundedText(code, EVOLUTION_LIMITS.codeCharacters);
  count(remaining, 1, 120);
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
        ? count(args[1], 1, 12)
        : type === 'wait'
          ? count(args[0], 1, 12)
          : 1;
    if (
      actions.length + duration >
      Math.min(remaining, EVOLUTION_LIMITS.planRounds)
    )
      throw new RangeError('Plans cover at most twelve remaining rounds.');
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
export function parseEvolutionProgram(input: unknown): EvolutionProgram {
  const p = dataObject(input);
  exactKeys(p, ['agentId', 'tick', 'call', 'code', 'summary']);
  const agentId = boundedText(p.agentId, 80),
    tick = count(p.tick, 0, 119),
    call = count(p.call, 1, 60),
    summary = boundedText(p.summary, 400);
  const code = p.code === null ? null : boundedText(p.code, 4000);
  if (code !== null) parseEvolutionCode(code, agentId, 120 - tick);
  return freeze({ agentId, tick, call, code, summary });
}
export function createEvolutionRun(initial: WorldState): EvolutionRun {
  const data = evolutionData(initial);
  if (initial.tick !== 0)
    throw new RangeError('Learning run must begin at tick zero.');
  return freeze({
    frames: [initial],
    rounds: [],
    programs: [],
    interruptions: [],
    cursors: Object.fromEntries(
      initial.agents.map((a) => [
        a.id,
        {
          calls: 0,
          active: null,
          remaining: [],
          startSatiety: data.vitals[a.id]?.satiety ?? 60,
          interruption: null,
        },
      ]),
    ),
  });
}
export function lastEvolutionFrame(run: EvolutionRun): WorldState {
  const f = run.frames.at(-1);
  if (!f) throw new RangeError('Missing learning frame.');
  return f;
}
export function pendingEvolutionPrograms(run: EvolutionRun): readonly string[] {
  const world = lastEvolutionFrame(run),
    data = evolutionData(world);
  if (world.tick >= 120) return [];
  return world.agents
    .filter(
      ({ id }) =>
        data.vitals[id]?.health !== 0 &&
        !data.knowledge[id]?.pending &&
        run.cursors[id]?.remaining.length === 0 &&
        run.cursors[id].calls < 60 &&
        run.cursors[id].active?.tick !== world.tick,
    )
    .map((a) => a.id);
}
export function acceptEvolutionProgram(
  run: EvolutionRun,
  input: unknown,
): EvolutionRun {
  const p = parseEvolutionProgram(input),
    world = lastEvolutionFrame(run),
    c = run.cursors[p.agentId];
  if (
    !c ||
    !pendingEvolutionPrograms(run).includes(p.agentId) ||
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
            : parseEvolutionCode(p.code, p.agentId, 120 - world.tick),
        startSatiety: evolutionData(world).vitals[p.agentId]?.satiety ?? 0,
        interruption: null,
      },
    },
  });
}
export function evolutionActions(run: EvolutionRun): readonly LearningAction[] {
  if (pendingEvolutionPrograms(run).length)
    throw new RangeError(
      'Resolve every pending ordinary decision before the round barrier.',
    );
  const world = lastEvolutionFrame(run),
    data = evolutionData(world);
  return freeze(
    world.agents.map(({ id }): LearningAction =>
      data.knowledge[id]?.pending && data.vitals[id]?.health !== 0
        ? { type: 'study', agentId: id }
        : (run.cursors[id]?.remaining[0] ?? { type: 'wait', agentId: id }),
    ),
  );
}
export function advanceEvolutionRound(
  run: EvolutionRun,
  proposal: EvolutionProposal,
): EvolutionRun {
  const world = lastEvolutionFrame(run);
  if (world.tick >= 120) throw new RangeError('Experiment horizon reached.');
  const round = { actions: evolutionActions(run), proposal };
  const next = stepEvolutionRound(world, round),
    data = evolutionData(next);
  const interruptions = [...run.interruptions];
  const cursors = Object.fromEntries(
    Object.entries(run.cursors).map(([id, cursor]) => {
      const outcome = data.events.find((e) => e.action.agentId === id),
        before = evolutionData(world).vitals[id],
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
          (before.satiety > 6 && after.satiety <= 6) ||
          (before.satiety > 0 && after.satiety === 0))
      )
        interruption =
          'Vital state deteriorated; reconsider the remaining plan.';
      if (!interruption && cursor.remaining.length > 1) {
        const previousVisible =
          world.observations
            .find((o) => o.self.id === id)
            ?.agents.map((a) => a.id) ?? [];
        const visible =
          next.observations
            .find((o) => o.self.id === id)
            ?.agents.map((a) => a.id) ?? [];
        if (visible.some((a) => !previousVisible.includes(a)))
          interruption = 'A new nearby actor became visible.';
        const upcoming = cursor.remaining[1];
        if (
          upcoming?.type === 'use' &&
          Object.values(upcoming.args).some((target) =>
            data.stacks.some((s) => s.id === target && s.quantity === 0),
          )
        )
          interruption = 'A targeted resource is depleted.';
      }
      if (interruption && cursor.remaining.length > 1)
        interruptions.push({
          tick: next.tick,
          actor: id,
          reason: interruption,
          discarded: cursor.remaining.length - 1,
        });
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
    interruptions,
  });
}
export function reconstructEvolutionRun(
  initial: WorldState,
  rawPrograms: unknown,
  rawRounds: unknown,
): EvolutionRun {
  const programs = list(rawPrograms, 384).map(parseEvolutionProgram),
    rounds = list(rawRounds, 120).map(parseEvolutionRound);
  let run = createEvolutionRun(initial),
    index = 0;
  for (const round of rounds) {
    while (programs[index]?.tick === run.rounds.length) {
      run = acceptEvolutionProgram(run, programs[index]);
      index++;
    }
    if (JSON.stringify(evolutionActions(run)) !== JSON.stringify(round.actions))
      throw new RangeError(
        'Recorded actions disagree with programs, interruption or learning progress.',
      );
    run = advanceEvolutionRound(run, round.proposal);
  }
  // A persisted round barrier may have accepted programs before any action commits.
  while (programs[index]?.tick === run.rounds.length) {
    run = acceptEvolutionProgram(run, programs[index]);
    index++;
  }
  if (index !== programs.length)
    throw new RangeError('Unused or out-of-order learning programs.');
  return run;
}
