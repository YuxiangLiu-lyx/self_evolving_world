import { describe, expect, it } from 'vitest';
import { runDemo } from '../src/demo.js';

describe('deterministic CLI scenario', () => {
  it('records a move, a pickup and an unavailable skill in three steps', () => {
    const history = runDemo();
    expect(history.map((state) => state.tick)).toEqual([0, 1, 2, 3]);
    expect(history.map((state) => state.event?.outcome ?? null)).toEqual([
      null,
      'moved',
      'picked-up',
      'skill-unavailable',
    ]);
    expect(history[1]?.agents[0]?.position).toEqual({ x: 3, y: 3 });
    expect(history[2]?.agents[0]?.inventory).toEqual([
      { id: 'wood', name: 'Wood' },
    ]);
    expect(history[3]?.items).toEqual([]);
  });
  it('produces reproducible JSON on independent runs without sharing mutable state', () => {
    const first = runDemo();
    const second = runDemo();
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first[0]).not.toBe(second[0]);
  });
  it('protects all snapshots and keeps the initial world intact', () => {
    const history = runDemo();
    expect(Object.isFrozen(history)).toBe(true);
    expect(history.every(Object.isFrozen)).toBe(true);
    expect(history[0]?.items).toHaveLength(1);
    expect(history[0]?.agents[0]?.inventory).toEqual([]);
  });
});
