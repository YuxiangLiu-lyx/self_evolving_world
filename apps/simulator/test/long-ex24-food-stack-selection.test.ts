import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
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
vi.setConfig({ testTimeout: 180_000 });

const id = 'eat-oldest-owned-food';
const EVENT = 'oldest-food-stack-eaten';
const BERRIES = 'commons-berry-2-0';
const BRANCHES = 'start-2-branches';
const WAIT: V7Action = { interface: 'wait', args: {} };
/** The brief's agent-visible exclusions beyond the culture scope's own list. */
const EXTRA_EXCLUDED = /stor(y|ies)|myth|legend|tradition|history/i;
/** Package ids the brief reserves for earlier work. */
const TAKEN = [
  'cultivate-plants',
  'branch-screen',
  'hand-weave-fiber-mat',
  'hand-break-food',
  'hand-twist-fiber-cord',
  'hand-tie-cord-knot',
  'hand-join-fiber-cords',
  'hand-bind-crossing',
  'hand-twist-sectioned-cord',
  'hand-lash-crossing',
  'hand-frap-crossing',
  'hand-twist-long-sectioned-cord',
  'plant-cultivation',
  'hearth-food-preparation',
  'mechanical-food-handling',
  'plant-establishment-trial',
  'unheated-food-preparation',
  'thermal-food-preparation',
  'food-air-exposure-trial',
  'thin-slice-food-drying-trial',
  'cutting-edge-assessment',
  'shell-compression-opening',
  'lever-mass-comparator',
  'apply-marking-material',
  'open-and-separate-sample',
  'air-dry-food-trial',
  'small-combustion-source',
  'beam-mass-comparator',
  'compare-material-samples',
  'targeted-food-constituent-test',
  'prepare-shelled-food',
  'draw-from-observation',
  'sleep-in-place',
  'rooted-plant-watering',
  'crack-and-separate-casing',
  'shape-and-use-wooden-digging-tool',
  'propagate-from-seed',
  'prepare-ventilated-food-storage',
  'construct-weather-shelter',
  'examine-material',
  'length-reference',
  'assess-food-evidence',
];
/** sha256 of JSON.stringify of the map from id@version to the sha256 of JSON.stringify of each
 * of the 123 packages registered before this change, in registration order (the scratch hash
 * file validation-results/scratch/ex24/hashes-before-6.json, taken before this change). */
const EXISTING_DIGEST =
  '834690c41ff47b4b08fc7022b3cc210914c57086192a5a056d92b91dfcefcfaf';
/** sha256 of JSON.stringify of the package whose eat this one calls, taken before this change. */
const REUSED: Record<string, string> = {
  'foundation-forest@1':
    '54094fb4230e6a50ffaeec27771a3d4345987b2e6f03161a5cf61f9f5c36de7b',
};
/** Sol's stand within reach of the berry bush commons-berry-2-0. */
const STAND = { x: 13.16, y: 18.2 };

