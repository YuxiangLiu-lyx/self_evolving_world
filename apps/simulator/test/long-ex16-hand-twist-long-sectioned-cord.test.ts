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
vi.setConfig({ testTimeout: 120_000 });

const id = 'hand-twist-long-sectioned-cord';
const PREFIX = 'long-sectioned-cord-';
const CORD = 'hand-twist-fiber-cord';
const SECTIONED = 'hand-twist-sectioned-cord';
const KNOT = 'hand-tie-cord-knot';
const JOIN = 'hand-join-fiber-cords';
const BIND = 'hand-bind-crossing';
const LASH = 'hand-lash-crossing';
const FRAP = 'hand-frap-crossing';
/** The cord packages this one reuses, and the operations that take its cords. */
const DEPENDENCIES = [CORD, SECTIONED];
const CONSUMERS = [KNOT, JOIN, BIND, LASH, FRAP];
const WAIT: V7Action = { interface: 'wait', args: {} };
/** Material sources of the ex16 world and a spot within reach of each. */
const REEDS = { source: 'forest-reed-0', at: { x: 22.6, y: 5.9 } };
const BRANCHES = { source: 'start-1-branches', at: { x: 20.5, y: 9.7 } };
/** Clear dry land of the ex16 crossing fixtures. */
const SITE = { x: 19.5, y: 5 };
/** Engine material values that no event may reveal. */
const HIDDEN = /flexib|hardness/i;
/** Further words agent-visible text must not contain. */
const ALSO_EXCLUDED = /story|myth|legend|tradition/i;
/** The derived ceiling: an unspliced reed ply is one 1.8 m stem, so (1.8 - 2 x 0.02) / (2 / sqrt 3). */
const REACH = ((1.8 - 0.04) * Math.sqrt(3)) / 2;

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
  w.events.filter((e) => e.type === `${PREFIX}${type}`);
const mode = (m: string, args: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode: m, ...args },
});
const use = (stackId: string, quantity: number) => ({ stackId, quantity });
const make = (stackId: string, quantity = 0.4, requestedLength = 1) =>
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
  workLength: number;
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
/** Everything this package emitted, and the reused packages' own event names. */
const visible = (w: V7World) =>
  w.events.filter((e) => e.interface === id || e.type.startsWith(PREFIX));
const types = (w: V7World) => visible(w).map((e) => e.type);
const reusedEvents = (w: V7World) =>
  w.events.filter(
    (e) =>
      e.type.startsWith('fiber-cord-') || e.type.startsWith('sectioned-cord-'),
  );

