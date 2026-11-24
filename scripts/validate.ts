import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { experimentIds } from './experiments.js';
import {
  reconstructSelected,
  reconstructionWorker,
} from './validation-reconstruction.js';
import { checkAnalyses } from './experiment-review.js';
import { checkArchivePreservation, taskRoute } from './harness.js';
import {
  browserEvidence,
  readJson,
  type CheckResult,
  type Evidence,
  type ValidationReport,
} from './validation.js';
import { EvidenceCache } from './validation-cache.js';
import {
  browserInput,
  makePlan,
  selectedBrowserFiles,
} from './validation-plan.js';

const root = process.cwd(),
  output = resolve(root, 'validation-results'),
  reportPath = resolve(output, 'report.json');
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const audit = args.includes('--audit');
const write = (path: string, value: unknown): void => {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
};
mkdirSync(output, { recursive: true });
const report: ValidationReport = {
  version: 2,
  runId: randomUUID(),
  startedAt: new Date().toISOString(),
  status: 'running',
  browserTests: 0,
  evidence: [],
  checks: [],
};
const checks: CheckResult[] = report.checks;
write(reportPath, report);
try {
  if (process.env.WORLD_EXPERIMENT_CAPTURE !== undefined)
    throw new Error('Validation cannot use experiment capture mode.');
  const cache = new EvidenceCache(
    root,
    report.runId,
    process.env.CI === 'true' || audit,
  );
  process.env.WORLD_VALIDATION_RUN = report.runId;
  const plan = makePlan(root, audit);
  report.plan = plan;
  report.route = taskRoute(root, plan.base);
  const record = (id: string, reason: string, action: () => void): void => {
    const start = performance.now();
    try {
      action();
    } catch (error) {
      checks.push({
        id,
        reason,
        status: 'failed',
        durationMs: performance.now() - start,
        deepRebuilds: 0,
      });
      write(reportPath, report);
      throw error;
    }
    const durationMs = performance.now() - start;
    checks.push({ id, reason, status: 'passed', durationMs, deepRebuilds: 0 });
    console.log(
      JSON.stringify({
        check: id,
        reason,
        status: 'passed',
        durationMs: Math.round(durationMs),
      }),
    );
    write(reportPath, report);
  };
  const run = (script: string, extra: string[] = [], env = process.env) => {
    const result = spawnSync('pnpm', [script, ...extra], {
      cwd: root,
      stdio: 'inherit',
      env,
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`Selected check failed: ${script}`);
  };
  const skip = (id: string, reason: string): void => {
    checks.push({
      id,
      reason,
      status: 'not-applicable',
      durationMs: 0,
      deepRebuilds: 0,
    });
  };
  record('archive-preservation', plan.reasons.archives ?? '', () => {
    checkArchivePreservation(root, plan.base);
  });
  if (plan.code)
    for (const command of [
      'typecheck',
      'lint',
      'format:check',
      'architecture:check',
      'test',
    ])
      record(command, plan.reasons.code ?? '', () => {
        run(command);
      });
  else skip('code', plan.reasons.code ?? '');
  await reconstructSelected(plan.experiments, async (id) => {
    const started = performance.now();
    try {
      const metric = await reconstructionWorker(root, id, cache);
      const check = {
        ...metric,
        id: `experiment:${id}`,
        reason: plan.reasons[`experiment:${id}`] ?? '',
      };
      checks.push(check);
      console.log(JSON.stringify(check));
    } catch (error) {
      checks.push({
        id: `experiment:${id}`,
        reason: plan.reasons[`experiment:${id}`] ?? '',
        status: 'failed',
        durationMs: performance.now() - started,
        deepRebuilds: 0,
      });
      throw error;
    } finally {
      write(reportPath, report);
    }
  });
  for (const id of experimentIds(root))
    if (!plan.experiments.includes(id))
      skip(
        `experiment:${id}`,
        'Not applicable: preserved archive and unchanged protocol dependencies',
      );
  record('analysis', 'Companion analysis identities and bindings', () => {
    checkAnalyses(root);
  });
  const browser = plan.browserArchives.length || plan.browserGroups.length;
  if (plan.code || browser)
    record('build', 'Compile packages and the static viewer', () => {
      run('build');
    });
  if (browser) {
    const input = browserInput(root, plan),
      start = performance.now();
    const existing = cache.read<{ tests: number; evidence: Evidence[] }>(
      'browser',
      input,
    );
    if (existing) {
      report.browserTests = existing.value.tests;
      report.evidence = existing.value.evidence;
      checks.push({
        id: 'browser',
        reason: plan.reasons.browser ?? '',
        status: 'reused',
        input,
        durationMs: performance.now() - start,
        deepRebuilds: 0,
        originRun: existing.originRun,
      });
    } else {
      rmSync(resolve(root, 'test-results/browser-validation.json'), {
        force: true,
      });
      run('exec', ['playwright', 'test', ...selectedBrowserFiles(root, plan)], {
        ...process.env,
        WORLD_BROWSER_SELECTION: JSON.stringify({
          groups: plan.browserGroups,
          archives: plan.browserArchives,
        }),
      });
      const result = browserEvidence(
        root,
        readJson(resolve(root, 'test-results/browser-validation.json')),
        plan,
      );
      const directory = resolve(output, 'evidence', report.runId);
      mkdirSync(directory, { recursive: true });
      report.evidence = result.evidence.map((e) => {
        const destination = resolve(directory, `${e.id}.png`);
        copyFileSync(resolve(root, e.path), destination);
        return { ...e, path: relative(root, destination) };
      });
      report.browserTests = result.tests;
      cache.write(
        'browser',
        input,
        { tests: report.browserTests, evidence: report.evidence },
        performance.now() - start,
        Object.fromEntries(report.evidence.map((e) => [e.path, e.sha256])),
      );
      checks.push({
        id: 'browser',
        reason: plan.reasons.browser ?? '',
        status: 'passed',
        input,
        durationMs: performance.now() - start,
        deepRebuilds: 0,
        originRun: report.runId,
      });
    }
  } else skip('browser', plan.reasons.browser ?? '');
  record('docs:check', 'Documentation links and structure', () => {
    run('docs:check');
  });
  if (!plan.code)
    record('format:check', 'Formatting for documentation and data', () => {
      run('format:check');
    });
  report.status = 'passed';
  write(reportPath, report);
  console.log(
    JSON.stringify({
      plan: { ...plan, files: plan.files.length },
      checks: checks.map(({ id, status }) => `${id}:${status}`),
      browserTests: report.browserTests,
    }),
  );
  if (report.evidence.length)
    console.log(
      `Selected checks passed. Look at the screenshots for changed viewer scenes in validation-results/evidence/${report.runId}/ (or the reused run ${String(checks.find((c) => c.id === 'browser')?.originRun)}).`,
    );
  else console.log('Selected checks passed.');
} catch (error) {
  report.status = 'failed';
  report.error = error instanceof Error ? error.message : String(error);
  write(reportPath, report);
  console.error(report.error);
  process.exitCode = 1;
}
