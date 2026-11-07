import type { Reporter } from 'vitest/reporters';

/** A green suite must execute every collected test as an ordinary passing test. */
export default class UnitReporter implements Reporter {
  onTestRunEnd(
    ...[modules, errors, reason]: Parameters<
      NonNullable<Reporter['onTestRunEnd']>
    >
  ): void {
    const tests = modules.flatMap((module) => [...module.children.allTests()]);
    const invalid = tests.filter(
      (test) =>
        test.result().state !== 'passed' ||
        test.options.fails === true ||
        test.options.mode !== 'run',
    );
    if (
      reason !== 'passed' ||
      errors.length > 0 ||
      tests.length === 0 ||
      invalid.length > 0 ||
      modules.some((module) => module.state() !== 'passed')
    ) {
      throw new Error(
        `Full unit suite required: ${String(invalid.length)} skipped, focused, expected-failure, or incomplete tests; ${String(errors.length)} unhandled errors. ${invalid.map((test) => test.fullName).join('; ')}`,
      );
    }
  }
}
