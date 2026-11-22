import {
  v7Clone,
  v7Install,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { assayEquipmentFrames } from './open-food-assay.js';
export const preservationAction = (
  mode: string,
  project = 'trial',
  target = '',
  apparatus = '',
  quantityTenths = 0,
): V7Action => ({
  interface: 'measured-food-preservation',
  args: { mode, project, target, apparatus, quantityTenths },
});
export const preservationStep = (w: V7World, action: V7Action, actor = 'lin') =>
  v7Step(
    w,
    Object.fromEntries(
      w.actors.map((a) => [
        a.id,
        a.id === actor ? action : { interface: 'wait', args: {} },
      ]),
    ),
    continuousRegistry(w),
  );
export function preservationFixture() {
  const last = assayEquipmentFrames().at(-1);
  if (!last) throw new Error('Missing actually assembled fixture apparatus');
  let w = v7Clone(
    v7Install(last, continuousRegistry(last), 'measured-food-preservation@1'),
  );
  // Controlled dry-season fixture timing and input are isolated from the formal world.
  w.tick = 100;
  w.time = 100;
  w.stacks.push({
    id: 'berries',
    resource: 'berry',
    quantity: 0.3,
    quantityTenths: 3,
    owner: 'lin',
    origin: 'isolated-preservation-input',
    harvestedAt: 100,
    decay: 0,
    position: { ...required(w.actors[0]).position },
  });
  for (let i = 0; i < 3; i++)
    w = v7Clone(
      preservationStep(w, {
        interface: 'learn',
        args: { ability: 'measured-food-preservation' },
      }).world,
    );
  return w;
}
export function preservationTray(w: V7World) {
  const o = w.objects.find((o) => o.kind === 'drying-tray');
  if (!o) throw new Error('Missing real fixture tray');
  return o;
}
export function preparation(w: V7World) {
  return preservationAction(
    'prepare',
    'trial',
    'item:berries',
    `object:${preservationTray(w).id}`,
    1,
  );
}
export function preservationReading(w: V7World) {
  const b = w.objects.find((o) => o.kind === 'comparison-balance'),
    weight = w.stacks.find(
      (s) => s.processing?.comparisonWeight && s.quantity === 0.1,
    );
  if (!b || !weight) throw new Error('Missing actually calibrated reference');
  return preservationAction(
    'read',
    'trial',
    `item:${weight.id}`,
    `object:${b.id}`,
  );
}
export function preservationFrames() {
  let w = preservationFixture();
  const initial = w,
    action = preparation(w);
  w = v7Clone(preservationStep(w, action).world);
  const first = w;
  w = v7Clone(preservationStep(w, action).world);
  const prepared = w;
  w = v7Clone(preservationStep(w, preservationReading(w)).world);
  for (let i = 0; i < 8; i++)
    w = v7Clone(preservationStep(w, { interface: 'wait', args: {} }).world);
  w = v7Clone(preservationStep(w, preservationReading(w)).world);
  const read = w;
  w = v7Clone(preservationStep(w, preservationAction('remove')).world);
  return [initial, first, prepared, read, w];
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Missing required isolated fixture state.');
  return value;
}
