import { describe, it, expect } from 'vitest';
import {
  collectiveJobs,
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Cursor,
  v7TaskAction,
  v7FinishTasks,
} from '@self-evolving-world/world-core';
import { initialCollectiveWorld } from '../src/collective-scenario.js';
import { collectiveInput } from '../src/collective-input.js';
import { rootStep } from './fixtures/collective-roots.js';
import {
  inspectionId,
  inspectionFixture,
  inspectionFrames,
  inspectionAction,
  inspectionStart,
  inspectionMust,
} from './fixtures/collective-food-inspection.js';
const job = (w: ReturnType<typeof inspectionFixture>) =>
  collectiveJobs(w, inspectionId).at(-1);
const portions = (w: ReturnType<typeof inspectionFixture>) =>
  w.stacks.filter((s) => s.resource === 'hazelnut');
describe('reviewed non-ingestive opening, isolated mechanism fixtures only', () => {
  it('preserves quantities, composition and age while paying two work rounds; observations cannot certify safety', () => {
    const f = inspectionFrames();
    expect(portions(f.complete).reduce((n, s) => n + s.quantity, 0)).toBe(1);
    expect(f.complete.resources).toEqual(f.initial.resources);
    expect(job(f.partial)).toMatchObject({
      completedWork: 1,
      remainingWork: 1,
      paidEnergy: 0.5,
      status: 'active',
    });
    expect(job(f.complete)).toMatchObject({
      completedWork: 2,
      remainingWork: 0,
      paidEnergy: 1,
      status: 'completed',
    });
    const opened = portions(f.complete).find(
      (s) => s.processing?.foodInspection,
    );
    expect(opened).toMatchObject({
      quantity: 0.1,
      origin: 'isolated-nut-source',
      harvestedAt: 0,
      processing: { foodInspection: { fraction: 1 } },
    });
    expect(opened?.decay).toBeGreaterThan(10);
    expect(f.inspected.actors[0]?.wellbeing.sources).toHaveLength(0);
    const fact =
      f.complete.actors[0]?.memory.knowledge?.[
        'hazelnut:mechanical-interior-access:compression-v1'
      ];
    expect(fact?.value).toEqual({
      accessible: true,
      nutrition: null,
      toxicity: null,
      safeToEat: null,
    });
    expect(
      f.complete.actors[0]?.wellbeing.sources.find(
        (x) => x.source === 'grounded-understanding',
      ),
    ).toMatchObject({ exposures: 1, sustained: 0.035 });
    expect(
      f.complete.actors[0]?.wellbeing.sources
        .filter((s) => s.value > 0)
        .map((s) => s.source),
    ).toEqual(['grounded-understanding']);
    const events = JSON.stringify([
      f.inspected.events,
      f.partial.events,
      f.complete.events,
    ]);
    expect(events).not.toContain('food-inspection:composition');
    expect(events).not.toContain('"resistance"');
    expect(events).not.toContain('"properties"');
    expect(f.complete.actors[0]?.memory.discoveries?.hazelnut).toBeUndefined();
  });
  it('resumes paid partial work after movement, energy shortage and checkpoint restoration without new allocation', () => {
    const f = inspectionFrames();
    let w = v7Clone(f.partial);
    const a = w.actors[0];
    if (!a) throw new Error('Missing actor.');
    const point = { ...a.position };
    a.position.x -= 3;
    w = inspectionMust(w, inspectionAction('continue'));
    expect(job(w)?.paidEnergy).toBe(0.5);
    if (!w.actors[0]) throw new Error('Missing actor.');
    w.actors[0].position = point;
    w.actors[0].vitals.energy = 0;
    w = inspectionMust(w, inspectionAction('continue'));
    expect(job(w)?.remainingWork).toBe(1);
    if (!w.actors[0]) throw new Error('Missing actor.');
    w.actors[0].vitals.energy = 10;
    w = inspectionMust(v7Clone(w), inspectionAction('continue'));
    expect(job(w)?.paidEnergy).toBe(1);
    expect(portions(w).reduce((n, s) => n + s.quantity, 0)).toBe(1);
  });
  it('rejects missing or wrong material, insufficient quantity, changed contact and overlapping bodies without fabricating inputs', () => {
    for (const change of [
      (w: ReturnType<typeof inspectionFixture>) => {
        w.stacks = w.stacks.filter((s) => s.resource !== 'stone');
      },
      (w: ReturnType<typeof inspectionFixture>) => {
        const s = w.stacks.find((s) => s.id === 'fixture-hazelnut');
        if (s) s.owner = 'ash-2';
      },
      (w: ReturnType<typeof inspectionFixture>) => {
        const s = w.stacks.find((s) => s.id === 'fixture-hazelnut');
        if (s) s.quantity = 0;
      },
      (w: ReturnType<typeof inspectionFixture>) => {
        const s = w.stacks.find((s) => s.id === 'fixture-stone');
        if (s) s.processing = { wovenDamage: true };
      },
      (w: ReturnType<typeof inspectionFixture>) => {
        if (w.actors[1] && w.actors[0])
          w.actors[1].position = { x: w.actors[0].position.x + 0.55, y: 10 };
      },
    ]) {
      const w = inspectionFixture();
      change(w);
      const r = rootStep(w, inspectionStart);
      expect(r.outcomes['ash-1']?.success).toBe(false);
      expect(collectiveJobs(r.world, inspectionId)).toHaveLength(0);
    }
    const f = inspectionFrames();
    expect(
      rootStep(
        f.partial,
        inspectionAction('start', {
          sampleId: 'resource:hazelnut',
          toolId: 'item:fixture-stone',
        }),
      ).outcomes['ash-1']?.success,
    ).toBe(false);
    expect(
      rootStep(
        f.partial,
        inspectionAction('continue', { toolId: 'item:fixture-stone' }),
      ).outcomes['ash-1']?.success,
    ).toBe(false);
  });
  it('releases partial material once on cancellation or death without refund, erasing exposure or awarding discovery', () => {
    const f = inspectionFrames();
    for (const w of [
      f.stopped,
      (() => {
        const w = v7Clone(f.partial);
        if (w.actors[0]) {
          w.actors[0].vitals.health = 0.1;
          w.actors[0].vitals.satiety = 0;
        }
        return rootStep(w, { interface: 'wait', args: {} }).world;
      })(),
    ]) {
      expect(job(w)).toMatchObject({
        status: 'stopped',
        paidEnergy: 0.5,
        completedWork: 1,
      });
      const sample = portions(w).find((s) => s.processing?.foodInspection);
      expect(sample).toMatchObject({
        owner: null,
        quantity: 0.1,
        processing: { foodInspection: { fraction: 0.5 } },
      });
      expect(sample?.reservedFor).toBeUndefined();
      expect(
        w.actors[0]?.wellbeing.sources.find(
          (s) => s.source === 'grounded-understanding',
        ),
      ).toBeUndefined();
      expect(
        rootStep(w, inspectionAction('cancel')).outcomes['ash-1']?.success,
      ).toBe(false);
    }
  });
  it('uses complete-execution repeat semantics and deduplicates equivalent findings rather than rewarding every sample', () => {
    let w = inspectionFixture();
    const cursors = {
      'ash-1': v7Cursor(
        {
          intention: 'Fixture only',
          steps: [
            { action: inspectionStart, repeat: 2, until: null, guard: null },
          ],
          repeat: 1,
          until: null,
          interrupts: [],
          notes: [],
          preferences: [],
          projects: [],
        },
        0,
      ),
    };
    for (let i = 0; i < 4; i++) {
      const action = v7TaskAction(w, 'ash-1', cursors['ash-1']);
      if (!action) throw new Error('Missing operation');
      const r = rootStep(w, action);
      expect(r.outcomes['ash-1']?.success, r.outcomes['ash-1']?.reason).toBe(
        true,
      );
      v7FinishTasks(w, r, cursors);
      w = r.world;
    }
    expect(collectiveJobs(w, inspectionId).map((x) => x.paidEnergy)).toEqual([
      1, 1,
    ]);
    expect(
      portions(w).filter((s) => s.processing?.foodInspection),
    ).toHaveLength(2);
    expect(
      w.actors[0]?.wellbeing.sources.find(
        (s) => s.source === 'grounded-understanding',
      )?.exposures,
    ).toBe(1);
  });
  it('retains inspection facts privately and requires personal learning in the current scope', () => {
    const f = inspectionFrames();
    const own = JSON.stringify(
      collectiveInput(f.inspected, 'ash', ['ash-1'], {}, 'individual', 1),
    );
    const other = JSON.stringify(
      collectiveInput(f.inspected, 'ash', ['ash-2'], {}, 'individual', 1),
    );
    expect(own).toContain('dated non-ingestive appearance');
    expect(other).not.toContain('dated non-ingestive appearance');
    const a = initialCollectiveWorld('collective-ex11', 'A');
    expect(() =>
      v7Install(a, continuousRegistry(a), inspectionId + '@1'),
    ).toThrow();
    expect(
      rootStep(f.initial, inspectionStart, 'ash-2').outcomes['ash-2']?.success,
    ).toBe(false);
  });
});
