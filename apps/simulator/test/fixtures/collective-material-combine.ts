import {
  v7Clone,
  v7Install,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { barkFrames } from './collective-bark.js';
import { rootStep, trayBuild } from './collective-roots.js';
export const combineId = 'material-stack-combine';
export function combineFixture() {
  let w = barkFrames().complete;
  w = v7Clone(v7Install(w, continuousRegistry(w), combineId + '@1'));
  const a = w.actors[0],
    source = w.stacks.find((s) => s.resource === 'bark');
  if (!a || !source) throw new Error('Missing actual peeled fixture supply.');
  w.objects = w.objects.filter((o) => o.id !== 'fixture-tree');
  a.vitals.energy = 40;
  a.mastered.push(combineId);
  a.collective?.knownAbilities.push(combineId);
  a.wellbeing.sources = [];
  w.stacks = w.stacks.filter((s) => !['bark', 'stone'].includes(s.resource));
  for (let i = 0; i < 2; i++)
    w.stacks.push({
      ...v7Clone(source),
      id: 'fixture-bark-' + String(i),
      quantity: 0.7,
      quantityTenths: 7,
      harvestedAt: i,
      decay: i,
      origin: 'actual-fixture-source-' + String(i),
    });
  w.stacks.push({
    id: 'fixture-stone',
    resource: 'stone',
    quantity: 2,
    owner: a.id,
    position: { ...a.position },
    origin: 'isolated-test-stones',
  });
  return w;
}
export const combineAction = (
  operation = 'combine',
  args: V7Action['args'] = {},
): V7Action => ({
  interface: combineId,
  args: {
    operation,
    ...(operation === 'combine'
      ? { sourceIds: ['item:fixture-bark-0', 'item:fixture-bark-1'] }
      : {}),
    ...args,
  },
});
export function combineMust(w: V7World, action: V7Action) {
  const r = rootStep(w, action);
  if (!r.outcomes['ash-1']?.success)
    throw new Error(r.outcomes['ash-1']?.reason);
  return r.world;
}
export function combineFrames() {
  const initial = combineFixture(),
    selected = combineMust(
      initial,
      combineAction('status', {
        sourceIds: ['fixture-bark-0', 'fixture-bark-1'],
      }),
    ),
    combined = combineMust(selected, combineAction());
  const output = combined.stacks.find((s) => s.componentLots);
  if (!output) throw new Error('Missing fixture combined output.');
  const reserved = combineMust(combined, {
    ...trayBuild,
    args: { ...trayBuild.args, barkId: output.id },
  });
  const tray = combineMust(reserved, {
    interface: 'root-air-drying',
    args: { operation: 'continue' },
  });
  const cancelled = combineMust(reserved, {
    interface: 'root-air-drying',
    args: { operation: 'cancel' },
  });
  return { initial, selected, combined, reserved, tray, cancelled };
}
