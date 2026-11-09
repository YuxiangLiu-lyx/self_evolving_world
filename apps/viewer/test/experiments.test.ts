import { describe, expect, it } from 'vitest';
import { parseCatalogue } from '../src/experiments.js';

const entry = {
  id: 'ex1',
  objective: 'Inspect a bounded random world history.',
  steps: 480,
  seed: 20261107,
  createdAt: '2026-11-07T12:00:00Z',
};
const catalogue = (experiments: unknown[]) =>
  JSON.stringify({ version: 1, experiments });

describe('experiment catalogue boundary', () => {
  it('accepts arbitrary numbered runs and an empty archive', () => {
    expect(
      parseCatalogue(catalogue([entry, { ...entry, id: 'ex12' }])).map(
        (item) => item.id,
      ),
    ).toEqual(['ex1', 'ex12']);
    expect(parseCatalogue(catalogue([]))).toEqual([]);
  });
  it.each([
    { id: '../private' },
    { id: 'ex01' },
    { id: 'ex0' },
    { steps: 501 },
    { steps: 1.5 },
    { seed: 0 },
    { objective: '' },
    { createdAt: 'unknown' },
  ])('rejects malformed metadata %j', (change) => {
    expect(() =>
      parseCatalogue(catalogue([{ ...entry, ...change }])),
    ).toThrow();
  });
  it('rejects duplicate IDs, unsupported versions and oversized catalogues', () => {
    expect(() => parseCatalogue(catalogue([entry, entry]))).toThrow(
      'duplicate',
    );
    expect(() => parseCatalogue('{"version":2,"experiments":[]}')).toThrow(
      'Unsupported',
    );
    expect(() => parseCatalogue(' '.repeat(1_048_577))).toThrow('too large');
  });
});
