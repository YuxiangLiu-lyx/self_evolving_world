import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { v7Clone } from '@self-evolving-world/world-core';
import type { V7Execution } from '../apps/simulator/src/continuous-run.js';
import { assertContinuousTechnicalRepair } from './task-continuous-repair.js';

it('permits only the retained unsettled computation pause and refuses ambiguous calls, completed targets and exhausted development budgets', () => {
  const state = JSON.parse(
    readFileSync(
      'experiment/ex8/technical-pauses/round-166/execution.json',
      'utf8',
    ),
  ) as V7Execution;
  expect(() => {
    assertContinuousTechnicalRepair(state);
  }).not.toThrow();
  for (const change of [
    (s: V7Execution) => {
      s.reason = 'Ordinary decision budget exhausted';
    },
    (s: V7Execution) => {
      s.windowTarget = s.world.tick;
    },
    (s: V7Execution) => {
      s.phase = 'window-complete';
    },
    (s: V7Execution) => {
      s.world.config = {
        ...s.world.config,
        budgets: { ...s.world.config.budgets, development: 0 },
      };
    },
    (s: V7Execution) => {
      const a = s.attempts[0];
      if (a) a.status = 'started';
    },
  ]) {
    const changed = v7Clone(state);
    change(changed);
    expect(() => {
      assertContinuousTechnicalRepair(changed);
    }).toThrow('Only a durable');
  }
});
