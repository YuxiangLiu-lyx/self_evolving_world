import { mkdirSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import type {
  FullResult,
  Reporter,
  TestCase,
  TestError,
  TestResult,
} from '@playwright/test/reporter';

/** Rejects skips/expected failures too: task completion requires every check. */
export default class BrowserReporter implements Reporter {
  private tests = 0;
  private failures = 0;
  private readonly screenshots: { id: string; path: string }[] = [];
  private readonly errors: string[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    this.tests += 1;
    if (result.status !== 'passed' || test.expectedStatus !== 'passed')
      this.failures += 1;
    for (const attachment of result.attachments) {
      if (
        attachment.name.startsWith('review:') &&
        attachment.path !== undefined
      ) {
        this.screenshots.push({
          id: attachment.name.slice('review:'.length),
          path: relative(process.cwd(), attachment.path),
        });
      }
    }
  }

  onError(error: TestError): void {
    this.failures += 1;
    this.errors.push(error.message ?? 'Unknown Playwright error');
  }

  onEnd(result: FullResult): void {
    mkdirSync('test-results', { recursive: true });
    writeFileSync(
      'test-results/browser-validation.json',
      JSON.stringify(
        {
          status: result.status,
          tests: this.tests,
          failures: this.failures,
          errors: this.errors,
          screenshots: this.screenshots,
        },
        null,
        2,
      ) + '\n',
    );
  }
}
