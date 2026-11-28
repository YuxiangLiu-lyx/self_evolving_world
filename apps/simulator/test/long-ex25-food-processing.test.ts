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
  V7Data,
  V7Event,
  V7Package,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { longOrdinaryInput } from '../src/long-context.js';
import { IMPORT_EXCLUDED_WORDS } from '../src/long-import.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this limit.
vi.setConfig({ testTimeout: 180_000 });

const id = 'mechanical-food-separation';
const REVISION = `${id}@1`;
const OPEN = `${id}:work:open`;
const RECORDS = `${id}:records`;
const PREFIX = 'food-separation-';
const KEY = 'foodSeparation';
const KERNEL = 'hazelnut-freed-kernel';
const SHELL = 'hazelnut-shell-fragments';
const WAIT: V7Action = { interface: 'wait', args: {} };
const LEARN: V7Action = { interface: 'learn', args: { ability: id } };
/** The brief's agent-visible exclusions beyond the import list itself. */
const EXTRA_EXCLUDED =
  /cultur|belie(f|v)|religio|ritual|social|stor(y|ies)|myth|legend|tradition|history/i;
/** sha256 of JSON.stringify of the key-sorted map from id@version to the sha256 of
 * JSON.stringify of each of the 133 packages registered before this change (the scratch hash
 * file validation-results/scratch/ex25/hashes-before-4.json, taken before this change). */
const EXISTING_DIGEST =
  '63436752b7709508f26f9d010ba25d88ddcbd2015ee679d8e76e54426920f5a8';
/** The same digest of every package whose module this package reuses, taken before this
 * change, and of the inherited ex18 dry brushing whose visible-condition look it reuses. */
const REUSED = {
  'crack-and-separate-casing@1':
    'e184166595eb2c393ed25af28b3c2e434868c1d560a85c74b571107a6d7273ce',
  'open-and-separate-sample@1':
    '0447c53a4506fd57bb73c6248850cc9a67519944b1bf03e7cbf1e82ddb1d87ed',
  'prepare-shelled-food@1':
    'c01d24e4b18e8a6611e237b598b790bdcbe023f96e657159ed22ceeab66861b0',
  'thin-slice-food-drying-trial@1':
    '70acae9a94e8cfc871452a41a947050f192504f5fc6e4aeeb8a2f0b3f6933299',
  'cutting-edge-assessment@1':
    '3ca9a1f0d691fad71d4f6aaae3877ae70473a3af96f6785ed52433727ba01a49',
  'shell-compression-opening@1':
    '5ad34a508811e4cf8adb22d1cbd00452570653606136d7f54536bc3dfeb8d1f8',
  'mechanical-food-handling@1':
    'daee77dfb03cf980197432879dbbd6f1dd9d27922c5364a3101e6143c699a31e',
  'unheated-food-preparation@1':
    'b6e6735b336b500e95346abe49e7f5e8107ea26695cabbb02abcd4dc1ed7259f',
};
/** Lin's sources: the hazelnut plant, the meadow roots, the nearest stone outcrop (also the
 * support) and an oak; standing points within reach of each, outside solid footprints. */
const NUTS = 'start-1-nuts';
const ROOTS = 'start-1-roots';
const ROCK = 'start-1-stone';
const OAK = 'forest-oak-0';
const AT_NUTS = { x: 15.4, y: 14.9 };
const AT_ROOTS = { x: 20.1, y: 14.45 };
const AT_ROCK = { x: 15, y: 11.2 };
const AT_OAK = { x: 20.2, y: 20 };
/** A point well out of reach of the rock. */
const AWAY = { x: 14.2, y: 12.4 };

type Scenario = 'long-culture-v2' | 'long-culture-v2-incentives';
type Data = Record<string, unknown>;
const sha = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const separation = (): V7Package => {
  const p = V7_PACKAGES.find((p) => p.id === id);
  if (!p) throw new Error('Missing package.');
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
const actor = (w: V7World, who = 'lin'): V7Actor => {
  const a = w.actors.find((a) => a.id === who);
  if (!a) throw new Error(`Missing ${who}.`);
  return a;
};
const ok = (r: ReturnType<typeof step>, who = 'lin') => {
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  return r.world;
};
const op = (args: V7Data): V7Action => ({ interface: id, args });
const energy = (w: V7World, who = 'lin') => actor(w, who).vitals.energy;
const ours = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === `${PREFIX}${type}`);
const dataOf = (w: V7World, type: string): Data => {
  const e = ours(w, type).at(-1);
  if (!e) throw new Error(`Missing ${type} event.`);
  return e.data;
};
const viewOf = (w: V7World, type: string) => dataOf(w, type).view as Data;
const open = (w: V7World) => actor(w).extensionState[OPEN] as Data | undefined;
const last = (w: V7World) =>
  (actor(w).extensionState[RECORDS] as Data[] | undefined)?.at(-1);
const stack = (w: V7World, item: string): V7Stack => {
  const s = w.stacks.find((x) => x.id === item);
  if (!s) throw new Error(`Missing ${item}.`);
  return s;
};
const resource = (w: V7World, name: string) => {
  const r = w.resources.find((x) => x.id === name);
  if (!r) throw new Error(`Missing resource ${name}.`);
  return r;
};
const own = (w: V7World, res: string, who = 'lin') =>
  w.stacks.filter((s) => s.owner === who && s.resource === res);
const ownId = (w: V7World, res: string, who = 'lin') => {
  const s = own(w, res, who).find((x) => !x.reservedFor);
  if (!s) throw new Error(`${who} holds no ${res}.`);
  return s.id;
};
/** Mass (kg), nutrition and toxicity of every stack from one source. */
const totals = (w: V7World, origin: string) =>
  w.stacks
    .filter((s) => s.origin === origin)
    .reduce(
      (t, s) => {
        const r = resource(w, s.resource);
        return {
          quantity: t.quantity + s.quantity,
          mass: t.mass + s.quantity * r.mass,
          nutrition: t.nutrition + s.quantity * r.nutrition,
          toxicity: t.toxicity + s.quantity * r.toxicity,
        };
      },
      { quantity: 0, mass: 0, nutrition: 0, toxicity: 0 },
    );
