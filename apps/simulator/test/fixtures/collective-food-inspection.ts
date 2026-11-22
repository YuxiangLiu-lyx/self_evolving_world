import {
  continuousRegistry,
  v7Clone,
  v7Install,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { rootFixture, rootStep } from './collective-roots.js';
export const inspectionId = 'non-ingestive-food-inspection';
export function inspectionFixture() {
  let w = rootFixture();
  w = v7Clone(v7Install(w, continuousRegistry(w), inspectionId + '@1'));
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture member.');
  a.mastered.push(inspectionId);
  a.collective?.knownAbilities.push(inspectionId);
  w.stacks.push({
    id: 'fixture-hazelnut',
    resource: 'hazelnut',
    quantity: 1,
    owner: a.id,
    position: { ...a.position },
    origin: 'isolated-nut-source',
    harvestedAt: 0,
    decay: 10,
  });
  return w;
}
export const inspectionAction = (
  action: string,
  args: V7Action['args'] = {},
): V7Action => ({ interface: inspectionId, args: { action, ...args } });
export const inspectionStart = inspectionAction('start', {
  sampleId: 'item:fixture-hazelnut',
  toolId: 'item:fixture-stone',
});
export function inspectionMust(w: V7World, a: V7Action) {
  const r = rootStep(w, a);
  if (!r.outcomes['ash-1']?.success)
    throw new Error(r.outcomes['ash-1']?.reason);
  return r.world;
}
export function inspectionFrames() {
  const initial = inspectionFixture(),
    inspected = inspectionMust(
      initial,
      inspectionAction('inspect', { sampleId: 'item:fixture-hazelnut' }),
    ),
    partial = inspectionMust(inspected, inspectionStart),
    complete = inspectionMust(partial, inspectionAction('continue')),
    stopped = inspectionMust(partial, inspectionAction('cancel'));
  return { initial, inspected, partial, complete, stopped };
}
