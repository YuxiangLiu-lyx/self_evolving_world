import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { planPath, pullRequestErrors } from './pr-policy.js';
import { object, readJson } from './validation.js';

const root = process.cwd();
const git = (...args: string[]): string =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20_000_000,
  }).trim();
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('Missing string field in GitHub response.');
  return value;
}
async function github(path: string): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN;
  if (!token)
    throw new Error('GITHUB_TOKEN is required for PR metadata reads.');
  const response = await fetch(`https://api.github.com/repos/${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(
      `GitHub metadata request failed (${String(response.status)}).`,
    );
  return response.json() as Promise<unknown>;
}
const archives = (ref: string): string[] =>
  git('ls-tree', '--name-only', ref, 'experiment/')
    .split('\n')
    .flatMap((path) => /^experiment\/(ex[1-9]\d*)$/.exec(path)?.[1] ?? []);
const planAt = (head: string, body: string): string | null => {
  const path = planPath(body);
  if (path === null) return null;
  try {
    return git('show', `${head}:${path}`);
  } catch {
    return null;
  }
};
try {
  let body: string, head: string, base: string, files: string[];
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath) {
    const event = object(readJson(eventPath)),
      eventPR = object(event.pull_request);
    const repository = text(process.env.GITHUB_REPOSITORY);
    if (
      !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
      !Number.isSafeInteger(eventPR.number)
    )
      throw new Error('Invalid PR identity.');
    const prPath = `${repository}/pulls/${String(eventPR.number)}`;
    const pr = object(await github(prPath));
    body = typeof pr.body === 'string' ? pr.body : '';
    head = text(object(pr.head).sha);
    base = text(object(pr.base).sha);
    if (object(pr.base).ref !== 'main')
      throw new Error('Pull requests must target main.');
    files = git('diff', '--name-only', '--no-renames', `${base}...${head}`)
      .split('\n')
      .filter(Boolean);
  } else {
    const [bodyFile, baseRef = 'origin/main'] = process.argv
      .slice(2)
      .filter((arg) => arg !== '--');
    if (!bodyFile)
      throw new Error('Usage: pnpm pr:check -- path/to/pr-body.md [base-ref]');
    body = readFileSync(resolve(root, bodyFile), 'utf8');
    head = 'HEAD';
    base = baseRef;
    files = git('diff', '--name-only', '--no-renames', `${base}...HEAD`)
      .split('\n')
      .filter(Boolean);
  }
  const errors = pullRequestErrors({
    body,
    plan: planAt(head, body),
    files,
    baseArchives: archives(base),
  });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`PR description passed for ${String(files.length)} files.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
