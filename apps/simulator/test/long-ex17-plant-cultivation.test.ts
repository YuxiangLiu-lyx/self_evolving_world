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
  V7Event,
  V7Object,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 30_000 });

const id = 'plant-cultivation';
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
const observation = (e: V7Event | undefined) =>
  e?.data.observation as Record<string, unknown> | undefined;
const plot = (w: V7World): V7Object | undefined =>
  w.objects.find((o) => o.revision === `${id}@1` && o.data.plot);
const record = (w: V7World) =>
  plot(w)?.data.plot as Record<string, unknown> | undefined;
const ledger = (w: V7World) =>
  plot(w)?.data.ledger as Record<string, number> | undefined;
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
const mode = (
  m: string,
  extra: Record<string, string | number> = {},
): V7Action => ({ interface: id, args: { mode: m, ...extra } });
/** Keep everyone fed and rested so long runs isolate the plot from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
function installed() {
  const genesis = initialLongWorld('long-ex17', 'long-culture-v3');
  return v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
}

/** Wren gathers three real units from a commons plant; Wren and Lin study; Wren stands by the site. */
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
    const learn: V7Action = { interface: 'learn', args: { ability: id } };
    w = step(w, { wren: learn, lin: learn }).world;
    for (let i = 0; i < 4 && !actor(w).mastered.includes(id); i++)
      w = step(w).world;
    expect(actor(w).mastered).toContain(id);
    expect(actor(w, 'lin').mastered).toContain(id);
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
/** The action fails and changes no vitals or stacks compared with the same round spent waiting. */
function unchanged(w: V7World, action: V7Action, who = 'wren') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(result.world.objects.length).toBe(idle.objects.length);
  return result.outcomes[who]?.reason ?? '';
}

