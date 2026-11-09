import { requireTaskWorker } from './task-worker.js';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import {
  checkMergeCompatibility,
  currentDeliveryPolicy,
  git,
  verifyIntegrated,
} from './delivery-git.js';
import { mergeReadiness, mergedCommit } from './delivery.js';
import { githubRequest } from './github.js';
import { taskRoute } from './harness.js';
import {
  inspectChecks,
  publicationTarget,
  publishPullRequest,
  verifyPullRequest,
  type GithubRequest,
} from './publication.js';
import { planPath, validationFields } from './pr-policy.js';
import { hashFile, object, readJson } from './validation.js';

const root = process.cwd();
const output = resolve(root, 'validation-results/publication.json');
let record: Record<string, unknown> = {};
function write(status: string, extra: Record<string, unknown> = {}): void {
  writeFileSync(
    output,
    JSON.stringify({ ...record, ...extra, status }, null, 2) + '\n',
  );
}
function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed.`);
}
try {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  requireTaskWorker(root, 'publish', args);
  const [bodyFile, title, mode] = args;
  if (
    !bodyFile ||
    !title ||
    title.trim().length < 12 ||
    args.length > 3 ||
    (mode !== undefined &&
      mode !== '--verify-only' &&
      mode !== '--prepare-only')
  )
    throw new Error(
      'Usage: pnpm task:publish -- validation-results/pr-body.md "Concrete PR title" --prepare-only|--verify-only',
    );
  const branch = git(root, 'branch', '--show-current');
  publicationTarget(git(root, 'remote', 'get-url', 'origin'), branch);
  const head = git(root, 'rev-parse', 'HEAD');
  const body = readFileSync(resolve(root, bodyFile), 'utf8');
  const fields = validationFields(body);
  const plan = planPath(body);
  const report = object(
    readJson(resolve(root, 'validation-results/report.json')),
  );
  const bodyHash = hashFile(resolve(root, bodyFile));
  const previous = existsSync(output) ? object(readJson(output)) : {};
  const retry =
    previous.head === head &&
    previous.bodyHash === bodyHash &&
    previous.runId === fields.runId &&
    previous.sourceHash === report.sourceHash &&
    previous.task === fields.task &&
    typeof previous.base === 'string' &&
    /^[a-f\d]{40}$/.test(previous.base) &&
    typeof previous.number === 'number' &&
    Number.isSafeInteger(previous.number);
  const baseline = retry ? String(previous.base) : 'origin/main';
  const policy = currentDeliveryPolicy(root, plan, fields.task, baseline);
  if (policy.mode === 'local-only')
    throw new Error(
      'This task explicitly forbids a PR. Use task:finish with --plan; no publication was attempted.',
    );
  record = {
    ...fields,
    head,
    branch,
    bodyFile,
    bodyHash,
    plan,
    ...policy,
    sourceHash: report.sourceHash,
  };
  // Local preflight precedes credentials and remote mutations, including retry after a confirmed merge.
  run('pnpm', ['pr:check', '--', bodyFile, baseline]);
  run('git', ['fetch', 'origin']);
  const request = githubRequest(root);
  if (retry) {
    record = { ...previous, ...record };
    const existing = await request(`/pulls/${String(previous.number)}`);
    if (object(existing).merged === true) {
      if (policy.mode !== 'merge')
        throw new Error(
          'PR was merged despite the recorded PR-only exception.',
        );
      const expected = {
        number: Number(previous.number),
        branch,
        head,
        body,
        base: String(previous.base),
      };
      const mergeSha = mergedCommit(existing, expected);
      if (
        typeof previous.checksSince !== 'string' ||
        inspectChecks(
          await request(
            `/commits/${head}/check-runs?filter=latest&per_page=100`,
          ),
          head,
          previous.checksSince,
        ) !== 'passed'
      )
        throw new Error(
          'Merged delivery lacks current reviewed check evidence.',
        );
      verifyIntegrated(root, head, mergeSha);
      write('merged', { mergeSha });
      if (mode === '--verify-only')
        run('pnpm', ['task:finish', '--', fields.task]);
      process.exit(0);
    }
  }
  const base = checkMergeCompatibility(root);
  record = { ...record, base, route: taskRoute(root).kind };
  // A moved main invalidates prior changed-file mapping, even on a retry.
  run('pnpm', ['pr:check', '--', bodyFile, 'origin/main']);
  if (mode !== '--verify-only')
    run('git', [
      'push',
      '--set-upstream',
      'origin',
      `HEAD:refs/heads/${branch}`,
    ]);
  const readOnly: GithubRequest = async (path, method, data) => {
    if (method && method !== 'GET')
      throw new Error(
        'Verify-only requires an existing matching PR and performs no publishing or merge mutation.',
      );
    return request(path, method, data);
  };
  const pr = await publishPullRequest(
    mode === '--verify-only' ? readOnly : request,
    branch,
    head,
    title,
    body,
  );
  record = { ...record, ...pr };
  write('awaiting-ci');
  console.log(`PR: ${pr.url}. Waiting for current checks and mergeability.`);
  const expected = { number: pr.number, branch, head, body, base };
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    const current = await request(`/pulls/${String(pr.number)}`);
    const identity = verifyPullRequest(current, branch, head, body);
    if (object(object(current).base).sha !== base)
      throw new Error(
        'Main advanced. Integrate main and repeat full validation/review.',
      );
    record.checksSince = identity.checksSince;
    const checks = await request(
      `/commits/${head}/check-runs?filter=latest&per_page=100`,
    );
    const passed =
      inspectChecks(checks, head, identity.checksSince) === 'passed';
    if (
      object(current).mergeable === false ||
      object(current).mergeable_state === 'dirty'
    )
      throw new Error(
        'Merge conflict reported by GitHub. Task remains incomplete.',
      );
    if (passed && mergeReadiness(current, expected) === 'ready') {
      ready = true;
      break;
    }
    if (attempt % 3 === 0)
      console.log(
        'Current checks or mergeability are pending; task is not complete.',
      );
    await setTimeout(10_000);
  }
  if (!ready)
    throw new Error(
      'Checks or mergeability did not become ready within 15 minutes. Task remains incomplete.',
    );
  run('git', ['fetch', 'origin']);
  if (checkMergeCompatibility(root) !== base)
    throw new Error('Main changed during publication. Repeat validation.');
  run('pnpm', ['pr:check', '--', bodyFile, 'origin/main']);
  if (git(root, 'rev-parse', 'HEAD') !== head)
    throw new Error('Local head changed during publication.');
  if (mode === '--prepare-only') {
    write('ready-to-merge');
    console.log(
      `PR preparation passed: ${pr.url}. Task is incomplete until the required delivery and task:finish pass.`,
    );
  } else if (policy.mode === 'pr-only') {
    write('pr-only');
    run('pnpm', ['task:finish', '--', fields.task]);
  } else if (mode === '--verify-only') {
    write('ready-to-merge');
    throw new Error(
      'PR is still open. Default task completion requires a confirmed merge; verify-only cannot merge.',
    );
  } else {
    throw new Error(
      'Publication cannot merge. Continue the coordinator for a scoped connector handoff.',
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (existsSync(resolve(root, 'validation-results')))
    write('failed', { error: message });
  console.error(`Task incomplete: ${message}`);
  process.exitCode = 1;
}
