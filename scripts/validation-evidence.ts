import { EvidenceCache } from './validation-cache.js';
import { browserInput, makePlan, type CheckPlan } from './validation-plan.js';
import { experimentFingerprint } from './experiments.js';
import type { ValidationReport } from './validation.js';

export interface CheckResult {
  id: string;
  reason: string;
  status: 'passed' | 'reused' | 'not-applicable' | 'failed';
  durationMs: number;
  deepRebuilds: number;
  input?: string;
  originRun?: string;
}
const payload = (report: ValidationReport) => ({
  runId: report.runId,
  task: report.task,
  sourceHash: report.sourceHash,
  browserTests: report.browserTests,
  evidence: report.evidence,
  plan: report.plan,
  checks: report.checks,
});
export function sealValidationReport(
  root: string,
  report: ValidationReport,
): void {
  new EvidenceCache(root, report.runId).write(
    `validation:${report.runId}`,
    report.sourceHash,
    payload(report),
    0,
  );
}
export function verifyValidationReport(
  root: string,
  report: ValidationReport,
): void {
  const cache = new EvidenceCache(root, report.runId);
  const receipt = cache.read(`validation:${report.runId}`, report.sourceHash);
  if (
    !receipt ||
    JSON.stringify(receipt.value) !== JSON.stringify(payload(report))
  )
    throw new Error(
      'Missing, failed, stale or untrusted validation receipt. Rerun selected checks.',
    );
  if (!report.plan) return; // Signed legacy-shaped fixtures; unsigned old reports never qualify.
  const plan: CheckPlan = makePlan(root, report.plan.audit, report.plan.base);
  if (JSON.stringify(plan) !== JSON.stringify(report.plan))
    throw new Error('Check scope changed; recompute the validation plan.');
  for (const id of plan.experiments) {
    const input = experimentFingerprint(root, id);
    if (!cache.read(`experiment:${id}`, input))
      throw new Error(`Missing or changed reconstruction receipt: ${id}`);
  }
  if (plan.browserGroups.length || plan.browserArchives.length) {
    if (!cache.read('browser', browserInput(root, plan)))
      throw new Error('Missing or changed browser receipt.');
  }
}
