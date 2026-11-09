import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { checkArchivePreservation, taskRoute } from './harness.js';
import {
  inspectChecks,
  publicationTarget,
  publishPullRequest,
  REPOSITORY,
  verifyPullRequest,
} from './publication.js';
import type { GithubRequest } from './publication.js';
import { validationFields } from './pr-policy.js';

const root = process.cwd();
const git = (...args: string[]): string =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed.`);
}
function credential(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const result = execFileSync('git', ['credential', 'fill'], {
      cwd: root,
      encoding: 'utf8',
      input: 'protocol=https\nhost=github.com\n\n',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const token = /^password=(.+)$/m.exec(result)?.[1];
    if (token) return token;
  } catch {
    /* Credentials and subprocess output must never appear in logs. */
  }
  throw new Error(
    'PR publication requires GITHUB_TOKEN or an existing GitHub Git credential. Local validation remains intact; delivery is incomplete.',
  );
}
try {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const [bodyFile, title, mode] = args;
  if (
    !bodyFile ||
    !title ||
    title.trim().length < 12 ||
    args.length > 3 ||
    (mode !== undefined && mode !== '--verify-only')
  )
    throw new Error(
      'Usage: pnpm task:publish -- validation-results/pr-body.md "Concrete PR title" [--verify-only]',
    );
  const branch = git('branch', '--show-current');
  publicationTarget(git('remote', 'get-url', 'origin'), branch);
  run('git', ['fetch', 'origin']);
  run('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
  checkArchivePreservation(root);
  run('pnpm', ['pr:check', '--', bodyFile, 'origin/main']);
  const head = git('rev-parse', 'HEAD');
  const body = readFileSync(resolve(root, bodyFile), 'utf8');
  const token = credential();
  const request: GithubRequest = async (path, method = 'GET', data) => {
    const response = await fetch(
      `https://api.github.com/repos/${REPOSITORY}${path}`,
      {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2026-03-10',
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok)
      throw new Error(
        `GitHub ${method} ${path} failed (${String(response.status)}).`,
      );
    return response.json() as Promise<unknown>;
  };
  if (mode !== '--verify-only')
    run('git', [
      'push',
      '--set-upstream',
      'origin',
      `HEAD:refs/heads/${branch}`,
    ]);
  const readOnlyRequest: GithubRequest = async (path, method, data) => {
    if (method && method !== 'GET')
      throw new Error(
        'The existing PR must already match title/body in verify-only mode.',
      );
    return request(path, method, data);
  };
  const pr = await publishPullRequest(
    mode === '--verify-only' ? readOnlyRequest : request,
    branch,
    head,
    title,
    body,
  );
  const path = resolve(root, 'validation-results/publication.json');
  const record = {
    ...validationFields(body),
    head,
    branch,
    route: taskRoute(root).kind,
    url: pr.url,
  };
  writeFileSync(
    path,
    JSON.stringify({ ...record, status: 'awaiting-ci' }, null, 2) + '\n',
  );
  console.log(
    `PR published: ${pr.url}. Waiting for current quality and pr-policy checks.`,
  );
  let passed = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    verifyPullRequest(
      await request(`/pulls/${String(pr.number)}`),
      branch,
      head,
      body,
    );
    const checks = await request(
      `/commits/${head}/check-runs?filter=latest&per_page=100`,
    );
    if (inspectChecks(checks, head, pr.checksSince) === 'passed') {
      passed = true;
      break;
    }
    if (attempt % 3 === 0)
      console.log(
        'Current remote checks are pending; no merge will be performed.',
      );
    await setTimeout(10_000);
  }
  if (!passed)
    throw new Error(
      'Remote CI did not complete within 15 minutes. Rerun task:publish to verify; delivery remains incomplete.',
    );
  verifyPullRequest(
    await request(`/pulls/${String(pr.number)}`),
    branch,
    head,
    body,
  );
  run('pnpm', ['pr:check', '--', bodyFile, 'origin/main']);
  if (git('rev-parse', 'HEAD') !== head)
    throw new Error('Local head changed during publication.');
  writeFileSync(
    path,
    JSON.stringify(
      {
        ...record,
        status: 'passed',
        checks: ['quality', 'pr-policy'],
        verifiedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `Task delivered: ${pr.url}. Both current remote checks passed; PR remains open for human acceptance.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
