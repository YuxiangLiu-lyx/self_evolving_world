import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { V7World } from '@self-evolving-world/world-core';
import type { V7Execution } from '../apps/simulator/src/continuous-run.js';
import {
  continuousHash,
  continuousRead,
  reconstructContinuousSegment,
} from './continuous-store.js';
import type {
  V7ReplayIndex,
  V7ReplaySegment,
  V7StoredRound,
} from './continuous-store.js';
import type { ContinuousSourceRevision } from './continuous-source.js';

/** Proof that the imported world is the source archive's retained world at its round. */
export interface LongImportProof {
  experiment: string;
  round: number;
  scope: string;
  /** `continuousHash` of `execution.json` `world` as read. */
  worldHash: string;
  /** `continuousHash` of the world reconstructed by exact replay of every segment. */
  replayHash: string;
  /** The `after` hash recorded with the last replayed round. */
  recordedHash: string;
  /** `continuousHash` of the scheduled stage checkpoint's world at the round, if retained. */
  checkpointHash: string | null;
  /** SHA-256 of the raw `execution.json` bytes. */
  executionSha256: string;
  replay: Pick<V7ReplayIndex, 'observed' | 'target' | 'phase' | 'segments'>;
  /** The last retained runtime source revision of the source run. */
  sourceRevision: { id: number; tick: number; sourceHash: string };
  provenance: unknown;
}
const sha256 = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

/** Read a completed source window without writing anything, and prove that its saved world
 * equals the exact-replay reconstruction and the hashes recorded during the run. */
export function readLongImportSource(
  root: string,
  experiment: string,
): { world: V7World; proof: LongImportProof } {
  if (!/^ex[1-9]\d*$/.test(experiment))
    throw new Error('The import source must be an experiment id such as ex18.');
  const directory = resolve(root, 'experiment', experiment),
    executionBytes = readFileSync(resolve(directory, 'execution.json')),
    state = JSON.parse(executionBytes.toString('utf8')) as V7Execution,
    index = continuousRead<V7ReplayIndex>(resolve(directory, 'replay.json')),
    manifest = continuousRead<Record<string, unknown>>(
      resolve(directory, 'manifest.json'),
    ),
    history = continuousRead<ContinuousSourceRevision[]>(
      resolve(directory, 'source-history.json'),
    );
  const world = state.world,
    round = world.tick,
    scope = world.config.development?.scope;
  if (
    manifest.version !== 7 ||
    manifest.id !== experiment ||
    manifest.status !== 'completed' ||
    (state as { version: unknown }).version !== 7 ||
    state.phase !== 'window-complete' ||
    state.barrier !== null ||
    state.pendingCall !== null ||
    !world.config.longDevelopment?.culture ||
    !scope ||
    round < 1
  )
    throw new Error(
      'Only a completed culture-scope window without a pending call or barrier can be imported.',
    );
  if (
    (index as { version: unknown }).version !== 7 ||
    index.observed !== round ||
    index.phase !== state.phase ||
    index.segments[0]?.start !== 0 ||
    index.segments.at(-1)?.end !== round ||
    index.segments.some(
      (part, i) => i > 0 && part.start !== index.segments[i - 1]?.end,
    )
  )
    throw new Error('The replay index does not cover the retained window.');
  let last: V7World | null = null,
    record: V7StoredRound | undefined;
  for (const part of index.segments) {
    const bytes = readFileSync(resolve(directory, part.path));
    if (sha256(bytes) !== part.sha256)
      throw new Error(`Replay segment integrity failed: ${part.path}`);
    const segment = JSON.parse(bytes.toString('utf8')) as V7ReplaySegment;
    if (
      segment.start !== part.start ||
      segment.start + segment.rounds.length !== part.end ||
      (last && continuousHash(segment.initial) !== continuousHash(last))
    )
      throw new Error(`Replay segments do not join at ${part.path}.`);
    const frames = reconstructContinuousSegment(segment);
    last = frames.at(-1) ?? null;
    record = segment.rounds.at(-1) ?? record;
  }
  if (!last || !record) throw new Error('The retained replay is empty.');
  const stage = resolve(
    directory,
    'checkpoints',
    `stage-${String(round).padStart(6, '0')}.json`,
  );
  const checkpointHash = existsSync(stage)
    ? continuousHash(continuousRead<{ state: V7Execution }>(stage).state.world)
    : null;
  const revision = history.at(-1);
  if (!revision) throw new Error('Missing retained source history.');
  const proof: LongImportProof = {
    experiment,
    round,
    scope,
    worldHash: continuousHash(world),
    replayHash: continuousHash(last),
    recordedHash: record.after,
    checkpointHash,
    executionSha256: sha256(executionBytes),
    replay: {
      observed: index.observed,
      target: index.target,
      phase: index.phase,
      segments: index.segments,
    },
    sourceRevision: {
      id: revision.id,
      tick: revision.tick,
      sourceHash: revision.sourceHash,
    },
    provenance: manifest.provenance ?? null,
  };
  if (
    proof.replayHash !== proof.worldHash ||
    proof.recordedHash !== proof.worldHash ||
    (checkpointHash !== null && checkpointHash !== proof.worldHash)
  )
    throw new Error(
      'The saved world differs from its exact replay or its recorded hashes.',
    );
  return { world, proof };
}
