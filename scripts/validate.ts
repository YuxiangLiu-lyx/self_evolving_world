import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  browserEvidence,
  completionErrors,
  object,
  readJson,
  sourceFingerprint,
  type ValidationReport,
} from './validation.js';

const root = process.cwd();
const output = resolve(root, 'validation-results');
const reportPath = resolve(output, 'report.json');
const reviewPath = resolve(output, 'review.json');
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const [command, ...taskParts] = args;
const task = taskParts.join(' ').trim();
function write(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

try {
  if ((command !== 'run' && command !== 'finish') || task === '') {
    throw new Error(
      'Usage: pnpm validate -- "task name" / pnpm task:finish -- "same task name"',
    );
  }
  if (command === 'run') {
    mkdirSync(output, { recursive: true });
    // Invalidate old approvals before running anything that might fail/interrupted.
    rmSync(reviewPath, { force: true });
    rmSync(resolve(root, 'test-results/browser-validation.json'), {
      force: true,
    });
    const report: ValidationReport = {
      version: 1,
      runId: randomUUID(),
      task,
      sourceHash: '',
      startedAt: new Date().toISOString(),
      url: 'http://127.0.0.1:4173/',
      status: 'running',
      browserTests: 0,
      evidence: [],
    };
    write(reportPath, report);
    try {
      const fingerprint = sourceFingerprint(root);
      report.sourceHash = fingerprint;
      write(reportPath, report);
      const result = spawnSync('pnpm', ['check'], {
        cwd: root,
        stdio: 'inherit',
      });
      if (result.error !== undefined) throw result.error;
      if (result.status !== 0)
        throw new Error(
          'pnpm check did not pass. Fix the failure and rerun validation.',
        );
      if (sourceFingerprint(root) !== fingerprint)
        throw new Error('Files changed during validation. Rerun validation.');
      const browser = browserEvidence(
        root,
        readJson(resolve(root, 'test-results/browser-validation.json')),
      );
      report.browserTests = browser.tests;
      report.evidence = browser.evidence;
      report.status = 'awaiting-review';
      write(reportPath, report);
      write(reviewPath, {
        runId: report.runId,
        reviewer: '',
        visual: report.evidence.map(({ id, path }) => ({
          id,
          path,
          verdict: 'pending',
          notes: '',
        })),
        behavior: { verdict: 'pending', notes: '' },
        requirements: { verdict: 'pending', notes: '' },
      });
      console.log(
        '\nAutomated validation passed; review is still required. Open playwright-report and every screenshot, complete validation-results/review.json, then run pnpm task:finish -- "same task name".',
      );
    } catch (error) {
      report.status = 'failed';
      report.error = error instanceof Error ? error.message : String(error);
      write(reportPath, report);
      throw error;
    }
  } else {
    const report = readJson(reportPath);
    const review = readJson(reviewPath);
    const errors = completionErrors(root, task, report, review);
    if (errors.length > 0) throw new Error(errors.join('\n'));
    write(reportPath, {
      ...object(report),
      status: 'passed',
      completedAt: new Date().toISOString(),
    });
    console.log(
      `Task validation passed: ${task}. Automated checks, visual, behavior and requirement reviews are complete; source and screenshot fingerprints match.`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
