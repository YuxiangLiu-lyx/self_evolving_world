import {
  continuousRegistry,
  v7Install,
  v7Clone,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import { hardnessFixture, hardnessStep } from './open-hardness.js';
export const contactAction = (
  mode: string,
  target = '',
  counterface = '',
  project = 'contact-study',
): V7Action => ({
  interface: 'contact-resistance-calibration',
  args: { mode, target, counterface, project },
});
export const contactStep = hardnessStep;
export function contactFixture() {
  let w = v7Clone(
    v7Install(
      hardnessFixture(),
      continuousRegistry(),
      'contact-resistance-calibration@1',
    ),
  );
  for (let i = 0; i < 5; i++)
    w = v7Clone(
      contactStep(w, {
        interface: 'learn',
        args: { ability: 'contact-resistance-calibration' },
      }).world,
    );
  return w;
}
export function contactFrames() {
  let w = contactFixture();
  const frames: V7World[] = [];
  const actions = [
    contactAction('inspect', 'stone', 'flint'),
    ...Array.from({ length: 5 }, () =>
      contactAction('sweep', 'stone', 'flint'),
    ),
    contactAction('assess'),
  ];
  for (const action of actions) {
    const r = contactStep(w, action);
    if (!r.outcomes.lin?.success) throw new Error(r.outcomes.lin?.reason);
    w = v7Clone(r.world);
    frames.push(w);
  }
  return frames;
}
