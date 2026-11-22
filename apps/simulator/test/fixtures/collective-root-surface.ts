import {
  continuousRegistry,
  v7Install,
  v7Clone,
  collectiveJobs,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { combineFixture } from './collective-material-combine.js';
import { rootStep } from './collective-roots.js';
export const surfaceId = 'root-preparation-surface';
export function surfaceFixture() {
  let w = combineFixture();
  w = v7Clone(v7Install(w, continuousRegistry(w), 'root-preparation@2'));
  const a = w.actors[0],
    s = w.stacks.find((s) => s.id === 'fixture-bark-0');
  if (!a || !s) throw new Error('Missing actual fixture implements.');
  a.mastered.push(surfaceId);
  a.collective?.knownAbilities.push(surfaceId);
  s.quantity = 0.3;
  s.quantityTenths = 3;
  w.stacks = w.stacks.filter((s) => s.id !== 'fixture-bark-1');
  const root = w.stacks.find((s) => s.id === 'fixture-root');
  if (!root) throw new Error('Missing fixture roots.');
  root.quantity = 2;
  root.quantityTenths = 20;
  return w;
}
export const surfaceAction = (
  operation: string,
  args: V7Action['args'] = {},
): V7Action => ({ interface: surfaceId, args: { operation, ...args } });
export const assessSurface = surfaceAction('assess-surface', {
  barkId: 'fixture-bark-0',
  toolId: 'fixture-stone',
});
export const prepareSmall = surfaceAction('prepare-small', {
  barkId: 'fixture-bark-0',
  toolId: 'fixture-stone',
  rootId: 'fixture-root',
  quantity: 1,
});
export function surfaceMust(w: V7World, a: V7Action) {
  const r = rootStep(w, a);
  if (!r.outcomes['ash-1']?.success)
    throw new Error(r.outcomes['ash-1']?.reason);
  return r.world;
}
export const surfaceJob = (w: V7World) => collectiveJobs(w, surfaceId).at(-1);
export function surfaceFrames() {
  const initial = surfaceFixture(),
    assessed = surfaceMust(initial, assessSurface),
    partial = surfaceMust(assessed, prepareSmall),
    complete = surfaceMust(
      partial,
      surfaceAction('continue', { processId: surfaceJob(partial)?.id ?? '' }),
    ),
    cancelled = surfaceMust(
      partial,
      surfaceAction('cancel', { processId: surfaceJob(partial)?.id ?? '' }),
    );
  return { initial, assessed, partial, complete, cancelled };
}
