import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7World,
  V7Action,
  V7Data,
} from '@self-evolving-world/world-core';
import { initialOpenWorld } from '../../src/open-scenario.js';
export const refugeAction = (
  mode: string,
  project = 'refuge-build',
  materials: V7Data[] = [],
  target = '',
): V7Action => ({
  interface: 'resting-shelter',
  args: { mode, project, target, materials, x: 8, y: 8, angle: 0 },
});
export const refugeStep = (w: V7World, action: V7Action) =>
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
/** Deliberately dry and adequate isolated material; never copied to formal inventory. */
export function refugeFixture() {
  let w = v7Clone(initialOpenWorld());
  w.objects = [];
  w.terrain = w.terrain.map((r) => '.'.repeat(r.length));
  w.stacks = [];
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture actor');
  a.position = { x: 8, y: 8 };
  for (const resource of ['branch', 'reed', 'vine']) {
    const mass = w.resources.find((r) => r.id === resource)?.mass ?? 1;
    w.stacks.push({
      id: `fixture-${resource}`,
      resource,
      owner: a.id,
      origin: `fixture-${resource}`,
      quantity: 10,
      quantityTenths: 100,
      position: { ...a.position },
      physical: { unitMass: mass, unitWater: 0, unitSolids: mass },
    });
  }
  w = v7Clone(v7Install(w, continuousRegistry(w), 'resting-shelter@1'));
  for (let i = 0; i < 4; i++)
    w = v7Clone(
      refugeStep(w, {
        interface: 'learn',
        args: { ability: 'resting-shelter' },
      }).world,
    );
  return w;
}
export function refugeTested() {
  let w = refugeFixture();
  for (const resource of ['branch', 'reed', 'vine'])
    for (let i = 0; i < 2; i++) {
      const r = refugeStep(
        w,
        refugeAction('test', `test-${resource}`, [
          { item: `fixture-${resource}`, quantity: 0.1 },
        ]),
      );
      if (!r.outcomes.lin?.success) throw new Error(r.outcomes.lin?.reason);
      w = v7Clone(r.world);
    }
  return w;
}
export const refugeAllocation = [
  { item: 'fixture-branch', quantity: 6 },
  { item: 'fixture-reed', quantity: 6 },
  { item: 'fixture-vine', quantity: 2 },
];
export function refugeFrames() {
  let w = refugeTested();
  const frames: V7World[] = [];
  for (let i = 0; i < 10; i++) {
    const r = refugeStep(
      w,
      refugeAction('build', 'refuge-build', refugeAllocation),
    );
    if (!r.outcomes.lin?.success) throw new Error(r.outcomes.lin?.reason);
    w = v7Clone(r.world);
    frames.push(w);
  }
  return frames;
}
