import { resolve } from 'node:path';
import { git } from './delivery-git.js';
import { digest, type TaskContext } from './task-context.js';
import { completionErrors, hashFile, object, readJson } from './validation.js';
import { REPOSITORY, type GithubRequest } from './publication.js';

export interface RemoteReview {
  id: number;
  url: string;
  author: string;
  head: string;
  runId: string;
  bodyHash: string;
  kind: 'current-conversation-self-review';
  independent: false;
}

export function reviewBody(root: string, c: TaskContext): string {
  const report = readJson(resolve(root, 'validation-results/report.json'));
  const reviewPath = resolve(root, 'validation-results/review.json');
  const review = readJson(reviewPath);
  const errors = completionErrors(root, c.intent.task, report, review);
  if (errors.length) throw new Error(errors.join('\n'));
  if (
    !c.review ||
    !c.validation ||
    c.review.evidenceHash !== hashFile(reviewPath) ||
    c.review.runId !== c.validation.runId ||
    c.review.sourceHash !== c.validation.sourceHash ||
    c.body?.head !== git(root, 'rev-parse', 'HEAD')
  )
    throw new Error(
      'Self-review evidence changed or is not bound to the current reviewed head.',
    );
  const body = [
    '## Current-conversation Codex self-review',
    'This is a self-review by the implementing Codex conversation, published through the connected GitHub account. It is not independent approval. Structural checks establish evidence coverage and freshness, not honest visual inspection, correct judgment or causal proof.',
    `Task: ${c.intent.id} / ${c.intent.task}`,
    `Requirements version: ${String(c.intent.requirementsVersion)}`,
    `Plan: ${c.intent.plan}`,
    `Commit: ${c.body.head}`,
    `Validation run: ${c.validation.runId}`,
    `Source SHA-256: ${c.review.sourceHash}`,
    `Review SHA-256: ${c.review.evidenceHash}`,
    '### Complete changed-file coverage',
    ...c.review.files.map((file) => `- ${file}`),
    '### Actual recorded findings',
    '```json',
    JSON.stringify(review, null, 2),
    '```',
    '### Screenshot provenance',
    '```json',
    JSON.stringify(object(report).evidence, null, 2),
    '```',
    'Screenshot bytes and complete logs are retained in local validation evidence and the CI artifact; this review retains findings and content hashes. No independent reviewer or model service was invoked.',
  ].join('\n\n');
  if (body.length > 60000)
    throw new Error(
      'Self-review exceeds the GitHub review body budget; summarize actual findings without removing required coverage.',
    );
  return body;
}

/** Query remote facts, never accept a supplied review ID or tool success as proof. */
export async function findRemoteReview(
  request: GithubRequest,
  number: number,
  head: string,
  runId: string,
  body: string,
): Promise<RemoteReview | undefined> {
  for (let page = 1; page <= 20; page++) {
    const values = await request(
      `/pulls/${String(number)}/reviews?per_page=100&page=${String(page)}`,
    );
    if (!Array.isArray(values))
      throw new Error('GitHub returned an invalid review list.');
    for (const value of values) {
      const r = object(value);
      if (r.state !== 'COMMENTED' || r.commit_id !== head || r.body !== body)
        continue;
      const author = object(r.user).login;
      if (
        typeof r.id !== 'number' ||
        !Number.isSafeInteger(r.id) ||
        r.id < 1 ||
        typeof author !== 'string' ||
        !author ||
        r.html_url !==
          `https://github.com/${REPOSITORY}/pull/${String(number)}#pullrequestreview-${String(r.id)}` ||
        typeof r.submitted_at !== 'string'
      )
        throw new Error('Matching remote review has invalid provenance.');
      return {
        id: r.id,
        url: r.html_url,
        author,
        head,
        runId,
        bodyHash: digest(body),
        kind: 'current-conversation-self-review',
        independent: false,
      };
    }
    if (values.length < 100) return undefined;
  }
  throw new Error(
    'Review lookup exceeded its bounded pagination limit; inspect the PR before continuing.',
  );
}

export async function verifyRemoteReview(
  root: string,
  c: TaskContext,
  request: GithubRequest,
): Promise<RemoteReview | undefined> {
  const number = c.publication?.number;
  if (
    typeof number !== 'number' ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    !c.body ||
    !c.validation
  )
    throw new Error(
      'Missing current PR identity for self-review verification.',
    );
  return findRemoteReview(
    request,
    number,
    c.body.head,
    c.validation.runId,
    reviewBody(root, c),
  );
}
