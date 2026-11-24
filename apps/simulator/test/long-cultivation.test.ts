import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
} from '@self-evolving-world/world-core';
import type { V7Action, V7World } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';

const id = 'cultivate-plant';
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
  const plant: V7Action = {
    interface: id,
    args: { mode: 'plant', inputStackId: stack.id, x: 20.1, y: 12.6 },
  };
  return { w, plant, input: stack.id };
}
function learned(w: V7World) {
  let next = v7Clone(
    step(w, { interface: 'learn', args: { ability: id } }).world,
  );
  for (let i = 0; i < 4 && !actor(next).mastered.includes(id); i++)
    next = v7Clone(step(next, wait).world);
  expect(actor(next).mastered).toContain(id);
  return next;
}
function planted() {
  const f = setup();
  let w = learned(f.w);
  w = v7Clone(step(w, f.plant).world);
  w = v7Clone(step(w, { interface: id, args: { mode: 'resume' } }).world);
  const plot = w.objects.find((o) => o.revision === `${id}@1`);
  if (!plot) throw new Error('Missing completed plot.');
  return { ...f, w, plot: plot.id };
}
const roots = (w: V7World) =>
  w.stacks
    .filter((s) => s.resource === 'root')
    .reduce((n, s) => n + s.quantity, 0);

describe('general cultivation operation in ex14', () => {
  it('is scoped to ex14, needs personal study and plants one real root unit in paid work', () => {
    const f = setup();
    expect(step(f.w, f.plant).outcomes.moss?.success).toBe(false);
    expect(
      continuousRegistry(initialLongWorld('long-ex13')).packages.some(
        (p) => p.id === id,
      ),
    ).toBe(false);
    const w = learned(f.w);
    const first = step(w, f.plant);
    expect(first.outcomes.moss?.success).toBe(true);
    expect(
      actor(first.world).extensionState['long:work:cultivation'],
    ).toMatchObject({ completedWork: 1, paidEnergy: 1 });
    const { w: done, plot, input } = planted();
    const o = done.objects.find((x) => x.id === plot);
    expect(o?.data.stage).toBe('planted-unverified');
    expect(o?.data.viability).toMatch(/Unverified/);
    expect(done.stacks.find((s) => s.id === input)?.quantity).toBe(2);
    expect(roots(done)).toBe(3);
    expect(
      step(done, {
        interface: id,
        args: {
          mode: 'plant',
          inputStackId: input,
          quantity: 2,
          x: 21,
          y: 12.6,
        },
      }).outcomes.moss?.success,
    ).toBe(false);
  });

  it('inspects with the baseline probe, refuses tending without spending, and never grows food', () => {
    const { w, plot } = planted();
    const before = actor(w).vitals.energy;
    const seen = step(w, {
      interface: id,
      args: { mode: 'inspect', target: plot },
    });
    expect(seen.outcomes.moss?.success).toBe(true);
    expect(
      actor(seen.world).memory.knowledge?.[`${plot}:observed-state`],
    ).toMatchObject({ property: 'visible state' });
    expect(
      seen.world.events.some((e) => e.type === 'cultivation-plot-inspected'),
    ).toBe(true);
    expect(before - actor(seen.world).vitals.energy).toBeGreaterThan(0.19);
    const tend = step(w, {
      interface: id,
      args: { mode: 'tend', target: plot },
    });
    expect(tend.outcomes.moss?.success).toBe(false);
    let later = v7Clone(w);
    for (let i = 0; i < 12; i++) later = v7Clone(step(later, wait).world);
    expect(roots(later)).toBeLessThanOrEqual(roots(w));
    expect(
      later.objects.find((o) => o.id === plot)?.data.observationRounds,
    ).toBeGreaterThan(0);
  });

  it('lets only the planter take back the remaining material and keeps the emptied plot', () => {
    const { w, plot, input } = planted();
    const lin = actor(w, 'lin');
    lin.position = { ...actor(w).position, x: actor(w).position.x + 0.6 };
    expect(
      step(w, { interface: id, args: { mode: 'remove', target: plot } }, 'lin')
        .outcomes.lin?.success,
    ).toBe(false);
    const taken = step(w, {
      interface: id,
      args: { mode: 'remove', target: plot },
    });
    expect(taken.outcomes.moss?.success).toBe(true);
    const o = taken.world.objects.find((x) => x.id === plot);
    expect(o?.data.stage).toBe('emptied-plot');
    const material = taken.world.stacks.find(
      (s) => s.owner === 'moss' && s.resource === 'root' && s.id !== input,
    );
    expect(material?.reservedFor).toBeUndefined();
    expect(roots(taken.world)).toBe(roots(w));
    const after = v7Clone(step(v7Clone(taken.world), wait).world);
    expect(after.objects.find((x) => x.id === plot)?.data.stage).toBe(
      'emptied-plot',
    );
    expect(
      step(after, { interface: id, args: { mode: 'remove', target: plot } })
        .outcomes.moss?.success,
    ).toBe(false);
  });
});
