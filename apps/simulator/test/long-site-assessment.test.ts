import { expect, it } from 'vitest';
import {
  v7Clone,
  v7Install,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7World, V7Action } from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
const id = 'soil-worksite-assessment';
const wait: V7Action = { interface: 'wait', args: {} };
const step = (w: V7World, a: V7Action) =>
  v7Step(w, { lin: a, moss: wait, sol: wait }, continuousRegistry(w));
function fixture() {
  let w = v7Clone(initialLongWorld('long-ex13'));
  w = v7Clone(v7Install(w, continuousRegistry(w), 'root-planting-trial@1'));
  w = v7Clone(v7Install(w, continuousRegistry(w), id + '@1'));
  const a = w.actors[0];
  if (!a) throw new Error('Missing actor.');
  a.position = { x: 8.61283558, y: 12.79372563 };
  return w;
}
const examine: V7Action = {
  interface: id,
  args: { mode: 'examine', x: 9.25, y: 12.9 },
};
it('reproduces the actual ex13 forest-floor restriction without planting or changing the prior predicate, and distinguishes a bare patch', () => {
  let w = fixture();
  expect(step(w, examine).outcomes.lin?.success).toBe(false);
  w = v7Clone(step(w, { interface: 'learn', args: { ability: id } }).world);
  const before = v7Clone(w);
  const result = step(w, examine);
  expect(result.outcomes.lin?.success).toBe(true);
  w = v7Clone(result.world);
  const e = w.events.find((e) => e.type === 'site-examination-completed');
  expect(e?.data).toMatchObject({
    x: 9.25,
    y: 12.9,
    surface: 'vegetated forest floor',
    compatibility: 'not currently eligible',
    qualified: false,
  });
  expect(e?.data.ruleInterpretation).toContain('moisture/hazard label');
  expect(w.actors[0]?.vitals.energy).toBeCloseTo(
    (before.actors[0]?.vitals.energy ?? 0) - 0.5,
  );
  expect(w.objects.filter((o) => o.kind === 'root-trial')).toHaveLength(0);
  expect(w.stacks).toEqual(before.stacks);
  expect(w.terrain).toEqual(before.terrain);
  expect(
    w.events.some((e) =>
      ['information-confirmed', 'practice-confirmed', 'satisfaction'].includes(
        e.type,
      ),
    ),
  ).toBe(false);
  const a = w.actors[0];
  if (!a) throw new Error('Missing actor.');
  a.position = { x: 19.62397697, y: 13.55372841 };
  const plain = step(w, {
    interface: id,
    args: { mode: 'examine', x: 19.1, y: 13.5 },
  });
  expect(plain.outcomes.lin?.success).toBe(true);
  expect(
    plain.world.events.find((e) => e.type === 'site-examination-completed')
      ?.data.compatibility,
  ).toBe('surface and geometry currently eligible');
});
it('keeps findings private, charges repeated real examinations and rejects unsafe access without starting', () => {
  let w = fixture();
  w = v7Clone(step(w, { interface: 'learn', args: { ability: id } }).world);
  const first = step(w, examine);
  const repeated = step(first.world, examine);
  expect(repeated.outcomes.lin?.success).toBe(true);
  expect(repeated.world.actors[0]?.vitals.energy).toBeCloseTo(
    (first.world.actors[0]?.vitals.energy ?? 0) - 0.5,
  );
  expect(
    Object.keys(
      repeated.world.actors.find((a) => a.id === 'moss')?.memory.knowledge ??
        {},
    ),
  ).not.toContain('planting-site:9.25:12.9');
  const invalid = step(repeated.world, {
    interface: id,
    args: { mode: 'examine', x: 47, y: 35 },
  });
  expect(invalid.outcomes.lin?.success).toBe(false);
  expect(
    invalid.world.events.some((e) => e.type === 'site-examination-started'),
  ).toBe(false);
  expect(invalid.world.actors[0]?.vitals.energy).toBe(
    repeated.world.actors[0]?.vitals.energy,
  );
  expect(
    continuousRegistry(initialLongWorld('different-scope')).packages.some(
      (p) => p.id === id,
    ),
  ).toBe(false);
});
