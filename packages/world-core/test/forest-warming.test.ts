import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Step,
  warmingAfterPhysiology,
  FOREST_WARMING,
} from '../src/index.js';
import type { V7Action, V7World } from '../src/index.js';
import { forestFixture } from './fixtures/forest-extension.js';
const registry = continuousRegistry();
const wait: V7Action = { interface: 'wait', args: {} };
const warm: V7Action = { interface: 'active-warming', args: { rounds: 6 } };
function actor(w: V7World) {
  const a = w.actors[0];
  if (!a) throw new Error('Missing actor');
  return a;
}
function fixture() {
  let w = forestFixture();
  for (const pkg of [
    'food-assessment@1',
    'shelter-construction@1',
    'active-warming@1',
  ])
    w = v7Clone(v7Install(w, registry, pkg));
  w.tick = 560;
  w.time = 560;
  actor(w).vitals.temperature = 12;
  return w;
}
function step(w: V7World, action = wait) {
  const result = v7Step(w, { a: action, b: wait }, registry);
  expect(result.paused).toBeNull();
  return v7Clone(result.world);
}
function learned() {
  let w = step(fixture(), {
    interface: 'learn',
    args: { ability: 'active-warming' },
  });
  expect(actor(w).mastered).not.toContain('active-warming');
  w = step(w);
  expect(actor(w).mastered).toContain('active-warming');
  return w;
}
describe('actual stationary warming request in isolated regression', () => {
  it('requires personal study, preserves physical state on installation and measures exact expenditure against normal physiology', () => {
    let w = learned();
    const before = v7Clone(w),
      baseline = step(w),
      a = actor(w);
    w = step(w, warm);
    expect(actor(w).position).toEqual(a.position);
    expect(actor(w).vitals.energy).toBe(a.vitals.energy - 3);
    expect(actor(w).vitals.satiety).toBe(actor(baseline).vitals.satiety);
    expect(actor(w).vitals.temperature).toBeCloseTo(
      actor(baseline).vitals.temperature + 0.35,
      7,
    );
    expect(actor(w).wellbeing.mental).toBe(0);
    const settled = v7Clone(w);
    warmingAfterPhysiology(w);
    expect(w).toEqual(settled);
    expect(before.actors[1]?.mastered).not.toContain('active-warming');
    const other = v7Step(before, { a: wait, b: warm }, registry);
    expect(other.outcomes.b?.success).toBe(false);
  });
  it('reuses the existing source and cross-route cooldown, never stacks at round six or grants study rewards', () => {
    let w = learned();
    for (let i = 0; i < 3; i++) w = step(w, warm);
    expect(w.events.some((e) => e.type === 'warming-comfort-qualified')).toBe(
      true,
    );
    expect(actor(w).wellbeing.mental).toBe(1);
    expect(actor(w).wellbeing.sources.map((s) => s.source)).toEqual([
      'thermal-refuge',
    ]);
    const rewarded =
      actor(w).extensionState['satisfaction-history:thermal-refuge'];
    for (let i = 0; i < 3; i++) w = step(w, warm);
    expect(actor(w).wellbeing.mental).toBe(1);
    expect(actor(w).extensionState['satisfaction-history:thermal-refuge']).toBe(
      rewarded,
    );
    expect(actor(w).extensionState['warming:pending']).toBeUndefined();
    expect(w.events.some((e) => e.type === 'warming-completed')).toBe(true);
    w = learned();
    // Existing shelter-route history must block the same source through exercise.
    actor(w).extensionState['satisfaction-history:thermal-refuge'] = w.tick;
    for (let i = 0; i < 3; i++) w = step(w, warm);
    expect(w.events.some((e) => e.type === 'warming-comfort-qualified')).toBe(
      true,
    );
    expect(actor(w).wellbeing.mental).toBe(0);
  });
  it('cancels on incompatible action or lost prerequisites without refunds or passive heat', () => {
    let w = step(learned(), warm);
    const expected = v7Clone(w);
    delete actor(expected).extensionState['warming:pending'];
    const baseline = step(expected);
    w = step(w);
    expect(actor(w).vitals).toEqual(actor(baseline).vitals);
    expect(w.events.some((e) => e.type === 'warming-cancelled')).toBe(true);
    expect(actor(w).extensionState['warming:pending']).toBeUndefined();
    w = step(learned(), warm);
    actor(w).vitals.energy = 2;
    w = step(w, warm);
    expect(w.events.some((e) => e.type === 'failed')).toBe(true);
    expect(actor(w).vitals.energy).toBe(2);
    expect(actor(w).extensionState['warming:pending']).toBeUndefined();
    w = learned();
    actor(w).vitals.satiety = 19;
    w = step(w, warm);
    expect(w.events.some((e) => e.type === 'failed')).toBe(true);
  });
  it('never overfills comfort, heats an already warm actor, suppresses damage or carries an operation across death', () => {
    let w = learned();
    actor(w).vitals.temperature = 16;
    w = step(w, warm);
    expect(w.events.some((e) => e.type === 'failed')).toBe(true);
    w = learned();
    w.time = 200;
    actor(w).vitals.temperature = 15.99;
    w = step(w, warm);
    const m = actor(w).extensionState['warming:lastRound'];
    expect(
      m && typeof m === 'object' && !Array.isArray(m) ? m.exertionHeat : null,
    ).toBe(0);
    expect(actor(w).vitals.temperature).toBeGreaterThan(16);
    w = step(learned(), warm);
    actor(w).vitals.health = 0.01;
    actor(w).vitals.temperature = 0;
    w = step(w, warm);
    expect(actor(w).life?.deaths).toBe(1);
    expect(actor(w).extensionState['warming:pending']).toBeUndefined();
    expect(w.events.some((e) => e.type === 'warming-round-completed')).toBe(
      false,
    );
    expect(actor(w).mastered).toContain('active-warming');
    expect(actor(w).wellbeing.mental).toBe(0);
  });
  it('validates alternative event and interface subscriptions during installation', () => {
    const base = fixture();
    expect(
      base.satisfaction.filter((s) => s.id === 'thermal-refuge'),
    ).toHaveLength(1);
    const malformed = v7Clone(base);
    malformed.revisions = malformed.revisions.filter(
      (r) => r !== 'active-warming@1',
    );
    malformed.abilities = malformed.abilities.filter(
      (a) => a.id !== 'active-warming',
    );
    const source = malformed.satisfaction[0];
    if (!source) throw new Error('Missing source');
    source.alternativeTriggers = [
      { event: 'invalid_event_alias', interface: 'active-warming' },
    ];
    expect(() =>
      v7Install(malformed, registry, `${FOREST_WARMING.id}@1`),
    ).toThrow('declared executable event');
  });
});
