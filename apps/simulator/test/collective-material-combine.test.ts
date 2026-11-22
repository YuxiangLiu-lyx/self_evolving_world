import { describe, it, expect } from 'vitest';
import {
  collectiveJobs,
  v7Clone,
  v7Install,
  continuousRegistry,
} from '@self-evolving-world/world-core';
import { initialCollectiveWorld } from '../src/collective-scenario.js';
import { rootStep } from './fixtures/collective-roots.js';
import {
  combineId,
  combineFixture,
  combineAction,
  combineMust,
  combineFrames,
} from './fixtures/collective-material-combine.js';
function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing required fixture value.');
  return value;
}
const bark = (w: ReturnType<typeof combineFixture>) =>
  w.stacks.filter((s) => s.resource === 'bark');
describe('reviewed passive supply combination: fixture evidence only', () => {
  it('conserves two real fractional profiles, source histories and load with exactly one paid round and no reward', () => {
    const f = combineFrames(),
      output = bark(f.combined)[0];
    expect(output?.quantityTenths).toBe(14);
    expect(
      output?.componentLots?.map((s) => [
        s.id,
        s.quantityTenths,
        s.origin,
        s.harvestedAt,
        s.decay,
      ]),
    ).toEqual([
      ['fixture-bark-0', 7, 'actual-fixture-source-0', 0, 0],
      ['fixture-bark-1', 7, 'actual-fixture-source-1', 1, 1],
    ]);
    expect(collectiveJobs(f.combined, combineId).at(-1)).toMatchObject({
      status: 'completed',
      initialWork: 1,
      remainingWork: 0,
      paidEnergy: 0.5,
    });
    expect(
      f.combined.actors[0]?.wellbeing.sources.filter((s) => s.value > 0),
    ).toEqual([]);
    expect(
      f.combined.objects.filter((o) => o.kind === 'root-drying-tray'),
    ).toHaveLength(0);
    expect(
      f.combined.events.some(
        (e) =>
          e.type === 'material-combine-started' && e.data.remainingWork === 1,
      ),
    ).toBe(true);
    expect(
      f.combined.events.some(
        (e) =>
          e.type === 'material-combine-completed' && e.data.remainingWork === 0,
      ),
    ).toBe(true);
  });
  it('reserves exactly ten tenths for real tray work, leaves four tenths and releases the same actual slices after cancellation', () => {
    const f = combineFrames();
    for (const w of [f.reserved, f.tray, f.cancelled]) {
      expect(bark(w).reduce((n, s) => n + present(s.quantityTenths), 0)).toBe(
        14,
      );
      const left = bark(w).find((s) => s.owner === 'ash-1');
      expect(left?.quantityTenths).toBe(4);
      expect(left?.componentLots?.map((s) => [s.id, s.quantityTenths])).toEqual(
        [['fixture-bark-1', 4]],
      );
      const allocated = bark(w).find((s) => s.owner === null);
      expect(
        allocated?.componentLots?.map((s) => [s.id, s.quantityTenths]),
      ).toEqual([
        ['fixture-bark-0', 7],
        ['fixture-bark-1', 3],
      ]);
    }
    expect(
      f.tray.objects.find((o) => o.kind === 'root-drying-tray')?.visual.state,
    ).toBe('ready');
    expect(f.cancelled.objects.some((o) => o.kind === 'root-drying-tray')).toBe(
      false,
    );
  });
  it('supports exact partial physical transfer, pickup and nested recombination without cloning component slices', () => {
    let w = combineFrames().combined;
    const id = present(bark(w)[0]).id;
    w = combineMust(w, {
      interface: 'drop',
      args: { target: id, quantity: 1 },
    });
    expect(
      bark(w)
        .map((s) => s.quantityTenths)
        .sort(),
    ).toEqual([4, 10].sort());
    const ground = present(bark(w).find((s) => s.owner === null));
    w = combineMust(w, {
      interface: 'pickup',
      args: { target: ground.id, quantity: 1 },
    });
    w = combineMust(
      w,
      combineAction('combine', { sourceIds: bark(w).map((s) => s.id) }),
    );
    expect(bark(w)).toHaveLength(1);
    expect(bark(w)[0]?.quantityTenths).toBe(14);
    expect(bark(w)[0]?.componentLots?.every((s) => !s.componentLots)).toBe(
      true,
    );
    const totals: Record<string, number> = {};
    for (const s of bark(w)[0]?.componentLots ?? [])
      totals[s.id] = (totals[s.id] ?? 0) + present(s.quantityTenths);
    expect(totals).toEqual({ 'fixture-bark-0': 7, 'fixture-bark-1': 7 });
  });
  it('rejects stale, foreign, locked, duplicate and incompatible actual sources before material or energy changes', () => {
    for (const mutate of [
      (w: ReturnType<typeof combineFixture>) => {
        present(bark(w)[1]).owner = 'ash-2';
      },
      (w: ReturnType<typeof combineFixture>) => {
        present(bark(w)[1]).reservedFor = 'another-real-job';
      },
      (w: ReturnType<typeof combineFixture>) => {
        present(present(bark(w)[1]).physical).unitMass += 0.1;
      },
      (w: ReturnType<typeof combineFixture>) => {
        present(bark(w)[1]).resource = 'bark-fines';
      },
    ]) {
      const w = combineFixture();
      mutate(w);
      const r = rootStep(w, combineAction());
      expect(r.outcomes['ash-1']?.success).toBe(false);
      expect(bark(r.world).reduce((n, s) => n + s.quantity, 0)).toBeCloseTo(
        bark(w).reduce((n, s) => n + s.quantity, 0),
      );
      expect(collectiveJobs(r.world, combineId)).toHaveLength(0);
    }
    for (const args of [
      { sourceIds: ['fixture-bark-0', 'fixture-bark-0'] },
      {
        expectedVersions: {
          'fixture-bark-0': 'stale',
          'fixture-bark-1': 'stale',
        },
      },
    ])
      expect(
        rootStep(combineFixture(), combineAction('combine', args)).outcomes[
          'ash-1'
        ]?.success,
      ).toBe(false);
  });
  it('ages original components independently and removes only the spoiled fraction, including while reserved', () => {
    let w = combineFrames().reserved;
    // A controlled perishable-material law tests accounting, not a formal environment retune.
    for (const s of bark(w))
      for (const lot of s.componentLots ?? []) {
        const p = lot.processing?.barkProfile as {
          properties: { decay: number };
        };
        p.properties.decay = 100;
        lot.decay = lot.id === 'fixture-bark-0' ? 100 : 0;
      }
    w = combineMust(w, { interface: 'wait', args: {} });
    expect(bark(w).reduce((n, s) => n + present(s.quantityTenths), 0)).toBe(7);
    expect(
      bark(w)
        .flatMap((s) => s.componentLots ?? [])
        .every((s) => s.id === 'fixture-bark-1' && (s.decay ?? 0) > 0),
    ).toBe(true);
  });
  it('preserves exact checkpoint state, rejects use without study, and keeps another experiment registry fresh', () => {
    const f = combineFrames(),
      restored = v7Clone(f.combined);
    expect(combineMust(restored, { interface: 'wait', args: {} })).toEqual(
      combineMust(f.combined, { interface: 'wait', args: {} }),
    );
    const novice = combineFixture();
    present(novice.actors[0]).mastered = present(
      novice.actors[0],
    ).mastered.filter((x) => x !== combineId);
    expect(rootStep(novice, combineAction()).outcomes['ash-1']?.success).toBe(
      false,
    );
    const a = initialCollectiveWorld('collective-ex11', 'A');
    expect(() =>
      v7Install(a, continuousRegistry(a), combineId + '@1'),
    ).toThrow();
    expect(
      rootStep(f.combined, combineAction()).outcomes['ash-1']?.success,
    ).toBe(false);
  });
  it('cancels an interrupted escrow once without replacement or refunds and preserves paid history', () => {
    const w = combineFixture(),
      ids = bark(w).map((s) => s.id),
      j = {
        id: 'fixture-prepared-transaction',
        owner: 'ash-1',
        ability: combineId,
        mode: 'combine',
        status: 'active',
        initialWork: 1,
        completedWork: 0,
        remainingWork: 1,
        paidEnergy: 0,
        escrow: ids,
        sources: [],
        x: 10,
        y: 10,
        target: null,
        outputs: [],
        lastPaid: -1,
      };
    w.state['collective:work:' + j.id] = j;
    for (const s of bark(w)) s.reservedFor = j.id;
    const stopped = combineMust(
      w,
      combineAction('cancel', { processId: j.id }),
    );
    const dying = v7Clone(w),
      performer = present(dying.actors[0]);
    performer.vitals.health = 0.1;
    performer.vitals.satiety = 0;
    const dead = combineMust(dying, { interface: 'wait', args: {} });
    expect(collectiveJobs(dead, combineId).at(-1)?.status).toBe('stopped');
    expect(bark(dead).map((s) => s.id)).toEqual(ids);
    expect(bark(dead).every((s) => s.owner === null && !s.reservedFor)).toBe(
      true,
    );
    expect(bark(stopped).map((s) => s.id)).toEqual(ids);
    expect(bark(stopped).every((s) => !s.reservedFor)).toBe(true);
    expect(
      rootStep(stopped, combineAction('cancel', { processId: j.id })).outcomes[
        'ash-1'
      ]?.success,
    ).toBe(false);
  });
});
