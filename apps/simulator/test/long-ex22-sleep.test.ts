import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  forestClimate,
  v7Clone,
  v7Install,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7ActionContext,
  V7Actor,
  V7Data,
  V7Object,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 60_000 });

const id = 'sleep-in-place';
const WAIT: V7Action = { interface: 'wait', args: {} };
const REST: V7Action = { interface: 'rest', args: {} };
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition/i;
/** sha256 of JSON.stringify of these packages, taken before this change. */
const BEFORE: Record<string, string> = {
  'prepare-shelled-food':
    'c01d24e4b18e8a6611e237b598b790bdcbe023f96e657159ed22ceeab66861b0',
  'draw-from-observation':
    'd0ed2b1c8491d125619a2df64989baf224756076206653facfcdc9809510f8eb',
  'foundation-forest':
    '54094fb4230e6a50ffaeec27771a3d4345987b2e6f03161a5cf61f9f5c36de7b',
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
const actor = (w: V7World, name = 'ivo'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string, who = 'ivo') =>
  w.events.filter((e) => e.type === type && e.actor === who);
const data = (w: V7World, type: string) =>
  events(w, type).at(-1)?.data as Record<string, unknown> | undefined;
type Interval = {
  n: number | null;
  tick: number;
  slept: boolean;
  energyBefore: number;
  credit: number;
  nominal: number | null;
  factor: number | null;
  cap: number;
  capped: boolean;
  energyAfterCredit: number;
  result: string;
  unmet: string[];
  energyAfter: number | null;
  otherDebits: number | null;
  net: number | null;
  satietyChange: number | null;
  healthChange: number | null;
  outcome: string | null;
  settled: string;
};
type Sleep = {
  id: string;
  owner: string;
  status: string;
  phase: string;
  posture: string | null;
  initialWork: number;
  completedWork: number;
  remainingWork: number;
  paidEnergy: number;
  support: Record<string, unknown>;
  entries: { tick: number; resumed: boolean }[];
  intervals: Interval[];
  interruptions: { tick: number; reasons: string[] }[];
  endedAt: number | null;
  reason?: string;
};
const works = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Sleep);
const work = (w: V7World): Sleep => {
  const j = works(w).at(-1);
  if (!j) throw new Error('Missing sleep work.');
  return j;
};
const act = (mode: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});
const start = (duration?: number) =>
  act('start', duration === undefined ? {} : { duration });
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
/** Ivo, fed, with the given energy; optionally studied (one round). */
function setup(opts: { study?: boolean; energy?: number } = {}) {
  let w = installed();
  if (opts.study ?? true) {
    w = step(w, { ivo: { interface: 'learn', args: { ability: id } } }).world;
    expect(actor(w).mastered).toContain(id);
  }
  return with_(w, { energy: opts.energy ?? 40 });
}
/** A copy with Ivo's vitals or mood changed; everyone else is fed. */
function with_(
  w: V7World,
  v: { energy?: number; temperature?: number; mental?: number } = {},
) {
  const copy = v7Clone(w);
  for (const a of copy.actors.filter((a) => a.vitals.health > 0))
    a.vitals.satiety = 80;
  const ivo = actor(copy);
  if (v.energy !== undefined) ivo.vitals.energy = v.energy;
  if (v.temperature !== undefined) ivo.vitals.temperature = v.temperature;
  if (v.mental !== undefined && ivo.experience)
    ivo.experience.mental = v.mental;
  return copy;
}
/** The action fails and changes no vitals, stacks, objects or works compared with waiting. */
function unchanged(w: V7World, action: V7Action) {
  const result = step(w, { ivo: action }),
    idle = step(w).world;
  expect(result.outcomes.ivo?.success).toBe(false);
  expect(actor(result.world).vitals).toEqual(actor(idle).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  expect(v7Signature(works(result.world))).toBe(v7Signature(works(idle)));
  expect(actor(result.world).extensionState[`long:view:${id}`]).toEqual(
    actor(idle).extensionState[`long:view:${id}`],
  );
  return result.outcomes.ivo?.reason ?? '';
}
/** A free point of the given ground away from every object and person. */
function spot(w: V7World, ground: string) {
  for (let y = 0; y < w.config.height; y++)
    for (let x = 0; x < w.config.width; x++) {
      const p = { x: x + 0.5, y: y + 0.5 };
      if (w.terrain[y]?.[x] !== ground) continue;
      if (
        w.objects.some(
          (o) => Math.hypot(o.spatial.x - p.x, o.spatial.y - p.y) < 2,
        ) ||
        w.actors.some(
          (a) => Math.hypot(a.position.x - p.x, a.position.y - p.y) < 2,
        )
      )
        continue;
      return p;
    }
  throw new Error(`No free ${ground} ground.`);
}
function object(o: Partial<V7Object> & { id: string; kind: string }): V7Object {
  return {
    name: o.kind,
    spatial: {
      x: 0,
      y: 0,
      angle: 0,
      shape: { kind: 'circle', radius: 0.2 },
      solid: false,
      interaction: 0.65,
      entrances: [],
    },
    visual: {
      component: 'ground-stack',
      color: '#000000',
      accent: '#000000',
      label: o.kind,
      state: 'ready',
    },
    data: {},
    createdBy: null,
    createdAt: 0,
    revision: 'foundation-forest@1',
    ...o,
  };
}
/** Ivo sleeps the given rounds from the given energy by repeating start. */
function slept(rounds: number, energy = 20, duration = rounds) {
  let w = setup({ energy });
  for (let i = 0; i < rounds; i++) {
    const r = step(w, { ivo: start(duration) });
    expect(r.outcomes.ivo?.success).toBe(true);
    w = with_(r.world);
  }
  return w;
}

describe('sleep in place in ex22', () => {
  it('is scoped to ex22, fits the size limit, is learned in one round and leaves other packages byte-identical', () => {
    const other = initialLongWorld('long-ex20', 'long-culture-v2');
    expect(continuousRegistry(other).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(other, continuousRegistry(), `${id}@1`)).toThrow(
      /not approved/,
    );
    const g = genesis();
    // No sleep operation existed before: the catalogue had rest and wait only.
    expect(g.abilities.filter((a) => /sleep/i.test(JSON.stringify(a)))).toEqual(
      [],
    );
    const pkg = V7_PACKAGES.find((p) => p.id === id);
    const ability = pkg?.abilities[0];
    if (!pkg || !ability) throw new Error('Missing package.');
    expect(V7_PACKAGES.filter((p) => p.scope === 'long-ex22').at(-1)).toBe(pkg);
    expect(pkg.scope).toBe('long-ex22');
    expect(pkg.dependencies).toEqual(['foundation-open@1']);
    expect(pkg.visualComponents).toEqual([]);
    expect(pkg.satisfaction).toEqual([]);
    expect(pkg.resources).toEqual([]);
    expect(Object.keys(pkg.handlers)).toEqual(['long.sleep-in-place']);
    expect(ability).toMatchObject({
      id,
      learning: 1,
      revision: `${id}@1`,
      authored: false,
      references: {},
      practiceEvidence: 'sleep-woken',
      equivalence: 'body:sleep:rest-recovery-interval:1',
    });
    expect(ability.parameters.properties?.target).toBeUndefined();
    expect(ability.parameters.properties?.mode).toMatchObject({
      enum: ['start', 'continue', 'wake', 'cancel', 'status'],
    });
    const handlers = V7_PACKAGES.flatMap((p) => Object.keys(p.handlers));
    expect(handlers.filter((h) => h === 'long.sleep-in-place')).toHaveLength(1);
    const equivalences = V7_PACKAGES.flatMap((p) =>
      p.abilities.map((a) => a.equivalence),
    );
    expect(equivalences.filter((e) => e === ability.equivalence)).toHaveLength(
      1,
    );
    for (const p of V7_PACKAGES.filter((p) => p !== pkg))
      expect(p.events ?? []).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/^sleep-/)]),
      );
    const limit = g.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg.abilities,
      events: pkg.events,
    });
    expect(visible).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    for (const [pid, hash] of Object.entries(BEFORE)) {
      const p = V7_PACKAGES.find((x) => x.id === pid);
      expect(createHash('sha256').update(JSON.stringify(p)).digest('hex')).toBe(
        hash,
      );
    }
    // Unstudied use is refused at no cost; one study round masters it.
    const f = setup({ study: false, energy: 30 });
    expect(unchanged(f, start())).toMatch(/master/i);
    const w = step(f, {
      ivo: { interface: 'learn', args: { ability: id } },
    }).world;
    expect(actor(w).mastered).toContain(id);
    expect(events(w, 'mastered').at(-1)?.data).toEqual({ ability: id });
  });

  it('the rest finding: rest at the cap recovers 0; below it the base 4 or the actual modified amount', () => {
    const w = setup();
    const rest = w.abilities.find((a) => a.id === 'rest');
    expect(rest).toMatchObject({
      handler: 'forest.rest',
      revision: 'foundation-forest@1',
    });
    const rested = (energy: number, mental = 0) => {
      const r = step(with_(w, { energy, mental }), { ivo: REST }).world;
      return {
        energy: actor(r).vitals.energy,
        data: data(r, 'rested'),
        recent: actor(r).experience?.recent.at(-1),
      };
    };
    // Resting at the cap of 40 is correctly worth nothing: the recorded zero is not a fault.
    const capped = rested(40);
    expect(capped.energy).toBe(40);
    expect(capped.data).toMatchObject({
      recovered: 0,
      nominal: 4,
      mentalFactor: 1,
    });
    expect(capped.recent).toMatchObject({
      action: 'rest',
      energy: 40,
      recovery: 0,
    });
    expect(rested(30).energy).toBe(34);
    expect(rested(30).data).toMatchObject({ recovered: 4, nominal: 4 });
    expect(rested(37.5).energy).toBe(40);
    // The mood rest factor (1 + mental x 0.1 above neutral) modifies the base.
    expect(rested(30, 0.5).energy).toBeCloseTo(34.2, 8);
    expect(rested(30, 0.5).data?.mentalFactor).toBeCloseTo(1.05, 8);
  });

  it('a slept interval recovers exactly what rest recovers in the same state, and zero at the cap', () => {
    const w = setup();
    for (const [energy, mental] of [
      [30, 0],
      [33.24426694, 0.0105],
      [37.5, 0],
      [30, 0.5],
      [40, 0],
    ] as const) {
      const from = with_(w, { energy, mental });
      const rest = step(from, { ivo: REST }).world,
        sleep = step(from, { ivo: start() });
      expect(sleep.outcomes.ivo?.success).toBe(true);
      expect(actor(sleep.world).vitals).toEqual(actor(rest).vitals);
      expect(data(sleep.world, 'rested')).toEqual(data(rest, 'rested'));
      expect(events(sleep.world, 'rested')).toHaveLength(1);
      const j = work(sleep.world);
      const e = j.intervals[0];
      expect(e).toMatchObject({
        n: 1,
        slept: true,
        energyBefore: energy,
        credit: Number(data(rest, 'rested')?.recovered),
        cap: 40,
        nominal: 4,
        unmet: [],
      });
      expect(actor(sleep.world).experience?.recent.at(-1)?.recovery).toBe(
        e?.credit,
      );
      if (energy === 40) {
        expect(e).toMatchObject({
          credit: 0,
          capped: true,
          result: 'no credit: already at the energy cap',
        });
        expect(
          actor(sleep.world).memory.knowledge?.[`${id}:energy-recovery:at-cap`]
            ?.value,
        ).toMatchObject({ credit: 0, energyBefore: 40 });
      } else expect(e?.credit).toBeGreaterThan(0);
      // Duration 1 wakes at the end of its only interval.
      expect(j).toMatchObject({
        status: 'completed',
        phase: 'woken',
        posture: 'up',
        completedWork: 1,
        paidEnergy: 0,
      });
    }
  });

  it('never recovers twice: one rest run per slept round, equal to resting each round', () => {
    const rounds = 3;
    const asleep = slept(rounds, 20, rounds);
    let rested = setup({ energy: 20 });
    for (let i = 0; i < rounds; i++)
      rested = with_(step(rested, { ivo: REST }).world);
    expect(actor(asleep).vitals.energy).toBe(actor(rested).vitals.energy);
    expect(actor(asleep).vitals.energy).toBe(32);
    const j = work(asleep);
    expect(j).toMatchObject({ status: 'completed', completedWork: 3 });
    expect(j.intervals.map((e) => e.credit)).toEqual([4, 4, 4]);
    expect(j.intervals.map((e) => e.tick)).toEqual([2, 3, 4]);
    expect(
      actor(asleep)
        .experience?.recent.slice(-3)
        .map((r) => [r.action, r.recovery]),
    ).toEqual([
      [id, 4],
      [id, 4],
      [id, 4],
    ]);
    // Called twice in one round, the second recovery is refused.
    const w = setup({ energy: 20 });
    const registry = continuousRegistry(w);
    const run = registry.handlers['long.sleep-in-place'];
    if (!run) throw new Error('Missing handler.');
    const trial = v7Clone(w);
    trial.tick += 1;
    trial.time += trial.config.dt;
    const ivo = actor(trial);
    const context = (action: V7Action): V7ActionContext => ({
      world: trial,
      actor: ivo,
      action,
      work: { remaining: 1e9, spend: () => undefined },
      emit: (
        type: string,
        description: string,
        d: V7Data = {},
        target: string | null = null,
      ) => {
        trial.events.push({
          id: `test-${String(trial.events.length)}`,
          tick: trial.tick,
          actor: 'ivo',
          type,
          interface: id,
          success: true,
          description,
          position: { ...ivo.position },
          target,
          data: d,
        });
      },
      operation: { first: true, elapsed: 0, startedAt: trial.tick },
    });
    expect(run(context(start(3))).complete).toBe(false);
    expect(ivo.vitals.energy).toBe(24);
    expect(() => run(context(act('continue')))).toThrow(
      /already ran the rest recovery/,
    );
    expect(ivo.vitals.energy).toBe(24);
  });

  it('refuses entry at no cost and names each unmet condition', () => {
    const w = setup({ energy: 30 });
    const ivo = actor(w);
    // Wet bank: no firm support.
    const bank = with_(w);
    actor(bank).position = spot(bank, ',');
    expect(unchanged(bank, start())).toMatch(
      /wet bank where you lie is not firm, dry ground.*bedding is not represented/,
    );
    // An active waterlogging hazard: lost support and a hazard area.
    const soaked = with_(w);
    soaked.config.development?.hazards.push({
      id: 'test-waterlogging',
      kind: 'waterlogging',
      x: ivo.position.x,
      y: ivo.position.y,
      radius: 3,
      start: -40,
      duration: 100,
      recovery: 10,
      severity: 0.8,
    });
    const why = unchanged(soaked, start());
    expect(why).toMatch(/not firm, dry ground/);
    expect(why).toMatch(/inside the active hazard area test-waterlogging/);
    // A drought hazard alone leaves the ground firm but is still a hazard area.
    const dry = with_(w);
    dry.config.development?.hazards.push({
      id: 'test-drought',
      kind: 'drought',
      x: ivo.position.x,
      y: ivo.position.y,
      radius: 3,
      start: -40,
      duration: 100,
      recovery: 10,
      severity: 0.65,
    });
    expect(unchanged(dry, start())).toMatch(
      /^You cannot lie down to sleep here now: you lie inside the active hazard area test-drought/,
    );
    // A plant under the body occupies the ground.
    const plant = with_(w);
    actor(plant).position = { x: 15.4, y: 14.55 };
    expect(unchanged(plant, start())).toMatch(
      /ground under your body is taken by start-1-nuts/,
    );
    // A burning bed reaching the body.
    const fire = with_(w);
    fire.objects.push(
      object({
        id: 'test-burning-bed',
        kind: 'test-bed',
        spatial: {
          x: ivo.position.x + 0.3,
          y: ivo.position.y,
          angle: 0,
          shape: { kind: 'circle', radius: 0.2 },
          solid: false,
          interaction: 0.65,
          entrances: [],
        },
        data: { burnFraction: 0.5 },
      }),
    );
    const flames = unchanged(fire, start());
    expect(flames).toMatch(
      /the burning bed test-burning-bed reaches your body/,
    );
    // Cold and heat: body temperature, not air, against the comfort band.
    const air = forestClimate(w, ivo.position).temperature;
    expect(air).toBeGreaterThan(16);
    const cold = unchanged(with_(w, { temperature: 12 }), start());
    expect(cold).toMatch(
      /body temperature 12 now and 12\.\d+ after this round in air at .* falls below the comfort band 16-27: bedding or shelter that cuts cold loss/,
    );
    expect(unchanged(with_(w, { temperature: 30 }), start())).toMatch(
      /rises above the comfort band 16-27: a cooler or buffered place is needed/,
    );
    // A wolf in view.
    const wolf = with_(w);
    const animal = wolf.objects.find((o) => o.id === 'wolf-40-18');
    if (!animal) throw new Error('Missing wolf.');
    animal.spatial.x = ivo.position.x + 2;
    animal.spatial.y = ivo.position.y;
    expect(unchanged(wolf, start())).toMatch(
      /a wolf \(wolf-40-18\) 2 away is in view, and wolves and boars can attack/,
    );
    // Every reason is also reported by status, which costs nothing and changes no sleep state.
    const looked = step(with_(w, { temperature: 12 }), { ivo: act('status') });
    expect(looked.outcomes.ivo?.success).toBe(true);
    const report = data(looked.world, 'sleep-status');
    expect(report?.phase).toBe('awake');
    expect(report?.posture).toBeNull();
    const checks = report?.checks as { condition: string; met: boolean }[];
    expect(checks.map((c) => c.condition)).toEqual([
      'alive',
      'support',
      'unoccupied',
      'hazard',
      'fire',
      'exposure',
      'threat',
    ]);
    expect(checks.filter((c) => !c.met).map((c) => c.condition)).toEqual([
      'exposure',
    ]);
    expect(works(looked.world)).toEqual([]);
  });

  it('status reports the state and every interval record, and costs nothing', () => {
    const w = setup({ energy: 30 });
    const idle = step(w).world;
    const none = step(w, { ivo: act('status') });
    expect(actor(none.world).vitals).toEqual(actor(idle).vitals);
    expect(none.outcomes.ivo?.reason).toBe(
      'Awake, with no sleep record. Every sleep check is met now.',
    );
    let s = slept(2, 30, 2);
    const r = step(s, { ivo: act('status') });
    s = r.world;
    const report = data(s, 'sleep-status');
    expect(report).toMatchObject({
      phase: 'woken',
      posture: 'up',
      slept: 2,
      requested: 2,
    });
    const intervals = report?.intervals as Interval[];
    expect(intervals).toHaveLength(2);
    for (const e of intervals)
      expect(e).toMatchObject({
        slept: true,
        credit: 4,
        otherDebits: 0,
        net: 4,
        satietyChange: -0.9,
        healthChange: 0,
        outcome: 'net gain',
        settled: 'measured',
      });
    expect(intervals.map((e) => [e.energyBefore, e.energyAfter])).toEqual([
      [30, 34],
      [34, 38],
    ]);
    expect(events(s, 'sleep-recovery-measured')).toHaveLength(1);
    // Status while asleep is awake time: it pauses the sleep and runs no recovery.
    let a = setup({ energy: 20 });
    a = with_(step(a, { ivo: start(4) }).world);
    const looked = step(a, { ivo: act('status') }).world;
    expect(events(looked, 'rested')).toHaveLength(0);
    expect(work(looked)).toMatchObject({
      status: 'paused',
      phase: 'paused',
      completedWork: 1,
      reason: 'Woke: awake to check status.',
    });
    expect(actor(looked).vitals.energy).toBe(24);
  });

  it('wake and cancel end a sleep at no cost and keep what was slept', () => {
    for (const mode of ['wake', 'cancel']) {
      let w = setup({ energy: 20 });
      w = with_(step(w, { ivo: start(5) }).world);
      expect(work(w)).toMatchObject({
        status: 'active',
        phase: 'asleep',
        posture: 'lying',
      });
      const before = actor(w).vitals.energy;
      const idle = step(w).world;
      const r = step(w, { ivo: act(mode) });
      expect(r.outcomes.ivo?.success).toBe(true);
      expect(actor(r.world).vitals.energy).toBe(before);
      expect(actor(r.world).vitals.energy).toBe(actor(idle).vitals.energy);
      expect(work(r.world)).toMatchObject({
        status: 'stopped',
        phase: 'woken',
        posture: 'up',
        completedWork: 1,
        remainingWork: 4,
      });
      expect(events(r.world, 'sleep-woken').at(-1)?.description).toMatch(
        /Woke on request.*1 of 5 interval\(s\) slept.*nothing is refunded/,
      );
      expect(actor(r.world).extensionState[`long:view:${id}`]).toMatchObject({
        posture: 'up',
        phase: 'woken',
        slept: 1,
      });
      expect(unchanged(with_(r.world), act(mode))).toMatch(
        /You are not asleep/,
      );
    }
  });

  it('an interruption keeps completed intervals; continue lies down again after fresh checks', () => {
    let w = setup({ energy: 20 });
    w = with_(step(w, { ivo: start(3) }).world);
    // A round spent on another action wakes the sleeper, who still lies there.
    w = with_(step(w, { ivo: WAIT }).world);
    expect(work(w)).toMatchObject({
      status: 'paused',
      phase: 'paused',
      posture: 'lying',
      completedWork: 1,
    });
    expect(events(w, 'sleep-interrupted').at(-1)?.description).toMatch(
      /this round was not slept/,
    );
    expect(events(w, 'rested')).toHaveLength(0);
    expect(actor(w).vitals.energy).toBe(24);
    // start does not reopen it; continue does, with a new entry.
    expect(unchanged(w, start(3))).toMatch(/was interrupted.*give continue/);
    let r = step(w, { ivo: act('continue') });
    expect(r.outcomes.ivo?.success).toBe(true);
    expect(data(r.world, 'sleep-entered')?.entries).toEqual([
      { tick: 2, resumed: false },
      { tick: 4, resumed: true },
    ]);
    w = with_(r.world);
    r = step(w, { ivo: act('continue') });
    w = with_(r.world);
    expect(work(w)).toMatchObject({ status: 'completed', completedWork: 3 });
    expect(work(w).intervals.map((e) => e.tick)).toEqual([2, 4, 5]);
    expect(actor(w).vitals.energy).toBe(32);
    // A failed recheck at a later interval is a blocked round: no recovery, and the sleep pauses.
    let c = setup({ energy: 20 });
    c = with_(step(c, { ivo: start(3) }).world);
    const cold = step(with_(c, { temperature: 12 }), { ivo: start(3) }).world;
    expect(events(cold, 'rested')).toHaveLength(0);
    const blocked = work(cold).intervals.at(-1);
    expect(blocked).toMatchObject({ slept: false, credit: 0, n: null });
    expect(blocked?.unmet.join(' ')).toMatch(/below the comfort band/);
    expect(work(cold)).toMatchObject({ status: 'paused', completedWork: 1 });
    // Fresh checks still fail, so continue is refused at no cost.
    expect(
      unchanged(with_(cold, { temperature: 12 }), act('continue')),
    ).toMatch(/cannot lie down to sleep again here now: body temperature/);
    // Walking away from an interrupted sleep ends it.
    const moved = step(with_(cold), {
      ivo: { interface: 'navigate', args: { target: '', x: 16.5, y: 13.09 } },
    }).world;
    expect(work(moved)).toMatchObject({ status: 'stopped', phase: 'woken' });
    expect(events(moved, 'sleep-woken').at(-1)?.description).toMatch(
      /left the place/,
    );
  });

  it('after the environment, a wolf coming into view or an injury wakes the sleeper', () => {
    const pkg = V7_PACKAGES.find((p) => p.id === id);
    let w = setup({ energy: 20 });
    w = step(w, { ivo: start(3) }).world;
    expect(work(w).status).toBe('active');
    const wolf = v7Clone(w);
    const animal = wolf.objects.find((o) => o.id === 'wolf-40-18');
    if (!animal) throw new Error('Missing wolf.');
    animal.spatial.x = actor(wolf).position.x + 3;
    animal.spatial.y = actor(wolf).position.y;
    pkg?.afterEnvironment?.(wolf);
    expect(work(wolf)).toMatchObject({ status: 'paused', completedWork: 1 });
    expect(work(wolf).interruptions.at(-1)?.reasons.join(' ')).toMatch(
      /a wolf \(wolf-40-18\) 3 away is in view/,
    );
    const hurt = v7Clone(w);
    actor(hurt).vitals.health = 92;
    hurt.events.push({
      id: 'test-injury',
      tick: hurt.tick,
      actor: 'ivo',
      type: 'injured',
      interface: null,
      success: true,
      description: 'A threatened or hungry animal injured a nearby actor.',
      position: { ...actor(hurt).position },
      target: 'boar-32-23',
      data: { cause: 'boar', before: 100, after: 92 },
    });
    pkg?.afterEnvironment?.(hurt);
    expect(work(hurt).interruptions.at(-1)?.reasons).toEqual(['injured']);
    // Undisturbed, the same check keeps the sleep going.
    const calm = v7Clone(w);
    pkg?.afterEnvironment?.(calm);
    expect(work(calm).status).toBe('active');
  });

  it('death ends an open sleep; no recovery follows', () => {
    let w = setup({ energy: 20 });
    const ivo = actor(w);
    ivo.vitals.satiety = 0;
    ivo.vitals.health = 5;
    const r = step(w, { ivo: start(3) });
    w = r.world;
    expect(events(w, 'died')).toHaveLength(1);
    expect(events(w, 'respawned')).toHaveLength(1);
    const j = work(w);
    expect(j).toMatchObject({
      status: 'ended',
      phase: 'ended',
      posture: null,
      completedWork: 1,
      endedAt: 2,
    });
    // The interval's recovery ran before death and is settled from the body at death.
    expect(j.intervals[0]).toMatchObject({
      credit: 4,
      energyAfter: 24,
      healthChange: -5,
      settled: 'measured',
    });
    expect(events(w, 'sleep-ended').at(-1)?.description).toMatch(
      /Sleep ended by death after 1 slept interval/,
    );
    const next = step(with_(w), { ivo: act('continue') });
    expect(next.outcomes.ivo?.success).toBe(false);
    expect(events(next.world, 'rested')).toHaveLength(0);
    expect(work(next.world).intervals).toHaveLength(1);
  });

  it('adds no reward, satisfaction, practice or routine relief, and shows lying only after entry', () => {
    // Failed entry and status show no lying sleeper.
    const w = setup({ energy: 20 });
    const failed = step(with_(w, { temperature: 12 }), { ivo: start(2) }).world;
    expect(actor(failed).extensionState[`long:view:${id}`]).toBeUndefined();
    const entered = step(w, { ivo: start(2) }).world;
    expect(data(entered, 'sleep-entered')?.view).toMatchObject({
      component: null,
      operation: id,
      actor: 'ivo',
      posture: 'lying',
      phase: 'asleep',
      support: 'ground:15:13',
      ground: 'meadow ground',
      badge: null,
    });
    expect(data(entered, 'sleep-interval-completed')?.view).toMatchObject({
      lastCredit: 4,
      lastNet: null,
    });
    // Sleeping counts as the same subsistence routine as resting, without a prior finding.
    const quiet = with_(w);
    const me = actor(quiet);
    me.extensionState['long:lastProgress'] = -1000;
    me.memory.knowledge = {
      ...me.memory.knowledge,
      [`${id}:energy-recovery:credited`]: {
        key: `${id}:energy-recovery:credited`,
        subject: 'sleep',
        property: 'energy added by one slept round (the rest recovery)',
        value: { work: 'earlier' },
        method: 'one slept round; own energy read before and after',
        condition: 'earlier',
        verified: true,
        tick: 0,
        evidence: '',
      },
    };
    const sleeping = step(quiet, { ivo: start(2) }).world,
      resting = step(quiet, { ivo: REST }).world;
    const routine = (x: V7World) =>
      (actor(x).extensionState['open:routine'] as boolean[]).at(-1);
    expect(routine(resting)).toBe(true);
    expect(routine(sleeping)).toBe(routine(resting));
    expect(actor(sleeping).extensionState['long:lastProgress']).toBe(-1000);
    expect(actor(sleeping).experience?.mental).toBe(
      actor(resting).experience?.mental,
    );
    expect(actor(sleeping).wellbeing).toEqual(actor(resting).wellbeing);
    for (const world of [entered, sleeping])
      for (const type of [
        'satisfaction',
        'practice-confirmed',
        'satisfaction-maintained',
      ])
        expect(events(world, type)).toEqual([]);
    expect(
      entered.events
        .filter((e) => e.data.qualified === true)
        .map((e) => e.type),
    ).toEqual(['information-confirmed']);
    expect(actor(entered).wellbeing.sources).toEqual([]);
  });
});
