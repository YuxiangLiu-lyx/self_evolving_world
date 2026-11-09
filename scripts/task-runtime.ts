import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { currentDeliveryPolicy, git } from './delivery-git.js';
import { checkArchivePreservation, taskRoute } from './harness.js';
import { experimentIds, readExperiment } from './experiments.js';
import { DEFAULT_SEED } from '../apps/simulator/src/random-run.js';
import { DEFAULT_ROUNDS } from '../apps/simulator/src/synchronous-run.js';
import {
  analysisMaterial,
  analysisPaths,
  checkAnalysis,
  parseAnalysis,
  writeAnalysis,
} from './experiment-review.js';
import {
  completionErrors,
  hashFile,
  object,
  readJson,
  sourceFingerprint,
} from './validation.js';
import {
  digest,
  text,
  type TaskContext,
  type Snapshot,
} from './task-context.js';
import type { TaskEffects } from './task-flow.js';

export type CommandRunner = (
  args: string[],
  options: { cwd: string; stdio: ['ignore', number, number] },
) => { status: number | null; error?: Error };

/** Node boundary: all acceptance and external checks remain in the original commands. */
export class LocalTaskEffects implements TaskEffects {
  constructor(
    readonly root: string,
    private readonly save: () => void,
    private readonly execute: CommandRunner = (args, options) =>
      spawnSync('pnpm', args, options),
  ) {}
  private command(context: TaskContext, args: string[]): string {
    const path = `validation-results/tasks/${context.intent.id}-${String(context.history.length)}-${context.step}.log`;
    context.history.push({
      step: context.step,
      detail: `Started pnpm ${args.join(' ')}; log: ${path}`,
    });
    this.save();
    const fd = openSync(resolve(this.root, path), 'w');
    try {
      const result = this.execute(args, {
        cwd: this.root,
        stdio: ['ignore', fd, fd],
      });
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw new Error(
          `pnpm ${args.join(' ')} failed (${String(result.status)}). Inspect ${path}; fix the recorded failure and continue. No check was waived.`,
        );
    } finally {
      closeSync(fd);
    }
    context.history.push({
      step: context.step,
      detail: `Passed; log: ${path}`,
    });
    this.save();
    return path;
  }
  private output(name: string): Record<string, unknown> {
    return object(readJson(resolve(this.root, 'validation-results', name)));
  }
  private inputFile(path: string): string {
    const local = relative(
      resolve(this.root, 'validation-results'),
      resolve(this.root, path),
    );
    if (isAbsolute(local) || local === '..' || local.startsWith('../'))
      throw new Error(
        'Submit generated response/review/PR files inside validation-results.',
      );
    return resolve(this.root, path);
  }
  snapshot(c: TaskContext): Snapshot {
    const base =
      typeof c.publication?.base === 'string'
        ? c.publication.base
        : 'origin/main';
    const branch = git(this.root, 'branch', '--show-current');
    if (c.derived && c.derived.branch !== branch)
      throw new Error(
        'Task branch changed; restore the task checkout before continuing.',
      );
    checkArchivePreservation(this.root, base);
    return {
      branch,
      head: git(this.root, 'rev-parse', 'HEAD'),
      base: git(this.root, 'rev-parse', base),
      sourceHash: sourceFingerprint(this.root),
      planHash: hashFile(resolve(this.root, c.intent.plan)),
      route: taskRoute(this.root, base),
      policy: currentDeliveryPolicy(
        this.root,
        c.intent.plan,
        c.intent.task,
        base,
      ).mode,
    };
  }
  async experiment(c: TaskContext, save: () => void): Promise<void> {
    const intent = c.intent.experiment;
    if (intent.mode === 'none') return;
    if (intent.allocation === 'reuse') {
      const id = text(intent.id, 'reuse ID');
      const plan = readFileSync(resolve(this.root, c.intent.plan), 'utf8');
      if (!new RegExp(`^- Experiment reuse: ${id} — .{20,}$`, 'm').test(plan))
        throw new Error(
          'Explicit reuse must also be recorded in the current plan.',
        );
      c.experiment ??= {
        before: experimentIds(this.root),
        phase: 'started',
        id,
        error: 'Explicit capture reuse requested.',
      };
    }
    // A known exited failure before allocation may retry on an explicit continuation.
    // An uncertain interruption must first reconcile any allocated record.
    if (
      c.experiment?.error &&
      !c.experiment.id &&
      experimentIds(this.root).every((id) => c.experiment?.before.includes(id))
    ) {
      c.history.push({ step: 'experiment', detail: c.experiment.error });
      delete c.experiment;
    }
    if (!c.experiment) {
      c.experiment = { before: experimentIds(this.root), phase: 'started' };
      save();
      try {
        this.command(
          c,
          intent.mode === 'random'
            ? [
                'experiment:run',
                '--',
                String(intent.seed ?? DEFAULT_SEED),
                String(intent.rounds ?? DEFAULT_ROUNDS),
              ]
            : ['experiment:survival'],
        );
      } catch (error) {
        c.experiment.error =
          error instanceof Error ? error.message : String(error);
        save();
        const added = experimentIds(this.root).filter(
          (id) => !c.experiment?.before.includes(id),
        );
        if (added.length === 1)
          c.experiment.id = text(added[0], 'allocated experiment');
        save();
        throw error;
      }
    }
    const journal = c.experiment;
    if (!journal.id) {
      const added = experimentIds(this.root).filter(
        (id) => !journal.before.includes(id),
      );
      if (added.length !== 1)
        throw new Error(
          'Interrupted experiment allocation is unresolved. Inspect the journal and processes; do not allocate again. Complete the existing command or repair its saved record, then continue.',
        );
      journal.id = text(added[0], 'allocated experiment');
      save();
    }
    const id = text(journal.id, 'allocated experiment');
    const record = readExperiment(this.root, id, true);
    if (
      (intent.mode === 'random' &&
        (record.manifest.version !== 2 ||
          record.manifest.seed !== (intent.seed ?? DEFAULT_SEED) ||
          record.manifest.steps !== (intent.rounds ?? DEFAULT_ROUNDS))) ||
      (intent.mode === 'survival' && record.manifest.version !== 3)
    )
      throw new Error(
        'Allocated experiment disagrees with the recorded protocol/parameters.',
      );
    if (record.manifest.status !== 'completed') {
      if (!journal.error)
        throw new Error(
          `Interrupted ${id} has incomplete evidence. Confirm the old process stopped and use pnpm experiment:resume -- ${id} for saved-data capture only, then continue; inference must not repeat.`,
        );
      this.command(c, ['experiment:resume', '--', id]);
    }
    readExperiment(this.root, id);
    journal.phase = 'recorded';
    save();
    await Promise.resolve();
  }
  analysisReady(id: string, c: TaskContext): boolean {
    try {
      checkAnalysis(this.root, id, c.intent.id);
      return true;
    } catch {
      return false;
    }
  }
  analysisMaterials(id: string, c: TaskContext): unknown {
    return {
      ...analysisMaterial(this.root, id),
      taskId: c.intent.id,
      destination: analysisPaths(id, c.intent.id),
      schema: 'scripts/experiment-review.ts#ExperimentAnalysis',
      guidance:
        'Separate observed facts from causal hypotheses. Inspect prompts, per-actor private inputs, outputs, actions, failures and objective incentives. Recommendations are not implementation instructions.',
    };
  }
  submitAnalysis(file: string, id: string, c: TaskContext): void {
    const analysis = parseAnalysis(this.root, readJson(this.inputFile(file)));
    if (analysis.taskId !== c.intent.id || analysis.experiment !== id)
      throw new Error('Analysis belongs to another handoff.');
    const destination = analysisPaths(id, c.intent.id);
    for (const path of Object.values(destination)) {
      const tracked = spawnSync(
        'git',
        ['cat-file', '-e', `${c.derived?.base ?? 'origin/main'}:${path}`],
        { cwd: this.root, stdio: 'ignore' },
      );
      if (tracked.status === 0)
        throw new Error(
          'Preserve published companion analyses; use a new task ID for a new analysis.',
        );
    }
    writeAnalysis(this.root, analysis);
  }
  validationState(c: TaskContext): 'missing' | 'stale' | 'review' | 'passed' {
    if (!c.validation) return 'missing';
    try {
      const report = this.output('report.json');
      if (
        report.task !== c.intent.task ||
        report.runId !== c.validation.runId ||
        report.sourceHash !== c.validation.sourceHash ||
        report.sourceHash !== sourceFingerprint(this.root)
      )
        return 'stale';
      if (report.status !== 'awaiting-review' && report.status !== 'passed')
        return 'missing';
      if (!Array.isArray(report.evidence)) return 'stale';
      for (const entry of report.evidence) {
        const e = object(entry);
        if (
          hashFile(resolve(this.root, text(e.path, 'screenshot'))) !== e.sha256
        )
          return 'stale';
      }
      const errors = completionErrors(
        this.root,
        c.intent.task,
        report,
        this.output('review.json'),
      );
      return report.status === 'passed' && errors.length === 0
        ? 'passed'
        : 'review';
    } catch {
      return 'stale';
    }
  }
  validate(c: TaskContext): NonNullable<TaskContext['validation']> {
    const log = this.command(c, ['validate', '--', c.intent.task]);
    const report = this.output('report.json');
    if (
      report.status !== 'awaiting-review' ||
      report.task !== c.intent.task ||
      report.sourceHash !== sourceFingerprint(this.root)
    )
      throw new Error('Validation produced an unexpected task/version.');
    return {
      runId: text(report.runId, 'run ID'),
      sourceHash: text(report.sourceHash, 'source fingerprint'),
      intentHash: digest(c.intent),
      log,
    };
  }
  reviewMaterials(c: TaskContext): unknown {
    const snapshot = this.snapshot(c);
    const diff = `validation-results/tasks/${c.intent.id}-diff.patch`;
    writeFileSync(
      resolve(this.root, diff),
      git(this.root, 'diff', `${snapshot.base}...HEAD`) +
        '\n' +
        git(this.root, 'diff', 'HEAD'),
    );
    return {
      plan: c.intent.plan,
      diff,
      files: snapshot.route.files,
      note: 'The diff excludes untracked contents; open every listed file as well as the patch. Preserve unrelated work before approving the exact commit file list.',
      report: this.output('report.json'),
      reviewFile: 'validation-results/review.json',
      behaviorLog: c.validation?.log,
      browserReport: 'playwright-report/index.html',
    };
  }
  review(file: string, c: TaskContext): void {
    const review = readJson(this.inputFile(file));
    const errors = completionErrors(
      this.root,
      c.intent.task,
      this.output('report.json'),
      review,
    );
    if (errors.length) throw new Error(errors.join('\n'));
    writeFileSync(
      resolve(this.root, 'validation-results/review.json'),
      JSON.stringify(review, null, 2) + '\n',
    );
    this.command(c, ['task:review', '--', c.intent.task]);
  }
  commit(message: string, files: readonly string[], c: TaskContext): void {
    if (this.validationState(c) !== 'passed')
      throw new Error('Commit requires current accepted evidence.');
    if (git(this.root, 'status', '--porcelain') === '') return;
    const staged = git(this.root, 'diff', '--cached', '--name-only')
      .split('\n')
      .filter(Boolean);
    if (staged.some((file) => !files.includes(file)))
      throw new Error(
        'Unreviewed staged changes would be included in the commit.',
      );
    const changed = taskRoute(this.root, c.derived?.base).files;
    if (
      JSON.stringify([...files].sort()) !== JSON.stringify([...changed].sort())
    )
      throw new Error('Changed files differ from the actual reviewed list.');
    const working = [
      ...new Set(
        [
          ...git(this.root, 'diff', '--name-only', 'HEAD').split('\n'),
          ...git(this.root, 'ls-files', '--others', '--exclude-standard').split(
            '\n',
          ),
        ].filter(Boolean),
      ),
    ];
    if (working.length) git(this.root, 'add', '--', ...working);
    if (sourceFingerprint(this.root) !== c.review?.sourceHash)
      throw new Error('Source changed before commit.');
    git(this.root, 'commit', '-m', message);
  }
  preflight(c: TaskContext): void {
    if (
      !c.body ||
      c.body.head !== git(this.root, 'rev-parse', 'HEAD') ||
      c.body.runId !== c.validation?.runId
    )
      throw new Error('PR body is not bound to this reviewed version.');
    this.inputFile(c.body.path);
    this.command(c, [
      'pr:check',
      '--',
      c.body.path,
      typeof c.publication?.base === 'string'
        ? c.publication.base
        : 'origin/main',
    ]);
  }
  publish(c: TaskContext): Record<string, unknown> {
    if (!c.body || c.intent.delivery.mode === 'local-only')
      throw new Error('Publication is not permitted for this task.');
    // prepare-only never sends a merge request, regardless of recorded permission.
    this.command(c, [
      'task:publish',
      '--',
      c.body.path,
      c.body.title,
      '--prepare-only',
    ]);
    return this.output('publication.json');
  }
  finish(c: TaskContext): Record<string, unknown> {
    if (this.validationState(c) !== 'passed')
      throw new Error('Final completion requires current accepted evidence.');
    if (c.intent.delivery.mode === 'local-only')
      this.command(c, [
        'task:finish',
        '--',
        c.intent.task,
        '--plan',
        c.intent.plan,
      ]);
    else {
      if (
        !c.body ||
        (c.intent.delivery.mode === 'merge' &&
          c.intent.merge.status !== 'granted')
      )
        throw new Error('No actual merge authorization was recorded.');
      this.command(c, [
        'task:publish',
        '--',
        c.body.path,
        c.body.title,
        '--verify-only',
      ]);
    }
    const completion = this.output('completion.json');
    if (
      completion.task !== c.intent.task ||
      completion.runId !== c.validation?.runId ||
      completion.sourceHash !== sourceFingerprint(this.root)
    )
      throw new Error('Independent completion belongs to different evidence.');
    return completion;
  }
}
