import { describe, expect, it, vi } from 'vitest';
import {
  continuousRegistry,
  v7Clone,
  v7Distance,
  v7Install,
  v7ShapeDistance,
  v7Signature,
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

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 90_000 });

const id = 'shell-compression-opening';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** Ivo's actual ex19 hazelnut source, a weathered stone outcrop (stone, hardness 8,
 * flexibility 0) used as a support, a fallen-branch heap (branch, hardness 3, flexibility 2)
 * and a walnut source (hardness 5). */
const NUTS = 'start-1-nuts';
const ROCK = 'start-1-stone';
const BRANCHES = 'forest-branch-0';
const WALNUTS = 'forest-walnut-0';
const BERRIES = 'commons-berry-0-0';
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition/i;

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
const data = (w: V7World, type: string) =>
  events(w, type).at(-1)?.data as Record<string, unknown> | undefined;
const stack = (w: V7World, item: string): V7Stack => {
  const s = w.stacks.find((s) => s.id === item);
  if (!s) throw new Error(`Missing stack ${item}.`);
  return s;
};
const total = (w: V7World, resource: string) =>
  w.stacks
    .filter((s) => s.resource === resource)
    .reduce((n, s) => n + Math.round(s.quantity * 10), 0) / 10;
const shell = (s: V7Stack | undefined) =>
  s?.processing?.shellCompression as V7Data | undefined;
const act = (mode: string, extra: V7Action['args'] = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});
type Job = {
  id: string;
  owner: string;
  status: string;
  paidEnergy: number;
  escrow: string[];
  outputs: string[];
  outcome?: string;
  load?: number;
};
const jobs = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Job);
/** Keep everyone fed and rested so the tests isolate the operation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
/** A free standing point for `who` at distance d from (x, y). */
function free(w: V7World, x: number, y: number, d: number, who: string) {
  for (let k = 0; k < 16; k++) {
    const p = {
      x: x + d * Math.cos((k * Math.PI) / 8),
      y: y + d * Math.sin((k * Math.PI) / 8),
    };
    if (
      w.objects.every(
        (o) => !o.spatial.solid || v7ShapeDistance(p, o.spatial) > 0.25,
      ) &&
      w.actors.every((a) => a.id === who || v7Distance(a.position, p) > 0.5)
    )
      return p;
  }
  throw new Error('No free fixture position.');
}
/** Stand within reach of an object (shape distance 0.45). */
function near(w: V7World, object: string, who = 'ivo') {
  const o = w.objects.find((x) => x.id === object);
  if (!o) throw new Error('Missing fixture object.');
  const r = o.spatial.shape.kind === 'circle' ? o.spatial.shape.radius : 0.3;
  actor(w, who).position = free(w, o.spatial.x, o.spatial.y, r + 0.45, who);
  return w;
}
function gather(w: V7World, source: string, quantity = 1, who = 'ivo') {
  near(w, source, who);
  const r = step(w, {
    [who]: { interface: 'gather', args: { target: source, quantity } },
  });
  expect(r.outcomes[who]?.success).toBe(true);
  const item = r.world.events.find(
    (e) => e.type === 'gathered' && e.actor === who,
  )?.data.item;
  if (typeof item !== 'string') throw new Error('Missing gathered item.');
  return { w: fed(r.world), item };
}
function genesis() {
  return initialLongWorld('long-ex19', 'long-culture-v2-oldgoal', {
    seed: 20261201,
    development: 8,
    tokens: 1500000,
  });
}
function installed() {
  const g = genesis();
  return fed(v7Clone(v7Install(g, continuousRegistry(g), `${id}@1`)));
}
/** The action fails and changes no vitals, stacks, objects or state compared with waiting. */
function unchanged(w: V7World, action: V7Action, who = 'ivo') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  expect(v7Signature(result.world.state)).toBe(v7Signature(idle.state));
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action, who = 'ivo') {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.reason ?? '').not.toMatch(/Nothing was spent/);
  expect(r.outcomes[who]?.success).toBe(true);
  return {
    world: r.world,
    idle,
    energy: actor(idle, who).vitals.energy - actor(r.world, who).vitals.energy,
  };
}

