import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Observe,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Object,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 30_000 });

const id = 'cultivation-trial';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** A clear meadow position with no root plant within 5 m. */
const SITE = { x: 19.5, y: 5 };
/** Meadow positions next to the commons root cluster and on forest floor. */
const CROWDED = { x: 18.2, y: 12.4 };
const FOREST = { x: 12, y: 5 };

function step(w: V7World, actions: Record<string, V7Action> = {}) {
  const result = v7Step(
    w,
    Object.fromEntries(
      w.actors
        .filter((a) => a.vitals.health > 0)
        .map((a) => [a.id, actions[a.id] ?? WAIT]),
    ),
    continuousRegistry(w),
  );
  if (result.paused) throw new Error(result.paused);
  return { ...result, world: v7Clone(result.world) };
}
const actor = (w: V7World, name = 'wren'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === type);
const trial = (w: V7World): V7Object | undefined =>
  w.objects.find((o) => o.revision === `${id}@1` && o.data.trial);
const record = (w: V7World) =>
  trial(w)?.data.trial as Record<string, unknown> | undefined;
const job = (w: V7World) =>
  Object.entries(w.state).find(
    ([k, v]) =>
      k.startsWith('collective:work:') &&
      (v as { ability?: string }).ability === id,
  )?.[1] as { id: string; status: string; escrow: string[] } | undefined;
/** Every root unit held as a stack anywhere: carried, reserved, placed or on the ground. */
const roots = (w: V7World) =>
  w.stacks
    .filter((s) => s.resource === 'root')
    .reduce((n, s) => n + Math.round(s.quantity * 10), 0) / 10;
