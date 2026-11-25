import { expect, it } from 'vitest';
import { v7Clone } from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import {
  longOrdinaryInput,
  OPEN_GOAL_2,
  OPEN_LIFE_GOAL,
} from '../src/long-context.js';
import {
  CULTURE_EXCLUDED_WORDS,
  CULTURE_TENDENCIES,
  CULTURE_V2_OPTIONS,
} from '../src/long-culture.js';
import { longRequest, REST_FACT } from '../src/long-request.js';
import {
  initialLongWorld,
  LONG_CULTURE_V3_INCENTIVES_OBJECTIVE,
  LONG_CULTURE_V3_OBJECTIVE,
  longObjective,
  longScenario,
} from '../src/long-scenario.js';

const policy = (world: V7World) => {
  const p = world.config.longDevelopment;
  if (!p) throw new Error('Missing long policy');
  return p;
};

it('freezes both culture v3 scenarios as culture v2 with only the open-goal wording changed', () => {
  for (const [scenario, objective, incentives] of [
    ['long-culture-v3', LONG_CULTURE_V3_OBJECTIVE, false],
    ['long-culture-v3-incentives', LONG_CULTURE_V3_INCENTIVES_OBJECTIVE, true],
  ] as const) {
    const world = initialLongWorld('long-ex17', scenario);
    const p = policy(world);
    expect(p.scenario).toBe(
      incentives ? 'culture-v3-incentives' : 'culture-v3',
    );
    expect(p.culture).toEqual({
      ...CULTURE_V2_OPTIONS,
      incentives,
      goal: 'open-2',
    });
    expect(longScenario(p)).toBe(scenario);
    expect(longObjective(p)).toBe(objective);
    // Apart from the tag and the goal switch, the world is exactly the culture v2 genesis.
    const v2 = initialLongWorld(
      'long-ex17',
      incentives ? 'long-culture-v2-incentives' : 'long-culture-v2',
    );
    const strip = (w: V7World) => {
      const c = v7Clone(w);
      const q = policy(c);
      delete q.scenario;
      delete q.culture?.goal;
      return c;
    };
    expect(strip(world)).toEqual(strip(v2));
  }
  // The culture v2 genesis that ex16 verifies against keeps its own goal switch.
  expect(
    policy(initialLongWorld('long-ex16', 'long-culture-v2')).culture?.goal,
  ).toBe('open');
});

it('adds "with whom" to the open goal and a rest fact after the leaning, and nothing else', () => {
  const v3 = initialLongWorld('long-ex17', 'long-culture-v3');
  const v2 = initialLongWorld('long-ex17', 'long-culture-v2');
  v3.actors.forEach((actor, i) => {
    const leaning = CULTURE_TENDENCIES[i]?.leaning ?? '';
    const input = longOrdinaryInput(v3, actor.id);
    const request = longRequest('model', input);
    expect(input.longContext).toMatchObject({ goal: 'open-2', leaning });
    expect(input.packet.goal).toBe(OPEN_GOAL_2);
    expect(
      request.instructions.startsWith(
        `${OPEN_GOAL_2} You tend to value ${leaning}. ${REST_FACT} Names, stories`,
      ),
    ).toBe(true);
    expect(`${request.instructions}${JSON.stringify(input)}`).not.toMatch(
      CULTURE_EXCLUDED_WORDS,
    );
    // Every other part of the request equals culture v2.
    const old = longOrdinaryInput(v2, actor.id);
    const oldRequest = longRequest('model', old);
    expect(oldRequest.instructions).toBe(
      request.instructions
        .replace(` ${REST_FACT}`, '')
        .replace(OPEN_GOAL_2, OPEN_LIFE_GOAL),
    );
    expect({
      ...input,
      longContext: { ...input.longContext, goal: 'open' },
      packet: { ...input.packet, goal: OPEN_LIFE_GOAL },
    }).toEqual(old);
  });
  // The fact is true of the rest rule: at the energy cap, rest restores nothing.
  expect(REST_FACT).toContain('at full energy it restores nothing');
});
