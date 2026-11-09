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
import {
  digest,
  newContext,
  parseIntent,
  type TaskContext,
} from './task-context.js';
import { legacyArguments } from './task-entry.js';
import { requireTaskWorker } from './task-worker.js';
import { hashFile, sourceFingerprint } from './validation.js';
import { taskRoute } from './harness.js';

const repository = process.cwd(),
  plan = 'docs/exec-plans/active/pr-99-fixture.md';
let root: string, c: TaskContext;
const basis = {
  source: 'task-instruction',
  reference: 'Isolated fixture only',
  quote: 'A real fixture instruction must not authorize production operations.',
};
function save(): void {
  writeFileSync(
    resolve(root, 'validation-results/tasks/fixture-task.json'),
    JSON.stringify(c),
  );
}
const env = () => ({
  SEW_TASK_ID: 'fixture-task',
  SEW_TASK_OWNER: String(process.pid),
});
beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'task-entry-'));
  for (const path of ['validation-results/tasks', 'docs/exec-plans/active'])
    mkdirSync(resolve(root, path), { recursive: true });
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Fixture');
  git(root, 'config', 'user.email', 'fixture@example.test');
  writeFileSync(resolve(root, '.gitignore'), 'validation-results/\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'Baseline');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(root, 'switch', '-c', 'feat/fixture');
  writeFileSync(resolve(root, plan), '# Fixture default merge\n');
  c = newContext(
    parseIntent({
      id: 'fixture-task',
      task: 'Fixture entry',
      request: 'Verify supported command boundaries without external writes.',
      plan,
      requirementsVersion: 1,
      requestedType: 'code',
      experiment: { mode: 'none' },
      analyze: [],
      delivery: { mode: 'merge', basis },
      merge: { status: 'missing' },
    }),
  );
  c.prepared = true;
  c.step = 'publish';
  c.status = 'running';
  c.derived = {
    branch: 'feat/fixture',
    head: git(root, 'rev-parse', 'HEAD'),
    base: git(root, 'rev-parse', 'origin/main'),
    sourceHash: sourceFingerprint(root),
    planHash: hashFile(resolve(root, plan)),
    route: taskRoute(root),
    policy: 'merge',
    commitRequired: true,
    publishRequired: true,
    mergeRequested: true,
  };
  c.validation = {
    runId: 'fixture-run',
    sourceHash: c.derived.sourceHash,
    intentHash: digest(c.intent),
    log: 'fixture',
  };
  writeFileSync(resolve(root, 'validation-results/review.json'), '{}');
  c.review = {
    runId: 'fixture-run',
    sourceHash: c.derived.sourceHash,
    files: [...c.derived.route.files],
    commitMessage: 'Fixture',
    evidenceHash: hashFile(resolve(root, 'validation-results/review.json')),
  };
  c.body = {
    path: 'validation-results/body.md',
    title: 'Fixture publication title',
    head: c.derived.head,
    runId: 'fixture-run',
  };
  writeFileSync(
    resolve(root, c.body.path),
    '## Validation\n\n- Task: Fixture entry\n- Run ID: fixture-run\n',
  );
  writeFileSync(
    resolve(root, 'validation-results/tasks/execution.lock'),
    String(process.pid),
  );
  save();
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('mandatory task entry', () => {
  it('binds learning continuation to its mode, existing allocation and leased stage', () => {
    c.step = 'experiment';
    c.intent = {
      ...c.intent,
      experiment: {
        mode: 'learning',
        allocation: 'new',
        basis: c.intent.delivery.basis,
      },
    };
    c.experiment = { phase: 'started', before: [], id: 'ex4' };
    save();
    expect(legacyArguments(root, 'learning', [])).toEqual([
      'next',
      c.intent.id,
    ]);
    expect(requireTaskWorker(root, 'learning', [], env()).experiment?.id).toBe(
      'ex4',
    );
    expect(() => requireTaskWorker(root, 'learning', ['ex5'], env())).toThrow(
      'does not match',
    );
    expect(() =>
      requireTaskWorker(root, 'random', ['42', '60'], env()),
    ).toThrow('parameters');
    c.step = 'development';
    save();
    expect(() => requireTaskWorker(root, 'learning', [], env())).toThrow(
      'executing task step',
    );
    expect(() =>
      parseIntent({
        ...c.intent,
        experiment: { ...c.intent.experiment, rounds: 99 },
      }),
    ).toThrow('fixed protocol');
  });

  it('routes old harness/review/finish/publication to the same context without a merge switch', () => {
    expect(legacyArguments(root, 'harness', ['next', c.intent.id])).toEqual([
      'next',
      c.intent.id,
    ]);
    for (const entry of ['harness', 'review', 'finish'])
      expect(legacyArguments(root, entry, [c.intent.task])).toEqual([
        'next',
        c.intent.id,
      ]);
    expect(
      legacyArguments(root, 'publish', [
        'validation-results/body.md',
        'Fixture publication title',
      ]),
    ).toEqual(['next', c.intent.id]);
    expect(
      legacyArguments(root, 'publish', [
        'validation-results/body.md',
        'Fixture publication title',
        '--verify-only',
      ]),
    ).toEqual(['verify', c.intent.id]);
    expect(() =>
      legacyArguments(root, 'publish', [
        'validation-results/body.md',
        'Fixture publication title',
        '--merge',
      ]),
    ).toThrow('Invalid');
    rmSync(resolve(root, 'validation-results/tasks/fixture-task.json'));
    expect(() => legacyArguments(root, 'harness', [c.intent.task])).toThrow(
      'matching recorded task',
    );
  });
  it('submits only the current PR-body request and keeps generated response files out of task discovery', () => {
    c.request = {
      id: 'fixture-request',
      taskId: c.intent.id,
      step: 'pr-body',
      requirementsVersion: 1,
      sourceHash: c.derived?.sourceHash ?? '',
      intentHash: digest(c.intent),
      materials: {},
      question: 'Prepare body',
      resume: 'fixture',
    };
    save();
    const args = legacyArguments(root, 'publish', [
      'validation-results/body.md',
      'Fixture publication title',
    ]);
    expect(args.slice(0, 2)).toEqual(['submit', c.intent.id]);
    expect(
      JSON.parse(readFileSync(resolve(root, args[2] ?? ''), 'utf8')),
    ).toMatchObject({ kind: 'pr-body', requestId: 'fixture-request' });
    expect(legacyArguments(root, 'harness', [c.intent.task])).toEqual([
      'next',
      c.intent.id,
    ]);
  });
  it('permits only leased prepare/verify workers and blocks ungranted completion, changed review and source', () => {
    const args = [
      'validation-results/body.md',
      'Fixture publication title',
      '--prepare-only',
    ];
    expect(
      requireTaskWorker(root, 'publish', args, env()).intent.merge.status,
    ).toBe('missing');
    expect(() => requireTaskWorker(root, 'publish', args, {})).toThrow(
      'unified task',
    );
    expect(() =>
      requireTaskWorker(root, 'publish', args.slice(0, 2), env()),
    ).toThrow('explicit prepare-only');
    c.step = 'finish';
    save();
    expect(() =>
      requireTaskWorker(
        root,
        'publish',
        [...args.slice(0, 2), '--verify-only'],
        env(),
      ),
    ).toThrow('authorization');
    c.step = 'publish';
    save();
    writeFileSync(
      resolve(root, 'validation-results/review.json'),
      '{"changed":true}',
    );
    expect(() => requireTaskWorker(root, 'publish', args, env())).toThrow(
      'review evidence changed',
    );
    writeFileSync(resolve(root, 'new.txt'), 'Source change');
    expect(() => requireTaskWorker(root, 'publish', args, env())).toThrow(
      'Source changed',
    );
  });
  it('matches random intent and prevents an unrecorded model invocation or repeated allocation', () => {
    c.step = 'experiment';
    c.intent = {
      ...c.intent,
      experiment: {
        mode: 'random',
        allocation: 'new',
        basis: c.intent.delivery.basis,
        seed: 42,
        rounds: 60,
      },
    };
    c.experiment = { phase: 'started', before: [] };
    save();
    expect(legacyArguments(root, 'random', ['42', '60'])).toEqual([
      'next',
      c.intent.id,
    ]);
    expect(() => legacyArguments(root, 'random', ['43', '60'])).toThrow(
      'parameters differ',
    );
    expect(
      requireTaskWorker(root, 'random', ['42', '60'], env()).intent.experiment
        .mode,
    ).toBe('random');
    expect(() => requireTaskWorker(root, 'survival', [], env())).toThrow(
      'Survival execution',
    );
    c.experiment.id = 'ex4';
    save();
    expect(legacyArguments(root, 'resume', ['ex4'])).toEqual([
      'recover',
      c.intent.id,
      'ex4',
    ]);
    expect(() =>
      requireTaskWorker(root, 'random', ['42', '60'], env()),
    ).toThrow('parameters');
    expect(
      requireTaskWorker(root, 'resume', ['ex4'], env()).experiment?.id,
    ).toBe('ex4');
    expect(() => requireTaskWorker(root, 'resume', ['ex5'], env())).toThrow(
      'allocated',
    );
  });
  it.each([
    ['publish-task.ts', 'missing.md', 'Unreviewed title'],
    ['finish-task.ts', 'Fixture entry'],
    ['validate.ts', 'review', 'Fixture entry'],
    ['experiment-cli.ts', 'run'],
    ['survival-cli.ts'],
    ['learning-cli.ts'],
  ])(
    'rejects raw %s before credentials, allocation or accepting evidence',
    (...args) => {
      const result = spawnSync(
        process.execPath,
        [
          resolve(repository, 'node_modules/tsx/dist/cli.mjs'),
          '--tsconfig',
          resolve(repository, 'tsconfig.json'),
          resolve(repository, 'scripts', args[0]),
          ...args.slice(1),
        ],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 15000,
          env: {
            ...process.env,
            SEW_TASK_ID: '',
            SEW_TASK_OWNER: '',
            GITHUB_TOKEN: '',
          },
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('unified task coordinator');
      expect(git(root, 'rev-parse', 'HEAD')).toBe(c.derived?.head);
    },
  );
});
