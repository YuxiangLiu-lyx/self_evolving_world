import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  v7Clone,
  v7Distance,
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
  V7Package,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { longOrdinaryInput } from '../src/long-context.js';
import { IMPORT_EXCLUDED_WORDS } from '../src/long-import.js';
import { VILLAGES } from '../src/long-villages.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this limit.
vi.setConfig({ testTimeout: 180_000 });

const id = 'bounded-resource-search';
const REVISION = `${id}@1`;
const OPEN = `${id}:work:open`;
const LAST = `${id}:last`;
const WAIT: V7Action = { interface: 'wait', args: {} };
const LEARN: V7Action = { interface: 'learn', args: { ability: id } };
/** The brief's agent-visible exclusions beyond the import list, and no mention of the far group. */
const EXTRA_EXCLUDED = /history|spiritual/i;
const MENTION = /villag|neighbo|meeting|middle|other group|stranger/i;
/** sha256 of JSON.stringify of the key-sorted map from id@version to the sha256 of
 * JSON.stringify of each of the 135 packages registered before this change (the scratch hash
 * file validation-results/scratch/ex26/hashes-before.json, taken before this change). */
const EXISTING_DIGEST =
  '473c587d0242a1e444cfa251b5dd67b83cb87bc626a947af83163e125dbb4e97';
/** Kai's parameters from the review: berries within 4 of his start, at most 4 distance,
 * 16 rounds and 16 energy, keeping 24 energy, for up to 4 units. */
const KAI = {
  resource: 'berry',
  radius: 4,
  path: 4,
  time: 16,
  energy: 16,
  reserve: 24,
  quantity: 4,
};
/** Kai's own berry bush, 1.82 from his start, holding 4 units. */
const LARDER = 'commons-berry-3-0';
/** A stocked berry bush 4.80 from Kai's start: seen, but outside a radius of 4. */
const BEYOND = 'commons-berry-4-0';
const MAX_STEP = 0.8;

type Data = Record<string, unknown>;
const sha = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const searchPackage = (): V7Package => {
  const p = V7_PACKAGES.find((p) => p.id === id);
  if (!p) throw new Error('Missing package.');
  return p;
};
const search = (args: Data = {}): V7Action => ({
  interface: id,
  args: { mode: 'start', ...KAI, ...args },
});
const control = (mode: 'resume' | 'cancel'): V7Action => ({
  interface: id,
  args: { mode },
});
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
  return { outcomes: result.outcomes, world: v7Clone(result.world) };
}
const ok = (r: ReturnType<typeof step>, who = 'kai') => {
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  return r.world;
};
const refused = (r: ReturnType<typeof step>, pattern: RegExp, who = 'kai') => {
  expect(r.outcomes[who]?.success).toBe(false);
  expect(r.outcomes[who]?.reason).toMatch(pattern);
  expect(r.outcomes[who]?.reason).toMatch(/Nothing was spent\.$/);
  return r.world;
};
const actor = (w: V7World, who = 'kai'): V7Actor => {
  const a = w.actors.find((a) => a.id === who);
  if (!a) throw new Error(`Missing ${who}.`);
  return a;
};
const object = (w: V7World, oid: string): V7Object => {
  const o = w.objects.find((o) => o.id === oid);
  if (!o) throw new Error(`Missing ${oid}.`);
  return o;
};
const open = (w: V7World) => actor(w).extensionState[OPEN] as Data | undefined;
const last = (w: V7World) => actor(w).extensionState[LAST] as Data | undefined;
/** Kai's events of this round made while running the search, in order. */
const types = (w: V7World) =>
  w.events
    .filter((e) => e.actor === 'kai' && e.interface === id)
    .map((e) => e.type);
const berries = (w: V7World, who = 'kai') =>
  w.stacks
    .filter((s) => s.owner === who && s.resource === 'berry')
    .reduce((n, s) => n + s.quantity, 0);
const installed = () => {
  const g = initialLongWorld('long-ex26', 'long-culture-v2-villages');
  return v7Clone(v7Install(g, continuousRegistry(g), REVISION));
};
/** Kai studies in round 1 and masters the search. */
function learned(world?: V7World) {
  const r = step(world ?? installed(), { kai: LEARN });
  const w = ok(r);
  expect(actor(w).mastered).toContain(id);
  return w;
}
/** Repeats Kai's action until it completes; returns every round's result. */
function drive(w: V7World, action: V7Action, max = 40) {
  const rounds: ReturnType<typeof step>[] = [];
  let world = w;
  for (let i = 0; i < max; i++) {
    const r = step(world, { kai: action });
    world = ok(r);
    rounds.push(r);
    if (r.outcomes.kai?.complete) return { world, rounds };
  }
  throw new Error('The search did not finish.');
}

