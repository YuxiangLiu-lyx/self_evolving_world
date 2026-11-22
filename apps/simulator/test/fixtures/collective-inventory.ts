import {
  continuousRegistry,
  v7Clone,
  v7Install,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { rootFixture, rootStep } from './collective-roots.js';
export const inventoryId = 'inventory-inspection';
export function inventoryFixture() {
  let w = rootFixture();
  w = v7Clone(v7Install(w, continuousRegistry(w), inventoryId + '@1'));
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture actor.');
  a.mastered.push(inventoryId);
  a.collective?.knownAbilities.push(inventoryId);
  w.stacks = w.stacks.filter((s) => s.resource !== 'root');
  for (let i = 0; i < 18; i++)
    w.stacks.push({
      id: 'owned-' + String(i).padStart(2, '0'),
      resource: i % 2 ? 'branch' : 'stone',
      quantity: 1,
      owner: a.id,
      position: { ...a.position },
      origin: 'private-inventory-fixture',
      processing: { concealedTestProperty: 'not-for-context' },
    });
  w.stacks.push({
    id: 'another-person-private',
    resource: 'stone',
    quantity: 3,
    owner: 'ash-2',
    position: { ...a.position },
    origin: 'not-shared',
  });
  w.stacks.push({
    id: 'actual-ground',
    resource: 'stone',
    quantity: 2,
    owner: null,
    position: { ...a.position },
    origin: 'not-carried',
  });
  return w;
}
export const inventoryAction = (args: V7Action['args'] = {}): V7Action => ({
  interface: inventoryId,
  args,
});
export function inventoryMust(w: V7World, a: V7Action) {
  const r = rootStep(w, a);
  if (!r.outcomes['ash-1']?.success)
    throw new Error(r.outcomes['ash-1']?.reason);
  return r.world;
}
export function inventoryFrames() {
  const initial = inventoryFixture(),
    first = inventoryMust(initial, inventoryAction()),
    second = inventoryMust(first, inventoryAction({ mode: 'page', page: 1 })),
    dropped = inventoryMust(second, {
      interface: 'drop',
      args: { target: 'owned-00', quantity: 1 },
    }),
    changed = inventoryMust(
      dropped,
      inventoryAction({ mode: 'page', page: 1 }),
    ),
    unavailable = inventoryMust(
      changed,
      inventoryAction({ mode: 'item', itemId: 'another-person-private' }),
    );
  return { initial, first, second, dropped, changed, unavailable };
}
