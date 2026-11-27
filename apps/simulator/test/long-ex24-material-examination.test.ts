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
  V7Actor,
  V7Data,
  V7Event,
  V7Stack,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { CULTURE_EXCLUDED_WORDS } from '../src/long-culture.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this file's limit.
vi.setConfig({ testTimeout: 120_000 });

const id = 'examine-material';
const STATE = `long:${id}`;
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
];
/** sha256 of JSON.stringify of the map from id@version to the sha256 of JSON.stringify of each
 * of the 120 packages registered before this change, in registration order (the scratch hash
 * file validation-results/scratch/ex24/hashes-before-3.json, taken before this change). */
const EXISTING_DIGEST =
  'a804e0748bbddf5582e8a7e074b7f0af1bcab04732534a4e5a19009105b0268c';
/** sha256 of JSON.stringify of each package whose code this one reuses, taken before this change. */
const REUSED: Record<string, string> = {
  'foundation-forest@1':
    '54094fb4230e6a50ffaeec27771a3d4345987b2e6f03161a5cf61f9f5c36de7b',
  'foundation-open@1':
    'c2cc0c70d608bd5f5e60b81671ee99a73c8bfa1304ad88faed1342d59cb5f6fe',
  'small-combustion-source@1':
    '88baf2ffeb6b0d808e0689e4c200cdb0083ba6ebff605ef89b6c903e26f88eb8',
  'cutting-edge-assessment@1':
    '3ca9a1f0d691fad71d4f6aaae3877ae70473a3af96f6785ed52433727ba01a49',
  'prepare-ventilated-food-storage@1':
    '7bf073bb43944714fb3a7a759b25f259e1df3d5e84d02a8609ec87a72a488713',
  'construct-weather-shelter@1':
    '74ca19cc7fd391e6f36532bc4a57f2a171ee6c5872be2ec220bca1e34ec14712',
};
/** Kai's stand beside the fallen branches of canopy-41, and the vine and dry-grass stands. */
const STAND = { x: 11.4, y: 18.55 };
const VINE = { x: 8.2, y: 12.8 };
const GRASS = { x: 14.2, y: 15.8 };
/** Where the other five wait, clear of Kai. */
const PARK: Record<string, { x: number; y: number }> = {
  lin: { x: 17, y: 9 },
  moss: { x: 17.6, y: 9 },
  sol: { x: 18.2, y: 9 },
  wren: { x: 18.8, y: 9 },
  ivo: { x: 19.4, y: 9 },
};
/** A world time after dusk: light is 0 from time 36 to 79 of the day in this seed. */
const NIGHT = 40;
/** The represented geometry of one 1.1 kg branch unit (the ex21 rod: 900 kg/m3, 25 diameters). */
const r8 = (x: number) => Math.round(x * 1e8) / 1e8;
const ROD = Math.cbrt((4 * (1.1 / 900)) / (Math.PI * 25));

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
const actor = (w: V7World, name = 'kai'): V7Actor => {
  const a = w.actors.find((a) => a.id === name);
  if (!a) throw new Error('Missing fixture actor.');
  return a;
};
const last = (w: V7World, type: string) => {
  const e = w.events.filter((e) => e.type === type).at(-1);
  if (!e) throw new Error(`Missing ${type}.`);
  return e;
};
const data = (w: V7World, type: string) =>
  last(w, type).data as Record<string, unknown>;
const viewOf = (w: V7World, type: string) =>
  data(w, type).view as Record<string, unknown>;
const own = (w: V7World, res: string, who = 'kai') =>
  w.stacks.filter((s) => s.owner === who && s.resource === res);
const act = (mode: string, extra: Record<string, unknown> = {}): V7Action => ({
  interface: id,
  args: { mode, ...extra },
});
/** Keep everyone fed and rested so the tests isolate the operation from survival. */
function fed(w: V7World) {
  for (const a of w.actors.filter((a) => a.vitals.health > 0)) {
    a.vitals.satiety = 80;
    a.vitals.energy = 40;
  }
  return w;
}
const at = (w: V7World, p: { x: number; y: number }, who = 'kai') => {
  const copy = v7Clone(w);
  actor(copy, who).position = { ...p };
  return fed(copy);
};
const timed = (w: V7World, time: number) => {
  const copy = v7Clone(w);
  copy.time = time;
  return copy;
};
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
  for (const a of w.actors) a.position = { ...(PARK[a.id] ?? a.position) };
  return fed(w);
}
const learn = (w: V7World, who = 'kai') => {
  let s = step(w, {
    [who]: { interface: 'learn', args: { ability: id } },
  }).world;
  s = step(s).world;
  expect(actor(s, who).mastered).toContain(id);
  return fed(s);
};
const log = (w: V7World, who = 'kai') =>
  ((actor(w, who).extensionState[STATE] as V7Data | undefined)?.records ??
    []) as Record<string, unknown>[];
