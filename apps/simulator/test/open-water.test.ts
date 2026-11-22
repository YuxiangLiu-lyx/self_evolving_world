import { it, expect } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Load,
  v7Step,
  v7Registry,
} from '@self-evolving-world/world-core';
import type {
  V7World,
  V7Data,
  V7Action,
} from '@self-evolving-world/world-core';
import { initialOpenWorld } from '../src/open-scenario.js';
import {
  waterAction,
  waterFixture,
  waterStep,
  waterAdvance,
  cupForm,
  waterCupWorld,
} from './fixtures/open-water.js';
import { wovenAction } from './fixtures/open-woven.js';
const need = <T>(x: T | undefined): T => {
  if (x === undefined) throw new Error('Missing fixture value');
  return x;
};
const actor = (w: V7World) => need(w.actors[0]);
const cup = (w: V7World) => need(w.stacks.find((s) => s.waterCup));
const wait = { interface: 'wait', args: {} };
const clayMass = (w: V7World) =>
  w.stacks
    .filter((s) =>
      ['clay', 'wet-clay-fragments', 'unfired-water-cup'].includes(s.resource),
    )
    .reduce(
      (n, s) =>
        n +
        (s.waterCup
          ? Number(s.waterCup.wallMass)
          : (s.physical?.unitMass ?? 1.5) * s.quantity),
      0,
    ) +
  w.objects
    .filter((o) => o.kind === 'water-spill')
    .reduce((n, o) => n + Number(o.data.clayMass), 0) +
  Object.values(w.state).reduce<number>(
    (n, r) =>
      n +
      (r &&
      typeof r === 'object' &&
      !Array.isArray(r) &&
      r.escrow &&
      ['active', 'paused'].includes(
        typeof r.status === 'string' ? r.status : '',
      )
        ? Number(((r.escrow as V7Data).physical as V7Data).unitMass) *
          Number((r.escrow as V7Data).quantity)
        : 0),
    0,
  );
