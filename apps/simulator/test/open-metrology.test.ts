import { it, expect } from 'vitest';
import {
  v7Clone,
  v7Load,
  v7Install,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7Data } from '@self-evolving-world/world-core';
import {
  diagnosticFixture,
  diagnosticStep,
} from './fixtures/open-shelter-diagnostics.js';
import {
  metrologyFixture,
  metrologyStep,
  metrologyAction,
  measuredFixture,
  metrologyFrames,
} from './fixtures/open-metrology.js';
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing fixture value');
  return value;
}
it('adds deterministic finite source geometry without stock, mastery, reward or retroactive diagnostic changes', () => {
  const before = diagnosticFixture();
  expect(
    diagnosticStep(before).world.events.find(
      (e) => e.type === 'shelter-inspected',
    )?.data.observed,
  ).toMatchObject({ length: null, loadCapacity: null });
  const w = metrologyFixture(),
    again = metrologyFixture();
  expect(w.state['geometry:unit:forest-branch-0:0']).toEqual(
    again.state['geometry:unit:forest-branch-0:0'],
  );
  expect(w.state['geometry:allocation:item-112-moss-648']).toEqual({
    quantity: 1,
    units: ['forest-branch-0:0'],
  });
  expect(w.objects[0]?.data.stock).toBe(8);
  expect(w.stacks.map((s) => [s.id, s.quantity])).toEqual([
    ['item-112-moss-648', 1],
  ]);
  expect(w.actors[0]?.memory.knowledge ?? {}).toEqual({});
  expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(false);
  const p = w.state['geometry:unit:forest-branch-0:0'] as V7Data;
  const volume =
    (Math.PI *
      Number(p.diameter) ** 2 *
      Number(p.length) *
      (1 + Number(p.taper) + Number(p.taper) ** 2)) /
    12;
  expect(volume * Number(p.density)).toBeCloseTo(Number(p.solid));
  expect(Number(p.length) / Number(p.diameter)).toBeGreaterThanOrEqual(15);
  expect(Number(p.length) / Number(p.diameter)).toBeLessThanOrEqual(70);
});
it('performs two paid measurement stages, survives serialization and deduplicates renamed repeated observations', () => {
  let w = metrologyFixture();
  const energy = w.actors[0]?.vitals.energy ?? 0;
  let r = metrologyStep(w, metrologyAction('measure'));
  expect(r.outcomes.moss?.complete).toBe(false);
  expect(r.world.events.some((e) => e.type === 'metrology-measured')).toBe(
    false,
  );
  w = v7Clone(r.world);
  r = metrologyStep(w, metrologyAction('measure'));
  expect(r.outcomes.moss?.complete).toBe(true);
  expect(r.world.actors[0]?.vitals.energy).toBeCloseTo(energy - 0.6);
  const e = r.world.events.find((e) => e.type === 'metrology-measured');
  expect(e?.data.uncertainty).toBeGreaterThanOrEqual(0.05);
  expect(e?.data.paidEnergy).toBeCloseTo(0.6);
  w = v7Clone(r.world);
  for (let i = 0; i < 2; i++)
    w = v7Clone(
      metrologyStep(w, metrologyAction('measure', 'renamed-work')).world,
    );
  expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(false);
  expect(
    metrologyStep(w, metrologyAction('measure', 'renamed-work')).outcomes.moss
      ?.success,
  ).toBe(false);
});
it('reserves and releases the same actual weights once, resumes only unpaid work, and never tests a longer unmeasured span', () => {
  let w = measuredFixture();
  w.stacks.push({
    id: 'weight',
    resource: 'stone',
    quantity: 2,
    owner: 'moss',
    origin: 'fixture',
    position: { x: 8, y: 8 },
  });
  const mass = v7Load(w, required(w.actors[0]));
  const action = metrologyAction(
    'load-test',
    'load-one',
    'item-112-moss-648',
    [{ item: 'item:weight', quantity: 1 }],
    0.4,
  );
  let r = metrologyStep(w, action);
  expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
  w = v7Clone(r.world);
  expect(v7Load(w, required(w.actors[0]))).toBeCloseTo(mass);
  w = v7Clone(metrologyStep(w, { interface: 'rest', args: {} }).world);
  expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
  r = metrologyStep(w, metrologyAction('resume', 'load-one', ''));
  expect(r.outcomes.moss?.complete, r.outcomes.moss?.reason).toBe(true);
  expect(
    r.world.events.find((e) => e.type === 'metrology-load-tested')?.data
      .paidEnergy,
  ).toBe(1);
  expect(v7Load(r.world, required(r.world.actors[0]))).toBeCloseTo(mass);
  expect(r.world.stacks.some((s) => s.reservedFor)).toBe(false);
  expect(
    metrologyStep(
      v7Clone(r.world),
      metrologyAction(
        'load-test',
        'too-long',
        'item-112-moss-648',
        [{ item: 'weight', quantity: 1 }],
        99,
      ),
    ).outcomes.moss?.success,
  ).toBe(false);
});
it('rejects hidden, alias, partial, duplicate and occluded inputs while preserving material and zero paid progress', () => {
  const w = metrologyFixture();
  for (const target of [
    'resource:branch',
    'item:item:item-112-moss-648',
    'missing',
  ]) {
    const r = metrologyStep(w, metrologyAction('measure', 'bad', target));
    expect(r.outcomes.moss?.success).toBe(false);
    expect(r.world.stacks).toEqual(w.stacks);
  }
  const part = v7Clone(w);
  required(part.stacks[0]).quantity = 0.5;
  required(part.stacks[0]).quantityTenths = 5;
  expect(
    metrologyStep(part, metrologyAction('measure')).outcomes.moss?.success,
  ).toBe(false);
  const blocked = v7Clone(w);
  required(blocked.objects[0]).spatial.x = 8;
  required(blocked.objects[0]).spatial.y = 8.65;
  expect(
    metrologyStep(blocked, metrologyAction('measure')).outcomes.moss?.success,
  ).toBe(false);
});
it('retains source identity through actual drop and pickup, and does not grant another actor personal measurement', () => {
  let w = measuredFixture();
  const shape = w.state['geometry:unit:forest-branch-0:0'];
  w = v7Clone(
    metrologyStep(w, {
      interface: 'drop',
      args: { target: 'item-112-moss-648', quantity: 1 },
    }).world,
  );
  const ground = required(w.stacks.find((s) => s.owner === null));
  w = v7Clone(
    metrologyStep(w, {
      interface: 'pickup',
      args: { target: ground.id, quantity: 1 },
    }).world,
  );
  const held = required(w.stacks.find((s) => s.owner === 'moss'));
  expect(w.state[`geometry:allocation:${held.id}`]).toEqual({
    quantity: 1,
    units: ['forest-branch-0:0'],
  });
  expect(w.state['geometry:unit:forest-branch-0:0']).toEqual(shape);
  expect(w.state['metrology:measured:sol:forest-branch-0:0']).toBeUndefined();
});
it('keeps isolated load evidence physical and preserves known old laws on migration', () => {
  const frames = metrologyFrames(),
    last = required(frames.at(-1));
  expect(
    last.events.find((e) => e.type === 'metrology-load-tested')?.data.force,
  ).toBeCloseTo(2 * 2 * 9.81);
  expect(
    last.objects.find((o) => o.kind === 'metrology-layout')?.data.stage,
  ).toBe(2);
  let old = diagnosticFixture();
  old.objects = metrologyFixture().objects;
  old.state['woven:law:branch:forest-branch-0'] = {
    version: 1,
    length: 0.8,
    density: 350,
  };
  old = v7Clone(v7Install(old, continuousRegistry(old), 'material-geometry@1'));
  expect((old.state['geometry:unit:forest-branch-0:0'] as V7Data).length).toBe(
    0.8,
  );
});

