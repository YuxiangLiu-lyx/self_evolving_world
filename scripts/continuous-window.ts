import { existsSync, copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { extendContinuousWindow } from '../apps/simulator/src/continuous-run.js';
import {
  continuousAtomic,
  continuousHash,
  continuousRead,
  readContinuousExecution,
} from './continuous-store.js';
import { continuousCheckpoint } from './continuous-files.js';
import {
  readContinuousExperiment,
  continuousArtifactFiles,
} from './continuous-analysis.js';

/** An explicitly authorized reuse task preserves the old capture before advancing its observation horizon. */
export function prepareContinuousWindow(
  root: string,
  id: string,
  target: number,
): void {
  const directory = resolve(root, 'experiment', id),
    manifestPath = resolve(directory, 'manifest.json');
  const manifest = continuousRead<Record<string, unknown>>(manifestPath),
    state = continuousCheckpoint(root, id);
  readContinuousExperiment(root, id, manifest, false);
  const next = extendContinuousWindow(state, target),
    prefix = `windows/through-${String(state.windowTarget)}`;
  if (existsSync(resolve(directory, prefix)))
    throw new Error(
      'A preserved observation window already exists; inspect its journal before retrying.',
    );
  const files = [
    'manifest.json',
    ...continuousArtifactFiles(manifest).filter(
      (p) => !p.startsWith('windows/') && p !== 'window-history.json',
    ),
  ];
  const retained: Record<string, string> = {};
  for (const file of files) {
    const destination = resolve(directory, prefix, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(directory, file), destination);
    retained[`${prefix}/${file}`] = continuousHash(readFileSync(destination));
  }
  const historyPath = resolve(directory, 'window-history.json'),
    history = existsSync(historyPath)
      ? continuousRead<unknown[]>(historyPath)
      : [];
  history.push({
    from: state.windowTarget,
    to: target,
    observed: state.world.tick,
    retained,
    countsPreserved: {
      ordinaryAndWorld: state.attempts.length,
      development: state.developments.length,
    },
    stateHash: continuousHash(state),
    nextStateHash: continuousHash(next),
  });
  continuousAtomic(historyPath, history);
  continuousAtomic(resolve(directory, 'execution.json'), next);
  const metadata = { ...manifest };
  delete metadata.artifacts;
  continuousAtomic(manifestPath, {
    ...metadata,
    status: 'running',
    targetWindow: target,
    windowPhase: 'running',
    files: [],
  });
  if (
    readContinuousExecution(root, id).attempts.length !== state.attempts.length
  )
    throw new Error('Continuation changed the protected call ledger.');
}
