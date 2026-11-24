import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coevolutionExecutionRun } from '../apps/simulator/src/coevolution-run.js';
import type { CoevolutionExecution } from '../apps/simulator/src/coevolution-run.js';
import { record as object } from '../apps/simulator/src/remote-data.js';
const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf8')) as unknown;
interface SourceRevision {
  version: number;
  engineHash: string;
  sources: Record<string, string>;
  tick: number;
  programCount: number;
  attemptCount: number;
  prefixHash: string;
  attemptsHash: string;
  barrierId: string | null;
  reason: string;
  validation: null | {
    commands: readonly string[];
    log: string;
    sha256: string;
  };
}
const sourceArtifactName =
  /^(development-baselines\.json|extension-validation-[1-9][0-9]*(?:-failed-[1-9][0-9]*)?\.txt)$/;
export function sourceArtifactFiles(value: unknown): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 32 ||
    value.some(
      (name: unknown) =>
        typeof name !== 'string' || !sourceArtifactName.test(name),
    ) ||
    new Set(value).size !== value.length
  )
    throw new Error('Invalid versioned implementation artifact list.');
  return value as string[];
}
export const sourceDigest = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function hashSources(files: Record<string, string>): string {
  const hash = createHash('sha256');
  for (const [path, source] of Object.entries(files))
    hash.update(path).update('\0').update(source);
  return hash.digest('hex');
}
export function readSourceHistory(
  root: string,
  id: string,
  state: CoevolutionExecution,
): SourceRevision[] {
  const directory = resolve(root, 'experiment', id),
    history = readJson(
      resolve(directory, 'source-history.json'),
    ) as SourceRevision[],
    manifest = object(readJson(resolve(directory, 'manifest.json')));
  if (
    !Array.isArray(history) ||
    !history.length ||
    history[0]?.engineHash !== object(manifest.provenance).engineHash
  )
    throw new Error('Missing original engine provenance.');
  for (const [index, revision] of history.entries()) {
    if (
      revision.version !== index + 1 ||
      revision.engineHash !== hashSources(revision.sources) ||
      revision.tick > state.rounds.length ||
      revision.programCount > state.programs.length ||
      revision.attemptCount > state.attempts.length
    )
      throw new Error('Invalid retained source revision.');
    const prefix = {
      ...state,
      rounds: state.rounds.slice(0, revision.tick),
      programs: state.programs.slice(0, revision.programCount),
    };
    if (
      revision.prefixHash !== sourceDigest(coevolutionExecutionRun(prefix)) ||
      revision.attemptsHash !==
        sourceDigest(state.attempts.slice(0, revision.attemptCount))
    )
      throw new Error(
        'An extension changed the retained world or call prefix.',
      );
    if (index > 0) {
      if (
        !revision.validation ||
        !/^extension-validation-[1-9][0-9]*\.txt$/.test(
          revision.validation.log,
        ) ||
        !state.developments.some((d) => d.barrier.id === revision.barrierId)
      )
        throw new Error('Missing source extension handoff/validation.');
      if (
        createHash('sha256')
          .update(readFileSync(resolve(directory, revision.validation.log)))
          .digest('hex') !== revision.validation.sha256
      )
        throw new Error('Extension validation evidence changed.');
    }
  }
  return history;
}
