import { describe, expect, it } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
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

const id = 'bark-separation';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** Next to the start-0-branches pile (stock 9). */
const PILE = { x: 10.5, y: 9.1 };

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
const actor = (w: V7World, name = 'ivo'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === type);
const job = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as Record<string, unknown>)
    .at(-1) as
    | {
        id: string;
        status: string;
        escrow: string[];
        outputs: string[];
        remainingWork: number;
      }
    | undefined;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const stack = (w: V7World, sid: string): V7Stack | undefined =>
  w.stacks.find((s) => s.id === sid);
const record = (s?: V7Stack) =>
  s?.processing?.barkSeparation as Record<string, number> | undefined;
const unitMass = (w: V7World, s: V7Stack) =>
  s.physical?.unitMass ?? w.resources.find((r) => r.id === s.resource)?.mass;
/** Branch and bark mass held as stacks anywhere, plus every recorded waste. */
function material(w: V7World) {
  const held = w.stacks
    .filter((s) => ['branch', 'bark'].includes(s.resource))
    .reduce((n, s) => n + s.quantity * (unitMass(w, s) ?? 0), 0);
  // A trial tears the tested bark entirely into waste; recovery records its own offcuts.
  const tested = w.stacks.reduce(
    (n, s) => n + s.quantity * (record(s)?.testedPerUnit ?? 0),
    0,
  );
  const offcuts = Object.entries(w.state)
    .filter(([k]) => k.startsWith('collective:work:'))
    .map(([, v]) => v as Record<string, unknown>)
    .filter((j) => j.ability === id)
    .reduce((n, j) => n + Number(j.wasteMicro) / 1e6, 0);
  return held + tested + offcuts;
}
const act = (mode: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});

function genesis(...extra: string[]) {
  let w = initialLongWorld('long-ex15', 'long-culture');
  for (const key of [`${id}@1`, ...extra])
    w = v7Install(w, continuousRegistry(w), key);
  return v7Clone(w);
}
/** Ivo gathers three real branches from start-0-branches and studies for two rounds. */
function setup(study = true, extra: string[] = []) {
  let w = genesis(...extra);
  actor(w).position = { ...PILE };
  const r = step(w, {
    ivo: {
      interface: 'gather',
      args: { target: 'start-0-branches', quantity: 3 },
    },
  });
  expect(r.outcomes.ivo?.success).toBe(true);
  w = r.world;
  const branch = w.stacks.find(
    (s) => s.owner === 'ivo' && s.resource === 'branch',
  );
  if (!branch) throw new Error('Missing actually gathered fixture branch.');
  if (study) {
    w = step(w, { ivo: { interface: 'learn', args: { ability: id } } }).world;
    for (let i = 0; i < 3 && !actor(w).mastered.includes(id); i++)
      w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  }
  actor(w).vitals.energy = 40;
  return { w, branch: branch.id };
}
/** A completed hand trial on 0.1 of the gathered lot. */
function tried() {
  const f = setup();
  const r = step(f.w, { ivo: act('separation-trial', { target: f.branch }) });
  expect(r.outcomes.ivo?.success).toBe(true);
  const portion = str(
    events(r.world, 'bark-separation-trial')[0]?.data.portion,
  );
  return { ...f, w: r.world, portion };
}
function refused(w: V7World, action: V7Action, pattern: RegExp) {
  const r = step(w, { ivo: action });
  expect(r.outcomes.ivo?.success).toBe(false);
  expect(r.outcomes.ivo?.reason).toMatch(pattern);
  const idle = step(w).world;
  expect(actor(r.world).vitals.energy).toBe(actor(idle).vitals.energy);
  expect(r.world.stacks).toEqual(idle.stacks);
  expect(job(r.world)).toEqual(job(idle));
}

