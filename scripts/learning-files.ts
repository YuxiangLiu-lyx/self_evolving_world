import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { acceptDevelopment } from '../apps/simulator/src/learning-run.js';
import { readLearningExecution } from './learning-analysis.js';
import { object, readJson } from './validation.js';

/** Resume binding excludes archives, UI and task state; old completed archives remain versioned. */
export function learningEngineHash(root: string): string {
  const hash = createHash('sha256');
  const visit = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name, 'en'),
    )) {
      const file = resolve(path, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith('.ts'))
        hash
          .update(relative(root, file))
          .update('\0')
          .update(readFileSync(file));
    }
  };
  visit(resolve(root, 'packages/world-core/src'));
  visit(resolve(root, 'apps/simulator/src'));
  return hash.digest('hex');
}
export function learningCheckpoint(root: string, id: string) {
  const directory = resolve(root, 'experiment', id),
    manifest = object(readJson(resolve(directory, 'manifest.json')));
  if (
    manifest.version !== 4 ||
    object(manifest.provenance).engineHash !== learningEngineHash(root)
  )
    throw new Error(
      'Learning source changed during the saved experiment; continuation is blocked.',
    );
  return readLearningExecution(readJson(resolve(directory, 'execution.json')));
}
export function submitLearningDevelopment(
  root: string,
  id: string,
  input: unknown,
): void {
  const state = learningCheckpoint(root, id),
    next = acceptDevelopment(state, input),
    path = resolve(root, 'experiment', id, 'execution.json');
  writeFileSync(`${path}.tmp`, JSON.stringify(next, null, 2) + '\n');
  renameSync(`${path}.tmp`, path);
}