const establish = (unit: string, at = SITE): V7Action => ({
  interface: id,
  args: { mode: 'establish', inputStackId: unit, x: at.x, y: at.y },
});
const mode = (m: string, extra: Record<string, string> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...extra },
});
/** Keep everyone fed and rested so long runs isolate the trial from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}

/** Wren gathers three real roots from a commons root plant, studies, and stands by the site. */
function setup(study = true, at = SITE) {
  const genesis = initialLongWorld('long-ex15', 'long-culture');
  let w = v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
  actor(w).position = { x: 15.97, y: 10.6 };
  w = step(w, {
    wren: {
      interface: 'gather',
      args: { target: 'commons-root-5-1', quantity: 3 },
    },
  }).world;
  const unit = w.stacks.find(
    (s) => s.owner === 'wren' && s.resource === 'root',
  );
  if (!unit) throw new Error('Missing actually gathered fixture root.');
  if (study) {
    w = step(w, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    for (let i = 0; i < 4 && !actor(w).mastered.includes(id); i++)
      w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  }
  actor(w).position = { x: at.x, y: at.y + 0.7 };
  return { w: fed(w), unit: unit.id };
}
/** Three paid stages through the bound establish action. */
function planted() {
  const f = setup();
  let w = f.w;
  for (let i = 0; i < 3; i++) w = step(w, { wren: establish(f.unit) }).world;
  expect(record(w)?.lifecycle).toBe('planted');
  return { ...f, w };
}

describe('cultivation trial in ex15', () => {
  it('is scoped to ex15 and needs two rounds of personal study', () => {
    const ex14 = initialLongWorld('long-ex14', 'long-fixes');
    expect(
      continuousRegistry(ex14).packages.some((p) => p.id === id && p.scope),
    ).toBe(false);
    const f = setup(false);
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(2);
    const pkg = continuousRegistry(f.w).packages.find((p) => p.id === id);
    expect(
      JSON.stringify({ abilities: pkg?.abilities, events: pkg?.events }),
    ).not.toMatch(CULTURE_EXCLUDED_WORDS);
    const before = actor(f.w).vitals.energy;
    const refused = step(f.w, { wren: establish(f.unit) });
    expect(refused.outcomes.wren?.success).toBe(false);
    expect(actor(refused.world).vitals.energy).toBe(before);
    expect(trial(refused.world)).toBeUndefined();
    let w = step(f.w, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(actor(w).mastered).not.toContain(id);
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  });

  it('plants in three paid stages, moving the real unit out of the inventory without making food', () => {
    const f = setup();
    let w = f.w;
    const energy = actor(w).vitals.energy;
    const total = roots(w);
    w = step(w, { wren: establish(f.unit) }).world;
    expect(actor(w).vitals.energy).toBe(energy - 1);
    expect(events(w, 'cultivation-position-prepared')).toHaveLength(1);
    const reserved = w.stacks.find((s) => s.reservedFor === job(w)?.id);
    expect(reserved).toMatchObject({ owner: 'wren', quantity: 1 });
    expect(record(w)?.lifecycle).toBe('preparing');
    w = step(w, { wren: establish(f.unit) }).world;
    expect(events(w, 'cultivation-unit-placed')).toHaveLength(1);
    const o = trial(w);
    const placed = w.stacks.find((s) => s.reservedFor === o?.id);
    expect(placed).toMatchObject({
      owner: null,
      quantity: 1,
      origin: 'commons-root-5-1',
      position: SITE,
    });
    // The placed unit is neither carried nor edible.
    expect(
      step(w, {
        wren: { interface: 'eat', args: { target: placed?.id ?? '' } },
      }).outcomes.wren?.success,
    ).toBe(false);
    w = step(w, { wren: establish(f.unit) }).world;
    expect(actor(w).vitals.energy).toBe(energy - 3);
    expect(events(w, 'cultivation-planted')).toHaveLength(1);
    expect(job(w)?.status).toBe('completed');
    const plot = trial(w);
    expect(plot?.data).toMatchObject({
      resource: 'root',
      stock: 0,
      capacity: 4,
      interval: 8,
      stage: 'seedling',
      parent: 'commons-root-5-1',
      mode: 'planted',
    });
    expect(plot?.createdBy).toBeNull();
    expect(record(w)?.planter).toBe('wren');
    // Planting conserves the unit and creates no food.
    expect(roots(w)).toBe(total);
    expect(w.stacks.find((s) => s.id === f.unit)?.quantity).toBe(2);
    // Observers see the public plant fields only: no growth interval or dispersal schedule.
    const seen = v7Observe(w, 'wren').objects.find((x) => x.id === plot?.id);
    expect(seen?.data.mode).toBe('planted');
    expect(seen?.data.interval).toBeUndefined();
    expect(seen?.data.trial).toBeUndefined();
    // A second planting of the same unit is impossible: it now lies in the position.
    expect(
      step(w, { wren: establish(placed?.id ?? '', { x: 21, y: 5 }) }).outcomes
        .wren?.success,
    ).toBe(false);
  });

  it('establishes only through the existing ecology, absorbs the unit and regrows stock for gather', () => {
    let { w } = planted();
    const plot = trial(w);
    if (!plot) throw new Error('Missing trial.');
    // A natural seedling with the same data on the same ground grows under the same rule.
    const control: V7Object = {
      ...v7Clone(plot),
      id: 'control-seedling',
      kind: 'plant',
      revision: 'foundation-forest@1',
      spatial: { ...plot.spatial, x: 21, reserved: false },
      data: {
        resource: 'root',
        stock: 0,
        capacity: 4,
        interval: 8,
        stage: 'seedling',
        establishment: Number(plot.data.establishment),
        seedUnits: 1,
        nextDispersal: Number(plot.data.nextDispersal),
      },
    };
    w.objects.push(control);
    const total = roots(w);
    let inconclusive = false;
    for (let i = 0; i < 250 && record(w)?.lifecycle === 'planted'; i++) {
      w = fed(step(w).world);
      const t = trial(w),
        c = w.objects.find((o) => o.id === 'control-seedling');
      if (t?.data.stage === 'seedling')
        expect(t.data.establishment).toBe(c?.data.establishment);
      expect(Number(t?.data.stock)).toBe(0);
      if (record(w)?.observationStatus === 'inconclusive') inconclusive = true;
    }
    expect(record(w)?.lifecycle).toBe('established');
    expect(w.objects.find((o) => o.id === 'control-seedling')?.data.stage).toBe(
      'mature',
    );
    expect(events(w, 'cultivation-trial-established')).toHaveLength(1);
    expect(record(w)).toMatchObject({ absorbedUnits: 1, absorbedMass: 0.4 });
    expect(roots(w)).toBe(total - 1);
    // Under this seed establishment takes longer than the 80-round observation horizon,
    // which only reported an inconclusive status and changed nothing.
    expect(
      Number(record(w)?.establishedAt) - Number(record(w)?.plantedAt),
    ).toBeGreaterThan(80);
    expect(inconclusive).toBe(true);
    // An established plant is an ordinary source: it cannot be removed, only harvested.
    actor(w).position = { x: SITE.x, y: SITE.y + 0.7 };
    expect(
      step(w, { wren: mode('remove', { target: plot.id }) }).outcomes.wren
        ?.success,
    ).toBe(false);
    for (let i = 0; i < 300 && Number(trial(w)?.data.stock) < 1; i++) {
      w = fed(step(w).world);
      expect(Number(trial(w)?.data.stock)).toBeLessThanOrEqual(4);
    }
    expect(Number(trial(w)?.data.stock)).toBeGreaterThanOrEqual(1);
    actor(w).position = { x: SITE.x, y: SITE.y + 0.7 };
    const energy = actor(w).vitals.energy;
    const harvest = step(w, {
      wren: { interface: 'gather', args: { target: plot.id, quantity: 1 } },
    });
    expect(harvest.outcomes.wren?.success).toBe(true);
    expect(actor(harvest.world).vitals.energy).toBe(energy - 2);
    expect(events(harvest.world, 'cultivation-trial-harvested')).toHaveLength(
      1,
    );
    expect(
      harvest.world.stacks.some(
        (s) => s.owner === 'wren' && s.origin === plot.id,
      ),
    ).toBe(true);
    expect(record(harvest.world)?.harvested).toBe(1);
  }, 180_000);

  it('dies when the buried unit rots first, and only the planter clears it', () => {
    let { w } = planted();
    const plot = trial(w);
    const unit = w.stacks.find((s) => s.reservedFor === plot?.id);
    if (!plot || !unit) throw new Error('Missing planted unit.');
    unit.decay = 239.99;
    w = step(w).world;
    expect(events(w, 'cultivation-trial-died')).toHaveLength(1);
    expect(trial(w)?.data).toMatchObject({
      mode: 'dead',
      interval: 0,
      stage: 'dead',
    });
    const establishment = trial(w)?.data.establishment;
    for (let i = 0; i < 5; i++) w = step(w).world;
    expect(trial(w)?.data.establishment).toBe(establishment);
    actor(w, 'lin').position = { x: SITE.x + 0.75, y: SITE.y };
    const other = step(w, { lin: mode('remove', { target: plot.id }) });
    expect(other.outcomes.lin?.success).toBe(false);
    const energy = actor(w).vitals.energy;
    const cleared = step(w, { wren: mode('remove', { target: plot.id }) });
    expect(cleared.outcomes.wren?.success).toBe(true);
    expect(actor(cleared.world).vitals.energy).toBe(energy - 1);
    expect(trial(cleared.world)).toBeUndefined();
    expect(
      events(cleared.world, 'cultivation-trial-removed')[0]?.data.returned,
    ).toBeNull();
  });

  it('rejects unsuitable units and sites without spending anything', () => {
    const f = setup();
    // Compared with the same round spent waiting: nothing reserved, moved or paid.
    const unchanged = (w: V7World, action: V7Action) => {
      const result = step(w, { wren: action }),
        idle = step(w).world;
      expect(result.outcomes.wren?.success).toBe(false);
      expect(actor(result.world).vitals).toEqual(actor(idle).vitals);
      expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
      expect(trial(result.world)).toBeUndefined();
      return result.outcomes.wren?.reason ?? '';
    };
    // Forest floor is not hand-workable in the existing site rule.
    const forest = v7Clone(f.w);
    actor(forest).position = { x: FOREST.x, y: FOREST.y + 0.7 };
    expect(unchanged(forest, establish(f.unit, FOREST))).toMatch(
      /ordinary soil/,
    );
    // The existing crowding rule starts no root plant next to three others.
    const crowded = v7Clone(f.w);
    actor(crowded).position = { x: CROWDED.x, y: CROWDED.y + 0.7 };
    expect(unchanged(crowded, establish(f.unit, CROWDED))).toMatch(
      /within 5 m/,
    );
    // Out of reach, more than one unit, a spoiled or treated unit, or no energy.
    expect(unchanged(f.w, establish(f.unit, { x: 21, y: 5 }))).toMatch(/reach/);
    unchanged(f.w, {
      interface: id,
      args: { ...establish(f.unit).args, quantity: 2 },
    });
    const spoiled = v7Clone(f.w);
    const s = spoiled.stacks.find((s) => s.id === f.unit);
    if (s) s.decay = 240;
    expect(unchanged(spoiled, establish(f.unit))).toMatch(/spoiled/);
    const treated = v7Clone(f.w);
    const t = treated.stacks.find((s) => s.id === f.unit);
    if (t) t.processing = { dried: true };
    expect(unchanged(treated, establish(f.unit))).toMatch(/treated/);
    const tired = v7Clone(f.w);
    actor(tired).vitals.energy = 0.5;
    expect(unchanged(tired, establish(f.unit))).toMatch(/energy/);
    // A different source named as target, or a source-less unit, is refused.
    expect(
      unchanged(f.w, {
        interface: id,
        args: { ...establish(f.unit).args, target: 'forest-reed-0' },
      }),
    ).toMatch(/comes from/);
  });

  it('pauses, resumes and cancels without charging unperformed stages', () => {
    const f = setup();
    let w = step(f.w, { wren: establish(f.unit) }).world;
    w = step(w).world;
    expect(job(w)?.status).toBe('paused');
    expect(events(w, 'cultivation-work-paused')).toHaveLength(1);
    // Leaving reach pauses without spending.
    const away = v7Clone(w);
    actor(away).position = { x: SITE.x, y: SITE.y + 2 };
    const blocked = step(away, { wren: mode('resume') });
    expect(actor(blocked.world).vitals.energy).toBe(actor(away).vitals.energy);
    expect(events(blocked.world, 'cultivation-work-paused')).toHaveLength(1);
    // Cancelling before placement returns the unit once and clears the position.
    const early = step(w, { wren: mode('cancel') });
    expect(actor(early.world).vitals.energy).toBe(actor(w).vitals.energy);
    expect(trial(early.world)).toBeUndefined();
    expect(
      early.world.stacks
        .filter((s) => s.owner === 'wren' && s.resource === 'root')
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(3);
    expect(
      step(early.world, { wren: mode('cancel') }).outcomes.wren?.success,
    ).toBe(false);
    // Resume pays only the next stage; cancelling after placement leaves the unit uncovered.
    const energy = actor(w).vitals.energy;
    w = step(w, { wren: mode('resume') }).world;
    expect(events(w, 'cultivation-work-resumed')).toHaveLength(1);
    expect(actor(w).vitals.energy).toBe(energy - 1);
    w = step(w, { wren: mode('cancel') }).world;
    expect(actor(w).vitals.energy).toBe(energy - 1);
    expect(record(w)?.lifecycle).toBe('uncovered');
    for (let i = 0; i < 3; i++) w = step(w).world;
    expect(trial(w)?.data.interval).toBeUndefined();
    const unit = w.stacks.find((s) => s.reservedFor === trial(w)?.id);
    const plot = trial(w)?.id ?? '';
    const back = step(w, { wren: mode('remove', { target: plot }) }).world;
    const returned = back.stacks.find((s) => s.id === unit?.id);
    expect(returned).toMatchObject({ owner: 'wren', quantity: 1 });
    expect(returned?.reservedFor).toBeUndefined();
    expect(Number(returned?.decay)).toBeGreaterThan(
      Number(f.w.stacks.find((s) => s.id === f.unit)?.decay),
    );
    expect(roots(back)).toBe(roots(f.w));
  });

  it('observes trials and patches at the probe cost and refuses tending at no cost', () => {
    const { w } = planted();
    const plot = trial(w)?.id ?? '';
    const energy = actor(w).vitals.energy;
    const seen = step(w, { wren: mode('observe', { target: plot }) });
    expect(seen.outcomes.wren?.success).toBe(true);
    expect(energy - actor(seen.world).vitals.energy).toBeCloseTo(0.2, 6);
    const memory = actor(seen.world).memory.knowledge ?? {};
    expect(memory[`${plot}:trial-record`]).toMatchObject({ verified: false });
    expect(memory[`${plot}:observed-state`]).toBeDefined();
    expect(events(seen.world, 'cultivation-trial-observed')).toHaveLength(1);
    expect(events(seen.world, 'information-confirmed')).toHaveLength(0);
    expect(record(seen.world)?.observations).toHaveLength(1);
    const tend = step(w, { wren: mode('tend', { target: plot }) });
    expect(tend.outcomes.wren?.success).toBe(false);
    expect(actor(tend.world).vitals.energy).toBe(energy);
    // Monitoring an existing patch observes it without taking food or adding a plant.
    const patch = v7Clone(w);
    actor(patch).position = { x: 15.97, y: 10.6 };
    const before = patch.objects.find((o) => o.id === 'commons-root-5-1');
    const looked = step(patch, {
      wren: mode('observe', { target: 'commons-root-5-1' }),
    });
    expect(looked.outcomes.wren?.success).toBe(true);
    expect(events(looked.world, 'cultivation-patch-observed')).toHaveLength(1);
    expect(
      looked.world.objects.find((o) => o.id === 'commons-root-5-1')?.data.stock,
    ).toBe(before?.data.stock);
  });

  it('at death drops an unplaced unit where the person died and leaves a placed one in position', () => {
    const f = setup();
    let w = step(f.w, { wren: establish(f.unit) }).world;
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    const early = v7Clone(w);
    actor(early).position = { x: SITE.x + 1, y: SITE.y + 1 };
    pkg?.onDeath?.(early, actor(early));
    expect(job(early)?.status).toBe('stopped');
    expect(trial(early)).toBeUndefined();
    expect(
      early.stacks.find(
        (s) =>
          s.owner === null &&
          s.resource === 'root' &&
          s.position.x === SITE.x + 1 &&
          s.position.y === SITE.y + 1,
      )?.quantity,
    ).toBe(1);
    w = step(w, { wren: establish(f.unit) }).world;
    const late = v7Clone(w);
    pkg?.onDeath?.(late, actor(late));
    expect(record(late)?.lifecycle).toBe('uncovered');
    expect(events(late, 'cultivation-work-failed')).toHaveLength(1);
    expect(late.stacks.some((s) => s.reservedFor === trial(late)?.id)).toBe(
      true,
    );
  });
});