const sha = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
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
const actor = (w: V7World, name = 'sol'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const stackOf = (w: V7World, item: string): V7Stack => {
  const s = w.stacks.find((s) => s.id === item);
  if (!s) throw new Error(`Missing stack ${item}.`);
  return s;
};
const last = (w: V7World, type = EVENT): V7Event => {
  const e = w.events.filter((e) => e.type === type).at(-1);
  if (!e) throw new Error(`Missing ${type}.`);
  return e;
};
const data = (w: V7World) => last(w).data as Record<string, unknown>;
const use = (resource: string, quantity = 1): V7Action => ({
  interface: id,
  args: { resource, quantity },
});
const eat = (target: string, quantity = 1): V7Action => ({
  interface: 'eat',
  args: { target, quantity },
});
/** Keep everyone fed and rested so the tests isolate the operation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 70;
    a.vitals.energy = 40;
  }
  return w;
}
function genesis() {
  return initialLongWorld('long-ex24', 'long-culture-v2', {
    seed: 20261203,
    development: 8,
    tokens: 1500000,
  });
}
function installed() {
  const g = genesis();
  const w = v7Clone(v7Install(g, continuousRegistry(g), `${id}@1`));
  actor(w).position = { ...STAND };
  return fed(w);
}
const ok = (r: ReturnType<typeof step>, who = 'sol') => {
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  return fed(r.world);
};
/** Sol's berry stacks, earliest harvest round first. */
const berries = (w: V7World) =>
  w.stacks
    .filter((s) => s.owner === 'sol' && s.resource === 'berry')
    .sort((a, b) => (a.harvestedAt ?? 0) - (b.harvestedAt ?? 0));
/** Events of this round's actions by Sol (environmental notices excluded). */
const solTypes = (w: V7World, via = id) =>
  w.events
    .filter((e) => e.actor === 'sol' && e.interface === via)
    .map((e) => e.type);
/** Sol's experience state; with log names the interface of each logged round, which is the
 * only part that differs from using eat itself, or from waiting when the action fails. */
const felt = (w: V7World, log = false) => {
  const e = actor(w).experience;
  if (!e) throw new Error('Missing experience state.');
  return {
    ...e,
    recent: e.recent.map(({ action, failed, ...rest }) =>
      log ? { action, failed, ...rest } : rest,
    ),
  };
};
/** The action fails and changes no vitals, stacks, objects, knowledge, discoveries or experience
 * beyond the logged attempt. */
function unchanged(w: V7World, action: V7Action, own = true) {
  const result = step(w, { sol: action }),
    idle = step(w).world,
    state = (x: V7World) => ({
      knowledge: actor(x).memory.knowledge ?? {},
      discoveries: actor(x).memory.discoveries ?? {},
      experience: felt(x),
    });
  expect(result.outcomes.sol?.success).toBe(false);
  expect(actor(result.world).vitals).toEqual(actor(idle).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  expect(v7Signature(state(result.world))).toBe(v7Signature(state(idle)));
  expect(
    result.world.events.filter((e) => [EVENT, 'ate'].includes(e.type)),
  ).toEqual([]);
  const reason = result.outcomes.sol?.reason ?? '';
  // This operation's own refusals say so; the kernel's mastery check has its own wording.
  if (own) expect(reason).toMatch(/Nothing was spent\.$/);
  return reason;
}

interface Fixture {
  /** Sol has studied the operation and gathered three berry stacks in three rounds. */
  ready: V7World;
  /** Sol's berry stacks by harvest round: one unit, one unit, two units. */
  stacks: [string, string, string];
}
let cache: Fixture | null = null;
function fixture(): Fixture {
  if (!cache) {
    let w = ok(
      step(installed(), { sol: { interface: 'learn', args: { ability: id } } }),
    );
    expect(actor(w).mastered).toContain(id);
    for (const quantity of [1, 1, 2])
      w = ok(
        step(w, {
          sol: { interface: 'gather', args: { target: BERRIES, quantity } },
        }),
      );
    const mine = berries(w);
    expect(mine.map((s) => s.quantity)).toEqual([1, 1, 2]);
    expect(new Set(mine.map((s) => s.harvestedAt)).size).toBe(3);
    const [a, b, c] = mine.map((s) => s.id);
    if (!a || !b || !c) throw new Error('Missing berry stacks.');
    cache = { ready: w, stacks: [a, b, c] };
  }
  return { ...cache, ready: v7Clone(cache.ready) };
}

describe('eat from the oldest owned food stack in ex24', () => {
  it('is scoped to ex24, registered last, learned in one round at 0.2 energy, uniquely named, within the size limit, and leaves every existing package byte-identical', () => {
    const other = initialLongWorld('long-ex23', 'long-culture-v2-oldgoal');
    expect(continuousRegistry(other).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(other, continuousRegistry(), `${id}@1`)).toThrow(
      /not approved/,
    );
    const g = genesis();
    const pkg = V7_PACKAGES.find((p) => p.id === id);
    const ability = pkg?.abilities[0];
    if (!pkg || !ability) throw new Error('Missing package.');
    expect(V7_PACKAGES.at(-1)).toBe(pkg);
    expect(
      continuousRegistry(g)
        .packages.filter((p) => !p.id.startsWith('foundation-'))
        .map((p) => p.id),
    ).toEqual([
      'prepare-ventilated-food-storage',
      'construct-weather-shelter',
      'examine-material',
      'length-reference',
      'assess-food-evidence',
      id,
    ]);
    expect(pkg).toMatchObject({
      scope: 'long-ex24',
      version: 1,
      dependencies: ['foundation-forest@1'],
      visualComponents: [],
      satisfaction: [],
      resources: [],
      processes: {},
      events: [EVENT],
    });
    expect(pkg.afterEnvironment).toBeUndefined();
    expect(pkg.beforeAction).toBeUndefined();
    expect(pkg.onDeath).toBeUndefined();
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 1,
      learningEnergy: 0.2,
      revision: `${id}@1`,
      handler: `long.${id}`,
      authored: false,
      practiceEvidence: EVENT,
      references: {},
      dependencies: { abilities: ['eat'], resources: [], knowledge: [] },
      execution: { duration: 1, interruption: 'cancel' },
    });
    expect(Object.keys(ability.parameters.properties ?? {})).toEqual([
      'resource',
      'quantity',
    ]);
    expect(ability.parameters.required).toEqual(['resource', 'quantity']);
    // The quantity accepts exactly what eat accepts.
    const ordinary = g.abilities.find((a) => a.id === 'eat');
    expect(ordinary).toMatchObject({
      revision: 'foundation-forest@1',
      handler: 'forest.eat',
    });
    expect(ability.parameters.properties?.quantity).toEqual(
      ordinary?.parameters.properties?.quantity,
    );
    // New package, ability, equivalence, handler and event names.
    expect(TAKEN).not.toContain(id);
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(ability.id);
        expect(a.equivalence).not.toBe(ability.equivalence);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? [])
        expect(e).not.toMatch(/^oldest-food-stack-/);
    }
    const limit = g.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify(pkg);
    expect(visible).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    // Every package registered before this change, foundation-forest@1 included, is byte-identical.
    const existing = V7_PACKAGES.slice(0, V7_PACKAGES.indexOf(pkg));
    expect(existing).toHaveLength(123);
    const map = Object.fromEntries(
      existing.map((p) => [`${p.id}@${String(p.version)}`, sha(p)]),
    );
    expect(sha(map)).toBe(EXISTING_DIGEST);
    for (const [key, hash] of Object.entries(REUSED))
      expect(map[key]).toBe(hash);
    // Unstudied use is refused at no cost; one study round at 0.2 energy masters it.
    const fresh = installed();
    expect(unchanged(fresh, use('resource:berry'), false)).toMatch(
      /not mastered/,
    );
    const r = step(fresh, {
        sol: { interface: 'learn', args: { ability: id } },
      }),
      idle = step(fresh).world;
    expect(r.outcomes.sol?.success).toBe(true);
    expect(actor(r.world).mastered).toContain(id);
    expect(actor(r.world).learning).toBeNull();
    expect(
      Math.round(
        (actor(idle).vitals.energy - actor(r.world).vitals.energy) * 1e8,
      ) / 1e8,
    ).toBe(0.2);
    // Study grants no record, finding or practice milestone.
    expect(actor(r.world).memory.knowledge ?? {}).toEqual(
      actor(idle).memory.knowledge ?? {},
    );
    expect(r.world.events.map((e) => e.type)).not.toContain(
      'practice-confirmed',
    );
  });

  it('eats from the earliest-harvested owned stack, then the next, choosing again on each use; ties go to the lower exact item id in code-unit order, stacks without a harvest round and reserved stacks come last or not at all', () => {
    const {
      ready,
      stacks: [a, b, c],
    } = fixture();
    const first = ok(step(ready, { sol: use('resource:berry') }));
    expect(data(first)).toMatchObject({ item: a, selected: [a] });
    expect(first.stacks.some((s) => s.id === a)).toBe(false);
    expect(stackOf(first, b).quantity).toBe(1);
    expect(stackOf(first, c).quantity).toBe(2);
    const second = ok(step(first, { sol: use('resource:berry') }));
    expect(data(second)).toMatchObject({ item: b, selected: [b] });
    const third = ok(step(second, { sol: use('resource:berry') }));
    expect(data(third)).toMatchObject({ item: c, consumedQuantity: 1 });
    expect(stackOf(third, c).quantity).toBe(1);
    // A tie in harvest round goes to the lower id by code units, not by the number in the id:
    // "item-10-..." sorts before "item-9-..." because "1" precedes "9".
    const tied = v7Clone(ready);
    const round = stackOf(tied, a).harvestedAt;
    if (round === undefined) throw new Error('Missing harvest round.');
    stackOf(tied, a).id = 'item-9-sol-tie';
    stackOf(tied, b).id = 'item-10-sol-tie';
    stackOf(tied, 'item-10-sol-tie').harvestedAt = round;
    const tie = ok(step(tied, { sol: use('resource:berry') }));
    expect(data(tie)).toMatchObject({
      item: 'item-10-sol-tie',
      harvestedAt: round,
    });
    expect(stackOf(tie, 'item-9-sol-tie').quantity).toBe(1);
    // A stack with no harvest round sorts after every dated stack.
    const undated = v7Clone(ready);
    delete stackOf(undated, a).harvestedAt;
    const later = ok(step(undated, { sol: use('resource:berry') }));
    expect(data(later)).toMatchObject({ item: b });
    // Material reserved by ongoing work is never chosen.
    const reserved = v7Clone(ready);
    stackOf(reserved, a).reservedFor = 'fixture:ongoing-work';
    const skipped = ok(step(reserved, { sol: use('resource:berry') }));
    expect(data(skipped)).toMatchObject({ item: b });
    expect(stackOf(skipped, a).quantity).toBe(1);
  });

  it('is ordinary eat of the chosen stack: the same vitals, stack, discovery, meal and eat event as eating that item directly, at eat cost, plus one event naming only the chosen item, and no reward', () => {
    const {
      ready,
      stacks: [a, b, c],
    } = fixture();
    const idle = step(ready).world;
    for (const [quantity, item] of [
      [1, a],
      [2, c],
    ] as const) {
      const via = step(ready, { sol: use('resource:berry', quantity) }),
        direct = step(ready, { sol: eat(item, quantity) });
      expect(via.outcomes.sol?.success, via.outcomes.sol?.reason).toBe(true);
      expect(direct.outcomes.sol?.success).toBe(true);
      const v = via.world,
        d = direct.world;
      expect(actor(v).vitals).toEqual(actor(d).vitals);
      expect(v7Signature(v.stacks)).toBe(v7Signature(d.stacks));
      expect(v7Signature(v.objects)).toBe(v7Signature(d.objects));
      expect(actor(v).memory.discoveries).toEqual(actor(d).memory.discoveries);
      expect(felt(v)).toEqual(felt(d));
      expect(felt(v, true).recent.at(-1)).toMatchObject({
        action: id,
        failed: null,
      });
      expect(felt(d, true).recent.at(-1)).toMatchObject({
        action: 'eat',
        failed: null,
      });
      expect(actor(v).memory.knowledge ?? {}).toEqual(
        actor(d).memory.knowledge ?? {},
      );
      const meal = (w: V7World) => {
        const e = last(w, 'ate');
        return [e.description, e.data, e.target, e.actor, e.success];
      };
      expect(meal(v)).toEqual(meal(d));
      expect(solTypes(v)).toEqual(['ate', EVENT]);
      expect(solTypes(d, 'eat')).toEqual(['ate']);
      // The cost is eat's own: the meal energy and the units eaten, nothing more.
      expect(actor(v).vitals.energy).toBeLessThan(actor(idle).vitals.energy);
      expect(actor(v).vitals.satiety).toBeCloseTo(
        actor(idle).vitals.satiety + 8 * quantity,
        6,
      );
      const event = last(v);
      expect(event).toMatchObject({
        actor: 'sol',
        interface: id,
        target: item,
      });
      expect(event.data).toEqual({
        operation: id,
        actor: 'sol',
        resource: 'resource:berry',
        requestedQuantity: quantity,
        item,
        selected: [item],
        harvestedAt: stackOf(ready, item).harvestedAt,
        rule: 'earliest harvest round first, stacks without one last, then exact item id in code-unit order',
        consumedQuantity: quantity,
        outcome: 'eaten',
        delegated: {
          ability: 'eat',
          revision: 'foundation-forest@1',
          handler: 'forest.eat',
          event: last(v, 'ate').id,
        },
        view: {
          operation: id,
          phase: 'completed',
          actor: 'sol',
          resource: 'resource:berry',
          item,
          quantity,
          consumedQuantity: quantity,
          progress: 1,
          outcome: 'eaten',
        },
      });
      // The other candidates stay private; the outcome keeps eat's own report.
      const shown = JSON.stringify(v.events.filter((e) => e.actor === 'sol'));
      for (const other of [a, b, c].filter((x) => x !== item))
        expect(shown).not.toContain(other);
      expect(via.outcomes.sol?.reason).toContain(last(v, 'ate').description);
      for (const key of ['progress', 'elapsed', 'remaining'])
        expect(event.data[key]).toBeUndefined();
    }
    // Repeated use earns no practice milestone, satisfaction or record.
    let w = ready;
    for (let i = 0; i < 3; i++) {
      const r = step(w, { sol: use('resource:berry') });
      expect(r.outcomes.sol?.success, r.outcomes.sol?.reason).toBe(true);
      expect(r.world.events.map((e) => e.type)).not.toContain(
        'practice-confirmed',
      );
      expect(
        r.world.events.filter(
          (e) => e.type === 'satisfaction' && e.actor === 'sol',
        ),
      ).toEqual([]);
      expect(last(r.world).data.qualified).toBeUndefined();
      w = fed(r.world);
    }
    expect(
      Object.keys(actor(w).extensionState).filter((k) =>
        k.startsWith('open:practice:'),
      ),
    ).toEqual([]);
    expect(actor(w).memory.knowledge ?? {}).toEqual(
      actor(ready).memory.knowledge ?? {},
    );
  });

  it('takes whole units from one stack only: two units come from the single stack holding both, never from two smaller stacks, and a quantity no single stack holds is refused with no remainder eaten', () => {
    const {
      ready,
      stacks: [a, b, c],
    } = fixture();
    const two = ok(step(ready, { sol: use('resource:berry', 2) }));
    expect(data(two)).toMatchObject({
      item: c,
      selected: [c],
      requestedQuantity: 2,
      consumedQuantity: 2,
    });
    expect(two.stacks.some((s) => s.id === c)).toBe(false);
    expect(stackOf(two, a).quantity).toBe(1);
    expect(stackOf(two, b).quantity).toBe(1);
    // Four units are owned, but no single stack holds three: nothing is eaten or combined.
    expect(berries(ready).reduce((n, s) => n + s.quantity, 0)).toBe(4);
    expect(unchanged(ready, use('resource:berry', 3))).toMatch(
      /^no-single-stack-with-requested-quantity: none of your usable stacks of resource:berry holds 3 alone\. Stacks are not combined/,
    );
    // After the two-unit stack is gone, two units are no longer in any single stack.
    expect(unchanged(two, use('resource:berry', 2))).toMatch(
      /^no-single-stack-with-requested-quantity/,
    );
  });

  it('refuses before any cost: malformed resources, no usable owned stock (none owned, all reserved, or only someone else holds it), and whatever ordinary eat itself refuses', () => {
    const { ready } = fixture();
    for (const resource of [
      'berry',
      'item:berry',
      berries(ready)[0]?.id ?? '',
      'resource:',
      'resource:berry 2',
    ])
      expect(unchanged(ready, use(resource))).toMatch(/^malformed-resource:/);
    // The shared spelling policy accepts surrounding and prefix whitespace, never another id.
    const spaced = ok(step(ready, { sol: use(' resource: berry ') }));
    expect(data(spaced)).toMatchObject({ resource: 'resource:berry' });
    const none =
      /^no-matching-owned-stock: you hold no stack of resource:root that ordinary eat could use/;
    expect(unchanged(ready, use('resource:root'))).toMatch(none);
    expect(unchanged(ready, use('resource:no-such-food'))).toMatch(
      /^no-matching-owned-stock/,
    );
    const reserved = v7Clone(ready);
    for (const s of berries(reserved)) s.reservedFor = 'fixture:ongoing-work';
    expect(unchanged(reserved, use('resource:berry'))).toMatch(
      /^no-matching-owned-stock: .*stacks reserved by ongoing work are not used/,
    );
    // Moss holds the berries: Sol's refusal names no stock of anyone else.
    const given = v7Clone(ready);
    const held = berries(given).map((s) => s.id);
    for (const s of berries(given)) s.owner = 'moss';
    const reason = unchanged(given, use('resource:berry'));
    expect(reason).toMatch(/^no-matching-owned-stock/);
    for (const item of held) expect(reason).not.toContain(item);
    expect(reason).not.toContain('moss');
    // Eat's own checks stay in force: an owned branch is chosen, and eat refuses it, at no cost.
    const source = ready.objects.find((o) => o.id === BRANCHES);
    if (!source) throw new Error('Missing branch source.');
    const near = v7Clone(ready),
      clear =
        (source.spatial.shape.kind === 'circle'
          ? source.spatial.shape.radius
          : 0) +
        actor(near).radius +
        0.1;
    actor(near).position = { x: source.spatial.x, y: source.spatial.y + clear };
    const branch = ok(
      step(near, {
        sol: { interface: 'gather', args: { target: BRANCHES, quantity: 1 } },
      }),
    );
    expect(unchanged(branch, use('resource:branch'))).toMatch(
      /^Ordinary eat refused item-[^:]+: Requested owned food quantity is unavailable or inedible\./,
    );
  });
});
