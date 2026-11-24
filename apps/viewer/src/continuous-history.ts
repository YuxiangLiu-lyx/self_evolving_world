import type {
  CollectiveCoordination,
  CollectiveIntent,
} from '@self-evolving-world/world-core';
import { collectiveSettle } from '@self-evolving-world/world-core';
import {
  continuousRegistry,
  v7CanonicalNumbers,
  openSaveProjects,
  expressionSaveMemory,
  v7Install,
  v7Clone,
  v7Step,
  v7Signature,
  v7PrepareReplayCursors,
  v7FinishTasks,
} from '@self-evolving-world/world-core';
import type {
  V7World,
  V7Project,
  V7Cursor,
  V7Action,
  V7Review,
} from '@self-evolving-world/world-core';
export interface SceneRound {
  coordination?: CollectiveCoordination[];
  registrationPrecisionHash?: string;
  tick: number;
  before: string;
  after: string;
  actions: Record<string, V7Action>;
  reviews: V7Review[];
  registrations: string[];
  memory: Record<
    string,
    {
      notes: string[];
      preferences: string[];
      intention?: string;
      collectiveIntent?: CollectiveIntent;
      projects?: V7Project[];
      cares?: string;
      views?: Record<string, string>;
    }
  >;
  events: V7World['events'];
  tasks: Record<string, V7Cursor>;
}
export interface SceneSegment {
  version: 7;
  start: number;
  initial: V7World;
  rounds: SceneRound[];
  initialCursors?: Record<string, V7Cursor>;
}
export interface SceneIndex {
  version: 7;
  observed: number;
  target: number;
  phase: string;
  segments: { path: string; start: number; end: number; sha256: string }[];
}
export async function browserDigest(text: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export class ReplaySuperseded extends Error {
  constructor() {
    super('Replay request superseded.');
  }
}
/** A segment-local verified prefix. Concurrent seeks share one ordered replay;
 * a failed round poisons this reader instead of reusing partially changed cursors. */
export function incrementalSceneReplay(segment: SceneSegment) {
  if (segment.initial.tick !== segment.start)
    throw new Error('Replay initial tick differs from its segment boundary.');
  const registry = continuousRegistry(segment.initial);
  let world = segment.initial;
  const frames = [world];
  const cursors = v7Clone(segment.initialCursors ?? {});
  let pending: Promise<void> = Promise.resolve();
  let failure: Error | undefined;
  function frame(
    tick: number,
    control?: {
      current: () => boolean;
      advanced: (tick: number) => Promise<void>;
    },
  ): Promise<V7World> {
    if (
      !Number.isInteger(tick) ||
      tick < segment.start ||
      tick > segment.start + segment.rounds.length
    )
      return Promise.reject(
        new Error('Requested replay tick is outside the segment.'),
      );
    const offset = tick - segment.start;
    const result = pending.then(async () => {
      if (failure) throw failure;
      try {
        if (control && !control.current()) throw new ReplaySuperseded();
        while (frames.length <= offset) {
          const record = segment.rounds[frames.length - 1];
          if (!record) throw new Error('Missing requested replay round.');
          for (const key of record.registrations)
            world = v7Install(world, registry, key);
          const rawPrefixMatches =
            (await browserDigest(v7Signature(world))) === record.before;
          const precisionBound =
            record.registrations.includes('material-geometry@1') &&
            typeof record.registrationPrecisionHash === 'string' &&
            (await browserDigest(v7Signature(v7CanonicalNumbers(world)))) ===
              record.registrationPrecisionHash;
          if (record.registrationPrecisionHash !== undefined && !precisionBound)
            throw new Error('Invalid registration precision evidence.');
          // Only this recorded native-cbrt migration can use its independently bound model-precision proof.
          // Every ensuing world, event and task hash still matches the original record exactly.
          if (
            record.tick !== world.tick + 1 ||
            (!rawPrefixMatches && !precisionBound)
          )
            throw new Error('Replay prefix verification failed.');
          const input = v7Clone(world);
          for (const actor of input.actors) {
            const m = record.memory[actor.id];
            if (m) {
              if (m.collectiveIntent) {
                if (!actor.collective)
                  throw new Error(
                    'Personal collective intention requires an actual member.',
                  );
                actor.collective.intent = v7Clone(m.collectiveIntent);
              }
              if (m.cares !== undefined || m.views)
                expressionSaveMemory(actor, m, world.tick);
              if (m.projects) openSaveProjects(actor, m.projects, world.tick);
              actor.memory.notes = m.notes;
              actor.memory.preferences = m.preferences;
              if (m.intention !== undefined)
                actor.memory.intention = m.intention;
            }
          }
          if (segment.initialCursors)
            v7PrepareReplayCursors(world, record.tasks, cursors);
          const result = v7Step(
            input,
            record.actions,
            registry,
            cursors,
            record.reviews,
          );
          if (segment.initialCursors) v7FinishTasks(world, result, cursors);
          result.world = collectiveSettle(
            result.world,
            record.coordination ?? [],
          );
          if (
            result.paused ||
            (await browserDigest(v7Signature(result.world))) !== record.after ||
            v7Signature(result.world.events) !== v7Signature(record.events) ||
            (segment.initialCursors &&
              v7Signature(cursors) !== v7Signature(record.tasks))
          )
            throw new Error(`Replay mismatch at ${String(record.tick)}.`);
          world = result.world;
          frames.push(world);
          // Cancellation only happens at a fully verified boundary. Never leave
          // partially installed packages, paid actions or cursors for a retry.
          if (control) {
            await control.advanced(world.tick);
            if (!control.current()) throw new ReplaySuperseded();
          }
        }
        const value = frames[offset];
        if (!value) throw new Error('Missing verified replay frame.');
        return value;
      } catch (error) {
        if (error instanceof ReplaySuperseded) throw error;
        failure = error instanceof Error ? error : new Error('Replay failed.');
        throw failure;
      }
    });
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  return {
    frame,
    get reconstructedRounds(): number {
      return frames.length - 1;
    },
    get frames(): readonly V7World[] {
      return frames;
    },
  };
}

/** Full-audit compatibility entry; every round still passes the same checks. */
export async function replaySceneSegment(
  segment: SceneSegment,
): Promise<V7World[]> {
  const replay = incrementalSceneReplay(segment);
  await replay.frame(segment.start + segment.rounds.length);
  return [...replay.frames];
}
