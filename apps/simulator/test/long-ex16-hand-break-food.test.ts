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
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';
import { CONTINUOUS_VISUALS } from '../../viewer/src/continuous-visuals.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 30_000 });

const id = 'hand-break-food';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** Root, berry and hazelnut sources near the group, and a spot within reach of each. */
const ROOTS = { source: 'commons-root-4-0', at: { x: 13.16, y: 11.75 } };
const BERRIES = { source: 'commons-berry-4-0', at: { x: 11.21, y: 12.88 } };
const NUTS = { source: 'start-1-nuts', at: { x: 15.4, y: 14.96 } };
/** Engine material values and thresholds that no event may reveal. */
const HIDDEN = /strength|flexib|hardness|lifetime|threshold|resistance/i;

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
const tenths = (n: number) => Math.round(n * 10);
/** Every tenth of a food in stacks: carried, reserved, worked or on the ground. */
const held = (w: V7World, resource = 'root') =>
  w.stacks
    .filter((s) => s.resource === resource)
    .reduce((n, s) => n + tenths(s.quantity), 0);
interface Job {
  id: string;
  status: string;
  completedWork: number;
  remainingWork: number;
  paidEnergy: number;
  escrow: string[];
  outputs: string[];
  lost: string[];
}
const jobs = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Job);
const job = (w: V7World) => jobs(w).at(-1);
const reserved = (w: V7World) =>
  w.stacks.filter((s) => s.reservedFor === job(w)?.id);
const worked = (w: V7World) => w.stacks.filter((s) => s.processing?.handBreak);
const form = (s?: V7Stack) =>
  (s?.processing?.handBreak as { form?: string } | undefined)?.form;
const energy = (w: V7World, name = 'wren') => actor(w, name).vitals.energy;
/** Energy a step spent beyond what the same round spends while waiting. */
const spent = (from: V7World, to: V7World, name = 'wren') =>
  energy(step(from).world, name) - energy(to, name);