function installed() {
  let w = initialLongWorld('long-ex16', 'long-culture-v2');
  for (const dep of [CORD, KNOT, JOIN, BIND, SECTIONED, LASH, FRAP])
    w = v7Install(w, continuousRegistry(w), `${dep}@1`);
  return v7Clone(v7Install(w, continuousRegistry(w), `${id}@1`));
}
let supply: { w: V7World; raw: string } | undefined;
/** Wren gathers 3 units of real reed with the unchanged base gather and stays at the reed bed. Like
 * Wren in ex16 she has mastered the sectional method; its study is covered by its own tests. */
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
    actor(r.world).mastered.push(SECTIONED);
    actor(r.world).vitals.energy = 40;
    supply = { w: r.world, raw: s.id };
  }
  return { w: v7Clone(supply.w), raw: supply.raw };
}
function study(w: V7World) {
  const x = step(w, {
    wren: { interface: 'learn', args: { ability: id } },
  }).world;
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
    expect(events(r.world, 'sampled')[0]?.data.passed).toBe(true);
    actor(r.world).vitals.energy = 40;
    sample = { w: r.world, raw: f.raw };
  }
  return { w: v7Clone(sample.w), raw: sample.raw };
}
/** Paid make rounds from the given world, with energy restored after each. */
function rounds(w: V7World, n: number, action: V7Action) {
  let x = w;
  for (let i = 0; i < n; i++) {
    const r = step(x, { wren: action });
    expect(r.outcomes.wren?.success).toBe(true);
    x = r.world;
    actor(x).vitals.energy = 40;
  }
  return x;
}
/** A complete cord after all paid rounds. */
function made(quantity = 0.4, length = 1, from = sampled()) {
  const w = rounds(from.w, roundsOf(length), make(from.raw, quantity, length));
  const c = w.stacks.find(
    (s) => part(s).role === 'cord' && !from.w.stacks.some((x) => x.id === s.id),
  );
  if (!c) throw new Error('Missing completed fixture cord.');
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
const clean = (w: V7World) => {
  const shown = JSON.stringify(visible(w).map((e) => [e.description, e.data]));
  expect(shown).not.toMatch(HIDDEN);
  expect(CULTURE_EXCLUDED_WORDS.test(shown)).toBe(false);
  expect(ALSO_EXCLUDED.test(shown)).toBe(false);
  expect(w.events.filter((e) => e.type === 'satisfaction')).toHaveLength(0);
  expect(w.events.filter((e) => e.type === 'practice-confirmed')).toHaveLength(
    0,
  );
  expect(JSON.stringify(actor(w).wellbeing.sources)).not.toContain(id);
};

describe('long sectioned hand-twisted fiber cord in ex16', () => {
  it('is scoped to ex16 after both cord packages, keeps them and the cord consumers byte-identical, takes one 0.2-energy study round after the sectional method and fits the size limit', () => {
    const other = initialLongWorld('long-ex15', 'long-culture');
    expect(() =>
      v7Install(other, continuousRegistry(other), `${id}@1`),
    ).toThrow();
    let bare = initialLongWorld('long-ex16', 'long-culture-v2');
    for (const dep of DEPENDENCIES) {
      expect(() =>
        v7Install(bare, continuousRegistry(bare), `${id}@1`),
      ).toThrow(/dependency/);
      bare = v7Install(bare, continuousRegistry(bare), `${dep}@1`);
    }
    for (const dep of CONSUMERS)
      bare = v7Install(bare, continuousRegistry(bare), `${dep}@1`);
    const withIt = v7Install(bare, continuousRegistry(bare), `${id}@1`);
    // The reused and consuming packages keep their exact ability text and revisions.
    for (const reused of [...DEPENDENCIES, ...CONSUMERS]) {
      const text = (w: V7World) =>
        JSON.stringify(w.abilities.find((a) => a.id === reused));
      expect(text(withIt)).toBe(text(bare));
      expect(withIt.abilities.find((a) => a.id === reused)?.revision).toBe(
        `${reused}@1`,
      );
    }
    // hand-twist-sectioned-cord@1 keeps its 0.60 m ceiling; only this operation drops it.
    expect(
      withIt.abilities.find((a) => a.id === SECTIONED)?.parameters.properties
        ?.requestedLength,
    ).toMatchObject({ minimum: 0.05, maximum: 0.6 });
    const ability = withIt.abilities.find((a) => a.id === id);
    expect(ability).toMatchObject({
      learning: 1,
      learningEnergy: 0.2,
      prerequisites: [SECTIONED],
      references: {},
      revision: `${id}@1`,
      handler: 'long.hand-twist-long-sectioned-cord',
      equivalence: 'cordage:hand-twisted-two-ply-fiber-cord:sectioned-long:1',
    });
    expect(ability?.parameters.properties?.requestedLength).toEqual({
      type: 'number',
      minimum: 0.05,
    });
    expect(
      withIt.abilities.filter((a) => a.equivalence === ability?.equivalence),
    ).toHaveLength(1);
    // The new ceiling is derived from the strand law and stated, not chosen.
    expect(ability?.effects).toContain(
      '(1.8 - 0.04) / 1.155 = 1.524 m (6 sections, 19 rounds)',
    );
    expect(ability?.costs).toContain('7 rounds to 0.60 m, 13 to 1.0 m');
    expect(ability?.costs).toContain('half the aligned ply (up to 0.9 m)');
    const limit = withIt.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(3500);
    const registry = continuousRegistry(withIt),
      pkg = registry.packages.find((p) => p.id === id);
    expect(pkg?.scope).toBe('long-ex16');
    expect(pkg?.dependencies).toEqual([
      'foundation-open@1',
      `${CORD}@1`,
      `${SECTIONED}@1`,
    ]);
    expect(
      registry.packages.filter((p) =>
        Object.keys(p.handlers).includes('long.hand-twist-long-sectioned-cord'),
      ),
    ).toHaveLength(1);
    const text = JSON.stringify({
      abilities: pkg?.abilities,
      events: pkg?.events,
      description: pkg?.description,
    });
    expect(CULTURE_EXCLUDED_WORDS.test(text)).toBe(false);
    expect(ALSO_EXCLUDED.test(text)).toBe(false);
    expect(text).not.toMatch(HIDDEN);
    expect(pkg?.satisfaction).toEqual([]);
    expect(pkg?.visualComponents).toEqual([]);
    expect(
      pkg?.visualComponents.every(
        (c) => typeof CONTINUOUS_VISUALS[c] === 'function',
      ),
    ).toBe(true);
    expect(pkg?.events?.every((e) => e.startsWith(PREFIX))).toBe(true);
    // Study requires the individually mastered sectional method; refusal spends nothing.
    const f = supplied(),
      fresh = v7Clone(f.w);
    actor(fresh).mastered = actor(fresh).mastered.filter(
      (m) => m !== SECTIONED,
    );
    const refused = step(fresh, {
      wren: { interface: 'learn', args: { ability: id } },
    });
    expect(refused.outcomes.wren?.success).toBe(false);
    expect(refused.outcomes.wren?.reason).toMatch(/prerequisites/);
    expect(actor(refused.world).vitals).toEqual(
      actor(step(fresh).world).vitals,
    );
    const early = step(f.w, {
      wren: mode('sample', { materials: [use(f.raw, 0.1)] }),
    });
    expect(early.outcomes.wren?.reason).toMatch(/not mastered/);
    expect(actor(early.world).vitals).toEqual(actor(step(f.w).world).vitals);
    // One paid study round, then mastery; no pleasure, comfort or milestone follows.
    const w = step(f.w, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(spent(f.w, w)).toBeCloseTo(0.2, 6);
    expect(actor(w).mastered).toContain(id);
    expect(actor(w).learning).toBeNull();
    clean(w);
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
      `${PREFIX}sampled`,
    ]);
    expect(reusedEvents(w)).toHaveLength(0);
    const lot = role(w, 'tested-lot')[0];
    expect(events(w, 'sampled')[0]?.data).toMatchObject({
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
    expect(reed(w)).toBe(before);
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
    // Like Wren: sampled once with hand-twist-fiber-cord, which covers this operation too.
    const g = supplied();
    actor(g.w).mastered.push(CORD);
    let x = step(g.w, {
      wren: {
        interface: CORD,
        args: { mode: 'sample', materials: [use(g.raw, 0.1)] },
      },
    }).world;
    x = study(x);
    const started = step(x, { wren: make(g.raw, 0.4, 1) });
    expect(started.outcomes.wren?.success).toBe(true);
    expect(job(started.world)?.initialWork).toBe(13);
  });

  it('make: refuses uncovered, physically impossible, out-of-range, irrelevant, crowded or underpowered requests before any cost', () => {
    const s = supplied();
    unchanged(study(s.w), make(s.raw), /First pass a cord sample/);
    const f = sampled();
    unchanged(f.w, make(f.raw, 0.1), /0.2-1 unit/);
    unchanged(f.w, make(f.raw, 1.1), /0.2-1 unit/);
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
        requestedLength: 1,
        trialForce: 10,
      }),
      /Irrelevant argument/,
    );
    unchanged(f.w, make('reed'), /exact id/);
    unchanged(
      f.w,
      mode('make', { workId: 'manual-1', requestedLength: 1 }),
      /workId/,
    );
    // Above the derived ceiling the ply would need more than one unspliced 1.8 m stem.
    unchanged(
      f.w,
      make(f.raw, 1, 1.5243),
      /1.8 m strands are shorter than the 1.8001 m ply of a 1.5243 m cord and no splices are made; nothing was reserved/,
    );
    unchanged(f.w, make(f.raw, 1, 3), /strands are shorter/);
    // Finished cords like Wren's real 0.60 m cord are not raw fiber and are not lengthened.
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
          madeWith: `${SECTIONED}@1`,
          classes: ['raw'],
          condition: 0.984,
          length: 0.6,
          twisted: 0.6,
          plied: true,
          plies: 2,
          overall: 0.64,
          plyDiameter: plyDiameter(0.2, 0.6),
        },
      },
      'item-fixture-cord',
    );
    unchanged(
      c,
      mode('make', {
        materials: [use('item-fixture-cord', 0.2)],
        requestedLength: 1,
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
        requestedLength: 1,
      }),
      /one fiber material from one source/,
    );
    // A fixture lightens reed so that the request alone rules the plies out, even fully intact.
    const light = v7Clone(f.w),
      r = light.resources.find((x) => x.id === 'reed');
    if (!r) throw new Error('Missing reed resource.');
    r.mass = 0.0005;
    unchanged(light, make(f.raw, 0.2), /thinner than 1 mm/);
    // The work circle grows with the aligned ply: 1.19 m bundles for 1.0 m, 0.73 m for 0.60 m.
    const crowded = v7Clone(f.w);
    actor(crowded, 'kai').position = { x: REEDS.at.x + 1, y: REEDS.at.y };
    unchanged(crowded, make(f.raw), /another person/);
    expect(
      step(crowded, { wren: make(f.raw, 0.4, 0.6) }).outcomes.wren?.success,
    ).toBe(true);
    const tired = v7Clone(f.w);
    actor(tired).vitals.energy = 0.9;
    unchanged(tired, make(f.raw), /Not enough energy/);
    expect(job(f.w)).toBeUndefined();
  });

  it('make: thirteen paid rounds of 1 energy twist 0.4 reed into one continuous owned 1.0 m two-ply cord in four sections, sized by conserved volume', () => {
    const f = sampled();
    const before = reed(f.w),
      load = v7Load(f.w, actor(f.w)),
      e0 = energy(f.w);
    const first = step(f.w, { wren: make(f.raw) });
    expect(first.outcomes.wren?.complete).toBe(false);
    expect(spent(f.w, first.world)).toBeCloseTo(1, 6);
    expect(types(first.world)).toEqual([
      `${PREFIX}started`,
      'process-progress',
      `${PREFIX}progress`,
    ]);
    expect(reusedEvents(first.world)).toHaveLength(0);
    expect(job(first.world)).toMatchObject({
      initialWork: 13,
      sections: 4,
      sectionLength: 0.25,
      workLength: 1.1947,
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
      length: 1,
      overall: 1.04,
      rounds: 13,
      alignedLength: 0.25,
      heldLength: 0,
      pliedLength: 0,
    });
    expect(part(piece).sections).toEqual(
      [0, 0.25, 0.5, 0.75].map((from, i) => ({
        section: i + 1,
        from,
        to: from + 0.25,
        aligned: i === 0,
        twisted: false,
        plied: false,
      })),
    );
    expect(Number(part(piece).plyDiameter)).toBeCloseTo(plyDiameter(0.4, 1), 7);
    // Round 1 measures the real geometry and the strand-bound feasible range of this fiber.
    expect(events(first.world, 'progress')[0]?.data).toMatchObject({
      round: 1,
      stage: 'separate-align',
      section: 1,
      nextStage: 'twist',
      usableTenths: 4,
      brokenTenths: 0,
      sectionCount: 4,
      strandLength: 1.8,
      plyFiberLength: 1.1947,
      feasibleLength: [0.05, 1.5242],
      handled: { incorporatedTenths: 4, scrapTenths: 0 },
      visual: {
        component: 'fiber-cord',
        state: 'aligned',
        progress: 0.07692308,
      },
    });
    expect(v7Load(first.world, actor(first.world))).toBeCloseTo(load, 8);
    expect(reed(first.world)).toBe(before);
    // Each later round pays 1 energy for one step of one section; only plied parts hold themselves,
    // and the strands run on through every regrip without a join.
    const expected: [string, number, string, number, number, number][] = [];
    for (let s = 1; s <= 4; s++) {
      const to = 0.25 * s;
      if (s > 1)
        expected.push([
          'separate-align',
          s,
          'aligned',
          to - 0.25,
          0,
          to - 0.25,
        ]);
      expected.push(['twist', s, 'twisting', to, 0.25, to - 0.25]);
      expected.push([
        'counter-ply',
        s,
        s === 4 ? 'plied' : 'partly-plied',
        to,
        0,
        to,
      ]);
    }
    let w = first.world;
    for (const [stage, section, status, twisted, held, plied] of expected) {
      const r = step(w, { wren: make(f.raw) });
      expect(spent(w, r.world)).toBeCloseTo(1, 6);
      expect(r.outcomes.wren?.complete).toBe(false);
      w = r.world;
      expect(types(w)).toEqual(['process-progress', `${PREFIX}progress`]);
      expect(events(w, 'progress')[0]?.data).toMatchObject({
        stage,
        section,
      });
      expect(part(item(w, piece?.id ?? ''))).toMatchObject({
        role: 'workpiece',
        status,
        twisted,
        heldLength: held,
        pliedLength: plied,
        plied: stage === 'counter-ply' && section === 4,
      });
      expect(role(w, 'cord')).toHaveLength(0);
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
      `${PREFIX}completed`,
    ]);
    const done = events(w, 'completed')[0],
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
      length: 1,
      twisted: 1,
      overall: 1.04,
      looseEnds: 4,
      twist: { ply: 'S', lay: 'Z' },
      stages: 13,
      trials: [],
      madeWith: `${id}@1`,
    });
    expect((part(c).sections as V7Data[]).every((s) => s.plied === true)).toBe(
      true,
    );
    expect(done?.data).toMatchObject({
      outcome: 'complete',
      length: 1,
      overall: 1.04,
      sectionCount: 4,
      visual: { component: 'fiber-cord', state: 'cord', untested: true },
    });
    expect(Number(done?.data.plyDiameter)).toBeCloseTo(0.0033, 6);
    expect(job(w)).toMatchObject({
      status: 'completed',
      completedWork: 13,
      paidEnergy: 13,
    });
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(reed(w)).toBe(before);
    expect(v7Load(w, actor(w))).toBeCloseTo(load, 8);
    let waited = f.w;
    for (let i = 0; i < 13; i++) waited = step(waited).world;
    expect(e0 - energy(w) - (e0 - energy(waited))).toBeCloseTo(13, 6);
    // Its own work record and state key; the sectional operation's records are untouched.
    expect(jobs(w, SECTIONED)).toHaveLength(0);
    expect(actor(w).extensionState[`long:work:${id}`]).toMatchObject({
      status: 'completed',
    });
    expect(actor(w).extensionState[`long:work:${SECTIONED}`]).toBeUndefined();
    expect(
      actor(w).memory.knowledge?.[`${id}:make:reed:intact:complete:4-section`]
        ?.verified,
    ).toBe(true);
    expect(reusedEvents(w)).toHaveLength(0);
    clean(w);
  });

  it('make: the derived ceiling is reachable: 1.5242 m in six sections and nineteen rounds needs the full 1.8 m stem and the widest work circle', () => {
    const f = sampled();
    const r = step(f.w, { wren: make(f.raw, 0.2, 1.5242) });
    expect(r.outcomes.wren?.success).toBe(true);
    expect(Math.floor(REACH * 1e4) / 1e4).toBe(1.5242);
    expect(job(r.world)).toMatchObject({
      initialWork: 19,
      sections: 6,
      workLength: 1.8,
    });
    expect(events(r.world, 'progress')[0]?.data).toMatchObject({
      plyFiberLength: 1.8,
      feasibleLength: [0.05, 1.5242],
    });
    const piece = item(r.world, job(r.world)?.target ?? '');
    expect(Number(part(piece).plyDiameter)).toBeCloseTo(
      plyDiameter(0.2, 1.5242),
      7,
    );
    expect(Number(part(piece).plyDiameter)).toBeGreaterThan(0.001);
    // Someone 1.3 m away is inside this circle (radius + 0.9 m + their radius) but not a 1.0 m cord's.
    const crowded = v7Clone(f.w);
    actor(crowded, 'kai').position = { x: REEDS.at.x + 1.3, y: REEDS.at.y };
    unchanged(crowded, make(f.raw, 0.2, 1.5242), /another person/);
    expect(
      step(crowded, { wren: make(f.raw, 0.2, 1) }).outcomes.wren?.success,
    ).toBe(true);
  });

  it('make: up to 0.60 m it gives the same rounds and cord as hand-twist-sectioned-cord, which keeps its own ceiling', () => {
    const f = sampled();
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
      'sections',
      'stages',
      'rounds',
    ];
    const pick = (s?: V7Stack) =>
      Object.fromEntries(keys.map((k) => [k, part(s)[k]]));
    const cases: [number, number, number][] = [
      [0.4, 0.6, 7],
      [0.5, 0.3, 4],
    ];
    for (const [quantity, length, n] of cases) {
      const here = made(quantity, length, f);
      expect(job(here.w)).toMatchObject({ completedWork: n, paidEnergy: n });
      const w = rounds(f.w, n, {
        interface: SECTIONED,
        args: {
          mode: 'make',
          materials: [use(f.raw, quantity)],
          requestedLength: length,
        },
      });
      const other = role(w, 'cord')[0];
      expect(part(other).madeWith).toBe(`${SECTIONED}@1`);
      expect(pick(item(here.w, here.cord))).toEqual(pick(other));
    }
    // The sectional operation itself still refuses above 0.60 m and runs its own work records.
    unchanged(
      f.w,
      {
        interface: SECTIONED,
        args: {
          mode: 'make',
          materials: [use(f.raw, 0.4)],
          requestedLength: 0.61,
        },
      },
      /requestedLength/,
    );
    const open = step(f.w, { wren: make(f.raw, 0.4, 1) }).world;
    const old = step(open, {
      wren: {
        interface: SECTIONED,
        args: { mode: 'cancel' },
      },
    });
    expect(old.outcomes.wren?.reason).toMatch(
      /No unfinished sectioned cord work of yours to cancel/,
    );
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
    expect(events(x, 'sampled')[0]?.data.passed).toBe(true);
    actor(x).vitals.energy = 40;
    const before = reed(x);
    x = step(x, { wren: make('item-fixture-worn', 0.4) }).world;
    const piece = item(x, job(x)?.target ?? ''),
      scrap = role(x, 'scrap');
    expect(events(x, 'progress')[0]?.data).toMatchObject({
      totalTenths: 4,
      brokenTenths: 1,
      usableTenths: 3,
      handled: { incorporatedTenths: 3, scrapTenths: 1 },
    });
    expect(piece?.quantity).toBe(0.3);
    expect(scrap.map((s) => s.quantity)).toEqual([0.1]);
    expect(part(scrap[0])).toMatchObject({ role: 'scrap', condition: 0 });
    expect(scrap[0]?.reservedFor).toBeUndefined();
    expect(Number(part(piece).plyDiameter)).toBeCloseTo(plyDiameter(0.3, 1), 7);
    expect(reed(x)).toBe(before);
    // Too much fiber for a short span: plies would exceed 12 mm.
    const y = v7Clone(f.w),
      start = reed(y),
      r = step(y, { wren: make(f.raw, 1, 0.05) });
    expect(r.outcomes.wren?.complete).toBe(true);
    expect(spent(y, r.world)).toBeCloseTo(1, 6);
    expect(types(r.world)).toEqual([
      `${PREFIX}started`,
      'process-progress',
      'trial-result',
      'information-confirmed',
      `${PREFIX}shortfall`,
    ]);
    const e = events(r.world, 'shortfall')[0];
    expect(e?.data.shortfall).toMatch(/thicker than 12 mm/);
    expect(Number(e?.data.plyDiameter)).toBeGreaterThan(0.012);
    // The measured range has no 0.60 m cap: its top is the strand-bound 1.5242 m.
    const range = e?.data.feasibleLength as number[];
    expect(range[0]).toBeGreaterThan(0.15);
    expect(range[1]).toBe(1.5242);
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
    // Within the measured range the same fiber is made, as one 1.2 m cord.
    actor(r.world).vitals.energy = 40;
    const ok = step(r.world, {
      wren: make(returned[0]?.id ?? '', 1, 1.2),
    });
    expect(events(ok.world, 'progress')).toHaveLength(1);
    expect(job(ok.world)).toMatchObject({ initialWork: 13, sections: 4 });
  });

  it('pauses uncharged when not worked, resumes only by workId without re-measuring, and cancel or a repeated cancel releases unworked fiber exactly once', () => {
    const f = sampled();
    const before = reed(f.w);
    let w = rounds(f.w, 4, make(f.raw));
    const workId = job(w)?.id ?? '',
      piece = job(w)?.target ?? '',
      measured = v7Clone(part(item(w, piece)));
    // A round spent otherwise pauses the work; nothing is paid and the plied section holds itself.
    w = step(w).world;
    expect(job(w)).toMatchObject({ status: 'paused', paidEnergy: 4 });
    expect(events(w, 'paused')[0]?.data).toMatchObject({
      workId,
      remaining: 9,
      nextStage: 'twist',
      nextSection: 2,
    });
    unchanged(w, make(f.raw), /Unfinished sectioned cord work/);
    unchanged(
      w,
      mode('make', { workId, requestedLength: 1 }),
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
    expect(events(low.world, 'paused')[0]?.data).toMatchObject({
      requiredEnergy: 1,
    });
    expect(spent(tired, low.world)).toBeCloseTo(0, 6);
    expect(job(low.world)).toMatchObject({ completedWork: 4, paidEnergy: 4 });
    const back = step(w, { wren: mode('make', { workId }) });
    expect(events(back.world, 'resumed')).toHaveLength(1);
    expect(events(back.world, 'progress')[0]?.data).toMatchObject({
      stage: 'twist',
      section: 2,
      round: 5,
    });
    expect(spent(w, back.world)).toBeCloseTo(1, 6);
    expect(job(back.world)).toMatchObject({ completedWork: 5, paidEnergy: 5 });
    // Resuming re-measures nothing: the measured plies, sections and fiber are those of round 1.
    const resumed = part(item(back.world, piece));
    expect(resumed.plyDiameter).toBe(measured.plyDiameter);
    expect(resumed.length).toBe(measured.length);
    expect(item(back.world, piece)?.quantity).toBe(0.4);
    expect(role(back.world, 'scrap')).toHaveLength(0);
    // Cancel is energy-free; the fiber stays an owned unfinished workpiece in its actual state.
    const r = step(back.world, { wren: mode('cancel') });
    expect(r.outcomes.wren?.success).toBe(true);
    expect(spent(back.world, r.world)).toBeCloseTo(0, 6);
    const left = role(r.world, 'workpiece')[0];
    expect(left).toMatchObject({ owner: 'wren', quantity: 0.4 });
    expect(left?.reservedFor).toBeUndefined();
    expect(part(left)).toMatchObject({
      status: 'unfinished',
      workId: null,
      twisted: 0.5,
      pliedLength: 0.25,
      alignedLength: 0.5,
      plied: false,
    });
    expect(job(r.world)).toMatchObject({ status: 'stopped', paidEnergy: 5 });
    expect(events(r.world, 'cancelled')[0]?.target).toBe(left?.id);
    expect(reed(r.world)).toBe(before);
    // A second cancel or resume finds no open work: nothing is released or charged again.
    unchanged(r.world, mode('cancel'), /No unfinished sectioned cord work/);
    unchanged(
      r.world,
      mode('make', { workId }),
      /No unfinished sectioned cord work of yours has this workId/,
    );
    expect(role(r.world, 'cord')).toHaveLength(0);
    // The unfinished workpiece is fiber that may be supplied whole to a new attempt, paid again.
    actor(r.world).vitals.energy = 40;
    unchanged(r.world, make(left?.id ?? '', 0.3), /whole/);
    const again = step(r.world, { wren: make(left?.id ?? '', 0.4) });
    expect(again.outcomes.wren?.success).toBe(true);
    expect(spent(r.world, again.world)).toBeCloseTo(1, 6);
    expect(job(again.world)?.completedWork).toBe(1);
  });

  it('regripping needs the counter-plied section to hold its form: an unsound one fails there and nothing is refunded', () => {
    const f = sampled();
    const w = rounds(f.w, 6, make(f.raw));
    const piece = job(w)?.target ?? '';
    // A fixture lowers the workpiece below the sound condition 0.5 after the second section.
    part(item(w, piece)).condition = 0.45;
    const r = step(w, { wren: make(f.raw) });
    expect(r.outcomes.wren?.success).toBe(true);
    expect(spent(w, r.world)).toBeCloseTo(1, 6);
    const e = events(r.world, 'failed')[0];
    expect(e?.description).toMatch(/did not keep its form/);
    expect(job(r.world)).toMatchObject({ status: 'stopped', paidEnergy: 7 });
    expect(item(r.world, piece)).toMatchObject({
      owner: 'wren',
      quantity: 0.4,
    });
    expect(item(r.world, piece)?.reservedFor).toBeUndefined();
    expect(part(item(r.world, piece))).toMatchObject({
      role: 'workpiece',
      status: 'failed',
      pliedLength: 0.5,
    });
    expect(role(r.world, 'cord')).toHaveLength(0);
    expect(reed(r.world)).toBe(reed(w));
  });

  it('inspect reports measured sections, held and plied lengths for 0.2 energy and leaves strength unknown', () => {
    const f = sampled();
    const w = rounds(f.w, 5, make(f.raw)),
      workId = job(w)?.id ?? '';
    const r = step(w, { wren: mode('inspect', { workId }) });
    expect(r.outcomes.wren?.success).toBe(true);
    expect(spent(w, r.world)).toBeCloseTo(0.2, 6);
    const e = events(r.world, 'inspected')[0];
    expect(e?.data).toMatchObject({
      workId,
      stage: 'twist',
      section: 2,
      remaining: 8,
      sectionCount: 4,
      requestedLength: 1,
      role: 'workpiece',
      state: 'twisting',
      heldLength: 0.25,
      pliedLength: 0.25,
      breakingForce: null,
      reserved: true,
    });
    const c = made();
    const look = step(c.w, { wren: mode('inspect', { targetId: c.cord }) });
    expect(spent(c.w, look.world)).toBeCloseTo(0.2, 6);
    expect(events(look.world, 'inspected')[0]?.data).toMatchObject({
      item: c.cord,
      role: 'cord',
      length: 1,
      overallLength: 1.04,
      plies: 2,
      looseEnds: 4,
      untested: true,
      breakingForce: null,
    });
    unchanged(
      c.w,
      mode('inspect', { targetId: c.cord, workId: 'manual-1' }),
      /exactly one/,
    );
    unchanged(c.w, mode('inspect', { targetId: c.raw }), /your own item/);
  });

  it('trial: the unchanged fiber-cord@1 two-hand trial for 0.5 energy, identical to hand-twist-fiber-cord on the same long cord', () => {
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
    const held = events(r.world, 'trial')[0];
    expect(held?.data).toMatchObject({
      outcome: 'held',
      requestedForce: 10,
      achievedForce: 10,
      heldSeconds: 60,
      strandsBroken: 0,
      lengthBefore: 1,
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
    expect(old.events.find((e) => e.type === 'fiber-cord-trial')?.data).toEqual(
      held?.data,
    );
    // A thin 1.0 m cord breaks into two owned fragments of conserved fiber.
    const thin = made(0.2, 1),
      before = reed(thin.w),
      b = step(thin.w, {
        wren: mode('trial', {
          targetId: thin.cord,
          trialForce: 100,
          trialDuration: 60,
        }),
      }).world;
    expect(events(b, 'trial')[0]?.data.outcome).toBe('broke');
    const pieces = role(b, 'fragment');
    expect(pieces.map((s) => s.quantity)).toEqual([0.1, 0.1]);
    expect(events(b, 'broken')[0]?.data.fragments).toEqual(
      pieces.map((s) => s.id),
    );
    expect(part(pieces[0])).toMatchObject({ length: 0.5, overall: 0.52 });
    expect(reed(b)).toBe(before);
    unchanged(
      c.w,
      mode('trial', { targetId: c.cord, trialForce: 5 }),
      /trialDuration/,
    );
  });

  it('its cords are ordinary cords: knot, join, binding, lashing and frapping take a 1.0 m cord as it is and measure their own need', () => {
    let f = sampled();
    const a = made(0.2, 1, f);
    f = { w: a.w, raw: a.raw };
    const b = made(0.2, 1, f);
    let w = b.w;
    expect(part(item(w, a.cord))).toMatchObject({ length: 1, overall: 1.04 });
    // Study of the consumers is covered by their own tests; mastery is set directly here.
    actor(w).mastered.push(KNOT, JOIN, BIND, LASH, FRAP);
    const knot = step(w, {
      wren: {
        interface: KNOT,
        args: { mode: 'attempt', targetId: a.cord, knot: 'overhand' },
      },
    });
    expect(knot.outcomes.wren?.success).toBe(true);
    expect(
      knot.world.events.filter((e) => e.type === 'cord-knot-started'),
    ).toHaveLength(1);
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
    expect(
      join.world.events.filter((e) => e.type === 'cord-join-started'),
    ).toHaveLength(1);
    // Two whole branch units gathered for real and crossed at the clear site.
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
    const bind = step(w, {
      wren: {
        interface: BIND,
        args: {
          mode: 'attempt',
          pieceIds: lots,
          cordId: a.cord,
          crossingAngle: 90,
        },
      },
    });
    expect(bind.outcomes.wren?.success).toBe(true);
    expect(
      bind.world.events.filter((e) => e.type === 'crossing-binding-started'),
    ).toHaveLength(1);
    const lash = step(w, {
      wren: {
        interface: LASH,
        args: {
          mode: 'attempt',
          pieceIds: lots,
          cordId: a.cord,
          crossingAngle: 90,
          wrapCount: 2,
        },
      },
    });
    expect(lash.outcomes.wren?.success).toBe(true);
    expect(
      lash.world.events.filter((e) => e.type === 'crossing-lashing-started'),
    ).toHaveLength(1);
    // Frapping assesses this thinner, longer cord on its own measured route; no fit is assumed.
    const frap = step(w, {
      wren: {
        interface: FRAP,
        args: {
          mode: 'assess',
          pieceIds: lots,
          cordId: a.cord,
          crossingAngle: 90,
          wrapCount: 2,
          frapCount: 1,
        },
      },
    });
    expect(frap.outcomes.wren?.success).toBe(true);
    const assessed = frap.world.events.find(
      (e) => e.type === 'crossing-frapping-assessed',
    );
    const measured = (assessed?.data.measured ?? {}) as V7Data;
    expect(typeof measured.fits).toBe('boolean');
    expect(Number(measured.width)).toBeCloseTo(2 * plyDiameter(0.2, 1), 4);
    expect(frap.world.stacks).toEqual(step(w).world.stacks);
    expect(reed(frap.world)).toBe(reed(w));
  });

  it('keeps the work personal: another person cannot resume, inspect, trial or cancel it', () => {
    const c = made();
    let w = step(c.w, { wren: make(c.raw) }).world;
    const workId = job(w)?.id ?? '';
    w = v7Clone(w);
    actor(w, 'kai').mastered.push(id);
    actor(w, 'kai').position = { x: REEDS.at.x - 3, y: REEDS.at.y };
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

  it('stops at death once, leaving reserved fiber and the unfinished workpiece on the ground', () => {
    const f = sampled();
    const w = rounds(f.w, 7, make(f.raw));
    const piece = job(w)?.target ?? '';
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    const dead = v7Clone(w);
    pkg?.onDeath?.(dead, actor(dead));
    expect(job(dead)?.status).toBe('stopped');
    expect(events(dead, 'failed')).toHaveLength(1);
    const at = actor(dead).position,
      s = item(dead, piece);
    expect(s).toMatchObject({ owner: null, position: at, quantity: 0.4 });
    expect(s?.reservedFor).toBeUndefined();
    expect(part(s)).toMatchObject({
      status: 'unfinished',
      workId: null,
      pliedLength: 0.5,
    });
    expect(reed(dead)).toBe(reed(w));
    // A repeated death notice finds no open work: nothing is released twice.
    const twice = v7Clone(dead);
    pkg?.onDeath?.(twice, actor(twice));
    expect(twice.stacks).toEqual(dead.stacks);
    expect(events(twice, 'failed')).toHaveLength(1);
    // The sectional operation's own death handling leaves this work alone.
    const other = v7Clone(w);
    continuousRegistry(w)
      .packages.find((p) => p.id === SECTIONED)
      ?.onDeath?.(other, actor(other));
    expect(job(other)).toEqual(job(w));
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
});
