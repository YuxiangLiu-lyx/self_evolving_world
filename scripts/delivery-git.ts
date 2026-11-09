import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deliveryPolicy, type DeliveryPolicy } from './delivery.js';
import { taskRoute } from './harness.js';

export function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** merge-tree writes Git objects, never the index or working files. */
export function checkMergeCompatibility(
  root: string,
  base = 'origin/main',
  head = 'HEAD',
): string {
  const baseline = git(root, 'rev-parse', '--verify', `${base}^{commit}`);
  const revision = git(root, 'rev-parse', '--verify', `${head}^{commit}`);
  const merge = spawnSync(
    'git',
    ['merge-tree', '--write-tree', baseline, revision],
    { cwd: root, encoding: 'utf8' },
  );
  if (merge.error) throw merge.error;
  if (merge.status === 1)
    throw new Error(`Merge conflict against ${base}:\n${merge.stdout}`);
  if (merge.status !== 0)
    throw new Error(
      'Unable to check merge conflicts. Task remains incomplete.',
    );
  const ancestor = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', baseline, revision],
    { cwd: root },
  );
  if (ancestor.status !== 0)
    throw new Error(
      'Branch is behind main. Integrate main and repeat full validation/review before delivery.',
    );
  return baseline;
}

export function currentDeliveryPolicy(
  root: string,
  path: string,
  task: string,
  base = 'origin/main',
): DeliveryPolicy {
  if (
    !/^docs\/exec-plans\/(active|completed)\/pr-\d{2,}-[a-z0-9-]+\.md$/.test(
      path,
    ) ||
    !taskRoute(root, base).files.includes(path)
  )
    throw new Error(
      'Delivery requires the current changed task plan, not an unrelated historical exception.',
    );
  return deliveryPolicy(readFileSync(resolve(root, path), 'utf8'), task);
}

export function verifyIntegrated(
  root: string,
  head: string,
  merge: string,
): void {
  for (const revision of [head, merge]) {
    if (!/^[a-f\d]{40}$/.test(revision))
      throw new Error('Invalid integration commit.');
    const result = spawnSync(
      'git',
      ['merge-base', '--is-ancestor', revision, 'origin/main'],
      { cwd: root },
    );
    if (result.status !== 0)
      throw new Error(
        'Merged content is not verified in origin/main. Task remains incomplete.',
      );
  }
}
