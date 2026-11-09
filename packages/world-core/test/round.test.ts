import { describe, expect, it } from 'vitest';
import { createWorld, stepWorldRound } from '../src/index.js';
import type { WorldAction } from '../src/index.js';

const setup = {
  settings: { width: 6, height: 4, visionRadius: 2 },
  agents: [
    { id: 'a', name: 'A', position: { x: 1, y: 1 } },
    { id: 'b', name: 'B', position: { x: 3, y: 1 } },
    { id: 'c', name: 'C', position: { x: 5, y: 3 } },
  ],
  items: [
    { id: 'wood', name: 'Wood', position: { x: 1, y: 1 } },
    { id: 'stone', name: 'Stone', position: { x: 3, y: 1 } },
  ],
};
const moves: readonly WorldAction[] = setup.agents.map(({ id }) => ({
  type: 'move',
  agentId: id,
  direction: 'north',
}));

describe('simultaneous-v1 rounds', () => {
  it('moves every actor in one immutable frame, updates all observations and ignores input order', () => {
    const initial = createWorld(setup);
    const before = JSON.stringify(initial);
    const next = stepWorldRound(initial, moves);
    expect(next.tick).toBe(1);
    expect(next.event).toBeNull();
    expect(next.agents.map(({ position }) => position)).toEqual([
      { x: 1, y: 0 },
      { x: 3, y: 0 },
      { x: 5, y: 2 },
    ]);
    expect(next.events?.map(({ tick, outcome }) => [tick, outcome])).toEqual([
      [1, 'moved'],
      [1, 'moved'],
      [1, 'moved'],
    ]);
    expect(
      next.observations.every(
        ({ tick, self }) => tick === 1 && next.agents.includes(self),
      ),
    ).toBe(true);
    expect(next.observations[0]?.agents).toEqual([
      { id: 'b', name: 'B', position: { x: 3, y: 0 } },
    ]);
    expect(stepWorldRound(initial, [...moves].reverse())).toEqual(next);
    expect(JSON.stringify(initial)).toBe(before);
    expect(Object.isFrozen(next.events)).toBe(true);
    expect(
      next.events?.every(
        (event) => Object.isFrozen(event) && Object.isFrozen(event.action),
      ),
    ).toBe(true);
    expect(next.rules).toBe(initial.rules);
    expect(next.settings).toBe(initial.settings);
  });

  it('rejects every competing mover without granting input-order priority', () => {
    const state = createWorld(setup);
    const batch: WorldAction[] = [
      { type: 'move', agentId: 'a', direction: 'east' },
      { type: 'move', agentId: 'b', direction: 'west' },
      { type: 'move', agentId: 'c', direction: 'south' },
    ];
    const next = stepWorldRound(state, batch);
    expect(next.agents).toEqual(state.agents);
    expect(next.events?.map(({ outcome }) => outcome)).toEqual([
      'occupied',
      'occupied',
      'out-of-bounds',
    ]);
    expect(stepWorldRound(state, batch.reverse())).toEqual(next);
  });

  it('uses start occupancy for swaps and following another mover', () => {
    const initial = createWorld({
      agents: [
        { id: 'a', name: 'A', position: { x: 0, y: 0 } },
        { id: 'b', name: 'B', position: { x: 1, y: 0 } },
      ],
    });
    for (const direction of ['west', 'east'] as const) {
      const next = stepWorldRound(initial, [
        { type: 'move', agentId: 'a', direction: 'east' },
        { type: 'move', agentId: 'b', direction },
      ]);
      expect(next.agents[0]?.position).toEqual({ x: 0, y: 0 });
      expect(next.events?.[0]?.outcome).toBe('occupied');
      expect(next.events?.[1]?.outcome).toBe(
        direction === 'west' ? 'occupied' : 'moved',
      );
    }
  });

  it('commits independent pickups alongside movement with unique ownership', () => {
    const initial = createWorld(setup);
    const next = stepWorldRound(initial, [
      { type: 'pickup', agentId: 'a', itemId: 'wood' },
      { type: 'pickup', agentId: 'b', itemId: 'stone' },
      { type: 'move', agentId: 'c', direction: 'north' },
    ]);
    expect(next.items).toEqual([]);
    expect(next.agents.map(({ inventory }) => inventory)).toEqual([
      [{ id: 'wood', name: 'Wood' }],
      [{ id: 'stone', name: 'Stone' }],
      [],
    ]);
    expect(next.observations.every(({ items }) => items.length === 0)).toBe(
      true,
    );
    expect(initial.items).toHaveLength(2);
    const rejected = stepWorldRound(next, [
      { type: 'pickup', agentId: 'a', itemId: 'wood' },
      { type: 'try', agentId: 'b', skill: 'fly' },
      { type: 'try', agentId: 'c', skill: 'move' },
    ]);
    expect(rejected.agents).toEqual(next.agents);
    expect(rejected.events?.map(({ outcome }) => outcome)).toEqual([
      'item-not-found',
      'skill-unavailable',
      'skill-already-exists',
    ]);
  });

  it('rejects incomplete, duplicate, unknown and malformed batches without changing the world', () => {
    const initial = createWorld(setup);
    const before = JSON.stringify(initial);
    for (const batch of [
      [],
      moves.slice(1),
      [...moves, moves[0]],
      [moves[0], moves[0], moves[2]],
      [
        moves[0],
        moves[1],
        { type: 'move', agentId: 'unknown', direction: 'north' },
      ],
      [
        moves[0],
        moves[1],
        { type: 'move', agentId: 'c', direction: 'diagonal' },
      ],
      null,
    ])
      expect(() =>
        stepWorldRound(initial, batch as readonly WorldAction[]),
      ).toThrow(RangeError);
    expect(() => stepWorldRound(createWorld(), [])).toThrow(RangeError);
    expect(() =>
      stepWorldRound({ ...initial, tick: Number.MAX_SAFE_INTEGER }, moves),
    ).toThrow(RangeError);
    expect(JSON.stringify(initial)).toBe(before);
  });
});
