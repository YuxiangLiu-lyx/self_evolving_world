import {
  v7Clone,
  v7Install,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { rootFixture, rootStep } from './collective-roots.js';
export function barkFixture() {
  let w = rootFixture();
  w = v7Clone(v7Install(w, continuousRegistry(w), 'bark-extraction@1'));
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture actor.');
  a.mastered.push('bark-extraction');
  a.collective?.knownAbilities.push('bark-extraction');
  w.stacks = w.stacks.filter((s) => s.resource !== 'bark');
  w.stacks.push({
    id: 'fixture-branch',
    resource: 'branch',
    quantity: 4,
    owner: a.id,
    position: { ...a.position },
    origin: 'fixture-real-branch-source',
    harvestedAt: 0,
    decay: 0,
  });
  w.objects.push({
    id: 'fixture-tree',
    kind: 'tree',
    name: 'Unspecified standing trunk',
    spatial: {
      x: 10.7,
      y: 10,
      angle: 0,
      shape: { kind: 'circle', radius: 0.2 },
      solid: true,
      interaction: 0.65,
      entrances: [],
    },
    visual: {
      component: 'tree',
      color: '#496f45',
      accent: '#88705b',
      label: 'Standing tree',
      state: 'ordinary',
    },
    data: { resource: 'branch', stock: 2, capacity: 2 },
    createdBy: null,
    createdAt: 0,
    revision: 'foundation-forest@1',
  });
  return w;
}
export const barkAction = (
  action: string,
  extra: V7Action['args'] = {},
): V7Action => ({ interface: 'bark-extraction', args: { action, ...extra } });
export function barkMust(w: V7World, action: V7Action) {
  const r = rootStep(w, action);
  if (!r.outcomes['ash-1']?.success)
    throw new Error(r.outcomes['ash-1']?.reason);
  return r.world;
}
export function barkFrames() {
  const initial = barkFixture(),
    assessed = barkMust(
      initial,
      barkAction('assess', { targetId: 'object:fixture-tree' }),
    );
  let ready = barkMust(
    assessed,
    barkAction('assess', { targetId: 'item:fixture-stone' }),
  );
  ready = barkMust(
    ready,
    barkAction('assess', { targetId: 'item:fixture-branch' }),
  );
  const partial = barkMust(
    ready,
    barkAction('peel', {
      targetId: 'item:fixture-branch',
      toolId: 'item:fixture-stone',
      quantity: 4,
    }),
  );
  let complete = partial;
  for (let i = 1; i < 8; i++) complete = barkMust(complete, barkAction('peel'));
  const stopped = barkMust(partial, barkAction('cancel'));
  return { initial, assessed, ready, partial, complete, stopped };
}
