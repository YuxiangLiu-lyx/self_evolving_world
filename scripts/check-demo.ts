import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runDemo } from '../apps/simulator/src/demo.js';

const entry = fileURLToPath(
  new URL('../apps/simulator/dist/main.js', import.meta.url),
);
const expected = `${JSON.stringify(runDemo())}\n`;
for (const timezone of ['UTC', 'Pacific/Honolulu']) {
  const actual = execFileSync(process.execPath, [entry], {
    encoding: 'utf8',
    env: { ...process.env, TZ: timezone },
    timeout: 5_000,
  });
  assert.equal(
    actual,
    expected,
    `Compiled CLI output mismatch with TZ=${timezone}`,
  );
}
process.stdout.write(
  'Compiled CLI checks passed: exact JSON matches in two independent processes.\n',
);
