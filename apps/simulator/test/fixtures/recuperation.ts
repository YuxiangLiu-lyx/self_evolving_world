import { v7Clone, v7Install } from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { willowFixture, willowStudy } from './willow.js';
import { fireRegistry, fireOperation } from './local-fire.js';
export const recuperationAction = (rounds = 4): V7Action => ({
  interface: 'recuperate',
  args: { rounds },
});
export function recuperationFixture(): V7World {
  let w = willowFixture();
  w.tick = 80;
  w.time = 80;
  w.objects = [];
  w.stacks = [];
  w.actors.forEach((a) => {
    a.vitals = { health: 80, satiety: 95, energy: 20, temperature: 18 };
  });
  w = v7Clone(v7Install(w, fireRegistry, 'recuperate@1'));
  return w;
}
export const recuperationStudy = (w: V7World) =>
  willowStudy(w, 'recuperate', 3);
export function recuperationFrames() {
  const w = recuperationStudy(recuperationFixture());
  const r = fireOperation(w, recuperationAction(6));
  if (r.outcomes.some((o) => !o?.success))
    throw new Error(JSON.stringify(r.outcomes));
  return r;
}
