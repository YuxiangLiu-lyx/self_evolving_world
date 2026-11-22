import {
  continuousRegistry,
  v7Install,
  v7Clone,
  v7Step,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import { wovenFixture } from './open-woven.js';
export const waterAction = (
  mode: string,
  target = '',
  container = '',
  quantityMl = 0,
  project = 'cup-work',
  x = 0,
  y = 0,
): V7Action => ({
  interface: 'access-water',
  args: { mode, target, container, quantityMl, project, x, y },
});
export const waterStep = (w: V7World, action: V7Action) =>
  v7Step(
    w,
    Object.fromEntries(
      w.actors.map((a) => [
        a.id,
        a.id === 'lin' ? action : { interface: 'wait', args: {} },
      ]),
    ),
    continuousRegistry(w),
  );
export function waterAdvance(w: V7World, action: V7Action) {
  const r = waterStep(w, action);
  if (!r.outcomes.lin?.success) throw new Error(r.outcomes.lin?.reason);
  return v7Clone(r.world);
}
/** Authored isolated access/material fixture, never an ordinary input, supplied tool or formal action. */
export function waterFixture(study = true) {
  let w = v7Clone(
    v7Install(wovenFixture(), continuousRegistry(), 'river-contact-water@1'),
  );
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture actor');
  a.position = { x: 8.5, y: 8.5 };
  a.vitals.energy = 40;
  a.vitals.satiety = 100;
  w.terrain[8] = '.'.repeat(9) + '~' + '.'.repeat(w.config.width - 10);
  w.stacks.push({
    id: 'wet-clay',
    resource: 'clay',
    quantity: 1,
    owner: 'lin',
    position: { ...a.position },
    origin: 'isolated-clay',
  });
  if (study)
    for (let i = 0; i < 2; i++)
      w = waterAdvance(w, {
        interface: 'learn',
        args: { ability: 'access-water' },
      });
  return w;
}
export const cupForm = () =>
  waterAction('form-cup', 'wet-clay', '', 0, 'cup-work', 8.5, 9);
export function waterCupWorld() {
  let w = waterFixture();
  for (let i = 0; i < 3; i++) w = waterAdvance(w, cupForm());
  return w;
}
export function waterFrames() {
  let w = waterFixture();
  const frames = [w];
  w = waterAdvance(w, waterAction('inspect', 'river:9:8'));
  frames.push(w);
  w = waterAdvance(w, cupForm());
  frames.push(w);
  w = waterAdvance(w, cupForm());
  w = waterAdvance(w, cupForm());
  const cup = w.stacks.find((s) => s.waterCup);
  if (!cup) throw new Error('Missing fixture cup');
  w = waterAdvance(w, waterAction('fill', 'river:9:8', cup.id, 80));
  frames.push(w);
  w = waterAdvance(w, {
    interface: 'pickup',
    args: { target: cup.id, quantity: 1 },
  });
  frames.push(w);
  w = v7Clone(w);
  const brittle = w.stacks.find((s) => s.id === cup.id);
  if (!brittle?.waterCup) throw new Error('Missing fixture cup state');
  // A separately declared wear-boundary fixture, not elapsed formal wear or an autonomous collapse.
  brittle.waterCup.wallMass = 0.45005;
  w = waterAdvance(w, { interface: 'wait', args: {} });
  frames.push(w);
  return frames;
}
