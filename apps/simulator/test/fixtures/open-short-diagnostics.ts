import {
  v7Clone,
  v7Install,
  continuousRegistry,
  v7Step,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import {
  shortFixture,
  shortAdvance,
  shortAction,
  shortTrialInputs,
} from './open-short-refuge.js';
export const diagnosis = (
  project = 'short:work:moss:diagnostic-coupon',
  target = '',
  mode = 'diagnose-trial',
): V7Action => ({
  interface: 'short-refuge-trial-diagnostics',
  args: {
    mode,
    project,
    target,
    components: [],
    x: 0,
    y: 0,
    angle: 0,
    width: 0,
    length: 0,
    height: 0,
  },
});
export function diagnosticStudy(world: V7World) {
  const w = v7Clone(
    v7Install(
      world,
      continuousRegistry(world),
      'short-refuge-trial-diagnostics@1',
    ),
  );
  return v7Clone(
    diagnosticStep(w, {
      interface: 'learn',
      args: { ability: 'short-refuge-trial-diagnostics' },
    }).world,
  );
}
export function diagnosticStep(w: V7World, action: V7Action) {
  return v7Step(
    w,
    Object.fromEntries(
      w.actors
        .filter((a) => a.vitals.health > 0)
        .map((a) => [
          a.id,
          a.id === 'moss' ? action : { interface: 'wait', args: {} },
        ]),
    ),
    continuousRegistry(w),
  );
}
/** Authored failed-load coupon and retained-history fixture; no formal inventory or actor guidance. */
export function diagnosticFixture() {
  let w = shortFixture();
  const rows = shortTrialInputs('cover');
  rows[2] = { item: 'short-weight', quantityTenths: 20, role: 'load' };
  for (let i = 0; i < 2; i++)
    w = shortAdvance(w, shortAction('test-cover', 'diagnostic-coupon', rows));
  return diagnosticStudy(w);
}
export function diagnosticFrames() {
  let w = diagnosticFixture();
  const frames = [v7Clone(w)];
  w = shortAdvance(w, diagnosis());
  frames.push(v7Clone(w));
  const missing = v7Clone(w),
    history = missing.state['short:history:short:work:moss:diagnostic-coupon'];
  if (history && typeof history === 'object' && !Array.isArray(history))
    history.evidence = null;
  // Explicitly authored lost-history variant verifies honest unknowns, not a second formal run.
  frames.push(shortAdvance(missing, diagnosis()));
  return frames;
}
