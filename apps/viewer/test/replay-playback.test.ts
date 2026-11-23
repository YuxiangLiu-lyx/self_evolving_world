import { afterEach, expect, it, vi } from 'vitest';
import { replayPlayback } from '../src/replay-playback.js';
afterEach(() => vi.useRealTimers());
it('does not overlap an unfinished seek after pause and immediate restart', async () => {
  vi.useFakeTimers();
  let release: (more: boolean) => void = () => {};
  const step = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        release = resolve;
      }),
  );
  const player = replayPlayback(step, () => {}, 10);
  player.start();
  await vi.advanceTimersByTimeAsync(10);
  player.stop();
  player.start();
  await vi.advanceTimersByTimeAsync(100);
  expect(step).toHaveBeenCalledOnce();
  release(true);
  await vi.advanceTimersByTimeAsync(0);
  expect(step).toHaveBeenCalledTimes(2);
  release(false);
  await vi.advanceTimersByTimeAsync(100);
  expect(player.playing).toBe(false);
});
it('waits for each verified frame and stops without leaving queued advances', async () => {
  vi.useFakeTimers();
  let release: (more: boolean) => void = () => {};
  const step = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        }),
    ),
    changed = vi.fn();
  const player = replayPlayback(step, changed, 10);
  player.start();
  await vi.advanceTimersByTimeAsync(100);
  expect(step).toHaveBeenCalledOnce();
  release(true);
  await vi.advanceTimersByTimeAsync(10);
  expect(step).toHaveBeenCalledTimes(2);
  player.stop();
  release(true);
  await vi.advanceTimersByTimeAsync(100);
  expect(step).toHaveBeenCalledTimes(2);
  expect(player.playing).toBe(false);
  expect(changed).toHaveBeenLastCalledWith(false);
});
it('stops at the end and on a failed seek', async () => {
  vi.useFakeTimers();
  const step = vi.fn(() => Promise.resolve(false)),
    player = replayPlayback(step, () => {}, 10);
  player.start();
  await vi.advanceTimersByTimeAsync(100);
  expect(step).toHaveBeenCalledOnce();
  expect(player.playing).toBe(false);
  step.mockRejectedValue(new Error('Corrupt recording'));
  player.start();
  await vi.advanceTimersByTimeAsync(100);
  expect(step).toHaveBeenCalledTimes(2);
  expect(player.playing).toBe(false);
});