type Fixture = {
  w: V7World;
  nuts: string;
  stone: string;
  second: string;
  branch: string;
  walnut: string;
  berry: string;
};
let base: Fixture | null = null;
/** Ivo studies two rounds, gathers two hazelnuts in one stack (as in ex19), two stones, a
 * branch, a walnut and a berry, and stands beside the stone outcrop. */
function setup(): Fixture {
  if (!base) {
    let w = installed();
    w = step(w, { ivo: { interface: 'learn', args: { ability: id } } }).world;
    w = step(fed(w)).world;
    expect(actor(w).mastered).toContain(id);
    const n = gather(fed(w), NUTS, 2);
    const s = gather(n.w, ROCK);
    const t = gather(s.w, ROCK);
    const b = gather(t.w, 'start-1-branches');
    const k = gather(b.w, WALNUTS);
    const r = gather(k.w, BERRIES);
    base = {
      w: near(r.w, ROCK),
      nuts: n.item,
      stone: s.item,
      second: t.item,
      branch: b.item,
      walnut: k.item,
      berry: r.item,
    };
  }
  return { ...base, w: v7Clone(base.w) };
}

describe('shell compression opening in ex19', () => {
  it('is scoped to ex19, fits the text limit, adds no reward and needs two paid rounds of study', () => {
    for (const [scope, scenario] of [
      ['long-ex18', 'long-culture-v2-incentives'],
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
    // All packages together still register: handler ids stay unique, and ex17's package is
    // untouched beside this one.
    const all = continuousRegistry();
    expect(all.handlers[`long.${id}`]).toBeDefined();
    expect(all.handlers['long.mechanical-food-handling']).toBeDefined();
    const w = installed();
    const pkg = continuousRegistry(w).packages.find((p) => p.id === id);
    expect(pkg?.scope).toBe('long-ex19');
    expect(pkg?.dependencies).toEqual(['foundation-open@1']);
    const ability = w.abilities.find((a) => a.id === id);
    expect(ability?.learning).toBe(2);
    expect(ability?.learningEnergy).toBe(0.5);
    expect(ability?.revision).toBe(`${id}@1`);
    expect(ability?.equivalence).toBe('food:shell:compression-open-inspect:1');
    expect(ability?.parameters.properties?.mode).toMatchObject({
      enum: ['open', 'inspect', 'separate'],
    });
    expect(ability?.references).toEqual({
      inputStackId: 'optional-exact-visible',
      supportId: 'optional-exact-visible',
    });
    const limit = w.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    for (const a of pkg?.abilities ?? [])
      expect(JSON.stringify(a).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg?.abilities,
      events: pkg?.events,
      satisfaction: pkg?.satisfaction.map((r) => r.name),
    });
    expect(visible).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    expect(pkg?.visualComponents).toEqual([]);
    expect(pkg?.satisfaction).toEqual([]);
    expect(w.config.longDevelopment?.culture?.incentives).toBe(false);
    // Unstudied use is refused without any cost.
    expect(unchanged(w, act('inspect', { inputStackId: 'x' }))).not.toBe('');
    let now = w;
    for (let i = 0; i < 2; i++) {
      const cur = fed(now),
        idle = v7Clone(cur);
      actor(idle).learning = null;
      const r = step(
        cur,
        i === 0 ? { ivo: { interface: 'learn', args: { ability: id } } } : {},
      );
      const rest = step(idle).world;
      expect(
        actor(rest).vitals.energy - actor(r.world).vitals.energy,
      ).toBeCloseTo(0.5, 8);
      now = r.world;
      if (i === 0) expect(actor(now).mastered).not.toContain(id);
    }
    expect(actor(now).mastered).toContain(id);
  });

  it('opens one hazelnut of an owned stack between a carried stone and a rock outcrop for 1 energy, conserving the sample', () => {
    const f = setup();
    const nuts = v7Clone(stack(f.w, f.nuts));
    expect(nuts).toMatchObject({ resource: 'hazelnut', quantity: 2 });
    const stone = v7Clone(stack(f.w, f.stone));
    const rock = v7Clone(f.w.objects.find((o) => o.id === ROCK));
    const pressed = cost(
      f.w,
      act('open', {
        inputStackId: f.nuts,
        pressureToolIds: [f.stone],
        supportId: ROCK,
      }),
    );
    // One round and 1 energy for one controlled compression.
    expect(pressed.energy).toBeCloseTo(1, 8);
    const w = pressed.world;
    const [j] = jobs(w);
    expect(j).toMatchObject({
      owner: 'ivo',
      status: 'completed',
      paidEnergy: 1,
      escrow: [],
      outcome: 'split open',
      // Both surfaces are stone (strength 0.8, flexibility 0): load 0.8 against the
      // hazelnut's strength 0.4 adds damage (0.8 - 0.4) / 0.4 = 1, which opens it.
      load: 0.8,
    });
    const unit = stack(w, j?.outputs[0] ?? '');
    expect(unit.id).not.toBe(f.nuts);
    expect(unit).toMatchObject({
      resource: 'hazelnut',
      quantity: 1,
      owner: 'ivo',
      origin: NUTS,
      harvestedAt: nuts.harvestedAt,
    });
    expect(unit.reservedFor).toBeUndefined();
    expect(shell(unit)).toMatchObject({
      outer: 'split open',
      interior: 'exposed',
      damage: 1,
      attempts: 1,
      lastLoad: 0.8,
      parents: [f.nuts],
      openedBy: 'ivo',
      ledger: { parts: 'not represented', detached: 0, scattered: 0 },
    });
    // The rest of the stack is unchanged, and the worked unit ages with it.
    const rest = stack(w, f.nuts);
    expect(rest.quantity).toBe(1);
    expect(rest.processing).toBeUndefined();
    expect(unit.decay).toBe(rest.decay);
    // Conservation: no hazelnut is created or lost and nothing else changes.
    expect(total(w, 'hazelnut')).toBe(2);
    expect(stack(w, f.stone)).toEqual(stone);
    expect(w.objects.find((o) => o.id === ROCK)).toEqual(rock);
    expect(w.stacks.length).toBe(pressed.idle.stacks.length + 1);
    // Observable events with reusable view metadata; nothing shows edibility or safety.
    expect(events(w, 'process-progress')).toHaveLength(1);
    expect(events(w, 'shell-compression-attempted')).toHaveLength(1);
    expect(events(w, 'shell-compression-opened')).toHaveLength(1);
    expect(events(w, 'shell-compression-cracked')).toHaveLength(0);
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(events(w, 'information-confirmed')).toHaveLength(0);
    expect(data(w, 'shell-compression-opened')).toMatchObject({
      unit: unit.id,
      parent: f.nuts,
      load: 0.8,
      strength: 0.4,
      outcome: 'split open',
      energy: 1,
      view: {
        sample: unit.id,
        pressureTools: [f.stone],
        support: ROCK,
        shell: 'open',
        contents: 'exposed, not separated',
        contentPile: null,
        debris: 0,
        badge: null,
      },
    });
    expect(
      actor(w).memory.knowledge?.['hazelnut:compression:stone+stone:opened'],
    ).toMatchObject({ verified: false });
    const said = JSON.stringify(
      w.events.filter((e) => e.type.startsWith('shell-compression-')),
    );
    expect(said).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(said).not.toMatch(EXTRA_EXCLUDED);
    // An opened unit is not opened again, and no contents can be separated.
    expect(
      unchanged(
        fed(w),
        act('open', {
          inputStackId: unit.id,
          pressureToolIds: [f.stone],
          supportId: ROCK,
        }),
      ),
    ).toMatch(/already open/);
    expect(
      unchanged(fed(w), act('separate', { inputStackId: unit.id })),
    ).toMatch(/not represented as separate parts/);
  });

  it('holds under a fallen-branch support, which passes too little load: only the energy is spent', () => {
    const f = setup();
    const w0 = near(f.w, BRANCHES);
    const pressed = cost(
      w0,
      act('open', {
        inputStackId: f.nuts,
        pressureToolIds: [f.stone],
        supportId: BRANCHES,
      }),
    );
    expect(pressed.energy).toBeCloseTo(1, 8);
    const w = pressed.world;
    // Branch: strength 0.3 x (1 - 0.2) = 0.24, not above the hazelnut's 0.4.
    expect(jobs(w)[0]).toMatchObject({
      status: 'completed',
      outcome: 'held',
      load: 0.24,
      paidEnergy: 1,
    });
    expect(v7Signature(w.stacks)).toBe(v7Signature(pressed.idle.stacks));
    expect(data(w, 'shell-compression-attempted')).toMatchObject({
      outcome: 'held',
      load: 0.24,
      view: { shell: 'intact', stage: 'held' },
    });
    expect(events(w, 'shell-compression-opened')).toHaveLength(0);
    expect(events(w, 'shell-compression-cracked')).toHaveLength(0);
    // A carried branch piece as the upper surface holds the same way, on firm ground.
    const held = cost(
      fed(v7Clone(f.w)),
      act('open', {
        inputStackId: f.nuts,
        pressureToolIds: [f.branch, f.stone],
      }),
    );
    expect(jobs(held.world).at(-1)).toMatchObject({
      outcome: 'held',
      load: 0.24,
    });
  });

  it('cracks a walnut first and opens it on a second compression between two carried stones, keeping its identity', () => {
    const f = setup();
    const press = act('open', {
      inputStackId: f.walnut,
      pressureToolIds: [f.stone, f.second],
    });
    const first = cost(f.w, press);
    expect(first.energy).toBeCloseTo(1, 8);
    let w = first.world;
    // Walnut strength 0.5: (0.8 - 0.5) / 0.5 = 0.6 of damage, cracked but closed.
    expect(shell(stack(w, f.walnut))).toMatchObject({
      outer: 'cracked',
      interior: 'not exposed',
      damage: 0.6,
      attempts: 1,
      parents: [],
    });
    expect(events(w, 'shell-compression-cracked')).toHaveLength(1);
    expect(data(w, 'shell-compression-cracked')).toMatchObject({
      unit: f.walnut,
      crack: 0.6,
      view: { shell: 'cracked', contents: 'not visible' },
    });
    expect(total(w, 'walnut')).toBe(1);
    const second = cost(fed(w), press);
    expect(second.energy).toBeCloseTo(1, 8);
    w = second.world;
    expect(shell(stack(w, f.walnut))).toMatchObject({
      outer: 'split open',
      interior: 'exposed',
      damage: 1.2,
      attempts: 2,
    });
    expect(events(w, 'shell-compression-opened')).toHaveLength(1);
    expect(total(w, 'walnut')).toBe(1);
    expect(jobs(w)).toHaveLength(2);
  });

  it('inspects the visible state for 0.2 energy without establishing edibility', () => {
    const f = setup();
    const intact = cost(f.w, act('inspect', { inputStackId: f.nuts }));
    expect(intact.energy).toBeCloseTo(0.2, 8);
    expect(data(intact.world, 'shell-compression-inspected')).toMatchObject({
      unit: f.nuts,
      energy: 0.2,
      observation: {
        resource: 'hazelnut',
        quantity: 2,
        firmness: 'firm',
        outer: 'intact',
        crack: 0,
        opened: false,
        interior: 'not visible',
        interiorCondition: 'unknown',
        exterior: 'little observable deterioration',
        scattered: 0,
        safety: 'not established',
      },
    });
    expect(v7Signature(intact.world.stacks)).toBe(
      v7Signature(intact.idle.stacks),
    );
    let w = step(fed(intact.world), {
      ivo: act('open', {
        inputStackId: f.nuts,
        pressureToolIds: [f.stone],
        supportId: ROCK,
      }),
    }).world;
    const unit = jobs(w)[0]?.outputs[0] ?? '';
    const opened = cost(fed(w), act('inspect', { inputStackId: unit }));
    expect(opened.energy).toBeCloseTo(0.2, 8);
    w = opened.world;
    const seen = data(w, 'shell-compression-inspected')?.observation as V7Data;
    expect(seen).toMatchObject({
      outer: 'split open',
      crack: 1,
      opened: true,
      interior: 'exposed',
      interiorCondition: 'little observable deterioration',
      contents:
        'not represented as separate material; the unit is still one whole unit',
      recoverable: 1,
    });
    expect(seen.unknown).toEqual(
      expect.arrayContaining(['shell and kernel masses', 'yield', 'safety']),
    );
    expect(
      actor(w).memory.knowledge?.[`${unit}:shell-inspection`],
    ).toMatchObject({ verified: false });
    expect(events(w, 'information-confirmed')).toHaveLength(0);
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
  });

  it('refuses separation, unsuitable surfaces or samples, other people’s food, darkness and low energy before any cost', () => {
    const f = setup();
    const w = f.w;
    const open = (extra: V7Action['args']) =>
      act('open', { inputStackId: f.nuts, ...extra });
    expect(unchanged(w, act('separate', { inputStackId: f.nuts }))).toMatch(
      /not represented as separate parts/,
    );
    // Exactly two surfaces are needed.
    expect(unchanged(w, open({}))).toMatch(/exactly two pressure surfaces/);
    expect(unchanged(w, open({ pressureToolIds: [f.stone] }))).toMatch(
      /exactly two pressure surfaces/,
    );
    expect(
      unchanged(
        w,
        open({ pressureToolIds: [f.stone, f.second], supportId: ROCK }),
      ),
    ).toMatch(/exactly two pressure surfaces/);
    // Food is not a surface, and the sample cannot press itself.
    expect(
      unchanged(w, open({ pressureToolIds: [f.berry], supportId: ROCK })),
    ).toMatch(/is food/);
    expect(
      unchanged(w, open({ pressureToolIds: [f.nuts], supportId: ROCK })),
    ).toMatch(/is food/);
    // A plant is not a solid support, and the support must be in reach.
    const plant = near(v7Clone(w), NUTS);
    expect(
      unchanged(plant, open({ pressureToolIds: [f.stone], supportId: NUTS })),
    ).toMatch(/solid, unreserved object/);
    const away = near(v7Clone(w), BRANCHES);
    expect(
      unchanged(away, open({ pressureToolIds: [f.stone], supportId: ROCK })),
    ).not.toBe('');
    // A lower piece needs firm ground: not a wet bank.
    const bank = v7Clone(w);
    actor(bank).position = { x: 22.5, y: 1.5 };
    expect(
      unchanged(bank, open({ pressureToolIds: [f.stone, f.second] })),
    ).toMatch(/firm ordinary ground/);
    // Soft, partial or spoiled food is refused.
    expect(
      unchanged(
        w,
        act('open', {
          inputStackId: f.berry,
          pressureToolIds: [f.stone],
          supportId: ROCK,
        }),
      ),
    ).toMatch(/Soft food/);
    const partial = v7Clone(w);
    Object.assign(stack(partial, f.walnut), {
      quantity: 0.9,
      quantityTenths: 9,
    });
    expect(
      unchanged(
        partial,
        act('open', {
          inputStackId: f.walnut,
          pressureToolIds: [f.stone],
          supportId: ROCK,
        }),
      ),
    ).toMatch(/less than one whole unit/);
    const spoiled = v7Clone(w);
    stack(spoiled, f.nuts).decay = 900;
    expect(
      unchanged(spoiled, open({ pressureToolIds: [f.stone], supportId: ROCK })),
    ).toMatch(/Spoiled/);
    // Owner-only: Moss cannot press Ivo's hazelnuts, even with his own stone.
    const other = v7Clone(w);
    actor(other, 'moss').mastered.push(id);
    actor(other, 'moss').position = free(
      other,
      actor(other).position.x,
      actor(other).position.y,
      0.6,
      'moss',
    );
    expect(
      unchanged(
        other,
        act('open', {
          inputStackId: f.nuts,
          pressureToolIds: [f.stone],
          supportId: ROCK,
        }),
        'moss',
      ),
    ).not.toBe('');
    // Night: no daylight at this hour of the 80-round day.
    const night = v7Clone(w);
    night.tick = 50;
    night.time = 50;
    expect(
      unchanged(night, open({ pressureToolIds: [f.stone], supportId: ROCK })),
    ).toMatch(/too dark/);
    expect(unchanged(night, act('inspect', { inputStackId: f.nuts }))).toMatch(
      /too dark/,
    );
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.5;
    const r = step(tired, {
      ivo: open({ pressureToolIds: [f.stone], supportId: ROCK }),
    });
    expect(r.outcomes.ivo?.success).toBe(false);
    expect(r.outcomes.ivo?.reason).toMatch(/needs 1 energy/);
  });
});
