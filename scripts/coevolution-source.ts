import { createHash } from 'node:crypto';
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  openSync,
  closeSync,
  existsSync,
} from 'node:fs';
import { resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { coevolutionExecutionRun } from '../apps/simulator/src/coevolution-run.js';
import type { CoevolutionExecution } from '../apps/simulator/src/coevolution-run.js';
import { record as object } from '../apps/simulator/src/remote-data.js';
const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf8')) as unknown;
const learningEngineHash = (root: string): string => hashSources(sources(root));
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
type SourceBaseline = Pick<
  SourceRevision,
  | 'engineHash'
  | 'tick'
  | 'programCount'
  | 'attemptCount'
  | 'prefixHash'
  | 'attemptsHash'
  | 'barrierId'
>;
const baselinePath = (root: string, id: string): string =>
  resolve(root, 'experiment', id, 'development-baselines.json');
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
export function collectSourceArtifacts(directory: string): string[] {
  return sourceArtifactFiles(
    readdirSync(directory)
      .filter((name) => sourceArtifactName.test(name))
      .sort(),
  );
}
/** Capture with the still-registered engine before an effect implementation is edited. */
export function captureSourceBaseline(
  root: string,
  id: string,
  state: CoevolutionExecution,
  history: readonly SourceRevision[],
): void {
  if (
    state.phase !== 'development' ||
    !state.barrier ||
    learningEngineHash(root) !== history.at(-1)?.engineHash
  )
    return;
  const path = baselinePath(root, id),
    values = existsSync(path) ? object(readJson(path)) : {};
  const value: SourceBaseline = {
    engineHash: learningEngineHash(root),
    tick: state.rounds.length,
    programCount: state.programs.length,
    attemptCount: state.attempts.length,
    prefixHash: sourceDigest(coevolutionExecutionRun(state)),
    attemptsHash: sourceDigest(state.attempts),
    barrierId: state.barrier.id,
  };
  if (
    values[state.barrier.id] &&
    sourceDigest(values[state.barrier.id]) !== sourceDigest(value)
  )
    throw new Error('The original development baseline changed.');
  if (!values[state.barrier.id])
    writeFileSync(
      path,
      JSON.stringify({ ...values, [state.barrier.id]: value }, null, 2) + '\n',
    );
}
export const sourceDigest = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function sources(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  function visit(path: string): void {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name, 'en'),
    )) {
      const file = resolve(path, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith('.ts'))
        result[relative(root, file)] = readFileSync(file, 'utf8');
    }
  }
  visit(resolve(root, 'packages/world-core/src'));
  visit(resolve(root, 'apps/simulator/src'));
  return result;
}
function hashSources(files: Record<string, string>): string {
  const hash = createHash('sha256');
  for (const [path, source] of Object.entries(files))
    hash.update(path).update('\0').update(source);
  return hash.digest('hex');
}
export function sourceRevision(
  root: string,
  state: CoevolutionExecution,
  reason: string,
): SourceRevision {
  return {
    version: 1,
    engineHash: learningEngineHash(root),
    sources: sources(root),
    tick: state.rounds.length,
    programCount: state.programs.length,
    attemptCount: state.attempts.length,
    prefixHash: sourceDigest(coevolutionExecutionRun(state)),
    attemptsHash: sourceDigest(state.attempts),
    barrierId: state.barrier?.id ?? null,
    reason,
    validation: null,
  };
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
/** Authorize only a new effect implementation at an existing development barrier. No rule, prompt or scheduler changes. */
export function validateSourceExtension(
  root: string,
  id: string,
  state: CoevolutionExecution,
  reason: string,
): SourceRevision[] {
  const history = readSourceHistory(root, id, state),
    previous = history.at(-1);
  if (
    !previous ||
    state.phase !== 'development' ||
    !state.barrier ||
    reason.length < 40
  )
    throw new Error(
      'Source extension needs the saved development barrier and a concrete review.',
    );
  const next = sourceRevision(root, state, reason),
    allowed = new Set([
      'coevolution-types.ts',
      'coevolution-schema.ts',
      'coevolution-environment.ts',
      'coevolution-execution.ts',
      'coevolution-effects.ts',
    ]);
  const baselineFile = baselinePath(root, id),
    saved = existsSync(baselineFile)
      ? object(readJson(baselineFile))[state.barrier.id]
      : undefined,
    before = saved === undefined ? previous : object(saved);
  if (
    before.engineHash !== previous.engineHash ||
    before.tick !== next.tick ||
    before.programCount !== next.programCount ||
    before.attemptCount !== next.attemptCount ||
    before.barrierId !== state.barrier.id ||
    before.prefixHash !== next.prefixHash ||
    before.attemptsHash !== next.attemptsHash
  )
    throw new Error(
      'Capture the unchanged engine at this barrier before editing; the complete current prefix must remain identical.',
    );
  const changed = [
    ...new Set([
      ...Object.keys(previous.sources),
      ...Object.keys(next.sources),
    ]),
  ].filter((p) => previous.sources[p] !== next.sources[p]);
  if (
    !changed.length ||
    changed.some(
      (p) =>
        !p.startsWith('packages/world-core/src/') ||
        !allowed.has(p.slice('packages/world-core/src/'.length)),
    )
  )
    throw new Error(
      'Base, scenario, transport, prompt or scheduler changes require a new run.',
    );
  const config = (files: Record<string, string>) =>
    files['packages/world-core/src/coevolution-schema.ts']
      ?.split('export const COEVOLUTION_CONFIG =')[1]
      ?.split('export function')[0];
  if (config(previous.sources) !== config(next.sources))
    throw new Error('Runtime parameters cannot change within a run.');
  const effort = (files: Record<string, string>) =>
    files['packages/world-core/src/coevolution-effects.ts']
      ?.split('export function actionEffort(')[1]
      ?.split('/** Only explicit finite production')[0];
  const rest = (files: Record<string, string>) =>
    files['packages/world-core/src/coevolution-effects.ts']?.split(
      'export function recovery(',
    )[1];
  if (
    effort(previous.sources) !== effort(next.sources) ||
    rest(previous.sources) !== rest(next.sources)
  )
    throw new Error(
      'Carrying and recovery base rules cannot change within a run.',
    );
  const version = history.length + 1,
    log = `extension-validation-${String(version)}.txt`,
    path = resolve(root, 'experiment', id, log),
    fd = openSync(path, 'w');
  const commands = ['typecheck', 'lint', 'architecture:check', 'test', 'build'];
  try {
    for (const command of commands) {
      const result = spawnSync('pnpm', [command], {
        cwd: root,
        stdio: ['ignore', fd, fd],
      });
      if (result.error || result.status !== 0)
        throw new Error(
          `Source extension failed pnpm ${command}; world remains frozen. Inspect ${path}.`,
        );
    }
  } finally {
    closeSync(fd);
  }
  if (learningEngineHash(root) !== next.engineHash)
    throw new Error('Source changed during extension validation.');
  return [
    ...history,
    {
      ...next,
      version,
      validation: {
        commands,
        log,
        sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
      },
    },
  ];
}
export function saveSourceHistory(
  root: string,
  id: string,
  history: readonly SourceRevision[],
): void {
  writeFileSync(
    resolve(root, 'experiment', id, 'source-history.json'),
    JSON.stringify(history, null, 2) + '\n',
  );
}
