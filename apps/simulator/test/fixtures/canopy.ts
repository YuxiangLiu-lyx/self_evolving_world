import { v7Clone, v7Install, v7Step } from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { willowFixture, willowStudy } from './willow.js';
import { fireRegistry, fireOperation, fireWait } from './local-fire.js';
export const canopyAction: V7Action = {
  interface: 'rain-canopy-work',
  args: {
    mode: 'build',
    x: 10,
    y: 8.5,
    angle: 0,
    materials: [
      { target: 'item:fixture-branch', quantity: 4 },
      { target: 'item:fixture-bark', quantity: 6 },
      { target: 'item:fixture-vine', quantity: 2 },
    ],
  },
};
export function canopyFixture(): V7World {
  let w = willowFixture();
  w.objects = [];
  w.tick = 515;
  w.time = 515;
  // Authored isolated materials for verification, never supplied to a formal actor.
  for (const s of w.stacks)
    if (s.resource === 'bark') s.quantity = 14;
    else if (s.resource === 'vine') s.quantity = 6;
  w = v7Clone(v7Install(w, fireRegistry, 'rain-canopy@1'));
  return w;
}
export const canopyStudy = (w: V7World) =>
  willowStudy(w, 'rain-canopy-work', 5);
export function canopyFrames() {
  let w = canopyStudy(canopyFixture());
  const built = fireOperation(w, canopyAction);
  w = willowStudy(built.world, 'portable-insulation', 4);
  const worker = w.actors[0];
  if (!worker) throw new Error('Missing isolated worker');
  worker.vitals.temperature = 20;
  w = fireOperation(w, {
    interface: 'portable-insulation',
    args: { mode: 'craft' },
  }).world;
  const mantle = w.stacks.find((s) => s.mantle);
  if (!mantle) throw new Error('Missing paid fixture mantle');
  w = fireOperation(w, {
    interface: 'portable-insulation',
    args: { mode: 'equip', target: mantle.id },
  }).world;
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture actor');
  a.position = { x: 10, y: 8.5 };
  a.vitals.satiety = 80;
  a.vitals.temperature = 10;
  for (let i = 0; i < 3; i++)
    w = v7Clone(
      v7Step(
        w,
        { lin: { interface: 'rest', args: {} }, moss: fireWait, sol: fireWait },
        fireRegistry,
      ).world,
    );
  return { built, covered: w };
}
