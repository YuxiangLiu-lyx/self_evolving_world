import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { browserEvidence, hashFile, REVIEW_SCENES } from './validation.js';

describe('browser screenshot evidence', () => {
  let root: string;
  let report: { evidence: { id: string; path: string; sha256: string }[] };
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'world-validation-'));
    mkdirSync(join(root, 'test-results'));
    for (const id of REVIEW_SCENES)
      writeFileSync(
        join(root, `test-results/${id}.png`),
        Buffer.from('89504e470d0a1a0a0102', 'hex'),
      );
    report = {
      evidence: REVIEW_SCENES.map((id) => ({
        id,
        path: `test-results/${id}.png`,
        sha256: hashFile(join(root, `test-results/${id}.png`)),
      })),
    };
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
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
