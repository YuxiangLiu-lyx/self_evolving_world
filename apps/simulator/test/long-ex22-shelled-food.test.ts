import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Load,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 60_000 });

const id = 'prepare-shelled-food';
const KERNEL = 'hazelnut-kernel';
const SHELL = 'hazelnut-shell';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition/i;
/** Lin's visible hazelnut plant, the nearest stone outcrop (the support) and an oak. */
const NUTS = 'start-1-nuts';
const ROCK = 'start-1-stone';
const OAK = 'forest-oak-0';
/** Standing points within reach of each source, outside their solid footprints. */
const AT_NUTS = { x: 15.4, y: 14.9 };
const AT_ROCK = { x: 15, y: 11.2 };
const AT_OAK = { x: 20.2, y: 20.14 };
const AWAY = { x: 15, y: 12.6 };
/** sha256 of JSON.stringify of every ex19, ex20 and ex21 package, taken before this change. */
const BEFORE: Record<string, string> = {
  'food-air-exposure-trial':
    'e09d11fb05989765f8e20b2e3fb18e8df4150a0e1c8e733a557baa8aee4a61a9',
  'thin-slice-food-drying-trial':
    '70acae9a94e8cfc871452a41a947050f192504f5fc6e4aeeb8a2f0b3f6933299',
  'cutting-edge-assessment':
    '3ca9a1f0d691fad71d4f6aaae3877ae70473a3af96f6785ed52433727ba01a49',
  'shell-compression-opening':
    '5ad34a508811e4cf8adb22d1cbd00452570653606136d7f54536bc3dfeb8d1f8',
  'lever-mass-comparator':
    '888531bb0cd81a57b01d5572d97ef7a5f4f9cc149ffb945efc12414458f2571f',
  'apply-marking-material':
    '67214432d1d7420a964bf31f3371d0faed6555c0af79a0ee534e0ae63ae74cde',
  'open-and-separate-sample':
    '0447c53a4506fd57bb73c6248850cc9a67519944b1bf03e7cbf1e82ddb1d87ed',
  'air-dry-food-trial':
    '71c63304b930efbeddad60f7f6b0cb19ea8e71392dac1dbba6540ad28f673cc9',
  'small-combustion-source':
    '88baf2ffeb6b0d808e0689e4c200cdb0083ba6ebff605ef89b6c903e26f88eb8',
  'beam-mass-comparator':
    '56faaa7eaa850bfb18351d752543f209170cb0fe4a8de3c5b6332ed79f94afc3',
  'compare-material-samples':
    'ff4341e7bfd194471305d64eb6a344925680aaba2d2ab60d6c54726acb227695',
  'targeted-food-constituent-test':
    '4e5e92968fb63048ff3d3a173b648bba40b19ed511ca37d0ea52b1a787f4668b',
};

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
const actor = (w: V7World, name = 'lin'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === type);
const data = (w: V7World, type: string) =>
  events(w, type).at(-1)?.data as Record<string, unknown> | undefined;
const stack = (w: V7World, item: string): V7Stack => {
  const s = w.stacks.find((s) => s.id === item);
  if (!s) throw new Error(`Missing stack ${item}.`);
  return s;
};
const resource = (w: V7World, name: string) => {
  const r = w.resources.find((r) => r.id === name);
  if (!r) throw new Error(`Missing resource ${name}.`);
  return r;
};
type Unit = {
  index: number;
  item: string | null;
  stage: string;
  damage: number;
  kernel: string | null;
  shell: string | null;
  verdict: string | null;
  ledger?: Record<string, { quantity: number; mass: number; item?: string }>;
};
type Shelling = {
  id: string;
  owner: string;
  status: string;
  stage: string;
  source: string;
  quantity: number;
  batch: string | null;
  method: string | null;
  implement: string | null;
  support: string | null;
  current: number;
  paidEnergy: number;
  completedWork: number;
  escrow: string[];
  outputs: string[];
  units: Unit[];
  held: string[];
  input: Record<string, unknown>;
  ledger: Record<string, number>;
  pausedAt: number | null;
};
const works = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Shelling);
const work = (w: V7World): Shelling => {
  const j = works(w).at(-1);
  if (!j) throw new Error('Missing shelling work.');
  return j;
};
const act = (mode: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});
const record = (s: V7Stack) =>
  (s.processing?.shelledFood ?? null) as Record<string, unknown> | null;
/** All material from Lin's hazelnut source still held as stacks, in whole-unit masses. */
const fromNuts = (w: V7World) =>
  w.stacks
    .filter((s) => s.origin === NUTS)
    .reduce((n, s) => n + s.quantity * resource(w, s.resource).mass, 0);
