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

const id = 'bounded-resource-search-low-health';
const REVISION = `${id}@1`;
/** The search it extends, installed before it and unchanged. */
const RECHECK = 'bounded-resource-search-recheck';
const RECHECK_REVISION = `${RECHECK}@1`;
const RECHECK_PREFIX = 'search-recheck';
const BASE = 'bounded-resource-search';
const BASE_REVISION = `${BASE}@1`;
const PREFIX = 'search-low-health';
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
 * JSON.stringify of each of the 140 packages registered before this change (the scratch hash
 * file validation-results/scratch/ex26/hashes-before-8.json, taken before this change). */
const EXISTING_DIGEST =
  'ad673d41ed6ddcfe87a6fc96d21fae2fc3dc00ae47156845fd20611a9b3c1b4e';
/** bounded-resource-search-recheck@1 alone: exporting its helpers changed nothing. */
const RECHECK_SHA =
  'fd88553beb9b02b2dc295f124a44412bdaaac0a5e34fc34eeacae8fb2a372235';
/** bounded-resource-search@1 alone. */
const BASE_SHA =
  'bf6a210eab2b0bb9822f6dc915adb48c26a682aba5f2da93fb126984fed3769d';
const MAX_STEP = 0.8;
/** Kai's vitals at the pause: health 36, satiety 5. */
const WEAK = { health: 36, satiety: 5 };

/** Kai's own berry bush, 1.82 from his start, holding 4 units. */
const LARDER = 'commons-berry-3-0';
/** A berry bush Kai sees empty at his start, 4.29 south of him. */
const SOUTH_EMPTY = 'start-5-berries';
/** Kai's ordinary search inputs: berries within 4 of him, at most 4 distance, 16 rounds and 16
 * energy, keeping 24 energy, for up to 4 units. */
const KAI = {
  resource: 'berry',
  radius: 4,
  path: 4,
  time: 16,
  energy: 16,
  reserve: 24,
  quantity: 4,
};
/** Observed open ground 2.6 north of Kai's start. */
const NORTH: V7Action = {
  interface: 'navigate',
  args: { target: '', x: 131.1, y: 14.3 },
};

type Data = Record<string, unknown>;
type Round = ReturnType<typeof step>;
const sha = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const lowPackage = (): V7Package => {
  const p = V7_PACKAGES.find((p) => p.id === id);
  if (!p) throw new Error('Missing package.');
  return p;
};
const search = (args: Data = {}, iface = id): V7Action => ({
  interface: iface,
  args: { mode: 'start', ...KAI, ...args },
});
/** The low-health mode with Kai's inputs. */
const low = (args: Data = {}) => search({ lowHealth: true, ...args });
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
const ok = (r: Round, who = 'kai') => {
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  return r.world;
};
const refused = (r: Round, pattern: RegExp, who = 'kai') => {
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
const open = (w: V7World, who = 'kai') =>
  actor(w, who).extensionState[OPEN] as Data | undefined;
const last = (w: V7World, who = 'kai') =>
  actor(w, who).extensionState[LAST] as Data | undefined;
/** The person's events of this round made while running the search, in order. */
const types = (w: V7World, who = 'kai') =>
  w.events
    .filter((e) => e.actor === who && e.interface === id)
    .map((e) => e.type);
const mine = (w: V7World, type: string, who = 'kai') =>
  w.events.filter((e) => e.actor === who && e.type === `${PREFIX}-${type}`);
const view = (e: V7Event | undefined) => (e?.data.view ?? {}) as Data;
const berries = (w: V7World, who = 'kai') =>
  w.stacks
    .filter((s) => s.owner === who && s.resource === 'berry')
    .reduce((n, s) => n + s.quantity, 0);
/** The ex26 genesis with both earlier searches and this one installed. */
const installed = () => {
  let w = initialLongWorld('long-ex26', 'long-culture-v2-villages');
  for (const r of [BASE_REVISION, RECHECK_REVISION, REVISION])
    w = v7Clone(v7Install(w, continuousRegistry(w), r));
  return w;
};
/** The person studies in one round and masters the search. */
function learned(world?: V7World, who = 'kai', ability = id) {
  const r = step(world ?? installed(), { [who]: learn(ability) });
  const w = ok(r, who);
  expect(actor(w, who).mastered).toContain(ability);
  return w;
}
/** A copy with Kai's vitals changed (by default to his health 36 and satiety 5 at the pause). */
function weak(w: V7World, vitals: Partial<V7Actor['vitals']> = WEAK) {
  const out = v7Clone(w);
  Object.assign(actor(out).vitals, vitals);
  return out;
}
/** Every berry source empty from genesis (so Kai remembers them empty); Kai learns the search. */
const bare = () => {
  const g = installed();
  for (const o of g.objects.filter((o) => o.data.resource === 'berry'))
    o.data.stock = 0;
  return learned(g);
};
/** bare(), then plain navigate steps north until arrival: the south bush is out of view,
 * remembered. */
function away() {
  let w = bare();
  for (let i = 0; i < 6; i++) {
    const r = step(w, { kai: NORTH });
    w = ok(r);
    if (r.outcomes.kai?.complete) break;
  }
  expect(actor(w).position).toEqual({ x: 131.1, y: 14.3 });
  expect(v7Observe(w, 'kai').objects.some((o) => o.id === SOUTH_EMPTY)).toBe(
    false,
  );
  expect(
    actor(w).memory.objects.find((m) => m.object.id === SOUTH_EMPTY)?.object
      .data.stock,
  ).toBe(0);
  return weak(w, { health: WEAK.health });
}
/** Repeats the action until it completes; returns every round's result. */
function drive(w: V7World, action: V7Action, max = 40, who = 'kai') {
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
/** The low-health mode with Kai's inputs, some of them left out. */
const omitting = (keys: string[]): V7Action => {
  const action = low();
  for (const k of keys)
    action.args = Object.fromEntries(
      Object.entries(action.args).filter(([x]) => x !== k),
    );
  return action;
};
const injure = (a: V7Actor, w: V7World) =>
  (a.memory.important ??= []).push({
    tick: w.tick,
    event: 'fixture',
    type: 'injured',
    summary: 'Hurt.',
  });

/** The world as bounded-resource-search-recheck@1 and this search should both leave it: every
 * person, object, item and process, and every event by identity, kind, person, interface and
 * target. The search's own records and event data are left out; its interface name and run id
 * prefix read as recheck@1's. */
const normal = (w: V7World) =>
  v7Signature(normalWorld(w))
    .replaceAll(id, RECHECK)
    .replaceAll(`${PREFIX}-`, `${RECHECK_PREFIX}-`);
function normalWorld(w: V7World) {
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
      type: e.type,
      interface: e.interface,
      target: e.target,
      success: e.success,
      position: e.position,
      description: e.description,
    })),
    actors: w.actors.map((a) => ({
      ...a,
      extensionState: Object.fromEntries(
        Object.entries(a.extensionState).filter(
          ([k]) => !k.startsWith(`${RECHECK}:`) && !k.startsWith(`${id}:`),
        ),
      ),
      memory: {
        ...a.memory,
        important: (a.memory.important ?? []).map((e) => ({
          tick: e.tick,
          event: e.event,
          type: e.type,
        })),
        experiences: a.memory.experiences.map((e) => ({
          tick: e.tick,
          event: e.event,
        })),
      },
    })),
  };
}
/** The fields of a recheck@1 record, without its run id. */
const common = (base: Data | undefined, other: Data | undefined) => {
  const keys = Object.keys(base ?? {}).filter((k) => k !== 'id');
  return [
    Object.fromEntries(keys.map((k) => [k, base?.[k]])),
    Object.fromEntries(keys.map((k) => [k, other?.[k]])),
  ];
};

