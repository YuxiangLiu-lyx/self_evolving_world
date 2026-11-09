import {
  CORE_RULES,
  createWorld,
  parseWorldAction,
  stepWorld,
  stepWorldRound,
  createSurvivalWorld,
  parseSurvivalConfig,
  replayPrograms,
  createLearningWorld,
  reconstructLearningRun,
} from '@self-evolving-world/world-core';
import type {
  AgentSeed,
  GroundItem,
  WorldAction,
  WorldSetup,
  WorldState,
  ProgramRecord,
  LearningProgram,
  LearningRound,
} from '@self-evolving-world/world-core';

export const MAX_ACTIONS = 500;
export const MAX_REPLAY_BYTES = 1_000_000;
export interface Timeline {
  readonly frames: readonly WorldState[];
  readonly schedule?: 'simultaneous-v1' | 'survival-v1' | 'learning-v1';
  readonly programs?: readonly ProgramRecord[];
  readonly learningPrograms?: readonly LearningProgram[];
  readonly learningRounds?: readonly LearningRound[];
}

export function createTimeline(setup: WorldSetup): Timeline {
  return Object.freeze({ frames: Object.freeze([createWorld(setup)]) });
}

/** Selecting a frame never calls stepWorld. */
export function frameAt(timeline: Timeline, index: number): WorldState {
  const frame = timeline.frames[index];
  if (frame === undefined)
    throw new RangeError('History frame is out of range.');
  return frame;
}

export function appendAction(
  timeline: Timeline,
  action: WorldAction,
): Timeline {
  if (timeline.schedule !== undefined)
    throw new RangeError(
      'Round histories are read-only. Start a new world to act.',
    );
  if (timeline.frames.length > MAX_ACTIONS)
    throw new RangeError(
      'History has reached 500 steps. Export it and start a new world.',
    );
  const next = stepWorld(frameAt(timeline, timeline.frames.length - 1), action);
  return Object.freeze({ frames: Object.freeze([...timeline.frames, next]) });
}

export function serializeReplay(timeline: Timeline): string {
  const first = frameAt(timeline, 0);
  return JSON.stringify(
    {
      format: 'self-evolving-world/replay',
      version:
        timeline.schedule === undefined
          ? 1
          : timeline.schedule === 'learning-v1'
            ? 4
            : timeline.schedule === 'survival-v1'
              ? 3
              : 2,
      coreVersion: CORE_RULES.version,
      ...(timeline.schedule === undefined
        ? {}
        : { schedule: timeline.schedule }),
      initial: {
        settings: first.settings,
        agents: first.agents.map(({ id, name, position }) => ({
          id,
          name,
          position,
        })),
        items: first.items,
      },
      ...(timeline.schedule === 'learning-v1'
        ? {
            environment: first.learning?.environment,
            programs: timeline.learningPrograms,
            rounds: timeline.learningRounds,
          }
        : timeline.schedule === 'survival-v1'
          ? {
              survival: first.survival?.config,
              programs: timeline.programs,
              roundCount: timeline.frames.length - 1,
            }
          : timeline.schedule === undefined
            ? {
                actions: timeline.frames.slice(1).map((frame) => {
                  if (frame.event === null)
                    throw new Error('Recorded frame has no action.');
                  return frame.event.action;
                }),
              }
            : {
                rounds: timeline.frames.slice(1).map((frame) => {
                  if (frame.events === undefined)
                    throw new Error('Recorded round has no actions.');
                  return frame.events.map((event) => event.action);
                }),
              }),
    },
    null,
    2,
  );
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new RangeError('Replay fields must be objects.');
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== 'string')
    throw new RangeError('Replay file is missing a string field.');
  return value;
}
function number(value: unknown): number {
  if (typeof value !== 'number')
    throw new RangeError('Replay file is missing a numeric field.');
  return value;
}
function array(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit)
    throw new RangeError(
      `Replay array is invalid or exceeds ${String(limit)} entries.`,
    );
  return value as unknown[];
}
function entity(value: unknown): AgentSeed & GroundItem {
  const data = record(value);
  const position = record(data.position);
  return {
    id: string(data.id),
    name: string(data.name),
    position: { x: number(position.x), y: number(position.y) },
  };
}

/** Import only initial conditions + validated commands; never trust supplied snapshots or code. */
export function parseReplay(source: string): Timeline {
  if (new TextEncoder().encode(source).length > MAX_REPLAY_BYTES)
    throw new RangeError('Replay files must not exceed 1 MB.');
  const parsed: unknown = JSON.parse(source);
  const data = record(parsed);
  if (
    data.format !== 'self-evolving-world/replay' ||
    (data.version !== 1 &&
      data.version !== 2 &&
      data.version !== 3 &&
      data.version !== 4) ||
    data.coreVersion !== CORE_RULES.version
  ) {
    throw new RangeError(
      'Replay format or core rules version is incompatible.',
    );
  }
  const initial = record(data.initial);
  const settings = record(initial.settings);
  let timeline = createTimeline({
    settings: {
      width: number(settings.width),
      height: number(settings.height),
      visionRadius: number(settings.visionRadius),
    },
    agents: array(initial.agents, 32).map(entity),
    items: array(initial.items, 256).map(entity),
  });
  if (data.version === 1) {
    for (const input of array(data.actions, MAX_ACTIONS))
      timeline = appendAction(timeline, parseWorldAction(input));
  } else if (data.version === 4) {
    if (data.schedule !== 'learning-v1')
      throw new RangeError('Unsupported learning schedule.');
    const first = frameAt(timeline, 0);
    const run = reconstructLearningRun(
      createLearningWorld(
        { settings: first.settings, agents: first.agents, items: first.items },
        data.environment,
      ),
      data.programs,
      data.rounds,
    );
    timeline = Object.freeze({
      schedule: 'learning-v1',
      frames: run.frames,
      learningPrograms: run.programs,
      learningRounds: run.rounds,
    });
  } else if (data.version === 3) {
    if (data.schedule !== 'survival-v1')
      throw new RangeError('Unsupported survival schedule.');
    const first = frameAt(timeline, 0);
    const run = replayPrograms(
      createSurvivalWorld(
        { settings: first.settings, agents: first.agents, items: first.items },
        parseSurvivalConfig(data.survival),
      ),
      data.programs,
      number(data.roundCount),
    );
    timeline = Object.freeze({
      schedule: 'survival-v1',
      frames: run.frames,
      programs: run.programs,
    });
  } else {
    if (data.schedule !== 'simultaneous-v1')
      throw new RangeError('Unsupported round schedule.');
    const frames = [...timeline.frames];
    for (const inputs of array(data.rounds, MAX_ACTIONS)) {
      frames.push(
        stepWorldRound(
          frameAt({ frames }, frames.length - 1),
          array(inputs, 32).map(parseWorldAction),
        ),
      );
    }
    timeline = Object.freeze({
      schedule: 'simultaneous-v1',
      frames: Object.freeze(frames),
    });
  }
  return timeline;
}
