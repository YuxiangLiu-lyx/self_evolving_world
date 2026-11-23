import { expect, it } from 'vitest';
import { labelRows } from '../src/presentation/ex9/labels.js';
it('separates the observed ex13 surface and residue labels without moving their world anchors or changing unrelated labels', () => {
  const input = [
    { x: 704, y: 503, width: 190 },
    { x: 736, y: 514, width: 160 },
    { x: 1200, y: 503, width: 60 },
  ];
  const out = labelRows(input);
  expect(out[1]?.y).toBe(532);
  expect(out[2]).toEqual(input[2]);
  expect(out.map((p) => p.x)).toEqual(input.map((p) => p.x));
  expect(input[1]?.y).toBe(514);
  expect(labelRows(input)).toEqual(out);
});
