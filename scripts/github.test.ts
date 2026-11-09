import { afterEach, describe, expect, it, vi } from 'vitest';
import { githubRequest } from './github.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('GitHub delivery transport contract', () => {
  it('pins the supported PR response contract that includes the merged commit SHA', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'fixture-secret');
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ merged: true, merge_commit_sha: 'a'.repeat(40) }),
        ),
      );
    vi.stubGlobal('fetch', transport);
    expect(await githubRequest(process.cwd())('/pulls/5')).toEqual({
      merged: true,
      merge_commit_sha: 'a'.repeat(40),
    });
    expect(transport.mock.calls[0]?.[0]).toBe(
      'https://api.github.com/repos/YuxiangLiu-lyx/self_evolving_world/pulls/5',
    );
    expect(
      new Headers(transport.mock.calls[0]?.[1]?.headers).get(
        'X-GitHub-Api-Version',
      ),
    ).toBe('2022-11-28');
  });
  it('retains the guarded merge payload without exposing response bodies or credentials on failure', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'fixture-secret');
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('fixture-secret', { status: 409 }));
    vi.stubGlobal('fetch', transport);
    const request = githubRequest(process.cwd());
    await expect(
      request('/pulls/5/merge', 'PUT', {
        sha: 'a'.repeat(40),
        merge_method: 'merge',
      }),
    ).rejects.toThrow(
      /^GitHub PUT \/pulls\/5\/merge failed \(409\). Task delivery is incomplete\.$/,
    );
    expect(transport).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ sha: 'a'.repeat(40), merge_method: 'merge' }),
      }),
    );
  });
});
