import { continuousRuntimeHash } from './continuous-source.js';
import { describe, expect, it } from 'vitest';
import { selectChecks } from './validation-plan.js';
import { experimentInput } from './validation-inputs.js';
const archives = { ex1: 1, ex2: 2, ex3: 3, ex4: 4, ex5: 5, ex6: 6, ex7: 7 };
const plan = (files: string[]) => selectChecks(files, archives, 'fixture-base');
describe('dependency-scoped acceptance plans', () => {
  it('includes replay and visual registries imported by archive validators', () => {
    expect(experimentInput('apps/viewer/src/timeline.ts', 'ex3', 3)).toBe(true);
    expect(experimentInput('apps/viewer/src/timeline.ts', 'ex7', 7)).toBe(
      false,
    );
    expect(
      experimentInput('apps/viewer/src/continuous-visuals.ts', 'ex7', 7),
    ).toBe(true);
    expect(
      experimentInput('scripts/forest-checkpoint-repair.ts', 'ex8', 7),
    ).toBe(true);
    expect(experimentInput('apps/viewer/src/style.css', 'ex3', 3)).toBe(false);
  });
  it('separates acceptance tools and package scripts from frozen runtime identity', () => {
    const original = {
      'packages/world-core/src/continuous-kernel.ts': 'world',
      'scripts/continuous-analysis.ts': 'old validator',
      'package.json': JSON.stringify({
        scripts: { check: 'old' },
        dependencies: { runtime: '1' },
      }),
    };
    const tooling = {
      ...original,
      'scripts/continuous-analysis.ts': 'new validator',
      'package.json': JSON.stringify({
        scripts: { check: 'new' },
        dependencies: { runtime: '1' },
      }),
    };
    expect(continuousRuntimeHash(tooling)).toBe(
      continuousRuntimeHash(original),
    );
    expect(
      continuousRuntimeHash({
        ...tooling,
        'packages/world-core/src/continuous-kernel.ts': 'changed world',
      }),
    ).not.toBe(continuousRuntimeHash(original));
    expect(
      continuousRuntimeHash({
        ...tooling,
        'package.json': JSON.stringify({ dependencies: { runtime: '2' } }),
      }),
    ).not.toBe(continuousRuntimeHash(original));
  });
  it('does not rebuild worlds or capture historical images for documentation', () => {
    const selected = plan(['README.md', 'AGENTS.md', 'docs/VALIDATION.md']);
    expect(selected.code).toBe(false);
    expect(selected.experiments).toEqual([]);
    expect(selected.browserArchives).toEqual([]);
    expect(selected.browserGroups).toEqual([]);
  });
  it('validates a new archive without rebuilding unchanged older protocols', () => {
    const selected = selectChecks(
      ['experiment/ex8/manifest.json', 'docs/exec-plans/active/pr-22-task.md'],
      { ...archives, ex8: 7 },
      'base',
    );
    expect(selected.experiments).toEqual(['ex8']);
    expect(selected.browserArchives).toEqual(['ex8']);
    expect(selected.browserGroups).toEqual([]);
  });
  it('keeps isolated continuous runtime changes separate from grid protocols', () => {
    const selected = plan(['packages/world-core/src/continuous-nature.ts']);
    expect(selected.experiments).toEqual(['ex7']);
    expect(selected.browserGroups).toEqual(['continuous']);
    expect(selected.experiments).not.toContain('ex1');
  });
  it('expands shared replay and unknown dependencies, including explicit audits', () => {
    for (const path of [
      'packages/world-core/src/world.ts',
      'apps/viewer/src/timeline.ts',
      'unknown-setting.json',
    ])
      expect(plan([path]).experiments).toEqual(Object.keys(archives));
    expect(selectChecks([], archives, 'base', true).experiments).toEqual(
      Object.keys(archives),
    );
  });
  it('does not start browser validation for a PR contract implementation change', () => {
    const selected = plan(['scripts/pr-policy.ts', 'scripts/publication.ts']);
    expect(selected.code).toBe(true);
    expect(selected.browserGroups).toEqual([]);
  });
});

// Workflow-level invariants prevent duplicate quality and permanently pending required jobs.
import { readFileSync } from 'node:fs';
it('keeps stable checks while separating main pushes, PR commits and body edits', () => {
  const quality = readFileSync('.github/workflows/ci.yml', 'utf8');
  const policy = readFileSync('.github/workflows/pr-policy.yml', 'utf8');
  expect(quality).toContain('push:\n    branches: [main]');
  expect(quality).not.toMatch(/types:.*edited/);
  expect(quality).toContain('  quality:');
  expect(policy).toMatch(/types:.*edited/);
  expect(policy).toContain('  pr-policy:');
  expect(quality).not.toContain('paths-ignore:');
});
