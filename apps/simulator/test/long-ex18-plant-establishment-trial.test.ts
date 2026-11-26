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

const id = 'plant-establishment-trial';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** Wren's actual ex18 source: the starting meadow-root plant, gathered down to stock 0. */
const SOURCE = 'start-0-roots';
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
const view = (w: V7World) =>
  plot(w)?.data.view as Record<string, unknown> | undefined;
const ledger = (w: V7World) =>
  plot(w)?.data.ledger as Record<string, number> | undefined;
const job = (w: V7World) =>
  Object.entries(w.state).find(
    ([k, v]) =>
      k.startsWith('collective:work:') &&
      (v as { ability?: string }).ability === id,
  )?.[1] as
    | { id: string; status: string; escrow: string[]; paidEnergy: number }
    | undefined;
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
  const genesis = initialLongWorld('long-ex18', 'long-culture-v2-incentives');
  return v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
}

/** Wren gathers all six real roots of the starting plant (its stock becomes 0, as observed in
 * ex18); Wren and Lin study; Wren stands by the site. */
function setup(study = true, source = SOURCE, quantity = 6) {
  let w = installed();
  const from = w.objects.find((o) => o.id === source);
  if (!from) throw new Error('Missing fixture source.');
  actor(w).position = { x: from.spatial.x, y: from.spatial.y + 0.63 };
  w = step(w, {
    wren: { interface: 'gather', args: { target: source, quantity } },
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
/** Loosen and place: the unit lies uncovered in the plot. */
function placed() {
  const f = setup();
  let w = f.w;
  for (let i = 0; i < 2; i++) w = step(w, { wren: plant(f.unit) }).world;
  expect(record(w)?.lifecycle).toBe('placed');
  return { ...f, w };
}
/** Three paid rounds through the bound plant action. */
function planted() {
  const f = placed();
  const w = step(f.w, { wren: plant(f.unit) }).world;
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
/** A natural seedling with the plot's data on the same ground, as the existing law makes it. */
function control(o: V7Object): V7Object {
  return {
    ...v7Clone(o),
    id: 'control-seedling',
    kind: 'plant',
    revision: 'foundation-forest@1',
    spatial: { ...o.spatial, x: 21, reserved: false },
    data: {
      resource: 'root',
      stock: 0,
      capacity: 4,
      interval: 18,
      stage: 'seedling',
      establishment: Number(o.data.establishment),
      seedUnits: 1,
      nextDispersal: Number(o.data.nextDispersal),
    },
  };
}

describe('plant establishment trial in ex18', () => {
  it('is scoped to ex18, keeps ex16 and ex17 apart, fits the frozen text limit and needs three rounds of study', () => {
    for (const [scope, scenario, other] of [
      ['long-ex16', 'long-culture-v2', 'cultivate-plants'],
      ['long-ex17', 'long-culture-v3', 'plant-cultivation'],
    ] as const) {
      const packages = continuousRegistry(
        initialLongWorld(scope, scenario),
      ).packages.map((p) => p.id);
      expect(packages).not.toContain(id);
      expect(packages).toContain(other);
    }
    // All packages together still register: handler ids stay unique.
    const all = continuousRegistry();
    expect(all.handlers['long.plant-establishment-trial']).toBeDefined();
    expect(all.handlers['long.plant-cultivation']).toBeDefined();
    expect(all.handlers['long.cultivate-plants']).toBeDefined();
    const f = setup(false);
    const packages = continuousRegistry(f.w).packages.map((p) => p.id);
    expect(packages).not.toContain('cultivate-plants');
    expect(packages).not.toContain('plant-cultivation');
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(3);
    expect(ability?.parameters.properties?.mode).toMatchObject({
      enum: ['inspect', 'plant', 'inspect-progress', 'maintain', 'cancel'],
    });
    const limit = f.w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    const pkg = continuousRegistry(f.w).packages.find((p) => p.id === id);
    expect(pkg?.abilities).toHaveLength(1);
    for (const a of pkg?.abilities ?? [])
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(limit);
    expect(
      JSON.stringify({ abilities: pkg?.abilities, events: pkg?.events }),
    ).not.toMatch(CULTURE_EXCLUDED_WORDS);
    // The drawing exists in the viewer already; no satisfaction source is added.
    expect(pkg?.visualComponents).toEqual(['cultivation-trial']);
    expect(pkg?.satisfaction).toEqual([]);
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

  it('plants an owned root from a plant at stock 0 in three paid rounds: loosen, place, cover', () => {
    const f = setup();
    let w = f.w;
    // The starting plant has no stock left but is living, so its gathered roots are propagules.
    expect(w.objects.find((o) => o.id === SOURCE)?.data).toMatchObject({
      stock: 0,
      interval: 18,
    });
    expect(w.stacks.find((s) => s.id === f.unit)?.quantity).toBe(6);
    const energy = actor(w).vitals.energy;
    const total = units(w);
    // Loosen: the unit is reserved but still carried and owned.
    w = step(w, { wren: plant(f.unit) }).world;
    expect(actor(w).vitals.energy).toBe(energy - 1);
    expect(events(w, 'cultivation-site-prepared')).toHaveLength(1);
    const reserved = w.stacks.find((s) => s.reservedFor === job(w)?.id);
    expect(reserved).toMatchObject({ owner: 'wren', quantity: 1 });
    expect(w.stacks.find((s) => s.id === f.unit)?.quantity).toBe(5);
    expect(record(w)).toMatchObject({
      lifecycle: 'preparing',
      stages: 1,
      placedAt: null,
      lot: null,
    });
    expect(plot(w)?.data.interval).toBeUndefined();
    // Place: the unit leaves the inventory into the open plot, which is not yet a seedling.
    w = step(w, { wren: plant(f.unit) }).world;
    expect(actor(w).vitals.energy).toBe(energy - 2);
    const placing = events(w, 'cultivation-unit-placed');
    expect(placing).toHaveLength(1);
    const o = plot(w);
    const unit = w.stacks.find((s) => s.reservedFor === o?.id);
    expect(unit).toMatchObject({
      id: reserved?.id,
      owner: null,
      quantity: 1,
      origin: SOURCE,
      position: SITE,
    });
    expect(record(w)).toMatchObject({
      lifecycle: 'placed',
      stages: 2,
      lot: reserved?.id,
      placedAt: w.tick,
      plantedAt: null,
      transferDecay: reserved?.decay,
    });
    expect(job(w)?.status).toBe('active');
    expect(o?.data.interval).toBeUndefined();
    expect(o?.data.stage).toBeUndefined();
    expect(o?.data.ledger).toBeUndefined();
    expect(view(w)).toMatchObject({
      lifecycle: 'placed',
      unitVisible: true,
      stagesCompleted: 2,
      stages: 3,
      sprouted: false,
    });
    expect(placing[0]?.data).toMatchObject({
      x: SITE.x,
      y: SITE.y,
      species: 'root',
      lifecycle: 'placed',
      completedRounds: 2,
      remaining: 1,
    });
    expect(
      step(w, {
        wren: { interface: 'eat', args: { target: unit?.id ?? '' } },
      }).outcomes.wren?.success,
    ).toBe(false);
    // Cover: planting completes; the plot becomes a seedling exactly like a dispersed one.
    w = step(w, { wren: plant(f.unit) }).world;
    expect(actor(w).vitals.energy).toBe(energy - 3);
    const planting = events(w, 'cultivation-propagule-planted');
    expect(planting).toHaveLength(1);
    expect(planting[0]?.description).toMatch(/not establishment/);
    expect(planting[0]?.data).toMatchObject({
      lifecycle: 'planted',
      stage: 'seedling',
      completedRounds: 3,
      paidEnergy: 3,
    });
    // Planting earns no milestone and creates no food.
    expect(planting[0]?.data.qualified).toBeUndefined();
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(job(w)?.status).toBe('completed');
    expect(plot(w)?.data).toMatchObject({
      resource: 'root',
      stock: 0,
      capacity: 4,
      interval: 18,
      stage: 'seedling',
      parent: SOURCE,
      mode: 'planted',
    });
    expect(record(w)).toMatchObject({
      planter: 'wren',
      item: f.unit,
      lot: reserved?.id,
      quantity: 1,
    });
    expect(Number(record(w)?.plantedAt)).toBe(Number(record(w)?.placedAt) + 1);
    expect(view(w)).toMatchObject({ unitVisible: false, lifecycle: 'planted' });
    expect(ledger(w)).toMatchObject({
      rounds: 1,
      unitsProduced: 0,
      unitsRemoved: 0,
      stock: 0,
    });
    expect(units(w)).toBe(total);
    expect(w.stacks.find((s) => s.id === f.unit)?.quantity).toBe(5);
    // Observers see public plant fields only: no interval, ledger or record.
    const seen = v7Observe(w, 'lin').objects.find((x) => x.id === o?.id);
    if (seen) {
      expect(seen.data.interval).toBeUndefined();
      expect(seen.data.plot).toBeUndefined();
      expect(seen.data.ledger).toBeUndefined();
    }
    const own = v7Observe(w, 'wren').objects.find((x) => x.id === o?.id);
    expect(own?.data.mode).toBe('planted');
    expect(own?.data.plot).toBeUndefined();
    expect(JSON.stringify(planting[0]?.data)).not.toMatch(/ledger/);
  });

  it('roots only through the existing ecology, keeps a production ledger and grows stock for gather', () => {
    let { w } = planted();
    const o = plot(w);
    if (!o) throw new Error('Missing plot.');
    w.objects.push(control(o));
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
    expect(events(w, 'cultivation-plot-established')).toHaveLength(1);
    expect(record(w)).toMatchObject({ absorbedUnits: 1, absorbedMass: 0.4 });
    // The unit became the plant: it left the food stocks and no food appeared.
    expect(units(w)).toBe(total - 1);
    expect(ledger(w)?.establishment).toBeGreaterThanOrEqual(12);
    expect(ledger(w)?.qualifyingRounds).toBeGreaterThan(0);
    const look = step(w, { wren: mode('inspect-progress', { target: o.id }) });
    expect(look.outcomes.wren?.success).toBe(true);
    const first = observation(
      events(look.world, 'cultivation-condition-observed').at(-1),
    );
    expect(first?.result).toBe('changed');
    expect(first?.changes).toEqual(
      expect.arrayContaining([
        { field: 'lifecycle', before: 'planted', after: 'established' },
      ]),
    );
    expect(first?.window).toMatchObject({
      rounds: 120,
      endsAt: Number(record(w)?.plantedAt) + 120,
    });
    w = fed(look.world);
    for (let i = 0; i < 400 && Number(plot(w)?.data.stock) < 1; i++) {
      w = fed(step(w).world);
      expect(Number(plot(w)?.data.stock)).toBe(
        Number(ledger(w)?.unitsProduced) - Number(ledger(w)?.unitsRemoved),
      );
    }
    expect(Number(plot(w)?.data.stock)).toBeGreaterThanOrEqual(1);
    expect(ledger(w)?.growth).toBeGreaterThanOrEqual(18);
    expect(events(w, 'cultivation-crop-matured')).toHaveLength(1);
    // Harvest is the unchanged gather at its own cost; the plant stays and the ledger records it.
    actor(w, 'lin').position = { x: SITE.x + 0.75, y: SITE.y };
    const energy = actor(w, 'lin').vitals.energy;
    const harvest = step(w, {
      lin: { interface: 'gather', args: { target: o.id, quantity: 1 } },
    });
    expect(harvest.outcomes.lin?.success).toBe(true);
    expect(actor(harvest.world, 'lin').vitals.energy).toBe(energy - 2);
    expect(ledger(harvest.world)?.unitsRemoved).toBe(1);
    expect(plot(harvest.world)?.data.interval).toBe(18);
  }, 180_000);

  it('fails when the buried unit rots first, and a progress look reports that change', () => {
    let { w } = planted();
    const o = plot(w);
    const unit = w.stacks.find((s) => s.reservedFor === o?.id);
    if (!o || !unit) throw new Error('Missing planted unit.');
    const energy = actor(w).vitals.energy;
    const early = step(w, { wren: mode('inspect-progress', { target: o.id }) });
    expect(energy - actor(early.world).vitals.energy).toBeCloseTo(0.2, 6);
    const seen = observation(
      events(early.world, 'cultivation-condition-observed').at(-1),
    );
    expect(seen).toMatchObject({ result: 'inconclusive', changes: [] });
    expect(seen?.window).toMatchObject({
      rounds: 120,
      open: true,
      nextCheck: 10,
    });
    expect(
      actor(early.world).memory.knowledge?.[`${o.id}:plot-record`],
    ).toMatchObject({ verified: false });
    expect(events(early.world, 'information-confirmed')).toHaveLength(0);
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
    expect(record(w)?.cause).toBe(
      'The planted unit decayed before establishing.',
    );
    const late = step(w, { wren: mode('inspect-progress', { target: o.id }) });
    const dead = observation(
      events(late.world, 'cultivation-condition-observed').at(-1),
    );
    expect(dead?.changes).toEqual(
      expect.arrayContaining([
        { field: 'lifecycle', before: 'planted', after: 'dead' },
      ]),
    );
  });

  it('refuses maintenance and every unsuitable unit, site or request without spending anything', () => {
    const f = setup();
    const forest = v7Clone(f.w);
    actor(forest).position = { x: FOREST.x, y: FOREST.y + 0.7 };
    expect(unchanged(forest, plant(f.unit, FOREST))).toMatch(/ordinary soil/);
    const crowded = v7Clone(f.w);
    actor(crowded).position = { x: CROWDED.x, y: CROWDED.y + 0.7 };
    expect(unchanged(crowded, plant(f.unit, CROWDED))).toMatch(/within 5 m/);
    expect(unchanged(f.w, plant(f.unit, { x: 21, y: 5 }))).toMatch(/reach/);
    unchanged(f.w, {
      interface: id,
      args: { ...plant(f.unit).args, quantity: 2 },
    });
    // Only an owned unit can be planted: a plant's stock or another person's unit cannot.
    unchanged(f.w, mode('plant', { target: SOURCE, ...SITE }));
    const theirs = v7Clone(f.w);
    const lent = theirs.stacks.find((s) => s.id === f.unit);
    if (lent) lent.owner = 'lin';
    unchanged(theirs, plant(f.unit));
    const spoiled = v7Clone(f.w);
    const s = spoiled.stacks.find((s) => s.id === f.unit);
    if (s) s.decay = 240;
    expect(unchanged(spoiled, plant(f.unit))).toMatch(/spoiled/);
    const treated = v7Clone(f.w);
    const t = treated.stacks.find((s) => s.id === f.unit);
    if (t) t.processing = { dried: true };
    expect(unchanged(treated, plant(f.unit))).toMatch(/treated/);
    const tired = v7Clone(f.w);
    actor(tired).vitals.energy = 0.9;
    expect(unchanged(tired, plant(f.unit))).toMatch(/1 energy/);
    const foreign = v7Clone(f.w);
    const u = foreign.stacks.find((s) => s.id === f.unit);
    if (u) u.origin = 'forest-acorn-0';
    expect(unchanged(foreign, plant(f.unit))).toMatch(/living plant/);
    // Maintenance has no real input or effect yet: refused before any cost, with or without a plot.
    expect(unchanged(f.w, mode('maintain'))).toMatch(
      /No maintenance can be performed yet: watering needs a measured reachable water supply/,
    );
    const { w } = planted();
    const target = plot(w)?.id ?? '';
    const reason = unchanged(w, mode('maintain', { target }));
    expect(reason).toMatch(/no fertilizer or amendment/);
    expect(reason).toMatch(/Nothing was spent/);
    expect(events(w, 'cultivation-plot-tended')).toHaveLength(0);
    // The ex17 tending mode is not part of this interface.
    unchanged(w, mode('tend', { target }));
    // Cancelling needs unfinished work; progress looks need a plot.
    expect(unchanged(f.w, mode('cancel'))).toMatch(/No unfinished planting/);
    expect(unchanged(w, mode('cancel'))).toMatch(/No unfinished planting/);
    const patch = v7Clone(f.w);
    actor(patch).position = { x: 15.97, y: 10.6 };
    expect(
      unchanged(
        patch,
        mode('inspect-progress', { target: 'commons-root-5-1' }),
      ),
    ).toMatch(/targets a plot/);
    expect(
      unchanged(f.w, mode('inspect', { inputStackId: f.unit, x: 21, y: 5 })),
    ).toMatch(/reach/);
  });

  it('inspects a unit, a site and a plant source at the observation cost without consuming anything', () => {
    const f = setup();
    const look = (w: V7World, extra: Record<string, string | number>) => {
      const energy = actor(w).vitals.energy;
      const result = step(w, { wren: mode('inspect', extra) }),
        idle = step(w).world;
      expect(result.outcomes.wren?.success).toBe(true);
      expect(energy - actor(result.world).vitals.energy).toBeCloseTo(0.2, 6);
      expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
      expect(plot(result.world)).toBeUndefined();
      expect(events(result.world, 'information-confirmed')).toHaveLength(0);
      return events(result.world, 'cultivation-condition-observed').at(-1);
    };
    const unit = observation(look(f.w, { inputStackId: f.unit }));
    expect(unit).toMatchObject({
      resource: 'root',
      quantity: 6,
      origin: SOURCE,
      treated: [],
      buds: 'not represented',
      viability: 'unknown',
      plantable: true,
      site: null,
    });
    expect(
      observation(look(f.w, { inputStackId: f.unit, ...SITE }))?.site,
    ).toMatchObject({ ground: '.', plantable: true, reason: null });
    // The starting plant is visibly empty: its stock is 0, so nothing there is plantable stock.
    const near = v7Clone(f.w);
    actor(near).position = { x: 10.1, y: 12.63 };
    const source = look(near, { target: SOURCE });
    expect(source?.data).toMatchObject({
      scope: 'plant source',
      source: SOURCE,
      stock: 0,
    });
  });

  it('pauses, resumes and is cancelled only by its own planter, charging only performed rounds', () => {
    const f = setup();
    const energy = actor(f.w).vitals.energy;
    let w = step(f.w, { wren: plant(f.unit) }).world;
    w = step(w).world;
    expect(job(w)?.status).toBe('paused');
    expect(events(w, 'cultivation-work-paused')).toHaveLength(1);
    // Lin studied but can neither continue nor cancel Wren's work.
    actor(w, 'lin').position = { x: SITE.x + 0.75, y: SITE.y };
    expect(unchanged(w, mode('cancel'), 'lin')).toMatch(/No unfinished/);
    expect(job(step(w, { lin: mode('cancel') }).world)?.status).toBe('paused');
    // Resume places the unit; the unit then stays in the plot while Wren is away.
    w = step(w, { wren: plant(f.unit) }).world;
    expect(events(w, 'cultivation-work-resumed')).toHaveLength(1);
    expect(record(w)?.lifecycle).toBe('placed');
    actor(w).position = { x: SITE.x, y: SITE.y + 2 };
    const away = step(w, { wren: plant(f.unit) });
    expect(actor(away.world).vitals.energy).toBe(actor(w).vitals.energy);
    expect(job(away.world)?.status).toBe('paused');
    expect(
      away.world.stacks.find((s) => s.reservedFor === plot(w)?.id)?.position,
    ).toEqual(SITE);
    w = away.world;
    actor(w).position = { x: SITE.x, y: SITE.y + 0.7 };
    w = step(w, { wren: plant(f.unit) }).world;
    expect(record(w)?.lifecycle).toBe('planted');
    expect(job(w)?.paidEnergy).toBe(3);
    expect(actor(w).vitals.energy).toBe(energy - 3);
    // Cancelling before placing returns the unit once and clears the loosened site.
    const early = step(step(f.w, { wren: plant(f.unit) }).world, {
      wren: mode('cancel'),
    });
    expect(early.outcomes.wren?.success).toBe(true);
    expect(events(early.world, 'cultivation-trial-ended')).toHaveLength(1);
    expect(plot(early.world)).toBeUndefined();
    expect(
      early.world.stacks
        .filter((s) => s.owner === 'wren' && s.resource === 'root')
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(6);
    expect(units(early.world)).toBe(units(f.w));
    expect(actor(early.world).vitals.energy).toBe(energy - 1);
  });

  it('cancelled after placing leaves the unit uncovered in the plot, where it ages and never roots', () => {
    let { w } = placed();
    const o = plot(w);
    const unit = w.stacks.find((s) => s.reservedFor === o?.id);
    if (!o || !unit) throw new Error('Missing placed unit.');
    const total = units(w);
    const energy = actor(w).vitals.energy;
    const cancelled = step(w, { wren: mode('cancel') });
    expect(cancelled.outcomes.wren?.success).toBe(true);
    expect(actor(cancelled.world).vitals.energy).toBe(energy);
    const ended = events(cancelled.world, 'cultivation-trial-ended');
    expect(ended).toHaveLength(1);
    expect(ended[0]?.data.returned).toEqual([]);
    expect(ended[0]?.description).toMatch(/stays uncovered/);
    w = fed(cancelled.world);
    expect(job(w)?.status).toBe('stopped');
    expect(record(w)).toMatchObject({ lifecycle: 'uncovered', workId: null });
    expect(view(w)).toMatchObject({
      unitVisible: true,
      lifecycle: 'uncovered',
    });
    expect(units(w)).toBe(total);
    // A second cancel finds no work; planting again starts a new plot elsewhere only.
    expect(unchanged(w, mode('cancel'))).toMatch(/No unfinished planting/);
    const decay = Number(w.stacks.find((s) => s.id === unit.id)?.decay);
    for (let i = 0; i < 20; i++) w = fed(step(w).world);
    expect(plot(w)?.data.interval).toBeUndefined();
    expect(plot(w)?.data.establishment).toBeUndefined();
    expect(
      Number(w.stacks.find((s) => s.id === unit.id)?.decay),
    ).toBeGreaterThan(decay);
    // An observation shows the uncovered unit's visible food condition.
    const look = step(w, { wren: mode('inspect-progress', { target: o.id }) });
    const seen = observation(
      events(look.world, 'cultivation-condition-observed').at(-1),
    );
    expect(seen).toMatchObject({ lifecycle: 'uncovered', sprouted: false });
    expect(Number(seen?.unitCondition)).toBeGreaterThan(0);
    expect(Number(seen?.unitCondition)).toBeLessThan(1);
    w = fed(look.world);
    const lying = w.stacks.find((s) => s.id === unit.id);
    if (lying) lying.decay = 239.99;
    w = step(w).world;
    expect(record(w)).toMatchObject({
      lifecycle: 'dead',
      cause: 'The placed unit decayed before it was covered.',
    });
    expect(events(w, 'cultivation-trial-failed')).toHaveLength(1);
  });

  it('at death leaves an unplaced unit where the person died and a placed one in its plot', () => {
    const f = setup();
    const loosened = step(f.w, { wren: plant(f.unit) }).world;
    const pkg = continuousRegistry(loosened).packages.find((p) => p.id === id);
    const dead = v7Clone(loosened);
    actor(dead).position = { x: SITE.x + 1, y: SITE.y + 1 };
    pkg?.onDeath?.(dead, actor(dead));
    expect(job(dead)?.status).toBe('stopped');
    expect(plot(dead)).toBeUndefined();
    expect(
      dead.stacks.find(
        (s) =>
          s.owner === null &&
          s.resource === 'root' &&
          !s.reservedFor &&
          s.position.x === SITE.x + 1,
      )?.quantity,
    ).toBe(1);
    expect(units(dead)).toBe(units(loosened));
    const { w } = placed();
    const after = v7Clone(w);
    actor(after).position = { x: SITE.x + 1, y: SITE.y + 1 };
    pkg?.onDeath?.(after, actor(after));
    expect(job(after)?.status).toBe('stopped');
    expect(record(after)?.lifecycle).toBe('uncovered');
    expect(
      after.stacks.find((s) => s.reservedFor === plot(after)?.id)?.position,
    ).toEqual(SITE);
    expect(
      events(after, 'cultivation-trial-failed').at(-1)?.description,
    ).toMatch(/stays uncovered/);
    expect(units(after)).toBe(units(w));
  });

  it('adds no reward under the existing incentives: a noticed plot is not counted as made work', () => {
    const { w } = planted();
    const o = plot(w);
    if (!o) throw new Error('Missing plot.');
    expect(w.config.longDevelopment?.culture?.incentives).toBe(true);
    // Like every plant, a plot carries no maker, so the existing work-noticed rule ignores it.
    expect(o.createdBy).toBeNull();
    actor(w, 'lin').position = { x: SITE.x + 0.75, y: SITE.y };
    const looked = step(w, {
        lin: mode('inspect-progress', { target: o.id }),
      }),
      idle = step(w).world;
    expect(looked.outcomes.lin?.success).toBe(true);
    expect(
      looked.world.events.filter(
        (e) => e.type === 'work-noticed' && e.data.object === o.id,
      ),
    ).toHaveLength(0);
    expect(
      looked.world.events.filter(
        (e) => e.type.startsWith('cultivation-') && e.data.qualified,
      ),
    ).toHaveLength(0);
    // Wren's wellbeing is exactly what the same round without Lin's look gives.
    expect(actor(looked.world).wellbeing).toEqual(actor(idle).wellbeing);
  });
});
