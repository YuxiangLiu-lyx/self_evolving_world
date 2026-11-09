import { DEFAULT_SEED } from '../apps/simulator/src/random-run.js';
import { DEFAULT_ROUNDS } from '../apps/simulator/src/synchronous-run.js';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from './delivery-git.js';
import { validationFields } from './pr-policy.js';
import {
  readTask,
  requireTaskWorker,
  type WorkerOperation,
} from './task-worker.js';

export function legacyArguments(
  root: string,
  entry: string,
  args: string[],
): string[] {
  if (
    entry === 'harness' &&
    [
      'start',
      'next',
      'submit',
      'status',
      'amend',
      'verify',
      'recover',
    ].includes(args[0] ?? '')
  )
    return args;
  const directory = resolve(root, 'validation-results/tasks');
  const task =
    entry === 'publish' && args[0]
      ? validationFields(readFileSync(resolve(root, args[0]), 'utf8')).task
      : ['harness', 'review', 'finish'].includes(entry)
        ? args
            .slice(
              0,
              args.indexOf('--plan') < 0 ? undefined : args.indexOf('--plan'),
            )
            .join(' ')
        : undefined;
  const matches = (existsSync(directory) ? readdirSync(directory) : [])
    .filter((name) => /^[a-z0-9][a-z0-9-]{1,79}\.json$/.test(name))
    .map((name) => readTask(root, name.slice(0, -5)))
    .filter(
      (c) =>
        c.derived?.branch === git(root, 'branch', '--show-current') &&
        (task
          ? c.intent.task === task
          : c.status !== 'completed' &&
            (entry === 'resume'
              ? c.experiment?.id === args[0]
              : c.intent.experiment.mode === entry)),
    );
  if (matches.length !== 1 || !matches[0])
    throw new Error(
      'Legacy task entry requires one matching recorded task. Use pnpm task -- start intent.json or next ID; no operation was performed.',
    );
  const c = matches[0];
  if (
    entry === 'random' &&
    (c.intent.experiment.mode !== 'random' ||
      args.length > 2 ||
      Number(args[0] ?? DEFAULT_SEED) !==
        (c.intent.experiment.seed ?? DEFAULT_SEED) ||
      Number(args[1] ?? DEFAULT_ROUNDS) !==
        (c.intent.experiment.rounds ?? DEFAULT_ROUNDS))
  )
    throw new Error(
      'Legacy experiment parameters differ from recorded intent; amend the intent explicitly.',
    );
  if (
    entry === 'finish' &&
    args.includes('--plan') &&
    (args.at(-1) !== c.intent.plan ||
      args.indexOf('--plan') !== args.length - 2)
  )
    throw new Error('Completion plan differs from recorded intent.');
  if (entry === 'survival' && args.length)
    throw new Error('Survival uses the recorded fixed protocol.');
  if (entry === 'resume' && (args.length !== 1 || args[0] !== c.experiment?.id))
    throw new Error('Resume requires the recorded experiment ID.');
  if (entry === 'resume') return ['recover', c.intent.id, args[0] ?? ''];
  if (entry === 'publish') {
    if (
      args.length < 2 ||
      args.length > 3 ||
      (args[2] !== undefined &&
        !['--prepare-only', '--verify-only'].includes(args[2]))
    )
      throw new Error('Invalid legacy publication arguments.');
    // The old read-only option remains read-only; it cannot silently advance a mutation.
    if (args[2] === '--verify-only') return ['verify', c.intent.id];
    if (c.request?.step === 'pr-body') {
      const response = `validation-results/tasks/${c.intent.id}.legacy-body.json`;
      writeFileSync(
        resolve(root, response),
        JSON.stringify({
          requestId: c.request.id,
          requirementsVersion: c.request.requirementsVersion,
          sourceHash: c.request.sourceHash,
          kind: 'pr-body',
          file: args[0],
          title: args[1],
        }),
      );
      return ['submit', c.intent.id, response];
    }
    if (c.body && (args[0] !== c.body.path || args[1] !== c.body.title))
      throw new Error(
        'Publication parameters differ from the reviewed coordinator body.',
      );
  }
  return ['next', c.intent.id];
}

function main(): void {
  const [entry, ...args] = process.argv.slice(2).filter((arg) => arg !== '--');
  try {
    if (
      !entry ||
      ![
        'harness',
        'review',
        'publish',
        'finish',
        'random',
        'survival',
        'resume',
      ].includes(entry)
    )
      throw new Error('Invalid task compatibility entry.');
    let command: string[];
    if (process.env.SEW_TASK_ID) {
      requireTaskWorker(process.cwd(), entry as WorkerOperation, args);
      const workers: Record<string, string[]> = {
        review: ['scripts/validate.ts', 'review'],
        publish: ['scripts/publish-task.ts'],
        finish: ['scripts/finish-task.ts'],
        random: ['scripts/experiment-cli.ts', 'run'],
        resume: ['scripts/experiment-cli.ts', 'resume'],
        survival: ['scripts/survival-cli.ts'],
      };
      const worker = workers[entry];
      if (!worker)
        throw new Error('Harness is a coordinator alias, not a worker.');
      command = [...worker, ...args];
    } else
      command = [
        'scripts/task.ts',
        ...legacyArguments(process.cwd(), entry, args),
      ];
    if (entry === 'survival' && process.env.SEW_TASK_ID) {
      const build = spawnSync('pnpm', ['build'], { stdio: 'inherit' });
      if (build.error) throw build.error;
      if (build.status !== 0)
        throw new Error('Survival build failed before allocation.');
    }
    const result = spawnSync(
      process.execPath,
      [resolve('node_modules/tsx/dist/cli.mjs'), ...command],
      { stdio: 'inherit' },
    );
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        status: 'blocked',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
