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
  V7Object,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';
import { CONTINUOUS_VISUALS } from '../../viewer/src/continuous-visuals.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 120_000 });

const id = 'propagate-from-seed';
const SEEDS = 'berry-seed-lot';
const PULP = 'berry-pulp';
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
];
/** sha256 of JSON.stringify of the map from id@version to the sha256 of JSON.stringify of each
 * of the 117 packages registered before this change, in registration order (the scratch hash
 * file, with shape-and-use-wooden-digging-tool@1 added before this change). */
const EXISTING_DIGEST =
  '57a9d9e84b0b599c0fef6563ad0597ca02f6db28190d2bab81aa516047788c80';
/** sha256 of JSON.stringify of each reused or related package, taken before this change. */
const REUSED: Record<string, string> = {
  'foundation-forest@1':
    '54094fb4230e6a50ffaeec27771a3d4345987b2e6f03161a5cf61f9f5c36de7b',
  'foundation-open@1':
    'c2cc0c70d608bd5f5e60b81671ee99a73c8bfa1304ad88faed1342d59cb5f6fe',
  'cultivation-trial@1':
    '6ad98228628b38db379746192d8a1a6597e2546dacfa52acf9ddc9882ec141a7',
  'cultivate-plants@1':
    '5b422304341919bc5d2f16fa5a48c47a4471a8e780b29aff7bc92343fd2e11f8',
  'plant-cultivation@1':
    '4829987d60e5de05c974ff70b602e92c2d46f1ace6fc0fcee1bdfbbb8a0659ab',
  'plant-establishment-trial@1':
    'c0dae7e33cc5e053ff4a0b537241df729fc51ebed088486f05050789f21f14f3',
  'rooted-plant-watering@1':
    'f2144a1b994377087fa1bd49445469122eadcab3c76292731d413e02ec2a891f',
  'crack-and-separate-casing@1':
    'e184166595eb2c393ed25af28b3c2e434868c1d560a85c74b571107a6d7273ce',
  'shape-and-use-wooden-digging-tool@1':
    'e8323197331afaafa12287671d597fb2dabfdd3953513e8fccce63bc3a0163f0',
};
/** Lin's ex23 parent plant and a standing point within its reach. */
const PARENT = 'commons-berry-0-0';
const AT_PARENT = { x: 17.2, y: 14.6 };
/** Open ordinary soil east of the berry commons, with 2 berry plants within 5 m, and a
 * standing point 0.65 m west of it (clear of the 0.25 m patch, within reach). */
const SITE = { x: 21.25, y: 14.75 };
const AT_SITE = { x: 20.6, y: 14.75 };
/** Ground the sowing rule refuses, each with a standing point 0.65 m west. */
const CROWDED = { at: AT_PARENT, site: { x: 17.2, y: 15.6 } };
const ROCKY = { at: { x: 31.6, y: 14.5 }, site: { x: 32.25, y: 14.5 } };
const BANK = { at: { x: 17.6, y: 17.25 }, site: { x: 18.25, y: 17.25 } };
const FOREST = { at: { x: 13.85, y: 14.75 }, site: { x: 14.5, y: 14.75 } };

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
const actor = (w: V7World, name = 'lin'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const events = (w: V7World, type: string, who: string | null = 'lin') =>
  w.events.filter((e) => e.type === type && e.actor === who);
const data = (w: V7World, type: string, who: string | null = 'lin') =>
  events(w, type, who).at(-1)?.data as Record<string, unknown> | undefined;
const stack = (w: V7World, item: string): V7Stack => {
  const s = w.stacks.find((s) => s.id === item);
  if (!s) throw new Error(`Missing stack ${item}.`);
  return s;
};
const object = (w: V7World, oid: string): V7Object => {
  const o = w.objects.find((o) => o.id === oid);
  if (!o) throw new Error(`Missing object ${oid}.`);
  return o;
};
type Work = {
  id: string;
  owner: string;
  status: string;
  stage: string;
  phase: string;
  lot: string;
  patch: string | null;
  phases: string[];
  adopted: boolean;
  completedWork: number;
  remainingWork: number;
  paidEnergy: number;
  escrow: string[];
  reason?: string;
  failures: { reason: string }[];
};
const works = (w: V7World) =>
  Object.entries(w.state)
    .filter(
      ([k, v]) =>
        k.startsWith('collective:work:') &&
        (v as { ability?: string }).ability === id,
    )
    .map(([, v]) => v as unknown as Work);
const work = (w: V7World): Work => {
  const j = works(w).at(-1);
  if (!j) throw new Error('Missing sowing work.');
  return j;
};
type Patch = {
  lifecycle: string;
  species: string;
  workId: string | null;
  loosened: { radius: number; depth: number; volume: number };
  cover: { depth: number; volume: number } | null;
  seed: Record<string, unknown> | null;
  parent: string | null;
  sownBy: string | null;
  sownAt: number | null;
  emergedAt: number | null;
  fruitedAt: number | null;
  growth: {
    rounds: number;
    eligibleRounds: number;
    stalledRounds: number;
    establishment: number;
    moistureRounds: number;
    darkRounds: number;
  };
};
const patches = (w: V7World) =>
  w.objects.filter((o) => o.revision === `${id}@1` && !!o.data.sowing);
const patchOf = (o: V7Object) => o.data.sowing as unknown as Patch;
const viewOf = (o: V7Object) => o.data.view as Record<string, unknown>;
const lotRecord = (s: V7Stack) =>
  (s.processing?.seedPropagation ?? null) as Record<string, unknown> | null;
const act = (mode: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});
const own = (w: V7World, res: string, who = 'lin') =>
  w.stacks.filter((s) => s.owner === who && s.resource === res);
