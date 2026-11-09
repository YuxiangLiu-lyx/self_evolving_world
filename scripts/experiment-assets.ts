import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  experimentIds,
  jsonObject,
  readExperiment,
  readExperimentJson,
} from './experiments.js';

/** Publish validated data, never application source or private model output. */
export function experimentAssets(root: string): Map<string, string> {
  const assets = new Map<string, string>();
  const entries = [];
  for (const id of experimentIds(root)) {
    const manifest = jsonObject(
      readExperimentJson(resolve(root, 'experiment', id, 'manifest.json')),
    );
    // Capture/resume builds must remain possible before a run is complete.
    if (manifest.status === 'running' || manifest.status === 'failed') continue;
    const record = readExperiment(root, id);
    entries.push({ ...record.config, createdAt: record.manifest.createdAt });
    for (const file of ['replay.json', 'overview.svg']) {
      assets.set(
        `experiments/${id}/${file}`,
        readFileSync(resolve(record.directory, file), 'utf8'),
      );
    }
  }
  assets.set(
    'experiments/index.json',
    JSON.stringify({ version: 1, experiments: entries }),
  );
  return assets;
}
