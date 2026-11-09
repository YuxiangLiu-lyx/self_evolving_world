import { describe, expect, it } from 'vitest';
import { classifyChanges } from './harness.js';
import {
  digest,
  newContext,
  parseIntent,
  type TaskIntent,
} from './task-context.js';
import { TaskFlow, type TaskEffects } from './task-flow.js';

const basis = {
  source: 'task-instruction' as const,
  reference: 'Current fixture request, this task only',
  quote: 'The user explicitly requests this delivery choice for this fixture.',
};
function intent(
  mode: 'merge' | 'local-only' | 'pr-only' = 'merge',
  grant = false,
): TaskIntent {
  return parseIntent({
    id: 'fixture-task',
    task: 'Fixture task',
    request:
      'Exercise the actual orchestration boundary without external writes.',
    plan: 'docs/exec-plans/active/pr-99-fixture.md',
    requirementsVersion: 1,
    requestedType: 'code',
    experiment: { mode: 'none' },
    analyze: [],
    delivery: { mode, basis },
    merge:
      mode === 'merge'
        ? grant
          ? { status: 'granted', basis }
          : { status: 'missing' }
        : { status: 'forbidden', basis },
  });
}
function fixture(input = intent(), paths = ['source.ts']) {
  const c = newContext(input),
    calls: string[] = [],
    route = classifyChanges(paths);
  const state = {
    source: 'source-1',
    head: 'head-1',
    validated: '',
    accepted: false,
    failValidation: false,
    failReview: false,
    failCI: false,
    merged: false,
    complete: true,
    runs: 0,
    prs: 0,
    commits: 0,
    allocations: 0,
    analysis: new Set<string>(),
    remoteReview: true,
    reviewHash: 'review-1',
  };
  const effects: TaskEffects = {
    snapshot: () => ({
      branch: 'feat/fixture',
      head: state.head,
      base: 'base',
      sourceHash: state.source,
      planHash: 'plan',
      route,
      policy: c.intent.delivery.mode,
    }),
    experiment: async (context, save) => {
      if (context.intent.experiment.mode !== 'none' && !context.experiment) {
        calls.push('allocate');
        state.allocations++;
        context.experiment = { before: [], phase: 'recorded', id: 'ex4' };
        save();
      }
      await Promise.resolve();
    },
    analysisReady: (id) => state.analysis.has(id),
    analysisMaterials: (id) => ({ experiment: id }),
    submitAnalysis: (_file, id) => {
      calls.push(`analyze:${id}`);
      state.analysis.add(id);
    },
    validationState: () =>
      !state.validated
        ? 'missing'
        : state.validated !== state.source
          ? 'stale'
          : state.accepted
            ? 'passed'
            : 'review',
    validate: (context) => {
      expect(context.status).toBe('running');
      calls.push('full-check');
      state.runs++;
      if (state.failValidation) throw new Error('Full test suite failed');
      state.validated = state.source;
      state.accepted = false;
      return {
        runId: `run-${String(state.runs)}`,
        sourceHash: state.source,
        intentHash: digest(context.intent),
        log: 'fixture-log',
      };
    },
    reviewMaterials: () => ({ files: route.files }),
    review: () => {
      calls.push('review-gate');
      if (state.failReview)
        throw new Error('Screenshot or requirement review not passed');
      state.accepted = true;
    },
    reviewEvidenceHash: () => state.reviewHash,
    remoteReview: () =>
      Promise.resolve(
        state.remoteReview
          ? {
              id: 12,
              url: 'https://github.com/fixture/review',
              author: 'Fixture',
              head: state.head,
              runId: c.validation?.runId ?? '',
              bodyHash: state.reviewHash,
              kind: 'current-conversation-self-review' as const,
              independent: false as const,
            }
          : undefined,
      ),
    remoteReviewMaterials: () => ({
      action: 'COMMENT',
      commit_id: state.head,
      independent: false,
    }),
    commit: () => {
      if (!state.accepted) throw new Error('Unreviewed commit');
      if (!state.commits) {
        calls.push('commit');
        state.commits++;
        state.head = 'reviewed-head';
      }
    },
    preflight: () => {
      calls.push('pr-check');
    },
    publish: () => {
      calls.push('publish-prepare');
      if (!state.prs) state.prs++;
      if (state.failCI) throw new Error('Current quality failed');
      return {
        status: state.merged ? 'merged' : 'ready',
        number: 23,
        head: state.head,
        checks: ['quality', 'pr-policy'],
      };
    },
    finish: (context) => {
      calls.push('independent-finish');
      if (context.intent.delivery.mode === 'merge' && !state.merged)
        throw new Error('Remote PR is not merged');
      return {
        status: state.complete
          ? context.intent.delivery.mode === 'merge'
            ? 'completed'
            : 'completed-with-exception'
          : 'failed',
      };
    },
  };
  const flow = () =>
    new TaskFlow(c, effects, () => {
      /* In-memory persistence models command restarts. */
    });
  const submit = (payload: Record<string, unknown>) =>
    flow().submit({
      requestId: c.request?.id,
      requirementsVersion: c.intent.requirementsVersion,
      sourceHash: c.request?.sourceHash,
      ...payload,
    });
  const prepare = async () => {
    await flow().next();
    return submit({
      kind: 'prepared',
      notes: 'Implementation and current plan are ready for the real gates.',
    });
  };
  const review = () =>
    submit({
      kind: 'review',
      file: 'review.json',
      files: route.files,
      commitMessage: 'Implement reviewed fixture',
    });
  const body = () =>
    submit({ kind: 'pr-body', file: 'body.md', title: 'Reviewed fixture' });
  return { c, calls, state, effects, flow, submit, prepare, review, body };
}