describe('hand bark separation in ex15', () => {
  it('is scoped to ex15 and needs two rounds of personal study', () => {
    const ex14 = initialLongWorld('long-ex14', 'long-fixes');
    expect(() =>
      v7Install(ex14, continuousRegistry(ex14), `${id}@1`),
    ).toThrow();
    const f = setup(false);
    expect(f.w.abilities.find((a) => a.id === id)?.learning).toBe(2);
    const pkg = continuousRegistry(f.w).packages.find((p) => p.id === id);
    expect(pkg?.visualComponents).toEqual([]);
    expect(
      JSON.stringify({ abilities: pkg?.abilities, events: pkg?.events }),
    ).not.toMatch(CULTURE_EXCLUDED_WORDS);
    refused(f.w, act('inspect', { target: f.branch }), /not mastered/);
    let w = step(f.w, {
      ivo: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(actor(w).mastered).not.toContain(id);
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
    // Study grants no material.
    expect(w.stacks.filter((s) => s.owner === 'ivo')).toEqual(
      f.w.stacks.filter((s) => s.owner === 'ivo'),
    );
  });

  it('inspects only visible surface facts for the single probe charge', () => {
    const f = setup();
    const e0 = actor(f.w).vitals.energy;
    const r = step(f.w, { ivo: act('inspect', { target: f.branch }) });
    expect(r.outcomes.ivo?.success).toBe(true);
    expect(actor(r.world).vitals.energy).toBe(v7Round(e0 - 0.2));
    const seen = events(r.world, 'bark-separation-inspected')[0]?.data;
    expect(seen).toMatchObject({
      status: 'separability-unresolved',
      surface: 'intact-bark',
      quantity: 3,
      origin: 'start-0-branches',
      pieceLength: 2,
      separatedArea: 0,
      tornTestArea: 0,
      roofing: 'not established by inspection',
    });
    expect(Number(seen?.visibleBarkArea)).toBeCloseTo(0.55, 6);
    expect(str(seen?.attachedMass)).toMatch(/unknown/);
    expect(str(seen?.separability)).toMatch(/unknown/);
    // Nothing moved or changed; the personal records are unverified.
    expect(r.world.stacks).toEqual(step(f.w).world.stacks);
    expect(events(r.world, 'information-confirmed')).toHaveLength(0);
    expect(
      actor(r.world).memory.knowledge?.[`${f.branch}:bark-surface`]?.verified,
    ).toBe(false);
    // The natural pile is assessed as visible stock that is not owned work material.
    const pile = step(f.w, {
      ivo: act('inspect', { target: 'start-0-branches' }),
    });
    const heap = events(pile.world, 'bark-separation-inspected')[0]?.data;
    expect(heap).toMatchObject({ status: 'separability-unresolved', stock: 6 });
    expect(str(heap?.access)).toMatch(/gather/);
    // Out of reach: nothing is spent.
    const far = v7Clone(f.w);
    actor(far).position = { x: 12, y: 8.4 };
    refused(far, act('inspect', { target: 'start-0-branches' }), /reach/);
  });

  it('reports other materials as unresolved and refuses trial and recovery at no cost', () => {
    const f = setup();
    const branch = f.branch;
    let w = f.w;
    actor(w).position = { x: 16.7, y: 11.7 };
    w = step(w, {
      ivo: {
        interface: 'gather',
        args: { target: 'start-1-berries', quantity: 1 },
      },
    }).world;
    actor(w).vitals.energy = 40;
    const berry = w.stacks.find(
      (s) => s.owner === 'ivo' && s.resource === 'berry',
    );
    const seen = step(w, { ivo: act('inspect', { target: berry?.id }) });
    expect(
      events(seen.world, 'bark-separation-inspected')[0]?.data.status,
    ).toBe('composition-unresolved');
    refused(w, act('separation-trial', { target: berry?.id }), /unresolved/);
    refused(w, act('recover', { target: branch }), /trial/);
    refused(
      w,
      act('separation-trial', { target: branch, toolId: berry?.id }),
      /Tool-assisted/,
    );
    refused(
      w,
      act('separation-trial', { target: branch, quantity: 0.5 }),
      /exactly 0.1/,
    );
    actor(w).position = { ...PILE };
    refused(
      w,
      act('separation-trial', { target: 'start-0-branches' }),
      /own carried/,
    );
  });

  it('runs a 0.5-energy hand trial on a 0.1 portion and conserves its mass', () => {
    const f = setup();
    const total = material(f.w);
    const e0 = actor(f.w).vitals.energy;
    const r = step(f.w, { ivo: act('separation-trial', { target: f.branch }) });
    const w = r.world;
    expect(r.outcomes.ivo?.success).toBe(true);
    expect(actor(w).vitals.energy).toBe(v7Round(e0 - 0.5));
    const t = events(w, 'bark-separation-trial')[0]?.data;
    expect(t).toMatchObject({
      edge: 'accessible at the broken end',
      handSeparation: 'separates along the grain at safe hand force',
      arealMass: 0.6,
      barkShareOfMass: 0.1,
      ledger: {
        input: 0.11,
        residualWood: 0.099,
        remainingAttached: 0,
        recovered: 0,
        waste: 0.011,
      },
    });
    // Only the selected 0.1 is affected; the rest of the lot is untouched.
    expect(stack(w, f.branch)?.quantity).toBe(2.9);
    expect(stack(w, f.branch)?.processing).toBeUndefined();
    const portion = stack(w, str(t?.portion));
    expect(portion).toMatchObject({
      resource: 'branch',
      quantity: 0.1,
      owner: 'ivo',
      origin: 'start-0-branches',
      harvestedAt: 1,
    });
    expect(portion?.reservedFor).toBeUndefined();
    expect(portion?.physical?.unitMass).toBe(0.99);
    expect(record(portion)).toMatchObject({
      attachedPerUnit: 0,
      testedPerUnit: 0.11,
      woodPerUnit: 0.99,
    });
    expect(material(w)).toBeCloseTo(total, 8);
    expect(
      w.stacks.some((s) => s.owner === 'ivo' && s.resource === 'bark'),
    ).toBe(false);
    expect(events(w, 'information-confirmed')).toHaveLength(0);
    // The tested portion has no attached bark left, and inspection now shows it.
    refused(w, act('separation-trial', { target: portion?.id }), /No attached/);
    const seen = step(w, { ivo: act('inspect', { target: portion?.id }) });
    expect(
      events(seen.world, 'bark-separation-inspected')[0]?.data,
    ).toMatchObject({ status: 'separable-verified', surface: 'bark-removed' });
  });

  it('recovers ordinary bark in paid increments of at most 0.1 m2 and conserves the input', () => {
    const f = tried();
    let w = f.w;
    const total = material(w);
    const e0 = actor(w).vitals.energy;
    const recover = act('recover', { target: f.branch });
    let r = step(w, { ivo: recover });
    expect(r.outcomes.ivo?.complete).toBe(false);
    expect(events(r.world, 'bark-separation-started')).toHaveLength(1);
    const reserved = r.world.stacks.find(
      (s) => s.reservedFor === job(r.world)?.id,
    );
    expect(reserved).toMatchObject({ owner: 'ivo', quantity: 2.9 });
    expect(stack(r.world, f.branch)).toBeUndefined();
    w = r.world;
    // Events are per round: collect each round's progress.
    const progress = [...events(w, 'bark-separation-progress')];
    for (let i = 0; i < 5; i++) {
      r = step(w, { ivo: recover });
      w = r.world;
      progress.push(...events(w, 'bark-separation-progress'));
    }
    expect(r.outcomes.ivo?.complete).toBe(true);
    expect(actor(w).vitals.energy).toBe(v7Round(e0 - 6));
    expect(progress).toHaveLength(6);
    const pieces = progress.map((e) => e.data.piece as Record<string, number>);
    expect(pieces.every((p) => (p.area ?? 1) <= 0.1 + 1e-9)).toBe(true);
    expect(pieces.map((p) => p.recoveredUnits)).toEqual([
      0.2, 0.2, 0.2, 0.2, 0.2, 0,
    ]);
    const done = events(w, 'bark-separation-completed')[0]?.data;
    expect(done?.ledger).toMatchObject({
      input: 3.19,
      residualWood: 2.871,
      remainingAttached: 0,
      recovered: 0.3,
      recoveredUnits: 1,
      waste: 0.019,
    });
    const product = w.stacks.filter(
      (s) => s.owner === 'ivo' && s.resource === 'bark',
    );
    expect(product).toHaveLength(1);
    // The product is an ordinary carried bark stack with its true provenance.
    expect(product[0]).toEqual({
      id: product[0]?.id,
      resource: 'bark',
      quantity: 1,
      quantityTenths: 10,
      owner: 'ivo',
      position: product[0]?.position,
      origin: 'start-0-branches',
      harvestedAt: 1,
    });
    const residual = stack(w, str(done?.residual));
    expect(residual?.reservedFor).toBeUndefined();
    expect(residual).toMatchObject({ resource: 'branch', quantity: 2.9 });
    expect(residual?.physical?.unitMass).toBe(0.99);
    expect(record(residual)?.attachedPerUnit).toBe(0);
    expect(material(w)).toBeCloseTo(total, 8);
    expect(job(w)?.status).toBe('completed');
    // No milestone or understanding reward from separating bark.
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(events(w, 'information-confirmed')).toHaveLength(0);
    // Peeled material cannot be peeled again.
    refused(w, act('recover', { target: residual?.id }), /No attached/);
  });

  it('pauses when not worked or without energy, resumes only the remainder and cancels without refund', () => {
    const f = tried();
    let w = step(f.w, {
      ivo: act('recover', { target: f.branch, quantity: 2 }),
    }).world;
    expect(job(w)?.remainingWork).toBe(3);
    const e1 = actor(w).vitals.energy;
    w = step(w).world;
    expect(events(w, 'bark-separation-paused')).toHaveLength(1);
    expect(job(w)?.status).toBe('paused');
    expect(actor(w).vitals.energy).toBe(e1);
    // Too little energy: paused again before any payment.
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.5;
    const t = step(tired, { ivo: act('resume') });
    expect(actor(t.world).vitals.energy).toBe(0.5);
    expect(job(t.world)?.remainingWork).toBe(3);
    expect(events(t.world, 'bark-separation-paused')).toHaveLength(1);
    expect(events(t.world, 'bark-separation-progress')).toHaveLength(0);
    // Resume pays exactly one more increment.
    const total = material(w);
    w = step(w, { ivo: act('resume') }).world;
    expect(events(w, 'bark-separation-resumed')).toHaveLength(1);
    expect(actor(w).vitals.energy).toBe(v7Round(e1 - 1));
    expect(job(w)?.remainingWork).toBe(2);
    // Another person cannot continue or cancel this work.
    const other = step(w, { lin: act('cancel') });
    expect(other.outcomes.lin?.success).toBe(false);
    // Cancel: one round, no energy; completed bark and the partly separated remainder stay.
    const e2 = actor(w).vitals.energy;
    const c = step(w, { ivo: act('cancel') });
    w = c.world;
    expect(c.outcomes.ivo?.success).toBe(true);
    expect(actor(w).vitals.energy).toBe(e2);
    expect(events(w, 'bark-separation-cancelled')).toHaveLength(1);
    expect(job(w)?.status).toBe('stopped');
    const rest = stack(w, String(job(w)?.escrow[0]));
    expect(rest?.reservedFor).toBeUndefined();
    expect(rest).toMatchObject({ owner: 'ivo', quantity: 2 });
    expect(record(rest)?.attachedPerUnit).toBeCloseTo(0.05, 8);
    expect(record(rest)?.separatedPerUnit).toBeCloseTo(0.06, 8);
    const bark = w.stacks.find(
      (s) => s.owner === 'ivo' && s.resource === 'bark',
    );
    expect(bark?.quantity).toBe(0.4);
    expect(material(w)).toBeCloseTo(total, 8);
    expect(step(w, { ivo: act('resume') }).outcomes.ivo?.success).toBe(false);
    // The partly separated remainder can be recovered later without a new trial.
    const again = step(w, { ivo: act('recover', { target: rest?.id }) });
    expect(again.outcomes.ivo?.success).toBe(true);
    expect(job(again.world)?.remainingWork).toBe(1);
  });

  it('stops at death and leaves the reserved remainder on the ground once', () => {
    const f = tried();
    const w = step(f.w, {
      ivo: act('recover', { target: f.branch, quantity: 2 }),
    }).world;
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    const dead = v7Clone(w);
    pkg?.onDeath?.(dead, actor(dead));
    expect(job(dead)?.status).toBe('stopped');
    expect(events(dead, 'bark-separation-stopped')).toHaveLength(1);
    const dropped = stack(dead, String(job(dead)?.escrow[0]));
    expect(dropped).toMatchObject({ owner: null, quantity: 2 });
    expect(dropped?.reservedFor).toBeUndefined();
    expect(material(dead)).toBeCloseTo(material(w), 8);
  });

  it('delivers whole bark units the existing shelter accepts, while peeled branches stay treated', () => {
    const f = tried();
    let w = f.w;
    const recover = act('recover', { target: f.branch });
    for (let i = 0; i < 6; i++) w = step(w, { ivo: recover }).world;
    const recovered = w.stacks.find(
      (s) => s.owner === 'ivo' && s.resource === 'bark',
    );
    expect(recovered?.quantity).toBe(1);
    const residual = str(
      events(w, 'bark-separation-completed')[0]?.data.residual,
    );
    w = v7Clone(v7Install(w, continuousRegistry(w), 'simple-shelter@1'));
    for (const [target, quantity, x, y] of [
      ['forest-branch-0', 9, 17.2, 12.6],
      ['start-2-branches', 4, 16.5, 19.7],
      ['forest-vine-1', 4, 8.2, 12.6],
      ['forest-bark-2', 5, 12.2, 20.6],
    ] as const) {
      actor(w).position = { x, y };
      actor(w).vitals.energy = 40;
      const r = step(w, {
        ivo: { interface: 'gather', args: { target, quantity } },
      });
      expect(r.outcomes.ivo?.success).toBe(true);
      w = r.world;
    }
    w = step(w, {
      ivo: { interface: 'learn', args: { ability: 'simple-shelter' } },
    }).world;
    for (let i = 0; i < 4; i++) w = step(w).world;
    expect(actor(w).mastered).toContain('simple-shelter');
    actor(w).position = { x: 19.5, y: 13.6 };
    actor(w).vitals.energy = 40;
    const owned = w.stacks.filter(
      (s) =>
        s.owner === 'ivo' &&
        ['branch', 'vine', 'bark'].includes(s.resource) &&
        !s.processing,
    );
    const materials = owned.map((s) => ({
      itemId: s.id,
      quantity: s.quantity,
    }));
    expect(materials).toContainEqual({ itemId: recovered?.id, quantity: 1 });
    const start = (list: typeof materials): V7Action => ({
      interface: 'simple-shelter',
      args: { mode: 'start', x: 19.5, y: 15, orientation: 0, materials: list },
    });
    const accepted = step(w, { ivo: start(materials) });
    expect(accepted.outcomes.ivo?.success).toBe(true);
    expect(events(accepted.world, 'simple-shelter-started')).toHaveLength(1);
    // A peeled branch in place of one untreated branch is refused as treated.
    const untreated = str(
      owned.find((s) => s.resource === 'branch' && s.quantity === 9)?.id,
    );
    const swapped = [
      ...materials.filter((m) => m.itemId !== untreated),
      { itemId: untreated, quantity: 8 },
      { itemId: residual, quantity: 1 },
    ];
    const peeled = step(w, { ivo: start(swapped) });
    expect(peeled.outcomes.ivo?.success).toBe(false);
    expect(peeled.outcomes.ivo?.reason).toMatch(/untreated/);
  });
});

function v7Round(value: number) {
  return Math.round(value * 1e8) / 1e8;
}
