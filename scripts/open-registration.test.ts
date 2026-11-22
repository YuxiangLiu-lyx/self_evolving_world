import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { v7Clone } from '@self-evolving-world/world-core';
import {
  bindRegistrationPrecision,
  reconstructContinuousSegment,
} from './continuous-store.js';
import type { V7ReplaySegment } from './continuous-store.js';
const original = JSON.parse(
  readFileSync('experiment/ex10/replay/execution-000100-000123.json', 'utf8'),
) as V7ReplaySegment;
const frames = reconstructContinuousSegment(original);
const index = original.rounds.findIndex((r) =>
  r.registrations.includes('material-geometry@1'),
);
const before = frames[index],
  record = original.rounds[index];
if (!before || !record) throw new Error('Missing retained actual migration');
it('binds supplementary browser precision to the actual original migration without changing any original round field', () => {
  const bound = bindRegistrationPrecision(before, record);
  expect(bound.registrationPrecisionHash).toMatch(/^[a-f0-9]{64}$/);
  const { registrationPrecisionHash: proof, ...retained } = bound;
  expect(proof).toBeTruthy();
  expect(retained).toEqual(record);
  expect(() =>
    bindRegistrationPrecision(before, { ...record, before: 'invalid' }),
  ).toThrow('different original prefix');
  const segment = v7Clone(original);
  segment.rounds[index] = bound;
  expect(reconstructContinuousSegment(segment)).toEqual(frames);
});
it('rejects corrupt precision evidence, raw prefix tampering and precision proofs attached to unrelated rounds', () => {
  for (const field of ['before', 'registrationPrecisionHash'] as const) {
    const segment = v7Clone(original),
      bound = bindRegistrationPrecision(before, record);
    bound[field] = 'invalid';
    segment.rounds[index] = bound;
    expect(() => reconstructContinuousSegment(segment)).toThrow();
  }
  const segment = v7Clone(original),
    first = segment.rounds[0];
  if (!first) throw new Error('Missing record');
  first.registrationPrecisionHash = 'invalid';
  expect(() => reconstructContinuousSegment(segment)).toThrow(
    'Invalid supplementary',
  );
});
