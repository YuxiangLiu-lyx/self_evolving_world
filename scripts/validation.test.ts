import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  browserEvidence,
  completionErrors,
  hashFile,
  REVIEW_SCENES,
  sourceFingerprint,
  type ValidationReport,
} from './validation.js';

describe('task completion evidence', () => {
  let root: string;
  let report: ValidationReport;
  let review: {
    runId: string;
    reviewer: string;
    visual: { id: string; verdict: string; notes: string }[];
    behavior: { verdict: string; notes: string };
    requirements: { verdict: string; notes: string };
  };
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'world-validation-'));
    mkdirSync(join(root, 'test-results'));
    mkdirSync(join(root, 'validation-results'));
    writeFileSync(join(root, 'world.ts'), 'source');
    for (const id of REVIEW_SCENES)
      writeFileSync(
        join(root, `test-results/${id}.png`),
        Buffer.from('89504e470d0a1a0a0102', 'hex'),
      );
    report = {
      version: 1,
      task: 'fixture task',
      runId: 'run-1',
      startedAt: '2026-11-06T00:00:00Z',
      url: 'http://127.0.0.1:4173/',
      sourceHash: sourceFingerprint(root),
      status: 'awaiting-review',
      browserTests: 7,
      evidence: REVIEW_SCENES.map((id) => ({
        id,
        path: `test-results/${id}.png`,
        sha256: hashFile(join(root, `test-results/${id}.png`)),
      })),
    };
    review = {
      runId: 'run-1',
      reviewer: 'fixture reviewer',
      visual: REVIEW_SCENES.map((id) => ({
        id,
        verdict: 'pass',
        notes: 'Fixture notes',
      })),
      behavior: { verdict: 'pass', notes: 'Fixture behavior observations' },
      requirements: {
        verdict: 'pass',
        notes: 'Fixture requirement and diff review',
      },
    };
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const check = (): string[] =>
    completionErrors(root, 'fixture task', report, review);

  it('accepts a fresh full run with individual visual and behavior reviews', () => {
    expect(check()).toEqual([]);
  });
  it.each(['running', 'failed'] as const)(
    'rejects an automated run that is %s',
    (status) => {
      report.status = status;
      expect(check().join()).toContain('has not passed');
    },
  );
  it('rejects a report from another task and a review from another run', () => {
    expect(completionErrors(root, 'new task', report, review).join()).toContain(
      'this task',
    );
    review.runId = 'older-run';
    expect(check().join()).toContain('older run');
  });
  it.each(['world.ts', 'new-source.ts', 'README.md'])(
    'rejects changed or newly added %s even without Git',
    (path) => {
      writeFileSync(join(root, path), 'changed');
      expect(check().join()).toContain('Source changed');
    },
  );
  it('ignores generated review files without ignoring source changes', () => {
    writeFileSync(join(root, 'validation-results/review.json'), '{}');
    expect(check()).toEqual([]);
  });
  it('rejects deleted source', () => {
    rmSync(join(root, 'world.ts'));
    expect(check().join()).toContain('Source changed');
  });
  it('rejects missing, pending and failed visual reviews', () => {
    review.visual.pop();
    expect(check().join()).toContain('history');
    review.visual = REVIEW_SCENES.map((id) => ({
      id,
      verdict: 'pending',
      notes: '',
    }));
    expect(check().join()).toContain('desktop');
    review.visual = REVIEW_SCENES.map((id) => ({
      id,
      verdict: 'fail',
      notes: 'Overlapping controls',
    }));
    expect(check().join()).toContain('desktop');
  });
  it('rejects a missing reviewer, absent notes and a failed behavior review', () => {
    review.reviewer = '';
    review.behavior = { verdict: 'fail', notes: 'Unexpected teleport' };
    review.visual = REVIEW_SCENES.map((id) => ({
      id,
      verdict: 'pass',
      notes: ' ',
    }));
    expect(check().join()).toContain('Missing reviewer');
    expect(check().join()).toContain('Behavior review');
    expect(check().join()).toContain('desktop');
  });
  it('rejects an absent, pending, failed or empty requirement review', () => {
    expect(
      completionErrors(root, 'fixture task', report, {
        ...review,
        requirements: undefined,
      }).join(),
    ).toContain('Incomplete');
    for (const verdict of ['pending', 'fail']) {
      review.requirements = { verdict, notes: 'Requirement mismatch remains' };
      expect(check().join()).toContain('Requirement and full-diff review');
    }
    review.requirements = { verdict: 'pass', notes: ' ' };
    expect(check().join()).toContain('Requirement and full-diff review');
  });
  it('rejects altered and deleted screenshot evidence', () => {
    writeFileSync(join(root, 'test-results/desktop.png'), 'different pixels');
    expect(check().join()).toContain('changed screenshot');
    rmSync(join(root, 'test-results/desktop.png'));
    expect(check().join()).toContain('Incomplete validation evidence');
  });
  it('rejects malformed reports', () => {
    expect(completionErrors(root, 'fixture task', null, {}).join()).toContain(
      'Incomplete',
    );
  });
  it('requires successful browser results and one real PNG per required scene', () => {
    const browser = {
      status: 'passed',
      tests: 7,
      failures: 0,
      screenshots: report.evidence,
    };
    expect(browserEvidence(root, browser).evidence).toEqual(report.evidence);
    expect(() => browserEvidence(root, { ...browser, failures: 1 })).toThrow(
      'failed',
    );
    expect(() => browserEvidence(root, { ...browser, tests: 0 })).toThrow(
      'did not run',
    );
    expect(() =>
      browserEvidence(root, { ...browser, status: 'failed' }),
    ).toThrow('failed');
    expect(() =>
      browserEvidence(root, { ...browser, screenshots: [] }),
    ).toThrow('desktop');
    expect(() =>
      browserEvidence(root, {
        ...browser,
        screenshots: [...report.evidence, ...report.evidence],
      }),
    ).toThrow('desktop');
    writeFileSync(join(root, 'test-results/desktop.png'), 'not an image');
    expect(() => browserEvidence(root, browser)).toThrow('Invalid PNG');
  });
});
