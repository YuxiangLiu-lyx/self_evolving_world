import {
  continuousRegistry,
  v7Install,
  v7Clone,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import { assayFixture, assayStep } from './open-food-assay.js';
export const wovenAction = (
  mode: string,
  target = '',
  controls: string[] = [],
  project = '',
  x = 8.7,
  y = 7.675,
): V7Action => ({
  interface: 'assay-woven-supports',
  args: { mode, target, controls, project, x, y },
});
export const wovenStep = (w: V7World, action: V7Action) => assayStep(w, action);
export function wovenFixture() {
  let w = v7Clone(
    v7Install(assayFixture(), continuousRegistry(), 'assay-woven-supports@1'),
  );
  w.stacks = w.stacks.filter((s) => s.resource !== 'bark');
  for (const s of w.stacks) {
    if (s.id === 'hammer') s.resource = 'stone';
    if (s.id === 'branch') {
      s.quantity = 1.1;
      s.quantityTenths = 11;
    }
    if (s.id === 'vine') {
      s.quantity = 3.1;
      s.quantityTenths = 31;
    }
  }
  for (let i = 0; i < 5; i++)
    w = v7Clone(
      wovenStep(w, {
        interface: 'learn',
        args: { ability: 'assay-woven-supports' },
      }).world,
    );
  return w;
}
export function wovenTests(w = wovenFixture()) {
  const frames = [w];
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture performer');
  // Explicit isolated water-cell fixture, never a formal-world modification or agent recipe.
  a.position = { x: 7.66, y: 8.5 };
  w.terrain[8] =
    (w.terrain[8] ?? '').slice(0, 8) + '~' + (w.terrain[8] ?? '').slice(9);
  for (const [mode, target, project] of [
    ['test-beam', 'branch', 'beam-evidence'],
    ['test-vine', 'vine', 'vine-evidence'],
  ] as const) {
    const action = wovenAction(mode, target, ['hammer'], project);
    let done = false;
    for (let i = 0; i < 100; i++) {
      const result = wovenStep(w, action);
      if (!result.outcomes.lin?.success)
        throw new Error(result.outcomes.lin?.reason);
      w = v7Clone(result.world);
      frames.push(w);
      if (result.outcomes.lin.complete) {
        done = true;
        break;
      }
    }
    if (!done) throw new Error('Isolated material test did not finish.');
  }
  w.terrain[8] = '.'.repeat(w.config.width);
  const current = w.actors[0];
  if (current) current.position = { x: 8, y: 8 };
  return frames;
}
export function wovenFrames() {
  const tests = wovenTests();
  let w = tests.at(-1);
  if (!w) throw new Error('Missing material tests');
  const frames = [w],
    action = wovenAction(
      'assemble',
      'branch',
      ['vine', 'hammer', 'comparison'],
      'woven-apparatus',
    );
  for (let i = 0; i < 14; i++) {
    const r = wovenStep(w, action);
    if (!r.outcomes.lin?.success) throw new Error(r.outcomes.lin?.reason);
    w = v7Clone(r.world);
    frames.push(w);
  }
  for (let i = 0; i < 3; i++) {
    const r = wovenStep(w, wovenAction('calibrate', '', [], 'woven-apparatus'));
    if (!r.outcomes.lin?.success) throw new Error(r.outcomes.lin?.reason);
    w = v7Clone(r.world);
    frames.push(w);
  }
  return frames;
}

export function conditionedWoven() {
  let w = wovenFrames().at(-1);
  if (!w) throw new Error('Missing fixture apparatus');
  // A new controlled fixture boundary isolates exposure/calibration from unrelated starvation. Formal genesis is untouched.
  for (const a of w.actors) {
    a.vitals.health = 100;
    a.vitals.satiety = 100;
  }
  for (let i = 0; i < 30; i++)
    w = v7Clone(wovenStep(w, { interface: 'rest', args: {} }).world);
  for (let i = 0; i < 3; i++) {
    const r = wovenStep(w, wovenAction('calibrate', '', [], 'woven-apparatus'));
    if (!r.outcomes.lin?.success) throw new Error(r.outcomes.lin?.reason);
    w = v7Clone(r.world);
  }
  return w;
}
