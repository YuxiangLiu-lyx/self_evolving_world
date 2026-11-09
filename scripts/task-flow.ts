import { randomUUID } from 'node:crypto';
import {
  authority,
  digest,
  text,
  type Snapshot,
  type Step,
  type TaskContext,
} from './task-context.js';
import { object } from './validation.js';

/** Effects are existing gates/commands, not a second implementation of their policy. */
export interface TaskEffects {
  snapshot(context: TaskContext): Snapshot;
  experiment(context: TaskContext, save: () => void): Promise<void>;
  analysisReady(id: string, context: TaskContext): boolean;
  analysisMaterials(id: string, context: TaskContext): unknown;
  submitAnalysis(file: string, id: string, context: TaskContext): void;
  validationState(
    context: TaskContext,
  ): 'missing' | 'stale' | 'review' | 'passed';
  validate(context: TaskContext): NonNullable<TaskContext['validation']>;
  reviewMaterials(context: TaskContext): unknown;
  review(file: string, context: TaskContext): void;
  commit(message: string, files: readonly string[], context: TaskContext): void;
  preflight(context: TaskContext): void;
  publish(context: TaskContext): Record<string, unknown>;
  finish(context: TaskContext): Record<string, unknown>;
}
export class TaskFlow {
  constructor(
    readonly context: TaskContext,
    private readonly effects: TaskEffects,
    private readonly save: () => void,
  ) {}

