import { describe, it, expect } from 'vitest';
import {
  v7Clone,
  v7Cursor,
  v7TaskAction,
  v7FinishTasks,
  v7Step,
  collectiveJobs,
  collectiveFoodProfile,
  continuousRegistry,
  v7Install,
} from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import {
  barkFixture,
  barkAction,
  barkMust,
  barkFrames,
} from './fixtures/collective-bark.js';
import { rootStep } from './fixtures/collective-roots.js';
import { initialCollectiveWorld } from '../src/collective-scenario.js';
const totals = (w: V7World) =>
  w.stacks.reduce(
    (n, s) => {
      const p = collectiveFoodProfile(w, s);
      return {
        mass: n.mass + s.quantity * (s.physical?.unitMass ?? p?.mass ?? 0),
        fuel: n.fuel + s.quantity * (p?.properties?.fuel ?? 0),
        nutrition: n.nutrition + s.quantity * (p?.nutrition ?? 0),
        toxin: n.toxin + s.quantity * (p?.toxicity ?? 0),
      };
    },
    { mass: 0, fuel: 0, nutrition: 0, toxin: 0 },
  );
describe('actual ex12 bark precursor, isolated fixtures only', () => {
  it('assesses without inventing trunk stock or inspection reward, then conserves physical and chemical material in paid separation', () => {
    const f = barkFrames();
    expect(f.assessed.objects).toEqual(f.initial.objects);
    expect(
      f.assessed.events.some((e) => e.type === 'information-confirmed'),
    ).toBe(false);
    expect(totals(f.complete).mass).toBeCloseTo(totals(f.initial).mass, 7);
    expect(totals(f.complete).fuel).toBeCloseTo(totals(f.initial).fuel, 7);
    expect(
      f.complete.stacks
        .filter((s) => s.resource === 'bark')
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(1.4);
    expect(
      f.complete.stacks.find((s) => s.resource === 'bark-fines')?.physical
        ?.unitMass,
    ).toBeCloseTo(0.02, 7);
    expect(collectiveJobs(f.complete, 'bark-extraction')[0]).toMatchObject({
      completedWork: 8,
      remainingWork: 0,
      paidEnergy: 8,
      status: 'completed',
    });
    expect(
      f.partial.events.filter((e) => e.type === 'information-confirmed'),
    ).toHaveLength(1);
    expect(
      f.complete.events.filter((e) => e.type === 'information-confirmed'),
    ).toHaveLength(0);
    expect(
      rootStep(
        f.complete,
        barkAction('peel', {
          targetId: 'resource:peeled-branch',
          toolId: 'resource:stone',
          quantity: 1,
        }),
      ).outcomes['ash-1']?.success,
    ).toBe(false);
  });
  it('requires actual personal edge assessment and exact material identity', () => {
    const w = barkFixture();
    expect(
      rootStep(
        w,
        barkAction('peel', {
          targetId: 'item:fixture-branch',
          toolId: 'item:fixture-stone',
          quantity: 1,
        }),
      ).outcomes['ash-1']?.success,
    ).toBe(false);
    const assessed = barkMust(
      w,
      barkAction('assess', { targetId: 'item:fixture-stone' }),
    );
    expect(
      rootStep(
        assessed,
        barkAction('peel', {
          targetId: 'object:fixture-tree',
          toolId: 'item:fixture-stone',
          quantity: 1,
        }),
      ).outcomes['ash-1']?.success,
    ).toBe(false);
    const branch = assessed.stacks.find((s) => s.resource === 'branch');
    if (!branch) throw new Error('Missing fixture branch.');
    branch.materialLayer = {
      separable: false,
      evidence: 'Contradictory represented layer',
    };
    expect(
      rootStep(
        assessed,
        barkAction('peel', {
          targetId: 'item:fixture-branch',
          toolId: 'item:fixture-stone',
          quantity: 1,
        }),
      ).outcomes['ash-1']?.success,
    ).toBe(false);
  });
  it('pays fractional effort without rounding it into a full energy penalty or useful bark unit', () => {
    let w = barkMust(
      barkFixture(),
      barkAction('assess', { targetId: 'item:fixture-stone' }),
    );
    w = barkMust(
      w,
      barkAction('peel', {
        targetId: 'item:fixture-branch',
        toolId: 'item:fixture-stone',
        quantity: 0.1,
      }),
    );
    expect(collectiveJobs(w, 'bark-extraction')[0]).toMatchObject({
      paidEnergy: 0.2,
      remainingWork: 0,
      status: 'completed',
    });
    expect(w.stacks.filter((s) => s.resource === 'bark')).toHaveLength(0);
    expect(
      w.stacks.find((s) => s.resource === 'bark-fines')?.physical?.unitMass,
    ).toBeCloseTo(0.011, 7);
  });
  it('retains paid work on pause and actual partial material on cancellation and death without refunds', () => {
    const f = barkFrames(),
      moved = v7Clone(f.partial);
    if (!moved.actors[0]) throw new Error('Missing actor.');
    moved.actors[0].position.x += 4;
    const paused = barkMust(moved, barkAction('peel'));
    expect(collectiveJobs(paused, 'bark-extraction')[0]?.completedWork).toBe(1);
    const restored = v7Clone(paused);
    if (!restored.actors[0]) throw new Error('Missing actor.');
    restored.actors[0].position.x -= 4;
    const resumed = barkMust(restored, barkAction('peel'));
    expect(collectiveJobs(resumed, 'bark-extraction')[0]?.completedWork).toBe(
      2,
    );
    expect(totals(f.stopped).mass).toBeCloseTo(totals(f.initial).mass, 7);
    expect(f.stopped.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
    const dying = v7Clone(f.partial);
    if (!dying.actors[0]) throw new Error('Missing actor.');
    dying.actors[0].vitals.health = 0.1;
    dying.actors[0].vitals.satiety = 0;
    const dead = rootStep(dying, { interface: 'wait', args: {} }).world;
    expect(dead.events.some((e) => e.type === 'died')).toBe(true);
    expect(dead.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(totals(dead).mass).toBeCloseTo(totals(f.partial).mass, 7);
    expect(
      rootStep(f.stopped, barkAction('cancel')).outcomes['ash-1']?.success,
    ).toBe(false);
  });
  it('makes the real bark output usable by the earlier capability without granting mastery or stock', () => {
    const w = barkFrames().complete,
      bark = w.stacks.find((s) => s.resource === 'bark'),
      stone = w.stacks.find(
        (s) => s.resource === 'stone' && !s.reservedFor && s.quantity >= 1,
      );
    if (!bark || !stone) throw new Error('Missing actual output.');
    const r = rootStep(w, {
      interface: 'root-preparation',
      args: {
        operation: 'prepare',
        inputStackId: 'item:fixture-root',
        quantity: 1,
        barkId: 'item:' + bark.id,
        stoneId: 'item:' + stone.id,
        x: 10,
        y: 10.7,
      },
    });
    expect(r.outcomes['ash-1']?.success, r.outcomes['ash-1']?.reason).toBe(
      true,
    );
    expect(
      collectiveJobs(r.world, 'root-preparation')[0]?.sources.some(
        (s) => s.itemId === bark.id,
      ),
    ).toBe(true);
  });
  it('preserves represented water, nutrients and toxins and rejects replacing inputs in unfinished work', () => {
    const initial = barkFixture(),
      branch = initial.stacks.find((s) => s.resource === 'branch'),
      resource = initial.resources.find((r) => r.id === 'branch');
    if (!branch || !resource) throw new Error('Missing material.');
    branch.physical = { unitMass: 1.1, unitWater: 0.2, unitSolids: 0.9 };
    resource.nutrition = 3;
    resource.toxicity = 2;
    let w = barkMust(
      initial,
      barkAction('assess', { targetId: 'item:fixture-stone' }),
    );
    w = barkMust(
      w,
      barkAction('peel', {
        targetId: 'item:fixture-branch',
        toolId: 'item:fixture-stone',
        quantity: 1,
      }),
    );
    expect(
      rootStep(
        w,
        barkAction('peel', {
          targetId: 'item:fixture-branch',
          toolId: 'item:fixture-stone',
          quantity: 2,
        }),
      ).outcomes['ash-1']?.success,
    ).toBe(false);
    w = barkMust(w, barkAction('peel'));
    const expected = totals(initial),
      actual = totals(w);
    for (const key of ['mass', 'fuel', 'nutrition', 'toxin'] as const)
      expect(actual[key]).toBeCloseTo(expected[key], 7);
    const processed = w.stacks.filter((s) => s.processing?.barkProfile);
    expect(
      processed.reduce(
        (n, s) => n + s.quantity * (s.physical?.unitWater ?? 0),
        0,
      ),
    ).toBeCloseTo(0.2, 7);
  });
  it.each([1, 1.3])(
    'keeps %s-unit operation duration separate from two full repetitions',
    (quantity) => {
      let w = barkMust(
        barkFixture(),
        barkAction('assess', { targetId: 'item:fixture-stone' }),
      );
      const cursor = v7Cursor(
        {
          intention: 'Isolated repeated physical work.',
          steps: [
            {
              action: barkAction('peel', {
                targetId: 'item:fixture-branch',
                toolId: 'item:fixture-stone',
                quantity,
              }),
              repeat: 2,
              until: null,
              guard: null,
            },
          ],
          repeat: 1,
          until: null,
          interrupts: [],
          notes: [],
          preferences: [],
        },
        w.tick,
      );
      const cursors = { 'ash-1': cursor };
      for (let i = 0; i < Math.ceil(quantity * 2) * 2; i++) {
        const action = v7TaskAction(w, 'ash-1', cursors['ash-1']);
        if (!action)
          throw new Error(cursor.reason ?? 'Missing continued work.');
        const r = v7Step(
          w,
          { 'ash-1': action, 'ash-2': { interface: 'wait', args: {} } },
          continuousRegistry(w),
          cursors,
        );
        expect(r.outcomes['ash-1']?.success, r.outcomes['ash-1']?.reason).toBe(
          true,
        );
        v7FinishTasks(w, r, cursors);
        w = v7Clone(r.world);
      }
      expect(
        collectiveJobs(w, 'bark-extraction').map((j) => j.completedWork),
      ).toEqual([quantity * 2, quantity * 2]);
      expect(
        w.stacks.find((s) => s.id === 'fixture-branch')?.quantity,
      ).toBeCloseTo(4 - quantity * 2, 7);
      expect(v7TaskAction(w, 'ash-1', cursors['ash-1'])).toBeNull();
    },
  );
  it('isolates A and fresh B and requires actual personal learning after activation', () => {
    const a = initialCollectiveWorld('collective-ex11', 'A'),
      b = initialCollectiveWorld('collective-ex12', 'B');
    expect(() =>
      v7Install(a, continuousRegistry(a), 'bark-extraction@1'),
    ).toThrow();
    expect(b.abilities.some((x) => x.id === 'bark-extraction')).toBe(false);
    const w = barkFixture();
    if (!w.actors[0]) throw new Error('Missing actor.');
    w.actors[0].mastered = w.actors[0].mastered.filter(
      (x) => x !== 'bark-extraction',
    );
    expect(
      rootStep(w, barkAction('assess', { targetId: 'item:fixture-branch' }))
        .outcomes['ash-1']?.success,
    ).toBe(false);
  });
});
