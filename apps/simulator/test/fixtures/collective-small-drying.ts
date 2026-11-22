import {
  continuousRegistry,
  v7Clone,
  v7Install,
  collectiveJobs,
  smallDryingAssessment,
  rootWater,
  rootProcessing,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { surfaceFixture, surfaceMust } from './collective-root-surface.js';
export const smallId = 'root-small-drying';
export const smallAction = (
  operation: string,
  args: V7Action['args'] = {},
): V7Action => ({ interface: smallId, args: { operation, ...args } });
export function smallFixture() {
  let w = surfaceFixture();
  w = v7Clone(v7Install(w, continuousRegistry(w), smallId + '@1'));
  const a = w.actors[0],
    b = w.stacks.find((s) => s.id === 'fixture-bark-0');
  if (!a || !b) throw new Error('Missing fixture inputs.');
  a.mastered.push(smallId);
  a.collective?.knownAbilities.push(smallId);
  b.quantity = 0.2;
  b.quantityTenths = 2;
  return w;
}
export const smallJob = (w: V7World) => collectiveJobs(w, smallId).at(-1);
export const smallSupport = (w: V7World) => {
  const o = w.objects.find((o) => o.kind === 'small-root-drying-support');
  if (!o) throw new Error('Missing actual fixture support.');
  return o;
};
export const smallAssessAction = smallAction('assess', {
  site: { x: 10.6, y: 10 },
  barkId: 'fixture-bark-0',
  stoneIds: ['fixture-stone'],
  sampleId: 'fixture-root',
});
export function smallFrames() {
  const initial = smallFixture(),
    assessed = surfaceMust(initial, smallAssessAction),
    assessment = smallDryingAssessment(present(assessed.actors[0]));
  const partial = surfaceMust(
      assessed,
      smallAction('build', { assessmentId: assessment?.id ?? '' }),
    ),
    built = surfaceMust(
      partial,
      smallAction('continue', { processId: smallJob(partial)?.id ?? '' }),
    ),
    supportId = smallSupport(built).id;
  const loaded = surfaceMust(
      built,
      smallAction('load', { supportId, sampleId: 'fixture-root' }),
    ),
    dry = v7Clone(loaded),
    sample = dry.stacks.find((s) => s.id === smallSupport(dry).data.foodId);
  if (!sample) throw new Error('Missing real fixture sample.');
  // Isolated selected weather, never used by formal scenario, input or archived run.
  for (let tick = 40; tick < 200; tick++) {
    dry.tick = tick;
    dry.time = tick;
    dry.events = [];
    rootWater(dry, sample);
    if (rootProcessing(dry, sample)?.dry) break;
  }
  const cancelled = surfaceMust(
    partial,
    smallAction('cancel', { processId: smallJob(partial)?.id ?? '' }),
  );
  const blocked = v7Clone(loaded);
  present(blocked.actors[1]).position = { x: 10.4, y: 10.28 };
  blocked.tick = 40;
  blocked.time = 40;
  blocked.events = [];
  const food = blocked.stacks.find(
    (s) => s.id === smallSupport(blocked).data.foodId,
  );
  if (food) rootWater(blocked, food);
  return { initial, assessed, partial, built, loaded, dry, blocked, cancelled };
}

function present<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('Missing fixture actor.');
  return v;
}
