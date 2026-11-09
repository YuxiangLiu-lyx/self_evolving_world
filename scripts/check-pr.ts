import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkArchivePreservation } from './harness.js';
import { planPath, pullRequestErrors, validationFields } from './pr-policy.js';
import { completionErrors, object, readJson } from './validation.js';

const root = process.cwd();
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
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
      'X-GitHub-Api-Version': '2026-03-10',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(
      `GitHub metadata request failed (${String(response.status)}).`,
    );
  return response.json() as Promise<unknown>;
}
try {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let body: string, head: string, files: string[], plan: string;
  if (eventPath) {
    const event = object(readJson(eventPath)),
      eventPR = object(event.pull_request);
    const repository = text(process.env.GITHUB_REPOSITORY);
    if (
      !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
      !Number.isSafeInteger(eventPR.number)
    )
      throw new Error('Invalid PR identity.');
    checkArchivePreservation(root);
    const prPath = `${repository}/pulls/${String(eventPR.number)}`;
    const pr = object(await github(prPath));
    body = text(pr.body);
    head = text(object(pr.head).sha);
    if (head !== text(object(eventPR.head).sha))
      throw new Error('A newer commit exists; wait for its PR checks.');
    if (object(pr.base).ref !== 'main')
      throw new Error('Pull requests must target main.');
    files = [];
    for (let page = 1; page <= 30; page++) {
      const batch = await github(
        `${prPath}/files?per_page=100&page=${String(page)}`,
      );
      if (!Array.isArray(batch))
        throw new Error('Invalid changed-file response.');
      files.push(...batch.map((item) => text(object(item).filename)));
      if (batch.length < 100) break;
    }
    if (files.length !== pr.changed_files)
      throw new Error('Incomplete changed-file list; split this PR.');
    // Read the plan from the exact reviewed commit, never execute its content.
    plan = git('show', `${head}:${planPath(body)}`);
    const errors = pullRequestErrors({ body, head, files, plan });
    const current = object(await github(prPath));
    if (object(current.head).sha !== head || current.body !== body)
      errors.push('PR changed during validation; rerun its checks.');
    if (errors.length) throw new Error(errors.join('\n'));
  } else {
    const args = process.argv.slice(2).filter((arg) => arg !== '--');
    const bodyFile = args[0],
      base = args[1] ?? 'origin/main';
    if (!bodyFile)
      throw new Error('Usage: pnpm pr:check -- path/to/pr-body.md [base-ref]');
    if (git('status', '--porcelain') !== '')
      throw new Error(
        'Commit the reviewed changes before checking a PR; the worktree must be clean.',
      );
    checkArchivePreservation(root, base);
    body = readFileSync(resolve(root, bodyFile), 'utf8');
    head = git('rev-parse', 'HEAD');
    files = git('diff', '--name-only', '--find-renames', `${base}...HEAD`)
      .split('\n')
      .filter(Boolean);
    plan = git('show', `${head}:${planPath(body)}`);
    const errors = pullRequestErrors({ body, head, files, plan });
    const { task, runId } = validationFields(body);
    const report = readJson(resolve(root, 'validation-results/report.json'));
    errors.push(
      ...completionErrors(
        root,
        task,
        report,
        readJson(resolve(root, 'validation-results/review.json')),
      ),
    );
    if (object(report).status !== 'passed' || object(report).runId !== runId)
      errors.push(
        'PR must reference the actual completed local validation run.',
      );
    if (errors.length) throw new Error(errors.join('\n'));
  }
  console.log(
    `PR contract passed for ${head}: all requirements and ${String(files.length)} changed files are covered. Semantic correctness still requires the recorded review.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
