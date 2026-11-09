import { describe, expect, it } from 'vitest';
import {
  CORE_RULES,
  createSurvivalWorld,
  MILD_SURVIVAL,
  parseSurvivalConfig,
  stepSurvivalRound,
} from '../src/index.js';
import type { SurvivalConfig, WorldSetup, WorldState } from '../src/index.js';

const setup: WorldSetup = {
  agents: [
    { id: 'a', name: 'A', position: { x: 1, y: 1 } },
    { id: 'b', name: 'B', position: { x: 3, y: 1 } },
  ],
  items: [{ id: 'wood', name: 'Wood', position: { x: 1, y: 1 } }],
};
const wait = (state: WorldState) =>
  stepSurvivalRound(
    state,
    state.agents.map((a) => ({ type: 'wait', agentId: a.id })),
  );
describe('versioned survival extension', () => {
  it('keeps all three vital hazards mild for sixty rounds without disabling damage rules', () => {
    const initial = createSurvivalWorld(setup);
    let state = initial;
    for (let i = 0; i < 60; i++) state = wait(state);
    expect(state.tick).toBe(60);
    expect(state.survival?.vitals.a).toEqual({
      satiety: 70,
      health: 100,
      cold: 0,
      heat: 0,
    });
    expect(initial.survival?.vitals.a?.satiety).toBe(100);
    expect(state.rules).toBe(CORE_RULES);
    expect(Object.isFrozen(state.survival?.vitals)).toBe(true);
  });
  it.each([-10, 40])(
    'takes persistent temperature damage and dies at %s C',
    (temperature) => {
      let state = createSurvivalWorld(setup, {
        ...MILD_SURVIVAL,
        temperature,
        damage: 10,
        initial: {
          satiety: 100,
          health: 20,
          cold: temperature < 10 ? 68 : 0,
          heat: temperature > 30 ? 68 : 0,
        },
      });
      state = wait(state);
      expect(state.survival?.vitals.a?.health).toBe(10);
      state = wait(state);
      expect(state.survival?.vitals.a?.health).toBe(0);
      const dead = state;
      state = stepSurvivalRound(state, [
        { type: 'pickup', agentId: 'a', itemId: 'wood' },
        { type: 'move', agentId: 'b', direction: 'east' },
      ]);
      expect(state.agents).toEqual(dead.agents);
      expect(state.items).toEqual(dead.items);
      expect(state.survival?.vitals).toEqual(dead.survival?.vitals);
      expect(state.survival?.events.map((e) => e.outcome)).toEqual([
        'dead',
        'dead',
      ]);
    },
  );
  it('adds starvation and exposure damage after updates and recovers exposure in safe temperatures', () => {
    const config: SurvivalConfig = {
      ...MILD_SURVIVAL,
      temperature: 40,
      initial: { satiety: 20, heat: 68, cold: 72, health: 100 },
    };
    const next = wait(createSurvivalWorld(setup, config));
    expect(next.survival?.vitals.a).toEqual({
      satiety: 19.5,
      heat: 70,
      cold: 71,
      health: 94,
    });
    const safe = wait(
      createSurvivalWorld(setup, {
        ...config,
        temperature: 22,
        initial: { satiety: 20.5, heat: 70, cold: 70, health: 100 },
      }),
    );
    expect(safe.survival?.vitals.a).toEqual({
      satiety: 20,
      heat: 69,
      cold: 69,
      health: 100,
    });
  });
  it('resolves simultaneous conflicts without actor priority and retains idle occupancy', () => {
    const initial = createSurvivalWorld(setup);
    const inputs = [
      { type: 'move', agentId: 'a', direction: 'east' },
      { type: 'move', agentId: 'b', direction: 'west' },
    ] as const;
    const next = stepSurvivalRound(initial, inputs);
    expect(next.agents).toEqual(initial.agents);
    expect(next.survival?.events.map((e) => e.outcome)).toEqual([
      'occupied',
      'occupied',
    ]);
    expect(stepSurvivalRound(initial, [...inputs].reverse())).toEqual(next);
    const closer = createSurvivalWorld({
      agents: [
        { id: 'a', name: 'A', position: { x: 1, y: 1 } },
        { id: 'b', name: 'B', position: { x: 2, y: 1 } },
      ],
    });
    expect(
      stepSurvivalRound(closer, [
        { type: 'move', agentId: 'a', direction: 'east' },
        { type: 'wait', agentId: 'b' },
      ]).survival?.events[0]?.outcome,
    ).toBe('occupied');
  });
  it('collects and denies learning together while preserving the fixed skills', () => {
    const initial = createSurvivalWorld(setup);
    const next = stepSurvivalRound(initial, [
      { type: 'pickup', agentId: 'a', itemId: 'wood' },
      { type: 'learn', agentId: 'b', skill: 'shelter' },
    ]);
    expect(next.tick).toBe(1);
    expect(next.items).toEqual([]);
    expect(next.agents[0]?.inventory).toEqual([{ id: 'wood', name: 'Wood' }]);
    expect(next.survival?.events[1]?.outcome).toBe('learning-denied');
    expect(next.rules.skills).toEqual(['move', 'pickup', 'try']);
    expect(next.agents[1]).toBe(initial.agents[1]);
  });
  it('copies configuration and rejects malformed settings and incomplete actor rounds', () => {
    const config = { ...MILD_SURVIVAL, initial: { ...MILD_SURVIVAL.initial } };
    const state = createSurvivalWorld(setup, config);
    config.initial.health = 0;
    expect(state.survival?.vitals.a?.health).toBe(100);
    expect(() =>
      parseSurvivalConfig({ ...config, temperature: Number.NaN }),
    ).toThrow();
    expect(() => parseSurvivalConfig({ ...config, damage: 0 })).toThrow();
    expect(() =>
      stepSurvivalRound(state, [{ type: 'wait', agentId: 'a' }]),
    ).toThrow();
    expect(() =>
      stepSurvivalRound(state, [
        { type: 'wait', agentId: 'a' },
        { type: 'wait', agentId: 'a' },
      ]),
    ).toThrow();
  });
});
