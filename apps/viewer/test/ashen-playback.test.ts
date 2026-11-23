import { describe, it, expect } from 'vitest';
import type { V7World } from '@self-evolving-world/world-core';
import {
  FrameBuffer,
  PlaybackClock,
} from '../src/presentation/ex9/playback.js';
import { FollowCamera } from '../src/presentation/ex9/camera.js';

const frame = (tick: number): V7World => ({ tick }) as V7World;
const flush = async (): Promise<void> => {
  for (let i = 0; i < 25; i++) await Promise.resolve();
};
describe('continuous preview time and verified lookahead', () => {
  it('retains fractional movement across speed changes and round boundaries', () => {
    const clock = new PlaybackClock(20);
    clock.playing = true;
    clock.advance(450, () => true);
    expect(clock.fraction).toBeCloseTo(0.5);
    clock.speed = 2;
    clock.advance(300, () => true);
    expect(clock.tick).toBe(1);
    expect(clock.fraction).toBeCloseTo(1 / 6);
    clock.speed = 4;
    clock.advance(225, () => true);
    expect(clock.tick).toBe(2);
    expect(clock.fraction).toBeCloseTo(1 / 6);
    expect(clock.time).toBeCloseTo(2 + 1 / 6);
  });
  it('freezes at missing data without replay debt, and preserves pause before exact steps', () => {
    const clock = new PlaybackClock(20);
    clock.playing = true;
    clock.advance(1100, (tick) => tick <= 1);
    expect([clock.tick, clock.fraction, clock.buffering]).toEqual([1, 0, true]);
    clock.advance(10000, () => false);
    expect(clock.time).toBe(1);
    clock.advance(90, () => true);
    expect(clock.fraction).toBeCloseTo(0.1);
    clock.playing = false;
    clock.advance(900, () => true);
    expect(clock.fraction).toBeCloseTo(0.1);
    clock.seek(2);
    expect([clock.tick, clock.fraction, clock.time]).toEqual([2, 0, 2]);
  });
  it('prefetches across a segment boundary and bounds memory without duplicate loads', async () => {
    const calls: number[] = [];
    const buffer = new FrameBuffer(1200, (tick) => {
      calls.push(tick);
      return Promise.resolve(frame(tick));
    });
    await buffer.seek(97);
    await flush();
    expect(calls).toEqual([97, 98, 99, 100, 101, 102, 103, 104, 105]);
    buffer.prefetch(99);
    await flush();
    expect(new Set(calls).size).toBe(calls.length);
    expect([...buffer.frames.keys()]).toEqual([
      98, 99, 100, 101, 102, 103, 104, 105, 106, 107,
    ]);
    expect(buffer.frames.size).toBeLessThanOrEqual(10);
  });
  it('retains foreground verification failure until an explicit fresh seek', async () => {
    const buffer = new FrameBuffer(20, (tick) =>
      tick === 10
        ? Promise.reject(new Error('State hash mismatch.'))
        : Promise.resolve(frame(tick)),
    );
    await expect(buffer.seek(10)).rejects.toThrow('State hash mismatch.');
    expect(buffer.error?.message).toContain('hash mismatch');
    expect(buffer.frames.has(10)).toBe(false);
    await buffer.seek(20);
    expect(buffer.error).toBeUndefined();
  });
  it('never publishes an old seek or treats failed verification as a valid snapshot', async () => {
    let resolveOld: (value: V7World) => void = () => undefined;
    const buffer = new FrameBuffer(1200, (tick) =>
      tick === 10
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : tick === 21
          ? Promise.reject(new Error('Segment integrity check failed.'))
          : Promise.resolve(frame(tick)),
    );
    const old = buffer.seek(10);
    expect((await buffer.seek(20))?.tick).toBe(20);
    resolveOld(frame(10));
    expect(await old).toBeNull();
    await flush();
    expect(buffer.frames.has(10)).toBe(false);
    expect(buffer.frames.has(21)).toBe(false);
    expect(buffer.error?.message).toContain('integrity');
  });
});
describe('independent follow camera', () => {
  it('ignores tiny movement, damps following and converges without overshoot', () => {
    const camera = new FollowCamera();
    camera.cut({ x: 3, y: 3 });
    camera.update(1 / 60, { x: 3.05, y: 3 });
    expect(camera.view.x).toBe(3);
    camera.update(1 / 60, { x: 4, y: 3 });
    expect(camera.view.x).toBeGreaterThan(3);
    expect(camera.view.x).toBeLessThan(3.05);
    for (let n = 0; n < 120; n++) camera.update(1 / 60, { x: 4, y: 3 });
    expect(camera.view.x).toBeCloseTo(3.88, 1);
    expect(camera.view.x).toBeLessThan(4);
  });
  it('preserves manual position, smooths zoom and cuts distant changes without flyover', () => {
    const camera = new FollowCamera();
    camera.span = 12;
    camera.update(1 / 60);
    expect(camera.view.span).toBeGreaterThan(12);
    expect(camera.view.span).toBeLessThan(18);
    expect(camera.view.x).toBe(13);
    camera.cut({ x: 40, y: 30 });
    expect(camera.view.x).toBe(40);
    camera.update(1 / 60, { x: 40, y: 30 });
    expect(camera.view.x).toBe(40);
  });
});
