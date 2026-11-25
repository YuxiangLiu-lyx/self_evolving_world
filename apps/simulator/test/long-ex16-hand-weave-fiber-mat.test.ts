import { describe, expect, it, vi } from 'vitest';
import {
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

const id = 'hand-weave-fiber-mat';
const KIND = 'fiber-mat';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** The only dry grass source near the group, within Moss's reach of her start. */
const SOURCE = 'forest-dry-grass-0';
/** A clear square of ordinary soil within Moss's reach of her start. */
const SITE = { x: 15.8, y: 16.2 };
/** Another clear square in reach of the same spot. */
const OTHER = { x: 15.7, y: 17.5 };

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
const actor = (w: V7World, name = 'moss'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === type);
const mat = (w: V7World): V7Object | undefined =>
  w.objects.find((o) => o.kind === KIND);
interface Lot {
  id: string;
  quantity: number;
  condition: number;
  origin: string;
}
const lots = (o?: V7Object) =>
  (Array.isArray(o?.data.lots) ? o.data.lots : []) as unknown as Lot[];
const tenths = (n: number) => Math.round(n * 10);
/** Every tenth of dry grass: in stacks (carried, reserved, scrap or ground), inside mats and in sources. */
const grass = (w: V7World) =>
  w.stacks
    .filter((s) => s.resource === 'dry-grass')
    .reduce((n, s) => n + tenths(s.quantity), 0) +
  w.objects
    .flatMap((o) => (o.kind === KIND ? lots(o) : []))
    .reduce((n, l) => n + tenths(l.quantity), 0) +
  w.objects
    .filter((o) => o.kind !== KIND && o.data.resource === 'dry-grass')
    .reduce((n, o) => n + tenths(Number(o.data.stock ?? 0)), 0);
const jobs = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(
      ([, v]) =>
        v as {
          id: string;
          status: string;
          completedWork: number;
          mode: string;
        },
    );
const job = (w: V7World) => jobs(w).at(-1);
const mode = (m: string, args: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...args },
});
/** Owned, unreserved, never-processed dry grass. */
const free = (w: V7World, who = 'moss') =>
  w.stacks.filter(
    (s) =>
      s.owner === who &&
      s.resource === 'dry-grass' &&
      !s.reservedFor &&
      !s.processing,
  );
const role = (w: V7World, r: string) =>
  w.stacks.filter(
    (s) =>
      (s.processing?.fiberMatLot as { role?: string } | undefined)?.role === r,
  );
/** Physical wellbeing from the unchanged formula of continuous-wellbeing.ts. */
function physical(w: V7World, a: V7Actor) {
  const v = a.vitals,
    thermal = Math.max(
      0,
      1 - Math.max(0, 16 - v.temperature, v.temperature - 27) / 12,
    );
  return (
    w.config.physicalCap *
    ((0.3 * v.health) / 100 +
      (0.25 * v.satiety) / 100 +
      (0.25 * v.energy) / w.config.energyCap +
      0.2 * thermal)
  );
}

