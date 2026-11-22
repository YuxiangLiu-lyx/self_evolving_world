import { describe, it, expect } from 'vitest';
import {
  personalInventoryResult,
  personalInventoryHistory,
  continuousRegistry,
  v7Install,
  v7Clone,
  v7Observe,
} from '@self-evolving-world/world-core';
import { collectiveInput } from '../src/collective-input.js';
import { initialCollectiveWorld } from '../src/collective-scenario.js';
import { rootStep } from './fixtures/collective-roots.js';
import {
  inventoryId,
  inventoryFixture,
  inventoryAction,
  inventoryMust,
  inventoryFrames,
} from './fixtures/collective-inventory.js';
function present<T>(x: T | undefined): T {
  if (x === undefined) throw new Error('Missing fixture value.');
  return x;
}
const result = (w: ReturnType<typeof inventoryFixture>) =>
  personalInventoryResult(w, present(w.actors[0]));
describe('private complete inventory pages with no material or knowledge grants', () => {
  it('enumerates all carried identities in stable bounded pages, preserves stock and charges a real round without rewards', () => {
    const f = inventoryFrames(),
      page = result(f.first);
    expect(page).toMatchObject({
      page: 0,
      pageSize: 8,
      totalItems: 20,
      totalPages: 3,
      hasNext: true,
      hasPrevious: false,
      remainingWork: 0,
      revisionChanged: false,
      costs: { energy: 0.2, rounds: 1 },
    });
    expect(page?.items).toHaveLength(8);
    expect(f.first.stacks).toEqual(
      f.initial.stacks.map((s) => ({ ...s, quantityTenths: s.quantity * 10 })),
    );
    expect(
      f.first.actors[0]?.wellbeing.sources.filter((s) => s.value > 0),
    ).toEqual([]);
    expect(
      f.first.events.some((e) =>
        ['information-confirmed', 'practice-confirmed'].includes(e.type),
      ),
    ).toBe(false);
    const third = inventoryMust(f.second, inventoryAction({ page: 2 }));
    const pages = [result(f.first), result(f.second), result(third)];
    const ids = pages.flatMap((p) =>
      Array.isArray(p?.items)
        ? p.items.map((x) =>
            x && typeof x === 'object' && !Array.isArray(x) ? x.id : null,
          )
        : [],
    );
    expect(new Set(ids).size).toBe(20);
    expect(ids).not.toContain('actual-ground');
    expect(ids).not.toContain('another-person-private');
  });
  it('flags changed holdings between reads and preserves prior execution-time results after later transfers and restoration', () => {
    const f = inventoryFrames();
    expect(result(f.second)?.inventoryRevision).toBe(
      result(f.first)?.inventoryRevision,
    );
    expect(result(f.changed)).toMatchObject({
      revisionChanged: true,
      totalItems: 19,
    });
    expect(result(f.dropped)).toEqual(result(f.second));
    const history = personalInventoryHistory(
      f.changed,
      present(f.changed.actors[0]),
    );
    expect(history[0]).toEqual(result(f.first));
    expect(result(v7Clone(f.changed))).toEqual(result(f.changed));
  });
  it('uses exact owned identity without aliases or disclosing whether an unavailable item exists elsewhere', () => {
    const w = inventoryFixture();
    for (const itemId of [
      'resource:stone',
      'stone',
      'item: actual-ground',
      'actual-ground',
      'another-person-private',
      'never-existed',
    ]) {
      const out = result(
        inventoryMust(w, inventoryAction({ mode: 'item', itemId })),
      );
      expect(out?.items).toEqual([]);
      expect(out?.unavailable).toBe(true);
    }
    expect(
      result(
        inventoryMust(
          w,
          inventoryAction({ mode: 'item', itemId: 'item:owned-17' }),
        ),
      )?.items,
    ).toHaveLength(1);
  });
  it('keeps the whole selected page outside the default truncating summary and out of other members/public coordination', () => {
    const w = inventoryFrames().second,
      a = present(w.actors[0]),
      r = result(w);
    const own = JSON.stringify(
      collectiveInput(w, 'ash', [a.id], {}, 'individual', 120),
    );
    expect(own).toContain('inspectedInventory');
    expect(own).toContain(JSON.stringify(r));
    const other = JSON.stringify(
        collectiveInput(w, 'ash', ['ash-2'], {}, 'individual', 120),
      ),
      public_ = JSON.stringify(
        collectiveInput(w, 'ash', [], {}, 'coordination', 120),
      );
    expect(other).not.toContain('inventory-inspected');
    expect(other).not.toContain('owned-06');
    expect(other).not.toContain('ash-1:inventory:1');
    expect(public_).not.toContain('ash-1:inventory:1');
    expect(public_).not.toContain('inspectedInventory');
    expect(
      v7Observe(w, 'ash-2').events.some(
        (e) => e.type === 'inventory-inspected',
      ),
    ).toBe(false);
    expect(JSON.stringify(r)).not.toContain('concealedTestProperty');
    expect(JSON.stringify(r)).not.toContain('physical');
  });
  it('requires personal learning and sufficient energy, does not inspect after death, and cannot register in another experiment', () => {
    const w = inventoryFixture();
    present(w.actors[0]).mastered = present(w.actors[0]).mastered.filter(
      (id) => id !== inventoryId,
    );
    expect(rootStep(w, inventoryAction()).outcomes['ash-1']?.success).toBe(
      false,
    );
    const tired = inventoryFixture();
    present(tired.actors[0]).vitals.energy = 0;
    const failed = rootStep(tired, inventoryAction());
    expect(failed.outcomes['ash-1']?.success).toBe(false);
    expect(result(failed.world)).toBeNull();
    const dead = inventoryFixture();
    present(dead.actors[0]).vitals.health = 0;
    expect(
      rootStep(dead, inventoryAction()).world.events.some(
        (e) => e.type === 'inventory-inspected',
      ),
    ).toBe(false);
    const a = initialCollectiveWorld('collective-ex11', 'A');
    expect(() =>
      v7Install(a, continuousRegistry(a), inventoryId + '@1'),
    ).toThrow();
  });
});
