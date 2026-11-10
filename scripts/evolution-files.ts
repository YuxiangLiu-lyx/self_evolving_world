import { renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { acceptDevelopment } from '../apps/simulator/src/evolution-run.js';
import { readEvolutionExecution } from './evolution-analysis.js';
import { object, readJson } from './validation.js';
import { learningEngineHash } from './learning-files.js';

export function evolutionCheckpoint(root: string, id: string) {
  const directory = resolve(root, 'experiment', id),
    manifest = object(readJson(resolve(directory, 'manifest.json')));
  if (
    manifest.version !== 5 ||
    object(manifest.provenance).engineHash !== learningEngineHash(root)
  )
    throw new Error(
      'Evolution source changed during the saved experiment; continuation is blocked.',
    );
  return readEvolutionExecution(readJson(resolve(directory, 'execution.json')));
}
export function submitEvolutionDevelopment(
  root: string,
  id: string,
  input: unknown,
): void {
  const state = evolutionCheckpoint(root, id),
    next = acceptDevelopment(state, input),
    path = resolve(root, 'experiment', id, 'execution.json');
  writeFileSync(`${path}.tmp`, JSON.stringify(next, null, 2) + '\n');
  renameSync(`${path}.tmp`, path);
}
