import { expect, it } from 'vitest';
import {
  v7Clone,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { longVisibleAbilities } from '../src/long-capability-view.js';
import { longRetrieve, longOrdinaryInput } from '../src/long-context.js';
it('withholds unseen scoped object identities in capability details and search, while preserving personal current/history and public functionality', () => {
  let w = v7Clone(initialLongWorld('long-ex13'));
  const hidden = w.objects.find((o) => o.id === 'start-1-roots');
  if (!hidden) throw new Error('Missing remote fixture source');
  const a = w.abilities[0];
  if (!a) throw new Error('Missing baseline');
  w.abilities.push({
    ...a,
    id: 'fixture-scoped',
    authored: false,
    learning: 1,
    function: 'Fixture scoped operation',
    costs: 'Only nominated source ' + hidden.id,
    handler: 'fixture-unused',
  });
  const original = JSON.stringify(w.abilities);
  expect(JSON.stringify(longVisibleAbilities(w, 'lin'))).not.toContain(
    'Only nominated source ' + hidden.id,
  );
  expect(
    JSON.stringify(
      longRetrieve(w, 'lin', 'ordinary', [
        {
          section: 'abilities',
          search: hidden.id,
          ids: [],
          offset: 0,
          part: 0,
        },
      ]),
    ),
  ).not.toContain('fixture-scoped');
  expect(
    JSON.stringify(
      longRetrieve(w, 'lin', 'ordinary', [
        {
          section: 'abilities',
          search: '',
          ids: ['fixture-scoped'],
          offset: 0,
          part: 0,
        },
      ]),
    ),
  ).toContain('[unobserved instance]');
  expect(JSON.stringify(longOrdinaryInput(w, 'lin'))).not.toContain(
    'Only nominated source ' + hidden.id,
  );
  const lin = w.actors[0];
  if (!lin) throw new Error('Missing actor');
  lin.position = { x: hidden.spatial.x + 1, y: hidden.spatial.y };
  w = v7Clone(
    v7Step(
      w,
      {
        lin: { interface: 'wait', args: {} },
        moss: { interface: 'wait', args: {} },
        sol: { interface: 'wait', args: {} },
      },
      continuousRegistry(w),
    ).world,
  );
  expect(JSON.stringify(longVisibleAbilities(w, 'lin'))).toContain(
    'Only nominated source ' + hidden.id,
  );
  const moved = w.actors[0];
  if (!moved) throw new Error('Missing actor');
  moved.position = { x: 6, y: 8 };
  expect(JSON.stringify(longVisibleAbilities(w, 'lin'))).toContain(
    'Only nominated source ' + hidden.id,
  );
  expect(JSON.stringify(longVisibleAbilities(w, 'world'))).toBe(original);
});
