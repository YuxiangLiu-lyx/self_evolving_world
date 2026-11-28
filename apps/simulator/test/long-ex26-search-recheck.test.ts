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
  V7Point,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { longOrdinaryInput } from '../src/long-context.js';
import { IMPORT_EXCLUDED_WORDS } from '../src/long-import.js';
import { VILLAGES } from '../src/long-villages.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this limit.
vi.setConfig({ testTimeout: 180_000 });

const id = 'bounded-resource-search-recheck';
const REVISION = `${id}@1`;
/** The search it extends, installed first and unchanged. */
const BASE = 'bounded-resource-search';
const BASE_REVISION = `${BASE}@1`;
const PREFIX = 'search-recheck';
const OPEN = `${id}:work:open`;
const LAST = `${id}:last`;
const WAIT: V7Action = { interface: 'wait', args: {} };
const learn = (ability: string): V7Action => ({
  interface: 'learn',
  args: { ability },
});
/** The brief's agent-visible exclusions beyond the import list ("historical" included), and no
 * mention of the far group. */
const EXTRA_EXCLUDED = /histor|spiritual/i;
const MENTION = /villag|neighbo|meeting|middle|other group|stranger/i;
/** sha256 of JSON.stringify of the key-sorted map from id@version to the sha256 of
 * JSON.stringify of each of the 139 packages registered before this change (the scratch hash
 * file validation-results/scratch/ex26/hashes-before-7.json, taken before this change). */
const EXISTING_DIGEST =
  '4ce0a9fe9809cc185ac878cf4f48a396aa95b7fe9089f12c0e707769b9ea09d8';
/** bounded-resource-search@1 alone, from the same file: exporting its helpers changed nothing. */
const BASE_SHA =
  'bf6a210eab2b0bb9822f6dc915adb48c26a682aba5f2da93fb126984fed3769d';
const MAX_STEP = 0.8;

/** Lin's own berry bush, 1.89 from her start, holding 4 units. */
const LIN_BUSH = 'commons-berry-0-0';
/** Berry bushes Lin sees empty at her start, 2.39 and 3.83 away. */
const NEAR_EMPTY = 'forest-berry-1';
/** Moss's berry bush, 4.80 from Lin, holding 4 units. */
const MOSS_BUSH = 'commons-berry-1-0';
/** Lin's ordinary search inputs: berries within 4 of her, at most 4 distance, 16 rounds and 16
 * energy, keeping 4 energy, for up to 4 units. */
const LIN = {
  resource: 'berry',
  radius: 4,
  path: 4,
  time: 16,
  energy: 16,
  reserve: 4,
  quantity: 4,
};
/** Kai's inputs of the bounded-resource-search@1 tests, and his bushes there. */
const KAI = {
  resource: 'berry',
  radius: 4,
  path: 4,
  time: 16,
  energy: 16,
  reserve: 24,
  quantity: 4,
};
const LARDER = 'commons-berry-3-0';
const EAST: V7Action = {
  interface: 'navigate',
  args: { target: '', x: 21, y: 15 },
};

