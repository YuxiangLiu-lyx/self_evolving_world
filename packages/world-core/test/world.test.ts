import { describe, expect, it } from 'vitest';
import {
  CORE_RULES,
  createWorld,
  isVisible,
  parseWorldAction,
  stepWorld,
} from '../src/index.js';
import type {
  AgentState,
  Direction,
  WorldAction,
  WorldSetup,
  WorldState,
} from '../src/index.js';

const setup: WorldSetup = {
  settings: { width: 8, height: 7, visionRadius: 2 },
  agents: [
    { id: 'a', name: 'Lin', position: { x: 1, y: 1 } },
    { id: 'b', name: 'Moss', position: { x: 4, y: 1 } },
  ],
  items: [
    { id: 'wood', name: 'Wood', position: { x: 2, y: 1 } },
    { id: 'stone', name: 'Stone', position: { x: 7, y: 6 } },
  ],
};
const move: WorldAction = { type: 'move', agentId: 'a', direction: 'east' };
function agent(state: WorldState, id = 'a'): AgentState {
  const value = state.agents.find((entry) => entry.id === id);
  if (value === undefined) throw new Error('Fixture agent missing');
  return value;
}
function expectDeepFrozen(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    for (const nested of Object.values(value)) expectDeepFrozen(nested);
  }
}

