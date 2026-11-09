import { spawnSync } from 'node:child_process';
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
import { git } from './delivery-git.js';
import { ORIGIN } from './publication.js';
import {
  hashFile,
  object,
  REVIEW_SCENES,
  sourceFingerprint,
} from './validation.js';

const repository = process.cwd();
const plan = 'docs/exec-plans/active/pr-99-fixture.md';
const task = 'Fixture delivery';
let root: string;
function save(path: string, value: unknown): void {
  writeFileSync(resolve(root, path), JSON.stringify(value));
}
function evidence(status = 'passed'): void {
  // Synthetic evidence belongs only to an isolated gate fixture, never task acceptance.
  save('validation-results/report.json', {
    version: 1,
    task,
    runId: 'fixture-run',
    sourceHash: sourceFingerprint(root),
    status,
    browserTests: 9,
    evidence: REVIEW_SCENES.map((id) => ({
      id,
      path: `test-results/${id}.png`,
      sha256: hashFile(resolve(root, `test-results/${id}.png`)),
    })),
  });
  save('validation-results/review.json', {
    runId: 'fixture-run',
    reviewer: 'Fixture reviewer',
    visual: REVIEW_SCENES.map((id) => ({
      id,
      verdict: 'pass',
      notes: 'Synthetic gate fixture only.',
    })),
    behavior: { verdict: 'pass', notes: 'Synthetic behavior fixture.' },
    requirements: { verdict: 'pass', notes: 'Synthetic requirement fixture.' },
  });
}
function finish(...args: string[]) {
  return spawnSync(
    process.execPath,
    [
      resolve(repository, 'node_modules/tsx/dist/cli.mjs'),
      '--tsconfig',
      resolve(repository, 'tsconfig.json'),
      resolve(repository, 'scripts/finish-task.ts'),
      task,
      ...args,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 15000,
      env: {
        ...process.env,
        GITHUB_TOKEN: '',
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'credential.helper',
        GIT_CONFIG_VALUE_0: '',
      },
    },
  );
}
beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'world-final-gate-'));
  for (const path of [
    'test-results',
    'validation-results',
    'docs/exec-plans/active',
  ])
    mkdirSync(resolve(root, path), { recursive: true });
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.email', 'fixture@example.test');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'remote', 'add', 'origin', ORIGIN);
  writeFileSync(
    resolve(root, '.gitignore'),
    'test-results/\nvalidation-results/\n',
  );
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'Fixture baseline');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(root, 'switch', '-c', 'feat/fixture');
  writeFileSync(
    resolve(root, plan),
    '# Fixture\n\n## Delivery\n\n- Task: Fixture delivery\n- Mode: local-only\n- Reason: The user explicitly requested no PR for this fixture.\n',
  );
  for (const id of REVIEW_SCENES)
    writeFileSync(
      resolve(root, `test-results/${id}.png`),
      Buffer.from('89504e470d0a1a0a0102', 'hex'),
    );
  evidence();
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
describe('final completion command', () => {
  it('completes an explicit local-only task without credentials, publication or a network remote', () => {
    const result = finish('--plan', plan);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(
      object(
        JSON.parse(
          readFileSync(
            resolve(root, 'validation-results/completion.json'),
            'utf8',
          ),
        ) as unknown,
      ).status,
    ).toBe('completed-with-exception');
  });
  it('requires publication when no local exception plan was supplied and replaces old success with failure', () => {
    save('validation-results/completion.json', { status: 'completed' });
    const result = finish();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No verified delivery');
    expect(
      object(
        JSON.parse(
          readFileSync(
            resolve(root, 'validation-results/completion.json'),
            'utf8',
          ),
        ) as unknown,
      ).status,
    ).toBe('failed');
  });
  it('rejects evidence that has not passed local review and source changes after review', () => {
    evidence('awaiting-review');
    expect(finish('--plan', plan).stderr).toContain('task:review');
    evidence();
    writeFileSync(resolve(root, 'new-source.txt'), 'Changed source');
    expect(finish('--plan', plan).stderr).toContain('Source changed');
  });
  it('does not use the local-only entry point to waive default merge completion', () => {
    writeFileSync(resolve(root, plan), '# Fixture default merge\n');
    evidence();
    const result = finish('--plan', plan);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('only for an explicit local-only');
  });
});
