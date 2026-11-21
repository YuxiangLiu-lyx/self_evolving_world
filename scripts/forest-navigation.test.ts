import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  continuousRegistry,
  v7IndexedClear,
  v7SegmentClear,
  v7Step,
  v7Work,
} from '@self-evolving-world/world-core';
import type { V7Spatial } from '@self-evolving-world/world-core';
import type { V7Execution } from '../apps/simulator/src/continuous-run.js';

it('matches exact collision tests across rotated walls, circles and distant obstacles', () => {
  const obstacles: V7Spatial[] = Array.from({ length: 30 }, (_, i) => ({
    x: (i * 7) % 25,
    y: (i * 11) % 19,
    angle: i * 0.31,
    shape:
      i % 2
        ? { kind: 'circle', radius: 0.3 + (i % 4) * 0.1 }
        : { kind: 'rectangle', width: 0.4, height: 3 },
    solid: true,
    interaction: 0,
    entrances: [],
  }));
  const indexed = v7IndexedClear(obstacles, 0.22, v7Work(5_000_000));
  for (let i = 0; i < 250; i++) {
    const from = { x: ((i * 3.17) % 27) - 1, y: ((i * 4.31) % 21) - 1 };
    const to = { x: ((i * 7.13) % 27) - 1, y: ((i * 8.27) % 21) - 1 };
    expect(indexed(from, to)).toBe(v7SegmentClear(from, to, 0.22, obstacles));
  }
});

it('executes the retained ex8 round-166 intents within the original computation budget without inference or a new strategy', () => {
  const saved = JSON.parse(
    readFileSync(
      'experiment/ex8/technical-pauses/round-166/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  if (!saved.barrier) throw new Error('Missing retained technical barrier');
  expect(saved.world.config.computation.workPerRound).toBe(2_000_000);
  const result = v7Step(
    saved.world,
    saved.barrier.actions,
    continuousRegistry(),
    saved.cursors,
    saved.barrier.reviews,
  );
  expect(result.paused).toBeNull();
  expect(result.world.tick).toBe(167);
  expect(result.world.config).toEqual(saved.world.config);
  expect(result.outcomes.lin?.reason).toContain('No route');
  expect(result.outcomes.sol?.reason).toContain('No route');
  expect(result.outcomes.moss?.success).toBe(true);
});
