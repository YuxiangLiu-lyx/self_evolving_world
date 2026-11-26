import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Event,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 30_000 });

const id = 'unheated-food-preparation';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** Moss's actual ex18 root source: the commons root patch Moss gathered seven roots from. */
const SOURCE = 'commons-root-1-0';

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
const stack = (w: V7World, item: string): V7Stack | undefined =>
  w.stacks.find((s) => s.id === item);
type Job = {
  id: string;
  status: string;
  stage: string;
  input: string;
  lot: string | null;
  initialWork: number;
  completedWork: number;
  remainingWork: number;
  paidEnergy: number;
  escrow: string[];
  units: { item: string; outcome: string; lot: string | null }[];
};
const jobs = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Job);
const job = (w: V7World) => jobs(w).at(-1);
const lot = (w: V7World) => stack(w, job(w)?.lot ?? '');
const record = (s: V7Stack | undefined) =>
  s?.processing?.unheatedPreparation as Record<string, unknown> | undefined;
/** Every unit of a food held as a stack anywhere: carried, reserved, prepared or on the ground. */
const units = (w: V7World, resource = 'root') =>
  w.stacks
    .filter((s) => s.resource === resource && s.id !== 'control-roots')
    .reduce((n, s) => n + Math.round(s.quantity * 10), 0) / 10;
const prepare = (unit: string, quantity = 7): V7Action => ({
  interface: id,
  args: { mode: 'prepare', inputStackId: unit, quantity },
});
const mode = (
  m: string,
  extra: Record<string, string | number> = {},
): V7Action => ({ interface: id, args: { mode: m, ...extra } });
const data = (w: V7World, type: string) =>
  events(w, type).at(-1)?.data as Record<string, unknown> | undefined;
/** Keep everyone fed and rested so the tests isolate the preparation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
function installed(plant = false) {
  const genesis = initialLongWorld('long-ex18', 'long-culture-v2-incentives');
  let w = v7Install(genesis, continuousRegistry(genesis), `${id}@1`);
  if (plant)
    w = v7Install(w, continuousRegistry(w), 'plant-establishment-trial@1');
  return v7Clone(w);
}

/** Moss gathers seven real roots from the commons patch, as in ex18, and studies for two rounds. */
function setup(study = true, plant = false) {
  let w = installed(plant);
  const from = w.objects.find((o) => o.id === SOURCE);
  if (!from) throw new Error('Missing fixture source.');
  actor(w).position = { x: from.spatial.x, y: from.spatial.y + 0.6 };
  w = step(w, {
    moss: { interface: 'gather', args: { target: SOURCE, quantity: 7 } },
  }).world;
  const unit = w.stacks.find((s) => s.owner === 'moss' && s.origin === SOURCE);
  if (!unit) throw new Error('Missing actually gathered fixture roots.');
  if (study) {
    w = step(w, { moss: { interface: 'learn', args: { ability: id } } }).world;
    expect(actor(w).mastered).not.toContain(id);
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  }
  return { w: fed(w), unit: unit.id };
}
/** Events of every round run through `rounds`, in order (a world keeps only its last round's). */
let log: V7Event[] = [];
const logged = (type: string) => log.filter((e) => e.type === type);
/** Run n bound prepare rounds. */
function rounds(w: V7World, unit: string, n: number, quantity = 7) {
  for (let i = 0; i < n; i++) {
    w = step(w, { moss: prepare(unit, quantity) }).world;
    log.push(...w.events);
  }
  return w;
}
/** Seven paid rounds with a control copy of the input that ages alongside it. */
function prepared() {
  const f = setup();
  const input = stack(f.w, f.unit);
  if (!input) throw new Error('Missing input.');
  f.w.stacks.push({ ...v7Clone(input), id: 'control-roots' });
  return { ...f, w: rounds(f.w, f.unit, 7) };
}
/** The action fails and changes no vitals or stacks compared with the same round spent waiting. */
function unchanged(w: V7World, action: V7Action, who = 'moss') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(jobs(result.world))).toBe(v7Signature(jobs(idle)));
  return result.outcomes[who]?.reason ?? '';
}

