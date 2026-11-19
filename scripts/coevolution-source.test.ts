import { afterEach, describe, expect, it } from 'vitest';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createCoevolutionRun,
  acceptCoevolutionProgram,
} from '@self-evolving-world/world-core';
import { initialCoevolutionWorld } from '../apps/simulator/src/coevolution-scenario.js';
import { newCoevolutionExecution } from '../apps/simulator/src/coevolution-run.js';
import type { CoevolutionExecution } from '../apps/simulator/src/coevolution-run.js';
import { worldCoevolutionInput } from '../apps/simulator/src/coevolution-input.js';
import {
  readSourceHistory,
  saveSourceHistory,
  sourceRevision,
  validateSourceExtension,
  sourceArtifactFiles,
} from './coevolution-source.js';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'coevolution-source-'));
  roots.push(root);
  for (const path of ['packages/world-core/src', 'apps/simulator/src'])
    cpSync(join(process.cwd(), path), join(root, path), { recursive: true });
  mkdirSync(join(root, 'experiment/ex1'), { recursive: true });
  let run = createCoevolutionRun(initialCoevolutionWorld());
  for (const agentId of ['lin', 'moss', 'sol'])
    run = acceptCoevolutionProgram(run, {
      agentId,
      tick: 0,
      call: 1,
      code: null,
      summary: 'Offline source-binding fixture only.',
      project: null,
    });
  const state: CoevolutionExecution = {
    ...newCoevolutionExecution('offline-fixture', 'simulated-test'),
    phase: 'development',
    programs: run.programs,
    barrier: {
      id: 'fixture-barrier',
      tick: 0,
      input: worldCoevolutionInput(run),
      errors: ['Unsupported offline fixture effect'],
      proposed: null,
    },
  };
  const revision = sourceRevision(
    root,
    state,
    'Offline source-binding fixture; never ordinary model context.',
  );
  writeFileSync(
    join(root, 'experiment/ex1/manifest.json'),
    JSON.stringify({
      version: 6,
      provenance: { engineHash: revision.engineHash },
    }),
  );
  saveSourceHistory(root, 'ex1', [revision]);
  return { root, state, revision };
}
describe('versioned coevolution source handoff', () => {
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
  it('binds retained engine bytes and the complete executed prefix', () => {
    const { root, state, revision } = fixture();
    expect(readSourceHistory(root, 'ex1', state)).toHaveLength(1);
    saveSourceHistory(root, 'ex1', [{ ...revision, prefixHash: 'altered' }]);
    expect(() => readSourceHistory(root, 'ex1', state)).toThrow(/prefix/);
  });
  it('blocks prompt or simulator changes before any validation command or inference', () => {
    const { root, state } = fixture(),
      path = join(root, 'apps/simulator/src/coevolution-provider.ts');
    writeFileSync(
      path,
      readFileSync(path, 'utf8') + '\n// Changed fixture prompt.\n',
    );
    expect(() =>
      validateSourceExtension(
        root,
        'ex1',
        state,
        'This proposed change must be rejected because it modifies a frozen model prompt.',
      ),
    ).toThrow(/new run/);
  });
  it('blocks runtime parameter tuning even inside an allowed interpreter file', () => {
    const { root, state } = fixture(),
      path = join(root, 'packages/world-core/src/coevolution-schema.ts');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        'initialSatiety: 80',
        'initialSatiety: 100',
      ),
    );
    expect(() =>
      validateSourceExtension(
        root,
        'ex1',
        state,
        'This proposed change must be rejected because it changes a frozen survival parameter.',
      ),
    ).toThrow(/parameters/);
  });
});
