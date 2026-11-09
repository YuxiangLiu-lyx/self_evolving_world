import { DEFAULT_SEED } from '../apps/simulator/src/random-run.js';
import { DEFAULT_ROUNDS } from '../apps/simulator/src/synchronous-run.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { currentDeliveryPolicy, git } from './delivery-git.js';
import { digest, parseIntent, type TaskContext } from './task-context.js';
import { hashFile, object, readJson, sourceFingerprint } from './validation.js';

export function readTask(root: string, id: string): TaskContext {
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id))
    throw new Error('Invalid task ID.');
  const value = object(
    readJson(resolve(root, 'validation-results/tasks', `${id}.json`)),
  );
  const intent = parseIntent(value.intent),
    originalIntent = parseIntent(value.originalIntent);
  if (
    value.version !== 1 ||
    intent.id !== id ||
    originalIntent.id !== id ||
    !Array.isArray(value.history) ||
    !Array.isArray(value.amendments) ||
    typeof value.prepared !== 'boolean'
  )
    throw new Error('Invalid task journal.');
  return {
    ...value,
    intent,
    originalIntent,
    amendments: value.amendments.map(parseIntent),
  } as unknown as TaskContext;
}

export type WorkerOperation =
  'review' | 'publish' | 'finish' | 'random' | 'survival' | 'resume';

/** A coordinator lease is an accidental-bypass guard, not a sandbox against local file tampering. */
export function requireTaskWorker(
  root: string,
  operation: WorkerOperation,
  args: string[],
  env = process.env,
): TaskContext {
  const id = env.SEW_TASK_ID,
    owner = env.SEW_TASK_OWNER;
  if (!id || !owner || !/^[1-9]\d*$/.test(owner))
    throw new Error(
      'This worker requires the unified task coordinator. Use pnpm task -- next ID or start intent.json.',
    );
  if (
    readFileSync(
      resolve(root, 'validation-results/tasks/execution.lock'),
      'utf8',
    ) !== owner
  )
    throw new Error(
      'Task execution lease is missing or belongs to another process.',
    );
  process.kill(Number(owner), 0);
  const c = readTask(root, id),
    s = c.derived;
  const step =
    operation === 'review'
      ? 'review'
      : operation === 'finish' ||
          (operation === 'publish' && args[2] === '--verify-only')
        ? 'finish'
        : operation === 'publish'
          ? 'publish'
          : 'experiment';
  if (
    !c.prepared ||
    c.status !== 'running' ||
    c.step !== step ||
    !s ||
    s.branch !== git(root, 'branch', '--show-current') ||
    s.head !== git(root, 'rev-parse', 'HEAD')
  )
    throw new Error(
      'Worker does not match the currently executing task step and checkout.',
    );
  if (
    currentDeliveryPolicy(root, c.intent.plan, c.intent.task, s.base).mode !==
    c.intent.delivery.mode
  )
    throw new Error(
      'Task intent disagrees with the current plan delivery policy.',
    );
  if (['review', 'publish', 'finish'].includes(operation)) {
    if (
      s.sourceHash !== sourceFingerprint(root) ||
      c.validation?.sourceHash !== s.sourceHash ||
      c.validation.intentHash !== digest(c.intent)
    )
      throw new Error(
        'Source changed or task validation is stale. Continue the coordinator for fresh evidence.',
      );
    if (
      operation !== 'review' &&
      (!c.review ||
        c.review.runId !== c.validation.runId ||
        c.review.sourceHash !== s.sourceHash)
    )
      throw new Error("Worker requires this task's accepted review.");
  }
  if (
    ['publish', 'finish'].includes(operation) &&
    c.review?.evidenceHash !==
      hashFile(resolve(root, 'validation-results/review.json'))
  )
    throw new Error(
      'Accepted review evidence changed; continue the coordinator for fresh review.',
    );
  if (operation === 'publish') {
    if (
      c.intent.delivery.mode === 'local-only' ||
      !c.body ||
      args.length !== 3 ||
      args[0] !== c.body.path ||
      args[1] !== c.body.title ||
      !['--prepare-only', '--verify-only'].includes(args[2] ?? '') ||
      c.body.head !== s.head ||
      c.body.runId !== c.validation?.runId
    )
      throw new Error(
        'Publication requires the current coordinator body and explicit prepare-only or verify-only mode.',
      );
  }
  if (
    operation === 'finish' &&
    args.join('\0') !==
      [
        c.intent.task,
        ...(c.intent.delivery.mode === 'local-only'
          ? ['--plan', c.intent.plan]
          : []),
      ].join('\0')
  )
    throw new Error('Completion parameters do not match the recorded task.');
  if (operation === 'review' && args.join(' ') !== c.intent.task)
    throw new Error('Review task does not match the coordinator.');
  if (
    step === 'finish' &&
    c.intent.delivery.mode === 'merge' &&
    c.intent.merge.status !== 'granted'
  )
    throw new Error('No actual scoped merge authorization was recorded.');
  if (step === 'experiment') {
    const e = c.intent.experiment;
    if (e.mode === 'none' || !c.experiment || c.experiment.phase !== 'started')
      throw new Error(
        'No recorded experiment allocation or recovery is executing.',
      );
    if (
      operation === 'random' &&
      (e.mode !== 'random' ||
        e.allocation !== 'new' ||
        c.experiment.id ||
        args.join(',') !==
          [
            String(e.seed ?? DEFAULT_SEED),
            String(e.rounds ?? DEFAULT_ROUNDS),
          ].join(','))
    )
      throw new Error(
        'Random parameters do not match the recorded experiment.',
      );
    if (
      operation === 'survival' &&
      (e.mode !== 'survival' ||
        e.allocation !== 'new' ||
        c.experiment.id ||
        args.length)
    )
      throw new Error(
        'Survival execution does not match the recorded experiment.',
      );
    if (
      operation === 'resume' &&
      (args.length !== 1 || args[0] !== c.experiment.id)
    )
      throw new Error(
        'Capture recovery must use the already allocated experiment ID.',
      );
  }
  return c;
}
