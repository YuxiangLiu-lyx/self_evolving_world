import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Load,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Data,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';
import { CONTINUOUS_VISUALS } from '../../viewer/src/continuous-visuals.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 60_000 });

const id = 'hand-twist-sectioned-cord';
const CORD = 'hand-twist-fiber-cord';
const KNOT = 'hand-tie-cord-knot';
const JOIN = 'hand-join-fiber-cords';
const BIND = 'hand-bind-crossing';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** Material sources of the ex16 world and a spot within reach of each. */
const REEDS = { source: 'forest-reed-0', at: { x: 22.6, y: 5.9 } };
const GRASS = { source: 'forest-dry-grass-0', at: { x: 14.7, y: 16.5 } };
const BRANCHES = { source: 'start-1-branches', at: { x: 20.5, y: 9.7 } };
/** Clear dry land of the ex16 crossing-binding fixtures. */
const SITE = { x: 19.5, y: 5 };
/** Engine material values that no event may reveal. */
const HIDDEN = /flexib|hardness/i;
/** Further words agent-visible text must not contain. */
const ALSO_EXCLUDED = /story|myth|legend|tradition/i;

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
const mode = (m: string, args: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...args },
});
const use = (stackId: string, quantity: number) => ({ stackId, quantity });
const make = (stackId: string, quantity = 0.4, requestedLength = 0.6) =>
  mode('make', { materials: [use(stackId, quantity)], requestedLength });
const tenths = (n: number) => Math.round(n * 10);
/** Every tenth of reed in stacks: carried, reserved, worked, scrap or on the ground. */
const reed = (w: V7World) =>
  w.stacks
    .filter((s) => s.resource === 'reed')
    .reduce((n, s) => n + tenths(s.quantity), 0);
interface Job {
  id: string;
  status: string;
  completedWork: number;
  remainingWork: number;
  initialWork: number;
  paidEnergy: number;
  escrow: string[];
  target: string | null;
  outputs: string[];
  sections: number;
  sectionLength: number;
  revision: string;
}
const jobs = (w: V7World, ability = id) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === ability,
    )
    .map(([, v]) => v as unknown as Job);
const job = (w: V7World) => jobs(w).at(-1);
const part = (s?: V7Stack): V7Data =>
  (s?.processing?.fiberCord ?? {}) as V7Data;
const role = (w: V7World, r: string) =>
  w.stacks.filter((s) => part(s).role === r);
const item = (w: V7World, stackId: string) =>
  w.stacks.find((s) => s.id === stackId);
const energy = (w: V7World, name = 'wren') => actor(w, name).vitals.energy;
/** Energy a step spent beyond what the same round spends while waiting. */
const spent = (from: V7World, to: V7World, name = 'wren') =>
  energy(step(from).world, name) - energy(to, name);
/** The fiber-cord@1 reed law, restated: half the solid volume per ply over length x 2/sqrt(3) + 0.04 m. */
const plyDiameter = (units: number, length: number) =>
  2 *
  Math.sqrt(
    (units * 0.25 * (1 - 0.9)) /
      500 /
      2 /
      ((length * 2) / Math.sqrt(3) + 0.04) /
      Math.PI,
  );
/** Paid rounds of a requested length: three per 0.30 m section and one release check. */
const roundsOf = (length: number) => 3 * Math.ceil(length / 0.3 - 1e-9) + 1;
/** Everything this package emitted. */
const visible = (w: V7World) =>
  w.events.filter(
    (e) => e.interface === id || e.type.startsWith('sectioned-cord'),
  );
const types = (w: V7World) => visible(w).map((e) => e.type);

