import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  V7_PACKAGES,
  continuousRegistry,
  forestClimate,
  shelterTemperature,
  v7Clone,
  v7Install,
  v7ShapeDistance,
  v7Signature,
  v7Step,
} from '@self-evolving-world/world-core';
import type {
  V7Action,
  V7Actor,
  V7Data,
  V7Event,
  V7Package,
  V7Point,
  V7World,
} from '@self-evolving-world/world-core';
import { initialLongWorld } from '../src/long-scenario.js';
import { longOrdinaryInput } from '../src/long-context.js';
import { IMPORT_EXCLUDED_WORDS } from '../src/long-import.js';

// Whole-world steps run slower on CI than locally; keep every test well inside this limit.
vi.setConfig({ testTimeout: 180_000 });

const id = 'heat-exposure-trial';
const REVISION = `${id}@1`;
const OPEN = `${id}:work:open`;
const CURRENT = `${id}:current`;
const RECORDS = `${id}:records`;
const LOOKED = `${id}:inspection`;
const COMPARED = `${id}:comparison`;
const PREFIX = 'heat-exposure-';
const WHO = 'moss';
const WAIT: V7Action = { interface: 'wait', args: {} };
const LEARN: V7Action = { interface: 'learn', args: { ability: id } };
/** The brief's agent-visible exclusions beyond the import list itself. */
const EXTRA_EXCLUDED =
  /cultur|belie(f|v)|religio|ritual|social|stor(y|ies)|myth|legend|tradition|history/i;
/** sha256 of JSON.stringify of the key-sorted map from id@version to the sha256 of
 * JSON.stringify of each of the 134 packages registered before this change (the scratch hash
 * file validation-results/scratch/ex25/hashes-before-5.json, taken before this change). */
const EXISTING_DIGEST =
  'fe249296bf755bdbc7899815de4236b6680bc4e34c569d85281cdf7b49e60391';
/** The same digest of the packages whose modules this package reads: the forest foundation
 * (forestClimate, forestPhysiology, shelterTemperature) and the open foundation. */
const REUSED = {
  'foundation-forest@1':
    '54094fb4230e6a50ffaeec27771a3d4345987b2e6f03161a5cf61f9f5c36de7b',
  'foundation-open@1':
    'c2cc0c70d608bd5f5e60b81671ee99a73c8bfa1304ad88faed1342d59cb5f6fe',
};
/** Moss's start on open ordinary soil; the nearest visible forest floor and wet bank spots; a
 * forest floor point beside the tree canopy-69; the interior centre of cave-2 and a point just
 * outside its doorway. */
const START = { x: 15.1, y: 16.91 };
const FOREST = { x: 14.5, y: 16.5 };
const BANK = { x: 18.5, y: 17.5 };
const TREE = 'canopy-69';
const BY_TREE = { x: 14.4, y: 17.9 };
const CAVE = 'cave-2';
const IN_CAVE = { x: 6, y: 29 };
const AT_DOOR = { x: 6, y: 31.6 };

