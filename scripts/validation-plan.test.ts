import { continuousRuntimeHash } from './continuous-source.js';
import { describe, expect, it } from 'vitest';
import {
  browserInput,
  selectChecks,
  toolingManifestChange,
} from './validation-plan.js';
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
    expect(experimentInput('scripts/continuous-source.ts', 'ex8', 7)).toBe(
      true,
    );
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
  it('binds published story changes to browser evidence while prose and recordings remain documentation', () => {
    const root = mkdtempSync(join(tmpdir(), 'story-dependencies-'));
    try {
      const directory = join(root, 'docs/presentation/ex13');
      mkdirSync(directory, { recursive: true });
      const story = join(directory, 'story.json');
      writeFileSync(story, '{"bookmarks":[]}');
      const selected = selectChecks(
        ['docs/presentation/ex13/story.json'],
        {},
        'base',
      );
      expect(selected.browserGroups).toEqual(['continuous']);
      expect(selected.code).toBe(false);
      const before = browserInput(root, selected);
      writeFileSync(join(directory, 'README.md'), 'Presentation evidence');
      writeFileSync(join(directory, 'playback.webm'), 'recording fixture');
      expect(browserInput(root, selected)).toBe(before);
      writeFileSync(story, '{"bookmarks":[{"tick":11}]}');
      expect(browserInput(root, selected)).not.toBe(before);
      expect(plan(['docs/presentation/ex13/README.md']).browserGroups).toEqual(
        [],
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('keeps isolated continuous runtime changes separate from grid protocols', () => {
    const selected = plan(['packages/world-core/src/continuous-nature.ts']);
    expect(selected.experiments).toEqual(['ex7']);
    expect(selected.browserGroups).toEqual(['continuous']);
    expect(selected.experiments).not.toContain('ex1');
  });
  it('expands shared replay and unknown dependencies, including explicit audits', () => {
    for (const path of ['apps/viewer/src/timeline.ts', 'unknown-setting.json'])
      expect(plan([path]).experiments).toEqual(Object.keys(archives));
    expect(plan(['packages/world-core/src/world.ts']).experiments).toEqual([
      'ex1',
      'ex2',
      'ex3',
      'ex4',
      'ex5',
      'ex6',
    ]);
    expect(selectChecks([], archives, 'base', true).experiments).toEqual(
      Object.keys(archives),
    );
  });
  it('runs only code checks for validation, delivery and read-only metric tooling', () => {
    const selected = plan([
      'scripts/culture-metrics.test.ts',
      'scripts/culture-metrics.ts',
      'scripts/long-compatibility.ts',
      'scripts/long-metrics.ts',
      'scripts/pr-policy.ts',
      'scripts/publish-pr.ts',
      'scripts/validate.ts',
      'scripts/validation.ts',
    ]);
    expect(selected.code).toBe(true);
    expect(selected.experiments).toEqual([]);
    expect(selected.browserGroups).toEqual([]);
  });
  it('limits a package manifest to code checks only when it just adds or changes tooling scripts', () => {
    const manifest = (scripts: Record<string, string>, extra = {}) =>
      JSON.stringify({
        name: 'x',
        scripts,
        devDependencies: { a: '1' },
        ...extra,
      });
    const base = manifest({
      build: 'pnpm -r build',
      'metrics:long': 'tsx scripts/long-metrics.ts',
    });
    const added = manifest({
      build: 'pnpm -r build',
      'metrics:long': 'tsx scripts/long-metrics.ts',
      'metrics:culture': 'tsx scripts/culture-metrics.ts',
    });
    expect(toolingManifestChange(base, added)).toBe(true);
    expect(toolingManifestChange(added, base)).toBe(true);
    for (const changed of [
      manifest({ build: 'tsc', 'metrics:long': 'tsx scripts/long-metrics.ts' }),
      manifest({
        build: 'pnpm -r build',
        'metrics:long': 'tsx scripts/long-metrics.ts',
        run: 'tsx scripts/continuous-cli.ts',
      }),
      manifest(
        {
          build: 'pnpm -r build',
          'metrics:long': 'tsx scripts/long-metrics.ts',
        },
        { devDependencies: { a: '2' } },
      ),
      base,
      'not json',
    ])
      expect(toolingManifestChange(base, changed)).toBe(false);
    const tooling = selectChecks(
      ['package.json', 'scripts/culture-metrics.ts'],
      archives,
      'fixture-base',
      false,
      new Set(['package.json']),
    );
    expect(tooling.code).toBe(true);
    expect(tooling.experiments).toEqual([]);
    expect(tooling.browserGroups).toEqual([]);
    expect(plan(['package.json']).experiments).toEqual(Object.keys(archives));
  });
  it('treats every newer continuous-family prefix as protocol 7 only', () => {
    for (const path of [
      'packages/world-core/src/open-process.ts',
      'packages/world-core/src/long-planting.ts',
      'apps/simulator/src/collective-controller.ts',
      'packages/world-core/src/material-lots.ts',
      'packages/world-core/src/expression.ts',
      'packages/world-core/src/expression-incentives.ts',
    ])
      expect(plan([path]).experiments).toEqual(['ex7']);
  });
});

// Workflow-level invariants prevent duplicate quality and permanently pending required jobs.
import {
  readFileSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
