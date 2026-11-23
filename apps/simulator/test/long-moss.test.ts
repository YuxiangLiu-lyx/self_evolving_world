import { expect, it } from 'vitest';
import {
  v7Clone,
  v7Install,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const id = 'moss-resting-pad-trial',
  wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, a: V7Action, actor = 'sol') =>
  v7Step(
    w,
    { lin: wait, moss: wait, sol: wait, [actor]: a },
    continuousRegistry(w),
  );
function setup() {
  let w = v7Clone(initialLongWorld('long-ex13'));
  w = v7Clone(v7Install(w, continuousRegistry(w), id + '@1'));
  const a = w.actors.find((a) => a.id === 'sol');
  if (!a) throw new Error('Missing actor');
  a.position = { x: 11.90334601, y: 25.022369 };
  w = v7Clone(
    step(w, {
      interface: 'gather',
      args: { target: 'forest-moss-2', quantity: 1 },
    }).world,
  );
  const s = w.stacks.find((s) => s.resource === 'moss' && s.owner === 'sol');
  if (!s) throw new Error('Missing actually gathered sample');
  const action: V7Action = {
    interface: id,
    args: {
      mode: 'begin',
      inputStackId: 'item: ' + s.id,
      quantity: 0.9,
      x: 12.5,
      y: 25,
      radius: 0.2,
    },
  };
  return { w, action };
}
const total = (w: V7World) =>
  w.stacks
    .filter((s) => s.resource === 'moss')
    .reduce((n, s) => n + s.quantity, 0);
const object = (w: V7World) =>
  w.objects.find((o) => o.kind === 'loose-moss-arrangement');
function learn(w: V7World) {
  w = v7Clone(step(w, { interface: 'learn', args: { ability: id } }).world);
  return v7Clone(step(w, wait).world);
}
it('pays individual study and conserves fractional moss through typed aliases, interruption, spreading and actual recovery', () => {
  const f = setup();
  expect(step(f.w, f.action).outcomes.sol?.success).toBe(false);
  const e = f.w.actors[2]?.vitals.energy;
  let w = learn(f.w);
  expect(w.actors[2]?.vitals.energy).toBeCloseTo((e ?? 0) - 0.4);
  const started = step(w, f.action);
  expect(started.outcomes.sol?.success, started.outcomes.sol?.reason).toBe(
    true,
  );
  w = v7Clone(started.world);
  const continuous = step(w, f.action);
  expect(
    continuous.outcomes.sol?.success,
    continuous.outcomes.sol?.reason,
  ).toBe(true);
  expect(object(continuous.world)?.data.construction).toBe('completed');
  expect(total(continuous.world)).toBeCloseTo(1);
  expect(object(w)?.data.remainingWork).toBe(1);
  expect(total(w)).toBeCloseTo(1);
  w = v7Clone(step(w, wait).world);
  const restored = JSON.parse(JSON.stringify(w)) as V7World;
  const done = step(restored, { interface: id, args: { mode: 'resume' } });
  expect(done.outcomes.sol?.success, done.outcomes.sol?.reason).toBe(true);
  w = v7Clone(done.world);
  expect(object(w)?.data).toMatchObject({
    construction: 'completed',
    remainingQuantity: 0.9,
    coverage: null,
  });
  expect(total(w)).toBeCloseTo(1);
  const o = object(w);
  if (!o) throw new Error('Missing arrangement');
  const recovered = step(w, {
    interface: id,
    args: { mode: 'recover', arrangementId: 'object:' + o.id },
  });
  expect(recovered.outcomes.sol?.success, recovered.outcomes.sol?.reason).toBe(
    true,
  );
  expect(
    recovered.world.stacks
      .filter((s) => s.owner === 'sol' && s.resource === 'moss')
      .reduce((n, s) => n + s.quantity, 0),
  ).toBeCloseTo(1);
  expect(
    step(recovered.world, {
      interface: id,
      args: { mode: 'recover', arrangementId: o.id },
    }).outcomes.sol?.success,
  ).toBe(false);
  expect(total(recovered.world)).toBeCloseTo(1);
});
it('measures actual contact during baseline rest without inventing bedding coverage, comfort or extra recovery', () => {
  const f = setup();
  let w = learn(f.w);
  w = v7Clone(step(w, f.action).world);
  w = v7Clone(step(w, { interface: id, args: { mode: 'resume' } }).world);
  const o = object(w),
    a = w.actors.find((a) => a.id === 'sol');
  if (!o || !a) throw new Error('Missing fixture');
  a.position = { x: o.spatial.x, y: o.spatial.y };
  a.vitals.energy = 20;
  const before = v7Clone(w);
  const baseline = step(before, { interface: 'rest', args: {} });
  const trial = step(w, {
    interface: id,
    args: { mode: 'rest-trial', arrangementId: o.id },
  });
  expect(trial.outcomes.sol?.success, trial.outcomes.sol?.reason).toBe(true);
  expect(trial.world.actors[2]?.vitals.energy).toBe(
    baseline.world.actors[2]?.vitals.energy,
  );
  const event = trial.world.events.find(
    (e) => e.type === 'moss-rest-trial-completed',
  );
  expect(event?.data).toMatchObject({
    usability: 'inconclusive',
    coverage: null,
    mossBonus: 0,
  });
  expect(Number(event?.data.contactQuantity)).toBeGreaterThan(0);
  expect(total(trial.world)).toBeCloseTo(1);
  expect(
    trial.world.events.some(
      (e) =>
        e.type === 'information-confirmed' || e.type === 'practice-confirmed',
    ),
  ).toBe(false);
  expect(trial.world.actors[0]?.memory.knowledge).not.toHaveProperty(
    o.id + ':contact-trial',
  );
});
it('retains placed material on cancellation and death and pauses unpaid learning without granting mastery', () => {
  for (const death of [false, true]) {
    const f = setup();
    let w = learn(f.w);
    w = v7Clone(step(w, f.action).world);
    if (death) {
      const a = w.actors[2];
      if (!a) throw new Error('Missing actor');
      a.vitals.health = 0.1;
      a.vitals.satiety = 0;
      w = v7Clone(step(w, wait).world);
    } else
      w = v7Clone(step(w, { interface: id, args: { mode: 'cancel' } }).world);
    expect(object(w)?.data.activeWork).toBeNull();
    expect(total(w)).toBeCloseTo(1);
    expect(
      w.stacks
        .filter((s) => s.resource === 'moss' && s.owner === null)
        .reduce((n, s) => n + s.quantity, 0),
    ).toBeCloseTo(death ? 1 : 0.9);
  }
  let w = setup().w;
  w = v7Clone(step(w, { interface: 'learn', args: { ability: id } }).world);
  const a = w.actors[2];
  if (!a) throw new Error('Missing actor');
  a.vitals.energy = 0.1;
  const stopped = step(w, wait);
  expect(stopped.outcomes.sol?.success).toBe(false);
  expect(stopped.world.actors[2]?.learning?.remaining).toBe(1);
  expect(stopped.world.actors[2]?.mastered).not.toContain(id);
  const recovery = step(stopped.world, { interface: 'rest', args: {} });
  expect(recovery.outcomes.sol?.success).toBe(true);
  expect(recovery.world.actors[2]?.learning?.remaining).toBe(1);
  expect(step(recovery.world, wait).world.actors[2]?.mastered).toContain(id);
  expect(
    continuousRegistry(initialLongWorld('another-run')).packages.some(
      (p) => p.id === id,
    ),
  ).toBe(false);
});
