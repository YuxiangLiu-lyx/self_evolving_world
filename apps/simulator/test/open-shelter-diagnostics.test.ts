import { it, expect } from 'vitest';
import {
  v7Clone,
  v7Install,
  continuousRegistry,
  v7Load,
} from '@self-evolving-world/world-core';
import type { V7Data } from '@self-evolving-world/world-core';
import {
  diagnosticFixture,
  diagnosticStep,
  diagnosticAction,
  diagnosticFrames,
} from './fixtures/open-shelter-diagnostics.js';
import {
  refugeTested,
  refugeStep,
  refugeAction,
  refugeAllocation,
} from './fixtures/open-shelter.js';
it('reproduces the round-113 prefix failure and resolves both accepted forms only after the retained repair boundary', () => {
  const old = diagnosticFixture(false);
  expect(diagnosticStep(old).outcomes.moss?.success).toBe(false);
  const before = old.actors[0]?.vitals.energy;
  for (const id of ['item-112-moss-648', 'item:item-112-moss-648']) {
    const w = diagnosticFixture();
    const a = w.actors[0],
      s = w.stacks[0];
    if (!a || !s) throw new Error('Missing fixture');
    s.position = { x: 40, y: 30 };
    const r = diagnosticStep(w, diagnosticAction(id));
    expect(r.outcomes.moss?.success, r.outcomes.moss?.reason).toBe(true);
    expect(r.world.actors[0]?.vitals.energy).toBeCloseTo(Number(before) - 0.2);
    const e = r.world.events.find((e) => e.type === 'shelter-inspected');
    expect(e?.data.resolvedId).toBe('item-112-moss-648');
    expect(e?.data.suppliedReference).toBe(id);
    expect(r.world.actors[0]?.mastered).toContain('resting-shelter');
    expect(r.world.actors[0]?.mastered).not.toContain(
      'shelter-reference-contract',
    );
    expect(r.world.stacks[0]?.quantity).toBe(1);
  }
});
it('keeps unknown geometry unknown and separates malformed, inaccessible, wrong ownership and unsuitable material without effort', () => {
  let w = diagnosticFixture();
  const unknown = diagnosticStep(w);
  expect(
    unknown.world.state['woven:law:branch:forest-branch-0'],
  ).toBeUndefined();
  expect(
    unknown.world.events.find((e) => e.type === 'shelter-inspected')?.data
      .observed,
  ).toMatchObject({ length: null, diameter: null, loadCapacity: null });
  expect(
    unknown.world.events.some((e) => e.type === 'information-confirmed'),
  ).toBe(false);
  for (const [reference, code] of [
    ['item:item:missing', 'malformed-reference'],
    ['item:absent', 'absent-or-inaccessible-identity'],
  ]) {
    const r = diagnosticStep(w, diagnosticAction(reference));
    expect(r.outcomes.moss?.success).toBe(false);
    expect(
      r.world.events.find((e) => e.type === 'shelter-reference-diagnostic')
        ?.data.reasonCode,
    ).toBe(code);
    expect(r.world.actors[0]?.vitals.energy).toBe(w.actors[0]?.vitals.energy);
  }
  const s = w.stacks[0];
  if (!s) throw new Error('Missing fixture item');
  s.owner = null;
  let r = diagnosticStep(w);
  expect(
    r.world.events.find((e) => e.type === 'shelter-reference-diagnostic')?.data
      .reasonCode,
  ).toBe('wrong-ownership');
  w = v7Clone(w);
  const item = w.stacks[0];
  if (!item) throw new Error('Missing fixture item');
  item.owner = 'moss';
  item.resource = 'stone';
  r = diagnosticStep(w);
  expect(
    r.world.events.find((e) => e.type === 'shelter-reference-diagnostic')?.data
      .reasonCode,
  ).toBe('unsuitable-material');
});
it('inspects real partial specimens without capacity certification and deduplicates observations without practice awards', () => {
  const frames = diagnosticFrames();
  let w = frames.at(-1);
  if (!w) throw new Error('Missing frame');
  expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(false);
  expect(w.events.some((e) => e.type === 'practice-confirmed')).toBe(false);
  const specimen = w.stacks.find((s) => s.processing?.refugeTest);
  if (!specimen) throw new Error('Missing retained specimen');
  w = v7Clone(diagnosticStep(w, diagnosticAction(`item:${specimen.id}`)).world);
  const obs = w.events.find((e) => e.type === 'shelter-inspected')?.data
    .observed as V7Data;
  expect(obs.quantity).toBe(0.1);
  expect(obs.loadCapacity).toBeNull();
  expect((obs.condition as V7Data).intact).toBe(false);
  expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(false);
  expect(w.events.some((e) => e.type === 'practice-confirmed')).toBe(false);
});
it('does not require or archive a project slot and rejects missing inspection energy before charging', () => {
  const w = diagnosticFixture(),
    a = w.actors[0];
  if (!a) throw new Error('Missing actor');
  a.memory.projects = Object.fromEntries(
    Array.from({ length: 4 }, (_, i) => [
      `project-${String(i)}`,
      {
        id: `project-${String(i)}`,
        status: 'paused' as const,
        question: 'Unknown',
        evidence: [],
        uncertainty: 'Unknown',
        goal: 'Observe',
        completedSteps: [],
        outputs: [],
        missing: 'Evidence',
        next: 'Observe',
        pauseReason: 'Paused',
        benefit: 'None',
      },
    ]),
  );
  const projects = v7Clone(a.memory.projects),
    r = diagnosticStep(w);
  expect(r.outcomes.moss?.success).toBe(true);
  expect(r.world.actors[0]?.memory.projects).toEqual(projects);
  a.vitals.energy = 0.1;
  const failed = diagnosticStep(w);
  expect(
    failed.world.events.find((e) => e.type === 'shelter-reference-diagnostic')
      ?.data.reasonCode,
  ).toBe('insufficient-energy');
  expect(failed.world.events.some((e) => e.type === 'shelter-inspected')).toBe(
    false,
  );
});
it('migrates an active physical build without resetting escrow, installed components or work and resumes after serialization', () => {
  let w = refugeTested();
  w = v7Clone(
    refugeStep(w, refugeAction('build', 'refuge-build', refugeAllocation))
      .world,
  );
  const before = v7Clone(w),
    a = w.actors[0];
  if (!a) throw new Error('Missing actor');
  const load = v7Load(w, a);
  w = v7Clone(
    v7Install(w, continuousRegistry(w), 'shelter-reference-diagnostics@1'),
  );
  expect(w.objects).toEqual(before.objects);
  expect(w.stacks).toEqual(before.stacks);
  expect(w.state['refuge:work:lin:refuge-build']).toEqual(
    before.state['refuge:work:lin:refuge-build'],
  );
  expect(v7Load(w, w.actors[0] ?? a)).toBe(load);
  w = JSON.parse(JSON.stringify(w)) as typeof w;
  for (let i = 0; i < 9; i++)
    w = v7Clone(
      refugeStep(w, refugeAction('build', 'refuge-build', refugeAllocation))
        .world,
    );
  expect(w.objects.find((o) => o.kind === 'open-refuge')?.data.stage).toBe(10);
});
it('allows first supported geometry learning but does not reward identical material geometry under another source label', () => {
  const measured = diagnosticFrames().at(-1);
  if (!measured) throw new Error('Missing isolated represented law');
  let w = diagnosticFixture();
  w.state['woven:law:branch:forest-branch-0'] = v7Clone(
    measured.state['woven:law:branch:forest-branch-0'] ?? null,
  );
  w = v7Clone(diagnosticStep(w).world);
  expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(true);
  expect(w.events.some((e) => e.type === 'practice-confirmed')).toBe(false);
  const s = w.stacks[0];
  if (!s) throw new Error('Missing item');
  s.origin = 'same-geometry-other-source';
  w.state['woven:law:branch:same-geometry-other-source'] = v7Clone(
    w.state['woven:law:branch:forest-branch-0'] ?? null,
  );
  w = v7Clone(diagnosticStep(w).world);
  expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(false);
});
