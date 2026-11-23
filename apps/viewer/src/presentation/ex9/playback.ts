import type { V7World } from '@self-evolving-world/world-core';

/** Presentation time only. Integer boundaries are authoritative saved states. */
export class PlaybackClock {
  tick = 0;
  fraction = 0;
  speed = 1;
  playing = false;
  buffering = false;
  time = 0;
  constructor(
    readonly end: number,
    readonly roundMs = 900,
  ) {}
  seek(tick: number): void {
    this.tick = Math.max(0, Math.min(this.end, Math.trunc(tick)));
    this.fraction = 0;
    this.time = this.tick;
    this.buffering = false;
  }
  advance(milliseconds: number, available: (tick: number) => boolean): void {
    this.buffering = false;
    if (!this.playing) return;
    let remaining = (Math.max(0, milliseconds) * this.speed) / this.roundMs;
    while (remaining > 0 && this.tick < this.end) {
      if (!available(this.tick + 1)) {
        this.buffering = true;
        break; // Never accumulate a catch-up debt while verification is pending.
      }
      const delta = Math.min(1 - this.fraction, remaining);
      this.fraction += delta;
      this.time += delta;
      remaining -= delta;
      if (this.fraction >= 1 - 1e-10) {
        this.tick++;
        this.fraction = 0;
      }
    }
    if (this.tick === this.end) this.playing = false;
  }
}

/** The loader is exclusively the existing verifying replay worker. Foreground
 * seeks supersede prefetch through ReplayClient; stale generations never publish. */
export class FrameBuffer {
  readonly frames = new Map<number, V7World>();
  error: Error | undefined;
  private generation = 0;
  private pending: number | undefined;
  private anchor = 0;
  constructor(
    readonly end: number,
    private readonly load: (tick: number) => Promise<V7World | null>,
    readonly ahead = 8,
  ) {}
  async seek(tick: number): Promise<V7World | null> {
    const generation = ++this.generation;
    this.pending = undefined;
    this.anchor = tick;
    this.error = undefined;
    this.trim();
    try {
      const world = this.frames.get(tick) ?? (await this.load(tick));
      if (generation !== this.generation || !world) return null;
      this.frames.set(tick, world);
      this.prefetch(tick);
      return world;
    } catch (error) {
      if (generation === this.generation)
        this.error =
          error instanceof Error ? error : new Error('Replay seek failed.');
      throw error;
    }
  }

  private trim(): void {
    for (const tick of this.frames.keys())
      if (tick < this.anchor - 1 || tick > this.anchor + this.ahead)
        this.frames.delete(tick);
  }
  prefetch(tick: number): void {
    this.anchor = tick;
    this.trim();
    if (this.pending !== undefined || this.error) return;
    const generation = this.generation;
    this.pending = generation;
    void this.fill(generation);
  }
  private async fill(generation: number): Promise<void> {
    try {
      while (generation === this.generation) {
        let missing: number | undefined;
        for (
          let n = this.anchor + 1;
          n <= Math.min(this.end, this.anchor + this.ahead);
          n++
        ) {
          if (!this.frames.has(n)) {
            missing = n;
            break;
          }
        }
        if (missing === undefined) break;
        const world = await this.load(missing);
        if (!world || generation !== this.generation) break;
        this.frames.set(missing, world);
        this.trim();
      }
    } catch (error) {
      if (generation === this.generation)
        this.error =
          error instanceof Error ? error : new Error('Replay prefetch failed.');
    } finally {
      if (this.pending === generation) this.pending = undefined;
    }
  }
  dispose(): void {
    this.generation++;
    this.frames.clear();
  }
}
