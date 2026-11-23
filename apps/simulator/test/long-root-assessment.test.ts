import { expect, it } from 'vitest';
import {
  v7Clone,
  v7Install,
  v7Step,
  v7Observe,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const id = 'root-assessment';
const wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, a: V7Action, who = 'moss') =>
  v7Step(
    w,
    { lin: wait, moss: wait, sol: wait, [who]: a },
    continuousRegistry(w),
  );
function learn(w: V7World, ability: string, who = 'moss') {
  const r = step(w, { interface: 'learn', args: { ability } }, who);
  expect(r.outcomes[who]?.success).toBe(true);
  return v7Clone(step(r.world, wait, who).world);
}
function fixture() {
  let w = v7Clone(initialLongWorld('long-ex13'));
  const r = continuousRegistry(w);
  w = v7Clone(v7Install(w, r, 'root-planting-trial@1'));
  const a = w.actors.find((a) => a.id === 'moss');
  if (!a) throw new Error('Missing actor.');
  a.position = { x: 20.1, y: 13.4 };
  w = v7Clone(
    step(w, {
      interface: 'gather',
      args: { target: 'start-1-roots', quantity: 3 },
    }).world,
  );
  const s = w.stacks.find((s) => s.owner === 'moss');
  if (!s) throw new Error('Missing gathered item.');
  w = learn(w, 'root-planting-trial');
  const action = {
    interface: 'root-planting-trial',
    args: { mode: 'plant', inputStackId: s.id, x: 20.1, y: 12.6 },
  };
  w = v7Clone(step(w, action).world);
  w = v7Clone(step(w, action).world);
  w = v7Clone(v7Install(w, continuousRegistry(w), id + '@1'));
  w = learn(w, id);
  const o = w.objects.find((o) => o.kind === 'root-trial');
  if (!o) throw new Error('Missing actual plot.');
  if (typeof o.data.inputItem !== 'string')
    throw new Error('Missing actual input identity.');
  return { w, plot: o.id, item: o.data.inputItem };
}
it('retains real exposure, original age, exact paid work and private findings across interruption and resume', () => {
  const f = fixture();
  let w = f.w;
  const start = step(w, {
    interface: id,
    args: { mode: 'begin', target: f.plot },
  });
  expect(start.outcomes.moss?.success).toBe(true);
  w = v7Clone(start.world);
  const material = () => w.stacks.find((s) => s.id === f.item);
  const age = material()?.decay ?? 0;
  const inspected = step(w, {
    interface: id,
    args: { mode: 'inspect', target: f.plot },
  });
  expect(inspected.outcomes.moss?.success).toBe(true);
  w = v7Clone(inspected.world);
  expect(w.objects.find((o) => o.id === f.plot)?.data.exposed).toBe(true);
  expect(
    w.events.some(
      (e) =>
        e.type === 'information-confirmed' || e.type === 'practice-confirmed',
    ),
  ).toBe(false);
  w = v7Clone(step(w, wait).world);
  expect(w.objects.find((o) => o.id === f.plot)?.data.exposed).toBe(true);
  w = JSON.parse(JSON.stringify(w)) as V7World;
  const finished = step(w, { interface: id, args: { mode: 'resume' } });
  expect(finished.outcomes.moss?.success).toBe(true);
  w = v7Clone(finished.world);
  expect(w.objects.find((o) => o.id === f.plot)?.data.exposed).toBe(false);
  expect(material()?.decay).toBeGreaterThan(age);
  expect(material()?.reservedFor).toBe(f.plot);
  expect(
    w.actors.find((a) => a.id === 'moss')?.extensionState[
      'long:last-root-assessment'
    ],
  ).toMatchObject({ paidEnergy: 2, remainingWork: 0, status: 'completed' });
  expect(
    w.actors.find((a) => a.id === 'lin')?.memory.knowledge?.[
      f.plot + ':exposed-root-condition'
    ],
  ).toBeUndefined();
});
it('hides buried specimen stock and spoilage, while real paid uncovering reveals actual loss without fabricating growth', () => {
  const f = fixture();
  let w = f.w;
  expect(v7Observe(w, 'moss').stacks.some((s) => s.id === f.item)).toBe(false);
  const s = w.stacks.find((s) => s.id === f.item);
  if (!s) throw new Error('Missing real specimen.');
  s.decay = 239.99;
  w = v7Clone(step(w, wait).world);
  const seen = v7Observe(w, 'moss');
  expect(
    seen.events.some((e) => e.type === 'spoiled' && e.target === f.item),
  ).toBe(false);
  expect(
    seen.objects.find((o) => o.id === f.plot)?.data.remainingRootUnits,
  ).toBeUndefined();
  const r = step(w, {
    interface: id,
    args: { mode: 'inspect', target: f.plot },
  });
  expect(r.outcomes.moss?.success).toBe(true);
  expect(
    r.world.events.find((e) => e.type === 'root-inspected')?.data.condition,
  ).toContain('visibly decayed');
  expect(
    r.world.objects.find((o) => o.id === f.plot)?.data.stock,
  ).toBeUndefined();
});
it('requires study and creator permission, releases work on cancellation/death, and never automatically reburies or duplicates the root', () => {
  for (const death of [false, true]) {
    const f = fixture();
    let w = f.w;
    const lin = w.actors.find((a) => a.id === 'lin');
    if (!lin) throw new Error('Missing observer.');
    lin.position = { x: 19.5, y: 12.6 };
    expect(
      step(
        w,
        { interface: id, args: { mode: 'observe', target: f.plot } },
        'lin',
      ).outcomes.lin?.success,
    ).toBe(false);
    w = learn(w, id, 'lin');
    expect(
      step(
        w,
        { interface: id, args: { mode: 'observe', target: f.plot } },
        'lin',
      ).outcomes.lin?.success,
    ).toBe(true);
    expect(
      step(
        w,
        { interface: id, args: { mode: 'inspect', target: f.plot } },
        'lin',
      ).outcomes.lin?.success,
    ).toBe(false);
    w = v7Clone(
      step(w, { interface: id, args: { mode: 'inspect', target: f.plot } })
        .world,
    );
    if (death) {
      const a = w.actors.find((a) => a.id === 'moss');
      if (!a) throw new Error('Missing owner.');
      a.vitals.health = 0.1;
      a.vitals.satiety = 0;
      w = v7Clone(step(w, wait).world);
    } else
      w = v7Clone(step(w, { interface: id, args: { mode: 'cancel' } }).world);
    expect(w.objects.find((o) => o.id === f.plot)?.data.exposed).toBe(true);
    expect(
      w.objects.find((o) => o.id === f.plot)?.data.activeAssessment,
    ).toBeNull();
    expect(w.stacks.find((s) => s.id === f.item)?.reservedFor).toBe(f.plot);
    expect(
      w.stacks
        .filter((s) => s.resource === 'root')
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(3);
  }
});
