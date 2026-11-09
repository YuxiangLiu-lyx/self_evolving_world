import { object } from './validation.js';

export const REPOSITORY = 'YuxiangLiu-lyx/self_evolving_world';
export const ORIGIN = `https://github.com/${REPOSITORY}.git`;
export const REQUIRED_CHECKS = ['quality', 'pr-policy'] as const;
export type GithubRequest = (
  path: string,
  method?: 'GET' | 'POST' | 'PATCH',
  body?: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

export function publicationTarget(origin: string, branch: string): void {
  if (origin !== ORIGIN)
    throw new Error('Publication requires the canonical origin URL.');
  if (!branch || branch === 'main' || branch === 'HEAD')
    throw new Error('Publish a focused branch, never main or a detached HEAD.');
}
export function verifyPullRequest(
  value: unknown,
  branch: string,
  head: string,
  body: string,
): { number: number; url: string; checksSince: string } {
  const pr = object(value);
  if (
    pr.state !== 'open' ||
    pr.draft !== false ||
    object(pr.base).ref !== 'main' ||
    object(pr.head).ref !== branch ||
    object(pr.head).sha !== head ||
    object(object(pr.head).repo).full_name !== REPOSITORY ||
    pr.body !== body ||
    typeof pr.number !== 'number' ||
    !Number.isSafeInteger(pr.number) ||
    typeof pr.updated_at !== 'string' ||
    !Number.isFinite(Date.parse(pr.updated_at)) ||
    pr.html_url !== `https://github.com/${REPOSITORY}/pull/${String(pr.number)}`
  )
    throw new Error(
      'Remote PR does not match the reviewed branch, head, body or main target.',
    );
  return { number: pr.number, url: pr.html_url, checksSince: pr.updated_at };
}

/** Idempotently publish a reviewed branch; callers must pass local preflight before invoking. */
export async function publishPullRequest(
  request: GithubRequest,
  branch: string,
  head: string,
  title: string,
  body: string,
): Promise<{ number: number; url: string; checksSince: string }> {
  const candidates = await request(
    `/pulls?state=open&base=main&head=${encodeURIComponent(`YuxiangLiu-lyx:${branch}`)}&per_page=100`,
  );
  if (!Array.isArray(candidates) || candidates.length > 1)
    throw new Error('Expected at most one open PR for this branch.');
  const existing =
    candidates[0] === undefined ? undefined : object(candidates[0]);
  let pr: unknown;
  if (existing) {
    if (
      typeof existing.number !== 'number' ||
      !Number.isSafeInteger(existing.number)
    )
      throw new Error('Invalid existing PR number.');
    if (existing.draft !== false)
      throw new Error(
        'Existing PR is a draft; mark it ready after the required review.',
      );
    pr =
      existing.body === body && existing.title === title
        ? existing
        : await request(`/pulls/${String(existing.number)}`, 'PATCH', {
            title,
            body,
          });
  } else
    pr = await request('/pulls', 'POST', {
      title,
      body,
      head: branch,
      base: 'main',
      draft: false,
    });
  return verifyPullRequest(pr, branch, head, body);
}

/** Missing, skipped, stale and failed checks never count as success. */
export function inspectChecks(
  value: unknown,
  head: string,
  checksSince: string,
): 'pending' | 'passed' {
  const earliest = Date.parse(checksSince);
  if (!Number.isFinite(earliest)) throw new Error('Missing PR revision time.');
  const response = object(value);
  if (
    !Array.isArray(response.check_runs) ||
    response.total_count !== response.check_runs.length
  )
    throw new Error('Incomplete GitHub check results.');
  const checks = response.check_runs.map(object);
  let pending = false;
  for (const name of REQUIRED_CHECKS) {
    const matches = checks.filter(
      (check) =>
        check.name === name &&
        check.head_sha === head &&
        typeof check.started_at === 'string' &&
        Date.parse(check.started_at) >= earliest &&
        object(check.app).slug === 'github-actions',
    );
    const current = matches.sort((a, b) => Number(b.id) - Number(a.id))[0];
    if (!current || current.status !== 'completed') {
      pending = true;
      continue;
    }
    if (current.conclusion !== 'success')
      throw new Error(
        `Current remote ${name} check did not pass: ${String(current.conclusion)}`,
      );
  }
  return pending ? 'pending' : 'passed';
}