it('pauses without energy and releases death escrow at the real layout without refunds or repeated release', () => {
  let w = metrologyFixture();
  required(w.actors[0]).vitals.energy = 0;
  let r = metrologyStep(w, metrologyAction('measure'));
  expect(r.outcomes.moss?.complete).toBe(false);
  expect(
    (r.world.state['metrology:work:moss:measure-one'] as V7Data).paid,
  ).toBe(0);
  w = v7Clone(r.world);
  required(w.actors[0]).vitals.health = 0.1;
  required(w.actors[0]).vitals.satiety = 0;
  r = metrologyStep(w, metrologyAction('measure'));
  expect(r.world.events.some((e) => e.type === 'died')).toBe(true);
  expect(r.world.stacks.some((s) => s.reservedFor)).toBe(false);
  expect(
    r.world.stacks.find((s) => s.id === 'item-112-moss-648'),
  ).toMatchObject({ owner: null, position: { x: 8, y: 8.65 } });
  expect(
    r.world.events.filter((e) => e.type === 'metrology-stopped'),
  ).toHaveLength(1);
});
it('retains conserved fracture fragments and permanent damage without inventing replacement poles', () => {
  let w = measuredFixture();
  w.stacks.push({
    id: 'heavy',
    resource: 'stone',
    quantity: 300,
    owner: 'moss',
    origin: 'explicit-isolated-load',
    position: { x: 8, y: 8 },
  });
  const mass = v7Load(w, required(w.actors[0]));
  const action = metrologyAction(
    'load-test',
    'failure',
    'item-112-moss-648',
    [{ item: 'heavy', quantity: 300 }],
    0.4,
  );
  for (let i = 0; i < 2; i++) w = v7Clone(metrologyStep(w, action).world);
  const e = w.events.find((e) => e.type === 'metrology-load-tested');
  expect(e?.data.broken).toBe(true);
  expect(w.stacks.some((s) => s.id === 'item-112-moss-648')).toBe(false);
  expect(
    w.stacks.filter((s) => s.resource === 'branch').map((s) => s.quantity),
  ).toEqual([0.5, 0.5]);
  expect(v7Load(w, required(w.actors[0]))).toBeCloseTo(mass);
  const fragment = required(w.stacks.find((s) => s.resource === 'branch'));
  expect(
    metrologyStep(w, metrologyAction('measure', 'fake-new-pole', fragment.id))
      .outcomes.moss?.success,
  ).toBe(false);
});
it('refuses resumed partial weights and distinguishes cheap visible-shape inspection from paid dimensional evidence', () => {
  let w = measuredFixture();
  w.stacks.push({
    id: 'weight',
    resource: 'stone',
    quantity: 2,
    owner: 'moss',
    origin: 'fixture',
    position: { x: 8, y: 8 },
  });
  w = v7Clone(
    metrologyStep(
      w,
      metrologyAction(
        'load-test',
        'partial-load',
        'item-112-moss-648',
        [{ item: 'weight', quantity: 2 }],
        0.4,
      ),
    ).world,
  );
  w = v7Clone(metrologyStep(w, { interface: 'rest', args: {} }).world);
  const load = required(w.stacks.find((s) => s.resource === 'stone'));
  load.quantity = 1;
  load.quantityTenths = 10;
  expect(
    metrologyStep(w, metrologyAction('resume', 'partial-load', '')).outcomes
      .moss?.success,
  ).toBe(false);
  const inspected = diagnosticStep(metrologyFixture());
  expect(
    inspected.world.events.find((e) => e.type === 'shelter-inspected')?.data
      .observed,
  ).toMatchObject({ length: null, diameter: null, loadCapacity: null });
  expect(
    inspected.world.events.some((e) => e.type === 'information-confirmed'),
  ).toBe(false);
});