const installed = (scenario: Scenario = 'long-culture-v2') => {
  const g = initialLongWorld('long-ex25', scenario);
  return v7Clone(v7Install(g, continuousRegistry(g), REVISION));
};
function gather(
  w: V7World,
  at: { x: number; y: number },
  target: string,
  n = 1,
) {
  actor(w).position = { ...at };
  return ok(
    step(w, { lin: { interface: 'gather', args: { target, quantity: n } } }),
  );
}
/** Lin studies in rounds 1-3, gathers a stone, one hazelnut unit (pressed once with probe, as
 * in ex25, leaving 0.9) and two roots, and stands at the rock outcrop. */
function prepared(scenario: Scenario = 'long-culture-v2', oak = false) {
  let w = ok(step(installed(scenario), { lin: LEARN }));
  w = step(step(w).world).world;
  expect(actor(w).mastered).toContain(id);
  w = gather(w, AT_ROCK, ROCK);
  if (oak) w = gather(w, AT_OAK, OAK);
  w = gather(w, AT_NUTS, NUTS);
  const nut = ownId(w, 'hazelnut');
  w = ok(
    step(w, {
      lin: {
        interface: 'probe',
        args: { target: nut, mode: 'press', intensity: 0.3 },
      },
    }),
  );
  expect(stack(w, nut).quantity).toBe(0.9);
  w = gather(w, AT_ROOTS, ROOTS, 2);
  actor(w).position = { ...AT_ROCK };
  return {
    world: w,
    nut,
    stone: ownId(w, 'stone'),
    root: ownId(w, 'root'),
    oak: oak ? ownId(w, 'oak') : '',
  };
}
let cached: ReturnType<typeof prepared> | null = null;
const base = () => {
  cached ??= prepared();
  return { ...cached, world: v7Clone(cached.world) };
};
const trial = (args: V7Data): V7Action => op({ mode: 'trial', ...args });
const openNut = (f: { nut: string; stone: string }, extra: V7Data = {}) =>
  trial({
    operation: 'open',
    inputStackId: f.nut,
    implementId: f.stone,
    supportId: ROCK,
    ...extra,
  });
