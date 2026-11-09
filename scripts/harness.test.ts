import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkArchivePreservation,
  classifyChanges,
  taskRoute,
} from './harness.js';

describe('task routing', () => {
  it('blocks edits, additions and deletion of existing archives unless the current plan records explicit reuse', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'world-preservation-'));
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    };
    const artifact = resolve(root, 'experiment/ex1/report.md');
    try {
      git('init', '-b', 'main');
      git('config', 'user.email', 'fixture@example.test');
      git('config', 'user.name', 'Fixture');
      mkdirSync(resolve(root, 'experiment/ex1'), { recursive: true });
      writeFileSync(artifact, 'Original experiment');
      git('add', '.');
      git('commit', '-m', 'Fixture baseline');
      git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      expect(() => {
        checkArchivePreservation(root);
      }).not.toThrow();
      writeFileSync(artifact, 'Changed experiment');
      expect(() => {
        checkArchivePreservation(root);
      }).toThrow('Archived experiment changed');
      writeFileSync(artifact, 'Original experiment');
      writeFileSync(resolve(root, 'experiment/ex1/extra.json'), '{}');
      expect(() => {
        checkArchivePreservation(root);
      }).toThrow('Cannot add files');
      rmSync(resolve(root, 'experiment/ex1/extra.json'));
      rmSync(artifact);
      expect(() => {
        checkArchivePreservation(root);
      }).toThrow('cannot be removed');
      mkdirSync(resolve(root, 'docs/exec-plans/active'), { recursive: true });
      writeFileSync(
        resolve(root, 'docs/exec-plans/active/pr-20-reuse.md'),
        '# Reuse\n\n- Experiment reuse: ex1 — The user explicitly requested replacing this fixture archive.\n',
      );
      expect(() => {
        checkArchivePreservation(root);
      }).not.toThrow();
      // Preservation exceptions never waive the separate artifact or PR gates.
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('distinguishes code, experiment-only and mixed work without weakening validation', () => {
    expect(classifyChanges([]).kind).toBe('code');
    expect(classifyChanges(['README.md']).kind).toBe('code');
    expect(
      classifyChanges([
        'experiment/ex1/results.json',
        'docs/exec-plans/active/pr-09-experiment.md',
      ]).kind,
    ).toBe('experiment');
    expect(
      classifyChanges([
        'experiment/ex1/results.json',
        'apps/simulator/src/random-run.ts',
      ]).kind,
    ).toBe('mixed');
    expect(classifyChanges(['experiment/README.md']).kind).toBe('code');
    expect(classifyChanges(['experiment/ex01/results.json']).kind).toBe('code');
  });
  it('includes committed branch changes, staged edits, unstaged deletions and untracked files', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'world-harness-'));
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    };
    try {
      git('init', '-b', 'main');
      git('config', 'user.email', 'fixture@example.test');
      git('config', 'user.name', 'Fixture');
      writeFileSync(resolve(root, 'baseline.ts'), 'initial');
      writeFileSync(resolve(root, 'removed.ts'), 'initial');
      git('add', '.');
      git('commit', '-m', 'Fixture baseline');
      git('update-ref', 'refs/remotes/origin/main', 'HEAD');
      writeFileSync(resolve(root, 'committed.ts'), 'branch change');
      git('add', '.');
      git('commit', '-m', 'Fixture branch');
      writeFileSync(resolve(root, 'baseline.ts'), 'staged');
      git('add', 'baseline.ts');
      rmSync(resolve(root, 'removed.ts'));
      mkdirSync(resolve(root, 'experiment/ex1'), { recursive: true });
      writeFileSync(
        resolve(root, 'experiment/ex1/report.md'),
        'untracked experiment',
      );
      expect(taskRoute(root)).toEqual({
        kind: 'mixed',
        files: [
          'baseline.ts',
          'committed.ts',
          'experiment/ex1/report.md',
          'removed.ts',
        ],
        experiments: ['ex1'],
      });
      expect(() => taskRoute(root, 'missing-base')).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