/** Nutrition and toxicity carried by every stack from Lin's hazelnut source. */
const value = (w: V7World, field: 'nutrition' | 'toxicity') =>
  w.stacks
    .filter((s) => s.origin === NUTS)
    .reduce((n, s) => n + s.quantity * resource(w, s.resource)[field], 0);
/** Keep everyone fed and rested so the tests isolate the operation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
function genesis() {
  return initialLongWorld('long-ex22', 'long-culture-v2', {
    seed: 20261202,
    development: 8,
    tokens: 1500000,
  });
}
function installed() {
  const g = genesis();
  return v7Clone(v7Install(g, continuousRegistry(g), `${id}@1`));
}
function gather(
  w: V7World,
  at: { x: number; y: number },
  target: string,
  n = 1,
) {
  actor(w).position = { ...at };
  const r = step(w, {
    lin: { interface: 'gather', args: { target, quantity: n } },
  });
  expect(r.outcomes.lin?.success).toBe(true);
  return fed(r.world);
}
const own = (w: V7World, res: string) =>
  w.stacks.filter((s) => s.owner === 'lin' && s.resource === res);
const ownId = (w: V7World, res: string) => {
  const s = own(w, res).find((s) => !s.reservedFor);
  if (!s) throw new Error(`Lin holds no ${res}.`);
  return s.id;
};
/** Lin gathers real hazelnuts and, optionally, a stone and an oak piece, then studies. */
function setup(opts: { study?: boolean; tools?: boolean; nuts?: number } = {}) {
  let w = installed();
  if (opts.tools) {
    w = gather(w, AT_OAK, OAK);
    w = gather(w, AT_ROCK, ROCK);
  }
  w = gather(w, AT_NUTS, NUTS, opts.nuts ?? 3);
  const nut = own(w, 'hazelnut')[0];
  if (!nut) throw new Error('Missing actually gathered hazelnuts.');
  if (opts.study ?? true) {
    w = step(w, { lin: { interface: 'learn', args: { ability: id } } }).world;
    expect(actor(w).learning).toMatchObject({ ability: id, remaining: 1 });
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  }
  return {
    w: fed(w),
    nut: nut.id,
    stone: opts.tools ? ownId(w, 'stone') : '',
    oak: opts.tools ? ownId(w, 'oak') : '',
  };
}
/** The action fails and changes no vitals, stacks or works compared with waiting. */
function unchanged(w: V7World, action: V7Action, who = 'lin') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(works(result.world))).toBe(v7Signature(works(idle)));
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action, who = 'lin') {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.success).toBe(true);
  return {
    world: r.world,
    outcome: r.outcomes[who],
    energy: actor(idle, who).vitals.energy - actor(r.world, who).vitals.energy,
  };
}
const press = (extra: Record<string, unknown> = {}) =>
  act('shell', { supportRef: ROCK, ...extra });