function installed() {
  const genesis = initialLongWorld('long-ex16', 'long-culture-v2');
  return v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
}
/** Moss gathers real dry grass with the unchanged base gather, then studies. */
function supplied(study = true, quantity = 5) {
  let w = installed();
  const r = step(w, {
    moss: { interface: 'gather', args: { target: SOURCE, quantity } },
  });
  expect(r.outcomes.moss?.success).toBe(true);
  w = r.world;
  if (study) {
    w = step(w, { moss: { interface: 'learn', args: { ability: id } } }).world;
    for (let i = 0; i < 2; i++) w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  }
  actor(w).vitals.energy = 40;
  return { w, grass: free(w)[0]?.id ?? '' };
}
/** After a passing plaiting test on that grass. */
function tested() {
  const f = supplied();
  const w = step(f.w, { moss: mode('test', { sample: f.grass }) }).world;
  expect(events(w, 'fiber-mat-tested')[0]?.data.passed).toBe(true);
  actor(w).vitals.energy = 40;
  const assemble = (args: Record<string, unknown> = {}): V7Action =>
    mode('assemble', {
      ...SITE,
      materials: [{ itemId: f.grass, quantity: 4 }],
      ...args,
    });
  return { w, grass: f.grass, assemble };
}
/** A complete mat after seven paid rounds. */
function built() {
  const f = tested();
  let w = f.w;
  for (let i = 0; i < 7; i++) w = step(w, { moss: f.assemble() }).world;
  expect(mat(w)?.data.status).toBe('complete');
  actor(w).vitals.energy = 40;
  return { ...f, w, target: mat(w)?.id ?? '' };
}
/** A copy whose clock is moved to the next rainy round (time only; nothing else changes). */
function rainy(w: V7World) {
  const x = v7Clone(w);
  while ((forestClimate(x, SITE).rain ?? 0) === 0) x.time += x.config.dt;
  return x;
}
const unchanged = (
  w: V7World,
  action: V7Action,
  reason: RegExp,
  who = 'moss',
) => {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.success).toBe(false);
  expect(r.outcomes[who]?.reason).toMatch(reason);
  expect(r.world.stacks).toEqual(idle.stacks);
  expect(actor(r.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(r.world.objects).toEqual(idle.objects);
  return r;
};

describe('hand-woven fiber mat in ex16', () => {
  it('is scoped to ex16, needs three rounds of study and fits the frozen size limit', () => {
    const other = initialLongWorld('long-ex15', 'long-culture');
    expect(() =>
      v7Install(other, continuousRegistry(other), `${id}@1`),
    ).toThrow();
    const f = supplied(false);
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(3);
    const limit = f.w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const pkg = continuousRegistry(f.w).packages.find((p) => p.id === id);
    expect(
      CULTURE_EXCLUDED_WORDS.test(
        JSON.stringify({ abilities: pkg?.abilities, events: pkg?.events }),
      ),
    ).toBe(false);
    expect(pkg?.satisfaction).toEqual([]);
    expect(typeof CONTINUOUS_VISUALS[KIND]).toBe('function');
    const early = step(f.w, { moss: mode('test', { sample: f.grass }) });
    expect(early.outcomes.moss?.reason).toMatch(/not mastered/);
    expect(actor(early.world).vitals).toEqual(actor(step(f.w).world).vitals);
    let w = step(f.w, {
      moss: { interface: 'learn', args: { ability: id } },
    }).world;
    w = step(w).world;
    expect(actor(w).mastered).not.toContain(id);
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  });

  it('tests a real 0.1 sample for 0.5 energy, keeping it as tested scrap, and fails informatively on roots', () => {
    const f = supplied();
    const before = grass(f.w),
      idle = step(f.w).world,
      r = step(f.w, { moss: mode('test', { sample: f.grass }) }),
      w = r.world,
      e = events(w, 'fiber-mat-tested')[0];
    expect(e?.data).toMatchObject({
      resource: 'dry-grass',
      origin: SOURCE,
      passed: true,
      reason: null,
      flexibility: 0.5,
      strength: 0,
      brittle: false,
      strips: true,
      retainingEdge: true,
      stemLength: null,
      moisture: null,
    });
    expect(actor(idle).vitals.energy - actor(w).vitals.energy).toBeCloseTo(
      0.5,
      6,
    );
    // The sample is not lost: it is an owned, identified tested scrap of the same origin.
    const scrap = role(w, 'tested-scrap');
    expect(scrap).toHaveLength(1);
    expect(scrap[0]).toMatchObject({
      quantity: 0.1,
      owner: 'moss',
      origin: SOURCE,
    });
    expect(e?.target).toBe(scrap[0]?.id);
    expect(free(w)[0]?.quantity).toBe(4.9);
    expect(grass(w)).toBe(before);
    expect(
      w.events.filter(
        (x) => x.type === 'information-confirmed' && x.interface === id,
      ),
    ).toHaveLength(1);
    expect(events(w, 'satisfaction')).toHaveLength(0);
    // Re-testing the same batch costs again but confirms nothing new.
    const again = step(w, { moss: mode('test', { sample: f.grass }) }).world;
    expect(events(again, 'fiber-mat-tested')).toHaveLength(1);
    expect(events(again, 'information-confirmed')).toHaveLength(0);
    // Roots are not stem fiber: an informative failure that still pays its effort.
    const roots = v7Clone(f.w);
    actor(roots).position = { x: 14.9, y: 17.95 };
    let x = step(roots, {
      moss: {
        interface: 'gather',
        args: { target: 'commons-root-1-0', quantity: 1 },
      },
    }).world;
    const root = x.stacks.find(
      (s) => s.owner === 'moss' && s.resource === 'root',
    );
    actor(x).vitals.energy = 40;
    x = step(x, { moss: mode('test', { sample: root?.id }) }).world;
    expect(events(x, 'fiber-mat-tested')[0]?.data).toMatchObject({
      resource: 'root',
      passed: false,
      reason: 'no thin stems: continuous strips cannot form',
    });
    // A failed source cannot be woven.
    unchanged(
      x,
      mode('assemble', {
        x: 15.5,
        y: 18.4,
        materials: [{ itemId: root?.id, quantity: 0.9 }],
      }),
      /thin stem fiber/,
    );
  });

  it('refuses assembly without a passing test, on a bad square, with the wrong recipe or on low energy, spending nothing', () => {
    const s = supplied();
    unchanged(
      s.w,
      mode('assemble', {
        ...SITE,
        materials: [{ itemId: s.grass, quantity: 4 }],
      }),
      /plaiting test/,
    );
    const t = tested();
    unchanged(
      t.w,
      t.assemble({ materials: [{ itemId: t.grass, quantity: 3 }] }),
      /Exactly 4 units/,
    );
    unchanged(t.w, t.assemble({ x: 19 }), /beyond reach/);
    unchanged(t.w, t.assemble({ x: 14.6, y: 16.5 }), /overlaps a plant/);
    const crowded = v7Clone(t.w);
    actor(crowded, 'kai').position = { ...SITE };
    unchanged(crowded, t.assemble(), /another person/);
    const tired = v7Clone(t.w);
    actor(tired).vitals.energy = 0.4;
    unchanged(tired, t.assemble(), /layout round/);
    expect(mat(t.w)).toBeUndefined();
    expect(job(t.w)).toBeUndefined();
  });

  it('lays out, weaves and lift-checks a mat in seven paid rounds for 6.5 energy, conserving the real grass', () => {
    const f = tested();
    const before = grass(f.w),
      load = v7Load(f.w, actor(f.w)),
      e0 = actor(f.w).vitals.energy;
    const first = step(f.w, { moss: f.assemble() });
    expect(first.outcomes.moss?.complete).toBe(false);
    expect(events(first.world, 'fiber-mat-started')[0]?.target).toBe(
      mat(first.world)?.id,
    );
    expect(events(first.world, 'fiber-mat-layout')[0]?.data).toMatchObject({
      intactMass: 0.4,
      requiredMass: 0.3645,
      layers: 2,
      stemLength: 'not represented',
    });
    // Reserved fiber stays carried and counted as load; nothing is in the mat yet.
    expect(
      first.world.stacks
        .filter((s) => s.reservedFor === job(first.world)?.id)
        .reduce((n, s) => n + s.quantity, 0),
    ).toBe(4);
    expect(v7Load(first.world, actor(first.world))).toBeCloseTo(load, 6);
    expect(lots(mat(first.world))).toHaveLength(0);
    const draw = CONTINUOUS_VISUALS[KIND];
    const loose = mat(first.world);
    const sketch = loose && draw ? draw(loose, []) : '';
    expect(sketch).toContain('stroke-dasharray');
    expect(sketch).toContain('Mat weaving 1 / 7');
    let w = first.world;
    const stages: unknown[] = [];
    for (let i = 1; i < 7; i++) {
      const r = step(w, { moss: f.assemble() });
      w = r.world;
      stages.push(events(w, 'fiber-mat-progress')[0]?.data.stage);
      if (i === 1) expect(sum(lots(mat(w)))).toBe(20);
      if (i < 6) expect(mat(w)?.data.status).toBe('weaving');
      else expect(r.outcomes.moss?.complete).toBe(true);
    }
    expect(stages).toEqual([
      'strip-forming',
      'strip-forming',
      'interlacing',
      'interlacing',
      'edge-tucking',
      undefined,
    ]);
    const done = events(w, 'fiber-mat-completed')[0];
    const o = mat(w);
    expect(done?.target).toBe(o?.id);
    expect(done?.data).toMatchObject({ passed: true, fiber: 3.7 });
    expect(Number(done?.data.largestOpening)).toBeLessThan(0.001);
    expect(o?.data.status).toBe('complete');
    expect(o?.spatial.solid).toBe(false);
    expect(sum(lots(o))).toBe(37);
    expect(lots(o).every((l) => l.origin === SOURCE)).toBe(true);
    // The trimmed 0.3 units are an owned offcut; input = mat + offcut + earlier scrap.
    const offcut = role(w, 'offcut');
    expect(offcut.map((s) => s.quantity)).toEqual([0.3]);
    expect(offcut[0]?.owner).toBe('moss');
    expect(grass(w)).toBe(before);
    expect(job(w)?.status).toBe('completed');
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    // A lying mat is not carried load; the offcut is.
    expect(load - v7Load(w, actor(w))).toBeCloseTo(3.7 * 0.1, 6);
    const drawn = o && draw ? draw(o, []) : '';
    expect(drawn).not.toContain('stroke-dasharray');
    expect(drawn.match(/<path d="M-\.2 /g)).toHaveLength(5);
    expect(drawn).toContain('>Mat<');
    const waited = (() => {
      let x = f.w;
      for (let i = 0; i < 7; i++) x = step(x).world;
      return actor(x).vitals.energy;
    })();
    expect(e0 - actor(w).vitals.energy - (e0 - waited)).toBeCloseTo(6.5, 6);
    // No milestone or other reward for finishing a mat.
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(JSON.stringify(actor(w).wellbeing.sources)).not.toContain(id);
  });

  it('measures a layout shortfall from actual intact fiber and returns every reserved tenth once', () => {
    const f = tested();
    let w = f.w;
    // Three more tests leave four 0.1 scraps; with 3.6 fresh units they make the 4-unit recipe.
    for (let i = 0; i < 3; i++)
      w = step(w, { moss: mode('test', { sample: f.grass }) }).world;
    const scraps = role(w, 'tested-scrap');
    expect(scraps).toHaveLength(4);
    actor(w).vitals.energy = 40;
    const before = grass(w),
      idle = step(w).world;
    const r = step(w, {
      moss: f.assemble({
        materials: [
          { itemId: f.grass, quantity: 3.6 },
          ...scraps.map((s) => ({ itemId: s.id, quantity: 0.1 })),
        ],
      }),
    });
    w = r.world;
    expect(r.outcomes.moss?.complete).toBe(true);
    expect(events(w, 'fiber-mat-shortfall')[0]?.data).toMatchObject({
      intactMass: 0.36,
      requiredMass: 0.3645,
      shortfall: 0.0045,
    });
    expect(mat(w)).toBeUndefined();
    expect(job(w)?.status).toBe('stopped');
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(free(w).reduce((n, s) => n + tenths(s.quantity), 0)).toBe(46);
    expect(role(w, 'tested-scrap')).toHaveLength(4);
    expect(grass(w)).toBe(before);
    expect(actor(idle).vitals.energy - actor(w).vitals.energy).toBeCloseTo(
      0.5,
      6,
    );
  });

  it('pauses when not worked, resumes by target and pauses without charge on low energy, out of reach or with a person on the square', () => {
    const f = tested();
    let w = step(f.w, { moss: f.assemble() }).world;
    w = step(w, { moss: f.assemble() }).world;
    const paused = step(w);
    expect(events(paused.world, 'fiber-mat-paused')).toHaveLength(1);
    expect(job(paused.world)?.status).toBe('paused');
    w = paused.world;
    const target = mat(w)?.id ?? '';
    const again = step(w, { moss: f.assemble() });
    expect(again.outcomes.moss?.reason).toMatch(/resume it by target/);
    const resumed = step(w, { moss: mode('assemble', { target }) });
    expect(events(resumed.world, 'fiber-mat-resumed')).toHaveLength(1);
    expect(job(resumed.world)?.completedWork).toBe(3);
    expect(sum(lots(mat(resumed.world)))).toBe(40);
    w = resumed.world;
    const check = (world: V7World, reason: RegExp) => {
      const r = step(world, { moss: mode('assemble', { target }) });
      const e = events(r.world, 'fiber-mat-paused')[0];
      expect(e?.description).toMatch(reason);
      expect(job(r.world)?.completedWork).toBe(3);
      expect(actor(r.world).vitals.energy).toBeCloseTo(
        actor(step(world).world).vitals.energy,
        6,
      );
      return e;
    };
    const low = v7Clone(w);
    actor(low).vitals.energy = 0.5;
    expect(check(low, /Not enough energy/)?.data.requiredEnergy).toBe(1);
    const away = v7Clone(w);
    actor(away).position = { x: 17.5, y: 16.2 };
    check(away, /beyond working reach/);
    const crowded = v7Clone(w);
    actor(crowded, 'kai').position = { ...SITE };
    check(crowded, /Another person/);
  });

  it('cancels once: before the strip rounds all fiber returns, after them loose work stays and can only be dismantled', () => {
    const f = tested();
    const before = grass(f.w);
    let w = step(f.w, { moss: f.assemble() }).world;
    w = step(w, { moss: mode('cancel') }).world;
    expect(events(w, 'fiber-mat-cancelled')).toHaveLength(1);
    expect(mat(w)).toBeUndefined();
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(free(w).reduce((n, s) => n + tenths(s.quantity), 0)).toBe(49);
    expect(grass(w)).toBe(before);
    expect(step(w, { moss: mode('cancel') }).outcomes.moss?.success).toBe(
      false,
    );
    // After both strip rounds the fiber is in the work, which stays at the square.
    w = f.w;
    for (let i = 0; i < 3; i++) w = step(w, { moss: f.assemble() }).world;
    w = step(w, { moss: mode('cancel') }).world;
    const o = mat(w);
    expect(o?.data).toMatchObject({ status: 'loose', workId: null });
    expect(sum(lots(o))).toBe(40);
    expect(grass(w)).toBe(before);
    const target = o?.id ?? '';
    unchanged(w, mode('lift', { target }), /falls apart/);
    unchanged(w, mode('trial', { target }), /complete mat/);
    w = step(w, { moss: mode('dismantle', { target }) }).world;
    expect(mat(w)).toBeUndefined();
    expect(
      role(w, 'recovered').reduce((n, s) => n + tenths(s.quantity), 0),
    ).toBe(40);
    expect(grass(w)).toBe(before);
  });

  it('lets anyone who studied inspect and sit-test a complete mat on dry firm ground, with no comfort or other wellbeing effect', () => {
    const b = built();
    let w = step(b.w, {
      lin: { interface: 'learn', args: { ability: id } },
    }).world;
    for (let i = 0; i < 2; i++) w = step(w).world;
    expect(actor(w, 'lin').mastered).toContain(id);
    actor(w, 'lin').position = { x: 16.4, y: 15.7 };
    actor(w, 'lin').vitals.energy = 40;
    const target = b.target;
    const idle = step(w).world,
      looked = step(w, { lin: mode('inspect', { target }) }).world;
    const seen = events(looked, 'fiber-mat-inspected')[0];
    expect(seen?.actor).toBe('lin');
    expect(seen?.data).toMatchObject({
      status: 'complete',
      width: 0.45,
      length: 0.45,
      fiber: 3.7,
      moisture: null,
      looseEnds: false,
      maker: 'moss',
    });
    expect(
      actor(idle, 'lin').vitals.energy - actor(looked, 'lin').vitals.energy,
    ).toBeCloseTo(0.2, 6);
    expect(lots(mat(looked))).toEqual(lots(mat(idle)));
    // Only the maker moves, repairs or dismantles it.
    for (const m of ['lift', 'dismantle'])
      unchanged(w, mode(m, { target }), /Only the person who made/, 'lin');
    // Sitting needs the person on the mat, and no rain.
    unchanged(w, mode('trial', { target }), /Move onto the mat/, 'lin');
    actor(w, 'lin').position = { ...SITE };
    unchanged(rainy(w), mode('trial', { target }), /rain on the mat/, 'lin');
    const before = lots(mat(w))[0]?.condition ?? 0;
    const rest = step(w).world,
      sat = step(w, { lin: mode('trial', { target }) }).world;
    const t = events(sat, 'fiber-mat-trial')[0];
    expect(t?.data).toMatchObject({
      actor: 'lin',
      passed: true,
      weaveRetained: true,
      slipped: false,
      broke: false,
      ground: 'ordinary soil',
      rain: 0,
      comfort: 0,
    });
    expect(mat(sat)?.data.passedTrials).toEqual(['lin']);
    expect(
      actor(rest, 'lin').vitals.energy - actor(sat, 'lin').vitals.energy,
    ).toBeCloseTo(0.2, 6);
    // A person on the mat wears it 0.002 per round in both worlds.
    expect(before - (lots(mat(sat))[0]?.condition ?? 0)).toBeCloseTo(0.002, 8);
    // Physical wellbeing follows only the unchanged vitals formula: no cushioning term exists.
    expect(actor(sat, 'lin').wellbeing.physical).toBeCloseTo(
      physical(sat, actor(sat, 'lin')),
      6,
    );
    expect(actor(sat, 'lin').wellbeing.physical).toBeLessThan(
      actor(rest, 'lin').wellbeing.physical,
    );
    expect(JSON.stringify(actor(sat, 'lin').wellbeing.sources)).not.toContain(
      id,
    );
  });

  it('wears 0.0005 per round, 0.002 with a person on it, and needs repair below condition 0.5', () => {
    const b = built();
    const c0 = lots(mat(b.w))[0]?.condition ?? 0;
    let w = step(b.w).world;
    expect(c0 - (lots(mat(w))[0]?.condition ?? 0)).toBeCloseTo(0.0005, 8);
    const worn = v7Clone(w);
    for (const l of lots(mat(worn))) l.condition = 0.5003;
    w = step(worn).world;
    expect(mat(w)?.data.status).toBe('needs-repair');
    const e = events(w, 'fiber-mat-damaged')[0];
    expect(e?.data.condition).toBeCloseTo(0.4998, 8);
    expect(Number(e?.data.largestOpening)).toBeGreaterThan(0.03);
    actor(w).position = { ...SITE };
    unchanged(w, mode('trial', { target: b.target }), /complete mat/);
    const draw = CONTINUOUS_VISUALS[KIND];
    const o = mat(w);
    expect(o && draw ? draw(o, []) : '').toContain('#8b8273');
  });

  it('repairs only after inspection, replacing up to one unit of broken stems in three paid rounds, and conserves the fiber', () => {
    const b = built();
    let w = step(b.w, {
      moss: { interface: 'gather', args: { target: SOURCE, quantity: 1 } },
    }).world;
    const fresh = free(w).find((s) => s.quantity === 1)?.id ?? '';
    const worn = v7Clone(w);
    for (const l of lots(mat(worn))) l.condition = 0.45;
    w = step(worn).world;
    expect(mat(w)?.data.status).toBe('needs-repair');
    actor(w).vitals.energy = 40;
    const target = b.target,
      fix = mode('repair', {
        target,
        materials: [{ itemId: fresh, quantity: 1 }],
      });
    unchanged(w, fix, /Inspect the mat/);
    w = step(w, { moss: mode('inspect', { target }) }).world;
    unchanged(
      w,
      mode('repair', {
        target,
        materials: [{ itemId: b.grass, quantity: 0.9 }],
      }),
      /Exactly 1 units/,
    );
    const before = grass(w),
      e0 = actor(w).vitals.energy;
    let r = step(w, { moss: fix });
    w = r.world;
    expect(r.outcomes.moss?.complete).toBe(false);
    // Round 1 takes one unit of broken stems out as owned scrap.
    expect(sum(lots(mat(w)))).toBe(27);
    const removed = role(w, 'scrap');
    expect(removed.map((s) => s.quantity)).toEqual([1]);
    expect(mat(w)?.data.status).toBe('repairing');
    w = step(w, { moss: fix }).world;
    expect(sum(lots(mat(w)))).toBe(37);
    r = step(w, { moss: fix });
    w = r.world;
    expect(r.outcomes.moss?.complete).toBe(true);
    expect(events(w, 'fiber-mat-repaired')).toHaveLength(1);
    expect(events(w, 'fiber-mat-completed')).toHaveLength(1);
    const o = mat(w);
    expect(o?.data.status).toBe('complete');
    // 16.65 intact tenths kept plus 10 new ones over 37: never more than the weave supports.
    expect(Number(o?.data.condition)).toBeCloseTo(26.65 / 37, 2);
    expect(Number(o?.data.condition)).toBeLessThan(0.73);
    expect(grass(w)).toBe(before);
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(e0 - actor(w).vitals.energy).toBeCloseTo(3, 1);
  });

  it('lifts the same mat as carried load, keeps its fiber out of piecemeal drop, and places it on a clear square', () => {
    const b = built();
    const before = grass(b.w),
      load = v7Load(b.w, actor(b.w));
    unchanged(
      b.w,
      mode('place', { target: b.target, ...OTHER }),
      /Lift the mat/,
    );
    let w = step(b.w, { moss: mode('lift', { target: b.target }) }).world;
    const o = mat(w);
    expect(o?.data.holder).toBe('moss');
    expect(o?.id).toBe(b.target);
    expect(lots(o)).toHaveLength(0);
    const held = w.stacks.filter((s) => s.reservedFor === b.target);
    expect(held.reduce((n, s) => n + tenths(s.quantity), 0)).toBe(37);
    expect(held.every((s) => s.owner === 'moss')).toBe(true);
    expect(v7Load(w, actor(w)) - load).toBeCloseTo(0.37, 6);
    expect(grass(w)).toBe(before);
    const draw = CONTINUOUS_VISUALS[KIND];
    expect(o && draw ? draw(o, []) : '').toContain('rx=".05"');
    // Reserved mat fiber cannot be dropped piecemeal through the base transfer.
    const r = step(w, {
      moss: {
        interface: 'drop',
        args: { target: held[0]?.id ?? '', quantity: 0.1 },
      },
    });
    expect(r.outcomes.moss?.success).toBe(false);
    // The carried mat follows its holder.
    actor(w).position = { x: 15.2, y: 17.4 };
    w = step(w).world;
    expect(mat(w)?.spatial).toMatchObject({ x: 15.2, y: 17.4 });
    unchanged(
      w,
      mode('place', { target: b.target, x: 14.6, y: 17.2 }),
      /overlaps a plant/,
    );
    w = step(w, { moss: mode('place', { target: b.target, ...OTHER }) }).world;
    const placed = mat(w);
    expect(events(w, 'fiber-mat-placed')[0]?.data).toMatchObject({
      mat: b.target,
      ...OTHER,
    });
    expect(placed?.data.holder).toBeNull();
    expect(placed?.spatial).toMatchObject({ ...OTHER, solid: false });
    expect(sum(lots(placed))).toBe(37);
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(grass(w)).toBe(before);
  });

  it('dismantles into recovered fiber and scraps for 0.5 energy, without refund', () => {
    const b = built();
    const worn = v7Clone(b.w);
    for (const l of lots(mat(worn))) l.condition = 0.6005;
    const before = grass(worn),
      idle = step(worn).world;
    const w = step(worn, {
      moss: mode('dismantle', { target: b.target }),
    }).world;
    expect(mat(w)).toBeUndefined();
    const e = events(w, 'fiber-mat-dismantled')[0];
    expect(e?.data).toMatchObject({
      recoveredQuantity: 2.2,
      scrapQuantity: 1.5,
      energy: 0.5,
    });
    expect(actor(idle).vitals.energy - actor(w).vitals.energy).toBeCloseTo(
      0.5,
      6,
    );
    expect(grass(w)).toBe(before);
    expect(
      step(w, { moss: mode('dismantle', { target: b.target }) }).outcomes.moss
        ?.success,
    ).toBe(false);
  });

  it('stops at death, dropping reserved fiber where the person died, keeping the work, and lays a carried mat down', () => {
    const f = tested();
    let w = f.w;
    for (let i = 0; i < 2; i++) w = step(w, { moss: f.assemble() }).world;
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    const dead = v7Clone(w);
    pkg?.onDeath?.(dead, actor(dead));
    expect(job(dead)?.status).toBe('stopped');
    expect(events(dead, 'fiber-mat-failed')).toHaveLength(1);
    const at = actor(dead).position;
    const dropped = dead.stacks.filter(
      (s) =>
        s.owner === null &&
        s.resource === 'dry-grass' &&
        s.position.x === at.x &&
        s.position.y === at.y,
    );
    expect(dropped.reduce((n, s) => n + tenths(s.quantity), 0)).toBe(20);
    expect(dead.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(mat(dead)?.data).toMatchObject({ status: 'loose', workId: null });
    expect(sum(lots(mat(dead)))).toBe(20);
    expect(grass(dead)).toBe(grass(w));
    // A carried mat is left, as the same mat, where its holder died.
    const b = built();
    const lifted = step(b.w, {
      moss: mode('lift', { target: b.target }),
    }).world;
    pkg?.onDeath?.(lifted, actor(lifted));
    expect(mat(lifted)?.data.holder).toBeNull();
    expect(mat(lifted)?.spatial).toMatchObject(actor(lifted).position);
    expect(sum(lots(mat(lifted)))).toBe(37);
    expect(lifted.stacks.some((s) => s.reservedFor)).toBe(false);
  });
});

function sum(list: { quantity: number }[]) {
  return list.reduce((n, l) => n + tenths(l.quantity), 0);
}