  private snapshot(): Snapshot {
    const c = this.context,
      snapshot = this.effects.snapshot(c);
    if (snapshot.policy !== c.intent.delivery.mode)
      throw new Error(
        'Task intent disagrees with the current plan delivery policy.',
      );
    c.derived = {
      ...snapshot,
      commitRequired: snapshot.policy !== 'local-only',
      publishRequired: snapshot.policy !== 'local-only',
      mergeRequested: snapshot.policy === 'merge',
    };
    return snapshot;
  }
  private step(step: Step): void {
    this.context.step = step;
    this.context.status = 'running';
    this.context.reason = `Executing ${step}; completion has not been established.`;
    delete this.context.request;
    this.save();
  }
  private handoff(
    step: Step,
    question: string,
    materials: unknown,
  ): TaskContext {
    const c = this.context,
      snapshot = this.snapshot();
    c.step = step;
    c.status =
      step === 'merge' && c.intent.merge.status !== 'granted'
        ? 'needs_authorization'
        : 'needs_review';
    c.reason = question;
    c.request = {
      id: randomUUID(),
      taskId: c.intent.id,
      step,
      requirementsVersion: c.intent.requirementsVersion,
      sourceHash: snapshot.sourceHash,
      intentHash: digest(c.intent),
      materials,
      question,
      resume: `pnpm task -- submit ${c.intent.id} validation-results/response.json`,
    };
    this.save();
    return c;
  }
  private failed(error: unknown): TaskContext {
    const c = this.context;
    c.status = ['publish', 'merge', 'finish'].includes(c.step)
      ? 'blocked'
      : 'needs_fix';
    c.reason = error instanceof Error ? error.message : String(error);
    delete c.request;
    c.history.push({ step: c.step, detail: c.reason });
    this.save();
    return c;
  }
  /** Runs all presently decidable steps, and exits at a conversation boundary. */
  async next(): Promise<TaskContext> {
    const c = this.context;
    try {
      this.snapshot();
      if (!c.prepared)
        return this.handoff(
          'prepare',
          'Implement the requested scope, synchronize the English plan and documents, preserve unrelated changes, then submit prepared. This does not approve validation.',
          {
            request: c.intent.request,
            plan: c.intent.plan,
            requestedType: c.intent.requestedType,
            actual: c.derived?.route,
            authorization: c.intent.merge,
          },
        );
      this.step('experiment');
      await this.effects.experiment(c, this.save);
      const snapshot = this.snapshot();
      const targets = [
        ...new Set([
          ...c.intent.analyze,
          ...snapshot.route.experiments,
          ...(c.experiment?.id ? [c.experiment.id] : []),
        ]),
      ];
      for (const id of targets) {
        this.step('analysis');
        if (!this.effects.analysisReady(id, c))
          return this.handoff(
            'analysis',
            `Analyze ${id} using actual inputs, outputs and trajectories. Cover every actor, anomalies, isolation, individuality, causes, uncertainty and improvements. Store recommendations only; do not implement them.`,
            this.effects.analysisMaterials(id, c),
          );
      }
      this.step('validate');
      let validation = this.effects.validationState(c);
      if (
        validation === 'missing' ||
        validation === 'stale' ||
        c.validation?.intentHash !== digest(c.intent)
      ) {
        delete c.review;
        delete c.body;
        delete c.completion;
        c.validation = this.effects.validate(c);
        this.save();
        validation = this.effects.validationState(c);
      }
      if (validation !== 'review' && validation !== 'passed')
        throw new Error(
          'Full validation did not produce current reviewable evidence.',
        );
      if (
        validation !== 'passed' ||
        !c.review ||
        c.review.runId !== c.validation.runId ||
        c.review.sourceHash !== this.snapshot().sourceHash
      )
        return this.handoff(
          'review',
          'Inspect every current screenshot, behavior result and every changed file against the numbered requirements. Submit the actual review, exact reviewed file list and commit message. Structural checks cannot prove honest judgment.',
          this.effects.reviewMaterials(c),
        );
      if (c.intent.delivery.mode === 'local-only') {
        this.step('finish');
        c.completion = this.effects.finish(c);
      } else {
        this.step('commit');
        this.effects.commit(c.review.commitMessage, c.review.files, c);
        const current = this.snapshot();
        if (
          !c.body ||
          c.body.head !== current.head ||
          c.body.runId !== c.validation.runId
        )
          return this.handoff(
            'pr-body',
            'Prepare the existing PR template: exact plan requirements, every changed path, current reviewed head and actual validation evidence. Do not infer remote success from local checks.',
            {
              plan: c.intent.plan,
              head: current.head,
              files: current.route.files,
              runId: c.validation.runId,
              task: c.intent.task,
              template: '.github/pull_request_template.md',
            },
          );
        this.step('publish');
        this.effects.preflight(c);
        c.publication = this.effects.publish(c);
        this.save();
        if (c.intent.delivery.mode === 'merge') {
          this.step('merge');
          if (c.intent.merge.status !== 'granted')
            return this.handoff(
              'merge',
              'Publication and CI do not authorize merge. Supply the actual user instruction and its scope, or leave this task blocked before merge.',
              { publication: c.publication, authority: c.intent.merge },
            );
          if (c.publication.status !== 'merged')
            return this.handoff(
              'merge',
              'Use the existing GitHub connector to merge only this reviewed head with merge_method=merge. Submit the tool result; the program independently verifies the remote PR and main ancestry.',
              {
                operation: 'github.merge_pull_request',
                repository_full_name: 'YuxiangLiu-lyx/self_evolving_world',
                pr_number: c.publication.number,
                expected_head_sha: current.head,
                merge_method: 'merge',
                authority: c.intent.merge,
                publication: c.publication,
              },
            );
        }
        this.step('finish');
        c.completion = this.effects.finish(c);
      }
      if (
        c.completion.status !== 'completed' &&
        c.completion.status !== 'completed-with-exception'
      )
        throw new Error('Independent task completion did not pass.');
      c.status = 'completed';
      c.reason = c.completion.status;
      delete c.request;
      this.save();
      return c;
    } catch (error) {
      return this.failed(error);
    }
  }
  async submit(value: unknown): Promise<TaskContext> {
    const c = this.context;
    try {
      const response = object(value),
        request = c.request;
      if (
        !request ||
        response.requestId !== request.id ||
        response.requirementsVersion !== c.intent.requirementsVersion ||
        response.sourceHash !== request.sourceHash ||
        request.intentHash !== digest(c.intent)
      )
        throw new Error(
          'Stale or unrelated handoff response. Run next and use its current request.',
        );
      if (
        request.step !== 'prepare' &&
        this.snapshot().sourceHash !== request.sourceHash
      )
        throw new Error(
          'Source changed after the handoff. Run next for fresh evidence.',
        );
      const kind = response.kind;
      if (request.step === 'prepare' && kind === 'prepared') {
        c.history.push({
          step: 'prepare',
          detail: text(response.notes, 'preparation notes'),
        });
        c.prepared = true;
      } else if (request.step === 'analysis' && kind === 'analysis') {
        const material = object(request.materials);
        this.effects.submitAnalysis(
          text(response.file, 'analysis file'),
          text(material.experiment, 'analysis experiment'),
          c,
        );
      } else if (request.step === 'review' && kind === 'review') {
        const files: unknown = response.files;
        const actual = this.snapshot().route.files;
        if (
          !Array.isArray(files) ||
          JSON.stringify(
            files.map((value: unknown) => text(value, 'reviewed path')).sort(),
          ) !== JSON.stringify([...actual].sort())
        )
          throw new Error(
            'Review must identify the complete actual changed-file list.',
          );
        const message = text(response.commitMessage, 'reviewed commit message');
        this.effects.review(text(response.file, 'review file'), c);
        if (this.effects.validationState(c) !== 'passed' || !c.validation)
          throw new Error('Actual review gate has not accepted the evidence.');
        c.review = {
          runId: c.validation.runId,
          sourceHash: this.snapshot().sourceHash,
          files: [...actual],
          commitMessage: message,
        };
      } else if (request.step === 'pr-body' && kind === 'pr-body') {
        if (!c.validation) throw new Error('Missing current validation.');
        c.body = {
          path: text(response.file, 'PR body'),
          title: text(response.title, 'PR title'),
          head: this.snapshot().head,
          runId: c.validation.runId,
        };
        this.effects.preflight(c);
      } else if (
        request.step === 'merge' &&
        kind === 'authorization' &&
        c.intent.delivery.mode === 'merge' &&
        c.intent.merge.status === 'missing'
      ) {
        const grant = authority(response.authority);
        if (grant.status !== 'granted')
          throw new Error(
            'A real scoped merge grant is required; no authorization was inferred.',
          );
        c.history.push({ step: 'merge', detail: JSON.stringify(grant) });
        // Permission evidence changes no source or requirements. Keep the prior intent in the audit history.
        c.amendments.push(c.intent);
        c.intent = { ...c.intent, merge: grant };
        if (c.validation) c.validation.intentHash = digest(c.intent);
      } else if (
        request.step === 'merge' &&
        kind === 'merge-result' &&
        c.intent.merge.status === 'granted'
      ) {
        c.history.push({
          step: 'merge',
          detail: JSON.stringify(response.result),
        });
        this.step('finish');
        c.completion = this.effects.finish(c);
        if (c.completion.status !== 'completed')
          throw new Error(
            'The submitted merge result was not independently confirmed.',
          );
        c.status = 'completed';
        c.reason = 'completed';
        delete c.request;
        this.save();
        return c;
      } else
        throw new Error('This response cannot advance the requested step.');
      delete c.request;
      this.save();
      return await this.next();
    } catch (error) {
      return this.failed(error);
    }
  }
}
