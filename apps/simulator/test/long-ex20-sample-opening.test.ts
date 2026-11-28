import { describe, expect, it, vi } from 'vitest';
import {
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

const id = 'open-and-separate-sample';
const KERNEL = 'hazelnut-kernel';
const SHELL = 'hazelnut-shell';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition/i;
/** Lin's ex20 hazelnut plant, the nearest stone outcrop (also the rigid support) and an oak. */
const NUTS = 'start-1-nuts';
const ROCK = 'start-1-stone';
const OAK = 'forest-oak-0';
/** Standing points within reach of each source, outside their solid footprints. */
const AT_NUTS = { x: 15.4, y: 14.9 };
const AT_ROCK = { x: 15, y: 11.2 };
const AT_OAK = { x: 20.2, y: 20.14 };
/** A point well out of reach of the rock. */
const AWAY = { x: 15, y: 12.6 };

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
type Opening = {
  id: string;
  owner: string;
  status: string;
  stage: string;
  source: string;
  specimen: string;
  method: string | null;
  tool: string | null;
  support: string | null;
  damage: number;
  paidEnergy: number;
  escrow: string[];
  input: Record<string, unknown>;
  attempts: { response: string; crack: number; method: string }[];
  ledger: Record<string, { quantity: number; mass: number; item?: string }>;
  products: { contents: string | null; enclosure: string | null };
  observation: Record<string, unknown> | null;
  pausedAt: number | null;
};
const works = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Opening);
const work = (w: V7World): Opening => {
  const j = works(w).at(-1);
  if (!j) throw new Error('Missing opening work.');
  return j;
};
const act = (mode: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});
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
function installed() {
  const genesis = initialLongWorld('long-ex20', 'long-culture-v2', {
    seed: 20261201,
    development: 8,
    tokens: 1500000,
  });
  return v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
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
/** Lin gathers real hazelnuts (two, as in ex20) and, optionally, a stone and an oak piece. */
function setup(opts: { study?: boolean; tools?: boolean; nuts?: number } = {}) {
  let w = installed();
  if (opts.tools) {
    w = gather(w, AT_OAK, OAK);
    w = gather(w, AT_ROCK, ROCK);
  }
  w = gather(w, AT_NUTS, NUTS, opts.nuts ?? 2);
  const nut = own(w, 'hazelnut')[0];
  if (!nut) throw new Error('Missing actually gathered hazelnuts.');
  expect(nut.quantity).toBe(opts.nuts ?? 2);
  if (opts.study ?? true) {
    w = step(w, { lin: { interface: 'learn', args: { ability: id } } }).world;
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
const hand = (nut: string) =>
  act('open', { sourceId: nut, quantity: 1, method: 'hand' });
const press = (extra: Record<string, unknown>) =>
  act('open', { method: 'supported-tool', supportRef: ROCK, ...extra });
/** Lin at the rock opens one hazelnut with the stone in one paid attempt. */
function opened() {
  const f = setup({ tools: true });
  actor(f.w).position = { ...AT_ROCK };
  const r = cost(f.w, press({ sourceId: f.nut, toolId: f.stone }));
  expect(r.energy).toBeCloseTo(0.5, 8);
  return { ...f, w: fed(r.world) };
}

describe('open and separate a sample in ex20', () => {
  it('is scoped to ex20, fits the text limit, adds no reward source or drawing and needs one round of study', () => {
    for (const [scope, scenario] of [
      ['long-ex19', 'long-culture-v2-oldgoal'],
      ['long-ex18', 'long-culture-v2-incentives'],
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
    expect(all.handlers['long.open-and-separate-sample']).toBeDefined();
    expect(all.handlers['long.shell-compression-opening']).toBeDefined();
    expect(all.handlers['long.apply-marking-material']).toBeDefined();
    const f = setup({ study: false });
    const registry = continuousRegistry(f.w);
    const pkg = registry.packages.find((p) => p.id === id);
    // ex19's opening package is not part of this run; ex20's marking package still is.
    expect(registry.packages.map((p) => p.id)).not.toContain(
      'shell-compression-opening',
    );
    expect(registry.packages.map((p) => p.id)).toContain(
      'apply-marking-material',
    );
    expect(pkg?.scope).toBe('long-ex20');
    expect(pkg?.dependencies).toEqual(['foundation-open@1']);
    expect(pkg?.abilities).toHaveLength(1);
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(1);
    expect(ability?.revision).toBe(`${id}@1`);
    expect(ability?.parameters.properties?.mode).toMatchObject({
      enum: ['open', 'separate', 'cancel'],
    });
    expect(ability?.parameters.properties?.method).toMatchObject({
      enum: ['hand', 'supported-tool'],
    });
    expect(ability?.references).toEqual({
      sourceId: 'optional-exact-visible',
      toolId: 'optional-exact-visible',
      supportRef: 'optional-exact-visible',
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
    // Drawing metadata travels on events; no drawing and no satisfaction source is added.
    expect(pkg?.visualComponents).toEqual([]);
    expect(pkg?.satisfaction).toEqual([]);
    expect(f.w.config.longDevelopment?.culture?.incentives).toBe(false);
    // Unstudied use is refused without any cost.
    expect(unchanged(f.w, hand(f.nut))).toMatch(/master|learn|stud/i);
    let w = step(f.w, {
      lin: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(actor(w).mastered).toContain(id);
    w = fed(w);
    expect(step(w, { lin: hand(f.nut) }).outcomes.lin?.success).toBe(true);
  });

  it('defines the hazelnut parts so that their masses, nutrition and toxicity sum to the unit', () => {
    const { w } = setup({ study: false });
    const nut = resource(w, 'hazelnut'),
      kernel = resource(w, KERNEL),
      shell = resource(w, SHELL);
    // The unit row is unchanged; one unit of either part is one whole unit's mass.
    expect(nut).toMatchObject({ mass: 0.2, nutrition: 18, toxicity: 0 });
    expect(kernel.mass).toBe(nut.mass);
    expect(shell.mass).toBe(nut.mass);
    // Kernel 0.4 and shell 0.6 of the unit: the kernel carries all nutrition, the shell none.
    expect(0.4 * kernel.nutrition + 0.6 * shell.nutrition).toBe(nut.nutrition);
    expect(0.4 * kernel.toxicity + 0.6 * shell.toxicity).toBe(nut.toxicity);
    expect(shell).toMatchObject({
      nutrition: 0,
      toxicity: 0,
      color: nut.color,
    });
    // The kernel eats like its unit (same ingredient, method and quality) and keeps its
    // decay lifetime; the inedible shell keeps the unit's strength and does not decay.
    expect(kernel.food).toEqual({
      ingredients: [{ resource: 'hazelnut', share: 1 }],
      method: 'unprocessed',
      quality: 0.8,
    });
    expect(kernel.properties).toEqual(nut.properties);
    expect(shell.properties).toEqual({ ...nut.properties, decay: 0 });
  });

  it('a bare-hand squeeze costs one round and 0.5 energy, leaves the hazelnut intact and is recorded once', () => {
    const f = setup();
    // The bounded hand force of hand-break-food@1 (0.1 on its size-scaled scale) spread over a
    // 0.2-mass unit is below the hazelnut's strength of hardness 4 / 10.
    const nut = resource(f.w, 'hazelnut');
    expect(0.1 / nut.mass ** (2 / 3)).toBeLessThan(
      (nut.properties?.hardness ?? 0) / 10,
    );
    const before = v7Load(f.w, actor(f.w));
    const r = cost(f.w, hand(f.nut));
    expect(r.energy).toBeCloseTo(0.5, 8);
    let w = r.world;
    const j = work(w);
    expect(j).toMatchObject({
      owner: 'lin',
      status: 'paused',
      stage: 'intact',
      source: f.nut,
      method: 'hand',
      tool: null,
      support: null,
      damage: 0,
      paidEnergy: 0.5,
      input: { quantity: 1, mass: 0.2, origin: NUTS, resource: 'hazelnut' },
    });
    expect(j.attempts).toEqual([
      expect.objectContaining({ method: 'hand', response: 'intact', crack: 0 }),
    ]);
    // Exactly one specimen is reserved, untouched; the other hazelnut stays a normal unit.
    const unit = stack(w, j.specimen);
    expect(unit).toMatchObject({
      owner: 'lin',
      resource: 'hazelnut',
      quantity: 1,
      reservedFor: j.id,
      origin: NUTS,
    });
    expect(unit.processing).toBeUndefined();
    expect(stack(w, f.nut)).toMatchObject({ quantity: 1, owner: 'lin' });
    expect(stack(w, f.nut).reservedFor).toBeUndefined();
    expect(v7Load(w, actor(w))).toBeCloseTo(before, 8);
    // Observable events and a private verified record of the actual response.
    expect(events(w, 'sample-opening-started')).toHaveLength(1);
    expect(data(w, 'sample-opening-attempted')).toMatchObject({
      response: 'intact',
      method: 'hand',
      energy: 0.5,
      view: {
        stage: 'intact',
        method: 'hand',
        enclosure: { fracture: 'intact', crack: 0 },
        contents: null,
        products: null,
        badge: null,
      },
    });
    expect(events(w, 'sample-opening-fractured')).toHaveLength(0);
    expect(events(w, 'sample-opening-opened')).toHaveLength(0);
    // No hidden property (strength or load) is reported.
    expect(JSON.stringify(data(w, 'sample-opening-attempted'))).not.toMatch(
      /strength|load|hardness/,
    );
    const record =
      actor(w).memory.knowledge?.['hazelnut:enclosure-response:hand:intact'];
    expect(record).toMatchObject({
      verified: true,
      value: { response: 'intact' },
    });
    expect(JSON.stringify(record?.value)).toMatch(/not visible/);
    expect(events(w, 'information-confirmed')).toHaveLength(1);
    // Separation of an unopened unit reports only the exterior and spends nothing.
    w = fed(w);
    expect(unchanged(w, act('separate', { workId: j.id }))).toMatch(
      /only its exterior can be seen/,
    );
    // A repeated squeeze is a new paid round with the same result and no new finding.
    const again = cost(w, act('open', { workId: j.id, method: 'hand' }));
    expect(again.energy).toBeCloseTo(0.5, 8);
    expect(work(again.world)).toMatchObject({ stage: 'intact', damage: 0 });
    expect(work(again.world).attempts).toHaveLength(2);
    expect(events(again.world, 'information-confirmed')).toHaveLength(0);
    expect(stack(again.world, j.specimen).processing).toBeUndefined();
  });

  it('a stone pressed on the rock opens one hazelnut; separation makes a conserved kernel and shell', () => {
    const f = opened();
    let w = f.w;
    const j = work(w);
    expect(j).toMatchObject({
      stage: 'opened',
      status: 'paused',
      method: 'supported-tool',
      tool: f.stone,
      support: ROCK,
      damage: 1,
    });
    // The split stays on the unit; the contents are exposed but not separated.
    const unit = stack(w, j.specimen);
    expect(unit.processing?.enclosureOpening).toMatchObject({
      stage: 'opened',
      damage: 1,
      revision: `${id}@1`,
    });
    expect(events(w, 'sample-opening-opened')).toHaveLength(1);
    expect(data(w, 'sample-opening-opened')).toMatchObject({
      view: {
        stage: 'opened',
        tool: f.stone,
        support: ROCK,
        enclosure: { fracture: 'split open', crack: 1 },
        contents: { exposed: true, separated: false },
        products: null,
        badge: null,
      },
    });
    // Tool and support are present and unchanged.
    expect(stack(w, f.stone)).toMatchObject({ owner: 'lin', quantity: 1 });
    expect(stack(w, f.stone).processing).toBeUndefined();
    expect(w.objects.find((o) => o.id === ROCK)?.spatial.solid).toBe(true);
    const mass = fromNuts(w),
      nutrition = value(w, 'nutrition'),
      toxicity = value(w, 'toxicity'),
      load = v7Load(w, actor(w)),
      decay = unit.decay ?? 0;
    expect(mass).toBeCloseTo(0.4, 8);
    // One paid separation round: 0.2 energy.
    const r = cost(w, act('separate', { workId: j.id }));
    expect(r.energy).toBeCloseTo(0.2, 8);
    w = r.world;
    const done = work(w);
    expect(done).toMatchObject({ stage: 'separated', status: 'completed' });
    const kernel = stack(w, done.products.contents ?? '');
    const shell = stack(w, done.products.enclosure ?? '');
    expect(kernel).toMatchObject({
      resource: KERNEL,
      quantity: 0.4,
      quantityTenths: 4,
      owner: 'lin',
      origin: NUTS,
      harvestedAt: unit.harvestedAt,
    });
    expect(shell).toMatchObject({
      resource: SHELL,
      quantity: 0.6,
      quantityTenths: 6,
      owner: 'lin',
      origin: NUTS,
    });
    // Decay is carried, not reset (the kernel keeps ageing during the separation round).
    expect(kernel.decay ?? 0).toBeGreaterThanOrEqual(decay);
    expect(kernel.reservedFor).toBeUndefined();
    // The opened unit no longer exists and is never recreated.
    expect(w.stacks.some((s) => s.id === j.specimen)).toBe(false);
    expect(own(w, 'hazelnut').map((s) => s.quantity)).toEqual([1]);
    // Conservation: mass, nutrition and toxicity of the source material are unchanged.
    expect(fromNuts(w)).toBeCloseTo(mass, 8);
    expect(value(w, 'nutrition')).toBeCloseTo(nutrition, 8);
    expect(value(w, 'nutrition')).toBeLessThanOrEqual(nutrition + 1e-9);
    expect(value(w, 'toxicity')).toBeCloseTo(toxicity, 8);
    expect(v7Load(w, actor(w))).toBeCloseTo(load, 8);
    const l = done.ledger;
    expect(l.input).toMatchObject({ quantity: 1, mass: 0.2 });
    expect(l.enclosure).toMatchObject({ quantity: 0.6, item: shell.id });
    expect(l.recovered).toMatchObject({ quantity: 0.4, item: kernel.id });
    expect(l.attached).toMatchObject({ quantity: 0 });
    expect(l.fragments).toMatchObject({ quantity: 0 });
    expect(l.residue).toMatchObject({ quantity: 0 });
    const parts = [
      'enclosure',
      'recovered',
      'attached',
      'fragments',
      'residue',
    ];
    expect(parts.reduce((n, k) => n + (l[k]?.quantity ?? 0), 0)).toBeCloseTo(
      1,
      8,
    );
    expect(parts.reduce((n, k) => n + (l[k]?.mass ?? 0), 0)).toBeCloseTo(
      0.2,
      8,
    );
    // Observable completion event with products, and a verified private record.
    expect(data(w, 'sample-opening-separated')).toMatchObject({
      energy: 0.2,
      products: { contents: kernel.id, enclosure: shell.id },
      view: {
        stage: 'separated',
        enclosure: { fracture: 'split into pieces' },
        contents: { exposed: true, separated: true },
        products: { contents: kernel.id, enclosure: shell.id },
        residue: 0,
        badge: null,
      },
    });
    expect(done.observation).toMatchObject({
      contents: { item: kernel.id, color: '#d8bd91' },
    });
    for (const unknown of ['edibility', 'nutrition', 'toxins', 'safety'])
      expect(done.observation?.unknown).toContain(unknown);
    expect(
      actor(w).memory.knowledge?.[
        'hazelnut:enclosure-contents:recovered:little observable deterioration'
      ],
    ).toMatchObject({ verified: true });
    // No practice milestone, satisfaction or reward is earned by opening.
    const mine = (type: string) =>
      events(w, type).filter((e) => e.actor === 'lin');
    expect(mine('practice-confirmed')).toHaveLength(0);
    expect(mine('satisfaction')).toHaveLength(0);
    expect(actor(w).wellbeing.sources.map((s) => s.source)).toEqual(
      actor(f.w).wellbeing.sources.map((s) => s.source),
    );
  });

  it('fractional parts follow the whole-unit rules of eat, give and drop and keep ageing', () => {
    const f = opened();
    const w = fed(
      step(f.w, { lin: act('separate', { workId: work(f.w).id }) }).world,
    );
    const j = work(w);
    const kernel = j.products.contents ?? '',
      shell = j.products.enclosure ?? '';
    // In this world eat, give and drop take whole units (integer quantity of at least 1), so a
    // 0.4 kernel or 0.6 shell item can be neither eaten, handed over nor dropped on its own.
    actor(w, 'moss').position = {
      x: actor(w).position.x + 0.5,
      y: actor(w).position.y,
    };
    for (const action of [
      { interface: 'eat', args: { target: kernel, quantity: 0.4 } },
      { interface: 'eat', args: { target: kernel, quantity: 1 } },
      { interface: 'eat', args: { target: shell, quantity: 1 } },
      { interface: 'eat', args: { target: `resource:${KERNEL}`, quantity: 1 } },
      {
        interface: 'give',
        args: { target: kernel, quantity: 0.2, recipient: 'moss' },
      },
      {
        interface: 'give',
        args: { target: kernel, quantity: 1, recipient: 'moss' },
      },
      { interface: 'drop', args: { target: shell, quantity: 1 } },
    ])
      expect(unchanged(w, action)).not.toBe('');
    // The untouched hazelnut is still an ordinary whole unit with its full value.
    const meal = step(w, {
      lin: { interface: 'eat', args: { target: f.nut, quantity: 1 } },
    }).world;
    expect(data(meal, 'ate')).toMatchObject({
      resource: 'hazelnut',
      quantity: 1,
      nutrition: 18,
    });
    // Ordinary decay continues on the kernel; the shell, like other inedible material, does not decay.
    const later = step(w).world;
    expect(stack(later, kernel).decay ?? 0).toBeGreaterThan(
      stack(w, kernel).decay ?? 0,
    );
    expect(stack(later, shell).decay).toBe(stack(w, shell).decay);
  });

  it('kernels of three hazelnuts carry exactly their nutrition but stay separate fractional items', () => {
    const f = setup({ tools: true, nuts: 3 });
    let w = f.w;
    actor(w).position = { ...AT_ROCK };
    for (let i = 0; i < 3; i++) {
      w = fed(
        step(w, { lin: press({ sourceId: f.nut, toolId: f.stone }) }).world,
      );
      w = fed(step(w, { lin: act('separate', { workId: work(w).id }) }).world);
    }
    expect(own(w, KERNEL).map((s) => s.quantity)).toEqual([0.4, 0.4, 0.4]);
    expect(own(w, SHELL).map((s) => s.quantity)).toEqual([0.6, 0.6, 0.6]);
    expect(own(w, 'hazelnut')).toHaveLength(0);
    // Three hazelnuts' nutrition (54) is carried by 1.2 kernel units; nothing was created.
    expect(value(w, 'nutrition')).toBeCloseTo(3 * 18, 8);
    expect(value(w, 'nutrition')).toBeLessThanOrEqual(3 * 18 + 1e-9);
    expect(fromNuts(w)).toBeCloseTo(3 * 0.2, 8);
    // Each separation makes its own item; a resource reference over several items is ambiguous
    // in this world, so even 1.2 kernel units cannot be eaten as one whole unit.
    expect(
      unchanged(w, {
        interface: 'eat',
        args: { target: `resource:${KERNEL}`, quantity: 1 },
      }),
    ).toMatch(/ambiguous/);
  });

  it('refuses invalid requests before any charge', () => {
    const f = setup({ tools: true });
    const w = f.w;
    actor(w).position = { ...AT_NUTS };
    // Material without a represented enclosure and contents.
    expect(unchanged(w, hand(f.stone))).toMatch(
      /No enclosure and contents are represented for stone/,
    );
    expect(
      unchanged(
        w,
        act('open', { sourceId: f.nut, quantity: 2, method: 'hand' }),
      ),
    ).not.toBe('');
    expect(unchanged(w, act('open', { sourceId: f.nut }))).toMatch(/method/);
    expect(
      unchanged(
        w,
        act('open', { sourceId: f.nut, method: 'hand', toolId: f.stone }),
      ),
    ).toMatch(/Hand compression uses no tool/);
    expect(unchanged(w, press({ sourceId: f.nut, supportRef: '' }))).toMatch(
      /needs toolId/,
    );
    expect(unchanged(w, press({ sourceId: f.nut, toolId: f.nut }))).toMatch(
      /must be different/,
    );
    // A plant is not a support, and nearness to it supplies no tool.
    expect(
      unchanged(
        w,
        press({ sourceId: f.nut, toolId: f.stone, supportRef: NUTS }),
      ),
    ).toMatch(/not a plant/);
    // The rock is out of reach from the hazelnut plant.
    expect(unchanged(w, press({ sourceId: f.nut, toolId: f.stone }))).toMatch(
      /within reach of the support|absent-or-inaccessible/,
    );
    // No light, no work.
    const dark = v7Clone(w);
    const day = dark.config.forest?.day ?? 80;
    dark.time = day * 0.6;
    expect(unchanged(dark, hand(f.nut))).toMatch(/too dark/);
    // Too little energy.
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.3;
    expect(unchanged(tired, hand(f.nut))).toMatch(/0.5 energy/);
    // Spoiled material cannot be worked.
    const spoiled = v7Clone(w);
    stack(spoiled, f.nut).decay = 800;
    expect(unchanged(spoiled, hand(f.nut))).toMatch(
      /Spoiled|not on|unavailable|absent/i,
    );
    // One open work at a time.
    const started = fed(step(w, { lin: hand(f.nut) }).world);
    expect(unchanged(started, hand(f.nut))).toMatch(/still open/);
    expect(
      unchanged(
        started,
        act('open', { workId: 'manual-0-none', method: 'hand' }),
      ),
    ).toMatch(/No opening work of yours/);
  });

  it('pauses at no charge when a recheck fails, resumes by workId and keeps accumulated damage', () => {
    const f = setup({ tools: true });
    let w = f.w;
    actor(w).position = { ...AT_ROCK };
    // Oak passes less load than stone: the first press cracks the shell without opening it.
    let r = cost(w, press({ sourceId: f.nut, toolId: f.oak }));
    expect(r.energy).toBeCloseTo(0.5, 8);
    w = fed(r.world);
    const j = work(w);
    expect(j).toMatchObject({ stage: 'cracked', damage: 0.4, tool: f.oak });
    expect(events(w, 'sample-opening-fractured')).toHaveLength(1);
    expect(data(w, 'sample-opening-fractured')).toMatchObject({
      view: { enclosure: { fracture: 'cracked, closed' }, contents: null },
    });
    expect(stack(w, j.specimen).processing?.enclosureOpening).toMatchObject({
      stage: 'cracked',
      damage: 0.4,
    });
    // Out of reach of the support: the work pauses before any charge.
    actor(w).position = { ...AWAY };
    const again = press({ workId: j.id, toolId: f.oak });
    const paused = step(w, { lin: again }),
      idle = step(w).world;
    expect(paused.outcomes.lin?.success).toBe(true);
    expect(actor(paused.world).vitals).toEqual(actor(idle).vitals);
    expect(work(paused.world)).toMatchObject({
      status: 'paused',
      stage: 'cracked',
      damage: 0.4,
      paidEnergy: 0.5,
    });
    expect(work(paused.world).pausedAt).not.toBeNull();
    expect(events(paused.world, 'sample-opening-paused')).toHaveLength(1);
    expect(stack(paused.world, j.specimen).reservedFor).toBe(j.id);
    // Back in reach: the same work resumes and the damage accumulates, never reset.
    w = fed(paused.world);
    actor(w).position = { ...AT_ROCK };
    r = cost(w, again);
    expect(r.energy).toBeCloseTo(0.5, 8);
    expect(events(r.world, 'sample-opening-resumed')).toHaveLength(1);
    expect(work(r.world)).toMatchObject({ stage: 'cracked', damage: 0.8 });
    expect(work(r.world).pausedAt).toBeNull();
    // Cancel returns the cracked unit as it now is; a new work continues from its damage.
    w = fed(r.world);
    const c = cost(w, act('cancel', { workId: j.id }));
    expect(c.energy).toBeCloseTo(0, 8);
    w = fed(c.world);
    expect(work(w)).toMatchObject({ status: 'stopped', stage: 'cancelled' });
    expect(events(w, 'sample-opening-cancelled')).toHaveLength(1);
    const back = stack(w, j.specimen);
    expect(back.reservedFor).toBeUndefined();
    expect(back.owner).toBe('lin');
    expect(back.processing?.enclosureOpening).toMatchObject({
      stage: 'cracked',
      damage: 0.8,
    });
    r = cost(w, press({ sourceId: back.id, toolId: f.oak }));
    expect(work(r.world)).toMatchObject({ stage: 'opened', damage: 1.2 });
    expect(work(r.world).input).toMatchObject({ crack: 0.8 });
    expect(events(r.world, 'sample-opening-opened')).toHaveLength(1);
    // Cancelling an opened unit returns it open; separate by sourceId still separates it.
    w = fed(step(r.world, { lin: act('cancel') }).world);
    const openUnit = own(w, 'hazelnut').find(
      (s) => s.processing?.enclosureOpening,
    );
    expect(openUnit?.processing?.enclosureOpening).toMatchObject({
      stage: 'opened',
    });
    expect(unchanged(w, hand(openUnit?.id ?? ''))).toMatch(/already open/);
    const s = cost(w, act('separate', { sourceId: openUnit?.id }));
    expect(s.energy).toBeCloseTo(0.2, 8);
    expect(work(s.world)).toMatchObject({ stage: 'separated' });
    expect(own(s.world, KERNEL).map((x) => x.quantity)).toEqual([0.4]);
    expect(own(s.world, SHELL).map((x) => x.quantity)).toEqual([0.6]);
  });

  it('ends at death, leaving the altered unit where Lin fell without restoring or separating it', () => {
    const f = opened();
    const dying = v7Clone(f.w);
    const j = work(dying);
    actor(dying).vitals.health = 0.0001;
    actor(dying).vitals.satiety = 0;
    const where = { ...actor(dying).position };
    const died = step(dying).world;
    expect(events(died, 'died')).toHaveLength(1);
    expect(work(died)).toMatchObject({ status: 'stopped', stage: 'failed' });
    expect(events(died, 'sample-opening-failed')).toHaveLength(1);
    const unit = stack(died, j.specimen);
    expect(unit).toMatchObject({
      owner: null,
      resource: 'hazelnut',
      position: where,
    });
    expect(unit.reservedFor).toBeUndefined();
    expect(unit.processing?.enclosureOpening).toMatchObject({
      stage: 'opened',
    });
    expect(died.stacks.filter((s) => s.resource === KERNEL)).toHaveLength(0);
    expect(died.stacks.filter((x) => x.reservedFor)).toHaveLength(0);
  });

  it('ends work whose reserved unit spoils, without refund', () => {
    const f = setup();
    const w = fed(step(f.w, { lin: hand(f.nut) }).world);
    const j = work(w);
    stack(w, j.specimen).decay = 799.999;
    const later = step(w).world;
    expect(events(later, 'spoiled').length).toBeGreaterThan(0);
    expect(work(later)).toMatchObject({ stage: 'failed', paidEnergy: 0.5 });
    expect(events(later, 'sample-opening-failed')).toHaveLength(1);
    expect(stack(later, f.nut)).toMatchObject({ quantity: 1, owner: 'lin' });
  });

  it('is owner-only: no one else can continue, cancel or use Lin’s unit, tool or work', () => {
    const f = opened();
    let w = v7Clone(f.w);
    actor(w, 'moss').position = { x: AT_ROCK.x + 0.5, y: AT_ROCK.y + 0.1 };
    w = fed(
      step(w, { moss: { interface: 'learn', args: { ability: id } } }).world,
    );
    expect(actor(w, 'moss').mastered).toContain(id);
    const j = work(w);
    expect(unchanged(w, act('separate', { workId: j.id }), 'moss')).toMatch(
      /No opening work of yours/,
    );
    expect(unchanged(w, act('cancel'), 'moss')).toMatch(/no open opening work/);
    expect(unchanged(w, hand(f.nut), 'moss')).toMatch(/absent-or-inaccessible/);
    expect(
      unchanged(w, press({ sourceId: j.specimen, toolId: f.stone }), 'moss'),
    ).toMatch(/absent-or-inaccessible/);
    // Lin's reserved unit cannot be eaten or given away until the work ends.
    expect(
      unchanged(w, {
        interface: 'eat',
        args: { target: j.specimen, quantity: 1 },
      }),
    ).toMatch(/reserved|unavailable/);
    expect(work(w)).toMatchObject({ owner: 'lin', stage: 'opened' });
  });
});
