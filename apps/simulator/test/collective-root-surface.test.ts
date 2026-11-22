import { describe, it, expect } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  rootProcessing,
} from '@self-evolving-world/world-core';
import {
  surfaceId,
  surfaceFixture,
  surfaceAction,
  assessSurface,
  prepareSmall,
  surfaceMust,
  surfaceJob,
  surfaceFrames,
} from './fixtures/collective-root-surface.js';
import { rootStep, rootFixture, crush } from './fixtures/collective-roots.js';
function present<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('Missing fixture value.');
  return v;
}
describe('reviewed fractional surface upgrade without inherited personal study', () => {
  it('assesses a real 0.09-mass sheet and processes one root while leaving the second untouched, with bounded canonical feedback', () => {
    const f = surfaceFrames(),
      event = f.assessed.events.find((e) => e.type === 'root-surface-assessed');
    expect(event?.data.suitable).toBe(true);
    expect(event?.data.geometry).toMatchObject({
      mass: 0.09,
      quantity: 0.3,
      width: 0.3,
      height: 0.2,
      connected: true,
    });
    expect(
      f.assessed.stacks.find((s) => s.id === 'fixture-root')?.quantity,
    ).toBe(2);
    expect(
      f.partial.stacks.find((s) => s.id === 'fixture-root')?.quantity,
    ).toBe(1);
    expect(surfaceJob(f.partial)).toMatchObject({
      remainingWork: 1,
      paidEnergy: 1,
    });
    expect(surfaceJob(f.complete)).toMatchObject({
      remainingWork: 0,
      paidEnergy: 2,
      status: 'completed',
    });
    const output = present(
      f.complete.stacks.find((s) => s.resource === 'crushed-root'),
    );
    expect(output.quantity).toBe(1);
    expect(rootProcessing(f.complete, output)?.fraction).toBe(1);
    expect(output.harvestedAt).toBe(0);
    expect(output.decay).toBeGreaterThan(10);
    expect(
      f.complete.stacks
        .filter((s) => s.resource === 'root' || s.resource === 'crushed-root')
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(2);
    expect(
      f.assessed.actors[0]?.wellbeing.sources
        .filter((s) => s.value > 0)
        .map((s) => s.source),
    ).toEqual(['grounded-understanding']);
    expect(
      surfaceMust(f.assessed, assessSurface).events.filter(
        (e) => e.type === 'information-confirmed',
      ),
    ).toHaveLength(0);
  });
  it('resumes actual partial work after loss of reach and checkpoint restoration, with no replacement allocation or duplicate settlement', () => {
    const f = surfaceFrames(),
      w = v7Clone(f.partial),
      a = present(w.actors[0]),
      point = { ...a.position };
    a.position.x -= 3;
    const paused = surfaceMust(
      w,
      surfaceAction('continue', { processId: surfaceJob(w)?.id ?? '' }),
    );
    expect(surfaceJob(paused)).toMatchObject({
      status: 'paused',
      remainingWork: 1,
      paidEnergy: 1,
    });
    present(paused.actors[0]).position = point;
    const completed = surfaceMust(
      v7Clone(paused),
      surfaceAction('continue', { processId: surfaceJob(paused)?.id ?? '' }),
    );
    expect(surfaceJob(completed)?.paidEnergy).toBe(2);
    expect(
      rootStep(
        completed,
        surfaceAction('continue', {
          processId: surfaceJob(completed)?.id ?? '',
        }),
      ).outcomes['ash-1']?.success,
    ).toBe(false);
    expect(
      rootStep(f.partial, {
        ...prepareSmall,
        args: { ...prepareSmall.args, quantity: 0.5 },
      }).outcomes['ash-1']?.success,
    ).toBe(false);
  });
  it('charges fractional work without rounding its energy into two full charges and retains real cancellation/death material', () => {
    const f = surfaceFrames(),
      small = surfaceMust(f.assessed, {
        ...prepareSmall,
        args: { ...prepareSmall.args, quantity: 0.1 },
      });
    expect(surfaceJob(small)).toMatchObject({
      remainingWork: 0,
      paidEnergy: 0.2,
      completedWork: 0.2,
    });
    expect(small.stacks.find((s) => s.id === 'fixture-root')?.quantity).toBe(
      1.9,
    );
    expect(
      f.cancelled.stacks.find((s) => s.resource === 'root' && s.reservedFor),
    ).toBeUndefined();
    const partialFood = f.cancelled.stacks.find(
      (s) => s.resource === 'root' && s.owner === null,
    );
    expect(rootProcessing(f.cancelled, present(partialFood))?.fraction).toBe(
      0.5,
    );
    const dying = v7Clone(f.partial),
      a = present(dying.actors[0]);
    a.vitals.health = 0.1;
    a.vitals.satiety = 0;
    const dead = surfaceMust(dying, { interface: 'wait', args: {} });
    expect(surfaceJob(dead)?.status).toBe('stopped');
    expect(dead.events.some((e) => e.type === 'root-preparation-stopped')).toBe(
      true,
    );
  });
  it('rejects fines, disconnected or undersized sheets, wrong tools and blocked sites without preparing extra food', () => {
    for (const change of [
      (w: ReturnType<typeof surfaceFixture>) => {
        present(w.stacks.find((s) => s.id === 'fixture-bark-0')).resource =
          'bark-fines';
      },
      (w: ReturnType<typeof surfaceFixture>) => {
        const s = present(w.stacks.find((s) => s.id === 'fixture-bark-0'));
        s.quantity = 0.1;
        s.quantityTenths = 1;
      },
      (w: ReturnType<typeof surfaceFixture>) => {
        present(w.stacks.find((s) => s.id === 'fixture-bark-0')).materialLayer =
          {
            width: 0.3,
            height: 0.2,
            density: 500,
            thickness: 0.003,
            connected: false,
            holes: 1,
            condition: 0.5,
          };
      },
      (w: ReturnType<typeof surfaceFixture>) => {
        present(w.stacks.find((s) => s.id === 'fixture-stone')).resource =
          'vine';
      },
    ]) {
      const w = surfaceFixture();
      change(w);
      const r = rootStep(w, assessSurface);
      const e = r.world.events.find((e) => e.type === 'root-surface-assessed');
      expect(!r.outcomes['ash-1']?.success || e?.data.suitable === false).toBe(
        true,
      );
      expect(
        r.world.stacks.find((s) => s.id === 'fixture-root')?.quantity,
      ).toBe(2);
    }
    const w = surfaceFixture();
    expect(
      rootStep(w, {
        ...assessSurface,
        args: { ...assessSurface.args, site: { x: 10, y: 10 } },
      }).world.events.find((e) => e.type === 'root-surface-assessed')?.data
        .suitable,
    ).toBe(false);
  });
  it('requires separate extension mastery, supports the original interface after study and preserves active legacy operations', () => {
    const w = surfaceFixture();
    present(w.actors[0]).mastered = present(w.actors[0]).mastered.filter(
      (id) => id !== surfaceId,
    );
    expect(
      rootStep(w, { ...assessSurface, interface: 'root-preparation' }).outcomes[
        'ash-1'
      ]?.success,
    ).toBe(false);
    expect(
      rootStep(surfaceFixture(), {
        ...assessSurface,
        interface: 'root-preparation',
      }).outcomes['ash-1']?.success,
    ).toBe(true);
    const legacy = rootStep(rootFixture(), crush).world,
      upgraded = v7Clone(
        v7Install(legacy, continuousRegistry(legacy), 'root-preparation@2'),
      );
    const j = Object.values(upgraded.state).find(
      (v) =>
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        v.ability === 'root-preparation' &&
        v.status === 'active',
    );
    if (!j || typeof j !== 'object' || Array.isArray(j))
      throw new Error('Missing active legacy fixture.');
    const r = rootStep(upgraded, {
      interface: 'root-preparation',
      args: { operation: 'continue', processId: j.id ?? '' },
    });
    expect(r.outcomes['ash-1']?.success, r.outcomes['ash-1']?.reason).toBe(
      true,
    );
    expect(r.world.stacks.some((s) => s.resource === 'crushed-root')).toBe(
      true,
    );
  });
});
