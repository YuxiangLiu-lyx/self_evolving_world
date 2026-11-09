import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkExperiments } from './experiments.js';
import { checkArchivePreservation, taskRoute } from './harness.js';
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
  if ((command !== 'run' && command !== 'review') || task === '') {
    throw new Error(
      'Usage: pnpm validate -- "task name" / pnpm task:review -- "same task name"',
    );
  }
  if (command === 'run') {
    mkdirSync(output, { recursive: true });
    // Invalidate old approvals before running anything that might fail/interrupted.
    rmSync(reviewPath, { force: true });
    rmSync(resolve(output, 'completion.json'), { force: true });
    rmSync(resolve(output, 'publication.json'), { force: true });
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
      if (process.env.WORLD_EXPERIMENT_CAPTURE !== undefined)
        throw new Error('Full validation cannot use experiment capture mode.');
      checkArchivePreservation(root);
      const route = taskRoute(root);
      report.route = route;
      console.log(
        `Harness route: ${route.kind}. ${route.kind === 'experiment' ? 'Validate recorded experiments, then run the complete regression and browser suite.' : 'Run the complete code, documentation and browser suite, including any recorded experiments.'}`,
      );
      if (route.kind !== 'code') {
        const ids = checkExperiments(root);
        if (route.experiments.some((id) => !ids.includes(id)))
          throw new Error('Recorded experiment directories cannot be deleted.');
      }
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
      checkExperiments(root);
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
        '\nAutomated validation passed; review is still required. Open playwright-report and every screenshot, complete validation-results/review.json, then run pnpm task:review -- "same task name".',
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
      reviewedAt: new Date().toISOString(),
    });
    console.log(
      `Local review passed: ${task}. Automated checks, visual, behavior and requirement reviews are complete; source and screenshot fingerprints match. Continue through task:publish and task:finish; local review alone never completes the task. Explicit local-only instructions use task:finish with the current plan.`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
