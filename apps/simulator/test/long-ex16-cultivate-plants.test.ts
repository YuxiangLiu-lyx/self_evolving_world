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

const id = 'cultivate-plants';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** A clear meadow position with no root or berry plant within 5 m. */
const SITE = { x: 19.5, y: 5 };
/** A meadow position next to the commons root cluster, and one on forest floor. */
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
const plot = (w: V7World): V7Object | undefined =>
  w.objects.find((o) => o.revision === `${id}@1` && o.data.plot);
const record = (w: V7World) =>
  plot(w)?.data.plot as Record<string, unknown> | undefined;
const job = (w: V7World) =>
  Object.entries(w.state).find(
    ([k, v]) =>
      k.startsWith('collective:work:') &&
      (v as { ability?: string }).ability === id,
  )?.[1] as { id: string; status: string; escrow: string[] } | undefined;
/** Every unit of a food held as a stack anywhere: carried, reserved, planted or on the ground. */
const units = (w: V7World, resource = 'root') =>
  w.stacks
    .filter((s) => s.resource === resource)
    .reduce((n, s) => n + Math.round(s.quantity * 10), 0) / 10;
const plant = (unit: string, at = SITE): V7Action => ({
  interface: id,
  args: { mode: 'plant', inputStackId: unit, x: at.x, y: at.y },
});
const mode = (m: string, extra: Record<string, string> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...extra },
});
/** Keep everyone fed and rested so long runs isolate the plot from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
function installed() {
  const genesis = initialLongWorld('long-ex16', 'long-culture-v2');
  return v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
}

/** Wren gathers three real units from a commons plant, studies, and stands by the site. */
function setup(study = true, source = 'commons-root-5-1') {
  let w = installed();
  const from = w.objects.find((o) => o.id === source);
  if (!from) throw new Error('Missing fixture source.');
  actor(w).position = { x: from.spatial.x, y: from.spatial.y + 0.63 };
  w = step(w, {
    wren: { interface: 'gather', args: { target: source, quantity: 3 } },
  }).world;
  const unit = w.stacks.find((s) => s.owner === 'wren' && s.origin === source);
  if (!unit) throw new Error('Missing actually gathered fixture unit.');
  if (study) {
    w = step(w, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    for (let i = 0; i < 4 && !actor(w).mastered.includes(id); i++)
      w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  }
  actor(w).position = { x: SITE.x, y: SITE.y + 0.7 };
  return { w: fed(w), unit: unit.id };
}
/** Two paid rounds through the bound plant action. */
function planted() {
  const f = setup();
  let w = f.w;
  for (let i = 0; i < 2; i++) w = step(w, { wren: plant(f.unit) }).world;
  expect(record(w)?.lifecycle).toBe('planted');
  return { ...f, w };
}

describe('cultivate plants in ex16', () => {
  it('is scoped to ex16, fits the frozen text limit and needs three rounds of personal study', () => {
    const ex15 = initialLongWorld('long-ex15', 'long-culture');
    expect(continuousRegistry(ex15).packages.some((p) => p.id === id)).toBe(
      false,
    );
    const f = setup(false);
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(3);
    const limit = f.w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const pkg = continuousRegistry(f.w).packages.find((p) => p.id === id);
    for (const a of pkg?.abilities ?? [])
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(limit);
    expect(
      JSON.stringify({ abilities: pkg?.abilities, events: pkg?.events }),
    ).not.toMatch(CULTURE_EXCLUDED_WORDS);
    const before = actor(f.w).vitals.energy;
    const refused = step(f.w, { wren: plant(f.unit) });
    expect(refused.outcomes.wren?.success).toBe(false);
    expect(actor(refused.world).vitals.energy).toBe(before);
    expect(plot(refused.world)).toBeUndefined();
    let w = step(f.w, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    w = step(w).world;
    expect(actor(w).mastered).not.toContain(id);
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  });

  it('plants in two paid rounds of 1.5 energy, moving the real unit into the soil without making food', () => {
    const f = setup();
    let w = f.w;
    const energy = actor(w).vitals.energy;
    const total = units(w);
    w = step(w, { wren: plant(f.unit) }).world;
    expect(actor(w).vitals.energy).toBe(energy - 1.5);
    expect(events(w, 'cultivation-site-prepared')).toHaveLength(1);
    expect(events(w, 'cultivation-propagule-planted')).toHaveLength(0);
    const reserved = w.stacks.find((s) => s.reservedFor === job(w)?.id);
    expect(reserved).toMatchObject({ owner: 'wren', quantity: 1 });
    expect(record(w)).toMatchObject({ lifecycle: 'preparing', stages: 1 });
    expect(plot(w)?.data.interval).toBeUndefined();
    w = step(w, { wren: plant(f.unit) }).world;
    expect(actor(w).vitals.energy).toBe(energy - 3);
    const planting = events(w, 'cultivation-propagule-planted');
    expect(planting).toHaveLength(1);
    // The planting event carries reusable metadata and no milestone qualification.
    expect(planting[0]?.data).toMatchObject({
      x: SITE.x,
      y: SITE.y,
      species: 'root',
      lifecycle: 'planted',
      stage: 'seedling',
      completedRounds: 2,
    });
    expect(planting[0]?.data.qualified).toBeUndefined();
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(job(w)?.status).toBe('completed');
    const o = plot(w);
    const placed = w.stacks.find((s) => s.reservedFor === o?.id);
    expect(placed).toMatchObject({
      owner: null,
      quantity: 1,
      origin: 'commons-root-5-1',
      position: SITE,
    });
    expect(o?.data).toMatchObject({
      resource: 'root',
      stock: 0,
      capacity: 4,
      interval: 8,
      stage: 'seedling',
      parent: 'commons-root-5-1',
      mode: 'planted',
    });
    expect(o?.createdBy).toBeNull();
    expect(record(w)).toMatchObject({
      planter: 'wren',
      item: f.unit,
      lot: placed?.id,
      quantity: 1,
    });
    // The food condition at transfer is kept; the unit keeps ageing in the soil.
    expect(record(w)?.transferDecay).toBe(reserved?.decay);
    expect(Number(record(w)?.transferDecay)).toBeLessThan(
      Number(placed?.decay),
    );
    // The planted unit is neither carried nor edible, and planting conserves it and creates no food.
    expect(
      step(w, {
        wren: { interface: 'eat', args: { target: placed?.id ?? '' } },
      }).outcomes.wren?.success,
    ).toBe(false);
    expect(units(w)).toBe(total);
    expect(w.stacks.find((s) => s.id === f.unit)?.quantity).toBe(2);
    // Observers see the public plant fields only: no growth interval, schedule or record.
    const seen = v7Observe(w, 'wren').objects.find((x) => x.id === o?.id);
    expect(seen?.data.mode).toBe('planted');
    expect(seen?.data.interval).toBeUndefined();
    expect(seen?.data.plot).toBeUndefined();
    expect(seen?.visual.state).not.toBe('ready');
  });

  it('establishes only through the existing ecology, absorbs the unit and grows stock for gather', () => {
    let { w } = planted();
    const o = plot(w);
    if (!o) throw new Error('Missing plot.');
    // A natural seedling with the same data on the same ground grows under the same rule.
    const control: V7Object = {
      ...v7Clone(o),
      id: 'control-seedling',
      kind: 'plant',
      revision: 'foundation-forest@1',
      spatial: { ...o.spatial, x: 21, reserved: false },
      data: {
        resource: 'root',
        stock: 0,
        capacity: 4,
        interval: 8,
        stage: 'seedling',
        establishment: Number(o.data.establishment),
        seedUnits: 1,
        nextDispersal: Number(o.data.nextDispersal),
      },
    };
    w.objects.push(control);
    const total = units(w);
    for (let i = 0; i < 250 && record(w)?.lifecycle === 'planted'; i++) {
      w = fed(step(w).world);
      const t = plot(w),
        c = w.objects.find((x) => x.id === 'control-seedling');
      if (t?.data.stage === 'seedling')
        expect(t.data.establishment).toBe(c?.data.establishment);
      expect(Number(t?.data.stock)).toBe(0);
    }
    expect(record(w)?.lifecycle).toBe('established');
    expect(w.objects.find((x) => x.id === 'control-seedling')?.data.stage).toBe(
      'mature',
    );
    expect(events(w, 'cultivation-plot-established')).toHaveLength(1);
    expect(record(w)).toMatchObject({ absorbedUnits: 1, absorbedMass: 0.4 });
    // The unit became the plant: it left the food stocks and no food appeared.
    expect(units(w)).toBe(total - 1);
    expect(events(w, 'cultivation-crop-matured')).toHaveLength(0);
    for (let i = 0; i < 300 && Number(plot(w)?.data.stock) < 1; i++) {
      w = fed(step(w).world);
      expect(Number(plot(w)?.data.stock)).toBeLessThanOrEqual(4);
    }
    expect(Number(plot(w)?.data.stock)).toBeGreaterThanOrEqual(1);
    expect(events(w, 'cultivation-crop-matured')).toHaveLength(1);
    // Anyone harvests the real stock with gather at gather's own cost.
    actor(w, 'lin').position = { x: SITE.x + 0.75, y: SITE.y };
    const energy = actor(w, 'lin').vitals.energy;
    const harvest = step(w, {
      lin: { interface: 'gather', args: { target: o.id, quantity: 1 } },
    });
    expect(harvest.outcomes.lin?.success).toBe(true);
    expect(actor(harvest.world, 'lin').vitals.energy).toBe(energy - 2);
    expect(
      harvest.world.stacks.some((s) => s.owner === 'lin' && s.origin === o.id),
    ).toBe(true);
    expect(Number(plot(harvest.world)?.data.stock)).toBe(
      Number(plot(w)?.data.stock) - 1,
    );
  }, 180_000);

  it('fails when the buried unit rots first and stops growing', () => {
    let { w } = planted();
    const o = plot(w);
    const unit = w.stacks.find((s) => s.reservedFor === o?.id);
    if (!o || !unit) throw new Error('Missing planted unit.');
    unit.decay = 239.99;
    w = step(w).world;
    expect(events(w, 'cultivation-trial-failed')).toHaveLength(1);
    expect(plot(w)?.data).toMatchObject({
      mode: 'dead',
      interval: 0,
      stage: 'dead',
      stock: 0,
    });
    // A failed plot is no longer a plant source of its food.
    expect(plot(w)?.data.resource).toBeUndefined();
    const establishment = plot(w)?.data.establishment;
    for (let i = 0; i < 5; i++) w = step(w).world;
    expect(plot(w)?.data.establishment).toBe(establishment);
    expect(plot(w)?.visual.label).toBe('Failed plot');
  });

  it('rejects unsuitable units, sites and treatments without spending anything', () => {
    const f = setup();
    // Compared with the same round spent waiting: nothing reserved, moved or paid.
    const unchanged = (w: V7World, action: V7Action) => {
      const result = step(w, { wren: action }),
        idle = step(w).world;
      expect(result.outcomes.wren?.success).toBe(false);
      expect(actor(result.world).vitals).toEqual(actor(idle).vitals);
      expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
      expect(plot(result.world)).toBeUndefined();
      return result.outcomes.wren?.reason ?? '';
    };
    // Forest floor is not hand-workable in the existing site rule.
    const forest = v7Clone(f.w);
    actor(forest).position = { x: FOREST.x, y: FOREST.y + 0.7 };
    expect(unchanged(forest, plant(f.unit, FOREST))).toMatch(/ordinary soil/);
    // The existing crowding rule starts no root plant next to three others.
    const crowded = v7Clone(f.w);
    actor(crowded).position = { x: CROWDED.x, y: CROWDED.y + 0.7 };
    expect(unchanged(crowded, plant(f.unit, CROWDED))).toMatch(/within 5 m/);
    // Out of reach, more than one unit, a spoiled or treated unit, or too little energy.
    expect(unchanged(f.w, plant(f.unit, { x: 21, y: 5 }))).toMatch(/reach/);
    unchanged(f.w, {
      interface: id,
      args: { ...plant(f.unit).args, quantity: 2 },
    });
    const spoiled = v7Clone(f.w);
    const s = spoiled.stacks.find((s) => s.id === f.unit);
    if (s) s.decay = 240;
    expect(unchanged(spoiled, plant(f.unit))).toMatch(/spoiled/);
    const treated = v7Clone(f.w);
    const t = treated.stacks.find((s) => s.id === f.unit);
    if (t) t.processing = { dried: true };
    expect(unchanged(treated, plant(f.unit))).toMatch(/treated/);
    const tired = v7Clone(f.w);
    actor(tired).vitals.energy = 1.4;
    expect(unchanged(tired, plant(f.unit))).toMatch(/energy/);
    // A unit whose origin is not a living plant of the same food is no established propagule.
    const foreign = v7Clone(f.w);
    const u = foreign.stacks.find((s) => s.id === f.unit);
    if (u) u.origin = 'forest-acorn-0';
    expect(unchanged(foreign, plant(f.unit))).toMatch(/living plant/);
    // Tending has no supported input or effect; ending needs unfinished work.
    expect(unchanged(f.w, mode('tend'))).toMatch(/No tending treatment/);
    expect(unchanged(f.w, mode('end'))).toMatch(/No unfinished planting/);
    // Inspection needs a plot or plant source within reach.
    const far = v7Clone(f.w);
    actor(far).position = { x: 15.97, y: 11.6 };
    expect(
      unchanged(far, mode('inspect', { target: 'commons-root-5-1' })),
    ).toMatch(/reach/);
  });

  it('pauses, resumes and ends without charging unperformed rounds, and only for its own planter', () => {
    const f = setup();
    let w = step(f.w, { wren: plant(f.unit) }).world;
    w = step(w).world;
    expect(job(w)?.status).toBe('paused');
    expect(events(w, 'cultivation-work-paused')).toHaveLength(1);
    expect(record(w)).toMatchObject({ lifecycle: 'preparing', stages: 1 });
    // Another person can neither continue nor end Wren's work.
    actor(w, 'lin').position = { x: SITE.x + 0.75, y: SITE.y };
    const other = step(w, { lin: mode('end') });
    expect(other.outcomes.lin?.success).toBe(false);
    expect(job(other.world)?.status).toBe('paused');
    // Leaving reach pauses without spending.
    const away = v7Clone(w);
    actor(away).position = { x: SITE.x, y: SITE.y + 2 };
    const blocked = step(away, { wren: plant(f.unit) });
    expect(actor(blocked.world).vitals.energy).toBe(actor(away).vitals.energy);
    expect(events(blocked.world, 'cultivation-work-paused')).toHaveLength(1);
    expect(record(blocked.world)?.stages).toBe(1);
    // Ending before transfer returns the unit once and clears the empty site.
    const early = step(w, { wren: mode('end') });
    expect(actor(early.world).vitals.energy).toBe(actor(w).vitals.energy);
    expect(events(early.world, 'cultivation-trial-ended')).toHaveLength(1);
    expect(plot(early.world)).toBeUndefined();
    expect(
      early.world.stacks
        .filter((s) => s.owner === 'wren' && s.resource === 'root')
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(3);
    expect(units(early.world)).toBe(units(f.w));
    expect(
      step(early.world, { wren: mode('end') }).outcomes.wren?.success,
    ).toBe(false);
    // Resuming pays only the remaining round, after which the unit stays planted.
    const energy = actor(w).vitals.energy;
    w = step(w, { wren: plant(f.unit) }).world;
    expect(events(w, 'cultivation-work-resumed')).toHaveLength(1);
    expect(events(w, 'cultivation-propagule-planted')).toHaveLength(1);
    expect(actor(w).vitals.energy).toBe(energy - 1.5);
    expect(record(w)?.lifecycle).toBe('planted');
    const after = step(w, { wren: mode('end') });
    expect(after.outcomes.wren?.success).toBe(false);
    expect(
      after.world.stacks.some((s) => s.reservedFor === plot(after.world)?.id),
    ).toBe(true);
  });

  it('inspects plots and plant sources at the probe cost with unverified records', () => {
    const { w } = planted();
    const id_ = plot(w)?.id ?? '';
    const energy = actor(w).vitals.energy;
    const seen = step(w, { wren: mode('inspect', { target: id_ }) });
    expect(seen.outcomes.wren?.success).toBe(true);
    expect(energy - actor(seen.world).vitals.energy).toBeCloseTo(0.2, 6);
    const memory = actor(seen.world).memory.knowledge ?? {};
    expect(memory[`${id_}:plot-record`]).toMatchObject({ verified: false });
    expect(memory[`${id_}:observed-state`]).toBeDefined();
    const observed = events(seen.world, 'cultivation-condition-observed');
    expect(observed).toHaveLength(1);
    expect(observed[0]?.data).toMatchObject({ scope: 'plot', plot: id_ });
    expect(events(seen.world, 'information-confirmed')).toHaveLength(0);
    expect(record(seen.world)?.observations).toHaveLength(1);
    // Inspecting an existing plant source takes no food and adds no plant.
    const patch = v7Clone(w);
    actor(patch).position = { x: 15.97, y: 10.6 };
    const before = patch.objects.find((o) => o.id === 'commons-root-5-1');
    const looked = step(patch, {
      wren: mode('inspect', { target: 'commons-root-5-1' }),
    });
    expect(looked.outcomes.wren?.success).toBe(true);
    expect(
      events(looked.world, 'cultivation-condition-observed')[0]?.data.scope,
    ).toBe('plant source');
    expect(
      looked.world.objects.find((o) => o.id === 'commons-root-5-1')?.data.stock,
    ).toBe(before?.data.stock);
    expect(looked.world.objects.length).toBe(patch.objects.length);
  });

  it('plants other foods from living plants under the same law', () => {
    const f = setup(true, 'commons-berry-0-0');
    let w = f.w;
    const total = units(w, 'berry');
    for (let i = 0; i < 2; i++) w = step(w, { wren: plant(f.unit) }).world;
    expect(plot(w)?.data).toMatchObject({
      resource: 'berry',
      stage: 'seedling',
      parent: 'commons-berry-0-0',
      stock: 0,
    });
    expect(units(w, 'berry')).toBe(total);
  });

  it('treats a plant dispersed from a plot as an ordinary plant without a plot record', () => {
    let { w } = planted();
    const o = plot(w);
    if (!o) throw new Error('Missing plot.');
    // The existing dispersal law clones its parent and replaces only the plant data.
    const child: V7Object = {
      ...v7Clone(o),
      id: 'dispersed-child',
      name: 'Meadow roots',
      spatial: { ...o.spatial, x: 21 },
      data: {
        resource: 'root',
        stock: 0,
        capacity: 4,
        interval: 8,
        stage: 'seedling',
        establishment: 0,
        seedUnits: 1,
        parent: o.id,
        nextDispersal: w.tick + 600,
      },
    };
    w.objects.push(child);
    w = step(w).world;
    const after = w.objects.find((x) => x.id === 'dispersed-child');
    expect(after?.visual.label).toBe('Meadow roots');
    expect(after?.data.plot).toBeUndefined();
    expect(plot(w)?.id).toBe(o.id);
  });

  it('at death before transfer leaves the unit where the person died', () => {
    const f = setup();
    const w = step(f.w, { wren: plant(f.unit) }).world;
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    const dead = v7Clone(w);
    actor(dead).position = { x: SITE.x + 1, y: SITE.y + 1 };
    pkg?.onDeath?.(dead, actor(dead));
    expect(job(dead)?.status).toBe('stopped');
    expect(plot(dead)).toBeUndefined();
    expect(events(dead, 'cultivation-trial-failed')).toHaveLength(1);
    expect(
      dead.stacks.find(
        (s) =>
          s.owner === null &&
          s.resource === 'root' &&
          !s.reservedFor &&
          s.position.x === SITE.x + 1 &&
          s.position.y === SITE.y + 1,
      )?.quantity,
    ).toBe(1);
    expect(units(dead)).toBe(units(w));
  });
});
