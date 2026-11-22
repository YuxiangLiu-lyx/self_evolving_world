import { expect, it } from 'vitest';
import { v7Clone, v7Load } from '@self-evolving-world/world-core';
import type { V7World, V7Data } from '@self-evolving-world/world-core';
import {
  contactAction,
  contactStep,
  contactFixture,
  contactFrames,
} from './fixtures/open-contact.js';
const actor = (w: V7World) => {
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture actor');
  return a;
};
const last = (f: V7World[]) => {
  const w = f.at(-1);
  if (!w) throw new Error('Missing fixture frame');
  return w;
};
const job = (w: V7World) =>
  w.state['contact:project:lin:contact-study'] as V7Data;
it('executes four paid contacts and inspection then an explicit assessment without inventing absolute anchors', () => {
  const before = contactFixture(),
    frames = contactFrames(),
    w = last(frames),
    j = job(w),
    result = j.result as V7Data;
  expect(actor(w).vitals.energy).toBeCloseTo(actor(before).vitals.energy - 2.6);
  expect(v7Load(w, actor(w))).toBeCloseTo(v7Load(before, actor(before)), 7);
  expect(j.stage).toBe(6);
  expect(j.observations).toHaveLength(5);
  expect(
    new Set((j.observations as V7Data[]).slice(0, 4).map((r) => r.forceLevel))
      .size,
  ).toBe(2);
  expect(result.absoluteBounds).toBeNull();
  expect(result.absoluteCertificateValid).toBe(false);
  expect(
    (frames[5]?.state['contact:project:lin:contact-study'] as V7Data).status,
  ).toBe('awaiting-assessment');
  expect(
    frames[5]?.events.some((e) => e.type === 'contact-calibration-completed'),
  ).toBe(false);
});
it('rejects free geometry preparation, uninspected surfaces and insufficient material before any contact charges', () => {
  let w = contactFixture(),
    energy = actor(w).vitals.energy;
  expect(
    contactStep(w, contactAction('sweep', 'stone', 'flint')).outcomes.lin
      ?.success,
  ).toBe(false);
  w = v7Clone(
    contactStep(w, contactAction('inspect', 'stone', 'second-stone')).world,
  );
  energy -= 0.2;
  const r = contactStep(w, contactAction('sweep', 'stone', 'second-stone'));
  expect(actor(r.world).vitals.energy).toBeCloseTo(energy);
  expect(
    r.world.events.some((e) => e.type === 'contact-calibration-invalidated'),
  ).toBe(true);
  expect(r.world.stacks.some((s) => s.reservedFor)).toBe(false);
  expect(r.world.events.some((e) => e.type === 'information-confirmed')).toBe(
    false,
  );
});
it('resumes the same altered material and only remaining stages after cancellation and serialization', () => {
  let w = contactFixture();
  w = v7Clone(contactStep(w, contactAction('inspect', 'stone', 'flint')).world);
  w = v7Clone(contactStep(w, contactAction('sweep', 'stone', 'flint')).world);
  const ids = job(w).specimens;
  w = v7Clone(contactStep(w, contactAction('cancel')).world);
  expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
  expect(job(w).stage).toBe(1);
  w = JSON.parse(JSON.stringify(w)) as V7World;
  for (let i = 0; i < 4; i++) {
    const r = contactStep(w, contactAction('resume'));
    expect(r.outcomes.lin?.success, r.outcomes.lin?.reason).toBe(true);
    w = v7Clone(r.world);
  }
  expect(job(w).stage).toBe(5);
  expect(job(w).specimens).toEqual(ids);
  w = v7Clone(contactStep(w, contactAction('resume')).world);
  expect(job(w).stage).toBe(6);
  expect(job(w).paid).toBeCloseTo(2.6);
});
it('pauses missing energy and does not duplicate escrow on death or unreachable resumption', () => {
  let w = contactFixture();
  w = v7Clone(contactStep(w, contactAction('inspect', 'stone', 'flint')).world);
  w = v7Clone(contactStep(w, contactAction('sweep', 'stone', 'flint')).world);
  actor(w).vitals.energy = 0;
  w = v7Clone(contactStep(w, contactAction('sweep', 'stone', 'flint')).world);
  expect(job(w).stage).toBe(1);
  actor(w).vitals.health = 0.1;
  actor(w).vitals.satiety = 0;
  w = v7Clone(contactStep(w, contactAction('sweep', 'stone', 'flint')).world);
  expect(w.events.some((e) => e.type === 'died')).toBe(true);
  expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
  expect(w.stacks.filter((s) => s.processing?.scratchSpecimen)).toHaveLength(2);
  actor(w).position = { x: 30, y: 20 };
  expect(contactStep(w, contactAction('resume')).outcomes.lin?.success).toBe(
    false,
  );
});
it('invalidates surface-bound applicability on damage or transfer without retroactive certification', () => {
  let w = last(contactFrames());
  const ids = job(w).specimens as string[],
    s = w.stacks.find((s) => s.id === ids[0]);
  if (!s) throw new Error('Missing tested material');
  s.owner = null;
  w = v7Clone(contactStep(w, { interface: 'wait', args: {} }).world);
  expect(job(w).applicable).toBe(false);
  expect(
    w.events.some((e) => e.type === 'contact-calibration-invalidated'),
  ).toBe(true);
  expect((job(w).result as V7Data).absoluteBounds).toBeNull();
});
it('deduplicates known response limits across renamed projects and never rewards repeated assessment', () => {
  let w = last(contactFrames());
  w = v7Clone(contactStep(w, contactAction('assess')).world);
  expect(
    w.events.some((e) =>
      ['information-confirmed', 'practice-confirmed', 'satisfaction'].includes(
        e.type,
      ),
    ),
  ).toBe(false);
  for (const action of [
    contactAction('inspect', 'stone', 'flint', 'renamed'),
    ...Array.from({ length: 5 }, () =>
      contactAction('sweep', 'stone', 'flint', 'renamed'),
    ),
    contactAction('assess', '', '', 'renamed'),
  ])
    w = v7Clone(contactStep(w, action).world);
  expect(
    w.events.some((e) =>
      ['information-confirmed', 'practice-confirmed', 'satisfaction'].includes(
        e.type,
      ),
    ),
  ).toBe(false);
});
