import { describe, expect, it } from 'vitest';
import {
  rootFixture,
  rootStep,
  crush,
  trayBuild,
  rootFrames,
} from './fixtures/collective-roots.js';
import {
  v7Clone,
  continuousRegistry,
  v7Install,
  rootProcessing,
  rootDecayRate,
  rootWater,
  v7Step,
  foodSetQuantity,
  collectiveJobs,
  collectiveFoodProfile,
} from '@self-evolving-world/world-core';
import { initialCollectiveWorld } from '../src/collective-scenario.js';
import type { V7World } from '@self-evolving-world/world-core';
const actor = (w: V7World) => {
  const a = w.actors[0];
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const object = (w: V7World) => {
  const o = w.objects[0];
  if (!o) throw new Error('Missing fixture object.');
  return o;
};
const mass = (w: V7World) =>
  w.stacks.reduce(
    (n, s) =>
      n +
      s.quantity *
        (s.physical?.unitMass ??
          w.resources.find((r) => r.id === s.resource)?.mass ??
          0),
    0,
  );
const nutrition = (w: V7World) =>
  w.stacks.reduce(
    (n, s) => n + s.quantity * (collectiveFoodProfile(w, s)?.nutrition ?? 0),
    0,
  );
function must(w: V7World, action: Parameters<typeof rootStep>[1]) {
  const r = rootStep(w, action);
  expect(r.outcomes['ash-1']?.success, r.outcomes['ash-1']?.reason).toBe(true);
  return r.world;
}
describe('reviewed ex12 root processing fixtures, never formal decisions', () => {
  it('charges actual work once, conserves roots and reusable tools, and applies existing intake without preparation reward', () => {
    const initial = rootFixture(),
      partial = must(initial, crush),
      done = must(partial, {
        interface: 'root-preparation',
        args: { operation: 'continue' },
      });
    expect(collectiveJobs(done, 'root-preparation')[0]).toMatchObject({
      completedWork: 2,
      remainingWork: 0,
      paidEnergy: 2,
      status: 'completed',
    });
    expect(mass(done)).toBeCloseTo(mass(initial), 7);
    expect(nutrition(done)).toBe(nutrition(initial));
    const food = done.stacks.find((s) => s.resource === 'crushed-root');
    expect(food).toBeDefined();
    if (!food) throw new Error('Missing real output.');
    expect(food.decay).toBeGreaterThan(10);
    expect(rootDecayRate(done, food)).toBe(1.25);
    expect(done.actors[0]?.experience?.pleasure).toBe(0);
    const before = done.actors[0]?.vitals.satiety ?? 0;
    const ate = must(done, {
      interface: 'eat',
      args: { target: 'item:' + food.id, quantity: 1 },
    });
    expect(ate.actors[0]?.vitals.satiety).toBeCloseTo(before + 14 - 0.9, 7);
    expect(ate.events.filter((e) => e.type === 'meal-experience')).toHaveLength(
      1,
    );
    expect(done.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
  });
  it('preserves partial processing and escrow across interruption, failure, cancellation and death', () => {
    const partial = must(rootFixture(), crush),
      moved = v7Clone(partial);
    if (!moved.actors[0]) throw new Error('Missing actor.');
    moved.actors[0].position.x += 5;
    const paused = must(moved, {
      interface: 'root-preparation',
      args: { operation: 'continue' },
    });
    expect(collectiveJobs(paused, 'root-preparation')[0]?.completedWork).toBe(
      1,
    );
    const stopped = must(paused, {
      interface: 'root-preparation',
      args: { operation: 'cancel' },
    });
    const sample = stopped.stacks.find((s) => rootProcessing(stopped, s));
    expect(sample?.owner).toBeNull();
    expect(sample?.reservedFor).toBeUndefined();
    expect(sample && rootProcessing(stopped, sample)?.fraction).toBe(0.5);
    expect(mass(stopped)).toBeCloseTo(mass(partial), 7);
    expect(
      rootStep(stopped, {
        interface: 'root-preparation',
        args: { operation: 'cancel' },
      }).outcomes['ash-1']?.success,
    ).toBe(false);
    const dying = v7Clone(partial);
    if (!dying.actors[0]) throw new Error('Missing actor.');
    dying.actors[0].vitals.health = 0.1;
    dying.actors[0].vitals.satiety = 0;
    const dead = rootStep(dying, { interface: 'wait', args: {} }).world;
    expect(dead.events.some((e) => e.type === 'died')).toBe(true);
    expect(collectiveJobs(dead, 'root-preparation')[0]?.status).toBe('stopped');
    expect(dead.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
  });
  it('does not allocate a second operation using reserved tools and rejects occupied placement', () => {
    const partial = must(rootFixture(), crush);
    expect(rootStep(partial, trayBuild).outcomes['ash-1']?.success).toBe(false);
    const w = rootFixture();
    if (!w.actors[1]) throw new Error('Missing actor.');
    w.actors[1].position = { x: 10.7, y: 10 };
    const r = rootStep(w, crush);
    expect(r.outcomes['ash-1']?.success).toBe(false);
    expect(mass(r.world)).toBeCloseTo(mass(w), 7);
    expect(r.world.objects).toHaveLength(0);
  });
  it('builds a conserved reusable tray, allows a qualified second member and composes with actually prepared food', () => {
    let w = must(rootFixture(), trayBuild);
    w = must(w, {
      interface: 'root-air-drying',
      args: { operation: 'continue' },
    });
    const tray = w.objects[0];
    if (!tray || !w.actors[1]) throw new Error('Missing fixture.');
    actor(w).position = { x: 5, y: 5 };
    w.actors[1].position = { x: 10, y: 10 };
    w.actors[1].mastered.push('root-air-drying');
    w.actors[1].collective?.knownAbilities.push('root-air-drying');
    const source = w.stacks.find((s) => s.id === 'fixture-root');
    if (!source) throw new Error('Missing food.');
    source.owner = w.actors[1].id;
    source.position = { ...w.actors[1].position };
    const used = rootStep(
      w,
      {
        interface: 'root-air-drying',
        args: {
          operation: 'load',
          trayId: 'object:' + tray.id,
          inputStackId: 'item:' + source.id,
          quantity: 1,
        },
      },
      w.actors[1].id,
    );
    expect(used.outcomes[w.actors[1].id]?.success).toBe(true);
    expect(collectiveJobs(used.world, 'root-air-drying').at(-1)?.owner).toBe(
      w.actors[1].id,
    );
    let combined = must(rootFixture(), crush);
    combined = must(combined, {
      interface: 'root-preparation',
      args: { operation: 'continue' },
    });
    const food = combined.stacks.find((s) => s.resource === 'crushed-root');
    if (!food) throw new Error('Missing actual prior output.');
    const priorFoodId = food.id,
      priorOrigin = food.origin;
    combined = must(combined, {
      ...trayBuild,
      args: { ...trayBuild.args, x: 10.7, y: 11 },
    });
    combined = must(combined, {
      interface: 'root-air-drying',
      args: { operation: 'continue' },
    });
    const before = mass(combined),
      loaded = must(combined, {
        interface: 'root-air-drying',
        args: {
          operation: 'load',
          trayId: 'object:' + object(combined).id,
          inputStackId: 'item:' + priorFoodId,
          quantity: 1,
        },
      });
    expect(collectiveJobs(loaded, 'root-air-drying').at(-1)).toMatchObject({
      completedWork: 1,
      status: 'completed',
    });
    const composed = loaded.stacks.find(
      (s) => rootProcessing(loaded, s)?.tray === object(loaded).id,
    );
    if (!composed) throw new Error('Missing composed food.');
    const provenance = rootProcessing(loaded, composed);
    if (!provenance) throw new Error('Missing conservation record.');
    expect(composed.processing?.sourceOrigin).toBe(priorOrigin);
    expect(
      mass(loaded) + provenance.evaporated - provenance.receivedWater,
    ).toBeCloseTo(before, 6);
  });
  it('rejects conflicting same-round loads and preserves both inventories', () => {
    const w = rootFrames().tray,
      second = w.actors[1],
      source = w.stacks.find((s) => s.id === 'fixture-root');
    if (!second || !source) throw new Error('Missing contention fixture.');
    second.position = { x: 11.4, y: 10 };
    second.mastered.push('root-air-drying');
    second.collective?.knownAbilities.push('root-air-drying');
    foodSetQuantity(source, 50);
    w.stacks.push({
      ...v7Clone(source),
      id: 'fixture-second-root',
      quantity: 1,
      quantityTenths: 10,
      owner: second.id,
      position: { ...second.position },
    });
    const load = (inputStackId: string) => ({
      interface: 'root-air-drying',
      args: {
        operation: 'load',
        trayId: 'object:' + object(w).id,
        inputStackId,
        quantity: 1,
      },
    });
    const result = v7Step(
      w,
      {
        'ash-1': load('item:fixture-root'),
        [second.id]: load('item:fixture-second-root'),
      },
      continuousRegistry(w),
    );
    expect(result.outcomes['ash-1']).toMatchObject({
      success: false,
      reason:
        'Simultaneous resource or swept-body conflict; all conflicting actions were rejected.',
    });
    expect(result.outcomes[second.id]?.success).toBe(false);
    expect(
      result.world.stacks.find((s) => s.id === 'fixture-second-root'),
    ).toMatchObject({ owner: second.id, quantity: 1 });
    expect(
      collectiveJobs(result.world, 'root-air-drying').filter(
        (j) => j.mode === 'load',
      ),
    ).toHaveLength(0);
    expect(
      result.world.stacks.find((s) => s.id === 'fixture-root')?.quantity,
    ).toBe(5);
    const first = must(result.world, load('item:fixture-root'));
    expect(
      rootStep(first, load('item:fixture-second-root'), second.id).outcomes[
        second.id
      ]?.success,
    ).toBe(false);
  });
  it('removes expired food from the visible tray without removing conserved components', () => {
    const w = rootFrames().loaded;
    const food = w.stacks.find((s) => s.resource === 'crushed-root');
    if (!food) throw new Error('Missing loaded food.');
    food.decay = 1_000_000;
    const next = must(w, { interface: 'wait', args: {} });
    expect(next.stacks.some((s) => s.id === food.id)).toBe(false);
    expect(object(next).data.food).toBeNull();
    expect(
      next.stacks
        .filter((s) => s.reservedFor === object(next).id)
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(3);
  });
  it('records real water loss, decay savings, rewetting, idempotent ticks and recoverable unloaded food', () => {
    const { loaded, dry, wet } = rootFrames();
    const a = loaded.stacks.find((s) => s.resource === 'crushed-root'),
      b = dry.stacks.find((s) => s.resource === 'crushed-root'),
      c = wet.stacks.find((s) => s.resource === 'crushed-root');
    if (!a || !b || !c) throw new Error('Missing actual food.');
    expect(rootProcessing(dry, b)?.dry).toBe(true);
    expect(rootDecayRate(dry, b)).toBe(0.35);
    expect(rootProcessing(wet, c)?.dry).toBe(false);
    expect(rootDecayRate(wet, c)).toBe(1.25);
    const next = must(dry, { interface: 'wait', args: {} }),
      nextFood = next.stacks.find((s) => s.id === b.id);
    if (!nextFood) throw new Error('Missing next food.');
    const beforeRate = rootProcessing(dry, b),
      afterRate = rootProcessing(next, nextFood);
    if (!beforeRate || !afterRate) throw new Error('Missing decay ledger.');
    expect(afterRate.actualDecay - beforeRate.actualDecay).toBeCloseTo(
      0.35 * (afterRate.baselineDecay - beforeRate.baselineDecay),
      6,
    );

    expect(nutrition(dry)).toBe(nutrition(loaded));
    const p = rootProcessing(dry, b);
    if (!p) throw new Error('Missing processing.');
    expect(
      (b.physical?.unitMass ?? NaN) * b.quantity +
        p.evaporated -
        p.receivedWater,
    ).toBeCloseTo(0.4, 6);
    const snapshot = JSON.stringify(wet);
    rootWater(wet, c);
    expect(JSON.stringify(wet)).toBe(snapshot);
    const restored = v7Clone(JSON.parse(JSON.stringify(dry)) as V7World);
    const unloaded = must(restored, {
      interface: 'root-air-drying',
      args: {
        operation: 'unload',
        trayId: 'object:' + object(restored).id,
      },
    });
    const carried = unloaded.stacks.find((s) => s.resource === 'crushed-root');
    expect(carried?.owner).toBe('ash-1');
    expect(carried?.reservedFor).toBeUndefined();
    const dismantled = must(unloaded, {
      interface: 'root-air-drying',
      args: {
        operation: 'dismantle',
        trayId: 'object:' + object(unloaded).id,
      },
    });
    expect(dismantled.objects).toHaveLength(0);
    expect(dismantled.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
  });
  it('keeps A, history and fresh B without these approvals isolated, and requires individual mastery', () => {
    for (const [scope, arm] of [
      ['collective-ex11', 'A'],
      ['collective-next', 'B'],
    ] as const) {
      const w = initialCollectiveWorld(scope, arm);
      expect(
        continuousRegistry(w).packages.some((p) => p.id === 'root-air-drying'),
      ).toBe(false);
      expect(() =>
        v7Install(w, continuousRegistry(w), 'root-air-drying@1'),
      ).toThrow();
    }
    const fresh = initialCollectiveWorld('collective-ex12', 'B');
    expect(fresh.abilities.some((a) => a.id === 'root-air-drying')).toBe(false);
    const w = rootFixture();
    actor(w).mastered = actor(w).mastered.filter(
      (id) => !id.startsWith('root-'),
    );
    expect(rootStep(w, crush).outcomes['ash-1']?.success).toBe(false);
  });
});