const unitMass = (w: V7World, s: V7Stack) =>
  s.physical?.unitMass ??
  w.resources.find((r) => r.id === s.resource)?.mass ??
  NaN;
const nutrition = (w: V7World, s: V7Stack) =>
  s.quantity * (w.resources.find((r) => r.id === s.resource)?.nutrition ?? 0);
/** Everything from Lin's parent plant: berries, seeds and pulp as items, plus seeds sown into
 * patch records. */
const lineage = (w: V7World) => {
  const items = w.stacks.filter((s) => s.origin === PARENT);
  const sown = patches(w)
    .map((o) => patchOf(o).seed)
    .filter((s) => s && s.origin === PARENT && s.absorbedAt === null);
  return {
    mass:
      items.reduce((n, s) => n + s.quantity * unitMass(w, s), 0) +
      sown.reduce((n, s) => n + Number(s?.mass ?? 0), 0),
    nutrition: items.reduce((n, s) => n + nutrition(w, s), 0),
  };
};
/** Keep everyone fed and rested so the tests isolate the operation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
function genesis() {
  return initialLongWorld('long-ex23', 'long-culture-v2-oldgoal', {
    seed: 20261203,
    development: 8,
    tokens: 1500000,
  });
}
function installed() {
  const g = genesis();
  return v7Clone(v7Install(g, continuousRegistry(g), `${id}@1`));
}
const at = (w: V7World, p: { x: number; y: number }, who = 'lin') => {
  const copy = v7Clone(w);
  actor(copy, who).position = { ...p };
  return fed(copy);
};
const learn = (w: V7World, who = 'lin') => {
  let s = step(w, {
    [who]: { interface: 'learn', args: { ability: id } },
  }).world;
  for (let i = 0; i < 3; i++) s = step(s).world;
  expect(actor(s, who).mastered).toContain(id);
  return fed(s);
};
/** Lin gathers six berries from her ex23 parent plant and studies the operation. */
let based: V7World | null = null;
function base(opts: { study?: boolean } = {}) {
  if (opts.study === false || !based) {
    const r = step(at(installed(), AT_PARENT), {
      lin: { interface: 'gather', args: { target: PARENT, quantity: 6 } },
    });
    expect(r.outcomes.lin?.success).toBe(true);
    const gathered = fed(r.world);
    if (opts.study === false) return gathered;
    based = learn(gathered);
  }
  return v7Clone(based);
}
const berry = (w: V7World, who = 'lin') => {
  const s = own(w, 'berry', who).find((s) => s.origin === PARENT);
  if (!s) throw new Error('Lin holds no berries from the parent plant.');
  return s.id;
};
/** The action fails and changes no vitals, stacks, objects or works compared with waiting. */
function unchanged(w: V7World, action: V7Action, who = 'lin') {
  const result = step(w, { [who]: action }),
    idle = step(w).world;
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  expect(v7Signature(works(result.world))).toBe(v7Signature(works(idle)));
  return result.outcomes[who]?.reason ?? '';
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action, who = 'lin') {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  return {
    world: r.world,
    outcome: r.outcomes[who],
    energy:
      Math.round(
        (actor(idle, who).vitals.energy - actor(r.world, who).vitals.energy) *
          1e8,
      ) / 1e8,
  };
}
const extract = (w: V7World) => act('extract', { target: berry(w) });
/** Lin extracts one berry's seeds and stands within reach of the open site. */
function extracted() {
  const r = cost(base(), extract(base()));
  const lot = own(r.world, SEEDS)[0]?.id ?? '';
  return { w: at(r.world, AT_SITE), lot };
}
const sow = (lot: string, p = SITE, extra: Record<string, unknown> = {}) =>
  act('sow', { target: lot, ...p, ...extra });
/** Lin sows one seed lot at the open site in two rounds. */
function sown() {
  const f = extracted();
  const r1 = cost(f.w, sow(f.lot));
  const r2 = cost(r1.world, sow(f.lot));
  const o = patches(r2.world)[0];
  if (!o) throw new Error('Missing patch.');
  return { before: f.w, w: r2.world, lot: f.lot, patch: o.id };
}
/** Runs ordinary rounds until an event of the given type occurs; returns the world before it. */
function until(w: V7World, type: string, limit = 400) {
  let now = w;
  for (let i = 0; i < limit; i++) {
    const before = now;
    now = fed(step(now).world);
    if (now.events.some((e) => e.type === type))
      return { before, at: now, rounds: i + 1 };
  }
  throw new Error(`No ${type} within ${String(limit)} rounds.`);
}
const reasons = (log: V7Event[]) => log.map((e) => e.type);

