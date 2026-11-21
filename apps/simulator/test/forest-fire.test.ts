import { describe, it, expect } from 'vitest';
import {
  v7Clone,
  v7Step,
  v7AssertWorld,
  fireState,
  v7Wellbeing,
} from '@self-evolving-world/world-core';
import {
  fireFixture,
  fireStudy,
  fireSetup,
  fireOperation,
  fireAction,
  fireWait,
  fireRegistry,
} from './fixtures/local-fire.js';

function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('Missing required isolated fixture value');
  return value;
}

describe('reviewed local fire with real work, fuel and event-grounded experience', () => {
  it('installs no items or mastery; six-round study and serialized paid work consume once', () => {
    const w = fireFixture();
    expect(w.actors[0]?.mastered).not.toContain('tend-fire');
    expect(w.stacks.some((s) => s.frictionKit)).toBe(false);
    const learned = fireStudy(w);
    expect(learned.actors[0]?.mastered).toContain('tend-fire');
    expect(learned.tick - w.tick).toBe(6);
    const a = fireAction('prepare', {
      target: 'resource:branch',
      materials: [{ target: 'fixture-branch', quantity: 1 }],
    });
    const r = fireOperation(learned, a);
    expect(r.frames).toHaveLength(4);
    expect(r.outcomes.every((o) => o?.success)).toBe(true);
    expect(
      r.frames[0]?.stacks
        .filter((s) => s.reservedFor)
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(1);
    expect(r.world.stacks.find((s) => s.resource === 'branch')?.quantity).toBe(
      6,
    );
    expect(
      r.world.stacks.find((s) => s.frictionKit)?.frictionKit?.durability,
    ).toBe(10);
    expect(() => {
      v7AssertWorld(v7Clone(r.world), fireRegistry);
    }).not.toThrow();
  });
  it('uses shared nested references; ambiguity, wrong ownership, consumed inputs and overlap fail without charge', () => {
    const w = fireStudy(fireFixture());
    const a = w.actors[0];
    if (!a) throw new Error('actor');
    w.stacks.push({ ...v7Clone(required(w.stacks[0])), id: 'duplicate' });
    const ambiguous = fireOperation(
      w,
      fireAction('prepare', {
        target: 'resource:branch',
        materials: [{ target: 'resource:branch', quantity: 1 }],
      }),
    );
    expect(ambiguous.outcomes[0]?.success).toBe(false);
    expect(JSON.stringify(ambiguous.outcomes)).toContain('ambiguous');
    const before = a.vitals.energy;
    const bad = fireOperation(
      w,
      fireAction('build', {
        x: 10,
        y: 10,
        materials: [
          { target: 'fixture-stone', quantity: 4 },
          { target: 'fixture-bark', quantity: 2 },
          { target: 'fixture-vine', quantity: 1 },
        ],
      }),
    );
    expect(bad.outcomes[0]?.success).toBe(false);
    expect(bad.world.actors[0]?.vitals.energy).toBe(before);
    expect(bad.world.objects).toHaveLength(0);
    required(w.stacks[0]).owner = 'sol';
    const wrong = fireOperation(
      w,
      fireAction('prepare', {
        target: 'fixture-branch',
        materials: [{ target: 'fixture-branch', quantity: 1 }],
      }),
    );
    expect(wrong.outcomes[0]?.success).toBe(false);
    expect(
      fireOperation(
        w,
        fireAction('feed', {
          target: 'missing',
          materials: [{ target: 'consumed-item', quantity: 1 }],
        }),
      ).outcomes[0]?.success,
    ).toBe(false);
  });
  it('preserves component mass and kit identity; a finite fire warms another actor and consumes fuel without healing', () => {
    const { world, site } = fireSetup();
    const f = fireState(required(world.objects.find((o) => o.id === site)));
    expect(
      f.inputs.reduce(
        (n, i) =>
          n +
          Number(i.quantity) *
            Number(world.resources.find((r) => r.id === i.resource)?.mass),
        0,
      ),
    ).toBeCloseTo(9.1);
    expect(
      world.stacks.find((s) => s.frictionKit)?.frictionKit?.durability,
    ).toBe(9);
    let w = v7Clone(world);
    required(w.actors[1]).position = { x: 11, y: 11 };
    required(w.actors[1]).vitals.health = 80;
    let heats = 0;
    for (let i = 0; i < 40; i++) {
      const r = v7Step(
        w,
        { lin: fireWait, moss: fireWait, sol: fireWait },
        fireRegistry,
      );
      expect(r.paused).toBeNull();
      w = v7Clone(r.world);
      heats += w.events.filter(
        (e) => e.actor === 'moss' && e.type === 'fire-exposure-measured',
      ).length;
    }
    const after = fireState(required(w.objects.find((o) => o.id === site)));
    expect(heats).toBeGreaterThan(3);
    expect(after.lit).toBe(false);
    expect(after.embers).toBe(0);
    expect(after.lots).toHaveLength(0);
    expect(after.burnedMass).toBeGreaterThan(0);
    expect(after.ash + after.releasedMass).toBeCloseTo(3 * 1.1 + 0.5 * 0.1, 6);
    expect(required(w.actors[1]).vitals.health).toBeLessThanOrEqual(80);
    expect(required(w.actors[1]).mastered).not.toContain('tend-fire');
  });
  it('cancellation releases surviving materials once; death cannot manufacture an unfinished item', () => {
    let w = fireStudy(fireFixture());
    const r = fireOperation(
      w,
      fireAction('prepare', {
        target: 'fixture-branch',
        materials: [{ target: 'fixture-branch', quantity: 1 }],
      }),
      'lin',
      1,
    );
    w = r.world;
    expect(w.stacks.some((s) => s.reservedFor)).toBe(true);
    const stopped = v7Step(
      w,
      { lin: fireWait, moss: fireWait, sol: fireWait },
      fireRegistry,
    );
    expect(stopped.world.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(
      stopped.world.stacks
        .filter((s) => s.resource === 'branch')
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(7);
    w = v7Clone(r.world);
    required(w.actors[0]).vitals.health = 0.01;
    required(w.actors[0]).vitals.satiety = 0;
    const dead = v7Step(
      w,
      { lin: fireWait, moss: fireWait, sol: fireWait },
      fireRegistry,
    );
    expect(
      dead.world.events.some((e) => e.type === 'died' && e.actor === 'lin'),
    ).toBe(true);
    expect(dead.world.stacks.some((s) => s.frictionKit)).toBe(false);
    expect(dead.world.stacks.some((s) => s.reservedFor)).toBe(false);
  });
  it('wet ignition fails; paid interrupted ignition never refunds tinder or durability', () => {
    const { world, site } = fireSetup();
    let w = v7Clone(world);
    const f = fireState(required(w.objects.find((o) => o.id === site)));
    f.lit = false;
    f.embers = 0;
    for (const l of f.lots) l.moisture = 1;
    const failed = fireOperation(w, fireAction('ignite', { target: site }));
    expect(failed.outcomes[0]?.success).toBe(false);
    expect(
      failed.world.stacks.find((s) => s.frictionKit)?.frictionKit?.durability,
    ).toBe(9);
    for (const l of f.lots) l.moisture = 0;
    w = fireOperation(
      w,
      fireAction('feed', {
        target: site,
        materials: [{ target: 'fixture-dry-grass', quantity: 0.1 }],
      }),
    ).world;
    const first = fireOperation(
      w,
      fireAction('ignite', { target: site }),
      'lin',
      1,
    );
    expect(first.outcomes[0]?.success).toBe(true);
    const stopped = v7Step(
      first.world,
      { lin: fireWait, moss: fireWait, sol: fireWait },
      fireRegistry,
    ).world;
    expect(
      stopped.stacks.find((s) => s.frictionKit)?.frictionKit?.durability,
    ).toBe(8);
    expect(
      fireState(required(stopped.objects.find((o) => o.id === site))).lit,
    ).toBe(false);
    expect(stopped.actors[0]?.extensionState['fire:pending']).toBeUndefined();
  });
  it('wall occlusion prevents heat; the physical solver still applies overheating damage', () => {
    const { world, site } = fireSetup();
    const clear = v7Step(
      world,
      { lin: fireWait, moss: fireWait, sol: fireWait },
      fireRegistry,
    ).world;
    expect(
      clear.events.some(
        (e) => e.actor === 'lin' && e.type === 'fire-exposure-measured',
      ),
    ).toBe(true);
    const blocked = v7Clone(world);
    blocked.objects.push({
      id: 'isolated-wall',
      kind: 'wall',
      name: 'Fixture wall',
      spatial: {
        x: 10.5,
        y: 10,
        angle: 0,
        shape: { kind: 'rectangle', width: 0.05, height: 1 },
        solid: true,
        interaction: 0,
        entrances: [],
      },
      visual: {
        component: 'rock',
        color: '#777777',
        accent: '#ffffff',
        label: 'Wall',
        state: 'solid',
      },
      data: {},
      createdBy: null,
      createdAt: 0,
      revision: 'local-fire@1',
    });
    const result = v7Step(
      blocked,
      { lin: fireWait, moss: fireWait, sol: fireWait },
      fireRegistry,
    );
    expect(result.paused).toBeNull();
    expect(
      result.world.events.some(
        (e) => e.actor === 'lin' && e.type === 'fire-exposure-measured',
      ),
    ).toBe(false);
    const hot = v7Clone(world);
    required(hot.actors[0]).vitals.temperature = 50;
    const heat = v7Step(
      hot,
      { lin: fireWait, moss: fireWait, sol: fireWait },
      fireRegistry,
    ).world;
    expect(required(heat.actors[0]).vitals.health).toBeLessThan(100);
    expect(heat.objects.some((o) => o.id === site)).toBe(true);
  });
  it('maintains the existing capped refuge source only after real sustained relief and decays without inventing low mood', () => {
    const { world } = fireSetup();
    let w = v7Clone(world);
    for (let i = 0; i < 6; i++)
      w = v7Clone(
        v7Step(
          w,
          { lin: fireWait, moss: fireWait, sol: fireWait },
          fireRegistry,
        ).world,
      );
    const s = required(w.actors[0]).wellbeing.sources.find(
      (s) => s.source === 'thermal-refuge',
    );
    expect(s?.sustained).toBeGreaterThan(0);
    expect(s?.value).toBeLessThanOrEqual(1);
    const initial = required(required(s).sustained);
    w.tick++;
    w.events = [];
    v7Wellbeing(w);
    expect(
      required(w.actors[0]).wellbeing.sources.find(
        (s) => s.source === 'thermal-refuge',
      )?.sustained,
    ).toBeCloseTo(initial - 0.003);
  });
  it('other participants learn independently and can feed the shared site; builder death leaves the fire operating', () => {
    const { world, site } = fireSetup();
    let w = v7Clone(world);
    required(w.actors[1]).position = { x: 11, y: 11 };
    const owned = required(w.stacks.find((s) => s.id === 'fixture-branch'));
    owned.owner = 'moss';
    const action = fireAction('feed', {
      target: site,
      materials: [{ target: owned.id, quantity: 1 }],
    });
    expect(fireOperation(w, action, 'moss').outcomes[0]?.success).toBe(false);
    w = fireStudy(w, 'moss');
    expect(fireOperation(w, action, 'moss').outcomes[0]?.success).toBe(true);
    required(w.actors[0]).vitals.health = 0.01;
    required(w.actors[0]).vitals.satiety = 0;
    const after = v7Step(
      w,
      { lin: fireWait, moss: fireWait, sol: fireWait },
      fireRegistry,
    ).world;
    expect(
      after.events.some((e) => e.type === 'died' && e.actor === 'lin'),
    ).toBe(true);
    expect(
      fireState(required(after.objects.find((o) => o.id === site))).lit,
    ).toBe(true);
    const dropped = required(after.stacks.find((s) => s.frictionKit));
    expect(dropped.owner).toBeNull();
    expect(dropped.frictionKit?.durability).toBe(9);
  });
});