function installed() {
  const genesis = initialLongWorld('long-ex16', 'long-culture-v2');
  return v7Clone(v7Install(genesis, continuousRegistry(genesis), `${id}@1`));
}
function study(w: V7World, who = 'wren') {
  let x = step(w, {
    [who]: { interface: 'learn', args: { ability: id } },
  }).world;
  x = step(x).world;
  expect(actor(x, who).mastered).toContain(id);
  return x;
}
/** Wren gathers real food with the unchanged base gather from a source in reach. */
function gather(w: V7World, at: typeof ROOTS, quantity: number) {
  actor(w).position = { ...at.at };
  const r = step(w, {
    wren: { interface: 'gather', args: { target: at.source, quantity } },
  });
  expect(r.outcomes.wren?.success).toBe(true);
  const s = r.world.stacks.find(
    (s) => s.owner === 'wren' && s.origin === at.source && !s.processing,
  );
  if (!s) throw new Error('Missing actually gathered fixture food.');
  return { w: r.world, item: s.id };
}
/** Wren (who knows roots as food) holds real roots and, by default, has studied. */
function supplied(learn = true, quantity = 3) {
  const g = gather(installed(), ROOTS, quantity);
  const w = learn ? study(g.w) : g.w;
  actor(w).vitals.energy = 40;
  return { w, root: g.item };
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
/** Everything this package emitted, which must carry no hidden material value. */
const visible = (w: V7World) =>
  w.events.filter(
    (e) =>
      e.interface === id ||
      e.type.startsWith('hand-break') ||
      e.type.startsWith('food-'),
  );

describe('hand-break food in ex16', () => {
  it('is scoped to ex16, needs two study rounds at 0.2 energy and fits the frozen size limit', () => {
    const other = initialLongWorld('long-ex15', 'long-culture');
    expect(() =>
      v7Install(other, continuousRegistry(other), `${id}@1`),
    ).toThrow();
    const f = supplied(false);
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(2);
    expect(ability?.learningEnergy).toBe(0.2);
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
    expect(
      pkg?.visualComponents.every(
        (c) => typeof CONTINUOUS_VISUALS[c] === 'function',
      ),
    ).toBe(true);
    const early = step(f.w, { wren: mode('trial', { inputStackId: f.root }) });
    expect(early.outcomes.wren?.reason).toMatch(/not mastered/);
    expect(actor(early.world).vitals).toEqual(actor(step(f.w).world).vitals);
    const first = step(f.w, {
      wren: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(spent(f.w, first)).toBeCloseTo(0.2, 6);
    expect(actor(first).mastered).not.toContain(id);
    const second = step(first).world,
      resting = v7Clone(first);
    // The second study round runs with any action; compare with a round without study.
    actor(resting).learning = null;
    expect(energy(step(resting).world) - energy(second)).toBeCloseTo(0.2, 6);
    expect(actor(second).mastered).toContain(id);
    expect(events(second, 'satisfaction')).toHaveLength(0);
    expect(JSON.stringify(actor(second).wellbeing.sources)).not.toContain(id);
  });

  it('trial: one held root snaps into one coarse-piece lot for one round and 1 energy, keeping its food, age and quantity', () => {
    const f = supplied();
    const before = held(f.w),
      load = v7Load(f.w, actor(f.w)),
      r = step(f.w, { wren: mode('trial', { inputStackId: f.root }) }),
      w = r.world;
    expect(r.outcomes.wren).toMatchObject({ success: true, complete: true });
    expect(spent(f.w, w)).toBeCloseTo(1, 6);
    const types = visible(w).map((e) => e.type);
    expect(types).toEqual([
      'hand-break-started',
      'process-progress',
      'hand-force-applied',
      'trial-result',
      'information-confirmed',
      'food-fractured',
      'hand-break-completed',
    ]);
    const lots = worked(w);
    expect(lots).toHaveLength(1);
    const lot = lots[0],
      source = w.stacks.find((s) => s.id === f.root);
    // The same food quantity in one lot with changed form, not several nutrition-bearing units.
    expect(lot).toMatchObject({
      resource: 'root',
      quantity: 1,
      quantityTenths: 10,
      owner: 'wren',
      origin: ROOTS.source,
      harvestedAt: source?.harvestedAt,
      decay: source?.decay,
    });
    expect(lot?.reservedFor).toBeUndefined();
    expect(lot?.processing?.handBreak).toMatchObject({
      form: 'coarse-pieces',
      pieces: 2,
      workId: job(w)?.id,
      by: 'wren',
      source: f.root,
    });
    expect(source?.quantity).toBe(2);
    expect(held(w)).toBe(before);
    expect(v7Load(w, actor(w))).toBeCloseTo(load, 8);
    const fractured = events(w, 'food-fractured')[0];
    expect(fractured?.actor).toBe('wren');
    expect(fractured?.target).toBe(lot?.id);
    expect(fractured?.data).toMatchObject({
      workId: job(w)?.id,
      output: lot?.id,
      outcome: 'fractured',
      form: 'coarse-pieces',
      pieces: 2,
      lot: {
        form: 'coarse-pieces',
        quantity: 1,
        visual: { component: 'food' },
      },
    });
    expect(job(w)).toMatchObject({
      status: 'completed',
      completedWork: 1,
      paidEnergy: 1,
      outputs: [lot?.id],
    });
    // The verified record states the observed response only.
    expect(
      actor(w).memory.knowledge?.[`${id}:root:whole-untreated:fractured`],
    ).toMatchObject({
      verified: true,
      value: { outcome: 'fractured', form: 'coarse-pieces', pieces: 2 },
    });
    expect(
      events(w, 'information-confirmed').every((e) => e.interface === id),
    ).toBe(true);
    expect(JSON.stringify(visible(w).map((e) => e.data))).not.toMatch(HIDDEN);
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(events(w, 'satisfaction')).toHaveLength(0);
    // A second trial costs again and confirms nothing new.
    const again = step(w, { wren: mode('trial', { inputStackId: f.root }) });
    expect(again.outcomes.wren?.success).toBe(true);
    expect(spent(w, again.world)).toBeCloseTo(1, 6);
    expect(worked(again.world)).toHaveLength(2);
    expect(events(again.world, 'information-confirmed')).toHaveLength(0);
  });

  it('eats a broken lot exactly like a whole root of the same age, with no meal or reward difference', () => {
    const f = supplied();
    const w = step(f.w, {
      wren: mode('trial', { inputStackId: f.root }),
    }).world;
    actor(w).vitals.satiety = 40;
    const lot = worked(w)[0]?.id ?? '';
    const pieces = step(w, {
      wren: { interface: 'eat', args: { target: lot, quantity: 1 } },
    }).world;
    const whole = step(w, {
      wren: { interface: 'eat', args: { target: f.root, quantity: 1 } },
    }).world;
    expect(events(pieces, 'ate')[0]?.data).toMatchObject({
      resource: 'root',
      quantity: 1,
      nutrition: 14,
    });
    expect(events(pieces, 'ate')[0]?.data).toEqual(
      events(whole, 'ate')[0]?.data,
    );
    expect(actor(pieces).vitals).toEqual(actor(whole).vitals);
    expect(actor(pieces).experience).toEqual(actor(whole).experience);
    expect(actor(pieces).wellbeing).toEqual(actor(whole).wellbeing);
    expect(held(pieces)).toBe(held(whole));
    expect(worked(pieces)).toHaveLength(0);
  });

  it('prepare: reserves the units at once, works one per round for 1 energy each and keeps every lot separately', () => {
    const f = supplied();
    const before = held(f.w),
      action = mode('prepare', { inputStackId: f.root, quantity: 3 });
    const first = step(f.w, { wren: action });
    expect(first.outcomes.wren).toMatchObject({
      success: true,
      complete: false,
    });
    expect(spent(f.w, first.world)).toBeCloseTo(1, 6);
    // All three units were reserved at once; the source item is used up.
    expect(first.world.stacks.some((s) => s.id === f.root)).toBe(false);
    expect(job(first.world)?.escrow).toHaveLength(3);
    expect(reserved(first.world)).toHaveLength(2);
    expect(worked(first.world)).toHaveLength(1);
    expect(held(first.world)).toBe(before);
    let w = first.world;
    for (let i = 0; i < 2; i++) {
      const r = step(w, { wren: action });
      expect(spent(w, r.world)).toBeCloseTo(1, 6);
      expect(events(r.world, 'food-fractured')).toHaveLength(1);
      expect(r.outcomes.wren?.complete).toBe(i === 1);
      w = r.world;
    }
    const lots = worked(w);
    expect(lots).toHaveLength(3);
    expect(new Set(lots.map((s) => s.id)).size).toBe(3);
    expect(lots.every((s) => s.quantity === 1 && s.owner === 'wren')).toBe(
      true,
    );
    expect(lots.every((s) => form(s) === 'coarse-pieces')).toBe(true);
    expect(job(w)).toMatchObject({
      status: 'completed',
      completedWork: 3,
      paidEnergy: 3,
    });
    expect(job(w)?.outputs).toEqual(lots.map((s) => s.id));
    expect(events(w, 'hand-break-completed')[0]?.data).toMatchObject({
      fractured: 3,
      deformed: 0,
      resisted: 0,
      progress: 1,
    });
    expect(w.stacks.some((s) => s.reservedFor)).toBe(false);
    expect(held(w)).toBe(before);
  });

  it('pauses without charge when not worked or short of energy, keeps ageing, and resumes only by work id', () => {
    const f = supplied();
    const action = mode('prepare', { inputStackId: f.root, quantity: 3 });
    let w = step(f.w, { wren: action }).world;
    const workId = job(w)?.id ?? '',
      ageing = reserved(w)[0]?.decay ?? 0;
    // A round spent otherwise pauses the work; nothing is paid.
    w = step(w).world;
    expect(job(w)).toMatchObject({ status: 'paused', paidEnergy: 1 });
    const paused = events(w, 'hand-break-paused')[0];
    expect(paused?.actor).toBe('wren');
    expect(paused?.data).toMatchObject({ workId, remaining: 2 });
    expect(reserved(w)).toHaveLength(2);
    expect(reserved(w)[0]?.decay ?? 0).toBeGreaterThan(ageing);
    // A new request cannot replace the paused work.
    unchanged(w, action, /Unfinished hand-break work/);
    unchanged(w, mode('trial', { inputStackId: f.root }), /Unfinished/);
    // Too little energy pauses before the paid unit.
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.5;
    const low = step(tired, { wren: mode('prepare', { workId }) });
    expect(low.outcomes.wren?.success).toBe(true);
    expect(events(low.world, 'hand-break-paused')[0]?.data).toMatchObject({
      requiredEnergy: 1,
    });
    expect(spent(tired, low.world)).toBeCloseTo(0, 6);
    expect(low.world.stacks).toEqual(step(tired).world.stacks);
    // Resuming by work id pays only the next unit.
    const back = step(w, { wren: mode('prepare', { workId }) });
    expect(events(back.world, 'hand-break-resumed')).toHaveLength(1);
    expect(events(back.world, 'food-fractured')).toHaveLength(1);
    expect(spent(w, back.world)).toBeCloseTo(1, 6);
    expect(back.outcomes.wren?.complete).toBe(false);
    const last = step(back.world, { wren: mode('prepare', { workId }) });
    expect(last.outcomes.wren?.complete).toBe(true);
    expect(job(last.world)).toMatchObject({
      status: 'completed',
      paidEnergy: 3,
    });
    expect(worked(last.world)).toHaveLength(3);
  });

  it('cancel returns unworked units once, unchanged, for no energy, and keeps the worked lots', () => {
    const f = supplied();
    const before = held(f.w);
    let w = step(f.w, {
      wren: mode('prepare', { inputStackId: f.root, quantity: 3 }),
    }).world;
    const lot = worked(w)[0],
      units = reserved(w).map((s) => s.id);
    const r = step(w, { wren: mode('cancel') });
    expect(r.outcomes.wren?.success).toBe(true);
    expect(spent(w, r.world)).toBeCloseTo(0, 6);
    w = r.world;
    expect(job(w)?.status).toBe('stopped');
    expect(events(w, 'hand-break-cancelled')[0]?.data).toMatchObject({
      returned: units,
    });
    const back = w.stacks.filter((s) => units.includes(s.id));
    expect(back).toHaveLength(2);
    expect(
      back.every(
        (s) =>
          s.owner === 'wren' &&
          !s.reservedFor &&
          !s.processing &&
          s.quantity === 1 &&
          s.origin === ROOTS.source,
      ),
    ).toBe(true);
    expect(w.stacks.find((s) => s.id === lot?.id)).toMatchObject({
      quantity: 1,
      processing: { handBreak: { form: 'coarse-pieces' } },
    });
    expect(held(w)).toBe(before);
    unchanged(w, mode('cancel'), /No unfinished hand-break work/);
    // A returned unit is ordinary whole food again.
    expect(
      step(w, { wren: mode('trial', { inputStackId: units[0] }) }).outcomes.wren
        ?.success,
    ).toBe(true);
  });

  it('refuses unsuitable requests at no cost', () => {
    const f = supplied();
    unchanged(f.w, mode('trial', { inputStackId: 'root' }), /exact id/);
    unchanged(f.w, mode('trial', { inputStackId: 'item-none' }), /exact id/);
    unchanged(
      f.w,
      mode('trial', { inputStackId: f.root, quantity: 2 }),
      /exactly one whole unit/,
    );
    unchanged(
      f.w,
      mode('prepare', { inputStackId: f.root, quantity: 4 }),
      /fewer than 4 whole units/,
    );
    unchanged(
      f.w,
      mode('prepare', { inputStackId: f.root, quantity: 11 }),
      /quantity/,
    );
    unchanged(
      f.w,
      mode('prepare', { inputStackId: f.root, workId: 'manual-0-x-1' }),
      /No unfinished hand-break work of yours/,
    );
    unchanged(f.w, mode('cancel'), /No unfinished/);
    unchanged(f.w, mode('inspect', { workId: 'manual-0-x-1' }), /workId/);
    const tired = v7Clone(f.w);
    actor(tired).vitals.energy = 0.5;
    unchanged(tired, mode('trial', { inputStackId: f.root }), /energy/);
    // Ground food is not owned.
    const dropped = step(f.w, {
      wren: { interface: 'drop', args: { target: f.root, quantity: 1 } },
    }).world;
    const ground = dropped.stacks.find(
      (s) => s.owner === null && s.resource === 'root',
    );
    unchanged(dropped, mode('trial', { inputStackId: ground?.id }), /exact id/);
    // A broken lot is not worked again.
    const broke = step(f.w, {
      wren: mode('trial', { inputStackId: f.root }),
    }).world;
    unchanged(
      broke,
      mode('trial', { inputStackId: worked(broke)[0]?.id }),
      /broken, deformed/,
    );
    // Food without the person's own record as food is refused.
    const berries = gather(v7Clone(f.w), BERRIES, 1);
    actor(berries.w).vitals.energy = 40;
    unchanged(
      berries.w,
      mode('trial', { inputStackId: berries.item }),
      /own record/,
    );
  });

  it('resolves other foods physically: a berry deforms and a hazelnut resists, with informative records', () => {
    const f = supplied();
    const learnFood = (at: typeof ROOTS) => {
      const g = gather(v7Clone(f.w), at, 2);
      const w = step(g.w, {
        wren: { interface: 'eat', args: { target: g.item, quantity: 1 } },
      }).world;
      actor(w).vitals.energy = 40;
      return { w, item: g.item };
    };
    // A berry has no rigid tissue: it squashes into one deformed lot, never coarse pieces.
    const b = learnFood(BERRIES);
    const berry = step(b.w, {
      wren: mode('trial', { inputStackId: b.item }),
    }).world;
    expect(spent(b.w, berry)).toBeCloseTo(1, 6);
    expect(events(berry, 'food-fractured')).toHaveLength(0);
    expect(events(berry, 'food-deformed')[0]?.data).toMatchObject({
      outcome: 'deformed',
      form: 'deformed',
      pieces: 1,
      observed: 'squashed out of shape without separating',
    });
    const squashed = worked(berry);
    expect(squashed).toHaveLength(1);
    expect(squashed[0]).toMatchObject({
      resource: 'berry',
      quantity: 1,
      origin: BERRIES.source,
    });
    expect(form(squashed[0])).toBe('deformed');
    expect(held(berry, 'berry')).toBe(held(b.w, 'berry'));
    expect(events(berry, 'information-confirmed')).toHaveLength(1);
    // A hazelnut resists bounded hand force: the same unit stays whole and unchanged.
    const n = learnFood(NUTS);
    const r = step(n.w, { wren: mode('trial', { inputStackId: n.item }) });
    const nut = r.world;
    expect(r.outcomes.wren?.success).toBe(true);
    expect(spent(n.w, nut)).toBeCloseTo(1, 6);
    expect(events(nut, 'food-fractured')).toHaveLength(0);
    expect(events(nut, 'food-deformed')).toHaveLength(0);
    const resisted = events(nut, 'hand-break-resisted')[0];
    expect(resisted?.data).toMatchObject({
      outcome: 'resisted',
      form: 'whole',
    });
    const unit = nut.stacks.find((s) => s.id === resisted?.target);
    expect(unit).toMatchObject({
      resource: 'hazelnut',
      quantity: 1,
      owner: 'wren',
      origin: NUTS.source,
    });
    expect(unit?.reservedFor).toBeUndefined();
    expect(unit?.processing).toBeUndefined();
    expect(worked(nut)).toHaveLength(0);
    expect(events(nut, 'hand-break-completed')[0]?.data).toMatchObject({
      fractured: 0,
      resisted: 1,
    });
    expect(
      actor(nut).memory.knowledge?.[`${id}:hazelnut:whole-untreated:resisted`],
    ).toMatchObject({ verified: true, value: { outcome: 'resisted' } });
    expect(events(nut, 'information-confirmed')).toHaveLength(1);
    expect(held(nut, 'hazelnut')).toBe(held(n.w, 'hazelnut'));
    expect(
      JSON.stringify([...visible(berry), ...visible(nut)].map((e) => e.data)),
    ).not.toMatch(HIDDEN);
  });

  it('inspects only visible form, quantity, stage and decay for 0.2 energy', () => {
    const f = supplied();
    const w = step(f.w, {
      wren: mode('trial', { inputStackId: f.root }),
    }).world;
    const lot = worked(w)[0];
    const r = step(w, { wren: mode('inspect', { inputStackId: lot?.id }) });
    expect(spent(w, r.world)).toBeCloseTo(0.2, 6);
    const seen = events(r.world, 'hand-break-inspected')[0];
    expect(seen?.data).toMatchObject({
      item: lot?.id,
      resource: 'root',
      form: 'coarse-pieces',
      pieces: 2,
      quantity: 1,
      reserved: false,
    });
    expect(typeof seen?.data.decay).toBe('number');
    expect(events(r.world, 'information-confirmed')).toHaveLength(0);
    expect(events(r.world, 'trial-result')[0]?.data.verified).toBe(false);
    expect(r.world.stacks).toEqual(step(w).world.stacks);
    const whole = step(w, { wren: mode('inspect', { inputStackId: f.root }) });
    expect(events(whole.world, 'hand-break-inspected')[0]?.data).toMatchObject({
      form: 'whole',
      quantity: 2,
    });
    const byWork = step(w, {
      wren: mode('inspect', { workId: job(w)?.id }),
    }).world;
    expect(events(byWork, 'hand-break-inspected')[0]?.data).toMatchObject({
      stage: 'completed',
      selected: 1,
      remaining: 0,
      outputs: [{ item: lot?.id, form: 'coarse-pieces' }],
    });
    expect(
      JSON.stringify(
        [...visible(r.world), ...visible(byWork)].map((e) => e.data),
      ),
    ).not.toMatch(HIDDEN);
  });

  it('keeps the work personal: another person cannot resume, inspect or cancel it', () => {
    const f = supplied();
    const both = study(f.w, 'kai');
    actor(both).vitals.energy = 40;
    actor(both, 'kai').vitals.energy = 40;
    const w = step(both, {
      wren: mode('prepare', { inputStackId: f.root, quantity: 3 }),
    }).world;
    const workId = job(w)?.id;
    unchanged(
      w,
      mode('prepare', { workId }),
      /No unfinished hand-break work of yours/,
      'kai',
    );
    unchanged(w, mode('inspect', { workId }), /workId/, 'kai');
    unchanged(w, mode('cancel', { workId }), /No unfinished/, 'kai');
    unchanged(
      w,
      mode('trial', { inputStackId: reserved(w)[0]?.id }),
      /exact id/,
      'kai',
    );
  });

  it('does not replace a reserved unit that spoils', () => {
    const f = supplied(true, 2);
    let w = step(f.w, {
      wren: mode('prepare', { inputStackId: f.root, quantity: 2 }),
    }).world;
    const before = held(w),
      workId = job(w)?.id,
      unit = reserved(w)[0];
    // Fixture: age the reserved unit to just before the end of its lifetime.
    if (unit) unit.decay = 239.9999;
    w = step(w).world;
    expect(events(w, 'spoiled')[0]?.target).toBe(unit?.id);
    expect(held(w)).toBe(before - 10);
    const r = step(w, { wren: mode('prepare', { workId }) });
    expect(r.outcomes.wren?.complete).toBe(true);
    expect(spent(w, r.world)).toBeCloseTo(0, 6);
    expect(job(r.world)).toMatchObject({
      status: 'completed',
      paidEnergy: 1,
      lost: [unit?.id],
    });
    expect(held(r.world)).toBe(before - 10);
    expect(worked(r.world)).toHaveLength(1);
  });

  it('stops at death, leaving unworked units on the ground once', () => {
    const f = supplied();
    const w = step(f.w, {
      wren: mode('prepare', { inputStackId: f.root, quantity: 3 }),
    }).world;
    const units = reserved(w).map((s) => s.id),
      lot = worked(w)[0];
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    const dead = v7Clone(w);
    pkg?.onDeath?.(dead, actor(dead));
    expect(job(dead)?.status).toBe('stopped');
    expect(events(dead, 'hand-break-stopped')).toHaveLength(1);
    const at = actor(dead).position;
    const dropped = dead.stacks.filter((s) => units.includes(s.id));
    expect(dropped).toHaveLength(2);
    expect(
      dropped.every(
        (s) =>
          s.owner === null &&
          !s.reservedFor &&
          s.position.x === at.x &&
          s.position.y === at.y,
      ),
    ).toBe(true);
    expect(dead.stacks.find((s) => s.id === lot?.id)?.quantity).toBe(1);
    expect(held(dead)).toBe(held(w));
  });
});