it('shares physical source identity after real handoff while requiring the other actor to learn and measure personally', () => {
  let w = measuredFixture();
  const other = v7Clone(required(w.actors[0]));
  other.id = 'sol';
  other.name = 'Sol';
  other.position = { x: 8, y: 7.3 };
  other.mastered = [...(w.config.development?.baseline ?? [])];
  other.memory.knowledge = {};
  other.extensionState = {};
  w.actors.push(other);
  const before = v7Step(
    w,
    { moss: { interface: 'wait', args: {} }, sol: metrologyAction('inspect') },
    continuousRegistry(w),
  );
  expect(before.outcomes.sol?.success).toBe(false);
  w = v7Clone(
    v7Step(
      w,
      {
        sol: { interface: 'wait', args: {} },
        moss: {
          interface: 'give',
          args: { target: 'item-112-moss-648', quantity: 1, recipient: 'sol' },
        },
      },
      continuousRegistry(w),
    ).world,
  );
  const held = required(w.stacks.find((s) => s.owner === 'sol'));
  expect(w.state[`geometry:allocation:${held.id}`]).toMatchObject({
    units: ['forest-branch-0:0'],
  });
  for (let i = 0; i < 2; i++)
    w = v7Clone(
      v7Step(
        w,
        {
          moss: { interface: 'wait', args: {} },
          sol: {
            interface: 'learn',
            args: { ability: 'shelter-material-metrology' },
          },
        },
        continuousRegistry(w),
      ).world,
    );
  expect(w.actors.find((a) => a.id === 'sol')?.mastered).toContain(
    'shelter-material-metrology',
  );
  expect(w.state['metrology:measured:sol:forest-branch-0:0']).toBeUndefined();
  const inspect = v7Step(
    w,
    {
      moss: { interface: 'wait', args: {} },
      sol: metrologyAction('inspect', '', held.id),
    },
    continuousRegistry(w),
  );
  expect(inspect.outcomes.sol?.success, inspect.outcomes.sol?.reason).toBe(
    true,
  );
  expect(
    inspect.world.events.some((e) => e.type === 'information-confirmed'),
  ).toBe(false);
});
