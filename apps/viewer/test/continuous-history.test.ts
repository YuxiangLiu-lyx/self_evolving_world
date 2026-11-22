import { expect, it } from 'vitest';
import { v7Signature } from '@self-evolving-world/world-core';
import {
  incrementalSceneReplay,
  replaySceneSegment,
} from '../src/continuous-history.js';
import { recordedSegment } from './fixtures/continuous-history.js';

it('renders round zero without simulating the future and reuses every verified prefix', async () => {
  const { segment, frames } = await recordedSegment();
  const replay = incrementalSceneReplay(segment);
  expect(await replay.frame(0)).toEqual(frames[0]);
  expect(replay.reconstructedRounds).toBe(0);
  const second = await replay.frame(2);
  expect(second).toEqual(frames[2]);
  expect(await replay.frame(1)).toEqual(frames[1]);
  expect(await replay.frame(2)).toBe(second);
  expect(replay.reconstructedRounds).toBe(2);
  expect(await replay.frame(7)).toEqual(frames[7]);
  expect(replay.reconstructedRounds).toBe(7);
  expect((await replaySceneSegment(segment)).map(v7Signature)).toEqual(
    frames.map(v7Signature),
  );
});

it('serializes concurrent targets without repeating costs or losing progress', async () => {
  const { segment, frames } = await recordedSegment();
  const replay = incrementalSceneReplay(segment);
  const values = await Promise.all([
    replay.frame(5),
    replay.frame(2),
    replay.frame(7),
    replay.frame(5),
  ]);
  expect(values).toEqual([frames[5], frames[2], frames[7], frames[5]]);
  expect(replay.reconstructedRounds).toBe(7);
  expect(replay.frames).toHaveLength(8);
});

it.each(['before', 'after', 'events', 'tasks'] as const)(
  'rejects corrupt %s evidence when reached and never resumes partial failed state',
  async (field) => {
    const { segment } = await recordedSegment();
    const bad = segment.rounds[1];
    if (!bad) throw new Error('Missing fixture round.');
    if (field === 'before' || field === 'after') bad[field] = 'corrupt';
    else if (field === 'events') bad.events = [];
    else
      bad.tasks = {
        unexpected: { action: { interface: 'rest', args: {} }, remaining: 1 },
      } as unknown as typeof bad.tasks;
    const replay = incrementalSceneReplay(segment);
    await replay.frame(1);
    await expect(replay.frame(2)).rejects.toThrow();
    expect(replay.reconstructedRounds).toBe(1);
    await expect(replay.frame(3)).rejects.toThrow();
    await expect(replay.frame(0)).rejects.toThrow();
  },
);

it('rejects out-of-range ticks and supports independent nonzero segment boundaries', async () => {
  const { segment, frames } = await recordedSegment();
  const initial = frames[3];
  if (!initial) throw new Error('Missing boundary fixture.');
  const replay = incrementalSceneReplay({
    ...segment,
    start: 3,
    initial,
    rounds: segment.rounds.slice(3),
  });
  expect(await replay.frame(5)).toEqual(frames[5]);
  expect(replay.reconstructedRounds).toBe(2);
  for (const tick of [2, 8, 3.5, Number.NaN])
    await expect(replay.frame(tick)).rejects.toThrow('outside');
  expect(incrementalSceneReplay(segment).reconstructedRounds).toBe(0);
  expect(() => incrementalSceneReplay({ ...segment, start: 1 })).toThrow(
    'boundary',
  );
});
