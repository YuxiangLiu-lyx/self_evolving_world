import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const REVIEW_SCENES = [
  'desktop',
  'mobile',
  'agent-vision',
  'after-actions',
  'history',
] as const;
export type ReviewScene = (typeof REVIEW_SCENES)[number];

export interface Evidence {
  readonly id: ReviewScene;
  readonly path: string;
  readonly sha256: string;
}

export interface ValidationReport {
  readonly version: 1;
  readonly runId: string;
  readonly task: string;
  sourceHash: string;
  readonly startedAt: string;
  readonly url: string;
  status: 'running' | 'failed' | 'awaiting-review' | 'passed';
  browserTests: number;
  evidence: Evidence[];
  error?: string;
}

const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.pnpm-store',
  'test-results',
  'playwright-report',
  'validation-results',
]);

export function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Includes untracked source and docs; no dependency on an existing Git commit. */
export function sourceFingerprint(root: string): string {
  const hash = createHash('sha256');
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name, 'en'),
    )) {
      if (
        ignoredDirectories.has(entry.name) ||
        entry.name === '.DS_Store' ||
        entry.name.endsWith('.tsbuildinfo') ||
        (entry.name.startsWith('.env') && entry.name !== '.env.example')
      )
        continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        hash.update(relative(root, path).split(sep).join('/'));
        hash.update('\0');
        hash.update(hashFile(path));
        hash.update('\0');
      } else {
        throw new Error(
          `Validation cannot fingerprint a source symlink: ${path}`,
        );
      }
    }
  };
  visit(root);
  return hash.digest('hex');
}

export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a JSON object.');
  }
  return value as Record<string, unknown>;
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function artifactPath(root: string, path: unknown): string {
  if (!nonempty(path) || isAbsolute(path))
    throw new Error('Invalid evidence path.');
  const resolved = resolve(root, path);
  const part = relative(resolve(root, 'test-results'), resolved);
  if (part === '..' || part.startsWith(`..${sep}`) || isAbsolute(part)) {
    throw new Error('Screenshot evidence must stay inside test-results.');
  }
  if (!statSync(resolved).isFile())
    throw new Error('Missing screenshot evidence.');
  return resolved;
}

export function browserEvidence(
  root: string,
  value: unknown,
): {
  tests: number;
  evidence: Evidence[];
} {
  const report = object(value);
  if (
    report.status !== 'passed' ||
    !Number.isSafeInteger(report.tests) ||
    typeof report.tests !== 'number' ||
    report.tests < 1 ||
    report.failures !== 0
  ) {
    throw new Error('Browser validation failed, was skipped, or did not run.');
  }
  if (!Array.isArray(report.screenshots))
    throw new Error('Missing screenshots.');
  const screenshots = report.screenshots.map(object);
  const evidence = REVIEW_SCENES.map((id) => {
    const matches = screenshots.filter((entry) => entry.id === id);
    const shot = matches[0];
    if (matches.length !== 1 || shot === undefined || !nonempty(shot.path)) {
      throw new Error(`Expected exactly one screenshot for ${id}.`);
    }
    const path = artifactPath(root, shot.path);
    // A non-empty file alone is insufficient: reject non-PNG placeholders.
    if (
      !readFileSync(path)
        .subarray(0, 8)
        .equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    ) {
      throw new Error(`Invalid PNG evidence: ${id}`);
    }
    return { id, path: shot.path, sha256: hashFile(path) };
  });
  return { tests: report.tests, evidence };
}

/** Structural completion gate; an honest visual judgment still requires looking. */
export function completionErrors(
  root: string,
  task: string,
  rawReport: unknown,
  rawReview: unknown,
): string[] {
  try {
    const report = object(rawReport);
    const review = object(rawReview);
    const errors: string[] = [];
    if (
      report.version !== 1 ||
      !nonempty(report.runId) ||
      report.task !== task ||
      !nonempty(task)
    ) {
      errors.push(
        'Report does not belong to this task. Run pnpm validate with the task name.',
      );
    }
    if (report.status !== 'awaiting-review' && report.status !== 'passed') {
      errors.push('Full automated validation has not passed.');
    }
    if (
      typeof report.browserTests !== 'number' ||
      !Number.isSafeInteger(report.browserTests) ||
      report.browserTests < 1
    )
      errors.push('Missing successful browser tests.');
    if (report.sourceHash !== sourceFingerprint(root))
      errors.push('Source changed after validation. Rerun pnpm validate.');
    if (review.runId !== report.runId || !nonempty(review.reviewer))
      errors.push('Missing reviewer or review belongs to an older run.');
    if (!Array.isArray(report.evidence) || !Array.isArray(review.visual))
      throw new Error('Missing visual evidence/review.');
    const evidence = report.evidence.map(object);
    const visual = review.visual.map(object);
    if (
      evidence.length !== REVIEW_SCENES.length ||
      visual.length !== REVIEW_SCENES.length
    )
      errors.push('Every required screenshot must be reviewed.');
    for (const id of REVIEW_SCENES) {
      const shots = evidence.filter((entry) => entry.id === id);
      const reviews = visual.filter((entry) => entry.id === id);
      const shot = shots[0];
      const item = reviews[0];
      if (
        shots.length !== 1 ||
        shot === undefined ||
        hashFile(artifactPath(root, shot.path)) !== shot.sha256
      ) {
        errors.push(`Missing or changed screenshot: ${id}`);
      }
      if (
        reviews.length !== 1 ||
        item?.verdict !== 'pass' ||
        !nonempty(item.notes)
      )
        errors.push(`Visual review not passed: ${id}`);
    }
    const behavior = object(review.behavior);
    if (behavior.verdict !== 'pass' || !nonempty(behavior.notes))
      errors.push('Behavior review has not passed.');
    return errors;
  } catch (error) {
    return [
      `Incomplete validation evidence: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
}
