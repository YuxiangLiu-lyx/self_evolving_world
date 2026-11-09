import { describe, expect, it, vi } from 'vitest';
import {
  inspectChecks,
  ORIGIN,
  publicationTarget,
  publishPullRequest,
  REPOSITORY,
  verifyPullRequest,
} from './publication.js';
import type { GithubRequest } from './publication.js';

const head = 'a'.repeat(40);
const checksSince = '2026-11-08T12:00:00Z';
const pr = {
  number: 10,
  updated_at: checksSince,
  html_url: `https://github.com/${REPOSITORY}/pull/10`,
  state: 'open',
  draft: false,
  title: 'Synchronous experiment',
  body: 'Reviewed body',
  base: { ref: 'main' },
  head: { ref: 'feat/ex2', sha: head, repo: { full_name: REPOSITORY } },
};
const checks = ['quality', 'pr-policy'].map((name, id) => ({
  id,
  name,
  head_sha: head,
  app: { slug: 'github-actions' },
  started_at: checksSince,
  status: 'completed',
  conclusion: 'success',
}));

describe('automatic PR delivery for every task route', () => {
  it('creates one PR targeting main and reuses a matching PR without duplicate writes', async () => {
    const create = vi
      .fn<GithubRequest>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(pr);
    expect(
      await publishPullRequest(create, 'feat/ex2', head, pr.title, pr.body),
    ).toEqual({ number: 10, url: pr.html_url, checksSince });
    expect(create).toHaveBeenLastCalledWith('/pulls', 'POST', {
      title: pr.title,
      body: pr.body,
      head: 'feat/ex2',
      base: 'main',
      draft: false,
    });
    const existing = vi.fn<GithubRequest>().mockResolvedValue([pr]);
    await publishPullRequest(existing, 'feat/ex2', head, pr.title, pr.body);
    expect(existing).toHaveBeenCalledTimes(1);
  });
  it('updates an existing description and rejects wrong remote heads, drafts and duplicate PRs', async () => {
    const update = vi
      .fn<GithubRequest>()
      .mockResolvedValueOnce([{ ...pr, body: 'Old description' }])
      .mockResolvedValueOnce(pr);
    await publishPullRequest(update, 'feat/ex2', head, pr.title, pr.body);
    expect(update).toHaveBeenLastCalledWith('/pulls/10', 'PATCH', {
      title: pr.title,
      body: pr.body,
    });
    for (const candidates of [
      [pr, pr],
      [{ ...pr, draft: true }],
      [{ ...pr, head: { ...pr.head, sha: 'b'.repeat(40) } }],
    ])
      await expect(
        publishPullRequest(
          () => Promise.resolve(candidates),
          'feat/ex2',
          head,
          pr.title,
          pr.body,
        ),
      ).rejects.toThrow();
    expect(() =>
      verifyPullRequest(
        { ...pr, base: { ref: 'other' } },
        'feat/ex2',
        head,
        pr.body,
      ),
    ).toThrow('does not match');
    expect(() =>
      verifyPullRequest(
        { ...pr, body: 'Stale body' },
        'feat/ex2',
        head,
        pr.body,
      ),
    ).toThrow('does not match');
  });
  it('requires both current successful checks and refuses skipped, stale or incomplete evidence', () => {
    expect(
      inspectChecks({ total_count: 2, check_runs: checks }, head, checksSince),
    ).toBe('passed');
    expect(
      inspectChecks(
        { total_count: 1, check_runs: checks.slice(0, 1) },
        head,
        checksSince,
      ),
    ).toBe('pending');
    expect(
      inspectChecks(
        { total_count: 2, check_runs: checks },
        'b'.repeat(40),
        checksSince,
      ),
    ).toBe('pending');
    expect(
      inspectChecks(
        {
          total_count: 2,
          check_runs: checks.map((check) => ({
            ...check,
            status: 'in_progress',
          })),
        },
        head,
        checksSince,
      ),
    ).toBe('pending');
    for (const conclusion of ['failure', 'skipped', 'neutral', 'cancelled'])
      expect(() =>
        inspectChecks(
          {
            total_count: 2,
            check_runs: checks.map((check) => ({ ...check, conclusion })),
          },
          head,
          checksSince,
        ),
      ).toThrow('did not pass');
    expect(() =>
      inspectChecks(
        { total_count: 101, check_runs: checks },
        head,
        checksSince,
      ),
    ).toThrow('Incomplete');
  });
  it('waits for fresh checks after a same-head PR description update', () => {
    expect(
      inspectChecks(
        { total_count: 2, check_runs: checks },
        head,
        '2026-11-08T12:01:00Z',
      ),
    ).toBe('pending');
  });
  it('rejects publication to the wrong repository, main or detached HEAD', () => {
    expect(() => {
      publicationTarget(ORIGIN, 'feat/ex2');
    }).not.toThrow();
    for (const branch of ['main', 'HEAD', ''])
      expect(() => {
        publicationTarget(ORIGIN, branch);
      }).toThrow('focused branch');
    expect(() => {
      publicationTarget('https://example.test/other.git', 'feat/ex2');
    }).toThrow('canonical');
  });
});
