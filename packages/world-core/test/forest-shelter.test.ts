import { describe, it, expect } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
  v7Observe,
  v7Remember,
  v7Interior,
  v7Walls,
  v7SegmentClear,
  forestClimate,
  shelterTemperature,
  v7Cursor,
  v7FinishTasks,
} from '../src/index.js';
import type { V7Action, V7World } from '../src/index.js';
import { forestFixture } from './fixtures/forest-extension.js';
const registry = continuousRegistry();
const wait: V7Action = { interface: 'wait', args: {} };
const build: V7Action = {
  interface: 'build-shelter',
  args: { x: 8, y: 6.5, angle: 0 },
};
function a(w: V7World) {
  const a = w.actors[0];
  if (!a) throw new Error('Missing actor');
  return a;
}
function fixture() {
  let w = forestFixture();
  a(w).position = { x: 8, y: 8 };
  w.stacks.push(
    ...[
      { resource: 'branch', quantity: 6 },
      { resource: 'dry-grass', quantity: 12 },
    ].map((s, i) => ({
      ...s,
      id: `material-${String(i)}`,
      owner: 'a',
      position: { x: 8, y: 8 },
      origin: 'isolated-material',
      harvestedAt: 0,
      decay: 0,
    })),
  );
  w = v7Clone(
    v7Install(
      v7Install(w, registry, 'food-assessment@1'),
      registry,
      'shelter-construction@1',
    ),
  );
  return w;
}
function step(w: V7World, action = wait) {
  const r = v7Step(w, { a: action, b: wait }, registry);
  expect(r.paused).toBeNull();
  return v7Clone(r.world);
}
function learned() {
  let w = fixture();
  w = step(w, { interface: 'learn', args: { ability: 'build-shelter' } });
  for (let i = 1; i < 5; i++) w = step(w);
  expect(a(w).mastered).toContain('build-shelter');
  return w;
}
function built() {
  let w = learned();
  for (let i = 0; i < 6; i++) w = step(w, build);
  expect(w.objects.some((o) => o.kind === 'insulating-shelter')).toBe(true);
  return w;
}
function total(w: V7World) {
  return w.stacks.reduce((n, s) => n + s.quantity, 0);
}
describe('actual shelter request in isolated regression', () => {
  it('requires individual study, pays six real rounds and exact inputs, and grants no completion happiness', () => {
    let w = learned();
    const energy = a(w).vitals.energy,
      satiety = a(w).vitals.satiety;
    for (let i = 1; i <= 6; i++) {
      w = step(w, build);
      expect(w.objects.some((o) => o.kind === 'insulating-shelter')).toBe(
        i === 6,
      );
      expect(total(w)).toBe(i === 6 ? 4 : 18);
      expect(a(w).wellbeing.mental).toBe(0);
    }
    expect(a(w).vitals.energy).toBe(energy - 12);
    expect(a(w).vitals.satiety).toBeCloseTo(satiety - 3.9);
    expect(w.objects[0]?.data.remainingService).toBe(160);
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
  });
  it('reserves a real footprint, rejects blocked/overlapping sites and releases interrupted escrow once', () => {
    let w = learned();
    const before = total(w);
    w = step(w, { ...build, args: { x: 8, y: 8, angle: 0 } });
    expect(w.events.some((e) => e.type === 'failed')).toBe(true);
    expect(w.objects).toHaveLength(0);
    expect(total(w)).toBe(before);
    w = step(w, build);
    expect(w.objects[0]?.kind).toBe('shelter-site');
    const portion = w.stacks.find((s) => s.reservedFor);
    if (!portion) throw new Error('Missing escrow');
    w = step(w, {
      interface: 'drop',
      args: { target: portion.id, quantity: 1 },
    });
    expect(w.events.some((e) => e.type === 'failed')).toBe(true);
    expect(w.objects).toHaveLength(0);
    expect(total(w)).toBe(before);
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    w = step(w);
    expect(total(w)).toBe(before);
  });
  it('death on the completion round creates no shelter and drops original surviving material exactly once', () => {
    let w = learned();
    for (let i = 0; i < 5; i++) w = step(w, build);
    a(w).vitals.health = 1;
    a(w).vitals.satiety = 0;
    w = step(w, build);
    expect(a(w).life?.deaths).toBe(1);
    expect(w.objects).toHaveLength(0);
    expect(total(w)).toBe(18);
    expect(w.stacks.every((s) => s.owner === null && !s.reservedFor)).toBe(
      true,
    );
    expect(w.events.some((e) => e.type === 'shelter-build-completed')).toBe(
      false,
    );
  });
  it('shares rotated wall/door geometry with actual navigation and preserves ambient and unsheltered thermal results', () => {
    let w = learned();
    const rotated: V7Action = {
      ...build,
      args: { x: 9.5, y: 8, angle: Math.PI / 2 },
    };
    for (let i = 0; i < 6; i++) w = step(w, rotated);
    expect(w.objects[0]?.kind).toBe('insulating-shelter');
    const room = w.objects[0];
    if (!room) throw new Error('Missing room');
    expect(
      v7SegmentClear(
        { x: 12, y: 8 },
        room.spatial,
        a(w).radius,
        v7Walls(room.spatial),
      ),
    ).toBe(false);
    v7Remember(w);
    for (let i = 0; i < 3; i++)
      w = step(w, {
        interface: 'navigate',
        args: { target: '', x: 9.5, y: 8 },
      });
    expect(v7Interior(a(w).position, room.spatial)).toBe(true);
    const ambient = forestClimate(w, a(w).position).temperature;
    const outside = v7Clone(w);
    outside.objects = [];
    expect(forestClimate(outside, a(w).position).temperature).toBe(ambient);
    for (const temperature of [0, 8, 14, 22, 36])
      for (const environment of [-4, 5, 20, 40]) {
        const base = shelterTemperature(temperature, environment, 0, false);
        expect(base.temperature).toBe(
          Math.round(
            (temperature + (environment - temperature) * 0.035) * 1e8,
          ) / 1e8,
        );
        if (environment >= temperature)
          expect(
            shelterTemperature(temperature, environment, 0, true).temperature,
          ).toBe(base.temperature);
      }
  });
  it('qualifies only real occupied cold relief, caps rewards and retains meaningful cold damage instead of granting immunity', () => {
    let w = built();
    a(w).position = { x: 8, y: 6.5 };
    w.tick = 560;
    w.time = 560;
    a(w).vitals.temperature = 12;
    a(w).vitals.satiety = 80;
    for (let i = 1; i <= 3; i++) {
      w = step(w, { interface: 'rest', args: {} });
      expect(a(w).wellbeing.mental).toBe(i === 3 ? 1 : 0);
    }
    const evidence = a(w).extensionState['shelter:exposure'];
    expect(evidence).toMatchObject({ target: w.objects[0]?.id });
    expect(JSON.stringify(evidence)).toContain('unshelteredColdLoss');
    expect(w.actors[1]?.wellbeing.mental).toBe(0);
    for (let i = 0; i < 12; i++) w = step(w);
    expect(a(w).wellbeing.mental).toBeLessThanOrEqual(1);
    a(w).vitals.temperature = 3;
    const hp = a(w).vitals.health;
    w = step(w);
    expect(a(w).vitals.health).toBeLessThan(hp);
    expect(a(w).extensionState['shelter:comfort']).toBeUndefined();
  });
  it('expires after 160 actual exposure rounds while retaining walls; paid maintenance restores only 160', () => {
    let w = built();
    w.config = { ...w.config, hunger: 0 };
    const room = w.objects[0];
    if (!room) throw new Error('Missing room');
    for (let i = 0; i < 159; i++) w = step(w);
    expect(w.objects[0]?.data.remainingService).toBe(1);
    const cursors = {
      a: v7Cursor(
        {
          intention: 'Continue a long authored wait',
          steps: [{ action: wait, repeat: 100, guard: null, until: null }],
          repeat: 1,
          until: null,
          interrupts: [],
          notes: [],
          preferences: [],
        },
        w.tick,
      ),
    };
    const expiry = v7Step(w, { a: wait, b: wait }, registry, cursors);
    v7FinishTasks(w, expiry, cursors);
    w = v7Clone(expiry.world);
    expect(cursors.a.reason).toContain('fresh decision');
    expect(w.objects[0]?.data.remainingService).toBe(0);
    expect(w.events.some((e) => e.type === 'shelter-protection-expired')).toBe(
      true,
    );
    const expired = w.objects[0];
    if (!expired) throw new Error('Missing retained expired frame');
    expect(v7Walls(expired.spatial)).toHaveLength(5);
    a(w).mastered.push('shelter-maintain');
    a(w).vitals.energy = 40;
    const maintenance = {
      interface: 'shelter-maintain',
      args: { target: room.id },
    };
    w = step(w, maintenance);
    expect(total(w)).toBe(4);
    w = step(w, maintenance);
    expect(total(w)).toBe(0);
    expect(w.objects[0]?.data.remainingService).toBe(160);
    expect(w.objects).toHaveLength(1);
    expect(a(w).wellbeing.mental).toBe(0);
    expect(v7Observe(w, 'a').objects[0]?.data.remainingService).toBe(160);
  });
  it('death during maintenance releases grass without deleting the existing shelter or duplicating material', () => {
    let w = built();
    a(w).mastered.push('shelter-maintain');
    const target = w.objects[0]?.id;
    if (!target) throw new Error('Missing completed shelter');
    const action = { interface: 'shelter-maintain', args: { target } };
    w = step(w, action);
    a(w).vitals.health = 1;
    a(w).vitals.satiety = 0;
    w = step(w, action);
    expect(w.objects).toHaveLength(1);
    expect(w.objects[0]?.id).toBe(target);
    expect(w.objects[0]?.data.remainingService).toBe(158);
    expect(w.objects[0]?.data.maintenance).toBeUndefined();
    expect(total(w)).toBe(4);
    expect(w.stacks.every((s) => s.owner === null && !s.reservedFor)).toBe(
      true,
    );
    expect(
      w.events.some((e) => e.type === 'shelter-maintenance-completed'),
    ).toBe(false);
  });
});
