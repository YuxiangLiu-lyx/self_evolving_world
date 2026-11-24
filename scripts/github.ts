import { execFileSync } from 'node:child_process';

export const REPOSITORY = 'YuxiangLiu-lyx/self_evolving_world';
export type GithubRequest = (
  path: string,
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT',
  body?: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

/** Use existing credentials without exposing credential-helper output. */
export function githubRequest(root: string): GithubRequest {
  let token = process.env.GITHUB_TOKEN;
  if (!token) {
    try {
      const result = execFileSync('git', ['credential', 'fill'], {
        cwd: root,
        encoding: 'utf8',
        input: 'protocol=https\nhost=github.com\n\n',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      token = /^password=(.+)$/m.exec(result)?.[1];
    } catch {
      // Never include credentials or subprocess output in errors.
    }
  }
  if (!token)
    throw new Error(
      'GitHub credentials are unavailable; set GITHUB_TOKEN or configure a Git HTTPS credential helper.',
    );
  return async (path, method = 'GET', data) => {
    const response = await fetch(
      `https://api.github.com/repos/${REPOSITORY}${path}`,
      {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok)
      throw new Error(
        `GitHub ${method} ${path} failed (${String(response.status)}): ${(await response.text()).slice(0, 500)}`,
      );
    return response.json() as Promise<unknown>;
  };
}
