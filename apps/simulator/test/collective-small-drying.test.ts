import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  continuousRegistry,
  v7Step,
  v7Clone,
  v7Install,
  smallDryingAssessment,
  smallSupportValidity,
  rootProcessing,
  rootWater,
  rootAge,
  v7Observe,
} from '@self-evolving-world/world-core';
import type { V7World } from '@self-evolving-world/world-core';
import {
  smallFrames,
  smallFixture,
  smallAction,
  smallAssessAction,
  smallJob,
  smallSupport,
  smallId,
} from './fixtures/collective-small-drying.js';
import { surfaceMust } from './fixtures/collective-root-surface.js';
import { rootStep, rootFrames } from './fixtures/collective-roots.js';
import { initialCollectiveWorld } from '../src/collective-scenario.js';
function present<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('Missing fixture value.');
  return v;
}
const food = (w: V7World) =>
  present(w.stacks.find((s) => s.id === smallSupport(w).data.foodId));
describe('reviewed small ground drying under conserved inputs and shared weather', () => {
  it('assesses a real two-tenths sheet, pays two construction increments and loads only a proportional real sample', () => {
    const f = smallFrames(),
      r = smallDryingAssessment(present(f.assessed.actors[0]));
    expect(r?.suitable).toBe(true);
    expect(r?.geometry).toMatchObject({ mass: 0.06, width: 0.2, height: 0.2 });
    expect(
      f.assessed.events.some((e) => e.type === 'information-confirmed'),
    ).toBe(false);
    expect(smallJob(f.partial)).toMatchObject({
      remainingWork: 1,
      paidEnergy: 0.5,
    });
    expect(smallJob(f.built)).toMatchObject({
      remainingWork: 0,
      paidEnergy: 1,
      status: 'completed',
    });
    expect(smallSupportValidity(f.built, smallSupport(f.built)).valid).toBe(
      true,
    );
    expect(smallJob(f.loaded)).toMatchObject({
      paidEnergy: 0.2,
      completedWork: 0.2,
    });
    expect(food(f.loaded).quantity).toBe(0.1);
    expect(f.loaded.stacks.find((s) => s.id === 'fixture-root')?.quantity).toBe(
      1.9,
    );
    expect(rootProcessing(f.loaded, food(f.loaded))?.fraction).toBe(1);
    expect(food(f.loaded).harvestedAt).toBe(0);
    expect(food(f.loaded).decay).toBeGreaterThan(10);
    expect(
      f.loaded.stacks
        .filter((s) => ['root', 'crushed-root'].includes(s.resource))
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(2);
    expect(f.built.events.some((e) => e.type === 'information-confirmed')).toBe(
      false,
    );
    expect(
      f.loaded.events.some((e) => e.type === 'information-confirmed'),
    ).toBe(false);
  });
  it('pauses out of reach, resumes from checkpoint once, and releases partial construction exactly once on cancel or death', () => {
    const f = smallFrames(),
      w = v7Clone(f.partial),
      a = present(w.actors[0]),
      position = { ...a.position };
    a.position.x -= 3;
    const action = smallAction('continue', {
        processId: smallJob(w)?.id ?? '',
      }),
      paused = surfaceMust(w, action);
    expect(smallJob(paused)).toMatchObject({
      status: 'paused',
      paidEnergy: 0.5,
      remainingWork: 1,
    });
    present(paused.actors[0]).position = position;
    const completed = surfaceMust(v7Clone(paused), action);
    expect(smallJob(completed)?.paidEnergy).toBe(1);
    expect(rootStep(completed, action).outcomes['ash-1']?.success).toBe(false);
    expect(
      f.cancelled.objects.some((o) => o.kind === 'small-root-drying-support'),
    ).toBe(false);
    expect(
      f.cancelled.stacks
        .filter((s) => s.resource === 'bark')
        .reduce((n, s) => n + s.quantity, 0),
    ).toBeCloseTo(0.2);
    expect(
      f.cancelled.stacks.some((s) => s.reservedFor === smallJob(f.partial)?.id),
    ).toBe(false);
    const dead = v7Clone(f.partial);
    present(dead.actors[0]).vitals.health = 0.1;
    present(dead.actors[0]).vitals.satiety = 0;
    const settled = rootStep(dead, { interface: 'wait', args: {} }).world;
    expect(smallJob(settled)?.status).toBe('stopped');
    expect(
      settled.objects.some((o) => o.kind === 'small-root-drying-support'),
    ).toBe(false);
  });
  it('uses half-rate water exchange and existing preservation, with real blockers, age and rewetting', () => {
    const f = smallFrames(),
      w = v7Clone(f.loaded),
      s = food(w);
    w.tick = 40;
    w.time = 40;
    w.events = [];
    const before = present(s.physical).unitWater;
    rootWater(w, s);
    expect(before - present(s.physical).unitWater).toBeCloseTo(0.0025);
    expect(
      w.events.find((e) => e.type === 'small-drying-progress')?.data.evaporated,
    ).toBeCloseTo(0.00025);
    expect(w.state['collective:root-water']).toBeDefined();
    expect(
      rootProcessing(f.blocked, food(f.blocked))?.history.at(-1)?.status,
    ).toMatch(/paused/);
    const blocked = food(f.blocked);
    expect(rootAge(f.blocked, blocked, 1)).toBe(1.25);
    const displaced = v7Clone(f.loaded),
      o = smallSupport(displaced);
    present(
      displaced.objects.find((x) => x.data.smallSupport === o.id),
    ).spatial.x += 0.1;
    displaced.tick = 41;
    displaced.time = 41;
    rootWater(displaced, food(displaced));
    expect(
      rootProcessing(displaced, food(displaced))?.history.at(-1)?.status,
    ).toMatch(/paused/);
    const wet = v7Clone(f.dry);
    wet.tick = 160;
    wet.time = 160;
    wet.events = [];
    const amount = present(food(wet).physical).unitWater;
    rootWater(wet, food(wet));
    expect(present(food(wet).physical).unitWater).toBeGreaterThanOrEqual(
      amount,
    );
    expect(rootProcessing(wet, food(wet))?.fraction).toBe(1);
    const lost = v7Clone(f.loaded),
      id = smallSupport(lost).id;
    lost.objects = lost.objects.filter((o) => o.id !== id);
    const lostFood = present(
      lost.stacks.find((s) => s.resource === 'crushed-root'),
    );
    lost.tick = 42;
    lost.time = 42;
    const water = present(lostFood.physical).unitWater;
    rootWater(lost, lostFood);
    expect(lostFood.physical?.unitWater).toBe(water);
  });
  it('rejects unknown, fragmented, stale, wrong-owner and oversized inputs without inventing sheet or food', () => {
    const w = smallFixture(),
      b = present(w.stacks.find((s) => s.id === 'fixture-bark-0'));
    b.processing = { ...b.processing, fragmented: true };
    const assessed = surfaceMust(w, smallAssessAction);
    expect(smallDryingAssessment(present(assessed.actors[0]))?.suitable).toBe(
      false,
    );
    const fresh = surfaceMust(smallFixture(), smallAssessAction);
    present(fresh.stacks.find((s) => s.id === 'fixture-stone')).quantity -= 0.1;
    expect(
      rootStep(
        fresh,
        smallAction('build', {
          assessmentId:
            smallDryingAssessment(present(fresh.actors[0]))?.id ?? '',
        }),
      ).outcomes['ash-1']?.success,
    ).toBe(false);
    const f = smallFrames();
    present(f.built.stacks.find((s) => s.id === 'fixture-root')).processing = {
      unitVolume: 1,
    };
    expect(
      rootStep(
        f.built,
        smallAction('load', {
          supportId: smallSupport(f.built).id,
          sampleId: 'fixture-root',
        }),
      ).outcomes['ash-1']?.success,
    ).toBe(false);
    const wrong = smallFixture();
    present(wrong.stacks.find((s) => s.id === 'fixture-bark-0')).owner =
      'ash-2';
    expect(rootStep(wrong, smallAssessAction).outcomes['ash-1']?.success).toBe(
      false,
    );
    expect(
      v7Observe(wrong, 'ash-2').self.extensionState[
        'root-small-drying:assessment'
      ],
    ).toBeUndefined();
  });
  it('permits separately learned local shared use, protects depositor food, conserves unload and deduplicates genuine measured feedback', () => {
    const f = smallFrames(),
      w = v7Clone(f.built),
      a = present(w.actors[1]);
    a.position = { x: 11.2, y: 10 };
    a.mastered.push('root-air-drying', smallId);
    a.collective?.knownAbilities.push(smallId);
    present(w.stacks.find((s) => s.id === 'fixture-root')).owner = a.id;
    const loaded = rootStep(
      w,
      smallAction('load', {
        supportId: smallSupport(w).id,
        sampleId: 'fixture-root',
      }),
      a.id,
    );
    expect(loaded.outcomes[a.id]?.success).toBe(true);
    expect(
      rootStep(
        loaded.world,
        smallAction('unload', { supportId: smallSupport(w).id }),
      ).outcomes['ash-1']?.success,
    ).toBe(false);
    const unloaded = rootStep(
      loaded.world,
      smallAction('unload', { supportId: smallSupport(w).id }),
      a.id,
    );
    expect(unloaded.outcomes[a.id]?.success).toBe(true);
    expect(
      unloaded.world.stacks.find((s) => s.resource === 'crushed-root')?.owner,
    ).toBe(a.id);
    const inspected = surfaceMust(
      f.dry,
      smallAction('inspect', { supportId: smallSupport(f.dry).id }),
    );
    expect(
      inspected.events.some((e) => e.type === 'information-confirmed'),
    ).toBe(true);
    const repeated = surfaceMust(
      inspected,
      smallAction('inspect', { supportId: smallSupport(inspected).id }),
    );
    expect(
      repeated.events.some((e) => e.type === 'information-confirmed'),
    ).toBe(false);
    expect(
      rootStep(
        f.loaded,
        smallAction('dismantle', { supportId: smallSupport(f.loaded).id }),
      ).outcomes['ash-1']?.success,
    ).toBe(false);
  });
  it('keeps old tray semantics and fresh scopes; the actual applicant still lacks owned bark and cannot receive a free support', () => {
    const legacy = rootFrames();
    expect(legacy.tray.objects.some((o) => o.kind === 'root-drying-tray')).toBe(
      true,
    );
    const a = initialCollectiveWorld('collective-ex11', 'A');
    expect(() => v7Install(a, continuousRegistry(a), smallId + '@1')).toThrow();
    const checkpoint = JSON.parse(
      readFileSync(
        'experiment/ex12/checkpoints/development-000123-398-10.json',
        'utf8',
      ),
    ) as { state: { world: V7World } };
    const baseline = checkpoint.state.world,
      w = v7Clone(
        v7Install(baseline, continuousRegistry(baseline), smallId + '@1'),
      ),
      actor = present(w.actors.find((a) => a.id === 'ash-5'));
    actor.mastered.push(smallId);
    expect(
      w.stacks.some((s) => s.owner === actor.id && s.resource === 'bark'),
    ).toBe(false);
    const r = rootStep(
      w,
      smallAction('assess', {
        site: { ...actor.position },
        barkId: 'resource:bark',
        stoneIds: w.stacks
          .filter((s) => s.owner === actor.id && s.resource === 'stone')
          .map((s) => s.id),
        sampleId:
          w.stacks.find((s) => s.owner === actor.id && s.resource === 'root')
            ?.id ?? '',
      }),
      actor.id,
    );
    expect(r.outcomes[actor.id]?.success).toBe(false);
    expect(
      r.world.objects.some((o) => o.kind === 'small-root-drying-support'),
    ).toBe(false);
  });
  it('serializes contested real loading and preserves positive single-user controls', () => {
    const f = smallFrames(),
      w = v7Clone(f.built),
      other = present(w.actors[1]);
    other.position = { x: 11.2, y: 10 };
    other.mastered.push('root-air-drying', smallId);
    const original = present(w.stacks.find((s) => s.id === 'fixture-root'));
    w.stacks.push({
      ...v7Clone(original),
      id: 'other-owned-root',
      owner: other.id,
    });
    const first = smallAction('load', {
        supportId: smallSupport(w).id,
        sampleId: original.id,
      }),
      second = smallAction('load', {
        supportId: smallSupport(w).id,
        sampleId: 'other-owned-root',
      });
    expect(rootStep(w, first).outcomes['ash-1']?.success).toBe(true);
    expect(rootStep(w, second, other.id).outcomes[other.id]?.success).toBe(
      true,
    );
    const both = v7Step(
      w,
      { 'ash-1': first, [other.id]: second },
      continuousRegistry(w),
    );
    expect(both.paused).toBeNull();
    expect(
      Object.values(both.outcomes).filter((o) => o.success).length,
    ).toBeLessThanOrEqual(1);
    expect(
      both.world.stacks
        .filter((s) => ['root', 'crushed-root'].includes(s.resource))
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(4);
    expect(
      both.world.stacks
        .filter((s) => s.resource === 'crushed-root')
        .reduce((n, s) => n + s.quantity, 0),
    ).toBeLessThanOrEqual(0.1);
  });
  it('pauses on wet ground and retains completed support after performer death without automatic repair', () => {
    const f = smallFrames(),
      w = v7Clone(f.loaded),
      o = smallSupport(w),
      sample = food(w),
      row = w.terrain[Math.floor(o.spatial.y)];
    if (!row) throw new Error('Missing fixture terrain.');
    w.terrain[Math.floor(o.spatial.y)] =
      row.slice(0, Math.floor(o.spatial.x)) +
      ',' +
      row.slice(Math.floor(o.spatial.x) + 1);
    w.tick = 40;
    w.time = 40;
    const water = present(sample.physical).unitWater;
    rootWater(w, sample);
    expect(sample.physical?.unitWater).toBe(water);
    expect(smallSupportValidity(w, o).firm).toBe(false);
    const dying = v7Clone(f.loaded);
    present(dying.actors[0]).vitals.health = 0.1;
    present(dying.actors[0]).vitals.satiety = 0;
    const dead = rootStep(dying, { interface: 'wait', args: {} }).world;
    expect(smallSupport(dead).visual.state).toBe('ready');
    expect(food(dead).quantity).toBe(0.1);
    const damaged = v7Clone(f.loaded),
      sheet = present(
        damaged.stacks.find(
          (s) =>
            s.resource === 'bark' && s.reservedFor === smallSupport(damaged).id,
        ),
      );
    sheet.processing = { ...sheet.processing, fragmented: true };
    damaged.tick = 41;
    damaged.time = 41;
    const before = present(food(damaged).physical).unitWater;
    rootWater(damaged, food(damaged));
    expect(food(damaged).physical?.unitWater).toBe(before);
    expect(sheet.processing.fragmented).toBe(true);
  });
});