it('installs no water, cup or mastery and isolates the current-run function while retaining personal study', () => {
  let w = waterFixture(false);
  expect(actor(w).mastered).not.toContain('access-water');
  expect(w.stacks.some((s) => s.waterCup)).toBe(false);
  expect(Object.keys(w.state).some((k) => k.startsWith('water:cell:'))).toBe(
    false,
  );
  expect(
    waterStep(w, waterAction('inspect', 'river:9:8')).outcomes.lin?.success,
  ).toBe(false);
  for (let i = 0; i < 2; i++)
    w = waterAdvance(w, {
      interface: 'learn',
      args: { ability: 'access-water' },
    });
  expect(actor(w).mastered).toContain('access-water');
  expect(actor(w).wellbeing.sources).toEqual([]);
  expect(() =>
    v7Install(
      initialOpenWorld('other-water-run'),
      continuousRegistry(w),
      'river-contact-water@1',
    ),
  ).toThrow(/scope/);
});
it('observes supported-bank reach without moving, creating a nonriver source or refilling a previously inspected cell', () => {
  let w = waterFixture();
  actor(w).position.x = 8;
  w = waterAdvance(w, waterAction('inspect', 'river:9:8'));
  expect(
    w.events.find((e) => e.type === 'water-access-inspected')?.data.reachable,
  ).toBe(false);
  expect(actor(w).position.x).toBe(8);
  const cell = w.state['water:cell:river:9:8'] as V7Data;
  cell.remainingMl = 7;
  w = waterAdvance(w, waterAction('inspect', 'river:9:8'));
  expect((w.state['water:cell:river:9:8'] as V7Data).remainingMl).toBe(7);
  expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(false);
  w = waterAdvance(w, waterAction('inspect', '', '', 0, '', 8, 9));
  expect(w.state['water:cell:river:8:9']).toBeUndefined();
  expect(
    waterStep(w, waterAction('inspect', 'river:40:30')).outcomes.lin?.success,
  ).toBe(false);
});
it('forms a real indivisible empty cup in three paid stages and retains exact surplus clay mass', () => {
  let w = waterFixture();
  const energy = actor(w).vitals.energy;
  const total = clayMass(w);
  w = waterAdvance(w, cupForm());
  expect(w.stacks.some((s) => s.waterCup)).toBe(false);
  expect(clayMass(w)).toBeCloseTo(total, 8);
  expect(
    w.objects.find((o) => o.kind === 'water-cup-work')?.data.remainingWork,
  ).toBe(2);
  w = waterAdvance(JSON.parse(JSON.stringify(w)) as V7World, cupForm());
  w = waterAdvance(w, cupForm());
  expect(cup(w).waterCup).toMatchObject({
    capacityMl: 100,
    waterMl: 0,
    wallMass: 0.5,
  });
  expect(clayMass(w)).toBeCloseTo(total, 8);
  expect(actor(w).vitals.energy).toBeCloseTo(energy - 1.5);
  expect(w.events.some((e) => e.type === 'satisfaction')).toBe(false);
  expect(
    waterStep(w, {
      interface: 'pickup',
      args: { target: cup(w).id, quantity: 0.1 },
    }).outcomes.lin?.success,
  ).toBe(false);
});
it('pauses without access or energy, resumes only remaining forming work and cancels without duplicate refund', () => {
  let w = waterFixture();
  actor(w).vitals.energy = 0;
  w = waterAdvance(w, cupForm());
  expect(w.stacks.find((s) => s.id === 'wet-clay')?.quantity).toBe(1);
  expect(w.objects).toHaveLength(0);
  actor(w).vitals.energy = 10;
  w = waterAdvance(w, cupForm());
  actor(w).vitals.energy = 0;
  w = waterAdvance(w, cupForm());
  expect(w.objects[0]?.data.stage).toBe(1);
  actor(w).vitals.energy = 10;
  w = waterAdvance(w, waterAction('resume'));
  expect(w.objects[0]?.data.stage).toBe(2);
  expect(actor(w).vitals.energy).toBeCloseTo(9.5);
  w = waterAdvance(w, waterAction('cancel'));
  expect(clayMass(w)).toBeCloseTo(1.5);
  expect(waterStep(w, waterAction('cancel')).outcomes.lin?.success).toBe(false);
  expect(clayMass(w)).toBeCloseTo(1.5);
});
it('cancels incompatible and death-interrupted forming once, leaving real material at its work site', () => {
  let w = waterAdvance(waterFixture(), cupForm());
  w = waterAdvance(w, wait);
  expect(clayMass(w)).toBeCloseTo(1.5);
  expect(w.stacks.some((s) => s.owner === null && s.position.y === 9)).toBe(
    true,
  );
  w = waterAdvance(waterFixture(), cupForm());
  const pkg = need(
    continuousRegistry(w).packages.find((p) => p.id === 'river-contact-water'),
  );
  pkg.onDeath?.(w, actor(w));
  pkg.onDeath?.(w, actor(w));
  expect(clayMass(w)).toBeCloseTo(1.5);
  expect(w.objects).toHaveLength(0);
});
it('rejects aliases, ownership, shortages and excess capacity without silently substituting or consuming water', () => {
  let w = waterCupWorld();
  w = waterAdvance(w, waterAction('inspect', 'river:9:8'));
  const id = cup(w).id;
  for (const container of [
    'resource:unfired-water-cup',
    'item:item:' + id,
    'absent',
  ])
    expect(
      waterStep(w, waterAction('fill', 'river:9:8', container, 50)).outcomes.lin
        ?.success,
    ).toBe(false);
  expect(
    waterStep(w, waterAction('fill', 'river:9:8', id, 101)).outcomes.lin
      ?.success,
  ).toBe(false);
  (w.state['water:cell:river:9:8'] as V7Data).remainingMl = 5;
  expect(
    waterStep(w, waterAction('fill', 'river:9:8', id, 6)).outcomes.lin?.success,
  ).toBe(false);
  expect(cup(w).waterCup?.waterMl).toBe(0);
  cup(w).owner = 'moss';
  expect(
    waterStep(w, waterAction('inspect-cup', '', id)).outcomes.lin?.success,
  ).toBe(false);
  const small = waterFixture();
  need(small.stacks.find((s) => s.id === 'wet-clay')).quantity = 0.3;
  expect(waterStep(small, cupForm()).outcomes.lin?.success).toBe(false);
});
it('conserves finite withdrawals, passive leakage, wall sediment and mass through whole-item handoff and travel', () => {
  let w = waterCupWorld();
  w = waterAdvance(w, waterAction('inspect', 'river:9:8'));
  const id = cup(w).id;
  w = waterAdvance(w, waterAction('fill', 'river:9:8', 'item:' + id, 80));
  expect(cup(w).waterCup?.waterMl).toBe(79);
  expect(clayMass(w)).toBeCloseTo(1.5, 8);
  const before = v7Load(w, actor(w));
  w = waterAdvance(w, {
    interface: 'pickup',
    args: { target: id, quantity: 1 },
  });
  expect(cup(w).id).toBe(id);
  expect(v7Load(w, actor(w))).toBeGreaterThan(before + 0.5);
  actor(w).position = { x: 7.5, y: 8.5 };
  w = waterAdvance(w, wait);
  expect(cup(w).position).toEqual(actor(w).position);
  w = waterAdvance(w, { interface: 'drop', args: { target: id, quantity: 1 } });
  expect(cup(w).id).toBe(id);
  expect(cup(w).owner).toBeNull();
  const leaked = w.objects
    .filter((o) => o.kind === 'water-spill')
    .reduce((n, o) => n + Number(o.data.waterMl), 0);
  expect(leaked + Number(cup(w).waterCup?.waterMl)).toBe(80);
  expect(clayMass(w)).toBeCloseTo(1.5, 8);
});
it('collapses below its actual wall threshold while retaining every remaining gram and spilling the contents', () => {
  let w = waterCupWorld();
  w = waterAdvance(w, waterAction('inspect', 'river:9:8'));
  const id = cup(w).id;
  w = waterAdvance(w, waterAction('fill', 'river:9:8', id, 50));
  need(cup(w).waterCup).wallMass = 0.45005;
  const total = clayMass(w);
  w = waterAdvance(w, wait);
  expect(w.stacks.some((s) => s.waterCup)).toBe(false);
  expect(clayMass(w)).toBeCloseTo(total, 8);
  expect(w.stacks.find((s) => s.id === id)?.resource).toBe(
    'wet-clay-fragments',
  );
  expect(
    w.objects
      .filter((o) => o.kind === 'water-spill')
      .reduce((n, o) => n + Number(o.data.waterMl), 0),
  ).toBe(50);
});
it('keeps a waterless comparison unchanged until local contact, then charges only its remaining real comparison stage', () => {
  let w = waterFixture();
  w = waterAdvance(
    w,
    wovenAction('test-vine', 'vine', ['hammer'], 'water-test'),
  );
  w = waterAdvance(w, wait);
  const specimen = need(w.stacks.find((s) => s.processing?.wovenSpecimen));
  // Isolated dry-condition fixture; no formal observation or result is supplied.
  specimen.physical = { unitMass: 0.155, unitWater: 0.005, unitSolids: 0.15 };
  w = waterAdvance(w, waterAction('inspect', 'river:9:8'));
  const dry = need(w.stacks.find((s) => s.id === specimen.id)).physical
    ?.unitWater;
  w = waterAdvance(w, waterAction('wet', specimen.id, 'river:9:8'));
  expect(
    need(w.stacks.find((s) => s.id === specimen.id)).physical?.unitWater,
  ).toBeGreaterThan(dry ?? 0);
  expect(w.events.some((e) => e.type === 'woven-support-test')).toBe(false);
  expect((w.state['water:cell:river:9:8'] as V7Data).remainingMl).toBe(9990);
  const energy = actor(w).vitals.energy;
  w = waterAdvance(w, wovenAction('resume', '', [], 'water-test'));
  expect(w.events.some((e) => e.type === 'woven-support-test')).toBe(true);
  expect(actor(w).vitals.energy).toBeCloseTo(energy - 0.5);
  expect(
    w.events.find((e) => e.type === 'woven-support-test')?.data.paidEnergy,
  ).toBe(1);
  expect(
    waterStep(w, waterAction('wet', specimen.id, 'river:9:8')).outcomes.lin
      ?.success,
  ).toBe(false);
});
it('cannot wet a distant ground specimen or a different actor project', () => {
  let w = waterFixture();
  w = waterAdvance(
    w,
    wovenAction('test-vine', 'vine', ['hammer'], 'water-test'),
  );
  w = waterAdvance(w, wait);
  w = waterAdvance(w, waterAction('inspect', 'river:9:8'));
  const s = need(w.stacks.find((s) => s.processing?.wovenSpecimen));
  s.owner = null;
  s.position = { x: 8, y: 13 };
  expect(
    waterStep(w, waterAction('wet', s.id, 'river:9:8')).outcomes.lin?.success,
  ).toBe(false);
  expect((w.state['water:cell:river:9:8'] as V7Data).remainingMl).toBe(10000);
});

