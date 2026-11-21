import { describe, it, expect } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
  v7Cursor,
  v7TaskAction,
  v7FinishTasks,
  v7Load,
  shelterTemperature,
  forestClimate,
  shelterSpatial,
} from '@self-evolving-world/world-core';
import type {
  V7World,
  V7Action,
  V7Plan,
} from '@self-evolving-world/world-core';
import { initialForestExperienceWorld } from '../src/forest-experience-scenario.js';
const registry = continuousRegistry();
const wait: V7Action = { interface: 'wait', args: {} };
const action = (mode: string, target?: string): V7Action => ({
  interface: 'portable-insulation',
  args: { mode, ...(target ? { target } : {}) },
});
function fixture() {
  const w = v7Clone(initialForestExperienceWorld());
  w.objects = [];
  w.processes = [];
  w.terrain = w.terrain.map((r) => '.'.repeat(r.length));
  w.tick = 600;
  w.time = 600;
  w.actors.forEach((a, i) => {
    a.position = { x: 10 + i * 0.7, y: 10 };
    a.vitals.satiety = 90;
    a.vitals.temperature = 10;
    a.memory.objects = [];
    a.memory.stacks = [];
  });
  w.stacks = ['bark', 'vine'].map((resource, i) => ({
    id: resource + '-fixture',
    resource,
    quantity: i ? 3 : 6,
    owner: 'lin',
    position: { x: 10, y: 10 },
    origin: 'isolated-real-material',
  }));
  const installed = v7Clone(v7Install(w, registry, 'portable-insulation@1'));
  expect(installed.stacks).toEqual(w.stacks);
  expect(installed.actors[0]?.mastered).not.toContain('portable-insulation');
  return installed;
}
function step(w: V7World, a: V7Action, id = 'lin') {
  const r = v7Step(w, { lin: wait, moss: wait, sol: wait, [id]: a }, registry);
  expect(r.paused).toBeNull();
  return r;
}
function study(w: V7World, id = 'lin') {
  for (let n = 0; n < 4; n++)
    w = v7Clone(
      step(
        w,
        n
          ? wait
          : { interface: 'learn', args: { ability: 'portable-insulation' } },
        id,
      ).world,
    );
  expect(w.actors.find((a) => a.id === id)?.mastered).toContain(
    'portable-insulation',
  );
  return w;
}
function craft(w: V7World) {
  const p: V7Plan = {
    intention: 'Isolated paid craft',
    steps: [{ action: action('craft'), repeat: 1, until: null, guard: null }],
    repeat: 1,
    until: null,
    interrupts: [],
    notes: [],
    preferences: [],
  };
  let cursors = { lin: v7Cursor(p, w.tick) };
  for (let n = 1; n <= 5; n++) {
    const selected = v7TaskAction(w, 'lin', cursors.lin) ?? wait;
    const r = v7Step(
      w,
      { lin: selected, moss: wait, sol: wait },
      registry,
      cursors,
    );
    expect(r.outcomes.lin?.success).toBe(true);
    v7FinishTasks(w, r, cursors);
    const restored = JSON.parse(JSON.stringify({ w: r.world, cursors })) as {
      w: V7World;
      cursors: typeof cursors;
    };
    w = restored.w;
    cursors = restored.cursors;
    expect(w.stacks.filter((s) => s.mantle)).toHaveLength(n === 5 ? 1 : 0);
    if (n < 5) expect(cursors.lin.operation?.remaining).toBe(5 - n);
  }
  return w;
}
function item(w: V7World) {
  const s = w.stacks.find((s) => s.mantle);
  if (!s?.mantle) throw new Error('Missing real mantle');
  return s;
}

