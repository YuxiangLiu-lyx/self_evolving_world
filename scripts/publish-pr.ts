import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { githubRequest, REPOSITORY } from './github.js';
import { object } from './validation.js';

/** Push the current branch, create or update its PR, and optionally merge once CI is green. */
const root = process.cwd();
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const merge = args.includes('--merge');
const [bodyFile, title] = args.filter((arg) => arg !== '--merge');
const REQUIRED = ['quality', 'pr-policy'];
const git = (...parts: string[]): string =>
  execFileSync('git', parts, { cwd: root, encoding: 'utf8' }).trim();
const sleep = (ms: number) =>
  new Promise<void>((done) => {
    setTimeout(done, ms);
  });

try {
  if (!bodyFile || !title)
    throw new Error('Usage: pnpm pr -- body.md "PR title" [--merge]');
  const branch = git('branch', '--show-current');
  if (!branch || branch === 'main')
    throw new Error('Publish from a focused branch, never main.');
  if (git('status', '--porcelain') !== '')
    throw new Error('Commit or stash changes before publishing.');
  const check = spawnSync(
    'pnpm',
    ['exec', 'tsx', 'scripts/check-pr.ts', bodyFile],
    { cwd: root, stdio: 'inherit' },
  );
  if (check.status !== 0) throw new Error('Fix the PR description first.');
  const body = readFileSync(resolve(root, bodyFile), 'utf8');
  execFileSync('git', ['push', '--set-upstream', 'origin', branch], {
    cwd: root,
    stdio: 'inherit',
  });
  const head = git('rev-parse', 'HEAD');
  const request = githubRequest(root);
  const owner = REPOSITORY.split('/')[0] ?? '';
  const open = await request(
    `/pulls?state=open&base=main&head=${encodeURIComponent(`${owner}:${branch}`)}`,
  );
  const existing: unknown = Array.isArray(open) ? open[0] : undefined;
  const pr = object(
    existing
      ? await request(`/pulls/${String(object(existing).number)}`, 'PATCH', {
          title,
          body,
        })
      : await request('/pulls', 'POST', {
          title,
          body,
          head: branch,
          base: 'main',
        }),
  );
  const number = Number(pr.number);
  console.log(`PR #${String(number)}: ${String(pr.html_url)}`);
  if (merge) {
    const deadline = Date.now() + 40 * 60_000;
    for (;;) {
      const runs = object(
        await request(`/commits/${head}/check-runs?per_page=100`),
      ).check_runs;
      const latest = new Map<string, Record<string, unknown>>();
      for (const run of Array.isArray(runs) ? runs.map(object) : [])
        if (typeof run.name === 'string' && !latest.has(run.name))
          latest.set(run.name, run);
      const states = REQUIRED.map((name) => latest.get(name));
      const failed = states.find(
        (run) => run?.status === 'completed' && run.conclusion !== 'success',
      );
      if (failed)
        throw new Error(
          `Required check ${String(failed.name)} concluded ${String(failed.conclusion)}: ${String(failed.html_url)}`,
        );
      if (states.every((run) => run?.conclusion === 'success')) break;
      if (Date.now() > deadline)
        throw new Error(
          'Required checks did not finish in 40 minutes; rerun with --merge later.',
        );
      console.log(
        `Waiting for ${REQUIRED.map((name, i) => {
          const status = states[i]?.status;
          return `${name}=${typeof status === 'string' ? status : 'queued'}`;
        }).join(', ')}`,
      );
      await sleep(30_000);
    }
    const merged = object(
      await request(`/pulls/${String(number)}/merge`, 'PUT', {
        sha: head,
        merge_method: 'merge',
      }),
    );
    if (merged.merged !== true) throw new Error('GitHub did not merge the PR.');
    console.log(`Merged #${String(number)} as ${String(merged.sha)}.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
