import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { continuousHash } from './continuous-store.js';
import { forestCheckpointRepair } from './forest-checkpoint-repair.js';
it('binds stable pagination recovery to the exact retained source pair', () => {
  const path = 'apps/simulator/src/long-context.ts';
  const source = JSON.parse(
    readFileSync('experiment/ex13/sources/revision-28.json', 'utf8'),
  ) as Record<string, string>;
  const before = source[path];
  if (!before) throw new Error('Missing retained context source');
  const accepted = JSON.parse(
    readFileSync('experiment/ex13/sources/revision-29.json', 'utf8'),
  ) as Record<string, string>;
  const after = accepted[path];
  if (!after) throw Error('Missing accepted pagination repair source');
  const valid = (text: string, declaration: string) =>
    forestCheckpointRepair(
      path,
      continuousHash(before),
      continuousHash(text),
      declaration,
    );
  expect(valid(after, 'long-stable-pagination-v1')).toBe(true);
  expect(valid(after + ' ', 'long-stable-pagination-v1')).toBe(false);
  expect(valid(after, 'unknown')).toBe(false);
});
