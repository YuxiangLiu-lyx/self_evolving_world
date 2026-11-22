import { expect, it } from 'vitest';
import {
  v7Clone,
  continuousRegistry,
  v7PublicCatalogue,
} from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import { initialOpenWorld } from '../src/open-scenario.js';
import {
  examinationFixture,
  examinationStudy,
  examinationStep,
} from './fixtures/open-food-examination.js';
const actor = (w: V7World) => {
  const a = w.actors[0];
  if (!a) throw new Error('Missing actor');
  return a;
};
const quantity = (w: V7World) =>
  w.stacks
    .filter((s) => s.resource === 'plum')
    .reduce((n, s) => n + s.quantity, 0);
it('requires personal study and conserves the real fractional sample through two paid stages and serialization', () => {
  const installed = examinationFixture(0.1);
  expect(actor(installed).mastered).not.toContain('examine-food');
  expect(examinationStep(installed).outcomes.lin?.success).toBe(false);
  let w = examinationStudy(installed);
  expect(w.tick - installed.tick).toBe(2);
  expect(actor(w).mastered).toContain('examine-food');
  expect(w.actors[1]?.mastered).not.toContain('examine-food');
  const energy = actor(w).vitals.energy;
  const first = examinationStep(w);
  expect(first.outcomes.lin).toMatchObject({ success: true, complete: false });
  w = JSON.parse(JSON.stringify(first.world)) as V7World;
  expect(quantity(w)).toBeCloseTo(0.1);
  expect(w.stacks.find((s) => s.reservedFor)?.quantity).toBe(0.1);
  const second = examinationStep(w);
  expect(second.outcomes.lin).toMatchObject({ success: true, complete: true });
  expect(actor(second.world).vitals.energy).toBeCloseTo(energy - 1);
  expect(quantity(second.world)).toBeCloseTo(0.1);
  expect(second.world.stacks.some((s) => s.reservedFor)).toBe(false);
  expect(
    second.world.events.some((e) => e.type === 'information-confirmed'),
  ).toBe(true);
  const record = JSON.stringify(actor(second.world).memory.knowledge);
  expect(record).toContain('tissue integrity');
  expect(record).not.toMatch(/toxicity|nutrition|calories/);
  expect(
    second.world.events.find((e) => e.type === 'food-examination-completed')
      ?.data.limitations,
  ).toContain('do not establish safety');
});
it('deduplicates same-condition knowledge across paid repeated examinations without resetting decay or material origin', () => {
  let w = examinationStudy(examinationFixture());
  for (let i = 0; i < 4; i++) w = v7Clone(examinationStep(w).world);
  expect(Object.keys(actor(w).memory.knowledge ?? {})).toHaveLength(1);
  expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(false);
  expect(quantity(w)).toBeCloseTo(0.9);
  expect(w.stacks.filter((s) => s.processing?.foodExamination)).toHaveLength(2);
  expect(
    w.stacks.every(
      (s) => s.origin === 'isolated-real-sample' && (s.decay ?? 0) > 0,
    ),
  ).toBe(true);
});
it('cancels once without energy refunds or material cloning and releases escrow on death', () => {
  const before = examinationStudy(examinationFixture());
  let w = v7Clone(examinationStep(before).world);
  const paid = actor(w).vitals.energy;
  w = v7Clone(examinationStep(w, { interface: 'wait', args: {} }).world);
  expect(quantity(w)).toBeCloseTo(0.9);
  expect(actor(w).vitals.energy).toBe(paid);
  expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
  expect(w.events.filter((e) => e.type === 'process-stopped')).toHaveLength(1);
  w = v7Clone(examinationStep(w, { interface: 'wait', args: {} }).world);
  expect(w.events.filter((e) => e.type === 'process-stopped')).toHaveLength(0);
  const dying = v7Clone(examinationStep(before).world);
  actor(dying).vitals.health = 0.01;
  actor(dying).vitals.satiety = 0;
  const dead = examinationStep(dying, { interface: 'wait', args: {} }).world;
  expect(actor(dead).life?.deaths).toBe(1);
  expect(dead.events.some((e) => e.type === 'died')).toBe(true);
  expect(dead.stacks.every((s) => s.owner === null && !s.reservedFor)).toBe(
    true,
  );
  expect(quantity(dead)).toBeCloseTo(0.9);
});
it('requires a unique real hard tool and pauses without duplicate charges when it becomes unavailable', () => {
  let w = examinationStudy(examinationFixture(0.9, 'hazelnut'));
  expect(examinationStep(w).outcomes.lin?.success).toBe(false);
  w.stacks.push({
    id: 'stone-tool',
    resource: 'stone',
    quantity: 1,
    owner: 'lin',
    position: { ...actor(w).position },
    origin: 'isolated-tool',
  });
  const first = examinationStep(w);
  expect(first.outcomes.lin?.success).toBe(true);
  w = v7Clone(first.world);
  const stone = w.stacks.find((s) => s.id === 'stone-tool');
  if (!stone) throw new Error('Missing tool');
  stone.owner = 'moss';
  const paid = actor(w).vitals.energy;
  w = v7Clone(examinationStep(w).world);
  expect(actor(w).vitals.energy).toBe(paid);
  expect(w.events.find((e) => e.type === 'process-progress')?.data.paused).toBe(
    true,
  );
  const returned = w.stacks.find((s) => s.id === 'stone-tool');
  if (returned) returned.owner = 'lin';
  const finished = examinationStep(w);
  expect(finished.outcomes.lin?.complete).toBe(true);
  expect(actor(finished.world).vitals.energy).toBeCloseTo(paid - 0.5);
});
it('keeps this run-specific ability out of a new experiment while restoring the original registry and learning state', () => {
  const a = examinationStudy(examinationFixture());
  const b = initialOpenWorld('open-ex11');
  expect(
    continuousRegistry(b).packages.some((p) => p.id === 'food-examination'),
  ).toBe(false);
  expect(JSON.stringify(v7PublicCatalogue(b))).not.toContain('examine-food');
  expect(examinationStep(b).outcomes.lin?.success).toBe(false);
  expect(
    examinationStep(JSON.parse(JSON.stringify(a)) as V7World).outcomes.lin
      ?.success,
  ).toBe(true);
});
