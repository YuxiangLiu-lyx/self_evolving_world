import { expect, it } from 'vitest';
import {
  FOREST_BASE,
  FOREST_PERCEPTION,
  v7Clone,
  v7Install,
  v7Registry,
  v7Step,
} from '../src/index.js';
import { forestPerception } from '../src/forest-perception.js';
import { forestFixture } from './fixtures/forest-extension.js';

it('emits personally grounded meetings, discoveries and environmental changes only after versioned installation', () => {
  const before = forestFixture();
  const a = before.actors[0],
    b = before.actors[1];
  if (!a || !b) throw new Error('Missing fixture actors');
  b.position = { x: 15, y: 15 };
  const old = v7Clone(before);
  const moved = old.actors[1];
  if (!moved) throw new Error('Missing actor');
  moved.position = { x: 3, y: 2 };
  old.time = 40;
  forestPerception(before, old);
  expect(old.events.some((e) => e.type === 'actor-seen')).toBe(false);
  const installed = v7Clone(
    v7Install(
      old,
      v7Registry([FOREST_BASE, FOREST_PERCEPTION]),
      'forest-perception@1',
    ),
  );
  const actor = installed.actors[0];
  if (!actor) throw new Error('Missing actor');
  actor.memory.discoveries = { berry: { nutrition: 8, toxicity: 0 } };
  forestPerception(before, installed);
  expect(
    installed.events.some(
      (e) => e.actor === 'a' && e.type === 'actor-seen' && e.target === 'b',
    ),
  ).toBe(true);
  expect(
    installed.events.some(
      (e) => e.actor === 'a' && e.type === 'discovered' && e.target === 'berry',
    ),
  ).toBe(true);
  expect(installed.events.some((e) => e.type === 'weather-changed')).toBe(true);
  const next = v7Step(
    installed,
    { a: { interface: 'wait', args: {} }, b: { interface: 'wait', args: {} } },
    v7Registry([FOREST_BASE, FOREST_PERCEPTION]),
  );
  expect(
    next.world.events.some((e) =>
      ['actor-seen', 'discovered'].includes(e.type),
    ),
  ).toBe(false);
});
