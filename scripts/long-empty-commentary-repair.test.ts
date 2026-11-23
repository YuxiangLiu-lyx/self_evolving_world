import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { continuousHash } from './continuous-store.js';
import { forestCheckpointRepair } from './forest-checkpoint-repair.js';
it('restricts the empty-commentary and personal-instance view repair to its exact source boundary', () => {
  const old = JSON.parse(
    readFileSync('experiment/ex13/sources/revision-9.json', 'utf8'),
  ) as Record<string, string>;
  for (const path of [
    'apps/simulator/src/responses.ts',
    'apps/simulator/src/long-context.ts',
  ]) {
    const before = old[path];
    if (!before) throw new Error('Missing source');
    const accepted = JSON.parse(
      readFileSync('experiment/ex13/sources/revision-10.json', 'utf8'),
    ) as Record<string, string>;
    const after = accepted[path];
    if (!after) throw new Error('Missing accepted repair source');
    expect(
      forestCheckpointRepair(
        path,
        continuousHash(before),
        continuousHash(after),
        'long-empty-commentary-and-instance-view-v1',
      ),
    ).toBe(true);
    expect(
      forestCheckpointRepair(
        path,
        continuousHash(before),
        continuousHash(after + ' '),
        'long-empty-commentary-and-instance-view-v1',
      ),
    ).toBe(false);
  }
});
