import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { initialOpenWorld } from '../../src/open-scenario.js';
export const examinationAction: V7Action = {
  interface: 'examine-food',
  args: { target: 'item:sample', method: 'open-inspect' },
};
export function examinationStep(w: V7World, action = examinationAction) {
  return v7Step(
    w,
    Object.fromEntries(
      w.actors.map((a) => [
        a.id,
        a.id === 'lin' ? action : { interface: 'wait', args: {} },
      ]),
    ),
    continuousRegistry(w),
  );
}
/** Isolated mechanics only; never supplied to formal agents. */
export function examinationFixture(quantity = 0.9, resource = 'plum') {
  const base = v7Clone(initialOpenWorld());
  base.objects = [];
  base.terrain = base.terrain.map((r) => '.'.repeat(r.length));
  const a = base.actors[0];
  if (!a) throw new Error('Missing isolated actor');
  a.position = { x: 8, y: 8 };
  base.stacks = [
    {
      id: 'sample',
      resource,
      owner: a.id,
      quantity,
      quantityTenths: Math.round(quantity * 10),
      origin: 'isolated-real-sample',
      harvestedAt: 0,
      decay: 0,
      position: { ...a.position },
    },
  ];
  return v7Clone(
    v7Install(base, continuousRegistry(base), 'food-examination@1'),
  );
}
export function examinationStudy(w: V7World) {
  let current = w;
  for (let i = 0; i < 2; i++)
    current = v7Clone(
      examinationStep(current, {
        interface: 'learn',
        args: { ability: 'examine-food' },
      }).world,
    );
  return current;
}
export function examinationFrames() {
  const before = examinationStudy(examinationFixture());
  const opened = examinationStep(before).world;
  const examined = examinationStep(opened).world;
  return [before, opened, examined].map((w) => v7Clone(w));
}
