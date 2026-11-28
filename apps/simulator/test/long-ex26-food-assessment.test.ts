import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  v7Clone,
  v7Install,
  v7Observe,
  v7Reach,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Event,
  V7Knowledge,
  V7Object,
  V7Package,
  V7Point,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { longOrdinaryInput } from '../src/long-context.js';
import { IMPORT_EXCLUDED_WORDS } from '../src/long-import.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this limit.
vi.setConfig({ testTimeout: 180_000 });

const id = 'assess-food-suitability';
const REVISION = `${id}@1`;
const SUFFIX = ':food-suitability';
const UNRESOLVED = 'safety unresolved; do not consume on this evidence.';
const WAIT: V7Action = { interface: 'wait', args: {} };
const LEARN: V7Action = { interface: 'learn', args: { ability: id } };
/** The brief's agent-visible exclusions beyond the import list, and no mention of the far group. */
const EXTRA_EXCLUDED = /history|spiritual/i;
const MENTION = /villag|neighbo|meeting|middle|other group|stranger/i;
/** sha256 of JSON.stringify of the key-sorted map from id@version to the sha256 of
 * JSON.stringify of each of the 138 packages registered before this change (the scratch hash
 * file validation-results/scratch/ex26/hashes-before-6.json, taken before this change). */
const EXISTING_DIGEST =
  '2f66a7f960e7e8c52b4363d812098e194e0fb672e18fa0d5c443d41b0e0455ac';
/** Kai's own berry bush and root patch, 4 units each at genesis. */
const BERRY = 'commons-berry-3-0';
const ROOT = 'commons-root-3-0';
/** Wren's own root patch. */
const WREN_ROOT = 'commons-root-4-0';
const START: V7Point = { x: 131.1, y: 16.91 };
const AT_BERRY: V7Point = { x: 130.84, y: 18.0 };
const AT_ROOT: V7Point = { x: 132.1, y: 17.58 };
const AT_WREN_ROOT: V7Point = { x: 130.84, y: 12.0 };
/** A marsh cell of the east side, where probe's wet trial has water. */
const MARSH: V7Point = { x: 115.5, y: 3.5 };
const PRESS = 'root:load response:load-band-0';
const WET = 'root:water response:wet';
/** Hidden resource values never appear; probe's own soil reading and trial values may. */
const HIDDEN =
  /hardness|minGrowth|optimalGrowth|"decay"|"fuel"|"mass"|"nutrition":-?[0-9]|"toxicity":-?[0-9]/;

