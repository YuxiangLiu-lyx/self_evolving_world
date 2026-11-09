import {
  inspectChecks,
  verifyPullRequest,
  type GithubRequest,
} from './publication.js';
import { object } from './validation.js';

export type DeliveryMode = 'merge' | 'pr-only' | 'local-only';
export interface DeliveryPolicy {
  readonly mode: DeliveryMode;
  readonly reason: string;
}

/** Exceptions belong to the current reviewed task plan, never environment failures. */
export function deliveryPolicy(plan: string, task: string): DeliveryPolicy {
  const sections = [
    ...plan.matchAll(/^## Delivery\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm),
  ];
  if (sections.length === 0) return { mode: 'merge', reason: '' };
  if (sections.length !== 1) throw new Error('Duplicate Delivery sections.');
  const section = sections[0]?.[1] ?? '';
  const field = (name: string): string => {
    const values = [...section.matchAll(new RegExp(`^- ${name}: (.+)$`, 'gm'))];
    if (values.length !== 1)
      throw new Error(`Delivery requires exactly one ${name}.`);
    return values[0]?.[1]?.trim() ?? '';
  };
  if (field('Task') !== task)
    throw new Error('Delivery policy belongs to a different task.');
  const mode = field('Mode');
  if (mode !== 'merge' && mode !== 'pr-only' && mode !== 'local-only')
    throw new Error('Delivery Mode must be merge, pr-only or local-only.');
  const reason = mode === 'merge' ? '' : field('Reason');
  if (mode !== 'merge' && reason.length < 20)
    throw new Error(
      'An explicit user exception needs a substantive recorded reason.',
    );
  return { mode, reason };
}

export interface ReviewedPullRequest {
  readonly number: number;
  readonly branch: string;
  readonly head: string;
  readonly body: string;
  readonly base: string;
}

export function mergeReadiness(
  value: unknown,
  expected: ReviewedPullRequest,
): 'pending' | 'ready' {
  const pr = object(value);
  const identity = verifyPullRequest(
    pr,
    expected.branch,
    expected.head,
    expected.body,
  );
  if (
    identity.number !== expected.number ||
    object(pr.base).sha !== expected.base
  )
    throw new Error(
      'PR base or identity changed. Integrate main and repeat validation.',
    );
  if (pr.mergeable === false || pr.mergeable_state === 'dirty')
    throw new Error(
      'Merge conflict: resolve the conflicting files and repeat validation.',
    );
  if (pr.mergeable === null || pr.mergeable_state === 'unknown')
    return 'pending';
  if (pr.mergeable !== true || pr.mergeable_state !== 'clean')
    throw new Error(
      `Merge blocked: ${String(pr.mergeable_state)}. Task delivery is incomplete.`,
    );
  return 'ready';
}

export function mergedCommit(
  value: unknown,
  expected: ReviewedPullRequest,
): string {
  const pr = object(value);
  const identity = verifyPullRequest(
    pr,
    expected.branch,
    expected.head,
    expected.body,
    true,
  );
  if (
    identity.number !== expected.number ||
    typeof pr.merge_commit_sha !== 'string' ||
    !/^[a-f\d]{40}$/.test(pr.merge_commit_sha)
  )
    throw new Error('Merged PR identity or merge commit is invalid.');
  return pr.merge_commit_sha;
}

/** Recheck immediately before the SHA-guarded merge; never request an override. */
export async function mergeReviewedPullRequest(
  request: GithubRequest,
  expected: ReviewedPullRequest,
): Promise<string> {
  const path = `/pulls/${String(expected.number)}`;
  const pr = await request(path);
  if (mergeReadiness(pr, expected) !== 'ready')
    throw new Error(
      'Mergeability is unknown. Wait for GitHub and retry; task remains incomplete.',
    );
  const since = verifyPullRequest(
    pr,
    expected.branch,
    expected.head,
    expected.body,
  ).checksSince;
  const checks = await request(
    `/commits/${expected.head}/check-runs?filter=latest&per_page=100`,
  );
  if (inspectChecks(checks, expected.head, since) !== 'passed')
    throw new Error('Current required checks are not complete.');
  const current = await request(path);
  if (
    mergeReadiness(current, expected) !== 'ready' ||
    object(current).updated_at !== since
  )
    throw new Error('PR changed during merge preflight. Repeat verification.');
  const result = object(
    await request(`${path}/merge`, 'PUT', {
      sha: expected.head,
      merge_method: 'merge',
    }),
  );
  if (
    result.merged !== true ||
    typeof result.sha !== 'string' ||
    !/^[a-f\d]{40}$/.test(result.sha)
  )
    throw new Error(
      'GitHub refused or did not confirm the merge. Task delivery is incomplete.',
    );
  const confirmed = mergedCommit(await request(path), expected);
  if (confirmed !== result.sha)
    throw new Error('Merge response does not match the merged PR.');
  return confirmed;
}

/** Receipts supplement live verification; an open green PR cannot satisfy default delivery. */
export function verifyDeliveryReceipt(
  value: unknown,
  expected: {
    task: string;
    runId: string;
    sourceHash: string;
    head: string;
    plan: string;
    bodyHash: string;
    policy: DeliveryPolicy;
  },
): Record<string, unknown> {
  const receipt = object(value);
  for (const field of [
    'task',
    'runId',
    'sourceHash',
    'head',
    'plan',
    'bodyHash',
  ] as const)
    if (receipt[field] !== expected[field])
      throw new Error(`Stale delivery receipt: ${field}.`);
  if (
    receipt.mode !== expected.policy.mode ||
    receipt.reason !== expected.policy.reason
  )
    throw new Error(
      'Delivery receipt does not match the reviewed exception policy.',
    );
  const required = expected.policy.mode === 'merge' ? 'merged' : 'pr-only';
  if (receipt.status !== required)
    throw new Error(`Task is incomplete: delivery must be ${required}.`);
  return receipt;
}
