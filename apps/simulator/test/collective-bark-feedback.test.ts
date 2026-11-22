import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
} from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import {
  barkFixture,
  barkAction,
  barkMust,
} from './fixtures/collective-bark.js';
import { collectiveInput } from '../src/collective-input.js';
import { initialCollectiveWorld } from '../src/collective-scenario.js';

const source = (w: V7World) =>
  w.actors[0]?.wellbeing.sources.find(
    (s) => s.source === 'grounded-understanding',
  );
const repair = (w: V7World) =>
  v7Clone(v7Install(w, continuousRegistry(w), 'bark-feedback@1'));
const assess = (w: V7World) =>
  barkMust(w, barkAction('assess', { targetId: 'item:fixture-stone' }));
const peel = (w: V7World) =>
  barkMust(
    w,
    barkAction('peel', {
      targetId: 'item:fixture-branch',
      toolId: 'item:fixture-stone',
      quantity: 1,
    }),
  );

describe('versioned repair of the actual ex12 inspection and feedback defect', () => {
  it('retains dated personal inspection beyond transient events without leaking it or claiming a verified experiment', () => {
    const initial = barkFixture();
    let w = repair(initial);
    expect(w.actors).toEqual(initial.actors);
    expect(w.stacks).toEqual(initial.stacks);
    w = assess(w);
    const event = w.events.find((e) => e.type === 'bark-assessed');
    expect(
      w.actors[0]?.memory.knowledge?.['bark-inspection:fixture-stone'],
    ).toMatchObject({ evidence: event?.id, verified: false });
    expect(source(w)).toBeUndefined();
    for (let i = 0; i < 10; i++)
      w = barkMust(w, { interface: 'wait', args: {} });
    expect(
      JSON.stringify(collectiveInput(w, 'ash', ['ash-1'], {}, 'individual', 1)),
    ).toContain('bark-inspection:fixture-stone');
    expect(
      JSON.stringify(collectiveInput(w, 'ash', ['ash-2'], {}, 'individual', 1)),
    ).not.toContain('bark-inspection:fixture-stone');
    expect(w.events.some((e) => e.type === 'bark-assessed')).toBe(false);
  });
  it('settles the unchanged canonical source on genuinely new paid evidence, without repeat or registration rewards', () => {
    const original = barkFixture();
    let w = repair(original);
    const rule = w.satisfaction.find((r) => r.id === 'grounded-understanding');
    const before = original.satisfaction.find(
      (r) => r.id === 'grounded-understanding',
    );
    if (!rule || !before) throw new Error('Missing canonical rule.');
    expect({
      ...rule,
      alternativeTriggers: before.alternativeTriggers,
      maintenance: before.maintenance,
    }).toEqual(before);
    expect({
      ...rule.maintenance,
      alternativeTriggers: before.maintenance?.alternativeTriggers,
    }).toEqual(before.maintenance);
    expect(source(w)).toBeUndefined();
    w = peel(assess(w));
    expect(source(w)).toMatchObject({ exposures: 1, sustained: 0.035 });
    expect(source(w)?.value).toBeGreaterThan(0);
    w = barkMust(w, barkAction('peel'));
    for (let i = 0; i < 13; i++)
      w = barkMust(w, { interface: 'wait', args: {} });
    w = peel(w);
    expect(source(w)?.exposures).toBe(1);
    expect(w.events.some((e) => e.type === 'information-confirmed')).toBe(
      false,
    );
  });
  it('preserves the old uncorrected version and never backfills experience or knowledge from earlier events', () => {
    const old = peel(assess(barkFixture()));
    expect(old.events.some((e) => e.type === 'information-confirmed')).toBe(
      true,
    );
    expect(source(old)).toBeUndefined();
    expect(
      old.actors[0]?.memory.knowledge?.['bark-inspection:fixture-stone'],
    ).toBeUndefined();
    const fixed = repair(old);
    expect(fixed.actors).toEqual(old.actors);
    const after = barkMust(fixed, barkAction('peel'));
    expect(source(after)).toBeUndefined();
    expect(
      after.actors[0]?.memory.knowledge?.['bark-inspection:fixture-stone'],
    ).toBeUndefined();
  });
  it('cannot activate in the A arm and does not become a free ability', () => {
    const a = initialCollectiveWorld('collective-ex11', 'A');
    expect(() => repair(a)).toThrow();
    const b = barkFixture();
    expect(repair(b).abilities).toEqual(b.abilities);
    expect(repair(b).actors.map((x) => x.mastered)).toEqual(
      b.actors.map((x) => x.mastered),
    );
  });
});
