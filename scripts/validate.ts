import { requireTaskWorker } from './task-worker.js';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { relative, resolve } from 'node:path';
import {
  experimentIds,
  reconstructionMetrics,
  validateExperiment,
} from './experiments.js';
import { checkAnalyses } from './experiment-review.js';
import { checkArchivePreservation, taskRoute } from './harness.js';
import {
  browserEvidence,
  completionErrors,
  object,
  readJson,
  sourceFingerprint,
  type Evidence,
  type ValidationReport,
} from './validation.js';
import { EvidenceCache } from './validation-cache.js';
import {
  browserInput,
  makePlan,
  selectedBrowserFiles,
} from './validation-plan.js';
import { sealValidationReport } from './validation-evidence.js';

const root = process.cwd(),
  output = resolve(root, 'validation-results'),
  reportPath = resolve(output, 'report.json'),
  reviewPath = resolve(output, 'review.json');
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const [command, ...taskParts] = args,
  audit = taskParts.includes('--audit');
const task = taskParts
  .filter((p) => p !== '--audit')
  .join(' ')
  .trim();
const write = (path: string, value: unknown): void => {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
};
try {
  if ((command !== 'run' && command !== 'review') || !task)
    throw new Error('Usage: pnpm validate -- [--audit] "task name"');
  if (command === 'review') {
    requireTaskWorker(root, 'review', [task]);
    const report = readJson(reportPath),
      review = readJson(reviewPath);
    const errors = completionErrors(root, task, report, review);
    if (errors.length) throw new Error(errors.join('\n'));
    const r = object(report);
    // Save actual accepted judgments, never manufacture them when reusing pixels.
    const cache = new EvidenceCache(root, String(r.runId));
    for (const item of object(review).visual as {
      id: string;
      verdict: string;
      notes: string;
    }[]) {
      const shot = (r.evidence as Evidence[]).find((e) => e.id === item.id);
      if (shot)
        cache.write(
          `visual:${item.id}`,
          `${String((r.checks as { id: string; input?: string }[] | undefined)?.find((c) => c.id === 'browser')?.input)}:${shot.sha256}`,
          { ...item, reviewer: object(review).reviewer, runId: r.runId },
          0,
        );
    }
    write(reportPath, {
      ...r,
      status: 'passed',
      reviewedAt: new Date().toISOString(),
    });
    console.log(
      'Selected checks and actual review passed. Continue through the coordinator for current-head PR gates and integration.',
    );
  } else {
    mkdirSync(output, { recursive: true });
    for (const file of ['review.json', 'completion.json', 'publication.json'])
      rmSync(resolve(output, file), { force: true });
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
      checks: [],
    };
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
      report.sourceHash = sourceFingerprint(root);
      const record = (id: string, reason: string, action: () => void): void => {
        const start = performance.now();
        try {
          action();
        } catch (error) {
          report.checks?.push({
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
        report.checks?.push({
          id,
          reason,
          status: 'passed',
          durationMs,
          deepRebuilds: 0,
        });
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
      const run = (
        script: string,
        extra: string[] = [],
        env = process.env,
      ): void => {
        const result = spawnSync('pnpm', [script, ...extra], {
          cwd: root,
          stdio: 'inherit',
          env,
        });
        if (result.error) throw result.error;
        if (result.status !== 0)
          throw new Error(`Selected check failed: ${script}`);
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
      else
        report.checks?.push({
          id: 'code',
          reason: plan.reasons.code ?? '',
          status: 'not-applicable',
          durationMs: 0,
          deepRebuilds: 0,
        });
      for (const id of experimentIds(root)) {
        if (plan.experiments.includes(id)) {
          const attemptStarted = performance.now();
          try {
            validateExperiment(root, id);
          } catch (error) {
            report.checks?.push({
              id: `experiment:${id}`,
              reason: plan.reasons[`experiment:${id}`] ?? '',
              status: 'failed',
              durationMs: performance.now() - attemptStarted,
              deepRebuilds: 1,
            });
            write(reportPath, report);
            throw error;
          }
          const metric = reconstructionMetrics().at(-1);
          if (!metric) throw new Error('Missing reconstruction measurement.');
          const check = {
            ...metric,
            id: `experiment:${id}`,
            reason: plan.reasons[`experiment:${id}`] ?? '',
          };
          report.checks?.push(check);
          console.log(JSON.stringify(check));
          write(reportPath, report);
        } else
          report.checks?.push({
            id: `experiment:${id}`,
            reason:
              'Not applicable: preserved archive and unchanged protocol dependencies',
            status: 'not-applicable',
            durationMs: 0,
            deepRebuilds: 0,
          });
      }
      record(
        'analysis',
        'Check companion identities, artifact bindings and prose pairs without replaying worlds',
        () => {
          checkAnalyses(root);
        },
      );
      if (
        plan.code ||
        plan.browserArchives.length ||
        plan.browserGroups.length
      ) {
        record(
          'build',
          'Compile selected delivery and public assets; integrity reads never reconstruct archives',
          () => {
            run('build');
          },
        );
        record('demo:check', 'Check compiled CLI behavior', () => {
          run('demo:check');
        });
      }
      if (plan.browserArchives.length || plan.browserGroups.length) {
        const input = browserInput(root, plan),
          start = performance.now();
        const existing = cache.read<{ tests: number; evidence: Evidence[] }>(
          'browser',
          input,
        );
        if (existing) {
          report.browserTests = existing.value.tests;
          report.evidence = existing.value.evidence;
          report.checks?.push({
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
          run(
            'exec',
            ['playwright', 'test', ...selectedBrowserFiles(root, plan)],
            {
              ...process.env,
              WORLD_BROWSER_SELECTION: JSON.stringify({
                groups: plan.browserGroups,
                archives: plan.browserArchives,
              }),
            },
          );
          const browser = browserEvidence(
            root,
            readJson(resolve(root, 'test-results/browser-validation.json')),
            plan,
          );
          const directory = resolve(output, 'evidence', report.runId);
          mkdirSync(directory, { recursive: true });
          report.evidence = browser.evidence.map((e) => {
            const destination = resolve(directory, `${e.id}.png`);
            copyFileSync(resolve(root, e.path), destination);
            return { ...e, path: relative(root, destination) };
          });
          report.browserTests = browser.tests;
          cache.write(
            'browser',
            input,
            { tests: report.browserTests, evidence: report.evidence },
            performance.now() - start,
            Object.fromEntries(report.evidence.map((e) => [e.path, e.sha256])),
          );
          report.checks?.push({
            id: 'browser',
            reason: plan.reasons.browser ?? '',
            status: 'passed',
            input,
            durationMs: performance.now() - start,
            deepRebuilds: 0,
            originRun: report.runId,
          });
        }
      } else
        report.checks?.push({
          id: 'browser',
          reason: plan.reasons.browser ?? '',
          status: 'not-applicable',
          durationMs: 0,
          deepRebuilds: 0,
        });
      record(
        'reconstruction-ledger',
        'Check once-per-input reconstruction across parent and browser workers',
        () => {
          const path = resolve(output, 'rebuilds', `${report.runId}.jsonl`);
          if (!existsSync(path)) return;
          const calls = readFileSync(path, 'utf8')
            .trim()
            .split('\n')
            .map(
              (line) =>
                JSON.parse(line) as {
                  id: string;
                  input: string;
                  deepRebuilds: number;
                  status: string;
                },
            );
          const totals = new Map<string, number>();
          for (const call of calls) {
            const key = `${call.id}:${call.input}`;
            totals.set(key, (totals.get(key) ?? 0) + call.deepRebuilds);
            if ((totals.get(key) ?? 0) > 1)
              throw new Error(
                `Repeated deep reconstruction in one validation: ${call.id}`,
              );
          }
          console.log(
            JSON.stringify({
              reconstructionCalls: calls.length,
              reusedReferences: calls.filter((c) => c.status === 'reused')
                .length,
              deepRebuilds: [...totals.values()].reduce((a, b) => a + b, 0),
            }),
          );
        },
      );
      record(
        'docs:check',
        'Current documentation links, structure and policy',
        () => {
          run('docs:check');
        },
      );
      if (!plan.code)
        record(
          'format:check',
          'Formatting for documentation and data changes',
          () => {
            run('format:check');
          },
        );
      if (sourceFingerprint(root) !== report.sourceHash)
        throw new Error(
          'Inputs changed during validation. Rerun affected checks.',
        );
      report.status = 'awaiting-review';
      sealValidationReport(root, report);
      write(reportPath, report);
      write(reviewPath, {
        runId: report.runId,
        reviewer: '',
        visual: report.evidence.map(({ id, path, sha256 }) => {
          const previous = cache.read<{
            notes: string;
            reviewer: string;
            runId: string;
          }>(
            `visual:${id}`,
            `${String(report.checks?.find((c) => c.id === 'browser')?.input)}:${sha256}`,
          );
          return {
            id,
            path,
            verdict: previous ? 'pass' : 'pending',
            notes: previous
              ? `Reused actual review from ${previous.value.runId} by ${previous.value.reviewer}; identical dependency-bound pixels (${sha256}). ${previous.value.notes}`
              : '',
          };
        }),
        behavior: { verdict: 'pending', notes: '' },
        requirements: { verdict: 'pending', notes: '' },
      });
      console.log(
        JSON.stringify({
          plan,
          checks: report.checks,
          browserTests: report.browserTests,
          deepRebuilds: report.checks?.reduce((n, c) => n + c.deepRebuilds, 0),
        }),
      );
      console.log(
        'Selected automated checks passed. Inspect new selected screenshots, verify reused evidence provenance, and review the complete changed-file diff through the coordinator.',
      );
    } catch (error) {
      report.status = 'failed';
      report.error = error instanceof Error ? error.message : String(error);
      write(reportPath, report);
      throw error;
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
