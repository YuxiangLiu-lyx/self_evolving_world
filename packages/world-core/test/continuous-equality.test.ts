import { expect, it } from 'vitest';
import { v7Equivalent, v7Signature, v7Clone } from '../src/index.js';
import { continuousFixture } from './fixtures/continuous-extension.js';

it('matches canonical comparison across JSON structure, property order and legacy signature aliases', () => {
  const values: unknown[] = [
    null,
    undefined,
    true,
    false,
    0,
    -0,
    1,
    '',
    'a',
    NaN,
    Infinity,
    [],
    [undefined],
    [null],
    new Array<unknown>(1),
    [1, 2],
    [2, 1],
    {},
    { a: 1, b: [null, { x: 'value' }] },
    { b: [null, { x: 'value' }], a: 1 },
    { a: undefined },
    { a: null },
    { a: NaN },
    { a: [] },
    { a: [undefined] },
    { a: [null] },
    { a: { b: 2 } },
    { a: { b: 3 } },
  ];
  for (const a of values)
    for (const b of values)
      expect(v7Equivalent(a, b)).toBe(v7Signature(a) === v7Signature(b));
  expect(() => v7Equivalent({ a: 1n }, { a: 1n })).toThrow();
});

it('detects nested mutations, additions and deletions without reusing mutable identity', () => {
  const original = continuousFixture(),
    changed = v7Clone(original);
  expect(v7Equivalent(original, changed)).toBe(true);
  const actor = changed.actors[0];
  if (!actor) throw new Error('Missing fixture actor.');
  actor.memory.notes = ['Changed after comparison.'];
  expect(v7Equivalent(original, changed)).toBe(false);
  actor.memory.notes = [...(original.actors[0]?.memory.notes ?? [])];
  expect(v7Equivalent(original, changed)).toBe(true);
  changed.state.newField = 1;
  expect(v7Equivalent(original, changed)).toBe(false);
  delete changed.state.newField;
  changed.actors.pop();
  expect(v7Equivalent(original, changed)).toBe(false);
  expect(v7Signature(original)).not.toBe(v7Signature(changed));
});
