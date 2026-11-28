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
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { longOrdinaryInput } from '../src/long-context.js';
import { IMPORT_EXCLUDED_WORDS } from '../src/long-import.js';
import { VILLAGES } from '../src/long-villages.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this limit.
vi.setConfig({ testTimeout: 180_000 });

const id = 'bounded-food-foraging';
const REVISION = `${id}@1`;
const PREFIX = 'food-foraging';
const OPEN = `${id}:work:open`;
const LAST = `${id}:last`;
const BODY = `${id}:body`;
/** The packages whose code it reuses, installed before it and unchanged. */
const BASE_REVISION = 'bounded-resource-search@1';
const RECHECK = 'bounded-resource-search-recheck';
const RECHECK_REVISION = `${RECHECK}@1`;
const LOW = 'bounded-resource-search-low-health';
const LOW_REVISION = `${LOW}@1`;
const ASSESS = 'assess-food-suitability';
const ASSESS_REVISION = `${ASSESS}@1`;
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
 * JSON.stringify of each of the 141 packages registered before this change (the scratch hash
 * file validation-results/scratch/ex26/hashes-before-9.json, taken before this change). */
const EXISTING_DIGEST =
  '9fece11cfbabe0fb8597f6cdbf1468b34823aa5835f902a2b34303e6709e22f7';
/** The reused packages alone: exporting their helpers changed nothing. */
const REUSED_SHA: Record<string, string> = {
  [BASE_REVISION]:
    'bf6a210eab2b0bb9822f6dc915adb48c26a682aba5f2da93fb126984fed3769d',
  [RECHECK_REVISION]:
    'fd88553beb9b02b2dc295f124a44412bdaaac0a5e34fc34eeacae8fb2a372235',
  [LOW_REVISION]:
    '3fe3c7fa3f284df41c58e8715be65207842a9558298388585640cd0fa6f36181',
  [ASSESS_REVISION]:
    'd8297e1aefa680b85ca99e88fe170c4bd19724cadf9c40037277a5dc1c38326a',
};
const MAX_STEP = 0.8;

/** Lin's own berry bush, 1.89 from her start, holding 4 units. */
const BUSH = 'commons-berry-0-0';
/** A root patch 1.82 from Lin's start, holding 4 units: nearer than her bush. */
const ROOTS = 'commons-root-0-0';
/** A hazelnut source within Lin's reach at her start, empty. */
const NUTS = 'start-1-nuts';
/** Berry bushes Lin sees empty at her start, 2.39 and 3.83 away. */
const NEAR_EMPTY = 'forest-berry-1';
/** Observed open ground east of Lin's start. */
const EAST: V7Action = {
  interface: 'navigate',
  args: { target: '', x: 21, y: 15 },
};
/** Lin's ordinary inputs: food within 4 of her, at most 4 distance, 16 rounds and 16 energy,
 * keeping 4 energy, eating up to 2 units, citing her own eating record of berries. */
const LIN = {
  radius: 4,
  path: 4,
  time: 16,
  energy: 16,
  reserve: 4,
  quantity: 2,
  evidenceRefs: ['berry'],
};

