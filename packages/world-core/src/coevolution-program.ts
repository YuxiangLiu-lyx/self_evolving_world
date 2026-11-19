import type { WorldState } from './world.js';
import type {
  CoevolutionAction,
  PersonalProject,
} from './coevolution-types.js';
import type {
  CoevolutionRound,
  CoevolutionProposal,
} from './coevolution-types.js';
import { coevolutionData } from './coevolution-environment.js';
import { parseCoevolutionAction } from './coevolution-schema.js';
import { parseCoevolutionRound, stepCoevolutionRound } from './coevolution.js';
import { COEVOLUTION_CONFIG, parseProject } from './coevolution-schema.js';
import {
  boundedText,
  count,
  dataObject,
  exactKeys,
  freeze,
  list,
} from './skill-code.js';

export const COEVOLUTION_LIMITS = freeze({
  ...COEVOLUTION_CONFIG,
  codeCharacters: 4000,
});
export interface CoevolutionProgram {
  readonly agentId: string;
  readonly tick: number;
  readonly call: number;
  readonly code: string | null;
  readonly summary: string;
  readonly project: PersonalProject | null;
}
export interface CoevolutionCursor {
  readonly calls: number;
  readonly active: CoevolutionProgram | null;
  readonly remaining: readonly CoevolutionAction[];
  readonly startSatiety: number;
  readonly interruption: string | null;
  readonly project: PersonalProject | null;
}
export interface CoevolutionRun {
  readonly frames: readonly WorldState[];
  readonly rounds: readonly CoevolutionRound[];
  readonly programs: readonly CoevolutionProgram[];
  readonly cursors: Readonly<Record<string, CoevolutionCursor>>;
  readonly interruptions: readonly {
    tick: number;
    actor: string;
    reason: string;
    discarded: number;
  }[];
}