type Scenario = 'long-culture-v2' | 'long-culture-v2-incentives';
type Data = Record<string, unknown>;
const sha = (x: unknown) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
const exposure = (): V7Package => {
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
const actor = (w: V7World, who = WHO): V7Actor => {
  const a = w.actors.find((a) => a.id === who);
  if (!a) throw new Error(`Missing ${who}.`);
  return a;
};
const ok = (r: ReturnType<typeof step>) => {
  expect(r.outcomes[WHO]?.success, r.outcomes[WHO]?.reason).toBe(true);
  return r.world;
};
const op = (args: V7Data): V7Action => ({ interface: id, args });
const sample = (args: V7Data = {}) => op({ mode: 'sample', ...args });
const energy = (w: V7World) => actor(w).vitals.energy;
const body = (w: V7World) => actor(w).vitals.temperature;
const ours = (w: V7World, type: string) =>
  w.events.filter((e) => e.type === `${PREFIX}${type}`);
const dataOf = (w: V7World, type: string): Data => {
  const e = ours(w, type).at(-1);
  if (!e) throw new Error(`Missing ${type} event.`);
  return e.data;
};
const open = (w: V7World) => actor(w).extensionState[OPEN] as Data | undefined;
const trial = (w: V7World) =>
  actor(w).extensionState[CURRENT] as Data | undefined;
const records = (w: V7World) =>
  (actor(w).extensionState[RECORDS] as Data[] | undefined) ?? [];
const last = (w: V7World) => records(w).at(-1) as Data;
const samples = (j: Data) => j.samples as Data[];
const at = (w: V7World, p: V7Point) => {
  const copy = v7Clone(w);
  actor(copy).position = { ...p };
  return copy;
};
const installed = (scenario: Scenario = 'long-culture-v2') => {
  const g = initialLongWorld('long-ex25', scenario);
  return v7Clone(v7Install(g, continuousRegistry(g), REVISION));
};
/** Moss studies in rounds 1-2. */
function prepared(scenario: Scenario = 'long-culture-v2') {
  const w = ok(step(installed(scenario), { [WHO]: LEARN }));
  return step(w).world;
}
let cached: V7World | null = null;
const studied = () => {
  cached ??= prepared();
  return v7Clone(cached);
};
/** The world's own body-heat law for one round at p, restated from the exported pieces:
 * forestClimate's air there and shelterTemperature with the insulation the person meets. */
function law(w: V7World, before: number, p: V7Point, insulation = 0) {
  return shelterTemperature(
    before,
    forestClimate(w, p).temperature,
    insulation,
    false,
  ).temperature;
}
/** Energy the action used beyond the same round spent waiting. */
function cost(w: V7World, action: V7Action) {
  const r = ok(step(w, { [WHO]: action })),
    idle = step(w).world;
  return {
    world: r,
    energy: Math.round((energy(idle) - energy(r)) * 1e8) / 1e8,
  };
}
/** The operation refuses before any cost: vitals and records equal a waiting round. */
function unchanged(
  w: V7World,
  action: V7Action,
  pattern: RegExp,
  spent = /Nothing was spent/,
) {
  const r = step(w, { [WHO]: action }),
    idle = step(w).world;
  expect(r.outcomes[WHO]?.success).toBe(false);
  expect(r.outcomes[WHO]?.reason).toMatch(pattern);
  expect(r.outcomes[WHO]?.reason).toMatch(spent);
  expect(actor(r.world).vitals).toEqual(actor(idle).vitals);
  for (const key of [OPEN, CURRENT, RECORDS, LOOKED, COMPARED])
    expect(actor(r.world).extensionState[key]).toEqual(
      actor(idle).extensionState[key],
    );
  expect(v7Signature(r.world.objects)).toBe(v7Signature(idle.objects));
  return r.outcomes[WHO]?.reason ?? '';
}
/** A forest floor cell centre with no object within 3 units: forest ground away from trees. */
function clearForest(w: V7World): V7Point {
  for (let y = 0; y < w.config.height; y++)
    for (let x = 0; x < w.config.width; x++) {
      const p = { x: x + 0.5, y: y + 0.5 };
      if (
        w.terrain[y]?.[x] === 'f' &&
        p.x > 3 &&
        p.y > 3 &&
        w.objects.every((o) => v7ShapeDistance(p, o.spatial) >= 3)
      )
        return p;
    }
  throw new Error('No clear forest floor.');
}

describe('heat exposure trial in ex25', () => {
  it('is registered last for long-ex25 only, within the size limit, with new names, published limits, no excluded word, and every earlier package byte-identical', () => {
    const pkg = exposure();
    const ability = pkg.abilities[0];
    if (!ability) throw new Error('Missing ability.');
    expect(V7_PACKAGES.at(-1)).toBe(pkg);
    expect(
      V7_PACKAGES.filter((p) => p.scope === 'long-ex25').map((p) => p.id),
    ).toEqual([
      'vocal-music',
      'position-loose-material',
      'friction-heating-trial',
      'mechanical-food-separation',
      id,
    ]);
    expect(pkg).toMatchObject({
      id,
      version: 1,
      scope: 'long-ex25',
      dependencies: ['foundation-open@1'],
      visualComponents: [],
      satisfaction: [],
      resources: [],
      processes: {},
      events: [
        'heat-exposure-inspected',
        'heat-exposure-sampled',
        'heat-exposure-sample-completed',
        'heat-exposure-trial-completed',
        'heat-exposure-paused',
        'heat-exposure-resumed',
        'heat-exposure-cancelled',
        'heat-exposure-stopped',
        'heat-exposure-ended',
        'heat-exposure-checked',
        'heat-exposure-compared',
      ],
    });
    expect(pkg.abilities).toHaveLength(1);
    expect(Object.keys(pkg.handlers)).toEqual([`long.${id}`]);
    expect(ability).toMatchObject({
      id,
      learning: 2,
      learningEnergy: 0.2,
      revision: REVISION,
      handler: `long.${id}`,
      authored: false,
      prerequisites: [],
      references: { targetId: 'optional-exact-visible' },
      practiceEvidence: 'heat-exposure-trial-completed',
      execution: { duration: null, interruption: 'cancel' },
    });
    expect(Object.keys(ability.parameters.properties ?? {})).toEqual([
      'mode',
      'targetId',
      'x',
      'y',
      'baselineId',
      'sampleRounds',
    ]);
    expect(ability.parameters.required).toEqual(['mode']);
    expect(ability.parameters.properties?.mode?.enum).toEqual([
      'inspect',
      'sample',
      'compare',
      'inspect-progress',
      'resume',
      'cancel',
    ]);
    expect(ability.parameters.properties?.sampleRounds).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 3,
    });
    for (const value of [
      'Study: 2 rounds, 0.2 energy each',
      'inspect: 1 round, 0.2',
      'sampleRounds 1-3 (default 1), 0.2 per sampled round',
      'health 20+ and body 7-34 (activity guards, not safety)',
      'compare: 1 round, 0.2, uses no sample',
      'inspect-progress: 1 round, 0.2',
      'cancel: 1 round, no energy',
      'Refusals cost nothing',
      'travel is navigate',
    ])
      expect(ability.costs).toContain(value);
    for (const value of [
      'trees, plants and rocks change no air, light or wind, so no shade is reported',
      'air pulled toward 12, insulation slowing change',
      'the same-round open-soil value (model-derived)',
      'cooling only if body temperature fell',
      'No reward, buff, shelter or cooling',
    ])
      expect(ability.effects).toContain(value);
    // New package, ability, equivalence, handler and event names.
    for (const p of V7_PACKAGES.filter((p) => p !== pkg)) {
      expect(p.id).not.toBe(id);
      for (const a of p.abilities) {
        expect(a.id).not.toBe(id);
        expect(a.equivalence).not.toBe(ability.equivalence);
      }
      expect(Object.keys(p.handlers)).not.toContain(ability.handler);
      for (const e of p.events ?? []) expect(e).not.toMatch(/^heat-exposure/);
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
    });
    expect(visible).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(visible).not.toMatch(EXTRA_EXCLUDED);
    // Every package registered before this one, by id@version, is byte-identical, including
    // the foundations whose climate and body-heat code it reads.
    const existing = V7_PACKAGES.slice(0, V7_PACKAGES.indexOf(pkg));
    const map = Object.fromEntries(
      existing
        .map((p) => [`${p.id}@${String(p.version)}`, sha(p)] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    expect(Object.keys(map)).toHaveLength(134);
    expect(sha(map)).toBe(EXISTING_DIGEST);
    for (const [key, digest] of Object.entries(REUSED))
      expect(map[key]).toBe(digest);
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

  it('is learned in two study rounds at 0.2 energy each and cannot be used before', () => {
    const start = installed();
    const early = step(start, { [WHO]: op({ mode: 'inspect' }) });
    expect(early.outcomes[WHO]?.success).toBe(false);
    expect(early.outcomes[WHO]?.reason).toMatch(/not mastered/);
    const w = ok(step(start, { [WHO]: LEARN })),
      idle = step(start).world;
    expect(actor(w).mastered).not.toContain(id);
    const done = step(w).world,
      idleDone = step(idle).world;
    expect(actor(done).mastered).toContain(id);
    expect(actor(done).learning).toBeNull();
    expect(energy(idleDone) - energy(done)).toBeCloseTo(0.4, 9);
  });

  it('charges the published costs: 0.2 to inspect, sample a round, compare or check progress, nothing to cancel', () => {
    const w = studied();
    const inspected = cost(w, op({ mode: 'inspect' }));
    expect(inspected.energy).toBeCloseTo(0.2, 9);
    const first = cost(w, sample({ sampleRounds: 2 }));
    expect(first.energy).toBeCloseTo(0.2, 9);
    const second = cost(first.world, sample({ sampleRounds: 2 }));
    expect(second.energy).toBeCloseTo(0.2, 9);
    // The last reading is taken at the start of the next round, free, whatever the action.
    const finished = cost(second.world, op({ mode: 'inspect-progress' }));
    expect(finished.energy).toBeCloseTo(0.2, 9);
    expect(last(finished.world)).toMatchObject({
      status: 'completed',
      paidEnergy: 0.4,
      paidRounds: 2,
    });
    expect(cost(finished.world, op({ mode: 'compare' })).energy).toBeCloseTo(
      0.2,
      9,
    );
    const started = ok(step(w, { [WHO]: sample({ sampleRounds: 3 }) }));
    expect(cost(started, op({ mode: 'cancel' })).energy).toBe(0);
    // A paused trial resumes for the price of a sampled round.
    const paused = step(started).world;
    expect(open(paused)).toMatchObject({ status: 'paused' });
    expect(cost(paused, op({ mode: 'resume' })).energy).toBeCloseTo(0.2, 9);
  });

  it("reports the existing model's values: measured readings here, model-derived values at visible candidates, no hidden objects", () => {
    const w = studied();
    const before = body(w);
    const r = ok(step(w, { [WHO]: op({ mode: 'inspect' }) }));
    const look = dataOf(r, 'inspected').inspection as Data;
    expect(actor(r).extensionState[LOOKED]).toEqual(look);
    const site = look.site as { measured: Data; modelDerived: Data };
    // The handler runs on the round being executed: the same climate the update reads.
    const climate = forestClimate(r, START);
    expect(site.measured).toMatchObject({
      body: before,
      air: climate.temperature,
      indoor: false,
      light: climate.light,
      rain: climate.rain,
      wind: climate.wind,
      daylight: climate.daylight,
      ground: 'open ordinary soil',
    });
    // The prediction is the world's own update: the inspecting person's actual body
    // temperature after that very round, and the restated law.
    expect(site.modelDerived).toMatchObject({
      insulation: 0,
      enclosure: null,
      bodyAfter: body(r),
      otherRules: 0,
    });
    expect(body(r)).toBe(law(r, before, START));
    expect(site.modelDerived.change).toBeCloseTo(body(r) - before, 7);
    // Candidates: the nearest visible forest floor and wet bank spots, model-derived.
    const candidates = look.candidates as Data[];
    expect(candidates.map((c) => (c.modelDerived as Data).ground)).toEqual([
      'forest floor',
      'wet bank',
    ]);
    for (const c of candidates) {
      const p = { x: Number(c.x), y: Number(c.y) };
      const m = c.modelDerived as Data;
      expect(m.air).toBe(forestClimate(r, p).temperature);
      expect(m.bodyAfter).toBe(law(r, before, p));
      expect(m.indoor).toBe(false);
      expect(c.standing).toBe(true);
    }
    expect(candidates[0]).toMatchObject(FOREST);
    expect(candidates[1]).toMatchObject(BANK);
    // forestClimate's ground terms: forest floor 1 and wet bank 3 below open ordinary soil.
    expect((candidates[0]?.modelDerived as Data).airDifference).toBe(-1);
    expect((candidates[1]?.modelDerived as Data).airDifference).toBe(-3);
    expect(look.represented).toContain(
      'outdoors only: rain and wind lower the air value',
    );
    expect(site).toMatchObject({
      unknown: expect.arrayContaining([
        'sun or shade on the body: not represented',
      ]) as unknown,
    });
    // Neither cave is in view: no enclosure candidate, and no unseen id anywhere in the report.
    expect(JSON.stringify(look)).not.toMatch(/cave-/);
    // A named visible point reports the same values; a far or hidden point is refused.
    const point = ok(step(w, { [WHO]: op({ mode: 'inspect', ...BANK }) }));
    expect(
      ((dataOf(point, 'inspected').inspection as Data).candidates as Data[])[0],
    ).toMatchObject({ ...BANK, modelDerived: candidates[1]?.modelDerived });
    // No object, item or person is changed by inspecting.
    const idle = step(w).world;
    expect(v7Signature(r.objects)).toBe(v7Signature(idle.objects));
    expect(v7Signature(r.stacks)).toBe(v7Signature(idle.stacks));
    expect(actor(r).position).toEqual(actor(idle).position);
  });

  it('measures a trial with the physiology law: before at each round start, after at the next, equal to the prediction and against the open-soil value', () => {
    let w = studied();
    const starts: number[] = [];
    for (let i = 0; i < 3; i++) {
      starts.push(body(w));
      w = ok(step(w, { [WHO]: sample({ sampleRounds: 3 }) }));
      const j = trial(w) ?? last(w);
      const s = samples(j)[i] as Data;
      expect(s).toMatchObject({ n: i + 1, round: w.tick, body: starts[i] });
      // Each sample's prediction is the update that round actually applied.
      expect(s.predicted).toBe(body(w));
      expect(s.predicted).toBe(law(w, starts[i] ?? 0, START));
      expect((s.reading as Data).air).toBe(forestClimate(w, START).temperature);
    }
    expect(open(w)).toMatchObject({ status: 'active', taken: 3, measured: 2 });
    w = step(w).world;
    expect(open(w)).toBeUndefined();
    const j = last(w);
    expect(j).toMatchObject({
      status: 'completed',
      requested: 3,
      paidEnergy: 0.6,
      paidRounds: 3,
      site: START,
    });
    for (const [i, s] of samples(j).entries()) {
      expect(s.after).toBe(s.predicted);
      expect(s.change).toBeCloseTo(Number(s.after) - Number(starts[i]), 7);
      // On open ordinary soil the reference is this very position's own cell.
      expect(s.open).toMatchObject({ x: 15.5, y: 16.5, bodyAfter: s.after });
    }
    expect(ours(w, 'sample-completed')).toHaveLength(1);
    // View metadata: actor, work, location, tick, provenance and evidence; no overlay or badge.
    expect(dataOf(w, 'sample-completed').view).toMatchObject({
      component: null,
      operation: id,
      work: j.id,
      actor: WHO,
      mode: 'sample',
      tick: w.tick,
      location: START,
      site: START,
      status: 'measured',
      samples: { requested: 3, taken: 3, measured: 3 },
      provenance: 'measured',
      evidence: 'measured',
      overlay: null,
      attention: true,
      badge: null,
    });
    expect(dataOf(w, 'trial-completed').view).toMatchObject({
      status: 'completed',
      overlay: null,
      attention: false,
    });
    expect(j.comparison).toMatchObject({
      evidence: 'measured',
      predictionMatched: true,
      supported: false,
      openGround: {
        represented: 'no represented difference from open ordinary soil',
        exposure: 'no lower heat exposure than open ordinary soil established',
      },
    });
    expect(String((j.comparison as Data).conclusion)).toMatch(
      /^No lower heat exposure than open ordinary soil has been established/,
    );
  });

  it('invents no shade: a tree is reported as no represented protection, and standing beside it measures the same as bare forest floor', () => {
    const w = studied();
    const r = ok(step(w, { [WHO]: op({ mode: 'inspect', targetId: TREE }) }));
    const c = (
      (dataOf(r, 'inspected').inspection as Data).candidates as Data[]
    )[0];
    expect(c).toMatchObject({
      target: TREE,
      kind: 'tree',
      protection:
        'none represented: without an enclosure this object enters no climate or body-heat rule, so it gives no shade',
      geometry: { enclosure: null, entrances: [] },
    });
    const clear = clearForest(w);
    expect((c?.modelDerived as Data).air).toBe(
      forestClimate(r, clear).temperature,
    );
    // Two equal people: one right beside the tree, one on forest floor 3+ units from any object.
    const near = ok(step(at(w, BY_TREE), { [WHO]: sample() }));
    const far = ok(step(at(w, clear), { [WHO]: sample() }));
    const a = step(near).world,
      b = step(far).world;
    const sa = samples(last(a))[0] as Data,
      sb = samples(last(b))[0] as Data;
    expect(sa.after).toBe(sb.after);
    expect((sa.reading as Data).air).toBe((sb.reading as Data).air);
    expect((sa.reading as Data).light).toBe((sb.reading as Data).light);
    expect(sa.after).toBe(law(near, Number(sa.body), BY_TREE));
    for (const e of [...ours(r, 'inspected'), ...a.events, ...b.events])
      expect(JSON.stringify(e.data)).not.toMatch(/"overlay":\{/);
    // Forest floor is a represented ground difference, not shade: 1 cooler air than open soil.
    expect((sa.reading as Data).ground).toBe('forest floor');
    expect(last(a).comparison).toMatchObject({
      openGround: {
        airDifference: -1,
        represented: expect.stringMatching(/represented heat input/) as unknown,
      },
    });
  });

  it('shows the real effect of a represented enclosure: the cave interior buffers the air and its insulation slows the change', () => {
    const w = studied();
    // From outside the doorway the cave is a visible enclosure with an interior.
    const outside = ok(
      step(at(w, AT_DOOR), { [WHO]: op({ mode: 'inspect', targetId: CAVE }) }),
    );
    const c = (
      (dataOf(outside, 'inspected').inspection as Data).candidates as Data[]
    )[0];
    expect(c).toMatchObject({
      target: CAVE,
      kind: 'cave',
      x: IN_CAVE.x,
      y: IN_CAVE.y,
      protection:
        'represented: an enclosure interior; the climate rule treats it as indoors',
      geometry: {
        enclosure: { wall: 0.45, doorway: 1.6 },
        entrances: [{ x: 6, y: 31 }],
      },
      modelDerived: {
        indoor: true,
        insulation: 2,
        air: forestClimate(outside, IN_CAVE).temperature,
        bodyAfter: law(outside, body(w), IN_CAVE, 2),
      },
    });
    // The survey from outside lists the visible interior too.
    const survey = ok(step(at(w, AT_DOOR), { [WHO]: op({ mode: 'inspect' }) }));
    expect(
      ((dataOf(survey, 'inspected').inspection as Data).candidates as Data[])
        .map((k) => k.target)
        .filter(Boolean),
    ).toEqual([CAVE]);
    // A trial inside measures the buffered air with insulation 2, as the update applies it.
    const inside = at(w, IN_CAVE);
    const start = body(inside);
    const sampled = ok(step(inside, { [WHO]: sample() }));
    const done = step(sampled).world;
    const s = samples(last(done))[0] as Data;
    const air = forestClimate(sampled, IN_CAVE).temperature;
    expect(s.reading).toMatchObject({
      indoor: true,
      insulation: 2,
      enclosure: CAVE,
      air,
    });
    expect(air).not.toBe(forestClimate(sampled, START).temperature);
    expect(s.after).toBe(law(sampled, start, IN_CAVE, 2));
    expect(s.after).toBe(s.predicted);
    // Against open ordinary soil in the same round, with the same starting body temperature.
    const open = s.open as Data;
    expect(open.bodyAfter).toBe(
      law(sampled, start, { x: Number(open.x), y: Number(open.y) }),
    );
    expect(open.bodyAfter).not.toBe(s.after);
    const verdict = last(done).comparison as Data;
    const lower = Number(s.after) < Number(open.bodyAfter);
    expect(verdict.supported).toBe(lower);
    expect((verdict.openGround as Data).modelDifference).toBeCloseTo(
      Number(s.predicted) - Number(open.bodyAfter),
      7,
    );
    const completed = dataOf(done, 'trial-completed');
    expect((completed.view as Data).overlay).toEqual(
      lower
        ? {
            kind: 'enclosure interior',
            target: CAVE,
            label: 'measured against a model-derived reference',
          }
        : null,
    );
    expect(v7Signature(done.objects)).toBe(
      v7Signature(step(step(inside).world).world.objects),
    );
  });

  it('compares records with deterministic labels and consumes no sample', () => {
    let w = studied();
    w = ok(step(w, { [WHO]: sample() }));
    w = step(at(w, BANK)).world;
    const baseline = String(last(w).id);
    w = ok(step(w, { [WHO]: sample() }));
    const subject = String(trial(w)?.id);
    w = ok(step(w, { [WHO]: op({ mode: 'compare' }) }));
    const result = dataOf(w, 'compared').comparison as Data;
    expect(actor(w).extensionState[COMPARED]).toEqual(result);
    expect(records(w).map((r) => r.id)).toEqual([baseline, subject]);
    expect(result).toMatchObject({
      subject,
      baseline,
      evidence: 'measured',
      samples: 1,
      versusBaseline: {
        evidence: 'measured',
        represented: 'lower represented heat input than the baseline position',
        trend: expect.stringMatching(
          /^observed trend only, not controlled/,
        ) as unknown,
        context: expect.arrayContaining([
          'wet bank against open ordinary soil',
        ]) as unknown,
      },
    });
    const air = (r: Data) => Number((samples(r)[0]?.reading as Data).air);
    const [first, second] = records(w);
    if (!first || !second) throw new Error('Missing records.');
    expect(air(second) - air(first)).not.toBe(0);
    // Each record against its own same-round open-soil reference decides the exposure label.
    const contrast = (r: Data) => {
      const s = samples(r)[0] as Data;
      return Number(s.after) - Number((s.open as Data).bodyAfter);
    };
    expect((result.versusBaseline as Data).exposure).toBe(
      contrast(second) < contrast(first) - 0.001
        ? 'lower heat exposure than the baseline position, each against its own same-round open-soil reference'
        : 'no lower heat exposure than the baseline position established',
    );
    expect(String(result.body)).toMatch(
      Number(samples(second)[0]?.change) < 0
        ? /^net body cooling \(measured\)/
        : /^net body warming \(measured\)/,
    );
    // No sample was used: the records are unchanged by comparing.
    expect(dataOf(w, 'compared').view).toMatchObject({
      targets: [subject, baseline],
      evidence: 'measured',
    });
    // A named baseline, itself refused, and an unknown one refused, for nothing.
    unchanged(
      w,
      op({ mode: 'compare', baselineId: subject }),
      /its own baseline/,
    );
    unchanged(
      w,
      op({ mode: 'compare', baselineId: 'heat-nobody-1' }),
      /not one of your trial records/,
    );
    const named = ok(
      step(w, { [WHO]: op({ mode: 'compare', baselineId: baseline }) }),
    );
    expect(dataOf(named, 'compared').comparison).toMatchObject({
      subject,
      baseline,
    });
    // A record without a measured sample gives insufficient evidence.
    const pending = ok(step(w, { [WHO]: sample() }));
    exposure().onDeath?.(pending, actor(pending));
    expect(last(pending)).toMatchObject({ status: 'ended' });
    expect(samples(last(pending))[0]).toMatchObject({
      after: null,
      change: null,
    });
    const empty = ok(step(pending, { [WHO]: op({ mode: 'compare' }) }));
    expect(dataOf(empty, 'compared').comparison).toMatchObject({
      evidence: 'insufficient',
      supported: false,
      body: null,
    });
    expect((dataOf(empty, 'compared').view as Data).evidence).toBe(
      'insufficient',
    );
  });

  it('refuses every unsupported request before any cost', () => {
    const w = studied();
    // The declared schema refuses an unknown mode before the handler.
    unchanged(w, op({ mode: 'measure' }), /outside the declared choices/, /./);
    unchanged(
      w,
      op({ mode: 'sample', x: 14, y: 16 }),
      /Sampling is only where you stand/,
    );
    unchanged(w, op({ mode: 'sample', targetId: TREE }), /leave out targetId/);
    unchanged(
      w,
      op({ mode: 'inspect', sampleRounds: 2 }),
      /leave out sampleRounds/,
    );
    unchanged(
      w,
      op({ mode: 'cancel', baselineId: 'x' }),
      /leave out baselineId/,
    );
    unchanged(w, op({ mode: 'inspect', x: 14 }), /both x and y/);
    unchanged(
      w,
      op({ mode: 'inspect', targetId: TREE, x: 14, y: 16 }),
      /not both/,
    );
    unchanged(
      w,
      op({ mode: 'inspect', x: 25, y: 16 }),
      /not a visible point within 5/,
    );
    unchanged(w, op({ mode: 'inspect', x: 6, y: 29 }), /not a visible point/);
    // The resolver refuses an object out of view before the handler.
    const hidden = step(w, { [WHO]: op({ mode: 'inspect', targetId: CAVE }) });
    expect(hidden.outcomes[WHO]?.success).toBe(false);
    expect(hidden.outcomes[WHO]?.reason).toMatch(/Reference/);
    unchanged(w, op({ mode: 'compare' }), /no heat exposure trial record/);
    unchanged(
      w,
      op({ mode: 'inspect-progress' }),
      /no heat exposure trial to report/,
    );
    unchanged(
      w,
      op({ mode: 'resume' }),
      /no open heat exposure trial to resume/,
    );
    unchanged(
      w,
      op({ mode: 'cancel' }),
      /no open heat exposure trial to cancel/,
    );
    unchanged(
      w,
      sample({ baselineId: 'heat-moss-1' }),
      /not one of your trial records/,
    );
    const tired = v7Clone(w);
    actor(tired).vitals.energy = 0.1;
    unchanged(tired, op({ mode: 'inspect' }), /inspect needs 0.2/);
    unchanged(tired, sample(), /not enough energy/);
    const hot = v7Clone(w);
    actor(hot).vitals.temperature = 34.5;
    unchanged(hot, sample(), /body temperature 34.5 is outside 7-34/);
    const cold = v7Clone(w);
    actor(cold).vitals.temperature = 6.5;
    unchanged(cold, sample(), /outside 7-34/);
    const hurt = v7Clone(w);
    actor(hurt).vitals.health = 15;
    unchanged(hurt, sample(), /health 15 is below 20/);
    // A paused trial resumes only at its own position.
    const paused = step(
      ok(step(w, { [WHO]: sample({ sampleRounds: 3 }) })),
    ).world;
    expect(open(paused)).toMatchObject({ status: 'paused' });
    unchanged(at(paused, BANK), op({ mode: 'resume' }), /resume only there/);
    const low = v7Clone(paused);
    actor(low).vitals.energy = 0.1;
    unchanged(
      low,
      op({ mode: 'resume' }),
      /cannot resume sampling now: not enough energy/,
    );
    unchanged(
      low,
      op({ mode: 'inspect-progress' }),
      /inspect-progress needs 0.2/,
    );
    unchanged(low, op({ mode: 'compare' }), /compare needs 0.2/);
  });

  it('pauses without charge, resumes in a new segment at the same position, reports progress, stops at a guard, cancels, is replaced, and ends at death', () => {
    const w = studied();
    // Another action pauses the trial; the due reading is still taken.
    let s = ok(step(w, { [WHO]: sample({ sampleRounds: 3 }) }));
    s = step(s).world;
    expect(ours(s, 'sample-completed')).toHaveLength(1);
    expect(dataOf(s, 'paused')).toMatchObject({
      status: 'paused',
      taken: 1,
      measured: 1,
      reason:
        'this round went to another action, a refused action or no action',
      view: { status: 'paused', attention: false, overlay: null },
    });
    const checked = cost(s, op({ mode: 'inspect-progress' }));
    expect(checked.energy).toBeCloseTo(0.2, 9);
    expect(dataOf(checked.world, 'checked')).toMatchObject({
      status: 'paused',
      current: { distanceFromSite: 0, stopsSampling: [], pausesSampling: [] },
    });
    s = ok(step(s, { [WHO]: op({ mode: 'resume' }) }));
    expect(ours(s, 'resumed')).toHaveLength(1);
    s = ok(step(s, { [WHO]: op({ mode: 'resume' }) }));
    s = step(s).world;
    const done = last(s);
    expect(done).toMatchObject({
      status: 'completed',
      segments: [
        { n: 1, startedAt: 3 },
        { n: 2, startedAt: 5 },
      ],
    });
    expect(samples(done).map((x) => [x.segment, x.round])).toEqual([
      [1, 3],
      [2, 5],
      [2, 6],
    ]);
    for (const x of samples(done)) expect(x.after).toBe(x.predicted);
    // Moving away pauses; the trial resumes only after returning to its position.
    let m = ok(step(w, { [WHO]: sample({ sampleRounds: 2 }) }));
    m = step(m, {
      [WHO]: { interface: 'navigate', args: { target: '', x: 15.9, y: 16.91 } },
    }).world;
    expect(dataOf(m, 'paused').reason).toBe(
      'you moved away from the trial position',
    );
    m = ok(step(at(m, START), { [WHO]: op({ mode: 'resume' }) }));
    m = step(m).world;
    expect(last(m)).toMatchObject({ status: 'completed' });
    // A guard reached between rounds stops further samples; measured ones stay.
    let g = ok(step(w, { [WHO]: sample({ sampleRounds: 3 }) }));
    actor(g).vitals.health = 15;
    g = ok(step(g, { [WHO]: sample({ sampleRounds: 3 }) }));
    expect(dataOf(g, 'stopped')).toMatchObject({
      status: 'stopped',
      measured: 1,
      reason: 'activity guard: health 15 is below 20',
    });
    expect(open(g)).toBeUndefined();
    // cancel takes a round and no energy; the measured sample stays.
    const c = ok(step(w, { [WHO]: sample({ sampleRounds: 3 }) }));
    const cancelled = cost(c, op({ mode: 'cancel' }));
    expect(cancelled.energy).toBe(0);
    expect(last(cancelled.world)).toMatchObject({
      status: 'cancelled',
      paidEnergy: 0.2,
    });
    expect(samples(last(cancelled.world))[0]?.after).toBe(body(c));
    // A new trial while one is paused stops the paused one and starts afresh.
    const p = step(ok(step(w, { [WHO]: sample({ sampleRounds: 3 }) }))).world;
    const fresh = ok(step(at(p, BANK), { [WHO]: sample() }));
    expect(dataOf(fresh, 'stopped').reason).toBe('a new trial replaced it');
    expect(trial(fresh)).toMatchObject({ site: BANK, requested: 1 });
    // Death ends it at once and nothing continues after respawn.
    let d = ok(step(w, { [WHO]: sample({ sampleRounds: 3 }) }));
    actor(d).vitals.health = 0.01;
    actor(d).vitals.satiety = 0;
    d = step(d).world;
    expect(actor(d).life?.deaths).toBe(1);
    expect(
      d.events
        .filter((e) => e.actor === WHO)
        .map((e) => e.type)
        .filter((t) => /^heat-exposure|^died$|^respawned$/.test(t)),
    ).toEqual([
      'heat-exposure-sample-completed',
      'heat-exposure-paused',
      'heat-exposure-ended',
      'died',
      'respawned',
    ]);
    expect(last(d)).toMatchObject({ status: 'ended' });
    expect(open(d)).toBeUndefined();
    expect(trial(d)).toBeUndefined();
  });

  it('never rewards a trial: no satisfaction, mood, practice milestone, verified-information award, progress credit or made object, with incentives off or on', () => {
    for (const scenario of [
      'long-culture-v2',
      'long-culture-v2-incentives',
    ] as const) {
      let w = scenario === 'long-culture-v2' ? studied() : prepared(scenario),
        idle = w;
      const seen: V7Event[] = [];
      const script: V7Action[] = [
        op({ mode: 'inspect' }),
        sample({ sampleRounds: 2 }),
        sample({ sampleRounds: 2 }),
        WAIT,
        op({ mode: 'compare' }),
        sample(),
        op({ mode: 'inspect-progress' }),
        sample({ sampleRounds: 3 }),
        op({ mode: 'cancel' }),
      ];
      for (const action of script) {
        w = step(w, { [WHO]: action }).world;
        idle = step(idle).world;
        seen.push(...w.events);
      }
      expect(records(w).map((r) => r.status)).toEqual([
        'completed',
        'completed',
        'cancelled',
      ]);
      expect(
        seen.filter((e) =>
          [
            'satisfaction',
            'satisfaction-maintained',
            'practice-confirmed',
            'information-confirmed',
            'trial-result',
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
        expect((e.data.view as Data | undefined)?.badge ?? null).toBeNull();
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
        // Body temperature follows only the world's own update: equal to waiting in place.
        expect(a.vitals.temperature).toBe(b.vitals.temperature);
        expect(a.vitals.health).toBe(b.vitals.health);
      }
      expect(actor(w).wellbeing.physical).toBeLessThanOrEqual(10);
      expect(v7Signature(w.objects)).toBe(v7Signature(idle.objects));
      expect(
        w.satisfaction.find((r) => r.id === `practice:${id}`),
      ).toMatchObject({ event: 'practice-confirmed', interface: id });
    }
  });

  it('keeps every agent-visible text it adds clear of the excluded vocabulary', () => {
    let w = studied();
    const seen: V7Event[] = [];
    const script: V7Action[] = [
      op({ mode: 'inspect' }),
      op({ mode: 'inspect', targetId: TREE }),
      sample({ sampleRounds: 3 }),
      WAIT,
      op({ mode: 'inspect-progress' }),
      op({ mode: 'resume' }),
      op({ mode: 'cancel' }),
      sample(),
      op({ mode: 'compare' }),
    ];
    script.forEach((action, i) => {
      w = step(w, { [WHO]: action }).world;
      seen.push(
        ...w.events.filter(
          (e) => e.type.startsWith(PREFIX) || e.interface === id,
        ),
      );
      if (i === 3) {
        const text = JSON.stringify(longOrdinaryInput(w, WHO));
        expect(text).toContain(OPEN);
        expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
        expect(text).not.toMatch(EXTRA_EXCLUDED);
      }
    });
    expect(new Set(seen.map((e) => e.type))).toEqual(
      new Set([
        'heat-exposure-inspected',
        'heat-exposure-sampled',
        'heat-exposure-sample-completed',
        'heat-exposure-trial-completed',
        'heat-exposure-paused',
        'heat-exposure-resumed',
        'heat-exposure-cancelled',
        'heat-exposure-checked',
        'heat-exposure-compared',
      ]),
    );
    const text = JSON.stringify(seen);
    expect(text).not.toMatch(IMPORT_EXCLUDED_WORDS);
    expect(text).not.toMatch(EXTRA_EXCLUDED);
    for (const who of [WHO, 'lin']) {
      const input = JSON.stringify(longOrdinaryInput(w, who));
      expect(input).not.toMatch(IMPORT_EXCLUDED_WORDS);
      expect(input).not.toMatch(EXTRA_EXCLUDED);
    }
    for (const key of [RECORDS, LOOKED, COMPARED]) {
      const value = JSON.stringify(actor(w).extensionState[key]);
      expect(value).not.toMatch(IMPORT_EXCLUDED_WORDS);
      expect(value).not.toMatch(EXTRA_EXCLUDED);
    }
  });
});
