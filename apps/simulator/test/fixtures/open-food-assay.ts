import {
  v7Clone,
  v7Install,
  continuousRegistry,
  v7Step,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { examinationFixture } from './open-food-examination.js';
export const assayAction = (
  mode: string,
  target: string,
  apparatus = '',
  controls: string[] = [],
  quantity = 1,
): V7Action => ({
  interface: 'food-assay',
  args: { mode, target, apparatus, controls, quantity },
});
export const assayStep = (w: V7World, action: V7Action) =>
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
export const balanceAction = () =>
  assayAction('prepare-balance', 'branch', '', [
    'vine',
    'bark',
    'hammer',
    'comparison',
  ]);
export function assayFixture() {
  let w = v7Clone(
    v7Install(
      examinationFixture(2, 'hazelnut'),
      continuousRegistry(),
      'food-assay@1',
    ),
  );
  for (const [id, resource, quantity] of [
    ['branch', 'branch', 1],
    ['vine', 'vine', 1],
    ['bark', 'bark', 0.8],
    ['hammer', 'flint', 1],
    ['comparison', 'stone', 1],
  ] as const)
    w.stacks.push({
      id,
      resource,
      quantity,
      quantityTenths: Math.round(quantity * 10),
      owner: 'lin',
      origin: 'isolated-assay-input',
      position: { x: 8, y: 8 },
    });
  for (let i = 0; i < 5; i++)
    w = v7Clone(
      assayStep(w, { interface: 'learn', args: { ability: 'food-assay' } })
        .world,
    );
  return w;
}
export function assayEquipmentFrames() {
  let w = assayFixture();
  const frames = [w];
  for (let i = 0; i < 9; i++) {
    const r = assayStep(w, balanceAction());
    if (!r.outcomes.lin?.success) throw new Error(r.outcomes.lin?.reason);
    w = v7Clone(r.world);
    frames.push(w);
  }
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture actor');
  a.position.y = 8.65;
  for (let i = 0; i < 2; i++) {
    const r = assayStep(w, assayAction('prepare-dryer', 'bark'));
    if (!r.outcomes.lin?.success) throw new Error(r.outcomes.lin?.reason);
    w = v7Clone(r.world);
    frames.push(w);
  }
  return frames;
}
export function assayMeasurement(w: V7World) {
  const balance = w.objects.find((o) => o.kind === 'comparison-balance'),
    weight = w.stacks.find((s) => s.processing?.comparisonWeight);
  if (!balance || !weight) throw new Error('Missing actual equipment');
  return assayAction('dry-mass', 'sample', balance.id, [weight.id], 1);
}
