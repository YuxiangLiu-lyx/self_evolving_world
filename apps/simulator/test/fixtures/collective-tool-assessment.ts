import {
  v7Clone,
  v7Install,
  continuousRegistry,
  toolAssessmentResult,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { surfaceFixture } from './collective-root-surface.js';
import { rootStep } from './collective-roots.js';
export const toolId = 'tool-suitability-assessment';
export const toolAction: V7Action = {
  interface: toolId,
  args: {
    mode: 'assess',
    toolId: 'item:fixture-stone',
    requirement: 'root-preparation-surface:hard-tool',
  },
};
export function toolFixture() {
  const base = surfaceFixture(),
    w = v7Clone(v7Install(base, continuousRegistry(base), toolId + '@1'));
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture actor.');
  a.mastered.push(toolId);
  a.collective?.knownAbilities.push(toolId);
  w.stacks = w.stacks.filter((s) => s.resource === 'stone');
  for (const s of w.stacks) s.quantityTenths = Math.round(s.quantity * 10);
  return w;
}
export function toolResult(w: V7World) {
  const a = w.actors[0],
    r = a && toolAssessmentResult(a);
  if (!r) throw new Error('Missing recorded result.');
  return r;
}
export function toolFrames() {
  const initial = toolFixture(),
    assessed = rootStep(initial, toolAction).world;
  const changed = v7Clone(assessed),
    s = changed.stacks.find((s) => s.id === 'fixture-stone');
  if (!s) throw new Error('Missing tool.');
  s.processing = { wovenDamage: true };
  const damaged = rootStep(changed, toolAction).world;
  const read = rootStep(damaged, {
    interface: toolId,
    args: {
      mode: 'read',
      assessmentId: toolResult(assessed).assessmentId ?? '',
    },
  }).world;
  const missing = toolFixture(),
    material = missing.resources.find((r) => r.id === 'stone');
  if (material) delete material.properties;
  const unknown = rootStep(missing, toolAction).world;
  return { initial, assessed, damaged, read, unknown };
}
