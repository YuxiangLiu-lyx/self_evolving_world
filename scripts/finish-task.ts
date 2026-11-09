import { requireTaskWorker } from './task-worker.js';
import { verifyRemoteReview } from './task-review.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  currentDeliveryPolicy,
  git,
  verifyIntegrated,
} from './delivery-git.js';
import { mergedCommit, verifyDeliveryReceipt } from './delivery.js';
import { githubRequest } from './github.js';
import { checkArchivePreservation } from './harness.js';
import { planPath, validationFields } from './pr-policy.js';
import { inspectChecks, ORIGIN, verifyPullRequest } from './publication.js';
import { completionErrors, hashFile, object, readJson } from './validation.js';

const root = process.cwd();
const output = resolve(root, 'validation-results/completion.json');
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const index = args.indexOf('--plan');
const task = (index < 0 ? args : args.slice(0, index)).join(' ').trim();
const requestedPlan = index < 0 ? undefined : args[index + 1];
try {
  const context = requireTaskWorker(root, 'finish', args);
  if (!task || (index >= 0 && (!requestedPlan || index + 2 !== args.length)))
    throw new Error(
      'Usage: pnpm task:finish -- "task name" [--plan docs/exec-plans/active/pr-NN-task.md]',
    );
  const report = object(
    readJson(resolve(root, 'validation-results/report.json')),
  );
  const errors = completionErrors(
    root,
    task,
    report,
    readJson(resolve(root, 'validation-results/review.json')),
  );
  if (report.status !== 'passed')
    errors.push('Run task:review after actual review before final completion.');
  if (errors.length) throw new Error(errors.join('\n'));
  if (git(root, 'remote', 'get-url', 'origin') !== ORIGIN)
    throw new Error('Completion requires the canonical origin.');
  const head = git(root, 'rev-parse', 'HEAD');
  // Local-only is an explicitly reviewed exception and performs no network calls.
  if (requestedPlan) {
    const policy = currentDeliveryPolicy(root, requestedPlan, task);
    if (policy.mode !== 'local-only')
      throw new Error(
        '--plan completion is only for an explicit local-only instruction; otherwise use task:publish.',
      );
    checkArchivePreservation(root);
    writeFileSync(
      output,
      JSON.stringify(
        {
          status: 'completed-with-exception',
          task,
          runId: report.runId,
          sourceHash: report.sourceHash,
          head,
          plan: requestedPlan,
          ...policy,
          verifiedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      `Task completed with explicit local-only exception: ${task}. ${policy.reason}`,
    );
  } else {
    const path = resolve(root, 'validation-results/publication.json');
    if (!existsSync(path))
      throw new Error(
        'No verified delivery exists. Run task:publish; an open PR alone cannot complete a default task.',
      );
    const receipt = object(readJson(path));
    if (
      typeof receipt.plan !== 'string' ||
      typeof receipt.base !== 'string' ||
      !/^[a-f\d]{40}$/.test(receipt.base) ||
      typeof receipt.bodyFile !== 'string'
    )
      throw new Error('Missing current delivery identity. Run task:publish.');
    if (git(root, 'status', '--porcelain') !== '')
      throw new Error('Task completion requires a clean reviewed commit.');
    const body = readFileSync(resolve(root, receipt.bodyFile), 'utf8');
    const fields = validationFields(body);
    if (
      fields.task !== task ||
      fields.runId !== report.runId ||
      planPath(body) !== receipt.plan
    )
      throw new Error(
        'PR body does not identify the current task, run and plan.',
      );
    const policy = currentDeliveryPolicy(
      root,
      receipt.plan,
      task,
      receipt.base,
    );
    verifyDeliveryReceipt(receipt, {
      task,
      runId: report.runId,
      sourceHash: String(report.sourceHash),
      head,
      plan: receipt.plan,
      bodyHash: hashFile(resolve(root, receipt.bodyFile)),
      policy,
    });
    if (
      typeof receipt.branch !== 'string' ||
      receipt.branch !== git(root, 'branch', '--show-current') ||
      typeof receipt.number !== 'number' ||
      !Number.isSafeInteger(receipt.number) ||
      receipt.number < 1 ||
      typeof receipt.checksSince !== 'string'
    )
      throw new Error('Invalid delivery branch, PR or check revision.');
    const expected = {
      number: receipt.number,
      branch: receipt.branch,
      head,
      body,
      base: receipt.base,
    };
    const request = githubRequest(root);
    const remoteReview = await verifyRemoteReview(root, context, request);
    if (!remoteReview)
      throw new Error('Current GitHub self-review is missing or stale.');
    const pr = await request(`/pulls/${String(receipt.number)}`);
    const identity = verifyPullRequest(
      pr,
      receipt.branch,
      head,
      body,
      policy.mode === 'merge',
    );
    if (identity.number !== receipt.number || identity.url !== receipt.url)
      throw new Error('Delivery PR identity changed.');
    const since =
      policy.mode === 'merge' ? receipt.checksSince : identity.checksSince;
    if (
      inspectChecks(
        await request(`/commits/${head}/check-runs?filter=latest&per_page=100`),
        head,
        since,
      ) !== 'passed'
    )
      throw new Error(
        'Current required checks have not passed. Task remains incomplete.',
      );
    git(root, 'fetch', 'origin');
    checkArchivePreservation(root, receipt.base);
    if (policy.mode === 'merge') {
      const merge = mergedCommit(pr, expected);
      if (merge !== receipt.mergeSha)
        throw new Error('Merged PR does not match the delivery receipt.');
      verifyIntegrated(root, head, merge);
    } else if (object(pr).state !== 'open')
      throw new Error('The explicit PR-only delivery is not open.');
    // Recheck source and remote identity after I/O, so concurrent changes cannot complete the task.
    const finalErrors = completionErrors(
      root,
      task,
      report,
      readJson(resolve(root, 'validation-results/review.json')),
    );
    if (
      finalErrors.length ||
      git(root, 'rev-parse', 'HEAD') !== head ||
      git(root, 'status', '--porcelain') !== ''
    )
      throw new Error('Reviewed source changed during completion.');
    verifyPullRequest(
      await request(`/pulls/${String(receipt.number)}`),
      receipt.branch,
      head,
      body,
      policy.mode === 'merge',
    );
    writeFileSync(
      output,
      JSON.stringify(
        {
          ...receipt,
          remoteReview,
          status:
            policy.mode === 'merge' ? 'completed' : 'completed-with-exception',
          verifiedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      policy.mode === 'merge'
        ? `Task completed: ${receipt.url} is merged and its reviewed content is in main.`
        : `Task completed with explicit PR-only exception: ${receipt.url}. ${policy.reason}`,
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (existsSync(resolve(root, 'validation-results')))
    writeFileSync(
      output,
      JSON.stringify({ status: 'failed', task, error: message }, null, 2) +
        '\n',
    );
  console.error(`Task incomplete: ${message}`);
  process.exitCode = 1;
}
