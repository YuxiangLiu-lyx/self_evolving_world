import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';

const id = 'controlled-food-processing-trial';
const wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, action: V7Action, actor = 'moss') =>
  v7Step(
    w,
    { lin: wait, moss: wait, sol: wait, [actor]: action },
    continuousRegistry(w),
  );
const actor = (w: V7World, name = 'moss') => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const food = (w: V7World) =>
  w.stacks
    .filter((s) => s.resource === 'root')
    .reduce((n, s) => n + s.quantity, 0);
function setup() {
  const genesis = initialLongWorld('long-ex14', 'long-fixes');
  let w = v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
  actor(w).position = { x: 20.1, y: 13.4 };
  w = v7Clone(
    step(w, {
      interface: 'gather',
      args: { target: 'start-1-roots', quantity: 3 },
    }).world,
  );
  const stack = w.stacks.find(
    (s) => s.owner === 'moss' && s.resource === 'root',
  );
  if (!stack) throw new Error('Missing actually gathered fixture material.');
  w = v7Clone(step(w, { interface: 'learn', args: { ability: id } }).world);
  for (let i = 0; i < 4 && !actor(w).mastered.includes(id); i++)
    w = v7Clone(step(w, wait).world);
  expect(actor(w).mastered).toContain(id);
  const start: V7Action = {
    interface: id,
    args: { mode: 'start', inputStackId: stack.id, x: 20.1, y: 12.6 },
  };
  return { w, start, input: stack.id };
}
function placed() {
  const f = setup();
  let w = v7Clone(step(f.w, f.start).world);
  w = v7Clone(step(w, { interface: id, args: { mode: 'resume' } }).world);
  const trial = w.objects.find((o) => o.kind === 'food-trial');
  if (!trial) throw new Error('Missing placed trial.');
  return { ...f, w, trial: trial.id };
}

describe('paired food exposure trial in ex14', () => {
  it('places two whole units at distinct ground positions in two paid rounds and conserves food', () => {
    const f = setup();
    const before = food(f.w);
    const first = step(f.w, f.start);
    expect(first.outcomes.moss?.success).toBe(true);
    expect(
      first.world.objects.find((o) => o.kind === 'food-trial')?.data.stage,
    ).toBe('setup');
    const { w, trial } = placed();
    const o = w.objects.find((x) => x.id === trial);
    expect(o?.data.stage).toBe('exposed');
    expect(o?.data.matchedControl).toBe(true);
    const placedSamples = w.stacks.filter((s) => s.reservedFor === trial);
    expect(placedSamples).toHaveLength(2);
    expect(placedSamples[0]?.position).not.toEqual(placedSamples[1]?.position);
    expect(placedSamples.every((s) => s.owner === null)).toBe(true);
    expect(food(w)).toBeLessThanOrEqual(before);
    expect(food(w)).toBeGreaterThan(before - 0.5);
  });

  it('keeps existing decay, marks the 10-round checkpoint and awards no preserved status', () => {
    const { w, trial } = placed();
    let later = v7Clone(w);
    for (let i = 0; i < 11; i++) later = v7Clone(step(later, wait).world);
    const o = later.objects.find((x) => x.id === trial);
    expect(o?.data.endpointReached).toBe(true);
    expect(o?.data.treatmentDifference).toBe('none modeled');
    const decays = later.stacks
      .filter((s) => s.reservedFor === trial)
      .map((s) => s.decay ?? 0);
    expect(decays).toHaveLength(2);
    expect(decays[0]).toBeCloseTo(decays[1] ?? -1, 6);
    const seen = step(later, {
      interface: id,
      args: { mode: 'inspect', target: trial },
    });
    expect(seen.outcomes.moss?.success).toBe(true);
    expect(
      actor(seen.world).memory.knowledge?.[`${trial}:sample-condition`]
        ?.verified,
    ).toBe(false);
    expect(
      seen.world.events.some((e) => e.type === 'information-confirmed'),
    ).toBe(false);
  });

  it('lets only the operator retrieve the remaining material, and cancel releases unfinished setup once', () => {
    const { w, trial } = placed();
    const lin = actor(w, 'lin');
    lin.position = { x: actor(w).position.x + 0.5, y: actor(w).position.y };
    expect(
      step(
        w,
        { interface: id, args: { mode: 'retrieve', target: trial } },
        'lin',
      ).outcomes.lin?.success,
    ).toBe(false);
    const back = step(w, {
      interface: id,
      args: { mode: 'retrieve', target: trial },
    });
    expect(back.outcomes.moss?.success).toBe(true);
    expect(back.world.objects.find((x) => x.id === trial)?.data.stage).toBe(
      'retrieved',
    );
    expect(back.world.stacks.some((s) => s.reservedFor === trial)).toBe(false);
    const f = setup();
    const total = food(f.w);
    const begun = v7Clone(step(f.w, f.start).world);
    const cancelled = step(begun, { interface: id, args: { mode: 'cancel' } });
    expect(cancelled.outcomes.moss?.success).toBe(true);
    expect(cancelled.world.objects.some((o) => o.kind === 'food-trial')).toBe(
      false,
    );
    expect(
      cancelled.world.stacks.some((s) => s.reservedFor !== undefined),
    ).toBe(false);
    expect(food(cancelled.world)).toBeGreaterThan(total - 0.5);
  });
});
