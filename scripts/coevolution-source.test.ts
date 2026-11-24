import { afterEach, describe, expect, it } from 'vitest';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCoevolutionExecution } from './coevolution-analysis.js';
import {
  readSourceHistory,
  sourceArtifactFiles,
} from './coevolution-source.js';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const ARCHIVE = 'experiment/ex6';
const state = readCoevolutionExecution(
  JSON.parse(readFileSync(join(ARCHIVE, 'execution.json'), 'utf8')),
);
/** Copies only the retained source provenance of ex6 so a test can alter it without touching the archive. */
function archive() {
  const root = mkdtempSync(join(tmpdir(), 'coevolution-source-'));
  roots.push(root);
  const directory = join(root, ARCHIVE);
  mkdirSync(directory, { recursive: true });
  for (const name of [
    'manifest.json',
    'source-history.json',
    'extension-validation-2.txt',
    'extension-validation-3.txt',
  ])
    copyFileSync(join(ARCHIVE, name), join(directory, name));
  const historyPath = join(directory, 'source-history.json');
  const history = JSON.parse(readFileSync(historyPath, 'utf8')) as Record<
    string,
    unknown
  >[];
  const save = (value: unknown) => {
    writeFileSync(historyPath, JSON.stringify(value));
  };
  return { root, directory, history, save };
}
describe('versioned coevolution source provenance', () => {
  it('retains named implementation evidence while rejecting unrelated or duplicate archive paths', () => {
    expect(
      sourceArtifactFiles([
        'development-baselines.json',
        'extension-validation-2.txt',
        'extension-validation-2-failed-1.txt',
      ]),
    ).toHaveLength(3);
    for (const names of [
      ['../execution.json'],
      ['unrelated.txt'],
      ['extension-validation-2.txt', 'extension-validation-2.txt'],
    ])
      expect(() => sourceArtifactFiles(names)).toThrow(/artifact list/);
  });
  it('binds retained engine bytes, validation logs and the complete executed prefix', () => {
    const { root, directory, history, save } = archive();
    expect(readSourceHistory(root, 'ex6', state)).toHaveLength(3);
    save(history.map((r, i) => (i ? r : { ...r, prefixHash: 'altered' })));
    expect(() => readSourceHistory(root, 'ex6', state)).toThrow(/prefix/);
    save(
      history.map((r, i) =>
        i === 1
          ? {
              ...r,
              sources: {
                ...(r.sources as Record<string, string>),
                'apps/simulator/src/added.ts': '// Altered retained source.\n',
              },
            }
          : r,
      ),
    );
    expect(() => readSourceHistory(root, 'ex6', state)).toThrow(
      /Invalid retained source revision/,
    );
    save(history);
    writeFileSync(join(directory, 'extension-validation-3.txt'), 'altered\n');
    expect(() => readSourceHistory(root, 'ex6', state)).toThrow(
      /validation evidence changed/,
    );
  });
});