describe('programmatic task boundaries', () => {
  it.each([
    ['code', ['source.ts']],
    ['documentation', ['README.md']],
    ['experiment', ['experiment/ex4/report.md']],
    ['mixed', ['source.ts', 'experiment/ex4/report.md']],
  ] as const)(
    'preserves full checks and default publication for %s work',
    async (requestedType, paths) => {
      const f = fixture({ ...intent(), requestedType }, [...paths]);
      await f.prepare();
      if (f.c.step === 'analysis')
        await f.submit({ kind: 'analysis', file: 'analysis.json' });
      expect(f.calls).toContain('full-check');
      expect(f.state.allocations).toBe(0);
      await f.review();
      await f.body();
      expect(f.calls).toEqual([
        ...(['experiment', 'mixed'].includes(requestedType)
          ? ['analyze:ex4']
          : []),
        'full-check',
        'review-gate',
        'commit',
        'pr-check',
        'pr-check',
        'publish-prepare',
      ]);
      expect(f.c.status).toBe('needs_authorization');
      expect(f.state.prs).toBe(1);
      expect(f.calls).not.toContain('independent-finish');
    },
  );
  it('verifies existing remote delivery without publishing, committing, allocating or inventing authority', async () => {
    const f = fixture(intent('merge', true));
    await f.flow().verify();
    expect(f.c.status).toBe('blocked');
    expect(f.calls).toEqual([]);
    await f.prepare();
    await f.review();
    await f.body();
    const count = f.calls.length;
    await f.flow().verify();
    expect(f.c.status).toBe('blocked');
    expect(f.calls.slice(count)).toEqual(['independent-finish']);
    f.state.merged = true;
    await f.flow().verify();
    expect(f.c.status).toBe('completed');
    expect(f.state.prs).toBe(1);
    f.c.intent = { ...f.c.intent, merge: { status: 'missing' } };
    if (f.c.validation) f.c.validation.intentHash = digest(f.c.intent);
    await f.flow().verify();
    expect(f.c.reason).toContain('missing merge authorization');
  });
  it('requires remote self-review facts before merge and does not trust a submitted result', async () => {
    const f = fixture(intent('merge', true));
    f.state.remoteReview = false;
    await f.prepare();
    await f.review();
    await f.body();
    expect(f.c.step).toBe('remote-review');
    expect(f.c.request?.materials).toEqual({
      action: 'COMMENT',
      commit_id: 'reviewed-head',
      independent: false,
    });
    await f.submit({ kind: 'remote-review-result', result: { id: 12 } });
    expect(f.c.status).toBe('blocked');
    expect(f.calls).not.toContain('independent-finish');
    await f.flow().next();
    f.state.remoteReview = true;
    await f.submit({ kind: 'remote-review-result', result: { id: 12 } });
    expect(f.c.step).toBe('merge');
    expect(f.state.prs).toBe(1);
    f.state.reviewHash = 'altered-review';
    await f.flow().next();
    expect(f.c.step).toBe('review');
    expect(f.calls).not.toContain('independent-finish');
  });
  it('requires the remote record for PR-only delivery while preserving no-merge behavior', async () => {
    const f = fixture(intent('pr-only'));
    f.state.remoteReview = false;
    await f.prepare();
    await f.review();
    await f.body();
    expect(f.c.step).toBe('remote-review');
    expect(f.c.status).not.toBe('completed');
    f.state.remoteReview = true;
    await f.flow().next();
    expect(f.c.status).toBe('completed');
    expect(f.state.prs).toBe(1);
    expect(f.state.merged).toBe(false);
  });
  it('keeps local-only dirty-worktree completion free of commits and remote actions', async () => {
    const f = fixture(intent('local-only'));
    await f.prepare();
    await f.review();
    expect(f.calls).toEqual([
      'full-check',
      'review-gate',
      'independent-finish',
    ]);
    expect(f.c.status).toBe('completed');
  });
  it('finishes PR-only after current CI without creating a merge handoff', async () => {
    const f = fixture(intent('pr-only'));
    await f.prepare();
    await f.review();
    await f.body();
    expect(f.c.status).toBe('completed');
    expect(f.c.request).toBeUndefined();
    expect(f.state.merged).toBe(false);
  });
  it('uses an existing scoped grant without asking again and independently rejects an unconfirmed merge result', async () => {
    const f = fixture(intent('merge', true));
    await f.prepare();
    await f.review();
    await f.body();
    expect(f.c.request?.materials).toMatchObject({
      operation: 'github.merge_pull_request',
      repository_full_name: 'YuxiangLiu-lyx/self_evolving_world',
      pr_number: 23,
      expected_head_sha: 'reviewed-head',
      merge_method: 'merge',
      authority: { status: 'granted', basis },
    });
    await f.submit({ kind: 'merge-result', result: { merged: true } });
    expect(f.c.status).toBe('blocked');
    expect(f.c.reason).toContain('not merged');
    await f.flow().next();
    f.state.merged = true;
    await f.submit({ kind: 'merge-result', result: { merged: true } });
    expect(f.c.status).toBe('completed');
    expect(f.state.prs).toBe(1);
  });
  it('does not accept merge results or invented bypass parameters without authorization', async () => {
    const f = fixture();
    await f.prepare();
    await f.review();
    await f.body();
    await f.submit({ kind: 'merge-result', result: { merged: true } });
    expect(f.calls).not.toContain('independent-finish');
    expect(f.c.status).not.toBe('completed');
    expect(() => parseIntent({ ...intent(), skipReview: true })).toThrow(
      'cannot be disabled',
    );
    expect(() =>
      parseIntent({
        ...intent('pr-only'),
        merge: { status: 'granted', basis },
      }),
    ).toThrow('forbid merge');
  });
  it('records an actual later grant and keeps validation evidence instead of fabricating an approval', async () => {
    const f = fixture();
    await f.prepare();
    await f.review();
    await f.body();
    await f.submit({
      kind: 'authorization',
      authority: { status: 'granted', basis },
    });
    expect(f.c.intent.merge.status).toBe('granted');
    expect(f.c.originalIntent.merge.status).toBe('missing');
    expect(f.c.request?.materials).toMatchObject({
      expected_head_sha: 'reviewed-head',
    });
    expect(f.state.runs).toBe(1);
  });
  it('stops on failed tests, failed review, incomplete file review and incomplete completion evidence', async () => {
    const f = fixture(intent('local-only'));
    f.state.failValidation = true;
    await f.prepare();
    expect(f.calls).toEqual(['full-check']);
    expect(f.c.status).toBe('needs_fix');
    f.state.failValidation = false;
    await f.flow().next();
    await f.submit({
      kind: 'review',
      files: [],
      file: 'review.json',
      commitMessage: 'Incomplete',
    });
    expect(f.calls).not.toContain('review-gate');
    await f.flow().next();
    f.state.failReview = true;
    await f.review();
    expect(f.calls).not.toContain('independent-finish');
    await f.flow().next();
    f.state.failReview = false;
    f.state.complete = false;
    await f.review();
    expect(f.c.status).not.toBe('completed');
  });
  it('invalidates source and requirement changes and rejects stale response IDs', async () => {
    const f = fixture(intent('pr-only'));
    await f.prepare();
    const old = {
      requestId: f.c.request?.id,
      requirementsVersion: 1,
      sourceHash: f.c.request?.sourceHash,
      kind: 'review',
      files: ['source.ts'],
      file: 'review.json',
      commitMessage: 'Old',
    };
    f.state.source = 'source-2';
    await f.flow().submit(old);
    expect(f.calls).not.toContain('review-gate');
    await f.flow().next();
    expect(f.state.runs).toBe(2);
    await f.flow().submit(old);
    expect(f.calls).not.toContain('review-gate');
    f.c.intent = {
      ...f.c.intent,
      requirementsVersion: 2,
      request: 'A changed requirement needs fresh evidence.',
    };
    await f.flow().next();
    expect(f.state.runs).toBe(3);
  });
  it('resumes after CI failure with one allocation, one commit and one PR', async () => {
    const f = fixture({
      ...intent('pr-only'),
      experiment: { mode: 'random', allocation: 'new', basis },
    });
    await f.prepare();
    expect(f.state.allocations).toBe(1);
    await f.submit({ kind: 'analysis', file: 'analysis.json' });
    await f.review();
    f.state.failCI = true;
    await f.body();
    expect(f.c.status).toBe('blocked');
    expect(f.calls).not.toContain('independent-finish');
    f.state.failCI = false;
    await f.flow().next();
    expect([
      f.state.allocations,
      f.state.commits,
      f.state.prs,
      f.state.runs,
    ]).toEqual([1, 1, 1, 1]);
    expect(f.c.status).toBe('completed');
  });
});