it('requires another actor to learn separately and atomically excludes conflicting withdrawals from the same finite source', () => {
  let w = waterCupWorld();
  const moss = need(w.actors.find((a) => a.id === 'moss'));
  moss.position = { x: 8.5, y: 7.9 };
  const second = v7Clone(cup(w));
  second.id = 'second-isolated-cup';
  second.owner = 'moss';
  second.position = { ...moss.position };
  second.origin = 'isolated-extra-clay';
  w.stacks.push(second);
  const actions = (action: V7Action) =>
    Object.fromEntries(
      w.actors.map((a) => [a.id, a.id === 'moss' ? action : wait]),
    );
  expect(
    v7Step(
      w,
      actions(waterAction('inspect', 'river:9:8')),
      continuousRegistry(w),
    ).outcomes.moss?.success,
  ).toBe(false);
  for (let i = 0; i < 2; i++)
    w = v7Clone(
      v7Step(
        w,
        actions({ interface: 'learn', args: { ability: 'access-water' } }),
        continuousRegistry(w),
      ).world,
    );
  w = waterAdvance(w, waterAction('inspect', 'river:9:8'));
  w = v7Clone(
    v7Step(
      w,
      actions(waterAction('inspect', 'river:9:8')),
      continuousRegistry(w),
    ).world,
  );
  const cell = w.state['water:cell:river:9:8'] as V7Data;
  cell.remainingMl = 15;
  cell.withdrawnMl = 9985;
  const result = v7Step(
    w,
    {
      lin: waterAction('fill', 'river:9:8', cup(w).id, 10),
      moss: waterAction('fill', 'river:9:8', second.id, 10),
      sol: wait,
    },
    continuousRegistry(w),
  );
  expect(Object.values(result.outcomes).filter((o) => !o.success)).toHaveLength(
    2,
  );
  expect(
    (result.world.state['water:cell:river:9:8'] as V7Data).remainingMl,
  ).toBe(15);
  expect(
    result.world.stacks.reduce(
      (n, s) => n + Number(s.waterCup?.waterMl ?? 0),
      0,
    ),
  ).toBe(0);
  // Existing simultaneous-conflict semantics reject both atomically; a later sole withdrawal succeeds.
  w = waterAdvance(
    result.world,
    waterAction('fill', 'river:9:8', cup(w).id, 10),
  );
  expect((w.state['water:cell:river:9:8'] as V7Data).remainingMl).toBe(5);
  expect(
    w.stacks.reduce((n, s) => n + Number(s.waterCup?.waterMl ?? 0), 0),
  ).toBe(9);
});