const cutRoot = (f: { root: string; stone: string }, item = f.root) =>
  trial({
    operation: 'cut',
    inputStackId: item,
    quantity: 1,
    implementId: f.stone,
    supportId: ROCK,
  });
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action) {
  const r = ok(step(w, { lin: action })),
    idle = step(w).world;
  return {
    world: r,
    energy: Math.round((energy(idle) - energy(r)) * 1e8) / 1e8,
  };
}
/** The operation refuses before any cost: vitals, items and records equal a waiting round. */
function unchanged(w: V7World, action: V7Action, pattern: RegExp) {
  const r = step(w, { lin: action }),
    idle = step(w).world;
  expect(r.outcomes.lin?.success).toBe(false);
  expect(r.outcomes.lin?.reason).toMatch(pattern);
  expect(actor(r.world).vitals).toEqual(actor(idle).vitals);
  expect(v7Signature(r.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(actor(r.world).extensionState[OPEN]).toEqual(
    actor(idle).extensionState[OPEN],
  );
  expect(actor(r.world).extensionState[RECORDS]).toEqual(
    actor(idle).extensionState[RECORDS],
  );
  return r.outcomes.lin?.reason ?? '';
}
/** Both rounds of one bout; the worlds after each and the energy of each beyond waiting. */
function bout(w: V7World, action: V7Action) {
  const setup = cost(w, action);
  const working = cost(setup.world, action);
  return {
    setup: setup.world,
    world: working.world,
    spent: [setup.energy, working.energy],
    events: [...setup.world.events, ...working.world.events],
  };
}

describe('mechanical food separation in ex25', () => {
  it('is registered fourth for long-ex25 only, within the size limit, with new names, published limits, no excluded word, and every earlier package byte-identical', () => {
    const pkg = separation();
    const ability = pkg.abilities[0];
    if (!ability) throw new Error('Missing ability.');
    // The fourth ex25 package; later ex25 packages follow it.
    expect(
      V7_PACKAGES.filter((p) => p.scope === 'long-ex25')
        .slice(0, 4)
        .map((p) => p.id),
    ).toEqual([
      'vocal-music',
      'position-loose-material',
      'friction-heating-trial',
      id,
    ]);
    expect(pkg).toMatchObject({
      id,
      version: 1,
      scope: 'long-ex25',
      dependencies: ['foundation-open@1'],
      visualComponents: [],
      satisfaction: [],
      processes: {},
      events: [
        'food-separation-inspected',
        'food-separation-setup',
        'food-separation-contact',
        'food-separation-resisted',
        'food-separation-damaged',
        'food-separation-opened',
        'food-separation-cut',
        'food-separation-wear',
        'food-separation-completed',
        'food-separation-paused',
        'food-separation-resumed',
        'food-separation-cancelled',
        'food-separation-invalidated',
        'food-separation-ended',
        'food-separation-checked',
      ],
    });
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 3,
      learningEnergy: 0.2,
      revision: REVISION,
      handler: `long.${id}`,
      authored: false,
      prerequisites: [],
      references: {
        inputStackId: 'optional-exact-visible',
        implementId: 'optional-exact-visible',
        supportId: 'optional-exact-visible',
      },
      practiceEvidence: 'food-separation-completed',
      execution: { duration: null, interruption: 'cancel' },
    });
    expect(Object.keys(ability.parameters.properties ?? {})).toEqual([
      'mode',
      'operation',
      'inputStackId',
      'quantity',
      'implementId',
      'supportId',
    ]);
    expect(ability.parameters.required).toEqual(['mode']);
    expect(ability.parameters.properties?.mode?.enum).toEqual([
      'inspect',
      'trial',
      'inspect-progress',
      'resume',
      'cancel',
    ]);
    expect(ability.parameters.properties?.operation?.enum).toEqual([
      'open',
      'cut',
      'peel',
    ]);
    expect(ability.parameters.properties?.quantity).toMatchObject({
      minimum: 0.1,
      maximum: 1,
    });
    // The force and work bounds and the wear and breakage costs are published in the contract.
    for (const value of [
      'bounded hand force of hand-break-food@1',
      '(hardness / 10) x (1 - flexibility)',
      '(load - strength) / strength',
      'index 8+ and at least the food, radius 0.0002 or less',
      'up to 10 portions',
      '0.0001 kg per contact (2 at most per block or stroke); nothing breaks',
      'peel is refused',
    ])
      expect(ability.effects).toContain(value);
    for (const value of [
      '3 rounds, 0.2 energy each',
      'setup (0.2)',
      'working round (0.5): 0.7 energy a bout',
      'quantity 0.1-1 in tenths',
      'cut: quantity 1',
    ])
      expect(ability.costs).toContain(value);
    // New package, ability, equivalence, handler, event and resource names.
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(id);
        expect(a.equivalence).not.toBe(ability.equivalence);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? []) expect(e).not.toMatch(/^food-separation/);
      for (const r of p.resources) expect([KERNEL, SHELL]).not.toContain(r.id);
    }
    const g = installed();
    const limit = g.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg.abilities,
      events: pkg.events,
      description: pkg.description,
      reuse: pkg.reuse,
      resources: pkg.resources.map((r) => r.name),
    });
    expect(visible).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    // Every package registered before this one, by id@version, is byte-identical, including
    // every package whose module is reused.
    const existing = V7_PACKAGES.slice(0, V7_PACKAGES.indexOf(pkg));
    const map = Object.fromEntries(
      existing
        .map((p) => [`${p.id}@${String(p.version)}`, sha(p)] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    expect(Object.keys(map)).toHaveLength(133);
    expect(sha(map)).toBe(EXISTING_DIGEST);
    for (const [key, digest] of Object.entries(REUSED))
      expect(map[key]).toBe(digest);
    // The parts are ex23's derivation from the ex20 hazelnut composition under new ids: each
    // part's unit is that part of one whole hazelnut unit, all food value in the kernel.
    const nut = resource(g, 'hazelnut');
    expect(resource(g, KERNEL)).toMatchObject({
      name: 'Freed hazelnut kernels',
      mass: 0.08,
      nutrition: nut.nutrition,
      toxicity: nut.toxicity,
      food: {
        ingredients: [{ resource: 'hazelnut', share: 1 }],
        method: 'unprocessed',
      },
    });
    expect(resource(g, KERNEL).properties?.decay).toBe(nut.properties?.decay);
    expect(resource(g, SHELL)).toMatchObject({
      name: 'Broken hazelnut shell pieces',
      mass: 0.12,
      nutrition: 0,
      toxicity: 0,
    });
    expect(resource(g, SHELL).food).toBeUndefined();
    expect(resource(g, SHELL).properties?.decay).toBe(0);
    // Only the current scope can install it, and installing changes no person, object or item.
    const other = initialLongWorld('long-ex23', 'long-culture-v2');
    expect(continuousRegistry(other).packages.map((p) => p.id)).not.toContain(
      id,
    );
    expect(() => v7Install(other, continuousRegistry(), REVISION)).toThrow(
      /not approved/,
    );
    const before = initialLongWorld('long-ex25', 'long-culture-v2');
    const after = v7Install(before, continuousRegistry(before), REVISION);
    expect(v7Signature(after.actors)).toBe(v7Signature(before.actors));
    expect(v7Signature(after.objects)).toBe(v7Signature(before.objects));
    expect(v7Signature(after.stacks)).toBe(v7Signature(before.stacks));
    expect(after.processes).toEqual(before.processes);
  });

  it('is learned in three study rounds at 0.2 energy each and cannot be used before', () => {
    const start = installed();
    const refusedEarly = step(start, {
      lin: op({ mode: 'inspect', inputStackId: 'x' }),
    });
    expect(refusedEarly.outcomes.lin?.success).toBe(false);
    expect(refusedEarly.outcomes.lin?.reason).toMatch(/not mastered/);
    let w = ok(step(start, { lin: LEARN })),
      idle = step(start).world;
    for (let round = 2; round <= 3; round++) {
      expect(actor(w).mastered).not.toContain(id);
      w = step(w).world;
      idle = step(idle).world;
    }
    expect(actor(w).mastered).toContain(id);
    expect(actor(w).learning).toBeNull();
    expect(energy(idle) - energy(w)).toBeCloseTo(0.6, 9);
  });

  it('inspects for 0.2 energy without using or reserving food, reporting structure, means, limits and unmet needs without hidden values', () => {
    const f = base();
    const w = f.world;
    // The hazelnut: a represented shell; open is ready bare-handed, cut and peel are not available.
    const nut = cost(w, op({ mode: 'inspect', inputStackId: f.nut }));
    expect(nut.energy).toBeCloseTo(0.2, 9);
    expect(v7Signature(nut.world.stacks)).toBe(
      v7Signature(step(w).world.stacks),
    );
    expect(open(nut.world)).toBeUndefined();
    const found = dataOf(nut.world, 'inspected');
    expect(found).toMatchObject({
      status: 'inspected',
      paidEnergy: 0.2,
      paidRounds: 1,
      findings: {
        item: {
          item: f.nut,
          resource: 'hazelnut',
          quantity: 0.9,
          origin: NUTS,
          visibleSpoilage: 'none seen',
          treatment: [],
          safety: 'unknown',
        },
        structure: {
          shell: expect.stringMatching(/represented/) as unknown,
          separableLayer: 'not represented',
          crack: 0,
          interior: 'not visible',
        },
        unknown: ['edibility', 'nutrition', 'toxins', 'safety'],
      },
    });
    const options = (found.findings as Data).options as Data[];
    expect(options.map((o) => [o.operation, o.supported, o.ready])).toEqual([
      ['open', true, true],
      ['cut', false, false],
      ['peel', false, false],
    ]);
    expect(options[0]).toMatchObject({
      quantity: 0.9,
      means: { kind: 'hand', implement: null },
      bout: { rounds: 2, energy: 0.7 },
    });
    expect(String((options[1]?.unmet as string[])[0])).toMatch(
      /hard shell: open it first/,
    );
    expect(String((options[2]?.unmet as string[])[0])).toMatch(
      /No separable outer layer/,
    );
    expect((found.findings as Data).limits).toMatchObject({
      breakage: expect.stringMatching(/not represented/) as unknown,
    });
    expect(viewOf(nut.world, 'inspected')).toMatchObject({
      phase: 'inspection',
      contact: null,
      products: null,
      badge: null,
    });
    // No load, strength or other hidden material value is disclosed.
    const text = JSON.stringify(nut.world.events);
    expect(text).not.toMatch(/"load"|"strength"|0\.2924/);
    // With the stone and the rock, open is ready with the implement; the stone's state is shown.
    const tooled = ok(
      step(w, {
        lin: op({
          mode: 'inspect',
          inputStackId: f.nut,
          operation: 'open',
          implementId: f.stone,
          supportId: ROCK,
        }),
      }),
    );
    expect(
      ((dataOf(tooled, 'inspected').findings as Data).options as Data[])[0],
    ).toMatchObject({
      ready: true,
      means: {
        kind: 'implement',
        implement: f.stone,
        implementMaterial: 'stone',
        support: ROCK,
        supportKind: 'object',
        supportMaterial: 'stone',
      },
      implement: { item: f.stone, resource: 'stone', contacts: 0, sound: true },
    });
    // The root: no shell; cut needs an edge, then is ready with the stone on the rock.
    const bare = ok(
      step(w, { lin: op({ mode: 'inspect', inputStackId: f.root }) }),
    );
    const rootOptions = (dataOf(bare, 'inspected').findings as Data)
      .options as Data[];
    expect(dataOf(bare, 'inspected').status).toBe('infeasible');
    expect(rootOptions.map((o) => [o.operation, o.supported, o.ready])).toEqual(
      [
        ['open', false, false],
        ['cut', true, false],
        ['peel', false, false],
      ],
    );
    expect(rootOptions[1]?.unmet).toEqual([
      'Cutting needs implementId: your own carried stone or flint unit with a usable edge; hands and food do not cut.',
    ]);
    const edged = ok(
      step(w, {
        lin: op({
          mode: 'inspect',
          inputStackId: f.root,
          operation: 'cut',
          implementId: f.stone,
          supportId: ROCK,
        }),
      }),
    );
    expect(
      ((dataOf(edged, 'inspected').findings as Data).options as Data[])[0],
    ).toMatchObject({ operation: 'cut', ready: true, quantity: 1 });
    expect(last(edged)).toMatchObject({ status: 'inspected', mode: 'inspect' });
  });

  it('a bare-hand trial on the 0.9 hazelnut costs 0.2 and 0.5 energy and fails honestly: the shell holds and nothing changes', () => {
    const f = base();
    const before = v7Clone(stack(f.world, f.nut));
    const hand = trial({ operation: 'open', inputStackId: f.nut });
    const b = bout(f.world, hand);
    expect(b.spent).toEqual([0.2, 0.5]);
    // Setup: the whole 0.9 item is reserved in place, still carried; no contact is shown yet.
    expect(open(b.setup)).toMatchObject({
      status: 'ready',
      stage: 'setup',
      portion: f.nut,
      quantity: 0.9,
      means: { kind: 'hand' },
      paidEnergy: 0.2,
    });
    expect(stack(b.setup, f.nut)).toMatchObject({
      owner: 'lin',
      reservedFor: open(b.setup)?.id,
    });
    expect(viewOf(b.setup, 'setup')).toMatchObject({
      phase: 'setup',
      paidPhase: 'setup',
      contact: null,
      visible: null,
      products: null,
    });
    expect(dataOf(b.setup, 'setup').quote).toMatchObject({
      blocks: 9,
      rounds: 2,
      energy: 0.7,
      wearBound: null,
      breakage: 'not represented',
    });
    // Working round: one squeeze per block; the shell resists; the item returns as it was.
    const w = b.world;
    expect(open(w)).toBeUndefined();
    expect(last(w)).toMatchObject({
      status: 'completed',
      outcome: 'resisted',
      paidEnergy: 0.7,
      paidRounds: 2,
      outputs: [f.nut],
    });
    expect(viewOf(w, 'contact')).toMatchObject({
      contact: 'squeezing each 0.1 block between both hands',
      products: null,
    });
    expect(viewOf(w, 'resisted')).toMatchObject({
      visible: {
        shell: 'no visible change',
        crack: 0,
        interior: 'not visible',
      },
      products: null,
      badge: null,
    });
    expect(ours(w, 'opened')).toEqual([]);
    expect(ours(w, 'damaged')).toEqual([]);
    expect(ours(w, 'wear')).toEqual([]);
    const after = stack(w, f.nut);
    expect(after.reservedFor).toBeUndefined();
    expect(after.processing).toBeUndefined();
    expect({ ...after, decay: 0, position: null }).toEqual({
      ...before,
      decay: 0,
      position: null,
    });
    expect(own(w, KERNEL)).toEqual([]);
    expect(totals(w, NUTS)).toEqual(totals(f.world, NUTS));
    expect(
      w.events.find((e) => e.type === 'trial-result' && e.actor === 'lin')
        ?.data,
    ).toMatchObject({
      key: 'hazelnut:separation-response:hand:resisted',
      verified: false,
    });
  });

  it('opens the 0.9 hazelnut with a stone struck on the rock in 0.1 blocks: 0.9 kernel and 0.9 shell, conserved mass and food value, real stone wear', () => {
    const f = base();
    const source = v7Clone(stack(f.world, f.nut));
    const b = bout(f.world, openNut(f));
    expect(b.spent).toEqual([0.2, 0.5]);
    expect(dataOf(b.setup, 'setup').quote).toMatchObject({
      blocks: 9,
      wearBound: { perContact: 0.0001, implement: 0.0018, support: 0.0018 },
    });
    const w = b.world;
    const j = last(w);
    expect(j).toMatchObject({
      status: 'completed',
      outcome: 'opened',
      paidEnergy: 0.7,
    });
    // The source item is debited; two products exist with its origin, age and decay.
    expect(w.stacks.find((s) => s.id === f.nut)).toBeUndefined();
    const kernel = own(w, KERNEL),
      shell = own(w, SHELL);
    expect(kernel).toHaveLength(1);
    expect(shell).toHaveLength(1);
    for (const s of [...kernel, ...shell]) {
      expect(s).toMatchObject({
        quantity: 0.9,
        quantityTenths: 9,
        owner: 'lin',
        origin: NUTS,
        harvestedAt: source.harvestedAt,
      });
      expect(s.reservedFor).toBeUndefined();
      expect(s.processing?.[KEY]).toMatchObject({
        revision: REVISION,
        parent: f.nut,
        treatment: 'none: not washed, heated or made safe',
      });
    }
    expect(j?.outputs).toEqual([kernel[0]?.id, shell[0]?.id]);
    // Exact material ledger: 0.18 kg in, 0.072 kg kernel and 0.108 kg shell out, no debris.
    expect(j?.ledger).toMatchObject({
      quantum: 0.1,
      input: { item: f.nut, quantity: 0.9, mass: 0.18, blocks: 9 },
      returned: null,
      kernel: { item: kernel[0]?.id, quantity: 0.9, mass: 0.072 },
      shell: { item: shell[0]?.id, quantity: 0.9, mass: 0.108 },
      debris: { quantity: 0, mass: 0 },
      balanced: true,
    });
    // Mass, nutrition and toxicity from the hazelnut source are conserved, never multiplied;
    // the shell carries no food value.
    const t0 = totals(f.world, NUTS),
      t1 = totals(w, NUTS);
    expect(t1.mass).toBeCloseTo(t0.mass, 9);
    expect(t1.nutrition).toBeCloseTo(t0.nutrition, 9);
    expect(t1.toxicity).toBeCloseTo(t0.toxicity, 9);
    expect(0.9 * resource(w, KERNEL).nutrition).toBeCloseTo(
      0.9 * resource(w, 'hazelnut').nutrition,
      9,
    );
    // Stone on stone: after each fracture the striker follows through onto the rock, as hard as
    // it, so the stone sheds 0.0001 kg per block; the rock, an object, keeps no mass record.
    expect(j?.ledger).toMatchObject({
      wear: {
        implement: { item: f.stone, contacts: 9, mass: 0.0009 },
        support: { ref: ROCK, contacts: 0, massRepresented: false },
      },
    });
    const stone = stack(w, f.stone);
    expect(stone.processing?.foodSeparationWear).toMatchObject({
      contacts: 9,
      worn: 0.0009,
    });
    expect((stone.physical?.unitMass ?? 0) * stone.quantity).toBeCloseTo(
      2 - 0.0009,
      9,
    );
    expect(dataOf(w, 'wear').implement).toMatchObject({
      item: f.stone,
      contacts: 9,
      sound: true,
    });
    expect(w.objects.find((o) => o.id === ROCK)).toEqual(
      step(f.world).world.objects.find((o) => o.id === ROCK),
    );
    // Products are drawn only once they exist; the interior is seen, nothing is certified.
    expect(viewOf(w, 'contact')).toMatchObject({
      contact: `striking each 0.1 block on ${ROCK} with ${f.stone}`,
      products: null,
    });
    expect(viewOf(w, 'opened')).toMatchObject({
      visible: { shell: 'split open and picked apart by hand', crack: 1 },
      products: {
        kernel: { item: kernel[0]?.id, quantity: 0.9 },
        shell: { item: shell[0]?.id, quantity: 0.9 },
      },
      badge: null,
    });
    expect(j?.observation).toMatchObject({
      interior: 'little observable deterioration',
      unknown: ['edibility', 'nutrition', 'toxins', 'safety'],
    });
    // Products keep ageing: the kernel decays, the shell does not; eat takes whole units only.
    const later = step(w).world;
    expect(stack(later, kernel[0]?.id ?? '').decay ?? 0).toBeGreaterThan(
      kernel[0]?.decay ?? 0,
    );
    expect(stack(later, shell[0]?.id ?? '').decay).toBe(shell[0]?.decay);
    const meal = step(w, {
      lin: {
        interface: 'eat',
        args: { target: kernel[0]?.id ?? '', quantity: 1 },
      },
    });
    expect(meal.outcomes.lin?.success).toBe(false);
  });

  it('works a selected tenth-exact part of the stack, leaving the rest untouched', () => {
    const f = base();
    const b = bout(f.world, openNut(f, { quantity: 0.3 }));
    const w = b.world;
    expect(last(w)).toMatchObject({ outcome: 'opened', quantity: 0.3 });
    expect(stack(w, f.nut)).toMatchObject({ quantity: 0.6, owner: 'lin' });
    expect(stack(w, f.nut).processing).toBeUndefined();
    expect(own(w, KERNEL).map((s) => s.quantity)).toEqual([0.3]);
    expect(own(w, SHELL).map((s) => s.quantity)).toEqual([0.3]);
    expect(totals(w, NUTS).mass).toBeCloseTo(totals(f.world, NUTS).mass, 9);
    expect(totals(w, NUTS).nutrition).toBeCloseTo(
      totals(f.world, NUTS).nutrition,
      9,
    );
  });

  it('an oak striker cracks the shell without opening it; the crack stays on the item and later bouts add to it until it opens', () => {
    const f = prepared('long-culture-v2', true);
    const action = openNut({ nut: f.nut, stone: f.oak });
    let w = bout(f.world, action).world;
    expect(last(w)).toMatchObject({ outcome: 'damaged', outputs: [f.nut] });
    expect(stack(w, f.nut).processing?.[KEY]).toMatchObject({
      part: 'closed shell',
      damage: 0.4,
      crack: 0.4,
    });
    expect(viewOf(w, 'damaged')).toMatchObject({
      visible: { shell: 'cracked, still closed', crack: 0.4 },
      products: null,
    });
    expect(ours(w, 'wear')).toEqual([]);
    w = bout(w, action).world;
    expect(stack(w, f.nut).processing?.[KEY]).toMatchObject({ damage: 0.8 });
    const third = bout(w, action);
    expect(last(third.world)).toMatchObject({ outcome: 'opened' });
    expect(own(third.world, KERNEL).map((s) => s.quantity)).toEqual([0.9]);
    // Oak is softer than the rock: following through after each fracture wears the oak.
    expect(last(third.world)?.ledger).toMatchObject({
      wear: { implement: { item: f.oak, contacts: 9, mass: 0.0009 } },
    });
    expect(totals(third.world, NUTS).nutrition).toBeCloseTo(
      totals(f.world, NUTS).nutrition,
      9,
    );
  });

  it('cuts one whole root with the stone edge on the rock: one unit in two, then three portions, mass and food value unchanged, eaten whole', () => {
    const f = base();
    const roots0 = totals(f.world, ROOTS);
    const b = bout(f.world, cutRoot(f));
    expect(b.spent).toEqual([0.2, 0.5]);
    // Setup splits exactly one unit from the two-unit stack; the other unit is untouched.
    const portion = String(open(b.setup)?.portion);
    expect(portion).not.toBe(f.root);
    expect(stack(b.setup, f.root).quantity).toBe(1);
    expect(stack(b.setup, portion)).toMatchObject({
      quantity: 1,
      reservedFor: open(b.setup)?.id,
    });
    const w = b.world;
    const cut = stack(w, portion);
    expect(cut).toMatchObject({ resource: 'root', quantity: 1, owner: 'lin' });
    expect(cut.reservedFor).toBeUndefined();
    expect(cut.processing?.[KEY]).toMatchObject({
      form: 'cut',
      portions: 2,
      cutSurfaces: 2,
      parent: f.root,
    });
    expect(stack(w, f.root).processing).toBeUndefined();
    expect(last(w)).toMatchObject({
      outcome: 'cut',
      outputs: [portion],
      ledger: {
        input: { item: portion, quantity: 1, mass: 0.4 },
        cutUnit: { item: portion, quantity: 1, mass: 0.4, portions: 2 },
        offcut: { quantity: 0, mass: 0 },
        debris: { quantity: 0, mass: 0 },
        balanced: true,
        wear: {
          implement: { item: f.stone, contacts: 1, mass: 0.0001 },
          support: { ref: ROCK, contacts: 0 },
        },
      },
      observation: { interior: 'little observable deterioration' },
    });
    expect(viewOf(w, 'cut')).toMatchObject({
      products: { cut: { item: portion, portions: 2, exposedSurfaces: 2 } },
    });
    expect(totals(w, ROOTS)).toEqual(roots0);
    // A second bout cuts the same unit again.
    const again = bout(w, cutRoot(f, portion)).world;
    expect(stack(again, portion).processing?.[KEY]).toMatchObject({
      portions: 3,
      cutSurfaces: 4,
    });
    expect(totals(again, ROOTS)).toEqual(roots0);
    // The cut unit is eaten by the ordinary rules with one whole root's food value.
    const meal = ok(
      step(again, {
        lin: { interface: 'eat', args: { target: portion, quantity: 1 } },
      }),
    );
    expect(
      meal.events.find((e) => e.type === 'ate' && e.actor === 'lin')?.data,
    ).toMatchObject({ quantity: 1, nutrition: resource(w, 'root').nutrition });
  });

  it('refuses every unsupported request before any cost', () => {
    const f = base();
    const w = f.world;
    const spent = /Nothing was spent\.$/;
    const cases: [V7Action, RegExp][] = [
      [
        trial({ operation: 'peel', inputStackId: f.root }),
        /No separable outer layer/,
      ],
      [
        trial({ operation: 'peel', inputStackId: f.nut }),
        /No separable outer layer/,
      ],
      [
        trial({ operation: 'open', inputStackId: f.root }),
        /No shell or casing/,
      ],
      [
        trial({
          operation: 'cut',
          inputStackId: f.nut,
          implementId: f.stone,
          supportId: ROCK,
        }),
        /hard shell: open it first/,
      ],
      [trial({ operation: 'cut', inputStackId: f.root }), /needs implementId/],
      [
        trial({ operation: 'cut', inputStackId: f.root, implementId: f.stone }),
        /needs supportId/,
      ],
      [
        trial({ operation: 'open', inputStackId: f.nut, supportId: ROCK }),
        /A support alone does not open food/,
      ],
      [
        trial({
          operation: 'open',
          inputStackId: f.nut,
          implementId: f.stone,
        }),
        /Striking needs supportId/,
      ],
      [
        trial({
          operation: 'cut',
          inputStackId: f.root,
          quantity: 0.5,
          implementId: f.stone,
          supportId: ROCK,
        }),
        /exactly one whole unit/,
      ],
      [openNut(f, { quantity: 0.25 }), /exact tenths/],
      [openNut(f, { quantity: 1 }), /holds 0.9; 1 was selected/],
      [
        trial({
          operation: 'open',
          inputStackId: f.nut,
          implementId: f.root,
          supportId: ROCK,
        }),
        /is food, not a material piece/,
      ],
      [
        trial({
          operation: 'cut',
          inputStackId: f.root,
          implementId: f.root,
          supportId: ROCK,
        }),
        /must be different/,
      ],
      [trial({ operation: 'open', inputStackId: f.stone }), /is not food/],
      [trial({ inputStackId: f.nut }), /Give operation/],
      [op({ mode: 'trial' }), /inputStackId/],
      [op({ mode: 'resume' }), /no open separation work to resume/],
      [op({ mode: 'cancel' }), /no open separation work to cancel/],
      [op({ mode: 'inspect-progress' }), /no separation work or inspection/],
    ];
    for (const [action, pattern] of cases)
      expect(unchanged(w, action, pattern)).toMatch(spent);
    // Out of reach of the rock, too little energy, someone else's item, a cut fraction.
    const away = v7Clone(w);
    actor(away).position = { ...AWAY };
    expect(
      unchanged(away, openNut(f), /Move within reach of start-1-stone/),
    ).toMatch(spent);
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.6;
    expect(unchanged(tired, openNut(f), /a bout needs 0.7/)).toMatch(spent);
    const tiredLook = v7Clone(w);
    actor(tiredLook).vitals.energy = 0.1;
    expect(
      unchanged(
        tiredLook,
        op({ mode: 'inspect', inputStackId: f.nut }),
        /inspecting needs 0.2/,
      ),
    ).toMatch(spent);
    const theirs = v7Clone(w);
    const nut = stack(theirs, f.nut);
    nut.owner = 'kai';
    expect(
      unchanged(theirs, trial({ operation: 'open', inputStackId: f.nut }), /./),
    ).not.toBe('');
    const opened = bout(w, openNut(f)).world;
    const kernel = ownId(opened, KERNEL);
    expect(
      unchanged(
        opened,
        trial({
          operation: 'cut',
          inputStackId: kernel,
          implementId: f.stone,
          supportId: ROCK,
        }),
        /less than the one whole unit a cut divides/,
      ),
    ).toMatch(spent);
    expect(
      unchanged(
        opened,
        trial({ operation: 'open', inputStackId: ownId(opened, SHELL) }),
        /is not food/,
      ),
    ).toMatch(spent);
  });

  it('pauses without charge, resumes after fresh checks, reports progress for 0.2, cancels once for no energy, and ends on a changed portion and at death', () => {
    const f = base();
    const action = openNut(f);
    const ready = ok(step(f.world, { lin: action }));
    const idle1 = step(f.world).world;
    // Another action in the working round pauses the work after the round, free.
    const waited = step(ready).world;
    const idle2 = step(idle1).world;
    expect(energy(idle2) - energy(waited)).toBeCloseTo(0.2, 9);
    expect(open(waited)).toMatchObject({ status: 'paused', paidEnergy: 0.2 });
    expect(ours(waited, 'paused')[0]?.description).toMatch(/another action/);
    expect(viewOf(waited, 'paused')).toMatchObject({
      phase: 'paused',
      status: 'paused',
      contact: null,
    });
    // The same action does not silently restart paused work: the reserved item is refused by
    // reference resolution, and a new bout on another item by the operation, both for free.
    unchanged(waited, action, /reserved-material/);
    expect(
      unchanged(
        waited,
        cutRoot(f),
        /separation work .* is paused after its paid setup; give resume/,
      ),
    ).toMatch(/Nothing was spent\.$/);
    // inspect-progress reports the open work and its live checks for 0.2 energy.
    const checked = cost(waited, op({ mode: 'inspect-progress' }));
    expect(checked.energy).toBeCloseTo(0.2, 9);
    expect(dataOf(checked.world, 'checked')).toMatchObject({
      status: 'paused',
      current: {
        portionCarried: true,
        portionReserved: true,
        materialChange: null,
        liveProblems: [],
        workEnergy: 0.5,
      },
    });
    // Out of reach of the support, resume refuses for free; back in reach it does the working
    // round for 0.5 energy.
    const away = v7Clone(checked.world);
    actor(away).position = { ...AWAY };
    expect(
      unchanged(
        away,
        op({ mode: 'resume' }),
        /cannot resume now: Move within reach/,
      ),
    ).toMatch(/Nothing was spent\.$/);
    const resumed = cost(checked.world, op({ mode: 'resume' }));
    expect(resumed.energy).toBeCloseTo(0.5, 9);
    expect(ours(resumed.world, 'resumed')).toHaveLength(1);
    expect(last(resumed.world)).toMatchObject({
      status: 'completed',
      outcome: 'opened',
      paidEnergy: 0.7,
    });
    // A continuing round out of reach or short of energy pauses before any charge.
    const moved = v7Clone(ready);
    actor(moved).position = { ...AWAY };
    const pausedAway = ok(step(moved, { lin: action }));
    expect(energy(pausedAway)).toBeCloseTo(energy(step(moved).world), 9);
    expect(String(open(pausedAway)?.reason)).toMatch(/Move within reach/);
    const short = v7Clone(ready);
    actor(short).vitals.energy = 0.3;
    const pausedShort = ok(step(short, { lin: action }));
    expect(String(open(pausedShort)?.reason)).toMatch(/not enough energy/);
    expect(stack(pausedShort, f.nut).reservedFor).toBe(open(pausedShort)?.id);
    // Cancel: one round, no energy; the portion is released once as it is; paid energy stays.
    const cancelled = ok(step(waited, { lin: op({ mode: 'cancel' }) }));
    expect(energy(cancelled)).toBe(energy(step(waited).world));
    expect(open(cancelled)).toBeUndefined();
    expect(last(cancelled)).toMatchObject({
      status: 'cancelled',
      paidEnergy: 0.2,
    });
    expect(dataOf(cancelled, 'cancelled')).toMatchObject({ released: true });
    expect(stack(cancelled, f.nut).reservedFor).toBeUndefined();
    expect(stack(cancelled, f.nut).quantity).toBe(0.9);
    expect(
      unchanged(cancelled, op({ mode: 'cancel' }), /no open separation work/),
    ).toMatch(/Nothing was spent\.$/);
    // A changed portion ends the work at the next working round, free; nothing is refunded.
    const changed = v7Clone(ready);
    const portion = stack(changed, f.nut);
    portion.harvestedAt = (portion.harvestedAt ?? 0) - 1;
    const invalid = ok(step(changed, { lin: action }));
    expect(energy(invalid)).toBeCloseTo(energy(step(changed).world), 9);
    expect(open(invalid)).toBeUndefined();
    expect(last(invalid)).toMatchObject({ status: 'invalidated' });
    expect(dataOf(invalid, 'invalidated')).toMatchObject({ released: true });
    expect(stack(invalid, f.nut).reservedFor).toBeUndefined();
    // A portion that is gone ends the work after the round.
    const gone = v7Clone(ready);
    gone.stacks = gone.stacks.filter((s) => s.id !== f.nut);
    const lost = step(gone).world;
    expect(open(lost)).toBeUndefined();
    expect(last(lost)).toMatchObject({ status: 'invalidated' });
    expect(dataOf(lost, 'invalidated')).toMatchObject({ released: false });
    // Death right after the setup ends the work; the portion is released once to the death rules.
    const dying = v7Clone(f.world);
    actor(dying).vitals.health = 0.01;
    actor(dying).vitals.satiety = 0;
    const died = step(dying, { lin: action }).world;
    expect(
      died.events.some((e) => e.type === 'died' && e.actor === 'lin'),
    ).toBe(true);
    expect(open(died)).toBeUndefined();
    expect(last(died)).toMatchObject({ status: 'ended' });
    expect(dataOf(died, 'ended')).toMatchObject({ released: true });
    const left = died.stacks.filter((s) => s.id === f.nut);
    expect(left).toHaveLength(1);
    expect(left[0]?.reservedFor).toBeUndefined();
    expect(left[0]?.quantity).toBe(0.9);
    expect(own(died, KERNEL)).toEqual([]);
  });

  it('never rewards a bout: no satisfaction, mood, practice milestone, verified-information award, progress credit or made-work notice, with incentives off or on', () => {
    for (const scenario of [
      'long-culture-v2',
      'long-culture-v2-incentives',
    ] as const) {
      const f = scenario === 'long-culture-v2' ? base() : prepared(scenario);
      let w = f.world,
        idle = f.world;
      const seen: V7Event[] = [];
      const script: V7Action[] = [
        op({ mode: 'inspect', inputStackId: f.nut }),
        trial({ operation: 'open', inputStackId: f.nut }),
        trial({ operation: 'open', inputStackId: f.nut }),
        openNut(f),
        openNut(f),
        cutRoot(f),
        cutRoot(f),
        op({ mode: 'inspect-progress' }),
      ];
      for (const action of script) {
        w = ok(step(w, { lin: action }));
        idle = step(idle).world;
        seen.push(...w.events);
      }
      expect(own(w, KERNEL)).toHaveLength(1);
      expect(
        seen.filter((e) =>
          [
            'satisfaction',
            'satisfaction-maintained',
            'practice-confirmed',
            'information-confirmed',
            'work-noticed',
            'acknowledged',
            'reciprocated',
          ].includes(e.type),
        ),
      ).toEqual([]);
      for (const e of seen.filter(
        (e) => e.type.startsWith(PREFIX) || e.interface === id,
      )) {
        expect(e.data.qualified).toBeUndefined();
        for (const key of ['remaining', 'progress', 'elapsed'])
          expect(typeof e.data[key]).not.toBe('number');
      }
      for (const a of w.actors) {
        const b = actor(idle, a.id);
        expect(a.wellbeing.sources).toEqual(b.wellbeing.sources);
        expect(a.experience?.mental).toBe(b.experience?.mental);
        expect(a.experience?.pleasure).toBe(b.experience?.pleasure);
        expect(a.extensionState['long:lastProgress']).toBe(
          b.extensionState['long:lastProgress'],
        );
        expect(
          Object.keys(a.extensionState).filter((k) =>
            k.startsWith('open:practice:'),
          ),
        ).toEqual([]);
      }
      expect(actor(w).wellbeing.physical).toBeLessThanOrEqual(10);
      expect(w.objects.filter((o) => o.createdBy === 'lin')).toEqual([]);
      expect(
        w.satisfaction.find((r) => r.id === `practice:${id}`),
      ).toMatchObject({ event: 'practice-confirmed', interface: id });
    }
  });

  it('keeps every agent-visible text it adds clear of the excluded vocabulary', () => {
    const f = base();
    let w = f.world;
    const seen: V7Event[] = [];
    const script: V7Action[] = [
      op({ mode: 'inspect', inputStackId: f.nut }),
      op({ mode: 'inspect', inputStackId: f.root }),
      trial({ operation: 'open', inputStackId: f.nut }),
      trial({ operation: 'open', inputStackId: f.nut }),
      openNut(f, { quantity: 0.4 }),
      WAIT,
      op({ mode: 'inspect-progress' }),
      op({ mode: 'resume' }),
      cutRoot(f),
      op({ mode: 'cancel' }),
      cutRoot(f),
      cutRoot(f),
    ];
    script.forEach((action, i) => {
      w = step(w, { lin: action }).world;
      seen.push(
        ...w.events.filter(
          (e) =>
            e.type.startsWith(PREFIX) ||
            e.interface === id ||
            e.type === 'trial-result',
        ),
      );
      if (i === 5) {
        const text = JSON.stringify(longOrdinaryInput(w, 'lin'));
        expect(text).toContain(OPEN);
        expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
        expect(text).not.toMatch(EXTRA_EXCLUDED);
      }
    });
    expect(new Set(seen.map((e) => e.type))).toEqual(
      new Set([
        'food-separation-inspected',
        'food-separation-setup',
        'food-separation-contact',
        'food-separation-resisted',
        'food-separation-opened',
        'food-separation-cut',
        'food-separation-wear',
        'food-separation-completed',
        'food-separation-paused',
        'food-separation-resumed',
        'food-separation-cancelled',
        'food-separation-checked',
        'trial-result',
      ]),
    );
    const text = JSON.stringify(seen);
    expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
    for (const who of ['lin', 'kai']) {
      const input = JSON.stringify(longOrdinaryInput(w, who));
      expect(input).not.toMatch(IMPORT_EXCLUDED_WORDS);
      expect(input).not.toMatch(EXTRA_EXCLUDED);
    }
    expect(JSON.stringify(actor(w).extensionState[RECORDS])).not.toMatch(
      EXTRA_EXCLUDED,
    );
  });
});