/** Energy the action used beyond the same round spent waiting, and that it moved no material. */
function cost(w: V7World, action: V7Action, who = 'kai') {
  const r = step(w, { [who]: action }),
    idle = step(w).world;
  expect(r.outcomes[who]?.success, r.outcomes[who]?.reason).toBe(true);
  // Nondestructive: no stack, object, source stock or shelter state changes.
  expect(v7Signature(r.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(r.world.objects)).toBe(v7Signature(idle.objects));
  expect(
    Object.keys(r.world.state).filter((k) => k.startsWith('collective:work:')),
  ).toEqual([]);
  const energy =
    Math.round(
      (actor(idle, who).vitals.energy - actor(r.world, who).vitals.energy) *
        1e8,
    ) / 1e8;
  return { world: fed(r.world), reason: r.outcomes[who]?.reason ?? '', energy };
}
/** The action fails and changes no vitals, stacks, objects, records or knowledge. */
function unchanged(w: V7World, action: V7Action, who = 'kai') {
  const result = step(w, { [who]: action }),
    idle = step(w).world,
    mine = (x: V7World) => ({
      log: actor(x, who).extensionState[STATE] ?? null,
      knowledge: actor(x, who).memory.knowledge ?? {},
    });
  expect(result.outcomes[who]?.success).toBe(false);
  expect(actor(result.world, who).vitals).toEqual(actor(idle, who).vitals);
  expect(v7Signature(result.world.stacks)).toBe(v7Signature(idle.stacks));
  expect(v7Signature(result.world.objects)).toBe(v7Signature(idle.objects));
  expect(v7Signature(mine(result.world))).toBe(v7Signature(mine(idle)));
  expect(
    result.world.events.filter((e) =>
      e.type.startsWith('material-examination-'),
    ),
  ).toEqual([]);
  return result.outcomes[who]?.reason ?? '';
}
function gather(
  w: V7World,
  target: string,
  p: { x: number; y: number },
  n: number,
) {
  const r = step(at(w, p), {
    kai: { interface: 'gather', args: { target, quantity: n } },
  });
  expect(r.outcomes.kai?.success, r.outcomes.kai?.reason).toBe(true);
  return fed(r.world);
}
const item = (w: V7World, res: string) => {
  const s = own(w, res)[0];
  if (!s) throw new Error(`Missing ${res}.`);
  return s;
};
/** A supplied item carrying a declared, verified calibration record. No mechanism installed in
 * ex24 writes such a record, so the measurement path is shown on fixtures, as earlier tests showed
 * construction on supplied lots. `revision` names the (hypothetical) mechanism that calibrated it. */
function tool(
  w: V7World,
  itemId: string,
  record: V7Data,
  who = 'kai',
): V7Stack {
  const s: V7Stack = {
    id: itemId,
    resource: 'birch',
    quantity: 1,
    quantityTenths: 10,
    position: { ...actor(w, who).position },
    owner: who,
    origin: 'calibration-fixture',
    processing: {
      measurementCalibration: {
        verified: true,
        standard: 'a certified reference bar',
        method: 'compared with the standard at ten points',
        evidence: 'event-calibration-fixture',
        calibratedAt: 0,
        revision: 'graduated-length-scale@1',
        condition: 1,
        ...record,
      },
    },
  };
  w.stacks.push(s);
  return s;
}
const SCALE: V7Data = {
  form: 'graduated-scale',
  quantity: 'length',
  unit: 'm',
  resolution: 0.001,
  uncertainty: 0.0005,
  range: 1,
};
const BALANCE: V7Data = {
  form: 'balance',
  quantity: 'mass',
  unit: 'kg',
  resolution: 0.01,
  uncertainty: 0.005,
  range: 5,
  tare: 0.2,
};
const visibleText = (log: V7Event[]) =>
  JSON.stringify(log.map((e) => [e.type, e.description, e.data]));

/** Kai studies, then gathers one branch unit from canopy-41 and holds a calibrated scale. */
let cache: { ready: V7World; branch: string } | null = null;
function fixture() {
  if (!cache) {
    const w = gather(learn(at(installed(), STAND)), 'canopy-41', STAND, 1);
    const ready = at(w, STAND);
    tool(ready, 'item-scale', SCALE);
    cache = { ready, branch: item(ready, 'branch').id };
  }
  return { ready: v7Clone(cache.ready), branch: cache.branch };
}

describe('examine material in ex24', () => {
  it('is scoped to ex24, registered last, learned in two rounds at 0.2 energy, within the size limit, and leaves every existing package byte-identical', () => {
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
    // The third ex24 package; later ex24 packages follow it.
    expect(V7_PACKAGES.filter((p) => p.scope === 'long-ex24')[2]).toBe(pkg);
    expect(
      continuousRegistry(g)
        .packages.filter((p) => !p.id.startsWith('foundation-'))
        .map((p) => p.id)
        .slice(0, 3),
    ).toEqual([
      'prepare-ventilated-food-storage',
      'construct-weather-shelter',
      id,
    ]);
    expect(pkg).toMatchObject({
      scope: 'long-ex24',
      version: 1,
      dependencies: ['foundation-open@1'],
      visualComponents: [],
      satisfaction: [],
      resources: [],
      processes: {},
    });
    expect(pkg.afterEnvironment).toBeUndefined();
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 2,
      learningEnergy: 0.2,
      revision: `${id}@1`,
      handler: `long.${id}`,
      authored: false,
      practiceEvidence: 'material-examination-measured',
      references: { target: 'optional-exact-visible' },
      execution: { duration: 1, interruption: 'cancel' },
    });
    expect(ability.parameters.properties?.mode).toMatchObject({
      enum: ['inspect', 'measure'],
    });
    expect(ability.parameters.required).toEqual(['mode', 'target']);
    // New package, ability, equivalence, handler and event names.
    expect(TAKEN).not.toContain(id);
    for (const e of pkg.events ?? [])
      expect(e).toMatch(/^material-examination-/);
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(ability.id);
        expect(a.equivalence).not.toBe(ability.equivalence);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? [])
        expect(e).not.toMatch(/^material-examination-/);
    }
    const limit = g.config.longDevelopment?.abilityTextLimit ?? 0;
    expect(limit).toBe(3500);
    expect(JSON.stringify(ability).length).toBeLessThanOrEqual(limit);
    const visible = JSON.stringify({
      abilities: pkg.abilities,
      events: pkg.events,
    });
    expect(visible).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    // Every package registered before this change, the reused ones included, is byte-identical.
    const existing = V7_PACKAGES.slice(0, V7_PACKAGES.indexOf(pkg));
    expect(existing).toHaveLength(120);
    const map = Object.fromEntries(
      existing.map((p) => [`${p.id}@${String(p.version)}`, sha(p)]),
    );
    expect(sha(map)).toBe(EXISTING_DIGEST);
    for (const [key, hash] of Object.entries(REUSED))
      expect(map[key]).toBe(hash);
    // Unstudied use is refused at no cost; two study rounds at 0.2 energy each master it.
    const fresh = at(installed(), STAND);
    expect(unchanged(fresh, act('inspect', { target: 'canopy-41' }))).toMatch(
      /master/i,
    );
    const first = cost(fresh, {
      interface: 'learn',
      args: { ability: id },
    });
    expect(first.energy).toBe(0.2);
    expect(actor(first.world).learning).toMatchObject({
      ability: id,
      remaining: 1,
    });
    expect(actor(first.world).mastered).not.toContain(id);
    let now = step(fresh, {
      kai: { interface: 'learn', args: { ability: id } },
    }).world;
    let idle = step(fresh).world;
    now = step(now).world;
    idle = step(idle).world;
    expect(actor(now).mastered).toContain(id);
    expect(actor(now).learning).toBeNull();
    expect(
      Math.round((actor(idle).vitals.energy - actor(now).vitals.energy) * 1e8) /
        1e8,
    ).toBe(0.4);
    // Study grants no record or practice milestone.
    expect(actor(now).memory.knowledge ?? {}).toEqual(
      actor(idle).memory.knowledge ?? {},
    );
    expect(now.events.map((e) => e.type)).not.toContain('practice-confirmed');
  });

  it("inspects one unit of Kai's fallen-branch source in place for one round and 0.2 energy: qualitative traits only, metric dimensions unavailable without a calibrated reference, nothing consumed", () => {
    const w = learn(at(installed(), STAND));
    const stock = w.objects.find((o) => o.id === 'canopy-41')?.data.stock;
    expect(stock).toBe(2);
    const r = cost(w, act('inspect', { target: 'canopy-41' }));
    expect(r.energy).toBe(0.2);
    expect(r.reason).toContain(
      'Metric dimensions unavailable: no calibrated reference',
    );
    const s = r.world;
    expect(s.objects.find((o) => o.id === 'canopy-41')?.data.stock).toBe(2);
    // Handling first, then the qualitative record.
    const types = s.events
      .filter((e) => e.actor === 'kai')
      .map((e) => e.type)
      .filter((t) => t !== 'wellbeing');
    expect(types).toEqual([
      'material-examination-handled',
      'trial-result',
      'material-examination-inspected',
    ]);
    expect(viewOf(s, 'material-examination-handled')).toMatchObject({
      operation: id,
      actor: 'kai',
      target: 'canopy-41',
      specimen: 1,
      status: 'handling',
      overlay: 'handling within reach',
      instrument: null,
      value: null,
    });
    const d = data(s, 'material-examination-inspected');
    expect(d).toMatchObject({
      target: 'canopy-41',
      specimen: 1,
      setting: 'in place in its source',
      resource: 'branch',
      consumed: 0,
      reserved: false,
      moved: false,
      energy: 0.2,
      qualitative: {
        material: 'Fallen branches',
        form: 'elongated wood piece, long and slender',
        handFeel: 'stiff: does not bend under hand pressure',
        surface: 'looks moist',
        wholeness: 'whole unit',
        worked: 'plain',
      },
      source: { stock: 2, soil: 'ordinary soil' },
    });
    const metric = d.metric as Record<string, string>;
    expect(Object.keys(metric)).toEqual([
      'length',
      'diameter',
      'mass',
      'volume',
      'moisture',
      'rigidity',
    ]);
    expect(metric.length).toContain(
      'metric dimensions unavailable: no calibrated reference',
    );
    expect(metric.length).toContain('unavailable in place');
    expect(metric.mass).toContain('no calibrated balance');
    expect(metric.moisture).toContain('no supported measurement procedure');
    expect(metric.rigidity).toContain('no supported measurement procedure');
    // No number is reported for any metric property.
    expect(JSON.stringify(d.qualitative)).not.toMatch(/0\.99|0\.039|1\.1\b/);
    const shelter = d.shelter as Record<string, unknown>;
    expect(shelter).toMatchObject({
      recipe: 'construct-weather-shelter@1',
      roles: ['rod'],
      verdict: 'undetermined',
      failed: [],
    });
    for (const c of shelter.checks as { verdict: string }[])
      expect(c.verdict).toBe('unmeasured');
    expect(viewOf(s, 'material-examination-inspected')).toMatchObject({
      status: 'qualitative',
      label: 'qualitative traits only',
      instrument: null,
      value: null,
      overlay: null,
      shelterVerdict: 'undetermined',
    });
    // A persisted, dated record and an unverified personal record; no reward evidence.
    const rec = log(s).at(-1);
    expect(rec).toMatchObject({
      mode: 'inspect',
      target: 'canopy-41',
      specimen: 1,
      status: 'qualitative',
      rounds: 1,
      energy: 0.2,
      evidence: last(s, 'trial-result').id,
    });
    expect(
      actor(s).memory.knowledge?.['canopy-41:unit-1:traits'],
    ).toMatchObject({ verified: false, subject: 'branch' });
    expect(
      s.events.filter(
        (e) =>
          ['information-confirmed', 'practice-confirmed'].includes(e.type) ||
          e.data.qualified === true,
      ),
    ).toEqual([]);
    // Only the ordinary physical effect of spent energy differs from waiting: no mental account.
    const idle = step(w).world;
    expect(actor(s).wellbeing.mental).toBe(actor(idle).wellbeing.mental);
    expect(actor(s).wellbeing.sources).toEqual(actor(idle).wellbeing.sources);
    expect(actor(s).experience?.mental).toEqual(actor(idle).experience?.mental);
    const text = visibleText(s.events);
    expect(text).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
  });

  it('inspects carried and loose units, strands and dry stems qualitatively; the dark hides only visual traits', () => {
    const { ready, branch } = fixture();
    // Carried branch unit, with a calibrated scale present: metric values are still not read.
    let r = cost(
      ready,
      act('inspect', { target: branch, tools: ['item-scale'] }),
    );
    expect(r.energy).toBe(0.2);
    let d = data(r.world, 'material-examination-inspected');
    expect(d).toMatchObject({
      setting: 'carried',
      qualitative: { damage: 'none seen', worked: 'plain', wear: 'none seen' },
    });
    expect((d.metric as Record<string, string>).length).toMatch(
      /^not measured: inspect is qualitative/,
    );
    // Without the scale named, a carried unit reports the missing reference only.
    r = cost(ready, act('inspect', { target: branch, properties: ['length'] }));
    d = data(r.world, 'material-examination-inspected');
    expect(d.metric).toEqual({
      length: 'metric dimensions unavailable: no calibrated reference',
    });
    // Dropped on the ground it is loose material within reach.
    const dropped = step(ready, {
      kai: { interface: 'drop', args: { target: branch, quantity: 1 } },
    }).world;
    const loose = dropped.stacks.find(
      (s) => s.owner === null && s.resource === 'branch',
    );
    if (!loose) throw new Error('Missing loose branch.');
    r = cost(fed(dropped), act('inspect', { target: loose.id }));
    expect(data(r.world, 'material-examination-inspected').setting).toBe(
      'on the ground',
    );
    // A vine strand and dry grass.
    const vine = gather(ready, 'forest-vine-1', VINE, 1);
    r = cost(vine, act('inspect', { target: item(vine, 'vine').id }));
    d = data(r.world, 'material-examination-inspected');
    expect(d.qualitative).toMatchObject({
      form: 'long pliable strand',
      handFeel: 'pliable: bends and wraps by hand',
      surface: 'looks moist',
    });
    expect(d.shelter).toMatchObject({
      roles: ['binding'],
      verdict: 'undetermined',
    });
    const grass = gather(ready, 'forest-dry-grass-0', GRASS, 1);
    r = cost(grass, act('inspect', { target: item(grass, 'dry-grass').id }));
    d = data(r.world, 'material-examination-inspected');
    expect(d.qualitative).toMatchObject({
      form: 'fine thin stems',
      surface: 'looks dry',
    });
    expect((d.metric as Record<string, string>).length).toContain(
      'this world represents no length for dry-grass',
    );
    expect(d.shelter).toMatchObject({
      roles: ['covering or bedding'],
      verdict: 'undetermined',
      unmeasurable: [
        'dry-grass has no represented stem law, so its installed volume cannot be derived',
      ],
    });
    // At night handled traits remain and visual ones are not seen; the round is still paid.
    const night = timed(ready, NIGHT);
    expect(forestClimate(night, actor(night).position).light).toBe(0);
    r = cost(night, act('inspect', { target: branch }));
    expect(r.energy).toBe(0.2);
    d = data(r.world, 'material-examination-inspected');
    expect(d.qualitative).toMatchObject({
      form: 'elongated wood piece, long and slender',
      handFeel: 'stiff: does not bend under hand pressure',
      surface: 'not seen: too dark',
      color: 'not seen: too dark',
      damage: 'not seen: too dark',
    });
    expect(d.limitations).toContain(
      'too dark to see surfaces: visual traits not seen',
    );
  });

  it('measures length and diameter only with a calibrated reference, derives a cylinder volume, and compares with the shelter recipe within the uncertainty', () => {
    const { ready, branch } = fixture();
    const length = cost(
      ready,
      act('measure', {
        target: branch,
        properties: ['length'],
        tools: ['item-scale'],
      }),
    );
    expect(length.energy).toBe(0.2);
    let s = length.world;
    const L = data(s, 'material-examination-measured');
    expect(r8(ROD * 25)).toBe(0.99078655);
    expect(L).toMatchObject({
      property: 'length',
      status: 'measured',
      value: 0.991,
      unit: 'm',
      uncertainty: 0.001,
      resolution: 0.001,
      placements: 1,
      tool: 'item-scale',
      calibration: {
        tool: 'item-scale',
        form: 'graduated-scale',
        standard: 'a certified reference bar',
        evidence: 'event-calibration-fixture',
        revision: 'graduated-length-scale@1',
      },
      consumed: 0,
      reserved: false,
      moved: false,
    });
    expect(viewOf(s, 'material-examination-measured')).toMatchObject({
      status: 'measured',
      instrument: 'graduated-scale',
      tool: 'item-scale',
      value: 0.991,
      units: 'm',
      uncertainty: 0.001,
      label: 'length 0.991 ± 0.001 m',
    });
    expect(viewOf(s, 'material-examination-handled')).toMatchObject({
      status: 'handling',
      instrument: 'graduated-scale',
    });
    const diameter = cost(
      s,
      act('measure', {
        target: branch,
        properties: ['diameter'],
        tools: ['item-scale'],
      }),
    );
    s = diameter.world;
    const D = data(s, 'material-examination-measured');
    expect(r8(ROD)).toBe(0.03963146);
    expect(D).toMatchObject({ value: 0.04, uncertainty: 0.001 });
    // Both rod checks now rest on measured inputs; rigidity keeps the verdict undetermined.
    const shelter = D.shelter as {
      verdict: string;
      checks: { check: string; verdict: string }[];
      unmeasurable: string[];
    };
    expect(shelter.verdict).toBe('undetermined');
    expect(shelter.checks.map((c) => c.verdict)).toEqual([
      'meets',
      'meets',
      'meets',
    ]);
    expect(shelter.unmeasurable).toEqual([
      'rod rigidity: no supported procedure; hand feel is qualitative',
    ]);
    // A cylinder volume from the two current readings, with propagated uncertainty.
    expect(
      unchanged(s, act('measure', { target: branch, properties: ['volume'] })),
    ).toContain('Volume needs the stated geometric method cylinder');
    const volume = cost(
      s,
      act('measure', {
        target: branch,
        properties: ['volume'],
        method: 'cylinder',
      }),
    );
    expect(volume.energy).toBe(0.2);
    const V = data(volume.world, 'material-examination-measured');
    const v = (Math.PI / 4) * 0.04 * 0.04 * 0.991;
    expect(V).toMatchObject({
      property: 'volume',
      unit: 'm3',
      value: r8(v),
      uncertainty: r8(v * ((2 * 0.001) / 0.04 + 0.001 / 0.991)),
      tool: null,
      basis: [String(L.id), String(D.id)],
    });
    // Records persist with their identity and effort.
    expect(log(volume.world).map((x) => x.property)).toEqual([
      'length',
      'diameter',
      'volume',
    ]);
    expect(
      actor(volume.world).memory.knowledge?.[`${branch}:unit-1:length`],
    ).toMatchObject({ verified: false });
    // A changed unit record makes the readings stale: the volume is then refused at no cost.
    const wet = v7Clone(s);
    const unit = wet.stacks.find((x) => x.id === branch);
    if (!unit) throw new Error('Missing branch.');
    unit.physical = { unitMass: 1.2, unitWater: 0.65, unitSolids: 0.55 };
    expect(
      unchanged(
        wet,
        act('measure', {
          target: branch,
          properties: ['volume'],
          method: 'cylinder',
        }),
      ),
    ).toContain(
      'Volume needs your current length and diameter readings of this unit',
    );
    const text = visibleText([
      ...length.world.events,
      ...diameter.world.events,
      ...volume.world.events,
    ]);
    expect(text).not.toMatch(CULTURE_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
  });

  it('reads strands in several placements, weighs on a calibrated balance, reports paid limits without a value, and gives indeterminate and failing recipe checks', () => {
    const { ready, branch } = fixture();
    // A 3 m vine strand laid out straight along a 1 m scale: three placements and the lay allowance.
    const vine = gather(ready, 'forest-vine-1', VINE, 1);
    let r = cost(
      vine,
      act('measure', {
        target: item(vine, 'vine').id,
        properties: ['length'],
        tools: ['item-scale'],
      }),
    );
    expect(data(r.world, 'material-examination-measured')).toMatchObject({
      value: 3,
      placements: 3,
      uncertainty: r8(3 * (0.0005 + 0.0005) + 0.01 * 3),
    });
    expect(
      (data(r.world, 'material-examination-measured').shelter as V7Data).checks,
    ).toEqual([
      expect.objectContaining({
        check: 'usable strand length toward the 30 m binding minimum',
        verdict: 'measured',
        metres: 3,
      }),
    ]);
    // A coarse reference length cannot resolve the strand diameter: a paid limit, no value.
    tool(vine, 'item-coarse-rod', {
      form: 'reference-length',
      quantity: 'length',
      unit: 'm',
      resolution: 0.05,
      uncertainty: 0.005,
      range: 0.5,
    });
    r = cost(
      vine,
      act('measure', {
        target: item(vine, 'vine').id,
        properties: ['diameter'],
        tools: ['item-coarse-rod'],
      }),
    );
    expect(r.energy).toBe(0.2);
    const limited = data(r.world, 'material-examination-limited');
    expect(limited).toMatchObject({
      status: 'limited',
      value: null,
      uncertainty: null,
      limitation:
        'below the 0.05 m resolution of item-coarse-rod; less than 0.025 m',
    });
    expect(viewOf(r.world, 'material-examination-limited')).toMatchObject({
      status: 'limited',
      value: null,
      label: 'diameter unavailable',
    });
    expect(r.world.events.map((e) => e.type)).not.toContain(
      'material-examination-measured',
    );
    // Mass on a calibrated balance with a verified tare.
    const w = v7Clone(ready);
    tool(w, 'item-balance', BALANCE);
    r = cost(
      w,
      act('measure', {
        target: branch,
        properties: ['mass'],
        tools: ['item-balance'],
      }),
    );
    expect(data(r.world, 'material-examination-measured')).toMatchObject({
      property: 'mass',
      value: 1.1,
      unit: 'kg',
      uncertainty: 0.01,
      method: 'weighed alone on item-balance after its verified tare',
    });
    // Over the balance range: a paid limit.
    tool(w, 'item-small-balance', { ...BALANCE, range: 1 });
    r = cost(
      w,
      act('measure', {
        target: branch,
        properties: ['mass'],
        tools: ['item-small-balance'],
      }),
    );
    expect(data(r.world, 'material-examination-limited').limitation).toBe(
      'beyond the 1 kg range of item-small-balance; more than 1 kg',
    );
    // A coarse scale leaves the diameter check indeterminate.
    tool(w, 'item-coarse-scale', {
      ...SCALE,
      resolution: 0.01,
      uncertainty: 0.005,
    });
    r = cost(
      w,
      act('measure', {
        target: branch,
        properties: ['diameter'],
        tools: ['item-coarse-scale'],
      }),
    );
    const coarse = data(r.world, 'material-examination-measured');
    expect(coarse).toMatchObject({ value: 0.04, uncertainty: 0.01 });
    expect(
      (coarse.shelter as { checks: { verdict: string }[] }).checks[0],
    ).toMatchObject({ verdict: 'indeterminate' });
    expect((coarse.shelter as V7Data).verdict).toBe('undetermined');
    // A small branch piece fails the rod checks on its measured values.
    const small: V7Stack = {
      id: 'item-small-branch',
      resource: 'branch',
      quantity: 1,
      quantityTenths: 10,
      position: { ...actor(w).position },
      owner: 'kai',
      origin: 'canopy-41',
      physical: { unitMass: 0.3, unitWater: 0.15, unitSolids: 0.15 },
    };
    w.stacks.push(small);
    r = cost(
      w,
      act('measure', {
        target: small.id,
        properties: ['diameter'],
        tools: ['item-scale'],
      }),
    );
    const thin = data(r.world, 'material-examination-measured');
    expect(thin.value).toBe(0.026);
    expect(thin.shelter).toMatchObject({
      verdict: 'fails',
      failed: ['rod diameter at least 0.04 m at 0.01 m precision'],
    });
    expect(r.reason).toContain('Shelter recipe suitability: fails');
  });

  it('refuses every invalid request before any cost', () => {
    const { ready, branch } = fixture();
    const measure = (extra: Record<string, unknown>) =>
      act('measure', { target: branch, properties: ['length'], ...extra });
    // Targets: missing, unknown, a resource name, out of reach, beyond the visible units.
    expect(unchanged(ready, act('inspect', { target: '' }))).toContain(
      'Name the exact target id',
    );
    expect(unchanged(ready, act('inspect', { target: 'item-none' }))).toMatch(
      /^Reference absent-or-inaccessible-identity/,
    );
    expect(unchanged(ready, act('inspect', { target: 'branch' }))).toMatch(
      /^Reference absent-or-inaccessible-identity/,
    );
    expect(
      unchanged(
        at(ready, { x: 11.4, y: 15 }),
        act('inspect', { target: 'canopy-41' }),
      ),
    ).toContain('beyond reach');
    expect(
      unchanged(ready, act('inspect', { target: 'canopy-41', specimen: 2 })),
    ).toContain('shows 1 unit(s); specimen is at most 1');
    expect(
      unchanged(ready, act('inspect', { target: branch, specimen: 2 })),
    ).toContain('holds 1 whole unit(s); specimen is at most 1');
    // Properties: none, two, and the unsupported ones.
    expect(unchanged(ready, act('measure', { target: branch }))).toContain(
      'exactly one property',
    );
    expect(
      unchanged(ready, measure({ properties: ['length', 'diameter'] })),
    ).toContain('exactly one property');
    expect(unchanged(ready, measure({ properties: ['moisture'] }))).toContain(
      'Moisture unavailable: no supported measurement procedure',
    );
    expect(unchanged(ready, measure({ properties: ['rigidity'] }))).toContain(
      'Rigidity unavailable: no supported measurement procedure',
    );
    // References: none, unknown, uncalibrated, the specimen itself, unverified, unserviceable.
    const none = unchanged(ready, measure({}));
    expect(none).toMatch(
      /^Metric dimensions unavailable: no calibrated reference\. Unmet requirement: a real graduated tool or a previously calibrated physical reference/,
    );
    expect(none).toContain(
      'body size, coordinates and stock are never references',
    );
    expect(unchanged(ready, measure({ tools: ['item-none'] }))).toContain(
      'tools: item-none is not resolved',
    );
    const w = v7Clone(ready);
    const plain: V7Stack = {
      id: 'item-plain-stick',
      resource: 'branch',
      quantity: 1,
      quantityTenths: 10,
      position: { ...actor(w).position },
      owner: 'kai',
      origin: 'canopy-41',
    };
    w.stacks.push(plain);
    tool(w, 'item-unverified', { ...SCALE, verified: false });
    tool(w, 'item-worn-scale', { ...SCALE, condition: 0.5 });
    tool(w, 'item-untared', { ...BALANCE, tare: null });
    expect(unchanged(w, measure({ tools: [plain.id] }))).toContain(
      'item-plain-stick carries no calibration record; an uncalibrated object is not a reference',
    );
    expect(unchanged(w, measure({ tools: [branch] }))).toContain(
      'is the specimen itself and cannot be its own reference',
    );
    expect(unchanged(w, measure({ tools: ['item-unverified'] }))).toContain(
      'item-unverified: its calibration record is not complete and verified (verified)',
    );
    expect(unchanged(w, measure({ tools: ['item-worn-scale'] }))).toContain(
      'item-worn-scale is not serviceable (condition 0.5)',
    );
    expect(
      unchanged(w, measure({ properties: ['mass'], tools: ['item-untared'] })),
    ).toContain('(tare)');
    expect(
      unchanged(w, measure({ properties: ['mass'], tools: ['item-scale'] })),
    ).toContain('Mass unavailable: no calibrated balance with a verified tare');
    // Specimens without a metric reading: in place, unrepresented, partial or worked.
    expect(
      unchanged(
        ready,
        act('measure', {
          target: 'canopy-41',
          properties: ['diameter'],
          tools: ['item-scale'],
        }),
      ),
    ).toContain('Unavailable in place');
    const grass = at(gather(ready, 'forest-dry-grass-0', GRASS, 1), GRASS);
    expect(
      unchanged(
        grass,
        act('measure', {
          target: item(grass, 'dry-grass').id,
          properties: ['length'],
          tools: ['item-scale'],
        }),
      ),
    ).toContain('This world represents no length for dry-grass');
    const part: V7Stack = {
      ...plain,
      id: 'item-half-branch',
      quantity: 0.5,
      quantityTenths: 5,
    };
    const worked: V7Stack = {
      ...plain,
      id: 'item-worked-branch',
      processing: { shapedEnd: { rounds: 2 } },
    };
    w.stacks.push(part, worked);
    expect(
      unchanged(w, measure({ target: part.id, tools: ['item-scale'] })),
    ).toContain('less than one whole unit');
    expect(
      unchanged(w, measure({ target: worked.id, tools: ['item-scale'] })),
    ).toContain('a worked or treated item');
    // Volume without readings; a reading in the dark; too little energy.
    expect(
      unchanged(
        w,
        act('measure', {
          target: branch,
          properties: ['volume'],
          method: 'cylinder',
        }),
      ),
    ).toContain(
      'Volume needs your current length and diameter readings of this unit',
    );
    expect(
      unchanged(timed(w, NIGHT), measure({ tools: ['item-scale'] })),
    ).toContain('A reading needs light.');
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.1;
    expect(unchanged(tired, measure({ tools: ['item-scale'] }))).toContain(
      'needs 0.2 energy',
    );
    expect(unchanged(tired, act('inspect', { target: branch }))).toContain(
      'needs 0.2 energy',
    );
  });
});