describe('prepare shelled food in ex22', () => {
  it('is scoped to ex22, fits the text limit, adds no drawing or reward and needs two rounds of study', () => {
    for (const [scope, scenario] of [
      ['long-ex20', 'long-culture-v2'],
      ['long-ex21', 'long-culture-v2-oldgoal'],
    ] as const) {
      const world = initialLongWorld(scope, scenario);
      expect(continuousRegistry(world).packages.map((p) => p.id)).not.toContain(
        id,
      );
      expect(() => v7Install(world, continuousRegistry(), `${id}@1`)).toThrow(
        /not approved/,
      );
    }
    // All packages together still register: handler ids stay unique.
    const all = continuousRegistry();
    expect(all.handlers['long.prepare-shelled-food']).toBeDefined();
    expect(all.handlers['long.open-and-separate-sample']).toBeDefined();
    const g = genesis();
    const registry = continuousRegistry(g);
    // The first ex22 development's two packages join the foundations in this scope, in order;
    // later ex22 developments' packages follow them.
    expect(
      registry.packages
        .filter(
          (p) => p.scope === 'long-ex22' && !p.id.startsWith('foundation-'),
        )
        .map((p) => p.id)
        .slice(0, 2),
    ).toEqual([id, 'draw-from-observation']);
    const pkg = registry.packages.find((p) => p.id === id);
    expect(pkg?.dependencies).toEqual(['foundation-open@1']);
    expect(pkg?.abilities).toHaveLength(1);
    const f = setup({ study: false });
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(2);
    expect(ability?.learningEnergy).toBeUndefined();
    expect(ability?.revision).toBe(`${id}@1`);
    expect(ability?.parameters.properties?.mode).toMatchObject({
      enum: ['inspect', 'shell', 'cancel'],
    });
    expect(ability?.references).toEqual({
      targetStack: 'optional-exact-visible',
      supportRef: 'optional-exact-visible',
      implementRef: 'optional-exact-visible',
    });
    const limit = f.w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    for (const a of pkg?.abilities ?? [])
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg?.abilities,
      events: pkg?.events,
      satisfaction: pkg?.satisfaction.map((r) => r.name),
      resources: pkg?.resources.map((r) => r.name),
    });
    expect(visible).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    expect(pkg?.visualComponents).toEqual([]);
    expect(pkg?.satisfaction).toEqual([]);
    // Unstudied use is refused without any cost; two study rounds master it.
    expect(unchanged(f.w, act('inspect', { targetStack: f.nut }))).toMatch(
      /master|learn|stud/i,
    );
    let w = step(f.w, {
      lin: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(actor(w).mastered).not.toContain(id);
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  });

  it('keeps every ex19, ex20 and ex21 package byte-identical and reuses the ex20 hazelnut parts', () => {
    for (const [pid, hash] of Object.entries(BEFORE)) {
      const p = V7_PACKAGES.find((x) => x.id === pid);
      expect(p).toBeDefined();
      expect(createHash('sha256').update(JSON.stringify(p)).digest('hex')).toBe(
        hash,
      );
    }
    const ex20 = V7_PACKAGES.find((p) => p.id === 'open-and-separate-sample');
    const mine = V7_PACKAGES.find((p) => p.id === id);
    expect(mine?.resources).toEqual(ex20?.resources);
    const w = installed();
    const nut = resource(w, 'hazelnut'),
      kernel = resource(w, KERNEL),
      shell = resource(w, SHELL);
    expect(nut).toMatchObject({ mass: 0.2, nutrition: 18, toxicity: 0 });
    expect(0.4 * kernel.nutrition + 0.6 * shell.nutrition).toBe(nut.nutrition);
    expect(0.4 * kernel.toxicity + 0.6 * shell.toxicity).toBe(nut.toxicity);
    expect(kernel.mass).toBe(nut.mass);
    expect(shell.mass).toBe(nut.mass);
  });

  it('inspects whole units by eye for 0.2 energy each and changes nothing for sound nuts', () => {
    const f = setup();
    const idle = step(f.w).world;
    const r = cost(f.w, act('inspect', { targetStack: f.nut, quantity: 3 }));
    expect(r.energy).toBeCloseTo(0.6, 8);
    const w = r.world;
    expect(events(w, 'shelled-food-inspect-started')).toHaveLength(1);
    expect(events(w, 'shelled-food-defect-observed')).toHaveLength(0);
    const seen = data(w, 'shelled-food-inspected') as {
      observation: Record<string, unknown>;
      view: Record<string, unknown>;
    };
    expect(seen.observation).toMatchObject({
      quantity: 3,
      maturity: 'ripe: taken as ripe stock from a plant',
      shell: 'intact',
      deterioration: 'little observable deterioration',
      spoiled: false,
      verdict: 'accepted for shelling',
      setAside: null,
    });
    expect(String(seen.observation.mould)).toMatch(/not represented/);
    expect(String(seen.observation.infestation)).toMatch(/not represented/);
    expect(seen.view).toMatchObject({ phase: 'inspect', badge: null });
    // Only time and energy were spent: the nuts are untouched and nothing is reserved.
    expect(v7Signature(w.stacks)).toBe(v7Signature(idle.stacks));
    expect(works(w)).toHaveLength(0);
    // An unverified personal record: external inspection is not a safety test.
    expect(
      actor(w).memory.knowledge?.[`${f.nut}:shelled-food-inspection`],
    ).toMatchObject({ verified: false });
    // More units than held are refused before any charge.
    expect(
      unchanged(fed(w), act('inspect', { targetStack: f.nut, quantity: 4 })),
    ).toMatch(/holds 3/);
  });

  it('sets visibly deteriorated units aside as a rejected item that is not shelled', () => {
    const f = setup();
    const w0 = v7Clone(f.w);
    // 300 of 800 rounds: observable deterioration under the examine-food classes.
    stack(w0, f.nut).decay = 300;
    const r = cost(w0, act('inspect', { targetStack: f.nut, quantity: 2 }));
    expect(r.energy).toBeCloseTo(0.4, 8);
    const w = fed(r.world);
    expect(data(w, 'shelled-food-defect-observed')).toMatchObject({
      defect: 'observable deterioration',
      rejected: true,
    });
    const seen = data(w, 'shelled-food-inspected') as {
      observation: { setAside: string; verdict: string };
    };
    expect(seen.observation.verdict).toBe('rejected');
    const reject = stack(w, seen.observation.setAside);
    expect(reject).toMatchObject({
      resource: 'hazelnut',
      quantity: 2,
      owner: 'lin',
      origin: NUTS,
    });
    expect(record(reject)).toMatchObject({
      verdict: 'rejected',
      reasons: ['observable deterioration'],
    });
    // The rest of the source is unchanged; nothing was created or lost.
    expect(stack(w, f.nut).quantity).toBe(1);
    expect(fromNuts(w)).toBeCloseTo(3 * 0.2, 8);
    // Rejected and deteriorated units are not shelled; nothing is spent.
    expect(
      unchanged(w, press({ targetStack: reject.id, quantity: 1 })),
    ).toMatch(/set aside as rejected/);
    expect(unchanged(w, act('shell', { targetStack: f.nut }))).toMatch(
      /inspection would reject it/,
    );
  });

  it('a bare-hand round costs 0.5 energy, leaves the shell intact and stops as an unmet prerequisite', () => {
    const f = setup();
    // hand-break-food@1's bounded hand force spread over a 0.2-mass unit stays below the
    // hazelnut's strength of hardness 4 / 10, as ex20 found.
    const nut = resource(f.w, 'hazelnut');
    expect(0.1 / nut.mass ** (2 / 3)).toBeLessThan(
      (nut.properties?.hardness ?? 0) / 10,
    );
    const load = v7Load(f.w, actor(f.w));
    const r = cost(f.w, act('shell', { targetStack: f.nut, quantity: 2 }));
    expect(r.energy).toBeCloseTo(0.5, 8);
    expect(r.outcome?.complete).toBe(true);
    let w = fed(r.world);
    const j = work(w);
    expect(j).toMatchObject({
      owner: 'lin',
      status: 'paused',
      quantity: 2,
      method: 'hand',
      held: ['hand'],
      paidEnergy: 0.5,
      input: { quantity: 2, mass: 0.4, origin: NUTS, resource: 'hazelnut' },
    });
    expect(j.units[0]).toMatchObject({ stage: 'intact', damage: 0 });
    // Exactly the batch is reserved from the exact stack; carried load is unchanged.
    expect(stack(w, f.nut)).toMatchObject({ quantity: 1, owner: 'lin' });
    const reservedUnits = w.stacks.filter((s) => s.reservedFor === j.id);
    expect(reservedUnits.map((s) => s.quantity).sort()).toEqual([1, 1]);
    expect(reservedUnits.every((s) => s.processing === undefined)).toBe(true);
    expect(v7Load(w, actor(w))).toBeCloseTo(load, 8);
    expect(events(w, 'shelled-food-shelling-started')).toHaveLength(1);
    expect(data(w, 'shelled-food-pressed')).toMatchObject({
      response: 'intact',
      newDamage: false,
      view: { method: 'hand', shell: 'intact', badge: null },
    });
    expect(data(w, 'shelled-food-failed')).toMatchObject({
      result: 'unmet prerequisite',
    });
    expect(events(w, 'shelled-food-shell-cracked')).toHaveLength(0);
    expect(JSON.stringify(data(w, 'shelled-food-pressed'))).not.toMatch(
      /strength|load|hardness/,
    );
    expect(
      actor(w).memory.knowledge?.['hazelnut:shell-press:hand:held'],
    ).toMatchObject({ verified: true, value: { response: 'held' } });
    // The same futile method is refused at no cost, in this work and in a new one.
    expect(unchanged(w, act('shell'))).toMatch(
      /already left this shell intact/,
    );
    w = fed(step(w, { lin: act('cancel') }).world);
    expect(work(w)).toMatchObject({ status: 'stopped', stage: 'stopped' });
    expect(data(w, 'shelled-food-stopped')).toMatchObject({
      cause: 'cancelled',
    });
    expect(own(w, 'hazelnut').reduce((n, s) => n + s.quantity, 0)).toBe(3);
    expect(own(w, 'hazelnut').every((s) => !s.reservedFor)).toBe(true);
    expect(
      unchanged(w, act('shell', { targetStack: f.nut, quantity: 1 })),
    ).toMatch(/Your own trial showed that a bare hand does not crack/);
  });

  it('a stone on the rock shells a batch in two rounds per unit, conserving mass and food value', () => {
    const f = setup({ tools: true });
    let w = f.w;
    actor(w).position = { ...AT_ROCK };
    const mass = fromNuts(w),
      nutrition = value(w, 'nutrition'),
      toxicity = value(w, 'toxicity'),
      decay = stack(w, f.nut).decay ?? 0;
    let total = 0;
    const outcomes: boolean[] = [];
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = cost(
        w,
        i === 0
          ? press({ targetStack: f.nut, quantity: 2, implementRef: f.stone })
          : act('shell'),
      );
      total += r.energy;
      outcomes.push(r.outcome?.complete ?? false);
      seen.push(...r.world.events.map((e) => e.type));
      expect(r.energy).toBeCloseTo(0.5, 8);
      w = fed(r.world);
      if (i === 0) {
        expect(work(w).units[0]).toMatchObject({ stage: 'opened', damage: 1 });
        expect(data(w, 'shelled-food-shell-cracked')).toMatchObject({
          view: { shell: 'split open', substep: 'separate', badge: null },
        });
      }
    }
    // Two units: four active rounds at 0.5 energy, the last one completing the work.
    expect(total).toBeCloseTo(2, 8);
    expect(outcomes).toEqual([false, false, false, true]);
    const j = work(w);
    expect(j).toMatchObject({
      status: 'completed',
      stage: 'completed',
      completedWork: 4,
      paidEnergy: 2,
      method: 'supported',
      implement: f.stone,
      support: ROCK,
      ledger: { input: 2, kernel: 0.8, shell: 1.2, rejects: 0, losses: 0 },
    });
    const count = (type: string) => seen.filter((t) => t === type).length;
    expect(count('shelled-food-shelling-started')).toBe(1);
    expect(count('shelled-food-pressed')).toBe(2);
    expect(count('shelled-food-shell-cracked')).toBe(2);
    expect(count('shelled-food-kernel-separated')).toBe(2);
    expect(count('shelled-food-completed')).toBe(1);
    expect(count('shelled-food-failed')).toBe(0);
    expect(count('process-progress')).toBe(4);
    expect(w.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
    // One kernel and one shell item per unit, carrying origin, harvest and decay.
    const kernels = own(w, KERNEL),
      shells = own(w, SHELL);
    expect(kernels.map((s) => s.quantity)).toEqual([0.4, 0.4]);
    expect(shells.map((s) => s.quantity)).toEqual([0.6, 0.6]);
    for (const k of kernels) {
      expect(k).toMatchObject({
        origin: NUTS,
        owner: 'lin',
        quantityTenths: 4,
      });
      expect(k.decay ?? 0).toBeGreaterThanOrEqual(decay);
      expect(record(k)).toMatchObject({
        part: 'kernel',
        verdict: 'unverified shelled specimen',
        certified: false,
        implement: f.stone,
        support: ROCK,
      });
    }
    for (const s of shells)
      expect(record(s)).toMatchObject({ part: 'shell', verdict: 'waste' });
    for (const u of j.units) {
      const l = u.ledger ?? {};
      const parts = ['kernel', 'shell', 'rejects', 'losses'];
      expect(parts.reduce((n, k) => n + (l[k]?.quantity ?? 0), 0)).toBeCloseTo(
        1,
        8,
      );
      expect(parts.reduce((n, k) => n + (l[k]?.mass ?? 0), 0)).toBeCloseTo(
        0.2,
        8,
      );
    }
    // The third hazelnut is untouched; mass, nutrition and toxicity are conserved.
    expect(stack(w, f.nut)).toMatchObject({ quantity: 1 });
    expect(stack(w, f.nut).processing).toBeUndefined();
    expect(fromNuts(w)).toBeCloseTo(mass, 8);
    expect(value(w, 'nutrition')).toBeCloseTo(nutrition, 8);
    expect(value(w, 'nutrition')).toBeLessThanOrEqual(nutrition + 1e-9);
    expect(value(w, 'toxicity')).toBeCloseTo(toxicity, 8);
    // Tool and support are unchanged.
    expect(stack(w, f.stone)).toMatchObject({ owner: 'lin', quantity: 1 });
    expect(stack(w, f.stone).processing).toBeUndefined();
    // Verified records of the real results; no badge, milestone or reward.
    expect(
      actor(w).memory.knowledge?.['hazelnut:shell-press:stone-on-stone:opened'],
    ).toMatchObject({ verified: true });
    expect(
      actor(w).memory.knowledge?.[
        'hazelnut:shelled-kernel:unverified shelled specimen:little observable deterioration'
      ],
    ).toMatchObject({ verified: true });
    expect(data(w, 'shelled-food-completed')).toMatchObject({
      view: { badge: null, outputs: { rejects: [] } },
    });
    const mine = (type: string) =>
      events(w, type).filter((e) => e.actor === 'lin');
    expect(mine('practice-confirmed')).toHaveLength(0);
    expect(mine('satisfaction')).toHaveLength(0);
    expect(actor(w).wellbeing.sources.map((s) => s.source)).toEqual(
      actor(f.w).wellbeing.sources.map((s) => s.source),
    );
  });

  it('keeps the ex20 limits: a 0.4 kernel cannot be eaten through eat, the whole nut still can', () => {
    const f = setup({ tools: true });
    let w = f.w;
    actor(w).position = { ...AT_ROCK };
    w = fed(
      step(w, {
        lin: press({ targetStack: f.nut, quantity: 2, implementRef: f.stone }),
      }).world,
    );
    for (let i = 0; i < 3; i++) w = fed(step(w, { lin: act('shell') }).world);
    const kernel = own(w, KERNEL)[0]?.id ?? '';
    for (const action of [
      { interface: 'eat', args: { target: kernel, quantity: 0.4 } },
      { interface: 'eat', args: { target: kernel, quantity: 1 } },
      { interface: 'eat', args: { target: `resource:${KERNEL}`, quantity: 1 } },
    ])
      expect(unchanged(w, action)).not.toBe('');
    const meal = step(w, {
      lin: { interface: 'eat', args: { target: f.nut, quantity: 1 } },
    }).world;
    expect(data(meal, 'ate')).toMatchObject({
      resource: 'hazelnut',
      quantity: 1,
      nutrition: 18,
    });
    // The kernel keeps ageing; the inedible shell does not decay.
    const later = step(w).world;
    const shell = own(w, SHELL)[0]?.id ?? '';
    expect(stack(later, kernel).decay ?? 0).toBeGreaterThan(
      stack(w, kernel).decay ?? 0,
    );
    expect(stack(later, shell).decay).toBe(stack(w, shell).decay);
  });

  it('keeps a visibly deteriorated kernel as a rejected item, counted as a reject, not food', () => {
    const f = setup({ tools: true, nuts: 1 });
    let w = f.w;
    actor(w).position = { ...AT_ROCK };
    w = fed(
      step(w, {
        lin: press({ targetStack: f.nut, implementRef: f.stone }),
      }).world,
    );
    // The split unit ages to observable deterioration before its separation round.
    stack(w, work(w).units[0]?.item ?? '').decay = 300;
    const r = cost(w, act('shell'));
    expect(r.energy).toBeCloseTo(0.5, 8);
    w = r.world;
    expect(work(w)).toMatchObject({
      status: 'completed',
      ledger: { input: 1, kernel: 0, shell: 0.6, rejects: 0.4, losses: 0 },
    });
    const kernel = own(w, KERNEL)[0];
    if (!kernel) throw new Error('Missing rejected kernel.');
    expect(kernel.quantity).toBe(0.4);
    expect(record(kernel)).toMatchObject({
      verdict: 'rejected',
      certified: false,
      condition: 'observable deterioration',
    });
    expect(data(w, 'shelled-food-defect-observed')).toMatchObject({
      defect: 'observable deterioration',
      rejected: true,
    });
    expect(data(w, 'shelled-food-completed')).toMatchObject({
      view: { outputs: { kernels: [], rejects: [kernel.id] }, badge: null },
    });
    // Rejecting launders nothing: the material and its food value stay as they were.
    expect(value(w, 'nutrition')).toBeCloseTo(18, 8);
    expect(fromNuts(w)).toBeCloseTo(0.2, 8);
  });

  it('an oak piece only cracks the shell, so the unit takes extra press rounds', () => {
    const f = setup({ tools: true, nuts: 1 });
    let w = f.w;
    actor(w).position = { ...AT_ROCK };
    const responses: string[] = [];
    const seen: string[] = [];
    let total = 0;
    for (let i = 0; i < 4; i++) {
      const r = cost(
        w,
        i === 0
          ? press({ targetStack: f.nut, implementRef: f.oak })
          : act('shell'),
      );
      total += r.energy;
      seen.push(...r.world.events.map((e) => e.type));
      w = fed(r.world);
      responses.push(String(work(w).units[0]?.stage));
    }
    // Oak passes 0.7 x (1 - 0.2) = 0.56 against 0.4: damage 0.4 per press, open at the third.
    expect(responses).toEqual(['cracked', 'cracked', 'opened', 'separated']);
    expect(total).toBeCloseTo(2, 8);
    expect(seen.filter((t) => t === 'shelled-food-shell-cracked')).toHaveLength(
      3,
    );
    expect(work(w)).toMatchObject({ status: 'completed' });
    expect(own(w, KERNEL).map((s) => s.quantity)).toEqual([0.4]);
  });

  it('pauses between substeps at no charge and resumes after rechecks', () => {
    const f = setup({ tools: true });
    let w = f.w;
    actor(w).position = { ...AT_ROCK };
    w = fed(
      step(w, {
        lin: press({ targetStack: f.nut, quantity: 2, implementRef: f.stone }),
      }).world,
    );
    // An unworked round pauses the work between substeps; nothing is charged.
    const idle = step(w);
    expect(actor(idle.world).vitals.energy).toBe(
      step(w).world.actors.find((a) => a.id === 'lin')?.vitals.energy,
    );
    w = fed(idle.world);
    expect(work(w)).toMatchObject({ status: 'paused' });
    expect(events(w, 'shelled-food-paused')).toHaveLength(1);
    // Darkness: the resumed round pauses again before any charge.
    const dark = v7Clone(w);
    dark.time = (dark.config.forest?.day ?? 80) * 0.6;
    const night = step(dark, { lin: act('shell') });
    expect(night.outcomes.lin?.success).toBe(true);
    expect(actor(night.world).vitals.energy).toBe(
      step(dark).world.actors.find((a) => a.id === 'lin')?.vitals.energy,
    );
    expect(data(night.world, 'shelled-food-paused')).toMatchObject({
      status: 'paused',
    });
    // Out of reach of the support only matters for press rounds; the split unit separates.
    actor(w).position = { ...AWAY };
    const r = cost(w, act('shell'));
    expect(r.energy).toBeCloseTo(0.5, 8);
    expect(events(r.world, 'shelled-food-resumed')).toHaveLength(1);
    w = fed(r.world);
    expect(work(w).units[0]).toMatchObject({ stage: 'separated' });
    // The next press round needs the support in reach: it pauses at no charge.
    const away = step(w, { lin: act('shell') });
    expect(away.outcomes.lin?.success).toBe(true);
    expect(data(away.world, 'shelled-food-paused')).toBeDefined();
    expect(actor(away.world).vitals.energy).toBe(
      step(w).world.actors.find((a) => a.id === 'lin')?.vitals.energy,
    );
    w = fed(away.world);
    actor(w).position = { ...AT_ROCK };
    const back = cost(w, act('shell'));
    expect(back.energy).toBeCloseTo(0.5, 8);
    expect(work(back.world).units[1]).toMatchObject({ stage: 'opened' });
    // Cancel returns the opened unit as it is; a new work separates it in one round.
    w = fed(step(back.world, { lin: act('cancel') }).world);
    const open = own(w, 'hazelnut').find((s) => record(s)?.stage === 'opened');
    expect(open).toBeDefined();
    expect(open?.reservedFor).toBeUndefined();
    expect(own(w, KERNEL)).toHaveLength(1);
    const again = cost(w, act('shell', { targetStack: open?.id }));
    expect(again.energy).toBeCloseTo(0.5, 8);
    expect(again.outcome?.complete).toBe(true);
    expect(own(again.world, KERNEL)).toHaveLength(2);
    expect(work(again.world)).toMatchObject({ status: 'completed' });
  });

  it('refuses invalid requests before any charge', () => {
    const f = setup({ tools: true });
    const w = f.w;
    actor(w).position = { ...AT_ROCK };
    const kernelLike = act('inspect', { targetStack: f.stone });
    expect(unchanged(w, kernelLike)).toMatch(
      /No shell and kernel are represented for stone/,
    );
    expect(unchanged(w, act('shell'))).toMatch(/Give targetStack/);
    expect(
      unchanged(w, act('shell', { targetStack: f.nut, quantity: 1.5 })),
    ).not.toBe('');
    expect(
      unchanged(w, act('shell', { targetStack: f.nut, quantity: 6 })),
    ).not.toBe('');
    expect(
      unchanged(
        w,
        press({ targetStack: f.nut, supportRef: '', implementRef: f.stone }),
      ),
    ).toMatch(/needs both implementRef/);
    expect(unchanged(w, press({ targetStack: f.nut }))).toMatch(
      /needs both implementRef/,
    );
    expect(
      unchanged(w, press({ targetStack: f.nut, implementRef: f.nut })),
    ).toMatch(/must be different/);
    // A plant is no support; food is no implement.
    expect(
      unchanged(
        w,
        press({ targetStack: f.nut, implementRef: f.stone, supportRef: NUTS }),
      ),
    ).not.toBe('');
    // Loose material lying on the rock makes it unclean.
    const dirty = v7Clone(w);
    dirty.stacks.push({
      ...stack(dirty, f.oak),
      id: 'item-0-none-9',
      owner: null,
      position: { x: 15, y: 10.5 },
    });
    expect(
      unchanged(dirty, press({ targetStack: f.nut, implementRef: f.stone })),
    ).toMatch(/not clean/);
    // Out of reach of the support.
    const far = v7Clone(w);
    actor(far).position = { ...AWAY };
    expect(
      unchanged(far, press({ targetStack: f.nut, implementRef: f.stone })),
    ).toMatch(/within reach of the support/);
    // No light, no work.
    const dark = v7Clone(w);
    dark.time = (dark.config.forest?.day ?? 80) * 0.6;
    expect(
      unchanged(dark, press({ targetStack: f.nut, implementRef: f.stone })),
    ).toMatch(/too dark/);
    expect(unchanged(dark, act('inspect', { targetStack: f.nut }))).toMatch(
      /too dark/,
    );
    // Too little energy.
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.3;
    expect(
      unchanged(tired, press({ targetStack: f.nut, implementRef: f.stone })),
    ).toMatch(/0.5 energy/);
    expect(
      unchanged(tired, act('inspect', { targetStack: f.nut, quantity: 2 })),
    ).toMatch(/0.4 energy/);
    // One open work at a time; cancel with nothing open.
    expect(unchanged(w, act('cancel'))).toMatch(/no open shelling work/);
    const started = fed(
      step(w, {
        lin: press({ targetStack: f.nut, quantity: 1, implementRef: f.stone }),
      }).world,
    );
    expect(unchanged(started, act('shell', { targetStack: f.stone }))).toMatch(
      /still open/,
    );
    expect(
      unchanged(started, act('shell', { workId: 'manual-0-none-1' })),
    ).toMatch(/No shelling work of yours/);
  });

  it('is owner-only: no one else can continue, cancel or use Lin’s units, implement or work', () => {
    const f = setup({ tools: true });
    let w = f.w;
    actor(w).position = { ...AT_ROCK };
    w = fed(
      step(w, {
        lin: press({ targetStack: f.nut, quantity: 2, implementRef: f.stone }),
      }).world,
    );
    actor(w, 'moss').position = { x: AT_ROCK.x + 0.5, y: AT_ROCK.y + 0.1 };
    w = fed(
      step(w, { moss: { interface: 'learn', args: { ability: id } } }).world,
    );
    w = fed(step(w).world);
    expect(actor(w, 'moss').mastered).toContain(id);
    const j = work(w);
    expect(unchanged(w, act('shell', { workId: j.id }), 'moss')).toMatch(
      /No shelling work of yours/,
    );
    expect(unchanged(w, act('cancel'), 'moss')).toMatch(
      /no open shelling work/,
    );
    expect(
      unchanged(w, act('inspect', { targetStack: f.nut }), 'moss'),
    ).toMatch(/absent-or-inaccessible/);
    expect(
      unchanged(
        w,
        press({ targetStack: f.nut, implementRef: f.stone }),
        'moss',
      ),
    ).toMatch(/absent-or-inaccessible/);
    // Lin's reserved units cannot be eaten or given away until the work ends.
    const unit = j.escrow[0] ?? '';
    expect(
      unchanged(w, { interface: 'eat', args: { target: unit, quantity: 1 } }),
    ).toMatch(/reserved|unavailable/);
    expect(work(w)).toMatchObject({ owner: 'lin' });
  });

  it('death stops the work and drops the reserved units once where Lin fell; spoilage ends it', () => {
    const f = setup({ tools: true });
    let w = f.w;
    actor(w).position = { ...AT_ROCK };
    w = fed(
      step(w, {
        lin: press({ targetStack: f.nut, quantity: 2, implementRef: f.stone }),
      }).world,
    );
    const dying = v7Clone(w);
    actor(dying).vitals.health = 0.0001;
    actor(dying).vitals.satiety = 0;
    const where = { ...actor(dying).position };
    const units = work(dying).escrow;
    const died = step(dying).world;
    expect(events(died, 'died')).toHaveLength(1);
    expect(work(died)).toMatchObject({ status: 'stopped', stage: 'stopped' });
    expect(data(died, 'shelled-food-stopped')).toMatchObject({
      cause: 'death',
    });
    for (const u of units)
      expect(stack(died, u)).toMatchObject({ owner: null, position: where });
    expect(died.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
    expect(fromNuts(died)).toBeCloseTo(fromNuts(w), 8);
    // A reserved unit that spoils ends the work; the rest returns to Lin.
    const spoiling = v7Clone(w);
    const opened = work(spoiling).units[0]?.item ?? '';
    stack(spoiling, opened).decay = 799.999;
    const later = step(spoiling).world;
    expect(events(later, 'spoiled').length).toBeGreaterThan(0);
    expect(work(later)).toMatchObject({ stage: 'failed', paidEnergy: 0.5 });
    expect(data(later, 'shelled-food-failed')).toMatchObject({
      result: 'material lost',
    });
    expect(later.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
    expect(own(later, 'hazelnut').reduce((n, s) => n + s.quantity, 0)).toBe(2);
  });
});