type Data = Record<string, unknown>;
type Round = ReturnType<typeof step>;
const sha = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const forage = (args: Data = {}): V7Action => ({
  interface: id,
  args: { mode: 'start', ...LIN, ...args },
});
const control = (mode: 'resume' | 'cancel'): V7Action => ({
  interface: id,
  args: { mode },
});
const pkgOf = (pid: string): V7Package => {
  const p = V7_PACKAGES.find((p) => p.id === pid);
  if (!p) throw new Error(`Missing package ${pid}.`);
  return p;
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
/** The person's events of this round made while running the operation, in order. */
const types = (w: V7World, who = 'lin') =>
  w.events
    .filter((e) => e.actor === who && e.interface === id)
    .map((e) => e.type);
const mine = (w: V7World, type: string, who = 'lin') =>
  w.events.filter((e) => e.actor === who && e.type === `${PREFIX}-${type}`);
const view = (e: V7Event | undefined) => (e?.data.view ?? {}) as Data;
const owned = (w: V7World, kind: string, who = 'lin'): V7Stack[] =>
  w.stacks.filter(
    (s) => s.owner === who && s.resource === kind && s.quantity > 0,
  );
const units = (w: V7World, kind: string, who = 'lin') =>
  owned(w, kind, who).reduce((n, s) => n + s.quantity, 0);
/** The ex26 genesis with the four packages it reuses and this one installed. */
const installed = () => {
  let w = initialLongWorld('long-ex26', 'long-culture-v2-villages');
  for (const r of [
    BASE_REVISION,
    ASSESS_REVISION,
    RECHECK_REVISION,
    LOW_REVISION,
    REVISION,
  ])
    w = v7Clone(v7Install(w, continuousRegistry(w), r));
  return w;
};
/** The person studies in one round and masters the operation. */
function learned(world?: V7World, who = 'lin', ability = id) {
  const r = step(world ?? installed(), { [who]: learn(ability) });
  const w = ok(r, who);
  expect(actor(w, who).mastered).toContain(ability);
  return w;
}
/** Lin's own eating record of a kind as eat writes it ({ nutrition, toxicity, observedAt }).
 * Her genesis record of berries carries no round; the eat tested below dates it the same way. */
function record(
  w: V7World,
  kind = 'berry',
  values: { nutrition: number; toxicity: number } = {
    nutrition: 8,
    toxicity: 0,
  },
  who = 'lin',
) {
  const a = actor(w, who);
  a.memory.discoveries = {
    ...(a.memory.discoveries ?? {}),
    [kind]: { ...values, observedAt: 0 },
  };
  return w;
}
/** Lin has learned the operation and holds a dated record of eating berries. */
const ready = () => record(learned());
/** A copy with Lin's vitals changed. */
function vitals(w: V7World, values: Partial<V7Actor['vitals']>, who = 'lin') {
  const out = v7Clone(w);
  Object.assign(actor(out, who).vitals, values);
  return out;
}
/** Every berry source empty from genesis (so Lin remembers them empty). */
const bare = () => {
  const g = installed();
  for (const o of g.objects.filter((o) => o.data.resource === 'berry'))
    o.data.stock = 0;
  return record(learned(g));
};
/** A copy with Lin moved next to a point (within reach of a source there). */
function place(w: V7World, p: { x: number; y: number }, who = 'lin') {
  const out = v7Clone(w);
  actor(out, who).position = { x: p.x - 0.5, y: p.y };
  return out;
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
  throw new Error('The run did not finish.');
}
/** Probe observations of the run per source. */
const probesOf = (run: Data | undefined) => {
  const out = new Map<string, number>();
  for (const i of (run?.inspections ?? []) as Data[])
    out.set(String(i.source), (out.get(String(i.source)) ?? 0) + 1);
  return out;
};
const injure = (a: V7Actor, w: V7World) =>
  (a.memory.important ??= []).push({
    tick: w.tick,
    event: 'fixture',
    type: 'injured',
    summary: 'Hurt.',
  });
/** The inputs with some of them left out. */
const omitting = (keys: string[]): V7Action => {
  const action = forage();
  action.args = Object.fromEntries(
    Object.entries(action.args).filter(([k]) => !keys.includes(k)),
  );
  return action;
};
/** Everything of a person that eating affects, except the label of the round's interface. */
const body = (a: V7Actor) => ({
  vitals: a.vitals,
  wellbeing: a.wellbeing,
  discoveries: a.memory.discoveries,
  experience: {
    ...a.experience,
    recent: (a.experience?.recent ?? []).map((r) => ({
      ...r,
      action: null,
    })),
  },
  routine: a.extensionState['open:routine'],
  burden: a.extensionState['open:routineBurden'],
  progress: a.extensionState['long:lastProgress'],
  visited: a.extensionState['long:visited'],
  practice: Object.keys(a.extensionState).filter((k) =>
    k.startsWith('open:practice:'),
  ),
});

describe('bounded food foraging in ex26', () => {
  it('is registered last, seventh for long-ex26, with new names, learning 1, the size limit, no excluded word and every earlier package byte-identical', () => {
    const pkg = pkgOf(id);
    const ability = pkg.abilities[0];
    if (!ability) throw new Error('Missing ability.');
    expect(V7_PACKAGES.at(-1)).toBe(pkg);
    expect(
      V7_PACKAGES.filter((p) => p.scope === 'long-ex26').map((p) => p.id),
    ).toEqual([
      'bounded-resource-search',
      'reciprocal-conversation',
      'tend-rooted-plants',
      ASSESS,
      RECHECK,
      LOW,
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
        LOW_REVISION,
        ASSESS_REVISION,
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
        'gathered',
        'ate',
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
      equivalence: 'forage:bounded-food-foraging:gather-then-eat:1',
      authored: false,
      prerequisites: ['navigate', 'probe', 'gather', 'eat'],
      dependencies: {
        abilities: ['navigate', 'probe', 'gather', 'eat'],
        resources: [],
        knowledge: [],
      },
      references: {},
      practiceEvidence: `${PREFIX}-completed`,
      execution: { duration: null, interruption: 'cancel' },
    });
    expect(ability.learningEnergy).toBeUndefined();
    // recheck@1's parameters without resource and emergency, the low-health threshold, a reserve
    // of at least eat's 1 energy, and the cited records and exploration.
    const recheck = pkgOf(RECHECK).abilities[0]?.parameters.properties ?? {};
    const low = pkgOf(LOW).abilities[0]?.parameters.properties ?? {};
    const properties = ability.parameters.properties ?? {};
    expect(Object.keys(properties)).toEqual([
      'mode',
      'x',
      'y',
      'radius',
      'path',
      'time',
      'energy',
      'reserve',
      'quantity',
      'evidenceRefs',
      'recheck',
      'explore',
      'minHealth',
      'minTemp',
      'maxTemp',
      'avoidAreas',
      'avoidDirections',
    ]);
    for (const k of Object.keys(properties).filter(
      (k) => !['reserve', 'evidenceRefs', 'explore', 'minHealth'].includes(k),
    ))
      expect(properties[k], k).toEqual(recheck[k]);
    expect(properties.minHealth).toEqual(low.minHealth);
    expect(properties.minHealth).toEqual({
      type: 'number',
      minimum: 20,
      maximum: 100,
    });
    expect(properties.reserve).toEqual({
      type: 'number',
      minimum: 1,
      maximum: 40,
    });
    expect(properties.evidenceRefs).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
    expect(properties.explore).toEqual({ type: 'boolean' });
    expect(ability.parameters.required).toEqual(['mode']);
    expect(ability.parameters.additionalProperties).toBe(false);
    // No parameter names a target, so no reference contract is needed.
    expect(properties.target).toBeUndefined();
    // New package, ability, equivalence, handler, revision, event and state names.
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      expect(id.startsWith(`${p.id}:`)).toBe(false);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(id);
        expect(a.equivalence).not.toBe(ability.equivalence);
        expect(a.handler).not.toBe(ability.handler);
        expect(a.revision).not.toBe(REVISION);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? []) {
        expect(e.startsWith(`${PREFIX}-`)).toBe(false);
        expect(e.startsWith(id)).toBe(false);
      }
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
    expect(Object.keys(map)).toHaveLength(141);
    expect(sha(map)).toBe(EXISTING_DIGEST);
    for (const [key, digest] of Object.entries(REUSED_SHA))
      expect(map[key], key).toBe(digest);
    // Only the current scope can install it, only after every package it reuses, with operation
    // continuity.
    const other = initialLongWorld('long-ex25', 'long-culture-v2-villages');
    expect(continuousRegistry(other).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(other, continuousRegistry(), REVISION)).toThrow(
      /not approved/,
    );
    let partial = initialLongWorld('long-ex26', 'long-culture-v2-villages');
    for (const r of [BASE_REVISION, RECHECK_REVISION, LOW_REVISION]) {
      expect(() =>
        v7Install(partial, continuousRegistry(partial), REVISION),
      ).toThrow(/dependency-incomplete/);
      partial = v7Clone(v7Install(partial, continuousRegistry(partial), r));
    }
    // Without the assessment whose evaluator it uses.
    expect(() =>
      v7Install(partial, continuousRegistry(partial), REVISION),
    ).toThrow(/dependency-incomplete/);
    const all = v7Clone(
      v7Install(partial, continuousRegistry(partial), ASSESS_REVISION),
    );
    all.state.operationContinuity = 0;
    expect(() => v7Install(all, continuousRegistry(all), REVISION)).toThrow(
      /operation continuity/,
    );
    // Installing changes no person, object, item or process.
    let before = initialLongWorld('long-ex26', 'long-culture-v2-villages');
    for (const r of [
      BASE_REVISION,
      ASSESS_REVISION,
      RECHECK_REVISION,
      LOW_REVISION,
    ])
      before = v7Clone(v7Install(before, continuousRegistry(before), r));
    expect(v7Signature(g.actors)).toBe(v7Signature(before.actors));
    expect(v7Signature(g.objects)).toBe(v7Signature(before.objects));
    expect(v7Signature(g.stacks)).toBe(v7Signature(before.stacks));
    expect(g.processes).toEqual(before.processes);
    expect(g.revisions.at(-1)).toBe(REVISION);
  });

  it('is learned by Lin in one round of study without energy, and only by a person with navigate, probe, gather and eat', () => {
    const g = record(installed());
    const unlearned = step(g, { lin: forage() });
    expect(unlearned.outcomes.lin?.success).toBe(false);
    expect(unlearned.outcomes.lin?.reason).toMatch(/not mastered/);
    // Neither the request nor the mastery of the searches or the assessment teaches it.
    let others = g;
    for (const ability of [RECHECK, LOW, ASSESS])
      others = learned(others, 'lin', ability);
    expect(actor(others).mastered).not.toContain(id);
    const r = step(g, { lin: learn(id) });
    const w = ok(r);
    expect(r.outcomes.lin?.reason).toMatch(/after one round of study/);
    expect(actor(w).mastered).toContain(id);
    expect(actor(w).learning).toBeNull();
    // Study costs nothing but the round: the vitals are those of a waiting person.
    const idle = step(g).world;
    expect(actor(w).vitals).toEqual(actor(idle).vitals);
    // While starving too.
    const hungry = vitals(g, { satiety: 0 });
    expect(actor(ok(step(hungry, { lin: learn(id) }))).vitals).toEqual(
      actor(step(hungry).world).vitals,
    );
    // Moss has not mastered probe in this genesis, so the study is refused.
    expect(actor(g, 'moss').mastered).not.toContain('probe');
    const moss = step(g, { moss: learn(id) });
    expect(moss.outcomes.moss?.success).toBe(false);
    expect(moss.outcomes.moss?.reason).toMatch(/prerequisites/);
    // A person who no longer has eat cannot run it.
    const lost = v7Clone(w);
    actor(lost).mastered = actor(lost).mastered.filter((x) => x !== 'eat');
    const run = step(lost, { lin: forage() });
    expect(run.outcomes.lin?.success).toBe(false);
    expect(run.outcomes.lin?.reason).toMatch(/capability/);
  });

  it("takes its eligible kinds only from Lin's own cited eating records through the assessment's evaluator; any other kind is reported unresolved and never gathered or eaten", () => {
    const g = learned();
    // Her genesis record of berries carries no round: not complete dated evidence.
    refused(
      step(g, { lin: forage() }),
      /^evidenceRefs: berry is not a complete dated record\. Nothing was spent\.$/,
    );
    // An actual eat by hand dates it; then the same start is accepted, at no extra cost.
    const bush = object(g, BUSH).spatial;
    let w = g;
    for (let i = 0; i < 3; i++) {
      const r = step(w, {
        lin: {
          interface: 'navigate',
          args: { target: BUSH, x: bush.x, y: bush.y },
        },
      });
      w = ok(r);
      if (r.outcomes.lin?.complete) break;
    }
    w = ok(
      step(w, {
        lin: { interface: 'gather', args: { target: BUSH, quantity: 1 } },
      }),
    );
    const unit = owned(w, 'berry')[0];
    if (!unit) throw new Error('Missing berry.');
    w = ok(
      step(w, {
        lin: { interface: 'eat', args: { target: unit.id, quantity: 1 } },
      }),
    );
    expect(actor(w).memory.discoveries?.berry).toEqual({
      nutrition: 8,
      toxicity: 0,
      observedAt: w.tick,
    });
    const started = ok(step(w, { lin: forage() }));
    expect(open(started) ?? last(started)).toMatchObject({
      refs: ['berry'],
      kinds: ['berry'],
    });
    // Every refusal costs nothing and opens nothing.
    const base = ready();
    const free = (action: V7Action, pattern: RegExp, world = base) => {
      const refusal = step(world, {
        lin: { interface: 'no-such-interface', args: {} },
      });
      const r = refused(step(world, { lin: action }), pattern);
      expect(actor(r).vitals).toEqual(actor(refusal.world).vitals);
      expect(actor(r).position).toEqual(actor(world).position);
      expect(open(r)).toBeUndefined();
      expect(r.stacks).toEqual(refusal.world.stacks);
    };
    free(omitting(['evidenceRefs']), /start needs evidenceRefs/);
    free(forage({ evidenceRefs: [] }), /evidenceRefs takes 1 to 6/);
    free(
      forage({ evidenceRefs: ['berry', 'a', 'b', 'c', 'd', 'e', 'f'] }),
      /evidenceRefs takes 1 to 6/,
    );
    // No record of eating roots: the name of a kind is not a record.
    free(
      forage({ evidenceRefs: ['root'] }),
      /evidenceRefs: root is not one of your complete records/,
    );
    // Another person's record is not Lin's: Wren's root record changes nothing for her.
    const wren = record(
      v7Clone(base),
      'root',
      { nutrition: 14, toxicity: 0 },
      'wren',
    );
    free(
      forage({ evidenceRefs: ['root'] }),
      /evidenceRefs: root is not one of your complete records/,
      wren,
    );
    // A record that is not an eating record supports no kind.
    const probed = ok(
      step(base, {
        lin: {
          interface: 'probe',
          args: { target: NUTS, mode: 'observe', intensity: 0 },
        },
      }),
    );
    free(
      forage({ evidenceRefs: [`${NUTS}:observed-state`] }),
      /None of evidenceRefs is your own eating record of a kind that it supports as edible and nontoxic/,
      probed,
    );
    // A record of harm supports nothing: toxic berries are never foraged.
    free(
      forage(),
      /None of evidenceRefs is your own eating record/,
      record(v7Clone(base), 'berry', { nutrition: 8, toxicity: 3 }),
    );
    // A record of no nourishment supports nothing either.
    free(
      forage(),
      /None of evidenceRefs is your own eating record/,
      record(v7Clone(base), 'berry', { nutrition: 0, toxicity: 0 }),
    );
    // Not citing a record means not using it: Lin's root record is left out unless cited.
    const both = record(v7Clone(base), 'root', { nutrition: 14, toxicity: 0 });
    const onlyBerry = drive(both, forage({ quantity: 1 }));
    expect(last(onlyBerry.world)).toMatchObject({ kinds: ['berry'], eaten: 1 });
    // The root patch is nearer than her bush and stocked, but its kind is not eligible: it is
    // reported unresolved, never targeted, gathered or eaten.
    const d = drive(base, forage({ quantity: 2 }));
    const run = last(d.world);
    expect(run).toMatchObject({
      status: 'completed',
      reason: 'meal-cap',
      kinds: ['berry'],
      eaten: 2,
      collected: 2,
    });
    const unresolved = run?.unresolved as Data[];
    expect(unresolved.map((u) => u.kind)).toContain('root');
    expect(unresolved.map((u) => u.kind)).toContain('hazelnut');
    expect(unresolved.map((u) => u.kind)).not.toContain('berry');
    for (const u of unresolved) expect(u.verdict).toBe('unresolved');
    expect(unresolved.find((u) => u.kind === 'root')?.sources).toContain(ROOTS);
    expect(object(d.world, ROOTS).data.stock).toBe(
      object(base, ROOTS).data.stock,
    );
    for (const r of d.rounds) {
      const record = (open(r.world) ?? last(r.world)) as Data;
      expect(record.target).not.toBe(ROOTS);
      expect(units(r.world, 'root')).toBe(0);
      expect(
        r.world.events.filter(
          (e) =>
            e.actor === 'lin' &&
            e.type === 'ate' &&
            e.data.resource !== 'berry',
        ),
      ).toEqual([]);
    }
    expect(String(mine(d.world, 'completed')[0]?.description)).toMatch(
      /Seen without an applicable eating record of yours, so not eaten \(safety unresolved\): .*root/,
    );
    expect(view(mine(d.world, 'completed')[0]).unresolved).toContain('root');
    // A root unit Lin carries is not eaten either: only eligible kinds are.
    let carrying = place(v7Clone(base), object(base, ROOTS).spatial);
    carrying = ok(
      step(carrying, {
        lin: { interface: 'gather', args: { target: ROOTS, quantity: 1 } },
      }),
    );
    expect(units(carrying, 'root')).toBe(1);
    const c = drive(carrying, forage({ quantity: 1 }));
    expect(units(c.world, 'root')).toBe(1);
    expect(last(c.world)).toMatchObject({ eaten: 1, kinds: ['berry'] });
    expect((last(c.world)?.meals as Data[]).map((m) => m.kind)).toEqual([
      'berry',
    ]);
  });

  it('orders the candidates of every eligible kind together by nearest reach, not one kind after another', () => {
    const both = record(ready(), 'root', { nutrition: 14, toxicity: 0 });
    // The root patch (1.82) is nearer than the bush (1.89): the first target whichever kind is
    // cited first; the eligible kinds keep the order of the citation.
    for (const refs of [
      ['berry', 'root'],
      ['root', 'berry'],
    ]) {
      const w = ok(step(both, { lin: forage({ evidenceRefs: refs }) }));
      expect(open(w)).toMatchObject({ target: ROOTS, kinds: refs });
      expect(mine(w, 'moved')[0]?.target).toBe(ROOTS);
    }
    // One root left: that root is gathered and eaten, then the nearest source of either kind,
    // the bush, follows; each gathered unit is eaten in the very next round.
    const one = v7Clone(both);
    object(one, ROOTS).data.stock = 1;
    const d = drive(one, forage({ evidenceRefs: ['berry', 'root'] }));
    const run = last(d.world);
    expect(run).toMatchObject({
      status: 'completed',
      reason: 'meal-cap',
      eaten: 2,
      collected: 2,
    });
    expect((run?.transfers as Data[]).map((t) => t.source)).toEqual([
      ROOTS,
      BUSH,
    ]);
    expect((run?.meals as Data[]).map((m) => m.kind)).toEqual([
      'root',
      'berry',
    ]);
    const sequence = d.rounds.map((r) =>
      types(r.world).filter((t) => t.startsWith(`${PREFIX}-`)),
    );
    for (const [i, t] of sequence.entries())
      if (t.includes(`${PREFIX}-gathered`)) {
        const item = view(
          mine(d.rounds[i]?.world ?? d.world, 'gathered')[0],
        ).item;
        const next = d.rounds[i + 1]?.world ?? d.world;
        expect(sequence[i + 1]?.[0]).toBe(`${PREFIX}-ate`);
        expect(view(mine(next, 'ate')[0]).item).toBe(item);
      }
    expect(object(d.world, ROOTS).data.stock).toBe(0);
    expect(object(d.world, BUSH).data.stock).toBe(3);
  });

  it("gathers one unit and eats it as the very next step through eat itself, with eat's own energy, nutrition, meal experience and record, counted as a manual eat", () => {
    const w0 = ready();
    const e0 = actor(w0).vitals.energy;
    // Round 1: the start (no cost of its own) and one kernel navigate step of 0.8 for 1.6.
    const r1 = ok(step(w0, { lin: forage() }));
    expect(types(r1)).toEqual([
      `${PREFIX}-started`,
      'arrived',
      `${PREFIX}-moved`,
    ]);
    expect(actor(r1).vitals.energy).toBeCloseTo(e0 - 1.6, 8);
    expect(view(mine(r1, 'moved')[0])).toMatchObject({
      state: 'searching',
      source: BUSH,
      kind: 'berry',
      evidence: 'seen now',
      gathered: false,
      eaten: false,
    });
    // Round 2: probe's own observation for 0.2.
    const r2 = ok(step(r1, { lin: forage() }));
    expect(types(r2)).toEqual(['trial-result', `${PREFIX}-inspected`]);
    expect(actor(r2).vitals.energy).toBeCloseTo(e0 - 1.8, 8);
    expect(view(mine(r2, 'inspected')[0])).toMatchObject({
      state: 'observing',
      evidence: 'probe',
      available: 4,
    });
    // Round 3: gather's own transfer of exactly one unit for 2.
    const r3 = ok(step(r2, { lin: forage() }));
    expect(types(r3)).toEqual(['gathered', `${PREFIX}-gathered`]);
    expect(actor(r3).vitals.energy).toBeCloseTo(e0 - 3.8, 8);
    expect(object(r3, BUSH).data.stock).toBe(3);
    const [item] = owned(r3, 'berry');
    if (!item) throw new Error('Missing gathered unit.');
    expect(item.quantity).toBe(1);
    expect(open(r3)?.pending).toMatchObject({
      item: item.id,
      kind: 'berry',
      source: BUSH,
    });
    expect(view(mine(r3, 'gathered')[0])).toMatchObject({
      state: 'gathering',
      item: item.id,
      gathered: true,
      eaten: false,
      carried: item.id,
      collected: 1,
      consumed: 0,
    });
    // Round 4: the gathered unit is eaten next, through eat itself.
    const r4 = ok(step(r3, { lin: forage() }));
    expect(types(r4)).toEqual(['ate', `${PREFIX}-ate`]);
    const ate = r4.events.find((e) => e.actor === 'lin' && e.type === 'ate');
    expect(ate).toMatchObject({ interface: id, target: item.id });
    expect(ate?.data).toMatchObject({
      quantity: 1,
      resource: 'berry',
      nutrition: 8,
      realized: 8,
    });
    expect(units(r4, 'berry')).toBe(0);
    expect(view(mine(r4, 'ate')[0])).toMatchObject({
      state: 'eating',
      item: item.id,
      gathered: false,
      eaten: true,
      carried: null,
      consumed: 1,
      underlying: ate?.id,
    });
    // Exactly as a manual eat of the same unit from the same world: its energy, satiety, health,
    // meal experience, mood, routine and eating record, and nothing more.
    const hand = ok(
      step(r3, {
        lin: { interface: 'eat', args: { target: item.id, quantity: 1 } },
      }),
    );
    expect(body(actor(r4))).toEqual(body(actor(hand)));
    expect(actor(r4).memory.discoveries?.berry).toEqual({
      nutrition: 8,
      toxicity: 0,
      observedAt: r4.tick,
    });
    const spent = actor(r3).vitals.energy - actor(r4).vitals.energy;
    expect(spent).toBeGreaterThan(1 / 1.1 - 1e-9);
    expect(spent).toBeLessThan(1 / 0.85 + 1e-9);
    // 8 satiety above a round of waiting.
    expect(
      actor(r4).vitals.satiety - actor(step(r3).world).vitals.satiety,
    ).toBeCloseTo(8, 8);
    expect(open(r4)).toMatchObject({
      eaten: 1,
      collected: 1,
      pending: null,
      nutrition: 8,
      meals: [
        {
          tick: r4.tick,
          item: item.id,
          kind: 'berry',
          quantity: 1,
          satiety: 8,
          healthLost: 0,
          event: ate?.id,
        },
      ],
    });
    expect(Number(open(r4)?.energy)).toBeCloseTo(3.8 + spent, 6);
    // The pair is priced before any gather: within reach of the stocked bush, a budget that pays
    // a probe and a gather but not the eat after it gathers nothing.
    const near = place(w0, object(w0, BUSH).spatial);
    expect(v7Distance(actor(near).position, object(near, BUSH).spatial)).toBe(
      0.5,
    );
    for (const [args, edit, reason] of [
      [{ energy: 3 }, null, 'energy-budget'],
      [{ reserve: 4 }, 6.9, 'energy-reserve'],
      [{ time: 2 }, null, 'time-limit'],
    ] as const) {
      const start = edit === null ? near : vitals(near, { energy: edit });
      const d = drive(start, forage(args));
      expect(last(d.world)).toMatchObject({
        status: 'stopped',
        reason,
        collected: 0,
        eaten: 0,
      });
      expect(object(d.world, BUSH).data.stock).toBe(4);
      expect(units(d.world, 'berry')).toBe(0);
      expect(
        d.rounds
          .flatMap((r) => r.world.events)
          .filter((e) => e.type === 'gathered'),
      ).toEqual([]);
    }
    // ...while one that pays the probe, the gather and the eat takes all three.
    for (const [args, edit] of [
      [{ energy: 3.25, quantity: 1 }, null],
      [{ reserve: 4, quantity: 1 }, 7.3],
      [{ time: 3, quantity: 1 }, null],
    ] as const) {
      const start = edit === null ? near : vitals(near, { energy: edit });
      const d = drive(start, forage(args));
      expect(d.rounds.map((r) => types(r.world).at(-1))).toEqual([
        `${PREFIX}-inspected`,
        `${PREFIX}-gathered`,
        `${PREFIX}-completed`,
      ]);
      expect(last(d.world)).toMatchObject({ eaten: 1, reason: 'meal-cap' });
      const reserve = Number((last(d.world)?.limits as Data).reserve);
      for (const r of d.rounds)
        expect(actor(r.world).vitals.energy).toBeGreaterThanOrEqual(
          reserve - 1e-9,
        );
    }
    // A unit Lin already carries of an eligible kind is eaten first, before any search step.
    const carrying = ok(
      step(near, {
        lin: { interface: 'gather', args: { target: BUSH, quantity: 1 } },
      }),
    );
    const held = owned(carrying, 'berry')[0];
    const first = ok(step(carrying, { lin: forage() }));
    expect(types(first)).toEqual([`${PREFIX}-started`, 'ate', `${PREFIX}-ate`]);
    expect(view(mine(first, 'ate')[0]).item).toBe(held?.id);
    expect(actor(first).position).toEqual(actor(carrying).position);
    expect(open(first)).toMatchObject({ eaten: 1, collected: 0, moves: 0 });
  });

  it('stops at the cap of units to eat, never eats after it stops, and does not start at full satiety', () => {
    const w0 = ready();
    const s0 = actor(w0).vitals.satiety;
    const d = drive(w0, forage({ quantity: 2 }));
    expect(d.rounds).toHaveLength(6);
    expect(last(d.world)).toMatchObject({
      status: 'completed',
      reason: 'meal-cap',
      eaten: 2,
      collected: 2,
      nutrition: 16,
    });
    const done = mine(d.world, 'completed')[0];
    expect(view(done)).toMatchObject({
      complete: true,
      outcome: 'complete',
      state: 'completed',
      consumed: 2,
      indicator: null,
    });
    expect(String(done?.description)).toMatch(
      /^Foraging complete: 2 of 2 unit\(s\) eaten, 2 gathered, 16 satiety gained\./,
    );
    expect(object(d.world, BUSH).data.stock).toBe(2);
    let idle = w0;
    for (let i = 0; i < 6; i++) idle = step(idle).world;
    expect(actor(d.world).vitals.satiety).toBeCloseTo(
      actor(idle).vitals.satiety + 16,
      6,
    );
    expect(actor(d.world).vitals.satiety).toBeGreaterThan(s0);
    // After it completes, nothing more is eaten or gathered.
    let after = d.world;
    for (let i = 0; i < 3; i++) after = ok(step(after));
    expect(object(after, BUSH).data.stock).toBe(2);
    expect(
      after.events.filter((e) => e.actor === 'lin' && e.interface === id),
    ).toEqual([]);
    // A cap of one with a unit already carried: that unit, and nothing else.
    const near = place(w0, object(w0, BUSH).spatial);
    const carrying = ok(
      step(near, {
        lin: { interface: 'gather', args: { target: BUSH, quantity: 1 } },
      }),
    );
    const one = drive(carrying, forage({ quantity: 1 }));
    expect(one.rounds).toHaveLength(1);
    expect(last(one.world)).toMatchObject({ eaten: 1, collected: 0 });
    expect(object(one.world, BUSH).data.stock).toBe(3);
    // At full satiety nothing would be gained: refused at no cost.
    refused(
      step(vitals(w0, { satiety: 100 }), { lin: forage() }),
      /Your satiety is full/,
    );
  });

  it('recheck: walks to a remembered empty bush only as a destination, learns its stock by a fresh probe within reach, and inspects each source at most once per run', () => {
    const w0 = bare();
    // Without recheck there is nothing to do: sources seen empty are not candidates.
    const plain = drive(w0, forage());
    expect(plain.rounds).toHaveLength(1);
    expect(last(plain.world)).toMatchObject({
      status: 'completed',
      reason: 'search-exhausted',
      eaten: 0,
      moves: 0,
      probes: 0,
    });
    expect(view(mine(plain.world, 'completed')[0])).toMatchObject({
      outcome: 'incomplete',
      indicator: 'neutral',
      consumed: 0,
    });
    expect(String(mine(plain.world, 'completed')[0]?.description)).toMatch(
      /^Foraging complete without reaching the cap: No permitted reachable source with ripe stock of berry remains in the area\. 0 of 2 unit\(s\) eaten, 0 gathered, 0 satiety gained\./,
    );
    // With recheck: every berry source last seen empty inside the radius, nearest first, each
    // probed once; then the run ends honestly with nothing eaten.
    const wide = forage({ recheck: true, path: 12, time: 30, energy: 30 });
    const d = drive(w0, wide);
    const run = last(d.world);
    expect(run).toMatchObject({
      status: 'completed',
      reason: 'search-exhausted',
      eaten: 0,
      collected: 0,
    });
    const probes = probesOf(run);
    expect([...probes.keys()]).toEqual([BUSH, NEAR_EMPTY, 'start-1-berries']);
    for (const n of probes.values()) expect(n).toBe(1);
    expect(run?.empty).toEqual([BUSH, NEAR_EMPTY, 'start-1-berries']);
    // Out of view, a remembered empty bush is only a navigate destination, labelled with its
    // past stock; its stock now is learned by a fresh probe within reach.
    let away = w0;
    for (let i = 0; i < 5; i++) away = ok(step(away, { lin: EAST }));
    expect(
      v7Observe(away, 'lin').objects.some((o) => o.id === NEAR_EMPTY),
    ).toBe(false);
    const spot = object(away, NEAR_EMPTY).spatial;
    const back = drive(
      away,
      forage({
        x: spot.x,
        y: spot.y,
        radius: 1,
        path: 8,
        energy: 20,
        recheck: true,
      }),
    );
    const walks = back.rounds.flatMap((r) => mine(r.world, 'moved')).map(view);
    expect(walks.length).toBeGreaterThan(0);
    expect(walks[0]).toMatchObject({
      evidence: 'remembered',
      pastStock: 0,
      seenAt: 4,
      source: NEAR_EMPTY,
    });
    // Seen last at round 4 during the walk east, before it left her view.
    expect(
      actor(away).memory.objects.find((m) => m.object.id === NEAR_EMPTY)
        ?.seenAt,
    ).toBe(4);
    expect(
      String(
        mine(back.rounds[0]?.world ?? back.world, 'moved')[0]?.description,
      ),
    ).toMatch(
      `${NEAR_EMPTY}, a place you remember (seen at round 4; its stock now is unknown)`,
    );
    expect(probesOf(last(back.world))).toEqual(new Map([[NEAR_EMPTY, 1]]));
    expect(last(back.world)).toMatchObject({
      status: 'completed',
      reason: 'search-exhausted',
      empty: [NEAR_EMPTY],
    });
    for (const r of d.rounds)
      for (const e of mine(r.world, 'empty'))
        expect(view(e)).toMatchObject({
          state: 'observing',
          outcome: 'observed-empty',
          indicator: 'neutral',
          evidence: 'probe',
        });
    // A long pause and a resume do not inspect a source again in the same run.
    let w = ok(step(w0, { lin: wide }));
    w = ok(step(w, { lin: wide }));
    expect(probesOf(open(w)).get(BUSH)).toBe(1);
    for (let i = 0; i < 4; i++) w = ok(step(w));
    expect(open(w)?.status).toBe('paused');
    const resumed = drive(w, control('resume'));
    expect(probesOf(last(resumed.world)).get(BUSH)).toBe(1);
    // A new run is new: around the same origin it probes a bush of the earlier run again.
    expect(probesOf(last(resumed.world)).get(NEAR_EMPTY)).toBe(1);
    const again = drive(
      resumed.world,
      forage({ recheck: true, path: 12, time: 30, energy: 30, x: 16.2, y: 15 }),
    );
    expect(probesOf(last(again.world)).get(NEAR_EMPTY)).toBe(1);
    // Ripe stock seen again is new evidence within the same run: the bush probed empty is a
    // candidate once more, inspected again before any gather.
    let seen = ok(step(w0, { lin: wide }));
    seen = ok(step(seen, { lin: wide }));
    expect(open(seen)?.empty).toEqual([BUSH]);
    object(seen, BUSH).data.stock = 2;
    const fed = drive(seen, wide);
    expect(last(fed.world)).toMatchObject({ eaten: 2, collected: 2 });
    expect(probesOf(last(fed.world)).get(BUSH)).toBe(2);
  });

  it('never targets a source Lin never observed, even stocked inside the radius', () => {
    // A stocked berry bush 7.5 from Lin, inside a radius of 8, that she has never seen.
    const plant = (w: V7World) => {
      w.objects.push({
        ...v7Clone(object(w, BUSH)),
        id: 'fixture-berry',
        spatial: { ...object(w, BUSH).spatial, x: 22.2, y: 19.5 },
        data: { ...object(w, BUSH).data, stock: 3 },
      });
      return w;
    };
    const w0 = plant(bare());
    expect(v7Distance(actor(w0).position, { x: 22.2, y: 19.5 })).toBeCloseTo(
      7.5,
      6,
    );
    expect(
      actor(w0).memory.objects.some((m) => m.object.id === 'fixture-berry'),
    ).toBe(false);
    expect(
      v7Observe(w0, 'lin').objects.some((o) => o.id === 'fixture-berry'),
    ).toBe(false);
    // Tight limits keep it out of view: it is never a target and never named.
    const tight = forage({
      radius: 8,
      path: 1.6,
      time: 12,
      energy: 10,
      reserve: 4,
      recheck: true,
      explore: true,
    });
    const d = drive(w0, tight);
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
    expect(last(d.world)?.eaten).toBe(0);
    expect(object(d.world, 'fixture-berry').data.stock).toBe(3);
    // Wider limits with exploration, all but the east left out: it becomes a target only after
    // Lin has seen it herself.
    let w = plant(bare());
    let targeted = false;
    for (let i = 0; i < 40; i++) {
      const knew = actor(w).memory.objects.some(
        (m) => m.object.id === 'fixture-berry',
      );
      const r = step(w, {
        lin: forage({
          radius: 8,
          path: 16,
          time: 40,
          energy: 30,
          reserve: 4,
          recheck: true,
          explore: true,
          avoidDirections: ['north', 'west', 'south'],
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
    expect(last(w)).toMatchObject({ eaten: 2, collected: 2 });
    expect(object(w, 'fixture-berry').data.stock).toBe(1);
  });

  it('inherits the low-health rule: starvation damage alone does not stop it, health at or below minHealth (default 60, 20 to 100) does, and an invalid threshold is refused at no cost', () => {
    const base = ready();
    // The default threshold is 60.
    const w = ok(step(base, { lin: forage() }));
    expect(open(w)).toMatchObject({
      minHealth: 60,
      emergency: true,
      lowHealth: true,
      status: 'active',
    });
    expect(mine(w, 'started')[0]?.description).toMatch(
      /health 60 or below stops it; low satiety or starvation damage alone does not/,
    );
    expect(view(mine(w, 'started')[0])).toMatchObject({ minHealth: 60 });
    // Outside 20 to 100: refused by the declared bounds, nothing spent and nothing opened.
    const refusal = step(base, {
      lin: { interface: 'no-such-interface', args: {} },
    });
    for (const [args, pattern] of [
      [{ minHealth: 19.9 }, /minHealth/],
      [{ minHealth: 10 }, /minHealth/],
      [{ minHealth: 0 }, /minHealth/],
      [{ minHealth: 100.5 }, /minHealth/],
      [{ minHealth: -5 }, /minHealth/],
      [{ reserve: 0.5 }, /reserve/],
    ] as const) {
      const r = step(base, { lin: forage(args) });
      expect(r.outcomes.lin?.success, JSON.stringify(args)).toBe(false);
      expect(r.outcomes.lin?.reason).toMatch(pattern);
      expect(actor(r.world).position).toEqual(actor(base).position);
      expect(actor(r.world).vitals).toEqual(actor(refusal.world).vitals);
      expect(open(r.world)).toBeUndefined();
      expect(
        r.world.events.filter(
          (e) => e.actor === 'lin' && e.type.startsWith(`${PREFIX}-`),
        ),
      ).toEqual([]);
    }
    // Inside the range: health at or below the threshold refuses the start.
    const at36 = vitals(base, { health: 36 });
    for (const [minHealth, starts] of [
      [20, true],
      [35.9, true],
      [36, false],
      [60, false],
      [100, false],
    ] as const) {
      const r = step(at36, { lin: forage({ minHealth }) });
      if (starts) expect(open(ok(r))?.minHealth).toBe(minHealth);
      else
        refused(
          r,
          new RegExp(
            `health 36 is at or below your minimum of ${String(minHealth)}`,
          ),
        );
    }
    refused(
      step(vitals(base, { health: 60 }), { lin: forage() }),
      /health 60 is at or below your minimum of 60/,
    );
    expect(
      open(ok(step(vitals(base, { health: 60.5 }), { lin: forage() }))),
    ).toMatchObject({ status: 'active' });
    // Starving at health 84: every round's physiology takes the world's starvation damage of 8,
    // and the run steps on starvation alone until health reaches the default 60.
    const starving = vitals(base, { health: 84, satiety: 0 });
    expect(starving.config.starvation).toBe(8);
    const rounds: Round[] = [];
    let x = starving;
    for (let i = 0; i < 6; i++) {
      const before = actor(x).vitals.health;
      const r = step(x, { lin: forage() });
      x = ok(r);
      rounds.push(r);
      const hurt = x.events.filter(
        (e) => e.actor === 'lin' && e.type === 'injured',
      );
      expect(hurt).toHaveLength(1);
      expect(hurt[0]?.description).toBe('Physiological damage: starvation.');
      expect(hurt[0]?.data).toMatchObject({ starvation: 8, thermal: 0 });
      expect(actor(x).vitals.health).toBe(before - 8);
      if (r.outcomes.lin?.complete) break;
    }
    expect(rounds.map((r) => types(r.world).at(-1))).toEqual([
      `${PREFIX}-moved`,
      `${PREFIX}-inspected`,
      `${PREFIX}-gathered`,
      `${PREFIX}-stopped`,
    ]);
    expect(last(x)).toMatchObject({ status: 'stopped', reason: 'unsafe' });
    expect(String(last(x)?.detail)).toBe(
      'health 60 is at or below your minimum of 60.',
    );
    // The gathered unit stays in her inventory, uneaten, and the stop says so.
    expect(units(x, 'berry')).toBe(1);
    expect(String(mine(x, 'stopped')[0]?.description)).toMatch(
      /gathered and not eaten, stays in your inventory/,
    );
    // The health kept just before each round's physiology is this operation's own record.
    // Kept only while satiety is 0 or less: none for a fed person.
    expect(actor(step(base).world).extensionState[BODY]).toBeUndefined();
    const kept = step(starving).world;
    expect(actor(kept).extensionState[BODY]).toEqual({
      tick: kept.tick,
      health: 84,
    });
    expect(actor(kept).extensionState[`${LOW}:body`]).toBeUndefined();
    // A lower threshold lets the same run eat: starvation ends with the first unit.
    const lower = drive(starving, forage({ minHealth: 50 }));
    expect(last(lower.world)).toMatchObject({
      status: 'completed',
      reason: 'meal-cap',
      eaten: 2,
    });
    expect(actor(lower.world).vitals.health).toBe(60);
    expect(actor(lower.world).vitals.satiety).toBeGreaterThan(0);
    // Not starvation alone: each stops the next round at no cost.
    const after1 = ok(step(starving, { lin: forage() }));
    const notAlone: [string, (y: V7World) => void][] = [
      [
        'more than starvation',
        (y) => {
          actor(y).vitals.health -= 0.5;
        },
      ],
      ['another injury', (y) => injure(actor(y), y)],
      [
        'no kept health',
        (y) => {
          delete actor(y).extensionState['bounded-food-foraging:body'];
        },
      ],
      [
        'thermal',
        (y) => {
          for (const e of actor(y).memory.important ?? [])
            if (e.type === 'injured' && e.tick === y.tick)
              e.summary = 'Physiological damage: thermal exposure.';
        },
      ],
    ];
    for (const [name, edit] of notAlone) {
      const y = v7Clone(after1);
      edit(y);
      const p0 = { ...actor(y).position },
        e0 = actor(y).vitals.energy;
      const z = ok(step(y, { lin: forage() }));
      expect(types(z), name).toEqual([`${PREFIX}-stopped`]);
      expect(String(last(z)?.detail), name).toMatch(
        /injured in the last round/,
      );
      expect(actor(z).position).toEqual(p0);
      expect(actor(z).vitals.energy).toBe(e0);
    }
  });

  it('stops for any other injury, body temperature 12 or below or 32 or above, the supplied bounds, the reserve and every limit, charging nothing for the stop', () => {
    const base = ready();
    const at = (edit: (a: V7Actor, w: V7World) => void) => {
      const w = v7Clone(base);
      edit(actor(w), w);
      return w;
    };
    // At the start, at no cost.
    for (const [world, action, pattern] of [
      [at(injure), forage(), /injured in the last round/],
      [at((a) => (a.vitals.temperature = 32)), forage(), /10 or more from 22/],
      [at((a) => (a.vitals.temperature = 12)), forage(), /10 or more from 22/],
      [
        at((a) => (a.vitals.temperature = 24)),
        forage({ maxTemp: 23 }),
        /above your maximum of 23/,
      ],
      [
        at((a) => (a.vitals.temperature = 20)),
        forage({ minTemp: 21 }),
        /below your minimum of 21/,
      ],
      [
        base,
        forage({ minTemp: 25, maxTemp: 24 }),
        /minTemp must be below maxTemp/,
      ],
      [
        at((a) => (a.vitals.energy = 3)),
        forage({ reserve: 3 }),
        /not above the reserve/,
      ],
      [base, forage({ path: 0 }), /Give finite path above 0/],
      [
        base,
        forage({ path: 0, energy: 0 }),
        /Give finite path, energy above 0/,
      ],
      [base, omitting(['radius']), /start needs radius/],
      [base, omitting(['quantity', 'path']), /start needs path, quantity/],
      [base, forage({ x: 3 }), /Give both x and y/],
    ] as const) {
      const r = refused(step(world, { lin: action }), pattern);
      expect(actor(r).position).toEqual(actor(world).position);
      expect(open(r)).toBeUndefined();
    }
    // During a run, before the next step.
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
      const s0 = ok(step(base, { lin: forage(args) }));
      edit(actor(s0), s0);
      const p0 = { ...actor(s0).position },
        energy = actor(s0).vitals.energy;
      const r = step(s0, { lin: forage(args) });
      const w = ok(r);
      expect(r.outcomes.lin?.complete).toBe(true);
      expect(types(w)).toEqual([`${PREFIX}-stopped`]);
      expect(last(w)).toMatchObject({ status: 'stopped', reason: 'unsafe' });
      expect(String(last(w)?.detail)).toMatch(pattern);
      expect(actor(w).position).toEqual(p0);
      expect(actor(w).vitals.energy).toBe(energy);
      expect(view(mine(w, 'stopped')[0])).toMatchObject({
        state: 'stopped',
        outcome: 'stopped',
        indicator: 'neutral',
      });
    }
    // Every limit: no chain to a meal fits, so nothing is spent.
    const p0 = { ...actor(base).position },
      e0 = actor(base).vitals.energy;
    for (const [args, reason] of [
      [{ path: 0.5 }, 'path-limit'],
      [{ time: 3 }, 'time-limit'],
      [{ energy: 4.5 }, 'energy-budget'],
      [{ reserve: 36 }, 'energy-reserve'],
    ] as const) {
      const run = drive(base, forage(args));
      expect(run.rounds).toHaveLength(1);
      expect(last(run.world)).toMatchObject({
        status: 'stopped',
        reason,
        distance: 0,
        energy: 0,
      });
      expect(actor(run.world).position).toEqual(p0);
      expect(actor(run.world).vitals.energy).toBe(e0);
      expect(mine(run.world, 'stopped')[0]?.data.stop).toBe(reason);
    }
    // Four rounds pay the walk, the probe, the gather and the eat; then the time limit stops it.
    expect(last(drive(base, forage({ time: 4 })).world)).toMatchObject({
      eaten: 1,
      reason: 'time-limit',
    });
    // The reserve is a floor: with 9 energy and a reserve of 4, one meal and then the stop, and
    // the energy never falls below 4.
    const tired = vitals(base, { energy: 9 });
    const t = drive(tired, forage({ quantity: 4 }));
    expect(last(t.world)).toMatchObject({
      status: 'stopped',
      reason: 'energy-reserve',
      eaten: 1,
    });
    for (const r of t.rounds)
      expect(actor(r.world).vitals.energy).toBeGreaterThanOrEqual(4 - 1e-9);
  });

  it('never moves a person faster than navigate: at most 0.8 per round over 60 rounds, so the separation bound holds', () => {
    // Lin forages for 60 rounds with recheck and exploration, starting a new run whenever one
    // ends and resting when tired, while everyone else rushes toward the other side with
    // navigate.
    let w = vitals(ready(), { satiety: 30 });
    const wide = forage({
      radius: 8,
      path: 16,
      time: 40,
      energy: 30,
      reserve: 2,
      quantity: 20,
      recheck: true,
      explore: true,
    });
    const group = (who: string) =>
      VILLAGES.groups.findIndex((g) => g.includes(who));
    const start = new Map(w.actors.map((a) => [a.id, { ...a.position }]));
    const first = w.tick;
    let current = wide,
      refusedBefore = false,
      moves = 0,
      eats = 0,
      walked = 0,
      fastest = 0;
    for (let round = 0; round < 60; round++) {
      const lin = actor(w);
      const run = lin.extensionState[OPEN] as Data | undefined;
      // A refused round (a swept-body conflict or a refused start) is followed by one wait.
      const action = refusedBefore
        ? WAIT
        : lin.vitals.energy < 12
          ? { interface: 'rest', args: {} }
          : !run
            ? (current = wide)
            : run.status === 'paused'
              ? (current = control('resume'))
              : current;
      const actions: Record<string, V7Action> = { lin: action };
      for (const a of w.actors.filter((a) => a.id !== 'lin'))
        actions[a.id] = {
          interface: 'navigate',
          args: { target: '', x: group(a.id) === 0 ? 140 : 4, y: a.position.y },
        };
      const before = new Map(w.actors.map((a) => [a.id, { ...a.position }]));
      const r = step(w, actions);
      w = r.world;
      refusedBefore = r.outcomes.lin?.success === false;
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
      // Lin moves only through the kernel's own navigate step, once, when the operation acts.
      const moved = v7Distance(
        before.get('lin') ?? actor(w).position,
        actor(w).position,
      );
      const kernel = w.events.filter(
        (e: V7Event) =>
          e.actor === 'lin' &&
          e.interface === id &&
          (e.type === 'moved' || e.type === 'arrived'),
      );
      if (action.interface === id && moved > 1e-9) {
        expect(kernel).toHaveLength(1);
        expect(Number(kernel[0]?.data.distance)).toBeCloseTo(moved, 6);
        moves += 1;
        walked += moved;
      } else if (action.interface === id) expect(moved).toBe(0);
      // One primitive per round: never two of navigate, probe, gather and eat.
      const primitives = w.events.filter(
        (e) =>
          e.actor === 'lin' &&
          e.interface === id &&
          ['arrived', 'moved', 'trial-result', 'gathered', 'ate'].includes(
            e.type,
          ),
      );
      expect(primitives.length).toBeLessThanOrEqual(1);
      eats += w.events.filter(
        (e) => e.actor === 'lin' && e.interface === id && e.type === 'ate',
      ).length;
    }
    expect(w.tick - first).toBe(60);
    // The run moved in many rounds, at full speed and never faster, and ate along the way.
    expect(moves).toBeGreaterThanOrEqual(20);
    expect(eats).toBeGreaterThanOrEqual(4);
    expect(walked).toBeLessThanOrEqual(moves * MAX_STEP + 1e-6);
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

  it('pauses when another action takes a round, resumes after fresh checks, cancels without refunds and ends at death, leaving a gathered unit to ordinary ownership', () => {
    const base = ready();
    const e0 = actor(base).vitals.energy;
    // Round 1: the start and one navigate step of 0.8 for 1.6 energy.
    let w = ok(step(base, { lin: forage() }));
    expect(actor(w).vitals.energy).toBeCloseTo(e0 - 1.6, 8);
    expect(open(w)).toMatchObject({
      status: 'active',
      target: BUSH,
      distance: 0.8,
      energy: 1.6,
      moves: 1,
    });
    // Another action takes round 2: the run pauses and keeps its step and charge.
    w = ok(step(w, { lin: WAIT }));
    const paused = mine(w, 'paused');
    expect(paused).toHaveLength(1);
    expect(paused[0]?.interface).toBeNull();
    expect(view(paused[0])).toMatchObject({
      state: 'paused',
      outcome: 'paused',
      complete: false,
    });
    expect(open(w)).toMatchObject({
      status: 'paused',
      distance: 0.8,
      energy: 1.6,
    });
    // A new start is refused while it is open.
    refused(step(w, { lin: forage() }), /give resume to continue it or cancel/);
    // Resume rechecks the vitals first...
    const before = actor(w).vitals.energy;
    const weak = vitals(w, { health: 60 });
    const stopped = ok(step(weak, { lin: control('resume') }));
    expect(types(stopped)).toEqual([`${PREFIX}-resumed`, `${PREFIX}-stopped`]);
    expect(actor(stopped).vitals.energy).toBe(before);
    // ...then inspects before any gather; the paused round still counts toward the time limit.
    w = ok(step(w, { lin: control('resume') }));
    expect(types(w)).toEqual([
      `${PREFIX}-resumed`,
      'trial-result',
      `${PREFIX}-inspected`,
    ]);
    expect(view(mine(w, 'inspected')[0]).time).toBe(3);
    expect(actor(w).vitals.energy).toBeCloseTo(before - 0.2, 8);
    w = ok(step(w, { lin: control('resume') }));
    expect(types(w)).toEqual(['gathered', `${PREFIX}-gathered`]);
    const unit = owned(w, 'berry')[0];
    if (!unit) throw new Error('Missing gathered unit.');
    // A pause between the gather and its eat keeps the unit in her inventory.
    const gathered = w;
    w = ok(step(w, { lin: WAIT }));
    expect(String(mine(w, 'paused')[0]?.description)).toMatch(
      `${unit.id} stays in your inventory`,
    );
    expect(units(w, 'berry')).toBe(1);
    // Resume eats it first: no probe is needed to eat an owned unit.
    const resumed = ok(step(w, { lin: control('resume') }));
    expect(types(resumed)).toEqual([
      `${PREFIX}-resumed`,
      'ate',
      `${PREFIX}-ate`,
    ]);
    expect(view(mine(resumed, 'ate')[0]).item).toBe(unit.id);
    // If she ate it by hand in the pause, resume releases it and searches on.
    const byHand = ok(
      step(w, {
        lin: { interface: 'eat', args: { target: unit.id, quantity: 1 } },
      }),
    );
    const onward = ok(step(byHand, { lin: control('resume') }));
    expect(open(onward)?.released).toEqual([
      {
        item: unit.id,
        tick: onward.tick,
        reason:
          'it is no longer a whole unit of an eligible kind that you carry',
      },
    ]);
    expect(open(onward)).toMatchObject({ pending: null, eaten: 0 });
    expect(types(onward)).toEqual([
      `${PREFIX}-resumed`,
      'trial-result',
      `${PREFIX}-inspected`,
    ]);
    // Cancel after the gather: the unit stays hers; spent energy is not refunded.
    const energy = actor(gathered).vitals.energy;
    const r = step(gathered, { lin: control('cancel') });
    const c = ok(r);
    expect(r.outcomes.lin?.complete).toBe(true);
    expect(types(c)).toEqual([`${PREFIX}-cancelled`]);
    expect(actor(c).vitals.energy).toBe(energy);
    expect(units(c, 'berry')).toBe(1);
    expect(open(c)).toBeUndefined();
    expect(last(c)).toMatchObject({
      status: 'cancelled',
      collected: 1,
      eaten: 0,
      pending: { item: unit.id, kind: 'berry', source: BUSH },
    });
    expect(Number(last(c)?.energy)).toBeCloseTo(3.8, 8);
    expect(view(mine(c, 'cancelled')[0])).toMatchObject({
      state: 'cancelled',
      outcome: 'cancelled',
      indicator: 'neutral',
      complete: false,
    });
    expect(String(mine(c, 'cancelled')[0]?.description)).toMatch(
      /gathered and not eaten, stays in your inventory; spent time and energy are not refunded/,
    );
    refused(
      step(c, { lin: control('cancel') }),
      /no open foraging run to cancel/,
    );
    refused(
      step(c, { lin: control('resume') }),
      /no open foraging run to resume/,
    );
    // Death: the run ends; the carried unit follows the ordinary death rules once.
    const d0 = vitals(gathered, { health: 0.5, satiety: 0 });
    const where = { ...actor(d0).position };
    const d = step(d0, { lin: WAIT }).world;
    const seen = d.events.filter((e) => e.actor === 'lin').map((e) => e.type);
    expect(seen).toContain(`${PREFIX}-paused`);
    expect(seen).toContain('died');
    expect(seen).toContain(`${PREFIX}-ended`);
    expect(seen).toContain('respawned');
    expect(open(d)).toBeUndefined();
    expect(last(d)).toMatchObject({
      status: 'ended',
      reason: 'death',
      collected: 1,
      eaten: 0,
    });
    const dropped = d.stacks.filter((s) => s.id === unit.id);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.owner).toBeNull();
    expect(dropped[0]?.position).toEqual(where);
    expect(units(d, 'berry')).toBe(0);
    refused(
      step(d, { lin: control('resume') }),
      /no open foraging run to resume/,
    );
  });

  it('never rewards foraging: no satisfaction, mood, practice milestone or progress credit beyond the same steps by hand', () => {
    let w = ready(),
      hand = ready();
    const bush = object(w, BUSH).spatial;
    const seen: V7Event[] = [];
    const manual = (round: number, world: V7World): V7Action => {
      const item = owned(world, 'berry')[0]?.id ?? '';
      return (
        [
          {
            interface: 'navigate',
            args: { target: BUSH, x: bush.x, y: bush.y },
          },
          {
            interface: 'probe',
            args: { target: BUSH, mode: 'observe', intensity: 0 },
          },
          { interface: 'gather', args: { target: BUSH, quantity: 1 } },
          { interface: 'eat', args: { target: item, quantity: 1 } },
          { interface: 'gather', args: { target: BUSH, quantity: 1 } },
          { interface: 'eat', args: { target: item, quantity: 1 } },
        ][round] ?? WAIT
      );
    };
    for (let round = 0; round < 8; round++) {
      w = ok(step(w, round < 6 ? { lin: forage() } : {}));
      hand = ok(step(hand, { lin: manual(round, hand) }));
      seen.push(...w.events);
    }
    expect(last(w)).toMatchObject({
      status: 'completed',
      reason: 'meal-cap',
      eaten: 2,
    });
    expect(
      seen.filter(
        (e) =>
          e.actor === 'lin' &&
          [
            'satisfaction',
            'satisfaction-maintained',
            'practice-confirmed',
            'information-confirmed',
          ].includes(e.type),
      ),
    ).toEqual([]);
    expect(
      seen.some((e) => e.type.startsWith(`${PREFIX}-`) && e.data.qualified),
    ).toBe(false);
    // Vitals, satiety, meal experience, mood, wellbeing, routine and progress accounting, the
    // eating record, position and items are exactly those of the same steps by hand.
    expect(body(actor(w))).toEqual(body(actor(hand)));
    expect(actor(w).position).toEqual(actor(hand).position);
    expect(units(w, 'berry')).toBe(units(hand, 'berry'));
    expect(object(w, BUSH).data.stock).toBe(object(hand, BUSH).data.stock);
    // The install's practice rule exists, but nothing can trigger it.
    expect(w.satisfaction.find((r) => r.id === `practice:${id}`)).toMatchObject(
      { event: 'practice-confirmed', interface: id },
    );
    // An empty run with rechecks earns nothing either.
    const empty = bare();
    const run = drive(
      empty,
      forage({ recheck: true, path: 12, time: 30, energy: 30 }),
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
            e.actor === 'lin' &&
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
        world.events.filter((e) => e.actor === 'lin'),
        longOrdinaryInput(world, 'lin').packet.execution,
        open(world),
        last(world),
      );
      return world;
    };
    // A full meal, a pause with a carried unit, a resume and the cap.
    let w = keep(step(ready(), { lin: forage() }));
    w = keep(step(w, { lin: forage() }));
    w = keep(step(w, { lin: forage() }));
    w = keep(step(w, { lin: WAIT }));
    w = keep(step(w, { lin: control('resume') }));
    for (const r of drive(w, control('resume')).rounds) keep(r);
    // Rechecks of empty bushes, avoided ground, exploration and an honest empty result.
    for (const r of drive(
      bare(),
      forage({
        radius: 8,
        path: 6,
        time: 20,
        energy: 20,
        recheck: true,
        explore: true,
        minHealth: 30,
        minTemp: 15,
        maxTemp: 30,
        avoidDirections: ['north'],
        avoidAreas: [{ x: 14.2, y: 16.3, radius: 0.6 }],
      }),
    ).rounds)
      keep(r);
    // Two kinds, unresolved kinds seen, a starving run stopped at its threshold, and a cancel.
    const both = record(ready(), 'root', { nutrition: 14, toxicity: 0 });
    for (const r of drive(both, forage({ evidenceRefs: ['berry', 'root'] }))
      .rounds)
      keep(r);
    let starving = vitals(ready(), { health: 70, satiety: 0 });
    for (let i = 0; i < 3; i++)
      starving = keep(step(starving, { lin: forage() }));
    texts.push(actor(starving).extensionState);
    const s = keep(step(ready(), { lin: forage() }));
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
    expect(text).toContain(`${PREFIX}-gathered`);
    expect(text).toContain(`${PREFIX}-ate`);
    expect(text).toContain(`${PREFIX}-stopped`);
    expect(text).toContain(`${PREFIX}-cancelled`);
    expect(text).toContain('"evidence":"remembered"');
    expect(text).toContain('safety unresolved');
    expect(text).toContain('is at or below your minimum of 60');
    expect(text).toContain(BODY);
    expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
    expect(text).not.toMatch(MENTION);
    // The open run is shown with the person's active work under its own key.
    const active = (
      longOrdinaryInput(ok(step(ready(), { lin: forage() })), 'lin').packet
        .execution as { activeState: Data }
    ).activeState;
    expect(Object.keys(active)).toEqual([OPEN]);
  });
});
