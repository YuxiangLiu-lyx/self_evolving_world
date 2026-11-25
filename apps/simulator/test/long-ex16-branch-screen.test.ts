import { describe, expect, it, vi } from 'vitest';
import {
  branchScreenExposure,
  continuousRegistry,
  forestClimate,
  v7Clone,
  v7Install,
  v7Load,
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
import { CONTINUOUS_VISUALS } from '../../viewer/src/continuous-visuals.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 30_000 });

const id = 'branch-screen';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** A clear meadow site; the lee floor lies on its -x side. */
const SITE = { x: 19.5, y: 5 };
/** Where Sol stands to work: within reach of the line, outside the footprint. */
const STAND = { x: 20.25, y: 5 };
/** The middle of the lee floor, 0.9 m behind the line. */
const LEE = { x: 18.6, y: 5 };

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
const actor = (w: V7World, name = 'sol'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === type);
const screen = (w: V7World): V7Object | undefined =>
  w.objects.find((o) => o.kind === id);
const parts = (o?: V7Object) =>
  (Array.isArray(o?.data.components) ? o.data.components : []) as {
    id: string;
    resource: string;
    quantity: number;
    slot: string;
    role: string;
    condition: number;
  }[];
/** Every branch unit in the world: on the ground, carried, reserved or installed. */
const units = (w: V7World) =>
  w.stacks
    .filter((s) => s.resource === 'branch')
    .reduce((n, s) => n + s.quantity, 0) +
  w.objects
    .flatMap((o) => (o.kind === id ? parts(o) : []))
    .reduce((n, p) => n + p.quantity, 0) +
  w.objects
    .filter((o) => o.data.resource === 'branch')
    .reduce((n, o) => n + Number(o.data.stock ?? 0), 0);
const job = (w: V7World) =>
  Object.entries(w.state).find(
    ([k, v]) =>
      k.startsWith('collective:work:') &&
      (v as { ability?: string }).ability === id,
  )?.[1] as
    | { id: string; status: string; completedWork: number; mode: string }
    | undefined;
const mode = (m: string, args: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...args },
});
const owned = (w: V7World, who = 'sol') =>
  w.stacks.filter(
    (s) => s.owner === who && s.resource === 'branch' && !s.reservedFor,
  );

function installed() {
  const genesis = initialLongWorld('long-ex16', 'long-culture-v2');
  return v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
}
/** Sol gathers eleven real branch units (energy topped up between gathers), then studies. */
function supplied(study = true) {
  let w = installed();
  for (const [target, quantity, x, y] of [
    ['start-1-branches', 9, 20.5, 9.7],
    ['forest-branch-0', 2, 17.2, 12.6],
  ] as const) {
    actor(w).position = { x, y };
    actor(w).vitals.energy = 40;
    const r = step(w, {
      sol: { interface: 'gather', args: { target, quantity } },
    });
    expect(r.outcomes.sol?.success).toBe(true);
    w = r.world;
  }
  if (study) {
    w = step(w, { sol: { interface: 'learn', args: { ability: id } } }).world;
    for (let i = 0; i < 3; i++) w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  }
  actor(w).position = { ...STAND };
  actor(w).vitals.energy = 40;
  const materials = owned(w).map((s) => ({
    itemId: s.id,
    quantity: s.quantity,
  }));
  const post = owned(w)[0]?.id ?? '';
  const assemble = (args: Record<string, unknown> = {}): V7Action =>
    mode('assemble', { ...SITE, orientation: 0, materials, ...args });
  return { w, materials, post, assemble };
}
/** After a passing post trial at the site. */
function trialled() {
  const f = supplied();
  const r = step(f.w, { sol: mode('assess', { ...SITE, post: f.post }) });
  expect(events(r.world, 'branch-screen-trial')[0]?.data.inserted).toBe(true);
  const w = r.world;
  actor(w).vitals.energy = 40;
  return { ...f, w };
}
/** A complete screen after eight paid rounds. */
function built() {
  const f = trialled();
  let w = f.w;
  for (let i = 0; i < 8; i++) w = step(w, { sol: f.assemble() }).world;
  expect(screen(w)?.data.status).toBe('complete');
  actor(w).vitals.energy = 40;
  return { ...f, w };
}
/** The first later round whose real wind lies within the light-weather limit. */
function calm(w: V7World) {
  for (let i = 0; i < 200; i++) {
    const c = forestClimate(w, SITE);
    if ((c.wind ?? 0) <= 0.8 && (c.wind ?? 0) > 0.2) return w;
    w = step(w).world;
  }
  throw new Error('No light wind found.');
}

