import {
  continuousRegistry,
  v7Install,
  v7Clone,
  v7Step,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { examinationFixture } from './open-food-examination.js';
export const hardnessAction = (
  mode: string,
  target = 'stone',
  reference = '',
  project = 'surface-study',
): V7Action => ({
  interface: 'hardness-assessment',
  args: { mode, target, reference, project },
});
export const hardnessStep = (w: V7World, action: V7Action) =>
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
export function hardnessFixture() {
  let w = v7Clone(
    v7Install(
      examinationFixture(),
      continuousRegistry(),
      'hardness-assessment@1',
    ),
  );
  w.stacks = [];
  for (const [id, resource] of [
    ['stone', 'stone'],
    ['flint', 'flint'],
    ['second-stone', 'stone'],
  ] as const)
    w.stacks.push({
      id,
      resource,
      quantity: 1,
      quantityTenths: 10,
      owner: 'lin',
      origin: `isolated-${resource}`,
      position: { x: 8, y: 8 },
    });
  for (let i = 0; i < 3; i++)
    w = v7Clone(
      hardnessStep(w, {
        interface: 'learn',
        args: { ability: 'hardness-assessment' },
      }).world,
    );
  return w;
}
export function hardnessFrames() {
  let w = hardnessFixture();
  const frames: V7World[] = [];
  for (const action of [
    hardnessAction('inspect'),
    hardnessAction('compare', 'stone', 'flint'),
    hardnessAction('compare', 'stone', 'flint'),
  ]) {
    const r = hardnessStep(w, action);
    if (!r.outcomes.lin?.success) throw new Error(r.outcomes.lin?.reason);
    w = v7Clone(r.world);
    frames.push(w);
  }
  const specimen = w.stacks.find(
    (s) => s.resource === 'stone' && s.processing?.hardnessComparison,
  );
  if (!specimen) throw new Error('Missing altered specimen');
  w = v7Clone(hardnessStep(w, hardnessAction('assess', specimen.id)).world);
  frames.push(w);
  return frames;
}
