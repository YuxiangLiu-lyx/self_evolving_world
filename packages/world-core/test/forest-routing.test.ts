import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
  v7Remember,
  v7Route,
  v7Work,
  v7SegmentClear,
  v7Obstacles,
  shelterSpatial,
  forestRoute,
} from '../src/index.js';
import type { V7Action, V7World } from '../src/index.js';
import { forestFixture } from './fixtures/forest-extension.js';
const registry = continuousRegistry(),
  wait: V7Action = { interface: 'wait', args: {} };
function present<T>(value: T | undefined | null): T {
  if (value === undefined || value === null)
    throw new Error('Missing fixture value');
  return value;
}
function actor(w: V7World) {
  const a = w.actors[0];
  if (!a) throw new Error('Missing actor');
  return a;
}
function fixture(install = true, angle = 0) {
  let w = forestFixture();
  const point = (x: number, y: number) => ({
    x: 16 + x * Math.cos(angle) - y * Math.sin(angle),
    y: 17 + x * Math.sin(angle) + y * Math.cos(angle),
  });
  actor(w).position = point(0, 0.8);
  const b = w.actors[1];
  if (!b) throw new Error('Missing other actor');
  b.position = point(0, 0.3);
  w.actors.push({
    ...v7Clone(b),
    id: 'c',
    name: 'c',
    position: point(0.6, 0.55),
  });
  for (const pkg of [
    'food-assessment@1',
    'forest-perception@1',
    'shelter-construction@1',
  ])
    w = v7Clone(v7Install(w, registry, pkg));
  w.objects.push({
    id: 'room',
    name: 'Isolated actual-size shelter',
    kind: 'insulating-shelter',
    spatial: shelterSpatial(16, 17, angle),
    visual: {
      component: 'enclosure',
      color: '#8b7957',
      accent: '#d5bf81',
      label: 'Shelter',
      state: 'protected',
    },
    data: { remainingService: 160, constructedAt: 0 },
    createdBy: 'a',
    createdAt: 0,
    revision: 'shelter-construction@1',
  });
  v7Remember(w);
  if (install) w = v7Clone(v7Install(w, registry, 'route-inspection@1'));
  return { w, point };
}
function step(w: V7World, action = wait) {
  const result = v7Step(w, { a: action, b: wait, c: wait }, registry);
  expect(result.paused).toBeNull();
  return v7Clone(result.world);
}
describe('reviewed observed continuous routing correction', () => {
  it('reproduces the actual round-619 corner failure and follows clearance-valid continuous edges with normal distance costs', () => {
    const { w } = fixture();
    const a = actor(w),
      goal = { x: 15.45, y: 17.65 };
    expect(() => v7Route(w, a, goal, v7Work(2000000))).toThrow('No route');
    const e = forestRoute(w, a, goal, v7Work(2000000));
    expect(e.status).toBe('reachable');
    let from = a.position;
    for (const p of e.path) {
      expect(v7SegmentClear(from, p, a.radius, v7Obstacles(w, a))).toBe(true);
      from = p;
    }
    const result = step(w, {
      interface: 'navigate',
      args: { target: '', ...goal },
    });
    expect(result.events.some((e) => e.type === 'failed')).toBe(false);
    const distance = Math.hypot(
      actor(result).position.x - a.position.x,
      actor(result).position.y - a.position.y,
    );
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThanOrEqual(0.8);
    expect(actor(result).vitals.energy).toBeCloseTo(
      a.vitals.energy - distance * 2,
      7,
    );
    expect(actor(result).vitals.satiety).toBeCloseTo(a.vitals.satiety - 0.65);
    const final = step(result, {
      interface: 'navigate',
      args: { target: '', ...goal },
    });
    expect(actor(final).position).toEqual(goal);
  });
  it('uses identical rotated wall clearance and preserves shelters and all protected accounts on installation', () => {
    for (const angle of [Math.PI / 2, 0.37]) {
      const { w, point } = fixture(false, angle),
        before = v7Clone(w);
      const installed = v7Clone(v7Install(w, registry, 'route-inspection@1'));
      expect(installed.objects).toEqual(before.objects);
      expect(installed.stacks).toEqual(before.stacks);
      expect(actor(installed).vitals).toEqual(actor(before).vitals);
      expect(actor(installed).mastered).toEqual(actor(before).mastered);
      const e = forestRoute(
        installed,
        actor(installed),
        point(-0.55, 0.65),
        v7Work(2000000),
      );
      expect(e.status).toBe('reachable');
      let from = actor(installed).position;
      for (const p of e.path) {
        expect(
          v7SegmentClear(
            from,
            p,
            0.22,
            v7Obstacles(installed, actor(installed)),
          ),
        ).toBe(true);
        from = p;
      }
    }
  });
  it('distinguishes proven occupied passage, dynamic clearance, wall overlap and narrow geometry', () => {
    const { w } = fixture();
    actor(w).position = { x: 16, y: 17 };
    const b = present(w.actors[1]);
    b.position = { x: 16, y: 17.6 };
    v7Remember(w);
    const blocked = forestRoute(
      w,
      actor(w),
      { x: 16, y: 18.5 },
      v7Work(2000000),
    );
    expect(blocked.status).toBe('blocked');
    expect(blocked.reasonCode).toBe('occupied-passage');
    expect(blocked.observedBlockers).toContain('b');
    b.position = { x: 15.4, y: 16.5 };
    v7Remember(w);
    const clear = forestRoute(w, actor(w), { x: 16, y: 18.5 }, v7Work(2000000));
    expect(clear.status).toBe('reachable');
    expect(clear.geometryRevision).not.toBe(blocked.geometryRevision);
    expect(
      forestRoute(w, actor(w), { x: 15.4, y: 17.7 }, v7Work(2000000))
        .reasonCode,
    ).toBe('goal-overlap');
    present(present(w.objects[0]).spatial.enclosure).doorway = 0.4;
    v7Remember(w);
    expect(
      forestRoute(w, actor(w), { x: 16, y: 18.5 }, v7Work(2000000)).reasonCode,
    ).toBe('doorway-too-narrow');
  });
  it('does not expose hidden actors or certify unobserved terrain and rejects actual start overlap', () => {
    const { w } = fixture();
    present(w.actors[1]).position = { x: 16, y: 14 };
    present(w.actors[2]).position = { x: 22, y: 22 };
    v7Remember(w);
    const e = forestRoute(w, actor(w), { x: 16, y: 10 }, v7Work(2000000));
    expect(e.status).toBe('unknown');
    expect(e.observedBlockers).not.toContain('b');
    expect(JSON.stringify(e)).not.toContain('"id":"b"');
    actor(w).position = { x: 15.1, y: 17 };
    v7Remember(w);
    expect(
      forestRoute(w, actor(w), { x: 16, y: 17 }, v7Work(2000000)).reasonCode,
    ).toBe('start-overlap');
  });
  it('requires one personal study round, spends inspection time and effort without moving or rewarding, and cancels on death', () => {
    let { w } = fixture();
    const action: V7Action = {
      interface: 'inspect-route',
      args: { target: '', x: 15.45, y: 17.65 },
    };
    expect(step(w, action).events.some((e) => e.type === 'failed')).toBe(true);
    w = step(w, { interface: 'learn', args: { ability: 'inspect-route' } });
    expect(actor(w).mastered).toContain('inspect-route');
    const before = v7Clone(w);
    w = step(w, action);
    expect(actor(w).position).toEqual(actor(before).position);
    expect(actor(w).vitals.energy).toBe(actor(before).vitals.energy - 0.5);
    expect(actor(w).wellbeing.mental).toBe(0);
    expect(w.events.some((e) => e.type === 'route-inspection-completed')).toBe(
      true,
    );
    expect(actor(w).extensionState['route:lastInspection']).toMatchObject({
      status: 'reachable',
    });
    actor(w).vitals.health = 1;
    actor(w).vitals.satiety = 0;
    w = step(w, action);
    expect(actor(w).life?.deaths).toBe(1);
    expect(w.events.some((e) => e.type === 'route-inspection-failed')).toBe(
      true,
    );
    expect(w.events.some((e) => e.type === 'route-inspection-completed')).toBe(
      false,
    );
    expect(actor(w).extensionState['route:pending']).toBeUndefined();
  });
  it('puts observation-limited failure evidence into failed movement events without spending displacement energy', () => {
    let { w } = fixture();
    const energy = actor(w).vitals.energy;
    w = step(w, {
      interface: 'navigate',
      args: { target: '', x: 15.4, y: 17.7 },
    });
    expect(
      w.events.find((e) => e.type === 'failed' && e.actor === 'a')?.data,
    ).toMatchObject({ reasonCode: 'goal-overlap', observationLimited: true });
    expect(actor(w).vitals.energy).toBe(energy);
  });
});