it('uses an explicitly carried cup for contact without withdrawing the same water twice', () => {
  let w = waterCupWorld();
  const id = cup(w).id;
  w = waterAdvance(
    w,
    wovenAction('test-vine', 'vine', ['hammer'], 'cup-contact'),
  );
  w = waterAdvance(w, waterAction('inspect', 'river:9:8'));
  const specimen = need(w.stacks.find((s) => s.processing?.wovenSpecimen));
  specimen.physical = { unitMass: 0.155, unitWater: 0.005, unitSolids: 0.15 };
  w = waterAdvance(w, waterAction('fill', 'river:9:8', id, 30));
  w = waterAdvance(w, {
    interface: 'pickup',
    args: { target: id, quantity: 1 },
  });
  const before = Number(cup(w).waterCup?.waterMl);
  w = waterAdvance(w, waterAction('wet', specimen.id, id));
  expect(Number(cup(w).waterCup?.waterMl)).toBe(before - 11);
  expect((w.state['water:cell:river:9:8'] as V7Data).remainingMl).toBe(9970);
  expect(
    w.events.find((e) => e.type === 'material-contact-wetted')?.data.source,
  ).toBe(id);
  w = waterAdvance(w, wovenAction('resume', '', [], 'cup-contact'));
  expect(w.events.some((e) => e.type === 'woven-support-test')).toBe(true);
});

it('responds to an actual animal impact after ecology while preserving fragile vessel mass', () => {
  let w = waterCupWorld();
  const id = cup(w).id;
  w = waterAdvance(w, {
    interface: 'pickup',
    args: { target: id, quantity: 1 },
  });
  const animal = v7Clone(
    need(initialOpenWorld().objects.find((o) => o.data.species === 'boar')),
  );
  animal.spatial.x = 7.8;
  animal.spatial.y = 8.5;
  animal.data.homeX = 7.8;
  animal.data.homeY = 8.5;
  animal.data.nextAttack = 0;
  w.objects.push(animal);
  const total = clayMass(w);
  w = waterAdvance(w, wait);
  expect(
    w.events.some((e) => e.type === 'injured' && e.target === animal.id),
  ).toBe(true);
  expect(w.events.some((e) => e.type === 'water-cup-failed')).toBe(true);
  expect(clayMass(w)).toBeCloseTo(total, 8);
  expect(w.stacks.find((s) => s.id === id)?.owner).toBeNull();
});

it('keeps environmental package responses inside protected learning and wellbeing boundaries', () => {
  const w = waterFixture(),
    registry = continuousRegistry(w);
  const invalid = v7Registry(
    registry.packages.map((p) =>
      p.id === 'river-contact-water'
        ? {
            ...p,
            afterEnvironment: (world: V7World) => {
              actor(world).mastered.push('unearned');
            },
          }
        : p,
    ),
  );
  expect(() =>
    v7Step(w, Object.fromEntries(w.actors.map((a) => [a.id, wait])), invalid),
  ).toThrow(/protected rules/);
  expect(actor(w).mastered).not.toContain('unearned');
});