describe('bounded search with a low-health mode in ex26', () => {
  it('is registered sixth for long-ex26, with new names, learning 1, the size limit, no excluded word and every earlier package byte-identical', () => {
    const pkg = lowPackage();
    const ability = pkg.abilities[0];
    if (!ability) throw new Error('Missing ability.');
    // The sixth long-ex26 package; later developments of this run append their own after it.
    expect(
      V7_PACKAGES.filter((p) => p.scope === 'long-ex26')
        .map((p) => p.id)
        .slice(0, 6),
    ).toEqual([
      BASE,
      'reciprocal-conversation',
      'tend-rooted-plants',
      'assess-food-suitability',
      RECHECK,
      id,
    ]);
    expect(pkg).toMatchObject({
      id,
      version: 1,
      scope: 'long-ex26',
      dependencies: [
        'foundation-forest@1',
        'foundation-open@1',
        BASE_REVISION,
        RECHECK_REVISION,
      ],
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
      equivalence: 'forage:bounded-search-and-collection:low-health:1',
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
    // recheck@1's parameters with the same bounds, minHealth widened to 20, then lowHealth.
    const base = V7_PACKAGES.find((p) => p.id === RECHECK)?.abilities[0];
    const properties = ability.parameters.properties ?? {};
    expect(Object.keys(properties)).toEqual([
      ...Object.keys(base?.parameters.properties ?? {}),
      'lowHealth',
    ]);
    for (const [k, v] of Object.entries(base?.parameters.properties ?? {}))
      if (k !== 'minHealth') expect(properties[k], k).toEqual(v);
    expect(base?.parameters.properties?.minHealth).toEqual({
      type: 'number',
      minimum: 60,
      maximum: 100,
    });
    expect(properties.minHealth).toEqual({
      type: 'number',
      minimum: 20,
      maximum: 100,
    });
    expect(properties.lowHealth).toEqual({ type: 'boolean' });
    expect(ability.parameters.required).toEqual(['mode']);
    expect(ability.parameters.additionalProperties).toBe(false);
    expect(ability.costs).toBe(base?.costs);
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
    expect(Object.keys(map)).toHaveLength(140);
    expect(sha(map)).toBe(EXISTING_DIGEST);
    expect(map[RECHECK_REVISION]).toBe(RECHECK_SHA);
    expect(map[BASE_REVISION]).toBe(BASE_SHA);
    // Only the current scope can install it, only after both searches, with operation continuity.
    const other = initialLongWorld('long-ex25', 'long-culture-v2-villages');
    expect(continuousRegistry(other).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(other, continuousRegistry(), REVISION)).toThrow(
      /not approved/,
    );
    const genesis = initialLongWorld('long-ex26', 'long-culture-v2-villages');
    const baseOnly = v7Clone(
      v7Install(genesis, continuousRegistry(genesis), BASE_REVISION),
    );
    expect(() =>
      v7Install(baseOnly, continuousRegistry(baseOnly), REVISION),
    ).toThrow(/dependency-incomplete/);
    const both = v7Clone(
      v7Install(baseOnly, continuousRegistry(baseOnly), RECHECK_REVISION),
    );
    both.state.operationContinuity = 0;
    expect(() => v7Install(both, continuousRegistry(both), REVISION)).toThrow(
      /operation continuity/,
    );
    // Installing changes no person, object, item or process.
    const before = initialLongWorld('long-ex26', 'long-culture-v2-villages');
    expect(v7Signature(g.actors)).toBe(v7Signature(before.actors));
    expect(v7Signature(g.objects)).toBe(v7Signature(before.objects));
    expect(v7Signature(g.stacks)).toBe(v7Signature(before.stacks));
    expect(g.processes).toEqual(before.processes);
    expect(g.revisions.slice(-3)).toEqual([
      BASE_REVISION,
      RECHECK_REVISION,
      REVISION,
    ]);
  });

  it('is learned by Kai in one round of study without energy, and only by a person with navigate, probe and gather', () => {
    const g = installed();
    const unlearned = step(g, { kai: low() });
    expect(unlearned.outcomes.kai?.success).toBe(false);
    expect(unlearned.outcomes.kai?.reason).toMatch(/not mastered/);
    // Neither the request nor the mastery of recheck@1 teaches it.
    const recheck = learned(g, 'kai', RECHECK);
    expect(actor(recheck).mastered).not.toContain(id);
    const r = step(g, { kai: learn(id) });
    const w = ok(r);
    expect(r.outcomes.kai?.reason).toMatch(/after one round of study/);
    expect(actor(w).mastered).toContain(id);
    expect(actor(w).learning).toBeNull();
    // Study costs nothing but the round: the vitals are those of a waiting person.
    const idle = step(g).world;
    expect(actor(w).vitals).toEqual(actor(idle).vitals);
    // At his low health, too.
    const sick = weak(g);
    expect(actor(ok(step(sick, { kai: learn(id) }))).vitals).toEqual(
      actor(step(sick).world).vitals,
    );
    // Moss has not mastered probe in this genesis, so the study is refused.
    expect(actor(g, 'moss').mastered).not.toContain('probe');
    const moss = step(g, { moss: learn(id) });
    expect(moss.outcomes.moss?.success).toBe(false);
    expect(moss.outcomes.moss?.reason).toMatch(/prerequisites/);
    // A person who no longer has gather cannot run it.
    const lost = v7Clone(w);
    actor(lost).mastered = actor(lost).mastered.filter((x) => x !== 'gather');
    const run = step(lost, { kai: search() });
    expect(run.outcomes.kai?.success).toBe(false);
    expect(run.outcomes.kai?.reason).toMatch(/capability/);
  });

  it('without lowHealth takes exactly the steps of bounded-resource-search-recheck@1, round by round, in every earlier mode', () => {
    // Kai masters both; each plan runs once with recheck@1 and once with this search.
    const twins = learned(learned(installed(), 'kai', RECHECK));
    const start =
      (args: Data = {}) =>
      (iface: string) =>
        search(args, iface);
    const larder = (w: V7World) => object(w, LARDER).spatial;
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
          { energy: 6 },
          { quantity: 2 },
          { recheck: true, reserve: 0.5 },
          { minHealth: 100 },
          { minTemp: 25 },
          { minTemp: 20, maxTemp: 21 },
          { avoidDirections: ['south'], radius: 6, path: 8, energy: 20 },
          { avoidDirections: ['east', 'east'] },
        ] as Data[]
      ).map((args) => ({ name: JSON.stringify(args), rounds: start(args) })),
      {
        // Kai's own bush is left out; he goes to the next one.
        name: 'avoided area',
        rounds: start({
          radius: 6,
          path: 8,
          energy: 20,
          avoidAreas: [{ x: 130.84, y: 18.71, radius: 1 }],
        }),
      },
      {
        name: 'emergency at satiety 6',
        setup: (w) => {
          actor(w).vitals.satiety = 6;
        },
        rounds: start({ emergency: true }),
      },
      {
        name: 'satiety 6 without emergency',
        setup: (w) => {
          actor(w).vitals.satiety = 6;
        },
        rounds: [start({ recheck: true })],
      },
      {
        name: 'health 55 with emergency',
        setup: (w) => {
          actor(w).vitals.health = 55;
        },
        rounds: [start({ emergency: true })],
      },
      {
        name: 'minHealth during',
        rounds: [start({ minHealth: 80 }), start({ minHealth: 80 })],
        edit: (w, round) => {
          if (round === 1) actor(w).vitals.health = 75;
        },
      },
      {
        name: 'injury during',
        rounds: [start({ emergency: true }), start({ emergency: true })],
        edit: (w, round) => {
          if (round === 1) injure(actor(w), w);
        },
      },
      {
        // Outside low-health mode starvation damage is an injury that stops it, as in recheck@1.
        name: 'starving with emergency',
        setup: (w) => {
          actor(w).vitals.satiety = 0;
        },
        rounds: [
          start({ emergency: true }),
          start({ emergency: true }),
          start({ emergency: true }),
        ],
      },
      {
        name: 'recheck exhausted',
        setup: (w) => {
          for (const o of w.objects.filter((o) => o.data.resource === 'berry'))
            o.data.stock = 0;
        },
        rounds: start({
          radius: 6,
          path: 16,
          time: 40,
          energy: 30,
          reserve: 4,
          quantity: 2,
          recheck: true,
          emergency: true,
        }),
      },
      {
        name: 'pause and resume',
        rounds: [
          start({ recheck: true }),
          () => WAIT,
          start({ recheck: true }),
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
        name: 'explore',
        setup: (w) => {
          for (const o of w.objects.filter((o) => o.data.resource === 'berry'))
            o.data.stock = 0;
          w.objects.push({
            ...v7Clone(object(w, LARDER)),
            id: 'fixture-berry',
            spatial: { ...larder(w), x: 137, y: 12.5 },
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
        const ra = step(a, { kai: act(RECHECK) });
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
          (ob?.reason ?? '').replaceAll(`${PREFIX}-`, `${RECHECK_PREFIX}-`),
          plan.name,
        ).toBe(oa?.reason ?? '');
        expect(normal(b), `${plan.name} ${String(round)}`).toBe(normal(a));
        const [x, y] = common(
          actor(a).extensionState[`${RECHECK}:work:open`] as Data,
          open(b),
        );
        expect(y, plan.name).toEqual(x);
        const [p, q] = common(
          actor(a).extensionState[`${RECHECK}:last`] as Data,
          last(b),
        );
        expect(q, plan.name).toEqual(p);
        compared += 1;
        if (!list && oa?.complete) break;
      }
      // The record of an earlier mode never has the low-health mode.
      const record = last(b) ?? open(b);
      if (record) expect(record.lowHealth, plan.name).toBe(false);
    }
    expect(compared).toBeGreaterThanOrEqual(60);
    // Outside low-health mode minHealth keeps recheck@1's range of 60 to 100, refused at no cost.
    const r = step(twins, { kai: search({ minHealth: 50 }, RECHECK) });
    expect(r.outcomes.kai?.success).toBe(false);
    expect(r.outcomes.kai?.reason).toMatch(/minHealth/);
    const own = refused(
      step(twins, { kai: search({ minHealth: 50 }) }),
      /minHealth below 60 needs lowHealth: true/,
    );
    expect(actor(own).vitals).toEqual(actor(r.world).vitals);
    expect(actor(own).position).toEqual(actor(r.world).position);
    expect(open(own)).toBeUndefined();
  });

  it('lowHealth: the threshold defaults to 20, accepts 20 to 100, refuses anything else at no cost and stops at health at or below it', () => {
    const base = weak(learned(learned(installed(), 'kai', RECHECK)));
    // At health 36 neither earlier search starts, emergency or not.
    for (const action of [
      search({ emergency: true, recheck: true }, RECHECK),
      search({ emergency: true, recheck: true }),
    ])
      refused(step(base, { kai: action }), /health 36 is at or below 60/);
    // The default is 20.
    const w = ok(step(base, { kai: low() }));
    expect(open(w)).toMatchObject({
      lowHealth: true,
      emergency: true,
      minHealth: 20,
      status: 'active',
    });
    expect(mine(w, 'started')[0]?.description).toMatch(
      /in low-health mode \(health 20 or below stops it; low satiety or starvation damage alone does not\)/,
    );
    expect(view(mine(w, 'started')[0])).toMatchObject({ minHealth: 20 });
    expect(mine(w, 'started')[0]?.data.modes).toEqual({
      recheck: false,
      emergency: true,
      lowHealth: true,
    });
    // Outside the range: refused by the declared bounds, nothing spent and nothing opened.
    const refusal = step(base, {
      kai: { interface: 'no-such-interface', args: {} },
    });
    expect(refusal.outcomes.kai?.success).toBe(false);
    for (const minHealth of [19.9, 10, 0, 100.5, -5]) {
      const r = step(base, { kai: low({ minHealth }) });
      expect(r.outcomes.kai?.success, String(minHealth)).toBe(false);
      expect(r.outcomes.kai?.reason).toMatch(/minHealth/);
      expect(actor(r.world).position).toEqual(actor(base).position);
      // The vitals of any refused round, with no energy spent on the search.
      expect(actor(r.world).vitals).toEqual(actor(refusal.world).vitals);
      expect(open(r.world)).toBeUndefined();
      expect(
        r.world.events.filter(
          (e) => e.actor === 'kai' && e.type.startsWith(`${PREFIX}-`),
        ),
      ).toEqual([]);
    }
    // Inside the range: the stop is health at or below the threshold.
    for (const [minHealth, starts] of [
      [20, true],
      [35.9, true],
      [36, false],
      [60, false],
      [100, false],
    ] as const) {
      const r = step(base, { kai: low({ minHealth }) });
      if (starts) expect(open(ok(r))?.minHealth).toBe(minHealth);
      else
        refused(
          r,
          new RegExp(
            `health 36 is at or below your minimum of ${String(minHealth)}`,
          ),
        );
    }
    // During a run: health falls to the threshold before the next step, which is not taken.
    for (const [minHealth, health, stops] of [
      [30, 30, true],
      [30, 30.5, false],
      [undefined, 20, true],
      [undefined, 20.01, false],
    ] as const) {
      const s = ok(
        step(base, {
          kai: low(minHealth === undefined ? {} : { minHealth }),
        }),
      );
      actor(s).vitals.health = health;
      const p0 = { ...actor(s).position },
        e0 = actor(s).vitals.energy;
      const r = step(s, {
        kai: low(minHealth === undefined ? {} : { minHealth }),
      });
      const after = ok(r);
      if (stops) {
        expect(r.outcomes.kai?.complete).toBe(true);
        expect(types(after)).toEqual([`${PREFIX}-stopped`]);
        expect(last(after)).toMatchObject({
          status: 'stopped',
          reason: 'unsafe',
        });
        expect(String(last(after)?.detail)).toMatch(
          `health ${String(health)} is at or below your minimum of ${String(minHealth ?? 20)}`,
        );
        expect(actor(after).position).toEqual(p0);
        expect(actor(after).vitals.energy).toBe(e0);
        expect(view(mine(after, 'stopped')[0])).toMatchObject({
          complete: false,
          outcome: 'stopped',
        });
      } else {
        expect(open(after)).toMatchObject({ status: 'active' });
        expect(types(after).length).toBeGreaterThan(0);
      }
    }
  });

  it('lowHealth: continues at health 36 and satiety 5, while injury, body temperature, the supplied bounds, the reserve and every limit still stop it', () => {
    const base = weak(learned());
    expect(actor(base).vitals).toMatchObject(WEAK);
    // Walk, probe, gather 4 while satiety falls further; nothing is eaten, nobody is healed.
    const e0 = actor(base).vitals.energy;
    const d = drive(base, low());
    expect(d.rounds).toHaveLength(3);
    for (const r of d.rounds) {
      expect(actor(r.world).vitals.satiety).toBeLessThanOrEqual(5);
      expect(actor(r.world).vitals.health).toBe(36);
    }
    expect(last(d.world)).toMatchObject({
      status: 'completed',
      reason: 'quantity-cap',
      lowHealth: true,
      collected: 4,
    });
    expect(view(mine(d.world, 'completed')[0])).toMatchObject({
      complete: true,
      outcome: 'complete',
      collected: 4,
    });
    expect(berries(d.world)).toBe(4);
    expect(actor(d.world).vitals.energy).toBeCloseTo(e0 - 1.6 - 0.2 - 8, 6);
    let idle = base;
    for (let i = 0; i < 3; i++) idle = step(idle).world;
    expect(actor(d.world).vitals.satiety).toBe(actor(idle).vitals.satiety);
    expect(actor(d.world).vitals.health).toBe(actor(idle).vitals.health);
    expect(
      d.world.events.some(
        (e) => e.actor === 'kai' && ['ate', 'healed'].includes(e.type),
      ),
    ).toBe(false);
    // Every other stop at the start, at no cost.
    const at = (edit: (a: V7Actor, w: V7World) => void) => {
      const w = v7Clone(base);
      edit(actor(w), w);
      return w;
    };
    for (const [world, action, pattern] of [
      [at(injure), low(), /injured in the last round/],
      [at((a) => (a.vitals.temperature = 32)), low(), /10 or more from 22/],
      [at((a) => (a.vitals.temperature = 12)), low(), /10 or more from 22/],
      [
        at((a) => (a.vitals.temperature = 24)),
        low({ maxTemp: 23 }),
        /above your maximum of 23/,
      ],
      [
        at((a) => (a.vitals.temperature = 20)),
        low({ minTemp: 21 }),
        /below your minimum of 21/,
      ],
      [
        base,
        low({ minTemp: 25, maxTemp: 24 }),
        /minTemp must be below maxTemp/,
      ],
      [
        base,
        low({ reserve: 0.5 }),
        /low-health mode a search for food keeps a reserve of at least 1 energy, what eat costs/,
      ],
      [
        at((a) => (a.vitals.energy = 3)),
        low({ reserve: 3 }),
        /not above the reserve/,
      ],
      // Every limit must be above 0.
      [base, low({ path: 0 }), /give finite path above 0/],
      [base, low({ energy: 0 }), /give finite energy above 0/],
      [base, low({ path: 0, energy: 0 }), /give finite path, energy above 0/],
      // Every limit is supplied by the person.
      [base, omitting(['radius']), /start needs radius/],
      [base, omitting(['time']), /start needs time/],
      [base, omitting(['quantity', 'path']), /start needs path, quantity/],
    ] as const) {
      const before = v7Clone(world);
      const r = refused(step(world, { kai: action }), pattern);
      expect(actor(r).position).toEqual(actor(before).position);
      expect(open(r)).toBeUndefined();
    }
    // Stops during the search, before the next step.
    for (const [edit, args, pattern] of [
      [injure, {}, /injured in the last round/],
      [(a: V7Actor) => (a.vitals.temperature = 11), {}, /10 or more from 22/],
      [(a: V7Actor) => (a.vitals.temperature = 33), {}, /10 or more from 22/],
      [
        (a: V7Actor) => (a.vitals.temperature = 26),
        { maxTemp: 25 },
        /above your maximum of 25/,
      ],
      [
        (a: V7Actor) => (a.vitals.temperature = 17),
        { minTemp: 18 },
        /below your minimum of 18/,
      ],
    ] as const) {
      const s = ok(step(base, { kai: low(args) }));
      edit(actor(s), s);
      const p0 = { ...actor(s).position },
        energy = actor(s).vitals.energy;
      const r = step(s, { kai: low(args) });
      const w = ok(r);
      expect(r.outcomes.kai?.complete).toBe(true);
      expect(types(w)).toEqual([`${PREFIX}-stopped`]);
      expect(last(w)).toMatchObject({ status: 'stopped', reason: 'unsafe' });
      expect(String(last(w)?.detail)).toMatch(pattern);
      expect(actor(w).position).toEqual(p0);
      expect(actor(w).vitals.energy).toBe(energy);
    }
    // Every limit in low-health mode, as in the earlier modes.
    const p0 = { ...actor(base).position };
    for (const [args, reason] of [
      [{ path: 0.5 }, 'path-limit'],
      [{ time: 2 }, 'time-limit'],
      [{ energy: 3 }, 'energy-budget'],
      [{ reserve: 37 }, 'energy-reserve'],
    ] as const) {
      const run = drive(base, low(args));
      expect(run.rounds).toHaveLength(1);
      expect(last(run.world)).toMatchObject({
        status: 'stopped',
        reason,
        distance: 0,
        energy: 0,
      });
      expect(actor(run.world).position).toEqual(p0);
      expect(actor(run.world).vitals.energy).toBe(e0);
      expect(view(mine(run.world, 'stopped')[0])).toMatchObject({
        complete: false,
        outcome: 'stopped',
      });
      expect(mine(run.world, 'stopped')[0]?.data.stop).toBe(reason);
    }
    expect(last(drive(base, low({ quantity: 2 })).world)).toMatchObject({
      status: 'completed',
      reason: 'quantity-cap',
      collected: 2,
    });
    expect(last(drive(base, low({ energy: 6 })).world)).toMatchObject({
      status: 'stopped',
      reason: 'energy-budget',
      collected: 2,
    });
    // The time limit counts every round: three rounds allow walk, probe and one gather.
    expect(last(drive(base, low({ time: 3 })).world)).toMatchObject({
      collected: 4,
    });
    // With 4.8 energy and the eat-cost reserve of 1: walk, probe and one unit, then no further
    // unit fits above the reserve; the energy never falls below it.
    const tired = v7Clone(base);
    actor(tired).vitals.energy = 4.8;
    const t = drive(tired, low({ reserve: 1 }));
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

  it('lowHealth: starvation damage alone does not stop it and health at or below minHealth does, so no run steps into a starvation death; thermal or any other injury still stops it', () => {
    const fed = learned(learned(installed(), 'kai', RECHECK));
    const base = weak(fed, { health: 36, satiety: 0 });
    // At satiety 0 each round's physiology takes the world's starvation damage of 8.
    expect(base.config.starvation).toBe(8);
    const wide = (args: Data = {}) =>
      low({
        radius: 8,
        path: 16,
        time: 40,
        energy: 30,
        reserve: 4,
        quantity: 4,
        recheck: true,
        ...args,
      });
    // Health 36 at satiety 0: a step at 36 and at 28 while starvation takes 8 a round, then the
    // default threshold stops it at 20 before a third step.
    const rounds: Round[] = [];
    let w = base;
    for (let i = 0; i < 6; i++) {
      const before = actor(w).vitals.health;
      const r = step(w, { kai: wide() });
      w = ok(r);
      rounds.push(r);
      const hurt = w.events.filter(
        (e) => e.actor === 'kai' && e.type === 'injured',
      );
      // Physiology alone: starvation 8, no thermal damage, one injured event per round.
      expect(hurt).toHaveLength(1);
      expect(hurt[0]?.description).toBe('Physiological damage: starvation.');
      expect(hurt[0]?.data).toMatchObject({ starvation: 8, thermal: 0 });
      expect(actor(w).vitals.health).toBe(before - 8);
      if (r.outcomes.kai?.complete) break;
    }
    expect(rounds).toHaveLength(3);
    expect(types(rounds[0]?.world ?? w)).toEqual([
      `${PREFIX}-started`,
      'arrived',
      `${PREFIX}-moved`,
    ]);
    expect(types(rounds[1]?.world ?? w)).toEqual([
      'trial-result',
      `${PREFIX}-inspected`,
    ]);
    expect(types(w)).toEqual([`${PREFIX}-stopped`]);
    expect(last(w)).toMatchObject({
      status: 'stopped',
      reason: 'unsafe',
      lowHealth: true,
    });
    expect(String(last(w)?.detail)).toBe(
      'health 20 is at or below your minimum of 20.',
    );
    expect(
      rounds.some((r) =>
        r.world.events.some((e) => e.actor === 'kai' && e.type === 'died'),
      ),
    ).toBe(false);
    // Each step round began above the threshold and the stop came at or below it: whatever the
    // threshold, the run stops more than 0 above death and never steps into it.
    for (const minHealth of [20, 25, 28, 30, 35.5]) {
      let x = weak(bare(), { health: 36, satiety: 0 });
      for (let i = 0; i < 8; i++) {
        const start = actor(x).vitals.health;
        const r = step(x, { kai: wide({ minHealth }) });
        x = ok(r);
        const stepped = types(x).some((t) =>
          [
            `${PREFIX}-moved`,
            `${PREFIX}-empty`,
            `${PREFIX}-inspected`,
          ].includes(t),
        );
        if (r.outcomes.kai?.complete) {
          expect(start, String(minHealth)).toBeLessThanOrEqual(minHealth);
          expect(start).toBeGreaterThan(0);
          expect(stepped).toBe(false);
          expect(String(last(x)?.detail)).toMatch(
            `is at or below your minimum of ${String(minHealth)}`,
          );
          break;
        }
        expect(start, String(minHealth)).toBeGreaterThan(minHealth);
        expect(stepped).toBe(true);
      }
      expect(last(x)).toMatchObject({ status: 'stopped', reason: 'unsafe' });
    }
    // A person already starving may start: one round of waiting at satiety 0, then the start.
    const waited = step(base).world;
    expect(actor(waited).vitals.health).toBe(28);
    expect(actor(waited).extensionState[`${id}:body`]).toEqual({
      tick: waited.tick,
      health: 36,
    });
    const started = ok(step(waited, { kai: wide() }));
    expect(open(started)).toMatchObject({ status: 'active', moves: 1 });
    // Not starvation alone: each still stops the next round, at no cost.
    const after1 = ok(step(base, { kai: wide() }));
    const notAlone: [string, (x: V7World) => void][] = [
      // More health lost than starvation takes, as if thermal damage were part of it.
      [
        'more than starvation',
        (x) => {
          actor(x).vitals.health -= 0.5;
        },
      ],
      // A second injured record of the same round.
      ['another injury', (x) => injure(actor(x), x)],
      // No health kept before that physiology: no evidence that it was starvation alone.
      [
        'no kept health',
        (x) => {
          delete actor(x).extensionState[
            'bounded-resource-search-low-health:body'
          ];
        },
      ],
      // The injury described as thermal exposure.
      [
        'thermal',
        (x) => {
          for (const e of actor(x).memory.important ?? [])
            if (e.type === 'injured' && e.tick === x.tick)
              e.summary = 'Physiological damage: thermal exposure.';
        },
      ],
    ];
    for (const [name, edit] of notAlone) {
      const x = v7Clone(after1);
      edit(x);
      const p0 = { ...actor(x).position },
        e0 = actor(x).vitals.energy;
      const r = step(x, { kai: wide() });
      const y = ok(r);
      expect(types(y), name).toEqual([`${PREFIX}-stopped`]);
      expect(String(last(y)?.detail), name).toMatch(
        /injured in the last round/,
      );
      expect(actor(y).position).toEqual(p0);
      expect(actor(y).vitals.energy).toBe(e0);
    }
    // A thermal or other injury while fed stops it too, and so does it at the start.
    const warm = weak(fed);
    const s0 = ok(step(warm, { kai: wide() }));
    (actor(s0).memory.important ??= []).push({
      tick: s0.tick,
      event: 'fixture',
      type: 'injured',
      summary: 'Physiological damage: thermal exposure.',
    });
    expect(types(ok(step(s0, { kai: wide() })))).toEqual([`${PREFIX}-stopped`]);
    const hurtAtStart = v7Clone(warm);
    injure(actor(hurtAtStart), hurtAtStart);
    refused(step(hurtAtStart, { kai: wide() }), /injured in the last round/);
    // The kept health is a plain record of the person's own body, cleared once fed again.
    const fedAgain = v7Clone(waited);
    actor(fedAgain).vitals.satiety = 30;
    expect(
      actor(step(fedAgain).world).extensionState[`${id}:body`],
    ).toBeUndefined();
    // recheck@1 itself is unchanged: at health 36 it does not start, starving or not.
    refused(
      step(base, { kai: search({ emergency: true, recheck: true }, RECHECK) }),
      /health 36 is at or below 60/,
    );
  });

  it("lowHealth: a food search needs the reserve of 1 and Kai's own eating record of that food as edible and nontoxic", () => {
    const base = weak(learned());
    expect(actor(base).memory.discoveries?.berry).toMatchObject({
      nutrition: 8,
      toxicity: 0,
    });
    const without = (edit: (record: Data | undefined, a: V7Actor) => void) => {
      const w = v7Clone(base);
      edit(actor(w).memory.discoveries?.berry, actor(w));
      return w;
    };
    for (const world of [
      without((_, a) => {
        delete a.memory.discoveries?.berry;
      }),
      without((r) => {
        if (r) r.toxicity = 3;
      }),
      without((r) => {
        if (r) r.nutrition = 0;
      }),
      without((r) => {
        if (r) delete r.toxicity;
      }),
    ]) {
      const r = refused(
        step(world, { kai: low({ recheck: true }) }),
        /needs your own eating record of berry as edible and nontoxic/,
      );
      expect(open(r)).toBeUndefined();
    }
    // The record is Kai's own: another person's record does not count.
    const lent = without((_, a) => {
      delete a.memory.discoveries?.berry;
    });
    expect(actor(lent, 'lin').memory.discoveries?.berry).toBeTruthy();
    refused(step(lent, { kai: low() }), /own eating record of berry/);
    // Kai has seen roots but never eaten one: a root search is refused, not guessed.
    expect(actor(base).memory.discoveries?.root).toBeUndefined();
    expect(
      actor(base).memory.objects.some((m) => m.object.data.resource === 'root'),
    ).toBe(true);
    refused(
      step(base, { kai: low({ resource: 'root' }) }),
      /own eating record of root as edible and nontoxic/,
    );
    // The reserve of 1, what eat costs, comes first for food.
    refused(
      step(base, { kai: low({ reserve: 0.9 }) }),
      /reserve of at least 1/,
    );
    // A resource that is not food needs no eating record and no reserve of 1.
    const sticks = ok(
      step(base, {
        kai: low({ resource: 'branch', reserve: 0, quantity: 1 }),
      }),
    );
    expect(mine(sticks, 'started')).toHaveLength(1);
    // The earlier modes ask for no eating record, as recheck@1.
    const healthy = without((_, a) => {
      delete a.memory.discoveries?.berry;
      a.vitals.health = 90;
      a.vitals.satiety = 70;
    });
    expect(
      open(ok(step(healthy, { kai: search({ recheck: true }) }))),
    ).toMatchObject({ lowHealth: false, status: 'active' });
  });

  it('lowHealth with recheck: walks to a remembered empty bush through navigate only as a destination, learns its stock by a fresh probe within reach, and never reads hidden stock', () => {
    const base = away();
    const here = { ...actor(base).position };
    // Only the remembered bush lies inside the area: radius 1 around its remembered place.
    const target = object(base, SOUTH_EMPTY).spatial;
    const area = {
      x: target.x,
      y: target.y,
      radius: 1,
      path: 8,
      energy: 20,
      reserve: 4,
      quantity: 2,
    };
    for (const regrown of [0, 2]) {
      const w0 = v7Clone(base);
      object(w0, SOUTH_EMPTY).data.stock = regrown;
      // Without recheck the low-health search does not go there: it was last seen empty, and the
      // bush's real stock out of view is never read.
      const ordinary = drive(w0, low(area));
      expect(ordinary.rounds).toHaveLength(1);
      expect(last(ordinary.world)).toMatchObject({
        status: 'completed',
        reason: 'search-exhausted',
        moves: 0,
        probes: 0,
      });
      expect(actor(ordinary.world).position).toEqual(here);
      // recheck walks there through navigate; Kai's memory gives only the place, never its stock.
      const d = drive(w0, low({ ...area, recheck: true }));
      let before = w0;
      let walking = 0,
        remembered = 0;
      for (const r of d.rounds) {
        const w = r.world;
        const moved = mine(w, 'moved')[0];
        const kernel = w.events.filter(
          (e) =>
            e.actor === 'kai' &&
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
          const inView = v7Observe(before, 'kai').objects.some(
            (o) => o.id === SOUTH_EMPTY,
          );
          if (!inView) {
            // A remembered place: past stock, never shown as current.
            remembered += 1;
            expect(view(moved)).toMatchObject({
              source: SOUTH_EMPTY,
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
        (e) =>
          e.actor === 'kai' &&
          e.type === 'trial-result' &&
          e.data.key === `${SOUTH_EMPTY}:observed-state`,
      );
      expect(view(inspection)).toMatchObject({
        source: SOUTH_EMPTY,
        evidence: 'probe',
        available: regrown,
        outcome: regrown ? 'stock-observed' : 'observed-empty',
        underlying: trial?.id,
      });
      expect(
        actor(pw).memory.knowledge?.[`${SOUTH_EMPTY}:observed-state`],
      ).toMatchObject({
        tick: pw.tick,
        evidence: trial?.id,
        value: { stock: regrown },
      });
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
        expect(object(d.world, SOUTH_EMPTY).data.stock).toBe(0);
        expect(
          d.world.stacks
            .filter((s) => s.owner === 'kai')
            .map((s) => [s.resource, s.quantity, s.origin]),
        ).toEqual([['berry', 2, SOUTH_EMPTY]]);
        expect(view(mine(d.world, 'collected')[0])).toMatchObject({
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
          empty: [SOUTH_EMPTY],
        });
        expect(berries(d.world)).toBe(0);
        expect(view(mine(d.world, 'completed')[0])).toMatchObject({
          complete: false,
          outcome: 'incomplete',
        });
      }
    }
  });

  it('lowHealth with recheck: inspects each empty source at most once per run, even after a long pause; a new run, or stock seen again, is new evidence', () => {
    const w0 = weak(bare(), { health: WEAK.health });
    const args = {
      radius: 6,
      path: 16,
      time: 40,
      energy: 30,
      reserve: 4,
      quantity: 2,
      recheck: true,
    };
    // Four steps, then twenty rounds of other actions, then resume until the end.
    let w = w0;
    const rounds: Round[] = [];
    for (let i = 0; i < 4; i++) {
      const r = step(w, { kai: low(args) });
      w = ok(r);
      rounds.push(r);
    }
    const early = probesOf(open(w));
    for (let i = 0; i < 20; i++) w = ok(step(w));
    expect(open(w)).toMatchObject({ status: 'paused' });
    for (let i = 0; i < 40; i++) {
      const r = step(w, { kai: control('resume') });
      w = ok(r);
      rounds.push(r);
      if (r.outcomes.kai?.complete) break;
    }
    const end = last(w);
    expect(end).toMatchObject({ lowHealth: true, status: 'completed' });
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
    const again = drive(w, low({ ...args, time: 10 })).world;
    expect([...probesOf(last(again)).keys()].some((s) => probes.has(s))).toBe(
      true,
    );
    // New observable evidence: a bush inspected empty and then seen with stock is a candidate.
    let s = w0;
    let first = '';
    for (let i = 0; i < 6; i++) {
      s = ok(step(s, { kai: low(args) }));
      first = [...probesOf(open(s)).keys()][0] ?? '';
      if (first) break;
    }
    expect(open(s)?.empty).toContain(first);
    expect(v7Observe(s, 'kai').objects.some((o) => o.id === first)).toBe(true);
    object(s, first).data.stock = 1;
    const seen = drive(s, low(args)).world;
    expect(last(seen)?.transfers).toEqual([
      expect.objectContaining({ source: first, quantity: 1 }),
    ]);
    expect(probesOf(last(seen)).get(first)).toBe(2);
  });

  it('lowHealth: never targets a source Kai never observed, even stocked inside the radius', () => {
    // A stocked bush 7.4 from Kai, inside a radius of 8, that he has never seen.
    const plant = (w: V7World) => {
      w.objects.push({
        ...v7Clone(object(w, LARDER)),
        id: 'fixture-berry',
        spatial: { ...object(w, LARDER).spatial, x: 137, y: 12.5 },
        data: { ...object(w, LARDER).data, stock: 3 },
      });
      return w;
    };
    const w0 = plant(weak(bare(), { health: WEAK.health }));
    expect(v7Distance(actor(w0).position, { x: 137, y: 12.5 })).toBeGreaterThan(
      7,
    );
    expect(
      actor(w0).memory.objects.some((m) => m.object.id === 'fixture-berry'),
    ).toBe(false);
    expect(
      v7Observe(w0, 'kai').objects.some((o) => o.id === 'fixture-berry'),
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
    };
    const d = drive(w0, low(tight));
    for (const r of d.rounds) {
      expect(
        v7Observe(r.world, 'kai').objects.some((o) => o.id === 'fixture-berry'),
      ).toBe(false);
      const text = JSON.stringify([
        open(r.world),
        last(r.world),
        r.world.events.filter((e) => e.actor === 'kai'),
      ]);
      expect(text).not.toContain('fixture-berry');
    }
    expect(last(d.world)?.collected).toBe(0);
    expect(object(d.world, 'fixture-berry').data.stock).toBe(3);
    // Wider limits, the south and west left out so the path suffices: it becomes a target only
    // after Kai has seen it himself.
    let w = plant(weak(bare(), { health: WEAK.health }));
    let targeted = false;
    for (let i = 0; i < 40; i++) {
      const knew = actor(w).memory.objects.some(
        (m) => m.object.id === 'fixture-berry',
      );
      const r = step(w, {
        kai: low({
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
      if (r.outcomes.kai?.complete) break;
    }
    expect(targeted).toBe(true);
    expect(last(w)).toMatchObject({ collected: 3, lowHealth: true });
  });

  it('never moves a person faster than navigate: at most 0.8 per round over 60 rounds in low-health mode, so the separation bound holds', () => {
    // Kai, at health 36, searches for 60 rounds with lowHealth and recheck, starting a new wide
    // search whenever one ends and resting when tired, while everyone else rushes toward the
    // other side with navigate.
    let w = weak(learned(), { health: WEAK.health });
    const wide = low({
      radius: 8,
      path: 16,
      time: 40,
      energy: 30,
      reserve: 2,
      quantity: 20,
      recheck: true,
    });
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
    const modes = { recheck: true };
    const weakKai = () => weak(learned());
    const e0 = actor(weakKai()).vitals.energy;
    // Round 1: the start (no cost of its own) and one kernel navigate step of 0.8 for 1.6 energy.
    let w = ok(step(weakKai(), { kai: low(modes) }));
    expect(types(w)).toEqual([
      `${PREFIX}-started`,
      'arrived',
      `${PREFIX}-moved`,
    ]);
    expect(actor(w).vitals.energy).toBeCloseTo(e0 - 1.6, 8);
    expect(open(w)).toMatchObject({
      status: 'active',
      target: LARDER,
      distance: 0.8,
      energy: 1.6,
      moves: 1,
    });
    // Another action takes round 2: the search pauses and keeps its step and charge.
    w = ok(step(w, { kai: WAIT }));
    const paused = mine(w, 'paused');
    expect(paused).toHaveLength(1);
    expect(paused[0]?.interface).toBeNull();
    expect(view(paused[0])).toMatchObject({
      outcome: 'paused',
      complete: false,
    });
    expect(open(w)).toMatchObject({
      status: 'paused',
      distance: 0.8,
      energy: 1.6,
    });
    // A new start is refused while it is open.
    refused(
      step(w, { kai: low(modes) }),
      /give resume to continue it or cancel/,
    );
    // Resume rechecks: the vitals first, then the bush is inspected (probe: 0.2 energy) before
    // any harvest; the paused round still counts toward the time limit.
    const before = actor(w).vitals.energy;
    const low20 = v7Clone(w);
    actor(low20).vitals.health = 20;
    const r20 = ok(step(low20, { kai: control('resume') }));
    expect(types(r20)).toEqual([`${PREFIX}-resumed`, `${PREFIX}-stopped`]);
    expect(actor(r20).vitals.energy).toBe(before);
    w = ok(step(w, { kai: control('resume') }));
    expect(types(w)).toEqual([
      `${PREFIX}-resumed`,
      'trial-result',
      `${PREFIX}-inspected`,
    ]);
    expect(actor(w).vitals.energy).toBeCloseTo(before - 0.2, 8);
    expect(view(mine(w, 'inspected')[0]).time).toBe(3);
    // gather: 2 energy per unit, exactly the units taken from the bush.
    w = ok(step(w, { kai: control('resume') }));
    expect(types(w)).toEqual([
      'gathered',
      `${PREFIX}-collected`,
      `${PREFIX}-completed`,
    ]);
    expect(actor(w).vitals.energy).toBeCloseTo(before - 0.2 - 8, 8);
    expect(object(w, LARDER).data.stock).toBe(0);
    expect(berries(w)).toBe(4);
    expect(view(mine(w, 'completed')[0]).outcome).toBe('complete');
    // Cancel: after a partial harvest the berries stay; spent energy is not refunded.
    let c = weakKai();
    for (let i = 0; i < 2; i++) c = ok(step(c, { kai: low(modes) }));
    object(c, LARDER).data.stock = 2;
    c = ok(step(c, { kai: low(modes) }));
    expect(open(c)).toMatchObject({ status: 'active', collected: 2 });
    const energy = actor(c).vitals.energy;
    const r = step(c, { kai: control('cancel') });
    c = ok(r);
    expect(r.outcomes.kai?.complete).toBe(true);
    expect(types(c)).toEqual([`${PREFIX}-cancelled`]);
    expect(actor(c).vitals.energy).toBe(energy);
    expect(berries(c)).toBe(2);
    expect(open(c)).toBeUndefined();
    expect(last(c)).toMatchObject({
      status: 'cancelled',
      collected: 2,
      energy: 5.8,
    });
    expect(view(mine(c, 'cancelled')[0])).toMatchObject({
      outcome: 'cancelled',
      complete: false,
    });
    refused(step(c, { kai: control('cancel') }), /no open search to cancel/);
    refused(step(c, { kai: control('resume') }), /no open search to resume/);
    // Death: the search ends; carried berries follow the ordinary death rules once.
    let d = weakKai();
    for (let i = 0; i < 2; i++) d = ok(step(d, { kai: low(modes) }));
    object(d, LARDER).data.stock = 2;
    d = ok(step(d, { kai: low(modes) }));
    const where = { ...actor(d).position };
    actor(d).vitals.health = 0.5;
    actor(d).vitals.satiety = 0;
    d = step(d, { kai: WAIT }).world;
    const seen = d.events.filter((e) => e.actor === 'kai').map((e) => e.type);
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
      (s) => s.resource === 'berry' && s.origin === LARDER,
    );
    expect(dropped.reduce((n, s) => n + s.quantity, 0)).toBe(2);
    for (const s of dropped) {
      expect(s.owner).toBeNull();
      expect(s.position).toEqual(where);
    }
    expect(berries(d)).toBe(0);
    refused(step(d, { kai: control('resume') }), /no open search to resume/);
  });

  it('never rewards searching: no satisfaction, mood, practice milestone or progress credit beyond the same steps by hand', () => {
    let w = weak(learned()),
      hand = weak(learned()),
      idle = weak(learned());
    const bush = object(w, LARDER).spatial;
    const manual: V7Action[] = [
      { interface: 'navigate', args: { target: LARDER, x: bush.x, y: bush.y } },
      {
        interface: 'probe',
        args: { target: LARDER, mode: 'observe', intensity: 0 },
      },
      { interface: 'gather', args: { target: LARDER, quantity: 4 } },
    ];
    const seen: V7Event[] = [];
    for (let round = 0; round < 6; round++) {
      w = ok(step(w, round < 3 ? { kai: low({ recheck: true }) } : {}));
      hand = ok(step(hand, { kai: manual[round] ?? WAIT }));
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
    // Repeated empty inspections earn nothing either.
    const empty = weak(bare(), { health: WEAK.health });
    const run = drive(
      empty,
      low({
        radius: 6,
        path: 16,
        time: 40,
        energy: 30,
        reserve: 4,
        recheck: true,
      }),
    );
    let still = empty;
    for (let i = 0; i < run.rounds.length; i++) still = step(still).world;
    expect(probesOf(last(run.world)).size).toBeGreaterThanOrEqual(3);
    expect(actor(run.world).wellbeing.sources).toEqual(
      actor(still).wellbeing.sources,
    );
    expect(
      run.rounds.flatMap((r) =>
        r.world.events.filter(
          (e) =>
            e.actor === 'kai' &&
            [
              'satisfaction',
              'satisfaction-maintained',
              'practice-confirmed',
            ].includes(e.type),
        ),
      ),
    ).toEqual([]);
  });

  it('keeps every agent-visible text free of excluded words and of any mention of the far people', () => {
    const texts: unknown[] = [];
    const keep = (r: Round) => {
      const world = ok(r);
      texts.push(
        world.events.filter((e) => e.actor === 'kai'),
        longOrdinaryInput(world, 'kai').packet.execution,
        open(world),
        last(world),
      );
      return world;
    };
    const modes = { recheck: true };
    let w = keep(step(weak(learned()), { kai: low(modes) }));
    w = keep(step(w, { kai: WAIT }));
    w = keep(step(w, { kai: control('resume') }));
    w = keep(step(w, { kai: control('resume') }));
    // A remembered empty bush, an observed-empty probe, avoided ground, stops and a cancel.
    const a = away();
    const target = object(a, SOUTH_EMPTY).spatial;
    for (const r of drive(
      a,
      low({
        x: target.x,
        y: target.y,
        radius: 1,
        path: 8,
        energy: 20,
        reserve: 4,
        recheck: true,
      }),
    ).rounds)
      keep(r);
    for (const r of drive(
      weak(bare(), { health: WEAK.health }),
      low({
        radius: 8,
        path: 6,
        time: 20,
        energy: 20,
        reserve: 4,
        recheck: true,
        minHealth: 30,
        minTemp: 15,
        maxTemp: 30,
        avoidDirections: ['north'],
        avoidAreas: [{ x: 130.84, y: 18.71, radius: 0.6 }],
      }),
    ).rounds)
      keep(r);
    const weakKai = weak(learned());
    for (const r of drive(weakKai, low({ energy: 3.7 })).rounds) keep(r);
    // Starving: steps while starvation alone takes health, then the stop at the threshold; the
    // health kept before physiology is part of what Kai can look up about himself.
    let starving = weak(learned(), { health: 36, satiety: 0 });
    for (let i = 0; i < 3; i++)
      starving = keep(step(starving, { kai: low({ recheck: true }) }));
    texts.push(actor(starving).extensionState);
    const hurt = v7Clone(weakKai);
    const s0 = keep(step(hurt, { kai: low() }));
    actor(s0).vitals.health = 19;
    keep(step(s0, { kai: low() }));
    const s = keep(step(weakKai, { kai: low() }));
    keep(step(s, { kai: control('cancel') }));
    // The interface as Kai sees it in his ordinary input.
    const input = longOrdinaryInput(w, 'kai');
    texts.push(
      input.packet.abilities,
      input.catalogue.interfaces.filter((x) => x.id === id),
    );
    const text = JSON.stringify(texts);
    expect(text).toContain(`${PREFIX}-paused`);
    expect(text).toContain(`${PREFIX}-empty`);
    expect(text).toContain(`${PREFIX}-stopped`);
    expect(text).toContain('"evidence":"remembered"');
    expect(text).toContain('observed-empty');
    expect(text).toContain('is at or below your minimum of 20');
    expect(text).toContain('starvation damage alone does not');
    expect(text).toContain(`${id}:body`);
    expect(text).toContain(`${PREFIX}-cancelled`);
    expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
    expect(text).not.toMatch(MENTION);
    // The open search is shown with the person's active work under its own key.
    const active = (
      longOrdinaryInput(ok(step(weak(learned()), { kai: low(modes) })), 'kai')
        .packet.execution as { activeState: Data }
    ).activeState;
    expect(Object.keys(active)).toEqual([OPEN]);
  });
});