describe('branch screen in ex16', () => {
  it('is scoped to ex16, needs four rounds of study and fits the frozen size limit', () => {
    const other = initialLongWorld('long-ex15', 'long-culture');
    expect(() =>
      v7Install(other, continuousRegistry(other), `${id}@1`),
    ).toThrow();
    const f = supplied(false);
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(4);
    const limit = f.w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const pkg = continuousRegistry(f.w).packages.find((p) => p.id === id);
    expect(
      CULTURE_EXCLUDED_WORDS.test(
        JSON.stringify({ abilities: pkg?.abilities, events: pkg?.events }),
      ),
    ).toBe(false);
    const early = step(f.w, { sol: mode('assess', SITE) });
    expect(early.outcomes.sol?.reason).toMatch(/not mastered/);
    expect(actor(early.world).vitals).toEqual(actor(step(f.w).world).vitals);
    let w = step(f.w, {
      sol: { interface: 'learn', args: { ability: id } },
    }).world;
    for (let i = 0; i < 2; i++) w = step(w).world;
    expect(actor(w).mastered).not.toContain(id);
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  });

  it('assesses a site for 0.2 energy and runs a real post trial for 0.5 energy without making a support', () => {
    const f = supplied();
    const idle = step(f.w).world;
    const looked = step(f.w, { sol: mode('assess', SITE) }).world;
    const seen = events(looked, 'branch-screen-assessed')[0];
    expect(seen?.data).toMatchObject({
      suitable: true,
      problems: [],
      windFrom: '+x',
      facing: 1,
      requiredBranchUnits: 11,
      ownedUsableBranchUnits: 11,
      passingTrialHere: false,
    });
    expect(actor(idle).vitals.energy - actor(looked).vitals.energy).toBeCloseTo(
      0.2,
      6,
    );
    expect(looked.stacks).toEqual(idle.stacks);
    expect(screen(looked)).toBeUndefined();
    expect(events(looked, 'information-confirmed')).toHaveLength(0);
    const tried = step(f.w, {
      sol: mode('assess', { ...SITE, post: f.post }),
    }).world;
    const trial = events(tried, 'branch-screen-trial')[0];
    expect(trial?.data).toMatchObject({
      inserted: true,
      depth: 0.25,
      retained: true,
      soil: 'ordinary soil',
      damagedItem: null,
    });
    expect(actor(idle).vitals.energy - actor(tried).vitals.energy).toBeCloseTo(
      0.5,
      6,
    );
    // The intact post stays owned and unchanged; no support or structure exists.
    expect(tried.stacks).toEqual(idle.stacks);
    expect(screen(tried)).toBeUndefined();
    // Forest floor is not ordinary soil: an informative failed trial that still costs its effort.
    const forest = v7Clone(f.w);
    actor(forest).position = { x: 13.75, y: 5 };
    const failed = step(forest, {
      sol: mode('assess', { x: 13, y: 5, post: f.post }),
    }).world;
    expect(events(failed, 'branch-screen-trial')[0]?.data).toMatchObject({
      inserted: false,
      depth: 0,
      resistance: 'not ordinary soil: hand insertion is not supported here',
    });
    // A worn recovered post breaks into tracked damaged material with its mass kept.
    const worn = v7Clone(f.w);
    const s = owned(worn)[0];
    if (!s) throw new Error('Missing post.');
    s.processing = { branchScreenPart: { condition: 0.3 } };
    const broke = step(worn, {
      sol: mode('assess', { ...SITE, post: s.id }),
    }).world;
    const data = events(broke, 'branch-screen-trial')[0]?.data;
    expect(data).toMatchObject({ inserted: false, postCondition: 0.3 });
    const damaged = broke.stacks.find((x) => x.id === data?.damagedItem);
    expect(damaged?.quantity).toBe(1);
    expect(damaged?.owner).toBe('sol');
    expect(damaged?.processing?.branchScreenPart).toMatchObject({
      broken: true,
      condition: 0,
    });
    expect(units(broke)).toBe(units(worn));
  });

  it('refuses assembly without a passing trial, on a bad site, with the wrong recipe or on low energy, spending nothing', () => {
    const f = supplied();
    const unchanged = (action: V7Action, reason: RegExp, w = f.w) => {
      const r = step(w, { sol: action }),
        idle = step(w).world;
      expect(r.outcomes.sol?.success).toBe(false);
      expect(r.outcomes.sol?.reason).toMatch(reason);
      expect(r.world.stacks).toEqual(idle.stacks);
      expect(actor(r.world).vitals).toEqual(actor(idle).vitals);
      expect(screen(r.world)).toBeUndefined();
      expect(job(r.world)).toBeUndefined();
    };
    unchanged(f.assemble(), /post trial/);
    const t = trialled();
    const short = t.materials.map((m) =>
      m.quantity === 9 ? { ...m, quantity: 8 } : m,
    );
    unchanged(t.assemble({ materials: short }), /Exactly 11/, t.w);
    unchanged(t.assemble({ x: 22 }), /beyond reach/, t.w);
    const crowded = v7Clone(t.w);
    actor(crowded, 'kai').position = { ...SITE };
    unchanged(t.assemble(), /person occupies/, crowded);
    const tired = v7Clone(t.w);
    actor(tired).vitals.energy = 1;
    unchanged(t.assemble(), /first paid round/, tired);
    // The wet river bank is not ordinary soil.
    const bank = v7Clone(t.w);
    actor(bank).position = { x: 23.75, y: 5 };
    unchanged(t.assemble({ x: 23 }), /not ordinary soil/, bank);
  });

  it('assembles in eight paid rounds of 1.5 energy, installing and conserving the real branch units', () => {
    const f = trialled();
    const before = units(f.w),
      load = v7Load(f.w, actor(f.w)),
      e0 = actor(f.w).vitals.energy;
    const first = step(f.w, { sol: f.assemble() });
    expect(first.outcomes.sol?.complete).toBe(false);
    expect(events(first.world, 'branch-screen-started')[0]?.target).toBe(
      screen(first.world)?.id,
    );
    expect(parts(screen(first.world)).map((p) => p.slot)).toEqual([
      'upright-0',
      'upright-2',
    ]);
    // The drawing shows only installed pieces, dashed until complete.
    const draw = CONTINUOUS_VISUALS[id];
    const partial = screen(first.world);
    expect(typeof draw).toBe('function');
    const sketch = partial && draw ? draw(partial, []) : '';
    expect(sketch.match(/<circle/g)).toHaveLength(2);
    expect(sketch).toContain('stroke-dasharray');
    expect(sketch).toContain('in-progress 2 / 11');
    expect(
      first.world.stacks
        .filter((s) => s.reservedFor === job(first.world)?.id)
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(9);
    let w = first.world;
    const stages: unknown[] = [];
    for (let i = 1; i < 8; i++) {
      const r = step(w, { sol: f.assemble() });
      w = r.world;
      stages.push(events(w, 'branch-screen-progress')[0]?.data.stage);
      if (i < 7) {
        expect(screen(w)?.data.status).toBe('in-progress');
        actor(w).position = { ...LEE };
        expect(branchScreenExposure(w, actor(w))).toBeNull();
        actor(w).position = { ...STAND };
      } else expect(r.outcomes.sol?.complete).toBe(true);
    }
    expect(stages).toEqual([
      'seat-uprights',
      'weave-rods',
      'weave-rods',
      'weave-rods',
      'weave-rods',
      'align-gaps',
      undefined,
    ]);
    const done = events(w, 'branch-screen-completed')[0];
    const o = screen(w);
    expect(done?.target).toBe(o?.id);
    expect(done?.data.looseComponents).toEqual([]);
    expect(o?.data.status).toBe('complete');
    expect(o?.spatial.solid).toBe(true);
    const drawn = o && draw ? draw(o, []) : '';
    expect(drawn.match(/<circle/g)).toHaveLength(3);
    expect(drawn.match(/<path d="M[-.\d]+ -\.55/g)).toHaveLength(8);
    expect(drawn).not.toContain('stroke-dasharray');
    expect(o?.data.porosity).toBeCloseTo(1 - 0.129 / 0.36, 6);
    expect(parts(o).filter((p) => p.role === 'upright')).toHaveLength(3);
    expect(parts(o).filter((p) => p.role === 'rod')).toHaveLength(8);
    expect(job(w)?.status).toBe('completed');
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(units(w)).toBe(before);
    expect(owned(w)).toHaveLength(0);
    expect(load - v7Load(w, actor(w))).toBeCloseTo(11 * 1.1, 6);
    const waited = (() => {
      let x = f.w;
      for (let i = 0; i < 8; i++) x = step(x).world;
      return actor(x).vitals.energy;
    })();
    expect(e0 - actor(w).vitals.energy - (e0 - waited)).toBeCloseTo(12, 6);
    // No milestone or other reward for finishing a structure.
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(JSON.stringify(actor(w).wellbeing.sources)).not.toContain(id);
  });

  it('removes only part of the real wind chill on its lee floor, never rain chill or air temperature', () => {
    const w = calm(built().w);
    actor(w).position = { ...LEE };
    const plain = v7Clone(w);
    const p = screen(plain);
    if (!p) throw new Error('Missing screen.');
    p.data.status = 'unstable';
    const m = branchScreenExposure(w, actor(w));
    expect(m).toMatchObject({
      withheld: null,
      facing: 1,
      rainShield: 0,
      windShield: 0.35,
      windFrom: '+x',
    });
    const exposure = w.config.experience?.exposure ?? 0;
    expect(m?.avoidedChill).toBeCloseTo(exposure * (m?.wind ?? 0) * 0.35, 6);
    expect(m?.avoidedChill).toBeLessThan(m?.outdoorChill ?? 0);
    expect(branchScreenExposure(plain, actor(plain))).toBeNull();
    const sheltered = step(w).world,
      exposed = step(plain).world;
    const event = events(sheltered, 'branch-screen-exposure-measured')[0];
    expect(event?.actor).toBe('sol');
    const avoided = Number(event?.data.avoidedChill);
    expect(avoided).toBeGreaterThan(0);
    expect(events(exposed, 'branch-screen-exposure-measured')).toHaveLength(0);
    const warmer =
      actor(sheltered).vitals.temperature - actor(exposed).vitals.temperature;
    expect(warmer).toBeGreaterThan(0);
    expect(warmer).toBeCloseTo(0.035 * avoided, 6);
    expect(forestClimate(sheltered, LEE).temperature).toBe(
      forestClimate(exposed, LEE).temperature,
    );
    expect(actor(sheltered).vitals.satiety).toBe(actor(exposed).vitals.satiety);
    expect(actor(sheltered).vitals.energy).toBe(actor(exposed).vitals.energy);
    // A screen turned away from the +x wind shields nothing.
    const turned = v7Clone(w);
    const t = screen(turned);
    if (t) t.spatial.angle = Math.PI;
    actor(turned).position = { x: 20.4, y: 5 };
    expect(branchScreenExposure(turned, actor(turned))).toMatchObject({
      windShield: 0,
      withheld: 'the wind does not meet the windward face',
    });
    // Off the lee floor, or in the fall reach right behind the line, nothing changes.
    for (const at of [
      { x: 19.1, y: 5 },
      { x: 18.6, y: 5.5 },
      { x: 17.8, y: 5 },
    ]) {
      const off = v7Clone(w);
      actor(off).position = at;
      expect(branchScreenExposure(off, actor(off))).toBeNull();
    }
    // Wind above the light-weather limit is not shielded: the same screen at a later, windier time.
    const windy = v7Clone(w);
    while ((forestClimate(windy, SITE).wind ?? 0) <= 0.8)
      windy.time += windy.config.dt;
    expect(branchScreenExposure(windy, actor(windy))).toMatchObject({
      withheld: 'wind beyond the light-weather limit',
      windShield: 0,
      avoidedChill: 0,
    });
  });

  it('pauses when not worked, resumes by target and pauses without charge on low energy, out of reach or with a person on the footprint', () => {
    const f = trialled();
    let w = step(f.w, { sol: f.assemble() }).world;
    const paused = step(w);
    expect(events(paused.world, 'branch-screen-paused')).toHaveLength(1);
    expect(job(paused.world)?.status).toBe('paused');
    w = paused.world;
    const target = screen(w)?.id ?? '';
    // Starting again without naming the screen is refused at no cost.
    const again = step(w, { sol: f.assemble() });
    expect(again.outcomes.sol?.reason).toMatch(/resume it by target/);
    const resumed = step(w, { sol: mode('assemble', { target }) });
    expect(events(resumed.world, 'branch-screen-resumed')).toHaveLength(1);
    expect(job(resumed.world)?.completedWork).toBe(2);
    w = resumed.world;
    const check = (world: V7World, reason: RegExp) => {
      const r = step(world, { sol: mode('assemble', { target }) });
      const e = events(r.world, 'branch-screen-paused')[0];
      expect(e?.description).toMatch(reason);
      expect(job(r.world)?.completedWork).toBe(2);
      expect(parts(screen(r.world))).toHaveLength(3);
      expect(actor(r.world).vitals.energy).toBeCloseTo(
        actor(step(world).world).vitals.energy,
        6,
      );
      return e;
    };
    const low = v7Clone(w);
    actor(low).vitals.energy = 1;
    expect(check(low, /Not enough energy/)?.data.requiredEnergy).toBe(1.5);
    const away = v7Clone(w);
    actor(away).position = { x: 22.5, y: 5 };
    check(away, /beyond working reach/);
    const crowded = v7Clone(w);
    // Beside the solid installed line, but on the footprint.
    actor(crowded, 'kai').position = { x: 19.2, y: 5.55 };
    check(crowded, /person occupies/);
  });

  it('cancels once, returning uninstalled units and leaving an incomplete screen; only the builder may change it', () => {
    const f = trialled();
    let w = f.w;
    for (let i = 0; i < 3; i++) w = step(w, { sol: f.assemble() }).world;
    const before = units(w);
    const cancelled = step(w, { sol: mode('cancel') });
    w = cancelled.world;
    expect(cancelled.outcomes.sol?.success).toBe(true);
    expect(events(w, 'branch-screen-cancelled')).toHaveLength(1);
    expect(job(w)?.status).toBe('stopped');
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(owned(w).reduce((n, s) => n + s.quantity, 0)).toBe(6);
    expect(parts(screen(w))).toHaveLength(5);
    expect(screen(w)?.data.status).toBe('incomplete');
    expect(units(w)).toBe(before);
    expect(step(w, { sol: mode('cancel') }).outcomes.sol?.success).toBe(false);
    // An incomplete screen cannot be repaired, only dismantled.
    const target = screen(w)?.id ?? '';
    expect(
      step(w, { sol: mode('repair', { target, components: [] }) }).outcomes.sol
        ?.reason,
    ).toMatch(/fully installed/);
    // Another person who studied may inspect, but not repair or dismantle.
    const done = built().w;
    const o = screen(done);
    actor(done, 'kai').mastered.push(id);
    actor(done, 'kai').position = { x: 20.25, y: 5.6 };
    for (const args of [{ target: o?.id, components: [] }, { target: o?.id }]) {
      const r = step(done, {
        kai: mode(args.components ? 'repair' : 'dismantle', args),
      });
      expect(r.outcomes.kai?.reason).toMatch(/Only the person who built/);
      expect(parts(screen(r.world))).toHaveLength(11);
    }
    const inspected = step(done, {
      kai: mode('inspect', { target: o?.id }),
    });
    expect(inspected.outcomes.kai?.success).toBe(true);
    expect(
      events(inspected.world, 'branch-screen-inspected')[0]?.data,
    ).toMatchObject({
      status: 'complete',
      installed: 11,
      missing: [],
      loose: [],
    });
    expect(
      actor(step(done).world, 'kai').vitals.energy -
        actor(inspected.world, 'kai').vitals.energy,
    ).toBeCloseTo(0.2, 6);
    expect(parts(screen(inspected.world)).map((p) => p.id)).toEqual(
      parts(o).map((p) => p.id),
    );
  });

  it('a loose rod opens a gap, a loose upright ends shielding, and an exact repair with a passing check restores it', () => {
    const b = built();
    let w = calm(b.w);
    const o = screen(w);
    if (!o) throw new Error('Missing screen.');
    const rod = parts(o).find((p) => p.slot === 'rod-3');
    if (rod) rod.condition = 0.5001;
    w = step(w).world;
    expect(events(w, 'branch-screen-deteriorated')[0]?.description).toMatch(
      /loose rod/,
    );
    expect(screen(w)?.data.status).toBe('complete');
    actor(w).position = { ...LEE };
    const gap = branchScreenExposure(w, actor(w));
    expect(gap?.windShield).toBeLessThan(0.35);
    expect(gap?.solidity).toBeCloseTo((0.129 - 0.0135 + 0.001125) / 0.36, 6);
    const upright = parts(screen(w)).find((p) => p.slot === 'upright-1');
    if (upright) upright.condition = 0.5001;
    w = step(w).world;
    expect(events(w, 'branch-screen-damaged')).toHaveLength(1);
    expect(screen(w)?.data.status).toBe('damaged');
    expect(branchScreenExposure(w, actor(w))).toBeNull();
    // Gather two real replacements and replace the loose upright and rod.
    actor(w).position = { x: 17.2, y: 12.6 };
    actor(w).vitals.energy = 40;
    const gathered = step(w, {
      sol: {
        interface: 'gather',
        args: { target: 'forest-branch-0', quantity: 2 },
      },
    });
    expect(gathered.outcomes.sol?.success).toBe(true);
    w = gathered.world;
    actor(w).position = { ...STAND };
    actor(w).vitals.energy = 40;
    const before = units(w),
      start = w;
    const target = screen(w)?.id ?? '';
    const loose = parts(screen(w))
      .filter((p) => p.condition < 0.5)
      .map((p) => p.id);
    expect(loose).toHaveLength(2);
    const fix = mode('repair', {
      target,
      components: loose,
      materials: owned(w).map((s) => ({ itemId: s.id, quantity: s.quantity })),
    });
    let r = step(w, { sol: fix });
    expect(r.outcomes.sol?.complete).toBe(false);
    expect(screen(r.world)?.data.status).toBe('in-progress');
    for (let i = 1; i < 5; i++) r = step(r.world, { sol: fix });
    w = r.world;
    expect(r.outcomes.sol?.complete).toBe(true);
    expect(events(w, 'branch-screen-repaired')[0]?.data.replaced).toEqual([
      'upright-1',
      'rod-3',
    ]);
    expect(events(w, 'branch-screen-completed')).toHaveLength(1);
    expect(screen(w)?.data.status).toBe('complete');
    // Five paid rounds (two removals, two fittings, one check) at 1.5 energy each.
    let idle = start;
    for (let i = 0; i < 5; i++) idle = step(idle).world;
    expect(actor(idle).vitals.energy - actor(w).vitals.energy).toBeCloseTo(
      7.5,
      6,
    );
    const debris = w.stacks.filter(
      (s) => s.processing?.branchScreenPart && s.owner === null,
    );
    expect(debris.map((s) => s.quantity)).toEqual([1, 1]);
    expect(
      debris.every(
        (s) =>
          (s.processing?.branchScreenPart as { condition: number }).condition <
          0.5,
      ),
    ).toBe(true);
    expect(units(w)).toBe(before);
    actor(w).position = { ...LEE };
    expect(branchScreenExposure(w, actor(w))?.windShield).toBeGreaterThan(0);
  });

  it('fails its stability check with a worn piece and passes a rerun only after replacement', () => {
    const f = trialled();
    let w = f.w;
    for (let i = 0; i < 7; i++) w = step(w, { sol: f.assemble() }).world;
    const rod = parts(screen(w)).find((p) => p.slot === 'rod-5');
    if (rod) rod.condition = 0.4;
    w = step(w, { sol: f.assemble() }).world;
    expect(events(w, 'branch-screen-check-failed')[0]?.data).toMatchObject({
      looseComponents: ['rod-5'],
      status: 'unstable',
    });
    expect(screen(w)?.data.status).toBe('unstable');
    actor(w).position = { ...LEE };
    expect(branchScreenExposure(w, actor(w))).toBeNull();
    actor(w).position = { ...STAND };
    const target = screen(w)?.id ?? '';
    // A check-only repair (no components) costs one paid round and fails again.
    const e0 = actor(w).vitals.energy;
    const recheck = step(w, {
      sol: mode('repair', { target, components: [] }),
    });
    expect(recheck.outcomes.sol?.complete).toBe(true);
    expect(events(recheck.world, 'branch-screen-check-failed')).toHaveLength(1);
    expect(
      e0 -
        actor(recheck.world).vitals.energy -
        (e0 - actor(step(w).world).vitals.energy),
    ).toBeCloseTo(1.5, 6);
    // Replacing the worn rod with a real gathered unit: removal, fitting and a passing check.
    w = recheck.world;
    actor(w).position = { x: 17.2, y: 12.6 };
    actor(w).vitals.energy = 40;
    w = step(w, {
      sol: {
        interface: 'gather',
        args: { target: 'forest-branch-0', quantity: 1 },
      },
    }).world;
    actor(w).position = { ...STAND };
    const worn = parts(screen(w)).find((p) => p.slot === 'rod-5')?.id ?? '';
    const fix = mode('repair', {
      target,
      components: [worn],
      materials: owned(w).map((s) => ({ itemId: s.id, quantity: s.quantity })),
    });
    for (let i = 0; i < 3; i++) w = step(w, { sol: fix }).world;
    expect(events(w, 'branch-screen-completed')).toHaveLength(1);
    expect(screen(w)?.data.status).toBe('complete');
    expect(parts(screen(w)).some((p) => p.id === worn)).toBe(false);
  });

  it('dismantles three pieces per round for 1 energy, leaving every piece on the ground', () => {
    let w = built().w;
    const target = screen(w)?.id ?? '';
    const before = units(w);
    const removed: number[] = [];
    for (let i = 0; i < 4; i++) {
      const idle = actor(step(w).world).vitals.energy;
      w = step(w, { sol: mode('dismantle', { target }) }).world;
      const e = events(w, 'branch-screen-dismantled')[0];
      removed.push(Array.isArray(e?.data.slots) ? e.data.slots.length : 0);
      expect(idle - actor(w).vitals.energy).toBeCloseTo(1, 6);
    }
    expect(removed).toEqual([3, 3, 3, 2]);
    expect(screen(w)).toBeUndefined();
    const ground = w.stacks.filter((s) => s.processing?.branchScreenPart);
    expect(ground.every((s) => s.owner === null)).toBe(true);
    expect(ground.reduce((n, s) => n + s.quantity, 0)).toBe(11);
    expect(units(w)).toBe(before);
    // Nothing remains to dismantle.
    expect(
      step(w, { sol: mode('dismantle', { target }) }).outcomes.sol?.success,
    ).toBe(false);
  });

  it('stops at death, leaving installed pieces and dropping uninstalled units where the person died', () => {
    const f = trialled();
    let w = f.w;
    for (let i = 0; i < 2; i++) w = step(w, { sol: f.assemble() }).world;
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    const dead = v7Clone(w);
    pkg?.onDeath?.(dead, actor(dead));
    expect(job(dead)?.status).toBe('stopped');
    expect(events(dead, 'branch-screen-failed')).toHaveLength(1);
    const dropped = dead.stacks.filter(
      (s) =>
        s.owner === null &&
        s.resource === 'branch' &&
        s.position.x === actor(dead).position.x &&
        s.position.y === actor(dead).position.y,
    );
    expect(dropped.reduce((n, s) => n + s.quantity, 0)).toBe(8);
    expect(dead.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(parts(screen(dead))).toHaveLength(3);
    expect(screen(dead)?.data).toMatchObject({
      workId: null,
      status: 'incomplete',
    });
  });
});
