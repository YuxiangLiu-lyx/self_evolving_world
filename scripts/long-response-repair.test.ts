import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { continuousHash } from './continuous-store.js';
import { forestCheckpointRepair } from './forest-checkpoint-repair.js';
it('permits only the exact long-context phased transport repair and rejects unrelated policy/source changes', () => {
  const before = JSON.parse(
    readFileSync('experiment/ex13/sources/revision-7.json', 'utf8'),
  ) as Record<string, string>;
  const accepted = JSON.parse(
    readFileSync('experiment/ex13/sources/revision-8.json', 'utf8'),
  ) as Record<string, string>;
  for (const path of [
    'apps/simulator/src/responses.ts',
    'apps/simulator/src/continuous-provider.ts',
  ]) {
    const old = before[path];
    if (!old) throw new Error('Missing retained baseline');
    const next = accepted[path];
    if (!next) throw new Error('Missing accepted source');
    expect(
      forestCheckpointRepair(
        path,
        continuousHash(old),
        continuousHash(next),
        'long-final-answer-phase-v1',
      ),
    ).toBe(true);
    expect(
      forestCheckpointRepair(
        path,
        continuousHash(old),
        continuousHash(next + ' '),
        'long-final-answer-phase-v1',
      ),
    ).toBe(false);
  }
  expect(
    forestCheckpointRepair(
      'apps/simulator/src/long-request.ts',
      'x',
      'y',
      'long-final-answer-phase-v1',
    ),
  ).toBe(false);
});
