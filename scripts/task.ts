import {
  mkdirSync,
  openSync,
  closeSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { readTask } from './task-worker.js';
import { checkAnalyses } from './experiment-review.js';
import {
  digest,
  newContext,
  parseIntent,
  text,
  type TaskContext,
} from './task-context.js';
import { TaskFlow } from './task-flow.js';
import { LocalTaskEffects, requestCaptureRecovery } from './task-runtime.js';
import { readJson } from './validation.js';

const root = process.cwd(),
  directory = resolve(root, 'validation-results/tasks');
const args = process.argv.slice(2).filter((a) => a !== '--');
const [command, target, response] = args;
let unlock: (() => void) | undefined;
function statePath(id: string): string {
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(id))
    throw new Error('Invalid task ID.');
  return resolve(directory, `${id}.json`);
}
function lock(): () => void {
  const path = resolve(directory, 'execution.lock');
  if (existsSync(path)) {
    const pid = Number(readFileSync(path, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid < 1)
      throw new Error(
        'Invalid execution lock; inspect the interrupted process before recovery.',
      );
    try {
      process.kill(pid, 0);
      throw new Error(
        'Another task command is running; shared validation evidence is locked.',
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      rmSync(path);
    }
  }
  const fd = openSync(path, 'wx');
  writeFileSync(fd, String(process.pid));
  closeSync(fd);
  return () => {
    rmSync(path, { force: true });
  };
}
try {
  if (command === 'analyses' && args.length === 1) {
    checkAnalyses(root);
    console.log('Experiment companion analyses passed.');
  } else {
    if (
      !target ||
      ![
        'start',
        'next',
        'submit',
        'status',
        'amend',
        'verify',
        'recover',
      ].includes(command ?? '') ||
      args.length !==
        (['submit', 'amend', 'recover'].includes(command ?? '') ? 3 : 2)
    )
      throw new Error(
        'Usage: pnpm task -- start intent.json | next ID | submit ID response.json | status ID | amend ID intent.json | verify ID | recover ID exN',
      );
    mkdirSync(directory, { recursive: true });
    if (command !== 'status') unlock = lock();
    let context: TaskContext;
    if (command === 'start') {
      context = newContext(parseIntent(readJson(resolve(root, target))));
      writeFileSync(
        statePath(context.intent.id),
        JSON.stringify(context, null, 2) + '\n',
        { flag: 'wx' },
      );
    } else context = readTask(root, target);
    const save = (): void => {
      const path = statePath(context.intent.id),
        temporary = `${path}.tmp`;
      writeFileSync(temporary, JSON.stringify(context, null, 2) + '\n');
      renameSync(temporary, path);
    };
    const effects = new LocalTaskEffects(root, save);
    const flow = new TaskFlow(context, effects, save);
    if (command === 'recover') {
      requestCaptureRecovery(
        root,
        context,
        text(response, 'recovery experiment ID'),
      );
      save();
    }
    if (command === 'amend') {
      const intent = parseIntent(
        readJson(resolve(root, text(response, 'amended intent file'))),
      );
      if (
        intent.id !== context.intent.id ||
        intent.requirementsVersion <= context.intent.requirementsVersion
      )
        throw new Error(
          'Amendments need the same task ID and a newer requirements version.',
        );
      if (
        context.experiment &&
        digest(intent.experiment) !== digest(context.intent.experiment)
      )
        throw new Error(
          'An already started experiment cannot be replaced or reallocated by amendment.',
        );
      context.amendments.push(context.intent);
      context.intent = intent;
      delete context.request;
      delete context.completion;
      save();
    }
    if (command === 'status') {
      const current = effects.snapshot(context);
      const stale =
        current.sourceHash !== context.derived?.sourceHash ||
        (context.validation !== undefined &&
          (context.validation.intentHash !== digest(context.intent) ||
            ['missing', 'stale'].includes(effects.validationState(context))));
      console.log(
        JSON.stringify(
          {
            ...context,
            ...(stale
              ? {
                  status: 'needs_fix',
                  reason:
                    'Source or intent differs from the last evidence; run next. Stored remote facts are observations, not a new remote check.',
                }
              : {}),
            current,
            continue: `pnpm task -- next ${context.intent.id}`,
          },
          null,
          2,
        ),
      );
    } else {
      context =
        command === 'submit'
          ? await flow.submit(
              readJson(resolve(root, text(response, 'response file'))),
            )
          : command === 'verify'
            ? await flow.verify()
            : await flow.next();
      console.log(
        JSON.stringify(
          { ...context, continue: `pnpm task -- next ${context.intent.id}` },
          null,
          2,
        ),
      );
      if (context.status === 'needs_fix' || context.status === 'blocked')
        process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'blocked',
      error: error instanceof Error ? error.message : String(error),
      command,
      target,
    }),
  );
  process.exitCode = 1;
} finally {
  unlock?.();
}
