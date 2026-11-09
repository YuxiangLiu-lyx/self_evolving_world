import { describe, expect, it, vi } from 'vitest';
import {
  deliveryPolicy,
  mergeReadiness,
  mergeReviewedPullRequest,
  mergedCommit,
  verifyDeliveryReceipt,
} from './delivery.js';
import { REPOSITORY, type GithubRequest } from './publication.js';

const head = 'a'.repeat(40),
  base = 'b'.repeat(40),
  merge = 'c'.repeat(40);
const expected = {
  number: 11,
  branch: 'feat/delivery',
  head,
  body: 'Reviewed body',
  base,
};
const since = '2026-11-08T12:00:00Z';
const pr = {
  number: 11,
  state: 'open',
  draft: false,
  body: expected.body,
  updated_at: since,
  html_url: `https://github.com/${REPOSITORY}/pull/11`,
  base: { ref: 'main', sha: base },
  head: { ref: expected.branch, sha: head, repo: { full_name: REPOSITORY } },
  mergeable: true,
  mergeable_state: 'clean',
};
const merged = {
  ...pr,
  state: 'closed',
  merged: true,
  merge_commit_sha: merge,
};
const checks = {
  total_count: 2,
  check_runs: ['quality', 'pr-policy'].map((name, id) => ({
    id,
    name,
    head_sha: head,
    app: { slug: 'github-actions' },
    started_at: since,
    status: 'completed',
    conclusion: 'success',
  })),
};
const plan = (mode: string, task = 'Fixture delivery task') =>
  `# Plan\n\n## Delivery\n\n- Task: ${task}\n- Mode: ${mode}\n- Reason: The user explicitly requested this delivery exception for the fixture task.\n\n## Other\n\nDetails.\n`;

