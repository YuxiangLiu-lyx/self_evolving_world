import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkMergeCompatibility,
  currentDeliveryPolicy,
  git,
  verifyIntegrated,
} from './delivery-git.js';

let root: string;
const commit = (path: string, content: string): string => {
  writeFileSync(resolve(root, path), content);
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'Fixture change');
  return git(root, 'rev-parse', 'HEAD');
};
beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'world-delivery-git-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'fixture@example.test');
  git(root, 'config', 'user.name', 'Fixture');
  commit('state.txt', 'initial\n');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(root, 'switch', '-c', 'feat/task');
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
describe('non-mutating merge checks', () => {
  it('accepts an up-to-date branch and verifies integration only after main includes its commit', () => {
    const base = git(root, 'rev-parse', 'origin/main');
    const head = commit('feature.txt', 'Feature\n');
    expect(checkMergeCompatibility(root)).toBe(base);
    expect(() => {
      verifyIntegrated(root, head, head);
    }).toThrow('not verified');
    git(root, 'update-ref', 'refs/remotes/origin/main', head);
    expect(() => {
      verifyIntegrated(root, head, head);
    }).not.toThrow();
  });
  it('reports real conflicting paths without changing working files, branch or index', () => {
    commit('state.txt', 'feature\n');
    git(root, 'switch', 'main');
    const main = commit('state.txt', 'main\n');
    git(root, 'update-ref', 'refs/remotes/origin/main', main);
    git(root, 'switch', 'feat/task');
    const before = git(root, 'write-tree');
    expect(() => checkMergeCompatibility(root)).toThrow('state.txt');
    expect(readFileSync(resolve(root, 'state.txt'), 'utf8')).toBe('feature\n');
    expect(git(root, 'write-tree')).toBe(before);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(git(root, 'branch', '--show-current')).toBe('feat/task');
  });
  it('rejects a conflict-free but outdated branch and invalid baselines', () => {
    commit('feature.txt', 'feature\n');
    git(root, 'switch', 'main');
    const main = commit('other.txt', 'main\n');
    git(root, 'update-ref', 'refs/remotes/origin/main', main);
    git(root, 'switch', 'feat/task');
    expect(() => checkMergeCompatibility(root)).toThrow('behind main');
    expect(() => checkMergeCompatibility(root, 'missing')).toThrow();
  });
  it('rejects exceptions in unchanged historical plans and accepts only the current task plan', () => {
    const path = 'docs/exec-plans/active/pr-99-fixture.md';
    mkdirSync(resolve(root, 'docs/exec-plans/active'), { recursive: true });
    commit(
      path,
      '# Fixture\n\n## Delivery\n\n- Task: Fixture\n- Mode: local-only\n- Reason: The user explicitly requested local-only delivery.\n',
    );
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    expect(() => currentDeliveryPolicy(root, path, 'Fixture')).toThrow(
      'historical',
    );
    writeFileSync(
      resolve(root, path),
      readFileSync(resolve(root, path), 'utf8') + '\nUpdated scope.\n',
    );
    expect(currentDeliveryPolicy(root, path, 'Fixture').mode).toBe(
      'local-only',
    );
    expect(() => currentDeliveryPolicy(root, path, 'Other')).toThrow(
      'different task',
    );
  });
});