function installed() {
  const genesis = initialLongWorld('long-ex16', 'long-culture-v2');
  let w = v7Install(genesis, continuousRegistry(genesis), `${CORD}@1`);
  for (const dep of [KNOT, JOIN, BIND])
    w = v7Install(w, continuousRegistry(w), `${dep}@1`);
  return v7Clone(v7Install(w, continuousRegistry(w), `${id}@1`));
}
let supply: { w: V7World; raw: string } | undefined;
/** Wren gathers 3 units of real reed with the unchanged base gather and stays at the reed bed. */
function supplied() {
  if (!supply) {
    const w = installed();
    actor(w).position = { ...REEDS.at };
    const r = step(w, {
      wren: {
        interface: 'gather',
        args: { target: REEDS.source, quantity: 3 },
      },
    });
    expect(r.outcomes.wren?.success).toBe(true);
    const s = r.world.stacks.find(
      (s) => s.owner === 'wren' && s.origin === REEDS.source && !s.processing,
    );
    if (!s) throw new Error('Missing actually gathered fixture reed.');
    actor(r.world).vitals.energy = 40;
    supply = { w: r.world, raw: s.id };
  }
  return { w: v7Clone(supply.w), raw: supply.raw };
}
function study(w: V7World) {
  let x = step(w, {
    wren: { interface: 'learn', args: { ability: id } },
  }).world;
  for (let i = 0; i < 2; i++) x = step(x).world;
  expect(actor(x).mastered).toContain(id);
  actor(x).vitals.energy = 40;
  return x;
}
let sample: { w: V7World; raw: string } | undefined;
/** After study and a passing sample of the raw reed through this operation. */
function sampled() {
  if (!sample) {
    const f = supplied();
    const r = step(study(f.w), {
      wren: mode('sample', { materials: [use(f.raw, 0.1)] }),
    });
    expect(events(r.world, 'sectioned-cord-sampled')[0]?.data.passed).toBe(
      true,
    );
    actor(r.world).vitals.energy = 40;
    sample = { w: r.world, raw: f.raw };
  }
  return { w: v7Clone(sample.w), raw: sample.raw };
}
/** Paid make rounds from the given world. */
function rounds(w: V7World, n: number, action: V7Action) {
  let x = w;
  for (let i = 0; i < n; i++) x = step(x, { wren: action }).world;
  return x;
}
/** A complete cord after all paid rounds. */
function made(quantity = 0.4, length = 0.6, from = sampled()) {
  const w = rounds(from.w, roundsOf(length), make(from.raw, quantity, length));
  const c = w.stacks.find(
    (s) => part(s).role === 'cord' && !from.w.stacks.some((x) => x.id === s.id),
  );
  if (!c) throw new Error('Missing completed fixture cord.');
  actor(w).vitals.energy = 40;
  return { w, raw: from.raw, cord: c.id };
}
/** Moves a real portion of an owned stack into a lot with the given processing (and origin). */
function relabel(
  w: V7World,
  from: string,
  quantity: number,
  processing: V7Data | undefined,
  lot: string,
  origin?: string,
) {
  const s = item(w, from);
  if (!s) throw new Error('Missing fixture source.');
  const left = tenths(s.quantity) - tenths(quantity);
  s.quantity = left / 10;
  s.quantityTenths = left;
  const copy: V7Stack = {
    ...v7Clone(s),
    id: lot,
    quantity,
    quantityTenths: tenths(quantity),
    ...(origin ? { origin } : {}),
  };
  if (processing) copy.processing = processing;
  w.stacks.push(copy);
}
const unchanged = (
  w: V7World,
  action: V7Action,
  reason: RegExp,
  who = 'wren',
) => {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.success).toBe(false);
  expect(r.outcomes[who]?.reason).toMatch(reason);
  expect(r.world.stacks).toEqual(idle.stacks);
  expect(actor(r.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(jobs(r.world)).toEqual(jobs(idle));
  return r;
};

describe('sectioned hand-twisted fiber cord in ex16', () => {
  it('is scoped to ex16 after hand-twist-fiber-cord@1, leaves that package unchanged, needs three study rounds at 0.2 energy and fits the size limit', () => {
    const other = initialLongWorld('long-ex15', 'long-culture');
    expect(() =>
      v7Install(other, continuousRegistry(other), `${id}@1`),
    ).toThrow();
    const bare = initialLongWorld('long-ex16', 'long-culture-v2');
    expect(() => v7Install(bare, continuousRegistry(bare), `${id}@1`)).toThrow(
      /dependency/,
    );
    const only = v7Install(bare, continuousRegistry(bare), `${CORD}@1`),
      both = v7Install(only, continuousRegistry(only), `${id}@1`);
    // hand-twist-fiber-cord@1 keeps its exact ability text, handler and 0.30 m bound.
    const old = (w: V7World) =>
      JSON.stringify(w.abilities.find((a) => a.id === CORD));
    expect(old(both)).toBe(old(only));
    expect(
      both.abilities.find((a) => a.id === CORD)?.parameters.properties
        ?.requestedLength,
    ).toMatchObject({ maximum: 0.3 });
    const w0 = supplied().w,
      ability = w0.abilities.find((a) => a.id === id);
    expect(ability).toMatchObject({
      learning: 3,
      learningEnergy: 0.2,
      prerequisites: [],
      handler: 'long.hand-twist-sectioned-cord',
      revision: `${id}@1`,
    });
    expect(ability?.parameters.properties?.requestedLength).toMatchObject({
      minimum: 0.05,
      maximum: 0.6,
    });
    const limit = w0.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    const pkg = continuousRegistry(w0).packages.find((p) => p.id === id);
    for (const a of pkg?.abilities ?? [])
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(3500);
    const text = JSON.stringify({
      abilities: pkg?.abilities,
      events: pkg?.events,
      description: pkg?.description,
    });
    expect(CULTURE_EXCLUDED_WORDS.test(text)).toBe(false);
    expect(ALSO_EXCLUDED.test(text)).toBe(false);
    expect(pkg?.satisfaction).toEqual([]);
    expect(pkg?.dependencies).toEqual(['foundation-open@1', `${CORD}@1`]);
    expect(
      pkg?.visualComponents.every(
        (c) => typeof CONTINUOUS_VISUALS[c] === 'function',
      ),
    ).toBe(true);
    // Mastery of the short cord does not grant this operation.
    const f = supplied();
    actor(f.w).mastered.push(CORD);
    const early = step(f.w, {
      wren: mode('sample', { materials: [use(f.raw, 0.1)] }),
    });
    expect(early.outcomes.wren?.reason).toMatch(/not mastered/);
    expect(actor(early.world).vitals).toEqual(actor(step(f.w).world).vitals);
    // Each of the three study rounds is paid individually.
    let w = step(f.w, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(spent(f.w, w)).toBeCloseTo(0.2, 6);
    for (let i = 0; i < 2; i++) {
      expect(actor(w).mastered).not.toContain(id);
      const resting = v7Clone(w);
      actor(resting).learning = null;
      const next = step(w).world;
      expect(energy(step(resting).world) - energy(next)).toBeCloseTo(0.2, 6);
      w = next;
    }
    expect(actor(w).mastered).toContain(id);
    expect(events(w, 'satisfaction')).toHaveLength(0);
    expect(JSON.stringify(actor(w).wellbeing.sources)).not.toContain(id);
  });

  it('sample: the unchanged fiber-cord@1 sample for 0.1 unit, one round and 0.5 energy, kept in the shared sample records', () => {
    const f = supplied();
    const w0 = study(f.w),
      before = reed(w0),
      r = step(w0, {
        wren: mode('sample', { materials: [use(f.raw, 0.1)] }),
      }),
      w = r.world;
    expect(r.outcomes.wren).toMatchObject({ success: true, complete: true });
    expect(spent(w0, w)).toBeCloseTo(0.5, 6);
    expect(types(w)).toEqual([
      'trial-result',
      'information-confirmed',
      'sectioned-cord-sampled',
    ]);
    expect(events(w, 'fiber-cord-sampled')).toHaveLength(0);
    const lot = role(w, 'tested-lot')[0];
    expect(events(w, 'sectioned-cord-sampled')[0]?.data).toMatchObject({
      item: f.raw,
      lot: lot?.id,
      resource: 'reed',
      origin: REEDS.source,
      processing: 'raw',
      passed: true,
      strandLength: 1.8,
      appliedForce: 5,
      held: true,
      energy: 0.5,
    });
    expect(lot).toMatchObject({ quantity: 0.1, owner: 'wren' });
    expect(reed(w)).toBe(before);
    // The record is the one hand-twist-fiber-cord keeps: either operation's passing sample covers both.
    expect(
      actor(w).extensionState['long:hand-twist-fiber-cord:samples'],
    ).toEqual([
      {
        resource: 'reed',
        origin: REEDS.source,
        class: 'raw',
        condition: 1,
        passed: true,
        tick: w.tick,
        lot: lot?.id,
      },
    ]);
    // Like Wren at round 298: sampled only with hand-twist-fiber-cord, then a longer cord here.
    const g = supplied();
    actor(g.w).mastered.push(CORD);
    let x = step(g.w, {
      wren: {
        interface: CORD,
        args: { mode: 'sample', materials: [use(g.raw, 0.1)] },
      },
    }).world;
    x = study(x);
    const tested = role(x, 'tested-lot')[0]?.id ?? '';
    // The tested lot is real sampled fiber, usable once with the raw reed it came from.
    const started = step(x, {
      wren: mode('make', {
        materials: [use(g.raw, 0.3), use(tested, 0.1)],
        requestedLength: 0.6,
      }),
    });
    expect(started.outcomes.wren?.success).toBe(true);
    expect(
      item(started.world, job(started.world)?.target ?? '')?.quantity,
    ).toBe(0.4);
    expect(reed(started.world)).toBe(reed(x));
  });

  it('make: refuses uncovered, impossible, out-of-range, irrelevant, crowded or underpowered requests before any cost', () => {
    const s = supplied();
    unchanged(study(s.w), make(s.raw), /First pass a cord sample/);
    const f = sampled();
    unchanged(f.w, make(f.raw, 0.1), /0.2-1 unit/);
    unchanged(f.w, make(f.raw, 1.1), /0.2-1 unit/);
    unchanged(f.w, make(f.raw, 0.4, 0.61), /requestedLength/);
    unchanged(f.w, make(f.raw, 0.4, 0.04), /requestedLength/);
    unchanged(
      f.w,
      mode('make', { materials: [use(f.raw, 0.4)] }),
      /requestedLength/,
    );
    unchanged(
      f.w,
      mode('make', {
        materials: [use(f.raw, 0.4)],
        requestedLength: 0.6,
        trialForce: 10,
      }),
      /Irrelevant argument/,
    );
    unchanged(f.w, make('reed'), /exact id/);
    unchanged(
      f.w,
      mode('make', { workId: 'manual-1', requestedLength: 0.6 }),
      /workId/,
    );
    // Finished cords like Wren's two 0.30 m cords are not raw fiber and are not extended.
    const c = v7Clone(f.w);
    relabel(
      c,
      f.raw,
      0.2,
      {
        fiberCord: {
          role: 'cord',
          status: 'complete',
          law: 'fiber-cord@1',
          classes: ['raw'],
          condition: 0.9635,
          length: 0.3,
          twisted: 0.3,
          plied: true,
          plies: 2,
          overall: 0.34,
          plyDiameter: 0.00405897,
        },
      },
      'item-fixture-cord',
    );
    unchanged(
      c,
      mode('make', {
        materials: [use('item-fixture-cord', 0.2)],
        requestedLength: 0.6,
      }),
      /cords and fragments cannot be twisted/,
    );
    // One fiber from one source.
    const mixed = v7Clone(f.w);
    relabel(
      mixed,
      f.raw,
      0.2,
      undefined,
      'item-fixture-other',
      'forest-reed-1',
    );
    unchanged(
      mixed,
      mode('make', {
        materials: [use(f.raw, 0.2), use('item-fixture-other', 0.2)],
        requestedLength: 0.6,
      }),
      /one fiber material from one source/,
    );
    // A fixture lightens reed so that the request alone rules the plies out, even fully intact.
    const light = v7Clone(f.w),
      r = light.resources.find((x) => x.id === 'reed');
    if (!r) throw new Error('Missing reed resource.');
    r.mass = 0.0005;
    unchanged(light, make(f.raw, 0.2), /thinner than 1 mm/);
    // The work circle grows with the aligned ply: 0.73 m bundles for 0.60 m, 0.39 m for 0.30 m.
    const crowded = v7Clone(f.w);
    actor(crowded, 'kai').position = { x: REEDS.at.x + 0.7, y: REEDS.at.y };
    unchanged(crowded, make(f.raw), /another person/);
    expect(
      step(crowded, { wren: make(f.raw, 0.4, 0.3) }).outcomes.wren?.success,
    ).toBe(true);
    const tired = v7Clone(f.w);
    actor(tired).vitals.energy = 0.9;
    unchanged(tired, make(f.raw), /Not enough energy/);
    expect(job(f.w)).toBeUndefined();
  });

  it('make: dry grass has no strand law, so the gap is reported and nothing is reserved', () => {
    const f = sampled();
    actor(f.w).position = { ...GRASS.at };
    const g = step(f.w, {
      wren: {
        interface: 'gather',
        args: { target: GRASS.source, quantity: 1 },
      },
    });
    const grass = g.world.stacks.find(
      (s) => s.owner === 'wren' && s.resource === 'dry-grass',
    );
    if (!grass) throw new Error('Missing gathered grass.');
    actor(g.world).vitals.energy = 40;
    const x = step(g.world, {
      wren: mode('sample', { materials: [use(grass.id, 0.1)] }),
    }).world;
    expect(events(x, 'sectioned-cord-sampled')[0]?.data).toMatchObject({
      resource: 'dry-grass',
      passed: false,
      held: null,
    });
    actor(x).vitals.energy = 40;
    unchanged(x, make(grass.id, 0.4), /No strand law/);
  });

  it('make: seven paid rounds of 1 energy twist 0.4 reed into one continuous owned 0.60 m two-ply cord sized by conserved volume', () => {
    const f = sampled();
    const before = reed(f.w),
      load = v7Load(f.w, actor(f.w)),
      e0 = energy(f.w);
    const first = step(f.w, { wren: make(f.raw) });
    expect(first.outcomes.wren?.complete).toBe(false);
    expect(spent(f.w, first.world)).toBeCloseTo(1, 6);
    expect(types(first.world)).toEqual([
      'sectioned-cord-started',
      'process-progress',
      'sectioned-cord-progress',
    ]);
    expect(job(first.world)).toMatchObject({
      initialWork: 7,
      sections: 2,
      sectionLength: 0.3,
      revision: `${id}@1`,
    });
    const piece = item(first.world, job(first.world)?.target ?? '');
    expect(piece).toMatchObject({
      quantity: 0.4,
      owner: 'wren',
      reservedFor: job(first.world)?.id,
      origin: REEDS.source,
    });
    expect(part(piece)).toMatchObject({
      role: 'workpiece',
      status: 'aligned',
      law: 'fiber-cord@1',
      madeWith: `${id}@1`,
      classes: ['raw'],
      plies: 2,
      twisted: 0,
      plied: false,
      length: 0.6,
      overall: 0.64,
      rounds: 7,
      alignedLength: 0.3,
      heldLength: 0,
      pliedLength: 0,
      sections: [
        {
          section: 1,
          from: 0,
          to: 0.3,
          aligned: true,
          twisted: false,
          plied: false,
        },
        {
          section: 2,
          from: 0.3,
          to: 0.6,
          aligned: false,
          twisted: false,
          plied: false,
        },
      ],
    });
    expect(Number(part(piece).plyDiameter)).toBeCloseTo(
      plyDiameter(0.4, 0.6),
      7,
    );
    const progress = events(first.world, 'sectioned-cord-progress')[0];
    expect(progress?.data).toMatchObject({
      round: 1,
      stage: 'separate-align',
      section: 1,
      nextStage: 'twist',
      usableTenths: 4,
      brokenTenths: 0,
      strandLength: 1.8,
      plyFiberLength: 0.7328,
      feasibleLength: [0.05, 0.6],
      handled: { incorporatedTenths: 4, scrapTenths: 0 },
      visual: {
        component: 'fiber-cord',
        state: 'aligned',
        progress: 0.14285714,
      },
    });
    expect(v7Load(first.world, actor(first.world))).toBeCloseTo(load, 8);
    expect(reed(first.world)).toBe(before);
    // Each later round pays 1 energy for one step of one section; only plied parts hold themselves.
    const expected = [
      ['twist', 1, 'twisting', 0.3, 0.3, 0, false],
      ['counter-ply', 1, 'partly-plied', 0.3, 0, 0.3, false],
      ['separate-align', 2, 'aligned', 0.3, 0, 0.3, false],
      ['twist', 2, 'twisting', 0.6, 0.3, 0.3, false],
      ['counter-ply', 2, 'plied', 0.6, 0, 0.6, true],
    ];
    let w = first.world;
    for (const [
      stage,
      section,
      status,
      twisted,
      held,
      plied,
      all,
    ] of expected) {
      const r = step(w, { wren: make(f.raw) });
      expect(spent(w, r.world)).toBeCloseTo(1, 6);
      expect(r.outcomes.wren?.complete).toBe(false);
      w = r.world;
      expect(types(w)).toEqual(['process-progress', 'sectioned-cord-progress']);
      expect(events(w, 'sectioned-cord-progress')[0]?.data).toMatchObject({
        stage,
        section,
      });
      expect(part(item(w, piece?.id ?? ''))).toMatchObject({
        role: 'workpiece',
        status,
        twisted,
        heldLength: held,
        pliedLength: plied,
        plied: all,
      });
    }
    // The release check: an untested cord, never shown complete before it.
    const last = step(w, { wren: make(f.raw) });
    expect(last.outcomes.wren?.complete).toBe(true);
    expect(spent(w, last.world)).toBeCloseTo(1, 6);
    w = last.world;
    expect(types(w)).toEqual([
      'process-progress',
      'trial-result',
      'information-confirmed',
      'sectioned-cord-completed',
    ]);
    const done = events(w, 'sectioned-cord-completed')[0],
      c = role(w, 'cord')[0];
    expect(done?.target).toBe(c?.id);
    expect(c?.id).toBe(piece?.id);
    expect(c).toMatchObject({ quantity: 0.4, owner: 'wren' });
    expect(c?.reservedFor).toBeUndefined();
    expect(part(c)).toMatchObject({
      role: 'cord',
      status: 'complete',
      untested: true,
      plied: true,
      plies: 2,
      length: 0.6,
      twisted: 0.6,
      overall: 0.64,
      looseEnds: 4,
      twist: { ply: 'S', lay: 'Z' },
      stages: 7,
      trials: [],
    });
    expect(done?.data).toMatchObject({
      outcome: 'complete',
      length: 0.6,
      overall: 0.64,
      sectionCount: 2,
      visual: { component: 'fiber-cord', state: 'cord', untested: true },
    });
    expect(Number(done?.data.plyDiameter)).toBeCloseTo(0.0042, 6);
    expect(job(w)).toMatchObject({
      status: 'completed',
      completedWork: 7,
      paidEnergy: 7,
    });
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(reed(w)).toBe(before);
    expect(v7Load(w, actor(w))).toBeCloseTo(load, 8);
    let waited = f.w;
    for (let i = 0; i < 7; i++) waited = step(waited).world;
    expect(e0 - energy(w) - (e0 - energy(waited))).toBeCloseTo(7, 6);
    // One verified record; no milestone, pleasure or comfort follows.
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(events(w, 'satisfaction')).toHaveLength(0);
    expect(JSON.stringify(actor(w).wellbeing.sources)).not.toContain(id);
    const shown = JSON.stringify(
      visible(w).map((e) => [e.description, e.data]),
    );
    expect(shown).not.toMatch(HIDDEN);
    expect(CULTURE_EXCLUDED_WORDS.test(shown)).toBe(false);
    expect(ALSO_EXCLUDED.test(shown)).toBe(false);
  });

  it('make: up to 0.30 m it is the same four paid rounds and geometry as hand-twist-fiber-cord; longer spans split into equal sections', () => {
    const f = sampled();
    const short = made(0.5, 0.3, f);
    expect(job(short.w)).toMatchObject({ completedWork: 4, paidEnergy: 4 });
    // The same fiber twisted by the unchanged hand-twist-fiber-cord@1 gives the same cord.
    const w = v7Clone(short.w);
    actor(w).mastered.push(CORD);
    const old = rounds(w, 4, {
      interface: CORD,
      args: {
        mode: 'make',
        materials: [use(f.raw, 0.5)],
        requestedLength: 0.3,
      },
    });
    const other = role(old, 'cord').find((s) => s.id !== short.cord);
    const keys = [
      'role',
      'status',
      'law',
      'untested',
      'plied',
      'plies',
      'length',
      'twisted',
      'overall',
      'plyDiameter',
      'twist',
      'looseEnds',
    ];
    const pick = (s?: V7Stack) =>
      Object.fromEntries(keys.map((k) => [k, part(s)[k]]));
    expect(pick(item(old, short.cord))).toEqual(pick(other));
    expect(Number(part(other).plyDiameter)).toBeCloseTo(
      plyDiameter(0.5, 0.3),
      7,
    );
    // Above 0.30 m two equal sections and seven rounds.
    for (const [length, half] of [
      [0.31, 0.155],
      [0.45, 0.225],
    ]) {
      const r = step(f.w, { wren: make(f.raw, 0.4, length) });
      expect(job(r.world)).toMatchObject({
        initialWork: 7,
        sections: 2,
        sectionLength: half,
      });
      expect(part(item(r.world, job(r.world)?.target ?? '')).sections).toEqual([
        {
          section: 1,
          from: 0,
          to: half,
          aligned: true,
          twisted: false,
          plied: false,
        },
        {
          section: 2,
          from: half,
          to: length,
          aligned: false,
          twisted: false,
          plied: false,
        },
      ]);
    }
  });

  it('make: broken strands become scrap and a measured round-1 shortfall returns every reserved tenth once, charging only that round', () => {
    const f = sampled();
    // Worn fiber: an offcut-shaped lot of condition 0.7, covered by its own passing sample.
    const w = v7Clone(f.w);
    relabel(
      w,
      f.raw,
      0.6,
      {
        fiberMatLot: {
          role: 'offcut',
          condition: 0.7,
          sourceOwner: 'wren',
          incorporatedAt: 1,
        },
      },
      'item-fixture-worn',
    );
    let x = step(w, {
      wren: mode('sample', { materials: [use('item-fixture-worn', 0.1)] }),
    }).world;
    expect(events(x, 'sectioned-cord-sampled')[0]?.data.passed).toBe(true);
    actor(x).vitals.energy = 40;
    const before = reed(x);
    x = step(x, { wren: make('item-fixture-worn', 0.4) }).world;
    const piece = item(x, job(x)?.target ?? ''),
      scrap = role(x, 'scrap');
    expect(events(x, 'sectioned-cord-progress')[0]?.data).toMatchObject({
      totalTenths: 4,
      brokenTenths: 1,
      usableTenths: 3,
      handled: { incorporatedTenths: 3, scrapTenths: 1 },
    });
    expect(piece?.quantity).toBe(0.3);
    expect(scrap.map((s) => s.quantity)).toEqual([0.1]);
    expect(part(scrap[0])).toMatchObject({ role: 'scrap', condition: 0 });
    expect(scrap[0]?.reservedFor).toBeUndefined();
    expect(Number(part(piece).plyDiameter)).toBeCloseTo(
      plyDiameter(0.3, 0.6),
      7,
    );
    expect(reed(x)).toBe(before);
    // Too much fiber for a short span: plies would exceed 12 mm.
    const y = v7Clone(f.w),
      start = reed(y),
      r = step(y, { wren: make(f.raw, 1, 0.05) });
    expect(r.outcomes.wren?.complete).toBe(true);
    expect(spent(y, r.world)).toBeCloseTo(1, 6);
    expect(types(r.world)).toEqual([
      'sectioned-cord-started',
      'process-progress',
      'trial-result',
      'information-confirmed',
      'sectioned-cord-shortfall',
    ]);
    const e = events(r.world, 'sectioned-cord-shortfall')[0];
    expect(e?.data.shortfall).toMatch(/thicker than 12 mm/);
    expect(Number(e?.data.plyDiameter)).toBeGreaterThan(0.012);
    const range = e?.data.feasibleLength as number[];
    expect(range[0]).toBeGreaterThan(0.15);
    expect(range[1]).toBe(0.6);
    expect(job(r.world)?.status).toBe('stopped');
    const returned = (job(r.world)?.escrow ?? []).map((id) =>
      item(r.world, id),
    );
    expect(returned.map((s) => s?.quantity)).toEqual([1]);
    expect(
      returned.every(
        (s) => s?.owner === 'wren' && !s.reservedFor && !s.processing,
      ),
    ).toBe(true);
    expect(role(r.world, 'workpiece')).toHaveLength(0);
    expect(reed(r.world)).toBe(start);
    // Within the measured range the same fiber is made.
    actor(r.world).vitals.energy = 40;
    const ok = step(r.world, {
      wren: make(returned[0]?.id ?? '', 1, 0.6),
    });
    expect(events(ok.world, 'sectioned-cord-progress')).toHaveLength(1);
  });

  it('pauses uncharged when not worked, resumes only by workId, and cancel leaves the real partly plied workpiece', () => {
    const f = sampled();
    const before = reed(f.w);
    let w = rounds(f.w, 3, make(f.raw));
    const workId = job(w)?.id ?? '';
    // A round spent otherwise pauses the work; nothing is paid and the plied section holds itself.
    w = step(w).world;
    expect(job(w)).toMatchObject({ status: 'paused', paidEnergy: 3 });
    expect(events(w, 'sectioned-cord-paused')[0]?.data).toMatchObject({
      workId,
      remaining: 4,
      nextStage: 'separate-align',
      nextSection: 2,
    });
    unchanged(w, make(f.raw), /Unfinished sectioned cord work/);
    unchanged(
      w,
      mode('make', { workId, requestedLength: 0.6 }),
      /Irrelevant argument/,
    );
    unchanged(
      w,
      mode('make', { workId, materials: [use(f.raw, 0.4)] }),
      /Irrelevant argument/,
    );
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.5;
    const low = step(tired, { wren: mode('make', { workId }) });
    expect(low.outcomes.wren?.success).toBe(true);
    expect(events(low.world, 'sectioned-cord-paused')[0]?.data).toMatchObject({
      requiredEnergy: 1,
    });
    expect(spent(tired, low.world)).toBeCloseTo(0, 6);
    const back = step(w, { wren: mode('make', { workId }) });
    expect(events(back.world, 'sectioned-cord-resumed')).toHaveLength(1);
    expect(
      events(back.world, 'sectioned-cord-progress')[0]?.data,
    ).toMatchObject({ stage: 'separate-align', section: 2, round: 4 });
    expect(spent(w, back.world)).toBeCloseTo(1, 6);
    // Cancel is energy-free; the fiber stays an owned unfinished workpiece in its actual state.
    const r = step(back.world, { wren: mode('cancel') });
    expect(r.outcomes.wren?.success).toBe(true);
    expect(spent(back.world, r.world)).toBeCloseTo(0, 6);
    const piece = role(r.world, 'workpiece')[0];
    expect(piece).toMatchObject({ owner: 'wren', quantity: 0.4 });
    expect(piece?.reservedFor).toBeUndefined();
    expect(part(piece)).toMatchObject({
      status: 'unfinished',
      workId: null,
      twisted: 0.3,
      pliedLength: 0.3,
      alignedLength: 0.6,
      plied: false,
    });
    expect(job(r.world)).toMatchObject({ status: 'stopped', paidEnergy: 4 });
    expect(events(r.world, 'sectioned-cord-cancelled')[0]?.target).toBe(
      piece?.id,
    );
    expect(reed(r.world)).toBe(before);
    unchanged(r.world, mode('cancel'), /No unfinished sectioned cord work/);
    // The unfinished workpiece is fiber that may be supplied whole to a new attempt, paid again.
    actor(r.world).vitals.energy = 40;
    unchanged(r.world, make(piece?.id ?? '', 0.3), /whole/);
    const again = step(r.world, { wren: make(piece?.id ?? '', 0.4) });
    expect(again.outcomes.wren?.success).toBe(true);
    expect(spent(r.world, again.world)).toBeCloseTo(1, 6);
    expect(job(again.world)?.completedWork).toBe(1);
  });

  it('regripping needs the counter-plied section to hold its form: an unsound one fails there and nothing is refunded', () => {
    const f = sampled();
    const w = rounds(f.w, 3, make(f.raw));
    const piece = job(w)?.target ?? '';
    // A fixture lowers the workpiece below the sound condition 0.5 after the first section.
    part(item(w, piece)).condition = 0.45;
    const r = step(w, { wren: make(f.raw) });
    expect(r.outcomes.wren?.success).toBe(true);
    expect(spent(w, r.world)).toBeCloseTo(1, 6);
    const e = events(r.world, 'sectioned-cord-failed')[0];
    expect(e?.description).toMatch(/did not keep its form/);
    expect(job(r.world)).toMatchObject({ status: 'stopped', paidEnergy: 4 });
    expect(item(r.world, piece)).toMatchObject({
      owner: 'wren',
      quantity: 0.4,
    });
    expect(item(r.world, piece)?.reservedFor).toBeUndefined();
    expect(part(item(r.world, piece))).toMatchObject({
      role: 'workpiece',
      status: 'failed',
      pliedLength: 0.3,
    });
    expect(role(r.world, 'cord')).toHaveLength(0);
    expect(reed(r.world)).toBe(reed(w));
  });

  it('inspect reports measured sections, held and plied lengths for 0.2 energy and leaves strength unknown', () => {
    const f = sampled();
    const w = rounds(f.w, 2, make(f.raw)),
      workId = job(w)?.id ?? '';
    const r = step(w, { wren: mode('inspect', { workId }) });
    expect(r.outcomes.wren?.success).toBe(true);
    expect(spent(w, r.world)).toBeCloseTo(0.2, 6);
    const e = events(r.world, 'sectioned-cord-inspected')[0];
    expect(e?.data).toMatchObject({
      workId,
      stage: 'twist',
      section: 1,
      remaining: 5,
      sectionCount: 2,
      role: 'workpiece',
      state: 'twisting',
      heldLength: 0.3,
      pliedLength: 0,
      breakingForce: null,
      reserved: true,
    });
    expect(events(r.world, 'information-confirmed')).toHaveLength(0);
    const c = made();
    const look = step(c.w, { wren: mode('inspect', { targetId: c.cord }) });
    expect(spent(c.w, look.world)).toBeCloseTo(0.2, 6);
    expect(
      events(look.world, 'sectioned-cord-inspected')[0]?.data,
    ).toMatchObject({
      item: c.cord,
      role: 'cord',
      length: 0.6,
      overallLength: 0.64,
      plies: 2,
      looseEnds: 4,
      untested: true,
      breakingForce: null,
    });
    expect(
      actor(look.world).memory.knowledge?.[`${c.cord}:fiber-cord-condition`]
        ?.verified,
    ).toBe(false);
    unchanged(
      c.w,
      mode('inspect', { targetId: c.cord, workId: 'manual-1' }),
      /exactly one/,
    );
    unchanged(c.w, mode('inspect', { targetId: c.raw }), /your own item/);
  });

  it('trial: the unchanged fiber-cord@1 two-hand trial for 0.5 energy, identical to hand-twist-fiber-cord on the same cord', () => {
    const c = made();
    const r = step(c.w, {
      wren: mode('trial', {
        targetId: c.cord,
        trialForce: 10,
        trialDuration: 60,
      }),
    });
    expect(r.outcomes.wren?.success).toBe(true);
    expect(spent(c.w, r.world)).toBeCloseTo(0.5, 6);
    const held = events(r.world, 'sectioned-cord-trial')[0];
    expect(held?.data).toMatchObject({
      outcome: 'held',
      requestedForce: 10,
      achievedForce: 10,
      heldSeconds: 60,
      strandsBroken: 0,
      freeSpan: 0.54,
      lengthBefore: 0.6,
    });
    expect(part(item(r.world, c.cord))).toMatchObject({ untested: false });
    const w = v7Clone(c.w);
    actor(w).mastered.push(CORD);
    const old = step(w, {
      wren: {
        interface: CORD,
        args: {
          mode: 'trial',
          targetId: c.cord,
          trialForce: 10,
          trialDuration: 60,
        },
      },
    }).world;
    expect(events(old, 'fiber-cord-trial')[0]?.data).toEqual(held?.data);
    // A thin 0.60 m cord breaks into two owned fragments of conserved fiber.
    const thin = made(0.2, 0.6),
      before = reed(thin.w),
      b = step(thin.w, {
        wren: mode('trial', {
          targetId: thin.cord,
          trialForce: 100,
          trialDuration: 60,
        }),
      }).world;
    expect(events(b, 'sectioned-cord-trial')[0]?.data.outcome).toBe('broke');
    const pieces = role(b, 'fragment');
    expect(pieces.map((s) => s.quantity)).toEqual([0.1, 0.1]);
    expect(events(b, 'sectioned-cord-broken')[0]?.data.fragments).toEqual(
      pieces.map((s) => s.id),
    );
    expect(part(pieces[0])).toMatchObject({ length: 0.3, overall: 0.32 });
    expect(reed(b)).toBe(before);
    unchanged(
      c.w,
      mode('trial', { targetId: c.raw, trialForce: 5, trialDuration: 5 }),
      /finished cord/,
    );
    unchanged(
      c.w,
      mode('trial', { targetId: c.cord, trialForce: 5 }),
      /trialDuration/,
    );
  });

  it('its cords are ordinary cords: the knot, join and crossing-binding operations take them as they are', () => {
    // Two 0.60 m cords and one 0.56 m (0.60 m overall) cord of 0.2 unit each.
    let f = sampled();
    const a = made(0.2, 0.6, f);
    f = { w: a.w, raw: a.raw };
    const b = made(0.2, 0.6, f);
    f = { w: b.w, raw: b.raw };
    const long = made(0.2, 0.56, f);
    let w = long.w;
    expect(part(item(w, long.cord))).toMatchObject({ overall: 0.6 });
    // Study of the consumers is covered by their own tests; mastery is set directly here.
    actor(w).mastered.push(KNOT, JOIN, BIND);
    const knot = step(w, {
      wren: {
        interface: KNOT,
        args: { mode: 'attempt', targetId: a.cord, knot: 'overhand' },
      },
    });
    expect(knot.outcomes.wren?.success).toBe(true);
    expect(events(knot.world, 'cord-knot-started')).toHaveLength(1);
    expect(item(knot.world, a.cord)?.reservedFor).toBeTruthy();
    const join = step(w, {
      wren: {
        interface: JOIN,
        args: {
          mode: 'attempt',
          cordIds: [a.cord, b.cord],
          method: 'sheet-bend',
        },
      },
    });
    expect(join.outcomes.wren?.success).toBe(true);
    expect(events(join.world, 'cord-join-started')).toHaveLength(1);
    // Two whole branch units gathered for real, crossed at the clear site and bound in four rounds.
    const lots: string[] = [];
    for (let i = 0; i < 2; i++) {
      actor(w).position = { ...BRANCHES.at };
      actor(w).vitals.energy = 40;
      const g = step(w, {
        wren: {
          interface: 'gather',
          args: { target: BRANCHES.source, quantity: 1 },
        },
      });
      expect(g.outcomes.wren?.success).toBe(true);
      w = g.world;
      const lot = w.stacks.find(
        (s) =>
          s.owner === 'wren' && s.resource === 'branch' && !lots.includes(s.id),
      );
      if (!lot) throw new Error('Missing gathered branch lot.');
      lots.push(lot.id);
    }
    actor(w).position = { ...SITE };
    actor(w).vitals.energy = 40;
    const bind: V7Action = {
      interface: BIND,
      args: {
        mode: 'attempt',
        pieceIds: lots,
        cordId: long.cord,
        crossingAngle: 90,
      },
    };
    const first = step(w, { wren: bind });
    expect(first.outcomes.wren?.success).toBe(true);
    expect(events(first.world, 'crossing-binding-started')).toHaveLength(1);
    // The binding recomputes its own need for this cord's width and length.
    expect(
      events(first.world, 'crossing-binding-stage')[0]?.description,
    ).toMatch(/the cord's 0.6 m covers the/);
    const bound = rounds(first.world, 3, bind);
    expect(events(bound, 'crossing-binding-release-held')).toHaveLength(1);
    expect(part(item(bound, long.cord)).role).toBe('bound');
    expect(reed(bound)).toBe(reed(w));
  });

  it('worked fiber wears 0.0005 condition per round once, through hand-twist-fiber-cord@1', () => {
    const c = made();
    const c0 = Number(part(item(c.w, c.cord)).condition);
    let w = c.w;
    for (let i = 0; i < 4; i++) w = step(w).world;
    expect(Number(part(item(w, c.cord)).condition)).toBeCloseTo(
      c0 - 4 * 0.0005,
      8,
    );
    expect(item(w, c.raw)?.processing).toBeUndefined();
  });

  it('keeps the work personal: another person cannot resume, inspect, trial or cancel it', () => {
    const c = made();
    let w = step(c.w, { wren: make(c.raw) }).world;
    const workId = job(w)?.id ?? '';
    w = v7Clone(w);
    actor(w, 'kai').mastered.push(id);
    actor(w, 'kai').position = { x: REEDS.at.x - 2, y: REEDS.at.y };
    unchanged(
      w,
      mode('make', { workId }),
      /No unfinished sectioned cord work of yours/,
      'kai',
    );
    unchanged(
      w,
      mode('inspect', { workId }),
      /No sectioned cord work of yours/,
      'kai',
    );
    unchanged(
      w,
      mode('trial', { targetId: c.cord, trialForce: 5, trialDuration: 5 }),
      /your own finished cord/,
      'kai',
    );
    unchanged(
      w,
      mode('cancel', { workId }),
      /No unfinished sectioned cord work/,
      'kai',
    );
  });

  it('stops at death, leaving reserved fiber and the unfinished workpiece on the ground once', () => {
    const f = sampled();
    const w = rounds(f.w, 4, make(f.raw));
    const piece = job(w)?.target ?? '';
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    const dead = v7Clone(w);
    pkg?.onDeath?.(dead, actor(dead));
    expect(job(dead)?.status).toBe('stopped');
    expect(events(dead, 'sectioned-cord-failed')).toHaveLength(1);
    const at = actor(dead).position,
      s = item(dead, piece);
    expect(s).toMatchObject({ owner: null, position: at, quantity: 0.4 });
    expect(s?.reservedFor).toBeUndefined();
    expect(part(s)).toMatchObject({
      status: 'unfinished',
      workId: null,
      pliedLength: 0.3,
    });
    expect(reed(dead)).toBe(reed(w));
  });
});
