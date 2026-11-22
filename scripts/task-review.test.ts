import { describe, expect, it } from 'vitest';
import {
  findRemoteReview,
  reviewFileGroups,
  reviewImageGroups,
} from './task-review.js';
import type { GithubRequest } from './publication.js';

const body = 'Actual version-bound current-conversation self-review fixture';
const record = {
  id: 123,
  html_url:
    'https://github.com/YuxiangLiu-lyx/self_evolving_world/pull/8#pullrequestreview-123',
  user: { login: 'implementer' },
  submitted_at: '2026-11-09T12:00:00Z',
  state: 'COMMENTED',
  commit_id: 'reviewed-head',
  body,
};
describe('remote self-review provenance', () => {
  it('losslessly factors complete file coverage and image judgments without truncation', () => {
    const files = [
      'README.md',
      ...Array.from(
        { length: 1000 },
        (_, i) => `experiment/ex12/calls/ordinary-${String(i)}.json`,
      ),
      'docs/a b.md',
    ];
    const grouped = JSON.parse(
      JSON.stringify(reviewFileGroups(files)),
    ) as Record<string, string[]>;
    expect(
      Object.entries(grouped).flatMap(([directory, names]) =>
        names.map((name) => directory + name),
      ),
    ).toEqual(files);
    const images = Array.from({ length: 200 }, (_, i) => ({
      id: `scene-${String(i)}`,
      path: `validation-results/evidence/current/scene-${String(i)}.png`,
      sha256: 'a'.repeat(64),
      verdict: 'pass',
      notes: 'Actual observed progress remains distinct from completion.',
    }));
    const packed = JSON.parse(
      JSON.stringify(reviewImageGroups(images)),
    ) as Record<string, string[][]>;
    expect(
      Object.entries(packed).flatMap(([directory, rows]) =>
        rows.map(([id, file, sha256, verdict, notes]) => ({
          id,
          path: directory + String(file),
          sha256,
          verdict,
          notes,
        })),
      ),
    ).toEqual(images);
    expect(
      JSON.stringify(grouped).length + JSON.stringify(packed).length,
    ).toBeLessThan(65000);
    expect(() => reviewImageGroups([{ ...images[0], notes: '' }])).toThrow();
  });
  it('verifies actual head/body/comment provenance using read-only GitHub requests', async () => {
    const calls: string[] = [];
    const request: GithubRequest = (path, method) => {
      expect(method).toBeUndefined();
      calls.push(path);
      return Promise.resolve([record]);
    };
    const verified = await findRemoteReview(
      request,
      8,
      'reviewed-head',
      'run-1',
      body,
    );
    expect(verified).toMatchObject({
      id: 123,
      author: 'implementer',
      runId: 'run-1',
      head: 'reviewed-head',
      independent: false,
      kind: 'current-conversation-self-review',
    });
    expect(calls).toEqual(['/pulls/8/reviews?per_page=100&page=1']);
    expect(
      await findRemoteReview(request, 8, 'reviewed-head', 'run-1', body),
    ).toEqual(verified);
  });
  it('paginates remote reviews and stops at the documented bounded limit', async () => {
    let reads = 0;
    const request: GithubRequest = () =>
      Promise.resolve(
        ++reads === 1
          ? Array.from({ length: 100 }, () => ({ ...record, commit_id: 'old' }))
          : [record],
      );
    expect(
      (await findRemoteReview(request, 8, 'reviewed-head', 'run-1', body))?.id,
    ).toBe(123);
    expect(reads).toBe(2);
    reads = 0;
    await expect(
      findRemoteReview(
        () => {
          reads++;
          return Promise.resolve(
            Array.from({ length: 100 }, () => ({
              ...record,
              commit_id: 'old',
            })),
          );
        },
        8,
        'reviewed-head',
        'run-1',
        body,
      ),
    ).rejects.toThrow('bounded pagination');
    expect(reads).toBe(20);
  });
  it.each([
    { commit_id: 'old-head' },
    { body: 'Changed findings' },
    { state: 'APPROVED' },
    { state: 'DISMISSED' },
    { state: 'PENDING' },
  ])('rejects stale or misrepresented review %j', async (change) => {
    expect(
      await findRemoteReview(
        () => Promise.resolve([{ ...record, ...change }]),
        8,
        'reviewed-head',
        'run-1',
        body,
      ),
    ).toBeUndefined();
  });
  it('does not convert absent reviews or service failures into acceptance and rejects invalid identity', async () => {
    expect(
      await findRemoteReview(
        () => Promise.resolve([]),
        8,
        'reviewed-head',
        'run-1',
        body,
      ),
    ).toBeUndefined();
    await expect(
      findRemoteReview(
        () => Promise.reject(new Error('Remote failure')),
        8,
        'reviewed-head',
        'run-1',
        body,
      ),
    ).rejects.toThrow('Remote failure');
    await expect(
      findRemoteReview(
        () =>
          Promise.resolve([
            { ...record, html_url: 'https://example.test/unrelated' },
          ]),
        8,
        'reviewed-head',
        'run-1',
        body,
      ),
    ).rejects.toThrow('provenance');
  });
});
