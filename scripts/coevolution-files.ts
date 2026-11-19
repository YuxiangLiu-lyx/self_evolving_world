import { renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { recordCDevelopmentAttempt } from '../apps/simulator/src/coevolution-run.js';
import { readCoevolutionExecution } from './coevolution-analysis.js';
import { object, readJson } from './validation.js';
import { learningEngineHash } from './learning-files.js';
import {
  readSourceHistory,
  validateSourceExtension,
  saveSourceHistory,
  captureSourceBaseline,
} from './coevolution-source.js';

export function coevolutionCheckpoint(root: string, id: string) {
  const directory = resolve(root, 'experiment', id),
    manifest = object(readJson(resolve(directory, 'manifest.json')));
  const state = readCoevolutionExecution(
      readJson(resolve(directory, 'execution.json')),
    ),
    history = readSourceHistory(root, id, state);
  captureSourceBaseline(root, id, state, history);
  if (
    manifest.version !== 6 ||
    (history.at(-1)?.engineHash !== learningEngineHash(root) &&
      state.phase !== 'development')
  )
    throw new Error(
      'Coevolution source changed during the saved experiment; continuation is blocked.',
    );
  return state;
}
export function submitCoevolutionDevelopment(
  root: string,
  id: string,
  input: unknown,
): void {
  const state = coevolutionCheckpoint(root, id),
    payload = object(input),
    { implementation, ...declaration } = payload,
    result = recordCDevelopmentAttempt(state, declaration),
    path = resolve(root, 'experiment', id, 'execution.json');
  const history = readSourceHistory(root, id, state);
  if (
    !result.error &&
    history.at(-1)?.engineHash !== learningEngineHash(root)
  ) {
    if (typeof implementation !== 'string')
      throw new Error(
        'Changed source requires an explicit implementation review.',
      );
    const revisions = validateSourceExtension(root, id, state, implementation);
    saveSourceHistory(root, id, revisions);
  }
  writeFileSync(`${path}.tmp`, JSON.stringify(result.state, null, 2) + '\n');
  renameSync(`${path}.tmp`, path);
  if (result.error) throw new Error(result.error);
}