describe('propagate a berry plant from seed in ex23', () => {
  it('is scoped to ex23, registered last, within the size limit, learned in four rounds at 0.2 energy, and leaves every existing package byte-identical', () => {
    const other = initialLongWorld('long-ex22', 'long-culture-v2');
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
      'rooted-plant-watering',
      'crack-and-separate-casing',
      'shape-and-use-wooden-digging-tool',
      id,
    ]);
    expect(pkg).toMatchObject({
      scope: 'long-ex23',
      version: 1,
      dependencies: ['foundation-open@1'],
      visualComponents: ['cultivation-trial'],
      satisfaction: [],
      processes: {},
    });
    // The reused cultivation drawing exists.
    for (const c of pkg.visualComponents)
      expect(typeof CONTINUOUS_VISUALS[c]).toBe('function');
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 4,
      learningEnergy: 0.2,
      revision: `${id}@1`,
      handler: `long.${id}`,
      authored: false,
      practiceEvidence: 'seed-propagation-sown',
      references: { target: 'optional-exact-visible' },
    });
    expect(ability.parameters.properties?.mode).toMatchObject({
      enum: ['extract', 'inspect', 'sow', 'pause', 'resume', 'cancel'],
    });
    expect(ability.parameters.required).toEqual(['mode']);
    // New package, ability, handler, equivalence, event and resource names.
    expect(TAKEN).not.toContain(id);
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(ability.id);
        expect(a.equivalence).not.toBe(ability.equivalence);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? [])
        expect(e).not.toMatch(/^seed-propagation-/);
      for (const r of p.resources) expect([SEEDS, PULP]).not.toContain(r.id);
    }
    const limit = g.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg.abilities,
      events: pkg.events,
      resources: pkg.resources.map((r) => r.name),
    });
    expect(visible).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    // Every package registered before this change, the reused ones included, is byte-identical.
    const existing = V7_PACKAGES.slice(0, V7_PACKAGES.indexOf(pkg));
    expect(existing).toHaveLength(117);
    const map = Object.fromEntries(
      existing.map((p) => [`${p.id}@${String(p.version)}`, sha(p)]),
    );
    expect(sha(map)).toBe(EXISTING_DIGEST);
    for (const [key, hash] of Object.entries(REUSED))
      expect(map[key]).toBe(hash);
    // Two part materials whose unit is that part of one whole berry unit.
    const w = installed();
    const fruit = w.resources.find((r) => r.id === 'berry');
    const seeds = w.resources.find((r) => r.id === SEEDS);
    const pulp = w.resources.find((r) => r.id === PULP);
    expect(seeds).toMatchObject({ mass: 0.01, nutrition: 0, toxicity: 0 });
    expect(seeds?.properties?.decay).toBe(0);
    expect(pulp).toMatchObject({
      mass: 0.19,
      nutrition: 8,
      toxicity: 0,
      food: { ingredients: [{ resource: 'berry', share: 1 }] },
    });
    expect(pulp?.properties?.decay).toBe(fruit?.properties?.decay);
    expect((seeds?.mass ?? 0) + (pulp?.mass ?? 0)).toBeCloseTo(
      fruit?.mass ?? 0,
      12,
    );
    // Unstudied use is refused at no cost; four study rounds of 0.2 energy master it.
    const f = base({ study: false });
    expect(unchanged(f, extract(f))).toMatch(/master|learn|stud/i);
    let s = v7Clone(f),
      idle = v7Clone(f);
    for (const x of [s, idle]) actor(x).vitals.energy = 30;
    for (let i = 0; i < 4; i++) {
      s = step(s, {
        lin: i === 0 ? { interface: 'learn', args: { ability: id } } : WAIT,
      }).world;
      idle = step(idle).world;
      expect(
        Math.round((actor(idle).vitals.energy - actor(s).vitals.energy) * 1e8) /
          1e8,
      ).toBe(Math.round(0.2 * (i + 1) * 1e8) / 1e8);
      if (i < 3) expect(actor(s).mastered).not.toContain(id);
    }
    expect(actor(s).mastered).toContain(id);
  });

  it('extracts the seeds of one whole berry in one round for 0.5 energy, partitioning mass and food value and keeping lineage', () => {
    const w = base();
    const item = berry(w);
    const before = lineage(w);
    expect(before.mass).toBeCloseTo(1.2, 12);
    expect(before.nutrition).toBe(48);
    const r = cost(w, extract(w));
    expect(r.energy).toBe(0.5);
    const after = r.world;
    expect(stack(after, item).quantity).toBe(5);
    const [lot] = own(after, SEEDS),
      [pulp] = own(after, PULP);
    if (!lot || !pulp) throw new Error('Missing products.');
    expect(own(after, SEEDS)).toHaveLength(1);
    expect(own(after, PULP)).toHaveLength(1);
    for (const s of [lot, pulp])
      expect(s).toMatchObject({
        quantity: 1,
        owner: 'lin',
        origin: PARENT,
        harvestedAt: stack(w, item).harvestedAt,
      });
    // Mass and food value are partitioned, not copied: 5 berries, 0.01 kg seeds, 0.19 kg pulp.
    const now = lineage(after);
    expect(now.mass).toBeCloseTo(before.mass, 12);
    expect(now.nutrition).toBe(before.nutrition);
    expect(unitMass(after, lot)).toBe(0.01);
    expect(unitMass(after, pulp)).toBe(0.19);
    expect(nutrition(after, lot)).toBe(0);
    expect(nutrition(after, pulp)).toBe(8);
    const d = data(after, 'seed-propagation-extracted');
    expect(d?.ledger).toEqual({
      input: {
        item,
        resource: 'berry',
        quantity: 1,
        mass: 0.2,
        nutrition: 8,
      },
      seeds: {
        item: lot.id,
        quantity: 1,
        mass: 0.01,
        nutrition: 0,
        propagules: 1,
      },
      pulp: { item: pulp.id, quantity: 1, mass: 0.19, nutrition: 8 },
      balanced: true,
    });
    expect(d?.view).toMatchObject({
      mode: 'extract',
      plantStage: 'unverified seed',
      seedProduct: true,
      labor: { completed: 1, required: 1 },
      badge: null,
    });
    // Lineage: the source item, its parent plant and the parent's capacity and interval.
    const decay = stack(w, item).decay ?? 0;
    expect(lotRecord(lot)).toMatchObject({
      part: 'seed lot',
      species: 'berry',
      source: item,
      parent: PARENT,
      parentCapacity: 20,
      parentInterval: 5,
      sourceHarvestedAt: stack(w, item).harvestedAt,
      extractedBy: 'lin',
      propagules: 1,
      viability: 'unknown',
    });
    expect(Number(lotRecord(lot)?.sourceDecay)).toBeCloseTo(decay, 6);
    expect(lotRecord(pulp)).toMatchObject({ part: 'pulp', propagules: 0 });
    // Pulp keeps ageing with the berry; separated seeds do not age.
    expect(pulp.decay).toBeCloseTo(stack(after, item).decay ?? NaN, 8);
    expect(lot.decay).toBeCloseTo(decay, 6);
    const later = fed(step(fed(step(after).world)).world);
    expect(stack(later, lot.id).decay).toBe(lot.decay);
    expect(stack(later, pulp.id).decay ?? 0).toBeGreaterThan(pulp.decay ?? 0);
    // The pulp is eaten exactly like a berry; the seeds are not food.
    const hungry = v7Clone(after);
    actor(hungry).vitals.satiety = 50;
    const ate = (target: string) =>
      step(hungry, {
        lin: { interface: 'eat', args: { target, quantity: 1 } },
      });
    const pulpMeal = ate(`resource:${PULP}`),
      berryMeal = ate('resource:berry');
    expect(pulpMeal.outcomes.lin?.success).toBe(true);
    expect(actor(pulpMeal.world).vitals.satiety).toBe(
      actor(berryMeal.world).vitals.satiety,
    );
    expect(ate(`resource:${SEEDS}`).outcomes.lin?.success).toBe(false);
    // An actual separation trial: one verified personal record per parent plant and outcome.
    expect(
      actor(after).memory.knowledge?.[`${PARENT}:seed-extraction:seeds`],
    ).toMatchObject({ verified: true, value: { seedLots: 1, seedMass: 0.01 } });
    // A second berry is a second paid attempt with its own seed lot; nothing is consumed by default.
    const again = cost(fed(after), extract(after));
    expect(again.energy).toBe(0.5);
    expect(own(again.world, SEEDS)).toHaveLength(2);
    expect(stack(again.world, item).quantity).toBe(4);
    // No reward: no practice milestone and the same wellbeing sources as before.
    expect(events(after, 'practice-confirmed')).toHaveLength(0);
    expect(
      actor(after).wellbeing.sources.map((s) => [s.source, s.lastEvent]),
    ).toEqual(actor(w).wellbeing.sources.map((s) => [s.source, s.lastEvent]));
  });

  it('finds no seed in a berry whose parent is not a living berry plant: a paid, informative failure that leaves all of it as pulp', () => {
    const w = base();
    const item = berry(w);
    // A unit of the same food whose parent is not a plant of the ecology.
    const orphan = v7Clone(w);
    const s = stack(orphan, item);
    s.origin = 'start-2-stone';
    const r = cost(orphan, act('extract', { target: item }));
    expect(r.energy).toBe(0.5);
    expect(own(r.world, SEEDS)).toHaveLength(0);
    const [pulp] = own(r.world, PULP);
    if (!pulp) throw new Error('Missing pulp.');
    expect(unitMass(r.world, pulp)).toBe(0.2);
    expect(nutrition(r.world, pulp)).toBe(8);
    expect(stack(r.world, item).quantity).toBe(5);
    const d = data(r.world, 'seed-propagation-no-seed');
    expect(d?.ledger).toMatchObject({
      seeds: { item: null, quantity: 0, mass: 0, propagules: 0 },
      pulp: { item: pulp.id, mass: 0.2, nutrition: 8 },
      balanced: true,
    });
    expect(d?.view).toMatchObject({ seedProduct: false, plantStage: null });
    expect(events(r.world, 'seed-propagation-extracted')).toHaveLength(0);
    expect(
      actor(r.world).memory.knowledge?.[
        'start-2-stone:seed-extraction:no-seed'
      ],
    ).toMatchObject({ verified: true, value: { seedLots: 0 } });
  });

  it('refuses at no cost: other foods, partial, treated, separated or foreign items, low energy, wrong targets and malformed requests', () => {
    const w = base();
    const item = berry(w);
    // Not one whole unit of untreated berry.
    const partial = v7Clone(w);
    stack(partial, item).quantity = 0.5;
    stack(partial, item).quantityTenths = 5;
    expect(unchanged(partial, act('extract', { target: item }))).toMatch(
      /whole unit/,
    );
    const root = v7Clone(w);
    stack(root, item).resource = 'root';
    expect(unchanged(root, act('extract', { target: item }))).toMatch(
      /No seed anatomy/,
    );
    const treated = v7Clone(w);
    stack(treated, item).processing = { dried: true };
    expect(unchanged(treated, act('extract', { target: item }))).toMatch(
      /treated/,
    );
    // Someone else's berry, an unknown item and a schema-invalid quantity.
    const foreign = v7Clone(w);
    stack(foreign, item).owner = 'ivo';
    expect(unchanged(foreign, act('extract', { target: item }))).not.toBe('');
    expect(unchanged(w, act('extract', { target: 'item-none' }))).not.toBe('');
    expect(
      unchanged(w, act('extract', { target: item, quantity: 2 })),
    ).not.toBe('');
    expect(unchanged(w, act('extract'))).not.toBe('');
    expect(unchanged(w, act('plant'))).not.toBe('');
    // Energy below each cost.
    const tired = (e: number) => {
      const copy = v7Clone(w);
      actor(copy).vitals.energy = e;
      return copy;
    };
    expect(unchanged(tired(0.4), act('extract', { target: item }))).toMatch(
      /energy/,
    );
    expect(unchanged(tired(0.1), act('inspect', { target: item }))).toMatch(
      /energy/,
    );
    // Separated material is not crushed again; sowing needs a seed lot and a site.
    const f = extracted();
    const pulp = own(f.w, PULP)[0]?.id ?? '';
    expect(unchanged(f.w, act('extract', { target: f.lot }))).toMatch(
      /already separated/,
    );
    expect(unchanged(f.w, sow(berry(f.w)))).toMatch(/not a separated seed lot/);
    expect(unchanged(f.w, sow(pulp))).toMatch(/not a separated seed lot/);
    expect(unchanged(f.w, act('sow', { target: f.lot }))).toMatch(/x and y/);
    const low = v7Clone(f.w);
    actor(low).vitals.energy = 0.9;
    expect(unchanged(low, sow(f.lot))).toMatch(/energy/);
    expect(unchanged(at(f.w, AT_PARENT), sow(f.lot))).toMatch(/within reach/);
    // Inspection needs something within reach to look at.
    expect(unchanged(f.w, act('inspect'))).toMatch(/Give x, y/);
    expect(unchanged(f.w, act('inspect', { x: 30, y: 14.75 }))).toMatch(
      /within reach/,
    );
    expect(unchanged(f.w, act('inspect', { target: PARENT }))).not.toBe('');
    // No open work to pause, resume or cancel.
    for (const mode of ['pause', 'resume', 'cancel'])
      expect(unchanged(f.w, act(mode))).toMatch(/no open sowing work/);
  });

  it('inspects a site, a source berry or a seed lot for 0.2 energy, reporting only what is seen and felt and the sowing rule', () => {
    const f = extracted();
    const r = cost(f.w, act('inspect', { target: f.lot, ...SITE }));
    expect(r.energy).toBe(0.2);
    const d = data(r.world, 'seed-propagation-inspected');
    expect(d?.item).toMatchObject({
      item: f.lot,
      part: 'seed lot',
      quantity: 1,
      mass: 0.01,
      parent: PARENT,
      condition: 'intact',
      viability: 'unknown',
      reserved: false,
    });
    expect(d?.site).toMatchObject({
      x: SITE.x,
      y: SITE.y,
      ground: 'open ordinary soil',
      moisture: 0.65,
      waterlogging: 0,
      sameFoodPlantsWithin5m: 2,
      sowable: true,
      reason: null,
      rule: {
        ground: 'open ordinary soil',
        moisture: [0.3, 1.2],
        waterloggingAtMost: 0.1,
        clearOfObjects: 0.6,
        fewerThan: 3,
        within: 5,
        loosen: { radius: 0.1, depth: 0.03 },
        coverDepth: 0.005,
        growthAbove: 6,
        fullGrowthAt: 20,
        moistureScale: 0.6,
        establishment: 12,
        stockAtMost: 4,
      },
    });
    // Nothing hidden or physical changes: no growth rate, accumulation or stock is reported.
    expect(JSON.stringify(d?.site)).not.toMatch(/growthRate|accumulated/);
    const idle = step(f.w).world;
    expect(v7Signature(r.world.stacks)).toBe(v7Signature(idle.stacks));
    expect(v7Signature(r.world.objects)).toBe(v7Signature(idle.objects));
    expect(
      actor(r.world).memory.knowledge?.[
        `site:${String(SITE.x)}:${String(SITE.y)}:sowing-site`
      ],
    ).toMatchObject({ verified: false });
    // The parent's crowded surroundings, rocky ground, the wet bank and forest floor are not sowable.
    const look = (p: { at: typeof SITE; site: typeof SITE }) =>
      data(
        cost(at(f.w, p.at), act('inspect', { ...p.site })).world,
        'seed-propagation-inspected',
      )?.site as Record<string, unknown>;
    expect(look(CROWDED)).toMatchObject({ sowable: false });
    expect(String(look(CROWDED).reason)).toMatch(/within 5 m/);
    expect(Number(look(CROWDED).sameFoodPlantsWithin5m)).toBeGreaterThanOrEqual(
      3,
    );
    expect(look(ROCKY)).toMatchObject({
      ground: 'rocky ground',
      sowable: false,
    });
    expect(String(look(ROCKY).reason)).toMatch(/Rocky ground is too hard/);
    expect(look(BANK)).toMatchObject({ ground: 'wet bank', sowable: false });
    expect(look(FOREST)).toMatchObject({
      ground: 'forest floor',
      sowable: false,
    });
    // A source berry: freshness and whether a whole unit can be opened; seeds are not visible.
    const b = cost(at(f.w, AT_PARENT), act('inspect', { target: berry(f.w) }));
    expect(b.energy).toBe(0.2);
    expect(data(b.world, 'seed-propagation-inspected')?.item).toMatchObject({
      resource: 'berry',
      quantity: 5,
      parent: PARENT,
      seeds: 'not visible until a unit is opened',
      extractable: true,
      reason: null,
    });
  });

  it('sows on soft ground in two rounds of 1 energy, moving the seeds into the patch record, and refuses hard or unsuitable ground before any cost', () => {
    const f = extracted();
    const before = lineage(f.w);
    // Hard or unsuitable ground and crowded surroundings fail before any cost.
    const lot = (w: V7World) => own(w, SEEDS)[0]?.id ?? '';
    expect(unchanged(at(f.w, ROCKY.at), sow(f.lot, ROCKY.site))).toMatch(
      /Rocky ground is too hard to loosen by hand/,
    );
    expect(unchanged(at(f.w, BANK.at), sow(f.lot, BANK.site))).toMatch(
      /wet bank/,
    );
    expect(unchanged(at(f.w, FOREST.at), sow(f.lot, FOREST.site))).toMatch(
      /ordinary soil/,
    );
    expect(unchanged(at(f.w, CROWDED.at), sow(f.lot, CROWDED.site))).toMatch(
      /within 5 m/,
    );
    // Round one loosens a patch; the seeds stay carried and reserved.
    const r1 = cost(f.w, sow(f.lot));
    expect(r1.energy).toBe(1);
    expect(r1.outcome?.complete).toBe(false);
    const j1 = work(r1.world);
    expect(j1).toMatchObject({
      status: 'active',
      phases: ['prepare'],
      completedWork: 1,
      remainingWork: 1,
      lot: f.lot,
      adopted: false,
    });
    const p1 = object(r1.world, j1.patch ?? '');
    expect(p1).toMatchObject({ kind: 'seed-sowing-patch', createdBy: null });
    expect(patchOf(p1)).toMatchObject({
      lifecycle: 'preparing',
      workId: j1.id,
      loosened: { radius: 0.1, depth: 0.03, volume: 0.00094248 },
      cover: null,
      seed: null,
    });
    expect(p1.data.interval).toBeUndefined();
    expect(viewOf(p1)).toMatchObject({
      component: 'cultivation-trial',
      lifecycle: 'preparing',
      workId: j1.id,
      labor: { completed: 1, required: 2 },
      unitPresent: false,
      sprouted: false,
      plantStage: 'patch being prepared',
    });
    expect(stack(r1.world, f.lot)).toMatchObject({
      owner: 'lin',
      reservedFor: j1.id,
    });
    expect(data(r1.world, 'seed-propagation-prepared')?.view).toMatchObject({
      phase: 'cover',
      labor: { completed: 1, required: 2 },
    });
    // Round two places and covers the seeds: they leave the inventory for the patch record.
    const r2 = cost(r1.world, sow(f.lot));
    expect(r2.energy).toBe(1);
    expect(r2.outcome?.complete).toBe(true);
    const w = r2.world;
    expect(w.stacks.some((s) => s.id === f.lot)).toBe(false);
    expect(work(w)).toMatchObject({
      status: 'completed',
      phases: ['prepare', 'cover'],
      paidEnergy: 2,
      escrow: [],
    });
    const o = object(w, j1.patch ?? '');
    const t = patchOf(o);
    expect(t).toMatchObject({
      lifecycle: 'sown',
      workId: null,
      cover: { depth: 0.005 },
      parent: PARENT,
      sownBy: 'lin',
      sownAt: w.tick,
    });
    expect(t.seed).toMatchObject({
      item: f.lot,
      resource: SEEDS,
      quantity: 1,
      mass: 0.01,
      origin: PARENT,
      parent: PARENT,
      propagules: 1,
      sownBy: 'lin',
      absorbedAt: null,
    });
    // The patch is now a propagule of the unchanged ecology, not a rooted plant and not food.
    expect(o.kind).toBe('seed-sowing-patch');
    expect(o.data).toMatchObject({
      resource: 'berry',
      stock: 0,
      capacity: 4,
      interval: 5,
      stage: 'seedling',
      seedUnits: 1,
      parent: PARENT,
      nextDispersal: w.tick + 600,
    });
    expect(viewOf(o)).toMatchObject({
      lifecycle: 'planted',
      plantStage: 'sown patch',
      sprouted: false,
      harvestableStock: 0,
      material: 'covered soil over sown seeds; nothing shows above ground',
    });
    expect(lineage(w).mass).toBeCloseTo(before.mass, 12);
    expect(
      step(at(w, { x: 21.25, y: 15.4 }, 'ivo'), {
        ivo: { interface: 'gather', args: { target: o.id, quantity: 1 } },
      }).outcomes.ivo?.success,
    ).toBe(false);
    // Sowing carries no qualified flag and earns nothing.
    expect(data(w, 'seed-propagation-sown')?.qualified).toBeUndefined();
    expect(events(w, 'practice-confirmed')).toHaveLength(0);
    expect(lot(w)).toBe('');
  });

  it('roots only when the existing establishment rule completes, with no fruit, then fruits only under the existing growth rule', () => {
    const s = sown();
    // An ordinary dispersed seedling of the same parent at the same point, from the next round.
    const twin = v7Clone(s.w);
    const parent = object(twin, PARENT);
    const natural: V7Object = {
      ...v7Clone(parent),
      id: 'test-natural-seedling',
      spatial: { ...parent.spatial, ...SITE, solid: false },
      data: {
        resource: 'berry',
        stock: 0,
        capacity: 4,
        interval: 5,
        stage: 'seedling',
        establishment: 0,
        seedUnits: 1,
        parent: PARENT,
        nextDispersal: twin.tick + 600,
      },
    };
    twin.objects.push(natural);
    const start = Number(object(twin, s.patch).data.establishment);
    let w = fed(twin);
    for (let i = 0; i < 30; i++) {
      w = fed(step(w).world);
      expect(Number(object(w, s.patch).data.establishment) - start).toBeCloseTo(
        Number(object(w, natural.id).data.establishment),
        10,
      );
    }
    // Run the sown world on until the seedling roots.
    const knowledge = v7Signature(actor(s.w).memory.knowledge ?? {});
    const e = until(fed(s.w), 'seed-propagation-established');
    const was = object(e.before, s.patch),
      o = object(e.at, s.patch);
    expect(was.data.stage).toBe('seedling');
    expect(Number(was.data.establishment)).toBeLessThan(12);
    expect(was.kind).toBe('seed-sowing-patch');
    expect(o.data.stage).toBe('mature');
    expect(Number(o.data.establishment)).toBeGreaterThanOrEqual(12);
    expect(o).toMatchObject({ kind: 'plant', name: 'Red berries' });
    expect(o.data.stock).toBe(0);
    const t = patchOf(o);
    expect(t).toMatchObject({ lifecycle: 'emerged', emergedAt: e.at.tick });
    expect(t.seed?.absorbedAt).toBe(e.at.tick);
    expect(viewOf(o)).toMatchObject({
      lifecycle: 'established',
      plantStage: 'emerged seedling',
      sprouted: true,
      harvestableStock: 0,
    });
    const ev = data(e.at, 'seed-propagation-established', null);
    expect(ev).toMatchObject({ patch: s.patch, planter: 'lin', stock: 0 });
    expect(events(e.at, 'plant-established', null)).toHaveLength(1);
    // Persisted eligible growth time and moisture exposure; nights stall it.
    expect(t.growth.rounds).toBe(e.at.tick - (t.sownAt ?? 0) + 1);
    expect(t.growth.eligibleRounds + t.growth.stalledRounds).toBe(
      t.growth.rounds,
    );
    expect(t.growth.darkRounds).toBeGreaterThan(0);
    expect(t.growth.moistureRounds).toBe(t.growth.rounds);
    // The transition updates no personal record: Lin learns of it only by looking.
    expect(v7Signature(actor(e.before).memory.knowledge ?? {})).toBe(knowledge);
    const seen = cost(at(e.at, AT_SITE), act('inspect', { target: s.patch }));
    expect(data(seen.world, 'seed-propagation-inspected')?.patch).toMatchObject(
      {
        plantStage: 'emerged seedling',
        seedlingVisible: true,
        visibleStock: 0,
        rooted: true,
      },
    );
    // Fruit comes only from the existing growth rule; anyone may gather it.
    const ff = until(e.at, 'seed-propagation-first-fruit');
    const fruit = object(ff.at, s.patch);
    expect(fruit.data).toMatchObject({ stock: 1, produced: 1 });
    expect(patchOf(fruit)).toMatchObject({
      lifecycle: 'fruiting',
      fruitedAt: ff.at.tick,
    });
    expect(viewOf(fruit)).toMatchObject({
      plantStage: 'established plant',
      harvestableStock: 1,
    });
    const g = step(at(ff.at, { x: 21.25, y: 15.4 }, 'ivo'), {
      ivo: { interface: 'gather', args: { target: s.patch, quantity: 1 } },
    });
    expect(g.outcomes.ivo?.success).toBe(true);
    expect(own(g.world, 'berry', 'ivo').some((x) => x.origin === s.patch)).toBe(
      true,
    );
  });

  it('pauses at no cost, resumes only the remaining round after rechecks, and cancels once keeping loosened soil that a later sowing reuses', () => {
    const f = extracted();
    const w1 = cost(f.w, sow(f.lot)).world;
    // A requested pause costs nothing and keeps the paid round and the reserved seeds.
    const paused = cost(w1, act('pause'));
    expect(paused.energy).toBe(0);
    expect(work(paused.world)).toMatchObject({
      status: 'paused',
      completedWork: 1,
    });
    expect(stack(paused.world, f.lot).reservedFor).toBe(work(w1).id);
    expect(unchanged(paused.world, act('pause'))).toMatch(/already paused/);
    // Resuming out of reach is refused at no cost; within reach it pays only the last round.
    expect(unchanged(at(paused.world, AT_PARENT), act('resume'))).toMatch(
      /within reach/,
    );
    const resumed = cost(
      fed(paused.world),
      act('resume', { workId: work(w1).id }),
    );
    expect(resumed.energy).toBe(1);
    expect(reasons(resumed.world.events)).toEqual(
      expect.arrayContaining([
        'seed-propagation-resumed',
        'seed-propagation-sown',
      ]),
    );
    expect(work(resumed.world)).toMatchObject({
      status: 'completed',
      paidEnergy: 2,
    });
    // An unworked round pauses the work. The reserved seeds can no longer be named (refused at
    // no cost); sowing at the same site, like resume, continues the open work.
    const idle = fed(step(w1).world);
    expect(work(idle)).toMatchObject({ status: 'paused', phase: 'paused' });
    expect(data(idle, 'seed-propagation-paused')).toBeDefined();
    expect(unchanged(idle, sow(f.lot))).toMatch(/reserved/);
    const continued = cost(idle, act('sow', { ...SITE }));
    expect(continued.energy).toBe(1);
    expect(work(continued.world).status).toBe('completed');
    // A continuing round whose recheck fails pauses at no charge instead of paying.
    const away = cost(at(w1, AT_PARENT), sow(f.lot));
    expect(away.energy).toBe(0);
    expect(work(away.world)).toMatchObject({ status: 'paused' });
    expect(work(away.world).failures.at(-1)?.reason).toMatch(/within reach/);
    // Cancel returns the unsown seeds once and leaves the loosened soil, unsown.
    const cancelled = cost(w1, act('cancel'));
    expect(cancelled.energy).toBe(0);
    const c = cancelled.world;
    expect(work(c)).toMatchObject({ status: 'stopped', stage: 'cancelled' });
    expect(stack(c, f.lot).owner).toBe('lin');
    expect(stack(c, f.lot).reservedFor).toBeUndefined();
    expect(data(c, 'seed-propagation-cancelled')?.released).toEqual([f.lot]);
    const loose = object(c, work(w1).patch ?? '');
    expect(patchOf(loose)).toMatchObject({
      lifecycle: 'prepared',
      workId: null,
    });
    expect(viewOf(loose)).toMatchObject({
      lifecycle: 'prepared',
      labor: { completed: 1, required: 2 },
      sprouted: false,
      unitPresent: false,
    });
    expect(unchanged(c, act('cancel'))).toMatch(/no open sowing work/);
    expect(unchanged(c, act('resume', { workId: work(w1).id }))).toMatch(
      /already settled/,
    );
    // A later sowing at the loosened patch needs only the second round.
    const reuse = cost(fed(c), sow(f.lot));
    expect(reuse.energy).toBe(1);
    expect(work(reuse.world)).toMatchObject({
      status: 'completed',
      adopted: true,
      patch: loose.id,
      phases: ['prepare', 'cover'],
    });
    expect(patchOf(object(reuse.world, loose.id)).lifecycle).toBe('sown');
    expect(patches(reuse.world)).toHaveLength(1);
  });

  it('death ends sowing, leaves the unsown seeds where the person died, and keeps loosened soil and sown patches growing', () => {
    const f = extracted();
    const w = cost(f.w, sow(f.lot)).world;
    const dying = v7Clone(w);
    actor(dying).vitals.health = 0.0001;
    actor(dying).vitals.satiety = 0;
    const where = { ...actor(dying).position };
    const died = step(dying).world;
    expect(events(died, 'died')).toHaveLength(1);
    expect(work(died)).toMatchObject({ status: 'stopped', stage: 'failed' });
    expect(data(died, 'seed-propagation-failed')).toMatchObject({
      cause: 'death',
    });
    expect(stack(died, f.lot)).toMatchObject({ owner: null, position: where });
    expect(stack(died, f.lot).reservedFor).toBeUndefined();
    expect(patchOf(object(died, work(w).patch ?? ''))).toMatchObject({
      lifecycle: 'prepared',
      workId: null,
    });
    // Already sown seeds are not erased by the sower's death; the ecology keeps working them.
    const s = sown();
    const gone = v7Clone(s.w);
    actor(gone).vitals.health = 0.0001;
    actor(gone).vitals.satiety = 0;
    let later = step(gone).world;
    expect(events(later, 'died')).toHaveLength(1);
    const est = Number(object(later, s.patch).data.establishment);
    for (let i = 0; i < 20; i++) later = step(later).world;
    expect(patchOf(object(later, s.patch))).toMatchObject({
      lifecycle: 'sown',
      sownBy: 'lin',
    });
    expect(Number(object(later, s.patch).data.establishment)).toBeGreaterThan(
      est,
    );
  });

  it('is owner-only: no one else can control the work or use the seeds, a given seed lot serves its new owner, and anyone can look at a patch', () => {
    const f = extracted();
    const w = learn(
      at(cost(f.w, sow(f.lot)).world, { x: 21.25, y: 15.6 }, 'ivo'),
      'ivo',
    );
    const j = work(w);
    for (const mode of ['resume', 'pause', 'cancel'])
      expect(unchanged(w, act(mode, { workId: j.id }), 'ivo')).toMatch(
        /No sowing work of yours/,
      );
    expect(unchanged(w, act('cancel'), 'ivo')).toMatch(/no open sowing work/);
    expect(unchanged(w, sow(f.lot), 'ivo')).toMatch(
      /absent-or-inaccessible|own separated seed lots/,
    );
    expect(unchanged(w, act('extract', { target: berry(w) }), 'ivo')).not.toBe(
      '',
    );
    // Lin's reserved seeds cannot be given away until the work ends.
    expect(
      unchanged(w, {
        interface: 'give',
        args: { target: f.lot, quantity: 1, recipient: 'ivo' },
      }),
    ).not.toBe('');
    // Anyone within reach can look at the patch; it is ground, not property.
    const look = cost(w, act('inspect', { target: j.patch }), 'ivo');
    expect(look.energy).toBe(0.2);
    expect(
      data(look.world, 'seed-propagation-inspected', 'ivo')?.patch,
    ).toMatchObject({ plantStage: 'patch being prepared', rooted: false });
    // A seed lot given away is sown by its new owner with its lineage.
    const g0 = learn(at(f.w, { x: 20.6, y: 15.4 }, 'ivo'), 'ivo');
    const given = step(g0, {
      lin: {
        interface: 'give',
        args: { target: f.lot, quantity: 1, recipient: 'ivo' },
      },
    });
    expect(given.outcomes.lin?.success).toBe(true);
    const handed = fed(given.world);
    const theirs = own(handed, SEEDS, 'ivo')[0];
    if (!theirs) throw new Error('Ivo holds no seeds.');
    expect(lotRecord(theirs)).toMatchObject({
      parent: PARENT,
      part: 'seed lot',
    });
    expect(unchanged(handed, sow(theirs.id))).toMatch(
      /absent-or-inaccessible|own separated seed lots/,
    );
    const r1 = cost(handed, sow(theirs.id), 'ivo');
    const r2 = cost(r1.world, sow(theirs.id), 'ivo');
    expect(r1.energy + r2.energy).toBe(2);
    const o = patches(r2.world)[0];
    if (!o) throw new Error('Missing patch.');
    expect(patchOf(o)).toMatchObject({
      lifecycle: 'sown',
      sownBy: 'ivo',
      parent: PARENT,
    });
    expect(patchOf(o).seed).toMatchObject({
      extractedBy: 'lin',
      sownBy: 'ivo',
    });
  });
});
