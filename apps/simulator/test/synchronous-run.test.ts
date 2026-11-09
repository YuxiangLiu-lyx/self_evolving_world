import { describe, expect, it, vi } from 'vitest';
import {
  collectionAction,
  runSynchronousWorld,
} from '../src/synchronous-run.js';
import { analyzeSynchronousRun } from '../../../scripts/synchronous-analysis.js';
import {
  appendAction,
  parseReplay,
  serializeReplay,
} from '../../viewer/src/timeline.js';

describe('synchronous collection experiment', () => {
  it('reproduces 160 complete rounds and successful collection without implicit randomness or network', () => {
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('No model calls allowed.');
    });
    const randomness = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Explicit seed required.');
    });
    try {
      const run = runSynchronousWorld(20261107, 160);
      expect(run).toEqual(runSynchronousWorld(20261107, 160));
      expect(runSynchronousWorld(42, 160).replay.rounds).not.toEqual(
        run.replay.rounds,
      );
      const results = analyzeSynchronousRun(run);
      expect(results).toMatchObject({
        rounds: 160,
        totalActions: 480,
        framesChecked: 161,
        actions: { try: 0 },
        invariantFailures: 0,
      });
      expect(results.actions.pickup).toBeGreaterThan(0);
      expect(results.actions.pickup).toBe(results.collectedItems);
      expect(results.agents.map(({ turns }) => turns)).toEqual([160, 160, 160]);
      expect(results.successfulActions + results.expectedRejections).toBe(480);
      expect(network).not.toHaveBeenCalled();
      expect(randomness).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
      randomness.mockRestore();
    }
  });

  it('prioritizes same-cell pickups, uses visible attraction and retains random exploration', () => {
    const observation = runSynchronousWorld(1, 3).frames[0]?.observations[0];
    if (!observation) throw new Error('Missing fixture.');
    const local = {
      ...observation,
      items: [
        { id: 'wood', name: 'Wood', position: observation.self.position },
      ],
    };
    expect(collectionAction(local, () => 0.99)).toEqual({
      type: 'pickup',
      agentId: 'lin',
      itemId: 'wood',
    });
    expect(collectionAction(observation, () => 0)).toEqual({
      type: 'move',
      agentId: 'lin',
      direction: 'east',
    });
    expect(collectionAction(observation, () => 0.99)).toEqual({
      type: 'move',
      agentId: 'lin',
      direction: 'west',
    });
    expect(collectionAction({ ...observation, items: [] }, () => 0)).toEqual({
      type: 'move',
      agentId: 'lin',
      direction: 'north',
    });
  });

  it('round trips complete v2 snapshots, retains v1 compatibility and prevents mixed schedule edits', () => {
    const run = runSynchronousWorld(20261107, 160);
    const timeline = parseReplay(JSON.stringify(run.replay));
    expect(timeline.frames).toEqual(run.frames);
    expect(JSON.parse(serializeReplay(timeline))).toEqual(run.replay);
    expect(() =>
      appendAction(timeline, {
        type: 'move',
        agentId: 'lin',
        direction: 'east',
      }),
    ).toThrow('read-only');
    for (const replay of [
      { ...run.replay, schedule: 'sequential' },
      { ...run.replay, rounds: [[run.replay.rounds[0]?.[0]]] },
      {
        ...run.replay,
        rounds: Array.from({ length: 501 }, () => run.replay.rounds[0]),
      },
    ])
      expect(() => parseReplay(JSON.stringify(replay))).toThrow();
  });

  it('rejects missing frames, mismatched events and fabricated collection outcomes', () => {
    const run = runSynchronousWorld(20261107, 160);
    expect(() =>
      analyzeSynchronousRun({ ...run, frames: run.frames.slice(1) }),
    ).toThrow('Incomplete');
    const frames = [...run.frames];
    const last = frames.at(-1);
    if (!last) throw new Error('Missing fixture.');
    frames[160] = Object.freeze({ ...last, events: Object.freeze([]) });
    expect(() => analyzeSynchronousRun({ ...run, frames })).toThrow(
      'one event',
    );
    frames[160] = Object.freeze({
      ...last,
      events: Object.freeze(
        last.events?.map((event) =>
          Object.freeze({ ...event, outcome: 'picked-up' as const }),
        ) ?? [],
      ),
    });
    expect(() => analyzeSynchronousRun({ ...run, frames })).toThrow(
      'movement outcome',
    );
  });
});