type Data = Record<string, unknown>;
type Round = ReturnType<typeof step>;
const sha = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const assessPackage = (): V7Package => {
  const p = V7_PACKAGES.find((p) => p.id === id);
  if (!p) throw new Error('Missing package.');
  return p;
};
const assess = (mode: string, args: Data = {}): V7Action => ({
  interface: id,
  args: { mode, ...args },
});
const probe = (target: string, mode = 'observe', intensity = 0): V7Action => ({
  interface: 'probe',
  args: { target, mode, intensity },
});
const gather = (target: string): V7Action => ({
  interface: 'gather',
  args: { target, quantity: 1 },
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
const place = (w: V7World, p: V7Point, who = 'kai') => {
  actor(w, who).position = { ...p };
  return w;
};
/** The person's events of this package in the round. */
const mine = (w: V7World, who = 'kai'): V7Event[] =>
  w.events.filter((e) => e.actor === who && e.type.startsWith(`${id}-`));
const only = (w: V7World, who = 'kai'): V7Event => {
  const events = mine(w, who);
  expect(events).toHaveLength(1);
  const e = events[0];
  if (!e) throw new Error('Missing event.');
  return e;
};
const record = (
  w: V7World,
  target: string,
  who = 'kai',
): V7Knowledge | undefined =>
  actor(w, who).memory.knowledge?.[`${target}${SUFFIX}`];
const ours = (w: V7World, who = 'kai') =>
  Object.keys(actor(w, who).memory.knowledge ?? {}).filter((k) =>
    k.endsWith(SUFFIX),
  );
const statuses = (e: V7Event): Record<string, unknown> =>
  Object.fromEntries(
    (e.data.findings as Data[]).map((f) => [String(f.question), f.status]),
  );
const finding = (e: V7Event, question: string): Data => {
  const f = (e.data.findings as Data[]).find((x) => x.question === question);
  if (!f) throw new Error(`Missing ${question}.`);
  return f;
};
const unresolved = {
  identity: 'unresolved',
  nutrition: 'unresolved',
  toxicity: 'unresolved',
  preparation: 'unresolved',
};
const owned = (w: V7World, resource: string, who = 'kai'): V7Stack[] =>
  w.stacks.filter((s) => s.owner === who && s.resource === resource);
const ok = (r: Round, who = 'kai') => {
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  expect(r.outcomes[who]?.complete).toBe(true);
  return r.world;
};
const refused = (r: Round, pattern: RegExp | string, who = 'kai') => {
  expect(r.outcomes[who]?.success).toBe(false);
  expect(r.outcomes[who]?.reason).toMatch(pattern);
  expect(mine(r.world, who)).toEqual([]);
  expect(
    r.world.events.filter(
      (e) =>
        e.actor === who &&
        ['trial-result', 'trial-material-consumed'].includes(e.type),
    ),
  ).toEqual([]);
  return r.world;
};
/** A refusal costs nothing: vitals, items, objects and records as in a round of waiting. */
function free(w: V7World, action: V7Action, pattern: RegExp | string) {
  const r = step(v7Clone(w), { kai: action });
  refused(r, pattern);
  const idle = step(v7Clone(w)).world;
  expect(actor(r.world).vitals).toEqual(actor(idle).vitals);
  expect(actor(r.world).position).toEqual(actor(w).position);
  expect(v7Signature(r.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(r.world.objects)).toBe(v7Signature(idle.objects));
  expect(actor(r.world).memory.knowledge).toEqual(actor(idle).memory.knowledge);
  return r;
}
const installed = () => {
  const g = initialLongWorld('long-ex26', 'long-culture-v2-villages');
  return v7Clone(v7Install(g, continuousRegistry(g), REVISION));
};
/** Kai studies one round and masters the operation. */
function learned(world?: V7World) {
  const w = ok(step(world ?? installed(), { kai: LEARN }));
  expect(actor(w).mastered).toContain(id);
  return w;
}
/** Kai gathers one unit from a source he reaches from `at` and eats it, which dates his record. */
function eatOne(w: V7World, source: string, at: V7Point, who = 'kai') {
  w = ok(step(place(w, at, who), { [who]: gather(source) }), who);
  const item = w.stacks.find((s) => s.owner === who && s.origin === source);
  if (!item) throw new Error('Missing gathered unit.');
  return ok(
    step(w, {
      [who]: { interface: 'eat', args: { target: item.id, quantity: 1 } },
    }),
    who,
  );
}
/** Kai carries two root units of his patch (two separate harvests). */
function withRoots(w: V7World) {
  w = place(w, AT_ROOT);
  w = ok(step(w, { kai: gather(ROOT) }));
  w = ok(step(w, { kai: gather(ROOT) }));
  const items = owned(w, 'root');
  expect(items.map((s) => s.quantity)).toEqual([1, 1]);
  return w;
}
/** Kai's first root sample is pressed by hand with probe: the comparison record. */
function pressed(w: V7World, load = 0.05) {
  const [first] = owned(w, 'root');
  if (!first) throw new Error('Missing root.');
  w = ok(step(w, { kai: probe(first.id, 'press', load) }));
  expect(actor(w).memory.knowledge?.[PRESS]).toMatchObject({
    verified: true,
    subject: 'root',
    value: { load, held: true },
  });
  return w;
}
const second = (w: V7World): V7Stack => {
  const s = owned(w, 'root')[1];
  if (!s) throw new Error('Missing second root.');
  return s;
};

describe('food suitability assessment in ex26', () => {
  it('is registered fourth for long-ex26, with new names, learning 1, the size limit, no excluded word and every earlier package byte-identical', () => {
    const pkg = assessPackage();
    const ability = pkg.abilities[0];
    if (!ability) throw new Error('Missing ability.');
    // The fourth long-ex26 package; later developments of this run append their own after it.
    expect(
      V7_PACKAGES.filter((p) => p.scope === 'long-ex26')
        .map((p) => p.id)
        .slice(0, 4),
    ).toEqual([
      'bounded-resource-search',
      'reciprocal-conversation',
      'tend-rooted-plants',
      id,
    ]);
    expect(pkg).toMatchObject({
      id,
      version: 1,
      scope: 'long-ex26',
      dependencies: ['foundation-forest@1', 'foundation-open@1'],
      visualComponents: [],
      satisfaction: [],
      resources: [],
      processes: {},
      events: [`${id}-inspected`, `${id}-trialled`],
    });
    expect(pkg.afterEnvironment).toBeUndefined();
    expect(pkg.beforeAction).toBeUndefined();
    expect(pkg.onDeath).toBeUndefined();
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 1,
      revision: REVISION,
      handler: `long.${id}`,
      authored: false,
      prerequisites: ['probe'],
      dependencies: { abilities: ['probe'], resources: [], knowledge: [] },
      references: { target: 'optional-exact-visible' },
      practiceEvidence: `${id}-inspected`,
      execution: { duration: 1, interruption: 'cancel' },
    });
    expect(ability.learningEnergy).toBeUndefined();
    expect(Object.keys(ability.parameters.properties ?? {})).toEqual([
      'mode',
      'target',
      'intendedConsumer',
      'evidenceRefs',
      'methodRef',
      'intensity',
    ]);
    expect(ability.parameters.required).toEqual(['mode', 'target']);
    expect(ability.parameters.properties?.mode?.enum).toEqual([
      'inspect',
      'trial',
    ]);
    // The published costs are probe's own.
    expect(ability.costs).toContain(
      'inspect: probe observe, 1 round, 0.2 energy, no material',
    );
    expect(ability.costs).toContain(
      '1 round, 0.5 energy and 0.1 unit of your own sample, consumed as loss',
    );
    expect(ability.effects).toContain(UNRESOLVED);
    // New package, ability, equivalence, handler and event names.
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(id);
        expect(a.equivalence).not.toBe(ability.equivalence);
        expect(a.handler).not.toBe(ability.handler);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? [])
        expect(e.startsWith(`${id}-`)).toBe(false);
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
    expect(Object.keys(map)).toHaveLength(138);
    expect(sha(map)).toBe(EXISTING_DIGEST);
    // Only the current scope can install it, and only where the ordinary probe exists.
    const other = initialLongWorld('long-ex25', 'long-culture-v2-villages');
    expect(continuousRegistry(other).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(other, continuousRegistry(), REVISION)).toThrow(
      /not approved/,
    );
    const blind = v7Clone(
      initialLongWorld('long-ex26', 'long-culture-v2-villages'),
    );
    blind.abilities = blind.abilities.filter((a) => a.id !== 'probe');
    expect(() => v7Install(blind, continuousRegistry(blind), REVISION)).toThrow(
      /ordinary probe interface/,
    );
    // Installing changes no person, object, item, process or state.
    const before = initialLongWorld('long-ex26', 'long-culture-v2-villages');
    expect(v7Signature(g.actors)).toBe(v7Signature(before.actors));
    expect(v7Signature(g.objects)).toBe(v7Signature(before.objects));
    expect(v7Signature(g.stacks)).toBe(v7Signature(before.stacks));
    expect(v7Signature(g.state)).toBe(v7Signature(before.state));
    expect(g.processes).toEqual(before.processes);
  });

  it('takes one study round without study energy or reward and refuses before mastery at no cost', () => {
    let w = place(installed(), AT_ROOT),
      idle = v7Clone(w);
    const r = step(w, { kai: assess('inspect', { target: ROOT }) });
    expect(r.outcomes.kai?.success).toBe(false);
    expect(r.outcomes.kai?.reason).toMatch(/not mastered/);
    w = r.world;
    idle = step(idle).world;
    expect(actor(w).vitals).toEqual(actor(idle).vitals);
    w = ok(step(w, { kai: LEARN }));
    idle = step(idle).world;
    expect(actor(w).mastered).toContain(id);
    expect(actor(w).learning).toBeNull();
    expect(
      w.events.filter((e) => e.actor === 'kai').map((e) => e.type),
    ).toContain('mastered');
    // Study costs the round only, and gives no satisfaction or practice milestone.
    expect(actor(w).vitals).toEqual(actor(idle).vitals);
    expect(actor(w).wellbeing).toEqual(actor(idle).wellbeing);
    expect(
      w.events.filter(
        (e) =>
          e.actor === 'kai' &&
          ['satisfaction', 'practice-confirmed'].includes(e.type),
      ),
    ).toEqual([]);
  });

  it("inspects with probe's own observation for its 0.2 energy in one round and attaches four separate conclusions; without evidence safety stays unresolved", () => {
    const w0 = place(learned(), AT_ROOT);
    const w = ok(
      step(v7Clone(w0), {
        kai: assess('inspect', { target: ROOT, evidenceRefs: [] }),
      }),
    );
    const byHand = ok(step(v7Clone(w0), { kai: probe(ROOT) }));
    const idle = step(v7Clone(w0)).world;
    // The cost is probe observe's: the same vitals as probing by hand, 0.2 below waiting.
    expect(actor(w).vitals).toEqual(actor(byHand).vitals);
    expect(actor(w).vitals.energy).toBeCloseTo(
      actor(idle).vitals.energy - 0.2,
      9,
    );
    expect(actor(w).position).toEqual(AT_ROOT);
    // The observation is probe's own record, as by hand.
    const key = `${ROOT}:observed-state`;
    const look = actor(w).memory.knowledge?.[key];
    expect(look).toMatchObject({
      property: 'visible state',
      method: 'direct observation',
      verified: false,
      tick: w.tick,
      value: actor(byHand).memory.knowledge?.[key]?.value,
    });
    // The round's events of Kai's action: probe's own, then this operation's.
    expect(
      w.events
        .filter((e) => e.actor === 'kai' && e.interface === id)
        .map((e) => e.type),
    ).toEqual(['trial-result', `${id}-inspected`]);
    const e = only(w);
    // Four separate conclusions, each with its claim, basis and evidence links.
    const list = e.data.findings as Data[];
    expect(list.map((f) => f.question)).toEqual([
      'identity',
      'nutrition',
      'toxicity',
      'preparation',
    ]);
    for (const f of list) {
      expect(f.status).toBe('unresolved');
      expect(typeof f.claim).toBe('string');
      expect(typeof f.basis).toBe('string');
      expect(Array.isArray(f.evidence)).toBe(true);
    }
    expect(finding(e, 'identity').evidence).toEqual([look?.evidence]);
    expect(finding(e, 'identity').basis).toBe(
      'no first-hand record of root is cited, such as a record of eating it; the shown name "Meadow roots" is a label, not an identification',
    );
    expect(finding(e, 'toxicity').basis).toContain(
      'appearance is not chemical analysis',
    );
    expect(e.data.verdict).toEqual({ status: 'unresolved', text: UNRESOLVED });
    expect(e.description).toBe(
      `Inspected ${ROOT} (root) with probe for 0.2 energy. Identity unresolved, nutrition unresolved, toxicity unresolved, preparation unresolved: ${UNRESOLVED}`,
    );
    expect(e.data.observation).toEqual(look?.value);
    expect(e.data.view).toMatchObject({
      component: null,
      visual: 'probe interaction, reused',
      mode: 'inspect',
      interaction: 'observe',
      target: ROOT,
      status: 'unresolved',
      verdict: 'unresolved',
      progress: { done: 1, required: 1 },
      uncertainty: ['identity', 'nutrition', 'toxicity', 'preparation'],
      heat: false,
      liquid: false,
      sampleChange: null,
      badge: null,
      preparedFood: null,
      successEffect: null,
      withinReach: true,
    });
    // One shared evidence record, a derived report that is never verified.
    expect(record(w, ROOT)).toMatchObject({
      subject: 'root',
      verified: false,
      evidence: e.id,
      tick: w.tick,
      value: {
        mode: 'inspect',
        consumer: 'kai',
        verdict: 'unresolved',
        findings: unresolved,
        evidence: [],
      },
    });
    // Nothing else changes: the patch and items are as after probing by hand.
    expect(object(w, ROOT)).toEqual(object(byHand, ROOT));
    expect(w.stacks).toEqual(byHand.stacks);
    // Kai knows berries at genesis, but an uncited record is not used, and his undated genesis
    // record is not complete dated evidence.
    const bush = ok(
      step(place(v7Clone(w), AT_BERRY), {
        kai: assess('inspect', { target: BERRY }),
      }),
    );
    expect(statuses(only(bush))).toEqual(unresolved);
    expect(only(bush).data.verdict).toMatchObject({ text: UNRESOLVED });
    free(
      place(v7Clone(w), AT_BERRY),
      assess('inspect', { target: BERRY, evidenceRefs: ['berry'] }),
      /^evidenceRefs: berry is not a complete dated record\. Nothing was spent\.$/,
    );
  });

  it('cites first-hand eating knowledge only where identity and applicability are established, from the record itself, and never transfers it to another kind', () => {
    const w = eatOne(learned(), BERRY, AT_BERRY);
    const eaten = actor(w).memory.discoveries?.berry;
    expect(eaten).toEqual({ nutrition: 8, toxicity: 0, observedAt: w.tick });
    // Kai's own berry bush, citing his own dated eating record of berries.
    const bush = ok(
      step(place(v7Clone(w), AT_BERRY), {
        kai: assess('inspect', { target: BERRY, evidenceRefs: ['berry'] }),
      }),
    );
    let e = only(bush);
    expect(statuses(e)).toEqual({
      identity: 'supported',
      nutrition: 'supported',
      toxicity: 'supported',
      preparation: 'supported',
    });
    expect(finding(e, 'identity').basis).toBe(
      `you ate berry yourself (your eating record berry, round ${String(w.tick)}) and inspected this berry now`,
    );
    expect(finding(e, 'nutrition').basis).toBe(
      `8 satiety per unit when you ate berry (round ${String(w.tick)})`,
    );
    expect(finding(e, 'nutrition').evidence).toEqual(['berry']);
    expect(e.data.priorKnowledge).toEqual({
      record: 'berry',
      applied: true,
      nutrition: 8,
      toxicity: 0,
      round: w.tick,
      why: 'identity and applicability established by your own eating record of this kind',
    });
    expect(e.data.verdict).toMatchObject({ status: 'supported' });
    expect(String((e.data.verdict as Data).text)).toContain('not a guarantee');
    expect(e.data.evidence).toEqual([
      expect.objectContaining({
        id: 'berry',
        kind: 'eating record',
        round: w.tick,
        category: 'direct observation',
      }),
    ]);
    expect(e.data.view).toMatchObject({ status: 'observed', badge: null });
    // The cited values are the record's own: a record of 7 is cited as 7.
    const seven = place(v7Clone(w), AT_BERRY);
    const r7 = actor(seven).memory.discoveries?.berry;
    if (!r7) throw new Error('Missing record.');
    r7.nutrition = 7;
    e = only(
      ok(
        step(seven, {
          kai: assess('inspect', { target: BERRY, evidenceRefs: ['berry'] }),
        }),
      ),
    );
    expect(finding(e, 'nutrition').basis).toMatch(/^7 satiety per unit/);
    expect(e.data.priorKnowledge).toMatchObject({ nutrition: 7 });
    // A first-hand record of harm says do not consume.
    const harmful = place(v7Clone(w), AT_BERRY);
    const r3 = actor(harmful).memory.discoveries?.berry;
    if (!r3) throw new Error('Missing record.');
    r3.toxicity = 3;
    e = only(
      ok(
        step(harmful, {
          kai: assess('inspect', { target: BERRY, evidenceRefs: ['berry'] }),
        }),
      ),
    );
    expect(statuses(e)).toEqual({
      identity: 'supported',
      nutrition: 'supported',
      toxicity: 'contradicted',
      preparation: 'unresolved',
    });
    expect(e.data.verdict).toEqual({
      status: 'harm-recorded',
      text: 'do not consume on this evidence: your own eating record of berry shows health loss.',
    });
    // The root patch: the berry record does not transfer to roots.
    const patch = ok(
      step(place(v7Clone(w), AT_ROOT), {
        kai: assess('inspect', { target: ROOT, evidenceRefs: ['berry'] }),
      }),
    );
    e = only(patch);
    expect(statuses(e)).toEqual(unresolved);
    expect(e.data.priorKnowledge).toBeNull();
    expect(e.data.notTransferred).toEqual(['berry']);
    expect(finding(e, 'identity').basis).toContain(
      'your records of berry concern other kinds and do not transfer to root',
    );
    expect(e.data.verdict).toEqual({ status: 'unresolved', text: UNRESOLVED });
    expect(JSON.stringify(e)).not.toMatch(/satiety|health loss/);
    expect(JSON.stringify(e)).not.toMatch(HIDDEN);
    // A berry Kai carries is identified the same way.
    let carrying = ok(
      step(place(v7Clone(w), AT_BERRY), { kai: gather(BERRY) }),
    );
    const [berry] = owned(carrying, 'berry');
    if (!berry) throw new Error('Missing berry.');
    carrying = ok(
      step(place(carrying, START), {
        kai: assess('inspect', { target: berry.id, evidenceRefs: ['berry'] }),
      }),
    );
    e = only(carrying);
    expect(statuses(e)).toMatchObject({ identity: 'supported' });
    expect(finding(e, 'identity').basis).toContain('hold this berry now');
    // Hearsay, an earlier assessment and a record of another source establish nothing.
    let told = place(v7Clone(w), AT_ROOT);
    told = step(told, {
      wren: { interface: 'tell', args: { text: 'The roots are fine to eat.' } },
    }).world;
    const heard = (
      actor(told).extensionState['expression:heard'] as Data[] | undefined
    )?.find((x) => x.from === 'wren');
    expect(heard).toBeDefined();
    told = ok(
      step(told, {
        kai: assess('inspect', { target: ROOT, evidenceRefs: [] }),
      }),
    );
    told = ok(
      step(told, {
        kai: assess('inspect', {
          target: ROOT,
          evidenceRefs: [String(heard?.source), `${ROOT}${SUFFIX}`, 'berry'],
        }),
      }),
    );
    e = only(told);
    expect(statuses(e)).toEqual(unresolved);
    expect(
      (e.data.evidence as Data[]).map((x) => [x.kind, x.category]),
    ).toEqual([
      ['heard message', 'unverified claim'],
      ['assessment', 'inapplicable'],
      ['eating record', 'inapplicable'],
    ]);
    expect(e.data.verdict).toMatchObject({ text: UNRESOLVED });
  });

  it('applies the same rule to any person: Wren identifies roots from her own eating record', () => {
    let w = learned();
    w = ok(step(w, { wren: LEARN }), 'wren');
    w = eatOne(w, WREN_ROOT, AT_WREN_ROOT, 'wren');
    const e = only(
      ok(
        step(w, {
          wren: assess('inspect', {
            target: WREN_ROOT,
            evidenceRefs: ['root'],
          }),
        }),
        'wren',
      ),
      'wren',
    );
    expect(statuses(e)).toEqual({
      identity: 'supported',
      nutrition: 'supported',
      toxicity: 'supported',
      preparation: 'supported',
    });
    expect(finding(e, 'nutrition').basis).toMatch(/^14 satiety per unit/);
  });

  it("assesses for another person seen now only from the actor's own records, never reveals their state, and refuses anyone not seen exactly like an unknown id", () => {
    const w = place(learned(), AT_ROOT);
    // Wren and Ivo have eaten roots before; Kai has not.
    expect(actor(w, 'wren').memory.discoveries?.root).toBeDefined();
    expect(
      v7Observe(w, 'kai').actors.some((x) => x.id === 'wren' && x.alive),
    ).toBe(true);
    const idle = step(v7Clone(w)).world;
    const r = ok(
      step(v7Clone(w), {
        kai: assess('inspect', {
          target: ROOT,
          intendedConsumer: 'wren',
          evidenceRefs: [],
        }),
      }),
    );
    const e = only(r);
    expect(e.data.consumer).toBe('wren');
    expect(statuses(e)).toEqual(unresolved);
    expect(e.description).toContain(
      `${UNRESOLVED} For Wren: from your own records only; nothing of Wren's state or records was read, and Wren is not asked or committed to eat.`,
    );
    const said = JSON.stringify([e, record(r, ROOT)]);
    expect(said).not.toContain(
      JSON.stringify(actor(w, 'wren').memory.discoveries),
    );
    expect(said).not.toMatch(/satiety|health loss/);
    expect(said).not.toMatch(HIDDEN);
    // Wren is neither moved, fed nor otherwise touched.
    for (const part of ['vitals', 'position', 'mastered'] as const)
      expect(actor(r, 'wren')[part]).toEqual(actor(idle, 'wren')[part]);
    expect(actor(r, 'wren').memory.discoveries).toEqual(
      actor(idle, 'wren').memory.discoveries,
    );
    expect(actor(r, 'wren').memory.knowledge).toEqual(
      actor(idle, 'wren').memory.knowledge,
    );
    // Lin is far away and unseen: refused exactly as a person who does not exist.
    expect(v7Observe(w, 'kai').actors.some((x) => x.id === 'lin')).toBe(false);
    const away = free(
      w,
      assess('inspect', { target: ROOT, intendedConsumer: 'lin' }),
      /^intendedConsumer is you \(the default\) or a living person you see now\. Nothing was spent\.$/,
    );
    const nobody = free(
      w,
      assess('inspect', { target: ROOT, intendedConsumer: 'nobody' }),
      /^intendedConsumer is you/,
    );
    expect(away.outcomes.kai?.reason).toBe(nobody.outcomes.kai?.reason);
    expect(away.outcomes.kai?.reason).not.toMatch(/Lin/);
  });

  it('never exposes hidden food or material values, for sources and carried items alike', () => {
    let w = withRoots(learned());
    const texts: string[] = [];
    const [root] = owned(w, 'root');
    if (!root) throw new Error('Missing root.');
    const acorn = object(w, 'forest-acorn-3');
    const stone = object(w, 'start-5-stone');
    for (const [where, target] of [
      [AT_ROOT, ROOT],
      [AT_ROOT, root.id],
      [{ x: acorn.spatial.x - 0.5, y: acorn.spatial.y }, acorn.id],
      [{ x: stone.spatial.x, y: stone.spatial.y + 0.7 }, stone.id],
    ] as const) {
      w = ok(
        step(place(w, where), {
          kai: assess('inspect', { target, evidenceRefs: [] }),
        }),
      );
      const e = only(w);
      expect(statuses(e)).toEqual(unresolved);
      const said = JSON.stringify([e, record(w, target)]);
      texts.push(said);
      expect(said).not.toMatch(HIDDEN);
      expect(said).not.toMatch(/flexibility|satiety|health loss/);
      // The carried unit's decay is not shown.
      const item = w.stacks.find((s) => s.id === root.id);
      expect(said).not.toContain(String(item?.decay));
    }
    // Acorns are harmful and stone is not food, yet the report says exactly the same of each.
    const findings = texts.map((t) => {
      const parsed = JSON.parse(t) as [V7Event];
      return (parsed[0].data.findings as Data[]).map((f) => f.status);
    });
    expect(new Set(findings.map((f) => JSON.stringify(f))).size).toBe(1);
  });

  it('trials only through an executable probe method with a real comparison, debits 0.1 of the owned sample exactly once, and otherwise refuses naming the missing prerequisite at no cost', () => {
    const base = withRoots(learned());
    const item = second(base);
    // Without a comparison record, or with a missing physical prerequisite, nothing happens.
    free(
      base,
      assess('trial', { target: item.id, methodRef: 'press', intensity: 0.05 }),
      /^Trial refused, missing: a cited verified load response record of root from probe at the same load 0\.05 to compare with: a press response bears on identity only by comparison and measures no nutrition, harm or preparation\. A press trial costs 1 round, 0\.5 energy and 0\.1 unit of your sample\. Nothing was spent\.$/,
    );
    free(
      base,
      assess('trial', { target: item.id, methodRef: 'heat' }),
      /missing: a usable heat source with at least 0\.1 available heat within your reach; a cited verified heat response record of root/,
    );
    free(
      base,
      assess('trial', { target: item.id, methodRef: 'probe:wet' }),
      /missing: usable water where you stand \(marsh, ford or river\), to wet the sample in it/,
    );
    free(
      base,
      assess('trial', { target: ROOT, methodRef: 'press' }),
      /^Trial refused, missing: your own sample: a trial uses 0\.1 unit of an item you carry, not a source or a loose item/,
    );
    free(
      base,
      assess('trial', { target: item.id }),
      /^A trial needs methodRef press, wet or heat/,
    );
    free(
      base,
      assess('trial', { target: item.id, methodRef: 'taste' }),
      /^methodRef taste is not one of probe's methods/,
    );
    // Kai presses his first root by hand with probe, then trials the second against that record.
    const w0 = pressed(base);
    const before = second(w0);
    const r = step(v7Clone(w0), {
      kai: assess('trial', {
        target: before.id,
        methodRef: 'press',
        intensity: 0.05,
        evidenceRefs: [PRESS],
      }),
    });
    const w = ok(r);
    const byHand = ok(
      step(v7Clone(w0), { kai: probe(before.id, 'press', 0.05) }),
    );
    const idle = step(v7Clone(w0)).world;
    // probe's own cost: as by hand, 0.5 energy below waiting.
    expect(actor(w).vitals).toEqual(actor(byHand).vitals);
    expect(actor(w).vitals.energy).toBeCloseTo(
      actor(idle).vitals.energy - 0.5,
      9,
    );
    // Exactly 0.1 of the nominated sample is debited, once; nothing else changes.
    const after = w.stacks.find((s) => s.id === before.id);
    expect(after).toMatchObject({ quantity: 0.9, quantityTenths: 9 });
    expect(w.stacks).toEqual(byHand.stacks);
    expect(
      w.stacks.filter((s) => s.id !== before.id).map((s) => s.quantity),
    ).toEqual(
      idle.stacks.filter((s) => s.id !== before.id).map((s) => s.quantity),
    );
    expect(w.stacks).toHaveLength(idle.stacks.length);
    // The round's events of Kai's action: probe's own, then this operation's.
    expect(
      w.events
        .filter((e) => e.actor === 'kai' && e.interface === id)
        .map((e) => e.type),
    ).toEqual(['trial-result', 'trial-material-consumed', `${id}-trialled`]);
    const e = only(w);
    expect(e.data.comparison).toMatchObject({
      mode: 'press',
      same: true,
      reference: { id: PRESS, key: PRESS, value: { load: 0.05, held: true } },
      value: { load: 0.05, held: true },
    });
    expect(statuses(e)).toEqual(unresolved);
    expect(finding(e, 'identity').basis).toContain(
      `a matching press response is consistent with your record ${PRESS} but identifies nothing`,
    );
    expect(finding(e, 'nutrition').basis).toContain(
      'a press response measures none of this',
    );
    expect(e.data.consumed).toEqual({
      item: before.id,
      before: 1,
      after: 0.9,
      consumed: 0.1,
      accountedAs:
        'loss: consumed by the trial (deformed, wetted or heated), not kept as food',
    });
    expect(e.data.debit).toEqual({
      rounds: 1,
      energy: 0.5,
      sample: 0.1,
      heat: 0,
    });
    expect(e.data.view).toMatchObject({
      mode: 'trial',
      interaction: 'press',
      status: 'unresolved',
      progress: { done: 1, required: 1 },
      heat: false,
      liquid: false,
      sampleChange: { item: before.id, before: 1, after: 0.9 },
      badge: null,
    });
    expect(e.data.verdict).toEqual({ status: 'unresolved', text: UNRESOLVED });
    expect(record(w, before.id)?.value).toMatchObject({
      mode: 'trial',
      method: 'press',
      verdict: 'unresolved',
      evidence: [PRESS],
    });
    // A reference whose recorded response differs contradicts identity: an informative failure.
    const odd = v7Clone(w0);
    const ref = actor(odd).memory.knowledge?.[PRESS];
    if (
      !ref?.value ||
      typeof ref.value !== 'object' ||
      Array.isArray(ref.value)
    )
      throw new Error('Missing reference.');
    ref.value.held = false;
    const c = only(
      ok(
        step(odd, {
          kai: assess('trial', {
            target: before.id,
            methodRef: 'press',
            intensity: 0.05,
            evidenceRefs: [PRESS],
          }),
        }),
      ),
    );
    expect(statuses(c)).toEqual({ ...unresolved, identity: 'contradicted' });
    expect(finding(c, 'identity').basis).toContain('not the same material');
    expect(c.data.view).toMatchObject({ status: 'informative-failure' });
    // A wet trial with water where Kai stands, against his earlier wet record.
    let wet = place(v7Clone(base), MARSH);
    const [first] = owned(wet, 'root');
    if (!first) throw new Error('Missing root.');
    wet = ok(step(wet, { kai: probe(first.id, 'wet') }));
    expect(actor(wet).memory.knowledge?.[WET]).toMatchObject({
      verified: true,
    });
    wet = ok(
      step(wet, {
        kai: assess('trial', {
          target: item.id,
          methodRef: 'wet',
          evidenceRefs: [WET],
        }),
      }),
    );
    const d = only(wet);
    expect(d.data.view).toMatchObject({ liquid: true, heat: false });
    expect(d.data.comparison).toMatchObject({ mode: 'wet', same: true });
    expect(wet.stacks.find((s) => s.id === item.id)?.quantity).toBe(0.9);
    expect(actor(wet).position).toEqual(MARSH);
  });

  it('refuses at no cost a target not seen now or only remembered, out of reach, not a material, an unknown record and malformed arguments', () => {
    const base = learned();
    const deer = object(base, 'deer-136-18');
    const nearDeer = { x: deer.spatial.x - 0.5, y: deer.spatial.y };
    const cases: [V7Point, V7Action, RegExp | string][] = [
      [
        START,
        assess('inspect', { target: '' }),
        /^Give target: your own item, a loose item or a source within your reach\. Nothing was spent\.$/,
      ],
      [
        START,
        assess('inspect', { target: 'no-such-thing' }),
        /^Reference absent-or-inaccessible-identity/,
      ],
      [
        START,
        assess('inspect', { target: 'root' }),
        /^Reference absent-or-inaccessible-identity/,
      ],
      [
        START,
        assess('inspect', { target: ROOT }),
        /^commons-root-3-0 is not within your reach; approach it first with navigate\. Nothing was spent\.$/,
      ],
      [
        nearDeer,
        assess('inspect', { target: deer.id }),
        /is not an item or a source of a material, so it cannot be assessed as food\. Nothing was spent\.$/,
      ],
      [
        AT_ROOT,
        assess('inspect', { target: ROOT, evidenceRefs: ['no-such-record'] }),
        /^evidenceRefs: no-such-record is not one of your complete records/,
      ],
      [
        AT_ROOT,
        assess('inspect', {
          target: ROOT,
          evidenceRefs: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        }),
        /^evidenceRefs accepts at most 6 of your record ids\. Nothing was spent\.$/,
      ],
      [
        AT_ROOT,
        assess('inspect', { target: ROOT, methodRef: 'press' }),
        /^inspect is probe observe/,
      ],
    ];
    for (const [where, action, pattern] of cases)
      free(place(v7Clone(base), where), action, pattern);
    expect(v7Reach(actor(place(v7Clone(base), nearDeer)), deer.spatial)).toBe(
      true,
    );
    // Too little energy for probe's observation.
    const tired = place(v7Clone(base), AT_ROOT);
    actor(tired).vitals.energy = 0.1;
    refused(
      step(tired, { kai: assess('inspect', { target: ROOT }) }),
      /^Inspection is probe's observation for 0\.2 energy; you have 0\.1\. Nothing was spent\.$/,
    );
    // A patch seen earlier but out of view now must be revisited: the refusal reads exactly as
    // for an identity that does not exist.
    let away = step(place(v7Clone(base), START)).world;
    expect(actor(away).memory.objects.some((m) => m.object.id === ROOT)).toBe(
      true,
    );
    away = place(away, { x: 124.6, y: 14 });
    expect(v7Observe(away, 'kai').objects.some((o) => o.id === ROOT)).toBe(
      false,
    );
    const remembered = free(
      away,
      assess('inspect', { target: ROOT }),
      /^Reference absent-or-inaccessible-identity/,
    );
    const unknown = free(
      away,
      assess('inspect', { target: 'no-such-plant' }),
      /^Reference absent-or-inaccessible-identity/,
    );
    expect(remembered.outcomes.kai?.reason).toBe(unknown.outcomes.kai?.reason);
    const failed = (r: Round) =>
      r.world.events.filter((e) => e.actor === 'kai' && e.type === 'failed')[0]
        ?.data;
    expect({ ...failed(remembered), suppliedReference: null }).toEqual({
      ...failed(unknown),
      suppliedReference: null,
    });
    expect(ours(remembered.world)).toEqual([]);
  });

  it('never moves anyone and reports nothing beyond the target in reach and the actor’s own records', () => {
    let w = withRoots(eatOne(learned(), BERRY, AT_BERRY));
    const [root] = owned(w, 'root');
    if (!root) throw new Error('Missing root.');
    w = pressed(w);
    const steps: [V7Point, V7Action][] = [
      [AT_ROOT, assess('inspect', { target: ROOT })],
      [AT_BERRY, assess('inspect', { target: BERRY, evidenceRefs: ['berry'] })],
      [START, assess('inspect', { target: root.id, intendedConsumer: 'ivo' })],
      [START, assess('inspect', { target: root.id })],
      [
        START,
        assess('trial', {
          target: second(w).id,
          methodRef: 'press',
          intensity: 0.05,
          evidenceRefs: [PRESS],
        }),
      ],
    ];
    for (const [where, action] of steps) {
      w = place(w, where);
      const before = w.actors.map((a) => ({ ...a.position }));
      const target =
        typeof action.args.target === 'string' ? action.args.target : '';
      // A carried unit's own origin is the person's own knowledge (probe names it on a trial).
      const origin = w.stacks.find((s) => s.id === target)?.origin;
      const seen = new Set(v7Observe(w, 'kai').objects.map((o) => o.id));
      w = ok(step(w, { kai: action }));
      expect(w.actors.map((a) => a.position)).toEqual(before);
      // Every event of Kai's round (probe's and this operation's) and the record name no object
      // but the target (and a carried unit's origin), and nothing outside view.
      const said = JSON.stringify(w.events.filter((e) => e.actor === 'kai'));
      const kept = JSON.stringify(record(w, target));
      for (const o of w.objects) {
        if (o.id !== target && o.id !== origin)
          expect(said + kept).not.toContain(o.id);
        if (!seen.has(o.id)) expect(said + kept).not.toContain(o.id);
      }
      // No other person's private state is read into it.
      for (const other of w.actors.filter((a) => a.id !== 'kai'))
        expect(said).not.toContain(JSON.stringify(other.memory.discoveries));
    }
    // The ordinary input names no remote food (the far area's plants are wild-*).
    const input = JSON.stringify(longOrdinaryInput(w, 'kai'));
    expect(input).not.toContain('wild-');
  });

  it('commits atomically: an interrupted round leaves no debit or finding and a retry is a new paid round; death after commitment keeps the debit, the accounting and the record, and nothing continues', () => {
    const w0 = pressed(withRoots(learned()));
    const sample = second(w0);
    const action = assess('trial', {
      target: sample.id,
      methodRef: 'press',
      intensity: 0.05,
      evidenceRefs: [PRESS],
    });
    // The computation budget runs out after Kai's action and before the round commits: the
    // round pauses and the world is exactly as before, with no debit and no finding.
    const tight = v7Clone(w0);
    expect(tight.actors.map((a) => a.id).indexOf('kai')).toBe(3);
    tight.config.computation.workPerRound = 4;
    const signature = v7Signature(tight);
    const paused = v7Step(
      tight,
      Object.fromEntries(
        tight.actors.map((a) => [a.id, a.id === 'kai' ? action : WAIT]),
      ),
      continuousRegistry(tight),
    );
    expect(paused.paused).toMatch(/computation budget/);
    expect(v7Signature(paused.world)).toBe(signature);
    expect(paused.world.stacks.find((s) => s.id === sample.id)?.quantity).toBe(
      1,
    );
    expect(record(paused.world, sample.id)).toBeUndefined();
    // A retry is a new validated interaction with the normal costs, and leaves nothing pending.
    let w = ok(step(v7Clone(w0), { kai: action }));
    expect(w.stacks.find((s) => s.id === sample.id)?.quantity).toBe(0.9);
    expect(mine(w)).toHaveLength(1);
    const execution = (x: V7World) =>
      longOrdinaryInput(x, 'kai').packet.execution as {
        binding: unknown;
        activeState: Data;
      };
    expect(execution(w).binding).toBeNull();
    expect(Object.keys(execution(w).activeState)).toEqual([]);
    // Another action next round interrupts nothing.
    w = step(w, {
      kai: { interface: 'navigate', args: { target: '', x: 131, y: 17.2 } },
    }).world;
    expect(Object.keys(execution(w).activeState)).toEqual([]);
    expect(mine(w)).toEqual([]);
    expect(w.stacks.find((s) => s.id === sample.id)?.quantity).toBe(0.9);
    // Death after the trial commits: the debit and its record persist, the sample (0.1 less)
    // lies at the death position, nothing is refunded and nothing continues.
    const dying = v7Clone(w0);
    actor(dying).vitals.health = 0.5;
    actor(dying).vitals.satiety = 0;
    const at = { ...actor(dying).position };
    const d = step(dying, { kai: action });
    expect(d.outcomes.kai?.success).toBe(true);
    const types = d.world.events
      .filter((e) => e.actor === 'kai')
      .map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining([`${id}-trialled`, 'died', 'respawned']),
    );
    expect(d.world.stacks.find((s) => s.id === sample.id)).toMatchObject({
      owner: null,
      quantity: 0.9,
      position: at,
    });
    expect(record(d.world, sample.id)).toMatchObject({
      evidence: mine(d.world)[0]?.id,
    });
    const later = step(d.world).world;
    expect(mine(later)).toEqual([]);
    expect(later.stacks.find((s) => s.id === sample.id)?.quantity).toBe(0.9);
  });

  it('counts each round as a probe round counts for routine and experience, with no satisfaction, practice milestone or progress credit', () => {
    let viaAssess = place(learned(), AT_ROOT),
      byHand = v7Clone(viaAssess);
    // Long enough after study that rounds can count as routine.
    for (let i = 0; i < 17; i++) {
      viaAssess = step(viaAssess).world;
      byHand = step(byHand).world;
    }
    for (let round = 0; round < 6; round++) {
      viaAssess = ok(
        step(viaAssess, { kai: assess('inspect', { target: ROOT }) }),
      );
      byHand = ok(step(byHand, { kai: probe(ROOT) }));
      expect(
        viaAssess.events.filter(
          (e) =>
            e.actor === 'kai' &&
            [
              'satisfaction',
              'practice-confirmed',
              'information-confirmed',
            ].includes(e.type),
        ),
      ).toEqual([]);
    }
    const a = actor(viaAssess),
      b = actor(byHand);
    for (const key of [
      'open:routine',
      'open:routineBurden',
      'long:lastProgress',
    ])
      expect(a.extensionState[key]).toEqual(b.extensionState[key]);
    const routine = b.extensionState['open:routine'] as boolean[];
    expect(routine.slice(-6)).toEqual([true, true, true, true, true, true]);
    expect(a.vitals).toEqual(b.vitals);
    expect(a.wellbeing).toEqual(b.wellbeing);
    const named = (x: V7Actor) =>
      JSON.parse(
        JSON.stringify(x.experience).replaceAll(
          `"action":"${id}"`,
          '"action":"probe"',
        ),
      ) as unknown;
    expect(named(a)).toEqual(named(b));
    expect(JSON.stringify(a.experience)).toContain(`"action":"${id}"`);
    expect(
      Object.keys(a.extensionState).filter((k) =>
        k.startsWith('open:practice'),
      ),
    ).toEqual([]);
    // A trial round repeating a known reading earns nothing either.
    let t = pressed(withRoots(learned()));
    t = ok(
      step(t, {
        kai: assess('trial', {
          target: second(t).id,
          methodRef: 'press',
          intensity: 0.05,
          evidenceRefs: [PRESS],
        }),
      }),
    );
    expect(
      t.events.filter(
        (e) =>
          e.actor === 'kai' &&
          [
            'satisfaction',
            'practice-confirmed',
            'information-confirmed',
          ].includes(e.type),
      ),
    ).toEqual([]);
    expect(only(t).data.experience).toBe('evidence only: no reward');
  });

  it('shows no excluded word in anything a person sees of it', () => {
    let w = pressed(withRoots(eatOne(learned(), BERRY, AT_BERRY)));
    const texts: unknown[] = [];
    const keep = (r: Round) => {
      const world = r.world;
      texts.push(
        world.events.filter((e) => e.actor === 'kai'),
        actor(world).memory.knowledge,
        longOrdinaryInput(world, 'kai').packet.execution,
      );
      return world;
    };
    const steps: [V7Point, V7Action][] = [
      [AT_ROOT, assess('inspect', { target: ROOT })],
      [AT_ROOT, assess('inspect', { target: ROOT, evidenceRefs: ['berry'] })],
      [AT_BERRY, assess('inspect', { target: BERRY, evidenceRefs: ['berry'] })],
      [AT_ROOT, assess('inspect', { target: ROOT, intendedConsumer: 'wren' })],
      [AT_ROOT, assess('inspect', { target: ROOT, intendedConsumer: 'lin' })],
      [START, assess('inspect', { target: ROOT })],
      [START, assess('trial', { target: ROOT, methodRef: 'heat' })],
      [
        START,
        assess('trial', {
          target: second(w).id,
          methodRef: 'press',
          intensity: 0.05,
          evidenceRefs: [PRESS],
        }),
      ],
      [START, assess('trial', { target: second(w).id, methodRef: 'wet' })],
    ];
    for (const [where, action] of steps)
      w = keep(step(place(w, where), { kai: action }));
    actor(w).vitals.health = 0.5;
    actor(w).vitals.satiety = 0;
    w = keep(
      step(place(w, AT_ROOT), { kai: assess('inspect', { target: ROOT }) }),
    );
    const input = longOrdinaryInput(w, 'kai');
    texts.push(
      input.packet.abilities,
      input.catalogue.interfaces.filter((x) => x.id === id),
    );
    const text = JSON.stringify(texts);
    expect(text).toContain(`${id}-inspected`);
    expect(text).toContain(`${id}-trialled`);
    expect(text).toContain(UNRESOLVED);
    expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
    expect(text).not.toMatch(MENTION);
  });
});
