import { describe, expect, it, vi } from 'vitest';
import { createWorld } from '@self-evolving-world/world-core';
import { DEMO_SETUP } from '../../viewer/src/scenario.js';
import { parseReplay, serializeReplay } from '../../viewer/src/timeline.js';
import { runRandomWorld } from '../src/random-run.js';
import { analyzeRun } from '../../../scripts/experiment-analysis.js';

describe('offline seeded random world', () => {
  it('completes 480 reproducible actions without network, ambient randomness or changed foundation', () => {
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Network is forbidden.');
    });
    const randomness = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Implicit randomness is forbidden.');
    });
    try {
      const first = runRandomWorld(20261107, 480);
      expect(first).toEqual(runRandomWorld(20261107, 480));
      expect(first.frames[0]).toEqual(createWorld(DEMO_SETUP));
      const result = analyzeRun(first);
      expect(result).toMatchObject({
        steps: 480,
        framesChecked: 481,
        invariantFailures: 0,
        externalModelCalls: 0,
      });
      expect(result.agents.map((agent) => agent.turns)).toEqual([
        160, 160, 160,
      ]);
      expect(result.actions.move).toBeGreaterThan(0);
      expect(result.actions.pickup).toBeGreaterThan(0);
      expect(result.actions.try).toBeGreaterThan(0);
      expect(network).not.toHaveBeenCalled();
      expect(randomness).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
      randomness.mockRestore();
    }
  });

  it('round trips every snapshot through the viewer replay protocol', () => {
    const run = runRandomWorld(20261107, 480);
    const replay = parseReplay(JSON.stringify(run.replay));
    expect(replay.frames).toEqual(run.frames);
    expect(JSON.parse(serializeReplay(replay))).toEqual(run.replay);
    expect(runRandomWorld(42, 480).replay.actions).not.toEqual(
      run.replay.actions,
    );
  });

  it.each([
    [0, 480],
    [-1, 480],
    [2 ** 32, 480],
    [1.5, 480],
    [1, 0],
    [1, 501],
    [1, 3.5],
    [NaN, 480],
  ])('rejects invalid seed %s or steps %s', (seed, steps) => {
    expect(() => runRandomWorld(seed, steps)).toThrow(RangeError);
  });

  it('checks boundary seeds and full replay capacity', () => {
    for (const seed of [1, 42, 0xffffffff]) {
      const result = analyzeRun(runRandomWorld(seed, 500));
      expect(result.steps).toBe(500);
      expect(result.groundItems + result.collectedItems).toBe(6);
      expect(result.successfulActions + result.expectedRejections).toBe(500);
    }
  });

  it('rejects truncated histories and mutated snapshots', () => {
    const run = runRandomWorld(1, 10);
    expect(() => analyzeRun({ ...run, frames: run.frames.slice(1) })).toThrow(
      'Incomplete',
    );
    const frames = [...run.frames];
    const last = frames.at(-1);
    if (!last) throw new Error('Missing fixture.');
    frames[10] = Object.freeze({ ...last, tick: 30 });
    expect(() => analyzeRun({ ...run, frames })).toThrow('sequential ticks');
    frames[10] = Object.freeze({ ...last, items: Object.freeze([]) });
    expect(() => analyzeRun({ ...run, frames })).toThrow('item conservation');
    frames[10] = Object.freeze({ ...last, observations: Object.freeze([]) });
    expect(() => analyzeRun({ ...run, frames })).toThrow('observations');
  });
});