describe('reviewed task delivery', () => {
  it('defaults to merge and binds explicit exceptions to the current task', () => {
    expect(deliveryPolicy('# Ordinary plan', 'task')).toEqual({
      mode: 'merge',
      reason: '',
    });
    for (const mode of ['merge', 'pr-only', 'local-only'])
      expect(deliveryPolicy(plan(mode), 'Fixture delivery task').mode).toBe(
        mode,
      );
    expect(() => deliveryPolicy(plan('local-only'), 'Different task')).toThrow(
      'different task',
    );
    expect(() =>
      deliveryPolicy(plan('skip-checks'), 'Fixture delivery task'),
    ).toThrow('Mode');
    expect(() =>
      deliveryPolicy(
        plan('pr-only').replace(/- Reason:.+/, '- Reason: short'),
        'Fixture delivery task',
      ),
    ).toThrow('substantive');
    expect(() =>
      deliveryPolicy(
        plan('pr-only') + plan('local-only'),
        'Fixture delivery task',
      ),
    ).toThrow('Duplicate');
  });
  it('distinguishes unknown mergeability from conflicts and blocked integration', () => {
    expect(mergeReadiness(pr, expected)).toBe('ready');
    expect(
      mergeReadiness(
        { ...pr, mergeable: null, mergeable_state: 'unknown' },
        expected,
      ),
    ).toBe('pending');
    expect(() =>
      mergeReadiness(
        { ...pr, mergeable: false, mergeable_state: 'dirty' },
        expected,
      ),
    ).toThrow('Merge conflict');
    for (const state of ['blocked', 'behind', 'unstable', 'draft'])
      expect(() =>
        mergeReadiness({ ...pr, mergeable_state: state }, expected),
      ).toThrow('blocked');
    expect(() =>
      mergeReadiness(
        { ...pr, base: { ref: 'main', sha: 'd'.repeat(40) } },
        expected,
      ),
    ).toThrow('base');
  });
  it('merges only the reviewed head after fresh checks and confirms the merged commit', async () => {
    const request = vi
      .fn<GithubRequest>()
      .mockResolvedValueOnce(pr)
      .mockResolvedValueOnce(checks)
      .mockResolvedValueOnce(pr)
      .mockResolvedValueOnce({ merged: true, sha: merge })
      .mockResolvedValueOnce(merged);
    expect(await mergeReviewedPullRequest(request, expected)).toBe(merge);
    expect(request).toHaveBeenNthCalledWith(4, '/pulls/11/merge', 'PUT', {
      sha: head,
      merge_method: 'merge',
    });
  });
  it('never sends a merge for unknown/conflicting state or pending/stale checks', async () => {
    for (const state of [
      { ...pr, mergeable: null },
      { ...pr, mergeable: false },
    ]) {
      const request = vi.fn<GithubRequest>().mockResolvedValue(state);
      await expect(
        mergeReviewedPullRequest(request, expected),
      ).rejects.toThrow();
      expect(request).toHaveBeenCalledTimes(1);
    }
    for (const results of [
      { total_count: 0, check_runs: [] },
      {
        ...checks,
        check_runs: checks.check_runs.map((check) => ({
          ...check,
          started_at: '2026-11-07T12:00:00Z',
        })),
      },
    ]) {
      const request = vi
        .fn<GithubRequest>()
        .mockResolvedValueOnce(pr)
        .mockResolvedValueOnce(results);
      await expect(mergeReviewedPullRequest(request, expected)).rejects.toThrow(
        'checks',
      );
      expect(request).toHaveBeenCalledTimes(2);
    }
  });
  it('rejects a changed head, body or base between checks and merge', async () => {
    for (const current of [
      { ...pr, body: 'Changed body' },
      { ...pr, head: { ...pr.head, sha: 'd'.repeat(40) } },
      { ...pr, base: { ref: 'main', sha: 'd'.repeat(40) } },
      { ...pr, updated_at: '2026-11-08T12:01:00Z' },
    ]) {
      const request = vi
        .fn<GithubRequest>()
        .mockResolvedValueOnce(pr)
        .mockResolvedValueOnce(checks)
        .mockResolvedValueOnce(current);
      await expect(
        mergeReviewedPullRequest(request, expected),
      ).rejects.toThrow();
      expect(request).toHaveBeenCalledTimes(3);
    }
  });
  it('fails on rejected merges, API errors and unconfirmed merge results', async () => {
    for (const response of [
      { merged: false, sha: merge },
      { merged: true, sha: 'invalid' },
    ]) {
      const request = vi
        .fn<GithubRequest>()
        .mockResolvedValueOnce(pr)
        .mockResolvedValueOnce(checks)
        .mockResolvedValueOnce(pr)
        .mockResolvedValueOnce(response);
      await expect(mergeReviewedPullRequest(request, expected)).rejects.toThrow(
        'confirm',
      );
    }
    const failed = vi
      .fn<GithubRequest>()
      .mockResolvedValueOnce(pr)
      .mockResolvedValueOnce(checks)
      .mockResolvedValueOnce(pr)
      .mockRejectedValueOnce(new Error('GitHub 409'));
    await expect(mergeReviewedPullRequest(failed, expected)).rejects.toThrow(
      '409',
    );
    const unconfirmed = vi
      .fn<GithubRequest>()
      .mockResolvedValueOnce(pr)
      .mockResolvedValueOnce(checks)
      .mockResolvedValueOnce(pr)
      .mockResolvedValueOnce({ merged: true, sha: merge })
      .mockResolvedValueOnce(pr);
    await expect(
      mergeReviewedPullRequest(unconfirmed, expected),
    ).rejects.toThrow();
    expect(() =>
      mergedCommit({ ...merged, merged: false }, expected),
    ).toThrow();
  });
  it('does not confuse green PR preparation with completed default delivery or reuse stale receipts', () => {
    const context = {
      task: 'Fixture task',
      runId: 'run',
      sourceHash: 'source',
      head,
      plan: 'plan',
      bodyHash: 'body',
      policy: { mode: 'merge' as const, reason: '' },
    };
    const receipt = { ...context, ...context.policy, status: 'merged' };
    expect(verifyDeliveryReceipt(receipt, context).status).toBe('merged');
    for (const status of [
      'passed',
      'awaiting-ci',
      'ready-to-merge',
      'merging',
      'failed',
      'pr-only',
    ])
      expect(() =>
        verifyDeliveryReceipt({ ...receipt, status }, context),
      ).toThrow('incomplete');
    for (const field of [
      'task',
      'runId',
      'sourceHash',
      'head',
      'plan',
      'bodyHash',
    ])
      expect(() =>
        verifyDeliveryReceipt({ ...receipt, [field]: 'stale' }, context),
      ).toThrow('Stale');
    expect(() =>
      verifyDeliveryReceipt({ ...receipt, mode: 'pr-only' }, context),
    ).toThrow('policy');
    const exception = {
      ...context,
      policy: {
        mode: 'pr-only' as const,
        reason: 'Explicit user instruction for this task.',
      },
    };
    expect(
      verifyDeliveryReceipt(
        { ...receipt, ...exception.policy, status: 'pr-only' },
        exception,
      ).status,
    ).toBe('pr-only');
  });
});
