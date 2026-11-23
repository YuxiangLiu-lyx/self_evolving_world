import { describe, it, expect } from 'vitest';
import {
  v7Clone,
  v7Install,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const id = 'root-planting-trial';
const wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, action: V7Action, actor = 'moss') =>
  v7Step(
    w,
    { lin: wait, moss: wait, sol: wait, [actor]: action },
    continuousRegistry(w),
  );
function setup() {
  let w = v7Clone(
    v7Install(
      initialLongWorld('long-ex13'),
      continuousRegistry(initialLongWorld('long-ex13')),
      id + '@1',
    ),
  );
  const a = w.actors.find((a) => a.id === 'moss');
  if (!a) throw new Error('Missing fixture actor.');
  a.position = { x: 20.1, y: 13.4 };
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
  const action: V7Action = {
    interface: id,
    args: { mode: 'plant', inputStackId: stack.id, x: 20.1, y: 12.6 },
  };
  return { w, action, input: stack.id };
}
function study(w: V7World) {
  const r = step(w, { interface: 'learn', args: { ability: id } });
  expect(r.outcomes.moss?.success).toBe(true);
  return v7Clone(step(r.world, wait).world);
}
const plots = (w: V7World) => w.objects.filter((o) => o.kind === 'root-trial');
describe('scoped real root planting precursor', () => {
  it('requires personal learning and this run registry, and conserves the exact root across a paid pause and resume', () => {
    const f = setup();
    expect(step(f.w, f.action).outcomes.moss?.success).toBe(false);
    expect(plots(f.w)).toHaveLength(0);
    expect(
      continuousRegistry(initialLongWorld('other-run')).packages.some(
        (p) => p.id === id,
      ),
    ).toBe(false);
    let w = study(f.w);
    const start = step(w, f.action);
    expect(start.outcomes.moss?.success).toBe(true);
    w = v7Clone(start.world);
    expect(plots(w)[0]?.data.remainingWork).toBe(1);
    const work = w.actors.find((a) => a.id === 'moss')?.extensionState[
      'long:work:planting'
    ];
    expect(work).toMatchObject({ completedWork: 1, paidEnergy: 1 });
    w = v7Clone(step(w, { interface: 'rest', args: {} }).world);
    const done = step(w, { interface: id, args: { mode: 'resume' } });
    expect(done.outcomes.moss?.success).toBe(true);
    w = v7Clone(done.world);
    expect(plots(w)[0]?.data.stage).toBe('planted-unverified');
    expect(w.stacks.find((s) => s.id === f.input)?.quantity).toBe(2);
    expect(
      w.stacks
        .filter((s) => s.resource === 'root')
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(3);
    expect(
      w.actors.find((a) => a.id === 'moss')?.extensionState[
        'long:work:planting'
      ],
    ).toMatchObject({
      paidEnergy: 2,
      completedWork: 2,
      remainingWork: 0,
      status: 'completed',
    });
    expect(
      step(w, { interface: id, args: { mode: 'cancel' } }).outcomes.moss
        ?.success,
    ).toBe(false);
    expect(w.events.some((e) => e.type === 'practice-confirmed')).toBe(false);
  });
  it('releases unfinished surviving escrow once on explicit cancellation or death, without recovering spent effort', () => {
    for (const die of [false, true]) {
      const f = setup();
      let w = study(f.w);
      w = v7Clone(step(w, f.action).world);
      if (die) {
        const a = w.actors.find((a) => a.id === 'moss');
        if (!a) throw new Error('Missing actor.');
        a.vitals.health = 0.1;
        a.vitals.satiety = 0;
        w = v7Clone(step(w, wait).world);
        expect(w.actors.find((a) => a.id === 'moss')?.life?.deaths).toBe(1);
      } else
        w = v7Clone(step(w, { interface: id, args: { mode: 'cancel' } }).world);
      expect(plots(w)).toHaveLength(0);
      expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
      expect(
        w.stacks
          .filter((s) => s.resource === 'root')
          .reduce((n, s) => n + s.quantity, 0),
      ).toBe(3);
      expect(
        w.actors.find((a) => a.id === 'moss')?.extensionState[
          'long:work:planting'
        ],
      ).toMatchObject({ paidEnergy: 1, status: 'stopped' });
      w = v7Clone(step(w, wait).world);
      expect(w.events.filter((e) => e.type === 'process-stopped')).toHaveLength(
        0,
      );
    }
  });
  it('persists a completed actual specimen, allows other observers, ages it without food multiplication and labels the observation limit honestly', () => {
    const f = setup();
    let w = study(f.w);
    w = v7Clone(step(w, f.action).world);
    w = v7Clone(step(w, f.action).world);
    const plot = plots(w)[0];
    if (!plot) throw new Error('Missing completed plot.');
    const a = w.actors.find((a) => a.id === 'lin');
    if (!a) throw new Error('Missing observer.');
    a.position = { x: 19.5, y: 12.6 };
    const inspect: V7Action = {
      interface: 'probe',
      args: { target: plot.id, mode: 'observe', intensity: 0.1 },
    };
    const first = step(w, inspect, 'lin');
    expect(first.outcomes.lin?.success).toBe(true);
    w = v7Clone(first.world);
    expect(w.actors.find((a) => a.id === 'lin')?.mastered).not.toContain(id);
    for (let i = 0; i < 31; i++) w = v7Clone(step(w, wait).world);
    expect(plots(w)[0]?.data.observationStatus).toBe('inconclusive');
    expect(plots(w)[0]?.data.stage).toBe('planted-unverified');
    expect(
      step(w, inspect, 'lin').world.events.some(
        (e) => e.type === 'information-confirmed',
      ),
    ).toBe(false);
    const specimen = w.stacks.find((s) => s.reservedFor === plot.id);
    if (!specimen) throw new Error('Missing actual specimen.');
    specimen.decay = 239.99;
    w = v7Clone(step(w, wait).world);
    expect(plots(w)[0]?.data.stage).toBe('visibly-decayed');
    expect(plots(w)[0]?.data.stock).toBeUndefined();
    const observed = step(w, inspect, 'lin');
    expect(observed.outcomes.lin?.success).toBe(true);
    expect(
      observed.world.events.some(
        (e) => e.actor === 'lin' && e.type === 'information-confirmed',
      ),
    ).toBe(true);
    expect(
      step(observed.world, inspect, 'lin').world.events.some(
        (e) => e.actor === 'lin' && e.type === 'information-confirmed',
      ),
    ).toBe(false);
    const roundtrip = JSON.parse(JSON.stringify(observed.world)) as V7World;
    expect(step(roundtrip, wait).world).toEqual(
      step(observed.world, wait).world,
    );
  });
});
