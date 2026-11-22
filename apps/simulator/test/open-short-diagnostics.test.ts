import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  v7Clone,
  v7Install,
  v7Step,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import type { V7World, V7Data } from '@self-evolving-world/world-core';
import { initialOpenWorld } from '../src/open-scenario.js';
import {
  diagnosticFixture,
  diagnosticStudy,
  diagnosticStep,
  diagnosis,
} from './fixtures/open-short-diagnostics.js';
import {
  shortFixture,
  shortStep,
  shortAdvance,
  shortAction,
  shortTrialInputs,
} from './fixtures/open-short-refuge.js';
const event = (w: V7World) =>
  w.events.find((e) => e.type === 'short-refuge-trial-diagnosed');
const moss = (w: V7World) => {
  const a = w.actors.find((a) => a.id === 'moss');
  if (!a) throw new Error('Missing test actor.');
  return a;
};
it('explains the real retained Moss failure using original operands, not current wet coupon condition', () => {
  const saved = JSON.parse(
    readFileSync(
      'experiment/ex10/checkpoints/development-000208-156-18.json',
      'utf8',
    ),
  ) as { state: { world: V7World } };
  const w = diagnosticStudy(saved.state.world),
    action = diagnosis(
      'short:work:moss:short-canopy-cover-trial',
      'item:item-188-moss-1133',
    );
  const r = diagnosticStep(w, action),
    control = diagnosticStep(w, { interface: 'wait', args: {} });
  expect(r.outcomes.moss?.success).toBe(true);
  const data = event(r.world)?.data;
  expect(data?.originalOutcome).toBe(false);
  expect(data?.evaluatorRevision).toBe('short-material-refuge@1');
  expect((data?.predicates as V7Data[]).map((p) => [p.id, p.result])).toEqual([
    ['intact', 'pass'],
    ['slip', 'fail'],
    ['sag', 'pass'],
  ]);
  expect((data?.predicates as V7Data[])[1]).toMatchObject({
    value: 0.045,
    threshold: 0.02,
  });
  expect(data?.originalEvent).toBe('event-185-moss-1104');
  expect(r.world.stacks).toEqual(control.world.stacks);
  expect(r.world.objects).toEqual(control.world.objects);
  expect(
    r.world.actors.find((a) => a.id === 'moss')?.vitals.energy,
  ).toBeCloseTo(
    (control.world.actors.find((a) => a.id === 'moss')?.vitals.energy ?? 0) -
      0.2,
    7,
  );
  expect(
    r.world.events.some((e) =>
      ['information-confirmed', 'practice-confirmed'].includes(e.type),
    ),
  ).toBe(false);
});
it('requires this experiment installation and separate personal learning before either execution entry', () => {
  const w = shortFixture();
  expect(shortStep(w, diagnosis()).outcomes.moss?.success).toBe(false);
  const installed = v7Install(
    w,
    continuousRegistry(w),
    'short-refuge-trial-diagnostics@1',
  );
  expect(shortStep(installed, diagnosis()).outcomes.moss?.success).toBe(false);
  const alias = { ...diagnosis(), interface: 'short-material-refuge' };
  expect(shortStep(installed, alias).outcomes.moss?.success).toBe(false);
  const other = initialOpenWorld('another-experiment');
  expect(
    continuousRegistry(other).packages.some(
      (p) => p.id === 'short-refuge-trial-diagnostics',
    ),
  ).toBe(false);
});
it('reads without physical access when personal retained evidence suffices and never renews rewards', () => {
  const w = diagnosticFixture();
  moss(w).position = { x: 20, y: 20 };
  const first = shortAdvance(w, diagnosis()),
    second = shortAdvance(first, {
      ...diagnosis(),
      interface: 'short-material-refuge',
    });
  expect(event(first)?.data.originalOutcome).toBe(false);
  expect(event(second)?.data.originalOutcome).toBe(false);
  expect(
    second.events.some((e) =>
      ['information-confirmed', 'practice-confirmed', 'satisfaction'].includes(
        e.type,
      ),
    ),
  ).toBe(false);
  expect(
    Object.keys(second.state).filter((k) => k.startsWith('short:diagnostic:')),
  ).toHaveLength(1);
});
it('leaves missing or unsupported historical operands unknown instead of substituting current state', () => {
  const w = diagnosticFixture();
  const history = w.state[
    'short:history:short:work:moss:diagnostic-coupon'
  ] as V7Data;
  history.evidence = {
    geometryRevision: 'unavailable-v2',
    passed: false,
    broken: false,
    slip: 0,
    sag: 0,
    area: 100,
  };
  const r = shortAdvance(w, diagnosis()),
    data = event(r)?.data;
  expect(
    (data?.predicates as V7Data[]).every((p) => p.result === 'unknown'),
  ).toBe(true);
  expect(data?.missingEvidence).toHaveLength(3);
});
it('validates ownership, exact operation and unused fields before charging or storing output', () => {
  const w = diagnosticFixture();
  const ground = w.stacks.find((s) => s.processing?.shortCoupon);
  expect(ground).toBeDefined();
  if (!ground) throw new Error('Missing actual coupon.');
  for (const action of [
    diagnosis('short:work:lin:diagnostic-coupon'),
    diagnosis('short:work:moss:diagnostic-coupon', ground.id),
    { ...diagnosis(), args: { ...diagnosis().args, width: 1 } },
  ]) {
    const r = shortStep(w, action);
    expect(r.outcomes.moss?.success).toBe(false);
    expect(event(r.world)).toBeUndefined();
    expect(
      Object.keys(r.world.state).filter((k) =>
        k.startsWith('short:diagnostic:'),
      ),
    ).toHaveLength(0);
  }
});
it('retains one unpaid read across serialization and performs one atomic charge after energy returns', () => {
  const w = diagnosticFixture();
  moss(w).vitals.energy = 0;
  const paused = shortStep(w, diagnosis());
  expect(paused.outcomes.moss).toMatchObject({
    success: true,
    complete: false,
  });
  expect(
    paused.world.actors[0]?.extensionState['execution:operation'],
  ).toMatchObject({ operation: { remaining: 1 } });
  expect(event(paused.world)).toBeUndefined();
  const resumed = v7Clone(JSON.parse(JSON.stringify(paused.world)) as V7World);
  moss(resumed).vitals.energy = 10;
  const completed = shortStep(resumed, diagnosis());
  expect(completed.outcomes.moss).toMatchObject({
    success: true,
    complete: true,
  });
  expect(event(completed.world)?.data.paidEnergy).toBe(0.2);
  const cancelled = shortStep(w, diagnosis(undefined, '', 'cancel'));
  expect(cancelled.outcomes.moss?.complete).toBe(true);
  expect(event(cancelled.world)).toBeUndefined();
  const dead = v7Clone(w);
  moss(dead).vitals.health = 0;
  expect(
    event(v7Step(dead, { moss: diagnosis() }, continuousRegistry(dead)).world),
  ).toBeUndefined();
});
it('retains new trial records independently of overwritten knowledge summaries and survives resume', () => {
  let w = diagnosticStudy(shortFixture());
  for (let i = 0; i < 2; i++)
    w = shortAdvance(
      w,
      shortAction('test-cover', 'diagnostic-coupon', shortTrialInputs('cover')),
    );
  const history = w.state[
    'short:history:short:work:moss:diagnostic-coupon'
  ] as V7Data;
  expect(history.evidence).toBeDefined();
  moss(w).memory.knowledge = {};
  const r = shortAdvance(JSON.parse(JSON.stringify(w)) as V7World, diagnosis());
  expect(event(r)?.data.originalOutcome).toBe(true);
  expect(
    (event(r)?.data.predicates as V7Data[]).every((p) => p.result === 'pass'),
  ).toBe(true);
});