describe('plant cultivation in ex17', () => {
  it('is scoped to ex17, keeps ex16 apart, fits the frozen text limit and needs three rounds of study', () => {
    const ex16 = initialLongWorld('long-ex16', 'long-culture-v2');
    expect(continuousRegistry(ex16).packages.some((p) => p.id === id)).toBe(
      false,
    );
    expect(
      continuousRegistry(ex16).packages.some(
        (p) => p.id === 'cultivate-plants',
      ),
    ).toBe(true);
    // All packages together still register: handler ids stay unique.
    const all = continuousRegistry();
    expect(all.handlers['long.plant-cultivation']).toBeDefined();
    expect(all.handlers['long.cultivate-plants']).toBeDefined();
    const f = setup(false);
    expect(
      continuousRegistry(f.w).packages.some((p) => p.id === 'cultivate-plants'),
    ).toBe(false);
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(3);
    expect(ability?.parameters.properties?.mode).toMatchObject({
      enum: ['inspect', 'plant', 'tend', 'inspect-progress', 'abandon'],
    });
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

  it('plants in two paid rounds of 1 energy, moving the real unit into the soil without making food', () => {
    const f = setup();
    let w = f.w;
    const energy = actor(w).vitals.energy;
    const total = units(w);
    w = step(w, { wren: plant(f.unit) }).world;
    expect(actor(w).vitals.energy).toBe(energy - 1);
    expect(events(w, 'cultivation-site-prepared')).toHaveLength(1);
    expect(events(w, 'cultivation-propagule-planted')).toHaveLength(0);
    const reserved = w.stacks.find((s) => s.reservedFor === job(w)?.id);
    expect(reserved).toMatchObject({ owner: 'wren', quantity: 1 });
    expect(record(w)).toMatchObject({ lifecycle: 'preparing', stages: 1 });
    expect(plot(w)?.data.interval).toBeUndefined();
    expect(ledger(w)).toBeUndefined();
    w = step(w, { wren: plant(f.unit) }).world;
    expect(actor(w).vitals.energy).toBe(energy - 2);
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
      paidEnergy: 2,
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
    expect(record(w)).toMatchObject({
      planter: 'wren',
      item: f.unit,
      lot: placed?.id,
      quantity: 1,
    });
    // The ledger starts with the placement round already accounted and nothing produced.
    expect(ledger(w)).toMatchObject({
      rounds: 1,
      unitsProduced: 0,
      unitsRemoved: 0,
      stock: 0,
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
    // Observers see the public plant fields only: no interval, ledger or record.
    const seen = v7Observe(w, 'wren').objects.find((x) => x.id === o?.id);
    expect(seen?.data.mode).toBe('planted');
    expect(seen?.data.interval).toBeUndefined();
    expect(seen?.data.plot).toBeUndefined();
    expect(seen?.data.ledger).toBeUndefined();
    expect(seen?.visual.state).not.toBe('ready');
    // Event metadata carries no ledger either.
    expect(JSON.stringify(planting[0]?.data)).not.toMatch(/ledger/);
  });

  it('roots only through the existing ecology, keeps a production ledger and grows stock for gather', () => {
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
      expect(ledger(w)?.establishment).toBeCloseTo(
        Number(t?.data.establishment),
        6,
      );
    }
    expect(record(w)?.lifecycle).toBe('established');
    expect(events(w, 'cultivation-plot-established')).toHaveLength(1);
    expect(record(w)).toMatchObject({ absorbedUnits: 1, absorbedMass: 0.4 });
    // The unit became the plant: it left the food stocks and no food appeared.
    expect(units(w)).toBe(total - 1);
    const l = ledger(w);
    expect(l?.establishment).toBeGreaterThanOrEqual(12);
    expect(l?.qualifyingRounds).toBeGreaterThan(0);
    // Darkness and cold give no growth, so not every round qualifies.
    expect(l?.qualifyingRounds).toBeLessThan(Number(l?.rounds));
    // The first progress look reports the visible change from the covered state.
    const look = step(w, { wren: mode('inspect-progress', { target: o.id }) });
    expect(look.outcomes.wren?.success).toBe(true);
    const first = observation(
      events(look.world, 'cultivation-condition-observed').at(-1),
    );
    expect(first?.result).toBe('changed');
    expect(first?.changes).toEqual(
      expect.arrayContaining([
        { field: 'lifecycle', before: 'planted', after: 'established' },
        { field: 'sprouted', before: false, after: true },
      ]),
    );
    expect(first?.window).toMatchObject({
      rounds: 20,
      endsAt: Number(record(w)?.plantedAt) + 20,
    });
    w = fed(look.world);
    for (let i = 0; i < 300 && Number(plot(w)?.data.stock) < 1; i++) {
      w = fed(step(w).world);
      expect(Number(plot(w)?.data.stock)).toBeLessThanOrEqual(4);
      // Stock is exactly what the growth rule produced minus what left.
      expect(Number(plot(w)?.data.stock)).toBe(
        Number(ledger(w)?.unitsProduced) - Number(ledger(w)?.unitsRemoved),
      );
    }
    expect(Number(plot(w)?.data.stock)).toBeGreaterThanOrEqual(1);
    expect(ledger(w)?.unitsProduced).toBeGreaterThanOrEqual(1);
    expect(ledger(w)?.growth).toBeGreaterThanOrEqual(8);
    expect(events(w, 'cultivation-crop-matured')).toHaveLength(1);
    // Anyone harvests the real stock with gather at gather's own cost; the ledger records it.
    actor(w, 'lin').position = { x: SITE.x + 0.75, y: SITE.y };
    const energy = actor(w, 'lin').vitals.energy;
    const removed = Number(ledger(w)?.unitsRemoved);
    const harvest = step(w, {
      lin: { interface: 'gather', args: { target: o.id, quantity: 1 } },
    });
    expect(harvest.outcomes.lin?.success).toBe(true);
    expect(actor(harvest.world, 'lin').vitals.energy).toBe(energy - 2);
    expect(
      harvest.world.stacks.some((s) => s.owner === 'lin' && s.origin === o.id),
    ).toBe(true);
    expect(ledger(harvest.world)?.unitsRemoved).toBe(removed + 1);
    expect(Number(plot(harvest.world)?.data.stock)).toBe(
      Number(ledger(harvest.world)?.unitsProduced) -
        Number(ledger(harvest.world)?.unitsRemoved),
    );
    // The plant itself stays and keeps regrowing.
    expect(plot(harvest.world)?.data.interval).toBe(8);
  }, 180_000);

  it('fails when the buried unit rots first, and a progress look reports that change', () => {
    let { w } = planted();
    const o = plot(w);
    const unit = w.stacks.find((s) => s.reservedFor === o?.id);
    if (!o || !unit) throw new Error('Missing planted unit.');
    // Right after placement nothing visible has changed: the look is inconclusive.
    const energy = actor(w).vitals.energy;
    const early = step(w, { wren: mode('inspect-progress', { target: o.id }) });
    expect(energy - actor(early.world).vitals.energy).toBeCloseTo(0.2, 6);
    const seen = observation(
      events(early.world, 'cultivation-condition-observed').at(-1),
    );
    expect(seen).toMatchObject({ result: 'inconclusive', changes: [] });
    expect(seen?.window).toMatchObject({
      rounds: 20,
      endsAt: Number(record(w)?.plantedAt) + 20,
      open: true,
      nextCheck: 5,
    });
    const memory = actor(early.world).memory.knowledge ?? {};
    expect(memory[`${o.id}:plot-record`]).toMatchObject({ verified: false });
    w = fed(early.world);
    const buried = w.stacks.find((s) => s.id === unit.id);
    if (buried) buried.decay = 239.99;
    w = step(w).world;
    expect(events(w, 'cultivation-trial-failed')).toHaveLength(1);
    expect(plot(w)?.data).toMatchObject({
      mode: 'dead',
      interval: 0,
      stage: 'dead',
      stock: 0,
    });
    expect(plot(w)?.data.resource).toBeUndefined();
    const rounds = ledger(w)?.rounds;
    for (let i = 0; i < 3; i++) w = step(w).world;
    // A dead plot accounts no further rounds.
    expect(ledger(w)?.rounds).toBe(rounds);
    const late = step(w, { wren: mode('inspect-progress', { target: o.id }) });
    const dead = observation(
      events(late.world, 'cultivation-condition-observed').at(-1),
    );
    expect(dead?.result).toBe('changed');
    expect(dead?.changes).toEqual(
      expect.arrayContaining([
        { field: 'lifecycle', before: 'planted', after: 'dead' },
      ]),
    );
    // Nothing living remains to tend.
    expect(unchanged(w, mode('tend', { target: o.id }))).toMatch(
      /planted or sprouted/,
    );
  });

  it('rejects unsuitable units, sites and requests without spending anything', () => {
    const f = setup();
    const none = (w: V7World, action: V7Action) => {
      const reason = unchanged(w, action);
      return reason;
    };
    const forest = v7Clone(f.w);
    actor(forest).position = { x: FOREST.x, y: FOREST.y + 0.7 };
    expect(none(forest, plant(f.unit, FOREST))).toMatch(/ordinary soil/);
    const crowded = v7Clone(f.w);
    actor(crowded).position = { x: CROWDED.x, y: CROWDED.y + 0.7 };
    expect(none(crowded, plant(f.unit, CROWDED))).toMatch(/within 5 m/);
    expect(none(f.w, plant(f.unit, { x: 21, y: 5 }))).toMatch(/reach/);
    none(f.w, { interface: id, args: { ...plant(f.unit).args, quantity: 2 } });
    const spoiled = v7Clone(f.w);
    const s = spoiled.stacks.find((s) => s.id === f.unit);
    if (s) s.decay = 240;
    expect(none(spoiled, plant(f.unit))).toMatch(/spoiled/);
    const treated = v7Clone(f.w);
    const t = treated.stacks.find((s) => s.id === f.unit);
    if (t) t.processing = { dried: true };
    expect(none(treated, plant(f.unit))).toMatch(/treated/);
    const tired = v7Clone(f.w);
    actor(tired).vitals.energy = 0.9;
    expect(none(tired, plant(f.unit))).toMatch(/1 energy/);
    const foreign = v7Clone(f.w);
    const u = foreign.stacks.find((s) => s.id === f.unit);
    if (u) u.origin = 'forest-acorn-0';
    expect(none(foreign, plant(f.unit))).toMatch(/living plant/);
    // Tending and progress looks need a plot; abandoning needs unfinished work.
    expect(none(f.w, mode('tend'))).toMatch(/target/);
    expect(none(f.w, mode('abandon'))).toMatch(/No unfinished planting/);
    const patch = v7Clone(f.w);
    actor(patch).position = { x: 15.97, y: 10.6 };
    expect(
      none(patch, mode('inspect-progress', { target: 'commons-root-5-1' })),
    ).toMatch(/targets a plot/);
    expect(none(patch, mode('tend', { target: 'commons-root-5-1' }))).toMatch(
      /targets a plot/,
    );
    const far = v7Clone(f.w);
    actor(far).position = { x: 15.97, y: 11.6 };
    expect(none(far, mode('inspect', { target: 'commons-root-5-1' }))).toMatch(
      /reach/,
    );
    // A site check needs the site within reach.
    expect(
      none(f.w, mode('inspect', { inputStackId: f.unit, x: 21, y: 5 })),
    ).toMatch(/reach/);
    // A preparing plot cannot be tended.
    const started = step(f.w, { wren: plant(f.unit) }).world;
    expect(
      none(started, mode('tend', { target: plot(started)?.id ?? '' })),
    ).toMatch(/planted or sprouted/);
  });

  it('inspects a unit and a site at the observation cost without consuming or reserving anything', () => {
    const f = setup();
    const look = (w: V7World, extra: Record<string, string | number>) => {
      const energy = actor(w).vitals.energy;
      const result = step(w, { wren: mode('inspect', extra) }),
        idle = step(w).world;
      expect(result.outcomes.wren?.success).toBe(true);
      expect(energy - actor(result.world).vitals.energy).toBeCloseTo(0.2, 6);
      // The stacks change exactly as in a round spent waiting.
      expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
      expect(plot(result.world)).toBeUndefined();
      expect(events(result.world, 'information-confirmed')).toHaveLength(0);
      const e = events(result.world, 'cultivation-condition-observed').at(-1);
      expect(e?.data.scope).toBe('unit');
      return { seen: observation(e), world: result.world };
    };
    const { seen, world } = look(f.w, { inputStackId: f.unit });
    expect(seen).toMatchObject({
      resource: 'root',
      quantity: 3,
      origin: 'commons-root-5-1',
      treated: [],
      buds: 'not represented',
      viability: 'unknown',
      plantable: true,
      reason: null,
      site: null,
    });
    expect(Number(seen?.condition)).toBeGreaterThan(0.9);
    expect(Number(seen?.condition)).toBeLessThanOrEqual(1);
    expect(
      actor(world).memory.knowledge?.[`${f.unit}:planting-unit`],
    ).toMatchObject({ verified: false });
    // A site the unit can take, and one where the existing crowding rule refuses it.
    expect(
      look(f.w, { inputStackId: f.unit, ...SITE }).seen?.site,
    ).toMatchObject({
      x: SITE.x,
      y: SITE.y,
      ground: '.',
      plantable: true,
      reason: null,
    });
    const crowded = v7Clone(f.w);
    actor(crowded).position = { x: CROWDED.x, y: CROWDED.y + 0.7 };
    const there = look(crowded, { inputStackId: f.unit, ...CROWDED }).seen
      ?.site as Record<string, unknown> | undefined;
    expect(there?.plantable).toBe(false);
    expect(String(there?.reason)).toMatch(/within 5 m/);
    // A demonstrably unsuitable unit is explained, not consumed.
    const treated = v7Clone(f.w);
    const t = treated.stacks.find((s) => s.id === f.unit);
    if (t) t.processing = { dried: true };
    const bad = look(treated, { inputStackId: f.unit }).seen;
    expect(bad).toMatchObject({ plantable: false, treated: ['processing'] });
    expect(String(bad?.reason)).toMatch(/treated/);
    expect(String(bad?.reason)).not.toMatch(/Nothing was reserved/);
  });

  it('tends at 0.5 energy without changing growth, open to any learner, and removes nothing', () => {
    let { w } = planted();
    const o = plot(w);
    if (!o) throw new Error('Missing plot.');
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
    const energy = actor(w).vitals.energy;
    const tended = step(w, { wren: mode('tend', { target: o.id }) });
    expect(tended.outcomes.wren?.success).toBe(true);
    expect(energy - actor(tended.world).vitals.energy).toBeCloseTo(0.5, 6);
    const care = events(tended.world, 'cultivation-plot-tended');
    expect(care).toHaveLength(1);
    expect(care[0]?.data).toMatchObject({
      plot: o.id,
      competingPlants: [],
      removed: 0,
      energy: 0.5,
    });
    expect(observation(care[0])).toMatchObject({ lifecycle: 'planted' });
    // Lin studied too and may tend Wren's plot; tending adds no growth.
    w = tended.world;
    actor(w, 'lin').position = { x: SITE.x + 0.75, y: SITE.y };
    for (let i = 0; i < 3; i++) {
      const r = step(w, { lin: mode('tend', { target: o.id }) });
      expect(r.outcomes.lin?.success).toBe(true);
      expect(events(r.world, 'cultivation-plot-tended')[0]?.actor).toBe('lin');
      w = fed(r.world);
      expect(plot(w)?.data.establishment).toBe(
        w.objects.find((x) => x.id === 'control-seedling')?.data.establishment,
      );
    }
    // An untrained person cannot tend.
    actor(w, 'sol').position = { x: SITE.x - 0.75, y: SITE.y };
    expect(
      unchanged(w, mode('tend', { target: o.id }), 'sol').length,
    ).toBeGreaterThan(0);
    // A plant standing inside the clearance is reported and left in place.
    const near: V7Object = {
      ...v7Clone(control),
      id: 'near-seedling',
      spatial: { ...control.spatial, x: SITE.x + 0.4, y: SITE.y },
    };
    w.objects.push(near);
    const checked = step(w, { wren: mode('tend', { target: o.id }) });
    expect(
      events(checked.world, 'cultivation-plot-tended').at(-1)?.data,
    ).toMatchObject({ competingPlants: ['near-seedling'], removed: 0 });
    expect(checked.world.objects.some((x) => x.id === 'near-seedling')).toBe(
      true,
    );
  });

  it('pauses, resumes and abandons without charging unperformed rounds, and only for its own planter', () => {
    const f = setup();
    let w = step(f.w, { wren: plant(f.unit) }).world;
    w = step(w).world;
    expect(job(w)?.status).toBe('paused');
    expect(events(w, 'cultivation-work-paused')).toHaveLength(1);
    expect(record(w)).toMatchObject({ lifecycle: 'preparing', stages: 1 });
    // Lin studied but can neither continue nor abandon Wren's work.
    actor(w, 'lin').position = { x: SITE.x + 0.75, y: SITE.y };
    const other = step(w, { lin: mode('abandon') });
    expect(other.outcomes.lin?.success).toBe(false);
    expect(job(other.world)?.status).toBe('paused');
    // Leaving reach pauses without spending.
    const away = v7Clone(w);
    actor(away).position = { x: SITE.x, y: SITE.y + 2 };
    const blocked = step(away, { wren: plant(f.unit) });
    expect(actor(blocked.world).vitals.energy).toBe(actor(away).vitals.energy);
    expect(events(blocked.world, 'cultivation-work-paused')).toHaveLength(1);
    expect(record(blocked.world)?.stages).toBe(1);
    // Abandoning before placement returns the unit once and clears the empty site.
    const early = step(w, { wren: mode('abandon') });
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
      step(early.world, { wren: mode('abandon') }).outcomes.wren?.success,
    ).toBe(false);
    // Resuming pays only the remaining round, after which the unit stays planted.
    const energy = actor(w).vitals.energy;
    w = step(w, { wren: plant(f.unit) }).world;
    expect(events(w, 'cultivation-work-resumed')).toHaveLength(1);
    expect(events(w, 'cultivation-propagule-planted')).toHaveLength(1);
    expect(actor(w).vitals.energy).toBe(energy - 1);
    expect(record(w)?.lifecycle).toBe('planted');
    // Abandoning after placement refunds nothing and leaves the bed and unit in place.
    expect(unchanged(w, mode('abandon'))).toMatch(/stays in its plot/);
    expect(w.stacks.some((s) => s.reservedFor === plot(w)?.id)).toBe(true);
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

  it('at death before placement leaves the unit where the person died', () => {
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