type Data = Record<string, unknown>;
type Round = ReturnType<typeof step>;
const sha = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const recheckPackage = (): V7Package => {
  const p = V7_PACKAGES.find((p) => p.id === id);
  if (!p) throw new Error('Missing package.');
  return p;
};
const search = (args: Data = {}, iface = id): V7Action => ({
  interface: iface,
  args: { mode: 'start', ...LIN, ...args },
});
const control = (mode: 'resume' | 'cancel', iface = id): V7Action => ({
  interface: iface,
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
const ok = (r: Round, who = 'lin') => {
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  return r.world;
};
const refused = (r: Round, pattern: RegExp, who = 'lin') => {
  expect(r.outcomes[who]?.success).toBe(false);
  expect(r.outcomes[who]?.reason).toMatch(pattern);
  expect(r.outcomes[who]?.reason).toMatch(/Nothing was spent\.$/);
  return r.world;
};
const actor = (w: V7World, who = 'lin'): V7Actor => {
  const a = w.actors.find((a) => a.id === who);
  if (!a) throw new Error(`Missing ${who}.`);
  return a;
};
const object = (w: V7World, oid: string): V7Object => {
  const o = w.objects.find((o) => o.id === oid);
  if (!o) throw new Error(`Missing ${oid}.`);
  return o;
};
const open = (w: V7World, who = 'lin') =>
  actor(w, who).extensionState[OPEN] as Data | undefined;
const last = (w: V7World, who = 'lin') =>
  actor(w, who).extensionState[LAST] as Data | undefined;
/** The person's events of this round made while running the search, in order. */
const types = (w: V7World, who = 'lin') =>
  w.events
    .filter((e) => e.actor === who && e.interface === id)
    .map((e) => e.type);
const mine = (w: V7World, type: string, who = 'lin') =>
  w.events.filter((e) => e.actor === who && e.type === `${PREFIX}-${type}`);
const view = (e: V7Event | undefined) => (e?.data.view ?? {}) as Data;
const berries = (w: V7World, who = 'lin') =>
  w.stacks
    .filter((s) => s.owner === who && s.resource === 'berry')
    .reduce((n, s) => n + s.quantity, 0);
const installed = () => {
  const g = initialLongWorld('long-ex26', 'long-culture-v2-villages');
  const base = v7Install(g, continuousRegistry(g), BASE_REVISION);
  return v7Clone(v7Install(base, continuousRegistry(base), REVISION));
};
/** The person studies in one round and masters the search. */
function learned(world?: V7World, who = 'lin') {
  const r = step(world ?? installed(), { [who]: learn(id) });
  const w = ok(r, who);
  expect(actor(w, who).mastered).toContain(id);
  return w;
}
/** Every berry source empty from genesis (so Lin remembers them empty); Lin learns the search. */
const bare = () => {
  const g = installed();
  for (const o of g.objects.filter((o) => o.data.resource === 'berry'))
    o.data.stock = 0;
  return learned(g);
};
/** bare(), then five plain navigate steps east: the near empty bush is out of view, remembered. */
function away() {
  let w = bare();
  for (let i = 0; i < 5; i++) w = ok(step(w, { lin: EAST }));
  expect(v7Observe(w, 'lin').objects.some((o) => o.id === NEAR_EMPTY)).toBe(
    false,
  );
  expect(
    actor(w).memory.objects.find((m) => m.object.id === NEAR_EMPTY)?.object.data
      .stock,
  ).toBe(0);
  return w;
}
/** Repeats the action until it completes; returns every round's result. */
function drive(w: V7World, action: V7Action, max = 40, who = 'lin') {
  const rounds: Round[] = [];
  let world = w;
  for (let i = 0; i < max; i++) {
    const r = step(world, { [who]: action });
    world = ok(r, who);
    rounds.push(r);
    if (r.outcomes[who]?.complete) return { world, rounds };
  }
  throw new Error('The search did not finish.');
}
/** Probe observations of the run per source. */
const probesOf = (record: Data | undefined) => {
  const out = new Map<string, number>();
  for (const i of (record?.inspections ?? []) as Data[])
    out.set(String(i.source), (out.get(String(i.source)) ?? 0) + 1);
  return out;
};

/** The world as bounded-resource-search@1 and this search should both leave it: every person,
 * object, item and process, and every event by identity, kind, person, interface and target.
 * The search's own records and the wording of its events are left out; its interface name and
 * run id prefix read as @1's. */
const normal = (w: V7World) =>
  v7Signature(normalWorld(w))
    .replaceAll(id, BASE)
    .replaceAll(`${PREFIX}-`, 'search-');
function normalWorld(w: V7World) {
  const kind = (t: string) =>
    t === `${PREFIX}-empty`
      ? `${BASE}-inspected`
      : t.startsWith(`${PREFIX}-`)
        ? `${BASE}-${t.slice(PREFIX.length + 1)}`
        : t;
  return {
    tick: w.tick,
    nextIdentity: w.nextIdentity,
    objects: w.objects,
    stacks: w.stacks,
    processes: w.processes,
    events: w.events.map((e) => ({
      id: e.id,
      tick: e.tick,
      actor: e.actor,
      type: kind(e.type),
      interface: e.interface === id ? BASE : e.interface,
      target: e.target,
      success: e.success,
      position: e.position,
    })),
    actors: w.actors.map((a) => ({
      ...a,
      extensionState: Object.fromEntries(
        Object.entries(a.extensionState).filter(
          ([k]) => !k.startsWith(`${BASE}:`) && !k.startsWith(`${id}:`),
        ),
      ),
      memory: {
        ...a.memory,
        important: (a.memory.important ?? []).map((e) => ({
          tick: e.tick,
          event: e.event,
          type: kind(e.type),
        })),
        experiences: a.memory.experiences.map((e) => ({
          tick: e.tick,
          event: e.event,
        })),
      },
    })),
  };
}
/** The fields of a bounded-resource-search@1 record, without its run id. */
const common = (base: Data | undefined, other: Data | undefined) => {
  const keys = Object.keys(base ?? {}).filter((k) => k !== 'id');
  return [
    Object.fromEntries(keys.map((k) => [k, base?.[k]])),
    Object.fromEntries(keys.map((k) => [k, other?.[k]])),
  ];
};

describe('bounded search with recheck and emergency modes in ex26', () => {
  it('is registered fifth for long-ex26, with new names, learning 1, the size limit, no excluded word and every earlier package byte-identical', () => {
    const pkg = recheckPackage();
    const ability = pkg.abilities[0];
    if (!ability) throw new Error('Missing ability.');
    // The fifth long-ex26 package; later developments of this run append their own after it.
    expect(
      V7_PACKAGES.filter((p) => p.scope === 'long-ex26')
        .map((p) => p.id)
        .slice(0, 5),
    ).toEqual([
      BASE,
      'reciprocal-conversation',
      'tend-rooted-plants',
      'assess-food-suitability',
      id,
    ]);
    expect(pkg).toMatchObject({
      id,
      version: 1,
      scope: 'long-ex26',
      dependencies: ['foundation-forest@1', 'foundation-open@1', BASE_REVISION],
      visualComponents: [],
      satisfaction: [],
      resources: [],
      processes: {},
      events: [
        'started',
        'moved',
        'inspected',
        'empty',
        'collected',
        'blocked',
        'paused',
        'resumed',
        'cancelled',
        'completed',
        'stopped',
        'ended',
      ].map((e) => `${PREFIX}-${e}`),
    });
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 1,
      revision: REVISION,
      handler: `long.${id}`,
      equivalence: 'forage:bounded-search-and-collection:recheck-emergency:1',
      authored: false,
      prerequisites: ['navigate', 'probe', 'gather'],
      dependencies: {
        abilities: ['navigate', 'probe', 'gather'],
        resources: [],
        knowledge: [],
      },
      references: {},
      practiceEvidence: `${PREFIX}-completed`,
      execution: { duration: null, interruption: 'cancel' },
    });
    expect(ability.learningEnergy).toBeUndefined();
    // @1's parameters with the same bounds, then the new optional ones.
    const base = V7_PACKAGES.find((p) => p.id === BASE)?.abilities[0];
    const properties = ability.parameters.properties ?? {};
    expect(Object.keys(properties)).toEqual([
      ...Object.keys(base?.parameters.properties ?? {}),
      'recheck',
      'emergency',
      'minHealth',
      'minTemp',
      'maxTemp',
      'avoidAreas',
      'avoidDirections',
    ]);
    for (const [k, v] of Object.entries(base?.parameters.properties ?? {}))
      expect(properties[k]).toEqual(v);
    expect(ability.parameters.required).toEqual(['mode']);
    expect(properties.mode?.enum).toEqual(['start', 'resume', 'cancel']);
    expect(properties.avoidDirections?.items?.enum).toEqual([
      'north',
      'east',
      'south',
      'west',
    ]);
    // No parameter names a target, so no reference contract is needed.
    expect(properties.target).toBeUndefined();
    // New package, ability, equivalence, handler, state and event names.
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(id);
        expect(a.equivalence).not.toBe(ability.equivalence);
        expect(a.handler).not.toBe(ability.handler);
        expect(a.revision).not.toBe(REVISION);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? [])
        expect(e.startsWith(`${PREFIX}-`)).toBe(false);
      for (const e of pkg.events ?? [])
        expect(e.startsWith(`${p.id}-`), `${e} / ${p.id}`).toBe(false);
    }
    const g = installed();
    for (const a of g.abilities.filter((a) => a.id !== id))
      expect(a.equivalence).not.toBe(ability.equivalence);
    for (const e of pkg.events ?? [])
      expect(g.eventTypes?.filter((x) => x === e)).toEqual([e]);
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
    expect(Object.keys(map)).toHaveLength(139);
    expect(sha(map)).toBe(EXISTING_DIGEST);
    expect(map[BASE_REVISION]).toBe(BASE_SHA);
    // Only the current scope can install it, only after @1 and only with operation continuity.
    const other = initialLongWorld('long-ex25', 'long-culture-v2-villages');
    expect(continuousRegistry(other).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(other, continuousRegistry(), REVISION)).toThrow(
      /not approved/,
    );
    const genesis = initialLongWorld('long-ex26', 'long-culture-v2-villages');
    expect(() =>
      v7Install(genesis, continuousRegistry(genesis), REVISION),
    ).toThrow(/dependency-incomplete/);
    const bareWorld = v7Clone(
      v7Install(genesis, continuousRegistry(genesis), BASE_REVISION),
    );
    bareWorld.state.operationContinuity = 0;
    expect(() =>
      v7Install(bareWorld, continuousRegistry(bareWorld), REVISION),
    ).toThrow(/operation continuity/);
    // Installing changes no person, object, item or process.
    const before = initialLongWorld('long-ex26', 'long-culture-v2-villages');
    expect(v7Signature(g.actors)).toBe(v7Signature(before.actors));
    expect(v7Signature(g.objects)).toBe(v7Signature(before.objects));
    expect(v7Signature(g.stacks)).toBe(v7Signature(before.stacks));
    expect(g.processes).toEqual(before.processes);
    expect(g.revisions.slice(-2)).toEqual([BASE_REVISION, REVISION]);
  });

  it('is learned by Lin in one round of study without energy, and only by a person with navigate, probe and gather', () => {
    const g = installed();
    const unlearned = step(g, { lin: search({ recheck: true }) });
    expect(unlearned.outcomes.lin?.success).toBe(false);
    expect(unlearned.outcomes.lin?.reason).toMatch(/not mastered/);
    // Neither the request nor @1's mastery teaches it.
    expect(actor(g).mastered).not.toContain(id);
    const r = step(g, { lin: learn(id) });
    const w = ok(r);
    expect(r.outcomes.lin?.reason).toMatch(/after one round of study/);
    expect(actor(w).mastered).toContain(id);
    expect(actor(w).learning).toBeNull();
    // Study costs nothing but the round: the vitals are those of a waiting person.
    const idle = step(g).world;
    expect(actor(w).vitals).toEqual(actor(idle).vitals);
    // Moss has not mastered probe in this genesis, so the study is refused.
    expect(actor(g, 'moss').mastered).not.toContain('probe');
    const moss = step(g, { moss: learn(id) });
    expect(moss.outcomes.moss?.success).toBe(false);
    expect(moss.outcomes.moss?.reason).toMatch(/prerequisites/);
    // A person who no longer has gather cannot run it.
    const lost = v7Clone(w);
    actor(lost).mastered = actor(lost).mastered.filter((x) => x !== 'gather');
    const run = step(lost, { lin: search() });
    expect(run.outcomes.lin?.success).toBe(false);
    expect(run.outcomes.lin?.reason).toMatch(/capability/);
  });

  it('without its options takes exactly the steps of bounded-resource-search@1, round by round', () => {
    // Kai masters both searches; each plan runs once with @1 and once with this search.
    let twins = ok(step(installed(), { kai: learn(BASE) }), 'kai');
    twins = ok(step(twins, { kai: learn(id) }), 'kai');
    const start =
      (args: Data = {}) =>
      (iface: string) => ({
        interface: iface,
        args: { mode: 'start', ...KAI, ...args },
      });
    const plans: {
      name: string;
      setup?: (w: V7World) => void;
      rounds: ((iface: string) => V7Action)[] | ((iface: string) => V7Action);
      edit?: (w: V7World, round: number) => void;
    }[] = [
      { name: 'collect', rounds: start() },
      ...(
        [
          { path: 0.5 },
          { time: 2 },
          { energy: 3 },
          { reserve: 37 },
          { path: 0.75 },
          { energy: 3.7 },
          { energy: 6 },
          { reserve: 33 },
          { quantity: 2 },
          { reserve: 40 },
        ] as Data[]
      ).map((args) => ({
        name: JSON.stringify(args),
        rounds: start(args),
      })),
      {
        name: 'two units, time 3',
        setup: (w) => {
          object(w, LARDER).data.stock = 2;
        },
        rounds: start({ time: 3 }),
      },
      {
        name: 'exhausted',
        setup: (w) => {
          object(w, LARDER).data.stock = 0;
        },
        rounds: start(),
      },
      {
        name: 'unsafe at start',
        setup: (w) => {
          actor(w, 'kai').vitals.health = 55;
        },
        rounds: [start()],
      },
      {
        name: 'unsafe during',
        rounds: [start(), start()],
        edit: (w, round) => {
          if (round === 1) actor(w, 'kai').vitals.health = 50;
        },
      },
      {
        name: 'pause and resume',
        rounds: [
          start(),
          () => WAIT,
          start(),
          (iface) => control('resume', iface),
          (iface) => control('resume', iface),
        ],
      },
      {
        name: 'cancel',
        rounds: [
          start(),
          start(),
          start(),
          (iface) => control('cancel', iface),
          (iface) => control('cancel', iface),
        ],
        edit: (w, round) => {
          if (round === 2) object(w, LARDER).data.stock = 2;
        },
      },
      {
        name: 'blocked',
        setup: (w) => {
          object(w, LARDER).data.stock = 0;
          w.objects.push({
            ...v7Clone(object(w, LARDER)),
            id: 'fixture-berry',
            spatial: { ...object(w, LARDER).spatial, x: 133.1, y: 20.7 },
            data: { ...object(w, LARDER).data, stock: 2 },
          });
          const seen = v7Observe(w, 'kai').objects.find(
            (o) => o.id === 'fixture-berry',
          );
          if (!seen) throw new Error('The bush is not in view.');
          actor(w, 'kai').memory.objects.push({ object: seen, seenAt: w.tick });
        },
        rounds: start({ radius: 4.5 }),
      },
      {
        name: 'explore',
        setup: (w) => {
          for (const o of w.objects.filter((o) => o.data.resource === 'berry'))
            o.data.stock = 0;
          w.objects.push({
            ...v7Clone(object(w, LARDER)),
            id: 'fixture-berry',
            spatial: { ...object(w, LARDER).spatial, x: 137, y: 12.5 },
            data: { ...object(w, LARDER).data, stock: 3 },
          });
        },
        rounds: start({
          radius: 8,
          path: 16,
          time: 40,
          energy: 30,
          reserve: 4,
          quantity: 3,
        }),
      },
    ];
    let compared = 0;
    for (const plan of plans) {
      const w0 = v7Clone(twins);
      plan.setup?.(w0);
      let a = w0,
        b = v7Clone(w0);
      const list = Array.isArray(plan.rounds) ? plan.rounds : null;
      for (let round = 0; round < (list?.length ?? 40); round++) {
        plan.edit?.(a, round);
        plan.edit?.(b, round);
        const act = list ? list[round] : plan.rounds;
        if (!act || Array.isArray(act)) throw new Error('Missing round.');
        const ra = step(a, { kai: act(BASE) });
        const rb = step(b, { kai: act(id) });
        a = ra.world;
        b = rb.world;
        const oa = ra.outcomes.kai,
          ob = rb.outcomes.kai;
        expect(ob?.success, `${plan.name} ${String(round)}`).toBe(oa?.success);
        expect(ob?.complete, `${plan.name} ${String(round)}`).toBe(
          oa?.complete,
        );
        expect(
          (ob?.reason ?? '').replaceAll(`${PREFIX}-`, 'search-'),
          plan.name,
        ).toBe(oa?.reason ?? '');
        expect(normal(b), `${plan.name} ${String(round)}`).toBe(normal(a));
        const [x, y] = common(
          actor(a, 'kai').extensionState[`${BASE}:work:open`] as Data,
          open(b, 'kai'),
        );
        expect(y, plan.name).toEqual(x);
        const [p, q] = common(
          actor(a, 'kai').extensionState[`${BASE}:last`] as Data,
          last(b, 'kai'),
        );
        expect(q, plan.name).toEqual(p);
        compared += 1;
        if (!list && oa?.complete) break;
      }
      // The ordinary record has no new mode and no inspection beyond @1's probes.
      const record = last(b, 'kai') ?? open(b, 'kai');
      if (record)
        expect(record).toMatchObject({
          recheck: false,
          emergency: false,
          minHealth: null,
          minTemp: null,
          maxTemp: null,
          avoidAreas: [],
          avoidDirections: [],
          empty: [],
        });
    }
    expect(compared).toBeGreaterThanOrEqual(45);
  });

  it('recheck: walks to a remembered empty bush through navigate only as a destination, learns its stock by a fresh probe within reach, and inspects it once', () => {
    const base = away();
    const here = { ...actor(base).position };
    // Only the remembered bush lies inside the area: radius 1 around its remembered place.
    const target = object(base, NEAR_EMPTY).spatial;
    const area = {
      x: target.x,
      y: target.y,
      radius: 1,
      path: 8,
      energy: 20,
      quantity: 2,
    };
    // The ordinary search does not go there: the bush was last seen empty.
    const ordinary = drive(base, search(area));
    expect(ordinary.rounds).toHaveLength(1);
    expect(last(ordinary.world)).toMatchObject({
      status: 'completed',
      reason: 'search-exhausted',
      moves: 0,
      probes: 0,
    });
    expect(actor(ordinary.world).position).toEqual(here);
    // recheck walks there through navigate; Lin's memory gives only the place, never its stock.
    for (const regrown of [0, 2]) {
      const w0 = v7Clone(base);
      object(w0, NEAR_EMPTY).data.stock = regrown;
      const d = drive(w0, search({ ...area, recheck: true }));
      let before = w0;
      let walking = 0,
        remembered = 0;
      for (const r of d.rounds) {
        const w = r.world;
        const moved = mine(w, 'moved')[0];
        const kernel = w.events.filter(
          (e) =>
            e.actor === 'lin' &&
            e.interface === id &&
            (e.type === 'moved' || e.type === 'arrived'),
        );
        const distance = v7Distance(actor(before).position, actor(w).position);
        expect(distance).toBeLessThanOrEqual(MAX_STEP + 1e-6);
        if (moved) {
          walking += 1;
          // One kernel navigate step at its own effort (2 per distance, raised by ground).
          expect(kernel).toHaveLength(1);
          expect(view(moved).underlying).toBe(kernel[0]?.id);
          expect(Number(kernel[0]?.data.distance)).toBeCloseTo(distance, 6);
          expect(Number(kernel[0]?.data.effort)).toBeGreaterThanOrEqual(
            2 * distance - 1e-6,
          );
          expect(
            actor(before).vitals.energy - actor(w).vitals.energy,
          ).toBeCloseTo(Number(kernel[0]?.data.effort), 6);
          const inView = v7Observe(before, 'lin').objects.some(
            (o) => o.id === NEAR_EMPTY,
          );
          if (!inView) {
            // A remembered place: past stock, never shown as current.
            remembered += 1;
            expect(view(moved)).toMatchObject({
              source: NEAR_EMPTY,
              evidence: 'remembered',
              pastStock: 0,
              available: null,
            });
            expect(moved.description).toMatch(/its stock now is unknown/);
          } else
            expect(view(moved)).toMatchObject({
              evidence: 'seen now',
              pastStock: null,
            });
        } else expect(distance).toBe(0);
        before = w;
      }
      expect(walking).toBeGreaterThanOrEqual(5);
      expect(remembered).toBeGreaterThanOrEqual(1);
      // One probe within reach, at 0.2 energy, with probe's own record and event.
      const probeRound = d.rounds.find(
        (r) => mine(r.world, regrown ? 'inspected' : 'empty').length,
      );
      if (!probeRound) throw new Error('No probe.');
      const pw = probeRound.world;
      const inspection = mine(pw, regrown ? 'inspected' : 'empty')[0];
      const trial = pw.events.find(
        (e) => e.actor === 'lin' && e.type === 'trial-result',
      );
      expect(view(inspection)).toMatchObject({
        source: NEAR_EMPTY,
        evidence: 'probe',
        available: regrown,
        outcome: regrown ? 'stock-observed' : 'observed-empty',
        underlying: trial?.id,
      });
      expect(
        actor(pw).memory.knowledge?.[`${NEAR_EMPTY}:observed-state`],
      ).toMatchObject({
        tick: pw.tick,
        evidence: trial?.id,
        value: { stock: regrown },
      });
      const record = (open(pw) ?? last(pw)) as Data;
      expect(record.inspections).toEqual([
        {
          source: NEAR_EMPTY,
          tick: pw.tick,
          stock: regrown,
          event: trial?.id,
        },
      ]);
      const end = last(d.world);
      if (regrown) {
        // Real stock moves by gather only: 2 units, 2 energy each.
        expect(end).toMatchObject({
          status: 'completed',
          reason: 'quantity-cap',
          collected: 2,
          probes: 1,
          gathers: 1,
          empty: [],
        });
        expect(object(d.world, NEAR_EMPTY).data.stock).toBe(0);
        expect(
          d.world.stacks
            .filter((s) => s.owner === 'lin')
            .map((s) => [s.resource, s.quantity, s.origin]),
        ).toEqual([['berry', 2, NEAR_EMPTY]]);
        expect(mine(d.world, 'collected')[0]?.data.view).toMatchObject({
          transferred: 2,
          available: 0,
          outcome: 'collected',
        });
      } else {
        // Seen empty by probe: noted once, never inspected again; nothing is collected.
        expect(end).toMatchObject({
          status: 'completed',
          reason: 'search-exhausted',
          collected: 0,
          probes: 1,
          gathers: 0,
          empty: [NEAR_EMPTY],
        });
        expect(berries(d.world)).toBe(0);
        expect(
          d.rounds.flatMap((r) =>
            mine(r.world, 'collected').concat(mine(r.world, 'inspected')),
          ),
        ).toEqual([]);
      }
    }
  });

  it('recheck: inspects each empty source at most once per run, even after a long pause; a new run, or stock seen again, is new evidence', () => {
    const w0 = bare();
    const args = {
      radius: 6,
      path: 16,
      time: 40,
      energy: 30,
      reserve: 4,
      quantity: 2,
      recheck: true,
    };
    // Two steps, then twenty rounds of other actions, then resume until the end.
    let w = w0;
    const rounds: Round[] = [];
    for (let i = 0; i < 4; i++) {
      const r = step(w, { lin: search(args) });
      w = ok(r);
      rounds.push(r);
    }
    const early = probesOf(open(w));
    for (let i = 0; i < 20; i++) w = ok(step(w));
    expect(open(w)).toMatchObject({ status: 'paused' });
    for (let i = 0; i < 40; i++) {
      const r = step(w, { lin: control('resume') });
      w = ok(r);
      rounds.push(r);
      if (r.outcomes.lin?.complete) break;
    }
    const end = last(w);
    const probes = probesOf(end);
    // Several empty bushes were inspected, each once; the early ones not again after the pause.
    expect(probes.size).toBeGreaterThanOrEqual(3);
    for (const [source, n] of probes) expect(n, source).toBe(1);
    expect(early.size).toBeGreaterThanOrEqual(1);
    for (const source of early.keys()) expect(probes.get(source)).toBe(1);
    expect(end?.empty).toEqual([...probes.keys()]);
    expect(
      rounds.flatMap((r) => mine(r.world, 'empty')).map((e) => e.target),
    ).toEqual([...probes.keys()]);
    expect(berries(w)).toBe(0);
    // A new, separately bounded run may inspect them again.
    const again = drive(w, search({ ...args, time: 10 })).world;
    expect([...probesOf(last(again)).keys()].some((s) => probes.has(s))).toBe(
      true,
    );
    // New observable evidence: a bush inspected empty and then seen with stock is a candidate.
    let s = w0;
    for (let i = 0; i < 6; i++) {
      s = ok(step(s, { lin: search(args) }));
      if (probesOf(open(s)).get(NEAR_EMPTY)) break;
    }
    expect(open(s)?.empty).toContain(NEAR_EMPTY);
    expect(v7Observe(s, 'lin').objects.some((o) => o.id === NEAR_EMPTY)).toBe(
      true,
    );
    object(s, NEAR_EMPTY).data.stock = 1;
    const seen = drive(s, search(args)).world;
    expect(last(seen)?.transfers).toEqual([
      expect.objectContaining({ source: NEAR_EMPTY, quantity: 1 }),
    ]);
    expect(probesOf(last(seen)).get(NEAR_EMPTY)).toBe(2);
  });

  it('never targets a source Lin never observed, even stocked inside the radius', () => {
    // A stocked bush 7.6 from Lin, inside a radius of 8, that she has never seen.
    const plant = (w: V7World) => {
      w.objects.push({
        ...v7Clone(object(w, LIN_BUSH)),
        id: 'fixture-berry',
        spatial: { ...object(w, LIN_BUSH).spatial, x: 21.5, y: 9.5 },
        data: { ...object(w, LIN_BUSH).data, stock: 3 },
      });
      return w;
    };
    const w0 = plant(bare());
    expect(v7Distance(actor(w0).position, { x: 21.5, y: 9.5 })).toBeGreaterThan(
      7,
    );
    expect(
      actor(w0).memory.objects.some((m) => m.object.id === 'fixture-berry'),
    ).toBe(false);
    // Tight limits keep it out of view: it is never a target and never named.
    const tight = {
      radius: 8,
      path: 1.6,
      time: 12,
      energy: 10,
      reserve: 4,
      quantity: 3,
      recheck: true,
      emergency: true,
    };
    const d = drive(w0, search(tight));
    for (const r of d.rounds) {
      expect(
        v7Observe(r.world, 'lin').objects.some((o) => o.id === 'fixture-berry'),
      ).toBe(false);
      const text = JSON.stringify([
        open(r.world),
        last(r.world),
        r.world.events.filter((e) => e.actor === 'lin'),
      ]);
      expect(text).not.toContain('fixture-berry');
    }
    expect(last(d.world)?.collected).toBe(0);
    expect(object(d.world, 'fixture-berry').data.stock).toBe(3);
    // Wider limits, and the south and west left out so the path suffices: it becomes a target
    // only after Lin has seen it herself.
    let w = plant(bare());
    let targeted = false;
    for (let i = 0; i < 40; i++) {
      const knew = actor(w).memory.objects.some(
        (m) => m.object.id === 'fixture-berry',
      );
      const r = step(w, {
        lin: search({
          radius: 8,
          path: 16,
          time: 40,
          energy: 30,
          reserve: 4,
          quantity: 3,
          recheck: true,
          avoidDirections: ['south', 'west'],
        }),
      });
      w = ok(r);
      const record = (open(w) ?? last(w)) as Data;
      const named = JSON.stringify(record).includes('fixture-berry');
      if (named) expect(knew).toBe(true);
      if (record.target === 'fixture-berry') targeted = true;
      if (r.outcomes.lin?.complete) break;
    }
    expect(targeted).toBe(true);
    expect(last(w)).toMatchObject({ collected: 3 });
  });

  it('emergency: continues below satiety 8, while health, injury, body temperature, the eat-cost reserve and every limit still stop it', () => {
    const base = learned();
    const hungry = v7Clone(base);
    actor(hungry).vitals.satiety = 6;
    // Without emergency, satiety 6 refuses the start, as in @1.
    refused(step(hungry, { lin: search() }), /satiety 6 is at or below 8/);
    refused(
      step(hungry, { lin: search({ recheck: true }) }),
      /satiety 6 is at or below 8/,
    );
    // emergency: walk, probe, gather 4 while satiety falls further; nothing is eaten.
    const e0 = actor(hungry).vitals.energy;
    const d = drive(hungry, search({ emergency: true }));
    expect(d.rounds).toHaveLength(3);
    for (const r of d.rounds)
      expect(actor(r.world).vitals.satiety).toBeLessThanOrEqual(8);
    expect(last(d.world)).toMatchObject({
      status: 'completed',
      reason: 'quantity-cap',
      emergency: true,
      collected: 4,
    });
    expect(berries(d.world)).toBe(4);
    expect(actor(d.world).vitals.energy).toBeCloseTo(e0 - 1.6 - 0.2 - 8, 6);
    let idle = hungry;
    for (let i = 0; i < 3; i++) idle = step(idle).world;
    expect(actor(d.world).vitals.satiety).toBe(actor(idle).vitals.satiety);
    expect(
      d.world.events.some((e) => e.actor === 'lin' && e.type === 'ate'),
    ).toBe(false);
    // Every other stop at the start, at no cost.
    const at = (edit: (a: V7Actor, w: V7World) => void) => {
      const w = v7Clone(hungry);
      edit(actor(w), w);
      return w;
    };
    const emergency = (args: Data = {}) => search({ emergency: true, ...args });
    for (const [world, action, pattern] of [
      [
        at((a) => (a.vitals.health = 60)),
        emergency(),
        /health 60 is at or below 60/,
      ],
      [
        at((a, w) =>
          (a.memory.important ??= []).push({
            tick: w.tick,
            event: 'fixture',
            type: 'injured',
            summary: 'Hurt.',
          }),
        ),
        emergency(),
        /injured in the last round/,
      ],
      [
        at((a) => (a.vitals.temperature = 32.5)),
        emergency(),
        /10 or more from 22/,
      ],
      [
        at((a) => (a.vitals.health = 90)),
        emergency({ minHealth: 95 }),
        /health 90 is below your minimum of 95/,
      ],
      [
        at((a) => (a.vitals.temperature = 24)),
        emergency({ maxTemp: 23 }),
        /above your maximum of 23/,
      ],
      [
        at((a) => (a.vitals.temperature = 20)),
        emergency({ minTemp: 21 }),
        /below your minimum of 21/,
      ],
      [
        hungry,
        emergency({ reserve: 0.5 }),
        /reserve of at least 1 energy, what eat costs/,
      ],
      [
        hungry,
        emergency({ minTemp: 25, maxTemp: 24 }),
        /minTemp must be below maxTemp/,
      ],
      [
        at((a) => (a.vitals.energy = 3)),
        emergency({ reserve: 3 }),
        /not above the reserve/,
      ],
    ] as const) {
      const before = v7Clone(world);
      const r = refused(step(world, { lin: action }), pattern);
      expect(actor(r).position).toEqual(actor(before).position);
      expect(open(r)).toBeUndefined();
    }
    // Stops during the search, before the next step.
    for (const [edit, args, pattern] of [
      [
        (a: V7Actor) => (a.vitals.health = 55),
        {},
        /health 55 is at or below 60/,
      ],
      [
        (a: V7Actor, w: V7World) =>
          (a.memory.important ??= []).push({
            tick: w.tick,
            event: 'fixture',
            type: 'injured',
            summary: 'Hurt.',
          }),
        {},
        /injured in the last round/,
      ],
      [(a: V7Actor) => (a.vitals.temperature = 11), {}, /10 or more from 22/],
      [
        (a: V7Actor) => (a.vitals.health = 80),
        { minHealth: 85 },
        /below your minimum of 85/,
      ],
      [
        (a: V7Actor) => (a.vitals.temperature = 26),
        { maxTemp: 25 },
        /above your maximum of 25/,
      ],
    ] as const) {
      const s = ok(step(hungry, { lin: emergency(args) }));
      edit(actor(s), s);
      const p0 = { ...actor(s).position },
        energy = actor(s).vitals.energy;
      const r = step(s, { lin: emergency(args) });
      const w = ok(r);
      expect(r.outcomes.lin?.complete).toBe(true);
      expect(types(w)).toEqual([`${PREFIX}-stopped`]);
      expect(last(w)).toMatchObject({ status: 'stopped', reason: 'unsafe' });
      expect(String(last(w)?.detail)).toMatch(pattern);
      expect(actor(w).position).toEqual(p0);
      expect(actor(w).vitals.energy).toBe(energy);
    }
    // Every limit in emergency mode, as in ordinary mode.
    const p0 = { ...actor(hungry).position };
    for (const [args, reason] of [
      [{ path: 0.5 }, 'path-limit'],
      [{ time: 2 }, 'time-limit'],
      [{ energy: 3 }, 'energy-budget'],
      [{ reserve: 37 }, 'energy-reserve'],
    ] as const) {
      const run = drive(hungry, emergency(args));
      expect(run.rounds).toHaveLength(1);
      expect(last(run.world)).toMatchObject({
        status: 'stopped',
        reason,
        distance: 0,
        energy: 0,
      });
      expect(actor(run.world).position).toEqual(p0);
      expect(actor(run.world).vitals.energy).toBe(e0);
    }
    expect(last(drive(hungry, emergency({ quantity: 2 })).world)).toMatchObject(
      {
        status: 'completed',
        reason: 'quantity-cap',
        collected: 2,
      },
    );
    expect(last(drive(hungry, emergency({ energy: 6 })).world)).toMatchObject({
      status: 'stopped',
      reason: 'energy-budget',
      collected: 2,
    });
    // With 4.8 energy and the eat-cost reserve of 1: walk, probe and one unit, then no further
    // unit fits above the reserve; the energy never falls below it.
    const tired = v7Clone(hungry);
    actor(tired).vitals.energy = 4.8;
    const t = drive(tired, emergency({ reserve: 1 }));
    expect(last(t.world)).toMatchObject({
      status: 'stopped',
      reason: 'energy-reserve',
      collected: 1,
      probes: 1,
    });
    for (const r of t.rounds)
      expect(actor(r.world).vitals.energy).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(actor(t.world).vitals.energy).toBeCloseTo(1, 8);
  });

  it('avoided areas and directions leave out sources and ground there, and no step enters them', () => {
    const base = learned();
    // Lin's own bush lies east of her; avoiding the east, or a circle around it, leaves it out
    // and she goes to Moss's bush instead.
    for (const avoid of [
      { avoidDirections: ['east'] },
      { avoidAreas: [{ x: 17.88, y: 14.13, radius: 1 }] },
    ]) {
      const d = drive(
        base,
        search({ radius: 6, path: 8, energy: 20, quantity: 2, ...avoid }),
      );
      const end = last(d.world);
      expect(end).toMatchObject({ status: 'completed', collected: 2 });
      expect(end?.transfers).toEqual([
        expect.objectContaining({ source: MOSS_BUSH, quantity: 2 }),
      ]);
      for (const r of d.rounds)
        expect(JSON.stringify(open(r.world) ?? last(r.world))).not.toContain(
          LIN_BUSH,
        );
      expect(object(d.world, LIN_BUSH).data.stock).toBe(4);
    }
    // A step that would enter an avoided circle is not taken: the target is left out, nothing
    // moves and nothing is spent.
    const p0 = { ...actor(base).position },
      e0 = actor(base).vitals.energy;
    const r = step(base, {
      lin: search({
        radius: 6,
        path: 8,
        energy: 20,
        quantity: 2,
        avoidAreas: [
          { x: 17.88, y: 14.13, radius: 1 },
          { x: 15.4, y: 16, radius: 0.6 },
        ],
      }),
    });
    const w = ok(r);
    expect(types(w)).toEqual([`${PREFIX}-started`, `${PREFIX}-blocked`]);
    expect(open(w)?.blocked).toEqual([
      {
        target: MOSS_BUSH,
        tick: w.tick,
        reason: 'the next step would enter avoided area 2',
      },
    ]);
    expect(actor(w).position).toEqual(p0);
    expect(actor(w).vitals.energy).toBe(e0);
    // Exploring with the north, east and west avoided: every step and goal lies to the south.
    const south = (o: V7Point, p: { x: number; y: number }) => {
      const dx = p.x - o.x,
        dy = p.y - o.y;
      return !(-dy > Math.abs(dx) || dx > Math.abs(dy) || -dx > Math.abs(dy));
    };
    const empty = bare();
    const origin = { ...actor(empty).position };
    const x = drive(
      empty,
      search({
        radius: 8,
        path: 6,
        time: 20,
        energy: 20,
        recheck: true,
        avoidDirections: ['north', 'east', 'west'],
      }),
    );
    let steps = 0;
    for (const round of x.rounds) {
      expect(south(origin, actor(round.world).position)).toBe(true);
      const record = (open(round.world) ?? last(round.world)) as Data;
      const goal = record.goal as V7Point | null;
      if (goal) expect(south(origin, goal)).toBe(true);
      if (mine(round.world, 'moved').length) steps += 1;
    }
    expect(steps).toBeGreaterThan(0);
    for (const i of (last(x.world)?.inspections ?? []) as Data[])
      expect(south(origin, object(x.world, String(i.source)).spatial)).toBe(
        true,
      );
    refused(
      step(base, {
        lin: search({ avoidDirections: ['east', 'east'] }),
      }),
      /each avoided direction once/,
    );
    refused(
      step(base, {
        lin: search({
          avoidAreas: Array.from({ length: 5 }, () => ({
            x: 1,
            y: 1,
            radius: 1,
          })),
        }),
      }),
      /at most 4 avoidAreas/,
    );
  });

  it('never moves a person faster than navigate: at most 0.8 per round over 60 rounds in recheck and emergency mode, so the separation bound holds', () => {
    // Kai searches for 60 rounds with both modes, starting a new wide search whenever one ends
    // and resting when tired, while everyone else rushes toward the other side with navigate.
    let w = learned(undefined, 'kai');
    const wide: V7Action = {
      interface: id,
      args: {
        mode: 'start',
        resource: 'berry',
        radius: 8,
        path: 16,
        time: 40,
        energy: 30,
        reserve: 2,
        quantity: 20,
        recheck: true,
        emergency: true,
      },
    };
    const group = (who: string) =>
      VILLAGES.groups.findIndex((g) => g.includes(who));
    const start = new Map(w.actors.map((a) => [a.id, { ...a.position }]));
    const first = w.tick;
    let current = wide,
      refusedBefore = false,
      searchMoves = 0,
      probes = 0,
      walked = 0,
      fastest = 0;
    for (let round = 0; round < 60; round++) {
      const kai = actor(w, 'kai');
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
        before.get('kai') ?? actor(w, 'kai').position,
        actor(w, 'kai').position,
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
      probes += w.events.filter(
        (e) =>
          e.actor === 'kai' && e.interface === id && e.type === 'trial-result',
      ).length;
    }
    expect(w.tick - first).toBe(60);
    // The search moved in most rounds, at full speed and never faster, and rechecked bushes.
    expect(searchMoves).toBeGreaterThanOrEqual(30);
    expect(probes).toBeGreaterThanOrEqual(1);
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

  it('charges each step its own cost, pauses when another action takes a round, resumes after fresh checks, cancels without refunds and ends at death', () => {
    const modes = { recheck: true, emergency: true };
    const e0 = actor(learned()).vitals.energy;
    // Round 1: the start and one kernel navigate step of 0.8 for 1.6 energy.
    let w = ok(step(learned(), { lin: search(modes) }));
    expect(types(w)).toEqual([
      `${PREFIX}-started`,
      'arrived',
      `${PREFIX}-moved`,
    ]);
    expect(actor(w).vitals.energy).toBeCloseTo(e0 - 1.6, 8);
    expect(open(w)).toMatchObject({
      status: 'active',
      target: LIN_BUSH,
      distance: 0.8,
      energy: 1.6,
      moves: 1,
    });
    // Another action takes round 2: the search pauses and keeps its step and charge.
    w = ok(step(w, { lin: WAIT }));
    const paused = mine(w, 'paused');
    expect(paused).toHaveLength(1);
    expect(paused[0]?.interface).toBeNull();
    expect(view(paused[0]).outcome).toBe('paused');
    expect(open(w)).toMatchObject({
      status: 'paused',
      distance: 0.8,
      energy: 1.6,
    });
    // A new start is refused while it is open.
    refused(
      step(w, { lin: search(modes) }),
      /give resume to continue it or cancel/,
    );
    // Resume rechecks: the bush is inspected (probe: 0.2 energy) before any harvest, and the
    // paused round still counts toward the time limit.
    const before = actor(w).vitals.energy;
    w = ok(step(w, { lin: control('resume') }));
    expect(types(w)).toEqual([
      `${PREFIX}-resumed`,
      'trial-result',
      `${PREFIX}-inspected`,
    ]);
    expect(actor(w).vitals.energy).toBeCloseTo(before - 0.2, 8);
    expect(view(mine(w, 'inspected')[0]).time).toBe(3);
    // gather: 2 energy per unit, exactly the units taken from the bush.
    w = ok(step(w, { lin: control('resume') }));
    expect(types(w)).toEqual([
      'gathered',
      `${PREFIX}-collected`,
      `${PREFIX}-completed`,
    ]);
    expect(actor(w).vitals.energy).toBeCloseTo(before - 0.2 - 8, 8);
    expect(object(w, LIN_BUSH).data.stock).toBe(0);
    expect(berries(w)).toBe(4);
    expect(view(mine(w, 'completed')[0]).outcome).toBe('complete');
    // Cancel: after a partial harvest the berries stay; spent energy is not refunded.
    let c = learned();
    for (let i = 0; i < 2; i++) c = ok(step(c, { lin: search(modes) }));
    object(c, LIN_BUSH).data.stock = 2;
    c = ok(step(c, { lin: search(modes) }));
    expect(open(c)).toMatchObject({ status: 'active', collected: 2 });
    const energy = actor(c).vitals.energy;
    const r = step(c, { lin: control('cancel') });
    c = ok(r);
    expect(r.outcomes.lin?.complete).toBe(true);
    expect(types(c)).toEqual([`${PREFIX}-cancelled`]);
    expect(actor(c).vitals.energy).toBe(energy);
    expect(berries(c)).toBe(2);
    expect(open(c)).toBeUndefined();
    expect(last(c)).toMatchObject({
      status: 'cancelled',
      collected: 2,
      energy: 5.8,
    });
    refused(step(c, { lin: control('cancel') }), /no open search to cancel/);
    refused(step(c, { lin: control('resume') }), /no open search to resume/);
    // Death: the search ends; carried berries follow the ordinary death rules once.
    let d = learned();
    for (let i = 0; i < 2; i++) d = ok(step(d, { lin: search(modes) }));
    object(d, LIN_BUSH).data.stock = 2;
    d = ok(step(d, { lin: search(modes) }));
    const where = { ...actor(d).position };
    actor(d).vitals.health = 0.5;
    actor(d).vitals.satiety = 0;
    d = step(d, { lin: WAIT }).world;
    const seen = d.events.filter((e) => e.actor === 'lin').map((e) => e.type);
    expect(seen).toContain(`${PREFIX}-paused`);
    expect(seen).toContain('died');
    expect(seen).toContain(`${PREFIX}-ended`);
    expect(seen).toContain('respawned');
    expect(open(d)).toBeUndefined();
    expect(last(d)).toMatchObject({
      status: 'ended',
      reason: 'death',
      collected: 2,
    });
    const dropped = d.stacks.filter(
      (s) => s.resource === 'berry' && s.origin === LIN_BUSH,
    );
    expect(dropped.reduce((n, s) => n + s.quantity, 0)).toBe(2);
    for (const s of dropped) {
      expect(s.owner).toBeNull();
      expect(s.position).toEqual(where);
    }
    expect(berries(d)).toBe(0);
    refused(step(d, { lin: control('resume') }), /no open search to resume/);
  });

  it('never rewards searching: no satisfaction, mood, practice milestone or progress credit beyond the same steps by hand', () => {
    let w = learned(),
      hand = learned(),
      idle = learned();
    const manual: V7Action[] = [
      { interface: 'navigate', args: { target: LIN_BUSH, x: 17.88, y: 14.13 } },
      {
        interface: 'probe',
        args: { target: LIN_BUSH, mode: 'observe', intensity: 0 },
      },
      { interface: 'gather', args: { target: LIN_BUSH, quantity: 4 } },
    ];
    const seen: V7Event[] = [];
    for (let round = 0; round < 6; round++) {
      w = ok(
        step(
          w,
          round < 3 ? { lin: search({ recheck: true, emergency: true }) } : {},
        ),
      );
      hand = ok(step(hand, { lin: manual[round] ?? WAIT }));
      idle = step(idle).world;
      seen.push(...w.events);
    }
    expect(last(w)).toMatchObject({ status: 'completed', collected: 4 });
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
    expect(actor(w).position).toEqual(actor(hand).position);
    expect(berries(w)).toBe(berries(hand));
    // The install's practice rule exists, but nothing can trigger it.
    expect(w.satisfaction.find((r) => r.id === `practice:${id}`)).toMatchObject(
      {
        event: 'practice-confirmed',
        interface: id,
      },
    );
    expect(
      seen.some((e) => e.type.startsWith(`${PREFIX}-`) && e.data.qualified),
    ).toBe(false);
  });

  it('keeps every agent-visible text free of excluded words and of any mention of the far people', () => {
    const texts: unknown[] = [];
    const keep = (r: Round) => {
      const world = ok(r);
      texts.push(
        world.events.filter((e) => e.actor === 'lin'),
        longOrdinaryInput(world, 'lin').packet.execution,
        open(world),
        last(world),
      );
      return world;
    };
    const modes = { recheck: true, emergency: true };
    let w = keep(step(learned(), { lin: search(modes) }));
    w = keep(step(w, { lin: WAIT }));
    w = keep(step(w, { lin: control('resume') }));
    w = keep(step(w, { lin: control('resume') }));
    // A remembered empty bush, an observed-empty probe, avoided ground, stops and a cancel.
    const a = away();
    const target = object(a, NEAR_EMPTY).spatial;
    for (const r of drive(
      a,
      search({
        x: target.x,
        y: target.y,
        radius: 1,
        path: 8,
        energy: 20,
        recheck: true,
      }),
    ).rounds)
      keep(r);
    for (const r of drive(
      bare(),
      search({
        radius: 8,
        path: 6,
        time: 20,
        energy: 20,
        recheck: true,
        emergency: true,
        minHealth: 70,
        minTemp: 15,
        maxTemp: 30,
        avoidDirections: ['north'],
        avoidAreas: [{ x: 15.4, y: 16, radius: 0.6 }],
      }),
    ).rounds)
      keep(r);
    const hungry = learned();
    actor(hungry).vitals.satiety = 6;
    for (const r of drive(hungry, search({ emergency: true, energy: 3.7 }))
      .rounds)
      keep(r);
    const s = keep(step(hungry, { lin: search({ emergency: true }) }));
    keep(step(s, { lin: control('cancel') }));
    // The interface as Lin sees it in her ordinary input.
    const input = longOrdinaryInput(w, 'lin');
    texts.push(
      input.packet.abilities,
      input.catalogue.interfaces.filter((x) => x.id === id),
    );
    const text = JSON.stringify(texts);
    expect(text).toContain(`${PREFIX}-paused`);
    expect(text).toContain(`${PREFIX}-empty`);
    expect(text).toContain('"evidence":"remembered"');
    expect(text).toContain('observed-empty');
    expect(text).toContain(`${PREFIX}-cancelled`);
    expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
    expect(text).not.toMatch(MENTION);
    // The open search is shown with the person's active work under its own key.
    const active = (
      longOrdinaryInput(ok(step(learned(), { lin: search(modes) })), 'lin')
        .packet.execution as { activeState: Data }
    ).activeState;
    expect(Object.keys(active)).toEqual([OPEN]);
  });
});
