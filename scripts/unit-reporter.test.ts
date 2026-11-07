import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Execute actual isolated Vitest runs so skip/focus behavior cannot be mocked away.
describe('complete unit suite enforcement', () => {
  it.each([
    [
      'ordinary passing test',
      'test("ordinary", () => expect(1).toBe(1));',
      true,
    ],
    ['skipped test', 'test.skip("missing", () => {});', false],
    ['todo test', 'test.todo("missing");', false],
    [
      'expected failure',
      'test.fails("expected", () => expect(1).toBe(2));',
      false,
    ],
    ['focused test', 'test.only("focused", () => expect(1).toBe(1));', false],
    ['dynamic skip', 'test("conditional", context => context.skip());', false],
  ])(
    'handles %s',
    (_name, source, succeeds) => {
      const root = mkdtempSync(join(tmpdir(), 'sew-unit-policy-'));
      try {
        const fixture = join(root, 'fixture.test.mjs');
        writeFileSync(
          fixture,
          `import {test,expect} from ${JSON.stringify(resolve('node_modules/vitest/dist/index.js'))};\n${source}\n`,
        );
        const config = join(root, 'vitest.config.mjs');
        writeFileSync(
          config,
          `export default ${JSON.stringify({ test: { include: [fixture], allowOnly: false, reporters: [resolve('scripts/unit-reporter.ts')] } })};\n`,
        );
        const result = spawnSync(
          process.execPath,
          [
            resolve('node_modules/vitest/vitest.mjs'),
            'run',
            '--config',
            config,
          ],
          { encoding: 'utf8', timeout: 20_000 },
        );
        expect(result.error).toBeUndefined();
        if (succeeds)
          expect(result.status, result.stdout + result.stderr).toBe(0);
        else expect(result.status, result.stdout + result.stderr).not.toBe(0);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