describe('bounded resource search in ex26', () => {
  it('is registered first for long-ex26 only, with new names, the size limit, no excluded word and every earlier package byte-identical', () => {
    const pkg = searchPackage();
    const ability = pkg.abilities[0];
    if (!ability) throw new Error('Missing ability.');
    // The first long-ex26 package; later developments of this run append their own after it.
    expect(V7_PACKAGES.filter((p) => p.scope === 'long-ex26')[0]).toBe(pkg);
    expect(pkg).toMatchObject({
      id,
      version: 1,
      scope: 'long-ex26',
      dependencies: ['foundation-forest@1', 'foundation-open@1'],
      visualComponents: [],
      satisfaction: [],
      resources: [],
      processes: {},
      events: [
        `${id}-started`,
        `${id}-moved`,
        `${id}-inspected`,
        `${id}-collected`,
        `${id}-blocked`,
        `${id}-paused`,
        `${id}-resumed`,
        `${id}-cancelled`,
        `${id}-completed`,
        `${id}-stopped`,
        `${id}-ended`,
      ],
    });
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 1,
      revision: REVISION,
      handler: `long.${id}`,
      authored: false,
      prerequisites: ['navigate', 'probe', 'gather'],
      dependencies: {
        abilities: ['navigate', 'probe', 'gather'],
        resources: [],
        knowledge: [],
      },
      references: {},
      practiceEvidence: `${id}-completed`,
      execution: { duration: null, interruption: 'cancel' },
    });
    expect(ability.learningEnergy).toBeUndefined();
    expect(Object.keys(ability.parameters.properties ?? {})).toEqual([
      'mode',
      'resource',
      'x',
      'y',
      'radius',
      'path',
      'time',
      'energy',
      'reserve',
      'quantity',
    ]);
    expect(ability.parameters.required).toEqual(['mode']);
    expect(ability.parameters.properties?.mode?.enum).toEqual([
      'start',
      'resume',
      'cancel',
    ]);
    // No parameter names a target, so no reference contract is needed.
    expect(ability.parameters.properties?.target).toBeUndefined();
    // New package, ability, equivalence, handler and event names.
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(id);
        expect(a.equivalence).not.toBe(ability.equivalence);
        expect(a.handler).not.toBe(ability.handler);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? [])
        expect(e.startsWith(`${id}-`)).toBe(false);
    }
    const g = installed();
    for (const a of g.abilities.filter((a) => a.id !== id))
      expect(a.equivalence).not.toBe(ability.equivalence);
    const limit = g.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg.abilities,
      events: pkg.events,
      description: pkg.description,
      reuse: pkg.reuse,
    });
    expect(visible).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    expect(visible).not.toMatch(MENTION);
    // Every package registered before this one, by id@version, is byte-identical.
    const existing = V7_PACKAGES.slice(0, V7_PACKAGES.indexOf(pkg));
    const map = Object.fromEntries(
      existing
        .map((p) => [`${p.id}@${String(p.version)}`, sha(p)] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    expect(Object.keys(map)).toHaveLength(135);
    expect(sha(map)).toBe(EXISTING_DIGEST);
    // Only the current scope can install it, and only with operation continuity.
    const other = initialLongWorld('long-ex25', 'long-culture-v2-villages');
    expect(continuousRegistry(other).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(other, continuousRegistry(), REVISION)).toThrow(
      /not approved/,
    );
    const bare = v7Clone(
      initialLongWorld('long-ex26', 'long-culture-v2-villages'),
    );
    delete bare.state.operationContinuity;
    expect(() => v7Install(bare, continuousRegistry(bare), REVISION)).toThrow(
      /operation continuity/,
    );
    // Installing changes no person, object, item or process.
    const before = initialLongWorld('long-ex26', 'long-culture-v2-villages');
    expect(v7Signature(g.actors)).toBe(v7Signature(before.actors));
    expect(v7Signature(g.objects)).toBe(v7Signature(before.objects));
    expect(v7Signature(g.stacks)).toBe(v7Signature(before.stacks));
    expect(g.processes).toEqual(before.processes);
  });

  it('is learned in one round of study without energy, and only by a person with navigate, probe and gather', () => {
    const g = installed();
    const unlearned = step(g, { kai: search() });
    expect(unlearned.outcomes.kai?.success).toBe(false);
    expect(unlearned.outcomes.kai?.reason).toMatch(/not mastered/);
    const r = step(g, { kai: LEARN });
    const w = ok(r);
    expect(r.outcomes.kai?.reason).toMatch(/after one round of study/);
    expect(actor(w).mastered).toContain(id);
    expect(actor(w).learning).toBeNull();
    // Study costs nothing but the round: energy is the same as for a waiting person.
    const idle = step(g).world;
    expect(actor(w).vitals).toEqual(actor(idle).vitals);
    // Moss has not mastered probe in this genesis, so the study is refused.
    expect(actor(g, 'moss').mastered).not.toContain('probe');
    const moss = step(g, { moss: LEARN });
    expect(moss.outcomes.moss?.success).toBe(false);
    expect(moss.outcomes.moss?.reason).toMatch(/prerequisites/);
    // A person who no longer has gather cannot run it.
    const lost = v7Clone(w);
    actor(lost).mastered = actor(lost).mastered.filter((x) => x !== 'gather');
    const run = step(lost, { kai: search() });
    expect(run.outcomes.kai?.success).toBe(false);
    expect(run.outcomes.kai?.reason).toMatch(/capability/);
  });

  it('collects real stock through one kernel navigate step, one probe observation and one gather, each at its own cost and time', () => {
    let w = learned();
    const start = { ...actor(w).position },
      energy = actor(w).vitals.energy;
    expect(object(w, LARDER).data.stock).toBe(4);
    // Round 1: the start and one kernel navigate step of 0.8 for 0.8 x 2 = 1.6 energy.
    let r = step(w, { kai: search() });
    w = ok(r);
    expect(r.outcomes.kai?.complete).toBe(false);
    expect(types(w)).toEqual([`${id}-started`, 'arrived', `${id}-moved`]);
    expect(v7Distance(start, actor(w).position)).toBeCloseTo(0.8, 8);
    expect(actor(w).vitals.energy).toBeCloseTo(energy - 1.6, 8);
    const kernel = w.events.find(
      (e) => e.actor === 'kai' && e.type === 'arrived',
    );
    expect(kernel?.data).toMatchObject({ load: 0 });
    expect(Number(kernel?.data.distance)).toBeCloseTo(0.8, 8);
    expect(Number(kernel?.data.effort)).toBeCloseTo(1.6, 8);
    expect(open(w)).toMatchObject({
      status: 'active',
      phase: 'travel',
      target: LARDER,
      distance: 0.8,
      energy: 1.6,
      moves: 1,
    });
    // Round 2: probe's observation mode: 0.2 energy, no movement, no material.
    const at = { ...actor(w).position };
    r = step(w, { kai: search() });
    w = ok(r);
    expect(types(w)).toEqual(['trial-result', `${id}-inspected`]);
    expect(actor(w).position).toEqual(at);
    expect(actor(w).vitals.energy).toBeCloseTo(energy - 1.8, 8);
    expect(object(w, LARDER).data.stock).toBe(4);
    expect(
      actor(w).memory.knowledge?.[`${LARDER}:observed-state`],
    ).toMatchObject({ tick: w.tick, value: { stock: 4 } });
    // Round 3: gather moves the 4 real units at 2 energy each and completes at the quantity.
    r = step(w, { kai: search() });
    w = ok(r);
    expect(r.outcomes.kai?.complete).toBe(true);
    expect(types(w)).toEqual([
      'gathered',
      `${id}-collected`,
      `${id}-completed`,
    ]);
    expect(actor(w).vitals.energy).toBeCloseTo(energy - 9.8, 8);
    expect(object(w, LARDER).data.stock).toBe(0);
    expect(
      w.stacks
        .filter((s) => s.owner === 'kai')
        .map((s) => [s.resource, s.quantity, s.origin]),
    ).toEqual([['berry', 4, LARDER]]);
    expect(open(w)).toBeUndefined();
    expect(last(w)).toMatchObject({
      status: 'completed',
      reason: 'quantity-cap',
      distance: 0.8,
      energy: 9.8,
      collected: 4,
      moves: 1,
      probes: 1,
      gathers: 1,
      transfers: [{ tick: w.tick, source: LARDER, quantity: 4 }],
    });
    // The same three steps by hand leave the same person, item and source.
    let hand = learned();
    for (const a of [
      {
        interface: 'navigate',
        args: { target: LARDER, x: 130.84, y: 18.71 },
      },
      {
        interface: 'probe',
        args: { target: LARDER, mode: 'observe', intensity: 0 },
      },
      { interface: 'gather', args: { target: LARDER, quantity: 4 } },
    ])
      hand = ok(step(hand, { kai: a }));
    expect(actor(w).position).toEqual(actor(hand).position);
    expect(actor(w).vitals).toEqual(actor(hand).vitals);
    expect(berries(w)).toBe(berries(hand));
    expect(object(w, LARDER).data).toEqual(object(hand, LARDER).data);
    // Nothing is eaten and no energy is restored: satiety follows hunger as for a waiting person.
    let idle = learned();
    for (let i = 0; i < 3; i++) idle = step(idle).world;
    expect(actor(w).vitals.satiety).toBe(actor(idle).vitals.satiety);
  });

  it('stops before any step that would pass the path, energy or time limit or the reserve, and completes at the quantity', () => {
    const base = learned();
    const e0 = actor(base).vitals.energy;
    const p0 = { ...actor(base).position };
    // Kai's bush is 0.70 beyond his reach: reaching it, inspecting it and one unit need at least
    // 0.70 distance, 3 rounds and 2 x 0.70 + 0.2 + 2 = 3.6 energy. A search that cannot fit
    // them stops at once, and nothing moves or is spent.
    for (const [args, reason] of [
      [{ path: 0.5 }, 'path-limit'],
      [{ time: 2 }, 'time-limit'],
      [{ energy: 3 }, 'energy-budget'],
      [{ reserve: 37 }, 'energy-reserve'],
    ] as const) {
      const d = drive(base, search(args));
      expect(d.rounds).toHaveLength(1);
      expect(last(d.world)).toMatchObject({
        status: 'stopped',
        reason,
        distance: 0,
        energy: 0,
        moves: 0,
      });
      expect(actor(d.world).position).toEqual(p0);
      expect(actor(d.world).vitals.energy).toBe(e0);
    }
    // Path 0.75 fits the lower bound, but the kernel's priced step is 0.8: it is not taken.
    let w = drive(base, search({ path: 0.75 })).world;
    expect(last(w)).toMatchObject({
      status: 'stopped',
      reason: 'path-limit',
      distance: 0,
      energy: 0,
    });
    expect(String(last(w)?.detail)).toMatch(/next step of 0\.8 would pass/);
    expect(actor(w).position).toEqual(p0);
    // Time 3 with two units on the bush: walk, inspect and gather 2, then the rounds are used.
    const two = v7Clone(base);
    object(two, LARDER).data.stock = 2;
    let d = drive(two, search({ time: 3 }));
    expect(d.rounds).toHaveLength(3);
    expect(last(d.world)).toMatchObject({
      status: 'stopped',
      reason: 'time-limit',
      moves: 1,
      probes: 1,
      collected: 2,
    });
    // Energy 3.7: after walking 1.6, inspecting 0.2 and one unit at 2 no longer fit, so it stops
    // before inspecting.
    d = drive(base, search({ energy: 3.7 }));
    expect(d.rounds).toHaveLength(2);
    expect(last(d.world)).toMatchObject({
      status: 'stopped',
      reason: 'energy-budget',
      energy: 1.6,
      moves: 1,
      probes: 0,
      collected: 0,
    });
    expect(berries(d.world)).toBe(0);
    // Energy 6: two units fit (4 energy); a third does not.
    w = drive(base, search({ energy: 6 })).world;
    expect(last(w)).toMatchObject({
      status: 'stopped',
      reason: 'energy-budget',
      energy: 5.8,
      collected: 2,
    });
    expect(berries(w)).toBe(2);
    expect(object(w, LARDER).data.stock).toBe(2);
    // Reserve 33: two units fit above it; the energy never falls below 33.
    d = drive(base, search({ reserve: 33 }));
    expect(last(d.world)).toMatchObject({
      status: 'stopped',
      reason: 'energy-reserve',
      collected: 2,
    });
    for (const r of d.rounds)
      expect(actor(r.world).vitals.energy).toBeGreaterThanOrEqual(33);
    // Quantity 2: complete with two units, the rest stays on the bush.
    w = drive(base, search({ quantity: 2 })).world;
    expect(last(w)).toMatchObject({
      status: 'completed',
      reason: 'quantity-cap',
      collected: 2,
    });
    expect(object(w, LARDER).data.stock).toBe(2);
    // A start without energy above the reserve, or while unsafe, is refused at no cost.
    refused(
      step(base, { kai: search({ reserve: 40 }) }),
      /not above the reserve/,
    );
    const weak = v7Clone(base);
    actor(weak).vitals.health = 55;
    refused(step(weak, { kai: search() }), /health 55 is at or below 60/);
    // Unsafe during a search: it stops before the next step.
    const s = ok(step(base, { kai: search() }));
    actor(s).vitals.health = 50;
    const at = { ...actor(s).position },
      energy = actor(s).vitals.energy;
    const r = step(s, { kai: search() });
    w = ok(r);
    expect(r.outcomes.kai?.complete).toBe(true);
    expect(types(w)).toEqual([`${id}-stopped`]);
    expect(last(w)).toMatchObject({ status: 'stopped', reason: 'unsafe' });
    expect(actor(w).position).toEqual(at);
    expect(actor(w).vitals.energy).toBe(energy);
  });

  it('acts only on what Kai perceives or remembers: no remote source or stock, nothing beyond the radius, nothing of the far people or the meadow', () => {
    // Every id the search records was perceived by Kai before it appeared there.
    const checkIds = (rounds: ReturnType<typeof step>[], first: V7World) => {
      let seen = new Set(actor(first).memory.objects.map((m) => m.object.id));
      for (const r of rounds) {
        const record = open(r.world) ?? last(r.world) ?? {};
        const ids = [
          record.target,
          ...((record.facts ?? []) as Data[]).map((f) => f.source),
          ...((record.transfers ?? []) as Data[]).map((t) => t.source),
        ].filter(
          (x): x is string => typeof x === 'string' && !x.startsWith('place:'),
        );
        for (const x of ids) expect(seen.has(x), x).toBe(true);
        const text = JSON.stringify([
          record,
          r.world.events.filter((e) => e.actor === 'kai'),
        ]);
        expect(text).not.toMatch(
          /wild-|-[0-2]-0"|start-[0-2]-|forest-[a-z-]+-[0-2]"/,
        );
        seen = new Set([
          ...seen,
          ...actor(r.world).memory.objects.map((m) => m.object.id),
        ]);
      }
    };
    // A stocked bush 4.80 away is seen but lies outside the radius of 4: it is never pursued.
    const empty = learned();
    object(empty, LARDER).data.stock = 0;
    expect(
      v7Observe(empty, 'kai').objects.find((o) => o.id === BEYOND)?.data.stock,
    ).toBe(4);
    const first = drive(empty, search());
    expect(first.rounds).toHaveLength(1);
    expect(last(first.world)).toMatchObject({
      status: 'completed',
      reason: 'search-exhausted',
      collected: 0,
      moves: 0,
      probes: 0,
    });
    expect(JSON.stringify(last(first.world))).not.toContain(BEYOND);
    // Bushes seen empty are noted from ordinary perception and not visited.
    expect(
      ((last(first.world)?.facts ?? []) as Data[]).map((f) => [
        f.source,
        f.stock,
        f.method,
      ]),
    ).toEqual([
      ['forest-berry-4', 0, 'seen'],
      [LARDER, 0, 'seen'],
    ]);
    checkIds(first.rounds, empty);
    // A stocked bush Kai has never seen, inside a wider area, is found only by walking until it
    // is in view; it is never a target before.
    const wide = learned();
    for (const o of wide.objects.filter((o) => o.data.resource === 'berry'))
      o.data.stock = 0;
    const hidden: V7Object = {
      ...v7Clone(object(wide, LARDER)),
      id: 'fixture-berry',
      spatial: { ...object(wide, LARDER).spatial, x: 137, y: 12.5 },
      data: { ...object(wide, LARDER).data, stock: 3 },
    };
    wide.objects.push(hidden);
    expect(v7Distance(actor(wide).position, hidden.spatial)).toBeGreaterThan(5);
    expect(
      actor(wide).memory.objects.some((m) => m.object.id === hidden.id),
    ).toBe(false);
    const args = {
      radius: 8,
      path: 16,
      time: 40,
      energy: 30,
      reserve: 4,
      quantity: 3,
    };
    let w = wide;
    const rounds: ReturnType<typeof step>[] = [];
    let targeted = false;
    for (let i = 0; i < 40; i++) {
      const knew = actor(w).memory.objects.some(
        (m) => m.object.id === hidden.id,
      );
      const r = step(w, { kai: search(args) });
      w = ok(r);
      rounds.push(r);
      const record = (open(w) ?? last(w)) as Data;
      if (record.target === hidden.id || berries(w) > 0) {
        expect(knew).toBe(true);
        targeted = true;
      }
      if (r.outcomes.kai?.complete) break;
    }
    expect(targeted).toBe(true);
    expect(last(w)).toMatchObject({
      status: 'completed',
      reason: 'quantity-cap',
      collected: 3,
    });
    expect(berries(w)).toBe(3);
    expect(object(w, hidden.id).data.stock).toBe(0);
    // It explored observed ground first: every movement target before was a place.
    expect(
      rounds.some((r) =>
        (open(r.world)?.target as string | undefined)?.startsWith('place:'),
      ),
    ).toBe(true);
    checkIds(rounds, wide);
  });

  it('never moves a person faster than navigate: at most 0.8 per round over 60 rounds, so the separation bound holds', () => {
    // Kai searches for 60 rounds, starting a new wide search whenever one ends and resting when
    // tired, while everyone else rushes toward the other side with plain navigate, as in the
    // separation proof's own rush.
    let w = learned();
    const wide = search({
      radius: 8,
      path: 16,
      time: 40,
      energy: 30,
      reserve: 2,
      quantity: 20,
    });
    const group = (who: string) =>
      VILLAGES.groups.findIndex((g) => g.includes(who));
    const start = new Map(w.actors.map((a) => [a.id, { ...a.position }]));
    const first = w.tick;
    let current = wide,
      refusedBefore = false,
      searchMoves = 0,
      walked = 0,
      fastest = 0;
    for (let round = 0; round < 60; round++) {
      const kai = actor(w);
      const run = kai.extensionState[OPEN] as Data | undefined;
      // A refused round (a swept-body conflict) is followed by a fresh decision: one wait.
      const action = refusedBefore
        ? WAIT
        : kai.vitals.energy < 4
          ? { interface: 'rest', args: {} }
          : !run
            ? (current = wide)
            : run.status === 'paused'
              ? (current = control('resume'))
              : current;
      const actions: Record<string, V7Action> = { kai: action };
      for (const a of w.actors.filter((a) => a.id !== 'kai'))
        actions[a.id] = {
          interface: 'navigate',
          args: { target: '', x: group(a.id) === 0 ? 140 : 4, y: a.position.y },
        };
      const before = new Map(w.actors.map((a) => [a.id, { ...a.position }]));
      const r = step(w, actions);
      w = r.world;
      refusedBefore = r.outcomes.kai?.success === false;
      for (const a of w.actors) {
        const moved = v7Distance(before.get(a.id) ?? a.position, a.position);
        fastest = Math.max(fastest, moved);
        // No round moves anyone more than navigate's speed x dt.
        expect(moved, `${a.id} in round ${String(w.tick)}`).toBeLessThanOrEqual(
          MAX_STEP + 1e-6,
        );
        expect(
          v7Distance(start.get(a.id) ?? a.position, a.position),
        ).toBeLessThanOrEqual((w.tick - first) * MAX_STEP + 1e-6);
        // Nobody sees anyone of the other group.
        expect(
          v7Observe(w, a.id).actors.every((x) => group(x.id) === group(a.id)),
        ).toBe(true);
      }
      // Kai moves only through the kernel's own navigate step, once, when the search acts.
      const moved = v7Distance(
        before.get('kai') ?? actor(w).position,
        actor(w).position,
      );
      const kernel = w.events.filter(
        (e: V7Event) =>
          e.actor === 'kai' &&
          e.interface === id &&
          (e.type === 'moved' || e.type === 'arrived'),
      );
      if (action.interface === id && moved > 1e-9) {
        expect(kernel).toHaveLength(1);
        expect(Number(kernel[0]?.data.distance)).toBeCloseTo(moved, 6);
        searchMoves += 1;
        walked += moved;
      } else if (action.interface === id) expect(moved).toBe(0);
    }
    expect(w.tick - first).toBe(60);
    // The search moved in most rounds, at full speed and never faster.
    expect(searchMoves).toBeGreaterThanOrEqual(30);
    expect(walked).toBeLessThanOrEqual(searchMoves * MAX_STEP + 1e-6);
    expect(fastest).toBeGreaterThan(MAX_STEP - 1e-6);
    expect(fastest).toBeLessThanOrEqual(MAX_STEP + 1e-6);
    // The proof's bound still separates the groups: 2 x 60 x 0.8 + 5 = 101 < 111.6.
    let closest = Infinity;
    for (const a of w.actors)
      for (const b of w.actors)
        if (group(a.id) !== group(b.id))
          closest = Math.min(closest, v7Distance(a.position, b.position));
    expect(closest).toBeGreaterThan(111.6 - 2 * 60 * MAX_STEP - 1e-6);
    expect(closest).toBeGreaterThan(w.config.vision);
  });

  it('leaves out a source that navigate cannot approach, as plain navigate fails there, without moving or spending', () => {
    // A stocked bush whose interaction point from Kai lies inside the solid stone beside it.
    const w = learned();
    object(w, LARDER).data.stock = 0;
    w.objects.push({
      ...v7Clone(object(w, LARDER)),
      id: 'fixture-berry',
      spatial: { ...object(w, LARDER).spatial, x: 133.1, y: 20.7 },
      data: { ...object(w, LARDER).data, stock: 2 },
    });
    // Kai sees it, as at the end of the last round.
    const seen = v7Observe(w, 'kai').objects.find(
      (o) => o.id === 'fixture-berry',
    );
    if (!seen) throw new Error('The bush is not in view.');
    actor(w).memory.objects.push({ object: seen, seenAt: w.tick });
    const plain = step(w, {
      kai: {
        interface: 'navigate',
        args: { target: 'fixture-berry', x: 133.1, y: 20.7 },
      },
    });
    expect(plain.outcomes.kai?.success).toBe(false);
    expect(plain.outcomes.kai?.reason).toMatch(/goal-overlap/);
    const p0 = { ...actor(w).position },
      e0 = actor(w).vitals.energy;
    const r = step(w, { kai: search({ radius: 4.5 }) });
    const blocked = ok(r);
    expect(r.outcomes.kai?.complete).toBe(false);
    expect(types(blocked)).toEqual([`${id}-started`, `${id}-blocked`]);
    expect(actor(blocked).position).toEqual(p0);
    expect(actor(blocked).vitals.energy).toBe(e0);
    expect(open(blocked)).toMatchObject({
      blocked: [{ target: 'fixture-berry', reason: 'blocked: goal-overlap' }],
      distance: 0,
      energy: 0,
    });
    // With no other source it ends honestly with nothing collected.
    const end = ok(step(blocked, { kai: search({ radius: 4.5 }) }));
    expect(last(end)).toMatchObject({
      status: 'completed',
      reason: 'search-exhausted',
      collected: 0,
    });
  });

  it('pauses when another action takes a round, resumes only on a deliberate action after fresh checks, and cancel ends it without refunds', () => {
    let w = ok(step(learned(), { kai: search() }));
    // Another action takes round 2: the search pauses and keeps its step and charge.
    w = ok(step(w, { kai: WAIT }));
    const paused = w.events.filter(
      (e) => e.actor === 'kai' && e.type === `${id}-paused`,
    );
    expect(paused).toHaveLength(1);
    expect(paused[0]?.interface).toBeNull();
    expect(open(w)).toMatchObject({
      status: 'paused',
      distance: 0.8,
      energy: 1.6,
    });
    // A new start is refused while it is open.
    refused(step(w, { kai: search() }), /give resume to continue it or cancel/);
    // Resume rechecks: the bush is inspected again before any harvest, and the paused round
    // still counts toward the time limit.
    let r = step(w, { kai: control('resume') });
    w = ok(r);
    expect(types(w)).toEqual([
      `${id}-resumed`,
      'trial-result',
      `${id}-inspected`,
    ]);
    const inspected = w.events.find((e) => e.type === `${id}-inspected`);
    expect((inspected?.data.view as Data).time).toBe(3);
    // The resume continues with the same action.
    w = ok(step(w, { kai: control('resume') }));
    expect(types(w)).toEqual([
      'gathered',
      `${id}-collected`,
      `${id}-completed`,
    ]);
    // Cancel: after a partial harvest the berries stay; spent energy is not refunded.
    let c = learned();
    for (let i = 0; i < 2; i++) c = ok(step(c, { kai: search() }));
    object(c, LARDER).data.stock = 2;
    c = ok(step(c, { kai: search() }));
    expect(open(c)).toMatchObject({ status: 'active', collected: 2 });
    const energy = actor(c).vitals.energy;
    r = step(c, { kai: control('cancel') });
    c = ok(r);
    expect(r.outcomes.kai?.complete).toBe(true);
    expect(types(c)).toEqual([`${id}-cancelled`]);
    expect(actor(c).vitals.energy).toBe(energy);
    expect(berries(c)).toBe(2);
    expect(open(c)).toBeUndefined();
    expect(last(c)).toMatchObject({
      status: 'cancelled',
      collected: 2,
      energy: 5.8,
    });
    refused(step(c, { kai: control('cancel') }), /no open search to cancel/);
    refused(step(c, { kai: control('resume') }), /no open search to resume/);
  });

  it('ends at death; carried berries follow the ordinary death rules once, and nothing continues after respawn', () => {
    let w = learned();
    for (let i = 0; i < 2; i++) w = ok(step(w, { kai: search() }));
    object(w, LARDER).data.stock = 2;
    w = ok(step(w, { kai: search() }));
    expect(open(w)).toMatchObject({ status: 'active', collected: 2 });
    const where = { ...actor(w).position };
    // Kai waits (the search pauses) and starves at the end of his strength this round.
    actor(w).vitals.health = 0.5;
    actor(w).vitals.satiety = 0;
    w = step(w, { kai: WAIT }).world;
    const mine = w.events.filter((e) => e.actor === 'kai').map((e) => e.type);
    expect(mine).toContain(`${id}-paused`);
    expect(mine).toContain('died');
    expect(mine).toContain(`${id}-ended`);
    expect(mine).toContain('respawned');
    expect(open(w)).toBeUndefined();
    expect(last(w)).toMatchObject({
      status: 'ended',
      reason: 'death',
      collected: 2,
    });
    // The two berries lie at the death position, owned by nobody, exactly once.
    const dropped = w.stacks.filter(
      (s) => s.resource === 'berry' && s.origin === LARDER,
    );
    expect(dropped.reduce((n, s) => n + s.quantity, 0)).toBe(2);
    for (const s of dropped) {
      expect(s.owner).toBeNull();
      expect(s.position).toEqual(where);
    }
    expect(berries(w)).toBe(0);
    refused(step(w, { kai: control('resume') }), /no open search to resume/);
  });

  it('never rewards searching: no satisfaction, mood, practice milestone or progress credit beyond the same steps by hand', () => {
    let w = learned(),
      hand = learned(),
      idle = learned();
    const manual: V7Action[] = [
      {
        interface: 'navigate',
        args: { target: LARDER, x: 130.84, y: 18.71 },
      },
      {
        interface: 'probe',
        args: { target: LARDER, mode: 'observe', intensity: 0 },
      },
      { interface: 'gather', args: { target: LARDER, quantity: 4 } },
    ];
    const seen: V7Event[] = [];
    for (let round = 0; round < 6; round++) {
      w = ok(step(w, round < 3 ? { kai: search() } : {}));
      hand = ok(step(hand, { kai: manual[round] ?? WAIT }));
      idle = step(idle).world;
      seen.push(...w.events);
    }
    expect(
      seen.filter((e) =>
        [
          'satisfaction',
          'satisfaction-maintained',
          'practice-confirmed',
          'information-confirmed',
        ].includes(e.type),
      ),
    ).toEqual([]);
    for (const a of w.actors) {
      const b = actor(idle, a.id);
      expect(a.wellbeing.sources).toEqual(b.wellbeing.sources);
      expect(a.experience?.mental).toBe(b.experience?.mental);
      expect(a.experience?.pleasure).toBe(b.experience?.pleasure);
      expect(
        Object.keys(a.extensionState).filter((k) =>
          k.startsWith('open:practice:'),
        ),
      ).toEqual([]);
    }
    // Routine and progress accounting are exactly those of the same steps by hand.
    for (const key of ['open:routine', 'long:lastProgress', 'long:visited'])
      expect(actor(w).extensionState[key], key).toEqual(
        actor(hand).extensionState[key],
      );
    expect(actor(w).vitals).toEqual(actor(hand).vitals);
    // The install's practice rule exists, but nothing can trigger it.
    expect(w.satisfaction.find((r) => r.id === `practice:${id}`)).toMatchObject(
      { event: 'practice-confirmed', interface: id },
    );
  });

  it('keeps every agent-visible text free of excluded words and of any mention of the far people', () => {
    const texts: unknown[] = [];
    const keep = (r: ReturnType<typeof step>) => {
      const world = ok(r);
      texts.push(
        world.events.filter((e) => e.actor === 'kai'),
        longOrdinaryInput(world, 'kai').packet.execution,
        open(world),
        last(world),
      );
      return world;
    };
    let w = keep(step(learned(), { kai: search() }));
    w = keep(step(w, { kai: WAIT }));
    w = keep(step(w, { kai: control('resume') }));
    w = keep(step(w, { kai: control('resume') }));
    // Stops, an exhausted search, a cancel and an exploration of a wider area.
    for (const r of drive(learned(), search({ energy: 3.7 })).rounds) keep(r);
    const exhausted = learned();
    object(exhausted, LARDER).data.stock = 0;
    for (const r of drive(exhausted, search()).rounds) keep(r);
    for (const o of exhausted.objects.filter(
      (o) => o.data.resource === 'berry',
    ))
      o.data.stock = 0;
    let explore = keep(
      step(exhausted, { kai: search({ radius: 8, path: 4, energy: 8 }) }),
    );
    for (let i = 0; i < 6; i++)
      explore = keep(
        step(explore, { kai: search({ radius: 8, path: 4, energy: 8 }) }),
      );
    keep(step(explore, { kai: control('cancel') }));
    // The interface as Kai sees it in his ordinary input.
    const input = longOrdinaryInput(w, 'kai');
    texts.push(
      input.packet.abilities,
      input.catalogue.interfaces.filter((x) => x.id === id),
    );
    const text = JSON.stringify(texts);
    expect(text).toContain(`${id}-paused`);
    expect(text).toContain('"phase":"explore"');
    expect(text).toContain('search-exhausted');
    expect(text).toContain(`${id}-cancelled`);
    expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
    expect(text).not.toMatch(MENTION);
    // The open search is shown with the person's active work under its own key.
    const active = (
      longOrdinaryInput(ok(step(learned(), { kai: search() })), 'kai').packet
        .execution as { activeState: Data }
    ).activeState;
    expect(Object.keys(active)).toEqual([OPEN]);
  });
});