/** JSON arguments plus finite calls: quoted punctuation is data, never host syntax. */
export function parseCoevolutionCode(
  code: string,
  agentId: string,
  remaining = 12,
): readonly CoevolutionAction[] {
  boundedText(code, COEVOLUTION_LIMITS.codeCharacters);
  count(remaining, 1, 180);
  const actions: CoevolutionAction[] = [];
  let offset = 0;
  const start = /\s*(move|pickup|learn|use|wait|rest|drop|give|message)\(/y;
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
    const args = list(JSON.parse(`[${code.slice(begin, end)}]`) as unknown, 3),
      type = match[1];
    const expected = ['move', 'use', 'give', 'message'].includes(type ?? '')
      ? 2
      : 1;
    if (args.length !== expected)
      throw new RangeError('Wrong action argument count.');
    const duration =
      type === 'move'
        ? count(args[1], 1, 12)
        : type === 'wait' || type === 'rest'
          ? count(args[0], 1, 12)
          : 1;
    if (
      actions.length + duration >
      Math.min(remaining, COEVOLUTION_LIMITS.planRounds)
    )
      throw new RangeError('Plans cover at most twelve remaining rounds.');
    const action = parseCoevolutionAction({
      type,
      agentId,
      ...(type === 'move'
        ? { direction: args[0] }
        : type === 'pickup' || type === 'drop'
          ? { itemId: args[0] }
          : type === 'learn'
            ? { request: args[0] }
            : type === 'use'
              ? { skillId: args[0], args: args[1] }
              : type === 'give'
                ? { itemId: args[0], recipient: args[1] }
                : type === 'message'
                  ? { recipient: args[0], text: args[1] }
                  : {}),
    });
    for (let n = 0; n < duration; n++) actions.push(action);
    offset = end + tail[0].length;
  }
  if (!actions.length)
    throw new RangeError('A plan must contain at least one action.');
  return freeze(actions);
}
export function parseCoevolutionProgram(input: unknown): CoevolutionProgram {
  const p = dataObject(input);
  exactKeys(p, ['agentId', 'tick', 'call', 'code', 'summary', 'project']);
  const agentId = boundedText(p.agentId, 80),
    tick = count(p.tick, 0, 179),
    call = count(p.call, 1, 120),
    summary = boundedText(p.summary, 400);
  const code = p.code === null ? null : boundedText(p.code, 4000);
  if (code !== null) parseCoevolutionCode(code, agentId, 180 - tick);
  return freeze({
    agentId,
    tick,
    call,
    code,
    summary,
    project: p.project === null ? null : parseProject(p.project),
  });
}
export function createCoevolutionRun(initial: WorldState): CoevolutionRun {
  const data = coevolutionData(initial);
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
          project: null,
        },
      ]),
    ),
  });
}
export function lastCoevolutionFrame(run: CoevolutionRun): WorldState {
  const f = run.frames.at(-1);
  if (!f) throw new RangeError('Missing learning frame.');
  return f;
}
export function pendingCoevolutionPrograms(
  run: CoevolutionRun,
): readonly string[] {
  const world = lastCoevolutionFrame(run),
    data = coevolutionData(world);
  if (world.tick >= 180) return [];
  return world.agents
    .filter(
      ({ id }) =>
        data.vitals[id]?.health !== 0 &&
        !data.knowledge[id]?.pending &&
        run.cursors[id]?.remaining.length === 0 &&
        run.cursors[id].active?.tick !== world.tick,
    )
    .map((a) => a.id);
}
export function acceptCoevolutionProgram(
  run: CoevolutionRun,
  input: unknown,
): CoevolutionRun {
  const p = parseCoevolutionProgram(input),
    world = lastCoevolutionFrame(run),
    c = run.cursors[p.agentId];
  if (
    !c ||
    !pendingCoevolutionPrograms(run).includes(p.agentId) ||
    p.tick !== world.tick ||
    p.call !== c.calls + 1 ||
    run.programs.length >= COEVOLUTION_CONFIG.ordinaryAttempts
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
            : parseCoevolutionCode(p.code, p.agentId, 180 - world.tick),
        startSatiety: coevolutionData(world).vitals[p.agentId]?.satiety ?? 0,
        interruption: null,
        project: p.project ?? c.project,
      },
    },
  });
}
export function coevolutionActions(
  run: CoevolutionRun,
): readonly CoevolutionAction[] {
  if (pendingCoevolutionPrograms(run).length)
    throw new RangeError(
      'Resolve every pending ordinary decision before the round barrier.',
    );
  const world = lastCoevolutionFrame(run),
    data = coevolutionData(world);
  return freeze(
    world.agents.map(({ id }): CoevolutionAction =>
      data.knowledge[id]?.pending && data.vitals[id]?.health !== 0
        ? { type: 'study', agentId: id }
        : (run.cursors[id]?.remaining[0] ?? { type: 'wait', agentId: id }),
    ),
  );
}
export function advanceCoevolutionRound(
  run: CoevolutionRun,
  proposal: CoevolutionProposal,
): CoevolutionRun {
  const world = lastCoevolutionFrame(run);
  if (world.tick >= 180) throw new RangeError('Experiment horizon reached.');
  const round = { actions: coevolutionActions(run), proposal };
  const next = stepCoevolutionRound(world, round),
    data = coevolutionData(next);
  const interruptions = [...run.interruptions];
  const cursors = Object.fromEntries(
    Object.entries(run.cursors).map(([id, cursor]) => {
      const outcome = data.events.find((e) => e.action.agentId === id),
        before = coevolutionData(world).vitals[id],
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
        ((before.health > 50 && after.health <= 50) ||
          (before.health > 20 && after.health <= 20) ||
          (before.satiety > 6 && after.satiety <= 6) ||
          (before.satiety > 0 && after.satiety === 0))
      )
        interruption =
          'Vital state deteriorated; reconsider the remaining plan.';
      if (!interruption && cursor.remaining.length > 1) {
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
export function reconstructCoevolutionRun(
  initial: WorldState,
  rawPrograms: unknown,
  rawRounds: unknown,
): CoevolutionRun {
  const programs = list(rawPrograms, 120).map(parseCoevolutionProgram),
    rounds = list(rawRounds, 180).map(parseCoevolutionRound);
  let run = createCoevolutionRun(initial),
    index = 0;
  for (const round of rounds) {
    while (programs[index]?.tick === run.rounds.length) {
      run = acceptCoevolutionProgram(run, programs[index]);
      index++;
    }
    if (
      JSON.stringify(coevolutionActions(run)) !== JSON.stringify(round.actions)
    )
      throw new RangeError(
        'Recorded actions disagree with programs, interruption or learning progress.',
      );
    run = advanceCoevolutionRound(run, round.proposal);
  }
  // A persisted round barrier may have accepted programs before any action commits.
  while (programs[index]?.tick === run.rounds.length) {
    run = acceptCoevolutionProgram(run, programs[index]);
    index++;
  }
  if (index !== programs.length)
    throw new RangeError('Unused or out-of-order learning programs.');
  return run;
}