describe('immutable base world', () => {
  it('canonicalizes negative zero so JSON replay preserves exact state values', () => {
    const state = createWorld({
      settings: { visionRadius: -0 },
      agents: [{ id: 'a', name: 'A', position: { x: -0, y: -0 } }],
    });
    expect(Object.is(state.settings.visionRadius, -0)).toBe(false);
    expect(Object.is(agent(state).position.x, -0)).toBe(false);
    expect(Object.is(agent(state).position.y, -0)).toBe(false);
  });
  it('starts at zero with bounded defaults and a fixed skill set', () => {
    const state = createWorld();
    expect(state.tick).toBe(0);
    expect(state.settings).toEqual({ width: 16, height: 12, visionRadius: 4 });
    expect(state.rules.skills).toEqual(['move', 'pickup', 'try']);
    expect(state.agents).toEqual([]);
    expectDeepFrozen(createWorld(setup));
  });
  it('copies caller-owned settings and nested seed objects', () => {
    const input = {
      settings: { width: 8 },
      agents: [{ id: 'a', name: 'A', position: { x: 1, y: 1 } }],
    };
    const state = createWorld(input);
    input.settings.width = 40;
    const first = input.agents[0];
    if (first === undefined) throw new Error('Fixture missing');
    first.position.x = 7;
    first.name = 'changed';
    expect(state.settings.width).toBe(8);
    expect(agent(state).position.x).toBe(1);
    expect(agent(state).name).toBe('A');
  });
  it('preserves every previous snapshot and reuses frozen rules and settings', () => {
    const initial = createWorld(setup);
    const before = JSON.stringify(initial);
    const moved = stepWorld(initial, move);
    const picked = stepWorld(moved, {
      type: 'pickup',
      agentId: 'a',
      itemId: 'wood',
    });
    expect(JSON.stringify(initial)).toBe(before);
    expect(moved.items).toHaveLength(2);
    expect(agent(picked).inventory).toEqual([{ id: 'wood', name: 'Wood' }]);
    expect(picked.settings).toBe(initial.settings);
    expect(picked.rules).toBe(CORE_RULES);
    expectDeepFrozen(picked);
    expect(Reflect.set(picked.settings, 'width', 100)).toBe(false);
    expect(Reflect.set(picked.rules.skills, '3', 'fly')).toBe(false);
    expect(Reflect.set(agent(picked).position, 'x', 5)).toBe(false);
  });
  it.each([0, -1, 65, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid world width %s',
    (width) => {
      expect(() => createWorld({ settings: { width } })).toThrow(RangeError);
    },
  );
  it('validates vision radius, seed bounds, duplicate IDs and initial collisions', () => {
    expect(() => createWorld({ settings: { visionRadius: -1 } })).toThrow(
      RangeError,
    );
    expect(() =>
      createWorld({
        agents: [{ id: 'a', name: 'A', position: { x: 16, y: 0 } }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createWorld({
        ...setup,
        items: [{ id: 'a', name: 'duplicate', position: { x: 1, y: 1 } }],
      }),
    ).toThrow('Duplicate');
    expect(() =>
      createWorld({
        agents: [
          { id: 'a', name: 'A', position: { x: 0, y: 0 } },
          { id: 'b', name: 'B', position: { x: 0, y: 0 } },
        ],
      }),
    ).toThrow('same cell');
  });
  it('rejects excessive entity counts and empty identities', () => {
    expect(() =>
      createWorld({
        agents: Array.from({ length: 33 }, (_, x) => ({
          id: String(x),
          name: 'A',
          position: { x, y: 0 },
        })),
      }),
    ).toThrow('at most');
    expect(() =>
      createWorld({
        agents: [{ id: ' ', name: 'A', position: { x: 0, y: 0 } }],
      }),
    ).toThrow('non-empty');
  });
});

describe('movement and pickup', () => {
  it.each<[Direction, number, number]>([
    ['north', 1, 0],
    ['east', 2, 1],
    ['south', 1, 2],
    ['west', 0, 1],
  ])('moves exactly one cell %s', (direction, x, y) => {
    const state = stepWorld(createWorld(setup), {
      type: 'move',
      agentId: 'a',
      direction,
    });
    expect(agent(state).position).toEqual({ x, y });
    expect(state.tick).toBe(1);
    expect(state.event?.outcome).toBe('moved');
  });
  it.each<[Direction, number, number]>([
    ['north', 0, 0],
    ['west', 0, 0],
    ['east', 7, 6],
    ['south', 7, 6],
  ])(
    'records a rejected %s edge move without changing position',
    (direction, x, y) => {
      const initial = createWorld({
        settings: { width: 8, height: 7 },
        agents: [{ id: 'a', name: 'A', position: { x, y } }],
      });
      const next = stepWorld(initial, {
        type: 'move',
        agentId: 'a',
        direction,
      });
      expect(agent(next).position).toEqual({ x, y });
      expect(next.event?.outcome).toBe('out-of-bounds');
      expect(next.tick).toBe(1);
      expect(initial.tick).toBe(0);
    },
  );
  it('rejects occupied destinations', () => {
    let state = createWorld(setup);
    state = stepWorld(stepWorld(state, move), move);
    const rejected = stepWorld(state, move);
    expect(rejected.event?.outcome).toBe('occupied');
    expect(rejected.agents).toEqual(state.agents);
  });
  it('transfers an item exactly once from the ground to the actor', () => {
    const state = stepWorld(createWorld(setup), move);
    const next = stepWorld(state, {
      type: 'pickup',
      agentId: 'a',
      itemId: 'wood',
    });
    expect(next.items.map((item) => item.id)).toEqual(['stone']);
    expect(agent(next).inventory.map((item) => item.id)).toEqual(['wood']);
    const again = stepWorld(next, {
      type: 'pickup',
      agentId: 'b',
      itemId: 'wood',
    });
    expect(again.event?.outcome).toBe('item-not-found');
    expect(agent(again, 'b').inventory).toEqual([]);
    expect(again.agents).toEqual(next.agents);
  });
  it('rejects remote and missing items, including items within sight', () => {
    const state = createWorld(setup);
    expect(
      stepWorld(state, { type: 'pickup', agentId: 'a', itemId: 'wood' }).event
        ?.outcome,
    ).toBe('item-out-of-reach');
    expect(
      stepWorld(state, { type: 'pickup', agentId: 'a', itemId: 'missing' })
        .event?.outcome,
    ).toBe('item-not-found');
    expect(state.items).toHaveLength(2);
  });
});

describe('automatic perception and unsupported skills', () => {
  it('updates every observer after moving and picking up without a look action', () => {
    const initial = createWorld(setup);
    expect(initial.observations[0]?.agents).toEqual([]);
    expect(initial.observations[0]?.items.map((item) => item.id)).toEqual([
      'wood',
    ]);
    const moved = stepWorld(initial, move);
    expect(moved.observations[0]?.agents.map((entry) => entry.id)).toEqual([
      'b',
    ]);
    expect(moved.observations[1]?.agents.map((entry) => entry.id)).toEqual([
      'a',
    ]);
    expect(moved.observations.every((entry) => entry.tick === 1)).toBe(true);
    const picked = stepWorld(moved, {
      type: 'pickup',
      agentId: 'a',
      itemId: 'wood',
    });
    expect(
      picked.observations.every((entry) =>
        entry.items.every((item) => item.id !== 'wood'),
      ),
    ).toBe(true);
    expect(picked.observations[1]?.agents[0]).not.toHaveProperty('inventory');
    expect(picked.observations[0]?.self.inventory).toHaveLength(1);
  });
  it('uses an inclusive Euclidean circle, including radius zero', () => {
    expect(isVisible({ x: 0, y: 0 }, { x: 3, y: 4 }, 5)).toBe(true);
    expect(isVisible({ x: 0, y: 0 }, { x: 4, y: 4 }, 5)).toBe(false);
    const state = createWorld({ ...setup, settings: { visionRadius: 0 } });
    expect(
      state.observations.every(
        (entry) => entry.items.length === 0 && entry.agents.length === 0,
      ),
    ).toBe(true);
  });
  it('records an unavailable skill without executing, registering or changing entities', () => {
    const initial = createWorld(setup);
    const action: WorldAction = { type: 'try', agentId: 'a', skill: 'fly' };
    const next = stepWorld(initial, action);
    expect(next.event).toEqual({
      tick: 1,
      action,
      outcome: 'skill-unavailable',
    });
    expect(next.agents).toEqual(initial.agents);
    expect(next.items).toEqual(initial.items);
    expect(next.rules).toBe(initial.rules);
    expect(stepWorld(next, action).event?.outcome).toBe('skill-unavailable');
  });
  it.each(['move', ' PICKUP ', '\u5c1d\u8bd5'])(
    'does not execute an already supported skill requested via try: %s',
    (skill) => {
      const state = stepWorld(createWorld(setup), {
        type: 'try',
        agentId: 'a',
        skill,
      });
      expect(state.event?.outcome).toBe('skill-already-exists');
      expect(agent(state).position).toEqual({ x: 1, y: 1 });
    },
  );
  it('reproduces identical worlds for the same setup and command sequence', () => {
    const commands: readonly WorldAction[] = [
      move,
      { type: 'pickup', agentId: 'a', itemId: 'wood' },
      { type: 'try', agentId: 'b', skill: 'plant' },
    ];
    expect(commands.reduce(stepWorld, createWorld(setup))).toEqual(
      commands.reduce(stepWorld, createWorld(setup)),
    );
  });
});

describe('command boundary', () => {
  it.each([
    null,
    [],
    {},
    { type: 'fly', agentId: 'a' },
    { type: 'move', agentId: 'a', direction: 'diagonal' },
    { type: 'pickup', agentId: 'a' },
    { type: 'try', agentId: 'a', skill: ' ' },
  ])('rejects malformed commands: %j', (input) => {
    expect(() => parseWorldAction(input)).toThrow(RangeError);
  });
  it('does not advance for unknown agents and rejects unsafe or overflowing ticks', () => {
    const state = createWorld(setup);
    expect(() => stepWorld(state, { ...move, agentId: 'unknown' })).toThrow(
      'Unknown agent',
    );
    expect(state.tick).toBe(0);
    for (const tick of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER])
      expect(() => stepWorld({ ...state, tick }, move)).toThrow(RangeError);
    expect(
      stepWorld({ ...state, tick: Number.MAX_SAFE_INTEGER - 1 }, move).tick,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
});
