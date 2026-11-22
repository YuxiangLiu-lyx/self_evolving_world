import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import { refugeFixture, refugeAction } from './open-shelter.js';
export function diagnosticFixture(patched = true) {
  let w = refugeFixture();
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture actor');
  w.actors = [a];
  a.id = 'moss';
  a.name = 'Moss';
  a.position = { x: 16.83037938, y: 12.18312709 };
  // Exact branch identity/lineage/quantity from the retained round-113 failure, copied only into an isolated test.
  w.stacks = [
    {
      id: 'item-112-moss-648',
      resource: 'branch',
      quantity: 1,
      position: { ...a.position },
      owner: 'moss',
      origin: 'forest-branch-0',
      harvestedAt: 112,
      quantityTenths: 10,
    },
  ];
  if (patched)
    w = v7Clone(
      v7Install(w, continuousRegistry(w), 'shelter-reference-diagnostics@1'),
    );
  return w;
}
export const diagnosticAction = (target = 'item:item-112-moss-648') =>
  refugeAction('inspect', 'resting-refuge', [], target);
export const diagnosticStep = (
  w: V7World,
  action: V7Action = diagnosticAction(),
) => v7Step(w, { moss: action }, continuousRegistry(w));
export function diagnosticFrames() {
  let w = diagnosticFixture();
  const frames: V7World[] = [];
  for (const action of [
    diagnosticAction('item:item:missing'),
    diagnosticAction(),
    refugeAction('test', 'actual-trial', [
      { item: 'item:item-112-moss-648', quantity: 0.1 },
    ]),
    refugeAction('test', 'actual-trial', [
      { item: 'item:item-112-moss-648', quantity: 0.1 },
    ]),
    diagnosticAction(),
  ]) {
    w = v7Clone(diagnosticStep(w, action).world);
    frames.push(w);
  }
  return frames;
}
