import {
  continuousRegistry,
  v7CanonicalNumbers,
  openSaveProjects,
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
      projects?: V7Project[];
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
export async function replaySceneSegment(
  segment: SceneSegment,
): Promise<V7World[]> {
  const registry = continuousRegistry(segment.initial);
  let world = segment.initial;
  const frames = [world];
  const cursors = v7Clone(segment.initialCursors ?? {});
  for (const record of segment.rounds) {
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
        if (m.projects) openSaveProjects(actor, m.projects, world.tick);
        actor.memory.notes = m.notes;
        actor.memory.preferences = m.preferences;
        if (m.intention !== undefined) actor.memory.intention = m.intention;
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
  }
  return frames;
}
