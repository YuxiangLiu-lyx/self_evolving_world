import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EvidenceCache } from './validation-cache.js';
import { contentHash } from './validation-inputs.js';
let root: string;
beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), 'validation-cache-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
describe('runner-authenticated evidence', () => {
  it('reuses only identical dependency fingerprints and bound output bytes', () => {
    const cache = new EvidenceCache(root, 'original-run');
    writeFileSync(resolve(root, 'image.png'), 'fixture bytes');
    cache.write('browser', 'input-1', { tests: 1 }, 1, {
      'image.png': contentHash('fixture bytes'),
    });
    expect(cache.read('browser', 'input-1')?.originRun).toBe('original-run');
    expect(cache.read('browser', 'changed-input')).toBeNull();
    writeFileSync(resolve(root, 'image.png'), 'changed');
    expect(cache.read('browser', 'input-1')).toBeNull();
  });
  it('rejects old, forged and edited PASS records and interrupted/failed payloads', () => {
    const cache = new EvidenceCache(root, 'current-run');
    writeFileSync(
      cache.path('world', 'input'),
      JSON.stringify({ status: 'passed', input: 'input' }),
    );
    expect(cache.read('world', 'input')).toBeNull();
    cache.write('world', 'input', { result: 42 }, 1);
    const envelope = JSON.parse(
      readFileSync(cache.path('world', 'input'), 'utf8'),
    ) as { payload: string };
    writeFileSync(
      cache.path('world', 'input'),
      JSON.stringify({
        ...envelope,
        payload: envelope.payload.replace('passed', 'failed'),
      }),
    );
    expect(cache.read('world', 'input')).toBeNull();
  });
  it('CI/audit creates a fresh trust domain and cannot adopt local receipts', () => {
    const local = new EvidenceCache(root, 'local');
    local.write('world', 'input', {}, 1);
    const ci = new EvidenceCache(root, 'ci', true);
    expect(ci.read('world', 'input')).toBeNull();
  });
});