describe('actual requested portable-insulation contract, isolated from formal actors', () => {
  it('combines real enclosure and mantle protection multiplicatively and exposes less protection when wet', () => {
    let w = craft(study(fixture()));
    w = v7Clone(step(w, action('equip', item(w).id)).world);
    const enclosed = v7Clone(w);
    enclosed.actors.slice(1).forEach((a, i) => {
      a.position = { x: 14 + i * 2, y: 10 };
    });
    enclosed.objects.push({
      id: 'isolated-shelter',
      name: 'Isolated real enclosure',
      kind: 'insulating-shelter',
      spatial: shelterSpatial(10, 10, 0),
      visual: {
        component: 'enclosure',
        color: '#887755',
        accent: '#aa9977',
        label: 'Isolated shelter',
        state: 'protected',
      },
      data: { remainingService: 100 },
      createdBy: 'lin',
      createdAt: w.tick,
      revision: 'shelter-construction@1',
    });
    const protectedWorld = step(enclosed, wait).world;
    const inside = protectedWorld.events.find(
      (e) => e.type === 'insulation-exposure-measured' && e.actor === 'lin',
    );
    const shelter = protectedWorld.events.find(
      (e) => e.type === 'shelter-exposure-measured' && e.actor === 'lin',
    );
    const factor = 0.25 - 0.15 * Number(inside?.data.moisture);
    expect(Number(inside?.data.avoidedCooling)).toBeCloseTo(
      Number(shelter?.data.unshelteredColdLoss) * 0.5 * factor,
      7,
    );
    const wet = v7Clone(w),
      m = item(wet).mantle;
    if (!m) throw new Error('Missing mantle');
    m.moisture = 1;
    const dry = v7Clone(w),
      d = item(dry).mantle;
    if (!d) throw new Error('Missing mantle');
    d.moisture = 0;
    const wetEffect = step(wet, wait).world.events.find(
      (e) => e.type === 'insulation-exposure-measured' && e.actor === 'lin',
    );
    const dryEffect = step(dry, wait).world.events.find(
      (e) => e.type === 'insulation-exposure-measured' && e.actor === 'lin',
    );
    expect(Number(wetEffect?.data.avoidedCooling)).toBeLessThan(
      Number(dryEffect?.data.avoidedCooling),
    );
  });
  it('awards only measured three-round cold relief through the existing shared capped source', () => {
    let w = craft(study(fixture()));
    const a = w.actors[0];
    if (!a) throw new Error('Missing actor');
    a.vitals.temperature = 15;
    const id = item(w).id;
    let awards = 0;
    for (let n = 0; n < 8; n++) {
      w = v7Clone(step(w, n ? wait : action('equip', id)).world);
      awards += w.events.filter(
        (e) =>
          e.actor === 'lin' &&
          e.type === 'satisfaction' &&
          e.data.source === 'thermal-refuge',
      ).length;
    }
    expect(awards).toBe(1);
    expect(
      w.satisfaction.filter((s) => s.id === 'thermal-refuge'),
    ).toHaveLength(1);
  });
  it('requires actual study and materials, charges five work rounds once, and preserves serialized progress and total mass', () => {
    let w = fixture();
    expect(step(w, action('craft')).outcomes.lin?.success).toBe(false);
    w = study(w);
    const a = w.actors[0];
    if (!a) throw new Error('Missing actor');
    const mass = v7Load(w, a),
      energy = a.vitals.energy;
    w = craft(w);
    expect(item(w).mantle?.equipped).toBe(false);
    expect(energy - (w.actors[0]?.vitals.energy ?? 0)).toBeCloseTo(7.5);
    const after = w.actors[0];
    if (!after) throw new Error('Missing actor');
    expect(v7Load(w, after)).toBeCloseTo(mass);
    expect(w.events.some((e) => e.type === 'satisfaction')).toBe(false);
    expect(step(w, action('craft')).outcomes.lin?.success).toBe(false);
  });
  it('releases interrupted and death escrow once, without manufacturing products or returning spent effort', () => {
    for (const death of [false, true]) {
      let w = study(fixture());
      w = v7Clone(step(w, action('craft')).world);
      const a = w.actors[0];
      if (!a) throw new Error('Missing actor');
      const energy = a.vitals.energy;
      if (death) {
        a.vitals.health = 1;
        a.vitals.satiety = 0;
      }
      w = v7Clone(step(w, wait).world);
      expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
      expect(w.stacks.reduce((sum, s) => sum + s.quantity, 0)).toBe(9);
      expect(w.stacks.some((s) => s.mantle)).toBe(false);
      if (!death) expect(w.actors[0]?.vitals.energy).toBe(energy);
      else expect(w.stacks.every((s) => s.owner === null)).toBe(true);
      w = v7Clone(step(w, wait).world);
      expect(w.stacks.reduce((sum, s) => sum + s.quantity, 0)).toBe(9);
    }
  });
  it('preserves exact item identity through equip, giving, pickup and death; another actor studies before equipping', () => {
    let w = craft(study(fixture()));
    const id = item(w).id;
    w = v7Clone(step(w, action('equip', 'resource:bark-mantle')).world);
    expect(item(w).mantle?.equipped).toBe(true);
    const fractional = step(w, {
      interface: 'drop',
      args: { target: id, quantity: 0.1 },
    });
    expect(fractional.outcomes.lin?.success).toBe(false);
    w = v7Clone(
      step(w, {
        interface: 'give',
        args: { target: id, quantity: 1, recipient: 'moss' },
      }).world,
    );
    expect(item(w).id).toBe(id);
    expect(item(w).owner).toBe('moss');
    expect(item(w).mantle?.equipped).toBe(false);
    expect(step(w, action('equip', id), 'moss').outcomes.moss?.success).toBe(
      false,
    );
    w = study(w, 'moss');
    w = v7Clone(step(w, action('equip', 'item:' + id), 'moss').world);
    const moss = w.actors[1];
    if (!moss) throw new Error('Missing actor');
    moss.vitals.health = 1;
    moss.vitals.satiety = 0;
    w = v7Clone(step(w, wait, 'moss').world);
    expect(item(w).id).toBe(id);
    expect(item(w).owner).toBeNull();
    expect(item(w).mantle?.equipped).toBe(false);
    w = v7Clone(
      step(w, { interface: 'pickup', args: { target: id, quantity: 1 } }).world,
    );
    expect(item(w).id).toBe(id);
    expect(item(w).owner).toBe('lin');
  });
  it('repairs with paid input and equal-mass scrap without changing item identity or duplicating mass', () => {
    let w = craft(study(fixture()));
    const m = item(w),
      id = m.id;
    if (!m.mantle || !w.actors[0]) throw new Error('Missing item');
    m.mantle.condition = 12;
    const mass = v7Load(w, w.actors[0]);
    const p: V7Plan = {
      intention: 'Isolated paid repair',
      steps: [
        { action: action('repair', id), repeat: 1, until: null, guard: null },
      ],
      repeat: 1,
      until: null,
      interrupts: [],
      notes: [],
      preferences: [],
    };
    const cursors = { lin: v7Cursor(p, w.tick) };
    for (let i = 0; i < 2; i++) {
      const result = v7Step(
        w,
        {
          lin: v7TaskAction(w, 'lin', cursors.lin) ?? wait,
          moss: wait,
          sol: wait,
        },
        registry,
        cursors,
      );
      expect(result.outcomes.lin?.success).toBe(true);
      v7FinishTasks(w, result, cursors);
      w = v7Clone(result.world);
    }
    expect(item(w).id).toBe(id);
    expect(item(w).mantle?.condition).toBe(160);
    expect(w.stacks.filter((s) => s.resource === 'mantle-scrap')).toHaveLength(
      1,
    );
    const after = w.actors[0];
    if (!after) throw new Error('Missing actor');
    expect(v7Load(w, after)).toBeCloseTo(mass);
  });
  it('measures modest cooling protection, combines it multiplicatively, wears out once, and never awards warm-weather ownership', () => {
    let w = craft(study(fixture()));
    const id = item(w).id;
    w = v7Clone(step(w, action('equip', id)).world);
    const e = w.events.find((e) => e.type === 'insulation-exposure-measured');
    expect(Number(e?.data.avoidedCooling)).toBeGreaterThan(0);
    expect(Number(e?.data.netChange)).toBeLessThan(0);
    const a = w.actors[0];
    if (!a || !item(w).mantle) throw new Error('Missing actor');
    const climate = forestClimate(w, a.position);
    const bare = shelterTemperature(
      a.vitals.temperature,
      climate.temperature,
      0,
      false,
    );
    const sheltered = shelterTemperature(
      a.vitals.temperature,
      climate.temperature,
      0,
      true,
    );
    expect(sheltered.shelteredColdLoss).toBeCloseTo(
      bare.unshelteredColdLoss * 0.5,
    );
    const mantle = item(w).mantle;
    if (!mantle) throw new Error('Missing mantle');
    mantle.condition = 1;
    w = v7Clone(step(w, wait).world);
    expect(
      w.events.filter((e) => e.type === 'insulation-worn-out'),
    ).toHaveLength(1);
    w = v7Clone(step(w, wait).world);
    expect(
      w.events.filter((e) => e.type === 'insulation-worn-out'),
    ).toHaveLength(0);
    expect(
      w.events.find((e) => e.type === 'insulation-exposure-measured')?.data
        .avoidedCooling,
    ).toBe(0);
    const warm = craft(study(fixture()));
    warm.tick = 200;
    warm.time = 200;
    warm.actors.forEach((a) => {
      a.vitals.temperature = 22;
    });
    const result = step(warm, action('equip', item(warm).id));
    expect(
      result.world.events.find((e) => e.type === 'insulation-exposure-measured')
        ?.data.avoidedCooling,
    ).toBe(0);
    expect(result.world.events.some((e) => e.type === 'satisfaction')).toBe(
      false,
    );
  });
});