describe('unheated food preparation in ex18', () => {
  it('is scoped to ex18, fits the frozen text limit, adds no reward source and needs two rounds of study', () => {
    for (const [scope, scenario] of [
      ['long-ex16', 'long-culture-v2'],
      ['long-ex17', 'long-culture-v3'],
    ] as const) {
      const world = initialLongWorld(scope, scenario);
      expect(continuousRegistry(world).packages.map((p) => p.id)).not.toContain(
        id,
      );
      expect(() => v7Install(world, continuousRegistry(), `${id}@1`)).toThrow(
        /not approved/,
      );
    }
    // All packages together still register: handler ids stay unique; ex15's package is separate.
    const all = continuousRegistry();
    expect(all.handlers['long.unheated-food-preparation']).toBeDefined();
    expect(all.handlers['long.food-preparation']).toBeDefined();
    const f = setup(false);
    const ability = f.w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(2);
    expect(ability?.parameters.properties?.mode).toMatchObject({
      enum: ['inspect', 'prepare', 'inspect-progress', 'cancel'],
    });
    expect(ability?.references).toEqual({
      inputStackId: 'optional-exact-visible',
    });
    const limit = f.w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    const pkg = continuousRegistry(f.w).packages.find((p) => p.id === id);
    expect(pkg?.scope).toBe('long-ex18');
    expect(pkg?.abilities).toHaveLength(1);
    for (const a of pkg?.abilities ?? [])
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(limit);
    expect(
      JSON.stringify({ abilities: pkg?.abilities, events: pkg?.events }),
    ).not.toMatch(CULTURE_EXCLUDED_WORDS);
    // No drawing is needed (no object is made) and no satisfaction source is added.
    expect(pkg?.visualComponents).toEqual([]);
    expect(pkg?.satisfaction).toEqual([]);
    expect(f.w.config.longDevelopment?.culture?.incentives).toBe(true);
    // Unstudied use is refused without any cost.
    const before = actor(f.w).vitals.energy;
    const refused = step(f.w, { moss: prepare(f.unit) });
    expect(refused.outcomes.moss?.success).toBe(false);
    expect(actor(refused.world).vitals.energy).toBe(before);
    expect(job(refused.world)).toBeUndefined();
    let w = step(f.w, {
      moss: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(actor(w).mastered).not.toContain(id);
    w = step(w).world;
    expect(actor(w).mastered).toContain(id);
  });

  it('prepares seven owned roots in seven paid rounds of 0.5 energy into one conserved owned lot', () => {
    const f = setup();
    let w = f.w;
    const input = stack(w, f.unit);
    expect(input).toMatchObject({ resource: 'root', quantity: 7 });
    w.stacks.push({ ...v7Clone(input as V7Stack), id: 'control-roots' });
    const energy = actor(w).vitals.energy;
    const total = units(w);
    // Round 1: one unit is checked, brushed and moved into a new lot; the rest stays usable.
    log = [];
    w = rounds(w, f.unit, 1);
    expect(actor(w).vitals.energy).toBe(energy - 0.5);
    expect(events(w, 'unheated-preparation-started')).toHaveLength(1);
    expect(events(w, 'food-unit-checked')).toHaveLength(1);
    expect(events(w, 'food-unit-prepared')).toHaveLength(1);
    expect(data(w, 'food-unit-checked')?.unit).toMatchObject({
      resource: 'root',
      visibleSpoilage: 'none seen',
      looseDebris: 'not represented',
      safety: 'unknown',
    });
    expect(job(w)).toMatchObject({
      status: 'active',
      input: f.unit,
      initialWork: 7,
      completedWork: 1,
      remainingWork: 6,
      paidEnergy: 0.5,
      escrow: [],
    });
    expect(lot(w)?.quantity).toBe(1);
    expect(stack(w, f.unit)?.quantity).toBe(6);
    // Only the unit in its own round was ever separated: nothing stays reserved between rounds.
    expect(w.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
    // Partial progress shows completed and pending units, never a completed batch.
    w = rounds(w, f.unit, 2);
    expect(lot(w)?.quantity).toBe(3);
    expect(stack(w, f.unit)?.quantity).toBe(4);
    expect(data(w, 'food-unit-prepared')).toMatchObject({
      completedUnits: 3,
      pendingUnits: 4,
      requestedUnits: 7,
      lotQuantity: 3,
      status: 'active',
      raw: true,
      heated: false,
      safety: 'unknown',
    });
    expect(logged('unheated-preparation-completed')).toHaveLength(0);
    w = rounds(w, f.unit, 4);
    expect(actor(w).vitals.energy).toBe(energy - 3.5);
    expect(logged('unheated-preparation-started')).toHaveLength(1);
    expect(logged('food-unit-checked')).toHaveLength(7);
    expect(logged('food-unit-prepared')).toHaveLength(7);
    expect(logged('unheated-preparation-paused')).toHaveLength(0);
    expect(logged('unheated-preparation-completed')).toHaveLength(1);
    expect(job(w)).toMatchObject({
      status: 'completed',
      stage: 'completed',
      completedWork: 7,
      remainingWork: 0,
      paidEnergy: 3.5,
    });
    expect(job(w)?.units.map((u) => u.outcome)).toEqual(
      Array.from({ length: 7 }, () => 'prepared'),
    );
    // The input is used up; the lot is the same seven roots with unchanged origin and age.
    expect(stack(w, f.unit)).toBeUndefined();
    const out = lot(w);
    const control = stack(w, 'control-roots');
    expect(out).toMatchObject({
      resource: 'root',
      owner: 'moss',
      quantity: 7,
      quantityTenths: 70,
      origin: SOURCE,
      harvestedAt: input?.harvestedAt,
    });
    // It aged exactly like an unprepared copy: no shelf-life reset or extension.
    expect(out?.decay).toBe(control?.decay);
    expect(Number(out?.decay)).toBeGreaterThan(Number(input?.decay));
    expect(record(out)).toMatchObject({
      raw: true,
      heated: false,
      water: false,
      tool: false,
      safety: 'unknown',
      from: f.unit,
      workId: job(w)?.id,
      by: 'moss',
      units: 7,
      passes: 1,
    });
    expect(String(record(out)?.looseDebris)).toMatch(/not represented/);
    expect(units(w)).toBe(total);
    // Preparing earns no milestone and confirms no information.
    expect(logged('food-unit-prepared').some((e) => e.data.qualified)).toBe(
      false,
    );
    expect(logged('practice-confirmed')).toHaveLength(0);
    expect(logged('information-confirmed')).toHaveLength(0);
    // Nobody else's inventory was touched.
    expect(w.stacks.filter((s) => s.owner && s.owner !== 'moss')).toHaveLength(
      0,
    );
  });

  it('is eaten and given only through the existing interfaces, exactly like unprepared roots', () => {
    const { w } = prepared();
    const item = lot(w)?.id ?? '';
    const eat = (target: string) =>
      step(w, { moss: { interface: 'eat', args: { target, quantity: 1 } } });
    const fromLot = eat(item),
      raw = eat('control-roots');
    expect(fromLot.outcomes.moss?.success).toBe(true);
    expect(actor(fromLot.world).vitals).toEqual(actor(raw.world).vitals);
    expect(actor(fromLot.world).wellbeing).toEqual(actor(raw.world).wellbeing);
    expect(data(fromLot.world, 'ate')).toMatchObject({
      quantity: 1,
      resource: 'root',
      nutrition: 14,
    });
    expect(stack(fromLot.world, item)?.quantity).toBe(6);
    // Giving needs Lin within actual handoff reach and uses the unchanged give cost.
    const near = v7Clone(w);
    actor(near, 'lin').position = {
      x: actor(near).position.x + 0.75,
      y: actor(near).position.y,
    };
    const energy = actor(near).vitals.energy;
    const gift = step(near, {
      moss: {
        interface: 'give',
        args: { target: item, quantity: 2, recipient: 'lin' },
      },
    });
    expect(gift.outcomes.moss?.success).toBe(true);
    expect(actor(gift.world).vitals.energy).toBe(energy - 0.5);
    expect(stack(gift.world, item)?.quantity).toBe(5);
    const received = gift.world.stacks.find((s) => s.owner === 'lin');
    // Carried food ages at its carrier's position, so only origin and record are compared.
    expect(received).toMatchObject({
      resource: 'root',
      quantity: 2,
      origin: SOURCE,
      harvestedAt: stack(w, item)?.harvestedAt,
    });
    expect(Number(received?.decay)).toBeGreaterThan(
      Number(stack(w, item)?.decay),
    );
    expect(record(received)).toMatchObject({ raw: true, safety: 'unknown' });
    expect(units(gift.world)).toBe(units(w));
  });

  it('inspects owned food and progress at the observation cost without consuming anything', () => {
    const f = setup();
    const look = (w: V7World, action: V7Action, type: string) => {
      const energy = actor(w).vitals.energy;
      const result = step(w, { moss: action }),
        idle = step(w).world;
      expect(result.outcomes.moss?.success).toBe(true);
      expect(energy - actor(result.world).vitals.energy).toBeCloseTo(0.2, 6);
      expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
      expect(events(result.world, 'information-confirmed')).toHaveLength(0);
      return { world: result.world, value: data(result.world, type) };
    };
    const food = look(
      f.w,
      mode('inspect', { inputStackId: f.unit }),
      'food-condition-inspected',
    );
    expect(job(food.world)).toBeUndefined();
    expect(food.value?.observation).toMatchObject({
      item: f.unit,
      resource: 'root',
      quantity: 7,
      wholeUnits: 7,
      origin: SOURCE,
      visibleSpoilage: 'none seen',
      looseDebris: 'not represented',
      treatment: [],
      safety: 'unknown',
      preparable: true,
      reason: null,
      eatingRecord: { nutrition: 14, toxicity: 0, observedAt: null },
    });
    expect(
      actor(food.world).memory.knowledge?.[`${f.unit}:food-condition`],
    ).toMatchObject({ verified: false });
    // A branch is looked at but reported as not preparable.
    const branch = v7Clone(f.w);
    branch.stacks.push({
      id: 'own-branch',
      resource: 'branch',
      quantity: 1,
      quantityTenths: 10,
      position: { ...actor(branch).position },
      owner: 'moss',
      origin: 'canopy-41',
    });
    const wood = look(
      branch,
      mode('inspect', { inputStackId: 'own-branch' }),
      'food-condition-inspected',
    );
    expect(wood.value?.observation).toMatchObject({
      preparable: false,
      reason: expect.stringMatching(/not food/) as unknown,
    });
    // Progress after two units: only completed units are in the lot.
    const w = rounds(f.w, f.unit, 2);
    const seen = look(
      w,
      mode('inspect-progress'),
      'unheated-preparation-inspected',
    );
    expect(seen.value).toMatchObject({
      completedUnits: 2,
      pendingUnits: 5,
      lotQuantity: 2,
      input: f.unit,
    });
    expect(seen.value?.units).toHaveLength(2);
    expect(seen.value?.lotItem).toMatchObject({
      quantity: 2,
      safety: 'unknown',
    });
    expect(
      actor(seen.world).memory.knowledge?.[
        `${job(w)?.id ?? ''}:preparation-progress`
      ],
    ).toMatchObject({ verified: false });
  });

  it('refuses unsuitable requests and inputs without spending anything', () => {
    const f = setup();
    // Exact owned item ids only: a resource name is not an identity.
    unchanged(f.w, prepare('root'));
    expect(unchanged(f.w, prepare(f.unit, 8))).toMatch(
      /fewer than 8 whole units/,
    );
    expect(unchanged(f.w, mode('prepare', { inputStackId: f.unit }))).toMatch(
      /needs quantity/,
    );
    unchanged(f.w, mode('prepare', { inputStackId: f.unit, quantity: 1.5 }));
    unchanged(f.w, mode('prepare', { inputStackId: f.unit, quantity: 0 }));
    const theirs = v7Clone(f.w);
    const lent = stack(theirs, f.unit);
    if (lent) lent.owner = 'lin';
    unchanged(theirs, prepare(f.unit, 1));
    const branch = v7Clone(f.w);
    branch.stacks.push({
      id: 'own-branch',
      resource: 'branch',
      quantity: 1,
      quantityTenths: 10,
      position: { ...actor(branch).position },
      owner: 'moss',
      origin: 'canopy-41',
    });
    expect(unchanged(branch, prepare('own-branch', 1))).toMatch(/not food/);
    const part = v7Clone(f.w);
    const half = stack(part, f.unit);
    if (half) {
      half.quantity = 0.5;
      half.quantityTenths = 5;
    }
    expect(unchanged(part, prepare(f.unit, 1))).toMatch(/whole unit/);
    const treated = v7Clone(f.w);
    const t = stack(treated, f.unit);
    if (t) t.processing = { dried: true };
    expect(unchanged(treated, prepare(f.unit, 1))).toMatch(
      /another represented treatment/,
    );
    const tired = v7Clone(f.w);
    actor(tired).vitals.energy = 0.4;
    expect(unchanged(tired, prepare(f.unit, 1))).toMatch(/0\.5 energy/);
    actor(tired).vitals.energy = 0.1;
    unchanged(tired, mode('inspect', { inputStackId: f.unit }));
    expect(unchanged(f.w, mode('cancel'))).toMatch(/No unfinished/);
    expect(unchanged(f.w, mode('inspect-progress'))).toMatch(
      /no preparation to inspect/,
    );
    // An open job is resumed only with its own input and quantity.
    const w = step(f.w, { moss: prepare(f.unit) }).world;
    const other = stack(w, f.unit);
    if (other) w.stacks.push({ ...v7Clone(other), id: 'other-roots' });
    expect(unchanged(w, prepare(f.unit, 3))).toMatch(/Unfinished preparation/);
    expect(unchanged(w, prepare('other-roots', 6))).toMatch(
      /Unfinished preparation/,
    );
  });

  it('pauses without charge when unworked, tired or without its input, and resumes only the remaining units', () => {
    const f = setup();
    let w = step(f.w, { moss: prepare(f.unit) }).world;
    // A round spent on something else pauses the job; nothing progresses unattended.
    w = step(w).world;
    expect(job(w)?.status).toBe('paused');
    expect(events(w, 'unheated-preparation-paused')).toHaveLength(1);
    expect(lot(w)?.quantity).toBe(1);
    w = step(w, { moss: prepare(f.unit) }).world;
    expect(events(w, 'unheated-preparation-resumed')).toHaveLength(1);
    expect(lot(w)?.quantity).toBe(2);
    expect(job(w)).toMatchObject({ completedWork: 2, remainingWork: 5 });
    // Too little energy pauses before the charge.
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.3;
    const low = step(tired, { moss: prepare(f.unit) }),
      idle = step(tired).world;
    expect(low.outcomes.moss?.success).toBe(true);
    expect(actor(low.world).vitals).toEqual(actor(idle).vitals);
    expect(job(low.world)).toMatchObject({
      status: 'paused',
      completedWork: 2,
      paidEnergy: 1,
    });
    expect(
      String(data(low.world, 'unheated-preparation-paused')?.reason),
    ).toMatch(/needs 0\.5/);
    expect(lot(low.world)?.quantity).toBe(2);
    // An input that is no longer Moss's pauses the work; prepare without an id resumes the job.
    const given = v7Clone(w);
    const away = stack(given, f.unit);
    if (away) away.owner = 'lin';
    const gone = step(given, { moss: mode('prepare') });
    expect(gone.outcomes.moss?.success).toBe(true);
    expect(job(gone.world)).toMatchObject({
      status: 'paused',
      completedWork: 2,
    });
    expect(
      String(data(gone.world, 'unheated-preparation-paused')?.reason),
    ).toMatch(/no longer yours/);
    expect(actor(gone.world).vitals.energy).toBe(actor(given).vitals.energy);
    // Resuming pays only the remaining units.
    w = rounds(w, f.unit, 5);
    expect(job(w)).toMatchObject({ status: 'completed', paidEnergy: 3.5 });
    expect(lot(w)?.quantity).toBe(7);
  });

  it('is resumed, inspected and cancelled only by its own operator; cancel keeps completed units, and death drops the lot under the existing rules', () => {
    const f = setup();
    const w = rounds(f.w, f.unit, 2);
    const total = units(w);
    // Lin has mastered the interface but has no preparation of her own: Moss's job is untouched.
    const other = v7Clone(w);
    actor(other, 'lin').mastered.push(id);
    actor(other, 'lin').position = {
      x: actor(other).position.x + 0.75,
      y: actor(other).position.y,
    };
    expect(unchanged(other, mode('cancel'), 'lin')).toMatch(/No unfinished/);
    expect(unchanged(other, mode('inspect-progress'), 'lin')).toMatch(
      /no preparation to inspect/,
    );
    expect(unchanged(other, mode('prepare', { quantity: 7 }), 'lin')).toMatch(
      /inputStackId/,
    );
    unchanged(other, prepare(f.unit), 'lin');
    const cancelled = step(w, { moss: mode('cancel') }),
      idle = step(w).world;
    expect(cancelled.outcomes.moss?.success).toBe(true);
    expect(actor(cancelled.world).vitals).toEqual(actor(idle).vitals);
    expect(
      events(cancelled.world, 'unheated-preparation-cancelled'),
    ).toHaveLength(1);
    expect(
      data(cancelled.world, 'unheated-preparation-cancelled')?.released,
    ).toEqual([]);
    expect(job(cancelled.world)).toMatchObject({
      status: 'stopped',
      stage: 'cancelled',
      paidEnergy: 1,
    });
    expect(lot(cancelled.world)).toMatchObject({ quantity: 2, owner: 'moss' });
    expect(record(lot(cancelled.world))).toMatchObject({ units: 2 });
    expect(stack(cancelled.world, f.unit)?.quantity).toBe(5);
    expect(units(cancelled.world)).toBe(total);
    expect(unchanged(fed(cancelled.world), mode('cancel'))).toMatch(
      /No unfinished/,
    );
    // A new preparation of the rest starts a new job and lot.
    const again = step(fed(cancelled.world), {
      moss: prepare(f.unit, 5),
    }).world;
    expect(jobs(again)).toHaveLength(2);
    expect(lot(again)?.id).not.toBe(lot(cancelled.world)?.id);
    // Death: the job ends once, and the existing death rule drops every owned item where Moss died.
    const dying = v7Clone(w);
    actor(dying).vitals.health = 0.0001;
    actor(dying).vitals.satiety = 0;
    const where = { ...actor(dying).position };
    const died = step(dying).world;
    expect(events(died, 'died')).toHaveLength(1);
    expect(job(died)).toMatchObject({
      status: 'stopped',
      stage: 'ended-by-death',
    });
    expect(events(died, 'unheated-preparation-failed')).toHaveLength(1);
    expect(died.stacks.filter((s) => s.owner === 'moss')).toHaveLength(0);
    expect(lot(died)).toMatchObject({
      owner: null,
      quantity: 2,
      position: where,
    });
    expect(record(lot(died))).toMatchObject({ units: 2 });
    expect(died.stacks.filter((s) => s.reservedFor)).toHaveLength(0);
    expect(units(died)).toBe(total);
  });

  it('reports a spoiled unit as unsuitable after its paid check, prepares nothing and stops', () => {
    const f = setup();
    const w = v7Clone(f.w);
    const input = stack(w, f.unit);
    if (input) input.decay = 240;
    const energy = actor(w).vitals.energy;
    const result = step(w, { moss: prepare(f.unit, 2) });
    expect(result.outcomes.moss?.success).toBe(true);
    expect(actor(result.world).vitals.energy).toBe(energy - 0.5);
    expect(data(result.world, 'food-unit-checked')?.unit).toMatchObject({
      visibleSpoilage: 'spoiled',
    });
    expect(events(result.world, 'food-unit-unsuitable')).toHaveLength(1);
    expect(events(result.world, 'food-unit-prepared')).toHaveLength(0);
    const j = job(result.world);
    expect(j).toMatchObject({
      status: 'stopped',
      stage: 'unsuitable',
      lot: null,
    });
    expect(j?.units).toMatchObject([{ outcome: 'unsuitable', lot: null }]);
    expect(result.world.stacks.some((s) => record(s))).toBe(false);
    // The unprepared unit then spoils under the existing ageing rule, like the rest of the input.
    expect(events(result.world, 'spoiled').map((e) => e.target)).toEqual(
      expect.arrayContaining([f.unit, j?.units[0]?.item]),
    );
  });

  it('adds no reward under the existing incentives and leaves prepared roots unplantable as processed', () => {
    const f = setup(true, true);
    const worked = step(f.w, { moss: prepare(f.unit) }),
      idle = step(f.w).world;
    expect(worked.outcomes.moss?.success).toBe(true);
    expect(actor(worked.world).wellbeing.sources).toEqual(
      actor(idle).wellbeing.sources,
    );
    expect(actor(worked.world).wellbeing.mental).toBe(
      actor(idle).wellbeing.mental,
    );
    expect(worked.world.objects.length).toBe(idle.objects.length);
    for (const a of worked.world.actors.filter((a) => a.id !== 'moss'))
      expect(a.wellbeing).toEqual(actor(idle, a.id).wellbeing);
    // The existing planting rule treats any processing record as processed.
    const w = fed(worked.world);
    actor(w).mastered.push('plant-establishment-trial');
    const item = lot(w)?.id ?? '';
    const planting = step(w, {
      moss: {
        interface: 'plant-establishment-trial',
        args: {
          mode: 'plant',
          inputStackId: item,
          x: actor(w).position.x,
          y: actor(w).position.y + 0.7,
        },
      },
    });
    expect(planting.outcomes.moss?.success).toBe(false);
    expect(planting.outcomes.moss?.reason).toMatch(/treated/);
  });
});
